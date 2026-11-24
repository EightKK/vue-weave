// SVG export of an event calendar (EventCalendar): the day and week time grids with their all-day row and the month
// grid, laid out with the same core functions as the component (`eventCalendarDays`, `layoutCalendarDayEvents`,
// `packCalendarEventLanes`), so the export matches the screen. Each view has its own renderer in `viewRenderers`; a
// view without one is rejected. Free of Vue and the DOM.
import {
  eventCalendarDays, eventCalendarTimeOfDay, layoutCalendarDayEvents, packCalendarEventLanes, validateCalendarEvents,
  type CalendarEvent, type CalendarResource, type EventCalendarDay, type EventCalendarLabels, type EventCalendarOptions,
  type EventCalendarView,
} from './eventCalendar.js'
import { intlTimeFormatter } from './calendarFormat.js'
import { cachedDateFormat, zoneFormat, type CachedDateFormat } from './timeZone.js'
import type { TimeRange } from './timeline.js'
import type { PngExportOptions } from './types.js'
import {
  boxText, common, estimateTextWidth, optionColour, sizeOption, svgDocument, tag, textOption, titleTag, toneColors,
  type SvgExportOptions, type SvgExportThemeInput, type Theme,
} from './svgExportShared.js'

const hour = 3_600_000
const dayMs = 86_400_000
/** Smallest drawn height of a timed event, the height of an event lane and the space below the lanes, as EventCalendar. */
const minEventHeight = 18
const laneHeight = 22
const lanePadding = 6
const monthHeader = 26

/** The EventCalendar texts that the calendar export draws. */
export type EventCalendarSvgLabels = Pick<EventCalendarLabels, 'allDay' | 'more' | 'resources' | 'now'> & Pick<Required<EventCalendarLabels>, 'recurring'>

/** Options of `renderEventCalendarSvg`. `E` types the events that `eventLabel` receives. */
export interface EventCalendarSvgOptions<E extends CalendarEvent = CalendarEvent> extends SvgExportOptions, EventCalendarOptions {
  /**
   * `day`, `week` or `month`, as EventCalendar `view`. Default `week`. Other views throw a RangeError (`Unsupported
   * event calendar export view`).
   */
  view?: EventCalendarView
  /** BCP 47 locale of the labels. Default `en-US`. */
  locale?: string | readonly string[]
  /** Resources; the day view draws one column per resource, as EventCalendar `resources`. */
  resources?: readonly CalendarResource[]
  /** First and last-plus-one hour of the time grid, integers from 0 to 24. Defaults 0 and 24. The whole span is drawn. */
  dayStart?: number
  dayEnd?: number
  /** Height of one hour of the time grid in pixels. Default 48. */
  hourHeight?: number
  /** Width of the document in pixels; the day columns share it after the hour gutter. Default 896. */
  width?: number
  /** Lanes of events per week of the month view before "+N more". Default 3. */
  maxMonthLanes?: number
  /** Current time: its day is marked as today and the time grid draws the now line. */
  now?: number
  /** An event drawn in the selected style. */
  selectedId?: string
  /** Times of day in labels. Default `intlTimeFormatter({ locale, timeZone })`. */
  formatTime?: (time: number) => string
  /** Texts; omitted ones use the English EventCalendar defaults. */
  labels?: Partial<EventCalendarSvgLabels>
  /** Text drawn above the view. Defaults to the title of the EventCalendar toolbar; `false` draws none. */
  heading?: string | false
  /** Event label text. Defaults to `event.label`. */
  eventLabel?: (event: E) => string
}

/** Options of the EventCalendar `exportSvg` method. Current props and the shown view and date supply everything else. */
export interface EventCalendarExportOptions<E extends CalendarEvent = CalendarEvent> {
  /** Paint an opaque background. Default true. */
  background?: boolean
  title?: string
  /** Colours that replace the values read from the `--vw-*` custom properties. */
  theme?: SvgExportThemeInput
  /** Width of the document in pixels. Defaults to the width of the component, or 896 before it is mounted. */
  width?: number
  /** Text drawn above the view. Defaults to the toolbar title; `false` draws none. */
  heading?: string | false
  /** Draw the selected event in the selected style. Default true. */
  includeSelection?: boolean
  eventLabel?: (event: E) => string
}

export interface EventCalendarPngExportOptions<E extends CalendarEvent = CalendarEvent> extends EventCalendarExportOptions<E>, PngExportOptions {}

const defaultLabels: EventCalendarSvgLabels = { allDay: 'All day', more: 'more', resources: 'Resources', now: 'Now', recurring: 'Recurring' }

/** Everything a view renderer needs: validated options, formats and the shared drawing helpers. */
interface CalendarFrame<E extends CalendarEvent> {
  events: readonly E[]
  view: EventCalendarView
  date: number
  days: EventCalendarDay[]
  zone: { timeZone: string; weekStartsOn: number }
  resources?: readonly CalendarResource[]
  theme: Theme
  rtl: boolean
  width: number
  top: number
  dayStart: number
  dayEnd: number
  hourHeight: number
  maxMonthLanes: number
  now?: number
  selectedId?: string
  labels: EventCalendarSvgLabels
  locale: string | readonly string[]
  timeText: (time: number) => string
  shortDate: CachedDateFormat
  eventLabel: (event: E) => string
}

type ViewRenderer = <E extends CalendarEvent>(frame: CalendarFrame<E>) => { height: number; body: string }

const inAllDayRow = (event: CalendarEvent) => Boolean(event.allDay) || event.end - event.start >= dayMs
const isOccurrence = (event: CalendarEvent) => event.seriesId !== undefined && event.recurrenceId !== undefined
const isToday = (now: number | undefined, day: TimeRange) => now !== undefined && now >= day.start && now < day.end

/** The accessible text of an event, as EventCalendar names its event buttons. */
function eventName<E extends CalendarEvent>(event: E, frame: CalendarFrame<E>) {
  const { shortDate, timeText } = frame
  const parts = [frame.eventLabel(event)]
  if (event.allDay) {
    const first = shortDate.format(event.start), final = shortDate.format(Math.max(event.start, event.end - 1))
    parts.push(first === final ? first : `${first} – ${final}`, frame.labels.allDay)
  } else {
    const sameDay = shortDate.format(event.start) === shortDate.format(Math.max(event.start, event.end - 1))
    parts.push(sameDay
      ? `${shortDate.format(event.start)} ${timeText(event.start)}–${timeText(event.end)}`
      : `${shortDate.format(event.start)} ${timeText(event.start)} – ${shortDate.format(event.end)} ${timeText(event.end)}`)
  }
  const resource = event.resourceId === undefined ? undefined : frame.resources?.find(item => item.id === event.resourceId)
  if (resource) parts.push(resource.label)
  if (isOccurrence(event) && frame.labels.recurring) parts.push(frame.labels.recurring)
  return parts.join(', ')
}

/**
 * One event box: tone background and border, the accent stripe at the inline start (doubled for an occurrence of a
 * recurring series), the selection outline and the text lines. `plain` draws a timed event of the month view: the
 * stripe and text only.
 */
function eventBox<E extends CalendarEvent>(
  event: E, box: { x: number; y: number; width: number; height: number }, lines: { text: string; y: number; size: number; weight?: number }[],
  frame: CalendarFrame<E>, plain = false,
) {
  const { theme, rtl } = frame
  if (box.width <= 0 || box.height <= 0) return ''
  const colors = toneColors(theme, event.tone)
  const accent = optionColour(event.color, 'the color of event ' + event.id, colors.solid)
  let out = titleTag(eventName(event, frame))
  if (frame.selectedId === event.id) {
    out += tag('rect', { x: box.x - 2, y: box.y - 2, width: box.width + 4, height: box.height + 4, rx: 5, fill: 'none', stroke: theme.accent, 'stroke-width': 2 })
  }
  if (!plain) out += tag('rect', { ...box, rx: 4, fill: colors.pale, stroke: colors.line })
  const stripeX = rtl ? box.x + box.width - 3 : box.x
  if (isOccurrence(event)) {
    out += tag('rect', { x: stripeX, y: box.y, width: 1.2, height: box.height, fill: accent })
      + tag('rect', { x: stripeX + 2.4, y: box.y, width: 1.2, height: box.height, fill: accent })
  } else out += tag('rect', { x: stripeX, y: box.y, width: 3, height: box.height, fill: accent })
  for (const line of lines) {
    out += boxText(box, rtl, line.text, { y: line.y, size: line.size, weight: line.weight, fill: plain ? theme.text : colors.ink, inset: 7 })
  }
  return tag('g', { class: 'vw-calendar-event' }, out)
}

/** The day and week views: column headers, the all-day row, the hour gutter and the time grid with timed events. */
const timeGrid: ViewRenderer = frame => {
  const { theme, rtl, days, width, top, now, labels } = frame
  const gutter = 56
  const resourceMode = frame.view === 'day' && Boolean(frame.resources?.length)
  const day0 = days[0]!
  const columns = resourceMode
    ? frame.resources!.map(resource => ({ day: day0, resourceId: resource.id as string | undefined, label: resource.label, detail: resource.detail }))
    : days.map(day => ({ day, resourceId: undefined as string | undefined, label: frame.shortDate.format(day.start), detail: undefined as string | undefined }))
  const count = columns.length
  const columnWidth = (width - gutter) / count
  const columnX = (index: number) => rtl ? width - gutter - (index + 1) * columnWidth : gutter + index * columnWidth
  const gutterX = rtl ? width - gutter : 0
  const spanX = (start: number, end: number) => rtl ? columnX(end - 1) : columnX(start)
  const inColumn = (event: CalendarEvent, resourceId: string | undefined) => resourceId === undefined || event.resourceId === resourceId
  let out = ''

  // Column headers.
  const headHeight = columns.some(column => column.detail) ? 44 : 36
  out += tag('rect', { x: 0, y: top, width, height: headHeight, fill: theme.surfaceMuted })
  out += boxText({ x: gutterX, y: top, width: gutter, height: headHeight }, rtl, resourceMode ? labels.resources : '', { y: headHeight / 2 + 4, size: 10, weight: 700, fill: theme.muted, inset: 6 })
  columns.forEach((column, index) => {
    const box = { x: columnX(index), y: top, width: columnWidth, height: headHeight }
    const today = !resourceMode && isToday(now, column.day)
    out += boxText(box, rtl, column.label, { y: column.detail ? 19 : 22, size: 12, weight: 700, fill: today ? theme.accent : theme.text, inset: 8 })
    if (column.detail) out += boxText(box, rtl, column.detail, { y: 34, size: 10, fill: theme.muted, inset: 8 })
    out += tag('line', { x1: box.x, y1: top, x2: box.x, y2: top + headHeight, stroke: theme.border })
  })
  out += tag('line', { x1: 0, y1: top + headHeight - 0.5, x2: width, y2: top + headHeight - 0.5, stroke: theme.border })

  // The all-day row: per column in resource mode, else over all columns.
  const allDayTop = top + headHeight
  const allDayEvents = frame.events.filter(inAllDayRow)
  const rows = resourceMode
    ? columns.map((column, index) => ({ offset: index, events: allDayEvents.filter(event => inColumn(event, column.resourceId)), days: [column.day] }))
    : [{ offset: 0, events: allDayEvents, days: columns.map(column => column.day) }]
  const packed = rows.map(row => ({ ...row, layout: packCalendarEventLanes(row.events, row.days) }))
  const lanes = Math.max(0, ...packed.map(row => row.layout.lanes))
  const allDayHeight = Math.max(1, lanes) * laneHeight + lanePadding
  out += boxText({ x: gutterX, y: allDayTop, width: gutter, height: allDayHeight }, rtl, labels.allDay, { y: 15, size: 10, weight: 700, fill: theme.muted, inset: 6 })
  columns.forEach((_, index) => {
    const x = columnX(index)
    out += tag('line', { x1: x, y1: allDayTop, x2: x, y2: allDayTop + allDayHeight, stroke: theme.border })
  })
  for (const row of packed) {
    const byId = new Map(row.events.map(event => [event.id, event]))
    for (const segment of row.layout.segments) {
      const event = byId.get(segment.id)!
      const start = segment.startIndex + row.offset, end = segment.endIndex + row.offset
      const box = { x: spanX(start, end) + 2, y: allDayTop + segment.lane * laneHeight, width: (end - start) * columnWidth - 4, height: 20 }
      out += eventBox(event, box, [{ text: frame.eventLabel(event), y: 14, size: 11, weight: 650 }], frame)
    }
  }
  out += tag('line', { x1: 0, y1: allDayTop + allDayHeight - 1, x2: width, y2: allDayTop + allDayHeight - 1, stroke: theme.border, 'stroke-width': 2 })

  // The time grid: today's background, hour lines and labels, then the timed events and the now line.
  const bodyTop = allDayTop + allDayHeight
  const hours = frame.dayEnd - frame.dayStart
  const bodyHeight = hours * frame.hourHeight
  const visibleStart = frame.dayStart * hour
  const pxOf = (offset: number) => (offset - visibleStart) / hour * frame.hourHeight
  const timeOfDay = (day: number, time: number) => eventCalendarTimeOfDay(day, time, frame.zone)
  columns.forEach((column, index) => {
    if (!resourceMode && isToday(now, column.day)) {
      out += tag('rect', { x: columnX(index), y: bodyTop, width: columnWidth, height: bodyHeight, fill: theme.surfaceMuted })
    }
  })
  const hourLabel = cachedDateFormat(frame.locale, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'UTC' })
  for (let index = 0; index < hours; index++) {
    const y = bodyTop + index * frame.hourHeight
    out += tag('line', { x1: rtl ? 0 : gutter, y1: y, x2: rtl ? width - gutter : width, y2: y, stroke: theme.grid })
    out += boxText({ x: gutterX, y: y - (index ? 8 : 0), width: gutter, height: 16 }, rtl, hourLabel.format((frame.dayStart + index) * hour), {
      y: index ? 12 : 10, size: 10, fill: theme.muted, inset: 6, align: 'end',
    })
  }
  columns.forEach((_, index) => {
    const x = columnX(index)
    out += tag('line', { x1: x, y1: bodyTop, x2: x, y2: bodyTop + bodyHeight, stroke: theme.border })
  })
  const timed = frame.events.filter(event => !inAllDayRow(event))
  const minDuration = minEventHeight / frame.hourHeight * hour
  columns.forEach((column, index) => {
    const events = timed.filter(event => inColumn(event, column.resourceId))
    const byId = new Map(events.map(event => [event.id, event]))
    for (const placed of layoutCalendarDayEvents(events, column.day, { minDuration })) {
      const event = byId.get(placed.id)!
      const top = pxOf(timeOfDay(column.day.start, placed.start))
      const bottom = Math.max(pxOf(timeOfDay(column.day.start, placed.end)), top + minEventHeight)
      if (bottom <= 0 || top >= bodyHeight) continue
      const clippedTop = Math.max(0, top), clippedBottom = Math.min(bodyHeight, bottom)
      const height = Math.max(minEventHeight, clippedBottom - clippedTop)
      const boxWidth = columnWidth / placed.columns - 3
      const inset = placed.column / placed.columns * columnWidth + 1
      const x = rtl ? columnX(index) + columnWidth - inset - boxWidth : columnX(index) + inset
      const time = `${frame.timeText(event.start)}–${frame.timeText(event.end)}`
      const label = frame.eventLabel(event)
      const lines = height < 34
        ? [{ text: `${time} ${label}`, y: height / 2 + 4, size: 11, weight: 650 }]
        : [{ text: time, y: 13, size: 10.5 }, { text: label, y: 27, size: 11, weight: 650 }]
      out += eventBox(event, { x, y: bodyTop + clippedTop, width: boxWidth, height }, lines, frame)
    }
  })
  if (now !== undefined) {
    const index = columns.findIndex(column => isToday(now, column.day))
    if (index >= 0) {
      const y = pxOf(timeOfDay(columns[index]!.day.start, now))
      if (y >= 0 && y <= bodyHeight) {
        const from = resourceMode ? 0 : index, to = resourceMode ? count : index + 1
        const x = spanX(from, to), lineWidth = (to - from) * columnWidth
        out += tag('g', { class: 'vw-calendar-now' }, titleTag(`${labels.now} ${frame.timeText(now)}`)
          + tag('line', { x1: x, y1: bodyTop + y, x2: x + lineWidth, y2: bodyTop + y, stroke: theme.now, 'stroke-width': 2 })
          + tag('circle', { cx: rtl ? x + lineWidth : x, cy: bodyTop + y, r: 4, fill: theme.now }))
      }
    }
  }
  return { height: bodyTop + bodyHeight - top, body: out }
}

/** The month view: weekday names, then per week the day cells, the event lanes and "+N more". */
const monthGrid: ViewRenderer = frame => {
  const { theme, rtl, days, width, top, now, labels } = frame
  const columnWidth = width / 7
  const columnX = (index: number) => rtl ? width - (index + 1) * columnWidth : index * columnWidth
  const weekdayName = cachedDateFormat(frame.locale, { weekday: 'short', timeZone: frame.zone.timeZone })
  let out = tag('rect', { x: 0, y: top, width, height: 26, fill: theme.surfaceMuted })
  days.slice(0, 7).forEach((day, index) => {
    const name = weekdayName.format(day.start).toLocaleUpperCase(frame.locale as string | string[])
    out += boxText({ x: columnX(index), y: top, width: columnWidth, height: 26 }, rtl, name, { y: 17, size: 10, weight: 700, fill: theme.muted, inset: 8 })
  })
  out += tag('line', { x1: 0, y1: top + 25.5, x2: width, y2: top + 25.5, stroke: theme.border })
  const rowHeight = monthHeader + frame.maxMonthLanes * laneHeight + lanePadding
  let y = top + 26
  for (let from = 0; from < days.length; from += 7) {
    const week = days.slice(from, from + 7)
    const packed = packCalendarEventLanes(frame.events, week)
    const shown = packed.lanes > frame.maxMonthLanes ? frame.maxMonthLanes - 1 : frame.maxMonthLanes
    const hidden = week.map(() => 0)
    for (const segment of packed.segments) {
      if (segment.lane < shown) continue
      for (let index = segment.startIndex; index < segment.endIndex; index++) hidden[index]!++
    }
    week.forEach((day, index) => {
      const x = columnX(index)
      const today = isToday(now, day)
      if (!day.inMonth) out += tag('rect', { x, y, width: columnWidth, height: rowHeight, fill: theme.surfaceMuted })
      if (index) out += tag('line', { x1: rtl ? x + columnWidth : x, y1: y, x2: rtl ? x + columnWidth : x, y2: y + rowHeight, stroke: theme.border })
      const number = String(day.day)
      const pill = Math.max(22, estimateTextWidth(number, 11) + 8)
      const pillX = rtl ? x + columnWidth - 4 - pill : x + 4
      if (today) out += tag('rect', { x: pillX, y: y + 3, width: pill, height: 20, rx: 10, fill: theme.accent })
      out += tag('text', {
        x: pillX + pill / 2, y: y + 17, 'text-anchor': 'middle', 'font-size': 11, 'font-weight': 700,
        fill: today ? theme.onSolid : day.inMonth ? theme.text : theme.muted,
      }, number)
      if (hidden[index]) {
        out += boxText({ x, y, width: columnWidth, height: rowHeight }, rtl, `+${hidden[index]} ${labels.more}`, {
          y: rowHeight - 6, size: 10, weight: 700, fill: theme.accent, inset: 8,
        })
      }
    })
    const byId = new Map(frame.events.map(event => [event.id, event]))
    for (const segment of packed.segments) {
      if (segment.lane >= shown) continue
      const event = byId.get(segment.id)!
      const x = rtl ? columnX(segment.endIndex - 1) : columnX(segment.startIndex)
      const box = { x: x + 2, y: y + monthHeader + segment.lane * laneHeight, width: (segment.endIndex - segment.startIndex) * columnWidth - 4, height: 20 }
      const timed = !inAllDayRow(event)
      const text = timed ? `${frame.timeText(event.start)} ${frame.eventLabel(event)}` : frame.eventLabel(event)
      out += eventBox(event, box, [{ text, y: 14, size: 11, weight: 650 }], frame, timed)
    }
    y += rowHeight
    out += tag('line', { x1: 0, y1: y - 0.5, x2: width, y2: y - 0.5, stroke: theme.border })
  }
  return { height: y - top, body: out }
}

/**
 * The renderer of each view the export supports. A new view adds its renderer here. Keep this a plain object literal:
 * a module-level call such as `Object.freeze(...)` counts as a side effect for bundlers and would keep every renderer
 * (and what they import) in bundles that never call `renderEventCalendarSvg`. The table is module-private, so nothing
 * can change it.
 */
const viewRenderers: Readonly<Partial<Record<string, ViewRenderer>>> = { day: timeGrid, week: timeGrid, month: monthGrid }

/** The title of the EventCalendar toolbar for a view. */
function viewTitle(view: EventCalendarView, date: number, days: EventCalendarDay[], locale: string | readonly string[], timeZone: string) {
  const format = (options: Intl.DateTimeFormatOptions) => cachedDateFormat(locale, { ...options, timeZone })
  if (view === 'day') return format({ weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }).format(days[0]!.start)
  if (view === 'month') return format({ year: 'numeric', month: 'long' }).format(date)
  return format({ year: 'numeric', month: 'short', day: 'numeric' }).formatRange(days[0]!.start, days[days.length - 1]!.start)
}

/**
 * Build a standalone SVG document of one view of an event calendar with the default EventCalendar rendering: for `day`
 * and `week`, the column headers (one per resource in the day view with `resources`), the all-day row and the whole
 * time grid from `dayStart` to `dayEnd` with the timed events side by side and the now line; for `month`, the weekday
 * names and the weeks with their event lanes and "+N more". Events are placed with `layoutCalendarDayEvents` and
 * `packCalendarEventLanes`, so they sit where the component draws them. Pass concrete events: expand recurring series with
 * `expandRecurringEvents` first. Validates like EventCalendar (`validateCalendarEvents` and the view options) and throws a
 * RangeError for a view it does not export. Runs without a DOM.
 */
export function renderEventCalendarSvg<E extends CalendarEvent>(events: readonly E[], date: number, options: EventCalendarSvgOptions<E> = {}): string {
  const view = options.view ?? 'week'
  const renderer = Object.hasOwn(viewRenderers, view) ? viewRenderers[view] : undefined
  if (!renderer) throw new RangeError('Unsupported event calendar export view: ' + String(view))
  validateCalendarEvents(events, options.resources)
  if (typeof date !== 'number' || !Number.isFinite(date)) throw new RangeError('date must be finite')
  const { theme, rtl, font, background } = common(options)
  const { timeZone = 'UTC', weekStartsOn = 1, dayStart = 0, dayEnd = 24, maxMonthLanes = 3, locale = 'en-US' } = options
  zoneFormat(timeZone)
  if (!Number.isInteger(dayStart) || !Number.isInteger(dayEnd) || dayStart < 0 || dayEnd > 24 || dayStart >= dayEnd) {
    throw new RangeError('dayStart and dayEnd must be integers with 0 <= dayStart < dayEnd <= 24')
  }
  if (!Number.isInteger(maxMonthLanes) || maxMonthLanes < 1) throw new RangeError('maxMonthLanes must be an integer >= 1')
  if (options.now !== undefined && (typeof options.now !== 'number' || !Number.isFinite(options.now))) throw new RangeError('now must be finite')
  try {
    cachedDateFormat(locale, { timeZone: 'UTC' })
  } catch {
    throw new RangeError('Invalid locale: ' + String(locale))
  }
  const hourHeight = sizeOption(options.hourHeight, 'hourHeight', 48)
  const width = sizeOption(options.width, 'width', 896)
  if (options.heading !== undefined && options.heading !== false && typeof options.heading !== 'string') throw new TypeError('heading must be a string or false')
  const labels = { ...defaultLabels }
  for (const key of Object.keys(defaultLabels) as (keyof EventCalendarSvgLabels)[]) labels[key] = textOption(options.labels?.[key], 'labels.' + key, defaultLabels[key])

  const zone = { timeZone, weekStartsOn }
  const days = eventCalendarDays(view, date, zone)
  const heading = options.heading === false ? '' : options.heading ?? viewTitle(view, date, days, locale, timeZone)
  const top = heading ? 36 : 0
  const frame: CalendarFrame<E> = {
    events, view, date, days, zone, resources: options.resources, theme, rtl, width, top, dayStart, dayEnd, hourHeight, maxMonthLanes,
    now: options.now, selectedId: options.selectedId, labels, locale,
    timeText: options.formatTime ?? intlTimeFormatter({ locale, timeZone }),
    shortDate: cachedDateFormat(locale, { weekday: 'short', month: 'short', day: 'numeric', timeZone }),
    eventLabel: options.eventLabel ?? (event => event.label),
  }
  const drawn = renderer(frame)
  const height = top + drawn.height
  let out = background ? tag('rect', { width, height, fill: theme.surface }) : ''
  if (heading) out += boxText({ x: 0, y: 0, width, height: top }, rtl, heading, { y: 23, size: 14, weight: 700, fill: theme.text, inset: 10 })
  out += drawn.body
  return svgDocument(width, height, options, font, '', out)
}
