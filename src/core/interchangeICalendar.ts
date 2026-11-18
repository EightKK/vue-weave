// iCalendar (RFC 5545): `toICalendar`, `fromICalendar` and `timelineFromICalendar`. Pure string builders and readers
// without a DOM. Re-exported by `interchange.ts`.
import { checkOffset, checkText, checkTime, durationMs, isoText, minuteMs, toSecond, wallTime } from './interchangeShared.js'
import { zonedInstant, zoneFormat } from './timeZone.js'
import type { TimelineBar, TimelineRow } from './types.js'

export interface ICalendarEvent {
  /** Unique within the calendar. Written as the event UID; make it globally unique, for example `id@example.com`. */
  id: string
  summary: string
  /** Epoch milliseconds. */
  start: number
  /** Epoch milliseconds, not before `start`. An event with `end === start` is written without DTEND. */
  end: number
  description?: string
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

/**
 * Build an iCalendar (RFC 5545) document with one VEVENT per event: UID, DTSTAMP, DTSTART, DTEND, SUMMARY and an
 * optional DESCRIPTION. Times are written in UTC, rounded to the nearest whole second; DTEND is written only when the
 * rounded end is after the rounded start. Text is escaped, lines end with CRLF and are folded at 75 octets.
 * Throws an Error for empty or duplicate IDs and a missing summary, and a RangeError for non-finite or unordered times.
 */
export function toICalendar(events: readonly ICalendarEvent[], options: ICalendarOptions = {}): string {
  const stamp = icalTime(options.timestamp ?? Date.now())
  const ids = new Set<string>()
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:' + icalText(options.productId ?? '-//vue-weave//Timeline export//EN'), 'CALSCALE:GREGORIAN']
  if (options.calendarName !== undefined) {
    lines.push('NAME:' + icalText(options.calendarName), 'X-WR-CALNAME:' + icalText(options.calendarName))
  }
  for (const event of events) {
    if (typeof event.id !== 'string' || !event.id || ids.has(event.id)) throw new Error('Invalid or duplicate event ID: ' + event.id)
    ids.add(event.id)
    const start = icalTime(event.start), end = icalTime(event.end)
    if (event.end < event.start) throw new RangeError('An event cannot end before it starts: ' + event.id)
    checkText(event.summary, 'The summary of event ' + event.id)
    lines.push('BEGIN:VEVENT', 'UID:' + icalText(event.id), 'DTSTAMP:' + stamp, 'DTSTART:' + start)
    // RFC 5545 requires DTEND after DTSTART; a span that rounds to nothing is written as an instant.
    if (end !== start) lines.push('DTEND:' + end)
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
  /** The RRULE of a recurring event, as written. Only the first instance is imported. */
  recurrenceRule?: string
}

export interface ICalendarImportOptions {
  /**
   * Offset from UTC in minutes for local times that have no zone: floating date-times, dates, and date-times whose
   * TZID cannot be resolved. Default 0 (UTC), integer within ±1080.
   */
  utcOffsetMinutes?: number
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

/** The IANA formatter for a TZID, also when a producer prefixed it like `/mozilla.org/20050126_1/Europe/Berlin`. */
function icalZone(tzid: string) {
  const parts = tzid.split('/')
  const candidates = [tzid]
  if (tzid.startsWith('/')) for (let take = 3; take >= 1; take--) if (parts.length > take) candidates.push(parts.slice(-take).join('/'))
  for (const candidate of candidates) {
    try {
      return zoneFormat(candidate)
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
 * have a `TZID` parameter or be dates (`VALUE=DATE`). A UTC time is exact. A TZID is resolved with `Intl` in the same
 * way as `buildWorkPeriods` (an hour skipped by daylight saving moves forward, a repeated one takes its first
 * occurrence); the nonstandard prefix of `/mozilla.org/…/Europe/Berlin` is stripped, and VTIMEZONE definitions are not
 * read. A floating time, a date and a time with an unknown TZID (reported) are wall-clock times at
 * `options.utcOffsetMinutes`. The end is DTEND, else DTSTART plus DURATION (weeks, days, hours, minutes and seconds;
 * days count 24 hours), else the start plus one day for a date and the start itself for a date-time, which is an
 * instant like the events `toICalendar` writes without DTEND. For a date, DTEND is the exclusive end, so the
 * event spans whole days as in `[start, end)`.
 *
 * Recurrence is not expanded: an event with RRULE, RDATE or EXDATE is imported once, at its first instance, with the
 * rule in `recurrenceRule`, and a warning. Changed instances (RECURRENCE-ID) are skipped. Properties other than the
 * ones above, other components (VTODO, VTIMEZONE, …) and nested components such as VALARM are ignored.
 * Problems that the reader works around are listed in `warnings` instead of thrown.
 *
 * Throws an Error for a value that is not a string or has no BEGIN:VCALENDAR, and a RangeError for an invalid
 * `utcOffsetMinutes`. The reader sets no size limit: bound the size of uploaded files yourself.
 */
export function fromICalendar(text: string, options: ICalendarImportOptions = {}): ICalendarImport {
  const offset = checkOffset(options.utcOffsetMinutes)
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

  const events: ICalendarImportEvent[] = []
  const ids = new Set<string>()
  let name: string | undefined
  const stack: string[] = []
  let current: ICalendarProperty[] | undefined
  let currentLine = 0
  const time = (property: ICalendarProperty, eventId: string): { time: number; date: boolean } | undefined => {
    const match = icalDateTime.exec(property.value.trim())
    if (!match) return undefined
    const [y, mo, d, h = 0, mi = 0, sec = 0] = match.slice(1, 7).map(part => part === undefined ? undefined : Number(part)) as number[]
    const wall = wallTime(y!, mo!, d!, h, mi, sec)
    if (wall === undefined) return undefined
    const date = match[4] === undefined
    if (match[7] === 'Z') return { time: wall, date }
    const tzid = property.params.get('TZID')
    if (tzid !== undefined && !date) {
      const format = icalZone(tzid)
      if (format) return { time: zonedInstant(format, wall), date }
      warn('unknown-time-zone', `The time zone ${tzid} is unknown; the time was read as local time at the given offset`, property.line, eventId)
    }
    return { time: wall - offset * minuteMs, date }
  }
  const finish = () => {
    const properties = current!
    current = undefined
    const find = (propertyName: string) => properties.find(property => property.name === propertyName)
    const uid = find('UID')
    let id = uid === undefined ? undefined : icalUnescape(uid.value)
    if (!id) {
      id = 'event-' + (events.length + 1)
      warn('missing-uid', `The event at line ${currentLine} has no UID and was named ${id}`, currentLine, id)
    }
    const label = id
    const startProperty = find('DTSTART')
    const start = startProperty && time(startProperty, label)
    if (properties.some(property => property.name === 'RECURRENCE-ID')) {
      warn('skipped-event', `Event ${label} changes one instance of a recurring event (RECURRENCE-ID) and was skipped`, currentLine, label)
      return
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
      const length = match && /\d/.test(durationProperty.value)
        ? durationMs(weeks, days, hours, minutes, seconds) : undefined
      if (length === undefined || match![1] === '-' || !Number.isFinite(start.time + length)) {
        warn('invalid-value', `The DURATION of event ${label} cannot be read or is negative; the event is an instant`, durationProperty.line, label)
      } else end = start.time + length
    } else if (start.date) end = start.time + 86_400_000
    const event: ICalendarImportEvent = { id, summary: '', start: start.time, end, allDay: start.date }
    const summary = find('SUMMARY'), description = find('DESCRIPTION'), rule = find('RRULE')
    if (summary) event.summary = icalUnescape(summary.value)
    if (description) event.description = icalUnescape(description.value)
    if (rule) event.recurrenceRule = rule.value.trim()
    const repeats = rule ?? find('RDATE') ?? find('EXDATE')
    if (repeats) warn('recurrence', `Event ${label} repeats; only its first instance was imported`, repeats.line, label)
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
  const result: ICalendarImport = { events, warnings }
  if (name !== undefined) result.name = name
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
    if (typeof event.id !== 'string' || !event.id || ids.has(event.id)) throw new Error('Invalid or duplicate event ID: ' + event.id)
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
