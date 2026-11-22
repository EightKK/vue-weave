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

type Work = { start: number; end: number; progress: number }
type Task = TaskBoardCard<Work>

const columns: TaskBoardColumn[] = [
  { id: 'todo', label: 'To do' },
  { id: 'doing', label: 'Doing', wipLimit: 3 },
  { id: 'review', label: 'Review', wipMin: 2, wipLimit: 2 },
  { id: 'done', label: 'Done' },
]
const lanes: TaskBoardLane[] = [{ id: 'web', label: 'Web team', detail: 'Front end' }, { id: 'api', label: 'API team', detail: 'Services' }]
const teamTone: Record<string, ChartTone> = { web: 'blue', api: 'violet' }
const statusTone: Record<string, ChartTone> = { todo: 'violet', doing: 'blue', review: 'amber', done: 'teal' }
const task = (id: string, label: string, columnId: string, laneId: string, start: number, hours: number, progress: number): Task => ({
  id, label, columnId, laneId, tone: teamTone[laneId], data: { start: origin + start * hour, end: origin + (start + hours) * hour, progress },
})
const initialCards: Task[] = [
  task('wireframes', 'Wireframes', 'done', 'web', 0, 2, 1),
  task('login', 'Login form', 'doing', 'web', 2, 3, 0.6),
  task('dashboard', 'Dashboard', 'todo', 'web', 4, 3, 0),
  task('styles', 'Style guide', 'review', 'web', 1, 2, 1),
  task('schema', 'Data schema', 'done', 'api', 0, 2, 1),
  task('auth', 'Auth API', 'doing', 'api', 2, 2, 0.8),
  task('reports', 'Reports API', 'doing', 'api', 3, 3, 0.3),
  task('billing', 'Billing API', 'todo', 'api', 5, 3, 0),
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
const status = ref('Drag a card, or focus it and press Space, to move it. Raise progress in the chart to finish a task.')

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
  return card ? `Selected: ${card.label} (${columnLabel(card.columnId)}, ${percent(card)})` : 'Nothing selected.'
})

function validateCardMove(change: TaskBoardCardMove) {
  const card = byId.value.get(change.id)
  if (change.after.columnId === 'done' && card && card.data!.progress < 1) {
    return `${card.label} cannot move to Done: progress is ${percent(card)}, not 100%.`
  }
  return true
}
function moveCard(change: TaskBoardCardMove) {
  cards.value = applyBoardCardMove(cards.value, change, { columns, lanes: useLanes.value ? lanes : undefined })
  const card = byId.value.get(change.id)!
  const over = change.before.columnId !== change.after.columnId
    && columns.find(column => column.id === change.after.columnId)?.wipLimit !== undefined
    && cards.value.filter(item => item.columnId === change.after.columnId).length > columns.find(column => column.id === change.after.columnId)!.wipLimit!
  status.value = `Moved ${card.label} to ${columnLabel(change.after.columnId)}${over ? ' (over the WIP limit)' : ''} by ${change.source}.`
}
function rejectMove(change: TaskBoardCardMove, reason: string) {
  status.value = `Rejected: ${reason}`
}
function cancelMove(event: TaskBoardMoveCancel) {
  status.value = `Move of ${byId.value.get(event.id)?.label ?? event.id} cancelled (${event.reason}).`
}
function updateWork(id: string, change: Partial<Work>) {
  cards.value = cards.value.map(card => card.id === id ? { ...card, data: { ...card.data!, ...change } } : card)
}
function editProgress(change: TimelineProgressEdit) {
  updateWork(change.id, { progress: change.after })
  status.value = `${byId.value.get(change.id)!.label} is at ${Math.round(change.after * 100)}%.`
}
function editBar(change: TimelineEdit) {
  updateWork(change.id, { start: change.after.start, end: change.after.end })
  status.value = `${byId.value.get(change.id)!.label} rescheduled to ${formatTime(change.after.start)}–${formatTime(change.after.end)}.`
}
function reset() {
  cards.value = initialCards
  selectedId.value = undefined
  collapsedColumnIds.value = []
  collapsedLaneIds.value = []
  query.value = ''
  status.value = 'Board reset.'
}
</script>

<template>
  <DemoPanel title-id="task-board-title" title="Task board" subtitle="A kanban board and a Gantt chart on the same tasks, with one shared selection, collapsible columns and lanes, a card filter and WIP limits and minimums.">
    <template #options>
      <label><input v-model="useLanes" type="checkbox"> Team lanes</label>
      <label>Filter cards <input v-model="query" type="search" placeholder="Label contains"></label>
      <button type="button" @click="reset">Reset board</button>
    </template>
    <TaskBoard v-model:selected-id="selectedId" v-model:collapsed-column-ids="collapsedColumnIds"
      v-model:collapsed-lane-ids="collapsedLaneIds" collapsible :filter="filter" :columns="columns" :lanes="useLanes ? lanes : undefined" :cards="boardCards"
      :validate-card-move="validateCardMove" :labels="{ region: 'Sprint board' }"
      @card-move="moveCard" @card-move-rejected="rejectMove" @card-move-cancel="cancelMove" />
    <StatusLine label="Task board status">{{ status }}</StatusLine>
    <StatusLine label="Board selection">{{ selectionText }}</StatusLine>
    <GanttChart :rows="rows" :bars="bars" :range="range" :format-time="formatTime" :selected-ids="selectedIds" :height="300"
      progress-editable :labels="{ region: 'Sprint timeline', rows: 'Tasks' }"
      @select="id => selectedId = id" @progress-edit="editProgress" @edit="editBar" />
  </DemoPanel>
</template>
