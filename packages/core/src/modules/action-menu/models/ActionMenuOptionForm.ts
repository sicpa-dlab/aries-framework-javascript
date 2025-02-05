import type { ActionMenuFormParameterOptions } from './ActionMenuOptionFormParameter'

import { Expose, Type } from 'class-transformer'
import { IsInstance, IsString } from 'class-validator'

import { ActionMenuFormParameter } from './ActionMenuOptionFormParameter'

export interface ActionMenuFormOptions {
  description: string
  params: ActionMenuFormParameterOptions[]
  submitLabel: string
}

export class ActionMenuForm {
  public constructor(options: ActionMenuFormOptions) {
    if (options) {
      this.description = options.description
      this.params = options.params.map((p) => new ActionMenuFormParameter(p))
      this.submitLabel = options.submitLabel
    }
  }

  @IsString()
  public description!: string

  @Expose({ name: 'submit-label' })
  @IsString()
  public submitLabel!: string

  @IsInstance(ActionMenuFormParameter, { each: true })
  @Type(() => ActionMenuFormParameter)
  public params!: ActionMenuFormParameter[]
}
