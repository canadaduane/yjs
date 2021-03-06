
import {
  AbstractItem,
  AbstractItemRef,
  computeItemParams,
  splitItem,
  changeItemRefOffset,
  GC,
  mergeItemWith,
  Transaction, StructStore, ID, AbstractType // eslint-disable-line
} from '../internals.js'

import * as encoding from 'lib0/encoding.js'
import * as decoding from 'lib0/decoding.js'

export const structStringRefNumber = 6

/**
 * @private
 */
export class ItemString extends AbstractItem {
  /**
   * @param {ID} id
   * @param {AbstractItem | null} left
   * @param {ID | null} origin
   * @param {AbstractItem | null} right
   * @param {ID | null} rightOrigin
   * @param {AbstractType<any>} parent
   * @param {string | null} parentSub
   * @param {string} string
   */
  constructor (id, left, origin, right, rightOrigin, parent, parentSub, string) {
    super(id, left, origin, right, rightOrigin, parent, parentSub)
    /**
     * @type {string}
     */
    this.string = string
  }
  /**
   * @param {ID} id
   * @param {AbstractItem | null} left
   * @param {ID | null} origin
   * @param {AbstractItem | null} right
   * @param {ID | null} rightOrigin
   * @param {AbstractType<any>} parent
   * @param {string | null} parentSub
   */
  copy (id, left, origin, right, rightOrigin, parent, parentSub) {
    return new ItemString(id, left, origin, right, rightOrigin, parent, parentSub, this.string)
  }
  getContent () {
    return this.string.split('')
  }
  get length () {
    return this.string.length
  }
  /**
   * @param {Transaction} transaction
   * @param {number} diff
   * @return {ItemString}
   */
  splitAt (transaction, diff) {
    /**
     * @type {ItemString}
     */
    // @ts-ignore
    const right = splitItem(transaction, this, diff)
    right.string = this.string.slice(diff)
    this.string = this.string.slice(0, diff)
    return right
  }
  /**
   * @param {ItemString} right
   * @return {boolean}
   */
  mergeWith (right) {
    if (mergeItemWith(this, right)) {
      this.string += right.string
      return true
    }
    return false
  }
  /**
   * @param {encoding.Encoder} encoder
   * @param {number} offset
   */
  write (encoder, offset) {
    super.write(encoder, offset, structStringRefNumber)
    encoding.writeVarString(encoder, offset === 0 ? this.string : this.string.slice(offset))
  }
}

/**
 * @private
 */
export class ItemStringRef extends AbstractItemRef {
  /**
   * @param {decoding.Decoder} decoder
   * @param {ID} id
   * @param {number} info
   */
  constructor (decoder, id, info) {
    super(decoder, id, info)
    /**
     * @type {string}
     */
    this.string = decoding.readVarString(decoder)
  }
  get length () {
    return this.string.length
  }
  /**
   * @param {Transaction} transaction
   * @param {StructStore} store
   * @param {number} offset
   * @return {ItemString|GC}
   */
  toStruct (transaction, store, offset) {
    if (offset > 0) {
      changeItemRefOffset(this, offset)
      this.string = this.string.slice(offset)
    }

    const { left, right, parent, parentSub } = computeItemParams(transaction, store, this.left, this.right, this.parent, this.parentSub, this.parentYKey)
    return parent === null
      ? new GC(this.id, this.length)
      : new ItemString(
        this.id,
        left,
        this.left,
        right,
        this.right,
        parent,
        parentSub,
        this.string
      )
  }
}
