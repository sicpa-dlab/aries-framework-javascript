import type { CreateDIDParams } from './services/DidService'
import type {
  DidCreateOptions,
  DidCreateResult,
  DidDeactivateOptions,
  DidDeactivateResult,
  DidResolutionOptions,
  DidUpdateOptions,
  DidUpdateResult,
} from './types'

import { AgentContext } from '../../agent'
import { injectable } from '../../plugins'
import { V2MediationRecipientService } from '../routing/protocol/coordinate-mediation/v2/V2MediationRecipientService'

import { DidsModuleConfig } from './DidsModuleConfig'
import { DidRepository } from './repository'
import { DidRegistrarService, DidResolverService } from './services'
import { DidService } from './services/DidService'

@injectable()
export class DidsApi {
  public config: DidsModuleConfig

  private didResolverService: DidResolverService
  private didRegistrarService: DidRegistrarService
  private mediationRecipientService: V2MediationRecipientService
  private didService: DidService
  private didRepository: DidRepository
  private agentContext: AgentContext

  public constructor(
    didResolverService: DidResolverService,
    didRegistrarService: DidRegistrarService,
    mediationRecipientService: V2MediationRecipientService,
    didService: DidService,
    didRepository: DidRepository,
    agentContext: AgentContext,
    config: DidsModuleConfig
  ) {
    this.didResolverService = didResolverService
    this.didRegistrarService = didRegistrarService
    this.mediationRecipientService = mediationRecipientService
    this.didService = didService
    this.didRepository = didRepository
    this.agentContext = agentContext
    this.config = config
  }

  /**
   * Resolve a did to a did document.
   *
   * Follows the interface as defined in https://w3c-ccg.github.io/did-resolution/
   */
  public resolve(didUrl: string, options?: DidResolutionOptions) {
    return this.didResolverService.resolve(this.agentContext, didUrl, options)
  }

  /**
   * Create, register and store a did and did document.
   *
   * Follows the interface as defined in https://identity.foundation/did-registration
   */
  public create<CreateOptions extends DidCreateOptions = DidCreateOptions>(
    options: CreateOptions
  ): Promise<DidCreateResult> {
    return this.didRegistrarService.create<CreateOptions>(this.agentContext, options)
  }

  /**
   * Update an existing did document.
   *
   * Follows the interface as defined in https://identity.foundation/did-registration
   */
  public update<UpdateOptions extends DidUpdateOptions = DidUpdateOptions>(
    options: UpdateOptions
  ): Promise<DidUpdateResult> {
    return this.didRegistrarService.update(this.agentContext, options)
  }

  /**
   * Deactivate an existing did.
   *
   * Follows the interface as defined in https://identity.foundation/did-registration
   */
  public deactivate<DeactivateOptions extends DidDeactivateOptions = DidDeactivateOptions>(
    options: DeactivateOptions
  ): Promise<DidDeactivateResult> {
    return this.didRegistrarService.deactivate(this.agentContext, options)
  }

  /**
   * Resolve a did to a did document. This won't return the associated metadata as defined
   * in the did resolution specification, and will throw an error if the did document could not
   * be resolved.
   */
  public resolveDidDocument(didUrl: string) {
    return this.didResolverService.resolveDidDocument(this.agentContext, didUrl)
  }

  /**
   * Get a list of all dids created by the agent. This will return a list of {@link DidRecord} objects.
   * Each document will have an id property with the value of the did. Optionally, it will contain a did document,
   * but this is only for documents that can't be resolved from the did itself or remotely.
   *
   * You can call `${@link DidsModule.resolve} to resolve the did document based on the did itself.
   */
  public getCreatedDids({ method }: { method?: string } = {}) {
    return this.didRepository.getCreatedDids(this.agentContext, { method })
  }

  public async createV2DID(options: CreateDIDParams): Promise<DidCreateResult> {
    const did = await this.didService.createDID(this.agentContext, options)
    if (did.didState.did && options.routing?.mediator) {
      await this.mediationRecipientService.didListUpdateAndAwait(
        this.agentContext,
        options.routing?.mediator,
        did.didState.did
      )
    }
    return did
  }
}
