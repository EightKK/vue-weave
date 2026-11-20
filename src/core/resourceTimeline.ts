import type { ResourceAssignment } from './resourceLoad.js'
import { propagateEdit, type ScheduleEdit, type ScheduleInput } from './scheduling.js'
import { assignLanes, type EditMode, type TimeRange } from './timeline.js'
import type { TimelineBar, TimelineCascade, TimelineDependency, TimelineEdit, TimelineRow } from './types.js'
import { checkId, isId, uniqueIds, unknownEndpointError, unknownReferenceError } from './ids.js'
import { createAssignmentChecker, duplicateAssignmentError } from './resourceCapacity.js'

/** A resource shown as one row of a resource timeline. The row ID is the resource ID. */
export interface ResourceTimelineResource<D = unknown> {
  id: string
  /** The row label, also added to the label of every bar in the row. */
  label: string
  detail?: string
  /** Application data, passed to the row unchanged. */
  data?: D
}

/**
 * A placed task: the fields that every projection of the task shares. Dates, progress, constraints, segments and the
 * other bar fields are copied to each projection unchanged; the projection sets `id`, `rowId`, `label` and `lane`.
 */
export type ResourceTimelineTask<D = unknown> = Omit<TimelineBar<D>, 'rowId' | 'lane'>

export interface ResourceTimelineInput<D = unknown, R = unknown> {
  resources: readonly ResourceTimelineResource<R>[]
  /** Placed tasks, for example built with `scheduledBarFields` from a schedule. */
  tasks: readonly ResourceTimelineTask<D>[]
  /**
   * Task-resource pairs. Each task gets one bar in the row of every resource assigned to it, for the whole task even
   * when the assignment covers only part of its work.
   */
  assignments: readonly ResourceAssignment[]
  /** Task-level links, such as the `ScheduleLink` array passed to the scheduler. They use task IDs, not bar IDs. */
  dependencies?: readonly TimelineDependency[]
  /** Tasks that exist but have no dates yet. Their assignments and links are allowed but not drawn. */
  unplannedTaskIds?: readonly string[]
}

export interface ResourceTimelineOptions<D = unknown, R = unknown> {
  /** The bar label. Defaults to `task label · resource label`, so projections of one task have distinct names. */
  barLabel?: (task: ResourceTimelineTask<D>, resource: ResourceTimelineResource<R>) => string
  /** Projections to draw links on, for example the selected bars. Other tasks use their first projection in row order. */
  preferredBarIds?: readonly string[]
}

/** The task and resource that a projected bar shows. */
export interface ResourceBarOrigin {
  taskId: string
  resourceId: string
}

export interface ResourceTimelineProjection<D = unknown, R = unknown> {
  /** One row per resource, in input order. */
  rows: readonly TimelineRow<R>[]
  /** One bar per assignment of a placed task, in task order and then row order, with lanes assigned. */
  bars: readonly TimelineBar<D>[]
  /** One chart link per task link whose tasks both have a bar, between representative projections. */
  dependencies: readonly TimelineDependency[]
  /** The lane count to pass to GanttChart `laneCount`. */
  laneCount: number
  /** Bar ID to the task and resource it shows. */
  origins: ReadonlyMap<string, ResourceBarOrigin>
  /** Task ID to the IDs of its bars, in row order. Placed tasks without an assignment map to an empty list. */
  taskBarIds: ReadonlyMap<string, readonly string[]>
  /** Chart dependency ID to the task link ID it draws. */
  dependencyOrigins: ReadonlyMap<string, string>
  /** Drawn links with an endpoint that has more than one projection: only the representative pair is drawn. */
  omittedDependencyIds: readonly string[]
  /** Links not drawn because a task has no bar (unassigned or unplanned). */
  hiddenDependencyIds: readonly string[]
  /** The unplanned task IDs of the input. */
  unplannedTaskIds: readonly string[]
}

/**
 * The ID of the bar that shows `taskId` in the row of `resourceId`. It is a JSON tuple, so IDs containing any
 * separator stay distinct, and it does not depend on input order.
 */
export function resourceTimelineBarId(taskId: string, resourceId: string): string {
  if (typeof taskId !== 'string' || !taskId || typeof resourceId !== 'string' || !resourceId) {
    throw new Error('A resource timeline bar needs a task ID and a resource ID')
  }
  return JSON.stringify([taskId, resourceId])
}

/**
 * Project tasks onto resource rows for GanttChart. A task assigned to several resources is shown once per resource;
 * the task itself stays one input item, so dates and resource load are not multiplied. Throws an Error for duplicate
 * IDs, an assignment or link to an unknown task or resource, a duplicate assignment or a link from a task to itself.
 * The input is not modified.
 */
export function projectResourceTimeline<D = unknown, R = unknown>(
  input: ResourceTimelineInput<D, R>, options: ResourceTimelineOptions<D, R> = {},
): ResourceTimelineProjection<D, R> {
  const { resources, tasks, assignments, dependencies = [], unplannedTaskIds = [] } = input
  uniqueIds(resources, 'resource')
  uniqueIds(tasks, 'task')
  const unplanned = new Set<string>()
  for (const id of unplannedTaskIds) checkId('unplanned task', id, unplanned)
  const resourceIndex = new Map(resources.map((resource, index) => [resource.id, index]))
  const taskById = new Map(tasks.map(task => [task.id, task]))
  for (const id of unplanned) if (taskById.has(id)) throw new Error('A task cannot be both placed and unplanned: ' + id)

  const assigned = new Map<string, Set<string>>()
  const check = createAssignmentChecker({
    hasResource: id => resourceIndex.has(id), hasTask: id => taskById.has(id) || unplanned.has(id), units: false,
  })
  for (const assignment of assignments) {
    check(assignment)
    const { taskId, resourceId } = assignment
    let set = assigned.get(taskId)
    if (!set) assigned.set(taskId, set = new Set())
    set.add(resourceId)
  }

  const barLabel = options.barLabel ?? ((task, resource) => task.label + ' · ' + resource.label)
  const rawBars: TimelineBar<D>[] = []
  const origins = new Map<string, ResourceBarOrigin>()
  const taskBarIds = new Map<string, string[]>()
  for (const task of tasks) {
    const resourceIds = [...assigned.get(task.id) ?? []].sort((a, b) => resourceIndex.get(a)! - resourceIndex.get(b)!)
    const ids: string[] = []
    for (const resourceId of resourceIds) {
      const resource = resources[resourceIndex.get(resourceId)!]!
      const id = resourceTimelineBarId(task.id, resourceId)
      rawBars.push({ ...task, id, rowId: resourceId, label: barLabel(task, resource) })
      origins.set(id, { taskId: task.id, resourceId })
      ids.push(id)
    }
    taskBarIds.set(task.id, ids)
  }
  const { bars, laneCount } = assignLanes(rawBars)

  uniqueIds(dependencies, 'dependency')
  const preferred = new Set(options.preferredBarIds ?? [])
  const representative = (ids: readonly string[]) => ids.find(id => preferred.has(id)) ?? ids[0]
  const chartDependencies: TimelineDependency[] = []
  const dependencyOrigins = new Map<string, string>()
  const omittedDependencyIds: string[] = [], hiddenDependencyIds: string[] = []
  for (const link of dependencies) {
    for (const end of [link.from, link.to]) {
      if (!taskById.has(end) && !unplanned.has(end)) throw unknownEndpointError(link.id)
    }
    if (link.from === link.to) throw new Error('A dependency cannot link a task to itself: ' + link.id)
    const fromIds = taskBarIds.get(link.from) ?? [], toIds = taskBarIds.get(link.to) ?? []
    if (!fromIds.length || !toIds.length) {
      hiddenDependencyIds.push(link.id)
      continue
    }
    chartDependencies.push({ ...link, from: representative(fromIds)!, to: representative(toIds)! })
    dependencyOrigins.set(link.id, link.id)
    if (fromIds.length > 1 || toIds.length > 1) omittedDependencyIds.push(link.id)
  }

  const rows: TimelineRow<R>[] = resources.map(({ id, label, detail, data }) => {
    const row: TimelineRow<R> = { id, label }
    if (detail !== undefined) row.detail = detail
    if (data !== undefined) row.data = data
    return row
  })
  return {
    rows, bars, dependencies: chartDependencies, laneCount, origins, taskBarIds, dependencyOrigins,
    omittedDependencyIds, hiddenDependencyIds, unplannedTaskIds: [...unplanned],
  }
}

/**
 * A memoized `projectResourceTimeline`. It returns the previous projection, with the same arrays, while the input
 * fields (`resources`, `tasks`, `assignments`, `dependencies`, `unplannedTaskIds`) and the options (`barLabel`,
 * `preferredBarIds`) are the same objects as in the previous call, so a re-render does not cancel a drag in progress.
 */
export function createResourceTimelineProjector<D = unknown, R = unknown>() {
  let last: { keys: readonly unknown[]; projection: ResourceTimelineProjection<D, R> } | undefined
  return (input: ResourceTimelineInput<D, R>, options: ResourceTimelineOptions<D, R> = {}): ResourceTimelineProjection<D, R> => {
    const keys = [
      input.resources, input.tasks, input.assignments, input.dependencies, input.unplannedTaskIds,
      options.barLabel, options.preferredBarIds,
    ]
    if (last && last.keys.every((key, index) => key === keys[index])) return last.projection
    const projection = projectResourceTimeline(input, options)
    last = { keys, projection }
    return projection
  }
}

/** A task date change derived from one or more bar edits. */
export interface ResourceTimelineScheduleChange {
  taskId: string
  before: TimeRange
  after: TimeRange
  mode: EditMode
  source: TimelineEdit['source']
}

/** Replace the assignment of `taskId` to `fromResourceId` with one to `toResourceId`. */
export interface ResourceAssignmentReplacement {
  taskId: string
  fromResourceId: string
  toResourceId: string
}

export type ResourceTimelineRejectionCode = 'stale' | 'already-assigned' | 'conflicting-schedule' | 'conflicting-assignment'

export interface ResourceTimelineRejection {
  ok: false
  /**
   * `stale`: a bar is not in the projection, or its dates or row differ from the edit's `before`.
   * `already-assigned`: a bar is moved to a resource that the task already has.
   * `conflicting-schedule`: projections of one task are given different dates.
   * `conflicting-assignment`: one bar is moved to two rows, or two bars of one task to the same row.
   */
  code: ResourceTimelineRejectionCode
  reason: string
  barIds: readonly string[]
}

export interface ResourceTimelineEditsResolution {
  ok: true
  /** One change per task whose dates change, in the order of first appearance. */
  scheduleChanges: readonly ResourceTimelineScheduleChange[]
  /** One replacement per bar that moves to another row. */
  assignmentReplacements: readonly ResourceAssignmentReplacement[]
}

export interface ResourceTimelineEditResolution {
  ok: true
  scheduleChange?: ResourceTimelineScheduleChange
  assignmentReplacement?: ResourceAssignmentReplacement
}

const sameRange = (a: TimeRange, b: TimeRange) => a.start === b.start && a.end === b.end

/**
 * Resolve GanttChart edits of a resource timeline (for example `edit`, `edits` or the edits of a cascade) to task date
 * changes and assignment replacements. Edits of several projections of one task become one schedule change; they must
 * agree on the new dates. A row change replaces the assignment of the bar's resource; moving to a resource the task
 * already has is rejected. Apply the result as one change, so dates and assignments are accepted or refused together.
 * Throws an Error for a target row that is not in the projection.
 */
export function resolveResourceTimelineEdits(
  projection: Pick<ResourceTimelineProjection, 'bars' | 'rows' | 'origins' | 'taskBarIds'>, edits: readonly TimelineEdit[],
): ResourceTimelineEditsResolution | ResourceTimelineRejection {
  const barById = new Map(projection.bars.map(bar => [bar.id, bar]))
  const rowIds = new Set(projection.rows.map(row => row.id))
  const reject = (code: ResourceTimelineRejectionCode, reason: string, barIds: string[]): ResourceTimelineRejection => ({ ok: false, code, reason, barIds })
  const schedules = new Map<string, ResourceTimelineScheduleChange & { barIds: string[] }>()
  const targets = new Map<string, string>()
  for (const edit of edits) {
    const bar = barById.get(edit.id), origin = projection.origins.get(edit.id)
    if (!bar || !origin) return reject('stale', 'The bar is not in the resource timeline: ' + edit.id, [edit.id])
    if (!sameRange(edit.before, bar)) return reject('stale', 'The bar dates changed after the edit started: ' + edit.id, [edit.id])
    const { taskId } = origin
    const known = schedules.get(taskId)
    if (known) {
      if (!sameRange(known.after, edit.after)) {
        return reject('conflicting-schedule', 'Projections of one task have different dates: ' + taskId, [...known.barIds, edit.id])
      }
      known.barIds.push(edit.id)
    } else {
      schedules.set(taskId, {
        taskId, before: { start: bar.start, end: bar.end }, after: { start: edit.after.start, end: edit.after.end },
        mode: edit.mode, source: edit.source, barIds: [edit.id],
      })
    }
    if (!edit.row || edit.row.before === edit.row.after) continue
    if (edit.row.before !== origin.resourceId) return reject('stale', 'The bar row changed after the edit started: ' + edit.id, [edit.id])
    if (!rowIds.has(edit.row.after)) throw new Error('Unknown resource row: ' + edit.row.after)
    const target = targets.get(edit.id)
    if (target !== undefined && target !== edit.row.after) {
      return reject('conflicting-assignment', 'A bar is moved to two rows: ' + edit.id, [edit.id])
    }
    targets.set(edit.id, edit.row.after)
  }

  const assignmentReplacements: ResourceAssignmentReplacement[] = []
  const claimed = new Map<string, string>()
  for (const [barId, toResourceId] of targets) {
    const { taskId, resourceId } = projection.origins.get(barId)!
    if (projection.taskBarIds.get(taskId)?.some(id => projection.origins.get(id)?.resourceId === toResourceId)) {
      return reject('already-assigned', 'The task is already assigned to the resource: ' + taskId + ', ' + toResourceId, [barId])
    }
    const key = JSON.stringify([taskId, toResourceId])
    const other = claimed.get(key)
    if (other !== undefined) {
      return reject('conflicting-assignment', 'Two projections of one task are moved to one resource: ' + taskId, [other, barId])
    }
    claimed.set(key, barId)
    assignmentReplacements.push({ taskId, fromResourceId: resourceId, toResourceId })
  }
  const scheduleChanges = [...schedules.values()]
    .filter(change => !sameRange(change.before, change.after))
    .map(({ taskId, before, after, mode, source }) => ({ taskId, before, after, mode, source }))
  return { ok: true, scheduleChanges, assignmentReplacements }
}

/** `resolveResourceTimelineEdits` for one GanttChart `edit`. */
export function resolveResourceTimelineEdit(
  projection: Pick<ResourceTimelineProjection, 'bars' | 'rows' | 'origins' | 'taskBarIds'>, edit: TimelineEdit,
): ResourceTimelineEditResolution | ResourceTimelineRejection {
  const result = resolveResourceTimelineEdits(projection, [edit])
  if (!result.ok) return result
  const resolution: ResourceTimelineEditResolution = { ok: true }
  if (result.scheduleChanges[0]) resolution.scheduleChange = result.scheduleChanges[0]
  if (result.assignmentReplacements[0]) resolution.assignmentReplacement = result.assignmentReplacements[0]
  return resolution
}

/**
 * A GanttChart `cascade` for a resource timeline. It runs `propagateEdit` on the task of the edited bar and maps the
 * result to bar edits: every other projection of the edited task, and every projection of each task whose dates
 * change. Projections already at the new dates are left out. A failed plan returns no edits. `input` must be the
 * schedule input that the projected dates come from, with task IDs, not bar IDs.
 */
export function resourceTimelineCascade(
  projection: Pick<ResourceTimelineProjection, 'bars' | 'origins' | 'taskBarIds'>, input: ScheduleInput,
): TimelineCascade {
  const barById = new Map(projection.bars.map(bar => [bar.id, bar]))
  return change => {
    const origin = projection.origins.get(change.id)
    if (!origin) return []
    const edit: ScheduleEdit = change.mode === 'move'
      ? { id: origin.taskId, start: change.after.start }
      : { id: origin.taskId, start: change.after.start, end: change.after.end }
    const result = propagateEdit(input, edit)
    if (!result.ok) return []
    const taskIds = new Set([origin.taskId, ...result.changes.map(item => item.id)])
    const edits: TimelineEdit[] = []
    for (const task of result.schedule.tasks) {
      if (!taskIds.has(task.id)) continue
      for (const id of projection.taskBarIds.get(task.id) ?? []) {
        const bar = barById.get(id)
        if (!bar || id === change.id || (bar.start === task.start && bar.end === task.end)) continue
        edits.push({
          id, before: { start: bar.start, end: bar.end }, after: { start: task.start, end: task.end },
          mode: task.id === origin.taskId ? change.mode : 'move', source: change.source,
        })
      }
    }
    return edits
  }
}

export interface ResourceAssignmentState {
  assignments: readonly ResourceAssignment[]
  /** When given, requests naming another resource throw. */
  resourceIds?: readonly string[]
  /** When given, requests naming another task throw. */
  taskIds?: readonly string[]
}

export type ResourceAssignmentRequest =
  | { kind: 'add'; taskId: string; resourceId: string; units?: number }
  | { kind: 'remove'; taskId: string; resourceId: string }
  | { kind: 'replace'; taskId: string; fromResourceId: string; toResourceId: string }

export type ResourceAssignmentProposal =
  | {
    ok: true
    /** The new assignment list. A replacement keeps the position, units and work part of the replaced assignment. */
    assignments: ResourceAssignment[]
    added: readonly ResourceAssignment[]
    removed: readonly ResourceAssignment[]
  }
  | { ok: false; code: 'already-assigned' | 'not-assigned'; reason: string }

/**
 * Check an assignment change and return the new assignment list. Adding or replacing onto a resource the task
 * already has is rejected with `already-assigned`; removing or replacing a missing assignment with `not-assigned`.
 * Throws an Error for duplicate assignments in the state or an unknown task or resource, and a RangeError for units
 * that are not a positive integer. Removing an assignment does not remove the task. The state is not modified.
 */
export function proposeResourceAssignment(state: ResourceAssignmentState, request: ResourceAssignmentRequest): ResourceAssignmentProposal {
  const { assignments } = state
  const keys = new Set<string>()
  const key = (taskId: string, resourceId: string) => JSON.stringify([taskId, resourceId])
  for (const { taskId, resourceId } of assignments) {
    const id = key(taskId, resourceId)
    if (keys.has(id)) throw duplicateAssignmentError(taskId, resourceId)
    keys.add(id)
  }
  const resources = state.resourceIds && new Set(state.resourceIds), tasks = state.taskIds && new Set(state.taskIds)
  const checkTask = (taskId: string) => {
    if (!isId(taskId) || (tasks && !tasks.has(taskId))) throw unknownReferenceError('task', 'assignment', taskId)
  }
  const checkResource = (resourceId: string) => {
    if (!isId(resourceId) || (resources && !resources.has(resourceId))) throw unknownReferenceError('resource', 'assignment', resourceId)
  }
  const alreadyAssigned = (taskId: string, resourceId: string) =>
    ({ ok: false as const, code: 'already-assigned' as const, reason: 'The task is already assigned to the resource: ' + taskId + ', ' + resourceId })
  const notAssigned = (taskId: string, resourceId: string) =>
    ({ ok: false as const, code: 'not-assigned' as const, reason: 'The task is not assigned to the resource: ' + taskId + ', ' + resourceId })
  checkTask(request.taskId)
  const { taskId } = request
  if (request.kind === 'add') {
    checkResource(request.resourceId)
    const { units } = request
    if (units !== undefined && (!Number.isSafeInteger(units) || units <= 0)) throw new RangeError('Assignment units must be a positive integer')
    if (keys.has(key(taskId, request.resourceId))) return alreadyAssigned(taskId, request.resourceId)
    const added: ResourceAssignment = { resourceId: request.resourceId, taskId }
    if (units !== undefined) added.units = units
    return { ok: true, assignments: [...assignments, added], added: [added], removed: [] }
  }
  if (request.kind === 'remove') {
    checkResource(request.resourceId)
    const index = assignments.findIndex(item => item.taskId === taskId && item.resourceId === request.resourceId)
    if (index < 0) return notAssigned(taskId, request.resourceId)
    return { ok: true, assignments: assignments.filter((_, i) => i !== index), added: [], removed: [assignments[index]!] }
  }
  if (request.kind !== 'replace') throw new Error('Unknown assignment request kind')
  checkResource(request.fromResourceId)
  checkResource(request.toResourceId)
  const index = assignments.findIndex(item => item.taskId === taskId && item.resourceId === request.fromResourceId)
  if (index < 0) return notAssigned(taskId, request.fromResourceId)
  if (keys.has(key(taskId, request.toResourceId))) return alreadyAssigned(taskId, request.toResourceId)
  const removed = assignments[index]!
  const added: ResourceAssignment = { ...removed, resourceId: request.toResourceId }
  return { ok: true, assignments: assignments.map((item, i) => i === index ? added : item), added: [added], removed: [removed] }
}
