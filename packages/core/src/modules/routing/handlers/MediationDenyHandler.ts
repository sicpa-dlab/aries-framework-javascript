import type { Handler, HandlerInboundMessage } from '../../../agent/Handler'
import type { DIDCommV1Message } from '../../../agent/didcomm'
import type { MediationRecipientService } from '../services'

import { MediationDenyMessage } from '../messages'

export class MediationDenyHandler implements Handler<typeof DIDCommV1Message> {
  private mediationRecipientService: MediationRecipientService
  public supportedMessages = [MediationDenyMessage]

  public constructor(mediationRecipientService: MediationRecipientService) {
    this.mediationRecipientService = mediationRecipientService
  }

  public async handle(messageContext: HandlerInboundMessage<MediationDenyHandler>) {
    if (!messageContext.connection) {
      throw new Error(`Connection for verkey ${messageContext.recipient} not found!`)
    }
    await this.mediationRecipientService.processMediationDeny(messageContext)
  }
}
