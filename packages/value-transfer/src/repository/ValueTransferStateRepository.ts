import { EventEmitter, InjectionSymbols, injectable, inject, Repository, StorageService } from '@aries-framework/core'

import { ValueTransferStateRecord } from './ValueTransferStateRecord'

@injectable()
export class ValueTransferStateRepository extends Repository<ValueTransferStateRecord> {
  public constructor(
    @inject(InjectionSymbols.StorageService) storageService: StorageService<ValueTransferStateRecord>,
    eventEmitter: EventEmitter
  ) {
    super(ValueTransferStateRecord, storageService, eventEmitter)
  }

  public getState(): Promise<ValueTransferStateRecord> {
    return this.getSingleByQuery({})
  }
}
