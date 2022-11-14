import type { AgentMessage } from './AgentMessage'
import type { AgentContext } from './context'
import type {
  DecryptedMessageContext,
  EncryptedMessage,
  PlaintextMessage,
  ProtectedMessage,
  ReceivedMessage,
  SignedMessage,
} from './didcomm/types'
import type { DIDCommV1Message, PackMessageParams as DIDCommV1PackMessageParams } from './didcomm/versions/v1'
import type { DIDCommV2Message, PackMessageParams as DIDCommV2PackMessageParams } from './didcomm/versions/v2'

import { InjectionSymbols } from '../constants'
import { AriesFrameworkError } from '../error'
import { inject, injectable } from '../plugins'
import { JsonEncoder } from '../utils'

import { AgentConfig } from './AgentConfig'
import { DIDCommMessageVersion, DidCommV1Algorithms, DidCommV1Types, MessageType } from './didcomm/types'
import { DIDCommV1EnvelopeService } from './didcomm/versions/v1'
import { DIDCommV2EnvelopeService } from './didcomm/versions/v2'

export type PackMessageParams = DIDCommV1PackMessageParams | DIDCommV2PackMessageParams

@injectable()
export class EnvelopeService {
  private didCommV1EnvelopeService: DIDCommV1EnvelopeService
  private didCommV2EnvelopeService: DIDCommV2EnvelopeService

  public constructor(
    agentConfig: AgentConfig,
    @inject(InjectionSymbols.DIDCommV1EnvelopeService) didCommV1EnvelopeService: DIDCommV1EnvelopeService,
    @inject(InjectionSymbols.DIDCommV2EnvelopeService) didCommV2EnvelopeService: DIDCommV2EnvelopeService
  ) {
    this.didCommV1EnvelopeService = didCommV1EnvelopeService
    this.didCommV2EnvelopeService = didCommV2EnvelopeService
  }

  public async packMessage(
    agentContext: AgentContext,
    message: AgentMessage,
    params: PackMessageParams & { type?: MessageType }
  ): Promise<EncryptedMessage> {
    if (message.version === DIDCommMessageVersion.V1) {
      return this.didCommV1EnvelopeService.packMessage(
        agentContext,
        message as DIDCommV1Message,
        params as DIDCommV1PackMessageParams
      )
    }
    if (message.version === DIDCommMessageVersion.V2) {
      const res = this.didCommV2EnvelopeService.packMessage(
        agentContext,
        message as DIDCommV2Message,
        params as DIDCommV2PackMessageParams
      )
      return res
    }
    throw new AriesFrameworkError(`Unexpected pack DIDComm message params: ${params}`)
  }

  public async unpackMessage(
    agentContext: AgentContext,
    message: ReceivedMessage,
    params: { type?: MessageType }
  ): Promise<DecryptedMessageContext> {
    if (params.type === MessageType.Encrypted) {
      return this.unpackJWE(agentContext, message as EncryptedMessage)
    } else if (params.type === MessageType.Signed) {
      return this.unpackJWS(agentContext, message as SignedMessage)
    } else {
      return {
        plaintextMessage: message as PlaintextMessage,
      }
    }
  }

  private async unpackJWE(agentContext: AgentContext, message: EncryptedMessage): Promise<DecryptedMessageContext> {
    const protectedValue = JsonEncoder.fromBase64(message.protected) as ProtectedMessage
    if (!protectedValue) {
      throw new AriesFrameworkError(`Unable to unpack message.`)
    }

    if (
      protectedValue.typ === DidCommV1Types.JwmV1 &&
      (protectedValue.alg === DidCommV1Algorithms.Anoncrypt || protectedValue.alg === DidCommV1Algorithms.Authcrypt)
    ) {
      return this.didCommV1EnvelopeService.unpackMessage(agentContext, message)
    } else {
      return this.didCommV2EnvelopeService.unpackMessage(agentContext, message)
    }
  }

  private async unpackJWS(agentContext: AgentContext, message: SignedMessage): Promise<DecryptedMessageContext> {
    return this.didCommV2EnvelopeService.unpackMessage(agentContext, message)
  }
}
