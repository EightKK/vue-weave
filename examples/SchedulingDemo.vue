<script setup lang="ts">
import { computed, ref, shallowRef } from 'vue'
import {
  GanttChart, NetworkGraph, buildWorkPeriods, calculateResourceLoad, createWorkingTimeScale, formatDependencyLag, invertWorkPeriods, propagateEdit, rescheduleFromStatusDate,
  scheduleTasks, scheduleToGraph, scheduledBarFields, toPlanningDiagnostics, timelineConstraints, timelineCsvTable, toCsv, toICalendar, toMsProjectXml,
  type ResourceAssignment, type ScheduleConstraintName, type ScheduleInput, type ScheduleLink, type ScheduleManualConflict, type ScheduleResult,
  type ScheduleTask, type ScheduledTask, type TimelineBar, type TimelineColumn, type TimelineConstraintEdit, type TimelineEdit,
} from '../src'
import { download } from './download'
import PlanningDiagnostics from './components/PlanningDiagnostics.vue'
import SummaryLinksDemo from './SummaryLinksDemo.vue'
import ActualsDemo from './ActualsDemo.vue'
import DemoPanel from './components/DemoPanel.vue'
import StatusLine from './components/StatusLine.vue'
import { hour } from './data'
import { useDemoLocale } from './i18n'

const { t, labels: componentLabels, isJapanese } = useDemoLocale()

const local = (value: string) => Date.parse(value + '+09:00')
const range = { start: local('2026-11-09T08:00:00'), end: local('2026-11-11T17:00:00') }
const shifts = buildWorkPeriods(range, {
  utcOffsetMinutes: 540,
  weekly: [1, 2, 3, 4, 5].flatMap(weekday => [
    { weekday, startMinute: 8 * 60, endMinute: 12 * 60 },
    { weekday, startMinute: 13 * 60, endMinute: 17 * 60 },
  ]),
  exceptions: { '2026-11-10': [] },
})
const calendars = [{ id: 'plant', periods: shifts }]
// Breaks, nights and the closed date, shaded behind both charts.
const nonWorking = invertWorkPeriods(shifts, range)
// A display-only due date: packing must finish before the dispatch cut-off or the bar is marked late.
const deadlines = new Map([['pack', local('2026-11-09T17:00:00')]])
const shade = ref(true)
// "Compress non-working time" swaps the linear axis for a working-time scale: working hours get twice the width and
// breaks, nights and the closure keep a tenth of it. Times, snapping and edits are unchanged; only x positions differ.
const compress = ref(false)
const workingScale = computed(() => compress.value ? createWorkingTimeScale(range, shifts, 36 / hour, 0.1) : undefined)
// "Summary task links" adds a separate, opt-in example of links to and from a summary task (GanttChart summaryDependencies).
const summaryLinks = ref(false)
// "Recorded actuals" adds a separate, opt-in example of rescheduling from recorded actual intervals (rescheduleFromActuals).
const recordedActuals = ref(false)
const showCritical = ref(true)
const originalTasks: ScheduleTask[] = [
  { id: 'cut-a', duration: 3 * hour },
  { id: 'cut-b', duration: 2 * hour, startNoEarlierThan: range.start + 2 * hour },
  { id: 'inspect', duration: 2 * hour },
  { id: 'pack', duration: 2 * hour },
]
// The chart draws these links and the scheduler uses them unchanged, lag included: a ScheduleLink is a
// TimelineDependency with a lag. Packing may overlap the last two hours of cutting order B (a lead, drawn as "−2 h").
const dependencies: ScheduleLink[] = [
  { id: 'cut-inspect', from: 'cut-a', to: 'inspect', type: 'FS' },
  { id: 'inspect-pack', from: 'inspect', to: 'pack', type: 'FS' },
  { id: 'cut-b-pack', from: 'cut-b', to: 'pack', type: 'FS', lag: -2 * hour },
]
const resources = [
  { id: 'cnc', label: t({ en: 'CNC cell', ja: 'CNC セル' }), capacity: 1, periods: shifts },
  { id: 'quality', label: t({ en: 'Inspection station', ja: '検査ステーション' }), capacity: 1, periods: shifts },
  { id: 'dispatch', label: t({ en: 'Packing station', ja: '梱包ステーション' }), capacity: 1, periods: shifts },
]
const assignments: ResourceAssignment[] = [
  { resourceId: 'cnc', taskId: 'cut-a' }, { resourceId: 'cnc', taskId: 'cut-b' },
  { resourceId: 'quality', taskId: 'inspect' }, { resourceId: 'dispatch', taskId: 'pack' },
]
const baseRows = [
  { id: 'cut-a', label: t({ en: 'Cut order A', ja: '切断オーダー A' }), detail: t({ en: 'CNC cell · editable', ja: 'CNC セル · 編集可' }) },
  { id: 'cut-b', label: t({ en: 'Cut order B', ja: '切断オーダー B' }), detail: t({ en: 'CNC cell · editable', ja: 'CNC セル · 編集可' }) },
  { id: 'inspect', label: t({ en: 'Inspect order A', ja: '検査オーダー A' }), detail: t({ en: 'Inspection station', ja: '検査ステーション' }) },
  { id: 'pack', label: t({ en: 'Pack order A', ja: '梱包オーダー A' }), detail: t({ en: 'Packing station', ja: '梱包ステーション' }) },
]
// Manual and inactive tasks, both off by default. "Schedule inspection manually" pins inspection at its planned dates
// with `ScheduleTask.manual`: links into it no longer move it, a link its dates break is listed as a manual conflict, and
// its bar can be moved or resized. "Cancel order B (inactive)" sets `inactive` on cutting order B: the scheduler, the
// load view and the network diagram leave it and its links out, and its bar stays as a placeholder at the dates it had.
const manualInspection = ref(false)
const orderBCancelled = ref(false)
// Placeholder dates of inactive tasks, which the scheduler no longer reports.
const parked = shallowRef(new Map<string, ScheduledTask>())
const rows = computed(() => baseRows.map(row => row.id === 'inspect' && manualInspection.value ? { ...row, detail: t({ en: 'Inspection · manual', ja: '検査 · 手動' }) }
  : row.id === 'cut-b' && orderBCancelled.value ? { ...row, detail: t({ en: 'CNC cell · inactive', ja: 'CNC セル · 無効' }) } : row))
const dates = new Intl.DateTimeFormat(isJapanese.value ? 'ja-JP' : 'en-GB', {
  timeZone: 'Asia/Tokyo', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
})
const format = (time: number) => dates.format(time).replace(',', '')
const labels = new Map(baseRows.map(row => [row.id, row.label]))
const headerBands = [
  [
    { start: range.start, end: local('2026-11-10T00:00:00'), label: t({ en: 'Mon 9 Nov · operating day', ja: '11月9日(月)· 稼働日' }) },
    { start: local('2026-11-10T00:00:00'), end: local('2026-11-11T00:00:00'), label: t({ en: 'Tue 10 Nov · plant closed', ja: '11月10日(火)· 工場休業' }) },
    { start: local('2026-11-11T00:00:00'), end: range.end, label: t({ en: 'Wed 11 Nov · operating day', ja: '11月11日(水)· 稼働日' }) },
  ],
  shifts.map(period => ({ ...period, label: t({ en: 'Shift', ja: 'シフト' }) })),
]

function scheduleInput(tasks: readonly ScheduleTask[]): ScheduleInput {
  return { range, calendars, defaultCalendarId: 'plant', quantum: 60_000, tasks, dependencies }
}
function propose(tasks: readonly ScheduleTask[]): ScheduleResult {
  return scheduleTasks(scheduleInput(tasks))
}
const original = propose(originalTasks)
if (!original.ok) throw new Error('The demo schedule must be feasible')
const model = shallowRef({ tasks: originalTasks, plan: original })
const notice = ref(t({ en: 'Move either cutting order to recalculate the plan. Amber tasks have zero float. Amber links show controlling dependencies.', ja: 'どちらかの切断オーダーを動かすと計画を再計算します。琥珀色のタスクは余裕がゼロで、琥珀色のリンクは支配的な依存関係です。' }))
const selected = ref(new Set<string>())
const originalDates = new Map(original.tasks.map(task => [task.id, { start: task.start, end: task.end }]))
// A second saved baseline: the plan after a revision that held cutting order A back by one hour.
const revision = propose(originalTasks.map(task => task.id === 'cut-a' ? { ...task, startNoEarlierThan: range.start + hour } : task))
if (!revision.ok) throw new Error('The demo revision must be feasible')
const revisionDates = new Map(revision.tasks.map(task => [task.id, { start: task.start, end: task.end }]))
// Named baseline sets: off by default, so the chart shows the single original-plan baseline as before.
const compareBaselines = ref(false)
const baselineSets = [{ id: 'plan', label: t({ en: 'Original plan', ja: '当初計画' }) }, { id: 'rev1', label: t({ en: 'Revision 1', ja: '改訂 1' }) }]
const shownSets = ref(new Set(baselineSets.map(set => set.id)))
const baselineIds = computed(() => compareBaselines.value ? baselineSets.filter(set => shownSets.value.has(set.id)).map(set => set.id) : undefined)
const baselineLabel = (id: string) => baselineSets.find(set => set.id === id)?.label ?? id
const slotColours = ['var(--vw-baseline, #718497)', 'var(--vw-baseline-2, #9a4c95)', 'var(--vw-baseline-3, #23806f)']
function swatch(id: string) {
  const slot = baselineIds.value?.indexOf(id) ?? -1
  return slot < 0 ? 'transparent' : slotColours[slot]
}
function toggleSet(id: string, shown: boolean) {
  const next = new Set(shownSets.value)
  if (shown) next.add(id)
  else next.delete(id)
  shownSets.value = next
}
const byTask = computed(() => new Map(model.value.plan.tasks.map(task => [task.id, task])))
/** A task as drawn: its scheduled dates, or the placeholder dates of an inactive task. */
const shownTask = (id: string) => byTask.value.get(id) ?? parked.value.get(id)
const columns: TimelineColumn[] = [
  { id: 'finish', label: t({ en: 'Finish (JST)', ja: '終了(JST)' }), width: 106, value: row => format(shownTask(row.id)!.end) },
  // Manual tasks have no float (the scheduler reports 0 without making them critical), and inactive ones no dates.
  { id: 'float', label: t({ en: 'Float', ja: '余裕' }), width: 58, value: row => {
    const task = byTask.value.get(row.id)
    return !task ? t({ en: 'inactive', ja: '無効' }) : task.manual ? t({ en: 'manual', ja: '手動' }) : (task.totalFloat / hour) + t({ en: ' h', ja: ' 時間' })
  } },
]
const resourceColumns: TimelineColumn[] = [
  { id: 'calendar', label: t({ en: 'Calendar', ja: 'カレンダー' }), width: 106, value: () => t({ en: 'Plant shifts', ja: '工場のシフト' }) },
  { id: 'capacity', label: t({ en: 'Units', ja: '単位数' }), width: 58, value: row => resources.find(resource => resource.id === row.id)!.capacity },
]
const criticalLinks = computed(() => new Set(model.value.plan.criticalDependencyIds))
const workHours = new Map(originalTasks.map(task => [task.id, task.duration / hour]))
// scheduledBarFields supplies the dates, split work segments, critical flag and latest finish of each task.
// Reported progress at the status date: cutting order A is done, B is half done and inspection has started.
const reported = new Map([['cut-a', 1], ['cut-b', 0.5], ['inspect', 0.25]])
const statusDate = ref(local('2026-11-09T12:00:00'))
const showProgressLine = ref(true)
// Bars follow the task order. An inactive task keeps a pale outline bar at its placeholder dates, without critical,
// float or deadline overlays, and cannot be edited; a manual task is violet, has no float line and moves and resizes.
const taskBars = computed<TimelineBar[]>(() => originalTasks.flatMap(({ id }) => {
  const task = byTask.value.get(id)
  const placeholder = task ? undefined : parked.value.get(id)
  if (!task && !placeholder) return []
  const { critical, latestEnd, ...dates } = scheduledBarFields((task ?? placeholder)!)
  return [{
    id, rowId: id, label: labels.get(id)!, ...dates, progress: reported.get(id),
    ...(compareBaselines.value
      ? { baselines: [{ id: 'plan', ...originalDates.get(id)! }, { id: 'rev1', ...revisionDates.get(id)! }] }
      : { baseline: originalDates.get(id) }),
    editable: task !== undefined && (id.startsWith('cut-') || task.manual === true),
    tone: task?.critical ? 'amber' : task?.manual ? 'violet' : 'blue',
    ...(placeholder ? { appearance: 'outline' as const } : {}),
    // Screen readers hear the same cue as the colour and row detail.
    ...(placeholder ? { description: t({ en: 'Inactive: takes no part in the plan', ja: '無効: 計画に含まれません' }) }
      : task?.manual ? { description: t({ en: 'Manually scheduled: its links do not move it', ja: '手動スケジュール: リンクでは動きません' }) } : {}),
    ...(showCritical.value && task ? { critical, ...(task.manual ? {} : { latestEnd }), deadline: deadlines.get(id) } : {}),
    ...(showConstraints.value ? { constraints: timelineConstraints(taskById.value.get(id)) } : {}),
  }]
}))
// Scheduling constraints, off by default. Shown, packing must finish by the dispatch cut-off (a hard
// `finishNoLaterThan` that the scheduler applies, unlike the display-only deadline), and the requested starts of the
// cutting orders are `startNoEarlierThan` handles. Moving or deleting a handle reschedules the plan; a constraint that
// cannot be met is not applied, and the scheduler's diagnostic says why.
const showConstraints = ref(false)
const taskById = computed(() => new Map(model.value.tasks.map(task => [task.id, task])))
const constraintNames: Record<ScheduleConstraintName, string> = t({
  en: {
    range: 'the planning horizon', startNoEarlierThan: 'its start no earlier than', startNoLaterThan: 'its start no later than',
    finishNoEarlierThan: 'its finish no earlier than', finishNoLaterThan: 'its finish no later than', fixedStart: 'its fixed start',
    deadline: 'the project deadline', projectFinish: 'the project finish', calendar: 'its working time',
  },
  ja: {
    range: '計画期間', startNoEarlierThan: '指定日以降の開始', startNoLaterThan: '指定日以前の開始',
    finishNoEarlierThan: '指定日以降の終了', finishNoLaterThan: '指定日以前の終了', fixedStart: '固定の開始日',
    deadline: 'プロジェクトの期限', projectFinish: 'プロジェクトの完了', calendar: '稼働時間',
  },
})
const cycleText = t({ en: 'A dependency cycle prevents scheduling.', ja: '依存関係の循環があるため日程を計算できません。' })
function withConstraint(task: ScheduleTask, kind: TimelineConstraintEdit['kind'], time: number | undefined): ScheduleTask {
  const { [kind]: _previous, ...rest } = task
  return time === undefined ? rest : { ...rest, [kind]: time }
}
function infeasibility(plan: Exclude<ScheduleResult, { ok: true }>) {
  if (plan.code === 'cycle') return cycleText
  const links = plan.dependencyIds.map(id => dependencies.find(link => link.id === id)!)
    .map(link => labels.get(link.from) + ' → ' + labels.get(link.to))
  if (isJapanese.value) {
    return `実行不可能: ${labels.get(plan.taskId)} は${plan.constraints.map(name => constraintNames[name]).join('と')}を満たせません`
      + (links.length ? '(リンク ' + links.join('、') + ')' : '') + '。変更は適用していません。'
  }
  return `Infeasible: ${labels.get(plan.taskId)} cannot meet ${plan.constraints.map(name => constraintNames[name]).join(' and ')}`
    + (links.length ? ' with the link ' + links.join(', ') : '') + '. The change was not applied.'
}
function toggleConstraints(event: Event) {
  const input = event.target as HTMLInputElement
  const tasks = model.value.tasks.map(task => task.id === 'pack' ? withConstraint(task, 'finishNoLaterThan', input.checked ? deadlines.get('pack') : undefined) : task)
  const plan = propose(tasks)
  if (!plan.ok) {
    notice.value = infeasibility(plan)
    input.checked = showConstraints.value
    return
  }
  model.value = { tasks, plan }
  showConstraints.value = input.checked
}
function applyConstraint(change: TimelineConstraintEdit) {
  const tasks = model.value.tasks.map(task => task.id === change.id ? withConstraint(task, change.kind, change.after) : task)
  const plan = propose(tasks)
  if (!plan.ok) {
    notice.value = infeasibility(plan)
    return
  }
  model.value = { tasks, plan }
  notice.value = change.after === undefined
    ? t({ en: `Constraint removed from ${labels.get(change.id)}. Plan recalculated.`, ja: `${labels.get(change.id)} の制約を外しました。計画を再計算しました。` })
    : t({
      en: `${labels.get(change.id)}: ${constraintNames[change.kind].replace('its ', '')} ${format(change.after)}. Plan recalculated.`,
      ja: `${labels.get(change.id)}: ${constraintNames[change.kind]} ${format(change.after)}。計画を再計算しました。`,
    })
}
// The full assignment list is passed; the assignments of inactive tasks take no capacity.
const load = computed(() => calculateResourceLoad(range, model.value.plan.tasks, resources, assignments, { inactiveTaskIds: model.value.plan.inactiveTaskIds }))
const overloads = computed(() => load.value.filter(segment => segment.overload > 0))
// The same overloads as a structured diagnostic list; activating one shows its first operation in the chart above.
const diagnostics = computed(() => toPlanningDiagnostics(model.value.plan, load.value))
async function revealDiagnostic(diagnostic: { entities: readonly { kind: string; id: string }[] }) {
  const task = diagnostic.entities.find(entity => entity.kind === 'task')
  if (!task) return
  const result = await chart.value?.revealBar(task.id)
  const state = result && result.status !== 'revealed' ? ' (' + result.status + ')' : ''
  notice.value = t({ en: 'Showing ' + labels.get(task.id) + state + ' for the diagnostic.', ja: '診断に対応する ' + labels.get(task.id) + state + ' を表示しています。' })
}
const overloadHours = computed(() => overloads.value.reduce((hours, segment) => hours + (segment.end - segment.start) / hour, 0))
const loadBars = computed<TimelineBar[]>(() => load.value.filter(segment => segment.load > 0).map(segment => ({
  id: segment.resourceId + ':' + segment.start, rowId: segment.resourceId,
  start: segment.start, end: segment.end, label: segment.load + ' / ' + segment.capacity,
  tone: segment.overload ? 'amber' : 'teal',
})))
const criticalCount = computed(() => model.value.plan.tasks.filter(task => task.critical).length)

function validateEdit(change: TimelineEdit) {
  // A manual task's dates are whatever the planner sets, so its bar can also be resized.
  if (taskById.value.get(change.id)?.manual) return
  if (change.mode !== 'move') return t({ en: 'Move the bar to change the requested start. Working duration is fixed in this example.', ja: 'バーを動かして希望開始日を変えてください。この例では作業時間は固定です。' })
}
/** A requested start inside a break or a closed day begins at the next working time, as the scheduler places it. */
function nextWorkingTime(time: number) {
  const period = shifts.find(item => item.end > time)
  return period ? Math.max(time, period.start) : time
}
// Auto-scheduling preview. While a cutting order is dragged (or moved with the arrow keys), propagateEdit pins it at
// the new start and reports every operation whose dates change; the chart draws those as dashed outlines and proposes
// them with the move as one batch. The order is first pinned where it is now, so the changes are measured against the
// plan on screen. An infeasible move previews nothing and is reported when the edit is applied.
// A manual task needs no pin: propagateEdit moves its manual dates to the proposed interval as they are, in breaks too,
// and a resize sets their end. Its successors follow; its predecessors stay, and a link it now breaks is a conflict.
function cascade(change: TimelineEdit): TimelineEdit[] {
  const current = byTask.value.get(change.id)
  if (!current || (change.mode !== 'move' && !current.manual)) return []
  const tasks = current.manual ? model.value.tasks
    : model.value.tasks.map(task => task.id === change.id ? { ...task, startNoEarlierThan: undefined, fixedStart: current.start } : task)
  const result = propagateEdit(scheduleInput(tasks), current.manual
    ? { id: change.id, start: change.after.start, end: change.after.end }
    : { id: change.id, start: nextWorkingTime(change.after.start) })
  if (!result.ok) return []
  return result.changes.filter(item => item.id !== change.id)
    .map(item => ({ id: item.id, before: item.before, after: item.after, mode: 'move', source: change.source }))
}
// The batch lists the moved order first. Recalculating from its new requested start (or manual dates) reproduces the
// cascaded dates.
function applyEdits(changes: TimelineEdit[]) {
  applyEdit(changes[0]!)
}
function applyEdit(change: TimelineEdit) {
  const tasks = model.value.tasks.map(task => task.id !== change.id ? task
    : task.manual ? { ...task, manual: { start: change.after.start, end: change.after.end } } : { ...task, startNoEarlierThan: change.after.start })
  const plan = propose(tasks)
  if (!plan.ok) {
    notice.value = plan.code === 'cycle' ? cycleText : t({ en: 'The edit would exceed the available shifts for ' + labels.get(plan.taskId) + '.', ja: 'この編集では ' + labels.get(plan.taskId) + ' が使えるシフトを超えます。' })
    return
  }
  const previous = byTask.value
  const affected = plan.tasks.filter(task => task.id !== change.id
    && (task.start !== previous.get(task.id)!.start || task.end !== previous.get(task.id)!.end)).length
  model.value = { tasks, plan }
  notice.value = t({ en: 'Plan recalculated. ' + affected + ' other operation' + (affected === 1 ? '' : 's') + ' changed.', ja: '計画を再計算しました。ほかの工程が ' + affected + ' 件変わりました。' }) + conflictCount(plan)
}
const chart = ref<InstanceType<typeof GanttChart>>()
function exportSchedule() {
  const svg = chart.value?.exportSvg({ title: t({ en: 'Calendar-aware schedule', ja: 'カレンダーを考慮した日程' }), rowHeading: t({ en: 'Operation', ja: '工程' }) })
  if (!svg) return
  download(svg, 'schedule.svg')
  notice.value = t({ en: 'Exported schedule SVG (' + svg.length + ' characters).', ja: '日程を SVG に出力しました(' + svg.length + ' 文字)。' })
}
function reset() {
  // With constraints shown, packing keeps its cut-off; the original plan meets it, so the plan is the same.
  const tasks = showConstraints.value
    ? originalTasks.map(task => task.id === 'pack' ? withConstraint(task, 'finishNoLaterThan', deadlines.get('pack')) : task) : originalTasks
  const plan = showConstraints.value ? propose(tasks) : original
  if (!plan.ok) throw new Error('The demo schedule must be feasible')
  model.value = { tasks, plan }
  // The original tasks are neither manual nor inactive, so both options are turned off.
  manualInspection.value = false
  orderBCancelled.value = false
  parked.value = new Map()
  selected.value = new Set()
  notice.value = t({ en: 'Original plan restored.', ja: '当初計画に戻しました。' })
}
/** Schedules changed tasks for one of the options; an infeasible result is reported and changes nothing. */
function replan(tasks: ScheduleTask[]) {
  const plan = propose(tasks)
  if (!plan.ok) {
    notice.value = infeasibility(plan)
    return undefined
  }
  model.value = { tasks, plan }
  return plan
}
// Like the constraint option, both options recalculate the plan from the requested starts, so a status-date
// rescheduling is replaced by the plan it started from.
function toggleManualInspection(event: Event) {
  const input = event.target as HTMLInputElement
  const current = byTask.value.get('inspect')!
  const plan = replan(model.value.tasks.map(task => {
    if (task.id !== 'inspect') return task
    if (input.checked) return { ...task, manual: { start: current.start, end: current.end } }
    const { manual: _manual, ...rest } = task
    return rest
  }))
  if (!plan) {
    input.checked = manualInspection.value
    return
  }
  manualInspection.value = input.checked
  notice.value = (input.checked
    ? t({
      en: `Inspect order A is scheduled manually at ${format(current.start)}–${format(current.end)}. Its links no longer move it; move or resize its bar.`,
      ja: `検査オーダー A を ${format(current.start)}–${format(current.end)} に手動で固定しました。リンクでは動かなくなります。バーを動かすか伸縮してください。`,
    })
    : t({ en: 'Inspect order A is scheduled automatically again. Plan recalculated.', ja: '検査オーダー A を自動スケジュールに戻しました。計画を再計算しました。' })) + conflictCount(plan)
}
function toggleOrderB(event: Event) {
  const input = event.target as HTMLInputElement
  const current = byTask.value.get('cut-b')
  const plan = replan(model.value.tasks.map(task => {
    if (task.id !== 'cut-b') return task
    if (input.checked) return { ...task, inactive: true }
    const { inactive: _inactive, ...rest } = task
    return rest
  }))
  if (!plan) {
    input.checked = orderBCancelled.value
    return
  }
  parked.value = input.checked && current ? new Map([['cut-b', current]]) : new Map()
  orderBCancelled.value = input.checked
  notice.value = (input.checked
    ? t({ en: 'Cut order B is inactive: it no longer drives packing or loads the CNC cell. Plan recalculated.', ja: '切断オーダー B を無効にしました。梱包を左右せず、CNC セルの負荷にもなりません。計画を再計算しました。' })
    : t({ en: 'Cut order B is active again. Plan recalculated.', ja: '切断オーダー B を有効に戻しました。計画を再計算しました。' })) + conflictCount(plan)
}
// Links into a manual task bind nothing; the scheduler lists each one that the manual dates break.
const manualConflicts = computed(() => model.value.plan.manualConflicts ?? [])
function conflictCount(plan: ScheduleResult) {
  const count = plan.ok ? plan.manualConflicts?.length ?? 0 : 0
  return count ? t({ en: ` ${count} manual date conflict${count === 1 ? '' : 's'}.`, ja: `手動の日程の競合が ${count} 件あります。` }) : ''
}
function dependencyLabel(id: string) {
  const link = dependencies.find(item => item.id === id)
  return link ? `${labels.get(link.from)} → ${labels.get(link.to)}` : id
}
const endpoints = { FS: ['starts', 'finishes'], SS: ['starts', 'starts'], FF: ['finishes', 'finishes'], SF: ['finishes', 'starts'] } as const
function describeConflict(conflict: ScheduleManualConflict) {
  const link = dependencies.find(item => item.id === conflict.dependencyId)!
  const [own, other] = endpoints[link.type ?? 'FS']
  if (isJapanese.value) {
    const word = (verb: string) => verb === 'starts' ? '開始' : '終了'
    const lag = link.lag ? `(ラグ ${formatDependencyLag(link.lag)})` : ''
    return `${labels.get(conflict.taskId)} の${word(own)}が ${labels.get(link.from)} の${word(other)}${lag}より前です(リンク ${labels.get(link.from)} → ${labels.get(link.to)})`
  }
  const lag = link.lag ? ` with a lag of ${formatDependencyLag(link.lag)}` : ''
  return `${labels.get(conflict.taskId)} ${own} before ${labels.get(link.from)} ${other}${lag} (link ${labels.get(link.from)} → ${labels.get(link.to)})`
}
// The chart leaves out the links of inactive tasks, as the scheduler and the network diagram do. Without inactive
// tasks it gets the same array as before.
const chartDependencies = computed(() => orderBCancelled.value ? dependencies.filter(link => link.from !== 'cut-b' && link.to !== 'cut-b') : dependencies)
const barHours = (id: string) => {
  const task = byTask.value.get(id)
  // Manual dates set the elapsed span, so the work in them can differ from the planned duration.
  return task?.manual ? task.work.reduce((sum, part) => sum + part.end - part.start, 0) / hour : workHours.get(id)
}
// Done work stays where it is, partly done work is split at the status date and unstarted work moves after it. The
// next edit recalculates the plan from the requested starts again.
function rescheduleFromStatus() {
  let plan: ScheduleResult
  try {
    plan = rescheduleFromStatusDate(scheduleInput(model.value.tasks), statusDate.value, reported)
  } catch (error) {
    // Reported progress that cannot fit before the status date (for example at the start of the range) throws a
    // RangeError; the current plan stays as it is.
    if (!(error instanceof RangeError)) throw error
    notice.value = t({ en: `The reported progress does not fit before status date ${format(statusDate.value)}. Choose a later status date.`, ja: `報告された進捗が状況日付 ${format(statusDate.value)} より前に収まりません。もっと後の状況日付を選んでください。` })
    return
  }
  if (!plan.ok) {
    notice.value = plan.code === 'cycle' ? cycleText : t({ en: 'The status date leaves no room for ' + labels.get(plan.taskId) + '.', ja: 'この状況日付では ' + labels.get(plan.taskId) + ' の入る余地がありません。' })
    return
  }
  const previous = byTask.value
  const moved = plan.tasks.filter(task => task.start !== previous.get(task.id)!.start || task.end !== previous.get(task.id)!.end).length
  model.value = { tasks: model.value.tasks, plan }
  notice.value = t({ en: `Rescheduled from status date ${format(statusDate.value)}. ${moved} operation${moved === 1 ? '' : 's'} moved.`, ja: `状況日付 ${format(statusDate.value)} から再計算しました。${moved} 件の工程が動きました。` })
}
// Interchange exports of the current plan. The times are written in JST for Microsoft Project and in UTC for iCalendar.
// Microsoft Project has fields for both options, so an inactive task is written at its placeholder dates with `Active`
// 0, and links are kept (Microsoft Project ignores those of inactive tasks too). Every task is already written as
// manually scheduled so that Microsoft Project keeps the dates without the plant calendar; `manual: true` only states it.
function exportMsProject() {
  const tasks = originalTasks.flatMap(({ id }) => {
    const task = shownTask(id)
    return task ? [{ task, inactive: !byTask.value.has(id) }] : []
  })
  const xml = toMsProjectXml({
    name: t({ en: 'Calendar-aware schedule', ja: 'カレンダーを考慮した日程' }),
    tasks: tasks.map(({ task, inactive }) => ({
      id: task.id, name: labels.get(task.id)!, start: task.start, end: task.end, percentComplete: (reported.get(task.id) ?? 0) * 100,
      // Microsoft Project numbers baselines: the original plan is Baseline (0) and the revision Baseline1.
      baselines: [{ number: 0, ...originalDates.get(task.id)! }, { number: 1, ...revisionDates.get(task.id)! }],
      // A task with exactly one constraint gets its ConstraintType and ConstraintDate.
      ...(showConstraints.value ? { constraints: timelineConstraints(taskById.value.get(task.id)) } : {}),
      ...(inactive ? { inactive: true } : {}),
      ...(task.manual ? { manual: true } : {}),
    })),
    dependencies: dependencies.map(link => ({ from: link.from, to: link.to, type: link.type, lag: link.lag })),
  }, { utcOffsetMinutes: 540 })
  download(new Blob([xml], { type: 'application/xml' }), 'schedule.xml')
  notice.value = t({ en: 'Exported Microsoft Project XML with ' + tasks.length + ' tasks.', ja: 'タスク ' + tasks.length + ' 件を Microsoft Project XML に出力しました。' })
}
// iCalendar lists what will happen, so an inactive task, which the plan leaves out, has no event; a manual task is an
// event like any other, and its description says it is manual.
function exportICalendar() {
  const text = toICalendar(model.value.plan.tasks.map(task => ({
    id: task.id + '@vue-weave.example', summary: labels.get(task.id)!, start: task.start, end: task.end,
    description: rows.value.find(row => row.id === task.id)!.detail,
  })), { calendarName: t({ en: 'Calendar-aware schedule', ja: 'カレンダーを考慮した日程' }) })
  download(new Blob([text], { type: 'text/calendar' }), 'schedule.ics')
  notice.value = t({ en: 'Exported iCalendar with ' + model.value.plan.tasks.length + ' events.', ja: '予定 ' + model.value.plan.tasks.length + ' 件を iCalendar に出力しました。' })
}
// The CSV lists the chart as drawn, inactive placeholders included. With either option on, a Scheduling column says
// whether each task is automatic, manual or inactive; without them the file is unchanged.
function exportCsv() {
  const table = timelineCsvTable(rows.value, taskBars.value, { formatTime: format, headers: { row: t({ en: 'Operation', ja: '工程' }), bar: t({ en: 'Task', ja: 'タスク' }) } })
  const mode = (label: unknown) => {
    const id = baseRows.find(row => row.label === label)!.id
    const task = byTask.value.get(id)
    return !task ? t({ en: 'Inactive', ja: '無効' }) : task.manual ? t({ en: 'Manual', ja: '手動' }) : t({ en: 'Auto', ja: '自動' })
  }
  const text = toCsv(manualInspection.value || orderBCancelled.value
    ? table.map((record, index) => [...record, index ? mode(record[0]) : t({ en: 'Scheduling', ja: 'スケジュール方式' })]) : table)
  download(new Blob([text], { type: 'text/csv' }), 'schedule.csv')
  notice.value = t({ en: 'Exported CSV with ' + taskBars.value.length + ' tasks.', ja: 'タスク ' + taskBars.value.length + ' 件を CSV に出力しました。' })
}
// The network diagram shows the same plan as a PERT chart; critical tasks and the links between them are highlighted.
// scheduleToGraph leaves out inactive tasks and their links, so it gets the full dependency list.
const showNetwork = ref(false)
// Japanese node details for scheduleToGraph; English pages keep its defaults (ES, EF, Float and hours).
const pertText = isJapanese.value
  ? { labels: { earlyStart: '最早開始', earlyFinish: '最早終了', float: '余裕' }, formatDuration: (value: number) => value / hour + ' 時間' }
  : {}
const network = computed(() => scheduleToGraph(model.value.plan, dependencies, { label: id => labels.get(id)!, formatTime: format, ...pertText }))
</script>

<template>
  <DemoPanel class="schedule-panel" title-id="schedule-title" :title="t({ en: 'Calendar-aware schedule', ja: 'カレンダーを考慮した日程' })" :subtitle="t({ en: 'JST · split shifts · 10 November plant closure', ja: 'JST · 分割シフト · 11月10日は工場休業' })">
    <template #options>
      <label><input v-model="shade" type="checkbox"> {{ t({ en: 'Shade non-working time', ja: '非稼働時間に網掛け' }) }}</label>
      <label><input v-model="compress" type="checkbox"> {{ t({ en: 'Compress non-working time', ja: '非稼働時間を圧縮' }) }}</label>
      <label><input v-model="showCritical" type="checkbox"> {{ t({ en: 'Show critical path and float', ja: 'クリティカルパスと余裕を表示' }) }}</label>
      <label><input v-model="showNetwork" type="checkbox"> {{ t({ en: 'Network diagram', ja: 'ネットワーク図' }) }}</label>
      <label><input v-model="compareBaselines" type="checkbox"> {{ t({ en: 'Compare baseline sets', ja: 'ベースラインを比較' }) }}</label>
      <label><input type="checkbox" :checked="showConstraints" @change="toggleConstraints"> {{ t({ en: 'Show scheduling constraints', ja: 'スケジュールの制約を表示' }) }}</label>
      <label><input type="checkbox" :checked="manualInspection" @change="toggleManualInspection"> {{ t({ en: 'Schedule inspection manually', ja: '検査を手動でスケジュール' }) }}</label>
      <label><input type="checkbox" :checked="orderBCancelled" @change="toggleOrderB"> {{ t({ en: 'Cancel order B (inactive)', ja: 'オーダー B を取り消す(無効)' }) }}</label>
      <label><input v-model="summaryLinks" type="checkbox"> {{ t({ en: 'Summary task links', ja: '集計タスクのリンク' }) }}</label>
      <label><input v-model="recordedActuals" type="checkbox"> {{ t({ en: 'Recorded actuals', ja: '記録された実績' }) }}</label>
      <button type="button" @click="exportSchedule">{{ t({ en: 'Export schedule SVG', ja: '日程を SVG で出力' }) }}</button>
      <button type="button" @click="reset">{{ t({ en: 'Reset schedule', ja: '日程をリセット' }) }}</button>
    </template>
    <div class="options status-options" role="group" :aria-label="t({ en: 'Status date and exports', ja: '状況日付と出力' })">
      <label>{{ t({ en: 'Status date', ja: '状況日付' }) }} <input v-model.number="statusDate" type="range" :min="range.start" :max="range.end" :step="hour"
        :aria-valuetext="format(statusDate)"></label>
      <output :aria-label="t({ en: 'Status date value', ja: '状況日付の値' })">{{ format(statusDate) }}</output>
      <label><input v-model="showProgressLine" type="checkbox"> {{ t({ en: 'Show progress line', ja: 'イナズマ線を表示' }) }}</label>
      <button type="button" @click="rescheduleFromStatus">{{ t({ en: 'Reschedule from status date', ja: '状況日付から再計算' }) }}</button>
      <button type="button" @click="exportMsProject">{{ t({ en: 'Export MS Project XML', ja: 'MS Project XML で出力' }) }}</button>
      <button type="button" @click="exportICalendar">{{ t({ en: 'Export iCalendar', ja: 'iCalendar で出力' }) }}</button>
      <button type="button" @click="exportCsv">{{ t({ en: 'Export CSV', ja: 'CSV で出力' }) }}</button>
    </div>
    <div v-if="compareBaselines" class="options status-options" role="group" :aria-label="t({ en: 'Baseline sets', ja: 'ベースライン' })">
      <label v-for="set in baselineSets" :key="set.id" class="baseline-key" :style="{ '--baseline-key': swatch(set.id) }">
        <input type="checkbox" :checked="shownSets.has(set.id)" @change="toggleSet(set.id, ($event.target as HTMLInputElement).checked)">
        {{ set.label }}</label>
      <span class="hint">{{ t({ en: `Strips under each bar, in this order. Hover a strip, or read a bar's description, for its variance.`, ja: '各バーの下にこの順で帯を表示します。差異は帯にポインターを合わせるか、バーの説明で確認できます。' }) }}</span>
    </div>
    <p v-if="showConstraints" class="hint constraint-hint">{{ t({
      en: `Packing must finish by the 17:00 cut-off. Drag a cutting order's start constraint, or focus it and use the arrow keys or Delete; the plan is rescheduled, and a constraint that cannot be met is reported.`,
      ja: '梱包は 17:00 の締め切りまでに終える必要があります。切断オーダーの開始制約をドラッグするか、フォーカスして矢印キーか Delete を使うと計画を再計算し、満たせない制約は報告します。',
    }) }}</p>
    <dl class="schedule-metrics">
      <div><dt>{{ t({ en: 'Projected finish', ja: '完了予測' }) }}</dt><dd data-testid="schedule-finish">{{ format(model.plan.finish) }}</dd></div>
      <div><dt>{{ t({ en: 'Zero-float tasks', ja: '余裕ゼロのタスク' }) }}</dt><dd>{{ criticalCount }} / {{ model.plan.tasks.length }}</dd></div>
      <div><dt>{{ t({ en: 'Resource overload', ja: 'リソースの過負荷' }) }}</dt><dd data-testid="schedule-overload">{{ t({ en: `${overloadHours} resource-hour${overloadHours === 1 ? '' : 's'}`, ja: `${overloadHours} リソース時間` }) }}</dd></div>
    </dl>
    <GanttChart ref="chart" :rows="rows" :bars="taskBars" :range="range" :dependencies="chartDependencies" :highlighted-dependency-ids="criticalLinks"
      :columns="columns" :header-bands="headerBands" :row-height="58" :height="325" :pixels-per-unit="18 / hour" :scale="workingScale"
      :tick-steps="[4 * hour, 6 * hour, 12 * hour]" :snap="hour" :format-time="format" :selected-ids="selected"
      :non-working-periods="shade ? nonWorking : undefined" :validate-edit="validateEdit" :cascade="cascade" @select="selected = new Set([$event])"
      :status-date="statusDate" :show-progress-line="showProgressLine" :baseline-ids="baselineIds" :baseline-label="baselineLabel"
      :constraints-editable="showConstraints" @constraint-edit="applyConstraint" :labels="componentLabels.gantt"
      @edit="applyEdit" @edits="applyEdits" @edit-rejected="(_change, reason) => notice = reason" @edits-rejected="(_changes, reason) => notice = reason">
      <template #row-heading>{{ t({ en: 'Operation', ja: '工程' }) }}</template>
      <template #bar="{ bar }"><span class="vw-bar-text">{{ barHours(bar.id) }}{{ t({ en: ' h', ja: ' 時間' }) }}</span></template>
      <template #legend><span class="hint">{{ t({ en: 'Drag a cutting order or use its arrow keys; dashed outlines preview the operations that move with it. Link labels show lag; −2 h is a lead. Bar labels show work hours. Grey lines show the original plan. Split bars show work around breaks; red outlines mark the critical path, thin lines show float and the flag marks the dispatch cut-off.', ja: '切断オーダーをドラッグするか矢印キーで動かすと、一緒に動く工程を破線でプレビューします。リンクのラベルはラグで、−2 h はリードです。バーのラベルは作業時間、灰色の線は当初計画です。分割されたバーは休憩をまたぐ作業、赤い枠はクリティカルパス、細い線は余裕、旗は出荷の締め切りを示します。' }) }}<template
        v-if="manualInspection">{{ t({ en: ' The violet bar keeps its manual dates: move or resize it, and links into it are checked instead of moving it.', ja: '紫のバーは手動の日程を保ちます。動かしたり伸縮したりでき、入ってくるリンクはバーを動かさずに検査します。' }) }}</template><template
        v-if="orderBCancelled">{{ t({ en: ' The pale bar is inactive and takes no part in the plan.', ja: '淡いバーは無効で、計画に含まれません。' }) }}</template></span></template>
    </GanttChart>
    <StatusLine>{{ notice }}</StatusLine>
    <section v-if="manualInspection" class="manual-conflicts" aria-labelledby="manual-conflicts-title">
      <h3 id="manual-conflicts-title">{{ t({ en: 'Manual date conflicts', ja: '手動の日程の競合' }) }}</h3>
      <ul v-if="manualConflicts.length">
        <li v-for="conflict in manualConflicts" :key="conflict.dependencyId">{{ describeConflict(conflict) }}</li>
      </ul>
      <p v-else>{{ t({ en: 'None: the manual dates meet every link into them.', ja: 'なし: 手動の日程は入ってくるすべてのリンクを満たしています。' }) }}</p>
    </section>
    <NetworkGraph v-if="showNetwork" :nodes="network.nodes" :edges="network.edges" :related-ids="network.criticalNodeIds"
      :options="{ nodeWidth: 300, nodeHeight: 58 }" :height="300" :labels="{ ...componentLabels.graph, region: t({ en: 'Schedule network diagram', ja: '日程のネットワーク図' }) }" />
  </DemoPanel>
  <DemoPanel title-id="load-title" :title="t({ en: 'Resource demand and capacity', ja: 'リソースの需要と能力' })" :subtitle="t({ en: 'Demand uses work segments. Breaks and closed dates consume zero work.', ja: '需要は作業区間から計算します。休憩と休業日は作業を消費しません。' })">
    <GanttChart :rows="resources" :bars="loadBars" :range="range" :columns="resourceColumns" :header-bands="[headerBands[0]!]"
      :row-height="48" :height="213" :pixels-per-unit="18 / hour" :tick-steps="[4 * hour, 6 * hour, 12 * hour]" :scale="workingScale"
      :format-time="format" :non-working-periods="shade ? nonWorking : undefined" readonly :show-controls="false" :labels="componentLabels.gantt">
      <template #row-heading>{{ t({ en: 'Equipment', ja: '設備' }) }}</template>
      <template #legend><span class="hint">{{ t({ en: 'Demand / available units · Amber indicates overload', ja: '需要 / 利用可能な単位数 · 琥珀色は過負荷' }) }}</span></template>
    </GanttChart>
    <table v-if="overloads.length" class="load-table">
      <caption>{{ t({ en: 'Overload intervals', ja: '過負荷の区間' }) }}</caption>
      <thead><tr><th scope="col">{{ t({ en: 'Equipment', ja: '設備' }) }}</th><th scope="col">{{ t({ en: 'From', ja: '開始' }) }}</th><th scope="col">{{ t({ en: 'To', ja: '終了' }) }}</th><th scope="col">{{ t({ en: 'Demand / capacity', ja: '需要 / 能力' }) }}</th><th scope="col">{{ t({ en: 'Operations', ja: '工程' }) }}</th></tr></thead>
      <tbody><tr v-for="segment in overloads" :key="segment.resourceId + ':' + segment.start">
        <td>{{ resources.find(resource => resource.id === segment.resourceId)?.label }}</td>
        <td>{{ format(segment.start) }}</td><td>{{ format(segment.end) }}</td>
        <td>{{ segment.load }} / {{ segment.capacity }}</td>
        <td>{{ segment.taskIds.map(id => labels.get(id)).join(', ') }}</td>
      </tr></tbody>
    </table>
    <p v-else class="status">{{ t({ en: 'No capacity conflicts in the current plan.', ja: '現在の計画に能力の競合はありません。' }) }}</p>
    <PlanningDiagnostics v-if="diagnostics.length" :diagnostics="diagnostics" :task-label="id => labels.get(id) ?? id"
      :resource-label="id => resources.find(resource => resource.id === id)?.label ?? id" :dependency-label="dependencyLabel" :format-time="format" @activate="revealDiagnostic" />
  </DemoPanel>
  <SummaryLinksDemo v-if="summaryLinks" />
  <ActualsDemo v-if="recordedActuals" />
</template>

<style scoped>
/* Ten toggles do not fit beside the title: the toggles move below it and wrap instead of squeezing each label. */
.schedule-panel :deep(.section-head) { flex-wrap: wrap; }
.schedule-panel :deep(.section-head > .options) { flex-wrap: wrap; gap: 8px 16px; }
.status-options { flex-wrap: wrap; gap: 8px; margin-bottom: 8px; }
.status-options input[type="range"] { vertical-align: middle; width: 180px; }
/* Legend swatches in the colour of the slot each shown set is drawn in. */
.constraint-hint { margin: 0 0 8px; }
.baseline-key::after { content: ''; display: inline-block; width: 18px; height: 3px; border-radius: 1.5px; background: var(--baseline-key); }
.manual-conflicts { margin: 8px 0 0; padding: 4px 0 4px 10px; border-inline-start: 4px solid #b07400; font-size: 12px; }
.manual-conflicts h3 { margin: 0 0 4px; font-size: 13px; }
.manual-conflicts ul { margin: 0; padding-inline-start: 18px; }
.manual-conflicts p { margin: 0; color: var(--vw-muted, #4f6574); }
</style>
