<script setup lang="ts">
// Type-level tests of typed item data, run by `npm run typecheck` (vue-tsc). Nothing here is rendered or executed.
// A wrong slot prop or payload type fails the type check, and each `@vue-expect-error` or `@ts-expect-error` fails it
// when the line it guards compiles, for example because a type became `any` or `unknown`.
import { createApp, defineComponent, h, ref, useTemplateRef } from 'vue'
import {
  GanttChart, NetworkGraph, layoutLayeredGraph, moveTimelineRow, renderGraphSvg,
  type GanttChartExposed, type GraphCollapsedNodeData, type GraphConnection, type GraphEdge, type GraphLayout,
  type GraphLayoutFunction, type GraphNodeMove, type NetworkGraphExposed, type NetworkGroup, type NetworkNode,
  type TimelineBar, type TimelineCellEdit, type TimelineColumn, type TimelineEdit, type TimelineRow,
  type TimelineRowMove,
} from '../../src'

interface Owner { owner: string }
interface Weight { weight: number }
interface Team { team: string }
interface Cost { cost: number }
// An item type with an extra field of the application, next to `data`.
type TaskNode = NetworkNode<Owner> & { priority: 1 | 2 | 3 }
type TeamRow = TimelineRow<Team>

const nodes: TaskNode[] = [{ id: 'a', label: 'A', priority: 1, data: { owner: 'Ada' } }]
const edges: GraphEdge<Weight>[] = []
const groups: NetworkGroup[] = [{ id: 'g', label: 'Group', nodeIds: ['a'] }]
const untypedNodes: NetworkNode[] = nodes
const untypedEdges: GraphEdge[] = edges
const rows: TeamRow[] = [{ id: 'r', label: 'Row', data: { team: 'Core' } }]
const bars: TimelineBar<Cost>[] = [{ id: 'b', rowId: 'r', label: 'Bar', start: 0, end: 1, data: { cost: 3 } }]
const range = { start: 0, end: 10 }
// Unannotated array literals: the slots still see the optional fields of the base types.
const literalNodes = [{ id: 'x', label: 'X' }]
const literalRows = [{ id: 'r', label: 'Row' }]
const literalBars = [{ id: 'b', rowId: 'r', label: 'Bar', start: 0, end: 1 }]
function text(value: string | undefined) { return value }

function owner(value: Owner | undefined) { return value?.owner }
function weight(value: Weight | undefined) { return value?.weight }
function priority(value: 1 | 2 | 3) { return value }
function team(value: Team | undefined) { return value?.team }
function cost(value: Cost | undefined) { return value?.cost }
function nodeMoves(changes: GraphNodeMove[]) { return changes.length }
function connection(change: GraphConnection) { return change.from }
function edit(change: TimelineEdit) { return change.id }
function rowMove(change: TimelineRowMove) { return change.id }
function cellEdit(change: TimelineCellEdit) { return change.after }
function reason(value: string) { return value }

// Validators, callbacks and layouts receive the typed items.
const validateConnection = (change: GraphConnection, replacing?: string) => change.from !== replacing
const validateEdit = (change: TimelineEdit) => change.after.end > change.after.start
const validateCellEdit = (change: TimelineCellEdit) => change.after.length > 0
const typedLayout: GraphLayoutFunction<TaskNode, GraphEdge<Weight>> = (items, links) => {
  void [priority(items[0]!.priority), weight(links[0]?.data)]
  return layoutLayeredGraph(items, links)
}
const creatable = (row: TeamRow) => team(row.data) === 'Core'
const columns: TimelineColumn<TeamRow>[] = [
  { id: 'team', label: 'Team', width: 80, value: (row, summary) => (team(row.data) ?? '') + (summary?.count ?? ''), editable: row => row.data !== undefined },
]
// @ts-expect-error A column of other rows does not fit these rows.
const wrongColumns: TimelineColumn<TimelineRow<Cost>>[] = columns

// Template refs: inferred by vue-tsc, typed explicitly for typed data, and the instance type of earlier releases.
const graph = useTemplateRef('graph')
const chart = useTemplateRef('chart')
const typedGraph = ref<NetworkGraphExposed<TaskNode, GraphEdge<Weight>>>()
const typedChart = ref<GanttChartExposed<TeamRow, TimelineBar<Cost>>>()
const graphInstance = ref<InstanceType<typeof NetworkGraph>>()
const chartInstance = ref<InstanceType<typeof GanttChart>>()
function useRefs() {
  graph.value?.fit({ padding: 8 })
  graph.value?.exportSvg({ nodeLabel: node => node.label + priority(node.priority) + owner(node.data), edgeLabel: edge => String(weight(edge.data)) })
  chart.value?.scrollToTime(1)
  chart.value?.exportSvg({ rowLabel: row => row.label + team(row.data), barLabel: bar => bar.label + cost(bar.data) })
  typedGraph.value?.exportSvg({ nodeLabel: node => owner(node.data) ?? '' })
  typedGraph.value?.focusNode('a')
  typedChart.value?.exportSvg({ barLabel: bar => String(cost(bar.data)) })
  void typedChart.value?.fitToBars(['b'])
  graphInstance.value?.zoom(2)
  void graphInstance.value?.$el
  chartInstance.value?.cancelEdit()
  // @ts-expect-error Methods that are not exposed are not on the ref.
  graph.value?.select('a')
}

// Render functions and component registration keep working with the default item types.
const vnodes = [
  h(NetworkGraph, { nodes: untypedNodes, edges: untypedEdges }),
  h(GanttChart, { rows, bars, range }),
]
const registered = defineComponent({ components: { NetworkGraph, GanttChart } })
createApp({}).component('NetworkGraph', NetworkGraph).component('GanttChart', GanttChart)

// Core helpers return the caller's item types.
const moved: TeamRow[] = moveTimelineRow(rows, 'r', { index: 0 })
const svg = renderGraphSvg(layoutLayeredGraph(nodes, edges), nodes, edges, { nodeLabel: node => node.label + priority(node.priority) })
const layoutResult: GraphLayout = typedLayout(nodes, edges)
void [useRefs, vnodes, registered, moved, svg, layoutResult, wrongColumns]
</script>

<template>
  <NetworkGraph
    ref="graph" :nodes="nodes" :edges="edges" :layout="typedLayout" :validate-connection="validateConnection"
    @nodes-move="nodeMoves" @node-move="change => nodeMoves([change])" @connect="connection"
    @connect-rejected="(change, text) => connection(change) + reason(text)"
  >
    <template #node="{ node, box, scale }">
      <text>{{ owner(node.data) }} {{ priority(node.priority) }} {{ box.width * scale }}</text>
      <text>
        <!-- @vue-expect-error The node data is not `any`. -->
        {{ node.data?.missing }}
      </text>
    </template>
    <template #edge="{ edge, path }">
      <path :d="path" :data-weight="weight(edge.data)" />
      <!-- @vue-expect-error The edge data is not `any`. -->
      <path :d="edge.data?.missing" />
    </template>
    <template #tooltip="{ target }">
      {{ target.kind === 'node' ? owner(target.node.data) : weight(target.edge.data) }}
    </template>
  </NetworkGraph>

  <!-- With groups, collapsed proxy nodes reach the slots too. -->
  <NetworkGraph :nodes="nodes" :edges="edges" :groups="groups" collapsible-groups>
    <template #node="{ node }">
      <text v-if="node.data && 'collapsedGroup' in node.data">{{ (node.data satisfies GraphCollapsedNodeData).nodeIds.length }}</text>
      <text v-else>{{ owner(node.data) }}</text>
      <text>
        <!-- @vue-expect-error A proxy node has no `priority`. -->
        {{ priority(node.priority) }}
      </text>
    </template>
  </NetworkGraph>
  <!-- @vue-expect-error A layout for input nodes only does not accept proxy nodes. -->
  <NetworkGraph :nodes="nodes" :edges="edges" :groups="groups" :layout="typedLayout" />

  <!-- Untyped items compile as before, with `unknown` data. -->
  <NetworkGraph :nodes="untypedNodes" :edges="untypedEdges" :groups="groups" @select="id => reason(id)">
    <template #node="{ node }">
      <text>
        <!-- @vue-expect-error The data of untyped nodes is `unknown`. -->
        {{ owner(node.data) }}
      </text>
    </template>
  </NetworkGraph>

  <NetworkGraph :nodes="literalNodes" :edges="[]">
    <template #node="{ node }"><text>{{ text(node.detail) }} {{ node.tone }}</text></template>
  </NetworkGraph>
  <GanttChart :rows="literalRows" :bars="literalBars" :range="range">
    <template #row="{ row }">{{ text(row.parentId) }} {{ text(row.detail) }}</template>
    <template #bar="{ bar }">{{ bar.progress }} {{ bar.tone }}</template>
  </GanttChart>

  <GanttChart
    ref="chart" :rows="rows" :bars="bars" :range="range" :columns="columns" :creatable="creatable"
    :validate-edit="validateEdit" :validate-cell-edit="validateCellEdit"
    @edit="edit" @edits="changes => changes.map(edit)" @row-move="rowMove" @cell-edit="cellEdit"
    @edit-rejected="(change, text) => edit(change) + reason(text)"
  >
    <template #row="{ row, depth }">{{ team(row.data) }} {{ depth }}</template>
    <template #cell="{ row, column, value }">{{ team(row.data) }} {{ column.value(row) }} {{ value }}</template>
    <template #bar="{ bar, range: shown }">
      {{ cost(bar.data) }} {{ shown.start }}
      <!-- @vue-expect-error The bar data is not `any`. -->
      {{ bar.data?.missing }}
    </template>
    <template #tooltip="{ bar }">{{ cost(bar.data) }}</template>
  </GanttChart>

  <!-- @vue-expect-error The columns must fit the rows. -->
  <GanttChart :rows="rows" :bars="bars" :range="range" :columns="([] as TimelineColumn<TimelineRow<Cost>>[])" />
</template>
