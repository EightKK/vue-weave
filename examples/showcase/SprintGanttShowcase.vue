<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import {
  GanttChart, calendarBands, type TimelineBar, type TimelineColumn, type TimelineDependency, type TimelineEdit,
  type TimelineProgressEdit, type TimelineRow, type TimelineSelectDetail, type TimeRange,
} from '../../src'

// A classic task Gantt for a four-week sprint: a task list with Start, Days and % columns, day columns with weekday
// headers, shaded weekends, epics rolled up as summary rows, finish-to-start arrows and editable progress.
type Tone = 'violet' | 'blue' | 'teal'
interface RowData { kind: 'epic' | 'task' | 'milestone'; tone: Tone }
interface SprintRow extends TimelineRow<RowData> { data: RowData }

const day = 86_400_000
const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const weekdays = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
/** Midnight UTC of a day in late 2026; fixed so that renders and tests never depend on the clock or time zone. */
const on = (month: number, date: number) => Date.UTC(2026, month - 1, date)
function formatTime(time: number) {
  const date = new Date(time)
  return `${months[date.getUTCMonth()]} ${date.getUTCDate()}`
}
/** ISO 8601 week number: the week that holds the Thursday of the given UTC day. */
function isoWeek(time: number) {
  const thursday = time - ((new Date(time).getUTCDay() + 6) % 7) * day + 3 * day
  return 1 + Math.floor((thursday - Date.UTC(new Date(thursday).getUTCFullYear(), 0, 1)) / (7 * day))
}
const isWeekend = (time: number) => [0, 6].includes(new Date(time).getUTCDay())
function workingDays(start: number, end: number) {
  let count = 0
  for (let time = start; time < end; time += day) if (!isWeekend(time)) count++
  return count
}

const range = { start: on(11, 16), end: on(12, 14) }
const today = on(11, 25) + day / 2
const rowHeight = 38
const headerBands = [calendarBands(range, 'week', {
  label: (start, end) => `Week ${isoWeek(start)} · ${formatTime(start)} – ${new Date(end - day).getUTCDate()}`,
})]
// Saturdays and Sundays, shaded behind the grid.
const weekends = Array.from({ length: 4 }, (_, week) => ({ start: on(11, 21) + week * 7 * day, end: on(11, 23) + week * 7 * day }))

const epic = (id: string, label: string, tone: Tone): SprintRow => ({ id, label, data: { kind: 'epic', tone } })
const task = (id: string, parentId: string, label: string, tone: Tone, kind: RowData['kind'] = 'task'): SprintRow =>
  ({ id, parentId, label, data: { kind, tone } })
const rows: SprintRow[] = [
  epic('checkout', 'Checkout redesign', 'violet'),
  task('payment', 'checkout', 'Payment form UI', 'violet'),
  task('signoff', 'checkout', 'Design sign-off', 'violet', 'milestone'),
  task('address', 'checkout', 'Address autocomplete', 'violet'),
  task('summary', 'checkout', 'Order summary', 'violet'),
  epic('search', 'Search relevance', 'blue'),
  task('ranking', 'search', 'Ranking signals', 'blue'),
  task('rewrite', 'search', 'Query rewriting', 'blue'),
  task('experiment', 'search', 'A/B experiment', 'blue'),
  epic('release', 'Release 4.2', 'teal'),
  task('regression', 'release', 'Regression tests', 'teal'),
  task('docs', 'release', 'Docs and changelog', 'teal'),
  task('ship', 'release', 'Release 4.2 ships', 'teal', 'milestone'),
]
const toneOf = new Map(rows.map(row => [row.id, row.data.tone]))
const bar = (id: string, label: string, start: number, end: number, progress?: number): TimelineBar => ({
  id, rowId: id, label, start, end, progress, tone: toneOf.get(id), appearance: 'solid', editable: true,
})
const initialBars: TimelineBar[] = [
  bar('payment', 'Payment form UI', on(11, 16), on(11, 21), 1),
  bar('signoff', 'Design sign-off', on(11, 23), on(11, 23)),
  bar('address', 'Address autocomplete', on(11, 18), on(11, 26), 0.6),
  bar('summary', 'Order summary', on(11, 23), on(11, 28), 0.3),
  bar('ranking', 'Ranking signals', on(11, 16), on(11, 24), 0.8),
  bar('rewrite', 'Query rewriting', on(11, 24), on(12, 2), 0.25),
  bar('experiment', 'A/B experiment', on(12, 2), on(12, 10), 0),
  bar('regression', 'Regression tests', on(11, 30), on(12, 5), 0),
  bar('docs', 'Docs and changelog', on(12, 3), on(12, 9), 0),
  bar('ship', 'Release 4.2', on(12, 11), on(12, 11)),
]
// Finish-to-start links; validateEdit keeps every successor from starting before its predecessor ends.
const dependencies: TimelineDependency[] = [
  { id: 'payment-signoff', from: 'payment', to: 'signoff' },
  { id: 'signoff-summary', from: 'signoff', to: 'summary' },
  { id: 'ranking-rewrite', from: 'ranking', to: 'rewrite' },
  { id: 'rewrite-experiment', from: 'rewrite', to: 'experiment' },
  { id: 'summary-regression', from: 'summary', to: 'regression' },
  { id: 'regression-ship', from: 'regression', to: 'ship' },
  { id: 'docs-ship', from: 'docs', to: 'ship' },
  { id: 'experiment-ship', from: 'experiment', to: 'ship' },
]

const bars = ref<TimelineBar[]>(initialBars)
const selected = ref<ReadonlySet<string>>(new Set())
const collapsed = ref<ReadonlySet<string>>(new Set())
const status = ref('Drag bars to reschedule, drag the round handle under a bar to update progress. Links are finish-to-start.')
const barOf = computed(() => new Map(bars.value.map(item => [item.id, item])))
const shownRows = computed(() => rows.filter(row => row.parentId === undefined || !collapsed.value.has(row.parentId)).length)
const chartHeight = computed(() => 40 + 26 + shownRows.value * rowHeight + 14)
const percent = (value: number | undefined) => value === undefined ? '' : Math.round(value * 100) + '%'

// The task list. Values are read from the current bars (or the epic rollup), so they follow every accepted edit.
// Narrow screens keep only the % column so that the timeline still has room.
const compact = ref(false)
const columns = computed<TimelineColumn<SprintRow>[]>(() => {
  // A task row reads its own bar; an epic row reads the rollup of its tasks.
  const span = (row: SprintRow, summary?: TimeRange): TimeRange | undefined => barOf.value.get(row.id) ?? summary
  const start = (item?: TimeRange) => item ? formatTime(item.start) : ''
  const days = (item?: TimeRange) => item && item.end > item.start ? workingDays(item.start, item.end) : '–'
  const all: TimelineColumn<SprintRow>[] = [
    { id: 'start', label: 'Start', width: 64, value: (row, summary) => start(span(row, summary)) },
    { id: 'days', label: 'Days', width: 46, value: (row, summary) => days(span(row, summary)) },
    { id: 'done', label: '%', width: 56, value: (row, summary) => percent(barOf.value.get(row.id)?.progress ?? (barOf.value.has(row.id) ? undefined : summary?.progress)) },
  ]
  return compact.value ? all.filter(column => column.id === 'done') : all
})
let media: MediaQueryList | undefined
const syncCompact = () => { compact.value = Boolean(media?.matches) }
onMounted(() => {
  media = window.matchMedia('(max-width: 700px)')
  syncCompact()
  media.addEventListener('change', syncCompact)
})
onBeforeUnmount(() => media?.removeEventListener('change', syncCompact))

function label(id: string) {
  return barOf.value.get(id)?.label ?? id
}
function validateEdit(change: TimelineEdit) {
  const name = label(change.id)
  for (const link of dependencies) {
    const before = barOf.value.get(link.from), after = barOf.value.get(link.to)
    if (link.to === change.id && before && change.after.start < before.end) {
      return `${name} cannot start before ${formatTime(before.end)}: it waits for ${before.label}.`
    }
    if (link.from === change.id && after && change.after.end > after.start) {
      return `${name} must end by ${formatTime(after.start)}, when ${after.label} starts.`
    }
  }
}
function onEdit(change: TimelineEdit) {
  bars.value = bars.value.map(item => item.id === change.id ? { ...item, ...change.after } : item)
  const when = change.after.start === change.after.end ? formatTime(change.after.start)
    : `${formatTime(change.after.start)} – ${formatTime(change.after.end)} (${workingDays(change.after.start, change.after.end)} days)`
  status.value = `${change.mode === 'move' ? 'Moved' : 'Resized'} ${label(change.id)} to ${when}.`
}
function onRejected(_change: TimelineEdit, reason: string) {
  status.value = 'Not moved: ' + reason
}
function onProgress(change: TimelineProgressEdit) {
  bars.value = bars.value.map(item => item.id === change.id ? { ...item, progress: change.after } : item)
  status.value = `${label(change.id)} is ${percent(change.after)} done.`
}
// The click that ends a drag also emits select (detail.dragged); it keeps the message about that move or rejection.
function onSelect(id: string, detail: TimelineSelectDetail) {
  selected.value = new Set([id])
  const item = barOf.value.get(id)
  if (!item || detail.dragged) return
  status.value = item.start === item.end ? `${item.label} · milestone on ${formatTime(item.start)}.`
    : `${item.label} · ${formatTime(item.start)} – ${formatTime(item.end)} · ${percent(item.progress ?? 0)} done.`
}
/** Task state glyph in the task list: to do, in progress or done. */
function taskState(row: SprintRow) {
  const progress = barOf.value.get(row.id)?.progress ?? 0
  return progress >= 1 ? 'done' : progress > 0 ? 'doing' : 'todo'
}
</script>

<template>
  <section class="showcase sc-sprint" aria-labelledby="sc-sprint-title">
    <h2 id="sc-sprint-title">Sprint plan</h2>
    <p class="sc-sprint-intro">
      A task list with Start, Days and % columns (only % on narrow screens), weekday headers from the tick slot, shaded
      weekends, epic rollups, restyled finish-to-start arrows and draggable progress; moves that break a link are rejected.
    </p>
    <GanttChart
      :rows="rows" :bars="bars" :dependencies="dependencies" :range="range" :pixels-per-unit="31 / day" :tick-steps="[day]"
      :snap="day" :format-time="formatTime" :header-bands="headerBands" :non-working-periods="weekends" :row-height="rowHeight"
      :height="chartHeight" :columns="columns" show-summaries :selected-ids="selected" :collapsed-ids="collapsed"
      show-now :now="today" progress-editable :progress-step="0.05" :validate-edit="validateEdit"
      :labels="{ region: 'Sprint plan timeline', rows: 'Task name', now: 'Today' }"
      @update:collapsed-ids="collapsed = $event" @edit="onEdit" @edit-rejected="onRejected" @progress-edit="onProgress"
      dependency-style="rounded" sticky-band-labels @select="onSelect"
    >
      <template #legend>
        <ul class="sc-sprint-legend" aria-label="Legend">
          <li><span class="sc-sprint-swatch sc-sprint-tone-violet"></span>Checkout</li>
          <li><span class="sc-sprint-swatch sc-sprint-tone-blue"></span>Search</li>
          <li><span class="sc-sprint-swatch sc-sprint-tone-teal"></span>Release</li>
          <li><span class="sc-sprint-diamond"></span>Milestone</li>
          <li><svg class="sc-sprint-link-icon" viewBox="0 0 22 10" aria-hidden="true"><path d="M1 5h17" /><path d="M16 1.5 20 5l-4 3.5" /></svg>Finish to start</li>
          <li><span class="sc-sprint-weekend"></span>Weekend</li>
        </ul>
      </template>
      <template #row="{ row }">
        <span v-if="row.data.kind === 'epic'" class="sc-sprint-epic">
          <span class="sc-sprint-swatch" :class="`sc-sprint-tone-${row.data.tone}`"></span>
          <span class="sc-sprint-name">{{ row.label }}</span>
        </span>
        <span v-else class="sc-sprint-task">
          <span v-if="row.data.kind === 'milestone'" class="sc-sprint-diamond"></span>
          <svg v-else class="sc-sprint-state" :class="`sc-sprint-${taskState(row)}`" viewBox="0 0 16 16" aria-hidden="true">
            <circle cx="8" cy="8" r="6.5" />
            <path v-if="taskState(row) === 'doing'" d="M8 3.5a4.5 4.5 0 0 1 0 9z" />
            <path v-else-if="taskState(row) === 'done'" d="m5.2 8.2 1.9 1.9 3.8-4" />
          </svg>
          <span class="sc-sprint-name">{{ row.label }}</span>
        </span>
      </template>
      <template #cell="{ row, column, value }">
        <span class="sc-sprint-cell" :class="[`sc-sprint-cell-${column.id}`, { 'sc-sprint-cell-epic': row.data.kind === 'epic', 'sc-sprint-cell-zero': value === '0%' }]">{{ value }}</span>
      </template>
      <template #tick="{ time }">
        <span class="sc-sprint-tick" :class="{ 'sc-sprint-tick-weekend': isWeekend(time), 'sc-sprint-tick-today': time === today - day / 2 }">
          <span class="sc-sprint-weekday">{{ weekdays[new Date(time).getUTCDay()] }}</span>
          <span class="sc-sprint-date">{{ new Date(time).getUTCDate() }}</span>
        </span>
      </template>
      <template #bar="{ bar: item }">
        <template v-if="item.start === item.end">
          <span class="sc-sprint-diamond"></span>
          <span class="sc-sprint-milestone">{{ item.label }}</span>
        </template>
        <span v-else class="sc-sprint-bar-label">{{ item.label }}</span>
      </template>
    </GanttChart>
    <p class="sc-sprint-status" role="status">{{ status }}</p>
  </section>
</template>

<style>
.sc-sprint {
  color-scheme: light;
  --vw-surface: #fff; --vw-surface-muted: #f8f8fb; --vw-surface-hover: #f0f0f6;
  --vw-text: #22243a; --vw-muted: #6c6f86; --vw-border: #e6e7ef; --vw-grid: #efeff5; --vw-edge: #8f8cc4;
  --vw-accent: #5b4fd0; --vw-on-solid: #fff; --vw-now: #e5484d; --vw-marker-ink: #fff; --vw-non-working: #f5f5f9;
  /* Mid-tone bar tracks; white labels keep at least 4.5:1 on them and on the darker progress fill. */
  --vw-violet-solid: #7266dc; --vw-violet-pale: #ebe8fc; --vw-violet-ink: #2f2775; --vw-violet-line: #b4acf0;
  --vw-blue-solid: #3a6fdc; --vw-blue-pale: #e2ebfc; --vw-blue-ink: #183f8c; --vw-blue-line: #9fbcf3;
  --vw-teal-solid: #1a8070; --vw-teal-pale: #ddf1ed; --vw-teal-ink: #0d4a41; --vw-teal-line: #8fcdc2;
  padding: 24px 24px 18px;
  border: 1px solid #e4e5ee;
  border-radius: 12px;
  background: #fff;
  color: var(--vw-text);
  box-shadow: 0 1px 3px rgb(30 28 70 / 6%);
  font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
}
.sc-sprint h2 { margin: 0 0 6px; color: #191a2e; font-size: 19px; font-weight: 700; letter-spacing: -.01em; }
.sc-sprint-intro { max-width: 780px; margin: 0 0 18px; color: var(--vw-muted); font-size: 13px; line-height: 1.55; }
.sc-sprint-status { min-height: 18px; margin: 12px 2px 0; color: #4b4e66; font-size: 12.5px; }

/* Toolbar */
.sc-sprint .vw-gantt { --vw-row-label-width: 214px; font-size: 12.5px; }
.sc-sprint .vw-gantt-toolbar { align-items: flex-start; min-height: 0; padding: 0 0 12px; }
.sc-sprint-legend { display: flex; flex-wrap: wrap; gap: 6px 16px; margin: 0; padding: 5px 0 0; list-style: none; color: #55586f; font-size: 12px; }
.sc-sprint-legend li { display: inline-flex; align-items: center; gap: 6px; }
.sc-sprint-link-icon { width: 22px; height: 10px; fill: none; stroke: #8f8cc4; stroke-width: 1.4; stroke-linecap: round; stroke-linejoin: round; }
.sc-sprint-weekend { width: 14px; height: 10px; border: 1px solid #e3e3ec; border-radius: 2px; background: repeating-linear-gradient(135deg, #ececf3 0 2px, #f9f9fc 2px 5px); }
.sc-sprint .vw-gantt-zoom { border-color: #e1e2ec; border-radius: 6px; }
.sc-sprint .vw-gantt-zoom button { height: 27px; min-width: 28px; padding: 0; color: #4b4e66; }
.sc-sprint .vw-gantt-zoom output { color: #4b4e66; }

/* Grid frame and header */
.sc-sprint .vw-gantt-scroll { border: 1px solid #e3e4ed; border-radius: 8px; background: #fff; scrollbar-color: #d3d4e0 transparent; }
.sc-sprint .vw-gantt-head { background: #fafafd; border-bottom: 1px solid #e3e4ed; }
.sc-sprint .vw-gantt-corner { justify-content: flex-end; background: #fafafd; border-right: 1px solid #e3e4ed; color: #6c6f86; font-size: 11.5px; font-weight: 600; }
.sc-sprint .vw-gantt-corner > .vw-name-column, .sc-sprint .vw-gantt-corner > .vw-extra-column { align-items: flex-end; padding-bottom: 12px; }
.sc-sprint .vw-gantt-band { padding: 6px 10px; border: 0; border-left: 1px solid #e3e4ed; border-bottom: 1px solid #ececf3; color: #2c2e47; font-size: 11.5px; font-weight: 650; }
.sc-sprint .vw-gantt-tick { inset: 0 auto 0 auto; width: var(--vw-grid-step); padding: 0; }
.sc-sprint .vw-gantt-tick.vw-is-end { display: none; }
.sc-sprint .vw-gantt-tick-line { background: #ececf3; }
.sc-sprint-tick { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1px; height: 100%; font-weight: 500; line-height: 1; }
.sc-sprint-weekday { color: #9a9cb2; font-size: 9.5px; font-weight: 600; }
.sc-sprint-date { display: grid; place-items: center; width: 20px; height: 20px; border-radius: 50%; color: #3a3d58; font-size: 11.5px; font-weight: 600; font-variant-numeric: tabular-nums; }
.sc-sprint-tick-weekend .sc-sprint-date { color: #a6a8bc; }
.sc-sprint-tick-today .sc-sprint-date { background: var(--vw-now); color: #fff; }
.sc-sprint .vw-gantt-grid-line { background: #f1f1f6; }
.sc-sprint .vw-gantt-grid { border-right: 1px solid #e3e4ed; }
.sc-sprint .vw-gantt-non-working { background: repeating-linear-gradient(135deg, #f3f3f8 0 4px, #fafafd 4px 9px); }

/* Task list */
.sc-sprint .vw-gantt-row { border-bottom: 1px solid #f0f0f5; }
.sc-sprint .vw-gantt-row:has(.sc-sprint-epic) { background: rgb(60 55 140 / 2.5%); }
.sc-sprint .vw-gantt-row-label { background: #fff; border-right: 1px solid #e3e4ed; }
.sc-sprint .vw-gantt-row-label:has(.sc-sprint-epic) { background: #fafafd; }
.sc-sprint .vw-column-group > .vw-name-column { padding-right: 8px; }
.sc-sprint .vw-column-group > .vw-tree-row { gap: 3px; padding-left: calc(6px + var(--vw-row-depth) * 22px); }
.sc-sprint .vw-row-content { flex: 1; }
.sc-sprint .vw-row-toggle { display: grid; place-items: center; width: 18px; height: 18px; padding: 0; border-radius: 4px; color: #6c6f86; font-size: 0; }
.sc-sprint .vw-row-toggle::before { content: ''; border-block: 4px solid transparent; border-left: 5px solid currentColor; transform: translateX(1px) rotate(90deg); transition: transform .15s; }
.sc-sprint .vw-row-toggle[aria-expanded='false']::before { transform: translateX(1px); }
.sc-sprint .vw-row-toggle:hover { background: #ececf4; color: #22243a; }
.sc-sprint-epic, .sc-sprint-task { display: flex; align-items: center; gap: 8px; min-width: 0; }
.sc-sprint-name { overflow: hidden; color: #33354f; text-overflow: ellipsis; white-space: nowrap; }
.sc-sprint-epic .sc-sprint-name { color: #191a2e; font-weight: 650; }
.sc-sprint-swatch { flex: none; width: 10px; height: 10px; border-radius: 3px; }
.sc-sprint-tone-violet { background: var(--vw-violet-solid); }
.sc-sprint-tone-blue { background: var(--vw-blue-solid); }
.sc-sprint-tone-teal { background: var(--vw-teal-solid); }
.sc-sprint-state { flex: none; width: 15px; height: 15px; fill: none; stroke: #b3b5c8; stroke-width: 1.4; }
.sc-sprint-todo circle { stroke-dasharray: 2.6 2.1; }
.sc-sprint-doing circle { stroke: var(--vw-accent); }
.sc-sprint-doing path { fill: var(--vw-accent); stroke: none; }
.sc-sprint-done circle { fill: var(--vw-accent); stroke: var(--vw-accent); }
.sc-sprint-done path { stroke: #fff; stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; }
.sc-sprint .vw-extra-column { justify-content: flex-end; padding: 0 12px 0 6px; border-left: 1px solid #f0f0f5; }
.sc-sprint .vw-gantt-corner .vw-extra-column { border-left-color: #e8e8f0; }
.sc-sprint-cell { color: #4b4e66; font-variant-numeric: tabular-nums; white-space: nowrap; }
.sc-sprint-cell-epic { color: #22243a; font-weight: 650; }
.sc-sprint-cell-zero { color: #a6a8bc; }

/* Bars: mid-tone tracks with a darker progress fill and white labels. */
.sc-sprint .vw-gantt-bar { padding: 0 9px; border: 0; border-radius: 6px; font-size: 12px; font-weight: 600; box-shadow: 0 1px 2px rgb(30 28 70 / 18%); }
.sc-sprint .vw-gantt-bar:hover { filter: brightness(1.06); }
.sc-sprint .vw-gantt-bar.vw-is-selected { box-shadow: 0 0 0 2px #fff, 0 0 0 4px #a59df0; }
.sc-sprint .vw-gantt-bar.vw-is-dragging { box-shadow: 0 6px 16px -4px rgb(30 28 70 / 40%); filter: none; }
.sc-sprint .vw-bar-progress { background: rgb(14 10 52 / 30%); opacity: 1; border-radius: 6px 0 0 6px; }
.sc-sprint .vw-bar-handle::after { top: 30%; bottom: 30%; left: 3px; width: 2px; border-radius: 1px; }
.sc-sprint-bar-label { position: relative; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; pointer-events: none; }

/* Progress handle: a round knob on the lower edge of the bar instead of the default triangle. */
.sc-sprint .vw-gantt-progress-handle::before { left: 2px; top: 2px; width: 8px; height: 8px; border: 2px solid var(--vw-accent); border-radius: 50%; background: #fff; filter: none; box-shadow: 0 1px 2px rgb(30 28 70 / 30%); }
.sc-sprint .vw-gantt-progress-handle:hover::before, .sc-sprint .vw-gantt-progress-handle.vw-is-dragging::before { background: var(--vw-accent); border-color: #fff; }

/* Milestones: a square diamond drawn by the bar slot, labelled to its right. */
.sc-sprint .vw-gantt-bar.vw-is-milestone { justify-content: center; padding: 0; overflow: visible; clip-path: none; background: transparent; box-shadow: none; filter: none; }
.sc-sprint .vw-gantt-bar.vw-is-milestone:focus-visible { outline: none; }
.sc-sprint-diamond { flex: none; display: inline-block; width: 10px; height: 10px; border-radius: 1.5px; background: #2c2e47; transform: rotate(45deg); pointer-events: none; }
.sc-sprint .vw-is-milestone .sc-sprint-diamond { width: 14px; height: 14px; box-shadow: 0 0 0 2px #fff; }
.sc-sprint .vw-is-milestone.vw-is-selected .sc-sprint-diamond,
.sc-sprint .vw-is-milestone:focus-visible .sc-sprint-diamond { box-shadow: 0 0 0 2px #fff, 0 0 0 4px #a59df0; }
.sc-sprint-milestone { position: absolute; left: calc(50% + 13px); top: 50%; translate: 0 -50%; padding: 1px 4px; border-radius: 4px; background: rgb(255 255 255 / 88%); color: #22243a; font-size: 12px; font-weight: 650; white-space: nowrap; pointer-events: none; }

/* Epic rollups: a dark bracket with end caps; the darker part is the rolled-up progress. */
.sc-sprint .vw-gantt-summary { top: calc(50% - 5px); height: 8px; overflow: visible; border: 0; border-radius: 2px 2px 0 0; background: #b9bbcf; }
.sc-sprint .vw-gantt-summary span { border-radius: 2px 0 0 0; background: #3c3f5c; opacity: 1; }
.sc-sprint .vw-gantt-summary::before, .sc-sprint .vw-gantt-summary::after { content: ''; position: absolute; top: 100%; border-top: 6px solid #3c3f5c; }
.sc-sprint .vw-gantt-summary::before { left: 0; border-right: 6px solid transparent; }
.sc-sprint .vw-gantt-summary::after { right: 0; border-left: 6px solid transparent; }

/* Dependencies: thin rounded connectors in a soft indigo, darker next to the selection. */
.sc-sprint .vw-gantt-links path { stroke: var(--vw-edge); stroke-width: 1.25px; stroke-linejoin: round; stroke-linecap: round; }
.sc-sprint .vw-gantt-links path.vw-is-related { stroke: var(--vw-accent); stroke-width: 1.6px; }

/* Today line */
.sc-sprint .vw-gantt-now { border-left-width: 2px; }
.sc-sprint .vw-gantt-now span { padding: 1px 6px; border-radius: 0 0 5px 5px; translate: -50% 0; margin-left: -1px; font-size: 10px; font-weight: 650; }

@media (max-width: 700px) {
  .sc-sprint { padding: 16px 12px 14px; }
  .sc-sprint .vw-gantt { --vw-row-label-width: 150px; }
  .sc-sprint .vw-gantt-toolbar { padding-inline: 0; }
  .sc-sprint .vw-column-group > .vw-tree-row { padding-left: calc(2px + var(--vw-row-depth) * 12px); }
  .sc-sprint .vw-extra-column { padding-right: 8px; }
}
</style>
