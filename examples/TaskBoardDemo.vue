<script setup lang="ts">
// Opt-in example of TaskBoard next to GanttChart on the same task data. Both views are controlled: the board proposes
// card moves and the chart proposes bar and progress edits, and this parent applies them to one `cards` array. The
// selection is one shared ref. "Doing" and "Review" have WIP limits that only warn; the one hard rule is in
// `validateCardMove`: a task reaches Done only at 100% progress (raise it with the Gantt progress slider).
import { computed, ref } from 'vue'
import {
  GanttChart, TaskBoard, applyBoardCardMove,
  type ChartTone, type TaskBoardCard, type TaskBoardCardMove, type TaskBoardColumn, type TaskBoardLane, type TaskBoardMoveCancel,
  type TimelineBar, type TimelineEdit, type TimelineProgressEdit,
} from '../src'
import DemoPanel from './components/DemoPanel.vue'
import StatusLine from './components/StatusLine.vue'
import { formatTime, hour, origin, range } from './data'
import { useDemoLocale } from './i18n'

const { t, labels } = useDemoLocale()

type Work = { start: number; end: number; progress: number }
type Task = TaskBoardCard<Work>

const columns: TaskBoardColumn[] = [
  { id: 'todo', label: t({ en: 'To do', ja: '未着手' }) },
  { id: 'doing', label: t({ en: 'Doing', ja: '作業中' }), wipLimit: 3 },
  { id: 'review', label: t({ en: 'Review', ja: 'レビュー' }), wipMin: 2, wipLimit: 2 },
  { id: 'done', label: t({ en: 'Done', ja: '完了' }) },
]
const lanes: TaskBoardLane[] = [
  { id: 'web', label: t({ en: 'Web team', ja: 'Web チーム' }), detail: t({ en: 'Front end', ja: 'フロントエンド' }) },
  { id: 'api', label: t({ en: 'API team', ja: 'API チーム' }), detail: t({ en: 'Services', ja: 'サービス' }) },
]
const teamTone: Record<string, ChartTone> = { web: 'blue', api: 'violet' }
const statusTone: Record<string, ChartTone> = { todo: 'violet', doing: 'blue', review: 'amber', done: 'teal' }
const task = (id: string, label: string, columnId: string, laneId: string, start: number, hours: number, progress: number): Task => ({
  id, label, columnId, laneId, tone: teamTone[laneId], data: { start: origin + start * hour, end: origin + (start + hours) * hour, progress },
})
const initialCards: Task[] = [
  task('wireframes', t({ en: 'Wireframes', ja: 'ワイヤーフレーム' }), 'done', 'web', 0, 2, 1),
  task('login', t({ en: 'Login form', ja: 'ログインフォーム' }), 'doing', 'web', 2, 3, 0.6),
  task('dashboard', t({ en: 'Dashboard', ja: 'ダッシュボード' }), 'todo', 'web', 4, 3, 0),
  task('styles', t({ en: 'Style guide', ja: 'スタイルガイド' }), 'review', 'web', 1, 2, 1),
  task('schema', t({ en: 'Data schema', ja: 'データスキーマ' }), 'done', 'api', 0, 2, 1),
  task('auth', t({ en: 'Auth API', ja: '認証 API' }), 'doing', 'api', 2, 2, 0.8),
  task('reports', t({ en: 'Reports API', ja: 'レポート API' }), 'doing', 'api', 3, 3, 0.3),
  task('billing', t({ en: 'Billing API', ja: '請求 API' }), 'todo', 'api', 5, 3, 0),
]
// The Gantt rows keep this order; only the board order changes with moves.
const rowOrder = initialCards.map(card => card.id)

const cards = ref<Task[]>(initialCards)
const selectedId = ref<string>()
const useLanes = ref(true)
// Collapsed columns and lanes and the card filter are controlled here too; the board only proposes new collapsed IDs.
const collapsedColumnIds = ref<string[]>([])
const collapsedLaneIds = ref<string[]>([])
const query = ref('')
const filter = computed(() => {
  const text = query.value.trim().toLowerCase()
  return text ? (card: Task) => card.label.toLowerCase().includes(text) : undefined
})
const status = ref(t({ en: 'Drag a card, or focus it and press Space, to move it. Raise progress in the chart to finish a task.', ja: 'カードをドラッグするか、フォーカスして Space を押すと移動できます。タスクを完了にするには、チャートで進捗を上げてください。' }))
const sourceText = (source: string) => t({ en: source, ja: source === 'keyboard' ? 'キーボード' : source === 'pointer' ? 'ポインター' : source })

const byId = computed(() => new Map(cards.value.map(card => [card.id, card])))
const percent = (card: Task) => `${Math.round(card.data!.progress * 100)}%`
const boardCards = computed(() => cards.value.map(card => ({ ...card, detail: `${percent(card)} · ${formatTime(card.data!.start)}–${formatTime(card.data!.end)}` })))
const columnLabel = (id: string) => columns.find(column => column.id === id)?.label ?? id
const rows = rowOrder.map(id => ({ id, label: initialCards.find(card => card.id === id)!.label }))
const bars = computed<TimelineBar[]>(() => rowOrder.map(id => {
  const card = byId.value.get(id)!
  return {
    id, rowId: id, label: card.label, start: card.data!.start, end: card.data!.end, progress: card.data!.progress,
    editable: true, tone: statusTone[card.columnId], appearance: card.columnId === 'done' ? 'outline' : 'solid',
  }
}))
const selectedIds = computed(() => new Set(selectedId.value ? [selectedId.value] : []))
const selectionText = computed(() => {
  const card = selectedId.value ? byId.value.get(selectedId.value) : undefined
  return card
    ? t({ en: `Selected: ${card.label} (${columnLabel(card.columnId)}, ${percent(card)})`, ja: `選択中: ${card.label}(${columnLabel(card.columnId)}、${percent(card)})` })
    : t({ en: 'Nothing selected.', ja: '何も選択されていません。' })
})

function validateCardMove(change: TaskBoardCardMove) {
  const card = byId.value.get(change.id)
  if (change.after.columnId === 'done' && card && card.data!.progress < 1) {
    return t({ en: `${card.label} cannot move to Done: progress is ${percent(card)}, not 100%.`, ja: `${card.label} は進捗が 100% ではなく ${percent(card)} のため、完了に移動できません。` })
  }
  return true
}
function moveCard(change: TaskBoardCardMove) {
  cards.value = applyBoardCardMove(cards.value, change, { columns, lanes: useLanes.value ? lanes : undefined })
  const card = byId.value.get(change.id)!
  const over = change.before.columnId !== change.after.columnId
    && columns.find(column => column.id === change.after.columnId)?.wipLimit !== undefined
    && cards.value.filter(item => item.columnId === change.after.columnId).length > columns.find(column => column.id === change.after.columnId)!.wipLimit!
  status.value = t({
    en: `Moved ${card.label} to ${columnLabel(change.after.columnId)}${over ? ' (over the WIP limit)' : ''} by ${change.source}.`,
    ja: `${sourceText(change.source)}で ${card.label} を${columnLabel(change.after.columnId)}に移動しました${over ? '(WIP 上限超過)' : ''}。`,
  })
}
function rejectMove(change: TaskBoardCardMove, reason: string) {
  status.value = t({ en: `Rejected: ${reason}`, ja: `却下: ${reason}` })
}
function cancelMove(event: TaskBoardMoveCancel) {
  const label = byId.value.get(event.id)?.label ?? event.id
  status.value = t({ en: `Move of ${label} cancelled (${event.reason}).`, ja: `${label} の移動を取り消しました(${event.reason})。` })
}
function updateWork(id: string, change: Partial<Work>) {
  cards.value = cards.value.map(card => card.id === id ? { ...card, data: { ...card.data!, ...change } } : card)
}
function editProgress(change: TimelineProgressEdit) {
  updateWork(change.id, { progress: change.after })
  const label = byId.value.get(change.id)!.label, value = Math.round(change.after * 100)
  status.value = t({ en: `${label} is at ${value}%.`, ja: `${label} の進捗は ${value}% です。` })
}
function editBar(change: TimelineEdit) {
  updateWork(change.id, { start: change.after.start, end: change.after.end })
  const label = byId.value.get(change.id)!.label, time = `${formatTime(change.after.start)}–${formatTime(change.after.end)}`
  status.value = t({ en: `${label} rescheduled to ${time}.`, ja: `${label} を ${time} に変更しました。` })
}
function reset() {
  cards.value = initialCards
  selectedId.value = undefined
  collapsedColumnIds.value = []
  collapsedLaneIds.value = []
  query.value = ''
  status.value = t({ en: 'Board reset.', ja: 'ボードを初期状態に戻しました。' })
}
</script>

<template>
  <DemoPanel title-id="task-board-title" :title="t({ en: 'Task board', ja: 'タスクボード' })" :subtitle="t({ en: 'A kanban board and a Gantt chart on the same tasks, with one shared selection, collapsible columns and lanes, a card filter and WIP limits and minimums.', ja: '同じタスクのカンバンボードとガントチャートです。選択の共有、列とレーンの折りたたみ、カードの絞り込み、WIP の上限と下限を備えています。' })">
    <template #options>
      <label><input v-model="useLanes" type="checkbox"> {{ t({ en: 'Team lanes', ja: 'チームのレーン' }) }}</label>
      <label>{{ t({ en: 'Filter cards', ja: 'カードを絞り込む' }) }} <input v-model="query" type="search" :placeholder="t({ en: 'Label contains', ja: '名前に含む文字' })"></label>
      <button type="button" @click="reset">{{ t({ en: 'Reset board', ja: 'ボードをリセット' }) }}</button>
    </template>
    <TaskBoard v-model:selected-id="selectedId" v-model:collapsed-column-ids="collapsedColumnIds"
      v-model:collapsed-lane-ids="collapsedLaneIds" collapsible :filter="filter" :columns="columns" :lanes="useLanes ? lanes : undefined" :cards="boardCards"
      :validate-card-move="validateCardMove" :labels="{ ...labels.taskBoard, region: t({ en: 'Sprint board', ja: 'スプリントのボード' }) }"
      @card-move="moveCard" @card-move-rejected="rejectMove" @card-move-cancel="cancelMove" />
    <StatusLine :label="t({ en: 'Task board status', ja: 'タスクボードの状態' })">{{ status }}</StatusLine>
    <StatusLine :label="t({ en: 'Board selection', ja: 'ボードの選択' })">{{ selectionText }}</StatusLine>
    <GanttChart :rows="rows" :bars="bars" :range="range" :format-time="formatTime" :selected-ids="selectedIds" :height="300"
      progress-editable :labels="{ ...labels.gantt, region: t({ en: 'Sprint timeline', ja: 'スプリントのタイムライン' }), rows: t({ en: 'Tasks', ja: 'タスク' }) }"
      @select="id => selectedId = id" @progress-edit="editProgress" @edit="editBar" />
  </DemoPanel>
</template>
