// Type-level checks for EventCalendar and its core helpers. Checked by `npm run typecheck`.
import { h } from 'vue'
import {
  applyRecurringEdit, expandRecurringEvents, layoutCalendarDayEvents, packCalendarEventLanes, eventCalendarRange, parseRecurrenceRule,
  type CalendarEvent, type EventCalendarEdit, type EventCalendarView, type RecurrenceRule, type TimeRange,
} from '../../src/core/index'
import { EventCalendar, type EventCalendarExposed } from '../../src/index'

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false
function assertType<T extends true>(value?: T) { return value }

interface Booking { owner: string }
const events: CalendarEvent<Booking>[] = [{ id: 'a', label: 'A', start: 0, end: 1, data: { owner: 'Ada' } }]

// The event type flows into the slot, and the edit proposal has the documented shape.
const calendar = new EventCalendar({ events, date: 0 })
type EventSlot = Parameters<NonNullable<typeof calendar.$slots.event>>[0]
assertType<Equal<EventSlot['event']['data'], Booking | undefined>>()
assertType<Equal<Parameters<NonNullable<typeof calendar.$props.onEdit>>[0], EventCalendarEdit>>()
// @ts-expect-error The event data is Booking, not any.
void (({} as EventSlot).event.data?.missing)
const untyped = new EventCalendar({ events: [] as CalendarEvent[], date: 0 })
assertType<Equal<Parameters<NonNullable<typeof untyped.$slots.event>>[0]['event']['data'], unknown>>()

// Exposed methods.
declare const exposed: EventCalendarExposed<CalendarEvent<Booking>>
exposed.cancelEdit()
exposed.scrollToTime(0)
void h(EventCalendar, { events, date: 0, view: 'month' })
assertType<Equal<typeof calendar.$props.view, EventCalendarView | undefined>>()

// The helpers need only IDs and intervals.
const range: TimeRange = eventCalendarRange('week', 0, { timeZone: 'Europe/Berlin', weekStartsOn: 0 })
const columns = layoutCalendarDayEvents([{ id: 'x', start: 0, end: 1 }], range)
const lanes = packCalendarEventLanes(events, [range])
void [columns[0]?.columns, lanes.lanes]

// Recurring events keep the event type through expansion and edits, and edits carry the occurrence.
const series: CalendarEvent<Booking>[] = [{ id: 's', label: 'S', start: 0, end: 1, data: { owner: 'Ada' }, recurrence: { rule: 'FREQ=WEEKLY;COUNT=3' } }]
const occurrences = expandRecurringEvents(series, range, { timeZone: 'Europe/Berlin' })
assertType<Equal<typeof occurrences, CalendarEvent<Booking>[]>>()
const rule: RecurrenceRule = parseRecurrenceRule('FREQ=MONTHLY;BYDAY=-1FR')
void rule.byWeekday?.[0]?.ordinal
declare const edit: EventCalendarEdit
if (edit.occurrence) {
  const next = applyRecurringEdit(series, edit.occurrence, { ...edit.after, resourceId: edit.resource?.after }, 'following')
  assertType<Equal<typeof next, CalendarEvent<Booking>[]>>()
}
// @ts-expect-error The scope is 'occurrence', 'following' or 'series'.
applyRecurringEdit(series, { seriesId: 's', recurrenceId: 0 }, 'delete', 'all')
