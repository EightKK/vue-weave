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
import { useDemoLocale } from './i18n'

const { t, labels } = useDemoLocale()

type Step = NetworkNode<{ lane: string }>
const lanes = [
  { id: 'customer', label: t({ en: 'Customer', ja: '顧客' }) },
  { id: 'sales', label: t({ en: 'Sales', ja: '営業' }) },
  { id: 'warehouse', label: t({ en: 'Warehouse', ja: '倉庫' }) },
]
const pools = [
  { id: 'customer-pool', label: t({ en: 'Customer', ja: '顧客' }), lanes: ['customer'] },
  { id: 'supplier-pool', label: t({ en: 'Supplier', ja: '仕入先' }), lanes: ['sales', 'warehouse'] },
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
  event('need', t({ en: 'Goods needed', ja: '商品が必要' }), 'customer', 'start'),
  task('order', t({ en: 'Send order', ja: '注文を送る' }), 'customer', 'user'),
  event('delivery', t({ en: 'Goods arrive', ja: '商品の到着' }), 'customer', 'intermediate', 'message'),
  task('pay', t({ en: 'Pay invoice', ja: '請求書を支払う' }), 'customer', 'manual'),
  event('closed', t({ en: 'Order closed', ja: '注文完了' }), 'customer', 'end'),
  event('received', t({ en: 'Order received', ja: '注文受付' }), 'sales', 'start', 'message'),
  task('check', t({ en: 'Check order', ja: '注文を確認' }), 'sales', 'user'),
  { id: 'orders', label: t({ en: 'Orders', ja: '注文' }), detail: t({ en: 'data store', ja: 'データストア' }), shape: 'cylinder', tone: 'blue', data: { lane: 'sales' } },
  gateway('accept', t({ en: 'Accept?', ja: '受注する?' }), 'sales', 'exclusive'),
  task('reject', t({ en: 'Send rejection', ja: '断りを送る' }), 'sales', 'service'),
  event('rejected', t({ en: 'Rejected', ja: '受注せず' }), 'sales', 'end'),
  task('invoice', t({ en: 'Send invoice', ja: '請求書を送る' }), 'sales', 'service'),
  event('billed', t({ en: 'Billed', ja: '請求済み' }), 'sales', 'end'),
  gateway('fork', t({ en: 'Fulfil', ja: '出荷準備' }), 'warehouse', 'parallel'),
  task('pick', t({ en: 'Pick goods', ja: 'ピッキング' }), 'warehouse', 'manual'),
  task('label', t({ en: 'Print label', ja: 'ラベル印刷' }), 'warehouse', 'service'),
  gateway('join', t({ en: 'Packed', ja: '梱包完了' }), 'warehouse', 'parallel'),
  task('ship', t({ en: 'Ship goods', ja: '商品を出荷' }), 'warehouse', 'user'),
  event('shipped', t({ en: 'Shipped', ja: '出荷済み' }), 'warehouse', 'end'),
]
const sequence = (from: string, to: string, label?: string): GraphEdge => ({ id: from + '-' + to, from, to, ...label && { label } })
// Message flows cross pools: dashed, with an open circle at the sender and a hollow arrow at the receiver.
const message = (from: string, to: string, label: string): GraphEdge =>
  ({ id: from + '-' + to, from, to, label, dashed: true, markerStart: 'circle', markerEnd: 'hollow-arrow' })
const initialEdges: GraphEdge[] = [
  sequence('need', 'order'), message('order', 'received', t({ en: 'purchase order', ja: '発注書' })), sequence('delivery', 'pay'), sequence('pay', 'closed'),
  sequence('received', 'check'), sequence('check', 'accept'),
  // A data association: dashed with an open arrow.
  { id: 'check-orders', from: 'check', to: 'orders', dashed: true, markerEnd: 'open-arrow' },
  sequence('accept', 'reject', t({ en: 'no', ja: 'いいえ' })), sequence('reject', 'rejected'), sequence('accept', 'fork', t({ en: 'yes', ja: 'はい' })),
  sequence('fork', 'pick'), sequence('fork', 'label'), sequence('pick', 'join'), sequence('label', 'join'),
  sequence('join', 'ship'), sequence('join', 'invoice'), sequence('ship', 'shipped'), sequence('invoice', 'billed'),
  message('ship', 'delivery', t({ en: 'goods', ja: '商品' })), message('invoice', 'pay', t({ en: 'invoice', ja: '請求書' })),
]

const nodes = ref<Step[]>(initialNodes)
const edges = ref<GraphEdge[]>(initialEdges)
const edgeStyle = ref<GraphEdgeStyle>('orthogonal')
const rtl = ref(false)
const selectedId = ref<string>()
const graph = ref<InstanceType<typeof NetworkGraph>>()
const status = ref(t({ en: 'Select a step, or connect two steps to propose a new sequence flow.', ja: 'ステップを選ぶか、2つのステップをつないで新しいシーケンスフローを提案してください。' }))

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
  if (connection.from === connection.to) return t({ en: 'A step cannot follow itself.', ja: 'ステップを自分自身の後に続けることはできません。' })
  if (edges.value.some(edge => edge.from === connection.from && edge.to === connection.to)) return t({ en: 'That flow already exists.', ja: 'そのフローはすでにあります。' })
  return true
}
const label = (id: string) => nodes.value.find(node => node.id === id)?.label ?? id
function connect(connection: GraphConnection) {
  const crossing = poolOf(connection.from) !== poolOf(connection.to)
  const edge = crossing ? message(connection.from, connection.to, t({ en: 'message', ja: 'メッセージ' })) : sequence(connection.from, connection.to)
  edges.value = [...edges.value, edge]
  status.value = t({
    en: (crossing ? 'Message flow' : 'Sequence flow') + ' from ' + label(connection.from) + ' to ' + label(connection.to) + ' added.',
    ja: label(connection.from) + ' から ' + label(connection.to) + ' への' + (crossing ? 'メッセージフロー' : 'シーケンスフロー') + 'を追加しました。',
  })
}
function select(id: string) {
  const node = nodes.value.find(item => item.id === id)
  if (node) status.value = t({ en: 'Selected ' + node.label + '.', ja: node.label + ' を選択しました。' })
}
// Escape first cancels a gesture in flight (a drag, a connection or a box selection); only an Escape without one
// clears the selection. The graph reports every gesture as a start and an end, and the wrapper's capture listener
// reads the count before the graph's own Escape handler ends the gesture.
const gesture = { count: 0, cancelling: false }
// A click on the empty canvas or Escape in the graph clears the selection.
function clearSelection() {
  if (selectedId.value === undefined) return
  selectedId.value = undefined
  status.value = t({ en: 'Selection cleared.', ja: '選択を解除しました。' })
}
function reset() {
  selectedId.value = undefined
  nodes.value = initialNodes
  edges.value = initialEdges
  status.value = t({ en: 'Process reset.', ja: 'プロセスを初期状態に戻しました。' })
}
function exportSvg() {
  const svg = graph.value?.exportSvg({ title: t({ en: 'Purchase order process', ja: '発注プロセス' }) })
  if (!svg) return
  download(svg, 'purchase-order-process.svg')
  status.value = t({ en: `Exported SVG (${svg.length} characters).`, ja: `SVG を出力しました(${svg.length} 文字)。` })
}

// A classic flowchart with the flowchart shapes and the layered layout.
const chartNodes: NetworkNode[] = [
  { id: 'begin', label: t({ en: 'Start', ja: '開始' }), shape: 'stadium', tone: 'teal' },
  { id: 'read', label: t({ en: 'Read order file', ja: '注文ファイルを読む' }), shape: 'parallelogram', tone: 'blue' },
  { id: 'valid', label: t({ en: 'Valid?', ja: '正しい?' }), shape: 'diamond', tone: 'violet' },
  { id: 'error', label: t({ en: 'Show error', ja: 'エラーを表示' }), shape: 'parallelogram', tone: 'amber' },
  { id: 'total', label: t({ en: 'Compute totals', ja: '合計を計算' }), tone: 'blue' },
  { id: 'store', label: t({ en: 'Save to database', ja: 'データベースに保存' }), shape: 'cylinder', tone: 'teal' },
  { id: 'report', label: t({ en: 'Print report', ja: 'レポートを印刷' }), shape: 'document', tone: 'blue' },
  { id: 'note', label: t({ en: 'Order record', ja: '注文記録' }), shape: 'data-object', tone: 'violet' },
  { id: 'finish', label: t({ en: 'End', ja: '終了' }), shape: 'stadium', tone: 'teal' },
]
const chartEdges: GraphEdge[] = [
  { id: 'begin-read', from: 'begin', to: 'read' }, { id: 'read-valid', from: 'read', to: 'valid' },
  { id: 'valid-total', from: 'valid', to: 'total', label: t({ en: 'yes', ja: 'はい' }) }, { id: 'valid-error', from: 'valid', to: 'error', label: t({ en: 'no', ja: 'いいえ' }) },
  { id: 'total-store', from: 'total', to: 'store' }, { id: 'total-report', from: 'total', to: 'report' },
  { id: 'store-note', from: 'store', to: 'note', dashed: true, markerEnd: 'open-arrow' },
  { id: 'report-finish', from: 'report', to: 'finish' }, { id: 'error-finish', from: 'error', to: 'finish' },
]
const chartLayout: GraphLayoutFunction = (list, links) => layoutLayeredGraph(list, links, { direction: 'LR', nodeWidth: 150, nodeHeight: 60, columnGap: 50, rowGap: 30 })
</script>

<template>
  <DemoPanel title-id="bpmn-title" :title="t({ en: 'BPMN process', ja: 'BPMN プロセス' })" :subtitle="t({ en: 'A purchase order process between two pools, with events, gateways, task types, a data store and message flows.', ja: '2つのプールにまたがる発注プロセスです。イベント、ゲートウェイ、タスクの種類、データストア、メッセージフローを含みます。' })">
    <div class="options bpmn-options" role="group" :aria-label="t({ en: 'BPMN options', ja: 'BPMN のオプション' })">
      <label>{{ t({ en: 'Edge style', ja: '辺のスタイル' }) }}
        <select v-model="edgeStyle" :aria-label="t({ en: 'BPMN edge style', ja: 'BPMN の辺のスタイル' })">
          <option value="orthogonal">{{ t({ en: 'orthogonal', ja: '直交' }) }}</option><option value="straight">{{ t({ en: 'straight', ja: '直線' }) }}</option>
        </select>
      </label>
      <label><input v-model="rtl" type="checkbox"> {{ t({ en: 'Right-to-left labels', ja: '右から左のラベル' }) }}</label>
      <button type="button" @click="exportSvg">{{ t({ en: 'Export SVG', ja: 'SVG で出力' }) }}</button>
      <button type="button" @click="reset">{{ t({ en: 'Reset process', ja: 'プロセスをリセット' }) }}</button>
    </div>
    <div @keydown.esc.capture="gesture.cancelling = gesture.count > 0" @keydown.esc="gesture.cancelling || clearSelection()">
      <NetworkGraph ref="graph" :nodes="nodes" :edges="edges" :layout="layout" :lanes="swimlanes.lanes" :pools="swimlanes.pools"
        :edge-style="edgeStyle" :dir="rtl ? 'rtl' : 'ltr'" connectable :validate-connection="validateConnection" show-minimap :height="560"
        :labels="{ ...labels.graph, region: t({ en: 'Purchase order process', ja: '発注プロセス' }) }" v-model:selected-id="selectedId" @connect="connect" @select="select"
        @connect-rejected="(_connection, reason) => status = reason" @background-click="clearSelection" @gesture-start="gesture.count++" @gesture-end="gesture.count--" />
    </div>
    <StatusLine :label="t({ en: 'BPMN status', ja: 'BPMN の状態' })">{{ status }}</StatusLine>
    <h3 class="bpmn-heading">{{ t({ en: 'Flowchart', ja: 'フローチャート' }) }}</h3>
    <NetworkGraph :nodes="chartNodes" :edges="chartEdges" :layout="chartLayout" edge-style="orthogonal" :height="360"
      :labels="{ ...labels.graph, region: t({ en: 'Order file flowchart', ja: '注文ファイルのフローチャート' }) }" />
  </DemoPanel>
</template>

<style scoped>
.bpmn-options { flex-wrap: wrap; gap: 10px 16px; margin-bottom: 8px; }
.bpmn-heading { margin: 18px 0 8px; font-size: 15px; }
</style>
