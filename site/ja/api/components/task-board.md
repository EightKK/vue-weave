---
title: TaskBoard
description: カンバンコンポーネント TaskBoard のプロップ、イベント、スロット、補助関数。
---

# TaskBoard {#top}

`TaskBoard` はカンバンボードです。カードをステータスの列に並べ、必要なら横方向のスイムレーンに分けます。カード数、WIP の上限と下限、折りたためる列とレーン、`filter` を備えています。同じタスクを GanttChart と並べて表示したり、単独で仕掛り中の作業を管理したりするのに使います。

オプトインの制御コンポーネントです。ポインター、タッチ、キーボードでの移動は `card-move` の提案になり、`validateCardMove` で拒否でき、`applyBoardCardMove` で適用します。ボードが自分でカードを並べ替えることはありません。

## 最小の例

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { TaskBoard, applyBoardCardMove, type TaskBoardCard, type TaskBoardCardMove, type TaskBoardColumn } from '@eightkk/vue-weave'
import '@eightkk/vue-weave/style.css'

const columns: TaskBoardColumn[] = [
  { id: 'todo', label: '未着手' },
  { id: 'doing', label: '作業中', wipLimit: 2 },
  { id: 'done', label: '完了' },
]
const cards = ref<TaskBoardCard[]>([
  { id: 'spec', columnId: 'doing', label: '仕様を書く' },
  { id: 'api', columnId: 'todo', label: '請求 API' },
])

function move(change: TaskBoardCardMove) {
  cards.value = applyBoardCardMove(cards.value, change, { columns })
}
</script>

<template>
  <TaskBoard :columns="columns" :cards="cards" @card-move="move" />
</template>
```

**例:** ボードのデモは[例の一覧](/ja/examples/)にあります。**型:** [`TaskBoardCard`](/api/reference/core/interfaces/TaskBoardCard.md)、[`TaskBoardColumn`](/api/reference/core/interfaces/TaskBoardColumn.md)、[`TaskBoardCardMove`](/api/reference/core/interfaces/TaskBoardCardMove.md)、[`TaskBoardExposed`](/api/reference/vue-weave/type-aliases/TaskBoardExposed.md)。

::: info 英語の詳細
ここから下の詳細なリファレンスは英語です。
:::

<!--@include: ../../../../docs/api.md#task-board-->
