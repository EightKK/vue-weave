<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  GanttChart, actualsTimelineBars, rescheduleFromActuals, type ActualsDiagnostic, type PlanningDiagnostic, type ScheduleInput,
  type ScheduleLink, type ScheduleTask, type TaskActuals, type TimelineRow,
} from '../src'
import { formatTime, hour, origin } from './data'

// Opt-in example of `rescheduleFromActuals`: recorded actual intervals are kept exactly as reported and only the
// remaining work is scheduled on the shift calendar from the status date. Each row shows the original plan (grey strip),
// the actuals (solid bars) and the remaining forecast (outline bars), from `actualsTimelineBars`.
const minute = 60_000
const at = (hours: number, minutes = 0) => origin + hours * hour + minutes * minute
const range = { start: origin, end: at(33) }
// Two shifts a day with a lunch break: 08:00–12:00 and 13:00–17:00 UTC.
const periods = [0, 24].flatMap(day => [{ start: at(day), end: at(day + 4) }, { start: at(day + 5), end: at(day + 9) }])
const nonWorking = [{ start: at(4), end: at(5) }, { start: at(9), end: at(24) }, { start: at(28), end: at(29) }]
const rows: TimelineRow[] = [
  { id: 'saw', label: 'Cut stock', detail: 'Finished, overran' },
  { id: 'mill', label: 'Mill housing', detail: 'Late start, interrupted' },
  { id: 'weld', label: 'Weld frame', detail: 'Remaining work revised' },
  { id: 'paint', label: 'Paint frame', detail: 'Not started' },
  { id: 'pack', label: 'Pack', detail: 'Not started' },
]
const labels = new Map(rows.map(row => [row.id, row.label]))
const tasks: ScheduleTask[] = [
  { id: 'saw', duration: 3 * hour },
  { id: 'mill', duration: 4 * hour },
  { id: 'weld', duration: 2 * hour },
  { id: 'paint', duration: 2 * hour },
  { id: 'pack', duration: hour },
]
const dependencies: ScheduleLink[] = [
  { id: 'saw-mill', from: 'saw', to: 'mill' },
  { id: 'mill-paint', from: 'mill', to: 'paint' },
  { id: 'weld-paint', from: 'weld', to: 'paint' },
  { id: 'paint-pack', from: 'paint', to: 'pack' },
]
const input: ScheduleInput = {
  range, quantum: 10 * minute, calendars: [{ id: 'shifts', periods }], defaultCalendarId: 'shifts', tasks, dependencies,
}
const statusDate = at(6)
// What the shop floor reported at 14:00. Cutting overran and is finished; milling started late, ran into the lunch break,
// stopped and resumed; welding did its planned 2 h and the welder now reports 3 h still to do.
const reviseWeld = ref(true)
const actuals = computed(() => new Map<string, TaskActuals>([
  ['saw', { intervals: [{ start: at(0), end: at(3, 30) }], finished: true }],
  ['mill', { intervals: [{ start: at(3, 40), end: at(4, 20) }, { start: at(5, 20), end: at(6) }] }],
  ['weld', { intervals: [{ start: at(0), end: at(2) }], ...(reviseWeld.value ? { remainingWork: 3 * hour } : {}) }],
]))
const result = computed(() => rescheduleFromActuals(input, statusDate, actuals.value))
const bars = computed(() => actualsTimelineBars(result.value, { label: id => labels.get(id) ?? id, baselineId: 'plan' }))
const finish = computed(() => result.value.ok ? formatTime(result.value.schedule.finish) : 'not feasible')
const planFinish = result.value.plan.ok ? formatTime(result.value.plan.finish) : ''
const problems: Record<ActualsDiagnostic['code'], string> = {
  'actual-overlap': 'Actual intervals overlap',
  'actual-after-status-date': 'Actual work recorded after the status date',
  'actual-outside-calendar': 'Actual work outside the shift calendar (kept as recorded)',
  'actual-contradiction': 'Finished, but remaining work was reported',
}
function describe(item: ActualsDiagnostic | PlanningDiagnostic) {
  const task = item.entities.find(entity => entity.kind === 'task')
  const title = (problems as Record<string, string>)[item.code] ?? item.code
  return `${task ? labels.get(task.id) + ': ' : ''}${title}${item.range ? ' ' + formatTime(item.range.start) + '–' + formatTime(item.range.end) : ''}`
}
const remainingHours = (id: string) => (result.value.tasks.find(task => task.id === id)?.remainingWork ?? 0) / hour
</script>

<template>
  <section class="planning-panel" aria-labelledby="actuals-title">
    <div class="section-head">
      <div><h2 id="actuals-title">Recorded actuals</h2><p>rescheduleFromActuals · status 14:00 UTC · actuals stay as recorded</p></div>
      <div class="options">
        <label><input v-model="reviseWeld" type="checkbox"> Welding needs 3 h more</label>
      </div>
    </div>
    <dl class="schedule-metrics">
      <div><dt>Planned finish</dt><dd>{{ planFinish }}</dd></div>
      <div><dt>Forecast finish</dt><dd data-testid="actuals-finish">{{ finish }}</dd></div>
      <div><dt>Welding remaining</dt><dd>{{ remainingHours('weld') }} h</dd></div>
    </dl>
    <GanttChart :rows="rows" :bars="bars" :range="range" :format-time="formatTime" :status-date="statusDate" readonly
      :pixels-per-unit="22 / hour" :tick-steps="[2 * hour, 4 * hour, 8 * hour]" :row-height="52" :height="320"
      :non-working-periods="nonWorking" :baseline-ids="['plan']" :baseline-label="() => 'Original plan'"
      :labels="{ region: 'Recorded actuals timeline' }">
      <template #row-heading>Operation</template>
      <template #legend>
        <ul class="actuals-key" aria-label="Recorded actuals legend">
          <li><span class="key key-actual" aria-hidden="true"></span>Actual: recorded work (solid)</li>
          <li><span class="key key-forecast" aria-hidden="true"></span>Forecast: remaining work (outline)</li>
          <li><span class="key key-plan" aria-hidden="true"></span>Original plan (strip below)</li>
        </ul>
      </template>
    </GanttChart>
    <ul class="actuals-diagnostics" aria-label="Recorded actuals diagnostics">
      <li v-for="item in result.diagnostics" :key="item.id">{{ describe(item) }}</li>
    </ul>
  </section>
</template>

<style scoped>
.actuals-key { display: flex; flex-wrap: wrap; gap: 12px; margin: 0; padding: 0; list-style: none; font-size: 12px; }
.actuals-key li { display: inline-flex; align-items: center; gap: 4px; }
.key { display: inline-block; width: 18px; height: 10px; border-radius: 2px; box-sizing: border-box; }
.key-actual { background: var(--vw-teal-solid, #2b756b); border: 1px solid var(--vw-teal-solid, #2b756b); }
.key-forecast { background: var(--vw-blue-pale, #e6effa); border: 1px solid var(--vw-blue-line, #6b96c5); }
.key-plan { height: 3px; background: var(--vw-baseline, #718497); }
.actuals-diagnostics { margin: 8px 0 0; padding-inline-start: 18px; font-size: 12px; }
@media (forced-colors: active) {
  .key-actual { background: CanvasText; border-color: CanvasText; }
  .key-forecast { background: Canvas; border-color: CanvasText; }
  .key-plan { background: CanvasText; }
}
</style>
