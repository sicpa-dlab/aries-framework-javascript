import { Getter, ValueTransferMessage, ValueTransferDelta } from '@sicpa-dlab/value-transfer-protocol-ts'
import { EventEmitter } from '../../../agent/EventEmitter'
import { ConnectionService } from '../../connections/services/ConnectionService'
import { DidService } from '../../dids/services/DidService'
import { ValueTransferRepository } from '../repository/ValueTransferRepository'
import { ValueTransferStateRepository } from '../repository/ValueTransferStateRepository'
import { ValueTransferCryptoService } from '../services/ValueTransferCryptoService'
import { ValueTransferStateService } from '../services/ValueTransferStateService'
import { getAgentConfig, mockFunction } from '../../../../tests/helpers';
import { ValueTransferRole } from '../ValueTransferRole'
import { ValueTransferService } from '../services/ValueTransferService'
import { AriesFrameworkError } from '../../../error'
import { DidRecord } from '../../dids/repository/DidRecord'
import { DidDocumentRole } from '../../dids/domain/DidDocumentRole'
import { WellKnownService } from '../../well-known/services/WellKnownService'
import { ValueTransferGetterService } from '../services/ValueTransferGetterService'
import { RequestAcceptedWitnessedMessage } from '../messages/RequestAcceptedWitnessedMessage'
import { ValueTransferRecord } from '../repository/ValueTransferRecord'
import { ValueTransferState } from '../ValueTransferState'
import { InboundMessageContext } from '../../../agent/models/InboundMessageContext'

// Mock classes
jest.mock(`@sicpa-dlab/value-transfer-protocol-ts`)
jest.mock('../repository/ValueTransferRepository')
jest.mock('../repository/ValueTransferStateRepository')
jest.mock('../services/ValueTransferCryptoService')
jest.mock('../services/ValueTransferStateService')
jest.mock('../services/ValueTransferService')
jest.mock('../repository/WitnessStateRepository')
jest.mock('../../dids/services/DidService')
jest.mock('../../connections/services/ConnectionService')

// Mock typed object
const ValueTransferRepositoryMock = ValueTransferRepository as jest.Mock<ValueTransferRepository>
const ValueTransferStateRepositoryMock = ValueTransferStateRepository as jest.Mock<ValueTransferStateRepository>
const ValueTransferCryptoServiceMock = ValueTransferCryptoService as jest.Mock<ValueTransferCryptoService>
const ValueTransferStateServiceMock = ValueTransferStateService as jest.Mock<ValueTransferStateService>
const DidServiceMock = DidService as jest.Mock<DidService>
const ConnectionServiceMock = ConnectionService as jest.Mock<ConnectionService>
const ValueTransferServiceMock = ValueTransferService as jest.Mock<ValueTransferService>
const GetterMock: jest.Mock<Getter> = Getter as unknown as jest.Mock<Getter>
describe('ValueTransferService', () => {
  let valueTransferRepository: ValueTransferRepository
  let valueTransferStateRepository: ValueTransferStateRepository
  let valueTransferGetterService: ValueTransferGetterService
  let valueTransferCryptoService: ValueTransferCryptoService
  let valueTransferStateService: ValueTransferStateService
  let valueTransferService: ValueTransferService
  let connectionService: ConnectionService
  let didService: DidService
  let wellKnownService: WellKnownService
  let eventEmitter: EventEmitter

  beforeEach(() => {
    valueTransferRepository = new ValueTransferRepositoryMock()
    valueTransferStateRepository = new ValueTransferStateRepositoryMock()
    valueTransferService = new ValueTransferServiceMock()
    valueTransferCryptoService = new ValueTransferCryptoServiceMock()
    valueTransferStateService = new ValueTransferStateServiceMock()
    didService = new DidServiceMock()
    connectionService = new ConnectionServiceMock()
    wellKnownService = new WellKnownService()

    let config = getAgentConfig('ValueTransferGetterServiceTest')
    let eventEmitter = new EventEmitter(config)

    valueTransferGetterService = new ValueTransferGetterService(
      valueTransferRepository,
      valueTransferStateRepository,
      valueTransferService,
      valueTransferCryptoService,
      valueTransferStateService,
      didService,
      wellKnownService,
      connectionService,
      eventEmitter
    )
  })

  describe('createRequest', () => {
    it('should correctly createRequest', async () => {
      let witnessDid = 'did:peer:0z6MkhuEV8mevESoVDVVtnznFfc6MHGwSwhwqM9FSooVntCEu'
      let giverDid = 'did:peer:0z6Mkn2R14AfjBZjhxAqKNKT9coYWkxUM2m96egVqZAzuQX1H'

      let mockGetterDidRecord = new DidRecord({
        id: 'did:peer:1zQmYtsAsQhwEjjFkcJ2zpbHuE1ESuDkTEwm6KQd65HRNtAq',
        role: DidDocumentRole.Created,
        isPublic: false,
      })

      mockFunction(didService.createDID).mockReturnValue(Promise.resolve(mockGetterDidRecord))
      await valueTransferGetterService.createRequest(4, witnessDid, giverDid, false)
    })
  })

  // TODO: Create error in ValueTransferGetterService describing this case
  it('should throw ValueTransferError on createRequest (witnessDid is giverDid)', async () => {
    let witnessDid = 'did:peer:0z6MkhuEV8mevESoVDVVtnznFfc6MHGwSwhwqM9FSooVntCEu'
    let giverDid = 'did:peer:0z6MkhuEV8mevESoVDVVtnznFfc6MHGwSwhwqM9FSooVntCEu'

    let mockGetterDidRecord = new DidRecord({
      id: 'did:peer:1zQmYtsAsQhwEjjFkcJ2zpbHuE1ESuDkTEwm6KQd65HRNtAq',
      role: DidDocumentRole.Created,
      isPublic: false,
    })

    mockFunction(didService.createDID).mockReturnValue(Promise.resolve(mockGetterDidRecord))
    await valueTransferGetterService.createRequest(4, witnessDid, giverDid, false)
  })

  // TODO: specify error message in error
  it('should throw AriesFrameworkError on createRequest (amount <= 0)', async () => {
    let witnessDid = 'did:peer:0z6MkhuEV8mevESoVDVVtnznFfc6MHGwSwhwqM9FSooVntCEu'
    let giverDid = 'did:peer:0z6Mkn2R14AfjBZjhxAqKNKT9coYWkxUM2m96egVqZAzuQX1H'

    let mockGetterDidRecord = new DidRecord({
      id: 'did:peer:1zQmYtsAsQhwEjjFkcJ2zpbHuE1ESuDkTEwm6KQd65HRNtAq',
      role: DidDocumentRole.Created,
      isPublic: false,
    })

    mockFunction(didService.createDID).mockReturnValue(Promise.resolve(mockGetterDidRecord))

    expect(async () => {
      await valueTransferGetterService.createRequest(0, witnessDid, giverDid, false)
    }).rejects.toThrowError(new AriesFrameworkError(`VTP: Failed to create Payment Request: `))
  })

  describe('processRequestAcceptanceWitnessed', () => {
    it('should correctly processRequestAcceptanceWitnessed', async () => {
      let message = new RequestAcceptedWitnessedMessage({
        attachments: [
          {
            id: 'vtp',
            data: {
              base64:
                'eyJzY2hlbWFfaWQiOiJhYWEiLCJjcmVkX2RlZl9pZCI6IlRoN01wVGFSWlZSWW5QaWFiZHM4MVk6MzpDTDoxNzpUQUciLCJub25jZSI6Im5vbmNlIiwia2V5X2NvcnJlY3RuZXNzX3Byb29mIjp7fX0',
            },
          },
        ],
      })
      let msgContext = new InboundMessageContext<RequestAcceptedWitnessedMessage>(message)
      let mockValueTransferRecord = new ValueTransferRecord({
        id: 'b27a8512-de1f-4913-8bba-f566e25149b5',
        role: ValueTransferRole.Getter,
        state: ValueTransferState.RequestSent,
        threadId: '4f7df1a2-3313-49e2-b807-00b9d017514f',

        getter: { did: 'did:peer:0z6MkfJRtTAeMejSCZejdLPSDvLtfeNy34F24WSkwLRD4uPQV' },
        giver: { did: 'did:peer:0z6Mkn2R14AfjBZjhxAqKNKT9coYWkxUM2m96egVqZAzuQX1H' },
        witness: { did: 'did:peer:0z6MkhuEV8mevESoVDVVtnznFfc6MHGwSwhwqM9FSooVntCEu' },
        valueTransferMessage: new ValueTransferMessage(),
      })
      mockFunction(valueTransferRepository.getByThread).mockReturnValue(Promise.resolve(mockValueTransferRecord))
      await valueTransferGetterService.processRequestAcceptanceWitnessed(msgContext)
    })

    // TODO: Check if empty getter will count as set getter
    it('should throw ValueTransferError on processRequestAcceptanceWitnessed (getter not set)', async () => {
      let message = new RequestAcceptedWitnessedMessage({
        attachments: [
          {
            id: 'vtp',
            data: {
              base64:
                'eyJzY2hlbWFfaWQiOiJhYWEiLCJjcmVkX2RlZl9pZCI6IlRoN01wVGFSWlZSWW5QaWFiZHM4MVk6MzpDTDoxNzpUQUciLCJub25jZSI6Im5vbmNlIiwia2V5X2NvcnJlY3RuZXNzX3Byb29mIjp7fX0',
            },
          },
        ],
      })
      let msgContext = new InboundMessageContext<RequestAcceptedWitnessedMessage>(message)
      let mockValueTransferRecord = new ValueTransferRecord({
        id: 'b27a8512-de1f-4913-8bba-f566e25149b5',
        role: ValueTransferRole.Getter,
        state: ValueTransferState.RequestSent,
        threadId: '4f7df1a2-3313-49e2-b807-00b9d017514f',

        getter: { did: 'getter' },
        giver: { did: 'did:peer:0z6Mkn2R14AfjBZjhxAqKNKT9coYWkxUM2m96egVqZAzuQX1H' },
        witness: { did: 'did:peer:0z6MkhuEV8mevESoVDVVtnznFfc6MHGwSwhwqM9FSooVntCEu' },
        valueTransferMessage: new ValueTransferMessage(),
      });
      (GetterMock.prototype.acceptCache).mockReturnValue(Promise.resolve({message: new ValueTransferMessage(), delta: new ValueTransferDelta()}))
      mockFunction(valueTransferRepository.getByThread).mockReturnValue(Promise.resolve(mockValueTransferRecord))
      await valueTransferGetterService.processRequestAcceptanceWitnessed(msgContext)
    })
  })
})
