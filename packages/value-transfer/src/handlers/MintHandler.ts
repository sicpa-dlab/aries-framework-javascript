import type { ValueTransferWitnessService } from '../services/ValueTransferWitnessService'
import type { HandlerInboundMessage, Handler } from '@aries-framework/core'

import { MintMessage } from '../messages/MintMessage'

export class MintHandler implements Handler {
  private valueTransferWitnessService: ValueTransferWitnessService
  public readonly supportedMessages = [MintMessage]

  public constructor(valueTransferWitnessService: ValueTransferWitnessService) {
    this.valueTransferWitnessService = valueTransferWitnessService
  }

  public async handle(messageContext: HandlerInboundMessage<MintHandler>) {
    await this.valueTransferWitnessService.processCashMint(messageContext)
  }
}
