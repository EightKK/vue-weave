import type { GraphEdge } from './graph.js'
import { traverseGraph, type GraphTraversalOptions } from './graphTraversal.js'
import { intervalsMeet } from './intervals.js'
import type { TimeRange } from './timeline.js'
import type { TimelineBar } from './types.js'
import { resolveEntityRefs, resolveViewTargets, type EntityRef, type ViewBindingIndex, type ViewTarget } from './viewBindings.js'

export interface TimelineBarsInRangeOptions {
  /** Only bars in these rows are considered. Unknown row IDs match nothing. Default: every row. */
  rowIds?: Iterable<string>
}

/** The parts of a bar that `timelineBarsInRange` reads. */
export type TimelineBarActivity = Pick<TimelineBar, 'id' | 'rowId' | 'start' | 'end' | 'segments'>

function checkRange(range: TimeRange, what: string): void {
  if (!range || !Number.isFinite(range.start) || !Number.isFinite(range.end) || range.end < range.start) {
    throw new RangeError(what + ' must have finite endpoints with end >= start')
  }
}


/**
 * Returns the bars that are worked on in the half-open time range `[range.start, range.end)`, in input order. A bar with
 * `segments` is active only when one of its work segments overlaps the range, so a pause (a gap between segments) that
 * covers the whole range does not count; any other bar is active when its interval overlaps the range. A milestone
 * (`start === end`) at time t is active when `range.start <= t < range.end`. An empty range (`start === end`) is an
 * instant t: it matches work with `start <= t < end` and milestones at exactly t. `options.rowIds` restricts the result
 * to bars of those rows. The times are not inferred from anything else, such as a graph. Throws RangeError for a range
 * or bar time that is not finite or ends before it starts, and for invalid segments. The inputs are not modified.
 */
export function timelineBarsInRange<B extends TimelineBarActivity>(
  bars: readonly B[],
  range: TimeRange,
  options: TimelineBarsInRangeOptions = {},
): B[] {
  checkRange(range, 'The time range')
  const rows = options.rowIds === undefined ? undefined : new Set(options.rowIds)
  const result: B[] = []
  for (const bar of bars) {
    if (!Number.isFinite(bar.start) || !Number.isFinite(bar.end) || bar.end < bar.start) {
      throw new RangeError('Bar times must be finite with end >= start: ' + bar.id)
    }
    if (rows && !rows.has(bar.rowId)) continue
    const segments = bar.segments
    if (segments === undefined) {
      if (intervalsMeet(bar, range)) result.push(bar)
      continue
    }
    if (!Array.isArray(segments) || segments.length === 0 || bar.start === bar.end) {
      throw new RangeError('segments must contain at least one interval and are not allowed on milestones: ' + bar.id)
    }
    let hit = false
    for (const segment of segments) {
      if (!Number.isFinite(segment.start) || !Number.isFinite(segment.end) || segment.end <= segment.start) {
        throw new RangeError('Segments must be finite, positive-length intervals: ' + bar.id)
      }
      if (!hit && intervalsMeet(segment, range)) hit = true
    }
    if (hit) result.push(bar)
  }
  return result
}

export interface TimeRangeTargetsOptions {
  /**
   * The graph to walk from the graph nodes of the active entities, for example the graph shown by NetworkGraph. Without
   * it, or without `traversal`, nothing is related.
   */
  graph?: { nodes: readonly { id: string }[]; edges: readonly GraphEdge[] }
  /**
   * How to find related entities, as for `traverseGraph`: `{ direction: 'forward' }` for all successors, `'backward'` for
   * all predecessors, `'both'` for both, and `{ direction: 'both', maxHops: 1 }` for direct neighbours. `maxHops` limits
   * the depth, `edgeFilter` the relations followed and `maxNodes` the number of graph nodes reached. Omit it to relate
   * nothing.
   */
  traversal?: GraphTraversalOptions
}

export interface TimeRangeTargets {
  /** The given bar IDs, deduplicated, in input order. */
  activeBarIds: string[]
  /** Entities bound to the active bars, in discovery order. */
  activeEntities: EntityRef[]
  /**
   * The active bars and every target bound to the active entities, without repeats. An active entity's targets in other
   * views (its node, its load range, its other bars) are active too.
   */
  activeTargets: ViewTarget[]
  /** Entities reached by the traversal that are not active, in discovery order. */
  relatedEntities: EntityRef[]
  /**
   * Graph nodes and edges reached by the traversal and the targets bound to the related entities, without the active
   * targets. Reached graph items with no binding are included as graph targets.
   */
  relatedTargets: ViewTarget[]
  /** Active bar IDs that no binding reaches. They are still in `activeTargets`, but link to nothing. */
  unknownBarIds: string[]
}

const targetKey = (target: ViewTarget): string => target.view === 'load'
  ? JSON.stringify(['load', target.resourceId, target.start, target.end])
  : JSON.stringify([target.view, target.kind, target.id])
const entityKey = (entity: EntityRef): string => JSON.stringify([entity.kind, entity.id])

/**
 * Turns active bars (for example from `timelineBarsInRange`) into the entities and view targets they stand for through
 * `index`, and optionally walks `options.graph` from the active entities' graph nodes to find related entities. The two
 * results stay apart: `active*` is what was worked on in the range, `related*` what the traversal reached besides. The
 * walk is iterative and terminates on cycles. Throws like `traverseGraph` for invalid traversal options or graph edges.
 * The inputs are not modified.
 */
export function resolveTimeRangeTargets(
  index: ViewBindingIndex,
  barIds: Iterable<string>,
  options: TimeRangeTargetsOptions = {},
): TimeRangeTargets {
  const activeBarIds = [...new Set(barIds)]
  const barTargets: ViewTarget[] = activeBarIds.map(id => ({ view: 'timeline', kind: 'bar', id }))
  const resolved = resolveEntityRefs(index, barTargets)
  const unknownBarIds = resolved.unknown.flatMap(target => target.view === 'timeline' ? [target.id] : [])
  const activeEntities = resolved.entities
  const active = new Map<string, ViewTarget>()
  for (const target of [...barTargets, ...resolveViewTargets(index, activeEntities).targets]) {
    const key = targetKey(target)
    if (!active.has(key)) active.set(key, target)
  }

  const relatedEntities: EntityRef[] = []
  const related = new Map<string, ViewTarget>()
  if (options.graph && options.traversal) {
    const starts: string[] = []
    for (const target of active.values()) if (target.view === 'graph' && target.kind === 'node') starts.push(target.id)
    const reached = traverseGraph(options.graph, starts, options.traversal)
    const graphTargets: ViewTarget[] = [
      ...reached.nodeIds.map((id): ViewTarget => ({ view: 'graph', kind: 'node', id })),
      ...reached.edgeIds.map((id): ViewTarget => ({ view: 'graph', kind: 'edge', id })),
    ]
    const activeKeys = new Set(activeEntities.map(entityKey))
    for (const entity of resolveEntityRefs(index, graphTargets).entities) {
      if (!activeKeys.has(entityKey(entity))) relatedEntities.push(entity)
    }
    for (const target of [...graphTargets, ...resolveViewTargets(index, relatedEntities).targets]) {
      const key = targetKey(target)
      if (!active.has(key) && !related.has(key)) related.set(key, target)
    }
  }
  return {
    activeBarIds, activeEntities, activeTargets: [...active.values()], relatedEntities, relatedTargets: [...related.values()], unknownBarIds,
  }
}
