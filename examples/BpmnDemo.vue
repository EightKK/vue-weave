<script setup lang="ts">
// Opt-in example of the flowchart and BPMN node shapes, the BPMN node markers and event borders, labels below the
// shape, dashed edges and swimlane pools. A purchase order process runs between two pools (BPMN participants): the
// customer, and the supplier with a sales and a warehouse lane. Sequence flows stay inside a pool; message flows
// between the pools are dashed with an open circle at the start and a hollow arrow at the end.
import { computed, ref } from 'vue'
import {
  NetworkGraph, layoutLayeredGraph, layoutSwimlaneGraph, type GraphConnection, type GraphEdge, type GraphEdgeStyle, type GraphLayout,
  type GraphLayoutFunction, type NetworkNode,
} from '../src'
import { download } from './download'
import DemoPanel from './components/DemoPanel.vue'
import StatusLine from './components/StatusLine.vue'

type Step = NetworkNode<{ lane: string }>
const lanes = [
  { id: 'customer', label: 'Customer' },
  { id: 'sales', label: 'Sales' },
  { id: 'warehouse', label: 'Warehouse' },
]
const pools = [
  { id: 'customer-pool', label: 'Customer', lanes: ['customer'] },
  { id: 'supplier-pool', label: 'Supplier', lanes: ['sales', 'warehouse'] },
]
const tones = { customer: 'teal', sales: 'blue', warehouse: 'amber' } as const
type Lane = keyof typeof tones
const event = (id: string, label: string, lane: Lane, kind: 'start' | 'intermediate' | 'end', marker?: 'message' | 'timer'): Step =>
  ({ id, label, shape: 'circle', event: kind, labelPosition: 'below', tone: tones[lane], data: { lane }, ...marker && { marker } })
const gateway = (id: string, label: string, lane: Lane, marker: 'exclusive' | 'parallel'): Step =>
  ({ id, label, shape: 'diamond', marker, labelPosition: 'below', tone: tones[lane], data: { lane } })
const task = (id: string, label: string, lane: Lane, marker?: 'user' | 'service' | 'manual'): Step =>
  ({ id, label, shape: 'rounded', tone: tones[lane], data: { lane }, ...marker && { marker } })

const initialNodes: Step[] = [
  event('need', 'Goods needed', 'customer', 'start'),
  task('order', 'Send order', 'customer', 'user'),
  event('delivery', 'Goods arrive', 'customer', 'intermediate', 'message'),
  task('pay', 'Pay invoice', 'customer', 'manual'),
  event('closed', 'Order closed', 'customer', 'end'),
  event('received', 'Order received', 'sales', 'start', 'message'),
  task('check', 'Check order', 'sales', 'user'),
  { id: 'orders', label: 'Orders', detail: 'data store', shape: 'cylinder', tone: 'blue', data: { lane: 'sales' } },
  gateway('accept', 'Accept?', 'sales', 'exclusive'),
  task('reject', 'Send rejection', 'sales', 'service'),
  event('rejected', 'Rejected', 'sales', 'end'),
  task('invoice', 'Send invoice', 'sales', 'service'),
  event('billed', 'Billed', 'sales', 'end'),
  gateway('fork', 'Fulfil', 'warehouse', 'parallel'),
  task('pick', 'Pick goods', 'warehouse', 'manual'),
  task('label', 'Print label', 'warehouse', 'service'),
  gateway('join', 'Packed', 'warehouse', 'parallel'),
  task('ship', 'Ship goods', 'warehouse', 'user'),
  event('shipped', 'Shipped', 'warehouse', 'end'),
]
const sequence = (from: string, to: string, label?: string): GraphEdge => ({ id: from + '-' + to, from, to, ...label && { label } })
// Message flows cross pools: dashed, with an open circle at the sender and a hollow arrow at the receiver.
const message = (from: string, to: string, label: string): GraphEdge =>
  ({ id: from + '-' + to, from, to, label, dashed: true, markerStart: 'circle', markerEnd: 'hollow-arrow' })
const initialEdges: GraphEdge[] = [
  sequence('need', 'order'), message('order', 'received', 'purchase order'), sequence('delivery', 'pay'), sequence('pay', 'closed'),
  sequence('received', 'check'), sequence('check', 'accept'),
  // A data association: dashed with an open arrow.
  { id: 'check-orders', from: 'check', to: 'orders', dashed: true, markerEnd: 'open-arrow' },
  sequence('accept', 'reject', 'no'), sequence('reject', 'rejected'), sequence('accept', 'fork', 'yes'),
  sequence('fork', 'pick'), sequence('fork', 'label'), sequence('pick', 'join'), sequence('label', 'join'),
  sequence('join', 'ship'), sequence('join', 'invoice'), sequence('ship', 'shipped'), sequence('invoice', 'billed'),
  message('ship', 'delivery', 'goods'), message('invoice', 'pay', 'invoice'),
]

const nodes = ref<Step[]>(initialNodes)
const edges = ref<GraphEdge[]>(initialEdges)
const edgeStyle = ref<GraphEdgeStyle>('orthogonal')
const rtl = ref(false)
const selectedId = ref<string>()
const graph = ref<InstanceType<typeof NetworkGraph>>()
const status = ref('Select a step, or connect two steps to propose a new sequence flow.')

// Events and gateways get square boxes centred where the layout put them, so circles and diamonds keep BPMN
// proportions. The orthogonal and straight edge styles route every edge from these boxes.
function squareBoxes(layout: GraphLayout, list: readonly NetworkNode[]): GraphLayout {
  const boxes = new Map(layout.boxes)
  for (const node of list) {
    const box = boxes.get(node.id)
    if (!box || (node.shape !== 'circle' && node.shape !== 'diamond')) continue
    const size = node.shape === 'circle' ? 44 : 54
    boxes.set(node.id, { ...box, x: box.x + (box.width - size) / 2, y: box.y + (box.height - size) / 2, width: size, height: size })
  }
  return { ...layout, boxes }
}
const swimlanes = computed(() => layoutSwimlaneGraph(nodes.value, edges.value, {
  lanes, pools, laneOf: node => node.data?.lane, nodeWidth: 150, nodeHeight: 58, columnGap: 46, rowGap: 40, lanePadding: 22,
  headerSize: 96,
}))
// A stable function that reads the computed result, so the graph lays out again whenever the result changes.
const layout: GraphLayoutFunction<Step> = () => squareBoxes(swimlanes.value, nodes.value)

// The parent decides: a new sequence flow stays inside one pool; between pools only message flows are allowed.
const poolOf = (id: string) => pools.find(pool => pool.lanes.includes(nodes.value.find(node => node.id === id)?.data?.lane ?? ''))?.id
function validateConnection(connection: GraphConnection) {
  if (connection.from === connection.to) return 'A step cannot follow itself.'
  if (edges.value.some(edge => edge.from === connection.from && edge.to === connection.to)) return 'That flow already exists.'
  return true
}
const label = (id: string) => nodes.value.find(node => node.id === id)?.label ?? id
function connect(connection: GraphConnection) {
  const crossing = poolOf(connection.from) !== poolOf(connection.to)
  const edge = crossing ? message(connection.from, connection.to, 'message') : sequence(connection.from, connection.to)
  edges.value = [...edges.value, edge]
  status.value = (crossing ? 'Message flow' : 'Sequence flow') + ' from ' + label(connection.from) + ' to ' + label(connection.to) + ' added.'
}
function select(id: string) {
  const node = nodes.value.find(item => item.id === id)
  if (node) status.value = 'Selected ' + node.label + '.'
}
function reset() {
  selectedId.value = undefined
  nodes.value = initialNodes
  edges.value = initialEdges
  status.value = 'Process reset.'
}
function exportSvg() {
  const svg = graph.value?.exportSvg({ title: 'Purchase order process' })
  if (!svg) return
  download(svg, 'purchase-order-process.svg')
  status.value = `Exported SVG (${svg.length} characters).`
}

// A classic flowchart with the flowchart shapes and the layered layout.
const chartNodes: NetworkNode[] = [
  { id: 'begin', label: 'Start', shape: 'stadium', tone: 'teal' },
  { id: 'read', label: 'Read order file', shape: 'parallelogram', tone: 'blue' },
  { id: 'valid', label: 'Valid?', shape: 'diamond', tone: 'violet' },
  { id: 'error', label: 'Show error', shape: 'parallelogram', tone: 'amber' },
  { id: 'total', label: 'Compute totals', tone: 'blue' },
  { id: 'store', label: 'Save to database', shape: 'cylinder', tone: 'teal' },
  { id: 'report', label: 'Print report', shape: 'document', tone: 'blue' },
  { id: 'note', label: 'Order record', shape: 'data-object', tone: 'violet' },
  { id: 'finish', label: 'End', shape: 'stadium', tone: 'teal' },
]
const chartEdges: GraphEdge[] = [
  { id: 'begin-read', from: 'begin', to: 'read' }, { id: 'read-valid', from: 'read', to: 'valid' },
  { id: 'valid-total', from: 'valid', to: 'total', label: 'yes' }, { id: 'valid-error', from: 'valid', to: 'error', label: 'no' },
  { id: 'total-store', from: 'total', to: 'store' }, { id: 'total-report', from: 'total', to: 'report' },
  { id: 'store-note', from: 'store', to: 'note', dashed: true, markerEnd: 'open-arrow' },
  { id: 'report-finish', from: 'report', to: 'finish' }, { id: 'error-finish', from: 'error', to: 'finish' },
]
const chartLayout: GraphLayoutFunction = (list, links) => layoutLayeredGraph(list, links, { direction: 'LR', nodeWidth: 150, nodeHeight: 60, columnGap: 50, rowGap: 30 })
</script>

<template>
  <DemoPanel title-id="bpmn-title" title="BPMN process" subtitle="A purchase order process between two pools, with events, gateways, task types, a data store and message flows.">
    <div class="options bpmn-options" role="group" aria-label="BPMN options">
      <label>Edge style
        <select v-model="edgeStyle" aria-label="BPMN edge style">
          <option value="orthogonal">orthogonal</option><option value="straight">straight</option>
        </select>
      </label>
      <label><input v-model="rtl" type="checkbox"> Right-to-left labels</label>
      <button type="button" @click="exportSvg">Export SVG</button>
      <button type="button" @click="reset">Reset process</button>
    </div>
    <NetworkGraph ref="graph" :nodes="nodes" :edges="edges" :layout="layout" :lanes="swimlanes.lanes" :pools="swimlanes.pools"
      :edge-style="edgeStyle" :dir="rtl ? 'rtl' : 'ltr'" connectable :validate-connection="validateConnection" show-minimap :height="560"
      :labels="{ region: 'Purchase order process' }" v-model:selected-id="selectedId" @connect="connect" @select="select"
      @connect-rejected="(_connection, reason) => status = reason" />
    <StatusLine label="BPMN status">{{ status }}</StatusLine>
    <h3 class="bpmn-heading">Flowchart</h3>
    <NetworkGraph :nodes="chartNodes" :edges="chartEdges" :layout="chartLayout" edge-style="orthogonal" :height="360"
      :labels="{ region: 'Order file flowchart' }" />
  </DemoPanel>
</template>

<style scoped>
.bpmn-options { flex-wrap: wrap; gap: 10px 16px; margin-bottom: 8px; }
.bpmn-heading { margin: 18px 0 8px; font-size: 15px; }
</style>
