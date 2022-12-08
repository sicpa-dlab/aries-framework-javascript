import type { ValueTransferRecord } from './repository'
import type { BaseEvent } from '@aries-framework/core'
import type { TransactionState } from '@sicpa-dlab/value-transfer-protocol-ts'

export enum ValueTransferEventTypes {
  ValueTransferStateChanged = 'ValueTransferStateChanged',
  CashMinted = 'CashMinted',
}

export interface ValueTransferStateChangedEvent extends BaseEvent {
  type: typeof ValueTransferEventTypes.ValueTransferStateChanged
  payload: {
    record: ValueTransferRecord
    previousState?: TransactionState | null
  }
}

export interface CashMintedEvent extends BaseEvent {
  type: typeof ValueTransferEventTypes.CashMinted
}
