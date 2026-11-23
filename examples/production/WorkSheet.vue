<script setup lang="ts">
// A project plan in the style of a scheduling app: the task grid on the left is the source of truth, and the bars,
// arrows and critical path on the right are derived from it by the core scheduler on every change.
import { computed, ref } from 'vue'
import {
  GanttChart, applyTimelineSheetEdit, formatFieldValue, invertWorkPeriods, scheduleTasks, scheduledBarFields, useEditHistory,
  type FieldValue, type ScheduleResult, type TimelineColumn, type TimelineEdit, type TimelineFieldEdit, type TimelineFieldSpec,
  type TimelineSheetEdit,
} from '../../src'
import { componentLabels } from '../i18n'

const props = defineProps<{ ja: boolean }>()
const t = (ja: string, en: string) => props.ja ? ja : en

// The model: one entry per row. `start` is a "start no earlier than" constraint, `after` the predecessor IDs.
interface Task { id: string; parentId?: string; start?: number; duration: number; after: string[]; resource: string | null; done: number }
const names: Record<string, [string, string]> = {
  plan: ['計画', 'Planning'], spec: ['要件定義', 'Requirements'], layout: ['レイアウト設計', 'Layout design'], approve: ['設計承認', 'Design approval'],
  buy: ['調達', 'Procurement'], order: ['部品発注', 'Order parts'], frame: ['フレーム製作', 'Build frame'],
  install: ['据付', 'Installation'], remove: ['旧設備撤去', 'Remove old line'], assemble: ['組立', 'Assembly'], trial: ['試運転', 'Trial run'], handover: ['引き渡し', 'Handover'],
}
const task = (id: string, duration: number, after: string[] = [], resource: string | null = null, done = 0, parentId?: string): Task =>
  ({ id, parentId, duration, after, resource, done })
const history = useEditHistory<Task[]>([
  task('plan', 0),
  task('spec', 3, [], 'design', 100, 'plan'), task('layout', 5, ['spec'], 'design', 40, 'plan'), task('approve', 0, ['layout'], null, 0, 'plan'),
  task('buy', 0, ['approve']),
  task('order', 2, [], 'purchasing', 0, 'buy'), task('frame', 6, ['order'], 'machining', 0, 'buy'),
  task('install', 0),
  task('remove', 3, ['approve'], 'maintenance', 0, 'install'), task('assemble', 4, ['frame', 'remove'], 'assembly', 0, 'install'),
  task('trial', 2, ['assemble'], 'qa', 0, 'install'), task('handover', 0, ['trial'], null, 0, 'install'),
])

// Time is measured in days from Monday 1 March 2027; Saturdays and Sundays are not working time.
const range = { start: 0, end: 70 }
const origin = Date.UTC(2027, 2, 1)
const workPeriods = Array.from({ length: 10 }, (_, week) => ({ start: week * 7, end: week * 7 + 5 }))
const weekends = invertWorkPeriods(workPeriods, range)
const workDays = (start: number, end: number) => Array.from({ length: end - start }, (_, i) => (start + i) % 7 < 5).filter(Boolean).length
const formatDay = (day: number) => { const date = new Date(origin + day * 86_400_000); return `${date.getUTCMonth() + 1}/${date.getUTCDate()}` }
function parseDay(text: string): FieldValue | { error: string } {
  const match = /^(\d{1,2})\/(\d{1,2})$/.exec(text.trim())
  const day = match ? (Date.UTC(2027, Number(match[1]) - 1, Number(match[2])) - origin) / 86_400_000 : NaN
  return Number.isInteger(day) && day >= range.start && day < range.end ? day : { error: t('3/1〜5/9 の日付を「月/日」で入力してください', 'Enter a date from 3/1 to 5/9 as month/day') }
}

const links = (tasks: readonly Task[]) => tasks.flatMap(item => item.after.map(from => ({ id: from + '>' + item.id, from, to: item.id, type: 'FS' as const })))
const schedule = (tasks: readonly Task[]): ScheduleResult => scheduleTasks({
  range, quantum: 1, calendars: [{ id: 'week', periods: workPeriods }], defaultCalendarId: 'week', dependencies: links(tasks),
  tasks: tasks.map(({ id, parentId, duration, start }) => ({ id, duration, ...(parentId && { parentId }), ...(start !== undefined && { startNoEarlierThan: start }) })),
})
// Only plans that schedule are committed, so the current one always succeeds.
const plan = computed(() => schedule(history.state.value) as Extract<ScheduleResult, { ok: true }>)
const isSummary = (id: string) => history.state.value.some(item => item.parentId === id)

const rows = computed(() => history.state.value.map((item, index) => ({
  id: item.id, parentId: item.parentId, label: names[item.id]![props.ja ? 0 : 1], number: index + 1, task: item, planned: plan.value.tasks[index]!,
})))
type Row = typeof rows.value[number]
const numberOf = (id: string) => rows.value.find(row => row.id === id)!.number

const resources = computed(() => [['design', '設計', 'Design'], ['purchasing', '購買', 'Purchasing'], ['machining', '機械加工', 'Machining'],
  ['maintenance', '保全', 'Maintenance'], ['assembly', '組立班', 'Assembly'], ['qa', '品質保証', 'QA']].map(([value, ja, en]) => ({ value: value!, label: t(ja!, en!) })))
const leaf = (row: Row) => !isSummary(row.id)
// Each typed column has a `field`: the sheet parses, validates and formats cell text through it.
const columns = computed<TimelineColumn<Row>[]>(() => {
  const column = (id: string, label: string, width: number, spec: Omit<TimelineFieldSpec<Row>, 'id'>): TimelineColumn<Row> => {
    const field = { id, ...spec }
    return { id, label, width, editable: leaf, field, value: row => formatFieldValue(field, field.get(row)) }
  }
  return [
    { id: 'number', label: '#', width: 56, value: row => row.number },
    column('start', t('開始', 'Start'), 70, { kind: 'number', get: row => row.planned.start, parse: parseDay, format: value => value === null ? '' : formatDay(Number(value)) }),
    column('duration', t('期間', 'Duration'), 76, { kind: 'duration', required: true, max: 60, unitLabel: t('日', 'd'), durationBasis: 'working',
      get: row => leaf(row) ? row.task.duration : workDays(row.planned.start, row.planned.end) }),
    column('after', t('先行', 'Predecessors'), 104, { kind: 'text', get: row => row.task.after.map(numberOf).join(', ') || null,
      parse: text => /^\d+(\s*,\s*\d+)*$/.test(text.trim()) ? text.trim().split(/\s*,\s*/).join(', ') : { error: t('「2, 3」のようにタスク番号で入力してください', 'Use task numbers such as 2, 3') } }),
    column('resource', t('担当', 'Resource'), 116, { kind: 'select', choices: resources.value, get: row => row.task.resource }),
    column('done', t('進捗 %', '% done'), 68, { kind: 'number', integer: true, min: 0, max: 100, get: row => leaf(row) ? row.task.done : Math.round(summaryDone(row.id)) }),
  ]
})
function summaryDone(id: string): number {
  const children = rows.value.filter(row => row.parentId === id)
  const weight = children.reduce((sum, row) => sum + row.task.duration, 0)
  return weight ? children.reduce((sum, row) => sum + row.task.duration * row.task.done, 0) / weight : 0
}

// Bars, arrows and the critical path come straight from the plan; summary rows get rollup bars from `showSummaries`.
// The weekend gaps of `segments` are left out, so bars run across weekends as in most project tools.
const bars = computed(() => rows.value.filter(leaf).map(row => {
  const { segments: _, ...fields } = scheduledBarFields(row.planned)
  return { id: row.id, rowId: row.id, label: row.label, editable: true, progress: row.task.done / 100, ...fields }
}))
const dependencies = computed(() => links(history.state.value))
const critical = computed(() => new Set(plan.value.criticalDependencyIds))

// Every change goes through `plan`: it schedules the new tasks first and refuses the whole change when that fails.
const message = ref('')
function planChange(change: (rows: Row[]) => Row[]): { tasks: Task[] } | { reason: string } {
  let next: Task[], result: ScheduleResult
  try {
    next = change(rows.value).map(row => row.task)
    result = schedule(next)
  } catch (error) {
    return { reason: (error as Error).message }
  }
  if (result.ok) return { tasks: next }
  return { reason: result.code === 'cycle'
    ? t(`先行関係が循環するため取り消しました（タスク ${result.cycles[0]!.taskIds.map(numberOf).join(', ')}）。`, `Rejected: the predecessors would form a cycle (tasks ${result.cycles[0]!.taskIds.map(numberOf).join(', ')}).`)
    : t('計画期間に収まらないため取り消しました。', 'Rejected: the plan would not fit in the project window.') }
}
function commit(change: (rows: Row[]) => Row[]) {
  const planned = planChange(change)
  if ('reason' in planned) return void (message.value = planned.reason)
  history.commit(planned.tasks)
  message.value = ''
}
// Writes one typed edit into a row's task. Throwing here rejects the whole batch before anything is committed.
function writeField(row: Row, edit: TimelineFieldEdit<Row>): Row {
  const value = edit.after
  const item = { ...row.task }
  if (edit.fieldId === 'start') item.start = value === null ? undefined : Number(value)
  else if (edit.fieldId === 'duration') item.duration = Number(value)
  else if (edit.fieldId === 'resource') item.resource = value as string | null
  else if (edit.fieldId === 'done') item.done = Number(value ?? 0)
  else if (edit.fieldId === 'after') {
    item.after = value === null ? [] : String(value).split(', ').map(text => {
      const from = rows.value[Number(text) - 1]
      if (!from) throw new Error(t(`タスク ${text} は存在しないため取り消しました。`, `Rejected: task ${text} does not exist.`))
      if (from.id === row.parentId || from.parentId === row.id) throw new Error(t(`タスク ${text} は自身の親または子です。`, `Rejected: task ${text} is the task's own summary or subtask.`))
      return from.id
    })
  }
  return { ...row, task: item }
}
// A single cell edit and a whole paste, fill or clear batch use the same helper, so they commit as one undo step each.
const applyField = (edit: TimelineFieldEdit<Row>) => commit(current => applyTimelineSheetEdit(current, { fieldEdits: [edit] }, { field: writeField }))
const sheetChange = (batch: TimelineSheetEdit<Row>) => (current: Row[]) => applyTimelineSheetEdit(current, batch, { field: writeField })
const applySheet = (batch: TimelineSheetEdit<Row>) => commit(sheetChange(batch))
// `validateSheetEdit` checks a whole paste, fill or clear before it is proposed; the chart then emits
// `sheet-edit-rejected` with the reason instead of `sheet-edit`.
function checkSheet(batch: TimelineSheetEdit<Row>) {
  const planned = planChange(sheetChange(batch))
  return 'reason' in planned ? planned.reason : true
}
// A bar move sets the start constraint; a resize sets the duration in working days.
function applyBar(edit: TimelineEdit) {
  commit(current => current.map(row => row.id !== edit.id ? row : { ...row, task: { ...row.task,
    start: edit.mode === 'end' ? row.task.start : edit.after.start,
    duration: edit.mode === 'move' ? row.task.duration : workDays(edit.after.start, edit.after.end) } }))
}
const checkDuration = (edit: TimelineFieldEdit<Row>) =>
  edit.fieldId !== 'duration' || Number.isInteger(edit.after) || t('期間は日単位で入力してください', 'Durations are whole days')
</script>

<template>
  <div class="production-title"><div><h1>{{ t('工程表', 'Schedule sheet') }}</h1>
    <p>{{ t('表を編集すると、スケジューラーがバー・矢印・クリティカルパスを計算し直します。', 'Edit the task grid; the scheduler recalculates the bars, arrows and critical path.') }}</p></div>
    <div class="production-actions"><button :disabled="!history.canUndo.value" @click="history.undo">{{ t('元に戻す', 'Undo') }}</button>
      <button :disabled="!history.canRedo.value" @click="history.redo">{{ t('やり直す', 'Redo') }}</button></div></div>
  <section class="production-panel"><div class="production-heading"><h2>{{ t('ライン3 改修プロジェクト', 'Line 3 retrofit') }}</h2></div>
    <GanttChart spreadsheet show-summaries summary-dependencies :rows="rows" :columns="columns" :bars="bars" :dependencies="dependencies"
      :highlighted-dependency-ids="critical" :range="range" :non-working-periods="weekends" :pixels-per-unit="22" :tick-steps="[7]"
      :snap="1" :min-duration="1" :format-time="formatDay" :height="480" :row-height="36" :label-width="150" :labels="{ ...componentLabels(ja ? 'ja' : 'en').gantt, rows: t('タスク', 'Task') }"
      :validate-field-edit="checkDuration" :validate-sheet-edit="checkSheet" @edit="applyBar" @field-edit="applyField" @sheet-edit="applySheet"
      @field-edit-rejected="(_, reason) => message = reason" @sheet-edit-rejected="reason => message = reason" />
    <p class="production-caption sheet-status" role="status" :aria-label="t('編集結果', 'Edit result')">{{ message }}</p>
    <p class="production-caption">{{ t('ダブルクリック・Enter・F2・文字入力でセルを編集。Shift＋クリックまたはShift＋矢印キーで範囲選択。Ctrl / ⌘＋C・X・Vでコピー・切り取り・貼り付け、Deleteで消去、Ctrl / ⌘＋Dで先頭行の値を下にコピー。選択範囲の右下をドラッグしてもコピーできます。先行はタスク番号で入力します。',
      'Double-click, Enter, F2 or typing edits a cell. Shift-click or Shift-arrow selects a range. Ctrl / ⌘ + C, X or V copies, cuts or pastes; Delete clears; Ctrl / ⌘ + D fills down from the first row. You can also drag the bottom-right handle down. Predecessors are task numbers.') }}</p>
  </section>
</template>
