import type { Handler, HandlerInboundMessage } from '../../../../../../agent/Handler'
import type { MessageSender } from '../../../../../../agent/MessageSender'
import type { V3MessagePickupService } from '../V3MessagePickupService'

import { DeliveryRequestMessage } from '../messages'

export class DeliveryRequestHandler implements Handler {
  private messagePickupService: V3MessagePickupService
  private messageSender: MessageSender
  public supportedMessages = [DeliveryRequestMessage]

  public constructor(messagePickupService: V3MessagePickupService, messageSender: MessageSender) {
    this.messagePickupService = messagePickupService
    this.messageSender = messageSender
  }

  public async handle(messageContext: HandlerInboundMessage<DeliveryRequestHandler>) {
    const message = await this.messagePickupService.handleDeliveryRequest(messageContext)
    if (message) {
      await this.messageSender.sendDIDCommV2Message(messageContext.agentContext, message)
    }
  }
}
