<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  GanttChart, buildWorkPeriods, computeEarnedValue, invertWorkPeriods, rollupEarnedValue, type EarnedValueEacMethod,
  type EarnedValueMetrics, type EarnedValueRecord, type EarnedValueTask, type TimelineBar, type TimelineColumn, type TimelineRow,
} from '../src'
import { day, hour } from './data'
import DemoPanel from './components/DemoPanel.vue'

// Opt-in example of `computeEarnedValue` and `rollupEarnedValue`: a small delivery project with a budget per task and a
// baseline plan on a weekday 08:00–16:00 calendar. The "actual" progress and cost come from a made-up record of what
// happened (design ran a day long and over cost, assembly overran), sampled at the end of each working day up to the
// chosen status date. The chart shows the baseline with progress and EVM columns; summary rows roll up their tasks.
const origin = Date.parse('2026-11-02T00:00:00Z') // a Monday
const range = { start: origin, end: origin + 35 * day }
const week = { weekly: [1, 2, 3, 4, 5].map(weekday => ({ weekday, startMinute: 8 * 60, endMinute: 16 * 60 })) }
const periods = buildWorkPeriods(range, week)
const calendars = [{ id: 'office', periods }]
// Weekends only: the night hours would shade most of a chart at this zoom.
const weekends = invertWorkPeriods(buildWorkPeriods(range, { weekly: [1, 2, 3, 4, 5].map(weekday => ({ weekday, startMinute: 0, endMinute: 1440 })) }), range)
/** The start of the nth working day (0-based) at 08:00 and its end at 16:00. */
const dayStart = (n: number) => periods[n]!.start
const dayEnd = (n: number) => periods[n]!.end
const workBetween = (from: number, to: number) => periods.reduce((sum, period) => sum + Math.max(0, Math.min(to, period.end) - Math.max(from, period.start)), 0)

interface PlanTask {
  id: string
  parentId: string
  label: string
  budget: number
  /** Planned working days, first and last (inclusive). */
  days: [number, number]
  /** What happened: actual first working day, working days taken and cost per unit of budget. */
  actual: { day: number; days: number; costRate: number }
}
const plan: PlanTask[] = [
  { id: 'spec', parentId: 'engineering', label: 'Specification', budget: 6000, days: [0, 2], actual: { day: 0, days: 3, costRate: 1 } },
  { id: 'design', parentId: 'engineering', label: 'Design', budget: 10000, days: [3, 7], actual: { day: 3, days: 6, costRate: 1.15 } },
  { id: 'procure', parentId: 'delivery', label: 'Procurement', budget: 14000, days: [5, 9], actual: { day: 5, days: 5, costRate: 0.95 } },
  { id: 'assemble', parentId: 'delivery', label: 'Assembly', budget: 21000, days: [10, 16], actual: { day: 10, days: 9, costRate: 1.1 } },
  { id: 'test', parentId: 'delivery', label: 'Testing', budget: 8000, days: [17, 20], actual: { day: 19, days: 4, costRate: 1 } },
  { id: 'handover', parentId: 'delivery', label: 'Handover', budget: 1000, days: [21, 21], actual: { day: 23, days: 0, costRate: 1 } },
]
const milestone = (task: PlanTask) => task.id === 'handover'
const plannedStart = (task: PlanTask) => dayStart(task.days[0])
const plannedEnd = (task: PlanTask) => milestone(task) ? dayStart(task.days[0]) : dayEnd(task.days[1])
const rows: TimelineRow[] = [
  { id: 'engineering', label: 'Engineering' },
  ...plan.filter(task => task.parentId === 'engineering').map(task => ({ id: task.id, parentId: task.parentId, label: task.label })),
  { id: 'delivery', label: 'Delivery' },
  ...plan.filter(task => task.parentId === 'delivery').map(task => ({ id: task.id, parentId: task.parentId, label: task.label })),
]
const children = new Map<string, string[]>()
for (const task of plan) children.set(task.parentId, [...children.get(task.parentId) ?? [], task.id])

/** The made-up record: progress and cost of a task at time t. */
function happened(task: PlanTask, t: number): EarnedValueRecord {
  const { actual } = task
  const progress = actual.days === 0
    ? (t >= dayStart(actual.day) ? 1 : 0)
    : Math.min(1, workBetween(dayStart(actual.day), t) / (actual.days * 8 * hour))
  return { time: t, progress: Math.round(progress * 100) / 100, actualCost: Math.round(progress * task.budget * actual.costRate) }
}

const lastDay = 24
const statusDay = ref(12)
const statusDate = computed(() => dayEnd(statusDay.value))
const method = ref<EarnedValueEacMethod>('cpi')
const methods: { value: EarnedValueEacMethod; label: string }[] = [
  { value: 'cpi', label: 'Cost efficiency (CPI)' },
  { value: 'cpi-spi', label: 'Cost and schedule (CPI × SPI)' },
  { value: 'budget', label: 'Remaining at budget' },
]

const tasks = computed<EarnedValueTask[]>(() => plan.map(task => {
  const history: EarnedValueRecord[] = []
  for (let n = 0; n < statusDay.value; n++) history.push(happened(task, dayEnd(n)))
  const now = happened(task, statusDate.value)
  return {
    id: task.id, budget: task.budget, start: plannedStart(task), end: plannedEnd(task), calendarId: 'office',
    progress: now.progress, actualCost: now.actualCost!, history,
  }
}))
const result = computed(() => computeEarnedValue(tasks.value, {
  statusDate: statusDate.value, calendars, eacMethod: method.value, series: { step: day / 2, start: range.start, end: range.end },
}))
const totals = computed(() => result.value.totals)
const byId = computed(() => new Map(result.value.tasks.map(task => [task.id, task])))
/** A task's metrics, or the rollup of a summary row's tasks. */
function metricsOf(rowId: string): EarnedValueMetrics | undefined {
  const ids = children.get(rowId)
  if (ids) return rollupEarnedValue(ids.map(id => byId.value.get(id)!), { eacMethod: method.value })
  return byId.value.get(rowId)
}

const money = (value: number | undefined) => value === undefined ? 'n/a' : (value / 1000).toFixed(1) + 'k'
const ratio = (value: number | undefined) => value === undefined ? 'n/a' : value.toFixed(2)
const signedMoney = (value: number) => (value < 0 ? '−' : '+') + money(Math.abs(value))
const formatDate = (time: number) => new Date(time).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', timeZone: 'UTC' })
const formatTime = (time: number) => new Date(time).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' })

const columns: TimelineColumn[] = [
  { id: 'bac', label: 'BAC', width: 54, value: row => money(metricsOf(row.id)?.bac) },
  { id: 'pv', label: 'PV', width: 54, value: row => money(metricsOf(row.id)?.pv) },
  { id: 'ev', label: 'EV', width: 54, value: row => money(metricsOf(row.id)?.ev) },
  { id: 'ac', label: 'AC', width: 54, value: row => money(metricsOf(row.id)?.ac) },
  { id: 'spi', label: 'SPI', width: 48, value: row => ratio(metricsOf(row.id)?.spi) },
  { id: 'cpi', label: 'CPI', width: 48, value: row => ratio(metricsOf(row.id)?.cpi) },
]
const bars = computed<TimelineBar[]>(() => plan.map(task => ({
  id: task.id, rowId: task.id, label: task.label, start: plannedStart(task), end: plannedEnd(task), editable: false,
  progress: byId.value.get(task.id)?.percentComplete ?? 0, tone: task.parentId === 'engineering' ? 'violet' : 'blue',
})))

const plannedFinish = Math.max(...plan.map(plannedEnd))
const projectStart = Math.min(...plan.map(plannedStart))
/** A simple time forecast for the chart: the planned duration divided by the SPI (the planned finish without one). */
const forecastFinish = computed(() => {
  const spi = totals.value.spi
  const finish = spi ? projectStart + (plannedFinish - projectStart) / spi : plannedFinish
  return Math.min(range.end, Math.max(statusDate.value, finish))
})
const verdict = computed(() => {
  const { spi, cpi, eac, bac } = totals.value
  const schedule = spi === undefined ? 'no planned value yet' : spi >= 1 ? `on or ahead of schedule (SPI ${ratio(spi)})` : `behind schedule (SPI ${ratio(spi)})`
  const cost = cpi === undefined ? 'no cost yet' : cpi >= 1 ? `on or under budget (CPI ${ratio(cpi)})` : `over budget (CPI ${ratio(cpi)})`
  return `Status ${formatDate(statusDate.value)}: ${schedule}, ${cost}; EAC ${money(eac)} against BAC ${money(bac)}.`
})

// ---- S-curve ----
const width = 720, height = 260
const pad = { left: 46, right: 16, top: 14, bottom: 28 }
const yMax = computed(() => {
  const top = Math.max(totals.value.bac, totals.value.eac ?? 0, ...result.value.series.map(point => point.ac ?? 0))
  return Math.ceil(top / 20000) * 20000
})
const x = (time: number) => pad.left + (time - range.start) / (range.end - range.start) * (width - pad.left - pad.right)
const y = (value: number) => height - pad.bottom - value / yMax.value * (height - pad.top - pad.bottom)
const path = (points: readonly { time: number; value: number | undefined }[]) => points
  .filter(point => point.value !== undefined)
  .map((point, index) => `${index ? 'L' : 'M'}${x(point.time).toFixed(1)},${y(point.value!).toFixed(1)}`).join(' ')
const pvPath = computed(() => path(result.value.series.map(point => ({ time: point.time, value: point.pv }))))
const evPath = computed(() => path(result.value.series.map(point => ({ time: point.time, value: point.ev }))))
const acPath = computed(() => path(result.value.series.map(point => ({ time: point.time, value: point.ac }))))
const forecastPath = computed(() => totals.value.eac === undefined ? '' : path([
  { time: statusDate.value, value: totals.value.ac }, { time: forecastFinish.value, value: totals.value.eac },
]))
const yTicks = computed(() => Array.from({ length: yMax.value / 20000 + 1 }, (_, index) => index * 20000))
const xTicks = Array.from({ length: 5 }, (_, index) => range.start + index * 7 * day)
const curveSummary = computed(() => `S-curve to ${formatDate(range.end)}: planned value reaches ${money(totals.value.bac)} on ${formatDate(plannedFinish)}; `
  + `at the status date ${formatDate(statusDate.value)} PV ${money(totals.value.pv)}, EV ${money(totals.value.ev)}, AC ${money(totals.value.ac)}; `
  + `forecast ${money(totals.value.eac)} by ${formatDate(forecastFinish.value)}.`)
</script>

<template>
  <DemoPanel title-id="earned-value-title" title="Earned value" subtitle="computeEarnedValue · PV accrues on a weekday 08:00–16:00 calendar · summary rows use rollupEarnedValue">
    <template #options>
      <label>Status date <input v-model.number="statusDay" type="range" min="0" :max="lastDay" step="1" :aria-valuetext="formatTime(statusDate)"></label>
      <output aria-label="Selected status date">{{ formatTime(statusDate) }}</output>
      <label>EAC method <select v-model="method"><option v-for="item in methods" :key="item.value" :value="item.value">{{ item.label }}</option></select></label>
    </template>
    <dl class="schedule-metrics evm-tiles" aria-label="Earned value at the status date">
      <div><dt>Planned value (PV)</dt><dd>{{ money(totals.pv) }}</dd></div>
      <div><dt>Earned value (EV)</dt><dd>{{ money(totals.ev) }}</dd><small>SV {{ signedMoney(totals.sv) }}</small></div>
      <div><dt>Actual cost (AC)</dt><dd>{{ money(totals.ac) }}</dd><small>CV {{ signedMoney(totals.cv) }}</small></div>
      <div><dt>SPI</dt><dd>{{ ratio(totals.spi) }}</dd></div>
      <div><dt>CPI</dt><dd>{{ ratio(totals.cpi) }}</dd></div>
      <div><dt>EAC</dt><dd>{{ money(totals.eac) }}</dd><small>BAC {{ money(totals.bac) }} · VAC {{ totals.vac === undefined ? 'n/a' : signedMoney(totals.vac) }}</small></div>
    </dl>
    <p role="status" aria-label="Earned value summary" class="evm-verdict">{{ verdict }}</p>
    <figure class="evm-curve">
      <svg :viewBox="`0 0 ${width} ${height}`" role="img" aria-labelledby="evm-curve-title" aria-describedby="evm-curve-desc">
        <title id="evm-curve-title">Cumulative cost S-curve</title>
        <desc id="evm-curve-desc">{{ curveSummary }}</desc>
        <g class="evm-grid">
          <g v-for="tick in yTicks" :key="tick">
            <line :x1="pad.left" :x2="width - pad.right" :y1="y(tick)" :y2="y(tick)" />
            <text :x="pad.left - 6" :y="y(tick)" text-anchor="end" dominant-baseline="middle">{{ money(tick) }}</text>
          </g>
          <text v-for="tick in xTicks" :key="tick" :x="x(tick)" :y="height - 8" text-anchor="middle">{{ formatDate(tick) }}</text>
        </g>
        <line class="evm-bac" :x1="pad.left" :x2="width - pad.right" :y1="y(totals.bac)" :y2="y(totals.bac)" />
        <line class="evm-status" :x1="x(statusDate)" :x2="x(statusDate)" :y1="pad.top" :y2="height - pad.bottom" />
        <path class="evm-line evm-pv" :d="pvPath" />
        <path class="evm-line evm-forecast" :d="forecastPath" />
        <path class="evm-line evm-ac" :d="acPath" />
        <path class="evm-line evm-ev" :d="evPath" />
      </svg>
      <figcaption>
        <ul class="evm-legend" aria-label="S-curve legend">
          <li><span class="evm-key evm-pv" aria-hidden="true"></span>Planned value (PV)</li>
          <li><span class="evm-key evm-ev" aria-hidden="true"></span>Earned value (EV)</li>
          <li><span class="evm-key evm-ac" aria-hidden="true"></span>Actual cost (AC)</li>
          <li><span class="evm-key evm-forecast" aria-hidden="true"></span>Forecast to EAC</li>
          <li><span class="evm-key evm-bac" aria-hidden="true"></span>Budget at completion</li>
        </ul>
      </figcaption>
    </figure>
    <GanttChart :rows="rows" :bars="bars" :range="range" :columns="columns" show-summaries readonly :status-date="statusDate"
      :format-time="formatDate" :pixels-per-unit="26 / day" :tick-steps="[day, 7 * day]" :non-working-periods="weekends"
      :row-height="40" :height="372" :labels="{ region: 'Earned value plan' }">
      <template #row-heading>Work package</template>
    </GanttChart>
  </DemoPanel>
</template>

<style scoped>
.evm-tiles small { display: block; margin-top: 2px; color: var(--vw-muted, #526579); font-size: 11px; }
.evm-verdict { margin: 0 0 10px; font-size: 13px; }
.evm-curve { margin: 0 0 14px; }
.evm-curve svg { display: block; width: 100%; max-width: 760px; height: auto; }
.evm-grid line { stroke: var(--vw-border, #dbe3ec); stroke-width: 1; }
.evm-grid text { fill: var(--vw-muted, #526579); font-size: 10px; font-variant-numeric: tabular-nums; }
.evm-line { fill: none; stroke-width: 2; stroke-linejoin: round; stroke-linecap: round; }
.evm-pv { stroke: #5f7387; stroke-dasharray: 6 4; }
.evm-ev { stroke: #1f7a6d; }
.evm-ac { stroke: #b4531a; }
.evm-forecast { stroke: #b4531a; stroke-dasharray: 2 4; }
.evm-bac { stroke: var(--vw-muted, #526579); stroke-width: 1; stroke-dasharray: 1 3; }
.evm-status { stroke: var(--vw-accent, #245e96); stroke-width: 1.5; }
.evm-legend { display: flex; flex-wrap: wrap; gap: 14px; margin: 6px 0 0; padding: 0; list-style: none; font-size: 12px; }
.evm-legend li { display: inline-flex; align-items: center; gap: 5px; }
.evm-key { display: inline-block; width: 22px; height: 0; border-top: 2px solid; }
.evm-key.evm-pv { border-top-style: dashed; border-color: #5f7387; }
.evm-key.evm-ev { border-color: #1f7a6d; }
.evm-key.evm-ac { border-color: #b4531a; }
.evm-key.evm-forecast { border-top-style: dotted; border-color: #b4531a; }
.evm-key.evm-bac { border-top: 1px dotted var(--vw-muted, #526579); }
:global(.dark .evm-pv) { stroke: #9fb2c4; }
:global(.dark .evm-ev) { stroke: #4fc1ae; }
:global(.dark .evm-ac), :global(.dark .evm-forecast) { stroke: #f0965a; }
:global(.dark .evm-key.evm-pv) { border-color: #9fb2c4; }
:global(.dark .evm-key.evm-ev) { border-color: #4fc1ae; }
:global(.dark .evm-key.evm-ac), :global(.dark .evm-key.evm-forecast) { border-color: #f0965a; }
@media (forced-colors: active) {
  .evm-line, .evm-bac, .evm-status { stroke: CanvasText; }
  .evm-key { border-color: CanvasText !important; }
}
</style>
