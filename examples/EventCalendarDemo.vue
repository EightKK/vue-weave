<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  EventCalendar, applyRecurringEdit, eventCalendarRange, expandRecurringEvents, intlTimeFormatter, useEditHistory, type CalendarEvent,
  type CalendarResource, type EventCalendarCreate, type EventCalendarEdit, type EventCalendarView, type RecurringEditScope, type TimeRange,
} from '../src'
import DemoPanel from './components/DemoPanel.vue'
import StatusLine from './components/StatusLine.vue'
import { unusedNumber } from './ids'
import { useDemoLocale } from './i18n'

const { t, labels, intlLocale } = useDemoLocale()

// The calendar's title comes from Intl.DateTimeFormat#formatRange, whose spacing differs between ICU versions (Node.js
// when the documentation site renders this page on the server, the browser when it hydrates), so the calendar is
// rendered once the demo has mounted. An application that renders only in the browser does not need this.
const mounted = ref(false)
onMounted(() => { mounted.value = true })

// Room bookings in an event calendar: the parent owns the events and applies the proposals of the calendar (moves,
// resizes, room changes and new bookings) as undoable steps. A room can hold one booking at a time, so `validateEdit`
// and `validateCreate` reject double bookings. All times are UTC, so the demo never depends on the local zone. The weekly
// sync is a recurring series (`recurrence`): the calendar shows its occurrences from `expandRecurringEvents`, and an edit
// of one occurrence is applied with `applyRecurringEdit` to this event, this and following events, or all of them.
const at = (date: string, time = '00:00') => Date.parse(`2026-11-${date}T${time}:00Z`)
const rooms: CalendarResource[] = [
  { id: 'atlas', label: 'Atlas', detail: t({ en: '12 seats', ja: '12 席' }) },
  { id: 'borealis', label: 'Borealis', detail: t({ en: '6 seats', ja: '6 席' }) },
  { id: 'lab', label: t({ en: 'Hardware lab', ja: 'ハードウェアラボ' }), detail: t({ en: 'Bench access', ja: '作業台あり' }) },
]
const roomLabel = (id?: string) => rooms.find(room => room.id === id)?.label
type Booking = CalendarEvent<{ owner: string }>
const initialEvents: Booking[] = [
  { id: 'standup', label: t({ en: 'Standup', ja: '朝会' }), start: at('09', '09:00'), end: at('09', '09:30'), resourceId: 'atlas', data: { owner: 'Platform' } },
  { id: 'review', label: t({ en: 'Design review', ja: 'デザインレビュー' }), start: at('11', '10:00'), end: at('11', '11:00'), resourceId: 'atlas', tone: 'violet', data: { owner: 'Design' } },
  { id: 'call', label: t({ en: 'Customer call', ja: '顧客との通話' }), start: at('11', '10:30'), end: at('11', '12:00'), resourceId: 'borealis', tone: 'teal', data: { owner: 'Sales' } },
  { id: 'safety', label: t({ en: 'Lab safety', ja: 'ラボの安全講習' }), start: at('11', '13:00'), end: at('11', '14:00'), resourceId: 'lab', tone: 'amber', data: { owner: 'Facilities' } },
  { id: 'demo', label: t({ en: 'Sprint demo', ja: 'スプリントデモ' }), start: at('12', '15:00'), end: at('12', '16:30'), resourceId: 'borealis', data: { owner: 'Platform' } },
  { id: 'migration', label: t({ en: 'Server migration', ja: 'サーバー移行' }), start: at('13', '18:00'), end: at('14', '09:00'), resourceId: 'lab', tone: 'amber', data: { owner: 'Platform' } },
  { id: 'retro', label: t({ en: 'Retrospective', ja: '振り返り' }), start: at('13', '11:00'), end: at('13', '12:00'), resourceId: 'atlas', tone: 'violet', data: { owner: 'Platform' } },
  { id: 'offsite', label: t({ en: 'Team offsite', ja: 'チーム合宿' }), start: at('17'), end: at('19'), allDay: true, tone: 'teal', data: { owner: 'All' } },
  { id: 'release', label: t({ en: 'Release day', ja: 'リリース日' }), start: at('13'), end: at('14'), allDay: true, color: '#c23b22', data: { owner: 'Platform' } },
  { id: 'audit', label: t({ en: 'Lab audit', ja: 'ラボ監査' }), start: at('10'), end: at('11'), allDay: true, resourceId: 'lab', tone: 'amber', editable: false, data: { owner: 'Facilities' } },
  {
    id: 'sync', label: t({ en: 'Weekly sync', ja: '週次定例' }), start: at('03', '16:00'), end: at('03', '16:30'), resourceId: 'borealis', tone: 'violet', data: { owner: 'Platform' },
    recurrence: { rule: 'FREQ=WEEKLY;BYDAY=TU;COUNT=8' },
  },
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
const status = ref(t({ en: 'Drag a booking to move it, drag its bottom edge to resize it, or drag over an empty slot to book a room.', ja: '予約をドラッグで移動し、下端をドラッグで伸縮します。空いている枠をドラッグすると部屋を予約できます。' }))
const loaded = ref<TimeRange>(eventCalendarRange('week', now))
const scope = ref<RecurringEditScope>('occurrence')
const scopeNames: Record<RecurringEditScope, string> = t({
  en: { occurrence: 'this event', following: 'this and following events', series: 'all events' },
  ja: { occurrence: 'この予定', following: 'この予定以降', series: 'すべての予定' },
})
/** The bookings the calendar shows: plain events and the occurrences of the series in the loaded range. */
const shown = computed(() => expandRecurringEvents(events.value, loaded.value))

const formatDay = intlTimeFormatter({ locale: intlLocale.value, format: { weekday: 'short', month: 'short', day: 'numeric' } })
const formatTime = intlTimeFormatter({ locale: intlLocale.value })
const label = (id: string) => shown.value.find(event => event.id === id)?.label ?? id
function describe(range: TimeRange, allDay?: boolean) {
  return allDay ? formatDay(range.start) : `${formatDay(range.start)} ${formatTime(range.start)}–${formatTime(range.end)}`
}

/** The room booking that `range` would double-book in `resourceId`, if any. */
function conflict(range: TimeRange, resourceId: string | undefined, ignoreId?: string) {
  if (resourceId === undefined) return undefined
  return shown.value.find(event => event.id !== ignoreId && event.resourceId === resourceId && event.start < range.end && range.start < event.end)
}
function validateEdit(change: EventCalendarEdit) {
  const event = shown.value.find(item => item.id === change.id)
  const resourceId = change.resource?.after ?? event?.resourceId
  const other = conflict(change.after, resourceId, change.id)
  if (other) return t({ en: `${roomLabel(resourceId)} is already booked for ${other.label}.`, ja: `${roomLabel(resourceId)} は ${other.label} で予約済みです。` })
}
function validateCreate(proposal: EventCalendarCreate) {
  const other = conflict(proposal, proposal.resourceId)
  if (other) return t({ en: `${roomLabel(proposal.resourceId)} is already booked for ${other.label}.`, ja: `${roomLabel(proposal.resourceId)} は ${other.label} で予約済みです。` })
}
function applyEdit(change: EventCalendarEdit) {
  if (change.occurrence) {
    // An occurrence of the weekly sync: the scope decides which occurrences change.
    const event = shown.value.find(item => item.id === change.id)!
    history.commit(applyRecurringEdit(events.value, change.occurrence, { ...change.after, ...(change.resource ? { resourceId: change.resource.after } : {}) }, scope.value))
    const room = change.resource ? t({ en: ` in ${roomLabel(change.resource.after)}`, ja: `、${roomLabel(change.resource.after)}` }) : ''
    status.value = t({ en: `${event.label} → ${describe(change.after, event.allDay)}${room} (${scopeNames[scope.value]}).`, ja: `${event.label} → ${describe(change.after, event.allDay)}${room}(${scopeNames[scope.value]})。` })
    return
  }
  history.commit(events.value.map(event => event.id === change.id
    ? { ...event, ...change.after, ...(change.resource ? { resourceId: change.resource.after } : {}) } : event))
  const event = events.value.find(item => item.id === change.id)!
  const room = change.resource ? t({ en: ` in ${roomLabel(change.resource.after)}`, ja: `、${roomLabel(change.resource.after)}` }) : ''
  status.value = t({ en: `${event.label} → ${describe(change.after, event.allDay)}${room}.`, ja: `${event.label} → ${describe(change.after, event.allDay)}${room}。` })
}
function create(proposal: EventCalendarCreate) {
  const number = unusedNumber(events.value, 'booking-')
  const resourceId = proposal.resourceId
  history.commit([...events.value, {
    id: 'booking-' + number, label: t({ en: 'New booking ', ja: '新しい予約 ' }) + number, start: proposal.start, end: proposal.end, allDay: proposal.allDay,
    tone: 'blue', ...(resourceId ? { resourceId } : {}), data: { owner: t({ en: 'You', ja: 'あなた' }) },
  }])
  status.value = t({
    en: `Booked New booking ${number}, ${describe(proposal, proposal.allDay)}${resourceId ? ' in ' + roomLabel(resourceId) : ''}.`,
    ja: `新しい予約 ${number} を登録しました(${describe(proposal, proposal.allDay)}${resourceId ? '、' + roomLabel(resourceId) : ''})。`,
  })
}
function rejected(change: EventCalendarEdit | EventCalendarCreate, reason: string) {
  status.value = t({ en: 'Rejected: ', ja: '却下: ' }) + reason
}
function activate(id: string) {
  const event = shown.value.find(item => item.id === id)
  if (event) {
    status.value = t({
      en: `Opened ${event.label} (${event.data?.owner ?? 'no owner'}), ${describe(event, event.allDay)}${event.resourceId ? ', ' + roomLabel(event.resourceId) : ''}.`,
      ja: `${event.label} を開きました(${event.data?.owner ?? '担当なし'})。${describe(event, event.allDay)}${event.resourceId ? '、' + roomLabel(event.resourceId) : ''}。`,
    })
  }
}
function select(id: string) {
  status.value = t({ en: 'Selected ' + label(id) + '.', ja: label(id) + ' を選択しました。' })
}
function rangeChange(range: TimeRange, current: EventCalendarView) {
  // A real application would load the bookings that overlap this range here.
  loaded.value = range
  void current
}
const loadedText = computed(() => `${formatDay(loaded.value.start)} – ${formatDay(loaded.value.end - 1)}`)
function undo() {
  history.undo()
  status.value = t({ en: 'Undid the last booking change.', ja: '直前の予約の変更を元に戻しました。' })
}
function redo() {
  history.redo()
  status.value = t({ en: 'Redid the booking change.', ja: '予約の変更をやり直しました。' })
}
</script>

<template>
  <DemoPanel title-id="event-calendar-title" :title="t({ en: 'Event calendar', ja: 'イベントカレンダー' })" :subtitle="t({ en: 'Day, week and month views with rooms, all-day events and bookings the parent validates and applies.', ja: '部屋、終日予定、親が検証して適用する予約を、日・週・月で表示します。' })">
    <template #options>
      <label><input v-model="showRooms" type="checkbox"> {{ t({ en: 'Rooms in day view', ja: '日表示で部屋ごとに表示' }) }}</label>
      <label><input v-model="readonly" type="checkbox"> {{ t({ en: 'Read-only', ja: '読み取り専用' }) }}</label>
      <label><input v-model="rtl" type="checkbox"> {{ t({ en: 'Right to left', ja: '右から左' }) }}</label>
      <label>{{ t({ en: 'Recurring edits', ja: '繰り返し予定の編集' }) }} <select v-model="scope"><option value="occurrence">{{ t({ en: 'This event', ja: 'この予定' }) }}</option><option value="following">{{ t({ en: 'This and following', ja: 'この予定以降' }) }}</option><option value="series">{{ t({ en: 'All events', ja: 'すべての予定' }) }}</option></select></label>
      <button type="button" :disabled="!history.canUndo.value" @click="undo">{{ t({ en: 'Undo', ja: '元に戻す' }) }}</button>
      <button type="button" :disabled="!history.canRedo.value" @click="redo">{{ t({ en: 'Redo', ja: 'やり直す' }) }}</button>
    </template>
    <EventCalendar
      v-if="mounted" v-model:view="view" v-model:date="date" v-model:selected-id="selectedId"
      :events="shown" :resources="showRooms ? rooms : undefined" :now="now" :day-start="7" :day-end="20" :height="440"
      :readonly="readonly" creatable :labels="{ ...labels.eventCalendar, region: t({ en: 'Room bookings', ja: '会議室の予約' }) }" :locale="intlLocale" :dir="rtl ? 'rtl' : 'ltr'" :validate-edit="validateEdit" :validate-create="validateCreate"
      @edit="applyEdit" @edit-rejected="rejected" @create="create" @create-rejected="rejected" @select="select"
      @event-activate="activate" @range-change="rangeChange" @edit-cancel="status = 'Drag cancelled.'"
    />
    <div v-else class="event-calendar-placeholder" />
    <StatusLine :label="t({ en: 'Calendar status', ja: 'カレンダーの状態' })">{{ status }}</StatusLine>
    <p class="hint">{{ t({
      en: `Loaded range: ${loadedText}. Arrow keys move a focused booking, Shift+arrows resize it, and in the day view Left and Right move it to another room. The weekly sync repeats every Tuesday; "Recurring edits" chooses which of its occurrences an edit changes.`,
      ja: `読み込んだ範囲: ${loadedText}。フォーカスした予約は矢印キーで移動、Shift+矢印で伸縮し、日表示では左右キーで別の部屋へ移動します。週次定例は毎週火曜日に繰り返し、「繰り返し予定の編集」で編集の対象を選びます。`,
    }) }}</p>
  </DemoPanel>
</template>
