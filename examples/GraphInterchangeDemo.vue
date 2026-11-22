<script setup lang="ts">
// Diagram interchange: the graph is written as Mermaid, GraphML or draw.io text, and text in those formats is read back
// into the NetworkGraph props. Everything runs in the browser with the core functions; draw.io files saved with
// compression are inflated by `fromDrawioAsync`.
import { computed, ref, shallowRef } from 'vue'
import {
  NetworkGraph, fromDrawioAsync, fromGraphMl, fromMermaid, toDrawio, toGraphMl, toMermaid,
  type GraphInterchangeImport, type GraphInterchangeInput, type GraphInterchangeWarning, type GraphLayoutDirection, type GraphNodeMove,
} from '../src'
import { download } from './download'
import DemoPanel from './components/DemoPanel.vue'
import StatusLine from './components/StatusLine.vue'
import { useDemoLocale } from './i18n'

const { t, labels } = useDemoLocale()

type Format = 'mermaid' | 'graphml' | 'drawio'

const formats: Record<Format, { label: string; filename: string; type: string }> = {
  mermaid: { label: 'Mermaid', filename: 'diagram.mmd', type: 'text/plain' },
  graphml: { label: 'GraphML', filename: 'diagram.graphml', type: 'application/xml' },
  drawio: { label: 'draw.io', filename: 'diagram.drawio', type: 'application/xml' },
}

const initial = (): GraphInterchangeImport => ({
  nodes: [
    { id: 'order', label: t({ en: 'Order received', ja: '注文受付' }), shape: 'ellipse', tone: 'teal' },
    { id: 'check', label: t({ en: 'In stock?', ja: '在庫あり?' }), shape: 'diamond', tone: 'violet' },
    { id: 'pick', label: t({ en: 'Pick items', ja: 'ピッキング' }), detail: t({ en: 'Aisle scan', ja: '棚のスキャン' }), shape: 'rounded', tone: 'blue' },
    { id: 'pack', label: t({ en: 'Pack parcel', ja: '梱包' }), shape: 'rounded', tone: 'blue' },
    { id: 'reorder', label: t({ en: 'Reorder stock', ja: '在庫を再発注' }), tone: 'amber' },
    { id: 'ship', label: t({ en: 'Shipped', ja: '出荷済み' }), shape: 'ellipse', tone: 'teal' },
  ],
  edges: [
    { id: 'e1', from: 'order', to: 'check' },
    { id: 'e2', from: 'check', to: 'pick', label: t({ en: 'yes', ja: 'はい' }) },
    { id: 'e3', from: 'check', to: 'reorder', label: t({ en: 'no', ja: 'いいえ' }), markerEnd: 'open-arrow' },
    { id: 'e4', from: 'pick', to: 'pack' },
    { id: 'e5', from: 'reorder', to: 'pick', edgeStyle: 'orthogonal' },
    { id: 'e6', from: 'pack', to: 'ship', animated: true },
  ],
  groups: [
    { id: 'warehouse', label: t({ en: 'Warehouse', ja: '倉庫' }), nodeIds: ['reorder'] },
    { id: 'floor', label: t({ en: 'Shop floor', ja: '作業場' }), nodeIds: ['pick', 'pack'], parentId: 'warehouse' },
  ],
  positions: new Map([
    ['order', { x: 20, y: 90 }], ['check', { x: 210, y: 80 }], ['pick', { x: 450, y: 60 }],
    ['pack', { x: 660, y: 60 }], ['reorder', { x: 450, y: 250 }], ['ship', { x: 900, y: 60 }],
  ]),
  sizes: new Map([['check', { width: 140, height: 80 }]]),
  warnings: [],
})

const graph = shallowRef<GraphInterchangeImport>(initial())
const format = ref<Format>('mermaid')
const text = ref('')
const warnings = ref<GraphInterchangeWarning[]>([])
const status = ref(t({ en: 'Ready. Edit the text and import it, or export the graph in another format.', ja: '準備ができました。テキストを編集して読み込むか、別の形式でグラフを書き出してください。' }))
const direction = computed<GraphLayoutDirection>(() => graph.value.direction ?? 'LR')

function exportText(target: Format = format.value, input: GraphInterchangeInput = graph.value) {
  if (target === 'mermaid') return toMermaid(input, { direction: direction.value })
  if (target === 'graphml') return toGraphMl(input)
  return toDrawio(input, { pageName: t({ en: 'Order flow', ja: '注文の流れ' }), direction: direction.value })
}

function exportGraph() {
  text.value = exportText()
  warnings.value = []
  const { nodes, edges } = graph.value, name = formats[format.value].label
  status.value = t({ en: `Exported ${nodes.length} nodes and ${edges.length} edges as ${name}.`, ja: `ノード ${nodes.length} 個と辺 ${edges.length} 本を ${name} で書き出しました。` })
}

async function importGraph() {
  try {
    const source = text.value
    const read = format.value === 'mermaid' ? fromMermaid(source)
      : format.value === 'graphml' ? fromGraphMl(source)
        : await fromDrawioAsync(source)
    graph.value = read
    warnings.value = read.warnings
    const notes = read.warnings.length === 1 ? '1 warning' : `${read.warnings.length} warnings`
    const name = formats[format.value].label
    status.value = t({
      en: `Imported ${read.nodes.length} nodes, ${read.edges.length} edges and ${read.groups.length} groups from ${name} with ${notes}.`,
      ja: `${name} からノード ${read.nodes.length} 個、辺 ${read.edges.length} 本、グループ ${read.groups.length} 個を読み込みました(警告 ${read.warnings.length} 件)。`,
    })
  } catch (error) {
    warnings.value = []
    status.value = t({ en: 'Import failed: ', ja: '読み込みに失敗しました: ' }) + (error instanceof Error ? error.message : String(error))
  }
}

function changeFormat() {
  exportGraph()
}

function save() {
  const { filename, type } = formats[format.value]
  const content = exportText()
  download(new Blob([content], { type }), filename)
  status.value = t({ en: `Downloaded ${filename} (${content.length} characters).`, ja: `${filename} をダウンロードしました(${content.length} 文字)。` })
}

function reset() {
  graph.value = initial()
  exportGraph()
  status.value = t({ en: 'Restored the example graph.', ja: '例のグラフに戻しました。' })
}

// Accept moves so the next export carries the new positions.
function move(changes: GraphNodeMove[]) {
  const positions = new Map(graph.value.positions)
  for (const change of changes) positions.set(change.id, change.after)
  graph.value = { ...graph.value, positions }
}

text.value = exportText()
</script>

<template>
  <DemoPanel title-id="interchange-title" :title="t({ en: 'Diagram import/export', ja: 'ダイアグラムのインポートとエクスポート' })"
    :subtitle="t({ en: 'Write the graph as Mermaid, GraphML or draw.io, edit the text and read it back. Dragged nodes keep their place in GraphML and draw.io.', ja: 'グラフを Mermaid、GraphML、draw.io で書き出し、テキストを編集して読み戻します。ドラッグしたノードの位置は GraphML と draw.io に残ります。' })">
    <div class="options interchange-options" role="group" :aria-label="t({ en: 'Diagram interchange', ja: '図の入出力' })">
      <label>{{ t({ en: 'Format', ja: '形式' }) }}
        <select v-model="format" :aria-label="t({ en: 'Diagram format', ja: '図の形式' })" @change="changeFormat">
          <option v-for="(item, key) in formats" :key="key" :value="key">{{ item.label }}</option>
        </select>
      </label>
      <button type="button" @click="importGraph">{{ t({ en: 'Import', ja: '読み込む' }) }}</button>
      <button type="button" @click="exportGraph">{{ t({ en: 'Export', ja: '書き出す' }) }}</button>
      <button type="button" @click="save">{{ t({ en: 'Download', ja: 'ダウンロード' }) }}</button>
      <button type="button" @click="reset">{{ t({ en: 'Reset example', ja: '例をリセット' }) }}</button>
    </div>
    <div class="interchange-layout">
      <NetworkGraph :nodes="graph.nodes" :edges="graph.edges" :groups="graph.groups" :positions="graph.positions" :sizes="graph.sizes"
        :options="{ direction }" draggable :height="440" :labels="{ ...labels.graph, region: t({ en: 'Imported diagram', ja: '読み込んだ図' }) }"
        @node-move="move([$event])" @nodes-move="move" />
      <div class="interchange-text">
        <textarea v-model="text" :aria-label="t({ en: 'Diagram text', ja: '図のテキスト' })" spellcheck="false" wrap="off" />
        <ul v-if="warnings.length" class="interchange-warnings" :aria-label="t({ en: 'Import warnings', ja: '読み込みの警告' })">
          <li v-for="(warning, index) in warnings" :key="index"><code>{{ warning.code }}</code> {{ warning.message }}</li>
        </ul>
      </div>
    </div>
    <StatusLine :label="t({ en: 'Interchange status', ja: '入出力の状態' })">{{ status }}</StatusLine>
  </DemoPanel>
</template>

<style scoped>
.interchange-options { flex-wrap: wrap; gap: 10px 16px; margin-bottom: 8px; }
.interchange-layout { display: grid; grid-template-columns: minmax(0, 3fr) minmax(280px, 2fr); gap: 12px; align-items: start; }
.interchange-text { display: grid; gap: 8px; }
.interchange-text textarea {
  box-sizing: border-box; width: 100%; height: 440px; resize: vertical; padding: 8px;
  font: 12px/1.45 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  color: var(--vw-text, #162e40); background: var(--vw-surface, #fff); border: 1px solid var(--vw-border, #c9d6de); border-radius: 6px;
}
.interchange-warnings { margin: 0; padding: 0 0 0 18px; font-size: 12px; color: var(--vw-muted, #4f6574); max-height: 160px; overflow: auto; }
.interchange-warnings code { color: var(--vw-text, #162e40); }
@media (max-width: 900px) {
  .interchange-layout { grid-template-columns: 1fr; }
}
</style>
