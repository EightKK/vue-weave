# Scheduling and equipment load

The scheduling functions are available from `vue-weave/core` and the Vue package entry. The Gantt chart still renders the intervals supplied by its parent. Call the solver when an edit proposes a new constraint, then publish the accepted bars, links, and load data together.

## Calendar contract

A calendar contains an ID and absolute half-open work periods `[start, end)`. Overlapping or touching periods are combined. Missing periods represent time off. Work can span several periods, with gaps retained in the elapsed start/end span. The result's `work` array contains the segments that consume work or capacity.

Use `buildWorkPeriods(range, { weekly, utcOffsetMinutes, exceptions })` to expand weekly rules into epoch milliseconds in a fixed UTC offset. Weekdays run from Sunday (0) to Saturday (6). A shift starts at `startMinute` and ends at `endMinute` relative to the start of its local date. An end beyond 1440 continues into the next date. Shifts are at most 24 hours long. An exception replaces its entire civil date, including overnight carry-in. An empty exception closes the date. For a zone that observes daylight-saving transitions, pass an IANA `timeZone` instead of `utcOffsetMinutes`, as described in [Time-zone calendars](#time-zone-calendars).

## Calculate a plan

```ts
import { scheduleTasks, calculateResourceLoad } from 'vue-weave/core'

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
- Invalid references or values throw. Cycles return `{ ok: false, code: 'cycle', cycles }`. A task with no feasible slot returns `{ ok: false, code: 'infeasible', taskId, constraints, dependencyIds }`. See [Diagnose failures](#diagnose-failures). Failed results carry no partial dates. The solver accepts directed acyclic dependency graphs.
- The forward pass finds earliest dates. The backward pass holds the earliest project finish as its upper limit and finds latest dates. Total float is the task's own working time between those starts, or elapsed time for a milestone. workFloat is always working time on the task's calendar: it equals totalFloat for tasks and, for a milestone, the calendar's working time between its earliest and latest points. Use workFloat to compare milestones with tasks. A zero-float task is critical. A critical link binds two critical tasks after projecting the dependency endpoint onto the successor calendar. The result can contain multiple controlling chains and individually constrained critical tasks.

## Show a plan in GanttChart

`scheduledBarFields(task)` turns each task of a successful result into the bar fields the chart draws: `start` and `end`, `critical`, `latestEnd` for the float line and, when the work is split by breaks, closed dates or pauses, `segments` from the task's `work`. Spread it into a `TimelineBar` and add the fields the scheduler does not know, such as the row, label, tone, `editable` and an optional display `deadline`. `invertWorkPeriods(periods, range)` returns the time between the calendar's work periods, which the chart shades through `nonWorkingPeriods`.

```ts
import { buildWorkPeriods, invertWorkPeriods, scheduleTasks, scheduledBarFields, type TimelineBar } from 'vue-weave/core'

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

## Propagate an edit

`propagateEdit(input, edit)` answers "what else moves if this task moves?". `edit` is a `ScheduleEdit` with the task `id`, a new `start` and an optional new `end`. The function schedules a copy of the plan in which the task has `fixedStart` at the new start, replacing any fixed start it had. With `end`, the task's working duration becomes the working time in `[start, end)` on its own calendar, after its pauses, so resizing a bar across a break keeps only the working hours. Every other bound of the task, every dependency, the horizon and the deadline still apply. The input is not modified.

```ts
import { propagateEdit } from 'vue-weave/core'

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

## Reschedule from a status date

`rescheduleFromStatusDate(input, statusDate, progress)` updates a plan after progress has been reported at a status date. `progress` is a `ReadonlyMap` from task ID to the completed share of its working duration, from 0 to 1; a task without an entry has progress 0. The current dates are those of `scheduleTasks(input)`; when that fails, its failure is returned.

- **Progress 1.** The task keeps its current dates, even when they lie after the status date.
- **Progress between 0 and 1.** The done work is `progress × duration` rounded down to whole quanta (a value just below 1 still leaves one quantum). It stays where it is, from the current start. When that would carry it past the status date (the task is ahead of plan or started early), it is placed so that it ends at the status date instead. The remaining work is scheduled at or after the status date on the task's calendar. When time is left between the two parts, the task is split: its `work` lists both parts, and `scheduledBarFields` turns them into `segments`. Internally the gap becomes a pause of the task. A task whose done work rounds down to zero, and a milestone, is treated as not started.
- **Progress 0.** The task starts no earlier than the status date, in addition to its own bounds and dependencies.

A started or finished task is pinned at its start with `fixedStart`: its incoming dependencies, `startNoEarlierThan`, `startNoLaterThan`, previous `fixedStart` and `mode` no longer apply, because its start has happened. Its finish bounds (`finishNoEarlierThan`, `finishNoLaterThan`, the deadline) and its outgoing dependencies still apply, so successors follow the new finish. Unstarted tasks keep every bound and dependency; an unstarted task with a `fixedStart` before the status date makes the plan infeasible, which is returned as an `infeasible` failure. The result is the `ScheduleResult` of the adjusted plan. Dependencies into started tasks are left out of it, so they never appear in `criticalDependencyIds`. The input is not modified.

```ts
import { rescheduleFromStatusDate } from 'vue-weave/core'

// Continuous time: a (10 units) → b (10 units); status date 15.
const result = rescheduleFromStatusDate(input, 15, new Map([['a', 1], ['b', 0.3]]))
// a keeps [0, 10). b keeps 3 units at [10, 13) and does the other 7 at [15, 22): work [[10, 13], [15, 22]].
```

The status date must be finite, inside `input.range` and aligned with the quantum (`RangeError`). Progress values outside 0 to 1 throw a `RangeError` and progress for an unknown task throws an `Error`. When the done work of a task ahead of plan does not fit between the horizon start and the status date, a `RangeError` is thrown. GanttChart can show the status date with the `statusDate` prop and the progress with `showProgressLine`.

## Network diagram

`scheduleToGraph(result, dependencies, options?)` turns a successful result into a PERT (activity-on-node) diagram for NetworkGraph: each node shows the task's early start, early finish and total float, critical tasks get the amber tone and `criticalNodeIds`, and the controlling links are returned in `criticalEdgeIds`. Pass `criticalNodeIds` as NetworkGraph `relatedIds` to highlight them. See the [API reference](api.md#network-diagram-from-a-schedule).

## Compare demand with capacity

Resources have integer capacity and optional half-open availability periods. Omit periods for continuous availability, or use an empty array to close the resource throughout the horizon. Capacity is constant while available. Each assignment requests positive integer units and applies to every work segment of the task. Duplicate assignments for the same task and resource are rejected. To use fractions, choose a shared unit such as percentage points for both capacity and demand.

The sweep reports load, available capacity, excess units and active task IDs for every event interval. Work that falls outside the equipment calendar appears as demand against zero capacity. Conflicts are diagnostic. `levelResources` provides a baseline leveling heuristic, described in [Level resources](#level-resources). Optimization, setup sequencing and other leveling policies remain the planning application's concern.

## Time-zone calendars

`buildWorkPeriods(range, { weekly, timeZone, exceptions })` reads shift minutes as local wall-clock times in an IANA time zone such as `America/New_York`, `Europe/Berlin` or `Asia/Tokyo`. Civil dates, weekdays and exception dates are local to that zone. The zone rules come from `Intl.DateTimeFormat`, so the function has no dependencies and runs in Node.js, workers and browsers. Results depend on the time-zone data of the runtime.

- `timeZone` and `utcOffsetMinutes` cannot be combined. An unknown or empty zone name throws `RangeError`.
- A shift keeps its wall-clock times, so its elapsed length changes when it crosses a transition. A 22:00–06:00 night shift lasts 7 hours on a spring-forward night and 9 hours on a fall-back night.
- A wall time skipped by a spring-forward gap resolves to the transition instant, the first valid local time after it. A shift that lies entirely within a gap therefore disappears. In New York on 8 March 2026, a 02:30–04:00 shift becomes 03:00–04:00 EDT.
- A wall time that occurs twice during a fall-back overlap resolves to its earlier occurrence. In New York on 1 November 2026, a 01:30–02:30 shift runs from 01:30 EDT to 02:30 EST, which is 2 hours.
- A shift end of 1440 or later uses the next local midnight. The 3,661 civil date limit also applies.

## Diagnose failures

A `cycle` failure lists `cycles`. Each entry is a strongly connected group of tasks: `taskIds` in input order, and `dependencyIds`, the links between members, in input order. Every listed link lies on at least one cycle. A self-link forms a group with one task. Tasks that only depend on a cycle are not listed. Entries are ordered by the input position of their first task. Detection is iterative, so long cycles do not exhaust the call stack.

An `infeasible` failure names the first task without a feasible slot and the bounds that conflict. `constraints` holds the names of the binding bounds in this fixed order: `range`, `startNoEarlierThan`, `startNoLaterThan`, `finishNoEarlierThan`, `finishNoLaterThan`, `fixedStart`, `deadline`, `projectFinish` and `calendar`. `dependencyIds` lists the binding links in input order. A bound is binding when it sets the effective lower or upper limit that cannot be met. The horizon (`range`) is listed only when no other bound sets the same limit. `calendar` is added when the numeric bounds could be met in continuous time but the task's working time, including its pauses, has no slot between them. For example, a 5-unit task with a deadline of 4 reports `['range', 'deadline']`, and a fixed start in a break reports `['fixedStart', 'calendar']`.

## As late as possible

Set `mode: 'alap'` on a task to place it as late as possible. The default is `'asap'`. Semantics:

1. The forward and backward passes are unchanged. Every task's earliest dates, latest dates, `totalFloat`, `workFloat`, `critical` flag, the project `finish` and `criticalDependencyIds` are the same as with `'asap'`.
2. ALAP tasks are then placed in reverse dependency order. Each one gets the latest slot on its own calendar that satisfies its own bounds, the deadline, the project finish and every outgoing link measured against the successor's placed dates. ASAP successors stay at their earliest dates, and ALAP successors use the dates placed for them.
3. ALAP placement therefore uses only free float and never moves another task or the project finish. An ALAP task whose ASAP successor starts right after it stays at its earliest dates. A chain of ALAP tasks moves together toward its latest dates.
4. `start`, `end` and `work` report the placed dates. ALAP tasks also report `earliestStart` and `earliestEnd`. Float stays measured from the earliest dates. ASAP tasks have no extra fields.
5. Lower bounds still apply. `fixedStart` keeps the task fixed. `startNoLaterThan`, `finishNoLaterThan` and the deadline cap the placement. On a calendar, the latest slot ends on a working tick and can span breaks.

## Split work

Work on a calendar is already split at non-working time. The result's `work` array lists each worked segment, while `start` and `end` cover the elapsed span. To interrupt a single task, give it `pauses`: elapsed half-open intervals in which that task does no work. Pauses are removed from the task's working time on its calendar. They must align with the quantum, can overlap breaks or one another, and are clipped to the horizon. A task with `duration: 4` and a pause `[2, 3)` works `[0, 2)` and `[3, 5)`. Its FS successors start at 5. A fixed start inside a pause is infeasible.

`splittable: true` lets `levelResources` add pauses to a task. `scheduleTasks` ignores `splittable` and `priority`.

## Level resources

`levelResources({ ...scheduleInput, resources, assignments })` returns a schedule in which assigned load stays within capacity wherever a permitted delay allows. It uses the same resource and assignment rules as `calculateResourceLoad`, and resource periods must also align with the quantum. It is a deterministic serial heuristic, not an optimizer:

1. It schedules the input with every task as soon as possible. A cycle or infeasible input returns that failure unchanged.
2. It calculates latest dates for every task without the project finish, so a task can move later only while all of its successors stay feasible.
3. It places tasks one at a time. The next task is the highest-ranked task whose predecessors are all placed. The rank uses the higher `priority` first (default 0), then the smaller unleveled `totalFloat`, then the earlier unleveled start, then the task ID in code-unit order.
4. Each task gets the earliest start that its placed predecessors, own bounds and calendar allow and at which its assigned resources have enough remaining capacity for all of its work. A `splittable` task instead takes the earliest working units that have capacity and can pause in between. Milestones and tasks without assignments do not wait for capacity.
5. A task with no capacity-feasible placement before its latest dates stays at its earliest dates. It is listed in `unresolvedTaskIds`, and its overload remains.

The result has the fields of a successful `scheduleTasks` result for the leveled plan, plus:

- `leveledTasks`: the input tasks with a `startNoEarlierThan` at the leveled start for delayed and split tasks, and added `pauses` for split tasks. Split tasks are pinned even when they start at their earliest date, so an end bound cannot pull their work away from the reserved capacity. `scheduleTasks` reproduces the same dates from them. Persist these when you accept the plan.
- `delays`: each task whose dates or work changed, in input order, with `before` and `after` intervals, `delay` (`after.start - before.start`, in elapsed units), the added `pauses`, and `cause`. The cause is `capacity` when leveling constrained the task itself, and `predecessor` when only a dependency moved it.
- `overloads`: the overloaded segments of `calculateResourceLoad` for the leveled plan. The list is empty when every task was resolved.
- `unresolvedTaskIds`: tasks that kept an overload, in input order.

Leveling ignores `mode` and omits it from `leveledTasks`, because placing a task later after capacity is reserved would reintroduce conflicts. The deadline, the horizon and every task bound remain hard limits. The unleveled project finish is not a limit, so the leveled `finish` can be later. `calculateResourceLoad` remains the diagnostic for any plan.

## Try the demo

Open **Scheduling** and focus **Cut order A**. Press Right Arrow once to move its requested start from 08:00 to 09:00. Inspection moves to 13:00, projected finish moves from 16:00 to 17:00, and the CNC overlap grows from one to two resource-hours. Press Right Arrow again to see packing finish on 11 November after the 10 November closure. Further moves beyond the horizon leave the accepted plan on screen. **Reset schedule** restores the original dates.

The status date slider (09 Nov 12:00 by default) draws the status-date line, and **Show progress line** draws the progress line from the reported progress: cutting order A is done, B is half done and inspection a quarter done. **Reschedule from status date** applies `rescheduleFromStatusDate`: B keeps its first hour and finishes after lunch, inspection keeps its first half hour and continues at 13:00, and packing moves to 14:30–16:30. The next edit recalculates the plan from the requested starts. **Export MS Project XML**, **Export iCalendar** and **Export CSV** save the current plan with `toMsProjectXml`, `toICalendar` and `toCsv`, and **Network diagram** shows it as a NetworkGraph built with `scheduleToGraph`.

Drag **Cut order A** two hours to the right with the pointer: while it is held, dashed outlines show inspection and packing at the dates `propagateEdit` computes for the new start, and the bars stay where they are. Release to accept the move and the cascaded operations as one batch; Escape discards the preview. A requested start inside the lunch break or on the closed day is previewed from the next working time, as the scheduler places it.

The demo shades breaks, nights and the closed date with `invertWorkPeriods` and builds its bars with `scheduledBarFields`. Inspection crosses the lunch break, so it is drawn as two work pieces. Critical tasks have a red outline, **Cut order B** shows its float as a thin line, and packing has a dispatch deadline at 17:00 on 9 November. After the second move, packing is split by the closure and marked late. Clear **Shade non-working time** or **Show critical path and float** to hide these layers, and use **Export schedule SVG** to save the chart with them.

Terminology references include [Microsoft Project dependency types](https://support.microsoft.com/en-us/project/predecessors-task-field) and [critical-path guidance](https://support.microsoft.com/en-gb/project/manage-your-project-s-critical-path?nochrome=true).
