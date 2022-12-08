import type { OfferMessage, RequestAcceptedWitnessedMessage, GetterReceiptMessage } from '../messages'
import type { Logger, Transports } from '@aries-framework/core'

import {
  AgentConfig,
  EventEmitter,
  InboundMessageContext,
  AriesFrameworkError,
  injectable,
} from '@aries-framework/core'
import { ErrorCodes } from '@sicpa-dlab/value-transfer-common-ts'
import {
  Timeouts,
  TransactionState,
  Getter,
  GetterReceipt,
  Offer,
  RequestAcceptanceWitnessed,
} from '@sicpa-dlab/value-transfer-protocol-ts'

import { ValueTransferConfig } from '../ValueTransferConfig'
import { lockDecorator } from '../lockDecorator'
import { RequestMessage } from '../messages'
import { ValueTransferRecord, ValueTransferRepository } from '../repository'
import { ValueTransferStateRepository } from '../repository/ValueTransferStateRepository'

import { ValueTransferCryptoService } from './ValueTransferCryptoService'
import { ValueTransferPartyStateService } from './ValueTransferPartyStateService'
import { ValueTransferService } from './ValueTransferService'
import { ValueTransferTransportService } from './ValueTransferTransportService'

@injectable()
export class ValueTransferGetterService {
  private readonly logger: Logger
  private valueTransferRepository: ValueTransferRepository
  private valueTransferService: ValueTransferService
  private eventEmitter: EventEmitter
  private getter: Getter

  public constructor(
    agentConfig: AgentConfig,
    config: ValueTransferConfig,
    valueTransferRepository: ValueTransferRepository,
    valueTransferStateRepository: ValueTransferStateRepository,
    valueTransferService: ValueTransferService,
    valueTransferCryptoService: ValueTransferCryptoService,
    valueTransferStateService: ValueTransferPartyStateService,
    valueTransferTransportService: ValueTransferTransportService,
    eventEmitter: EventEmitter
  ) {
    this.logger = agentConfig.logger.createContextLogger('VTP-GetterService')
    this.valueTransferRepository = valueTransferRepository
    this.valueTransferService = valueTransferService
    this.eventEmitter = eventEmitter

    this.getter = new Getter(
      {
        crypto: valueTransferCryptoService,
        storage: valueTransferStateService,
        transport: valueTransferTransportService,
        logger: this.logger.createContextLogger('Getter'),
      },
      {
        witness: config.witnessDid,
        label: agentConfig.label,
      }
    )
  }

  /**
   * Initiate a new value transfer exchange as Getter by sending a payment request message
   * to the known Witness which transfers record later to Giver.
   *
   * @param params Options to use for request creation -
   * {
   *  amount - Amount to pay
   *  witness - DID of witness validating and signing transaction
   *  unitOfAmount - (Optional) Currency code that represents the unit of account
   *  witness - DID of witness validating and signing transaction
   *  giver - (Optional) DID of giver if it's known in advance
   *  usePublicDid - (Optional) Whether to use public DID of Getter in the request or create a new random one (True by default)
   *  timeouts - (Optional) Giver timeouts to which value transfer must fit
   * }
   *
   * @returns
   *    * Value Transfer record
   *    * Payment Request Message
   */
  @lockDecorator
  public async createRequest(params: {
    amount: number
    unitOfAmount?: string
    witness?: string
    giver?: string
    usePublicDid?: boolean
    timeouts?: Timeouts
    attachment?: Record<string, unknown>
    transport?: Transports
  }): Promise<{
    record: ValueTransferRecord
    message: RequestMessage
  }> {
    this.logger.info(`> Getter: request payment VTP transaction`)

    // Get party public DID from the storage if requested
    const getter = params.usePublicDid ? await this.valueTransferService.getPartyPublicDid() : undefined

    // Call VTP package to create payment request
    const { error, transaction, message } = await this.getter.createRequest({
      getterId: getter?.did,
      giverId: params.giver,
      witnessId: params.witness,
      amount: params.amount,
      unitOfAmount: params.unitOfAmount,
      attachment: params.attachment,
      timeouts: params.timeouts,
      send: false,
    })
    if (error || !transaction || !message) {
      this.logger.error(`Failed to create Payment Request`, { error })
      throw new AriesFrameworkError(`Failed to create Payment Request: ${error?.message}`)
    }

    //getting lock after transaction creation
    await this.valueTransferService.acquireWalletLock(transaction.id)

    const requestMessage = new RequestMessage(message)

    // Send message if transport specified
    if (params.transport) {
      await this.valueTransferService.sendMessage(requestMessage, params.transport)
    }

    const record = await this.valueTransferService.getById(transaction.id)

    // Save second party Did
    record.secondPartyDid = requestMessage.to?.length ? requestMessage.to[0] : undefined

    await this.valueTransferRepository.update(record)

    // Raise event
    await this.valueTransferService.emitStateChangedEvent(record.id)

    this.logger.info(`< Getter: request payment VTP transaction completed`)

    return { record, message: requestMessage }
  }

  @lockDecorator
  public async verifyOfferCanBeAccepted(record: ValueTransferRecord): Promise<{
    record?: ValueTransferRecord
  }> {
    this.logger.info(`> Getter: verify offer message for VTP transaction ${record.transaction.id}`)

    const { error, transaction } = await this.getter.verifyOfferCanBeAccepted(
      record.transaction.id,
      record.expectedRecipientDid
    )
    if (error) {
      this.logger.error(` Getter: verify offer message for VTP transaction ${record.transaction.id} failed.`, {
        error,
      })
      transaction.error = {
        code: error.code || ErrorCodes.InternalError,
        comment: error.message || 'Verify offer message error',
      }
      transaction.state = TransactionState.Failed
      record.transaction = transaction
      await this.valueTransferRepository.update(record)

      const updatedRecord = await this.valueTransferService.emitStateChangedEvent(transaction.id)
      this.logger.info(`< Getter: verify offer message for VTP transaction ${record.transaction.id} failed!`)
      return { record: updatedRecord }
    }

    this.logger.info(`< Getter: verify offer message for VTP transaction ${record.transaction.id} completed!`)
    return { record }
  }

  /**
   * Process a received {@link OfferMessage}.
   *    Value transfer record with the information from the offer message will be created.
   *    Use {@link ValueTransferGetterService.acceptOffer} after calling this method to accept payment request.
   *
   * @param messageContext The context of the received message.
   * @returns
   *    * Value Transfer record
   */
  @lockDecorator
  public async processOffer(messageContext: InboundMessageContext<OfferMessage>): Promise<{
    record?: ValueTransferRecord
  }> {
    const { message: offerMessage } = messageContext

    this.logger.info(`> Getter: process offer message for VTP transaction ${offerMessage.id}`)

    // Call VTP library to handle offer
    const offer = new Offer(offerMessage)
    const { error, transaction } = await this.getter.processOffer(offer)
    if (!transaction) {
      this.logger.error(` Getter: process offer message ${offerMessage.id} failed.`, { error })
      return {}
    }

    const record = await this.valueTransferService.getById(transaction.id)

    // Save second party Did
    record.secondPartyDid = offerMessage.from

    if (offerMessage.to?.length) {
      record.expectedRecipientDid = offerMessage.to[0]
    }
    await this.valueTransferRepository.update(record)

    // Raise event
    await this.valueTransferService.emitStateChangedEvent(record.id)

    this.logger.info(`< Getter: process offer message for VTP transaction ${offerMessage.thid} completed!`)
    return { record }
  }

  /**
   * Accept received {@link OfferMessage} as Getter by sending a cash acceptance message.
   *
   * @param record Value Transfer record containing Payment Offer to accept.
   * @param witnessDid (Optional) DID ot the Witness which must process transaction (or will be taken from the framework config)
   * @param timeouts (Optional) Getter timeouts to which value transfer must fit
   *
   * @returns
   *    * Value Transfer record
   */
  @lockDecorator
  public async acceptOffer(
    recordId: string,
    witnessDid?: string,
    timeouts?: Timeouts
  ): Promise<{
    record?: ValueTransferRecord
  }> {
    await this.valueTransferService.acquireWalletLock(recordId)
    const record = await this.valueTransferService.getById(recordId)

    if (!record) {
      this.logger.warn(` Getter: accept offer record is missing`)
      return {}
    }

    this.logger.info(`> Getter: accept offer message for VTP transaction ${record.transaction.id}`)

    if (record.state != TransactionState.OfferReceived) {
      this.logger.warn(
        ` Getter: accept offer message for VTP transaction ${record.transaction.id} had unexpected state ${record.state}`
      )
      return {}
    }
    // Call VTP library to accept offer
    const { error, transaction } = await this.getter.acceptOffer(record.transaction.id, witnessDid, timeouts)
    if (!transaction) {
      this.logger.error(` Getter: accept offer for VTP transaction ${record.transaction.id} failed.`, { error })
      return {}
    }

    // Raise event
    const updatedRecord = await this.valueTransferService.emitStateChangedEvent(transaction.id)

    this.logger.info(`> Getter: accept offer message for VTP transaction ${record.transaction.id} completed!`)
    return { record: updatedRecord }
  }

  /**
   * Process a received {@link RequestAcceptedWitnessedMessage}.
   * Update Value Transfer record with the information from the received message.
   *
   * @param messageContext The received message context.
   * @returns
   *    * Value Transfer record
   */
  @lockDecorator
  public async processRequestAcceptanceWitnessed(
    messageContext: InboundMessageContext<RequestAcceptedWitnessedMessage>
  ): Promise<{
    record?: ValueTransferRecord
  }> {
    const { message: requestAcceptedWitnessedMessage } = messageContext

    this.logger.info(
      `> Getter: process request acceptance message for VTP transaction ${requestAcceptedWitnessedMessage.id}`
    )

    // Call VTP library to handle request acceptance
    const requestAcceptanceWitnessed = new RequestAcceptanceWitnessed(requestAcceptedWitnessedMessage)
    const { error, transaction } = await this.getter.acceptCash(requestAcceptanceWitnessed)
    if (!transaction) {
      this.logger.error(` Giver: process request acceptance message ${requestAcceptedWitnessedMessage.id} failed.`, {
        error,
      })
      return {}
    }

    // Raise event
    const updatedRecord = await this.valueTransferService.emitStateChangedEvent(transaction.id)

    this.logger.info(
      `< Getter: process request acceptance message for VTP transaction ${requestAcceptedWitnessedMessage.id}`
    )
    return { record: updatedRecord }
  }

  /**
   * Process a received {@link GetterReceiptMessage} and finish Value Transfer.
   * Update Value Transfer record with the information from the message.
   *
   * @param messageContext The context of the received message.
   * @returns
   *    * Value Transfer record
   */
  @lockDecorator
  public async processReceipt(messageContext: InboundMessageContext<GetterReceiptMessage>): Promise<{
    record?: ValueTransferRecord
  }> {
    const { message: getterReceiptMessage } = messageContext

    this.logger.info(`> Getter: process receipt message for VTP transaction ${getterReceiptMessage.id}`)

    // Call VTP library to handle receipt
    const receipt = new GetterReceipt(getterReceiptMessage)
    const { error, transaction } = await this.getter.processReceipt(receipt)
    if (!transaction) {
      this.logger.error(` Giver: process receipt message ${getterReceiptMessage.id} failed.`, { error })
      return {}
    }

    // Raise event
    const record = await this.valueTransferService.emitStateChangedEvent(receipt.thid)

    this.logger.info(`< Getter: process receipt message for VTP transaction ${getterReceiptMessage.id} completed!`)
    return { record }
  }
}
