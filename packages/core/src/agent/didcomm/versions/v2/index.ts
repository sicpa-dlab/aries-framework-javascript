import type { DecryptedMessageContext, EncryptedMessage, SignedMessage, MessageType } from '../../types'
import type { AgentContext } from './../../../context/AgentContext'
import type { DIDCommV2Message } from './DIDCommV2Message'

export { DIDCommV2Message } from './DIDCommV2Message'
export { DIDCommV2BaseMessage, DIDComV2BaseMessageConstructor } from './DIDCommV2BaseMessage'

export interface PackMessageParams {
  toDID?: string
  fromDID?: string
  signByDID?: string
  serviceId?: string
  forward?: boolean
  type?: MessageType
}

export interface DIDCommV2EnvelopeService {
  packMessage(
    agentContext: AgentContext,
    payload: DIDCommV2Message,
    params: PackMessageParams
  ): Promise<EncryptedMessage>

  unpackMessage(agentContext: AgentContext, message: EncryptedMessage | SignedMessage): Promise<DecryptedMessageContext>
}
