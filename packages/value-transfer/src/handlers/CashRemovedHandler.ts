import type { ValueTransferWitnessService } from '../services/ValueTransferWitnessService'
import type { Handler, HandlerInboundMessage } from '@aries-framework/core'

import { CashRemovedMessage } from '../messages'

export class CashRemovedHandler implements Handler {
  private valueTransferWitnessService: ValueTransferWitnessService

  public readonly supportedMessages = [CashRemovedMessage]

  public constructor(valueTransferWitnessService: ValueTransferWitnessService) {
    this.valueTransferWitnessService = valueTransferWitnessService
  }

  public async handle(messageContext: HandlerInboundMessage<CashRemovedHandler>) {
    await this.valueTransferWitnessService.processCashRemoval(messageContext)
  }
}
