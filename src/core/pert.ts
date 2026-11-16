import type { GraphEdge } from './graph.js'
import type { ScheduleSuccess, ScheduledTask } from './scheduling.js'
import { formatDependencyLag } from './timeline.js'
import type { ChartTone, NetworkNode, TimelineDependency } from './types.js'

export interface ScheduleGraphOptions {
  /** Node label of a task. Defaults to the task ID. */
  label?: (taskId: string) => string
  /** Time text in node details. Default UTC `YYYY-MM-DD HH:mm` of epoch milliseconds. */
  formatTime?: (time: number) => string
  /** Float text in node details. Default hours of a millisecond duration, such as `1.5 h`. */
  formatDuration?: (duration: number) => string
  /**
   * Text of a non-zero dependency `lag` in its edge label. Default `formatDependencyLag`: signed hours of a millisecond
   * lag, such as `+2 h` or `−1.5 h`. Called only for a non-zero lag.
   */
  formatLag?: (lag: number) => string
  /** Detail prefixes. Defaults: ES, EF and Float. */
  labels?: { earlyStart?: string; earlyFinish?: string; float?: string }
  /** Tone of critical tasks. Default amber. */
  criticalTone?: ChartTone
  /** Tone of the other tasks. Default blue. */
  tone?: ChartTone
}

/** `data` of a node returned by `scheduleToGraph`. */
export interface ScheduleGraphNodeData {
  task: ScheduledTask
  earlyStart: number
  earlyFinish: number
  critical: boolean
}

/** `data` of an edge returned by `scheduleToGraph`. */
export interface ScheduleGraphEdgeData {
  type: NonNullable<TimelineDependency['type']>
  critical: boolean
  /** The dependency's lag; present only when it is not zero. */
  lag?: number
}

export interface ScheduleGraph {
  nodes: NetworkNode[]
  edges: GraphEdge[]
  /** IDs of the critical tasks, for example for NetworkGraph `relatedIds`. */
  criticalNodeIds: Set<string>
  /** IDs of the controlling dependencies between critical tasks (`criticalDependencyIds`). */
  criticalEdgeIds: Set<string>
}

const defaultFormat = (time: number) => new Date(time).toISOString().slice(0, 16).replace('T', ' ')
const defaultDuration = (duration: number) => Math.round(duration / 36_000) / 100 + ' h'

/**
 * Build a PERT (activity-on-node) network diagram for NetworkGraph from a `scheduleTasks` result: one node per task,
 * in result order, whose detail shows its early start, early finish and total float, and one edge per dependency with
 * the dependency's ID. Critical tasks get `criticalTone` and are listed in `criticalNodeIds`; the result's
 * `criticalDependencyIds` are returned as `criticalEdgeIds`. Node and edge `data` carry the schedule values
 * (`ScheduleGraphNodeData`, `ScheduleGraphEdgeData`). An edge label shows the type when it is not FS and a non-zero
 * lag formatted by `formatLag`, such as `SS +2 h` or `+2 h`; an FS edge without lag has no label. A dependency that
 * touches a task of the result's `inactiveTaskIds` is left out, so the plan's full dependency list can be passed.
 * Throws an Error for a dependency whose ends are not tasks of the result, a dependency from a task to itself, or a
 * repeated dependency ID, and a RangeError for a lag that is not a finite number.
 */
export function scheduleToGraph(
  result: ScheduleSuccess, dependencies: readonly TimelineDependency[], options: ScheduleGraphOptions = {},
): ScheduleGraph {
  if (!result || result.ok !== true) throw new Error('scheduleToGraph needs a successful schedule result')
  const format = options.formatTime ?? defaultFormat
  const duration = options.formatDuration ?? defaultDuration
  const formatLag = options.formatLag ?? formatDependencyLag
  const prefix = { earlyStart: 'ES', earlyFinish: 'EF', float: 'Float', ...options.labels }
  const ids = new Set<string>()
  const criticalNodeIds = new Set<string>()
  const nodes = result.tasks.map((task): NetworkNode => {
    ids.add(task.id)
    if (task.critical) criticalNodeIds.add(task.id)
    const earlyStart = task.earliestStart ?? task.start
    const earlyFinish = task.earliestEnd ?? task.end
    const data: ScheduleGraphNodeData = { task, earlyStart, earlyFinish, critical: task.critical }
    return {
      id: task.id,
      label: options.label?.(task.id) ?? task.id,
      detail: `${prefix.earlyStart} ${format(earlyStart)} · ${prefix.earlyFinish} ${format(earlyFinish)} · ${prefix.float} ${duration(task.totalFloat)}`,
      tone: task.critical ? options.criticalTone ?? 'amber' : options.tone ?? 'blue',
      data,
    }
  })
  const criticalLinks = new Set(result.criticalDependencyIds)
  const criticalEdgeIds = new Set<string>()
  const edgeIds = new Set<string>()
  const inactive = new Set(result.inactiveTaskIds ?? [])
  const shown = inactive.size
    ? dependencies.filter(dependency => !inactive.has(dependency.from) && !inactive.has(dependency.to)) : dependencies
  const edges = shown.map((dependency): GraphEdge => {
    if (!ids.has(dependency.from) || !ids.has(dependency.to)) throw new Error('Unknown dependency endpoint: ' + dependency.id)
    if (dependency.from === dependency.to) {
      throw new Error(`Dependency ${dependency.id} links task ${dependency.from} to itself`)
    }
    // Dependency IDs become edge IDs, which NetworkGraph requires to be unique.
    if (edgeIds.has(dependency.id)) throw new Error('Duplicate dependency ID: ' + dependency.id)
    edgeIds.add(dependency.id)
    const lag = dependency.lag
    if (lag !== undefined && (typeof lag !== 'number' || !Number.isFinite(lag))) {
      throw new RangeError('Dependency lag must be finite: ' + dependency.id)
    }
    const type = dependency.type ?? 'FS'
    const critical = criticalLinks.has(dependency.id)
    if (critical) criticalEdgeIds.add(dependency.id)
    const data: ScheduleGraphEdgeData = { type, critical }
    const edge: GraphEdge = { id: dependency.id, from: dependency.from, to: dependency.to, data }
    const parts: string[] = type === 'FS' ? [] : [type]
    if (lag) {
      data.lag = lag
      parts.push(formatLag(lag))
    }
    if (parts.length) edge.label = parts.join(' ')
    return edge
  })
  return { nodes, edges, criticalNodeIds, criticalEdgeIds }
}
