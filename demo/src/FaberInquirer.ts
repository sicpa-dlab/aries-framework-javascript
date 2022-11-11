import { clear } from 'console'
import { textSync } from 'figlet'
import inquirer from 'inquirer'

import { BaseInquirer, ConfirmOptions } from './BaseInquirer'
import { Faber } from './Faber'
import { Listener } from './Listener'
import { Title } from './OutputClass'

export const runFaber = async () => {
  clear()
  console.log(textSync('Faber', { horizontalLayout: 'full' }))
  const faber = await FaberInquirer.build()
  await faber.processAnswer()
}

enum PromptOptions {
  CreateConnection = 'Create connection invitation',
  OfferCredential = 'Offer credential',
  RequestProof = 'Request proof',
  SendMessage = 'Send message',
  CreateDID = 'Create new DID',
  Exit = 'Exit',
  Restart = 'Restart',
}

export class FaberInquirer extends BaseInquirer {
  public faber: Faber
  public promptOptionsString: string[]
  public listener: Listener

  public constructor(faber: Faber) {
    super()
    this.faber = faber
    this.listener = new Listener()
    this.promptOptionsString = Object.values(PromptOptions)
    this.listener.messageListener(this.faber.agent, this.faber.name)
  }

  public static async build(): Promise<FaberInquirer> {
    const faber = await Faber.build()
    return new FaberInquirer(faber)
  }

  private async getPromptChoice() {
    if (this.faber.outOfBandId) return inquirer.prompt([this.inquireOptions(this.promptOptionsString)])

    const reducedOption = [
      PromptOptions.CreateConnection,
      PromptOptions.Exit,
      PromptOptions.Restart,
      PromptOptions.CreateDID,
    ]
    return inquirer.prompt([this.inquireOptions(reducedOption)])
  }

  public async processAnswer() {
    const choice = await this.getPromptChoice()
    if (this.listener.on) return

    switch (choice.options) {
      case PromptOptions.CreateConnection:
        await this.connection()
        break
      case PromptOptions.OfferCredential:
        await this.credential()
        return
      case PromptOptions.RequestProof:
        await this.proof()
        return
      case PromptOptions.CreateDID:
        await this.createNewDID()
        break
      case PromptOptions.SendMessage:
        await this.message()
        break
      case PromptOptions.Exit:
        await this.exit()
        break
      case PromptOptions.Restart:
        await this.restart()
        return
    }
    await this.processAnswer()
  }

  public async connection() {
    await this.faber.setupConnection()
  }

  public async exitUseCase(title: string) {
    const confirm = await inquirer.prompt([this.inquireConfirmation(title)])
    if (confirm.options === ConfirmOptions.No) {
      return false
    } else if (confirm.options === ConfirmOptions.Yes) {
      return true
    }
  }

  public async credential() {
    await this.faber.issueCredential()
    const title = 'Is the credential offer accepted?'
    await this.listener.newAcceptedPrompt(title, this)
  }

  public async proof() {
    await this.faber.sendProofRequest()
    const title = 'Is the proof request accepted?'
    await this.listener.newAcceptedPrompt(title, this)
  }

  public async message() {
    const message = await this.inquireMessage()
    if (!message) return

    await this.faber.sendMessage(message)
  }

  public async createNewDID() {
    await this.faber.createNewDID()
  }

  public async exit() {
    const confirm = await inquirer.prompt([this.inquireConfirmation(Title.ConfirmTitle)])
    if (confirm.options === ConfirmOptions.No) {
      return
    } else if (confirm.options === ConfirmOptions.Yes) {
      await this.faber.exit()
    }
  }

  public async restart() {
    const confirm = await inquirer.prompt([this.inquireConfirmation(Title.ConfirmTitle)])
    if (confirm.options === ConfirmOptions.No) {
      await this.processAnswer()
      return
    } else if (confirm.options === ConfirmOptions.Yes) {
      await this.faber.restart()
      await runFaber()
    }
  }
}

void runFaber()
