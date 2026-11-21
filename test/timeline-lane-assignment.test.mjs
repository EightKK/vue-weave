import assert from 'node:assert/strict'
import { test } from 'node:test'
import { assignLanes, validateTimelineData } from '@eightkk/vue-weave/core'

const lanesOf = result => result.bars.map(bar => [bar.id, bar.lane])
const bar = (id, start, end, extra = {}) => ({ id, rowId: 'r', label: id, start, end, ...extra })

test('assignLanes stacks overlapping bars first-fit in start order and lets touching bars share a lane', () => {
  const result = assignLanes([bar('a', 0, 4), bar('b', 2, 6), bar('c', 5, 8), bar('d', 8, 10), bar('e', 3, 5)])
  // a and b overlap; e overlaps both; c starts after a ends; d touches c and reuses lane 0.
  assert.deepEqual(lanesOf(result), [['a', 0], ['b', 1], ['c', 0], ['d', 0], ['e', 2]])
  assert.equal(result.laneCount, 3)
  assert.deepEqual([...result.rowLaneCounts], [['r', 3]])
  assert.deepEqual(lanesOf(assignLanes([bar('a', 0, 2), bar('b', 2, 4), bar('c', 4, 6)])), [['a', 0], ['b', 0], ['c', 0]])
  // Start order, not input order, decides; equal starts keep input order.
  assert.deepEqual(lanesOf(assignLanes([bar('late', 5, 9), bar('early', 0, 6), bar('same', 0, 2)])), [['late', 1], ['early', 0], ['same', 1]])
})

test('assignLanes treats a milestone as a point inside half-open bars', () => {
  const result = assignLanes([
    bar('task', 2, 4), bar('at-end', 4, 4), bar('at-start', 2, 2), bar('inside', 3, 3), bar('twin', 3, 3), bar('before', 0, 2),
  ])
  // A milestone at a bar's end fits beside it; one at its start or inside it does not; two at one time conflict.
  assert.deepEqual(lanesOf(result), [['task', 0], ['at-end', 0], ['at-start', 1], ['inside', 1], ['twin', 2], ['before', 0]])
  assert.equal(result.laneCount, 3)
  assert.deepEqual(lanesOf(assignLanes([bar('m', 5, 5), bar('n', 5, 5), bar('o', 6, 6)])), [['m', 0], ['n', 1], ['o', 0]])
})

test('assignLanes keepLanes keeps stable lanes and moves only conflicting bars to the lowest free lane', () => {
  const result = assignLanes([
    bar('a', 0, 4, { lane: 1 }), bar('b', 0, 4, { lane: 0 }), bar('c', 1, 2, { lane: 0 }), bar('d', 6, 8, { lane: 3 }),
    bar('e', 6, 7, { lane: 3 }), bar('f', 4, 6),
  ], { keepLanes: true })
  // c conflicts with b (placed first), so it takes the lowest lane free of a and b. e conflicts with d and drops to 0.
  assert.deepEqual(lanesOf(result), [['a', 1], ['b', 0], ['c', 2], ['d', 3], ['e', 0], ['f', 0]])
  assert.equal(result.laneCount, 4)
  // A lane that is already free is kept, even when a lower one is free too.
  assert.deepEqual(lanesOf(assignLanes([bar('x', 0, 2, { lane: 2 })], { keepLanes: true })), [['x', 2]])
  assert.equal(assignLanes([bar('x', 0, 2, { lane: 2 })], { keepLanes: true }).laneCount, 3)
  // An overlapping bar appended later moves; the earlier bars keep their lanes.
  const before = [bar('p', 0, 4), bar('q', 6, 9)]
  const appended = assignLanes([...before, bar('new', 3, 7)], { keepLanes: true })
  assert.deepEqual(lanesOf(appended), [['p', 0], ['q', 0], ['new', 1]])
  // Without keepLanes, the lanes in the input are ignored.
  assert.deepEqual(lanesOf(assignLanes([bar('a', 0, 4, { lane: 1 })])), [['a', 0]])
})

test('assignLanes counts lanes per row, returns new bars and leaves the input unchanged', () => {
  const input = Object.freeze([
    Object.freeze({ id: 'a', rowId: 'one', label: 'A', start: 0, end: 4, lane: 1 }),
    Object.freeze({ id: 'b', rowId: 'two', label: 'B', start: 0, end: 4, tone: 'teal' }),
    Object.freeze({ id: 'c', rowId: 'one', label: 'C', start: 1, end: 3 }),
    Object.freeze({ id: 'd', rowId: 'two', label: 'D', start: 4, end: 6 }),
  ])
  const result = assignLanes(input)
  assert.deepEqual(lanesOf(result), [['a', 0], ['b', 0], ['c', 1], ['d', 0]])
  assert.deepEqual([...result.rowLaneCounts], [['one', 2], ['two', 1]])
  assert.equal(result.laneCount, 2)
  assert.deepEqual(result.bars[1], { ...input[1], lane: 0 })
  for (let i = 0; i < input.length; i++) assert.notEqual(result.bars[i], input[i])
  assert.equal(input[0].lane, 1)
  assert.equal('lane' in input[2], false)
  validateTimelineData([{ id: 'one', label: 'One' }, { id: 'two', label: 'Two' }], result.bars, [], result.laneCount)

  const empty = assignLanes([])
  assert.deepEqual(empty.bars, [])
  assert.equal(empty.laneCount, 1)
  assert.equal(empty.rowLaneCounts.size, 0)
})

test('assignLanes validates intervals and lanes', () => {
  assert.throws(() => assignLanes([bar('a', 4, 2)]), RangeError)
  assert.throws(() => assignLanes([bar('a', 0, Number.NaN)]), RangeError)
  assert.throws(() => assignLanes([bar('a', 0, 2, { lane: -1 })], { keepLanes: true }), { name: 'RangeError', message: /lane for bar: a/ })
  assert.throws(() => assignLanes([bar('a', 0, 2, { lane: 1.5 })]), RangeError)
})
