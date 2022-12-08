import type { ValueTransferMessageParams } from './ValueTransferBaseMessage'

import { IsValidMessageType, parseMessageType } from '@aries-framework/core'
import { RequestAcceptance } from '@sicpa-dlab/value-transfer-protocol-ts'
import { IsString } from 'class-validator'

import { ValueTransferBaseMessage } from './ValueTransferBaseMessage'

export class RequestAcceptedMessage extends ValueTransferBaseMessage {
  public constructor(options?: ValueTransferMessageParams) {
    super(options)
  }

  @IsValidMessageType(RequestAcceptedMessage.type)
  public readonly type = RequestAcceptedMessage.type.messageTypeUri
  public static readonly type = parseMessageType(RequestAcceptance.type)

  @IsString()
  public thid!: string
}
