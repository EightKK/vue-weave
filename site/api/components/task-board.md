---
title: TaskBoard
description: Props, events, slots and helpers of the TaskBoard kanban component.
---

# TaskBoard {#top}

`TaskBoard` is a kanban board: cards in status columns, optionally split into horizontal swimlanes, with card counts, WIP limits and minimums, collapsible columns and lanes, and a `filter`. Use it next to a GanttChart for the same tasks, or on its own for work in progress.

It is an opt-in, controlled component. A pointer, touch or keyboard move becomes a `card-move` proposal that `validateCardMove` can reject and `applyBoardCardMove` applies; the board never reorders its cards itself.

## Minimal example

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { TaskBoard, applyBoardCardMove, type TaskBoardCard, type TaskBoardCardMove, type TaskBoardColumn } from '@eightkk/vue-weave'
import '@eightkk/vue-weave/style.css'

const columns: TaskBoardColumn[] = [
  { id: 'todo', label: 'To do' },
  { id: 'doing', label: 'Doing', wipLimit: 2 },
  { id: 'done', label: 'Done' },
]
const cards = ref<TaskBoardCard[]>([
  { id: 'spec', columnId: 'doing', label: 'Write the spec' },
  { id: 'api', columnId: 'todo', label: 'Billing API' },
])

function move(change: TaskBoardCardMove) {
  cards.value = applyBoardCardMove(cards.value, change, { columns })
}
</script>

<template>
  <TaskBoard :columns="columns" :cards="cards" @card-move="move" />
</template>
```

**Examples:** the [example index](/examples/) lists the board demos. **Types:** [`TaskBoardCard`](../reference/core/interfaces/TaskBoardCard.md), [`TaskBoardColumn`](../reference/core/interfaces/TaskBoardColumn.md), [`TaskBoardCardMove`](../reference/core/interfaces/TaskBoardCardMove.md), [`TaskBoardExposed`](../reference/vue-weave/type-aliases/TaskBoardExposed.md).

<!--@include: ../../../docs/api.md#task-board-->
