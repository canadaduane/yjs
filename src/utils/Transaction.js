
import {
  getState,
  createID,
  writeStructsFromTransaction,
  writeDeleteSet,
  DeleteSet,
  sortAndMergeDeleteSet,
  getStateVector,
  findIndexSS,
  callEventHandlerListeners,
  AbstractItem,
  ID, AbstractType, AbstractStruct, YEvent, Doc // eslint-disable-line
} from '../internals.js'

import * as encoding from 'lib0/encoding.js'
import * as map from 'lib0/map.js'
import * as math from 'lib0/math.js'

/**
 * A transaction is created for every change on the Yjs model. It is possible
 * to bundle changes on the Yjs model in a single transaction to
 * minimize the number on messages sent and the number of observer calls.
 * If possible the user of this library should bundle as many changes as
 * possible. Here is an example to illustrate the advantages of bundling:
 *
 * @example
 * const map = y.define('map', YMap)
 * // Log content when change is triggered
 * map.observe(() => {
 *   console.log('change triggered')
 * })
 * // Each change on the map type triggers a log message:
 * map.set('a', 0) // => "change triggered"
 * map.set('b', 0) // => "change triggered"
 * // When put in a transaction, it will trigger the log after the transaction:
 * y.transact(() => {
 *   map.set('a', 1)
 *   map.set('b', 1)
 * }) // => "change triggered"
 *
 * @public
 */
export class Transaction {
  /**
   * @param {Doc} doc
   * @param {any} origin
   */
  constructor (doc, origin) {
    /**
     * The Yjs instance.
     * @type {Doc}
     */
    this.doc = doc
    /**
     * Describes the set of deleted items by ids
     * @type {DeleteSet}
     */
    this.deleteSet = new DeleteSet()
    /**
     * Holds the state before the transaction started.
     * @type {Map<Number,Number>}
     */
    this.beforeState = getStateVector(doc.store)
    /**
     * Holds the state after the transaction.
     * @type {Map<Number,Number>}
     */
    this.afterState = new Map()
    /**
     * All types that were directly modified (property added or child
     * inserted/deleted). New types are not included in this Set.
     * Maps from type to parentSubs (`item._parentSub = null` for YArray)
     * @type {Map<AbstractType<YEvent>,Set<String|null>>}
     */
    this.changed = new Map()
    /**
     * Stores the events for the types that observe also child elements.
     * It is mainly used by `observeDeep`.
     * @type {Map<AbstractType<YEvent>,Array<YEvent>>}
     */
    this.changedParentTypes = new Map()
    /**
     * @type {Set<ID>}
     * @private
     */
    this._mergeStructs = new Set()
    /**
     * @type {any}
     */
    this.origin = origin
  }
}

/**
 * @param {Transaction} transaction
 */
export const computeUpdateMessageFromTransaction = transaction => {
  if (transaction.deleteSet.clients.size === 0 && !map.any(transaction.afterState, (clock, client) => transaction.beforeState.get(client) !== clock)) {
    return null
  }
  const encoder = encoding.createEncoder()
  sortAndMergeDeleteSet(transaction.deleteSet)
  writeStructsFromTransaction(encoder, transaction)
  writeDeleteSet(encoder, transaction.deleteSet)
  return encoder
}

/**
 * @param {Transaction} transaction
 *
 * @private
 * @function
 */
export const nextID = transaction => {
  const y = transaction.doc
  return createID(y.clientID, getState(y.store, y.clientID))
}

/**
 * Implements the functionality of `y.transact(()=>{..})`
 *
 * @param {Doc} doc
 * @param {function(Transaction):void} f
 * @param {any} [origin]
 *
 * @private
 * @function
 */
export const transact = (doc, f, origin = null) => {
  const transactionCleanups = doc._transactionCleanups
  let initialCall = false
  if (doc._transaction === null) {
    initialCall = true
    doc._transaction = new Transaction(doc, origin)
    transactionCleanups.push(doc._transaction)
    doc.emit('beforeTransaction', [doc._transaction, doc])
  }
  try {
    f(doc._transaction)
  } finally {
    if (initialCall && transactionCleanups[0] === doc._transaction) {
      // The first transaction ended, now process observer calls.
      // Observer call may create new transactions for which we need to call the observers and do cleanup.
      // We don't want to nest these calls, so we execute these calls one after another
      for (let i = 0; i < transactionCleanups.length; i++) {
        const transaction = transactionCleanups[i]
        const store = transaction.doc.store
        const ds = transaction.deleteSet
        sortAndMergeDeleteSet(ds)
        transaction.afterState = getStateVector(transaction.doc.store)
        doc._transaction = null
        doc.emit('beforeObserverCalls', [transaction, doc])
        // emit change events on changed types
        transaction.changed.forEach((subs, itemtype) => {
          itemtype._callObserver(transaction, subs)
        })
        transaction.changedParentTypes.forEach((events, type) => {
          events = events
            .filter(event =>
              event.target._item === null || !event.target._item.deleted
            )
          events
            .forEach(event => {
              event.currentTarget = type
            })
          // we don't need to check for events.length
          // because we know it has at least one element
          callEventHandlerListeners(type._dEH, events, transaction)
        })
        doc.emit('afterTransaction', [transaction, doc])
        /**
         * @param {Array<AbstractStruct>} structs
         * @param {number} pos
         */
        const tryToMergeWithLeft = (structs, pos) => {
          const left = structs[pos - 1]
          const right = structs[pos]
          if (left.deleted === right.deleted && left.constructor === right.constructor) {
            if (left.mergeWith(right)) {
              structs.splice(pos, 1)
              if (right instanceof AbstractItem && right.parentSub !== null && right.parent._map.get(right.parentSub) === right) {
                // @ts-ignore we already did a constructor check above
                right.parent._map.set(right.parentSub, left)
              }
            }
          }
        }
        // replace deleted items with ItemDeleted / GC
        for (const [client, deleteItems] of ds.clients) {
          /**
           * @type {Array<AbstractStruct>}
           */
          // @ts-ignore
          const structs = store.clients.get(client)
          for (let di = deleteItems.length - 1; di >= 0; di--) {
            const deleteItem = deleteItems[di]
            const endDeleteItemClock = deleteItem.clock + deleteItem.len
            for (
              let si = findIndexSS(structs, deleteItem.clock), struct = structs[si];
              si < structs.length && struct.id.clock < endDeleteItemClock;
              struct = structs[++si]
            ) {
              const struct = structs[si]
              if (deleteItem.clock + deleteItem.len <= struct.id.clock) {
                break
              }
              if (struct.deleted && struct instanceof AbstractItem) {
                struct.gc(store, false)
              }
            }
          }
        }
        // try to merge deleted / gc'd items
        // merge from right to left for better efficiecy and so we don't miss any merge targets
        for (const [client, deleteItems] of ds.clients) {
          /**
           * @type {Array<AbstractStruct>}
           */
          // @ts-ignore
          const structs = store.clients.get(client)
          for (let di = deleteItems.length - 1; di >= 0; di--) {
            const deleteItem = deleteItems[di]
            // start with merging the item next to the last deleted item
            const mostRightIndexToCheck = math.min(structs.length - 1, 1 + findIndexSS(structs, deleteItem.clock + deleteItem.len - 1))
            for (
              let si = mostRightIndexToCheck, struct = structs[si];
              si > 0 && struct.id.clock >= deleteItem.clock;
              struct = structs[--si]
            ) {
              tryToMergeWithLeft(structs, si)
            }
          }
        }

        // on all affected store.clients props, try to merge
        for (const [client, clock] of transaction.afterState) {
          const beforeClock = transaction.beforeState.get(client) || 0
          if (beforeClock !== clock) {
            /**
             * @type {Array<AbstractStruct>}
             */
            // @ts-ignore
            const structs = store.clients.get(client)
            // we iterate from right to left so we can safely remove entries
            const firstChangePos = math.max(findIndexSS(structs, beforeClock), 1)
            for (let i = structs.length - 1; i >= firstChangePos; i--) {
              tryToMergeWithLeft(structs, i)
            }
          }
        }
        // try to merge mergeStructs
        // @todo: it makes more sense to transform mergeStructs to a DS, sort it, and merge from right to left
        //        but at the moment DS does not handle duplicates
        for (const mid of transaction._mergeStructs) {
          const client = mid.client
          const clock = mid.clock
          /**
           * @type {Array<AbstractStruct>}
           */
          // @ts-ignore
          const structs = store.clients.get(client)
          const replacedStructPos = findIndexSS(structs, clock)
          if (replacedStructPos + 1 < structs.length) {
            tryToMergeWithLeft(structs, replacedStructPos + 1)
          }
          if (replacedStructPos > 0) {
            tryToMergeWithLeft(structs, replacedStructPos)
          }
        }
        // @todo Merge all the transactions into one and provide send the data as a single update message
        doc.emit('afterTransactionCleanup', [transaction, doc])
        if (doc._observers.has('update')) {
          const updateMessage = computeUpdateMessageFromTransaction(transaction)
          if (updateMessage !== null) {
            doc.emit('update', [encoding.toUint8Array(updateMessage), transaction.origin, doc])
          }
        }
      }
      doc._transactionCleanups = []
    }
  }
}
