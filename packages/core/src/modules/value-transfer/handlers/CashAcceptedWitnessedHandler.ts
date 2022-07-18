import type { HandlerInboundMessage, Handler } from '../../../agent/Handler'
import type { DIDCommV2Message } from '../../../agent/didcomm'
import type { ValueTransferService } from '../services'
import type { ValueTransferGiverService } from '../services/ValueTransferGiverService'

import { CashAcceptedWitnessedMessage, ProblemReportMessage } from '../messages'

export class CashAcceptedWitnessedHandler implements Handler<typeof DIDCommV2Message> {
  private valueTransferService: ValueTransferService
  private valueTransferGiverService: ValueTransferGiverService

  public readonly supportedMessages = [CashAcceptedWitnessedMessage]

  public constructor(valueTransferService: ValueTransferService, valueTransferGiverService: ValueTransferGiverService) {
    this.valueTransferService = valueTransferService
    this.valueTransferGiverService = valueTransferGiverService
  }

  public async handle(messageContext: HandlerInboundMessage<CashAcceptedWitnessedHandler>) {
    const { message, record } = await this.valueTransferGiverService.processCashAcceptanceWitnessed(messageContext)
    await this.valueTransferService.sendMessageToWitness(message, record)

    // if message is Problem Report -> remove cash from the wallet
    if (message.type !== ProblemReportMessage.type) {
      await this.valueTransferGiverService.removeCash(record)
      return
    }
  }
}
