<script setup lang="ts">
import { computed, ref } from 'vue'
import { GanttChart, calendarBands, type TimelineBar, type TimelineEdit, type TimelineRow, type TimelineSelectDetail } from '../../src'
import { day } from '../data'

// A calm product roadmap: initiatives with their projects as child rows, pastel status pills and milestone diamonds.
// Everything is restyled through slots, --vw-* variables and .sc-roadmap-scoped overrides of the vw- classes.
type Status = 'planned' | 'progress' | 'risk' | 'done'
interface Person { name: string; initials: string; color: string }
interface RowData { kind: 'initiative' | 'project'; color: string; lead: Person }
interface BarData { status: Status; people: readonly Person[] }
interface RoadmapRow extends TimelineRow<RowData> { data: RowData }
interface RoadmapBar extends TimelineBar<BarData> { data: BarData }

const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
/** Midnight UTC of a day in 2027, so the data never depends on the local clock or time zone. */
const on = (month: number, date: number) => Date.UTC(2027, month - 1, date)
/** "Jan 5": tick labels, accessible bar names and the status line. */
function formatTime(time: number) {
  const date = new Date(time)
  return `${months[date.getUTCMonth()]} ${date.getUTCDate()}`
}

const range = { start: on(1, 4), end: on(7, 1) }
const today = on(2, 17)
const rowHeight = 46
const headerBands = [
  calendarBands(range, 'month', { step: 3, label: (_start, _end, local) => `Q${(local.month + 2) / 3} ${local.year}` }),
  calendarBands(range, 'month', { label: (_start, _end, local) => monthNames[local.month - 1]! }),
]
const markers = [{ id: 'today', time: today, label: 'Today' }]

const people = {
  maya: { name: 'Maya Chen', initials: 'MC', color: '#7a5bd3' },
  leo: { name: 'Leo Park', initials: 'LP', color: '#2b8a7e' },
  ana: { name: 'Ana Ruiz', initials: 'AR', color: '#d0607a' },
  sam: { name: 'Sam Okafor', initials: 'SO', color: '#3f6fc6' },
  priya: { name: 'Priya Nair', initials: 'PN', color: '#c07a17' },
  jonas: { name: 'Jonas Weber', initials: 'JW', color: '#4e7d3a' },
  tomas: { name: 'Tomás Silva', initials: 'TS', color: '#a1497f' },
} satisfies Record<string, Person>

const initiative = (id: string, label: string, color: string, lead: Person): RoadmapRow =>
  ({ id, label, data: { kind: 'initiative', color, lead } })
const project = (id: string, parentId: string, label: string, color: string, lead: Person): RoadmapRow =>
  ({ id, parentId, label, data: { kind: 'project', color, lead } })
const rows: RoadmapRow[] = [
  initiative('onboarding', 'Onboarding', '#7a5bd3', people.maya),
  project('setup', 'onboarding', 'Guided setup', '#7a5bd3', people.leo),
  project('templates', 'onboarding', 'Template gallery', '#7a5bd3', people.ana),
  project('emails', 'onboarding', 'Welcome emails', '#7a5bd3', people.sam),
  initiative('collab', 'Collaboration', '#2b8a7e', people.priya),
  project('cursors', 'collab', 'Live cursors', '#2b8a7e', people.jonas),
  project('comments', 'collab', 'Comments v2', '#2b8a7e', people.priya),
  project('views', 'collab', 'Shared views', '#2b8a7e', people.leo),
  initiative('platform', 'Platform', '#d0607a', people.tomas),
  project('search', 'platform', 'Search index', '#d0607a', people.tomas),
  project('audit', 'platform', 'Audit log', '#d0607a', people.ana),
  project('billing', 'platform', 'Usage billing', '#d0607a', people.jonas),
]

const statusTone = { planned: 'violet', progress: 'blue', risk: 'amber', done: 'teal' } as const
const statusLabel: Record<Status, string> = { planned: 'Planned', progress: 'In progress', risk: 'At risk', done: 'Done' }
function item(id: string, rowId: string, label: string, start: number, end: number, status: Status, team: readonly Person[], progress?: number): RoadmapBar {
  return {
    id, rowId, label, start, end, progress, tone: statusTone[status], appearance: 'outline',
    // Shipped work stays where it is; everything else can be rescheduled.
    editable: status !== 'done', data: { status, people: team },
  }
}
const initialBars: RoadmapBar[] = [
  item('setup', 'setup', 'Guided setup', on(1, 11), on(2, 22), 'progress', [people.leo, people.maya], 0.55),
  item('templates', 'templates', 'Template gallery', on(2, 22), on(4, 5), 'planned', [people.ana], 0),
  item('beta', 'templates', 'Onboarding beta', on(4, 12), on(4, 12), 'planned', []),
  item('emails', 'emails', 'Welcome emails', on(1, 4), on(1, 29), 'done', [people.sam], 1),
  item('cursors', 'cursors', 'Live cursors', on(1, 4), on(2, 8), 'done', [people.jonas, people.leo], 1),
  item('cursors-ga', 'cursors', 'Cursors GA', on(2, 15), on(2, 15), 'done', []),
  item('comments', 'comments', 'Comments v2', on(2, 1), on(3, 22), 'risk', [people.priya, people.sam], 0.35),
  item('views', 'views', 'Shared views', on(3, 29), on(5, 17), 'planned', [people.leo], 0),
  item('search', 'search', 'Search index', on(1, 18), on(3, 15), 'progress', [people.tomas, people.jonas], 0.6),
  item('audit', 'audit', 'Audit log', on(4, 5), on(5, 31), 'planned', [people.ana], 0),
  item('api', 'audit', 'Public API', on(6, 14), on(6, 14), 'planned', []),
  item('billing', 'billing', 'Usage billing', on(3, 8), on(4, 26), 'risk', [people.jonas], 0.15),
]

const bars = ref<RoadmapBar[]>(initialBars)
const selected = ref<ReadonlySet<string>>(new Set())
const collapsed = ref<ReadonlySet<string>>(new Set())
const status = ref('Drag a project to reschedule it or drag its ends to resize it. Arrow keys move a focused project by one day.')
// The chart is as tall as the expanded rows, so the card grows and shrinks with the hierarchy instead of scrolling.
const shownRows = computed(() => rows.filter(row => row.parentId === undefined || !collapsed.value.has(row.parentId)).length)
const chartHeight = computed(() => 40 + 26 * headerBands.length + shownRows.value * rowHeight + 14)
const projectCount = (id: string) => rows.filter(row => row.parentId === id).length
const rowProgress = computed(() => new Map(bars.value.filter(bar => bar.start < bar.end).map(bar => [bar.rowId, bar.progress ?? 0])))

/** A pie glyph that fills with the project's progress, starting at 12 o'clock. */
function piePath(progress: number) {
  const angle = Math.min(progress, 0.9999) * 2 * Math.PI
  const x = 8 + 5 * Math.sin(angle), y = 8 - 5 * Math.cos(angle)
  return `M8 8V3A5 5 0 ${progress > 0.5 ? 1 : 0} 1 ${x.toFixed(2)} ${y.toFixed(2)}Z`
}

function onEdit(change: TimelineEdit) {
  const bar = bars.value.find(entry => entry.id === change.id)
  if (!bar) return
  bars.value = bars.value.map(entry => entry.id === change.id ? { ...entry, ...change.after } : entry)
  const when = change.after.start === change.after.end ? formatTime(change.after.start)
    : `${formatTime(change.after.start)} – ${formatTime(change.after.end)}`
  status.value = `${change.mode === 'move' ? 'Moved' : 'Resized'} ${bar.label} to ${when}`
}
// The click that ends a drag also emits select (detail.dragged); it keeps the "Moved …" message of that gesture.
function onSelect(id: string, detail: TimelineSelectDetail) {
  selected.value = new Set([id])
  const bar = bars.value.find(entry => entry.id === id)
  if (!bar || detail.dragged) return
  const team = bar.data.people.map(person => person.name).join(' and ')
  status.value = bar.start === bar.end
    ? `${bar.label} · milestone on ${formatTime(bar.start)}`
    : `${bar.label} · ${statusLabel[bar.data.status]} · ${Math.round((bar.progress ?? 0) * 100)}% done${team ? ' · ' + team : ''}`
}
</script>

<template>
  <section class="showcase sc-roadmap" aria-labelledby="sc-roadmap-title">
    <h2 id="sc-roadmap-title">Product roadmap</h2>
    <p class="sc-roadmap-intro">
      Pastel status pills with sticky labels, milestone diamonds and glyph and avatar rows from the bar, row and legend
      slots, with quarter and month bands, a Today marker, tone variables and restyled vw- classes.
    </p>
    <GanttChart
      :rows="rows" :bars="bars" :range="range" :pixels-per-unit="14 / day" :tick-steps="[7 * day, 14 * day, 28 * day]"
      :snap="day" :format-time="formatTime" :header-bands="headerBands" :markers="markers" :row-height="rowHeight"
      :height="chartHeight" :selected-ids="selected" :collapsed-ids="collapsed" show-summaries
      :labels="{ region: 'Product roadmap timeline', rows: 'Projects' }"
      sticky-band-labels @update:collapsed-ids="collapsed = $event" @edit="onEdit" @select="onSelect"
    >
      <template #legend>
        <ul class="sc-roadmap-legend" aria-label="Legend">
          <li v-for="(label, key) in statusLabel" :key="key"><span class="sc-roadmap-dot" :class="`sc-roadmap-is-${key}`"></span>{{ label }}</li>
          <li><span class="sc-roadmap-diamond sc-roadmap-is-planned"></span>Milestone</li>
          <li><span class="sc-roadmap-today"></span>Today</li>
        </ul>
      </template>
      <template #row-heading>
        <span class="sc-roadmap-heading"><span>Initiatives<span class="sc-roadmap-wide"> &amp; projects</span></span><span>Lead</span></span>
      </template>
      <template #row="{ row }">
        <span class="sc-roadmap-row" :class="`sc-roadmap-row-${row.data.kind}`">
          <svg v-if="row.data.kind === 'initiative'" class="sc-roadmap-glyph" viewBox="0 0 18 18" aria-hidden="true">
            <rect width="18" height="18" rx="5" :fill="row.data.color" />
            <path d="M6.2 13.4V4.6M6.2 5h5.6l-1.5 2.1 1.5 2.1H6.2" fill="none" stroke="#fff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
          <svg v-else class="sc-roadmap-glyph" viewBox="0 0 16 16" aria-hidden="true" :style="{ color: row.data.color }">
            <circle cx="8" cy="8" r="6.6" fill="none" stroke="currentColor" stroke-width="1.5" />
            <circle v-if="(rowProgress.get(row.id) ?? 0) >= 1" cx="8" cy="8" r="5" fill="currentColor" />
            <path v-else-if="(rowProgress.get(row.id) ?? 0) > 0" :d="piePath(rowProgress.get(row.id)!)" fill="currentColor" />
          </svg>
          <span class="sc-roadmap-row-text">
            <span class="sc-roadmap-row-name">{{ row.label }}</span>
            <span v-if="row.data.kind === 'initiative'" class="sc-roadmap-row-meta">{{ projectCount(row.id) }} projects</span>
          </span>
          <span class="sc-roadmap-avatar" :style="{ background: row.data.lead.color }" :title="row.data.lead.name">{{ row.data.lead.initials }}</span>
        </span>
      </template>
      <template #bar="{ bar }">
        <template v-if="bar.start === bar.end">
          <span class="sc-roadmap-diamond" :class="`sc-roadmap-is-${bar.data.status}`"></span>
          <span class="sc-roadmap-milestone">{{ bar.label }}<span class="sc-roadmap-milestone-date">{{ formatTime(bar.start) }}</span></span>
        </template>
        <template v-else>
          <span class="sc-roadmap-bar-title">
            <span class="sc-roadmap-dot" :class="`sc-roadmap-is-${bar.data.status}`"></span>
            <span class="sc-roadmap-bar-label">{{ bar.label }}</span>
          </span>
          <span class="sc-roadmap-team">
            <span v-for="person in bar.data.people" :key="person.initials" class="sc-roadmap-avatar" :style="{ background: person.color }">{{ person.initials }}</span>
          </span>
        </template>
      </template>
    </GanttChart>
    <p class="sc-roadmap-status" role="status">{{ status }}</p>
  </section>
</template>

<style>
.sc-roadmap {
  color-scheme: light;
  --vw-surface: #fff; --vw-surface-muted: #fafafb; --vw-surface-hover: #f2f3f6;
  --vw-text: #1d2030; --vw-muted: #6b7085; --vw-border: #ebecf0; --vw-grid: #f1f2f5; --vw-edge: #b8bccb;
  --vw-accent: #3f5fd1; --vw-on-solid: #fff; --vw-marker: #e0464e; --vw-marker-ink: #fff;
  /* Status palette: violet = planned, blue = in progress, amber = at risk, teal = done. */
  --vw-violet-pale: #efeff4; --vw-violet-ink: #3b3f52; --vw-violet-line: #cfd1dc; --vw-violet-solid: #7b8096;
  --vw-blue-pale: #e5edfd; --vw-blue-ink: #1d47a6; --vw-blue-line: #b3c7f5; --vw-blue-solid: #3f6fe0;
  --vw-amber-pale: #fdeee1; --vw-amber-ink: #8f3f0c; --vw-amber-line: #f2c39f; --vw-amber-solid: #e07a33;
  --vw-teal-pale: #e2f3e9; --vw-teal-ink: #1b6640; --vw-teal-line: #a9d8bb; --vw-teal-solid: #2f9e63;
  padding: 26px 26px 20px;
  border: 1px solid #e9eaef;
  border-radius: 16px;
  background: #fff;
  color: var(--vw-text);
  box-shadow: 0 1px 2px rgb(22 26 45 / 4%), 0 12px 32px -18px rgb(22 26 45 / 18%);
  font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
}
.sc-roadmap h2 { margin: 0 0 6px; color: #13151f; font-size: 20px; font-weight: 650; letter-spacing: -.015em; }
.sc-roadmap-intro { max-width: 760px; margin: 0 0 20px; color: var(--vw-muted); font-size: 13px; line-height: 1.55; }
.sc-roadmap-status { min-height: 18px; margin: 14px 2px 0; color: #4a4f63; font-size: 12.5px; }

/* Toolbar: legend on the left, quiet zoom buttons on the right. */
.sc-roadmap .vw-gantt { --vw-row-label-width: 272px; font-size: 13px; }
.sc-roadmap .vw-gantt-toolbar { align-items: flex-start; min-height: 0; padding: 0 0 14px; }
.sc-roadmap-legend { display: flex; flex-wrap: wrap; gap: 6px 18px; margin: 0; padding: 4px 0 0; list-style: none; color: #555a6e; font-size: 12px; }
.sc-roadmap-legend li { display: inline-flex; align-items: center; gap: 7px; }
.sc-roadmap .vw-gantt-zoom { border-color: #e6e7ec; border-radius: 9px; box-shadow: 0 1px 2px rgb(22 26 45 / 5%); }
.sc-roadmap .vw-gantt-zoom button { min-width: 30px; height: 28px; padding: 0; color: #4a4f63; font-size: 14px; }
.sc-roadmap .vw-gantt-zoom output { color: #4a4f63; font-weight: 600; }

/* Frame, header and grid: hairlines only. */
.sc-roadmap .vw-gantt-scroll { border: 1px solid #ebecf0; border-radius: 12px; background: #fff; scrollbar-color: #d6d8e0 transparent; }
.sc-roadmap .vw-gantt-head { background: #fff; border-bottom: 1px solid #ebecf0; }
.sc-roadmap .vw-gantt-corner { justify-content: flex-end; padding: 0 16px 11px; background: #fff; border-right: 1px solid #ebecf0; }
.sc-roadmap-heading { display: flex; justify-content: space-between; color: #8a8fa3; font-size: 11px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; }
.sc-roadmap .vw-gantt-band { padding: 7px 12px 0; border: 0; border-left: 1px solid #ebecf0; color: #1d2030; font-size: 12.5px; font-weight: 650; }
.sc-roadmap .vw-gantt-band-level + .vw-gantt-band-level .vw-gantt-band { color: #555a6e; font-weight: 500; }
.sc-roadmap .vw-gantt-tick { top: 14px; padding-left: 6px; color: #9a9eb0; font-size: 11px; font-weight: 500; }
.sc-roadmap .vw-gantt-tick.vw-is-end { display: none; }
.sc-roadmap .vw-gantt-tick-line { top: auto; height: 6px; background: #e3e5eb; }
.sc-roadmap .vw-gantt-grid-line { background: #f3f4f7; }

/* Rows: initiatives are tinted and bold, projects are indented under them. */
.sc-roadmap .vw-gantt-row { border-bottom: 1px solid #f3f4f7; }
.sc-roadmap .vw-gantt-row:has(.sc-roadmap-row-initiative) { background: rgb(30 35 70 / 1.6%); }
.sc-roadmap .vw-gantt-row-label { padding: 0 14px 0 10px; background: #fff; border-right: 1px solid #ebecf0; }
.sc-roadmap .vw-gantt-row-label:has(.sc-roadmap-row-initiative) { background: #fbfbfc; }
.sc-roadmap .vw-name-column.vw-tree-row { gap: 4px; padding-left: calc(6px + var(--vw-row-depth) * 26px); }
.sc-roadmap .vw-row-content { flex: 1; }
.sc-roadmap .vw-row-toggle { display: grid; place-items: center; width: 20px; height: 20px; padding: 0; border-radius: 6px; color: #8a8fa3; font-size: 0; }
.sc-roadmap .vw-row-toggle::before { content: ''; width: 6px; height: 6px; border: solid currentColor; border-width: 0 1.6px 1.6px 0; transform: translateY(-1px) rotate(45deg); transition: transform .15s; }
.sc-roadmap .vw-row-toggle[aria-expanded='false']::before { transform: translateX(-1px) rotate(-45deg); }
.sc-roadmap .vw-row-toggle:hover { background: #eef0f4; color: #1d2030; }
.sc-roadmap-row { display: flex; align-items: center; gap: 9px; min-width: 0; }
.sc-roadmap-glyph { flex: none; width: 16px; height: 16px; }
.sc-roadmap-row-initiative .sc-roadmap-glyph { width: 18px; height: 18px; }
.sc-roadmap-row-text { display: flex; align-items: baseline; gap: 8px; flex: 1; min-width: 0; }
.sc-roadmap-row-name { overflow: hidden; color: #2a2e40; font-size: 13px; font-weight: 500; text-overflow: ellipsis; white-space: nowrap; }
.sc-roadmap-row-initiative .sc-roadmap-row-name { color: #13151f; font-weight: 650; }
.sc-roadmap-row-meta { flex: none; color: #9a9eb0; font-size: 11.5px; }
.sc-roadmap-avatar { flex: none; display: inline-grid; place-items: center; width: 22px; height: 22px; border-radius: 50%; color: #fff; font-size: 9px; font-weight: 700; letter-spacing: .02em; }

/* Initiative rollups: a thin rounded track spanning their projects. */
.sc-roadmap .vw-gantt-summary { top: calc(50% - 3px); height: 6px; border: 0; border-radius: 999px; background: #e4e6ed; }
.sc-roadmap .vw-gantt-summary span { background: #a5aabd; opacity: 1; }

/* Project pills. */
.sc-roadmap .vw-gantt-bar { gap: 8px; padding: 0 4px 0 12px; border: 0; border-radius: 999px; font-size: 12.5px; font-weight: 600; box-shadow: inset 0 0 0 1px rgb(20 25 50 / 4%); transition: box-shadow .15s; }
.sc-roadmap .vw-gantt-bar:hover { box-shadow: inset 0 0 0 1px rgb(20 25 50 / 10%), 0 2px 8px -3px rgb(20 25 50 / 18%); }
.sc-roadmap .vw-gantt-bar.vw-is-selected { box-shadow: 0 0 0 2px #fff, 0 0 0 4px #9fb1ef; }
.sc-roadmap .vw-gantt-bar.vw-is-dragging { box-shadow: 0 8px 20px -6px rgb(20 25 50 / 32%); }
.sc-roadmap .vw-gantt-bar:focus-visible { outline: 2px solid var(--vw-accent); outline-offset: 2px; }
.sc-roadmap .vw-bar-progress { opacity: .09; }
.sc-roadmap .vw-bar-handle::after { top: 32%; bottom: 32%; left: 3px; width: 2px; border-radius: 1px; }
.sc-roadmap .vw-gantt-bar:hover .vw-bar-handle::after, .sc-roadmap .vw-gantt-bar.vw-is-selected .vw-bar-handle::after { opacity: .35; }
.sc-roadmap-bar-title { position: sticky; left: calc(var(--vw-label-area-width) + 12px); z-index: 1; display: inline-flex; align-items: center; gap: 8px; flex: 0 1 auto; min-width: 0; pointer-events: none; }
.sc-roadmap-bar-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sc-roadmap-team { position: relative; display: flex; flex: none; margin-left: auto; pointer-events: none; }
.sc-roadmap-team .sc-roadmap-avatar { position: relative; box-shadow: 0 0 0 2px rgb(255 255 255 / 90%); }
.sc-roadmap-team .sc-roadmap-avatar:first-child { z-index: 1; }
.sc-roadmap-team .sc-roadmap-avatar + .sc-roadmap-avatar { margin-left: -6px; }
.sc-roadmap-dot { position: relative; flex: none; width: 8px; height: 8px; border-radius: 50%; pointer-events: none; }
.sc-roadmap-is-planned { background: #8d92a7; }
.sc-roadmap-is-progress { background: #3f6fe0; }
.sc-roadmap-is-risk { background: #e07a33; }
.sc-roadmap-is-done { background: #2f9e63; }
.sc-roadmap-today { width: 12px; height: 2px; border-radius: 1px; background: var(--vw-marker); }

/* Milestones: a diamond drawn by the slot, with its name beside it, instead of the clipped default bar. */
.sc-roadmap .vw-gantt-bar.vw-is-milestone { justify-content: center; padding: 0; overflow: visible; clip-path: none; background: transparent; box-shadow: none; }
.sc-roadmap .vw-gantt-bar.vw-is-milestone:focus-visible { outline: none; }
.sc-roadmap-diamond { flex: none; display: inline-block; width: 11px; height: 11px; border-radius: 2px; transform: rotate(45deg); pointer-events: none; }
.sc-roadmap .vw-is-milestone .sc-roadmap-diamond { width: 13px; height: 13px; box-shadow: 0 0 0 2px #fff; }
.sc-roadmap .vw-is-milestone.vw-is-selected .sc-roadmap-diamond,
.sc-roadmap .vw-is-milestone:focus-visible .sc-roadmap-diamond { box-shadow: 0 0 0 2px #fff, 0 0 0 4px #9fb1ef; }
.sc-roadmap-milestone { position: absolute; left: calc(50% + 14px); top: 50%; translate: 0 -50%; color: #2a2e40; font-size: 12px; font-weight: 600; white-space: nowrap; pointer-events: none; }
.sc-roadmap-milestone-date { margin-left: 6px; color: #9a9eb0; font-weight: 500; }

/* The Today marker: a solid line with a small pill. */
.sc-roadmap .vw-gantt-marker { border-left: 1.5px solid var(--vw-marker); }
.sc-roadmap .vw-gantt-marker span { padding: 1px 7px; border-radius: 0 0 6px 6px; translate: -50% 0; margin-left: -1px; font-size: 10.5px; font-weight: 650; letter-spacing: .02em; }

@media (max-width: 700px) {
  .sc-roadmap { padding: 16px 12px 14px; border-radius: 12px; }
  .sc-roadmap .vw-gantt { --vw-row-label-width: 158px; }
  .sc-roadmap .vw-gantt-toolbar { padding-inline: 0; }
  .sc-roadmap .vw-gantt-row-label { padding-inline: 6px 8px; }
  .sc-roadmap .vw-gantt-corner { padding-inline: 10px; }
  .sc-roadmap-row .sc-roadmap-avatar, .sc-roadmap-row-meta, .sc-roadmap-heading > span + span, .sc-roadmap-wide { display: none; }
  .sc-roadmap .vw-name-column.vw-tree-row { padding-left: calc(2px + var(--vw-row-depth) * 16px); }
}
</style>
