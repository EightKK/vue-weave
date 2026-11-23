<script setup lang="ts">
import { computed, ref } from 'vue'
import { GanttChart, type TimelineBar, type TimelineEdit, type ViewTargetEvent } from '../../src'
import ProcessGraph from './ProcessGraph.vue'
import CodePanel from './CodePanel.vue'
import { copy, type Copy } from './copy'
import { excerpt } from './sections'
import { calculatePlan, clock, deadline, displayRange, downstreamEdits, hour, links, maintenance, proposeStart, range, resourceIds, taskIds, type Plan, type Strategy, type TaskId } from './plan'
import { useProductionWorkspace } from './workspace'
import planSource from './plan.ts?raw'
import viewSource from './ProductionPlan.vue?raw'
import workspaceSource from './workspace.ts?raw'

const props = defineProps<{ text: Copy }>()
const initial: Plan = { strategy: 'original', starts: {} }
const workspace = useProductionWorkspace()
const { linked, proposal, schedule } = workspace
const codeOpen = ref(false)
const rejected = ref(false)
// "Plan adopted." follows the workspace, which closes a proposal when its save is accepted, also after a reconcile.
const status = computed(() => rejected.value ? 'rejected' : workspace.adoptionNotice.value ? 'adopted' : undefined)
/** A new or closed proposal clears the messages about the previous one. */
function clearStatus() {
  rejected.value = false
  workspace.adoptionNotice.value = false
}
const draft = computed(() => proposal.value?.plan)
const strategy = computed(() => draft.value ?? workspace.document.value.plan)
const current = workspace.adopted
const changed = computed(() => proposal.value?.changed ?? [])
const rows = computed(() => taskIds.map(id => ({ id, label: props.text.tasks[id] })))
const loadRows = computed(() => resourceIds.map(id => ({ id, label: props.text.resources[id] })))
const highlighted = computed(() => new Set<string>(changed.value))
// The operation shown in the details: the first one selected in any view, this tab's or the lot flow's.
const selected = computed(() => linked.selectedEntities.value.find(entity => entity.kind === 'operation')?.id as TaskId | undefined)
const selectedTask = computed(() => selected.value && schedule.value.byId.get(selected.value))
const selectedResource = computed(() => selected.value && schedule.value.resourceFor[selected.value])
const local = (en: string, ja: string) => props.text === copy.ja ? ja : en
const nodes = computed(() => rows.value.map(row => ({ ...row, detail: displayRange(schedule.value.byId.get(row.id)!) })))
const positions = new Map([
  ['prep', { x: 0, y: 82 }], ['cutA', { x: 219, y: 24 }], ['cutB', { x: 219, y: 140 }],
  ['inspect', { x: 438, y: 82 }], ['pack', { x: 657, y: 82 }],
])
const symbols = { prep: '▤', cutA: 'A', cutB: 'B', inspect: '✓', pack: '□' }
const bars = computed<TimelineBar[]>(() => taskIds.map(id => {
  const { start, end } = schedule.value.byId.get(id)!
  const baseline = current.value.byId.get(id)!
  return {
    id, rowId: id, label: props.text.tasks[id], start, end, editable: true,
    ...(highlighted.value.has(id) ? { tone: 'amber' } : {}),
    ...(draft.value && start !== baseline.start ? { baseline } : {}),
  }
}))

// demo:link
// One selection for the whole app: each view reports what it selected, and gets back its own selection and highlights.
const graphSelected = computed(() => [...linked.graph.value.selectedNodeIds].find(id => positions.has(id)) ?? '')
const graphLinked = computed(() => linked.graph.value.highlightedNodeIds)
const selectNode = (id: string) => linked.select('graph', [{ view: 'graph', kind: 'node', id }])
const selectBar = (id: string) => linked.select('timeline', [{ view: 'timeline', kind: 'bar', id }])
const activateLoad = (event: ViewTargetEvent) => event.target.view === 'load' && linked.select('load', [event.target])
const clearSelection = () => linked.clearSelection()
// demo:end

function openScenario(value: Exclude<Strategy, 'original'>) {
  // Reopening the strategy in use keeps its manual starts, so an adopted move is not silently dropped.
  const base = strategy.value
  const plan = { strategy: value, starts: value === base.strategy ? base.starts : {} }
  const next = calculatePlan(plan)!
  proposal.value = { plan, changed: taskIds.filter(id => current.value.byId.get(id)!.start !== next.byId.get(id)!.start) }
  clearStatus()
}

function validate(change: TimelineEdit) {
  return change.mode === 'move' && Boolean(proposeStart(strategy.value, change.id as TaskId, change.after.start)) || props.text.rejected
}

function cascade(change: TimelineEdit) {
  if (change.mode !== 'move') return []
  const next = proposeStart(strategy.value, change.id as TaskId, change.after.start)
  return next ? downstreamEdits(schedule.value, next.computed, change) : []
}

function move(id: TaskId, start: number) {
  const next = proposeStart(strategy.value, id, start)
  if (!next) { rejected.value = true; return }
  // Compare with the adopted plan, like the baseline bars, so earlier moves of the same proposal stay highlighted.
  const moved = taskIds.filter(other => other !== id && current.value.byId.get(other)!.start !== next.computed.byId.get(other)!.start)
  proposal.value = { plan: next.next, changed: moved }
  clearStatus()
}

function commitEdits(changes: TimelineEdit[]) {
  const first = changes[0]
  if (first) move(first.id as TaskId, first.after.start)
}

function dismiss() {
  proposal.value = undefined
  clearStatus()
}

function reset() {
  dismiss()
  void workspace.submit({ area: 'plan', plan: initial })
  selectNode('cutA')
}

const examples = computed(() => [
  { label: props.text.codeLink, code: excerpt(viewSource, 'link') + '\n\n' + excerpt(workspaceSource, 'link'), path: 'ProductionPlan.vue' },
  { label: props.text.codeReplan, code: excerpt(planSource, 'edit'), path: 'plan.ts' },
  { label: props.text.codeAdopt, code: excerpt(workspaceSource, 'adopt'), path: 'workspace.ts' },
  { label: props.text.codeSave, code: excerpt(workspaceSource, 'save'), path: 'workspace.ts' },
])
</script>

<template>
  <div class="production-title">
    <div><h1>{{ text.planning }}</h1><p>{{ text.introPlan }}</p></div>
    <div class="production-actions">
      <button type="button" @click="reset">{{ text.reset }}</button>
      <button type="button" :aria-expanded="codeOpen" @click="codeOpen = !codeOpen">{{ text.code }}</button>
    </div>
  </div>
  <CodePanel v-if="codeOpen" :text="text" :examples="examples" />

  <div class="production-incident"><span aria-hidden="true">!</span><strong>{{ text.maintenance }}</strong>{{ text.outage }}</div>
  <div class="production-layout">
    <div class="production-stack">
      <section class="production-panel">
        <div class="production-heading"><h2>{{ text.graph }}</h2><code>NetworkGraph</code></div>
        <ProcessGraph :selected-id="graphSelected" :linked-ids="graphLinked" :text="text" :label="text.graph"
          :nodes="nodes" :edges="links" :positions="positions" :symbols="symbols"
          :highlighted="highlighted" :height="265" @select="selectNode" @clear="clearSelection" />
      </section>

      <section class="production-panel">
        <div class="production-heading"><h2>{{ text.gantt }}</h2><code>GanttChart</code></div>
        <GanttChart :rows="rows" :bars="bars" :range="range" :dependencies="schedule.dependencies"
          :selected-ids="linked.timeline.value.selectedBarIds" :highlighted-bar-ids="linked.timeline.value.highlightedBarIds" :snap="hour" :tick-steps="[2 * hour, 4 * hour]"
          :label-width="106" :pixels-per-unit="42 / hour" :height="230" :row-height="34" :format-time="clock"
          :markers="[{ id: 'shipping', time: deadline, label: text.deadline }]"
          :labels="{ ...text.labels.gantt, region: text.gantt, editHint: text.planHelp, zoom: text.zoom, zoomIn: text.zoomIn, zoomOut: text.zoomOut }"
          :cascade="cascade" :validate-edit="validate" :validate-edits="changes => validate(changes[0]!)" @select="selectBar"
          @edit="change => commitEdits([change])" @edits="commitEdits"
          @edit-rejected="rejected = true" @edits-rejected="rejected = true" @background-click="clearSelection" @idle-escape="clearSelection">
          <template #row-heading>{{ text.task }}</template>
        </GanttChart>
        <p class="production-caption">{{ text.planHelp }} {{ local('Click empty chart space or press Escape to clear the selection.', '何もない所をクリックするか Escape で選択を解除します。') }}</p>
      </section>

      <section class="production-panel">
        <div class="production-heading"><h2>{{ text.load }}</h2><code>calculateResourceLoad</code></div>
        <GanttChart :rows="[]" :bars="[]" :range="range" :tick-steps="[2 * hour, 4 * hour]" :label-width="106"
          :pixels-per-unit="42 / hour" :height="224" :load-row-height="34" :format-time="clock"
          :load-rows="loadRows" :load-segments="schedule.load"
          :highlighted-load-targets="linked.load.value.highlighted" :selected-load-targets="linked.load.value.selected"
          :marker-ranges="[{ id: 'maintenance', ...maintenance, label: text.maintenance, tone: 'amber' }]"
          :labels="{ ...text.labels.gantt, region: text.load, empty: text.load, editHint: '', loadRegion: text.load, load: text.load, capacity: text.capacity, zoom: text.zoom, zoomIn: text.zoomIn, zoomOut: text.zoomOut }"
          load-selectable @target-activate="activateLoad">
          <template #row-heading>{{ text.resource }}</template>
        </GanttChart>
      </section>
    </div>

    <aside class="production-stack">
      <section class="production-panel">
        <div class="production-heading"><h2>{{ text.compare }}</h2></div>
        <div class="production-content">
          <div class="production-scenarios">
            <button v-for="op in (['wait', 'backup'] as const)" :key="op" type="button" :aria-pressed="strategy.strategy === op"
              @click="openScenario(op)"><strong>{{ text[op] }}</strong><small>{{ text[op === 'wait' ? 'waitDetail' : 'backupDetail'] }}</small></button>
          </div>
          <table class="production-table">
            <thead><tr><td></td><th scope="col">{{ text.current }}</th><th v-if="draft" scope="col">{{ text.draft }}</th></tr></thead>
            <tbody>
              <tr><th scope="row">{{ text.ship }}</th><td>{{ clock(current.shipping) }}</td><td v-if="draft">{{ clock(schedule.shipping) }}</td></tr>
              <tr><th scope="row">{{ text.late }}</th><td>{{ current.lateHours }}{{ text.hours }}</td><td v-if="draft">{{ schedule.lateHours }}{{ text.hours }}</td></tr>
              <tr><th scope="row">{{ text.overload }}</th><td>{{ current.cncOverload }}{{ text.hours }}</td><td v-if="draft">{{ schedule.cncOverload }}{{ text.hours }}</td></tr>
            </tbody>
          </table>
          <div class="production-actions">
            <button v-if="draft" class="primary" type="button" :disabled="workspace.saving.value" @click="workspace.adopt">{{ text.adopt }}</button>
            <button v-if="draft" type="button" @click="dismiss">{{ text.dismiss }}</button>
          </div>
        </div>
      </section>
      <section class="production-panel">
        <div class="production-heading"><h2>{{ text.details }}</h2></div>
        <div class="production-content">
          <template v-if="selected && selectedTask && selectedResource">
            <strong>{{ text.tasks[selected] }}</strong>
            <dl><dt>{{ text.schedule }}</dt><dd>{{ displayRange(selectedTask) }}</dd><dt>{{ text.resource }}</dt><dd>{{ text.resources[selectedResource] }}</dd></dl>
            <div class="production-actions">
              <button type="button" :aria-label="text.early" @click="move(selected, selectedTask.start - hour)">−1{{ text.hours }}</button>
              <button type="button" :aria-label="text.later" @click="move(selected, selectedTask.start + hour)">+1{{ text.hours }}</button>
            </div>
          </template>
          <p v-else class="production-caption">{{ local('Select an operation in the graph or the chart to see its details.', 'グラフかチャートで作業を選ぶと、その詳細を表示します。') }}</p>
          <p class="production-caption">{{ text.selectionNote }}</p>
          <p v-if="changed.length" class="production-caption">{{ text.affected }} · {{ changed.map(id => text.tasks[id]).join(' / ') }}</p>
          <p v-if="status" role="status" class="production-caption">{{ text[status] }}</p>
        </div>
      </section>
    </aside>
  </div>
</template>
