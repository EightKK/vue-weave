---
title: GanttChart
description: Props, events, slots and exposed methods of the GanttChart component.
---

# GanttChart {#top}

`GanttChart` is a controlled Gantt chart and timeline: rows with bars on a time axis, FS, SS, FF and SF dependencies with lag, row groups with summary rollups, baselines, columns, a resource load histogram, a status date and progress line, and spreadsheet editing. Use it for production plans, project schedules, machine timelines or any half-open intervals `[start, end)` in numeric units you choose (milliseconds by default; a zero-duration bar is a milestone).

It never changes `rows` or `bars`. A drag or keyboard edit is previewed and then emitted as an `edit` proposal; `validateEdit` can reject it synchronously, and the chart cancels a gesture in flight when its data changes. The chart renders what you pass: to calculate dates, run [`scheduleTasks`](../core/scheduling.md) and pass the result.

## Minimal example

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { GanttChart, type TimelineBar, type TimelineEdit } from '@eightkk/vue-weave'
import '@eightkk/vue-weave/style.css'

const start = Date.parse('2026-11-09T08:00:00Z')
const hour = 3_600_000
const range = { start, end: start + 8 * hour }
const rows = [{ id: 'team', label: 'Engineering' }]
const bars = ref<TimelineBar[]>([
  { id: 'build', rowId: 'team', label: 'Build', start: start + hour, end: start + 3 * hour, editable: true, progress: 0.4 },
])

function commit(change: TimelineEdit) {
  bars.value = bars.value.map(bar => bar.id === change.id ? { ...bar, ...change.after } : bar)
}
</script>

<template>
  <GanttChart :rows="rows" :bars="bars" :range="range" @edit="commit" />
</template>
```

**Examples:** [Scheduling](/examples/scheduling/), [Linked views](/examples/linked-views/), [Construction schedule](/showcase/construction/) and the [example index](/examples/). **Guides:** [Scheduling](../guides/scheduling.md), [Data, saving and linked views](../guides/data.md). **Types:** [`TimelineRow`](../reference/core/interfaces/TimelineRow.md), [`TimelineBar`](../reference/core/interfaces/TimelineBar.md), [`TimelineEdit`](../reference/core/interfaces/TimelineEdit.md), [`GanttChartExposed`](../reference/vue-weave/type-aliases/GanttChartExposed.md). The time scale and editing helpers are on [Timeline and scales](../core/timeline.md).

<!--@include: ../../../docs/api.md#gantt-chart-->
