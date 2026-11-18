// A simulated, deterministic data source for the large plan demo. Nothing goes over the network: every answer is
// computed from the indices, delivered after a fixed delay, and fails while `failing()` is true. The counters are demo
// counters that show how much was fetched, not benchmarks.
import type { GraphEdge, NetworkNode, TimelineBar, TimelineDependency, TimelineRow, WindowedDataPage, WindowedDataRequest } from '../../src'

export const hour = 3_600_000
export const day = 24 * hour
export const week = 7 * day
export const planStart = Date.UTC(2026, 0, 5)
export const planRange = { start: planStart, end: planStart + 26 * week }

const groups = 50
const linesPerGroup = 20
const barsPerLine = 90
/** Every tenth line is a spare line without any tasks, so its windows load empty. */
const isSpare = (line: number) => line % 10 === 9
const pad = (value: number, size: number) => String(value).padStart(size, '0')

export interface PlanBar extends TimelineBar { critical: boolean }

/** All rows (the row skeleton is small and loaded at once): 50 areas of 20 lines each. */
export const planRows: TimelineRow[] = []
for (let group = 0; group < groups; group++) {
  planRows.push({ id: 'g' + pad(group + 1, 2), label: 'Area ' + pad(group + 1, 2) })
  for (let index = 0; index < linesPerGroup; index++) {
    const line = group * linesPerGroup + index
    planRows.push({
      id: 'r' + pad(line + 1, 4), label: 'Line ' + pad(line + 1, 4), parentId: 'g' + pad(group + 1, 2),
      ...isSpare(line) && { detail: 'Spare' },
    })
  }
}

function barOf(line: number, k: number): PlanBar {
  const start = planStart + k * 2 * day + ((line * 31 + k * 17) % 12) * hour
  return {
    id: `b${line + 1}-${k + 1}`, rowId: 'r' + pad(line + 1, 4), label: `Job ${k + 1}`,
    start, end: start + (16 + ((line * 13 + k * 7) % 40)) * hour, critical: k % 4 === 0,
  }
}

/** The filters of the demo, used as the condition token of the loader. */
export type PlanFilter = 'all' | 'critical'
const passes = (k: number, filter: PlanFilter) => filter === 'all' || k % 4 === 0

/** Total bars of the plan for a filter (computed from the formula, never loaded). */
export function totalBars(filter: PlanFilter) {
  let count = 0
  for (let line = 0; line < groups * linesPerGroup; line++) {
    if (isSpare(line)) continue
    for (let k = 0; k < barsPerLine; k++) if (passes(k, filter)) count++
  }
  return count
}

/** Links leaving a bar: to the next job on the line every third job, and to a job on the next line every ninth. */
function linksFrom(line: number, k: number, filter: PlanFilter): TimelineDependency[] {
  const links: TimelineDependency[] = []
  const from = barOf(line, k).id
  if (k % 3 === 0 && k + 1 < barsPerLine && passes(k + 1, filter)) links.push({ id: `l${line + 1}-${k + 1}`, from, to: barOf(line, k + 1).id })
  const next = line + 1
  if (k % 9 === 0 && k + 2 < barsPerLine && next < groups * linesPerGroup && !isSpare(next) && passes(k + 2, filter)) {
    links.push({ id: `x${line + 1}-${k + 1}`, from, to: barOf(next, k + 2).id, type: 'SS' })
  }
  return links
}

/** The bars that overlap `[start, end)` on the requested rows, with the links that leave them. */
export function queryPlan(request: WindowedDataRequest, filter: PlanFilter): WindowedDataPage<PlanBar, TimelineDependency> {
  const items: PlanBar[] = []
  const links: TimelineDependency[] = []
  const first = Math.max(0, Math.floor((request.start - planStart) / (2 * day)) - 3)
  const last = Math.min(barsPerLine - 1, Math.ceil((request.end - planStart) / (2 * day)))
  for (const rowId of request.rowIds ?? []) {
    if (!rowId.startsWith('r')) continue
    const line = Number(rowId.slice(1)) - 1
    if (isSpare(line)) continue
    for (let k = first; k <= last; k++) {
      if (!passes(k, filter)) continue
      const bar = barOf(line, k)
      if (bar.end > request.start && bar.start < request.end) {
        items.push(bar)
        links.push(...linksFrom(line, k, filter))
      }
    }
  }
  return { items, links }
}

// Graph: 5,000 parts in one cycle (i → i + 1) with a chord i → 7i + 3 from every even part, so neighbourhoods overlap.
export const partCount = 5000
const inverse7 = 2143 // 7 · 2143 ≡ 1 (mod 5000)
const mod = (value: number) => ((value % partCount) + partCount) % partCount
export const partId = (index: number) => 'p' + index
export const partNode = (index: number): NetworkNode => ({ id: partId(index), label: 'Part ' + (index + 1) })
function partEdges(index: number): GraphEdge[] {
  const edges: GraphEdge[] = [{ id: `c${index}`, from: partId(index), to: partId(mod(index + 1)) }]
  if (index % 2 === 0) edges.push({ id: `k${index}`, from: partId(index), to: partId(mod(index * 7 + 3)) })
  return edges
}
/** Edges that touch a part: its own outgoing edges and those of the parts pointing at it. */
function incidentEdges(index: number) {
  const edges = partEdges(index)
  edges.push(partEdges(mod(index - 1))[0]!)
  const source = mod((index - 3) * inverse7)
  if (source % 2 === 0) edges.push(partEdges(source)[1]!)
  return edges
}
/** One hop around a part: the part, its neighbours, its edges and the outgoing edges of its neighbours (which can dangle). */
export function queryNeighbours(id: string) {
  const index = Number(id.slice(1))
  const nodes = new Map<string, NetworkNode>([[id, partNode(index)]])
  const edges = new Map<string, GraphEdge>()
  for (const edge of incidentEdges(index)) {
    edges.set(edge.id, edge)
    const other = edge.from === id ? edge.to : edge.from
    nodes.set(other, partNode(Number(other.slice(1))))
  }
  for (const node of [...nodes.keys()]) {
    if (node === id) continue
    for (const edge of partEdges(Number(node.slice(1)))) edges.set(edge.id, edge)
  }
  return { nodes: [...nodes.values()], edges: [...edges.values()] }
}

/** Delivers `answer()` after `delay` ms unless the signal aborts first; rejects while `failing()` is true. */
export function simulate<T>(answer: () => T, options: { delay: number; failing: () => boolean; signal?: AbortSignal }): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer)
      reject(new DOMException('Aborted', 'AbortError'))
    }
    const timer = setTimeout(() => {
      options.signal?.removeEventListener('abort', abort)
      if (options.failing()) reject(new Error('The plan service is unavailable'))
      else resolve(answer())
    }, options.delay)
    if (options.signal?.aborted) abort()
    else options.signal?.addEventListener('abort', abort, { once: true })
  })
}
