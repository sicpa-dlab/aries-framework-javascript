import type { ValueTransferService } from '../services'
import type { HandlerInboundMessage, Handler } from '@aries-framework/core'

import { WitnessTableMessage } from '@aries-framework/gossip'

export class WitnessTableHandler implements Handler {
  private valueTransferService: ValueTransferService

  public readonly supportedMessages = [WitnessTableMessage]

  public constructor(gossipService: ValueTransferService) {
    this.valueTransferService = gossipService
  }

  public async handle(messageContext: HandlerInboundMessage<WitnessTableHandler>) {
    await this.valueTransferService.processWitnessTable(messageContext)
  }
}
