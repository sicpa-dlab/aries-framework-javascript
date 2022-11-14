import type { AgentContext } from '../../../../context'
import type { DecryptedMessageContext, EncryptedMessage, SignedMessage } from '../../../types'
import type { DIDCommV2Message } from '../DIDCommV2Message'
import type { DIDCommV2EnvelopeService, PackMessageParams } from '../index'
import type { default as didcomm, IMessage } from 'didcomm'

import { Key } from '../../../../../crypto'
import { AriesFrameworkError } from '../../../../../error/AriesFrameworkError'
import { injectable } from '../../../../../plugins'
import { JsonEncoder } from '../../../../../utils'
import { AgentConfig } from '../../../../AgentConfig'
import { DIDCommMessageVersion, MessageType } from '../../../types'

import { DIDResolverService } from './DIDResolverService'
import { SecretResolverService } from './SecretResolverService'

@injectable()
export class DIDCommV2SicpaEnvelopeService implements DIDCommV2EnvelopeService {
  private didResolverService: DIDResolverService
  private secretResolverService: SecretResolverService
  private didcomm: typeof didcomm

  public constructor(
    agentConfig: AgentConfig,
    didResolverService: DIDResolverService,
    secretResolverService: SecretResolverService
  ) {
    this.didcomm = agentConfig.agentDependencies.didcomm
    this.didResolverService = didResolverService
    this.secretResolverService = secretResolverService
  }

  public async packMessage(
    agentContext: AgentContext,
    payload: DIDCommV2Message,
    params: PackMessageParams
  ): Promise<EncryptedMessage> {
    const message = new this.didcomm.Message(payload.toJSON() as IMessage)

    if (params.type === MessageType.Signed && params.signByDID) {
      const [encryptedMsg] = await message.pack_signed(
        params.signByDID,
        this.didResolverService.bindAgentContext(agentContext),
        this.secretResolverService
      )
      return JsonEncoder.fromString(encryptedMsg)
    }
    if ((params.type === MessageType.Encrypted || !params.type) && params.toDID) {
      const [encryptedMsg] = await message.pack_encrypted(
        params.toDID,
        params.fromDID || null,
        params.signByDID || null,
        this.didResolverService.bindAgentContext(agentContext),
        this.secretResolverService,
        {
          messaging_service: params.serviceId,
          forward: params.forward,
        }
      )
      return JsonEncoder.fromString(encryptedMsg)
    }
    throw new AriesFrameworkError('Unexpected case')
  }

  public async unpackMessage(
    agentContext: AgentContext,
    packedMessage: EncryptedMessage | SignedMessage
  ): Promise<DecryptedMessageContext> {
    const [unpackedMsg, unpackMetadata] = await this.didcomm.Message.unpack(
      JsonEncoder.toString(packedMessage),
      this.didResolverService.bindAgentContext(agentContext),
      this.secretResolverService,
      {}
    )

    // FIXME: DIDComm V2 returns `kid` instead of base58 key.
    // We cannot simply create Key object as for DIDComm V1 from base58 representation
    // So we use helper parsing kid
    const senderKey = unpackMetadata.encrypted_from_kid
      ? Key.fromPublicKeyId(unpackMetadata.encrypted_from_kid)
      : undefined

    const recipientKey =
      unpackMetadata.encrypted_to_kids?.length && unpackMetadata.encrypted_to_kids[0]
        ? Key.fromPublicKeyId(unpackMetadata.encrypted_to_kids[0])
        : undefined

    return {
      senderKey,
      recipientKey,
      plaintextMessage: unpackedMsg.as_value(),
      version: DIDCommMessageVersion.V2,
    }
  }
}
