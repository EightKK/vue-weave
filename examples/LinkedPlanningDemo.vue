<script setup lang="ts">
// One schedule shown as a network graph, a Gantt chart and resource load rows, linked through entity bindings.
// The view the user acts in owns the selection (`selectedIds`); the other views only get highlight props, so a linked
// item can never be deleted or moved from another view. Hover is highlight only. "Go to counterpart" reveals an item
// and handles collapsed groups and unknown targets with a visible message. The task list is a view of the
// application's own: it selects through entity references (`selectEntities`), so no view owns that selection.
import { computed, nextTick, ref, shallowRef, useTemplateRef } from 'vue'
import {
  GanttChart, NetworkGraph, buildViewBindingIndex, revealLinkedTarget, calculateResourceLoad, removeGraphElements, resolveEntityRefs, resolveLoadTargets, resolveViewTargets,
  scheduleTasks, scheduleToGraph, traverseGraph, useLinkedSelection,
  type EntityRef, type GraphDeletion, type GraphViewTarget, type LoadViewTarget, type RevealResult, type ScheduleLink, type ScheduleTask,
  type TimelineBar, type TimelineLoadSegment, type ViewBinding, type ViewTarget, type ViewTargetEvent,
} from '../src'
import GraphContextToolbar from './components/GraphContextToolbar.vue'
import ScenarioComparison from './components/ScenarioComparison.vue'
import DemoPanel from './components/DemoPanel.vue'
import { hour, origin } from './data'
import { useDemoLocale } from './i18n'

const { t, labels, isJapanese } = useDemoLocale()

const range = { start: origin, end: origin + 12 * hour }
const names: Record<string, string> = t({
  en: { prep: 'Prepare stock', cutA: 'Cut order A', cutB: 'Cut order B', inspect: 'Inspect', pack: 'Pack' },
  ja: { prep: '材料準備', cutA: '切断オーダー A', cutB: '切断オーダー B', inspect: '検査', pack: '梱包' },
})
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
const resources = [
  { id: 'cnc', label: t({ en: 'CNC cell', ja: 'CNC セル' }), capacity: 1 }, { id: 'qc', label: t({ en: 'Inspection', ja: '検査' }), capacity: 1 },
  { id: 'dispatch', label: t({ en: 'Packing', ja: '梱包' }), capacity: 1 },
]
const cuttingCell = t({ en: 'Cutting cell', ja: '切断セル' })
const assignments = [
  { resourceId: 'cnc', taskId: 'cutA' }, { resourceId: 'cnc', taskId: 'cutB' },
  { resourceId: 'qc', taskId: 'inspect' }, { resourceId: 'dispatch', taskId: 'pack' },
]
const plan = scheduleTasks({ range, tasks, dependencies })
if (!plan.ok) throw new Error('The linked demo schedule must be feasible')

// Japanese node details for scheduleToGraph; English pages keep its defaults (ES, EF, Float and hours).
const pertText = isJapanese.value
  ? { labels: { earlyStart: '最早開始', earlyFinish: '最早終了', float: '余裕' }, formatDuration: (value: number) => value / hour + ' 時間' }
  : {}
const network = scheduleToGraph(plan, dependencies, { label: id => names[id]!, formatTime: time => new Date(time).toISOString().slice(11, 16), ...pertText })
const rows = [
  { id: 'prep', label: names.prep! }, { id: 'cutting', label: cuttingCell },
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
// Plan scenario comparison (opt-in): a separate panel with its own copy of this plan, see ScenarioComparison.vue.
const scenariosOpen = ref(false)

// Time range exploration (opt-in): the bars worked on in [start, end) highlight their tasks in every view, and the
// chosen traversal adds related tasks, shown in the graph through `relatedIds`. Display only: nothing is selected.
const rangeEnabled = ref(false)
const rangeStart = ref('10:30')
const rangeEnd = ref('11:30')
const rangeResource = ref('')
const rangeRelation = ref<'active' | 'successors' | 'predecessors' | 'neighbours'>('active')
const clockTime = (text: string) => {
  const match = /^(\d\d):(\d\d)$/.exec(text)
  return match ? Date.UTC(2026, 10, 9, Number(match[1]), Number(match[2])) : Number.NaN
}
const rangeError = computed(() => {
  if (!rangeEnabled.value) return ''
  const start = clockTime(rangeStart.value), end = clockTime(rangeEnd.value)
  if (!Number.isFinite(start) || !Number.isFinite(end)) return t({ en: 'Enter a start and an end time.', ja: '開始と終了の時刻を入力してください。' })
  return end < start ? t({ en: 'The range end is before its start.', ja: '範囲の終了が開始より前です。' }) : ''
})
const timeRange = computed(() => {
  if (!rangeEnabled.value || rangeError.value) return undefined
  const traversal = { active: undefined, successors: { direction: 'forward' }, predecessors: { direction: 'backward' }, neighbours: { direction: 'both', maxHops: 1 } } as const
  return {
    range: { start: clockTime(rangeStart.value), end: clockTime(rangeEnd.value) },
    bars,
    rowIds: rangeResource.value ? assignments.filter(item => item.resourceId === rangeResource.value).map(item => item.taskId) : undefined,
    graph: network,
    traversal: traversal[rangeRelation.value],
  }
})
const linked = useLinkedSelection({ bindings, timeRange })
const rangeSummary = computed(() => {
  if (!rangeEnabled.value) return t({ en: 'Time range off.', ja: '時間範囲はオフです。' })
  if (rangeError.value) return rangeError.value
  const result = linked.timeRange.value
  if (!result) return ''
  const taskNames = (entities: readonly EntityRef[]) => entities.filter(entity => entity.kind === 'task').map(entity => names[entity.id]).join(t({ en: ', ', ja: '、' }))
  const active = taskNames(result.activeEntities)
  const related = taskNames(result.relatedEntities)
  if (isJapanese.value) return `${rangeStart.value}–${rangeEnd.value} に作業中: ${active || 'なし'}。` + (rangeRelation.value === 'active' ? '' : `関連: ${related || 'なし'}。`)
  return `Active ${rangeStart.value}–${rangeEnd.value}: ${active || 'none'}.` + (rangeRelation.value === 'active' ? '' : ` Related: ${related || 'none'}.`)
})

const graph = useTemplateRef<InstanceType<typeof NetworkGraph>>('graph')
const gantt = useTemplateRef<InstanceType<typeof GanttChart>>('gantt')
const graphCollapsed = ref<ReadonlySet<string>>(new Set())
const rowsCollapsed = ref<ReadonlySet<string>>(new Set())
const refreshKey = ref(0)
const message = ref('')
const offer = ref<{ view: 'graph' | 'timeline'; taskId: string; proxyId: string } | undefined>()
const revealTask = ref('')
const deleteProposals = ref<string[][]>([])
// The graph's own delete flow: Delete on a selected node or edge proposes a deletion and this view applies it. Only the
// graph drawing changes; the schedule, the timeline and the bindings stay as they are.
const graphNodes = shallowRef(network.nodes)
const graphEdges = shallowRef(network.edges)
const graphGroups = computed(() => [{ id: 'cutting-cell', label: cuttingCell, nodeIds: ['cutA', 'cutB'].filter(id => graphNodes.value.some(node => node.id === id)) }])
function onGraphDelete(deletion: GraphDeletion) {
  const next = removeGraphElements(graphNodes.value, graphEdges.value, deletion)
  graphNodes.value = next.nodes
  graphEdges.value = next.edges
  bump()
  void nextTick(bump)
}

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
  return dependency ? t({ en: `${names[dependency.from]} to ${names[dependency.to]}`, ja: `${names[dependency.from]} → ${names[dependency.to]}` }) : id
}

const summary = computed(() => {
  const selected = linked.selectedEntities.value
  if (!selected.length && !linked.hoveredEntities.value.length) return t({ en: 'Nothing selected. Select a task in any view.', ja: '何も選択されていません。どのビューでもタスクを選べます。' })
  const text = (entities: readonly EntityRef[]) => entities.map(entity => entity.kind === 'task' ? names[entity.id] : edgeText(entity.id)).join(t({ en: ', ', ja: '、' }))
  const parts = []
  const source = linked.owner.value ?? linked.selectionSource.value
  if (selected.length) parts.push(t({ en: `Selected in ${source}: ${text(selected)}`, ja: `${source} で選択: ${text(selected)}` }))
  if (linked.hoveredEntities.value.length) parts.push(t({ en: `Hovering: ${text(linked.hoveredEntities.value)}`, ja: `ポインター位置: ${text(linked.hoveredEntities.value)}` }))
  const reached = new Set(impactTargets.value.flatMap(target => target.view === 'timeline' && target.kind === 'bar' ? [target.id] : [])).size
  if (impactTargets.value.length) parts.push(t({ en: `Impact range reaches ${reached} tasks`, ja: `影響範囲は ${reached} タスクに及びます` }))
  return parts.join(t({ en: '. ', ja: '。' }))
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
  if (unknown.length && event.target.view !== 'graph') message.value = t({ en: 'That item has no counterpart in the other views.', ja: 'その項目には他のビューに対応するものがありません。' })
}
// The application's own task list selects by entity and shows every selection, whichever view made it. Echoing the same
// selection back changes nothing; clicking the task the list selected again clears it with an empty input.
const listSelectedIds = computed(() => new Set(selectedTaskIds.value))
function selectFromList(taskId: string) {
  message.value = ''
  offer.value = undefined
  const alone = linked.selectionSource.value === 'task list' && listSelectedIds.value.size === 1 && listSelectedIds.value.has(taskId)
  linked.selectEntities(alone ? [] : [{ kind: 'task', id: taskId }], { source: 'task list' })
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
    message.value = t({ en: `Showing ${names[taskId]} in the ${view === 'graph' ? 'graph' : 'timeline'}.`, ja: `${view === 'graph' ? 'グラフ' : 'タイムライン'}で ${names[taskId]} を表示しています。` })
    offer.value = undefined
    return true
  }
  if (result.status === 'hidden-by-collapse' && result.proxyId) {
    const proxy = result.proxyId === 'cutting-cell' || result.proxyId === 'cutting' ? cuttingCell : result.proxyId
    message.value = t({
      en: `${names[taskId]} is hidden inside the collapsed ${view === 'graph' ? 'group' : 'row'} “${proxy}”.`,
      ja: `${names[taskId]} は折りたたまれた${view === 'graph' ? 'グループ' : '行'}「${proxy}」の中に隠れています。`,
    })
    offer.value = { view, taskId, proxyId: result.proxyId }
    return false
  }
  message.value = t({ en: `${names[taskId] ?? taskId} is not shown in the ${view === 'graph' ? 'graph' : 'timeline'}.`, ja: `${names[taskId] ?? taskId} は${view === 'graph' ? 'グラフ' : 'タイムライン'}に表示されていません。` })
  offer.value = undefined
  return false
}
function counterpart(view: 'graph' | 'timeline') {
  const taskId = revealTask.value || selectedTaskIds.value[0]
  if (!taskId) {
    message.value = t({ en: 'Select a task, or choose one to go to.', ja: 'タスクを選ぶか、移動先を選んでください。' })
    offer.value = undefined
    return
  }
  const { targets } = resolveViewTargets(index, [{ kind: 'task', id: taskId }])
  const target = targets.find(item => view === 'graph' ? item.view === 'graph' && item.kind === 'node' : item.view === 'timeline' && item.kind === 'bar')
  if (!target || target.view === 'load') {
    message.value = t({ en: `No ${view === 'graph' ? 'graph node' : 'timeline bar'} is known for “${names[taskId] ?? taskId}”.`, ja: `「${names[taskId] ?? taskId}」に対応する${view === 'graph' ? 'グラフのノード' : 'タイムラインのバー'}はありません。` })
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
  <DemoPanel title-id="linked-title" :title="t({ en: 'Linked planning views', ja: '連動する計画ビュー' })" :subtitle="t({ en: 'Act in any view; the others highlight the same tasks. Escape clears the selection.', ja: 'どのビューで操作しても、他のビューが同じタスクを強調表示します。Escape で選択を解除します。' })" @keydown.esc="clear">
    <div class="options linked-options" role="group" :aria-label="t({ en: 'Linked view controls', ja: '連動ビューの操作' })">
      <label>{{ t({ en: 'Impact range', ja: '影響範囲' }) }}
        <select v-model="impactDirection" :aria-label="t({ en: 'Impact direction', ja: '影響の方向' })">
          <option value="off">{{ t({ en: 'Off', ja: 'オフ' }) }}</option>
          <option value="forward">{{ t({ en: 'Downstream', ja: '後続' }) }}</option>
          <option value="backward">{{ t({ en: 'Upstream', ja: '先行' }) }}</option>
          <option value="both">{{ t({ en: 'Both directions', ja: '両方向' }) }}</option>
        </select>
      </label>
      <label>{{ t({ en: 'Hop limit', ja: 'ホップ数の上限' }) }}
        <select v-model="impactHops" :aria-label="t({ en: 'Impact hop limit', ja: '影響のホップ数の上限' })" :disabled="impactDirection === 'off'">
          <option value="1">1</option><option value="2">2</option><option value="all">{{ t({ en: 'No limit', ja: '上限なし' }) }}</option>
        </select>
      </label>
      <label>{{ t({ en: 'Go to', ja: '移動先' }) }}
        <select v-model="revealTask" :aria-label="t({ en: 'Task to go to', ja: '移動先のタスク' })">
          <option value="">{{ t({ en: 'Current selection', ja: '現在の選択' }) }}</option>
          <option v-for="task in tasks" :key="task.id" :value="task.id">{{ names[task.id] }}</option>
          <option value="retired">{{ t({ en: 'Retired task (unknown)', ja: '廃止したタスク(不明)' }) }}</option>
        </select>
      </label>
      <button type="button" @click="counterpart('graph')">{{ t({ en: 'Go to graph', ja: 'グラフへ移動' }) }}</button>
      <button type="button" @click="counterpart('timeline')">{{ t({ en: 'Go to timeline', ja: 'タイムラインへ移動' }) }}</button>
      <button type="button" @click="clear">{{ t({ en: 'Clear selection', ja: '選択を解除' }) }}</button>
    </div>
    <div class="options linked-options" role="group" :aria-label="t({ en: 'Time range controls', ja: '時間範囲の操作' })">
      <label><input v-model="rangeEnabled" type="checkbox"> {{ t({ en: 'Explore a time range', ja: '時間範囲を調べる' }) }}</label>
      <label>{{ t({ en: 'From', ja: '開始' }) }} <input v-model="rangeStart" type="time" :aria-label="t({ en: 'Range start', ja: '範囲の開始' })" :disabled="!rangeEnabled"></label>
      <label>{{ t({ en: 'To', ja: '終了' }) }} <input v-model="rangeEnd" type="time" :aria-label="t({ en: 'Range end', ja: '範囲の終了' })" :disabled="!rangeEnabled"></label>
      <label>{{ t({ en: 'Resource', ja: 'リソース' }) }}
        <select v-model="rangeResource" :aria-label="t({ en: 'Range resource', ja: '範囲のリソース' })" :disabled="!rangeEnabled">
          <option value="">{{ t({ en: 'All rows', ja: 'すべての行' }) }}</option>
          <option v-for="resource in resources" :key="resource.id" :value="resource.id">{{ resource.label }}</option>
        </select>
      </label>
      <label>{{ t({ en: 'Show', ja: '表示' }) }}
        <select v-model="rangeRelation" :aria-label="t({ en: 'Range relation', ja: '範囲の関係' })" :disabled="!rangeEnabled">
          <option value="active">{{ t({ en: 'Active only', ja: '作業中のみ' }) }}</option>
          <option value="successors">{{ t({ en: 'With successors', ja: '後続も含む' }) }}</option>
          <option value="predecessors">{{ t({ en: 'With predecessors', ja: '先行も含む' }) }}</option>
          <option value="neighbours">{{ t({ en: 'With direct neighbours', ja: '直接の隣接も含む' }) }}</option>
        </select>
      </label>
    </div>
    <p class="status linked-status" role="status" :aria-label="t({ en: 'Time range result', ja: '時間範囲の結果' })">{{ rangeSummary }}</p>
    <p class="status linked-status" role="status" :aria-label="t({ en: 'Linked selection', ja: '連動した選択' })">{{ summary }}</p>
    <p class="status linked-status" role="status" :aria-label="t({ en: 'Navigation message', ja: '移動のメッセージ' })">
      <span>{{ message }}</span>
      <button v-if="offer" type="button" @click="expandAndShow">{{ t({ en: 'Expand and show', ja: '展開して表示' }) }}</button>
    </p>

    <ul class="linked-task-list" :aria-label="t({ en: 'Task list', ja: 'タスクの一覧' })">
      <li v-for="task in tasks" :key="task.id">
        <button type="button" :aria-pressed="listSelectedIds.has(task.id)" @click="selectFromList(task.id)">{{ names[task.id] }}</button>
      </li>
    </ul>

    <div class="linked-graph">
      <NetworkGraph ref="graph" :nodes="graphNodes" :edges="graphEdges" :groups="graphGroups" collapsible-groups deletable
        :collapsed-group-ids="graphCollapsed" :options="{ nodeWidth: 230, nodeHeight: 56 }" :height="300" edges-selectable
        :selected-ids="graphSets.selectedNodeIds" :selected-edge-ids="graphSets.selectedEdgeIds"
        :highlighted-node-ids="highlightedNodes" :highlighted-edge-ids="highlightedEdges" :related-ids="graphSets.relatedNodeIds"
        :labels="{ ...labels.graph, region: t({ en: 'Linked network diagram', ja: '連動するネットワーク図' }) }"
        @target-enter="enter" @target-leave="leave" @target-activate="activate"
        @update:collapsed-group-ids="setGraphCollapsed" @viewport-change="bump" @delete="onGraphDelete" />
      <GraphContextToolbar :graph="graph" :target="toolbarTarget" :refresh-key="refreshKey" :label="t({ en: 'Selected graph item', ja: '選択中のグラフの項目' })">
        <template #default="{ target }">
          <strong v-if="target?.kind === 'node'">{{ names[target.id] }}</strong>
          <strong v-else-if="target">{{ edgeText(target.id) }}</strong>
          <button v-if="target?.kind === 'node'" type="button" @click="counterpart('timeline')">{{ t({ en: 'Show in timeline', ja: 'タイムラインで表示' }) }}</button>
          <button type="button" @click="clear">{{ t({ en: 'Clear', ja: '解除' }) }}</button>
        </template>
      </GraphContextToolbar>
    </div>

    <GanttChart ref="gantt" :rows="rows" :bars="bars" :range="range" :dependencies="dependencies" :pixels-per-unit="64 / hour"
      :tick-steps="[hour, 2 * hour]" :row-height="46" :height="470" :load-rows="loadRows" :load-segments="loadSegments" load-selectable
      :highlighted-load-targets="highlightedLoad" :selected-load-targets="linked.load.value.selected"
      deletable multi-select :selected-ids="timelineSets.selectedBarIds" :highlighted-bar-ids="highlightedBars"
      :highlighted-dependency-ids="highlightedDependencies" :collapsed-ids="rowsCollapsed"
      :labels="{ ...labels.gantt, region: t({ en: 'Linked timeline', ja: '連動するタイムライン' }) }"
      @target-enter="enter" @target-leave="leave" @target-activate="activate"
      @bars-delete="onDelete" @update:collapsed-ids="setRowsCollapsed">
      <template #row-heading>{{ t({ en: 'Task', ja: 'タスク' }) }}</template>
      <template #legend><span class="hint">{{ t({ en: 'Outlined bars are linked from another view and cannot be deleted from here. A red segment is an overloaded resource; select it to see the competing tasks. A time range highlights the tasks worked on in it; related tasks are marked in the graph only.', ja: '枠線だけのバーは他のビューから連動したもので、ここからは削除できません。赤い区間は過負荷のリソースで、選ぶと競合するタスクを表示します。時間範囲はその間に作業するタスクを強調表示し、関連するタスクはグラフにだけ示します。' }) }}</span></template>
    </GanttChart>
    <p class="hint">
      <output :aria-label="t({ en: 'Graph tasks', ja: 'グラフのタスク' })">{{ t({ en: 'Graph tasks: ', ja: 'グラフのタスク: ' }) }}{{ graphNodes.length }}</output>
    </p>
    <p class="hint">
      <output :aria-label="t({ en: 'Delete proposals', ja: '削除の提案' })">{{ t({ en: 'Delete proposals: ', ja: '削除の提案: ' }) }}{{ deleteProposals.length }}</output>
      <span v-if="deleteProposals.length">{{ t({
        en: ` (last: ${deleteProposals[deleteProposals.length - 1]!.map(id => names[id]).join(', ')}; the demo does not apply them)`,
        ja: `(最後: ${deleteProposals[deleteProposals.length - 1]!.map(id => names[id]).join('、')}。このデモは適用しません)`,
      }) }}</span>
    </p>
    <p class="hint"><label><input v-model="scenariosOpen" type="checkbox"> {{ t({ en: 'Compare plan scenarios', ja: '計画のシナリオを比較' }) }}</label></p>
    <ScenarioComparison v-if="scenariosOpen" />
  </DemoPanel>
</template>

<style scoped>
.linked-options { flex-wrap: wrap; gap: 10px 16px; margin-bottom: 8px; }
.linked-status { margin: 4px 0; display: flex; gap: 10px; align-items: center; }
.linked-graph { position: relative; margin-bottom: 12px; }
.linked-task-list { display: flex; flex-wrap: wrap; gap: 6px; margin: 4px 0 10px; padding: 0; list-style: none; }
.linked-task-list button[aria-pressed='true'] { font-weight: 600; outline: 2px solid currentColor; }
</style>
