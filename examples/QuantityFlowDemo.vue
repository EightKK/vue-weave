<script setup lang="ts">
import { computed, ref, shallowRef } from 'vue'
import {
  NetworkGraph, graphFlowBands, layoutFlowGraph, type GraphEdge, type GraphLayoutDirection, type GraphLayoutFunction, type NetworkNode,
} from '../src'

// Opt-in example of `layoutFlowGraph` and the NetworkGraph `edgeBands` prop: a production lot drawn as quantity bands.
// Material edges carry pieces and cost; the overhead allocation carries cost only, so the pieces view leaves it out
// instead of adding euros to pieces. The rework loop is a reference band: dashed, routed below, outside the totals.
type Unit = 'pcs' | 'EUR'
type Flow = GraphEdge<{ pcs?: number; EUR: number }>
const steps: NetworkNode[] = [
  { id: 'lot', label: 'Lot L-100', tone: 'amber' },
  { id: 'overhead', label: 'Overhead', tone: 'violet' },
  { id: 'line-a', label: 'Line A' },
  { id: 'line-b', label: 'Line B' },
  { id: 'inspect', label: 'Inspect', tone: 'teal' },
  { id: 'rework', label: 'Rework', tone: 'amber' },
  { id: 'pack', label: 'Pack', tone: 'teal' },
]
const flows: Flow[] = [
  { id: 'lot-a', from: 'lot', to: 'line-a', data: { pcs: 60, EUR: 1200 } },
  { id: 'lot-b', from: 'lot', to: 'line-b', data: { pcs: 40, EUR: 800 } },
  { id: 'overhead-a', from: 'overhead', to: 'line-a', data: { EUR: 300 } },
  { id: 'overhead-b', from: 'overhead', to: 'line-b', data: { EUR: 200 } },
  { id: 'a-inspect', from: 'line-a', to: 'inspect', data: { pcs: 60, EUR: 1500 } },
  // Line B loses 4 pieces (and 100 EUR of value): the library reports the difference and never balances it.
  { id: 'b-inspect', from: 'line-b', to: 'inspect', data: { pcs: 36, EUR: 900 } },
  { id: 'inspect-pack', from: 'inspect', to: 'pack', data: { pcs: 86, EUR: 2150 } },
  { id: 'inspect-rework', from: 'inspect', to: 'rework', data: { pcs: 10, EUR: 250 } },
  { id: 'rework-inspect', from: 'rework', to: 'inspect', data: { pcs: 10, EUR: 250 } },
]
const unitNames: Record<Unit, string> = { pcs: 'Pieces', EUR: 'Cost' }
const unit = ref<Unit>('pcs')
const direction = ref<GraphLayoutDirection>('LR')
const selectedEdgeIds = ref<ReadonlySet<string>>(new Set())
const status = ref('Select a band to see its edge ID and quantity.')
const graph = shallowRef<InstanceType<typeof NetworkGraph>>()
const vertical = computed(() => direction.value === 'TB' || direction.value === 'BT')

// Each edge states its own unit; in the cost view every edge is in EUR.
const unitOf = (edge: Flow): Unit => unit.value === 'pcs' && edge.data?.pcs !== undefined ? 'pcs' : 'EUR'
const flow = computed(() => layoutFlowGraph(steps, flows, {
  quantity: edge => unitOf(edge) === 'pcs' ? edge.data!.pcs! : edge.data!.EUR,
  unit: unitOf, displayUnit: unit.value, direction: direction.value,
  scale: { fitExtent: 300 }, nodeThickness: 22, nodeGap: 34, rankGap: 150, padding: 30, formatQuantity: (value, name) => `${value} ${name}`,
}))
const bands = computed(() => graphFlowBands(flow.value))
const totals = computed(() => new Map(flow.value.nodes.map(item => [item.id, item])))
// The graph draws the edges in the displayed unit; the excluded ones are listed below it.
const shownEdges = computed(() => flows.filter(edge => flow.value.paths.has(edge.id)))
const shownNodes = computed(() => steps.map(step => {
  const total = totals.value.get(step.id)!
  return { ...step, detail: `in ${total.inflow} ${flow.value.unit}, out ${total.outflow} ${flow.value.unit}` }
}))
const layout: GraphLayoutFunction = () => flow.value
const signed = (value: number) => (value > 0 ? '+' : value < 0 ? '−' : '±') + Math.abs(value)

function changeUnit() {
  selectedEdgeIds.value = new Set()
  status.value = `Showing ${unitNames[unit.value].toLowerCase()} in ${unit.value}; edges in other units are listed, not added.`
}
function selectBand(ids: Set<string>) {
  selectedEdgeIds.value = ids
  const band = flow.value.bands.find(item => ids.has(item.edgeId))
  status.value = band
    ? `Selected band: edge ${band.edgeId}, ${band.quantity} ${band.unit}${band.reference ? ' (reference loop, not in the totals)' : ''}`
    : 'Select a band to see its edge ID and quantity.'
}
function exportSvg() {
  const svg = graph.value?.exportSvg() ?? ''
  status.value = `Exported SVG with ${(svg.match(/class="vw-flow-band/g) ?? []).length} bands.`
}
</script>

<template>
  <section class="planning-panel" aria-labelledby="flow-title">
    <div class="section-head">
      <div><h2 id="flow-title">Quantity flow</h2><p>A lot of 100 pieces splits 60/40, merges at inspection and loses 4 on line B; band width is quantity on one scale.</p></div>
    </div>
    <div class="options flow-options" role="group" aria-label="Quantity flow options">
      <label>Unit
        <select v-model="unit" aria-label="Flow unit" @change="changeUnit">
          <option value="pcs">Pieces (pcs)</option><option value="EUR">Cost (EUR)</option>
        </select>
      </label>
      <label>Direction
        <select v-model="direction" aria-label="Flow chart direction"><option>LR</option><option>RL</option><option>TB</option><option>BT</option></select>
      </label>
      <button type="button" @click="exportSvg">Export flow SVG</button>
    </div>
    <NetworkGraph ref="graph" :nodes="shownNodes" :edges="shownEdges" :layout="layout" :edge-bands="bands" :options="{ direction }"
      edges-selectable :selected-edge-ids="selectedEdgeIds" :height="vertical ? 620 : 460" :labels="{ region: 'Quantity flow graph' }"
      @update:selected-edge-ids="selectBand">
      <!-- Labels sit above each box, which is only as thick as its quantity. Exports use the default node drawing. -->
      <template #node="{ node, box }">
        <rect :width="box.width" :height="box.height" rx="2" />
        <text class="flow-node-label" x="0" y="-7">{{ node.label }}</text>
      </template>
    </NetworkGraph>
    <p class="status" role="status" aria-label="Quantity flow status">{{ status }}</p>
    <div class="flow-details">
      <table aria-label="Node totals">
        <thead><tr><th scope="col">Step</th><th scope="col">In</th><th scope="col">Out</th><th scope="col">Difference</th><th scope="col">Loop</th></tr></thead>
        <tbody>
          <tr v-for="step in steps" :key="step.id">
            <th scope="row">{{ step.label }}</th>
            <td>{{ totals.get(step.id)!.inflow }}</td>
            <td>{{ totals.get(step.id)!.outflow }}</td>
            <td>{{ signed(totals.get(step.id)!.difference) }}</td>
            <td>{{ totals.get(step.id)!.referenceInflow || totals.get(step.id)!.referenceOutflow ? `${totals.get(step.id)!.referenceInflow} in / ${totals.get(step.id)!.referenceOutflow} out` : '' }}</td>
          </tr>
        </tbody>
        <caption>Totals in {{ flow.unit }}. Loop flow (dashed) is counted apart; the meaning of a difference (scrap, stock, rounding) is yours.</caption>
      </table>
      <div>
        <h3 id="flow-excluded">Not shown in {{ flow.unit }}</h3>
        <ul v-if="flow.excluded.length" aria-labelledby="flow-excluded">
          <li v-for="item in flow.excluded" :key="item.edgeId">{{ item.edgeId }}: {{ item.quantity }} {{ item.unit }}</li>
        </ul>
        <p v-else>Every edge is in {{ flow.unit }}.</p>
      </div>
    </div>
  </section>
</template>

<style scoped>
.flow-options { flex-wrap: wrap; gap: 10px 16px; margin-bottom: 8px; }
.flow-node-label { font-size: 12px; font-weight: 650; fill: currentColor; stroke: var(--vw-surface-muted, #f6f9fb); stroke-width: 3px; paint-order: stroke; }
.flow-details { display: flex; flex-wrap: wrap; gap: 12px 32px; font-size: 12px; margin-top: 8px; }
.flow-details table { border-collapse: collapse; }
.flow-details th, .flow-details td { padding: 2px 10px 2px 0; text-align: start; }
.flow-details td { font-variant-numeric: tabular-nums; }
.flow-details caption { caption-side: bottom; text-align: start; padding-top: 4px; color: var(--vw-muted, #4f6574); max-width: 46ch; }
.flow-details h3 { font-size: 12px; margin: 0 0 4px; }
.flow-details ul { margin: 0; padding-inline-start: 16px; }
</style>
