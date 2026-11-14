<script setup lang="ts">
import { computed, nextTick, ref, shallowRef, watch } from 'vue'
import { NetworkGraph, GanttChart, useEditHistory, layoutTreeGraph, layoutRadialGraph, graphDeletion, removeGraphElements, type GraphCrossingReduction, type GraphLayoutFunction, type GraphLayoutDirection, type TimelineEdit, type TimelineColumn, type TimelineCellEdit, type GraphPoint, type GraphNodeMove, type GraphConnection, type GraphReconnect, type GraphContextMenu, type GraphContextMenuTarget, type GraphDeletion, type GraphEdge, type NetworkGroup } from '../src'
import { cloneGraphElements, snapGraphPoint, type GraphCloneResult, type GraphClipboardSelection, type GraphDrop, type GraphPaste, type NetworkNode } from '../src'
import { collapseGraphGroups, type GraphEdgeReshape, type GraphEdgeStyle, type GraphNodeResize, type GraphNodeSize } from '../src'
import { makeExample, range, hour, formatTime } from './data'
import SchedulingDemo from './SchedulingDemo.vue'
import GanttEditingDemo from './GanttEditingDemo.vue'
import { download, imageSize } from './download'

const preset = ref('manufacturing')
// One history entry holds the data, saved positions and sizes and the collapsed groups, so Undo and Redo cover them all.
type DemoState = {
  data: ReturnType<typeof makeExample>; positions: ReadonlyMap<string, GraphPoint>; sizes: ReadonlyMap<string, GraphNodeSize>; collapsed: ReadonlySet<string>
}
const history = useEditHistory<DemoState>({ data: makeExample(preset.value), positions: new Map(), sizes: new Map(), collapsed: new Set() })
function commitState(change: Partial<DemoState>) {
  history.commit({ ...history.state.value, ...change })
}
const data = computed(() => history.state.value.data)
const positions = computed(() => history.state.value.positions)
const sizes = computed(() => history.state.value.sizes)
const collapsed = computed(() => history.state.value.collapsed)
const canUndo = history.canUndo
const canRedo = history.canRedo
const initialBars = ref(data.value.bars)
const selected = ref('split')
const direction = ref<GraphLayoutDirection>('LR')
const crossingReduction = ref<GraphCrossingReduction>('none')
const layoutKind = ref<'layered' | 'tree' | 'radial'>('layered')
const graphLayout = computed<GraphLayoutFunction | undefined>(() => layoutKind.value === 'tree'
  ? (n, e) => layoutTreeGraph(n, e, { direction: direction.value })
  : layoutKind.value === 'radial' ? (n, e) => layoutRadialGraph(n, e) : undefined)
const dark = ref(false)
const builtInTheme = ref<'' | 'vft-theme-dark' | 'vft-theme-auto'>('')
const custom = ref(false)
const locked = ref(false)
const graphEditing = ref(false)
const advancedTimeline = ref(false)
const group = { id: 'lots', label: 'Intermediate lots', nodeIds: ['lot1', 'lot2'] }
const groups = [group]
const nestedGroups = ref(false)
const nestedGroupList = [{ id: 'process', label: 'Process', nodeIds: ['raw', 'split'] }, { ...group, parentId: 'process' }]
const graphNodes = computed(() => data.value.nodes)
// Deleted nodes leave their groups; a group without members or child groups is dropped.
function presentGroups(list: NetworkGroup[]) {
  const present = new Set(graphNodes.value.map(node => node.id))
  if (list.every(item => item.nodeIds.every(id => present.has(id)))) return list
  let result = list.map(item => ({ ...item, nodeIds: item.nodeIds.filter(id => present.has(id)) }))
  while (true) {
    const parents = new Set(result.flatMap(item => item.parentId === undefined ? [] : [item.parentId]))
    const kept = result.filter(item => item.nodeIds.length || parents.has(item.id))
    if (kept.length === result.length) break
    result = kept
  }
  return result.length ? result : undefined
}
const graphGroups = computed(() => graphEditing.value && preset.value === 'manufacturing' ? presentGroups(nestedGroups.value ? nestedGroupList : groups) : undefined)
const query = ref('')
const matchIds = computed(() => {
  const text = query.value.trim().toLowerCase()
  return text ? new Set(data.value.nodes.filter(node => (node.label + ' ' + (node.detail ?? '')).toLowerCase().includes(text)).map(node => node.id)) : undefined
})
const graph = ref<InstanceType<typeof NetworkGraph>>()
function exportGraphSvg() {
  const svg = graph.value?.exportSvg({ title: 'Network' })
  if (!svg) return
  download(svg, 'network.svg')
  status.value = 'Exported network SVG (' + svg.length + ' characters).'
}
async function exportGraphPng() {
  try {
    const blob = await graph.value?.exportPng({ scale: 2 })
    if (!blob) return
    download(blob, 'network.png')
    status.value = 'Exported network PNG ' + await imageSize(blob) + '.'
  } catch (error) {
    status.value = error instanceof Error ? error.message : String(error)
  }
}
function findFirstMatch() {
  const first = matchIds.value?.values().next().value
  if (first !== undefined) graph.value?.focusNode(first, { scale: 1 })
}
const columns: TimelineColumn[] = [
  { id: 'note', label: 'Resource note', width: 110, value: row => row.detail ?? '', editable: row => row.id !== 'group' },
  { id: 'count', label: 'Intervals', width: 62, value: (_row, summary) => summary?.count ?? 0 },
]
const graphSelection = ref(new Set<string>())
const edgeSelection = ref(new Set<string>())
const collapsedRows = ref(new Set<string>())
const timelineRows = computed(() => advancedTimeline.value ? [
  { id: 'group', label: 'Production schedule' },
  ...data.value.rows.map(row => ({ ...row, parentId: 'group' })),
] : data.value.rows)
const baselines = computed(() => new Map(initialBars.value.map(bar => [
  bar.id, { start: Math.max(range.start, bar.start - hour / 2), end: Math.max(range.start, bar.end - hour / 2) },
])))
const timelineBars = computed(() => advancedTimeline.value ? data.value.bars.map(bar => ({
  ...bar, baseline: baselines.value.get(bar.id),
})) : data.value.bars)
const headerBands = [
  [{ start: range.start, end: range.end, label: 'Operating window · UTC' }],
  [{ start: range.start, end: range.start + 4 * hour, label: 'Morning shift' },
    { start: range.start + 4 * hour, end: range.end, label: 'Afternoon shift' }],
]
const markers = [{ id: 'review', time: range.start + 4.25 * hour, label: 'Shift review' }]
const status = ref('Select a node or a bar. Edit a planned interval to try the controlled API.')
const timeline = ref<InstanceType<typeof GanttChart>>()
const selectedBars = computed(() => new Set(data.value.bars.filter(bar => (bar.data ?? bar.id) === selected.value).map(bar => bar.id)))

function reset() {
  const example = makeExample(preset.value)
  history.reset({ data: example, positions: new Map(), sizes: new Map(), collapsed: new Set() })
  initialBars.value = example.bars
  graphSelection.value = new Set()
  edgeSelection.value = new Set()
  closeMenu(false)
  collapsedRows.value = new Set()
  selected.value = data.value.nodes[0]?.id ?? ''
  status.value = 'Example reset.'
}
function commitNodes(changes: GraphNodeMove[]) {
  const nextPositions = new Map(positions.value)
  for (const change of changes) nextPositions.set(change.id, change.after)
  commitState({ data: data.value, positions: nextPositions })
  status.value = changes.length === 1 ? 'Moved node ' + changes[0]!.id + '.' : 'Moved ' + changes.length + ' nodes.'
}
function validateConnection({ from, to, fromPort, toPort }: GraphConnection, replacing?: string) {
  if (collapsedView.value?.proxies.has(from) || collapsedView.value?.proxies.has(to)) return 'Expand the group to connect its nodes.'
  if (data.value.edges.some(edge => edge.id !== replacing && edge.from === from && edge.to === to
    && edge.fromPort === fromPort && edge.toPort === toPort)) return 'This connection already exists.'
}
function commitConnection(connection: GraphConnection) {
  let number = data.value.edges.length + 1
  while (data.value.edges.some(edge => edge.id === 'connection-' + number)) number++
  const edges = [...data.value.edges, { id: 'connection-' + number, ...connection }]
  commitState({ data: { ...data.value, edges }, positions: positions.value })
  status.value = 'Connected ' + connection.from + ' to ' + connection.to + '.'
}
function commitReconnect(change: GraphReconnect) {
  const edges = data.value.edges.map(edge => edge.id === change.id
    ? { ...edge, fromPort: undefined, toPort: undefined, ...change.after } : edge)
  commitState({ data: { ...data.value, edges }, positions: positions.value })
  status.value = 'Reconnected edge ' + change.id + '.'
}
function validateDelete(deletion: GraphDeletion) {
  if (deletion.nodeIds.length >= data.value.nodes.length) return 'Keep at least one node in the graph.'
}
function commitDeletion(deletion: GraphDeletion) {
  const { nodes, edges } = removeGraphElements(data.value.nodes, data.value.edges, deletion)
  const removed = new Set(deletion.nodeIds), removedEdges = new Set(deletion.edgeIds)
  const nextPositions = new Map([...positions.value].filter(([id]) => !removed.has(id)))
  const nextSizes = new Map([...sizes.value].filter(([id]) => !removed.has(id)))
  commitState({ data: { ...data.value, nodes, edges }, positions: nextPositions, sizes: nextSizes })
  graphSelection.value = new Set([...graphSelection.value].filter(id => !removed.has(id)))
  edgeSelection.value = new Set([...edgeSelection.value].filter(id => !removedEdges.has(id)))
  const count = (value: number, noun: string) => value + ' ' + noun + (value === 1 ? '' : 's')
  status.value = 'Deleted ' + [deletion.nodeIds.length ? count(deletion.nodeIds.length, 'node') : '',
    deletion.edgeIds.length ? count(deletion.edgeIds.length, 'edge') : ''].filter(Boolean).join(' and ') + '.'
}
function proposeDeletion(deletion: GraphDeletion) {
  const reason = validateDelete(deletion)
  if (reason) status.value = reason
  else commitDeletion(deletion)
}
// The selected nodes plus both ends of every selected edge.
function selectionNodeIds() {
  const present = new Set(data.value.nodes.map(node => node.id))
  const ids = new Set([...graphSelection.value].filter(id => present.has(id)))
  for (const edge of data.value.edges) {
    if (edgeSelection.value.has(edge.id)) ids.add(edge.from).add(edge.to)
  }
  return [...ids]
}
const canFitSelection = computed(() => selectionNodeIds().length > 0)
function fitSelection(target?: GraphContextMenuTarget) {
  let ids = selectionNodeIds()
  if (!ids.length && target?.kind === 'node') ids = [target.id]
  const edge = target?.kind === 'edge' ? data.value.edges.find(item => item.id === target.id) : undefined
  if (!ids.length && edge) ids = [edge.from, edge.to]
  if (!ids.length && target?.kind === 'group') ids = graphGroups.value?.find(item => item.id === target.id)?.nodeIds.slice() ?? []
  // Nodes hidden in a collapsed group are represented by its proxy.
  const owners = collapsedView.value?.owners
  ids = [...new Set(ids.map(id => owners?.get(id) ?? id))]
  if (ids.length) {
    graph.value?.fit({ ids, padding: 24 })
    status.value = 'Fitted ' + ids.length + (ids.length === 1 ? ' node.' : ' nodes.')
  } else {
    graph.value?.fit()
    status.value = 'Fitted the whole graph.'
  }
}

// A small demo context menu. The graph only reports the request; this menu is application code.
type MenuItem = { label: string; run: () => void }
const menu = ref<{ label: string; x: number; y: number; items: MenuItem[] }>()
const menuElement = ref<HTMLElement>()
let menuReturnFocus: Element | null = null
function nodeLabel(id: string) {
  return data.value.nodes.find(node => node.id === id)?.label ?? collapsedView.value?.proxies.get(id)?.label ?? id
}
function edgeName(edge: GraphEdge) {
  return edge.label ?? edge.id
}
function deletionForTarget(target: GraphContextMenuTarget) {
  const { nodes, edges } = data.value
  const selected = target.kind === 'node' ? graphSelection.value.has(target.id) : target.kind === 'edge' && edgeSelection.value.has(target.id)
  if (selected && !collapsedView.value) {
    const present = new Set(nodes.map(node => node.id)), presentEdges = new Set(edges.map(edge => edge.id))
    return graphDeletion(nodes, edges, [...graphSelection.value].filter(id => present.has(id)), [...edgeSelection.value].filter(id => presentEdges.has(id)))
  }
  const view = collapsedView.value
  // A collapsed group's proxy stands for its members, and a merged edge for its original edges.
  if (target.kind === 'node') return graphDeletion(nodes, edges, view?.proxies.get(target.id)?.nodeIds ?? [target.id])
  return graphDeletion(nodes, edges, [], target.kind === 'edge' ? view?.mergedEdges.get(target.id) ?? [target.id] : [])
}
function openMenu(request: GraphContextMenu) {
  const { target } = request
  const items: MenuItem[] = []
  let label = 'Graph actions'
  if (target.kind === 'node') {
    label = 'Actions for ' + nodeLabel(target.id)
    items.push({ label: 'Delete', run: () => proposeDeletion(deletionForTarget(target)) })
    items.push({ label: 'Focus node', run: () => graph.value?.focusNode(target.id, { scale: 1 }) })
  } else if (target.kind === 'edge') {
    const edge = data.value.edges.find(item => item.id === target.id)
    label = 'Actions for edge ' + (edge ? edgeName(edge) : target.id)
    items.push({ label: 'Delete', run: () => proposeDeletion(deletionForTarget(target)) })
  } else if (target.kind === 'group') {
    const group = graphGroups.value?.find(item => item.id === target.id)
    label = 'Actions for group ' + (group?.label ?? target.id)
    items.push({ label: 'Select group', run: () => {
      graphSelection.value = new Set(group?.nodeIds ?? [])
      edgeSelection.value = new Set()
    } })
  }
  items.push({ label: 'Fit selection', run: () => fitSelection(target) })
  menuReturnFocus = document.activeElement
  menu.value = {
    label, items,
    x: Math.max(4, Math.min(request.clientX, window.innerWidth - 184)),
    y: Math.max(4, Math.min(request.clientY, window.innerHeight - items.length * 32 - 16)),
  }
  void nextTick(() => menuElement.value?.querySelector<HTMLElement>('[role="menuitem"]')?.focus())
}
function closeMenu(restoreFocus = true) {
  if (!menu.value) return
  menu.value = undefined
  if (!restoreFocus) return
  const previous = menuReturnFocus
  void nextTick(() => {
    // A deleted element cannot take focus back, so the graph stage does.
    const target = previous instanceof HTMLElement || previous instanceof SVGElement
      ? previous.isConnected ? previous : graph.value?.$el.querySelector('.vft-network-stage') : undefined
    target?.focus({ preventScroll: true })
  })
}
function runMenuItem(item: MenuItem) {
  closeMenu()
  item.run()
}
function menuKeydown(event: KeyboardEvent) {
  const items = [...(menuElement.value?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])]
  const index = items.indexOf(document.activeElement as HTMLElement)
  const next = { ArrowDown: index + 1, ArrowUp: index - 1, Home: 0, End: items.length - 1 }[event.key]
  if (event.key === 'Escape') {
    event.preventDefault()
    closeMenu()
  } else if (event.key === 'Tab') {
    closeMenu(false)
  } else if (next !== undefined && items.length) {
    event.preventDefault()
    items[(next + items.length) % items.length]!.focus()
  }
}
function closeMenuOutside(event: PointerEvent) {
  if (!(event.target instanceof Node) || !menuElement.value?.contains(event.target)) closeMenu(false)
}
watch(menu, (value, previous) => {
  if (value && !previous) document.addEventListener('pointerdown', closeMenuOutside, true)
  else if (!value && previous) document.removeEventListener('pointerdown', closeMenuOutside, true)
})
watch(graphEditing, () => closeMenu(false))
// Snapping, the node palette and the clipboard. The graph proposes; every change below is one history entry.
const gridSize = 20
const snapToGrid = ref(false)
const alignmentGuides = ref(false)
const paletteType = 'application/x-vue-weave-node'
const paletteItems = [{ kind: 'operation', label: 'Add operation' }, { kind: 'lot', label: 'Add lot' }] as const
type PaletteKind = typeof paletteItems[number]['kind']
function plural(value: number, noun: string) {
  return value + ' ' + noun + (value === 1 ? '' : 's')
}
function startPaletteDrag(event: DragEvent, kind: PaletteKind) {
  if (!event.dataTransfer) return
  event.dataTransfer.setData(paletteType, kind)
  event.dataTransfer.effectAllowed = 'copy'
}
// Centres a new 144 x 58 node on the point, on the grid when snapping, and never at negative coordinates.
function addNode(kind: PaletteKind, center: GraphPoint) {
  const prefix = kind === 'operation' ? 'Operation' : 'Lot'
  let number = 1
  while (data.value.nodes.some(node => node.id === kind + '-' + number)) number++
  const id = kind + '-' + number
  const node: NetworkNode = kind === 'operation'
    ? { id, label: prefix + ' ' + number, detail: 'New operation', shape: 'rounded' }
    : { id, label: prefix + ' ' + number, detail: 'New lot', tone: 'teal' }
  let corner = { x: center.x - 72, y: center.y - 29 }
  if (snapToGrid.value) corner = snapGraphPoint(corner, gridSize)
  const nextPositions = new Map(positions.value).set(id, { x: Math.max(0, corner.x), y: Math.max(0, corner.y) })
  commitState({ data: { ...data.value, nodes: [...data.value.nodes, node] }, positions: nextPositions })
  graphSelection.value = new Set([id])
  edgeSelection.value = new Set()
  status.value = 'Added ' + node.label + '.'
}
function addPaletteNode(kind: PaletteKind) {
  const center = graph.value?.getViewportCenter()
  if (center) addNode(kind, center)
}
function dropNode(drop: GraphDrop) {
  const kind = drop.dataTransfer?.getData(paletteType)
  // drop.point is already on the grid; the unsnapped pointer position centres the node with a single rounding.
  if (kind === 'operation' || kind === 'lot') addNode(kind, graph.value?.toGraphPoint(drop.clientX, drop.clientY) ?? drop.point)
}
// New IDs for copies: the source ID with a numbered suffix that is unused in the current graph.
function copyIds() {
  const used = { node: new Set(data.value.nodes.map(node => node.id)), edge: new Set(data.value.edges.map(edge => edge.id)) }
  return (id: string, kind: 'node' | 'edge') => {
    let number = 1
    while (used[kind].has(id + '-copy-' + number)) number++
    used[kind].add(id + '-copy-' + number)
    return id + '-copy-' + number
  }
}
function insertCopies(result: GraphCloneResult<NetworkNode, GraphEdge>, verb: string) {
  const copies = result.nodes.map(node => node.label.endsWith(' (copy)') ? node : { ...node, label: node.label + ' (copy)' })
  commitState({
    data: { ...data.value, nodes: [...data.value.nodes, ...copies], edges: [...data.value.edges, ...result.edges] },
    positions: new Map([...positions.value, ...result.positions]),
  })
  graphSelection.value = new Set(copies.map(node => node.id))
  edgeSelection.value = new Set()
  status.value = verb + ' ' + plural(copies.length, 'node') + (result.edges.length ? ' and ' + plural(result.edges.length, 'edge') : '') + '.'
}
// The copied nodes, the edges between them and their positions, kept so a paste works after the originals change.
const clipboard = shallowRef<{ nodes: NetworkNode[]; edges: GraphEdge[]; positions: ReadonlyMap<string, GraphPoint> }>()
function copySelection(selection: GraphClipboardSelection) {
  const ids = new Set(selection.nodeIds)
  if (!ids.size) {
    status.value = 'Select nodes to copy.'
    return
  }
  const nodes = data.value.nodes.filter(node => ids.has(node.id))
  clipboard.value = { nodes, edges: data.value.edges.filter(edge => ids.has(edge.from) && ids.has(edge.to)), positions: selection.positions }
  status.value = 'Copied ' + plural(nodes.length, 'node') + '.'
}
function pasteClipboard({ point }: GraphPaste) {
  const copied = clipboard.value
  if (!copied) {
    status.value = 'Nothing to paste. Copy nodes with Ctrl+C first.'
    return
  }
  // The top-left corner of the copied nodes lands on the paste point.
  const corners = [...copied.positions.values()]
  const left = Math.min(...corners.map(position => position.x)), top = Math.min(...corners.map(position => position.y))
  const offset = { x: Math.max(point.x - left, -left), y: Math.max(point.y - top, -top) }
  insertCopies(cloneGraphElements(copied.nodes, copied.edges, copied.nodes.map(node => node.id), { createId: copyIds(), positions: copied.positions, offset }), 'Pasted')
}
function duplicateSelection(selection: GraphClipboardSelection) {
  if (!selection.nodeIds.length) {
    status.value = 'Select nodes to duplicate.'
    return
  }
  const offset = { x: 2 * gridSize, y: 2 * gridSize }
  insertCopies(cloneGraphElements(data.value.nodes, data.value.edges, selection.nodeIds, { createId: copyIds(), positions: selection.positions, offset }), 'Duplicated')
}

// Group collapse, edge styles and waypoints, node resizing and level of detail. Each accepted change is one history entry.
const collapsibleGroups = ref(false)
const editableEdges = ref(false)
const resizableNodes = ref(false)
const edgeStyle = ref<GraphEdgeStyle>('curve')
const collapseOn = computed(() => graphEditing.value && collapsibleGroups.value && graphGroups.value !== undefined)
// The same collapsed view the graph draws, used to map proxies back to their members.
const collapsedView = computed(() => {
  const list = graphGroups.value
  if (!collapseOn.value || !list) return undefined
  const known = new Set(list.map(item => item.id))
  const ids = [...collapsed.value].filter(id => known.has(id))
  return ids.length ? collapseGraphGroups(data.value.nodes, data.value.edges, list, ids) : undefined
})
function commitCollapse(ids: Set<string>) {
  const opened = [...collapsed.value].filter(id => !ids.has(id)), closed = [...ids].filter(id => !collapsed.value.has(id))
  commitState({ collapsed: ids })
  const label = (id: string) => graphGroups.value?.find(item => item.id === id)?.label ?? id
  status.value = closed.length ? 'Collapsed ' + label(closed[0]!) + '.' : opened.length ? 'Expanded ' + label(opened[0]!) + '.' : status.value
}
function validateReshape(change: GraphEdgeReshape) {
  if (change.after.length > 4) return 'Use at most 4 waypoints per edge.'
}
function validateResize(change: GraphNodeResize) {
  if (change.after.width > 360 || change.after.height > 200) return 'Keep nodes within 360 × 200.'
}
function commitReshape(change: GraphEdgeReshape) {
  const edges = data.value.edges.map(edge => {
    if (edge.id !== change.id) return edge
    const { points: _points, ...rest } = edge
    return change.after.length ? { ...rest, points: change.after } : rest
  })
  commitState({ data: { ...data.value, edges } })
  status.value = 'Edge ' + change.id + ' has ' + plural(change.after.length, 'waypoint') + '.'
}
function commitResize(change: GraphNodeResize) {
  const { id, before, after } = change
  const nextSizes = new Map(sizes.value).set(id, { width: after.width, height: after.height })
  const nextPositions = after.x !== before.x || after.y !== before.y ? new Map(positions.value).set(id, { x: after.x, y: after.y }) : positions.value
  commitState({ sizes: nextSizes, positions: nextPositions })
  status.value = 'Resized ' + nodeLabel(id) + ' to ' + Math.round(after.width) + ' × ' + Math.round(after.height) + '.'
}

function degree(id: string) {
  const edges = data.value.edges
  return edges.filter(edge => edge.to === id).length + ' in · ' + edges.filter(edge => edge.from === id).length + ' out'
}

function validateCell(change: TimelineCellEdit) {
  if (locked.value) return 'This example is locked. Uncheck “Reject edits” to apply changes.'
  if (!change.after.trim()) return 'A resource note cannot be empty.'
}
function commitCell(change: TimelineCellEdit) {
  const rows = data.value.rows.map(row => row.id === change.rowId ? { ...row, detail: change.after.trim() } : row)
  commitState({ data: { ...data.value, rows }, positions: positions.value })
  status.value = 'Updated resource note.'
}
function undo() {
  history.undo()
  status.value = 'Undid the last edit.'
}
function redo() {
  history.redo()
  status.value = 'Redid the last edit.'
}
const selectCount = ref(0)
function selectBar(id: string) {
  selectCount.value++
  const bar = data.value.bars.find(bar => bar.id === id)
  selected.value = typeof bar?.data === 'string' ? bar.data : id
}
function validate(change: TimelineEdit) {
  if (locked.value) return 'This example is locked. Uncheck “Reject edits” to apply changes.'
  const bar = data.value.bars.find(bar => bar.id === change.id)
  const conflict = data.value.bars.some(other => other.id !== change.id && other.rowId === bar?.rowId
    && other.lane === bar?.lane && other.start < change.after.end && change.after.start < other.end)
  if (conflict) return 'Another interval occupies this resource.'
}
function commit(change: TimelineEdit) {
  const bars = data.value.bars.map(bar => bar.id === change.id ? { ...bar, ...change.after } : bar)
  commitState({ data: { ...data.value, bars }, positions: positions.value })
  status.value = change.id + ' → ' + formatTime(change.after.start) + '–' + formatTime(change.after.end) + ' (' + change.source + ')'
}
</script>

<template>
  <div class="demo" :class="[{ dark }, builtInTheme]">
    <header><a href="./" class="wordmark">Vue Weave <span>0.4</span></a><span v-if="preset !== 'scheduling' && preset !== 'editing'" class="export-actions"><button type="button" @click="exportGraphSvg">Export graph SVG</button><button type="button" @click="exportGraphPng">Export graph PNG</button></span><label><input v-model="dark" type="checkbox"> Dark theme</label><label class="theme-switch">Built-in theme <select v-model="builtInTheme"><option value="">Demo default</option><option value="vft-theme-dark">Dark</option><option value="vft-theme-auto">Auto (system)</option></select></label></header>
    <main>
      <div class="intro"><p class="eyebrow">INTERACTIVE EXAMPLES</p><h1>Relationships meet schedules.</h1><p>Explore connected data and editable timelines with Vue components.</p></div>
      <nav aria-label="Examples">
        <button v-for="item in [{ id: 'manufacturing', label: 'Manufacturing' }, { id: 'project', label: 'Project delivery' }, { id: 'scale', label: '1,000 resources' }, { id: 'large', label: 'Large graph' }]"
          :key="item.id" :aria-pressed="preset === item.id" @click="preset = item.id; reset()">{{ item.label }}</button>
        <button type="button" :aria-pressed="preset === 'scheduling'" @click="preset = 'scheduling'">Scheduling</button>
        <button type="button" :aria-pressed="preset === 'editing'" @click="preset = 'editing'">Timeline editing</button>
        <button v-if="preset !== 'scheduling'" type="button" :disabled="!canUndo" @click="undo">Undo</button>
        <button v-if="preset !== 'scheduling'" type="button" :disabled="!canRedo" @click="redo">Redo</button>
      </nav>
      <SchedulingDemo v-if="preset === 'scheduling'" />
      <GanttEditingDemo v-else-if="preset === 'editing'" />
      <template v-else>
      <section>
        <div class="section-head"><div><h2>Network</h2><p>{{ data.nodes.length }} nodes · {{ data.edges.length }} edges</p></div>
          <div class="options"><label>Direction <select v-model="direction"><option>LR</option><option>TB</option><option>RL</option><option>BT</option></select></label><label>Crossing reduction <select v-model="crossingReduction"><option>none</option><option>barycenter</option><option>median</option></select></label><label>Graph layout <select v-model="layoutKind"><option>layered</option><option>tree</option><option>radial</option></select></label><label><input v-model="custom" type="checkbox"> Custom nodes</label><label><input v-model="graphEditing" type="checkbox"> Edit graph</label><label v-if="graphEditing && preset === 'manufacturing'"><input v-model="nestedGroups" type="checkbox"> Nested groups</label><button v-if="graphEditing" type="button" :disabled="!canFitSelection" @click="fitSelection()">Fit selection</button><label>Search nodes <input v-model="query" type="search" @keydown.enter="findFirstMatch"></label></div>
        </div>
        <div v-if="graphEditing" class="graph-tools">
          <label><input v-model="snapToGrid" type="checkbox"> Snap to grid</label>
          <label><input v-model="alignmentGuides" type="checkbox"> Alignment guides</label>
          <label v-if="preset === 'manufacturing'"><input v-model="collapsibleGroups" type="checkbox"> Collapsible groups</label>
          <label><input v-model="editableEdges" type="checkbox"> Editable edges</label>
          <label><input v-model="resizableNodes" type="checkbox"> Resizable nodes</label>
          <label>Edge style <select v-model="edgeStyle"><option>curve</option><option>orthogonal</option><option>straight</option></select></label>
          <div class="graph-palette" role="group" aria-label="Node palette">
            <button v-for="item in paletteItems" :key="item.kind" type="button" class="palette-chip" draggable="true"
              @dragstart="startPaletteDrag($event, item.kind)" @click="addPaletteNode(item.kind)">{{ item.label }}</button>
          </div>
          <span class="hint">Drag a chip onto the graph, or activate it to add a node at the centre of the view.</span>
        </div>
        <NetworkGraph ref="graph" v-model:selected-id="selected" :nodes="data.nodes" :edges="data.edges" :options="{ direction, crossingReduction }" :layout="graphLayout" :height="direction === 'TB' || direction === 'BT' ? 470 : graphEditing || preset === 'large' ? 345 : 245"
          :draggable="graphEditing" :connectable="graphEditing" :reconnectable="graphEditing" :box-select="graphEditing"
          :groups="graphGroups" :show-minimap="graphEditing || preset === 'large'" :cull-offscreen="preset === 'large'" :match-ids="matchIds"
          :positions="positions" :selected-ids="graphEditing ? graphSelection : undefined"
          :edges-selectable="graphEditing" :selected-edge-ids="graphEditing ? edgeSelection : undefined" @update:selected-edge-ids="edgeSelection = $event"
          :deletable="graphEditing" :validate-delete="validateDelete" @delete="commitDeletion" @delete-rejected="(_deletion, reason) => status = reason"
          :context-menu="graphEditing" @context-menu="openMenu"
          :snap-grid="graphEditing && snapToGrid ? gridSize : undefined" :background="graphEditing && snapToGrid ? 'dots' : 'none'"
          :alignment-guides="graphEditing && alignmentGuides" :auto-pan="graphEditing" :droppable="graphEditing" @node-drop="dropNode"
          :clipboard="graphEditing" @copy-selection="copySelection" @paste-request="pasteClipboard" @duplicate-selection="duplicateSelection"
          :collapsible-groups="collapseOn" :collapsed-group-ids="collapseOn ? collapsed : undefined" @update:collapsed-group-ids="commitCollapse"
          :edge-style="graphEditing ? edgeStyle : 'curve'" :editable-edges="graphEditing && editableEdges" @edge-reshape="commitReshape"
          :validate-edge-reshape="validateReshape" @edge-reshape-rejected="(_change, reason) => status = reason"
          :sizes="sizes" :resizable="graphEditing && resizableNodes" @node-resize="commitResize"
          :validate-node-resize="validateResize" @node-resize-rejected="(_change, reason) => status = reason" :lod-threshold="graphEditing ? 0.5 : undefined"
          :validate-connection="validateConnection" @update:selected-ids="graphSelection = $event"
          @node-move="commitNodes([$event])" @nodes-move="commitNodes" @connect="commitConnection" @reconnect="commitReconnect" @connect-rejected="(_connection, reason) => status = reason">
          <template v-if="custom" #node="{ node, box, selected: active }">
            <rect x="3" y="3" :width="box.width - 6" :height="box.height - 6" rx="4" :style="{ fill: active ? '#174878' : 'var(--vft-surface, #fff)' }" />
            <text x="12" y="24" style="font-size: 14px">{{ node.label }}</text><text x="12" y="44" style="font-size: 10px">{{ node.detail || node.id }}</text>
          </template>
          <template v-if="graphEditing" #tooltip="{ target }">
            <template v-if="target.kind === 'node'"><strong>{{ target.node.label }}</strong><br>{{ target.node.detail ?? 'No detail' }} · {{ degree(target.node.id) }}</template>
            <template v-else>{{ nodeLabel(target.edge.from) }} → {{ nodeLabel(target.edge.to) }}<template v-if="target.edge.label"> · {{ target.edge.label }}</template></template>
          </template>
        </NetworkGraph>
        <p v-if="graphEditing" class="hint">Drag between ports to connect. Select an edge to move an endpoint. Shift-drag the canvas to select a region. Press Delete to remove the selection; right-click or press Shift+F10 for more actions. Ctrl+C, Ctrl+V and Ctrl+D (⌘ on macOS) copy, paste and duplicate nodes.</p>
        <div v-if="menu" ref="menuElement" class="graph-menu" role="menu" :aria-label="menu.label"
          :style="{ left: menu.x + 'px', top: menu.y + 'px' }" @keydown="menuKeydown" @contextmenu.prevent>
          <button v-for="item in menu.items" :key="item.label" type="button" role="menuitem" tabindex="-1" @click="runMenuItem(item)">{{ item.label }}</button>
        </div>
      </section>
      <section>
        <div class="section-head"><div><h2>Timeline</h2><p>{{ data.rows.length.toLocaleString('en-US') }} rows · {{ data.bars.length.toLocaleString('en-US') }} intervals · UTC</p></div>
          <div class="options"><label><input v-model="locked" type="checkbox"> Reject edits</label><label><input v-model="advancedTimeline" type="checkbox"> Planning overlays</label><button v-if="preset === 'scale'" @click="timeline?.scrollToRow('r999')">Last resource</button><button @click="reset">Reset</button></div>
        </div>
        <GanttChart ref="timeline" :key="preset" :rows="timelineRows" :bars="timelineBars" :dependencies="data.dependencies"
          :range="range" :pixels-per-unit="115 / hour" :lane-count="preset === 'manufacturing' || preset === 'large' ? 2 : 1" :height="advancedTimeline ? 420 : preset === 'scale' ? 330 : 290"
          v-model:collapsed-ids="collapsedRows" :header-bands="advancedTimeline ? headerBands : undefined"
          :markers="advancedTimeline ? markers : undefined" :columns="advancedTimeline ? columns : undefined"
          :show-summaries="advancedTimeline" :validate-cell-edit="validateCell"
          @cell-edit="commitCell" @cell-edit-rejected="(_change, reason) => status = reason"
          :format-time="formatTime" :selected-ids="selectedBars" :validate-edit="validate"
          @select="selectBar" @edit="commit" @edit-rejected="(_change, reason) => status = reason">
          <template #legend><span class="hint">Drag to move · Drag ends to resize · Focus a bar to edit with arrow keys</span></template>
          <template #row-heading>Resource</template>
        </GanttChart>
        <p class="status" role="status">{{ status }}</p>
        <output class="vft-sr-only" aria-label="Select events">{{ selectCount }}</output>
      </section>
      </template>
      <footer>Vue 3 · TypeScript · SVG + HTML · MIT</footer>
    </main>
  </div>
</template>
