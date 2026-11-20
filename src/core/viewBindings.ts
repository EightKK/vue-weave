import { inContext, invalidIdError, isId } from './ids.js'

/** An application-defined entity. `kind` keeps equal IDs of different kinds apart. */
export interface EntityRef {
  kind: string
  id: string
}

/** Something one view can show for an entity. A load target is a time range, because load segments have no ID. */
export type ViewTarget =
  | { view: 'graph'; kind: 'node' | 'edge' | 'group'; id: string }
  | { view: 'timeline'; kind: 'bar' | 'dependency' | 'row'; id: string }
  | { view: 'load'; resourceId: string; start: number; end: number }

/** How a target was reached: by pointer or keyboard. */
export type ViewTargetSource = 'pointer' | 'keyboard'

/**
 * Payload of the `target-enter`, `target-leave` and `target-activate` component events. `T` narrows the target to the
 * targets of one view, for example `ViewTargetEvent<GraphViewTarget>` for NetworkGraph.
 */
export interface ViewTargetEvent<T extends ViewTarget = ViewTarget> {
  target: T
  source: ViewTargetSource
}

/** The graph variant of `ViewTarget`: a node, an edge or a group of a NetworkGraph. */
export type GraphViewTarget = Extract<ViewTarget, { view: 'graph' }>

/**
 * Result of a reveal method (`GanttChart.revealBar`, `NetworkGraph.revealNode`). `unknown`: no such item, nothing
 * moved. `hidden-by-collapse`: the item exists but a collapsed ancestor hides it; `proxyId` is the visible item that
 * stands in for it (for a bar, the nearest displayed ancestor row; for a node, the proxy of its outermost collapsed
 * group) and nothing moved. `revealed`: the view scrolled or moved its camera to the item.
 */
export type RevealStatus = 'revealed' | 'hidden-by-collapse' | 'unknown'

export interface RevealOptions {
  /** Move DOM focus to the item after it is scrolled into view and rendered. Default false. */
  focus?: boolean
  /** Camera scale for graph reveals. Timeline reveals ignore it. */
  scale?: number
}

export interface RevealResult {
  status: RevealStatus
  proxyId?: string
}

/** Links one entity to one target. Many-to-many links are allowed. */
export interface ViewBinding {
  entity: EntityRef
  target: ViewTarget
}

/** The load variant of `ViewTarget`: a half-open time range `[start, end)` of one resource. */
export type LoadViewTarget = Extract<ViewTarget, { view: 'load' }>

/** A two-way index of bindings built by `buildViewBindingIndex`. Treat it as opaque. */
export interface ViewBindingIndex {
  readonly entities: ReadonlyMap<string, { entity: EntityRef; targets: ViewTarget[] }>
  readonly targets: ReadonlyMap<string, { target: ViewTarget; entities: EntityRef[] }>
}

/** Targets that resolve from entities; `unknown` lists the entities that no binding reaches. */
export interface ResolvedViewTargets {
  targets: ViewTarget[]
  unknown: EntityRef[]
}

/** Entities that resolve from targets; `unknown` lists the targets that no binding reaches. */
export interface ResolvedEntityRefs {
  entities: EntityRef[]
  unknown: ViewTarget[]
}

/** The part of `TimelineLoadSegment` that resolution needs. */
export interface LoadSegmentLike {
  resourceId: string
  start: number
  end: number
}

export interface ResolvedLoadTargets<S extends LoadSegmentLike = LoadSegmentLike> {
  /** Current segments that overlap at least one target, in input order, without repeats. */
  segments: S[]
  /** Targets that overlap no current segment. They are never moved to another segment. */
  unknown: LoadViewTarget[]
}

// Keys are JSON tuples, so no delimiter can make two different references collide.
const entityKey = (entity: EntityRef): string => JSON.stringify([entity.kind, entity.id])

function targetKey(target: ViewTarget): string {
  return target.view === 'load'
    ? JSON.stringify(['load', target.resourceId, target.start, target.end])
    : JSON.stringify([target.view, target.kind, target.id])
}

function checkEntity(entity: EntityRef): void {
  if (!entity || typeof entity.kind !== 'string' || !entity.kind) {
    throw new Error('Invalid entity reference: kind and id must be non-empty strings')
  }
  if (!isId(entity.id)) throw invalidIdError('entity', entity.id)
}

function checkTarget(target: ViewTarget): void {
  if (!target) throw new Error('Invalid view target')
  if (target.view === 'load') {
    if (!isId(target.resourceId)) throw inContext(invalidIdError('resource', target.resourceId), 'load target')
    if (!Number.isFinite(target.start) || !Number.isFinite(target.end) || target.end < target.start) {
      throw new RangeError('Invalid load target range for resource ' + target.resourceId)
    }
  } else if ((target.view !== 'graph' && target.view !== 'timeline') || !target.kind) {
    throw new Error('Invalid view target')
  } else if (!isId(target.id)) {
    throw invalidIdError('view target', target.id)
  }
}

/** Two half-open ranges overlap when each starts before the other ends. Identical empty ranges also match. */
function overlaps(a: { start: number; end: number }, b: { start: number; end: number }): boolean {
  return (a.start < b.end && b.start < a.end) || (a.start === b.start && a.end === b.end)
}

/**
 * Builds a two-way index of `bindings`. Repeated identical bindings count once. Throws Error for an empty entity kind
 * or ID or an invalid target, and RangeError for a load range that is not finite or ends before it starts. The input is
 * not modified.
 */
export function buildViewBindingIndex(bindings: readonly ViewBinding[]): ViewBindingIndex {
  const entities = new Map<string, { entity: EntityRef; targets: ViewTarget[] }>()
  const targets = new Map<string, { target: ViewTarget; entities: EntityRef[] }>()
  const seen = new Set<string>()
  for (const { entity, target } of bindings) {
    checkEntity(entity)
    checkTarget(target)
    const ek = entityKey(entity), tk = targetKey(target)
    const pair = JSON.stringify([ek, tk])
    if (seen.has(pair)) continue
    seen.add(pair)
    const byEntity = entities.get(ek)
    const byTarget = targets.get(tk)
    const copyEntity: EntityRef = byEntity?.entity ?? { kind: entity.kind, id: entity.id }
    const copyTarget: ViewTarget = byTarget?.target ?? { ...target }
    if (byEntity) byEntity.targets.push(copyTarget)
    else entities.set(ek, { entity: copyEntity, targets: [copyTarget] })
    if (byTarget) byTarget.entities.push(copyEntity)
    else targets.set(tk, { target: copyTarget, entities: [copyEntity] })
  }
  return { entities, targets }
}

/** Returns the targets bound to `entities`, without repeats, in discovery order. Unbound entities are listed in `unknown`. */
export function resolveViewTargets(index: ViewBindingIndex, entities: Iterable<EntityRef>): ResolvedViewTargets {
  const found = new Map<string, ViewTarget>()
  const unknown = new Map<string, EntityRef>()
  for (const entity of entities) {
    checkEntity(entity)
    const key = entityKey(entity)
    const entry = index.entities.get(key)
    if (!entry) {
      if (!unknown.has(key)) unknown.set(key, { kind: entity.kind, id: entity.id })
      continue
    }
    for (const target of entry.targets) {
      const tk = targetKey(target)
      if (!found.has(tk)) found.set(tk, { ...target })
    }
  }
  return { targets: [...found.values()], unknown: [...unknown.values()] }
}

/**
 * Returns the entities bound to `targets`, without repeats, in discovery order. A load target matches the bound load
 * targets of the same resource whose range it overlaps. Targets that reach no entity are listed in `unknown`.
 */
export function resolveEntityRefs(index: ViewBindingIndex, targets: Iterable<ViewTarget>): ResolvedEntityRefs {
  const found = new Map<string, EntityRef>()
  const unknown = new Map<string, ViewTarget>()
  let loads: { target: LoadViewTarget; entities: EntityRef[] }[] | undefined
  for (const target of targets) {
    checkTarget(target)
    const matched: EntityRef[][] = []
    if (target.view === 'load') {
      loads ??= [...index.targets.values()].filter((e): e is { target: LoadViewTarget; entities: EntityRef[] } => e.target.view === 'load')
      for (const entry of loads) {
        if (entry.target.resourceId === target.resourceId && overlaps(entry.target, target)) matched.push(entry.entities)
      }
    } else {
      const entry = index.targets.get(targetKey(target))
      if (entry) matched.push(entry.entities)
    }
    if (matched.length === 0) {
      const key = targetKey(target)
      if (!unknown.has(key)) unknown.set(key, { ...target })
      continue
    }
    for (const list of matched) for (const entity of list) {
      const key = entityKey(entity)
      if (!found.has(key)) found.set(key, { ...entity })
    }
  }
  return { entities: [...found.values()], unknown: [...unknown.values()] }
}

/**
 * Finds the current load segments that overlap the given load targets. A target whose range overlaps no current segment
 * of its resource is reported in `unknown`; it is never replaced by another segment, because segment boundaries change
 * whenever load is recalculated. Throws RangeError for an invalid range. The inputs are not modified.
 */
export function resolveLoadTargets<S extends LoadSegmentLike>(
  segments: readonly S[],
  targets: Iterable<LoadViewTarget>,
): ResolvedLoadTargets<S> {
  const byResource = new Map<string, number[]>()
  segments.forEach((segment, i) => {
    const list = byResource.get(segment.resourceId)
    if (list) list.push(i)
    else byResource.set(segment.resourceId, [i])
  })
  const hit = new Set<number>()
  const unknown = new Map<string, LoadViewTarget>()
  for (const target of targets) {
    checkTarget(target)
    if (target.view !== 'load') throw new Error('Expected a load target')
    let matched = false
    for (const i of byResource.get(target.resourceId) ?? []) {
      if (overlaps(segments[i]!, target)) {
        hit.add(i)
        matched = true
      }
    }
    if (!matched) {
      const key = targetKey(target)
      if (!unknown.has(key)) unknown.set(key, { ...target })
    }
  }
  return { segments: [...hit].sort((a, b) => a - b).map(i => segments[i]!), unknown: [...unknown.values()] }
}

