import type { QuestionAnswerRecord } from './repository'
import type { Query } from '@aries-framework/core'

import {
  AgentContext,
  ConnectionService,
  createOutboundDIDCommV1Message,
  Dispatcher,
  injectable,
  MessageSender,
} from '@aries-framework/core'

import { AnswerMessageHandler, QuestionMessageHandler } from './handlers'
import { ValidResponse } from './models'
import { QuestionAnswerService } from './services'

@injectable()
export class QuestionAnswerApi {
  private questionAnswerService: QuestionAnswerService
  private messageSender: MessageSender
  private connectionService: ConnectionService
  private agentContext: AgentContext

  public constructor(
    dispatcher: Dispatcher,
    questionAnswerService: QuestionAnswerService,
    messageSender: MessageSender,
    connectionService: ConnectionService,
    agentContext: AgentContext
  ) {
    this.questionAnswerService = questionAnswerService
    this.messageSender = messageSender
    this.connectionService = connectionService
    this.agentContext = agentContext
    this.registerHandlers(dispatcher)
  }

  /**
   * Create a question message with possible valid responses, then send message to the
   * holder
   *
   * @param connectionId connection to send the question message to
   * @param config config for creating question message
   * @returns QuestionAnswer record
   */
  public async sendQuestion(
    connectionId: string,
    config: {
      question: string
      validResponses: ValidResponse[]
      detail?: string
    }
  ) {
    const connection = await this.connectionService.getById(this.agentContext, connectionId)
    connection.assertReady()

    const { questionMessage, questionAnswerRecord } = await this.questionAnswerService.createQuestion(
      this.agentContext,
      connectionId,
      {
        question: config.question,
        validResponses: config.validResponses.map((item) => new ValidResponse(item)),
        detail: config?.detail,
      }
    )
    const outboundMessage = createOutboundDIDCommV1Message(connection, questionMessage)
    await this.messageSender.sendMessage(this.agentContext, outboundMessage)

    return questionAnswerRecord
  }

  /**
   * Create an answer message as the holder and send it in response to a question message
   *
   * @param questionRecordId the id of the questionAnswer record
   * @param response response included in the answer message
   * @returns QuestionAnswer record
   */
  public async sendAnswer(questionRecordId: string, response: string) {
    const questionRecord = await this.questionAnswerService.getById(this.agentContext, questionRecordId)

    const { answerMessage, questionAnswerRecord } = await this.questionAnswerService.createAnswer(
      this.agentContext,
      questionRecord,
      response
    )

    const connection = await this.connectionService.getById(this.agentContext, questionRecord.connectionId)

    const outboundMessage = createOutboundDIDCommV1Message(connection, answerMessage)
    await this.messageSender.sendMessage(this.agentContext, outboundMessage)

    return questionAnswerRecord
  }

  /**
   * Get all QuestionAnswer records
   *
   * @returns list containing all QuestionAnswer records
   */
  public getAll() {
    return this.questionAnswerService.getAll(this.agentContext)
  }

  /**
   * Get all QuestionAnswer records by specified query params
   *
   * @returns list containing all QuestionAnswer records matching specified query params
   */
  public findAllByQuery(query: Query<QuestionAnswerRecord>) {
    return this.questionAnswerService.findAllByQuery(this.agentContext, query)
  }

  /**
   * Retrieve a question answer record by id
   *
   * @param questionAnswerId The questionAnswer record id
   * @return The question answer record or null if not found
   *
   */
  public findById(questionAnswerId: string) {
    return this.questionAnswerService.findById(this.agentContext, questionAnswerId)
  }

  private registerHandlers(dispatcher: Dispatcher) {
    dispatcher.registerHandler(new QuestionMessageHandler(this.questionAnswerService))
    dispatcher.registerHandler(new AnswerMessageHandler(this.questionAnswerService))
  }
}
