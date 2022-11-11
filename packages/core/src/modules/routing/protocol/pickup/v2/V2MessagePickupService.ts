import type { EncryptedMessage } from '../../../../../agent/didcomm/types'
import type { InboundMessageContext } from '../../../../../agent/models/InboundMessageContext'
import type { DeliveryRequestMessage, MessagesReceivedMessage, StatusRequestMessage } from './messages'

import { Dispatcher } from '../../../../../agent/Dispatcher'
import { createOutboundDIDCommV1Message } from '../../../../../agent/helpers'
import { InjectionSymbols } from '../../../../../constants'
import { Attachment } from '../../../../../decorators/attachment/Attachment'
import { AriesFrameworkError } from '../../../../../error'
import { inject, injectable } from '../../../../../plugins'
import { MessageRepository } from '../../../../../storage/MessageRepository'
import { MediationRecipientService } from '../../../services'

import {
  DeliveryRequestHandler,
  MessageDeliveryHandler,
  MessagesReceivedHandler,
  StatusHandler,
  StatusRequestHandler,
} from './handlers'
import { MessageDeliveryMessage, StatusMessage } from './messages'

@injectable()
export class V2MessagePickupService {
  private messageRepository: MessageRepository
  private dispatcher: Dispatcher
  private mediationRecipientService: MediationRecipientService

  public constructor(
    @inject(InjectionSymbols.MessageRepository) messageRepository: MessageRepository,
    dispatcher: Dispatcher,
    mediationRecipientService: MediationRecipientService
  ) {
    this.messageRepository = messageRepository
    this.dispatcher = dispatcher
    this.mediationRecipientService = mediationRecipientService

    this.registerHandlers()
  }

  public async processStatusRequest(messageContext: InboundMessageContext<StatusRequestMessage>) {
    // Assert ready connection
    const connection = messageContext.assertReadyConnection()

    if (messageContext.message.recipientKey) {
      throw new AriesFrameworkError('recipient_key parameter not supported')
    }

    const statusMessage = new StatusMessage({
      threadId: messageContext.message.threadId,
      messageCount: await this.messageRepository.getAvailableMessageCount(connection.id),
    })

    return createOutboundDIDCommV1Message(connection, statusMessage)
  }

  public async queueMessage(connectionId: string, message: EncryptedMessage) {
    await this.messageRepository.add(connectionId, message)
  }

  public async processDeliveryRequest(messageContext: InboundMessageContext<DeliveryRequestMessage>) {
    // Assert ready connection
    const connection = messageContext.assertReadyConnection()

    if (messageContext.message.recipientKey) {
      throw new AriesFrameworkError('recipient_key parameter not supported')
    }

    const { message } = messageContext

    // Get available messages from queue, but don't delete them
    const messages = await this.messageRepository.takeFromQueue(connection.id, message.limit, true)

    // TODO: each message should be stored with an id. to be able to conform to the id property
    // of delivery message
    const attachments = messages.map(
      (msg) =>
        new Attachment({
          data: {
            json: msg,
          },
        })
    )

    const outboundMessage =
      messages.length > 0
        ? new MessageDeliveryMessage({
            threadId: messageContext.message.threadId,
            attachments,
          })
        : new StatusMessage({
            threadId: messageContext.message.threadId,
            messageCount: 0,
          })

    return createOutboundDIDCommV1Message(connection, outboundMessage)
  }

  public async processMessagesReceived(messageContext: InboundMessageContext<MessagesReceivedMessage>) {
    // Assert ready connection
    const connection = messageContext.assertReadyConnection()

    const { message } = messageContext

    // TODO: Add Queued Message ID
    await this.messageRepository.takeFromQueue(
      connection.id,
      message.messageIdList ? message.messageIdList.length : undefined
    )

    const statusMessage = new StatusMessage({
      threadId: messageContext.message.threadId,
      messageCount: await this.messageRepository.getAvailableMessageCount(connection.id),
    })

    return createOutboundDIDCommV1Message(connection, statusMessage)
  }

  protected registerHandlers() {
    this.dispatcher.registerHandler(new StatusRequestHandler(this))
    this.dispatcher.registerHandler(new DeliveryRequestHandler(this))
    this.dispatcher.registerHandler(new MessagesReceivedHandler(this))
    this.dispatcher.registerHandler(new StatusHandler(this.mediationRecipientService))
    this.dispatcher.registerHandler(new MessageDeliveryHandler(this.mediationRecipientService))
  }
}
