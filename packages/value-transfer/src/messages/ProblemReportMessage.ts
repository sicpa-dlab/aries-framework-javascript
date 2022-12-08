import type { ProblemReportV2MessageOptions } from '@aries-framework/core'

import { ProblemReportV2Message, IsValidMessageType, parseMessageType } from '@aries-framework/core'
import { ProblemReport } from '@sicpa-dlab/value-transfer-protocol-ts'

export class ProblemReportMessage extends ProblemReportV2Message {
  public constructor(options?: ProblemReportV2MessageOptions) {
    super(options)
  }

  @IsValidMessageType(ProblemReportMessage.type)
  public readonly type = ProblemReportMessage.type.messageTypeUri
  public static readonly type = parseMessageType(ProblemReport.type)
}
