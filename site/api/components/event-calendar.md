---
title: EventCalendar
description: Props, events, slots and helpers of the EventCalendar component, including recurring events.
---

# EventCalendar {#top}

`EventCalendar` shows appointments in day, week and month views, and in an opt-in agenda list, in an IANA time zone and locale, with an all-day row, a "+N more" overflow in the month grid, a now line and a toolbar. With `resources`, the day view shows one column per room, machine or person. Recurring events follow RFC 5545 rules (`expandRecurringEvents`, `applyRecurringEdit`).

It is an opt-in, controlled component. Moves, resizes and new events are `edit` and `create` proposals, checked by the synchronous `validateEdit` and `validateCreate`; `range-change` reports the visible range so you can load its events. The calendar never reads the clock or the runtime's time zone, so the server and the client render the same text.

## Minimal example

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { EventCalendar, type CalendarEvent, type EventCalendarEdit } from '@eightkk/vue-weave'
import '@eightkk/vue-weave/style.css'

const date = ref(Date.parse('2026-11-09T00:00:00Z'))
const events = ref<CalendarEvent[]>([
  { id: 'review', label: 'Design review', start: Date.parse('2026-11-10T09:00:00Z'), end: Date.parse('2026-11-10T10:30:00Z') },
])

function apply(change: EventCalendarEdit) {
  events.value = events.value.map(event => event.id === change.id ? { ...event, ...change.after } : event)
}
</script>

<template>
  <EventCalendar v-model:date="date" :events="events" time-zone="UTC" locale="en-GB" @edit="apply" />
</template>
```

**Examples:** [Event calendar](/examples/event-calendar/) and the [example index](/examples/). **Types:** [`CalendarEvent`](../reference/core/interfaces/CalendarEvent.md), [`EventCalendarEdit`](../reference/core/interfaces/EventCalendarEdit.md), [`EventCalendarExposed`](../reference/vue-weave/type-aliases/EventCalendarExposed.md). iCalendar import and export are on [Interchange and export](../core/interchange.md).

<!--@include: ../../../docs/api.md#event-calendar-->
