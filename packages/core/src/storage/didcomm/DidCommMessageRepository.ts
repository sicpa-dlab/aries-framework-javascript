import type { ConstructableDIDCommMessage, DIDCommMessage } from '../../agent/didcomm'
import type { JsonObject } from '../../types'
import type { DidCommMessageRole } from './DidCommMessageRole'

import { EventEmitter } from '../../agent/EventEmitter'
import { InjectionSymbols } from '../../constants'
import { inject, injectable } from '../../plugins'
import { parseMessageType } from '../../utils/messageType'
import { Repository } from '../Repository'
import { StorageService } from '../StorageService'

import { DidCommMessageRecord } from './DidCommMessageRecord'

@injectable()
export class DidCommMessageRepository extends Repository<DidCommMessageRecord> {
  public constructor(
    @inject(InjectionSymbols.StorageService) storageService: StorageService<DidCommMessageRecord>,
    eventEmitter: EventEmitter
  ) {
    super(DidCommMessageRecord, storageService, eventEmitter)
  }

  public async saveAgentMessage({ role, agentMessage, associatedRecordId }: SaveAgentMessageOptions) {
    const didCommMessageRecord = new DidCommMessageRecord({
      message: agentMessage.toJSON() as JsonObject,
      role,
      associatedRecordId,
    })

    await this.save(didCommMessageRecord)
  }

  public async saveOrUpdateAgentMessage(options: SaveAgentMessageOptions) {
    const { messageName, protocolName, protocolMajorVersion } = parseMessageType(options.agentMessage.type)

    const record = await this.findSingleByQuery({
      associatedRecordId: options.associatedRecordId,
      messageName: messageName,
      protocolName: protocolName,
      protocolMajorVersion: String(protocolMajorVersion),
    })

    if (record) {
      record.message = options.agentMessage.toJSON() as JsonObject
      record.role = options.role
      await this.update(record)
      return
    }

    await this.saveAgentMessage(options)
  }

  public async getAgentMessage<MessageClass extends ConstructableDIDCommMessage = ConstructableDIDCommMessage>({
    associatedRecordId,
    messageClass,
  }: GetAgentMessageOptions<MessageClass>): Promise<InstanceType<MessageClass>> {
    const record = await this.getSingleByQuery({
      associatedRecordId,
      messageName: messageClass.type.messageName,
      protocolName: messageClass.type.protocolName,
      protocolMajorVersion: String(messageClass.type.protocolMajorVersion),
    })

    return record.getMessageInstance(messageClass)
  }
  public async findAgentMessage<MessageClass extends ConstructableDIDCommMessage = ConstructableDIDCommMessage>({
    associatedRecordId,
    messageClass,
  }: GetAgentMessageOptions<MessageClass>): Promise<InstanceType<MessageClass> | null> {
    const record = await this.findSingleByQuery({
      associatedRecordId,
      messageName: messageClass.type.messageName,
      protocolName: messageClass.type.protocolName,
      protocolMajorVersion: String(messageClass.type.protocolMajorVersion),
    })

    return record?.getMessageInstance(messageClass) ?? null
  }
}

export interface SaveAgentMessageOptions {
  role: DidCommMessageRole
  agentMessage: DIDCommMessage
  associatedRecordId: string
}

export interface GetAgentMessageOptions<MessageClass extends ConstructableDIDCommMessage> {
  associatedRecordId: string
  messageClass: MessageClass
}
