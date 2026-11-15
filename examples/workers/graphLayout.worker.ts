// A layout Worker for `graphLayoutWorkerAdapter`: it receives request messages, runs the demo's built-in layout and
// answers with success or failure messages that echo requestId, inputKey and scope. Cancel messages are ignored because
// the computation is synchronous and short; the page discards stale results either way.
import { parseGraphLayoutMessage } from '../../src/core'
import { computeDemoLayout } from '../adapters/layoutCompute'

self.addEventListener('message', (event: MessageEvent) => {
  const message = parseGraphLayoutMessage(event.data)
  if (message.type !== 'request') return
  const { request } = message
  try {
    const layout = computeDemoLayout(request)
    self.postMessage({ type: 'success', requestId: request.requestId, inputKey: request.inputKey, scope: request.scope, layout })
  } catch (reason) {
    self.postMessage({
      type: 'failure', requestId: request.requestId, inputKey: request.inputKey, scope: request.scope,
      message: reason instanceof Error ? reason.message : String(reason),
    })
  }
})
