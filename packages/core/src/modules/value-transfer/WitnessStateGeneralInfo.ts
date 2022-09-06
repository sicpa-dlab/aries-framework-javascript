import { WitnessInfo } from '@sicpa-dlab/value-transfer-protocol-ts'

export interface WitnessStateGeneralInfo {
  topWitness: WitnessInfo
  lastUpdateTracker: Map<string, number>
  gossipDid: string
  numberPartyStateHashes: number
  numberPartyStateHashGaps: number
  knownWitnessDids: Array<WitnessInfo>
}
