import type { Handler, HandlerInboundMessage } from '../../../../../../agent/Handler'
import type { MediationRecipientService } from '../MediationRecipientService'

import { MediationDenyMessage } from '../messages'

export class MediationDenyHandler implements Handler {
  private mediationRecipientService: MediationRecipientService
  public supportedMessages = [MediationDenyMessage]

  public constructor(mediationRecipientService: MediationRecipientService) {
    this.mediationRecipientService = mediationRecipientService
  }

  public async handle(messageContext: HandlerInboundMessage<MediationDenyHandler>) {
    messageContext.assertReadyConnection()

    await this.mediationRecipientService.processMediationDeny(messageContext)
  }
}
