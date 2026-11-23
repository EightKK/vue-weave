<script setup lang="ts">
import { computed, ref, shallowRef } from 'vue'
import {
  NetworkGraph, graphFlowBands, layoutFlowGraph, type GraphLayoutDirection, type GraphLayoutFunction, type NetworkNode,
} from '../src'
import DemoPanel from './components/DemoPanel.vue'
import StatusLine from './components/StatusLine.vue'
import { flows } from './production/lot-transfers'
import { useDemoLocale } from './i18n'

const { t, labels, isJapanese } = useDemoLocale()

// Opt-in example of `layoutFlowGraph` and the NetworkGraph `edgeBands` prop: a production lot drawn as quantity bands.
// Material edges carry pieces and cost; the overhead allocation carries cost only, so the pieces view leaves it out
// instead of adding euros to pieces. The rework loop is a reference band: dashed, routed below, outside the totals.
type Unit = 'pcs' | 'EUR'
type Flow = (typeof flows)[number]
const steps: NetworkNode[] = [
  { id: 'lot', label: t({ en: 'Lot L-100', ja: 'ロット L-100' }), tone: 'amber' },
  { id: 'overhead', label: t({ en: 'Overhead', ja: '間接費' }), tone: 'violet' },
  { id: 'line-a', label: t({ en: 'Line A', ja: 'A ライン' }) },
  { id: 'line-b', label: t({ en: 'Line B', ja: 'B ライン' }) },
  { id: 'inspect', label: t({ en: 'Inspect', ja: '検査' }), tone: 'teal' },
  { id: 'rework', label: t({ en: 'Rework', ja: '手直し' }), tone: 'amber' },
  { id: 'pack', label: t({ en: 'Pack', ja: '梱包' }), tone: 'teal' },
]
const unitNames: Record<Unit, string> = { pcs: 'Pieces', EUR: 'Cost' }
const unitNamesJa: Record<Unit, string> = { pcs: '個数', EUR: 'コスト' }
// The unit as the page writes it: pieces are 個 in Japanese.
const unitText = (name: string) => isJapanese.value && name === 'pcs' ? '個' : name
const unit = ref<Unit>('pcs')
const direction = ref<GraphLayoutDirection>('LR')
const selectedEdgeIds = ref<ReadonlySet<string>>(new Set())
const status = ref(t({ en: 'Select a band to see its edge ID and quantity.', ja: '帯を選ぶと、その辺の ID と数量を表示します。' }))
const graph = shallowRef<InstanceType<typeof NetworkGraph>>()
const vertical = computed(() => direction.value === 'TB' || direction.value === 'BT')

// Each edge states its own unit; in the cost view every edge is in EUR.
const unitOf = (edge: Flow): Unit => unit.value === 'pcs' && edge.data?.pcs !== undefined ? 'pcs' : 'EUR'
const flow = computed(() => layoutFlowGraph(steps, flows, {
  quantity: edge => unitOf(edge) === 'pcs' ? edge.data!.pcs! : edge.data!.EUR,
  unit: unitOf, displayUnit: unit.value, direction: direction.value,
  scale: { fitExtent: 300 }, nodeThickness: 22, nodeGap: 34, rankGap: 150, padding: 30, formatQuantity: (value, name) => `${value} ${unitText(name)}`,
}))
const bands = computed(() => graphFlowBands(flow.value))
const totals = computed(() => new Map(flow.value.nodes.map(item => [item.id, item])))
// The graph draws the edges in the displayed unit; the excluded ones are listed below it.
const shownEdges = computed(() => flows.filter(edge => flow.value.paths.has(edge.id)))
const shownNodes = computed(() => steps.map(step => {
  const total = totals.value.get(step.id)!
  const name = unitText(flow.value.unit)
  return { ...step, detail: t({ en: `in ${total.inflow} ${name}, out ${total.outflow} ${name}`, ja: `入 ${total.inflow} ${name}、出 ${total.outflow} ${name}` }) }
}))
const layout: GraphLayoutFunction = () => flow.value
const signed = (value: number) => (value > 0 ? '+' : value < 0 ? '−' : '±') + Math.abs(value)

function changeUnit() {
  selectedEdgeIds.value = new Set()
  status.value = t({
    en: `Showing ${unitNames[unit.value].toLowerCase()} in ${unit.value}; edges in other units are listed, not added.`,
    ja: `${unitNamesJa[unit.value]}(${unitText(unit.value)})を表示しています。ほかの単位の辺は合計せず、一覧に示します。`,
  })
}
function selectBand(ids: Set<string>) {
  selectedEdgeIds.value = ids
  const band = flow.value.bands.find(item => ids.has(item.edgeId))
  status.value = band
    ? t({
      en: `Selected band: edge ${band.edgeId}, ${band.quantity} ${band.unit}${band.reference ? ' (reference loop, not in the totals)' : ''}`,
      ja: `選択した帯: 辺 ${band.edgeId}、${band.quantity} ${unitText(band.unit)}${band.reference ? '(参照ループ、合計には含みません)' : ''}`,
    })
    : t({ en: 'Select a band to see its edge ID and quantity.', ja: '帯を選ぶと、その辺の ID と数量を表示します。' })
}
// A click on the empty canvas or Escape in the graph clears the band selection. Escape first cancels a gesture in
// flight (a pan); the graph reports every gesture as a start and an end, and the capture listener reads the count
// before the graph's own Escape handler ends it.
const gesture = { count: 0, cancelling: false }
function clearSelection() {
  if (selectedEdgeIds.value.size) selectBand(new Set())
}
function exportSvg() {
  const svg = graph.value?.exportSvg() ?? ''
  const count = (svg.match(/class="vw-flow-band/g) ?? []).length
  status.value = t({ en: `Exported SVG with ${count} bands.`, ja: `帯 ${count} 本を含む SVG を出力しました。` })
}
</script>

<template>
  <DemoPanel title-id="flow-title" :title="t({ en: 'Quantity flow', ja: '数量フロー' })" :subtitle="t({ en: 'A lot of 100 pieces splits 60/40, merges at inspection and loses 4 on line B; band width is quantity on one scale.', ja: '100 個のロットが 60/40 に分かれ、検査で合流し、B ラインで 4 個減ります。帯の幅は共通の尺度での数量です。' })">
    <div class="options flow-options" role="group" :aria-label="t({ en: 'Quantity flow options', ja: '数量フローのオプション' })">
      <label>{{ t({ en: 'Unit', ja: '単位' }) }}
        <select v-model="unit" :aria-label="t({ en: 'Flow unit', ja: 'フローの単位' })" @change="changeUnit">
          <option value="pcs">{{ t({ en: 'Pieces (pcs)', ja: '個数(個)' }) }}</option><option value="EUR">{{ t({ en: 'Cost (EUR)', ja: 'コスト(EUR)' }) }}</option>
        </select>
      </label>
      <label>{{ t({ en: 'Direction', ja: '方向' }) }}
        <select v-model="direction" :aria-label="t({ en: 'Flow chart direction', ja: 'フロー図の方向' })"><option>LR</option><option>RL</option><option>TB</option><option>BT</option></select>
      </label>
      <button type="button" @click="exportSvg">{{ t({ en: 'Export flow SVG', ja: 'フローを SVG で出力' }) }}</button>
    </div>
    <div @keydown.esc.capture="gesture.cancelling = gesture.count > 0" @keydown.esc="gesture.cancelling || clearSelection()">
      <NetworkGraph ref="graph" :nodes="shownNodes" :edges="shownEdges" :layout="layout" :edge-bands="bands" :options="{ direction }"
        edges-selectable :selected-edge-ids="selectedEdgeIds" :height="vertical ? 620 : 460" :labels="{ ...labels.graph, region: t({ en: 'Quantity flow graph', ja: '数量フローの図' }) }"
        @update:selected-edge-ids="selectBand"
        @background-click="clearSelection" @gesture-start="gesture.count++" @gesture-end="gesture.count--">
        <!-- Labels sit above each box, which is only as thick as its quantity. Exports use the default node drawing. -->
        <template #node="{ node, box }">
          <rect :width="box.width" :height="box.height" rx="2" />
          <text class="flow-node-label" x="0" y="-7">{{ node.label }}</text>
        </template>
      </NetworkGraph>
    </div>
    <StatusLine :label="t({ en: 'Quantity flow status', ja: '数量フローの状態' })">{{ status }}</StatusLine>
    <div class="flow-details">
      <table :aria-label="t({ en: 'Node totals', ja: 'ノードの合計' })">
        <thead><tr><th scope="col">{{ t({ en: 'Step', ja: '工程' }) }}</th><th scope="col">{{ t({ en: 'In', ja: '入' }) }}</th><th scope="col">{{ t({ en: 'Out', ja: '出' }) }}</th><th scope="col">{{ t({ en: 'Difference', ja: '差' }) }}</th><th scope="col">{{ t({ en: 'Loop', ja: 'ループ' }) }}</th></tr></thead>
        <tbody>
          <tr v-for="step in steps" :key="step.id">
            <th scope="row">{{ step.label }}</th>
            <td>{{ totals.get(step.id)!.inflow }}</td>
            <td>{{ totals.get(step.id)!.outflow }}</td>
            <td>{{ signed(totals.get(step.id)!.difference) }}</td>
            <td>{{ totals.get(step.id)!.referenceInflow || totals.get(step.id)!.referenceOutflow ? t({ en: `${totals.get(step.id)!.referenceInflow} in / ${totals.get(step.id)!.referenceOutflow} out`, ja: `入 ${totals.get(step.id)!.referenceInflow} / 出 ${totals.get(step.id)!.referenceOutflow}` }) : '' }}</td>
          </tr>
        </tbody>
        <caption>{{ t({ en: `Totals in ${flow.unit}. Loop flow (dashed) is counted apart; the meaning of a difference (scrap, stock, rounding) is yours.`, ja: `合計の単位: ${unitText(flow.unit)}。ループの流れ(破線)は別に数えます。差の意味(廃棄、在庫、端数)はアプリケーションが決めます。` }) }}</caption>
      </table>
      <div>
        <h3 id="flow-excluded">{{ t({ en: `Not shown in ${flow.unit}`, ja: `${unitText(flow.unit)}では表示しない辺` }) }}</h3>
        <ul v-if="flow.excluded.length" aria-labelledby="flow-excluded">
          <li v-for="item in flow.excluded" :key="item.edgeId">{{ item.edgeId }}: {{ item.quantity }} {{ unitText(item.unit) }}</li>
        </ul>
        <p v-else>{{ t({ en: `Every edge is in ${flow.unit}.`, ja: `すべての辺が${unitText(flow.unit)}の単位です。` }) }}</p>
      </div>
    </div>
  </DemoPanel>
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
