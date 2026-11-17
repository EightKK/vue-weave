# Scheduling and equipment load

The scheduling functions are available from `vue-weave/core` and the Vue package entry. The Gantt chart still renders the intervals supplied by its parent. Call the solver when an edit proposes a new constraint, then publish the accepted bars, links, and load data together.

## Calendar contract

A calendar contains an ID and absolute half-open work periods `[start, end)`. Overlapping or touching periods are combined. Missing periods represent time off. Work can span several periods, with gaps retained in the elapsed start/end span. The result's `work` array contains the segments that consume work or capacity.

Use `buildWorkPeriods(range, { weekly, utcOffsetMinutes, exceptions })` to expand weekly rules into epoch milliseconds in a fixed UTC offset, an integer number of minutes from -1080 to 1080 (the same limit as `calendarBands`). Weekdays run from Sunday (0) to Saturday (6). A shift starts at `startMinute` and ends at `endMinute` relative to the start of its local date. An end beyond 1440 continues into the next date. Shifts are at most 24 hours long. An exception replaces its entire civil date, including overnight carry-in. An empty exception closes the date. For a zone that observes daylight-saving transitions, pass an IANA `timeZone` instead of `utcOffsetMinutes`, as described in [Time-zone calendars](#time-zone-calendars).

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
- Tasks with `manual` dates stay where they are and `inactive` tasks take no part; see [Manual and inactive tasks](#manual-and-inactive-tasks). `tasks` in a result is in input order without inactive tasks.
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

### Scheduling constraints from the chart

`TimelineBar.constraints` uses the names of the `ScheduleTask` bounds (`startNoEarlierThan`, `startNoLaterThan`, `finishNoEarlierThan`, `finishNoLaterThan` and `fixedStart`), so the two map one to one in both directions, and the chart can show and edit them. `timelineConstraints(task)` copies the constraint fields of a task (and nothing else) for a bar; a bar's constraints spread into a task unchanged. With `constraintsEditable`, the chart turns the constraints of editable bars into handles and proposes each move or removal through `constraint-edit`; it never changes the plan itself. Apply the proposal to your tasks, schedule again and show the diagnostic when the new bound cannot be met (see [Diagnose failures](#diagnose-failures)):

```ts
import {
  scheduleTasks, scheduledBarFields, timelineConstraints, type ScheduleTask, type TimelineConstraintEdit,
} from 'vue-weave/core'

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

A kept FF or SF link that cannot be met makes the plan infeasible. When the required finish lies after the task's `finishNoLaterThan`, the deadline or the end of the horizon, the result is an `infeasible` failure for the task that names the link in `dependencyIds`, with `finishNoLaterThan`, `deadline` or `range` in `constraints`. Unstarted tasks keep every bound and dependency; an unstarted task with a `fixedStart` before the status date makes the plan infeasible, which is returned as an `infeasible` failure. The result is the `ScheduleResult` of the adjusted plan. The dependencies that no longer apply are left out of it, so they never appear in `criticalDependencyIds`. The input is not modified.

```ts
import { rescheduleFromStatusDate } from 'vue-weave/core'

// Continuous time: a (10 units) → b (10 units); status date 15.
const result = rescheduleFromStatusDate(input, 15, new Map([['a', 1], ['b', 0.3]]))
// a keeps [0, 10). b keeps 3 units at [10, 13) and does the other 7 at [15, 22): work [[10, 13], [15, 22]].

// a (6 units) →FF→ b (4 units); b is half done at status date 2, a has not started and now runs [2, 8).
// b keeps its done half at [0, 2) and does the other half at [6, 8), so it finishes with a: work [[0, 2], [6, 8]].
```

Tasks with `manual` dates keep them whatever their progress; their outgoing links still apply. Progress entries of `inactive` tasks are accepted and ignored.

The status date must be finite, inside `input.range` and aligned with the quantum (`RangeError`). Progress values outside 0 to 1 throw a `RangeError` and progress for an unknown task throws an `Error`. When the done work of a task ahead of plan does not fit between the horizon start and the status date, a `RangeError` is thrown. GanttChart can show the status date with the `statusDate` prop and the progress with `showProgressLine`.

## Network diagram

`scheduleToGraph(result, dependencies, options?)` turns a successful result into a PERT (activity-on-node) diagram for NetworkGraph: each node shows the task's early start, early finish and total float, critical tasks get the amber tone and `criticalNodeIds`, and the controlling links are returned in `criticalEdgeIds`. Edges are labelled with the link type when it is not FS and with a non-zero `lag`, formatted by `formatLag` (default `formatDependencyLag`, such as `SS +2 h`). Pass `criticalNodeIds` as NetworkGraph `relatedIds` to highlight them. See the [API reference](api.md#network-diagram-from-a-schedule).

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

Two task fields mirror Microsoft Project. They are opt-in: a plan without them is scheduled exactly as before, and its result has neither `manualConflicts` nor `inactiveTaskIds`.

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
| `calculateResourceLoad` | Their `work` counts like any other | Pass `{ inactiveTaskIds: result.inactiveTaskIds }` so their assignments take no capacity instead of throwing |
| `buildPlacementInput` | A link from an unplaced task into a placed manual task is excluded without a diagnostic | Links that touch them are excluded without a diagnostic |
| `scheduleToGraph` | A node with zero float, never critical | Left out with the links that touch them |
| `toPlanningDiagnostics` | Conflicts are not listed; read `manualConflicts` | Not listed |
| Snapshots | Stored and restored as they are | `inactive` must be a boolean |

`fromMsProjectXml` reads both flags from Microsoft Project files (`Manual` 1 and `Active` 0). Its tasks have `manual: true` rather than dates, so pass `{ start: task.start, end: task.end }` as `ScheduleTask.manual`; see [Microsoft Project import](api.md#microsoft-project-import).

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

Manual tasks are placed before every other task, at their manual dates, and never move; a manual task whose dates lack capacity is listed in `unresolvedTaskIds`. Inactive tasks and their assignments are ignored.

The result has the fields of a successful `scheduleTasks` result for the leveled plan, plus:

- `leveledTasks`: the input tasks with a `startNoEarlierThan` at the leveled start for delayed and split tasks, and added `pauses` for split tasks. Split tasks are pinned even when they start at their earliest date, so an end bound cannot pull their work away from the reserved capacity. `scheduleTasks` reproduces the same dates from them. Persist these when you accept the plan.
- `delays`: each task whose dates or work changed, in input order, with `before` and `after` intervals, `delay` (`after.start - before.start`, in elapsed units), the added `pauses`, and `cause`. The cause is `capacity` when leveling constrained the task itself, and `predecessor` when only a dependency moved it.
- `overloads`: the overloaded segments of `calculateResourceLoad` for the leveled plan. The list is empty when every task was resolved.
- `unresolvedTaskIds`: tasks that kept an overload, in input order.

Leveling ignores `mode` and omits it from `leveledTasks`, because placing a task later after capacity is reserved would reintroduce conflicts. The deadline, the horizon and every task bound remain hard limits. The unleveled project finish is not a limit, so the leveled `finish` can be later. `calculateResourceLoad` remains the diagnostic for any plan.

## Try the demo

Open **Scheduling** and focus **Cut order A**. Press Right Arrow once to move its requested start from 08:00 to 09:00. Inspection moves to 13:00, projected finish moves from 16:00 to 17:00, and the CNC overlap grows from one to two resource-hours. Press Right Arrow again to see packing finish on 11 November after the 10 November closure. Further moves beyond the horizon leave the accepted plan on screen. **Reset schedule** restores the original dates.

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
import { createResourceTimelineProjector, resolveResourceTimelineEdit, scheduledBarFields } from 'vue-weave/core'

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
import { collectScheduleReasons, scheduleTasks, toPlanningDiagnostics } from 'vue-weave/core'

const plan = scheduleTasks(input, { explain: true })
if (plan.ok) {
  const why = collectScheduleReasons(plan.trace, 'B', { phases: ['earliest'] })
}
const problems = toPlanningDiagnostics(plan)
```

A task with `manual` dates has a `manual` reason in each phase instead of bounds, because nothing else places it. Each reason belongs to a phase. `earliest` is the forward pass and records the lower limits that set each task's earliest start or finish. `latest` is the backward pass and records the upper limits from successors, the project finish and the task's own bounds. `placement` records why an ALAP task was placed where it is. `leveling` records the limits and the capacity shortages met while `levelResources` reserved capacity; its `latest` reasons are those of the leveling horizon, which ignores the project finish.

For example, with A and B of duration 2, an FS link with lag 1 and a calendar with working time [0, 3) and [5, 12), B's candidate start is 3. Time 3 is not working time, because [0, 3) is half-open, so B starts at 5. The trace holds a `dependency` reason (candidate 3, placed 5, parent: A's reason) and a `calendar` reason (3 to 5). A pause that moves the task further is a separate `pause` reason, so calendar time off and the task's own pauses can be told apart. Lag is elapsed time, so the candidate is the predecessor's end plus the lag before any calendar applies.

When several limits are equal, all are reported, for example two FS predecessors that finish together. `range` is reported only when no other bound has the same value, as in failures.

Leveling records why it delayed or split a task as `capacity` reasons with the resource, the interval, the units needed, the capacity there and the tasks that already held it. They are recorded in the reservation loop, not taken from the replayed `scheduleTasks` run, so the `startNoEarlierThan` that leveling adds to `leveledTasks` is never reported as the cause. A delay with `cause: 'capacity'` can also have dependency reasons when a predecessor moved too. A task that is listed in `unresolvedTaskIds` is not resolved even though the result is `ok: true`: do not show such a result as free of capacity conflicts. `toPlanningDiagnostics` lists it as `leveling-unresolved` next to its `resource-overload` segments.

Keep the three kinds of deadline apart:

- `ScheduleInput.deadline` is a hard limit on the whole project. It is reported as the `deadline` constraint and a `project-bound` reason.
- `ScheduleTask.finishNoLaterThan` is a hard limit on one task, reported as a `constraint` reason.
- `TimelineBar.deadline` is only drawn by GanttChart and never takes part in scheduling.

`toPlanningDiagnostics(result, load?)` lists cycles and infeasible tasks of a failure, or unresolved tasks and overloaded segments of a success. It does not list manual conflicts; show the result's `manualConflicts` yourself. A failure lists only its own problems, so an earlier successful plan is never shown as current. `propagateEdit` and `rescheduleFromStatusDate` do not take the option.
