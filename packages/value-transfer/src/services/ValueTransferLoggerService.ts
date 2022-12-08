/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Logger } from '@aries-framework/core'
import type { Logger as ValueTransferLogger, LogLevel } from '@sicpa-dlab/value-transfer-common-ts'

import { AgentConfig, injectable } from '@aries-framework/core'

@injectable()
export class ValueTransferLoggerService implements ValueTransferLogger {
  public logLevel: LogLevel
  private logger: Logger

  public constructor(config: AgentConfig) {
    this.logger = config.logger.createContextLogger('VTP-LogService')
    this.logLevel = config.logger.logLevel
  }

  public debug(message: string, data?: Record<string, any>): void {
    this.logger.debug(message, data)
  }

  public error(message: string, data?: Record<string, any>): void {
    this.logger.error(message, data)
  }

  public fatal(message: string, data?: Record<string, any>): void {
    this.logger.fatal(message, data)
  }

  public info(message: string, data?: Record<string, any>): void {
    this.logger.info(message, data)
  }

  public test(message: string, data?: Record<string, any>): void {
    this.logger.test(message, data)
  }

  public trace(message: string, data?: Record<string, any>): void {
    this.logger.trace(message, data)
  }

  public warn(message: string, data?: Record<string, any>): void {
    this.logger.warn(message, data)
  }
}
