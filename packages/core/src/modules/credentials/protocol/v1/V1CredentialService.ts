import type { AgentContext } from '../../../../agent'
import type { DIDCommV1Message } from '../../../../agent/didcomm'
import type { InboundMessageContext } from '../../../../agent/models/InboundMessageContext'
import type { ProblemReportMessage } from '../../../problem-reports'
import type {
  AcceptCredentialOptions,
  AcceptOfferOptions,
  AcceptProposalOptions,
  AcceptRequestOptions,
  CreateOfferOptions,
  CreateProblemReportOptions,
  CreateProposalOptions,
  CredentialProtocolMsgReturnType,
  NegotiateOfferOptions,
  NegotiateProposalOptions,
} from '../../CredentialServiceOptions'
import type { GetFormatDataReturn } from '../../CredentialsApiOptions'
import type { CredentialFormat } from '../../formats'
import type { IndyCredentialFormat } from '../../formats/indy/IndyCredentialFormat'

import { Dispatcher } from '../../../../agent/Dispatcher'
import { EventEmitter } from '../../../../agent/EventEmitter'
import { InjectionSymbols } from '../../../../constants'
import { Attachment, AttachmentData } from '../../../../decorators/attachment/Attachment'
import { AriesFrameworkError } from '../../../../error'
import { Logger } from '../../../../logger'
import { inject, injectable } from '../../../../plugins'
import { DidCommMessageRepository, DidCommMessageRole } from '../../../../storage'
import { JsonTransformer } from '../../../../utils'
import { isLinkedAttachment } from '../../../../utils/attachment'
import { uuid } from '../../../../utils/uuid'
import { AckStatus } from '../../../common'
import { ConnectionService } from '../../../connections/services'
import { RoutingService } from '../../../routing/services/RoutingService'
import { CredentialsModuleConfig } from '../../CredentialsModuleConfig'
import { CredentialProblemReportReason } from '../../errors'
import { IndyCredentialFormatService } from '../../formats/indy/IndyCredentialFormatService'
import { IndyCredPropose } from '../../formats/indy/models'
import { AutoAcceptCredential } from '../../models/CredentialAutoAcceptType'
import { CredentialState } from '../../models/CredentialState'
import { CredentialExchangeRecord, CredentialRepository } from '../../repository'
import { CredentialService } from '../../services'
import { composeAutoAccept } from '../../util/composeAutoAccept'
import { arePreviewAttributesEqual } from '../../util/previewAttributes'

import {
  V1CredentialAckHandler,
  V1CredentialProblemReportHandler,
  V1IssueCredentialHandler,
  V1OfferCredentialHandler,
  V1ProposeCredentialHandler,
  V1RequestCredentialHandler,
} from './handlers'
import {
  INDY_CREDENTIAL_ATTACHMENT_ID,
  INDY_CREDENTIAL_OFFER_ATTACHMENT_ID,
  INDY_CREDENTIAL_REQUEST_ATTACHMENT_ID,
  V1CredentialAckMessage,
  V1CredentialProblemReportMessage,
  V1IssueCredentialMessage,
  V1OfferCredentialMessage,
  V1ProposeCredentialMessage,
  V1RequestCredentialMessage,
} from './messages'
import { V1CredentialPreview } from './messages/V1CredentialPreview'

@injectable()
export class V1CredentialService extends CredentialService<[IndyCredentialFormat]> {
  private connectionService: ConnectionService
  private formatService: IndyCredentialFormatService
  private routingService: RoutingService
  private credentialsModuleConfig: CredentialsModuleConfig

  public constructor(
    connectionService: ConnectionService,
    didCommMessageRepository: DidCommMessageRepository,
    @inject(InjectionSymbols.Logger) logger: Logger,
    routingService: RoutingService,
    dispatcher: Dispatcher,
    eventEmitter: EventEmitter,
    credentialRepository: CredentialRepository,
    formatService: IndyCredentialFormatService,
    credentialsModuleConfig: CredentialsModuleConfig
  ) {
    super(credentialRepository, didCommMessageRepository, eventEmitter, dispatcher, logger)
    this.connectionService = connectionService
    this.formatService = formatService
    this.routingService = routingService
    this.credentialsModuleConfig = credentialsModuleConfig

    this.registerHandlers()
  }

  /**
   * The version of the issue credential protocol this service supports
   */
  public readonly version = 'v1'

  public getFormatServiceForRecordType(credentialRecordType: string) {
    if (credentialRecordType !== this.formatService.credentialRecordType) {
      throw new AriesFrameworkError(
        `Unsupported credential record type ${credentialRecordType} for v1 issue credential protocol (need ${this.formatService.credentialRecordType})`
      )
    }

    return this.formatService
  }

  /**
   * Create a {@link ProposeCredentialMessage} not bound to an existing credential exchange.
   * To create a proposal as response to an existing credential exchange, use {@link createProposalAsResponse}.
   *
   * @param options The object containing config options
   * @returns Object containing proposal message and associated credential record
   *
   */
  public async createProposal(
    agentContext: AgentContext,
    { connection, credentialFormats, comment, autoAcceptCredential }: CreateProposalOptions<[IndyCredentialFormat]>
  ): Promise<CredentialProtocolMsgReturnType<DIDCommV1Message>> {
    this.assertOnlyIndyFormat(credentialFormats)

    if (!credentialFormats.indy) {
      throw new AriesFrameworkError('Missing indy credential format in v1 create proposal call.')
    }

    // TODO: linked attachments are broken currently. We never include them in the messages.
    // The linking with previews does work, so it shouldn't be too much work to re-enable this.
    const { linkedAttachments } = credentialFormats.indy

    // Create record
    const credentialRecord = new CredentialExchangeRecord({
      connectionId: connection.id,
      threadId: uuid(),
      state: CredentialState.ProposalSent,
      linkedAttachments: linkedAttachments?.map((linkedAttachment) => linkedAttachment.attachment),
      autoAcceptCredential: autoAcceptCredential,
      protocolVersion: 'v1',
    })

    // call create proposal for validation of the proposal and addition of linked attachments
    const { previewAttributes, attachment } = await this.formatService.createProposal(agentContext, {
      credentialFormats,
      credentialRecord,
    })

    // Transform the attachment into the attachment payload and use that to construct the v1 message
    const indyCredentialProposal = JsonTransformer.fromJSON(attachment.getDataAsJson(), IndyCredPropose)

    const credentialProposal = previewAttributes
      ? new V1CredentialPreview({
          attributes: previewAttributes,
        })
      : undefined

    // Create message
    const message = new V1ProposeCredentialMessage({
      ...indyCredentialProposal,
      id: credentialRecord.threadId,
      credentialPreview: credentialProposal,
      comment,
    })

    await this.didCommMessageRepository.saveAgentMessage(agentContext, {
      agentMessage: message,
      role: DidCommMessageRole.Sender,
      associatedRecordId: credentialRecord.id,
    })

    credentialRecord.credentialAttributes = previewAttributes
    await this.credentialRepository.save(agentContext, credentialRecord)
    this.emitStateChangedEvent(agentContext, credentialRecord, null)

    return { credentialRecord, message }
  }

  /**
   * Process a received {@link ProposeCredentialMessage}. This will not accept the credential proposal
   * or send a credential offer. It will only create a new, or update the existing credential record with
   * the information from the credential proposal message. Use {@link createOfferAsResponse}
   * after calling this method to create a credential offer.
   *
   * @param messageContext The message context containing a credential proposal message
   * @returns credential record associated with the credential proposal message
   *
   */
  public async processProposal(
    messageContext: InboundMessageContext<V1ProposeCredentialMessage>
  ): Promise<CredentialExchangeRecord> {
    const { message: proposalMessage, connection } = messageContext

    this.logger.debug(`Processing credential proposal with message id ${proposalMessage.id}`)

    let credentialRecord = await this.findByThreadAndConnectionId(
      messageContext.agentContext,
      proposalMessage.threadId,
      connection?.id
    )

    // Credential record already exists, this is a response to an earlier message sent by us
    if (credentialRecord) {
      this.logger.debug('Credential record already exists for incoming proposal')

      // Assert
      credentialRecord.assertProtocolVersion('v1')
      credentialRecord.assertState(CredentialState.OfferSent)

      const proposalCredentialMessage = await this.didCommMessageRepository.findAgentMessage(
        messageContext.agentContext,
        {
          associatedRecordId: credentialRecord.id,
          messageClass: V1ProposeCredentialMessage,
        }
      )
      const offerCredentialMessage = await this.didCommMessageRepository.findAgentMessage(messageContext.agentContext, {
        associatedRecordId: credentialRecord.id,
        messageClass: V1OfferCredentialMessage,
      })

      this.connectionService.assertConnectionOrServiceDecorator(messageContext, {
        previousReceivedMessage: proposalCredentialMessage ?? undefined,
        previousSentMessage: offerCredentialMessage ?? undefined,
      })

      await this.formatService.processProposal(messageContext.agentContext, {
        credentialRecord,
        attachment: new Attachment({
          data: new AttachmentData({
            json: JsonTransformer.toJSON(this.rfc0592ProposalFromV1ProposeMessage(proposalMessage)),
          }),
        }),
      })

      // Update record
      await this.updateState(messageContext.agentContext, credentialRecord, CredentialState.ProposalReceived)
      await this.didCommMessageRepository.saveOrUpdateAgentMessage(messageContext.agentContext, {
        agentMessage: proposalMessage,
        role: DidCommMessageRole.Receiver,
        associatedRecordId: credentialRecord.id,
      })
    } else {
      this.logger.debug('Credential record does not exists yet for incoming proposal')

      // No credential record exists with thread id
      credentialRecord = new CredentialExchangeRecord({
        connectionId: connection?.id,
        threadId: proposalMessage.threadId,
        state: CredentialState.ProposalReceived,
        protocolVersion: 'v1',
      })

      // Assert
      this.connectionService.assertConnectionOrServiceDecorator(messageContext)

      // Save record
      await this.credentialRepository.save(messageContext.agentContext, credentialRecord)
      this.emitStateChangedEvent(messageContext.agentContext, credentialRecord, null)

      await this.didCommMessageRepository.saveAgentMessage(messageContext.agentContext, {
        agentMessage: proposalMessage,
        role: DidCommMessageRole.Receiver,
        associatedRecordId: credentialRecord.id,
      })
    }
    return credentialRecord
  }

  /**
   * Processing an incoming credential message and create a credential offer as a response
   * @param options The object containing config options
   * @returns Object containing proposal message and associated credential record
   */
  public async acceptProposal(
    agentContext: AgentContext,
    {
      credentialRecord,
      credentialFormats,
      comment,
      autoAcceptCredential,
    }: AcceptProposalOptions<[IndyCredentialFormat]>
  ): Promise<CredentialProtocolMsgReturnType<V1OfferCredentialMessage>> {
    // Assert
    credentialRecord.assertProtocolVersion('v1')
    credentialRecord.assertState(CredentialState.ProposalReceived)
    if (credentialFormats) this.assertOnlyIndyFormat(credentialFormats)

    const proposalMessage = await this.didCommMessageRepository.getAgentMessage(agentContext, {
      associatedRecordId: credentialRecord.id,
      messageClass: V1ProposeCredentialMessage,
    })

    // NOTE: We set the credential attributes from the proposal on the record as we've 'accepted' them
    // and can now use them to create the offer in the format services. It may be overwritten later on
    // if the user provided other attributes in the credentialFormats array.
    credentialRecord.credentialAttributes = proposalMessage.credentialPreview?.attributes

    const { attachment, previewAttributes } = await this.formatService.acceptProposal(agentContext, {
      attachId: INDY_CREDENTIAL_OFFER_ATTACHMENT_ID,
      credentialFormats,
      credentialRecord,
      proposalAttachment: new Attachment({
        data: new AttachmentData({
          json: JsonTransformer.toJSON(this.rfc0592ProposalFromV1ProposeMessage(proposalMessage)),
        }),
      }),
    })

    if (!previewAttributes) {
      throw new AriesFrameworkError('Missing required credential preview attributes from indy format service')
    }

    const message = new V1OfferCredentialMessage({
      comment,
      offerAttachments: [attachment],
      credentialPreview: new V1CredentialPreview({
        attributes: previewAttributes,
      }),
      attachments: credentialRecord.linkedAttachments,
    })

    message.setThread({ threadId: credentialRecord.threadId })

    credentialRecord.credentialAttributes = previewAttributes
    credentialRecord.autoAcceptCredential = autoAcceptCredential ?? credentialRecord.autoAcceptCredential
    await this.updateState(agentContext, credentialRecord, CredentialState.OfferSent)

    await this.didCommMessageRepository.saveOrUpdateAgentMessage(agentContext, {
      agentMessage: message,
      role: DidCommMessageRole.Sender,
      associatedRecordId: credentialRecord.id,
    })

    return { credentialRecord, message }
  }

  /**
   * Negotiate a credential proposal as issuer (by sending a credential offer message) to the connection
   * associated with the credential record.
   *
   * @param options configuration for the offer see {@link NegotiateProposalOptions}
   * @returns Credential record associated with the credential offer and the corresponding new offer message
   *
   */
  public async negotiateProposal(
    agentContext: AgentContext,
    {
      credentialFormats,
      credentialRecord,
      comment,
      autoAcceptCredential,
    }: NegotiateProposalOptions<[IndyCredentialFormat]>
  ): Promise<CredentialProtocolMsgReturnType<V1OfferCredentialMessage>> {
    // Assert
    credentialRecord.assertProtocolVersion('v1')
    credentialRecord.assertState(CredentialState.ProposalReceived)
    if (credentialFormats) this.assertOnlyIndyFormat(credentialFormats)

    const { attachment, previewAttributes } = await this.formatService.createOffer(agentContext, {
      attachId: INDY_CREDENTIAL_OFFER_ATTACHMENT_ID,
      credentialFormats,
      credentialRecord,
    })

    if (!previewAttributes) {
      throw new AriesFrameworkError('Missing required credential preview attributes from indy format service')
    }

    const message = new V1OfferCredentialMessage({
      comment,
      offerAttachments: [attachment],
      credentialPreview: new V1CredentialPreview({
        attributes: previewAttributes,
      }),
      attachments: credentialRecord.linkedAttachments,
    })
    message.setThread({ threadId: credentialRecord.threadId })

    credentialRecord.credentialAttributes = previewAttributes
    credentialRecord.autoAcceptCredential = autoAcceptCredential ?? credentialRecord.autoAcceptCredential
    await this.updateState(agentContext, credentialRecord, CredentialState.OfferSent)

    await this.didCommMessageRepository.saveOrUpdateAgentMessage(agentContext, {
      agentMessage: message,
      role: DidCommMessageRole.Sender,
      associatedRecordId: credentialRecord.id,
    })

    return { credentialRecord, message }
  }

  /**
   * Create a {@link OfferCredentialMessage} not bound to an existing credential exchange.
   * To create an offer as response to an existing credential exchange, use {@link V1CredentialService#createOfferAsResponse}.
   *
   * @param options The options containing config params for creating the credential offer
   * @returns Object containing offer message and associated credential record
   *
   */
  public async createOffer(
    agentContext: AgentContext,
    { credentialFormats, autoAcceptCredential, comment, connection }: CreateOfferOptions<[IndyCredentialFormat]>
  ): Promise<CredentialProtocolMsgReturnType<V1OfferCredentialMessage>> {
    // Assert
    if (credentialFormats) this.assertOnlyIndyFormat(credentialFormats)

    if (!credentialFormats.indy) {
      throw new AriesFrameworkError('Missing indy credential format data for v1 create offer')
    }

    // Create record
    const credentialRecord = new CredentialExchangeRecord({
      connectionId: connection?.id,
      threadId: uuid(),
      linkedAttachments: credentialFormats.indy.linkedAttachments?.map(
        (linkedAttachments) => linkedAttachments.attachment
      ),
      state: CredentialState.OfferSent,
      autoAcceptCredential,
      protocolVersion: 'v1',
    })

    const { attachment, previewAttributes } = await this.formatService.createOffer(agentContext, {
      attachId: INDY_CREDENTIAL_OFFER_ATTACHMENT_ID,
      credentialFormats,
      credentialRecord,
    })

    if (!previewAttributes) {
      throw new AriesFrameworkError('Missing required credential preview from indy format service')
    }

    // Construct offer message
    const message = new V1OfferCredentialMessage({
      id: credentialRecord.threadId,
      credentialPreview: new V1CredentialPreview({
        attributes: previewAttributes,
      }),
      comment,
      offerAttachments: [attachment],
      attachments: credentialFormats.indy.linkedAttachments?.map((linkedAttachments) => linkedAttachments.attachment),
    })

    await this.didCommMessageRepository.saveAgentMessage(agentContext, {
      associatedRecordId: credentialRecord.id,
      agentMessage: message,
      role: DidCommMessageRole.Sender,
    })

    credentialRecord.credentialAttributes = previewAttributes
    await this.credentialRepository.save(agentContext, credentialRecord)
    this.emitStateChangedEvent(agentContext, credentialRecord, null)

    return { message, credentialRecord }
  }

  /**
   * Process a received {@link OfferCredentialMessage}. This will not accept the credential offer
   * or send a credential request. It will only create a new credential record with
   * the information from the credential offer message. Use {@link createRequest}
   * after calling this method to create a credential request.
   *
   * @param messageContext The message context containing a credential request message
   * @returns credential record associated with the credential offer message
   *
   */
  public async processOffer(
    messageContext: InboundMessageContext<V1OfferCredentialMessage>
  ): Promise<CredentialExchangeRecord> {
    const { message: offerMessage, connection } = messageContext

    this.logger.debug(`Processing credential offer with id ${offerMessage.id}`)

    let credentialRecord = await this.findByThreadAndConnectionId(
      messageContext.agentContext,
      offerMessage.threadId,
      connection?.id
    )

    const offerAttachment = offerMessage.getOfferAttachmentById(INDY_CREDENTIAL_OFFER_ATTACHMENT_ID)
    if (!offerAttachment) {
      throw new AriesFrameworkError(
        `Indy attachment with id ${INDY_CREDENTIAL_OFFER_ATTACHMENT_ID} not found in offer message`
      )
    }

    if (credentialRecord) {
      const proposalCredentialMessage = await this.didCommMessageRepository.findAgentMessage(
        messageContext.agentContext,
        {
          associatedRecordId: credentialRecord.id,
          messageClass: V1ProposeCredentialMessage,
        }
      )
      const offerCredentialMessage = await this.didCommMessageRepository.findAgentMessage(messageContext.agentContext, {
        associatedRecordId: credentialRecord.id,
        messageClass: V1OfferCredentialMessage,
      })

      // Assert
      credentialRecord.assertProtocolVersion('v1')
      credentialRecord.assertState(CredentialState.ProposalSent)
      this.connectionService.assertConnectionOrServiceDecorator(messageContext, {
        previousReceivedMessage: offerCredentialMessage ?? undefined,
        previousSentMessage: proposalCredentialMessage ?? undefined,
      })

      await this.formatService.processOffer(messageContext.agentContext, {
        credentialRecord,
        attachment: offerAttachment,
      })

      await this.didCommMessageRepository.saveOrUpdateAgentMessage(messageContext.agentContext, {
        agentMessage: offerMessage,
        role: DidCommMessageRole.Receiver,
        associatedRecordId: credentialRecord.id,
      })
      await this.updateState(messageContext.agentContext, credentialRecord, CredentialState.OfferReceived)

      return credentialRecord
    } else {
      // No credential record exists with thread id
      credentialRecord = new CredentialExchangeRecord({
        connectionId: connection?.id,
        threadId: offerMessage.id,
        state: CredentialState.OfferReceived,
        protocolVersion: 'v1',
      })

      // Assert
      this.connectionService.assertConnectionOrServiceDecorator(messageContext)

      await this.formatService.processOffer(messageContext.agentContext, {
        credentialRecord,
        attachment: offerAttachment,
      })

      // Save in repository
      await this.didCommMessageRepository.saveAgentMessage(messageContext.agentContext, {
        agentMessage: offerMessage,
        role: DidCommMessageRole.Receiver,
        associatedRecordId: credentialRecord.id,
      })
      await this.credentialRepository.save(messageContext.agentContext, credentialRecord)
      this.emitStateChangedEvent(messageContext.agentContext, credentialRecord, null)

      return credentialRecord
    }
  }

  /**
   * Create a {@link RequestCredentialMessage} as response to a received credential offer.
   *
   * @param options configuration to use for the credential request
   * @returns Object containing request message and associated credential record
   *
   */
  public async acceptOffer(
    agentContext: AgentContext,
    { credentialRecord, credentialFormats, comment, autoAcceptCredential }: AcceptOfferOptions<[IndyCredentialFormat]>
  ): Promise<CredentialProtocolMsgReturnType<V1RequestCredentialMessage>> {
    // Assert credential
    credentialRecord.assertProtocolVersion('v1')
    credentialRecord.assertState(CredentialState.OfferReceived)

    const offerMessage = await this.didCommMessageRepository.getAgentMessage(agentContext, {
      associatedRecordId: credentialRecord.id,
      messageClass: V1OfferCredentialMessage,
    })

    const offerAttachment = offerMessage.getOfferAttachmentById(INDY_CREDENTIAL_OFFER_ATTACHMENT_ID)
    if (!offerAttachment) {
      throw new AriesFrameworkError(
        `Indy attachment with id ${INDY_CREDENTIAL_OFFER_ATTACHMENT_ID} not found in offer message`
      )
    }

    const { attachment } = await this.formatService.acceptOffer(agentContext, {
      credentialRecord,
      credentialFormats,
      attachId: INDY_CREDENTIAL_REQUEST_ATTACHMENT_ID,
      offerAttachment,
    })

    const requestMessage = new V1RequestCredentialMessage({
      comment,
      requestAttachments: [attachment],
      attachments: offerMessage.appendedAttachments?.filter((attachment) => isLinkedAttachment(attachment)),
    })
    requestMessage.setThread({ threadId: credentialRecord.threadId })

    credentialRecord.credentialAttributes = offerMessage.credentialPreview.attributes
    credentialRecord.autoAcceptCredential = autoAcceptCredential ?? credentialRecord.autoAcceptCredential
    credentialRecord.linkedAttachments = offerMessage.appendedAttachments?.filter((attachment) =>
      isLinkedAttachment(attachment)
    )

    await this.didCommMessageRepository.saveOrUpdateAgentMessage(agentContext, {
      agentMessage: requestMessage,
      associatedRecordId: credentialRecord.id,
      role: DidCommMessageRole.Sender,
    })
    await this.updateState(agentContext, credentialRecord, CredentialState.RequestSent)

    return { message: requestMessage, credentialRecord }
  }

  /**
   * Process a received {@link RequestCredentialMessage}. This will not accept the credential request
   * or send a credential. It will only update the existing credential record with
   * the information from the credential request message. Use {@link createCredential}
   * after calling this method to create a credential.
   *
   * @param messageContext The message context containing a credential request message
   * @returns credential record associated with the credential request message
   *
   */
  public async negotiateOffer(
    agentContext: AgentContext,
    {
      credentialFormats,
      credentialRecord,
      autoAcceptCredential,
      comment,
    }: NegotiateOfferOptions<[IndyCredentialFormat]>
  ): Promise<CredentialProtocolMsgReturnType<DIDCommV1Message>> {
    // Assert
    credentialRecord.assertProtocolVersion('v1')
    credentialRecord.assertState(CredentialState.OfferReceived)
    this.assertOnlyIndyFormat(credentialFormats)
    if (!credentialRecord.connectionId) {
      throw new AriesFrameworkError(
        `No connectionId found for credential record '${credentialRecord.id}'. Connection-less issuance does not support negotiation.`
      )
    }

    if (!credentialFormats.indy) {
      throw new AriesFrameworkError('Missing indy credential format in v1 create proposal call.')
    }

    const { linkedAttachments } = credentialFormats.indy

    // call create proposal for validation of the proposal and addition of linked attachments
    // As the format is different for v1 of the issue credential protocol we won't be using the attachment
    const { previewAttributes, attachment } = await this.formatService.createProposal(agentContext, {
      credentialFormats,
      credentialRecord,
    })

    // Transform the attachment into the attachment payload and use that to construct the v1 message
    const indyCredentialProposal = JsonTransformer.fromJSON(attachment.getDataAsJson(), IndyCredPropose)

    const credentialProposal = previewAttributes
      ? new V1CredentialPreview({
          attributes: previewAttributes,
        })
      : undefined

    // Create message
    const message = new V1ProposeCredentialMessage({
      ...indyCredentialProposal,
      credentialPreview: credentialProposal,
      comment,
    })

    message.setThread({ threadId: credentialRecord.threadId })

    await this.didCommMessageRepository.saveOrUpdateAgentMessage(agentContext, {
      agentMessage: message,
      role: DidCommMessageRole.Sender,
      associatedRecordId: credentialRecord.id,
    })

    // Update record
    credentialRecord.credentialAttributes = previewAttributes
    credentialRecord.linkedAttachments = linkedAttachments?.map((attachment) => attachment.attachment)
    credentialRecord.autoAcceptCredential = autoAcceptCredential ?? credentialRecord.autoAcceptCredential
    await this.updateState(agentContext, credentialRecord, CredentialState.ProposalSent)

    return { credentialRecord, message }
  }

  /**
   * Starting from a request is not supported in v1 of the issue credential protocol
   * because indy doesn't allow to start from a request
   */
  public async createRequest(): Promise<CredentialProtocolMsgReturnType<V1RequestCredentialMessage>> {
    throw new AriesFrameworkError('Starting from a request is not supported for v1 issue credential protocol')
  }

  /**
   * Process a received {@link IssueCredentialMessage}. This will not accept the credential
   * or send a credential acknowledgement. It will only update the existing credential record with
   * the information from the issue credential message. Use {@link createAck}
   * after calling this method to create a credential acknowledgement.
   *
   * @param messageContext The message context containing an issue credential message
   *
   * @returns credential record associated with the issue credential message
   *
   */
  public async processRequest(
    messageContext: InboundMessageContext<V1RequestCredentialMessage>
  ): Promise<CredentialExchangeRecord> {
    const { message: requestMessage, connection } = messageContext

    this.logger.debug(`Processing credential request with id ${requestMessage.id}`)

    const credentialRecord = await this.getByThreadAndConnectionId(
      messageContext.agentContext,
      requestMessage.threadId,
      connection?.id
    )
    this.logger.trace('Credential record found when processing credential request', credentialRecord)

    const proposalMessage = await this.didCommMessageRepository.findAgentMessage(messageContext.agentContext, {
      associatedRecordId: credentialRecord.id,
      messageClass: V1ProposeCredentialMessage,
    })
    const offerMessage = await this.didCommMessageRepository.findAgentMessage(messageContext.agentContext, {
      associatedRecordId: credentialRecord.id,
      messageClass: V1OfferCredentialMessage,
    })

    // Assert
    credentialRecord.assertProtocolVersion('v1')
    credentialRecord.assertState(CredentialState.OfferSent)
    this.connectionService.assertConnectionOrServiceDecorator(messageContext, {
      previousReceivedMessage: proposalMessage ?? undefined,
      previousSentMessage: offerMessage ?? undefined,
    })

    const requestAttachment = requestMessage.getRequestAttachmentById(INDY_CREDENTIAL_REQUEST_ATTACHMENT_ID)

    if (!requestAttachment) {
      throw new AriesFrameworkError(
        `Indy attachment with id ${INDY_CREDENTIAL_REQUEST_ATTACHMENT_ID} not found in request message`
      )
    }

    await this.formatService.processRequest(messageContext.agentContext, {
      credentialRecord,
      attachment: requestAttachment,
    })

    await this.didCommMessageRepository.saveAgentMessage(messageContext.agentContext, {
      agentMessage: requestMessage,
      role: DidCommMessageRole.Receiver,
      associatedRecordId: credentialRecord.id,
    })

    await this.updateState(messageContext.agentContext, credentialRecord, CredentialState.RequestReceived)

    return credentialRecord
  }

  /**
   * Create a {@link IssueCredentialMessage} as response to a received credential request.
   *
   * @returns Object containing issue credential message and associated credential record
   *
   */
  public async acceptRequest(
    agentContext: AgentContext,
    { credentialRecord, credentialFormats, comment, autoAcceptCredential }: AcceptRequestOptions<[IndyCredentialFormat]>
  ): Promise<CredentialProtocolMsgReturnType<V1IssueCredentialMessage>> {
    // Assert
    credentialRecord.assertProtocolVersion('v1')
    credentialRecord.assertState(CredentialState.RequestReceived)

    const offerMessage = await this.didCommMessageRepository.getAgentMessage(agentContext, {
      associatedRecordId: credentialRecord.id,
      messageClass: V1OfferCredentialMessage,
    })
    const requestMessage = await this.didCommMessageRepository.getAgentMessage(agentContext, {
      associatedRecordId: credentialRecord.id,
      messageClass: V1RequestCredentialMessage,
    })

    const offerAttachment = offerMessage.getOfferAttachmentById(INDY_CREDENTIAL_OFFER_ATTACHMENT_ID)
    const requestAttachment = requestMessage.getRequestAttachmentById(INDY_CREDENTIAL_REQUEST_ATTACHMENT_ID)

    if (!offerAttachment || !requestAttachment) {
      throw new AriesFrameworkError(
        `Missing data payload in offer or request attachment in credential Record ${credentialRecord.id}`
      )
    }

    const { attachment: credentialsAttach } = await this.formatService.acceptRequest(agentContext, {
      credentialRecord,
      requestAttachment,
      offerAttachment,
      attachId: INDY_CREDENTIAL_ATTACHMENT_ID,
      credentialFormats,
    })

    const issueMessage = new V1IssueCredentialMessage({
      comment,
      credentialAttachments: [credentialsAttach],
      attachments: credentialRecord.linkedAttachments,
    })

    issueMessage.setThread({ threadId: credentialRecord.threadId })
    issueMessage.setPleaseAck()

    await this.didCommMessageRepository.saveAgentMessage(agentContext, {
      agentMessage: issueMessage,
      associatedRecordId: credentialRecord.id,
      role: DidCommMessageRole.Sender,
    })

    credentialRecord.autoAcceptCredential = autoAcceptCredential ?? credentialRecord.autoAcceptCredential
    await this.updateState(agentContext, credentialRecord, CredentialState.CredentialIssued)

    return { message: issueMessage, credentialRecord }
  }

  /**
   * Process an incoming {@link IssueCredentialMessage}
   *
   * @param messageContext The message context containing a credential acknowledgement message
   * @returns credential record associated with the credential acknowledgement message
   *
   */
  public async processCredential(
    messageContext: InboundMessageContext<V1IssueCredentialMessage>
  ): Promise<CredentialExchangeRecord> {
    const { message: issueMessage, connection } = messageContext

    this.logger.debug(`Processing credential with id ${issueMessage.id}`)

    const credentialRecord = await this.getByThreadAndConnectionId(
      messageContext.agentContext,
      issueMessage.threadId,
      connection?.id
    )

    const requestCredentialMessage = await this.didCommMessageRepository.findAgentMessage(messageContext.agentContext, {
      associatedRecordId: credentialRecord.id,
      messageClass: V1RequestCredentialMessage,
    })
    const offerCredentialMessage = await this.didCommMessageRepository.findAgentMessage(messageContext.agentContext, {
      associatedRecordId: credentialRecord.id,
      messageClass: V1OfferCredentialMessage,
    })

    // Assert
    credentialRecord.assertProtocolVersion('v1')
    credentialRecord.assertState(CredentialState.RequestSent)
    this.connectionService.assertConnectionOrServiceDecorator(messageContext, {
      previousReceivedMessage: offerCredentialMessage ?? undefined,
      previousSentMessage: requestCredentialMessage ?? undefined,
    })

    const issueAttachment = issueMessage.getCredentialAttachmentById(INDY_CREDENTIAL_ATTACHMENT_ID)
    if (!issueAttachment) {
      throw new AriesFrameworkError('Missing indy credential attachment in processCredential')
    }

    await this.formatService.processCredential(messageContext.agentContext, {
      attachment: issueAttachment,
      credentialRecord,
    })

    await this.didCommMessageRepository.saveAgentMessage(messageContext.agentContext, {
      agentMessage: issueMessage,
      role: DidCommMessageRole.Receiver,
      associatedRecordId: credentialRecord.id,
    })

    await this.updateState(messageContext.agentContext, credentialRecord, CredentialState.CredentialReceived)

    return credentialRecord
  }

  /**
   * Create a {@link CredentialAckMessage} as response to a received credential.
   *
   * @param credentialRecord The credential record for which to create the credential acknowledgement
   * @returns Object containing credential acknowledgement message and associated credential record
   *
   */
  public async acceptCredential(
    agentContext: AgentContext,
    { credentialRecord }: AcceptCredentialOptions
  ): Promise<CredentialProtocolMsgReturnType<V1CredentialAckMessage>> {
    credentialRecord.assertProtocolVersion('v1')
    credentialRecord.assertState(CredentialState.CredentialReceived)

    // Create message
    const ackMessage = new V1CredentialAckMessage({
      status: AckStatus.OK,
      threadId: credentialRecord.threadId,
    })

    await this.updateState(agentContext, credentialRecord, CredentialState.Done)

    return { message: ackMessage, credentialRecord }
  }

  /**
   * Process a received {@link CredentialAckMessage}.
   *
   * @param messageContext The message context containing a credential acknowledgement message
   * @returns credential record associated with the credential acknowledgement message
   *
   */
  public async processAck(
    messageContext: InboundMessageContext<V1CredentialAckMessage>
  ): Promise<CredentialExchangeRecord> {
    const { message: ackMessage, connection } = messageContext

    this.logger.debug(`Processing credential ack with id ${ackMessage.id}`)

    const credentialRecord = await this.getByThreadAndConnectionId(
      messageContext.agentContext,
      ackMessage.threadId,
      connection?.id
    )

    const requestCredentialMessage = await this.didCommMessageRepository.getAgentMessage(messageContext.agentContext, {
      associatedRecordId: credentialRecord.id,
      messageClass: V1RequestCredentialMessage,
    })
    const issueCredentialMessage = await this.didCommMessageRepository.getAgentMessage(messageContext.agentContext, {
      associatedRecordId: credentialRecord.id,
      messageClass: V1IssueCredentialMessage,
    })

    // Assert
    credentialRecord.assertProtocolVersion('v1')
    credentialRecord.assertState(CredentialState.CredentialIssued)
    this.connectionService.assertConnectionOrServiceDecorator(messageContext, {
      previousReceivedMessage: requestCredentialMessage,
      previousSentMessage: issueCredentialMessage,
    })

    // Update record
    await this.updateState(messageContext.agentContext, credentialRecord, CredentialState.Done)

    return credentialRecord
  }

  /**
   * Create a {@link V1CredentialProblemReportMessage} to be sent.
   *
   * @param message message to send
   * @returns a {@link V1CredentialProblemReportMessage}
   *
   */
  public createProblemReport(agentContext: AgentContext, options: CreateProblemReportOptions): ProblemReportMessage {
    return new V1CredentialProblemReportMessage({
      description: {
        en: options.message,
        code: CredentialProblemReportReason.IssuanceAbandoned,
      },
    })
  }

  // AUTO RESPOND METHODS
  public async shouldAutoRespondToProposal(
    agentContext: AgentContext,
    options: {
      credentialRecord: CredentialExchangeRecord
      proposalMessage: V1ProposeCredentialMessage
    }
  ): Promise<boolean> {
    const { credentialRecord, proposalMessage } = options
    const autoAccept = composeAutoAccept(
      credentialRecord.autoAcceptCredential,
      this.credentialsModuleConfig.autoAcceptCredentials
    )

    // Handle always / never cases
    if (autoAccept === AutoAcceptCredential.Always) return true
    if (autoAccept === AutoAcceptCredential.Never) return false

    const offerMessage = await this.findOfferMessage(agentContext, credentialRecord.id)

    // Do not auto accept if missing properties
    if (!offerMessage || !offerMessage.credentialPreview) return false
    if (!proposalMessage.credentialPreview || !proposalMessage.credentialDefinitionId) return false

    const credentialOfferJson = offerMessage.indyCredentialOffer

    // Check if credential definition id matches
    if (!credentialOfferJson) return false
    if (credentialOfferJson.cred_def_id !== proposalMessage.credentialDefinitionId) return false

    // Check if preview values match
    return arePreviewAttributesEqual(
      proposalMessage.credentialPreview.attributes,
      offerMessage.credentialPreview.attributes
    )
  }

  public async shouldAutoRespondToOffer(
    agentContext: AgentContext,
    options: {
      credentialRecord: CredentialExchangeRecord
      offerMessage: V1OfferCredentialMessage
    }
  ) {
    const { credentialRecord, offerMessage } = options
    const autoAccept = composeAutoAccept(
      credentialRecord.autoAcceptCredential,
      this.credentialsModuleConfig.autoAcceptCredentials
    )

    // Handle always / never cases
    if (autoAccept === AutoAcceptCredential.Always) return true
    if (autoAccept === AutoAcceptCredential.Never) return false

    const proposalMessage = await this.findProposalMessage(agentContext, credentialRecord.id)

    // Do not auto accept if missing properties
    if (!offerMessage.credentialPreview) return false
    if (!proposalMessage || !proposalMessage.credentialPreview || !proposalMessage.credentialDefinitionId) return false

    const credentialOfferJson = offerMessage.indyCredentialOffer

    // Check if credential definition id matches
    if (!credentialOfferJson) return false
    if (credentialOfferJson.cred_def_id !== proposalMessage.credentialDefinitionId) return false

    // Check if preview values match
    return arePreviewAttributesEqual(
      proposalMessage.credentialPreview.attributes,
      offerMessage.credentialPreview.attributes
    )
  }

  public async shouldAutoRespondToRequest(
    agentContext: AgentContext,
    options: {
      credentialRecord: CredentialExchangeRecord
      requestMessage: V1RequestCredentialMessage
    }
  ) {
    const { credentialRecord, requestMessage } = options
    const autoAccept = composeAutoAccept(
      credentialRecord.autoAcceptCredential,
      this.credentialsModuleConfig.autoAcceptCredentials
    )

    // Handle always / never cases
    if (autoAccept === AutoAcceptCredential.Always) return true
    if (autoAccept === AutoAcceptCredential.Never) return false

    const offerMessage = await this.findOfferMessage(agentContext, credentialRecord.id)
    if (!offerMessage) return false

    const offerAttachment = offerMessage.getOfferAttachmentById(INDY_CREDENTIAL_OFFER_ATTACHMENT_ID)
    const requestAttachment = requestMessage.getRequestAttachmentById(INDY_CREDENTIAL_REQUEST_ATTACHMENT_ID)

    if (!offerAttachment || !requestAttachment) return false

    return this.formatService.shouldAutoRespondToRequest(agentContext, {
      credentialRecord,
      offerAttachment,
      requestAttachment,
    })
  }

  public async shouldAutoRespondToCredential(
    agentContext: AgentContext,
    options: {
      credentialRecord: CredentialExchangeRecord
      credentialMessage: V1IssueCredentialMessage
    }
  ) {
    const { credentialRecord, credentialMessage } = options
    const autoAccept = composeAutoAccept(
      credentialRecord.autoAcceptCredential,
      this.credentialsModuleConfig.autoAcceptCredentials
    )

    // Handle always / never cases
    if (autoAccept === AutoAcceptCredential.Always) return true
    if (autoAccept === AutoAcceptCredential.Never) return false

    const requestMessage = await this.findRequestMessage(agentContext, credentialRecord.id)
    const offerMessage = await this.findOfferMessage(agentContext, credentialRecord.id)

    const credentialAttachment = credentialMessage.getCredentialAttachmentById(INDY_CREDENTIAL_ATTACHMENT_ID)
    if (!credentialAttachment) return false

    const requestAttachment = requestMessage?.getRequestAttachmentById(INDY_CREDENTIAL_REQUEST_ATTACHMENT_ID)
    if (!requestAttachment) return false

    const offerAttachment = offerMessage?.getOfferAttachmentById(INDY_CREDENTIAL_OFFER_ATTACHMENT_ID)

    return this.formatService.shouldAutoRespondToCredential(agentContext, {
      credentialRecord,
      credentialAttachment,
      requestAttachment,
      offerAttachment,
    })
  }

  public async findProposalMessage(agentContext: AgentContext, credentialExchangeId: string) {
    return await this.didCommMessageRepository.findAgentMessage(agentContext, {
      associatedRecordId: credentialExchangeId,
      messageClass: V1ProposeCredentialMessage,
    })
  }

  public async findOfferMessage(agentContext: AgentContext, credentialExchangeId: string) {
    return await this.didCommMessageRepository.findAgentMessage(agentContext, {
      associatedRecordId: credentialExchangeId,
      messageClass: V1OfferCredentialMessage,
    })
  }

  public async findRequestMessage(agentContext: AgentContext, credentialExchangeId: string) {
    return await this.didCommMessageRepository.findAgentMessage(agentContext, {
      associatedRecordId: credentialExchangeId,
      messageClass: V1RequestCredentialMessage,
    })
  }

  public async findCredentialMessage(agentContext: AgentContext, credentialExchangeId: string) {
    return await this.didCommMessageRepository.findAgentMessage(agentContext, {
      associatedRecordId: credentialExchangeId,
      messageClass: V1IssueCredentialMessage,
    })
  }

  public async getFormatData(
    agentContext: AgentContext,
    credentialExchangeId: string
  ): Promise<GetFormatDataReturn<CredentialFormat[]>> {
    // TODO: we could looking at fetching all record using a single query and then filtering based on the type of the message.
    const [proposalMessage, offerMessage, requestMessage, credentialMessage] = await Promise.all([
      this.findProposalMessage(agentContext, credentialExchangeId),
      this.findOfferMessage(agentContext, credentialExchangeId),
      this.findRequestMessage(agentContext, credentialExchangeId),
      this.findCredentialMessage(agentContext, credentialExchangeId),
    ])

    const indyProposal = proposalMessage
      ? JsonTransformer.toJSON(this.rfc0592ProposalFromV1ProposeMessage(proposalMessage))
      : undefined

    const indyOffer = offerMessage?.indyCredentialOffer ?? undefined
    const indyRequest = requestMessage?.indyCredentialRequest ?? undefined
    const indyCredential = credentialMessage?.indyCredential ?? undefined

    return {
      proposalAttributes: proposalMessage?.credentialPreview?.attributes,
      proposal: proposalMessage
        ? {
            indy: indyProposal,
          }
        : undefined,
      offerAttributes: offerMessage?.credentialPreview?.attributes,
      offer: offerMessage
        ? {
            indy: indyOffer,
          }
        : undefined,
      request: requestMessage
        ? {
            indy: indyRequest,
          }
        : undefined,
      credential: credentialMessage
        ? {
            indy: indyCredential,
          }
        : undefined,
    }
  }

  protected registerHandlers() {
    this.dispatcher.registerHandler(new V1ProposeCredentialHandler(this, this.logger))
    this.dispatcher.registerHandler(
      new V1OfferCredentialHandler(this, this.routingService, this.didCommMessageRepository, this.logger)
    )
    this.dispatcher.registerHandler(new V1RequestCredentialHandler(this, this.didCommMessageRepository, this.logger))
    this.dispatcher.registerHandler(new V1IssueCredentialHandler(this, this.didCommMessageRepository, this.logger))
    this.dispatcher.registerHandler(new V1CredentialAckHandler(this))
    this.dispatcher.registerHandler(new V1CredentialProblemReportHandler(this))
  }

  private rfc0592ProposalFromV1ProposeMessage(proposalMessage: V1ProposeCredentialMessage) {
    const indyCredentialProposal = new IndyCredPropose({
      credentialDefinitionId: proposalMessage.credentialDefinitionId,
      schemaId: proposalMessage.schemaId,
      issuerDid: proposalMessage.issuerDid,
      schemaIssuerDid: proposalMessage.schemaIssuerDid,
      schemaName: proposalMessage.schemaName,
      schemaVersion: proposalMessage.schemaVersion,
    })

    return indyCredentialProposal
  }

  private assertOnlyIndyFormat(credentialFormats: Record<string, unknown>) {
    const formatKeys = Object.keys(credentialFormats)

    // It's fine to not have any formats in some cases, if indy is required the method that calls this should check for this
    if (formatKeys.length === 0) return

    if (formatKeys.length !== 1 || !formatKeys.includes('indy')) {
      throw new AriesFrameworkError('Only indy credential format is supported for issue credential v1 protocol')
    }
  }
}
