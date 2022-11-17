/* eslint-disable @typescript-eslint/no-non-null-assertion */
import type { SubjectMessage } from '../../../../../../tests/transport/SubjectInboundTransport'

import { Subject } from 'rxjs'

import { SubjectInboundTransport } from '../../../../../../tests/transport/SubjectInboundTransport'
import { SubjectOutboundTransport } from '../../../../../../tests/transport/SubjectOutboundTransport'
import { getAgentOptions, waitForBasicMessage } from '../../../../tests/helpers'
import { Agent } from '../../../agent/Agent'
import { HandshakeProtocol } from '../../connections'
import { MediatorPickupStrategy } from '../MediatorPickupStrategy'

const recipientOptions = getAgentOptions('Mediation: Recipient Pickup', {
  autoAcceptConnections: true,
  indyLedgers: [],
})
const mediatorOptions = getAgentOptions('Mediation: Mediator Pickup', {
  autoAcceptConnections: true,
  endpoints: ['rxjs:mediator'],
  indyLedgers: [],
})

describe('E2E Pick Up protocol', () => {
  let recipientAgent: Agent
  let mediatorAgent: Agent

  afterEach(async () => {
    await recipientAgent?.shutdown()
    await recipientAgent?.wallet.delete()
    await mediatorAgent?.shutdown()
    await mediatorAgent?.wallet.delete()
  })

  test('E2E Pick Up V1 protocol', async () => {
    const mediatorMessages = new Subject<SubjectMessage>()

    const subjectMap = {
      'rxjs:mediator': mediatorMessages,
    }

    // Initialize mediatorReceived message
    mediatorAgent = new Agent(mediatorOptions)
    mediatorAgent.registerOutboundTransport(new SubjectOutboundTransport(subjectMap))
    mediatorAgent.registerInboundTransport(new SubjectInboundTransport(mediatorMessages))
    await mediatorAgent.initialize()

    // Create connection to use for recipient
    const mediatorOutOfBandRecord = await mediatorAgent.oob.createInvitation({
      label: 'mediator invitation',
      handshake: true,
      handshakeProtocols: [HandshakeProtocol.DidExchange],
    })

    // Initialize recipient
    recipientAgent = new Agent(recipientOptions)
    recipientAgent.registerOutboundTransport(new SubjectOutboundTransport(subjectMap))
    await recipientAgent.initialize()

    // Connect
    const mediatorInvitation = mediatorOutOfBandRecord.outOfBandInvitation

    const result = await recipientAgent.oob.receiveInvitationFromUrl(
      mediatorInvitation.toUrl({ domain: 'https://example.com/ssi' })
    )
    let recipientMediatorConnection = result!.connectionRecord

    recipientMediatorConnection = await recipientAgent.connections.returnWhenIsConnected(
      recipientMediatorConnection!.id
    )

    let [mediatorRecipientConnection] = await mediatorAgent.connections.findAllByOutOfBandId(mediatorOutOfBandRecord.id)

    mediatorRecipientConnection = await mediatorAgent.connections.returnWhenIsConnected(mediatorRecipientConnection!.id)

    const message = 'hello pickup V1'
    await mediatorAgent.basicMessages.sendMessage(mediatorRecipientConnection.id, message)

    await recipientAgent.mediationRecipient.pickupMessages(recipientMediatorConnection)

    const basicMessage = await waitForBasicMessage(recipientAgent, {
      content: message,
    })

    expect(basicMessage.content).toBe(message)
  })

  test('E2E Pick Up V2 protocol', async () => {
    const mediatorMessages = new Subject<SubjectMessage>()

    const subjectMap = {
      'rxjs:mediator': mediatorMessages,
    }

    // Initialize mediatorReceived message
    mediatorAgent = new Agent(mediatorOptions)
    mediatorAgent.registerOutboundTransport(new SubjectOutboundTransport(subjectMap))
    mediatorAgent.registerInboundTransport(new SubjectInboundTransport(mediatorMessages))
    await mediatorAgent.initialize()

    // Create connection to use for recipient
    const mediatorOutOfBandRecord = await mediatorAgent.oob.createInvitation({
      label: 'mediator invitation',
      handshake: true,
      handshakeProtocols: [HandshakeProtocol.DidExchange],
    })

    // Initialize recipient
    recipientAgent = new Agent(recipientOptions)
    recipientAgent.registerOutboundTransport(new SubjectOutboundTransport(subjectMap))
    await recipientAgent.initialize()

    // Connect
    const mediatorInvitation = mediatorOutOfBandRecord.outOfBandInvitation

    const result = await recipientAgent.oob.receiveInvitationFromUrl(
      mediatorInvitation.toUrl({ domain: 'https://example.com/ssi' })
    )
    let recipientMediatorConnection = result!.connectionRecord

    recipientMediatorConnection = await recipientAgent.connections.returnWhenIsConnected(
      recipientMediatorConnection!.id
    )

    let [mediatorRecipientConnection] = await mediatorAgent.connections.findAllByOutOfBandId(mediatorOutOfBandRecord.id)

    mediatorRecipientConnection = await mediatorAgent.connections.returnWhenIsConnected(mediatorRecipientConnection!.id)

    const message = 'hello pickup V2'
    await mediatorAgent.basicMessages.sendMessage(mediatorRecipientConnection.id, message)

    await recipientAgent.mediationRecipient.pickupMessages(recipientMediatorConnection, MediatorPickupStrategy.PickUpV2)

    const basicMessage = await waitForBasicMessage(recipientAgent, {
      content: message,
    })

    expect(basicMessage.content).toBe(message)
  })
})
