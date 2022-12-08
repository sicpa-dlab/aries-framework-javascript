import type { DIDCommV2MessageParams } from '@aries-framework/core'

import { DIDCommV2Message } from '@aries-framework/core'
import { Type } from 'class-transformer'
import { IsInstance, ValidateNested } from 'class-validator'

export type ValueTransferMessageParams = DIDCommV2MessageParams

export class ValueTransferMessageBody {}

export class ValueTransferBaseMessage extends DIDCommV2Message {
  public constructor(options?: ValueTransferMessageParams) {
    super(options)
  }

  @Type(() => ValueTransferMessageBody)
  @ValidateNested()
  @IsInstance(ValueTransferMessageBody)
  public body!: ValueTransferMessageBody
}
