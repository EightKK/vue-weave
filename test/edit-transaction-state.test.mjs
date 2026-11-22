import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  beginTransaction, clearTransactionResult, createTransactionState, refreshTransactionState, settleTransaction,
} from '@eightkk/vue-weave/core'
import { deepFreeze } from './helpers/builders.mjs'

// The pure transitions behind useEditTransaction. Every state is frozen, so a transition that mutates its input throws.
const pending = (operationId = 'op1') => ({ operationId, kind: 'changes', source: 'api' })
const accepted = (operationId, version = 'v2', state = { n: 2 }) => ({ status: 'accepted', operationId, version, state })
const saving = (operationId = 'op1', candidate = { n: 2 }) => {
  const state = beginTransaction(deepFreeze(createTransactionState({ n: 1 }, 'v1')), pending(operationId), candidate)
  assert.ok(state)
  return deepFreeze(state)
}

test('createTransactionState starts idle at epoch 0 with nothing pending or committed', () => {
  const accepted = { n: 1 }
  assert.deepEqual(createTransactionState(accepted, 'v1'), {
    acceptedState: accepted, acceptedVersion: 'v1', candidateState: undefined, status: 'idle', pending: undefined, result: undefined, epoch: 0, committed: [],
  })
  assert.equal(createTransactionState(accepted, 'v1').acceptedState, accepted)
})

test('beginTransaction records the pending operation against the accepted version and epoch', () => {
  const idle = deepFreeze(refreshTransactionState(createTransactionState({ n: 1 }, 'v1'), { n: 5 }, 'v5'))
  const candidate = { n: 6 }
  const next = beginTransaction(idle, { operationId: 'op9', kind: 'restore', source: 'undo' }, candidate)
  assert.deepEqual(next.pending, { operationId: 'op9', kind: 'restore', source: 'undo', baseVersion: 'v5', epoch: 1 })
  assert.equal(next.status, 'saving')
  assert.equal(next.candidateState, candidate)
  assert.deepEqual([next.acceptedState, next.acceptedVersion, next.epoch], [{ n: 5 }, 'v5', 1])
  assert.equal(idle.status, 'idle')
})

test('beginTransaction returns undefined while a save is in flight and leaves that state alone', () => {
  const busy = saving()
  assert.equal(beginTransaction(busy, pending('op2'), { n: 3 }), undefined)
  assert.equal(busy.pending.operationId, 'op1')
})

test('beginTransaction clears the previous result and may start again after a failure', () => {
  const rejected = settleTransaction(saving(), 'op1', 0, { status: 'rejected', operationId: 'op1', code: 'nope' }).state
  assert.equal(rejected.result.code, 'nope')
  const again = beginTransaction(deepFreeze(rejected), pending('op2'), { n: 3 })
  assert.equal(again.result, undefined)
  assert.deepEqual([again.status, again.pending.operationId], ['saving', 'op2'])
})

test('settleTransaction commits an accepted answer and reports the committed operation', () => {
  const before = saving()
  const settled = settleTransaction(before, 'op1', 0, accepted('op1'))
  assert.deepEqual(settled.outcome, accepted('op1'))
  assert.deepEqual(settled.committed, before.pending)
  assert.deepEqual(settled.state, {
    acceptedState: { n: 2 }, acceptedVersion: 'v2', candidateState: undefined, status: 'idle', pending: undefined, result: undefined, epoch: 0, committed: ['op1'],
  })
})

test('settleTransaction ignores a repeated accepted answer for a committed operation', () => {
  const first = settleTransaction(saving(), 'op1', 0, accepted('op1'))
  const repeat = settleTransaction(deepFreeze(first.state), 'op1', 0, accepted('op1', 'v9', { n: 9 }))
  assert.equal(repeat.state, first.state)
  assert.equal(repeat.committed, undefined)
  assert.equal(repeat.outcome.status, 'accepted')
  assert.equal(repeat.state.acceptedVersion, 'v2')
})

test('settleTransaction discards answers for another operation, a stale epoch or an idle state', () => {
  const busy = saving()
  const wrongOperation = settleTransaction(busy, 'op1', 0, accepted('other'))
  assert.deepEqual(wrongOperation.outcome, { status: 'discarded', operationId: 'op1' })
  assert.equal(wrongOperation.state, busy)
  const unknown = settleTransaction(busy, 'other', 0, accepted('other'))
  assert.deepEqual(unknown.outcome, { status: 'discarded', operationId: 'other' })
  assert.equal(unknown.state, busy)
  const stale = settleTransaction(busy, 'op1', 3, accepted('op1'))
  assert.deepEqual(stale.outcome, { status: 'discarded', operationId: 'op1' })
  assert.equal(stale.state, busy)
  const idle = deepFreeze(createTransactionState({ n: 1 }, 'v1'))
  const late = settleTransaction(idle, 'op1', 0, accepted('op1'))
  assert.deepEqual([late.outcome.status, late.state, late.committed], ['discarded', idle, undefined])
})

test('settleTransaction discards an answer that arrives after a refresh', () => {
  const busy = saving()
  const refreshed = deepFreeze(refreshTransactionState(busy, { n: 7 }, 'v7'))
  const late = settleTransaction(refreshed, 'op1', 0, accepted('op1'))
  assert.equal(late.outcome.status, 'discarded')
  assert.equal(late.state, refreshed)
  assert.deepEqual([late.state.acceptedState, late.state.acceptedVersion], [{ n: 7 }, 'v7'])
})

test('settleTransaction keeps a rejected or conflicting result and drops the pending operation', () => {
  for (const result of [{ status: 'rejected', operationId: 'op1', code: 'invalid' }, { status: 'conflict', operationId: 'op1', currentVersion: 'v8' }]) {
    const settled = settleTransaction(saving(), 'op1', 0, result)
    assert.equal(settled.outcome, result)
    assert.equal(settled.committed, undefined)
    assert.deepEqual(
      [settled.state.status, settled.state.pending, settled.state.candidateState, settled.state.result, settled.state.acceptedVersion, settled.state.committed],
      [result.status, undefined, undefined, result, 'v1', []],
    )
    assert.deepEqual(settled.state.acceptedState, { n: 1 })
  }
})

test('settleTransaction keeps an uncertain operation pending until reconcile settles it with allowUncertain', () => {
  const result = { status: 'uncertain', operationId: 'op1' }
  const uncertain = settleTransaction(saving(), 'op1', 0, result)
  assert.deepEqual([uncertain.state.status, uncertain.state.result, uncertain.state.candidateState], ['uncertain', result, undefined])
  assert.equal(uncertain.state.pending.operationId, 'op1')
  const frozen = deepFreeze(uncertain.state)
  assert.equal(beginTransaction(frozen, pending('op2'), { n: 3 })?.status, 'saving')
  const plain = settleTransaction(frozen, 'op1', 0, accepted('op1'))
  assert.equal(plain.outcome.status, 'discarded')
  assert.equal(plain.state, frozen)
  const reconciled = settleTransaction(frozen, 'op1', 0, accepted('op1'), true)
  assert.equal(reconciled.outcome.status, 'accepted')
  assert.equal(reconciled.committed.operationId, 'op1')
  assert.deepEqual([reconciled.state.status, reconciled.state.acceptedVersion, reconciled.state.pending, reconciled.state.result], ['idle', 'v2', undefined, undefined])
})

test('settleTransaction remembers only the last 64 committed operation IDs', () => {
  let state = createTransactionState({ n: 0 }, 'v0')
  for (let i = 1; i <= 70; i++) {
    state = beginTransaction(state, pending('op' + i), { n: i })
    state = settleTransaction(state, 'op' + i, 0, accepted('op' + i, 'v' + i, { n: i })).state
  }
  assert.equal(state.committed.length, 64)
  assert.deepEqual([state.committed[0], state.committed.at(-1)], ['op7', 'op70'])
  // An old operation that fell out of the list is no longer recognised as a duplicate.
  assert.equal(settleTransaction(state, 'op1', 0, accepted('op1')).outcome.status, 'discarded')
  assert.equal(settleTransaction(state, 'op70', 0, accepted('op70')).outcome.status, 'accepted')
})

test('refreshTransactionState adopts the confirmed state, bumps the epoch and drops everything in flight', () => {
  const busy = saving()
  const refreshed = refreshTransactionState(busy, { n: 7 }, 'v7')
  assert.deepEqual(refreshed, {
    acceptedState: { n: 7 }, acceptedVersion: 'v7', candidateState: undefined, status: 'idle', pending: undefined, result: undefined, epoch: 1, committed: [],
  })
  assert.equal(refreshTransactionState(refreshed, { n: 8 }, 'v8').epoch, 2)
  assert.equal(busy.status, 'saving')
})

test('clearTransactionResult dismisses rejected, conflict and uncertain results without touching the accepted state', () => {
  for (const result of [
    { status: 'rejected', operationId: 'op1', code: 'invalid' },
    { status: 'conflict', operationId: 'op1', currentVersion: 'v8' },
    { status: 'uncertain', operationId: 'op1' },
  ]) {
    const failed = deepFreeze(settleTransaction(saving(), 'op1', 0, result).state)
    const cleared = clearTransactionResult(failed)
    assert.deepEqual([cleared.status, cleared.pending, cleared.result], ['idle', undefined, undefined])
    assert.deepEqual([cleared.acceptedState, cleared.acceptedVersion, cleared.epoch], [failed.acceptedState, failed.acceptedVersion, failed.epoch])
  }
})

test('clearTransactionResult returns the same state while saving or idle', () => {
  const busy = saving()
  assert.equal(clearTransactionResult(busy), busy)
  const idle = deepFreeze(createTransactionState({ n: 1 }, 'v1'))
  assert.equal(clearTransactionResult(idle), idle)
})
