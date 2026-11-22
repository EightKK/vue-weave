import { computed, nextTick, shallowRef, toValue } from 'vue'
import type { MaybeRefOrGetter } from 'vue'
import {
  buildViewBindingIndex, resolveEntityRefs, resolveViewTargets,
} from '../core/viewBindings.js'
import type { EntityRef, LoadViewTarget, RevealResult, ViewBinding, ViewTarget } from '../core/viewBindings.js'
import { resolveTimeRangeTargets, timelineBarsInRange } from '../core/timeRangeTargets.js'
import type {
  TimelineBarActivity, TimelineBarsInRangeOptions, TimeRangeTargets, TimeRangeTargetsOptions,
} from '../core/timeRangeTargets.js'
import type { TimeRange } from '../core/timeline.js'

export type LinkedViewName = ViewTarget['view']

export interface UseLinkedSelectionOptions {
  /** The links between entities and what the views show. Reactive: a change re-resolves the current selection. */
  bindings: MaybeRefOrGetter<readonly ViewBinding[]>
  /**
   * Called after a `select`, `selectEntities` or `clearSelection` that changed the selection, with the selected entities
   * and the view that owns the selection (undefined after `selectEntities`). It is not called for hover or for a
   * repeated identical selection.
   */
  onSelect?: (entities: readonly EntityRef[], owner: LinkedViewName | undefined) => void
  /**
   * An optional time range to explore. The bars worked on in it (`timelineBarsInRange`) and their entities' targets are
   * added to the `highlighted*` sets; what `traversal` reaches from them goes to the separate `related*` sets. Display
   * only: it never changes the selection. Undefined, or leaving the option out, changes nothing.
   */
  timeRange?: MaybeRefOrGetter<LinkedTimeRange | undefined>
}

/** Input of the `timeRange` option of `useLinkedSelection`. */
export interface LinkedTimeRange extends TimelineBarsInRangeOptions, TimeRangeTargetsOptions {
  /** The half-open range `[start, end)`; `start === end` is an instant. */
  range: TimeRange
  /** The bars to test, usually the bars given to GanttChart. */
  bars: readonly TimelineBarActivity[]
}

/** What to pass to a graph view: its own selection and display-only highlights. */
export interface LinkedGraphSets {
  /** Selected only when the graph owns the selection; otherwise empty. Use for `selectedIds`. */
  selectedNodeIds: ReadonlySet<string>
  selectedEdgeIds: ReadonlySet<string>
  /** Linked nodes, edges and groups that are not selected in this view, from the selection and from hover. */
  highlightedNodeIds: ReadonlySet<string>
  highlightedEdgeIds: ReadonlySet<string>
  highlightedGroupIds: ReadonlySet<string>
  /**
   * Nodes, edges and groups related to a `timeRange` by traversal, without selected or highlighted ones. Empty without
   * `timeRange`. Use for NetworkGraph `relatedIds` or your own styling.
   */
  relatedNodeIds: ReadonlySet<string>
  relatedEdgeIds: ReadonlySet<string>
  relatedGroupIds: ReadonlySet<string>
}

/** What to pass to a timeline view. */
export interface LinkedTimelineSets {
  selectedBarIds: ReadonlySet<string>
  highlightedBarIds: ReadonlySet<string>
  highlightedDependencyIds: ReadonlySet<string>
  highlightedRowIds: ReadonlySet<string>
  /** Bars, dependencies and rows related to a `timeRange` by traversal, without selected or highlighted ones. */
  relatedBarIds: ReadonlySet<string>
  relatedDependencyIds: ReadonlySet<string>
  relatedRowIds: ReadonlySet<string>
}

/** Load targets are time ranges; resolve them against current segments with `resolveLoadTargets`. */
export interface LinkedLoadSets {
  selected: readonly LoadViewTarget[]
  highlighted: readonly LoadViewTarget[]
  /** Load targets related to a `timeRange` by traversal, without selected or highlighted ones. */
  related: readonly LoadViewTarget[]
}

interface Snapshot {
  owner: LinkedViewName | undefined
  /** The targets the owning view selected, as it reported them. */
  targets: readonly ViewTarget[]
  entities: readonly EntityRef[]
  /** True for a selection made with `selectEntities`: it has no owner and `entities` is what was given. */
  byEntities?: boolean
  source?: string
}

const EMPTY: Snapshot = { owner: undefined, targets: [], entities: [] }

const sameTarget = (a: ViewTarget, b: ViewTarget): boolean =>
  a.view === 'load' || b.view === 'load'
    ? a.view === 'load' && b.view === 'load' && a.resourceId === b.resourceId && a.start === b.start && a.end === b.end
    : a.view === b.view && a.kind === b.kind && a.id === b.id

const sameTargets = (a: readonly ViewTarget[], b: readonly ViewTarget[]): boolean =>
  a.length === b.length && a.every(t => b.some(u => sameTarget(t, u)))

const sameEntities = (a: readonly EntityRef[], b: readonly EntityRef[]): boolean =>
  a.length === b.length && a.every(e => b.some(f => e.kind === f.kind && e.id === f.id))

/**
 * Links selection and hover across views (graph, timeline, load) through entity bindings. The view the user acted in
 * owns the selection: its sets contain what it selected, and every view, the owner included, gets display-only
 * highlight sets for the other linked targets. Selection of other views is never written into an owner's `selectedIds`,
 * so linked views cannot delete, move or cancel a drag. Reporting the same selection again changes nothing and does not
 * call `onSelect`, so wiring a view's events back to this composable cannot loop. Hover is highlight only. Views that
 * are not graph, timeline or load (an application's own table or list) select through entity references with
 * `selectEntities`; such a selection has no owner and every view only highlights it.
 */
export function useLinkedSelection(options: UseLinkedSelectionOptions) {
  const index = computed(() => buildViewBindingIndex(toValue(options.bindings)))
  const selection = shallowRef<Snapshot>(EMPTY)
  const hover = shallowRef<{ view: LinkedViewName; target: ViewTarget; entities: readonly EntityRef[] } | undefined>()

  /**
   * Selects what `view` reports, replacing the previous selection of any view. Targets that no binding reaches stay
   * selected in the owner (it may show unbound items) but link to nothing; they are returned in `unknown`. An empty
   * list clears the selection. Returns whether the selection changed.
   */
  function select(view: LinkedViewName, targets: readonly ViewTarget[]): { changed: boolean; unknown: ViewTarget[] } {
    for (const target of targets) if (target.view !== view) throw new Error('Target of view ' + target.view + ' reported by view ' + view)
    const resolved = resolveEntityRefs(index.value, targets)
    const current = selection.value
    const nextTargets = targets.map(target => ({ ...target }))
    if (nextTargets.length === 0) return { changed: clearSelection(), unknown: [] }
    const changed = current.owner !== view || !sameTargets(current.targets, nextTargets)
    if (changed) {
      selection.value = { owner: view, targets: nextTargets, entities: resolved.entities }
      options.onSelect?.(resolved.entities, view)
    }
    return { changed, unknown: resolved.unknown }
  }

  /**
   * Selects `entities`, for a view that has no `LinkedViewName` (an application's own table or list), replacing the
   * previous selection of any view. The selection has no owner: no view gets `selected*` sets, and every view gets
   * `highlighted*` sets for the targets bound to the entities. `selectedEntities` returns the given entities without
   * repeats, in input order, unbound ones included; those that no binding reaches are returned in `unknown`. An empty
   * input clears the selection. Selecting the same entities (in any order) with the same `source` again changes
   * nothing and does not call `onSelect`. Throws Error for an entity whose kind or ID is not a non-empty string, or
   * for a `source` that is not a string. Returns whether the selection changed.
   */
  function selectEntities(
    entities: Iterable<EntityRef>,
    selectOptions?: {
      /** A name of your own for the selecting view, such as `'task-table'`. Exposed as `selectionSource`. */
      source?: string
    },
  ): { changed: boolean; unknown: EntityRef[] } {
    const source = selectOptions?.source
    if (source !== undefined && typeof source !== 'string') throw new Error('selectEntities source must be a string')
    const list = [...entities]
    // Validates every reference as the binding index does, and finds the unbound ones.
    const { unknown } = resolveViewTargets(index.value, list)
    const seen = new Set<string>()
    const next: EntityRef[] = []
    for (const entity of list) {
      const key = JSON.stringify([entity.kind, entity.id])
      if (seen.has(key)) continue
      seen.add(key)
      next.push({ kind: entity.kind, id: entity.id })
    }
    if (next.length === 0) return { changed: clearSelection(), unknown: [] }
    const current = selection.value
    const changed = !current.byEntities || current.source !== source || !sameEntities(current.entities, next)
    if (changed) {
      selection.value = { owner: undefined, targets: [], entities: next, byEntities: true, source }
      options.onSelect?.(next, undefined)
    }
    return { changed, unknown }
  }

  /** Clears the selection. Returns whether there was one. */
  function clearSelection(): boolean {
    if (selection.value.owner === undefined && !selection.value.byEntities) return false
    selection.value = EMPTY
    options.onSelect?.([], undefined)
    return true
  }

  /** Starts hover from `target` of `view`. A target that links to nothing clears the hover. */
  function hoverEnter(view: LinkedViewName, target: ViewTarget): void {
    if (target.view !== view) throw new Error('Target of view ' + target.view + ' reported by view ' + view)
    const current = hover.value
    if (current && current.view === view && sameTarget(current.target, target)) return
    const { entities } = resolveEntityRefs(index.value, [target])
    hover.value = entities.length ? { view, target: { ...target }, entities } : undefined
  }

  /**
   * Ends hover. With a target, it only clears a hover that started from the same target, so a late leave event of
   * the previous item cannot clear the hover of the next one. Without a target it always clears.
   */
  function hoverLeave(view: LinkedViewName, target?: ViewTarget): void {
    const current = hover.value
    if (!current) return
    if (target && !(current.view === view && sameTarget(current.target, target))) return
    hover.value = undefined
  }

  // Typed as a mutable array like before entity selections existed; each read gets its own copy.
  const selectedEntities = computed<EntityRef[]>(() => selection.value.byEntities
    ? selection.value.entities.map(entity => ({ ...entity }))
    : resolveEntityRefs(index.value, selection.value.targets).entities)

  const timeRange = computed<TimeRangeTargets | undefined>(() => {
    const input = toValue(options.timeRange)
    if (!input) return undefined
    const active = timelineBarsInRange(input.bars, input.range, { rowIds: input.rowIds })
    return resolveTimeRangeTargets(index.value, active.map(bar => bar.id), { graph: input.graph, traversal: input.traversal })
  })

  const linked = computed(() => {
    // Re-resolve from entities, so changed bindings are picked up without a new selection.
    const entities = [...selectedEntities.value, ...(hover.value?.entities ?? [])]
    const targets = resolveViewTargets(index.value, entities).targets
    return timeRange.value ? [...targets, ...timeRange.value.activeTargets] : targets
  })
  const related = computed(() => timeRange.value?.relatedTargets ?? [])

  const graph = computed<LinkedGraphSets>(() => {
    const own = selection.value.owner === 'graph' ? selection.value.targets : []
    const selectedNodeIds = new Set<string>(), selectedEdgeIds = new Set<string>()
    for (const t of own) if (t.view === 'graph') (t.kind === 'edge' ? selectedEdgeIds : t.kind === 'node' ? selectedNodeIds : undefined)?.add(t.id)
    const highlightedNodeIds = new Set<string>(), highlightedEdgeIds = new Set<string>(), highlightedGroupIds = new Set<string>()
    for (const t of linked.value) {
      if (t.view !== 'graph') continue
      if (t.kind === 'node' && !selectedNodeIds.has(t.id)) highlightedNodeIds.add(t.id)
      else if (t.kind === 'edge' && !selectedEdgeIds.has(t.id)) highlightedEdgeIds.add(t.id)
      else if (t.kind === 'group') highlightedGroupIds.add(t.id)
    }
    const relatedNodeIds = new Set<string>(), relatedEdgeIds = new Set<string>(), relatedGroupIds = new Set<string>()
    for (const t of related.value) {
      if (t.view !== 'graph') continue
      if (t.kind === 'node' && !selectedNodeIds.has(t.id) && !highlightedNodeIds.has(t.id)) relatedNodeIds.add(t.id)
      else if (t.kind === 'edge' && !selectedEdgeIds.has(t.id) && !highlightedEdgeIds.has(t.id)) relatedEdgeIds.add(t.id)
      else if (t.kind === 'group' && !highlightedGroupIds.has(t.id)) relatedGroupIds.add(t.id)
    }
    return {
      selectedNodeIds, selectedEdgeIds, highlightedNodeIds, highlightedEdgeIds, highlightedGroupIds, relatedNodeIds, relatedEdgeIds, relatedGroupIds,
    }
  })

  const timeline = computed<LinkedTimelineSets>(() => {
    const own = selection.value.owner === 'timeline' ? selection.value.targets : []
    const selectedBarIds = new Set<string>()
    for (const t of own) if (t.view === 'timeline' && t.kind === 'bar') selectedBarIds.add(t.id)
    const highlightedBarIds = new Set<string>(), highlightedDependencyIds = new Set<string>(), highlightedRowIds = new Set<string>()
    for (const t of linked.value) {
      if (t.view !== 'timeline') continue
      if (t.kind === 'bar' && !selectedBarIds.has(t.id)) highlightedBarIds.add(t.id)
      else if (t.kind === 'dependency') highlightedDependencyIds.add(t.id)
      else if (t.kind === 'row') highlightedRowIds.add(t.id)
    }
    const relatedBarIds = new Set<string>(), relatedDependencyIds = new Set<string>(), relatedRowIds = new Set<string>()
    for (const t of related.value) {
      if (t.view !== 'timeline') continue
      if (t.kind === 'bar' && !selectedBarIds.has(t.id) && !highlightedBarIds.has(t.id)) relatedBarIds.add(t.id)
      else if (t.kind === 'dependency' && !highlightedDependencyIds.has(t.id)) relatedDependencyIds.add(t.id)
      else if (t.kind === 'row' && !highlightedRowIds.has(t.id)) relatedRowIds.add(t.id)
    }
    return {
      selectedBarIds, highlightedBarIds, highlightedDependencyIds, highlightedRowIds, relatedBarIds, relatedDependencyIds, relatedRowIds,
    }
  })

  const load = computed<LinkedLoadSets>(() => {
    const selected = selection.value.owner === 'load'
      ? selection.value.targets.filter((t): t is LoadViewTarget => t.view === 'load')
      : []
    const highlighted: LoadViewTarget[] = []
    for (const t of linked.value) {
      if (t.view === 'load' && !selected.some(s => sameTarget(s, t)) && !highlighted.some(h => sameTarget(h, t))) highlighted.push(t)
    }
    const others = [...selected, ...highlighted]
    const relatedLoad = related.value.filter((t): t is LoadViewTarget => t.view === 'load' && !others.some(s => sameTarget(s, t)))
    return { selected, highlighted, related: relatedLoad }
  })

  return {
    /** The view that owns the selection, or undefined. */
    owner: computed(() => selection.value.owner),
    /** The selected entities. */
    selectedEntities,
    /** The `source` given to `selectEntities` for the current selection; undefined otherwise. */
    selectionSource: computed(() => selection.value.source),
    /** The hovered entities. */
    hoveredEntities: computed(() => hover.value?.entities ?? []),
    /** What the `timeRange` option resolves to (active and related bars, entities and targets), or undefined without one. */
    timeRange,
    graph,
    timeline,
    load,
    select,
    selectEntities,
    clearSelection,
    hoverEnter,
    hoverLeave,
  }
}

export interface RevealLinkedTargetOptions {
  /**
   * Calls the reveal method of the view, for example `() => graph.value?.revealNode(id, { focus: true })`. It is called
   * again after each accepted expansion. Returning undefined (no mounted view) counts as `unknown`.
   */
  reveal: () => Promise<RevealResult> | RevealResult | undefined
  /**
   * Asked when the item is hidden by a collapsed group or row. Expand `proxyId` in the controlled `collapsedGroupIds`
   * (graph) or `collapsedIds` (timeline) and return true, or return false to decline. Without it, nothing is expanded
   * and the `hidden-by-collapse` result is returned.
   */
  expand?: (proxyId: string, result: RevealResult) => boolean | Promise<boolean>
  /** The most expansions to try for nested collapses. Default 16. */
  maxExpansions?: number
}

export interface LinkedRevealResult extends RevealResult {
  /** The proxies that `expand` accepted, in order. */
  expandedIds: string[]
  /** True when `expand` declined, or accepted without the item becoming visible. The status is then not `revealed`. */
  declined?: boolean
}

/**
 * Reveals an item of a view and, when a collapsed ancestor hides it, offers the application to expand that ancestor:
 * reveal, ask `expand(proxyId)`, wait for the render (`nextTick` twice: props, then layout and DOM), reveal again, until
 * the item is shown, unknown, or the application declines. It never expands anything itself and never reports
 * `revealed` unless the last reveal did. An expansion that is accepted but leaves the same proxy in place counts as
 * declined, so an application that does not update the controlled set cannot loop.
 */
export async function revealLinkedTarget(options: RevealLinkedTargetOptions): Promise<LinkedRevealResult> {
  const limit = options.maxExpansions ?? 16
  if (!Number.isInteger(limit) || limit < 0) throw new RangeError('maxExpansions must be a non-negative integer')
  const expandedIds: string[] = []
  let result: RevealResult = (await options.reveal()) ?? { status: 'unknown' }
  while (result.status === 'hidden-by-collapse' && result.proxyId !== undefined && options.expand && expandedIds.length < limit) {
    const proxyId = result.proxyId
    if (!(await options.expand(proxyId, result))) return { ...result, expandedIds, declined: true }
    expandedIds.push(proxyId)
    await nextTick()
    await nextTick()
    result = (await options.reveal()) ?? { status: 'unknown' }
    if (result.status === 'hidden-by-collapse' && result.proxyId === proxyId) return { ...result, expandedIds, declined: true }
  }
  return { ...result, expandedIds }
}
