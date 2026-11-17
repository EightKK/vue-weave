// Type-level checks for manual and inactive tasks and the Microsoft Project XML import. Checked by `npm run typecheck`.
import {
  calculateResourceLoad, fromMsProjectXml, scheduleTasks, timelineFromMsProject, toMsProjectXml, type MsProjectImport,
  type MsProjectInput, type ResourceAssignment, type ResourceCapacity, type ScheduleInput, type ScheduleManualConflict,
  type ScheduleTask, type TimelineBar,
} from '../../src/core/index'

declare const input: ScheduleInput
declare const resources: readonly ResourceCapacity[]
declare const assignments: readonly ResourceAssignment[]

const task: ScheduleTask = { id: 'a', duration: 0, manual: { start: 0, end: 1 }, inactive: false }
// @ts-expect-error manual dates are a TimeRange, not a flag
const flagged: ScheduleTask = { id: 'b', duration: 0, manual: true }
void task
void flagged

const result = scheduleTasks(input)
if (result.ok) {
  const manual: true | undefined = result.tasks[0]?.manual
  const conflicts: readonly ScheduleManualConflict[] | undefined = result.manualConflicts
  void manual
  void conflicts
  calculateResourceLoad(input.range, result.tasks, resources, assignments, { inactiveTaskIds: result.inactiveTaskIds })
}

// An import is an MsProjectInput, so it can be written again and turned into GanttChart data.
const imported: MsProjectImport = fromMsProjectXml('<Project/>', { utcOffsetMinutes: 60 })
const project: MsProjectInput = imported
const xml: string = toMsProjectXml(imported)
const bars: TimelineBar[] = timelineFromMsProject(project, { baselineId: number => 'set' + number }).bars
const manualFlag: boolean = imported.tasks[0]!.manual
void xml
void bars
void manualFlag
