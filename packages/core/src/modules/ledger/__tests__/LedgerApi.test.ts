import type { AgentContext } from '../../../agent/context/AgentContext'
import type { IndyPoolConfig } from '../IndyPool'
import type { CredentialDefinitionTemplate } from '../services/IndyLedgerService'
import type * as Indy from 'indy-sdk'

import { getAgentConfig, getAgentContext, mockFunction, mockProperty } from '../../../../tests/helpers'
import { KeyProviderRegistry } from '../../../crypto/keys-provider'
import { AriesFrameworkError } from '../../../error/AriesFrameworkError'
import { getLegacySchemaId, getLegacyCredentialDefinitionId } from '../../../utils'
import { IndyWallet } from '../../../wallet/IndyWallet'
import { AnonCredsCredentialDefinitionRecord } from '../../indy/repository/AnonCredsCredentialDefinitionRecord'
import { AnonCredsCredentialDefinitionRepository } from '../../indy/repository/AnonCredsCredentialDefinitionRepository'
import { AnonCredsSchemaRecord } from '../../indy/repository/AnonCredsSchemaRecord'
import { AnonCredsSchemaRepository } from '../../indy/repository/AnonCredsSchemaRepository'
import { LedgerApi } from '../LedgerApi'
import { LedgerModuleConfig } from '../LedgerModuleConfig'
import { IndyLedgerService } from '../services/IndyLedgerService'

jest.mock('../services/IndyLedgerService')
const IndyLedgerServiceMock = IndyLedgerService as jest.Mock<IndyLedgerService>

jest.mock('../../indy/repository/AnonCredsCredentialDefinitionRepository')
const AnonCredsCredentialDefinitionRepositoryMock =
  AnonCredsCredentialDefinitionRepository as jest.Mock<AnonCredsCredentialDefinitionRepository>
jest.mock('../../indy/repository/AnonCredsSchemaRepository')
const AnonCredsSchemaRepositoryMock = AnonCredsSchemaRepository as jest.Mock<AnonCredsSchemaRepository>

const did = 'Y5bj4SjCiTM9PgeheKAiXx'

const schemaId = 'Y5bj4SjCiTM9PgeheKAiXx:2:awesomeSchema:1'

const schema: Indy.Schema = {
  id: schemaId,
  attrNames: ['hello', 'world'],
  name: 'awesomeSchema',
  version: '1',
  ver: '1',
  seqNo: 99,
}

const credentialDefinition = {
  schema: schema,
  tag: 'someTag',
  signatureType: 'CL',
  supportRevocation: true,
}

const schemaIdQualified = 'did:indy:sovrin:Y5bj4SjCiTM9PgeheKAiXx/anoncreds/v0/SCHEMA/awesomeSchema/1'
const schemaIdGenerated = getLegacySchemaId(did, schema.name, schema.version)
const qualifiedDidCred = 'did:indy:sovrin:Y5bj4SjCiTM9PgeheKAiXx/anoncreds/v0/CLAIM_DEF/99/someTag'

const credDef: Indy.CredDef = {
  id: qualifiedDidCred,
  schemaId: schemaIdQualified,
  type: 'CL',
  tag: 'someTag',
  value: {
    primary: credentialDefinition as Record<string, unknown>,
    revocation: true,
  },
  ver: '1',
}

const credentialDefinitionTemplate: Omit<CredentialDefinitionTemplate, 'signatureType'> = {
  schema: { ...schema, id: schemaIdQualified },
  tag: 'someTag',
  supportRevocation: true,
}

const revocRegDef: Indy.RevocRegDef = {
  id: 'abcde',
  revocDefType: 'CL_ACCUM',
  tag: 'someTag',
  credDefId: 'abcde',
  value: {
    issuanceType: 'ISSUANCE_BY_DEFAULT',
    maxCredNum: 3,
    tailsHash: 'abcde',
    tailsLocation: 'xyz',
    publicKeys: ['abcde', 'fghijk'],
  },
  ver: 'abcde',
}

const credentialDefinitionId = getLegacyCredentialDefinitionId(
  did,
  credentialDefinitionTemplate.schema.seqNo,
  credentialDefinitionTemplate.tag
)

const pools: IndyPoolConfig[] = [
  {
    id: '7Tqg6BwSSWapxgUDm9KKgg',
    indyNamespace: 'sovrin',
    isProduction: true,
    genesisTransactions: 'xxx',
    transactionAuthorAgreement: { version: '1', acceptanceMechanism: 'accept' },
  },
]

describe('LedgerApi', () => {
  let wallet: IndyWallet
  let ledgerService: IndyLedgerService
  let anonCredsCredentialDefinitionRepository: AnonCredsCredentialDefinitionRepository
  let anonCredsSchemaRepository: AnonCredsSchemaRepository
  let ledgerApi: LedgerApi
  let agentContext: AgentContext

  const contextCorrelationId = 'mock'
  const agentConfig = getAgentConfig('LedgerApiTest', {
    indyLedgers: pools,
  })

  beforeEach(async () => {
    wallet = new IndyWallet(agentConfig.agentDependencies, agentConfig.logger, new KeyProviderRegistry([]))
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    await wallet.createAndOpen(agentConfig.walletConfig!)
  })

  afterEach(async () => {
    await wallet.delete()
  })

  beforeEach(async () => {
    ledgerService = new IndyLedgerServiceMock()

    agentContext = getAgentContext({
      wallet,
      agentConfig,
      contextCorrelationId,
    })

    anonCredsCredentialDefinitionRepository = new AnonCredsCredentialDefinitionRepositoryMock()
    anonCredsSchemaRepository = new AnonCredsSchemaRepositoryMock()

    ledgerApi = new LedgerApi(
      ledgerService,
      agentContext,
      anonCredsCredentialDefinitionRepository,
      anonCredsSchemaRepository,
      new LedgerModuleConfig()
    )
  })

  describe('LedgerApi', () => {
    // Connect to pools
    describe('connectToPools', () => {
      it('should connect to all pools', async () => {
        mockFunction(ledgerService.connectToPools).mockResolvedValue([1, 2, 4])
        await expect(ledgerApi.connectToPools()).resolves.toBeUndefined()
        expect(ledgerService.connectToPools).toHaveBeenCalled()
      })
    })

    // Register public did
    describe('registerPublicDid', () => {
      it('should register a public DID', async () => {
        mockFunction(ledgerService.registerPublicDid).mockResolvedValueOnce(did)
        mockProperty(wallet, 'publicDid', { did: did, verkey: 'abcde' })
        await expect(ledgerApi.registerPublicDid(did, 'abcde', 'someAlias')).resolves.toEqual(did)
        expect(ledgerService.registerPublicDid).toHaveBeenCalledWith(
          agentContext,
          did,
          did,
          'abcde',
          'someAlias',
          undefined
        )
      })

      it('should throw an error if the DID cannot be registered because there is no public did', async () => {
        const did = 'Y5bj4SjCiTM9PgeheKAiXx'
        mockProperty(wallet, 'publicDid', undefined)
        await expect(ledgerApi.registerPublicDid(did, 'abcde', 'someAlias')).rejects.toThrowError(AriesFrameworkError)
      })
    })

    // Get public DID
    describe('getPublicDid', () => {
      it('should return the public DID if there is one', async () => {
        const nymResponse: Indy.GetNymResponse = { did: 'Y5bj4SjCiTM9PgeheKAiXx', verkey: 'abcde', role: 'STEWARD' }
        mockProperty(wallet, 'publicDid', { did: nymResponse.did, verkey: nymResponse.verkey })
        mockFunction(ledgerService.getPublicDid).mockResolvedValueOnce(nymResponse)
        await expect(ledgerApi.getPublicDid(nymResponse.did)).resolves.toEqual(nymResponse)
        expect(ledgerService.getPublicDid).toHaveBeenCalledWith(agentContext, nymResponse.did)
      })
    })

    // Get schema
    describe('getSchema', () => {
      it('should return the schema by id if there is one', async () => {
        mockFunction(ledgerService.getSchema).mockResolvedValueOnce(schema)
        await expect(ledgerApi.getSchema(schemaId)).resolves.toEqual(schema)
        expect(ledgerService.getSchema).toHaveBeenCalledWith(agentContext, schemaId)
      })

      it('should throw an error if no schema for the id exists', async () => {
        mockFunction(ledgerService.getSchema).mockRejectedValueOnce(
          new AriesFrameworkError('Error retrieving schema abcd from ledger 1')
        )
        await expect(ledgerApi.getSchema(schemaId)).rejects.toThrowError(AriesFrameworkError)
        expect(ledgerService.getSchema).toHaveBeenCalledWith(agentContext, schemaId)
      })
    })

    describe('registerSchema', () => {
      it('should throw an error if there is no public DID', async () => {
        mockProperty(wallet, 'publicDid', undefined)
        await expect(ledgerApi.registerSchema({ ...schema, attributes: ['hello', 'world'] })).rejects.toThrowError(
          AriesFrameworkError
        )
      })

      it('should return the schema from anonCreds when it already exists', async () => {
        mockProperty(wallet, 'publicDid', { did: did, verkey: 'abcde' })
        mockFunction(anonCredsSchemaRepository.findById).mockResolvedValueOnce(
          new AnonCredsSchemaRecord({ schema: { ...schema, id: schemaIdQualified } })
        )
        mockFunction(ledgerService.getDidIndyWriteNamespace).mockReturnValueOnce(pools[0].indyNamespace)
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { id, ...schemaWithoutId } = schema
        await expect(ledgerApi.registerSchema({ ...schema, attributes: ['hello', 'world'] })).resolves.toMatchObject({
          ...schema,
          id: schema.id,
        })
        expect(anonCredsSchemaRepository.findById).toHaveBeenCalledWith(agentContext, schemaIdQualified)
      })

      it('should return the schema from the ledger when it already exists', async () => {
        mockProperty(wallet, 'publicDid', { did: did, verkey: 'abcde' })
        jest
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .spyOn(LedgerApi.prototype as any, 'findBySchemaIdOnLedger')
          .mockResolvedValueOnce(new AnonCredsSchemaRecord({ schema: schema }))
        mockProperty(ledgerApi, 'config', {
          connectToIndyLedgersOnStartup: true,
          indyLedgers: pools,
        } as LedgerModuleConfig)
        await expect(ledgerApi.registerSchema({ ...schema, attributes: ['hello', 'world'] })).resolves.toHaveProperty(
          'schema',
          { ...schema }
        )
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect(jest.spyOn(LedgerApi.prototype as any, 'findBySchemaIdOnLedger')).toHaveBeenCalledWith(schemaIdGenerated)
      })

      it('should return the schema after registering it', async () => {
        mockProperty(wallet, 'publicDid', { did: did, verkey: 'abcde' })
        mockFunction(ledgerService.registerSchema).mockResolvedValueOnce(schema)
        mockProperty(ledgerApi, 'config', {
          connectToIndyLedgersOnStartup: true,
          indyLedgers: pools,
        } as LedgerModuleConfig)
        await expect(ledgerApi.registerSchema({ ...schema, attributes: ['hello', 'world'] })).resolves.toEqual(schema)
        expect(ledgerService.registerSchema).toHaveBeenCalledWith(agentContext, did, {
          ...schema,
          attributes: ['hello', 'world'],
        })
      })
    })

    describe('registerCredentialDefinition', () => {
      it('should throw an error if there si no public DID', async () => {
        mockProperty(wallet, 'publicDid', undefined)
        await expect(ledgerApi.registerCredentialDefinition(credentialDefinitionTemplate)).rejects.toThrowError(
          AriesFrameworkError
        )
      })

      it('should return the credential definition from the wallet if it already exists', async () => {
        mockProperty(wallet, 'publicDid', { did: did, verkey: 'abcde' })
        const anonCredsCredentialDefinitionRecord: AnonCredsCredentialDefinitionRecord =
          new AnonCredsCredentialDefinitionRecord({
            credentialDefinition: credDef,
          })
        mockFunction(anonCredsCredentialDefinitionRepository.findById).mockResolvedValueOnce(
          anonCredsCredentialDefinitionRecord
        )
        mockProperty(ledgerApi, 'config', {
          connectToIndyLedgersOnStartup: true,
          indyLedgers: pools,
        } as LedgerModuleConfig)
        mockFunction(ledgerService.getDidIndyWriteNamespace).mockReturnValueOnce(pools[0].indyNamespace)
        await expect(ledgerApi.registerCredentialDefinition(credentialDefinitionTemplate)).resolves.toHaveProperty(
          'value.primary',
          credentialDefinition
        )
        expect(anonCredsCredentialDefinitionRepository.findById).toHaveBeenCalledWith(agentContext, qualifiedDidCred)
      })

      it('should throw an exception if the definition already exists on the ledger', async () => {
        mockProperty(wallet, 'publicDid', { did: did, verkey: 'abcde' })
        jest
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .spyOn(LedgerApi.prototype as any, 'findByCredentialDefinitionIdOnLedger')
          .mockResolvedValueOnce({ credentialDefinition: credentialDefinition })
        mockProperty(ledgerApi, 'config', {
          connectToIndyLedgersOnStartup: true,
          indyLedgers: pools,
        } as LedgerModuleConfig)
        await expect(ledgerApi.registerCredentialDefinition(credentialDefinitionTemplate)).rejects.toThrowError(
          AriesFrameworkError
        )
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect(jest.spyOn(LedgerApi.prototype as any, 'findByCredentialDefinitionIdOnLedger')).toHaveBeenCalledWith(
          credentialDefinitionId
        )
      })

      it('should register the credential successfully if it is neither in the wallet and neither on the ledger', async () => {
        mockProperty(wallet, 'publicDid', { did: did, verkey: 'abcde' })
        mockFunction(ledgerService.registerCredentialDefinition).mockResolvedValueOnce(credDef)
        mockProperty(ledgerApi, 'config', {
          connectToIndyLedgersOnStartup: true,
          indyLedgers: pools,
        } as LedgerModuleConfig)
        await expect(ledgerApi.registerCredentialDefinition(credentialDefinitionTemplate)).resolves.toEqual(credDef)
        expect(ledgerService.registerCredentialDefinition).toHaveBeenCalledWith(agentContext, did, {
          ...credentialDefinitionTemplate,
          signatureType: 'CL',
        })
      })
    })

    describe('getCredentialDefinition', () => {
      it('should return the credential definition given the id', async () => {
        mockProperty(wallet, 'publicDid', { did: did, verkey: 'abcde' })
        mockFunction(ledgerService.getCredentialDefinition).mockResolvedValue(credDef)
        await expect(ledgerApi.getCredentialDefinition(credDef.id)).resolves.toEqual(credDef)
        expect(ledgerService.getCredentialDefinition).toHaveBeenCalledWith(agentContext, credDef.id)
      })

      it('should throw an error if there is no credential definition for the given id', async () => {
        mockProperty(wallet, 'publicDid', { did: did, verkey: 'abcde' })
        mockFunction(ledgerService.getCredentialDefinition).mockRejectedValueOnce(new AriesFrameworkError(''))
        await expect(ledgerApi.getCredentialDefinition(credDef.id)).rejects.toThrowError(AriesFrameworkError)
        expect(ledgerService.getCredentialDefinition).toHaveBeenCalledWith(agentContext, credDef.id)
      })
    })

    describe('getRevocationRegistryDefinition', () => {
      it('should return the ParseRevocationRegistryDefinitionTemplate for a valid revocationRegistryDefinitionId', async () => {
        const parseRevocationRegistryDefinitionTemplate = {
          revocationRegistryDefinition: revocRegDef,
          revocationRegistryDefinitionTxnTime: 12345678,
        }
        mockFunction(ledgerService.getRevocationRegistryDefinition).mockResolvedValue(
          parseRevocationRegistryDefinitionTemplate
        )
        await expect(ledgerApi.getRevocationRegistryDefinition(revocRegDef.id)).resolves.toBe(
          parseRevocationRegistryDefinitionTemplate
        )
        expect(ledgerService.getRevocationRegistryDefinition).toHaveBeenLastCalledWith(agentContext, revocRegDef.id)
      })

      it('should throw an error if the ParseRevocationRegistryDefinitionTemplate does not exists', async () => {
        mockFunction(ledgerService.getRevocationRegistryDefinition).mockRejectedValueOnce(new AriesFrameworkError(''))
        await expect(ledgerApi.getRevocationRegistryDefinition('abcde')).rejects.toThrowError(AriesFrameworkError)
        expect(ledgerService.getRevocationRegistryDefinition).toHaveBeenCalledWith(agentContext, revocRegDef.id)
      })
    })

    describe('getRevocationRegistryDelta', () => {
      it('should return the ParseRevocationRegistryDeltaTemplate', async () => {
        const revocRegDelta = {
          value: {
            prevAccum: 'prev',
            accum: 'accum',
            issued: [1, 2, 3],
            revoked: [4, 5, 6],
          },
          ver: 'ver',
        }
        const parseRevocationRegistryDeltaTemplate = {
          revocationRegistryDelta: revocRegDelta,
          deltaTimestamp: 12345678,
        }

        mockFunction(ledgerService.getRevocationRegistryDelta).mockResolvedValueOnce(
          parseRevocationRegistryDeltaTemplate
        )
        await expect(ledgerApi.getRevocationRegistryDelta('12345')).resolves.toEqual(
          parseRevocationRegistryDeltaTemplate
        )
        expect(ledgerService.getRevocationRegistryDelta).toHaveBeenCalledTimes(1)
      })

      it('should throw an error if the delta cannot be obtained', async () => {
        mockFunction(ledgerService.getRevocationRegistryDelta).mockRejectedValueOnce(new AriesFrameworkError(''))
        await expect(ledgerApi.getRevocationRegistryDelta('abcde1234')).rejects.toThrowError(AriesFrameworkError)
        expect(ledgerService.getRevocationRegistryDelta).toHaveBeenCalledTimes(1)
      })
    })
  })
})
