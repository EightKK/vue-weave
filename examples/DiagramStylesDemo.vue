<script setup lang="ts">
// A process diagram drawn with the default renderer only (no node or edge slots). Every rendering feature has a job:
// node shapes tell steps, decisions, data stores and terminals apart; edge markers tell control flow from data flow;
// request/response pairs show what `parallelEdgeSpacing` does; one loop-back edge routes itself orthogonally.
import { computed, ref } from 'vue'
import { NetworkGraph, type GraphEdge, type GraphEdgeStyle, type NetworkNode } from '../src'
import { download, imageSize } from './download'

const nodes: NetworkNode[] = [
  { id: 'start', label: 'Order placed', shape: 'ellipse', tone: 'teal' },
  { id: 'validate', label: 'Validate order', shape: 'box', tone: 'blue' },
  { id: 'stock', label: 'In stock?', shape: 'diamond', tone: 'violet' },
  { id: 'inventory', label: 'Inventory', detail: 'data store', shape: 'hexagon', tone: 'teal' },
  { id: 'reserve', label: 'Reserve items', shape: 'box', tone: 'blue' },
  { id: 'backorder', label: 'Back-order', shape: 'box', tone: 'violet' },
  { id: 'pay', label: 'Charge payment', shape: 'box', tone: 'blue' },
  { id: 'ship', label: 'Ship order', shape: 'box', tone: 'blue' },
  { id: 'package', label: 'Packages', detail: 'data store', shape: 'hexagon', tone: 'teal' },
  { id: 'done', label: 'Delivered', shape: 'ellipse', tone: 'teal' },
  { id: 'cancelled', label: 'Cancelled', shape: 'ellipse', tone: 'violet' },
]

const spread = ref(true)
const spacing = ref(22)
const animate = ref(true)
const edgeStyle = ref<GraphEdgeStyle>('curve')
const graph = ref<InstanceType<typeof NetworkGraph>>()
const status = ref('Ready. Export the diagram as SVG or PNG.')

// Control flow keeps the default arrow; data flow uses the open arrow; the main path flows (`animated`).
const edges = computed<GraphEdge[]>(() => {
  const main = (id: string, from: string, to: string, extra: Partial<GraphEdge> = {}): GraphEdge =>
    ({ id, from, to, animated: animate.value, ...extra })
  return [
    main('start-validate', 'start', 'validate', { markerStart: 'circle' }),
    main('validate-stock', 'validate', 'stock'),
    main('stock-reserve', 'stock', 'reserve', { label: 'yes' }),
    { id: 'stock-backorder', from: 'stock', to: 'backorder', label: 'no' },
    // The loop-back chooses its own routing, whatever the global style is.
    { id: 'backorder-validate', from: 'backorder', to: 'validate', label: 'retry', edgeStyle: 'orthogonal' },
    main('reserve-pay', 'reserve', 'pay'),
    main('pay-ship', 'pay', 'ship'),
    main('ship-done', 'ship', 'done'),
    // Cancellation path ends in a bar.
    { id: 'pay-cancelled', from: 'pay', to: 'cancelled', label: 'declined', markerEnd: 'bar' },
    // Aggregation: a shipment contains packages.
    { id: 'ship-package', from: 'ship', to: 'package', label: 'contains', markerStart: 'diamond', markerEnd: 'none' },
    // Request/response pairs between the same two nodes, in both directions.
    { id: 'stock-inventory-request', from: 'stock', to: 'inventory', label: 'check', markerEnd: 'open-arrow' },
    { id: 'inventory-stock-response', from: 'inventory', to: 'stock', label: 'quantity', markerEnd: 'open-arrow' },
    { id: 'reserve-inventory-request', from: 'reserve', to: 'inventory', label: 'reserve', markerEnd: 'open-arrow' },
    { id: 'inventory-reserve-response', from: 'inventory', to: 'reserve', label: 'confirm', markerEnd: 'open-arrow' },
  ]
})

function exportSvg() {
  const svg = graph.value?.exportSvg({ title: 'Order fulfilment' })
  if (!svg) return
  download(svg, 'order-fulfilment.svg')
  status.value = `Exported SVG (${svg.length} characters).`
}
async function exportPng() {
  try {
    const blob = await graph.value?.exportPng({ scale: 2 })
    if (!blob) return
    download(blob, 'order-fulfilment.png')
    status.value = `Exported PNG ${await imageSize(blob)}.`
  } catch (error) {
    status.value = error instanceof Error ? error.message : String(error)
  }
}
</script>

<template>
  <section class="planning-panel" aria-labelledby="diagram-title">
    <div class="section-head">
      <div><h2 id="diagram-title">Diagram styles</h2><p>Order fulfilment drawn with node shapes, edge markers, animated edges and spread parallel edges.</p></div>
    </div>
    <div class="options diagram-options" role="group" aria-label="Diagram options">
      <label><input v-model="spread" type="checkbox"> Spread parallel edges</label>
      <label>Spacing
        <select v-model.number="spacing" aria-label="Parallel edge spacing" :disabled="!spread">
          <option :value="12">12</option><option :value="22">22</option><option :value="34">34</option>
        </select>
      </label>
      <label><input v-model="animate" type="checkbox"> Animate main path</label>
      <label>Edge style
        <select v-model="edgeStyle" aria-label="Edge style">
          <option value="curve">curve</option><option value="straight">straight</option><option value="orthogonal">orthogonal</option>
        </select>
      </label>
      <button type="button" @click="exportSvg">Export SVG</button>
      <button type="button" @click="exportPng">Export PNG</button>
    </div>
    <NetworkGraph ref="graph" :nodes="nodes" :edges="edges" :edge-style="edgeStyle"
      :parallel-edge-spacing="spread ? spacing : undefined" :options="{ direction: 'LR', nodeWidth: 136, nodeHeight: 60 }"
      :height="460" :labels="{ region: 'Order fulfilment diagram' }" />
    <p class="status" role="status" aria-label="Diagram status">{{ status }}</p>
    <ul class="diagram-legend" aria-label="Legend">
      <li><strong>Shapes</strong> ellipse: start and end, diamond: decision, hexagon: data store, box: step</li>
      <li><strong>Markers</strong> arrow: control flow, open arrow: data flow, circle: start, bar: cancellation, diamond: aggregation</li>
      <li><strong>Edges</strong> flowing dashes: main path, orthogonal route: loop-back, pairs side by side: request and response</li>
    </ul>
  </section>
</template>

<style scoped>
.diagram-options { flex-wrap: wrap; gap: 10px 16px; margin-bottom: 8px; }
.diagram-legend { margin: 10px 0 0; padding: 0; list-style: none; font-size: 12px; color: var(--vw-muted, #4f6574); display: grid; gap: 4px; }
.diagram-legend strong { color: var(--vw-text, #162e40); margin-inline-end: 6px; }
</style>
