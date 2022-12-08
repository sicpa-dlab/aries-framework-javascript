/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Logger } from '@aries-framework/core'
import type { VtpTransportInterface } from '@sicpa-dlab/value-transfer-protocol-ts'

import {
  AgentConfig,
  MessageSender,
  SendingMessageType,
  DIDCommV2Message,
  DidResolverService,
  injectable,
  JsonEncoder,
} from '@aries-framework/core'

@injectable()
export class ValueTransferTransportService implements VtpTransportInterface {
  private readonly logger: Logger
  private didResolverService: DidResolverService
  private messageSender: MessageSender

  public constructor(config: AgentConfig, messageSender: MessageSender, didResolverService: DidResolverService) {
    this.logger = config.logger.createContextLogger('VTP-TransportService')
    this.messageSender = messageSender
    this.didResolverService = didResolverService
  }

  public async send(message: any, args?: any): Promise<void> {
    this.logger.info(`Sending VTP message with type '${message.type}' to DID ${message?.to}`)
    this.logger.debug(` Message: ${JsonEncoder.toString(message)}`)
    const didComMessage = new DIDCommV2Message({ ...message })
    const sendingMessageType = didComMessage.to ? SendingMessageType.Encrypted : SendingMessageType.Signed
    await this.messageSender.sendDIDCommV2Message(didComMessage, sendingMessageType, undefined, args?.mayProxyVia)
    this.logger.info('message sent!')
  }
}
