import type { ServiceDecorator } from '../decorators/service/ServiceDecorator'
import type { ReturnRouteTypes } from '../decorators/transport/TransportDecorator'
import type { DIDCommMessageVersion } from './didcomm/types'

export interface AgentMessage {
  readonly type: string

  get version(): DIDCommMessageVersion
  get id(): string
  get sender(): string | undefined
  get threadId(): string | undefined

  serviceDecorator(): ServiceDecorator | undefined

  toJSON(params?: { useLegacyDidSovPrefix?: boolean }): Record<string, unknown>

  hasAnyReturnRoute(): boolean

  hasReturnRouting(threadId?: string): boolean

  setReturnRouting(type: ReturnRouteTypes, thread?: string): void

  setThread(options: { threadId: string | undefined }): void
}
