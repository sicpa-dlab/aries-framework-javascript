import type { ValueTransferGetterService } from '../services/ValueTransferGetterService'
import type { HandlerInboundMessage, Handler } from '@aries-framework/core'

import { GetterReceiptMessage } from '../messages'

export class GetterReceiptHandler implements Handler {
  private valueTransferGetterService: ValueTransferGetterService
  public readonly supportedMessages = [GetterReceiptMessage]

  public constructor(valueTransferGetterService: ValueTransferGetterService) {
    this.valueTransferGetterService = valueTransferGetterService
  }

  public async handle(messageContext: HandlerInboundMessage<GetterReceiptHandler>) {
    await this.valueTransferGetterService.processReceipt(messageContext)
  }
}
