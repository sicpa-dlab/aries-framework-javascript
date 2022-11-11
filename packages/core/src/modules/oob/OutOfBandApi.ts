import type { AgentMessageReceivedEvent } from '../../agent/Events'
import type { DIDCommV1Message, PlaintextMessage } from '../../agent/didcomm'
import type { Key } from '../../crypto'
import type { Attachment } from '../../decorators/attachment/Attachment'
import type { Query } from '../../storage/StorageService'
import type { ConnectionInvitationMessage, ConnectionRecord, Routing } from '../connections'
import type { HandshakeReusedEvent } from './domain/OutOfBandEvents'

import { catchError, EmptyError, first, firstValueFrom, map, of, timeout } from 'rxjs'

import { AgentContext } from '../../agent'
import { Dispatcher } from '../../agent/Dispatcher'
import { EventEmitter } from '../../agent/EventEmitter'
import { filterContextCorrelationId, AgentEventTypes } from '../../agent/Events'
import { MessageSender } from '../../agent/MessageSender'
import { getPlaintextMessageType } from '../../agent/didcomm'
import { createOutboundDIDCommV1Message } from '../../agent/helpers'
import { InjectionSymbols } from '../../constants'
import { ServiceDecorator } from '../../decorators/service/ServiceDecorator'
import { AriesFrameworkError } from '../../error'
import { Logger } from '../../logger'
import { inject, injectable } from '../../plugins'
import { DidCommMessageRepository, DidCommMessageRole } from '../../storage'
import { JsonEncoder, JsonTransformer } from '../../utils'
import { parseMessageType, supportsIncomingMessageType } from '../../utils/messageType'
import { parseInvitationUrl, parseInvitationShortUrl } from '../../utils/parseInvitation'
import { ConnectionsApi, DidExchangeState, HandshakeProtocol } from '../connections'
import { DidCommDocumentService } from '../didcomm'
import { DidKey } from '../dids'
import { didKeyToVerkey } from '../dids/helpers'
import { RoutingService } from '../routing/services/RoutingService'

import { OutOfBandService } from './OutOfBandService'
import { OutOfBandDidCommService } from './domain/OutOfBandDidCommService'
import { OutOfBandEventTypes } from './domain/OutOfBandEvents'
import { OutOfBandRole } from './domain/OutOfBandRole'
import { OutOfBandState } from './domain/OutOfBandState'
import { HandshakeReuseHandler } from './handlers'
import { HandshakeReuseAcceptedHandler } from './handlers/HandshakeReuseAcceptedHandler'
import { convertToNewInvitation, convertToOldInvitation } from './helpers'
import { OutOfBandInvitation } from './messages'
import { OutOfBandRecord } from './repository/OutOfBandRecord'

const didCommProfiles = ['didcomm/aip1', 'didcomm/aip2;env=rfc19']

export interface CreateOutOfBandInvitationConfig {
  label?: string
  alias?: string // alias for a connection record to be created
  imageUrl?: string
  goalCode?: string
  goal?: string
  handshake?: boolean
  handshakeProtocols?: HandshakeProtocol[]
  messages?: DIDCommV1Message[]
  multiUseInvitation?: boolean
  autoAcceptConnection?: boolean
  routing?: Routing
  appendedAttachments?: Attachment[]
}

export interface CreateLegacyInvitationConfig {
  label?: string
  alias?: string // alias for a connection record to be created
  imageUrl?: string
  multiUseInvitation?: boolean
  autoAcceptConnection?: boolean
  routing?: Routing
}

export interface ReceiveOutOfBandInvitationConfig {
  label?: string
  alias?: string
  imageUrl?: string
  autoAcceptInvitation?: boolean
  autoAcceptConnection?: boolean
  reuseConnection?: boolean
  routing?: Routing
}

@injectable()
export class OutOfBandApi {
  private outOfBandService: OutOfBandService
  private routingService: RoutingService
  private connectionsApi: ConnectionsApi
  private didCommMessageRepository: DidCommMessageRepository
  private dispatcher: Dispatcher
  private didCommDocumentService: DidCommDocumentService
  private messageSender: MessageSender
  private eventEmitter: EventEmitter
  private agentContext: AgentContext
  private logger: Logger

  public constructor(
    dispatcher: Dispatcher,
    didCommDocumentService: DidCommDocumentService,
    outOfBandService: OutOfBandService,
    routingService: RoutingService,
    connectionsApi: ConnectionsApi,
    didCommMessageRepository: DidCommMessageRepository,
    messageSender: MessageSender,
    eventEmitter: EventEmitter,
    @inject(InjectionSymbols.Logger) logger: Logger,
    agentContext: AgentContext
  ) {
    this.dispatcher = dispatcher
    this.didCommDocumentService = didCommDocumentService
    this.agentContext = agentContext
    this.logger = logger
    this.outOfBandService = outOfBandService
    this.routingService = routingService
    this.connectionsApi = connectionsApi
    this.didCommMessageRepository = didCommMessageRepository
    this.messageSender = messageSender
    this.eventEmitter = eventEmitter
    this.registerHandlers(dispatcher)
  }

  /**
   * Creates an outbound out-of-band record containing out-of-band invitation message defined in
   * Aries RFC 0434: Out-of-Band Protocol 1.1.
   *
   * It automatically adds all supported handshake protocols by agent to `handshake_protocols`. You
   * can modify this by setting `handshakeProtocols` in `config` parameter. If you want to create
   * invitation without handshake, you can set `handshake` to `false`.
   *
   * If `config` parameter contains `messages` it adds them to `requests~attach` attribute.
   *
   * Agent role: sender (inviter)
   *
   * @param config configuration of how out-of-band invitation should be created
   * @returns out-of-band record
   */
  public async createInvitation(config: CreateOutOfBandInvitationConfig = {}): Promise<OutOfBandRecord> {
    const multiUseInvitation = config.multiUseInvitation ?? false
    const handshake = config.handshake ?? true
    const customHandshakeProtocols = config.handshakeProtocols
    const autoAcceptConnection = config.autoAcceptConnection ?? this.connectionsApi.config.autoAcceptConnections
    // We don't want to treat an empty array as messages being provided
    const messages = config.messages && config.messages.length > 0 ? config.messages : undefined
    const label = config.label ?? this.agentContext.config.label
    const imageUrl = config.imageUrl ?? this.agentContext.config.connectionImageUrl
    const appendedAttachments =
      config.appendedAttachments && config.appendedAttachments.length > 0 ? config.appendedAttachments : undefined

    if (!handshake && !messages) {
      throw new AriesFrameworkError(
        'One or both of handshake_protocols and requests~attach MUST be included in the message.'
      )
    }

    if (!handshake && customHandshakeProtocols) {
      throw new AriesFrameworkError(`Attribute 'handshake' can not be 'false' when 'handshakeProtocols' is defined.`)
    }

    // For now we disallow creating multi-use invitation with attachments. This would mean we need multi-use
    // credential and presentation exchanges.
    if (messages && multiUseInvitation) {
      throw new AriesFrameworkError("Attribute 'multiUseInvitation' can not be 'true' when 'messages' is defined.")
    }

    let handshakeProtocols
    if (handshake) {
      // Find supported handshake protocol preserving the order of handshake protocols defined
      // by agent
      if (customHandshakeProtocols) {
        this.assertHandshakeProtocols(customHandshakeProtocols)
        handshakeProtocols = customHandshakeProtocols
      } else {
        handshakeProtocols = this.getSupportedHandshakeProtocols()
      }
    }

    const routing = config.routing ?? (await this.routingService.getRouting(this.agentContext, {}))

    const services = routing.endpoints.map((endpoint, index) => {
      return new OutOfBandDidCommService({
        id: `#inline-${index}`,
        serviceEndpoint: endpoint,
        recipientKeys: [routing.recipientKey].map((key) => new DidKey(key).did),
        routingKeys: routing.routingKeys.map((key) => new DidKey(key).did),
      })
    })

    const options = {
      label,
      goal: config.goal,
      goalCode: config.goalCode,
      imageUrl,
      accept: didCommProfiles,
      services,
      handshakeProtocols,
      appendedAttachments,
    }
    const outOfBandInvitation = new OutOfBandInvitation(options)

    if (messages) {
      messages.forEach((message) => {
        if (message.service) {
          // We can remove `~service` attribute from message. Newer OOB messages have `services` attribute instead.
          message.service = undefined
        }
        outOfBandInvitation.addRequest(message)
      })
    }

    const outOfBandRecord = new OutOfBandRecord({
      mediatorId: routing.mediatorId,
      role: OutOfBandRole.Sender,
      state: OutOfBandState.AwaitResponse,
      alias: config.alias,
      outOfBandInvitation: outOfBandInvitation,
      reusable: multiUseInvitation,
      autoAcceptConnection,
      tags: {
        recipientKeyFingerprints: services
          .reduce<string[]>((aggr, { recipientKeys }) => [...aggr, ...recipientKeys], [])
          .map((didKey) => DidKey.fromDid(didKey).key.fingerprint),
      },
    })

    await this.outOfBandService.save(this.agentContext, outOfBandRecord)
    this.outOfBandService.emitStateChangedEvent(this.agentContext, outOfBandRecord, null)

    return outOfBandRecord
  }

  /**
   * Creates an outbound out-of-band record in the same way how `createInvitation` method does it,
   * but it also converts out-of-band invitation message to an "legacy" invitation message defined
   * in RFC 0160: Connection Protocol and returns it together with out-of-band record.
   *
   * Agent role: sender (inviter)
   *
   * @param config configuration of how a connection invitation should be created
   * @returns out-of-band record and connection invitation
   */
  public async createLegacyInvitation(config: CreateLegacyInvitationConfig = {}) {
    const outOfBandRecord = await this.createInvitation({
      ...config,
      handshakeProtocols: [HandshakeProtocol.Connections],
    })
    return { outOfBandRecord, invitation: convertToOldInvitation(outOfBandRecord.outOfBandInvitation) }
  }

  public async createLegacyConnectionlessInvitation<Message extends DIDCommV1Message>(config: {
    recordId: string
    message: Message
    domain: string
  }): Promise<{ message: Message; invitationUrl: string }> {
    // Create keys (and optionally register them at the mediator)
    const routing = await this.routingService.getRouting(this.agentContext)

    // Set the service on the message
    config.message.service = new ServiceDecorator({
      serviceEndpoint: routing.endpoints[0],
      recipientKeys: [routing.recipientKey].map((key) => key.publicKeyBase58),
      routingKeys: routing.routingKeys.map((key) => key.publicKeyBase58),
    })

    // We need to update the message with the new service, so we can
    // retrieve it from storage later on.
    await this.didCommMessageRepository.saveOrUpdateAgentMessage(this.agentContext, {
      agentMessage: config.message,
      associatedRecordId: config.recordId,
      role: DidCommMessageRole.Sender,
    })

    return {
      message: config.message,
      invitationUrl: `${config.domain}?d_m=${JsonEncoder.toBase64URL(JsonTransformer.toJSON(config.message))}`,
    }
  }

  /**
   * Parses URL, decodes invitation and calls `receiveMessage` with parsed invitation message.
   *
   * Agent role: receiver (invitee)
   *
   * @param invitationUrl url containing a base64 encoded invitation to receive
   * @param config configuration of how out-of-band invitation should be processed
   * @returns out-of-band record and connection record if one has been created
   */
  public async receiveInvitationFromUrl(invitationUrl: string, config: ReceiveOutOfBandInvitationConfig = {}) {
    const message = await this.parseInvitationShortUrl(invitationUrl)

    return this.receiveInvitation(message, config)
  }

  /**
   * Parses URL containing encoded invitation and returns invitation message.
   *
   * @param invitationUrl URL containing encoded invitation
   *
   * @returns OutOfBandInvitation
   */
  public parseInvitation(invitationUrl: string): OutOfBandInvitation {
    return parseInvitationUrl(invitationUrl)
  }

  /**
   * Parses URL containing encoded invitation and returns invitation message. Compatible with
   * parsing shortened URLs
   *
   * @param invitationUrl URL containing encoded invitation
   *
   * @returns OutOfBandInvitation
   */
  public async parseInvitationShortUrl(invitation: string): Promise<OutOfBandInvitation> {
    return await parseInvitationShortUrl(invitation, this.agentContext.config.agentDependencies)
  }

  /**
   * Creates inbound out-of-band record and assigns out-of-band invitation message to it if the
   * message is valid. It automatically passes out-of-band invitation for further processing to
   * `acceptInvitation` method. If you don't want to do that you can set `autoAcceptInvitation`
   * attribute in `config` parameter to `false` and accept the message later by calling
   * `acceptInvitation`.
   *
   * It supports both OOB (Aries RFC 0434: Out-of-Band Protocol 1.1) and Connection Invitation
   * (0160: Connection Protocol).
   *
   * Agent role: receiver (invitee)
   *
   * @param invitation either OutOfBandInvitation or ConnectionInvitationMessage
   * @param config config for handling of invitation
   *
   * @returns out-of-band record and connection record if one has been created.
   */
  public async receiveInvitation(
    invitation: OutOfBandInvitation | ConnectionInvitationMessage,
    config: ReceiveOutOfBandInvitationConfig = {}
  ): Promise<{ outOfBandRecord: OutOfBandRecord; connectionRecord?: ConnectionRecord }> {
    // Convert to out of band invitation if needed
    const outOfBandInvitation =
      invitation instanceof OutOfBandInvitation ? invitation : convertToNewInvitation(invitation)

    const { handshakeProtocols } = outOfBandInvitation
    const { routing } = config

    const autoAcceptInvitation = config.autoAcceptInvitation ?? true
    const autoAcceptConnection = config.autoAcceptConnection ?? true
    const reuseConnection = config.reuseConnection ?? false
    const label = config.label ?? this.agentContext.config.label
    const alias = config.alias
    const imageUrl = config.imageUrl ?? this.agentContext.config.connectionImageUrl

    const messages = outOfBandInvitation.getRequests()

    if ((!handshakeProtocols || handshakeProtocols.length === 0) && (!messages || messages?.length === 0)) {
      throw new AriesFrameworkError(
        'One or both of handshake_protocols and requests~attach MUST be included in the message.'
      )
    }

    // Make sure we haven't processed this invitation before.
    let outOfBandRecord = await this.findByInvitationId(outOfBandInvitation.id)
    if (outOfBandRecord) {
      throw new AriesFrameworkError(
        `An out of band record with invitation ${outOfBandInvitation.id} already exists. Invitations should have a unique id.`
      )
    }

    const recipientKeyFingerprints: string[] = []
    for (const service of outOfBandInvitation.getServices()) {
      // Resolve dids to DIDDocs to retrieve services
      if (typeof service === 'string') {
        this.logger.debug(`Resolving services for did ${service}.`)
        const resolvedDidCommServices = await this.didCommDocumentService.resolveServicesFromDid(
          this.agentContext,
          service
        )
        recipientKeyFingerprints.push(
          ...resolvedDidCommServices
            .reduce<Key[]>((aggr, { recipientKeys }) => [...aggr, ...recipientKeys], [])
            .map((key) => key.fingerprint)
        )
      } else {
        recipientKeyFingerprints.push(...service.recipientKeys.map((didKey) => DidKey.fromDid(didKey).key.fingerprint))
      }
    }

    outOfBandRecord = new OutOfBandRecord({
      role: OutOfBandRole.Receiver,
      state: OutOfBandState.Initial,
      outOfBandInvitation: outOfBandInvitation,
      autoAcceptConnection,
      tags: { recipientKeyFingerprints },
    })

    await this.outOfBandService.save(this.agentContext, outOfBandRecord)
    this.outOfBandService.emitStateChangedEvent(this.agentContext, outOfBandRecord, null)

    if (autoAcceptInvitation) {
      return await this.acceptInvitation(outOfBandRecord.id, {
        label,
        alias,
        imageUrl,
        autoAcceptConnection,
        reuseConnection,
        routing,
      })
    }

    return { outOfBandRecord }
  }

  /**
   * Creates a connection if the out-of-band invitation message contains `handshake_protocols`
   * attribute, except for the case when connection already exists and `reuseConnection` is enabled.
   *
   * It passes first supported message from `requests~attach` attribute to the agent, except for the
   * case reuse of connection is applied when it just sends `handshake-reuse` message to existing
   * connection.
   *
   * Agent role: receiver (invitee)
   *
   * @param outOfBandId
   * @param config
   * @returns out-of-band record and connection record if one has been created.
   */
  public async acceptInvitation(
    outOfBandId: string,
    config: {
      autoAcceptConnection?: boolean
      reuseConnection?: boolean
      label?: string
      alias?: string
      imageUrl?: string
      mediatorId?: string
      routing?: Routing
    }
  ) {
    const outOfBandRecord = await this.outOfBandService.getById(this.agentContext, outOfBandId)

    const { outOfBandInvitation } = outOfBandRecord
    const { label, alias, imageUrl, autoAcceptConnection, reuseConnection, routing } = config
    const { handshakeProtocols } = outOfBandInvitation
    const services = outOfBandInvitation.getServices()
    const messages = outOfBandInvitation.getRequests()

    const existingConnection = await this.findExistingConnection(outOfBandInvitation)

    await this.outOfBandService.updateState(this.agentContext, outOfBandRecord, OutOfBandState.PrepareResponse)

    if (handshakeProtocols) {
      this.logger.debug('Out of band message contains handshake protocols.')

      let connectionRecord
      if (existingConnection && reuseConnection) {
        this.logger.debug(
          `Connection already exists and reuse is enabled. Reusing an existing connection with ID ${existingConnection.id}.`
        )

        if (!messages) {
          this.logger.debug('Out of band message does not contain any request messages.')
          const isHandshakeReuseSuccessful = await this.handleHandshakeReuse(outOfBandRecord, existingConnection)

          // Handshake reuse was successful
          if (isHandshakeReuseSuccessful) {
            this.logger.debug(`Handshake reuse successful. Reusing existing connection ${existingConnection.id}.`)
            connectionRecord = existingConnection
          } else {
            // Handshake reuse failed. Not setting connection record
            this.logger.debug(`Handshake reuse failed. Not using existing connection ${existingConnection.id}.`)
          }
        } else {
          // Handshake reuse because we found a connection and we can respond directly to the message
          this.logger.debug(`Reusing existing connection ${existingConnection.id}.`)
          connectionRecord = existingConnection
        }
      }

      // If no existing connection was found, reuseConnection is false, or we didn't receive a
      // handshake-reuse-accepted message we create a new connection
      if (!connectionRecord) {
        this.logger.debug('Connection does not exist or reuse is disabled. Creating a new connection.')
        // Find first supported handshake protocol preserving the order of handshake protocols
        // defined by `handshake_protocols` attribute in the invitation message
        const handshakeProtocol = this.getFirstSupportedProtocol(handshakeProtocols)
        connectionRecord = await this.connectionsApi.acceptOutOfBandInvitation(outOfBandRecord, {
          label,
          alias,
          imageUrl,
          autoAcceptConnection,
          protocol: handshakeProtocol,
          routing,
        })
      }

      if (messages) {
        this.logger.debug('Out of band message contains request messages.')
        if (connectionRecord.isReady) {
          await this.emitWithConnection(connectionRecord, messages)
        } else {
          // Wait until the connection is ready and then pass the messages to the agent for further processing
          this.connectionsApi
            .returnWhenIsConnected(connectionRecord.id)
            .then((connectionRecord) => this.emitWithConnection(connectionRecord, messages))
            .catch((error) => {
              if (error instanceof EmptyError) {
                this.logger.warn(
                  `Agent unsubscribed before connection got into ${DidExchangeState.Completed} state`,
                  error
                )
              } else {
                this.logger.error('Promise waiting for the connection to be complete failed.', error)
              }
            })
        }
      }
      return { outOfBandRecord, connectionRecord }
    } else if (messages) {
      this.logger.debug('Out of band message contains only request messages.')
      if (existingConnection) {
        this.logger.debug('Connection already exists.', { connectionId: existingConnection.id })
        await this.emitWithConnection(existingConnection, messages)
      } else {
        await this.emitWithServices(services, messages)
      }
    }
    return { outOfBandRecord }
  }

  public async findByRecipientKey(recipientKey: Key) {
    return this.outOfBandService.findByRecipientKey(this.agentContext, recipientKey)
  }

  public async findByInvitationId(invitationId: string) {
    return this.outOfBandService.findByInvitationId(this.agentContext, invitationId)
  }

  /**
   * Retrieve all out of bands records
   *
   * @returns List containing all  out of band records
   */
  public getAll() {
    return this.outOfBandService.getAll(this.agentContext)
  }

  /**
   * Retrieve all out of bands records by specified query param
   *
   * @returns List containing all out of band records matching specified query params
   */
  public findAllByQuery(query: Query<OutOfBandRecord>) {
    return this.outOfBandService.findAllByQuery(this.agentContext, query)
  }

  /**
   * Retrieve a out of band record by id
   *
   * @param outOfBandId The  out of band record id
   * @throws {RecordNotFoundError} If no record is found
   * @return The out of band record
   *
   */
  public getById(outOfBandId: string): Promise<OutOfBandRecord> {
    return this.outOfBandService.getById(this.agentContext, outOfBandId)
  }

  /**
   * Find an out of band record by id
   *
   * @param outOfBandId the  out of band record id
   * @returns The out of band record or null if not found
   */
  public findById(outOfBandId: string): Promise<OutOfBandRecord | null> {
    return this.outOfBandService.findById(this.agentContext, outOfBandId)
  }

  /**
   * Delete an out of band record by id
   *
   * @param outOfBandId the out of band record id
   */
  public async deleteById(outOfBandId: string) {
    return this.outOfBandService.deleteById(this.agentContext, outOfBandId)
  }

  private assertHandshakeProtocols(handshakeProtocols: HandshakeProtocol[]) {
    if (!this.areHandshakeProtocolsSupported(handshakeProtocols)) {
      const supportedProtocols = this.getSupportedHandshakeProtocols()
      throw new AriesFrameworkError(
        `Handshake protocols [${handshakeProtocols}] are not supported. Supported protocols are [${supportedProtocols}]`
      )
    }
  }

  private areHandshakeProtocolsSupported(handshakeProtocols: HandshakeProtocol[]) {
    const supportedProtocols = this.getSupportedHandshakeProtocols()
    return handshakeProtocols.every((p) => supportedProtocols.includes(p))
  }

  private getSupportedHandshakeProtocols(): HandshakeProtocol[] {
    const handshakeMessageFamilies = ['https://didcomm.org/didexchange', 'https://didcomm.org/connections']
    const handshakeProtocols = this.dispatcher.filterSupportedProtocolsByMessageFamilies(handshakeMessageFamilies)

    if (handshakeProtocols.length === 0) {
      throw new AriesFrameworkError('There is no handshake protocol supported. Agent can not create a connection.')
    }

    // Order protocols according to `handshakeMessageFamilies` array
    const orderedProtocols = handshakeMessageFamilies
      .map((messageFamily) => handshakeProtocols.find((p) => p.startsWith(messageFamily)))
      .filter((item): item is string => !!item)

    return orderedProtocols as HandshakeProtocol[]
  }

  private getFirstSupportedProtocol(handshakeProtocols: HandshakeProtocol[]) {
    const supportedProtocols = this.getSupportedHandshakeProtocols()
    const handshakeProtocol = handshakeProtocols.find((p) => supportedProtocols.includes(p))
    if (!handshakeProtocol) {
      throw new AriesFrameworkError(
        `Handshake protocols [${handshakeProtocols}] are not supported. Supported protocols are [${supportedProtocols}]`
      )
    }
    return handshakeProtocol
  }

  private async findExistingConnection(outOfBandInvitation: OutOfBandInvitation) {
    this.logger.debug('Searching for an existing connection for out-of-band invitation.', { outOfBandInvitation })

    for (const invitationDid of outOfBandInvitation.invitationDids) {
      const connections = await this.connectionsApi.findByInvitationDid(invitationDid)
      this.logger.debug(`Retrieved ${connections.length} connections for invitation did ${invitationDid}`)

      if (connections.length === 1) {
        const [firstConnection] = connections
        return firstConnection
      } else if (connections.length > 1) {
        this.logger.warn(
          `There is more than one connection created from invitationDid ${invitationDid}. Taking the first one.`
        )
        const [firstConnection] = connections
        return firstConnection
      }
      return null
    }
  }

  private async emitWithConnection(connectionRecord: ConnectionRecord, messages: PlaintextMessage[]) {
    const supportedMessageTypes = this.dispatcher.supportedMessageTypes
    const plaintextMessage = messages.find((message) => {
      const parsedMessageType = parseMessageType(getPlaintextMessageType(message) || '')
      return supportedMessageTypes.find((type) => supportsIncomingMessageType(parsedMessageType, type))
    })

    if (!plaintextMessage) {
      throw new AriesFrameworkError('There is no message in requests~attach supported by agent.')
    }

    this.logger.debug(`Message with type ${plaintextMessage['@type']} can be processed.`)

    this.eventEmitter.emit<AgentMessageReceivedEvent>(this.agentContext, {
      type: AgentEventTypes.AgentMessageReceived,
      payload: {
        message: plaintextMessage,
        connection: connectionRecord,
        contextCorrelationId: this.agentContext.contextCorrelationId,
      },
    })
  }

  private async emitWithServices(services: Array<OutOfBandDidCommService | string>, messages: PlaintextMessage[]) {
    if (!services || services.length === 0) {
      throw new AriesFrameworkError(`There are no services. We can not emit messages`)
    }

    const supportedMessageTypes = this.dispatcher.supportedMessageTypes
    const plaintextMessage = messages.find((message) => {
      const parsedMessageType = parseMessageType(getPlaintextMessageType(message) || '')
      return supportedMessageTypes.find((type) => supportsIncomingMessageType(parsedMessageType, type))
    })

    if (!plaintextMessage) {
      throw new AriesFrameworkError('There is no message in requests~attach supported by agent.')
    }

    this.logger.debug(`Message with type ${plaintextMessage['@type']} can be processed.`)

    let serviceEndpoint: string | undefined
    let recipientKeys: string[] | undefined
    let routingKeys: string[] = []

    // The framework currently supports only older OOB messages with `~service` decorator.
    // TODO: support receiving messages with other services so we don't have to transform the service
    // to ~service decorator
    const [service] = services

    if (typeof service === 'string') {
      const [didService] = await this.didCommDocumentService.resolveServicesFromDid(this.agentContext, service)
      if (didService) {
        serviceEndpoint = didService.serviceEndpoint
        recipientKeys = didService.recipientKeys.map((key) => key.publicKeyBase58)
        routingKeys = didService.routingKeys.map((key) => key.publicKeyBase58) || []
      }
    } else {
      serviceEndpoint = service.serviceEndpoint
      recipientKeys = service.recipientKeys.map(didKeyToVerkey)
      routingKeys = service.routingKeys?.map(didKeyToVerkey) || []
    }

    if (!serviceEndpoint || !recipientKeys) {
      throw new AriesFrameworkError('Service not found')
    }

    const serviceDecorator = new ServiceDecorator({
      recipientKeys,
      routingKeys,
      serviceEndpoint,
    })

    plaintextMessage['~service'] = JsonTransformer.toJSON(serviceDecorator)
    this.eventEmitter.emit<AgentMessageReceivedEvent>(this.agentContext, {
      type: AgentEventTypes.AgentMessageReceived,
      payload: {
        message: plaintextMessage,
        contextCorrelationId: this.agentContext.contextCorrelationId,
      },
    })
  }

  private async handleHandshakeReuse(outOfBandRecord: OutOfBandRecord, connectionRecord: ConnectionRecord) {
    const reuseMessage = await this.outOfBandService.createHandShakeReuse(
      this.agentContext,
      outOfBandRecord,
      connectionRecord
    )

    const reuseAcceptedEventPromise = firstValueFrom(
      this.eventEmitter.observable<HandshakeReusedEvent>(OutOfBandEventTypes.HandshakeReused).pipe(
        filterContextCorrelationId(this.agentContext.contextCorrelationId),
        // Find the first reuse event where the handshake reuse accepted matches the reuse message thread
        // TODO: Should we store the reuse state? Maybe we can keep it in memory for now
        first(
          (event) =>
            event.payload.reuseThreadId === reuseMessage.threadId &&
            event.payload.outOfBandRecord.id === outOfBandRecord.id &&
            event.payload.connectionRecord.id === connectionRecord.id
        ),
        // If the event is found, we return the value true
        map(() => true),
        timeout(15000),
        // If timeout is reached, we return false
        catchError(() => of(false))
      )
    )

    const outbound = createOutboundDIDCommV1Message(connectionRecord, reuseMessage)
    await this.messageSender.sendMessage(this.agentContext, outbound)

    return reuseAcceptedEventPromise
  }

  private registerHandlers(dispatcher: Dispatcher) {
    dispatcher.registerHandler(new HandshakeReuseHandler(this.outOfBandService))
    dispatcher.registerHandler(new HandshakeReuseAcceptedHandler(this.outOfBandService))
  }
}
