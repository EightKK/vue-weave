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

Terminology references include [Microsoft Project dependency types](https://support.microsoft.com/en-us/project/predecessors-task-field) and [critical-path guidance](https://support.microsoft.com/en-gb/project/manage-your-project-s-critical-path?nochrome=true).
