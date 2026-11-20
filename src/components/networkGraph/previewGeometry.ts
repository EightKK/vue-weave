// Building blocks of NetworkGraph's drag previews. A node drag, resize or waypoint drag changes a few nodes or one edge,
// so the preview layout shares the saved layout's maps and recomputes only what the change touches.
import type { GraphBox, GraphNodeSize, GraphPoint } from '../../core/graph.js'

/** A read-only map that layers a few changed entries over a base map without copying it. */
export class LayeredMap<K, V> extends Map<K, V> {
  private readonly base: ReadonlyMap<K, V>
  // Changed entries; undefined removes an entry of the base.
  private readonly changes: ReadonlyMap<K, V | undefined>
  private readonly count: number
  constructor(base: ReadonlyMap<K, V>, changes: ReadonlyMap<K, V | undefined>) {
    super()
    this.base = base
    this.changes = changes
    let count = base.size
    for (const [key, value] of changes) count += (value !== undefined ? 1 : 0) - (base.has(key) ? 1 : 0)
    this.count = count
  }
  override get(key: K) {
    return this.changes.has(key) ? this.changes.get(key) : this.base.get(key)
  }
  override has(key: K) {
    return this.changes.has(key) ? this.changes.get(key) !== undefined : this.base.has(key)
  }
  override get size() {
    return this.count
  }
  override *entries(): MapIterator<[K, V]> {
    for (const [key, value] of this.base) {
      const next = this.changes.has(key) ? this.changes.get(key) : value
      if (next !== undefined) yield [key, next]
    }
    for (const [key, value] of this.changes) if (value !== undefined && !this.base.has(key)) yield [key, value]
  }
  override [Symbol.iterator]() {
    return this.entries()
  }
  override *keys(): MapIterator<K> {
    for (const [key] of this.entries()) yield key
  }
  override *values(): MapIterator<V> {
    for (const [, value] of this.entries()) yield value
  }
  override forEach(callback: (value: V, key: K, map: Map<K, V>) => void, thisArg?: unknown) {
    for (const [key, value] of this.entries()) callback.call(thisArg, value, key, this)
  }
  override set(): this {
    throw new TypeError('A preview layout is read-only')
  }
  override delete(): boolean {
    throw new TypeError('A preview layout is read-only')
  }
  override clear() {
    throw new TypeError('A preview layout is read-only')
  }
}

/** How far right and down one item stretches the layout. */
export type Extent = { id: string; width: number; height: number }
/** Extents sorted by width and by height, largest first. */
export type Extents = { byWidth: Extent[]; byHeight: Extent[] }

/** Sorts extents by width and by height; sorts `list` in place for the height order. */
export function sortExtents(list: Extent[]): Extents {
  return { byWidth: [...list].sort((a, b) => b.width - a.width), byHeight: list.sort((a, b) => b.height - a.height) }
}

/** The largest width and height among the extents whose ID is not skipped. */
export function largestExtent(extents: Extents, skip: { has(id: string): boolean }) {
  let width = -Infinity, height = -Infinity
  for (const item of extents.byWidth) {
    if (skip.has(item.id)) continue
    width = item.width
    break
  }
  for (const item of extents.byHeight) {
    if (skip.has(item.id)) continue
    height = item.height
    break
  }
  return { width, height }
}

/**
 * The box a saved or previewed position and size give a layout box, and how far it stretches the layout, as
 * applyGraphPositions and applyGraphSizes compute them. Undefined when the node keeps its layout box.
 */
export function placeBox(box: GraphBox, point: GraphPoint | undefined, size: GraphNodeSize | undefined) {
  const moved = point !== undefined && (point.x !== box.x || point.y !== box.y)
  const resized = size !== undefined && (size.width !== box.width || size.height !== box.height)
  if (!moved && !resized) return undefined
  let next = box, width = -Infinity, height = -Infinity
  if (moved) {
    next = { ...box, x: point.x, y: point.y }
    width = point.x + box.width + 32
    height = point.y + box.height + 32
  }
  if (resized) {
    next = { ...next, width: size.width, height: size.height }
    width = Math.max(width, next.x + size.width + 32)
    height = Math.max(height, next.y + size.height + 32)
  }
  return { box: next, width, height }
}
