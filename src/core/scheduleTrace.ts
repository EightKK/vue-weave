import { bindingBounds, bindingKeys, type Bounds, type LimitKey, type Limits, type ModelTask, type WorkClock } from './scheduleModel.js'
import type { LevelResourcesSuccess } from './leveling.js'
import type { ScheduleConstraintName, ScheduleFailure, ScheduleLink, ScheduleSuccess } from './scheduling.js'
import type { TimeRange } from './timeline.js'

/**
 * The calculation step a reason belongs to. `earliest` and `latest` are the forward and backward passes of
 * `scheduleTasks`, `placement` places `mode: 'alap'` tasks, and `leveling` is the reservation loop of `levelResources`.
 */
export type ScheduleReasonPhase = 'earliest' | 'latest' | 'placement' | 'leveling'

/**
 * What a reason is about. `dependency` is a predecessor or successor link, `constraint` a task constraint
 * (`startNoEarlierThan`, `startNoLaterThan`, `finishNoEarlierThan`, `finishNoLaterThan`, `fixedStart`),
 * `project-bound` the scheduling range, the input `deadline`, the project finish or a leveling horizon, `calendar` time
 * off in the task's calendar, `pause` one of the task's pauses, and `capacity` a resource without enough capacity.
 */
export type ScheduleReasonKind = 'dependency' | 'constraint' | 'calendar' | 'pause' | 'capacity' | 'project-bound'

/** The limit of the task that a reason acts on. */
export type ScheduleReasonBound = 'startLower' | 'endLower' | 'startUpper' | 'endUpper'

/** One structured cause of a task's dates. Every field is data; nothing is worded for display. */
export interface ScheduleReason {
  /** Unique within its trace. */
  id: string
  taskId: string
  phase: ScheduleReasonPhase
  kind: ScheduleReasonKind
  bound: ScheduleReasonBound
  /** The time the cause asks for, before calendars, pauses or capacity. */
  candidateTime?: number
  /**
   * The start or end (as `bound` says) the task got in this phase. In `leveling`, bound reasons describe the earliest
   * placement before capacity is checked, and `capacity` reasons the placement after it.
   */
  placedTime?: number
  dependencyId?: string
  /** The constraint name, as `ScheduleFailure.constraints` names it. A leveling horizon bound has none. */
  constraint?: ScheduleConstraintName
  /** The calendar of a `calendar` reason; absent for the default continuous calendar. */
  calendarId?: string
  resourceId?: string
  /** Units of the resource the task needs. */
  demand?: number
  /** Capacity of the resource in `range`, before any reservation. */
  capacity?: number
  /** The other end of a dependency, the tasks that finish the project, or the tasks holding the capacity. */
  relatedTaskIds?: readonly string[]
  /** The interval in which a resource lacked capacity. */
  range?: TimeRange
  /** Reasons that explain this one, for example the reasons of a predecessor. */
  parentReasonIds: readonly string[]
}

export interface ScheduleTrace {
  /** All reasons, each after its parents. */
  reasons: readonly ScheduleReason[]
  /** The IDs of each task's own reasons, in input order of the tasks. */
  taskReasonIds: ReadonlyMap<string, readonly string[]>
}

export interface ScheduleOptions {
  /** Record why each task got its dates and return them as `trace`. Does not change any date. Defaults to false. */
  explain?: boolean
}

/** A successful `scheduleTasks` result with its trace. */
export type ExplainedScheduleSuccess = ScheduleSuccess & { trace: ScheduleTrace }
export type ExplainedScheduleResult = ExplainedScheduleSuccess | ScheduleFailure

/** A successful `levelResources` result with its trace. */
export type ExplainedLevelResourcesSuccess = LevelResourcesSuccess & { trace: ScheduleTrace }
export type ExplainedLevelResourcesResult = ExplainedLevelResourcesSuccess | ScheduleFailure

export interface CollectScheduleReasonsOptions {
  /** Start only from the task's reasons in these phases. Parents are followed in every phase. */
  phases?: readonly ScheduleReasonPhase[]
}

/**
 * The reasons of one task followed by all their ancestors, breadth first. Each reason appears once even when many
 * paths share it. Throws for an unknown task or parent reason.
 */
export function collectScheduleReasons(
  trace: ScheduleTrace, taskId: string, options: CollectScheduleReasonsOptions = {},
): ScheduleReason[] {
  const own = trace.taskReasonIds.get(taskId)
  if (!own) throw new Error('Unknown task in schedule trace: ' + taskId)
  const byId = new Map<string, ScheduleReason>()
  for (const reason of trace.reasons) byId.set(reason.id, reason)
  const phases = options.phases ? new Set(options.phases) : undefined
  const result: ScheduleReason[] = []
  const seen = new Set<string>()
  const enqueue = (id: string) => {
    if (seen.has(id)) return
    const reason = byId.get(id)
    if (!reason) throw new Error('Unknown schedule reason: ' + id)
    seen.add(id)
    result.push(reason)
  }
  for (const id of own) {
    const reason = byId.get(id)
    if (!reason) throw new Error('Unknown schedule reason: ' + id)
    if (!phases || phases.has(reason.phase)) enqueue(id)
  }
  for (let i = 0; i < result.length; i++) {
    for (const parent of result[i]!.parentReasonIds) enqueue(parent)
  }
  return result
}

/** Read and check the options argument of `scheduleTasks` and `levelResources`. */
export function explainOption(options: ScheduleOptions | undefined): boolean {
  if (options === undefined) return false
  if (typeof options !== 'object' || options === null) throw new Error('Scheduling options must be an object')
  if (options.explain !== undefined && typeof options.explain !== 'boolean') throw new Error('The explain option must be a boolean')
  return options.explain === true
}

type ReasonData = Omit<ScheduleReason, 'id'>

/** Collects reasons while a schedule is calculated. Created only when explaining. */
export class ScheduleTraceRecorder {
  private readonly reasons: ScheduleReason[] = []
  private readonly byTask = new Map<string, string[]>()
  private readonly byPhase = new Map<string, string[]>()

  constructor(taskIds: Iterable<string>) {
    for (const id of taskIds) this.byTask.set(id, [])
  }

  add(data: ReasonData): string {
    const id = 'r' + this.reasons.length
    this.reasons.push({ id, ...data })
    this.byTask.get(data.taskId)!.push(id)
    const key = JSON.stringify([data.phase, data.taskId])
    const list = this.byPhase.get(key)
    if (list) list.push(id)
    else this.byPhase.set(key, [id])
    return id
  }

  ids(phase: ScheduleReasonPhase, taskId: string): readonly string[] {
    return this.byPhase.get(JSON.stringify([phase, taskId])) ?? []
  }

  trace(): ScheduleTrace {
    return { reasons: this.reasons, taskReasonIds: this.byTask }
  }
}

/** Where the reasons of a slot's binding bounds point to. */
export interface SlotReasonContext {
  /** Parent reasons of a dependency bound: the other task's reasons in the relevant phase. */
  linkParents(link: ScheduleLink, upper: boolean): readonly string[]
  /** Parents and tasks of the `projectFinish` bound. */
  finish?: { parents: readonly string[]; taskIds: readonly string[] }
  /** Parents of the unnamed leveling horizon bounds. */
  horizon?: readonly string[]
}

const taskConstraints: ReadonlySet<ScheduleConstraintName> = new Set([
  'startNoEarlierThan', 'startNoLaterThan', 'finishNoEarlierThan', 'finishNoLaterThan', 'fixedStart',
])

/** Where `clock` places the side of a task that `key` limits, for a limit of `time`. */
function snap(clock: WorkClock, key: LimitKey, time: number): number | undefined {
  let work: number
  if (key === 'startLower') work = clock.workAt(time)
  else if (key === 'endLower') work = clock.minFinishWork(time)
  else if (key === 'startUpper') work = clock.maxStartWork(time)
  else work = clock.workAt(time)
  const finish = key === 'endLower' || key === 'endUpper'
  if (work < (finish ? 1 : 0) || work > (finish ? clock.total : clock.total - 1)) return undefined
  return clock.dateAt(work, finish)
}

/**
 * Record the binding bounds of a placed slot: the lower ones for an earliest placement, the upper ones for a latest
 * placement. Tied bounds are all recorded. A shift by calendar time off or by pauses becomes its own reason.
 */
export function recordSlotReasons(
  recorder: ScheduleTraceRecorder, phase: ScheduleReasonPhase, task: ModelTask, bounds: Bounds, limits: Limits,
  slot: TimeRange, latest: boolean, context: SlotReasonContext,
): void {
  const keys = bindingKeys(task.clock, task.duration, limits)[latest ? 'upper' : 'lower']
  for (const key of keys) {
    const candidateTime = limits[key]
    const placedTime = key === 'startLower' || key === 'startUpper' ? slot.start : slot.end
    const boundIds: string[] = []
    for (const bound of bindingBounds(bounds, limits, key)) {
      const base = { taskId: task.id, phase, bound: key, candidateTime, placedTime }
      if (bound.dependencyId !== undefined) {
        const link = (latest ? task.outgoing : task.incoming).find(item => item.id === bound.dependencyId)!
        boundIds.push(recorder.add({
          ...base, kind: 'dependency', dependencyId: link.id, relatedTaskIds: [latest ? link.to : link.from],
          parentReasonIds: context.linkParents(link, latest),
        }))
      } else if (bound.constraint === undefined) {
        boundIds.push(recorder.add({ ...base, kind: 'project-bound', parentReasonIds: context.horizon ?? [] }))
      } else if (taskConstraints.has(bound.constraint)) {
        boundIds.push(recorder.add({ ...base, kind: 'constraint', constraint: bound.constraint, parentReasonIds: [] }))
      } else if (bound.constraint === 'projectFinish' && context.finish) {
        boundIds.push(recorder.add({
          ...base, kind: 'project-bound', constraint: bound.constraint, relatedTaskIds: context.finish.taskIds,
          parentReasonIds: context.finish.parents,
        }))
      } else {
        boundIds.push(recorder.add({ ...base, kind: 'project-bound', constraint: bound.constraint, parentReasonIds: [] }))
      }
    }
    if (!task.duration || placedTime === candidateTime || !task.calendar) continue
    // Continuous time places the side at `elapsedTime`, the calendar alone at `calendarTime`; any further shift comes
    // from the task's pauses. A finish limit at a period start needs one unit of work even in continuous time.
    const { continuous, clock } = task.calendar
    const elapsedTime = snap(continuous, key, candidateTime) ?? candidateTime
    const calendarTime = clock === task.clock ? placedTime : snap(clock, key, candidateTime) ?? placedTime
    if (calendarTime !== elapsedTime) {
      const reason: ReasonData = {
        taskId: task.id, phase, kind: 'calendar', bound: key, candidateTime: elapsedTime, placedTime: calendarTime,
        parentReasonIds: boundIds,
      }
      if (task.calendar.id !== undefined) reason.calendarId = task.calendar.id
      recorder.add(reason)
    }
    if (calendarTime !== placedTime) {
      recorder.add({ taskId: task.id, phase, kind: 'pause', bound: key, candidateTime: calendarTime, placedTime, parentReasonIds: boundIds })
    }
  }
}
