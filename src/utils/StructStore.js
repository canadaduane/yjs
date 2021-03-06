
import {
  GC,
  Transaction, AbstractStructRef, ID, ItemType, AbstractItem, AbstractStruct // eslint-disable-line
} from '../internals.js'

import * as math from 'lib0/math.js'
import * as error from 'lib0/error.js'
import * as decoding from 'lib0/decoding.js' // eslint-disable-line

export class StructStore {
  constructor () {
    /**
     * @type {Map<number,Array<AbstractStruct>>}
     * @private
     */
    this.clients = new Map()
    /**
     * Store incompleted struct reads here
     * `i` denotes to the next read operation
     * We could shift the array of refs instead, but shift is incredible
     * slow in Chrome for arrays with more than 100k elements
     * @see tryResumePendingStructRefs
     * @type {Map<number,{i:number,refs:Array<AbstractStructRef>}>}
     * @private
     */
    this.pendingClientsStructRefs = new Map()
    /**
     * Stack of pending structs waiting for struct dependencies
     * Maximum length of stack is structReaders.size
     * @type {Array<AbstractStructRef>}
     * @private
     */
    this.pendingStack = []
    /**
     * @type {Array<decoding.Decoder>}
     * @private
     */
    this.pendingDeleteReaders = []
  }
}

/**
 * Return the states as a Map<client,clock>.
 * Note that clock refers to the next expected clock id.
 *
 * @param {StructStore} store
 * @return {Map<number,number>}
 *
 * @public
 * @function
 */
export const getStateVector = store => {
  const sm = new Map()
  store.clients.forEach((structs, client) => {
    const struct = structs[structs.length - 1]
    sm.set(client, struct.id.clock + struct.length)
  })
  return sm
}

/**
 * @param {StructStore} store
 * @param {number} client
 * @return {number}
 *
 * @public
 * @function
 */
export const getState = (store, client) => {
  const structs = store.clients.get(client)
  if (structs === undefined) {
    return 0
  }
  const lastStruct = structs[structs.length - 1]
  return lastStruct.id.clock + lastStruct.length
}

/**
 * @param {StructStore} store
 *
 * @private
 * @function
 */
export const integretyCheck = store => {
  store.clients.forEach(structs => {
    for (let i = 1; i < structs.length; i++) {
      const l = structs[i - 1]
      const r = structs[i]
      if (l.id.clock + l.length !== r.id.clock) {
        throw new Error('StructStore failed integrety check')
      }
    }
  })
}

/**
 * @param {StructStore} store
 * @param {AbstractStruct} struct
 *
 * @private
 * @function
 */
export const addStruct = (store, struct) => {
  let structs = store.clients.get(struct.id.client)
  if (structs === undefined) {
    structs = []
    store.clients.set(struct.id.client, structs)
  } else {
    const lastStruct = structs[structs.length - 1]
    if (lastStruct.id.clock + lastStruct.length !== struct.id.clock) {
      throw error.unexpectedCase()
    }
  }
  structs.push(struct)
}

/**
 * Perform a binary search on a sorted array
 * @param {Array<any>} structs
 * @param {number} clock
 * @return {number}
 *
 * @private
 * @function
 */
export const findIndexSS = (structs, clock) => {
  let left = 0
  let right = structs.length - 1
  while (left <= right) {
    const midindex = math.floor((left + right) / 2)
    const mid = structs[midindex]
    const midclock = mid.id.clock
    if (midclock <= clock) {
      if (clock < midclock + mid.length) {
        return midindex
      }
      left = midindex + 1
    } else {
      right = midindex - 1
    }
  }
  // Always check state before looking for a struct in StructStore
  // Therefore the case of not finding a struct is unexpected
  throw error.unexpectedCase()
}

/**
 * Expects that id is actually in store. This function throws or is an infinite loop otherwise.
 *
 * @param {StructStore} store
 * @param {ID} id
 * @return {AbstractStruct}
 *
 * @private
 * @function
 */
export const find = (store, id) => {
  /**
   * @type {Array<AbstractStruct>}
   */
  // @ts-ignore
  const structs = store.clients.get(id.client)
  return structs[findIndexSS(structs, id.clock)]
}

/**
 * Expects that id is actually in store. This function throws or is an infinite loop otherwise.
 *
 * @param {StructStore} store
 * @param {ID} id
 * @return {AbstractItem}
 *
 * @private
 * @function
 */
// @ts-ignore
export const getItem = (store, id) => find(store, id)

/**
 * Expects that id is actually in store. This function throws or is an infinite loop otherwise.
 *
 * @param {StructStore} store
 * @param {ID} id
 * @return {ItemType}
 *
 * @private
 * @function
 */
// @ts-ignore
export const getItemType = (store, id) => find(store, id)

/**
 * Expects that id is actually in store. This function throws or is an infinite loop otherwise.
 *
 * @param {Transaction} transaction
 * @param {StructStore} store
 * @param {ID} id
 * @return {AbstractItem}
 *
 * @private
 * @function
 */
export const getItemCleanStart = (transaction, store, id) => {
  /**
   * @type {Array<AbstractItem>}
   */
  // @ts-ignore
  const structs = store.clients.get(id.client)
  const index = findIndexSS(structs, id.clock)
  /**
   * @type {AbstractItem}
   */
  let struct = structs[index]
  if (struct.id.clock < id.clock && struct.constructor !== GC) {
    struct = struct.splitAt(transaction, id.clock - struct.id.clock)
    structs.splice(index + 1, 0, struct)
  }
  return struct
}

/**
 * Expects that id is actually in store. This function throws or is an infinite loop otherwise.
 *
 * @param {Transaction} transaction
 * @param {StructStore} store
 * @param {ID} id
 * @return {AbstractItem}
 *
 * @private
 * @function
 */
export const getItemCleanEnd = (transaction, store, id) => {
  /**
   * @type {Array<AbstractItem>}
   */
  // @ts-ignore
  const structs = store.clients.get(id.client)
  const index = findIndexSS(structs, id.clock)
  const struct = structs[index]
  if (id.clock !== struct.id.clock + struct.length - 1 && struct.constructor !== GC) {
    structs.splice(index + 1, 0, struct.splitAt(transaction, id.clock - struct.id.clock + 1))
  }
  return struct
}

/**
 * Replace `item` with `newitem` in store
 * @param {StructStore} store
 * @param {AbstractStruct} struct
 * @param {AbstractStruct} newStruct
 *
 * @private
 * @function
 */
export const replaceStruct = (store, struct, newStruct) => {
  /**
   * @type {Array<AbstractStruct>}
   */
  // @ts-ignore
  const structs = store.clients.get(struct.id.client)
  structs[findIndexSS(structs, struct.id.clock)] = newStruct
}
