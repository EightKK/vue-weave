<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  EventCalendar, eventCalendarRange, intlTimeFormatter, useEditHistory, type CalendarEvent, type CalendarResource, type EventCalendarCreate,
  type EventCalendarEdit, type EventCalendarView, type TimeRange,
} from '../src'
import DemoPanel from './components/DemoPanel.vue'
import StatusLine from './components/StatusLine.vue'
import { unusedNumber } from './ids'

// Room bookings in an event calendar: the parent owns the events and applies the proposals of the calendar (moves,
// resizes, room changes and new bookings) as undoable steps. A room can hold one booking at a time, so `validateEdit`
// and `validateCreate` reject double bookings. All times are UTC, so the demo never depends on the local zone.
const at = (date: string, time = '00:00') => Date.parse(`2026-11-${date}T${time}:00Z`)
const rooms: CalendarResource[] = [
  { id: 'atlas', label: 'Atlas', detail: '12 seats' },
  { id: 'borealis', label: 'Borealis', detail: '6 seats' },
  { id: 'lab', label: 'Hardware lab', detail: 'Bench access' },
]
const roomLabel = (id?: string) => rooms.find(room => room.id === id)?.label
type Booking = CalendarEvent<{ owner: string }>
const initialEvents: Booking[] = [
  { id: 'standup', label: 'Standup', start: at('09', '09:00'), end: at('09', '09:30'), resourceId: 'atlas', data: { owner: 'Platform' } },
  { id: 'review', label: 'Design review', start: at('11', '10:00'), end: at('11', '11:00'), resourceId: 'atlas', tone: 'violet', data: { owner: 'Design' } },
  { id: 'call', label: 'Customer call', start: at('11', '10:30'), end: at('11', '12:00'), resourceId: 'borealis', tone: 'teal', data: { owner: 'Sales' } },
  { id: 'safety', label: 'Lab safety', start: at('11', '13:00'), end: at('11', '14:00'), resourceId: 'lab', tone: 'amber', data: { owner: 'Facilities' } },
  { id: 'demo', label: 'Sprint demo', start: at('12', '15:00'), end: at('12', '16:30'), resourceId: 'borealis', data: { owner: 'Platform' } },
  { id: 'migration', label: 'Server migration', start: at('13', '18:00'), end: at('14', '09:00'), resourceId: 'lab', tone: 'amber', data: { owner: 'Platform' } },
  { id: 'retro', label: 'Retrospective', start: at('13', '11:00'), end: at('13', '12:00'), resourceId: 'atlas', tone: 'violet', data: { owner: 'Platform' } },
  { id: 'offsite', label: 'Team offsite', start: at('17'), end: at('19'), allDay: true, tone: 'teal', data: { owner: 'All' } },
  { id: 'release', label: 'Release day', start: at('13'), end: at('14'), allDay: true, color: '#c23b22', data: { owner: 'Platform' } },
  { id: 'audit', label: 'Lab audit', start: at('10'), end: at('11'), allDay: true, resourceId: 'lab', tone: 'amber', editable: false, data: { owner: 'Facilities' } },
]
// The demo clock is fixed, so the now line and Today never depend on when the demo runs.
const now = at('11', '11:15')

const history = useEditHistory(initialEvents)
const events = history.state
const view = ref<EventCalendarView>('week')
const date = ref(now)
const selectedId = ref<string>()
const showRooms = ref(true)
const readonly = ref(false)
const rtl = ref(false)
const status = ref('Drag a booking to move it, drag its bottom edge to resize it, or drag over an empty slot to book a room.')
const loaded = ref<TimeRange>(eventCalendarRange('week', now))

const formatDay = intlTimeFormatter({ format: { weekday: 'short', month: 'short', day: 'numeric' } })
const formatTime = intlTimeFormatter()
const label = (id: string) => events.value.find(event => event.id === id)?.label ?? id
function describe(range: TimeRange, allDay?: boolean) {
  return allDay ? formatDay(range.start) : `${formatDay(range.start)} ${formatTime(range.start)}–${formatTime(range.end)}`
}

/** The room booking that `range` would double-book in `resourceId`, if any. */
function conflict(range: TimeRange, resourceId: string | undefined, ignoreId?: string) {
  if (resourceId === undefined) return undefined
  return events.value.find(event => event.id !== ignoreId && event.resourceId === resourceId && event.start < range.end && range.start < event.end)
}
function validateEdit(change: EventCalendarEdit) {
  const event = events.value.find(item => item.id === change.id)
  const resourceId = change.resource?.after ?? event?.resourceId
  const other = conflict(change.after, resourceId, change.id)
  if (other) return `${roomLabel(resourceId)} is already booked for ${other.label}.`
}
function validateCreate(proposal: EventCalendarCreate) {
  const other = conflict(proposal, proposal.resourceId)
  if (other) return `${roomLabel(proposal.resourceId)} is already booked for ${other.label}.`
}
function applyEdit(change: EventCalendarEdit) {
  history.commit(events.value.map(event => event.id === change.id
    ? { ...event, ...change.after, ...(change.resource ? { resourceId: change.resource.after } : {}) } : event))
  const event = events.value.find(item => item.id === change.id)!
  const room = change.resource ? ` in ${roomLabel(change.resource.after)}` : ''
  status.value = `${event.label} → ${describe(change.after, event.allDay)}${room}.`
}
function create(proposal: EventCalendarCreate) {
  const number = unusedNumber(events.value, 'booking-')
  const resourceId = proposal.resourceId
  history.commit([...events.value, {
    id: 'booking-' + number, label: 'New booking ' + number, start: proposal.start, end: proposal.end, allDay: proposal.allDay,
    tone: 'blue', ...(resourceId ? { resourceId } : {}), data: { owner: 'You' },
  }])
  status.value = `Booked New booking ${number}, ${describe(proposal, proposal.allDay)}${resourceId ? ' in ' + roomLabel(resourceId) : ''}.`
}
function rejected(change: EventCalendarEdit | EventCalendarCreate, reason: string) {
  status.value = 'Rejected: ' + reason
}
function activate(id: string) {
  const event = events.value.find(item => item.id === id)
  if (event) status.value = `Opened ${event.label} (${event.data?.owner ?? 'no owner'}), ${describe(event, event.allDay)}${event.resourceId ? ', ' + roomLabel(event.resourceId) : ''}.`
}
function select(id: string) {
  status.value = 'Selected ' + label(id) + '.'
}
function rangeChange(range: TimeRange, current: EventCalendarView) {
  // A real application would load the bookings that overlap this range here.
  loaded.value = range
  void current
}
const loadedText = computed(() => `${formatDay(loaded.value.start)} – ${formatDay(loaded.value.end - 1)}`)
function undo() {
  history.undo()
  status.value = 'Undid the last booking change.'
}
function redo() {
  history.redo()
  status.value = 'Redid the booking change.'
}
</script>

<template>
  <DemoPanel title-id="event-calendar-title" title="Event calendar" subtitle="Day, week and month views with rooms, all-day events and bookings the parent validates and applies.">
    <template #options>
      <label><input v-model="showRooms" type="checkbox"> Rooms in day view</label>
      <label><input v-model="readonly" type="checkbox"> Read-only</label>
      <label><input v-model="rtl" type="checkbox"> Right to left</label>
      <button type="button" :disabled="!history.canUndo.value" @click="undo">Undo</button>
      <button type="button" :disabled="!history.canRedo.value" @click="redo">Redo</button>
    </template>
    <EventCalendar
      v-model:view="view" v-model:date="date" v-model:selected-id="selectedId"
      :events="events" :resources="showRooms ? rooms : undefined" :now="now" :day-start="7" :day-end="20" :height="440"
      :readonly="readonly" creatable :labels="{ region: 'Room bookings' }" :dir="rtl ? 'rtl' : 'ltr'" :validate-edit="validateEdit" :validate-create="validateCreate"
      @edit="applyEdit" @edit-rejected="rejected" @create="create" @create-rejected="rejected" @select="select"
      @event-activate="activate" @range-change="rangeChange" @edit-cancel="status = 'Drag cancelled.'"
    />
    <StatusLine label="Calendar status">{{ status }}</StatusLine>
    <p class="hint">Loaded range: {{ loadedText }}. Arrow keys move a focused booking, Shift+arrows resize it, and in the day view Left and Right move it to another room.</p>
  </DemoPanel>
</template>
