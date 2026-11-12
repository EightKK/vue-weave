<script setup lang="ts">
import { computed, ref, shallowRef } from 'vue'
import {
  GanttChart, calculateResourceLoad, calendarBands,
  type TimelineBar, type TimelineConnection, type TimelineDependency, type TimelineEdit, type TimelineReconnect,
  type TimelineZoomPreset, type TimelineZoomState,
} from '../src'
import { formatTime, hour, origin } from './data'
import { download, imageSize } from './download'

const range = { start: origin, end: origin + 10 * hour }
const rows = [
  { id: 'product', label: 'Product team', detail: 'Design pool' },
  { id: 'platform', label: 'Platform team', detail: 'Engineering pool' },
  { id: 'web', label: 'Web team', detail: 'Engineering pool' },
  { id: 'quality', label: 'Quality', detail: 'Acceptance only' },
]
const initialBars: TimelineBar[] = [
  { id: 'wireframes', rowId: 'product', label: 'Wireframes', start: origin, end: origin + 2 * hour, editable: true, tone: 'violet' },
  { id: 'api', rowId: 'platform', label: 'Billing API', start: origin + 2 * hour, end: origin + 5 * hour, editable: true },
  { id: 'ui', rowId: 'web', label: 'Checkout UI', start: origin + 2 * hour, end: origin + 6 * hour, editable: true },
  { id: 'tests', rowId: 'quality', label: 'Acceptance tests', start: origin + 6 * hour, end: origin + 8 * hour, editable: true, tone: 'teal' },
]
const initialDependencies: TimelineDependency[] = [{ id: 'wireframes-api', from: 'wireframes', to: 'api' }]
const resources = [
  { id: 'design', label: 'Design pool', capacity: 1 },
  { id: 'engineering', label: 'Engineering pool', capacity: 1 },
]
const assignments = [
  { resourceId: 'design', taskId: 'wireframes' }, { resourceId: 'engineering', taskId: 'api' },
  { resourceId: 'engineering', taskId: 'ui' }, { resourceId: 'engineering', taskId: 'tests' },
]
const zoomPresets: TimelineZoomPreset[] = [
  { id: 'hours', label: 'Hours', pixelsPerUnit: 115 / hour, tickSteps: [hour], headerBands: [calendarBands(range, 'day', { label: start => 'Day ' + new Date(start).toISOString().slice(0, 10) })] },
  { id: 'shifts', label: 'Shifts', pixelsPerUnit: 45 / hour, tickSteps: [4 * hour], headerBands: [calendarBands(range, 'hour', { step: 4, label: start => 'Shift from ' + formatTime(start) })] },
]

const model = shallowRef({ bars: initialBars, dependencies: initialDependencies })
const selection = ref(new Set<string>())
const selectedDependency = ref<string>()
const preset = ref('hours')
const zoomState = ref('100% · hours')
const status = ref('Select bars with Ctrl, Meta or Shift. Use link handles to add dependencies.')
const labels = computed(() => new Map(model.value.bars.map(bar => [bar.id, bar.label])))
const load = computed(() => calculateResourceLoad(range,
  model.value.bars.map(bar => ({ id: bar.id, work: [{ start: bar.start, end: bar.end }] })), resources, assignments))

function reset() {
  model.value = { bars: [...initialBars], dependencies: [...initialDependencies] }
  selection.value = new Set()
  selectedDependency.value = undefined
  status.value = 'Timeline editing example reset.'
}
function validateConnection(connection: TimelineConnection, replacing?: string) {
  if (model.value.dependencies.some(dep => dep.id !== replacing && dep.from === connection.from && dep.to === connection.to)) {
    return 'These bars are already linked.'
  }
}
function connect(connection: TimelineConnection) {
  let number = model.value.dependencies.length + 1
  while (model.value.dependencies.some(dep => dep.id === 'link-' + number)) number++
  model.value = { ...model.value, dependencies: [...model.value.dependencies, { id: 'link-' + number, ...connection }] }
  status.value = `Added ${connection.type} dependency from ${labels.value.get(connection.from)} to ${labels.value.get(connection.to)}.`
}
function reconnect(change: TimelineReconnect) {
  model.value = { ...model.value, dependencies: model.value.dependencies.map(dep => dep.id === change.id ? { ...dep, ...change.after } : dep) }
  status.value = `Reconnected ${change.id} as ${change.after.type} to ${labels.value.get(change.after.to)}.`
}
function removeDependency(id: string) {
  model.value = { ...model.value, dependencies: model.value.dependencies.filter(dep => dep.id !== id) }
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
  model.value = {
    ...model.value,
    bars: model.value.bars.map(bar => {
      const change = byId.get(bar.id)
      return change ? { ...bar, ...change.after, rowId: change.row?.after ?? bar.rowId } : bar
    }),
  }
  const [first] = changes
  status.value = changes.length > 1 ? `Moved ${changes.length} bars.`
    : first?.row ? `Moved ${labels.value.get(first.id)} to ${rows.find(row => row.id === first.row!.after)?.label}.`
      : `${labels.value.get(first!.id)} → ${formatTime(first!.after.start)}–${formatTime(first!.after.end)}.`
}
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
</script>

<template>
  <section class="planning-panel" aria-labelledby="editing-title">
    <div class="section-head">
      <div><h2 id="editing-title">Timeline editing</h2><p>Dependencies, batch moves, row moves, zoom presets and resource load · UTC</p></div>
      <div class="options"><output aria-label="Zoom state">{{ zoomState }}</output><button type="button" @click="reset">Reset timeline</button><label><input v-model="rtl" type="checkbox"> Right-to-left timeline</label><button type="button" @click="chart?.scrollToTime(origin + 4 * hour)">Scroll to 12:00</button><button type="button" @click="exportSvg">Export SVG</button><button type="button" @click="exportPng">Export PNG</button></div>
    </div>
    <GanttChart ref="chart" :dir="rtl ? 'rtl' : 'ltr'" :rows="rows" :bars="model.bars" :dependencies="model.dependencies" :range="range" :format-time="formatTime"
      :height="430" connectable reconnectable multi-select row-draggable pinch-zoom show-now :now="origin + 3.5 * hour"
      v-model:selected-ids="selection" v-model:selected-dependency-id="selectedDependency" v-model:zoom-preset="preset"
      :zoom-presets="zoomPresets" :validate-connection="validateConnection" :validate-edit="validateEdit" :validate-edits="validateEdits"
      :load-rows="resources" :load-segments="load" :labels="{ region: 'Editable timeline' }"
      @connect="connect" @reconnect="reconnect" @connect-rejected="(_connection, reason) => status = reason"
      @dependency-select="id => status = 'Selected dependency ' + id + '. Press Delete to remove it.'"
      @dependency-delete="removeDependency" @edit="apply([$event])" @edits="apply" @zoom-change="onZoom"
      @edit-rejected="(_change, reason) => status = reason" @edits-rejected="(_changes, reason) => status = reason">
      <template #row-heading>Team</template>
      <template #legend><span class="hint">Ctrl/Shift-click selects several bars · Up/Down moves rows · Pinch to zoom on touch</span></template>
    </GanttChart>
    <p class="status" role="status">{{ status }}</p>
  </section>
</template>
