import type { ResourceAssignment } from './resourceLoad.js'
import type { ScheduleInput } from './scheduling.js'
import { checkId, unknownEndpointError } from './ids.js'
import { createAssignmentChecker } from './resourceCapacity.js'

/** Schedule input with optional assignments, such as a `LevelResourcesInput`. */
export interface PlacementInput extends ScheduleInput {
  assignments?: readonly ResourceAssignment[]
}

/** A placed task that depends on a task that is not placed. */
export interface PlacementDiagnostic {
  code: 'unplaced-predecessor'
  /** The placed task. */
  taskId: string
  /** The task that is not placed. */
  predecessorId: string
  dependencyId: string
}

export interface PlacementResult<I extends PlacementInput = PlacementInput> {
  /** False when a placed task depends on a task that is not placed. Do not present the plan as feasible then. */
  ok: boolean
  /**
   * The input with only the placed tasks, the links between them and their assignments. `scheduleTasks`,
   * `levelResources` and `calculateResourceLoad` accept it without unknown-task errors.
   */
  input: I
  /** One entry per link from an unplaced task to a placed task, in link order. */
  diagnostics: readonly PlacementDiagnostic[]
  /** Input tasks that are not placed, in input order. */
  unplacedTaskIds: readonly string[]
  /** Links left out because an endpoint is not placed, in input order. */
  excludedDependencyIds: readonly string[]
  /** Assignments of tasks that are not placed, in input order. They do not count towards resource load. */
  excludedAssignments: readonly ResourceAssignment[]
}

/**
 * Build a computable schedule input for the placed tasks only. Unplaced tasks keep no invented dates: they, their
 * links and their assignments are left out of the input. A link from an unplaced task to a placed one is reported as
 * an `unplaced-predecessor` diagnostic and makes the result not `ok`, instead of the scheduler throwing or the link
 * being dropped silently. A link from a placed task to an unplaced one is only excluded. So is a link that the scheduler
 * ignores anyway: one that touches an `inactive` task, or one into a placed task with `manual` dates. A placed task
 * whose `parentId` names an unplaced task gets the ID of its nearest placed ancestor instead, or none at the top.
 *
 * Malformed input still throws an Error: duplicate or empty task, link or placed IDs, a placed ID or a link or
 * assignment endpoint that is not an input task, and duplicate assignments. The input is not modified.
 */
export function buildPlacementInput<I extends PlacementInput>(input: I, placedTaskIds: Iterable<string>): PlacementResult<I> {
  const taskIds = new Set<string>()
  // Links that bind nothing in the scheduler: those touching an inactive task and those into a manual task.
  const inactive = new Set<string>(), manual = new Set<string>()
  for (const task of input.tasks) {
    checkId('task', task.id, taskIds)
    if (task.inactive === true) inactive.add(task.id)
    if (task.manual !== undefined) manual.add(task.id)
  }
  const placed = new Set<string>()
  for (const id of placedTaskIds) {
    if (!taskIds.has(id)) throw new Error('Unknown task to place: ' + id)
    if (placed.has(id)) throw new Error('Duplicate task to place: ' + id)
    placed.add(id)
  }

  const linkIds = new Set<string>()
  const dependencies: NonNullable<I['dependencies']>[number][] = []
  const diagnostics: PlacementDiagnostic[] = [], excludedDependencyIds: string[] = []
  for (const link of input.dependencies ?? []) {
    checkId('dependency', link.id, linkIds)
    for (const end of [link.from, link.to]) if (!taskIds.has(end)) throw unknownEndpointError(link.id)
    const fromPlaced = placed.has(link.from), toPlaced = placed.has(link.to)
    if (fromPlaced && toPlaced) {
      dependencies.push(link)
      continue
    }
    excludedDependencyIds.push(link.id)
    if (toPlaced && !inactive.has(link.from) && !inactive.has(link.to) && !manual.has(link.to)) {
      diagnostics.push({ code: 'unplaced-predecessor', taskId: link.to, predecessorId: link.from, dependencyId: link.id })
    }
  }

  // Resources are not part of a placement input, so any valid resource ID is accepted.
  const check = createAssignmentChecker({ hasTask: id => taskIds.has(id), hasResource: () => true, units: false })
  const assignments: ResourceAssignment[] = [], excludedAssignments: ResourceAssignment[] = []
  for (const assignment of input.assignments ?? []) {
    check(assignment)
    ;(placed.has(assignment.taskId) ? assignments : excludedAssignments).push(assignment)
  }

  // A placed subtask of an unplaced summary moves up to its nearest placed ancestor, or to the top level.
  const parents = new Map(input.tasks.map(task => [task.id, task.parentId]))
  const placedParent = (task: I['tasks'][number]) => {
    const seen = new Set<string>([task.id])
    let parentId = task.parentId
    while (parentId !== undefined && taskIds.has(parentId) && !placed.has(parentId)) {
      if (seen.has(parentId)) return task.parentId // A parent cycle: scheduleTasks reports it.
      seen.add(parentId)
      parentId = parents.get(parentId)
    }
    return parentId
  }
  const tasks = input.tasks.filter(task => placed.has(task.id)).map(task => {
    if (task.parentId === undefined) return task
    const parentId = placedParent(task)
    if (parentId === task.parentId) return task
    const { parentId: _unplaced, ...rest } = task
    return parentId === undefined ? rest : { ...rest, parentId }
  })
  const result: I = { ...input, tasks }
  if (input.dependencies !== undefined) result.dependencies = dependencies
  if (input.assignments !== undefined) result.assignments = assignments
  return {
    ok: diagnostics.length === 0,
    input: result,
    diagnostics,
    unplacedTaskIds: input.tasks.filter(task => !placed.has(task.id)).map(task => task.id),
    excludedDependencyIds,
    excludedAssignments,
  }
}
