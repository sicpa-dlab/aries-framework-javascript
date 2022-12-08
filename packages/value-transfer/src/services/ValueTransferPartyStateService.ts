import type { PartyState, Transaction, VtpPartyStorageInterface } from '@sicpa-dlab/value-transfer-protocol-ts'

import { injectable } from '@aries-framework/core'
import AsyncLock from 'async-lock'

import { ValueTransferRecord, ValueTransferRepository } from '../repository'
import { ValueTransferStateRepository } from '../repository/ValueTransferStateRepository'

@injectable()
export class ValueTransferPartyStateService implements VtpPartyStorageInterface {
  private valueTransferRepository: ValueTransferRepository
  private valueTransferStateRepository: ValueTransferStateRepository
  private partyStateLock: AsyncLock

  public constructor(
    valueTransferRepository: ValueTransferRepository,
    valueTransferStateRepository: ValueTransferStateRepository
  ) {
    this.valueTransferRepository = valueTransferRepository
    this.valueTransferStateRepository = valueTransferStateRepository
    this.partyStateLock = new AsyncLock()
  }

  public async usePartyState<T>(
    fn: (state: PartyState) => Promise<{ state: PartyState; data?: T }>
  ): Promise<T | void> {
    return await this.partyStateLock.acquire('key', async () => {
      const state = await this.getPartyState()
      const newState = await fn(state)
      await this.storePartyState(newState.state)
      return newState.data
    })
  }

  public async getPartyState(): Promise<PartyState> {
    const state = await this.valueTransferStateRepository.getSingleByQuery({})
    return state.partyState
  }

  public async storePartyState(partyState: PartyState): Promise<void> {
    const record = await this.valueTransferStateRepository.getSingleByQuery({})
    record.partyState = partyState
    await this.valueTransferStateRepository.update(record)
  }

  public async addTransaction(transaction: Transaction): Promise<void> {
    const record = new ValueTransferRecord({
      id: transaction.id,
      transaction,
    })
    return this.valueTransferRepository.save(record)
  }

  public async findTransaction(id: string): Promise<Transaction | undefined> {
    const record = await this.valueTransferRepository.findById(id)
    return record?.transaction
  }

  public async getTransaction(id: string): Promise<Transaction> {
    const record = await this.valueTransferRepository.getById(id)
    return record?.transaction
  }

  public async updateTransaction(transaction: Transaction): Promise<void> {
    const record = await this.valueTransferRepository.getById(transaction.id)
    record.transaction = transaction
    await this.valueTransferRepository.update(record)
  }
}
