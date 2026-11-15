import { computed, nextTick, shallowRef, toValue } from 'vue'
import type { MaybeRefOrGetter } from 'vue'
import {
  buildViewBindingIndex, resolveEntityRefs, resolveViewTargets,
} from '../core/viewBindings.js'
import type { EntityRef, LoadViewTarget, RevealResult, ViewBinding, ViewTarget } from '../core/viewBindings.js'

export type LinkedViewName = ViewTarget['view']

export interface UseLinkedSelectionOptions {
  /** The links between entities and what the views show. Reactive: a change re-resolves the current selection. */
  bindings: MaybeRefOrGetter<readonly ViewBinding[]>
  /**
   * Called after a `select` or `clearSelection` that changed the selection, with the selected entities and the view
   * that owns the selection. It is not called for hover or for a repeated identical selection.
   */
  onSelect?: (entities: readonly EntityRef[], owner: LinkedViewName | undefined) => void
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
}

/** What to pass to a timeline view. */
export interface LinkedTimelineSets {
  selectedBarIds: ReadonlySet<string>
  highlightedBarIds: ReadonlySet<string>
  highlightedDependencyIds: ReadonlySet<string>
  highlightedRowIds: ReadonlySet<string>
}

/** Load targets are time ranges; resolve them against current segments with `resolveLoadTargets`. */
export interface LinkedLoadSets {
  selected: readonly LoadViewTarget[]
  highlighted: readonly LoadViewTarget[]
}

interface Snapshot {
  owner: LinkedViewName | undefined
  /** The targets the owning view selected, as it reported them. */
  targets: readonly ViewTarget[]
  entities: readonly EntityRef[]
}

const EMPTY: Snapshot = { owner: undefined, targets: [], entities: [] }

const sameTarget = (a: ViewTarget, b: ViewTarget): boolean =>
  a.view === 'load' || b.view === 'load'
    ? a.view === 'load' && b.view === 'load' && a.resourceId === b.resourceId && a.start === b.start && a.end === b.end
    : a.view === b.view && a.kind === b.kind && a.id === b.id

const sameTargets = (a: readonly ViewTarget[], b: readonly ViewTarget[]): boolean =>
  a.length === b.length && a.every(t => b.some(u => sameTarget(t, u)))

/**
 * Links selection and hover across views (graph, timeline, load) through entity bindings. The view the user acted in
 * owns the selection: its sets contain what it selected, and every view, the owner included, gets display-only
 * highlight sets for the other linked targets. Selection of other views is never written into an owner's `selectedIds`,
 * so linked views cannot delete, move or cancel a drag. Reporting the same selection again changes nothing and does not
 * call `onSelect`, so wiring a view's events back to this composable cannot loop. Hover is highlight only.
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

  /** Clears the selection. Returns whether there was one. */
  function clearSelection(): boolean {
    if (selection.value.owner === undefined) return false
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

  const selectedEntities = computed(() => resolveEntityRefs(index.value, selection.value.targets).entities)

  const linked = computed(() => {
    // Re-resolve from entities, so changed bindings are picked up without a new selection.
    const entities = [...selectedEntities.value, ...(hover.value?.entities ?? [])]
    return resolveViewTargets(index.value, entities).targets
  })

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
    return { selectedNodeIds, selectedEdgeIds, highlightedNodeIds, highlightedEdgeIds, highlightedGroupIds }
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
    return { selectedBarIds, highlightedBarIds, highlightedDependencyIds, highlightedRowIds }
  })

  const load = computed<LinkedLoadSets>(() => {
    const selected = selection.value.owner === 'load'
      ? selection.value.targets.filter((t): t is LoadViewTarget => t.view === 'load')
      : []
    const highlighted = linked.value.filter((t): t is LoadViewTarget => t.view === 'load' && !selected.some(s => sameTarget(s, t)))
    return { selected, highlighted }
  })

  return {
    /** The view that owns the selection, or undefined. */
    owner: computed(() => selection.value.owner),
    /** The selected entities. */
    selectedEntities,
    /** The hovered entities. */
    hoveredEntities: computed(() => hover.value?.entities ?? []),
    graph,
    timeline,
    load,
    select,
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
