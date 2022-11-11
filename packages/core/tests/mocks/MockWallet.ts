/* eslint-disable @typescript-eslint/no-unused-vars */
import type { Wallet } from '../../src'
import type { KeyPair } from '../../src'
import type { EncryptedMessage } from '../../src/agent/didcomm/types'
import type { Key } from '../../src/crypto'
import type { WalletConfig, WalletExportImportConfig, WalletConfigRekey } from '../../src/types'
import type { Buffer } from '../../src/utils/buffer'
import type {
  DidInfo,
  UnpackedMessageContext,
  DidConfig,
  WalletCreateKeyOptions,
  WalletSignOptions,
  WalletVerifyOptions,
} from '../../src/wallet'

export class MockWallet implements Wallet {
  public publicDid = undefined
  public isInitialized = true
  public isProvisioned = true

  public create(walletConfig: WalletConfig): Promise<void> {
    throw new Error('Method not implemented.')
  }
  public createAndOpen(walletConfig: WalletConfig): Promise<void> {
    throw new Error('Method not implemented.')
  }
  public open(walletConfig: WalletConfig): Promise<void> {
    throw new Error('Method not implemented.')
  }
  public rotateKey(walletConfig: WalletConfigRekey): Promise<void> {
    throw new Error('Method not implemented.')
  }
  public close(): Promise<void> {
    throw new Error('Method not implemented.')
  }
  public delete(): Promise<void> {
    throw new Error('Method not implemented.')
  }
  public export(exportConfig: WalletExportImportConfig): Promise<void> {
    throw new Error('Method not implemented.')
  }
  public import(walletConfig: WalletConfig, importConfig: WalletExportImportConfig): Promise<void> {
    throw new Error('Method not implemented.')
  }
  public initPublicDid(didConfig: DidConfig): Promise<void> {
    throw new Error('Method not implemented.')
  }
  public createDid(didConfig?: DidConfig): Promise<DidInfo> {
    throw new Error('Method not implemented.')
  }
  public pack(
    payload: Record<string, unknown>,
    recipientKeys: string[],
    senderVerkey?: string
  ): Promise<EncryptedMessage> {
    throw new Error('Method not implemented.')
  }
  public unpack(encryptedMessage: EncryptedMessage): Promise<UnpackedMessageContext> {
    throw new Error('Method not implemented.')
  }
  public sign(options: WalletSignOptions): Promise<Buffer> {
    throw new Error('Method not implemented.')
  }
  public verify(options: WalletVerifyOptions): Promise<boolean> {
    throw new Error('Method not implemented.')
  }

  public createKey(options: WalletCreateKeyOptions): Promise<Key> {
    throw new Error('Method not implemented.')
  }

  public generateNonce(): Promise<string> {
    throw new Error('Method not implemented.')
  }

  public generateWalletKey(): Promise<string> {
    throw new Error('Method not implemented.')
  }

  public retrieveKeyPair(kid: string): Promise<KeyPair> {
    throw new Error('Method not implemented.')
  }

  public dispose() {
    // Nothing to do here
  }
}
