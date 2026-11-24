// Times core operations on generated inputs. Run after `npm run build` (`npm run bench:core` does both).
// It imports the built package entry, so it measures what consumers run, and applies no pass/fail threshold: the
// numbers belong to one machine and one Node version. See docs/performance.md.
//
//   node scripts/bench-core.mjs [--runs 7] [--only scheduleTasks,levelResources]
//
// Each case is warmed up once, then timed `runs` times; the table reports the median and the fastest run in
// milliseconds. Inputs come from a fixed-seed generator, so repeated runs time identical work.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { cpus } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const { name: packageName } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const core = await import(`${packageName}/core`)

const args = process.argv.slice(2)
const option = (flag, fallback) => { const at = args.indexOf(flag); return at === -1 ? fallback : args[at + 1] }
const runs = Number(option('--runs', 7))
if (!Number.isInteger(runs) || runs < 1) throw new Error('--runs must be a positive integer')
const only = option('--only', '')?.split(',').filter(Boolean)

function random(seed) {
  let state = seed
  return () => (state = (state * 1103515245 + 12345) % 2147483648) / 2147483648
}

const median = values => {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = sorted.length >> 1
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

function time(fn) {
  const start = performance.now()
  const result = fn()
  return { ms: performance.now() - start, result }
}

// ---- generated inputs -------------------------------------------------------------------------------------------

const day = 24
/** A calendar with an 8-hour shift on Monday to Friday, over `days` days (day 0 is a Monday). */
function weekdayCalendar(days) {
  const periods = []
  for (let d = 0; d < days; d++) if (d % 7 < 5) periods.push({ start: d * day + 8, end: d * day + 16 })
  return { id: 'weekdays', periods }
}

/** Tasks in lanes of chained work with finish-to-start links and a cross link every few tasks. */
function scheduleInput(count, { lanes = 8, calendar = true } = {}) {
  const next = random(count)
  const tasks = [], dependencies = []
  for (let i = 0; i < count; i++) {
    tasks.push({ id: 't' + i, duration: 1 + Math.floor(next() * 8), ...(calendar ? { calendarId: 'weekdays' } : {}) })
    if (i >= lanes) dependencies.push({ id: `d${i}`, from: 't' + (i - lanes), to: 't' + i })
    if (i >= lanes * 3 && i % 5 === 0) dependencies.push({ id: `x${i}`, from: 't' + (i - lanes * 3 + 1), to: 't' + i, type: 'SS', lag: 2 })
  }
  const days = Math.ceil(count / lanes) * 3 + 60
  return { range: { start: 0, end: days * day }, ...(calendar ? { calendars: [weekdayCalendar(days)], defaultCalendarId: 'weekdays' } : {}), tasks, dependencies }
}

function levelInput(count) {
  const input = scheduleInput(count, { lanes: 16 })
  const people = Math.max(2, Math.round(count / 20))
  const next = random(count + 1)
  const resources = Array.from({ length: people }, (_, i) => ({ id: 'r' + i, capacity: 1 }))
  const assignments = input.tasks.map(task => ({ resourceId: 'r' + Math.floor(next() * people), taskId: task.id }))
  // Leveling pushes work later, so the horizon needs room beyond the unleveled plan.
  const days = Math.ceil(input.range.end / day) * 2
  return { ...input, range: { start: 0, end: days * day }, calendars: [weekdayCalendar(days)], resources, assignments }
}

/** A layered DAG: each node links to one or two nodes of earlier columns. */
function graphInput(count) {
  const next = random(count + 7)
  const nodes = [], edges = []
  for (let i = 0; i < count; i++) {
    nodes.push({ id: 'n' + i })
    if (i > 0) edges.push({ id: `e${i}`, from: 'n' + Math.max(0, i - 1 - Math.floor(next() * 6)), to: 'n' + i })
    if (i > 8 && i % 3 === 0) edges.push({ id: `f${i}`, from: 'n' + (i - 2 - Math.floor(next() * 7)), to: 'n' + i })
  }
  return { nodes, edges, byId: new Map(nodes.map(node => [node.id, node])) }
}

/** Timeline rows in a tree: `count` rows, 1 in 6 a parent of the next rows, nested up to a few levels. */
function rowInput(count) {
  const rows = []
  const parents = []
  for (let i = 0; i < count; i++) {
    const depth = i % 6 === 0 ? Math.min(parents.length, i % 18 === 0 ? 0 : (i % 12 === 0 ? 1 : 2)) : parents.length
    parents.length = Math.min(parents.length, depth)
    rows.push({ id: 'row' + i, label: 'Row ' + i, ...(parents.length ? { parentId: parents[parents.length - 1] } : {}) })
    if (i % 6 === 0) parents.push('row' + i)
  }
  return rows
}

// ---- cases ------------------------------------------------------------------------------------------------------

const cases = []
const add = (name, sizes, prepare, run) => cases.push({ name, sizes, prepare, run })

add('scheduleTasks (weekday calendar, FS + SS links)', [100, 1000, 10000],
  size => scheduleInput(size), input => core.scheduleTasks(input))
add('scheduleTasks (no calendar)', [100, 1000, 10000],
  size => scheduleInput(size, { calendar: false }), input => core.scheduleTasks(input))
add('levelResources (1 task per 20 resources)', [100, 1000, 3000, 10000],
  size => levelInput(size), input => core.levelResources(input))
add('layoutLayeredGraph', [100, 1000, 5000],
  size => graphInput(size), ({ nodes, edges }) => core.layoutLayeredGraph(nodes, edges))
add('routeGraphEdges (curve)', [100, 1000, 5000],
  size => { const g = graphInput(size); return { ...g, layout: core.layoutLayeredGraph(g.nodes, g.edges) } },
  ({ edges, byId, layout }) => core.routeGraphEdges(layout, edges, byId, { style: 'curve' }))
add('routeGraphEdges (orthogonal, avoid nodes)', [100, 500, 1000],
  size => { const g = graphInput(size); return { ...g, layout: core.layoutLayeredGraph(g.nodes, g.edges) } },
  ({ edges, byId, layout }) => core.routeGraphEdges(layout, edges, byId, { style: 'orthogonal', avoidNodes: true }))
// A saved change of a large two-dimensional graph: one node moved back and forth, every call routing the whole graph,
// with and without a route cache (both give the same result).
function movedGridInput(count) {
  const nodes = [], edges = []
  for (let i = 0; i < count; i++) {
    nodes.push({ id: 'n' + i })
    if (i % 30) edges.push({ id: 'd' + i, from: 'n' + (i - 1), to: 'n' + i })
    if (i >= 30) edges.push({ id: 'r' + i, from: 'n' + (i - 30), to: 'n' + i })
  }
  const byId = new Map(nodes.map(node => [node.id, node]))
  const base = core.layoutLayeredGraph(nodes, edges)
  const id = 'n' + (count >> 1), box = base.boxes.get(id)
  const moved = core.applyGraphPositions(base, edges, new Map([[id, { x: box.x + 40, y: box.y + 20 }]]), 'LR')
  const layouts = [base, moved].map(layout => core.routeGraphPorts(layout, byId, edges, 'LR'))
  const cache = core.createGraphRouteCache?.()
  if (cache) core.routeGraphEdges(layouts[0], edges, byId, { style: 'orthogonal', avoidNodes: true, cache })
  return { edges, byId, layouts, cache, turn: 0 }
}
const routeMoved = useCache => input => core.routeGraphEdges(input.layouts[++input.turn % 2], input.edges, input.byId, {
  style: 'orthogonal', avoidNodes: true, ...useCache && { cache: input.cache },
})
add('routeGraphEdges (orthogonal, avoid nodes, grid, one node moved)', [1000, 3000], movedGridInput, routeMoved(false))
if (typeof core.createGraphRouteCache === 'function') {
  add('routeGraphEdges (orthogonal, avoid nodes, grid, one node moved, route cache)', [1000, 3000], movedGridInput, routeMoved(true))
}

if (typeof core.createTreeGridIndex === 'function' && typeof core.flattenTreeGrid === 'function') {
  // TreeGrid rows: build the index once, then flatten with a third of the parents expanded.
  add('createTreeGridIndex', [1000, 10000, 50000],
    size => ({ rows: rowInput(size), columns: Array.from({ length: 20 }, (_, i) => ({ id: 'c' + i, label: 'C' + i, width: 80, value: () => i })) }),
    input => core.createTreeGridIndex(input))
  add('flattenTreeGrid (every third parent expanded)', [1000, 10000, 50000],
    size => {
      const input = { rows: rowInput(size), columns: [{ id: 'c', label: 'C', width: 80, value: () => 1 }] }
      return { index: core.createTreeGridIndex(input), expanded: input.rows.filter((_, i) => i % 18 === 0).map(row => row.id) }
    },
    ({ index, expanded }) => core.flattenTreeGrid(index, expanded))
  // The work one scroll step does: the row window, the column window and the cell view of every visible cell.
  add('TreeGrid window + resolveTreeGridCell (30 lines x 12 columns, 1000 scroll steps)', [10000, 50000],
    size => {
      const columns = Array.from({ length: 50 }, (_, i) => ({ id: 'c' + i, label: 'C' + i, width: 100, value: row => row.id.length + i }))
      const index = core.createTreeGridIndex({ rows: rowInput(size), columns })
      const expanded = index.rows.filter((_, i) => i % 18 === 0).map(row => row.id)
      return { index, flat: core.flattenTreeGrid(index, expanded), offsets: core.treeGridColumnOffsets(columns) }
    },
    ({ index, flat, offsets }) => {
      let cells = 0
      for (let step = 0; step < 1000; step++) {
        const rows = core.treeGridRowWindow({ scrollTop: (step * 32) % Math.max(1, flat.lines.length * 32 - 960), viewport: 960, rowHeight: 32, count: flat.lines.length })
        const cols = core.treeGridColumnWindow(offsets, { scrollStart: step * 20, viewport: 1200 })
        for (let r = rows.start; r < Math.min(rows.end, rows.start + 30); r++) {
          const line = flat.lines[r]
          if (line?.kind !== 'row') continue
          for (let c = cols.start; c < Math.min(cols.end, cols.start + 12); c++) { core.resolveTreeGridCell(index, line.row.id, 'c' + c); cells++ }
        }
      }
      if (cells === 0) throw new Error('The TreeGrid window case resolved no cells')
      return cells
    })
} else {
  // This build has no TreeGrid: time the row tree that GanttChart's row column uses instead.
  add('createTimelineRowTree (row hierarchy, TreeGrid not in this build)', [1000, 10000, 50000],
    size => rowInput(size), rows => core.createTimelineRowTree(rows))
}
add('visibleRows (virtual window, 50000 rows)', [1],
  () => null, () => { for (let i = 0; i < 1000; i++) core.visibleRows(i * 640, 800, 32, 50000) })

// ---- run --------------------------------------------------------------------------------------------------------

function runCases(selected = cases) {
  const rows = []
  for (const { name, sizes, prepare, run } of selected) {
    for (const size of sizes) {
      const input = prepare(size)
      const first = time(() => run(input))
      if (first.result && first.result.ok === false) throw new Error(`${name} at ${size} did not succeed: ${JSON.stringify(first.result).slice(0, 200)}`)
      const times = Array.from({ length: runs }, () => time(() => run(input)).ms)
      rows.push({ name, size, medianMs: median(times), minMs: Math.min(...times), maxMs: Math.max(...times), runs })
      process.stderr.write(`${name} ${size}: ${rows.at(-1).medianMs.toFixed(2)} ms\n`)
    }
  }
  return rows
}

const fmt = ms => ms >= 100 ? ms.toFixed(0) : ms >= 10 ? ms.toFixed(1) : ms.toFixed(2)
const selected = only?.length ? cases.filter(item => only.some(key => item.name.includes(key))) : cases
const rows = runCases(selected)
const table = ['| Operation | Size | Median (ms) | Fastest (ms) | Slowest (ms) |', '| --- | ---: | ---: | ---: | ---: |',
  ...rows.map(row => `| ${row.name} | ${row.size} | ${fmt(row.medianMs)} | ${fmt(row.minMs)} | ${fmt(row.maxMs)} |`)].join('\n')
console.log(table)

const out = join(root, 'artifacts', 'bench')
mkdirSync(out, { recursive: true })
writeFileSync(join(out, 'core.json'), JSON.stringify({
  measuredAt: new Date().toISOString(), node: process.version, cpu: cpus()[0]?.model, cores: cpus().length, runs, rows,
}, null, 2) + '\n')
console.error(`\nWrote ${join(out, 'core.json')}`)
