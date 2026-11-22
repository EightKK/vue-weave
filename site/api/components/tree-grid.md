---
title: TreeGrid
description: Props, events, slots and helpers of the TreeGrid component.
---

# TreeGrid {#top}

`TreeGrid` shows a tree of rows against columns: a product hierarchy against attributes and warehouses, a bill of materials against plants, or a WBS against periods. Rows and columns are virtualized together, so thousands of rows and dozens of columns stay fast, and the ARIA treegrid keys reach every cell. Cells come from a column's `value(row)` or from a sparse `cells` list, and a cell can state that it has no value, an unknown value, or one that is not loaded yet.

It is an opt-in, controlled component. Expansion, the active cell, cell edits, spreadsheet batches and row structure changes are events (`update:expandedIds`, `cell-edit`, `sheet-edit`, `row-create`, …) that your code applies, for example with `applyTreeGridEdits`. Children can be loaded on demand through `expand-request`.

## Minimal example

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { TreeGrid, type TreeGridColumn, type TreeGridRow } from '@eightkk/vue-weave'
import '@eightkk/vue-weave/style.css'

type Part = TreeGridRow<{ quantity: number }>
const rows: Part[] = [
  { id: 'bike', label: 'Bicycle', data: { quantity: 1 } },
  { id: 'frame', parentId: 'bike', label: 'Frame', data: { quantity: 1 } },
  { id: 'wheel', parentId: 'bike', label: 'Wheel', data: { quantity: 2 } },
]
const columns: TreeGridColumn<Part>[] = [
  { id: 'quantity', label: 'Quantity', width: 120, value: row => row.data?.quantity },
]
const expanded = ref(['bike'])
</script>

<template>
  <TreeGrid v-model:expanded-ids="expanded" :rows="rows" :columns="columns" :height="240" />
</template>
```

**Examples:** [Tree grid](/examples/tree-grid/), [Bill of materials](/showcase/bom/). **Guide:** [Tree grids, matrices and bills of materials](../guides/data.md#tree-grids-matrices-and-bills-of-materials). **Types:** [`TreeGridRow`](../reference/core/interfaces/TreeGridRow.md), [`TreeGridColumn`](../reference/core/interfaces/TreeGridColumn.md), [`TreeGridExposed`](../reference/vue-weave/type-aliases/TreeGridExposed.md).

<!--@include: ../../../docs/api.md#tree-grid-->
