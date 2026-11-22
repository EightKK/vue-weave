---
title: TreeGrid
description: TreeGrid コンポーネントのプロップ、イベント、スロット、補助関数。
---

# TreeGrid {#top}

`TreeGrid` は行のツリーを列と並べて表示します。製品階層と属性・倉庫、部品表と工場、WBS と期間などに使います。行と列を同時に仮想化するので、数千行・数十列でも軽く動き、ARIA の treegrid のキー操作ですべてのセルに届きます。セルは列の `value(row)` か疎な `cells` リストから読み、値がない、不明、まだ読み込んでいない、といった状態も区別して表せます。

オプトインの制御コンポーネントです。展開、アクティブセル、セルの編集、スプレッドシートの一括操作、行構造の変更はイベント(`update:expandedIds`、`cell-edit`、`sheet-edit`、`row-create` など)として届き、アプリケーション側が `applyTreeGridEdits` などで適用します。子行は `expand-request` で必要になったときに読み込めます。

## 最小の例

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { TreeGrid, type TreeGridColumn, type TreeGridRow } from '@eightkk/vue-weave'
import '@eightkk/vue-weave/style.css'

type Part = TreeGridRow<{ quantity: number }>
const rows: Part[] = [
  { id: 'bike', label: '自転車', data: { quantity: 1 } },
  { id: 'frame', parentId: 'bike', label: 'フレーム', data: { quantity: 1 } },
  { id: 'wheel', parentId: 'bike', label: '車輪', data: { quantity: 2 } },
]
const columns: TreeGridColumn<Part>[] = [
  { id: 'quantity', label: '数量', width: 120, value: row => row.data?.quantity },
]
const expanded = ref(['bike'])
</script>

<template>
  <TreeGrid v-model:expanded-ids="expanded" :rows="rows" :columns="columns" :height="240" />
</template>
```

**例:** [ツリーグリッド](/ja/examples/tree-grid/)、[部品表](/ja/showcase/bom/)。**ガイド:** [ツリーグリッド、マトリクス、部品表](../guides/data.md#tree-grids-matrices-and-bills-of-materials)。**型:** [`TreeGridRow`](/api/reference/core/interfaces/TreeGridRow.md)、[`TreeGridColumn`](/api/reference/core/interfaces/TreeGridColumn.md)、[`TreeGridExposed`](/api/reference/vue-weave/type-aliases/TreeGridExposed.md)。

::: info 英語の詳細
ここから下の詳細なリファレンスは英語です。
:::

<!--@include: ../../../../docs/api.md#tree-grid-->
