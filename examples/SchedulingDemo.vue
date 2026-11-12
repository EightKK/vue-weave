<script setup lang="ts">
import { computed, ref, shallowRef } from 'vue'
import {
  GanttChart, buildWorkPeriods, calculateResourceLoad, scheduleTasks,
  type ResourceAssignment, type ScheduleLink, type ScheduleResult, type ScheduleTask,
  type TimelineBar, type TimelineColumn, type TimelineEdit,
} from '../src'

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
const originalTasks: ScheduleTask[] = [
  { id: 'cut-a', duration: 3 * hour },
  { id: 'cut-b', duration: 2 * hour, startNoEarlierThan: range.start + 2 * hour },
  { id: 'inspect', duration: 2 * hour },
  { id: 'pack', duration: 2 * hour },
]
const dependencies: ScheduleLink[] = [
  { id: 'cut-inspect', from: 'cut-a', to: 'inspect', type: 'FS' },
  { id: 'inspect-pack', from: 'inspect', to: 'pack', type: 'FS' },
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

function propose(tasks: readonly ScheduleTask[]): ScheduleResult {
  return scheduleTasks({ range, calendars, defaultCalendarId: 'plant', quantum: 60_000, tasks, dependencies })
}
const original = propose(originalTasks)
if (!original.ok) throw new Error('The demo schedule must be feasible')
const model = shallowRef({ tasks: originalTasks, plan: original })
const notice = ref('Move either cutting order to recalculate the plan. Amber tasks have zero float. Amber links show controlling dependencies.')
const selected = ref(new Set<string>())
const originalDates = new Map(original.tasks.map(task => [task.id, { start: task.start, end: task.end }]))
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
const taskBars = computed<TimelineBar[]>(() => model.value.plan.tasks.map(task => ({
  id: task.id, rowId: task.id, label: labels.get(task.id)!,
  start: task.start, end: task.end, baseline: originalDates.get(task.id),
  editable: task.id.startsWith('cut-'), tone: task.critical ? 'amber' : 'blue',
})))
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
function reset() {
  model.value = { tasks: originalTasks, plan: original as Extract<ScheduleResult, { ok: true }> }
  selected.value = new Set()
  notice.value = 'Original plan restored.'
}
</script>

<template>
  <section class="planning-panel" aria-labelledby="schedule-title">
    <div class="section-head">
      <div><h2 id="schedule-title">Calendar-aware schedule</h2><p>JST · split shifts · 10 November plant closure</p></div>
      <button type="button" @click="reset">Reset schedule</button>
    </div>
    <dl class="schedule-metrics">
      <div><dt>Projected finish</dt><dd data-testid="schedule-finish">{{ format(model.plan.finish) }}</dd></div>
      <div><dt>Zero-float tasks</dt><dd>{{ criticalCount }} / {{ rows.length }}</dd></div>
      <div><dt>Resource overload</dt><dd data-testid="schedule-overload">{{ overloadHours }} resource-hour{{ overloadHours === 1 ? '' : 's' }}</dd></div>
    </dl>
    <GanttChart :rows="rows" :bars="taskBars" :range="range" :dependencies="dependencies" :highlighted-dependency-ids="criticalLinks"
      :columns="columns" :header-bands="headerBands" :row-height="58" :height="325" :pixels-per-unit="18 / hour"
      :tick-steps="[4 * hour, 6 * hour, 12 * hour]" :snap="hour" :format-time="format" :selected-ids="selected"
      :validate-edit="validateEdit" @select="selected = new Set([$event])" @edit="applyEdit" @edit-rejected="(_change, reason) => notice = reason">
      <template #row-heading>Operation</template>
      <template #bar="{ bar }"><span class="vft-bar-text">{{ workHours.get(bar.id) }} h</span></template>
      <template #legend><span class="hint">Drag a cutting order or use its arrow keys. Bar labels show work hours. Grey lines show the original plan.</span></template>
    </GanttChart>
    <p class="status" role="status">{{ notice }}</p>
  </section>
  <section class="planning-panel" aria-labelledby="load-title">
    <div class="section-head"><div><h2 id="load-title">Resource demand and capacity</h2><p>Demand uses work segments. Breaks and closed dates consume zero work.</p></div></div>
    <GanttChart :rows="resources" :bars="loadBars" :range="range" :columns="resourceColumns" :header-bands="[headerBands[0]!]"
      :row-height="48" :height="213" :pixels-per-unit="18 / hour" :tick-steps="[4 * hour, 6 * hour, 12 * hour]"
      :format-time="format" readonly :show-controls="false">
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
