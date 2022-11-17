/* eslint-disable @typescript-eslint/no-non-null-assertion */
import type { SubjectMessage } from '../../../tests/transport/SubjectInboundTransport'
import type { OutOfBandInvitation } from '../src/modules/oob/messages'

import { Subject } from 'rxjs'

import { SubjectInboundTransport } from '../../../tests/transport/SubjectInboundTransport'
import { SubjectOutboundTransport } from '../../../tests/transport/SubjectOutboundTransport'
import { Agent } from '../src/agent/Agent'
import { DidExchangeState, HandshakeProtocol } from '../src/modules/connections'
import { MediationState, MediatorPickupStrategy } from '../src/modules/routing'

import { getAgentOptions, waitForBasicMessage } from './helpers'

const faberAgentOptions = getAgentOptions('OOB mediation provision - Faber Agent', {
  endpoints: ['rxjs:faber'],
})
const aliceAgentOptions = getAgentOptions('OOB mediation provision - Alice Recipient Agent', {
  endpoints: ['rxjs:alice'],
  mediatorPickupStrategy: MediatorPickupStrategy.PickUpV1,
})
const mediatorAgentOptions = getAgentOptions('OOB mediation provision - Mediator Agent', {
  endpoints: ['rxjs:mediator'],
  autoAcceptMediationRequests: true,
})

describe('out of band with mediation set up with provision method', () => {
  const makeConnectionConfig = {
    goal: 'To make a connection',
    goalCode: 'p2p-messaging',
    label: 'Faber College',
    handshake: true,
    multiUseInvitation: false,
  }

  let faberAgent: Agent
  let aliceAgent: Agent
  let mediatorAgent: Agent

  let mediatorOutOfBandInvitation: OutOfBandInvitation

  beforeAll(async () => {
    const faberMessages = new Subject<SubjectMessage>()
    const aliceMessages = new Subject<SubjectMessage>()
    const mediatorMessages = new Subject<SubjectMessage>()
    const subjectMap = {
      'rxjs:faber': faberMessages,
      'rxjs:alice': aliceMessages,
      'rxjs:mediator': mediatorMessages,
    }

    mediatorAgent = new Agent(mediatorAgentOptions)
    mediatorAgent.registerInboundTransport(new SubjectInboundTransport(mediatorMessages))
    mediatorAgent.registerOutboundTransport(new SubjectOutboundTransport(subjectMap))
    await mediatorAgent.initialize()

    faberAgent = new Agent(faberAgentOptions)
    faberAgent.registerInboundTransport(new SubjectInboundTransport(faberMessages))
    faberAgent.registerOutboundTransport(new SubjectOutboundTransport(subjectMap))
    await faberAgent.initialize()

    aliceAgent = new Agent(aliceAgentOptions)
    aliceAgent.registerInboundTransport(new SubjectInboundTransport(aliceMessages))
    aliceAgent.registerOutboundTransport(new SubjectOutboundTransport(subjectMap))
    const mediationOutOfBandRecord = await mediatorAgent.oob.createInvitation(makeConnectionConfig)
    mediatorOutOfBandInvitation = mediationOutOfBandRecord.outOfBandInvitation

    await aliceAgent.initialize()
    let { connectionRecord } = await aliceAgent.oob.receiveInvitation(mediatorOutOfBandInvitation)
    connectionRecord = await aliceAgent.connections.returnWhenIsConnected(connectionRecord!.id)
    await aliceAgent.mediationRecipient.provision(connectionRecord!, mediatorOutOfBandInvitation)
    await aliceAgent.mediationRecipient.initialize()
  })

  afterAll(async () => {
    await faberAgent.shutdown()
    await faberAgent.wallet.delete()
    await aliceAgent.shutdown()
    await aliceAgent.wallet.delete()
    await mediatorAgent.shutdown()
    await mediatorAgent.wallet.delete()
  })

  test(`make a connection with ${HandshakeProtocol.DidExchange} on OOB invitation encoded in URL`, async () => {
    // Check if mediation between Alice and Mediator has been set
    const defaultMediator = await aliceAgent.mediationRecipient.findDefaultMediator()
    expect(defaultMediator).not.toBeNull()
    expect(defaultMediator?.state).toBe(MediationState.Granted)

    // Make a connection between Alice and Faber
    const outOfBandRecord = await faberAgent.oob.createInvitation(makeConnectionConfig)
    const { outOfBandInvitation } = outOfBandRecord
    const urlMessage = outOfBandInvitation.toUrl({ domain: 'http://example.com' })

    const result = await aliceAgent.oob.receiveInvitationFromUrl(urlMessage)

    let aliceFaberConnection = result!.connectionRecord
    aliceFaberConnection = await aliceAgent.connections.returnWhenIsConnected(aliceFaberConnection!.id)
    expect(aliceFaberConnection.state).toBe(DidExchangeState.Completed)

    let [faberAliceConnection] = await faberAgent.connections.findAllByOutOfBandId(outOfBandRecord.id)
    faberAliceConnection = await faberAgent.connections.returnWhenIsConnected(faberAliceConnection!.id)
    expect(faberAliceConnection.state).toBe(DidExchangeState.Completed)

    expect(aliceFaberConnection).toBeConnectedWith(faberAliceConnection)
    expect(faberAliceConnection).toBeConnectedWith(aliceFaberConnection)

    await aliceAgent.basicMessages.sendMessage(aliceFaberConnection.id, 'hello')
    const basicMessage = await waitForBasicMessage(faberAgent, {})

    expect(basicMessage.content).toBe('hello')

    // Test if we can call provision for the same out-of-band record, respectively connection
    const reusedOutOfBandRecord = await aliceAgent.oob.findByInvitationId(mediatorOutOfBandInvitation.id)
    const [reusedAliceMediatorConnection] = reusedOutOfBandRecord
      ? await aliceAgent.connections.findAllByOutOfBandId(reusedOutOfBandRecord.id)
      : []
    await aliceAgent.mediationRecipient.provision(reusedAliceMediatorConnection!, mediatorOutOfBandInvitation)
    const mediators = await aliceAgent.mediationRecipient.getMediators()
    expect(mediators).toHaveLength(1)
  })
})
