<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  NetworkGraph, graphSwimlaneAt, layoutSwimlaneGraph, type GraphEdge, type GraphEdgeStyle, type GraphLayoutDirection,
  type GraphLayoutFunction, type GraphNodeMove, type NetworkNode,
} from '../src'
import DemoPanel from './components/DemoPanel.vue'
import StatusLine from './components/StatusLine.vue'
import { unusedNumber } from './ids'
import { useDemoLocale } from './i18n'

const { t, labels } = useDemoLocale()

// Opt-in example of `layoutSwimlaneGraph` and the NetworkGraph `lanes` prop: one lane per department, so hand-overs
// read as edges that cross a lane boundary. The lane order is the caller's and never changes; dragging a step into
// another lane is turned into a lane change here, in the app, with `graphSwimlaneAt`.
type Step = NetworkNode<{ lane: string }>
const lanes = [
  { id: 'purchasing', label: t({ en: 'Purchasing', ja: '購買' }) },
  { id: 'machining', label: t({ en: 'Machining', ja: '機械加工' }) },
  { id: 'inspection', label: t({ en: 'Inspection', ja: '検査' }) },
  { id: 'shipping', label: t({ en: 'Shipping', ja: '出荷' }) },
]
const tones = { purchasing: 'amber', machining: 'blue', inspection: 'teal', shipping: 'violet' } as const
const step = (id: string, label: string, lane: keyof typeof tones): Step => ({ id, label, tone: tones[lane], data: { lane } })
const initialNodes: Step[] = [
  step('rfq', t({ en: 'Request quote', ja: '見積依頼' }), 'purchasing'),
  step('order', t({ en: 'Order material', ja: '材料を発注' }), 'purchasing'),
  step('receive', t({ en: 'Receive material', ja: '材料を受入' }), 'purchasing'),
  step('cut', t({ en: 'Cut stock', ja: '素材を切断' }), 'machining'),
  step('mill', t({ en: 'Mill part', ja: 'フライス加工' }), 'machining'),
  step('deburr', t({ en: 'Deburr', ja: 'バリ取り' }), 'machining'),
  step('measure', t({ en: 'Measure', ja: '測定' }), 'inspection'),
  step('final', t({ en: 'Final check', ja: '最終検査' }), 'inspection'),
]
const initialEdges: GraphEdge[] = [
  { id: 'rfq-order', from: 'rfq', to: 'order' },
  { id: 'order-receive', from: 'order', to: 'receive' },
  { id: 'receive-cut', from: 'receive', to: 'cut', label: t({ en: 'hand-over', ja: '引き渡し' }) },
  { id: 'cut-mill', from: 'cut', to: 'mill' },
  { id: 'mill-measure', from: 'mill', to: 'measure', label: t({ en: 'hand-over', ja: '引き渡し' }) },
  { id: 'measure-deburr', from: 'measure', to: 'deburr' },
  { id: 'deburr-final', from: 'deburr', to: 'final' },
]
const nodes = ref<Step[]>(initialNodes)
const edges = ref<GraphEdge[]>(initialEdges)
const direction = ref<GraphLayoutDirection>('LR')
const edgeStyle = ref<GraphEdgeStyle>('curve')
const avoidNodes = ref(false)
const newLane = ref('shipping')
const status = ref(t({ en: 'Drag a step into another lane to hand it over; lanes keep their order.', ja: '工程を別のレーンへドラッグすると担当部門が変わります。レーンの順序は変わりません。' }))
const vertical = computed(() => direction.value === 'TB' || direction.value === 'BT')

const swimlanes = computed(() => layoutSwimlaneGraph(nodes.value, edges.value, {
  lanes, laneOf: node => node.data?.lane, direction: direction.value,
}))
// A stable function that reads the computed result, so the graph lays out again whenever the result changes.
const layout: GraphLayoutFunction = () => swimlanes.value

function addStep() {
  const number = unusedNumber(nodes.value, 'step-')
  const lane = lanes.find(item => item.id === newLane.value)!
  const previous = nodes.value[nodes.value.length - 1]
  nodes.value = [...nodes.value, step('step-' + number, t({ en: 'Step ', ja: '工程 ' }) + number, lane.id as keyof typeof tones)]
  if (previous) edges.value = [...edges.value, { id: 'flow-' + number, from: previous.id, to: 'step-' + number }]
  status.value = t({ en: 'Added Step ' + number + ' to ' + lane.label + '.', ja: '工程 ' + number + ' を' + lane.label + 'に追加しました。' })
}
// The parent decides the domain rule: a step dropped on another lane changes lane, a drop outside every lane is refused.
function moveStep(change: GraphNodeMove) {
  const box = swimlanes.value.boxes.get(change.id)
  const node = nodes.value.find(item => item.id === change.id)
  if (!box || !node) return
  const lane = graphSwimlaneAt(swimlanes.value.lanes, { ...change.after, width: box.width, height: box.height })
  if (!lane) {
    status.value = t({ en: node.label + ' stays in its lane: the drop was outside every lane.', ja: node.label + ' はレーンの外に置かれたため、元のレーンに残ります。' })
    return
  }
  if (lane.id === node.data?.lane) return
  nodes.value = nodes.value.map(item => item.id === node.id ? step(item.id, item.label, lane.id as keyof typeof tones) : item)
  status.value = t({ en: node.label + ' moved to ' + lane.label + '.', ja: node.label + ' を' + lane.label + 'に移しました。' })
}
function reset() {
  nodes.value = initialNodes
  edges.value = initialEdges
  status.value = t({ en: 'Process reset.', ja: 'プロセスを初期状態に戻しました。' })
}
</script>

<template>
  <DemoPanel title-id="swimlane-title" :title="t({ en: 'Process lanes', ja: 'プロセスのスイムレーン' })" :subtitle="t({ en: 'A machining process with one lane per department; hand-overs cross lane boundaries.', ja: '部門ごとに1レーンの機械加工プロセスです。部門間の引き渡しはレーンの境界をまたぎます。' })">
    <div class="options swimlane-options" role="group" :aria-label="t({ en: 'Process lane options', ja: 'スイムレーンのオプション' })">
      <label>{{ t({ en: 'Flow direction', ja: '流れの方向' }) }}
        <select v-model="direction" :aria-label="t({ en: 'Flow direction', ja: '流れの方向' })"><option>LR</option><option>RL</option><option>TB</option><option>BT</option></select>
      </label>
      <label>{{ t({ en: 'Lane for new step', ja: '新しい工程のレーン' }) }}
        <select v-model="newLane" :aria-label="t({ en: 'Lane for new step', ja: '新しい工程のレーン' })"><option v-for="lane in lanes" :key="lane.id" :value="lane.id">{{ lane.label }}</option></select>
      </label>
      <button type="button" @click="addStep">{{ t({ en: 'Add step', ja: '工程を追加' }) }}</button>
      <label>{{ t({ en: 'Edge style', ja: '辺のスタイル' }) }}
        <select v-model="edgeStyle" :aria-label="t({ en: 'Process edge style', ja: 'プロセスの辺のスタイル' })">
          <option value="curve">{{ t({ en: 'curve', ja: '曲線' }) }}</option><option value="orthogonal">{{ t({ en: 'orthogonal', ja: '直交' }) }}</option><option value="straight">{{ t({ en: 'straight', ja: '直線' }) }}</option>
        </select>
      </label>
      <label><input v-model="avoidNodes" type="checkbox"> {{ t({ en: 'Route around steps', ja: '工程を避けて配線' }) }}</label>
      <button type="button" @click="reset">{{ t({ en: 'Reset process', ja: 'プロセスをリセット' }) }}</button>
    </div>
    <NetworkGraph :nodes="nodes" :edges="edges" :layout="layout" :lanes="swimlanes.lanes" :options="{ direction }" draggable show-minimap
      :edge-style="edgeStyle" :avoid-nodes="avoidNodes" :height="vertical ? 560 : 440" :labels="{ ...labels.graph, region: t({ en: 'Process lane graph', ja: 'スイムレーンのグラフ' }) }"
      @node-move="moveStep" />
    <StatusLine :label="t({ en: 'Process lane status', ja: 'スイムレーンの状態' })">{{ status }}</StatusLine>
  </DemoPanel>
</template>

<style scoped>
.swimlane-options { flex-wrap: wrap; gap: 10px 16px; margin-bottom: 8px; }
</style>
