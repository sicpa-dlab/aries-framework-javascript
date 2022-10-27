import type { InboundMessageContext } from '../../../agent/models/InboundMessageContext'
import type { Logger } from '../../../logger'
import type { Transports } from '../../routing/types'
import type { OfferMessage, RequestAcceptedWitnessedMessage, GetterReceiptMessage } from '../messages'
import type { ValueTransferRecord } from '../repository'
import { ProblemReport, ProblemReportBody, Timeouts } from '@sicpa-dlab/value-transfer-protocol-ts'

import { Getter, GetterReceipt, Offer, RequestAcceptanceWitnessed } from '@sicpa-dlab/value-transfer-protocol-ts'

import { AgentConfig } from '../../../agent/AgentConfig'
import { EventEmitter } from '../../../agent/EventEmitter'
import { AriesFrameworkError } from '../../../error'
import { injectable } from '../../../plugins'
import { RequestMessage } from '../messages'
import { ValueTransferRepository } from '../repository'
import { ValueTransferStateRepository } from '../repository/ValueTransferStateRepository'

import { ValueTransferCryptoService } from './ValueTransferCryptoService'
import { ValueTransferPartyStateService } from './ValueTransferPartyStateService'
import { ValueTransferService } from './ValueTransferService'
import { ValueTransferTransportService } from './ValueTransferTransportService'
import { ErrorCodes } from '@sicpa-dlab/value-transfer-common-ts'
import { DIDCommV2Message } from '@aries-framework/core'

@injectable()
export class ValueTransferGetterService {
  private readonly logger: Logger
  private valueTransferRepository: ValueTransferRepository
  private valueTransferService: ValueTransferService
  private eventEmitter: EventEmitter
  private getter: Getter

  public constructor(
    config: AgentConfig,
    valueTransferRepository: ValueTransferRepository,
    valueTransferStateRepository: ValueTransferStateRepository,
    valueTransferService: ValueTransferService,
    valueTransferCryptoService: ValueTransferCryptoService,
    valueTransferStateService: ValueTransferPartyStateService,
    valueTransferTransportService: ValueTransferTransportService,
    eventEmitter: EventEmitter
  ) {
    this.logger = config.logger.createContextLogger('VTP-GetterService')
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
        witness: config.valueTransferWitnessDid,
        label: config.label,
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
      this.logger.error(`Failed to create Payment Request: ${error?.message}`)
      throw new AriesFrameworkError(`Failed to create Payment Request: ${error?.message}`)
    }

    const requestMessage = new RequestMessage(message)

    // Send message if transport specified
    if (params.transport) {
      await this.valueTransferService.sendMessage(requestMessage, params.transport)
    }

    // Raise event
    const record = await this.valueTransferService.emitStateChangedEvent(transaction.id)

    // Save second party Did
    record.secondPartyDid = requestMessage.to?.length ? requestMessage.to[0] : undefined
    await this.valueTransferRepository.update(record)

    this.logger.info(`< Getter: request payment VTP transaction completed`)

    return { record, message: requestMessage }
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
  public async processOffer(messageContext: InboundMessageContext<OfferMessage>): Promise<{
    record?: ValueTransferRecord
  }> {
    const { message: offerMessage } = messageContext

    this.logger.info(`> Getter: process offer message for VTP transaction ${offerMessage.id}`)

    // Call VTP library to handle offer
    const offer = new Offer(offerMessage)
    const { error, transaction, message } = await this.getter.processOffer(offer)
    if (error || !transaction || !message) {
      this.logger.error(` Getter: process offer message for VTP transaction ${offerMessage.id} failed. Error: ${error}`)
      return {}
    }

    // Raise event
    const record = await this.valueTransferService.emitStateChangedEvent(transaction.id)

    // Save second party Did
    record.secondPartyDid = offerMessage.from
    await this.valueTransferRepository.update(record)

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
  public async acceptOffer(
    record: ValueTransferRecord,
    witnessDid?: string,
    timeouts?: Timeouts
  ): Promise<{
    record: ValueTransferRecord
  }> {
    this.logger.info(`> Getter: accept offer message for VTP transaction ${record.id}`)

    // Call VTP library to accept offer
    const { error, transaction, message } = await this.getter.acceptOffer(record.transaction.id, witnessDid, timeouts)
    if (error || !transaction || !message) {
      this.logger.error(`VTP: Failed to accept Payment Offer: ${error?.message}`)
      throw new AriesFrameworkError(`Failed to accept Payment Offer: ${error?.message}`)
    }

    // Raise event
    const updatedRecord = await this.valueTransferService.emitStateChangedEvent(transaction.id)

    this.logger.info(`> Getter: accept offer message for VTP transaction ${record.id} completed!`)
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
  public async processRequestAcceptanceWitnessed(
    messageContext: InboundMessageContext<RequestAcceptedWitnessedMessage>
  ): Promise<{
    record?: ValueTransferRecord
  }> {
    const { message: requestAcceptedWitnessedMessage } = messageContext

    this.logger.info(
      `> Getter: process request acceptance message for VTP transaction ${requestAcceptedWitnessedMessage.thid}`
    )

    // Call VTP library to handle request acceptance
    const requestAcceptanceWitnessed = new RequestAcceptanceWitnessed(requestAcceptedWitnessedMessage)
    const { error, transaction, message } = await this.getter.acceptCash(requestAcceptanceWitnessed)
    if (error || !transaction || !message) {
      this.logger.error(`VTP: Failed to process Request Acceptance: ${error?.message}`)

      await this.sendProblemReportMessage(
        requestAcceptanceWitnessed.valueTransferMessage.getterId,
        requestAcceptanceWitnessed.valueTransferMessage.witnessId,
        requestAcceptanceWitnessed.thid,
        {
          code: ErrorCodes.InvalidTransactionState,
          comment: 'Failed to process Request Acceptance',
        }
      )

      this.logger.info(`Problem report message sent`)
    }

    // Raise event
    const updatedRecord = await this.valueTransferService.emitStateChangedEvent(requestAcceptanceWitnessed.thid)

    this.logger.info(
      `< Getter: process request acceptance message for VTP transaction ${requestAcceptedWitnessedMessage.thid}`
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
  public async processReceipt(messageContext: InboundMessageContext<GetterReceiptMessage>): Promise<{
    record?: ValueTransferRecord
  }> {
    const { message: getterReceiptMessage } = messageContext

    this.logger.info(`> Getter: process receipt message for VTP transaction ${getterReceiptMessage.thid}`)

    // Call VTP library to handle receipt
    const receipt = new GetterReceipt(getterReceiptMessage)
    const { error, transaction, message } = await this.getter.processReceipt(receipt)
    if (error || !transaction || !message) {
      this.logger.error(`VTP: Failed to process Receipt: ${error?.message}`)
    }

    // Raise event
    const record = await this.valueTransferService.emitStateChangedEvent(receipt.thid)

    this.logger.info(`< Getter: process receipt message for VTP transaction ${getterReceiptMessage.thid} completed!`)
    return { record }
  }

  private async sendProblemReportMessage(from: string, to: string, pthid: string, body: ProblemReportBody) {
    const problemReport = new ProblemReport({
      from,
      to,
      pthid,
      body,
    })
    const didComMessage = new DIDCommV2Message({ ...problemReport })
    await this.valueTransferService.sendMessage(didComMessage)
  }
}
