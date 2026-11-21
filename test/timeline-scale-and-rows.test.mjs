import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  createTimelineRowTree, summarizeTimelineRows, createTimeScale, dependencyTimes, editTimeRange, timeTicks, validateTimelineData, visibleRows,
} from '@eightkk/vue-weave/core'

test('scale round-trip and stable tick anchoring', () => {
  const scale = createTimeScale({ start: 100, end: 1000 }, 3)
  assert.equal(scale.toTime(scale.toX(543)), 543)
  assert.deepEqual(timeTicks({ start: 341, end: 761 }, 200, 100), [500, 700])
  assert.throws(() => timeTicks({ start: 0, end: 1e9 }, 1), /Too many/)
  assert.throws(() => createTimeScale({ start: 2, end: 1 }, 1), RangeError)
})

test('edits preserve duration, snap symmetrically and enforce bounds', () => {
  const range = { start: 30, end: 60 }, bounds = { start: 0, end: 90 }
  assert.deepEqual(editTimeRange(range, 'move', 99, 15, bounds), { start: 60, end: 90 })
  assert.deepEqual(editTimeRange(range, 'move', -7.5, 15, bounds), { start: 15, end: 45 })
  assert.deepEqual(editTimeRange(range, 'start', 99, 15, bounds), { start: 45, end: 60 })
  assert.deepEqual(editTimeRange(range, 'end', -99, 15, bounds), { start: 30, end: 45 })
  assert.deepEqual(editTimeRange({ start: 30, end: 30 }, 'move', 15, 15, bounds), { start: 45, end: 45 })
  assert.throws(() => editTimeRange(range, 'move', 1, 0, bounds), RangeError)
  assert.throws(() => editTimeRange({ start: -1, end: 5 }, 'move', 1, 1, bounds), /editBounds/)
})

test('all four dependency types map endpoints explicitly', () => {
  const a = { start: 1, end: 4 }, b = { start: 8, end: 10 }
  assert.deepEqual(['FS', 'SS', 'FF', 'SF'].map(t => dependencyTimes(a, b, t)),
    [{ from: 4, to: 8 }, { from: 1, to: 8 }, { from: 4, to: 10 }, { from: 1, to: 10 }])
})

test('virtual row windows are clamped for empty, oversized and negative viewports', () => {
  assert.deepEqual(visibleRows(220, 130, 50, 20, 1), { first: 3, afterLast: 8 })
  assert.deepEqual(visibleRows(-10, 130, 50, 1), { first: 0, afterLast: 1 })
  assert.deepEqual(visibleRows(0, 100, 50, 0), { first: 0, afterLast: 0 })
})

test('timeline schema rejects ambiguous identifiers, lanes and dependencies', () => {
  const rows = [{ id: 'row', label: 'Row' }]
  const bars = [{ id: 'a', label: 'A', rowId: 'row', start: 1, end: 2 }]
  assert.doesNotThrow(() => validateTimelineData(rows, bars))
  assert.throws(() => validateTimelineData(rows, [...bars, ...bars]), { name: 'Error', message: 'Duplicate bar ID: a' })
  assert.throws(() => validateTimelineData(rows, [{ ...bars[0], lane: 2 }]), /lane/)
  assert.throws(() => validateTimelineData(rows, bars, [{ id: 'e', from: 'a', to: 'missing' }]), /endpoint/)
  assert.throws(() => validateTimelineData(rows, [{ ...bars[0], progress: 2 }]), /Progress/)
})

test('row hierarchy validates references and provides stable subtree bounds', () => {
  const rows = [
    { id: 'b', parentId: 'a', label: 'B' }, { id: 'a', label: 'A' },
    { id: 'c', parentId: 'b', label: 'C' }, { id: 'd', label: 'D' },
  ]
  assert.deepEqual(createTimelineRowTree(rows).map(({ row, depth, afterSubtree }) => [row.id, depth, afterSubtree]),
    [['a', 0, 3], ['b', 1, 3], ['c', 2, 3], ['d', 0, 4]])
  assert.throws(() => createTimelineRowTree([{ id: 'a', parentId: 'b' }]), /Unknown parent/)
  assert.throws(() => createTimelineRowTree([{ id: 'a', parentId: 'b' }, { id: 'b', parentId: 'a' }]), /cycle/)
})

test('summary aggregation follows descendants and avoids counting parent bars', () => {
  const tree = createTimelineRowTree([
    { id: 'root' }, { id: 'group', parentId: 'root' }, { id: 'a', parentId: 'group' }, { id: 'b', parentId: 'root' },
  ])
  const summary = summarizeTimelineRows(tree, [
    { rowId: 'a', start: 10, end: 30, progress: 0.5 },
    { rowId: 'b', start: 40, end: 50, progress: 1 },
    { rowId: 'b', start: 50, end: 90 },
    { rowId: 'group', start: 0, end: 999, progress: 1 },
  ])
  assert.deepEqual(summary.get('group'), { start: 10, end: 30, count: 1, progress: 0.5 })
  assert.deepEqual(summary.get('root'), { start: 10, end: 90, count: 3, progress: 2 / 3 })
})
