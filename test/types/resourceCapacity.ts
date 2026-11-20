// Type-level checks for time-varying capacity and partial assignments. Checked by `npm run typecheck`.
import {
  assignmentWorkPeriods, type LevelResourcesInput, type ResourceAssignment, type ResourceCapacity, type ResourceCapacityPeriod,
  type TimeRange,
} from '../../src/core/index'

const period: ResourceCapacityPeriod = { start: 0, end: 10, capacity: 2 }
const resource: ResourceCapacity = { id: 'r', capacity: 1, capacityPeriods: [period] }
// @ts-expect-error a capacity period needs a capacity
const missing: ResourceCapacityPeriod = { start: 0, end: 10 }
const assignment: ResourceAssignment = { resourceId: 'r', taskId: 't', workOffset: 0, workDuration: 30 }
// @ts-expect-error offsets are numbers
const named: ResourceAssignment = { resourceId: 'r', taskId: 't', workOffset: 'start' }
const input: Pick<LevelResourcesInput, 'resources' | 'assignments'> = { resources: [resource], assignments: [assignment] }
const periods: TimeRange[] = assignmentWorkPeriods([{ start: 0, end: 60 }], assignment)
void missing
void named
void input
void periods
