import type { ValueTransferGiverService } from '../services/ValueTransferGiverService'
import type { HandlerInboundMessage, Handler } from '@aries-framework/core'

import { CashAcceptedWitnessedMessage } from '../messages'

export class CashAcceptedWitnessedHandler implements Handler {
  private valueTransferGiverService: ValueTransferGiverService

  public readonly supportedMessages = [CashAcceptedWitnessedMessage]

  public constructor(valueTransferGiverService: ValueTransferGiverService) {
    this.valueTransferGiverService = valueTransferGiverService
  }

  public async handle(messageContext: HandlerInboundMessage<CashAcceptedWitnessedHandler>) {
    await this.valueTransferGiverService.processCashAcceptanceWitnessed(messageContext)
  }
}
