---
title: Composables
description: useLinkedSelection, useEditHistory, useEditTransaction, useTimelineView, useWindowedData and useAsyncGraphLayout.
---

# Composables

The composables of the Vue entry (`@eightkk/vue-weave`) wire the pure state of the core to Vue refs. They hold no hidden global state: each call owns its state, and the components still receive plain props.

| Composable | Use it to | Reference |
| --- | --- | --- |
| `useLinkedSelection` | Select an item in one view and highlight its counterparts in the graph, timeline, load rows and tree grid | [Linked views](./core/linked-data.md#linked-views) |
| `useEditHistory` | Keep undo and redo for the state your components show | [below](#application-undo-and-redo) |
| `useEditTransaction` | Save each edit through your server adapter, with pending, failed and conflict states | [below](#edit-transactions-and-asynchronous-saving) |
| `useTimelineView` | Search, sort, filter and hide columns of a GanttChart without changing the source rows | [Typed fields and timeline views](./core/timeline.md#typed-fields-and-timeline-views) |
| `useWindowedData` | Fetch only the rows and time window on screen, with aborts, deduplication and retry | [Partial data loading](./core/linked-data.md#partial-data-loading) |
| `useAsyncGraphLayout` | Run a graph layout in a Worker or through ELK.js and show provisional frames meanwhile | [Asynchronous layouts](./core/graph-layout.md#asynchronous-layouts-and-preserved-routes) |

## Minimal example

Undo and redo for a GanttChart: commit each accepted edit, and bind `state` to the chart.

```vue
<script setup lang="ts">
import { GanttChart, useEditHistory, type TimelineBar, type TimelineEdit } from '@eightkk/vue-weave'

const props = defineProps<{ initialBars: TimelineBar[]; rows: { id: string; label: string }[]; range: { start: number; end: number } }>()
const history = useEditHistory(props.initialBars)

function commit(change: TimelineEdit) {
  history.commit(history.state.value.map(bar => bar.id === change.id ? { ...bar, ...change.after } : bar))
}
</script>

<template>
  <button :disabled="!history.canUndo.value" @click="history.undo()">Undo</button>
  <button :disabled="!history.canRedo.value" @click="history.redo()">Redo</button>
  <GanttChart :rows="rows" :bars="history.state.value" :range="range" @edit="commit" />
</template>
```

Linked selection between a graph and a Gantt chart:

```ts
import { useLinkedSelection, type ViewBinding, type ViewTargetEvent } from '@eightkk/vue-weave'

const bindings: ViewBinding[] = bars.flatMap(bar => [
  { entity: { kind: 'task', id: bar.id }, target: { view: 'graph', kind: 'node', id: bar.id } },
  { entity: { kind: 'task', id: bar.id }, target: { view: 'timeline', kind: 'bar', id: bar.id } },
])
const linked = useLinkedSelection({ bindings })
const activate = (event: ViewTargetEvent) => linked.select(event.target.view, [event.target])
// <NetworkGraph :selected-ids="linked.graph.value.selectedNodeIds" @target-activate="activate" ... />
```

**Examples:** [Linked views](/examples/linked-views/), [Tree grid](/examples/tree-grid/). **Guide:** [Data, saving and linked views](./guides/data.md). **Types:** [`useEditHistory`](./reference/vue-weave/functions/useEditHistory.md), [`useEditTransaction`](./reference/vue-weave/functions/useEditTransaction.md), [`useLinkedSelection`](./reference/vue-weave/functions/useLinkedSelection.md), [`useTimelineView`](./reference/vue-weave/functions/useTimelineView.md), [`useWindowedData`](./reference/vue-weave/functions/useWindowedData.md), [`useAsyncGraphLayout`](./reference/vue-weave/functions/useAsyncGraphLayout.md).

<!--@include: ../../docs/api.md#undo-redo-->
