import type { AgentMessageReceivedEvent } from '../../../../../agent/Events'
import type { EncryptedMessage } from '../../../../../agent/didcomm/types'
import type { InboundMessageContext } from '../../../../../agent/models/InboundMessageContext'
import type { StatusRequestMessage } from './messages'

import { Dispatcher } from '../../../../../agent/Dispatcher'
import { EventEmitter } from '../../../../../agent/EventEmitter'
import { AgentEventTypes } from '../../../../../agent/Events'
import { MessageSender } from '../../../../../agent/MessageSender'
import { createOutboundDIDCommV1Message } from '../../../../../agent/helpers'
import { InjectionSymbols } from '../../../../../constants'
import { Attachment } from '../../../../../decorators/attachment/Attachment'
import { AriesFrameworkError } from '../../../../../error'
import { inject, injectable } from '../../../../../plugins'
import { MessageRepository } from '../../../../../storage/MessageRepository'
import { TrustPingMessage } from '../../../../connections/messages'
import { ConnectionService } from '../../../../connections/services/ConnectionService'
import { ProblemReportError } from '../../../../problem-reports'
import { RecipientModuleConfig } from '../../../RecipientModuleConfig'
import { RoutingProblemReportReason } from '../../../error'

import {
  DeliveryRequestHandler,
  DeliveryHandler,
  MessagesReceivedHandler,
  StatusHandler,
  StatusRequestHandler,
} from './handlers'
import { MessageDeliveryMessage, StatusMessage, MessagesReceivedMessage, DeliveryRequestMessage } from './messages'

@injectable()
export class V2MessagePickupService {
  private messageRepository: MessageRepository
  private eventEmitter: EventEmitter
  private dispatcher: Dispatcher
  private connectionService: ConnectionService
  private messageSender: MessageSender
  private recipientModuleConfig: RecipientModuleConfig

  public constructor(
    @inject(InjectionSymbols.MessageRepository) messageRepository: MessageRepository,
    eventEmitter: EventEmitter,
    dispatcher: Dispatcher,
    connectionService: ConnectionService,
    messageSender: MessageSender,
    recipientModuleConfig: RecipientModuleConfig
  ) {
    this.messageRepository = messageRepository
    this.eventEmitter = eventEmitter
    this.dispatcher = dispatcher
    this.connectionService = connectionService
    this.messageSender = messageSender
    this.recipientModuleConfig = recipientModuleConfig

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

  public async processStatus(messageContext: InboundMessageContext<StatusMessage>) {
    const connection = messageContext.assertReadyConnection()
    const { message: statusMessage } = messageContext
    const { messageCount, recipientKey } = statusMessage

    //No messages to be sent
    if (messageCount === 0) {
      const { message, connectionRecord } = await this.connectionService.createTrustPing(
        messageContext.agentContext,
        connection,
        {
          responseRequested: false,
        }
      )
      if (message instanceof TrustPingMessage) {
        const websocketSchemes = ['ws', 'wss']

        await this.messageSender.sendMessage(
          messageContext.agentContext,
          createOutboundDIDCommV1Message(connectionRecord, message),
          {
            transportPriority: {
              schemes: websocketSchemes,
              restrictive: true,
              // TODO: add keepAlive: true to enforce through the public api
              // we need to keep the socket alive. It already works this way, but would
              // be good to make more explicit from the public facing API.
              // This would also make it easier to change the internal API later on.
              // keepAlive: true,
            },
          }
        )
        return null
      }
    }
    const { maximumMessagePickup } = this.recipientModuleConfig
    const limit = messageCount < maximumMessagePickup ? messageCount : maximumMessagePickup

    const deliveryRequestMessage = new DeliveryRequestMessage({
      limit,
      recipientKey,
    })

    return deliveryRequestMessage
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

  public async processDelivery(messageContext: InboundMessageContext<MessageDeliveryMessage>) {
    messageContext.assertReadyConnection()

    const { appendedAttachments } = messageContext.message

    if (!appendedAttachments)
      throw new ProblemReportError('Error processing attachments', {
        problemCode: RoutingProblemReportReason.ErrorProcessingAttachments,
      })

    const ids: string[] = []
    for (const attachment of appendedAttachments) {
      ids.push(attachment.id)

      this.eventEmitter.emit<AgentMessageReceivedEvent>(messageContext.agentContext, {
        type: AgentEventTypes.AgentMessageReceived,
        payload: {
          message: attachment.getDataAsJson<EncryptedMessage>(),
          contextCorrelationId: messageContext.agentContext.contextCorrelationId,
        },
      })
    }

    return new MessagesReceivedMessage({
      messageIdList: ids,
    })
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

  public async queueMessage(connectionId: string, message: EncryptedMessage) {
    await this.messageRepository.add(connectionId, message)
  }

  protected registerHandlers() {
    this.dispatcher.registerHandler(new StatusRequestHandler(this))
    this.dispatcher.registerHandler(new DeliveryRequestHandler(this))
    this.dispatcher.registerHandler(new MessagesReceivedHandler(this))
    this.dispatcher.registerHandler(new StatusHandler(this))
    this.dispatcher.registerHandler(new DeliveryHandler(this))
  }
}
