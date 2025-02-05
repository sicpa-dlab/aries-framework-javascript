import type { DidDocumentService } from './service'

import { DidDocument } from './DidDocument'
import { VerificationMethod } from './verificationMethod'

export class DidDocumentBuilder {
  private didDocument: DidDocument

  public constructor(id: string) {
    this.didDocument = new DidDocument({
      id,
    })
  }

  public addContext(context: string) {
    if (typeof this.didDocument.context === 'string') {
      this.didDocument.context = [this.didDocument.context, context]
    } else {
      this.didDocument.context.push(context)
    }

    return this
  }

  public addEd25519Context() {
    this.addContext('https://w3id.org/security/suites/ed25519-2018/v1')
    return this
  }

  public addX25519Context() {
    this.addContext('https://w3id.org/security/suites/x25519-2019/v1')
    return this
  }

  public addService(service: DidDocumentService) {
    if (!this.didDocument.service) {
      this.didDocument.service = []
    }

    this.didDocument.service.push(service)

    return this
  }

  public addVerificationMethod(verificationMethod: VerificationMethod) {
    if (!this.didDocument.verificationMethod) {
      this.didDocument.verificationMethod = []
    }

    this.didDocument.verificationMethod.push(
      verificationMethod instanceof VerificationMethod ? verificationMethod : new VerificationMethod(verificationMethod)
    )

    return this
  }

  public addAuthentication(authentication: string | VerificationMethod) {
    if (!this.didDocument.authentication) {
      this.didDocument.authentication = []
    }

    const verificationMethod =
      authentication instanceof VerificationMethod || typeof authentication === 'string'
        ? authentication
        : new VerificationMethod(authentication)

    this.didDocument.authentication.push(verificationMethod)

    return this
  }

  public addAssertionMethod(assertionMethod: string | VerificationMethod) {
    if (!this.didDocument.assertionMethod) {
      this.didDocument.assertionMethod = []
    }

    const verificationMethod =
      assertionMethod instanceof VerificationMethod || typeof assertionMethod === 'string'
        ? assertionMethod
        : new VerificationMethod(assertionMethod)

    this.didDocument.assertionMethod.push(verificationMethod)

    return this
  }

  public addCapabilityDelegation(capabilityDelegation: string | VerificationMethod) {
    if (!this.didDocument.capabilityDelegation) {
      this.didDocument.capabilityDelegation = []
    }

    const verificationMethod =
      capabilityDelegation instanceof VerificationMethod || typeof capabilityDelegation === 'string'
        ? capabilityDelegation
        : new VerificationMethod(capabilityDelegation)

    this.didDocument.capabilityDelegation.push(verificationMethod)

    return this
  }
  public addCapabilityInvocation(capabilityInvocation: string | VerificationMethod) {
    if (!this.didDocument.capabilityInvocation) {
      this.didDocument.capabilityInvocation = []
    }

    const verificationMethod =
      capabilityInvocation instanceof VerificationMethod || typeof capabilityInvocation === 'string'
        ? capabilityInvocation
        : new VerificationMethod(capabilityInvocation)

    this.didDocument.capabilityInvocation.push(verificationMethod)

    return this
  }

  public addKeyAgreement(keyAgreement: string | VerificationMethod) {
    if (!this.didDocument.keyAgreement) {
      this.didDocument.keyAgreement = []
    }

    const verificationMethod =
      keyAgreement instanceof VerificationMethod || typeof keyAgreement === 'string'
        ? keyAgreement
        : new VerificationMethod(keyAgreement)

    this.didDocument.keyAgreement.push(verificationMethod)

    return this
  }

  public build(): DidDocument {
    return this.didDocument
  }
}
