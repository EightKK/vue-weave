<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref } from 'vue'
import {
  GanttChart, assignLanes, calculateResourceLoad, calendarBands, fromMsProjectXml, moveTimelineRow, parseCsv, removeTimelineBars,
  timelineFromCsvTable, timelineFromMsProject, timelineLabelColumnId, timelineWbsCodes, useEditHistory, type TimelineBar, type TimelineColumn, type TimelineColumnResize, type TimelineConnection, type TimelineContextMenu, type TimelineCreate, type TimelineDependency,
  type TimelineEdit, type TimelineProgressEdit, type TimelineReconnect, type TimelineRow, type TimelineRowMove, type TimelineZoomPreset,
  type TimelineZoomState,
} from '../src'
import { formatTime, hour, origin } from './data'
import { download, imageSize } from './download'
import DemoPanel from './components/DemoPanel.vue'
import StatusLine from './components/StatusLine.vue'
import { unusedNumber } from './ids'
import { useDemoLocale } from './i18n'

const { t, labels: componentLabels } = useDemoLocale()

const range = { start: origin, end: origin + 10 * hour }
const quarter = hour / 4
// The web team reports to the platform team, so indenting and outdenting rows changes the WBS codes.
const initialRows: TimelineRow[] = [
  { id: 'product', label: t({ en: 'Product team', ja: '製品チーム' }), detail: t({ en: 'Design pool', ja: 'デザインの要員' }) },
  { id: 'platform', label: t({ en: 'Platform team', ja: '基盤チーム' }), detail: t({ en: 'Engineering pool', ja: '開発の要員' }) },
  { id: 'web', label: t({ en: 'Web team', ja: 'Web チーム' }), detail: t({ en: 'Engineering pool', ja: '開発の要員' }), parentId: 'platform' },
  { id: 'quality', label: t({ en: 'Quality', ja: '品質' }), detail: t({ en: 'Acceptance only', ja: '受け入れのみ' }) },
]
const initialBars: TimelineBar[] = [
  { id: 'wireframes', rowId: 'product', label: t({ en: 'Wireframes', ja: 'ワイヤーフレーム' }), start: origin, end: origin + 2 * hour, editable: true, tone: 'violet', progress: 0.6 },
  { id: 'api', rowId: 'platform', label: t({ en: 'Billing API', ja: '請求 API' }), start: origin + 2 * hour, end: origin + 5 * hour, editable: true, progress: 0.3 },
  { id: 'ui', rowId: 'web', label: t({ en: 'Checkout UI', ja: '購入画面' }), start: origin + 2 * hour, end: origin + 6 * hour, editable: true, progress: 0.1 },
  { id: 'tests', rowId: 'quality', label: t({ en: 'Acceptance tests', ja: '受け入れテスト' }), start: origin + 6 * hour, end: origin + 8 * hour, editable: true, tone: 'teal' },
]
const initialDependencies: TimelineDependency[] = [{ id: 'wireframes-api', from: 'wireframes', to: 'api' }]
const resources = [
  { id: 'design', label: t({ en: 'Design pool', ja: 'デザインの要員' }), capacity: 1 },
  { id: 'engineering', label: t({ en: 'Engineering pool', ja: '開発の要員' }), capacity: 1 },
]
const initialAssignments = new Map([['wireframes', 'design'], ['api', 'engineering'], ['ui', 'engineering'], ['tests', 'engineering']])
// Tasks added from the context menu draw on the pool of their row.
const rowResources = new Map([['product', 'design'], ['platform', 'engineering'], ['web', 'engineering']])
const zoomPresets: TimelineZoomPreset[] = [
  { id: 'hours', label: t({ en: 'Hours', ja: '時間' }), pixelsPerUnit: 115 / hour, tickSteps: [hour], headerBands: [calendarBands(range, 'day', { label: start => t({ en: 'Day ', ja: '日付 ' }) + new Date(start).toISOString().slice(0, 10) })] },
  { id: 'shifts', label: t({ en: 'Shifts', ja: 'シフト' }), pixelsPerUnit: 45 / hour, tickSteps: [4 * hour], headerBands: [calendarBands(range, 'hour', { step: 4, label: start => t({ en: 'Shift from ' + formatTime(start), ja: formatTime(start) + ' からのシフト' }) })] },
]

// Accepted changes are committed as immutable snapshots, so Undo restores deleted bars and their dependencies. Column
// widths accepted from `column-resize` are part of the same history.
const history = useEditHistory({ rows: initialRows, bars: initialBars, dependencies: initialDependencies, widths: {} as Readonly<Record<string, number>> })
const { state: model, canUndo, canRedo } = history
const selection = ref(new Set<string>())
const selectedDependency = ref<string>()
const preset = ref('hours')
const zoomState = ref(t({ en: '100% · hours', ja: '100% · 時間' }))
const status = ref(t({ en: 'Select bars with Ctrl, Meta or Shift. Use link handles to add dependencies.', ja: 'Ctrl、Meta、Shift でバーを複数選択できます。リンクのハンドルで依存関係を追加します。' }))
const labels = computed(() => new Map(model.value.bars.map(bar => [bar.id, bar.label])))
const rows = computed(() => model.value.rows)
const rowLabel = (id: string) => model.value.rows.find(row => row.id === id)?.label
// "Reorder rows" adds a WBS column numbered from the current hierarchy and a move handle on each row.
const reorder = ref(false)
const wbs = computed(() => timelineWbsCodes(model.value.rows))
// "Resize columns" shows the WBS column too and adds a resize separator to each column header.
const resizable = ref(false)
// Ctrl+wheel (or Meta+wheel and trackpad pinches) zooms around the pointer when this is on; a plain wheel always scrolls.
const wheel = ref(false)
const columns = computed<TimelineColumn[] | undefined>(() => reorder.value || resizable.value
  ? [{ id: 'wbs', label: 'WBS', width: model.value.widths.wbs ?? 52, value: row => wbs.value.get(row.id) ?? '' }] : undefined)
const labelWidth = computed(() => model.value.widths[timelineLabelColumnId])
// Milestones do no work, so an imported milestone takes no capacity.
const load = computed(() => calculateResourceLoad(range,
  model.value.bars.map(bar => ({ id: bar.id, work: bar.end > bar.start ? [{ start: bar.start, end: bar.end }] : [] })), resources,
  model.value.bars.flatMap(bar => {
    const resourceId = initialAssignments.get(bar.id) ?? rowResources.get(bar.rowId)
    return resourceId ? [{ resourceId, taskId: bar.id }] : []
  })))

function commit(bars: TimelineBar[], dependencies = model.value.dependencies) {
  history.commit({ ...model.value, bars, dependencies })
}
function reset() {
  history.reset({ rows: [...initialRows], bars: [...initialBars], dependencies: [...initialDependencies], widths: {} })
  selection.value = new Set()
  selectedDependency.value = undefined
  status.value = t({ en: 'Timeline editing example reset.', ja: 'タイムライン編集の例を初期状態に戻しました。' })
}
function undo() {
  history.undo()
  status.value = t({ en: 'Undid the last timeline change.', ja: '直前のタイムラインの変更を元に戻しました。' })
}
function redo() {
  history.redo()
  status.value = t({ en: 'Redid the timeline change.', ja: 'タイムラインの変更をやり直しました。' })
}
function validateConnection(connection: TimelineConnection, replacing?: string) {
  if (model.value.dependencies.some(dep => dep.id !== replacing && dep.from === connection.from && dep.to === connection.to)) {
    return t({ en: 'These bars are already linked.', ja: 'これらのバーはすでにつながっています。' })
  }
}
function connect(connection: TimelineConnection) {
  const number = unusedNumber(model.value.dependencies, 'link-', model.value.dependencies.length + 1)
  commit(model.value.bars, [...model.value.dependencies, { id: 'link-' + number, ...connection }])
  status.value = t({
    en: `Added ${connection.type} dependency from ${labels.value.get(connection.from)} to ${labels.value.get(connection.to)}.`,
    ja: `${labels.value.get(connection.from)} から ${labels.value.get(connection.to)} への ${connection.type} 依存関係を追加しました。`,
  })
}
function reconnect(change: TimelineReconnect) {
  commit(model.value.bars, model.value.dependencies.map(dep => dep.id === change.id ? { ...dep, ...change.after } : dep))
  status.value = t({ en: `Reconnected ${change.id} as ${change.after.type} to ${labels.value.get(change.after.to)}.`, ja: `${change.id} を ${labels.value.get(change.after.to)} への ${change.after.type} につなぎ替えました。` })
}
function removeDependency(id: string) {
  commit(model.value.bars, model.value.dependencies.filter(dep => dep.id !== id))
  selectedDependency.value = undefined
  status.value = t({ en: 'Deleted dependency ' + id + '.', ja: '依存関係 ' + id + ' を削除しました。' })
}
function validateEdit(change: TimelineEdit) {
  if (change.row?.after === 'quality' && change.id !== 'tests') return t({ en: 'Only acceptance work can move to Quality.', ja: '品質に移せるのは受け入れの作業だけです。' })
}
function validateEdits(changes: readonly TimelineEdit[]) {
  for (const change of changes) {
    const reason = validateEdit(change)
    if (reason) return reason
  }
}
function apply(changes: readonly TimelineEdit[]) {
  const byId = new Map(changes.map(change => [change.id, change]))
  commit(model.value.bars.map(bar => {
    const change = byId.get(bar.id)
    return change ? { ...bar, ...change.after, rowId: change.row?.after ?? bar.rowId } : bar
  }))
  const [first] = changes
  status.value = changes.length > 1 ? t({ en: `Moved ${changes.length} bars.`, ja: `${changes.length} 本のバーを移動しました。` })
    : first?.row ? t({ en: `Moved ${labels.value.get(first.id)} to ${rowLabel(first.row.after)}.`, ja: `${labels.value.get(first.id)} を ${rowLabel(first.row.after)} に移動しました。` })
      : t({ en: `${labels.value.get(first!.id)} → ${formatTime(first!.after.start)}–${formatTime(first!.after.end)}.`, ja: `${labels.value.get(first!.id)} → ${formatTime(first!.after.start)}–${formatTime(first!.after.end)}。` })
}
function setProgress(id: string, progress: number) {
  commit(model.value.bars.map(bar => bar.id === id ? { ...bar, progress } : bar))
  status.value = t({ en: `${labels.value.get(id)} progress ${Math.round(progress * 100)}%.`, ja: `${labels.value.get(id)} の進捗 ${Math.round(progress * 100)}%。` })
}
function applyProgress(change: TimelineProgressEdit) {
  setProgress(change.id, change.after)
}
function validateBarsDelete(ids: readonly string[]) {
  if (ids.length >= model.value.bars.length) return t({ en: 'Keep at least one task in the plan.', ja: '計画には少なくとも1つのタスクを残してください。' })
}
function deleteBars(ids: readonly string[]) {
  const names = ids.map(id => labels.value.get(id))
  // Dependencies that touch a deleted bar are removed with it, in the same undo step.
  const next = removeTimelineBars(model.value.bars, model.value.dependencies, ids)
  commit(next.bars, next.dependencies)
  selection.value = new Set([...selection.value].filter(id => !ids.includes(id)))
  status.value = ids.length > 1 ? t({ en: `Deleted ${ids.length} bars.`, ja: `${ids.length} 本のバーを削除しました。` }) : t({ en: `Deleted ${names[0]}.`, ja: `${names[0]} を削除しました。` })
}
/** Add a new task with a fresh ID and label as one undoable step. */
function addBar(rowId: string, start: number, end: number, lane?: number) {
  const number = unusedNumber(model.value.bars, 'task-')
  const bar: TimelineBar = { id: 'task-' + number, rowId, label: t({ en: 'New task ', ja: '新しいタスク ' }) + number, start, end, editable: true, tone: 'amber', progress: 0 }
  if (lane) bar.lane = lane
  commit([...model.value.bars, bar])
  status.value = t({ en: `Added ${bar.label} at ${formatTime(bar.start)}–${formatTime(bar.end)} to ${rowLabel(rowId)}.`, ja: `${rowLabel(rowId)} の ${formatTime(bar.start)}–${formatTime(bar.end)} に ${bar.label} を追加しました。` })
}
function addTask(rowId: string, time: number) {
  const start = Math.min(range.end - hour, Math.max(range.start, Math.round(time / quarter) * quarter))
  addBar(rowId, start, start + hour)
}
// Drag across an empty part of a row (or use its + button) to propose a new task. The chosen lane is kept only while
// lanes are arranged, because a single-lane chart has lane 0 alone.
// "Reorder rows" shows a move handle on each team: drag it, or use Alt+Up/Down and Alt+Shift+Left/Right. Accepted
// moves are committed to the same history as bar edits, so Undo restores the previous hierarchy.
function validateRowMove(change: TimelineRowMove) {
  if (change.after.parentId === 'quality') return t({ en: 'Quality cannot contain other teams.', ja: '品質の下に他のチームは置けません。' })
}
function moveRow(change: TimelineRowMove) {
  const next = moveTimelineRow(model.value.rows, change.id, change.after)
  history.commit({ ...model.value, rows: next })
  const parent = change.after.parentId === undefined ? t({ en: 'the top level', ja: '最上位' }) : rowLabel(change.after.parentId)
  status.value = t({ en: `Moved ${rowLabel(change.id)} to ${parent} as WBS ${timelineWbsCodes(next).get(change.id)}.`, ja: `${rowLabel(change.id)} を ${parent} に移動しました(WBS ${timelineWbsCodes(next).get(change.id)})。` })
}
function validateCreate(proposal: TimelineCreate) {
  if (proposal.rowId === 'quality') return t({ en: 'New tasks cannot be added to Quality.', ja: '品質には新しいタスクを追加できません。' })
}
function create(proposal: TimelineCreate) {
  addBar(proposal.rowId, proposal.start, proposal.end, arrange.value ? proposal.lane : undefined)
}
const columnName = (id: string) => id === timelineLabelColumnId ? t({ en: 'Team', ja: 'チーム' }) : columns.value?.find(column => column.id === id)?.label ?? id
function validateColumnResize(change: TimelineColumnResize) {
  if (change.id === timelineLabelColumnId && change.after < 110) return t({ en: 'The team column needs at least 110 px.', ja: 'チームの列には 110 px 以上の幅が必要です。' })
}
function resizeColumn(change: TimelineColumnResize) {
  history.commit({ ...model.value, widths: { ...model.value.widths, [change.id]: change.after } })
  status.value = t({ en: `Resized the ${columnName(change.id)} column to ${change.after} px.`, ja: `${columnName(change.id)}の列の幅を ${change.after} px にしました。` })
}
// "Import CSV" reads a file in the layout of `timelineCsvTable` (Row, WBS, Bar, Start, End, Progress, with times as
// ISO 8601 or as HH:MM on the demo day) and replaces the rows and bars as one undoable step.
function parseDemoTime(text: string) {
  const clock = /^(\d{1,2}):(\d{2})$/.exec(text.trim())
  return clock ? origin - 8 * hour + Number(clock[1]) * hour + Number(clock[2]) * 60_000 : Date.parse(text)
}
async function importCsv(event: Event) {
  const input = event.currentTarget as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  try {
    const imported = timelineFromCsvTable(parseCsv(await file.text()), { parseTime: parseDemoTime })
    if (!imported.bars.length) throw new Error(t({ en: 'The file has no bars.', ja: 'ファイルにバーがありません。' }))
    history.commit({
      ...model.value,
      rows: imported.rows,
      bars: imported.bars.map(bar => ({ ...bar, editable: true })),
      dependencies: [],
    })
    selection.value = new Set()
    selectedDependency.value = undefined
    status.value = t({ en: `Imported ${imported.bars.length} bars in ${imported.rows.length} rows from ${file.name}.`, ja: `${file.name} から ${imported.rows.length} 行・${imported.bars.length} 本のバーを読み込みました。` })
  } catch (error) {
    status.value = t({ en: 'Import failed: ', ja: '読み込みに失敗しました: ' }) + (error instanceof Error ? error.message : String(error))
  }
}
// "Import MS Project XML" reads a Microsoft Project XML (MSPDI) file whose wall-clock dates are UTC, like this demo, and
// replaces the rows, bars and dependencies as one undoable step. Summary tasks become parent rows without bars, and what
// the reader cannot import (such as links from unknown tasks or lags in percent) is counted as warnings.
async function importMsProject(event: Event) {
  const input = event.currentTarget as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  try {
    const project = fromMsProjectXml(await file.text())
    const timeline = timelineFromMsProject(project)
    if (!timeline.bars.length) throw new Error(t({ en: 'The file has no tasks.', ja: 'ファイルにタスクがありません。' }))
    history.commit({
      ...model.value,
      rows: timeline.rows,
      bars: timeline.bars.map(bar => ({ ...bar, editable: true })),
      dependencies: timeline.dependencies,
    })
    selection.value = new Set()
    selectedDependency.value = undefined
    const warnings = project.warnings.length === 1 ? ' with 1 warning' : project.warnings.length ? ` with ${project.warnings.length} warnings` : ''
    status.value = t({
      en: `Imported ${timeline.bars.length} tasks and ${timeline.dependencies.length} dependencies from ${file.name}${warnings}.`,
      ja: `${file.name} からタスク ${timeline.bars.length} 件と依存関係 ${timeline.dependencies.length} 件を読み込みました${project.warnings.length ? `(警告 ${project.warnings.length} 件)` : ''}。`,
    })
  } catch (error) {
    status.value = t({ en: 'Import failed: ', ja: '読み込みに失敗しました: ' }) + (error instanceof Error ? error.message : String(error))
  }
}
// "Auto-arrange lanes" stacks overlapping bars of a row. keepLanes keeps every bar that fits in its lane, so only a
// new or moved bar that overlaps another one changes lane.
const arrange = ref(false)
const arranged = computed(() => arrange.value ? assignLanes(model.value.bars, { keepLanes: true }) : undefined)
const shownBars = computed(() => arranged.value?.bars
  ?? (model.value.bars.some(bar => bar.lane) ? model.value.bars.map(bar => ({ ...bar, lane: 0 })) : model.value.bars))
const laneCount = computed(() => arranged.value?.laneCount ?? 1)
// GanttChart needs rowHeight >= 8 + laneCount × 14; 26 px per lane keeps the bar labels readable.
const rowHeight = computed(() => Math.max(66, 8 + laneCount.value * 26))
const chart = ref<InstanceType<typeof GanttChart>>()
const rtl = ref(false)
function exportSvg() {
  const svg = chart.value?.exportSvg({ title: t({ en: 'Timeline editing', ja: 'タイムライン編集' }), rowHeading: t({ en: 'Team', ja: 'チーム' }) })
  if (!svg) return
  download(svg, 'timeline.svg')
  status.value = t({ en: 'Exported SVG (' + svg.length + ' characters).', ja: 'SVG を出力しました(' + svg.length + ' 文字)。' })
}
async function exportPng() {
  try {
    const blob = await chart.value?.exportPng({ scale: 2, rowHeading: t({ en: 'Team', ja: 'チーム' }) })
    if (!blob) return
    download(blob, 'timeline.png')
    const size = await imageSize(blob)
    status.value = t({ en: 'Exported PNG ' + size + '.', ja: 'PNG を出力しました(' + size + ')。' })
  } catch (error) {
    status.value = error instanceof Error ? error.message : String(error)
  }
}
function onZoom(state: TimelineZoomState) {
  const preset = zoomPresets.find(item => item.id === state.preset)
  zoomState.value = Math.round(state.zoom * 100) + '% · ' + t({ en: state.preset ?? 'custom', ja: preset?.label ?? 'カスタム' })
}
async function fit(ids?: readonly string[]) {
  await chart.value?.fitToBars(ids)
  status.value = ids
    ? t({ en: `Fitted ${ids.length === 1 ? labels.value.get(ids[0]!) : ids.length + ' bars'} into view.`, ja: `${ids.length === 1 ? labels.value.get(ids[0]!) : ids.length + ' 本のバー'}に合わせて表示しました。` })
    : t({ en: 'Fitted all bars into view.', ja: 'すべてのバーが見えるように表示しました。' })
}

// A demo-rendered context menu. The chart only reports the target, time and row; the menu, its items and focus
// handling belong to the application.
interface MenuItem { label: string; run: () => void }
const menu = ref<{ x: number; y: number; title: string; items: MenuItem[] }>()
const menuElement = ref<HTMLElement>()
let returnFocus: HTMLElement | undefined
function openMenu(event: TimelineContextMenu) {
  const { target } = event
  const items: MenuItem[] = []
  let title = t({ en: 'Timeline actions', ja: 'タイムラインの操作' })
  if (target.kind === 'bar') {
    const bar = model.value.bars.find(item => item.id === target.id)!
    title = t({ en: 'Actions for ' + bar.label, ja: bar.label + ' の操作' })
    items.push({ label: t({ en: 'Delete', ja: '削除' }), run: () => removeFromMenu([bar.id]) })
    items.push({ label: t({ en: 'Set progress to 100%', ja: '進捗を 100% にする' }), run: () => setProgress(bar.id, 1) })
    items.push({ label: t({ en: 'Fit to bar', ja: 'バーに合わせる' }), run: () => void fit([bar.id]) })
  } else if (target.kind === 'dependency') {
    title = t({ en: 'Actions for dependency ' + target.id, ja: '依存関係 ' + target.id + ' の操作' })
    items.push({ label: t({ en: 'Delete dependency', ja: '依存関係を削除' }), run: () => removeDependency(target.id) })
  } else {
    if (event.rowId !== undefined && event.time !== undefined) {
      const { rowId, time } = event
      title = t({ en: 'Actions for ' + rowLabel(rowId), ja: rowLabel(rowId) + ' の操作' })
      items.push({ label: t({ en: 'Add task here', ja: 'ここにタスクを追加' }), run: () => addTask(rowId, time) })
    }
    items.push({ label: t({ en: 'Fit all bars', ja: 'すべてのバーを表示' }), run: () => void fit() })
  }
  returnFocus = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : undefined
  menu.value = { x: event.clientX, y: event.clientY, title, items }
  document.addEventListener('pointerdown', closeOnOutsidePointer, true)
  void nextTick(() => {
    const element = menuElement.value
    if (!element) return
    // Keep the menu inside the window.
    const rect = element.getBoundingClientRect()
    menu.value = { ...menu.value!, x: Math.max(4, Math.min(menu.value!.x, innerWidth - rect.width - 4)), y: Math.max(4, Math.min(menu.value!.y, innerHeight - rect.height - 4)) }
    element.querySelector<HTMLElement>('[role="menuitem"]')?.focus()
  })
}
function closeMenu(restoreFocus: boolean) {
  menu.value = undefined
  document.removeEventListener('pointerdown', closeOnOutsidePointer, true)
  if (restoreFocus) focusAfterMenu()
}
/** Return focus to where the menu was opened, or to the chart region when that element was removed. */
function focusAfterMenu() {
  const target = returnFocus?.isConnected ? returnFocus : chart.value?.$el.querySelector('.vw-gantt-scroll') as HTMLElement | null
  target?.focus({ preventScroll: true })
}
function closeOnOutsidePointer(event: PointerEvent) {
  if (!menuElement.value?.contains(event.target as Node)) closeMenu(false)
}
function choose(item: MenuItem) {
  closeMenu(false)
  item.run()
  // An action such as Delete can remove the element that had focus; wait for the update before restoring it.
  void nextTick(focusAfterMenu)
}
function removeFromMenu(ids: string[]) {
  const reason = validateBarsDelete(ids)
  if (reason) status.value = reason
  else deleteBars(ids)
}
function menuKeys(event: KeyboardEvent) {
  const items = [...menuElement.value?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []]
  const index = items.indexOf(document.activeElement as HTMLElement)
  const move = (next: number) => items[(next + items.length) % items.length]?.focus()
  if (event.key === 'ArrowDown') move(index + 1)
  else if (event.key === 'ArrowUp') move(index - 1)
  else if (event.key === 'Home') move(0)
  else if (event.key === 'End') move(items.length - 1)
  else if (event.key === 'Escape' || event.key === 'Tab') closeMenu(true)
  else return
  event.preventDefault()
}
onBeforeUnmount(() => document.removeEventListener('pointerdown', closeOnOutsidePointer, true))
</script>

<template>
  <DemoPanel title-id="editing-title" :title="t({ en: 'Timeline editing', ja: 'タイムライン編集' })" :subtitle="t({ en: 'Dependencies, drag to create, batch moves, row moves, progress, deletion, zoom presets and resource load · UTC', ja: '依存関係、ドラッグでの作成、一括移動、行の移動、進捗、削除、ズームプリセット、リソース負荷 · UTC' })">
    <template #options><output :aria-label="t({ en: 'Zoom state', ja: 'ズームの状態' })">{{ zoomState }}</output><button type="button" @click="reset">{{ t({ en: 'Reset timeline', ja: 'タイムラインをリセット' }) }}</button><label><input v-model="rtl" type="checkbox"> {{ t({ en: 'Right-to-left timeline', ja: '右から左のタイムライン' }) }}</label><label><input v-model="arrange" type="checkbox"> {{ t({ en: 'Auto-arrange lanes', ja: 'レーンを自動配置' }) }}</label><label><input v-model="reorder" type="checkbox"> {{ t({ en: 'Reorder rows', ja: '行を並べ替え' }) }}</label><label><input v-model="resizable" type="checkbox"> {{ t({ en: 'Resize columns', ja: '列幅を変更' }) }}</label><label><input v-model="wheel" type="checkbox"> {{ t({ en: 'Ctrl+wheel zoom', ja: 'Ctrl+ホイールで拡大縮小' }) }}</label><button type="button" @click="chart?.scrollToTime(origin + 4 * hour)">{{ t({ en: 'Scroll to 12:00', ja: '12:00 へスクロール' }) }}</button><button type="button" @click="exportSvg">{{ t({ en: 'Export SVG', ja: 'SVG で出力' }) }}</button><button type="button" @click="exportPng">{{ t({ en: 'Export PNG', ja: 'PNG で出力' }) }}</button></template>
    <div class="options editing-actions" role="group" :aria-label="t({ en: 'History and fit', ja: '履歴と表示範囲' })">
      <button type="button" :disabled="!canUndo" @click="undo">{{ t({ en: 'Undo timeline change', ja: 'タイムラインの変更を元に戻す' }) }}</button>
      <button type="button" :disabled="!canRedo" @click="redo">{{ t({ en: 'Redo timeline change', ja: 'タイムラインの変更をやり直す' }) }}</button>
      <button type="button" @click="fit()">{{ t({ en: 'Fit all bars', ja: 'すべてのバーを表示' }) }}</button>
      <button type="button" :disabled="!selection.size" @click="fit([...selection])">{{ t({ en: 'Fit selection', ja: '選択に合わせる' }) }}</button>
      <label class="import-file">{{ t({ en: 'Import CSV', ja: 'CSV を読み込む' }) }} <input type="file" accept=".csv,text/csv" @change="importCsv"></label>
      <label class="import-file">{{ t({ en: 'Import MS Project XML', ja: 'MS Project XML を読み込む' }) }} <input type="file" accept=".xml,application/xml,text/xml" @change="importMsProject"></label>
    </div>
    <GanttChart ref="chart" :dir="rtl ? 'rtl' : 'ltr'" :rows="rows" :bars="shownBars" :dependencies="model.dependencies" :range="range" :format-time="formatTime"
      :height="430" :lane-count="laneCount" :row-height="rowHeight" connectable reconnectable multi-select row-draggable pinch-zoom :wheel-zoom="wheel" show-now :now="origin + 3.5 * hour"
      progress-editable deletable context-menu creatable :validate-create="validateCreate" :columns="columns"
      :columns-resizable="resizable" :label-width="labelWidth" :validate-column-resize="validateColumnResize"
      @column-resize="resizeColumn" @column-resize-rejected="(_change, reason) => status = reason"
      :rows-reorderable="reorder" :validate-row-move="validateRowMove" @row-move="moveRow" @row-move-rejected="(_change, reason) => status = reason"
      v-model:selected-ids="selection" v-model:selected-dependency-id="selectedDependency" v-model:zoom-preset="preset"
      :zoom-presets="zoomPresets" :validate-connection="validateConnection" :validate-edit="validateEdit" :validate-edits="validateEdits"
      :validate-bars-delete="validateBarsDelete"
      :load-rows="resources" :load-segments="load" :labels="{ ...componentLabels.gantt, region: t({ en: 'Editable timeline', ja: '編集できるタイムライン' }), rows: t({ en: 'Team', ja: 'チーム' }) }"
      @connect="connect" @reconnect="reconnect" @connect-rejected="(_connection, reason) => status = reason"
      @dependency-select="id => status = t({ en: 'Selected dependency ' + id + '. Press Delete to remove it.', ja: '依存関係 ' + id + ' を選択しました。Delete で削除します。' })"
      @dependency-delete="removeDependency" @edit="apply([$event])" @edits="apply" @zoom-change="onZoom"
      @edit-rejected="(_change, reason) => status = reason" @edits-rejected="(_changes, reason) => status = reason"
      @progress-edit="applyProgress" @bars-delete="deleteBars" @bars-delete-rejected="(_ids, reason) => status = reason"
      @create="create" @create-rejected="(_proposal, reason) => status = reason" @context-menu="openMenu">
      <template #row-heading>{{ t({ en: 'Team', ja: 'チーム' }) }}</template>
      <template #legend><span class="hint">{{ t({ en: 'Drag across an empty row or press + to add a task · Ctrl/Shift-click selects several bars · Up/Down moves rows · Delete removes · Right-click or Shift+F10 for actions · Pinch to zoom on touch', ja: '空いている行をドラッグするか + でタスクを追加 · Ctrl/Shift+クリックで複数選択 · 上下キーで行を移動 · Delete で削除 · 右クリックか Shift+F10 で操作 · タッチではピンチで拡大縮小' }) }}</span></template>
      <template #tooltip="{ bar, range: shown }">
        <strong>{{ bar.label }}</strong><br>{{ formatTime(shown.start) }}–{{ formatTime(shown.end) }} · {{ Math.round((bar.progress ?? 0) * 100) }}{{ t({ en: '% complete', ja: '% 完了' }) }}
      </template>
    </GanttChart>
    <StatusLine>{{ status }}</StatusLine>
    <div v-if="menu" ref="menuElement" class="context-menu" role="menu" :aria-label="menu.title"
      :style="{ left: menu.x + 'px', top: menu.y + 'px' }" @keydown="menuKeys">
      <button v-for="item in menu.items" :key="item.label" type="button" role="menuitem" tabindex="-1" @click="choose(item)">{{ item.label }}</button>
    </div>
  </DemoPanel>
</template>

<style scoped>
.editing-actions { flex-wrap: wrap; gap: 8px; margin-bottom: 8px; }
.import-file { display: inline-flex; align-items: center; gap: 6px; }
.import-file input { max-width: 220px; }
.context-menu { position: fixed; z-index: 30; display: flex; flex-direction: column; min-width: 170px; padding: 4px; border: 1px solid var(--vw-border, #c6d7e2); border-radius: 7px; background: var(--vw-surface, #fff); box-shadow: 0 6px 18px rgb(0 0 0 / .18); }
.context-menu button { border: 0; border-radius: 4px; background: transparent; color: var(--vw-text, #24465b); text-align: start; padding: 6px 10px; }
.context-menu button:hover, .context-menu button:focus-visible { background: var(--vw-surface-hover, #edf5fa); outline: 2px solid var(--vw-accent, #245e96); outline-offset: -2px; }
</style>
