// Interchange formats: Microsoft Project XML (MSPDI), iCalendar and CSV. Pure string builders without a DOM.
import { escapeXml } from './exportSvg.js'
import { timelineWbsCodes } from './rowHierarchy.js'
import { createTimelineRowTree } from './timeline.js'
import type { TimelineBar, TimelineDependencyType, TimelineRow } from './types.js'

export interface MsProjectTask {
  id: string
  name: string
  /** Epoch milliseconds. */
  start: number
  /** Epoch milliseconds, not before `start`. */
  end: number
  /** Outline level from 1 (top level). Each task is at most one level below the task before it. Default 1. */
  outlineLevel?: number
  /** Percent complete from 0 to 100, rounded to an integer. */
  percentComplete?: number
  /** Export as a milestone. Tasks with `start === end` are always milestones. */
  milestone?: boolean
}

export interface MsProjectDependency {
  from: string
  to: string
  /** Default FS. */
  type?: TimelineDependencyType
  /** Elapsed lag in milliseconds; negative values are leads. Written in tenths of a minute. */
  lag?: number
}

export interface MsProjectInput {
  name: string
  tasks: readonly MsProjectTask[]
  dependencies?: readonly MsProjectDependency[]
}

export interface MsProjectXmlOptions {
  /** Fixed offset from UTC in minutes for the written wall-clock dates. Default 0 (UTC). */
  utcOffsetMinutes?: number
}

const minuteMs = 60_000
const linkTypes: Record<TimelineDependencyType, number> = { FF: 0, FS: 1, SF: 2, SS: 3 }

function checkTime(value: number, what: string) {
  if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > 8.64e15) throw new RangeError(what + ' must be a finite time')
}

/** A local ISO date-time without an offset, as MSPDI expects. */
function localIso(time: number, offset: number) {
  const iso = new Date(time + offset * minuteMs).toISOString()
  if (!/^\d{4}-/.test(iso)) throw new RangeError('Dates must be between the years 0 and 9999')
  return iso.slice(0, 19)
}

/** An ISO 8601 duration with whole hours, minutes and seconds, such as PT26H30M0S. */
function isoDuration(ms: number) {
  const seconds = Math.round(ms / 1000)
  return `PT${Math.floor(seconds / 3600)}H${Math.floor(seconds % 3600 / 60)}M${seconds % 60}S`
}

/**
 * Build a Microsoft Project XML (MSPDI) document that Microsoft Project and compatible tools can open. Each task
 * becomes a manually scheduled task (so its dates are kept as given) with a UID and ID from 1 in input order, its
 * name, start, finish, elapsed duration, outline level and number, milestone and summary flags and percent complete.
 * Dependencies become `PredecessorLink` elements with the MSPDI link type (FF 0, FS 1, SF 2, SS 3) and the lag in
 * tenths of a minute as elapsed minutes. Dates are wall-clock times at `utcOffsetMinutes` without an offset suffix.
 *
 * Not exported: calendars, resources, assignments, baselines, constraints, notes and custom fields. Task IDs of the
 * input are not written; the UIDs follow the input order.
 *
 * Throws an Error for empty or duplicate task IDs, unknown dependency ends and unknown link types, and a RangeError
 * for non-finite or unordered dates, an invalid outline level, percent complete or lag.
 */
export function toMsProjectXml(project: MsProjectInput, options: MsProjectXmlOptions = {}): string {
  const offset = options.utcOffsetMinutes ?? 0
  if (!Number.isInteger(offset) || Math.abs(offset) > 18 * 60) throw new RangeError('utcOffsetMinutes must be an integer between -1080 and 1080')
  const uids = new Map<string, number>()
  let previousLevel = 0
  const levels: number[] = []
  for (const task of project.tasks) {
    if (typeof task.id !== 'string' || !task.id || uids.has(task.id)) throw new Error('Invalid or duplicate task ID: ' + task.id)
    checkTime(task.start, 'Task start')
    checkTime(task.end, 'Task end')
    if (task.end < task.start) throw new RangeError('A task cannot end before it starts: ' + task.id)
    const level = task.outlineLevel ?? 1
    if (!Number.isInteger(level) || level < 1 || level > previousLevel + 1) {
      throw new RangeError('Outline levels must start at 1 and grow by at most one per task: ' + task.id)
    }
    const percent = task.percentComplete
    if (percent !== undefined && (typeof percent !== 'number' || !Number.isFinite(percent) || percent < 0 || percent > 100)) {
      throw new RangeError('percentComplete must be between 0 and 100: ' + task.id)
    }
    uids.set(task.id, uids.size + 1)
    levels.push(level)
    previousLevel = level
  }
  const predecessors = new Map<string, string[]>()
  for (const dependency of project.dependencies ?? []) {
    const from = uids.get(dependency.from), to = uids.get(dependency.to)
    if (from === undefined || to === undefined) throw new Error(`Unknown dependency end: ${dependency.from} → ${dependency.to}`)
    const type = linkTypes[dependency.type ?? 'FS']
    if (type === undefined) throw new Error('Invalid dependency type: ' + dependency.type)
    const lag = dependency.lag ?? 0
    if (typeof lag !== 'number' || !Number.isFinite(lag)) throw new RangeError('Dependency lag must be finite')
    let list = predecessors.get(dependency.to)
    if (!list) predecessors.set(dependency.to, list = [])
    list.push('<PredecessorLink>'
      + `<PredecessorUID>${from}</PredecessorUID><Type>${type}</Type><CrossProject>0</CrossProject>`
      + `<LinkLag>${Math.round(lag / 6000)}</LinkLag><LagFormat>4</LagFormat></PredecessorLink>`)
  }
  let projectStart = Infinity, projectEnd = -Infinity
  for (const task of project.tasks) {
    projectStart = Math.min(projectStart, task.start)
    projectEnd = Math.max(projectEnd, task.end)
  }
  const outline: number[] = []
  const tasks = project.tasks.map((task, index) => {
    const level = levels[index]!
    outline.length = level
    outline[level - 1] = (outline[level - 1] ?? 0) + 1
    const number = outline.join('.')
    const uid = index + 1
    const milestone = task.milestone === true || task.start === task.end
    const summary = (levels[index + 1] ?? 0) > level
    const start = localIso(task.start, offset), finish = localIso(task.end, offset)
    const duration = isoDuration(milestone ? 0 : task.end - task.start)
    return '<Task>'
      + `<UID>${uid}</UID><ID>${uid}</ID><Name>${escapeXml(task.name)}</Name><Active>1</Active><Manual>1</Manual>`
      + `<WBS>${number}</WBS><OutlineNumber>${number}</OutlineNumber><OutlineLevel>${level}</OutlineLevel>`
      + `<Start>${start}</Start><Finish>${finish}</Finish><Duration>${duration}</Duration>`
      + `<ManualStart>${start}</ManualStart><ManualFinish>${finish}</ManualFinish><ManualDuration>${duration}</ManualDuration>`
      + `<Milestone>${milestone ? 1 : 0}</Milestone><Summary>${summary ? 1 : 0}</Summary>`
      + `<PercentComplete>${Math.round(task.percentComplete ?? 0)}</PercentComplete>`
      + (predecessors.get(task.id) ?? []).join('')
      + '</Task>'
  })
  const name = escapeXml(project.name)
  const dates = project.tasks.length
    ? `<StartDate>${localIso(projectStart, offset)}</StartDate><FinishDate>${localIso(projectEnd, offset)}</FinishDate>` : ''
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
    + '<Project xmlns="http://schemas.microsoft.com/project">'
    + `<Name>${name}</Name><Title>${name}</Title><ScheduleFromStart>1</ScheduleFromStart>${dates}`
    + `<Tasks>${tasks.join('')}</Tasks></Project>\n`
}

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

/** UTC date-time in iCalendar basic format, such as 20261109T080000Z. */
function icalTime(time: number) {
  checkTime(time, 'An event time')
  const iso = new Date(time).toISOString()
  if (!/^\d{4}-/.test(iso)) throw new RangeError('Dates must be between the years 0 and 9999')
  return iso.slice(0, 19).replace(/[-:]/g, '') + 'Z'
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
 * optional DESCRIPTION. Times are written in UTC, text is escaped, lines end with CRLF and are folded at 75 octets.
 * Throws an Error for empty or duplicate IDs and a RangeError for non-finite or unordered times.
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
    lines.push('BEGIN:VEVENT', 'UID:' + icalText(event.id), 'DTSTAMP:' + stamp, 'DTSTART:' + start)
    if (event.end > event.start) lines.push('DTEND:' + end)
    lines.push('SUMMARY:' + icalText(event.summary))
    if (event.description !== undefined) lines.push('DESCRIPTION:' + icalText(event.description))
    lines.push('END:VEVENT')
  }
  lines.push('END:VCALENDAR')
  return lines.map(fold).join('\r\n') + '\r\n'
}

/** A CSV cell: text, a finite number or an empty cell. */
export type CsvCell = string | number | undefined

/**
 * Build RFC 4180 CSV text: fields separated by commas, records ended by CRLF, and fields that contain a comma, a
 * double quote, CR or LF enclosed in double quotes with inner quotes doubled. `undefined` is an empty field. Throws a
 * RangeError for a non-finite number. Spreadsheet formulas are not neutralized; prefix cells that start with `=`,
 * `+`, `-` or `@` yourself when the file is opened in a spreadsheet and the text is untrusted.
 */
export function toCsv(table: readonly (readonly CsvCell[])[]): string {
  return table.map(record => record.map(cell => {
    if (cell === undefined) return ''
    if (typeof cell === 'number') {
      if (!Number.isFinite(cell)) throw new RangeError('CSV numbers must be finite')
      return String(cell)
    }
    const text = String(cell)
    return /[",\r\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text
  }).join(',') + '\r\n').join('')
}

/** A column of `timelineCsvTable`. */
export type TimelineCsvColumn = 'row' | 'wbs' | 'bar' | 'start' | 'end' | 'progress'

export interface TimelineCsvOptions {
  /** Start and end text. Default ISO 8601 in UTC, such as 2026-11-09T08:00:00.000Z. */
  formatTime?: (time: number) => string
  /** Columns in order. Default all: row, wbs, bar, start, end, progress. */
  columns?: readonly TimelineCsvColumn[]
  /** Header texts. Defaults: Row, WBS, Bar, Start, End, Progress. */
  headers?: Partial<Record<TimelineCsvColumn, string>>
}

const csvHeaders: Record<TimelineCsvColumn, string> = { row: 'Row', wbs: 'WBS', bar: 'Bar', start: 'Start', end: 'End', progress: 'Progress' }

/**
 * A table for `toCsv`: a header record and one record per bar, ordered by row in tree preorder and then by bar input
 * order. Cells are the row label, the row's WBS code (`timelineWbsCodes`), the bar label, the formatted start and end
 * and the progress from 0 to 1 (empty without progress). Throws an Error for invalid rows, a bar of an unknown row and
 * an unknown column.
 */
export function timelineCsvTable(
  rows: readonly TimelineRow[], bars: readonly TimelineBar[], options: TimelineCsvOptions = {},
): CsvCell[][] {
  const tree = createTimelineRowTree(rows)
  const codes = timelineWbsCodes(rows)
  const columns = options.columns ?? (Object.keys(csvHeaders) as TimelineCsvColumn[])
  for (const column of columns) if (!(column in csvHeaders)) throw new Error('Unknown CSV column: ' + column)
  const format = options.formatTime ?? ((time: number) => new Date(time).toISOString())
  const byRow = new Map<string, TimelineBar[]>()
  for (const bar of bars) {
    if (!codes.has(bar.rowId)) throw new Error('Unknown row for bar: ' + bar.id)
    let list = byRow.get(bar.rowId)
    if (!list) byRow.set(bar.rowId, list = [])
    list.push(bar)
  }
  const table: CsvCell[][] = [columns.map(column => options.headers?.[column] ?? csvHeaders[column])]
  for (const { row } of tree) {
    for (const bar of byRow.get(row.id) ?? []) {
      const cells: Record<TimelineCsvColumn, CsvCell> = {
        row: row.label, wbs: codes.get(row.id), bar: bar.label, start: format(bar.start), end: format(bar.end), progress: bar.progress,
      }
      table.push(columns.map(column => cells[column]))
    }
  }
  return table
}
