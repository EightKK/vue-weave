# Scheduling and equipment load

<!-- #region plan -->

The scheduling functions are available from `@eightkk/vue-weave/core` and the Vue package entry. The Gantt chart still renders the intervals supplied by its parent. Call the solver when an edit proposes a new constraint, then publish the accepted bars, links, and load data together.

## Calendar contract

A calendar contains an ID and absolute half-open work periods `[start, end)`. Overlapping or touching periods are combined. Missing periods represent time off. Work can span several periods, with gaps retained in the elapsed start/end span. The result's `work` array contains the segments that consume work or capacity.

Use `buildWorkPeriods(range, { weekly, utcOffsetMinutes, exceptions })` to expand weekly rules into epoch milliseconds in a fixed UTC offset, an integer number of minutes from -1080 to 1080 (the same limit as `calendarBands`). Weekdays run from Sunday (0) to Saturday (6). A shift starts at `startMinute` and ends at `endMinute` relative to the start of its local date. An end beyond 1440 continues into the next date. Shifts are at most 24 hours long. An exception replaces its entire civil date, including overnight carry-in. An empty exception closes the date. For a zone that observes daylight-saving transitions, pass an IANA `timeZone` instead of `utcOffsetMinutes`, as described in [Time-zone calendars](#time-zone-calendars).

## Calculate a plan

```ts
import { scheduleTasks, calculateResourceLoad } from '@eightkk/vue-weave/core'

const range = { start: 0, end: 30 }
const periods = [{ start: 0, end: 4 }, { start: 5, end: 9 }, { start: 24, end: 30 }]

const plan = scheduleTasks({
  range,
  quantum: 1,
  calendars: [{ id: 'shift', periods }],
  defaultCalendarId: 'shift',
  tasks: [
    { id: 'cut', duration: 4 },
    { id: 'inspect', duration: 2 },
    { id: 'other', duration: 2, startNoEarlierThan: 2 },
  ],
  dependencies: [{ id: 'cut-inspect', from: 'cut', to: 'inspect', type: 'FS' }],
})

if (plan.ok) {
  const equipment = calculateResourceLoad(
    range, plan.tasks,
    [{ id: 'cnc', capacity: 1, periods }],
    [{ resourceId: 'cnc', taskId: 'cut' }, { resourceId: 'cnc', taskId: 'other' }],
  )
  const conflicts = equipment.filter(segment => segment.overload > 0)
}
```

In this example cutting runs from 0 to 4. Inspection starts at 5 after the break and finishes at 7. The CNC conflict is the half-open interval [2, 4) with demand 2 and capacity 1.

### Date and dependency semantics

- The numeric horizon, dates and durations use the same unit. The horizon start is the alignment origin, and dates must align to `quantum`. Durations and signed lags must be integer multiples of it. The default quantum is 1 unit. For epoch-millisecond data, set it to 60,000 for minute resolution.
- `calendarId` overrides the default calendar. If neither is supplied, the horizon is continuously working. Zero-duration milestones can occur in a break and have an empty `work` array.
- The four links constrain the named successor endpoint to be at or after the predecessor endpoint plus `lag`. FS connects finish to start. SS connects start to start. FF connects finish to finish. SF connects start to finish. A positive lag is elapsed waiting time, and a negative lag permits overlap. A start at the end of a shift advances to the next available start. A finish lower bound that falls in a break advances to the next feasible completion tick.
- Bounds are `startNoEarlierThan`, `startNoLaterThan`, `finishNoEarlierThan`, `finishNoLaterThan`, `fixedStart`, and the project `deadline`. A fixed start for positive work must be in a working period. The deadline is a hard upper bound.
- Tasks with `manual` dates stay where they are and `inactive` tasks take no part; see [Manual and inactive tasks](#manual-and-inactive-tasks). `tasks` in a result is in input order without inactive tasks.
- Tasks with a `parentId` form a hierarchy of summary tasks; see [Summary tasks](#summary-tasks).
- Invalid references or values throw. IDs of tasks, dependencies, calendars, resources and assignments' references must be non-empty strings, unique within their collection; the messages follow one format, such as `Invalid task ID: 5`, `Duplicate dependency ID: d1` or `Unknown dependency endpoint: d1` (see [Validation and errors](api.md#validation-and-errors)). Cycles return `{ ok: false, code: 'cycle', cycles }`. A task with no feasible slot returns `{ ok: false, code: 'infeasible', taskId, constraints, dependencyIds }`. See [Diagnose failures](#diagnose-failures). Failed results carry no partial dates. The solver accepts directed acyclic dependency graphs.
- The forward pass finds earliest dates. The backward pass holds the earliest project finish as its upper limit and finds latest dates. Total float is the task's own working time between those starts, or elapsed time for a milestone. workFloat is always working time on the task's calendar: it equals totalFloat for tasks and, for a milestone, the calendar's working time between its earliest and latest points. Use workFloat to compare milestones with tasks. A zero-float task is critical. A critical link binds two critical tasks after projecting the dependency endpoint onto the successor calendar. The result can contain multiple controlling chains and individually constrained critical tasks.

## Show a plan in GanttChart

`scheduledBarFields(task)` turns each task of a successful result into the bar fields the chart draws: `start` and `end`, `critical`, `latestEnd` for the float line and, when the work is split by breaks, closed dates or pauses, `segments` from the task's `work`. Spread it into a `TimelineBar` and add the fields the scheduler does not know, such as the row, label, tone, `editable` and an optional display `deadline`. `invertWorkPeriods(periods, range)` returns the time between the calendar's work periods, which the chart shades through `nonWorkingPeriods`.

```ts
import { buildWorkPeriods, invertWorkPeriods, scheduleTasks, scheduledBarFields, type TimelineBar } from '@eightkk/vue-weave/core'

const periods = buildWorkPeriods(range, { utcOffsetMinutes: 540, weekly })
const plan = scheduleTasks({ range, quantum: 60_000, calendars: [{ id: 'plant', periods }], defaultCalendarId: 'plant', tasks, dependencies })
const bars: TimelineBar[] = plan.ok ? plan.tasks.map(task => ({
  id: task.id, rowId: task.id, label: labels.get(task.id)!, editable: true,
  ...scheduledBarFields(task),
  deadline: dueDates.get(task.id),
})) : []
const nonWorkingPeriods = invertWorkPeriods(periods, range)
```

```vue
<GanttChart :rows="rows" :bars="bars" :range="range" :dependencies="dependencies" :non-working-periods="nonWorkingPeriods" @edit="reschedule" />
```

Critical bars get an outline, `latestEnd` draws a float line from the end of the bar, a `deadline` adds an indicator and marks a bar that ends after it as late, and `segments` draw the work pieces joined by a connector across each gap. The same information is added to each bar's accessible description. The chart still only proposes edits. A move preview shifts the segments with the bar, and a resize preview shows the plain interval. Turn the accepted `TimelineEdit` into a new constraint, for example `startNoEarlierThan`, call `scheduleTasks` again and pass the new bars, so segments, float and critical flags follow the recalculated plan. `scheduledBarFields` omits `segments` for a task with a single work segment and for milestones, which cannot have segments. ALAP tasks report their placed dates with the latest finish of the plan.

### Scheduling constraints from the chart

`TimelineBar.constraints` uses the names of the `ScheduleTask` bounds (`startNoEarlierThan`, `startNoLaterThan`, `finishNoEarlierThan`, `finishNoLaterThan` and `fixedStart`), so the two map one to one in both directions, and the chart can show and edit them. `timelineConstraints(task)` copies the constraint fields of a task (and nothing else) for a bar; a bar's constraints spread into a task unchanged. With `constraintsEditable`, the chart turns the constraints of editable bars into handles and proposes each move or removal through `constraint-edit`; it never changes the plan itself. Apply the proposal to your tasks, schedule again and show the diagnostic when the new bound cannot be met (see [Diagnose failures](#diagnose-failures)):

```ts
import {
  scheduleTasks, scheduledBarFields, timelineConstraints, type ScheduleTask, type TimelineConstraintEdit,
} from '@eightkk/vue-weave/core'

const bars = computed(() => plan.value.tasks.map(task => ({
  id: task.id, rowId: task.id, label: labels.get(task.id)!, editable: true,
  ...scheduledBarFields(task),
  constraints: timelineConstraints(tasks.value.find(item => item.id === task.id)),
})))

function onConstraintEdit(change: TimelineConstraintEdit) {
  const next = tasks.value.map((task): ScheduleTask => {
    if (task.id !== change.id) return task
    const { [change.kind]: _previous, ...rest } = task
    return change.after === undefined ? rest : { ...rest, [change.kind]: change.after }
  })
  const result = scheduleTasks({ ...input, tasks: next })
  if (!result.ok) return report(result) // for example: 'pack' cannot meet ['finishNoLaterThan'] with link 'cut-b-pack'
  tasks.value = next
  plan.value = result
}
```

If the bars themselves are your source of truth, apply the proposal with `applyTimelineConstraintEdit(bars, change)` and build the tasks with `{ id: bar.id, duration, ...bar.constraints }`. The chart does not check feasibility: conflicting constraints are valid chart data, and a constraint that the bar's dates break is drawn as violated, which is what a plan from `scheduleTasks` never shows. The project `deadline` and `mode` are not bar constraints; draw a due date with `TimelineBar.deadline`. `toMsProjectXml` writes a task's constraint when it has exactly one, or exactly the finish pair at one time as Must Finish On (`MsProjectTask.constraints`).

## Propagate an edit

`propagateEdit(input, edit)` answers "what else moves if this task moves?". `edit` is a `ScheduleEdit` with the task `id`, a new `start` and an optional new `end`. The function schedules a copy of the plan in which the task has `fixedStart` at the new start, replacing any fixed start it had. With `end`, the task's working duration becomes the working time in `[start, end)` on its own calendar, after its pauses, so resizing a bar across a break keeps only the working hours. Every other bound of the task, every dependency, the horizon and the deadline still apply. The input is not modified.

```ts
import { propagateEdit } from '@eightkk/vue-weave/core'

const result = propagateEdit(input, { id: 'cut', start: 1 })
if (result.ok) {
  // result.schedule is the full ScheduleSuccess; result.changes lists the tasks whose dates moved.
  for (const { id, before, after } of result.changes) console.log(id, before, after)
}
```

With the plan of [Calculate a plan](#calculate-a-plan), moving cutting to 1 gives `changes` of cutting `[0, 4)` → `[1, 6)` (it now works 1–4 and 5–6) and inspection `[5, 7)` → `[6, 8)`. `changes` holds one `ScheduleChange` (`id`, `before`, `after`) for every task whose start or end differs from `scheduleTasks(input)`, in input order, including the edited task when its dates change. Moving a task to its current dates gives an empty list.

- The new start follows the `fixedStart` rule: it must align with the horizon and quantum (otherwise a `RangeError` is thrown, like `scheduleTasks`) and, for positive work, lie in a working period. A start in a break is infeasible; move it to the next working time first if the application wants that. `end` must also be aligned and not before `start`.
- An unknown task ID throws an `Error`; malformed input throws as in `scheduleTasks`.
- When the edited plan fails, its `ScheduleFailure` (`cycle` or `infeasible`, with `constraints` such as `fixedStart` and the binding `dependencyIds`) is returned unchanged. When only the unedited plan fails, there is nothing to compare with and its failure is returned.
- Editing a task with `manual` dates moves those dates instead of adding `fixedStart`: they become `[start, end)`, or the new start and the previous elapsed length without `end`. Its calendar does not change them. New dates outside the range are returned as an `infeasible` failure with `['range']`. Editing an `inactive` task throws an Error, like an unknown one.

### Cascade previews in GanttChart

`propagateEdit` is the usual body of the GanttChart `cascade` prop. The chart calls `cascade(change)` with the proposed `TimelineEdit` whenever a dragged bar reaches a new snapped interval, draws the returned changes as dashed outlines, and on release emits the move and the cascaded changes together through `edits`. Keyboard moves call it once per key press. Return `[]` for edits you do not cascade (for example resizes) and when the schedule fails, so the plain `edit` path reports the problem.

```ts
function cascade(change: TimelineEdit): TimelineEdit[] {
  if (change.mode !== 'move') return []
  const result = propagateEdit(scheduleInput(tasks.value), { id: change.id, start: change.after.start })
  if (!result.ok) return []
  return result.changes.filter(item => item.id !== change.id)
    .map(item => ({ id: item.id, before: item.before, after: item.after, mode: 'move', source: change.source }))
}
```

`changes` are measured against `scheduleTasks(input)`. When the plan on screen came from different constraints, for example a requested `startNoEarlierThan` that the drag replaces, build `input` so that it reproduces the plan on screen: the demo pins the dragged task with `fixedStart` at its current start and removes its `startNoEarlierThan` before calling `propagateEdit`. The chart ignores changes for the dragged bar itself and for unknown bars. Persist the accepted batch the same way as a single edit, for example by turning the primary change (the first entry) into a new constraint and scheduling again.

`ScheduleLink` extends `TimelineDependency`, and both have an optional `lag`. Pass one dependency array to the chart's `dependencies` and to `scheduleInput`, so the cascade preview, the accepted plan and the chart all use the same lags; the chart labels each non-zero lag on its connector (`formatLag`, default signed hours such as `+2 h` or `−2 h`). If you convert between your own link records and these types, copy `lag` as well: a link without it schedules as lag 0.

## Reschedule from a status date

`rescheduleFromStatusDate(input, statusDate, progress)` updates a plan after progress has been reported at a status date. `progress` is a `ReadonlyMap` from task ID to the completed share of its working duration, from 0 to 1; a task without an entry has progress 0. Anything that is not a map, such as a plain object, throws an Error. The current dates are those of `scheduleTasks(input)`; when that fails, its failure is returned.

- **Progress 1.** The task keeps its current dates, even when they lie after the status date.
- **Progress between 0 and 1.** The done work is `progress × duration` rounded down to whole quanta (a value just below 1 still leaves one quantum). It stays where it is, from the current start. When that would carry it past the status date (the task is ahead of plan or started early), it is placed so that it ends at the status date instead. The remaining work is scheduled at or after the status date on the task's calendar. When time is left between the two parts, the task is split: its `work` lists both parts, and `scheduledBarFields` turns them into `segments`. Internally the gap becomes a pause of the task. A task whose done work rounds down to zero, and a milestone, is treated as not started.
- **Progress 0.** The task starts no earlier than the status date, in addition to its own bounds and dependencies.

A started or finished task is pinned at its start with `fixedStart`: its `startNoEarlierThan`, `startNoLaterThan`, previous `fixedStart` and `mode` no longer apply, because its start has happened. Its finish bounds (`finishNoEarlierThan`, `finishNoLaterThan`, the deadline) and its outgoing dependencies still apply, so successors follow the new finish. Incoming dependencies depend on the link type and the progress:

- **FS and SS links** bound the start, so they no longer apply to a started task.
- **FF and SF links** bound the finish, so they still apply to a partly done task, including their lag. When the remaining work would finish before a link allows, it resumes later instead of right at the status date: the gap after the done work grows, and the task finishes at the earliest time the link allows on its calendar. The done work stays where it is.
- **A finished task** (progress 1) ignores every incoming link and keeps its dates.

A partly done task's own `finishNoEarlierThan` works the same way as a kept FF or SF link: when the remaining work would finish earlier, it resumes later, so the task finishes at that bound.

A kept FF or SF link that cannot be met makes the plan infeasible. When the required finish lies after the task's `finishNoLaterThan`, the deadline or the end of the horizon, the result is an `infeasible` failure for the task that names the link in `dependencyIds`, with `finishNoLaterThan`, `deadline` or `range` in `constraints`. Unstarted tasks keep every bound and dependency; an unstarted task with a `fixedStart` before the status date makes the plan infeasible, which is returned as an `infeasible` failure. The result is the `ScheduleResult` of the adjusted plan. The dependencies that no longer apply are left out of it, so they never appear in `criticalDependencyIds`. The input is not modified.

```ts
import { rescheduleFromStatusDate } from '@eightkk/vue-weave/core'

// Continuous time: a (10 units) → b (10 units); status date 15.
const result = rescheduleFromStatusDate(input, 15, new Map([['a', 1], ['b', 0.3]]))
// a keeps [0, 10). b keeps 3 units at [10, 13) and does the other 7 at [15, 22): work [[10, 13], [15, 22]].

// a (6 units) →FF→ b (4 units); b is half done at status date 2, a has not started and now runs [2, 8).
// b keeps its done half at [0, 2) and does the other half at [6, 8), so it finishes with a: work [[0, 2], [6, 8]].
```

Tasks with `manual` dates keep them whatever their progress; their outgoing links still apply. Progress entries of `inactive` tasks are accepted and ignored.

The status date must be finite, inside `input.range` and aligned with the quantum (`RangeError`). Progress values outside 0 to 1 throw a `RangeError` and progress for an unknown task throws an `Error`. When the done work of a task ahead of plan does not fit between the horizon start and the status date, a `RangeError` is thrown. GanttChart can show the status date with the `statusDate` prop and the progress with `showProgressLine`.

## Reschedule from recorded actuals

`rescheduleFromStatusDate` and `rescheduleFromActuals` answer different questions, and neither changes the other's results:

| | `rescheduleFromStatusDate(input, statusDate, progress)` | `rescheduleFromActuals(input, statusDate, actuals)` |
| --- | --- | --- |
| Input per task | A completed share from 0 to 1 | Recorded actual intervals `[start, end)`, an optional `remainingWork` and an optional `finished` flag |
| Done work | `progress × duration`, placed from the planned start (or ending at the status date) on the task's calendar | Exactly the recorded intervals, also on breaks, holidays or after the status date |
| Remaining work | `duration` minus the done work | `remainingWork`, or by default `duration` minus the elapsed length of the actuals (overlaps once), at least 0 |
| Result | A `ScheduleResult` | A `RescheduleFromActualsResult`: the forecast `schedule`, the original `plan`, per-task `actual` and `remaining` work, and diagnostics |

Use the progress share when only a percentage is known. Use recorded actuals when the shop floor reports when work actually ran, for example "10:10–10:40 and 11:20–12:00". The library standardises only time and quantity: it never derives remaining work from good-piece counts or shop-floor percentages. Convert those to `remainingWork` yourself, in the task's working-time units; when you omit it, the default rule above applies.

```ts
import { actualsTimelineBars, rescheduleFromActuals } from '@eightkk/vue-weave/core'

// a (4 units) → b (4 units), continuous time. a started late at 2, stopped at 3, resumed at 5 and ran until 6.
const result = rescheduleFromActuals(input, 7, new Map([
  ['a', { intervals: [{ start: 2, end: 3 }, { start: 5, end: 6 }] }],
]))
// a: actual [[2, 3], [5, 6]] as recorded, 2 units performed, 2 remaining at [7, 9); b now runs [9, 13).
const bars = actualsTimelineBars(result, { label: id => names.get(id)! })
```

The rules per task:

- **Not started** (no entry, or no intervals). The task starts no earlier than the status date, like progress 0, with every own bound and link. An explicit `remainingWork` replaces its duration.
- **In progress** (intervals and remaining work). The remaining work starts no earlier than the status date or the end of the last actual interval, whichever is later, and is placed on the task's calendar and pauses. Its start has happened, so, as for a started task in `rescheduleFromStatusDate`, its `startNoEarlierThan`, `startNoLaterThan`, `fixedStart`, `mode`, incoming FS and SS links and the start bounds inherited from its summaries no longer apply, even when its predecessors are unfinished. Incoming FF and SF links (with lag), `finishNoEarlierThan`, `finishNoLaterThan` and the deadline still bind its finish: the remaining work then resumes later. Outgoing SS and SF links use its first actual start; FS and FF links use its forecast finish.
- **Finished** (`finished: true`, or no remaining work). The task spans its actuals and ends at its last actual end. Like a manual task, it ignores every incoming link and own bound, and only the project deadline can make it infeasible. Successors follow its last actual end. Pass `remainingWork` to keep a task that overran its duration open.

Actuals are facts, so contradictions in them are reported as diagnostics and never corrected: overlapping intervals of one task (`actual-overlap`, an error; the overlap counts once), an interval after the status date (`actual-after-status-date`, a warning; the remaining work then starts after it), an interval outside the task's working time after pauses (`actual-outside-calendar`, a warning; the result's `offCalendar` lists the parts) and a finished task with positive `remainingWork` (`actual-contradiction`, an error; the explicit `remainingWork` is scheduled). Malformed numbers throw instead: a status date or interval that is not finite, aligned with the quantum or inside the range, an interval that does not end after it starts, and an invalid `remainingWork` throw a RangeError. An interval error is the scheduler's own message for the same defect in its input, with the task as context, for example `Scheduling dates must align with the horizon and quantum (actual interval of task a)`.

When the remaining work cannot meet a bound or link, for example a `finishNoLaterThan` or the deadline, `ok` is false, `schedule` is the `infeasible` (or `cycle`) failure with the input's task and link IDs, `diagnostics` ends with its `schedule-infeasible` entry, and `tasks` still holds every task's actuals, with the span of its actuals as its dates. Nothing is thrown.

Manual tasks keep their manual dates: their actuals are kept and checked, but do not move them. Summary tasks roll up the actual and forecast dates of their subtasks; an actuals entry for a summary throws an Error. Entries of inactive tasks are validated and ignored. `explain` is not supported; schedule `input` itself for a trace of the plan.

### Show plan, actuals and forecast in GanttChart

`actualsTimelineBars(result, options?)` composes existing bar features, so no new chart prop is needed. On each task's row, the recorded actuals are a solid bar named `<label> · actual` (several intervals become `segments`), the remaining work is an outline bar named `<label> · forecast`, and the original plan is the baseline of the first bar. Solid and outline also differ in forced-colors mode, and each bar's `description` says "Recorded actual work" or "Remaining work forecast", so screen readers hear which part is which. SVG and PNG export draw the same bars. Pass `baselineId: 'plan'` with GanttChart `baselineIds` and `baselineLabel` to call the strip "Original plan", and add a legend in the `legend` slot. Show summary rows with `showSummaries`.

The scheduling demo's **Recorded actuals** option shows a finished task that overran, a late start that ran into the lunch break and resumed, an upward revision of remaining work (**Welding needs 3 h more**) and unstarted successors whose forecast moves while every actual bar stays where it was.

## Earned value management

`computeEarnedValue(tasks, options)` measures a plan's performance at a status date with earned value management (EVM). Each task brings its budget (BAC), its planned (baseline) dates, its progress share from 0 to 1 and its actual cost so far. It does not schedule: take the baseline from the plan you committed to, for example a `scheduleTasks` result or the `baseline` of a `TimelineBar`, not from today's forecast, or the schedule variance disappears.

```ts
import { computeEarnedValue, rollupEarnedValue } from '@eightkk/vue-weave/core'

const result = computeEarnedValue([
  { id: 'design', budget: 10000, start: designStart, end: designEnd, progress: 0.4, actualCost: 5000, calendarId: 'office' },
  { id: 'build', budget: 20000, start: buildStart, end: buildEnd },
], { statusDate, calendars: [{ id: 'office', periods }], series: { step: day } })
result.totals.spi // budget-weighted schedule performance index, or undefined before any planned value
const engineering = rollupEarnedValue(result.tasks.filter(task => engineeringIds.has(task.id)))
```

The three base values:

- **Planned value (PV)** is the budget of the work the plan scheduled before the status date: `budget ×` the share of `[start, end)` that lies before the status date. With a calendar the share is measured in working time, so nothing accrues during nights, weekends or holidays; without one it is elapsed time. A task whose planned dates contain no working time of its calendar falls back to elapsed time. Before its start a task has PV 0, from its end on its whole budget. A milestone (`start === end`) accrues its whole budget at its start, so its PV is the budget once the status date reaches it.
- **Earned value (EV)** is the budget of the work done: `progress × budget`. Progress is a share of the budget, so it must reflect how much of the task's value is complete, not only how much time has passed.
- **Actual cost (AC)** is the cost spent so far, in the same unit as the budget.

The derived indicators: schedule variance `SV = EV − PV` and cost variance `CV = EV − AC` (negative is late or over budget); `SPI = EV / PV` and `CPI = EV / AC` (below 1 is late or over budget); the estimate to complete `ETC`, the estimate at completion `EAC = AC + ETC`, the variance at completion `VAC = BAC − EAC`; and the to-complete performance index `TCPI = (BAC − EV) / (BAC − AC)`, the cost efficiency the remaining work needs to finish on budget. `eacMethod` chooses how the remaining work `BAC − EV` is forecast: `'cpi'` (default, `ETC = (BAC − EV) / CPI`, so `EAC = BAC / CPI` once costs are recorded), `'cpi-spi'` (`ETC = (BAC − EV) / (CPI × SPI)`, when lateness also costs money) or `'budget'` (`ETC = BAC − EV`, when the variance so far was a one-off).

A ratio whose denominator is zero is undefined and left out of the result, never NaN or Infinity: SPI before any planned value, CPI before any cost, TCPI once the budget is spent (`AC ≥ BAC`) and `percentComplete` for a zero budget. For the ETC, an undefined CPI or SPI counts as 1, so a task without recorded cost is forecast at its budget rate; a CPI of 0 (cost but no progress) leaves ETC, EAC and VAC undefined while work remains. Once a task is complete, ETC is 0 and EAC equals AC.

Totals and summary rows add up BAC, PV, EV and AC and derive the indicators from the sums (`rollupEarnedValue`), so a total SPI or CPI is weighted by budget, and a total EAC can differ from the sum of the task EACs. Pass only leaf tasks to `computeEarnedValue`; a summary task's budget is the sum of its subtasks' budgets, and including both counts it twice. Note also that SPI returns to 1 when all work is done, however late: compare finish dates as well, for example with `comparePlans` or `rescheduleFromStatusDate`.

The `series` option returns the cumulative values for an S-curve, every `step` across the plan. PV is defined at every point. EV and AC are defined only up to the status date and come from each task's `history`: records `{ time, progress, actualCost? }` before the status date, followed by its status-date values. Between records the values hold as steps; before a task's first record it contributes 0, so a task without history adds its EV and AC only at the status date. The status date is always one of the points. The library does not forecast a curve after the status date; the demo draws a straight line from AC at the status date to the EAC.

To show the figures in GanttChart, return them from `columns` (`TimelineColumn.value`), with `rollupEarnedValue` for rows that have child rows and `showSummaries` for their rollup bars, and set the chart's `statusDate`. The **Earned value** demo combines KPI tiles, an S-curve in inline SVG, EVM columns and a status date slider.

## Network diagram

`scheduleToGraph(result, dependencies, options?)` turns a successful result into a PERT (activity-on-node) diagram for NetworkGraph: each node shows the task's early start, early finish and total float, critical tasks get the amber tone and `criticalNodeIds`, and the controlling links are returned in `criticalEdgeIds`. Edges are labelled with the link type when it is not FS and with a non-zero `lag`, formatted by `formatLag` (default `formatDependencyLag`, such as `SS +2 h`). Pass `criticalNodeIds` as NetworkGraph `relatedIds` to highlight them. See the [API reference](api.md#network-diagram-from-a-schedule).

<!-- #endregion plan -->

<!-- #region capacity -->

## Compare demand with capacity

Resources have integer capacity and optional half-open availability periods. Omit periods for continuous availability, or use an empty array to close the resource throughout the horizon. Capacity is constant while available, unless the resource has `capacityPeriods` (see [Capacity that changes over time](#capacity-that-changes-over-time)). Each assignment requests positive integer units and applies to every work segment of the task, unless it covers only part of the work (see [Assignments for part of a task](#assignments-for-part-of-a-task)). Duplicate assignments for the same task and resource are rejected. To use fractions, choose a shared unit such as percentage points for both capacity and demand.

The sweep reports load, available capacity, excess units and active task IDs for every event interval. Work that falls outside the equipment calendar appears as demand against zero capacity. Conflicts are diagnostic. `levelResources` provides a baseline leveling heuristic, described in [Level resources](#level-resources). Optimization, setup sequencing and other leveling policies remain the planning application's concern.

### Capacity that changes over time

`capacityPeriods` on a resource gives it a different capacity over fixed elapsed intervals, for example a second crew in a peak week, a reduced shift or a maintenance stop:

```ts
const resources = [{
  id: 'press', capacity: 2, periods: workingTime,
  capacityPeriods: [
    { start: monday6, end: monday14, capacity: 3 }, // extra operator
    { start: tuesday10, end: tuesday12, capacity: 0 }, // maintenance
  ],
}]
```

- Each period is half-open `[start, end)` in absolute time, with integer endpoints, `end > start` and a nonnegative integer `capacity`. Periods of one resource must not overlap; adjacent periods are fine. A violation throws a RangeError that names the resource. `levelResources` also requires the endpoints to align with the quantum, as it does for `periods`.
- Inside a capacity period its `capacity` applies; outside every capacity period the resource's `capacity` applies. Outside the availability `periods` the capacity stays 0, whatever the capacity periods say: a capacity period does not make a closed resource available.
- `calculateResourceLoad` splits its segments wherever the capacity changes, so each segment's `capacity` and `overload` hold for its whole interval. A task that needs 3 units from 13:00 to 15:00 on a resource with capacity 2 until 14:00 and 3 after is overloaded by exactly 1 unit from 13:00 to 14:00 and not after. A capacity of 0 during downtime overloads only the work that falls into it; idle time needs nothing. A capacity period with the same capacity as its surroundings does not split a segment.
- GanttChart draws the capacity line of each load segment at that segment's `capacity`, so the line steps with the capacity when you pass the output of `calculateResourceLoad` as `loadSegments`. `renderTimelineSvg` draws the same line.
- `levelResources` reserves capacity against the same step function, so leveling and the load calculation agree at every instant: a plan without `unresolvedTaskIds` has no overload.

### Assignments for part of a task

An assignment with `workOffset` or `workDuration` needs its resource only for part of the task's work, such as "the machine for the whole operation, one operator only for the first 30 minutes":

```ts
const assignments = [
  { resourceId: 'machine', taskId: 'turn' },
  { resourceId: 'operator', taskId: 'turn', workDuration: 30 * minute },
  { resourceId: 'inspector', taskId: 'turn', workOffset: 90 * minute, workDuration: 15 * minute },
]
```

- Both values are working time of the task, measured along its scheduled `work` segments in the units of the plan's times: `workOffset` from the start of the task's work (default 0, a nonnegative integer) and `workDuration` from there (a positive integer, default the rest of the work). Calendar breaks, pauses and leveling splits are skipped, so a 30-minute part that reaches lunch continues after lunch. `assignmentWorkPeriods(work, assignment)` returns the elapsed periods of the part.
- The part is relative to the task, so it moves with the task. Capacity periods, in contrast, are fixed in absolute time: use them for what the resource can supply when, and partial assignments for what a task needs during its work.
- A part that reaches beyond the task's work is clipped to it. A part that starts at or after the end of the work takes no capacity. This keeps an assignment valid when the task gets shorter. Negative or fractional values, or a `workDuration` of 0, throw a RangeError. `levelResources` also requires both values to be multiples of the quantum.
- `calculateResourceLoad` adds the assignment's units only during its part, and lists the task in a segment's `taskIds` only there. Offsets count from the start of the whole work even when `range` starts later.
- `levelResources` checks and reserves each resource only during its part of the work at each candidate placement. Two tasks that each need the single operator for their first hour can overlap after that hour. A `splittable` task pauses only where a resource it needs at that point of its work is short. A manual task is checked only over each part.
- `projectResourceTimeline` shows the whole task on the row of a partially assigned resource: a bar is the task, not the part. The load is computed from the scheduled tasks and the assignments, so nothing is counted twice. Use `assignmentWorkPeriods` to draw the part yourself, for example as `segments` of that projection. A replacement with `proposeResourceAssignment` keeps the part.

Leveling remains the heuristic described in [Level resources](#level-resources): with time-varying capacity and partial assignments it still places one task at a time at its earliest feasible start, and does not search for an optimal plan.

### Other functions that read resources and assignments

| Function | Capacity periods and partial assignments |
| --- | --- |
| `calculateResourceLoad`, `levelResources` | Use both, as described above |
| `toPlanningDiagnostics` | Reads the overload of each load segment, which already reflects both |
| `buildPlacementInput` | Copies resources and the assignments of placed tasks unchanged |
| `projectResourceTimeline`, `proposeResourceAssignment` | Accept partial assignments; one bar per assignment for the whole task; a replacement keeps the part |
| `parseWeaveSnapshot`, `restoreWeaveSnapshot` | A planning snapshot keeps both and reports invalid values as `structure` diagnostics |
| `resourceLoadFromMsProject`, `timelineFromMsProject` | Never produce them: the Microsoft Project import does not read resource availability tables or assignment contours |

<!-- #endregion capacity -->

<!-- #region calendars-and-modes -->

## Time-zone calendars

`buildWorkPeriods(range, { weekly, timeZone, exceptions })` reads shift minutes as local wall-clock times in an IANA time zone such as `America/New_York`, `Europe/Berlin` or `Asia/Tokyo`. Civil dates, weekdays and exception dates are local to that zone. The zone rules come from `Intl.DateTimeFormat`, so the function has no dependencies and runs in Node.js, workers and browsers. Results depend on the time-zone data of the runtime.

- `timeZone` and `utcOffsetMinutes` cannot be combined. An unknown or empty zone name throws `RangeError`.
- A shift keeps its wall-clock times, so its elapsed length changes when it crosses a transition. A 22:00–06:00 night shift lasts 7 hours on a spring-forward night and 9 hours on a fall-back night.
- A wall time skipped by a spring-forward gap resolves to the transition instant, the first valid local time after it. A shift that lies entirely within a gap therefore disappears. In New York on 8 March 2026, a 02:30–04:00 shift becomes 03:00–04:00 EDT.
- A wall time that occurs twice during a fall-back overlap resolves to its earlier occurrence. In New York on 1 November 2026, a 01:30–02:30 shift runs from 01:30 EDT to 02:30 EST, which is 2 hours.
- A shift end of 1440 or later uses the next local midnight. The 3,661 civil date limit also applies.

`calendarBands(range, unit, { timeZone })` uses the same rules for chart header bands: days, weeks, months and years start at local midnight (or at the end of a gap that skips it), and hour bands follow local hours, so a 23-hour day has 23 hour bands and a 25-hour day 25. Header bands built this way stay aligned with the working periods of the same zone. See [Timeline editing helpers](api.md#timeline-editing-helpers) for the details.

```ts
const zone = 'Europe/Berlin'
const periods = buildWorkPeriods(range, { weekly, timeZone: zone })
const headerBands = [calendarBands(range, 'day', { timeZone: zone }), calendarBands(range, 'hour', { timeZone: zone, step: 6 })]
```

## Diagnose failures

A `cycle` failure lists `cycles`. Each entry is a strongly connected group of tasks: `taskIds` in input order, and `dependencyIds`, the links between members, in input order. Every listed link lies on at least one cycle. A self-link (a link from a task to itself) forms a group with one task. `validateTimelineData` rejects such a link between bars with an Error, so it reaches `scheduleTasks` only when the links are built some other way; `scheduleToGraph` and `toMsProjectXml` also reject it with an Error. Tasks that only depend on a cycle are not listed. Entries are ordered by the input position of their first task. Detection is iterative, so long cycles do not exhaust the call stack.

An `infeasible` failure names the first task without a feasible slot and the bounds that conflict. `constraints` holds the names of the binding bounds in this fixed order: `range`, `startNoEarlierThan`, `startNoLaterThan`, `finishNoEarlierThan`, `finishNoLaterThan`, `fixedStart`, `deadline`, `projectFinish` and `calendar`. `dependencyIds` lists the binding links in input order. A bound is binding when it sets the effective lower or upper limit that cannot be met. The horizon (`range`) is listed only when no other bound sets the same limit. `calendar` is added when the numeric bounds could be met in continuous time but the task's working time, including its pauses, has no slot between them. For example, a 5-unit task with a deadline of 4 reports `['range', 'deadline']`, and a fixed start in a break reports `['fixedStart', 'calendar']`.

## As late as possible

Set `mode: 'alap'` on a task to place it as late as possible. The default is `'asap'`. Semantics:

1. The forward and backward passes are unchanged. Every task's earliest dates, latest dates, `totalFloat`, `workFloat`, `critical` flag, the project `finish` and `criticalDependencyIds` are the same as with `'asap'`.
2. ALAP tasks are then placed in reverse dependency order. Each one gets the latest slot on its own calendar that satisfies its own bounds, the deadline, the project finish and every outgoing link measured against the successor's placed dates. ASAP successors stay at their earliest dates, and ALAP successors use the dates placed for them.
3. ALAP placement therefore uses only free float and never moves another task or the project finish. An ALAP task whose ASAP successor starts right after it stays at its earliest dates. A chain of ALAP tasks moves together toward its latest dates.
4. `start`, `end` and `work` report the placed dates. ALAP tasks also report `earliestStart` and `earliestEnd`. Float stays measured from the earliest dates. ASAP tasks have no extra fields.
5. Lower bounds still apply. `fixedStart` keeps the task fixed. `startNoLaterThan`, `finishNoLaterThan` and the deadline cap the placement. On a calendar, the latest slot ends on a working tick and can span breaks.

## Manual and inactive tasks

Two task fields mirror Microsoft Project. They are opt-in: a plan without them schedules every task automatically and as active, and its result has neither `manualConflicts` nor `inactiveTaskIds`.

```ts
const plan = scheduleTasks({
  range: { start: 0, end: 30 },
  tasks: [
    { id: 'order', duration: 5 },
    { id: 'install', duration: 4, manual: { start: 3, end: 8 } },
    { id: 'test', duration: 2 },
    { id: 'option', duration: 6, inactive: true },
  ],
  dependencies: [
    { id: 'order-install', from: 'order', to: 'install' },
    { id: 'install-test', from: 'install', to: 'test' },
    { id: 'option-test', from: 'option', to: 'test' },
  ],
})
// install stays at [3, 8) although order finishes at 5: manualConflicts is [{ taskId: 'install', dependencyId: 'order-install' }].
// test follows install to [8, 10). option and its link take no part, and inactiveTaskIds is ['option'].
```

**Manually scheduled tasks.** `manual: { start, end }` is a `TimeRange` of manually scheduled dates in elapsed time, like a manually scheduled task in Microsoft Project:

1. The task stays at exactly `[manual.start, manual.end)`. Its predecessors, its own bounds (`startNoEarlierThan`, `startNoLaterThan`, `finishNoEarlierThan`, `finishNoLaterThan`, `fixedStart`), `mode` and its calendar do not move it, and `duration` is ignored. Equal dates make a milestone. Both dates must align with the horizon and quantum and lie inside `range`, with `end >= start`; otherwise a `RangeError` is thrown. A value that is not an object throws an Error.
2. Its `work` is the working time of its calendar, after its pauses, inside its dates. Dates in time off give an empty `work`, which takes no capacity.
3. Links into it bind nothing in the forward pass, the backward pass or ALAP placement, so a manual task never makes a predecessor infeasible or limits its float. They still count for cycle detection. Each link into it that its dates violate is listed in the result's `manualConflicts` as a `ScheduleManualConflict` (`{ taskId, dependencyId }`), in link order. A link is violated when the manual start (SS, FS) or finish (FF, SF) is before the predecessor's start or finish in the result plus the lag, compared in elapsed time. An ALAP predecessor stops at a link into a manual task when its earliest dates already meet that link, so its placement adds no conflict; otherwise the link is ignored for it too.
4. Links from it bind its successors like any other link, and the project `finish` includes its end, which gives other tasks float.
5. Its result entry has `manual: true`, its own dates as `latestStart` and `latestEnd`, `totalFloat` and `workFloat` 0 and `critical: false`, so links that touch it are never in `criticalDependencyIds`. `scheduledBarFields` turns it into a bar without a float line.
6. A manual task that ends after the input `deadline` makes the plan `infeasible`, with `constraints: ['deadline']` and no dependencies.
7. With `{ explain: true }`, the trace has one `manual` reason per phase (`earliest`, `latest` and, in `levelResources`, `leveling`). Successors' dependency reasons point to it as their parent.

**Inactive tasks.** `inactive: true` leaves a task out of the calculation, like an inactive task in Microsoft Project. The task, every link that touches it (in either direction) and its resource assignments are ignored, and it is not in the result's `tasks`; the result lists it in `inactiveTaskIds`. It is still validated like any task, its ID still counts for duplicates, and links and assignments may name it without an unknown-task error. A cycle through an inactive task is no cycle. The flag must be a boolean (Error).

| Function | Manual tasks | Inactive tasks |
| --- | --- | --- |
| `scheduleTasks` | Kept at their dates; violated links in `manualConflicts` | Left out, with their links; listed in `inactiveTaskIds` |
| `propagateEdit` | An edit moves the manual dates (see [Propagate an edit](#propagate-an-edit)) | Editing one throws an Error |
| `levelResources` | Never moved. Their capacity is reserved first, before any other task; one that finds too little capacity at its dates keeps them and is listed in `unresolvedTaskIds`, with its overload in `overloads` | Left out with their assignments |
| `rescheduleFromStatusDate` | Keep their dates whatever their progress | Progress entries are accepted and ignored |
| `rescheduleFromActuals` | Keep their manual dates; their actuals are kept, checked and reported, and `remaining` is empty | Actuals entries are validated and ignored |
| `calculateResourceLoad` | Their `work` counts like any other | Pass `{ inactiveTaskIds: result.inactiveTaskIds }` so their assignments take no capacity instead of throwing |
| `buildPlacementInput` | A link from an unplaced task into a placed manual task is excluded without a diagnostic | Links that touch them are excluded without a diagnostic |
| `scheduleToGraph` | A node with zero float, never critical | Left out with the links that touch them |
| `toPlanningDiagnostics` | Each conflict is a `manual-conflict` warning, listed first | Not listed |
| Snapshots | Stored and restored as they are | `inactive` must be a boolean |

`fromMsProjectXml` reads both flags from Microsoft Project files (`Manual` 1 and `Active` 0). Its tasks have `manual: true` rather than dates, so pass `{ start: task.start, end: task.end }` as `ScheduleTask.manual`; see [Microsoft Project import](api.md#microsoft-project-import).

## Summary tasks

`ScheduleTask.parentId` makes a task a subtask of another task, which becomes a summary task. The hierarchy is opt-in: a plan without `parentId` has no summary tasks, and its result has neither `summary` nor `parentId` fields. Summaries can be nested to any depth; the calculation uses loops, not recursion.

```ts
const plan = scheduleTasks({
  range: { start: 0, end: 100 },
  tasks: [
    { id: 'design', duration: 2 },
    { id: 'build', duration: 0 },                    // a summary: its duration is ignored
    { id: 'frame', duration: 3, parentId: 'build' },
    { id: 'wiring', duration: 1, parentId: 'build' },
    { id: 'inspect', duration: 1 },
  ],
  dependencies: [
    { id: 'design-build', from: 'design', to: 'build' }, // binds frame and wiring
    { id: 'build-inspect', from: 'build', to: 'inspect' }, // waits for the later of the two
  ],
})
// build [2, 5) with summary: true; frame [2, 5) and wiring [2, 3) with parentId 'build'; inspect [5, 6).
```

**Dates.** A summary's `start` and `end` are the earliest start and the latest finish of its subtasks, after ALAP placement; `latestStart` and `latestEnd` span their latest dates the same way. Its own `duration`, `calendarId`, `pauses`, `splittable` and `priority` are ignored (they are still validated), and its `work` is empty, so it takes no resource capacity. A summary whose subtasks are all inactive is inactive itself, and an inactive summary makes all of its subtasks inactive; both are listed in `inactiveTaskIds`.

**Links into a summary** (the summary is the successor) follow Microsoft Project:

- FS and SS links bind the start of every leaf subtask, at any depth, as if the link were drawn to each of them. Each subtask still has its own links and bounds.
- FF and SF links into a summary throw an Error. Microsoft Project does not allow them either: a summary's finish is the result of its subtasks, not something a link can push. Link to the subtask that should finish instead.
- A manual subtask keeps its dates; each link into its summary that they violate is listed in `manualConflicts` with the subtask's ID.

**Links from a summary** (the summary is the predecessor) use its rolled-up dates: FS and FF the finish of its latest subtask, SS and SF the start of its earliest subtask. Any link type may start at a summary.

**Constraints.** A summary's `startNoEarlierThan` binds the start of every subtask and its `finishNoLaterThan` the finish of every subtask; nested summaries combine theirs. When a subtask cannot meet an inherited bound, the `infeasible` failure names the subtask and the constraint, and with `explain` the `constraint` reason has the summary in `relatedTaskIds`. `fixedStart`, `startNoLaterThan`, `finishNoEarlierThan`, `manual` and `mode: 'alap'` on a summary throw an Error, because they would hold only one of its subtasks. Put them on the subtasks.

**Backward pass, float and critical path.** The backward pass works on the subtasks. An FS or FF link from a summary gives every subtask a latest finish; an SS or SF link from a summary gives a latest start only to the subtasks whose earliest start is the summary's earliest start, because only they start the summary (the others may slip without moving it). A summary's `totalFloat` and `workFloat` are the smallest of its subtasks that are not manual, or 0 when all of them are manual, and it is `critical` when any subtask is critical. A link into a summary is in `criticalDependencyIds` when both ends are critical and it binds a critical subtask.

**Validation and cycles.** These throw an Error that names the tasks: a `parentId` that is not a non-empty string, an unknown parent (`Unknown parent task x of task a`), parent IDs that form a cycle (`The parent IDs of these tasks form a cycle: a → b → a`), and a link between a summary and one of its own subtasks, in either direction (`Dependency l links summary task S with its own subtask a`). Inactive tasks are validated too. A summary's dates depend on all of its subtasks, so a chain of links from a subtask back to its summary (for example `S → x` and `x → a` with `a` in `S`) is a `cycle` failure listing the summary, the subtask and the links, like any other cycle; `toPlanningDiagnostics` reports it as `schedule-cycle`.

**Draw the links.** GanttChart draws links to and from a summary task with the opt-in `summaryDependencies` prop, together with `showSummaries`. Give the summary task a row and no bar (`rowId: task.id` for the other tasks, as in [Show a plan in GanttChart](#show-a-plan-in-ganttchart)), and pass the same `dependencies`: an end that names the summary is drawn to the start or finish edge of its rollup bar, following the link type, and it moves with the subtasks. Highlight the plan's `criticalDependencyIds` as for other links. Without `summaryDependencies` the chart rejects such links as unknown endpoints. With `connectable`, the rollup bar gets link handles too; the chart proposes any type and any pair, so reject FF and SF links into a summary and links between a summary and its own subtasks in `validateConnection` (or report the Error `scheduleTasks` throws). See [Dependencies on summary rows](api.md#dependencies-on-summary-rows).

```ts
const bars = plan.tasks.filter(task => !task.summary).map(task => ({ id: task.id, rowId: task.id, label: labels.get(task.id)!, ...scheduledBarFields(task) }))
// <GanttChart :rows="rows" :bars="bars" :dependencies="dependencies" show-summaries summary-dependencies
//   :highlighted-dependency-ids="new Set(plan.criticalDependencyIds)" />
```

**Progress.** The scheduler does not take progress for a summary. Use `summarizeTimelineRows` to roll up the progress of the bars below a GanttChart row; it weights each subtask by its length.

| Function | Summary tasks |
| --- | --- |
| `scheduleTasks` | Dates, latest dates, float and critical flag rolled up from the subtasks; `summary: true`, and `parentId` on subtasks |
| `propagateEdit` | Editing a summary throws an Error: edit its subtasks, and `changes` lists the summaries whose rolled-up dates move with them |
| `rescheduleFromStatusDate` | Progress entries for summaries are accepted and ignored. A started or finished subtask no longer inherits the start bounds of its summaries (links into them and their `startNoEarlierThan`), like its own; unstarted subtasks still do |
| `rescheduleFromActuals` | Actuals entries for summaries throw an Error: record them on the subtasks. A summary rolls up the actual and forecast dates of its subtasks, so it starts at the earliest actual start. A started or finished subtask no longer inherits the start bounds of its summaries, as with `rescheduleFromStatusDate` |
| `levelResources` | Levels the subtasks; summaries roll up from the leveled subtasks, are never delayed themselves and are not listed in `delays`. Assignments to a summary are accepted and take no capacity |
| `calculateResourceLoad` | A summary's `work` is empty, so its assignments take no capacity |
| `buildPlacementInput` | A placed subtask whose summary is not placed moves to its nearest placed ancestor, or to the top level, and keeps what binds it: the `startNoEarlierThan` and `finishNoLaterThan` of the skipped summaries become its own where tighter, an inactive one makes it `inactive: true`, and an FS or SS link into the unplaced summary binds the placed leaf subtasks (one link per leaf in `retargetedDependencies`, or an `unplaced-predecessor` diagnostic per leaf when the link comes from an unplaced task). A link from an unplaced summary is an `unplaced-predecessor` diagnostic, because its rolled-up dates are not in the plan. A placed summary that is active in the full plan but has no placed active leaf subtask (all its active subtasks are unplaced, even if inactive subtasks are placed) has nothing placed to span: it is an `unplaced-subtasks` diagnostic, the result is not `ok`, and it is left out like an unplaced summary instead of being scheduled with its own `duration`. The summary rules above are checked on the whole input, so an input that `scheduleTasks` rejects throws the same Error whichever tasks are placed |
| `scheduleToGraph` | A summary is a node like any other, with its rolled-up dates and float |

## Split work

Work on a calendar is already split at non-working time. The result's `work` array lists each worked segment, while `start` and `end` cover the elapsed span. To interrupt a single task, give it `pauses`: elapsed half-open intervals in which that task does no work. Pauses are removed from the task's working time on its calendar. They must align with the quantum, can overlap breaks or one another, and are clipped to the horizon. A task with `duration: 4` and a pause `[2, 3)` works `[0, 2)` and `[3, 5)`. Its FS successors start at 5. A fixed start inside a pause is infeasible.

`splittable: true` lets `levelResources` add pauses to a task. `scheduleTasks` ignores `splittable` and `priority`.

<!-- #endregion calendars-and-modes -->

<!-- #region leveling-and-analysis -->

## Level resources

`levelResources({ ...scheduleInput, resources, assignments })` returns a schedule in which assigned load stays within capacity wherever a permitted delay allows. It uses the same resource and assignment rules as `calculateResourceLoad`, and resource periods must also align with the quantum. It is a deterministic serial heuristic, not an optimizer:

1. It schedules the input with every task as soon as possible. A cycle or infeasible input returns that failure unchanged.
2. It calculates latest dates for every task without the project finish, so a task can move later only while all of its successors stay feasible.
3. It places tasks one at a time. The next task is the highest-ranked task whose predecessors are all placed. The rank uses the higher `priority` first (default 0), then the smaller unleveled `totalFloat`, then the earlier unleveled start, then the task ID in code-unit order.
4. Each task gets the earliest start that its placed predecessors, own bounds and calendar allow and at which its assigned resources have enough remaining capacity for all of its work. A `splittable` task instead takes the earliest working units that have capacity and can pause in between. Milestones and tasks without assignments do not wait for capacity.
5. A task with no capacity-feasible placement before its latest dates stays at its earliest dates. It is listed in `unresolvedTaskIds`, and its overload remains.

Manual tasks are placed before every other task, at their manual dates, and never move; a manual task whose dates lack capacity is listed in `unresolvedTaskIds`. Inactive tasks and their assignments are ignored.

The result has the fields of a successful `scheduleTasks` result for the leveled plan, plus:

- `leveledTasks`: the input tasks with a `startNoEarlierThan` at the leveled start for delayed and split tasks, and added `pauses` for split tasks. Split tasks are pinned even when they start at their earliest date, so an end bound cannot pull their work away from the reserved capacity. `scheduleTasks` reproduces the same dates from them. Persist these when you accept the plan.
- `delays`: each task whose dates or work changed, in input order, with `before` and `after` intervals, `delay` (`after.start - before.start`, in elapsed units), the added `pauses`, and `cause`. The cause is `capacity` when leveling constrained the task itself, and `predecessor` when only a dependency moved it.
- `overloads`: the overloaded segments of `calculateResourceLoad` for the leveled plan. The list is empty when every task was resolved.
- `unresolvedTaskIds`: tasks that kept an overload, in input order.

Capacity periods and partial assignments take part in steps 4 and 5: a task needs each resource only during its part of the work, against the capacity valid at each time. See [Compare demand with capacity](#compare-demand-with-capacity).

Leveling ignores `mode` and omits it from `leveledTasks`, because placing a task later after capacity is reserved would reintroduce conflicts. The deadline, the horizon and every task bound remain hard limits. The unleveled project finish is not a limit, so the leveled `finish` can be later. `calculateResourceLoad` remains the diagnostic for any plan.

## Try the demo

Open **Scheduling** and focus **Cut order A**. Press Right Arrow once to move its requested start from 08:00 to 09:00. Inspection moves to 13:00, projected finish moves from 16:00 to 17:00, and the CNC overlap grows from one to two resource-hours. Press Right Arrow again to see packing finish on 11 November after the 10 November closure. Further moves beyond the horizon leave the accepted plan on screen. **Reset schedule** restores the original dates.

Check **Summary task links** to add a small plan with a summary task. Its links end at the **Build phase** rollup bar; drag **Frame** to move the rollup bar and its links, select a link with Enter and remove it with Delete, or drag from a rollup handle to add one. FF and SF links into the summary are rejected with a message.

The status date slider (09 Nov 12:00 by default) draws the status-date line, and **Show progress line** draws the progress line from the reported progress: cutting order A is done, B is half done and inspection a quarter done. **Reschedule from status date** applies `rescheduleFromStatusDate`: B keeps its first hour and finishes after lunch, inspection keeps its first half hour and continues at 13:00, and packing moves to 14:30–16:30. At 09 Nov 08:00 the done hour of cutting order B cannot fit before the status date, so the demo catches the `RangeError` and reports it instead of changing the plan. The next edit recalculates the plan from the requested starts. **Export MS Project XML**, **Export iCalendar** and **Export CSV** save the current plan with `toMsProjectXml`, `toICalendar` and `toCsv`, and **Network diagram** shows it as a NetworkGraph built with `scheduleToGraph`.

Drag **Cut order A** two hours to the right with the pointer: while it is held, dashed outlines show inspection and packing at the dates `propagateEdit` computes for the new start, and the bars stay where they are. Release to accept the move and the cascaded operations as one batch; Escape discards the preview. A requested start inside the lunch break or on the closed day is previewed from the next working time, as the scheduler places it.

The link from **Cut order B** to packing has a two-hour lead (`lag: -2 * hour`), labelled `−2 h`: packing may overlap the last two hours of cutting order B. It does not bind in the original plan. Drag **Cut order B** five hours later, to 15:00–17:00: the preview moves packing to 15:00, two hours before B finishes, and releasing it applies the same dates. Without the lead packing would wait for 17:00 and move past the closure.

The demo shades breaks, nights and the closed date with `invertWorkPeriods` and builds its bars with `scheduledBarFields`. Inspection crosses the lunch break, so it is drawn as two work pieces. Critical tasks have a red outline, **Cut order B** shows its float as a thin line, and packing has a dispatch deadline at 17:00 on 9 November. After the second move, packing is split by the closure and marked late. Clear **Shade non-working time** or **Show critical path and float** to hide these layers, and use **Export schedule SVG** to save the chart with them.

Check **Show scheduling constraints** (off by default) to give packing a hard `finishNoLaterThan` at the 17:00 cut-off, which the scheduler applies, unlike the display-only deadline, and to show the requested start of each cutting order as a `startNoEarlierThan` handle. Drag the handle of **Cut order B** from 10:00 to 13:00: the demo applies the `constraint-edit` proposal to its tasks and reschedules. Drag it three hours further: packing can no longer finish by 17:00, so the demo shows the scheduler's diagnostic, "Infeasible: Pack order A cannot meet its finish no later than with the link Cut order B → Pack order A", and keeps the plan. Focus the handle to move it with the arrow keys or remove it with Delete. With the option on, **Export MS Project XML** writes packing's constraint as `ConstraintType` 7.

Check **Schedule inspection manually** to give inspection `manual` dates at its current plan. Its bar turns violet, shows no float and is never critical, and the Float column reads "manual". Move **Cut order A** later: inspection stays where it is, and the **Manual date conflicts** list names the link it now breaks (`manualConflicts`). Drag or resize the inspection bar instead: `propagateEdit` moves its manual dates, packing follows, and the conflict clears once the link is met again. A manual task keeps its elapsed length when moved, so moving it across the lunch break changes its work hours. Check **Cancel order B (inactive)** to make cutting order B `inactive`: its bar stays as a pale placeholder at its last dates, its links leave the chart and the network diagram, its CNC load leaves the load view (`calculateResourceLoad` with `inactiveTaskIds`), **Export MS Project XML** writes it with `Active` 0, and iCalendar leaves it out. **Reset schedule** turns both options off.

Terminology references include [Microsoft Project dependency types](https://support.microsoft.com/en-us/project/predecessors-task-field) and [critical-path guidance](https://support.microsoft.com/en-gb/project/manage-your-project-s-critical-path?nochrome=true).

## Resource rows and unplanned tasks

A resource view shows each resource as a GanttChart row and each assignment as a bar. Build it with `projectResourceTimeline` from the placed tasks, the resources and the assignments, and keep the tasks and assignments as the data you edit and save. A task on two resources has two bars but is still one task: compute the load with `calculateResourceLoad` from the scheduled tasks and the original assignments, never from the projected bars.

```ts
import { createResourceTimelineProjector, resolveResourceTimelineEdit, scheduledBarFields } from '@eightkk/vue-weave/core'

const project = createResourceTimelineProjector()
const projection = project({
  resources: [{ id: 'cnc', label: 'CNC' }, { id: 'press', label: 'Press' }],
  tasks: schedule.tasks.map(task => ({ id: task.id, label: names[task.id], ...scheduledBarFields(task) })),
  assignments,
  dependencies: links,
})
// <GanttChart :rows="projection.rows" :bars="projection.bars" :dependencies="projection.dependencies"
//   :lane-count="projection.laneCount" row-draggable @edit="onEdit" />
```

Keep the arrays you pass to the projector unchanged between renders: a new `bars` array cancels a drag in progress, and the projector returns the previous projection while its inputs are the same objects.

Edits arrive as ordinary `edit` events. `resolveResourceTimelineEdit` turns a horizontal move or resize into a task date change, which applies to every projection of the task, and a move to another row into an assignment replacement; a diagonal move gives both, which you accept or refuse together as one history step. A move to a resource the task already has is rejected. Removing a bar from a row is a choice between removing the assignment (`proposeResourceAssignment` with `kind: 'remove'`) and removing the task. After a replacement the bar ID changes to `resourceTimelineBarId(taskId, newResourceId)`. For cascade previews, pass `resourceTimelineCascade(projection, input)` as `cascade`: it runs `propagateEdit` on task IDs and maps the result back to every projection.

### Chart links and scheduler links

`ScheduleLink` and `TimelineDependency` share a shape, so a task chart can use one array for both. A resource view cannot: chart links connect bar IDs and scheduler links connect task IDs. Pass the task links to the projection and the scheduler, and the projection's `dependencies` to the chart. Each task link is drawn once, between representative projections (the preferred bars you pass, else the first row of each task); `dependencyOrigins` maps it back and `omittedDependencyIds` lists the links whose other projection pairs are not drawn.

### Unplanned tasks

An unplanned task is a task without dates, not a missing task. Do not give it invented dates. Pass its ID in `unplannedTaskIds`, where its assignments and links are accepted but not drawn, and leave it out of the scheduler with `buildPlacementInput(input, placedTaskIds)`. (A task that has dates but should not count is an `inactive` task instead; see [Manual and inactive tasks](#manual-and-inactive-tasks).) The scheduler and `calculateResourceLoad` throw for links and assignments to tasks they do not have; `buildPlacementInput` removes the unplaced tasks, their links and their assignments, so unplanned work does not count towards the load. A placed task whose predecessor is unplaced is reported as an `unplaced-predecessor` diagnostic and the result is not `ok`: refuse the placement, or place the predecessor too, instead of showing a plan that ignores the link.

### Leveling previews

`levelResources` ignores `mode`, so an ALAP task is previewed at its earliest leveled dates. When a placement or edit preview shows a plan, say whether it came from `scheduleTasks`, which does not resolve capacity, or from `levelResources`, and decide explicitly whether an overload is allowed, a warning or a reason to refuse.

## Explain a plan

Pass `{ explain: true }` as the second argument of `scheduleTasks` or `levelResources` to get a `trace` with the reasons for each task's dates. The calculation is the same: the reasons are recorded where the normal passes place each task, and without the option no reason is created and the result is unchanged.

```ts
import { collectScheduleReasons, scheduleTasks, toPlanningDiagnostics } from '@eightkk/vue-weave/core'

const plan = scheduleTasks(input, { explain: true })
if (plan.ok) {
  const why = collectScheduleReasons(plan.trace, 'B', { phases: ['earliest'] })
}
const problems = toPlanningDiagnostics(plan)
```

A task with `manual` dates has a `manual` reason in each phase instead of bounds, because nothing else places it. Each reason belongs to a phase. `earliest` is the forward pass and records the lower limits that set each task's earliest start or finish. `latest` is the backward pass and records the upper limits from successors, the project finish and the task's own bounds. `placement` records why an ALAP task was placed where it is. `leveling` records the limits and the capacity shortages met while `levelResources` reserved capacity; its `latest` reasons are those of the leveling horizon, which ignores the project finish.

For example, with A and B of duration 2, an FS link with lag 1 and a calendar with working time [0, 3) and [5, 12), B's candidate start is 3. Time 3 is not working time, because [0, 3) is half-open, so B starts at 5. The trace holds a `dependency` reason (candidate 3, placed 5, parent: A's reason) and a `calendar` reason (3 to 5). A pause that moves the task further is a separate `pause` reason, so calendar time off and the task's own pauses can be told apart. Lag is elapsed time, so the candidate is the predecessor's end plus the lag before any calendar applies.

When several limits are equal, all are reported, for example two FS predecessors that finish together. `range` is reported only when no other bound has the same value, as in failures.

Leveling records why it delayed or split a task as `capacity` reasons with the resource, the interval, the units needed, the capacity there and the tasks that already held it. They are recorded in the reservation loop, not taken from the replayed `scheduleTasks` run, so the `startNoEarlierThan` that leveling adds to `leveledTasks` is never reported as the cause. Adjacent shortages of one resource with the same capacity form one reason whose `range` covers them all and whose `relatedTaskIds` name every task holding the resource in it, in the order leveling placed them. A task that waits behind many short reservations therefore gets one reason per resource and run of equal capacity, not one per reservation; a change of capacity, a stretch with enough capacity left, or time outside the task's working time starts a new reason. A delay with `cause: 'capacity'` can also have dependency reasons when a predecessor moved too. A task that is listed in `unresolvedTaskIds` is not resolved even though the result is `ok: true`: do not show such a result as free of capacity conflicts. `toPlanningDiagnostics` lists it as `leveling-unresolved` next to its `resource-overload` segments.

Keep the three kinds of deadline apart:

- `ScheduleInput.deadline` is a hard limit on the whole project. It is reported as the `deadline` constraint and a `project-bound` reason.
- `ScheduleTask.finishNoLaterThan` is a hard limit on one task, reported as a `constraint` reason.
- `TimelineBar.deadline` is only drawn by GanttChart and never takes part in scheduling.

`toPlanningDiagnostics(result, load?)` lists cycles and infeasible tasks of a failure, or unresolved tasks and overloaded segments of a success. Each entry of `manualConflicts` becomes a `manual-conflict` warning (the task, then the link), listed before the unresolved tasks and overloads; the plan is still valid, so it is not an error. Its `reasonIds` hold the task's `manual` reason of the `earliest` phase when the result was calculated with `explain`. A failure lists only its own problems, so an earlier successful plan is never shown as current. `propagateEdit` and `rescheduleFromStatusDate` do not take the option.

## Compare plan scenarios

`comparePlans(current, candidate)` compares a candidate plan with the current plan, for example after equipment maintenance is planned and the planner tries to push work later on the same equipment or to move it to other equipment. Keep three layers apart:

- **Input**: each plan is a `PlanScenario` whose `input` is the `scheduleTasks` input with optional `resources` and `assignments`. The candidate is a separate draft of the input; the current plan stays where it is (in `useEditHistory` or `useEditTransaction`) and does not change while comparing.
- **Computed result**: each side's schedule and load. Pass a precomputed `result` (for example from `levelResources`) and `load`, or let `comparePlans` calculate `scheduleTasks(input, { explain: true })` and `calculateResourceLoad`. The comparison itself is computed too: recalculate it whenever either plan changes, never store it.
- **View projection**: `planComparisonTargets` turns compared tasks into the targets of the existing highlight props through your view bindings, and `planBaselines` turns the current plan into a baseline set for the candidate's bars.

```ts
import { comparePlans, planBaselines, planComparisonTargets, scheduleTasks } from '@eightkk/vue-weave/core'

const comparison = comparePlans(
  { input: currentInput, revision: acceptedVersion },
  { input: candidateInput, baseRevision: candidateBaseVersion },
)
comparison.input.tasks.changed            // [{ id: 'cutA', fields: ['startNoEarlierThan'] }]
comparison.input.resources.changed        // [{ id: 'cnc', fields: ['periods'] }]
comparison.result.editedTaskIds           // tasks the planner changed (fields or assignments)
comparison.result.consequenceTaskIds      // tasks with unchanged input whose dates, critical flag or state moved
comparison.result.finish                  // { current, candidate, shift }
comparison.result.overload                // cumulative overload per resource, both sides

// Draw the current plan under the candidate bars with the existing baseline sets.
const before = planBaselines(scheduleTasks(currentInput), 'current')
const bars = candidateTasks.map(task => ({ ...barOf(task), baselines: [before.get(task.id)!] }))
// <GanttChart :bars="bars" :baseline-ids="['current']" ... />
```

What the comparison means:

- A task is **edited** when its own fields or its assignments differ (or it was added or removed). A task whose input is unchanged but whose result differs is a **consequence**. A changed dependency, calendar or resource is reported in `input` but does not make a task edited.
- When one side has no schedule (a cycle, or an infeasible plan such as a missed project `deadline`), `result.state` says so, `result.comparable` is false and the input differences are still returned; nothing throws. Its finish is undefined.
- Invalid input throws the scheduler's own error (or that of the shared resource and assignment checks) with the side appended, for example `Duplicate task ID: a (candidate plan)`, so one message text covers both `scheduleTasks` and `comparePlans`. A side with a precomputed `result` is validated the same way, and a successful `result` must contain each active task of its input exactly once and list exactly its inactive tasks in `inactiveTaskIds`; otherwise `comparePlans` throws, for example `The result has no entry for task b, an active task of its input; recalculate it from this input (candidate plan)`. This catches a result calculated before a task was added, removed or (de)activated. It cannot catch a result for an older version of the same tasks, such as one calculated before a duration changed: recalculate the result whenever its input changes (or omit `result` and let `comparePlans` calculate it), and keep your own revision with both if they are stored apart. A failed result is checked only for its shape, and a `partial` side's result must come from the loaded input passed with it.
- Summary tasks are compared by their rolled-up dates, so a summary usually appears as a consequence of its subtasks. Manual tasks keep their dates; a link they now violate appears as a gained `manual-conflict` violation. Inactive tasks have the side state `inactive`.
- `deadline` violations come from `PlanComparisonTask.deadline`, a due time like `TimelineBar.deadline` that the scheduler ignores. The hard `ScheduleInput.deadline` and `finishNoLaterThan` make a plan infeasible instead.
- Cumulative overload is the sum of `overload * (end - start)` over one resource's load segments, in your capacity units times your time units. It is never summed across resources. A task assigned to two resources counts once in each resource and never twice in one; overlapping segments of one resource in a supplied `load` throw a RangeError.
- `reasons` are each side's own trace reasons of a task. They explain that plan's dates; they are not a claim that one change caused the difference.

### Adopting or discarding a candidate

The library leaves the decision to the application. The contract the demo follows:

1. Creating a candidate records the revision of the current plan it was derived from (`baseRevision`), and remembers the selection of the moment.
2. Comparing never changes the current plan. If the current plan advances (another planner's save, a server refresh), recalculate `comparePlans` against the new current plan; `comparison.revision.stale` is then true, and the candidate must not be adopted as it is.
3. Adopting is one bulk change: commit the whole candidate input with one `history.commit(...)`, or one `useEditTransaction.submit(changes)` with all changes, so that one Undo reverts the adoption.
4. Discarding drops the draft. The current plan was never touched; restore the remembered selection.
5. When a plan is only partly loaded (for example a windowed load of a large plan), set `partial: true` on that side. `comparison.complete` is then false; show the comparison as incomplete and do not adopt from it.

Try it in the demo: open **Linked views** and check **Compare plan scenarios**.

To compare other revisions that are not scheduler input, such as two versions of a bill of materials, a WBS or a product hierarchy, use `diffStructure(before, after, { key, parentKey?, fields?, equals? })`. It reports added and removed keys, the changed fields with their values in both versions and, with `parentKey`, the items that moved to another parent. Resolve effective dates first and diff the two resolved snapshots. See [Structure comparison](api.md#structure-comparison).

<!-- #endregion leveling-and-analysis -->
