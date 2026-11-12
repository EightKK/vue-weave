<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, useId, watch } from 'vue'
import type { NetworkNode, GraphLabels, GraphLayoutFunction, GraphViewport, NetworkNodeSlot } from '../core/types.js'
import { applyGraphPositions, graphPortAnchor, graphEdgeEndpoint, indexGraph, layoutLayeredGraph, routeGraphPorts, type GraphEdge, type GraphLayoutOptions, type GraphPoint, type GraphNodeMove, type GraphConnection, type GraphPort, type GraphReconnect, type GraphGroup } from '../core/graph.js'

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
  groups?: readonly GraphGroup[]
  validateConnection?: (connection: GraphConnection, replacingEdgeId?: string) => boolean | string | void
  showMinimap?: boolean
  relatedIds?: ReadonlySet<string>
  options?: GraphLayoutOptions
  layout?: GraphLayoutFunction
  labels?: Partial<GraphLabels>
  height?: number | string
  showControls?: boolean
}>(), { showControls: true })
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
}>()
defineSlots<{
  node(props: NetworkNodeSlot): unknown
  edge(props: { edge: GraphEdge; path: string; selected: boolean }): unknown
  empty(): unknown
}>()
const messages = computed<GraphLabels>(() => ({
  region: 'Network graph', empty: 'No nodes to display', zoom: 'Graph zoom',
  zoomIn: 'Zoom in', zoomOut: 'Zoom out', fit: 'Fit to view',
  minimap: 'Navigate graph overview', connectFrom: 'Start connection from', connectTo: 'Connect to',
  reconnectSource: 'Reconnect source of', reconnectTarget: 'Reconnect target of', moveGroup: 'Move group',
  rejected: 'This connection was rejected.', selectEdge: 'Select edge', ...props.labels,
}))
function isSelected(id: string) {
  return props.selectedIds ? props.selectedIds.has(id) : props.selectedId === id
}
function select(id: string, event: MouseEvent | KeyboardEvent) {
  if (props.selectedIds) {
    const toggle = event.ctrlKey || event.metaKey || event.shiftKey
    const ids = new Set(toggle ? props.selectedIds : [])
    if (toggle && ids.has(id)) ids.delete(id)
    else ids.add(id)
    emit('update:selectedIds', ids)
  }
  emit('select', id)
  emit('update:selectedId', id)
}
const svg = ref<SVGSVGElement>()
const marker = useId()
const viewport = ref({ width: 1150, height: 270 })
const options = computed<GraphLayoutOptions>((previous) => {
  const next = props.options
  const value = {
    direction: next?.direction, nodeWidth: next?.nodeWidth, nodeHeight: next?.nodeHeight,
    columnGap: next?.columnGap, rowGap: next?.rowGap, padding: next?.padding,
  }
  return previous && (Object.keys(value) as (keyof GraphLayoutOptions)[]).every(key => previous[key] === value[key])
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
const layout = computed(() => {
  const positions = dragPreview.value ? new Map([...props.positions ?? [], ...dragPreview.value]) : undefined
  const geometry = positions ? applyGraphPositions(baseLayout.value, props.edges, positions, direction.value) : savedLayout.value
  return routeGraphPorts(geometry, nodesById.value, props.edges, direction.value)
})
const positioned = computed(() => props.nodes.map(node => ({ ...node, box: layout.value.boxes.get(node.id)! })))

const groupMembership = computed(() => {
  const groups = new Set<string>(), members = new Set<string>()
  for (const group of props.groups ?? []) {
    if (!group.id || groups.has(group.id) || !group.nodeIds.length) throw new Error('Invalid graph group: ' + group.id)
    groups.add(group.id)
    for (const id of group.nodeIds) {
      if (!nodesById.value.has(id) || members.has(id)) throw new Error('Invalid or repeated group member: ' + id)
      members.add(id)
    }
  }
  return props.groups ?? []
})
const shownGroups = computed(() => groupMembership.value.map(group => {
  let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity
  for (const id of group.nodeIds) {
    const box = layout.value.boxes.get(id)!
    left = Math.min(left, box.x)
    top = Math.min(top, box.y)
    right = Math.max(right, box.x + box.width)
    bottom = Math.max(bottom, box.y + box.height)
  }
  const x = Math.max(0, left - 10), y = Math.max(0, top - 23)
  return { ...group, x, y, width: Math.min(layout.value.width, right + 10) - x, height: Math.min(layout.value.height, bottom + 10) - y }
}))

type PortRef = { node: string; port?: string }
type PortHandle = PortRef & GraphPoint & { label: string; direction: NonNullable<GraphPort['direction']> }
const handles = computed(() => positioned.value.flatMap<PortHandle>(node => {
  if (!node.ports) return [{ node: node.id, label: node.label, direction: 'both' as const, port: undefined, x: node.box.x + node.box.width - 10, y: node.box.y + 11 }]
  return node.ports.map(port => ({
    node: node.id, port: port.id, label: node.label + ' · ' + (port.label ?? port.id),
    direction: port.direction ?? 'both', ...graphPortAnchor(node.box, port),
  }))
}))
const handleIndex = computed(() => new Map(handles.value.map((handle, index) => [portKey(handle), index])))
function portKey(ref: PortRef) {
  return JSON.stringify([ref.node, ref.port])
}

function fitCamera(overview = false) {
  const { width, height } = viewport.value
  const geometry = layout.value
  const overviewScale = Math.max(0.1, Math.min(1.15, width / geometry.width, height / geometry.height))
  const scale = overview || width >= 650 ? overviewScale
    : Math.max(overviewScale, Math.min(0.72, height / geometry.height))
  const canvasWidth = geometry.width * scale
  const selected = props.selectedId ? geometry.boxes.get(props.selectedId) : undefined
  const focusX = selected ? (selected.x + selected.width / 2) * scale : 0
  return {
    x: canvasWidth <= width ? (width - canvasWidth) / 2
      : Math.max(width - canvasWidth, Math.min(0, width / 2 - focusX)),
    y: (height - geometry.height * scale) / 2,
    scale,
  }
}

const camera = ref(fitCamera())
const fitMode = ref<'auto' | 'overview' | 'manual'>('auto')
const isPanning = ref(false)
let pan: { pointerId: number; x: number; y: number; cameraX: number; cameraY: number; box: boolean } | undefined
const boxPreview = ref<{ x: number; y: number; width: number; height: number }>()
let observer: ResizeObserver | undefined

function fit() {
  cancelInteraction()
  fitMode.value = 'overview'
  camera.value = fitCamera(true)
}

function zoom(factor: number, x = viewport.value.width / 2, y = viewport.value.height / 2) {
  cancelInteraction()
  if (![factor, x, y].every(Number.isFinite) || factor <= 0) throw new RangeError('Zoom requires a positive finite factor and finite coordinates')
  const current = camera.value
  const scale = Math.max(0.1, Math.min(3, current.scale * factor))
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
const reconnectHandles = computed(() => {
  const edge = props.reconnectable && activeEdgeId.value ? edgesById.value.get(activeEdgeId.value) : undefined
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
  const world = event.detail ? point.matrixTransform(transform.inverse()) : {
    x: layout.value.width / 2, y: layout.value.height / 2,
  }
  cancelInteraction()
  fitMode.value = 'manual'
  camera.value = {
    scale: camera.value.scale,
    x: viewport.value.width / 2 - Math.min(layout.value.width, Math.max(0, world.x)) * camera.value.scale,
    y: viewport.value.height / 2 - Math.min(layout.value.height, Math.max(0, world.y)) * camera.value.scale,
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

function edgeIsRelated(edge: GraphEdge) {
  return Boolean(props.relatedIds?.has(edge.from) && props.relatedIds.has(edge.to))
}

watch(camera, value => emit('viewport-change', { ...value }))
function setViewport(value: GraphViewport) {
  cancelInteraction()
  if (![value.x, value.y, value.scale].every(Number.isFinite) || value.scale < 0.1 || value.scale > 3) {
    throw new RangeError('Viewport scale must be between 0.1 and 3')
  }
  fitMode.value = 'manual'
  camera.value = { ...value }
}
defineExpose({ fit, zoom, getViewport: () => ({ ...camera.value }), setViewport })

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
onUnmounted(() => { cancelInteraction(); observer?.disconnect() })
</script>

<template>
  <div class="vft-network">
    <svg
      ref="svg" class="vft-network-stage" :style="{ height: typeof height === 'number' ? height + 'px' : height }" :class="{ panning: isPanning }"
      :aria-label="messages.region" tabindex="0"
      @keydown.self="panWithKeys" @keydown.esc="cancelInteraction"
      @wheel="onWheel" @pointerdown="startPan" @pointermove="movePan($event); moveNode($event); moveConnection($event)"
      @pointerup="stopPan($event); finishNodeDrag($event); finishConnection($event)"
      @pointercancel="stopPan($event); finishNodeDrag($event); finishConnection($event)"
      @lostpointercapture="stopPan($event); finishNodeDrag($event); finishConnection($event)"
    >
      <defs>
        <marker :id="marker" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
          <path d="M 0 0 L 7 3.5 L 0 7 z" fill="context-stroke" />
        </marker>
      </defs>
      <g :transform="`translate(${camera.x} ${camera.y}) scale(${camera.scale})`">
        <g v-for="group in shownGroups" :key="group.id" class="vft-network-group">
          <rect :x="group.x" :y="group.y" :width="group.width" :height="group.height" rx="10" />
          <text :x="group.x + 8" :y="group.y + 15" :role="draggable ? 'button' : undefined"
            :tabindex="draggable ? 0 : undefined" :aria-label="draggable ? messages.moveGroup + ' ' + group.label : undefined"
            @pointerdown.stop="startNodeDrag($event, group.nodeIds)" @keydown="moveWithKeys($event, group.nodeIds)">{{ group.label }}</text>
        </g>
        <g v-for="edge in edges" :key="edge.id">
          <slot name="edge" :edge="edge" :path="layout.paths.get(edge.id)!" :selected="edgeIsRelated(edge)">
            <path class="vft-network-edge" :class="{ related: edgeIsRelated(edge) }"
              :d="layout.paths.get(edge.id)" :marker-end="`url(#${marker})`" />
            <text v-if="edge.label && layout.edgeLabels.has(edge.id)" class="vft-edge-label"
              :x="layout.edgeLabels.get(edge.id)!.x" :y="layout.edgeLabels.get(edge.id)!.y"
            >{{ edge.label }}</text>
          </slot>
          <path v-if="reconnectable" class="vft-edge-hit" :class="{ active: activeEdgeId === edge.id }" :d="layout.paths.get(edge.id)"
            role="button" tabindex="0" :aria-label="messages.selectEdge + ' ' + (edge.label ?? edge.id)" :aria-pressed="activeEdgeId === edge.id"
            @pointerdown.stop @click="activeEdgeId = edge.id" @keydown.enter.prevent="activeEdgeId = edge.id" @keydown.space.prevent="activeEdgeId = edge.id" />
        </g>
        <g
          v-for="node in positioned" :key="node.id" class="vft-network-node"
          :class="[`vft-tone-${node.tone ?? 'blue'}`, { selected: isSelected(node.id), draggable: draggable && node.draggable !== false, related: relatedIds?.has(node.id) }]"
          :transform="`translate(${node.box.x} ${node.box.y})`"
          role="button" tabindex="0" :aria-label="[node.label, node.detail].filter(Boolean).join(' ')" :aria-pressed="isSelected(node.id)"
          @pointerdown.stop="startNodeDrag($event, movingIds(node.id), node.id)" @click="clickNode(node.id, $event)"
          @keydown.self="node.draggable !== false && moveWithKeys($event, movingIds(node.id))"
          @keydown.enter.self.prevent="select(node.id, $event)" @keydown.space.self.prevent="select(node.id, $event)"
        >
          <title>{{ node.label }} {{ node.detail }}</title>
          <slot name="node" :node="node" :box="node.box" :selected="isSelected(node.id)">
          <svg :width="node.box.width" :height="node.box.height" overflow="hidden">
          <rect x="2" y="2" :width="node.box.width - 4" :height="node.box.height - 4" :rx="node.shape === 'rounded' ? 19 : 8" />
          <text x="13" :y="node.detail ? 24 : 34" class="vft-node-title">{{ node.label }}</text>
          <text v-if="node.detail" x="13" y="43" class="vft-node-detail">{{ node.detail }}</text>
          </svg>
          </slot>
        </g>
        <path v-if="connectionPath" class="vft-connection-preview" :d="connectionPath" />
        <rect v-if="boxPreview" class="vft-box-selection" v-bind="boxPreview" />
        <template v-if="connectable || draft?.edge">
          <circle v-for="handle in handles" :key="portKey(handle)" class="vft-connect-handle"
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
    <div v-if="!nodes.length" class="vft-network-empty"><slot name="empty">{{ messages.empty }}</slot></div>
    <button v-if="showMinimap && nodes.length" type="button" class="vft-minimap" :aria-label="messages.minimap"
      @click="navigateMinimap" @keydown="panWithKeys">
      <svg :viewBox="`0 0 ${layout.width} ${layout.height}`" aria-hidden="true">
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
      <button type="button" class="vft-fit-button" @click="fit">{{ messages.fit }}</button>
    </div>
  </div>
</template>
