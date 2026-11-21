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
  { id: 'start', label: 'Start', detail: 'Where the flow begins', shape: 'ellipse', tone: 'teal', section: 'Flow', data: { kind: 'event' } },
  { id: 'step', label: 'Step', detail: 'A unit of work', shape: 'box', tone: 'blue', section: 'Flow', keywords: ['task', 'activity'], data: { kind: 'task' } },
  { id: 'subprocess', label: 'Subprocess', detail: 'A reusable flow', shape: 'rounded', tone: 'blue', section: 'Flow', data: { kind: 'task' } },
  { id: 'decision', label: 'Decision', detail: 'Branch on a condition', shape: 'diamond', tone: 'violet', section: 'Flow', keywords: ['gateway', 'if'], data: { kind: 'gateway' } },
  { id: 'end', label: 'End', detail: 'Where the flow stops', shape: 'ellipse', tone: 'amber', section: 'Flow', data: { kind: 'event' } },
  { id: 'store', label: 'Data store', detail: 'Read or written data', shape: 'hexagon', tone: 'teal', section: 'Data', keywords: ['database'], data: { kind: 'data' } },
]

const history = useEditHistory<Diagram>({
  nodes: [
    { id: 'start-1', label: 'Request received', shape: 'ellipse', tone: 'teal', data: { accent: '#2b756b' } },
    { id: 'step-1', label: 'Check request', detail: 'Clerk', shape: 'box', tone: 'blue', data: { accent: '#29609a' } },
    { id: 'decision-1', label: 'Approved?', shape: 'diamond', tone: 'violet', data: { accent: '#624888' } },
    { id: 'end-1', label: 'Done', shape: 'ellipse', tone: 'amber', data: { accent: '#825411' } },
  ],
  edges: [
    { id: 'e1', from: 'start-1', to: 'step-1' },
    { id: 'e2', from: 'step-1', to: 'decision-1' },
    { id: 'e3', from: 'decision-1', to: 'end-1', label: 'yes' },
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
const selectedId = ref<string>('step-1')
const status = ref('Drag a shape onto the diagram, or focus one and press Enter.')
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
  status.value = 'Added ' + node.label + '.'
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
  status.value = changes.length === 1 ? 'Moved ' + label(changes[0]!.id) + '.' : 'Moved ' + changes.length + ' nodes.'
}
function connect(connection: GraphConnection) {
  const id = 'e' + unusedNumber(diagram.value.edges, 'e')
  commit({ edges: [...diagram.value.edges, { id, from: connection.from, to: connection.to }] })
  status.value = 'Connected ' + label(connection.from) + ' to ' + label(connection.to) + '.'
}
function validateConnection(connection: GraphConnection) {
  if (connection.from === connection.to) return 'A node cannot connect to itself.'
  if (diagram.value.edges.some(edge => edge.from === connection.from && edge.to === connection.to)) return 'These nodes are already connected.'
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
  status.value = 'Deleted ' + deletion.nodeIds.length + ' node(s) and ' + removedEdges + ' edge(s).'
}
const label = (id: string) => diagram.value.nodes.find(node => node.id === id)?.label ?? id

// Inspector: typed fields of the selected node. The parent applies each accepted change as one history entry.
const selectedNode = computed(() => diagram.value.nodes.find(node => node.id === selectedId.value) ?? null)
const shapes: readonly NetworkNodeShape[] = ['box', 'rounded', 'diamond', 'ellipse', 'hexagon']
const fields = computed<InspectorField<DiagramNode>[]>(() => [
  { id: 'id', kind: 'text', label: 'ID', get: node => node.id, readonly: true },
  { id: 'label', kind: 'text', label: 'Label', get: node => node.label, required: true, description: 'Must be unique in the diagram.' },
  { id: 'detail', kind: 'text', label: 'Detail', get: node => node.detail ?? null, placeholder: 'Optional second line' },
  { id: 'shape', kind: 'select', label: 'Shape', get: node => node.shape ?? 'box', required: true, choices: shapes.map(value => ({ value, label: value[0]!.toUpperCase() + value.slice(1) })) },
  {
    id: 'tone', kind: 'select', label: 'Colour', get: node => node.tone ?? 'blue', required: true,
    choices: [{ value: 'teal', label: 'Teal' }, { value: 'blue', label: 'Blue' }, { value: 'amber', label: 'Amber' }, { value: 'violet', label: 'Violet' }],
  },
  { id: 'accent', kind: 'color', label: 'Accent', get: node => node.data?.accent ?? null, description: 'Kept in the node data for exports.' },
  {
    id: 'width', kind: 'number', label: 'Width', integer: true, min: 100, max: 320, required: true,
    get: node => diagram.value.sizes.get(node.id)?.width ?? defaultWidth,
  },
  { id: 'locked', kind: 'checkbox', label: 'Lock position', get: node => node.draggable === false },
])
function validateChange(change: InspectorChange) {
  if (change.field === 'label' && diagram.value.nodes.some(node => node.id !== change.id && node.label === change.after)) {
    return 'Another node is already called ' + String(change.after) + '.'
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
  status.value = 'Changed ' + change.field + ' of ' + label(change.id) + ' to ' + String(after) + '.'
}
function rejectChange(_change: InspectorChange, reason: string) {
  status.value = 'Rejected: ' + reason
}
</script>

<template>
  <DemoPanel title-id="diagram-editor-title" title="Diagram editor" subtitle="Drag shapes from the palette, connect them on the canvas and edit the selected node in the inspector.">
    <template #options>
      <button type="button" :disabled="!history.canUndo.value" @click="history.undo">Undo</button>
      <button type="button" :disabled="!history.canRedo.value" @click="history.redo">Redo</button>
      <label><input v-model="rtl" type="checkbox"> Right to left</label>
    </template>
    <div class="diagram-editor" :dir="rtl ? 'rtl' : undefined">
      <aside class="diagram-editor-side">
        <h3>Shapes</h3>
        <GraphPalette :items="templates" searchable :dir="rtl ? 'rtl' : 'ltr'" :labels="{ region: 'Shapes' }" @insert="insertNode" />
      </aside>
      <NetworkGraph ref="graph" v-model:selected-id="selectedId" class="diagram-editor-canvas" :nodes="diagram.nodes" :edges="diagram.edges"
        :positions="diagram.positions" :sizes="diagram.sizes" :height="460" :snap-grid="grid" background="dots"
        draggable connectable deletable droppable alignment-guides :validate-connection="validateConnection"
        :labels="{ region: 'Diagram canvas' }"
        @node-move="change => moveNodes([change])" @nodes-move="moveNodes" @connect="connect" @delete="deleteElements" @node-drop="dropNode" />
      <aside class="diagram-editor-side">
        <h3>Properties</h3>
        <PropertyInspector :item="selectedNode" :fields="fields" :validate-change="validateChange" :dir="rtl ? 'rtl' : 'ltr'"
          :labels="{ region: 'Node properties', empty: 'Select a node to edit it.' }" @change="applyChange" @change-rejected="rejectChange" />
      </aside>
    </div>
    <StatusLine label="Diagram editor status">{{ status }}</StatusLine>
  </DemoPanel>
</template>

<style scoped>
.diagram-editor { display: grid; grid-template-columns: 200px minmax(0, 1fr) 230px; gap: 14px; align-items: start; }
.diagram-editor-side { min-width: 0; }
.diagram-editor-side h3 { margin: 0 0 8px; font-size: 13px; }
@media (max-width: 900px) {
  .diagram-editor { grid-template-columns: minmax(0, 1fr); }
}
</style>
