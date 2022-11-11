import { Expose, Type } from 'class-transformer'
import { IsInstance, IsOptional, IsString, ValidateNested } from 'class-validator'

import { DIDCommV1Message } from '../../../../../agent/didcomm'
import { IsValidMessageType, parseMessageType } from '../../../../../utils/messageType'
import { PresentationPreview } from '../models/V1PresentationPreview'

export interface ProposePresentationMessageOptions {
  id?: string
  comment?: string
  parentThreadId?: string
  presentationProposal: PresentationPreview
}

/**
 * Propose Presentation Message part of Present Proof Protocol used to initiate presentation exchange by holder.
 *
 * @see https://github.com/hyperledger/aries-rfcs/blob/master/features/0037-present-proof/README.md#propose-presentation
 */
export class V1ProposePresentationMessage extends DIDCommV1Message {
  public constructor(options: ProposePresentationMessageOptions) {
    super()

    if (options) {
      this.id = options.id ?? this.generateId()
      this.comment = options.comment
      if (options.parentThreadId) {
        this.setThread({
          parentThreadId: options.parentThreadId,
        })
      }
      this.presentationProposal = options.presentationProposal
    }
  }

  @IsValidMessageType(V1ProposePresentationMessage.type)
  public readonly type = V1ProposePresentationMessage.type.messageTypeUri
  public static readonly type = parseMessageType('https://didcomm.org/present-proof/1.0/propose-presentation')

  /**
   * Provides some human readable information about the proposed presentation.
   */
  @IsString()
  @IsOptional()
  public comment?: string

  /**
   * Represents the presentation example that prover wants to provide.
   */
  @Expose({ name: 'presentation_proposal' })
  @Type(() => PresentationPreview)
  @ValidateNested()
  @IsInstance(PresentationPreview)
  public presentationProposal!: PresentationPreview
}
