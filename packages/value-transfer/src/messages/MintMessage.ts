import type { DIDCommV2MessageParams } from '@aries-framework/core'

import { DIDCommV2Message, IsValidMessageType, parseMessageType } from '@aries-framework/core'
import { transformUint8Array } from '@sicpa-dlab/value-transfer-common-ts'
import { Mint } from '@sicpa-dlab/value-transfer-protocol-ts'
import { Expose, Transform, Type } from 'class-transformer'
import { IsArray, IsObject, IsOptional, IsString, ValidateNested } from 'class-validator'

export type MintMessageParams = {
  body: MintMessageBody
  please_ack?: string[]
} & DIDCommV2MessageParams

export class MintMessageBody {
  @Expose({ name: 'start_hash' })
  @Transform((params) => transformUint8Array(params))
  public startHash!: Uint8Array | null

  @Expose({ name: 'end_hash' })
  @Transform((params) => transformUint8Array(params))
  public endHash!: Uint8Array
}

export class MintMessage extends DIDCommV2Message {
  @IsObject()
  @ValidateNested()
  @Type(() => MintMessageBody)
  public body!: MintMessageBody

  @IsString()
  public from!: string

  @IsValidMessageType(MintMessage.type)
  public readonly type = MintMessage.type.messageTypeUri
  public static readonly type = parseMessageType(Mint.type)

  public constructor(params?: MintMessageParams) {
    super(params)

    if (params) {
      this.body = params.body
    }
  }

  @IsArray()
  @IsOptional()
  public please_ack?: Array<string>
}
