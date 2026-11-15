import type { LevelResourcesResult } from './leveling.js'
import type { ResourceLoadSegment } from './resourceLoad.js'
import type { ScheduleConstraintName, ScheduleResult } from './scheduling.js'
import type { ScheduleReason, ScheduleTrace } from './scheduleTrace.js'
import type { TimeRange } from './timeline.js'
import type { EntityRef } from './viewBindings.js'

export type PlanningDiagnosticSeverity = 'info' | 'warning' | 'error'

/**
 * `schedule-cycle`: dependencies form a cycle. `schedule-infeasible`: a task has no date that meets its bounds.
 * `resource-overload`: a resource has more load than capacity in `range`. `leveling-unresolved`: leveling found no
 * capacity-feasible placement for a task.
 */
export type PlanningDiagnosticCode = 'schedule-cycle' | 'schedule-infeasible' | 'resource-overload' | 'leveling-unresolved'

/**
 * One problem of a calculated plan, as data for an application's own list. Entities use the kinds `task`,
 * `dependency` and `resource`. The ID and code do not depend on any display language.
 */
export interface PlanningDiagnostic {
  /** Stable for the same problem across recalculations: a JSON array of the code and the identifying values. */
  id: string
  code: PlanningDiagnosticCode
  severity: PlanningDiagnosticSeverity
  entities: readonly EntityRef[]
  range?: TimeRange
  /** For `schedule-infeasible`: the conflicting bound names of `ScheduleFailure.constraints`. */
  constraints?: readonly ScheduleConstraintName[]
  /** IDs of related reasons in the result's `trace`, when the result was calculated with `explain`. */
  reasonIds: readonly string[]
}

const taskRef = (id: string): EntityRef => ({ kind: 'task', id })
const dependencyRef = (id: string): EntityRef => ({ kind: 'dependency', id })

function isOverload(segment: ResourceLoadSegment) {
  if (!segment || typeof segment !== 'object' || typeof segment.resourceId !== 'string') throw new Error('Invalid resource load segment')
  if (![segment.start, segment.end, segment.overload].every(Number.isFinite) || segment.end < segment.start) {
    throw new RangeError('A resource load segment needs finite ordered dates and a finite overload: ' + segment.resourceId)
  }
  return segment.overload > 0
}

/**
 * Turn the failures, cycles, overloads and unresolved tasks of a `scheduleTasks` or `levelResources` result into one
 * list. `load` (for example from `calculateResourceLoad`) supplies the overloads and then replaces the result's own
 * `overloads`; only segments with `overload > 0` become diagnostics. A failure yields only its own diagnostics, never
 * the overloads of an earlier plan. The arguments are not modified.
 */
export function toPlanningDiagnostics(
  result: ScheduleResult | LevelResourcesResult, load?: readonly ResourceLoadSegment[],
): PlanningDiagnostic[] {
  if (!result || typeof result !== 'object' || typeof result.ok !== 'boolean') throw new Error('Invalid schedule result')
  if (load !== undefined && !Array.isArray(load)) throw new Error('Resource load must be an array of segments')
  if (!result.ok) {
    if (result.code === 'cycle') {
      return result.cycles.map(cycle => ({
        id: JSON.stringify(['schedule-cycle', ...cycle.taskIds]), code: 'schedule-cycle', severity: 'error',
        entities: [...cycle.taskIds.map(taskRef), ...cycle.dependencyIds.map(dependencyRef)], reasonIds: [],
      }))
    }
    return [{
      id: JSON.stringify(['schedule-infeasible', result.taskId]), code: 'schedule-infeasible', severity: 'error',
      entities: [taskRef(result.taskId), ...result.dependencyIds.map(dependencyRef)],
      constraints: [...result.constraints], reasonIds: [],
    }]
  }
  const trace = 'trace' in result ? (result as { trace?: ScheduleTrace }).trace : undefined
  const reasons = new Map<string, ScheduleReason>()
  for (const reason of trace?.reasons ?? []) reasons.set(reason.id, reason)
  const taskReasons = (taskId: string) => (trace?.taskReasonIds.get(taskId) ?? []).map(id => reasons.get(id)!).filter(Boolean)
  const diagnostics: PlanningDiagnostic[] = []
  const unresolved = 'unresolvedTaskIds' in result ? result.unresolvedTaskIds : []
  for (const taskId of unresolved) {
    const task = result.tasks.find(item => item.id === taskId)
    const diagnostic: PlanningDiagnostic = {
      id: JSON.stringify(['leveling-unresolved', taskId]), code: 'leveling-unresolved', severity: 'warning',
      entities: [taskRef(taskId)],
      reasonIds: taskReasons(taskId).filter(reason => reason.phase === 'leveling').map(reason => reason.id),
    }
    if (task) diagnostic.range = { start: task.start, end: task.end }
    diagnostics.push(diagnostic)
  }
  const segments: readonly ResourceLoadSegment[] = load ?? ('overloads' in result ? result.overloads : [])
  for (const segment of segments) {
    if (!isOverload(segment)) continue
    const { resourceId, start, end } = segment
    const taskIds: readonly string[] = segment.taskIds ?? []
    diagnostics.push({
      id: JSON.stringify(['resource-overload', resourceId, start, end]), code: 'resource-overload', severity: 'warning',
      entities: [{ kind: 'resource', id: resourceId }, ...taskIds.map(taskRef)],
      range: { start, end },
      reasonIds: taskIds.flatMap(taskId => taskReasons(taskId).filter(reason => reason.kind === 'capacity'
        && reason.resourceId === resourceId && reason.range !== undefined && reason.range.start < end && reason.range.end > start)
        .map(reason => reason.id)),
    })
  }
  return diagnostics
}
