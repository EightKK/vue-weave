<script setup lang="ts">
import { computed, ref } from 'vue'
import { layoutFlowGraph, type GraphEdge, type NetworkNode } from '../../src'
import CodePanel from './CodePanel.vue'
import ProcessGraph from './ProcessGraph.vue'
import type { Copy } from './copy'
import { flows } from './lot-transfers'
import { excerpt } from './sections'
import { stepEntity, stepOf, useProductionWorkspace } from './workspace'
import source from './LotFlow.vue?raw'

const props = defineProps<{ text: Copy; isJapanese: boolean }>()
const unit = ref<'pcs' | 'EUR'>('pcs')
const { linked } = useProductionWorkspace()
// The step shown in the details: the first selected entity that is a step of this lot, selected here or in planning.
const selected = computed(() => linked.selectedEntities.value.map(stepOf).find(id => id !== undefined) ?? '')
const graphSelected = computed(() => [...linked.graph.value.selectedNodeIds].find(id => positions.has(id)) ?? '')
const selectStep = (id: string) => linked.selectEntities([stepEntity(id)], { source: 'lot-table' })
const codeOpen = ref(false)
const ids = ['lot', 'overhead', 'line-a', 'line-b', 'inspect', 'pack', 'rework'] as const
type Step = typeof ids[number]
const symbols = { lot: '▤', 'line-a': 'A', 'line-b': 'B', inspect: '✓', pack: '□', rework: '↶' }
const positions = new Map([
  ['lot', { x: 0, y: 127 }], ['line-a', { x: 223, y: 50 }], ['line-b', { x: 223, y: 204 }],
  ['inspect', { x: 446, y: 127 }], ['pack', { x: 669, y: 50 }], ['rework', { x: 669, y: 204 }],
])

function amount(value: number) {
  const number = value.toLocaleString(props.isJapanese ? 'ja-JP' : 'en-US')
  return number + (unit.value === 'EUR' ? ' €' : props.isJapanese ? '個' : ' pcs')
}

const nodes = computed<NetworkNode[]>(() => ids.map(id => {
  const overhead = unit.value === 'EUR' && flows.find(edge => edge.from === 'overhead' && edge.to === id)?.data?.EUR
  return {
    id, label: props.text.steps[id],
    ...(overhead ? { detail: '+' + amount(overhead) } : {}),
    ...(id === 'rework' || id === 'inspect' ? {
      ports: [{ id: 'return', side: id === 'rework' ? 'left' : 'right', offset: 0.92 }],
    } : {}),
  }
}))

// demo:flow
// Compare quantities in one unit at a time. The library separates the return loop from normal totals.
const projection = computed(() => layoutFlowGraph(nodes.value, flows, {
  quantity: edge => edge.data![unit.value] ?? edge.data!.EUR,
  unit: edge => unit.value === 'pcs' && edge.data!.pcs !== undefined ? 'pcs' : 'EUR',
  displayUnit: unit.value,
}))
const reference = computed(() => projection.value.bands.find(band => band.reference)!)
const totals = computed(() => projection.value.nodes.filter(row => row.id !== 'overhead' || unit.value === 'EUR'))
// demo:end

const diagramNodes = computed(() => nodes.value.filter(node => node.id !== 'overhead'))
const diagramEdges = computed<GraphEdge[]>(() => projection.value.bands.filter(band => band.from !== 'overhead').map(band => ({
  id: band.edgeId, from: band.from, to: band.to, label: amount(band.quantity), markerEnd: 'open-arrow',
  ...(band.reference ? { fromPort: 'return', toPort: 'return', animated: true } : {}),
})))
// Undefined while nothing is selected: a click on the empty graph canvas or Escape in it clears the selection.
const detail = computed(() => totals.value.find(row => row.id === selected.value))
const examples = computed(() => [{ label: props.text.codeFlow, path: 'LotFlow.vue', code: excerpt(source, 'flow') }])

function changeUnit(next: typeof unit.value) {
  unit.value = next
  if (next === 'pcs' && selected.value === 'overhead') selectStep('lot')
}
</script>

<template>
  <div class="production-title">
    <div><h1>{{ text.lot }}</h1><p>{{ text.introLot }}</p></div>
    <div class="production-actions">
      <div class="production-switch" role="group" :aria-label="text.unit">
        <button type="button" :aria-pressed="unit === 'pcs'" @click="changeUnit('pcs')">{{ text.pieces }}</button>
        <button type="button" :aria-pressed="unit === 'EUR'" @click="changeUnit('EUR')">{{ text.cost }}</button>
      </div>
      <button type="button" :aria-expanded="codeOpen" @click="codeOpen = !codeOpen">{{ text.code }}</button>
    </div>
  </div>
  <CodePanel v-if="codeOpen" :text="text" :examples="examples" />
  <div class="production-layout flow-layout">
    <section class="production-panel">
      <div class="production-heading"><h2>{{ text.lotLabel }}</h2><code>NetworkGraph</code></div>
      <ProcessGraph :selected-id="graphSelected" :linked-ids="linked.graph.value.highlightedNodeIds" :text="text" :label="text.lotLabel"
        :nodes="diagramNodes" :edges="diagramEdges" :positions="positions" :symbols="symbols" :height="420"
        @select="id => linked.select('graph', [{ view: 'graph', kind: 'node', id }])" @clear="linked.clearSelection()" />
      <div class="production-content production-note">
        <strong><span class="return-line" aria-hidden="true"></span>{{ text.handling }} {{ amount(reference.quantity) }}</strong>
        <p>{{ text.returnNote }}</p>
        <p v-if="unit === 'EUR'">{{ text.overheadNote }}</p>
      </div>
    </section>

    <aside class="production-stack">
      <section class="production-panel">
        <div class="production-heading"><h2>{{ text.stepDetail }}</h2></div>
        <div class="production-content" aria-live="polite">
          <template v-if="detail">
            <strong>{{ text.steps[selected as Step] }}</strong>
            <dl><dt>{{ text.input }}</dt><dd>{{ amount(detail.inflow) }}</dd><dt>{{ text.output }}</dt><dd>{{ amount(detail.outflow) }}</dd>
              <template v-if="selected === 'line-b'"><dt>{{ text.diff }}</dt><dd>{{ amount(detail.difference) }}</dd></template>
              <template v-if="detail.referenceInflow || detail.referenceOutflow"><dt>{{ text.handling }}</dt><dd>{{ amount(detail.referenceInflow || detail.referenceOutflow) }}</dd></template>
            </dl>
          </template>
          <p v-else class="production-caption">{{ isJapanese ? 'グラフか表で工程を選ぶと、その数量を表示します。' : 'Select a step in the graph or the table to see its quantities.' }}</p>
          <p class="production-caption">{{ text.lotSelectionNote }}</p>
        </div>
      </section>
      <section class="production-panel">
        <div class="production-content">
          <table class="production-table">
            <thead><tr><th scope="col">{{ text.step }}</th><th scope="col">{{ text.input }}</th><th scope="col">{{ text.output }}</th></tr></thead>
            <tbody>
              <tr v-for="row in totals" :key="row.id" :class="{ active: row.id === selected }">
                <th scope="row"><button type="button" :aria-pressed="row.id === selected" @click="selectStep(row.id)">{{ text.steps[row.id as Step] }}</button></th>
                <td>{{ amount(row.inflow) }}</td><td>{{ amount(row.outflow) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </aside>
  </div>
</template>
