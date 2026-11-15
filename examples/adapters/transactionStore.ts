import { reactive } from 'vue'
import type { EditTransaction, SaveResult } from '../../src'

/**
 * A mock server for useEditTransaction. It shows the contract a real backend must keep (spec 8.3):
 *  - a conditional update: a save applies only when `baseVersion` is the server's current version;
 *  - deduplication by `operationId`: a repeated request returns the first answer and changes nothing;
 *  - an atomic commit: the document and its version change together, in one synchronous step.
 * Without those three, resending a request after a lost response could update the document twice.
 */
export type ServerMode = 'accept' | 'reject' | 'conflict' | 'uncertain'

export interface TransactionStoreOptions<S> {
  /** The server's own normalisation of a stored document, returned to the client in the accepted result. */
  normalize?: (state: S) => S
  /** What another writer does just before a `conflict` response: it changes the document and bumps the version. */
  remoteEdit?: (state: S) => S
  /** Simulated network delay in milliseconds. */
  delay?: number
}

export function createTransactionStore<S>(initial: S, options: TransactionStoreOptions<S> = {}) {
  const normalize = options.normalize ?? ((state: S) => state)
  const delay = options.delay ?? 250
  // Reactive only so the demo can show the server's version and counters next to the chart.
  const info = reactive({ mode: 'accept' as ServerMode, version: 'v1', commits: 0, lastOperationId: '' })
  let document = normalize(initial)
  let counter = 1
  const answers = new Map<string, SaveResult<S>>()

  function commit(next: S): string {
    // Atomic: the state and the version change in the same step.
    document = normalize(next)
    info.version = 'v' + ++counter
    info.commits++
    return info.version
  }

  async function save(request: EditTransaction<unknown, S>, candidate: S): Promise<SaveResult<S>> {
    await new Promise(resolve => setTimeout(resolve, delay))
    const { operationId } = request
    const known = answers.get(operationId)
    if (known) return known
    info.lastOperationId = operationId
    if (info.mode === 'reject') {
      const rejected: SaveResult<S> = { status: 'rejected', operationId, code: 'server-validation' }
      answers.set(operationId, rejected)
      return rejected
    }
    if (info.mode === 'conflict' && options.remoteEdit) commit(options.remoteEdit(document))
    if (request.baseVersion !== info.version) {
      // A conditional update that did not match: nothing is written, and the answer is not cached as accepted.
      return { status: 'conflict', operationId, currentVersion: info.version }
    }
    const version = commit(request.kind === 'restore' ? request.snapshot : candidate)
    const accepted: SaveResult<S> = { status: 'accepted', operationId, version, state: document }
    answers.set(operationId, accepted)
    // The write happened but the answer never arrives: the client cannot tell this from a write that was lost.
    if (info.mode === 'uncertain') return { status: 'uncertain', operationId }
    return accepted
  }

  return {
    info,
    save,
    /** The stored answer of an operation, or `undefined` when the server never applied it. */
    lookup: (operationId: string): SaveResult<S> | undefined => answers.get(operationId),
    /** The latest document and version, as a client would load them after a conflict. */
    fetch: () => ({ state: document, version: info.version }),
  }
}
