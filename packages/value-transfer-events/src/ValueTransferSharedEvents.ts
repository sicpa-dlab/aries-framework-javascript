import type { BaseEvent } from '@aries-framework/core'
import type { WitnessData } from '@sicpa-dlab/witness-gossip-types-ts'

export enum ValueTransferSharedEventTypes {
  ResumeTransaction = 'ResumeTransaction',
  WitnessTableReceived = 'WitnessTableReceived',
}

export interface ResumeValueTransferTransactionEvent extends BaseEvent {
  type: typeof ValueTransferSharedEventTypes.ResumeTransaction
  payload: {
    thid: string
  }
}

export interface WitnessTableReceivedEvent extends BaseEvent {
  type: typeof ValueTransferSharedEventTypes.WitnessTableReceived
  payload: {
    witnesses: WitnessData[]
  }
}
