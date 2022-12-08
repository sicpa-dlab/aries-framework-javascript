import { EventEmitter, InjectionSymbols, injectable, inject, Repository, StorageService } from '@aries-framework/core'

import { ValueTransferRecord } from './ValueTransferRecord'

@injectable()
export class ValueTransferRepository extends Repository<ValueTransferRecord> {
  public constructor(
    @inject(InjectionSymbols.StorageService) storageService: StorageService<ValueTransferRecord>,
    eventEmitter: EventEmitter
  ) {
    super(ValueTransferRecord, storageService, eventEmitter)
  }

  public async getByThread(threadId: string): Promise<ValueTransferRecord> {
    return this.getSingleByQuery({ threadId })
  }

  public async findByThread(threadId: string): Promise<ValueTransferRecord | null> {
    return this.findSingleByQuery({ threadId })
  }
}
