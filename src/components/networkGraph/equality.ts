// Value comparisons that let NetworkGraph's computed values keep their previous identity while nothing they hold has
// changed, so the parts of the render that depend on them do not run again.
import type { GraphLayout } from '../../core/graph.js'

// Plain values compared one level deep: equal primitives, or arrays with identical items.
function sameValue(a: unknown, b: unknown) {
  if (a === b) return true
  return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((item, i) => item === b[i])
}

/** Objects with the same own keys whose values are equal one level deep (see `sameValue`). */
export function sameRecord(a: object | undefined, b: object | undefined) {
  if (a === b) return true
  if (!a || !b) return false
  const keys = Object.keys(a)
  return keys.length === Object.keys(b).length
    && keys.every(key => Object.hasOwn(b, key) && sameValue((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]))
}

/** The previous object while every value is the same, else the next one. */
export function keep<T extends object>(previous: T | undefined, next: T) {
  return previous && sameRecord(previous, next) ? previous : next
}

/** The previous set while it holds the same IDs, else the next one. */
export function keepIds(previous: ReadonlySet<string> | undefined, next: ReadonlySet<string>) {
  return previous && previous.size === next.size && [...next].every(id => previous.has(id)) ? previous : next
}

function sameMap<V>(a: ReadonlyMap<string, V> | undefined, b: ReadonlyMap<string, V> | undefined, same: (x: V, y: V) => boolean) {
  if (a === b) return true
  if (!a || !b || a.size !== b.size) return false
  for (const [key, value] of a) {
    if (!b.has(key) || !same(value, b.get(key)!)) return false
  }
  return true
}

/** Equal geometry: the same size, boxes, paths, label anchors and route metadata. */
export function sameGeometry(a: GraphLayout, b: GraphLayout) {
  return a.width === b.width && a.height === b.height
    && sameMap(a.boxes, b.boxes, sameRecord) && sameMap(a.paths, b.paths, (x, y) => x === y)
    && sameMap(a.edgeLabels, b.edgeLabels, sameRecord)
    && sameMap(a.routes, b.routes, (x, y) => x === y || JSON.stringify(x) === JSON.stringify(y))
}
