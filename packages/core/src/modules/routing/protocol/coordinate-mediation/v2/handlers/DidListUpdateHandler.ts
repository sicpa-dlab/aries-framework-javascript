import type { Handler, HandlerInboundMessage } from '../../../../../../agent/Handler'
import type { MessageSender } from '../../../../../../agent/MessageSender'
import type { V2MediatorService } from '../V2MediatorService'

import { createOutboundDIDCommV2Message } from '../../../../../../agent/helpers'
import { KeyListUpdateMessage } from '../messages'

export class DidListUpdateHandler implements Handler {
  private mediatorService: V2MediatorService
  private messageSender: MessageSender
  public supportedMessages = [KeyListUpdateMessage]

  public constructor(mediatorService: V2MediatorService, messageSender: MessageSender) {
    this.mediatorService = mediatorService
    this.messageSender = messageSender
  }

  public async handle(messageContext: HandlerInboundMessage<DidListUpdateHandler>) {
    const response = await this.mediatorService.processDidListUpdateRequest(messageContext)
    if (!response) return
    const payload = createOutboundDIDCommV2Message(response)
    await this.messageSender.sendMessage(messageContext.agentContext, payload)
  }
}
