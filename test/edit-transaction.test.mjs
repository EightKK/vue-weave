import assert from 'node:assert/strict'
import { test } from 'node:test'
import { useEditHistory, useEditTransaction } from 'vue-weave'

function deferred() {
  let resolve, reject
  const promise = new Promise((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

// A document is a plain object { items: string[] }; changes append items.
function setup(options = {}) {
  const saves = []
  let n = 0
  const adapter = {
    validate: (_state, changes) => (changes.some((c) => c === 'bad') ? 'bad change' : true),
    apply: (state, changes) => ({ items: [...state.items, ...changes] }),
    save(request, candidate) {
      const d = deferred()
      saves.push({ request, candidate, ...d })
      return d.promise
    },
  }
  const tx = useEditTransaction({
    documentId: 'doc',
    initialState: { items: [] },
    initialVersion: 'v0',
    adapter,
    createOperationId: () => `op${++n}`,
    ...options,
  })
  const accept = (i, version, state) => saves[i].resolve({ status: 'accepted', operationId: saves[i].request.operationId, version, state: state ?? saves[i].candidate })
  return { tx, saves, accept }
}

async function commitEdit(ctx, change, version) {
  const p = ctx.tx.submit([change])
  ctx.accept(ctx.saves.length - 1, version)
  const outcome = await p
  assert.equal(outcome.status, 'accepted')
  return outcome
}

test('accepted: candidate is separate while saving, then committed with one history entry', async () => {
  const ctx = setup()
  const { tx, saves } = ctx
  const p = tx.submit(['a'])
  assert.equal(tx.status.value, 'saving')
  assert.deepEqual(tx.acceptedState.value.items, [])
  assert.deepEqual(tx.candidateState.value.items, ['a'])
  assert.deepEqual(tx.pendingTransaction.value, { operationId: 'op1', kind: 'changes', source: 'api', baseVersion: 'v0' })
  assert.equal(saves[0].request.documentId, 'doc')
  ctx.accept(0, 'v1', { items: ['a', 'server'] })
  assert.equal((await p).status, 'accepted')
  assert.equal(tx.status.value, 'idle')
  assert.equal(tx.candidateState.value, undefined)
  assert.equal(tx.acceptedVersion.value, 'v1')
  assert.deepEqual(tx.acceptedState.value.items, ['a', 'server'])
  assert.equal(tx.canUndo.value, true)
})

test('invalid: synchronous validation failure changes nothing and never saves', async () => {
  const { tx, saves } = setup()
  assert.deepEqual(await tx.submit(['bad']), { status: 'invalid', reason: 'bad change' })
  assert.deepEqual(await tx.submit([]), { status: 'invalid', reason: 'No changes to save' })
  assert.equal(saves.length, 0)
  assert.equal(tx.status.value, 'idle')
  assert.equal(tx.canUndo.value, false)
})

test('R04: re-editing while saving returns busy without partial commit', async () => {
  const ctx = setup()
  const p = ctx.tx.submit(['a'])
  assert.deepEqual(await ctx.tx.submit(['b']), { status: 'busy' })
  assert.deepEqual(await ctx.tx.undo(), { status: 'busy' })
  assert.equal(ctx.saves.length, 1)
  ctx.accept(0, 'v1')
  await p
  assert.deepEqual(ctx.tx.acceptedState.value.items, ['a'])
})

test('rejected: candidate dropped, accepted kept, result readable and clearable', async () => {
  const ctx = setup()
  const p = ctx.tx.submit(['a'])
  ctx.saves[0].resolve({ status: 'rejected', operationId: 'op1', code: 'nope' })
  assert.equal((await p).status, 'rejected')
  assert.equal(ctx.tx.status.value, 'rejected')
  assert.deepEqual(ctx.tx.result.value, { status: 'rejected', operationId: 'op1', code: 'nope' })
  assert.deepEqual(ctx.tx.acceptedState.value.items, [])
  assert.equal(ctx.tx.candidateState.value, undefined)
  assert.equal(ctx.tx.canUndo.value, false)
  ctx.tx.clearResult()
  assert.equal(ctx.tx.status.value, 'idle')
  assert.equal(ctx.tx.result.value, undefined)
  assert.equal(ctx.tx.acceptedVersion.value, 'v0')
})

test('conflict: accepted state and version are not rolled back or advanced', async () => {
  const ctx = setup()
  const p = ctx.tx.submit(['a'])
  ctx.saves[0].resolve({ status: 'conflict', operationId: 'op1', currentVersion: 'v9' })
  assert.equal((await p).status, 'conflict')
  assert.equal(ctx.tx.status.value, 'conflict')
  assert.equal(ctx.tx.acceptedVersion.value, 'v0')
  assert.deepEqual(ctx.tx.acceptedState.value.items, [])
})

test('R05: a lost response stays uncertain and is never resent', async () => {
  const ctx = setup()
  const p = ctx.tx.submit(['a'])
  ctx.saves[0].reject(new Error('timeout'))
  assert.deepEqual(await p, { status: 'uncertain', operationId: 'op1' })
  assert.equal(ctx.tx.status.value, 'uncertain')
  assert.equal(ctx.saves.length, 1)
  assert.deepEqual(ctx.tx.acceptedState.value.items, [])
  assert.equal(ctx.tx.pendingTransaction.value.operationId, 'op1')
})

test('reconcile: uncertain operation confirmed as applied is committed once', async () => {
  const ctx = setup()
  const p = ctx.tx.submit(['a'])
  ctx.saves[0].resolve({ status: 'uncertain', operationId: 'op1' })
  await p
  const wrong = ctx.tx.reconcile({ status: 'accepted', operationId: 'other', version: 'v7', state: { items: ['x'] } })
  assert.equal(wrong.status, 'discarded')
  assert.equal(ctx.tx.status.value, 'uncertain')
  const done = ctx.tx.reconcile({ status: 'accepted', operationId: 'op1', version: 'v1', state: { items: ['a'] } })
  assert.equal(done.status, 'accepted')
  assert.equal(ctx.tx.status.value, 'idle')
  assert.equal(ctx.tx.acceptedVersion.value, 'v1')
  assert.deepEqual(ctx.tx.acceptedState.value.items, ['a'])
  ctx.tx.reconcile({ status: 'accepted', operationId: 'op1', version: 'v1', state: { items: ['a'] } })
  const u = ctx.tx.undo()
  assert.equal(ctx.saves[1].request.snapshot.items.length, 0)
  ctx.accept(1, 'v2')
  await u
  assert.equal(ctx.tx.canUndo.value, false) // only one history entry existed
})

test('reconcile: not applied leaves the accepted input and allows a new edit', async () => {
  const ctx = setup()
  const p = ctx.tx.submit(['a'])
  ctx.saves[0].resolve({ status: 'uncertain', operationId: 'op1' })
  await p
  assert.equal(ctx.tx.reconcile({ status: 'rejected', operationId: 'op1', code: 'not-applied' }).status, 'rejected')
  assert.equal(ctx.tx.status.value, 'rejected')
  assert.deepEqual(ctx.tx.acceptedState.value.items, [])
  ctx.tx.clearResult()
  assert.equal(ctx.tx.status.value, 'idle')
})

test('R06: duplicate accepted response commits one history entry', async () => {
  const ctx = setup()
  const outcome = await commitEdit(ctx, 'a', 'v1')
  const before = ctx.tx.acceptedState.value
  const again = ctx.tx.reconcile(outcome)
  assert.equal(again.status, 'accepted')
  assert.equal(ctx.tx.acceptedState.value, before)
  assert.equal(ctx.tx.acceptedVersion.value, 'v1')
  const p = ctx.tx.undo()
  ctx.accept(1, 'v2')
  await p
  assert.equal(ctx.tx.canUndo.value, false)
})

test('O09: stale response after refresh is discarded and does not disturb the new state', async () => {
  const ctx = setup()
  const p = ctx.tx.submit(['a'])
  ctx.tx.refresh({ items: ['fresh'] }, 'v2')
  assert.equal(ctx.tx.status.value, 'idle')
  assert.equal(ctx.tx.pendingTransaction.value, undefined)
  // A new save starts and is pending when the stale response (and its finally path) arrives.
  const q = ctx.tx.submit(['b'])
  ctx.accept(0, 'v1')
  assert.deepEqual(await p, { status: 'discarded', operationId: 'op1' })
  assert.equal(ctx.tx.status.value, 'saving')
  assert.equal(ctx.tx.pendingTransaction.value.operationId, 'op2')
  assert.equal(ctx.tx.pendingTransaction.value.baseVersion, 'v2')
  assert.equal(ctx.tx.acceptedVersion.value, 'v2')
  assert.deepEqual(ctx.tx.acceptedState.value.items, ['fresh'])
  ctx.accept(1, 'v3')
  assert.equal((await q).status, 'accepted')
  assert.deepEqual(ctx.tx.acceptedState.value.items, ['fresh', 'b'])
  assert.equal(ctx.tx.canUndo.value, true)
})

test('R06b: stale uncertain/thrown save after refresh is discarded', async () => {
  const ctx = setup()
  const p = ctx.tx.submit(['a'])
  ctx.tx.refresh({ items: ['fresh'] }, 'v2')
  ctx.saves[0].reject(new Error('late'))
  assert.equal((await p).status, 'discarded')
  assert.equal(ctx.tx.status.value, 'idle')
})

test('refresh resets history and exposes the reason', async () => {
  const seen = []
  const ctx = setup({ onHistoryReset: (r) => seen.push(r) })
  await commitEdit(ctx, 'a', 'v1')
  assert.equal(ctx.tx.canUndo.value, true)
  assert.equal(ctx.tx.historyReset.value, undefined)
  ctx.tx.refresh({ items: ['ext'] }, 'v5')
  assert.equal(ctx.tx.canUndo.value, false)
  assert.equal(ctx.tx.canRedo.value, false)
  assert.deepEqual(ctx.tx.historyReset.value, { reason: 'refresh', version: 'v5' })
  assert.deepEqual(seen, [{ reason: 'refresh', version: 'v5' }])
  assert.equal(ctx.tx.acceptedVersion.value, 'v5')
})

test('undo is a restore transaction against the current version; acceptance moves history and keeps redo', async () => {
  const ctx = setup()
  await commitEdit(ctx, 'a', 'v1')
  await commitEdit(ctx, 'b', 'v2')
  const p = ctx.tx.undo()
  const req = ctx.saves[2].request
  assert.equal(req.kind, 'restore')
  assert.equal(req.source, 'undo')
  assert.equal(req.baseVersion, 'v2')
  assert.deepEqual(req.snapshot.items, ['a'])
  assert.deepEqual(ctx.tx.acceptedState.value.items, ['a', 'b']) // unchanged while saving
  assert.equal(ctx.tx.canUndo.value, true)
  ctx.accept(2, 'v3', { items: ['a', 'normalised'] })
  assert.equal((await p).status, 'accepted')
  assert.equal(ctx.tx.acceptedVersion.value, 'v3') // never rolled back to v1
  assert.deepEqual(ctx.tx.acceptedState.value.items, ['a', 'normalised'])
  assert.equal(ctx.tx.canRedo.value, true)
  assert.equal(ctx.tx.canUndo.value, true)
  const r = ctx.tx.redo()
  assert.equal(ctx.saves[3].request.source, 'redo')
  assert.equal(ctx.saves[3].request.baseVersion, 'v3')
  assert.deepEqual(ctx.saves[3].request.snapshot.items, ['a', 'b'])
  ctx.accept(3, 'v4')
  await r
  assert.deepEqual(ctx.tx.acceptedState.value.items, ['a', 'b'])
  assert.equal(ctx.tx.canRedo.value, false)
})

test('R07: a rejected, conflicting or uncertain undo keeps display, history position and version', async () => {
  for (const response of [
    { status: 'rejected', operationId: 'op3', code: 'no' },
    { status: 'conflict', operationId: 'op3', currentVersion: 'v8' },
    { status: 'uncertain', operationId: 'op3' },
  ]) {
    const ctx = setup()
    await commitEdit(ctx, 'a', 'v1')
    await commitEdit(ctx, 'b', 'v2')
    const before = ctx.tx.acceptedState.value
    const p = ctx.tx.undo()
    ctx.saves[2].resolve(response)
    assert.equal((await p).status, response.status)
    assert.equal(ctx.tx.acceptedState.value, before)
    assert.equal(ctx.tx.acceptedVersion.value, 'v2')
    assert.equal(ctx.tx.canRedo.value, false)
    ctx.tx.clearResult()
    // Position unchanged: a second undo still targets the same snapshot.
    const again = ctx.tx.undo()
    assert.deepEqual(ctx.saves[3].request.snapshot.items, ['a'])
    ctx.saves[3].reject(new Error('x'))
    await again
  }
})

test('undo and redo report invalid when there is nothing to restore', async () => {
  const ctx = setup()
  assert.equal((await ctx.tx.undo()).status, 'invalid')
  assert.equal((await ctx.tx.redo()).status, 'invalid')
  assert.equal(ctx.saves.length, 0)
})

test('redo survives a failed save; a new accepted edit truncates redo', async () => {
  const ctx = setup()
  await commitEdit(ctx, 'a', 'v1')
  const u = ctx.tx.undo()
  ctx.accept(1, 'v2')
  await u
  assert.equal(ctx.tx.canRedo.value, true)
  const failed = ctx.tx.submit(['x'])
  ctx.saves[2].resolve({ status: 'rejected', operationId: 'op3', code: 'no' })
  await failed
  assert.equal(ctx.tx.canRedo.value, true)
  ctx.tx.clearResult()
  await commitEdit(ctx, 'y', 'v3')
  assert.equal(ctx.tx.canRedo.value, false)
  assert.deepEqual(ctx.tx.acceptedState.value.items, ['y'])
})

test('uncertain restore reconciled as applied moves history', async () => {
  const ctx = setup()
  await commitEdit(ctx, 'a', 'v1')
  const p = ctx.tx.undo()
  ctx.saves[1].reject(new Error('timeout'))
  await p
  assert.equal(ctx.tx.canRedo.value, false)
  ctx.tx.reconcile({ status: 'accepted', operationId: 'op2', version: 'v2', state: { items: [] } })
  assert.equal(ctx.tx.canUndo.value, false)
  assert.equal(ctx.tx.canRedo.value, true)
})

test('useEditHistory: existing behaviour is unchanged and the new methods are additive', () => {
  const h = useEditHistory('a', 2)
  h.commit('b')
  h.commit('b')
  h.commit('c')
  assert.equal(h.state.value, 'c')
  assert.equal(h.peekUndo(), 'b')
  assert.equal(h.peekRedo(), undefined)
  assert.equal(h.state.value, 'c')
  h.undo()
  assert.equal(h.peekUndo(), 'a')
  assert.equal(h.peekRedo(), 'c')
  h.replaceCurrent('B')
  assert.equal(h.state.value, 'B')
  assert.equal(h.canUndo.value, true)
  assert.equal(h.canRedo.value, true)
  h.redo()
  assert.equal(h.state.value, 'c')
  h.undo()
  h.commit('d')
  assert.equal(h.canRedo.value, false)
  h.reset('z')
  assert.equal(h.peekUndo(), undefined)
  assert.equal(h.canUndo.value, false)
  assert.throws(() => useEditHistory('a', 0), RangeError)
})

test('a server that renames IDs is accepted as one consistent state, references included', async () => {
  // A plan with a client-side temporary task ID; the server assigns the permanent ID and rewrites the dependency.
  const saves = []
  const tx = useEditTransaction({
    documentId: 'plan', initialState: { tasks: [{ id: 'A' }], links: [] }, initialVersion: 'v1',
    adapter: {
      validate: () => true,
      apply: (state, changes) => ({ tasks: [...state.tasks, ...changes.map(change => ({ id: change.id }))], links: [...state.links, ...changes.map(change => ({ from: 'A', to: change.id }))] }),
      save: async (request, candidate) => {
        saves.push(candidate)
        const rename = id => (id === 'tmp-1' ? 'T-100' : id)
        return {
          status: 'accepted', operationId: request.operationId, version: 'v2',
          state: { tasks: candidate.tasks.map(task => ({ id: rename(task.id) })), links: candidate.links.map(link => ({ from: rename(link.from), to: rename(link.to) })) },
        }
      },
    },
  })
  const outcome = await tx.submit([{ id: 'tmp-1' }])
  assert.equal(outcome.status, 'accepted')
  assert.deepEqual(saves[0].tasks.map(task => task.id), ['A', 'tmp-1'])
  // The accepted input is the server's state as a whole: no temporary ID survives in a task or a link.
  assert.deepEqual(tx.acceptedState.value, { tasks: [{ id: 'A' }, { id: 'T-100' }], links: [{ from: 'A', to: 'T-100' }] })
  assert.equal(tx.acceptedVersion.value, 'v2')
  assert.equal(tx.candidateState.value, undefined)
  // The history entry is the normalised state too, so undo and redo restore server IDs.
  assert.equal(JSON.stringify(tx.acceptedState.value).includes('tmp-1'), false)
})
