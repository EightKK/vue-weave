/** Where an edit transaction originated. */
export type TransactionSource = 'pointer' | 'keyboard' | 'api' | 'undo' | 'redo'

/** One atomic save request. `restore` replaces the whole document with a history snapshot. */
export type EditTransaction<P, S> = {
  operationId: string
  documentId: string
  /** Opaque version the request is based on. Versions are compared for equality only. */
  baseVersion: string
  source: TransactionSource
} & (
  | { kind: 'changes'; changes: readonly P[] }
  | { kind: 'restore'; snapshot: S }
)

/** The server's answer to one save request. */
export type SaveResult<S> =
  | { status: 'accepted'; operationId: string; version: string; state: S }
  | { status: 'rejected'; operationId: string; code: string }
  | { status: 'conflict'; operationId: string; currentVersion: string }
  | { status: 'uncertain'; operationId: string }

/** What a submit, undo, redo or reconcile call resolves to. */
export type TransactionOutcome<S> =
  | SaveResult<S>
  | { status: 'busy' }
  | { status: 'invalid'; reason: string }
  | { status: 'discarded'; operationId: string }

/** Application hooks. `validate` and `apply` are synchronous and must not mutate their arguments. */
export interface TransactionAdapter<S, P> {
  /** Return `false` or a reason string to reject the changes; `true` or nothing accepts them. */
  validate(state: S, changes: readonly P[]): boolean | string | void
  apply(state: S, changes: readonly P[]): S
  save(request: EditTransaction<P, S>, candidate: S): Promise<SaveResult<S>>
}

export type TransactionStatus = 'idle' | 'saving' | 'rejected' | 'conflict' | 'uncertain'

/** The in-flight (or unresolved) operation. */
export interface PendingTransaction {
  operationId: string
  kind: 'changes' | 'restore'
  source: TransactionSource
  baseVersion: string
  /** Epoch at the time of submission; a response is only adopted while it still matches. */
  epoch: number
}

export type TransactionFailure = Exclude<SaveResult<unknown>, { status: 'accepted' }>

/** Immutable transaction state. Every transition returns a new value. */
export interface TransactionCoreState<S> {
  acceptedState: S
  acceptedVersion: string
  candidateState: S | undefined
  status: TransactionStatus
  pending: PendingTransaction | undefined
  /** Last non-accepted result, kept until `clearResult`, the next submission or a refresh. */
  result: TransactionFailure | undefined
  epoch: number
  /** Operation IDs committed in this epoch, used to ignore duplicate accepted responses. */
  committed: readonly string[]
}

const COMMITTED_LIMIT = 64

export function createTransactionState<S>(acceptedState: S, acceptedVersion: string): TransactionCoreState<S> {
  return {
    acceptedState,
    acceptedVersion,
    candidateState: undefined,
    status: 'idle',
    pending: undefined,
    result: undefined,
    epoch: 0,
    committed: [],
  }
}

/** Start saving. Returns `undefined` while another save is in flight for the document. */
export function beginTransaction<S>(
  state: TransactionCoreState<S>,
  pending: Omit<PendingTransaction, 'epoch' | 'baseVersion'>,
  candidate: S,
): TransactionCoreState<S> | undefined {
  if (state.status === 'saving') return undefined
  return {
    ...state,
    candidateState: candidate,
    status: 'saving',
    pending: { ...pending, baseVersion: state.acceptedVersion, epoch: state.epoch },
    result: undefined,
  }
}

export interface SettleResult<S> {
  state: TransactionCoreState<S>
  outcome: TransactionOutcome<S>
  /** The operation whose accepted state was just committed, if any. The caller records history for it. */
  committed: PendingTransaction | undefined
}

/**
 * Apply a response. The response is adopted only when it answers the current pending operation in the
 * current epoch; anything else changes nothing. `allowUncertain` lets reconcile settle an operation that
 * ended as uncertain.
 */
export function settleTransaction<S>(
  state: TransactionCoreState<S>,
  operationId: string,
  epoch: number,
  result: SaveResult<S>,
  allowUncertain = false,
): SettleResult<S> {
  const pending = state.pending
  const live = pending !== undefined && pending.operationId === operationId && pending.epoch === epoch && epoch === state.epoch
  const open = state.status === 'saving' || (allowUncertain && state.status === 'uncertain')
  if (result.operationId !== operationId) return { state, outcome: { status: 'discarded', operationId }, committed: undefined }
  if (!live || !open) {
    // A repeated accepted response for an operation already committed in this epoch is a no-op.
    if (result.status === 'accepted' && epoch === state.epoch && state.committed.includes(operationId)) {
      return { state, outcome: result, committed: undefined }
    }
    return { state, outcome: { status: 'discarded', operationId }, committed: undefined }
  }
  if (result.status === 'accepted') {
    return {
      state: {
        ...state,
        acceptedState: result.state,
        acceptedVersion: result.version,
        candidateState: undefined,
        status: 'idle',
        pending: undefined,
        result: undefined,
        committed: [...state.committed, operationId].slice(-COMMITTED_LIMIT),
      },
      outcome: result,
      committed: pending,
    }
  }
  if (result.status === 'uncertain') {
    // Keep the pending operation so it can be reconciled; never assume it was or was not applied.
    return { state: { ...state, candidateState: undefined, status: 'uncertain', result }, outcome: result, committed: undefined }
  }
  return {
    state: { ...state, candidateState: undefined, status: result.status, pending: undefined, result },
    outcome: result,
    committed: undefined,
  }
}

/** Replace the accepted state with an externally confirmed one and invalidate all in-flight responses. */
export function refreshTransactionState<S>(
  state: TransactionCoreState<S>,
  acceptedState: S,
  acceptedVersion: string,
): TransactionCoreState<S> {
  return { ...createTransactionState(acceptedState, acceptedVersion), epoch: state.epoch + 1 }
}

/** Dismiss a rejected, conflict or uncertain result. Never changes the accepted input. */
export function clearTransactionResult<S>(state: TransactionCoreState<S>): TransactionCoreState<S> {
  if (state.status === 'saving' || state.status === 'idle') return state
  return { ...state, status: 'idle', pending: undefined, result: undefined }
}
