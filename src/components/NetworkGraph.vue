<script setup lang="ts" generic="N extends NetworkNode = NetworkNode, E extends GraphEdge = GraphEdge, G extends NetworkGroup = never">
import { computed, h, nextTick, onBeforeUnmount, onMounted, onUnmounted, ref, shallowRef, toRaw, useId, watch, withKeys, withModifiers, type FunctionalComponent, type ShallowRef, type VNode, createCommentVNode, renderSlot, toDisplayString } from 'vue'
import { graphPortControls } from '../core/graphCurve.js'
import type { GraphBox } from '../core/graph.js'
import type { NetworkNode, GraphLabels, GraphLayoutFunction, GraphViewport, NetworkFocusOptions, NetworkGroup, NetworkNodeSlot, NetworkEdgeSlot } from '../core/types.js'
import type { GraphContextMenu, GraphContextMenuTarget, GraphFitOptions, GraphGesture, GraphGestureEnd, GraphGestureKind, NetworkTooltipSlot } from '../core/types.js'
import type { GraphClipboardSelection, GraphPaste } from '../core/types.js'
import type {
  GraphLabelEdit, GraphSelectionMode, NetworkEdgeToolbarSlot, NetworkGroupSlot, NetworkMinimapNodeSlot, NetworkNodeToolbarSlot,
} from '../core/types.js'
import { graphNodesInPolygon } from '../core/graphLasso.js'
import { applyGraphPositions, applyGraphSizes, graphEdgeEndpoint, indexGraph, layoutLayeredGraph, routeGraphPorts, type GraphEdge, type GraphLayeredLayoutOptions, type GraphPoint, type GraphNodeMove, type GraphConnection, type GraphPort, type GraphReconnect, type GraphLayout, type GraphNodeSize } from '../core/graph.js'
import type { GraphEdgeReshape, GraphNodeResize } from '../core/types.js'
import { collapseGraphGroups, type GraphShownEdge, type GraphShownNode } from '../core/graphCollapse.js'
import { graphParallelSlots, routeGraphEdgesWithSlots, type GraphEdgeStyle } from '../core/graphRouting.js'
import { resolveObstacleAvoidance, type GraphObstacleAvoidance } from '../core/graphObstacleRouting.js'
import { placeGraphEdgeLabels, type GraphEdgeLabelPlacement } from '../core/graphLabelPlacement.js'
import { graphPolygonPoints } from '../core/graphShapes.js'
import { isGraphRouteValid, type GraphRoutingPolicy } from '../core/graphGeometry.js'
import { completeGraphLayout } from '../core/graphLayoutRequests.js'
import { resolveCollapsedTargets } from '../core/graphTraversal.js'
import type { GraphViewTarget, RevealOptions, RevealResult, ViewTarget, ViewTargetEvent, ViewTargetSource } from '../core/viewBindings.js'
import {
  cullGraphElements, graphCameraAt, graphLayoutBounds, graphPathBounds, graphPathEndpoints, graphRectsIntersect, graphViewportRect, type GraphRect,
} from '../core/graphView.js'
import { graphDeletion, type GraphDeletion } from '../core/graphEditing.js'
import { createGraphConnectionChecker, type GraphPortRules } from '../core/graphPortRules.js'
import { graphAlignmentGuides, snapGraphPoint, type GraphAlignmentGuide } from '../core/graphSnapping.js'
import type { GraphDrop } from './types.js'
import type { ChartDirection, GraphExportOptions, GraphPngExportOptions } from '../core/types.js'
import { renderGraphSvg } from '../core/exportSvg.js'
import { assertGraphSwimlaneBands, assertGraphSwimlanePools, type GraphSwimlaneBand, type GraphSwimlanePoolBand } from '../core/graphSwimlanes.js'
import { assertGraphEdgeBands, graphBandOrder, graphReferenceDash, type GraphEdgeBand } from '../core/graphFlow.js'
import { exportFont, rasterizeSvg, readExportTheme } from './exportImage.js'
import { keep, keepIds, sameGeometry, sameRecord } from './networkGraph/equality.js'
import { placeBox, sortExtents, type Extent } from './networkGraph/previewGeometry.js'
import { hasPorts, previewLayout, type ParallelSlots, type PreviewContext } from './networkGraph/previewLayout.js'
import { indexAvoidedRoutes, obstructedEdges } from './networkGraph/obstructedEdges.js'
import { edgePathBounds, placePreviewLabels, resolveEdgeLabelPlacement, withBandWidths } from './networkGraph/labelPlacement.js'
import {
  addGroupChain, groupBounds, groupRect, groupShapes, groupTree as buildGroupTree, type GroupBounds, type GroupRect, type GroupShape,
} from './networkGraph/groupFrames.js'
import { connectHandle, connectionBetween, parsePortKey, portKey, type PortHandle, type PortRef } from './networkGraph/ports.js'
import {
  arrowOffsets, clampPoint, cornerSides, corners, movePositions, placeMoved, referencePoint, resizeBox, snapValue, stepValue,
  movedBounds, type Corner,
} from './networkGraph/editGeometry.js'
import { belowLabel, defaultNode, markerNode, markerUrl, usedMarkers } from './networkGraph/itemDrawing.js'
import { useNodeTooltip } from './networkGraph/useNodeTooltip.js'
import {
  autoPanStep, cameraCenter, clampScale as clampToScale, contentBounds as boundsOf, contentCameraAt, fitCamera as fittedCamera, paddedScale,
  panKeySteps, pinchCamera, rectsBounds, scaleError as scaleRangeError, validScale as inScaleRange, wholeScale as scaleToFit, zoomAround,
  type ContentBounds,
} from './networkGraph/camera.js'
import {
  edgeLabelEditorStyle, nodeLabelEditorStyle, stageEdges, stagePoint, toolbarPlacement, tooltipPlacement, type StageEdges,
} from './networkGraph/overlayPlacement.js'
import {
  chartDelta, grabPointer, ownsPointer, pointerSession, releaseSession, sessionPastThreshold, type PointerSession,
} from './networkGraph/pointerSession.js'
import { capturePointer, pastThreshold, releasePointer } from './shared/pointer.js'
import { rejectionReason, type ValidatorResult } from './shared/validation.js'

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
  /**
   * Port rules (type, direction, connection limit) checked before `validateConnection`; a broken rule rejects the
   * proposal with its reason through `connect-rejected`. While a connection is in progress, handles get
   * `vw-is-valid-target` or `vw-is-invalid-target`. Opt-in. Default: undefined.
   */
  connectionRules?: GraphPortRules
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
  /** Edge routing style: `curve`, `orthogonal` or `straight`. An edge's own `edgeStyle` overrides it. Default: `curve`. */
  edgeStyle?: GraphEdgeStyle
  /** Distance in chart units between parallel edges (between the same two nodes, in either direction, without waypoints or named ports); they are spread around the centre line, and self-loops of one node are nested. Positive and finite. Opt-in. */
  parallelEdgeSpacing?: number
  /** Gives edges a focusable hit area and shows waypoint handles on the selected edge, proposed through `edge-reshape`. Opt-in. Default: false. */
  editableEdges?: boolean
  /** Synchronous check of a waypoint change proposal. Return `true` or nothing to accept, `false` or a reason string to reject. */
  validateEdgeReshape?: (change: GraphEdgeReshape) => boolean | string | void
  /** Camera scale below which node detail text and edge labels are hidden; greater than 0 and at most 3. */
  lodThreshold?: number
  /** Leaves the content of the `node` slot unpainted: the stylesheet's fill and stroke rules for node rectangles and text apply to the default renderer only. Opt-in. Default: false. */
  unstyledNodeSlots?: boolean
  /** Node sizes as a map of node ID to width and height, applied over the layout boxes and keeping each top-left corner. Sizes must be finite and positive; unknown IDs are ignored. */
  sizes?: ReadonlyMap<string, GraphNodeSize>
  /** Shows corner resize handles on the single selected node, proposed through `node-resize`. Opt-in. Default: false. */
  resizable?: boolean
  /** Smallest width and height a resize may propose. Default: `{ width: 40, height: 24 }`. */
  minNodeSize?: GraphNodeSize
  /** Synchronous check of a node resize proposal. Return `true` or nothing to accept, `false` or a reason string to reject. */
  validateNodeResize?: (change: GraphNodeResize) => boolean | string | void
  /** IDs of nodes drawn in the highlighted style (`vw-is-highlighted`). Display only: never selected, deleted or moved. A node hidden in a collapsed group highlights its proxy. */
  highlightedNodeIds?: ReadonlySet<string>
  /** IDs of edges drawn in the highlighted style. Display only. A merged edge of a collapsed group is highlighted when one of its original edges is. */
  highlightedEdgeIds?: ReadonlySet<string>
  /** `builtin` redraws every edge with a named port and, in the orthogonal and straight styles, every edge. `preserve` keeps the paths of the layout while they still fit their nodes and ports. Default: `builtin`. */
  routingPolicy?: GraphRoutingPolicy
  /** Routes orthogonal edges without waypoints around the node boxes: `true` for an 8-unit clearance, or `{ clearance, bendPenalty }`. Opt-in. Default: false. */
  avoidNodes?: boolean | GraphObstacleAvoidance
  /**
   * Where edge labels go: `midpoint` keeps them just above the middle of each route; `avoid` moves them along and beside
   * their routes away from nodes, other labels and other edges (see `placeGraphEdgeLabels`), and an options object
   * does so with those options, such as `fontSize` or measured `labelSize`. Opt-in. Default: `midpoint`.
   */
  edgeLabelPlacement?: GraphEdgeLabelPlacement<GraphShownEdge<E, G>>
  /** Lets a double-click or F2 on a node or edge open an in-place editor for its label, proposed through `label-edit`. Gives edges their focusable hit area. Opt-in. Default: false. */
  editableLabels?: boolean
  /** Synchronous check of a label proposal. Return `true` or nothing to accept, `false` or a reason string to reject. */
  validateLabelEdit?: (change: GraphLabelEdit) => boolean | string | void
  /** Shape of the `boxSelect` drag: `box` (a rectangle) or `lasso` (a free-form outline that selects the nodes whose centre it encloses). Default: `box`. */
  selectionMode?: GraphSelectionMode
  /**
   * Swimlane bands drawn behind the groups, edges and nodes, each with its title in its header area and the title as
   * its accessible name; usually the `lanes` of a `layoutSwimlaneGraph` result. Display only: the component never
   * changes a node's lane (see `graphSwimlaneAt`). Opt-in. Default: undefined.
   */
  lanes?: readonly GraphSwimlaneBand[]
  /**
   * Pools (BPMN participants) drawn behind the lanes, each a group named by its label with a title band whose title is
   * rotated when the band is taller than it is wide; usually the `pools` of a `layoutSwimlaneGraph` result. The `lanes`
   * a pool lists by ID are drawn inside its group. Display only. Opt-in. Default: undefined.
   */
  pools?: readonly GraphSwimlanePoolBand[]
  /**
   * Edges drawn as bands with real width, by edge ID, usually `graphFlowBands` of a `layoutFlowGraph` result: the
   * default edge path is stroked with the band width (class `vw-network-band`, dashed with `vw-is-reference`) without
   * markers, its hit area is at least as wide, and the band label names it. Bands are drawn widest first, before the
   * other edges. Widths must be finite and at least 0; unknown IDs are ignored. Opt-in. Default: undefined.
   */
  edgeBands?: ReadonlyMap<string, GraphEdgeBand>
}>(),{ showControls: true, cullOverscan: 200, dir: 'ltr', tooltipDelay: 400, background: 'none', guideThreshold: 6, edgeStyle: 'curve' })
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
  /** A node, edge or group was entered by the pointer or received keyboard focus; carries the target and the source. */
  'target-enter': [event: ViewTargetEvent<GraphViewTarget>]
  /** The pointer left a target, or keyboard focus left the target it entered; carries the target and the source. */
  'target-leave': [event: ViewTargetEvent<GraphViewTarget>]
  /** A node, edge or group was activated by click, Enter or Space; carries the target and the source. */
  'target-activate': [event: ViewTargetEvent<GraphViewTarget>]
  /** A gesture that a new layout would cancel started (drag, resize, reshape, connection, box selection, pan, pinch); carries its kind and source. */
  'gesture-start': [gesture: GraphGesture]
  /** The gesture ended, exactly once per `gesture-start`, after any proposal; carries its kind, source and whether it was committed or cancelled. */
  'gesture-end': [gesture: GraphGestureEnd]
  /** Proposal to change a node or edge label; carries `kind`, `id`, `before` and `after`. The parent sets the label. Only with `editableLabels`. */
  'label-edit': [change: GraphLabelEdit]
  /** A label proposal was rejected by `validateLabelEdit`; carries the proposal and the reason. */
  'label-edit-rejected': [change: GraphLabelEdit, reason: string]
}>()
const slots = defineSlots<{
  node(props: NetworkNodeSlot<ShownNode>): unknown
  edge(props: NetworkEdgeSlot<ShownEdge>): unknown
  empty(): unknown
  tooltip?(props: NetworkTooltipSlot<ShownNode, ShownEdge>): unknown
  /** HTML anchored above the only selected node; it keeps its size at every zoom level. */
  'node-toolbar'?(props: NetworkNodeToolbarSlot<ShownNode>): unknown
  /** HTML anchored above the selected edge's label point; it keeps its size at every zoom level. */
  'edge-toolbar'?(props: NetworkEdgeToolbarSlot<ShownEdge>): unknown
  /** SVG that replaces a group's frame and label, in chart coordinates. */
  group?(props: NetworkGroupSlot<G>): unknown
  /** SVG that replaces a node's rectangle in the minimap, in chart coordinates. */
  'minimap-node'?(props: NetworkMinimapNodeSlot<ShownNode>): unknown
}>()
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
  bottomLeft: 'bottom left', bottomRight: 'bottom right', resizeRejected: 'This resize was rejected.',
  editLabel: 'Edit label of', labelRejected: 'This label change was rejected.', nodeToolbar: 'Node actions', edgeToolbar: 'Edge actions',
  ...labels.value,
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
// The selected node IDs: the controlled set, else the single selected ID.
function selectedNodeIds(): ReadonlySet<string> | readonly string[] {
  return props.selectedIds ?? (props.selectedId === undefined ? [] : [props.selectedId])
}
// The node of a selection of exactly one node, which shows the resize handles and the node toolbar.
function soleSelectedNode() {
  const ids = [...selectedNodeIds()]
  return ids.length === 1 ? nodesById.value.get(ids[0]!) : undefined
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
  emit('target-activate', { target: nodeTarget(id), source: eventSource(event) })
}
// Targets of the target-* events. A proxy stands for its collapsed group, so it is reported as that group.
function nodeTarget(id: string): GraphViewTarget {
  return { view: 'graph', kind: collapsedView.value?.proxies.has(id) ? 'group' : 'node', id }
}
function eventSource(event: Event): ViewTargetSource {
  return event.type.startsWith('key') ? 'keyboard' : 'pointer'
}
function emitTarget(name: 'target-enter' | 'target-leave' | 'target-activate', target: GraphViewTarget, source: ViewTargetSource) {
  // Separate calls keep the typed overloads of `emit`.
  if (name === 'target-enter') emit('target-enter', { target, source })
  else if (name === 'target-leave') emit('target-leave', { target, source })
  else emit('target-activate', { target, source })
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
    throw new RangeError('A custom layout must return positive finite dimensions')
  }
  // A missing box is a bad reference (Error), a box with invalid geometry a RangeError, as for asynchronous layout results.
  for (const node of nodes) {
    const box = result.boxes.get(node.id)
    if (!box) throw new Error('Missing layout box: ' + node.id)
    if (![box.x, box.y, box.width, box.height].every(Number.isFinite) || box.width <= 0 || box.height <= 0) {
      throw new RangeError('Invalid layout box: ' + node.id)
    }
  }
  // With the preserve policy, an edge without a path (such as an edge connected while an external layout is computed)
  // gets a temporary built-in route between its boxes, which the routing below treats as a built-in route.
  const completed = policy.value === 'preserve' ? completeGraphLayout(result, nodes, edges, { direction: direction.value }).layout : result
  for (const edge of edges) {
    if (!completed.paths.has(edge.id)) throw new Error('Missing layout path: ' + edge.id)
  }
  return completed
})
const policy = computed<GraphRoutingPolicy>(() => {
  const value = props.routingPolicy ?? 'builtin'
  if (value !== 'builtin' && value !== 'preserve') throw new RangeError('Unknown routing policy: ' + String(value))
  return value
})
const nodesById = computed(() => new Map(viewNodes.value.map(node => [node.id, node])))
const edgesById = computed(() => new Map(viewEdges.value.map(edge => [edge.id, edge])))
const direction = computed(() => options.value.direction ?? 'LR')
// Shallow, like the other previews: the positions are emitted as they are, so they must stay plain objects.
const dragPreview = shallowRef<ReadonlyMap<string, GraphPoint>>()
// Previews of a node resize and of an edge's waypoints during a pointer drag.
const resizePreview = shallowRef<{ id: string; box: GraphRect }>()
const reshapePreview = shallowRef<{ id: string; points: GraphPoint[] }>()
// The uncollapsed layout. Only read when groups are collapsed, to place proxies and move members; a change of the saved
// positions does not lay it out again, since only the top-left corners of its boxes are read (see expandedCorner).
const expandedBase = computed(() => props.layout ? props.layout(props.nodes, props.edges) : layoutLayeredGraph(props.nodes, props.edges, options.value))
// The top-left corner of a node's box in the uncollapsed layout with the saved positions.
function expandedCorner(id: string): GraphPoint | undefined {
  const box = expandedBase.value.boxes.get(id)
  if (!box) return undefined
  const saved = props.positions?.get(id)
  return saved ? { x: saved.x, y: saved.y } : { x: box.x, y: box.y }
}
function memberCorner(ids: readonly string[]): GraphPoint {
  let x = Infinity, y = Infinity
  for (const id of ids) {
    const box = expandedCorner(id)
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
const parallelSpacing = computed(() => {
  const spacing = props.parallelEdgeSpacing
  if (spacing !== undefined && !(Number.isFinite(spacing) && spacing > 0)) throw new RangeError('parallelEdgeSpacing must be a positive finite number of chart units')
  return spacing
})
// `avoidNodes` is memoised by value like `options`, so an inline `{ clearance }` literal in a parent template does not
// route every edge around the boxes again or cancel a gesture each time the parent renders.
const avoidNodes = computed<boolean | GraphObstacleAvoidance | undefined>((previous) => {
  const next = props.avoidNodes
  return typeof previous === 'object' && typeof next === 'object' && sameRecord(previous, next) ? previous : next
})
// The corner radius only applies to orthogonal routes, which an edge can also choose with its own edgeStyle.
const routeOptions = computed(() => ({
  style: props.edgeStyle, direction: direction.value, cornerRadius: 6, parallelSpacing: parallelSpacing.value, avoidNodes: avoidNodes.value,
}))
// The places of parallel edges among the edges between the same two nodes, over the whole view, so that routing a few
// edges of a preview spreads them as routing the whole graph does.
const parallelSlots = computed(() => parallelSpacing.value === undefined ? undefined : graphParallelSlots(viewEdges.value))
// Ports first, then the edge style and waypoints. The default curve style without waypoints keeps the routed layout.
const savedLayout = computed(() => arrange(viewPositions.value, props.sizes))
// With the preserve policy, the layout's own paths are kept while they fit (see isGraphRouteValid).
const savedPorted = computed(() => routeGraphPorts(savedLayout.value, nodesById.value, viewEdges.value, direction.value, { policy: policy.value }))
const savedRouted = computed(() => routeGraphEdgesWithSlots(
  savedPorted.value, viewEdges.value, nodesById.value, { ...routeOptions.value, policy: policy.value }, parallelSlots.value, true,
))
// Opt-in label placement over the routed layout; without it the saved geometry is the routed layout itself.
// `edgeBands`, validated once per change.
const edgeBands = computed(() => {
  const bands = props.edgeBands
  if (bands) assertGraphEdgeBands(bands, 'NetworkGraph edgeBands')
  return bands
})
// With `edgeBands`, labels keep their gap from the outer side of each band and stay off the other bands.
const labelPlacement = computed(() => {
  const placement = resolveEdgeLabelPlacement(props.edgeLabelPlacement)
  return placement && withBandWidths(placement, edgeBands.value)
})
const savedGeometry = computed(() => {
  const placement = labelPlacement.value
  return placement ? placeGraphEdgeLabels(savedRouted.value, viewEdges.value, placement) : savedRouted.value
})
// The path bounds of the saved layout, computed once a preview places labels.
const savedPathBounds = computed(() => edgePathBounds(savedGeometry.value, viewEdges.value))

// Drag previews (see ./networkGraph/previewLayout.ts) and the indexes of the saved layout they read.
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
const portEdges = computed(() => viewEdges.value.filter(hasPorts))
// With the preserve policy, the port edges whose layout paths routeGraphPorts keeps in the saved layout. The same
// edges keep them in a preview unless they touch a changed node, because their boxes and paths do not change.
const savedKeptPorts = computed<ReadonlySet<string>>(() => {
  if (policy.value !== 'preserve') return noIds
  const arranged = savedLayout.value, nodes = nodesById.value
  return new Set(portEdges.value.filter(edge => isGraphRouteValid(arranged, nodes, edge)).map(edge => edge.id))
})
// How far right and down the port route of each redrawn port edge of the saved layout reaches before routeGraphPorts
// clamps it to the layout size; a self-loop may reach 18 further. Computed once a preview changes the layout size.
const savedPortReach = computed(() => {
  const arranged = savedLayout.value, nodes = nodesById.value, dir = direction.value, kept = savedKeptPorts.value
  const list: Extent[] = []
  for (const edge of portEdges.value) {
    if (kept.has(edge.id)) continue
    const { a, b } = graphPortControls(graphEdgeEndpoint(arranged, nodes, edge, 'from', dir), graphEdgeEndpoint(arranged, nodes, edge, 'to', dir))
    const loop = edge.from === edge.to ? 18 : 0
    list.push({ id: edge.id, width: Math.max(0, a.x, b.x) + loop, height: Math.max(0, a.y, b.y) + loop })
  }
  return sortExtents(list)
})
type Slots = ParallelSlots
// Whether routeGraphEdges draws an edge itself rather than keeping its ported path: in a style other than curve (its own
// or the prop's), through waypoints, or spread among parallel edges.
function styled(edge: GraphEdge, slots: Slots = parallelSlots.value) {
  return (edge.edgeStyle ?? props.edgeStyle) !== 'curve' || Boolean(edge.points?.length) || Boolean(slots?.has(edge.id))
}
const styledEdgeIds = computed(() => viewEdges.value.filter(edge => styled(edge)).map(edge => edge.id))
// One edge routed on its own; the extent is how far its route stretches the layout. With `routes`, the route metadata
// routeGraphEdges records is returned too.
function routeOne(
  boxes: Map<string, GraphBox>, edge: GraphEdge, path: string, label: GraphPoint | undefined, routes?: boolean, slots: Slots = parallelSlots.value,
) {
  const single = routeGraphEdgesWithSlots({
    boxes, paths: new Map([[edge.id, path]]), edgeLabels: new Map(label ? [[edge.id, label]] : []), width: 0, height: 0,
    ...routes && { routes: new Map() },
  }, [edge], nodesById.value, routeOptions.value, slots, true)
  return {
    path: single.paths.get(edge.id)!, label: single.edgeLabels.get(edge.id), width: single.width, height: single.height,
    route: single.routes?.get(edge.id),
  }
}
// Route extents of the saved layout, computed once a preview needs them. Paths that the preserve policy keeps do not
// stretch the layout.
const savedRouteExtents = computed(() => {
  const ported = savedPorted.value, nodes = nodesById.value, preserve = policy.value === 'preserve'
  const list: Extent[] = []
  for (const edge of viewEdges.value) {
    if (!styled(edge) || (preserve && isGraphRouteValid(ported, nodes, edge))) continue
    const route = routeOne(ported.boxes, edge, ported.paths.get(edge.id)!, ported.edgeLabels.get(edge.id))
    list.push({ id: edge.id, width: route.width, height: route.height })
  }
  return sortExtents(list)
})
// With avoidNodes, a preview also reroutes the edges whose saved route a changed box now crosses or no longer needs to
// avoid (see obstructedEdges). Beyond `previewRerouteLimit` such edges, the frame reroutes none of them and they follow
// once the move is saved.
const previewRerouteLimit = 32
const avoidance = computed(() => resolveObstacleAvoidance(avoidNodes.value))
const avoidedRoutes = computed(() => {
  const settings = avoidance.value
  return settings && indexAvoidedRoutes(savedRouted.value, viewEdges.value, props.edgeStyle, settings.clearance)
})
// The edges, other than those in `skip`, whose saved route meets the old or new clearance area of a changed box; empty
// without avoidNodes or past the limit.
function previewObstructions(changed: ReadonlyMap<string, GraphBox>, before: ReadonlyMap<string, GraphBox>, skip: ReadonlySet<string>) {
  if (!changed.size || !avoidance.value) return []
  return obstructedEdges(avoidedRoutes.value!, changed, before, skip, previewRerouteLimit)
}
// The saved state a preview is built from. The getters keep the costly indexes lazy: a preview computes and tracks
// only those it reads.
const previewContext: PreviewContext = {
  get base() { return baseLayout.value },
  get arranged() { return savedLayout.value },
  get saved() { return savedGeometry.value },
  get positions() { return viewPositions.value },
  get sizes() { return props.sizes },
  get direction() { return direction.value },
  get policy() { return policy.value },
  get nodesById() { return nodesById.value },
  get edgesById() { return edgesById.value },
  get incidentEdges() { return incidentEdges.value },
  get parallelSlots() { return parallelSlots.value },
  get savedExtents() { return savedExtents.value },
  get portReach() { return savedPortReach.value },
  get routeExtents() { return savedRouteExtents.value },
  get styledEdgeIds() { return styledEdgeIds.value },
  styled,
  route: routeOne,
  obstructions: previewObstructions,
}
// The saved layout a preview was made from, and the nodes and edges it changes.
const previewSources = new WeakMap<GraphLayout, { saved: GraphLayout; nodes: readonly string[]; edges: readonly string[] }>()
const layout = computed(() => {
  const moving = dragPreview.value, resizing = resizePreview.value, reshaping = reshapePreview.value
  if (!moving && !resizing && !reshaping) return savedGeometry.value
  const { layout: preview, ...source } = previewLayout(previewContext, { moving, resizing, reshaping })
  const placement = labelPlacement.value
  if (!placement) {
    previewSources.set(preview, source)
    return preview
  }
  const placed = placePreviewLabels(
    preview, savedGeometry.value, viewEdges.value, edgesById.value, savedPathBounds.value, source.nodes, source.edges, placement,
  )
  previewSources.set(placed.layout, { ...source, edges: placed.edges })
  return placed.layout
})
// The checked group hierarchy in paint order, and its lookups.
const groupMembership = computed<GroupShape[]>(() => groupShapes(viewGroups.value ?? [], id => nodesById.value.has(id)))
const groupTree = computed(() => buildGroupTree(groupMembership.value))
type ShownGroup = GroupShape & GroupRect
// Group frames of the saved layout, with the bounds of each group's own nodes so a preview can tell which frames change.
const savedGroups = computed(() => {
  const geometry = savedGeometry.value, list = groupMembership.value, tree = groupTree.value
  const bounds = new Map<string, GroupBounds>(), rects = new Map<string, GroupRect>()
  // Children come after their parent in the list, so walking backwards sizes children first.
  for (let i = list.length - 1; i >= 0; i--) {
    const group = list[i]!
    const own = groupBounds(group, geometry.boxes, tree)
    bounds.set(group.id, own)
    rects.set(group.id, groupRect(group, own, geometry.width, geometry.height, tree, id => rects.get(id)!))
  }
  const shown = list.map<ShownGroup>(group => ({ ...group, ...rects.get(group.id)! }))
  // Groups whose own nodes reach furthest right and down first: a layout size change re-clamps only the first ones.
  const byRight = list.map(group => group.id).sort((a, b) => bounds.get(b)!.right - bounds.get(a)!.right)
  const byBottom = list.map(group => group.id).sort((a, b) => bounds.get(b)!.bottom - bounds.get(a)!.bottom)
  return { geometry, shown, bounds, byRight, byBottom }
})
// Group frames of the current layout. A preview recomputes only the frames of groups holding a changed node, of groups
// whose clamp to the layout size changes, and of their ancestors; the other frames are the saved ones.
const shownGroups = computed<readonly ShownGroup[]>(() => {
  const saved = savedGroups.value
  if (!saved.shown.length) return saved.shown
  const current = layout.value
  if (current === saved.geometry) return saved.shown
  const source = previewSources.get(current)
  const tree = groupTree.value, { index, byId, ofNode } = tree
  const affected = new Set<string>()
  const affect = (id: string | undefined) => addGroupChain(tree, id, affected)
  if (source?.saved !== saved.geometry) for (const group of saved.shown) affected.add(group.id)
  else for (const id of source.nodes) affect(ofNode.get(id))
  if (current.width !== saved.geometry.width) {
    const limit = Math.min(current.width, saved.geometry.width)
    for (const id of saved.byRight) {
      if (saved.bounds.get(id)!.right + 10 <= limit) break
      affect(id)
    }
  }
  if (current.height !== saved.geometry.height) {
    const limit = Math.min(current.height, saved.geometry.height)
    for (const id of saved.byBottom) {
      if (saved.bounds.get(id)!.bottom + 10 <= limit) break
      affect(id)
    }
  }
  if (!affected.size) return saved.shown
  const rects = new Map<string, GroupRect>()
  const rectOf = (id: string) => rects.get(id) ?? saved.shown[index.get(id)!]!
  for (const id of [...affected].sort((a, b) => index.get(b)! - index.get(a)!)) {
    const group = byId.get(id)!
    rects.set(id, groupRect(group, groupBounds(group, current.boxes, tree), current.width, current.height, tree, rectOf))
  }
  return saved.shown.map(group => {
    const rect = rects.get(group.id)
    return rect ? { ...byId.get(group.id)!, ...rect } : group
  })
})
function groupName(group: GroupShape) {
  return messages.value.moveGroup + ' ' + group.label + (group.parentLabel === undefined ? '' : ' ' + messages.value.groupWithin + ' ' + group.parentLabel)
}

// The handle a reference names in the current layout, or undefined when the node or port has none.
function handleAt(ref: PortRef): PortHandle | undefined {
  const node = nodesById.value.get(ref.node), box = layout.value.boxes.get(ref.node)
  if (!node || !box || (ref.port === undefined) !== !node.ports) return undefined
  // Like a lookup by key, the last port with a repeated ID wins.
  let port: GraphPort | undefined
  if (ref.port !== undefined) {
    for (const item of node.ports!) if (item.id === ref.port) port = item
    if (!port) return undefined
  }
  return connectHandle(node, port, box, direction.value === 'RL')
}
// The handle a `data-vw-port` key names.
function handleFromKey(key: string) {
  const ref = parsePortKey(key)
  return ref && handleAt(ref)
}

// Swimlane bands, checked once per new list. They are part of the content bounds below.
const laneBands = computed(() => {
  const list = props.lanes
  if (list) assertGraphSwimlaneBands(list, 'NetworkGraph')
  return list?.length ? list : undefined
})
// Pools, checked once per new list, also part of the content bounds.
const poolBands = computed(() => {
  const list = props.pools
  if (list) assertGraphSwimlanePools(list, 'NetworkGraph')
  return list?.length ? list : undefined
})
// The layout box plus every group rectangle. A group frames its nodes with a label strip and padding, so a group at
// the layout edge, and a parent of such a group, can reach past the layout's own origin and size.
// The previous object while the bounds are equal, so a drag inside them does not re-render the minimap or the camera.
const contentBounds = computed<ContentBounds>((previous) => keep(previous, boundsOf(
  layout.value.width, layout.value.height, [...shownGroups.value, ...laneBands.value ?? [], ...poolBands.value ?? []],
)))

// Scale at which the whole graph fits the viewport.
const wholeScale = computed(() => scaleToFit(viewport.value, contentBounds.value))
// The smallest scale is 0.1, or less when that is needed to show the whole graph.
const minScale = computed(() => Math.min(0.1, wholeScale.value))
function clampScale(scale: number) {
  return clampToScale(scale, minScale.value)
}
function validScale(scale: number) {
  return inScaleRange(scale, minScale.value)
}
function scaleError() {
  return scaleRangeError(minScale.value)
}

// Screen margin requested by the last fit({ padding }) of the whole graph; plain fit() resets it to 0.
let fitPadding = 0
// The camera of Fit to view (`overview`) or of the automatic view, which keeps the selected node in a narrow stage.
function fitCamera(overview = false) {
  const geometry = layout.value
  const focus = props.selectedId ? geometry.boxes.get(props.selectedId) : undefined
  return fittedCamera(viewport.value, contentBounds.value, { overview, padding: fitPadding, minScale: minScale.value, wholeScale: wholeScale.value, focus })
}

const camera = ref(fitCamera())
const fitMode = ref<'auto' | 'overview' | 'manual'>('auto')
// A camera placed by the user or the API: automatic fitting stops until the graph is replaced.
function placeCamera(next: GraphViewport) {
  fitMode.value = 'manual'
  camera.value = next
}
const isPanning = ref(false)
let pan: { pointerId: number; x: number; y: number; cameraX: number; cameraY: number; box: boolean; lasso?: boolean } | undefined
const boxPreview = ref<{ x: number; y: number; width: number; height: number }>()
// The outline of a lasso selection in chart coordinates (selectionMode 'lasso').
const lassoPreview = shallowRef<GraphPoint[]>()
const lassoMode = computed(() => {
  const mode = props.selectionMode ?? 'box'
  if (mode !== 'box' && mode !== 'lasso') throw new RangeError('Unknown selection mode: ' + String(mode))
  return mode === 'lasso'
})
let observer: ResizeObserver | undefined

// Gesture notification. A pointer gesture (drag, resize, reshape, box selection, pan or pinch) and an armed connection
// can be in flight at once, so each has its own slot. A slot emits `gesture-end` exactly once for its `gesture-start`;
// a new start in an occupied slot first ends the previous gesture as cancelled.
type GestureSlot = 'pointer' | 'connection'
const gestures: Partial<Record<GestureSlot, GraphGesture>> = {}
function beginGesture(slot: GestureSlot, kind: GraphGestureKind, source: GraphGesture['source'] = 'pointer') {
  endGesture(slot, 'cancelled')
  const gesture = { kind, source }
  gestures[slot] = gesture
  emit('gesture-start', { ...gesture })
}
function endGesture(slot: GestureSlot, outcome: GraphGestureEnd['outcome']) {
  const gesture = gestures[slot]
  if (!gesture) return
  gestures[slot] = undefined
  emit('gesture-end', { ...gesture, outcome })
}

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
  const { left, top, right, bottom } = rectsBounds(ids.map(id => layout.value.boxes.get(id)!))
  const scale = clampScale(Math.min(1.15, paddedScale(viewport.value, right - left, bottom - top, padding)))
  placeCamera(graphCameraAt({ x: (left + right) / 2, y: (top + bottom) / 2 }, viewport.value, scale))
}

function zoom(factor: number, x = viewport.value.width / 2, y = viewport.value.height / 2) {
  cancelInteraction()
  if (![factor, x, y].every(Number.isFinite) || factor <= 0) throw new RangeError('Zoom requires a positive finite factor and finite coordinates')
  const current = camera.value
  placeCamera(zoomAround(current, clampScale(current.scale * factor), x, y))
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
  if (pan.box && lassoMode.value) pan.lasso = true
  isPanning.value = !pan.box
  capturePointer(svg.value, event.pointerId)
  if (pan.box) startAutoPan(event)
  beginGesture('pointer', pan.box ? 'box-select' : 'pan')
}

// The session records the camera when the drag started; auto-pan moves the camera during the drag. `guides` holds the
// boxes the alignment guides align with, collected on the first move of the drag.
let nodeDrag: (PointerSession & { before: Map<string, GraphPoint>; node?: string; group?: string; guides?: GraphRect[] }) | undefined
let suppressClick: string | undefined
// The group whose label was dragged, so the click that ends the drag does not activate it.
let suppressGroupClick: string | undefined
const noIds: ReadonlySet<string> = new Set()
const gestureIds = shallowRef(noIds)
// The live region's announcement: the reason of the last rejected proposal, cleared when a new one is checked.
const notice = ref('')
// Checks a proposal with the result of its validator: clears the last announcement and, when the result rejects the
// proposal (see rejectionReason: `false` or a blank reason rejects with `fallback`), announces the reason and returns
// it. The caller emits the matching event.
function checkProposal(result: ValidatorResult, fallback: string): string | undefined {
  notice.value = ''
  const reason = rejectionReason(result, fallback)
  if (reason !== undefined) notice.value = reason
  return reason
}

function movablePositions(ids: Iterable<string>) {
  const positions = new Map<string, GraphPoint>()
  for (const id of ids) {
    const box = savedLayout.value.boxes.get(id)
    if (box && nodesById.value.get(id)?.draggable !== false) positions.set(id, { x: box.x, y: box.y })
  }
  return positions
}

function emitMoves(before: ReadonlyMap<string, GraphPoint>, after: ReadonlyMap<string, GraphPoint>) {
  const changes: GraphNodeMove[] = []
  for (const [id, point] of after) {
    const previous = before.get(id)!
    if (previous.x === point.x && previous.y === point.y) continue
    const proxy = collapsedView.value?.proxies.get(id)
    if (proxy) for (const change of proxyMoves(proxy.nodeIds, point)) changes.push(change)
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
    const box = expandedCorner(id)
    if (!box || realNodesById.value.get(id)?.draggable === false) continue
    const point = { x: Math.max(0, box.x - corner.x + after.x), y: Math.max(0, box.y - corner.y + after.y) }
    if (point.x !== box.x || point.y !== box.y) changes.push({ id, before: { x: box.x, y: box.y }, after: point })
  }
  return changes
}

// Non-moving node boxes that guides align with: every node, or only the rendered ones when culling is on. Collected
// once per drag: the saved layout cannot change during a drag without cancelling it.
function guideCandidates(moving: ReadonlyMap<string, GraphPoint>) {
  const rendered = visible.value?.nodes
  const rects: GraphRect[] = []
  for (const [id, box] of savedLayout.value.boxes) {
    if (!moving.has(id) && (!rendered || rendered.has(id))) rects.push({ x: box.x, y: box.y, width: box.width, height: box.height })
  }
  return rects
}
const guideLines = shallowRef<GraphAlignmentGuide[]>()
// The guide lines of a pointer drag, drawn in the stage or in the overlay.
const GuideLines: FunctionalComponent = () => h('g', { class: 'vw-guides', 'aria-hidden': 'true' }, (guideLines.value ?? []).map(guide => h('line', {
  key: guide.axis + guide.position, class: 'vw-guide',
  x1: guide.axis === 'x' ? guide.position : guide.from, x2: guide.axis === 'x' ? guide.position : guide.to,
  y1: guide.axis === 'y' ? guide.position : guide.from, y2: guide.axis === 'y' ? guide.position : guide.to,
})))
// The positions of a pointer drag. With a grid or guides, the reference point of the move (see referencePoint) snaps
// and the other moved nodes keep their offsets from it.
function dragPositions(drag: NonNullable<typeof nodeDrag>, dx: number, dy: number) {
  const grid = props.snapGrid
  if (grid === undefined && !props.alignmentGuides) return movePositions(drag.before, dx, dy)
  const node = drag.node !== undefined && drag.before.has(drag.node) ? drag.node : undefined
  const boxes = savedLayout.value.boxes
  const reference = referencePoint(drag.before, node, boxes)
  const bounds = movedBounds(drag.before, boxes)
  let gridX = grid, gridY = grid, others: GraphRect[] = []
  if (props.alignmentGuides) {
    others = drag.guides ??= guideCandidates(drag.before)
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
    const moved = movedBounds(positions, boxes)
    guideLines.value = graphAlignmentGuides(moved, others, 1e-6).guides
  }
  return positions
}

function startNodeDrag(event: PointerEvent, ids: Iterable<string>, node?: string, group?: string) {
  suppressClick = suppressGroupClick = undefined
  if (!props.draggable || !event.isPrimary || event.button !== 0 || pointerGestureActive()) return
  if (node && nodesById.value.get(node)?.draggable === false) return
  const before = movablePositions(ids)
  if (!before.size) return
  nodeDrag = { ...pointerSession(event, camera.value), before, node, group }
  gestureIds.value = new Set(before.keys())
  grabPointer(nodeDrag)
  startAutoPan(event)
  beginGesture('pointer', before.size > 1 ? 'nodes-drag' : 'node-drag')
}

function updateNodePreview(clientX: number, clientY: number) {
  if (!nodeDrag) return
  if (!dragPreview.value && !sessionPastThreshold(nodeDrag, clientX, clientY)) return
  // Camera movement during the drag (auto-pan) moves the chart under a still pointer.
  const delta = chartDelta(nodeDrag, clientX, clientY, camera.value)
  dragPreview.value = dragPositions(nodeDrag, delta.x, delta.y)
}
function moveNode(event: PointerEvent) {
  if (!ownsPointer(nodeDrag, event)) return
  gesturePointer = { x: event.clientX, y: event.clientY }
  updateNodePreview(event.clientX, event.clientY)
}
function cancelNodeDrag() {
  const drag = nodeDrag
  nodeDrag = undefined
  gestureIds.value = noIds
  guideLines.value = undefined
  if (dragPreview.value && drag) {
    suppressClick = drag.node
    suppressGroupClick = drag.group
  }
  dragPreview.value = undefined
  releaseSession(drag)
}
function finishNodeDrag(event: PointerEvent) {
  if (!ownsPointer(nodeDrag, event)) return
  if (event.type !== 'pointerup') {
    cancelNodeDrag()
    endGesture('pointer', 'cancelled')
    return
  }
  moveNode(event)
  const { before } = nodeDrag
  const after = dragPreview.value
  cancelNodeDrag()
  if (after) emitMoves(before, after)
  endGesture('pointer', 'committed')
}
function clickNode(id: string, event: MouseEvent) {
  if (suppressClick === id) {
    suppressClick = undefined
    return
  }
  select(id, event)
}
function groupTarget(id: string): GraphViewTarget {
  return { view: 'graph', kind: 'group', id }
}
// A group label only reports activation; it selects nothing.
function activateGroup(id: string, event: Event) {
  if (suppressGroupClick === id && event.type === 'click') {
    suppressGroupClick = undefined
    return
  }
  emitTarget('target-activate', groupTarget(id), eventSource(event))
}
function movingIds(id: string) {
  return props.selectedIds?.has(id) ? props.selectedIds : [id]
}
function moveWithKeys(event: KeyboardEvent, ids: Iterable<string>, node?: string) {
  if (!props.draggable || gestureInFlight()) return
  const offset = arrowOffsets[event.key]
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
  const anchor = node !== undefined && before.has(node) ? node : undefined
  const reference = referencePoint(before, anchor, savedLayout.value.boxes)
  const target = { x: stepValue(reference.x, offset[0], event.shiftKey, grid), y: stepValue(reference.y, offset[1], event.shiftKey, grid) }
  emitMoves(before, placeMoved(before, reference, target, anchor, grid, grid))
}

type ConnectionDraft = { fixed: PortRef; end: 'from' | 'to'; edge?: GraphEdge }
const draft = ref<ConnectionDraft>()
const activeEdgeId = ref<string>()
const connectionPoint = ref<GraphPoint>()
let connectionDrag: PointerSession | undefined
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
function edgeTarget(id: string): GraphViewTarget {
  return { view: 'graph', kind: 'edge', id }
}
function selectEdge(id: string, event: MouseEvent | KeyboardEvent) {
  pickEdge(id, event)
  emitTarget('target-activate', edgeTarget(id), eventSource(event))
}
function pickEdge(id: string, event: MouseEvent | KeyboardEvent) {
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
  const origin = handleAt(pending.fixed) ?? (pending.edge && graphEdgeEndpoint(
    layout.value, nodesById.value, pending.edge, pending.end === 'from' ? 'to' : 'from', direction.value,
  ))
  if (!origin) return undefined
  return `M ${origin.x} ${origin.y} L ${end.x} ${end.y}`
})
function captureConnection(event: PointerEvent) {
  connectionDrag = pointerSession(event)
  grabPointer(connectionDrag)
  startAutoPan(event)
}
function startPort(event: PointerEvent, handle: PortHandle) {
  skipHandleClick = false
  if (draft.value || !event.isPrimary || event.button !== 0 || handle.direction === 'target' || pointerGestureActive()) return
  draft.value = { fixed: handle, end: 'to' }
  captureConnection(event)
  beginGesture('connection', 'connect')
}
function reconnectEdge(edge: GraphEdge, end: 'from' | 'to', event?: PointerEvent) {
  if (event && (!event.isPrimary || event.button !== 0 || pointerGestureActive())) return
  skipHandleClick = false
  const fixed = end === 'from' ? { node: edge.to, port: edge.toPort } : { node: edge.from, port: edge.fromPort }
  draft.value = { fixed, end, edge }
  if (event) captureConnection(event)
  beginGesture('connection', 'reconnect', event ? 'pointer' : 'keyboard')
}
function moveConnection(event: PointerEvent) {
  if (!ownsPointer(connectionDrag, event)) return
  gesturePointer = { x: event.clientX, y: event.clientY }
  if (connectionPoint.value || sessionPastThreshold(connectionDrag, event.clientX, event.clientY)) {
    connectionPoint.value = worldPoint(event.clientX, event.clientY)
  }
}
function clearConnectionCapture() {
  const drag = connectionDrag
  connectionDrag = undefined
  connectionPoint.value = undefined
  releaseSession(drag)
}
function finishConnection(event: PointerEvent) {
  if (!ownsPointer(connectionDrag, event)) return
  if (event.type !== 'pointerup') {
    clearConnectionCapture()
    draft.value = undefined
    endGesture('connection', 'cancelled')
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
  const handle = key === null ? undefined : handleFromKey(key)
  if (handle) completeConnection(handle)
  else {
    draft.value = undefined
    endGesture('connection', 'committed')
  }
}
function activatePort(handle: PortHandle, event: MouseEvent | KeyboardEvent) {
  if (event.type === 'click' && skipHandleClick) {
    skipHandleClick = false
    return
  }
  if (draft.value) completeConnection(handle)
  else if (handle.direction !== 'target') {
    draft.value = { fixed: handle, end: 'to' }
    beginGesture('connection', 'connect', eventSource(event))
  }
}
function completeConnection(handle: PortHandle) {
  const pending = draft.value
  draft.value = undefined
  notice.value = ''
  proposeConnection(pending, handle)
  endGesture('connection', 'committed')
}
function proposeConnection(pending: ConnectionDraft | undefined, handle: PortHandle) {
  if (!pending || pending.fixed.node === handle.node || handle.direction === (pending.end === 'from' ? 'target' : 'source')) return
  const connection = pending.end === 'from' ? connectionBetween(handle, pending.fixed) : connectionBetween(pending.fixed, handle)
  const edge = pending.edge
  if (edge && edge.from === connection.from && edge.to === connection.to && edge.fromPort === connection.fromPort && edge.toPort === connection.toPort) return
  const ruled = connectionChecker.value?.check(connection, edge?.id)
  const reason = checkProposal(ruled && !ruled.ok ? ruled.reason : props.validateConnection?.(connection, edge?.id), messages.value.rejected!)
  if (reason !== undefined) {
    emit('connect-rejected', connection, reason)
  } else if (edge) {
    const before = connectionBetween({ node: edge.from, port: edge.fromPort }, { node: edge.to, port: edge.toPort })
    emit('reconnect', { id: edge.id, before, after: connection })
  } else {
    emit('connect', connection)
  }
}
// The checker of the opt-in connection rules, built once per change of the nodes, edges or rules.
const connectionChecker = computed(() => props.connectionRules
  ? createGraphConnectionChecker(props.nodes, props.edges, props.connectionRules) : undefined)
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
  lassoPreview.value = undefined
  isPanning.value = false
  if (previousPan && svg.value) releasePointer(svg.value, previousPan.pointerId)
  endGesture('pointer', 'cancelled')
  endGesture('connection', 'cancelled')
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
  placeCamera(contentCameraAt(content, world, viewport.value, camera.value.scale))
}

function updateBox(clientX: number, clientY: number) {
  if (!pan) return
  // The start corner keeps its chart position when auto-pan moves the camera.
  const a = worldPoint(pan.x + camera.value.x - pan.cameraX, pan.y + camera.value.y - pan.cameraY), b = worldPoint(clientX, clientY)
  boxPreview.value = { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y) }
}
// A lasso keeps every pointer position at least 3 screen pixels from the previous one, in chart coordinates, so the
// outline stays put when auto-pan moves the camera.
function updateLasso(clientX: number, clientY: number) {
  if (!pan) return
  const points = lassoPreview.value ?? [worldPoint(pan.x + camera.value.x - pan.cameraX, pan.y + camera.value.y - pan.cameraY)]
  const next = worldPoint(clientX, clientY), last = points[points.length - 1]!
  if (lassoPreview.value && Math.hypot(next.x - last.x, next.y - last.y) * camera.value.scale < 3) return
  lassoPreview.value = [...points, next]
}
function updateSelectionArea(clientX: number, clientY: number) {
  if (pan?.lasso) updateLasso(clientX, clientY)
  else updateBox(clientX, clientY)
}
function movePan(event: PointerEvent) {
  if (!pan || pan.pointerId !== event.pointerId) return
  if (pan.box) {
    gesturePointer = { x: event.clientX, y: event.clientY }
    if (pan.lasso && !lassoPreview.value && !pastThreshold(pan, event)) return
    updateSelectionArea(event.clientX, event.clientY)
    return
  }
  placeCamera({
    ...camera.value,
    x: pan.cameraX + event.clientX - pan.x,
    y: pan.cameraY + event.clientY - pan.y,
  })
}

function stopPan(event: PointerEvent) {
  if (pan?.pointerId !== event.pointerId) return
  if (pan.box && event.type === 'pointerup' && pastThreshold(pan, event)) {
    movePan(event)
    const selection = new Set(event.ctrlKey || event.metaKey ? props.selectedIds : [])
    if (pan.lasso) {
      // The release point closes the outline even when it is closer than the sampling distance.
      const outline = [...lassoPreview.value ?? [], worldPoint(event.clientX, event.clientY)]
      for (const id of graphNodesInPolygon(layout.value.boxes, outline)) selection.add(id)
    } else {
      const area = boxPreview.value!
      for (const [id, box] of layout.value.boxes) if (graphRectsIntersect(box, area)) selection.add(id)
    }
    emit('update:selectedIds', selection)
    if (props.edgesSelectable && !event.ctrlKey && !event.metaKey) clearEdgeSelection()
  }
  boxPreview.value = undefined
  lassoPreview.value = undefined
  pan = undefined
  isPanning.value = false
  endGesture('pointer', event.type === 'pointerup' ? 'committed' : 'cancelled')
}

function panWithKeys(event: KeyboardEvent) {
  const step = panKeySteps[event.key]
  if (!step) return
  cancelInteraction()
  event.preventDefault()
  placeCamera({ ...camera.value, x: camera.value.x + step[0], y: camera.value.y + step[1] })
}

// Auto-pan. While a node drag, connection or box selection is held near the stage edge, the camera pans every frame,
// faster the closer the pointer is to the edge (see autoPanStep), and the preview follows the pointer.
let autoPanFrame = 0
let gesturePointer: GraphPoint | undefined
function startAutoPan(event: PointerEvent) {
  gesturePointer = { x: event.clientX, y: event.clientY }
  if (props.autoPan && !autoPanFrame && typeof requestAnimationFrame === 'function') autoPanFrame = requestAnimationFrame(autoPanFrameStep)
}
function stopAutoPan() {
  if (autoPanFrame && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(autoPanFrame)
  autoPanFrame = 0
}
function autoPanFrameStep() {
  autoPanFrame = 0
  const point = gesturePointer
  // A gesture that has not moved yet waits; a finished or cancelled one ends the loop.
  const moving = nodeDrag ? Boolean(dragPreview.value) : connectionDrag ? Boolean(connectionPoint.value)
    : pan?.box ? Boolean(boxPreview.value || lassoPreview.value) : undefined
  if (moving === undefined || pinch || !props.autoPan || !svg.value || !point) return
  if (moving) {
    const { x, y, scale } = camera.value
    const step = autoPanStep(svg.value.getBoundingClientRect(), point, camera.value, contentBounds.value)
    if (step.x || step.y) {
      placeCamera({ x: x + step.x, y: y + step.y, scale })
      if (nodeDrag) updateNodePreview(point.x, point.y)
      else if (connectionDrag) connectionPoint.value = worldPoint(point.x, point.y)
      else updateSelectionArea(point.x, point.y)
    }
  }
  autoPanFrame = requestAnimationFrame(autoPanFrameStep)
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
    findElement(root.value, '[data-vw-toggle]', 'data-vw-toggle', toggle.id)?.focus({ preventScroll: true })
  })
}

// A keyboard step of a waypoint or a box edge: to the next line of `snapGrid` (see stepValue).
function keyStep(value: number, direction: number, shift: boolean) {
  return stepValue(value, direction, shift, props.snapGrid)
}

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
  const reason = checkProposal(props.validateEdgeReshape?.(change), messages.value.reshapeRejected!)
  if (reason !== undefined) {
    emit('edge-reshape-rejected', change, reason)
    return
  }
  emit('edge-reshape', change)
}
// The first element in a container that matches a selector and has an attribute with a value. The value is compared
// as a string, so IDs never need CSS escaping.
function findElement(container: Element | undefined, selector: string, attribute: string, value: string) {
  return [...container?.querySelectorAll<SVGElement>(selector) ?? []].find(item => item.getAttribute(attribute) === value)
}
function nodeElement(id: string) {
  return findElement(svg.value, '.vw-network-node[data-vw-node]', 'data-vw-node', id)
}
// Focus on an edge's hit area, else on the stage.
function focusEdge(id: string) {
  ;(findElement(svg.value, '.vw-edge-hit', 'data-vw-edge', id) ?? svg.value)?.focus({ preventScroll: true })
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
  points[handle.index] = clampPoint({ x: keyStep(point.x, offset[0], event.shiftKey), y: keyStep(point.y, offset[1], event.shiftKey) })
  proposeReshape(edge, points)
}

// Node resizing. Handles at the corners of the only selected node.
const minimumSize = computed(() => {
  const size = props.minNodeSize ?? { width: 40, height: 24 }
  if (![size.width, size.height].every(value => Number.isFinite(value) && value > 0)) throw new RangeError('minNodeSize must have a finite positive width and height')
  return size
})
const resizeHandles = computed(() => {
  if (!props.resizable) return []
  const node = soleSelectedNode()
  const box = node && layout.value.boxes.get(node.id)
  if (!node || !box || node.resizable === false || collapsedView.value?.proxies.has(node.id)) return []
  return corners.map((corner) => {
    const { west, north } = cornerSides(corner)
    return {
      corner, node: node.id, x: west ? box.x : box.x + box.width, y: north ? box.y : box.y + box.height,
      label: messages.value.resizeNode + ' ' + node.label + ' · ' + messages.value[corner],
    }
  })
})
function savedBox(id: string): GraphRect | undefined {
  const box = savedLayout.value.boxes.get(id)
  return box && { x: box.x, y: box.y, width: box.width, height: box.height }
}
function proposeResize(id: string, before: GraphRect, after: GraphRect) {
  if (before.x === after.x && before.y === after.y && before.width === after.width && before.height === after.height) return
  const change: GraphNodeResize = { id, before, after }
  const reason = checkProposal(props.validateNodeResize?.(change), messages.value.resizeRejected!)
  if (reason !== undefined) {
    emit('node-resize-rejected', change, reason)
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
  const { west, north } = cornerSides(corner)
  const right = before.x + before.width, bottom = before.y + before.height, shift = event.shiftKey
  proposeResize(id, before, resizeBox(before, corner,
    west ? keyStep(before.x, offset[0], shift) : before.x, north ? keyStep(before.y, offset[1], shift) : before.y,
    west ? right : keyStep(right, offset[0], shift), north ? bottom : keyStep(bottom, offset[1], shift), minimumSize.value))
}

// Pointer drags of waypoint, insert and resize handles.
// Handle drags do not auto-pan, and a camera change (zoom, pan keys, pinch, fit) cancels them, so the camera stays put.
type HandleDrag = PointerSession & { kind: 'move' | 'add' | 'resize'; id: string; index: number; origin: GraphPoint; corner?: Corner; box?: GraphRect }
let handleDrag: HandleDrag | undefined
function startHandleDrag(event: PointerEvent, drag: Omit<HandleDrag, keyof PointerSession>) {
  if (!event.isPrimary || event.button !== 0 || gestureInFlight()) return
  handleDrag = { ...drag, ...pointerSession(event) }
  grabPointer(handleDrag)
  beginGesture('pointer', drag.kind === 'resize' ? 'node-resize' : 'edge-reshape')
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
  if (!ownsPointer(drag, event)) return
  if (!resizePreview.value && !reshapePreview.value && !sessionPastThreshold(drag, event.clientX, event.clientY)) return
  // The session has no start camera: a camera change cancels a handle drag.
  const { x: dx, y: dy } = chartDelta(drag, event.clientX, event.clientY, camera.value)
  if (drag.kind === 'resize') {
    const box = drag.box!
    resizePreview.value = { id: drag.id, box: resizeBox(box, drag.corner!, snapOrKeep(box.x + dx), snapOrKeep(box.y + dy),
      snapOrKeep(box.x + box.width + dx), snapOrKeep(box.y + box.height + dy), minimumSize.value) }
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
  releaseSession(drag)
}
function finishHandle(event: PointerEvent) {
  const drag = handleDrag
  if (!ownsPointer(drag, event)) return
  if (event.type !== 'pointerup') {
    cancelHandleDrag()
    endGesture('pointer', 'cancelled')
    return
  }
  moveHandle(event)
  const resized = resizePreview.value, reshaped = reshapePreview.value
  cancelHandleDrag()
  commitHandle(drag, resized, reshaped)
  endGesture('pointer', 'committed')
}
function commitHandle(drag: HandleDrag, resized: typeof resizePreview.value, reshaped: typeof reshapePreview.value) {
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

// Inline label editing (editableLabels). The editor is an HTML input placed over the label: it follows the camera, and
// a change of the source data or the layout cancels it. Enter and blur propose the text, Escape discards it.
type LabelEditor = { kind: 'node' | 'edge'; id: string; before: string; name: string }
const labelEditor = shallowRef<LabelEditor>()
const labelDraft = ref('')
const labelInput = ref<HTMLInputElement>()
function openLabelEditor(kind: LabelEditor['kind'], id: string, event: Event) {
  if (!props.editableLabels || labelEditor.value || gestureInFlight()) return
  // A collapsed group's proxy and an edge merged from several edges stand for more than one label.
  const view = collapsedView.value
  if (kind === 'node' ? view?.proxies.has(id) : (view?.mergedEdges.get(id)?.length ?? 0) > 1) return
  const node = kind === 'node' ? nodesById.value.get(id) : undefined, edge = kind === 'edge' ? edgesById.value.get(id) : undefined
  if (!node && !edge) return
  event.preventDefault()
  hideTooltip()
  const before = node ? node.label : edge!.label ?? ''
  labelEditor.value = { kind, id, before, name: messages.value.editLabel + ' ' + (node ? node.label : edge!.label ?? edge!.id) }
  labelDraft.value = before
  void nextTick(() => {
    labelInput.value?.focus({ preventScroll: true })
    labelInput.value?.select()
  })
}
function focusLabelOwner(editor: LabelEditor) {
  if (editor.kind === 'edge') return focusEdge(editor.id)
  ;(nodeElement(editor.id) ?? svg.value)?.focus({ preventScroll: true })
}
function closeLabelEditor(commit: boolean, restoreFocus: boolean) {
  const editor = labelEditor.value
  if (!editor) return
  labelEditor.value = undefined
  if (restoreFocus) void nextTick(() => focusLabelOwner(editor))
  const after = labelDraft.value
  if (!commit || after === editor.before) return
  const change: GraphLabelEdit = { kind: editor.kind, id: editor.id, before: editor.before, after }
  const reason = checkProposal(props.validateLabelEdit?.(change), messages.value.labelRejected!)
  if (reason !== undefined) {
    emit('label-edit-rejected', change, reason)
    return
  }
  emit('label-edit', change)
}
function labelKeydown(event: KeyboardEvent) {
  if (event.isComposing || (event.key !== 'Enter' && event.key !== 'Escape')) return
  event.preventDefault()
  event.stopPropagation()
  closeLabelEditor(event.key === 'Enter', true)
}
// The label anchor of an edge: its label position, else the middle between the ends of its path.
function edgeAnchor(id: string): GraphPoint | undefined {
  const point = layout.value.edgeLabels.get(id)
  if (point) return point
  const path = layout.value.paths.get(id)
  if (path === undefined) return undefined
  try {
    const ends = graphPathEndpoints(path)
    return ends && { x: (ends.start.x + ends.end.x) / 2, y: (ends.start.y + ends.end.y) / 2 }
  } catch {
    return undefined
  }
}
const labelEditorView = computed(() => {
  const editor = labelEditor.value
  if (!editor) return undefined
  if (editor.kind === 'node') {
    const box = layout.value.boxes.get(editor.id)
    if (!box) return undefined
    return { name: editor.name, edge: false, style: nodeLabelEditorStyle(box, camera.value, rtl.value) }
  }
  const point = edgeAnchor(editor.id)
  if (!point) return undefined
  return { name: editor.name, edge: true, style: edgeLabelEditorStyle(point, camera.value) }
})

// The centre of a chart rectangle.
function rectCenter(rect: GraphRect): GraphPoint {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
}
// Toolbar slots: HTML anchored above the only selected node and the selected edge, hidden while the item is outside
// the stage (see toolbarPlacement).
const nodeToolbarView = computed(() => {
  const node = soleSelectedNode()
  const box = node && layout.value.boxes.get(node.id)
  if (!node || !box) return undefined
  const place = toolbarPlacement(stageEdges(box, camera.value), viewport.value)
  return place && { ...place, name: messages.value.nodeToolbar + ' ' + node.label, slot: { node, box, scale: camera.value.scale } }
})
const edgeToolbarView = computed(() => {
  let id: string | undefined
  if (props.edgesSelectable) {
    const list = selectedEdgeList()
    id = list.length === 1 ? list[0] : undefined
  } else if (props.reconnectable || props.editableEdges || props.editableLabels) id = currentEdgeId.value
  const edge = id === undefined ? undefined : edgesById.value.get(id)
  const point = edge && edgeAnchor(edge.id)
  if (!edge || !point) return undefined
  const { scale } = camera.value
  const { x: left, y: top } = stagePoint(point, camera.value)
  const place = toolbarPlacement({ left, right: left, top: top - 6, bottom: top + 6 }, viewport.value)
  return place && { ...place, name: messages.value.edgeToolbar + ' ' + (edge.label ?? edge.id), slot: { edge, point: { x: point.x, y: point.y }, scale } }
})

// Level of detail. Below the threshold scale the default renderer hides node details and edge labels (CSS).
const lodLow = computed(() => props.lodThreshold !== undefined && camera.value.scale < props.lodThreshold)

function dimTest() {
  const dimmed = props.dimmedIds, matches = props.matchIds
  return (id: string) => Boolean(dimmed?.has(id) || (matches && !matches.has(id)))
}
// Display-only highlights of the shown graph. With collapsed groups, a hidden node highlights its proxy, a merged edge is
// highlighted when one of its original edges is, and an edge dropped inside a collapsed group highlights the proxy.
const highlights = computed<{ nodes: ReadonlySet<string>; edges: ReadonlySet<string> } | undefined>(() => {
  const nodeIds = props.highlightedNodeIds, edgeIds = props.highlightedEdgeIds
  if (!nodeIds?.size && !edgeIds?.size) return undefined
  const view = collapsedView.value
  if (!view) return { nodes: nodeIds ?? new Set(), edges: edgeIds ?? new Set() }
  const resolved = resolveCollapsedTargets(view, { nodeIds, edgeIds }, props.edges)
  return { nodes: new Set(resolved.nodeIds), edges: new Set(resolved.edgeIds) }
})

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
// Keyboard focus on a node, edge hit area or group label reports target-enter and, when it moves on, target-leave.
// Focus moved by a press is pointer focus, which pointerenter already reports.
let keyboardTarget: GraphViewTarget | undefined
function focusedTarget(element: Element): GraphViewTarget | undefined {
  if (!stageControl(element) || element === svg.value) return undefined
  const node = elementNode(element), edge = element.getAttribute('data-vw-edge'), group = element.getAttribute('data-vw-group')
  return node !== null ? nodeTarget(node) : edge !== null ? edgeTarget(edge) : group !== null ? groupTarget(group) : undefined
}
function enterWithFocus(event: FocusEvent) {
  leaveWithFocus()
  if (!(event.target instanceof Element) || pressing || !focusVisible(event.target)) return
  const target = focusedTarget(event.target)
  if (!target) return
  keyboardTarget = target
  emitTarget('target-enter', target, 'keyboard')
}
function leaveWithFocus() {
  const target = keyboardTarget
  keyboardTarget = undefined
  if (target) emitTarget('target-leave', target, 'keyboard')
}
// Bounds come from the saved layout, so a drag preview does not re-parse every edge path. Dragged nodes and
// the edges attached to them are kept rendered separately instead (see `visible`).
const layoutBounds = computed(() => props.cullOffscreen ? graphLayoutBounds(savedGeometry.value) : undefined)
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
  return keepIds(previous, ids)
})
const reshapeId = computed(() => reshapePreview.value?.id)
const cullView = computed(() => layoutBounds.value && graphViewportRect(camera.value, viewport.value, Math.max(0, props.cullOverscan ?? 0)))
const visible = computed(() => {
  const bounds = layoutBounds.value, view = cullView.value
  if (!bounds || !view) return undefined
  const nodes = new Set<string>(selectedNodeIds())
  for (const id of gestureIds.value) nodes.add(id)
  const edges = new Set<string>()
  for (const id of previewIds.value) {
    nodes.add(id)
    for (const edgeId of incidentEdges.value.get(id) ?? []) edges.add(edgeId)
  }
  if (reshapeId.value !== undefined) edges.add(reshapeId.value)
  if (draft.value) nodes.add(draft.value.fixed.node)
  if (focused.value?.node) nodes.add(focused.value.node)
  const editing = labelEditor.value
  if (editing) (editing.kind === 'node' ? nodes : edges).add(editing.id)
  for (const id of [currentEdgeId.value, draft.value?.edge?.id, focused.value?.edge]) if (id) edges.add(id)
  if (props.edgesSelectable) for (const id of props.selectedEdgeIds ?? []) edges.add(id)
  return cullGraphElements(bounds, view, { nodes, edges })
})
// The groups that hold a node of the current gesture: the group listing it and that group's ancestors.
const gestureGroups = computed(() => {
  const tree = groupTree.value
  const ids = new Set<string>()
  for (const id of gestureIds.value) addGroupChain(tree, tree.ofNode.get(id), ids)
  return ids
})
// Groups near the view, focused or holding a node of the current gesture. Group frames follow a drag, so this is
// kept apart from the node and edge culling above.
const visibleGroups = computed<ReadonlySet<string> | undefined>((previous) => {
  const view = cullView.value
  if (!view) return undefined
  const groups = new Set<string>()
  for (const group of shownGroups.value) {
    // Touching counts, as in cullGraphElements: a frame on the view edge still draws its stroke into the view.
    const near = group.x <= view.x + view.width && group.x + group.width >= view.x
      && group.y <= view.y + view.height && group.y + group.height >= view.y
    if (near || focused.value?.group === group.id || gestureGroups.value.has(group.id)) groups.add(group.id)
  }
  // The previous set while the same groups are near, so a drag inside the view does not render the group list again.
  return keepIds(previous, groups)
})
const visibleNodes = computed(() => visible.value ? viewNodes.value.filter(node => visible.value!.nodes.has(node.id)) : undefined)
const shownEdges = computed(() => visible.value ? viewEdges.value.filter(edge => visible.value!.edges.has(edge.id)) : viewEdges.value)
const renderedGroups = computed(() => visibleGroups.value ? shownGroups.value.filter(group => visibleGroups.value!.has(group.id)) : shownGroups.value)

// Two-finger pinch zoom and pan. Only touch pointers take part; mouse and pen input is unchanged.
const touches = new Map<number, GraphPoint>()
let pinch: { ids: number[]; distance: number; midpoint: GraphPoint; camera: GraphViewport } | undefined
const pinching = ref(false)
function endPinch() {
  const previous = pinch
  pinch = undefined
  pinching.value = false
  for (const id of previous?.ids ?? []) releasePointer(svg.value, id)
}
function startTouch(event: PointerEvent) {
  if (event.pointerType !== 'touch' || !svg.value) return
  touches.set(event.pointerId, { x: event.clientX, y: event.clientY })
  if (touches.size !== 2) return
  // A second finger turns the gesture into a camera gesture and cancels any one-finger edit in flight.
  cancelInteraction()
  const ids = [...touches.keys()], [a, b] = [...touches.values()] as [GraphPoint, GraphPoint]
  for (const id of ids) capturePointer(svg.value, id)
  pinch = {
    ids, distance: Math.hypot(a.x - b.x, a.y - b.y), midpoint: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
    camera: { ...camera.value },
  }
  pinching.value = true
  beginGesture('pointer', 'pinch')
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
  const start = pinch.camera
  // The world point under the initial midpoint follows the current midpoint.
  placeCamera(pinchCamera(start, pinch.midpoint, a, b, svg.value.getBoundingClientRect(), clampScale(start.scale * distance / pinch.distance)))
}
function endTouch(event: PointerEvent) {
  if (!touches.delete(event.pointerId)) return
  if (!pinch?.ids.includes(event.pointerId)) return
  endPinch()
  endGesture('pointer', event.type === 'pointerup' ? 'committed' : 'cancelled')
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
// Stage pointer events reach every gesture in turn; each handler ignores a pointer that is not its own.
function onStagePointerMove(event: PointerEvent) {
  trackPointer(event)
  moveTouch(event)
  movePan(event)
  moveNode(event)
  moveConnection(event)
  moveHandle(event)
}
function finishPointerGestures(event: PointerEvent) {
  stopPan(event)
  finishNodeDrag(event)
  finishConnection(event)
  finishHandle(event)
}
function onStagePointerEnd(event: PointerEvent) {
  endTouch(event)
  finishPointerGestures(event)
}
// The stage itself or one of its own nodes, edges, group labels and handles. Keys pressed in focusable slot content,
// such as an input in a custom node, keep their usual meaning.
function stageControl(element: EventTarget | null): element is Element {
  return element instanceof Element && (element === svg.value || element.matches('[data-vw-node],[data-vw-edge],[data-vw-group]'))
}
function editable(element: EventTarget | null) {
  return element instanceof Element && element.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])') !== null
}

// The items a key in the stage acts on (delete, copy, duplicate): a focused node or edge outside the selection alone,
// otherwise the selected nodes and edges.
function keyTargets(element: Element): { nodeIds: string[]; edgeIds: string[] } {
  const nodeId = elementNode(element), edgeId = element.getAttribute('data-vw-edge')
  if (nodeId !== null && !isSelected(nodeId)) return { nodeIds: [nodeId], edgeIds: [] }
  if (edgeId !== null && !(props.edgesSelectable && edgeSelected(edgeId))) return { nodeIds: [], edgeIds: [edgeId] }
  return { nodeIds: [...selectedNodeIds()], edgeIds: selectedEdgeList() }
}

// Delete proposals of the key targets.
function deletionFor(element: Element): GraphDeletion | undefined {
  let { nodeIds, edgeIds } = keyTargets(element)
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
  const reason = checkProposal(props.validateDelete?.(deletion), messages.value.deleteRejected!)
  if (reason !== undefined) {
    emit('delete-rejected', deletion, reason)
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
  const dragging = Boolean(
    dragPreview.value || resizePreview.value || reshapePreview.value || connectionPoint.value || boxPreview.value || lassoPreview.value || pinch,
  )
  if (pointerGestureActive()) cancelInteraction()
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
  return cameraCenter(camera.value, viewport.value)
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
  const targets = keyTargets(element)
  const nodes = new Set(targets.nodeIds), edges = new Set(targets.edgeIds)
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
  if (!['none', 'dots', 'lines'].includes(props.background)) throw new RangeError('Unknown NetworkGraph background: ' + props.background)
  if (!['curve', 'orthogonal', 'straight'].includes(props.edgeStyle)) throw new RangeError('Unknown edge style: ' + props.edgeStyle)
  const lod = props.lodThreshold
  if (lod !== undefined && (!Number.isFinite(lod) || lod <= 0 || lod > 3)) throw new RangeError('lodThreshold must be a finite scale greater than 0 and at most 3')
  if (props.resizable) void minimumSize.value
  void lassoMode.value
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
// The background and the group frames, one layer each below the edges. The optional background is the first layer, so
// the markup without a background is unchanged. Each group layer reads the frame of its group from a shallow ref of
// its own, so a drag preview re-renders only the frames it changes, and the list renders again only when the groups,
// the rendered set, the direction, `draggable` or the background change.
const frameRefs = new Map<string, ShallowRef<ShownGroup>>()
watch(shownGroups, (list) => {
  for (const group of list) {
    const entry = frameRefs.get(group.id)
    if (!entry) frameRefs.set(group.id, shallowRef(group))
    else if (entry.value !== group) entry.value = group
  }
  if (frameRefs.size === list.length) return
  const ids = new Set(list.map(group => group.id))
  for (const id of [...frameRefs.keys()]) if (!ids.has(id)) frameRefs.delete(id)
}, { immediate: true })
type GroupLayerProps = { frame: ShallowRef<ShownGroup>; rtl: boolean; draggable: boolean; name?: string; slot?: unknown }
const GroupLayer: FunctionalComponent<GroupLayerProps> = ({ frame, rtl, draggable, name, slot }, { slots }) => {
  const group = frame.value
  // The label is the move handle. With the group slot, which draws the frame and label itself, a transparent strip
  // over the top of the frame takes its place.
  const handle = {
    role: draggable ? 'button' : undefined, 'data-vw-group': group.id,
    tabindex: draggable ? 0 : undefined, 'aria-label': draggable ? name : undefined,
    onPointerdown: withModifiers((event: Event) => startNodeDrag(event as PointerEvent, group.members, undefined, group.id), ['stop']),
    onClick: (event: MouseEvent) => activateGroup(group.id, event),
    onKeydown: [
      (event: KeyboardEvent) => moveWithKeys(event, group.members),
      withKeys(withModifiers((event: Event) => activateGroup(group.id, event), ['self', 'prevent']), ['enter']),
      withKeys(withModifiers((event: Event) => activateGroup(group.id, event), ['self', 'prevent']), ['space']),
    ],
  }
  const custom = Boolean(slot && slots.group)
  return h('g', {
    class: custom ? 'vw-network-group vw-has-slot' : 'vw-network-group', 'aria-hidden': undefined,
    onPointerenter: () => emitTarget('target-enter', groupTarget(group.id), 'pointer'),
    onPointerleave: () => emitTarget('target-leave', groupTarget(group.id), 'pointer'),
  }, custom ? [
    renderSlot(slots, 'group', {
      group: viewGroupsById.value.get(group.id), box: { x: group.x, y: group.y, width: group.width, height: group.height }, depth: group.depth,
    }),
    h('rect', { class: 'vw-group-handle', x: group.x, y: group.y, width: group.width, height: Math.min(group.height, 20), ...handle }),
  ] : [
    h('rect', { x: group.x, y: group.y, width: group.width, height: group.height, rx: '10' }),
    h('text', { x: rtl ? group.x + group.width - 8 : group.x + 8, y: group.y + 15, ...handle }, toDisplayString(group.label)),
  ])
}
GroupLayer.props = ['frame', 'rtl', 'draggable', 'name', 'slot']
// The groups the group slot receives: the shown groups as given (or as collapsing leaves them), by ID.
const viewGroupsById = computed(() => new Map((viewGroups.value ?? []).map(group => [group.id, group as G])))
const GroupLayers: FunctionalComponent<{ groupSlot?: typeof slots.group }> = ({ groupSlot }) => {
  const layers: VNode[] = []
  const area = pattern.value
  if (area) {
    const { cell, dot } = area
    layers.push(h('g', { key: 'background', class: 'vw-network-backdrop', 'aria-hidden': 'true' }, [
      h('pattern', { id: patternId, patternUnits: 'userSpaceOnUse', x: -cell / 2, y: -cell / 2, width: cell, height: cell }, [
        props.background === 'dots'
          ? h('circle', { class: 'vw-network-pattern', cx: cell / 2, cy: cell / 2, r: dot })
          : h('path', { class: 'vw-network-pattern', 'stroke-width': dot, d: `M ${cell / 2} 0 V ${cell} M 0 ${cell / 2} H ${cell}` }),
      ]),
      h('rect', { class: 'vw-network-background', ...area.area, fill: `url(#${patternId})` }),
    ]))
  }
  // Swimlanes: one layer above the background and below the groups, only with `lanes`.
  const laneList = laneBands.value, poolList = poolBands.value
  if (poolList) layers.push(h('g', { key: 'lanes', class: 'vw-swimlanes' }, poolLanes(poolList, laneList ?? [])))
  else if (laneList) layers.push(h('g', { key: 'lanes', class: 'vw-swimlanes' }, laneList.map((lane, index) => laneNode(lane, index))))
  const shown = visibleGroups.value, draggable = props.draggable, right = rtl.value
  for (const group of groupMembership.value) {
    if (shown && !shown.has(group.id)) continue
    layers.push(h(GroupLayer, {
      key: 'group:' + group.id, frame: frameRefs.get(group.id)!, rtl: right, draggable, name: draggable ? groupName(group) : undefined,
      slot: groupSlot,
    }, groupSlot ? { group: groupSlot, $stable: true } : undefined))
  }
  return layers
}
GroupLayers.props = ['groupSlot']
// A swimlane band with its header and its title, clipped to the header area. The band is its title's group.
function laneNode(lane: GraphSwimlaneBand, index: number) {
  const { header } = lane
  const parts = [h('rect', { class: 'vw-swimlane-band', x: lane.x, y: lane.y, width: lane.width, height: lane.height })]
  if (header.width > 0 && header.height > 0) {
    parts.push(
      h('rect', { class: 'vw-swimlane-header', x: header.x, y: header.y, width: header.width, height: header.height }),
      h('svg', { class: 'vw-swimlane-title', x: header.x, y: header.y, width: header.width, height: header.height, overflow: 'hidden' }, [
        h('text', { x: rtl.value ? header.width - 8 : 8, y: Math.min(header.height / 2, 14) + 4 }, toDisplayString(lane.label)),
      ]),
    )
  }
  return h('g', {
    key: lane.id, class: index % 2 ? 'vw-swimlane vw-is-alternate' : 'vw-swimlane', role: 'group', 'aria-label': lane.label, 'data-vw-lane': lane.id,
  }, parts)
}

// Pools, each a group with its frame, its title band and its own lanes; lanes of no pool follow them.
function poolLanes(pools: readonly GraphSwimlanePoolBand[], lanes: readonly GraphSwimlaneBand[]) {
  const index = new Map(lanes.map((lane, position) => [lane.id, position]))
  const placed = new Set<string>()
  const nodes = pools.map((pool) => {
    const { header } = pool
    const parts = [h('rect', { class: 'vw-swimlane-pool-band', x: pool.x, y: pool.y, width: pool.width, height: pool.height })]
    if (header.width > 0 && header.height > 0) {
      const cx = header.width / 2, cy = header.height / 2
      parts.push(
        h('rect', { class: 'vw-swimlane-pool-header', x: header.x, y: header.y, width: header.width, height: header.height }),
        h('svg', { class: 'vw-swimlane-pool-title', x: header.x, y: header.y, width: header.width, height: header.height, overflow: 'hidden' }, [
          h('text', {
            x: cx, y: cy, 'text-anchor': 'middle', 'dominant-baseline': 'central',
            transform: header.height > header.width ? `rotate(-90 ${cx} ${cy})` : undefined,
          }, toDisplayString(pool.label)),
        ]),
      )
    }
    for (const id of pool.laneIds) {
      const position = index.get(id)
      if (position === undefined || placed.has(id)) continue
      placed.add(id)
      parts.push(laneNode(lanes[position]!, position))
    }
    return h('g', { key: 'pool:' + pool.id, class: 'vw-swimlane-pool', role: 'group', 'aria-label': pool.label, 'data-vw-pool': pool.id }, parts)
  })
  lanes.forEach((lane, position) => {
    if (!placed.has(lane.id)) nodes.push(laneNode(lane, position))
  })
  return nodes
}

// Tooltips. Only rendered after mounting and only when the tooltip slot is provided. Like a native tooltip, a press
// in the stage dismisses it until the pointer enters another element, so it never covers a node being clicked.
const mounted = ref(false)
const tooltipDelayValid = computed(() => {
  const delay = props.tooltipDelay
  if (!Number.isFinite(delay) || delay < 0) throw new RangeError('tooltipDelay must be a nonnegative finite number of milliseconds')
  return true
})
const tooltipBlocked = computed(() => Boolean(
  dragPreview.value || connectionPoint.value || boxPreview.value || lassoPreview.value || isPanning.value || pinching.value || draft.value
    || resizePreview.value || reshapePreview.value,
))
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
const {
  tooltip, hide: hideTooltip, hover: hoverTooltip, leave: leaveTooltip, keep: keepTooltip, focus: focusTooltip, blur: blurTooltip,
  dispose: disposeTooltip,
} = useNodeTooltip({
  hasSlot: () => Boolean(slots.tooltip), blocked: tooltipBlocked, gestureActive: pointerGestureActive, delay: () => props.tooltipDelay,
  pressing: () => pressing, elementNode, focusVisible,
  items: [nodesById, edgesById], exists: (kind, id) => (kind === 'node' ? nodesById.value : edgesById.value).has(id),
})
const tooltipView = computed(() => {
  const current = tooltip.value
  if (!current || !mounted.value || tooltipBlocked.value) return undefined
  let target: NetworkTooltipSlot<ShownNode, ShownEdge>['target'], item: StageEdges
  if (current.kind === 'node') {
    const node = nodesById.value.get(current.id), box = layout.value.boxes.get(current.id)
    if (!node || !box || (visible.value && !visible.value.nodes.has(node.id))) return undefined
    target = { kind: 'node', node }
    item = stageEdges(box, camera.value)
  } else {
    const edge = edgesById.value.get(current.id), path = layout.value.paths.get(current.id)
    if (!edge || path === undefined || (visible.value && !visible.value.edges.has(edge.id))) return undefined
    const point = edgeAnchor(edge.id)
    if (!point) return undefined
    target = { kind: 'edge', edge }
    const anchor = stagePoint(point, camera.value)
    item = { left: anchor.x, right: anchor.x, top: anchor.y + 6, bottom: anchor.y + 6 }
  }
  // After the element (before it in right-to-left), or on the other side when that has more room.
  const style = tooltipPlacement(item, viewport.value, rtl.value)
  return style && { target, style }
})
// The element the shown tooltip describes (its `aria-describedby`). Unlike tooltipView, it does not change while the
// camera moves.
const described = computed(() => tooltipView.value && tooltip.value ? tooltip.value : undefined)

// Nodes and edges are components of their own, so a drag or a pan re-renders only those whose props changed. The
// lists render the same markup the template rendered inline. Handlers are shared and stable, so they never count as
// a change. A slot is passed both as the slot and as a prop: a new slot function re-renders every item. The items are
// functional components: they keep no state, and they mount faster than components with a setup.
const nodeActions = {
  enter: (id: string) => {
    hoverTooltip('node', id)
    emitTarget('target-enter', nodeTarget(id), 'pointer')
  },
  leave: (id: string) => {
    leaveTooltip()
    emitTarget('target-leave', nodeTarget(id), 'pointer')
  },
  startDrag: (event: PointerEvent, id: string) => startNodeDrag(event, movingIds(id), id),
  click: clickNode,
  moveWithKeys: (event: KeyboardEvent, id: string) => moveWithKeys(event, movingIds(id), id),
  select,
  editLabel: (event: Event, id: string) => openLabelEditor('node', id, event),
}
const edgeActions = {
  enter: (id: string) => {
    hoverTooltip('edge', id)
    emitTarget('target-enter', edgeTarget(id), 'pointer')
  },
  leave: (id: string) => {
    leaveTooltip()
    emitTarget('target-leave', edgeTarget(id), 'pointer')
  },
  select: selectEdge,
  editLabel: (event: Event, id: string) => openLabelEditor('edge', id, event),
}

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
  if (!entry) boxRefs.set(id, entry = shallowRef(savedGeometry.value.boxes.get(id)!))
  return entry
}
function edgeRef(id: string) {
  let entry = edgeRefs.get(id)
  if (!entry) edgeRefs.set(id, entry = shallowRef(edgeGeometry(savedGeometry.value, id)!))
  return entry
}
type NodeItemProps = {
  node: NetworkNode
  box: ShallowRef<GraphBox>
  selected: boolean
  draggable: boolean
  related: boolean
  dimmed: boolean
  highlighted: boolean
  describedby?: string
  /** Values shared by every node, in one object that keeps its identity while they do not change. */
  shared: {
    /** Renders the native `<title>`; false while a tooltip slot replaces it. */
    title: boolean
    /** Marks the node group so the stylesheet leaves the content of the `node` slot unpainted (`unstyledNodeSlots`). */
    unstyled: boolean
    rtl: boolean
    /** The camera scale for the `node` slot; 0 without a slot, so zooming does not re-render default nodes. */
    scale: number
    /** The parent's `node` slot, so that a new slot function re-renders every node. */
    slot?: unknown
    actions: typeof nodeActions
  }
}
// One node: a focusable group with a native title and the `node` slot, or the default box, label and detail.
const NodeItem: FunctionalComponent<NodeItemProps> = (item, { slots }) => {
  const { node, shared } = item, box = item.box.value, actions = shared.actions
  const selected = Boolean(item.selected), dimmed = Boolean(item.dimmed)
  const select = (event: Event) => actions.select(node.id, event as KeyboardEvent)
  return h('g', {
    class: ['vw-network-node', [`vw-tone-${node.tone ?? 'blue'}`, {
      'vw-is-selected': selected, 'vw-is-draggable': Boolean(item.draggable), 'vw-is-related': Boolean(item.related), 'vw-dimmed': dimmed,
      'vw-is-highlighted': Boolean(item.highlighted), 'vw-is-unstyled': shared.unstyled,
    }]],
    'data-vw-node': node.id, transform: `translate(${box.x} ${box.y})`, role: 'button', tabindex: '0',
    'aria-label': [node.label, node.detail].filter(Boolean).join(' '), 'aria-pressed': selected, 'aria-describedby': item.describedby,
    onPointerenter: () => actions.enter(node.id),
    onPointerleave: () => actions.leave(node.id),
    onPointerdown: withModifiers((event: Event) => actions.startDrag(event as PointerEvent, node.id), ['stop']),
    onClick: (event: MouseEvent) => actions.click(node.id, event),
    onDblclick: (event: MouseEvent) => actions.editLabel(event, node.id),
    onKeydown: [
      withModifiers((event: Event) => node.draggable !== false && actions.moveWithKeys(event as KeyboardEvent, node.id), ['self']),
      withKeys(withModifiers(select, ['self', 'prevent']), ['enter']),
      withKeys(withModifiers(select, ['self', 'prevent']), ['space']),
      withKeys(withModifiers((event: Event) => actions.editLabel(event, node.id), ['self']), ['f2']),
    ],
  }, [
    shared.title ? h('title', null, toDisplayString(node.label) + ' ' + toDisplayString(node.detail)) : createCommentVNode('', true),
    renderSlot(slots, 'node', {
      node: { ...node, box }, box, selected, dimmed, related: Boolean(item.related), highlighted: Boolean(item.highlighted), scale: shared.scale,
    }, () => [h('svg', { width: box.width, height: box.height, overflow: 'hidden' }, defaultNode(node, box, shared.rtl)), ...belowLabel(node, box)]),
  ])
}
NodeItem.props = ['node', 'box', 'selected', 'draggable', 'related', 'dimmed', 'highlighted', 'describedby', 'shared']

type EdgeItemProps = {
  edge: GraphEdge
  /** The path and the label anchor; the anchor is undefined when the layout has none. */
  geometry: ShallowRef<EdgeGeometry>
  related: boolean
  dimmed: boolean
  highlighted: boolean
  /** Selected through `selectedEdgeIds` (only with `edgesSelectable`). */
  selected: boolean
  active: boolean
  pressed: boolean
  describedby?: string
  /** The band drawing of the edge, from `edgeBands`. */
  band?: GraphEdgeBand
  /** Values shared by every edge, in one object that keeps its identity while they do not change. */
  shared: {
    /** Sets `data-vw-edge` on the group, for context menus. */
    menu: boolean
    /** Renders the focusable hit area. */
    hit: boolean
    /** The accessible name prefix of the hit area. */
    name: string | undefined
    marker: string
    /** The camera scale for the `edge` slot; 0 without a slot, so zooming does not re-render default edges. */
    scale: number
    /** The parent's `edge` slot, so that a new slot function re-renders every edge. */
    slot?: unknown
    actions: typeof edgeActions
  }
}
// One edge: the `edge` slot or the default path and label, and the focusable hit area when edges can be selected.
const EdgeItem: FunctionalComponent<EdgeItemProps> = (item, { slots }) => {
  const { edge, shared, band } = item, { path, labelX, labelY } = item.geometry.value, actions = shared.actions
  const related = Boolean(item.related), dimmed = Boolean(item.dimmed), selected = Boolean(item.selected)
  const bandWidth = band && band.width + 'px'
  const select = (event: Event) => actions.select(edge.id, event as MouseEvent | KeyboardEvent)
  return h('g', {
    class: { 'vw-dimmed': dimmed, 'vw-edge-selected': selected, 'vw-is-highlighted': Boolean(item.highlighted) },
    'data-vw-edge': shared.menu ? edge.id : undefined,
    onPointerenter: () => actions.enter(edge.id),
    onPointerleave: () => actions.leave(edge.id),
    onDblclick: (event: MouseEvent) => actions.editLabel(event, edge.id),
  }, [
    renderSlot(slots, 'edge', { edge, path, selected, related, highlighted: Boolean(item.highlighted), dimmed, scale: shared.scale, ...band && { band } }, () => [
      band ? h('path', {
        class: ['vw-network-edge vw-network-band', { 'vw-is-related': related, 'vw-is-reference': Boolean(band.reference) }], d: path,
        style: band.reference ? { strokeWidth: bandWidth, '--vw-band-dash': graphReferenceDash(band.width, path) } : { strokeWidth: bandWidth },
      }) : h('path', {
        class: ['vw-network-edge', { 'vw-is-related': related, 'vw-is-animated': Boolean(edge.animated), 'vw-is-dashed': Boolean(edge.dashed && !edge.animated) }], d: path,
        'marker-start': markerUrl(shared.marker, edge, 'start'), 'marker-end': markerUrl(shared.marker, edge, 'end'),
      }),
      edge.label && labelX !== undefined
        ? h('text', { key: 0, class: 'vw-edge-label', x: labelX, y: labelY }, toDisplayString(edge.label))
        : createCommentVNode('', true),
    ]),
    shared.hit ? h('path', {
      key: 0, class: ['vw-edge-hit', { 'vw-is-active': Boolean(item.active), 'vw-is-selected': selected, 'vw-is-band': Boolean(band) }],
      ...band && { style: { strokeWidth: Math.max(14, band.width) + 'px' } },
      d: path, role: 'button', tabindex: '0', 'aria-label': shared.name + ' ' + (band?.label ?? edge.label ?? edge.id),
      'aria-pressed': Boolean(item.pressed), 'aria-describedby': item.describedby, 'data-vw-edge': edge.id,
      onPointerdown: withModifiers(() => {}, ['stop']),
      onClick: select,
      onKeydown: [
        withKeys(withModifiers(select, ['prevent']), ['enter']), withKeys(withModifiers(select, ['prevent']), ['space']),
        withKeys((event: Event) => actions.editLabel(event, edge.id), ['f2']),
      ],
    }) : createCommentVNode('', true),
  ])
}
EdgeItem.props = ['edge', 'geometry', 'related', 'dimmed', 'highlighted', 'selected', 'active', 'pressed', 'describedby', 'band', 'shared']

// The markers the edges use besides the default end arrow (see usedMarkers).
const extraMarkers = computed(() => usedMarkers(viewEdges.value, marker))
const markersKey = Symbol('markers')
// Slots are not reactive, so the template passes them in: a slot that appears, disappears or is replaced (an inline
// render function) re-renders the list, and a compiled slot keeps its identity.
type ListProps<S> = { itemSlot?: S; tooltips: boolean }
// The shared props of the items keep their identity while every value is the same (see keep).
let nodeShared: NodeItemProps['shared'] | undefined
let edgeShared: EdgeItemProps['shared'] | undefined
const NodeList: FunctionalComponent<ListProps<typeof slots.node>> = ({ itemSlot: nodeSlot, tooltips: tooltipSlot }) => {
  const shown = tooltipSlot ? described.value : undefined
  const shared = nodeShared = keep(nodeShared, {
    title: !tooltipSlot, unstyled: Boolean(nodeSlot && props.unstyledNodeSlots), rtl: rtl.value, scale: nodeSlot ? camera.value.scale : 0,
    slot: nodeSlot, actions: nodeActions,
  })
  const draggable = props.draggable, related = props.relatedIds, highlighted = highlights.value?.nodes
  const selected = selectionTest(), dimmed = dimTest()
  return (visibleNodes.value ?? viewNodes.value).map(node => h(NodeItem, {
    key: node.id, node, box: boxRef(node.id), selected: selected(node.id), draggable: draggable && node.draggable !== false,
    related: Boolean(related?.has(node.id)), dimmed: dimmed(node.id), highlighted: Boolean(highlighted?.has(node.id)),
    describedby: shown?.kind === 'node' && shown.id === node.id ? tooltipId : undefined, shared,
  }, nodeSlot ? { node: nodeSlot, $stable: true } : undefined))
}
const EdgeList: FunctionalComponent<ListProps<typeof slots.edge>> = ({ itemSlot: edgeSlot, tooltips: tooltipSlot }) => {
  const shown = tooltipSlot ? described.value : undefined
  const hit = Boolean(props.reconnectable || props.edgesSelectable || props.editableEdges || props.editableLabels)
  const shared = edgeShared = keep(edgeShared, {
    menu: props.contextMenu, hit, name: messages.value.selectEdge, marker, scale: edgeSlot ? camera.value.scale : 0,
    slot: edgeSlot, actions: edgeActions,
  })
  const selectable = props.edgesSelectable, active = currentEdgeId.value, related = props.relatedIds, highlighted = highlights.value?.edges
  const dimmed = dimTest(), selected = edgeSelectionTest(), pressed = edgePressedTest()
  const markers = extraMarkers.value
  const bands = edgeBands.value
  const items = (bands ? graphBandOrder(shownEdges.value, bands) : shownEdges.value).map(edge => h(EdgeItem, {
    key: edge.id, edge, geometry: edgeRef(edge.id),
    related: Boolean(related?.has(edge.from) && related.has(edge.to)), dimmed: dimmed(edge.from) || dimmed(edge.to),
    highlighted: Boolean(highlighted?.has(edge.id)),
    selected: Boolean(selectable && selected(edge.id)), active: hit && active === edge.id, pressed: hit && pressed(edge.id),
    describedby: shown?.kind === 'edge' && shown.id === edge.id ? tooltipId : undefined, band: bands?.get(edge.id), shared,
  }, edgeSlot ? { edge: edgeSlot, $stable: true } : undefined))
  // An edge slot draws its own edges, so the markers are only written for the default renderer.
  return markers.length && !edgeSlot ? [h('defs', { key: markersKey }, markers.map(([id, { kind, end }]) => markerNode(id, kind, end))), ...items] : items
}

NodeList.props = EdgeList.props = ['itemSlot', 'tooltips']

// The minimap rectangles and the connection handles are items of their own too. Each reads the box ref of its node,
// so a drag preview re-renders the items of the moved nodes, and the lists render again only when the nodes, the
// selection or the connection draft change.
type MinimapNodeProps = { node: ShownNode; box: ShallowRef<GraphBox>; selected: boolean; slot?: unknown }
// One minimap rectangle, or the `minimap-node` slot drawn in chart coordinates inside a group that keeps the
// stylesheet's rectangle paint off it.
const MinimapNode: FunctionalComponent<MinimapNodeProps> = ({ node, box, selected, slot }, { slots }) => {
  const { x, y, width, height } = box.value
  if (slot && slots['minimap-node']) {
    return h('g', { class: ['vw-minimap-custom', { 'vw-is-selected': selected }] }, [renderSlot(slots, 'minimap-node', { node, box: box.value, selected })])
  }
  return h('rect', { class: { 'vw-is-selected': selected }, x, y, width, height, rx: '3' })
}
MinimapNode.props = ['node', 'box', 'selected', 'slot']
// With `lanes`, the minimap draws the lane outlines first.
const lanesKey = Symbol('lanes')
const MinimapNodes: FunctionalComponent<{ itemSlot?: typeof slots['minimap-node'] }> = ({ itemSlot }) => {
  const selected = selectedTest.value
  const items = viewNodes.value.map(node => h(MinimapNode, {
    key: node.id, node, box: boxRef(node.id), selected: selected(node.id), slot: itemSlot,
  }, itemSlot ? { 'minimap-node': itemSlot, $stable: true } : undefined))
  const laneList = laneBands.value
  return laneList ? [h('g', { key: lanesKey, class: 'vw-minimap-lanes' }, laneList.map(lane => h('rect', {
    key: lane.id, class: 'vw-minimap-lane', x: lane.x, y: lane.y, width: lane.width, height: lane.height,
  }))), ...items] : items
}
MinimapNodes.props = ['itemSlot']
// `hint` is set only with `connectionRules` while a connection is in progress: true for a valid target, or the reason
// (possibly empty) why the handle is not one.
type HandleProps = {
  node: NetworkNode; port?: GraphPort; box: ShallowRef<GraphBox>; rl: boolean; pressed?: boolean; prefix?: string; hint?: true | string
}
const HandleCircle: FunctionalComponent<HandleProps> = ({ node, port, box, rl, pressed, prefix, hint }) => {
  const handle = connectHandle(node, port, box.value, rl)
  const activate = (event: Event) => (props.connectable || draft.value) && activatePort(handle, event as MouseEvent | KeyboardEvent)
  return h('circle', {
    class: ['vw-connect-handle', { 'vw-is-active': pressed, 'vw-is-valid-target': hint === true, 'vw-is-invalid-target': typeof hint === 'string' }],
    'data-vw-node': handle.node, 'data-vw-port': portKey(handle),
    cx: handle.x, cy: handle.y, r: '6', role: 'button', tabindex: '0', 'aria-label': `${prefix} ${handle.label}`,
    'aria-pressed': Boolean(pressed), 'aria-description': typeof hint === 'string' && hint ? hint : undefined,
    onPointerdown: withModifiers((event: Event) => props.connectable && startPort(event as PointerEvent, handle), ['stop']),
    onClick: withModifiers(activate, ['stop']),
    onKeydown: [withKeys(withModifiers(activate, ['stop', 'prevent']), ['enter']), withKeys(withModifiers(activate, ['stop', 'prevent']), ['space'])],
  })
}
HandleCircle.props = ['node', 'port', 'box', 'rl', 'pressed', 'prefix', 'hint']
const HandleNodes: FunctionalComponent = () => {
  const rl = direction.value === 'RL', pending = draft.value, fixed = pending && portKey(pending.fixed)
  const { connectTo, connectFrom } = messages.value
  const hint = pending && connectionHints(pending)
  const list = []
  for (const node of visibleNodes.value ?? viewNodes.value) {
    const box = boxRef(node.id)
    for (const port of node.ports ?? [undefined]) {
      const key = portKey({ node: node.id, port: port?.id })
      const pressed = pending && fixed === key
      list.push(h(HandleCircle, {
        key, node, port, box, rl, pressed, prefix: pending && !pressed ? connectTo : connectFrom,
        hint: hint && !pressed ? hint(node.id, port?.id) : undefined,
      }))
    }
  }
  return list
}
// With `connectionRules`, tells for each handle whether it completes the connection in progress: true, or the reason
// it does not (empty for a handle the component never connects, such as another handle of the fixed node).
function connectionHints(pending: ConnectionDraft): ((node: string, port: string | undefined) => true | string) | undefined {
  const checker = connectionChecker.value
  if (!checker) return undefined
  const targets = checker.targets({ ...pending.fixed, end: pending.end }, pending.edge?.id)
  return (node, port) => {
    if (node === pending.fixed.node) return ''
    if (port === undefined ? targets.nodeIds.has(node) && !targets.ports.has(node) : targets.ports.get(node)?.has(port)) return true
    const end: PortRef = { node, port }
    const connection = pending.end === 'from' ? connectionBetween(end, pending.fixed) : connectionBetween(pending.fixed, end)
    const result = checker.check(connection, pending.edge?.id)
    return result.ok ? true : result.reason
  }
}

watch(camera, value => emit('viewport-change', { ...value }))
function setViewport(value: GraphViewport) {
  cancelInteraction()
  if (![value.x, value.y].every(Number.isFinite) || !validScale(value.scale)) throw scaleError()
  placeCamera({ ...value })
}
function focusNode(id: string, options?: NetworkFocusOptions) {
  const box = layout.value.boxes.get(id)
  if (!box) throw new Error('Unknown node: ' + id)
  const scale = options?.scale ?? camera.value.scale
  if (!validScale(scale)) throw scaleError()
  cancelInteraction()
  placeCamera(graphCameraAt(rectCenter(box), viewport.value, scale))
}
/**
 * Brings a node into view: the camera centers it (at `options.scale`, else the current scale), then, after the next
 * render, `options.focus` moves keyboard focus to it. Resolves `hidden-by-collapse` with the proxy for a node hidden in
 * a collapsed group and `unknown` for an unknown ID, without moving the camera. Rejects only for a bad scale.
 */
async function revealNode(id: string, options: RevealOptions = {}): Promise<RevealResult> {
  if (!nodesById.value.has(id)) {
    const proxyId = realNodesById.value.has(id) ? collapsedView.value?.owners.get(id) : undefined
    return proxyId === undefined ? { status: 'unknown' } : { status: 'hidden-by-collapse', proxyId }
  }
  const box = layout.value.boxes.get(id)!
  const scale = options.scale ?? camera.value.scale
  if (!validScale(scale)) throw scaleError()
  cancelInteraction()
  placeCamera(graphCameraAt(rectCenter(box), viewport.value, scale))
  // Culling renders the node once the camera has moved, so focus waits for that render.
  await nextTick()
  if (options.focus) nodeElement(id)?.focus({ preventScroll: true })
  return { status: 'revealed' }
}
/**
 * The rectangle a node, edge or group occupies on screen, in CSS pixels relative to the viewport like
 * `getBoundingClientRect`. A collapsed group is its proxy node; an edge is the bounding box of its path. Undefined
 * before mount, for targets of other views and for unknown or hidden (collapsed) items. The rectangle may lie outside
 * the stage; it does not depend on culling.
 */
function getTargetClientRect(target: ViewTarget): DOMRect | undefined {
  if (!mounted.value || !svg.value || !target || target.view !== 'graph') return undefined
  const geometry = layout.value
  let rect: GraphRect | undefined
  if (target.kind === 'node' || (target.kind === 'group' && collapsedView.value?.proxies.has(target.id))) {
    rect = nodesById.value.has(target.id) ? geometry.boxes.get(target.id) : undefined
  } else if (target.kind === 'edge') {
    const path = edgesById.value.has(target.id) ? geometry.paths.get(target.id) : undefined
    try {
      rect = path === undefined ? undefined : graphPathBounds(path)
    } catch {
      rect = undefined
    }
  } else if (target.kind === 'group') {
    rect = shownGroups.value.find(group => group.id === target.id)
  }
  if (!rect) return undefined
  const { x, y, scale } = camera.value
  const left = x + rect.x * scale, top = y + rect.y * scale, right = left + rect.width * scale, bottom = top + rect.height * scale
  const transform = svg.value.getScreenCTM()
  if (!transform) {
    const stage = svg.value.getBoundingClientRect()
    return new DOMRect(stage.left + left, stage.top + top, right - left, bottom - top)
  }
  const a = new DOMPoint(left, top).matrixTransform(transform), b = new DOMPoint(right, bottom).matrixTransform(transform)
  return new DOMRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y))
}
/**
 * Centers the camera on a chart point at `scale` (default: the current scale), the container-independent counterpart
 * of `getViewportCenter()` and `getViewport().scale`. Called before the stage is measured, the centre is applied again
 * to the measured size unless the camera has moved since.
 */
function setViewportCenter(center: GraphPoint, scale = camera.value.scale) {
  if (!center || !Number.isFinite(center.x) || !Number.isFinite(center.y)) throw new RangeError('setViewportCenter requires a finite center point')
  if (!validScale(scale)) throw scaleError()
  cancelInteraction()
  placeCamera(graphCameraAt(center, viewport.value, scale))
  pendingCenter = measured ? undefined : { center: { x: center.x, y: center.y }, scale, camera: toRaw(camera.value) }
}
let measured = false
let pendingCenter: { center: GraphPoint; scale: number; camera: GraphViewport } | undefined
/** A standalone SVG document of the whole graph with the default rendering and the current theme colours. */
function exportSvg(options: GraphExportOptions<ShownNode, ShownEdge> = {}) {
  const { includeSelection = true, includeHighlight = true, theme, ...rest } = options
  const selection = !includeSelection ? [] : selectedNodeIds()
  const highlighted = includeHighlight ? highlights.value : undefined
  const highlightColor = root.value && getComputedStyle(root.value).getPropertyValue('--vw-graph-highlight').trim()
  return renderGraphSvg(layout.value, viewNodes.value, viewEdges.value, {
    idPrefix: 'vw-export-' + marker.replace(/[^\w-]/g, ''),
    ...rest,
    groups: shownGroups.value.map(({ id, label, x, y, width, height }) => ({ id, label, x, y, width, height })),
    ...laneBands.value && { lanes: laneBands.value },
    ...poolBands.value && { pools: poolBands.value },
    ...edgeBands.value && { edgeBands: edgeBands.value },
    selectedIds: selection,
    ...highlighted && { highlightedNodeIds: highlighted.nodes, highlightedEdgeIds: highlighted.edges },
    ...highlightColor && { highlightColor },
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
  revealNode, getTargetClientRect, setViewportCenter,
})

// A new layout cancels a gesture in flight. A layout function that returns a new object with the same geometry for the
// same inputs (an asynchronous layout cache, for example) does not: nothing the gesture depends on has changed.
watch(
  () => [savedRouted.value, viewNodes.value, viewEdges.value, viewPositions.value, props.sizes, routeOptions.value, policy.value, props.layout, options.value] as const,
  (next, previous) => {
    if (next[0] === previous[0]) return
    if (next.every((value, i) => i === 0 || value === previous[i]) && sameGeometry(next[0], previous[0])) return
    cancelInteraction()
  },
)
watch(() => [props.draggable, props.connectable, props.reconnectable, props.boxSelect, groupMembership.value, props.editableEdges, props.resizable], cancelInteraction)
watch(lassoMode, cancelInteraction)
// New data or a new layout cancels an open label editor without a proposal; keyboard focus returns to the item.
watch(() => [viewNodes.value, viewEdges.value, savedRouted.value, props.editableLabels], () => {
  if (labelEditor.value) closeLabelEditor(false, document.activeElement === labelInput.value)
})
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
  camera.value = zoomAround(current, scale, viewport.value.width / 2, viewport.value.height / 2)
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
    // A centre restored before the first measurement keeps its chart point at the centre of the measured stage.
    const pending = pendingCenter
    pendingCenter = undefined
    measured = true
    if (pending && fitMode.value === 'manual' && toRaw(camera.value) === pending.camera) {
      camera.value = graphCameraAt(pending.center, size, clampScale(pending.scale))
    } else if (fitMode.value !== 'manual') camera.value = fitCamera(fitMode.value === 'overview')
  })
  observer.observe(svg.value)
})
// A gesture in flight ends while the parent's listeners are still attached, so a parent counting gestures never
// keeps one open after the graph is removed.
onBeforeUnmount(() => {
  endGesture('pointer', 'cancelled')
  endGesture('connection', 'cancelled')
})
onUnmounted(() => {
  cancelInteraction()
  observer?.disconnect()
  directionObserver?.disconnect()
  directionObserver = undefined
  disposeTooltip()
})
</script>

<template>
  <div ref="root" class="vw-network" :class="{ 'vw-rtl': rtl, 'vw-network-patterned': pattern, 'vw-lod-low': lodLow, 'vw-labels-editable': editableLabels }" :dir="dir === 'rtl' ? 'rtl' : undefined">
    <svg
      ref="svg" class="vw-network-stage" :style="{ height: typeof height === 'number' ? height + 'px' : height }" :class="{ 'vw-is-panning': isPanning }"
      :aria-label="messages.region" tabindex="0"
      @keydown.self="panWithKeys" @keydown.esc="cancelInteraction(); hideTooltip()" @keydown="onStageKeydown" @contextmenu="openContextMenu"
      @focusin="trackFocus($event); focusTooltip($event); enterWithFocus($event)" @focusout="releaseFocus($event); blurTooltip(); leaveWithFocus()"
      @wheel="onWheel" @pointerdown.capture="pressStage($event); trackPointer($event)" @pointerdown="startPan"
      @pointermove="onStagePointerMove" @pointerleave="forgetPointer"
      @pointerup="onStagePointerEnd" @pointercancel="onStagePointerEnd" @lostpointercapture="finishPointerGestures"
      @dragenter="acceptDrag" @dragover="acceptDrag" @drop="dropOnStage"
    >
      <defs>
        <marker :id="marker" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
          <path d="M 0 0 L 7 3.5 L 0 7 z" fill="context-stroke" />
        </marker>
      </defs>
      <g :transform="`translate(${camera.x} ${camera.y}) scale(${camera.scale})`">
        <GroupLayers :group-slot="$slots.group" />
        <EdgeList :item-slot="$slots.edge" :tooltips="Boolean($slots.tooltip)" />
        <NodeList :item-slot="$slots.node" :tooltips="Boolean($slots.tooltip)" />
        <path v-if="connectionPath && !overlay" class="vw-connection-preview" :d="connectionPath" />
        <!-- Guides only appear during a node drag, never with a connection preview, so they share its conditional. -->
        <GuideLines v-else-if="guideLines?.length && !overlay" />
        <!-- With collapsible groups, editable edges or resizable nodes, one overlay holds the previews and the handles,
          so the markup without those inputs is unchanged. -->
        <g v-else-if="overlay" class="vw-network-overlay">
          <path v-if="connectionPath" class="vw-connection-preview" :d="connectionPath" />
          <GuideLines v-if="guideLines?.length" />
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
        <polygon v-else-if="lassoPreview" class="vw-lasso-selection" :points="graphPolygonPoints(lassoPreview)" />
        <HandleNodes v-if="connectable || draft?.edge" />
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
    <input v-if="labelEditorView" ref="labelInput" v-model="labelDraft" class="vw-label-editor" :class="{ 'vw-is-edge': labelEditorView.edge }"
      type="text" dir="auto" autocomplete="off" :aria-label="labelEditorView.name" :style="labelEditorView.style"
      @keydown="labelKeydown" @blur="closeLabelEditor(true, false)">
    <div v-if="$slots['node-toolbar'] && nodeToolbarView" class="vw-node-toolbar" :class="{ 'vw-is-below': nodeToolbarView.below }"
      role="group" :aria-label="nodeToolbarView.name" :style="nodeToolbarView.style">
      <slot name="node-toolbar" v-bind="nodeToolbarView.slot" />
    </div>
    <div v-if="$slots['edge-toolbar'] && edgeToolbarView" class="vw-edge-toolbar" :class="{ 'vw-is-below': edgeToolbarView.below }"
      role="group" :aria-label="edgeToolbarView.name" :style="edgeToolbarView.style">
      <slot name="edge-toolbar" v-bind="edgeToolbarView.slot" />
    </div>
    <button v-if="showMinimap && nodes.length" type="button" class="vw-minimap" :aria-label="messages.minimap"
      @click="navigateMinimap" @keydown="panWithKeys">
      <svg :viewBox="`${contentBounds.left} ${contentBounds.top} ${contentBounds.width} ${contentBounds.height}`" aria-hidden="true">
        <MinimapNodes :item-slot="$slots['minimap-node']" />
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
