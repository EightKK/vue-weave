<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref } from 'vue'
import {
  GanttChart, assignLanes, calculateResourceLoad, calendarBands, moveTimelineRow, parseCsv, removeTimelineBars, timelineFromCsvTable,
  timelineLabelColumnId, timelineWbsCodes, useEditHistory, type TimelineBar, type TimelineColumn, type TimelineColumnResize, type TimelineConnection, type TimelineContextMenu, type TimelineCreate, type TimelineDependency,
  type TimelineEdit, type TimelineProgressEdit, type TimelineReconnect, type TimelineRow, type TimelineRowMove, type TimelineZoomPreset,
  type TimelineZoomState,
} from '../src'
import { formatTime, hour, origin } from './data'
import { download, imageSize } from './download'

const range = { start: origin, end: origin + 10 * hour }
const quarter = hour / 4
// The web team reports to the platform team, so indenting and outdenting rows changes the WBS codes.
const initialRows: TimelineRow[] = [
  { id: 'product', label: 'Product team', detail: 'Design pool' },
  { id: 'platform', label: 'Platform team', detail: 'Engineering pool' },
  { id: 'web', label: 'Web team', detail: 'Engineering pool', parentId: 'platform' },
  { id: 'quality', label: 'Quality', detail: 'Acceptance only' },
]
const initialBars: TimelineBar[] = [
  { id: 'wireframes', rowId: 'product', label: 'Wireframes', start: origin, end: origin + 2 * hour, editable: true, tone: 'violet', progress: 0.6 },
  { id: 'api', rowId: 'platform', label: 'Billing API', start: origin + 2 * hour, end: origin + 5 * hour, editable: true, progress: 0.3 },
  { id: 'ui', rowId: 'web', label: 'Checkout UI', start: origin + 2 * hour, end: origin + 6 * hour, editable: true, progress: 0.1 },
  { id: 'tests', rowId: 'quality', label: 'Acceptance tests', start: origin + 6 * hour, end: origin + 8 * hour, editable: true, tone: 'teal' },
]
const initialDependencies: TimelineDependency[] = [{ id: 'wireframes-api', from: 'wireframes', to: 'api' }]
const resources = [
  { id: 'design', label: 'Design pool', capacity: 1 },
  { id: 'engineering', label: 'Engineering pool', capacity: 1 },
]
const initialAssignments = new Map([['wireframes', 'design'], ['api', 'engineering'], ['ui', 'engineering'], ['tests', 'engineering']])
// Tasks added from the context menu draw on the pool of their row.
const rowResources = new Map([['product', 'design'], ['platform', 'engineering'], ['web', 'engineering']])
const zoomPresets: TimelineZoomPreset[] = [
  { id: 'hours', label: 'Hours', pixelsPerUnit: 115 / hour, tickSteps: [hour], headerBands: [calendarBands(range, 'day', { label: start => 'Day ' + new Date(start).toISOString().slice(0, 10) })] },
  { id: 'shifts', label: 'Shifts', pixelsPerUnit: 45 / hour, tickSteps: [4 * hour], headerBands: [calendarBands(range, 'hour', { step: 4, label: start => 'Shift from ' + formatTime(start) })] },
]

// Accepted changes are committed as immutable snapshots, so Undo restores deleted bars and their dependencies. Column
// widths accepted from `column-resize` are part of the same history.
const history = useEditHistory({ rows: initialRows, bars: initialBars, dependencies: initialDependencies, widths: {} as Readonly<Record<string, number>> })
const { state: model, canUndo, canRedo } = history
const selection = ref(new Set<string>())
const selectedDependency = ref<string>()
const preset = ref('hours')
const zoomState = ref('100% · hours')
const status = ref('Select bars with Ctrl, Meta or Shift. Use link handles to add dependencies.')
const labels = computed(() => new Map(model.value.bars.map(bar => [bar.id, bar.label])))
const rows = computed(() => model.value.rows)
const rowLabel = (id: string) => model.value.rows.find(row => row.id === id)?.label
// "Reorder rows" adds a WBS column numbered from the current hierarchy and a move handle on each row.
const reorder = ref(false)
const wbs = computed(() => timelineWbsCodes(model.value.rows))
// "Resize columns" shows the WBS column too and adds a resize separator to each column header.
const resizable = ref(false)
const columns = computed<TimelineColumn[] | undefined>(() => reorder.value || resizable.value
  ? [{ id: 'wbs', label: 'WBS', width: model.value.widths.wbs ?? 52, value: row => wbs.value.get(row.id) ?? '' }] : undefined)
const labelWidth = computed(() => model.value.widths[timelineLabelColumnId])
const load = computed(() => calculateResourceLoad(range,
  model.value.bars.map(bar => ({ id: bar.id, work: [{ start: bar.start, end: bar.end }] })), resources,
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
  status.value = 'Timeline editing example reset.'
}
function undo() {
  history.undo()
  status.value = 'Undid the last timeline change.'
}
function redo() {
  history.redo()
  status.value = 'Redid the timeline change.'
}
function validateConnection(connection: TimelineConnection, replacing?: string) {
  if (model.value.dependencies.some(dep => dep.id !== replacing && dep.from === connection.from && dep.to === connection.to)) {
    return 'These bars are already linked.'
  }
}
function connect(connection: TimelineConnection) {
  let number = model.value.dependencies.length + 1
  while (model.value.dependencies.some(dep => dep.id === 'link-' + number)) number++
  commit(model.value.bars, [...model.value.dependencies, { id: 'link-' + number, ...connection }])
  status.value = `Added ${connection.type} dependency from ${labels.value.get(connection.from)} to ${labels.value.get(connection.to)}.`
}
function reconnect(change: TimelineReconnect) {
  commit(model.value.bars, model.value.dependencies.map(dep => dep.id === change.id ? { ...dep, ...change.after } : dep))
  status.value = `Reconnected ${change.id} as ${change.after.type} to ${labels.value.get(change.after.to)}.`
}
function removeDependency(id: string) {
  commit(model.value.bars, model.value.dependencies.filter(dep => dep.id !== id))
  selectedDependency.value = undefined
  status.value = 'Deleted dependency ' + id + '.'
}
function validateEdit(change: TimelineEdit) {
  if (change.row?.after === 'quality' && change.id !== 'tests') return 'Only acceptance work can move to Quality.'
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
  status.value = changes.length > 1 ? `Moved ${changes.length} bars.`
    : first?.row ? `Moved ${labels.value.get(first.id)} to ${rowLabel(first.row.after)}.`
      : `${labels.value.get(first!.id)} → ${formatTime(first!.after.start)}–${formatTime(first!.after.end)}.`
}
function setProgress(id: string, progress: number) {
  commit(model.value.bars.map(bar => bar.id === id ? { ...bar, progress } : bar))
  status.value = `${labels.value.get(id)} progress ${Math.round(progress * 100)}%.`
}
function applyProgress(change: TimelineProgressEdit) {
  setProgress(change.id, change.after)
}
function validateBarsDelete(ids: readonly string[]) {
  if (ids.length >= model.value.bars.length) return 'Keep at least one task in the plan.'
}
function deleteBars(ids: readonly string[]) {
  const names = ids.map(id => labels.value.get(id))
  // Dependencies that touch a deleted bar are removed with it, in the same undo step.
  const next = removeTimelineBars(model.value.bars, model.value.dependencies, ids)
  commit(next.bars, next.dependencies)
  selection.value = new Set([...selection.value].filter(id => !ids.includes(id)))
  status.value = ids.length > 1 ? `Deleted ${ids.length} bars.` : `Deleted ${names[0]}.`
}
/** Add a new task with a fresh ID and label as one undoable step. */
function addBar(rowId: string, start: number, end: number, lane?: number) {
  let number = 1
  while (model.value.bars.some(bar => bar.id === 'task-' + number)) number++
  const bar: TimelineBar = { id: 'task-' + number, rowId, label: 'New task ' + number, start, end, editable: true, tone: 'amber', progress: 0 }
  if (lane) bar.lane = lane
  commit([...model.value.bars, bar])
  status.value = `Added ${bar.label} at ${formatTime(bar.start)}–${formatTime(bar.end)} to ${rowLabel(rowId)}.`
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
  if (change.after.parentId === 'quality') return 'Quality cannot contain other teams.'
}
function moveRow(change: TimelineRowMove) {
  const next = moveTimelineRow(model.value.rows, change.id, change.after)
  history.commit({ ...model.value, rows: next })
  const parent = change.after.parentId === undefined ? 'the top level' : rowLabel(change.after.parentId)
  status.value = `Moved ${rowLabel(change.id)} to ${parent} as WBS ${timelineWbsCodes(next).get(change.id)}.`
}
function validateCreate(proposal: TimelineCreate) {
  if (proposal.rowId === 'quality') return 'New tasks cannot be added to Quality.'
}
function create(proposal: TimelineCreate) {
  addBar(proposal.rowId, proposal.start, proposal.end, arrange.value ? proposal.lane : undefined)
}
const columnName = (id: string) => id === timelineLabelColumnId ? 'Team' : columns.value?.find(column => column.id === id)?.label ?? id
function validateColumnResize(change: TimelineColumnResize) {
  if (change.id === timelineLabelColumnId && change.after < 110) return 'The team column needs at least 110 px.'
}
function resizeColumn(change: TimelineColumnResize) {
  history.commit({ ...model.value, widths: { ...model.value.widths, [change.id]: change.after } })
  status.value = `Resized the ${columnName(change.id)} column to ${change.after} px.`
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
    if (!imported.bars.length) throw new Error('The file has no bars.')
    history.commit({
      ...model.value,
      rows: imported.rows,
      bars: imported.bars.map(bar => ({ ...bar, editable: true })),
      dependencies: [],
    })
    selection.value = new Set()
    selectedDependency.value = undefined
    status.value = `Imported ${imported.bars.length} bars in ${imported.rows.length} rows from ${file.name}.`
  } catch (error) {
    status.value = 'Import failed: ' + (error instanceof Error ? error.message : String(error))
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
  const svg = chart.value?.exportSvg({ title: 'Timeline editing', rowHeading: 'Team' })
  if (!svg) return
  download(svg, 'timeline.svg')
  status.value = 'Exported SVG (' + svg.length + ' characters).'
}
async function exportPng() {
  try {
    const blob = await chart.value?.exportPng({ scale: 2, rowHeading: 'Team' })
    if (!blob) return
    download(blob, 'timeline.png')
    status.value = 'Exported PNG ' + await imageSize(blob) + '.'
  } catch (error) {
    status.value = error instanceof Error ? error.message : String(error)
  }
}
function onZoom(state: TimelineZoomState) {
  zoomState.value = Math.round(state.zoom * 100) + '% · ' + (state.preset ?? 'custom')
}
async function fit(ids?: readonly string[]) {
  await chart.value?.fitToBars(ids)
  status.value = ids ? `Fitted ${ids.length === 1 ? labels.value.get(ids[0]!) : ids.length + ' bars'} into view.` : 'Fitted all bars into view.'
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
  let title = 'Timeline actions'
  if (target.kind === 'bar') {
    const bar = model.value.bars.find(item => item.id === target.id)!
    title = 'Actions for ' + bar.label
    items.push({ label: 'Delete', run: () => removeFromMenu([bar.id]) })
    items.push({ label: 'Set progress to 100%', run: () => setProgress(bar.id, 1) })
    items.push({ label: 'Fit to bar', run: () => void fit([bar.id]) })
  } else if (target.kind === 'dependency') {
    title = 'Actions for dependency ' + target.id
    items.push({ label: 'Delete dependency', run: () => removeDependency(target.id) })
  } else {
    if (event.rowId !== undefined && event.time !== undefined) {
      const { rowId, time } = event
      title = 'Actions for ' + rowLabel(rowId)
      items.push({ label: 'Add task here', run: () => addTask(rowId, time) })
    }
    items.push({ label: 'Fit all bars', run: () => void fit() })
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
  <section class="planning-panel" aria-labelledby="editing-title">
    <div class="section-head">
      <div><h2 id="editing-title">Timeline editing</h2><p>Dependencies, drag to create, batch moves, row moves, progress, deletion, zoom presets and resource load · UTC</p></div>
      <div class="options"><output aria-label="Zoom state">{{ zoomState }}</output><button type="button" @click="reset">Reset timeline</button><label><input v-model="rtl" type="checkbox"> Right-to-left timeline</label><label><input v-model="arrange" type="checkbox"> Auto-arrange lanes</label><label><input v-model="reorder" type="checkbox"> Reorder rows</label><label><input v-model="resizable" type="checkbox"> Resize columns</label><button type="button" @click="chart?.scrollToTime(origin + 4 * hour)">Scroll to 12:00</button><button type="button" @click="exportSvg">Export SVG</button><button type="button" @click="exportPng">Export PNG</button></div>
    </div>
    <div class="options editing-actions" role="group" aria-label="History and fit">
      <button type="button" :disabled="!canUndo" @click="undo">Undo timeline change</button>
      <button type="button" :disabled="!canRedo" @click="redo">Redo timeline change</button>
      <button type="button" @click="fit()">Fit all bars</button>
      <button type="button" :disabled="!selection.size" @click="fit([...selection])">Fit selection</button>
      <label class="import-csv">Import CSV <input type="file" accept=".csv,text/csv" @change="importCsv"></label>
    </div>
    <GanttChart ref="chart" :dir="rtl ? 'rtl' : 'ltr'" :rows="rows" :bars="shownBars" :dependencies="model.dependencies" :range="range" :format-time="formatTime"
      :height="430" :lane-count="laneCount" :row-height="rowHeight" connectable reconnectable multi-select row-draggable pinch-zoom show-now :now="origin + 3.5 * hour"
      progress-editable deletable context-menu creatable :validate-create="validateCreate" :columns="columns"
      :columns-resizable="resizable" :label-width="labelWidth" :validate-column-resize="validateColumnResize"
      @column-resize="resizeColumn" @column-resize-rejected="(_change, reason) => status = reason"
      :rows-reorderable="reorder" :validate-row-move="validateRowMove" @row-move="moveRow" @row-move-rejected="(_change, reason) => status = reason"
      v-model:selected-ids="selection" v-model:selected-dependency-id="selectedDependency" v-model:zoom-preset="preset"
      :zoom-presets="zoomPresets" :validate-connection="validateConnection" :validate-edit="validateEdit" :validate-edits="validateEdits"
      :validate-bars-delete="validateBarsDelete"
      :load-rows="resources" :load-segments="load" :labels="{ region: 'Editable timeline', rows: 'Team' }"
      @connect="connect" @reconnect="reconnect" @connect-rejected="(_connection, reason) => status = reason"
      @dependency-select="id => status = 'Selected dependency ' + id + '. Press Delete to remove it.'"
      @dependency-delete="removeDependency" @edit="apply([$event])" @edits="apply" @zoom-change="onZoom"
      @edit-rejected="(_change, reason) => status = reason" @edits-rejected="(_changes, reason) => status = reason"
      @progress-edit="applyProgress" @bars-delete="deleteBars" @bars-delete-rejected="(_ids, reason) => status = reason"
      @create="create" @create-rejected="(_proposal, reason) => status = reason" @context-menu="openMenu">
      <template #row-heading>Team</template>
      <template #legend><span class="hint">Drag across an empty row or press + to add a task · Ctrl/Shift-click selects several bars · Up/Down moves rows · Delete removes · Right-click or Shift+F10 for actions · Pinch to zoom on touch</span></template>
      <template #tooltip="{ bar, range: shown }">
        <strong>{{ bar.label }}</strong><br>{{ formatTime(shown.start) }}–{{ formatTime(shown.end) }} · {{ Math.round((bar.progress ?? 0) * 100) }}% complete
      </template>
    </GanttChart>
    <p class="status" role="status">{{ status }}</p>
    <div v-if="menu" ref="menuElement" class="context-menu" role="menu" :aria-label="menu.title"
      :style="{ left: menu.x + 'px', top: menu.y + 'px' }" @keydown="menuKeys">
      <button v-for="item in menu.items" :key="item.label" type="button" role="menuitem" tabindex="-1" @click="choose(item)">{{ item.label }}</button>
    </div>
  </section>
</template>

<style scoped>
.editing-actions { flex-wrap: wrap; gap: 8px; margin-bottom: 8px; }
.import-csv { display: inline-flex; align-items: center; gap: 6px; }
.import-csv input { max-width: 220px; }
.context-menu { position: fixed; z-index: 30; display: flex; flex-direction: column; min-width: 170px; padding: 4px; border: 1px solid var(--vw-border, #c6d7e2); border-radius: 7px; background: var(--vw-surface, #fff); box-shadow: 0 6px 18px rgb(0 0 0 / .18); }
.context-menu button { border: 0; border-radius: 4px; background: transparent; color: var(--vw-text, #24465b); text-align: start; padding: 6px 10px; }
.context-menu button:hover, .context-menu button:focus-visible { background: var(--vw-surface-hover, #edf5fa); outline: 2px solid var(--vw-accent, #245e96); outline-offset: -2px; }
</style>
