import { DIDCommV1Message } from '../../../agent/didcomm'
import { IsValidMessageType, parseMessageType } from '../../../utils/messageType'

export interface HandshakeReuseMessageOptions {
  id?: string
  parentThreadId: string
}

export class HandshakeReuseMessage extends DIDCommV1Message {
  public constructor(options: HandshakeReuseMessageOptions) {
    super()

    if (options) {
      this.id = options.id ?? this.generateId()
      this.setThread({
        threadId: this.id,
        parentThreadId: options.parentThreadId,
      })
    }
  }

  @IsValidMessageType(HandshakeReuseMessage.type)
  public readonly type = HandshakeReuseMessage.type.messageTypeUri
  public static readonly type = parseMessageType('https://didcomm.org/out-of-band/1.1/handshake-reuse')
}
