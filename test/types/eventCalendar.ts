// Type-level checks for EventCalendar and its core helpers. Checked by `npm run typecheck`.
import { h } from 'vue'
import {
  applyRecurringEdit, expandRecurringEvents, layoutCalendarAgenda, layoutCalendarDayEvents, packCalendarEventLanes, eventCalendarRange,
  parseRecurrenceRule, type CalendarAgendaDay, type CalendarAgendaItem, type CalendarEvent, type EventCalendarEdit, type EventCalendarView, type EventCalendarViewName, type RecurrenceRule, type TimeRange,
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

// The opt-in agenda view: a view value, the offered views and its length, and the core grouping helper.
void h(EventCalendar, { events, date: 0, view: 'agenda', views: ['week', 'agenda'], agendaDays: 14 })
assertType<Equal<typeof calendar.$props.views, readonly EventCalendarView[] | undefined>>()
assertType<Equal<typeof calendar.$props.agendaDays, number | undefined>>()
assertType<Equal<Parameters<NonNullable<typeof calendar.$props['onUpdate:view']>>[0], EventCalendarView>>()
// EventCalendarView keeps its three values; a calendar that can show the agenda emits and passes EventCalendarViewName.
assertType<Equal<EventCalendarView, 'day' | 'week' | 'month'>>()
assertType<Equal<EventCalendarViewName, 'day' | 'week' | 'month' | 'agenda'>>()
assertType<Equal<Parameters<NonNullable<typeof calendar.$slots.event>>[0]['view'], EventCalendarView>>()
assertType<Equal<Parameters<NonNullable<typeof calendar.$slots.toolbar>>[0]['setView'], (view: EventCalendarView) => void>>()
const withAgenda = new EventCalendar({ events, date: 0, view: 'agenda' })
assertType<Equal<Parameters<NonNullable<typeof withAgenda.$props['onUpdate:view']>>[0], EventCalendarViewName>>()
assertType<Equal<Parameters<NonNullable<typeof withAgenda.$props['onRange-change']>>[1], EventCalendarViewName>>()
assertType<Equal<Parameters<NonNullable<typeof withAgenda.$slots.toolbar>>[0]['view'], EventCalendarViewName>>()
const offered = new EventCalendar({ events, date: 0, view: 'week', views: ['week', 'agenda'] })
assertType<Equal<Parameters<NonNullable<typeof offered.$slots.event>>[0]['view'], EventCalendarViewName>>()
const threeViews = new EventCalendar({ events, date: 0, view: 'week', views: ['day', 'week', 'month'] })
assertType<Equal<Parameters<NonNullable<typeof threeViews.$props['onUpdate:view']>>[0], EventCalendarView>>()
const agendaRange: TimeRange = eventCalendarRange('agenda', 0, { agendaDays: 3 })
const agenda: CalendarAgendaDay[] = layoutCalendarAgenda(events, [agendaRange])
const item: CalendarAgendaItem | undefined = agenda[0]?.items[0]
void [item?.allDay, item?.continuesBefore]
