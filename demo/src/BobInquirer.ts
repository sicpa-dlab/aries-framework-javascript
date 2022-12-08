import type { ValueTransferRecord } from '@aries-framework/value-transfer'

import { clear } from 'console'
import { textSync } from 'figlet'
import { prompt } from 'inquirer'

import { BaseInquirer, ConfirmOptions } from './BaseInquirer'
import { Bob } from './Bob'
import { Listener } from './Listener'
import { greenText, Title } from './OutputClass'

export const runGetter = async () => {
  clear()
  console.log(textSync('Bob', { horizontalLayout: 'full' }))
  const getter = await BobInquirer.build()
  await getter.processAnswer()
}

enum PromptOptions {
  RequestPayment = 'Request payment',
  Exit = 'Exit',
  Restart = 'Restart',
}

export class BobInquirer extends BaseInquirer {
  public getter: Bob
  public promptOptionsString: string[]
  public listener: Listener

  public constructor(getter: Bob) {
    super()
    this.getter = getter
    this.listener = new Listener()
    this.promptOptionsString = Object.values(PromptOptions)
    this.listener.messageListener(this.getter.agent, this.getter.name)
    this.listener.paymentRequestListener(this.getter, this)
    this.listener.paymentOfferListener(this.getter, this)
  }

  public static async build(): Promise<BobInquirer> {
    const getter = await Bob.build()
    return new BobInquirer(getter)
  }

  private async getPromptChoice() {
    return prompt([this.inquireOptions(this.promptOptionsString)])
  }

  public async processAnswer() {
    const choice = await this.getPromptChoice()
    if (this.listener.on) return

    switch (choice.options) {
      case PromptOptions.RequestPayment:
        await this.requestPayment()
        return
      case PromptOptions.Exit:
        await this.exit()
        break
      case PromptOptions.Restart:
        await this.restart()
        return
    }
    await this.processAnswer()
  }

  public async requestPayment() {
    const witness = await prompt([this.inquireInput('Witness DID')])
    const giver = await prompt([this.inquireInput('Giver DID')])
    await this.getter.requestPayment(witness.input, giver.input)
  }

  public async acceptPaymentRequest(valueTransferRecord: ValueTransferRecord) {
    const balance = await this.getter.valueTransfer.getBalance()
    console.log(greenText(`\nCurrent balance: ${balance}`))
    const confirm = await prompt([this.inquireConfirmation(Title.PaymentRequestTitle)])
    if (confirm.options === ConfirmOptions.No) {
      await this.getter.abortPaymentRequest(valueTransferRecord)
    } else if (confirm.options === ConfirmOptions.Yes) {
      await this.getter.acceptPaymentRequest(valueTransferRecord)
    }
  }

  public async acceptPaymentOffer(valueTransferRecord: ValueTransferRecord) {
    const balance = await this.getter.valueTransfer.getBalance()
    console.log(greenText(`\nCurrent balance: ${balance}`))
    const confirm = await prompt([this.inquireConfirmation(Title.PaymentOfferTitle)])
    if (confirm.options === ConfirmOptions.No) {
      await this.getter.abortPaymentOffer(valueTransferRecord)
    } else if (confirm.options === ConfirmOptions.Yes) {
      const witness = await prompt([this.inquireInput('Witness DID')])
      await this.getter.acceptPaymentOffer(valueTransferRecord, witness.input)
    }
  }

  public async exit() {
    const confirm = await prompt([this.inquireConfirmation(Title.ConfirmTitle)])
    if (confirm.options === ConfirmOptions.No) {
      return
    } else if (confirm.options === ConfirmOptions.Yes) {
      await this.getter.exit()
    }
  }

  public async restart() {
    const confirm = await prompt([this.inquireConfirmation(Title.ConfirmTitle)])
    if (confirm.options === ConfirmOptions.No) {
      await this.processAnswer()
      return
    } else if (confirm.options === ConfirmOptions.Yes) {
      await this.getter.restart()
      await runGetter()
    }
  }
}

void runGetter()
