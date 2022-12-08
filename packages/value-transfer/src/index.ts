import type { ValueTransferConfigOptions } from './ValueTransferConfig'
import type { ValueTransferService } from './services/ValueTransferService'
import type { Agent } from '@aries-framework/core'

import { ValueTransferConfig } from './ValueTransferConfig'
import { InjectionSymbols, ValueTransferModule } from './ValueTransferModule'

export * from './messages'
export * from './services'
export * from './repository'
export * from './ValueTransferModule'
export * from './ValueTransferAutoAcceptType'
export * from './ValueTransferEvents'

export async function initValueTransfer(
  agent: Agent,
  config: ValueTransferConfigOptions
): Promise<ValueTransferModule> {
  agent.dependencyManager.registerInstance(ValueTransferConfig, new ValueTransferConfig(config))
  agent.dependencyManager.registerModules(ValueTransferModule)

  const valueTransferService = agent.dependencyManager.resolve<ValueTransferService>(
    InjectionSymbols.ValueTransferService
  )
  if (config.lockTransactions) await valueTransferService.initActiveTransactionLock()
  await valueTransferService.initPartyState()
  return agent.dependencyManager.resolve(ValueTransferModule)
}
