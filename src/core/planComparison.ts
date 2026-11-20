import type { LevelResourcesResult } from './leveling.js'
import { calculateResourceLoad, type ResourceAssignment, type ResourceCapacity, type ResourceLoadSegment } from './resourceLoad.js'
import {
  scheduleTasks, type ScheduleConstraintName, type ScheduleCycle, type ScheduleInput, type ScheduleResult, type ScheduleTask,
} from './scheduling.js'
import type { ScheduleReason, ScheduleTrace } from './scheduleTrace.js'
import { timelineBaselineId } from './timeline.js'
import { createAssignmentChecker } from './resourceCapacity.js'
import { buildScheduleModel } from './scheduleModel.js'
import { invalidIdError, isId, uniqueIds, withContext } from './ids.js'
import type { TimelineBaseline } from './types.js'
import {
  resolveViewTargets, type EntityRef, type LoadViewTarget, type ViewBindingIndex, type ViewTarget,
} from './viewBindings.js'

/** A scheduler task with an optional due time. */
export interface PlanComparisonTask extends ScheduleTask {
  /**
   * A due time in the caller's time unit, like `TimelineBar.deadline`. It is not a scheduling bound: `scheduleTasks`
   * ignores it, and a task that ends after it counts as a `deadline` violation of its plan.
   */
  deadline?: number
}

/** The input of one plan: the input of `scheduleTasks`, with optional resources and assignments. */
export interface PlanComparisonInput extends ScheduleInput {
  tasks: readonly PlanComparisonTask[]
  resources?: readonly ResourceCapacity[]
  assignments?: readonly ResourceAssignment[]
}

/** One side of `comparePlans`. */
export interface PlanScenario {
  input: PlanComparisonInput
  /**
   * The result of `scheduleTasks` or `levelResources` for `input`, for example a leveled plan. When omitted,
   * `comparePlans` calculates `scheduleTasks(input, { explain: true })`. A successful result must cover the task set of
   * `input` exactly (see `comparePlans`); recalculate it whenever `input` changes.
   */
  result?: ScheduleResult | LevelResourcesResult
  /**
   * The resource load of `result`, for example from `calculateResourceLoad`. When omitted and `input.resources` is
   * given, `comparePlans` calculates it from the result. Segments of one resource must not overlap.
   */
  load?: readonly ResourceLoadSegment[]
  /** An application revision of this plan, for example the accepted version of the current plan. */
  revision?: string
  /** For a candidate: the revision of the current plan it was derived from. */
  baseRevision?: string
  /** Set when the plan's data is not completely loaded. The comparison is then reported as incomplete. */
  partial?: boolean
}

/** Whether a plan has a schedule. `infeasible.deadline` is true when the project `deadline` is one of the conflicts. */
export type PlanScheduleState =
  | { status: 'scheduled'; finish: number }
  | { status: 'cycle'; cycles: readonly ScheduleCycle[] }
  | {
    status: 'infeasible'
    taskId: string
    constraints: readonly ScheduleConstraintName[]
    dependencyIds: readonly string[]
    deadline: boolean
  }

/**
 * One task in one plan. `inactive`: in the input but inactive. `absent`: not in the input. `unscheduled`: the plan has
 * no schedule (cycle or infeasible).
 */
export type PlanTaskSide =
  | { state: 'scheduled'; start: number; end: number; critical: boolean; summary?: true; manual?: true }
  | { state: 'inactive' }
  | { state: 'absent' }
  | { state: 'unscheduled' }

/** An item whose input fields differ. `fields` are the changed field names, in order of first appearance. */
export interface PlanFieldChange {
  id: string
  fields: readonly string[]
}

/** IDs added to and removed from a collection, and the items whose fields changed. Each list is in input order. */
export interface PlanCollectionDiff {
  added: readonly string[]
  removed: readonly string[]
  changed: readonly PlanFieldChange[]
}

export interface PlanAssignmentChange {
  taskId: string
  resourceId: string
  fields: readonly string[]
}

/** Assignments are matched by task and resource. `taskIds` are the tasks with any assignment difference. */
export interface PlanAssignmentDiff {
  added: readonly ResourceAssignment[]
  removed: readonly ResourceAssignment[]
  changed: readonly PlanAssignmentChange[]
  taskIds: readonly string[]
}

/** The differences between the two inputs. Nothing in it is calculated. */
export interface PlanInputDiff {
  /** Changed top-level fields of the input, such as `range`, `quantum`, `defaultCalendarId` or `deadline`. */
  settings: readonly string[]
  tasks: PlanCollectionDiff
  dependencies: PlanCollectionDiff
  calendars: PlanCollectionDiff
  /** Resource changes, capacity and working periods included. */
  resources: PlanCollectionDiff
  assignments: PlanAssignmentDiff
}

/** A problem of a scheduled plan that `comparePlans` tracks between the plans. */
export type PlanViolation =
  | { code: 'deadline'; taskId: string; deadline: number; finish: number }
  | { code: 'manual-conflict'; taskId: string; dependencyId: string }
  | { code: 'leveling-unresolved'; taskId: string }

/**
 * One task that was edited or whose calculated result differs. `edited` is true when the task's own input differs
 * (`input` is not `unchanged`); otherwise the difference is a consequence of other changes.
 */
export interface PlanTaskComparison {
  id: string
  edited: boolean
  input: 'added' | 'removed' | 'changed' | 'unchanged'
  /** Changed task fields. Empty for added and removed tasks. */
  fields: readonly string[]
  assignmentsChanged: boolean
  current: PlanTaskSide
  candidate: PlanTaskSide
  /** `candidate.start - current.start`, when both are scheduled. */
  startShift?: number
  /** `candidate.end - current.end`, when both are scheduled. */
  finishShift?: number
  /** Present when the critical flag differs between two scheduled sides. */
  critical?: 'gained' | 'lost'
  /** Resources assigned to the task in each input, in assignment order. */
  resourceIds: { current: readonly string[]; candidate: readonly string[] }
  /**
   * The task's own reasons from each side's `explain` trace, when that side has one. They say why the task got its
   * dates in that plan; they do not say which change caused a difference.
   */
  reasons?: { current?: readonly ScheduleReason[]; candidate?: readonly ScheduleReason[] }
}

/**
 * Cumulative overload of one resource: the sum over its overloaded segments of `overload * (end - start)`, in the
 * caller's capacity units times time units. Undefined on a side that has no load for it (no schedule, or not a
 * resource of that plan).
 */
export interface PlanResourceOverload {
  resourceId: string
  current?: number
  candidate?: number
  /** `candidate - current`, when both are defined. */
  change?: number
}

/** The differences between the calculated results. */
export interface PlanResultDiff {
  state: { current: PlanScheduleState; candidate: PlanScheduleState }
  /**
   * True when both plans are scheduled. Otherwise `tasks` lists only the edited tasks, `consequenceTaskIds` is empty
   * and no violation is gained or lost.
   */
  comparable: boolean
  /** The final completion (`finish`) of each scheduled plan. */
  finish: { current?: number; candidate?: number; shift?: number }
  /** Edited tasks and tasks with a different result, current input order first, then added tasks. */
  tasks: readonly PlanTaskComparison[]
  editedTaskIds: readonly string[]
  /** Tasks with an unchanged input whose dates, critical flag or state differ. */
  consequenceTaskIds: readonly string[]
  criticalDependencies: { gained: readonly string[]; lost: readonly string[] }
  violations: {
    current?: readonly PlanViolation[]
    candidate?: readonly PlanViolation[]
    gained: readonly PlanViolation[]
    lost: readonly PlanViolation[]
  }
  /** Every resource of either plan with load. */
  overload: readonly PlanResourceOverload[]
}

export interface PlanComparison {
  /** False when either plan is flagged `partial`: the comparison then covers only the loaded data. */
  complete: boolean
  partial: { current: boolean; candidate: boolean }
  /**
   * `stale` is true when the candidate's `baseRevision` and the current `revision` are both given and differ: the
   * current plan advanced after the candidate was derived from it.
   */
  revision: { current?: string; base?: string; stale: boolean }
  /** True when the inputs are equal and so is every compared result. */
  empty: boolean
  input: PlanInputDiff
  result: PlanResultDiff
}

type Side = 'current' | 'candidate'

interface Prepared {
  input: PlanComparisonInput
  tasks: Map<string, PlanComparisonTask>
  assignments: Map<string, ResourceAssignment>
  resourcesByTask: Map<string, string[]>
  result: ScheduleResult | LevelResourcesResult
  load?: readonly ResourceLoadSegment[]
}

const collections = new Set(['tasks', 'dependencies', 'calendars', 'resources', 'assignments'])

/** Structural equality of JSON-like values, with `undefined` properties treated as absent. Iterative. */
function sameValue(a: unknown, b: unknown): boolean {
  const stack: [unknown, unknown][] = [[a, b]]
  while (stack.length) {
    const [x, y] = stack.pop()!
    if (Object.is(x, y)) continue
    if (typeof x !== 'object' || typeof y !== 'object' || x === null || y === null) return false
    if (Array.isArray(x) !== Array.isArray(y)) return false
    if (Array.isArray(x)) {
      const other = y as unknown[]
      if (x.length !== other.length) return false
      for (let i = 0; i < x.length; i++) stack.push([x[i], other[i]])
      continue
    }
    const xr = x as Record<string, unknown>, yr = y as Record<string, unknown>
    const keys = new Set([...Object.keys(xr), ...Object.keys(yr)])
    for (const key of keys) stack.push([xr[key], yr[key]])
  }
  return true
}

function changedFields(a: object, b: object, skip: ReadonlySet<string>): string[] {
  const ar = a as Record<string, unknown>, br = b as Record<string, unknown>
  const fields: string[] = []
  for (const key of new Set([...Object.keys(ar), ...Object.keys(br)])) {
    if (!skip.has(key) && !sameValue(ar[key], br[key])) fields.push(key)
  }
  return fields
}

const idOnly = new Set(['id'])

function diffCollection<T extends { id: string }>(current: readonly T[], candidate: readonly T[]): PlanCollectionDiff {
  const before = new Map(current.map(item => [item.id, item]))
  const after = new Map(candidate.map(item => [item.id, item]))
  const changed: PlanFieldChange[] = []
  for (const item of current) {
    const next = after.get(item.id)
    if (!next) continue
    const fields = changedFields(item, next, idOnly)
    if (fields.length) changed.push({ id: item.id, fields })
  }
  return {
    added: candidate.filter(item => !before.has(item.id)).map(item => item.id),
    removed: current.filter(item => !after.has(item.id)).map(item => item.id),
    changed,
  }
}

const pairKey = (taskId: string, resourceId: string) => JSON.stringify([taskId, resourceId])

/**
 * Validate and prepare one plan. Every check runs inside `withContext`, so each message ends with the plan label, as
 * in `Duplicate task ID: a (current plan)`. The scheduling input is validated by the scheduler's own rules (through
 * `scheduleTasks`, or `buildScheduleModel` when a result is given), resources by the shared ID rule and assignments by
 * the shared assignment checker.
 */
function prepare(scenario: PlanScenario, side: Side): Prepared {
  return withContext(side + ' plan', () => {
    if (!scenario || typeof scenario !== 'object' || !scenario.input || typeof scenario.input !== 'object') {
      throw new Error('A plan needs an input')
    }
    const { input } = scenario
    if (!Array.isArray(input.tasks)) throw new Error('The tasks must be an array')
    for (const [key, value] of [['partial', scenario.partial], ['revision', scenario.revision], ['baseRevision', scenario.baseRevision]] as const) {
      if (value !== undefined && typeof value !== (key === 'partial' ? 'boolean' : 'string')) throw new Error(`Invalid ${key}`)
    }
    for (const key of ['dependencies', 'calendars', 'resources', 'assignments'] as const) {
      if (input[key] !== undefined && !Array.isArray(input[key])) throw new Error(`The ${key} must be an array`)
    }
    // The scheduler's validation is the single source for tasks, dependencies, calendars and dates.
    let result = scenario.result
    const model = result === undefined ? undefined : buildScheduleModel(input)
    if (result === undefined) result = scheduleTasks(input, { explain: true })
    const tasks = new Map(input.tasks.map(task => [task.id, task]))
    for (const task of input.tasks) {
      if (task.deadline !== undefined && (typeof task.deadline !== 'number' || !Number.isFinite(task.deadline))) {
        throw new RangeError('Invalid task deadline: ' + task.id)
      }
    }
    const resourceIds = input.resources ? uniqueIds(input.resources, 'resource') : undefined
    const check = createAssignmentChecker({
      hasTask: id => tasks.has(id), hasResource: id => !resourceIds || resourceIds.has(id), units: false,
    })
    const assignments = new Map<string, ResourceAssignment>()
    const resourcesByTask = new Map<string, string[]>()
    for (const assignment of input.assignments ?? []) {
      check(assignment ?? {} as ResourceAssignment)
      const { taskId, resourceId } = assignment
      assignments.set(pairKey(taskId, resourceId), assignment)
      const list = resourcesByTask.get(taskId)
      if (list) list.push(resourceId)
      else resourcesByTask.set(taskId, [resourceId])
    }

    if (model) checkResult(input, tasks, model.inactive, result)

    let load = scenario.load
    if (load !== undefined) {
      if (!Array.isArray(load)) throw new Error('The load must be an array of segments')
      checkLoad(load)
    } else if (result.ok && input.resources) {
      load = calculateResourceLoad(input.range, result.tasks, input.resources, input.assignments ?? [], {
        ...(result.inactiveTaskIds ? { inactiveTaskIds: result.inactiveTaskIds } : {}),
      })
    }
    return { input, tasks, assignments, resourcesByTask, result, ...(load ? { load } : {}) }
  })
}

/**
 * Check that a given result was calculated from the task set of its input. Only a successful result lists tasks, so
 * only it is checked: every result task must be an active task of the input, no task may appear twice, every active
 * task of the input must appear, and `inactiveTaskIds` must list exactly the inactive tasks of the input (the tasks
 * marked `inactive` and the subtasks of an inactive summary), each once. This detects a result calculated before a
 * task was added, removed, activated or deactivated; it cannot detect a result for an older version of the same tasks
 * (for example a changed duration), which needs a revision shared by the result and its input.
 */
function checkResult(
  input: PlanComparisonInput, tasks: ReadonlyMap<string, PlanComparisonTask>, inactive: ReadonlySet<string>,
  result: ScheduleResult | LevelResourcesResult,
) {
  if (!result || typeof result !== 'object' || typeof result.ok !== 'boolean') throw new Error('Invalid schedule result')
  if (!result.ok) return
  if (!Array.isArray(result.tasks)) throw new Error('Invalid schedule result')
  const seen = new Set<string>()
  for (const task of result.tasks) {
    const id = task?.id
    if (typeof id !== 'string' || !tasks.has(id) || inactive.has(id)) {
      throw new Error(`The result names task ${id}, which is not an active task of its input`)
    }
    if (seen.has(id)) throw new Error(`The result lists task ${id} more than once`)
    seen.add(id)
  }
  for (const task of input.tasks) {
    if (!inactive.has(task.id) && !seen.has(task.id)) {
      throw new Error(`The result has no entry for task ${task.id}, an active task of its input; recalculate it from this input`)
    }
  }
  const listed = result.inactiveTaskIds ?? []
  if (!Array.isArray(listed)) throw new Error('Invalid schedule result')
  const inactiveSeen = new Set<string>()
  for (const id of listed) {
    if (!inactive.has(id) || inactiveSeen.has(id)) {
      throw new Error(`The result lists task ${id} as inactive, which is not an inactive task of its input`)
    }
    inactiveSeen.add(id)
  }
  for (const id of inactive) {
    if (!inactiveSeen.has(id)) throw new Error(`The result does not list task ${id} as inactive, an inactive task of its input; recalculate it from this input`)
  }
}

/** Segments of one resource must not overlap, so that no overload is counted twice. */
function checkLoad(load: readonly ResourceLoadSegment[]) {
  const byResource = new Map<string, ResourceLoadSegment[]>()
  for (const segment of load) {
    if (!segment || typeof segment.resourceId !== 'string' || !segment.resourceId) throw new Error('Invalid resource load segment')
    if (![segment.start, segment.end, segment.overload].every(Number.isFinite) || segment.end < segment.start || segment.overload < 0) {
      throw new RangeError(`A resource load segment needs finite ordered dates and a nonnegative overload: ${segment.resourceId}`)
    }
    const list = byResource.get(segment.resourceId)
    if (list) list.push(segment)
    else byResource.set(segment.resourceId, [segment])
  }
  for (const [resourceId, segments] of byResource) {
    const sorted = [...segments].sort((a, b) => a.start - b.start || a.end - b.end)
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i]!.start < sorted[i - 1]!.end) {
        throw new RangeError(`Overlapping load segments of resource ${resourceId} would count its overload twice`)
      }
    }
  }
}

function stateOf(result: ScheduleResult | LevelResourcesResult): PlanScheduleState {
  if (result.ok) return { status: 'scheduled', finish: result.finish }
  if (result.code === 'cycle') return { status: 'cycle', cycles: result.cycles }
  return {
    status: 'infeasible', taskId: result.taskId, constraints: result.constraints, dependencyIds: result.dependencyIds,
    deadline: result.constraints.includes('deadline'),
  }
}

function sidesOf(plan: Prepared): Map<string, PlanTaskSide> {
  const sides = new Map<string, PlanTaskSide>()
  const { result } = plan
  for (const task of plan.input.tasks) sides.set(task.id, task.inactive === true ? { state: 'inactive' } : { state: 'unscheduled' })
  if (result.ok) {
    for (const id of result.inactiveTaskIds ?? []) sides.set(id, { state: 'inactive' })
    for (const task of result.tasks) {
      const side: PlanTaskSide = { state: 'scheduled', start: task.start, end: task.end, critical: task.critical }
      if (task.summary) side.summary = true
      if (task.manual) side.manual = true
      sides.set(task.id, side)
    }
  }
  return sides
}

function violationsOf(plan: Prepared): PlanViolation[] | undefined {
  const { result } = plan
  if (!result.ok) return undefined
  const violations: PlanViolation[] = []
  for (const task of result.tasks) {
    const deadline = plan.tasks.get(task.id)?.deadline
    if (deadline !== undefined && task.end > deadline) violations.push({ code: 'deadline', taskId: task.id, deadline, finish: task.end })
  }
  for (const { taskId, dependencyId } of result.manualConflicts ?? []) violations.push({ code: 'manual-conflict', taskId, dependencyId })
  for (const taskId of 'unresolvedTaskIds' in result ? result.unresolvedTaskIds : []) violations.push({ code: 'leveling-unresolved', taskId })
  return violations
}

const violationKey = (violation: PlanViolation) =>
  JSON.stringify([violation.code, violation.taskId, violation.code === 'manual-conflict' ? violation.dependencyId : null])

function overloadOf(plan: Prepared): Map<string, number> | undefined {
  if (!plan.result.ok || !plan.load) return undefined
  const totals = new Map<string, number>()
  for (const resource of plan.input.resources ?? []) totals.set(resource.id, 0)
  for (const segment of plan.load) {
    totals.set(segment.resourceId, (totals.get(segment.resourceId) ?? 0) + segment.overload * (segment.end - segment.start))
  }
  return totals
}

function reasonsOf(result: ScheduleResult | LevelResourcesResult) {
  const trace = result.ok && 'trace' in result ? (result as { trace?: ScheduleTrace }).trace : undefined
  if (!trace) return undefined
  const byId = new Map(trace.reasons.map(reason => [reason.id, reason]))
  return (taskId: string) => (trace.taskReasonIds.get(taskId) ?? []).map(id => byId.get(id)!).filter(Boolean)
}

const sameSide = (a: PlanTaskSide, b: PlanTaskSide) => sameValue(a, b)

/**
 * Compare a candidate plan with the current plan. Tasks, dependencies, calendars, resources and assignments are matched
 * by ID (assignments by task and resource). The result has two separate parts: `input`, the differences of the inputs,
 * and `result`, the differences of the calculated schedules (dates, critical flags, final completion, violations and
 * cumulative overload per resource). A task whose own input or assignments differ is `edited`; a task whose input is
 * unchanged but whose result differs is listed in `consequenceTaskIds`. A plan that cannot be scheduled (cycle or
 * infeasible, a deadline failure included) is reported in `result.state` and the input differences are still returned.
 * Missing results are calculated with `scheduleTasks(input, { explain: true })`. Each side is validated by the
 * scheduler's own rules (also when its result is given) and the shared resource and assignment checks; every error of a
 * side ends with ` (current plan)` or ` (candidate plan)` and keeps the class of its check. Throws Error for duplicate or
 * invalid IDs, other invalid scheduling input, unknown assignment references and results that do not match their input,
 * and RangeError for invalid numbers, deadlines or load segments. The arguments are not modified.
 *
 * A given successful `result` must match the task set of its input: each active task (not `inactive` and not under an
 * inactive summary) appears exactly once in `result.tasks`, no other task appears, and `inactiveTaskIds` lists exactly
 * the inactive tasks. Otherwise an Error is thrown, so a result calculated before a task was added, removed or
 * (de)activated is rejected instead of being compared as a complete plan. The check compares task sets only: a result
 * calculated for an earlier version of the same tasks (a changed duration, dependency or calendar) cannot be detected
 * and is compared as given; keep a revision shared by the input and its result, or omit `result`, when that matters. A
 * failed result (cycle or infeasible) lists no tasks and is checked only for its shape. A `partial` plan is checked the
 * same way: its result must have been calculated from the loaded input it is passed with.
 */
export function comparePlans(current: PlanScenario, candidate: PlanScenario): PlanComparison {
  const before = prepare(current, 'current')
  const after = prepare(candidate, 'candidate')

  // ---- input differences ----
  const settings = changedFields(before.input, after.input, collections)
  const tasks = diffCollection(before.input.tasks, after.input.tasks)
  const dependencies = diffCollection(before.input.dependencies ?? [], after.input.dependencies ?? [])
  const calendars = diffCollection(before.input.calendars ?? [], after.input.calendars ?? [])
  const resources = diffCollection(before.input.resources ?? [], after.input.resources ?? [])
  const added: ResourceAssignment[] = [], removed: ResourceAssignment[] = [], changedAssignments: PlanAssignmentChange[] = []
  const assignmentTasks = new Set<string>()
  for (const [key, assignment] of before.assignments) {
    const next = after.assignments.get(key)
    if (!next) {
      removed.push({ ...assignment })
      assignmentTasks.add(assignment.taskId)
      continue
    }
    const fields = changedFields({ units: 1, ...assignment }, { units: 1, ...next }, new Set(['taskId', 'resourceId']))
    if (fields.length) {
      changedAssignments.push({ taskId: assignment.taskId, resourceId: assignment.resourceId, fields })
      assignmentTasks.add(assignment.taskId)
    }
  }
  for (const [key, assignment] of after.assignments) {
    if (before.assignments.has(key)) continue
    added.push({ ...assignment })
    assignmentTasks.add(assignment.taskId)
  }
  const taskOrder = [...before.input.tasks.map(task => task.id), ...tasks.added]
  const input: PlanInputDiff = {
    settings, tasks, dependencies, calendars, resources,
    assignments: { added, removed, changed: changedAssignments, taskIds: taskOrder.filter(id => assignmentTasks.has(id)) },
  }

  // ---- result differences ----
  const state = { current: stateOf(before.result), candidate: stateOf(after.result) }
  const comparable = before.result.ok && after.result.ok
  const fieldsById = new Map(tasks.changed.map(change => [change.id, change.fields]))
  const addedIds = new Set(tasks.added), removedIds = new Set(tasks.removed)
  const beforeSides = sidesOf(before), afterSides = sidesOf(after)
  const beforeReasons = reasonsOf(before.result), afterReasons = reasonsOf(after.result)
  const entries: PlanTaskComparison[] = []
  for (const id of taskOrder) {
    const fields = fieldsById.get(id) ?? []
    const assignmentsChanged = assignmentTasks.has(id)
    const inputChange = addedIds.has(id) ? 'added' : removedIds.has(id) ? 'removed'
      : fields.length || assignmentsChanged ? 'changed' : 'unchanged'
    const sideBefore = beforeSides.get(id) ?? { state: 'absent' }
    const sideAfter = afterSides.get(id) ?? { state: 'absent' }
    const differs = comparable && !sameSide(sideBefore, sideAfter)
    if (inputChange === 'unchanged' && !differs) continue
    const entry: PlanTaskComparison = {
      id, edited: inputChange !== 'unchanged', input: inputChange, fields, assignmentsChanged,
      current: sideBefore, candidate: sideAfter,
      resourceIds: { current: [...before.resourcesByTask.get(id) ?? []], candidate: [...after.resourcesByTask.get(id) ?? []] },
    }
    if (sideBefore.state === 'scheduled' && sideAfter.state === 'scheduled') {
      entry.startShift = sideAfter.start - sideBefore.start
      entry.finishShift = sideAfter.end - sideBefore.end
      if (sideBefore.critical !== sideAfter.critical) entry.critical = sideAfter.critical ? 'gained' : 'lost'
    }
    if (beforeReasons || afterReasons) {
      entry.reasons = {
        ...(beforeReasons && sideBefore.state === 'scheduled' ? { current: beforeReasons(id) } : {}),
        ...(afterReasons && sideAfter.state === 'scheduled' ? { candidate: afterReasons(id) } : {}),
      }
    }
    entries.push(entry)
  }

  const finish: PlanResultDiff['finish'] = {}
  if (before.result.ok) finish.current = before.result.finish
  if (after.result.ok) finish.candidate = after.result.finish
  if (finish.current !== undefined && finish.candidate !== undefined) finish.shift = finish.candidate - finish.current

  const criticalBefore = before.result.ok ? before.result.criticalDependencyIds : []
  const criticalAfter = after.result.ok ? after.result.criticalDependencyIds : []
  const criticalDependencies = comparable
    ? {
      gained: criticalAfter.filter(id => !criticalBefore.includes(id)),
      lost: criticalBefore.filter(id => !criticalAfter.includes(id)),
    }
    : { gained: [], lost: [] }

  const violationsBefore = violationsOf(before), violationsAfter = violationsOf(after)
  const violations: PlanResultDiff['violations'] = { gained: [], lost: [] }
  if (violationsBefore) violations.current = violationsBefore
  if (violationsAfter) violations.candidate = violationsAfter
  if (violationsBefore && violationsAfter) {
    const keysBefore = new Set(violationsBefore.map(violationKey)), keysAfter = new Set(violationsAfter.map(violationKey))
    violations.gained = violationsAfter.filter(item => !keysBefore.has(violationKey(item)))
    violations.lost = violationsBefore.filter(item => !keysAfter.has(violationKey(item)))
  }

  const overloadBefore = overloadOf(before), overloadAfter = overloadOf(after)
  const overloadIds = [...new Set([...overloadBefore?.keys() ?? [], ...overloadAfter?.keys() ?? []])]
  const overload = overloadIds.map(resourceId => {
    const item: PlanResourceOverload = { resourceId }
    const a = overloadBefore?.get(resourceId), b = overloadAfter?.get(resourceId)
    if (a !== undefined) item.current = a
    if (b !== undefined) item.candidate = b
    if (a !== undefined && b !== undefined) item.change = b - a
    return item
  })

  const result: PlanResultDiff = {
    state, comparable, finish, tasks: entries,
    editedTaskIds: entries.filter(entry => entry.edited).map(entry => entry.id),
    consequenceTaskIds: entries.filter(entry => !entry.edited).map(entry => entry.id),
    criticalDependencies, violations, overload,
  }
  const inputEmpty = !settings.length && [tasks, dependencies, calendars, resources].every(diff =>
    !diff.added.length && !diff.removed.length && !diff.changed.length) && !assignmentTasks.size
  const empty = inputEmpty && sameValue(state.current, state.candidate) && !entries.length && !criticalDependencies.gained.length
    && !criticalDependencies.lost.length && !violations.gained.length && !violations.lost.length
    && overload.every(item => item.current === item.candidate)
  const partial = { current: current.partial === true, candidate: candidate.partial === true }
  const revision: PlanComparison['revision'] = {
    stale: current.revision !== undefined && candidate.baseRevision !== undefined && current.revision !== candidate.baseRevision,
  }
  if (current.revision !== undefined) revision.current = current.revision
  if (candidate.baseRevision !== undefined) revision.base = candidate.baseRevision
  return { complete: !partial.current && !partial.candidate, partial, revision, empty, input, result }
}

export interface PlanComparisonTargetOptions {
  /** The tasks to resolve. Defaults to every task of `comparison.result.tasks`. */
  taskIds?: Iterable<string>
  /** The entity kind of tasks in the bindings. Defaults to `task`. */
  entityKind?: string
}

export interface PlanComparisonTargets {
  entities: EntityRef[]
  /** The bound targets of `entities`, as `resolveViewTargets` returns them. */
  targets: ViewTarget[]
  /** Entities that no binding reaches. */
  unknown: EntityRef[]
  /**
   * The before and after ranges of each task on each resource it is assigned to in that plan, for
   * `highlightedLoadTargets`. Only tasks in `comparison.result.tasks` have them; empty ranges are left out.
   */
  load: LoadViewTarget[]
}

/**
 * Turn compared tasks into view targets for the existing highlight props: the targets bound to the tasks (through a
 * `buildViewBindingIndex` index), and load targets covering each task's dates in both plans. A view projection only;
 * the comparison is not modified.
 */
export function planComparisonTargets(
  comparison: PlanComparison, index: ViewBindingIndex, options: PlanComparisonTargetOptions = {},
): PlanComparisonTargets {
  if (!comparison || !comparison.result || !Array.isArray(comparison.result.tasks)) throw new Error('Invalid plan comparison')
  const kind = options.entityKind ?? 'task'
  const ids = options.taskIds === undefined ? comparison.result.tasks.map(entry => entry.id) : [...new Set(options.taskIds)]
  const entities = ids.map(id => ({ kind, id }))
  const resolved = resolveViewTargets(index, entities)
  const byId = new Map(comparison.result.tasks.map(entry => [entry.id, entry]))
  const load: LoadViewTarget[] = []
  const seen = new Set<string>()
  for (const id of ids) {
    const entry = byId.get(id)
    if (!entry) continue
    for (const side of ['current', 'candidate'] as const) {
      const dates = entry[side]
      if (dates.state !== 'scheduled' || dates.end <= dates.start) continue
      for (const resourceId of entry.resourceIds[side]) {
        const key = JSON.stringify([resourceId, dates.start, dates.end])
        if (seen.has(key)) continue
        seen.add(key)
        load.push({ view: 'load', resourceId, start: dates.start, end: dates.end })
      }
    }
  }
  return { entities, targets: resolved.targets, unknown: resolved.unknown, load }
}

/**
 * The dates of a scheduled plan as one named baseline set, keyed by task ID, to add to `TimelineBar.baselines` of
 * another plan's bars so that GanttChart draws "before" under "after". Throws Error for an unscheduled result or an
 * empty or reserved set ID.
 */
export function planBaselines(result: ScheduleResult | LevelResourcesResult, id: string): Map<string, TimelineBaseline> {
  if (!result || result.ok !== true) throw new Error('planBaselines needs a successful schedule result')
  if (!isId(id) || id === timelineBaselineId) throw invalidIdError('baseline set', id)
  return new Map(result.tasks.map(task => [task.id, { id, start: task.start, end: task.end }]))
}
