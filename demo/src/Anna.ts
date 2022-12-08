/*eslint import/no-cycle: [2, { maxDepth: 1 }]*/
import type { ValueTransferModule, ValueTransferRecord } from '@aries-framework/value-transfer'

import { DidMarker, Transports } from '@aries-framework/core'
import { AutoAcceptValueTransfer, initValueTransfer } from '@aries-framework/value-transfer'
import { TransactionState } from '@sicpa-dlab/value-transfer-protocol-ts'

import { BaseAgent } from './BaseAgent'
import { greenText, Output, redText } from './OutputClass'

export class Anna extends BaseAgent {
  public valueTransfer!: ValueTransferModule
  public valueTransferRecordId?: string
  public static valueTransferConfig = {
    autoAcceptOfferedPaymentRequest: AutoAcceptValueTransfer.Always,
    witnessDid:
      'did:peer:2.Ez6LSfsT5gHMCVEya8VDwW9QbAdVUhJCKbVscrrb82SwCPKKT.Vz6MkgNdE8ad1k8cPCHnXZ6vSxrTuFauRKDzzUHLPvdsLycz5.SeyJzIjoiaHR0cDovL2xvY2FsaG9zdDozMDAwL2FwaS92MSIsInQiOiJkbSIsInIiOlsiZGlkOnBlZXI6Mi5FejZMU25IUzlmM2hyTXVMck45ejZaaG83VGNCUnZTeUs3SFBqUXR3S211M29zV3dGLlZ6Nk1rcmFoQW9WTFFTOVM1R0Y1c1VLdHVkWE1lZFVTWmRkZUpoakh0QUZhVjRob1YuU1czc2ljeUk2SW1oMGRIQTZMeTlzYjJOaGJHaHZjM1E2TXpBd01DOWhjR2t2ZGpFaUxDSjBJam9pWkcwaUxDSnlJanBiWFN3aVlTSTZXeUprYVdSamIyMXRMM1l5SWwxOUxIc2ljeUk2SW5kek9pOHZiRzlqWVd4b2IzTjBPak13TURBdllYQnBMM1l4SWl3aWRDSTZJbVJ0SWl3aWNpSTZXMTBzSW1FaU9sc2laR2xrWTI5dGJTOTJNaUpkZlYwIl0sImEiOlsiZGlkY29tbS92MiJdfQ',
  }

  public constructor(name: string, port?: number) {
    super({
      name,
      port,
      transports: [Transports.Nearby, Transports.NFC, Transports.HTTP, Transports.WS],
      mediatorConnectionsInvite: BaseAgent.defaultMediatorConnectionInvite,
      staticDids: [
        {
          seed: '6b8b882e2618fa5d45ee7229ca880070',
          marker: DidMarker.Public,
          transports: [Transports.Nearby, Transports.NFC, Transports.HTTP],
        },
      ],
    })
  }

  public static async build(): Promise<Anna> {
    const giver = new Anna('anna', undefined)
    await giver.initializeAgent()
    giver.valueTransfer = await initValueTransfer(giver.agent, this.valueTransferConfig)

    const publicDid = await giver.agent.getStaticDid(DidMarker.Public)
    console.log(`Anna Public DID: ${publicDid?.did}`)

    const active = await giver.valueTransfer.getActiveTransaction()
    if (active.record?.id) {
      await giver.valueTransfer.abortTransaction(active.record?.id)
    }

    return giver
  }

  private async getValueTransferRecord() {
    if (!this.valueTransferRecordId) {
      throw Error(redText(Output.MissingValueTransferRecord))
    }
    return await this.valueTransfer.getById(this.valueTransferRecordId)
  }

  private async waitForPayment() {
    const valueTransferRecord = await this.getValueTransferRecord()

    console.log('Waiting for finishing payment...')
    try {
      const record = await this.valueTransfer.returnWhenIsCompleted(valueTransferRecord.id)
      if (record.state === TransactionState.Completed) {
        console.log(greenText(Output.PaymentDone))
        console.log(greenText('Receipt:'))
        console.log(record.receipt)
        const balance = await this.valueTransfer.getBalance()
        console.log(greenText('Balance: ' + balance))
      }
      if (record.state === TransactionState.Failed) {
        console.log(redText('Payment Failed:'))
        console.log(record.error)
      }
    } catch (e) {
      console.log(redText(`\nTimeout of 120 seconds reached.. Returning to home screen.\n`))
      return
    }
  }

  public async acceptPaymentRequest(valueTransferRecord: ValueTransferRecord) {
    const { record } = await this.valueTransfer.acceptPaymentRequest({ recordId: valueTransferRecord.id })
    this.valueTransferRecordId = record?.id
    console.log(greenText('\nPayment request accepted!\n'))
    await this.waitForPayment()
  }

  public async abortPaymentRequest(valueTransferRecord: ValueTransferRecord) {
    const { record } = await this.valueTransfer.abortTransaction(valueTransferRecord.id)
    this.valueTransferRecordId = record?.id
    console.log(redText('\nPayment request rejected!\n'))
    console.log(record?.error)
  }

  public async offerPayment(getter: string) {
    const { record } = await this.valueTransfer.offerPayment({
      amount: 1,
      getter,
      transport: Transports.NFC,
    })
    this.valueTransferRecordId = record.id
    console.log(greenText('\nOffer Sent!\n'))
    await this.waitForPayment()
  }

  public async requestPayment(witness: string, giver: string) {
    const { record } = await this.valueTransfer.requestPayment({
      amount: 1,
      giver,
      witness,
      transport: Transports.NFC,
    })
    this.valueTransferRecordId = record.id
    console.log(greenText('\nRequest Sent!\n'))
    await this.waitForPayment()
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
