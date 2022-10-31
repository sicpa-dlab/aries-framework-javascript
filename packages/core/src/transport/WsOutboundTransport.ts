import type { Agent } from '../agent/Agent'
import type { AgentMessageReceivedEvent } from '../agent/Events'
import type { Logger } from '../logger'
import type { OutboundPackage } from '../types'
import type { OutboundTransport } from './OutboundTransport'
import type { OutboundWebSocketClosedEvent, OutboundWebSocketOpenedEvent } from './TransportEventTypes'
import type WebSocket from 'ws'

import { AgentConfig } from '../agent/AgentConfig'
import { EventEmitter } from '../agent/EventEmitter'
import { AgentEventTypes } from '../agent/Events'
import { AriesFrameworkError } from '../error/AriesFrameworkError'
import { LogContexts } from '../logger'
import { isValidJweStructure, JsonEncoder } from '../utils'
import { uuid } from '../utils/uuid'

import { TransportEventTypes } from './TransportEventTypes'

export class WsOutboundTransport implements OutboundTransport {
  private transportTable: Map<string, WebSocket> = new Map<string, WebSocket>()
  private agent!: Agent
  private logger!: Logger
  private eventEmitter!: EventEmitter
  private WebSocketClass!: typeof WebSocket
  public supportedSchemes = ['ws', 'wss']

  public async start(agent: Agent): Promise<void> {
    this.agent = agent
    const agentConfig = agent.dependencyManager.resolve(AgentConfig)

    this.logger = agentConfig.logger.createContextLogger(LogContexts.WsOutboundTransport.context)
    this.eventEmitter = agent.dependencyManager.resolve(EventEmitter)
    this.logger.debug('Starting WS outbound transport')
    this.WebSocketClass = agentConfig.agentDependencies.WebSocketClass
  }

  public async stop() {
    this.logger.debug('Stopping WS outbound transport')
    this.transportTable.forEach((socket) => {
      socket.removeEventListener('message', this.handleMessageEvent)
      socket.close()
    })
  }

  public async sendMessage(outboundPackage: OutboundPackage) {
    const { payload, recipientDid, endpoint, connectionId } = outboundPackage
    this.logger.debug(`Sending outbound message to endpoint '${endpoint}' over WebSocket transport.`)

    if (!endpoint) {
      throw new AriesFrameworkError("Missing connection or endpoint. I don't know how and where to send the message.")
    }

    const socketMediator = recipientDid
      ? await this.agent.mediationRecipient.findGrantedMediatorByDid(recipientDid)
      : null

    const socket = await this.resolveSocket({
      socketId: endpoint,
      mediationDid: socketMediator?.did,
      endpoint,
      connectionId,
    })
    
    const wrappedMessage = {
      messageId: uuid(),
      message: { event: 'message', data: payload },
    }
    socket.send(JSON.stringify(wrappedMessage))
  }

  private async resolveSocket({
    socketId,
    endpoint,
    mediationDid,
    connectionId,
  }: {
    socketId: string
    endpoint?: string
    mediationDid?: string
    connectionId?: string
  }) {
    // If we already have a socket connection use it
    let socket = this.transportTable.get(socketId)

    if (!socket) {
      if (!endpoint) {
        throw new AriesFrameworkError(`Missing endpoint. I don't know how and where to send the message.`)
      }
      socket = await this.createSocketConnection({
        endpoint,
        socketId,
        mediationDid,
        connectionId,
      })
      this.transportTable.set(socketId, socket)
      this.listenOnWebSocketMessages(socket)
    }

    if (socket.readyState !== this.WebSocketClass.OPEN) {
      throw new AriesFrameworkError('Socket is not open.')
    }

    return socket
  }

  // NOTE: Because this method is passed to the event handler this must be a lambda method
  // so 'this' is scoped to the 'WsOutboundTransport' class instance
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private handleMessageEvent = (event: any) => {
    this.logger.trace('WebSocket message event received.', { url: event.target.url })
    const message = JSON.parse(event.data)
    if (!message?.messageId || !message?.message) return
    const payload = JSON.parse(message.message)
    if (!isValidJweStructure(payload)) {
      throw new Error(
        `Received a response from the other agent but the structure of the incoming message is not a DIDComm message: ${payload}`
      )
    }
    this.logger.debug('Payload received from mediator:', payload)
    this.eventEmitter.emit<AgentMessageReceivedEvent>({
      type: AgentEventTypes.AgentMessageReceived,
      payload: {
        message: payload,
      },
    })
    event.target?.send(JSON.stringify({ messageId: message.messageId, status: 'ok' }))
  }

  private listenOnWebSocketMessages(socket: WebSocket) {
    socket.addEventListener('message', this.handleMessageEvent)
  }

  private createSocketConnection({
    socketId,
    endpoint,
    mediationDid,
    connectionId,
  }: {
    socketId: string
    endpoint: string
    mediationDid?: string
    connectionId?: string
  }): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
      this.logger.debug(`Connecting to WebSocket ${endpoint}`, {
        logId: LogContexts.WsOutboundTransport.connecting,
      })
      const socket = new this.WebSocketClass(endpoint, [], { headers: { 'agent-did': mediationDid } })

      socket.onopen = () => {
        this.logger.debug(`Successfully connected to WebSocket ${endpoint}`, {
          logId: LogContexts.WsOutboundTransport.connected,
        })

        this.eventEmitter.emit<OutboundWebSocketOpenedEvent>({
          type: TransportEventTypes.OutboundWebSocketOpenedEvent,
          payload: {
            socketId,
            did: mediationDid,
            connectionId: connectionId,
          },
        })

        resolve(socket)
      }

      socket.onerror = (error) => {
        this.logger.error(`Error while connecting to WebSocket ${endpoint}`, {
          logId: LogContexts.WsOutboundTransport.connectError,
          error,
        })
        reject(error)
      }

      socket.onclose = async (event: WebSocket.CloseEvent) => {
        this.logger.warn(`WebSocket closing to ${endpoint}`, {
          logId: LogContexts.WsOutboundTransport.closing,
          event,
        })
      }
      socket.onclose = async () => {
        this.logger.debug(`WebSocket closing to ${endpoint}`, {
          logId: LogContexts.WsOutboundTransport.closing,
        })
        socket.removeEventListener('message', this.handleMessageEvent)
        this.transportTable.delete(socketId)

        this.eventEmitter.emit<OutboundWebSocketClosedEvent>({
          type: TransportEventTypes.OutboundWebSocketClosedEvent,
          payload: {
            socketId,
            did: mediationDid,
            connectionId: connectionId,
          },
        })
      }
    })
  }
}
