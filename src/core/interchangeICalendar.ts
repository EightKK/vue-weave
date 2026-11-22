// iCalendar (RFC 5545): `toICalendar`, `fromICalendar` and `timelineFromICalendar`. Pure string builders and readers
// without a DOM. Re-exported by `interchange.ts`.
import { checkOffset, checkText, checkTime, durationMs, isoText, minuteMs, toSecond, wallTime } from './interchangeShared.js'
import { rfc5545ZonedInstant, zoneFormat, zoneOffset, zoneTransition } from './timeZone.js'
import type { TimelineBar, TimelineRow } from './types.js'
import { checkId } from './ids.js'
import { expandRecurrence, formatRecurrenceRule, parseRecurrenceRule } from './recurrence.js'
import type { CalendarRecurrence, RecurrenceRule, RecurrenceZoneOptions } from './recurrence.js'
import type { TimeRange } from './timeline.js'

export interface ICalendarEvent {
  /** Unique within the calendar. Written as the event UID; make it globally unique, for example `id@example.com`. */
  id: string
  summary: string
  /** Epoch milliseconds. */
  start: number
  /** Epoch milliseconds, not before `start`. An event with `end === start` is written without DTEND. */
  end: number
  description?: string
  /**
   * Writes the event as a recurring series (RRULE, EXDATE, RDATE) whose first instance is `start`–`end`. With an IANA
   * `timeZone` other than UTC, DTSTART, DTEND, EXDATE and RDATE are written as local times with that TZID, and the
   * document gets a VTIMEZONE for it; otherwise they are written in UTC. Opt-in.
   */
  recurrence?: CalendarRecurrence
}

export interface ICalendarOptions {
  /** PRODID value. Default `-//vue-weave//Timeline export//EN`. */
  productId?: string
  /** Calendar name, written as NAME and X-WR-CALNAME. */
  calendarName?: string
  /** DTSTAMP of every event, in epoch milliseconds. Default `Date.now()`; pass it for reproducible output. */
  timestamp?: number
}

const encoder = new TextEncoder()

/** UTC date-time in iCalendar basic format, such as 20261109T080000Z, rounded to the nearest whole second. */
function icalTime(time: number) {
  checkTime(time, 'An event time')
  return isoText(toSecond(time)).slice(0, 19).replace(/[-:]/g, '') + 'Z'
}

/** Escape an iCalendar TEXT value and drop control characters other than tab and line breaks. */
function icalText(value: string) {
  return String(value)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r\n|\r|\n/g, '\\n')
}

/** Fold a content line into lines of at most 75 octets, never splitting a UTF-8 character. */
function fold(line: string) {
  const parts: string[] = []
  let current = '', size = 0
  for (const char of line) {
    const bytes = encoder.encode(char).length
    // Continuation lines start with a space, which counts towards their 75 octets.
    if (size + bytes > 75) {
      parts.push(current)
      current = ' '
      size = 1
    }
    current += char
    size += bytes
  }
  parts.push(current)
  return parts.join('\r\n')
}

const weekdayCodes = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']

/** A UTC offset in milliseconds as `+hhmm` (or `+hhmmss`). */
function offsetText(offset: number) {
  const total = Math.round(Math.abs(offset) / 1000)
  const pad = (value: number) => String(value).padStart(2, '0')
  const seconds = total % 60
  return (offset < 0 ? '-' : '+') + pad(Math.floor(total / 3600)) + pad(Math.floor((total % 3600) / 60)) + (seconds ? pad(seconds) : '')
}

/** A wall time in iCalendar basic format without zone, such as 20261109T080000. */
function basicWall(wall: number) {
  return isoText(wall).slice(0, 19).replace(/[-:]/g, '')
}

/** The local time of an instant in a zone, in basic format, rounded to the nearest whole second. */
function zonedText(format: Intl.DateTimeFormat, time: number) {
  checkTime(time, 'An event time')
  const second = toSecond(time)
  return basicWall(second + zoneOffset(format, second))
}

/**
 * A VTIMEZONE for an IANA zone, derived from `Intl` for one year: one STANDARD or DAYLIGHT observance per offset change
 * of that year, with a yearly RRULE when the change falls on the same weekday rule the next year, or one fixed
 * STANDARD observance for a zone without changes.
 */
function timeZoneLines(timeZone: string, year: number) {
  const format = zoneFormat(timeZone)
  const yearStart = wallTime(year, 1, 1, 0, 0, 0)!, yearEnd = wallTime(year + 1, 1, 1, 0, 0, 0)!
  let previous = zoneOffset(format, yearStart)
  const changes: { at: number; from: number; to: number }[] = []
  for (let time = yearStart + 86_400_000; time <= yearEnd; time += 86_400_000) {
    const offset = zoneOffset(format, time)
    if (offset === previous) continue
    changes.push({ at: zoneTransition(format, time - 86_400_000, time, previous), from: previous, to: offset })
    previous = offset
  }
  const lines = ['BEGIN:VTIMEZONE', 'TZID:' + timeZone]
  if (!changes.length) {
    lines.push('BEGIN:STANDARD', 'DTSTART:19700101T000000', 'TZOFFSETFROM:' + offsetText(previous), 'TZOFFSETTO:' + offsetText(previous), 'END:STANDARD')
  }
  for (const change of changes) {
    const kind = change.to > change.from ? 'DAYLIGHT' : 'STANDARD'
    const wall = change.at + change.from
    lines.push('BEGIN:' + kind, 'DTSTART:' + basicWall(wall), 'TZOFFSETFROM:' + offsetText(change.from), 'TZOFFSETTO:' + offsetText(change.to))
    const date = new Date(wall)
    const month = date.getUTCMonth(), day = date.getUTCDate(), weekday = date.getUTCDay()
    const ordinal = day + 7 > daysIn(year, month) ? -1 : Math.ceil(day / 7)
    // The same rule in the next year: the nth (or last) such weekday of the month at the same local time.
    const nextDay = nthWeekday(year + 1, month, weekday, ordinal)
    const next = nextDay + (wall - Math.floor(wall / 86_400_000) * 86_400_000) - change.from
    if (zoneOffset(format, next - 1000) === change.from && zoneOffset(format, next) === change.to) {
      lines.push(`RRULE:FREQ=YEARLY;BYMONTH=${month + 1};BYDAY=${ordinal}${weekdayCodes[weekday]}`)
    }
    lines.push('END:' + kind)
  }
  lines.push('END:VTIMEZONE')
  return lines
}

function daysIn(year: number, month: number) {
  const date = new Date(0)
  date.setUTCFullYear(year, month + 1, 0)
  return date.getUTCDate()
}

/** The wall midnight of the nth (or, for -1, the last) weekday of a month. */
function nthWeekday(year: number, month: number, weekday: number, ordinal: number) {
  const first = wallTime(year, month + 1, 1, 0, 0, 0)!
  if (ordinal > 0) return first + (((weekday - new Date(first).getUTCDay() + 7) % 7) + (ordinal - 1) * 7) * 86_400_000
  const last = first + (daysIn(year, month) - 1) * 86_400_000
  return last - ((new Date(last).getUTCDay() - weekday + 7) % 7) * 86_400_000
}

/**
 * Build an iCalendar (RFC 5545) document with one VEVENT per event: UID, DTSTAMP, DTSTART, DTEND, SUMMARY and an
 * optional DESCRIPTION. Times are written in UTC, rounded to the nearest whole second; DTEND is written only when the
 * rounded end is after the rounded start. Text is escaped, lines end with CRLF and are folded at 75 octets.
 *
 * An event with `recurrence` also gets RRULE (normalized by `formatRecurrenceRule`, UNTIL in UTC), EXDATE and RDATE.
 * When its `recurrence.timeZone` is an IANA zone other than UTC, its DTSTART, DTEND, EXDATE and RDATE are local times
 * with that TZID, so readers repeat it at the same local time across daylight-saving changes, and the document gets
 * one VTIMEZONE per zone, derived from `Intl` for the year of the zone's first event. Other recurrences are written in
 * UTC. Events without `recurrence` are written as before.
 *
 * Throws an Error for empty or duplicate IDs, a missing summary and an invalid rule, and a RangeError for non-finite or
 * unordered times and an invalid time zone.
 */
export function toICalendar(events: readonly ICalendarEvent[], options: ICalendarOptions = {}): string {
  const stamp = icalTime(options.timestamp ?? Date.now())
  const ids = new Set<string>()
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:' + icalText(options.productId ?? '-//vue-weave//Timeline export//EN'), 'CALSCALE:GREGORIAN']
  if (options.calendarName !== undefined) {
    lines.push('NAME:' + icalText(options.calendarName), 'X-WR-CALNAME:' + icalText(options.calendarName))
  }
  // The year of the first event of each recurrence zone, for its VTIMEZONE.
  const zones = new Map<string, number>()
  for (const event of events) {
    const timeZone = event?.recurrence?.timeZone
    if (timeZone === undefined || timeZone === 'UTC') continue
    zoneFormat(timeZone)
    checkTime(event.start, 'An event time')
    const year = new Date(event.start).getUTCFullYear()
    if (!zones.has(timeZone) || year < zones.get(timeZone)!) zones.set(timeZone, year)
  }
  for (const [timeZone, year] of zones) lines.push(...timeZoneLines(timeZone, year))
  for (const event of events) {
    checkId('event', event.id, ids)
    ids.add(event.id)
    const start = icalTime(event.start), end = icalTime(event.end)
    if (event.end < event.start) throw new RangeError('An event cannot end before it starts: ' + event.id)
    checkText(event.summary, 'The summary of event ' + event.id)
    const recurrence = event.recurrence
    const timeZone = recurrence?.timeZone !== undefined && recurrence.timeZone !== 'UTC' ? recurrence.timeZone : undefined
    const format = timeZone === undefined ? undefined : zoneFormat(timeZone)
    const at = (time: number) => format ? zonedText(format, time) : icalTime(time)
    const zoned = (name: string) => timeZone === undefined ? name + ':' : `${name};TZID=${timeZone}:`
    lines.push('BEGIN:VEVENT', 'UID:' + icalText(event.id), 'DTSTAMP:' + stamp, zoned('DTSTART') + at(event.start))
    // RFC 5545 requires DTEND after DTSTART; a span that rounds to nothing is written as an instant.
    if (end !== start) lines.push(zoned('DTEND') + at(event.end))
    if (recurrence) {
      const zone: RecurrenceZoneOptions = { timeZone: recurrence.timeZone, utcOffsetMinutes: recurrence.utcOffsetMinutes }
      if (recurrence.rule !== undefined) {
        const rule = typeof recurrence.rule === 'string' ? parseRecurrenceRule(recurrence.rule, zone) : recurrence.rule
        lines.push('RRULE:' + formatRecurrenceRule(rule))
      }
      for (const [name, times] of [['EXDATE', recurrence.exdates], ['RDATE', recurrence.rdates]] as const) {
        if (times === undefined) continue
        if (!Array.isArray(times)) throw new RangeError(`The ${name} times of event ${event.id} must be an array`)
        if (times.length) lines.push(zoned(name) + [...new Set(times.map(at))].join(','))
      }
    }
    lines.push('SUMMARY:' + icalText(event.summary))
    if (event.description !== undefined) lines.push('DESCRIPTION:' + icalText(event.description))
    lines.push('END:VEVENT')
  }
  lines.push('END:VCALENDAR')
  return lines.map(fold).join('\r\n') + '\r\n'
}

/** An event read by `fromICalendar`. It is an `ICalendarEvent`, so `toICalendar` and `timelineFromICalendar` accept it. */
export interface ICalendarImportEvent extends ICalendarEvent {
  /** DTSTART was a date (`VALUE=DATE`). `start` is midnight and `end` the midnight that ends the last day (exclusive). */
  allDay: boolean
  /** The RRULE of a recurring event, as written. By default only the first instance is imported. */
  recurrenceRule?: string
  /**
   * With `recurrence: 'series'`: the recurrence of a series (`rule` parsed, `exdates`, `rdates` and its zone: the
   * TZID of DTSTART, `UTC`, or `utcOffsetMinutes` for floating times and dates). Not set by default.
   */
  recurrence?: CalendarRecurrence & { rule?: RecurrenceRule }
  /** With `recurrence` other than `'first'`: the UID of the series of an occurrence or a changed instance (RECURRENCE-ID). */
  seriesId?: string
  /** With `recurrence` other than `'first'`: the original start of an occurrence or a changed instance, in epoch milliseconds. */
  recurrenceId?: number
}

/** `ICalendarImportOptions.recurrence` as an object: expand the series into the occurrences that overlap `range`. */
export interface ICalendarExpandOptions {
  range: TimeRange
  /** As in `expandRecurrence`: the most instances per series up to the end of the range. Default 10,000. */
  maxOccurrences?: number
}

export interface ICalendarImportOptions {
  /**
   * Offset from UTC in minutes for local times that have no zone: floating date-times, dates, and date-times whose
   * TZID cannot be resolved. Default 0 (UTC), integer within ±1080.
   */
  utcOffsetMinutes?: number
  /**
   * How recurring events are read. `'first'` (default): once, at the first instance, with a `recurrence` warning, and
   * changed instances (RECURRENCE-ID) are skipped. `'series'`: once, with the parsed rule, EXDATEs and RDATEs in
   * `recurrence`, and changed instances as events with `seriesId` and `recurrenceId`. `{ range }`: the occurrences that
   * overlap the range, with changed instances in place of the occurrences they change.
   */
  recurrence?: 'first' | 'series' | ICalendarExpandOptions
}

/**
 * The kind of a problem `fromICalendar` worked around. `skipped-event`: an event without a readable DTSTART, with a
 * RECURRENCE-ID (a changed instance of a recurring event), with a UID used before, or without END:VEVENT.
 * `missing-uid`: an event without a UID, which got the ID `event-<n>`. `recurrence`: RRULE, RDATE or EXDATE, of which only
 * the first instance was imported. `unknown-time-zone`: a TZID that `Intl` does not know; the time is read as local time
 * at `utcOffsetMinutes`. `invalid-value`: an unreadable DTEND or DURATION (the event is an instant), or a DTEND before
 * DTSTART (the event is an instant too). `malformed`: a line without a colon, or an END that does not match, which
 * was ignored.
 */
export type ICalendarImportWarningCode = 'skipped-event' | 'missing-uid' | 'recurrence' | 'unknown-time-zone' | 'invalid-value' | 'malformed'

export interface ICalendarImportWarning {
  code: ICalendarImportWarningCode
  /** The imported ID of the event the warning is about, when it has one. */
  eventId?: string
  /** The one-based line of the file where the property or component starts, after unfolding the first line of it. */
  line?: number
  /** An English description for logs; match on `code`. */
  message: string
}

/** The result of `fromICalendar`. */
export interface ICalendarImport {
  /** NAME or X-WR-CALNAME of the calendar, when there is one. */
  name?: string
  events: ICalendarImportEvent[]
  warnings: ICalendarImportWarning[]
}

interface ICalendarProperty {
  name: string
  params: Map<string, string>
  value: string
  line: number
}

const icalDateTime = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/
const icalDuration = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/
// `Intl` formats instants up to ±8.64e15 ms; a zoned wall time is resolved with a day of margin on each side.
const maxZonedWall = 8.64e15 - 2 * 86_400_000
const maxTime = 8.64e15

/** Split unfolded content lines into name, parameters and value. Returns undefined for a line without a colon. */
function icalProperty(text: string, line: number): ICalendarProperty | undefined {
  let index = 0
  const stop = (from: number) => {
    // The end of a name or parameter value: the first ; or : outside double quotes.
    let quoted = false
    for (let i = from; i < text.length; i++) {
      const char = text[i]!
      if (char === '"') quoted = !quoted
      else if (!quoted && (char === ';' || char === ':')) return i
    }
    return -1
  }
  let end = stop(0)
  if (end < 0) return undefined
  const name = text.slice(0, end).toUpperCase()
  const params = new Map<string, string>()
  index = end
  while (text[index] === ';') {
    end = stop(index + 1)
    if (end < 0) return undefined
    const parameter = text.slice(index + 1, end)
    const equals = parameter.indexOf('=')
    if (equals > 0) {
      const raw = parameter.slice(equals + 1)
      params.set(parameter.slice(0, equals).toUpperCase(), raw.length > 1 && raw.startsWith('"') && raw.endsWith('"') ? raw.slice(1, -1) : raw)
    }
    index = end
  }
  return { name, params, value: text.slice(index + 1), line }
}

/** Unescape an iCalendar TEXT value. */
function icalUnescape(value: string) {
  return value.replace(/\\([\\;,nN])/g, (_, char: string) => char === 'n' || char === 'N' ? '\n' : char)
}

/** The IANA zone of a TZID, also when a producer prefixed it like `/mozilla.org/20050126_1/Europe/Berlin`. */
function icalZone(tzid: string) {
  const parts = tzid.split('/')
  const candidates = [tzid]
  if (tzid.startsWith('/')) for (let take = 3; take >= 1; take--) if (parts.length > take) candidates.push(parts.slice(-take).join('/'))
  for (const candidate of candidates) {
    try {
      return { format: zoneFormat(candidate), name: candidate }
    } catch {
      // Try the next candidate.
    }
  }
  return undefined
}

/**
 * Read RFC 5545 text, such as `toICalendar` output or an export of a calendar application, into events. Pure string
 * parsing without a DOM, network or file access, done with loops. Lines are unfolded (CRLF, LF or CR line ends; a
 * leading byte order mark is removed), property names and parameter names are case-insensitive, quoted parameter values
 * are read, and TEXT values are unescaped (backslash followed by n, comma, semicolon or backslash; any other backslash is kept as written).
 *
 * Each VEVENT becomes an `ICalendarImportEvent` with `id` (UID), `summary` (SUMMARY, empty when missing), `description`
 * when DESCRIPTION is present, `start` and `end` in epoch milliseconds. DTSTART and DTEND may be UTC (`Z`), floating,
 * have a `TZID` parameter or be dates (`VALUE=DATE`). A UTC time is exact. A TZID is resolved with `Intl` as RFC 5545
 * section 3.3.5 says: a local time skipped by a daylight-saving gap is read with the UTC offset before the gap
 * (`DTSTART;TZID=America/New_York:20070311T023000` is 07:30 UTC, local 03:30), and a repeated local time takes its
 * first occurrence. This differs from `buildWorkPeriods` and editing, which move a skipped time to the transition. The
 * nonstandard prefix of `/mozilla.org/…/Europe/Berlin` is stripped, and VTIMEZONE definitions are not
 * read. A floating time, a date and a time with an unknown TZID (reported) are wall-clock times at
 * `options.utcOffsetMinutes`. The end is DTEND, else DTSTART plus DURATION, else the start plus one day for a date and
 * the start itself for a date-time, which is an
 * instant like the events `toICalendar` writes without DTEND. For a date, DTEND is the exclusive end, so the
 * event spans whole days as in `[start, end)`. A DURATION (weeks, days, hours, minutes and seconds; not negative) is
 * added as RFC 5545 says: its weeks and days to the local date and time of DTSTART, then its hours, minutes and seconds as
 * elapsed time. So with a TZID, `P1D` ends at the same local time on the next day (23 or 25 hours across a daylight
 * saving change) while `PT24H` is 24 hours; a local end time in a skipped or repeated hour is resolved like DTSTART. For
 * a UTC, floating or date DTSTART, a day is 24 hours.
 *
 * By default recurrence is not expanded: an event with RRULE, RDATE or EXDATE is imported once, at its first instance,
 * with the rule in `recurrenceRule`, and a warning. Changed instances (RECURRENCE-ID) are skipped. With
 * `options.recurrence: 'series'` the series is imported once with its parsed rule, EXDATEs and RDATEs in `recurrence`
 * (in the zone of DTSTART), and changed instances become events with ID `<UID>:<recurrenceId>`, `seriesId` and
 * `recurrenceId`; a rule that `parseRecurrenceRule` rejects keeps the default behaviour with a `recurrence` warning, and
 * a RECURRENCE-ID with RANGE=THISANDFUTURE is skipped. With `options.recurrence: { range }` the series are replaced by
 * their occurrences that overlap the range (`expandRecurrence`), changed instances take the place of the occurrences
 * they change, and other events are kept. Properties other than the
 * ones above, other components (VTODO, VTIMEZONE, …) and nested components such as VALARM are ignored.
 * Problems that the reader works around are listed in `warnings` instead of thrown.
 *
 * Throws an Error for a value that is not a string or has no BEGIN:VCALENDAR, and a RangeError for an invalid
 * `utcOffsetMinutes`. The reader sets no size limit: bound the size of uploaded files yourself.
 */
export function fromICalendar(text: string, options: ICalendarImportOptions = {}): ICalendarImport {
  const offset = checkOffset(options.utcOffsetMinutes)
  const mode = options.recurrence ?? 'first'
  if (mode !== 'first' && mode !== 'series') {
    if (mode === null || typeof mode !== 'object') throw new RangeError('recurrence must be first, series or { range }')
    // Check the range and the limit before reading.
    expandRecurrence({ id: 'check', start: 0, end: 0 }, mode.range, { maxOccurrences: mode.maxOccurrences })
  }
  if (typeof text !== 'string') throw new Error('iCalendar text must be a string')
  const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
  // Unfold: a line that starts with a space or tab continues the one before it.
  const lines: { text: string; line: number }[] = []
  const physical = source.split(/\r\n|\n|\r/)
  physical.forEach((content, index) => {
    if ((content[0] === ' ' || content[0] === '\t') && lines.length) lines[lines.length - 1]!.text += content.slice(1)
    else if (content !== '') lines.push({ text: content, line: index + 1 })
  })
  const warnings: ICalendarImportWarning[] = []
  const warn = (code: ICalendarImportWarningCode, message: string, line?: number, eventId?: string) => {
    warnings.push({ code, ...(eventId === undefined ? {} : { eventId }), ...(line === undefined ? {} : { line }), message })
  }
  if (!lines.some(({ text: line }) => /^BEGIN:VCALENDAR\s*$/i.test(line))) throw new Error('Not an iCalendar document: there is no BEGIN:VCALENDAR')
  // Every UID of the file, so an ID made up for an event without one never takes the UID of a later event.
  const uids = new Set<string>()
  for (const { text: line } of lines) {
    if (!/^UID[;:]/i.test(line)) continue
    const property = icalProperty(line, 0)
    if (property) uids.add(icalUnescape(property.value))
  }

  const events: ICalendarImportEvent[] = []
  const ids = new Set<string>()
  let name: string | undefined
  const stack: string[] = []
  let current: ICalendarProperty[] | undefined
  let currentLine = 0
  // `wall` is the local wall-clock time and `zone` the resolved TZID, for adding the days of a DURATION in local time.
  // `zoneName` is the IANA name of a resolved TZID and `utc` marks a UTC time, for the zone of a recurrence.
  interface ReadTime { time: number; date: boolean; wall: number; zone?: Intl.DateTimeFormat; zoneName?: string; utc?: boolean }
  const timeValue = (value: string, property: ICalendarProperty, eventId: string): ReadTime | undefined => {
    const match = icalDateTime.exec(value.trim())
    if (!match) return undefined
    const [y, mo, d, h = 0, mi = 0, sec = 0] = match.slice(1, 7).map(part => part === undefined ? undefined : Number(part)) as number[]
    const wall = wallTime(y!, mo!, d!, h, mi, sec)
    if (wall === undefined) return undefined
    const date = match[4] === undefined
    if (match[7] === 'Z') return { time: wall, date, wall, utc: true }
    const tzid = property.params.get('TZID')
    if (tzid !== undefined && !date) {
      const zone = icalZone(tzid)
      if (zone) return { time: rfc5545ZonedInstant(zone.format, wall), date, wall, zone: zone.format, zoneName: zone.name }
      warn('unknown-time-zone', `The time zone ${tzid} is unknown; the time was read as local time at the given offset`, property.line, eventId)
    }
    return { time: wall - offset * minuteMs, date, wall }
  }
  const time = (property: ICalendarProperty, eventId: string) => timeValue(property.value, property, eventId)
  /** The recurrence of a series: its rule, EXDATEs and RDATEs, in the zone of DTSTART. Throws for an unsupported rule. */
  const recurrenceOf = (properties: ICalendarProperty[], start: ReadTime, eventId: string) => {
    const zone: RecurrenceZoneOptions = start.zoneName !== undefined ? { timeZone: start.zoneName } : start.utc ? { timeZone: 'UTC' } : { utcOffsetMinutes: offset }
    const recurrence: CalendarRecurrence & { rule?: RecurrenceRule } = { ...zone }
    const rule = properties.find(property => property.name === 'RRULE')
    if (rule) recurrence.rule = parseRecurrenceRule(rule.value, zone)
    for (const name of ['EXDATE', 'RDATE'] as const) {
      const times: number[] = []
      for (const property of properties) {
        if (property.name !== name) continue
        for (const part of property.value.split(',')) {
          // An RDATE period (start/end or start/duration) adds its start; the series keeps its own duration.
          const read = timeValue(part.split('/')[0]!, property, eventId)
          if (read) times.push(read.time)
          else warn('invalid-value', `The ${name} value ${part.trim()} of event ${eventId} cannot be read and was ignored`, property.line, eventId)
        }
      }
      if (times.length) recurrence[name === 'EXDATE' ? 'exdates' : 'rdates'] = [...new Set(times)].sort((a, b) => a - b)
    }
    return recurrence
  }
  const finish = () => {
    const properties = current!
    current = undefined
    const find = (propertyName: string) => properties.find(property => property.name === propertyName)
    const uid = find('UID')
    let id = uid === undefined ? undefined : icalUnescape(uid.value)
    if (!id) {
      let number = events.length + 1
      while (uids.has('event-' + number) || ids.has('event-' + number)) number++
      id = 'event-' + number
      warn('missing-uid', `The event at line ${currentLine} has no UID and was named ${id}`, currentLine, id)
    }
    const label = id
    const startProperty = find('DTSTART')
    const start = startProperty && time(startProperty, label)
    const recurrenceIdProperty = find('RECURRENCE-ID')
    let changed: number | undefined
    if (recurrenceIdProperty) {
      const original = mode === 'first' ? undefined : time(recurrenceIdProperty, label)
      if (!original || recurrenceIdProperty.params.get('RANGE')?.toUpperCase() === 'THISANDFUTURE') {
        warn('skipped-event', mode === 'first'
          ? `Event ${label} changes one instance of a recurring event (RECURRENCE-ID) and was skipped`
          : `Event ${label} has a RECURRENCE-ID that cannot be read or has a RANGE, and was skipped`, currentLine, label)
        return
      }
      changed = original.time
      id = `${id}:${changed}`
    }
    if (!start) {
      warn('skipped-event', `Event ${label} has no valid DTSTART and was skipped`, currentLine, label)
      return
    }
    if (ids.has(id)) {
      warn('skipped-event', `Event ${label} repeats a UID and was skipped`, currentLine, label)
      return
    }
    ids.add(id)
    let end = start.time
    const endProperty = find('DTEND'), durationProperty = find('DURATION')
    if (endProperty) {
      const parsed = time(endProperty, label)
      if (!parsed) warn('invalid-value', `The DTEND of event ${label} cannot be read; the event is an instant`, endProperty.line, label)
      else if (parsed.time < start.time) warn('invalid-value', `The DTEND of event ${label} is before its DTSTART; the event is an instant`, endProperty.line, label)
      else end = parsed.time
      if (durationProperty) warn('invalid-value', `Event ${label} has both DTEND and DURATION; DURATION was ignored`, durationProperty.line, label)
    } else if (durationProperty) {
      const match = icalDuration.exec(durationProperty.value.trim())
      const [weeks = 0, days = 0, hours = 0, minutes = 0, seconds = 0] = (match?.slice(2) ?? []).map(part => part === undefined ? undefined : Number(part)) as number[]
      // RFC 5545 3.3.6: weeks and days are nominal and are added to the local date first, then the exact hours,
      // minutes and seconds as elapsed time. They differ only in a time zone with daylight saving.
      const nominal = durationMs(weeks, days, 0, 0, 0), exact = durationMs(0, 0, hours, minutes, seconds)
      const local = start.wall + nominal
      const readable = match !== null && /\d/.test(durationProperty.value) && match[1] !== '-'
        && Number.isFinite(start.time + nominal + exact) && (start.zone === undefined || Math.abs(local) <= maxZonedWall)
      const sum = readable ? (start.zone ? rfc5545ZonedInstant(start.zone, local) : start.time + nominal) + exact : NaN
      // An end beyond the range of Date (±8.64e15 ms) is not a time.
      if (!(Math.abs(sum) <= maxTime)) {
        warn('invalid-value', `The DURATION of event ${label} cannot be read or is negative; the event is an instant`, durationProperty.line, label)
      } else end = sum
    } else if (start.date) end = start.time + 86_400_000
    const event: ICalendarImportEvent = { id, summary: '', start: start.time, end, allDay: start.date }
    const summary = find('SUMMARY'), description = find('DESCRIPTION'), rule = find('RRULE')
    if (summary) event.summary = icalUnescape(summary.value)
    if (description) event.description = icalUnescape(description.value)
    if (rule) event.recurrenceRule = rule.value.trim()
    if (changed !== undefined) {
      event.seriesId = label
      event.recurrenceId = changed
      events.push(event)
      return
    }
    const repeats = rule ?? find('RDATE') ?? find('EXDATE')
    if (repeats && mode !== 'first') {
      try {
        event.recurrence = recurrenceOf(properties, start, label)
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error)
        warn('recurrence', `Event ${label} repeats by a rule that cannot be expanded (${reason}); only its first instance was imported`, repeats.line, label)
      }
    } else if (repeats) warn('recurrence', `Event ${label} repeats; only its first instance was imported`, repeats.line, label)
    events.push(event)
  }
  for (const { text: lineText, line } of lines) {
    const upper = lineText.toUpperCase()
    if (upper.startsWith('BEGIN:')) {
      const kind = upper.slice(6).trim()
      if (kind === 'VEVENT' && stack.at(-1) === 'VCALENDAR') {
        current = []
        currentLine = line
      }
      stack.push(kind)
      continue
    }
    if (upper.startsWith('END:')) {
      const kind = upper.slice(4).trim()
      if (stack.at(-1) !== kind) {
        warn('malformed', `END:${kind} at line ${line} does not match the open component and was ignored`, line)
        continue
      }
      stack.pop()
      if (kind === 'VEVENT' && current) finish()
      continue
    }
    const inEvent = stack.at(-1) === 'VEVENT' && current !== undefined
    const inCalendar = stack.length === 1 && stack[0] === 'VCALENDAR'
    if (!inEvent && !inCalendar) continue
    const property = icalProperty(lineText, line)
    if (!property) {
      warn('malformed', `The line ${line} has no colon and was ignored`, line)
      continue
    }
    if (inEvent) current!.push(property)
    else if ((property.name === 'NAME' || property.name === 'X-WR-CALNAME') && (name === undefined || property.name === 'NAME')) name = icalUnescape(property.value)
  }
  if (current) warn('skipped-event', `The event at line ${currentLine} has no END:VEVENT and was skipped`, currentLine)
  const result: ICalendarImport = { events: typeof mode === 'object' ? expandImported(events, mode) : events, warnings }
  if (name !== undefined) result.name = name
  return result
}

/**
 * The occurrences of the imported series that overlap the range, with changed instances (RECURRENCE-ID) in place of
 * the occurrences they change. Other events and changed instances are kept as they are, in file order.
 */
function expandImported(events: ICalendarImportEvent[], options: ICalendarExpandOptions): ICalendarImportEvent[] {
  const key = (seriesId: string, recurrenceId: number) => seriesId + '\u0000' + recurrenceId
  const changed = new Set(events.flatMap(event => event.seriesId === undefined ? [] : [key(event.seriesId, event.recurrenceId!)]))
  const result: ICalendarImportEvent[] = []
  for (const event of events) {
    if (!event.recurrence) {
      result.push(event)
      continue
    }
    const { recurrence, ...base } = event
    const occurrences = expandRecurrence({ ...recurrence, id: event.id, start: event.start, end: event.end }, options.range, { maxOccurrences: options.maxOccurrences })
    for (const occurrence of occurrences) {
      if (changed.has(key(event.id, occurrence.recurrenceId))) continue
      result.push({ ...base, id: occurrence.id, start: occurrence.start, end: occurrence.end, seriesId: event.id, recurrenceId: occurrence.recurrenceId })
    }
  }
  return result
}

/** GanttChart data from `timelineFromICalendar`. */
export interface ICalendarTimeline {
  rows: TimelineRow[]
  bars: TimelineBar[]
}

/**
 * Turn events, such as the result of `fromICalendar` or the input of `toICalendar`, into GanttChart rows and bars: one
 * row and one bar per event, in input order, both with the event ID, the summary as label, the dates, and the
 * description (when it is not empty) as the bar's `description`. An event with `start === end` is a zero-length
 * milestone bar. Throws the Errors and RangeErrors of `toICalendar` for empty or duplicate IDs, a missing summary and
 * non-finite or unordered times. The input is not modified.
 */
export function timelineFromICalendar(events: readonly ICalendarEvent[]): ICalendarTimeline {
  const ids = new Set<string>()
  const rows: TimelineRow[] = [], bars: TimelineBar[] = []
  for (const event of events) {
    checkId('event', event.id, ids)
    ids.add(event.id)
    checkTime(event.start, 'An event time')
    checkTime(event.end, 'An event time')
    if (event.end < event.start) throw new RangeError('An event cannot end before it starts: ' + event.id)
    checkText(event.summary, 'The summary of event ' + event.id)
    rows.push({ id: event.id, label: event.summary })
    const bar: TimelineBar = { id: event.id, rowId: event.id, label: event.summary, start: event.start, end: event.end }
    if (event.description) bar.description = event.description
    bars.push(bar)
  }
  return { rows, bars }
}
