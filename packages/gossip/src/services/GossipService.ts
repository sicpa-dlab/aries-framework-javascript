import type { Logger } from '@aries-framework/core'
import type {
  ResumeValueTransferTransactionEvent,
  WitnessTableReceivedEvent,
} from '@aries-framework/value-transfer-events'
import type { GossipInterface, TransactionRecord, BaseGossipMessage } from '@sicpa-dlab/witness-gossip-types-ts'

import {
  AriesFrameworkError,
  DidMarker,
  EventEmitter,
  DidService,
  injectable,
  AgentConfig,
} from '@aries-framework/core'
import { ValueTransferSharedEventTypes } from '@aries-framework/value-transfer-events'
import { GossipMessageDispatcher, Gossip } from '@sicpa-dlab/witness-gossip-protocol-ts'
import { MappingTable, WitnessDetails, WitnessGossipInfo, WitnessTable } from '@sicpa-dlab/witness-gossip-types-ts'
import { v4 } from 'uuid'

import { WitnessConfig } from '../GossipConfig'

import { GossipCryptoService } from './GossipCryptoService'
import { GossipLoggerService } from './GossipLoggerService'
import { GossipTransportService } from './GossipTransportService'

@injectable()
export class GossipService implements GossipInterface {
  private readonly logger: Logger
  private readonly gossip: Gossip
  private readonly messageDispatcher: GossipMessageDispatcher

  private gossipingStarted = false

  public constructor(
    private readonly agentConfig: AgentConfig,
    private readonly config: WitnessConfig,
    private readonly gossipCryptoService: GossipCryptoService,
    private readonly gossipTransportService: GossipTransportService,
    private readonly gossipLoggerService: GossipLoggerService,
    private readonly didService: DidService,
    private readonly eventEmitter: EventEmitter
  ) {
    this.gossip = new Gossip(
      {
        logger: this.config.gossipPlugins?.logger ?? this.gossipLoggerService,
        crypto: this.config.gossipPlugins?.crypto ?? this.gossipCryptoService,
        outboundTransport: this.config.gossipPlugins?.outboundTransport ?? this.gossipTransportService,
        metrics: this.config.gossipPlugins?.metrics,
      },
      {
        label: this.config.gossipConfig?.label || v4(),
        ...this.config.gossipConfig,
      }
    )
    this.messageDispatcher = new GossipMessageDispatcher(this.gossip)
    this.logger = agentConfig.logger
  }

  public getWitnessDetails(): Promise<WitnessDetails> {
    return this.gossip.getWitnessDetails()
  }

  public commitParticipantsTransition(giver: TransactionRecord, getter: TransactionRecord): Promise<void> {
    return this.gossip.commitParticipantsTransition(giver, getter)
  }

  public commitSingleParticipantTransition(start: Uint8Array | null, end: Uint8Array): Promise<void> {
    return this.gossip.commitSingleParticipantTransition(start, end)
  }

  public isInitialized(): Promise<WitnessDetails | null> {
    return this.gossip.isInitialized()
  }

  public async start(): Promise<void> {
    if (!this.gossipingStarted) await this.gossip.start()
    this.gossipingStarted = true
  }

  public stop(): Promise<void> {
    return this.gossip.stop()
  }

  public async initWitnessState(config: WitnessConfig): Promise<void> {
    this.logger.info('> initState')

    const did = await this.didService.findStaticDid(DidMarker.Public)
    if (!did) {
      throw new AriesFrameworkError(
        'Witness public DID not found. Please set `Public` marker for static DID in the agent config.'
      )
    }

    if (!config || !config?.knownWitnesses.length) {
      throw new AriesFrameworkError('Witness table must be provided.')
    }

    const info = new WitnessDetails({ wid: config.wid, did: did.did })
    const mappingTable = new MappingTable(config.knownWitnesses)

    await this.initState(info, mappingTable)

    this.logger.info('< initState completed!')
  }

  public clearState(): Promise<void> {
    return this.gossip.clearState()
  }

  public async checkPartyStateHash(hash: Uint8Array): Promise<Uint8Array | undefined> {
    return this.gossip.checkPartyStateHash(hash)
  }

  public async askTransactionUpdates(id?: string) {
    return this.gossip.askTransactionUpdates(id)
  }

  public async receiveAndHandleMessage(message: BaseGossipMessage): Promise<void> {
    await this.messageDispatcher.dispatchMessage(message)
    this.emitMessageEventIfNeeded(message)
  }

  private emitMessageEventIfNeeded(message: BaseGossipMessage): void {
    switch (message.type) {
      case WitnessTable.type: {
        const witnessTable = message as WitnessTable

        this.eventEmitter.emit<WitnessTableReceivedEvent>({
          type: ValueTransferSharedEventTypes.WitnessTableReceived,
          payload: {
            witnesses: witnessTable.body.witnesses,
          },
        })

        break
      }
      case WitnessGossipInfo.type: {
        const witnessGossipInfo = message as WitnessGossipInfo
        if (!witnessGossipInfo.body.tell || !witnessGossipInfo.pthid) return

        // Resume VTP Transaction if exists -> this event will be caught in WitnessService
        this.eventEmitter.emit<ResumeValueTransferTransactionEvent>({
          type: ValueTransferSharedEventTypes.ResumeTransaction,
          payload: {
            thid: witnessGossipInfo.pthid,
          },
        })

        break
      }
    }
  }

  public async initState(myInfo: WitnessDetails, mappingTable: MappingTable): Promise<void> {
    await this.gossip.initState(myInfo, mappingTable)
  }
}
