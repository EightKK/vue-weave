// A tiny deterministic pseudo-random generator for the property tests. `npm test` runs test/*.test.mjs only, so this
// directory holds no tests.

/**
 * mulberry32: a 32-bit generator with a full period of 2^32. The same seed always gives the same sequence, so a
 * failing case is reproduced by its seed alone.
 */
export function createPrng(seed) {
  let state = seed >>> 0
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  /** An integer in [lo, hi], both inclusive. */
  const int = (lo, hi) => lo + Math.floor(next() * (hi - lo + 1))
  /** True with probability `p`. */
  const chance = p => next() < p
  /** One element of a non-empty array. */
  const pick = list => list[Math.floor(next() * list.length)]
  /** A shuffled copy of an array (Fisher-Yates). */
  const shuffle = list => {
    const copy = [...list]
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(next() * (i + 1))
      ;[copy[i], copy[j]] = [copy[j], copy[i]]
    }
    return copy
  }
  return { next, int, chance, pick, shuffle }
}
