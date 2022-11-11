import type { ProofAttachmentFormat } from '../../../formats/models/ProofAttachmentFormat'

import { Expose, Type } from 'class-transformer'
import { IsArray, IsBoolean, IsInstance, IsOptional, IsString, ValidateNested } from 'class-validator'

import { DIDCommV1Message } from '../../../../../agent/didcomm'
import { Attachment } from '../../../../../decorators/attachment/Attachment'
import { AriesFrameworkError } from '../../../../../error/AriesFrameworkError'
import { IsValidMessageType, parseMessageType } from '../../../../../utils/messageType'
import { uuid } from '../../../../../utils/uuid'
import { ProofFormatSpec } from '../../../models/ProofFormatSpec'

export interface V2PresentationMessageOptions {
  id?: string
  goalCode?: string
  comment?: string
  lastPresentation?: boolean
  attachmentInfo: ProofAttachmentFormat[]
}

export class V2PresentationMessage extends DIDCommV1Message {
  public constructor(options: V2PresentationMessageOptions) {
    super()

    if (options) {
      this.formats = []
      this.presentationsAttach = []
      this.id = options.id ?? uuid()
      this.comment = options.comment
      this.goalCode = options.goalCode
      this.lastPresentation = options.lastPresentation ?? true

      for (const entry of options.attachmentInfo) {
        this.addPresentationsAttachment(entry)
      }
    }
  }

  public addPresentationsAttachment(attachment: ProofAttachmentFormat) {
    this.formats.push(attachment.format)
    this.presentationsAttach.push(attachment.attachment)
  }

  /**
   * Every attachment has a corresponding entry in the formats array.
   * This method pairs those together in a {@link ProofAttachmentFormat} object.
   */
  public getAttachmentFormats(): ProofAttachmentFormat[] {
    const attachmentFormats: ProofAttachmentFormat[] = []

    this.formats.forEach((format) => {
      const attachment = this.presentationsAttach.find((attachment) => attachment.id === format.attachmentId)

      if (!attachment) {
        throw new AriesFrameworkError(`Could not find a matching attachment with attachmentId: ${format.attachmentId}`)
      }

      attachmentFormats.push({ format, attachment })
    })
    return attachmentFormats
  }

  @IsValidMessageType(V2PresentationMessage.type)
  public readonly type = V2PresentationMessage.type.messageTypeUri
  public static readonly type = parseMessageType('https://didcomm.org/present-proof/2.0/presentation')

  @IsString()
  @IsOptional()
  public comment?: string

  @Expose({ name: 'goal_code' })
  @IsString()
  @IsOptional()
  public goalCode?: string

  @Expose({ name: 'last_presentation' })
  @IsBoolean()
  public lastPresentation = true

  @Expose({ name: 'formats' })
  @Type(() => ProofFormatSpec)
  @IsArray()
  @ValidateNested({ each: true })
  @IsInstance(ProofFormatSpec, { each: true })
  public formats!: ProofFormatSpec[]

  @Expose({ name: 'presentations~attach' })
  @Type(() => Attachment)
  @IsArray()
  @ValidateNested({ each: true })
  @IsInstance(Attachment, { each: true })
  public presentationsAttach!: Attachment[]
}
