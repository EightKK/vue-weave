import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  parseWeaveSnapshot,
  restoreWeaveSnapshot,
  serializeWeaveSnapshot,
  createTimelineViewState,
  projectTimelineView,
} from '@eightkk/vue-weave/core'

const dateCodec = {
  id: 'date',
  matches: value => value instanceof Date,
  encode: value => value.toISOString(),
  decode: value => new Date(value),
}

const registry = {
  codecs: [dateCodec],
  layouts: { layered: options => ({ options }) },
  columns: {
    owner: { label: 'Owner', width: 120, value: row => row.id },
    money: { label: 'Cost', value: () => 0 },
    extra: { label: 'Extra', value: () => 'x' },
  },
  editors: { number: { kind: 'number' } },
  comparators: { natural: (a, b) => String(a).localeCompare(String(b)) },
}

const parse = text => {
  const result = parseWeaveSnapshot(text)
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics))
  return result.snapshot
}

const restore = (snapshot, reg = registry) => {
  const result = restoreWeaveSnapshot(snapshot, reg)
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics))
  return result.snapshot
}

const rows = [
  { id: 'p1', label: 'Phase 1' },
  { id: 'a', parentId: 'p1', label: 'Alpha' },
  { id: 'b', parentId: 'p1', label: 'Beta' },
  { id: 'p2', label: 'Phase 2' },
  { id: 'c', parentId: 'p2', label: 'Gamma' },
  { id: 'd', parentId: 'p2', label: 'Delta' },
]

test('a timeline with 200,000 bars saves, parses and restores', () => {
  // More bars than a function call takes as arguments: the lane count must not be computed by spreading them.
  const rows = Array.from({ length: 1000 }, (_, i) => ({ id: 'r' + i, label: 'Row ' + i }))
  const bars = Array.from({ length: 200_000 }, (_, i) => ({
    id: 'b' + i, rowId: 'r' + (i % 1000), label: 'Bar ' + i, start: i, end: i + 2, ...(i % 3 ? { lane: i % 3 } : {}),
  }))
  const text = serializeWeaveSnapshot({ kind: 'timeline', data: { rows, bars, range: { start: 0, end: 200_002 } } })
  const restored = restore(parse(text))
  assert.equal(restored.bars.length, 200_000)
  assert.deepEqual(restored.bars[199_999], bars[199_999])
  assert.equal(restored.bars[3].lane, undefined)
  assert.equal(restored.rows.length, 1000)
})

test('projectTimelineView derives the lane count of 200,000 bars without spreading them into one call', () => {
  const many = Array.from({ length: 200_000 }, (_, i) => ({ id: 'x' + i, rowId: 'a', label: 'X', start: i, end: i + 1, lane: i % 4 }))
  const result = projectTimelineView({ rows, bars: many }, createTimelineViewState())
  assert.equal(result.bars.length, 200_000)
  // The bars use lanes 0 to 3, so an explicit count of 3 lanes rejects them.
  assert.throws(() => projectTimelineView({ rows, bars: many, laneCount: 3 }, createTimelineViewState()), /lane/i)
})
