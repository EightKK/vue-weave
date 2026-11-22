---
title: Linked views and data
description: View bindings and useLinkedSelection, time range exploration, structure comparison with diffStructure, windowed data, graph expansion and time bucket tables.
---

# Linked views and data

These helpers connect the views of an application and the data behind them. View bindings map your entities (tasks, resources, parts) to what each view shows, so that selecting a bar highlights its node, its load segment and its tree grid rows; `useLinkedSelection` does this reactively. Time range exploration shows what was worked on in a time window. `diffStructure` compares two versions of a flat or tree-shaped collection, such as two revisions of a bill of materials. Windowed data and graph expansion load only what is on screen, and time buckets build period tables (rows by days, weeks or shifts).

All of them are pure and return data; the components only receive the resulting IDs and highlights as props.

## Minimal example

```ts
import { diffStructure } from '@eightkk/vue-weave/core'

const before = [
  { id: 'bike', name: 'Bicycle' },
  { id: 'frame', parentId: 'bike', name: 'Frame', quantity: 1 },
  { id: 'bell', parentId: 'bike', name: 'Bell', quantity: 1 },
]
const after = [
  { id: 'bike', name: 'Bicycle' },
  { id: 'frame', parentId: 'bike', name: 'Frame', quantity: 2 },
]
const diff = diffStructure(before, after, { key: 'id', parentKey: 'parentId', fields: ['name', 'quantity'] })
diff.changed // [{ key: 'frame', fields: [{ name: 'quantity', before: 1, after: 2 }] }]
diff.removed // ['bell']
```

**Examples:** [Linked views](/examples/linked-views/), [Tree grid](/examples/tree-grid/), [Bill of materials](/showcase/bom/). **Guide:** [Data, saving and linked views](../guides/data.md). **Types:** [`diffStructure`](../reference/core/functions/diffStructure.md), [`ViewBinding`](../reference/core/interfaces/ViewBinding.md), [`useLinkedSelection`](../reference/vue-weave/functions/useLinkedSelection.md), [`useWindowedData`](../reference/vue-weave/functions/useWindowedData.md).

<!--@include: ../../../docs/api.md#linked-views-->

<!--@include: ../../../docs/api.md#time-range-exploration-->

<!--@include: ../../../docs/api.md#structure-comparison-->

<!--@include: ../../../docs/api.md#partial-data-loading-->

<!--@include: ../../../docs/api.md#time-buckets-->
