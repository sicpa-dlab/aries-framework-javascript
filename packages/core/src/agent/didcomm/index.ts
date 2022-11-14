import type { ParsedMessageType } from '../../utils/messageType'
import type { Constructor } from '../../utils/mixins'
import type { DIDCommV1Message } from './versions/v1'
import type { DIDCommV2Message } from './versions/v2/DIDCommV2Message'

export { DIDCommV1Message, DIDCommV1BaseMessage, DIDComV1BaseMessageConstructor } from './versions/v1'
export { DIDCommV2Message } from './versions/v2/DIDCommV2Message'
export {
  DIDCommV2BaseMessage,
  DIDCommV2MessageParams,
  DIDComV2BaseMessageConstructor,
} from './versions/v2/DIDCommV2BaseMessage'
export * from './types'
export * from './helpers'

export type ConstructableDIDCommMessage = Constructor<DIDCommV1Message | DIDCommV2Message> & { type: ParsedMessageType }
