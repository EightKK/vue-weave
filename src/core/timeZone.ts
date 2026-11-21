// Internal IANA time-zone and Intl formatting helpers shared by `buildWorkPeriods`, `calendarBands` and the calendar
// formatters (`calendarFormat.ts`). Not exported from index.ts.
//
// A "wall" time is a local wall-clock time expressed as if it were UTC: epoch milliseconds whose UTC fields are the
// local date and time. Offsets are local wall-clock time minus UTC, in milliseconds.

const dayMs = 86_400_000

const zoneFormats = new Map<string, Intl.DateTimeFormat>()

/** A cached formatter for a zone. Throws a RangeError naming the zone when it is not a valid IANA time zone. */
export function zoneFormat(timeZone: string) {
  let format = zoneFormats.get(timeZone)
  if (!format) {
    if (typeof timeZone !== 'string' || !timeZone) throw new RangeError('Invalid time zone: ' + timeZone)
    try {
      format = new Intl.DateTimeFormat('en-US', {
        timeZone, hourCycle: 'h23', era: 'short', year: 'numeric', month: 'numeric', day: 'numeric',
        hour: 'numeric', minute: 'numeric', second: 'numeric',
      })
    } catch {
      throw new RangeError('Invalid time zone: ' + timeZone)
    }
    zoneFormats.set(timeZone, format)
  }
  return format
}

const dateFormats = new Map<string, Intl.DateTimeFormat>()

/**
 * A cached `Intl.DateTimeFormat` for a locale and options, so label formatting does not build a formatter per call.
 * Invalid locales or options throw the RangeError (or TypeError) of `Intl.DateTimeFormat`.
 */
export function cachedDateFormat(locale: string | readonly string[], options: Intl.DateTimeFormatOptions) {
  const key = JSON.stringify([locale, options])
  let format = dateFormats.get(key)
  if (!format) {
    format = new Intl.DateTimeFormat(locale as string | string[], options)
    // A bounded cache: label formats come from a few presets, but callers can pass arbitrary options.
    if (dateFormats.size >= 256) dateFormats.clear()
    dateFormats.set(key, format)
  }
  return format
}

/** Local wall-clock time minus UTC at an instant, in milliseconds (second resolution). */
export function zoneOffset(format: Intl.DateTimeFormat, instant: number) {
  const fields: Record<string, string> = {}
  for (const part of format.formatToParts(instant)) fields[part.type] = part.value
  const year = fields.era === 'BC' ? 1 - Number(fields.year) : Number(fields.year)
  const wall = new Date(0)
  wall.setUTCFullYear(year, Number(fields.month) - 1, Number(fields.day))
  wall.setUTCHours(Number(fields.hour), Number(fields.minute), Number(fields.second), 0)
  return wall.getTime() - (instant - (((instant % 1000) + 1000) % 1000))
}

/**
 * The first whole-second instant after `low` whose offset differs from `offsetAtLow`, given that the offset at `high`
 * differs from it and the offset changes once in between.
 */
export function zoneTransition(format: Intl.DateTimeFormat, low: number, high: number, offsetAtLow: number) {
  let lowSecond = Math.floor(low / 1000), highSecond = Math.ceil(high / 1000)
  while (highSecond - lowSecond > 1) {
    const middle = lowSecond + Math.floor((highSecond - lowSecond) / 2)
    if (zoneOffset(format, middle * 1000) === offsetAtLow) lowSecond = middle
    else highSecond = middle
  }
  return highSecond * 1000
}

/**
 * Resolve a local wall-clock time (expressed as if it were UTC) to an instant.
 * A wall time skipped by a forward transition resolves to the transition instant.
 * A repeated wall time resolves to its earlier occurrence.
 */
export function zonedInstant(format: Intl.DateTimeFormat, wall: number) {
  const before = zoneOffset(format, wall - dayMs), after = zoneOffset(format, wall + dayMs)
  // Zone rules change at most once within two days.
  if (before === after) return wall - before
  // At most two candidates: one per offset.
  const candidates = [...new Set([before, after])].map(offset => wall - offset)
    .filter(instant => wall - zoneOffset(format, instant) === instant)
  if (candidates.length) return Math.min(...candidates)
  // Gap: the offset changes from `before` to `after` between these two instants.
  return zoneTransition(format, wall - after, wall - before, before)
}

/**
 * Resolve a local wall-clock time (expressed as if it were UTC) to an instant by the rules of RFC 5545 section 3.3.5,
 * for iCalendar import only: a wall time skipped by a forward transition is read with the offset before the
 * transition (so `02:30` in a gap from `02:00` to `03:00` is the instant of `03:30` after it), and a repeated wall time
 * resolves to its first occurrence. Work calendars and editing keep `zonedInstant`, which moves a skipped time to the
 * transition instead.
 */
export function rfc5545ZonedInstant(format: Intl.DateTimeFormat, wall: number) {
  const before = zoneOffset(format, wall - dayMs), after = zoneOffset(format, wall + dayMs)
  if (before === after) return wall - before
  const first = wall - Math.max(before, after), second = wall - Math.min(before, after)
  if (wall - zoneOffset(format, first) === first) return first
  if (wall - zoneOffset(format, second) === second) return second
  // Gap: use the offset in effect before the transition.
  return wall - before
}
