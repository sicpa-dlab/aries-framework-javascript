import type { Alice } from './Alice'
import type { AliceInquirer } from './AliceInquirer'
import type { Anna } from './Anna'
import type { AnnaInquirer } from './AnnaInquirer'
import type { Bob } from './Bob'
import type { BobInquirer } from './BobInquirer'
import type { Carol } from './Carol'
import type { CarolInquirer } from './CarolInquirer'
import type { CentralBankIssuer } from './CentralBankIssuer'
import type { Faber } from './Faber'
import type { FaberInquirer } from './FaberInquirer'
import type {
  Agent,
  BasicMessageStateChangedEvent,
  CredentialExchangeRecord,
  CredentialStateChangedEvent,
  ProofRecord,
  ProofStateChangedEvent,
} from '@aries-framework/core'
import type { ValueTransferRecord, ValueTransferStateChangedEvent } from '@aries-framework/value-transfer'
import type { WitnessTableReceivedEvent } from '@aries-framework/value-transfer-events'
import type BottomBar from 'inquirer/lib/ui/bottom-bar'

import {
  BasicMessageEventTypes,
  BasicMessageRole,
  CredentialEventTypes,
  CredentialState,
  ProofEventTypes,
  ProofState,
  JsonEncoder,
} from '@aries-framework/core'
import { ValueTransferEventTypes } from '@aries-framework/value-transfer'
import { ValueTransferSharedEventTypes } from '@aries-framework/value-transfer-events'
import { TransactionState } from '@sicpa-dlab/value-transfer-protocol-ts'
import { ui } from 'inquirer'

import { Color, purpleText } from './OutputClass'

export class Listener {
  public on: boolean
  private ui: BottomBar

  public constructor() {
    this.on = false
    this.ui = new ui.BottomBar()
  }

  private turnListenerOn() {
    this.on = true
  }

  private turnListenerOff() {
    this.on = false
  }

  private printCredentialAttributes(credentialRecord: CredentialExchangeRecord) {
    if (credentialRecord.credentialAttributes) {
      const attribute = credentialRecord.credentialAttributes
      console.log('\n\nCredential preview:')
      attribute.forEach((element) => {
        console.log(purpleText(`${element.name} ${Color.Reset}${element.value}`))
      })
    }
  }

  private async newCredentialPrompt(credentialRecord: CredentialExchangeRecord, aliceInquirer: AliceInquirer) {
    this.printCredentialAttributes(credentialRecord)
    this.turnListenerOn()
    await aliceInquirer.acceptCredentialOffer(credentialRecord)
    this.turnListenerOff()
    await aliceInquirer.processAnswer()
  }

  public credentialOfferListener(alice: Alice, aliceInquirer: AliceInquirer) {
    alice.agent.events.on(
      CredentialEventTypes.CredentialStateChanged,
      async ({ payload }: CredentialStateChangedEvent) => {
        if (payload.credentialRecord.state === CredentialState.OfferReceived) {
          await this.newCredentialPrompt(payload.credentialRecord, aliceInquirer)
        }
      }
    )
  }

  private printRequest(valueTransferRecord: ValueTransferRecord) {
    console.log('\n\nPayment Request:')
    console.log(purpleText(JsonEncoder.toString(valueTransferRecord.receipt)))
  }

  private async newPaymentRequestPrompt(
    valueTransferRecord: ValueTransferRecord,
    giverInquirer: AnnaInquirer | BobInquirer
  ) {
    this.printRequest(valueTransferRecord)
    this.turnListenerOn()
    await giverInquirer.acceptPaymentRequest(valueTransferRecord)
    this.turnListenerOff()
    await giverInquirer.processAnswer()
  }

  private async newPaymentOfferPrompt(
    valueTransferRecord: ValueTransferRecord,
    getterInquirer: BobInquirer | CarolInquirer
  ) {
    this.printRequest(valueTransferRecord)
    this.turnListenerOn()
    await getterInquirer.acceptPaymentOffer(valueTransferRecord)
    this.turnListenerOff()
    await getterInquirer.processAnswer()
  }

  public paymentRequestListener(giver: Anna | Bob, giverInquirer: AnnaInquirer | BobInquirer) {
    giver.agent.events.on(
      ValueTransferEventTypes.ValueTransferStateChanged,
      async ({ payload }: ValueTransferStateChangedEvent) => {
        if (payload.record.state === TransactionState.RequestReceived) {
          await this.newPaymentRequestPrompt(payload.record, giverInquirer)
        }
      }
    )
  }

  public witnessTableListener(giver: Anna) {
    giver.agent.events.on(
      ValueTransferSharedEventTypes.WitnessTableReceived,
      async ({ payload }: WitnessTableReceivedEvent) => {
        console.log('\n\nWitness Table received:')
        console.log(purpleText(JsonEncoder.toString(payload.witnesses)))
      }
    )
  }

  public mintRequestListener(centralBankIssuer: CentralBankIssuer) {
    centralBankIssuer.agent.events.on(
      ValueTransferEventTypes.ValueTransferStateChanged,
      async ({ payload }: ValueTransferStateChangedEvent) => {
        if (payload.record.state === TransactionState.RequestReceived) {
          await centralBankIssuer.acceptPaymentRequest(payload.record)
        }
      }
    )
  }

  public paymentOfferListener(getter: Bob | Carol, getterInquirer: BobInquirer | CarolInquirer) {
    getter.agent.events.on(
      ValueTransferEventTypes.ValueTransferStateChanged,
      async ({ payload }: ValueTransferStateChangedEvent) => {
        if (payload.record.state === TransactionState.OfferReceived) {
          await this.newPaymentOfferPrompt(payload.record, getterInquirer)
        }
      }
    )
  }

  public messageListener(agent: Agent, name: string) {
    agent.events.on(BasicMessageEventTypes.BasicMessageStateChanged, async (event: BasicMessageStateChangedEvent) => {
      if (event.payload.basicMessageRecord.role === BasicMessageRole.Receiver) {
        this.ui.updateBottomBar(purpleText(`\n${name} received a message: ${event.payload.message.content}\n`))
      }
    })
  }

  private async newProofRequestPrompt(proofRecord: ProofRecord, aliceInquirer: AliceInquirer) {
    this.turnListenerOn()
    await aliceInquirer.acceptProofRequest(proofRecord)
    this.turnListenerOff()
    await aliceInquirer.processAnswer()
  }

  public proofRequestListener(alice: Alice, aliceInquirer: AliceInquirer) {
    alice.agent.events.on(ProofEventTypes.ProofStateChanged, async ({ payload }: ProofStateChangedEvent) => {
      if (payload.proofRecord.state === ProofState.RequestReceived) {
        await this.newProofRequestPrompt(payload.proofRecord, aliceInquirer)
      }
    })
  }

  public proofAcceptedListener(faber: Faber, faberInquirer: FaberInquirer) {
    faber.agent.events.on(ProofEventTypes.ProofStateChanged, async ({ payload }: ProofStateChangedEvent) => {
      if (payload.proofRecord.state === ProofState.Done) {
        await faberInquirer.processAnswer()
      }
    })
  }

  public async newAcceptedPrompt(title: string, faberInquirer: FaberInquirer) {
    this.turnListenerOn()
    await faberInquirer.exitUseCase(title)
    this.turnListenerOff()
    await faberInquirer.processAnswer()
  }
}
