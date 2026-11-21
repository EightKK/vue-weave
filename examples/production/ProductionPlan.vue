<script setup lang="ts">
import { computed, ref } from 'vue'
import { GanttChart, useEditHistory, type TimelineBar, type TimelineEdit, type ViewTargetEvent } from '../../src'
import ProcessGraph from './ProcessGraph.vue'
import CodePanel from './CodePanel.vue'
import type { Copy } from './copy'
import { excerpt } from './sections'
import { calculatePlan, clock, deadline, displayRange, downstreamEdits, hour, links, maintenance, proposeStart, range, resourceIds, taskIds, type Plan, type Strategy, type TaskId } from './plan'
import planSource from './plan.ts?raw'
import viewSource from './ProductionPlan.vue?raw'

const props = defineProps<{ text: Copy }>()
const initial: Plan = { strategy: 'original', starts: {} }
const history = useEditHistory(initial)
const draft = ref<Plan>()
const selected = ref('cutA')
const codeOpen = ref(false)
const status = ref<'rejected' | 'adopted' | 'undone'>()
const changed = ref<readonly string[]>([])
const strategy = computed(() => draft.value ?? history.state.value)
const current = computed(() => calculatePlan(history.state.value)!)
const schedule = computed(() => calculatePlan(strategy.value)!)
const rows = computed(() => taskIds.map(id => ({ id, label: props.text.tasks[id] })))
const loadRows = computed(() => resourceIds.map(id => ({ id, label: props.text.resources[id] })))
const highlighted = computed(() => new Set(changed.value))
const loadFocus = computed(() => schedule.value.load.filter(segment => segment.taskIds.includes(selected.value))
  .map(({ resourceId, start, end }) => ({ view: 'load' as const, resourceId, start, end })))
const selectedTask = computed(() => schedule.value.byId.get(selected.value)!)
const selectedResource = computed(() => schedule.value.resourceFor[selected.value as TaskId])
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

function openScenario(value: Exclude<Strategy, 'original'>) {
  // Reopening the strategy in use keeps its manual starts, so an adopted move is not silently dropped.
  const base = strategy.value
  draft.value = { strategy: value, starts: value === base.strategy ? base.starts : {} }
  changed.value = taskIds.filter(id => current.value.byId.get(id)!.start !== schedule.value.byId.get(id)!.start)
  status.value = undefined
}

function validate(change: TimelineEdit) {
  return change.mode === 'move' && Boolean(proposeStart(strategy.value, change.id as TaskId, change.after.start)) || props.text.rejected
}

function cascade(change: TimelineEdit) {
  if (change.mode !== 'move') return []
  const proposal = proposeStart(strategy.value, change.id as TaskId, change.after.start)
  return proposal ? downstreamEdits(schedule.value, proposal.computed, change) : []
}

function move(id: TaskId, start: number) {
  const proposal = proposeStart(strategy.value, id, start)
  if (!proposal) { status.value = 'rejected'; return }
  // Compare with the adopted plan, like the baseline bars, so earlier moves of the same proposal stay highlighted.
  changed.value = taskIds.filter(other => other !== id && current.value.byId.get(other)!.start !== proposal.computed.byId.get(other)!.start)
  draft.value = proposal.next
  selected.value = id
  status.value = undefined
}

function commitEdits(changes: TimelineEdit[]) {
  const first = changes[0]
  if (first) move(first.id as TaskId, first.after.start)
}

function activateLoad(event: ViewTargetEvent) {
  if (event.target.view !== 'load') return
  const { resourceId, start, end } = event.target
  const match = schedule.value.load.find(item => item.resourceId === resourceId && item.start === start && item.end === end)
  if (match?.taskIds[0]) selected.value = match.taskIds[0]
}

function dismiss() {
  draft.value = undefined
  changed.value = []
  status.value = undefined
}

// demo:adopt
function adopt() {
  if (!draft.value) return
  history.commit(draft.value)
  dismiss()
  status.value = 'adopted'
}

function undo() {
  history.undo()
  dismiss()
  status.value = 'undone'
}
// demo:end

function reset() {
  history.reset(initial)
  dismiss()
  selected.value = 'cutA'
}

const examples = computed(() => [
  { label: props.text.codeLink, code: excerpt(viewSource, 'link'), path: 'ProductionPlan.vue' },
  { label: props.text.codeReplan, code: excerpt(planSource, 'edit'), path: 'plan.ts' },
  { label: props.text.codeAdopt, code: excerpt(viewSource, 'adopt'), path: 'ProductionPlan.vue' },
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
        <!-- demo:link -->
        <ProcessGraph v-model:selected="selected" :text="text" :label="text.graph"
          :nodes="nodes" :edges="links" :positions="positions" :symbols="symbols"
          :highlighted="highlighted" :height="265" />
        <!-- demo:end -->
      </section>

      <section class="production-panel">
        <div class="production-heading"><h2>{{ text.gantt }}</h2><code>GanttChart</code></div>
        <GanttChart :rows="rows" :bars="bars" :range="range" :dependencies="schedule.dependencies"
          :selected-ids="new Set([selected])" :highlighted-bar-ids="highlighted" :snap="hour" :tick-steps="[2 * hour, 4 * hour]"
          :label-width="106" :pixels-per-unit="42 / hour" :height="230" :row-height="34" :format-time="clock"
          :markers="[{ id: 'shipping', time: deadline, label: text.deadline }]"
          :labels="{ region: text.gantt, editHint: text.planHelp, zoom: text.zoom, zoomIn: text.zoomIn, zoomOut: text.zoomOut }"
          :cascade="cascade" :validate-edit="validate" :validate-edits="changes => validate(changes[0]!)" @select="id => selected = id"
          @edit="change => commitEdits([change])" @edits="commitEdits"
          @edit-rejected="status = 'rejected'" @edits-rejected="status = 'rejected'">
          <template #row-heading>{{ text.task }}</template>
        </GanttChart>
        <p class="production-caption">{{ text.planHelp }}</p>
      </section>

      <section class="production-panel">
        <div class="production-heading"><h2>{{ text.load }}</h2><code>calculateResourceLoad</code></div>
        <GanttChart :rows="[]" :bars="[]" :range="range" :tick-steps="[2 * hour, 4 * hour]" :label-width="106"
          :pixels-per-unit="42 / hour" :height="224" :load-row-height="34" :format-time="clock"
          :load-rows="loadRows" :load-segments="schedule.load" :highlighted-load-targets="loadFocus"
          :marker-ranges="[{ id: 'maintenance', ...maintenance, label: text.maintenance, tone: 'amber' }]"
          :labels="{ region: text.load, empty: text.load, editHint: '', loadRegion: text.load, load: text.load, capacity: text.capacity, zoom: text.zoom, zoomIn: text.zoomIn, zoomOut: text.zoomOut }"
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
            <button v-if="draft" class="primary" type="button" @click="adopt">{{ text.adopt }}</button>
            <button v-if="draft" type="button" @click="dismiss">{{ text.dismiss }}</button>
            <button v-else-if="history.canUndo.value" type="button" @click="undo">{{ text.undo }}</button>
          </div>
        </div>
      </section>
      <section class="production-panel">
        <div class="production-heading"><h2>{{ text.details }}</h2></div>
        <div class="production-content">
          <strong>{{ text.tasks[selected as TaskId] }}</strong>
          <dl><dt>{{ text.schedule }}</dt><dd>{{ displayRange(selectedTask) }}</dd><dt>{{ text.resource }}</dt><dd>{{ text.resources[selectedResource] }}</dd></dl>
          <div class="production-actions">
            <button type="button" :aria-label="text.early" @click="move(selected as TaskId, selectedTask.start - hour)">−1{{ text.hours }}</button>
            <button type="button" :aria-label="text.later" @click="move(selected as TaskId, selectedTask.start + hour)">+1{{ text.hours }}</button>
          </div>
          <p v-if="changed.length" class="production-caption">{{ text.affected }} · {{ changed.map(id => text.tasks[id as TaskId]).join(' / ') }}</p>
          <p v-if="status" role="status" class="production-caption">{{ text[status] }}</p>
        </div>
      </section>
    </aside>
  </div>
</template>
