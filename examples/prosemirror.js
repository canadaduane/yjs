import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'
import { prosemirrorPlugin, cursorPlugin } from 'y-prosemirror'

import * as conf from './exampleConfig.js'

import { EditorState } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import { DOMParser } from 'prosemirror-model'
import { schema } from './prosemirror-schema.js'
import { exampleSetup } from 'prosemirror-example-setup'
// import { noteHistoryPlugin } from './prosemirror-history.js'

const provider = new WebsocketProvider(conf.serverAddress)
const ydocument = provider.get('prosemirror' /*, { gc: false } */)
const type = ydocument.get('prosemirror', Y.XmlFragment)

const prosemirrorView = new EditorView(document.querySelector('#editor'), {
  state: EditorState.create({
    doc: DOMParser.fromSchema(schema).parse(document.querySelector('#content')),
    plugins: exampleSetup({ schema }).concat([prosemirrorPlugin(type), cursorPlugin])
  })
})

const connectBtn = document.querySelector('.y-connect-btn')
connectBtn.addEventListener('click', () => {
  if (ydocument.wsconnected) {
    ydocument.disconnect()
    connectBtn.textContent = 'Connect'
  } else {
    ydocument.connect()
    connectBtn.textContent = 'Disconnect'
  }
})

window.example = { provider, ydocument, type, prosemirrorView }
