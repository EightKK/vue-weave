import assert from 'node:assert/strict'
import { test } from 'node:test'
import { useEditHistory } from 'vue-weave'

test('history bounds old snapshots and drops the redo branch after a commit', () => {
  const history = useEditHistory(0, 2)
  for (const next of [1, 2, 3]) history.commit(next)
  history.undo()
  history.undo()
  history.undo()
  assert.equal(history.state.value, 1)
  assert.equal(history.canUndo.value, false)
  history.redo()
  assert.equal(history.state.value, 2)
  history.commit(4)
  assert.equal(history.canRedo.value, false)
  history.reset(10)
  assert.equal(history.state.value, 10)
  assert.equal(history.canUndo.value, false)
})
