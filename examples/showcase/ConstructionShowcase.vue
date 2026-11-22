<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef, useId } from 'vue'
import {
  GanttChart, buildWorkPeriods, calculateResourceLoad, comparePlans, computeEarnedValue, invertWorkPeriods, levelResources,
  planBaselines, rescheduleFromStatusDate, scheduleTasks, scheduledBarFields, timelineConstraints, timelineCsvTable, toCsv,
  toMsProjectXml, type ScheduleInput, type ScheduleSuccess, type ScheduleTask, type ScheduledTask, type TimelineBand,
  type TimelineBar, type TimelineColumn, type TimelineEdit, type TimelineRow, type TimeRange,
} from '../../src'
import { download } from '../download'
import {
  assignments, baselineDurations, contractCompletion, crewLabel, crews, day, dependencies, holidays, on, phases, range,
  reportedProgress, scheduleTasksOf, statusDate, steelDeliveryId, tasks as program,
} from './constructionData'

// An executive master schedule for an office tower. Every date comes from the core scheduler: a weekday calendar with
// holidays, FS and SS links with lags, requested starts, a status date with reported progress, and resource leveling.
// The chart is controlled: an accepted bar edit becomes a requested start or a duration and the plan is recalculated.
interface RowData { kind: 'phase' | 'task' | 'milestone'; wbs: string }
interface ProgramRow extends TimelineRow<RowData> { data: RowData }

const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const formatTime = (time: number) => { const date = new Date(time); return `${date.getUTCDate()} ${months[date.getUTCMonth()]}` }
const formatDate = (time: number) => `${formatTime(time)} ${new Date(time).getUTCFullYear()}`
const money = (thousands: number | undefined) => thousands === undefined ? 'n/a' : `$${(thousands / 1000).toFixed(1)}M`
const signedMoney = (thousands: number) => (thousands < 0 ? '−' : '+') + money(Math.abs(thousands))
const ratio = (value: number | undefined) => value === undefined ? 'n/a' : value.toFixed(2)
const signedDays = (days: number) => days === 0 ? '±0 wd' : `${days > 0 ? '+' : '−'}${Math.abs(days)} wd`

// ---- calendar: weekdays, with holidays and the winter shutdown closed ----
const exceptions = Object.fromEntries(holidays.map(date => [date, []]))
const allDay = (weekday: number) => ({ weekday, startMinute: 0, endMinute: 1440 })
const periods = buildWorkPeriods(range, { weekly: [1, 2, 3, 4, 5].map(allDay), exceptions })
const calendars = [{ id: 'site', periods }]
// Only holidays and the shutdown are shaded; weekends would stripe the whole chart at this zoom.
const closures = invertWorkPeriods(buildWorkPeriods(range, { weekly: [0, 1, 2, 3, 4, 5, 6].map(allDay), exceptions }), range)
/** Working time in [from, to), in elapsed units. */
const workIn = (from: number, to: number) =>
  periods.reduce((sum, period) => sum + Math.max(0, Math.min(to, period.end) - Math.max(from, period.start)), 0)
/** Signed working days from a to b. */
const workDaysBetween = (a: number, b: number) => Math.round((b >= a ? workIn(a, b) : -workIn(b, a)) / day)
const input = (list: readonly ScheduleTask[]): ScheduleInput => ({ range, quantum: day, calendars, defaultCalendarId: 'site', tasks: list, dependencies })
const resources = crews.map(crew => ({ id: crew.id, capacity: crew.capacity, periods }))
const programById = new Map(program.map(task => [task.id, task]))
const labelOf = (id: string) => programById.get(id)?.label ?? phases.find(phase => phase.id === id)?.label ?? id
const started = (id: string) => (reportedProgress.get(id) ?? 0) > 0

function mustSchedule(result: ReturnType<typeof scheduleTasks>): ScheduleSuccess {
  if (!result.ok) throw new Error('The construction program must be feasible')
  return result
}
// The signed-off baseline: the same logic before ground conditions lengthened piling and excavation.
const baselinePlan = mustSchedule(scheduleTasks(input(scheduleTasksOf(program.map(task => ({ ...task, days: baselineDurations.get(task.id) ?? task.days }))))))
const baselines = planBaselines(baselinePlan, 'baseline')
const baselineById = new Map(baselinePlan.tasks.map(task => [task.id, task]))

/**
 * The plan at the status date. rescheduleFromStatusDate keeps the reported work in place and moves the rest after the
 * status date; the result is then pinned (fixed starts and pauses for started tasks, the status date as earliest start
 * for the others), so that scheduleTasks and levelResources both plan from the same progress. The what-if scenario
 * adds ten working days to the remaining steel delivery.
 */
function statusTasks(list: readonly ScheduleTask[], steelDelay: boolean): ScheduleTask[] {
  const progressed = rescheduleFromStatusDate(input(list), statusDate, reportedProgress)
  if (!progressed.ok) throw new Error('The reported progress must fit the program')
  const placed = new Map(progressed.tasks.map(task => [task.id, task]))
  return list.map(task => {
    if (task.parentId === undefined) return task
    let next: ScheduleTask
    if (started(task.id)) {
      const { work, start } = placed.get(task.id)!
      const { startNoEarlierThan: _requested, ...rest } = task
      const pauses = work.slice(1).map((piece, index) => ({ start: work[index]!.end, end: piece.start }))
      next = { ...rest, fixedStart: start, ...(pauses.length ? { pauses } : {}) }
    } else next = { ...task, startNoEarlierThan: Math.max(task.startNoEarlierThan ?? range.start, statusDate) }
    return steelDelay && task.id === steelDeliveryId ? { ...next, duration: next.duration + 10 * day } : next
  })
}

const initialTasks = scheduleTasksOf(program)
const planTasks = shallowRef<ScheduleTask[]>(initialTasks)
const whatIf = ref(false)
const showAllLinks = ref(false)
const leveled = ref(false)
const status = ref('Status date 14 Sep 2026. Drag or use the arrow keys on an unstarted bar to reschedule it; the plan is recalculated.')
const scenario = (steelDelay: boolean) => {
  const list = statusTasks(planTasks.value, steelDelay)
  return { tasks: list, plan: mustSchedule(scheduleTasks(input(list))) }
}
const current = computed(() => scenario(false))
const delayed = computed(() => whatIf.value ? scenario(true) : undefined)
const shown = computed(() => delayed.value ?? current.value)
const plan = computed(() => shown.value.plan)
const byId = computed(() => new Map(plan.value.tasks.map(task => [task.id, task])))
const handover = computed(() => byId.value.get('handover')!.start)
// comparePlans measures the what-if against the current plan: the finish shift and every task it moves.
const comparison = computed(() => delayed.value && comparePlans(
  { input: input(current.value.tasks), result: current.value.plan },
  { input: input(delayed.value.tasks), result: delayed.value.plan },
))
const whatIfSlip = computed(() => comparison.value ? workDaysBetween(current.value.plan.finish, delayed.value!.plan.finish) : 0)
const baselineSlip = computed(() => workDaysBetween(baselineById.get('handover')!.start, handover.value))
const contractMargin = computed(() => workDaysBetween(handover.value, contractCompletion))
const load = computed(() => calculateResourceLoad(range, plan.value.tasks, resources, assignments))
// The histogram draws each task's work across weekends and holidays it spans, so crews read as solid blocks; the
// over-allocation figure above counts working days only.
const loadView = computed(() => calculateResourceLoad(range, plan.value.tasks.map(task => ({
  ...task, work: task.work.length ? splitWork(task) ?? [{ start: task.start, end: task.end }] : [],
})), crews.map(({ id, capacity }) => ({ id, capacity })), assignments))
const overCrewDays = computed(() => load.value.reduce((sum, segment) => sum + segment.overload * workIn(segment.start, segment.end) / day, 0))
/** The next unfinished critical tasks, in date order: what the site team must protect. */
const criticalAhead = computed(() => plan.value.tasks
  .filter(task => task.critical && !task.summary && task.end > task.start && (reportedProgress.get(task.id) ?? 0) < 1)
  .sort((a, b) => a.start - b.start).slice(0, 5))
const criticalLinks = computed(() => new Set(plan.value.criticalDependencyIds))

// ---- earned value: baseline dates, reported progress, cost rates, and weekly history from the work done ----
const progressedPlan = mustSchedule(scheduleTasks(input(statusTasks(initialTasks, false))))
const workDone = (task: ScheduledTask, time: number) => task.work.reduce((sum, piece) => sum + Math.max(0, Math.min(time, piece.end) - piece.start), 0)
const earned = computeEarnedValue(program.filter(task => task.budget > 0).map(task => {
  const progress = reportedProgress.get(task.id) ?? 0
  const done = progressedPlan.tasks.find(item => item.id === task.id)!
  const doneAtStatus = workDone(done, statusDate)
  const at = (time: number) => doneAtStatus ? progress * workDone(done, time) / doneAtStatus : 0
  const history = []
  for (let time = range.start; time < statusDate; time += 7 * day) {
    history.push({ time, progress: at(time), actualCost: Math.round(at(time) * task.budget * (task.costRate ?? 1)) })
  }
  const { start, end } = baselineById.get(task.id)!
  return { id: task.id, budget: task.budget, start, end, calendarId: 'site', progress, actualCost: Math.round(progress * task.budget * (task.costRate ?? 1)), history }
}), { statusDate, calendars, series: { step: 7 * day, start: range.start, end: baselinePlan.finish } })
const totals = earned.totals

// ---- S-curve ----
const curve = { width: 560, height: 230, left: 52, right: 14, top: 14, bottom: 26 }
const yMax = Math.ceil(Math.max(totals.bac, totals.eac ?? 0) / 10_000) * 10_000
const cx = (time: number) => curve.left + (time - range.start) / (range.end - range.start) * (curve.width - curve.left - curve.right)
const cy = (value: number) => curve.height - curve.bottom - value / yMax * (curve.height - curve.top - curve.bottom)
const line = (points: readonly (readonly [number, number | undefined])[]) => points.filter(([, value]) => value !== undefined)
  .map(([time, value], index) => `${index ? 'L' : 'M'}${cx(time).toFixed(1)},${cy(value!).toFixed(1)}`).join('')
const pvLine = line(earned.series.map(point => [point.time, point.pv]))
const pvArea = `${pvLine}L${cx(baselinePlan.finish).toFixed(1)},${cy(0)}L${cx(range.start).toFixed(1)},${cy(0)}Z`
const evLine = line(earned.series.map(point => [point.time, point.ev]))
const acLine = line(earned.series.map(point => [point.time, point.ac]))
const forecastEv = computed(() => line([[statusDate, totals.ev], [plan.value.finish, totals.bac]]))
const forecastAc = computed(() => line([[statusDate, totals.ac], [plan.value.finish, totals.eac]]))
const yTicks = Array.from({ length: yMax / 10_000 + 1 }, (_, index) => index * 10_000)
const xTicks = [on(2026, 4, 1), on(2026, 7, 1), on(2026, 10, 1), on(2027, 1, 1), on(2027, 4, 1)]
const curveId = useId()
const curveSummary = computed(() => `Planned value reaches ${money(totals.bac)} on ${formatDate(baselinePlan.finish)}. At the status date PV is `
  + `${money(totals.pv)}, EV ${money(totals.ev)} and AC ${money(totals.ac)}; the forecast reaches ${money(totals.eac)} on ${formatDate(plan.value.finish)}.`)

// ---- chart ----
const wbs = new Map<string, string>()
phases.forEach((phase, index) => {
  wbs.set(phase.id, String(index + 1))
  program.filter(task => task.phase === phase.id).forEach((task, child) => wbs.set(task.id, `${index + 1}.${child + 1}`))
})
const rows: ProgramRow[] = phases.flatMap(phase => [
  { id: phase.id, label: phase.label, data: { kind: 'phase' as const, wbs: wbs.get(phase.id)! } },
  ...program.filter(task => task.phase === phase.id).map(task => ({
    id: task.id, parentId: phase.id, label: task.label, data: { kind: task.days ? 'task' as const : 'milestone' as const, wbs: wbs.get(task.id)! },
  })),
])
const collapsed = ref<ReadonlySet<string>>(new Set(['site', 'sub']))
// The chart is as tall as its content, so the crew load rows stay in view below the tasks.
const rowHeight = 25, loadRowHeight = 32
const chartHeight = computed(() => 40 + 2 * 26 + rows.filter(row => !row.parentId || !collapsed.value.has(row.parentId)).length * rowHeight
  + crews.length * loadRowHeight + 16)
const quarters: TimelineBand[] = []
for (let year = 2026, quarter = 0; on(year, quarter * 3 + 1, 1) < range.end; quarter === 3 ? (year++, quarter = 0) : quarter++) {
  const start = Math.max(range.start, on(year, quarter * 3 + 1, 1)), end = Math.min(range.end, on(year, quarter * 3 + 4, 1))
  if (end > start) quarters.push({ start, end, label: end - start > 40 * day ? `Q${quarter + 1} ${year}` : `Q${quarter + 1}` })
}
const monthBands: TimelineBand[] = []
for (let time = range.start; time < range.end;) {
  const date = new Date(time), next = Math.min(range.end, on(date.getUTCFullYear(), date.getUTCMonth() + 2, 1))
  monthBands.push({ start: time, end: next, label: months[date.getUTCMonth()]! })
  time = next
}
const markers = [{ id: 'contract', time: contractCompletion, label: 'Contract' }]
/** Work pieces split by more than calendar time off: the reported work and its resumption after the status date. */
function splitWork(task: ScheduledTask): TimeRange[] | undefined {
  const pieces: TimeRange[] = []
  for (const piece of task.work) {
    const last = pieces[pieces.length - 1]
    if (last && workIn(last.end, piece.start) === 0) pieces[pieces.length - 1] = { start: last.start, end: piece.end }
    else pieces.push({ ...piece })
  }
  return pieces.length > 1 ? pieces : undefined
}
const bars = computed<TimelineBar[]>(() => program.map(task => {
  const scheduled = byId.value.get(task.id)!
  const { segments: _segments, critical, latestEnd, ...dates } = scheduledBarFields(scheduled)
  const progress = reportedProgress.get(task.id) ?? 0
  const done = progress >= 1
  const requested = planTasks.value.find(item => item.id === task.id)?.startNoEarlierThan
  return {
    id: task.id, rowId: task.id, label: task.label, ...dates, progress: task.days ? progress : undefined,
    segments: splitWork(scheduled), baselines: [baselines.get(task.id)!],
    tone: done ? 'teal' : critical ? 'amber' : 'blue', critical: critical && !done,
    ...(done || critical || !task.days ? {} : { latestEnd }),
    ...(task.id === 'handover' ? { deadline: contractCompletion } : {}),
    ...(started(task.id) || requested === undefined ? {} : { constraints: timelineConstraints({ startNoEarlierThan: requested }) }),
    editable: !done && task.days > 0,
    description: crewLabel(task.id) ?? (task.days ? 'Subcontract package' : 'Milestone'),
  }
}))
const chartLinks = computed(() => showAllLinks.value ? dependencies : dependencies.filter(link => criticalLinks.value.has(link.id)))
const loadRows = crews.map(crew => ({ id: crew.id, label: crew.label, detail: `${crew.capacity} ${crew.capacity === 1 ? 'crew' : 'crews'}` }))
/** The last working day of a task or summary (its end is the exclusive midnight after it); a milestone's own day. */
function lastWorkDay(task: TimeRange) {
  if (task.end === task.start) return task.start
  let last = task.start
  for (const period of periods) if (period.start < task.end) last = Math.min(period.end, task.end) - day
  return last
}
const columns: TimelineColumn<ProgramRow>[] = [
  { id: 'finish', label: 'Finish', width: 58, value: row => formatTime(lastWorkDay(byId.value.get(row.id)!)) },
  { id: 'float', label: 'Float', width: 46, value: row => {
    const task = byId.value.get(row.id)!
    return reportedProgress.get(row.id) === 1 ? 'done' : `${Math.round(task.workFloat / day)}d`
  } },
  { id: 'variance', label: 'Var', width: 48, value: row => {
    const task = byId.value.get(row.id)!, base = baselineById.get(row.id)!
    const days = workDaysBetween(lastWorkDay(base), lastWorkDay(task))
    return days ? (days > 0 ? '+' : '−') + Math.abs(days) + 'd' : '0d'
  } },
]
const milestones = ['sub-done', 'topping', 'watertight', 'handover'].map(id => ({ id, label: labelOf(id) }))

// ---- edits, leveling and scenarios ----
const animating = ref(false)
let animationTimer: ReturnType<typeof setTimeout> | undefined
function animate() {
  animating.value = true
  clearTimeout(animationTimer)
  animationTimer = setTimeout(() => { animating.value = false }, 900)
}
onBeforeUnmount(() => clearTimeout(animationTimer))
function handoverNote(before: number) {
  const shift = workDaysBetween(before, handover.value)
  return `Practical completion ${formatDate(handover.value)} (${shift ? signedDays(shift) : 'no change'}).`
}
function validateEdit(change: TimelineEdit) {
  if (started(change.id)) return `${labelOf(change.id)} has started; report progress instead of moving it.`
  if (change.mode === 'start') return 'Drag the bar to move it, or its right edge to change its duration.'
}
function onEdit(change: TimelineEdit) {
  const before = handover.value
  const next = planTasks.value.map(task => task.id !== change.id ? task : change.mode === 'move'
    ? { ...task, startNoEarlierThan: change.after.start }
    : { ...task, duration: Math.max(day, workIn(change.before.start, change.after.end)) })
  try {
    statusTasks(next, whatIf.value)
    mustSchedule(scheduleTasks(input(statusTasks(next, whatIf.value))))
  } catch {
    status.value = `${labelOf(change.id)} cannot go there: the program would run past ${formatDate(range.end)}.`
    return
  }
  planTasks.value = next
  const task = byId.value.get(change.id)!
  const held = change.mode === 'move' && task.start > change.after.start
  status.value = (change.mode === 'move'
    ? `${labelOf(change.id)} starts ${formatTime(task.start)}${held ? ', held by its predecessors' : ''}. `
    : `${labelOf(change.id)} now takes ${task.work.reduce((sum, piece) => sum + piece.end - piece.start, 0) / day} working days. `) + handoverNote(before)
}
function onRejected(_change: TimelineEdit, reason: string) {
  status.value = reason
}
function toggleWhatIf() {
  const before = handover.value
  whatIf.value = !whatIf.value
  animate()
  status.value = whatIf.value
    ? `What-if: steel package B arrives 10 working days late; ${comparison.value?.result.consequenceTaskIds.length ?? 0} tasks move. ${handoverNote(before)}`
    : `Steel delivery back on its forecast. ${handoverNote(before)}`
}
function level() {
  const before = handover.value
  const result = levelResources({ ...input(shown.value.tasks), resources, assignments })
  if (!result.ok) return
  // Persist each capacity delay as a requested start; successors follow through their links.
  const delays = new Map(result.delays.filter(delay => delay.cause === 'capacity').map(delay => [delay.taskId, delay.after.start]))
  planTasks.value = planTasks.value.map(task => delays.has(task.id) ? { ...task, startNoEarlierThan: delays.get(task.id)! } : task)
  leveled.value = true
  animate()
  const names = [...delays.keys()].map(labelOf).join(' and ')
  status.value = delays.size ? `Levelled: ${names} wait for free crews. ${handoverNote(before)}` : 'No crew is over-allocated.'
}
function reset() {
  planTasks.value = initialTasks
  whatIf.value = false
  leveled.value = false
  animate()
  status.value = 'Plan reset to the reported status.'
}

// ---- exports ----
const chart = ref<InstanceType<typeof GanttChart>>()
function exportMsProject() {
  const tasks = rows.map(row => {
    const task = byId.value.get(row.id)!, base = baselineById.get(row.id)!
    const requested = planTasks.value.find(item => item.id === row.id)?.startNoEarlierThan
    return {
      id: row.id, name: row.label, start: task.start, end: task.end, outlineLevel: row.parentId ? 2 : 1,
      percentComplete: Math.round((reportedProgress.get(row.id) ?? 0) * 100), baselines: [{ number: 0, start: base.start, end: base.end }],
      ...(row.parentId && !started(row.id) && requested !== undefined ? { constraints: { startNoEarlierThan: requested } } : {}),
    }
  })
  const xml = toMsProjectXml({
    name: 'Office tower master schedule', tasks,
    dependencies: dependencies.map(link => ({ from: link.from, to: link.to, type: link.type, lag: link.lag })),
    resources: crews.map(crew => ({ id: crew.id, name: crew.label, maxUnits: crew.capacity })), assignments,
  })
  download(new Blob([xml], { type: 'application/xml' }), 'office-tower.xml')
  status.value = `Exported Microsoft Project XML with ${tasks.length} tasks and ${dependencies.length} links.`
}
function exportCsv() {
  const csv = toCsv(timelineCsvTable(rows, bars.value, { formatTime: time => new Date(time).toISOString().slice(0, 10) }))
  download(new Blob([csv], { type: 'text/csv' }), 'office-tower.csv')
  status.value = `Exported CSV with ${bars.value.length} work packages.`
}
function exportSvg() {
  const svg = chart.value?.exportSvg({ title: 'Office tower · master schedule', rowHeading: 'Work breakdown' })
  if (!svg) return
  download(svg, 'office-tower.svg')
  status.value = 'Exported the schedule as SVG.'
}
</script>

<template>
  <section class="sc-build" :class="{ 'sc-build-animating': animating }" aria-label="Construction program">
    <div class="sc-build-head">
      <div>
        <p class="sc-build-eyebrow">Harbour Point · 9-storey office tower</p>
        <h2>Construction program</h2>
        <p class="sc-build-intro">
          A master schedule computed by the core scheduler on a site calendar with holidays: critical path, float, baseline
          strips, the status date with reported progress, crew load with leveling, earned value and a steel-delay what-if.
        </p>
      </div>
      <div class="sc-build-actions">
        <label class="sc-build-switch"><input type="checkbox" :checked="whatIf" @change="toggleWhatIf"><span aria-hidden="true"></span>What-if: delay steel delivery +10 working days</label>
        <button type="button" class="sc-build-primary" :disabled="overCrewDays === 0" @click="level">{{ overCrewDays === 0 && leveled ? 'Resources levelled' : 'Level resources' }}</button>
        <button type="button" @click="reset">Reset</button>
      </div>
    </div>

    <div class="sc-build-kpis" aria-label="Key indicators">
      <div class="sc-build-kpi sc-build-kpi-hero" role="group" aria-label="Forecast handover" :class="{ 'sc-build-late': contractMargin < 0 }">
        <span class="sc-build-kpi-label">Forecast handover</span>
        <strong>{{ formatDate(handover) }}</strong>
        <span class="sc-build-badges">
          <span class="sc-build-badge" :class="baselineSlip > 0 ? 'sc-build-badge-warn' : 'sc-build-badge-ok'">{{ signedDays(baselineSlip) }} vs baseline</span>
          <span v-if="whatIf" class="sc-build-badge sc-build-badge-bad">what-if {{ signedDays(whatIfSlip) }}</span>
        </span>
        <small>{{ contractMargin >= 0 ? `${contractMargin} wd margin to contract ${formatTime(contractCompletion)}` : `${-contractMargin} wd past contract ${formatTime(contractCompletion)}` }}</small>
      </div>
      <div class="sc-build-kpi" role="group" aria-label="Schedule performance">
        <span class="sc-build-kpi-label">SPI</span><strong :class="{ 'sc-build-neg': (totals.spi ?? 1) < 1 }">{{ ratio(totals.spi) }}</strong>
        <small>SV {{ signedMoney(totals.sv) }}</small>
      </div>
      <div class="sc-build-kpi" role="group" aria-label="Cost performance">
        <span class="sc-build-kpi-label">CPI</span><strong :class="{ 'sc-build-neg': (totals.cpi ?? 1) < 1 }">{{ ratio(totals.cpi) }}</strong>
        <small>CV {{ signedMoney(totals.cv) }}</small>
      </div>
      <div class="sc-build-kpi" role="group" aria-label="Estimate at completion">
        <span class="sc-build-kpi-label">EAC</span><strong>{{ money(totals.eac) }}</strong>
        <small>BAC {{ money(totals.bac) }} · VAC {{ signedMoney(totals.vac ?? 0) }}</small>
      </div>
      <div class="sc-build-kpi" role="group" aria-label="Percent complete">
        <span class="sc-build-kpi-label">Complete</span><strong>{{ Math.round(totals.ev / totals.bac * 100) }}%</strong>
        <span class="sc-build-meter" aria-hidden="true"><span :style="{ width: totals.ev / totals.bac * 100 + '%' }"></span><i :style="{ left: totals.pv / totals.bac * 100 + '%' }"></i></span>
        <small>planned {{ Math.round(totals.pv / totals.bac * 100) }}%</small>
      </div>
      <div class="sc-build-kpi" role="group" aria-label="Crew over-allocation">
        <span class="sc-build-kpi-label">Over-allocation</span><strong :class="{ 'sc-build-neg': overCrewDays > 0 }">{{ overCrewDays }}</strong>
        <small>crew-days over capacity</small>
      </div>
    </div>

    <GanttChart
      ref="chart" :rows="rows" :bars="bars" :dependencies="chartLinks" :range="range" :pixels-per-unit="2.05 / day"
      :tick-steps="[28 * day, 56 * day]" :snap="day" :min-duration="day" :format-time="formatTime" :header-bands="[quarters, monthBands]"
      :non-working-periods="closures" :row-height="rowHeight" :height="chartHeight" :columns="columns" show-summaries :collapsed-ids="collapsed"
      :highlighted-dependency-ids="criticalLinks" :status-date="statusDate" show-progress-line :markers="markers"
      :load-rows="loadRows" :load-segments="loadView" :load-row-height="loadRowHeight" :baseline-ids="['baseline']" :baseline-label="() => 'Baseline'"
      :format-variance="value => `${value >= 0 ? '+' : '−'}${Math.abs(Math.round(value / day))} d`" :format-lag="value => `+${value / day} d`"
      :validate-edit="validateEdit" dependency-style="rounded" sticky-band-labels
      :labels="{ region: 'Construction master schedule', rows: 'Work breakdown', statusDate: 'Status', loadRegion: 'Crew load', critical: 'Critical path', deadline: 'Contract completion', late: 'Late against contract' }"
      @update:collapsed-ids="collapsed = $event" @edit="onEdit" @edit-rejected="onRejected"
    >
      <template #legend>
        <ul class="sc-build-legend" aria-label="Legend">
          <li><span class="sc-build-key sc-build-key-critical"></span>Critical path</li>
          <li><span class="sc-build-key sc-build-key-normal"></span>Float</li>
          <li><span class="sc-build-key sc-build-key-done"></span>Complete</li>
          <li><span class="sc-build-key sc-build-key-baseline"></span>Baseline</li>
          <li><span class="sc-build-key sc-build-key-status"></span>Status date</li>
          <li><span class="sc-build-key sc-build-key-over"></span>Over-allocated</li>
          <li><label><input v-model="showAllLinks" type="checkbox"> Show all links</label></li>
        </ul>
      </template>
      <template #row="{ row }">
        <span class="sc-build-row" :class="`sc-build-row-${row.data.kind}`">
          <span class="sc-build-wbs">{{ row.data.wbs }}</span>
          <span v-if="row.data.kind === 'milestone'" class="sc-build-diamond" aria-hidden="true"></span>
          <span class="sc-build-name">{{ row.label }}</span>
        </span>
      </template>
      <template #cell="{ row, column, value }">
        <span class="sc-build-cell" :class="{
          'sc-build-cell-phase': row.data.kind === 'phase', 'sc-build-cell-zero': column.id === 'float' && value === '0d',
          'sc-build-cell-late': column.id === 'variance' && String(value).startsWith('+'), 'sc-build-cell-done': value === 'done' }">{{ value }}</span>
      </template>
      <template #tick="{ time }"><span class="sc-build-tick">Wk {{ Math.round((time - range.start) / (7 * day)) + 1 }}</span></template>
      <template #bar="{ bar }">
        <span v-if="bar.start === bar.end" class="sc-build-milestone" :class="{ 'sc-build-milestone-end': bar.start > range.end - 60 * day }">{{ bar.label }} · {{ formatTime(bar.start) }}</span>
        <span v-else class="sc-build-bar"></span>
      </template>
      <template #load-row="{ row, peak }">
        <span class="sc-build-crew"><span>{{ row.label }}</span><small>{{ row.detail }} · peak {{ peak }}</small></span>
      </template>
    </GanttChart>

    <div class="sc-build-panels">
      <figure class="sc-build-panel sc-build-curve">
        <figcaption>
          <h3>Earned value · S-curve</h3>
          <ul class="sc-build-legend" aria-label="S-curve legend">
            <li><span class="sc-build-line sc-build-pv"></span>Planned (PV)</li>
            <li><span class="sc-build-line sc-build-ev"></span>Earned (EV)</li>
            <li><span class="sc-build-line sc-build-ac"></span>Actual cost (AC)</li>
            <li><span class="sc-build-line sc-build-fc"></span>Forecast</li>
          </ul>
        </figcaption>
        <svg :viewBox="`0 0 ${curve.width} ${curve.height}`" role="img" :aria-labelledby="curveId + '-title'" :aria-describedby="curveId + '-desc'">
          <title :id="curveId + '-title'">Cumulative cost S-curve</title>
          <desc :id="curveId + '-desc'">{{ curveSummary }}</desc>
          <defs>
            <linearGradient :id="curveId + '-fill'" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stop-color="#7aa7d9" stop-opacity=".28" /><stop offset="1" stop-color="#7aa7d9" stop-opacity="0" />
            </linearGradient>
          </defs>
          <g class="sc-build-grid">
            <g v-for="tick in yTicks" :key="tick">
              <line :x1="curve.left" :x2="curve.width - curve.right" :y1="cy(tick)" :y2="cy(tick)" />
              <text :x="curve.left - 8" :y="cy(tick)" text-anchor="end" dominant-baseline="middle">{{ money(tick) }}</text>
            </g>
            <text v-for="tick in xTicks" :key="tick" :x="cx(tick)" :y="curve.height - 6" text-anchor="middle">{{ months[new Date(tick).getUTCMonth()] }} {{ String(new Date(tick).getUTCFullYear()).slice(2) }}</text>
          </g>
          <path :d="pvArea" :fill="`url(#${curveId}-fill)`" />
          <line class="sc-build-curve-status" :x1="cx(statusDate)" :x2="cx(statusDate)" :y1="curve.top" :y2="curve.height - curve.bottom" />
          <text class="sc-build-curve-tag" :x="cx(statusDate) + 5" :y="curve.top + 8">Status</text>
          <path class="sc-build-path sc-build-pv" :d="pvLine" />
          <path class="sc-build-path sc-build-fc sc-build-fc-ev" :d="forecastEv" />
          <path class="sc-build-path sc-build-fc" :d="forecastAc" />
          <path class="sc-build-path sc-build-ac" :d="acLine" />
          <path class="sc-build-path sc-build-ev" :d="evLine" />
          <circle class="sc-build-dot sc-build-ev" :cx="cx(statusDate)" :cy="cy(totals.ev)" r="3.5" />
          <circle class="sc-build-dot sc-build-ac" :cx="cx(statusDate)" :cy="cy(totals.ac)" r="3.5" />
        </svg>
      </figure>
      <section class="sc-build-panel sc-build-milestones" aria-label="Key milestones">
        <h3>Key milestones</h3>
        <table>
          <thead><tr><th scope="col">Milestone</th><th scope="col">Baseline</th><th scope="col">Forecast</th><th scope="col">Var</th></tr></thead>
          <tbody>
            <tr v-for="item in milestones" :key="item.id">
              <th scope="row">{{ item.label }}</th>
              <td>{{ formatTime(baselineById.get(item.id)!.start) }}</td>
              <td>{{ formatTime(byId.get(item.id)!.start) }}</td>
              <td><span class="sc-build-badge" :class="workDaysBetween(baselineById.get(item.id)!.start, byId.get(item.id)!.start) > 0 ? 'sc-build-badge-warn' : 'sc-build-badge-ok'">{{ signedDays(workDaysBetween(baselineById.get(item.id)!.start, byId.get(item.id)!.start)) }}</span></td>
            </tr>
          </tbody>
        </table>
        <h3>Next on the critical path</h3>
        <ol class="sc-build-ahead">
          <li v-for="task in criticalAhead" :key="task.id">
            <span>{{ labelOf(task.id) }}</span><small>{{ formatTime(task.start) }} – {{ formatTime(lastWorkDay(task)) }}</small>
          </li>
        </ol>
        <div class="sc-build-exports" role="group" aria-label="Export">
          <span>Export</span>
          <button type="button" @click="exportMsProject">MS Project XML</button>
          <button type="button" @click="exportCsv">CSV</button>
          <button type="button" @click="exportSvg">SVG</button>
        </div>
      </section>
    </div>
    <p class="sc-build-status" role="status">{{ status }}</p>
  </section>
</template>

<style>
.sc-build {
  color-scheme: dark;
  --vw-surface: #131a22; --vw-surface-muted: #18212b; --vw-surface-hover: #1d2834;
  --vw-text: #e6edf3; --vw-muted: #8b9aab; --vw-border: #263343; --vw-grid: #1c2632; --vw-edge: #4b5d72;
  --vw-accent: #5fb4ff; --vw-on-solid: #fff; --vw-now: #ff7a59; --vw-marker: #f2c14e; --vw-marker-ink: #1a1405;
  --vw-non-working: rgb(255 255 255 / 4%); --vw-status: #3fd0c9; --vw-baseline: #64748b; --vw-float: #6f8296;
  --vw-critical: #ff7a3d; --vw-dependency-highlight: #ff8a4c; --vw-deadline: #f2c14e; --vw-constraint: #c58cff;
  --vw-load: #3d7fc4; --vw-load-overload: #ff4d5e; --vw-load-capacity: #b7c4d3;
  --vw-blue-solid: #3c6e9f; --vw-blue-pale: #1d3147; --vw-blue-ink: #d6e6f7; --vw-blue-line: #5a8cc0;
  --vw-amber-solid: #e8642c; --vw-amber-pale: #3a2216; --vw-amber-ink: #ffe3d4; --vw-amber-line: #ff8a4c;
  --vw-teal-solid: #2b6a5e; --vw-teal-pale: #163029; --vw-teal-ink: #cdeee6; --vw-teal-line: #3f8f80;
  padding: 26px 26px 18px;
  border: 1px solid #1f2a36;
  border-radius: 14px;
  background: radial-gradient(1200px 300px at 0 0, #17283a 0, transparent 60%), #0e141b;
  color: var(--vw-text);
  box-shadow: 0 10px 30px -12px rgb(0 0 0 / 55%);
  font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
}
.sc-build h2 { margin: 0 0 6px; color: #fff; font-size: 22px; font-weight: 700; letter-spacing: -.01em; }
.sc-build h3 { margin: 0; color: #dfe7ef; font-size: 13px; font-weight: 650; letter-spacing: .01em; }
.sc-build-head { display: flex; flex-wrap: wrap; gap: 16px 24px; align-items: flex-end; justify-content: space-between; margin-bottom: 18px; }
.sc-build-eyebrow { margin: 0 0 4px; color: #f2c14e; font-size: 11px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; }
.sc-build-intro { max-width: 720px; margin: 0; color: var(--vw-muted); font-size: 13px; line-height: 1.55; }
.sc-build-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
.sc-build button { height: 32px; padding: 0 14px; border: 1px solid #2d3c4e; border-radius: 8px; background: #17212c; color: #dbe5ef; font: inherit; font-size: 12.5px; font-weight: 600; cursor: pointer; }
.sc-build button:hover:not(:disabled) { border-color: #41566e; background: #1d2a38; }
.sc-build button:focus-visible, .sc-build input:focus-visible + span { outline: 2px solid var(--vw-accent); outline-offset: 2px; }
.sc-build button:disabled { opacity: .55; cursor: default; }
.sc-build .sc-build-primary { border-color: #2f7fd0; background: linear-gradient(#3a8ee0, #2b72bd); color: #fff; }
.sc-build .sc-build-primary:hover:not(:disabled) { border-color: #5aa6f0; background: linear-gradient(#4a9cec, #327dcb); }
.sc-build-switch { position: relative; display: inline-flex; align-items: center; gap: 9px; padding: 0 12px; height: 32px; border: 1px solid #3b2e1c; border-radius: 8px; background: #1d1810; color: #f6d9a8; font-size: 12.5px; font-weight: 600; cursor: pointer; }
.sc-build-switch input { position: absolute; inset: 0; z-index: 1; width: 100%; height: 100%; margin: 0; opacity: 0; cursor: pointer; }
.sc-build-switch span { position: relative; width: 28px; height: 16px; border-radius: 8px; background: #4a3d29; transition: background .2s; }
.sc-build-switch span::after { content: ''; position: absolute; top: 2px; left: 2px; width: 12px; height: 12px; border-radius: 50%; background: #f6d9a8; transition: transform .2s; }
.sc-build-switch input:checked + span { background: #e8642c; }
.sc-build-switch input:checked + span::after { transform: translateX(12px); background: #fff; }

/* KPI tiles */
.sc-build-kpis { display: grid; grid-template-columns: 1.35fr repeat(5, minmax(0, 1fr)); gap: 10px; margin-bottom: 16px; }
.sc-build-kpi { display: flex; flex-direction: column; gap: 3px; min-width: 0; padding: 12px 14px; border: 1px solid #222e3b; border-radius: 10px; background: linear-gradient(#151e28, #121922); }
.sc-build-kpi-label { color: #8b9aab; font-size: 10.5px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
.sc-build-kpi strong { color: #f3f7fb; font-size: 22px; font-weight: 700; font-variant-numeric: tabular-nums; letter-spacing: -.01em; }
.sc-build-kpi small { overflow: hidden; color: #7f8fa1; font-size: 11.5px; text-overflow: ellipsis; white-space: nowrap; }
.sc-build-kpi-hero { border-color: #26405a; background: linear-gradient(135deg, #17314a, #121b25 70%); }
.sc-build-kpi-hero strong { font-size: 26px; }
.sc-build-kpi-hero.sc-build-late { border-color: #6a2630; background: linear-gradient(135deg, #3a1820, #121b25 70%); }
.sc-build-kpi .sc-build-neg { color: #ff8a6b; }
.sc-build-badges { display: flex; flex-wrap: wrap; gap: 6px; }
.sc-build-badge { display: inline-block; padding: 2px 7px; border-radius: 999px; font-size: 11px; font-weight: 700; font-variant-numeric: tabular-nums; white-space: nowrap; }
.sc-build-badge-ok { background: rgb(63 208 160 / 14%); color: #6fe0b8; }
.sc-build-badge-warn { background: rgb(242 193 78 / 15%); color: #f5cf6e; }
.sc-build-badge-bad { background: rgb(255 77 94 / 18%); color: #ff8f99; animation: sc-build-pop .5s ease-out; }
.sc-build-meter { position: relative; height: 6px; margin: 6px 0 2px; border-radius: 3px; background: #223040; }
.sc-build-meter span { position: absolute; inset: 0 auto 0 0; border-radius: 3px; background: linear-gradient(90deg, #2bb3a3, #3fd0c9); }
.sc-build-meter i { position: absolute; top: -3px; width: 2px; height: 12px; border-radius: 1px; background: #e6edf3; }
@keyframes sc-build-pop { from { transform: scale(.7); opacity: 0; } to { transform: none; opacity: 1; } }

/* Chart frame and header */
.sc-build .vw-gantt { --vw-row-label-width: 236px; font-size: 12px; }
.sc-build .vw-gantt-toolbar { min-height: 0; padding: 0 0 10px; }
.sc-build .vw-gantt-zoom { border-color: #2b394a; border-radius: 7px; background: #141c25; }
.sc-build .vw-gantt-zoom button { height: 26px; min-width: 26px; padding: 0; border: 0; border-radius: 0; background: transparent; }
.sc-build .vw-gantt-scroll { border: 1px solid #222e3b; border-radius: 10px; background: #111820; scrollbar-color: #2e3d4f transparent; }
.sc-build .vw-gantt-head, .sc-build .vw-gantt-corner { background: #141c25; }
.sc-build .vw-gantt-corner { color: #8b9aab; font-size: 11px; font-weight: 650; }
.sc-build .vw-gantt-band { border-color: #212c39; color: #b9c6d4; font-size: 11px; font-weight: 650; }
.sc-build .vw-gantt-tick { top: 13px; }
.sc-build-tick { color: #6f8195; font-size: 10.5px; font-weight: 600; }
.sc-build .vw-gantt-grid-line { background: #18212b; }
.sc-build .vw-gantt-row { border-bottom: 1px solid #17202a; }
.sc-build .vw-gantt-row:has(.sc-build-row-phase) { background: rgb(255 255 255 / 1.8%); }
.sc-build .vw-gantt-row-label { background: #121921; border-right: 1px solid #222e3b; }
.sc-build .vw-gantt-row-label:has(.sc-build-row-phase) { background: #151e28; }
.sc-build .vw-column-group > .vw-tree-row { padding-left: calc(4px + var(--vw-row-depth) * 14px); }
.sc-build .vw-row-toggle { color: #8b9aab; }
.sc-build .vw-extra-column { justify-content: flex-end; padding: 0 9px 0 4px; border-left: 1px solid #1a242f; }
.sc-build-row { display: flex; align-items: center; gap: 7px; min-width: 0; }
.sc-build-wbs { flex: none; min-width: 24px; color: #5f7186; font-size: 10.5px; font-variant-numeric: tabular-nums; }
.sc-build-name { overflow: hidden; color: #c9d4df; text-overflow: ellipsis; white-space: nowrap; }
.sc-build-row-phase .sc-build-name { color: #fff; font-weight: 650; }
.sc-build-row-phase .sc-build-wbs { color: #f2c14e; font-weight: 700; }
.sc-build-diamond { flex: none; width: 7px; height: 7px; background: #f2c14e; transform: rotate(45deg); }
.sc-build-cell { color: #9fb0c2; font-size: 11.5px; font-variant-numeric: tabular-nums; white-space: nowrap; }
.sc-build-cell-phase { color: #e6edf3; font-weight: 650; }
.sc-build-cell-zero { color: #ff8a4c; font-weight: 700; }
.sc-build-cell-late { color: #f5cf6e; }
.sc-build-cell-done { color: #4fa893; }
.sc-build-legend { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 16px; margin: 0; padding: 4px 0 0; list-style: none; color: #9fb0c2; font-size: 11.5px; }
.sc-build-legend li, .sc-build-legend label { display: inline-flex; align-items: center; gap: 6px; }
.sc-build-key { width: 16px; height: 8px; border-radius: 2px; }
.sc-build-key-critical { background: var(--vw-amber-solid); box-shadow: 0 0 0 1px var(--vw-critical); }
.sc-build-key-normal { background: var(--vw-blue-solid); }
.sc-build-key-done { background: var(--vw-teal-solid); }
.sc-build-key-baseline { height: 3px; background: var(--vw-baseline); }
.sc-build-key-status { width: 2px; height: 12px; background: var(--vw-status); }
.sc-build-key-over { background: var(--vw-load-overload); }

/* Bars, baselines, links and markers */
.sc-build .vw-gantt-bar { border-radius: 3px; box-shadow: 0 1px 2px rgb(0 0 0 / 40%); }
.sc-build .vw-gantt-bar.vw-critical { box-shadow: 0 0 0 1px var(--vw-critical), 0 0 10px -2px rgb(255 122 61 / 55%); }
.sc-build .vw-gantt-bar.vw-is-selected { box-shadow: 0 0 0 2px #0e141b, 0 0 0 4px var(--vw-accent); }
.sc-build .vw-bar-progress { background: rgb(255 255 255 / 22%); }
.sc-build .vw-gantt-baseline { opacity: .9; }
.sc-build .vw-gantt-summary { height: 6px; top: calc(50% - 3px); border: 0; border-radius: 1px; background: #8094aa; overflow: visible; }
.sc-build .vw-gantt-summary span { background: #3fd0c9; opacity: 1; }
.sc-build .vw-gantt-summary::before, .sc-build .vw-gantt-summary::after { content: ''; position: absolute; top: 100%; border-top: 5px solid #8094aa; }
.sc-build .vw-gantt-summary::before { left: 0; border-right: 5px solid transparent; }
.sc-build .vw-gantt-summary::after { right: 0; border-left: 5px solid transparent; }
.sc-build .vw-gantt-links path { stroke: #3d4e62; stroke-width: 1.1px; }
.sc-build .vw-gantt-links path.vw-is-highlighted, .sc-build .vw-gantt-links .vw-is-highlighted path { stroke: var(--vw-dependency-highlight); stroke-width: 1.5px; }
.sc-build .vw-gantt-bar.vw-is-milestone.vw-has-slot { overflow: visible; }
.sc-build .vw-gantt-bar.vw-is-milestone.vw-has-slot::before { background: #f2c14e; }
.sc-build .vw-gantt-bar.vw-is-milestone.vw-critical.vw-has-slot::before { background: var(--vw-critical); }
.sc-build-milestone { position: absolute; left: calc(100% + 6px); top: 50%; translate: 0 -50%; color: #f3d48a; font-size: 11px; font-weight: 650; white-space: nowrap; pointer-events: none; }
.sc-build-milestone-end { right: calc(100% + 6px); left: auto; }
.sc-build .vw-gantt-status-date span, .sc-build .vw-gantt-marker span { border-radius: 0 0 4px 4px; font-size: 10px; font-weight: 700; }
.sc-build .vw-gantt-status-date span { background: var(--vw-status); color: #052523; }
.sc-build .vw-gantt-progress-line { stroke: var(--vw-status); }
.sc-build .vw-gantt-non-working { background: repeating-linear-gradient(135deg, rgb(255 255 255 / 5%) 0 2px, transparent 2px 5px); }

/* Crew load rows */
.sc-build .vw-gantt-load-row { background: #101820; border-color: #1c2632; }
.sc-build .vw-gantt-load-segment { border-right-color: #101820; }
.sc-build .vw-load-fill { border-radius: 2px 2px 0 0; background: linear-gradient(#4b8fd6, #2f6aa8); }
.sc-build .vw-load-capacity { border-top-width: 1px; opacity: .7; }
.sc-build .vw-gantt-load-segment.vw-is-idle .vw-load-capacity { opacity: .25; }
.sc-build .vw-gantt-load-segment.vw-is-overloaded .vw-load-over { box-shadow: 0 0 8px rgb(255 77 94 / 60%); }
.sc-build-crew { display: flex; flex-direction: column; line-height: 1.2; }
.sc-build-crew span { color: #c9d4df; font-weight: 600; }
.sc-build-crew small { color: #6f8195; font-size: 10.5px; }

/* Leveling and what-if transitions */
.sc-build-animating .vw-gantt-bar, .sc-build-animating .vw-gantt-float, .sc-build-animating .vw-gantt-summary {
  transition: left .75s cubic-bezier(.2, .8, .2, 1), width .75s cubic-bezier(.2, .8, .2, 1);
}
.sc-build-animating .vw-gantt-load-segment { animation: sc-build-rise .75s cubic-bezier(.2, .8, .2, 1); transform-origin: bottom; }
@keyframes sc-build-rise { from { opacity: .2; transform: scaleY(.3); } to { opacity: 1; transform: none; } }

/* Panels */
.sc-build-panels { display: grid; grid-template-columns: minmax(0, 1.55fr) minmax(0, 1fr); gap: 12px; margin-top: 14px; }
.sc-build-panel { margin: 0; padding: 14px 16px; border: 1px solid #222e3b; border-radius: 10px; background: #121922; }
.sc-build-curve figcaption { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 6px 14px; margin-bottom: 6px; }
.sc-build-curve svg { display: block; width: 100%; height: auto; }
.sc-build-grid line { stroke: #1e2833; }
.sc-build-grid text, .sc-build-curve-tag { fill: #6f8195; font-size: 10px; font-variant-numeric: tabular-nums; }
.sc-build-curve-tag { fill: #3fd0c9; font-weight: 700; }
.sc-build-curve-status { stroke: #3fd0c9; stroke-dasharray: 3 3; }
.sc-build-path { fill: none; stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round; transition: d .6s ease; }
.sc-build-pv { stroke: #7aa7d9; }
.sc-build-ev { stroke: #3fd0c9; fill: #3fd0c9; }
.sc-build-ac { stroke: #ff8a4c; fill: #ff8a4c; }
.sc-build-path.sc-build-ev, .sc-build-path.sc-build-ac { fill: none; }
.sc-build-fc { stroke: #ff8a4c; stroke-dasharray: 4 4; stroke-width: 1.6; opacity: .8; }
.sc-build-fc-ev { stroke: #3fd0c9; }
.sc-build-dot { stroke: #121922; stroke-width: 2; }
.sc-build-line { width: 18px; border-top: 2px solid; }
.sc-build-line.sc-build-fc { border-top-style: dashed; border-color: #ff8a4c; }
.sc-build-line.sc-build-pv { border-color: #7aa7d9; }
.sc-build-line.sc-build-ev { border-color: #3fd0c9; }
.sc-build-line.sc-build-ac { border-color: #ff8a4c; }
.sc-build-milestones { display: flex; flex-direction: column; gap: 10px; }
.sc-build-milestones table { width: 100%; border-collapse: collapse; font-size: 12px; font-variant-numeric: tabular-nums; }
.sc-build-milestones th, .sc-build-milestones td { padding: 8px 6px; border-bottom: 1px solid #1c2632; text-align: left; white-space: nowrap; }
.sc-build-milestones thead th { color: #6f8195; font-size: 10.5px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; }
.sc-build-milestones tbody th { color: #dfe7ef; font-weight: 600; white-space: normal; }
.sc-build-milestones td { color: #9fb0c2; }
.sc-build-milestones td:last-child, .sc-build-milestones th:last-child { text-align: right; }
.sc-build-ahead { display: grid; gap: 6px; margin: 0; padding: 0; list-style: none; counter-reset: ahead; }
.sc-build-ahead li { display: flex; align-items: center; gap: 8px; font-size: 12px; counter-increment: ahead; }
.sc-build-ahead li::before { content: counter(ahead); display: grid; place-items: center; flex: none; width: 18px; height: 18px; border-radius: 50%; background: rgb(255 122 61 / 16%); color: #ff9a66; font-size: 10.5px; font-weight: 700; }
.sc-build-ahead span { overflow: hidden; color: #dfe7ef; text-overflow: ellipsis; white-space: nowrap; }
.sc-build-ahead small { margin-left: auto; color: #8b9aab; font-variant-numeric: tabular-nums; white-space: nowrap; }
.sc-build-exports { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: auto; padding-top: 6px; }
.sc-build-exports > span { margin-right: 4px; color: #6f8195; font-size: 10.5px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
.sc-build-exports button { height: 28px; padding: 0 11px; font-size: 12px; }
.sc-build-status { min-height: 18px; margin: 12px 2px 0; color: #9fb0c2; font-size: 12.5px; }

@media (max-width: 1100px) {
  .sc-build-kpis { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .sc-build-panels { grid-template-columns: minmax(0, 1fr); }
}
@media (max-width: 700px) {
  .sc-build { padding: 18px 12px 14px; }
  .sc-build-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .sc-build .vw-gantt { --vw-row-label-width: 170px; }
  .sc-build-milestones th, .sc-build-milestones td { padding: 8px 4px; }
}
@media (prefers-reduced-motion: reduce) {
  .sc-build-animating .vw-gantt-bar, .sc-build-animating .vw-gantt-float, .sc-build-animating .vw-gantt-summary { transition: none; }
  .sc-build-animating .vw-gantt-load-segment, .sc-build-badge-bad { animation: none; }
}
</style>
