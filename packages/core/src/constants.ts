export const InjectionSymbols = {
  MessageRepository: Symbol('MessageRepository'),
  StorageService: Symbol('StorageService'),
  Logger: Symbol('Logger'),
  AgentContextProvider: Symbol('AgentContextProvider'),
  AgentDependencies: Symbol('AgentDependencies'),
  Stop$: Symbol('Stop$'),
  FileSystem: Symbol('FileSystem'),
  Wallet: Symbol('Wallet'),
  DIDCommV1EnvelopeService: Symbol('DIDCommV1EnvelopeService'),
  DIDCommV2EnvelopeService: Symbol('DIDCommV2EnvelopeService'),
}

export const DID_COMM_TRANSPORT_QUEUE = 'didcomm:transport/queue'
