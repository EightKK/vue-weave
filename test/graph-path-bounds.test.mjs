import assert from 'node:assert/strict'
import { test } from 'node:test'
import { cullGraphElements, graphLayoutBounds, graphPathBounds, layoutLayeredGraph, renderGraphSvg } from 'vue-weave/core'

const tolerance = 1e-9
const steps = 2000

// Independent evaluators: each segment is described by hand in absolute coordinates and sampled from its formula.

function line(from, to) {
  return bezier([from, to])
}

function quad(from, control, to) {
  return bezier([from, control, to])
}

function cubic(from, first, second, to) {
  return bezier([from, first, second, to])
}

/** Samples a Bézier curve of any degree from its Bernstein polynomial form. */
function bezier(points) {
  const degree = points.length - 1
  const binomial = k => {
    let value = 1
    for (let i = 1; i <= k; i++) value = value * (degree - k + i) / i
    return value
  }
  const samples = []
  for (let step = 0; step <= steps; step++) {
    const t = step / steps
    let x = 0, y = 0
    for (let k = 0; k <= degree; k++) {
      const weight = binomial(k) * (1 - t) ** (degree - k) * t ** k
      x += weight * points[k][0]
      y += weight * points[k][1]
    }
    samples.push([x, y])
  }
  return samples
}

/**
 * Signed angle between two vectors, following SVG 1.1 implementation note F.6.5.4. The magnitude uses atan2
 * rather than the note's acos, which loses precision for angles near 0 and π.
 */
function vectorAngle(ux, uy, vx, vy) {
  const cross = ux * vy - uy * vx
  const magnitude = Math.atan2(Math.abs(cross), ux * vx + uy * vy)
  return cross < 0 ? -magnitude : magnitude
}

/** Samples an SVG elliptical arc through its center parameterization (SVG 1.1 notes F.6.5 and F.6.6). */
function arc(from, rx, ry, degrees, largeArc, sweep, to) {
  const [x1, y1] = from, [x2, y2] = to
  if (x1 === x2 && y1 === y2) return [from]
  if (rx === 0 || ry === 0) return line(from, to)
  rx = Math.abs(rx)
  ry = Math.abs(ry)
  const phi = degrees * Math.PI / 180
  const c = Math.cos(phi), s = Math.sin(phi)
  const x1p = c * (x1 - x2) / 2 + s * (y1 - y2) / 2
  const y1p = -s * (x1 - x2) / 2 + c * (y1 - y2) / 2
  const lambda = x1p ** 2 / rx ** 2 + y1p ** 2 / ry ** 2
  if (lambda > 1) {
    rx *= Math.sqrt(lambda)
    ry *= Math.sqrt(lambda)
  }
  const numerator = rx ** 2 * ry ** 2 - rx ** 2 * y1p ** 2 - ry ** 2 * x1p ** 2
  const root = Math.sqrt(Math.max(0, numerator / (rx ** 2 * y1p ** 2 + ry ** 2 * x1p ** 2)))
  const sign = largeArc === sweep ? -1 : 1
  const cxp = sign * root * rx * y1p / ry, cyp = -sign * root * ry * x1p / rx
  const cx = c * cxp - s * cyp + (x1 + x2) / 2, cy = s * cxp + c * cyp + (y1 + y2) / 2
  const start = vectorAngle(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry)
  let extent = vectorAngle((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry) % (2 * Math.PI)
  if (!sweep && extent > 0) extent -= 2 * Math.PI
  if (sweep && extent < 0) extent += 2 * Math.PI
  const samples = []
  for (let step = 0; step <= steps; step++) {
    const theta = start + extent * step / steps
    samples.push([
      cx + rx * c * Math.cos(theta) - ry * s * Math.sin(theta),
      cy + rx * s * Math.cos(theta) + ry * c * Math.sin(theta),
    ])
  }
  // Sanity check of the evaluator itself: it must start and end at the given end points.
  assert.ok(Math.hypot(samples[0][0] - x1, samples[0][1] - y1) < 1e-6, 'arc evaluator starts at its start point')
  assert.ok(Math.hypot(samples[steps][0] - x2, samples[steps][1] - y2) < 1e-6, 'arc evaluator ends at its end point')
  return samples
}

function assertContains(path, ...segments) {
  const bounds = graphPathBounds(path)
  assert.ok(bounds, 'bounds for ' + path)
  for (const value of Object.values(bounds)) assert.ok(Number.isFinite(value), 'finite bounds for ' + path)
  for (const [x, y] of segments.flat()) {
    assert.ok(
      x >= bounds.x - tolerance && x <= bounds.x + bounds.width + tolerance
        && y >= bounds.y - tolerance && y <= bounds.y + bounds.height + tolerance,
      `${path}: sample (${x}, ${y}) lies outside ${JSON.stringify(bounds)}`,
    )
  }
  return bounds
}

/** Asserts the bounds also hug the samples, for shapes whose bounds are documented as exact. */
function assertTight(path, ...segments) {
  const bounds = assertContains(path, ...segments)
  const points = segments.flat()
  const xs = points.map(point => point[0]), ys = points.map(point => point[1])
  const slack = 1e-3
  assert.ok(Math.abs(Math.min(...xs) - bounds.x) < slack, path + ': left edge is tight')
  assert.ok(Math.abs(Math.min(...ys) - bounds.y) < slack, path + ': top edge is tight')
  assert.ok(Math.abs(Math.max(...xs) - (bounds.x + bounds.width)) < slack, path + ': right edge is tight')
  assert.ok(Math.abs(Math.max(...ys) - (bounds.y + bounds.height)) < slack, path + ': bottom edge is tight')
  return bounds
}

test('path numbers with exponents are read as numbers, not commands', () => {
  assert.deepEqual(graphPathBounds('M 1e-7 0 L 1 1'), { x: 1e-7, y: 0, width: 1 - 1e-7, height: 1 })
  assert.deepEqual(graphPathBounds('M 1E-7 0 L 1 1'), { x: 1e-7, y: 0, width: 1 - 1e-7, height: 1 })
  assert.deepEqual(graphPathBounds('M -2.5e+2 0 L 0 10'), { x: -250, y: 0, width: 250, height: 10 })
  assert.deepEqual(graphPathBounds('M 0 0 L 1.5E2 2e0'), { x: 0, y: 0, width: 150, height: 2 })
  // Exponents inside multi-parameter commands, with no separators where the grammar allows none.
  assertContains('M0,0C1e1,2E1 3e+1-4e1 5e1.5e1', cubic([0, 0], [10, 20], [30, -40], [50, 5]))
  assert.deepEqual(graphPathBounds('M0,0C1e1,2E1 3e+1-4e1 5e1.5e1'), { x: 0, y: -40, width: 50, height: 60 })
  assertContains('M 0 0 Q 1e2 -1e2 2e2 0 T 4E2 0', quad([0, 0], [100, -100], [200, 0]), quad([200, 0], [300, 100], [400, 0]))
})

test('compact path numbers split at a second dot or a sign', () => {
  assert.deepEqual(graphPathBounds('M0.5.5L1-2'), { x: 0.5, y: -2, width: 0.5, height: 2.5 })
  assert.deepEqual(graphPathBounds('M.5-.5l-1.5.5'), { x: -1, y: -0.5, width: 1.5, height: 0.5 })
  assert.deepEqual(graphPathBounds('M 1. 2. L+3 +4'), { x: 1, y: 2, width: 2, height: 2 })
  assert.deepEqual(graphPathBounds('M1 2\tL\n3\r4\fZ'), { x: 1, y: 2, width: 2, height: 2 })
  // Arc flags are single digits and may run into the following number.
  assert.deepEqual(graphPathBounds('M 0 0 A 5 5 0 1010 10'), graphPathBounds('M 0 0 A 5 5 0 1 0 10 10'))
  assert.deepEqual(graphPathBounds('M0 0A5 5 0 1,0 10,10'), graphPathBounds('M 0 0 A 5 5 0 1 0 10 10'))
  assertContains('M 0 0 A 5 5 0 1010 10', arc([0, 0], 5, 5, 0, true, false, [10, 10]))
})

test('stray characters and malformed numbers in path data throw instead of being dropped', () => {
  for (const path of [
    'M 0 0 L 1 # 2', 'M 0 0 L 1 1;', 'M 0 0 L 1 1 -', 'M 0 0 L 1e 2', 'M 0 0 L 1e+ 2', 'M 0 0 L . 2', '1 2',
    'M', 'M 0 0 L', 'M 0 0 L 1', 'M 0 0 A 5 5 0 2 0 10 10', 'M 0 0 A 5 5 0 1 0 10', 'M 0 0 L 1e999 0',
    'M 0 0 L 1 1  ', 'M 0 0 L 1_000 1',
  ]) {
    assert.throws(() => graphPathBounds(path), /Invalid SVG path data/, path)
  }
  assert.throws(() => graphPathBounds('M 0 0 X 3 3'), /Unsupported SVG path command: X/)
  assert.throws(() => graphPathBounds('M 0 0 b 3 3'), /Unsupported SVG path command: b/)
})

test('T and t reflect the previous quadratic control point', () => {
  const smooth = [quad([0, 0], [50, 100], [100, 0]), quad([100, 0], [150, -100], [200, 0])]
  const bounds = assertContains('M 0 0 Q 50 100 100 0 T 200 0', ...smooth)
  assert.ok(bounds.y <= -50, 'the reflected curve reaches y = -50')
  assertContains('m 0 0 q 50 100 100 0 t 100 0', ...smooth)
  assertContains('M 0 0 q 50 100 100 0 T 200 0', ...smooth)
  // A chain of T segments keeps reflecting, including implicitly repeated argument groups.
  const chain = [quad([0, 0], [10, 20], [20, 0]), quad([20, 0], [30, -20], [40, 0]), quad([40, 0], [50, 20], [60, 0])]
  assertContains('M 0 0 Q 10 20 20 0 T 40 0 T 60 0', ...chain)
  assertContains('M 0 0 Q 10 20 20 0 T 40 0 60 0', ...chain)
  assertContains('M 0 0 Q 10 20 20 0 t 20 0 20 0', ...chain)
  assertContains('M 0 0 Q 10 20 20 0 T 40 0 Q 50 -30 60 0 T 80 0',
    chain[0], chain[1], quad([40, 0], [50, -30], [60, 0]), quad([60, 0], [70, 30], [80, 0]))
})

test('S and s reflect the previous cubic control point', () => {
  const smooth = [cubic([0, 0], [0, 50], [50, 50], [50, 0]), cubic([50, 0], [50, -50], [100, 0], [100, 0])]
  const bounds = assertContains('M 0 0 C 0 50 50 50 50 0 S 100 0 100 0', ...smooth)
  assert.ok(bounds.y < -20, 'the reflected curve dips below the axis')
  assertContains('m 0 0 c 0 50 50 50 50 0 s 50 0 50 0', ...smooth)
  const chain = [...smooth, cubic([100, 0], [100, 0], [150, 0], [150, 0])]
  assertContains('M 0 0 C 0 50 50 50 50 0 S 100 0 100 0 150 0 150 0', ...chain)
  assertContains('M 0 0 C 0 50 50 50 50 0 S 100 0 100 0 S 150 0 150 0', ...chain)
  assertContains('M 0 0 C 0 50 50 50 50 0 S 100 -80 100 0 s 0 0 50 0',
    smooth[0], cubic([50, 0], [50, -50], [100, -80], [100, 0]), cubic([100, 0], [100, 80], [100, 0], [150, 0]))
})

test('the implicit control point is the current point after a non-matching command', () => {
  assert.deepEqual(graphPathBounds('M 0 0 L 10 0 T 20 0'), { x: 0, y: 0, width: 20, height: 0 })
  assert.deepEqual(graphPathBounds('M 0 0 L 10 0 S 20 0 20 0'), { x: 0, y: 0, width: 20, height: 0 })
  // A line between the curves resets the reflection.
  assert.deepEqual(graphPathBounds('M 0 0 Q 5 10 10 0 L 20 0 T 30 0'), { x: 0, y: 0, width: 30, height: 10 })
  // S does not reflect a quadratic control point, and T does not reflect a cubic one.
  assert.deepEqual(graphPathBounds('M 0 0 Q 5 -10 10 0 S 20 0 20 0'), { x: 0, y: -10, width: 20, height: 10 })
  assert.deepEqual(graphPathBounds('M 0 0 C 0 -10 10 -10 10 0 T 20 0'), { x: 0, y: -10, width: 20, height: 10 })
  // Close path resets it too: T starts from the subpath start with no reflection.
  assert.deepEqual(graphPathBounds('M 0 0 Q 5 -10 10 0 Z T 20 0'), { x: 0, y: -10, width: 20, height: 10 })
  assert.deepEqual(graphPathBounds('M 0 0 Q 5 -10 10 0 M 10 0 T 20 0'), { x: 0, y: -10, width: 20, height: 10 })
  assertContains('M 0 0 Q 5 10 10 0 L 20 0 T 30 0', quad([0, 0], [5, 10], [10, 0]), line([10, 0], [20, 0]), line([20, 0], [30, 0]))
})

test('arc radii that are too small are scaled up to reach the end point', () => {
  const above = assertTight('M 0 0 A 1 1 0 0 1 100 0', arc([0, 0], 1, 1, 0, false, true, [100, 0]))
  assert.ok(Math.abs(above.y + 50) < 1e-9 && Math.abs(above.height - 50) < 1e-9, 'a half circle above the chord')
  const below = assertTight('M 0 0 A 1 1 0 0 0 100 0', arc([0, 0], 1, 1, 0, false, false, [100, 0]))
  assert.ok(Math.abs(below.y) < 1e-9 && Math.abs(below.height - 50) < 1e-9, 'a half circle below the chord')
  assertTight('M 0 0 A 3 1 0 1 1 100 40', arc([0, 0], 3, 1, 0, true, true, [100, 40]))
  assertTight('M 0 0 A 3 1 45 0 0 100 40', arc([0, 0], 3, 1, 45, false, false, [100, 40]))
  assertTight('M 0 0 a -1 -1 0 0 1 100 0', arc([0, 0], 1, 1, 0, false, true, [100, 0]))
})

test('arc bounds follow rotation and every large-arc and sweep flag combination', () => {
  for (const largeArc of [false, true]) {
    for (const sweep of [false, true]) {
      const flags = `${Number(largeArc)} ${Number(sweep)}`
      assertTight(`M 10 10 A 40 25 -20 ${flags} 60 30`, arc([10, 10], 40, 25, -20, largeArc, sweep, [60, 30]))
      assertTight(`M 0 0 A 60 20 30 ${flags} 80 40`, arc([0, 0], 60, 20, 30, largeArc, sweep, [80, 40]))
      assertTight(`m 10 10 a 40 25 110 ${flags} 50 -20`, arc([10, 10], 40, 25, 110, largeArc, sweep, [60, -10]))
      assertTight(`M 0 0 A 50 50 0 ${flags} 0 100`, arc([0, 0], 50, 50, 0, largeArc, sweep, [0, 100]))
      // A rotation past a full turn is the same ellipse.
      assert.deepEqual(
        graphPathBounds(`M 10 10 A 40 25 380 ${flags} 60 30`), graphPathBounds(`M 10 10 A 40 25 20 ${flags} 60 30`),
      )
    }
  }
  // Repeated arc argument groups chain from each end point.
  assertTight('M 0 0 A 10 10 0 0 1 20 0 10 10 0 0 1 40 0',
    arc([0, 0], 10, 10, 0, false, true, [20, 0]), arc([20, 0], 10, 10, 0, false, true, [40, 0]))
})

test('degenerate arcs are straight lines or nothing', () => {
  assert.deepEqual(graphPathBounds('M 0 0 A 0 10 0 0 1 10 10'), { x: 0, y: 0, width: 10, height: 10 })
  assert.deepEqual(graphPathBounds('M 0 0 A 10 0 45 1 1 10 10'), { x: 0, y: 0, width: 10, height: 10 })
  assert.deepEqual(graphPathBounds('M 5 5 A 10 10 0 1 1 5 5'), { x: 5, y: 5, width: 0, height: 0 })
})

test('culling and SVG export use bounds that contain smooth curves and exponent numbers', () => {
  const path = 'M 0 0 Q 50 100 100 0 T 200 0'
  const bounds = graphLayoutBounds({ boxes: new Map(), paths: new Map([['e', path]]), edgeLabels: new Map() })
  assert.ok(cullGraphElements(bounds, { x: 145, y: -55, width: 10, height: 10 }).edges.has('e'))
  assert.ok(!cullGraphElements(bounds, { x: 145, y: -200, width: 10, height: 10 }).edges.has('e'))

  const nodes = [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }, { id: 'c', label: 'C' }]
  const edges = [{ id: 'ab', from: 'a', to: 'b' }, { id: 'bc', from: 'b', to: 'c' }]
  const layout = layoutLayeredGraph(nodes, edges)
  const top = Math.min(...[...layout.boxes.values()].map(box => box.y))
  assert.ok(top >= 0)
  layout.paths.set('ab', 'M 1e-7 0 L 1E-7 10')
  layout.paths.set('bc', path)
  const svg = renderGraphSvg(layout, nodes, edges, { padding: 0 })
  const [, offsetX, offsetY] = /<g transform="translate\(([-\d.]+) ([-\d.]+)\)">/.exec(svg).map(Number)
  assert.ok(Number.isFinite(offsetX))
  // The content is shifted down so the T curve's lowest point, y = -50, is inside the exported extent.
  assert.ok(offsetY >= 50, 'the export covers negative y of the T curve, offset ' + offsetY)
  const height = Number(/^<svg[^>]* height="([\d.]+)"/.exec(svg)[1])
  assert.ok(height >= layout.height + 50)
})
