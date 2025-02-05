import type { ConnectionRecord } from '../modules/connections'
import type { ResolvedDidCommService } from '../modules/didcomm'
import type { Key } from '../modules/dids/domain/Key'
import type { OutOfBandRecord } from '../modules/oob/repository'
import type { OutboundPlainMessage, OutboundSignedMessage, OutboundMessage, OutboundServiceMessage } from '../types'
import type { DIDCommMessage } from './didcomm'

export function createOutboundMessage<T extends DIDCommMessage = DIDCommMessage>(
  connection: ConnectionRecord,
  payload: T,
  outOfBand?: OutOfBandRecord
): OutboundMessage<T> {
  return {
    connection,
    outOfBand,
    payload,
  }
}

export function createOutboundSignedMessage<T extends DIDCommMessage = DIDCommMessage>(
  payload: T,
  from: string
): OutboundSignedMessage<T> {
  return {
    payload,
    from,
  }
}

export function createOutboundPlainMessage<T extends DIDCommMessage = DIDCommMessage>(
  payload: T
): OutboundPlainMessage<T> {
  return {
    payload,
  }
}

export function createOutboundServiceMessage<T extends DIDCommMessage = DIDCommMessage>(options: {
  payload: T
  service: ResolvedDidCommService
  senderKey: Key
}): OutboundServiceMessage<T> {
  return options
}

export function isOutboundServiceMessage(
  message: OutboundMessage | OutboundServiceMessage
): message is OutboundServiceMessage {
  const service = (message as OutboundServiceMessage).service

  return service !== undefined
}
