import type { AgentConfig } from '../../../agent/AgentConfig'
import type { Handler, HandlerInboundMessage } from '../../../agent/Handler'
import type { DIDCommV1Message } from '../../../agent/didcomm'
import type { MediationRecipientService } from '../../routing/services/MediationRecipientService'
import type { ConnectionService, Routing } from '../services/ConnectionService'

import { createOutboundMessage } from '../../../agent/helpers'
import { AriesFrameworkError } from '../../../error/AriesFrameworkError'
import { ConnectionRequestMessage } from '../messages'

export class ConnectionRequestHandler implements Handler<typeof DIDCommV1Message> {
  private connectionService: ConnectionService
  private agentConfig: AgentConfig
  private mediationRecipientService: MediationRecipientService
  public supportedMessages = [ConnectionRequestMessage]

  public constructor(
    connectionService: ConnectionService,
    agentConfig: AgentConfig,
    mediationRecipientService: MediationRecipientService
  ) {
    this.connectionService = connectionService
    this.agentConfig = agentConfig
    this.mediationRecipientService = mediationRecipientService
  }

  public async handle(messageContext: HandlerInboundMessage<ConnectionRequestHandler>) {
    if (!messageContext.recipient || !messageContext.sender) {
      throw new AriesFrameworkError('Unable to process connection request without senderKid or recipientKid')
    }

    let connectionRecord = await this.connectionService.findByVerkey(messageContext.recipient)
    if (!connectionRecord) {
      throw new AriesFrameworkError(`Connection for verkey ${messageContext.recipient} not found!`)
    }

    let routing: Routing | undefined

    // routing object is required for multi use invitation, because we're creating a
    // new keypair that possibly needs to be registered at a mediator
    if (connectionRecord.multiUseInvitation) {
      routing = await this.mediationRecipientService.getRoutingDid()
    }

    connectionRecord = await this.connectionService.processRequest(messageContext, routing)

    if (connectionRecord?.autoAcceptConnection ?? this.agentConfig.autoAcceptConnections) {
      const { message } = await this.connectionService.createResponse(connectionRecord.id)
      return createOutboundMessage(connectionRecord, message)
    }
  }
}
