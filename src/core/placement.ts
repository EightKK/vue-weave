import type { ResourceAssignment } from './resourceLoad.js'
import type { ScheduleInput, ScheduleTask } from './scheduling.js'
import { checkId, unknownEndpointError } from './ids.js'
import { createAssignmentChecker } from './resourceCapacity.js'
import { checkParentId, checkSummaryHierarchy, checkSummaryLink } from './scheduleModel.js'

/** Schedule input with optional assignments, such as a `LevelResourcesInput`. */
export interface PlacementInput extends ScheduleInput {
  assignments?: readonly ResourceAssignment[]
}

/** Why the placement input cannot represent part of the plan. Check `code` before reading the other fields. */
export type PlacementDiagnostic = PlacementPredecessorDiagnostic | PlacementSummaryDiagnostic

/** A placed task that depends on a task that is not placed. */
export interface PlacementPredecessorDiagnostic {
  code: 'unplaced-predecessor'
  /** The placed task. For a link into an unplaced summary task, the placed leaf subtask that the link binds. */
  taskId: string
  /** The task that is not placed. */
  predecessorId: string
  dependencyId: string
}

/**
 * A placed summary task none of whose active subtasks is placed. It has nothing placed to span, so the placement input
 * leaves it out, together with its links and assignments.
 */
export interface PlacementSummaryDiagnostic {
  code: 'unplaced-subtasks'
  /** The placed summary task. */
  taskId: string
}

/**
 * A link of the placement input that stands for an input link into an unplaced summary task. The scheduler attaches
 * such a link to each active leaf subtask of the summary, so the placement input has one link per placed leaf.
 */
export interface PlacementRetargetedDependency {
  /** The ID of the link in the placement input, such as in `criticalDependencyIds` or a trace. */
  id: string
  /** The input link it stands for. */
  dependencyId: string
  /** The unplaced summary task that the input link ends at. */
  summaryId: string
  /** The placed leaf subtask that the link binds instead. */
  taskId: string
}

export interface PlacementResult<I extends PlacementInput = PlacementInput> {
  /**
   * False when the placement input cannot represent the plan: a placed task depends on a task that is not placed, or a
   * placed summary task has no placed active subtask. Do not present the plan as feasible then.
   */
  ok: boolean
  /**
   * The input with only the placed tasks, the links between them and their assignments. `scheduleTasks`,
   * `levelResources` and `calculateResourceLoad` accept it without unknown-task errors.
   */
  input: I
  /**
   * First one `unplaced-subtasks` entry per placed summary task without a placed active subtask, in input order; then
   * one `unplaced-predecessor` entry per link from an unplaced task and placed task that it binds, in link order.
   */
  diagnostics: readonly PlacementDiagnostic[]
  /** Input tasks that are not placed, in input order. */
  unplacedTaskIds: readonly string[]
  /** Links left out because an endpoint is not placed or is a summary task left out, in input order. */
  excludedDependencyIds: readonly string[]
  /**
   * Assignments of tasks that are not placed or are summary tasks left out, in input order. They do not count towards
   * resource load.
   */
  excludedAssignments: readonly ResourceAssignment[]
  /**
   * The links that replace an excluded link from a placed task into an unplaced summary task, in link order and then
   * in hierarchy order of the subtasks. Map their IDs back with `dependencyId`. Present only when not empty.
   */
  retargetedDependencies?: readonly PlacementRetargetedDependency[]
}

/**
 * Build a computable schedule input for the placed tasks only. Unplaced tasks keep no invented dates: they, their
 * links and their assignments are left out of the input. A link from an unplaced task to a placed one is reported as
 * an `unplaced-predecessor` diagnostic and makes the result not `ok`, instead of the scheduler throwing or the link
 * being dropped silently. A link from a placed task to an unplaced one is only excluded. So is a link that the scheduler
 * ignores anyway: one that touches an `inactive` task, or one into a placed task with `manual` dates.
 *
 * Summary tasks (`parentId`): leaving out an unplaced summary keeps what binds its placed subtasks. A placed task whose
 * `parentId` names an unplaced task gets the ID of its nearest placed ancestor instead, or none at the top; the
 * `startNoEarlierThan` and `finishNoLaterThan` of the unplaced ancestors it skips become its own when they are tighter,
 * and a placed task that one of them makes inactive gets `inactive: true`. An FS or SS link into an unplaced summary
 * binds its placed active leaf subtasks: from a placed task it is replaced by one link per leaf (see
 * `retargetedDependencies`), from an unplaced task it is an `unplaced-predecessor` diagnostic per leaf. A link from an
 * unplaced summary is a link from an unplaced task. Inactive means inactive as the scheduler sees it, including tasks
 * below an inactive summary and summaries without an active leaf.
 *
 * A placed summary task that is active in the full plan but has no placed active leaf subtask has nothing placed to
 * span. It is reported as an `unplaced-subtasks` diagnostic, which makes the result not `ok`, and is then treated as
 * an unplaced summary: it, its links and its assignments are left out (it is not listed in `unplacedTaskIds`), its
 * placed subtasks move up and take over its bounds, and a link from it is an `unplaced-predecessor` diagnostic.
 *
 * Malformed input still throws an Error: duplicate or empty task, link or placed IDs, a placed ID or a link or
 * assignment endpoint that is not an input task, and duplicate assignments. An input with `parentId` must also meet the
 * scheduler's summary task rules whether or not the tasks concerned are placed, with the scheduler's errors: valid and
 * known parent IDs without cycles, no `fixedStart`, `startNoLaterThan`, `finishNoEarlierThan`, `manual` or
 * `mode: 'alap'` on a summary, no link between a summary and its own subtask, and no FF or SF link into a summary. The
 * input is not modified.
 */
export function buildPlacementInput<I extends PlacementInput>(input: I, placedTaskIds: Iterable<string>): PlacementResult<I> {
  const taskIds = new Set<string>()
  // Links that bind nothing in the scheduler: those touching an inactive task and those into a manual task.
  const manual = new Set<string>()
  const ownInactive = new Set<string>()
  for (const task of input.tasks) {
    checkId('task', task.id, taskIds)
    if (task.inactive === true) ownInactive.add(task.id)
    if (task.manual !== undefined) manual.add(task.id)
  }
  let placed = new Set<string>()
  for (const id of placedTaskIds) {
    if (!taskIds.has(id)) throw new Error('Unknown task to place: ' + id)
    if (placed.has(id)) throw new Error('Duplicate task to place: ' + id)
    placed.add(id)
  }
  // The scheduler's hierarchy rules apply to the whole input, so that an input fails the same way whatever is placed.
  let tree: ReturnType<typeof summaryTree> | undefined
  if (input.tasks.some(task => task.parentId !== undefined)) {
    for (const task of input.tasks) checkParentId(task)
    tree = summaryTree(input.tasks, ownInactive)
  }
  const inactive = tree?.inactive ?? ownInactive

  const linkIds = new Set<string>()
  for (const link of input.dependencies ?? []) {
    checkId('dependency', link.id, linkIds)
    for (const end of [link.from, link.to]) if (!taskIds.has(end)) throw unknownEndpointError(link.id)
    if (tree) checkSummaryLink(link, tree)
  }

  // A placed summary that is active in the full plan but has no placed active leaf has nothing placed to span: it is
  // reported and then left out like an unplaced summary. From here on `placed` holds the tasks that the input keeps.
  const requested = placed
  const diagnostics: PlacementDiagnostic[] = []
  if (tree) {
    const spanning = tree.withLeafIn(id => requested.has(id) && !inactive.has(id))
    for (const task of input.tasks) {
      if (!requested.has(task.id) || !tree.isSummary(task.id) || inactive.has(task.id) || spanning.has(task.id)) continue
      if (placed === requested) placed = new Set(requested)
      placed.delete(task.id)
      diagnostics.push({ code: 'unplaced-subtasks', taskId: task.id })
    }
  }
  const dependencies: NonNullable<I['dependencies']>[number][] = []
  const excludedDependencyIds: string[] = []
  const retargeted: PlacementRetargetedDependency[] = []
  const usedIds = new Set(linkIds)
  const retargetId = (link: string, task: string) => {
    let id = link + '@' + task
    for (let n = 2; usedIds.has(id); n++) id = link + '@' + task + '#' + n
    usedIds.add(id)
    return id
  }
  for (const link of input.dependencies ?? []) {
    const fromPlaced = placed.has(link.from), toPlaced = placed.has(link.to)
    if (fromPlaced && toPlaced) {
      dependencies.push(link)
      continue
    }
    excludedDependencyIds.push(link.id)
    if (inactive.has(link.from) || inactive.has(link.to)) continue
    if (toPlaced) {
      if (!manual.has(link.to)) diagnostics.push({ code: 'unplaced-predecessor', taskId: link.to, predecessorId: link.from, dependencyId: link.id })
      continue
    }
    // A link into an unplaced summary binds its active leaf subtasks. FF and SF links into a summary and links between a
    // summary and its own subtask were rejected above.
    if (!tree?.isSummary(link.to)) continue
    for (const leaf of tree.leaves(link.to)) {
      if (!placed.has(leaf) || inactive.has(leaf)) continue
      if (fromPlaced) {
        const id = retargetId(link.id, leaf)
        dependencies.push({ ...link, id, to: leaf })
        retargeted.push({ id, dependencyId: link.id, summaryId: link.to, taskId: leaf })
      } else if (!manual.has(leaf)) {
        diagnostics.push({ code: 'unplaced-predecessor', taskId: leaf, predecessorId: link.from, dependencyId: link.id })
      }
    }
  }

  // Resources are not part of a placement input, so any valid resource ID is accepted.
  const check = createAssignmentChecker({ hasTask: id => taskIds.has(id), hasResource: () => true, units: false })
  const assignments: ResourceAssignment[] = [], excludedAssignments: ResourceAssignment[] = []
  for (const assignment of input.assignments ?? []) {
    check(assignment)
    ;(placed.has(assignment.taskId) ? assignments : excludedAssignments).push(assignment)
  }

  // A placed subtask of an unplaced summary (or of a summary left out) moves up to its nearest kept ancestor, or to the
  // top level, and takes over the bounds of the summaries it skips, combined as the scheduler combines inherited
  // bounds: tightest wins. The hierarchy was checked above, so the walk ends.
  const byId = new Map(input.tasks.map(task => [task.id, task]))
  const placedParent = (task: ScheduleTask) => {
    let parentId = task.parentId, lower: number | undefined, upper: number | undefined
    while (parentId !== undefined && !placed.has(parentId)) {
      const parent = byId.get(parentId)!
      const { startNoEarlierThan: start, finishNoLaterThan: finish } = parent
      if (start !== undefined && (lower === undefined || start > lower)) lower = start
      if (finish !== undefined && (upper === undefined || finish < upper)) upper = finish
      parentId = parent.parentId
    }
    return { parentId, lower, upper }
  }
  const tasks = input.tasks.filter(task => placed.has(task.id)).map(task => {
    const { parentId, lower, upper } = task.parentId === undefined ? { parentId: undefined } : placedParent(task)
    // Inactive by inheritance from an unplaced summary, or a summary whose active leaves are all inactive: the topmost
    // such placed task is marked, and the scheduler passes it down to the placed tasks below it.
    const off = tree !== undefined && task.inactive !== true && inactive.has(task.id) && !(parentId !== undefined && inactive.has(parentId))
    if (parentId === task.parentId && !off) return task
    const { parentId: _unplaced, ...rest } = task
    const next: Omit<typeof task, 'parentId'> & Partial<ScheduleTask> = parentId === undefined ? rest : { ...rest, parentId }
    if (lower !== undefined && (task.startNoEarlierThan === undefined || lower > task.startNoEarlierThan)) next.startNoEarlierThan = lower
    if (upper !== undefined && (task.finishNoLaterThan === undefined || upper < task.finishNoLaterThan)) next.finishNoLaterThan = upper
    if (off) next.inactive = true
    return next as typeof task
  })
  const result: I = { ...input, tasks }
  if (input.dependencies !== undefined) result.dependencies = dependencies
  if (input.assignments !== undefined) result.assignments = assignments
  const placement: PlacementResult<I> = {
    ok: diagnostics.length === 0,
    input: result,
    diagnostics,
    unplacedTaskIds: input.tasks.filter(task => !requested.has(task.id)).map(task => task.id),
    excludedDependencyIds,
    excludedAssignments,
  }
  if (retargeted.length) placement.retargetedDependencies = retargeted
  return placement
}

/**
 * The summary task hierarchy as the scheduler sees it, after checking it with the scheduler's errors. `inactive` holds
 * every task that the scheduler leaves out: those marked inactive, those below an inactive task and summaries without
 * an active leaf. Iterative, as deep hierarchies occur.
 */
function summaryTree(list: readonly ScheduleTask[], ownInactive: ReadonlySet<string>) {
  const checked = checkSummaryHierarchy(list)
  const roots = checked.roots.map(task => task.id)
  const children = new Map([...checked.children].map(([id, group]) => [id, group.map(task => task.id)]))
  // Pre-order: each subtree is the contiguous slice [pre, end) of `order`.
  const order: string[] = [], pre = new Map<string, number>(), end = new Map<string, number>()
  const parent = new Map<string, string>()
  const stack: { id: string; next: number }[] = []
  for (const root of roots) {
    pre.set(root, order.length)
    order.push(root)
    stack.push({ id: root, next: 0 })
    while (stack.length) {
      const frame = stack.at(-1)!
      const group = children.get(frame.id)
      if (group && frame.next < group.length) {
        const child = group[frame.next++]!
        parent.set(child, frame.id)
        pre.set(child, order.length)
        order.push(child)
        stack.push({ id: child, next: 0 })
        continue
      }
      stack.pop()
      end.set(frame.id, order.length)
    }
  }
  const inactive = new Set<string>()
  for (const id of order) {
    const up = parent.get(id)
    if (ownInactive.has(id) || (up !== undefined && inactive.has(up))) inactive.add(id)
  }
  /** The tasks with a leaf in their subtree, themselves included, for which `test` holds. */
  const withLeafIn = (test: (id: string) => boolean) => {
    const found = new Set<string>()
    for (let i = order.length - 1; i >= 0; i--) {
      const id = order[i]!
      if (!children.has(id) && test(id)) found.add(id)
      if (found.has(id) && parent.has(id)) found.add(parent.get(id)!)
    }
    return found
  }
  const active = withLeafIn(id => !inactive.has(id))
  for (const id of children.keys()) if (!active.has(id)) inactive.add(id)
  return {
    inactive,
    withLeafIn,
    isSummary: (id: string) => children.has(id),
    isAncestor: (ancestor: string, id: string) => pre.get(ancestor)! < pre.get(id)! && pre.get(id)! < end.get(ancestor)!,
    /** The leaf subtasks of a summary, in hierarchy order. */
    leaves: (id: string) => order.slice(pre.get(id)! + 1, end.get(id)!).filter(item => !children.has(item)),
  }
}
