import type { AckDecorator } from '../../../../../decorators/ack/AckDecorator'

import { Expose } from 'class-transformer'
import { IsOptional, IsString } from 'class-validator'

import { DIDCommV1Message } from '../../../../../agent/didcomm'
import { IsValidMessageType, parseMessageType } from '../../../../../utils/messageType'

export interface RevocationNotificationMessageV2Options {
  revocationFormat: string
  credentialId: string
  id?: string
  comment?: string
  pleaseAck?: AckDecorator
}

export class V2RevocationNotificationMessage extends DIDCommV1Message {
  public constructor(options: RevocationNotificationMessageV2Options) {
    super()
    if (options) {
      this.revocationFormat = options.revocationFormat
      this.credentialId = options.credentialId
      this.id = options.id ?? this.generateId()
      this.comment = options.comment
      this.pleaseAck = options.pleaseAck
    }
  }

  @IsValidMessageType(V2RevocationNotificationMessage.type)
  public readonly type = V2RevocationNotificationMessage.type.messageTypeUri
  public static readonly type = parseMessageType('https://didcomm.org/revocation_notification/2.0/revoke')

  @IsString()
  @IsOptional()
  public comment?: string

  @Expose({ name: 'revocation_format' })
  @IsString()
  public revocationFormat!: string

  @Expose({ name: 'credential_id' })
  @IsString()
  public credentialId!: string
}
