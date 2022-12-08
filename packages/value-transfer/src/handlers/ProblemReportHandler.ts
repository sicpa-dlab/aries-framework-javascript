import type { ValueTransferService } from '../services'
import type { HandlerInboundMessage, Handler } from '@aries-framework/core'

import { ProblemReportMessage } from '../messages/ProblemReportMessage'

export class ProblemReportHandler implements Handler {
  private valueTransferService: ValueTransferService

  public readonly supportedMessages = [ProblemReportMessage]

  public constructor(valueTransferService: ValueTransferService) {
    this.valueTransferService = valueTransferService
  }

  public async handle(messageContext: HandlerInboundMessage<ProblemReportHandler>) {
    await this.valueTransferService.processProblemReport(messageContext)
  }
}
