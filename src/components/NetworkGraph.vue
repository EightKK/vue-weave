<script setup lang="ts" generic="N extends NetworkNode = NetworkNode, E extends GraphEdge = GraphEdge, G extends NetworkGroup = never">
import { computed, h, nextTick, onMounted, onUnmounted, ref, shallowRef, useId, watch, type FunctionalComponent, type ShallowRef } from 'vue'
import NetworkGraphEdge from './NetworkGraphEdge.vue'
import NetworkGraphNode from './NetworkGraphNode.vue'
import { graphIncidentCurve } from '../core/graphCurve.js'
import type { GraphBox } from '../core/graph.js'
import type { NetworkNode, GraphLabels, GraphLayoutFunction, GraphViewport, NetworkFocusOptions, NetworkGroup, NetworkNodeSlot } from '../core/types.js'
import type { GraphContextMenu, GraphContextMenuTarget, GraphFitOptions, NetworkTooltipSlot } from '../core/types.js'
import type { GraphClipboardSelection, GraphPaste } from '../core/types.js'
import { applyGraphPositions, applyGraphSizes, graphPortAnchor, graphEdgeEndpoint, indexGraph, layoutLayeredGraph, routeGraphPorts, type GraphEdge, type GraphLayeredLayoutOptions, type GraphPoint, type GraphNodeMove, type GraphConnection, type GraphPort, type GraphReconnect, type GraphLayout, type GraphNodeSize } from '../core/graph.js'
import type { GraphEdgeReshape, GraphNodeResize } from '../core/types.js'
import { collapseGraphGroups, type GraphShownEdge, type GraphShownNode } from '../core/graphCollapse.js'
import { routeGraphEdges, type GraphEdgeStyle } from '../core/graphRouting.js'
import { cullGraphElements, graphCameraAt, graphLayoutBounds, graphPathEndpoints, graphViewportRect, type GraphRect } from '../core/graphView.js'
import { graphDeletion, type GraphDeletion } from '../core/graphEditing.js'
import { graphAlignmentGuides, snapGraphPoint, type GraphAlignmentGuide } from '../core/graphSnapping.js'
import type { GraphDrop } from './types.js'
import type { ChartDirection, GraphExportOptions, GraphPngExportOptions } from '../core/types.js'
import { renderGraphSvg } from '../core/exportSvg.js'
import { exportFont, rasterizeSvg, readExportTheme } from './exportImage.js'

// The nodes and edges the graph draws and hands back: the inputs and, with groups, collapsed proxies and merged edges.
type ShownNode = GraphShownNode<N, G>
type ShownEdge = GraphShownEdge<E, G>
const props = withDefaults(defineProps<{
  /** Nodes to draw. Each has an ID, label, optional detail, tone, shape and opaque data. Required. */
  nodes: readonly N[]
  /** Edges between nodes. Each has an ID, `from` and `to` node IDs, and optional label, port names (`fromPort`, `toPort`), waypoints (`points`) and data. Required. */
  edges: readonly E[]
  /** Controlled selected node ID; supports `v-model:selected-id`. */
  selectedId?: string
  /** Controlled set of selected node IDs for multiple selection. Ctrl, Meta or Shift toggles membership; a plain selection replaces the set. */
  selectedIds?: ReadonlySet<string>
  /** Saved node positions as a map of node ID to absolute chart point, applied over the layout. Positions must be finite and nonnegative. */
  positions?: ReadonlyMap<string, GraphPoint>
  /** Enables dragging and arrow-key movement of nodes, proposed through `node-move` and `nodes-move`. Opt-in. Default: false. */
  draggable?: boolean
  /** Shows connection handles on nodes so a drag or two activations propose an edge through `connect`. Opt-in. Default: false. */
  connectable?: boolean
  /** Lets a selected edge endpoint be dragged to another node or port, proposed through `reconnect`. Opt-in. Default: false. */
  reconnectable?: boolean
  /** Enables Shift-drag box selection on the canvas; use with controlled `selectedIds`. Opt-in. Default: false. */
  boxSelect?: boolean
  /** Groups with an ID, label, direct member `nodeIds` and optional `parentId`. Their bounds follow the member nodes. */
  groups?: readonly G[]
  /** Synchronous check of a connection proposal; receives the existing edge ID when reconnecting. Return `true` or nothing to accept, `false` or a reason string to reject. */
  validateConnection?: (connection: GraphConnection, replacingEdgeId?: string) => boolean | string | void
  /** Shows an overview minimap of the graph and viewport. Opt-in. Default: false. */
  showMinimap?: boolean
  /** IDs of nodes to emphasize, together with the edges that join two of them. */
  relatedIds?: ReadonlySet<string>
  /** Configuration of the built-in layered layout: direction, node size, gaps, padding and crossing reduction. Defaults: direction LR, 144 x 58 nodes, column gap 50, row gap 24, padding 20. */
  options?: GraphLayeredLayoutOptions
  /** Custom layout function that replaces the built-in layout. It must return positive finite dimensions plus a box for every node and a path for every edge. */
  layout?: GraphLayoutFunction<ShownNode, ShownEdge>
  /** Overrides for the English UI strings and accessible names; fields you omit keep their defaults. */
  labels?: Partial<GraphLabels>
  /** Height of the SVG viewport, as a number of pixels or a CSS length. Default: 220px. */
  height?: number | string
  /** Shows the zoom and fit buttons. Default: true. */
  showControls?: boolean
  /** Renders only elements that intersect the viewport plus `cullOverscan`, for large graphs. Opt-in. Default: false. */
  cullOffscreen?: boolean
  /** Margin in screen pixels around the viewport that stays rendered when culling. Default: 200. */
  cullOverscan?: number
  /** IDs of matching nodes; nodes outside the set are dimmed. An empty set dims every node. Presentation only. */
  matchIds?: ReadonlySet<string>
  /** IDs of nodes to dim explicitly; combines with `matchIds`. Presentation only. */
  dimmedIds?: ReadonlySet<string>
  /** Text direction: `ltr`, `rtl` or `auto`. Mirrors the zoom tools, minimap and label alignment, not the graph geometry. Default: `ltr`. */
  dir?: ChartDirection
  /** Gives every edge a focusable hit area so it can be selected by click, Enter or Space. Opt-in. Default: false. */
  edgesSelectable?: boolean
  /** Controlled set of selected edge IDs; supports `v-model:selected-edge-ids`. Unknown IDs are ignored. */
  selectedEdgeIds?: ReadonlySet<string>
  /** Lets Delete or Backspace propose removing the selected or focused nodes and edges through `delete`. Opt-in. Default: false. */
  deletable?: boolean
  /** Synchronous check of a deletion proposal. Return `true` or nothing to accept, `false` or a reason string to reject. */
  validateDelete?: (deletion: GraphDeletion) => boolean | string | void
  /** Reports context menu requests through `context-menu` instead of opening the browser menu. The component renders no menu. Opt-in. Default: false. */
  contextMenu?: boolean
  /** Hover delay in milliseconds before the `tooltip` slot appears; finite and nonnegative. Default: 400. */
  tooltipDelay?: number
  /** Grid size in chart units, positive and finite. Drags, keyboard moves, drops and pastes snap to it. */
  snapGrid?: number
  /** Decorative background pattern that follows pan and zoom: `none`, `dots` or `lines`. Default: `none`. */
  background?: 'none' | 'dots' | 'lines'
  /** Spacing of the background pattern in chart units; positive and finite. Default: `snapGrid`, else 20. */
  backgroundGap?: number
  /** Snaps a dragged node to edges and centres of other nodes and draws guide lines during a pointer drag. Opt-in. Default: false. */
  alignmentGuides?: boolean
  /** Snap distance of the alignment guides in screen pixels; finite and nonnegative. Default: 6. */
  guideThreshold?: number
  /** Pans the camera while a drag or box selection is held within 40 screen pixels of the stage edge. Opt-in. Default: false. */
  autoPan?: boolean
  /** Accepts HTML drag and drop on the stage and emits `node-drop`. Opt-in. Default: false. */
  droppable?: boolean
  /** Ctrl or Cmd with C, V and D emit `copy-selection`, `paste-request` and `duplicate-selection`. Opt-in. Default: false. */
  clipboard?: boolean
  /** Draws collapse and expand toggles on groups. Without `collapsedGroupIds`, the component keeps the collapsed set itself. Opt-in. Default: false. */
  collapsibleGroups?: boolean
  /** Controlled set of collapsed group IDs; supports `v-model:collapsed-group-ids`. Unknown IDs are ignored. */
  collapsedGroupIds?: ReadonlySet<string>
  /** Edge routing style: `curve`, `orthogonal` or `straight`. Default: `curve`. */
  edgeStyle?: GraphEdgeStyle
  /** Gives edges a focusable hit area and shows waypoint handles on the selected edge, proposed through `edge-reshape`. Opt-in. Default: false. */
  editableEdges?: boolean
  /** Synchronous check of a waypoint change proposal. Return `true` or nothing to accept, `false` or a reason string to reject. */
  validateEdgeReshape?: (change: GraphEdgeReshape) => boolean | string | void
  /** Camera scale below which node detail text and edge labels are hidden; greater than 0 and at most 3. */
  lodThreshold?: number
  /** Node sizes as a map of node ID to width and height, applied over the layout boxes and keeping each top-left corner. Sizes must be finite and positive; unknown IDs are ignored. */
  sizes?: ReadonlyMap<string, GraphNodeSize>
  /** Shows corner resize handles on the single selected node, proposed through `node-resize`. Opt-in. Default: false. */
  resizable?: boolean
  /** Smallest width and height a resize may propose. Default: `{ width: 40, height: 24 }`. */
  minNodeSize?: GraphNodeSize
  /** Synchronous check of a node resize proposal. Return `true` or nothing to accept, `false` or a reason string to reject. */
  validateNodeResize?: (change: GraphNodeResize) => boolean | string | void
}>(), { showControls: true, cullOverscan: 200, dir: 'ltr', tooltipDelay: 400, background: 'none', guideThreshold: 6, edgeStyle: 'curve' })
const emit = defineEmits<{
  /** A node was selected by click or Enter/Space; carries its ID. */
  select: [id: string]
  /** The selected node ID changed; supports `v-model:selected-id`. */
  'update:selectedId': [id: string]
  /** The set of selected node IDs changed; supports `v-model:selected-ids`. */
  'update:selectedIds': [ids: Set<string>]
  /** Proposal to move one node; carries `id`, `before` and `after`. The parent updates `positions` to accept. */
  'node-move': [change: GraphNodeMove]
  /** Proposal to move several nodes at once; carries one change per node. The parent updates `positions` to accept. */
  'nodes-move': [changes: GraphNodeMove[]]
  /** Proposal to move an edge endpoint; carries the ID plus `before` and `after`. The parent replaces the edge. */
  reconnect: [change: GraphReconnect]
  /** Proposal to add an edge; carries `from` and `to`. The parent assigns an ID and adds it. */
  connect: [connection: GraphConnection]
  /** A connection or reconnection was rejected by `validateConnection`; carries the proposal and the reason. */
  'connect-rejected': [connection: GraphConnection, reason: string]
  /** The camera changed through pan, zoom, fit or auto-pan; carries `{ x, y, scale }`. */
  'viewport-change': [viewport: GraphViewport]
  /** The set of selected edge IDs changed; supports `v-model:selected-edge-ids`. */
  'update:selectedEdgeIds': [ids: Set<string>]
  /** An edge was activated, including a toggle that deselects it; carries its ID. */
  'edge-select': [id: string]
  /** Proposal to remove nodes and edges; carries `nodeIds` and `edgeIds`. The parent removes them to accept. */
  delete: [deletion: GraphDeletion]
  /** A deletion was rejected by `validateDelete`; carries the proposal and the reason. */
  'delete-rejected': [deletion: GraphDeletion, reason: string]
  /** A context menu was requested by pointer or keyboard; carries the target, position and source. Only with `contextMenu`. */
  'context-menu': [event: GraphContextMenu]
  /** Something was dropped on the stage; carries the chart point, client position and `dataTransfer`. Only with `droppable`. */
  'node-drop': [event: GraphDrop]
  /** Copy was requested; carries the selected node and edge IDs and node positions. The component keeps no clipboard. Only with `clipboard`. */
  'copy-selection': [selection: GraphClipboardSelection]
  /** Paste was requested; carries the target point. The parent builds and adds the copies. Only with `clipboard`. */
  'paste-request': [event: GraphPaste]
  /** Duplicate was requested; carries the selected node and edge IDs and node positions. Only with `clipboard`. */
  'duplicate-selection': [selection: GraphClipboardSelection]
  /** The set of collapsed group IDs changed; supports `v-model:collapsed-group-ids`. */
  'update:collapsedGroupIds': [ids: Set<string>]
  /** Proposal to change an edge's waypoints; carries the ID plus `before` and `after` lists. The parent sets the edge `points`. */
  'edge-reshape': [change: GraphEdgeReshape]
  /** A waypoint change was rejected by `validateEdgeReshape`; carries the proposal and the reason. */
  'edge-reshape-rejected': [change: GraphEdgeReshape, reason: string]
  /** Proposal to resize a node; carries `id` plus `before` and `after` boxes. The parent updates `sizes` and, if the origin moved, `positions`. */
  'node-resize': [change: GraphNodeResize]
  /** A node resize was rejected by `validateNodeResize`; carries the proposal and the reason. */
  'node-resize-rejected': [change: GraphNodeResize, reason: string]
}>()
const slots = defineSlots<{
  node(props: NetworkNodeSlot<ShownNode>): unknown
  edge(props: { edge: ShownEdge; path: string; selected: boolean; dimmed?: boolean; scale: number }): unknown
  empty(): unknown
  tooltip?(props: NetworkTooltipSlot<ShownNode, ShownEdge>): unknown
}>()
// Plain values compared one level deep: equal primitives, or arrays with identical items.
function sameValue(a: unknown, b: unknown) {
  if (a === b) return true
  return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((item, i) => item === b[i])
}
function sameRecord(a: object | undefined, b: object | undefined) {
  if (a === b) return true
  if (!a || !b) return false
  const keys = Object.keys(a)
  return keys.length === Object.keys(b).length
    && keys.every(key => Object.hasOwn(b, key) && sameValue((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]))
}
// `labels` and `groups` are memoised by value like `options`, so inline literals in a parent template do not rebuild
// the layout or cancel a gesture each time the parent renders.
const labels = computed<Partial<GraphLabels> | undefined>(previous => sameRecord(previous, props.labels) ? previous : props.labels)
const groups = computed<readonly NetworkGroup[] | undefined>((previous) => {
  const next = props.groups
  return previous === next || (previous && next && previous.length === next.length && previous.every((group, i) => sameRecord(group, next[i])))
    ? previous : next
})
const messages = computed<GraphLabels>(() => ({
  region: 'Network graph', empty: 'No nodes to display', zoom: 'Graph zoom',
  zoomIn: 'Zoom in', zoomOut: 'Zoom out', fit: 'Fit to view',
  minimap: 'Navigate graph overview', connectFrom: 'Start connection from', connectTo: 'Connect to',
  reconnectSource: 'Reconnect source of', reconnectTarget: 'Reconnect target of', moveGroup: 'Move group',
  rejected: 'This connection was rejected.', selectEdge: 'Select edge', groupWithin: 'within',
  deleteRejected: 'This deletion was rejected.', collapseGroup: 'Collapse group', expandGroup: 'Expand group',
  collapsedNode: 'node', collapsedNodes: 'nodes', moveWaypoint: 'Move waypoint', addWaypoint: 'Add waypoint',
  reshapeRejected: 'This edge change was rejected.', resizeNode: 'Resize', topLeft: 'top left', topRight: 'top right',
  bottomLeft: 'bottom left', bottomRight: 'bottom right', resizeRejected: 'This resize was rejected.', ...labels.value,
}))
// Tests that read the props once, for the loops over every node and edge.
function selectionTest() {
  const ids = props.selectedIds, single = props.selectedId
  return (id: string) => ids ? ids.has(id) : single === id
}
function isSelected(id: string) {
  return selectionTest()(id)
}
const selectedTest = computed(selectionTest)
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
// With `dir="auto"`, a MutationObserver on the `dir` attributes of the ancestors detects the direction again when one
// of them changes. A change of direction cancels a gesture in flight.
let directionObserver: MutationObserver | undefined
function detectDirection() {
  const element = root.value
  inheritedRtl.value = props.dir === 'auto' && element !== undefined && getComputedStyle(element).direction === 'rtl'
  directionObserver?.disconnect()
  directionObserver = undefined
  if (props.dir !== 'auto' || !element || typeof MutationObserver === 'undefined') return
  directionObserver = new MutationObserver(() => {
    const before = inheritedRtl.value
    inheritedRtl.value = props.dir === 'auto' && getComputedStyle(element).direction === 'rtl'
    if (inheritedRtl.value !== before) cancelInteraction()
  })
  for (let ancestor = element.parentElement; ancestor; ancestor = ancestor.parentElement) {
    directionObserver.observe(ancestor, { attributes: true, attributeFilter: ['dir'] })
  }
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
// Group collapse. Without collapsed groups the view is the input itself, so nothing else changes.
const localCollapsed = shallowRef<ReadonlySet<string>>(new Set())
const collapsedIds = computed(() => props.collapsedGroupIds ?? (props.collapsibleGroups ? localCollapsed.value : undefined))
const collapsedView = computed(() => {
  const ids = collapsedIds.value, list = groups.value
  if (!ids?.size || !list?.length) return undefined
  // IDs of groups that no longer exist are ignored, so deleting a collapsed group's nodes does not break rendering.
  const known = new Set(list.map(group => group.id))
  const active = [...ids].filter(id => known.has(id))
  if (!active.length) return undefined
  const { collapsedNode, collapsedNodes } = messages.value
  return collapseGraphGroups(props.nodes, props.edges, list, active, {
    detail: group => group.nodeIds.length + ' ' + (group.nodeIds.length === 1 ? collapsedNode : collapsedNodes),
  })
})
// Collapsed views exist only with groups, so their proxies and merged edges are part of the shown types.
const viewNodes = computed<readonly ShownNode[]>(() => (collapsedView.value?.nodes as ShownNode[] | undefined) ?? props.nodes)
const viewEdges = computed<readonly ShownEdge[]>(() => (collapsedView.value?.edges as ShownEdge[] | undefined) ?? props.edges)
const viewGroups = computed(() => collapsedView.value?.groups ?? groups.value)
const realNodesById = computed(() => collapsedView.value ? new Map(props.nodes.map(node => [node.id, node])) : nodesById.value)
const realEdgesById = computed(() => collapsedView.value ? new Map(props.edges.map(edge => [edge.id, edge])) : edgesById.value)
const baseLayout = computed(() => {
  const nodes = viewNodes.value, edges = viewEdges.value
  if (props.layout) indexGraph(nodes, edges)
  const result = props.layout ? props.layout(nodes, edges) : layoutLayeredGraph(nodes, edges, options.value)
  if (!Number.isFinite(result.width) || !Number.isFinite(result.height) || result.width <= 0 || result.height <= 0) {
    throw new Error('A custom layout must return positive finite dimensions')
  }
  for (const node of nodes) {
    const box = result.boxes.get(node.id)
    if (!box || ![box.x, box.y, box.width, box.height].every(Number.isFinite) || box.width <= 0 || box.height <= 0) {
      throw new Error('Missing or invalid layout box: ' + node.id)
    }
  }
  for (const edge of edges) {
    if (!result.paths.has(edge.id)) throw new Error('Missing layout path: ' + edge.id)
  }
  return result
})
const nodesById = computed(() => new Map(viewNodes.value.map(node => [node.id, node])))
const edgesById = computed(() => new Map(viewEdges.value.map(edge => [edge.id, edge])))
const direction = computed(() => options.value.direction ?? 'LR')
const dragPreview = ref<ReadonlyMap<string, GraphPoint>>()
// Previews of a node resize and of an edge's waypoints during a pointer drag.
const resizePreview = shallowRef<{ id: string; box: GraphRect }>()
const reshapePreview = shallowRef<{ id: string; points: GraphPoint[] }>()
// The uncollapsed layout with saved positions. Only read when groups are collapsed, to place proxies and move members.
const expandedLayout = computed(() => {
  const base = props.layout ? props.layout(props.nodes, props.edges) : layoutLayeredGraph(props.nodes, props.edges, options.value)
  return props.positions?.size ? applyGraphPositions(base, props.edges, props.positions, direction.value) : base
})
function memberCorner(ids: readonly string[]): GraphPoint {
  let x = Infinity, y = Infinity
  for (const id of ids) {
    const box = expandedLayout.value.boxes.get(id)
    if (!box) continue
    x = Math.min(x, box.x)
    y = Math.min(y, box.y)
  }
  return Number.isFinite(x) ? { x, y } : { x: 0, y: 0 }
}
// Saved positions of the view. A proxy whose members have saved positions sits at the top-left corner of their boxes.
const viewPositions = computed(() => {
  const view = collapsedView.value, saved = props.positions
  if (!view || !saved?.size) return saved
  let result: Map<string, GraphPoint> | undefined
  for (const proxy of view.proxies.values()) {
    if (proxy.nodeIds.some(id => saved.has(id))) (result ??= new Map(saved)).set(proxy.id, memberCorner(proxy.nodeIds))
  }
  return result ?? saved
})
function arrange(positions: ReadonlyMap<string, GraphPoint> | undefined, sizes: ReadonlyMap<string, GraphNodeSize> | undefined) {
  const edges = viewEdges.value
  const placed = positions?.size ? applyGraphPositions(baseLayout.value, edges, positions, direction.value) : baseLayout.value
  return sizes?.size ? applyGraphSizes(placed, edges, sizes, direction.value) : placed
}
const routeOptions = computed(() => ({ style: props.edgeStyle, direction: direction.value, cornerRadius: props.edgeStyle === 'orthogonal' ? 6 : 0 }))
// Ports first, then the edge style and waypoints. The default curve style without waypoints keeps the routed layout.
const savedLayout = computed(() => arrange(viewPositions.value, props.sizes))
const savedPorted = computed(() => routeGraphPorts(savedLayout.value, nodesById.value, viewEdges.value, direction.value))
const savedRouted = computed(() => routeGraphEdges(savedPorted.value, viewEdges.value, nodesById.value, routeOptions.value))

// Drag previews. A node drag, resize or waypoint drag changes a few nodes or one edge, so the preview layout shares the
// saved layout's maps and recomputes only the edges that touch a changed node. The result equals arranging and routing
// the whole graph with the previewed positions, sizes and waypoints, as the saved layout is computed.
class LayeredMap<K, V> extends Map<K, V> {
  private readonly base: ReadonlyMap<K, V>
  // Changed entries; undefined removes an entry of the base.
  private readonly changes: ReadonlyMap<K, V | undefined>
  private readonly count: number
  constructor(base: ReadonlyMap<K, V>, changes: ReadonlyMap<K, V | undefined>) {
    super()
    this.base = base
    this.changes = changes
    let count = base.size
    for (const [key, value] of changes) count += (value !== undefined ? 1 : 0) - (base.has(key) ? 1 : 0)
    this.count = count
  }
  override get(key: K) {
    return this.changes.has(key) ? this.changes.get(key) : this.base.get(key)
  }
  override has(key: K) {
    return this.changes.has(key) ? this.changes.get(key) !== undefined : this.base.has(key)
  }
  override get size() {
    return this.count
  }
  override *entries(): MapIterator<[K, V]> {
    for (const [key, value] of this.base) {
      const next = this.changes.has(key) ? this.changes.get(key) : value
      if (next !== undefined) yield [key, next]
    }
    for (const [key, value] of this.changes) if (value !== undefined && !this.base.has(key)) yield [key, value]
  }
  override [Symbol.iterator]() {
    return this.entries()
  }
  override *keys(): MapIterator<K> {
    for (const [key] of this.entries()) yield key
  }
  override *values(): MapIterator<V> {
    for (const [, value] of this.entries()) yield value
  }
  override forEach(callback: (value: V, key: K, map: Map<K, V>) => void, thisArg?: unknown) {
    for (const [key, value] of this.entries()) callback.call(thisArg, value, key, this)
  }
  override set(): this {
    throw new TypeError('A preview layout is read-only')
  }
  override delete(): boolean {
    throw new TypeError('A preview layout is read-only')
  }
  override clear() {
    throw new TypeError('A preview layout is read-only')
  }
}
type Extent = { id: string; width: number; height: number }
type Extents = { byWidth: Extent[]; byHeight: Extent[] }
function sortExtents(list: Extent[]): Extents {
  return { byWidth: [...list].sort((a, b) => b.width - a.width), byHeight: list.sort((a, b) => b.height - a.height) }
}
// The largest width and height among the extents whose ID is not skipped.
function largestExtent(extents: Extents, skip: { has(id: string): boolean }) {
  let width = -Infinity, height = -Infinity
  for (const item of extents.byWidth) {
    if (skip.has(item.id)) continue
    width = item.width
    break
  }
  for (const item of extents.byHeight) {
    if (skip.has(item.id)) continue
    height = item.height
    break
  }
  return { width, height }
}
// The box a saved or previewed position and size give a layout box, and how far it stretches the layout, as
// applyGraphPositions and applyGraphSizes compute them. Undefined when the node keeps its layout box.
function placeBox(box: GraphBox, point: GraphPoint | undefined, size: GraphNodeSize | undefined) {
  const moved = point !== undefined && (point.x !== box.x || point.y !== box.y)
  const resized = size !== undefined && (size.width !== box.width || size.height !== box.height)
  if (!moved && !resized) return undefined
  let next = box, width = -Infinity, height = -Infinity
  if (moved) {
    next = { ...box, x: point.x, y: point.y }
    width = point.x + box.width + 32
    height = point.y + box.height + 32
  }
  if (resized) {
    next = { ...next, width: size.width, height: size.height }
    width = Math.max(width, next.x + size.width + 32)
    height = Math.max(height, next.y + size.height + 32)
  }
  return { box: next, width, height }
}
const savedExtents = computed(() => {
  const boxes = baseLayout.value.boxes, positions = viewPositions.value, sizes = props.sizes
  const list: Extent[] = []
  for (const id of new Set([...positions?.keys() ?? [], ...sizes?.keys() ?? []])) {
    const box = boxes.get(id)
    const placed = box && placeBox(box, positions?.get(id), sizes?.get(id))
    if (placed) list.push({ id, width: placed.width, height: placed.height })
  }
  return sortExtents(list)
})
function hasPorts(edge: GraphEdge) {
  return edge.fromPort !== undefined || edge.toPort !== undefined
}
const portEdges = computed(() => viewEdges.value.filter(hasPorts))
const waypointEdgeIds = computed(() => viewEdges.value.filter(edge => edge.points?.length).map(edge => edge.id))
// Whether routeGraphEdges draws an edge itself rather than keeping its ported path.
function styled(edge: GraphEdge) {
  return props.edgeStyle !== 'curve' || Boolean(edge.points?.length)
}
// One edge routed on its own; the extent is how far its route stretches the layout.
function routeOne(boxes: Map<string, GraphBox>, edge: GraphEdge, path: string, label: GraphPoint | undefined) {
  const single = routeGraphEdges({
    boxes, paths: new Map([[edge.id, path]]), edgeLabels: new Map(label ? [[edge.id, label]] : []), width: 0, height: 0,
  }, [edge], nodesById.value, routeOptions.value)
  return { path: single.paths.get(edge.id)!, label: single.edgeLabels.get(edge.id), width: single.width, height: single.height }
}
// Route extents of the saved layout, computed once a preview needs them.
const savedRouteExtents = computed(() => {
  const ported = savedPorted.value
  const list: Extent[] = []
  for (const edge of viewEdges.value) {
    if (!styled(edge)) continue
    const route = routeOne(ported.boxes, edge, ported.paths.get(edge.id)!, ported.edgeLabels.get(edge.id))
    list.push({ id: edge.id, width: route.width, height: route.height })
  }
  return sortExtents(list)
})
function previewLayout(
  moving: ReadonlyMap<string, GraphPoint> | undefined, resizing: { id: string; box: GraphRect } | undefined,
  reshaping: { id: string; points: GraphPoint[] } | undefined,
): GraphLayout {
  const base = baseLayout.value, arranged = savedLayout.value, saved = savedRouted.value
  const positions = viewPositions.value, sizes = props.sizes, dir = direction.value
  const pointOf = (id: string) => resizing?.id === id ? resizing.box : moving?.get(id) ?? positions?.get(id)
  const sizeOf = (id: string) => resizing?.id === id ? resizing.box : sizes?.get(id)
  // Changed nodes get the boxes the full arrangement would give them; every other box is the saved one.
  const changed = new Map<string, GraphBox>()
  let width = base.width, height = base.height
  for (const id of [...moving?.keys() ?? [], ...resizing ? [resizing.id] : []]) {
    const box = base.boxes.get(id)
    if (!box) continue
    const placed = placeBox(box, pointOf(id), sizeOf(id))
    changed.set(id, placed?.box ?? box)
    if (placed) {
      width = Math.max(width, placed.width)
      height = Math.max(height, placed.height)
    }
  }
  const rest = largestExtent(savedExtents.value, changed)
  width = Math.max(width, rest.width)
  height = Math.max(height, rest.height)
  const boxes = changed.size ? new LayeredMap(arranged.boxes, changed) : arranged.boxes
  // A node whose box differs from the layout box, so that its edges are drawn as curves between the final boxes.
  const placedNode = (id: string) => boxes.get(id) !== base.boxes.get(id)
  // Edges that touch a changed node, plus the reshaped edge, in input order of discovery.
  const ids = new Set<string>()
  for (const id of changed.keys()) for (const edgeId of incidentEdges.value.get(id) ?? []) ids.add(edgeId)
  if (reshaping) ids.add(reshaping.id)
  const edges = [...ids].map(id => {
    const edge = edgesById.value.get(id)!
    return reshaping?.id === id ? { ...edge, points: reshaping.points } : edge
  })
  const paths = new Map<string, string>(), labels = new Map<string, GraphPoint | undefined>()
  for (const edge of edges) {
    if (placedNode(edge.from) || placedNode(edge.to)) {
      const curve = graphIncidentCurve(boxes.get(edge.from)!, boxes.get(edge.to)!, edge.from === edge.to, dir)
      paths.set(edge.id, curve.path)
      labels.set(edge.id, curve.label)
    } else {
      paths.set(edge.id, base.paths.get(edge.id)!)
      labels.set(edge.id, base.edgeLabels.get(edge.id))
    }
  }
  // Ports. Their routes depend on the layout size, so a size change reroutes every edge with a port.
  const ports = width !== arranged.width || height !== arranged.height ? portEdges.value : edges.filter(hasPorts)
  if (ports.length) {
    const arrangedPath = (id: string) => paths.has(id) ? paths.get(id)! : arranged.paths.get(id)!
    const arrangedLabel = (id: string) => labels.has(id) ? labels.get(id) : arranged.edgeLabels.get(id)
    const routed = routeGraphPorts({
      boxes, width, height, paths: new Map(ports.map(edge => [edge.id, arrangedPath(edge.id)])),
      edgeLabels: new Map(ports.flatMap(edge => {
        const label = arrangedLabel(edge.id)
        return label ? [[edge.id, label] as const] : []
      })),
    }, nodesById.value, ports, dir)
    for (const edge of ports) {
      paths.set(edge.id, routed.paths.get(edge.id)!)
      labels.set(edge.id, routed.edgeLabels.get(edge.id))
    }
  }
  // Edge styles and waypoints, as routeGraphEdges draws them after the ports.
  if (props.edgeStyle !== 'curve' || edges.some(edge => edge.points?.length) || waypointEdgeIds.value.some(id => !ids.has(id))) {
    const others = largestExtent(savedRouteExtents.value, ids)
    width = Math.max(width, others.width)
    height = Math.max(height, others.height)
    for (const edge of edges) {
      if (!styled(edge)) continue
      const route = routeOne(boxes, edge, paths.get(edge.id)!, labels.get(edge.id))
      paths.set(edge.id, route.path)
      labels.set(edge.id, route.label)
      width = Math.max(width, route.width)
      height = Math.max(height, route.height)
    }
    // A styled edge outside the changed set keeps its saved route, whatever its port route became.
    for (const id of [...paths.keys()]) {
      if (ids.has(id) || !styled(edgesById.value.get(id)!)) continue
      paths.delete(id)
      labels.delete(id)
    }
  }
  const preview = { boxes, paths: new LayeredMap(saved.paths, paths), edgeLabels: new LayeredMap(saved.edgeLabels, labels), width, height }
  previewSources.set(preview, { saved, nodes: [...changed.keys()], edges: [...paths.keys()] })
  return preview
}
// The saved layout a preview was made from, and the nodes and edges it changes.
const previewSources = new WeakMap<GraphLayout, { saved: GraphLayout; nodes: readonly string[]; edges: readonly string[] }>()
const layout = computed(() => {
  const moving = dragPreview.value, resizing = resizePreview.value, reshaping = reshapePreview.value
  if (!moving && !resizing && !reshaping) return savedRouted.value
  return previewLayout(moving, resizing, reshaping)
})
// Nodes with their boxes. An unchanged node keeps its object, so the components of unmoved nodes are not re-rendered.
type PositionedNode = NetworkNode & { box: GraphBox }
const placedNodes = new WeakMap<NetworkNode, PositionedNode>()
function placeNode(node: NetworkNode, box: GraphBox): PositionedNode {
  const previous = placedNodes.get(node)
  if (previous && (previous.box === box || sameRecord(previous.box, box)) && sameNode(previous, node)) return previous
  const next = { ...node, box }
  placedNodes.set(node, next)
  return next
}
// The node fields copied into a positioned node. Reading them again also picks up changes of a reactive node.
function sameNode(placed: PositionedNode, node: NetworkNode) {
  let count = 0
  for (const key of Object.keys(node)) {
    if (key === 'box') continue
    count++
    if ((placed as unknown as Record<string, unknown>)[key] !== (node as unknown as Record<string, unknown>)[key]) return false
  }
  return Object.keys(placed).length === count + 1
}
const positioned = computed(() => {
  const boxes = layout.value.boxes
  return viewNodes.value.map(node => placeNode(node, boxes.get(node.id)!))
})

type GroupShape = NetworkGroup & { members: string[]; depth: number; parentLabel?: string }
const groupMembership = computed<GroupShape[]>(() => {
  const list = viewGroups.value ?? []
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
// Handles of a positioned node are kept with it, so an unmoved node keeps its handle objects (see the v-memo below).
const nodeHandles = new WeakMap<PositionedNode, { rl: boolean; list: PortHandle[] }>()
const handles = computed(() => {
  const rl = direction.value === 'RL'
  return positioned.value.flatMap<PortHandle>(node => {
    const cached = nodeHandles.get(node)
    if (cached?.rl === rl) return cached.list
    const list: PortHandle[] = !node.ports
      ? [{ node: node.id, label: node.label, direction: 'both' as const, port: undefined, x: rl ? node.box.x + 10 : node.box.x + node.box.width - 10, y: node.box.y + 11 }]
      : node.ports.map(port => ({
        node: node.id, port: port.id, label: node.label + ' · ' + (port.label ?? port.id),
        direction: port.direction ?? 'both', ...graphPortAnchor(node.box, port),
      }))
    nodeHandles.set(node, { rl, list })
    return list
  })
})
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
  if (!event.isPrimary || event.button !== 0 || !svg.value || pointerGestureActive()) return
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
  if (pan.box) startAutoPan(event)
}

// `camera` is the camera when the drag started; auto-pan moves the camera during the drag.
let nodeDrag: {
  pointerId: number; start: GraphPoint; before: Map<string, GraphPoint>; target: SVGElement; node?: string; camera: GraphPoint
} | undefined
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
    if (previous.x === point.x && previous.y === point.y) continue
    const proxy = collapsedView.value?.proxies.get(id)
    if (proxy) changes.push(...proxyMoves(proxy.nodeIds, point))
    else changes.push({ id, before: previous, after: point })
  }
  if (changes.length === 1) emit('node-move', changes[0]!)
  else if (changes.length > 1) emit('nodes-move', changes)
}

// A moved proxy moves its movable members: they keep their offsets, and the top-left corner of their boxes in the
// expanded graph lands on the proxy's new position.
function proxyMoves(ids: readonly string[], after: GraphPoint): GraphNodeMove[] {
  const corner = memberCorner(ids)
  const changes: GraphNodeMove[] = []
  for (const id of ids) {
    const box = expandedLayout.value.boxes.get(id)
    if (!box || realNodesById.value.get(id)?.draggable === false) continue
    const point = { x: Math.max(0, box.x - corner.x + after.x), y: Math.max(0, box.y - corner.y + after.y) }
    if (point.x !== box.x || point.y !== box.y) changes.push({ id, before: { x: box.x, y: box.y }, after: point })
  }
  return changes
}

// Snapping. The reference point of a move is the top-left corner of the dragged or focused node, or of the bounding
// box of the moved nodes for a group. It lands on the grid; the other moved nodes keep their offsets from it.
function movedBounds(before: ReadonlyMap<string, GraphPoint>): GraphRect {
  let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity
  for (const [id, point] of before) {
    const box = savedLayout.value.boxes.get(id)!
    left = Math.min(left, point.x)
    top = Math.min(top, point.y)
    right = Math.max(right, point.x + box.width)
    bottom = Math.max(bottom, point.y + box.height)
  }
  return { x: left, y: top, width: right - left, height: bottom - top }
}
function referencePoint(before: ReadonlyMap<string, GraphPoint>, node?: string): GraphPoint {
  return (node === undefined ? undefined : before.get(node)) ?? movedBounds(before)
}
function snapValue(value: number, grid: number) {
  return Math.round(value / grid) * grid + 0
}
// The lowest reference coordinate that keeps every moved node at a nonnegative position, on the grid when given.
function clampTarget(start: number, target: number, low: number, grid?: number) {
  if (target - start >= low) return target
  return grid === undefined ? start + low : Math.ceil((start + low) / grid - 1e-9) * grid + 0
}
function placeMoved(
  before: ReadonlyMap<string, GraphPoint>, reference: GraphPoint, target: GraphPoint, node?: string, gridX?: number, gridY?: number,
) {
  let lowX = -Infinity, lowY = -Infinity
  for (const point of before.values()) {
    lowX = Math.max(lowX, -point.x)
    lowY = Math.max(lowY, -point.y)
  }
  const x = clampTarget(reference.x, target.x, lowX, gridX), y = clampTarget(reference.y, target.y, lowY, gridY)
  const dx = x - reference.x, dy = y - reference.y
  return new Map([...before].map(([id, point]) => [id, id === node
    ? { x, y } : { x: Math.max(0, point.x + dx), y: Math.max(0, point.y + dy) }]))
}
// Non-moving node boxes that guides align with: every node, or only the rendered ones when culling is on.
function guideCandidates(moving: ReadonlyMap<string, GraphPoint>) {
  const rendered = visible.value?.nodes
  const rects: GraphRect[] = []
  for (const [id, box] of savedLayout.value.boxes) {
    if (!moving.has(id) && (!rendered || rendered.has(id))) rects.push({ x: box.x, y: box.y, width: box.width, height: box.height })
  }
  return rects
}
const guideLines = shallowRef<GraphAlignmentGuide[]>()
function dragPositions(drag: NonNullable<typeof nodeDrag>, dx: number, dy: number) {
  const grid = props.snapGrid
  if (grid === undefined && !props.alignmentGuides) return movePositions(drag.before, dx, dy)
  const node = drag.node !== undefined && drag.before.has(drag.node) ? drag.node : undefined
  const reference = referencePoint(drag.before, node)
  const bounds = movedBounds(drag.before)
  let gridX = grid, gridY = grid, others: GraphRect[] = []
  if (props.alignmentGuides) {
    others = guideCandidates(drag.before)
    // Guides win over the grid on the axis they align.
    const match = graphAlignmentGuides({ ...bounds, x: bounds.x + dx, y: bounds.y + dy }, others, props.guideThreshold / camera.value.scale)
    if (match.guides.some(guide => guide.axis === 'x')) {
      dx += match.dx
      gridX = undefined
    }
    if (match.guides.some(guide => guide.axis === 'y')) {
      dy += match.dy
      gridY = undefined
    }
  }
  const target = {
    x: gridX === undefined ? reference.x + dx : snapValue(reference.x + dx, gridX),
    y: gridY === undefined ? reference.y + dy : snapValue(reference.y + dy, gridY),
  }
  const positions = placeMoved(drag.before, reference, target, node, gridX, gridY)
  if (props.alignmentGuides) {
    // Guides for the final position, which may also be aligned by the grid or the nonnegative clamp.
    const moved = movedBounds(positions)
    guideLines.value = graphAlignmentGuides(moved, others, 1e-6).guides
  }
  return positions
}

function startNodeDrag(event: PointerEvent, ids: Iterable<string>, node?: string) {
  suppressClick = undefined
  if (!props.draggable || !event.isPrimary || event.button !== 0 || pointerGestureActive()) return
  if (node && nodesById.value.get(node)?.draggable === false) return
  const before = movablePositions(ids)
  if (!before.size) return
  const target = event.currentTarget as SVGElement
  nodeDrag = {
    pointerId: event.pointerId, target, before, node, start: { x: event.clientX, y: event.clientY },
    camera: { x: camera.value.x, y: camera.value.y },
  }
  gestureIds.value = new Set(before.keys())
  target.focus({ preventScroll: true })
  target.setPointerCapture(event.pointerId)
  startAutoPan(event)
}

function updateNodePreview(clientX: number, clientY: number) {
  if (!nodeDrag) return
  const dx = clientX - nodeDrag.start.x, dy = clientY - nodeDrag.start.y
  if (!dragPreview.value && Math.hypot(dx, dy) < 4) return
  const { x, y, scale } = camera.value
  // Camera movement during the drag (auto-pan) moves the chart under a still pointer.
  dragPreview.value = dragPositions(nodeDrag, (dx - (x - nodeDrag.camera.x)) / scale, (dy - (y - nodeDrag.camera.y)) / scale)
}
function moveNode(event: PointerEvent) {
  if (!nodeDrag || nodeDrag.pointerId !== event.pointerId) return
  gesturePointer = { x: event.clientX, y: event.clientY }
  updateNodePreview(event.clientX, event.clientY)
}
function cancelNodeDrag() {
  const drag = nodeDrag
  nodeDrag = undefined
  gestureIds.value = noIds
  guideLines.value = undefined
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
function moveWithKeys(event: KeyboardEvent, ids: Iterable<string>, node?: string) {
  if (!props.draggable || nodeDrag) return
  const offsets: Record<string, [number, number]> = {
    ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1],
  }
  const offset = offsets[event.key]
  if (!offset) return
  const before = movablePositions(ids)
  if (!before.size) return
  event.preventDefault()
  const grid = props.snapGrid
  if (grid === undefined) {
    const step = event.shiftKey ? 40 : 10
    emitMoves(before, movePositions(before, offset[0] * step, offset[1] * step))
    return
  }
  // With a grid, the reference point steps to the next grid line (four with Shift) in the arrow direction.
  const cells = event.shiftKey ? 4 : 1
  const anchor = node !== undefined && before.has(node) ? node : undefined
  const reference = referencePoint(before, anchor)
  const step = (start: number, direction: number) => direction > 0 ? (Math.floor(start / grid + 1e-9) + cells) * grid
    : direction < 0 ? (Math.ceil(start / grid - 1e-9) - cells) * grid + 0 : start
  const target = { x: step(reference.x, offset[0]), y: step(reference.y, offset[1]) }
  emitMoves(before, placeMoved(before, reference, target, anchor, grid, grid))
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
function edgeSelectionTest() {
  const ids = props.selectedEdgeIds, active = activeEdgeId.value
  return (id: string) => ids ? ids.has(id) : active === id
}
function edgeSelected(id: string) {
  return edgeSelectionTest()(id)
}
function edgePressedTest() {
  const selected = edgeSelectionTest(), active = activeEdgeId.value
  return props.edgesSelectable ? selected : (id: string) => active === id
}
function edgePressed(id: string) {
  return edgePressedTest()(id)
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
  if (!edge || collapsedView.value?.mergedEdges.has(edge.id)) return []
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
  startAutoPan(event)
}
function startPort(event: PointerEvent, handle: PortHandle) {
  skipHandleClick = false
  if (draft.value || !event.isPrimary || event.button !== 0 || handle.direction === 'target' || pointerGestureActive()) return
  draft.value = { fixed: handle, end: 'to' }
  captureConnection(event)
}
function reconnectEdge(edge: GraphEdge, end: 'from' | 'to', event?: PointerEvent) {
  if (event && (!event.isPrimary || event.button !== 0 || pointerGestureActive())) return
  skipHandleClick = false
  const fixed = end === 'from' ? { node: edge.to, port: edge.toPort } : { node: edge.from, port: edge.fromPort }
  draft.value = { fixed, end, edge }
  if (event) captureConnection(event)
}
function moveConnection(event: PointerEvent) {
  if (connectionDrag?.pointerId !== event.pointerId) return
  gesturePointer = { x: event.clientX, y: event.clientY }
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
  const element = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-vw-port]')
  const key = element && svg.value?.contains(element) ? element.getAttribute('data-vw-port') : null
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
  stopAutoPan()
  cancelNodeDrag()
  cancelHandleDrag()
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

function updateBox(clientX: number, clientY: number) {
  if (!pan) return
  // The start corner keeps its chart position when auto-pan moves the camera.
  const a = worldPoint(pan.x + camera.value.x - pan.cameraX, pan.y + camera.value.y - pan.cameraY), b = worldPoint(clientX, clientY)
  boxPreview.value = { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y) }
}
function movePan(event: PointerEvent) {
  if (!pan || pan.pointerId !== event.pointerId) return
  if (pan.box) {
    gesturePointer = { x: event.clientX, y: event.clientY }
    updateBox(event.clientX, event.clientY)
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

// Auto-pan. While a node drag, connection or box selection is held near the stage edge, the camera pans every frame,
// faster the closer the pointer is to the edge, and the preview follows the pointer.
const autoPanEdge = 40
const autoPanSpeed = 20
let autoPanFrame = 0
let gesturePointer: GraphPoint | undefined
function startAutoPan(event: PointerEvent) {
  gesturePointer = { x: event.clientX, y: event.clientY }
  if (props.autoPan && !autoPanFrame && typeof requestAnimationFrame === 'function') autoPanFrame = requestAnimationFrame(autoPanStep)
}
function stopAutoPan() {
  if (autoPanFrame && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(autoPanFrame)
  autoPanFrame = 0
}
function autoPanStep() {
  autoPanFrame = 0
  const point = gesturePointer
  // A gesture that has not moved yet waits; a finished or cancelled one ends the loop.
  const moving = nodeDrag ? Boolean(dragPreview.value) : connectionDrag ? Boolean(connectionPoint.value)
    : pan?.box ? Boolean(boxPreview.value) : undefined
  if (moving === undefined || pinch || !props.autoPan || !svg.value || !point) return
  if (moving) {
    const rect = svg.value.getBoundingClientRect()
    const speed = (distance: number) => distance < autoPanEdge
      ? Math.ceil(Math.min(1, (autoPanEdge - distance) / autoPanEdge) * autoPanSpeed) : 0
    const { x, y, scale } = camera.value
    const content = contentBounds.value
    // Towards the start, panning stops a margin beyond the chart origin or the content, whichever is further out.
    const limitX = autoPanEdge - Math.min(0, content.left) * scale, limitY = autoPanEdge - Math.min(0, content.top) * scale
    let stepX = speed(point.x - rect.left) - speed(rect.right - point.x)
    let stepY = speed(point.y - rect.top) - speed(rect.bottom - point.y)
    if (stepX > 0) stepX = Math.max(0, Math.min(stepX, limitX - x))
    if (stepY > 0) stepY = Math.max(0, Math.min(stepY, limitY - y))
    if (stepX || stepY) {
      fitMode.value = 'manual'
      camera.value = { x: x + stepX, y: y + stepY, scale }
      if (nodeDrag) updateNodePreview(point.x, point.y)
      else if (connectionDrag) connectionPoint.value = worldPoint(point.x, point.y)
      else updateBox(point.x, point.y)
    }
  }
  autoPanFrame = requestAnimationFrame(autoPanStep)
}

// Group collapse toggles, waypoint handles and resize handles share the overlay drawn above the nodes.
const overlay = computed(() => Boolean(props.collapsibleGroups || props.editableEdges || props.resizable))
type GroupToggle = { id: string; expanded: boolean; x: number; y: number; label: string }
const groupToggles = computed(() => {
  if (!props.collapsibleGroups) return []
  const toggles: GroupToggle[] = []
  for (const group of renderedGroups.value) {
    toggles.push({
      id: group.id, expanded: true, x: rtl.value ? group.x + 4 : group.x + group.width - 18, y: group.y + 4,
      label: messages.value.collapseGroup + ' ' + group.label,
    })
  }
  for (const proxy of collapsedView.value?.proxies.values() ?? []) {
    const box = layout.value.boxes.get(proxy.id)
    if (!box || (visible.value && !visible.value.nodes.has(proxy.id))) continue
    // A proxy has no ports, so its connection handle sits in a top corner (see handles). The toggle goes in the bottom
    // corner at the text end; a box too short for both gets it in the top corner away from the handle.
    const tall = box.height >= 40
    const left = tall ? rtl.value : direction.value !== 'RL'
    toggles.push({
      id: proxy.id, expanded: false, x: left ? box.x + 4 : box.x + box.width - 18, y: tall ? box.y + box.height - 18 : box.y + 4,
      label: messages.value.expandGroup + ' ' + proxy.label,
    })
  }
  return toggles
})
function toggleGroup(toggle: GroupToggle) {
  if (gestureInFlight()) return
  const next = new Set(collapsedIds.value ?? [])
  if (toggle.expanded) next.add(toggle.id)
  else next.delete(toggle.id)
  if (props.collapsedGroupIds === undefined) localCollapsed.value = next
  emit('update:collapsedGroupIds', next)
  // The toggle is replaced by the toggle of the proxy or of the expanded group; keep keyboard focus on it.
  void nextTick(() => {
    const element = [...root.value?.querySelectorAll<SVGElement>('[data-vw-toggle]') ?? []].find(item => item.getAttribute('data-vw-toggle') === toggle.id)
    element?.focus({ preventScroll: true })
  })
}

function clampPoint(point: GraphPoint): GraphPoint {
  return { x: Math.max(0, point.x), y: Math.max(0, point.y) }
}
// The next grid line (or four with Shift) from a value in a direction, or a plain step of 10 (40) without a grid.
function stepValue(value: number, direction: number, shift: boolean) {
  const grid = props.snapGrid
  if (!direction) return value
  if (grid === undefined) return value + direction * (shift ? 40 : 10)
  const cells = shift ? 4 : 1
  return direction > 0 ? (Math.floor(value / grid + 1e-9) + cells) * grid : (Math.ceil(value / grid - 1e-9) - cells) * grid + 0
}
const arrowOffsets: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }

// Edge waypoints. The edge whose reconnect handles would show also shows its waypoint handles.
const reshapeEdge = computed(() => {
  const id = props.editableEdges ? currentEdgeId.value : undefined
  const edge = id === undefined ? undefined : edgesById.value.get(id)
  return edge && !collapsedView.value?.mergedEdges.has(edge.id) ? edge : undefined
})
type WaypointHandle = { key: string; kind: 'move' | 'add'; index: number; x: number; y: number; label: string }
const waypointHandles = computed(() => {
  const edge = reshapeEdge.value
  if (!edge || !layout.value.paths.has(edge.id)) return []
  const preview = reshapePreview.value
  const points = preview?.id === edge.id ? preview.points : edge.points ?? []
  const name = edge.label ?? edge.id
  const chain = [
    graphEdgeEndpoint(layout.value, nodesById.value, edge, 'from', direction.value), ...points,
    graphEdgeEndpoint(layout.value, nodesById.value, edge, 'to', direction.value),
  ]
  const handles: WaypointHandle[] = []
  for (let i = 1; i < chain.length; i++) {
    const a = chain[i - 1]!, b = chain[i]!
    handles.push({ key: 'add' + i, kind: 'add', index: i - 1, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, label: messages.value.addWaypoint + ' ' + i + ' · ' + name })
  }
  points.forEach((point, index) => handles.push({
    key: 'move' + index, kind: 'move', index, x: point.x, y: point.y, label: messages.value.moveWaypoint + ' ' + (index + 1) + ' · ' + name,
  }))
  return handles
})
function proposeReshape(edge: GraphEdge, after: GraphPoint[]) {
  const change: GraphEdgeReshape = { id: edge.id, before: (edge.points ?? []).map(point => ({ x: point.x, y: point.y })), after }
  notice.value = ''
  const result = props.validateEdgeReshape?.(change)
  if (result === false || typeof result === 'string') {
    notice.value = typeof result === 'string' ? result : messages.value.reshapeRejected!
    emit('edge-reshape-rejected', change, notice.value)
    return
  }
  emit('edge-reshape', change)
}
function focusEdge(id: string) {
  const hit = [...svg.value?.querySelectorAll<SVGElement>('.vw-edge-hit') ?? []].find(item => item.getAttribute('data-vw-edge') === id)
  ;(hit ?? svg.value)?.focus({ preventScroll: true })
}
function waypointKeys(event: KeyboardEvent, handle: WaypointHandle) {
  const edge = reshapeEdge.value
  if (!edge || gestureInFlight()) return
  const points = (edge.points ?? []).map(point => ({ x: point.x, y: point.y }))
  if (handle.kind === 'add') {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    event.stopPropagation()
    points.splice(handle.index, 0, clampPoint(props.snapGrid === undefined ? { x: handle.x, y: handle.y } : snapGraphPoint(handle, props.snapGrid)))
    proposeReshape(edge, points)
    return
  }
  if (event.key === 'Delete' || event.key === 'Backspace') {
    event.preventDefault()
    event.stopPropagation()
    if (event.repeat) return
    points.splice(handle.index, 1)
    proposeReshape(edge, points)
    // The removed handle leaves the DOM; focus returns to the edge.
    void nextTick(() => {
      if (!document.activeElement || !root.value?.contains(document.activeElement)) focusEdge(edge.id)
    })
    return
  }
  const offset = arrowOffsets[event.key]
  if (!offset) return
  event.preventDefault()
  event.stopPropagation()
  const point = points[handle.index]!
  points[handle.index] = clampPoint({ x: stepValue(point.x, offset[0], event.shiftKey), y: stepValue(point.y, offset[1], event.shiftKey) })
  proposeReshape(edge, points)
}

// Node resizing. Handles at the corners of the only selected node.
type Corner = 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight'
const corners: readonly Corner[] = ['topLeft', 'topRight', 'bottomLeft', 'bottomRight']
const minimumSize = computed(() => {
  const size = props.minNodeSize ?? { width: 40, height: 24 }
  if (![size.width, size.height].every(value => Number.isFinite(value) && value > 0)) throw new RangeError('minNodeSize must have a finite positive width and height')
  return size
})
const resizeHandles = computed(() => {
  if (!props.resizable) return []
  const ids = props.selectedIds ? [...props.selectedIds] : props.selectedId === undefined ? [] : [props.selectedId]
  const node = ids.length === 1 ? nodesById.value.get(ids[0]!) : undefined
  const box = node && layout.value.boxes.get(node.id)
  if (!node || !box || node.resizable === false || collapsedView.value?.proxies.has(node.id)) return []
  return corners.map(corner => ({
    corner, node: node.id, x: corner === 'topLeft' || corner === 'bottomLeft' ? box.x : box.x + box.width,
    y: corner === 'topLeft' || corner === 'topRight' ? box.y : box.y + box.height,
    label: messages.value.resizeNode + ' ' + node.label + ' · ' + messages.value[corner],
  }))
})
function savedBox(id: string): GraphRect | undefined {
  const box = savedLayout.value.boxes.get(id)
  return box && { x: box.x, y: box.y, width: box.width, height: box.height }
}
// Moves the box edges that a corner controls, keeping the opposite edges, the minimum size and a nonnegative origin.
function resizeBox(box: GraphRect, corner: Corner, left: number, top: number, right: number, bottom: number): GraphRect {
  const min = minimumSize.value
  const west = corner === 'topLeft' || corner === 'bottomLeft', north = corner === 'topLeft' || corner === 'topRight'
  const x0 = west ? Math.max(0, Math.min(left, box.x + box.width - min.width)) : box.x
  const x1 = west ? box.x + box.width : Math.max(box.x + min.width, right)
  const y0 = north ? Math.max(0, Math.min(top, box.y + box.height - min.height)) : box.y
  const y1 = north ? box.y + box.height : Math.max(box.y + min.height, bottom)
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 }
}
function proposeResize(id: string, before: GraphRect, after: GraphRect) {
  if (before.x === after.x && before.y === after.y && before.width === after.width && before.height === after.height) return
  const change: GraphNodeResize = { id, before, after }
  notice.value = ''
  const result = props.validateNodeResize?.(change)
  if (result === false || typeof result === 'string') {
    notice.value = typeof result === 'string' ? result : messages.value.resizeRejected!
    emit('node-resize-rejected', change, notice.value)
    return
  }
  emit('node-resize', change)
}
function resizeKeys(event: KeyboardEvent, id: string, corner: Corner) {
  const offset = arrowOffsets[event.key]
  const before = savedBox(id)
  if (!offset || !before || gestureInFlight()) return
  event.preventDefault()
  event.stopPropagation()
  const west = corner === 'topLeft' || corner === 'bottomLeft', north = corner === 'topLeft' || corner === 'topRight'
  const right = before.x + before.width, bottom = before.y + before.height
  proposeResize(id, before, resizeBox(before, corner,
    west ? stepValue(before.x, offset[0], event.shiftKey) : before.x, north ? stepValue(before.y, offset[1], event.shiftKey) : before.y,
    west ? right : stepValue(right, offset[0], event.shiftKey), north ? bottom : stepValue(bottom, offset[1], event.shiftKey)))
}

// Pointer drags of waypoint, insert and resize handles.
type HandleDrag = {
  pointerId: number; target: SVGElement; start: GraphPoint; camera: GraphPoint; kind: 'move' | 'add' | 'resize'
  id: string; index: number; origin: GraphPoint; corner?: Corner; box?: GraphRect
}
let handleDrag: HandleDrag | undefined
function startHandleDrag(event: PointerEvent, drag: Omit<HandleDrag, 'pointerId' | 'target' | 'start' | 'camera'>) {
  if (!event.isPrimary || event.button !== 0 || gestureInFlight()) return
  const target = event.currentTarget as SVGElement
  handleDrag = { ...drag, pointerId: event.pointerId, target, start: { x: event.clientX, y: event.clientY }, camera: { x: camera.value.x, y: camera.value.y } }
  target.focus({ preventScroll: true })
  target.setPointerCapture(event.pointerId)
}
function startWaypointDrag(event: PointerEvent, handle: WaypointHandle) {
  const edge = reshapeEdge.value
  if (edge) startHandleDrag(event, { kind: handle.kind, id: edge.id, index: handle.index, origin: { x: handle.x, y: handle.y } })
}
function startResizeDrag(event: PointerEvent, id: string, corner: Corner) {
  const box = savedBox(id)
  if (box) startHandleDrag(event, { kind: 'resize', id, index: 0, corner, box, origin: { x: box.x, y: box.y } })
}
function snapOrKeep(value: number) {
  return props.snapGrid === undefined ? value : snapValue(value, props.snapGrid)
}
function moveHandle(event: PointerEvent) {
  const drag = handleDrag
  if (!drag || drag.pointerId !== event.pointerId) return
  if (!resizePreview.value && !reshapePreview.value && Math.hypot(event.clientX - drag.start.x, event.clientY - drag.start.y) < 4) return
  const { x, y, scale } = camera.value
  const dx = (event.clientX - drag.start.x - (x - drag.camera.x)) / scale, dy = (event.clientY - drag.start.y - (y - drag.camera.y)) / scale
  if (drag.kind === 'resize') {
    const box = drag.box!
    resizePreview.value = { id: drag.id, box: resizeBox(box, drag.corner!, snapOrKeep(box.x + dx), snapOrKeep(box.y + dy),
      snapOrKeep(box.x + box.width + dx), snapOrKeep(box.y + box.height + dy)) }
    return
  }
  const edge = edgesById.value.get(drag.id)
  if (!edge) return
  const point = clampPoint({ x: snapOrKeep(drag.origin.x + dx), y: snapOrKeep(drag.origin.y + dy) })
  const points = (edge.points ?? []).map(item => ({ x: item.x, y: item.y }))
  if (drag.kind === 'add') points.splice(drag.index, 0, point)
  else points[drag.index] = point
  reshapePreview.value = { id: drag.id, points }
}
function cancelHandleDrag() {
  const drag = handleDrag
  handleDrag = undefined
  resizePreview.value = undefined
  reshapePreview.value = undefined
  if (drag?.target.hasPointerCapture(drag.pointerId)) drag.target.releasePointerCapture(drag.pointerId)
}
function finishHandle(event: PointerEvent) {
  const drag = handleDrag
  if (!drag || drag.pointerId !== event.pointerId) return
  if (event.type !== 'pointerup') return cancelHandleDrag()
  moveHandle(event)
  const resized = resizePreview.value, reshaped = reshapePreview.value
  cancelHandleDrag()
  if (drag.kind === 'resize') {
    if (resized) proposeResize(drag.id, drag.box!, resized.box)
    return
  }
  const edge = edgesById.value.get(drag.id)
  if (!edge) return
  if (reshaped) proposeReshape(edge, reshaped.points)
  else if (drag.kind === 'add') {
    // A press without movement inserts the waypoint at the handle.
    const points = (edge.points ?? []).map(item => ({ x: item.x, y: item.y }))
    points.splice(drag.index, 0, clampPoint({ x: snapOrKeep(drag.origin.x), y: snapOrKeep(drag.origin.y) }))
    proposeReshape(edge, points)
  }
}

// Level of detail. Below the threshold scale the default renderer hides node details and edge labels (CSS).
const lodLow = computed(() => props.lodThreshold !== undefined && camera.value.scale < props.lodThreshold)

function dimTest() {
  const dimmed = props.dimmedIds, matches = props.matchIds
  return (id: string) => Boolean(dimmed?.has(id) || (matches && !matches.has(id)))
}
function isDimmed(id: string) {
  return dimTest()(id)
}

// Viewport culling. Before mount the viewport is the 1150 x 270 default with the initial fit camera, so the
// server and the first client render agree; the measured size replaces it after mount.
const focused = ref<{ node?: string; edge?: string; group?: string }>()
function trackFocus(event: FocusEvent) {
  if (!props.cullOffscreen || !(event.target instanceof Element)) return
  const element = event.target.closest('[data-vw-node],[data-vw-edge],[data-vw-group]')
  focused.value = element ? {
    node: element.getAttribute('data-vw-node') ?? undefined,
    edge: element.getAttribute('data-vw-edge') ?? undefined,
    group: element.getAttribute('data-vw-group') ?? undefined,
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
  for (const edge of viewEdges.value) {
    for (const id of edge.from === edge.to ? [edge.from] : [edge.from, edge.to]) {
      const list = index.get(id)
      if (list) list.push(edge.id)
      else index.set(id, [edge.id])
    }
  }
  return index
})
// The nodes being dragged or resized and the edge being reshaped. They keep their identity while a gesture moves them,
// so culling is not recomputed on every pointer move.
const previewIds = computed<ReadonlySet<string>>((previous) => {
  const ids = new Set<string>(dragPreview.value?.keys())
  if (resizePreview.value) ids.add(resizePreview.value.id)
  return previous && previous.size === ids.size && [...ids].every(id => previous.has(id)) ? previous : ids
})
const reshapeId = computed(() => reshapePreview.value?.id)
const cullView = computed(() => layoutBounds.value && graphViewportRect(camera.value, viewport.value, Math.max(0, props.cullOverscan ?? 0)))
const visible = computed(() => {
  const bounds = layoutBounds.value, view = cullView.value
  if (!bounds || !view) return undefined
  const nodes = new Set<string>(props.selectedIds ?? (props.selectedId === undefined ? [] : [props.selectedId]))
  for (const id of gestureIds.value) nodes.add(id)
  const edges = new Set<string>()
  for (const id of previewIds.value) {
    nodes.add(id)
    for (const edgeId of incidentEdges.value.get(id) ?? []) edges.add(edgeId)
  }
  if (reshapeId.value !== undefined) edges.add(reshapeId.value)
  if (draft.value) nodes.add(draft.value.fixed.node)
  if (focused.value?.node) nodes.add(focused.value.node)
  for (const id of [currentEdgeId.value, draft.value?.edge?.id, focused.value?.edge]) if (id) edges.add(id)
  if (props.edgesSelectable) for (const id of props.selectedEdgeIds ?? []) edges.add(id)
  return cullGraphElements(bounds, view, { nodes, edges })
})
// Groups near the view, focused or holding a node of the current gesture. Group frames follow a drag, so this is
// kept apart from the node and edge culling above.
const visibleGroups = computed(() => {
  const view = cullView.value
  if (!view) return undefined
  const groups = new Set<string>()
  for (const group of shownGroups.value) {
    const near = group.x <= view.x + view.width && group.x + group.width >= view.x
      && group.y <= view.y + view.height && group.y + group.height >= view.y
    if (near || focused.value?.group === group.id || group.members.some(id => gestureIds.value.has(id) || dragPreview.value?.has(id))) groups.add(group.id)
  }
  return groups
})
const visibleNodes = computed(() => visible.value ? viewNodes.value.filter(node => visible.value!.nodes.has(node.id)) : undefined)
const shownEdges = computed(() => visible.value ? viewEdges.value.filter(edge => visible.value!.edges.has(edge.id)) : viewEdges.value)
const renderedGroups = computed(() => visibleGroups.value ? shownGroups.value.filter(group => visibleGroups.value!.has(group.id)) : shownGroups.value)
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


// The node or edge an element in the stage stands for. Connection handles carry their node ID but are not nodes.
function elementNode(element: Element) {
  return element.hasAttribute('data-vw-port') ? null : element.getAttribute('data-vw-node')
}
// A pointer owns a gesture. `isPrimary` is per pointer type, so a mouse and a pen (or touch) can both be primary;
// every pointer gesture start checks this so a second pointer cannot start or overwrite a gesture.
function pointerGestureActive() {
  return Boolean(nodeDrag || connectionDrag || handleDrag || pinch || pan)
}
function gestureInFlight() {
  return pointerGestureActive() || Boolean(draft.value)
}
// The stage itself or one of its own nodes, edges, group labels and handles. Keys pressed in focusable slot content,
// such as an input in a custom node, keep their usual meaning.
function stageControl(element: EventTarget | null): element is Element {
  return element instanceof Element && (element === svg.value || element.matches('[data-vw-node],[data-vw-edge],[data-vw-group]'))
}
function editable(element: EventTarget | null) {
  return element instanceof Element && element.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])') !== null
}

// Delete proposals. A focused node or edge outside the selection is deleted alone; otherwise the selection is.
function deletionFor(element: Element): GraphDeletion | undefined {
  const nodeId = elementNode(element), edgeId = element.getAttribute('data-vw-edge')
  let nodeIds: string[], edgeIds: string[]
  if (nodeId !== null && !isSelected(nodeId)) [nodeIds, edgeIds] = [[nodeId], []]
  else if (edgeId !== null && !(props.edgesSelectable && edgeSelected(edgeId))) [nodeIds, edgeIds] = [[], [edgeId]]
  else {
    nodeIds = props.selectedIds ? [...props.selectedIds] : props.selectedId === undefined ? [] : [props.selectedId]
    edgeIds = selectedEdgeList()
  }
  // A proxy stands for its members and a re-attached edge for the edges merged into it.
  const view = collapsedView.value
  if (view) {
    nodeIds = nodeIds.flatMap(id => view.proxies.get(id)?.nodeIds ?? [id])
    edgeIds = edgeIds.flatMap(id => view.mergedEdges.get(id) ?? [id])
  }
  nodeIds = nodeIds.filter(id => realNodesById.value.has(id) && realNodesById.value.get(id)!.deletable !== false)
  edgeIds = edgeIds.filter(id => realEdgesById.value.has(id))
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
  const owner = element?.closest('[data-vw-node],[data-vw-edge],[data-vw-group]')
  if (!owner || !svg.value?.contains(owner)) return { kind: 'canvas' }
  const node = owner.getAttribute('data-vw-node')
  if (node !== null) return { kind: 'node', id: node }
  const edge = owner.getAttribute('data-vw-edge')
  if (edge !== null) return { kind: 'edge', id: edge }
  return { kind: 'group', id: owner.getAttribute('data-vw-group')! }
}
function requestContextMenu(target: GraphContextMenuTarget, clientX: number, clientY: number, source: GraphContextMenu['source']) {
  cancelInteraction()
  hideTooltip()
  emit('context-menu', { target, point: worldPoint(clientX, clientY), clientX, clientY, source })
}
function openContextMenu(event: MouseEvent) {
  // A menu opened mid-gesture (macOS Control-click) can swallow pointerup, so the gesture ends here without a proposal.
  const dragging = Boolean(dragPreview.value || connectionPoint.value || boxPreview.value || pinch)
  if (nodeDrag || connectionDrag || handleDrag || pinch || pan) cancelInteraction()
  if (!props.contextMenu || editable(event.target)) return
  event.preventDefault()
  // The browser may follow a handled ContextMenu key or Shift+F10 with its own event; it was already reported.
  if (event.button !== 2 && event.timeStamp - keyboardMenuAt < 1000) return
  if (dragging) return
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
  else if (props.clipboard && (event.ctrlKey || event.metaKey)) clipboardWithKeys(event)
}

// Coordinates. The chart point under a viewport position, and the chart point at the centre of the stage.
function toGraphPoint(clientX: number, clientY: number): GraphPoint {
  if (!mounted.value || !svg.value) throw new Error('NetworkGraph is not mounted')
  if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) throw new RangeError('toGraphPoint requires finite client coordinates')
  if (svg.value.getScreenCTM()) return worldPoint(clientX, clientY)
  const rect = svg.value.getBoundingClientRect(), { x, y, scale } = camera.value
  return { x: (clientX - rect.left - x) / scale, y: (clientY - rect.top - y) / scale }
}
function getViewportCenter(): GraphPoint {
  const { x, y, scale } = camera.value
  return { x: (viewport.value.width / 2 - x) / scale, y: (viewport.value.height / 2 - y) / scale }
}
function snapPoint(point: GraphPoint) {
  return props.snapGrid === undefined ? point : snapGraphPoint(point, props.snapGrid)
}

// External drops. Only a droppable graph accepts an HTML drag, so other drags keep the browser's default handling.
function acceptDrag(event: DragEvent) {
  if (props.droppable) event.preventDefault()
}
function dropOnStage(event: DragEvent) {
  if (!props.droppable) return
  event.preventDefault()
  const { clientX, clientY, dataTransfer } = event
  emit('node-drop', { point: snapPoint(toGraphPoint(clientX, clientY)), clientX, clientY, dataTransfer })
}

// Clipboard proposals. The application copies, pastes and duplicates its own data; the graph only reports the keys.
let hoverPointer: GraphPoint | undefined
function trackPointer(event: PointerEvent) {
  hoverPointer = { x: event.clientX, y: event.clientY }
}
function forgetPointer() {
  hoverPointer = undefined
}
function clipboardSelection(element: Element): GraphClipboardSelection | undefined {
  const nodeId = elementNode(element), edgeId = element.getAttribute('data-vw-edge')
  let nodes: Set<string>, edges: Set<string>
  // Like deletion, a focused node or edge outside the selection stands alone.
  if (nodeId !== null && !isSelected(nodeId)) [nodes, edges] = [new Set([nodeId]), new Set()]
  else if (edgeId !== null && !(props.edgesSelectable && edgeSelected(edgeId))) [nodes, edges] = [new Set(), new Set([edgeId])]
  else {
    nodes = new Set(props.selectedIds ?? (props.selectedId === undefined ? [] : [props.selectedId]))
    edges = new Set(selectedEdgeList())
  }
  // Nodes hidden in a collapsed group and proxies are not copied.
  const nodeIds = props.nodes.filter(node => nodes.has(node.id) && savedLayout.value.boxes.has(node.id)).map(node => node.id)
  const copied = new Set(nodeIds)
  const merged = collapsedView.value?.mergedEdges
  const edgeIds = props.edges.filter(edge => (edges.has(edge.id) && !merged?.has(edge.id)) || (copied.has(edge.from) && copied.has(edge.to))).map(edge => edge.id)
  if (!nodeIds.length && !edgeIds.length) return undefined
  const positions = new Map(nodeIds.map(id => {
    const box = savedLayout.value.boxes.get(id)!
    return [id, { x: box.x, y: box.y }]
  }))
  return { nodeIds, edgeIds, positions }
}
// The pointer position while it is over the stage, otherwise the centre of the viewport.
function pastePoint() {
  const rect = svg.value?.getBoundingClientRect(), pointer = hoverPointer
  const over = rect && pointer && pointer.x >= rect.left && pointer.x <= rect.right && pointer.y >= rect.top && pointer.y <= rect.bottom
  return snapPoint(over ? toGraphPoint(pointer.x, pointer.y) : getViewportCenter())
}
function clipboardWithKeys(event: KeyboardEvent) {
  if (event.altKey || event.shiftKey || event.repeat || gestureInFlight() || !stageControl(event.target)) return
  // Letters follow the layout; other layouts (for example Cyrillic) fall back to the physical key.
  const key = /^[a-z]$/i.test(event.key) ? event.key.toLowerCase() : ({ KeyC: 'c', KeyV: 'v', KeyD: 'd' } as Record<string, string>)[event.code]
  if (key === 'v') {
    event.preventDefault()
    emit('paste-request', { point: pastePoint() })
    return
  }
  if (key !== 'c' && key !== 'd') return
  const selection = clipboardSelection(event.target)
  if (!selection) return
  event.preventDefault()
  if (key === 'c') emit('copy-selection', selection)
  else emit('duplicate-selection', selection)
}

// Background pattern, drawn in chart coordinates inside the camera transform so it follows pan and zoom. At small
// scales only every second, fourth (and so on) grid line is drawn, so cells stay at least 8 screen pixels apart.
const editingOptions = computed(() => {
  const grid = props.snapGrid
  if (grid !== undefined && (!Number.isFinite(grid) || grid <= 0)) throw new RangeError('snapGrid must be a positive finite number of chart units')
  const gap = props.backgroundGap ?? grid ?? 20
  if (!Number.isFinite(gap) || gap <= 0) throw new RangeError('backgroundGap must be a positive finite number of chart units')
  const threshold = props.guideThreshold
  if (!Number.isFinite(threshold) || threshold < 0) throw new RangeError('guideThreshold must be a nonnegative finite number of screen pixels')
  if (!['none', 'dots', 'lines'].includes(props.background)) throw new Error('Unknown NetworkGraph background: ' + props.background)
  if (!['curve', 'orthogonal', 'straight'].includes(props.edgeStyle)) throw new RangeError('Unknown edge style: ' + props.edgeStyle)
  const lod = props.lodThreshold
  if (lod !== undefined && (!Number.isFinite(lod) || lod <= 0 || lod > 3)) throw new RangeError('lodThreshold must be a finite scale greater than 0 and at most 3')
  if (props.resizable) void minimumSize.value
  return { gap }
})
const patternId = marker + '-background'
const pattern = computed(() => {
  if (props.background === 'none') return undefined
  const { scale } = camera.value
  let cell = editingOptions.value.gap
  while (cell * scale < 8) cell *= 2
  // The rectangle covers the viewport plus one cell on every side.
  const view = graphViewportRect(camera.value, viewport.value)
  const area = { x: view.x - cell, y: view.y - cell, width: view.width + 2 * cell, height: view.height + 2 * cell }
  return { cell, dot: 1 / scale, area }
})
type GroupLayer = { key: string; group?: (typeof renderedGroups.value)[number] }
const layers = computed(() => {
  const groups = renderedGroups.value.map<GroupLayer>(group => ({ key: 'group:' + group.id, group }))
  return pattern.value ? [{ key: 'background' }, ...groups] : groups
})

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
  dragPreview.value || connectionPoint.value || boxPreview.value || isPanning.value || pinching.value || draft.value
    || resizePreview.value || reshapePreview.value,
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
  const node = elementNode(event.target), edge = event.target.getAttribute('data-vw-edge')
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
  let target: NetworkTooltipSlot<ShownNode, ShownEdge>['target'], left: number, right: number, top: number, bottom: number
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
// The element the shown tooltip describes (its `aria-describedby`). Unlike tooltipView, it does not change while the
// camera moves.
const described = computed(() => tooltipView.value && tooltip.value ? tooltip.value : undefined)

// Nodes and edges are components of their own, so a drag or a pan re-renders only those whose props changed. The
// lists render the same markup the template rendered inline. Handlers are shared and stable, so they never count as
// a change. A slot is passed both as the slot and as a prop: a new slot function re-renders every item.
const nodeActions = {
  hoverTooltip,
  leaveTooltip,
  startDrag: (event: PointerEvent, id: string) => startNodeDrag(event, movingIds(id), id),
  click: clickNode,
  moveWithKeys: (event: KeyboardEvent, id: string) => moveWithKeys(event, movingIds(id), id),
  select,
}
const edgeActions = { hoverTooltip, leaveTooltip, select: selectEdge }

// Item geometry. Each node and edge component reads its box or path from a shallow ref of its own, so a drag preview
// updates the moved nodes and their edges without rendering the lists again. The refs follow `layout`: between a
// layout and a preview of it only the refs of the changed nodes and edges are compared; any other change compares
// every ref. A ref is only replaced when the value differs, so equal boxes from a recomputed layout render nothing.
type EdgeGeometry = { path: string; labelX?: number; labelY?: number }
const boxRefs = new Map<string, ShallowRef<GraphBox>>()
const edgeRefs = new Map<string, ShallowRef<EdgeGeometry>>()
function edgeGeometry(geometry: GraphLayout, id: string): EdgeGeometry | undefined {
  const path = geometry.paths.get(id), label = geometry.edgeLabels.get(id)
  return path === undefined ? undefined : { path, labelX: label?.x, labelY: label?.y }
}
function syncBox(id: string, geometry: GraphLayout) {
  const box = geometry.boxes.get(id), entry = boxRefs.get(id)
  if (!box) boxRefs.delete(id)
  else if (!entry) boxRefs.set(id, shallowRef(box))
  else if (entry.value !== box && !sameRecord(entry.value, box)) entry.value = box
}
function syncEdge(id: string, geometry: GraphLayout) {
  const next = edgeGeometry(geometry, id), entry = edgeRefs.get(id)
  if (!next) edgeRefs.delete(id)
  else if (!entry) edgeRefs.set(id, shallowRef(next))
  else if (!sameRecord(entry.value, next)) entry.value = next
}
watch(layout, (next, previous) => {
  const before = previewSources.get(previous), after = previewSources.get(next)
  if ((before?.saved ?? previous) !== (after?.saved ?? next)) {
    for (const id of [...boxRefs.keys()]) syncBox(id, next)
    for (const id of [...edgeRefs.keys()]) syncEdge(id, next)
    return
  }
  for (const source of [before, after]) {
    for (const id of source?.nodes ?? []) syncBox(id, next)
    for (const id of source?.edges ?? []) syncEdge(id, next)
  }
})
// Refs are created on first use. Without a ref, a node or edge is not part of the current preview (the watcher above
// creates the refs of changed items), so the saved layout gives its value.
function boxRef(id: string) {
  let entry = boxRefs.get(id)
  if (!entry) boxRefs.set(id, entry = shallowRef(savedRouted.value.boxes.get(id)!))
  return entry
}
function edgeRef(id: string) {
  let entry = edgeRefs.get(id)
  if (!entry) edgeRefs.set(id, entry = shallowRef(edgeGeometry(savedRouted.value, id)!))
  return entry
}
// Slots are not reactive, so the template passes them in: a slot that appears, disappears or is replaced (an inline
// render function) re-renders the list, and a compiled slot keeps its identity.
type ListProps<S> = { itemSlot?: S; tooltips: boolean }
// The previous object while every value is the same, so the shared prop of the items keeps its identity.
function keep<T extends object>(previous: T | undefined, next: T) {
  return previous && sameRecord(previous, next) ? previous : next
}
let nodeShared: { title: boolean; rtl: boolean; scale: number; slot?: unknown; actions: typeof nodeActions } | undefined
let edgeShared: { menu: boolean; hit: boolean; name: string | undefined; marker: string; scale: number; slot?: unknown; actions: typeof edgeActions } | undefined
const NodeList: FunctionalComponent<ListProps<typeof slots.node>> = ({ itemSlot: nodeSlot, tooltips: tooltipSlot }) => {
  const shown = tooltipSlot ? described.value : undefined
  const shared = nodeShared = keep(nodeShared, {
    title: !tooltipSlot, rtl: rtl.value, scale: nodeSlot ? camera.value.scale : 0, slot: nodeSlot, actions: nodeActions,
  })
  const draggable = props.draggable, related = props.relatedIds
  const selected = selectionTest(), dimmed = dimTest()
  return (visibleNodes.value ?? viewNodes.value).map(node => h(NetworkGraphNode, {
    key: node.id, node, box: boxRef(node.id), selected: selected(node.id), draggable: draggable && node.draggable !== false,
    related: Boolean(related?.has(node.id)), dimmed: dimmed(node.id),
    describedby: shown?.kind === 'node' && shown.id === node.id ? tooltipId : undefined, shared,
  }, nodeSlot ? { node: nodeSlot, $stable: true } : undefined))
}
const EdgeList: FunctionalComponent<ListProps<typeof slots.edge>> = ({ itemSlot: edgeSlot, tooltips: tooltipSlot }) => {
  const shown = tooltipSlot ? described.value : undefined
  const hit = Boolean(props.reconnectable || props.edgesSelectable || props.editableEdges)
  const shared = edgeShared = keep(edgeShared, {
    menu: props.contextMenu, hit, name: messages.value.selectEdge, marker, scale: edgeSlot ? camera.value.scale : 0,
    slot: edgeSlot, actions: edgeActions,
  })
  const selectable = props.edgesSelectable, active = currentEdgeId.value, related = props.relatedIds
  const dimmed = dimTest(), selected = edgeSelectionTest(), pressed = edgePressedTest()
  return shownEdges.value.map(edge => h(NetworkGraphEdge, {
    key: edge.id, edge, geometry: edgeRef(edge.id),
    related: Boolean(related?.has(edge.from) && related.has(edge.to)), dimmed: dimmed(edge.from) || dimmed(edge.to),
    selected: Boolean(selectable && selected(edge.id)), active: hit && active === edge.id, pressed: hit && pressed(edge.id),
    describedby: shown?.kind === 'edge' && shown.id === edge.id ? tooltipId : undefined, shared,
  }, edgeSlot ? { edge: edgeSlot, $stable: true } : undefined))
}

NodeList.props = EdgeList.props = ['itemSlot', 'tooltips']

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
function exportSvg(options: GraphExportOptions<ShownNode, ShownEdge> = {}) {
  const { includeSelection = true, theme, ...rest } = options
  const selection = !includeSelection ? [] : props.selectedIds ?? (props.selectedId === undefined ? [] : [props.selectedId])
  return renderGraphSvg(layout.value, viewNodes.value, viewEdges.value, {
    idPrefix: 'vw-export-' + marker.replace(/[^\w-]/g, ''),
    ...rest,
    groups: shownGroups.value.map(({ id, label, x, y, width, height }) => ({ id, label, x, y, width, height })),
    selectedIds: selection,
    direction: rtl.value ? 'rtl' : 'ltr',
    theme: root.value ? readExportTheme(root.value, theme) : theme,
    fontFamily: root.value ? exportFont(root.value) : undefined,
  })
}
/** Rasterize `exportSvg(options)` to a PNG blob in the browser. */
async function exportPng(options: GraphPngExportOptions<ShownNode, ShownEdge> = {}) {
  const { scale = 1, ...rest } = options
  return rasterizeSvg(exportSvg(rest), scale)
}
defineExpose({
  fit, zoom, getViewport: () => ({ ...camera.value }), setViewport, focusNode, exportSvg, exportPng, toGraphPoint, getViewportCenter,
})

watch(savedRouted, cancelInteraction)
watch(() => [props.draggable, props.connectable, props.reconnectable, props.boxSelect, groupMembership.value, props.editableEdges, props.resizable], cancelInteraction)
// A structural change (connect, delete, paste, collapse) keeps a camera the user or the API placed. The view re-fits
// while the camera is still fitted automatically, when the layout function or options change, and when the graph is
// replaced: it was or becomes empty, or none of its previous nodes remain.
watch([baseLayout, () => props.layout, options, () => props.nodes], ([, layoutFn, layoutOptions, nodes], [, previousFn, previousOptions, previousNodes]) => {
  if (activeEdgeId.value && !edgesById.value.has(activeEdgeId.value)) activeEdgeId.value = undefined
  const remaining = new Set(nodes.map(node => node.id))
  const replaced = layoutFn !== previousFn || layoutOptions !== previousOptions || !previousNodes.some(node => remaining.has(node.id))
  if (fitMode.value !== 'manual' || replaced) {
    fitMode.value = 'auto'
    camera.value = fitCamera()
    return
  }
  // A smaller graph can raise the lower zoom limit; keep the kept camera restorable by clamping around the centre.
  const current = camera.value
  const scale = clampScale(current.scale)
  if (scale === current.scale) return
  const { width, height } = viewport.value, ratio = scale / current.scale
  camera.value = { x: width / 2 - (width / 2 - current.x) * ratio, y: height / 2 - (height / 2 - current.y) * ratio, scale }
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
  directionObserver?.disconnect()
  directionObserver = undefined
  hideTooltip()
  document.removeEventListener('keydown', dismissTooltip)
})
</script>

<template>
  <div ref="root" class="vw-network" :class="{ 'vw-rtl': rtl, 'vw-network-patterned': pattern, 'vw-lod-low': lodLow }" :dir="dir === 'rtl' ? 'rtl' : undefined">
    <svg
      ref="svg" class="vw-network-stage" :style="{ height: typeof height === 'number' ? height + 'px' : height }" :class="{ 'vw-is-panning': isPanning }"
      :aria-label="messages.region" tabindex="0"
      @keydown.self="panWithKeys" @keydown.esc="cancelInteraction(); hideTooltip()" @keydown="onStageKeydown" @contextmenu="openContextMenu"
      @focusin="trackFocus($event); focusTooltip($event)" @focusout="releaseFocus($event); blurTooltip()"
      @wheel="onWheel" @pointerdown.capture="pressStage($event); trackPointer($event)" @pointerdown="startPan"
      @pointermove="trackPointer($event); moveTouch($event); movePan($event); moveNode($event); moveConnection($event); moveHandle($event)"
      @pointerleave="forgetPointer"
      @pointerup="endTouch($event); stopPan($event); finishNodeDrag($event); finishConnection($event); finishHandle($event)"
      @pointercancel="endTouch($event); stopPan($event); finishNodeDrag($event); finishConnection($event); finishHandle($event)"
      @lostpointercapture="stopPan($event); finishNodeDrag($event); finishConnection($event); finishHandle($event)"
      @dragenter="acceptDrag" @dragover="acceptDrag" @drop="dropOnStage"
    >
      <defs>
        <marker :id="marker" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
          <path d="M 0 0 L 7 3.5 L 0 7 z" fill="context-stroke" />
        </marker>
      </defs>
      <g :transform="`translate(${camera.x} ${camera.y}) scale(${camera.scale})`">
        <!-- The optional background is the first item of the group list and each group element takes the first branch
          of its conditional, so the markup without a background is unchanged. -->
        <g v-for="layer in layers" :key="layer.key" :class="layer.group ? 'vw-network-group' : 'vw-network-backdrop'"
          :aria-hidden="layer.group ? undefined : 'true'">
          <rect v-if="layer.group" :x="layer.group.x" :y="layer.group.y" :width="layer.group.width" :height="layer.group.height" rx="10" />
          <pattern v-else-if="pattern" :id="patternId" patternUnits="userSpaceOnUse" :x="-pattern.cell / 2" :y="-pattern.cell / 2"
            :width="pattern.cell" :height="pattern.cell">
            <circle v-if="background === 'dots'" class="vw-network-pattern" :cx="pattern.cell / 2" :cy="pattern.cell / 2" :r="pattern.dot" />
            <path v-else class="vw-network-pattern" :stroke-width="pattern.dot"
              :d="`M ${pattern.cell / 2} 0 V ${pattern.cell} M 0 ${pattern.cell / 2} H ${pattern.cell}`" />
          </pattern>
          <text v-if="layer.group" :x="rtl ? layer.group.x + layer.group.width - 8 : layer.group.x + 8" :y="layer.group.y + 15" :role="draggable ? 'button' : undefined" :data-vw-group="layer.group.id"
            :tabindex="draggable ? 0 : undefined" :aria-label="draggable ? groupName(layer.group) : undefined"
            @pointerdown.stop="startNodeDrag($event, layer.group!.members)" @keydown="moveWithKeys($event, layer.group!.members)">{{ layer.group.label }}</text>
          <rect v-else-if="pattern" class="vw-network-background" v-bind="pattern.area" :fill="`url(#${patternId})`" />
        </g>
        <EdgeList :item-slot="$slots.edge" :tooltips="Boolean($slots.tooltip)" />
        <NodeList :item-slot="$slots.node" :tooltips="Boolean($slots.tooltip)" />
        <path v-if="connectionPath && !overlay" class="vw-connection-preview" :d="connectionPath" />
        <!-- Guides only appear during a node drag, never with a connection preview, so they share its conditional. -->
        <g v-else-if="guideLines?.length && !overlay" class="vw-guides" aria-hidden="true">
          <line v-for="guide in guideLines" :key="guide.axis + guide.position" class="vw-guide"
            :x1="guide.axis === 'x' ? guide.position : guide.from" :x2="guide.axis === 'x' ? guide.position : guide.to"
            :y1="guide.axis === 'y' ? guide.position : guide.from" :y2="guide.axis === 'y' ? guide.position : guide.to" />
        </g>
        <!-- With collapsible groups, editable edges or resizable nodes, one overlay holds the previews and the handles,
          so the markup without those inputs is unchanged. -->
        <g v-else-if="overlay" class="vw-network-overlay">
          <path v-if="connectionPath" class="vw-connection-preview" :d="connectionPath" />
          <g v-if="guideLines?.length" class="vw-guides" aria-hidden="true">
            <line v-for="guide in guideLines" :key="guide.axis + guide.position" class="vw-guide"
              :x1="guide.axis === 'x' ? guide.position : guide.from" :x2="guide.axis === 'x' ? guide.position : guide.to"
              :y1="guide.axis === 'y' ? guide.position : guide.from" :y2="guide.axis === 'y' ? guide.position : guide.to" />
          </g>
          <g v-for="toggle in groupToggles" :key="'toggle:' + toggle.id" class="vw-group-toggle" :class="{ 'vw-is-collapsed': !toggle.expanded }"
            :transform="`translate(${toggle.x} ${toggle.y})`" role="button" tabindex="0" :aria-label="toggle.label"
            :aria-expanded="toggle.expanded" :data-vw-toggle="toggle.id"
            @pointerdown.stop @click.stop="toggleGroup(toggle)" @keydown.enter.stop.prevent="toggleGroup(toggle)" @keydown.space.stop.prevent="toggleGroup(toggle)">
            <rect width="14" height="14" rx="3" />
            <path :d="toggle.expanded ? 'M 4 7 H 10' : 'M 4 7 H 10 M 7 4 V 10'" />
          </g>
          <circle v-for="handle in waypointHandles" :key="handle.key" :class="handle.kind === 'add' ? 'vw-waypoint-add' : 'vw-waypoint-handle'"
            :cx="handle.x" :cy="handle.y" :r="handle.kind === 'add' ? 4.5 : 6" role="button" tabindex="0" :aria-label="handle.label"
            @pointerdown.stop="startWaypointDrag($event, handle)" @keydown="waypointKeys($event, handle)" />
          <rect v-for="handle in resizeHandles" :key="'resize:' + handle.corner" class="vw-resize-handle" :class="'vw-resize-' + handle.corner"
            :x="handle.x - 5" :y="handle.y - 5" width="10" height="10" rx="2" role="button" tabindex="0" :aria-label="handle.label"
            @pointerdown.stop="startResizeDrag($event, handle.node, handle.corner)" @keydown="resizeKeys($event, handle.node, handle.corner)" />
        </g>
        <rect v-if="boxPreview" class="vw-box-selection" v-bind="boxPreview" />
        <template v-if="connectable || draft?.edge">
          <circle v-for="handle in renderedHandles" :key="portKey(handle)" v-memo="[handle, draft, draft && portPressed(handle), messages]" class="vw-connect-handle" :data-vw-node="handle.node"
            :class="{ 'vw-is-active': portPressed(handle) }" :data-vw-port="portKey(handle)"
            :cx="handle.x" :cy="handle.y" r="6" role="button" tabindex="0"
            :aria-label="`${draft && !portPressed(handle) ? messages.connectTo : messages.connectFrom} ${handle.label}`"
            :aria-pressed="Boolean(portPressed(handle))"
            @pointerdown.stop="connectable && startPort($event, handle)"
            @click.stop="(connectable || draft) && activatePort(handle, $event)"
            @keydown.enter.stop.prevent="(connectable || draft) && activatePort(handle, $event)"
            @keydown.space.stop.prevent="(connectable || draft) && activatePort(handle, $event)" />
        </template>
        <circle v-for="item in reconnectHandles" :key="item.end" class="vw-reconnect-handle"
          :cx="item.x" :cy="item.y" r="6" role="button" tabindex="0" :aria-label="item.label"
          @pointerdown.stop="reconnectEdge(item.edge, item.end, $event)"
          @keydown.enter.stop.prevent="reconnectEdge(item.edge, item.end)"
          @keydown.space.stop.prevent="reconnectEdge(item.edge, item.end)" />
      </g>
    </svg>
    <!-- The tooltip shares the empty state's conditional (an empty graph has nothing to describe), so the markup
      without a tooltip is unchanged. -->
    <div v-if="tooltipDelayValid && editingOptions && !nodes.length" class="vw-network-empty"><slot name="empty">{{ messages.empty }}</slot></div>
    <div v-else-if="$slots.tooltip && tooltipView" :id="tooltipId" role="tooltip" class="vw-network-tooltip"
      :style="tooltipView.style" @pointerenter="keepTooltip" @pointerleave="leaveTooltip">
      <slot name="tooltip" :target="tooltipView.target" />
    </div>
    <button v-if="showMinimap && nodes.length" type="button" class="vw-minimap" :aria-label="messages.minimap"
      @click="navigateMinimap" @keydown="panWithKeys">
      <svg :viewBox="`${contentBounds.left} ${contentBounds.top} ${contentBounds.width} ${contentBounds.height}`" aria-hidden="true">
        <rect v-for="node in viewNodes" :key="node.id" v-memo="[boxRef(node.id).value, selectedTest(node.id)]" :class="{ 'vw-is-selected': selectedTest(node.id) }"
          :x="boxRef(node.id).value.x" :y="boxRef(node.id).value.y" :width="boxRef(node.id).value.width" :height="boxRef(node.id).value.height" rx="3" />
        <rect class="vw-minimap-window" :x="-camera.x / camera.scale" :y="-camera.y / camera.scale"
          :width="viewport.width / camera.scale" :height="viewport.height / camera.scale" />
      </svg>
    </button>
    <span class="vw-sr-only" aria-live="polite">{{ notice }}</span>
    <div v-if="showControls !== false" class="vw-zoom-tools" role="group" :aria-label="messages.zoom">
      <button type="button" :aria-label="messages.zoomOut" @click="zoom(1 / 1.25)">−</button>
      <output>{{ Math.round(camera.scale * 100) }}%</output>
      <button type="button" :aria-label="messages.zoomIn" @click="zoom(1.25)">＋</button>
      <button type="button" class="vw-fit-button" @click="fit()">{{ messages.fit }}</button>
    </div>
  </div>
</template>
