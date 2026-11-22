<script setup lang="ts">
import { computed, nextTick, ref, shallowRef, watch } from 'vue'
import {
  GanttChart, buildPlacementInput, calculateResourceLoad, createResourceTimelineProjector, levelResources, proposeResourceAssignment,
  resolveResourceTimelineEdit, resourceTimelineBarId, scheduleTasks, scheduledBarFields, toPlanningDiagnostics, useEditHistory, useEditTransaction,
  type FieldValue, type SaveResult, type TransactionAdapter, type TransactionOutcome, type LevelResourcesInput, type LevelResourcesResult, type PlanningDiagnostic, type ResourceAssignment, type ResourceLoadSegment,
  type ScheduleLink, type ScheduleResult, type ScheduleTask, type ScheduleTrace, type TimelineDrop, type TimelineEdit,
} from '../src'
import { createTransactionStore, type ServerMode } from './adapters/transactionStore'
import PlanningBacklog from './components/PlanningBacklog.vue'
import PlanningDiagnostics from './components/PlanningDiagnostics.vue'
import PlanningInspector from './components/PlanningInspector.vue'
import SaveStatus from './components/SaveStatus.vue'
import { BACKLOG_MIME, type InspectorField, type PlaceRequest } from './components/types'
import { formatTime, hour, origin } from './data'
import DemoPanel from './components/DemoPanel.vue'
import StatusLine from './components/StatusLine.vue'
import { useDemoLocale } from './i18n'

// One plan, shown by resource. Tasks A and B need the same press, so the press is overloaded until one of them moves.
// The plan is the single source of truth (tasks, assignments, placed IDs); the chart rows are a projection of it.
// Every edit becomes a proposal that is calculated and previewed first, and then applied as ONE history entry.
interface PlanModel { tasks: ScheduleTask[]; assignments: ResourceAssignment[]; placed: string[] }
type Policy = 'warn' | 'reject' | 'level'
const { t, labels, isJapanese } = useDemoLocale()

const range = { start: origin, end: origin + 14 * hour }
const quantum = hour / 4
const resources = [
  { id: 'press-1', label: t({ en: 'Press 1', ja: 'プレス 1' }), capacity: 1 },
  { id: 'press-2', label: t({ en: 'Press 2', ja: 'プレス 2' }), capacity: 1 },
  { id: 'crew', label: t({ en: 'Crew', ja: '作業班' }), capacity: 1 },
]
const resourceRows = resources.map(resource => ({ id: resource.id, label: resource.label, detail: t({ en: 'capacity ', ja: '能力 ' }) + resource.capacity }))
const resourceIds = resources.map(resource => resource.id)
const resourceLabel = (id: string) => resources.find(resource => resource.id === id)?.label ?? id
const taskLabels = new Map(t({
  en: [['A', 'Mold A'], ['B', 'Mold B'], ['C', 'Finish C'], ['D', 'Rework D'], ['E', 'Inspect E']],
  ja: [['A', '成形 A'], ['B', '成形 B'], ['C', '仕上げ C'], ['D', '手直し D'], ['E', '検査 E']],
}) as [string, string][])
const taskLabel = (id: string) => taskLabels.get(id) ?? id
// Task links use task IDs. The chart receives one link between representative projections (see the projection below).
const links: ScheduleLink[] = [{ id: 'A-C', from: 'A', to: 'C', type: 'FS' }, { id: 'D-E', from: 'D', to: 'E', type: 'FS' }]
const initial: PlanModel = {
  tasks: [
    { id: 'A', duration: 3 * hour, startNoEarlierThan: origin },
    { id: 'B', duration: 2 * hour, startNoEarlierThan: origin + hour },
    { id: 'C', duration: 2 * hour },
    { id: 'D', duration: 2 * hour },
    { id: 'E', duration: hour },
  ],
  // A needs both the press and the crew, so it appears in two rows while it stays one task.
  assignments: [
    { taskId: 'A', resourceId: 'press-1' }, { taskId: 'A', resourceId: 'crew' }, { taskId: 'B', resourceId: 'press-1' },
    { taskId: 'C', resourceId: 'press-2' }, { taskId: 'D', resourceId: 'press-2' }, { taskId: 'E', resourceId: 'crew' },
  ],
  placed: ['A', 'B', 'C'],
}
const history = useEditHistory<PlanModel>(initial)
const policy = ref<Policy>('warn')

// ---- optional server-backed mode: one user operation = one transaction over tasks, assignments and placement ----
// The load is derived from the accepted plan, so it is never saved and never changes on its own: a rejected,
// conflicting or unknown save leaves tasks, assignments and load exactly as they were. The candidate is only previewed.
type PlanChange =
  | { type: 'tasks'; tasks: ScheduleTask[] }
  | { type: 'assignments'; assignments: ResourceAssignment[] }
  | { type: 'placed'; placed: string[] }
const server = createTransactionStore<PlanModel>(initial, {
  // In conflict mode another planner lengthens Finish C first, so the reloaded plan visibly differs.
  remoteEdit: plan => ({ ...plan, tasks: plan.tasks.map(item => item.id === 'C' ? { ...item, duration: item.duration + hour } : item) }),
})
const planAdapter: TransactionAdapter<PlanModel, PlanChange> = {
  validate(_plan, changes) {
    for (const change of changes) {
      if (change.type === 'assignments') {
        const seen = new Set<string>()
        for (const item of change.assignments) {
          const key = item.taskId + '\u0000' + item.resourceId
          if (seen.has(key)) return taskLabel(item.taskId) + ' is assigned to ' + resourceLabel(item.resourceId) + ' twice.'
          if (!resourceIds.includes(item.resourceId)) return t({ en: 'Unknown resource ' + item.resourceId + '.', ja: '不明なリソース ' + item.resourceId + '。' })
          seen.add(key)
        }
      }
      if (change.type === 'placed' && new Set(change.placed).size !== change.placed.length) return t({ en: 'A task is placed twice.', ja: 'タスクが二重に配置されています。' })
    }
  },
  apply(plan, changes) {
    let next = plan
    for (const change of changes) {
      if (change.type === 'tasks') next = { ...next, tasks: change.tasks }
      else if (change.type === 'assignments') next = { ...next, assignments: change.assignments }
      else next = { ...next, placed: change.placed }
    }
    return next
  },
  save: (request, candidate) => server.save(request, candidate),
}
const tx = useEditTransaction<PlanModel, PlanChange>({ documentId: 'resource-plan', initialState: initial, initialVersion: server.info.version, adapter: planAdapter })
const serverBacked = ref(false)
const busy = ref(false)
const saving = computed(() => serverBacked.value && tx.status.value === 'saving')
const model = computed(() => serverBacked.value ? tx.acceptedState.value : history.state.value)
const canUndo = computed(() => serverBacked.value ? tx.canUndo.value && !saving.value : history.canUndo.value)
const canRedo = computed(() => serverBacked.value ? tx.canRedo.value && !saving.value : history.canRedo.value)
watch(serverBacked, on => {
  proposal.value = undefined
  busy.value = false
  if (on) {
    // Start from what the server stores; the local history does not travel to the server.
    const latest = server.fetch()
    tx.refresh(latest.state, latest.version)
    notice.value = t({ en: 'Changes are now saved through the mock server. Loaded version ' + latest.version + '.', ja: '変更はモックサーバー経由で保存します。版 ' + latest.version + ' を読み込みました。' })
  } else {
    history.reset(tx.acceptedState.value)
    notice.value = t({ en: 'Changes are applied locally again, starting from the last saved plan.', ja: '変更をローカルに適用する方式に戻しました。最後に保存した計画から始めます。' })
  }
})
function describeOutcome(outcome: TransactionOutcome<PlanModel>): string {
  if (outcome.status === 'accepted') return t({ en: 'accepted by the server as version ' + outcome.version, ja: 'サーバーが版 ' + outcome.version + ' として受理' })
  if (outcome.status === 'invalid') return t({ en: 'not sent: ', ja: '未送信: ' }) + outcome.reason
  if (outcome.status === 'busy') return t({ en: 'not sent: another save is in progress', ja: '未送信: 別の保存が進行中' })
  if (outcome.status === 'discarded') return t({ en: 'the answer no longer matches the plan', ja: '応答が計画と合わなくなりました' })
  if (outcome.status === 'rejected') return t({ en: 'rejected by the server (' + outcome.code + '); nothing changed', ja: 'サーバーが拒否(' + outcome.code + ')。何も変わっていません' })
  if (outcome.status === 'conflict') return t({ en: 'version conflict with ' + outcome.currentVersion + '; nothing changed', ja: '版 ' + outcome.currentVersion + ' と競合。何も変わっていません' })
  return t({ en: 'no answer; the save may or may not have been applied', ja: '応答なし。保存が適用されたかどうかは不明です' })
}
function reloadLatest() {
  const latest = server.fetch()
  tx.refresh(latest.state, latest.version)
  proposal.value = undefined
  notice.value = t({ en: 'Loaded version ' + latest.version + ' from the server. Undo starts from here.', ja: 'サーバーから版 ' + latest.version + ' を読み込みました。元に戻す操作はここから始まります。' })
}
function checkWithServer() {
  const operationId = tx.pendingTransaction.value?.operationId
  if (!operationId) return
  const stored: SaveResult<PlanModel> = server.lookup(operationId) ?? { status: 'rejected', operationId, code: 'not-applied' }
  const outcome = tx.reconcile(stored)
  notice.value = stored.status === 'accepted'
    ? t({ en: 'The server had applied the save: ' + describeOutcome(outcome) + '.', ja: 'サーバーは保存を適用していました: ' + describeOutcome(outcome) + '。' })
    : t({ en: 'The server never applied the save, so nothing changed.', ja: 'サーバーは保存を適用していなかったため、何も変わっていません。' })
}

// ---- received proposals: what the parent got from the chart or the backlog, by pointer or keyboard ----
type InputSource = 'pointer' | 'keyboard'
const proposalLog = ref<string[]>([])
function logProposal(source: InputSource, text: string) {
  const name = t({ en: source, ja: source === 'pointer' ? 'ポインター' : 'キーボード' })
  proposalLog.value = [...proposalLog.value.slice(-9), name + ': ' + text]
}
function logEdit(edit: TimelineEdit) {
  const shown = projection.value.origins.get(edit.id)
  if (!shown) return
  const target = edit.row?.after ?? shown.resourceId
  const reassigned = target !== shown.resourceId
  const timed = edit.after.start !== edit.before.start || edit.after.end !== edit.before.end
  const kind = edit.mode !== 'move' ? 'resize' : reassigned && timed ? 'reassign and reschedule' : reassigned ? 'reassign' : 'reschedule'
  const kindJa = { resize: '伸縮', 'reassign and reschedule': '割り当てと日程を変更', reassign: '割り当てを変更', reschedule: '日程を変更' }[kind]
  const time = formatTime(edit.after.start) + '–' + formatTime(edit.after.end)
  logProposal(edit.source, t({ en: kind + ' ' + taskLabel(shown.taskId) + ' on ' + resourceLabel(target) + ' at ' + time, ja: taskLabel(shown.taskId) + ' を ' + resourceLabel(target) + ' の ' + time + ' に' + kindJa }))
}

// ---- calculation: placement input, then scheduleTasks or levelResources, then load and diagnostics ----
interface Calc {
  name: 'scheduleTasks' | 'levelResources'
  placement: ReturnType<typeof buildPlacementInput<LevelResourcesInput>>
  plan: ScheduleResult | LevelResourcesResult
  load: ResourceLoadSegment[]
  diagnostics: PlanningDiagnostic[]
  trace?: ScheduleTrace
  unresolved: readonly string[]
}
const unresolvedOf = (plan: ScheduleResult | LevelResourcesResult): readonly string[] => plan.ok && 'unresolvedTaskIds' in plan ? plan.unresolvedTaskIds : []
function compute(state: PlanModel, mode: Policy): Calc {
  const full: LevelResourcesInput = { range, quantum, tasks: state.tasks, dependencies: links, resources, assignments: state.assignments }
  // Unplaced tasks have no dates: they, their links and their assignments are left out of the calculation, never invented.
  const placement = buildPlacementInput(full, state.placed)
  const leveled = mode === 'level'
  const plan: ScheduleResult | LevelResourcesResult = leveled ? levelResources(placement.input, { explain: true }) : scheduleTasks(placement.input, { explain: true })
  const load = plan.ok ? calculateResourceLoad(range, plan.tasks, resources, placement.input.assignments ?? []) : []
  return {
    name: leveled ? 'levelResources' : 'scheduleTasks', placement, plan, load,
    diagnostics: toPlanningDiagnostics(plan, plan.ok ? load : undefined),
    ...(plan.ok ? { trace: (plan as { trace?: ScheduleTrace }).trace } : {}),
    unresolved: unresolvedOf(plan),
  }
}
const current = computed(() => compute(model.value, policy.value))
const overloads = (calc: Calc) => calc.load.filter(segment => segment.overload > 0).length
/** What the calculation did about capacity. It says "resolved" only when levelResources left no unresolved task. */
function capacitySummary(calc: Calc) {
  if (!calc.plan.ok) return t({ en: 'No plan could be calculated.', ja: '計画を計算できませんでした。' })
  const over = overloads(calc)
  if (calc.name === 'scheduleTasks') {
    return over
      ? t({ en: over + ' overloaded interval(s). scheduleTasks reports load but does not enforce capacity.', ja: '過負荷の区間が ' + over + ' 個あります。scheduleTasks は負荷を報告しますが、能力は守らせません。' })
      : t({ en: 'No overloaded interval in the calculated load.', ja: '計算した負荷に過負荷の区間はありません。' })
  }
  if (calc.unresolved.length) {
    return t({
      en: 'Not resolved: ' + calc.unresolved.map(taskLabel).join(', ') + ' could not be leveled within their constraints; ' + over + ' overloaded interval(s) remain.',
      ja: '未解決: ' + calc.unresolved.map(taskLabel).join('、') + ' は制約の範囲内で平準化できませんでした。過負荷の区間が ' + over + ' 個残っています。',
    })
  }
  return over
    ? t({ en: over + ' overloaded interval(s) remain after leveling.', ja: '平準化の後も過負荷の区間が ' + over + ' 個残っています。' })
    : t({ en: 'Capacity constraints resolved by levelResources.', ja: 'levelResources が能力の制約を解消しました。' })
}

// ---- projection onto resource rows ----
const projector = createResourceTimelineProjector()
const projectionTasks = computed(() => current.value.plan.ok
  ? current.value.plan.tasks.map(item => {
    const { start, end, segments } = scheduledBarFields(item)
    return { id: item.id, label: taskLabel(item.id), start, end, ...(segments ? { segments } : {}), editable: true, tone: item.critical ? 'amber' as const : 'blue' as const }
  })
  : [])
const unplannedIds = computed(() => model.value.tasks.filter(item => !model.value.placed.includes(item.id)).map(item => item.id))
const projection = computed(() => projector({
  resources: resourceRows, tasks: projectionTasks.value, assignments: model.value.assignments, dependencies: links, unplannedTaskIds: unplannedIds.value,
}))
const loadRows = resourceRows.map(({ id, label }) => ({ id, label }))
const backlogItems = computed(() => unplannedIds.value.map(id => ({
  id, label: taskLabel(id),
  detail: (model.value.assignments.filter(item => item.taskId === id).map(item => resourceLabel(item.resourceId)).join(', ') || t({ en: 'no resource', ja: 'リソースなし' })) + ' · ' + (model.value.tasks.find(item => item.id === id)!.duration / hour) + t({ en: ' h', ja: ' 時間' }),
})))
// The keyboard placement offers every snap step (the chart's default `snap` is 15 minutes), the same times a pointer drop can reach.
const startTimes = Array.from({ length: (range.end - range.start) / quantum }, (_, index) => ({ value: range.start + index * quantum, label: formatTime(range.start + index * quantum) }))

// ---- proposals: calculated and previewed, then applied as one history entry ----
interface Proposal { title: string; changes: string[]; base: PlanModel; next: PlanModel; calc: Calc; focusBarId?: string; source?: InputSource }
const proposal = shallowRef<Proposal>()
const notice = ref(t({ en: 'Move a bar (drag, or arrow keys; Up and Down change the resource), edit the inspector, or place an unplanned task.', ja: 'バーを動かす(ドラッグか矢印キー。上下キーでリソースを変更)、インスペクターで編集する、未計画のタスクを配置する、のいずれかを試してください。' }))
function reject(reason: string) {
  proposal.value = undefined
  notice.value = t({ en: 'Not applied: ', ja: '適用しませんでした: ' }) + reason
}
function propose(title: string, changes: string[], next: PlanModel, focusBarId?: string, source?: InputSource) {
  let calc: Calc
  try {
    calc = compute(next, policy.value)
  } catch (error) {
    return reject(error instanceof Error ? error.message : String(error))
  }
  if (!calc.placement.ok) {
    return reject(calc.placement.diagnostics.map(item => item.code === 'unplaced-predecessor'
      ? t({
        en: taskLabel(item.taskId) + ' depends on ' + taskLabel(item.predecessorId) + ', which is not placed yet. Place ' + taskLabel(item.predecessorId) + ' first.',
        ja: taskLabel(item.taskId) + ' は未配置の ' + taskLabel(item.predecessorId) + ' に依存しています。先に ' + taskLabel(item.predecessorId) + ' を配置してください。',
      })
      : t({ en: taskLabel(item.taskId) + ' has no placed subtask to span. Place one of its subtasks first.', ja: taskLabel(item.taskId) + ' には配置済みのサブタスクがありません。先にサブタスクを1つ配置してください。' })).join(' '))
  }
  if (!calc.plan.ok) {
    return reject(calc.plan.code === 'cycle' ? t({ en: 'The change creates a dependency cycle.', ja: 'この変更は依存関係の循環を生みます。' })
      : t({ en: taskLabel(calc.plan.taskId) + ' cannot meet its constraints (' + calc.plan.constraints.join(', ') + ').', ja: taskLabel(calc.plan.taskId) + ' は制約を満たせません(' + calc.plan.constraints.join(', ') + ')。' }))
  }
  if (policy.value === 'reject' && overloads(calc) > overloads(current.value)) {
    return reject(t({
      en: 'the capacity policy rejects changes that add overload (' + overloads(calc) + ' overloaded interval(s) instead of ' + overloads(current.value) + ').',
      ja: '能力の方針により、過負荷を増やす変更は却下します(過負荷の区間が ' + overloads(current.value) + ' 個から ' + overloads(calc) + ' 個に増えます)。',
    }))
  }
  notice.value = t({ en: 'Review the preview, then apply or discard it.', ja: 'プレビューを確認してから、適用するか破棄してください。' })
  proposal.value = { title, changes, base: model.value, next, calc, ...(focusBarId ? { focusBarId } : {}), ...(source ? { source } : {}) }
}
function describeDates(calc: Calc) {
  if (!calc.plan.ok || !current.value.plan.ok) return []
  const before = new Map(current.value.plan.tasks.map(item => [item.id, item]))
  return calc.plan.tasks.flatMap(item => {
    const old = before.get(item.id)
    return !old || old.start !== item.start || old.end !== item.end
      ? [taskLabel(item.id) + ' ' + (old ? formatTime(old.start) + '–' + formatTime(old.end) + ' → ' : '') + formatTime(item.start) + '–' + formatTime(item.end)] : []
  })
}
async function apply() {
  const pending = proposal.value
  if (!pending) return
  if (pending.base !== model.value) return reject(t({ en: 'the plan changed after the preview was calculated. Make the change again.', ja: 'プレビューを計算した後に計画が変わりました。もう一度変更してください。' }))
  if (serverBacked.value) return applyThroughServer(pending)
  history.commit(pending.next)
  proposal.value = undefined
  notice.value = t({ en: 'Applied: ' + pending.title + '.', ja: '適用しました: ' + pending.title + '。' })
  await nextTick()
  // An assignment change gives the bar a new ID, so the keyboard focus is returned by the parent to the new bar.
  if (pending.focusBarId) void chart.value?.revealBar(pending.focusBarId, { focus: true })
}
async function applyThroughServer(pending: Proposal) {
  // Only the parts this operation changed are sent, all in ONE transaction: never the dates without the assignment.
  const changes: PlanChange[] = []
  if (pending.next.tasks !== pending.base.tasks) changes.push({ type: 'tasks', tasks: pending.next.tasks })
  if (pending.next.assignments !== pending.base.assignments) changes.push({ type: 'assignments', assignments: pending.next.assignments })
  if (pending.next.placed !== pending.base.placed) changes.push({ type: 'placed', placed: pending.next.placed })
  notice.value = t({ en: 'Saving: ' + pending.title + '. The chart keeps the accepted plan until the server answers.', ja: '保存中: ' + pending.title + '。サーバーが応答するまで、チャートは受理済みの計画を表示します。' })
  const outcome = await tx.submit(changes, pending.source ? { source: pending.source } : {})
  busy.value = outcome.status === 'busy'
  if (outcome.status === 'busy') { notice.value = t({ en: 'Not applied: ' + describeOutcome(outcome) + '.', ja: '適用しませんでした: ' + describeOutcome(outcome) + '。' }); return }
  if (proposal.value === pending) proposal.value = undefined
  if (outcome.status !== 'accepted') {
    notice.value = t({ en: 'Not applied: ' + pending.title + ' was ' + describeOutcome(outcome) + '.', ja: '適用しませんでした: ' + pending.title + ' は' + describeOutcome(outcome) + '。' })
    return
  }
  notice.value = t({ en: 'Applied: ' + pending.title + ' (version ' + outcome.version + ').', ja: '適用しました: ' + pending.title + '(版 ' + outcome.version + ')。' })
  await nextTick()
  if (pending.focusBarId) void chart.value?.revealBar(pending.focusBarId, { focus: true })
}
async function undoRedoThroughServer(kind: 'undo' | 'redo') {
  proposal.value = undefined
  const outcome = await (kind === 'undo' ? tx.undo() : tx.redo())
  busy.value = outcome.status === 'busy'
  notice.value = outcome.status === 'accepted'
    ? t({
      en: (kind === 'undo' ? 'Undid' : 'Redid') + ' the planning change through the server (version ' + outcome.version + ').',
      ja: 'サーバー経由で計画の変更を' + (kind === 'undo' ? '元に戻しました' : 'やり直しました') + '(版 ' + outcome.version + ')。',
    })
    : t({
      en: (kind === 'undo' ? 'Undo' : 'Redo') + ' not applied: ' + describeOutcome(outcome) + '.',
      ja: (kind === 'undo' ? '元に戻す' : 'やり直し') + 'を適用しませんでした: ' + describeOutcome(outcome) + '。',
    })
}
function discard() {
  proposal.value = undefined
  notice.value = t({ en: 'Preview discarded. Nothing changed.', ja: 'プレビューを破棄しました。何も変わっていません。' })
}
function undo() {
  if (serverBacked.value) return undoRedoThroughServer('undo')
  history.undo(); proposal.value = undefined; notice.value = t({ en: 'Undid the last planning change.', ja: '直前の計画の変更を元に戻しました。' })
}
function redo() {
  if (serverBacked.value) return undoRedoThroughServer('redo')
  history.redo(); proposal.value = undefined; notice.value = t({ en: 'Redid the planning change.', ja: '計画の変更をやり直しました。' })
}

// Vertical move = replace the assignment; horizontal move = change the task's schedule for every projection; both = one proposal.
function onEdit(edit: TimelineEdit) {
  logEdit(edit)
  const resolved = resolveResourceTimelineEdit(projection.value, edit)
  if (!resolved.ok) return reject(resolved.reason)
  const { scheduleChange, assignmentReplacement } = resolved
  let next = model.value
  let focusBarId: string | undefined
  const changes: string[] = []
  if (assignmentReplacement) {
    const result = proposeResourceAssignment({ assignments: next.assignments, resourceIds, taskIds: next.tasks.map(item => item.id) }, { kind: 'replace', ...assignmentReplacement })
    if (!result.ok) return reject(result.reason)
    next = { ...next, assignments: result.assignments }
    const { fromResourceId, toResourceId, taskId } = assignmentReplacement
    changes.push(t({
      en: 'Replace ' + resourceLabel(fromResourceId) + ' with ' + resourceLabel(toResourceId) + ' for ' + taskLabel(taskId),
      ja: taskLabel(taskId) + ' のリソースを ' + resourceLabel(fromResourceId) + ' から ' + resourceLabel(toResourceId) + ' に変更',
    }))
    focusBarId = resourceTimelineBarId(assignmentReplacement.taskId, assignmentReplacement.toResourceId)
  }
  if (scheduleChange) {
    next = { ...next, tasks: next.tasks.map(item => item.id === scheduleChange.taskId
      ? withoutFixed({ ...item, startNoEarlierThan: scheduleChange.after.start, duration: scheduleChange.after.end - scheduleChange.after.start }) : item) }
    const time = formatTime(scheduleChange.after.start) + '–' + formatTime(scheduleChange.after.end)
    changes.push(t({
      en: 'Request ' + taskLabel(scheduleChange.taskId) + ' at ' + time + ' (every row that shows it)',
      ja: taskLabel(scheduleChange.taskId) + ' を ' + time + ' に要求(表示しているすべての行)',
    }))
  }
  if (!changes.length) return
  const taskId = (assignmentReplacement ?? scheduleChange)!.taskId
  propose(taskLabel(taskId) + (assignmentReplacement ? t({ en: ' reassigned', ja: ' の割り当てを変更' }) : t({ en: ' rescheduled', ja: ' の日程を変更' })), changes, next, focusBarId, edit.source)
}
function withoutFixed(item: ScheduleTask): ScheduleTask {
  const { fixedStart: _fixed, ...rest } = item
  return rest
}
function place(request: PlaceRequest, source: InputSource) {
  logProposal(source, t({
    en: 'place ' + taskLabel(request.taskId) + ' on ' + resourceLabel(request.resourceId) + ' at ' + formatTime(request.time),
    ja: taskLabel(request.taskId) + ' を ' + resourceLabel(request.resourceId) + ' の ' + formatTime(request.time) + ' に配置',
  }))
  const base = model.value
  if (base.placed.includes(request.taskId)) return reject(t({ en: taskLabel(request.taskId) + ' is already placed.', ja: taskLabel(request.taskId) + ' はすでに配置されています。' }))
  let assignments = base.assignments
  const changes = [t({
    en: 'Place ' + taskLabel(request.taskId) + ' at ' + formatTime(request.time) + ' on ' + resourceLabel(request.resourceId),
    ja: taskLabel(request.taskId) + ' を ' + resourceLabel(request.resourceId) + ' の ' + formatTime(request.time) + ' に配置',
  })]
  if (!assignments.some(item => item.taskId === request.taskId && item.resourceId === request.resourceId)) {
    const result = proposeResourceAssignment({ assignments, resourceIds, taskIds: base.tasks.map(item => item.id) }, { kind: 'add', taskId: request.taskId, resourceId: request.resourceId })
    if (!result.ok) return reject(result.reason)
    assignments = result.assignments
    changes.push(t({ en: 'Assign ' + taskLabel(request.taskId) + ' to ' + resourceLabel(request.resourceId), ja: taskLabel(request.taskId) + ' を ' + resourceLabel(request.resourceId) + ' に割り当て' }))
  }
  const next: PlanModel = {
    tasks: base.tasks.map(item => item.id === request.taskId ? withoutFixed({ ...item, startNoEarlierThan: request.time }) : item),
    assignments, placed: [...base.placed, request.taskId],
  }
  propose(t({ en: 'placed ' + taskLabel(request.taskId), ja: taskLabel(request.taskId) + ' を配置' }), changes, next, resourceTimelineBarId(request.taskId, request.resourceId), source)
}
function onDrop(drop: TimelineDrop) {
  const taskId = drop.dataTransfer?.getData(BACKLOG_MIME)
  if (!taskId) return reject(t({ en: 'drop a task from the unplanned list.', ja: '未計画の一覧からタスクをドロップしてください。' }))
  if (!drop.rowId) return reject(t({ en: 'drop the task on a resource row.', ja: 'タスクはリソースの行にドロップしてください。' }))
  place({ taskId, resourceId: drop.rowId, time: drop.time }, 'pointer')
}

// ---- selection, inspector, assignments ----
const chart = ref<InstanceType<typeof GanttChart>>()
// Without `multiSelect` the chart reports a click only through `select`; the demo keeps that one selection.
const selection = ref(new Set<string>())
const selectedTaskId = ref<string>()
watch(selection, ids => {
  const origin = [...ids].map(id => projection.value.origins.get(id)).find(Boolean)
  if (origin) selectedTaskId.value = origin.taskId
})
const selectedTask = computed(() => model.value.tasks.find(item => item.id === selectedTaskId.value))
const inspectorFields: InspectorField[] = [
  { label: t({ en: 'Duration', ja: '期間' }), spec: { id: 'duration', kind: 'duration', durationBasis: 'elapsed', unitSize: hour, unitLabel: t({ en: 'h', ja: '時間' }), required: true, min: quantum, get: (item: ScheduleTask) => item.duration } },
  { label: t({ en: 'Leveling priority', ja: '平準化の優先度' }), spec: { id: 'priority', kind: 'number', integer: true, get: (item: ScheduleTask) => item.priority ?? 0 } },
]
function inspect(change: { fieldId: string; after: FieldValue }) {
  const target = selectedTask.value
  if (!target || typeof change.after !== 'number') return
  const patch = change.fieldId === 'duration' ? { duration: change.after } : { priority: change.after }
  const fieldName = t({ en: change.fieldId, ja: change.fieldId === 'duration' ? '期間' : '優先度' })
  propose(t({ en: taskLabel(target.id) + ' ' + change.fieldId + ' edited', ja: taskLabel(target.id) + ' の' + fieldName + 'を編集' }), [taskLabel(target.id) + ': ' + fieldName + ' = ' + change.after], {
    ...model.value, tasks: model.value.tasks.map(item => item.id === target.id ? { ...item, ...patch } : item),
  })
}
const assigned = computed(() => model.value.assignments.filter(item => item.taskId === selectedTaskId.value).map(item => item.resourceId))
const addChoice = ref('press-1')
function changeAssignment(request: { kind: 'add' | 'remove'; resourceId: string }) {
  const target = selectedTask.value
  if (!target) return
  const result = proposeResourceAssignment({ assignments: model.value.assignments, resourceIds, taskIds: model.value.tasks.map(item => item.id) }, { ...request, taskId: target.id })
  if (!result.ok) return reject(result.reason)
  const verb = request.kind === 'add' ? 'Assign ' + taskLabel(target.id) + ' to ' : 'Unassign ' + taskLabel(target.id) + ' from '
  const text = t({
    en: verb + resourceLabel(request.resourceId),
    ja: taskLabel(target.id) + ' を ' + resourceLabel(request.resourceId) + (request.kind === 'add' ? ' に割り当て' : ' から外す'),
  })
  propose(t({ en: text.toLowerCase(), ja: text }), [text], { ...model.value, assignments: result.assignments },
    request.kind === 'add' ? resourceTimelineBarId(target.id, request.resourceId) : undefined)
}

// ---- diagnostics: reveal the bars of a diagnostic ----
const highlighted = ref<ReadonlySet<string>>(new Set())
async function reveal(diagnostic: PlanningDiagnostic) {
  const bars = diagnostic.entities.filter(entity => entity.kind === 'task').flatMap(entity => projection.value.taskBarIds.get(entity.id) ?? [])
  highlighted.value = new Set(bars)
  if (!bars.length) { notice.value = t({ en: 'This diagnostic names no placed task with a bar.', ja: 'この診断には、バーを持つ配置済みのタスクがありません。' }); return }
  const result = await chart.value?.revealBar(bars[0]!)
  const state = result && result.status !== 'revealed' ? ' (' + result.status + ')' : ''
  notice.value = t({ en: 'Highlighted ' + bars.length + ' bar(s) for the diagnostic' + state + '.', ja: '診断に対応するバーを ' + bars.length + ' 本強調表示しました' + state + '。' })
}
const summaryDates = computed(() => current.value.plan.ok ? t({ en: 'Finish ', ja: '完了 ' }) + formatTime(current.value.plan.finish) : '')
</script>

<template>
  <DemoPanel title-id="resource-planning-title" :title="t({ en: 'Resource planning', ja: 'リソース計画' })" :subtitle="t({ en: 'One plan shown by resource · a task with two resources has two bars but one set of dates · UTC', ja: '1つの計画をリソース別に表示 · 2つのリソースを使うタスクはバーが2本でも日程は1つ · UTC' })">
    <template #options>
      <label>{{ t({ en: 'Capacity policy', ja: '能力の方針' }) }}
        <select v-model="policy" @change="proposal = undefined">
          <option value="warn">{{ t({ en: 'Warn about overload (scheduleTasks)', ja: '過負荷を警告(scheduleTasks)' }) }}</option>
          <option value="reject">{{ t({ en: 'Reject added overload (scheduleTasks)', ja: '過負荷の増加を却下(scheduleTasks)' }) }}</option>
          <option value="level">{{ t({ en: 'Level resources (levelResources)', ja: 'リソースを平準化(levelResources)' }) }}</option>
        </select>
      </label>
      <button type="button" :disabled="!canUndo" @click="undo">{{ t({ en: 'Undo planning change', ja: '計画の変更を元に戻す' }) }}</button>
      <button type="button" :disabled="!canRedo" @click="redo">{{ t({ en: 'Redo planning change', ja: '計画の変更をやり直す' }) }}</button>
      <label><input v-model="serverBacked" type="checkbox" :disabled="saving"> {{ t({ en: 'Save through the mock server', ja: 'モックサーバー経由で保存' }) }}</label>
    </template>
    <div v-if="serverBacked" class="rp-server">
      <fieldset class="server">
        <legend>{{ t({ en: 'Mock server response', ja: 'モックサーバーの応答' }) }}</legend>
        <label v-for="mode in (t({ en: [['accept', 'Accept'], ['reject', 'Reject'], ['conflict', 'Version conflict'], ['uncertain', 'Result unknown']], ja: [['accept', '受理'], ['reject', '拒否'], ['conflict', '版の競合'], ['uncertain', '結果不明']] }) as [ServerMode, string][])" :key="mode[0]">
          <input v-model="server.info.mode" type="radio" name="plan-server-mode" :value="mode[0]"> {{ mode[1] }}
        </label>
        <p class="hint">{{ t({ en: `Server version ${server.info.version} · ${server.info.commits} commits`, ja: `サーバーの版 ${server.info.version} · コミット ${server.info.commits} 件` }) }}</p>
      </fieldset>
      <SaveStatus :status="tx.status.value" :pending="tx.pendingTransaction.value" :result="tx.result.value" :busy="busy" :version="tx.acceptedVersion.value"
        @dismiss="tx.clearResult(); busy = false" @reload="reloadLatest" @reconcile="checkWithServer" />
    </div>
    <div class="rp-layout">
      <div class="rp-main">
        <GanttChart ref="chart" :rows="projection.rows" :bars="projection.bars" :dependencies="projection.dependencies" :lane-count="projection.laneCount" :range="range"
          :format-time="formatTime" :height="360" :pixels-per-unit="60 / hour" row-draggable droppable v-model:selected-ids="selection" :highlighted-bar-ids="highlighted"
          :load-rows="loadRows" :load-segments="current.load" :labels="{ ...labels.gantt, region: t({ en: 'Resource plan', ja: 'リソースの計画' }), rows: t({ en: 'Resource', ja: 'リソース' }) }" @edit="onEdit" @bar-drop="onDrop" @select="id => selection = new Set([id])"
          @edit-rejected="(_edit, reason) => notice = reason">
          <template #row-heading>{{ t({ en: 'Resource', ja: 'リソース' }) }}</template>
          <template #legend><span class="hint">{{ t({ en: 'Left and Right move a task in time; Up and Down move it to another resource row. Both changes are previewed before they apply.', ja: '左右キーでタスクの時間を、上下キーで別のリソースの行へ動かします。どちらの変更も適用前にプレビューします。' }) }}</span></template>
        </GanttChart>
        <div class="summary" role="status" :aria-label="t({ en: 'Plan summary', ja: '計画の概要' })">
          <strong>{{ t({ en: `Calculated with ${current.name}.`, ja: `${current.name} で計算。` }) }}</strong> {{ summaryDates }}{{ t({ en: '. ', ja: '。' }) }}{{ capacitySummary(current) }}
          <span v-if="current.name === 'levelResources'">{{ t({ en: ` levelResources ignores a task's ALAP mode.`, ja: ' levelResources はタスクの ALAP 指定を無視します。' }) }}</span>
        </div>
        <section v-if="proposal" class="preview" aria-labelledby="preview-title">
          <h3 id="preview-title">{{ t({ en: 'Preview: ', ja: 'プレビュー: ' }) }}{{ proposal.title }}</h3>
          <p v-if="!isJapanese">Calculated with {{ proposal.calc.name }}{{ proposal.calc.name === 'scheduleTasks' ? ' (dates only; capacity is not enforced)' : ' (dates leveled for capacity)' }}.</p>
          <p v-else>{{ proposal.calc.name }} で計算{{ proposal.calc.name === 'scheduleTasks' ? '(日程のみ。能力は守らせません)' : '(能力に合わせて日程を平準化)' }}。</p>
          <ul :aria-label="t({ en: 'Proposed changes', ja: '提案された変更' })"><li v-for="change in proposal.changes" :key="change">{{ change }}</li></ul>
          <ul v-if="describeDates(proposal.calc).length" :aria-label="t({ en: 'Resulting dates', ja: '変更後の日程' })"><li v-for="line in describeDates(proposal.calc)" :key="line">{{ line }}</li></ul>
          <p>{{ capacitySummary(proposal.calc) }}</p>
          <p v-if="saving && tx.pendingTransaction.value">{{ t({ en: 'Saving to the server. The chart and the load still show the accepted plan.', ja: 'サーバーに保存中です。チャートと負荷は受理済みの計画のままです。' }) }}</p>
          <div class="options"><button type="button" :disabled="saving" @click="apply">{{ t({ en: 'Apply change', ja: '変更を適用' }) }}</button><button type="button" :disabled="saving" @click="discard">{{ t({ en: 'Discard preview', ja: 'プレビューを破棄' }) }}</button></div>
        </section>
        <StatusLine :label="t({ en: 'Planning notice', ja: '計画の通知' })">{{ notice }}</StatusLine>
        <details class="proposal-log">
          <summary>{{ t({ en: 'Received proposals', ja: '受け取った提案' }) }}</summary>
          <ol :aria-label="t({ en: 'Received proposals', ja: '受け取った提案' })"><li v-for="(entry, index) in proposalLog" :key="index">{{ entry }}</li></ol>
          <p v-if="!proposalLog.length" class="hint">{{ t({ en: 'No proposal yet.', ja: 'まだ提案はありません。' }) }}</p>
        </details>
        <PlanningDiagnostics :diagnostics="current.diagnostics" :trace="current.trace" :task-label="taskLabel" :resource-label="resourceLabel" :format-time="formatTime" @activate="reveal" />
      </div>
      <aside class="rp-side">
        <PlanningBacklog :items="backlogItems" :rows="resourceRows" :times="startTimes" @place="request => place(request, 'keyboard')" />
        <PlanningInspector :title="selectedTask ? t({ en: 'Task ' + taskLabel(selectedTask.id), ja: 'タスク ' + taskLabel(selectedTask.id) }) : t({ en: 'Task inspector', ja: 'タスクのインスペクター' })" :item="selectedTask" :fields="inspectorFields" @edit="inspect" />
        <fieldset v-if="selectedTask" class="assign">
          <legend>{{ t({ en: `Assignments of ${taskLabel(selectedTask.id)}`, ja: `${taskLabel(selectedTask.id)} の割り当て` }) }}</legend>
          <p v-if="!assigned.length" class="hint">{{ t({ en: 'No resource: the task has no bar in the resource rows.', ja: 'リソースなし: このタスクにはリソースの行のバーがありません。' }) }}</p>
          <button v-for="id in assigned" :key="id" type="button" @click="changeAssignment({ kind: 'remove', resourceId: id })">{{ t({ en: `Unassign ${resourceLabel(id)}`, ja: `${resourceLabel(id)} から外す` }) }}</button>
          <label>{{ t({ en: 'Resource to add', ja: '追加するリソース' }) }} <select v-model="addChoice"><option v-for="resource in resources" :key="resource.id" :value="resource.id">{{ resource.label }}</option></select></label>
          <button type="button" @click="changeAssignment({ kind: 'add', resourceId: addChoice })">{{ t({ en: 'Assign to resource', ja: 'リソースに割り当て' }) }}</button>
        </fieldset>
      </aside>
    </div>
  </DemoPanel>
</template>

<style scoped>
.rp-layout { display: grid; grid-template-columns: minmax(0, 1fr) 280px; gap: 14px; align-items: start; }
.rp-main, .rp-side { display: grid; gap: 10px; min-width: 0; }
.summary { font-size: 12px; border: 1px solid var(--vw-border, #d9e4ec); border-radius: 6px; padding: 7px 10px; }
.preview { border: 2px solid var(--vw-accent, #245e96); border-radius: 8px; padding: 10px; font-size: 12px; margin: 0; }
.preview h3 { margin: 0 0 4px; font-size: 14px; }
.preview ul { margin: 4px 0; padding-inline-start: 18px; }
.preview .options { gap: 8px; }
.assign { border: 1px solid var(--vw-border, #d9e4ec); border-radius: 8px; font-size: 12px; display: grid; gap: 6px; margin: 0; }
.rp-server { display: grid; grid-template-columns: minmax(200px, 280px) 1fr; gap: 10px; align-items: start; margin-bottom: 10px; }
.server { border: 1px solid var(--vw-border, #d9e4ec); border-radius: 8px; font-size: 12px; margin: 0; display: grid; gap: 4px; }
.server .hint { margin: 4px 0 0; }
.proposal-log { font-size: 12px; }
.proposal-log ol { margin: 4px 0; padding-inline-start: 22px; }
.assign label { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; }
@media (max-width: 900px) { .rp-layout, .rp-server { grid-template-columns: 1fr; } }
</style>
