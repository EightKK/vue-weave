<script setup lang="ts">
// A process diagram drawn with the default renderer only (no node or edge slots). Every rendering feature has a job:
// node shapes tell steps, decisions, data stores and terminals apart; edge markers tell control flow from data flow;
// request/response pairs show what `parallelEdgeSpacing` does; one loop-back edge routes itself orthogonally.
import { computed, ref } from 'vue'
import { NetworkGraph, type GraphEdge, type GraphEdgeStyle, type GraphNodeSize, type GraphPoint, type NetworkNode } from '../src'
import { download, imageSize } from './download'
import DemoPanel from './components/DemoPanel.vue'
import StatusLine from './components/StatusLine.vue'
import { useDemoLocale } from './i18n'

const { t, labels } = useDemoLocale()

const nodes: NetworkNode[] = [
  { id: 'start', label: t({ en: 'Order placed', ja: '注文受付' }), shape: 'ellipse', tone: 'teal' },
  { id: 'validate', label: t({ en: 'Validate order', ja: '注文を確認' }), shape: 'box', tone: 'blue' },
  { id: 'stock', label: t({ en: 'In stock?', ja: '在庫あり?' }), shape: 'diamond', tone: 'violet' },
  { id: 'inventory', label: t({ en: 'Inventory', ja: '在庫' }), detail: t({ en: 'data store', ja: 'データストア' }), shape: 'hexagon', tone: 'teal' },
  { id: 'reserve', label: t({ en: 'Reserve items', ja: '品目を引当' }), shape: 'box', tone: 'blue' },
  { id: 'backorder', label: t({ en: 'Back-order', ja: '入荷待ち' }), shape: 'box', tone: 'violet' },
  { id: 'pay', label: t({ en: 'Charge payment', ja: '決済' }), shape: 'box', tone: 'blue' },
  { id: 'ship', label: t({ en: 'Ship order', ja: '出荷' }), shape: 'box', tone: 'blue' },
  { id: 'package', label: t({ en: 'Packages', ja: '梱包' }), detail: t({ en: 'data store', ja: 'データストア' }), shape: 'hexagon', tone: 'teal' },
  { id: 'done', label: t({ en: 'Delivered', ja: '配達済み' }), shape: 'ellipse', tone: 'teal' },
  { id: 'cancelled', label: t({ en: 'Cancelled', ja: 'キャンセル' }), shape: 'ellipse', tone: 'violet' },
]

// Placed by hand, like a drawn diagram: the main flow runs left to right, the data stores sit above the steps they talk
// to (the request/response pair with Inventory runs straight up and down, spread apart) and the exceptions branch below.
const positions: ReadonlyMap<string, GraphPoint> = new Map([
  ['start', { x: 20, y: 265 }], ['validate', { x: 230, y: 265 }], ['stock', { x: 440, y: 250 }],
  ['reserve', { x: 710, y: 265 }], ['pay', { x: 920, y: 265 }], ['ship', { x: 1130, y: 265 }], ['done', { x: 1340, y: 265 }],
  ['inventory', { x: 440, y: 20 }],
  ['backorder', { x: 440, y: 430 }], ['cancelled', { x: 920, y: 430 }], ['package', { x: 1130, y: 430 }],
])
const sizes: ReadonlyMap<string, GraphNodeSize> = new Map([['stock', { width: 160, height: 90 }]])

const spread = ref(true)
const spacing = ref(40)
const animate = ref(true)
const edgeStyle = ref<GraphEdgeStyle>('curve')
// Orthogonal routes (the loop-back, or every edge in the orthogonal style) go around the node boxes.
const avoidNodes = ref(false)
// Edge labels move along and beside their routes, away from nodes, other labels and other edges.
const placeLabels = ref(false)
const graph = ref<InstanceType<typeof NetworkGraph>>()
const status = ref(t({ en: 'Ready. Export the diagram as SVG or PNG.', ja: '準備ができました。図を SVG か PNG で出力できます。' }))

// Control flow keeps the default arrow; data flow uses the open arrow; the main path flows (`animated`).
const edges = computed<GraphEdge[]>(() => {
  const main = (id: string, from: string, to: string, extra: Partial<GraphEdge> = {}): GraphEdge =>
    ({ id, from, to, animated: animate.value, ...extra })
  return [
    main('start-validate', 'start', 'validate', { markerStart: 'circle' }),
    main('validate-stock', 'validate', 'stock'),
    main('stock-reserve', 'stock', 'reserve', { label: t({ en: 'yes', ja: 'はい' }) }),
    { id: 'stock-backorder', from: 'stock', to: 'backorder', label: t({ en: 'no', ja: 'いいえ' }) },
    // The loop-back chooses its own routing, whatever the global style is.
    { id: 'backorder-validate', from: 'backorder', to: 'validate', label: t({ en: 'retry', ja: '再試行' }), edgeStyle: 'orthogonal' },
    main('reserve-pay', 'reserve', 'pay'),
    main('pay-ship', 'pay', 'ship'),
    main('ship-done', 'ship', 'done'),
    // Cancellation path ends in a bar.
    { id: 'pay-cancelled', from: 'pay', to: 'cancelled', label: t({ en: 'declined', ja: '拒否' }), markerEnd: 'bar' },
    // Aggregation: a shipment contains packages.
    { id: 'ship-package', from: 'ship', to: 'package', label: t({ en: 'contains', ja: '含む' }), markerStart: 'diamond', markerEnd: 'none' },
    // Request/response pairs between the same two nodes, in both directions.
    { id: 'stock-inventory-request', from: 'stock', to: 'inventory', label: t({ en: 'ask', ja: '問い合わせ' }), markerEnd: 'open-arrow' },
    { id: 'inventory-stock-response', from: 'inventory', to: 'stock', label: t({ en: 'qty', ja: '数量' }), markerEnd: 'open-arrow' },
    { id: 'reserve-inventory', from: 'reserve', to: 'inventory', label: t({ en: 'reserve', ja: '引当' }), markerEnd: 'open-arrow' },
  ]
})

function exportSvg() {
  const svg = graph.value?.exportSvg({ title: t({ en: 'Order fulfilment', ja: '受注から出荷まで' }) })
  if (!svg) return
  download(svg, 'order-fulfilment.svg')
  status.value = t({ en: `Exported SVG (${svg.length} characters).`, ja: `SVG を出力しました(${svg.length} 文字)。` })
}
async function exportPng() {
  try {
    const blob = await graph.value?.exportPng({ scale: 2 })
    if (!blob) return
    download(blob, 'order-fulfilment.png')
    const size = await imageSize(blob)
    status.value = t({ en: `Exported PNG ${size}.`, ja: `PNG を出力しました(${size})。` })
  } catch (error) {
    status.value = error instanceof Error ? error.message : String(error)
  }
}
</script>

<template>
  <DemoPanel title-id="diagram-title" :title="t({ en: 'Diagram styles', ja: 'ダイアグラムのスタイル' })" :subtitle="t({ en: 'Order fulfilment drawn with node shapes, edge markers, animated edges and spread parallel edges.', ja: '受注から出荷までをノードの形状、辺のマーカー、アニメーションする辺、間隔を空けた平行な辺で描きます。' })">
    <div class="options diagram-options" role="group" :aria-label="t({ en: 'Diagram options', ja: '図のオプション' })">
      <label><input v-model="spread" type="checkbox"> {{ t({ en: 'Spread parallel edges', ja: '平行な辺の間隔を空ける' }) }}</label>
      <label>{{ t({ en: 'Spacing', ja: '間隔' }) }}
        <select v-model.number="spacing" :aria-label="t({ en: 'Parallel edge spacing', ja: '平行な辺の間隔' })" :disabled="!spread">
          <option :value="24">24</option><option :value="40">40</option><option :value="56">56</option>
        </select>
      </label>
      <label><input v-model="animate" type="checkbox"> {{ t({ en: 'Animate main path', ja: '主経路をアニメーション' }) }}</label>
      <label>{{ t({ en: 'Edge style', ja: '辺のスタイル' }) }}
        <select v-model="edgeStyle" :aria-label="t({ en: 'Edge style', ja: '辺のスタイル' })">
          <option value="curve">{{ t({ en: 'curve', ja: '曲線' }) }}</option><option value="straight">{{ t({ en: 'straight', ja: '直線' }) }}</option><option value="orthogonal">{{ t({ en: 'orthogonal', ja: '直交' }) }}</option>
        </select>
      </label>
      <label><input v-model="avoidNodes" type="checkbox"> {{ t({ en: 'Avoid nodes', ja: 'ノードを避ける' }) }}</label>
      <label><input v-model="placeLabels" type="checkbox"> {{ t({ en: 'Place labels clear', ja: 'ラベルを重ならない位置に置く' }) }}</label>
      <button type="button" @click="exportSvg">{{ t({ en: 'Export SVG', ja: 'SVG で出力' }) }}</button>
      <button type="button" @click="exportPng">{{ t({ en: 'Export PNG', ja: 'PNG で出力' }) }}</button>
    </div>
    <NetworkGraph ref="graph" :nodes="nodes" :edges="edges" :edge-style="edgeStyle" :avoid-nodes="avoidNodes"
      :edge-label-placement="placeLabels ? 'avoid' : 'midpoint'"
      :parallel-edge-spacing="spread ? spacing : undefined" :positions="positions" :sizes="sizes"
      :options="{ direction: 'LR', nodeWidth: 160, nodeHeight: 60 }" :height="500" :labels="{ ...labels.graph, region: t({ en: 'Order fulfilment diagram', ja: '受注から出荷までの図' }) }" />
    <StatusLine :label="t({ en: 'Diagram status', ja: '図の状態' })">{{ status }}</StatusLine>
    <ul class="diagram-legend" :aria-label="t({ en: 'Legend', ja: '凡例' })">
      <li><strong>{{ t({ en: 'Shapes', ja: '形状' }) }}</strong> {{ t({ en: 'ellipse: start and end, diamond: decision, hexagon: data store, box: step', ja: '楕円: 開始と終了、ひし形: 判断、六角形: データストア、四角形: 処理' }) }}</li>
      <li><strong>{{ t({ en: 'Markers', ja: 'マーカー' }) }}</strong> {{ t({ en: 'arrow: control flow, open arrow: data flow, circle: start, bar: cancellation, diamond: aggregation', ja: '矢印: 制御の流れ、開いた矢印: データの流れ、円: 開始、棒: 取り消し、ひし形: 集約' }) }}</li>
      <li><strong>{{ t({ en: 'Edges', ja: '辺' }) }}</strong> {{ t({ en: 'flowing dashes: main path, orthogonal route: loop-back, pairs side by side: request and response', ja: '流れる破線: 主経路、直交ルート: 戻り、並んだ2本: 要求と応答' }) }}</li>
    </ul>
  </DemoPanel>
</template>

<style scoped>
.diagram-options { flex-wrap: wrap; gap: 10px 16px; margin-bottom: 8px; }
.diagram-legend { margin: 10px 0 0; padding: 0; list-style: none; font-size: 12px; color: var(--vw-muted, #4f6574); display: grid; gap: 4px; }
.diagram-legend strong { color: var(--vw-text, #162e40); margin-inline-end: 6px; }
</style>
