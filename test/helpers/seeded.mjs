// Helpers for seeded, reproducible test corpora. `npm test` runs test/*.test.mjs only, so this directory holds no tests.
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
