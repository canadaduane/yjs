
import {
  findIndexSS,
  createID,
  getState,
  AbstractStruct, AbstractItem, StructStore, Transaction, ID // eslint-disable-line
} from '../internals.js'

import * as math from 'lib0/math.js'
import * as map from 'lib0/map.js'
import * as encoding from 'lib0/encoding.js'
import * as decoding from 'lib0/decoding.js'

class DeleteItem {
  /**
   * @param {number} clock
   * @param {number} len
   */
  constructor (clock, len) {
    /**
     * @type {number}
     */
    this.clock = clock
    /**
     * @type {number}
     */
    this.len = len
  }
}

/**
 * We no longer maintain a DeleteStore. DeleteSet is a temporary object that is created when needed.
 * - When created in a transaction, it must only be accessed after sorting, and merging
 *   - This DeleteSet is send to other clients
 * - We do not create a DeleteSet when we send a sync message. The DeleteSet message is created directly from StructStore
 * - We read a DeleteSet as part of a sync/update message. In this case the DeleteSet is already sorted and merged.
 */
export class DeleteSet {
  constructor () {
    /**
     * @type {Map<number,Array<DeleteItem>>}
     * @private
     */
    this.clients = new Map()
  }
}

/**
 * Iterate over all structs that were deleted.
 *
 * This function expects that the deletes structs are not merged. Hence, you can
 * probably only use it in type observes and `afterTransaction` events. But not
 * in `afterTransactionCleanup`.
 *
 * @param {DeleteSet} ds
 * @param {StructStore} store
 * @param {function(AbstractStruct):void} f
 *
 * @function
 */
export const iterateDeletedStructs = (ds, store, f) =>
  ds.clients.forEach((deletes, clientid) => {
    const structs = /** @type {Array<AbstractStruct>} */ (store.clients.get(clientid))
    for (let i = 0; i < deletes.length; i++) {
      const del = deletes[i]
      let index = findIndexSS(structs, del.clock)
      let struct
      do {
        struct = structs[index++]
        f(struct)
      } while (index < structs.length && structs[index].id.clock < del.clock + del.len)
    }
  })

/**
 * @param {Array<DeleteItem>} dis
 * @param {number} clock
 * @return {number|null}
 *
 * @private
 * @function
 */
export const findIndexDS = (dis, clock) => {
  let left = 0
  let right = dis.length - 1
  while (left <= right) {
    const midindex = math.floor((left + right) / 2)
    const mid = dis[midindex]
    const midclock = mid.clock
    if (midclock <= clock) {
      if (clock < midclock + mid.len) {
        return midindex
      }
      left = midindex + 1
    } else {
      right = midindex - 1
    }
  }
  return null
}

/**
 * @param {DeleteSet} ds
 * @param {ID} id
 * @return {boolean}
 *
 * @private
 * @function
 */
export const isDeleted = (ds, id) => {
  const dis = ds.clients.get(id.client)
  return dis !== undefined && findIndexDS(dis, id.clock) !== null
}

/**
 * @param {DeleteSet} ds
 *
 * @private
 * @function
 */
export const sortAndMergeDeleteSet = ds => {
  ds.clients.forEach(dels => {
    dels.sort((a, b) => a.clock - b.clock)
    // merge items without filtering or splicing the array
    // i is the current pointer
    // j refers to the current insert position for the pointed item
    // try to merge dels[i] into dels[j-1] or set dels[j]=dels[i]
    let i, j
    for (i = 1, j = 1; i < dels.length; i++) {
      const left = dels[j - 1]
      const right = dels[i]
      if (left.clock + left.len === right.clock) {
        left.len += right.len
      } else {
        if (j < i) {
          dels[j] = right
        }
        j++
      }
    }
    dels.length = j
  })
}

/**
 * @param {DeleteSet} ds
 * @param {ID} id
 * @param {number} length
 *
 * @private
 * @function
 */
export const addToDeleteSet = (ds, id, length) => {
  map.setIfUndefined(ds.clients, id.client, () => []).push(new DeleteItem(id.clock, length))
}

/**
 * @param {StructStore} ss
 * @return {DeleteSet} Merged and sorted DeleteSet
 *
 * @private
 * @function
 */
export const createDeleteSetFromStructStore = ss => {
  const ds = new DeleteSet()
  ss.clients.forEach((structs, client) => {
    /**
     * @type {Array<DeleteItem>}
     */
    const dsitems = []
    for (let i = 0; i < structs.length; i++) {
      const struct = structs[i]
      if (struct.deleted) {
        const clock = struct.id.clock
        let len = struct.length
        if (i + 1 < structs.length) {
          for (let next = structs[i + 1]; i + 1 < structs.length && next.id.clock === clock + len && next.deleted; next = structs[++i + 1]) {
            len += next.length
          }
        }
        dsitems.push(new DeleteItem(clock, len))
      }
    }
    if (dsitems.length > 0) {
      ds.clients.set(client, dsitems)
    }
  })
  return ds
}

/**
 * @param {encoding.Encoder} encoder
 * @param {DeleteSet} ds
 *
 * @private
 * @function
 */
export const writeDeleteSet = (encoder, ds) => {
  encoding.writeVarUint(encoder, ds.clients.size)
  ds.clients.forEach((dsitems, client) => {
    encoding.writeVarUint(encoder, client)
    const len = dsitems.length
    encoding.writeVarUint(encoder, len)
    for (let i = 0; i < len; i++) {
      const item = dsitems[i]
      encoding.writeVarUint(encoder, item.clock)
      encoding.writeVarUint(encoder, item.len)
    }
  })
}

/**
 * @param {decoding.Decoder} decoder
 * @param {Transaction} transaction
 * @param {StructStore} store
 *
 * @private
 * @function
 */
export const readDeleteSet = (decoder, transaction, store) => {
  const unappliedDS = new DeleteSet()
  const numClients = decoding.readVarUint(decoder)
  for (let i = 0; i < numClients; i++) {
    const client = decoding.readVarUint(decoder)
    const numberOfDeletes = decoding.readVarUint(decoder)
    const structs = store.clients.get(client) || []
    const state = getState(store, client)
    for (let i = 0; i < numberOfDeletes; i++) {
      const clock = decoding.readVarUint(decoder)
      const len = decoding.readVarUint(decoder)
      if (clock < state) {
        if (state < clock + len) {
          addToDeleteSet(unappliedDS, createID(client, state), clock + len - state)
        }
        let index = findIndexSS(structs, clock)
        /**
         * We can ignore the case of GC and Delete structs, because we are going to skip them
         * @type {AbstractItem}
         */
        // @ts-ignore
        let struct = structs[index]
        // split the first item if necessary
        if (!struct.deleted && struct.id.clock < clock) {
          structs.splice(index + 1, 0, struct.splitAt(transaction, clock - struct.id.clock))
          index++ // increase we now want to use the next struct
        }
        while (index < structs.length) {
          // @ts-ignore
          struct = structs[index++]
          if (struct.id.clock < clock + len) {
            if (!struct.deleted) {
              if (clock + len < struct.id.clock + struct.length) {
                structs.splice(index, 0, struct.splitAt(transaction, clock + len - struct.id.clock))
              }
              struct.delete(transaction)
            }
          } else {
            break
          }
        }
      } else {
        addToDeleteSet(unappliedDS, createID(client, clock), len)
      }
    }
  }
  if (unappliedDS.clients.size > 0) {
    const unappliedDSEncoder = encoding.createEncoder()
    writeDeleteSet(unappliedDSEncoder, unappliedDS)
    store.pendingDeleteReaders.push(decoding.createDecoder(encoding.toUint8Array(unappliedDSEncoder)))
  }
}
