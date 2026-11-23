<script setup lang="ts">
// A small diagram editor built from the editor parts: GraphPalette on the left (drag a shape onto the graph, or press
// Enter on it to add it at the centre of the view), NetworkGraph in the middle (move, connect, delete) and
// PropertyInspector on the right for the selected node. Every accepted change is one useEditHistory entry.
import { computed, ref } from 'vue'
import {
  GraphPalette, NetworkGraph, PropertyInspector, readPaletteDrop, removeGraphElements, snapGraphPoint, useEditHistory,
  type GraphConnection, type GraphDeletion, type GraphDrop, type GraphEdge, type GraphNodeMove, type GraphNodeSize,
  type GraphPaletteItem, type GraphPoint, type InspectorChange, type InspectorField, type NetworkNode, type NetworkNodeShape,
} from '../src'
import DemoPanel from './components/DemoPanel.vue'
import StatusLine from './components/StatusLine.vue'
import { unusedNumber } from './ids'
import { useDemoLocale } from './i18n'

const { t, labels } = useDemoLocale()

type DiagramNode = NetworkNode<{ accent: string }>
interface Diagram {
  nodes: readonly DiagramNode[]
  edges: readonly GraphEdge[]
  positions: ReadonlyMap<string, GraphPoint>
  sizes: ReadonlyMap<string, GraphNodeSize>
}

const grid = 20
const nodeHeight = 58
const defaultWidth = 144

const templates: readonly GraphPaletteItem<{ kind: string }>[] = [
  { id: 'start', label: t({ en: 'Start', ja: '開始' }), detail: t({ en: 'Where the flow begins', ja: 'フローの始まり' }), shape: 'ellipse', tone: 'teal', section: t({ en: 'Flow', ja: 'フロー' }), data: { kind: 'event' } },
  { id: 'step', label: t({ en: 'Step', ja: '処理' }), detail: t({ en: 'A unit of work', ja: '作業の単位' }), shape: 'box', tone: 'blue', section: t({ en: 'Flow', ja: 'フロー' }), keywords: ['task', 'activity'], data: { kind: 'task' } },
  { id: 'subprocess', label: t({ en: 'Subprocess', ja: 'サブプロセス' }), detail: t({ en: 'A reusable flow', ja: '再利用できるフロー' }), shape: 'rounded', tone: 'blue', section: t({ en: 'Flow', ja: 'フロー' }), data: { kind: 'task' } },
  { id: 'decision', label: t({ en: 'Decision', ja: '判断' }), detail: t({ en: 'Branch on a condition', ja: '条件で分岐' }), shape: 'diamond', tone: 'violet', section: t({ en: 'Flow', ja: 'フロー' }), keywords: ['gateway', 'if'], data: { kind: 'gateway' } },
  { id: 'end', label: t({ en: 'End', ja: '終了' }), detail: t({ en: 'Where the flow stops', ja: 'フローの終わり' }), shape: 'ellipse', tone: 'amber', section: t({ en: 'Flow', ja: 'フロー' }), data: { kind: 'event' } },
  { id: 'store', label: t({ en: 'Data store', ja: 'データストア' }), detail: t({ en: 'Read or written data', ja: '読み書きするデータ' }), shape: 'hexagon', tone: 'teal', section: t({ en: 'Data', ja: 'データ' }), keywords: ['database'], data: { kind: 'data' } },
]

const history = useEditHistory<Diagram>({
  nodes: [
    { id: 'start-1', label: t({ en: 'Request received', ja: '申請受付' }), shape: 'ellipse', tone: 'teal', data: { accent: '#2b756b' } },
    { id: 'step-1', label: t({ en: 'Check request', ja: '申請を確認' }), detail: t({ en: 'Clerk', ja: '担当者' }), shape: 'box', tone: 'blue', data: { accent: '#29609a' } },
    { id: 'decision-1', label: t({ en: 'Approved?', ja: '承認?' }), shape: 'diamond', tone: 'violet', data: { accent: '#624888' } },
    { id: 'end-1', label: t({ en: 'Done', ja: '完了' }), shape: 'ellipse', tone: 'amber', data: { accent: '#825411' } },
  ],
  edges: [
    { id: 'e1', from: 'start-1', to: 'step-1' },
    { id: 'e2', from: 'step-1', to: 'decision-1' },
    { id: 'e3', from: 'decision-1', to: 'end-1', label: t({ en: 'yes', ja: 'はい' }) },
  ],
  positions: new Map([
    ['start-1', { x: 20, y: 100 }], ['step-1', { x: 220, y: 100 }], ['decision-1', { x: 420, y: 100 }], ['end-1', { x: 620, y: 100 }],
  ]),
  sizes: new Map(),
})
const diagram = computed(() => history.state.value)
const graph = ref<InstanceType<typeof NetworkGraph>>()
// The graph re-fits to its content while its camera has not been placed. Pin the camera at the first edit, so a drop
// stays where it was dropped and the view does not jump while the diagram grows.
let pinned = false
function commit(change: Partial<Diagram>) {
  const view = graph.value
  if (!pinned && view) {
    view.setViewport(view.getViewport())
    pinned = true
  }
  history.commit({ ...history.state.value, ...change })
}
const selectedId = ref<string | undefined>('step-1')
const status = ref(t({ en: 'Drag a shape onto the diagram, or focus one and press Enter.', ja: '図形を図へドラッグするか、フォーカスして Enter を押してください。' }))
const rtl = ref(false)

// Palette: a drop and a keyboard insert both centre a new node on a chart point.
function addNode(template: GraphPaletteItem<{ kind: string }>, center: GraphPoint) {
  const number = unusedNumber(diagram.value.nodes, template.id + '-')
  const id = template.id + '-' + number
  const node: DiagramNode = {
    id, label: template.label + ' ' + number, shape: template.shape, tone: template.tone ?? 'blue', data: { accent: '#29609a' },
  }
  const corner = snapGraphPoint({ x: center.x - defaultWidth / 2, y: center.y - nodeHeight / 2 }, grid)
  commit({
    nodes: [...diagram.value.nodes, node],
    positions: new Map(diagram.value.positions).set(id, { x: Math.max(0, corner.x), y: Math.max(0, corner.y) }),
  })
  selectedId.value = id
  status.value = t({ en: 'Added ' + node.label + '.', ja: node.label + ' を追加しました。' })
}
function dropNode(drop: GraphDrop) {
  const dropped = readPaletteDrop(drop)
  // Look the ID up in our own templates; the drag data could come from any page.
  const template = dropped && templates.find(item => item.id === dropped.id)
  if (template) addNode(template, graph.value?.toGraphPoint(drop.clientX, drop.clientY) ?? drop.point)
}
function insertNode(template: GraphPaletteItem<{ kind: string }>) {
  const center = graph.value?.getViewportCenter()
  if (center) addNode(template, center)
}

// Graph proposals.
function moveNodes(changes: readonly GraphNodeMove[]) {
  const positions = new Map(diagram.value.positions)
  for (const change of changes) positions.set(change.id, change.after)
  commit({ positions })
  status.value = changes.length === 1
    ? t({ en: 'Moved ' + label(changes[0]!.id) + '.', ja: label(changes[0]!.id) + ' を移動しました。' })
    : t({ en: 'Moved ' + changes.length + ' nodes.', ja: changes.length + ' 個のノードを移動しました。' })
}
function connect(connection: GraphConnection) {
  const id = 'e' + unusedNumber(diagram.value.edges, 'e')
  commit({ edges: [...diagram.value.edges, { id, from: connection.from, to: connection.to }] })
  status.value = t({ en: 'Connected ' + label(connection.from) + ' to ' + label(connection.to) + '.', ja: label(connection.from) + ' を ' + label(connection.to) + ' に接続しました。' })
}
function validateConnection(connection: GraphConnection) {
  if (connection.from === connection.to) return t({ en: 'A node cannot connect to itself.', ja: 'ノードを自分自身に接続することはできません。' })
  if (diagram.value.edges.some(edge => edge.from === connection.from && edge.to === connection.to)) return t({ en: 'These nodes are already connected.', ja: 'これらのノードはすでに接続されています。' })
}
function deleteElements(deletion: GraphDeletion) {
  const { nodes, edges } = removeGraphElements(diagram.value.nodes, diagram.value.edges, deletion)
  const positions = new Map(diagram.value.positions), sizes = new Map(diagram.value.sizes)
  for (const id of deletion.nodeIds) {
    positions.delete(id)
    sizes.delete(id)
  }
  const removedEdges = diagram.value.edges.length - edges.length
  commit({ nodes, edges, positions, sizes })
  status.value = t({ en: 'Deleted ' + deletion.nodeIds.length + ' node(s) and ' + removedEdges + ' edge(s).', ja: 'ノード ' + deletion.nodeIds.length + ' 個と辺 ' + removedEdges + ' 本を削除しました。' })
}
// A click on the empty canvas or Escape in it clears the selection, and the inspector shows its empty state. Escape
// first cancels a gesture in flight (a drag or a connection); the graph reports every gesture as a start and an end,
// and the capture listener reads the count before the graph's own Escape handler ends it.
const gesture = { count: 0, cancelling: false }
function clearSelection() {
  selectedId.value = undefined
}
const label = (id: string) => diagram.value.nodes.find(node => node.id === id)?.label ?? id

// Inspector: typed fields of the selected node. The parent applies each accepted change as one history entry.
const selectedNode = computed(() => diagram.value.nodes.find(node => node.id === selectedId.value) ?? null)
const shapes: readonly NetworkNodeShape[] = ['box', 'rounded', 'diamond', 'ellipse', 'hexagon']
const shapeNamesJa: Record<string, string> = { box: '四角形', rounded: '角丸', diamond: 'ひし形', ellipse: '楕円', hexagon: '六角形' }
const fields = computed<InspectorField<DiagramNode>[]>(() => [
  { id: 'id', kind: 'text', label: 'ID', get: node => node.id, readonly: true },
  { id: 'label', kind: 'text', label: t({ en: 'Label', ja: 'ラベル' }), get: node => node.label, required: true, description: t({ en: 'Must be unique in the diagram.', ja: '図の中で重複しない名前にしてください。' }) },
  { id: 'detail', kind: 'text', label: t({ en: 'Detail', ja: '詳細' }), get: node => node.detail ?? null, placeholder: t({ en: 'Optional second line', ja: '任意の2行目' }) },
  { id: 'shape', kind: 'select', label: t({ en: 'Shape', ja: '形状' }), get: node => node.shape ?? 'box', required: true, choices: shapes.map(value => ({ value, label: t({ en: value[0]!.toUpperCase() + value.slice(1), ja: shapeNamesJa[value]! }) })) },
  {
    id: 'tone', kind: 'select', label: t({ en: 'Colour', ja: '色' }), get: node => node.tone ?? 'blue', required: true,
    choices: [
      { value: 'teal', label: t({ en: 'Teal', ja: '青緑' }) }, { value: 'blue', label: t({ en: 'Blue', ja: '青' }) },
      { value: 'amber', label: t({ en: 'Amber', ja: '琥珀' }) }, { value: 'violet', label: t({ en: 'Violet', ja: '紫' }) },
    ],
  },
  { id: 'accent', kind: 'color', label: t({ en: 'Accent', ja: 'アクセント' }), get: node => node.data?.accent ?? null, description: t({ en: 'Kept in the node data for exports.', ja: '出力用にノードのデータに保存します。' }) },
  {
    id: 'width', kind: 'number', label: t({ en: 'Width', ja: '幅' }), integer: true, min: 100, max: 320, required: true,
    get: node => diagram.value.sizes.get(node.id)?.width ?? defaultWidth,
  },
  { id: 'locked', kind: 'checkbox', label: t({ en: 'Lock position', ja: '位置を固定' }), get: node => node.draggable === false },
])
function validateChange(change: InspectorChange) {
  if (change.field === 'label' && diagram.value.nodes.some(node => node.id !== change.id && node.label === change.after)) {
    return t({ en: 'Another node is already called ' + String(change.after) + '.', ja: String(change.after) + ' という名前のノードはすでにあります。' })
  }
}
function applyChange(change: InspectorChange) {
  const { after } = change
  if (change.field === 'width') {
    commit({ sizes: new Map(diagram.value.sizes).set(change.id, { width: after as number, height: nodeHeight }) })
  } else {
    const update = (node: DiagramNode): DiagramNode => {
      switch (change.field) {
        case 'label': return { ...node, label: after as string }
        case 'detail': return { ...node, detail: after === null ? undefined : after as string }
        case 'shape': return { ...node, shape: after as NetworkNodeShape }
        case 'tone': return { ...node, tone: after as DiagramNode['tone'] }
        case 'accent': return { ...node, data: { accent: after as string } }
        case 'locked': return { ...node, draggable: after ? false : undefined }
        default: return node
      }
    }
    commit({ nodes: diagram.value.nodes.map(node => node.id === change.id ? update(node) : node) })
  }
  const fieldName = fields.value.find(field => field.id === change.field)?.label ?? change.field
  status.value = t({ en: 'Changed ' + change.field + ' of ' + label(change.id) + ' to ' + String(after) + '.', ja: label(change.id) + ' の' + fieldName + 'を ' + String(after) + ' に変更しました。' })
}
function rejectChange(_change: InspectorChange, reason: string) {
  status.value = t({ en: 'Rejected: ', ja: '却下: ' }) + reason
}
</script>

<template>
  <DemoPanel title-id="diagram-editor-title" :title="t({ en: 'Diagram editor', ja: 'ダイアグラムエディター' })" :subtitle="t({ en: 'Drag shapes from the palette, connect them on the canvas and edit the selected node in the inspector.', ja: 'パレットから図形をドラッグし、キャンバスで接続して、選択したノードをインスペクターで編集します。' })">
    <template #options>
      <button type="button" :disabled="!history.canUndo.value" @click="history.undo">{{ t({ en: 'Undo', ja: '元に戻す' }) }}</button>
      <button type="button" :disabled="!history.canRedo.value" @click="history.redo">{{ t({ en: 'Redo', ja: 'やり直す' }) }}</button>
      <label><input v-model="rtl" type="checkbox"> {{ t({ en: 'Right to left', ja: '右から左' }) }}</label>
    </template>
    <div class="diagram-editor" :dir="rtl ? 'rtl' : undefined">
      <aside class="diagram-editor-side">
        <h3>{{ t({ en: 'Shapes', ja: '図形' }) }}</h3>
        <GraphPalette :items="templates" searchable :dir="rtl ? 'rtl' : 'ltr'" :labels="{ ...labels.palette, region: t({ en: 'Shapes', ja: '図形' }) }" @insert="insertNode" />
      </aside>
      <div class="diagram-editor-canvas" @keydown.esc.capture="gesture.cancelling = gesture.count > 0" @keydown.esc="gesture.cancelling || clearSelection()">
        <NetworkGraph ref="graph" v-model:selected-id="selectedId" :nodes="diagram.nodes" :edges="diagram.edges"
          :positions="diagram.positions" :sizes="diagram.sizes" :height="460" :snap-grid="grid" background="dots"
          draggable connectable deletable droppable alignment-guides :validate-connection="validateConnection"
          :labels="{ ...labels.graph, region: t({ en: 'Diagram canvas', ja: '図のキャンバス' }) }"
          @node-move="change => moveNodes([change])" @nodes-move="moveNodes" @connect="connect" @delete="deleteElements" @node-drop="dropNode"
          @background-click="clearSelection" @gesture-start="gesture.count++" @gesture-end="gesture.count--" />
      </div>
      <aside class="diagram-editor-side">
        <h3>{{ t({ en: 'Properties', ja: 'プロパティ' }) }}</h3>
        <PropertyInspector :item="selectedNode" :fields="fields" :validate-change="validateChange" :dir="rtl ? 'rtl' : 'ltr'"
          :labels="{ ...labels.inspector, region: t({ en: 'Node properties', ja: 'ノードのプロパティ' }), empty: t({ en: 'Select a node to edit it.', ja: 'ノードを選ぶと編集できます。' }) }" @change="applyChange" @change-rejected="rejectChange" />
      </aside>
    </div>
    <StatusLine :label="t({ en: 'Diagram editor status', ja: 'エディターの状態' })">{{ status }}</StatusLine>
  </DemoPanel>
</template>

<style scoped>
.diagram-editor { display: grid; grid-template-columns: 200px minmax(0, 1fr) 230px; gap: 14px; align-items: start; }
.diagram-editor-side, .diagram-editor-canvas { min-width: 0; }
.diagram-editor-side h3 { margin: 0 0 8px; font-size: 13px; }
@media (max-width: 900px) {
  .diagram-editor { grid-template-columns: minmax(0, 1fr); }
}
</style>
