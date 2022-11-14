import type { ConnectionRecord } from '../../modules/connections'
import type { AgentMessage } from '../AgentMessage'
import type { PackMessageParams } from '../EnvelopeService'
import type { TransportSession } from '../TransportService'

export class DummyTransportSession implements TransportSession {
  public id: string
  public readonly type = 'http'
  public keys?: PackMessageParams
  public inboundMessage?: AgentMessage
  public connection?: ConnectionRecord

  public constructor(id: string) {
    this.id = id
  }

  public send(): Promise<void> {
    throw new Error('Method not implemented.')
  }

  public close(): Promise<void> {
    throw new Error('Method not implemented.')
  }
}
