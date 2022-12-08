import type { GossipConfig, GossipPlugins, WitnessDetails } from '@sicpa-dlab/witness-gossip-types-ts'

export interface WitnessConfigOptions {
  wid: string
  knownWitnesses: WitnessDetails[]
  gossipConfig?: GossipConfig
  gossipPlugins?: Partial<GossipPlugins>
  issuerDids?: string[]
}

export class WitnessConfig {
  public wid!: string
  public knownWitnesses!: WitnessDetails[]
  public gossipConfig?: GossipConfig
  public gossipPlugins?: Partial<GossipPlugins>
  public issuerDids?: string[]

  public constructor(options: WitnessConfigOptions) {
    this.wid = options.wid
    this.knownWitnesses = options.knownWitnesses
    this.gossipConfig = options.gossipConfig
    this.gossipPlugins = options.gossipPlugins
    this.issuerDids = options.issuerDids
  }
}
