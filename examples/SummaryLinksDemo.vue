<script setup lang="ts">
import { computed, ref, shallowRef } from 'vue'
import {
  GanttChart, scheduleTasks, scheduledBarFields, type ScheduleLink, type ScheduleResult, type ScheduleTask, type TimelineBar,
  type TimelineConnection, type TimelineEdit, type TimelineReconnect, type TimelineRow,
} from '../src'
import { formatTime, hour, origin } from './data'
import { download } from './download'

// Opt-in example of GanttChart `summaryDependencies`: links into and out of a summary task are drawn to the edges of its
// rollup bar. The plan uses `ScheduleTask.parentId`, so the scheduler and the chart read the same links unchanged.
const range = { start: origin, end: origin + 12 * hour }
const rows: TimelineRow[] = [
  { id: 'design', label: 'Design review' },
  { id: 'build', label: 'Build phase' },
  { id: 'frame', label: 'Frame', parentId: 'build' },
  { id: 'wiring', label: 'Wiring', parentId: 'build' },
  { id: 'inspect', label: 'Final inspection' },
]
const labels = new Map(rows.map(row => [row.id, row.label]))
const summaryIds = new Set(rows.flatMap(row => row.parentId === undefined ? [] : [row.parentId]))
const initialTasks: ScheduleTask[] = [
  { id: 'design', duration: 2 * hour },
  { id: 'build', duration: 0 },
  { id: 'frame', duration: 3 * hour, parentId: 'build' },
  { id: 'wiring', duration: hour, parentId: 'build' },
  { id: 'inspect', duration: hour },
]
const initialLinks: ScheduleLink[] = [
  { id: 'design-build', from: 'design', to: 'build', type: 'FS' },
  { id: 'build-inspect', from: 'build', to: 'inspect', type: 'FS' },
]

/** Schedule a proposal; an Error (such as an FF link into a summary) or a failed result is returned as a reason. */
function plan(tasks: readonly ScheduleTask[], links: readonly ScheduleLink[]): ScheduleResult | string {
  try {
    const result = scheduleTasks({ range, quantum: 15 * 60_000, tasks, dependencies: links })
    return result.ok ? result : result.code === 'cycle' ? 'This link would create a cycle.' : 'The plan no longer fits the horizon.'
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
}
type Model = { tasks: readonly ScheduleTask[]; links: readonly ScheduleLink[]; plan: ScheduleResult & { ok: true } }
const model = shallowRef<Model>({ tasks: initialTasks, links: initialLinks, plan: plan(initialTasks, initialLinks) as Model['plan'] })
const selectedDependency = ref<string>()
const chart = ref<InstanceType<typeof GanttChart>>()
const notice = ref('Links end at the Build phase rollup bar. Drag a link handle onto the rollup bar to add one; Frame and Wiring move it.')

const bars = computed<TimelineBar[]>(() => model.value.plan.tasks.filter(task => !task.summary).map(task => ({
  id: task.id, rowId: task.id, label: labels.get(task.id)!, editable: true, ...scheduledBarFields(task),
})))
const critical = computed(() => new Set(model.value.plan.criticalDependencyIds))
const name = (id: string) => labels.get(id) ?? id

function accept(tasks: readonly ScheduleTask[], links: readonly ScheduleLink[], message: string) {
  const result = plan(tasks, links)
  if (typeof result === 'string' || !result.ok) return
  model.value = { tasks, links, plan: result }
  notice.value = message
}
// FF and SF links cannot end at a summary task: the scheduler throws for them, so they are rejected before they are proposed.
function validateConnection(connection: TimelineConnection, replacing?: string) {
  if (summaryIds.has(connection.to) && (connection.type === 'FF' || connection.type === 'SF')) {
    return `A ${connection.type} link cannot end at the summary ${name(connection.to)}. Link to the subtask that should finish instead.`
  }
  if (model.value.links.some(link => link.id !== replacing && link.from === connection.from && link.to === connection.to)) return 'These tasks are already linked.'
  const links = replacing ? model.value.links.map(link => link.id === replacing ? { ...link, ...connection } : link) : [...model.value.links, { id: 'new', ...connection }]
  const result = plan(model.value.tasks, links)
  return typeof result === 'string' ? result : undefined
}
function connect(connection: TimelineConnection) {
  let number = model.value.links.length + 1
  while (model.value.links.some(link => link.id === 'link-' + number)) number++
  accept(model.value.tasks, [...model.value.links, { id: 'link-' + number, ...connection }],
    `Added ${connection.type} link from ${name(connection.from)} to ${name(connection.to)}.`)
}
function reconnect(change: TimelineReconnect) {
  accept(model.value.tasks, model.value.links.map(link => link.id === change.id ? { ...link, ...change.after } : link),
    `Reconnected ${name(change.after.from)} → ${name(change.after.to)} ${change.after.type}.`)
}
function removeLink(id: string) {
  selectedDependency.value = undefined
  accept(model.value.tasks, model.value.links.filter(link => link.id !== id), 'Deleted link ' + id + '.')
}
// Moving a subtask requests a new start; the plan is recalculated and the rollup bar and its links follow.
function moved(change: TimelineEdit) {
  return model.value.tasks.map(task => task.id === change.id ? { ...task, startNoEarlierThan: change.after.start } : task)
}
function validateEdit(change: TimelineEdit) {
  if (change.mode !== 'move') return 'Move a task to change its requested start.'
  const result = plan(moved(change), model.value.links)
  return typeof result === 'string' ? result : undefined
}
function edit(change: TimelineEdit) {
  accept(moved(change), model.value.links, `${name(change.id)} requested from ${formatTime(change.after.start)}.`)
  const build = model.value.plan.tasks.find(task => task.id === 'build')
  if (build) notice.value += ` Build phase ${formatTime(build.start)}–${formatTime(build.end)}.`
}
function reset() {
  model.value = { tasks: initialTasks, links: initialLinks, plan: plan(initialTasks, initialLinks) as Model['plan'] }
  selectedDependency.value = undefined
  notice.value = 'Summary link example reset.'
}
function exportLinks() {
  const svg = chart.value?.exportSvg({ title: 'Summary task links', rowHeading: 'Task' })
  if (!svg) return
  download(svg, 'summary-links.svg')
  const lines = svg.match(/<path d="[^"]+" fill="none" stroke="[^"]+" stroke-width="[^"]+" marker-end=/g)?.length ?? 0
  notice.value = `Exported summary links SVG with ${lines} dependency lines.`
}
</script>

<template>
  <section class="planning-panel" aria-labelledby="summary-links-title">
    <div class="section-head">
      <div><h2 id="summary-links-title">Summary task links</h2><p>summaryDependencies · links drawn to the rollup bar of a summary task · UTC</p></div>
      <div class="options">
        <button type="button" @click="exportLinks">Export summary links SVG</button>
        <button type="button" @click="reset">Reset summary links</button>
      </div>
    </div>
    <GanttChart ref="chart" :rows="rows" :bars="bars" :range="range" :dependencies="model.links" :format-time="formatTime"
      :pixels-per-unit="70 / hour" :tick-steps="[hour, 2 * hour]" :row-height="52" :height="330" :snap="15 * 60_000"
      show-summaries summary-dependencies connectable reconnectable :highlighted-dependency-ids="critical"
      v-model:selected-dependency-id="selectedDependency" :labels="{ region: 'Summary task links timeline' }"
      :validate-connection="validateConnection" :validate-edit="validateEdit"
      @connect="connect" @reconnect="reconnect" @dependency-delete="removeLink" @edit="edit"
      @connect-rejected="(_connection, reason) => notice = reason" @edit-rejected="(_change, reason) => notice = reason"
      @dependency-select="id => notice = 'Selected link ' + id + '. Press Delete to remove it.'">
      <template #row-heading>Task</template>
      <template #legend><span class="hint">Amber links are critical. FF and SF links into the summary are rejected, as the scheduler rejects them.</span></template>
    </GanttChart>
    <p class="status" role="status">{{ notice }}</p>
  </section>
</template>
