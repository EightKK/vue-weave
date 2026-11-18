<script setup lang="ts">
// Plan scenario comparison. The CNC cell gets maintenance; the planner builds a candidate plan from the current one,
// compares the two with `comparePlans` and then discards the candidate or adopts it. Three layers stay apart:
// - input: the current plan (in the edit history) and the candidate plan (a separate draft that records its base revision);
// - computed result: each plan's schedule and load, and the comparison of both (`comparePlans`);
// - view projection: graph, Gantt bars with the current plan as a baseline set, and highlights (`planComparisonTargets`).
// The current plan never changes while comparing. Adopting commits the candidate as ONE history entry, so one Undo
// reverts it; discarding drops the draft and restores the selection that existed before it was created.
import { computed, ref, shallowRef } from 'vue'
import {
  GanttChart, NetworkGraph, buildViewBindingIndex, calculateResourceLoad, comparePlans, planBaselines, planComparisonTargets,
  scheduleTasks, scheduleToGraph, traverseGraph, useEditHistory,
  type LoadViewTarget, type PlanComparisonTask, type PlanScenario, type ResourceAssignment, type ResourceCapacity, type ScheduleLink,
  type TimelineBar, type ViewBinding,
} from '../../src'

const hour = 3_600_000
const origin = Date.UTC(2026, 10, 9, 8)
const range = { start: origin, end: origin + 14 * hour }
const at = (clock: number) => origin + (clock - 8) * hour
const formatTime = (time: number) => new Date(time).toISOString().slice(11, 16)
const formatShift = (value: number) => (value > 0 ? '+' : value < 0 ? '−' : '±') + Math.abs(value / hour) + ' h'
const names: Record<string, string> = { prep: 'Prepare stock', cutA: 'Cut order A', cutB: 'Cut order B', inspect: 'Inspect', pack: 'Pack' }
const resourceNames: Record<string, string> = { cnc: 'CNC cell', saw: 'Backup saw', qc: 'Inspection', dispatch: 'Packing' }
const dependencies: ScheduleLink[] = [
  { id: 'prep-cutA', from: 'prep', to: 'cutA', type: 'FS' }, { id: 'prep-cutB', from: 'prep', to: 'cutB', type: 'FS' },
  { id: 'cutA-inspect', from: 'cutA', to: 'inspect', type: 'FS' }, { id: 'cutB-inspect', from: 'cutB', to: 'inspect', type: 'FS' },
  { id: 'inspect-pack', from: 'inspect', to: 'pack', type: 'FS' },
]

interface Plan {
  revision: string
  tasks: readonly PlanComparisonTask[]
  resources: readonly ResourceCapacity[]
  assignments: readonly ResourceAssignment[]
}
const initial: Plan = {
  revision: 'r1',
  tasks: [
    { id: 'prep', duration: 2 * hour }, { id: 'cutA', duration: 3 * hour }, { id: 'cutB', duration: 2 * hour },
    { id: 'inspect', duration: 2 * hour }, { id: 'pack', duration: 2 * hour, deadline: at(19) },
  ],
  resources: [{ id: 'cnc', capacity: 1 }, { id: 'saw', capacity: 1 }, { id: 'qc', capacity: 1 }, { id: 'dispatch', capacity: 1 }],
  assignments: [
    { resourceId: 'cnc', taskId: 'cutA' }, { resourceId: 'cnc', taskId: 'cutB' },
    { resourceId: 'qc', taskId: 'inspect' }, { resourceId: 'dispatch', taskId: 'pack' },
  ],
}
const history = useEditHistory<Plan>(initial)
let revisions = 1
const nextRevision = () => 'r' + ++revisions

// ---- input: the candidate is a separate draft with the revision it was derived from ----
type Strategy = 'push' | 'move'
interface Candidate { title: string; baseRevision: string; plan: Plan; savedSelection: ReadonlySet<string> }
const strategy = ref<Strategy>('push')
const candidate = shallowRef<Candidate>()
const partial = ref(false)
const message = ref('Choose how to handle the CNC maintenance, then create a candidate plan.')
const selection = ref<ReadonlySet<string>>(new Set())
const selectedRow = ref<string>()
const filter = ref<'all' | 'edited' | 'consequence'>('all')

/** Maintenance takes the CNC cell out of service from 10:00 to 13:00. */
function withMaintenance(plan: Plan, how: Strategy): Plan {
  const resources = plan.resources.map(resource => resource.id === 'cnc'
    ? { ...resource, periods: [{ start: range.start, end: at(10) }, { start: at(13), end: range.end }] } : resource)
  const later = (ids: string[]) => plan.tasks.map(task => ids.includes(task.id) ? { ...task, startNoEarlierThan: at(13) } : task)
  if (how === 'push') return { ...plan, resources, tasks: later(['cutA', 'cutB']) }
  return {
    ...plan, resources, tasks: later(['cutB']),
    assignments: plan.assignments.map(item => item.taskId === 'cutA' ? { ...item, resourceId: 'saw' } : item),
  }
}
function createCandidate() {
  const base = history.state.value
  candidate.value = {
    title: strategy.value === 'push' ? 'Push the cutting work after the maintenance' : 'Move Cut order A to the backup saw',
    baseRevision: base.revision, plan: withMaintenance(base, strategy.value), savedSelection: selection.value,
  }
  selectedRow.value = undefined
  message.value = 'Candidate created from revision ' + base.revision + '. The current plan is unchanged.'
}
function discard() {
  const draft = candidate.value
  if (!draft) return
  candidate.value = undefined
  selectedRow.value = undefined
  selection.value = draft.savedSelection
  message.value = 'Candidate discarded. The current plan and selection are as before.'
}
function adopt() {
  const draft = candidate.value
  if (!draft || !comparison.value) return
  if (comparison.value.revision.stale) return void (message.value = 'Not adopted: the current plan changed after the candidate was created.')
  if (!comparison.value.complete) return void (message.value = 'Not adopted: the comparison is incomplete.')
  // One bulk change: the whole candidate input replaces the current one in one history entry.
  history.commit({ ...draft.plan, revision: nextRevision() })
  candidate.value = undefined
  selectedRow.value = undefined
  selection.value = draft.savedSelection
  message.value = 'Adopted: ' + draft.title + '. Undo reverts the whole adoption in one step.'
}
function undo() {
  history.undo()
  message.value = 'Undid the last plan change.'
}
function advanceCurrent() {
  // Another planner lengthens Pack by one hour. The comparison is recalculated against the new current plan.
  const plan = history.state.value
  history.commit({ ...plan, revision: nextRevision(), tasks: plan.tasks.map(task => task.id === 'pack' ? { ...task, duration: task.duration + hour } : task) })
  message.value = 'Another planner changed the current plan (revision ' + history.state.value.revision + ').'
}

// ---- computed results ----
function calculate(plan: Plan) {
  const input = { range, tasks: plan.tasks, dependencies, resources: plan.resources, assignments: plan.assignments }
  const result = scheduleTasks(input, { explain: true })
  const load = result.ok ? calculateResourceLoad(range, result.tasks, plan.resources, plan.assignments) : []
  return { input, result, load }
}
const current = computed(() => calculate(history.state.value))
const draft = computed(() => candidate.value ? calculate(candidate.value.plan) : undefined)
const comparison = computed(() => {
  if (!candidate.value || !draft.value) return undefined
  const before: PlanScenario = { ...current.value, revision: history.state.value.revision, partial: partial.value }
  const after: PlanScenario = { ...draft.value, baseRevision: candidate.value.baseRevision }
  return comparePlans(before, after)
})

// ---- comparison rows ----
const summaryRows = computed(() => {
  const c = comparison.value
  if (!c) return []
  const time = (value: number | undefined) => value === undefined ? 'no schedule' : formatTime(value)
  const misses = (list: readonly { code: string }[] | undefined) => list === undefined ? 'no schedule' : String(list.filter(item => item.code === 'deadline').length)
  const rows = [
    { key: 'finish', label: 'Final completion', current: time(c.result.finish.current), candidate: time(c.result.finish.candidate),
      change: c.result.finish.shift === undefined ? '—' : formatShift(c.result.finish.shift) },
    { key: 'deadline', label: 'Deadline misses', current: misses(c.result.violations.current), candidate: misses(c.result.violations.candidate),
      change: c.result.violations.gained.length + ' gained, ' + c.result.violations.lost.length + ' lost' },
    { key: 'assignments', label: 'Changed assignments', current: '—', candidate: String(c.input.assignments.taskIds.length),
      change: c.input.assignments.taskIds.map(id => names[id]).join(', ') || 'none' },
  ]
  for (const item of c.result.overload) {
    if (!item.current && !item.candidate) continue
    const hours = (value: number | undefined) => value === undefined ? '—' : value / hour + ' unit-h'
    rows.push({ key: 'resource:' + item.resourceId, label: 'Overload ' + resourceNames[item.resourceId], current: hours(item.current),
      candidate: hours(item.candidate), change: item.change === undefined ? '—' : formatShift(item.change).replace(' h', ' unit-h') })
  }
  return rows
})
const taskRows = computed(() => (comparison.value?.result.tasks ?? []).filter(entry =>
  filter.value === 'all' || (filter.value === 'edited' ? entry.edited : !entry.edited)).map(entry => ({
  key: 'task:' + entry.id, id: entry.id, label: names[entry.id] ?? entry.id,
  kind: entry.edited ? 'Changed by you' : 'Moved as a result',
  detail: [
    entry.fields.length ? 'fields: ' + entry.fields.join(', ') : '',
    entry.assignmentsChanged ? 'resources: ' + entry.resourceIds.current.map(id => resourceNames[id]).join(', ') + ' → ' + entry.resourceIds.candidate.map(id => resourceNames[id]).join(', ') : '',
  ].filter(Boolean).join('; ') || '—',
  dates: entry.current.state === 'scheduled' && entry.candidate.state === 'scheduled'
    ? formatTime(entry.current.start) + '–' + formatTime(entry.current.end) + ' → ' + formatTime(entry.candidate.start) + '–' + formatTime(entry.candidate.end)
    : entry.current.state + ' → ' + entry.candidate.state,
  critical: entry.critical ? (entry.critical === 'gained' ? 'became critical' : 'no longer critical') : '',
})))
const selectedEntry = computed(() => comparison.value?.result.tasks.find(entry => 'task:' + entry.id === selectedRow.value))
const reasonText = computed(() => {
  const entry = selectedEntry.value
  if (!entry?.reasons?.candidate) return ''
  // Each plan's own trace explains its dates; it is not a claim that one change caused the difference.
  return entry.reasons.candidate.filter(reason => reason.phase === 'earliest' && reason.placedTime !== undefined).map(reason =>
    reason.kind === 'dependency' ? 'after ' + reason.dependencyId : reason.kind === 'constraint' ? reason.constraint + ' ' + formatTime(reason.candidateTime!) : reason.kind)
    .join('; ')
})
function toggleRow(key: string) {
  selectedRow.value = selectedRow.value === key ? undefined : key
}

// ---- view projection ----
const shown = computed(() => draft.value?.result.ok ? draft.value : current.value)
const shownTasks = computed(() => shown.value.result.ok ? shown.value.result.tasks : [])
const network = computed(() => shown.value.result.ok
  ? scheduleToGraph(shown.value.result, dependencies, { label: id => names[id]!, formatTime })
  : { nodes: [], edges: [] })
const baselines = computed(() => candidate.value && current.value.result.ok ? planBaselines(current.value.result, 'current') : undefined)
const rows = Object.entries(names).map(([id, label]) => ({ id, label }))
const bars = computed<TimelineBar[]>(() => shownTasks.value.map(task => {
  const source = (candidate.value?.plan ?? history.state.value).tasks.find(item => item.id === task.id)
  const baseline = baselines.value?.get(task.id)
  return {
    id: task.id, rowId: task.id, label: names[task.id]!, start: task.start, end: task.end, critical: task.critical,
    tone: comparison.value?.result.editedTaskIds.includes(task.id) ? 'violet' : 'blue',
    ...(source?.deadline !== undefined ? { deadline: source.deadline } : {}),
    ...(baseline ? { baselines: [baseline] } : {}),
  }
}))
const loadRows = Object.entries(resourceNames).map(([id, label]) => ({ id, label }))
const loadSegments = computed(() => shown.value.load.filter(segment => segment.load > 0))
const index = computed(() => buildViewBindingIndex(Object.keys(names).flatMap((id): ViewBinding[] => [
  { entity: { kind: 'task', id }, target: { view: 'graph', kind: 'node', id } },
  { entity: { kind: 'task', id }, target: { view: 'timeline', kind: 'bar', id } },
])))
/** The tasks a selected comparison row is about. */
const focusTaskIds = computed<string[]>(() => {
  const c = comparison.value, key = selectedRow.value
  if (!c || !key) return []
  if (key === 'finish') return shownTasks.value.filter(task => task.critical).map(task => task.id)
  if (key === 'deadline') return [...c.result.violations.gained, ...c.result.violations.lost, ...c.result.violations.candidate ?? []].map(item => item.taskId)
  if (key === 'assignments') return [...c.input.assignments.taskIds]
  if (key.startsWith('resource:')) {
    const resourceId = key.slice('resource:'.length)
    return [...new Set([...current.value.load, ...draft.value?.load ?? []].filter(segment => segment.resourceId === resourceId && segment.overload > 0).flatMap(segment => segment.taskIds))]
  }
  // A task row: the task and the changed tasks downstream of it, along the dependencies.
  const id = key.slice('task:'.length)
  const changed = new Set(c.result.tasks.map(entry => entry.id))
  return traverseGraph(network.value, [id], { direction: 'forward' }).nodeIds.filter(node => node === id || changed.has(node))
})
const targets = computed(() => comparison.value && focusTaskIds.value.length
  ? planComparisonTargets(comparison.value, index.value, { taskIds: focusTaskIds.value }) : undefined)
const highlightedNodes = computed(() => new Set(targets.value?.targets.flatMap(t => t.view === 'graph' && t.kind === 'node' ? [t.id] : []) ?? []))
const highlightedEdges = computed(() => new Set(dependencies.filter(item => highlightedNodes.value.has(item.from) && highlightedNodes.value.has(item.to)).map(item => item.id)))
const highlightedBars = computed(() => new Set(targets.value?.targets.flatMap(t => t.view === 'timeline' && t.kind === 'bar' ? [t.id] : []) ?? []))
const highlightedLoad = computed<LoadViewTarget[]>(() => {
  const key = selectedRow.value
  if (key?.startsWith('resource:')) {
    const resourceId = key.slice('resource:'.length)
    return [...current.value.load, ...draft.value?.load ?? []].filter(segment => segment.resourceId === resourceId && segment.overload > 0)
      .map(segment => ({ view: 'load', resourceId, start: segment.start, end: segment.end }))
  }
  return targets.value?.load ?? []
})
const selectionText = computed(() => selection.value.size ? [...selection.value].map(id => names[id] ?? id).join(', ') : 'none')
</script>

<template>
  <section class="scenario" aria-labelledby="scenario-title">
    <h3 id="scenario-title">Plan scenarios</h3>
    <p class="hint">The CNC cell is under maintenance 10:00–13:00. Build a candidate plan, compare it with the current plan, then discard or adopt it.</p>
    <div class="options scenario-options" role="group" aria-label="Scenario controls">
      <label>Candidate
        <select v-model="strategy" aria-label="Candidate strategy" :disabled="!!candidate">
          <option value="push">Push work later on the CNC cell</option>
          <option value="move">Move Cut order A to the backup saw</option>
        </select>
      </label>
      <button type="button" :disabled="!!candidate" @click="createCandidate">Create candidate</button>
      <button type="button" :disabled="!candidate || !comparison?.complete || comparison?.revision.stale" @click="adopt">Adopt candidate</button>
      <button type="button" :disabled="!candidate" @click="discard">Discard candidate</button>
      <button type="button" :disabled="!history.canUndo.value" @click="undo">Undo plan change</button>
      <button type="button" @click="advanceCurrent">Simulate another planner's change</button>
      <label><input v-model="partial" type="checkbox"> Current plan only partly loaded</label>
    </div>
    <p class="status" role="status" aria-label="Scenario status">{{ message }}</p>
    <p class="hint">
      <output aria-label="Current plan revision">Current plan revision {{ history.state.value.revision }}, finish {{ current.result.ok ? formatTime(current.result.finish) : 'none' }}</output>
      · <output aria-label="Scenario selection">Selected: {{ selectionText }}</output>
    </p>

    <template v-if="comparison">
      <p v-if="!comparison.complete" class="scenario-warning" role="alert">Incomplete comparison: the current plan is only partly loaded, so these figures cover the loaded part only. Adopting is disabled.</p>
      <p v-if="comparison.revision.stale" class="scenario-warning" role="alert">
        The current plan moved from revision {{ comparison.revision.base }} to {{ comparison.revision.current }} while comparing. The figures are recalculated against the new current plan; discard and create the candidate again to adopt.
      </p>
      <table class="scenario-table" aria-label="Plan comparison">
        <thead><tr><th scope="col">Measure</th><th scope="col">Current</th><th scope="col">Candidate</th><th scope="col">Change</th></tr></thead>
        <tbody>
          <tr v-for="row in summaryRows" :key="row.key" :class="{ 'is-selected': selectedRow === row.key }">
            <th scope="row"><button type="button" :aria-pressed="selectedRow === row.key" @click="toggleRow(row.key)">{{ row.label }}</button></th>
            <td>{{ row.current }}</td><td>{{ row.candidate }}</td><td>{{ row.change }}</td>
          </tr>
        </tbody>
      </table>
      <div class="options" role="radiogroup" aria-label="Task filter">
        <label><input v-model="filter" type="radio" value="all"> All task changes</label>
        <label><input v-model="filter" type="radio" value="edited"> Tasks I changed</label>
        <label><input v-model="filter" type="radio" value="consequence"> Tasks that moved as a result</label>
      </div>
      <table class="scenario-table" aria-label="Task changes">
        <thead><tr><th scope="col">Task</th><th scope="col">Change</th><th scope="col">Input</th><th scope="col">Dates</th><th scope="col">Critical</th></tr></thead>
        <tbody>
          <tr v-for="row in taskRows" :key="row.key" :class="{ 'is-selected': selectedRow === row.key }">
            <th scope="row"><button type="button" :aria-pressed="selectedRow === row.key" @click="toggleRow(row.key)">{{ row.label }}</button></th>
            <td>{{ row.kind }}</td><td>{{ row.detail }}</td><td>{{ row.dates }}</td><td>{{ row.critical }}</td>
          </tr>
        </tbody>
      </table>
      <p v-if="reasonText" class="hint" aria-label="Candidate reasons">In the candidate plan, {{ names[selectedEntry!.id] }} starts {{ reasonText }} (from the candidate's own trace).</p>
    </template>

    <NetworkGraph :nodes="network.nodes" :edges="network.edges" :options="{ nodeWidth: 230, nodeHeight: 56 }" :height="260"
      :selected-ids="selection" :highlighted-node-ids="highlightedNodes" :highlighted-edge-ids="highlightedEdges"
      :labels="{ region: 'Scenario network' }" @update:selected-ids="ids => selection = ids" />
    <GanttChart :rows="rows" :bars="bars" :range="range" :dependencies="dependencies" :pixels-per-unit="48 / hour"
      :tick-steps="[hour, 2 * hour]" :row-height="46" :height="420" :format-time="formatTime"
      :baseline-ids="candidate ? ['current'] : []" :baseline-label="() => 'Current plan'"
      :load-rows="loadRows" :load-segments="loadSegments" :highlighted-load-targets="highlightedLoad"
      :selected-ids="selection" :highlighted-bar-ids="highlightedBars" :labels="{ region: 'Scenario timeline' }"
      @update:selected-ids="ids => selection = ids" @select="id => selection = new Set([id])">
      <template #row-heading>Task</template>
      <template #legend><span class="hint">With a candidate, bars show the candidate plan and the strip below each bar shows the current plan. Violet bars were changed by you.</span></template>
    </GanttChart>
  </section>
</template>

<style scoped>
.scenario { border-top: 1px solid var(--vw-border, #d9e4ec); margin-top: 16px; padding-top: 8px; display: grid; gap: 8px; }
.scenario h3 { margin: 0; }
.scenario-options { flex-wrap: wrap; gap: 8px 14px; }
.scenario-warning { margin: 0; padding: 6px 10px; border: 1px solid var(--vw-danger, #b42318); border-radius: 6px; font-size: 12px; }
.scenario-table { border-collapse: collapse; font-size: 12px; width: 100%; }
.scenario-table th, .scenario-table td { border-bottom: 1px solid var(--vw-border, #d9e4ec); padding: 3px 6px; text-align: start; }
.scenario-table tr.is-selected { background: var(--vw-selection, rgba(36, 94, 150, 0.12)); }
.scenario-table button { font: inherit; }
</style>
