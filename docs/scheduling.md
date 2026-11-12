# Scheduling and equipment load

The scheduling functions are available from `vue-weave/core` and the Vue package entry. The Gantt chart still renders the intervals supplied by its parent. Call the solver when an edit proposes a new constraint, then publish the accepted bars, links, and load data together.

## Calendar contract

A calendar contains an ID and absolute half-open work periods `[start, end)`. Overlapping or touching periods are combined. Missing periods represent time off. Work can span several periods, with gaps retained in the elapsed start/end span. The result's `work` array contains the segments that consume work or capacity.

Use `buildWorkPeriods(range, { weekly, utcOffsetMinutes, exceptions })` to expand weekly rules into epoch milliseconds in a fixed UTC offset. Weekdays run from Sunday (0) to Saturday (6). A shift starts at `startMinute` and ends at `endMinute` relative to the start of its local date. An end beyond 1440 continues into the next date. Shifts are at most 24 hours long. An exception replaces its entire civil date, including overnight carry-in. An empty exception closes the date. Use explicit periods when a zone observes daylight-saving transitions.

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
- Invalid references or values throw. Cycles return `{ ok: false, code: 'cycle' }`. A task with no feasible slot returns `{ ok: false, code: 'infeasible', taskId }`. Failed results carry no partial dates. The solver accepts directed acyclic dependency graphs.
- The forward pass finds earliest dates. The backward pass holds the earliest project finish as its upper limit and finds latest dates. Total float is the task's own working time between those starts, or elapsed time for a milestone. workFloat is always working time on the task's calendar: it equals totalFloat for tasks and, for a milestone, the calendar's working time between its earliest and latest points. Use workFloat to compare milestones with tasks. A zero-float task is critical. A critical link binds two critical tasks after projecting the dependency endpoint onto the successor calendar. The result can contain multiple controlling chains and individually constrained critical tasks.

## Compare demand with capacity

Resources have integer capacity and optional half-open availability periods. Omit periods for continuous availability, or use an empty array to close the resource throughout the horizon. Capacity is constant while available. Each assignment requests positive integer units and applies to every work segment of the task. Duplicate assignments for the same task and resource are rejected. To use fractions, choose a shared unit such as percentage points for both capacity and demand.

The sweep reports load, available capacity, excess units and active task IDs for every event interval. Work that falls outside the equipment calendar appears as demand against zero capacity. Conflicts are diagnostic. The API leaves capacity-constrained sequencing and setup policies to the planning application.

## Try the demo

Open **Scheduling** and focus **Cut order A**. Press Right Arrow once to move its requested start from 08:00 to 09:00. Inspection moves to 13:00, projected finish moves from 16:00 to 17:00, and the CNC overlap grows from one to two resource-hours. Press Right Arrow again to see packing finish on 11 November after the 10 November closure. Further moves beyond the horizon leave the accepted plan on screen. **Reset schedule** restores the original dates.

Terminology references include [Microsoft Project dependency types](https://support.microsoft.com/en-us/project/predecessors-task-field) and [critical-path guidance](https://support.microsoft.com/en-gb/project/manage-your-project-s-critical-path?nochrome=true).
