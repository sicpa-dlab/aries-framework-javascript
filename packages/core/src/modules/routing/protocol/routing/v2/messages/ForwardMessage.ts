import type { DIDCommV2MessageParams } from '../../../../../../agent/didcomm'

import { Type } from 'class-transformer'
import { IsString, ValidateNested } from 'class-validator'

import { DIDCommV2Message } from '../../../../../../agent/didcomm'
import { IsValidMessageType, parseMessageType } from '../../../../../../utils/messageType'

export class ForwardMessageBody {
  @IsString()
  public next!: string
}

export type ForwardMessageOptions = {
  body: ForwardMessageBody
} & DIDCommV2MessageParams

/**
 * DIDComm V2 version of message defined here https://identity.foundation/didcomm-messaging/spec/#messages
 */
export class ForwardMessage extends DIDCommV2Message {
  /**
   * Create new ForwardMessage instance.
   *
   * @param options
   */
  public constructor(options: ForwardMessageOptions) {
    super(options)

    if (options) {
      this.body = options.body
    }
  }

  @IsValidMessageType(ForwardMessage.type)
  public readonly type = ForwardMessage.type.messageTypeUri
  public static readonly type = parseMessageType('https://didcomm.org/routing/2.0/forward')

  @Type(() => ForwardMessageBody)
  @ValidateNested()
  public body!: ForwardMessageBody
}
