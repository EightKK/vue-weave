---
title: Timeline and scales
description: Time scales, interval editing helpers, row trees and summaries, typed fields and timeline views.
---

# Timeline and scales

The timeline helpers are the arithmetic behind GanttChart: invertible time scales (`createTimeScale`, `createWorkingTimeScale`, which compresses non-working time), stable ticks, snapped interval edits (`editTimeRange`), row trees with summary rollups, typed field definitions for columns and cell editors, and timeline views that search, sort and filter rows without changing the source data (`projectTimelineView`, `useTimelineView`).

Intervals are half-open `[start, end)` in numeric units you choose, milliseconds by default. Every scale is invertible: `toTime(toX(t))` gives `t` back, so a pixel position and a time can be converted in both directions.

## Minimal example

```ts
import { createTimeScale, editTimeRange } from '@eightkk/vue-weave/core'

const hour = 3_600_000
const range = { start: 0, end: 24 * hour }
const scale = createTimeScale(range, 80 / hour) // 80 pixels per hour
scale.toX(2 * hour) // 160
scale.toTime(160) // 7_200_000

// Move a bar by 50 minutes, snapped to 15-minute steps, inside the range
const moved = editTimeRange({ start: hour, end: 3 * hour }, 'move', 50 * 60_000, 15 * 60_000, range)
```

**Examples:** [Scheduling](/examples/scheduling/), [Construction schedule](/showcase/construction/). **Guide:** [Alternative time scales](../guides/data.md#alternative-time-scales). **Types:** [`TimeScale`](../reference/core/interfaces/TimeScale.md), [`createTimeScale`](../reference/core/functions/createTimeScale.md), [`editTimeRange`](../reference/core/functions/editTimeRange.md), [`useTimelineView`](../reference/vue-weave/functions/useTimelineView.md).

<!--@include: ../../../docs/api.md#timeline-editing-helpers-->

<!--@include: ../../../docs/api.md#row-trees-->

<!--@include: ../../../docs/api.md#timeline-views-->
