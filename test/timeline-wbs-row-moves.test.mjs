import assert from 'node:assert/strict'
import { test } from 'node:test'
import { indentTimelineRow, moveTimelineRow, outdentTimelineRow, timelineRowPosition, timelineWbsCodes } from 'vue-weave/core'

const freeze = rows => Object.freeze(rows.map(row => Object.freeze({ ...row })))
const tree = freeze([
  { id: 'a', label: 'A' }, { id: 'b', label: 'B', parentId: 'a' }, { id: 'c', label: 'C', parentId: 'a' },
  { id: 'd', label: 'D', parentId: 'c' }, { id: 'e', label: 'E' },
])

const order = rows => rows.map(row => row.id + (row.parentId ? '<' + row.parentId : ''))

test('timelineWbsCodes numbers rows in tree preorder by sibling position', () => {
  assert.deepEqual([...timelineWbsCodes(tree)], [['a', '1'], ['b', '1.1'], ['c', '1.2'], ['d', '1.2.1'], ['e', '2']])
  // Sibling order is array order, even when a child is listed before its parent.
  const codes = timelineWbsCodes([{ id: 'x', label: 'X', parentId: 'r' }, { id: 'r', label: 'R' }, { id: 'y', label: 'Y', parentId: 'r' }])
  assert.deepEqual([...codes], [['r', '1'], ['x', '1.1'], ['y', '1.2']])
  assert.deepEqual([...timelineWbsCodes([])], [])
  assert.throws(() => timelineWbsCodes([{ id: 'a', label: 'A', parentId: 'b' }, { id: 'b', label: 'B', parentId: 'a' }]), /cycle/)
  assert.throws(() => timelineWbsCodes([{ id: 'a', label: 'A', parentId: 'missing' }]), /Unknown parent/)
})

test('moveTimelineRow moves a subtree in preorder, returns new rows and keeps the input', () => {
  const moved = moveTimelineRow(tree, 'c', { index: 0 })
  assert.deepEqual(order(moved), ['c', 'd<c', 'a', 'b<a', 'e'])
  assert.equal('parentId' in moved[0], false)
  assert.notEqual(moved[0], tree[2])
  // Untouched rows keep their identity; the input is unchanged.
  assert.equal(moved[1], tree[3])
  assert.equal(moved[2], tree[0])
  assert.deepEqual(order(tree), ['a', 'b<a', 'c<a', 'd<c', 'e'])
  assert.deepEqual([...timelineWbsCodes(moved)], [['c', '1'], ['d', '1.1'], ['a', '2'], ['b', '2.1'], ['e', '3']])
  // The index counts the new siblings without the moved row.
  assert.deepEqual(order(moveTimelineRow(tree, 'b', { parentId: 'a', index: 1 })), ['a', 'c<a', 'd<c', 'b<a', 'e'])
  assert.deepEqual(order(moveTimelineRow(tree, 'e', { parentId: 'd', index: 0 })), ['a', 'b<a', 'c<a', 'd<c', 'e<d'])
  assert.deepEqual(order(moveTimelineRow(tree, 'a', { index: 1 })), ['e', 'a', 'b<a', 'c<a', 'd<c'])
  assert.deepEqual(timelineRowPosition(tree, 'c'), { parentId: 'a', index: 1 })
  assert.deepEqual(timelineRowPosition(tree, 'e'), { index: 1 })
})

test('moveTimelineRow rejects unknown rows, moves into the own subtree and bad indexes', () => {
  assert.throws(() => moveTimelineRow(tree, 'missing', { index: 0 }), { name: 'Error', message: /Unknown row: missing/ })
  assert.throws(() => moveTimelineRow(tree, 'b', { parentId: 'missing', index: 0 }), { name: 'Error', message: /Unknown parent row/ })
  assert.throws(() => moveTimelineRow(tree, 'a', { parentId: 'd', index: 0 }), { name: 'Error', message: /own subtree/ })
  assert.throws(() => moveTimelineRow(tree, 'c', { parentId: 'c', index: 0 }), { name: 'Error', message: /own subtree/ })
  for (const index of [-1, 3, 1.5, Number.NaN]) assert.throws(() => moveTimelineRow(tree, 'e', { index }), RangeError)
  assert.throws(() => timelineRowPosition(tree, 'missing'), /Unknown row/)
})

test('indentTimelineRow and outdentTimelineRow follow the previous sibling and the parent', () => {
  assert.deepEqual(order(indentTimelineRow(tree, 'c')), ['a', 'b<a', 'c<b', 'd<c', 'e'])
  assert.deepEqual(order(indentTimelineRow(tree, 'e')), ['a', 'b<a', 'c<a', 'd<c', 'e<a'])
  assert.deepEqual(order(outdentTimelineRow(tree, 'd')), ['a', 'b<a', 'c<a', 'd<a', 'e'])
  assert.deepEqual(order(outdentTimelineRow(tree, 'b')), ['a', 'c<a', 'd<c', 'b', 'e'])
  assert.throws(() => indentTimelineRow(tree, 'a'), { name: 'Error', message: /cannot be indented/ })
  assert.throws(() => indentTimelineRow(tree, 'b'), { name: 'Error', message: /cannot be indented/ })
  assert.throws(() => outdentTimelineRow(tree, 'a'), { name: 'Error', message: /cannot be outdented/ })
  // Indenting and then outdenting the last child restores the order.
  assert.deepEqual(order(outdentTimelineRow(indentTimelineRow(tree, 'e'), 'e')), order(tree))
})
