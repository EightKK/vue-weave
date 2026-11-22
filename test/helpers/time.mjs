// Time constants and a UTC date builder shared by the core tests, in epoch milliseconds. `npm test` runs
// test/*.test.mjs only, so this directory holds no tests.

/** One hour in milliseconds. */
export const hour = 3_600_000

/** One day (24 hours) in milliseconds. */
export const day = 24 * hour

/** Epoch milliseconds of a UTC date and time; `month` counts from 1, unlike `Date.UTC`. */
export const utc = (year, month, date = 1, hours = 0, minutes = 0) => Date.UTC(year, month - 1, date, hours, minutes)
