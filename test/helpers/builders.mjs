// Small input builders and geometry checks shared by the core tests. `npm test` runs test/*.test.mjs only, so this directory holds no tests.
import { hour } from './time.mjs'

/** A scheduling task with its duration and any further fields. */
export const task = (id, duration, fields = {}) => ({ id, duration, ...fields })

/** A dependency named `from-to`; `type` and `lag` are kept even when undefined. */
export const link = (from, to, type, lag) => ({ id: from + '-' + to, from, to, type, lag })

/** A dependency named `from-to` that leaves out an unset `type` and a zero or unset `lag`. */
export const sparseLink = (from, to, type, lag) => ({ id: from + '-' + to, from, to, ...(type ? { type } : {}), ...(lag ? { lag } : {}) })

/** The scheduled tasks of a result as `[id, start, end]`. */
export const dates = result => result.tasks.map(item => [item.id, item.start, item.end])

/** A dependency named `from-to` whose `type` defaults to 'FS'. */
export const typedLink = (from, to, type = 'FS') => ({ id: from + '-' + to, from, to, type })

/** The scheduled tasks of a result as an object from ID to `[start, end]`. */
export const datesById = result => Object.fromEntries(result.tasks.map(item => [item.id, [item.start, item.end]]))

/** The scheduled tasks of a result as an object from ID to `[start, end, working periods as [start, end] pairs]`. */
export const datesWithWork = result => Object.fromEntries(result.tasks.map(item => [item.id, [item.start, item.end, item.work.map(w => [w.start, w.end])]]))

/** The scheduled task with the given ID. */
export const taskById = (result, id) => result.tasks.find(item => item.id === id)

/** A map from `id` to item. */
export const byId = list => new Map(list.map(item => [item.id, item]))

/** Freezes a value and every object reachable from it, so a test fails when a function mutates its input. */
export const deepFreeze = value => {
  if (value && typeof value === 'object') {
    for (const item of Object.values(value)) deepFreeze(item)
    Object.freeze(value)
  }
  return value
}

/** A swimlane box for validation tests: ID and label 'L', a 10 by 10 body and an empty header. */
export const laneBox = id => ({ id, label: 'L', x: 0, y: 0, width: 10, height: 10, header: { x: 0, y: 0, width: 0, height: 0 } })

/** The points of a path drawn with M, L, H and V commands only. */
export function polyline(path) {
  const tokens = path.match(/[MLHV]|[-+]?\d*\.?\d+(?:e[-+]?\d+)?/gi)
  const points = []
  let command = '', x = 0, y = 0
  for (let i = 0; i < tokens.length;) {
    if (/[MLHV]/.test(tokens[i])) command = tokens[i++]
    if (command === 'M' || command === 'L') {
      x = Number(tokens[i++])
      y = Number(tokens[i++])
    } else if (command === 'H') x = Number(tokens[i++])
    else if (command === 'V') y = Number(tokens[i++])
    else throw new Error('Unexpected command ' + command + ' in ' + path)
    points.push({ x, y })
  }
  return points
}

/** Every segment of a path drawn only with M, L, H and V commands, as pairs of points. */
export const segments = path => {
  const points = polyline(path)
  return points.slice(1).map((point, index) => [points[index], point])
}

/** Whether a point lies on the border of a box, within 0.01. */
export const onBorder = (box, point) => {
  const near = (a, b) => Math.abs(a - b) <= 0.01
  return ((near(point.x, box.x) || near(point.x, box.x + box.width)) && point.y >= box.y - 0.01 && point.y <= box.y + box.height + 0.01)
    || ((near(point.y, box.y) || near(point.y, box.y + box.height)) && point.x >= box.x - 0.01 && point.x <= box.x + box.width + 0.01)
}

/** The centre point of a box. */
export const centre = box => ({ x: box.x + box.width / 2, y: box.y + box.height / 2 })

/** Graph nodes with the given IDs, each labelled `label(id)` (by default the ID itself). */
export const graphNodes = (ids, label = id => id) => ids.map(id => ({ id, label: label(id) }))

/** Graph edges for `[from, to]` pairs, with the IDs `prefix + index` (by default '0', '1', ...). */
export const graphEdges = (pairs, prefix = '') => pairs.map(([from, to], i) => ({ id: prefix + i, from, to }))

/** The IDs 'n0', 'n1', ... of a graph with `count` nodes. */
export const nodeIds = count => Array.from({ length: count }, (_, i) => 'n' + i)

/** The edges 'e0', 'e1', ... of a chain through `ids`; with `cycle`, a last edge closes it into one cycle. */
export const chainEdges = (ids, cycle = false) => {
  const edges = ids.slice(1).map((id, i) => ({ id: 'e' + i, from: ids[i], to: id }))
  if (cycle && ids.length) edges.push({ id: 'e' + edges.length, from: ids.at(-1), to: ids[0] })
  return edges
}

/** The `range` and `pixelsPerUnit` props of a GanttChart that shows ten hours at 10 pixels per hour. */
export const ganttScale = () => ({ range: { start: 0, end: 10 * hour }, pixelsPerUnit: 10 / hour })
