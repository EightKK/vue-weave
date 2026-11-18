// Locale-aware time formatting and ready-made calendar zoom presets for GanttChart, in epoch milliseconds.
// `Intl` exists in Node, workers and browsers, so this module stays free of DOM and browser globals.
import { calendarBands, type TimeRange } from './timeline.js'
import { cachedDateFormat, zoneFormat, zoneOffset } from './timeZone.js'
import type { CalendarBandOptions, CalendarBandUnit, TimelineBand, TimelineZoomPreset } from './types.js'
import { maxUtcOffsetMinutes } from './workCalendar.js'

const minute = 60_000
const hour = 3_600_000
const day = 86_400_000

export interface IntlTimeFormatterOptions {
  /**
   * BCP 47 locale (or list). Default `en-US`. The runtime's default locale is never used, so server and client render
   * the same text for the same locale, time zone and options.
   */
  locale?: string | readonly string[]
  /** IANA time zone such as `Europe/Berlin`. Default `UTC`. Cannot be combined with `utcOffsetMinutes`. */
  timeZone?: string
  /**
   * Fixed offset from UTC in minutes, without daylight-saving rules. Cannot be combined with `timeZone`. A
   * `timeZoneName` in `format` then reads as UTC, because the shifted time is formatted in UTC.
   */
  utcOffsetMinutes?: number
  /**
   * `Intl.DateTimeFormat` options. Default `{ hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }` (`09:00`). Its
   * `timeZone` is ignored; use the `timeZone` option.
   */
  format?: Intl.DateTimeFormatOptions
}

const defaultTimeFormat: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }

function checkZoneOptions(timeZone: string | undefined, utcOffsetMinutes: number | undefined) {
  if (timeZone !== undefined && utcOffsetMinutes !== undefined) {
    throw new RangeError('Specify either timeZone or utcOffsetMinutes, not both')
  }
  if (utcOffsetMinutes !== undefined && (!Number.isInteger(utcOffsetMinutes) || Math.abs(utcOffsetMinutes) > maxUtcOffsetMinutes)) {
    throw new RangeError(`utcOffsetMinutes must be an integer between -${maxUtcOffsetMinutes} and ${maxUtcOffsetMinutes}`)
  }
  // Validates the zone with a descriptive RangeError.
  return timeZone === undefined ? undefined : zoneFormat(timeZone)
}

function checkTime(time: number) {
  if (typeof time !== 'number' || !Number.isFinite(time)) throw new RangeError('time must be finite')
}

/**
 * A `formatTime`-compatible function based on a cached `Intl.DateTimeFormat`. The output depends only on the time and
 * the options (and the runtime's Intl data), never on the runtime's default locale or time zone, so it is safe for
 * server rendering. Throws RangeError for an invalid time zone, offset, locale or non-finite time.
 */
export function intlTimeFormatter(options: IntlTimeFormatterOptions = {}): (time: number) => string {
  const { locale = 'en-US', timeZone, utcOffsetMinutes, format = defaultTimeFormat } = options
  checkZoneOptions(timeZone, utcOffsetMinutes)
  const formatter = cachedDateFormat(locale, { ...format, timeZone: utcOffsetMinutes === undefined ? timeZone ?? 'UTC' : 'UTC' })
  const shift = (utcOffsetMinutes ?? 0) * minute
  return time => {
    checkTime(time)
    return formatter.format(time + shift)
  }
}

/** A zoom level of `calendarZoomPresets`, from finest to coarsest. */
export type CalendarZoomLevel = 'hours' | 'days' | 'weeks' | 'months' | 'quarters' | 'years'

export interface CalendarZoomPresetOptions {
  /** Locale of the band and tick labels. Default `en-US` (never the runtime's default locale). */
  locale?: string | readonly string[]
  /** IANA time zone of the calendar. Default UTC. Cannot be combined with `utcOffsetMinutes`. */
  timeZone?: string
  /** Fixed offset from UTC in minutes. Cannot be combined with `timeZone`. */
  utcOffsetMinutes?: number
  /** First day of a week band, 0 = Sunday to 6 = Saturday. Default 1 (Monday). */
  weekStartsOn?: number
  /** Levels to return, in this order, without duplicates. Default all six, finest first. */
  levels?: readonly CalendarZoomLevel[]
  /** Preset button labels by level. Defaults: Hours, Days, Weeks, Months, Quarters, Years. */
  labels?: Partial<Record<CalendarZoomLevel, string>>
}

/** A `TimelineZoomPreset` for one calendar level, with every optional field filled and a matching tick formatter. */
export interface CalendarZoomPreset extends TimelineZoomPreset {
  /** The level, also used as the preset `id`. */
  id: CalendarZoomLevel
  tickSteps: readonly number[]
  headerBands: readonly (readonly TimelineBand[])[]
  snap: number
  /**
   * Locale-aware labels for this level, for the chart's `formatTime` while the preset is active (GanttChart does not
   * read it from the preset): `HH:mm` for hours; a date for the other levels, followed by the time when it is not
   * local midnight.
   */
  formatTime: (time: number) => string
}

interface BandSpec {
  unit: CalendarBandUnit
  step?: number
  format?: Intl.DateTimeFormatOptions
  quarter?: boolean
}

interface LevelSpec {
  pixelsPerUnit: number
  tickSteps: readonly number[]
  snap: number
  bands: readonly BandSpec[]
  /** Date part of the tick labels; undefined for time-of-day labels. */
  date?: Intl.DateTimeFormatOptions
}

const monthLong: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'long' }
const shortDate: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }
// Pixel densities are chosen so the first tick step that is at least 76 px wide (GanttChart's rule) is a natural one.
const levelSpecs: Readonly<Record<CalendarZoomLevel, LevelSpec>> = {
  hours: {
    pixelsPerUnit: 60 / hour, tickSteps: [15 * minute, 30 * minute, hour, 2 * hour, 3 * hour, 6 * hour, 12 * hour], snap: 15 * minute,
    bands: [{ unit: 'day', format: { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' } }],
  },
  days: {
    pixelsPerUnit: 80 / day, tickSteps: [day, 2 * day, 7 * day], snap: hour,
    bands: [{ unit: 'month', format: monthLong }], date: { weekday: 'short', month: 'short', day: 'numeric' },
  },
  weeks: {
    pixelsPerUnit: 16 / day, tickSteps: [7 * day, 14 * day, 28 * day], snap: day,
    bands: [{ unit: 'month', format: monthLong }, { unit: 'week', format: shortDate }], date: shortDate,
  },
  months: {
    pixelsPerUnit: 4 / day, tickSteps: [7 * day, 14 * day, 28 * day, 56 * day], snap: day,
    bands: [{ unit: 'year', format: { year: 'numeric' } }, { unit: 'month', format: { month: 'short' } }], date: shortDate,
  },
  quarters: {
    pixelsPerUnit: 1.5 / day, tickSteps: [28 * day, 56 * day, 91 * day], snap: day,
    bands: [{ unit: 'year', format: { year: 'numeric' } }, { unit: 'month', step: 3, quarter: true }], date: shortDate,
  },
  years: {
    pixelsPerUnit: 0.4 / day, tickSteps: [91 * day, 182 * day, 364 * day], snap: day,
    bands: [{ unit: 'year', format: { year: 'numeric' } }], date: { year: 'numeric', month: 'short', day: 'numeric' },
  },
}
const allLevels: readonly CalendarZoomLevel[] = ['hours', 'days', 'weeks', 'months', 'quarters', 'years']
const defaultLevelLabels: Readonly<Record<CalendarZoomLevel, string>> = {
  hours: 'Hours', days: 'Days', weeks: 'Weeks', months: 'Months', quarters: 'Quarters', years: 'Years',
}

/**
 * Ready-made `zoomPresets` for common calendar views of `range` in epoch milliseconds: hours, days, weeks, months,
 * quarters and years. Each preset has a pixel density, tick steps, snap and header bands from `calendarBands`, whose
 * boundaries follow local dates in `timeZone` (so a month band across a daylight-saving change starts at local
 * midnight). Ticks stay uniform elapsed-time steps from `range.start`, as GanttChart draws them; start the range on a
 * band boundary to align them. Labels use `locale` (default `en-US`); quarter bands read `Q1` to `Q4`.
 */
export function calendarZoomPresets(range: TimeRange, options: CalendarZoomPresetOptions = {}): CalendarZoomPreset[] {
  const { locale = 'en-US', timeZone, utcOffsetMinutes, weekStartsOn = 1, levels = allLevels, labels = {} } = options
  const zone = checkZoneOptions(timeZone, utcOffsetMinutes)
  const seen = new Set<string>()
  for (const level of levels) {
    if (!Object.hasOwn(levelSpecs, level)) throw new RangeError('Unknown calendar zoom level: ' + String(level))
    if (seen.has(level)) throw new Error('Duplicate calendar zoom level: ' + level)
    seen.add(level)
  }
  const bandZone: CalendarBandOptions = timeZone !== undefined ? { timeZone } : { utcOffsetMinutes: utcOffsetMinutes ?? 0 }
  const offset = (utcOffsetMinutes ?? 0) * minute
  // Local wall time of an instant, expressed as if it were UTC, so it can be formatted in UTC.
  const wallOf = (time: number) => time + (zone ? zoneOffset(zone, time) : offset)
  const timeFormat = cachedDateFormat(locale, { ...defaultTimeFormat, timeZone: 'UTC' })
  return levels.map(level => {
    const spec = levelSpecs[level]
    const dateFormat = spec.date && cachedDateFormat(locale, { ...spec.date, timeZone: 'UTC' })
    const formatTime = (time: number) => {
      checkTime(time)
      const wall = wallOf(time)
      if (!dateFormat) return timeFormat.format(wall)
      const date = dateFormat.format(wall)
      return ((wall % day) + day) % day === 0 ? date : date + ' ' + timeFormat.format(wall)
    }
    const headerBands = spec.bands.map(band => calendarBands(range, band.unit, {
      ...bandZone, weekStartsOn, step: band.step, locale,
      ...(band.quarter
        ? { label: (_start: number, _end: number, local: { month: number }) => 'Q' + Math.ceil(local.month / 3) }
        : { labelFormat: band.format }),
    }))
    return {
      id: level, label: labels[level] ?? defaultLevelLabels[level], pixelsPerUnit: spec.pixelsPerUnit,
      tickSteps: spec.tickSteps, headerBands, snap: spec.snap, formatTime,
    }
  })
}
