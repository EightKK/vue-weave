<script setup lang="ts">
import { computed, ref } from 'vue'
import type { PlanningDiagnostic, ScheduleReason, ScheduleTrace } from '../../src'

// Reference diagnostics list (spec D1): severity, target, time and reason of each `PlanningDiagnostic`. Words, dates and
// names are translated here from the structured codes; the library returns data only. Activating an entry emits it, and
// the parent decides what to reveal (bars, rows, graph nodes).
const props = defineProps<{
  diagnostics: readonly PlanningDiagnostic[]
  /** The trace of an `explain: true` result. Reason IDs of a diagnostic are looked up here. */
  trace?: ScheduleTrace
  taskLabel: (id: string) => string
  resourceLabel?: (id: string) => string
  formatTime: (time: number) => string
  /** Dependency labels; defaults to the dependency ID. */
  dependencyLabel?: (id: string) => string
}>()
const emit = defineEmits<{ activate: [diagnostic: PlanningDiagnostic] }>()

const severity = ref<'all' | PlanningDiagnostic['severity']>('all')
const shown = computed(() => props.diagnostics.filter(item => severity.value === 'all' || item.severity === severity.value))
const reasons = computed(() => new Map((props.trace?.reasons ?? []).map(reason => [reason.id, reason])))

const titles: Record<PlanningDiagnostic['code'], string> = {
  'schedule-cycle': 'Dependency cycle',
  'schedule-infeasible': 'Constraints cannot be met',
  'resource-overload': 'Resource overload',
  'leveling-unresolved': 'Not resolved by leveling',
}
const constraintNames: Record<string, string> = {
  range: 'the planning horizon', startNoEarlierThan: 'start no earlier than', startNoLaterThan: 'start no later than',
  finishNoEarlierThan: 'finish no earlier than', finishNoLaterThan: 'finish no later than', fixedStart: 'fixed start',
  deadline: 'the project deadline', projectFinish: 'the project finish', calendar: 'working time',
}
const resourceName = (id: string) => props.resourceLabel?.(id) ?? id
const dependencyName = (id: string) => props.dependencyLabel?.(id) ?? id

function targets(diagnostic: PlanningDiagnostic) {
  return diagnostic.entities.map(entity => entity.kind === 'task' ? props.taskLabel(entity.id)
    : entity.kind === 'resource' ? resourceName(entity.id) : 'link ' + dependencyName(entity.id)).join(', ')
}
function when(diagnostic: PlanningDiagnostic) {
  return diagnostic.range ? props.formatTime(diagnostic.range.start) + '–' + props.formatTime(diagnostic.range.end) : ''
}
function describe(reason: ScheduleReason): string {
  const task = props.taskLabel(reason.taskId)
  const at = reason.range ? ' ' + props.formatTime(reason.range.start) + '–' + props.formatTime(reason.range.end) : ''
  if (reason.kind === 'capacity') {
    const holders = (reason.relatedTaskIds ?? []).map(props.taskLabel).join(', ')
    return task + ' needs ' + reason.demand + ' of ' + resourceName(reason.resourceId ?? '') + ' (capacity ' + reason.capacity + ')' + at
      + (holders ? ', held by ' + holders : '')
  }
  if (reason.kind === 'dependency') return task + ' is limited by ' + (reason.relatedTaskIds ?? []).map(props.taskLabel).join(', ') + ' through ' + dependencyName(reason.dependencyId ?? '')
  if (reason.kind === 'constraint') return task + ' has ' + (constraintNames[reason.constraint ?? ''] ?? reason.constraint) + ' ' + (reason.candidateTime === undefined ? '' : props.formatTime(reason.candidateTime))
  if (reason.kind === 'calendar') return task + ' moves for non-working time'
  if (reason.kind === 'pause') return task + ' is paused'
  return task + ' is bounded by ' + (reason.constraint ? constraintNames[reason.constraint] : 'the latest leveling dates')
}
function reasonLines(diagnostic: PlanningDiagnostic) {
  const lines = diagnostic.reasonIds.map(id => reasons.value.get(id)).filter((reason): reason is ScheduleReason => reason !== undefined).map(describe)
  if (diagnostic.code === 'schedule-infeasible') {
    lines.unshift('Binding: ' + (diagnostic.constraints ?? []).map(name => constraintNames[name] ?? name).join(' and ') + (diagnostic.entities.some(e => e.kind === 'dependency') ? ' with ' + diagnostic.entities.filter(e => e.kind === 'dependency').map(e => dependencyName(e.id)).join(', ') : ''))
  }
  if (!lines.length && diagnostic.code === 'resource-overload') lines.push('Capacity is reported here, not enforced: no leveling reason was recorded.')
  return lines
}
</script>

<template>
  <section class="diagnostics" aria-labelledby="diagnostics-title">
    <div class="head">
      <h3 id="diagnostics-title">Planning diagnostics</h3>
      <label>Severity <select v-model="severity" aria-label="Filter diagnostics by severity">
        <option value="all">All</option><option value="error">Errors</option><option value="warning">Warnings</option><option value="info">Info</option>
      </select></label>
    </div>
    <ul v-if="shown.length" aria-label="Diagnostic list">
      <li v-for="diagnostic in shown" :key="diagnostic.id" :data-severity="diagnostic.severity">
        <button type="button" @click="emit('activate', diagnostic)">
          <span class="sev">{{ diagnostic.severity }}</span>
          <strong>{{ titles[diagnostic.code] }}</strong>: {{ targets(diagnostic) }}<template v-if="when(diagnostic)"> · {{ when(diagnostic) }}</template>
          <span class="sr-only"> Activate to show it in the chart.</span>
        </button>
        <ul v-if="reasonLines(diagnostic).length" class="reasons" aria-label="Reasons">
          <li v-for="(line, index) in reasonLines(diagnostic)" :key="index">{{ line }}</li>
        </ul>
      </li>
    </ul>
    <p v-else class="empty">No diagnostics{{ severity === 'all' ? '' : ' of this severity' }}.</p>
  </section>
</template>

<style scoped>
.diagnostics { border: 1px solid var(--vw-border, #d9e4ec); border-radius: 8px; padding: 10px; font-size: 12px; }
.head { display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 6px; }
h3 { margin: 0; font-size: 14px; }
ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
.diagnostics > ul > li { border-inline-start: 4px solid #b07400; padding-inline-start: 8px; }
li[data-severity='error'] { border-inline-start-color: #b3261e; }
li[data-severity='info'] { border-inline-start-color: #245e96; }
li > button { text-align: start; width: 100%; }
.sev { text-transform: uppercase; font-size: 10px; letter-spacing: .06em; margin-inline-end: 6px; }
.reasons { margin: 4px 0 0 4px; gap: 2px; color: var(--vw-muted, #4f6574); }
.empty { margin: 0; color: var(--vw-muted, #4f6574); }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
</style>
