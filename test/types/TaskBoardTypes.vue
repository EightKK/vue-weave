<script setup lang="ts">
// Type-level tests of TaskBoard, run by `npm run typecheck` (vue-tsc). Nothing here is rendered or executed. The card
// type is inferred from `cards` and reaches the slots; each `@vue-expect-error` or `@ts-expect-error` fails the check
// when the line it guards compiles.
import { h, ref, useTemplateRef } from 'vue'
import {
  TaskBoard, applyBoardCardMove, boardCardPosition, groupBoardCards,
  type TaskBoardCard, type TaskBoardCardMove, type TaskBoardColumn, type TaskBoardExposed, type TaskBoardLane, type TaskBoardMoveCancel,
  type TaskBoardPosition, type TaskBoardBackgroundClick,
} from '../../src'
import { groupBoardCards as coreGroup, type TaskBoardGroups } from '../../src/core'

interface Effort { points: number }
type Story = TaskBoardCard<Effort> & { epic: string }

const columns: TaskBoardColumn[] = [{ id: 'todo', label: 'To do', wipLimit: 3 }]
const lanes: TaskBoardLane[] = [{ id: 'web', label: 'Web' }]
const cards = ref<Story[]>([{ id: 'a', columnId: 'todo', laneId: 'web', label: 'A', epic: 'E1', data: { points: 3 } }])
const literalCards = [{ id: 'b', columnId: 'todo', label: 'B' }]
const selectedId = ref<string>()

const groups: TaskBoardGroups<Story> = groupBoardCards(cards.value, columns, lanes)
const firstCell: Story[] = groups.rows[0]!.cells[0]!.cards
const sameFunction: typeof groupBoardCards = coreGroup
const moved: Story[] = applyBoardCardMove(cards.value, {
  id: 'a', before: { columnId: 'todo', laneId: 'web', index: 0 }, after: { columnId: 'todo', laneId: 'web', index: 0 }, source: 'keyboard',
}, { columns, lanes })
const position: TaskBoardPosition = boardCardPosition(cards.value, 'a', { lanes: true })
// @ts-expect-error A move needs a source.
const incomplete: TaskBoardCardMove = { id: 'a', before: position, after: position }
// @ts-expect-error A WIP limit is a number.
const badColumn: TaskBoardColumn = { id: 'x', label: 'X', wipLimit: '3' }

function points(value: Effort | undefined) { return value?.points ?? 0 }
function epic(value: string) { return value }
function move(change: TaskBoardCardMove) { cards.value = applyBoardCardMove(cards.value, change) }
function rejected(change: TaskBoardCardMove, reason: string) { return change.id + reason }
function cancelled(event: TaskBoardMoveCancel) { return event.reason === 'data-change' }
function background(event: TaskBoardBackgroundClick): string | undefined { selectedId.value = undefined; return event.columnId ?? event.laneId }
function validate(change: TaskBoardCardMove) { return change.after.columnId !== 'done' || 'Not yet' }

const board = useTemplateRef<TaskBoardExposed<Story>>('board')
const instance = ref<InstanceType<typeof TaskBoard>>()
void [firstCell, sameFunction, moved, incomplete, badColumn, board.value?.focusCard('a'), instance.value?.cancelMove(), h(TaskBoard, { columns, cards: cards.value })]
</script>

<template>
  <TaskBoard ref="board" v-model:selected-id="selectedId" :columns="columns" :lanes="lanes" :cards="cards" :validate-card-move="validate"
    dir="rtl" :labels="{ region: 'Board' }" @card-move="move" @card-move-rejected="rejected" @card-move-cancel="cancelled"
    @background-click="background"
    @card-activate="id => epic(id)">
    <template #card="{ card, selected, column, lane }">
      {{ points(card.data) }} {{ epic(card.epic) }} {{ selected }} {{ column.wipLimit }} {{ lane?.label }}
      <!-- @vue-expect-error The card data is not `any`. -->
      {{ card.data?.missing }}
    </template>
    <template #column-header="{ column, status }">{{ column.label }} {{ status.overLimit }} {{ status.count }}</template>
    <template #empty="{ column }">{{ column?.label }}</template>
  </TaskBoard>
  <TaskBoard :columns="columns" :cards="literalCards">
    <template #card="{ card }">{{ card.detail }} {{ card.tone }}</template>
  </TaskBoard>
</template>
