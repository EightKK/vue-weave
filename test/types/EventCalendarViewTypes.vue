<script setup lang="ts">
// Type-level tests of the EventCalendar view types, run by `npm run typecheck` (vue-tsc). Nothing here is rendered or
// executed. Code written for 1.6 (three views, exhaustive over `EventCalendarView`) keeps compiling, and a calendar
// that offers the agenda types its view as `EventCalendarViewName` without casts. Each `@vue-expect-error` or
// `@ts-expect-error` fails the check when the line it guards compiles.
import { h, ref } from 'vue'
import {
  EventCalendar, eventCalendarRange, shiftEventCalendarDate, type CalendarEvent, type EventCalendarView, type EventCalendarViewName, type TimeRange,
} from '../../src'

const events: CalendarEvent[] = [{ id: 'a', label: 'A', start: 0, end: 1 }]

// Code written for three views: an exhaustive switch with a `never` check, a Record over every view, a ref, handlers.
function label(view: EventCalendarView): string {
  switch (view) {
    case 'day': return 'Day'
    case 'week': return 'Week'
    case 'month': return 'Month'
    default: {
      const unreachable: never = view
      return unreachable
    }
  }
}
const names: Record<EventCalendarView, string> = { day: 'Day', week: 'Week', month: 'Month' }
const view = ref<EventCalendarView>('week')
function onView(next: EventCalendarView) { view.value = next }
function onRange(range: TimeRange, next: EventCalendarView) { return range.start + label(next) }
void [names, h(EventCalendar, { events, date: 0, view: view.value, 'onUpdate:view': onView, onRangeChange: onRange })]
// The instance of such a calendar has the three-view types in every output position.
const three = new EventCalendar({ events, date: 0, view: 'month', views: ['day', 'week', 'month'] })
const threeView: EventCalendarView = (null! as Parameters<NonNullable<typeof three.$props['onUpdate:view']>>[0])
void [threeView, label(null! as Parameters<NonNullable<typeof three.$slots.event>>[0]['view'])]

// A calendar that offers the agenda: its view state, handlers and slots use EventCalendarViewName, without casts.
function labelAny(view: EventCalendarViewName): string {
  switch (view) {
    case 'agenda': return 'Agenda'
    default: return label(view)
  }
}
const allViews: EventCalendarViewName[] = ['day', 'week', 'month', 'agenda']
const anyView = ref<EventCalendarViewName>('agenda')
function onAnyView(next: EventCalendarViewName) { anyView.value = next }
function onAnyRange(range: TimeRange, next: EventCalendarViewName) { return range.end + labelAny(next) }
const four = new EventCalendar({ events, date: 0, views: allViews })
type FourView = Parameters<NonNullable<typeof four.$props['onUpdate:view']>>[0]
const fourView: EventCalendarViewName = null! as FourView
// @ts-expect-error A calendar that offers the agenda can emit it, so its view is not an EventCalendarView.
const notThree: EventCalendarView = null! as FourView
void [fourView, notThree, h(EventCalendar, { events, date: 0, view: anyView.value, views: allViews, 'onUpdate:view': onAnyView, onRangeChange: onAnyRange })]
// @ts-expect-error Not a view.
void new EventCalendar({ events, date: 0, view: 'year' })
// The core functions take every view.
const agendaRange: TimeRange = eventCalendarRange(anyView.value, 0, { agendaDays: 3 })
void [agendaRange, shiftEventCalendarDate('agenda', 0, 1), eventCalendarRange(view.value, 0)]
</script>

<template>
  <EventCalendar v-model:view="view" :events="events" :date="0" @update:view="(next: EventCalendarView) => label(next)" @range-change="onRange">
    <template #event="{ view: shown }">{{ label(shown) }}</template>
    <template #toolbar="{ view: shown, setView }">
      {{ label(shown) }} {{ names[shown] }}
      <button type="button" @click="setView('day')">Day</button>
    </template>
  </EventCalendar>
  <EventCalendar :events="events" :date="0" view="month" @update:view="onView" />
  <EventCalendar :events="events" :date="0" :views="['day', 'week']" @update:view="onView" />

  <EventCalendar v-model:view="anyView" :events="events" :date="0" :views="allViews" @update:view="(next: EventCalendarViewName) => labelAny(next)"
    @range-change="onAnyRange">
    <template #event="{ view: shown }">{{ labelAny(shown) }}</template>
    <template #toolbar="{ view: shown, setView }">
      {{ labelAny(shown) }}
      <button type="button" @click="setView('agenda')">Agenda</button>
    </template>
  </EventCalendar>
  <EventCalendar :events="events" :date="0" view="agenda" @update:view="onAnyView" />
  <EventCalendar :events="events" :date="0" :views="['week', 'agenda']" @update:view="onAnyView" />
  <!-- @vue-expect-error The agenda is not an EventCalendarView, so a three-view handler cannot take it. -->
  <EventCalendar :events="events" :date="0" view="agenda" @update:view="onView" />
  <EventCalendar :events="events" :date="0" :views="allViews">
    <template #event="{ view: shown }">
      <!-- @vue-expect-error A calendar that offers the agenda passes it to its slots. -->
      {{ label(shown) }}
    </template>
  </EventCalendar>
</template>
