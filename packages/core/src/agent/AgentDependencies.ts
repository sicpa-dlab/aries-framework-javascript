import type { FileSystem } from '../storage/FileSystem'
import type didcomm from 'didcomm'
import type { EventEmitter } from 'events'
import type * as Indy from 'indy-sdk'
import type fetch from 'node-fetch'
import type WebSocket from 'ws'

export interface AgentDependencies {
  FileSystem: {
    new (): FileSystem
  }
  indy: typeof Indy
  EventEmitterClass: typeof EventEmitter
  fetch: typeof fetch
  WebSocketClass: typeof WebSocket
  // FIXME: reference to didcomm should be removed from agent dependencies and passed via implementation
  didcomm: typeof didcomm
}
