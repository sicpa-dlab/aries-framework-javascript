import type { Key } from '../../../../crypto'
import type { DecryptedMessageContext, EncryptedMessage, SignedMessage, MessageType } from '../../types'
import type { AgentContext } from './../../../context'
import type { DIDCommV1Message } from './DIDCommV1Message'

export { DIDCommV1Message } from './DIDCommV1Message'
export { DIDCommV1BaseMessage, DIDComV1BaseMessageConstructor } from './DIDCommV1BaseMessage'

export interface PackMessageParams {
  recipientKeys: Key[]
  routingKeys: Key[]
  senderKey: Key | null
  type?: MessageType
}

export interface DIDCommV1EnvelopeService {
  packMessage(agentContext: AgentContext, payload: DIDCommV1Message, keys: PackMessageParams): Promise<EncryptedMessage>

  unpackMessage(agentContext: AgentContext, message: EncryptedMessage | SignedMessage): Promise<DecryptedMessageContext>
}
