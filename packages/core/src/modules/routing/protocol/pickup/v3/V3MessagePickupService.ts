import type { AgentMessageReceivedEvent } from '../../../../../agent/Events'
import type { EncryptedMessage } from '../../../../../agent/didcomm/types'
import type { InboundMessageContext } from '../../../../../agent/models/InboundMessageContext'
import type { DeliveryRequestMessage, StatusRequestMessage } from './messages'

import { Dispatcher } from '../../../../../agent/Dispatcher'
import { EventEmitter } from '../../../../../agent/EventEmitter'
import { AgentEventTypes } from '../../../../../agent/Events'
import { MessageSender } from '../../../../../agent/MessageSender'
import { createOutboundDIDCommV2Message } from '../../../../../agent/helpers'
import { InjectionSymbols } from '../../../../../constants'
import { AriesFrameworkError } from '../../../../../error/AriesFrameworkError'
import { inject, injectable } from '../../../../../plugins'
import { MessageRepository } from '../../../../../storage/MessageRepository'
import { uuid } from '../../../../../utils/uuid'

import {
  DeliveryRequestHandler,
  DeliveryHandler,
  MessagesReceivedHandler,
  StatusRequestHandler,
  StatusResponseHandler,
} from './handlers'
import { DeliveryMessage, StatusResponseMessage, MessagesReceivedMessage } from './messages'

@injectable()
export class V3MessagePickupService {
  private messageRepository: MessageRepository
  private eventEmitter: EventEmitter
  private messageSender: MessageSender
  private dispatcher: Dispatcher

  public constructor(
    @inject(InjectionSymbols.MessageRepository) messageRepository: MessageRepository,
    dispatcher: Dispatcher,
    eventEmitter: EventEmitter,
    messageSender: MessageSender
  ) {
    this.messageRepository = messageRepository
    this.dispatcher = dispatcher
    this.eventEmitter = eventEmitter
    this.messageSender = messageSender

    this.registerHandlers()
  }

  public async processStatusRequest(messageContext: InboundMessageContext<StatusRequestMessage>) {
    const { message } = messageContext

    if (!message.from) {
      throw new AriesFrameworkError('Message des not contain sender!')
    }

    const recipient = message.recipient()
    if (!recipient) {
      throw new AriesFrameworkError('Message des not contain recipient!')
    }

    const statusMessage = new StatusResponseMessage({
      thid: messageContext.message.id,
      body: {
        messageCount: await this.messageRepository.getAvailableMessageCount(recipient),
      },
    })

    return createOutboundDIDCommV2Message(statusMessage)
  }

  public async processStatusResponse(messageContext: InboundMessageContext<StatusResponseMessage>) {
    const { message } = messageContext

    if (!message.from) {
      throw new AriesFrameworkError('Message des not contain sender!')
    }

    const recipient = message.recipient()
    if (!recipient) {
      throw new AriesFrameworkError('Message des not contain recipient!')
    }

    return
  }

  public async handleDeliveryRequest(messageContext: InboundMessageContext<DeliveryRequestMessage>) {
    const { message } = messageContext

    if (!message.from) {
      throw new AriesFrameworkError('Message des not contain sender!')
    }

    const recipient = message.recipient()
    if (!recipient) {
      throw new AriesFrameworkError('Message des not contain recipient!')
    }

    const messages = await this.messageRepository.takeFromQueue(message.from, message.body.limit, true)

    const responseMessage = new DeliveryMessage({
      body: {},
      attachments: messages.map((message) => DeliveryMessage.createJSONAttachment(uuid(), message)),
    })

    return createOutboundDIDCommV2Message(responseMessage)
  }

  public async handleDelivery(messageContext: InboundMessageContext<DeliveryMessage>) {
    const { message } = messageContext

    if (!message.from) {
      throw new AriesFrameworkError('Message des not contain sender!')
    }

    const recipient = message.recipient()
    if (!recipient) {
      throw new AriesFrameworkError('Message des not contain recipient!')
    }

    if (!message.attachments.length) return

    const forwardedMessages = message.attachments

    forwardedMessages.forEach((message) => {
      this.eventEmitter.emit<AgentMessageReceivedEvent>(messageContext.agentContext, {
        type: AgentEventTypes.AgentMessageReceived,
        payload: {
          contextCorrelationId: messageContext.agentContext.contextCorrelationId,
          message: DeliveryMessage.unpackAttachmentAsJson(message),
        },
      })
    })

    // @ts-ignore
    const messageIdList: string[] = message.attachments.map((attachment) => attachment.id).filter((id) => id)

    const responseMessage = new MessagesReceivedMessage({
      from: message.recipient(),
      to: message.from,
      body: { messageIdList },
    })

    return createOutboundDIDCommV2Message(responseMessage)
  }

  public async processMessagesReceived(messageContext: InboundMessageContext<MessagesReceivedMessage>) {
    const { message } = messageContext

    if (!message.from) {
      throw new AriesFrameworkError('Message des not contain sender!')
    }

    const recipient = message.recipient()
    if (!recipient) {
      throw new AriesFrameworkError('Message des not contain recipient!')
    }

    await this.messageRepository.takeFromQueue(recipient, message.body.messageIdList.length)

    return undefined
  }

  public queueMessage(id: string, message: EncryptedMessage) {
    void this.messageRepository.add(id, message)
  }

  protected registerHandlers() {
    this.dispatcher.registerHandler(new DeliveryRequestHandler(this, this.messageSender))
    this.dispatcher.registerHandler(new DeliveryHandler(this, this.messageSender))
    this.dispatcher.registerHandler(new MessagesReceivedHandler(this))
    this.dispatcher.registerHandler(new StatusRequestHandler(this, this.messageSender))
    this.dispatcher.registerHandler(new StatusResponseHandler(this))
  }
}
