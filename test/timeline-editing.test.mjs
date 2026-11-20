import assert from 'node:assert/strict'
import { test } from 'node:test'
import { dependencyEndsForType, dependencyTimes, dependencyTypeForEnds, intersectsWindow, moveTimeRanges } from 'vue-weave/core'

test('dependency types derive from joined bar ends and round-trip', () => {
  assert.equal(dependencyTypeForEnds('finish', 'start'), 'FS')
  assert.equal(dependencyTypeForEnds('start', 'start'), 'SS')
  assert.equal(dependencyTypeForEnds('finish', 'finish'), 'FF')
  assert.equal(dependencyTypeForEnds('start', 'finish'), 'SF')
  for (const type of ['FS', 'SS', 'FF', 'SF']) {
    const ends = dependencyEndsForType(type)
    assert.equal(dependencyTypeForEnds(ends.from, ends.to), type)
    // The ends agree with the endpoints used for drawing.
    const times = dependencyTimes({ start: 0, end: 10 }, { start: 20, end: 30 }, type)
    assert.equal(times.from, ends.from === 'start' ? 0 : 10)
    assert.equal(times.to, ends.to === 'start' ? 20 : 30)
  }
  assert.deepEqual(dependencyEndsForType(), { from: 'finish', to: 'start' })
  assert.throws(() => dependencyTypeForEnds('middle', 'start'), RangeError)
  assert.throws(() => dependencyEndsForType('XX'), /Invalid dependency type/)
})

test('group moves snap once and clamp to keep relative offsets inside bounds', () => {
  const bounds = { start: 0, end: 100 }
  const ranges = [{ start: 10, end: 30 }, { start: 50, end: 80 }, { start: 60, end: 60 }]
  const frozen = Object.freeze(ranges.map(range => Object.freeze({ ...range })))
  assert.deepEqual(moveTimeRanges(frozen, 12, 5, bounds), [{ start: 20, end: 40 }, { start: 60, end: 90 }, { start: 70, end: 70 }])
  // The last interval reaches the end first, so the whole group stops there.
  assert.deepEqual(moveTimeRanges(ranges, 50, 5, bounds), [{ start: 30, end: 50 }, { start: 70, end: 100 }, { start: 80, end: 80 }])
  assert.deepEqual(moveTimeRanges(ranges, -50, 5, bounds), [{ start: 0, end: 20 }, { start: 40, end: 70 }, { start: 50, end: 50 }])
  assert.deepEqual(moveTimeRanges(ranges, 2, 5, bounds), ranges)
  assert.deepEqual(moveTimeRanges([], 10, 5, bounds), [])
  assert.throws(() => moveTimeRanges([{ start: -1, end: 5 }], 5, 5, bounds), /editBounds/)
  assert.throws(() => moveTimeRanges(ranges, Number.NaN, 5, bounds), RangeError)
  assert.throws(() => moveTimeRanges(ranges, 5, 0, bounds), RangeError)
  assert.throws(() => moveTimeRanges([{ start: 5, end: 1 }], 5, 5, bounds), RangeError)
})

test('intersectsWindow keeps intervals half-open and counts milestones at either window edge', () => {
  const window = { start: 10, end: 20 }
  assert.equal(intersectsWindow({ start: 10, end: 10 }, window), true, 'milestone at the window start')
  assert.equal(intersectsWindow({ start: 20, end: 20 }, window), true, 'milestone at the window end')
  assert.equal(intersectsWindow({ start: 15, end: 15 }, window), true)
  assert.equal(intersectsWindow({ start: 9, end: 9 }, window), false)
  assert.equal(intersectsWindow({ start: 21, end: 21 }, window), false)
  assert.equal(intersectsWindow({ start: 5, end: 10 }, window), false, 'a bar ending at the window start')
  assert.equal(intersectsWindow({ start: 20, end: 25 }, window), false, 'a bar starting at the window end')
  assert.equal(intersectsWindow({ start: 5, end: 11 }, window), true)
  assert.equal(intersectsWindow({ start: 19, end: 25 }, window), true)
  assert.equal(intersectsWindow({ start: 0, end: 30 }, window), true)
  assert.equal(intersectsWindow({ start: 12, end: 18 }, window), true)
  // A point window still contains a milestone at the same time.
  assert.equal(intersectsWindow({ start: 10, end: 10 }, { start: 10, end: 10 }), true)
})
