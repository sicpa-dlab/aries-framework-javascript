import type { BaseEvent } from '../../agent/Events'
import type { ValueTransferRecord } from './repository'
import type { TransactionState } from '@sicpa-dlab/value-transfer-protocol-ts'
import type { WitnessData } from '@sicpa-dlab/witness-gossip-types-ts'

export enum ValueTransferEventTypes {
  ValueTransferStateChanged = 'ValueTransferStateChanged',
  ResumeTransaction = 'ResumeTransaction',
  WitnessTableReceived = 'WitnessTableReceived',
  CashMinted = 'CashMinted',
}

export interface ValueTransferStateChangedEvent extends BaseEvent {
  type: typeof ValueTransferEventTypes.ValueTransferStateChanged
  payload: {
    record: ValueTransferRecord
    previousState?: TransactionState | null
    currentState: TransactionState
  }
}

export interface ResumeValueTransferTransactionEvent extends BaseEvent {
  type: typeof ValueTransferEventTypes.ResumeTransaction
  payload: {
    thid: string
  }
}

export interface WitnessTableReceivedEvent extends BaseEvent {
  type: typeof ValueTransferEventTypes.WitnessTableReceived
  payload: {
    witnesses: WitnessData[]
  }
}

export interface CashMintedEvent extends BaseEvent {
  type: typeof ValueTransferEventTypes.CashMinted
}
