<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, shallowRef, useId, watch } from 'vue'
import type { NetworkNode, GraphLabels, GraphLayoutFunction, GraphViewport, NetworkFocusOptions, NetworkGroup, NetworkNodeSlot } from '../core/types.js'
import type { GraphContextMenu, GraphContextMenuTarget, GraphFitOptions, NetworkTooltipSlot } from '../core/types.js'
import { applyGraphPositions, graphPortAnchor, graphEdgeEndpoint, indexGraph, layoutLayeredGraph, routeGraphPorts, type GraphEdge, type GraphLayeredLayoutOptions, type GraphPoint, type GraphNodeMove, type GraphConnection, type GraphPort, type GraphReconnect } from '../core/graph.js'
import { cullGraphElements, graphCameraAt, graphLayoutBounds, graphPathEndpoints, graphViewportRect } from '../core/graphView.js'
import { graphDeletion, type GraphDeletion } from '../core/graphEditing.js'
import type { ChartDirection, GraphExportOptions, GraphPngExportOptions } from '../core/types.js'
import { renderGraphSvg } from '../core/exportSvg.js'
import { exportFont, rasterizeSvg, readExportTheme } from './exportImage.js'

const props = withDefaults(defineProps<{
  nodes: readonly NetworkNode[]
  edges: readonly GraphEdge[]
  selectedId?: string
  selectedIds?: ReadonlySet<string>
  positions?: ReadonlyMap<string, GraphPoint>
  draggable?: boolean
  connectable?: boolean
  reconnectable?: boolean
  boxSelect?: boolean
  groups?: readonly NetworkGroup[]
  validateConnection?: (connection: GraphConnection, replacingEdgeId?: string) => boolean | string | void
  showMinimap?: boolean
  relatedIds?: ReadonlySet<string>
  options?: GraphLayeredLayoutOptions
  layout?: GraphLayoutFunction
  labels?: Partial<GraphLabels>
  height?: number | string
  showControls?: boolean
  cullOffscreen?: boolean
  cullOverscan?: number
  matchIds?: ReadonlySet<string>
  dimmedIds?: ReadonlySet<string>
  dir?: ChartDirection
  edgesSelectable?: boolean
  selectedEdgeIds?: ReadonlySet<string>
  deletable?: boolean
  validateDelete?: (deletion: GraphDeletion) => boolean | string | void
  contextMenu?: boolean
  tooltipDelay?: number
}>(), { showControls: true, cullOverscan: 200, dir: 'ltr', tooltipDelay: 400 })
const emit = defineEmits<{
  select: [id: string]
  'update:selectedId': [id: string]
  'update:selectedIds': [ids: Set<string>]
  'node-move': [change: GraphNodeMove]
  'nodes-move': [changes: GraphNodeMove[]]
  reconnect: [change: GraphReconnect]
  connect: [connection: GraphConnection]
  'connect-rejected': [connection: GraphConnection, reason: string]
  'viewport-change': [viewport: GraphViewport]
  'update:selectedEdgeIds': [ids: Set<string>]
  'edge-select': [id: string]
  delete: [deletion: GraphDeletion]
  'delete-rejected': [deletion: GraphDeletion, reason: string]
  'context-menu': [event: GraphContextMenu]
}>()
const slots = defineSlots<{
  node(props: NetworkNodeSlot): unknown
  edge(props: { edge: GraphEdge; path: string; selected: boolean; dimmed?: boolean }): unknown
  empty(): unknown
  tooltip?(props: NetworkTooltipSlot): unknown
}>()
const messages = computed<GraphLabels>(() => ({
  region: 'Network graph', empty: 'No nodes to display', zoom: 'Graph zoom',
  zoomIn: 'Zoom in', zoomOut: 'Zoom out', fit: 'Fit to view',
  minimap: 'Navigate graph overview', connectFrom: 'Start connection from', connectTo: 'Connect to',
  reconnectSource: 'Reconnect source of', reconnectTarget: 'Reconnect target of', moveGroup: 'Move group',
  rejected: 'This connection was rejected.', selectEdge: 'Select edge', groupWithin: 'within',
  deleteRejected: 'This deletion was rejected.', ...props.labels,
}))
function isSelected(id: string) {
  return props.selectedIds ? props.selectedIds.has(id) : props.selectedId === id
}
function select(id: string, event: MouseEvent | KeyboardEvent) {
  const toggle = event.ctrlKey || event.metaKey || event.shiftKey
  if (props.selectedIds) {
    const ids = new Set(toggle ? props.selectedIds : [])
    if (toggle && ids.has(id)) ids.delete(id)
    else ids.add(id)
    emit('update:selectedIds', ids)
  }
  // With edge selection, a plain node selection replaces the edge selection as well.
  if (props.edgesSelectable && !toggle) clearEdgeSelection()
  emit('select', id)
  emit('update:selectedId', id)
}
const svg = ref<SVGSVGElement>()
const root = ref<HTMLElement>()
const marker = useId()
// Derived from the marker ID so a second useId call does not shift the IDs of components rendered after this one.
const tooltipId = marker + '-tooltip'
// Right-to-left only affects chrome and label alignment; graph geometry stays as laid out.
const inheritedRtl = ref(false)
const rtl = computed(() => props.dir === 'rtl' || (props.dir === 'auto' && inheritedRtl.value))
function detectDirection() {
  const element = root.value
  inheritedRtl.value = props.dir === 'auto' && element !== undefined && getComputedStyle(element).direction === 'rtl'
}
watch(() => props.dir, detectDirection, { flush: 'post' })
const viewport = ref({ width: 1150, height: 270 })
const options = computed<GraphLayeredLayoutOptions>((previous) => {
  const next = props.options
  const value = {
    direction: next?.direction, nodeWidth: next?.nodeWidth, nodeHeight: next?.nodeHeight,
    columnGap: next?.columnGap, rowGap: next?.rowGap, padding: next?.padding,
    crossingReduction: next?.crossingReduction, crossingSweeps: next?.crossingSweeps,
  }
  return previous && (Object.keys(value) as (keyof GraphLayeredLayoutOptions)[]).every(key => previous[key] === value[key])
    ? previous : value
})
const baseLayout = computed(() => {
  if (props.layout) indexGraph(props.nodes, props.edges)
  const result = props.layout ? props.layout(props.nodes, props.edges) : layoutLayeredGraph(props.nodes, props.edges, options.value)
  if (!Number.isFinite(result.width) || !Number.isFinite(result.height) || result.width <= 0 || result.height <= 0) {
    throw new Error('A custom layout must return positive finite dimensions')
  }
  for (const node of props.nodes) {
    const box = result.boxes.get(node.id)
    if (!box || ![box.x, box.y, box.width, box.height].every(Number.isFinite) || box.width <= 0 || box.height <= 0) {
      throw new Error('Missing or invalid layout box: ' + node.id)
    }
  }
  for (const edge of props.edges) {
    if (!result.paths.has(edge.id)) throw new Error('Missing layout path: ' + edge.id)
  }
  return result
})
const nodesById = computed(() => new Map(props.nodes.map(node => [node.id, node])))
const edgesById = computed(() => new Map(props.edges.map(edge => [edge.id, edge])))
const direction = computed(() => options.value.direction ?? 'LR')
const dragPreview = ref<ReadonlyMap<string, GraphPoint>>()
const savedLayout = computed(() => props.positions?.size
  ? applyGraphPositions(baseLayout.value, props.edges, props.positions, direction.value)
  : baseLayout.value)
const savedRouted = computed(() => routeGraphPorts(savedLayout.value, nodesById.value, props.edges, direction.value))
const layout = computed(() => {
  if (!dragPreview.value) return savedRouted.value
  const positions = new Map([...props.positions ?? [], ...dragPreview.value])
  return routeGraphPorts(applyGraphPositions(baseLayout.value, props.edges, positions, direction.value), nodesById.value, props.edges, direction.value)
})
const positioned = computed(() => props.nodes.map(node => ({ ...node, box: layout.value.boxes.get(node.id)! })))

type GroupShape = NetworkGroup & { members: string[]; depth: number; parentLabel?: string }
const groupMembership = computed<GroupShape[]>(() => {
  const list = props.groups ?? []
  const byId = new Map<string, NetworkGroup>(), members = new Set<string>()
  for (const group of list) {
    if (!group.id || byId.has(group.id)) throw new Error('Invalid graph group: ' + group.id)
    byId.set(group.id, group)
    for (const id of group.nodeIds) {
      if (!nodesById.value.has(id) || members.has(id)) throw new Error('Invalid or repeated group member: ' + id)
      members.add(id)
    }
  }
  const children = new Map<string, NetworkGroup[]>()
  const roots: NetworkGroup[] = []
  for (const group of list) {
    if (group.parentId === undefined) {
      roots.push(group)
      continue
    }
    if (!byId.has(group.parentId)) throw new Error('Unknown parent group: ' + group.parentId + ' (group ' + group.id + ')')
    let siblings = children.get(group.parentId)
    if (!siblings) children.set(group.parentId, siblings = [])
    siblings.push(group)
  }
  for (const group of list) {
    let current = group, steps = 0
    while (current.parentId !== undefined) {
      current = byId.get(current.parentId)!
      if (current === group || ++steps > list.length) throw new Error('Graph group hierarchy contains a cycle at group: ' + group.id)
    }
  }
  // Preorder with input-order siblings paints parents before their children.
  const order: { group: NetworkGroup; depth: number }[] = []
  const stack = roots.map(group => ({ group, depth: 0 })).reverse()
  while (stack.length) {
    const item = stack.pop()!
    order.push(item)
    const nested = children.get(item.group.id) ?? []
    for (let i = nested.length - 1; i >= 0; i--) stack.push({ group: nested[i]!, depth: item.depth + 1 })
  }
  const effective = new Map<string, string[]>()
  for (let i = order.length - 1; i >= 0; i--) {
    const group = order[i]!.group
    const all = [...group.nodeIds]
    for (const child of children.get(group.id) ?? []) all.push(...effective.get(child.id)!)
    if (!all.length) throw new Error('Invalid graph group: ' + group.id)
    effective.set(group.id, all)
  }
  return order.map(({ group, depth }) => ({
    ...group, members: effective.get(group.id)!, depth,
    parentLabel: group.parentId === undefined ? undefined : byId.get(group.parentId)!.label,
  }))
})
const shownGroups = computed(() => {
  const rects = new Map<string, { x: number; y: number; width: number; height: number }>()
  const nested = new Set(groupMembership.value.flatMap(group => group.parentId === undefined ? [] : [group.parentId]))
  const direct = (group: GroupShape) => {
    let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity
    for (const id of nested.has(group.id) ? group.nodeIds : group.members) {
      const box = layout.value.boxes.get(id)!
      left = Math.min(left, box.x)
      top = Math.min(top, box.y)
      right = Math.max(right, box.x + box.width)
      bottom = Math.max(bottom, box.y + box.height)
    }
    return { left, top, right, bottom }
  }
  // Children come after their parent in the list, so walking backwards sizes children first.
  const reversed = [...groupMembership.value].reverse()
  for (const group of reversed) {
    const { left, top, right, bottom } = direct(group)
    const x = Math.max(0, left - 10), y = Math.max(0, top - 23)
    let x1 = Math.min(layout.value.width, right + 10), y1 = Math.min(layout.value.height, bottom + 10)
    let x0 = x, y0 = y
    if (nested.has(group.id)) {
      // A parent encloses its children, the label strip of each child and the padding around them.
      if (left === Infinity) { x0 = Infinity; y0 = Infinity; x1 = -Infinity; y1 = -Infinity }
      for (const child of groupMembership.value) {
        if (child.parentId !== group.id) continue
        const rect = rects.get(child.id)!
        x0 = Math.min(x0, rect.x - 10)
        y0 = Math.min(y0, rect.y - 23)
        x1 = Math.max(x1, rect.x + rect.width + 10)
        y1 = Math.max(y1, rect.y + rect.height + 10)
      }
    }
    rects.set(group.id, { x: x0, y: y0, width: x1 - x0, height: y1 - y0 })
  }
  return groupMembership.value.map(group => ({ ...group, ...rects.get(group.id)! }))
})
function groupName(group: GroupShape) {
  return messages.value.moveGroup + ' ' + group.label + (group.parentLabel === undefined ? '' : ' ' + messages.value.groupWithin + ' ' + group.parentLabel)
}

type PortRef = { node: string; port?: string }
type PortHandle = PortRef & GraphPoint & { label: string; direction: NonNullable<GraphPort['direction']> }
const handles = computed(() => positioned.value.flatMap<PortHandle>(node => {
  if (!node.ports) return [{ node: node.id, label: node.label, direction: 'both' as const, port: undefined, x: direction.value === 'RL' ? node.box.x + 10 : node.box.x + node.box.width - 10, y: node.box.y + 11 }]
  return node.ports.map(port => ({
    node: node.id, port: port.id, label: node.label + ' · ' + (port.label ?? port.id),
    direction: port.direction ?? 'both', ...graphPortAnchor(node.box, port),
  }))
}))
const handleIndex = computed(() => new Map(handles.value.map((handle, index) => [portKey(handle), index])))
function portKey(ref: PortRef) {
  return JSON.stringify([ref.node, ref.port])
}

// The layout box plus every group rectangle. A group frames its nodes with a label strip and padding, so a group at
// the layout edge, and a parent of such a group, can reach past the layout's own origin and size.
const contentBounds = computed(() => {
  let left = 0, top = 0, right = layout.value.width, bottom = layout.value.height
  for (const group of shownGroups.value) {
    left = Math.min(left, group.x)
    top = Math.min(top, group.y)
    right = Math.max(right, group.x + group.width)
    bottom = Math.max(bottom, group.y + group.height)
  }
  return { left, top, right, bottom, width: right - left, height: bottom - top }
})

// Scale at which the whole graph fits the viewport.
const wholeScale = computed(() => {
  const { width, height } = viewport.value
  const content = contentBounds.value
  const scale = Math.min(width / content.width, height / content.height)
  return Number.isFinite(scale) && scale > 0 ? scale : 1
})
// The smallest scale is 0.1, or less when that is needed to show the whole graph.
const minScale = computed(() => Math.min(0.1, wholeScale.value))
function clampScale(scale: number) {
  return Math.max(minScale.value, Math.min(3, scale))
}
function validScale(scale: number) {
  // A small tolerance keeps a fitted viewport restorable after floating-point round trips.
  return Number.isFinite(scale) && scale >= minScale.value * (1 - 1e-9) && scale <= 3
}
function scaleError() {
  return new RangeError(`Viewport scale must be between ${minScale.value === 0.1 ? '0.1' : 'the fit scale ' + minScale.value} and 3`)
}

// Screen margin requested by the last fit({ padding }) of the whole graph; plain fit() resets it to 0.
let fitPadding = 0
function fitCamera(overview = false) {
  const { width, height } = viewport.value
  const geometry = layout.value
  const content = contentBounds.value
  const padded = overview && fitPadding > 0 ? Math.max(minScale.value, Math.min(
    Math.max(1, width - 2 * fitPadding) / content.width, Math.max(1, height - 2 * fitPadding) / content.height,
  )) : wholeScale.value
  // Fit to view shows the whole graph at any scale. The automatic initial view keeps at least 0.1 to stay readable.
  const overviewScale = Math.min(1.15, overview ? padded : Math.max(0.1, wholeScale.value))
  const scale = overview || width >= 650 ? overviewScale
    : Math.max(overviewScale, Math.min(0.72, height / content.height))
  const canvasWidth = content.width * scale
  const selected = props.selectedId ? geometry.boxes.get(props.selectedId) : undefined
  const focusX = selected ? (selected.x + selected.width / 2) * scale : 0
  const originX = -content.left * scale
  return {
    x: canvasWidth <= width ? (width - canvasWidth) / 2 + originX
      : Math.max(width - canvasWidth + originX, Math.min(originX, width / 2 - focusX)),
    y: (height - content.height * scale) / 2 - content.top * scale,
    scale,
  }
}

const camera = ref(fitCamera())
const fitMode = ref<'auto' | 'overview' | 'manual'>('auto')
const isPanning = ref(false)
let pan: { pointerId: number; x: number; y: number; cameraX: number; cameraY: number; box: boolean } | undefined
const boxPreview = ref<{ x: number; y: number; width: number; height: number }>()
let observer: ResizeObserver | undefined

/**
 * Without options, shows the whole graph. With `ids`, fits the combined boxes of those nodes at a scale between the
 * zoom minimum and 1.15, the largest scale Fit to view uses. `padding` keeps a screen margin around the content.
 */
function fit(options?: GraphFitOptions) {
  const padding = options?.padding ?? 0
  if (!Number.isFinite(padding) || padding < 0) throw new RangeError('Fit padding must be a nonnegative finite number of pixels')
  if (options?.ids === undefined) {
    cancelInteraction()
    fitMode.value = 'overview'
    fitPadding = padding
    camera.value = fitCamera(true)
    return
  }
  const ids = [...options.ids]
  for (const id of ids) if (!nodesById.value.has(id)) throw new Error('Unknown node: ' + id)
  if (!ids.length) return
  cancelInteraction()
  let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity
  for (const id of ids) {
    const box = layout.value.boxes.get(id)!
    left = Math.min(left, box.x)
    top = Math.min(top, box.y)
    right = Math.max(right, box.x + box.width)
    bottom = Math.max(bottom, box.y + box.height)
  }
  const { width, height } = viewport.value
  const scale = clampScale(Math.min(
    1.15, Math.max(1, width - 2 * padding) / (right - left), Math.max(1, height - 2 * padding) / (bottom - top),
  ))
  fitMode.value = 'manual'
  camera.value = graphCameraAt({ x: (left + right) / 2, y: (top + bottom) / 2 }, viewport.value, scale)
}

function zoom(factor: number, x = viewport.value.width / 2, y = viewport.value.height / 2) {
  cancelInteraction()
  if (![factor, x, y].every(Number.isFinite) || factor <= 0) throw new RangeError('Zoom requires a positive finite factor and finite coordinates')
  const current = camera.value
  const scale = clampScale(current.scale * factor)
  const ratio = scale / current.scale
  fitMode.value = 'manual'
  camera.value = { x: x - (x - current.x) * ratio, y: y - (y - current.y) * ratio, scale }
}

function onWheel(event: WheelEvent) {
  if (!event.ctrlKey || !event.deltaY || !svg.value) return
  event.preventDefault()
  const rect = svg.value.getBoundingClientRect()
  zoom(event.deltaY < 0 ? 1.15 : 1 / 1.15, event.clientX - rect.left, event.clientY - rect.top)
}

function startPan(event: PointerEvent) {
  if (!event.isPrimary || event.button !== 0 || !svg.value || nodeDrag || connectionDrag) return
  pan = {
    pointerId: event.pointerId,
    x: event.clientX,
    y: event.clientY,
    cameraX: camera.value.x,
    cameraY: camera.value.y,
    box: Boolean(props.boxSelect && event.shiftKey),
  }
  isPanning.value = !pan.box
  svg.value.setPointerCapture(event.pointerId)
}

let nodeDrag: { pointerId: number; start: GraphPoint; before: Map<string, GraphPoint>; target: SVGElement; node?: string } | undefined
let suppressClick: string | undefined
const noIds: ReadonlySet<string> = new Set()
const gestureIds = shallowRef(noIds)
const notice = ref('')

function movablePositions(ids: Iterable<string>) {
  const positions = new Map<string, GraphPoint>()
  for (const id of ids) {
    const box = savedLayout.value.boxes.get(id)
    if (box && nodesById.value.get(id)?.draggable !== false) positions.set(id, { x: box.x, y: box.y })
  }
  return positions
}

function movePositions(before: ReadonlyMap<string, GraphPoint>, dx: number, dy: number) {
  for (const point of before.values()) {
    dx = Math.max(dx, -point.x)
    dy = Math.max(dy, -point.y)
  }
  return new Map([...before].map(([id, point]) => [id, { x: point.x + dx, y: point.y + dy }]))
}
function emitMoves(before: ReadonlyMap<string, GraphPoint>, after: ReadonlyMap<string, GraphPoint>) {
  const changes: GraphNodeMove[] = []
  for (const [id, point] of after) {
    const previous = before.get(id)!
    if (previous.x !== point.x || previous.y !== point.y) changes.push({ id, before: previous, after: point })
  }
  if (changes.length === 1) emit('node-move', changes[0]!)
  else if (changes.length > 1) emit('nodes-move', changes)
}

function startNodeDrag(event: PointerEvent, ids: Iterable<string>, node?: string) {
  suppressClick = undefined
  if (!props.draggable || !event.isPrimary || event.button !== 0 || nodeDrag || pan || connectionDrag) return
  if (node && nodesById.value.get(node)?.draggable === false) return
  const before = movablePositions(ids)
  if (!before.size) return
  const target = event.currentTarget as SVGElement
  nodeDrag = { pointerId: event.pointerId, target, before, node, start: { x: event.clientX, y: event.clientY } }
  gestureIds.value = new Set(before.keys())
  target.focus({ preventScroll: true })
  target.setPointerCapture(event.pointerId)
}

function moveNode(event: PointerEvent) {
  if (!nodeDrag || nodeDrag.pointerId !== event.pointerId) return
  const dx = event.clientX - nodeDrag.start.x, dy = event.clientY - nodeDrag.start.y
  if (!dragPreview.value && Math.hypot(dx, dy) < 4) return
  const scale = camera.value.scale
  dragPreview.value = movePositions(nodeDrag.before, dx / scale, dy / scale)
}
function cancelNodeDrag() {
  const drag = nodeDrag
  nodeDrag = undefined
  gestureIds.value = noIds
  if (dragPreview.value && drag) suppressClick = drag.node
  dragPreview.value = undefined
  if (drag?.target.hasPointerCapture(drag.pointerId)) drag.target.releasePointerCapture(drag.pointerId)
}
function finishNodeDrag(event: PointerEvent) {
  if (!nodeDrag || nodeDrag.pointerId !== event.pointerId) return
  if (event.type !== 'pointerup') return cancelNodeDrag()
  moveNode(event)
  const { before } = nodeDrag
  const after = dragPreview.value
  cancelNodeDrag()
  if (after) emitMoves(before, after)
}
function clickNode(id: string, event: MouseEvent) {
  if (suppressClick === id) {
    suppressClick = undefined
    return
  }
  select(id, event)
}
function movingIds(id: string) {
  return props.selectedIds?.has(id) ? props.selectedIds : [id]
}
function moveWithKeys(event: KeyboardEvent, ids: Iterable<string>) {
  if (!props.draggable || nodeDrag) return
  const offsets: Record<string, [number, number]> = {
    ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1],
  }
  const offset = offsets[event.key]
  if (!offset) return
  const before = movablePositions(ids)
  if (!before.size) return
  event.preventDefault()
  const step = event.shiftKey ? 40 : 10
  emitMoves(before, movePositions(before, offset[0] * step, offset[1] * step))
}

type ConnectionDraft = { fixed: PortRef; end: 'from' | 'to'; edge?: GraphEdge }
const draft = ref<ConnectionDraft>()
const activeEdgeId = ref<string>()
const connectionPoint = ref<GraphPoint>()
let connectionDrag: { pointerId: number; target: SVGElement; start: GraphPoint } | undefined
let skipHandleClick = false
// The edge whose reconnect handles are shown. A controlled edge selection hides them once the edge leaves it.
const currentEdgeId = computed(() => {
  const id = activeEdgeId.value
  return id !== undefined && props.edgesSelectable && props.selectedEdgeIds && !props.selectedEdgeIds.has(id) ? undefined : id
})
function edgeSelected(id: string) {
  return props.selectedEdgeIds ? props.selectedEdgeIds.has(id) : activeEdgeId.value === id
}
function edgePressed(id: string) {
  return props.edgesSelectable ? edgeSelected(id) : activeEdgeId.value === id
}
function selectedEdgeList() {
  if (!props.edgesSelectable) return []
  const ids = props.selectedEdgeIds ? [...props.selectedEdgeIds] : activeEdgeId.value === undefined ? [] : [activeEdgeId.value]
  return ids.filter(id => edgesById.value.has(id))
}
function clearEdgeSelection() {
  const selected = props.selectedEdgeIds ? props.selectedEdgeIds.size > 0 : activeEdgeId.value !== undefined
  activeEdgeId.value = undefined
  if (selected) emit('update:selectedEdgeIds', new Set())
}
function selectEdge(id: string, event: MouseEvent | KeyboardEvent) {
  if (!props.edgesSelectable) {
    activeEdgeId.value = id
    return
  }
  const toggle = event.ctrlKey || event.metaKey || event.shiftKey
  const ids = new Set(toggle ? selectedEdgeList() : [])
  if (toggle && ids.has(id)) {
    ids.delete(id)
    if (activeEdgeId.value === id) activeEdgeId.value = undefined
  } else {
    ids.add(id)
    activeEdgeId.value = id
  }
  // A plain edge selection replaces a controlled node selection, mirroring node selection.
  if (!toggle && props.selectedIds?.size) emit('update:selectedIds', new Set())
  emit('update:selectedEdgeIds', ids)
  emit('edge-select', id)
}
const reconnectHandles = computed(() => {
  const edge = props.reconnectable && currentEdgeId.value ? edgesById.value.get(currentEdgeId.value) : undefined
  if (!edge) return []
  return (['from', 'to'] as const).map(end => {
    const { x, y, side } = graphEdgeEndpoint(layout.value, nodesById.value, edge, end, direction.value)
    const offsets = { left: [-14, 0], right: [14, 0], top: [0, -14], bottom: [0, 14] } as const
    const [dx, dy] = offsets[side]
    const label = end === 'from' ? messages.value.reconnectSource : messages.value.reconnectTarget
    return { edge, end, x: x + dx, y: y + dy, label: label + ' ' + (edge.label ?? edge.id) }
  })
})
function worldPoint(clientX: number, clientY: number) {
  const transform = svg.value?.getScreenCTM()
  if (!transform) return { x: 0, y: 0 }
  const point = new DOMPoint(clientX, clientY).matrixTransform(transform.inverse())
  return { x: (point.x - camera.value.x) / camera.value.scale, y: (point.y - camera.value.y) / camera.value.scale }
}

const connectionPath = computed(() => {
  const pending = draft.value, end = connectionPoint.value
  if (!pending || !end) return undefined
  const index = handleIndex.value.get(portKey(pending.fixed))
  const start = index === undefined ? undefined : handles.value[index]
  const origin = start ?? (pending.edge && graphEdgeEndpoint(
    layout.value, nodesById.value, pending.edge, pending.end === 'from' ? 'to' : 'from', direction.value,
  ))
  if (!origin) return undefined
  return `M ${origin.x} ${origin.y} L ${end.x} ${end.y}`
})
function captureConnection(event: PointerEvent) {
  const target = event.currentTarget as SVGElement
  connectionDrag = { pointerId: event.pointerId, target, start: { x: event.clientX, y: event.clientY } }
  target.focus({ preventScroll: true })
  target.setPointerCapture(event.pointerId)
}
function startPort(event: PointerEvent, handle: PortHandle) {
  skipHandleClick = false
  if (draft.value || !event.isPrimary || event.button !== 0 || handle.direction === 'target' || nodeDrag || pan) return
  draft.value = { fixed: handle, end: 'to' }
  captureConnection(event)
}
function reconnectEdge(edge: GraphEdge, end: 'from' | 'to', event?: PointerEvent) {
  if (event && (!event.isPrimary || event.button !== 0 || nodeDrag || pan || connectionDrag)) return
  skipHandleClick = false
  const fixed = end === 'from' ? { node: edge.to, port: edge.toPort } : { node: edge.from, port: edge.fromPort }
  draft.value = { fixed, end, edge }
  if (event) captureConnection(event)
}
function moveConnection(event: PointerEvent) {
  if (connectionDrag?.pointerId !== event.pointerId) return
  if (connectionPoint.value || Math.hypot(event.clientX - connectionDrag.start.x, event.clientY - connectionDrag.start.y) >= 4) {
    connectionPoint.value = worldPoint(event.clientX, event.clientY)
  }
}
function clearConnectionCapture() {
  const drag = connectionDrag
  connectionDrag = undefined
  connectionPoint.value = undefined
  if (drag?.target.hasPointerCapture(drag.pointerId)) drag.target.releasePointerCapture(drag.pointerId)
}
function finishConnection(event: PointerEvent) {
  if (connectionDrag?.pointerId !== event.pointerId) return
  if (event.type !== 'pointerup') {
    clearConnectionCapture()
    draft.value = undefined
    return
  }
  moveConnection(event)
  const dragged = Boolean(connectionPoint.value)
  clearConnectionCapture()
  // A press without movement leaves the source armed for a second click or key.
  if (!dragged) {
    skipHandleClick = true
    return
  }
  skipHandleClick = true
  const element = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-vft-port]')
  const key = element && svg.value?.contains(element) ? element.getAttribute('data-vft-port') : null
  const index = key === null ? undefined : handleIndex.value.get(key)
  if (index !== undefined) completeConnection(handles.value[index]!)
  else draft.value = undefined
}
function activatePort(handle: PortHandle, event: MouseEvent | KeyboardEvent) {
  if (event.type === 'click' && skipHandleClick) {
    skipHandleClick = false
    return
  }
  if (draft.value) completeConnection(handle)
  else if (handle.direction !== 'target') draft.value = { fixed: handle, end: 'to' }
}
function completeConnection(handle: PortHandle) {
  const pending = draft.value
  draft.value = undefined
  notice.value = ''
  if (!pending || pending.fixed.node === handle.node || handle.direction === (pending.end === 'from' ? 'target' : 'source')) return
  const [from, to] = pending.end === 'from' ? [handle, pending.fixed] : [pending.fixed, handle]
  const connection: GraphConnection = { from: from.node, to: to.node }
  if (from.port !== undefined) connection.fromPort = from.port
  if (to.port !== undefined) connection.toPort = to.port
  const edge = pending.edge
  if (edge && edge.from === connection.from && edge.to === connection.to && edge.fromPort === connection.fromPort && edge.toPort === connection.toPort) return
  const result = props.validateConnection?.(connection, edge?.id)
  if (result === false || typeof result === 'string') {
    notice.value = typeof result === 'string' ? result : messages.value.rejected!
    emit('connect-rejected', connection, notice.value)
  } else if (edge) {
    const { from, to, fromPort, toPort } = edge
    const before: GraphConnection = { from, to }
    if (fromPort !== undefined) before.fromPort = fromPort
    if (toPort !== undefined) before.toPort = toPort
    emit('reconnect', { id: edge.id, before, after: connection })
  } else {
    emit('connect', connection)
  }
}
function portPressed(handle: PortRef) {
  return draft.value && portKey(draft.value.fixed) === portKey(handle)
}
function cancelInteraction() {
  cancelNodeDrag()
  endPinch()
  if (connectionDrag) skipHandleClick = true
  clearConnectionCapture()
  draft.value = undefined
  const previousPan = pan
  pan = undefined
  boxPreview.value = undefined
  isPanning.value = false
  if (previousPan && svg.value?.hasPointerCapture(previousPan.pointerId)) svg.value.releasePointerCapture(previousPan.pointerId)
}
function navigateMinimap(event: MouseEvent) {
  const map = (event.currentTarget as HTMLButtonElement).querySelector('svg')
  const transform = map?.getScreenCTM()
  if (!map || !transform) return
  const point = map.createSVGPoint()
  point.x = event.clientX
  point.y = event.clientY
  const content = contentBounds.value
  const world = event.detail ? point.matrixTransform(transform.inverse()) : {
    x: (content.left + content.right) / 2, y: (content.top + content.bottom) / 2,
  }
  cancelInteraction()
  fitMode.value = 'manual'
  camera.value = {
    scale: camera.value.scale,
    x: viewport.value.width / 2 - Math.min(content.right, Math.max(content.left, world.x)) * camera.value.scale,
    y: viewport.value.height / 2 - Math.min(content.bottom, Math.max(content.top, world.y)) * camera.value.scale,
  }
}

function movePan(event: PointerEvent) {
  if (!pan || pan.pointerId !== event.pointerId) return
  if (pan.box) {
    const a = worldPoint(pan.x, pan.y), b = worldPoint(event.clientX, event.clientY)
    boxPreview.value = { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y) }
    return
  }
  fitMode.value = 'manual'
  camera.value = {
    ...camera.value,
    x: pan.cameraX + event.clientX - pan.x,
    y: pan.cameraY + event.clientY - pan.y,
  }
}

function stopPan(event: PointerEvent) {
  if (pan?.pointerId !== event.pointerId) return
  if (pan.box && event.type === 'pointerup' && Math.hypot(event.clientX - pan.x, event.clientY - pan.y) >= 4) {
    movePan(event)
    const area = boxPreview.value!
    const selection = new Set(event.ctrlKey || event.metaKey ? props.selectedIds : [])
    for (const [id, box] of layout.value.boxes) {
      if (box.x < area.x + area.width && box.x + box.width > area.x && box.y < area.y + area.height && box.y + box.height > area.y) selection.add(id)
    }
    emit('update:selectedIds', selection)
    if (props.edgesSelectable && !event.ctrlKey && !event.metaKey) clearEdgeSelection()
  }
  boxPreview.value = undefined
  pan = undefined
  isPanning.value = false
}

function panWithKeys(event: KeyboardEvent) {
  const directions: Record<string, [number, number]> = {
    ArrowLeft: [35, 0], ArrowRight: [-35, 0], ArrowUp: [0, 35], ArrowDown: [0, -35],
  }
  const step = directions[event.key]
  if (!step) return
  cancelInteraction()
  event.preventDefault()
  fitMode.value = 'manual'
  camera.value = { ...camera.value, x: camera.value.x + step[0], y: camera.value.y + step[1] }
}

function isDimmed(id: string) {
  return Boolean(props.dimmedIds?.has(id) || (props.matchIds && !props.matchIds.has(id)))
}
function edgeIsDimmed(edge: GraphEdge) {
  return isDimmed(edge.from) || isDimmed(edge.to)
}

// Viewport culling. Before mount the viewport is the 1150 x 270 default with the initial fit camera, so the
// server and the first client render agree; the measured size replaces it after mount.
const focused = ref<{ node?: string; edge?: string; group?: string }>()
function trackFocus(event: FocusEvent) {
  if (!props.cullOffscreen || !(event.target instanceof Element)) return
  const element = event.target.closest('[data-vft-node],[data-vft-edge],[data-vft-group]')
  focused.value = element ? {
    node: element.getAttribute('data-vft-node') ?? undefined,
    edge: element.getAttribute('data-vft-edge') ?? undefined,
    group: element.getAttribute('data-vft-group') ?? undefined,
  } : undefined
}
function releaseFocus(event: FocusEvent) {
  if (!(event.relatedTarget instanceof Node) || !svg.value?.contains(event.relatedTarget)) focused.value = undefined
}
// Bounds come from the saved layout, so a drag preview does not re-parse every edge path. Dragged nodes and
// the edges attached to them are kept rendered separately instead (see `visible`).
const layoutBounds = computed(() => props.cullOffscreen ? graphLayoutBounds(savedRouted.value) : undefined)
const incidentEdges = computed(() => {
  const index = new Map<string, string[]>()
  for (const edge of props.edges) {
    for (const id of edge.from === edge.to ? [edge.from] : [edge.from, edge.to]) {
      const list = index.get(id)
      if (list) list.push(edge.id)
      else index.set(id, [edge.id])
    }
  }
  return index
})
const visible = computed(() => {
  const bounds = layoutBounds.value
  if (!bounds) return undefined
  const view = graphViewportRect(camera.value, viewport.value, Math.max(0, props.cullOverscan ?? 0))
  const nodes = new Set<string>(props.selectedIds ?? (props.selectedId === undefined ? [] : [props.selectedId]))
  for (const id of gestureIds.value) nodes.add(id)
  const edges = new Set<string>()
  for (const id of dragPreview.value?.keys() ?? []) {
    nodes.add(id)
    for (const edgeId of incidentEdges.value.get(id) ?? []) edges.add(edgeId)
  }
  if (draft.value) nodes.add(draft.value.fixed.node)
  if (focused.value?.node) nodes.add(focused.value.node)
  for (const id of [currentEdgeId.value, draft.value?.edge?.id, focused.value?.edge]) if (id) edges.add(id)
  if (props.edgesSelectable) for (const id of props.selectedEdgeIds ?? []) edges.add(id)
  const result = cullGraphElements(bounds, view, { nodes, edges })
  const groups = new Set<string>()
  for (const group of shownGroups.value) {
    const near = group.x <= view.x + view.width && group.x + group.width >= view.x
      && group.y <= view.y + view.height && group.y + group.height >= view.y
    if (near || focused.value?.group === group.id || group.members.some(id => gestureIds.value.has(id) || dragPreview.value?.has(id))) groups.add(group.id)
  }
  return { ...result, groups }
})
const shownNodes = computed(() => visible.value ? positioned.value.filter(node => visible.value!.nodes.has(node.id)) : positioned.value)
const shownEdges = computed(() => visible.value ? props.edges.filter(edge => visible.value!.edges.has(edge.id)) : props.edges)
const renderedGroups = computed(() => visible.value ? shownGroups.value.filter(group => visible.value!.groups.has(group.id)) : shownGroups.value)
const renderedHandles = computed(() => visible.value ? handles.value.filter(handle => visible.value!.nodes.has(handle.node)) : handles.value)

// Two-finger pinch zoom and pan. Only touch pointers take part; mouse and pen input is unchanged.
const touches = new Map<number, GraphPoint>()
let pinch: { ids: number[]; distance: number; midpoint: GraphPoint; camera: GraphViewport } | undefined
const pinching = ref(false)
function releaseCapture(id: number) {
  try { if (svg.value?.hasPointerCapture(id)) svg.value.releasePointerCapture(id) } catch { /* the pointer is already gone */ }
}
function endPinch() {
  const previous = pinch
  pinch = undefined
  pinching.value = false
  for (const id of previous?.ids ?? []) releaseCapture(id)
}
function startTouch(event: PointerEvent) {
  if (event.pointerType !== 'touch' || !svg.value) return
  touches.set(event.pointerId, { x: event.clientX, y: event.clientY })
  if (touches.size !== 2) return
  // A second finger turns the gesture into a camera gesture and cancels any one-finger edit in flight.
  cancelInteraction()
  const ids = [...touches.keys()], [a, b] = [...touches.values()] as [GraphPoint, GraphPoint]
  for (const id of ids) {
    try { svg.value.setPointerCapture(id) } catch { /* synthetic pointers cannot be captured */ }
  }
  pinch = {
    ids, distance: Math.hypot(a.x - b.x, a.y - b.y), midpoint: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
    camera: { ...camera.value },
  }
  pinching.value = true
}
function moveTouch(event: PointerEvent) {
  const point = touches.get(event.pointerId)
  if (!point || event.pointerType !== 'touch') return
  point.x = event.clientX
  point.y = event.clientY
  if (!pinch?.ids.includes(event.pointerId) || !svg.value) return
  const [a, b] = pinch.ids.map(id => touches.get(id)!) as [GraphPoint, GraphPoint]
  const distance = Math.hypot(a.x - b.x, a.y - b.y)
  if (!(distance > 0) || !(pinch.distance > 0)) return
  const rect = svg.value.getBoundingClientRect()
  const start = pinch.camera
  const scale = clampScale(start.scale * distance / pinch.distance)
  // The world point under the initial midpoint follows the current midpoint.
  const worldX = (pinch.midpoint.x - rect.left - start.x) / start.scale
  const worldY = (pinch.midpoint.y - rect.top - start.y) / start.scale
  fitMode.value = 'manual'
  camera.value = {
    x: (a.x + b.x) / 2 - rect.left - worldX * scale,
    y: (a.y + b.y) / 2 - rect.top - worldY * scale,
    scale,
  }
}
function endTouch(event: PointerEvent) {
  if (!touches.delete(event.pointerId)) return
  if (pinch?.ids.includes(event.pointerId)) endPinch()
}

function edgeIsRelated(edge: GraphEdge) {
  return Boolean(props.relatedIds?.has(edge.from) && props.relatedIds.has(edge.to))
}

// The node or edge an element in the stage stands for. Connection handles carry their node ID but are not nodes.
function elementNode(element: Element) {
  return element.hasAttribute('data-vft-port') ? null : element.getAttribute('data-vft-node')
}
function gestureInFlight() {
  return Boolean(nodeDrag || connectionDrag || pinch || pan || draft.value)
}
// The stage itself or one of its own nodes, edges, group labels and handles. Keys pressed in focusable slot content,
// such as an input in a custom node, keep their usual meaning.
function stageControl(element: EventTarget | null): element is Element {
  return element instanceof Element && (element === svg.value || element.matches('[data-vft-node],[data-vft-edge],[data-vft-group]'))
}
function editable(element: EventTarget | null) {
  return element instanceof Element && element.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])') !== null
}

// Delete proposals. A focused node or edge outside the selection is deleted alone; otherwise the selection is.
function deletionFor(element: Element): GraphDeletion | undefined {
  const nodeId = elementNode(element), edgeId = element.getAttribute('data-vft-edge')
  let nodeIds: string[], edgeIds: string[]
  if (nodeId !== null && !isSelected(nodeId)) [nodeIds, edgeIds] = [[nodeId], []]
  else if (edgeId !== null && !(props.edgesSelectable && edgeSelected(edgeId))) [nodeIds, edgeIds] = [[], [edgeId]]
  else {
    nodeIds = props.selectedIds ? [...props.selectedIds] : props.selectedId === undefined ? [] : [props.selectedId]
    edgeIds = selectedEdgeList()
  }
  nodeIds = nodeIds.filter(id => nodesById.value.has(id) && nodesById.value.get(id)!.deletable !== false)
  edgeIds = edgeIds.filter(id => edgesById.value.has(id))
  return nodeIds.length || edgeIds.length ? graphDeletion(props.nodes, props.edges, nodeIds, edgeIds) : undefined
}
function deleteWithKeys(event: KeyboardEvent) {
  if (!props.deletable || event.repeat || gestureInFlight() || !stageControl(event.target)) return
  const element = event.target
  const deletion = deletionFor(element)
  if (!deletion) return
  event.preventDefault()
  notice.value = ''
  const result = props.validateDelete?.(deletion)
  if (result === false || typeof result === 'string') {
    notice.value = typeof result === 'string' ? result : messages.value.deleteRejected!
    emit('delete-rejected', deletion, notice.value)
    return
  }
  emit('delete', deletion)
  // Keep keyboard focus in the graph when the parent removes the focused element.
  void nextTick(() => {
    if (!element.isConnected && svg.value?.isConnected) svg.value.focus({ preventScroll: true })
  })
}

// Context menu requests. The component only reports them; the application renders its own menu.
let keyboardMenuAt = -Infinity
function menuTarget(element: Element | null): GraphContextMenuTarget {
  const owner = element?.closest('[data-vft-node],[data-vft-edge],[data-vft-group]')
  if (!owner || !svg.value?.contains(owner)) return { kind: 'canvas' }
  const node = owner.getAttribute('data-vft-node')
  if (node !== null) return { kind: 'node', id: node }
  const edge = owner.getAttribute('data-vft-edge')
  if (edge !== null) return { kind: 'edge', id: edge }
  return { kind: 'group', id: owner.getAttribute('data-vft-group')! }
}
function requestContextMenu(target: GraphContextMenuTarget, clientX: number, clientY: number, source: GraphContextMenu['source']) {
  cancelInteraction()
  hideTooltip()
  emit('context-menu', { target, point: worldPoint(clientX, clientY), clientX, clientY, source })
}
function openContextMenu(event: MouseEvent) {
  if (!props.contextMenu || editable(event.target)) return
  event.preventDefault()
  // The browser may follow a handled ContextMenu key or Shift+F10 with its own event; it was already reported.
  if (event.button !== 2 && event.timeStamp - keyboardMenuAt < 1000) return
  if (dragPreview.value || connectionPoint.value || boxPreview.value || pinch) return
  requestContextMenu(menuTarget(event.target instanceof Element ? event.target : null), event.clientX, event.clientY, 'pointer')
}
function contextMenuWithKeys(event: KeyboardEvent) {
  if (!props.contextMenu || !stageControl(event.target)) return
  event.preventDefault()
  keyboardMenuAt = event.timeStamp
  const rect = event.target.getBoundingClientRect()
  requestContextMenu(menuTarget(event.target), rect.left + rect.width / 2, rect.top + rect.height / 2, 'keyboard')
}
function onStageKeydown(event: KeyboardEvent) {
  if (event.key === 'Delete' || event.key === 'Backspace') deleteWithKeys(event)
  else if (event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey)) contextMenuWithKeys(event)
}

// Tooltips. Only rendered after mounting and only when the tooltip slot is provided. Like a native tooltip, a press
// in the stage dismisses it until the pointer enters another element, so it never covers a node being clicked.
type TooltipState = { kind: 'node' | 'edge'; id: string; source: 'pointer' | 'focus' }
const tooltip = shallowRef<TooltipState>()
const mounted = ref(false)
let showTimer: ReturnType<typeof setTimeout> | undefined
let hideTimer: ReturnType<typeof setTimeout> | undefined
const tooltipDelayValid = computed(() => {
  const delay = props.tooltipDelay
  if (!Number.isFinite(delay) || delay < 0) throw new RangeError('tooltipDelay must be a nonnegative finite number of milliseconds')
  return true
})
const tooltipBlocked = computed(() => Boolean(
  dragPreview.value || connectionPoint.value || boxPreview.value || isPanning.value || pinching.value || draft.value,
))
function clearTooltipTimers() {
  clearTimeout(showTimer)
  clearTimeout(hideTimer)
  showTimer = hideTimer = undefined
}
function hideTooltip() {
  clearTooltipTimers()
  tooltip.value = undefined
}
function hoverTooltip(kind: TooltipState['kind'], id: string) {
  if (!slots.tooltip || tooltipBlocked.value || nodeDrag || pan || connectionDrag) return
  clearTimeout(hideTimer)
  hideTimer = undefined
  if (tooltip.value?.kind === kind && tooltip.value.id === id) return
  clearTimeout(showTimer)
  const show = () => {
    showTimer = undefined
    tooltip.value = { kind, id, source: 'pointer' }
  }
  // Moving from one element to the next switches a visible tooltip at once.
  if (tooltip.value || props.tooltipDelay === 0) show()
  else showTimer = setTimeout(show, props.tooltipDelay)
}
function leaveTooltip() {
  clearTimeout(showTimer)
  showTimer = undefined
  if (tooltip.value?.source !== 'pointer') return
  clearTimeout(hideTimer)
  // A short grace period lets the pointer move onto the tooltip itself.
  hideTimer = setTimeout(() => {
    hideTimer = undefined
    tooltip.value = undefined
  }, 150)
}
function keepTooltip() {
  clearTimeout(hideTimer)
  hideTimer = undefined
}
function focusVisible(element: Element) {
  try {
    return element.matches(':focus-visible')
  } catch {
    return true
  }
}
// True while a press is being dispatched. Focus moved by the press (also with Shift held, which makes Chrome report
// :focus-visible) is pointer focus, not keyboard focus.
let pressing = false
function pressStage(event: PointerEvent) {
  startTouch(event)
  hideTooltip()
  pressing = true
  setTimeout(() => { pressing = false })
}
function focusTooltip(event: FocusEvent) {
  if (!slots.tooltip || !(event.target instanceof Element) || tooltipBlocked.value || pressing) return
  const node = elementNode(event.target), edge = event.target.getAttribute('data-vft-edge')
  // Keyboard focus shows the tooltip at once; a pointer press is covered by hover.
  if ((node === null && edge === null) || !focusVisible(event.target)) return
  clearTooltipTimers()
  tooltip.value = node !== null ? { kind: 'node', id: node, source: 'focus' } : { kind: 'edge', id: edge!, source: 'focus' }
}
function blurTooltip() {
  if (tooltip.value?.source === 'focus') hideTooltip()
}
function dismissTooltip(event: KeyboardEvent) {
  if (event.key === 'Escape') hideTooltip()
}
watch(tooltipBlocked, blocked => {
  if (blocked) hideTooltip()
})
watch(tooltip, (value, previous) => {
  if (value && !previous) document.addEventListener('keydown', dismissTooltip)
  else if (!value && previous) document.removeEventListener('keydown', dismissTooltip)
})
watch([nodesById, edgesById], () => {
  const current = tooltip.value
  if (current && !(current.kind === 'node' ? nodesById.value : edgesById.value).has(current.id)) hideTooltip()
})
const tooltipView = computed(() => {
  const current = tooltip.value
  if (!current || !mounted.value || tooltipBlocked.value) return undefined
  const { x, y, scale } = camera.value
  let target: NetworkTooltipSlot['target'], left: number, right: number, top: number, bottom: number
  if (current.kind === 'node') {
    const node = nodesById.value.get(current.id), box = layout.value.boxes.get(current.id)
    if (!node || !box || (visible.value && !visible.value.nodes.has(node.id))) return undefined
    target = { kind: 'node', node }
    left = x + box.x * scale
    right = x + (box.x + box.width) * scale
    top = y + box.y * scale
    bottom = y + (box.y + box.height) * scale
  } else {
    const edge = edgesById.value.get(current.id), path = layout.value.paths.get(current.id)
    if (!edge || path === undefined || (visible.value && !visible.value.edges.has(edge.id))) return undefined
    let point = layout.value.edgeLabels.get(edge.id)
    if (!point) {
      try {
        const ends = graphPathEndpoints(path)
        if (ends) point = { x: (ends.start.x + ends.end.x) / 2, y: (ends.start.y + ends.end.y) / 2 }
      } catch { /* a custom path that cannot be read has no anchor */ }
    }
    if (!point) return undefined
    target = { kind: 'edge', edge }
    left = right = x + point.x * scale
    top = bottom = y + point.y * scale + 6
  }
  const { width, height } = viewport.value
  if (right < 0 || left > width || bottom < 0 || top > height) return undefined
  // Place the tooltip after the element (before it in right-to-left), or on the other side when that has more room.
  const gap = 8, room = 180
  const before = left - gap, after = width - right - gap
  const placeBefore = rtl.value ? before >= room || before >= after : after < room && before > after
  return {
    target,
    style: {
      left: (placeBefore ? before : right + gap) + 'px',
      top: Math.max(4, Math.min(top, height - 28)) + 'px',
      transform: placeBefore ? 'translateX(-100%)' : undefined,
    },
  }
})
function describedBy(kind: TooltipState['kind'], id: string) {
  return slots.tooltip && tooltipView.value && tooltip.value?.kind === kind && tooltip.value.id === id ? tooltipId : undefined
}

watch(camera, value => emit('viewport-change', { ...value }))
function setViewport(value: GraphViewport) {
  cancelInteraction()
  if (![value.x, value.y].every(Number.isFinite) || !validScale(value.scale)) throw scaleError()
  fitMode.value = 'manual'
  camera.value = { ...value }
}
function focusNode(id: string, options?: NetworkFocusOptions) {
  const box = layout.value.boxes.get(id)
  if (!box) throw new Error('Unknown node: ' + id)
  const scale = options?.scale ?? camera.value.scale
  if (!validScale(scale)) throw scaleError()
  cancelInteraction()
  fitMode.value = 'manual'
  camera.value = graphCameraAt({ x: box.x + box.width / 2, y: box.y + box.height / 2 }, viewport.value, scale)
}
/** A standalone SVG document of the whole graph with the default rendering and the current theme colours. */
function exportSvg(options: GraphExportOptions = {}) {
  const { includeSelection = true, theme, ...rest } = options
  const selection = !includeSelection ? [] : props.selectedIds ?? (props.selectedId === undefined ? [] : [props.selectedId])
  return renderGraphSvg(layout.value, props.nodes, props.edges, {
    idPrefix: 'vft-export-' + marker.replace(/[^\w-]/g, ''),
    ...rest,
    groups: shownGroups.value.map(({ id, label, x, y, width, height }) => ({ id, label, x, y, width, height })),
    selectedIds: selection,
    direction: rtl.value ? 'rtl' : 'ltr',
    theme: root.value ? readExportTheme(root.value, theme) : theme,
    fontFamily: root.value ? exportFont(root.value) : undefined,
  })
}
/** Rasterize `exportSvg(options)` to a PNG blob in the browser. */
async function exportPng(options: GraphPngExportOptions = {}) {
  const { scale = 1, ...rest } = options
  return rasterizeSvg(exportSvg(rest), scale)
}
defineExpose({ fit, zoom, getViewport: () => ({ ...camera.value }), setViewport, focusNode, exportSvg, exportPng })

watch(savedLayout, cancelInteraction)
watch(() => [props.draggable, props.connectable, props.reconnectable, props.boxSelect, groupMembership.value], cancelInteraction)
watch(baseLayout, () => {
  if (activeEdgeId.value && !edgesById.value.has(activeEdgeId.value)) activeEdgeId.value = undefined
  fitMode.value = 'auto'
  camera.value = fitCamera()
})
watch(() => props.selectedId, () => {
  if (fitMode.value === 'auto' && viewport.value.width < 650) camera.value = fitCamera()
})
onMounted(() => {
  mounted.value = true
  detectDirection()
  if (!svg.value) return
  observer = new ResizeObserver(([entry]) => {
    if (!entry) return
    const size = { width: entry.contentRect.width, height: entry.contentRect.height }
    if (size.width !== viewport.value.width || size.height !== viewport.value.height) cancelInteraction()
    viewport.value = size
    if (fitMode.value !== 'manual') camera.value = fitCamera(fitMode.value === 'overview')
  })
  observer.observe(svg.value)
})
onUnmounted(() => {
  cancelInteraction()
  observer?.disconnect()
  hideTooltip()
  document.removeEventListener('keydown', dismissTooltip)
})
</script>

<template>
  <div ref="root" class="vft-network" :class="{ 'vft-rtl': rtl }" :dir="dir === 'rtl' ? 'rtl' : undefined">
    <svg
      ref="svg" class="vft-network-stage" :style="{ height: typeof height === 'number' ? height + 'px' : height }" :class="{ panning: isPanning }"
      :aria-label="messages.region" tabindex="0"
      @keydown.self="panWithKeys" @keydown.esc="cancelInteraction(); hideTooltip()" @keydown="onStageKeydown" @contextmenu="openContextMenu"
      @focusin="trackFocus($event); focusTooltip($event)" @focusout="releaseFocus($event); blurTooltip()"
      @wheel="onWheel" @pointerdown.capture="pressStage" @pointerdown="startPan"
      @pointermove="moveTouch($event); movePan($event); moveNode($event); moveConnection($event)"
      @pointerup="endTouch($event); stopPan($event); finishNodeDrag($event); finishConnection($event)"
      @pointercancel="endTouch($event); stopPan($event); finishNodeDrag($event); finishConnection($event)"
      @lostpointercapture="stopPan($event); finishNodeDrag($event); finishConnection($event)"
    >
      <defs>
        <marker :id="marker" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
          <path d="M 0 0 L 7 3.5 L 0 7 z" fill="context-stroke" />
        </marker>
      </defs>
      <g :transform="`translate(${camera.x} ${camera.y}) scale(${camera.scale})`">
        <g v-for="group in renderedGroups" :key="group.id" class="vft-network-group">
          <rect :x="group.x" :y="group.y" :width="group.width" :height="group.height" rx="10" />
          <text :x="rtl ? group.x + group.width - 8 : group.x + 8" :y="group.y + 15" :role="draggable ? 'button' : undefined" :data-vft-group="group.id"
            :tabindex="draggable ? 0 : undefined" :aria-label="draggable ? groupName(group) : undefined"
            @pointerdown.stop="startNodeDrag($event, group.members)" @keydown="moveWithKeys($event, group.members)">{{ group.label }}</text>
        </g>
        <g v-for="edge in shownEdges" :key="edge.id" :class="{ 'vft-dimmed': edgeIsDimmed(edge), 'vft-edge-selected': edgesSelectable && edgeSelected(edge.id) }"
          :data-vft-edge="contextMenu ? edge.id : undefined" @pointerenter="hoverTooltip('edge', edge.id)" @pointerleave="leaveTooltip">
          <slot name="edge" :edge="edge" :path="layout.paths.get(edge.id)!" :selected="edgeIsRelated(edge)" :dimmed="edgeIsDimmed(edge)">
            <path class="vft-network-edge" :class="{ related: edgeIsRelated(edge) }"
              :d="layout.paths.get(edge.id)" :marker-end="`url(#${marker})`" />
            <text v-if="edge.label && layout.edgeLabels.has(edge.id)" class="vft-edge-label"
              :x="layout.edgeLabels.get(edge.id)!.x" :y="layout.edgeLabels.get(edge.id)!.y"
            >{{ edge.label }}</text>
          </slot>
          <path v-if="reconnectable || edgesSelectable" class="vft-edge-hit" :class="{ active: currentEdgeId === edge.id, selected: edgesSelectable && edgeSelected(edge.id) }"
            :d="layout.paths.get(edge.id)" role="button" tabindex="0" :aria-label="messages.selectEdge + ' ' + (edge.label ?? edge.id)"
            :aria-pressed="edgePressed(edge.id)" :aria-describedby="describedBy('edge', edge.id)" :data-vft-edge="edge.id"
            @pointerdown.stop @click="selectEdge(edge.id, $event)" @keydown.enter.prevent="selectEdge(edge.id, $event)" @keydown.space.prevent="selectEdge(edge.id, $event)" />
        </g>
        <g
          v-for="node in shownNodes" :key="node.id" class="vft-network-node" :data-vft-node="node.id"
          :class="[`vft-tone-${node.tone ?? 'blue'}`, { selected: isSelected(node.id), draggable: draggable && node.draggable !== false, related: relatedIds?.has(node.id), 'vft-dimmed': isDimmed(node.id) }]"
          :transform="`translate(${node.box.x} ${node.box.y})`"
          role="button" tabindex="0" :aria-label="[node.label, node.detail].filter(Boolean).join(' ')" :aria-pressed="isSelected(node.id)"
          :aria-describedby="describedBy('node', node.id)" @pointerenter="hoverTooltip('node', node.id)" @pointerleave="leaveTooltip"
          @pointerdown.stop="startNodeDrag($event, movingIds(node.id), node.id)" @click="clickNode(node.id, $event)"
          @keydown.self="node.draggable !== false && moveWithKeys($event, movingIds(node.id))"
          @keydown.enter.self.prevent="select(node.id, $event)" @keydown.space.self.prevent="select(node.id, $event)"
        >
          <title v-if="!$slots.tooltip">{{ node.label }} {{ node.detail }}</title>
          <slot name="node" :node="node" :box="node.box" :selected="isSelected(node.id)" :dimmed="isDimmed(node.id)">
          <svg :width="node.box.width" :height="node.box.height" overflow="hidden">
          <rect x="2" y="2" :width="node.box.width - 4" :height="node.box.height - 4" :rx="node.shape === 'rounded' ? 19 : 8" />
          <text :x="rtl ? node.box.width - 13 : 13" :y="node.detail ? 24 : 34" class="vft-node-title">{{ node.label }}</text>
          <text v-if="node.detail" :x="rtl ? node.box.width - 13 : 13" y="43" class="vft-node-detail">{{ node.detail }}</text>
          </svg>
          </slot>
        </g>
        <path v-if="connectionPath" class="vft-connection-preview" :d="connectionPath" />
        <rect v-if="boxPreview" class="vft-box-selection" v-bind="boxPreview" />
        <template v-if="connectable || draft?.edge">
          <circle v-for="handle in renderedHandles" :key="portKey(handle)" class="vft-connect-handle" :data-vft-node="handle.node"
            :class="{ active: portPressed(handle) }" :data-vft-port="portKey(handle)"
            :cx="handle.x" :cy="handle.y" r="6" role="button" tabindex="0"
            :aria-label="`${draft && !portPressed(handle) ? messages.connectTo : messages.connectFrom} ${handle.label}`"
            :aria-pressed="Boolean(portPressed(handle))"
            @pointerdown.stop="connectable && startPort($event, handle)"
            @click.stop="(connectable || draft) && activatePort(handle, $event)"
            @keydown.enter.stop.prevent="(connectable || draft) && activatePort(handle, $event)"
            @keydown.space.stop.prevent="(connectable || draft) && activatePort(handle, $event)" />
        </template>
        <circle v-for="item in reconnectHandles" :key="item.end" class="vft-reconnect-handle"
          :cx="item.x" :cy="item.y" r="6" role="button" tabindex="0" :aria-label="item.label"
          @pointerdown.stop="reconnectEdge(item.edge, item.end, $event)"
          @keydown.enter.stop.prevent="reconnectEdge(item.edge, item.end)"
          @keydown.space.stop.prevent="reconnectEdge(item.edge, item.end)" />
      </g>
    </svg>
    <!-- The tooltip shares the empty state's conditional (an empty graph has nothing to describe), so the markup
      without a tooltip is unchanged. -->
    <div v-if="tooltipDelayValid && !nodes.length" class="vft-network-empty"><slot name="empty">{{ messages.empty }}</slot></div>
    <div v-else-if="$slots.tooltip && tooltipView" :id="tooltipId" role="tooltip" class="vft-network-tooltip"
      :style="tooltipView.style" @pointerenter="keepTooltip" @pointerleave="leaveTooltip">
      <slot name="tooltip" :target="tooltipView.target" />
    </div>
    <button v-if="showMinimap && nodes.length" type="button" class="vft-minimap" :aria-label="messages.minimap"
      @click="navigateMinimap" @keydown="panWithKeys">
      <svg :viewBox="`${contentBounds.left} ${contentBounds.top} ${contentBounds.width} ${contentBounds.height}`" aria-hidden="true">
        <rect v-for="node in positioned" :key="node.id" :class="{ selected: isSelected(node.id) }"
          :x="node.box.x" :y="node.box.y" :width="node.box.width" :height="node.box.height" rx="3" />
        <rect class="vft-minimap-window" :x="-camera.x / camera.scale" :y="-camera.y / camera.scale"
          :width="viewport.width / camera.scale" :height="viewport.height / camera.scale" />
      </svg>
    </button>
    <span class="vft-sr-only" aria-live="polite">{{ notice }}</span>
    <div v-if="showControls !== false" class="vft-zoom-tools" role="group" :aria-label="messages.zoom">
      <button type="button" :aria-label="messages.zoomOut" @click="zoom(1 / 1.25)">−</button>
      <output>{{ Math.round(camera.scale * 100) }}%</output>
      <button type="button" :aria-label="messages.zoomIn" @click="zoom(1.25)">＋</button>
      <button type="button" class="vft-fit-button" @click="fit()">{{ messages.fit }}</button>
    </div>
  </div>
</template>
