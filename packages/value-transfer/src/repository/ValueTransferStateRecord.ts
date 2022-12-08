import type { RecordTags, TagsBase } from '@aries-framework/core'

import { BaseRecord } from '@aries-framework/core'
import { PartyState } from '@sicpa-dlab/value-transfer-protocol-ts'
import { Type } from 'class-transformer'
import { v4 } from 'uuid'

export type CustomValueTransferStateTags = TagsBase
export type DefaultValueTransferStateTags = TagsBase
export type ValueTransferStateTags = RecordTags<ValueTransferStateRecord>

export interface ValueTransferStateProps {
  id?: string
  partyState: PartyState
}

export class ValueTransferStateRecord extends BaseRecord<DefaultValueTransferStateTags, CustomValueTransferStateTags> {
  @Type(() => PartyState)
  public partyState!: PartyState

  public static readonly type = 'ValueTransferState'
  public readonly type = ValueTransferStateRecord.type

  public constructor(props: ValueTransferStateProps) {
    super()

    if (props) {
      this.id = props.id ?? v4()
      this.partyState = props.partyState
    }
  }

  public getTags() {
    return {
      ...this._tags,
    }
  }
}
