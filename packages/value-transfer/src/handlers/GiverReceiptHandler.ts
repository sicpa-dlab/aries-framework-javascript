import type { ValueTransferGiverService } from '../services/ValueTransferGiverService'
import type { HandlerInboundMessage, Handler } from '@aries-framework/core'

import { GiverReceiptMessage } from '../messages'

export class GiverReceiptHandler implements Handler {
  private valueTransferGiverService: ValueTransferGiverService
  public readonly supportedMessages = [GiverReceiptMessage]

  public constructor(valueTransferGiverService: ValueTransferGiverService) {
    this.valueTransferGiverService = valueTransferGiverService
  }

  public async handle(messageContext: HandlerInboundMessage<GiverReceiptHandler>) {
    await this.valueTransferGiverService.processReceipt(messageContext)
  }
}
