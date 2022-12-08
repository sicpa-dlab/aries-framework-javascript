import type { ValueTransferMessageParams } from './ValueTransferBaseMessage'

import { IsValidMessageType, parseMessageType } from '@aries-framework/core'
import { CashAcceptance } from '@sicpa-dlab/value-transfer-protocol-ts'
import { IsString } from 'class-validator'

import { ValueTransferBaseMessage } from './ValueTransferBaseMessage'

export class CashAcceptedMessage extends ValueTransferBaseMessage {
  public constructor(options?: ValueTransferMessageParams) {
    super(options)
  }

  @IsValidMessageType(CashAcceptedMessage.type)
  public readonly type = CashAcceptedMessage.type.messageTypeUri
  public static readonly type = parseMessageType(CashAcceptance.type)

  @IsString()
  public thid!: string
}
