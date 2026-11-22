---
title: Scheduling and resources
description: Calendars, scheduleTasks, resource load and leveling, recorded actuals, earned value, network diagrams, resource timelines, diagnostics and plan comparison.
---

# Scheduling and resources

The scheduler calculates a plan; GanttChart only draws it. `buildWorkPeriods` turns weekly shifts and exceptions into work calendars, `scheduleTasks` calculates calendar-aware earliest and latest dates, float and the critical path with FS, SS, FF and SF links and lag, and `levelResources` delays tasks so that assigned load stays within capacity. Around them are helpers to propagate one edit, reschedule from a status date or from recorded actuals, compute earned value, draw the plan as a PERT network, show it by resource, explain why a task starts when it does, and compare a candidate plan with the current one.

Cycles and infeasible plans are returned as results with diagnostics, not thrown, so you can show them to the user.

## Minimal example

```ts
import { buildWorkPeriods, scheduleTasks, scheduledBarFields, type TimelineBar } from '@eightkk/vue-weave/core'

const hour = 3_600_000
const start = Date.parse('2026-11-09T00:00:00Z')
const range = { start, end: start + 28 * 24 * hour }
// Monday to Friday, 08:00–17:00 UTC
const weekly = [1, 2, 3, 4, 5].map(weekday => ({ weekday, startMinute: 8 * 60, endMinute: 17 * 60 }))
const periods = buildWorkPeriods(range, { utcOffsetMinutes: 0, weekly })

const plan = scheduleTasks({
  range,
  quantum: 60_000,
  calendars: [{ id: 'plant', periods }],
  defaultCalendarId: 'plant',
  tasks: [{ id: 'cut', duration: 6 * hour }, { id: 'weld', duration: 10 * hour }],
  dependencies: [{ id: 'cut-weld', from: 'cut', to: 'weld', type: 'FS' }],
})
const bars: TimelineBar[] = plan.ok
  ? plan.tasks.map(task => ({ id: task.id, rowId: task.id, label: task.id, ...scheduledBarFields(task) }))
  : []
```

**Examples:** [Scheduling](/examples/scheduling/), [Construction schedule](/showcase/construction/). **Guides:** [Scheduling](../guides/scheduling.md) and [Resources and plan analysis](../guides/resources.md). **Types:** [`scheduleTasks`](../reference/core/functions/scheduleTasks.md), [`ScheduleInput`](../reference/core/interfaces/ScheduleInput.md), [`levelResources`](../reference/core/functions/levelResources.md), [`computeEarnedValue`](../reference/core/functions/computeEarnedValue.md).

<!--@include: ../../../docs/api.md#scheduling-->

<!--@include: ../../../docs/api.md#schedule-network-->

<!--@include: ../../../docs/api.md#plan-analysis-->
