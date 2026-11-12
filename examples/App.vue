<script setup lang="ts">
import { computed, ref } from 'vue'
import { NetworkGraph, GanttChart, useEditHistory, type TimelineEdit, type TimelineColumn, type TimelineCellEdit, type GraphPoint, type GraphNodeMove, type GraphConnection, type GraphReconnect } from '../src'
import { makeExample, range, hour, formatTime } from './data'
import SchedulingDemo from './SchedulingDemo.vue'
import GanttEditingDemo from './GanttEditingDemo.vue'

const preset = ref('manufacturing')
const history = useEditHistory({ data: makeExample(preset.value), positions: new Map<string, GraphPoint>() })
const data = computed(() => history.state.value.data)
const positions = computed(() => history.state.value.positions)
const canUndo = history.canUndo
const canRedo = history.canRedo
const initialBars = ref(data.value.bars)
const selected = ref('split')
const direction = ref<'LR' | 'TB'>('LR')
const dark = ref(false)
const custom = ref(false)
const locked = ref(false)
const graphEditing = ref(false)
const advancedTimeline = ref(false)
const group = { id: 'lots', label: 'Intermediate lots', nodeIds: ['lot1', 'lot2'] }
const groups = [group]
const nestedGroups = ref(false)
const nestedGroupList = [{ id: 'process', label: 'Process', nodeIds: ['raw', 'split'] }, { ...group, parentId: 'process' }]
const graphGroups = computed(() => graphEditing.value && preset.value === 'manufacturing' ? nestedGroups.value ? nestedGroupList : groups : undefined)
const query = ref('')
const matchIds = computed(() => {
  const text = query.value.trim().toLowerCase()
  return text ? new Set(data.value.nodes.filter(node => (node.label + ' ' + (node.detail ?? '')).toLowerCase().includes(text)).map(node => node.id)) : undefined
})
const graph = ref<InstanceType<typeof NetworkGraph>>()
function findFirstMatch() {
  const first = matchIds.value?.values().next().value
  if (first !== undefined) graph.value?.focusNode(first, { scale: 1 })
}
const columns: TimelineColumn[] = [
  { id: 'note', label: 'Resource note', width: 110, value: row => row.detail ?? '', editable: row => row.id !== 'group' },
  { id: 'count', label: 'Intervals', width: 62, value: (_row, summary) => summary?.count ?? 0 },
]
const graphSelection = ref(new Set<string>())
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
  history.reset({ data: example, positions: new Map() })
  initialBars.value = example.bars
  graphSelection.value = new Set()
  collapsedRows.value = new Set()
  selected.value = data.value.nodes[0]?.id ?? ''
  status.value = 'Example reset.'
}
function commitNodes(changes: GraphNodeMove[]) {
  const nextPositions = new Map(positions.value)
  for (const change of changes) nextPositions.set(change.id, change.after)
  history.commit({ data: data.value, positions: nextPositions })
  status.value = changes.length === 1 ? 'Moved node ' + changes[0]!.id + '.' : 'Moved ' + changes.length + ' nodes.'
}
function validateConnection({ from, to, fromPort, toPort }: GraphConnection, replacing?: string) {
  if (data.value.edges.some(edge => edge.id !== replacing && edge.from === from && edge.to === to
    && edge.fromPort === fromPort && edge.toPort === toPort)) return 'This connection already exists.'
}
function commitConnection(connection: GraphConnection) {
  let number = data.value.edges.length + 1
  while (data.value.edges.some(edge => edge.id === 'connection-' + number)) number++
  const edges = [...data.value.edges, { id: 'connection-' + number, ...connection }]
  history.commit({ data: { ...data.value, edges }, positions: positions.value })
  status.value = 'Connected ' + connection.from + ' to ' + connection.to + '.'
}
function commitReconnect(change: GraphReconnect) {
  const edges = data.value.edges.map(edge => edge.id === change.id
    ? { ...edge, fromPort: undefined, toPort: undefined, ...change.after } : edge)
  history.commit({ data: { ...data.value, edges }, positions: positions.value })
  status.value = 'Reconnected edge ' + change.id + '.'
}
function validateCell(change: TimelineCellEdit) {
  if (locked.value) return 'This example is locked. Uncheck “Reject edits” to apply changes.'
  if (!change.after.trim()) return 'A resource note cannot be empty.'
}
function commitCell(change: TimelineCellEdit) {
  const rows = data.value.rows.map(row => row.id === change.rowId ? { ...row, detail: change.after.trim() } : row)
  history.commit({ data: { ...data.value, rows }, positions: positions.value })
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
  history.commit({ data: { ...data.value, bars }, positions: positions.value })
  status.value = change.id + ' → ' + formatTime(change.after.start) + '–' + formatTime(change.after.end) + ' (' + change.source + ')'
}
</script>

<template>
  <div class="demo" :class="{ dark }">
    <header><a href="./" class="wordmark">Vue Weave <span>0.4</span></a><label><input v-model="dark" type="checkbox"> Dark theme</label></header>
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
          <div class="options"><label>Direction <select v-model="direction"><option>LR</option><option>TB</option></select></label><label><input v-model="custom" type="checkbox"> Custom nodes</label><label><input v-model="graphEditing" type="checkbox"> Edit graph</label><label v-if="graphEditing && preset === 'manufacturing'"><input v-model="nestedGroups" type="checkbox"> Nested groups</label><label>Search nodes <input v-model="query" type="search" @keydown.enter="findFirstMatch"></label></div>
        </div>
        <NetworkGraph ref="graph" v-model:selected-id="selected" :nodes="data.nodes" :edges="data.edges" :options="{ direction }" :height="direction === 'TB' ? 470 : graphEditing || preset === 'large' ? 345 : 245"
          :draggable="graphEditing" :connectable="graphEditing" :reconnectable="graphEditing" :box-select="graphEditing"
          :groups="graphGroups" :show-minimap="graphEditing || preset === 'large'" :cull-offscreen="preset === 'large'" :match-ids="matchIds"
          :positions="positions" :selected-ids="graphEditing ? graphSelection : undefined"
          :validate-connection="validateConnection" @update:selected-ids="graphSelection = $event"
          @node-move="commitNodes([$event])" @nodes-move="commitNodes" @connect="commitConnection" @reconnect="commitReconnect" @connect-rejected="(_connection, reason) => status = reason">
          <template v-if="custom" #node="{ node, box, selected: active }">
            <rect x="3" y="3" :width="box.width - 6" :height="box.height - 6" rx="4" :style="{ fill: active ? '#174878' : 'var(--vft-surface, #fff)' }" />
            <text x="12" y="24" style="font-size: 14px">{{ node.label }}</text><text x="12" y="44" style="font-size: 10px">{{ node.detail || node.id }}</text>
          </template>
        </NetworkGraph>
        <p v-if="graphEditing" class="hint">Drag between ports to connect. Select an edge to move an endpoint. Shift-drag the canvas to select a region.</p>
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
