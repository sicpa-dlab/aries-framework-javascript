import { createVerifiableNotes, Giver, ValueTransfer } from '@sicpa-dlab/value-transfer-protocol-ts'
import { AgentConfig } from 'packages/core/src/agent/AgentConfig'
import { EventEmitter } from '../../../agent/EventEmitter'
import { MessageSender } from '../../../agent/MessageSender'
import { ConnectionService } from '../../connections/services/ConnectionService'
import { DidService } from '../../dids/services/DidService'
import { ValueTransferRepository } from '../repository/ValueTransferRepository'
import { ValueTransferStateRepository } from '../repository/ValueTransferStateRepository'
import { WitnessStateRepository } from '../repository/WitnessStateRepository'
import { ValueTransferCryptoService } from '../services/ValueTransferCryptoService'
import { ValueTransferStateService } from '../services/ValueTransferStateService'
import { getAgentConfig, mockFunction } from '../../../../tests/helpers'
import { ValueTransferConfig } from '../../../types'
import { ValueTransferRole } from '../ValueTransferRole'
import { ValueTransferService } from '../services/ValueTransferService'
import { AriesFrameworkError } from '../../../error'
import { DidRecord } from '../../dids/repository/DidRecord'
import { DidDocumentRole } from '../../dids/domain/DidDocumentRole'

// Mock classes
jest.mock('../repository/ValueTransferRepository')
jest.mock('../repository/ValueTransferStateRepository')
jest.mock('../services/ValueTransferCryptoService')
jest.mock('../services/ValueTransferStateService')
jest.mock('../repository/WitnessStateRepository')
jest.mock('../../dids/services/DidService')
jest.mock('../../connections/services/ConnectionService')

// Mock typed object
const ValueTransferRepositoryMock = ValueTransferRepository as jest.Mock<ValueTransferRepository>
const ValueTransferStateRepositoryMock = ValueTransferStateRepository as jest.Mock<ValueTransferStateRepository>
const ValueTransferCryptoServiceMock = ValueTransferCryptoService as jest.Mock<ValueTransferCryptoService>
const ValueTransferStateServiceMock = ValueTransferStateService as jest.Mock<ValueTransferStateService>
const WitnessStateRepositoryMock = WitnessStateRepository as jest.Mock<WitnessStateRepository>
const DidServiceMock = DidService as jest.Mock<DidService>
const ConnectionServiceMock = ConnectionService as jest.Mock<ConnectionService>
const MessageSenderMock = MessageSender as jest.Mock<MessageSender>
describe('ValueTransferService', () => {
  let config: AgentConfig
  let valueTransfer: ValueTransfer
  let valueTransferRepository: ValueTransferRepository
  let valueTransferStateRepository: ValueTransferStateRepository
  let valueTransferCryptoService: ValueTransferCryptoService
  let valueTransferStateService: ValueTransferStateService
  let witnessStateRepository: WitnessStateRepository
  let didService: DidService
  let connectionService: ConnectionService
  let eventEmitter: EventEmitter
  let messageSender: MessageSender
  let valueTransferConfig: ValueTransferConfig
  let valueTransferService: ValueTransferService

  beforeEach(() => {
    valueTransferRepository = new ValueTransferRepositoryMock()
    valueTransferStateRepository = new ValueTransferStateRepositoryMock()
    valueTransferCryptoService = new ValueTransferCryptoServiceMock()
    valueTransferStateService = new ValueTransferStateServiceMock()
    witnessStateRepository = new WitnessStateRepositoryMock()
    didService = new DidServiceMock()
    connectionService = new ConnectionServiceMock()

    let config = getAgentConfig('ValueTransferServiceTest')
    let eventEmitter = new EventEmitter(config)

    let messageSender = new MessageSenderMock()
    valueTransferService = new ValueTransferService(
      config,
      valueTransferRepository,
      valueTransferStateRepository,
      valueTransferCryptoService,
      valueTransferStateService,
      witnessStateRepository,
      didService,
      connectionService,
      eventEmitter,
      messageSender
    )
  })

  describe('initState', () => {
    it('should correctly initState for Giver/Getter', async () => {
      valueTransferConfig = {
        role: ValueTransferRole.Giver,
        witnessTransport: 'nfc',
        verifiableNotes: createVerifiableNotes(10),
      }

      const repositorySaveSpy = jest.spyOn(valueTransferRepository, 'save')
      await valueTransferService.initState(valueTransferConfig)
      expect(repositorySaveSpy).toBeCalled
    })

    it('should correctly initState for Giver/Getter without verifiableNotes', async () => {
      valueTransferConfig = {
        role: ValueTransferRole.Giver,
        witnessTransport: 'nfc',
        verifiableNotes: [],
      }

      const repositorySaveSpy = jest.spyOn(valueTransferRepository, 'save')
      await valueTransferService.initState(valueTransferConfig)
      expect(repositorySaveSpy).toBeCalled
    })

    it('should throw AriesFrameworkError in initState for Witness without publicDid', async () => {
      valueTransferConfig = {
        role: ValueTransferRole.Witness,
        getterTransport: 'ipc',
        giverTransport: 'nfc',
      }

      expect(async () => {
        await valueTransferService.initState(valueTransferConfig)
      }).rejects.toThrowError(
        new AriesFrameworkError('Witness public DID not found. Please set `publicDidSeed` field in the agent config.')
      )
    })

    it('should correctly initState for Witness', async () => {
      valueTransferConfig = {
        role: ValueTransferRole.Witness,
        getterTransport: 'ipc',
        giverTransport: 'nfc',
      }

      let mockDidRecord = new DidRecord({
        id: 'did:peer:1zQmYtsAsQhwEjjFkcJ2zpbHuE1ESuDkTEwm6KQd65HRNtAq',
        role: DidDocumentRole.Created,
        isPublic: true,
      })

      const repositorySaveSpy = jest.spyOn(valueTransferRepository, 'save')
      mockFunction(didService.findPublicDid).mockReturnValue(Promise.resolve(mockDidRecord))
      await valueTransferService.initState(valueTransferConfig)
      expect(repositorySaveSpy).toBeCalled
    })
  })
})
