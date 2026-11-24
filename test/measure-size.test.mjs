import assert from 'node:assert/strict'
import test from 'node:test'
import {
  absoluteSlack, classifyExports, compareToBaseline, formatBytes, measureBytes, renderTable, sumSizes, toBaseline,
// Tests of scripts/ may import those scripts directly.
} from '../scripts/measure-size.mjs'

const row = (group, name, gzip) => ({ group, name, raw: gzip * 3, gzip, brotli: gzip - 10 })

test('measureBytes reports raw, gzip and brotli sizes, and compression shrinks repetitive input', () => {
  const size = measureBytes('weave '.repeat(500))
  assert.equal(size.raw, 3000)
  assert.ok(size.gzip < 100 && size.brotli < 100)
  assert.deepEqual(sumSizes([size, size]), { raw: 6000, gzip: size.gzip * 2, brotli: size.brotli * 2 })
  assert.deepEqual(sumSizes([]), { raw: 0, gzip: 0, brotli: 0 })
})

test('formatBytes switches to kilobytes at 1024 bytes', () => {
  assert.equal(formatBytes(512), '512 B')
  assert.equal(formatBytes(2048), '2.00 kB')
  assert.equal(formatBytes(254845), '248.9 kB')
})

test('classifyExports separates components and composables and drops what core also exports', () => {
  const result = classifyExports(
    ['GanttChart', 'NetworkGraph', 'useEditHistory', 'useTimelineView', 'scheduleTasks', 'WeaveSnapshotError', 'default'],
    ['scheduleTasks', 'WeaveSnapshotError'],
  )
  assert.deepEqual(result, { components: ['GanttChart', 'NetworkGraph'], composables: ['useEditHistory', 'useTimelineView'] })
})

test('renderTable prints one markdown row per item', () => {
  const lines = renderTable([row('core', 'scheduleTasks', 2048)]).split('\n')
  assert.equal(lines.length, 3)
  assert.match(lines[2], /^\| scheduleTasks \| core \| 6\.00 kB \| 2\.00 kB \|/)
})

test('compareToBaseline accepts growth inside the tolerance and the slack, and rejects more', () => {
  const rows = [row('component', 'A', 10000), row('component', 'B', 1000), row('component', 'C', 1000)]
  const baseline = toBaseline([row('component', 'A', 9800), row('component', 'B', 1000 - absoluteSlack), row('component', 'C', 800)], 0.05)
  const result = compareToBaseline(rows, baseline)
  // A grew 2.0%, B by exactly the slack, C by 25%.
  assert.equal(result.ok, false)
  assert.equal(result.problems.length, 1)
  assert.match(result.problems[0], /^component\/C grew from 800 to 1000 gzip bytes \(\+25\.0%, limit 5%\)/)
})

test('compareToBaseline reports unknown and vanished items, and notes shrinkage without failing', () => {
  const baseline = toBaseline([row('core', 'old', 500), row('core', 'big', 10000)])
  const result = compareToBaseline([row('core', 'new', 500), row('core', 'big', 8000)], baseline)
  assert.deepEqual(result.problems, ['core/new is not in the baseline', 'core/old is in the baseline but was not measured'])
  assert.deepEqual(result.notes, ['core/big shrank from 10000 to 8000 gzip bytes'])
  assert.equal(compareToBaseline([row('core', 'big', 8000)], toBaseline([row('core', 'big', 10000)])).ok, true)
})

test('toBaseline keys items by group and name and records the tolerance', () => {
  const baseline = toBaseline([row('core', 'scheduleTasks', 1234)])
  assert.equal(baseline.tolerance, 0.05)
  assert.deepEqual(baseline.sizes, { 'core/scheduleTasks': { raw: 3702, gzip: 1234 } })
})
