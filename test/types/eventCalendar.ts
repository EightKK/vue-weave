// Type-level checks for EventCalendar and its core helpers. Checked by `npm run typecheck`.
import { h } from 'vue'
import {
  layoutCalendarDayEvents, packCalendarEventLanes, eventCalendarRange, type CalendarEvent, type EventCalendarEdit, type EventCalendarView, type TimeRange,
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
