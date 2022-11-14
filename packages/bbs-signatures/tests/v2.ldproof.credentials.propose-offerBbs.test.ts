import type { Agent } from '../../core/src/agent/Agent'
import type { ConnectionRecord } from '../../core/src/modules/connections'
import type { SignCredentialOptionsRFC0593 } from '../../core/src/modules/credentials/formats/jsonld'
import type { Wallet } from '../../core/src/wallet'

import { InjectionSymbols } from '../../core/src/constants'
import { KeyType } from '../../core/src/crypto'
import { CredentialState } from '../../core/src/modules/credentials/models'
import { V2IssueCredentialMessage } from '../../core/src/modules/credentials/protocol/v2/messages/V2IssueCredentialMessage'
import { V2OfferCredentialMessage } from '../../core/src/modules/credentials/protocol/v2/messages/V2OfferCredentialMessage'
import { CredentialExchangeRecord } from '../../core/src/modules/credentials/repository/CredentialExchangeRecord'
import { DidKey } from '../../core/src/modules/dids'
import { CREDENTIALS_CONTEXT_V1_URL, SECURITY_CONTEXT_BBS_URL } from '../../core/src/modules/vc'
import { W3cCredential } from '../../core/src/modules/vc/models/credential/W3cCredential'
import { DidCommMessageRepository } from '../../core/src/storage'
import { JsonTransformer } from '../../core/src/utils/JsonTransformer'
import { setupCredentialTests, waitForCredentialRecord } from '../../core/tests/helpers'
import testLogger from '../../core/tests/logger'

import { describeSkipNode17And18 } from './util'

let faberAgent: Agent
let aliceAgent: Agent
let aliceConnection: ConnectionRecord
let aliceCredentialRecord: CredentialExchangeRecord
let faberCredentialRecord: CredentialExchangeRecord

const TEST_LD_DOCUMENT = {
  '@context': [CREDENTIALS_CONTEXT_V1_URL, 'https://w3id.org/citizenship/v1', SECURITY_CONTEXT_BBS_URL],
  id: 'https://issuer.oidp.uscis.gov/credentials/83627465',
  type: ['VerifiableCredential', 'PermanentResidentCard'],
  issuer: '',
  identifier: '83627465',
  name: 'Permanent Resident Card',
  description: 'Government of Example Permanent Resident Card.',
  issuanceDate: '2019-12-03T12:19:52Z',
  expirationDate: '2029-12-03T12:19:52Z',
  credentialSubject: {
    id: 'did:example:b34ca6cd37bbf23',
    type: ['PermanentResident', 'Person'],
    givenName: 'JOHN',
    familyName: 'SMITH',
    gender: 'Male',
    image: 'data:image/png;base64,iVBORw0KGgokJggg==',
    residentSince: '2015-01-01',
    lprCategory: 'C09',
    lprNumber: '999-999-999',
    commuterClassification: 'C1',
    birthCountry: 'Bahamas',
    birthDate: '1958-07-17',
  },
}

describeSkipNode17And18('credentials, BBS+ signature', () => {
  let wallet
  let issuerDidKey: DidKey
  let didCommMessageRepository: DidCommMessageRepository
  let signCredentialOptions: SignCredentialOptionsRFC0593
  const seed = 'testseed000000000000000000000001'
  beforeAll(async () => {
    ;({ faberAgent, aliceAgent, aliceConnection } = await setupCredentialTests(
      'Faber Agent Credentials LD BBS+',
      'Alice Agent Credentials LD BBS+'
    ))
    wallet = faberAgent.injectionContainer.resolve<Wallet>(InjectionSymbols.Wallet)
    await wallet.createDid({ seed })
    const key = await wallet.createKey({ keyType: KeyType.Bls12381g2, seed })

    issuerDidKey = new DidKey(key)
  })

  afterAll(async () => {
    await faberAgent.shutdown()
    await faberAgent.wallet.delete()
    await aliceAgent.shutdown()
    await aliceAgent.wallet.delete()
  })

  test('Alice starts with V2 (ld format, BbsBlsSignature2020 signature) credential proposal to Faber', async () => {
    testLogger.test('Alice sends (v2 jsonld) credential proposal to Faber')
    // set the propose options

    const credentialJson = TEST_LD_DOCUMENT
    credentialJson.issuer = issuerDidKey.did

    const credential = JsonTransformer.fromJSON(credentialJson, W3cCredential)

    signCredentialOptions = {
      credential,
      options: {
        proofType: 'BbsBlsSignature2020',
        proofPurpose: 'assertionMethod',
      },
    }

    testLogger.test('Alice sends (v2, Indy) credential proposal to Faber')

    const credentialExchangeRecord: CredentialExchangeRecord = await aliceAgent.credentials.proposeCredential({
      connectionId: aliceConnection.id,
      protocolVersion: 'v2',
      credentialFormats: {
        jsonld: signCredentialOptions,
      },
      comment: 'v2 propose credential test for W3C Credentials',
    })

    expect(credentialExchangeRecord.connectionId).toEqual(aliceConnection.id)
    expect(credentialExchangeRecord.protocolVersion).toEqual('v2')
    expect(credentialExchangeRecord.state).toEqual(CredentialState.ProposalSent)
    expect(credentialExchangeRecord.threadId).not.toBeNull()

    testLogger.test('Faber waits for credential proposal from Alice')
    faberCredentialRecord = await waitForCredentialRecord(faberAgent, {
      threadId: credentialExchangeRecord.threadId,
      state: CredentialState.ProposalReceived,
    })
    testLogger.test('Faber sends credential offer to Alice')
    await faberAgent.credentials.acceptProposal({
      credentialRecordId: faberCredentialRecord.id,
      comment: 'V2 W3C Offer',
      credentialFormats: {
        jsonld: signCredentialOptions,
      },
    })

    testLogger.test('Alice waits for credential offer from Faber')
    aliceCredentialRecord = await waitForCredentialRecord(aliceAgent, {
      threadId: faberCredentialRecord.threadId,
      state: CredentialState.OfferReceived,
    })

    didCommMessageRepository = faberAgent.dependencyManager.resolve(DidCommMessageRepository)

    const offerMessage = await didCommMessageRepository.findAgentMessage(aliceAgent.context, {
      associatedRecordId: aliceCredentialRecord.id,
      messageClass: V2OfferCredentialMessage,
    })

    expect(JsonTransformer.toJSON(offerMessage)).toMatchObject({
      '@type': 'https://didcomm.org/issue-credential/2.0/offer-credential',
      '@id': expect.any(String),
      comment: 'V2 W3C Offer',
      formats: [
        {
          attach_id: expect.any(String),
          format: 'aries/ld-proof-vc-detail@v1.0',
        },
      ],
      'offers~attach': [
        {
          '@id': expect.any(String),
          'mime-type': 'application/json',
          data: expect.any(Object),
          lastmod_time: undefined,
          byte_count: undefined,
        },
      ],
      '~thread': {
        thid: expect.any(String),
        pthid: undefined,
        sender_order: undefined,
        received_orders: undefined,
      },
      '~service': undefined,
      '~attach': undefined,
      '~please_ack': undefined,
      '~timing': undefined,
      '~transport': undefined,
      '~l10n': undefined,
      credential_preview: expect.any(Object),
      replacement_id: undefined,
    })
    expect(aliceCredentialRecord.id).not.toBeNull()
    expect(aliceCredentialRecord.type).toBe(CredentialExchangeRecord.type)

    if (!aliceCredentialRecord.connectionId) {
      throw new Error('Missing Connection Id')
    }

    const offerCredentialExchangeRecord: CredentialExchangeRecord = await aliceAgent.credentials.acceptOffer({
      credentialRecordId: aliceCredentialRecord.id,
      credentialFormats: {
        jsonld: undefined,
      },
    })

    expect(offerCredentialExchangeRecord.connectionId).toEqual(aliceConnection.id)
    expect(offerCredentialExchangeRecord.protocolVersion).toEqual('v2')
    expect(offerCredentialExchangeRecord.state).toEqual(CredentialState.RequestSent)
    expect(offerCredentialExchangeRecord.threadId).not.toBeNull()

    testLogger.test('Faber waits for credential request from Alice')
    await waitForCredentialRecord(faberAgent, {
      threadId: aliceCredentialRecord.threadId,
      state: CredentialState.RequestReceived,
    })

    testLogger.test('Faber sends credential to Alice')

    await faberAgent.credentials.acceptRequest({
      credentialRecordId: faberCredentialRecord.id,
      comment: 'V2 W3C Offer',
      credentialFormats: {
        jsonld: signCredentialOptions,
      },
    })

    testLogger.test('Alice waits for credential from Faber')
    aliceCredentialRecord = await waitForCredentialRecord(aliceAgent, {
      threadId: faberCredentialRecord.threadId,
      state: CredentialState.CredentialReceived,
    })

    testLogger.test('Alice sends credential ack to Faber')
    await aliceAgent.credentials.acceptCredential({ credentialRecordId: aliceCredentialRecord.id })

    testLogger.test('Faber waits for credential ack from Alice')
    faberCredentialRecord = await waitForCredentialRecord(faberAgent, {
      threadId: faberCredentialRecord.threadId,
      state: CredentialState.Done,
    })
    expect(aliceCredentialRecord).toMatchObject({
      type: CredentialExchangeRecord.type,
      id: expect.any(String),
      createdAt: expect.any(Date),
      threadId: expect.any(String),
      connectionId: expect.any(String),
      state: CredentialState.CredentialReceived,
    })

    const credentialMessage = await didCommMessageRepository.getAgentMessage(faberAgent.context, {
      associatedRecordId: faberCredentialRecord.id,
      messageClass: V2IssueCredentialMessage,
    })

    const w3cCredential = credentialMessage.credentialAttachments[0].getDataAsJson()

    expect(w3cCredential).toMatchObject({
      context: [
        'https://www.w3.org/2018/credentials/v1',
        'https://w3id.org/citizenship/v1',
        'https://w3id.org/security/bbs/v1',
      ],
      id: 'https://issuer.oidp.uscis.gov/credentials/83627465',
      type: ['VerifiableCredential', 'PermanentResidentCard'],
      issuer:
        'did:key:zUC72Q7XD4PE4CrMiDVXuvZng3sBvMmaGgNeTUJuzavH2BS7ThbHL9FhsZM9QYY5fqAQ4MB8M9oudz3tfuaX36Ajr97QRW7LBt6WWmrtESe6Bs5NYzFtLWEmeVtvRYVAgjFcJSa',
      identifier: '83627465',
      name: 'Permanent Resident Card',
      description: 'Government of Example Permanent Resident Card.',
      issuanceDate: '2019-12-03T12:19:52Z',
      expirationDate: '2029-12-03T12:19:52Z',
      credentialSubject: {
        id: 'did:example:b34ca6cd37bbf23',
        type: ['PermanentResident', 'Person'],
        givenName: 'JOHN',
        familyName: 'SMITH',
        gender: 'Male',
        image: 'data:image/png;base64,iVBORw0KGgokJggg==',
        residentSince: '2015-01-01',
        lprCategory: 'C09',
        lprNumber: '999-999-999',
        commuterClassification: 'C1',
        birthCountry: 'Bahamas',
        birthDate: '1958-07-17',
      },
      proof: {
        type: 'BbsBlsSignature2020',
        created: expect.any(String),
        verificationMethod:
          'did:key:zUC72Q7XD4PE4CrMiDVXuvZng3sBvMmaGgNeTUJuzavH2BS7ThbHL9FhsZM9QYY5fqAQ4MB8M9oudz3tfuaX36Ajr97QRW7LBt6WWmrtESe6Bs5NYzFtLWEmeVtvRYVAgjFcJSa#zUC72Q7XD4PE4CrMiDVXuvZng3sBvMmaGgNeTUJuzavH2BS7ThbHL9FhsZM9QYY5fqAQ4MB8M9oudz3tfuaX36Ajr97QRW7LBt6WWmrtESe6Bs5NYzFtLWEmeVtvRYVAgjFcJSa',
        proofPurpose: 'assertionMethod',
        proofValue: expect.any(String),
      },
    })

    expect(JsonTransformer.toJSON(credentialMessage)).toMatchObject({
      '@type': 'https://didcomm.org/issue-credential/2.0/issue-credential',
      '@id': expect.any(String),
      comment: 'V2 W3C Offer',
      formats: [
        {
          attach_id: expect.any(String),
          format: 'aries/ld-proof-vc@1.0',
        },
      ],
      'credentials~attach': [
        {
          '@id': expect.any(String),
          'mime-type': 'application/json',
          data: expect.any(Object),
          lastmod_time: undefined,
          byte_count: undefined,
        },
      ],
      '~thread': {
        thid: expect.any(String),
        pthid: undefined,
        sender_order: undefined,
        received_orders: undefined,
      },
      '~please_ack': { on: ['RECEIPT'] },
      '~service': undefined,
      '~attach': undefined,
      '~timing': undefined,
      '~transport': undefined,
      '~l10n': undefined,
    })
  })
})
