import { injectable } from '@aries-framework/core'

import { AutoAcceptValueTransfer } from './ValueTransferAutoAcceptType'
import { ValueTransferConfig } from './ValueTransferConfig'

/**
 * This class handles all the automation with all the messages in the value transfer protocol
 * Every function returns `true` if it should automate the flow and `false` if not
 */
@injectable()
export class ValueTransferResponseCoordinator {
  private config: ValueTransferConfig

  public constructor(config: ValueTransferConfig) {
    this.config = config
  }

  /**
   * Checks whether it should automatically respond to a request
   */
  public shouldAutoRespondToRequest() {
    const autoAccept = this.config.autoAcceptPaymentRequest ?? AutoAcceptValueTransfer.Never

    return autoAccept === AutoAcceptValueTransfer.Always
  }

  /**
   * Checks whether it should automatically respond to a offer
   */
  public shouldAutoRespondToOffer() {
    const autoAccept = this.config.autoAcceptPaymentOffer ?? AutoAcceptValueTransfer.Never

    return autoAccept === AutoAcceptValueTransfer.Always
  }

  /**
   * Checks whether it should automatically respond to a request send in respponse on offer
   */
  public shouldAutoRespondToOfferedRequest() {
    const autoAccept = this.config.autoAcceptOfferedPaymentRequest ?? AutoAcceptValueTransfer.Never

    return autoAccept === AutoAcceptValueTransfer.Always
  }
}
