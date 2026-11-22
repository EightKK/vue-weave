import { indexGraph } from './graph.js'
import type { GraphBox, GraphEdge, GraphIndex, GraphLayout, GraphPoint, IdentifiedNode } from './graph.js'
import { checkLayoutNumber, checkLayoutSizes, defaultNodeHeight, defaultNodeWidth, defaultPadding } from './graphOptions.js'

export interface GraphForceLayoutOptions {
  nodeWidth?: number
  nodeHeight?: number
  padding?: number
  /** Simulation steps. Positive integer, default 300. */
  iterations?: number
  /** Preferred distance between the centres of linked nodes. Default 180. */
  linkDistance?: number
  /** Strength of the repulsion between every pair of nodes (Barnes–Hut approximated). Default 600. */
  repulsion?: number
  /** Pull of every node toward the centre of its group, in [0, 1]. Default 0.05. */
  gravity?: number
  /** Minimum free space kept between node boxes by the final overlap passes. Default 16. */
  nodeGap?: number
  /** Integer seed of the pseudo-random initial placement. Default 1. */
  seed?: number
  /** Start positions (box top-left corners). Nodes without one start next to a placed neighbour or at a seeded random point. Unknown IDs are ignored. */
  initialPositions?: ReadonlyMap<string, GraphPoint>
  /** Node IDs pinned to their initial position. Unknown IDs are ignored. */
  fixed?: ReadonlySet<string>
}

const THETA2 = 1.44
const MAX_DEPTH = 48
const MAX_OVERLAP_PASSES = 2000
const SPREAD_EVERY = 100
const SPREAD_FACTOR = 1.05
const INTERNAL = -2

function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Iterative Barnes–Hut quadtree in reusable typed arrays. Cells are created after their parent,
 * so one reverse sweep aggregates mass and centres.
 */
class Quadtree {
  capacity = 0
  cells = 0
  x0 = new Float64Array(0)
  y0 = new Float64Array(0)
  size = new Float64Array(0)
  mass = new Float64Array(0)
  cx = new Float64Array(0)
  cy = new Float64Array(0)
  head = new Int32Array(0)
  depth = new Int32Array(0)
  parent = new Int32Array(0)
  kids = new Int32Array(0)
  next: Int32Array

  constructor(points: number) {
    this.next = new Int32Array(points)
    this.grow(Math.max(16, points * 2))
  }

  private grow(capacity: number) {
    const copy = <T extends Float64Array | Int32Array>(old: T, fresh: T) => { fresh.set(old); return fresh }
    this.x0 = copy(this.x0, new Float64Array(capacity))
    this.y0 = copy(this.y0, new Float64Array(capacity))
    this.size = copy(this.size, new Float64Array(capacity))
    this.mass = copy(this.mass, new Float64Array(capacity))
    this.cx = copy(this.cx, new Float64Array(capacity))
    this.cy = copy(this.cy, new Float64Array(capacity))
    this.head = copy(this.head, new Int32Array(capacity))
    this.depth = copy(this.depth, new Int32Array(capacity))
    this.parent = copy(this.parent, new Int32Array(capacity))
    this.kids = copy(this.kids, new Int32Array(capacity * 4))
    this.capacity = capacity
  }

  private cell(x0: number, y0: number, size: number, depth: number, parent: number) {
    if (this.cells === this.capacity) this.grow(this.capacity * 2)
    const c = this.cells++
    this.x0[c] = x0; this.y0[c] = y0; this.size[c] = size
    this.head[c] = -1; this.depth[c] = depth; this.parent[c] = parent
    this.kids.fill(-1, c * 4, c * 4 + 4)
    return c
  }

  private child(cell: number, x: number, y: number) {
    const half = this.size[cell]! / 2
    const right = x >= this.x0[cell]! + half ? 1 : 0, bottom = y >= this.y0[cell]! + half ? 1 : 0
    const slot = cell * 4 + right + 2 * bottom
    let kid = this.kids[slot]!
    if (kid === -1) {
      kid = this.cell(this.x0[cell]! + right * half, this.y0[cell]! + bottom * half, half, this.depth[cell]! + 1, cell)
      this.kids[slot] = kid
    }
    return kid
  }

  build(xs: Float64Array, ys: Float64Array, n: number) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (let i = 0; i < n; i++) {
      const x = xs[i]!, y = ys[i]!
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
    this.cells = 0
    this.cell(minX, minY, Math.max(maxX - minX, maxY - minY, 1), 0, -1)
    const { next } = this
    next.fill(-1)
    for (let i = 0; i < n; i++) {
      let cell = 0
      for (;;) {
        const head = this.head[cell]!
        if (head === INTERNAL) { cell = this.child(cell, xs[i]!, ys[i]!); continue }
        if (head === -1) { this.head[cell] = i; break }
        if (this.depth[cell]! >= MAX_DEPTH) { next[i] = head; this.head[cell] = i; break }
        // A leaf above the depth limit holds one point: move it down and retry.
        this.head[cell] = INTERNAL
        this.head[this.child(cell, xs[head]!, ys[head]!)] = head
      }
    }
    const { mass, cx, cy, parent } = this
    mass.fill(0, 0, this.cells); cx.fill(0, 0, this.cells); cy.fill(0, 0, this.cells)
    for (let c = this.cells - 1; c >= 0; c--) {
      if (this.head[c] !== INTERNAL) for (let j = this.head[c]!; j !== -1; j = next[j]!) { mass[c]!++; cx[c]! += xs[j]!; cy[c]! += ys[j]! }
      if (c > 0) { const p = parent[c]!; mass[p]! += mass[c]!; cx[p]! += cx[c]!; cy[p]! += cy[c]! }
      cx[c]! /= mass[c]!; cy[c]! /= mass[c]!
    }
  }
}

interface Group {
  /** Global node indices in this group. */
  members: number[]
  /** Unique undirected neighbour pairs as local indices. */
  links: [number, number][]
}

interface Settings {
  width: number
  height: number
  iterations: number
  linkDistance: number
  repulsion: number
  gravity: number
  gap: number
}

/** Velocity-Verlet simulation of one group, d3-force style: links, many-body repulsion and gravity with cooling alpha. */
function simulate(group: Group, xs: Float64Array, ys: Float64Array, pinned: Uint8Array, settings: Settings, random: () => number) {
  const n = group.members.length
  if (n < 2) return
  const { iterations, linkDistance, repulsion, gravity } = settings
  const degree = new Float64Array(n)
  for (const [a, b] of group.links) { degree[a]!++; degree[b]!++ }
  const linkStrength = group.links.map(([a, b]) => 1 / Math.min(degree[a]!, degree[b]!))
  const linkBias = group.links.map(([a, b]) => degree[a]! / (degree[a]! + degree[b]!))
  const vx = new Float64Array(n), vy = new Float64Array(n)
  let pinnedCount = 0, centreX = 0, centreY = 0
  for (let i = 0; i < n; i++) if (pinned[i]) { pinnedCount++; centreX += xs[i]!; centreY += ys[i]! }
  if (pinnedCount) { centreX /= pinnedCount; centreY /= pinnedCount }
  else { for (let i = 0; i < n; i++) { centreX += xs[i]!; centreY += ys[i]! } centreX /= n; centreY /= n }

  const alphaMin = 0.001
  const alphaDecay = 1 - Math.pow(alphaMin, 1 / iterations)
  const velocityKeep = 0.6
  let alpha = 1
  const jiggle = () => (random() - 0.5) * 1e-3
  const tree = new Quadtree(n)
  const stack = new Int32Array(MAX_DEPTH * 4 + 8)

  for (let tick = 0; tick < iterations; tick++) {
    alpha += -alpha * alphaDecay

    for (let k = 0; k < group.links.length; k++) {
      const [s, t] = group.links[k]!
      let dx = xs[t]! + vx[t]! - xs[s]! - vx[s]!, dy = ys[t]! + vy[t]! - ys[s]! - vy[s]!
      if (dx === 0) dx = jiggle()
      if (dy === 0) dy = jiggle()
      let l = Math.sqrt(dx * dx + dy * dy)
      l = (l - linkDistance) / l * alpha * linkStrength[k]!
      dx *= l; dy *= l
      const b = linkBias[k]!
      vx[t]! -= dx * b; vy[t]! -= dy * b
      vx[s]! += dx * (1 - b); vy[s]! += dy * (1 - b)
    }

    tree.build(xs, ys, n)
    const strength = -repulsion * alpha
    for (let i = 0; i < n; i++) {
      const xi = xs[i]!, yi = ys[i]!
      let fx = 0, fy = 0
      let top = 0
      stack[top++] = 0
      while (top) {
        const c = stack[--top]!
        const head = tree.head[c]!
        if (head !== INTERNAL) {
          for (let j = head; j !== -1; j = tree.next[j]!) {
            if (j === i) continue
            let dx = xs[j]! - xi, dy = ys[j]! - yi
            if (dx === 0) dx = jiggle()
            if (dy === 0) dy = jiggle()
            const l2 = Math.max(dx * dx + dy * dy, 1)
            fx += dx * strength / l2; fy += dy * strength / l2
          }
          continue
        }
        const dx = tree.cx[c]! - xi, dy = tree.cy[c]! - yi
        const l2 = dx * dx + dy * dy
        const size = tree.size[c]!
        if (size * size < THETA2 * l2) {
          const w = strength * tree.mass[c]! / Math.max(l2, 1)
          fx += dx * w; fy += dy * w
          continue
        }
        for (let q = 0; q < 4; q++) { const kid = tree.kids[c * 4 + q]!; if (kid !== -1) stack[top++] = kid }
      }
      vx[i]! += fx + (centreX - xi) * gravity * alpha
      vy[i]! += fy + (centreY - yi) * gravity * alpha
    }

    for (let i = 0; i < n; i++) {
      if (pinned[i]) { vx[i] = 0; vy[i] = 0; continue }
      vx[i]! *= velocityKeep; vy[i]! *= velocityKeep
      xs[i]! += vx[i]!; ys[i]! += vy[i]!
    }
  }
}

/**
 * Gauss–Seidel passes over a uniform grid push overlapping boxes apart along the shallower axis. When crowding
 * persists, free nodes are spread out from the centroid a little so the passes always converge.
 */
function resolveOverlaps(xs: Float64Array, ys: Float64Array, pinned: Uint8Array, n: number, settings: Settings) {
  const spanX = settings.width + settings.gap, spanY = settings.height + settings.gap
  const grid = new Map<number, number[]>()
  for (let pass = 0; pass < MAX_OVERLAP_PASSES; pass++) {
    if (pass && pass % SPREAD_EVERY === 0) {
      let cx = 0, cy = 0
      for (let i = 0; i < n; i++) { cx += xs[i]!; cy += ys[i]! }
      cx /= n; cy /= n
      for (let i = 0; i < n; i++) {
        if (pinned[i]) continue
        xs[i] = cx + (xs[i]! - cx) * SPREAD_FACTOR
        ys[i] = cy + (ys[i]! - cy) * SPREAD_FACTOR
      }
    }
    let minGx = Infinity, minGy = Infinity, maxGy = -Infinity
    for (let i = 0; i < n; i++) {
      const gx = Math.floor(xs[i]! / spanX), gy = Math.floor(ys[i]! / spanY)
      if (gx < minGx) minGx = gx
      if (gy < minGy) minGy = gy
      if (gy > maxGy) maxGy = gy
    }
    // Cells are keyed by column * stride + row; the stride leaves room for the neighbouring rows.
    const stride = maxGy - minGy + 3
    const keyOf = (i: number) => (Math.floor(xs[i]! / spanX) - minGx + 1) * stride + Math.floor(ys[i]! / spanY) - minGy + 1
    grid.clear()
    for (let i = 0; i < n; i++) {
      const key = keyOf(i)
      const cell = grid.get(key)
      if (cell) cell.push(i)
      else grid.set(key, [i])
    }
    let moved = false
    for (let i = 0; i < n; i++) {
      const centre = keyOf(i)
      for (let ox = -1; ox <= 1; ox++) {
        for (let oy = -1; oy <= 1; oy++) {
          const cell = grid.get(centre + ox * stride + oy)
          if (!cell) continue
          for (const j of cell) {
            if (j <= i || (pinned[i] && pinned[j])) continue
            const dx = xs[j]! - xs[i]!, dy = ys[j]! - ys[i]!
            const px = spanX - Math.abs(dx), py = spanY - Math.abs(dy)
            if (px <= 0 || py <= 0) continue
            moved = true
            const shareI = pinned[i] ? 0 : pinned[j] ? 1 : 0.5
            const shareJ = 1 - shareI
            if (px / spanX <= py / spanY) {
              const push = (px + 1e-6) * (dx < 0 ? -1 : 1)
              xs[i]! -= push * shareI; xs[j]! += push * shareJ
            } else {
              const push = (py + 1e-6) * (dy < 0 ? -1 : 1)
              ys[i]! -= push * shareI; ys[j]! += push * shareJ
            }
          }
        }
      }
    }
    if (!moved) return
  }
}

interface Route {
  kind: 'L' | 'Q' | 'C'
  points: number[]
  label: GraphPoint
}

/** Exit point of the segment from the box centre toward `toward`, on the box border. */
function clip(cx: number, cy: number, halfW: number, halfH: number, toward: GraphPoint): GraphPoint {
  const dx = toward.x - cx, dy = toward.y - cy
  if (dx === 0 && dy === 0) return { x: cx, y: cy }
  const t = Math.min(dx === 0 ? Infinity : halfW / Math.abs(dx), dy === 0 ? Infinity : halfH / Math.abs(dy), 1)
  return { x: cx + dx * t, y: cy + dy * t }
}

function routeEdges(edges: readonly GraphEdge[], slot: Map<string, number>, xs: Float64Array, ys: Float64Array, settings: Settings) {
  const halfW = settings.width / 2, halfH = settings.height / 2
  const routes = new Map<string, Route>()
  const bundles = new Map<string, GraphEdge[]>()
  for (const edge of edges) {
    const key = edge.from < edge.to ? edge.from + '\u0000' + edge.to : edge.to + '\u0000' + edge.from
    const bundle = bundles.get(key)
    if (bundle) bundle.push(edge)
    else bundles.set(key, [edge])
  }
  for (const bundle of bundles.values()) {
    const first = bundle[0]!
    if (first.from === first.to) {
      const i = slot.get(first.from)!
      const x = xs[i]! + halfW, y = ys[i]!
      bundle.forEach((edge, k) => {
        const s = 1 + 0.5 * k
        routes.set(edge.id, {
          kind: 'C', points: [x, y, x + 30 * s, y + 18 * s, x + 30 * s, y - 28 * s, x, y - 12],
          label: { x: x + 22.5 * s, y: y - (30 * s + 12) / 8 },
        })
      })
      continue
    }
    // A canonical orientation gives opposite-direction edges of one pair distinct offsets.
    const a = first.from < first.to ? first.from : first.to, b = a === first.from ? first.to : first.from
    const ia = slot.get(a)!, ib = slot.get(b)!
    const ax = xs[ia]!, ay = ys[ia]!, bx = xs[ib]!, by = ys[ib]!
    const length = Math.hypot(bx - ax, by - ay) || 1
    const nx = -(by - ay) / length, ny = (bx - ax) / length
    bundle.forEach((edge, k) => {
      const [sx, sy, tx, ty] = edge.from === a ? [ax, ay, bx, by] : [bx, by, ax, ay]
      const bend = bundle.length > 1 ? (k - (bundle.length - 1) / 2) * 48 : 0
      if (!bend) {
        const from = clip(sx, sy, halfW, halfH, { x: tx, y: ty }), to = clip(tx, ty, halfW, halfH, { x: sx, y: sy })
        routes.set(edge.id, { kind: 'L', points: [from.x, from.y, to.x, to.y], label: { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 - 6 } })
        return
      }
      const control = { x: (sx + tx) / 2 + nx * bend, y: (sy + ty) / 2 + ny * bend }
      const from = clip(sx, sy, halfW, halfH, control), to = clip(tx, ty, halfW, halfH, control)
      routes.set(edge.id, {
        kind: 'Q', points: [from.x, from.y, control.x, control.y, to.x, to.y],
        label: { x: (from.x + 2 * control.x + to.x) / 4, y: (from.y + 2 * control.y + to.y) / 4 },
      })
    })
  }
  return routes
}

interface Bounds { minX: number; minY: number; maxX: number; maxY: number }

function groupBounds(members: readonly number[], xs: Float64Array, ys: Float64Array, routes: Iterable<Route>, settings: Settings): Bounds {
  const bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }
  const add = (x: number, y: number) => {
    bounds.minX = Math.min(bounds.minX, x); bounds.maxX = Math.max(bounds.maxX, x)
    bounds.minY = Math.min(bounds.minY, y); bounds.maxY = Math.max(bounds.maxY, y)
  }
  for (const i of members) {
    add(xs[i]! - settings.width / 2, ys[i]! - settings.height / 2)
    add(xs[i]! + settings.width / 2, ys[i]! + settings.height / 2)
  }
  for (const route of routes) for (let k = 0; k < route.points.length; k += 2) add(route.points[k]!, route.points[k + 1]!)
  return bounds
}

/** The distinct undirected neighbours of every node slot, without self-loops, in edge order. */
function undirectedNeighbours(index: GraphIndex, slot: ReadonlyMap<string, number>, n: number): number[][] {
  const neighbours: number[][] = Array.from({ length: n }, () => [])
  const seen = new Set<string>()
  for (const [from, targets] of index.outgoing) {
    const a = slot.get(from)!
    for (const to of targets) {
      const b = slot.get(to)!
      if (a === b) continue
      const key = a < b ? a + ',' + b : b + ',' + a
      if (seen.has(key)) continue
      seen.add(key)
      neighbours[a]!.push(b)
      neighbours[b]!.push(a)
    }
  }
  return neighbours
}

/**
 * Undirected breadth-first components of the node slots, each listed in breadth-first order from its first slot, with
 * the component of every slot and its depth from that first slot.
 */
function breadthFirstComponents(neighbours: readonly (readonly number[])[]) {
  const n = neighbours.length
  const component = new Int32Array(n).fill(-1)
  const rank = new Int32Array(n)
  const components: number[][] = []
  for (let start = 0; start < n; start++) {
    if (component[start] !== -1) continue
    const members = [start]
    component[start] = components.length
    for (let k = 0; k < members.length; k++) {
      const i = members[k]!
      for (const j of neighbours[i]!) {
        if (component[j] !== -1) continue
        component[j] = components.length
        rank[j] = rank[i]! + 1
        members.push(j)
      }
    }
    components.push(members)
  }
  return { component, rank, components }
}

/**
 * Shifts that pack the free groups in rows of similar width, starting to the right of `frame` (the bounds of the pinned
 * group) when there is one, else at the origin.
 */
function shelfPack<G extends { bounds: Bounds }>(free: readonly G[], frame: Bounds | undefined, gap: number): Map<G, GraphPoint> {
  const spacing = Math.max(40, gap)
  let area = 0, widest = 0
  for (const { bounds } of free) {
    const w = bounds.maxX - bounds.minX, h = bounds.maxY - bounds.minY
    area += (w + spacing) * (h + spacing)
    widest = Math.max(widest, w)
  }
  const rowWidth = Math.max(widest, Math.sqrt(area) * 1.2)
  const originX = frame ? frame.maxX + spacing : 0, originY = frame ? frame.minY : 0
  let cursorX = originX, cursorY = originY, rowHeight = 0
  const shifts = new Map<G, GraphPoint>()
  for (const group of free) {
    const w = group.bounds.maxX - group.bounds.minX, h = group.bounds.maxY - group.bounds.minY
    if (cursorX > originX && cursorX - originX + w > rowWidth) { cursorX = originX; cursorY += rowHeight + spacing; rowHeight = 0 }
    shifts.set(group, { x: cursorX - group.bounds.minX, y: cursorY - group.bounds.minY })
    cursorX += w + spacing
    rowHeight = Math.max(rowHeight, h)
  }
  return shifts
}

function checkOptions(options: GraphForceLayoutOptions) {
  const {
    nodeWidth = defaultNodeWidth, nodeHeight = defaultNodeHeight, padding = defaultPadding, iterations = 300, linkDistance = 180,
    repulsion = 600, gravity = 0.05, nodeGap = 16, seed = 1,
  } = options
  checkLayoutSizes(nodeWidth, nodeHeight, { padding, linkDistance, repulsion, nodeGap })
  checkLayoutNumber('iterations', iterations, 'positiveInteger')
  checkLayoutNumber('gravity', gravity, 'unitInterval')
  checkLayoutNumber('seed', seed, 'safeInteger')
  for (const [id, point] of options.initialPositions ?? []) {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) throw new RangeError('Initial position must be finite: ' + id)
  }
  return { nodeWidth, nodeHeight, padding, iterations, linkDistance, repulsion, gravity, nodeGap, seed }
}

/**
 * Deterministic force-directed layout: link springs, Barnes–Hut repulsion and gravity, followed by box-overlap passes.
 * Connected components without pinned nodes are laid out separately and packed in rows; components containing a
 * pinned node share the caller's coordinate frame. Box `rank` is the breadth-first depth (ignoring edge direction)
 * from the first node of its component in input order.
 */
export function layoutForceGraph(
  nodes: readonly IdentifiedNode[],
  edges: readonly GraphEdge[],
  options: GraphForceLayoutOptions = {},
): GraphLayout {
  const checked = checkOptions(options)
  const index = indexGraph(nodes, edges)
  const { padding } = checked
  const settings: Settings = {
    width: checked.nodeWidth, height: checked.nodeHeight, iterations: checked.iterations,
    linkDistance: checked.linkDistance, repulsion: checked.repulsion, gravity: checked.gravity, gap: checked.nodeGap,
  }
  if (!nodes.length) {
    return { boxes: new Map(), paths: new Map(), edgeLabels: new Map(), width: Math.max(1, 2 * padding), height: Math.max(1, 2 * padding) }
  }

  const n = nodes.length
  const slot = new Map(nodes.map((node, i) => [node.id, i]))
  const neighbours = undirectedNeighbours(index, slot, n)

  // Undirected breadth-first components; depth from the first node in input order is the box rank.
  const { component, rank, components } = breadthFirstComponents(neighbours)

  const halfW = settings.width / 2, halfH = settings.height / 2
  const initial = options.initialPositions
  const pinnedTopLeft = new Map<number, GraphPoint>()
  const isPinned = new Uint8Array(n)
  for (const id of options.fixed ?? []) {
    const i = slot.get(id)
    if (i !== undefined) isPinned[i] = 1
  }
  const pinnedComponents = new Set<number>()
  for (let i = 0; i < n; i++) if (isPinned[i]) pinnedComponents.add(component[i]!)

  // Components holding a pinned node are simulated together in the caller's frame; the others one by one.
  const groups: { members: number[]; framed: boolean }[] = []
  const framed = components.filter((_, c) => pinnedComponents.has(c)).flat()
  if (framed.length) groups.push({ members: framed, framed: true })
  components.forEach((members, c) => { if (!pinnedComponents.has(c)) groups.push({ members, framed: false }) })

  const random = mulberry32(checked.seed)
  const gx = new Float64Array(n), gy = new Float64Array(n)
  const routes = new Map<string, Route>()
  const edgesByGroup = new Map<number, GraphEdge[]>()
  const groupOf = new Int32Array(n)
  groups.forEach((group, g) => { for (const i of group.members) groupOf[i] = g })
  for (const edge of edges) {
    const g = groupOf[slot.get(edge.from)!]!
    const list = edgesByGroup.get(g)
    if (list) list.push(edge)
    else edgesByGroup.set(g, [edge])
  }

  const placed: { members: number[]; bounds: Bounds; routes: Map<string, Route>; framed: boolean }[] = []
  for (let g = 0; g < groups.length; g++) {
    const { members, framed: inFrame } = groups[g]!
    const m = members.length
    const local = new Map(members.map((i, k) => [i, k]))
    const xs = new Float64Array(m), ys = new Float64Array(m), pinned = new Uint8Array(m)
    const known = new Uint8Array(m)
    let knownX = 0, knownY = 0, knownCount = 0
    members.forEach((i, k) => {
      const point = initial?.get(nodes[i]!.id)
      pinned[k] = isPinned[i]!
      if (point) {
        xs[k] = point.x + halfW; ys[k] = point.y + halfH; known[k] = 1
        knownX += xs[k]!; knownY += ys[k]!; knownCount++
      }
    })
    const spread = settings.linkDistance * Math.sqrt(m) / 2 + 1
    const centreX = knownCount ? knownX / knownCount : 0, centreY = knownCount ? knownY / knownCount : 0
    // Members are in breadth-first order per component, so a placed neighbour is usually available.
    for (let k = 0; k < m; k++) {
      if (known[k]) continue
      const angle = 2 * Math.PI * random(), radius = Math.sqrt(random())
      let anchor: number | undefined
      for (const j of neighbours[members[k]!]!) {
        const l = local.get(j)!
        if (known[l]) { anchor = l; break }
      }
      const reach = anchor === undefined ? spread : settings.linkDistance
      xs[k] = (anchor === undefined ? centreX : xs[anchor]!) + Math.cos(angle) * radius * reach
      ys[k] = (anchor === undefined ? centreY : ys[anchor]!) + Math.sin(angle) * radius * reach
      known[k] = 1
    }
    // Pinned boxes are reported from the given corner itself, so centre arithmetic cannot round them.
    members.forEach((i, k) => {
      if (!pinned[k]) return
      const given = initial?.get(nodes[i]!.id)
      pinnedTopLeft.set(i, given ? { x: given.x, y: given.y } : { x: xs[k]! - halfW, y: ys[k]! - halfH })
    })

    const links: [number, number][] = []
    for (let k = 0; k < m; k++) for (const j of neighbours[members[k]!]!) { const l = local.get(j)!; if (k < l) links.push([k, l]) }
    simulate({ members: members.map((_, k) => k), links }, xs, ys, pinned, settings, random)
    resolveOverlaps(xs, ys, pinned, m, settings)
    members.forEach((i, k) => { gx[i] = xs[k]!; gy[i] = ys[k]! })

    const groupRoutes = routeEdges(edgesByGroup.get(g) ?? [], slot, gx, gy, settings)
    placed.push({ members, bounds: groupBounds(members, gx, gy, groupRoutes.values(), settings), routes: groupRoutes, framed: inFrame })
  }

  // Shelf-pack free components in rows, to the right of the pinned frame when there is one.
  const frame = placed.find(group => group.framed)
  const shifts = shelfPack(placed.filter(group => !group.framed), frame?.bounds, settings.gap)

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const group of placed) {
    const shift = shifts.get(group) ?? { x: 0, y: 0 }
    minX = Math.min(minX, group.bounds.minX + shift.x); maxX = Math.max(maxX, group.bounds.maxX + shift.x)
    minY = Math.min(minY, group.bounds.minY + shift.y); maxY = Math.max(maxY, group.bounds.maxY + shift.y)
  }
  // Without pinned nodes the drawing starts at padding; with them the caller's frame is kept unless something would cross padding.
  const offsetX = frame ? Math.max(0, padding - minX) : padding - minX
  const offsetY = frame ? Math.max(0, padding - minY) : padding - minY

  const boxes = new Map<string, GraphBox>()
  const paths = new Map<string, string>()
  const edgeLabels = new Map<string, GraphPoint>()
  const boxOf = new Map<number, GraphBox>()
  for (const group of placed) {
    const shift = shifts.get(group) ?? { x: 0, y: 0 }
    const dx = shift.x + offsetX, dy = shift.y + offsetY
    for (const i of group.members) {
      const pin = pinnedTopLeft.get(i)
      const x = pin ? pin.x + dx : gx[i]! - halfW + dx, y = pin ? pin.y + dy : gy[i]! - halfH + dy
      boxOf.set(i, { x, y, width: settings.width, height: settings.height, rank: rank[i]! })
    }
    for (const [id, route] of group.routes) {
      const p = route.points.map((value, k) => value + (k % 2 ? dy : dx))
      paths.set(id, route.kind === 'L'
        ? `M ${p[0]} ${p[1]} L ${p[2]} ${p[3]}`
        : route.kind === 'Q'
          ? `M ${p[0]} ${p[1]} Q ${p[2]} ${p[3]}, ${p[4]} ${p[5]}`
          : `M ${p[0]} ${p[1]} C ${p[2]} ${p[3]}, ${p[4]} ${p[5]}, ${p[6]} ${p[7]}`)
      edgeLabels.set(id, { x: route.label.x + dx, y: route.label.y + dy })
    }
  }
  for (let i = 0; i < n; i++) boxes.set(nodes[i]!.id, boxOf.get(i)!)
  return {
    boxes, paths, edgeLabels,
    width: Math.max(1, maxX + offsetX + padding),
    height: Math.max(1, maxY + offsetY + padding),
  }
}
