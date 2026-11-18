// Internal helpers shared by the interchange formats (`interchangeMsProject.ts`, `interchangeICalendar.ts`): input
// checks and date-time arithmetic in epoch milliseconds. Not exported from index.ts.
import { maxUtcOffsetMinutes } from './workCalendar.js'

export const minuteMs = 60_000
export const secondMs = 1000

export function checkTime(value: number, what: string) {
  if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > 8.64e15) throw new RangeError(what + ' must be a finite time')
}

export function checkText(value: unknown, what: string) {
  if (value === undefined || value === null) throw new Error(what + ' is missing')
}

export function checkOffset(value: number | undefined) {
  const offset = value ?? 0
  if (!Number.isInteger(offset) || Math.abs(offset) > maxUtcOffsetMinutes) {
    throw new RangeError(`utcOffsetMinutes must be an integer between -${maxUtcOffsetMinutes} and ${maxUtcOffsetMinutes}`)
  }
  return offset
}

/** Round a time to the nearest whole second (halves up), the resolution of MSPDI and iCalendar date-times. */
export function toSecond(time: number) {
  return Math.round(time / secondMs) * secondMs
}

/** The `toISOString` text of a time, which must fall in the years 0 to 9999. */
export function isoText(time: number) {
  const iso = new Date(time).toISOString()
  if (!/^\d{4}-/.test(iso)) throw new RangeError('Dates must be between the years 0 and 9999')
  return iso
}

/** Milliseconds of a duration in weeks, days (of 24 hours), hours, minutes and seconds. */
export function durationMs(weeks: number, days: number, hours: number, minutes: number, seconds: number) {
  return (((weeks * 7 + days) * 24 + hours) * 60 + minutes) * minuteMs + seconds * secondMs
}

/** The wall-clock time (as UTC epoch milliseconds) of date and time fields, or undefined for an impossible date. */
export function wallTime(y: number, mo: number, d: number, h: number, mi: number, s: number) {
  if (mo < 1 || mo > 12 || d < 1 || h > 23 || mi > 59 || s > 59) return undefined
  const date = new Date(0)
  date.setUTCFullYear(y, mo - 1, d)
  if (date.getUTCDate() !== d) return undefined
  date.setUTCHours(h, mi, s, 0)
  return date.getTime()
}
