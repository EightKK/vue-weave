// Helpers for seeded, reproducible test corpora. `npm test` runs test/*.test.mjs only, so this directory holds no tests.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'

/**
 * A linear congruential generator. The pinned regression digests depend on its exact sequence: `random()` returns
 * values in [0, 1) and `pick(n)` an integer in [0, n). Do not change the arithmetic.
 */
export function seededRandom(seed) {
  let state = seed
  const random = () => (state = (state * 1103515245 + 12345) % 2147483648) / 2147483648
  return { random, pick: n => Math.floor(random() * n) }
}

/** The SHA-256 hex digest of a value's JSON text. */
export const sha256Json = value => createHash('sha256').update(JSON.stringify(value)).digest('hex')

/** Calls `fn` and returns its result, or `{ error }` with the text `describe` makes of a thrown error. */
export function attempt(fn, describe = error => error.message) {
  try {
    return fn()
  } catch (error) {
    return { error: describe(error) }
  }
}

/** A schedule or leveling result whose trace keeps only its reason list and task reason IDs as an array, for JSON. */
export function withPlainTrace(result) {
  if (!result || !result.trace) return result
  return { ...result, trace: { reasons: result.trace.reasons, taskReasonIds: [...result.trace.taskReasonIds] } }
}

/**
 * Checks what every successful schedule of a corpus plan must satisfy, whatever its digest is: tasks are unique, every
 * one has `start <= end` inside `range`, and `finish` is not before any task end. Failures and non-results are skipped.
 */
export function assertScheduleInvariants(range, result, label) {
  if (!result || result.ok !== true) return
  const seen = new Set()
  for (const item of result.tasks) {
    assert.ok(!seen.has(item.id), 'duplicate task ' + item.id + ' in plan ' + label)
    seen.add(item.id)
    assert.ok(item.start <= item.end, 'task ' + item.id + ' ends before it starts in plan ' + label)
    assert.ok(item.start >= range.start && item.end <= range.end, 'task ' + item.id + ' leaves the range in plan ' + label)
    assert.ok(result.finish >= item.end, 'finish is before the end of ' + item.id + ' in plan ' + label)
  }
}

/** Checks a leveling result like a schedule, and that it reports an overload only when some task is unresolved. */
export function assertLevelingInvariants(range, result, label) {
  assertScheduleInvariants(range, result, label)
  if (!result || result.ok !== true) return
  if (result.unresolvedTaskIds.length === 0) assert.deepEqual(result.overloads, [], 'overload without an unresolved task in plan ' + label)
  for (const delay of result.delays) assert.ok(delay.after.start >= delay.before.start, 'task ' + delay.taskId + ' moved earlier in plan ' + label)
}
