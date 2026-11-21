import assert from 'node:assert/strict'
import { test } from 'node:test'
import { applyBoardCardMove, boardCardPosition, groupBoardCards } from 'vue-weave/core'

const columns = [
  { id: 'todo', label: 'To do' },
  { id: 'doing', label: 'Doing', wipLimit: 2 },
  { id: 'done', label: 'Done' },
]
const lanes = [{ id: 'web', label: 'Web' }, { id: 'api', label: 'API' }]
const card = (id, columnId, laneId) => ({ id, columnId, ...laneId ? { laneId } : {}, label: id.toUpperCase() })
const ids = list => list.map(item => item.id)

test('groupBoardCards groups cards into columns × lanes in card order, with WIP counts', () => {
  const cards = [card('a', 'todo', 'web'), card('b', 'doing', 'api'), card('c', 'todo', 'web'), card('d', 'doing', 'web'), card('e', 'doing', 'web')]
  const groups = groupBoardCards(cards, columns, lanes)
  assert.deepEqual(groups.rows.map(row => row.laneId), ['web', 'api'])
  assert.deepEqual(groups.rows[0].cells.map(cell => ids(cell.cards)), [['a', 'c'], ['d', 'e'], []])
  assert.deepEqual(groups.rows[1].cells.map(cell => ids(cell.cards)), [[], ['b'], []])
  assert.deepEqual(groups.rows[1].cells[1], { columnId: 'doing', laneId: 'api', cards: [cards[1]] })
  assert.deepEqual(groups.columns, [
    { id: 'todo', count: 2, atLimit: false, overLimit: false },
    { id: 'doing', count: 3, wipLimit: 2, atLimit: true, overLimit: true },
    { id: 'done', count: 0, atLimit: false, overLimit: false },
  ])
  assert.deepEqual(groups.positions.get('e'), { columnId: 'doing', laneId: 'web', index: 1 })
  assert.equal(groups.rows[0].cells[0].cards[0], cards[0], 'cards are passed through, not copied')
})

test('groupBoardCards without lanes has one row and ignores card lanes', () => {
  const cards = [card('a', 'doing', 'web'), card('b', 'doing', 'api')]
  for (const noLanes of [undefined, []]) {
    const groups = groupBoardCards(cards, columns, noLanes)
    assert.equal(groups.rows.length, 1)
    assert.equal(groups.rows[0].laneId, undefined)
    assert.deepEqual(ids(groups.rows[0].cells[1].cards), ['a', 'b'])
    assert.deepEqual(groups.positions.get('b'), { columnId: 'doing', index: 1 })
    assert.deepEqual(groups.columns[1], { id: 'doing', count: 2, wipLimit: 2, atLimit: true, overLimit: false })
  }
  assert.deepEqual(groupBoardCards([], [], undefined), { rows: [{ laneId: undefined, cells: [] }], columns: [], positions: new Map() })
})

test('groupBoardCards validates IDs, references and WIP limits', () => {
  assert.throws(() => groupBoardCards([], [{ id: '', label: 'x' }]), { name: 'Error', message: 'Invalid column ID: ""' })
  assert.throws(() => groupBoardCards([], [columns[0], columns[0]]), { message: 'Duplicate column ID: todo' })
  assert.throws(() => groupBoardCards([], columns, [lanes[0], lanes[0]]), { message: 'Duplicate lane ID: web' })
  assert.throws(() => groupBoardCards([card('a', 'todo'), card('a', 'done')], columns), { message: 'Duplicate card ID: a' })
  assert.throws(() => groupBoardCards([card('a', 'later')], columns), { name: 'Error', message: 'Unknown column in card a: later' })
  assert.throws(() => groupBoardCards([card('a', 'todo', 'ops')], columns, lanes), { message: 'Unknown lane in card a: ops' })
  assert.throws(() => groupBoardCards([card('a', 'todo')], columns, lanes), { message: 'Unknown lane in card a: undefined' })
  for (const wipLimit of [-1, 1.5, Number.NaN, Infinity]) {
    assert.throws(() => groupBoardCards([], [{ id: 'x', label: 'X', wipLimit }]), {
      name: 'RangeError', message: `The WIP limit of column x must be a non-negative integer: ${wipLimit}`,
    })
  }
  assert.equal(groupBoardCards([], [{ id: 'x', label: 'X', wipLimit: 0 }]).columns[0].atLimit, true)
})

test('boardCardPosition counts the cell with or without lanes', () => {
  const cards = [card('a', 'todo', 'web'), card('b', 'todo', 'api'), card('c', 'todo', 'api')]
  assert.deepEqual(boardCardPosition(cards, 'c'), { columnId: 'todo', index: 2 })
  assert.deepEqual(boardCardPosition(cards, 'c', { lanes: true }), { columnId: 'todo', laneId: 'api', index: 1 })
  assert.throws(() => boardCardPosition(cards, 'zz'), { name: 'Error', message: 'Unknown card in board: zz' })
})

test('applyBoardCardMove moves a card between cells and reorders inside a cell without mutating input', () => {
  const cards = Object.freeze([card('a', 'todo'), card('b', 'todo'), card('c', 'doing'), card('d', 'doing')].map(item => Object.freeze(item)))
  const toDoing = applyBoardCardMove(cards, { id: 'a', before: { columnId: 'todo', index: 0 }, after: { columnId: 'doing', index: 1 }, source: 'pointer' })
  assert.deepEqual(ids(toDoing), ['b', 'c', 'a', 'd'])
  assert.equal(toDoing[2].columnId, 'doing')
  assert.notEqual(toDoing[2], cards[0])
  assert.equal(toDoing[0], cards[1], 'other cards are kept as they are')
  assert.equal(cards[0].columnId, 'todo')
  const last = applyBoardCardMove(cards, { id: 'a', before: { columnId: 'todo', index: 0 }, after: { columnId: 'doing', index: 2 }, source: 'keyboard' })
  assert.deepEqual(ids(last), ['b', 'c', 'd', 'a'])
  const reorder = applyBoardCardMove(cards, { id: 'b', before: { columnId: 'todo', index: 1 }, after: { columnId: 'todo', index: 0 }, source: 'keyboard' })
  assert.deepEqual(ids(reorder), ['b', 'a', 'c', 'd'])
  const empty = applyBoardCardMove(cards, { id: 'c', before: { columnId: 'doing', index: 0 }, after: { columnId: 'done', index: 0 }, source: 'pointer' })
  assert.deepEqual(ids(empty), ['a', 'b', 'c', 'd'])
  assert.equal(empty[2].columnId, 'done')
  // The result groups as the proposal said.
  const groups = groupBoardCards(toDoing, columns)
  assert.deepEqual(groups.positions.get('a'), { columnId: 'doing', index: 1 })
})

test('applyBoardCardMove changes lanes and keeps card lanes on boards without lanes', () => {
  const cards = [card('a', 'todo', 'web'), card('b', 'doing', 'api'), card('c', 'doing', 'web')]
  const moved = applyBoardCardMove(cards, {
    id: 'a', before: { columnId: 'todo', laneId: 'web', index: 0 }, after: { columnId: 'doing', laneId: 'api', index: 0 }, source: 'pointer',
  }, { columns, lanes })
  assert.deepEqual(ids(moved), ['a', 'b', 'c'])
  assert.deepEqual(moved[0], { id: 'a', columnId: 'doing', laneId: 'api', label: 'A' })
  assert.deepEqual(groupBoardCards(moved, columns, lanes).positions.get('a'), { columnId: 'doing', laneId: 'api', index: 0 })
  const plain = applyBoardCardMove(cards, { id: 'a', before: { columnId: 'todo', index: 0 }, after: { columnId: 'doing', index: 2 }, source: 'keyboard' })
  assert.deepEqual(plain.at(-1), { id: 'a', columnId: 'doing', laneId: 'web', label: 'A' })
})

test('applyBoardCardMove rejects unknown references, bad indexes and stale proposals', () => {
  const cards = [card('a', 'todo', 'web'), card('b', 'todo', 'web')]
  const move = (after, before = { columnId: 'todo', laneId: 'web', index: 0 }, id = 'a') => () =>
    applyBoardCardMove(cards, { id, before, after, source: 'keyboard' }, { columns, lanes })
  assert.throws(move({ columnId: 'done', laneId: 'web', index: 0 }, undefined, 'zz'), { name: 'Error', message: 'Unknown card in board: zz' })
  assert.throws(move({ columnId: 'later', laneId: 'web', index: 0 }), { name: 'Error', message: 'Unknown column in card move a: later' })
  assert.throws(move({ columnId: 'done', laneId: 'ops', index: 0 }), { name: 'Error', message: 'Unknown lane in card move a: ops' })
  assert.throws(move({ columnId: '', laneId: 'web', index: 0 }), { message: 'Invalid column ID: ""' })
  assert.throws(move({ columnId: 'done', index: 0 }), { message: 'A card move must name a lane in both positions or in neither: a' })
  for (const index of [-1, 2, 0.5, Number.NaN]) {
    assert.throws(move({ columnId: 'todo', laneId: 'web', index }), { name: 'RangeError', message: `The card index must be an integer from 0 to 1: ${index}` })
  }
  assert.throws(move({ columnId: 'done', laneId: 'web', index: 0 }, { columnId: 'todo', laneId: 'web', index: 1 }), {
    name: 'Error', message: 'Stale card move for a: the card is at todo / web index 0',
  })
  assert.throws(move({ columnId: 'done', laneId: 'web', index: 0 }, { columnId: 'doing', laneId: 'web', index: 0 }), { message: /^Stale card move for a/ })
  // Without the board, any column ID is accepted.
  assert.equal(applyBoardCardMove(cards, { id: 'a', before: { columnId: 'todo', index: 0 }, after: { columnId: 'later', index: 0 }, source: 'pointer' })[0].columnId, 'later')
})
