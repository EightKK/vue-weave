// Internal helpers shared by the interchange formats (`interchangeMsProject.ts`, `interchangeICalendar.ts`,
// `interchangeGraph.ts`) and `recurrence.ts`: input checks, import warnings and date-time arithmetic in epoch
// milliseconds. Not exported from index.ts.
import { maxUtcOffsetMinutes } from './workCalendar.js'

export const dayMs = 86_400_000
export const minuteMs = 60_000
export const secondMs = 1000

/** Text without a leading byte order mark. */
export function stripBom(text: string) {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
}

/** A number of at most two digits with a leading zero, such as `09`. */
export function pad2(value: number) {
  return String(value).padStart(2, '0')
}

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

/**
 * Append `{ code, ...about, message }` to `warnings`, leaving out the fields of `about` that are undefined. The import
 * warnings of the MS Project, iCalendar and graph readers have this shape.
 */
export function pushWarning<W extends { code: string; message: string }>(
  warnings: W[], code: W['code'], message: string, about?: { readonly [K in Exclude<keyof W, 'code' | 'message'>]?: W[K] | undefined },
) {
  const warning: Record<string, unknown> = { code }
  for (const [key, value] of Object.entries(about ?? {})) if (value !== undefined) warning[key] = value
  warning.message = message
  warnings.push(warning as W)
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

/** A wall time in iCalendar basic format without zone, such as 20261109T080000 (years 0 to 9999). */
export function basicWall(wall: number) {
  return isoText(wall).slice(0, 19).replace(/[-:]/g, '')
}

/** RFC 5545 weekday codes, indexed like `Date#getUTCDay` (0 = Sunday). */
export const weekdayCodes = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'] as const

/** The number of days of a month (`monthIndex` 0 to 11, or beyond, which rolls over into later years). */
export function monthLength(year: number, monthIndex: number) {
  const date = new Date(0)
  date.setUTCFullYear(year, monthIndex + 1, 0)
  return date.getUTCDate()
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
