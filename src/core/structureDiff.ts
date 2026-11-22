import { duplicateIdError, invalidIdError, isId, withContext } from './ids.js'

/**
 * How `diffStructure` reads an item's key or parent key: a property name, or a function. A property name also leaves
 * that property out of the default field set.
 */
export type StructureKeyAccessor<T, K> = (keyof T & string) | ((item: T) => K)

export interface StructureDiffOptions<T> {
  /** The item key that matches the two versions: a non-empty string, unique within each version. */
  key: StructureKeyAccessor<T, string>
  /**
   * The compared fields. A list of property names is compared in list order. A function returns the field values of
   * one item; its fields are compared in order of first appearance (the before item's, then the after item's new ones).
   * Default: the own enumerable properties of both items in order of first appearance, without the properties named
   * by `key` and `parentKey` when those are property names.
   */
  fields?: readonly (keyof T & string)[] | ((item: T) => Readonly<Record<string, unknown>>)
  /**
   * The parent key of a tree-shaped collection; `undefined` or `null` for a root. A parent must be a key of the same
   * version. Items whose parent differs between the versions are reported in `moved`. Omit for a flat collection.
   */
  parentKey?: StructureKeyAccessor<T, string | null | undefined>
  /** Whether two values of one field are equal. Default: `Object.is`, so objects and arrays compare by reference. */
  equals?: (before: unknown, after: unknown, field: string) => boolean
}

/** One changed field, with the values of both versions as they are (not copied). */
export interface StructureFieldChange {
  name: string
  before: unknown
  after: unknown
}

/** An item in both versions whose fields differ. `fields` are in field order (see `StructureDiffOptions.fields`). */
export interface StructureChange {
  key: string
  fields: readonly StructureFieldChange[]
}

/** An item in both versions whose parent differs. A missing parent is a root. */
export interface StructureMove {
  key: string
  beforeParent?: string
  afterParent?: string
}

/**
 * The differences between two versions of a keyed collection. `added` is in the order of the after version; `removed`,
 * `changed` and `moved` are in the order of the before version.
 */
export interface StructureDiff {
  added: readonly string[]
  removed: readonly string[]
  changed: readonly StructureChange[]
  /** Parent changes. Always empty without `parentKey`. Order changes among siblings are not reported. */
  moved: readonly StructureMove[]
}

interface Version<T> {
  items: Map<string, T>
  order: string[]
  parents: Map<string, string | undefined>
}

function accessor<T, K>(value: StructureKeyAccessor<T, K>, name: string): (item: T) => K {
  if (typeof value === 'function') return value
  if (typeof value === 'string') {
    return item => {
      if (typeof item !== 'object' || item === null) throw new TypeError(`An item must be an object to read ${name} '${value}'`)
      return (item as Record<string, unknown>)[value] as K
    }
  }
  throw new TypeError(`${name} must be a function or a property name`)
}

function readVersion<T>(
  items: readonly T[], side: string, key: (item: T) => string, parentKey: ((item: T) => string | null | undefined) | undefined,
): Version<T> {
  if (!Array.isArray(items)) throw new TypeError(`The ${side} items must be an array`)
  return withContext(side, () => {
    const map = new Map<string, T>()
    const order: string[] = []
    const parents = new Map<string, string | undefined>()
    for (const item of items) {
      const id: unknown = key(item)
      if (!isId(id)) throw invalidIdError('item', id)
      if (map.has(id)) throw duplicateIdError('item', id)
      map.set(id, item)
      order.push(id)
      if (!parentKey) continue
      const parent: unknown = parentKey(item)
      if (parent === undefined || parent === null) parents.set(id, undefined)
      else if (isId(parent)) parents.set(id, parent)
      else throw invalidIdError('parent', parent)
    }
    if (parentKey) checkTree(order, parents)
    return { items: map, order, parents }
  })
}

/** Every parent names an item, and no item is its own ancestor. One pass up each chain, so O(n) and loop-only. */
function checkTree(order: readonly string[], parents: ReadonlyMap<string, string | undefined>) {
  for (const id of order) {
    const parent = parents.get(id)
    if (parent !== undefined && !parents.has(parent)) throw new Error('Unknown parent for item: ' + id)
  }
  const done = new Set<string>()
  for (const id of order) {
    const path = new Set<string>()
    let current: string | undefined = id
    while (current !== undefined && !done.has(current)) {
      if (path.has(current)) throw new Error('The item hierarchy contains a cycle: ' + current)
      path.add(current)
      current = parents.get(current)
    }
    for (const visited of path) done.add(visited)
  }
}

function record(item: unknown): Record<string, unknown> {
  if (typeof item !== 'object' || item === null) throw new TypeError('An item must be an object to compare its properties')
  return item as Record<string, unknown>
}

/**
 * Compare two versions of a flat or tree-shaped collection by key, for example two revisions of a bill of materials,
 * a WBS or a product hierarchy. Returns the added and removed keys, the changed fields with their values in both
 * versions, and, with `parentKey`, the items whose parent changed. Each version is checked on its own; a check that
 * fails names the version, as in `Duplicate item ID: a (before)`. Throws an Error for an invalid or duplicate key, an
 * invalid or unknown parent key or a cycle, and a TypeError for inputs that are not arrays, invalid options or a
 * `fields` function that returns no object. Resolve effective dates before the call: diff two resolved versions. The
 * inputs are not changed, and the values in the result are the inputs' own.
 */
export function diffStructure<T>(before: readonly T[], after: readonly T[], options: StructureDiffOptions<T>): StructureDiff {
  if (!options || typeof options !== 'object') throw new TypeError('diffStructure needs options with a key')
  const key = accessor(options.key, 'key')
  const parentKey = options.parentKey === undefined ? undefined : accessor(options.parentKey, 'parentKey')
  const equals = options.equals ?? Object.is
  if (typeof equals !== 'function') throw new TypeError('equals must be a function')
  const { fields } = options
  let listed: readonly string[] | undefined
  if (Array.isArray(fields)) {
    const seen = new Set<string>()
    for (const name of fields as readonly unknown[]) {
      if (typeof name !== 'string') throw new TypeError('A field name must be a string')
      if (seen.has(name)) throw new Error('Duplicate field name: ' + name)
      seen.add(name)
    }
    listed = fields
  } else if (fields !== undefined && typeof fields !== 'function') {
    throw new TypeError('fields must be a list of property names or a function')
  }
  const skip = new Set<string>()
  if (typeof options.key === 'string') skip.add(options.key)
  if (typeof options.parentKey === 'string') skip.add(options.parentKey)

  const old = readVersion(before, 'before', key, parentKey)
  const next = readVersion(after, 'after', key, parentKey)

  const values = (item: T, side: string): Record<string, unknown> => {
    if (typeof fields !== 'function') return record(item)
    const result: unknown = fields(item)
    if (typeof result !== 'object' || result === null) throw new TypeError(`fields must return an object (${side})`)
    return result as Record<string, unknown>
  }
  const changed: StructureChange[] = []
  const moved: StructureMove[] = []
  for (const id of old.order) {
    const item = old.items.get(id)!
    if (!next.items.has(id)) continue
    const other = next.items.get(id)!
    const a = values(item, 'before')
    const b = values(other, 'after')
    let names: Iterable<string>
    if (listed) names = listed
    else {
      const union = new Set(Object.keys(a))
      for (const name of Object.keys(b)) union.add(name)
      if (typeof fields !== 'function') for (const name of skip) union.delete(name)
      names = union
    }
    const differences: StructureFieldChange[] = []
    for (const name of names) {
      if (!equals(a[name], b[name], name)) differences.push({ name, before: a[name], after: b[name] })
    }
    if (differences.length) changed.push({ key: id, fields: differences })
    if (!parentKey) continue
    const beforeParent = old.parents.get(id)
    const afterParent = next.parents.get(id)
    if (beforeParent !== afterParent) {
      moved.push({
        key: id,
        ...(beforeParent !== undefined ? { beforeParent } : {}),
        ...(afterParent !== undefined ? { afterParent } : {}),
      })
    }
  }
  return {
    added: next.order.filter(id => !old.items.has(id)),
    removed: old.order.filter(id => !next.items.has(id)),
    changed,
    moved,
  }
}
