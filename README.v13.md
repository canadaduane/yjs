# ![Yjs](https://user-images.githubusercontent.com/5553757/48975307-61efb100-f06d-11e8-9177-ee895e5916e5.png)
> A CRDT framework with a powerful abstraction of shared data

Yjs is a [CRDT implementation](#Yjs-CRDT-Algorithm) that exposes its internal data structure as *shared types*. Shared types are common data types like `Map` or `Array` with superpowers: changes are automatically distributed to other peers and merged without merge conflicts.

Yjs is **network agnostic** (p2p!), supports many existing **rich text editors**, **offline editing**, **version snapshots**, **undo/redo** and **shared cursors**. It scales well with an unlimited number of users and is well suited for even large documents.

* Chat: [https://gitter.im/y-js/yjs](https://gitter.im/y-js/yjs)
* Demos: [https://github.com/y-js/yjs-demos](https://github.com/y-js/yjs-demos)
* Benchmarks: [https://github.com/dmonad/crdt-benchmarks](https://github.com/dmonad/crdt-benchmarks)

# Table of Contents

* [Overview](#Overview)
  * [Bindings](#Bindings)
  * [Providers](#Providers)
* [Getting Started](#Getting-Started)
* [API](#API)
  * [Shared Types](#Shared-Types)
  * [Y.Doc](#Y.Doc)
  * [Document Updates](#Document-Updates)
  * [Relative Positions](#Relative-Positions)
* [Miscellaneous](#Miscellaneous)
  * [Typescript Declarations](#Typescript-Declarations)
* [Yjs CRDT Algorithm](#Yjs-CRDT-Algorithm)
* [Evaluation](#Evaluation)
  * [Existing shared editing libraries](#Exisisting-Javascript-Libraries)
  * [CRDT Algorithms](#CRDT-Algorithms)
  * [Comparison of CRDT with OT](#Comparing-CRDT-with-OT)
  * [Comparison of CRDT Algorithms](#Comparing-CRDT-Algorithms)
  * [Comparison of Yjs with other Implementations](#Comparing-Yjs-with-other-Implementations)
* [License and Author](#License-and-Author)


## Overview

This repository contains a collection of shared types that can be observed for changes and manipulated concurrently. Network functionality and two-way-bindings are implemented in separate modules.

### Bindings

| Name &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; | Cursors | Binding |  Demo |
|---|:-:|---|---|
| [ProseMirror](https://prosemirror.net/) | ✔ | [y-prosemirror](http://github.com/y-js/y-prosemirror) | [demo](https://yjs-demos.now.sh/prosemirror/) |
| [Quill](https://quilljs.com/) |  | [y-quill](http://github.com/y-js/y-quill) | [demo](https://yjs-demos.now.sh/quill/) |
| [CodeMirror](https://codemirror.net/) | ✔ | [y-codemirror](http://github.com/y-js/y-codemirror) | [demo](https://yjs-demos.now.sh/codemirror/) |
| [Monaco](https://microsoft.github.io/monaco-editor/) | ✔ | [y-monaco](http://github.com/y-js/y-monaco) | [demo](https://yjs-demos.now.sh/monaco/) |
| [Ace](https://ace.c9.io/) | | [y-ace](http://github.com/y-js/y-ace) | [demo](https://yjs-demos.now.sh/ace/) |
| [Textarea](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/textarea) | | [y-textarea](http://github.com/y-js/y-textarea) | [demo](https://yjs-demos.now.sh/textarea/) |
| [DOM](https://developer.mozilla.org/en-US/docs/Web/API/Document_Object_Model) | | [y-dom](http://github.com/y-js/y-dom) | [demo](https://yjs-demos.now.sh/dom/) |


### Providers

Setting up the communication between clients, managing awareness information, and storing shared data for offline usage is quite a hassle. **Providers** manage all that for you and are the perfect starting point for your collaborative app.

<dl>
  <dt><a href="http://github.com/y-js/y-websocket">y-websocket</a></dt>
  <dd>A module that contains a simple websocket backend and a websocket client that connects to that backend. The backend can be extended to persist updates in a leveldb database.</dd>
  <dt><a href="http://github.com/y-js/y-mesh">y-mesh</a></dt>
  <dd>[WIP] Creates a connected graph of webrtc connections with a high <a href="https://en.wikipedia.org/wiki/Strength_of_a_graph">strength</a>. It requires a signalling server that connects a client to the first peer. But after that the network manages itself. It is well suited for large and small networks.</dd>
  <dt><a href="http://github.com/y-js/y-dat">y-dat</a></dt>
  <dd>[WIP] Write document updates effinciently to the dat network using <a href="https://github.com/kappa-db/multifeed">multifeed</a>. Each client has an append-only log of CRDT local updates (hypercore). Multifeed manages and sync hypercores and y-dat listens to changes and applies them to the Yjs document.</dd>
</dl>

## Getting Started

Install Yjs and a provider with your favorite package manager.

```sh
npm i yjs@13.0.0-82 y-websocket@1.0.0-3 y-textarea
```

**Start the y-websocket server**

```sh
PORT=1234 node ./node_modules/y-websocket/bin/server.js
```

**Example: Textarea Binding**

This is a complete example on how to create a connection to a [y-websocket](https://github.com/y-js/y-websocket) server instance, sync the shared document to all clients in a *room*, and bind a Y.Text type to a dom textarea. All changes to the textarea are automatically shared with everyone in the same room.

```js
import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'
import { TextareaBinding } from 'y-textarea'

const doc = Y.Doc()
const provider = new WebsocketProvider('http://localhost:1234', 'roomname')
// sync all document updates through the websocket connection
provider.sync('doc')

// Define a shared type on the document.
const ytext = doc.getText('my resume')

// use data bindings to bind types to editors
const binding = new TextareaBinding(ytext, document.querySelector('textarea'))
```

**Example: Observe types**

```js
const yarray = doc.getArray('my-array')
yarray.observe(event => {
  console.log('yarray was modified')
})
// every time a local or remote client modifies yarray, the observer is called
yarray.insert(0, ['val']) // => "yarray was modified"
```

**Example: Nest types**

Remember, shared types are just plain old data types. The only limitation is that a shared type must exist only once in the shared document.

```js
const ymap = doc.getMap('map')
const foodArray = new Y.Array()
foodArray.insert(0, ['apple', 'banana'])
ymap.set('food', foodArray)
ymap.get('food') === foodArray // => true
ymap.set('fruit', foodArray) // => Error! foodArray is already defined on the shared document
```

Now you understand how types are defined on a shared document. Next you can jump to the [demo repository](https://github.com/y-js/yjs-demos) or continue reading the API docs.

## API

```js
import * as Y from 'yjs'
```

### Shared Types

<details>
  <summary><b>Y.Array</b></summary>
  <br>
  <p>
    A shareable Array-like type that supports efficient insert/delete of elements at any position. Internally it uses a linked list of Arrays that is split when necessary.
  </p>
  <pre>const yarray = new Y.Array()</pre>
  <dl>
    <b><code>insert(index:number, content:Array&lt;object|string|number|Uint8Array|Y.Type&gt;)</code></b>
    <dd>
      Insert content at <var>index</var>. Note that content is an array of elements. I.e. <code>array.insert(0, [1]</code> splices the list and inserts 1 at position 0.
    </dd>
    <b><code>push(Array&lt;Object|Array|string|number|Uint8Array|Y.Type&gt;)</code></b>
    <dd></dd>
    <b><code>delete(index:number, length:number)</code></b>
    <dd></dd>
    <b><code>get(index:number)</code></b>
    <dd></dd>
    <b><code>length:number</code></b>
    <dd></dd>
    <b><code>map(function(T, number, YArray):M):Array&lt;M&gt;</code></b>
    <dd></dd>
    <b><code>toArray():Array&lt;Object|Array|string|number|Uint8Array|Y.Type&gt;</code></b>
    <dd>Copies the content of this YArray to a new Array.</dd>
    <b><code>toJSON():Array&lt;Object|Array|string|number&gt;</code></b>
    <dd>Copies the content of this YArray to a new Array. It transforms all child types to JSON using their <code>toJSON</code> method.</dd>
    <b><code>[Symbol.Iterator]</code></b>
    <dd>
      Returns an YArray Iterator that contains the values for each index in the array.
      <pre>for (let value of yarray) { .. }</pre>
    </dd>
    <b><code>observe(function(YArrayEvent, Transaction):void)</code></b>
    <dd>
      Adds an event listener to this type that will be called synchronously every time this type is modified. In the case this type is modified in the event listener, the event listener will be called again after the current event listener returns.
    </dd>
    <b><code>unobserve(function(YArrayEvent, Transaction):void)</code></b>
    <dd>
      Removes an <code>observe</code> event listener from this type.
    </dd>
    <b><code>observeDeep(function(Array&lt;YEvent&gt;, Transaction):void)</code></b>
    <dd>
      Adds an event listener to this type that will be called synchronously every time this type or any of its children is modified. In the case this type is modified in the event listener, the event listener will be called again after the current event listener returns. The event listener receives all Events created by itself or any of its children.
    </dd>
    <b><code>unobserveDeep(function(Array&lt;YEvent&gt;, Transaction):void)</code></b>
    <dd>
      Removes an <code>observeDeep</code> event listener from this type.
    </dd>
  </dl>
</details>
<details>
  <summary><b>Y.Map</b></summary>
  <br>
  <p>
    A shareable Map type.
  </p>
  <pre><code>const ymap = new Y.Map()</code></pre>
  <dl>
    <b><code>get(key:string):object|string|number|Uint8Array|Y.Type</code></b>
    <dd></dd>
    <b><code>set(key:string, value:object|string|number|Uint8Array|Y.Type)</code></b>
    <dd></dd>
    <b><code>delete(key:string)</code></b>
    <dd></dd>
    <b><code>has(key:string):boolean</code></b>
    <dd></dd>
    <b><code>get(index:number)</code></b>
    <dd></dd>
    <b><code>toJSON():Object&lt;string, Object|Array|string|number&gt;</code></b>
    <dd>Copies the <code>[key,value]</code> pairs of this YMap to a new Object. It transforms all child types to JSON using their <code>toJSON</code> method.</dd>
    <b><code>[Symbol.Iterator]</code></b>
    <dd>
      Returns an Iterator of <code>[key, value]</code> pairs.
      <pre>for (let [key, value] of ymap) { .. }</pre>
    </dd>
    <b><code>entries()</code></b>
    <dd>
      Returns an Iterator of <code>[key, value]</code> pairs.
    </dd>
    <b><code>values()</code></b>
    <dd>
      Returns an Iterator of all values.
    </dd>
    <b><code>keys()</code></b>
    <dd>
      Returns an Iterator of all keys.
    </dd>
    <b><code>observe(function(YMapEvent, Transaction):void)</code></b>
    <dd>
      Adds an event listener to this type that will be called synchronously every time this type is modified. In the case this type is modified in the event listener, the event listener will be called again after the current event listener returns.
    </dd>
    <b><code>unobserve(function(YMapEvent, Transaction):void)</code></b>
    <dd>
      Removes an <code>observe</code> event listener from this type.
    </dd>
    <b><code>observeDeep(function(Array&lt;YEvent&gt;, Transaction):void)</code></b>
    <dd>
      Adds an event listener to this type that will be called synchronously every time this type or any of its children is modified. In the case this type is modified in the event listener, the event listener will be called again after the current event listener returns. The event listener receives all Events created by itself or any of its children.
    </dd>
    <b><code>unobserveDeep(function(Array&lt;YEvent&gt;, Transaction):void)</code></b>
    <dd>
      Removes an <code>observeDeep</code> event listener from this type.
    </dd>
  </dl>
</details>

<details>
  <summary><b>Y.Text</b></summary>
  <br>
  <p>
    A shareable type that is optimized for shared editing on text. It allows to assign properties to ranges in the text. This makes it possible to implement rich-text bindings to this type.
  </p>
  <p>
    This type can also be transformed to the <a href="https://quilljs.com/docs/delta">delta format</a>. Similarly the YTextEvents compute changes as deltas.
  </p>
  <pre>const ytext = new Y.Text()</pre>
  <dl>
    <b><code>insert(index:number, content:string, [formattingAttributes:Object&lt;string,string&gt;])</code></b>
    <dd>
      Insert a string at <var>index</var> and assign formatting attributes to it.
      <pre>ytext.insert(0, 'bold text', { bold: true })</pre>
    </dd>
    <b><code>delete(index:number, length:number)</code></b>
    <dd></dd>
    <b><code>format(index:number, length:number, formattingAttributes:Object&lt;string,string&gt;)</code></b>
    <dd>Assign formatting attributes to a range in the text</dd>
    <b><code>applyDelta(delta)</code></b>
    <dd>See <a href="https://quilljs.com/docs/delta/">Quill Delta</a></dd>
    <b><code>length:number</code></b>
    <dd></dd>
    <b><code>toString():string</code></b>
    <dd>Transforms this type, without formatting options, into a string.</dd>
    <b><code>toJSON():string</code></b>
    <dd>See <code>toString</code></dd>
    <b><code>toDelta():Delta</code></b>
    <dd>Transforms this type to a <a href="https://quilljs.com/docs/delta/">Quill Delta</a></dd>
    <b><code>observe(function(YTextEvent, Transaction):void)</code></b>
    <dd>
      Adds an event listener to this type that will be called synchronously every time this type is modified. In the case this type is modified in the event listener, the event listener will be called again after the current event listener returns.
    </dd>
    <b><code>unobserve(function(YTextEvent, Transaction):void)</code></b>
    <dd>
      Removes an <code>observe</code> event listener from this type.
    </dd>
    <b><code>observeDeep(function(Array&lt;YEvent&gt;, Transaction):void)</code></b>
    <dd>
      Adds an event listener to this type that will be called synchronously every time this type or any of its children is modified. In the case this type is modified in the event listener, the event listener will be called again after the current event listener returns. The event listener receives all Events created by itself or any of its children.
    </dd>
    <b><code>unobserveDeep(function(Array&lt;YEvent&gt;, Transaction):void)</code></b>
    <dd>
      Removes an <code>observeDeep</code> event listener from this type.
    </dd>
  </dl>
</details>

<details>
  <summary><b>YXmlFragment</b></summary>
  <br>
  <p>
    A container that holds an Array of Y.XmlElements.
  </p>
  <pre><code>const yxml = new Y.XmlFragment()</code></pre>
  <dl>
    <b><code>insert(index:number, content:Array&lt;Y.XmlElement|Y.XmlText&gt;)</code></b>
    <dd></dd>
    <b><code>delete(index:number, length:number)</code></b>
    <dd></dd>
    <b><code>get(index:number)</code></b>
    <dd></dd>
    <b><code>length:number</code></b>
    <dd></dd>
    <b><code>toArray():Array&lt;Y.XmlElement|Y.XmlText&gt;</code></b>
    <dd>Copies the children to a new Array.</dd>
    <b><code>toDOM():DocumentFragment</code></b>
    <dd>Transforms this type and all children to new DOM elements.</dd>
    <b><code>toString():string</code></b>
    <dd>Get the XML serialization of all descendants.</dd>
    <b><code>toJSON():string</code></b>
    <dd>See <code>toString</code>.</dd>
    <b><code>observe(function(YXmlEvent, Transaction):void)</code></b>
    <dd>
      Adds an event listener to this type that will be called synchronously every time this type is modified. In the case this type is modified in the event listener, the event listener will be called again after the current event listener returns.
    </dd>
    <b><code>unobserve(function(YXmlEvent, Transaction):void)</code></b>
    <dd>
      Removes an <code>observe</code> event listener from this type.
    </dd>
    <b><code>observeDeep(function(Array&lt;YEvent&gt;, Transaction):void)</code></b>
    <dd>
      Adds an event listener to this type that will be called synchronously every time this type or any of its children is modified. In the case this type is modified in the event listener, the event listener will be called again after the current event listener returns. The event listener receives all Events created by itself or any of its children.
    </dd>
    <b><code>unobserveDeep(function(Array&lt;YEvent&gt;, Transaction):void)</code></b>
    <dd>
      Removes an <code>observeDeep</code> event listener from this type.
    </dd>
  </dl>
</details>

<details>
  <summary><b>Y.XmlElement</b></summary>
  <br>
  <p>
    A shareable type that represents an XML Element. It has a <code>nodeName</code>, attributes, and a list of children. But it makes no effort to validate its content and be actually XML compliant.
  </p>
  <pre><code>const yxml = new Y.XmlElement()</code></pre>
  <dl>
    <b><code>insert(index:number, content:Array&lt;Y.XmlElement|Y.XmlText&gt;)</code></b>
    <dd></dd>
    <b><code>delete(index:number, length:number)</code></b>
    <dd></dd>
    <b><code>get(index:number)</code></b>
    <dd></dd>
    <b><code>length:number</code></b>
    <dd></dd>
    <b><code>setAttribute(attributeName:string, attributeValue:string)</code></b>
    <dd></dd>
    <b><code>removeAttribute(attributeName:string)</code></b>
    <dd></dd>
    <b><code>getAttribute(attributeName:string):string</code></b>
    <dd></dd>
    <b><code>getAttributes(attributeName:string):Object&lt;string,string&gt;</code></b>
    <dd></dd>
    <b><code>toArray():Array&lt;Y.XmlElement|Y.XmlText&gt;</code></b>
    <dd>Copies the children to a new Array.</dd>
    <b><code>toDOM():Element</code></b>
    <dd>Transforms this type and all children to a new DOM element.</dd>
    <b><code>toString():string</code></b>
    <dd>Get the XML serialization of all descendants.</dd>
    <b><code>toJSON():string</code></b>
    <dd>See <code>toString</code>.</dd>
    <b><code>observe(function(YXmlEvent, Transaction):void)</code></b>
    <dd>
      Adds an event listener to this type that will be called synchronously every time this type is modified. In the case this type is modified in the event listener, the event listener will be called again after the current event listener returns.
    </dd>
    <b><code>unobserve(function(YXmlEvent, Transaction):void)</code></b>
    <dd>
      Removes an <code>observe</code> event listener from this type.
    </dd>
    <b><code>observeDeep(function(Array&lt;YEvent&gt;, Transaction):void)</code></b>
    <dd>
      Adds an event listener to this type that will be called synchronously every time this type or any of its children is modified. In the case this type is modified in the event listener, the event listener will be called again after the current event listener returns. The event listener receives all Events created by itself or any of its children.
    </dd>
    <b><code>unobserveDeep(function(Array&lt;YEvent&gt;, Transaction):void)</code></b>
    <dd>
      Removes an <code>observeDeep</code> event listener from this type.
    </dd>
  </dl>
</details>

### Y.Doc

```js
const doc = new Y.Doc()
```

<dl>
  <b><code>clientID</code></b>
  <dd>A unique id that identifies this client. (readonly)</dd>
  <b><code>transact(function(Transaction):void [, origin:any])</code></b>
  <dd>Every change on the shared document happens in a transaction. Observer calls and the <code>update</code> event are called after each transaction. You should <i>bundle</i> changes into a single transaction to reduce the amount of event calls. I.e. <code>doc.transact(() => { yarray.insert(..); ymap.set(..) })</code> triggers a single change event. <br>You can specify an optional <code>origin</code> parameter that is stored on <code>transaction.origin</code> and <code>on('update', (update, origin) => ..)</code>.</dd>
  <b><code>get(string, Y.[TypeClass]):[Type]</code></b>
  <dd>Define a shared type.</dd>
  <b><code>getArray(string):Y.Array</code></b>
  <dd>Define a shared Y.Array type. Is equivalent to <code>y.get(string, Y.Array)</code>.</dd>
  <b><code>getMap(string):Y.Map</code></b>
  <dd>Define a shared Y.Map type. Is equivalent to <code>y.get(string, Y.Map)</code>.</dd>
  <b><code>getXmlFragment(string):Y.XmlFragment</code></b>
  <dd>Define a shared Y.XmlFragment type. Is equivalent to <code>y.get(string, Y.XmlFragment)</code>.</dd>
  <b><code>on(string, function)</code></b>
  <dd>Register an event listener on the shared type</dd>
  <b><code>off(string, function)</code></b>
  <dd>Unregister an event listener from the shared type</dd>
</dl>


#### Y.Doc Events
<dl>
  <b><code>on('update', function(updateMessage:Uint8Array, origin:any, Y.Doc):void)</code></b>
  <dd>Listen to document updates. Document updates must be transmitted to all other peers. You can apply document updates in any order and multiple times.</dd>
  <b><code>on('beforeTransaction', function(Y.Transaction, Y.Doc):void)</code></b>
  <dd>Emitted before each transaction.</dd>
  <b><code>on('afterTransaction', function(Y.Transaction, Y.Doc):void)</code></b>
  <dd>Emitted after each transaction.</dd>
</dl>

### Document Updates

Changes on the shared document are encoded into *document updates*. Document updates are *commutative* and *idempotent*. This means that they can be applied in any order and multiple times.

**Example: Listen to update events and apply them on remote client**
```js
const doc1 = new Y.Doc()
const doc2 = new Y.Doc()

doc1.on('update', update => {
  Y.applyUpdate(doc2, update)
})

doc2.on('update', update => {
  Y.applyUpdate(doc1, update)
})

// All changes are also applied to the other document
doc1.getArray('myarray').insert(0, ['Hello doc2, you got this?'])
doc2.getArray('myarray').get(0) // => 'Hello doc2, you got this?'
```

Yjs internally maintains a [state vector](#State-Vector) that denotes the next expected clock from each client. In a different interpretation it holds the number of structs created by each client. When two clients sync, you can either exchange the complete document structure or only the differences by sending the state vector to compute the differences.

**Example: Sync two clients by exchanging the complete document structure**

```js
const state1 = Y.encodeStateAsUpdate(ydoc1)
const state2 = Y.encodeStateAsUpdate(ydoc2)
Y.applyUpdate(ydoc1, state2)
Y.applyUpdate(ydoc2, state1)
```

**Example: Sync two clients by computing the differences**

This example shows how to sync two clients with the minimal amount of exchanged data by computing only the differences using the state vector of the remote client. Syncing clients using the state vector requires another roundtrip, but can safe a lot of bandwidth.

```js
const stateVector1 = Y.encodeStateVector(ydoc1)
const stateVector2 = Y.encodeStateVector(ydoc2)
const diff1 = Y.encodeStateAsUpdate(ydoc1, stateVector2)
const diff2 = Y.encodeStateAsUpdate(ydoc2, stateVector1)
Y.applyUpdate(ydoc1, diff2)
Y.applyUpdate(ydoc2, diff1)
```

<dl>
  <b><code>Y.applyUpdate(Y.Doc, update:Uint8Array, [transactionOrigin:any])</code></b>
  <dd>Apply a document update on the shared document. Optionally you can specify <code>transactionOrigin</code> that will be stored on <code>transaction.origin</code> and <code>ydoc.on('update', (update, origin) => ..)</code>.</dd>
  <b><code>Y.encodeStateAsUpdate(Y.Doc, [encodedTargetStateVector:Uint8Array]):Uint8Array</code></b>
  <dd>Encode the document state as a single update message that can be applied on the remote document. Optionally specify the target state vector to only write the differences to the update message.</dd>
  <b><code>Y.encodeStateVector(Y.Doc):Uint8Array</code></b>
  <dd>Computes the state vector and encodes it into an Uint8Array.</dd>
</dl>

### Relative Positions
> This API is not stable yet

This feature is intended for managing selections / cursors. When working with other users that manipulate the shared document, you can't trust that an index position (an integer) will stay at the intended location. A *relative position* is fixated to an element in the shared document and is not affected by remote changes. I.e. given the document `"a|c"`, the relative position is attached to `c`. When a remote user modifies the document by inserting a character before the cursor, the cursor will stay attached to the character `c`. `insert(1, 'x')("a|c") = "ax|c"`. When the *relative position* is set to the end of the document, it will stay attached to the end of the document.

**Example: Transform to RelativePosition and back**
```js
const relPos = Y.createRelativePositionFromTypeIndex(ytext, 2)
const pos = Y.createAbsolutePositionFromRelativePosition(relPos, doc)
pos.type === ytext // => true
pos.index === 2 // => true
```

**Example: Send relative position to remote client (json)**
```js
const relPos = Y.createRelativePositionFromTypeIndex(ytext, 2)
const encodedRelPos = JSON.stringify(relPos)
// send encodedRelPos to remote client..
const parsedRelPos = JSON.parse(encodedRelPos)
const pos = Y.createAbsolutePositionFromRelativePosition(parsedRelPos, remoteDoc)
pos.type === remoteytext // => true
pos.index === 2 // => true
```

**Example: Send relative position to remote client (Uint8Array)**
```js
const relPos = Y.createRelativePositionFromTypeIndex(ytext, 2)
const encodedRelPos = Y.encodeRelativePosition(relPos)
// send encodedRelPos to remote client..
const parsedRelPos = Y.decodeRelativePosition(encodedRelPos)
const pos = Y.createAbsolutePositionFromRelativePosition(parsedRelPos, remoteDoc)
pos.type === remoteytext // => true
pos.index === 2 // => true
```

<dl>
  <b><code>Y.createRelativePositionFromTypeIndex(Uint8Array|Y.Type, number)</code></b>
  <dd></dd>
  <b><code>Y.createAbsolutePositionFromRelativePosition(RelativePosition, Y.Doc)</code></b>
  <dd></dd>
  <b><code>Y.encodeRelativePosition(RelativePosition):Uint8Array</code></b>
  <dd></dd>
  <b><code>Y.decodeRelativePosition(Uint8Array):RelativePosition</code></b>
  <dd></dd>
</dl>

## Miscellaneous

### Typescript Declarations

Yjs has type descriptions. But until [this ticket](https://github.com/Microsoft/TypeScript/issues/7546) is fixed, this is how you can make use of Yjs type declarations.

```json
{
  "compilerOptions": {
    "allowJs": true,
    "checkJs": true,
  },
  "maxNodeModuleJsDepth": 5
}
```

## Yjs CRDT Algorithm

*Conflict-free replicated data types* (CRDT) for collaborative editing are an alternative approach to *operational transformation* (OT). A very simple differenciation between the two approaches is that OT attempts to transform index positions to ensure convergence (all clients end up with the same content), while CRDTs use mathematical models that usually do not involve index transformations, like linked lists. OT is currently the de-facto standard for shared editing on text. OT approaches that support shared editing without a central source of truth (a central server) require too much bookkeeping to be viable in practice. CRDTs are better suited for distributed systems, provide additional guarantees that the document can be synced with remote clients, and do not require a central source of truth.

Yjs implements a modified version of the algorithm described in [this paper](https://www.researchgate.net/publication/310212186_Near_Real-Time_Peer-to-Peer_Shared_Editing_on_Extensible_Data_Types). I will eventually publish a paper that describes why this approach works so well in practice. Note: Since operations make up the document structure, we prefer the term *struct* now.

CRDTs suitable for shared text editing suffer from the fact that they only grow in size. There are CRDTs that do not grow in size, but they do not have the characteristics that are benificial for shared text editing (like intention preservation). Yjs implements many improvements to the original algorithm that diminish the trade-off that the document only grows in size. We can't garbage collect deleted structs (tombstones) while ensuring a unique order of the structs. But we can 1. merge preceeding structs into a single struct to reduce the amount of meta information, 2. we can delete content from the struct if it is deleted, and 3. we can garbage collect tombstones if we don't care about the order of the structs anymore (e.g. if the parent was deleted).

**Examples:**
1. If a user inserts elements in sequence, the struct will be merged into a single struct. E.g. `array.insert(0, ['a']), array.insert(0, ['b']);` is first represented as two structs (`[{id: {client, clock: 0}, content: 'a'}, {id: {client, clock: 1}, content: 'b'}`) and then merged into a single struct: `[{id: {client, clock: 0}, content: 'ab'}]`.
2. When a struct that contains content (e.g. `ItemString`) is deleted, the struct will be replaced with an `ItemDeleted` that does not contain content anymore.
3. When a type is deleted, all child elements are transformed to `GC` structs. A `GC` struct only denotes the existence of a struct and that it is deleted. `GC` structs can always be merged with other `GC` structs if the id's are adjacent.

Especially when working on structured content (e.g. shared editing on ProseMirror), these improvements yield very good results when [benchmarking](https://github.com/dmonad/crdt-benchmarks) random document edits. In practice they show even better results, because users usually edit text in sequence, resulting in structs that can easily be merged. The benchmarks show that even in the worst case scenario that a user edits text from right to left, Yjs achieves good performance even for huge documents.

#### State Vector
Yjs has the ability to exchange only the differences when syncing two clients. We use lamport timestamps to identify structs and to track in which order a client created them. Each struct has an `struct.id = { client: number, clock: number}` that uniquely identifies a struct. We define the next expected `clock` by each client as the *state vector*. This data structure is similar to the [version vectors](https://en.wikipedia.org/wiki/Version_vector) data structure. But we use state vectors only to describe the state of the local document, so we can compute the missing struct of the remote client. We do not use it to track causality.

## License and Author

Yjs and all related projects are [**MIT licensed**](./LICENSE).

Yjs is based on my research as a student at the [RWTH i5](http://dbis.rwth-aachen.de/). Now I am working on Yjs in my spare time.

Fund this project by donating on [Patreon](https://www.patreon.com/dmonad) or hiring [me](https://github.com/dmonad) for professional support.
