import type { WitnessConfigOptions } from './GossipConfig'
import type { GossipService } from './services'
import type { Agent } from '@aries-framework/core'

import { WitnessConfig } from './GossipConfig'
import { GossipModule, InjectionSymbols } from './GossipModule'

export * from './GossipModule'

export * from './messages'

export async function initWitnessGossip(agent: Agent, config: WitnessConfigOptions): Promise<GossipModule> {
  agent.dependencyManager.registerInstance(WitnessConfig, new WitnessConfig(config))
  agent.dependencyManager.registerModules(GossipModule)

  const gossipService = agent.dependencyManager.resolve<GossipService>(InjectionSymbols.GossipService)
  await gossipService.initWitnessState(config)
  await gossipService.start()

  return agent.dependencyManager.resolve(GossipModule)
}
