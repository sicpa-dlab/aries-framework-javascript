/*eslint import/no-cycle: [2, { maxDepth: 1 }]*/
import { DidMarker, Transports } from '@aries-framework/core'
import { initWitnessGossip } from '@aries-framework/gossip'

import { BaseAgent } from './BaseAgent'
import { Output } from './OutputClass'

export class GlobalBankWitness extends BaseAgent {
  public static wid = '2'
  public static host = 'http://localhost'

  public constructor(name: string, port?: number) {
    const endpoint = `${GlobalBankWitness.host}:${port}`
    super({
      name,
      port,
      transports: [Transports.HTTP],
      staticDids: [
        {
          seed: '6b8b882e2618fa5d45ee7229ca880087',
          transports: [Transports.HTTP],
          marker: DidMarker.Public,
          endpoint,
        },
      ],
      valueTransferConfig: {
        witness: {
          wid: GlobalBankWitness.wid,
          knownWitnesses: BaseAgent.witnessTable,
        },
      },
    })
  }

  public static async build(): Promise<GlobalBankWitness> {
    const witness = new GlobalBankWitness('globalBank', 8082)
    await witness.initializeAgent()
    await initWitnessGossip(witness.agent)
    const publicDid = await witness.agent.getStaticDid(DidMarker.Public)
    console.log(`GlobalBank Public DID: ${publicDid?.did}`)
    return witness
  }

  public async exit() {
    console.log(Output.Exit)
    await this.agent.shutdown()
    process.exit(0)
  }

  public async restart() {
    await this.agent.shutdown()
  }
}
