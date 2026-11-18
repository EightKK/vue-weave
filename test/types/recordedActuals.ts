// Type-level checks for recorded actuals. Checked by `npm run typecheck`.
import {
  actualsTimelineBars, rescheduleFromActuals, toPlanningDiagnostics, type ActualsDiagnostic, type ActualsTask, type PlanningDiagnostic,
  type ScheduleInput, type TaskActuals, type TimelineBar,
} from '../../src/core/index'

declare const input: ScheduleInput

const entry: TaskActuals = { intervals: [{ start: 0, end: 1 }], remainingWork: 2, finished: false }
// @ts-expect-error intervals are required
const missing: TaskActuals = { remainingWork: 2 }
void missing

const result = rescheduleFromActuals(input, 0, new Map([['a', entry]]))
// `ok` narrows the forecast schedule.
if (result.ok) {
  const finish: number = result.schedule.finish
  void finish
} else {
  const code: 'cycle' | 'infeasible' = result.schedule.code
  void code
}
const task: ActualsTask | undefined = result.tasks[0]
const state: 'not-started' | 'in-progress' | 'finished' | undefined = task?.state
void state
// Actuals diagnostics and planning diagnostics share one list.
const list: readonly (ActualsDiagnostic | PlanningDiagnostic)[] = [...result.diagnostics, ...toPlanningDiagnostics(result.plan)]
void list
const bars: TimelineBar[] = actualsTimelineBars(result, { baselineId: 'plan', barId: (id, part) => id + part })
// @ts-expect-error a part is 'actual' or 'forecast'
actualsTimelineBars(result, { barId: (id, part: 'plan') => id + part })
void bars
