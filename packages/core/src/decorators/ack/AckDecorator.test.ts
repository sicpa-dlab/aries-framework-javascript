import { DIDCommV1Message } from '../../agent/didcomm'
import { ClassValidationError } from '../../error/ClassValidationError'
import { JsonTransformer } from '../../utils/JsonTransformer'
import { MessageValidator } from '../../utils/MessageValidator'
import { Compose } from '../../utils/mixins'

import { AckDecorated } from './AckDecoratorExtension'

describe('Decorators | AckDecoratorExtension', () => {
  class TestMessage extends Compose(DIDCommV1Message, [AckDecorated]) {
    public toJSON(): Record<string, unknown> {
      return JsonTransformer.toJSON(this)
    }
  }

  test('transforms AckDecorator class to JSON', () => {
    const message = new TestMessage()
    message.setPleaseAck()
    expect(message.toJSON()).toEqual({
      '@id': undefined,
      '@type': undefined,
      '~please_ack': {
        on: ['RECEIPT'],
      },
    })
  })

  test('transforms Json to AckDecorator class', () => {
    const transformed = JsonTransformer.fromJSON(
      {
        '~please_ack': {},
        '@id': '7517433f-1150-46f2-8495-723da61b872a',
        '@type': 'https://didcomm.org/test-protocol/1.0/test-message',
      },
      TestMessage
    )

    expect(transformed).toEqual({
      id: '7517433f-1150-46f2-8495-723da61b872a',
      type: 'https://didcomm.org/test-protocol/1.0/test-message',
      pleaseAck: {
        on: ['RECEIPT'],
      },
    })
    expect(transformed).toBeInstanceOf(TestMessage)
  })

  // this covers the pre-aip 2 please ack decorator
  test('sets `on` value to `receipt` if `on` is not present in ack decorator', () => {
    const transformed = JsonTransformer.fromJSON(
      {
        '~please_ack': {},
        '@id': '7517433f-1150-46f2-8495-723da61b872a',
        '@type': 'https://didcomm.org/test-protocol/1.0/test-message',
      },
      TestMessage
    )

    expect(transformed).toEqual({
      id: '7517433f-1150-46f2-8495-723da61b872a',
      type: 'https://didcomm.org/test-protocol/1.0/test-message',
      pleaseAck: {
        on: ['RECEIPT'],
      },
    })
    expect(transformed).toBeInstanceOf(TestMessage)
  })

  test('successfully validates please ack decorator', async () => {
    const transformedWithDefault = JsonTransformer.fromJSON(
      {
        '~please_ack': {},
        '@id': '7517433f-1150-46f2-8495-723da61b872a',
        '@type': 'https://didcomm.org/test-protocol/1.0/test-message',
      },
      TestMessage
    )

    expect(MessageValidator.validateSync(transformedWithDefault)).toBeUndefined()
  })

  test('transforms Json to AckDecorator class', () => {
    const transformed = () =>
      JsonTransformer.fromJSON(
        {
          '~please_ack': {},
          '@id': undefined,
          '@type': undefined,
        },
        TestMessage
      )

    expect(() => transformed()).toThrow(ClassValidationError)
    try {
      transformed()
    } catch (e) {
      const caughtError = e as ClassValidationError
      expect(caughtError.message).toEqual(
        'TestMessage: Failed to validate class.\nAn instance of TestMessage has failed the validation:\n - property id has failed the following constraints: matches \n\nAn instance of TestMessage has failed the validation:\n - property type has failed the following constraints: matches \n'
      )
      expect(caughtError.validationErrors).toMatchObject([
        {
          children: [],
          constraints: {
            matches: 'id must match /[-_./a-zA-Z0-9]{8,64}/ regular expression',
          },
          property: 'id',
          target: {
            pleaseAck: {
              on: ['RECEIPT'],
            },
          },
          value: undefined,
        },
        {
          children: [],
          constraints: {
            matches: 'type must match /(.*?)([a-zA-Z0-9._-]+)\\/(\\d[^/]*)\\/([a-zA-Z0-9._-]+)$/ regular expression',
          },
          property: 'type',
          target: {
            pleaseAck: {
              on: ['RECEIPT'],
            },
          },
          value: undefined,
        },
      ])
    }
  })
})
