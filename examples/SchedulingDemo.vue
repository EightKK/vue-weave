<script setup lang="ts">
import { computed, ref, shallowRef } from 'vue'
import {
  GanttChart, NetworkGraph, buildWorkPeriods, calculateResourceLoad, invertWorkPeriods, propagateEdit, rescheduleFromStatusDate, scheduleTasks,
  scheduleToGraph, scheduledBarFields, timelineConstraints, timelineCsvTable, toCsv, toICalendar, toMsProjectXml,
  type ResourceAssignment, type ScheduleConstraintName, type ScheduleInput, type ScheduleLink, type ScheduleResult, type ScheduleTask,
  type TimelineBar, type TimelineColumn, type TimelineConstraintEdit, type TimelineEdit,
} from '../src'
import { download } from './download'

const hour = 3_600_000
const local = (value: string) => Date.parse(value + '+09:00')
const range = { start: local('2026-11-09T08:00:00'), end: local('2026-11-11T17:00:00') }
const shifts = buildWorkPeriods(range, {
  utcOffsetMinutes: 540,
  weekly: [1, 2, 3, 4, 5].flatMap(weekday => [
    { weekday, startMinute: 8 * 60, endMinute: 12 * 60 },
    { weekday, startMinute: 13 * 60, endMinute: 17 * 60 },
  ]),
  exceptions: { '2026-11-10': [] },
})
const calendars = [{ id: 'plant', periods: shifts }]
// Breaks, nights and the closed date, shaded behind both charts.
const nonWorking = invertWorkPeriods(shifts, range)
// A display-only due date: packing must finish before the dispatch cut-off or the bar is marked late.
const deadlines = new Map([['pack', local('2026-11-09T17:00:00')]])
const shade = ref(true)
const showCritical = ref(true)
const originalTasks: ScheduleTask[] = [
  { id: 'cut-a', duration: 3 * hour },
  { id: 'cut-b', duration: 2 * hour, startNoEarlierThan: range.start + 2 * hour },
  { id: 'inspect', duration: 2 * hour },
  { id: 'pack', duration: 2 * hour },
]
// The chart draws these links and the scheduler uses them unchanged, lag included: a ScheduleLink is a
// TimelineDependency with a lag. Packing may overlap the last two hours of cutting order B (a lead, drawn as "−2 h").
const dependencies: ScheduleLink[] = [
  { id: 'cut-inspect', from: 'cut-a', to: 'inspect', type: 'FS' },
  { id: 'inspect-pack', from: 'inspect', to: 'pack', type: 'FS' },
  { id: 'cut-b-pack', from: 'cut-b', to: 'pack', type: 'FS', lag: -2 * hour },
]
const resources = [
  { id: 'cnc', label: 'CNC cell', capacity: 1, periods: shifts },
  { id: 'quality', label: 'Inspection station', capacity: 1, periods: shifts },
  { id: 'dispatch', label: 'Packing station', capacity: 1, periods: shifts },
]
const assignments: ResourceAssignment[] = [
  { resourceId: 'cnc', taskId: 'cut-a' }, { resourceId: 'cnc', taskId: 'cut-b' },
  { resourceId: 'quality', taskId: 'inspect' }, { resourceId: 'dispatch', taskId: 'pack' },
]
const rows = [
  { id: 'cut-a', label: 'Cut order A', detail: 'CNC cell · editable' },
  { id: 'cut-b', label: 'Cut order B', detail: 'CNC cell · editable' },
  { id: 'inspect', label: 'Inspect order A', detail: 'Inspection station' },
  { id: 'pack', label: 'Pack order A', detail: 'Packing station' },
]
const dates = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Tokyo', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
})
const format = (time: number) => dates.format(time).replace(',', '')
const labels = new Map(rows.map(row => [row.id, row.label]))
const headerBands = [
  [
    { start: range.start, end: local('2026-11-10T00:00:00'), label: 'Mon 9 Nov · operating day' },
    { start: local('2026-11-10T00:00:00'), end: local('2026-11-11T00:00:00'), label: 'Tue 10 Nov · plant closed' },
    { start: local('2026-11-11T00:00:00'), end: range.end, label: 'Wed 11 Nov · operating day' },
  ],
  shifts.map(period => ({ ...period, label: 'Shift' })),
]

function scheduleInput(tasks: readonly ScheduleTask[]): ScheduleInput {
  return { range, calendars, defaultCalendarId: 'plant', quantum: 60_000, tasks, dependencies }
}
function propose(tasks: readonly ScheduleTask[]): ScheduleResult {
  return scheduleTasks(scheduleInput(tasks))
}
const original = propose(originalTasks)
if (!original.ok) throw new Error('The demo schedule must be feasible')
const model = shallowRef({ tasks: originalTasks, plan: original })
const notice = ref('Move either cutting order to recalculate the plan. Amber tasks have zero float. Amber links show controlling dependencies.')
const selected = ref(new Set<string>())
const originalDates = new Map(original.tasks.map(task => [task.id, { start: task.start, end: task.end }]))
// A second saved baseline: the plan after a revision that held cutting order A back by one hour.
const revision = propose(originalTasks.map(task => task.id === 'cut-a' ? { ...task, startNoEarlierThan: range.start + hour } : task))
if (!revision.ok) throw new Error('The demo revision must be feasible')
const revisionDates = new Map(revision.tasks.map(task => [task.id, { start: task.start, end: task.end }]))
// Named baseline sets: off by default, so the chart shows the single original-plan baseline as before.
const compareBaselines = ref(false)
const baselineSets = [{ id: 'plan', label: 'Original plan' }, { id: 'rev1', label: 'Revision 1' }]
const shownSets = ref(new Set(baselineSets.map(set => set.id)))
const baselineIds = computed(() => compareBaselines.value ? baselineSets.filter(set => shownSets.value.has(set.id)).map(set => set.id) : undefined)
const baselineLabel = (id: string) => baselineSets.find(set => set.id === id)?.label ?? id
const slotColours = ['var(--vw-baseline, #718497)', 'var(--vw-baseline-2, #9a4c95)', 'var(--vw-baseline-3, #23806f)']
function swatch(id: string) {
  const slot = baselineIds.value?.indexOf(id) ?? -1
  return slot < 0 ? 'transparent' : slotColours[slot]
}
function toggleSet(id: string, shown: boolean) {
  const next = new Set(shownSets.value)
  if (shown) next.add(id)
  else next.delete(id)
  shownSets.value = next
}
const byTask = computed(() => new Map(model.value.plan.tasks.map(task => [task.id, task])))
const columns: TimelineColumn[] = [
  { id: 'finish', label: 'Finish (JST)', width: 106, value: row => format(byTask.value.get(row.id)!.end) },
  { id: 'float', label: 'Float', width: 58, value: row => (byTask.value.get(row.id)!.totalFloat / hour) + ' h' },
]
const resourceColumns: TimelineColumn[] = [
  { id: 'calendar', label: 'Calendar', width: 106, value: () => 'Plant shifts' },
  { id: 'capacity', label: 'Units', width: 58, value: row => resources.find(resource => resource.id === row.id)!.capacity },
]
const criticalLinks = computed(() => new Set(model.value.plan.criticalDependencyIds))
const workHours = new Map(originalTasks.map(task => [task.id, task.duration / hour]))
// scheduledBarFields supplies the dates, split work segments, critical flag and latest finish of each task.
// Reported progress at the status date: cutting order A is done, B is half done and inspection has started.
const reported = new Map([['cut-a', 1], ['cut-b', 0.5], ['inspect', 0.25]])
const statusDate = ref(local('2026-11-09T12:00:00'))
const showProgressLine = ref(true)
const taskBars = computed<TimelineBar[]>(() => model.value.plan.tasks.map(task => {
  const { critical, latestEnd, ...dates } = scheduledBarFields(task)
  return {
    id: task.id, rowId: task.id, label: labels.get(task.id)!, ...dates, progress: reported.get(task.id),
    ...(compareBaselines.value
      ? { baselines: [{ id: 'plan', ...originalDates.get(task.id)! }, { id: 'rev1', ...revisionDates.get(task.id)! }] }
      : { baseline: originalDates.get(task.id) }),
    editable: task.id.startsWith('cut-'), tone: task.critical ? 'amber' : 'blue',
    ...(showCritical.value ? { critical, latestEnd, deadline: deadlines.get(task.id) } : {}),
    ...(showConstraints.value ? { constraints: timelineConstraints(taskById.value.get(task.id)) } : {}),
  }
}))
// Scheduling constraints, off by default. Shown, packing must finish by the dispatch cut-off (a hard
// `finishNoLaterThan` that the scheduler applies, unlike the display-only deadline), and the requested starts of the
// cutting orders are `startNoEarlierThan` handles. Moving or deleting a handle reschedules the plan; a constraint that
// cannot be met is not applied, and the scheduler's diagnostic says why.
const showConstraints = ref(false)
const taskById = computed(() => new Map(model.value.tasks.map(task => [task.id, task])))
const constraintNames: Record<ScheduleConstraintName, string> = {
  range: 'the planning horizon', startNoEarlierThan: 'its start no earlier than', startNoLaterThan: 'its start no later than',
  finishNoEarlierThan: 'its finish no earlier than', finishNoLaterThan: 'its finish no later than', fixedStart: 'its fixed start',
  deadline: 'the project deadline', projectFinish: 'the project finish', calendar: 'its working time',
}
function withConstraint(task: ScheduleTask, kind: TimelineConstraintEdit['kind'], time: number | undefined): ScheduleTask {
  const { [kind]: _previous, ...rest } = task
  return time === undefined ? rest : { ...rest, [kind]: time }
}
function infeasibility(plan: Exclude<ScheduleResult, { ok: true }>) {
  if (plan.code === 'cycle') return 'A dependency cycle prevents scheduling.'
  const links = plan.dependencyIds.map(id => dependencies.find(link => link.id === id)!)
    .map(link => labels.get(link.from) + ' → ' + labels.get(link.to))
  return `Infeasible: ${labels.get(plan.taskId)} cannot meet ${plan.constraints.map(name => constraintNames[name]).join(' and ')}`
    + (links.length ? ' with the link ' + links.join(', ') : '') + '. The change was not applied.'
}
function toggleConstraints(event: Event) {
  const input = event.target as HTMLInputElement
  const tasks = model.value.tasks.map(task => task.id === 'pack' ? withConstraint(task, 'finishNoLaterThan', input.checked ? deadlines.get('pack') : undefined) : task)
  const plan = propose(tasks)
  if (!plan.ok) {
    notice.value = infeasibility(plan)
    input.checked = showConstraints.value
    return
  }
  model.value = { tasks, plan }
  showConstraints.value = input.checked
}
function applyConstraint(change: TimelineConstraintEdit) {
  const tasks = model.value.tasks.map(task => task.id === change.id ? withConstraint(task, change.kind, change.after) : task)
  const plan = propose(tasks)
  if (!plan.ok) {
    notice.value = infeasibility(plan)
    return
  }
  model.value = { tasks, plan }
  notice.value = change.after === undefined
    ? `Constraint removed from ${labels.get(change.id)}. Plan recalculated.`
    : `${labels.get(change.id)}: ${constraintNames[change.kind].replace('its ', '')} ${format(change.after)}. Plan recalculated.`
}
const load = computed(() => calculateResourceLoad(range, model.value.plan.tasks, resources, assignments))
const overloads = computed(() => load.value.filter(segment => segment.overload > 0))
const overloadHours = computed(() => overloads.value.reduce((hours, segment) => hours + (segment.end - segment.start) / hour, 0))
const loadBars = computed<TimelineBar[]>(() => load.value.filter(segment => segment.load > 0).map(segment => ({
  id: segment.resourceId + ':' + segment.start, rowId: segment.resourceId,
  start: segment.start, end: segment.end, label: segment.load + ' / ' + segment.capacity,
  tone: segment.overload ? 'amber' : 'teal',
})))
const criticalCount = computed(() => model.value.plan.tasks.filter(task => task.critical).length)

function validateEdit(change: TimelineEdit) {
  if (change.mode !== 'move') return 'Move the bar to change the requested start. Working duration is fixed in this example.'
}
/** A requested start inside a break or a closed day begins at the next working time, as the scheduler places it. */
function nextWorkingTime(time: number) {
  const period = shifts.find(item => item.end > time)
  return period ? Math.max(time, period.start) : time
}
// Auto-scheduling preview. While a cutting order is dragged (or moved with the arrow keys), propagateEdit pins it at
// the new start and reports every operation whose dates change; the chart draws those as dashed outlines and proposes
// them with the move as one batch. The order is first pinned where it is now, so the changes are measured against the
// plan on screen. An infeasible move previews nothing and is reported when the edit is applied.
function cascade(change: TimelineEdit): TimelineEdit[] {
  const current = byTask.value.get(change.id)
  if (change.mode !== 'move' || !current) return []
  const tasks = model.value.tasks.map(task => task.id === change.id ? { ...task, startNoEarlierThan: undefined, fixedStart: current.start } : task)
  const result = propagateEdit(scheduleInput(tasks), { id: change.id, start: nextWorkingTime(change.after.start) })
  if (!result.ok) return []
  return result.changes.filter(item => item.id !== change.id)
    .map(item => ({ id: item.id, before: item.before, after: item.after, mode: 'move', source: change.source }))
}
// The batch lists the moved order first. Recalculating from its new requested start reproduces the cascaded dates.
function applyEdits(changes: TimelineEdit[]) {
  applyEdit(changes[0]!)
}
function applyEdit(change: TimelineEdit) {
  const tasks = model.value.tasks.map(task => task.id === change.id ? { ...task, startNoEarlierThan: change.after.start } : task)
  const plan = propose(tasks)
  if (!plan.ok) {
    notice.value = plan.code === 'cycle' ? 'A dependency cycle prevents scheduling.' : 'The edit would exceed the available shifts for ' + labels.get(plan.taskId) + '.'
    return
  }
  const previous = byTask.value
  const affected = plan.tasks.filter(task => task.id !== change.id
    && (task.start !== previous.get(task.id)!.start || task.end !== previous.get(task.id)!.end)).length
  model.value = { tasks, plan }
  notice.value = 'Plan recalculated. ' + affected + ' other operation' + (affected === 1 ? '' : 's') + ' changed.'
}
const chart = ref<InstanceType<typeof GanttChart>>()
function exportSchedule() {
  const svg = chart.value?.exportSvg({ title: 'Calendar-aware schedule', rowHeading: 'Operation' })
  if (!svg) return
  download(svg, 'schedule.svg')
  notice.value = 'Exported schedule SVG (' + svg.length + ' characters).'
}
function reset() {
  // With constraints shown, packing keeps its cut-off; the original plan meets it, so the plan is the same.
  const tasks = showConstraints.value
    ? originalTasks.map(task => task.id === 'pack' ? withConstraint(task, 'finishNoLaterThan', deadlines.get('pack')) : task) : originalTasks
  const plan = showConstraints.value ? propose(tasks) : original
  if (!plan.ok) throw new Error('The demo schedule must be feasible')
  model.value = { tasks, plan }
  selected.value = new Set()
  notice.value = 'Original plan restored.'
}
// Done work stays where it is, partly done work is split at the status date and unstarted work moves after it. The
// next edit recalculates the plan from the requested starts again.
function rescheduleFromStatus() {
  let plan: ScheduleResult
  try {
    plan = rescheduleFromStatusDate(scheduleInput(model.value.tasks), statusDate.value, reported)
  } catch (error) {
    // Reported progress that cannot fit before the status date (for example at the start of the range) throws a
    // RangeError; the current plan stays as it is.
    if (!(error instanceof RangeError)) throw error
    notice.value = `The reported progress does not fit before status date ${format(statusDate.value)}. Choose a later status date.`
    return
  }
  if (!plan.ok) {
    notice.value = plan.code === 'cycle' ? 'A dependency cycle prevents scheduling.' : 'The status date leaves no room for ' + labels.get(plan.taskId) + '.'
    return
  }
  const previous = byTask.value
  const moved = plan.tasks.filter(task => task.start !== previous.get(task.id)!.start || task.end !== previous.get(task.id)!.end).length
  model.value = { tasks: model.value.tasks, plan }
  notice.value = `Rescheduled from status date ${format(statusDate.value)}. ${moved} operation${moved === 1 ? '' : 's'} moved.`
}
// Interchange exports of the current plan. The times are written in JST for Microsoft Project and in UTC for iCalendar.
function exportMsProject() {
  const xml = toMsProjectXml({
    name: 'Calendar-aware schedule',
    tasks: model.value.plan.tasks.map(task => ({
      id: task.id, name: labels.get(task.id)!, start: task.start, end: task.end, percentComplete: (reported.get(task.id) ?? 0) * 100,
      // Microsoft Project numbers baselines: the original plan is Baseline (0) and the revision Baseline1.
      baselines: [{ number: 0, ...originalDates.get(task.id)! }, { number: 1, ...revisionDates.get(task.id)! }],
      // A task with exactly one constraint gets its ConstraintType and ConstraintDate.
      ...(showConstraints.value ? { constraints: timelineConstraints(taskById.value.get(task.id)) } : {}),
    })),
    dependencies: dependencies.map(link => ({ from: link.from, to: link.to, type: link.type, lag: link.lag })),
  }, { utcOffsetMinutes: 540 })
  download(new Blob([xml], { type: 'application/xml' }), 'schedule.xml')
  notice.value = 'Exported Microsoft Project XML with ' + model.value.plan.tasks.length + ' tasks.'
}
function exportICalendar() {
  const text = toICalendar(model.value.plan.tasks.map(task => ({
    id: task.id + '@vue-weave.example', summary: labels.get(task.id)!, start: task.start, end: task.end,
    description: rows.find(row => row.id === task.id)!.detail,
  })), { calendarName: 'Calendar-aware schedule' })
  download(new Blob([text], { type: 'text/calendar' }), 'schedule.ics')
  notice.value = 'Exported iCalendar with ' + model.value.plan.tasks.length + ' events.'
}
function exportCsv() {
  const text = toCsv(timelineCsvTable(rows, taskBars.value, { formatTime: format, headers: { row: 'Operation', bar: 'Task' } }))
  download(new Blob([text], { type: 'text/csv' }), 'schedule.csv')
  notice.value = 'Exported CSV with ' + taskBars.value.length + ' tasks.'
}
// The network diagram shows the same plan as a PERT chart; critical tasks and the links between them are highlighted.
const showNetwork = ref(false)
const network = computed(() => scheduleToGraph(model.value.plan, dependencies, { label: id => labels.get(id)!, formatTime: format }))
</script>

<template>
  <section class="planning-panel" aria-labelledby="schedule-title">
    <div class="section-head">
      <div><h2 id="schedule-title">Calendar-aware schedule</h2><p>JST · split shifts · 10 November plant closure</p></div>
      <div class="options">
        <label><input v-model="shade" type="checkbox"> Shade non-working time</label>
        <label><input v-model="showCritical" type="checkbox"> Show critical path and float</label>
        <label><input v-model="showNetwork" type="checkbox"> Network diagram</label>
        <label><input v-model="compareBaselines" type="checkbox"> Compare baseline sets</label>
        <label><input type="checkbox" :checked="showConstraints" @change="toggleConstraints"> Show scheduling constraints</label>
        <button type="button" @click="exportSchedule">Export schedule SVG</button>
        <button type="button" @click="reset">Reset schedule</button>
      </div>
    </div>
    <div class="options status-options" role="group" aria-label="Status date and exports">
      <label>Status date <input v-model.number="statusDate" type="range" :min="range.start" :max="range.end" :step="hour"
        :aria-valuetext="format(statusDate)"></label>
      <output aria-label="Status date value">{{ format(statusDate) }}</output>
      <label><input v-model="showProgressLine" type="checkbox"> Show progress line</label>
      <button type="button" @click="rescheduleFromStatus">Reschedule from status date</button>
      <button type="button" @click="exportMsProject">Export MS Project XML</button>
      <button type="button" @click="exportICalendar">Export iCalendar</button>
      <button type="button" @click="exportCsv">Export CSV</button>
    </div>
    <div v-if="compareBaselines" class="options status-options" role="group" aria-label="Baseline sets">
      <label v-for="set in baselineSets" :key="set.id" class="baseline-key" :style="{ '--baseline-key': swatch(set.id) }">
        <input type="checkbox" :checked="shownSets.has(set.id)" @change="toggleSet(set.id, ($event.target as HTMLInputElement).checked)">
        {{ set.label }}</label>
      <span class="hint">Strips under each bar, in this order. Hover a strip, or read a bar's description, for its variance.</span>
    </div>
    <p v-if="showConstraints" class="hint constraint-hint">Packing must finish by the 17:00 cut-off. Drag a cutting order's
      start constraint, or focus it and use the arrow keys or Delete; the plan is rescheduled, and a constraint that cannot be met is reported.</p>
    <dl class="schedule-metrics">
      <div><dt>Projected finish</dt><dd data-testid="schedule-finish">{{ format(model.plan.finish) }}</dd></div>
      <div><dt>Zero-float tasks</dt><dd>{{ criticalCount }} / {{ rows.length }}</dd></div>
      <div><dt>Resource overload</dt><dd data-testid="schedule-overload">{{ overloadHours }} resource-hour{{ overloadHours === 1 ? '' : 's' }}</dd></div>
    </dl>
    <GanttChart ref="chart" :rows="rows" :bars="taskBars" :range="range" :dependencies="dependencies" :highlighted-dependency-ids="criticalLinks"
      :columns="columns" :header-bands="headerBands" :row-height="58" :height="325" :pixels-per-unit="18 / hour"
      :tick-steps="[4 * hour, 6 * hour, 12 * hour]" :snap="hour" :format-time="format" :selected-ids="selected"
      :non-working-periods="shade ? nonWorking : undefined" :validate-edit="validateEdit" :cascade="cascade" @select="selected = new Set([$event])"
      :status-date="statusDate" :show-progress-line="showProgressLine" :baseline-ids="baselineIds" :baseline-label="baselineLabel"
      :constraints-editable="showConstraints" @constraint-edit="applyConstraint"
      @edit="applyEdit" @edits="applyEdits" @edit-rejected="(_change, reason) => notice = reason" @edits-rejected="(_changes, reason) => notice = reason">
      <template #row-heading>Operation</template>
      <template #bar="{ bar }"><span class="vw-bar-text">{{ workHours.get(bar.id) }} h</span></template>
      <template #legend><span class="hint">Drag a cutting order or use its arrow keys; dashed outlines preview the operations that move with it. Link labels show lag; −2 h is a lead. Bar labels show work hours. Grey lines show the original plan. Split bars show work around breaks; red outlines mark the critical path, thin lines show float and the flag marks the dispatch cut-off.</span></template>
    </GanttChart>
    <p class="status" role="status">{{ notice }}</p>
    <NetworkGraph v-if="showNetwork" :nodes="network.nodes" :edges="network.edges" :related-ids="network.criticalNodeIds"
      :options="{ nodeWidth: 300, nodeHeight: 58 }" :height="300" :labels="{ region: 'Schedule network diagram' }" />
  </section>
  <section class="planning-panel" aria-labelledby="load-title">
    <div class="section-head"><div><h2 id="load-title">Resource demand and capacity</h2><p>Demand uses work segments. Breaks and closed dates consume zero work.</p></div></div>
    <GanttChart :rows="resources" :bars="loadBars" :range="range" :columns="resourceColumns" :header-bands="[headerBands[0]!]"
      :row-height="48" :height="213" :pixels-per-unit="18 / hour" :tick-steps="[4 * hour, 6 * hour, 12 * hour]"
      :format-time="format" :non-working-periods="shade ? nonWorking : undefined" readonly :show-controls="false">
      <template #row-heading>Equipment</template>
      <template #legend><span class="hint">Demand / available units · Amber indicates overload</span></template>
    </GanttChart>
    <table v-if="overloads.length" class="load-table">
      <caption>Overload intervals</caption>
      <thead><tr><th scope="col">Equipment</th><th scope="col">From</th><th scope="col">To</th><th scope="col">Demand / capacity</th><th scope="col">Operations</th></tr></thead>
      <tbody><tr v-for="segment in overloads" :key="segment.resourceId + ':' + segment.start">
        <td>{{ resources.find(resource => resource.id === segment.resourceId)?.label }}</td>
        <td>{{ format(segment.start) }}</td><td>{{ format(segment.end) }}</td>
        <td>{{ segment.load }} / {{ segment.capacity }}</td>
        <td>{{ segment.taskIds.map(id => labels.get(id)).join(', ') }}</td>
      </tr></tbody>
    </table>
    <p v-else class="status">No capacity conflicts in the current plan.</p>
  </section>
</template>

<style scoped>
.status-options { flex-wrap: wrap; gap: 8px; margin-bottom: 8px; }
.status-options input[type="range"] { vertical-align: middle; width: 180px; }
/* Legend swatches in the colour of the slot each shown set is drawn in. */
.constraint-hint { margin: 0 0 8px; }
.baseline-key::after { content: ''; display: inline-block; width: 18px; height: 3px; border-radius: 1.5px; background: var(--baseline-key); }
</style>
