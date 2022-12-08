import type { AutoAcceptValueTransfer } from './ValueTransferAutoAcceptType'

export interface ValueTransferConfigOptions {
  lockTransactions?: boolean
  witnessDid?: string
  issuerDids?: string[]
  autoAcceptPaymentOffer?: AutoAcceptValueTransfer
  autoAcceptOfferedPaymentRequest?: AutoAcceptValueTransfer
  autoAcceptPaymentRequest?: AutoAcceptValueTransfer
}

export class ValueTransferConfig {
  public lockTransactions?: boolean
  public witnessDid?: string
  public issuerDids?: string[]
  public autoAcceptPaymentOffer?: AutoAcceptValueTransfer
  public autoAcceptOfferedPaymentRequest?: AutoAcceptValueTransfer
  public autoAcceptPaymentRequest?: AutoAcceptValueTransfer

  public constructor(options: ValueTransferConfigOptions) {
    this.lockTransactions = options.lockTransactions
    this.witnessDid = options.witnessDid
    this.issuerDids = options.issuerDids
    this.autoAcceptPaymentOffer = options.autoAcceptPaymentOffer
    this.autoAcceptOfferedPaymentRequest = options.autoAcceptOfferedPaymentRequest
    this.autoAcceptPaymentRequest = options.autoAcceptPaymentRequest
  }
}
