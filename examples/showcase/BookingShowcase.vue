<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  GanttChart, calendarBands, type TimeRange, type TimelineBar, type TimelineEdit, type TimelineMarker, type TimelineRow,
  type TimelineSelectDetail, type TimelineZoomState,
} from '../../src'
import { day } from '../data'
import { useDemoLocale } from '../i18n'

const { t, labels, isJapanese } = useDemoLocale()

// Fixed dates in UTC milliseconds keep the calendar deterministic. Day 0 is Monday 23 November 2026; stays run from
// noon on the arrival day to noon on the departure day, and "today" is Wednesday 25 November at noon.
const start = Date.UTC(2026, 10, 23)
const range: TimeRange = { start, end: start + 14 * day }
const noon = (offset: number) => start + offset * day + day / 2
const today = noon(2)
const pixelsPerDay = 75

const weekdays = t({ en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], ja: ['日', '月', '火', '水', '木', '金', '土'] })
const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
// Bar names and tick labels read "Wed 25"; the bar slot and the tick slot add the rest.
const formatTime = (time: number) => {
  const date = new Date(time)
  return isJapanese.value ? `${date.getUTCDate()}日(${weekdays[date.getUTCDay()]})` : `${weekdays[date.getUTCDay()]} ${date.getUTCDate()}`
}
const headerBands = [calendarBands(range, 'month', {
  label: from => t({
    en: `${months[new Date(from).getUTCMonth()]} ${new Date(from).getUTCFullYear()}`,
    ja: `${new Date(from).getUTCFullYear()}年${new Date(from).getUTCMonth() + 1}月`,
  }),
})]
// Saturdays and Sundays of the two weeks.
const weekends: TimeRange[] = [5, 12].map(offset => ({ start: start + offset * day, end: start + (offset + 2) * day }))
const markers: TimelineMarker[] = [{ id: 'today', time: today, label: t({ en: 'Today', ja: '今日' }) }]

type RoomType = 'Single' | 'Double' | 'Suite'
const roomTypes: Record<RoomType, string> = t({
  en: { Single: 'Single', Double: 'Double', Suite: 'Suite' },
  ja: { Single: 'シングル', Double: 'ダブル', Suite: 'スイート' },
})
interface Room { floor: number; number: string; type: RoomType; clean: boolean }
const rooms: Room[] = [
  { floor: 1, number: '101', type: 'Single', clean: true },
  { floor: 1, number: '102', type: 'Double', clean: false },
  { floor: 1, number: '103', type: 'Double', clean: true },
  { floor: 1, number: '104', type: 'Suite', clean: true },
  { floor: 2, number: '201', type: 'Single', clean: false },
  { floor: 2, number: '202', type: 'Double', clean: true },
  { floor: 2, number: '203', type: 'Suite', clean: true },
  { floor: 3, number: '301', type: 'Double', clean: true },
  { floor: 3, number: '302', type: 'Double', clean: false },
  { floor: 3, number: '303', type: 'Suite', clean: true },
]
const floors = [1, 2, 3]
const roomById = new Map(rooms.map(room => [`room-${room.number}`, room]))
// Floors are parent rows; rooms are their children.
const rows: TimelineRow[] = floors.flatMap(floor => [
  { id: `floor-${floor}`, label: t({ en: `Floor ${floor}`, ja: `${floor}階` }) },
  ...rooms.filter(room => room.floor === floor).map(room => ({ id: `room-${room.number}`, parentId: `floor-${floor}`, label: t({ en: `Room ${room.number}`, ja: `${room.number}号室` }) })),
])

type Status = 'confirmed' | 'checked-in' | 'pending' | 'blocked'
type Channel = 'Direct' | 'OTA' | 'Corporate'
interface StayInfo { status: Status; channel?: Channel; note?: string }
// Each status maps to one tone, and the stylesheet below restyles the four tones of this chart.
const tones = { confirmed: 'blue', 'checked-in': 'teal', pending: 'amber', blocked: 'violet' } as const
const statusLabels: Record<Status, string> = t({
  en: { confirmed: 'Confirmed', 'checked-in': 'Checked in', pending: 'Pending', blocked: 'Out of order' },
  ja: { confirmed: '確定', 'checked-in': 'チェックイン済み', pending: '仮予約', blocked: '使用不可' },
})
const channelLabels: Record<Channel, string> = t({
  en: { Direct: 'Direct', OTA: 'OTA', Corporate: 'Corporate' },
  ja: { Direct: '直販', OTA: 'OTA', Corporate: '法人' },
})

function stay(room: string, label: string, from: number, to: number, info: StayInfo): TimelineBar<StayInfo> {
  return {
    id: `${room}-${from}`, rowId: `room-${room}`, label, start: noon(from), end: noon(to), editable: true, tone: tones[info.status], data: info,
  }
}
const initialStays = [
  stay('101', 'Lena Fischer', -2, 3, { status: 'checked-in', channel: 'Direct' }),
  stay('101', 'Arjun Mehta', 4, 7, { status: 'confirmed', channel: 'OTA' }),
  stay('101', 'Sophie Laurent', 9, 11, { status: 'pending', channel: 'Direct' }),
  stay('102', 'Kenji Tanaka', 0, 2, { status: 'checked-in', channel: 'Corporate' }),
  stay('102', 'Olivia Brown', 2, 6, { status: 'confirmed', channel: 'OTA' }),
  stay('102', 'Mateo García', 8, 12, { status: 'confirmed', channel: 'Direct' }),
  stay('103', 'Nora Lindqvist', 3, 5, { status: 'confirmed', channel: 'Corporate' }),
  stay('103', 'Ade Ogunleye', 6, 9, { status: 'pending', channel: 'OTA' }),
  stay('104', 'Isabella Rossi', -1, 4, { status: 'checked-in', channel: 'Direct' }),
  stay('104', 'Chen Wei', 5, 10, { status: 'confirmed', channel: 'Corporate' }),
  stay('201', 'Jonas Weber', 1, 3, { status: 'checked-in', channel: 'Corporate' }),
  stay('201', 'Amélie Dubois', 5, 8, { status: 'confirmed', channel: 'OTA' }),
  stay('201', 'Inês Costa', 10, 13, { status: 'pending', channel: 'OTA' }),
  stay('202', 'Hannah Schmidt', 2, 4, { status: 'confirmed', channel: 'Direct' }),
  stay('202', 'Luca Bianchi', 7, 10, { status: 'pending', channel: 'OTA' }),
  stay('202', 'Yuki Sato', 11, 13, { status: 'confirmed', channel: 'Direct' }),
  stay('203', t({ en: 'Maintenance 203', ja: '保守 203' }), 3, 6, { status: 'blocked', note: t({ en: 'Bathroom refit', ja: '浴室の改修' }) }),
  stay('203', 'Daniel Kim', 8, 12, { status: 'confirmed', channel: 'Corporate' }),
  stay('301', 'Aisha Khan', 0, 5, { status: 'checked-in', channel: 'OTA' }),
  stay('301', 'Tom Becker', 6, 8, { status: 'pending', channel: 'Direct' }),
  stay('302', 'Sara Haddad', 3, 6, { status: 'confirmed', channel: 'Direct' }),
  stay('302', 'Max Müller', 6, 9, { status: 'confirmed', channel: 'OTA' }),
  stay('303', 'Ruth Ellis', 4, 9, { status: 'confirmed', channel: 'Corporate' }),
  stay('303', t({ en: 'Maintenance 303', ja: '保守 303' }), 10, 12, { status: 'blocked', note: t({ en: 'Carpet replacement', ja: 'カーペットの交換' }) }),
]

// Controlled state: the chart proposes edits and this component applies the accepted ones to its own copies.
const stays = ref(initialStays)
const selectedIds = ref<ReadonlySet<string>>(new Set())
const collapsedFloors = ref<ReadonlySet<string>>(new Set())
const zoom = ref(1)
const status = ref(t({
  en: 'Drag a stay, or focus it and use the arrow keys: Left and Right move it by a night, Shift and Alt change check-out and check-in, Up and Down change the room. Click empty chart space or press Escape to clear the selection.',
  ja: '宿泊をドラッグするか、フォーカスして矢印キーを使います。左右で1泊ずつ移動、Shift と Alt でチェックアウトとチェックインを変更、上下で客室を変えます。何もない所をクリックするか Escape で選択を解除します。',
}))

const infoOf = (bar: TimelineBar<StayInfo>) => bar.data ?? { status: 'confirmed' as const }
const nights = (bar: TimeRange) => Math.round((bar.end - bar.start) / day)
const nightsText = (count: number) => t({ en: `${count} night${count === 1 ? '' : 's'}`, ja: `${count}泊` })
const roomNumber = (rowId: string) => roomById.get(rowId)?.number ?? rowId
const isRoom = (rowId: string) => roomById.has(rowId)

// Tonight's figures follow the data, so they change when a stay is moved.
const inHouse = computed(() => stays.value.filter(bar => infoOf(bar).status !== 'blocked' && bar.start <= today && bar.end > today))
const occupancy = computed(() => Math.round(100 * new Set(inHouse.value.map(bar => bar.rowId)).size / rooms.length))
const arrivals = computed(() => stays.value.filter(bar => infoOf(bar).status !== 'blocked' && bar.start === today).length)
const departures = computed(() => stays.value.filter(bar => infoOf(bar).status !== 'blocked' && bar.end === today).length)
function floorSummary(rowId: string) {
  const onFloor = rooms.filter(room => `floor-${room.floor}` === rowId).map(room => `room-${room.number}`)
  const occupied = new Set(inHouse.value.map(bar => bar.rowId).filter(id => onFloor.includes(id))).size
  return t({ en: `${occupied} of ${onFloor.length} occupied tonight`, ja: `今夜 ${onFloor.length} 室中 ${occupied} 室使用` })
}

// With rowDraggable, Up and Down (or a drag) can land on a floor heading. The app then continues in the direction of
// travel to the nearest displayed room, so a stay can cross from one floor to the next.
const displayedRowIds = computed(() => rows.filter(row => !row.parentId || !collapsedFloors.value.has(row.parentId)).map(row => row.id))
function targetRoom(change: TimelineEdit, bar: TimelineBar): string | undefined {
  if (!change.row) return bar.rowId
  if (isRoom(change.row.after)) return change.row.after
  const shown = displayedRowIds.value
  const from = shown.indexOf(change.row.before), to = shown.indexOf(change.row.after)
  const step = to > from ? 1 : -1
  for (let index = to + step; index >= 0 && index < shown.length; index += step) if (isRoom(shown[index]!)) return shown[index]
  return undefined
}

// Synchronous rules, checked before the chart emits `edit`. The returned text is announced and shown in the status line.
function validateEdit(change: TimelineEdit): true | string {
  const bar = stays.value.find(item => item.id === change.id)
  if (!bar) return t({ en: 'This stay no longer exists.', ja: 'この宿泊はもうありません。' })
  const info = infoOf(bar)
  const room = targetRoom(change, bar)
  const { start: from, end: to } = change.after
  if (!room) {
    const above = change.row && displayedRowIds.value.indexOf(change.row.after) < displayedRowIds.value.indexOf(change.row.before)
    return t({
      en: `There is no room ${above ? 'above' : 'below'} Room ${roomNumber(bar.rowId)}.`,
      ja: `${roomNumber(bar.rowId)}号室の${above ? '上' : '下'}に客室はありません。`,
    })
  }
  if (info.status === 'blocked' && room !== bar.rowId) return t({ en: 'Maintenance blocks stay with their room.', ja: '保守の期間は客室を移せません。' })
  if (info.status === 'checked-in' && (change.mode !== 'end' || room !== bar.rowId)) return t({ en: `${bar.label} is already checked in, so only the check-out can change.`, ja: `${bar.label} はチェックイン済みのため、チェックアウトだけを変更できます。` })
  if (from !== bar.start && from < today) return t({ en: `${bar.label} can't arrive before today (${formatTime(today)}).`, ja: `${bar.label} の到着を今日(${formatTime(today)})より前にはできません。` })
  if (to < today) return t({ en: `${bar.label} can't check out before today (${formatTime(today)}).`, ja: `${bar.label} のチェックアウトを今日(${formatTime(today)})より前にはできません。` })
  const clash = stays.value.find(other => other.id !== bar.id && other.rowId === room && other.start < to && from < other.end)
  if (clash) {
    return infoOf(clash).status === 'blocked'
      ? t({
        en: `Room ${roomNumber(room)} is out of order ${formatTime(clash.start)}–${formatTime(clash.end)}.`,
        ja: `${roomNumber(room)}号室は ${formatTime(clash.start)}–${formatTime(clash.end)} に使用できません。`,
      })
      : t({
        en: `Room ${roomNumber(room)} is taken by ${clash.label} ${formatTime(clash.start)}–${formatTime(clash.end)}.`,
        ja: `${roomNumber(room)}号室は ${clash.label} ${formatTime(clash.start)}–${formatTime(clash.end)} の予約で埋まっています。`,
      })
  }
  return true
}
function applyEdit(change: TimelineEdit) {
  const bar = stays.value.find(item => item.id === change.id)
  const room = bar && targetRoom(change, bar)
  if (!bar || !room) return
  stays.value = stays.value.map(item => item.id === bar.id ? { ...item, rowId: room, start: change.after.start, end: change.after.end } : item)
  const when = `${formatTime(change.after.start)}–${formatTime(change.after.end)} (${nightsText(nights(change.after))})`
  status.value = room !== bar.rowId
    ? t({ en: `Moved ${bar.label} to Room ${roomNumber(room)}, ${when}.`, ja: `${bar.label} を ${roomNumber(room)}号室、${when} に移動しました。` })
    : change.mode === 'move'
      ? t({ en: `Moved ${bar.label} to ${when} in Room ${roomNumber(room)}.`, ja: `${bar.label} を ${roomNumber(room)}号室の ${when} に移動しました。` })
      : t({ en: `${bar.label} now stays ${when}.`, ja: `${bar.label} の宿泊は ${when} になりました。` })
}
function reject(_change: TimelineEdit, reason: string) {
  status.value = reason
}
// The click that ends a drag also emits select (detail.dragged); it keeps the message about the move.
function select(id: string, selection: TimelineSelectDetail) {
  const bar = stays.value.find(item => item.id === id)
  if (!bar) return
  selectedIds.value = new Set([id])
  if (selection.dragged) return
  const info = infoOf(bar)
  const detail = info.status === 'blocked' ? info.note : `${nightsText(nights(bar))} · ${info.channel ? channelLabels[info.channel] : ''}`
  status.value = t({
    en: `${bar.label} · Room ${roomNumber(bar.rowId)} · ${formatTime(bar.start)}–${formatTime(bar.end)} · ${detail} · ${statusLabels[info.status]}.`,
    ja: `${bar.label} · ${roomNumber(bar.rowId)}号室 · ${formatTime(bar.start)}–${formatTime(bar.end)} · ${detail} · ${statusLabels[info.status]}。`,
  })
}
// A click on empty chart space or Escape in the chart clears the selection.
function clearSelection() {
  if (!selectedIds.value.size) return
  selectedIds.value = new Set()
  status.value = t({ en: 'Selection cleared.', ja: '選択を解除しました。' })
}
// Escape first cancels an edit in flight (reported through `edit-cancel`); only an Escape that cancels nothing and is
// not typed into a field clears the selection.
let escapeCancelledEdit = false
function startChartEscape() { escapeCancelledEdit = false }
function noteEditCancel() { escapeCancelledEdit = true }
function onChartEscape(event: KeyboardEvent) {
  const cancelled = escapeCancelledEdit
  escapeCancelledEdit = false
  if (cancelled || event.defaultPrevented || (event.target as Element | null)?.closest('input, textarea, select')) return
  clearSelection()
}
// A stay that began before the visible range keeps its text in view: the part before the axis start is skipped.
const hiddenLead = (shown: TimeRange) => shown.start < range.start ? `${(range.start - shown.start) / day * pixelsPerDay * zoom.value}px` : undefined
function onZoom(state: TimelineZoomState) {
  zoom.value = state.zoom
}
const isWeekend = (time: number) => [0, 6].includes(new Date(time).getUTCDay())
const isToday = (time: number) => time === today - day / 2
const editBounds = { start: start - 3 * day + day / 2, end: range.end - day / 2 }
const legend: { status: Status; label: string }[] = (['confirmed', 'checked-in', 'pending', 'blocked'] as const)
  .map(item => ({ status: item, label: statusLabels[item] }))
</script>

<template>
  <section class="showcase sc-booking" aria-labelledby="sc-booking-title" :style="{ '--sc-booking-day': `${pixelsPerDay * zoom}px` }">
    <div class="sc-booking-head">
      <div>
        <h2 id="sc-booking-title">{{ t({ en: 'Room bookings', ja: '客室予約' }) }}</h2>
        <p>{{ t({
          en: 'A dark resource calendar: rooms grouped by floor, noon-to-noon stays drawn as status pills, weekday ticks, weekend shading and a Today marker. Stays can be dragged to other dates or rooms; overlaps are refused.',
          ja: 'ダークなリソースカレンダーです。客室をフロアごとにまとめ、正午から正午までの宿泊をステータス付きのバーで表し、曜日の目盛り、週末の網掛け、今日のマーカーを表示します。宿泊は別の日付や客室へドラッグでき、重なる移動は拒否されます。',
        }) }}</p>
      </div>
      <dl class="sc-booking-kpis">
        <div><dt>{{ t({ en: 'Occupied tonight', ja: '今夜の稼働率' }) }}</dt><dd>{{ occupancy }}%</dd></div>
        <div><dt>{{ t({ en: 'Arrivals today', ja: '本日の到着' }) }}</dt><dd>{{ arrivals }}</dd></div>
        <div><dt>{{ t({ en: 'Departures today', ja: '本日の出発' }) }}</dt><dd>{{ departures }}</dd></div>
      </dl>
    </div>

    <div @keydown.esc.capture="startChartEscape" @keydown.esc="onChartEscape">
    <GanttChart
      v-model:collapsed-ids="collapsedFloors" :rows="rows" :bars="stays" :range="range" :pixels-per-unit="pixelsPerDay / day"
      :tick-steps="[day]" :snap="day" :min-duration="day" :edit-bounds="editBounds" :format-time="formatTime"
      :header-bands="headerBands" :non-working-periods="weekends" :markers="markers" :selected-ids="selectedIds"
      :row-height="48" height="auto" row-draggable :validate-edit="validateEdit"
      :labels="{ ...labels.gantt, region: t({ en: 'Room booking calendar', ja: '客室予約カレンダー' }), rows: t({ en: 'Rooms', ja: '客室' }) }"
      sticky-band-labels @edit="applyEdit" @edit-rejected="reject" @select="select" @zoom-change="onZoom"
      @background-click="clearSelection" @edit-cancel="noteEditCancel"
    >
      <template #legend>
        <ul class="sc-booking-legend" :aria-label="t({ en: 'Legend', ja: '凡例' })">
          <li v-for="item in legend" :key="item.status"><i :class="`sc-booking-swatch sc-booking-${item.status}`" aria-hidden="true"></i>{{ item.label }}</li>
          <li class="sc-booking-legend-gap"><i class="sc-booking-dot sc-booking-clean" aria-hidden="true"></i>{{ t({ en: 'Clean', ja: '清掃済み' }) }}</li>
          <li><i class="sc-booking-dot sc-booking-dirty" aria-hidden="true"></i>{{ t({ en: 'Needs cleaning', ja: '要清掃' }) }}</li>
        </ul>
      </template>
      <template #row-heading>
        <span class="sc-booking-corner">{{ t({ en: 'Rooms', ja: '客室' }) }} <small>{{ rooms.length }}</small></span>
      </template>
      <template #tick="{ time }">
        <span class="sc-booking-tick" :class="{ 'sc-booking-tick-today': isToday(time), 'sc-booking-tick-weekend': isWeekend(time) }">
          <small>{{ weekdays[new Date(time).getUTCDay()] }}</small>
          <b>{{ new Date(time).getUTCDate() }}</b>
        </span>
      </template>
      <template #row="{ row }">
        <span v-if="roomById.get(row.id)" class="sc-booking-room">
          <b>{{ roomById.get(row.id)!.number }}</b>
          <span class="sc-booking-type">{{ roomTypes[roomById.get(row.id)!.type] }}</span>
          <span class="sc-booking-hk">
            <i class="sc-booking-dot" :class="roomById.get(row.id)!.clean ? 'sc-booking-clean' : 'sc-booking-dirty'" aria-hidden="true"></i>
            {{ roomById.get(row.id)!.clean ? t({ en: 'Clean', ja: '清掃済み' }) : t({ en: 'Needs cleaning', ja: '要清掃' }) }}
          </span>
        </span>
        <span v-else class="sc-booking-floor">
          <b>{{ row.label }}</b>
          <small>{{ floorSummary(row.id) }}</small>
        </span>
      </template>
      <template #bar="{ bar, range: shown }">
        <span v-if="infoOf(bar).status === 'blocked'" class="sc-booking-stay">
          <span class="sc-booking-guest">
            <svg class="sc-booking-wrench" viewBox="0 0 16 16" aria-hidden="true"><path d="M10.6 1.5a4 4 0 0 0-4 5.1L1.9 11.3a1.6 1.6 0 1 0 2.3 2.3l4.7-4.7a4 4 0 0 0 5.1-4l-2.3 2.3-2.2-.6-.6-2.2 2.3-2.3a4 4 0 0 0-.6-.6Z" /></svg>
            {{ t({ en: 'Out of order', ja: '使用不可' }) }}
          </span>
          <span class="sc-booking-meta">{{ infoOf(bar).note }}</span>
        </span>
        <span v-else class="sc-booking-stay" :style="{ paddingInlineStart: hiddenLead(shown) }">
          <span class="sc-booking-guest">{{ bar.label }}</span>
          <span class="sc-booking-meta">
            {{ nightsText(nights(shown)) }}
            <span v-if="nights(shown) > 1 && infoOf(bar).channel" class="sc-booking-channel">{{ channelLabels[infoOf(bar).channel!] }}</span>
          </span>
        </span>
      </template>
    </GanttChart>
    </div>
    <p class="sc-booking-status" role="status">{{ status }}</p>
  </section>
</template>

<style>
.sc-booking {
  color-scheme: dark;
  --vw-surface: #131824;
  --vw-surface-muted: #171d2b;
  --vw-surface-hover: #232b3c;
  --vw-text: #e7eaf3;
  --vw-muted: #8c95aa;
  --vw-border: #242b3b;
  --vw-grid: #1d2332;
  --vw-accent: #9aa8ff;
  --vw-on-solid: #fff;
  --vw-non-working: #1a2131;
  --vw-marker: #ff5f7e;
  --vw-marker-ink: #fff;
  --vw-blue-solid: #5468eb;
  --vw-teal-solid: #1fb488;
  --vw-amber-solid: #f0a948;
  --vw-violet-solid: #3a4357;
  color: var(--vw-text);
}
.showcase.sc-booking { background: #0d111a; border-color: #1c2230; border-radius: 18px; padding: 22px; }
.sc-booking-head { display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: 16px 28px; margin-bottom: 16px; }
.sc-booking-head h2 { font-size: 20px; letter-spacing: -.02em; margin: 0 0 4px; }
.sc-booking-head p { margin: 0; max-width: 70ch; font-size: 13px; color: var(--vw-muted); }
.sc-booking-kpis { display: flex; gap: 8px; margin: 0; }
.sc-booking-kpis > div { min-width: 104px; padding: 8px 12px; border: 1px solid var(--vw-border); border-radius: 12px; background: #131824; }
.sc-booking-kpis dt { font-size: 10.5px; color: var(--vw-muted); }
.sc-booking-kpis dd { margin: 2px 0 0; font-size: 19px; font-weight: 700; font-variant-numeric: tabular-nums; }

/* Frame, toolbar and header. */
.sc-booking .vw-gantt { --vw-row-label-width: 202px; border: 1px solid var(--vw-border); border-radius: 14px; overflow: hidden; background: var(--vw-surface); }
.sc-booking .vw-gantt-toolbar { padding: 10px 14px; background: var(--vw-surface); }
.sc-booking .vw-gantt-scroll { border-bottom: 0; border-top-color: var(--vw-border); background: var(--vw-surface); }
.sc-booking .vw-gantt-zoom { border-color: #2a3245; border-radius: 999px; background: #1a2030; }
.sc-booking .vw-gantt-zoom button { background: transparent; color: var(--vw-text); }
.sc-booking .vw-gantt-zoom button:not(:disabled):hover { background: #262f42; }
.sc-booking .vw-gantt-head { background: #10151f; border-bottom-color: var(--vw-border); }
.sc-booking .vw-gantt-corner { background: #10151f; border-right-color: var(--vw-border); justify-content: flex-end; padding-bottom: 10px; }
.sc-booking .vw-gantt-band { padding: 6px 12px; border-color: var(--vw-border); color: #c5cbe0; font-size: 12px; font-weight: 650; letter-spacing: .01em; }
.sc-booking .vw-gantt-tick-line { background: var(--vw-border); }
.sc-booking .vw-gantt-tick { top: 0; height: 40px; width: var(--sc-booking-day); padding: 0; display: flex; align-items: center; justify-content: center; }
.sc-booking .vw-gantt-tick.vw-is-end { display: none; }
.sc-booking-tick { display: flex; flex-direction: column; align-items: center; line-height: 1; gap: 2px; }
.sc-booking-tick small { font-size: 9.5px; font-weight: 650; letter-spacing: .08em; text-transform: uppercase; color: var(--vw-muted); }
.sc-booking-tick b { display: grid; place-items: center; min-width: 22px; height: 20px; padding: 0 4px; border-radius: 999px; font-size: 13px; color: var(--vw-text); }
.sc-booking-tick-weekend b, .sc-booking-tick-weekend small { color: #6f7890; }
.sc-booking-tick-today small { color: var(--vw-marker); }
.sc-booking-tick-today b { background: var(--vw-marker); color: #fff; }
.sc-booking-corner { font-size: 11px; font-weight: 650; letter-spacing: .08em; text-transform: uppercase; color: var(--vw-muted); }
.sc-booking-corner small { margin-inline-start: 4px; padding: 1px 6px; border-radius: 999px; background: #1d2433; color: var(--vw-text); letter-spacing: 0; }

/* Rows: floors read as section headings (the row slot marks them, :has picks the row), rooms show number, type and housekeeping. */
.sc-booking .vw-gantt-row { border-bottom-color: #1b2130; }
.sc-booking .vw-gantt-row:has(.sc-booking-floor) { background: rgb(255 255 255 / 1.5%); }
.sc-booking .vw-gantt-row-label { background: var(--vw-surface); border-right-color: var(--vw-border); }
.sc-booking .vw-gantt-row-label:has(.sc-booking-floor) { background: #10151f; }
.sc-booking .vw-row-content { flex: 1; }
.sc-booking .vw-row-toggle { color: var(--vw-muted); }
.sc-booking-floor { display: flex; flex-direction: column; gap: 1px; }
.sc-booking-floor b { font-size: 11px; letter-spacing: .1em; text-transform: uppercase; }
.sc-booking-floor small { font-size: 10.5px; color: var(--vw-muted); }
.sc-booking-room { display: grid; grid-template-columns: auto 1fr; grid-template-rows: auto auto; align-items: center; column-gap: 10px; }
.sc-booking-room b { grid-row: span 2; font-size: 15px; font-variant-numeric: tabular-nums; letter-spacing: .01em; }
.sc-booking-type { font-size: 11.5px; font-weight: 600; color: #c9cfe0; }
.sc-booking-hk { display: inline-flex; align-items: center; gap: 5px; font-size: 10.5px; color: var(--vw-muted); white-space: nowrap; }
.sc-booking-dot { flex: none; display: inline-block; width: 7px; height: 7px; border-radius: 50%; }
.sc-booking-clean { background: #3ddc97; box-shadow: 0 0 0 3px rgb(61 220 151 / 14%); }
.sc-booking-dirty { background: #ff8a65; box-shadow: 0 0 0 3px rgb(255 138 101 / 14%); }

/* Today marker. */
.sc-booking .vw-gantt-marker { border-left: 2px solid var(--vw-marker); z-index: 2; }
.sc-booking .vw-gantt-marker span { padding: 2px 8px 3px 6px; border-radius: 0 999px 999px 0; font-size: 10px; font-weight: 700; letter-spacing: .04em; }

/* Stays: soft pills, one look per status tone, no outlines. */
.sc-booking .vw-gantt-bar {
  padding: 0 14px 0 15px; border: 0; border-radius: 999px; overflow: hidden;
  box-shadow: inset 0 1px 0 rgb(255 255 255 / 10%), 0 6px 14px rgb(0 0 0 / 28%);
  transition: filter .15s;
}
.sc-booking .vw-gantt-bar:hover { filter: brightness(1.08); }
.sc-booking .vw-gantt-bar.vw-tone-blue { background: linear-gradient(90deg, #4d63e6, #6f80f4); color: #fff; }
.sc-booking .vw-gantt-bar.vw-tone-teal { background: linear-gradient(90deg, #14a57b, #34c99d); color: #03271c; }
.sc-booking .vw-gantt-bar.vw-tone-amber { background: rgb(240 169 72 / 13%); color: #f7c47a; box-shadow: inset 0 0 0 1px rgb(240 169 72 / 42%); }
.sc-booking .vw-gantt-bar.vw-tone-violet {
  background: repeating-linear-gradient(-45deg, #283042 0 6px, #202736 6px 12px); color: #a6afc4;
  box-shadow: inset 0 0 0 1px #343d52;
}
.sc-booking .vw-gantt-bar.vw-is-selected { box-shadow: 0 0 0 2px var(--vw-surface), 0 0 0 4px #fff, 0 8px 18px rgb(0 0 0 / 35%); }
.sc-booking .vw-gantt-bar.vw-is-dragging { filter: brightness(1.12); box-shadow: 0 12px 26px rgb(0 0 0 / 45%); }
.sc-booking .vw-gantt-bar:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
.sc-booking .vw-bar-handle::after { top: 32%; bottom: 32%; width: 2px; border-radius: 1px; }
.sc-booking-stay { display: flex; flex: 1; flex-direction: column; justify-content: center; gap: 2px; min-width: 0; line-height: 1.15; }
.sc-booking-guest { display: flex; align-items: center; gap: 5px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-size: 12px; font-weight: 700; }
.sc-booking-meta { display: flex; align-items: center; gap: 6px; overflow: hidden; white-space: nowrap; font-size: 10.5px; font-weight: 550; opacity: .82; }
.sc-booking-channel { padding: 1px 6px; border-radius: 999px; background: rgb(255 255 255 / 18%); font-size: 8.5px; font-weight: 750; letter-spacing: .06em; text-transform: uppercase; }
.sc-booking .vw-tone-teal .sc-booking-channel { background: rgb(3 39 28 / 16%); }
.sc-booking .vw-tone-amber .sc-booking-channel { background: rgb(240 169 72 / 18%); }
.sc-booking-wrench { flex: none; width: 11px; height: 11px; fill: currentColor; }

/* Legend in the chart toolbar. */
.sc-booking-legend { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 14px; margin: 0; padding: 0; list-style: none; font-size: 11.5px; color: #c5cbe0; }
.sc-booking-legend li { display: inline-flex; align-items: center; gap: 6px; }
.sc-booking-legend .sc-booking-legend-gap { margin-inline-start: 8px; padding-inline-start: 14px; border-inline-start: 1px solid var(--vw-border); }
.sc-booking-swatch { width: 22px; height: 10px; border-radius: 999px; }
.sc-booking-swatch.sc-booking-confirmed { background: linear-gradient(90deg, #4d63e6, #6f80f4); }
.sc-booking-swatch.sc-booking-checked-in { background: linear-gradient(90deg, #14a57b, #34c99d); }
.sc-booking-swatch.sc-booking-pending { background: rgb(240 169 72 / 13%); box-shadow: inset 0 0 0 1px rgb(240 169 72 / 55%); }
.sc-booking-swatch.sc-booking-blocked { background: repeating-linear-gradient(-45deg, #2c3446 0 3px, #202736 3px 6px); box-shadow: inset 0 0 0 1px #3a4458; }
.sc-booking-status { margin: 12px 2px 0; min-height: 18px; font-size: 12.5px; color: var(--vw-muted); }

@media (max-width: 700px) {
  .showcase.sc-booking { padding: 14px 12px; border-radius: 14px; }
  .sc-booking .vw-gantt { --vw-row-label-width: 116px; }
  .sc-booking-kpis { width: 100%; }
  .sc-booking-kpis > div { flex: 1; min-width: 0; padding: 7px 9px; }
  .sc-booking-kpis dd { font-size: 16px; }
  .sc-booking-hk { font-size: 0; gap: 0; }
  .sc-booking-room { column-gap: 7px; }
  .sc-booking-floor small { display: none; }
  .sc-booking-legend .sc-booking-legend-gap { margin: 0; padding: 0; border: 0; }
}
</style>
