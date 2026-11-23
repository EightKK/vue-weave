<script setup lang="ts" generic="E extends CalendarEvent = CalendarEvent">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, useId, watch } from 'vue'
import {
  eventCalendarDays, eventCalendarRange, eventCalendarTimeAt, eventCalendarTimeOfDay, layoutCalendarDayEvents, packCalendarEventLanes,
  shiftEventCalendarDate, validateCalendarEvents, type CalendarEvent, type EventCalendarBackgroundClick, type CalendarResource, type EventCalendarCreate,
  type EventCalendarCreateValidator, type EventCalendarDay, type EventCalendarEdit, type EventCalendarEditCancel,
  type EventCalendarEditCancelReason, type EventCalendarEditValidator, type EventCalendarLabels, type EventCalendarView,
} from '../core/eventCalendar.js'
import { intlTimeFormatter } from '../core/calendarFormat.js'
import { cachedDateFormat, zoneFormat } from '../core/timeZone.js'
import type { TimeRange } from '../core/timeline.js'
import type { ChartDirection } from '../core/types.js'
import { elementWithData, usePendingFocus } from './shared/focus.js'
import { capturePointer, edgeScroller, pastThreshold, releasePointer } from './shared/pointer.js'
import { rejectionReason, useValidatedSource } from './shared/validation.js'

const minute = 60_000
const hour = 3_600_000
const dayMs = 86_400_000
/** Smallest drawn height of a timed event in pixels. */
const minEventHeight = 18
/** Height of an event lane in the all-day row and the month view, and of a month day's header, in pixels. */
const laneHeight = 22
/** Space below the last event lane of the all-day row and of a month week, in pixels. */
const lanePadding = 6
const monthHeader = 26
/** Time in milliseconds a drag must rest near the top or bottom of the time grid before it scrolls. */
const edgeScrollDelay = 250

const props = withDefaults(defineProps<{
  /** Events by ID with a half-open `[start, end)` interval in epoch milliseconds. Required. */
  events: readonly E[]
  /** Anchor date of the view (epoch milliseconds); the view shows its day, week or month. Supports `v-model:date`. Required. */
  date: number
  /** `day`, `week` or `month`. Supports `v-model:view`. Default `week`. */
  view?: EventCalendarView
  /** First day of a week, 0 = Sunday to 6 = Saturday. Default 1 (Monday). */
  weekStartsOn?: number
  /** IANA time zone of the days, hours and labels. Default `UTC`. */
  timeZone?: string
  /** BCP 47 locale of the labels. Default `en-US` (never the runtime's default locale). */
  locale?: string | readonly string[]
  /** First and last-plus-one visible hour of the day and week time grid, integers from 0 to 24. Defaults 0 and 24. */
  dayStart?: number
  dayEnd?: number
  /** Height of one hour of the time grid in pixels. Default 48. */
  hourHeight?: number
  /** Height of the scrolling time grid, in pixels or a CSS length. Default 480. */
  height?: number | string
  /** Step of pointer and keyboard edits of timed events, in minutes. Default 15. */
  snap?: number
  /** Duration of an event created by a click without a drag, in minutes. Default 4 × snap. */
  createDuration?: number
  /** Resources; the day view shows one column per resource and drags between them propose a resource change. */
  resources?: readonly CalendarResource[]
  /** Disables editing and creating. */
  readonly?: boolean
  /** A drag (or click) on an empty part of a day proposes a new event through `create`. Default false. */
  creatable?: boolean
  /** Synchronous check of an `edit` proposal. */
  validateEdit?: EventCalendarEditValidator
  /** Synchronous check of a `create` proposal. */
  validateCreate?: EventCalendarCreateValidator
  /** The selected event. Supports `v-model:selected-id`. */
  selectedId?: string
  /** Localizable texts; see `EventCalendarLabels`. */
  labels?: Partial<EventCalendarLabels>
  /** Shows the built-in toolbar (previous, today, next, title and view switch). Default true. */
  showToolbar?: boolean
  /** Current time for the now line and the Today button. Without it, neither is drawn and Today is disabled. */
  now?: number
  /** Formats times of day in labels. Default `intlTimeFormatter({ locale, timeZone })` (`09:00`). */
  formatTime?: (time: number) => string
  /** Lanes of events shown per week of the month view before a "+N more" button. Default 3. */
  maxMonthLanes?: number
  /** Text direction: `ltr`, `rtl` or `auto`. Default `ltr`. */
  dir?: ChartDirection
}>(), {
  view: undefined,
  weekStartsOn: 1,
  timeZone: 'UTC',
  locale: 'en-US',
  dayStart: 0,
  dayEnd: 24,
  hourHeight: 48,
  height: 480,
  snap: 15,
  showToolbar: true,
  maxMonthLanes: 3,
  dir: 'ltr',
})

const emit = defineEmits<{
  /** Navigation by the toolbar or a month day button; supports `v-model:date`. */
  'update:date': [date: number]
  /** The view switch or a month day button; supports `v-model:view`. */
  'update:view': [view: EventCalendarView]
  /** The visible range changed (and once after mounting): load the events that overlap it. */
  'range-change': [range: TimeRange, view: EventCalendarView]
  /** An event was selected by click, Enter or Space. */
  select: [id: string]
  /** The selected event changed; supports `v-model:selected-id`. */
  'update:selectedId': [id: string]
  /** An event was opened by double click or Enter. */
  'event-activate': [id: string, source: 'pointer' | 'keyboard']
  /** Proposal to move or resize an event, or to move it to another resource. The parent applies it. */
  edit: [change: EventCalendarEdit]
  /** An edit was rejected by `validateEdit`. */
  'edit-rejected': [change: EventCalendarEdit, reason: string]
  /** Proposal to add an event over an empty range. The parent assigns an ID and adds it. */
  create: [proposal: EventCalendarCreate]
  /** A new event was rejected by `validateCreate`. */
  'create-rejected': [proposal: EventCalendarCreate, reason: string]
  /** An in-flight pointer gesture was cancelled. */
  'edit-cancel': [event: EventCalendarEditCancel]
  /**
   * A primary click landed on empty calendar space (a time grid column, an all-day cell or a month day, not an event,
   * button or header), the pointer did not move past the drag threshold and the press proposed no `create`. Carries the
   * time and day at the pointer. Use it to clear the selection.
   */
  'background-click': [event: EventCalendarBackgroundClick]
  /** Invalid events, resources or props; the calendar then shows its empty state. */
  'validation-error': [error: Error]
}>()

defineSlots<{
  /** Content of an event button. Use non-interactive content. */
  event(props: { event: E; range: TimeRange; selected: boolean; allDay: boolean; view: EventCalendarView }): unknown
  /** Replaces the content of the toolbar. */
  toolbar(props: {
    title: string; view: EventCalendarView; date: number
    previous: () => void; next: () => void; today: () => void; setView: (view: EventCalendarView) => void
  }): unknown
  empty(): unknown
}>()

const messages = computed<EventCalendarLabels>(() => ({
  region: 'Event calendar', previous: 'Previous', today: 'Today', next: 'Next', views: 'Calendar view',
  day: 'Day', week: 'Week', month: 'Month', allDay: 'All day', more: 'more', showDay: 'Show day',
  editHint: 'Up and Down arrows move the event, Shift resizes its end. Left and Right move it to another day or resource. Escape cancels a drag.',
  dayEditHint: 'Left and Right arrows move the event by a day, Shift resizes its end. Escape cancels a drag.',
  // A localized `dayEditHint` without `monthEditHint` keeps the month view localized.
  monthEditHint: props.labels?.dayEditHint ?? 'Left and Right arrows move the event by a day, Up and Down by a week, and Shift with Left or Right resizes the end of an all-day event. Escape cancels a drag.',
  rejected: 'This change was rejected.', createRejected: 'This new event was rejected.',
  resources: 'Resources', now: 'Now', empty: 'No events to display', recurring: 'Recurring',
  ...props.labels,
}))

// View, date and selection are controlled but keep local state, so a calendar without v-model still navigates.
const localView = ref<EventCalendarView>(props.view ?? 'week')
const localDate = ref(props.date)
const localSelected = ref(props.selectedId)
watch(() => props.view, view => { if (view !== undefined) localView.value = view })
watch(() => props.date, date => { localDate.value = date })
watch(() => props.selectedId, id => { localSelected.value = id })
const view = computed(() => localView.value)

const uid = useId()
const notice = ref('')
const root = ref<HTMLElement>()
const scroller = ref<HTMLElement>()

function checkProps() {
  validateCalendarEvents(props.events, props.resources)
  if (!['day', 'week', 'month'].includes(view.value)) throw new RangeError('Unknown event calendar view: ' + String(view.value))
  if (typeof localDate.value !== 'number' || !Number.isFinite(localDate.value)) throw new RangeError('date must be finite')
  if (!Number.isInteger(props.weekStartsOn) || props.weekStartsOn < 0 || props.weekStartsOn > 6) throw new RangeError('weekStartsOn must be 0 to 6')
  zoneFormat(props.timeZone)
  if (!Number.isInteger(props.dayStart) || !Number.isInteger(props.dayEnd) || props.dayStart < 0 || props.dayEnd > 24 || props.dayStart >= props.dayEnd) {
    throw new RangeError('dayStart and dayEnd must be integers with 0 <= dayStart < dayEnd <= 24')
  }
  if (!Number.isFinite(props.hourHeight) || props.hourHeight <= 0) throw new RangeError('hourHeight must be finite and positive')
  if (!Number.isFinite(props.snap) || props.snap <= 0) throw new RangeError('snap must be finite and positive')
  if (props.createDuration !== undefined && (!Number.isFinite(props.createDuration) || props.createDuration <= 0)) {
    throw new RangeError('createDuration must be finite and positive')
  }
  if (!Number.isInteger(props.maxMonthLanes) || props.maxMonthLanes < 1) throw new RangeError('maxMonthLanes must be an integer >= 1')
  if (props.now !== undefined && !Number.isFinite(props.now)) throw new RangeError('now must be finite')
  try {
    cachedDateFormat(props.locale, { timeZone: 'UTC' })
  } catch {
    throw new RangeError('Invalid locale: ' + String(props.locale))
  }
  const height = props.height
  if (typeof height === 'number' ? !Number.isFinite(height) || height < 0 : typeof height !== 'string') {
    throw new RangeError('height must be a finite non-negative number of pixels or a CSS length')
  }
  if (!['ltr', 'rtl', 'auto'].includes(props.dir)) throw new RangeError('dir must be ltr, rtl or auto: ' + String(props.dir))
}
// Invalid input is reported through `validation-error` and never rendered; the error is rethrown like GanttChart does.
const { error: validationError } = useValidatedSource([
  () => props.events, () => props.resources, view, localDate, () => props.weekStartsOn, () => props.timeZone, () => props.dayStart,
  () => props.dayEnd, () => props.hourHeight, () => props.snap, () => props.createDuration, () => props.maxMonthLanes, () => props.now,
  // By value, so a locale array written inline does not validate again on every render of the parent.
  () => JSON.stringify(props.locale), () => props.height, () => props.dir,
], checkProps, { report: error => emit('validation-error', error), fallback: undefined })
const valid = computed(() => validationError.value === undefined)

const options = computed(() => ({ timeZone: props.timeZone, weekStartsOn: props.weekStartsOn }))
const snapMs = computed(() => props.snap * minute)
const createMs = computed(() => (props.createDuration ?? 4 * props.snap) * minute)
const rangeOf = (event: E): TimeRange => ({ start: event.start, end: event.end })
const editable = (event: E) => !props.readonly && event.editable !== false
const isOccurrence = (event: E) => event.seriesId !== undefined && event.recurrenceId !== undefined
const inAllDayRow = (event: E) => Boolean(event.allDay) || event.end - event.start >= dayMs
const addDays = (time: number, days: number) => shiftEventCalendarDate('day', time, days, options.value)
const timeOfDay = (day: number, time: number) => eventCalendarTimeOfDay(day, time, options.value)
const timeAt = (day: number, offset: number) => eventCalendarTimeAt(day, offset, options.value)

// Labels -----------------------------------------------------------------------------------------------------------
const timeText = computed(() => props.formatTime ?? intlTimeFormatter({ locale: props.locale, timeZone: props.timeZone }))
const dateFormat = (format: Intl.DateTimeFormatOptions) => cachedDateFormat(props.locale, { ...format, timeZone: props.timeZone })
const shortDate = computed(() => dateFormat({ weekday: 'short', month: 'short', day: 'numeric' }))
const longDate = computed(() => dateFormat({ weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }))
const weekdayName = computed(() => dateFormat({ weekday: 'short' }))
const hourLabel = computed(() => cachedDateFormat(props.locale, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'UTC' }))
const resourceById = computed(() => new Map((props.resources ?? []).map(resource => [resource.id, resource])))

const visibleDays = computed<EventCalendarDay[]>(() => valid.value ? eventCalendarDays(view.value, localDate.value, options.value) : [])
const visibleRange = computed<TimeRange | undefined>(() => valid.value ? eventCalendarRange(view.value, localDate.value, options.value) : undefined)
const title = computed(() => {
  const days = visibleDays.value
  if (!days.length) return ''
  if (view.value === 'day') return longDate.value.format(days[0]!.start)
  if (view.value === 'month') return dateFormat({ year: 'numeric', month: 'long' }).format(localDate.value)
  return dateFormat({ year: 'numeric', month: 'short', day: 'numeric' }).formatRange(days[0]!.start, days[days.length - 1]!.start)
})

function eventName(event: E) {
  const parts = [event.label]
  if (event.allDay) {
    const last = Math.max(event.start, event.end - 1)
    const first = shortDate.value.format(event.start), final = shortDate.value.format(last)
    parts.push(first === final ? first : `${first} – ${final}`, messages.value.allDay)
  } else {
    const sameDay = shortDate.value.format(event.start) === shortDate.value.format(Math.max(event.start, event.end - 1))
    parts.push(sameDay
      ? `${shortDate.value.format(event.start)} ${timeText.value(event.start)}–${timeText.value(event.end)}`
      : `${shortDate.value.format(event.start)} ${timeText.value(event.start)} – ${shortDate.value.format(event.end)} ${timeText.value(event.end)}`)
  }
  const resource = event.resourceId === undefined ? undefined : resourceById.value.get(event.resourceId)
  if (resource) parts.push(resource.label)
  if (isOccurrence(event) && messages.value.recurring) parts.push(messages.value.recurring)
  return parts.join(', ')
}

// Columns of the day and week time grid ----------------------------------------------------------------------------
interface GridColumn { key: string; day: EventCalendarDay; resourceId?: string; label: string; detail?: string }
const resourceMode = computed(() => view.value === 'day' && Boolean(props.resources?.length))
const columns = computed<GridColumn[]>(() => {
  if (view.value === 'month' || !visibleDays.value.length) return []
  const day = visibleDays.value[0]!
  if (resourceMode.value) return props.resources!.map(resource => ({ key: resource.id, day, resourceId: resource.id, label: resource.label, detail: resource.detail }))
  return visibleDays.value.map(entry => ({ key: String(entry.start), day: entry, label: shortDate.value.format(entry.start) }))
})
const inColumn = (event: E, column: GridColumn) => column.resourceId === undefined || event.resourceId === column.resourceId
const gridStyle = computed(() => ({ gridTemplateColumns: `var(--vw-calendar-gutter, 56px) repeat(${Math.max(1, columns.value.length)}, minmax(0, 1fr))` }))
const visibleStart = computed(() => props.dayStart * hour)
const bodyHeight = computed(() => (props.dayEnd - props.dayStart) * props.hourHeight)
const hours = computed(() => Array.from({ length: props.dayEnd - props.dayStart }, (_, index) => {
  const offset = (props.dayStart + index) * hour
  return { key: offset, top: index * props.hourHeight, label: hourText(offset) }
}))
/**
 * The label of an hour of the gutter. With `formatTime`, that hour on the first column's day, so the gutter reads like
 * the event times (for example in 12-hour clocks); an hour skipped by a daylight-saving change falls back to `HH:mm`.
 */
function hourText(offset: number) {
  const day = columns.value[0]?.day
  if (props.formatTime && day) {
    const time = timeAt(day.start, offset)
    if (timeOfDay(day.start, time) === offset) return props.formatTime(time)
  }
  return hourLabel.value.format(offset)
}
const pxOf = (offset: number) => (offset - visibleStart.value) / hour * props.hourHeight
const isToday = (day: TimeRange) => props.now !== undefined && props.now >= day.start && props.now < day.end
const scrollHeight = computed(() => typeof props.height === 'number' ? props.height + 'px' : props.height)

interface TimedBox {
  key: string; event: E; style: Record<string, string>; primary: boolean; continuesBefore: boolean; continuesAfter: boolean
  /** Too short for two lines: the time and label share one line. */
  short: boolean
}
/**
 * Give the Tab stop of each event to its first drawn element (in document order), so an event that started before the
 * visible range, or whose first segment is hidden, is still reachable by Tab.
 */
function markPrimary<T extends { event: E; primary: boolean }>(items: Iterable<T>) {
  const seen = new Set<string>()
  for (const item of items) {
    item.primary = !seen.has(item.event.id)
    seen.add(item.event.id)
  }
}
const timedBoxes = computed<TimedBox[][]>(() => markedColumns(columns.value.map(column => {
  const events = props.events.filter(event => !inAllDayRow(event) && inColumn(event, column))
  const byId = new Map(events.map(event => [event.id, event]))
  const minDuration = minEventHeight / props.hourHeight * hour
  return layoutCalendarDayEvents(events, column.day, { minDuration }).flatMap(placed => {
    const event = byId.get(placed.id)!
    const top = pxOf(timeOfDay(column.day.start, placed.start))
    const bottom = Math.max(pxOf(timeOfDay(column.day.start, placed.end)), top + minEventHeight)
    if (bottom <= 0 || top >= bodyHeight.value) return []
    const clippedTop = Math.max(0, top), clippedBottom = Math.min(bodyHeight.value, bottom)
    const height = Math.max(minEventHeight, clippedBottom - clippedTop)
    return [{
      short: height < 34,
      // `primary` is assigned by markPrimary over all columns.
      key: column.key + ':' + event.id, event, primary: false,
      continuesBefore: event.start < column.day.start, continuesAfter: event.end > column.day.end,
      style: {
        top: clippedTop + 'px', height: height + 'px',
        insetInlineStart: `calc(${placed.column / placed.columns * 100}% + 1px)`, width: `calc(${100 / placed.columns}% - 3px)`,
        ...colorStyle(event),
      },
    }]
  })
})))
function markedColumns(boxes: TimedBox[][]) {
  markPrimary(boxes.flat())
  return boxes
}
const nowLine = computed(() => {
  if (props.now === undefined) return undefined
  const index = columns.value.findIndex(column => isToday(column.day))
  if (index < 0) return undefined
  const top = pxOf(timeOfDay(columns.value[index]!.day.start, props.now))
  if (top < 0 || top > bodyHeight.value) return undefined
  return { top, label: `${messages.value.now} ${timeText.value(props.now)}`, all: resourceMode.value, index }
})

function colorStyle(event: E): Record<string, string> {
  return event.color ? { '--vw-calendar-event-accent': event.color } : {}
}

// Rows of days: the all-day row of the day and week views and the weeks of the month view ----------------------------
/** The cells of the all-day row (one per column) or of the month grid; the index of a cell is its position here. */
interface DayCell { day: EventCalendarDay; resourceId?: string }
const dayCells = computed<DayCell[]>(() => view.value === 'month'
  ? visibleDays.value.map(day => ({ day }))
  : columns.value.map(column => ({ day: column.day, resourceId: column.resourceId })))

interface DaySegment {
  key: string; event: E; lane: number; startIndex: number; endIndex: number; primary: boolean
  continuesBefore: boolean; continuesAfter: boolean; style: Record<string, string>
}
/** Pack `events` over the cells `[from, from + count)`, positioned within a row of `count` cells. */
function packRow(events: readonly E[], from: number, count: number, offset = 0, total = count) {
  const cells = dayCells.value.slice(from, from + count)
  const byId = new Map(events.map(event => [event.id, event]))
  const packed = packCalendarEventLanes(events, cells.map(cell => cell.day))
  return {
    lanes: packed.lanes,
    segments: packed.segments.map<DaySegment>(segment => ({
      key: `${from + offset}:${segment.id}`, event: byId.get(segment.id)!, lane: segment.lane,
      startIndex: from + segment.startIndex + offset, endIndex: from + segment.endIndex + offset,
      // `primary` is assigned by markPrimary over the whole row or grid.
      primary: false, continuesBefore: segment.continuesBefore, continuesAfter: segment.continuesAfter,
      style: {
        insetInlineStart: `calc(${(segment.startIndex + offset) / total * 100}% + 2px)`,
        width: `calc(${(segment.endIndex - segment.startIndex) / total * 100}% - 4px)`,
        top: segment.lane * laneHeight + 'px', ...colorStyle(byId.get(segment.id)!),
      },
    })),
  }
}
const allDayRow = computed(() => {
  if (view.value === 'month' || !columns.value.length) return { lanes: 0, segments: [] as DaySegment[] }
  const events = props.events.filter(inAllDayRow)
  if (!resourceMode.value) {
    const row = packRow(events, 0, columns.value.length)
    markPrimary(row.segments)
    return row
  }
  const total = columns.value.length
  const rows = columns.value.map((column, index) => packRow(events.filter(event => inColumn(event, column)), 0, 1, index, total))
  // packRow slices from the start of dayCells; in resource mode every column shows the same day, so `from` stays 0.
  const segments = rows.flatMap(row => row.segments)
  markPrimary(segments)
  return { lanes: Math.max(0, ...rows.map(row => row.lanes)), segments }
})

interface MonthWeek { key: string; days: { day: EventCalendarDay; index: number; hidden: number }[]; segments: DaySegment[] }
const monthWeeks = computed<MonthWeek[]>(() => {
  if (view.value !== 'month') return []
  const weeks: MonthWeek[] = []
  for (let from = 0; from < dayCells.value.length; from += 7) {
    const row = packRow(props.events, from, 7)
    const shown = row.lanes > props.maxMonthLanes ? props.maxMonthLanes - 1 : props.maxMonthLanes
    const hidden = Array.from({ length: 7 }, () => 0)
    for (const segment of row.segments) {
      if (segment.lane < shown) continue
      for (let index = segment.startIndex; index < segment.endIndex; index++) hidden[index - from]!++
    }
    weeks.push({
      key: String(dayCells.value[from]!.day.start),
      days: dayCells.value.slice(from, from + 7).map((cell, offset) => ({ day: cell.day, index: from + offset, hidden: hidden[offset]! })),
      segments: row.segments.filter(segment => segment.lane < shown),
    })
  }
  markPrimary(weeks.flatMap(week => week.segments))
  return weeks
})
const monthRowHeight = computed(() => monthHeader + props.maxMonthLanes * laneHeight + lanePadding)
const allDayHeight = computed(() => Math.max(1, allDayRow.value.lanes) * laneHeight + lanePadding)
const weekdayNames = computed(() => visibleDays.value.slice(0, 7).map(day => ({ key: day.weekday, label: weekdayName.value.format(day.start) })))

// Navigation ---------------------------------------------------------------------------------------------------------
function setDate(date: number) {
  if (date === localDate.value) return
  localDate.value = date
  emit('update:date', date)
}
function setView(next: EventCalendarView) {
  if (next === view.value) return
  localView.value = next
  emit('update:view', next)
}
const previous = () => setDate(shiftEventCalendarDate(view.value, localDate.value, -1, options.value))
const next = () => setDate(shiftEventCalendarDate(view.value, localDate.value, 1, options.value))
const today = () => { if (props.now !== undefined) setDate(props.now) }
function openDay(day: EventCalendarDay) {
  setDate(day.start)
  setView('day')
}
const viewNames = computed(() => (['day', 'week', 'month'] as const).map(id => ({ id, label: messages.value[id] })))
const toolbarProps = computed(() => ({ title: title.value, view: view.value, date: localDate.value, previous, next, today, setView }))
// The title is announced after navigation, so screen reader users hear where they are.
watch(title, (text, before) => { if (before && text !== before) notice.value = text })
let mounted = false
let lastRange: string | undefined
function reportRange() {
  const range = visibleRange.value
  if (!mounted || !range) return
  const key = `${view.value}:${range.start}:${range.end}`
  if (key === lastRange) return
  lastRange = key
  emit('range-change', { start: range.start, end: range.end }, view.value)
}
watch(visibleRange, reportRange)
// The header rows leave room for the scrollbar of the time grid, so their columns line up with the grid's.
const scrollbarWidth = ref(0)
function measureScrollbar() {
  const element = scroller.value
  scrollbarWidth.value = element ? element.offsetWidth - element.clientWidth : 0
}
watch([view, () => props.height], () => { void nextTick(measureScrollbar) })
onMounted(() => {
  mounted = true
  measureScrollbar()
  reportRange()
})

// Selection ----------------------------------------------------------------------------------------------------------
function select(event: E) {
  // The click that ends a drag, or a drag cancelled while the button was held, selects nothing.
  if (suppressClick) {
    suppressClick = false
    return
  }
  emit('select', event.id)
  if (localSelected.value !== event.id) {
    localSelected.value = event.id
    emit('update:selectedId', event.id)
  }
}

// Proposals ----------------------------------------------------------------------------------------------------------
/** Announce the rejection reason of a validator result (see `rejectionReason`), or clear the notice; returns the reason. */
function settle(result: boolean | string | void, fallback: string) {
  const reason = rejectionReason(result, fallback)
  notice.value = reason ?? ''
  return reason
}
/** Emit an edit proposal, or its rejection. Returns whether `edit` was emitted. */
function propose(change: EventCalendarEdit) {
  if (change.before.start === change.after.start && change.before.end === change.after.end && !change.resource) return false
  const reason = settle(props.validateEdit?.(change), messages.value.rejected)
  if (reason !== undefined) {
    emit('edit-rejected', change, reason)
    return false
  }
  emit('edit', change)
  return true
}
function proposeCreate(proposal: EventCalendarCreate) {
  const reason = settle(props.validateCreate?.(proposal), messages.value.createRejected)
  if (reason !== undefined) emit('create-rejected', proposal, reason)
  else emit('create', proposal)
}
function editOf(event: E, after: TimeRange, mode: EventCalendarEdit['mode'], source: EventCalendarEdit['source'], resourceId?: string): EventCalendarEdit {
  const change: EventCalendarEdit = { id: event.id, before: rangeOf(event), after, mode, source }
  if (resourceId !== undefined && event.resourceId !== undefined && resourceId !== event.resourceId) {
    change.resource = { before: event.resourceId, after: resourceId }
  }
  if (isOccurrence(event)) change.occurrence = { seriesId: event.seriesId!, recurrenceId: event.recurrenceId! }
  return change
}

// Pointer gestures ---------------------------------------------------------------------------------------------------
type Area = 'grid' | 'days'
interface Gesture {
  pointerId: number
  kind: 'move' | 'start' | 'end' | 'create'
  area: Area
  event?: E
  /** The column (grid) or cell (days) where the gesture started, and the one under the pointer. */
  origin: number
  target: number
  x: number
  y: number
  /** The latest pointer position, for edge auto-scroll. */
  clientX: number
  clientY: number
  /** Grid: the time of day under the pointer when it was pressed, in the origin column. */
  downOffset: number
  started: boolean
  element: Element
}
let gesture: Gesture | undefined
let suppressClick = false
interface Preview { area: Area; range: TimeRange; index: number; label: string; eventId?: string }
const preview = shallowRef<Preview>()

function columnElements() {
  return [...(root.value?.querySelectorAll<HTMLElement>('.vw-calendar-column') ?? [])]
}
function cellElements() {
  return [...(root.value?.querySelectorAll<HTMLElement>('[data-vw-cell]') ?? [])]
}
/** The index of the element whose box contains the point; for `horizontalOnly`, the one whose columns contain x. */
function indexAt(elements: HTMLElement[], x: number, y: number, horizontalOnly: boolean, fallback: number) {
  let best = fallback, distance = Infinity
  elements.forEach((element, index) => {
    const rect = element.getBoundingClientRect()
    const dx = x < rect.left ? rect.left - x : x >= rect.right ? x - rect.right + 1 : 0
    const dy = horizontalOnly ? 0 : y < rect.top ? rect.top - y : y >= rect.bottom ? y - rect.bottom + 1 : 0
    const value = dx + dy
    if (value < distance) {
      distance = value
      best = Number(element.dataset.vwCell ?? element.dataset.vwColumn ?? index)
    }
  })
  return best
}
/** The time of day (wall milliseconds since midnight) at a client y in a grid column. */
function offsetAt(index: number, y: number) {
  const element = columnElements()[index]
  const top = element ? element.getBoundingClientRect().top : 0
  return visibleStart.value + (y - top) / props.hourHeight * hour
}
const floorSnap = (offset: number) => Math.floor(offset / snapMs.value) * snapMs.value

function startEdit(pointer: PointerEvent, event: E, area: Area, origin: number, kind: Gesture['kind']) {
  if (pointer.button !== 0 || gesture || !editable(event) || !valid.value) return
  if (kind !== 'move') pointer.stopPropagation()
  const element = pointer.currentTarget as Element
  // A days-area drag counts whole cells from the cell under the pointer, wherever the event was grabbed.
  if (area === 'days') origin = indexAt(cellElements(), pointer.clientX, pointer.clientY, view.value !== 'month', origin)
  gesture = {
    pointerId: pointer.pointerId, kind, area, event, origin, target: origin, x: pointer.clientX, y: pointer.clientY, started: false, element,
    clientX: pointer.clientX, clientY: pointer.clientY, downOffset: area === 'grid' ? offsetAt(origin, pointer.clientY) : 0,
  }
  // Synthetic events without an active pointer cannot be captured; the gesture then follows bubbled events.
  capturePointer(element, pointer.pointerId)
}
function startCreate(pointer: PointerEvent, area: Area, origin: number) {
  if (pointer.button !== 0 || gesture || props.readonly || !props.creatable || !valid.value) return
  if ((pointer.target as Element).closest('button')) return
  pointer.preventDefault()
  const element = pointer.currentTarget as Element
  gesture = {
    pointerId: pointer.pointerId, kind: 'create', area, origin, target: origin, x: pointer.clientX, y: pointer.clientY, started: false, element,
    clientX: pointer.clientX, clientY: pointer.clientY, downOffset: area === 'grid' ? offsetAt(origin, pointer.clientY) : 0,
  }
  capturePointer(element, pointer.pointerId)
  preview.value = createPreview(gesture)
}

/**
 * A press on empty space of a grid column (`grid`) or a day cell (`days`): it starts a create gesture when the calendar
 * is creatable, and is otherwise remembered as a possible `background-click`, reported when the same pointer is released
 * before the drag threshold.
 */
let backgroundPress: { pointerId: number; x: number; y: number; click: EventCalendarBackgroundClick } | undefined
function pressEmpty(pointer: PointerEvent, area: Area, index: number) {
  backgroundPress = undefined
  if (gesture) return
  startCreate(pointer, area, index)
  if (gesture || !pointer.isPrimary || pointer.button !== 0 || !valid.value || (pointer.target as Element).closest('button')) return
  const cell = area === 'grid' ? columns.value[index] : dayCells.value[index]
  if (!cell) return
  const click: EventCalendarBackgroundClick = area === 'grid'
    ? { time: timeAt(cell.day.start, Math.max(0, floorSnap(offsetAt(index, pointer.clientY)))), allDay: false }
    : { time: cell.day.start, allDay: true }
  if (cell.resourceId !== undefined) click.resourceId = cell.resourceId
  backgroundPress = { pointerId: pointer.pointerId, x: pointer.clientX, y: pointer.clientY, click }
}
function releaseBackground(pointer: PointerEvent) {
  const press = backgroundPress
  if (!press || pointer.pointerId !== press.pointerId) return
  backgroundPress = undefined
  if (pointer.type === 'pointerup' && !pastThreshold(press, pointer)) emit('background-click', press.click)
}

/** The interval and target of the gesture at the pointer, or undefined when nothing would change. */
function gestureResult(active: Gesture, x: number, y: number): { range: TimeRange; index: number; resourceId?: string } {
  const event = active.event
  if (active.area === 'grid') {
    const target = active.kind === 'move' ? indexAt(columnElements(), x, y, true, active.target) : active.origin
    active.target = target
    const origin = columns.value[active.origin]!, column = columns.value[target]!
    if (active.kind === 'create') return { range: createRange(active, y), index: active.origin, resourceId: origin.resourceId }
    const delta = Math.round((offsetAt(target, y) - active.downOffset) / snapMs.value) * snapMs.value
    const before = rangeOf(event!)
    if (active.kind === 'move') {
      const start = timeAt(column.day.start, timeOfDay(origin.day.start, before.start) + delta)
      return { range: { start, end: start + before.end - before.start }, index: target, resourceId: column.resourceId }
    }
    if (active.kind === 'end') {
      const end = timeAt(origin.day.start, timeOfDay(origin.day.start, before.end) + delta)
      return { range: { start: before.start, end: Math.max(before.start + snapMs.value, end) }, index: target }
    }
    const start = timeAt(origin.day.start, timeOfDay(origin.day.start, before.start) + delta)
    return { range: { start: Math.min(before.end - snapMs.value, start), end: before.end }, index: target }
  }
  const target = indexAt(cellElements(), x, y, view.value !== 'month', active.target)
  active.target = target
  const cells = dayCells.value
  if (active.kind === 'create') {
    if (resourceMode.value) return { range: dayRange(cells[active.origin]!.day), index: active.origin, resourceId: cells[active.origin]!.resourceId }
    const first = Math.min(active.origin, target), last = Math.max(active.origin, target)
    return { range: { start: cells[first]!.day.start, end: cells[last]!.day.end }, index: first }
  }
  const before = rangeOf(event!)
  if (resourceMode.value) return { range: before, index: target, resourceId: cells[target]!.resourceId }
  const delta = target - active.origin
  if (active.kind === 'end') {
    const end = addDays(before.end, delta)
    return { range: { start: before.start, end: Math.max(end, addDays(before.start, 1)) }, index: target }
  }
  return { range: { start: addDays(before.start, delta), end: addDays(before.end, delta) }, index: target }
}
const dayRange = (day: TimeRange): TimeRange => ({ start: day.start, end: day.end })
function createRange(active: Gesture, y: number): TimeRange {
  const day = columns.value[active.origin]!.day
  const anchor = floorSnap(active.downOffset)
  if (!active.started) return { start: timeAt(day.start, anchor), end: timeAt(day.start, anchor) + createMs.value }
  const current = floorSnap(offsetAt(active.origin, y))
  const from = Math.max(0, Math.min(anchor, current)), to = Math.min(24 * hour, Math.max(anchor, current) + snapMs.value)
  return { start: timeAt(day.start, from), end: timeAt(day.start, to) }
}
function createPreview(active: Gesture): Preview {
  const result = gestureResult(active, active.x, active.y)
  return { area: active.area, range: result.range, index: result.index, label: '' }
}

function movePointer(pointer: PointerEvent) {
  const active = gesture
  if (!active || pointer.pointerId !== active.pointerId) return
  if (!active.started && !pastThreshold(active, pointer)) return
  active.started = true
  active.clientX = pointer.clientX
  active.clientY = pointer.clientY
  showPreview(active)
  if (active.area === 'grid') edgeScroll.start()
}
function showPreview(active: Gesture) {
  const result = gestureResult(active, active.clientX, active.clientY)
  const label = active.event ? active.event.label : ''
  preview.value = { area: active.area, range: result.range, index: result.index, label, eventId: active.event?.id }
}
/**
 * While a drag in the time grid is held near the top or bottom of the visible part of its scroller, scroll it, so the
 * drag reaches hours scrolled out of view; the preview follows the time now under the pointer. Scrolling starts after the
 * pointer rests in the band for `edgeScrollDelay`, so a drag that passes through it does not scroll, and a pointer that
 * leaves the scroller (or the window) stops it.
 */
const edgeScroll = edgeScroller(() => {
  const active = gesture, element = scroller.value
  return active?.started && active.area === 'grid' && element ? { scroller: element, clientX: active.clientX, clientY: active.clientY } : undefined
}, () => { if (gesture) showPreview(gesture) }, { axis: 'y', insideOnly: true, clipToWindow: true, delay: edgeScrollDelay })
onBeforeUnmount(() => edgeScroll.stop())
/** End the gesture of a released pointer with its proposal. */
function finishPointer(pointer: PointerEvent) {
  const active = gesture
  if (!active || pointer.pointerId !== active.pointerId) return
  gesture = undefined
  preview.value = undefined
  edgeScroll.stop()
  releasePointer(active.element, active.pointerId)
  if (active.kind === 'create') {
    const result = gestureResult(active, pointer.clientX, pointer.clientY)
    proposeCreate({
      start: result.range.start, end: result.range.end, allDay: active.area === 'days', source: 'pointer',
      ...(result.resourceId !== undefined ? { resourceId: result.resourceId } : {}),
    })
    return
  }
  if (!active.started) return
  const result = gestureResult(active, pointer.clientX, pointer.clientY)
  suppressClick = true
  propose(editOf(active.event!, result.range, active.kind as EventCalendarEdit['mode'], 'pointer', result.resourceId))
}
/** `pointerup` on the calendar: finish the gesture, and forget a suppressed click once the click has been dispatched. */
function pointerUp(pointer: PointerEvent) {
  finishPointer(pointer)
  releaseBackground(pointer)
  if (suppressClick) setTimeout(() => { suppressClick = false })
}
function cancelPointer(pointer: PointerEvent) {
  if (backgroundPress?.pointerId === pointer.pointerId) backgroundPress = undefined
  if (gesture && pointer.pointerId === gesture.pointerId) cancelGesture('pointer-cancel')
}
/** End the gesture in flight without a proposal and report it through `edit-cancel`. */
function cancelGesture(reason: EventCalendarEditCancelReason) {
  const active = gesture
  if (!active) return false
  gesture = undefined
  preview.value = undefined
  edgeScroll.stop()
  releasePointer(active.element, active.pointerId)
  // The click that follows the release of a cancelled drag selects nothing. A cancelled pointer has no release and no
  // click, so it leaves the next click alone.
  if (reason !== 'pointer-cancel' && (active.started || active.kind === 'create')) suppressClick = true
  emit('edit-cancel', { reason, eventIds: active.event ? [active.event.id] : [] })
  return true
}
/** Cancel a pointer gesture in flight (reported with reason `api`). */
function cancelEdit() {
  cancelGesture('api')
}
// New source data or coordinates cancel the gesture: its preview no longer matches what is drawn.
watch([
  () => props.events, () => props.resources, view, localDate, () => props.timeZone, () => props.weekStartsOn, () => props.dayStart,
  () => props.dayEnd, () => props.hourHeight, () => props.snap, () => props.readonly,
], () => {
  backgroundPress = undefined
  cancelGesture('source-changed')
})

const previewBoxes = computed(() => {
  const current = preview.value
  if (!current || current.area !== 'grid') return []
  return columns.value.flatMap((column, index) => {
    if (resourceMode.value ? index !== current.index : (current.range.end <= column.day.start || current.range.start >= column.day.end)) return []
    if (current.range.end === current.range.start && !(current.range.start >= column.day.start && current.range.start < column.day.end)) return []
    const start = Math.max(current.range.start, column.day.start), end = Math.min(current.range.end, column.day.end)
    const top = Math.max(0, pxOf(timeOfDay(column.day.start, start)))
    const bottom = Math.min(bodyHeight.value, Math.max(pxOf(timeOfDay(column.day.start, end)), top + minEventHeight))
    if (bottom <= top) return []
    return [{ index, style: { top: top + 'px', height: bottom - top + 'px' }, text: `${current.label} ${timeText.value(current.range.start)}–${timeText.value(current.range.end)}`.trim() }]
  })
})
/** Preview of the days area: per row of cells, the covered span. */
const previewSpans = computed(() => {
  const current = preview.value
  if (!current || current.area !== 'days') return []
  const cells = dayCells.value
  const covered = resourceMode.value ? [current.index] : cells.flatMap((cell, index) => current.range.start < cell.day.end && current.range.end > cell.day.start ? [index] : [])
  const rowSize = view.value === 'month' ? 7 : cells.length
  const rows = new Map<number, number[]>()
  for (const index of covered) {
    const row = Math.floor(index / rowSize)
    rows.set(row, [...(rows.get(row) ?? []), index])
  }
  return [...rows].map(([row, indexes]) => {
    const first = Math.min(...indexes) - row * rowSize, last = Math.max(...indexes) - row * rowSize
    return { row, style: { insetInlineStart: first / rowSize * 100 + '%', width: (last - first + 1) / rowSize * 100 + '%' }, text: current.label }
  })
})

// Keyboard -----------------------------------------------------------------------------------------------------------
function isRtl() {
  return props.dir === 'rtl' || (props.dir === 'auto' && root.value !== undefined && getComputedStyle(root.value).direction === 'rtl')
}
/** Escape anywhere in the calendar cancels the gesture in flight. */
function escapeKey(key: KeyboardEvent) {
  backgroundPress = undefined
  if (cancelGesture('escape')) key.preventDefault()
}
/** A new press starts afresh: a click suppressed for a release that never came must not swallow the next one. */
function pressStart() {
  if (!gesture) suppressClick = false
}
function eventKeys(key: KeyboardEvent, event: E, area: Area) {
  if (key.key === 'Enter') {
    // Enter opens the event; Space and clicks select it.
    key.preventDefault()
    emit('event-activate', event.id, 'keyboard')
    return
  }
  if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(key.key) || !editable(event) || gesture) return
  const horizontal = key.key === 'ArrowLeft' || key.key === 'ArrowRight'
  const step = horizontal ? ((key.key === 'ArrowLeft') !== isRtl() ? -1 : 1) : key.key === 'ArrowUp' ? -1 : 1
  const before = rangeOf(event)
  let change: EventCalendarEdit | undefined
  if (horizontal && resourceMode.value && event.resourceId !== undefined) {
    const list = props.resources!
    const index = list.findIndex(resource => resource.id === event.resourceId)
    const target = list[index + step]
    if (target && !key.shiftKey) change = editOf(event, before, 'move', 'keyboard', target.id)
  } else if (area === 'grid' && !horizontal) {
    const delta = step * snapMs.value
    change = key.shiftKey
      ? editOf(event, { start: before.start, end: Math.max(before.start + snapMs.value, before.end + delta) }, 'end', 'keyboard')
      : editOf(event, { start: before.start + delta, end: before.end + delta }, 'move', 'keyboard')
  } else if (horizontal || view.value === 'month') {
    const days = horizontal ? step : step * 7
    change = key.shiftKey && horizontal
      // Like the pointer handle, day-wise resizing is for all-day events only: a timed event in the month view keeps
      // its times instead of growing to a whole day.
      ? (area === 'days' && event.allDay ? editOf(event, { start: before.start, end: Math.max(addDays(before.end, days), addDays(before.start, 1)) }, 'end', 'keyboard') : undefined)
      : editOf(event, { start: addDays(before.start, days), end: addDays(before.end, days) }, 'move', 'keyboard')
  }
  if (!change) return
  key.preventDefault()
  if (propose(change)) pendingFocus.request(event.id)
}
/**
 * Focus that leaves an event for another place drops a pending focus request. A redraw that moves or removes the focused
 * element blurs it too, while the update that restores the focus runs; the check waits until that update is done.
 */
function eventBlur(focus: FocusEvent) {
  const element = focus.target as Element
  queueMicrotask(() => {
    if (element.isConnected && document.activeElement !== element) pendingFocus.cancel()
  })
}
// After the parent applies a keyboard edit, the event may be drawn by another element: keep the focus on it.
const pendingFocus = usePendingFocus(() => props.events, id => elementWithData(root.value, 'vwEvent', id)?.focus(), { flush: 'post' })

/** Scroll the time grid so that the time of day of `time` is at the top. */
function scrollToTime(time: number) {
  const element = scroller.value
  const day = columns.value[0]?.day
  if (!element || !day) return
  element.scrollTop = Math.max(0, pxOf(timeOfDay(day.start, time)))
}

defineExpose({ cancelEdit, scrollToTime })

function eventClasses(event: E, extra: Record<string, boolean>) {
  return [`vw-tone-${event.tone ?? 'blue'}`, {
    'vw-is-selected': localSelected.value === event.id, 'vw-is-editable': editable(event),
    'vw-is-dragging': preview.value?.eventId === event.id, 'vw-is-recurring': isOccurrence(event), ...extra,
  }]
}
const hintIds = (event: E, area: Area) => editable(event) ? `${uid}-${view.value === 'month' ? 'month' : area}-hint` : undefined
</script>

<template>
  <div
    ref="root" class="vw-calendar" :class="[`vw-calendar-view-${view}`, { 'vw-rtl': dir === 'rtl', 'vw-is-creatable': creatable && !readonly }]"
    :dir="dir === 'auto' ? undefined : dir" :style="scrollbarWidth ? { '--vw-calendar-scrollbar': scrollbarWidth + 'px' } : undefined" role="region" :aria-label="messages.region"
    @pointermove="movePointer" @pointerup="pointerUp" @pointercancel="cancelPointer" @lostpointercapture="cancelPointer"
    @pointerdown.capture="pressStart" @keydown.esc="escapeKey"
  >
    <div v-if="showToolbar" class="vw-calendar-toolbar">
      <slot name="toolbar" v-bind="toolbarProps">
        <div class="vw-calendar-nav">
          <button type="button" class="vw-calendar-nav-button" :aria-label="messages.previous" :title="messages.previous" @click="previous">
            <span class="vw-calendar-nav-icon" aria-hidden="true">‹</span>
          </button>
          <button type="button" class="vw-calendar-today" :disabled="now === undefined" @click="today">{{ messages.today }}</button>
          <button type="button" class="vw-calendar-nav-button" :aria-label="messages.next" :title="messages.next" @click="next">
            <span class="vw-calendar-nav-icon" aria-hidden="true">›</span>
          </button>
        </div>
        <span class="vw-calendar-title">{{ title }}</span>
        <div class="vw-calendar-views" role="group" :aria-label="messages.views">
          <button v-for="item in viewNames" :key="item.id" type="button" :aria-pressed="view === item.id" @click="setView(item.id)">
            {{ item.label }}
          </button>
        </div>
      </slot>
    </div>

    <div v-if="!valid" class="vw-calendar-empty"><slot name="empty">{{ messages.empty }}</slot></div>

    <template v-else-if="view !== 'month'">
      <div class="vw-calendar-head" :style="gridStyle">
        <div class="vw-calendar-corner">{{ resourceMode ? messages.resources : '' }}</div>
        <div v-for="column in columns" :key="column.key" class="vw-calendar-column-head" :class="{ 'vw-is-today': !resourceMode && isToday(column.day) }">
          <strong>{{ column.label }}</strong>
          <small v-if="column.detail">{{ column.detail }}</small>
        </div>
      </div>
      <div class="vw-calendar-all-day" :style="gridStyle">
        <div class="vw-calendar-corner">{{ messages.allDay }}</div>
        <div class="vw-calendar-all-day-cells" :style="{ height: allDayHeight + 'px', gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }">
          <div v-for="(column, index) in columns" :key="column.key" class="vw-calendar-cell" :data-vw-cell="index" @pointerdown="pressEmpty($event, 'days', index)" />
          <button
            v-for="segment in allDayRow.segments" :key="segment.key" type="button" class="vw-calendar-event vw-calendar-segment"
            :class="eventClasses(segment.event, { 'vw-continues-before': segment.continuesBefore, 'vw-continues-after': segment.continuesAfter })"
            :style="segment.style" :tabindex="segment.primary ? 0 : -1" :data-vw-event="segment.event.id"
            :aria-label="eventName(segment.event)" :title="eventName(segment.event)" :aria-pressed="localSelected === segment.event.id"
            :aria-describedby="hintIds(segment.event, 'days')"
            @pointerdown="startEdit($event, segment.event, 'days', segment.startIndex, 'move')" @click="select(segment.event)"
            @dblclick="emit('event-activate', segment.event.id, 'pointer')" @keydown="eventKeys($event, segment.event, 'days')" @blur="eventBlur"
          >
            <slot name="event" :event="segment.event" :range="rangeOf(segment.event)" :selected="localSelected === segment.event.id" :all-day="true" :view="view">
              <span class="vw-calendar-event-label">{{ segment.event.label }}</span>
            </slot>
            <span
              v-if="segment.event.allDay && editable(segment.event) && !resourceMode && !segment.continuesAfter" class="vw-calendar-handle vw-is-end vw-is-horizontal"
              aria-hidden="true" @pointerdown="startEdit($event, segment.event, 'days', segment.endIndex - 1, 'end')"
            />
          </button>
          <div v-for="span in previewSpans" :key="span.row" class="vw-calendar-preview" :style="span.style" aria-hidden="true">{{ span.text }}</div>
        </div>
      </div>
      <div ref="scroller" class="vw-calendar-scroll" :style="{ height: scrollHeight }">
        <div class="vw-calendar-body" :style="{ ...gridStyle, height: bodyHeight + 'px' }">
          <div class="vw-calendar-gutter" aria-hidden="true">
            <span v-for="item in hours" :key="item.key" class="vw-calendar-hour" :style="{ top: item.top + 'px' }">{{ item.label }}</span>
          </div>
          <div
            v-for="(column, index) in columns" :key="column.key" class="vw-calendar-column" :class="{ 'vw-is-today': !resourceMode && isToday(column.day) }"
            :data-vw-column="index" :style="{ '--vw-calendar-hour-height': hourHeight + 'px' }" @pointerdown="pressEmpty($event, 'grid', index)"
          >
            <button
              v-for="box in timedBoxes[index]" :key="box.key" type="button" class="vw-calendar-event vw-calendar-timed"
              :class="eventClasses(box.event, { 'vw-continues-before': box.continuesBefore, 'vw-continues-after': box.continuesAfter, 'vw-is-short': box.short })"
              :style="box.style" :tabindex="box.primary ? 0 : -1" :data-vw-event="box.event.id"
              :aria-label="eventName(box.event)" :title="eventName(box.event)" :aria-pressed="localSelected === box.event.id"
              :aria-describedby="hintIds(box.event, 'grid')"
              @pointerdown="startEdit($event, box.event, 'grid', index, 'move')" @click="select(box.event)"
              @dblclick="emit('event-activate', box.event.id, 'pointer')" @keydown="eventKeys($event, box.event, 'grid')" @blur="eventBlur"
            >
              <span v-if="editable(box.event) && !box.continuesBefore" class="vw-calendar-handle vw-is-start" aria-hidden="true" @pointerdown="startEdit($event, box.event, 'grid', index, 'start')" />
              <slot name="event" :event="box.event" :range="rangeOf(box.event)" :selected="localSelected === box.event.id" :all-day="false" :view="view">
                <span class="vw-calendar-event-time">{{ timeText(box.event.start) }}–{{ timeText(box.event.end) }}</span>
                <span class="vw-calendar-event-label">{{ box.event.label }}</span>
              </slot>
              <span v-if="editable(box.event) && !box.continuesAfter" class="vw-calendar-handle vw-is-end" aria-hidden="true" @pointerdown="startEdit($event, box.event, 'grid', index, 'end')" />
            </button>
            <template v-for="box in previewBoxes" :key="box.index">
              <div v-if="box.index === index" class="vw-calendar-preview" :style="box.style" aria-hidden="true">{{ box.text }}</div>
            </template>
            <div
              v-if="nowLine && (nowLine.all || nowLine.index === index)" class="vw-calendar-now" :style="{ top: nowLine.top + 'px' }"
              role="img" :aria-label="nowLine.label"
            />
          </div>
        </div>
      </div>
    </template>

    <div v-else class="vw-calendar-month">
      <div class="vw-calendar-weekdays">
        <span v-for="item in weekdayNames" :key="item.key">{{ item.label }}</span>
      </div>
      <div v-for="(week, row) in monthWeeks" :key="week.key" class="vw-calendar-week" :style="{ height: monthRowHeight + 'px' }">
        <div
          v-for="cell in week.days" :key="cell.day.start" class="vw-calendar-cell vw-calendar-month-day"
          :class="{ 'vw-is-outside': !cell.day.inMonth, 'vw-is-today': isToday(cell.day) }" :data-vw-cell="cell.index"
          @pointerdown="pressEmpty($event, 'days', cell.index)"
        >
          <button type="button" class="vw-calendar-day-number" :aria-label="`${messages.showDay} ${longDate.format(cell.day.start)}`" @click="openDay(cell.day)">
            {{ cell.day.day }}
          </button>
          <button
            v-if="cell.hidden" type="button" class="vw-calendar-more" :aria-label="`+${cell.hidden} ${messages.more}, ${longDate.format(cell.day.start)}`"
            @click="openDay(cell.day)"
          >+{{ cell.hidden }} {{ messages.more }}</button>
        </div>
        <div class="vw-calendar-week-events">
          <button
            v-for="segment in week.segments" :key="segment.key" type="button" class="vw-calendar-event vw-calendar-segment"
            :class="eventClasses(segment.event, { 'vw-continues-before': segment.continuesBefore, 'vw-continues-after': segment.continuesAfter, 'vw-is-timed': !inAllDayRow(segment.event) })"
            :style="segment.style" :tabindex="segment.primary ? 0 : -1" :data-vw-event="segment.event.id"
            :aria-label="eventName(segment.event)" :title="eventName(segment.event)" :aria-pressed="localSelected === segment.event.id"
            :aria-describedby="hintIds(segment.event, 'days')"
            @pointerdown="startEdit($event, segment.event, 'days', segment.startIndex, 'move')" @click="select(segment.event)"
            @dblclick="emit('event-activate', segment.event.id, 'pointer')" @keydown="eventKeys($event, segment.event, 'days')" @blur="eventBlur"
          >
            <slot name="event" :event="segment.event" :range="rangeOf(segment.event)" :selected="localSelected === segment.event.id" :all-day="inAllDayRow(segment.event)" :view="view">
              <span v-if="!inAllDayRow(segment.event)" class="vw-calendar-event-time">{{ timeText(segment.event.start) }}</span>
              <span class="vw-calendar-event-label">{{ segment.event.label }}</span>
            </slot>
            <span
              v-if="segment.event.allDay && editable(segment.event) && !segment.continuesAfter" class="vw-calendar-handle vw-is-end vw-is-horizontal"
              aria-hidden="true" @pointerdown="startEdit($event, segment.event, 'days', segment.endIndex - 1, 'end')"
            />
          </button>
          <template v-for="span in previewSpans" :key="span.row">
            <div v-if="span.row === row" class="vw-calendar-preview" :style="span.style" aria-hidden="true">{{ span.text }}</div>
          </template>
        </div>
      </div>
    </div>

    <span :id="`${uid}-grid-hint`" class="vw-sr-only">{{ messages.editHint }}</span>
    <span :id="`${uid}-days-hint`" class="vw-sr-only">{{ messages.dayEditHint }}</span>
    <span v-if="view === 'month'" :id="`${uid}-month-hint`" class="vw-sr-only">{{ messages.monthEditHint }}</span>
    <span class="vw-sr-only" aria-live="polite">{{ notice }}</span>
  </div>
</template>
