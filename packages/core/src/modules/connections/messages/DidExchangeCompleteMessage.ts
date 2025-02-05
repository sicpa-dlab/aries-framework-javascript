import { DIDCommV1Message } from '../../../agent/didcomm'
import { IsValidMessageType, parseMessageType } from '../../../utils/messageType'

export interface DidExchangeCompleteMessageOptions {
  id?: string
  threadId: string
  parentThreadId: string
}

/**
 * @see https://github.com/hyperledger/aries-rfcs/blob/main/features/0023-did-exchange/README.md#3-exchange-complete
 */
export class DidExchangeCompleteMessage extends DIDCommV1Message {
  public constructor(options: DidExchangeCompleteMessageOptions) {
    super()

    if (options) {
      this.id = options.id ?? this.generateId()

      this.setThread({
        threadId: options.threadId,
        parentThreadId: options.parentThreadId,
      })
    }
  }

  @IsValidMessageType(DidExchangeCompleteMessage.type)
  public readonly type = DidExchangeCompleteMessage.type.messageTypeUri
  public static readonly type = parseMessageType('https://didcomm.org/didexchange/1.0/complete')
}
