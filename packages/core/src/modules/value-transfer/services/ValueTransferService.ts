import type { DIDCommV2Message } from '../../../agent/didcomm'
import type { InboundMessageContext } from '../../../agent/models/InboundMessageContext'
import type { Logger } from '../../../logger'
import type { WitnessTableMessage } from '../../gossip'
import type { Transports } from '../../routing/types'
import type { ValueTransferStateChangedEvent, WitnessTableReceivedEvent } from '../ValueTransferEvents'
import type { ProblemReportMessage } from '../messages'
import type { ValueTransferRecord, ValueTransferTags } from '../repository'

import {
  Getter,
  Giver,
  PartyState,
  ProblemReport,
  TransactionRole,
  TransactionState,
  TransactionStatus,
  Wallet,
  Witness,
} from '@sicpa-dlab/value-transfer-protocol-ts'
import { firstValueFrom, ReplaySubject } from 'rxjs'
import { first, map } from 'rxjs/operators'

import { AgentConfig } from '../../../agent/AgentConfig'
import { EventEmitter } from '../../../agent/EventEmitter'
import { MessageSender } from '../../../agent/MessageSender'
import { SendingMessageType } from '../../../agent/didcomm/types'
import { InjectionSymbols } from '../../../constants'
import { AriesFrameworkError } from '../../../error'
import { DependencyManager, injectable } from '../../../plugins'
import { JsonEncoder, timeoutWhen } from '../../../utils'
import { DidMarker, DidResolverService } from '../../dids'
import { DidService } from '../../dids/services/DidService'
import { WitnessTableQueryMessage } from '../../gossip/messages/WitnessTableQueryMessage'
import { ValueTransferEventTypes } from '../ValueTransferEvents'
import { ValueTransferRepository } from '../repository'
import { ValueTransferStateRecord } from '../repository/ValueTransferStateRecord'
import { ValueTransferStateRepository } from '../repository/ValueTransferStateRepository'

import { ValueTransferCryptoService } from './ValueTransferCryptoService'
import { ValueTransferLockService } from './ValueTransferLockService'
import { ValueTransferPartyStateService } from './ValueTransferPartyStateService'
import { ValueTransferTransportService } from './ValueTransferTransportService'
import { ValueTransferWitnessStateService } from './ValueTransferWitnessStateService'

@injectable()
export class ValueTransferService {
  protected readonly logger: Logger
  protected config: AgentConfig
  protected valueTransferRepository: ValueTransferRepository
  protected valueTransferStateRepository: ValueTransferStateRepository
  protected valueTransferCryptoService: ValueTransferCryptoService
  protected valueTransferStateService: ValueTransferPartyStateService
  protected valueTransferWitnessStateService: ValueTransferWitnessStateService
  protected valueTransferLockService: ValueTransferLockService
  protected didService: DidService
  protected didResolverService: DidResolverService
  protected eventEmitter: EventEmitter
  protected messageSender: MessageSender
  protected getter: Getter
  protected giver: Giver
  protected witness: Witness

  public constructor(
    config: AgentConfig,
    dependencyManager: DependencyManager,
    valueTransferRepository: ValueTransferRepository,
    valueTransferStateRepository: ValueTransferStateRepository,
    valueTransferCryptoService: ValueTransferCryptoService,
    valueTransferStateService: ValueTransferPartyStateService,
    valueTransferWitnessStateService: ValueTransferWitnessStateService,
    valueTransferTransportService: ValueTransferTransportService,
    valueTransferLockService: ValueTransferLockService,
    didService: DidService,
    didResolverService: DidResolverService,
    eventEmitter: EventEmitter,
    messageSender: MessageSender
  ) {
    this.logger = config.logger.createContextLogger('VTP-Service')
    this.config = config
    this.valueTransferRepository = valueTransferRepository
    this.valueTransferStateRepository = valueTransferStateRepository
    this.valueTransferCryptoService = valueTransferCryptoService
    this.valueTransferStateService = valueTransferStateService
    this.valueTransferWitnessStateService = valueTransferWitnessStateService
    this.valueTransferLockService = valueTransferLockService
    this.didService = didService
    this.didResolverService = didResolverService
    this.eventEmitter = eventEmitter
    this.messageSender = messageSender
    this.getter = new Getter(
      {
        crypto: valueTransferCryptoService,
        storage: valueTransferStateService,
        transport: valueTransferTransportService,
        logger: this.logger.createContextLogger('Getter'),
      },
      {
        witness: config.valueTransferWitnessDid,
        label: config.label,
      }
    )
    this.giver = new Giver(
      {
        crypto: valueTransferCryptoService,
        storage: valueTransferStateService,
        transport: valueTransferTransportService,
        logger: this.logger.createContextLogger('Giver'),
      },
      {
        witness: config.valueTransferWitnessDid,
        label: config.label,
      }
    )
    this.witness = new Witness(
      {
        crypto: valueTransferCryptoService,
        storage: valueTransferWitnessStateService,
        transport: valueTransferTransportService,
        logger: this.logger.createContextLogger('Witness'),
        gossipProvider: () => dependencyManager.resolve(InjectionSymbols.GossipService),
      },
      {
        label: config.label,
        issuers: config.witnessIssuerDids,
      }
    )
  }

  /**
   * Init party (Getter or Giver) state in the Wallet
   */
  public async initPartyState(): Promise<void> {
    const partyState = await this.findPartyState()
    if (partyState) return

    const state = new ValueTransferStateRecord({
      partyState: new PartyState({
        wallet: new Wallet({
          previousHash: undefined,
          ownershipKey: await this.valueTransferCryptoService.createKey(),
        }),
      }),
    })
    await this.valueTransferStateRepository.save(state)
  }

  /**
   * Process a received {@link ProblemReportMessage} and cancel Value Transfer.
   * Update Value Transfer record with the information from the message.
   *
   * @param messageContext The record context containing the message.
   * @returns Value Transfer record and Message to Forward
   */
  public async processProblemReport(messageContext: InboundMessageContext<ProblemReportMessage>): Promise<{
    record?: ValueTransferRecord
    message?: ProblemReportMessage
  }> {
    const { message: problemReportMessage } = messageContext
    const record = await this.findByThread(problemReportMessage.pthid)
    if (!record) {
      this.logger.error(`Value Transaction not for the received thread ${problemReportMessage.pthid}`)
      return {}
    }

    if (record.transaction.role === TransactionRole.Witness) {
      await this.witness.processProblemReport(new ProblemReport(problemReportMessage))
    }
    if (record.transaction.role === TransactionRole.Getter) {
      await this.getter.processProblemReport(new ProblemReport(problemReportMessage))
    }
    if (record.transaction.role === TransactionRole.Giver) {
      await this.giver.processProblemReport(new ProblemReport(problemReportMessage))
    }

    const updatedRecord = await this.emitStateChangedEvent(record.transaction.id)
    return { record: updatedRecord }
  }

  public async abortTransaction(
    id: string,
    send = true,
    code?: string,
    reason?: string
  ): Promise<{
    record?: ValueTransferRecord
  }> {
    const record = await this.findById(id)
    if (!record) {
      this.logger.error(`Unable to abort transaction ${id}. Transaction does not exist`)
      return {}
    }

    if (record.transaction.role === TransactionRole.Witness) {
      await this.witness.abortTransaction(record.transaction.id, code, reason, send)
    }
    if (record.transaction.role === TransactionRole.Getter) {
      await this.getter.abortTransaction(record.transaction.id, code, reason, send)
    }
    if (record.transaction.role === TransactionRole.Giver) {
      await this.giver.abortTransaction(record.transaction.id, code, reason, send)
    }

    const updatedRecord = await this.emitStateChangedEvent(record.transaction.id)
    return { record: updatedRecord }
  }

  public async getPendingTransactions(): Promise<{
    records?: ValueTransferRecord[] | null
  }> {
    const records = await this.valueTransferRepository.findByQuery({ status: TransactionStatus.Pending })
    return { records }
  }

  public async getActiveTransaction(): Promise<{
    record?: ValueTransferRecord | null
  }> {
    const record = await this.valueTransferRepository.findSingleByQuery({
      status: TransactionStatus.InProgress,
    })
    return { record }
  }

  public async requestWitnessTable(witnessId?: string): Promise<void> {
    const witness = witnessId || this.config.valueTransferWitnessDid

    this.logger.info(`Requesting list of witnesses from the witness ${witness}`)

    if (!witness) {
      throw new AriesFrameworkError(`Unable to request witness table. Witness DID must be specified.`)
    }

    const did = await this.didService.findStaticDid(DidMarker.Queries)
    if (!did?.did) {
      throw new AriesFrameworkError(`Unable to get DID for query preparation.`)
    }

    const message = new WitnessTableQueryMessage({
      from: did?.did,
      to: witness,
      body: {},
    })
    await this.sendMessage(message)
  }

  public processWitnessTable(messageContext: InboundMessageContext<WitnessTableMessage>): void {
    const { message: witnessTable } = messageContext

    if (!witnessTable.from) {
      this.config.logger.info('Unknown Witness Table sender')
      return
    }

    this.eventEmitter.emit<WitnessTableReceivedEvent>({
      type: ValueTransferEventTypes.WitnessTableReceived,
      payload: {
        witnesses: witnessTable.body.witnesses,
      },
    })
  }

  public async acquireWalletLock(transactionId: string) {
    this.logger.info(`Lock: queueing transaction ${transactionId}`)
    return await this.valueTransferLockService.acquireWalletLock(async () => {
      this.logger.info(`Lock: locking transaction ${transactionId}`)
      await this.returnWhenIsCompleted(transactionId)
      this.logger.info(`Lock: releasing transaction ${transactionId}`)
    })
  }

  private getTransactionTimeout(valueTransfer: ValueTransferRecord) {
    let timeoutInSeconds = valueTransfer.receipt.getter.timeout_elapsed
    if (!timeoutInSeconds) timeoutInSeconds = valueTransfer.receipt.giver.timeout_elapsed
    else if (valueTransfer.receipt.giver.timeout_elapsed)
      timeoutInSeconds = Math.min(valueTransfer.receipt.giver.timeout_elapsed, timeoutInSeconds)
    return timeoutInSeconds ?? 0
  }

  public async returnWhenIsCompleted(recordId: string): Promise<ValueTransferRecord> {
    const isCompleted = (record: ValueTransferRecord) => {
      return (
        record.id === recordId &&
        (record.transaction.state === TransactionState.Completed ||
          record.transaction.state === TransactionState.Failed)
      )
    }

    const observable = this.eventEmitter.observable<ValueTransferStateChangedEvent>(
      ValueTransferEventTypes.ValueTransferStateChanged
    )
    const subject = new ReplaySubject<ValueTransferRecord>(1)

    const valueTransfer = await this.getById(recordId)
    const timeoutInSeconds = this.getTransactionTimeout(valueTransfer)
    observable
      .pipe(
        map((e) => e.payload.record),
        first(isCompleted),
        timeoutWhen(!!timeoutInSeconds, timeoutInSeconds * 1000)
      )
      .subscribe(subject)

    if (isCompleted(valueTransfer)) {
      subject.next(valueTransfer)
    }

    return firstValueFrom(subject)
  }

  public async sendMessage(message: DIDCommV2Message, transport?: Transports) {
    this.logger.info(`Sending VTP message with type '${message.type}' to DID ${message?.to}`)
    this.logger.debug(` Message: ${JsonEncoder.toString(message)}`)
    const sendingMessageType = message.to ? SendingMessageType.Encrypted : SendingMessageType.Signed
    const transports = transport ? [transport] : undefined
    await this.messageSender.sendDIDCommV2Message(message, sendingMessageType, transports)
  }

  public async getBalance(): Promise<number> {
    const state = await this.valueTransferStateService.getPartyState()
    return state.wallet.amount()
  }

  public async getByThread(threadId: string): Promise<ValueTransferRecord> {
    return this.valueTransferRepository.getSingleByQuery({ threadId })
  }

  public async findByThread(threadId: string): Promise<ValueTransferRecord | null> {
    return this.valueTransferRepository.findSingleByQuery({ threadId })
  }

  public async getAll(): Promise<ValueTransferRecord[]> {
    return this.valueTransferRepository.getAll()
  }

  public async getById(recordId: string): Promise<ValueTransferRecord> {
    return this.valueTransferRepository.getById(recordId)
  }

  public async findById(recordId: string): Promise<ValueTransferRecord | null> {
    return this.valueTransferRepository.findById(recordId)
  }

  public async findAllByQuery(query: Partial<ValueTransferTags>) {
    return this.valueTransferRepository.findByQuery(query)
  }

  public async findPartyState(): Promise<ValueTransferStateRecord | null> {
    return this.valueTransferStateRepository.findSingleByQuery({})
  }

  public async getPartyPublicDid() {
    return this.didService.getPublicDid()
  }

  public async emitStateChangedEvent(id: string): Promise<ValueTransferRecord> {
    const record = await this.valueTransferRepository.getById(id)
    this.eventEmitter.emit<ValueTransferStateChangedEvent>({
      type: ValueTransferEventTypes.ValueTransferStateChanged,
      payload: { record, currentState: record.state },
    })
    return record
  }

  public async initActiveTransactionLock() {
    const record = await this.getCurrentlyActiveTransaction()
    if (record) {
      return await this.acquireWalletLock(record.id)
    }
  }

  // Returns either transaction with InProgress state or transaction with Request/Offer sent status.
  // Lock should be acquired on pending transaction, if current party is the initiator.
  public async getCurrentlyActiveTransaction() {
    const { record } = await this.getActiveTransaction()
    if (record) {
      return record
    }
    const { records } = await this.getPendingTransactions()
    const pendingRecord = records?.find(
      (r) => r.transaction.state == TransactionState.RequestSent || r.transaction.state == TransactionState.OfferSent
    )
    return pendingRecord
  }
}
