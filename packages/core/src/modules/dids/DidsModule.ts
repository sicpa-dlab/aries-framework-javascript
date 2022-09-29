import type { DIDInformation } from './domain'
import type { DidRecord } from './repository'
import type { DidResolutionOptions, DIDMetadata } from './types'

import { Lifecycle, scoped } from 'tsyringe'

import { DidService, DidResolverService } from './services'

@scoped(Lifecycle.ContainerScoped)
export class DidsModule {
  private didService: DidService
  private resolverService: DidResolverService

  public constructor(didService: DidService, resolverService: DidResolverService) {
    this.didService = didService
    this.resolverService = resolverService
  }

  public resolve(didUrl?: string, options?: DidResolutionOptions) {
    return this.resolverService.resolve(didUrl, options)
  }

  public async getById(recordId: string): Promise<DidRecord> {
    return this.didService.getById(recordId)
  }

  public async findById(recordId: string): Promise<DidRecord | null> {
    return this.didService.findById(recordId)
  }

  public async getAllDIDs(): Promise<DidRecord[]> {
    return this.didService.getAll()
  }

  public async getMyDIDs(): Promise<DidRecord[]> {
    return this.didService.getMyDIDs()
  }

  public async getReceivedDIDs(): Promise<DidRecord[]> {
    return this.didService.getReceivedDIDs()
  }

  public async findAllDIDsByQuery(query: Partial<DidRecord>) {
    return this.didService.findAllByQuery(query)
  }

  public async setDidMetadata(did: string, meta: DIDMetadata) {
    const didRecord = await this.getById(did)
    return this.didService.setDidMetadata(didRecord, meta)
  }

  public async getDidMetadata(did: string): Promise<DIDMetadata> {
    return this.didService.getDidMetadata(did)
  }

  public async getDidInfo(did: string): Promise<DIDInformation> {
    return this.didService.getDidInfo(did)
  }
}
