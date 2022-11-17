import type { DIDCommV2MessageParams } from '../../../../../../agent/didcomm'

import { Expose, Type } from 'class-transformer'
import { IsArray, IsNotEmpty, ValidateNested } from 'class-validator'

import { DIDCommV2Message } from '../../../../../../agent/didcomm'
import { IsValidMessageType, parseMessageType } from '../../../../../../utils/messageType'

export class MediationGrantBody {
  @IsNotEmpty()
  @IsArray()
  @Expose({ name: 'routing_did' })
  public routingDid!: string[]
}

export type MediationGrantMessageOptions = {
  body: MediationGrantBody
} & DIDCommV2MessageParams

/**
 * A mediate grant message is a signal from the mediator to the recipient that permission is given to distribute the included information as an inbound route.
 *`
 * @see https://github.com/decentralized-identity/didcomm.org/tree/main/site/content/protocols/mediator-coordination/2.0#mediate-grant
 */
export class MediationGrantMessage extends DIDCommV2Message {
  public constructor(options: MediationGrantMessageOptions) {
    super()

    if (options) {
      this.body = options.body
    }
  }

  @IsValidMessageType(MediationGrantMessage.type)
  public readonly type = MediationGrantMessage.type.messageTypeUri
  public static readonly type = parseMessageType('https://didcomm.org/coordinate-mediation/2.0/mediate-grant')

  @Type(() => MediationGrantBody)
  @ValidateNested()
  public body!: MediationGrantBody
}
