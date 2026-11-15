<script setup lang="ts">
import { computed, nextTick, ref, shallowRef, watch } from 'vue'
import {
  GanttChart, buildPlacementInput, calculateResourceLoad, createResourceTimelineProjector, levelResources, proposeResourceAssignment,
  resolveResourceTimelineEdit, resourceTimelineBarId, scheduleTasks, scheduledBarFields, toPlanningDiagnostics, useEditHistory,
  type FieldValue, type LevelResourcesInput, type LevelResourcesResult, type PlanningDiagnostic, type ResourceAssignment, type ResourceLoadSegment,
  type ScheduleLink, type ScheduleResult, type ScheduleTask, type ScheduleTrace, type TimelineDrop, type TimelineEdit,
} from '../src'
import PlanningBacklog from './components/PlanningBacklog.vue'
import PlanningDiagnostics from './components/PlanningDiagnostics.vue'
import PlanningInspector from './components/PlanningInspector.vue'
import { BACKLOG_MIME, type InspectorField, type PlaceRequest } from './components/types'
import { formatTime, hour, origin } from './data'

// One plan, shown by resource. Tasks A and B need the same press, so the press is overloaded until one of them moves.
// The plan is the single source of truth (tasks, assignments, placed IDs); the chart rows are a projection of it.
// Every edit becomes a proposal that is calculated and previewed first, and then applied as ONE history entry.
interface PlanModel { tasks: ScheduleTask[]; assignments: ResourceAssignment[]; placed: string[] }
type Policy = 'warn' | 'reject' | 'level'

const range = { start: origin, end: origin + 14 * hour }
const quantum = hour / 4
const resources = [
  { id: 'press-1', label: 'Press 1', capacity: 1 },
  { id: 'press-2', label: 'Press 2', capacity: 1 },
  { id: 'crew', label: 'Crew', capacity: 1 },
]
const resourceRows = resources.map(resource => ({ id: resource.id, label: resource.label, detail: 'capacity ' + resource.capacity }))
const resourceIds = resources.map(resource => resource.id)
const resourceLabel = (id: string) => resources.find(resource => resource.id === id)?.label ?? id
const taskLabels = new Map([['A', 'Mold A'], ['B', 'Mold B'], ['C', 'Finish C'], ['D', 'Rework D'], ['E', 'Inspect E']])
const taskLabel = (id: string) => taskLabels.get(id) ?? id
// Task links use task IDs. The chart receives one link between representative projections (see the projection below).
const links: ScheduleLink[] = [{ id: 'A-C', from: 'A', to: 'C', type: 'FS' }, { id: 'D-E', from: 'D', to: 'E', type: 'FS' }]
const initial: PlanModel = {
  tasks: [
    { id: 'A', duration: 3 * hour, startNoEarlierThan: origin },
    { id: 'B', duration: 2 * hour, startNoEarlierThan: origin + hour },
    { id: 'C', duration: 2 * hour },
    { id: 'D', duration: 2 * hour },
    { id: 'E', duration: hour },
  ],
  // A needs both the press and the crew, so it appears in two rows while it stays one task.
  assignments: [
    { taskId: 'A', resourceId: 'press-1' }, { taskId: 'A', resourceId: 'crew' }, { taskId: 'B', resourceId: 'press-1' },
    { taskId: 'C', resourceId: 'press-2' }, { taskId: 'D', resourceId: 'press-2' }, { taskId: 'E', resourceId: 'crew' },
  ],
  placed: ['A', 'B', 'C'],
}
const history = useEditHistory<PlanModel>(initial)
const model = history.state
const policy = ref<Policy>('warn')

// ---- calculation: placement input, then scheduleTasks or levelResources, then load and diagnostics ----
interface Calc {
  name: 'scheduleTasks' | 'levelResources'
  placement: ReturnType<typeof buildPlacementInput<LevelResourcesInput>>
  plan: ScheduleResult | LevelResourcesResult
  load: ResourceLoadSegment[]
  diagnostics: PlanningDiagnostic[]
  trace?: ScheduleTrace
  unresolved: readonly string[]
}
const unresolvedOf = (plan: ScheduleResult | LevelResourcesResult): readonly string[] => plan.ok && 'unresolvedTaskIds' in plan ? plan.unresolvedTaskIds : []
function compute(state: PlanModel, mode: Policy): Calc {
  const full: LevelResourcesInput = { range, quantum, tasks: state.tasks, dependencies: links, resources, assignments: state.assignments }
  // Unplaced tasks have no dates: they, their links and their assignments are left out of the calculation, never invented.
  const placement = buildPlacementInput(full, state.placed)
  const leveled = mode === 'level'
  const plan: ScheduleResult | LevelResourcesResult = leveled ? levelResources(placement.input, { explain: true }) : scheduleTasks(placement.input, { explain: true })
  const load = plan.ok ? calculateResourceLoad(range, plan.tasks, resources, placement.input.assignments ?? []) : []
  return {
    name: leveled ? 'levelResources' : 'scheduleTasks', placement, plan, load,
    diagnostics: toPlanningDiagnostics(plan, plan.ok ? load : undefined),
    ...(plan.ok ? { trace: (plan as { trace?: ScheduleTrace }).trace } : {}),
    unresolved: unresolvedOf(plan),
  }
}
const current = computed(() => compute(model.value, policy.value))
const overloads = (calc: Calc) => calc.load.filter(segment => segment.overload > 0).length
/** What the calculation did about capacity. It says "resolved" only when levelResources left no unresolved task. */
function capacitySummary(calc: Calc) {
  if (!calc.plan.ok) return 'No plan could be calculated.'
  const over = overloads(calc)
  if (calc.name === 'scheduleTasks') {
    return over ? over + ' overloaded interval(s). scheduleTasks reports load but does not enforce capacity.' : 'No overloaded interval in the calculated load.'
  }
  if (calc.unresolved.length) {
    return 'Not resolved: ' + calc.unresolved.map(taskLabel).join(', ') + ' could not be leveled within their constraints; ' + over + ' overloaded interval(s) remain.'
  }
  return over ? over + ' overloaded interval(s) remain after leveling.' : 'Capacity constraints resolved by levelResources.'
}

// ---- projection onto resource rows ----
const projector = createResourceTimelineProjector()
const projectionTasks = computed(() => current.value.plan.ok
  ? current.value.plan.tasks.map(item => {
    const { start, end, segments } = scheduledBarFields(item)
    return { id: item.id, label: taskLabel(item.id), start, end, ...(segments ? { segments } : {}), editable: true, tone: item.critical ? 'amber' as const : 'blue' as const }
  })
  : [])
const unplannedIds = computed(() => model.value.tasks.filter(item => !model.value.placed.includes(item.id)).map(item => item.id))
const projection = computed(() => projector({
  resources: resourceRows, tasks: projectionTasks.value, assignments: model.value.assignments, dependencies: links, unplannedTaskIds: unplannedIds.value,
}))
const loadRows = resourceRows.map(({ id, label }) => ({ id, label }))
const backlogItems = computed(() => unplannedIds.value.map(id => ({
  id, label: taskLabel(id),
  detail: (model.value.assignments.filter(item => item.taskId === id).map(item => resourceLabel(item.resourceId)).join(', ') || 'no resource') + ' · ' + (model.value.tasks.find(item => item.id === id)!.duration / hour) + ' h',
})))
const startTimes = Array.from({ length: 12 }, (_, index) => ({ value: origin + index * hour, label: formatTime(origin + index * hour) }))

// ---- proposals: calculated and previewed, then applied as one history entry ----
interface Proposal { title: string; changes: string[]; next: PlanModel; calc: Calc; focusBarId?: string }
const proposal = shallowRef<Proposal>()
const notice = ref('Move a bar (drag, or arrow keys; Up and Down change the resource), edit the inspector, or place an unplanned task.')
function reject(reason: string) {
  proposal.value = undefined
  notice.value = 'Not applied: ' + reason
}
function propose(title: string, changes: string[], next: PlanModel, focusBarId?: string) {
  let calc: Calc
  try {
    calc = compute(next, policy.value)
  } catch (error) {
    return reject(error instanceof Error ? error.message : String(error))
  }
  if (!calc.placement.ok) {
    return reject(calc.placement.diagnostics.map(item => taskLabel(item.taskId) + ' depends on ' + taskLabel(item.predecessorId) + ', which is not placed yet. Place ' + taskLabel(item.predecessorId) + ' first.').join(' '))
  }
  if (!calc.plan.ok) {
    return reject(calc.plan.code === 'cycle' ? 'The change creates a dependency cycle.'
      : taskLabel(calc.plan.taskId) + ' cannot meet its constraints (' + calc.plan.constraints.join(', ') + ').')
  }
  if (policy.value === 'reject' && overloads(calc) > overloads(current.value)) {
    return reject('the capacity policy rejects changes that add overload (' + overloads(calc) + ' overloaded interval(s) instead of ' + overloads(current.value) + ').')
  }
  notice.value = 'Review the preview, then apply or discard it.'
  proposal.value = { title, changes, next, calc, ...(focusBarId ? { focusBarId } : {}) }
}
function describeDates(calc: Calc) {
  if (!calc.plan.ok || !current.value.plan.ok) return []
  const before = new Map(current.value.plan.tasks.map(item => [item.id, item]))
  return calc.plan.tasks.flatMap(item => {
    const old = before.get(item.id)
    return !old || old.start !== item.start || old.end !== item.end
      ? [taskLabel(item.id) + ' ' + (old ? formatTime(old.start) + '–' + formatTime(old.end) + ' → ' : '') + formatTime(item.start) + '–' + formatTime(item.end)] : []
  })
}
async function apply() {
  const pending = proposal.value
  if (!pending) return
  history.commit(pending.next)
  proposal.value = undefined
  notice.value = 'Applied: ' + pending.title + '.'
  await nextTick()
  // An assignment change gives the bar a new ID, so the keyboard focus is returned by the parent to the new bar.
  if (pending.focusBarId) void chart.value?.revealBar(pending.focusBarId, { focus: true })
}
function discard() {
  proposal.value = undefined
  notice.value = 'Preview discarded. Nothing changed.'
}
function undo() { history.undo(); proposal.value = undefined; notice.value = 'Undid the last planning change.' }
function redo() { history.redo(); proposal.value = undefined; notice.value = 'Redid the planning change.' }

// Vertical move = replace the assignment; horizontal move = change the task's schedule for every projection; both = one proposal.
function onEdit(edit: TimelineEdit) {
  const resolved = resolveResourceTimelineEdit(projection.value, edit)
  if (!resolved.ok) return reject(resolved.reason)
  const { scheduleChange, assignmentReplacement } = resolved
  let next = model.value
  let focusBarId: string | undefined
  const changes: string[] = []
  if (assignmentReplacement) {
    const result = proposeResourceAssignment({ assignments: next.assignments, resourceIds, taskIds: next.tasks.map(item => item.id) }, { kind: 'replace', ...assignmentReplacement })
    if (!result.ok) return reject(result.reason)
    next = { ...next, assignments: result.assignments }
    changes.push('Replace ' + resourceLabel(assignmentReplacement.fromResourceId) + ' with ' + resourceLabel(assignmentReplacement.toResourceId) + ' for ' + taskLabel(assignmentReplacement.taskId))
    focusBarId = resourceTimelineBarId(assignmentReplacement.taskId, assignmentReplacement.toResourceId)
  }
  if (scheduleChange) {
    next = { ...next, tasks: next.tasks.map(item => item.id === scheduleChange.taskId
      ? withoutFixed({ ...item, startNoEarlierThan: scheduleChange.after.start, duration: scheduleChange.after.end - scheduleChange.after.start }) : item) }
    changes.push('Request ' + taskLabel(scheduleChange.taskId) + ' at ' + formatTime(scheduleChange.after.start) + '–' + formatTime(scheduleChange.after.end) + ' (every row that shows it)')
  }
  if (!changes.length) return
  const taskId = (assignmentReplacement ?? scheduleChange)!.taskId
  propose(taskLabel(taskId) + (assignmentReplacement ? ' reassigned' : ' rescheduled'), changes, next, focusBarId)
}
function withoutFixed(item: ScheduleTask): ScheduleTask {
  const { fixedStart: _fixed, ...rest } = item
  return rest
}
function place(request: PlaceRequest) {
  const base = model.value
  if (base.placed.includes(request.taskId)) return reject(taskLabel(request.taskId) + ' is already placed.')
  let assignments = base.assignments
  const changes = ['Place ' + taskLabel(request.taskId) + ' at ' + formatTime(request.time) + ' on ' + resourceLabel(request.resourceId)]
  if (!assignments.some(item => item.taskId === request.taskId && item.resourceId === request.resourceId)) {
    const result = proposeResourceAssignment({ assignments, resourceIds, taskIds: base.tasks.map(item => item.id) }, { kind: 'add', taskId: request.taskId, resourceId: request.resourceId })
    if (!result.ok) return reject(result.reason)
    assignments = result.assignments
    changes.push('Assign ' + taskLabel(request.taskId) + ' to ' + resourceLabel(request.resourceId))
  }
  const next: PlanModel = {
    tasks: base.tasks.map(item => item.id === request.taskId ? withoutFixed({ ...item, startNoEarlierThan: request.time }) : item),
    assignments, placed: [...base.placed, request.taskId],
  }
  propose('placed ' + taskLabel(request.taskId), changes, next, resourceTimelineBarId(request.taskId, request.resourceId))
}
function onDrop(drop: TimelineDrop) {
  const taskId = drop.dataTransfer?.getData(BACKLOG_MIME)
  if (!taskId) return reject('drop a task from the unplanned list.')
  if (!drop.rowId) return reject('drop the task on a resource row.')
  place({ taskId, resourceId: drop.rowId, time: drop.time })
}

// ---- selection, inspector, assignments ----
const chart = ref<InstanceType<typeof GanttChart>>()
const selection = ref(new Set<string>())
const selectedTaskId = ref<string>()
watch(selection, ids => {
  const origin = [...ids].map(id => projection.value.origins.get(id)).find(Boolean)
  if (origin) selectedTaskId.value = origin.taskId
})
const selectedTask = computed(() => model.value.tasks.find(item => item.id === selectedTaskId.value))
const inspectorFields: InspectorField[] = [
  { label: 'Duration', spec: { id: 'duration', kind: 'duration', durationBasis: 'elapsed', unitSize: hour, unitLabel: 'h', required: true, min: quantum, get: (item: ScheduleTask) => item.duration } },
  { label: 'Leveling priority', spec: { id: 'priority', kind: 'number', integer: true, get: (item: ScheduleTask) => item.priority ?? 0 } },
]
function inspect(change: { fieldId: string; after: FieldValue }) {
  const target = selectedTask.value
  if (!target || typeof change.after !== 'number') return
  const patch = change.fieldId === 'duration' ? { duration: change.after } : { priority: change.after }
  propose(taskLabel(target.id) + ' ' + change.fieldId + ' edited', [taskLabel(target.id) + ': ' + change.fieldId + ' = ' + change.after], {
    ...model.value, tasks: model.value.tasks.map(item => item.id === target.id ? { ...item, ...patch } : item),
  })
}
const assigned = computed(() => model.value.assignments.filter(item => item.taskId === selectedTaskId.value).map(item => item.resourceId))
const addChoice = ref('press-1')
function changeAssignment(request: { kind: 'add' | 'remove'; resourceId: string }) {
  const target = selectedTask.value
  if (!target) return
  const result = proposeResourceAssignment({ assignments: model.value.assignments, resourceIds, taskIds: model.value.tasks.map(item => item.id) }, { ...request, taskId: target.id })
  if (!result.ok) return reject(result.reason)
  const verb = request.kind === 'add' ? 'Assign ' + taskLabel(target.id) + ' to ' : 'Unassign ' + taskLabel(target.id) + ' from '
  propose(verb.toLowerCase() + resourceLabel(request.resourceId), [verb + resourceLabel(request.resourceId)], { ...model.value, assignments: result.assignments },
    request.kind === 'add' ? resourceTimelineBarId(target.id, request.resourceId) : undefined)
}

// ---- diagnostics: reveal the bars of a diagnostic ----
const highlighted = ref<ReadonlySet<string>>(new Set())
async function reveal(diagnostic: PlanningDiagnostic) {
  const bars = diagnostic.entities.filter(entity => entity.kind === 'task').flatMap(entity => projection.value.taskBarIds.get(entity.id) ?? [])
  highlighted.value = new Set(bars)
  if (!bars.length) { notice.value = 'This diagnostic names no placed task with a bar.'; return }
  const result = await chart.value?.revealBar(bars[0]!)
  notice.value = 'Highlighted ' + bars.length + ' bar(s) for the diagnostic' + (result && result.status !== 'revealed' ? ' (' + result.status + ')' : '') + '.'
}
const summaryDates = computed(() => current.value.plan.ok ? 'Finish ' + formatTime(current.value.plan.finish) : '')
</script>

<template>
  <section class="planning-panel" aria-labelledby="resource-planning-title">
    <div class="section-head">
      <div><h2 id="resource-planning-title">Resource planning</h2><p>One plan shown by resource · a task with two resources has two bars but one set of dates · UTC</p></div>
      <div class="options">
        <label>Capacity policy
          <select v-model="policy" @change="proposal = undefined">
            <option value="warn">Warn about overload (scheduleTasks)</option>
            <option value="reject">Reject added overload (scheduleTasks)</option>
            <option value="level">Level resources (levelResources)</option>
          </select>
        </label>
        <button type="button" :disabled="!history.canUndo.value" @click="undo">Undo planning change</button>
        <button type="button" :disabled="!history.canRedo.value" @click="redo">Redo planning change</button>
      </div>
    </div>
    <div class="rp-layout">
      <div class="rp-main">
        <GanttChart ref="chart" :rows="projection.rows" :bars="projection.bars" :dependencies="projection.dependencies" :lane-count="projection.laneCount" :range="range"
          :format-time="formatTime" :height="360" :pixels-per-unit="60 / hour" row-draggable droppable v-model:selected-ids="selection" :highlighted-bar-ids="highlighted"
          :load-rows="loadRows" :load-segments="current.load" :labels="{ region: 'Resource plan', rows: 'Resource' }" @edit="onEdit" @bar-drop="onDrop"
          @edit-rejected="(_edit, reason) => notice = reason">
          <template #row-heading>Resource</template>
          <template #legend><span class="hint">Left and Right move a task in time; Up and Down move it to another resource row. Both changes are previewed before they apply.</span></template>
        </GanttChart>
        <div class="summary" role="status" aria-label="Plan summary">
          <strong>Calculated with {{ current.name }}.</strong> {{ summaryDates }}. {{ capacitySummary(current) }}
          <span v-if="current.name === 'levelResources'"> levelResources ignores a task's ALAP mode.</span>
        </div>
        <section v-if="proposal" class="preview" aria-labelledby="preview-title">
          <h3 id="preview-title">Preview: {{ proposal.title }}</h3>
          <p>Calculated with {{ proposal.calc.name }}{{ proposal.calc.name === 'scheduleTasks' ? ' (dates only; capacity is not enforced)' : ' (dates leveled for capacity)' }}.</p>
          <ul aria-label="Proposed changes"><li v-for="change in proposal.changes" :key="change">{{ change }}</li></ul>
          <ul v-if="describeDates(proposal.calc).length" aria-label="Resulting dates"><li v-for="line in describeDates(proposal.calc)" :key="line">{{ line }}</li></ul>
          <p>{{ capacitySummary(proposal.calc) }}</p>
          <div class="options"><button type="button" @click="apply">Apply change</button><button type="button" @click="discard">Discard preview</button></div>
        </section>
        <p class="status" role="status" aria-label="Planning notice">{{ notice }}</p>
        <PlanningDiagnostics :diagnostics="current.diagnostics" :trace="current.trace" :task-label="taskLabel" :resource-label="resourceLabel" :format-time="formatTime" @activate="reveal" />
      </div>
      <aside class="rp-side">
        <PlanningBacklog :items="backlogItems" :rows="resourceRows" :times="startTimes" @place="place" />
        <PlanningInspector :title="selectedTask ? 'Task ' + taskLabel(selectedTask.id) : 'Task inspector'" :item="selectedTask" :fields="inspectorFields" @edit="inspect" />
        <fieldset v-if="selectedTask" class="assign">
          <legend>Assignments of {{ taskLabel(selectedTask.id) }}</legend>
          <p v-if="!assigned.length" class="hint">No resource: the task has no bar in the resource rows.</p>
          <button v-for="id in assigned" :key="id" type="button" @click="changeAssignment({ kind: 'remove', resourceId: id })">Unassign {{ resourceLabel(id) }}</button>
          <label>Resource to add <select v-model="addChoice"><option v-for="resource in resources" :key="resource.id" :value="resource.id">{{ resource.label }}</option></select></label>
          <button type="button" @click="changeAssignment({ kind: 'add', resourceId: addChoice })">Assign to resource</button>
        </fieldset>
      </aside>
    </div>
  </section>
</template>

<style scoped>
.rp-layout { display: grid; grid-template-columns: minmax(0, 1fr) 280px; gap: 14px; align-items: start; }
.rp-main, .rp-side { display: grid; gap: 10px; min-width: 0; }
.summary { font-size: 12px; border: 1px solid var(--vw-border, #d9e4ec); border-radius: 6px; padding: 7px 10px; }
.preview { border: 2px solid var(--vw-accent, #245e96); border-radius: 8px; padding: 10px; font-size: 12px; margin: 0; }
.preview h3 { margin: 0 0 4px; font-size: 14px; }
.preview ul { margin: 4px 0; padding-inline-start: 18px; }
.preview .options { gap: 8px; }
.assign { border: 1px solid var(--vw-border, #d9e4ec); border-radius: 8px; font-size: 12px; display: grid; gap: 6px; margin: 0; }
.assign label { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; }
@media (max-width: 900px) { .rp-layout { grid-template-columns: 1fr; } }
</style>
