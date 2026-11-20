import { computed, shallowRef } from 'vue'
import type { ShallowRef } from 'vue'
import {
  beginTransaction,
  clearTransactionResult,
  createTransactionState,
  refreshTransactionState,
  settleTransaction,
} from '../core/editTransaction.js'
import type {
  EditTransaction,
  PendingTransaction,
  SaveResult,
  SettleResult,
  TransactionAdapter,
  TransactionOutcome,
  TransactionSource,
} from '../core/editTransaction.js'
import { useEditHistory } from './useEditHistory.js'

export interface UseEditTransactionOptions<S, P> {
  documentId: string
  initialState: S
  initialVersion: string
  adapter: TransactionAdapter<S, P>
  /** Produces a unique operation ID per save. Defaults to `crypto.randomUUID()` with a counter fallback. */
  createOperationId?: () => string
  /** Maximum number of undo steps. Defaults to 100. */
  historyLimit?: number
  onHistoryReset?: (reset: HistoryReset) => void
}

export interface HistoryReset {
  reason: 'refresh'
  version: string
}

let fallbackCounter = 0
function defaultOperationId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto
  return c?.randomUUID ? c.randomUUID() : `op-${Date.now().toString(36)}-${++fallbackCounter}`
}

/**
 * Server-confirmed edits with undo and redo. The accepted state changes only after the server accepts a
 * transaction; the candidate is shown separately while saving. Undo and redo restore history snapshots
 * against the current accepted version, and move the history position only after acceptance.
 */
export function useEditTransaction<S, P>(options: UseEditTransactionOptions<S, P>) {
  const { documentId, adapter, onHistoryReset } = options
  const createOperationId = options.createOperationId ?? defaultOperationId
  const history = useEditHistory<S>(options.initialState, options.historyLimit)
  const core = shallowRef(createTransactionState(options.initialState, options.initialVersion))
  // Annotated with the one-argument ShallowRef so the declaration also type-checks with Vue 3.5.0.
  const historyReset: ShallowRef<HistoryReset | undefined> = shallowRef<HistoryReset | undefined>(undefined)

  const acceptedState = computed(() => core.value.acceptedState)
  const acceptedVersion = computed(() => core.value.acceptedVersion)
  const candidateState = computed(() => core.value.candidateState)
  const status = computed(() => core.value.status)
  const pendingTransaction = computed(() => {
    const p = core.value.pending
    return p ? { operationId: p.operationId, kind: p.kind, source: p.source, baseVersion: p.baseVersion } : undefined
  })
  const result = computed(() => core.value.result)
  const canUndo = computed(() => history.canUndo.value)
  const canRedo = computed(() => history.canRedo.value)

  function recordHistory(done: PendingTransaction, state: S) {
    if (done.kind === 'changes') history.commit(state)
    else {
      if (done.source === 'undo') history.undo()
      else history.redo()
      history.replaceCurrent(state)
    }
  }

  function adopt(settled: SettleResult<S>): TransactionOutcome<S> {
    core.value = settled.state
    if (settled.committed && settled.outcome.status === 'accepted') recordHistory(settled.committed, settled.outcome.state)
    return settled.outcome
  }

  async function run(
    source: TransactionSource,
    body: { kind: 'changes'; changes: readonly P[] } | { kind: 'restore'; snapshot: S },
    candidate: S,
  ): Promise<TransactionOutcome<S>> {
    const operationId = createOperationId()
    const started = beginTransaction(core.value, { operationId, kind: body.kind, source }, candidate)
    if (!started) return { status: 'busy' }
    core.value = started
    const request = {
      operationId,
      documentId,
      baseVersion: started.pending!.baseVersion,
      source,
      ...body,
    } as EditTransaction<P, S>
    const epoch = started.epoch
    let response: SaveResult<S>
    try {
      response = await adapter.save(request, candidate)
    } catch {
      // A thrown or rejected save (timeout, disconnect) says nothing about whether it was applied.
      response = { status: 'uncertain', operationId }
    }
    return adopt(settleTransaction(core.value, operationId, epoch, response))
  }

  /** Validate, apply and save a set of changes as one transaction. */
  function submit(changes: readonly P[], submitOptions: { source?: 'pointer' | 'keyboard' | 'api' } = {}): Promise<TransactionOutcome<S>> {
    if (core.value.status === 'saving') return Promise.resolve({ status: 'busy' })
    if (changes.length === 0) return Promise.resolve({ status: 'invalid', reason: 'No changes to save' })
    const verdict = adapter.validate(core.value.acceptedState, changes)
    if (verdict === false) return Promise.resolve({ status: 'invalid', reason: 'Changes failed validation' })
    if (typeof verdict === 'string') return Promise.resolve({ status: 'invalid', reason: verdict || 'Changes failed validation' })
    const candidate = adapter.apply(core.value.acceptedState, changes)
    return run(submitOptions.source ?? 'api', { kind: 'changes', changes }, candidate)
  }

  function restore(source: 'undo' | 'redo'): Promise<TransactionOutcome<S>> {
    if (core.value.status === 'saving') return Promise.resolve({ status: 'busy' })
    if (source === 'undo' ? !history.canUndo.value : !history.canRedo.value) {
      return Promise.resolve({ status: 'invalid', reason: source === 'undo' ? 'Nothing to undo' : 'Nothing to redo' })
    }
    const snapshot = (source === 'undo' ? history.peekUndo() : history.peekRedo()) as S
    return run(source, { kind: 'restore', snapshot }, snapshot)
  }

  /** Replace the accepted state with an externally confirmed one, reset history and drop in-flight responses. */
  function refresh(state: S, version: string) {
    core.value = refreshTransactionState(core.value, state, version)
    history.reset(state)
    historyReset.value = { reason: 'refresh', version }
    onHistoryReset?.(historyReset.value)
  }

  /** Settle an operation that ended as uncertain, using a result obtained from the server. */
  function reconcile(reconciled: SaveResult<S>): TransactionOutcome<S> {
    const pending = core.value.pending
    if (core.value.status !== 'uncertain' || !pending) {
      // Repeated accepted results for an already committed operation are ignored.
      return adopt(settleTransaction(core.value, reconciled.operationId, core.value.epoch, reconciled, true))
    }
    if (reconciled.operationId !== pending.operationId) return { status: 'discarded', operationId: reconciled.operationId }
    return adopt(settleTransaction(core.value, pending.operationId, pending.epoch, reconciled, true))
  }

  /** Dismiss the last rejected, conflict or uncertain result. The accepted input is unchanged. */
  function clearResult() {
    core.value = clearTransactionResult(core.value)
  }

  return {
    acceptedState,
    acceptedVersion,
    candidateState,
    status,
    pendingTransaction,
    result,
    historyReset,
    canUndo,
    canRedo,
    submit,
    undo: () => restore('undo'),
    redo: () => restore('redo'),
    refresh,
    reconcile,
    clearResult,
  }
}
