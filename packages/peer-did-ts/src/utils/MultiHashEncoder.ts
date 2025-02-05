import type { HashName } from './Hasher'

import { Buffer } from 'buffer'

import { Hasher } from './Hasher'
import { VarintEncoder } from './VarintEncoder'

type MultiHashNameMap = {
  [key in HashName]: number
}

type MultiHashCodeMap = {
  [key: number]: HashName
}

const multiHashNameMap: MultiHashNameMap = {
  'sha2-256': 0x12,
}

const multiHashCodeMap: MultiHashCodeMap = Object.entries(multiHashNameMap).reduce(
  (map, [hashName, hashCode]) => ({ ...map, [hashCode]: hashName }),
  {}
)

export class MultiHashEncoder {
  /**
   *
   * Encodes a buffer into a hash
   *
   * @param data
   * @param hashName the hashing algorithm, 'sha2-256'
   *
   * @returns a multihash
   */
  public static encode(data: Uint8Array, hashName: 'sha2-256'): Buffer {
    const hash = Hasher.hash(data, hashName)
    const hashCode = multiHashNameMap[hashName]

    const hashPrefix = VarintEncoder.encode(hashCode)
    const hashLengthPrefix = VarintEncoder.encode(hash.length)

    return Buffer.concat([hashPrefix, hashLengthPrefix, hash])
  }

  /**
   *
   * Decodes the multihash
   *
   * @param data the multihash that has to be decoded
   *
   * @returns object with the data and the hashing algorithm
   */
  public static decode(data: Uint8Array): { data: Buffer; hashName: string } {
    const [hashPrefix, hashPrefixByteLength] = VarintEncoder.decode(data)
    const withoutHashPrefix = data.slice(hashPrefixByteLength)

    const [, lengthPrefixByteLength] = VarintEncoder.decode(withoutHashPrefix)
    const withoutLengthPrefix = withoutHashPrefix.slice(lengthPrefixByteLength)

    const hashName = multiHashCodeMap[hashPrefix]

    if (!hashName) {
      throw new Error(`Unsupported hash code 0x${hashPrefix.toString(16)}`)
    }

    return {
      data: Buffer.from(withoutLengthPrefix),
      hashName: multiHashCodeMap[hashPrefix],
    }
  }

  /**
   *
   * Validates if it is a valid mulithash
   *
   * @param data the multihash that needs to be validated
   *
   * @returns a boolean whether the multihash is valid
   */
  public static isValid(data: Uint8Array): boolean {
    try {
      MultiHashEncoder.decode(data)
      return true
    } catch (e) {
      return false
    }
  }
}
