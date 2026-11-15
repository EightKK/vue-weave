<script setup lang="ts">
// One schedule shown as a network graph, a Gantt chart and resource load rows, linked through entity bindings.
// The view the user acts in owns the selection (`selectedIds`); the other views only get highlight props, so a linked
// item can never be deleted or moved from another view. Hover is highlight only. "Go to counterpart" reveals an item
// and handles collapsed groups and unknown targets with a visible message.
import { computed, nextTick, ref, useTemplateRef } from 'vue'
import {
  GanttChart, NetworkGraph, buildViewBindingIndex, revealLinkedTarget, calculateResourceLoad, resolveEntityRefs, resolveLoadTargets, resolveViewTargets,
  scheduleTasks, scheduleToGraph, traverseGraph, useLinkedSelection,
  type EntityRef, type GraphViewTarget, type LoadViewTarget, type RevealResult, type ScheduleLink, type ScheduleTask,
  type TimelineBar, type TimelineLoadSegment, type ViewBinding, type ViewTarget, type ViewTargetEvent,
} from '../src'
import GraphContextToolbar from './components/GraphContextToolbar.vue'

const hour = 3_600_000
const origin = Date.UTC(2026, 10, 9, 8)
const range = { start: origin, end: origin + 12 * hour }
const names: Record<string, string> = { prep: 'Prepare stock', cutA: 'Cut order A', cutB: 'Cut order B', inspect: 'Inspect', pack: 'Pack' }
const tasks: ScheduleTask[] = [
  { id: 'prep', duration: 2 * hour }, { id: 'cutA', duration: 3 * hour }, { id: 'cutB', duration: 2 * hour },
  { id: 'inspect', duration: 2 * hour }, { id: 'pack', duration: 2 * hour },
]
// Both cutting orders need the CNC cell and nothing orders them, so the cell is overloaded while they overlap.
const dependencies: ScheduleLink[] = [
  { id: 'prep-cutA', from: 'prep', to: 'cutA', type: 'FS' }, { id: 'prep-cutB', from: 'prep', to: 'cutB', type: 'FS' },
  { id: 'cutA-inspect', from: 'cutA', to: 'inspect', type: 'FS' }, { id: 'cutB-inspect', from: 'cutB', to: 'inspect', type: 'FS' },
  { id: 'inspect-pack', from: 'inspect', to: 'pack', type: 'FS' },
]
const resources = [{ id: 'cnc', label: 'CNC cell', capacity: 1 }, { id: 'qc', label: 'Inspection', capacity: 1 }, { id: 'dispatch', label: 'Packing', capacity: 1 }]
const assignments = [
  { resourceId: 'cnc', taskId: 'cutA' }, { resourceId: 'cnc', taskId: 'cutB' },
  { resourceId: 'qc', taskId: 'inspect' }, { resourceId: 'dispatch', taskId: 'pack' },
]
const plan = scheduleTasks({ range, tasks, dependencies })
if (!plan.ok) throw new Error('The linked demo schedule must be feasible')

const network = scheduleToGraph(plan, dependencies, { label: id => names[id]!, formatTime: time => new Date(time).toISOString().slice(11, 16) })
const graphGroups = [{ id: 'cutting-cell', label: 'Cutting cell', nodeIds: ['cutA', 'cutB'] }]
const rows = [
  { id: 'prep', label: names.prep! }, { id: 'cutting', label: 'Cutting cell' },
  { id: 'cutA', parentId: 'cutting', label: names.cutA! }, { id: 'cutB', parentId: 'cutting', label: names.cutB! },
  { id: 'inspect', label: names.inspect! }, { id: 'pack', label: names.pack! },
]
const bars: TimelineBar[] = plan.tasks.map(task => ({
  id: task.id, rowId: task.id, label: names[task.id]!, start: task.start, end: task.end,
  tone: task.critical ? 'amber' : 'blue', deletable: true,
}))
const loadRows = resources.map(({ id, label }) => ({ id, label }))
const loadSegments: TimelineLoadSegment[] = calculateResourceLoad(range, plan.tasks, resources, assignments)
  .filter(segment => segment.load > 0)

// Entities: tasks and dependencies. Each is bound to what every view shows for it. The bindings are data, so a task
// could just as well map to several nodes or bars.
const taskById = new Map(plan.tasks.map(task => [task.id, task]))
const bindings: ViewBinding[] = [
  ...plan.tasks.flatMap((task): ViewBinding[] => {
    const entity: EntityRef = { kind: 'task', id: task.id }
    const load = assignments.find(item => item.taskId === task.id)
    return [
      { entity, target: { view: 'graph', kind: 'node', id: task.id } },
      { entity, target: { view: 'timeline', kind: 'bar', id: task.id } },
      { entity, target: { view: 'timeline', kind: 'row', id: task.id } },
      ...load ? [{ entity, target: { view: 'load', resourceId: load.resourceId, start: task.start, end: task.end } } as ViewBinding] : [],
    ]
  }),
  ...dependencies.flatMap((dependency): ViewBinding[] => {
    const entity: EntityRef = { kind: 'dependency', id: dependency.id }
    return [
      { entity, target: { view: 'graph', kind: 'edge', id: dependency.id } },
      { entity, target: { view: 'timeline', kind: 'dependency', id: dependency.id } },
    ]
  }),
]
const index = buildViewBindingIndex(bindings)
const linked = useLinkedSelection({ bindings })

const graph = useTemplateRef<InstanceType<typeof NetworkGraph>>('graph')
const gantt = useTemplateRef<InstanceType<typeof GanttChart>>('gantt')
const graphCollapsed = ref<ReadonlySet<string>>(new Set())
const rowsCollapsed = ref<ReadonlySet<string>>(new Set())
const refreshKey = ref(0)
const message = ref('')
const offer = ref<{ view: 'graph' | 'timeline'; taskId: string; proxyId: string } | undefined>()
const revealTask = ref('')
const deleteProposals = ref<string[][]>([])

// Impact range: what the selected tasks reach through dependencies, with an optional hop limit.
const impactDirection = ref<'off' | 'forward' | 'backward' | 'both'>('off')
const impactHops = ref('all')
const selectedTaskIds = computed(() => linked.selectedEntities.value.filter(entity => entity.kind === 'task').map(entity => entity.id))
const impactTargets = computed<ViewTarget[]>(() => {
  if (impactDirection.value === 'off' || !selectedTaskIds.value.length) return []
  const start = resolveViewTargets(index, selectedTaskIds.value.map(id => ({ kind: 'task', id }))).targets
    .flatMap(target => target.view === 'graph' && target.kind === 'node' ? [target.id] : [])
  const reached = traverseGraph(network, start, {
    direction: impactDirection.value, maxHops: impactHops.value === 'all' ? Infinity : Number(impactHops.value),
  })
  const targets: ViewTarget[] = [
    ...reached.nodeIds.map((id): ViewTarget => ({ view: 'graph', kind: 'node', id })),
    ...reached.edgeIds.map((id): ViewTarget => ({ view: 'graph', kind: 'edge', id })),
  ]
  return resolveViewTargets(index, resolveEntityRefs(index, targets).entities).targets
})

function merged(base: ReadonlySet<string>, own: ReadonlySet<string>, pick: (target: ViewTarget) => string | undefined) {
  const result = new Set(base)
  for (const target of impactTargets.value) {
    const id = pick(target)
    if (id !== undefined && !own.has(id)) result.add(id)
  }
  return result
}
const graphSets = linked.graph
const timelineSets = linked.timeline
const highlightedNodes = computed(() => merged(graphSets.value.highlightedNodeIds, graphSets.value.selectedNodeIds,
  t => t.view === 'graph' && t.kind === 'node' ? t.id : undefined))
const highlightedEdges = computed(() => merged(graphSets.value.highlightedEdgeIds, graphSets.value.selectedEdgeIds,
  t => t.view === 'graph' && t.kind === 'edge' ? t.id : undefined))
const highlightedBars = computed(() => merged(timelineSets.value.highlightedBarIds, timelineSets.value.selectedBarIds,
  t => t.view === 'timeline' && t.kind === 'bar' ? t.id : undefined))
const highlightedDependencies = computed(() => merged(timelineSets.value.highlightedDependencyIds, new Set(),
  t => t.view === 'timeline' && t.kind === 'dependency' ? t.id : undefined))

// Load segments have no ID: the chart finds the current segments again from the load targets that overlap them.
const highlightedLoad = computed(() => [...linked.load.value.highlighted, ...impactTargets.value.filter((t): t is LoadViewTarget => t.view === 'load')])

const toolbarTarget = computed<GraphViewTarget | undefined>(() => {
  const [node] = graphSets.value.selectedNodeIds
  if (node !== undefined) return { view: 'graph', kind: 'node', id: node }
  const [edge] = graphSets.value.selectedEdgeIds
  return edge !== undefined ? { view: 'graph', kind: 'edge', id: edge } : undefined
})
const edgeText = (id: string) => {
  const dependency = dependencies.find(item => item.id === id)
  return dependency ? `${names[dependency.from]} to ${names[dependency.to]}` : id
}

const summary = computed(() => {
  const selected = linked.selectedEntities.value
  if (!selected.length && !linked.hoveredEntities.value.length) return 'Nothing selected. Select a task in any view.'
  const text = (entities: readonly EntityRef[]) => entities.map(entity => entity.kind === 'task' ? names[entity.id] : edgeText(entity.id)).join(', ')
  const parts = []
  if (selected.length) parts.push(`Selected in ${linked.owner.value}: ${text(selected)}`)
  if (linked.hoveredEntities.value.length) parts.push(`Hovering: ${text(linked.hoveredEntities.value)}`)
  if (impactTargets.value.length) parts.push(`Impact range reaches ${new Set(impactTargets.value.flatMap(t => t.view === 'timeline' && t.kind === 'bar' ? [t.id] : [])).size} tasks`)
  return parts.join('. ')
})

function bump() {
  refreshKey.value++
}
function enter(event: ViewTargetEvent) {
  linked.hoverEnter(event.target.view, event.target)
}
function leave(event: ViewTargetEvent) {
  linked.hoverLeave(event.target.view, event.target)
}
function activate(event: ViewTargetEvent) {
  message.value = ''
  offer.value = undefined
  // Linked items are display-only, so activation reports what the user touched in the view they act in.
  const { unknown } = linked.select(event.target.view, [event.target])
  if (unknown.length && event.target.view !== 'graph') message.value = 'That item has no counterpart in the other views.'
}
function clear() {
  linked.clearSelection()
  message.value = ''
  offer.value = undefined
}
function onDelete(ids: string[]) {
  // The demo only reports the proposal; an application would remove the tasks and recalculate the plan.
  deleteProposals.value = [...deleteProposals.value, ids]
}
function setRowsCollapsed(ids: Set<string>) {
  rowsCollapsed.value = ids
}
function setGraphCollapsed(ids: Set<string>) {
  graphCollapsed.value = ids
  bump()
  void nextTick(bump)
}

// Go to counterpart. A hidden item is explained, never replaced by another one; expanding is offered, not forced.
function reportReveal(result: RevealResult, view: 'graph' | 'timeline', taskId: string): boolean {
  if (result.status === 'revealed') {
    message.value = `Showing ${names[taskId]} in the ${view === 'graph' ? 'graph' : 'timeline'}.`
    offer.value = undefined
    return true
  }
  if (result.status === 'hidden-by-collapse' && result.proxyId) {
    message.value = `${names[taskId]} is hidden inside the collapsed ${view === 'graph' ? 'group' : 'row'} “${result.proxyId === 'cutting-cell' || result.proxyId === 'cutting' ? 'Cutting cell' : result.proxyId}”.`
    offer.value = { view, taskId, proxyId: result.proxyId }
    return false
  }
  message.value = `${names[taskId] ?? taskId} is not shown in the ${view === 'graph' ? 'graph' : 'timeline'}.`
  offer.value = undefined
  return false
}
function counterpart(view: 'graph' | 'timeline') {
  const taskId = revealTask.value || selectedTaskIds.value[0]
  if (!taskId) {
    message.value = 'Select a task, or choose one to go to.'
    offer.value = undefined
    return
  }
  const { targets } = resolveViewTargets(index, [{ kind: 'task', id: taskId }])
  const target = targets.find(item => view === 'graph' ? item.view === 'graph' && item.kind === 'node' : item.view === 'timeline' && item.kind === 'bar')
  if (!target || target.view === 'load') {
    message.value = `No ${view === 'graph' ? 'graph node' : 'timeline bar'} is known for “${names[taskId] ?? taskId}”.`
    offer.value = undefined
    return
  }
  const reveal = view === 'graph' ? graph.value?.revealNode(target.id, { focus: true }) : gantt.value?.revealBar(target.id, { focus: true })
  void reveal?.then(result => reportReveal(result, view, taskId))
}
async function expandAndShow() {
  const pending = offer.value
  if (!pending) return
  offer.value = undefined
  // Expanding is the application's decision: revealLinkedTarget asks `expand` for each collapsed ancestor, waits for the
  // render after the controlled set changed, and reveals again. Returning false here would decline and keep it hidden.
  const result = await revealLinkedTarget({
    reveal: () => pending.view === 'graph'
      ? graph.value?.revealNode(pending.taskId, { focus: true })
      : gantt.value?.revealBar(pending.taskId, { focus: true }),
    expand: proxyId => {
      if (pending.view === 'graph') setGraphCollapsed(new Set([...graphCollapsed.value].filter(id => id !== proxyId)))
      else rowsCollapsed.value = new Set([...rowsCollapsed.value].filter(id => id !== proxyId))
      return true
    },
  })
  reportReveal(result, pending.view, pending.taskId)
}
</script>

<template>
  <section class="planning-panel" aria-labelledby="linked-title" @keydown.esc="clear">
    <div class="section-head">
      <div><h2 id="linked-title">Linked planning views</h2><p>Act in any view; the others highlight the same tasks. Escape clears the selection.</p></div>
    </div>
    <div class="options linked-options" role="group" aria-label="Linked view controls">
      <label>Impact range
        <select v-model="impactDirection" aria-label="Impact direction">
          <option value="off">Off</option>
          <option value="forward">Downstream</option>
          <option value="backward">Upstream</option>
          <option value="both">Both directions</option>
        </select>
      </label>
      <label>Hop limit
        <select v-model="impactHops" aria-label="Impact hop limit" :disabled="impactDirection === 'off'">
          <option value="1">1</option><option value="2">2</option><option value="all">No limit</option>
        </select>
      </label>
      <label>Go to
        <select v-model="revealTask" aria-label="Task to go to">
          <option value="">Current selection</option>
          <option v-for="task in tasks" :key="task.id" :value="task.id">{{ names[task.id] }}</option>
          <option value="retired">Retired task (unknown)</option>
        </select>
      </label>
      <button type="button" @click="counterpart('graph')">Go to graph</button>
      <button type="button" @click="counterpart('timeline')">Go to timeline</button>
      <button type="button" @click="clear">Clear selection</button>
    </div>
    <p class="status linked-status" role="status" aria-label="Linked selection">{{ summary }}</p>
    <p class="status linked-status" role="status" aria-label="Navigation message">
      <span>{{ message }}</span>
      <button v-if="offer" type="button" @click="expandAndShow">Expand and show</button>
    </p>

    <div class="linked-graph">
      <NetworkGraph ref="graph" :nodes="network.nodes" :edges="network.edges" :groups="graphGroups" collapsible-groups
        :collapsed-group-ids="graphCollapsed" :options="{ nodeWidth: 230, nodeHeight: 56 }" :height="300" edges-selectable
        :selected-ids="graphSets.selectedNodeIds" :selected-edge-ids="graphSets.selectedEdgeIds"
        :highlighted-node-ids="highlightedNodes" :highlighted-edge-ids="highlightedEdges"
        :labels="{ region: 'Linked network diagram' }"
        @target-enter="enter" @target-leave="leave" @target-activate="activate"
        @update:collapsed-group-ids="setGraphCollapsed" @viewport-change="bump" />
      <GraphContextToolbar :graph="graph" :target="toolbarTarget" :refresh-key="refreshKey" label="Selected graph item">
        <template #default="{ target }">
          <strong v-if="target?.kind === 'node'">{{ names[target.id] }}</strong>
          <strong v-else-if="target">{{ edgeText(target.id) }}</strong>
          <button v-if="target?.kind === 'node'" type="button" @click="counterpart('timeline')">Show in timeline</button>
          <button type="button" @click="clear">Clear</button>
        </template>
      </GraphContextToolbar>
    </div>

    <GanttChart ref="gantt" :rows="rows" :bars="bars" :range="range" :dependencies="dependencies" :pixels-per-unit="64 / hour"
      :tick-steps="[hour, 2 * hour]" :row-height="46" :height="470" :load-rows="loadRows" :load-segments="loadSegments" load-selectable
      :highlighted-load-targets="highlightedLoad" :selected-load-targets="linked.load.value.selected"
      deletable multi-select :selected-ids="timelineSets.selectedBarIds" :highlighted-bar-ids="highlightedBars"
      :highlighted-dependency-ids="highlightedDependencies" :collapsed-ids="rowsCollapsed"
      :labels="{ region: 'Linked timeline' }"
      @target-enter="enter" @target-leave="leave" @target-activate="activate"
      @bars-delete="onDelete" @update:collapsed-ids="setRowsCollapsed">
      <template #row-heading>Task</template>
      <template #legend><span class="hint">Outlined bars are linked from another view and cannot be deleted from here. A red segment is an overloaded resource; select it to see the competing tasks.</span></template>
    </GanttChart>
    <p class="hint">
      <output aria-label="Delete proposals">Delete proposals: {{ deleteProposals.length }}</output>
      <span v-if="deleteProposals.length"> (last: {{ deleteProposals[deleteProposals.length - 1]!.map(id => names[id]).join(', ') }}; the demo does not apply them)</span>
    </p>
  </section>
</template>

<style scoped>
.linked-options { flex-wrap: wrap; gap: 10px 16px; margin-bottom: 8px; }
.linked-status { margin: 4px 0; display: flex; gap: 10px; align-items: center; }
.linked-graph { position: relative; margin-bottom: 12px; }
</style>
