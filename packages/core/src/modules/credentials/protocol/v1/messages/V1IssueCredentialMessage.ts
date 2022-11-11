import type { Cred } from 'indy-sdk'

import { Expose, Type } from 'class-transformer'
import { IsArray, IsInstance, IsOptional, IsString, ValidateNested } from 'class-validator'

import { DIDCommV1Message } from '../../../../../agent/didcomm'
import { Attachment } from '../../../../../decorators/attachment/Attachment'
import { IsValidMessageType, parseMessageType } from '../../../../../utils/messageType'

export const INDY_CREDENTIAL_ATTACHMENT_ID = 'libindy-cred-0'

export interface V1IssueCredentialMessageOptions {
  id?: string
  comment?: string
  credentialAttachments: Attachment[]
  attachments?: Attachment[]
}

export class V1IssueCredentialMessage extends DIDCommV1Message {
  public constructor(options: V1IssueCredentialMessageOptions) {
    super()

    if (options) {
      this.id = options.id ?? this.generateId()
      this.comment = options.comment
      this.credentialAttachments = options.credentialAttachments
      this.appendedAttachments = options.attachments
    }
  }

  @IsValidMessageType(V1IssueCredentialMessage.type)
  public readonly type = V1IssueCredentialMessage.type.messageTypeUri
  public static readonly type = parseMessageType('https://didcomm.org/issue-credential/1.0/issue-credential')

  @IsString()
  @IsOptional()
  public comment?: string

  @Expose({ name: 'credentials~attach' })
  @Type(() => Attachment)
  @IsArray()
  @ValidateNested({
    each: true,
  })
  @IsInstance(Attachment, { each: true })
  public credentialAttachments!: Attachment[]

  public get indyCredential(): Cred | null {
    const attachment = this.credentialAttachments.find((attachment) => attachment.id === INDY_CREDENTIAL_ATTACHMENT_ID)

    // Extract credential from attachment
    const credentialJson = attachment?.getDataAsJson<Cred>() ?? null

    return credentialJson
  }

  public getCredentialAttachmentById(id: string): Attachment | undefined {
    return this.credentialAttachments.find((attachment) => attachment.id == id)
  }
}
