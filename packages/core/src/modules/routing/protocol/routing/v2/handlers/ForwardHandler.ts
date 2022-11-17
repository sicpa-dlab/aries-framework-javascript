import type { Handler, HandlerInboundMessage } from '../../../../../../agent/Handler'
import type { MessageSender } from '../../../../../../agent/MessageSender'
import type { V2RoutingService } from '../V2RoutingService'

import { DIDCommV2BaseMessage } from '../../../../../../agent/didcomm'
import { ForwardMessage } from '../messages'

export class ForwardHandler implements Handler {
  private routingService: V2RoutingService
  private messageSender: MessageSender

  public supportedMessages = [ForwardMessage]

  public constructor(routingService: V2RoutingService, messageSender: MessageSender) {
    this.routingService = routingService
    this.messageSender = messageSender
  }

  public async handle(messageContext: HandlerInboundMessage<ForwardHandler>) {
    const { attachments } = await this.routingService.processForwardMessage(messageContext)

    const recipient = messageContext.message.recipient()
    if (!recipient) return

    for (const attachment of attachments) {
      const message = DIDCommV2BaseMessage.unpackAttachmentAsJson(attachment)
      await this.messageSender.sendEncryptedPackage(
        messageContext.agentContext,
        message,
        recipient,
        messageContext.message.body.next
      )
    }
  }
}
