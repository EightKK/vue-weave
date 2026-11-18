<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  NetworkGraph, graphSwimlaneAt, layoutSwimlaneGraph, type GraphEdge, type GraphEdgeStyle, type GraphLayoutDirection,
  type GraphLayoutFunction, type GraphNodeMove, type NetworkNode,
} from '../src'

// Opt-in example of `layoutSwimlaneGraph` and the NetworkGraph `lanes` prop: one lane per department, so hand-overs
// read as edges that cross a lane boundary. The lane order is the caller's and never changes; dragging a step into
// another lane is turned into a lane change here, in the app, with `graphSwimlaneAt`.
type Step = NetworkNode<{ lane: string }>
const lanes = [
  { id: 'purchasing', label: 'Purchasing' },
  { id: 'machining', label: 'Machining' },
  { id: 'inspection', label: 'Inspection' },
  { id: 'shipping', label: 'Shipping' },
]
const tones = { purchasing: 'amber', machining: 'blue', inspection: 'teal', shipping: 'violet' } as const
const step = (id: string, label: string, lane: keyof typeof tones): Step => ({ id, label, tone: tones[lane], data: { lane } })
const initialNodes: Step[] = [
  step('rfq', 'Request quote', 'purchasing'),
  step('order', 'Order material', 'purchasing'),
  step('receive', 'Receive material', 'purchasing'),
  step('cut', 'Cut stock', 'machining'),
  step('mill', 'Mill part', 'machining'),
  step('deburr', 'Deburr', 'machining'),
  step('measure', 'Measure', 'inspection'),
  step('final', 'Final check', 'inspection'),
]
const initialEdges: GraphEdge[] = [
  { id: 'rfq-order', from: 'rfq', to: 'order' },
  { id: 'order-receive', from: 'order', to: 'receive' },
  { id: 'receive-cut', from: 'receive', to: 'cut', label: 'hand-over' },
  { id: 'cut-mill', from: 'cut', to: 'mill' },
  { id: 'mill-measure', from: 'mill', to: 'measure', label: 'hand-over' },
  { id: 'measure-deburr', from: 'measure', to: 'deburr' },
  { id: 'deburr-final', from: 'deburr', to: 'final' },
]
const nodes = ref<Step[]>(initialNodes)
const edges = ref<GraphEdge[]>(initialEdges)
const direction = ref<GraphLayoutDirection>('LR')
const edgeStyle = ref<GraphEdgeStyle>('curve')
const avoidNodes = ref(false)
const newLane = ref('shipping')
const status = ref('Drag a step into another lane to hand it over; lanes keep their order.')
const vertical = computed(() => direction.value === 'TB' || direction.value === 'BT')

const swimlanes = computed(() => layoutSwimlaneGraph(nodes.value, edges.value, {
  lanes, laneOf: node => node.data?.lane, direction: direction.value,
}))
// A stable function that reads the computed result, so the graph lays out again whenever the result changes.
const layout: GraphLayoutFunction = () => swimlanes.value

function addStep() {
  let number = 1
  while (nodes.value.some(node => node.id === 'step-' + number)) number++
  const lane = lanes.find(item => item.id === newLane.value)!
  const previous = nodes.value[nodes.value.length - 1]
  nodes.value = [...nodes.value, step('step-' + number, 'Step ' + number, lane.id as keyof typeof tones)]
  if (previous) edges.value = [...edges.value, { id: 'flow-' + number, from: previous.id, to: 'step-' + number }]
  status.value = 'Added Step ' + number + ' to ' + lane.label + '.'
}
// The parent decides the domain rule: a step dropped on another lane changes lane, a drop outside every lane is refused.
function moveStep(change: GraphNodeMove) {
  const box = swimlanes.value.boxes.get(change.id)
  const node = nodes.value.find(item => item.id === change.id)
  if (!box || !node) return
  const lane = graphSwimlaneAt(swimlanes.value.lanes, { ...change.after, width: box.width, height: box.height })
  if (!lane) {
    status.value = node.label + ' stays in its lane: the drop was outside every lane.'
    return
  }
  if (lane.id === node.data?.lane) return
  nodes.value = nodes.value.map(item => item.id === node.id ? step(item.id, item.label, lane.id as keyof typeof tones) : item)
  status.value = node.label + ' moved to ' + lane.label + '.'
}
function reset() {
  nodes.value = initialNodes
  edges.value = initialEdges
  status.value = 'Process reset.'
}
</script>

<template>
  <section class="planning-panel" aria-labelledby="swimlane-title">
    <div class="section-head">
      <div><h2 id="swimlane-title">Process lanes</h2><p>A machining process with one lane per department; hand-overs cross lane boundaries.</p></div>
    </div>
    <div class="options swimlane-options" role="group" aria-label="Process lane options">
      <label>Flow direction
        <select v-model="direction" aria-label="Flow direction"><option>LR</option><option>RL</option><option>TB</option><option>BT</option></select>
      </label>
      <label>Lane for new step
        <select v-model="newLane" aria-label="Lane for new step"><option v-for="lane in lanes" :key="lane.id" :value="lane.id">{{ lane.label }}</option></select>
      </label>
      <button type="button" @click="addStep">Add step</button>
      <label>Edge style
        <select v-model="edgeStyle" aria-label="Process edge style">
          <option value="curve">curve</option><option value="orthogonal">orthogonal</option><option value="straight">straight</option>
        </select>
      </label>
      <label><input v-model="avoidNodes" type="checkbox"> Route around steps</label>
      <button type="button" @click="reset">Reset process</button>
    </div>
    <NetworkGraph :nodes="nodes" :edges="edges" :layout="layout" :lanes="swimlanes.lanes" :options="{ direction }" draggable show-minimap
      :edge-style="edgeStyle" :avoid-nodes="avoidNodes" :height="vertical ? 560 : 440" :labels="{ region: 'Process lane graph' }"
      @node-move="moveStep" />
    <p class="status" role="status" aria-label="Process lane status">{{ status }}</p>
  </section>
</template>

<style scoped>
.swimlane-options { flex-wrap: wrap; gap: 10px 16px; margin-bottom: 8px; }
</style>
