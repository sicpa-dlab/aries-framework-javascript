import type { AgentContext } from '../../agent'
import type { Wallet } from '@aries-framework/core'

import { getAgentConfig, getAgentContext } from '../../../tests/helpers'
import { DidKey } from '../../modules/dids'
import { Buffer, JsonEncoder } from '../../utils'
import { IndyWallet } from '../../wallet/IndyWallet'
import { JwsService } from '../JwsService'
import { Key } from '../Key'
import { KeyType } from '../KeyType'
import { KeyProviderRegistry } from '../signing-provider'

import * as didJwsz6Mkf from './__fixtures__/didJwsz6Mkf'
import * as didJwsz6Mkv from './__fixtures__/didJwsz6Mkv'

describe('JwsService', () => {
  let wallet: Wallet
  let agentContext: AgentContext
  let jwsService: JwsService

  beforeAll(async () => {
    const config = getAgentConfig('JwsService')
    wallet = new IndyWallet(config.agentDependencies, config.logger, new KeyProviderRegistry([]))
    agentContext = getAgentContext({
      wallet,
    })
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    await wallet.createAndOpen(config.walletConfig!)

    jwsService = new JwsService()
  })

  afterAll(async () => {
    await wallet.delete()
  })

  describe('createJws', () => {
    it('creates a jws for the payload with the key associated with the verkey', async () => {
      const { verkey } = await wallet.createDid({ seed: didJwsz6Mkf.SEED })

      const payload = JsonEncoder.toBuffer(didJwsz6Mkf.DATA_JSON)
      const key = Key.fromPublicKeyBase58(verkey, KeyType.Ed25519)
      const kid = new DidKey(key).did

      const jws = await jwsService.createJws(agentContext, {
        payload,
        verkey,
        header: { kid },
      })

      expect(jws).toEqual(didJwsz6Mkf.JWS_JSON)
    })
  })

  describe('verifyJws', () => {
    it('returns true if the jws signature matches the payload', async () => {
      const payload = JsonEncoder.toBuffer(didJwsz6Mkf.DATA_JSON)

      const { isValid, signerVerkeys } = await jwsService.verifyJws(agentContext, {
        payload,
        jws: didJwsz6Mkf.JWS_JSON,
      })

      expect(isValid).toBe(true)
      expect(signerVerkeys).toEqual([didJwsz6Mkf.VERKEY])
    })

    it('returns all verkeys that signed the jws', async () => {
      const payload = JsonEncoder.toBuffer(didJwsz6Mkf.DATA_JSON)

      const { isValid, signerVerkeys } = await jwsService.verifyJws(agentContext, {
        payload,
        jws: { signatures: [didJwsz6Mkf.JWS_JSON, didJwsz6Mkv.JWS_JSON] },
      })

      expect(isValid).toBe(true)
      expect(signerVerkeys).toEqual([didJwsz6Mkf.VERKEY, didJwsz6Mkv.VERKEY])
    })

    it('returns false if the jws signature does not match the payload', async () => {
      const payload = JsonEncoder.toBuffer({ ...didJwsz6Mkf.DATA_JSON, did: 'another_did' })

      const { isValid, signerVerkeys } = await jwsService.verifyJws(agentContext, {
        payload,
        jws: didJwsz6Mkf.JWS_JSON,
      })

      expect(isValid).toBe(false)
      expect(signerVerkeys).toMatchObject([])
    })

    it('throws an error if the jws signatures array does not contain a JWS', async () => {
      await expect(
        jwsService.verifyJws(agentContext, {
          payload: new Buffer([]),
          jws: { signatures: [] },
        })
      ).rejects.toThrowError('Unable to verify JWS: No entries in JWS signatures array.')
    })
  })
})
