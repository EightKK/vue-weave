<script setup lang="ts">
// The network graph and Gantt chart of one data set of data.ts: graph layouts, graph editing (moves, connections,
// deletion, groups, clipboard, waypoints, resizing, labels), timeline editing, planning overlays and image export. Every
// change is a proposal that this component applies to one undoable state. The site's graph and Gantt examples wrap it,
// and so does the main page of the legacy gallery.
import { computed, nextTick, ref, shallowRef, watch } from 'vue'
import { NetworkGraph, GanttChart, useEditHistory, layoutTreeGraph, layoutRadialGraph, layoutCircularGraph, layoutGridGraph, layoutConcentricGraph, layoutForceGraph, graphDeletion, removeGraphElements, type GraphCrossingReduction, type GraphLayoutFunction, type GraphLayoutDirection, type TimelineEdit, type TimelineColumn, type TimelineCellEdit, type GraphPoint, type GraphNodeMove, type GraphConnection, type GraphReconnect, type GraphContextMenu, type GraphContextMenuTarget, type GraphDeletion, type GraphEdge, type NetworkGroup } from '../../src'
import { cloneGraphElements, snapGraphPoint, type GraphCloneResult, type GraphClipboardSelection, type GraphDrop, type GraphPaste, type NetworkNode } from '../../src'
import { collapseGraphGroups, type GraphEdgeReshape, type GraphEdgeStyle, type GraphNodeResize, type GraphNodeSize } from '../../src'
import type { GraphLabelEdit } from '../../src'
import { datasets as allDatasets, makeExample, range, hour, formatTime } from '../data'
import PortRulesDemo from '../PortRulesDemo.vue'
import { download, imageSize } from '../download'
import StatusLine from './StatusLine.vue'
import { useDemoLocale } from '../i18n'
import { unusedNumber } from '../ids'

const props = withDefaults(defineProps<{
  /** The data sets offered as buttons, by ID (see `makeExample`); none hides the switch. */
  datasets?: readonly string[]
  /** Shows a select for the stylesheet's built-in theme classes. */
  themeSwitch?: boolean
}>(), { datasets: () => [], themeSwitch: false })
/** The data set shown. */
const preset = defineModel<string>('preset', { default: 'manufacturing' })
const datasetButtons = computed(() => allDatasets.filter(item => props.datasets.includes(item.id)))
const builtInTheme = ref<'' | 'vw-theme-dark' | 'vw-theme-auto'>('')
const { t, labels, isJapanese, intlLocale } = useDemoLocale()
// Japanese names for the sample data of data.ts; the IDs stay the same, so the graph and the chart still select together.
const japaneseText: Record<string, string> = {
  'Material A1': '材料 A1', 'Split': '分割', 'Finish': '仕上げ', 'Product B': '製品 B', 'Operation 101': '工程 101', 'Operation 102': '工程 102',
  'Cutting station': '切断工程', 'Finishing line': '仕上げライン', 'Machine 01': '機械 01', 'Machine 02': '機械 02',
  'Split · plan': '分割 · 計画', 'Split · actual': '分割 · 実績', 'Finish · plan': '仕上げ · 計画', 'Finish · actual': '仕上げ · 実績',
  'Design': '設計', 'API': 'API', 'Interface': '画面', 'Release': 'リリース', 'Product team': '製品チーム', 'Platform team': '基盤チーム',
  'Web team': 'Web チーム', 'Milestone': 'マイルストーン', 'Delivery': '納品', 'Output': '出力', 'Input': '入力',
  'Controller': 'コントローラー', 'Worker': 'ワーカー', 'Result': '結果', 'Retry': '再試行', 'Virtualized row': '仮想化された行',
}
function translate(text: string) {
  return japaneseText[text] ?? text
    .replace(/^(\d+) units$/, '$1 個').replace(/^Node (\d+)$/, 'ノード $1').replace(/^Rank (\d+)$/, 'ランク $1')
    .replace(/^Resource (\d+)$/, 'リソース $1').replace(/^Batch (\d+)$/, 'バッチ $1')
}
// A data set with its names in the page language.
function makeLocalized(id: string) {
  const example = makeExample(id)
  if (!isJapanese.value) return example
  const text = <T extends { label?: string; detail?: string }>(item: T): T => ({
    ...item, ...(item.label === undefined ? {} : { label: translate(item.label) }), ...(item.detail === undefined ? {} : { detail: translate(item.detail) }),
  })
  return {
    ...example,
    nodes: example.nodes.map(node => ({ ...text(node), ports: node.ports?.map(text) })),
    edges: example.edges.map(text), rows: example.rows.map(text), bars: example.bars.map(text),
  }
}
// One history entry holds the data, saved positions and sizes and the collapsed groups, so Undo and Redo cover them all.
type DemoState = {
  data: ReturnType<typeof makeExample>; positions: ReadonlyMap<string, GraphPoint>; sizes: ReadonlyMap<string, GraphNodeSize>; collapsed: ReadonlySet<string>
}
const history = useEditHistory<DemoState>({ data: makeLocalized(preset.value), positions: new Map(), sizes: new Map(), collapsed: new Set() })
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
const layoutKind = ref<'layered' | 'tree' | 'radial' | 'circular' | 'grid' | 'concentric' | 'force'>('layered')
// The force simulation runs synchronously on the main thread and takes about a second for the 3,750-node large graph,
// and the circular and concentric layouts become very large for thousands of nodes, so the demo offers these layouts
// for smaller graphs only and falls back to the layered layout. The grid layout stays available.
const forceNodeLimit = 1000
const forceAvailable = computed(() => data.value.nodes.length <= forceNodeLimit)
const limitedLayouts = ['force', 'circular', 'concentric']
const graphLayout = computed<GraphLayoutFunction | undefined>(() => layoutKind.value === 'tree'
  ? (n, e) => layoutTreeGraph(n, e, { direction: direction.value })
  : layoutKind.value === 'radial' ? (n, e) => layoutRadialGraph(n, e)
    : layoutKind.value === 'circular' && forceAvailable.value ? (n, e) => layoutCircularGraph(n, e)
    : layoutKind.value === 'grid' ? (n, e) => layoutGridGraph(n, e)
    : layoutKind.value === 'concentric' && forceAvailable.value ? (n, e) => layoutConcentricGraph(n, e)
    : layoutKind.value === 'force' && forceAvailable.value ? (n, e) => layoutForceGraph(n, e, { seed: 1 }) : undefined)
const custom = ref(false)
const locked = ref(false)
const graphEditing = ref(false)
const advancedTimeline = ref(false)
const group = { id: 'lots', label: t({ en: 'Intermediate lots', ja: '中間ロット' }), nodeIds: ['lot1', 'lot2'] }
const groups = [group]
const nestedGroups = ref(false)
const nestedGroupList = [{ id: 'process', label: t({ en: 'Process', ja: '工程' }), nodeIds: ['raw', 'split'] }, { ...group, parentId: 'process' }]
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
  const svg = graph.value?.exportSvg({ title: t({ en: 'Network', ja: 'ネットワーク' }) })
  if (!svg) return
  download(svg, 'network.svg')
  status.value = t({ en: 'Exported network SVG (' + svg.length + ' characters).', ja: 'ネットワークを SVG に出力しました(' + svg.length + ' 文字)。' })
}
async function exportGraphPng() {
  try {
    const blob = await graph.value?.exportPng({ scale: 2 })
    if (!blob) return
    download(blob, 'network.png')
    const size = await imageSize(blob)
    status.value = t({ en: 'Exported network PNG ' + size + '.', ja: 'ネットワークを PNG に出力しました(' + size + ')。' })
  } catch (error) {
    status.value = error instanceof Error ? error.message : String(error)
  }
}
function findFirstMatch() {
  const first = matchIds.value?.values().next().value
  if (first !== undefined) graph.value?.focusNode(first, { scale: 1 })
}
const columns: TimelineColumn[] = [
  { id: 'note', label: t({ en: 'Resource note', ja: 'リソースのメモ' }), width: 110, value: row => row.detail ?? '', editable: row => row.id !== 'group' },
  { id: 'count', label: t({ en: 'Intervals', ja: '区間数' }), width: 62, value: (_row, summary) => summary?.count ?? 0 },
]
const graphSelection = ref(new Set<string>())
const edgeSelection = ref(new Set<string>())
const collapsedRows = ref(new Set<string>())
const timelineRows = computed(() => advancedTimeline.value ? [
  { id: 'group', label: t({ en: 'Production schedule', ja: '生産日程' }) },
  ...data.value.rows.map(row => ({ ...row, parentId: 'group' })),
] : data.value.rows)
const baselines = computed(() => new Map(initialBars.value.map(bar => [
  bar.id, { start: Math.max(range.start, bar.start - hour / 2), end: Math.max(range.start, bar.end - hour / 2) },
])))
const timelineBars = computed(() => advancedTimeline.value ? data.value.bars.map(bar => ({
  ...bar, baseline: baselines.value.get(bar.id),
})) : data.value.bars)
const headerBands = [
  [{ start: range.start, end: range.end, label: t({ en: 'Operating window · UTC', ja: '稼働時間帯 · UTC' }) }],
  [{ start: range.start, end: range.start + 4 * hour, label: t({ en: 'Morning shift', ja: '午前シフト' }) },
    { start: range.start + 4 * hour, end: range.end, label: t({ en: 'Afternoon shift', ja: '午後シフト' }) }],
]
const markers = [{ id: 'review', time: range.start + 4.25 * hour, label: t({ en: 'Shift review', ja: 'シフトの振り返り' }) }]
const status = ref(t({ en: 'Select a node or a bar. Edit a planned interval to try the controlled API.', ja: 'ノードかバーを選んでください。計画の区間を編集すると、制御された API の動きを試せます。' }))
const timeline = ref<InstanceType<typeof GanttChart>>()
const selectedBars = computed(() => new Set(data.value.bars.filter(bar => (bar.data ?? bar.id) === selected.value).map(bar => bar.id)))

watch(forceAvailable, available => {
  if (available || !limitedLayouts.includes(layoutKind.value)) return
  const name = layoutKind.value
  layoutKind.value = 'layered'
  status.value = t({
    en: `The ${name} layout is offered for up to ${forceNodeLimit.toLocaleString('en-US')} nodes; switched to the layered layout.`,
    ja: `${name} レイアウトは ${forceNodeLimit.toLocaleString('ja-JP')} ノードまでです。layered レイアウトに切り替えました。`,
  })
})
/** Loads a data set, by default the current one, afresh. */
function reset(id = preset.value) {
  preset.value = id
  const example = makeLocalized(id)
  history.reset({ data: example, positions: new Map(), sizes: new Map(), collapsed: new Set() })
  initialBars.value = example.bars
  graphSelection.value = new Set()
  edgeSelection.value = new Set()
  closeMenu(false)
  collapsedRows.value = new Set()
  selected.value = data.value.nodes[0]?.id ?? ''
  status.value = t({ en: 'Example reset.', ja: '例を初期状態に戻しました。' })
}
function commitNodes(changes: GraphNodeMove[]) {
  const nextPositions = new Map(positions.value)
  for (const change of changes) nextPositions.set(change.id, change.after)
  commitState({ data: data.value, positions: nextPositions })
  status.value = changes.length === 1
    ? t({ en: 'Moved node ' + changes[0]!.id + '.', ja: 'ノード ' + changes[0]!.id + ' を移動しました。' })
    : t({ en: 'Moved ' + changes.length + ' nodes.', ja: changes.length + ' 個のノードを移動しました。' })
}
function validateConnection({ from, to, fromPort, toPort }: GraphConnection, replacing?: string) {
  if (collapsedView.value?.proxies.has(from) || collapsedView.value?.proxies.has(to)) return t({ en: 'Expand the group to connect its nodes.', ja: 'グループを展開してからノードを接続してください。' })
  if (data.value.edges.some(edge => edge.id !== replacing && edge.from === from && edge.to === to
    && edge.fromPort === fromPort && edge.toPort === toPort)) return t({ en: 'This connection already exists.', ja: 'この接続はすでにあります。' })
}
function commitConnection(connection: GraphConnection) {
  const number = unusedNumber(data.value.edges, 'connection-', data.value.edges.length + 1)
  const edges = [...data.value.edges, { id: 'connection-' + number, ...connection }]
  commitState({ data: { ...data.value, edges }, positions: positions.value })
  status.value = t({ en: 'Connected ' + connection.from + ' to ' + connection.to + '.', ja: connection.from + ' を ' + connection.to + ' に接続しました。' })
}
function commitReconnect(change: GraphReconnect) {
  const edges = data.value.edges.map(edge => edge.id === change.id
    ? { ...edge, fromPort: undefined, toPort: undefined, ...change.after } : edge)
  commitState({ data: { ...data.value, edges }, positions: positions.value })
  status.value = t({ en: 'Reconnected edge ' + change.id + '.', ja: '辺 ' + change.id + ' をつなぎ替えました。' })
}
function validateDelete(deletion: GraphDeletion) {
  if (deletion.nodeIds.length >= data.value.nodes.length) return t({ en: 'Keep at least one node in the graph.', ja: 'グラフには少なくとも1つのノードを残してください。' })
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
  status.value = t({
    en: 'Deleted ' + [deletion.nodeIds.length ? count(deletion.nodeIds.length, 'node') : '',
      deletion.edgeIds.length ? count(deletion.edgeIds.length, 'edge') : ''].filter(Boolean).join(' and ') + '.',
    ja: [deletion.nodeIds.length ? deletion.nodeIds.length + ' 個のノード' : '',
      deletion.edgeIds.length ? deletion.edgeIds.length + ' 本の辺' : ''].filter(Boolean).join('と') + 'を削除しました。',
  })
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
    status.value = t({ en: 'Fitted ' + ids.length + (ids.length === 1 ? ' node.' : ' nodes.'), ja: ids.length + ' 個のノードに合わせて表示しました。' })
  } else {
    graph.value?.fit()
    status.value = t({ en: 'Fitted the whole graph.', ja: 'グラフ全体を表示しました。' })
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
  let label = t({ en: 'Graph actions', ja: 'グラフの操作' })
  if (target.kind === 'node') {
    label = t({ en: 'Actions for ' + nodeLabel(target.id), ja: nodeLabel(target.id) + ' の操作' })
    items.push({ label: t({ en: 'Delete', ja: '削除' }), run: () => proposeDeletion(deletionForTarget(target)) })
    items.push({ label: t({ en: 'Focus node', ja: 'ノードに移動' }), run: () => graph.value?.focusNode(target.id, { scale: 1 }) })
  } else if (target.kind === 'edge') {
    const edge = data.value.edges.find(item => item.id === target.id)
    label = t({ en: 'Actions for edge ' + (edge ? edgeName(edge) : target.id), ja: '辺 ' + (edge ? edgeName(edge) : target.id) + ' の操作' })
    items.push({ label: t({ en: 'Delete', ja: '削除' }), run: () => proposeDeletion(deletionForTarget(target)) })
  } else if (target.kind === 'group') {
    const group = graphGroups.value?.find(item => item.id === target.id)
    label = t({ en: 'Actions for group ' + (group?.label ?? target.id), ja: 'グループ ' + (group?.label ?? target.id) + ' の操作' })
    items.push({ label: t({ en: 'Select group', ja: 'グループを選択' }), run: () => {
      graphSelection.value = new Set(group?.nodeIds ?? [])
      edgeSelection.value = new Set()
    } })
  }
  items.push({ label: t({ en: 'Fit selection', ja: '選択範囲に合わせる' }), run: () => fitSelection(target) })
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
      ? previous.isConnected ? previous : graph.value?.$el.querySelector('.vw-network-stage') : undefined
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
// Inline label editing, lasso selection and the toolbar, group and minimap slots. The graph proposes a new label; the
// demo trims it and commits it as one history entry.
const labelEditing = ref(false)
const lassoSelect = ref(false)
const typedPorts = ref(false)
const itemSlots = ref(false)
function validateLabel(change: GraphLabelEdit) {
  if (!change.after.trim()) return t({ en: 'A label cannot be empty.', ja: 'ラベルは空にできません。' })
}
function commitLabel(change: GraphLabelEdit) {
  const label = change.after.trim(), current = data.value
  commitState({
    data: change.kind === 'node'
      ? { ...current, nodes: current.nodes.map(node => node.id === change.id ? { ...node, label } : node) }
      : { ...current, edges: current.edges.map(edge => edge.id === change.id ? { ...edge, label } : edge) },
  })
  status.value = t({ en: 'Renamed ' + change.kind + ' ' + change.id + ' to ' + label + '.', ja: (change.kind === 'node' ? 'ノード ' : '辺 ') + change.id + ' の名前を ' + label + ' に変えました。' })
}
const paletteType = 'application/x-vue-weave-node'
const paletteItems = [
  { kind: 'operation', label: t({ en: 'Add operation', ja: '工程を追加' }) },
  { kind: 'lot', label: t({ en: 'Add lot', ja: 'ロットを追加' }) },
] as const
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
  const prefix = kind === 'operation' ? t({ en: 'Operation', ja: '工程' }) : t({ en: 'Lot', ja: 'ロット' })
  const number = unusedNumber(data.value.nodes, kind + '-')
  const id = kind + '-' + number
  const node: NetworkNode = kind === 'operation'
    ? { id, label: prefix + ' ' + number, detail: t({ en: 'New operation', ja: '新しい工程' }), shape: 'rounded' }
    : { id, label: prefix + ' ' + number, detail: t({ en: 'New lot', ja: '新しいロット' }), tone: 'teal' }
  let corner = { x: center.x - 72, y: center.y - 29 }
  if (snapToGrid.value) corner = snapGraphPoint(corner, gridSize)
  const nextPositions = new Map(positions.value).set(id, { x: Math.max(0, corner.x), y: Math.max(0, corner.y) })
  commitState({ data: { ...data.value, nodes: [...data.value.nodes, node] }, positions: nextPositions })
  graphSelection.value = new Set([id])
  edgeSelection.value = new Set()
  status.value = t({ en: 'Added ' + node.label + '.', ja: node.label + ' を追加しました。' })
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
  const suffix = t({ en: ' (copy)', ja: '(コピー)' })
  const copies = result.nodes.map(node => node.label.endsWith(suffix) ? node : { ...node, label: node.label + suffix })
  commitState({
    data: { ...data.value, nodes: [...data.value.nodes, ...copies], edges: [...data.value.edges, ...result.edges] },
    positions: new Map([...positions.value, ...result.positions]),
  })
  graphSelection.value = new Set(copies.map(node => node.id))
  edgeSelection.value = new Set()
  status.value = t({
    en: verb + ' ' + plural(copies.length, 'node') + (result.edges.length ? ' and ' + plural(result.edges.length, 'edge') : '') + '.',
    ja: copies.length + ' 個のノード' + (result.edges.length ? 'と ' + result.edges.length + ' 本の辺' : '') + 'を' + (verb === 'Pasted' ? '貼り付けました。' : '複製しました。'),
  })
}
// The copied nodes, the edges between them and their positions, kept so a paste works after the originals change.
const clipboard = shallowRef<{ nodes: NetworkNode[]; edges: GraphEdge[]; positions: ReadonlyMap<string, GraphPoint> }>()
function copySelection(selection: GraphClipboardSelection) {
  const ids = new Set(selection.nodeIds)
  if (!ids.size) {
    status.value = t({ en: 'Select nodes to copy.', ja: 'コピーするノードを選んでください。' })
    return
  }
  const nodes = data.value.nodes.filter(node => ids.has(node.id))
  clipboard.value = { nodes, edges: data.value.edges.filter(edge => ids.has(edge.from) && ids.has(edge.to)), positions: selection.positions }
  status.value = t({ en: 'Copied ' + plural(nodes.length, 'node') + '.', ja: nodes.length + ' 個のノードをコピーしました。' })
}
function pasteClipboard({ point }: GraphPaste) {
  const copied = clipboard.value
  if (!copied) {
    status.value = t({ en: 'Nothing to paste. Copy nodes with Ctrl+C first.', ja: '貼り付けるものがありません。先に Ctrl+C でノードをコピーしてください。' })
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
    status.value = t({ en: 'Select nodes to duplicate.', ja: '複製するノードを選んでください。' })
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
  status.value = closed.length ? t({ en: 'Collapsed ' + label(closed[0]!) + '.', ja: label(closed[0]!) + ' を折りたたみました。' })
    : opened.length ? t({ en: 'Expanded ' + label(opened[0]!) + '.', ja: label(opened[0]!) + ' を展開しました。' }) : status.value
}
function validateReshape(change: GraphEdgeReshape) {
  if (change.after.length > 4) return t({ en: 'Use at most 4 waypoints per edge.', ja: '経由点は1本の辺につき4つまでです。' })
}
function validateResize(change: GraphNodeResize) {
  if (change.after.width > 360 || change.after.height > 200) return t({ en: 'Keep nodes within 360 × 200.', ja: 'ノードは 360 × 200 以内にしてください。' })
}
function commitReshape(change: GraphEdgeReshape) {
  const edges = data.value.edges.map(edge => {
    if (edge.id !== change.id) return edge
    const { points: _points, ...rest } = edge
    return change.after.length ? { ...rest, points: change.after } : rest
  })
  commitState({ data: { ...data.value, edges } })
  status.value = t({ en: 'Edge ' + change.id + ' has ' + plural(change.after.length, 'waypoint') + '.', ja: '辺 ' + change.id + ' の経由点は ' + change.after.length + ' 個です。' })
}
function commitResize(change: GraphNodeResize) {
  const { id, before, after } = change
  const nextSizes = new Map(sizes.value).set(id, { width: after.width, height: after.height })
  const nextPositions = after.x !== before.x || after.y !== before.y ? new Map(positions.value).set(id, { x: after.x, y: after.y }) : positions.value
  commitState({ sizes: nextSizes, positions: nextPositions })
  const size = Math.round(after.width) + ' × ' + Math.round(after.height)
  status.value = t({ en: 'Resized ' + nodeLabel(id) + ' to ' + size + '.', ja: nodeLabel(id) + ' のサイズを ' + size + ' にしました。' })
}

function degree(id: string) {
  const edges = data.value.edges
  const incoming = edges.filter(edge => edge.to === id).length, outgoing = edges.filter(edge => edge.from === id).length
  return t({ en: incoming + ' in · ' + outgoing + ' out', ja: '入力 ' + incoming + ' · 出力 ' + outgoing })
}

function validateCell(change: TimelineCellEdit) {
  if (locked.value) return t({ en: 'This example is locked. Uncheck “Reject edits” to apply changes.', ja: 'この例はロックされています。変更を適用するには「編集を却下」をオフにしてください。' })
  if (!change.after.trim()) return t({ en: 'A resource note cannot be empty.', ja: 'リソースのメモは空にできません。' })
}
function commitCell(change: TimelineCellEdit) {
  const rows = data.value.rows.map(row => row.id === change.rowId ? { ...row, detail: change.after.trim() } : row)
  commitState({ data: { ...data.value, rows }, positions: positions.value })
  status.value = t({ en: 'Updated resource note.', ja: 'リソースのメモを更新しました。' })
}
function undo() {
  history.undo()
  status.value = t({ en: 'Undid the last edit.', ja: '直前の編集を元に戻しました。' })
}
function redo() {
  history.redo()
  status.value = t({ en: 'Redid the last edit.', ja: '編集をやり直しました。' })
}
// Escape first cancels a gesture in flight (a drag, a connection or a box selection); only an Escape without one
// clears the selection. The graph reports every gesture as a start and an end, and the wrapper's capture listener
// reads the count before the graph's own Escape handler ends the gesture.
const gesture = { count: 0, cancelling: false }
// A click on the empty graph canvas or Escape in the graph clears the shared node and bar selection and, while
// editing, the graph's node and edge selection.
function clearSelection() {
  if (!selected.value && !graphSelection.value.size && !edgeSelection.value.size) return
  selected.value = ''
  graphSelection.value = new Set()
  edgeSelection.value = new Set()
  status.value = t({ en: 'Selection cleared.', ja: '選択を解除しました。' })
}
const selectCount = ref(0)
function selectBar(id: string) {
  selectCount.value++
  const bar = data.value.bars.find(bar => bar.id === id)
  selected.value = bar?.data ?? id
}
function validate(change: TimelineEdit) {
  if (locked.value) return t({ en: 'This example is locked. Uncheck “Reject edits” to apply changes.', ja: 'この例はロックされています。変更を適用するには「編集を却下」をオフにしてください。' })
  const bar = data.value.bars.find(bar => bar.id === change.id)
  const conflict = data.value.bars.some(other => other.id !== change.id && other.rowId === bar?.rowId
    && other.lane === bar?.lane && other.start < change.after.end && change.after.start < other.end)
  if (conflict) return t({ en: 'Another interval occupies this resource.', ja: 'このリソースには別の区間があります。' })
}
function commit(change: TimelineEdit) {
  const bars = data.value.bars.map(bar => bar.id === change.id ? { ...bar, ...change.after } : bar)
  commitState({ data: { ...data.value, bars }, positions: positions.value })
  status.value = change.id + ' → ' + formatTime(change.after.start) + '–' + formatTime(change.after.end) + ' (' + change.source + ')'
}
defineExpose({ reset })
</script>

<template>
  <div class="graph-gantt-demo" :class="themeSwitch ? builtInTheme : undefined">
    <div class="graph-gantt-bar">
      <nav v-if="datasetButtons.length" :aria-label="t({ en: 'Data sets', ja: 'データセット' })">
        <button v-for="item in datasetButtons" :key="item.id" type="button" :aria-pressed="preset === item.id" @click="reset(item.id)">{{ t({ en: item.label, ja: item.labelJa }) }}</button>
      </nav>
      <div class="options graph-gantt-actions">
        <button type="button" :disabled="!canUndo" @click="undo">{{ t({ en: 'Undo', ja: '元に戻す' }) }}</button>
        <button type="button" :disabled="!canRedo" @click="redo">{{ t({ en: 'Redo', ja: 'やり直す' }) }}</button>
        <button type="button" @click="exportGraphSvg">{{ t({ en: 'Export graph SVG', ja: 'グラフを SVG で出力' }) }}</button>
        <button type="button" @click="exportGraphPng">{{ t({ en: 'Export graph PNG', ja: 'グラフを PNG で出力' }) }}</button>
        <label v-if="themeSwitch">{{ t({ en: 'Built-in theme', ja: '組み込みテーマ' }) }} <select v-model="builtInTheme"><option value="">{{ t({ en: 'Demo default', ja: 'デモの既定' }) }}</option><option value="vw-theme-dark">{{ t({ en: 'Dark', ja: 'ダーク' }) }}</option><option value="vw-theme-auto">{{ t({ en: 'Auto (system)', ja: '自動(システム)' }) }}</option></select></label>
      </div>
    </div>
    <section>
      <div class="section-head"><div><h2>{{ t({ en: 'Network', ja: 'ネットワーク' }) }}</h2><p>{{ t({ en: data.nodes.length + ' nodes · ' + data.edges.length + ' edges', ja: 'ノード ' + data.nodes.length + ' · 辺 ' + data.edges.length }) }}</p></div>
        <div class="options"><label>{{ t({ en: 'Direction', ja: '方向' }) }} <select v-model="direction"><option>LR</option><option>TB</option><option>RL</option><option>BT</option></select></label><label>{{ t({ en: 'Crossing reduction', ja: '交差の削減' }) }} <select v-model="crossingReduction"><option value="none">{{ t({ en: 'none', ja: 'なし' }) }}</option><option value="barycenter">{{ t({ en: 'barycenter', ja: '重心法' }) }}</option><option value="median">{{ t({ en: 'median', ja: '中央値法' }) }}</option></select></label><label>{{ t({ en: 'Graph layout', ja: 'レイアウト' }) }} <select v-model="layoutKind"><option value="layered">{{ t({ en: 'layered', ja: '階層' }) }}</option><option value="tree">{{ t({ en: 'tree', ja: 'ツリー' }) }}</option><option value="radial">{{ t({ en: 'radial', ja: '放射状' }) }}</option><option value="circular" :disabled="!forceAvailable">{{ t({ en: 'circular', ja: '円形' }) }}</option><option value="grid">{{ t({ en: 'grid', ja: 'グリッド' }) }}</option><option value="concentric" :disabled="!forceAvailable">{{ t({ en: 'concentric', ja: '同心円' }) }}</option><option value="force" :disabled="!forceAvailable">{{ t({ en: 'force', ja: '力学モデル' }) }}</option></select></label><label><input v-model="custom" type="checkbox"> {{ t({ en: 'Custom nodes', ja: 'カスタムノード' }) }}</label><label><input v-model="graphEditing" type="checkbox"> {{ t({ en: 'Edit graph', ja: 'グラフを編集' }) }}</label><label v-if="graphEditing && preset === 'manufacturing'"><input v-model="nestedGroups" type="checkbox"> {{ t({ en: 'Nested groups', ja: '入れ子のグループ' }) }}</label><button v-if="graphEditing" type="button" :disabled="!canFitSelection" @click="fitSelection()">{{ t({ en: 'Fit selection', ja: '選択範囲に合わせる' }) }}</button><label>{{ t({ en: 'Search nodes', ja: 'ノードを検索' }) }} <input v-model="query" type="search" @keydown.enter="findFirstMatch"></label></div>
      </div>
      <div v-if="graphEditing" class="graph-tools">
        <label><input v-model="snapToGrid" type="checkbox"> {{ t({ en: 'Snap to grid', ja: 'グリッドに吸着' }) }}</label>
        <label><input v-model="alignmentGuides" type="checkbox"> {{ t({ en: 'Alignment guides', ja: '整列ガイド' }) }}</label>
        <label v-if="preset === 'manufacturing'"><input v-model="collapsibleGroups" type="checkbox"> {{ t({ en: 'Collapsible groups', ja: 'グループの折りたたみ' }) }}</label>
        <label><input v-model="editableEdges" type="checkbox"> {{ t({ en: 'Editable edges', ja: '辺の編集' }) }}</label>
        <label><input v-model="resizableNodes" type="checkbox"> {{ t({ en: 'Resizable nodes', ja: 'ノードのサイズ変更' }) }}</label>
        <label><input v-model="labelEditing" type="checkbox"> {{ t({ en: 'Edit labels', ja: 'ラベルを編集' }) }}</label>
        <label><input v-model="lassoSelect" type="checkbox"> {{ t({ en: 'Lasso selection', ja: '投げ縄選択' }) }}</label>
        <label><input v-model="itemSlots" type="checkbox"> {{ t({ en: 'Item toolbars', ja: '要素のツールバー' }) }}</label>
        <label><input v-model="typedPorts" type="checkbox"> {{ t({ en: 'Typed ports', ja: '型付きポート' }) }}</label>
        <label>{{ t({ en: 'Edge style', ja: '辺のスタイル' }) }} <select v-model="edgeStyle"><option value="curve">{{ t({ en: 'curve', ja: '曲線' }) }}</option><option value="orthogonal">{{ t({ en: 'orthogonal', ja: '直交' }) }}</option><option value="straight">{{ t({ en: 'straight', ja: '直線' }) }}</option></select></label>
        <div class="graph-palette" role="group" :aria-label="t({ en: 'Node palette', ja: 'ノードのパレット' })">
          <button v-for="item in paletteItems" :key="item.kind" type="button" class="palette-chip" draggable="true"
            @dragstart="startPaletteDrag($event, item.kind)" @click="addPaletteNode(item.kind)">{{ item.label }}</button>
        </div>
        <span class="hint">{{ t({ en: 'Drag a chip onto the graph, or activate it to add a node at the centre of the view.', ja: 'チップをグラフへドラッグするか、押して表示の中央にノードを追加します。' }) }}</span>
      </div>
      <div @keydown.esc.capture="gesture.cancelling = gesture.count > 0" @keydown.esc="gesture.cancelling || clearSelection()">
        <NetworkGraph ref="graph" v-model:selected-id="selected" :nodes="data.nodes" :edges="data.edges" :options="{ direction, crossingReduction }" :layout="graphLayout" :labels="labels.graph" :height="direction === 'TB' || direction === 'BT' ? 470 : graphEditing || preset === 'large' ? 345 : 245"
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
          :editable-labels="graphEditing && labelEditing" :validate-label-edit="validateLabel" @label-edit="commitLabel"
          @label-edit-rejected="(_change, reason) => status = reason" :selection-mode="graphEditing && lassoSelect ? 'lasso' : 'box'"
          @node-move="commitNodes([$event])" @nodes-move="commitNodes" @connect="commitConnection" @reconnect="commitReconnect" @connect-rejected="(_connection, reason) => status = reason"
          @background-click="clearSelection" @gesture-start="gesture.count++" @gesture-end="gesture.count--">
          <template v-if="custom" #node="{ node, box, selected: active }">
            <rect x="3" y="3" :width="box.width - 6" :height="box.height - 6" rx="4" :style="{ fill: active ? '#174878' : 'var(--vw-surface, #fff)' }" />
            <text x="12" y="24" style="font-size: 14px">{{ node.label }}</text><text x="12" y="44" style="font-size: 10px">{{ node.detail || node.id }}</text>
          </template>
          <template v-if="graphEditing && itemSlots" #node-toolbar="{ node }">
            <button type="button" @click="fitSelection({ kind: 'node', id: node.id })">{{ t({ en: 'Frame', ja: '表示' }) }}</button>
            <button type="button" @click="proposeDeletion(deletionForTarget({ kind: 'node', id: node.id }))">{{ t({ en: 'Remove', ja: '削除' }) }}</button>
          </template>
          <template v-if="graphEditing && itemSlots" #edge-toolbar="{ edge }">
            <button type="button" @click="proposeDeletion(deletionForTarget({ kind: 'edge', id: edge.id }))">{{ t({ en: 'Remove', ja: '削除' }) }}</button>
          </template>
          <template v-if="graphEditing && itemSlots" #group="{ group: item, box, depth }">
            <rect class="demo-group-frame" :x="box.x" :y="box.y" :width="box.width" :height="box.height" rx="12" />
            <text class="demo-group-label" :x="box.x + 10" :y="box.y + 15">{{ item.label }}{{ depth ? t({ en: ' (nested)', ja: '(入れ子)' }) : '' }}</text>
          </template>
          <template v-if="graphEditing && itemSlots" #minimap-node="{ box, selected: active }">
            <circle class="demo-minimap-node" :class="{ 'is-selected': active }" :cx="box.x + box.width / 2" :cy="box.y + box.height / 2" :r="Math.min(box.width, box.height) / 2" />
          </template>
          <template v-if="graphEditing" #tooltip="{ target }">
            <template v-if="target.kind === 'node'"><strong>{{ target.node.label }}</strong><br>{{ target.node.detail ?? t({ en: 'No detail', ja: '詳細なし' }) }} · {{ degree(target.node.id) }}</template>
            <template v-else>{{ nodeLabel(target.edge.from) }} → {{ nodeLabel(target.edge.to) }}<template v-if="target.edge.label"> · {{ target.edge.label }}</template></template>
          </template>
        </NetworkGraph>
      </div>
      <p v-if="graphEditing" class="hint">{{ t({
        en: 'Drag between ports to connect. Select an edge to move an endpoint. Shift-drag the canvas to select a region. Press Delete to remove the selection; right-click or press Shift+F10 for more actions. Ctrl+C, Ctrl+V and Ctrl+D (⌘ on macOS) copy, paste and duplicate nodes. Click the empty canvas or press Escape to clear the selection.',
        ja: 'ポートの間をドラッグして接続します。辺を選ぶと端点を動かせます。Shift を押しながらキャンバスをドラッグすると範囲を選択します。Delete で選択を削除し、右クリックか Shift+F10 で他の操作を開きます。Ctrl+C、Ctrl+V、Ctrl+D(macOS では ⌘)でノードをコピー、貼り付け、複製します。何もない所をクリックするか Escape で選択を解除します。',
      }) }}</p>
      <PortRulesDemo v-if="graphEditing && typedPorts" />
      <div v-if="menu" ref="menuElement" class="graph-menu" role="menu" :aria-label="menu.label"
        :style="{ left: menu.x + 'px', top: menu.y + 'px' }" @keydown="menuKeydown" @contextmenu.prevent>
        <button v-for="item in menu.items" :key="item.label" type="button" role="menuitem" tabindex="-1" @click="runMenuItem(item)">{{ item.label }}</button>
      </div>
    </section>
    <section>
      <div class="section-head"><div><h2>{{ t({ en: 'Timeline', ja: 'タイムライン' }) }}</h2><p>{{ t({ en: data.rows.length.toLocaleString('en-US') + ' rows · ' + data.bars.length.toLocaleString('en-US') + ' intervals · UTC', ja: data.rows.length.toLocaleString(intlLocale) + ' 行 · ' + data.bars.length.toLocaleString(intlLocale) + ' 区間 · UTC' }) }}</p></div>
        <div class="options"><label><input v-model="locked" type="checkbox"> {{ t({ en: 'Reject edits', ja: '編集を却下' }) }}</label><label><input v-model="advancedTimeline" type="checkbox"> {{ t({ en: 'Planning overlays', ja: '計画のオーバーレイ' }) }}</label><button v-if="preset === 'scale'" @click="timeline?.scrollToRow('r999')">{{ t({ en: 'Last resource', ja: '最後のリソース' }) }}</button><button @click="reset()">{{ t({ en: 'Reset', ja: 'リセット' }) }}</button></div>
      </div>
      <GanttChart @background-click="clearSelection" ref="timeline" :key="preset" :rows="timelineRows" :bars="timelineBars" :dependencies="data.dependencies"
        :range="range" :pixels-per-unit="115 / hour" :lane-count="preset === 'manufacturing' || preset === 'large' ? 2 : 1" :height="advancedTimeline ? 420 : preset === 'scale' ? 330 : 290"
        v-model:collapsed-ids="collapsedRows" :header-bands="advancedTimeline ? headerBands : undefined"
        :markers="advancedTimeline ? markers : undefined" :columns="advancedTimeline ? columns : undefined"
        :show-summaries="advancedTimeline" :validate-cell-edit="validateCell"
        @cell-edit="commitCell" @cell-edit-rejected="(_change, reason) => status = reason"
        :format-time="formatTime" :labels="labels.gantt" :selected-ids="selectedBars" :validate-edit="validate"
        @select="selectBar" @edit="commit" @edit-rejected="(_change, reason) => status = reason">
        <template #legend><span class="hint">{{ t({ en: 'Drag to move · Drag ends to resize · Focus a bar to edit with arrow keys', ja: 'ドラッグで移動 · 端のドラッグで伸縮 · バーにフォーカスして矢印キーで編集' }) }}</span></template>
        <template #row-heading>{{ t({ en: 'Resource', ja: 'リソース' }) }}</template>
      </GanttChart>
      <StatusLine>{{ status }}</StatusLine>
      <output class="vw-sr-only" :aria-label="t({ en: 'Select events', ja: '選択イベント' })">{{ selectCount }}</output>
    </section>
  </div>
</template>
