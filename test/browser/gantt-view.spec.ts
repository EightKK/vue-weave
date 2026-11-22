// GanttChart viewing: hierarchy, bands and markers, baselines, zoom and pinch, grid lines, tooltips, fitting, right-to-left layout, target events and reveal.
import { expect, test, fixtureStatus, openComponentFixture, openDemo, openGanttFixture, openGestureFixture, openLinkedGanttFixture, openTimelineEditing, pageErrors, serveFixture, touch, type LinkedFixture, type Page } from './support'

async function recordWheelDefaults(page: Page) {
  await page.evaluate(() => {
    const log: boolean[] = []
    ;(window as any).__wheelPrevented = log
    window.addEventListener('wheel', event => log.push(event.defaultPrevented))
  })
  return {
    count: () => page.evaluate(() => (window as any).__wheelPrevented.length as number),
    last: () => page.evaluate(() => (window as any).__wheelPrevented.at(-1) as boolean),
  }
}

test('direction, slots, milestones, theme and virtual rows', async ({ page }) => {
  await page.goto('/gallery.html')
  await page.getByLabel('Direction').selectOption('TB')
  await expect(page.locator('.vw-network-stage')).toHaveCSS('height', '470px')
  await page.getByLabel('Custom nodes').check()
  await expect(page.locator('.vw-network-node > rect')).toHaveCount(6)
  await page.getByLabel('Dark theme').check()
  await expect(page.locator('.demo')).toHaveClass(/dark/)
  await page.getByRole('button', { name: 'Project delivery', exact: true }).click()
  await expect(page.locator('.vw-gantt-bar.vw-is-milestone')).toHaveCount(1)
  await page.getByRole('button', { name: 'Release 15:00–15:00', exact: true }).press('ArrowRight')
  await expect(page.getByRole('button', { name: 'Release 15:15–15:15', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '1,000 resources', exact: true }).click()
  expect(await page.locator('.vw-gantt-row').count()).toBeLessThan(15)
  await page.getByRole('button', { name: 'Last resource', exact: true }).click()
  await expect(page.getByText('Resource 1000', { exact: true })).toBeVisible()
  expect(await page.locator('.vw-gantt-row').count()).toBeLessThan(15)
  await page.screenshot({ path: 'test-results/large-dark.png', fullPage: true })
})

test('hierarchy, header bands, baselines and markers compose with controlled edits', async ({ page }) => {
  await page.goto('/gallery.html')
  await page.getByLabel('Planning overlays').check()
  await expect(page.getByText('Operating window · UTC')).toBeVisible()
  await expect(page.getByText('Shift review', { exact: true })).toBeVisible()
  await expect(page.locator('.vw-gantt-row')).toHaveCount(3)
  await expect(page.locator('.vw-gantt-baseline')).toHaveCount(4)
  const baseline = page.locator('.vw-gantt-baseline').first()
  const original = await baseline.getAttribute('style')
  await page.getByRole('button', { name: 'Split · plan 09:00–11:00', exact: true }).press('ArrowRight')
  await expect(page.getByRole('button', { name: 'Split · plan 09:15–11:15', exact: true })).toBeVisible()
  await expect(baseline).toHaveAttribute('style', original!)
  await page.getByRole('button', { name: 'Collapse Production schedule' }).click()
  await expect(page.locator('.vw-gantt-row')).toHaveCount(1)
  await expect(page.locator('.vw-gantt-bar')).toHaveCount(0)
  await expect(page.locator('.vw-gantt-links')).toHaveCount(0)
  await page.getByRole('button', { name: 'Expand Production schedule' }).click()
  await expect(page.getByRole('button', { name: 'Split · plan 09:15–11:15', exact: true })).toBeVisible()
})

test('gantt baseline sets follow baselineIds, mirror in right-to-left charts and feed a tooltip variance', async ({ page }) => {
  const errors = pageErrors(page)
  for (const rtl of [false, true]) {
    const { chart } = await openGanttFixture(page, '?baselines=1&interactions=1&sets=rev1,plan' + (rtl ? '&rtl=1' : ''))
    const task = chart.getByRole('button', { name: 'Task A 0–2', exact: true })
    await expect(task).toHaveAccessibleDescription(/^rev1 1–3: start -1 u, finish -1 u, duration 0 u\. plan 0–2: start 0 u, finish 0 u, duration 0 u\. /)
    const rev1 = chart.locator('[data-vw-baseline="rev1"]').first()
    const plan = chart.locator('[data-vw-baseline="plan"]').first()
    await expect(rev1).toHaveClass(/vw-gantt-baseline-1/)
    await expect(plan).toHaveClass(/vw-gantt-baseline-2/)
    const [bar, first, second] = [(await task.boundingBox())!, (await rev1.boundingBox())!, (await plan.boundingBox())!]
    // rev1 (1–3) is half a bar later than the bar (0–2); plan matches the bar. In RTL later times are further left.
    expect(second.x).toBeCloseTo(bar.x, 0)
    expect(second.width).toBeCloseTo(bar.width, 0)
    expect(first.x - bar.x).toBeCloseTo(rtl ? -bar.width / 2 : bar.width / 2, 0)
    expect(first.y).toBeGreaterThanOrEqual(bar.y + bar.height)
    expect(second.y).toBeGreaterThanOrEqual(first.y + first.height)
    // The tooltip slot computes the variance with baselineVariance.
    await task.hover()
    await expect(page.getByRole('tooltip')).toHaveText('Task A from 0 to 2 · plan start 0, finish 0, duration 0')
    await page.mouse.move(0, 0)
    await expect(page.getByRole('tooltip')).toHaveCount(0)
    await chart.getByRole('button', { name: 'Task B 4–6', exact: true }).hover()
    await expect(page.getByRole('tooltip')).toHaveText('Task B from 4 to 6 · plan start 1, finish 2, duration 1')
    // The export draws the strips at the same mirrored positions.
    const svg: string = await page.evaluate(() => (window as any).ganttChart.value.exportSvg())
    expect(svg.match(/<g class="vw-gantt-baseline vw-gantt-baseline-\d">/g)).toHaveLength(4)
    expect(svg).toContain('<title>rev1 · Task A 1–3 · start -1 u, finish -1 u, duration 0 u</title>')
  }
  // A selection that changes the bar height during a drag cancels the drag, like other coordinate changes.
  const { chart, out } = await openGanttFixture(page, '?baselines=1&sets=plan,rev1')
  const task = chart.getByRole('button', { name: 'Task A 0–2', exact: true })
  const box = (await task.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + 100, box.y + box.height / 2, { steps: 5 })
  await page.getByRole('button', { name: 'Show only the plan baseline', exact: true }).dispatchEvent('click')
  await page.mouse.up()
  await expect(chart.locator('[data-vw-baseline="rev1"]')).toHaveCount(0)
  expect((await task.boundingBox())!.height).toBeCloseTo(box.height + 3, 0)
  await expect(out('Last edit')).toHaveText('')
  expect(errors).toEqual([])
})

test('gantt lag labels stay above a now line that crosses them', async ({ page }) => {
  const errors = pageErrors(page)
  for (const rtl of [false, true]) {
    // The label "+2 u" starts 4 px after time 3 (x 150); a now line at 3.3 (x 165) runs through its text.
    const { chart } = await openGanttFixture(page, '?lag=1&now=3.3' + (rtl ? '&rtl=1' : ''))
    const label = chart.locator('.vw-gantt-lag')
    const now = chart.locator('.vw-gantt-now')
    const [text, line] = [(await label.boundingBox())!, (await now.boundingBox())!]
    const lineX = rtl ? line.x + line.width - 1 : line.x + 1
    expect(lineX).toBeGreaterThan(text.x)
    expect(lineX).toBeLessThan(text.x + text.width)
    // Make both hit-testable to probe the stacking order where they cross: the label is on top.
    await page.addStyleTag({ content: '.vw-gantt-lag-layer, .vw-gantt-lag-layer *, .vw-gantt-now { pointer-events: auto !important; }' })
    const top = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.getAttribute('class'), { x: lineX, y: text.y + text.height / 2 })
    // The glyph itself, or its layer between two glyphs; never the now line.
    expect(top).toMatch(/^vw-gantt-lag(?:-layer)?$/)
    // The now line itself is still above the bars and below nothing else it was below before.
    expect(await now.evaluate(element => getComputedStyle(element).zIndex)).toBe('3')
  }
  expect(errors).toEqual([])
})

test('gantt zoom presets, now marker and resource load histogram share the time axis', async ({ page }) => {
  const { errors, chart, status } = await openTimelineEditing(page)
  const presets = page.getByRole('group', { name: 'Zoom level', exact: true })
  await expect(presets.getByRole('button', { name: 'Hours', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(chart.getByText('Day 2026-11-09', { exact: true })).toBeVisible()
  await expect(chart.locator('.vw-gantt-now')).toHaveText('Now')
  await expect(chart.locator('.vw-gantt-now')).toHaveAttribute('title', 'Now 11:30')
  await expect(chart.getByRole('group', { name: 'Resource load Engineering pool', exact: true })).toBeVisible()
  const overload = chart.getByRole('img', { name: 'Engineering pool 10:00–13:00: load 2 / capacity 1, overloaded by 1', exact: true })
  await expect(overload).toBeVisible()
  await expect(chart.locator('.vw-gantt-load-segment.vw-is-overloaded')).toHaveCount(1)
  const bar = (await chart.getByRole('button', { name: 'Billing API 10:00–13:00', exact: true }).boundingBox())!
  const segment = (await overload.boundingBox())!
  expect(Math.abs(segment.x - bar.x)).toBeLessThanOrEqual(1)

  // Moving work updates the histogram.
  const checkout = chart.locator('.vw-gantt-bar[aria-label^="Checkout UI"]')
  await checkout.click()
  for (let i = 0; i < 12; i++) await checkout.press('ArrowRight')
  await expect(checkout).toHaveAttribute('aria-label', 'Checkout UI 13:00–17:00')
  await expect(chart.locator('.vw-gantt-load-segment.vw-is-overloaded')).toHaveCount(1)
  await expect(chart.getByRole('img', { name: 'Engineering pool 14:00–16:00: load 2 / capacity 1, overloaded by 1', exact: true })).toBeAttached()

  await presets.getByRole('button', { name: 'Shifts', exact: true }).click()
  await expect(presets.getByRole('button', { name: 'Shifts', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(chart.getByText('Shift from 08:00', { exact: true })).toBeVisible()
  await expect(status('100% · shifts')).toBeVisible()
  const zoomIn = page.getByRole('group', { name: 'Timeline zoom', exact: true }).getByRole('button', { name: 'Zoom in', exact: true })
  await zoomIn.click()
  await expect(status('135% · shifts')).toBeVisible()
  await presets.getByRole('button', { name: 'Hours', exact: true }).click()
  await expect(status('100% · hours')).toBeVisible()
  expect(errors).toEqual([])
})

test('gantt two-pointer touch pinch zooms the time axis', async ({ page }) => {
  const { errors, chart, status } = await openTimelineEditing(page)
  const output = page.getByRole('group', { name: 'Timeline zoom', exact: true }).locator('output')
  await expect(output).toHaveText('100%')
  await chart.evaluate(element => {
    const rect = element.getBoundingClientRect()
    const x = rect.left + rect.width / 2, y = rect.top + 200
    const fire = (type: string, pointerId: number, clientX: number) => element.dispatchEvent(new PointerEvent(type, {
      pointerId, pointerType: 'touch', isPrimary: pointerId === 11, clientX, clientY: y, bubbles: true, cancelable: true,
    }))
    fire('pointerdown', 11, x - 50)
    fire('pointerdown', 12, x + 50)
    for (let step = 1; step <= 5; step++) {
      fire('pointermove', 11, x - 50 - step * 10)
      fire('pointermove', 12, x + 50 + step * 10)
    }
    fire('pointerup', 11, x - 100)
    fire('pointerup', 12, x + 100)
  })
  await expect(output).toHaveText('200%')
  await expect(status('200% · hours')).toBeVisible()
  // A single touch pointer does not zoom.
  await chart.evaluate(element => {
    const rect = element.getBoundingClientRect()
    const fire = (type: string, clientX: number) => element.dispatchEvent(new PointerEvent(type, {
      pointerId: 21, pointerType: 'touch', isPrimary: true, clientX, clientY: rect.top + 200, bubbles: true, cancelable: true,
    }))
    fire('pointerdown', rect.left + 300)
    fire('pointermove', rect.left + 500)
    fire('pointerup', rect.left + 500)
  })
  await expect(output).toHaveText('200%')
  expect(errors).toEqual([])
})

test('gantt grid lines follow every tick of a piecewise scale in both directions and through zoom', async ({ page }) => {
  const errors = pageErrors(page)
  for (const search of ['?piecewise=1', '?piecewise=1&rtl=1']) {
    const rtl = search.includes('rtl')
    const { chart } = await openGanttFixture(page, search)
    // The inline-start edge of each element: left in left-to-right charts, right in right-to-left ones.
    const edges = (selector: string) => chart.locator(selector).evaluateAll((elements, mirrored) => elements
      .map(element => element.getBoundingClientRect())
      .map(rect => Math.round(mirrored ? rect.right : rect.left)), rtl)
    for (const zoom of ['100%', '135%']) {
      if (zoom !== '100%') await page.getByRole('button', { name: 'Zoom in', exact: true }).click()
      await expect(page.getByRole('group', { name: 'Timeline zoom', exact: true }).getByText(zoom, { exact: true })).toBeVisible()
      // Labels 0..40 start at their tick; from 50 on the ticks are too close for a label, so those labels (and the
      // closing one at 100) are left out while their lines stay.
      const labels = (await edges('.vw-gantt-tick'))
      const grid = await edges('.vw-gantt-grid-line')
      const head = await edges('.vw-gantt-tick-line')
      expect(labels).toHaveLength(5)
      expect(grid).toHaveLength(11)
      expect(grid.slice(0, 5)).toEqual(labels)
      expect(head).toEqual(grid)
      // The compressed half keeps a line for every tick: 50..90 are 10 units apart but only 1 px per unit.
      const gaps = grid.slice(6).map((x, i) => Math.abs(x - grid[i + 5]!))
      expect(gaps.every(gap => gap > 0 && gap < 20)).toBe(true)
    }
  }
  expect(errors).toEqual([])
})

test('gantt zoom presets ignore the active preset and a controlled parent that declines a change', async ({ page }) => {
  const errors = pageErrors(page)
  for (const search of ['', '?controlled=1']) {
    const { chart } = await openGanttFixture(page, search)
    const zoom = page.getByRole('group', { name: 'Timeline zoom', exact: true }).locator('output')
    const presets = page.getByRole('group', { name: 'Zoom level', exact: true })
    if (!search) await presets.getByRole('button', { name: 'Wide', exact: true }).click()
    await page.getByRole('button', { name: 'Zoom in', exact: true }).click()
    await expect(zoom).toHaveText('135%')
    const scroller = chart
    await scroller.evaluate(el => { el.scrollLeft = 1500 })
    // The active preset is a no-op: zoom and scroll stay.
    await presets.getByRole('button', { name: 'Wide', exact: true }).click()
    await expect(zoom).toHaveText('135%')
    expect(await scroller.evaluate(el => el.scrollLeft)).toBe(1500)
    if (search) {
      // A parent that ignores the update keeps the zoom, and its stale centre is not applied to a later change.
      await presets.getByRole('button', { name: 'Narrow', exact: true }).click()
      await expect(zoom).toHaveText('135%')
      await expect(presets.getByRole('button', { name: 'Wide', exact: true })).toHaveAttribute('aria-pressed', 'true')
      await scroller.evaluate(el => { el.scrollLeft = 1500 })
      await page.getByRole('button', { name: 'Parent switches to Narrow', exact: true }).click()
      await expect(presets.getByRole('button', { name: 'Narrow', exact: true })).toHaveAttribute('aria-pressed', 'true')
      expect(await scroller.evaluate(el => el.scrollLeft)).toBe(1500)
      await expect(zoom).toHaveText('135%')
    } else {
      // A real change resets the zoom and keeps the centre.
      const centreAt = (el: HTMLElement, scale: number) =>
        (el.scrollLeft + (el.clientWidth - el.querySelector('.vw-gantt-corner')!.getBoundingClientRect().width) / 2) / scale
      const centre = await scroller.evaluate(centreAt, 1.35 * 50)
      await presets.getByRole('button', { name: 'Narrow', exact: true }).click()
      await expect(zoom).toHaveText('100%')
      await expect.poll(() => scroller.evaluate(centreAt, 25)).toBeCloseTo(centre, -1)
    }
  }
  expect(errors).toEqual([])
})

test('gantt real two-finger touch pinch survives a drifting midpoint without native panning', async ({ page }) => {
  const { errors, chart } = await openTimelineEditing(page)
  const cdp = await page.context().newCDPSession(page)
  const output = page.getByRole('group', { name: 'Timeline zoom', exact: true }).locator('output')
  // Zoom in first so the scroller can pan, then pinch on empty row background where touch-action is pan-x pan-y.
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click()
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click()
  await expect(output).toHaveText('182%')
  const spot = await chart.evaluate(el => {
    const r = el.getBoundingClientRect()
    for (const y of [150, 200, 250, 300]) for (let x = 400; x < r.width - 200; x += 10) {
      const free = [x - 100, x + 100].every(px => /^vw-gantt-(row|grid)/.test(String(document.elementFromPoint(r.left + px, r.top + y)?.className ?? '')))
      if (free) return { x: r.left + x, y: r.top + y }
    }
    return undefined
  })
  expect(spot).toBeDefined()
  await chart.evaluate(el => {
    const log = { cancels: 0, twoFingerMoves: 0, prevented: 0, singleMoves: 0, singlePrevented: 0 }
    el.addEventListener('pointercancel', () => { log.cancels++ })
    // Registered after the component's own listener, so it sees the final defaultPrevented state.
    el.addEventListener('touchmove', event => {
      if (event.touches.length >= 2) { log.twoFingerMoves++; if (event.defaultPrevented) log.prevented++ }
      else { log.singleMoves++; if (event.defaultPrevented) log.singlePrevented++ }
    }, { passive: true })
    ;(window as any).__pinchLog = log
  })
  const { x: cx, y: cy } = spot!
  await touch(cdp, 'touchStart', [{ x: cx - 40, y: cy, id: 1 }, { x: cx + 40, y: cy, id: 2 }])
  // The midpoint drifts down and sideways while the fingers spread, as a real pinch does.
  for (let step = 1; step <= 12; step++) {
    await touch(cdp, 'touchMove', [{ x: cx - 40 + step * 4, y: cy + step * 5, id: 1 }, { x: cx + 40 + step * 16, y: cy + step * 5, id: 2 }])
  }
  await touch(cdp, 'touchEnd', [])
  await expect.poll(async () => Number.parseInt((await output.textContent())!, 10)).toBeGreaterThan(182)
  const log = await page.evaluate(() => (window as any).__pinchLog)
  expect(log.cancels).toBe(0)
  expect(log.twoFingerMoves).toBeGreaterThan(0)
  expect(log.prevented).toBe(log.twoFingerMoves)
  // One finger still scrolls natively.
  const scrollBefore = await chart.evaluate(el => el.scrollLeft)
  await touch(cdp, 'touchStart', [{ x: cx, y: cy, id: 1 }])
  await touch(cdp, 'touchMove', [{ x: cx - 80, y: cy, id: 1 }])
  await touch(cdp, 'touchMove', [{ x: cx - 160, y: cy, id: 1 }])
  await touch(cdp, 'touchEnd', [])
  await expect.poll(() => chart.evaluate(el => el.scrollLeft)).not.toBe(scrollBefore)
  expect((await page.evaluate(() => (window as any).__pinchLog)).singlePrevented).toBe(0)
  expect(errors).toEqual([])
})

test('gantt tooltip appears after the hover delay or at once on keyboard focus, stays hoverable and hides on Escape', async ({ page }) => {
  // Fake timers (still ticking in real time) let the grace and hover delays be advanced explicitly instead of slept through.
  await page.clock.install()
  const { errors, chart } = await openTimelineEditing(page)
  const api = chart.getByRole('button', { name: 'Billing API 10:00–13:00', exact: true })
  const tooltip = page.getByRole('tooltip')
  const region = (await chart.boundingBox())!
  const away = () => page.mouse.move(region.x + 4, region.y + region.height - 4)
  await expect(tooltip).toHaveCount(0)
  await api.hover()
  await expect(tooltip).toHaveText('Billing API10:00–13:00 · 30% complete')
  const id = (await tooltip.getAttribute('id'))!.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  // The tooltip is described after the existing hints and stays inside the chart viewport.
  await expect(api).toHaveAttribute('aria-describedby', new RegExp(`-hint \\S+-row-hint \\S+-delete-hint ${id}$`))
  const tip = (await tooltip.boundingBox())!
  expect(tip.x).toBeGreaterThanOrEqual(region.x)
  expect(tip.y).toBeGreaterThanOrEqual(region.y)
  expect(tip.x + tip.width).toBeLessThanOrEqual(region.x + region.width)

  // The pointer can move onto the tooltip without hiding it; Escape dismisses it.
  await page.mouse.move(tip.x + tip.width / 2, tip.y + tip.height / 2, { steps: 4 })
  await page.clock.runFor(300)
  await expect(tooltip).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(tooltip).toHaveCount(0)
  await expect(api).not.toHaveAttribute('aria-describedby', /tooltip/)

  // Pressing a bar hides the tooltip, and none appears during the drag.
  await away()
  await api.hover()
  await expect(tooltip).toBeVisible()
  const box = (await api.boundingBox())!
  await page.mouse.down()
  await expect(tooltip).toHaveCount(0)
  await page.mouse.move(box.x + box.width / 2 + 58, box.y + box.height / 2, { steps: 6 })
  await page.clock.runFor(500)
  await expect(tooltip).toHaveCount(0)
  await page.keyboard.press('Escape')
  await page.mouse.up()

  // Keyboard focus shows the tooltip without the delay; Escape hides it and keeps focus.
  await away()
  await chart.getByRole('button', { name: 'Start dependency from start of Billing API', exact: true }).focus()
  await page.keyboard.press('Shift+Tab')
  await expect(api).toBeFocused()
  await expect(tooltip).toBeVisible({ timeout: 250 })
  await expect(tooltip).toContainText('Billing API')
  await page.keyboard.press('Escape')
  await expect(tooltip).toHaveCount(0)
  await expect(api).toBeFocused()
  expect(errors).toEqual([])
})

test('gantt fit all bars and fit selection zoom to the bars and scroll them into view', async ({ page }) => {
  const { errors, chart, status } = await openTimelineEditing(page)
  const output = page.getByRole('group', { name: 'Timeline zoom', exact: true }).locator('output')
  const fitSelection = page.getByRole('button', { name: 'Fit selection', exact: true })
  await expect(output).toHaveText('100%')
  await expect(fitSelection).toBeDisabled()
  const area = await chart.evaluate(el => {
    const corner = el.querySelector('.vw-gantt-corner')!.getBoundingClientRect()
    const rect = el.getBoundingClientRect()
    return { left: corner.right, right: rect.left + el.clientLeft + el.clientWidth }
  })
  const width = area.right - area.left

  // All bars span 08:00–16:00 (920 px at 100%); the zoom leaves 24 px on each side.
  await page.getByRole('button', { name: 'Fit all bars', exact: true }).click()
  const all = Math.round(Math.min(3, Math.max(0.65, (width - 48) / 920)) * 100) + '%'
  await expect(output).toHaveText(all)
  await expect(status(all + ' · hours')).toBeVisible()
  // Wireframes starts at the start of the range, so scrolling stops there and the spare 48 px end up on the right.
  const first = (await chart.getByRole('button', { name: /^Wireframes / }).boundingBox())!
  const last = (await chart.getByRole('button', { name: /^Acceptance tests / }).boundingBox())!
  expect(Math.abs(first.x - area.left)).toBeLessThanOrEqual(1)
  expect(Math.abs(area.right - (last.x + last.width) - 48)).toBeLessThanOrEqual(1.5)

  // Three hours need more than the 300% limit, so the selection is centred at the maximum zoom.
  const api = chart.getByRole('button', { name: /^Billing API / })
  await api.click()
  await fitSelection.click()
  await expect(output).toHaveText('300%')
  await expect(status('Fitted Billing API into view.')).toBeVisible()
  const box = (await api.boundingBox())!
  expect(Math.abs(box.x + box.width / 2 - (area.left + area.right) / 2)).toBeLessThanOrEqual(1.5)
  expect(errors).toEqual([])
})

test('right-to-left gantt mirrors layout, pointer drag, resize, keyboard moves and scrollToTime', async ({ page }) => {
  const { errors, chart, status } = await openTimelineEditing(page)
  await page.getByRole('checkbox', { name: 'Right-to-left timeline', exact: true }).check()
  await expect(chart.locator('xpath=ancestor::div[contains(@class, "vw-gantt")][1]')).toHaveAttribute('dir', 'rtl')
  const api = chart.locator('.vw-gantt-bar[aria-label^="Billing API"]')
  const corner = chart.locator('.vw-gantt-corner')
  const box = async (locator: typeof api) => (await locator.boundingBox())!
  // The heading column is on the right and time runs from right to left: 08:00 touches the headings,
  // and Billing API (from 10:00) starts where Wireframes (until 10:00) ends.
  const heading = await box(corner)
  const wireframes = await box(chart.getByRole('button', { name: 'Wireframes 08:00–10:00', exact: true }))
  let bar = await box(api)
  expect(heading.x).toBeGreaterThan(bar.x)
  expect(Math.abs(wireframes.x + wireframes.width - heading.x)).toBeLessThanOrEqual(1)
  expect(Math.abs(bar.x + bar.width - wireframes.x)).toBeLessThanOrEqual(1)
  expect(await chart.evaluate(element => element.scrollLeft)).toBeLessThanOrEqual(0)

  // Dragging to the left proposes a later interval: 58 px at 115 px per hour snaps to 30 minutes.
  await page.mouse.move(bar.x + bar.width / 2, bar.y + bar.height / 2)
  await page.mouse.down()
  await page.mouse.move(bar.x + bar.width / 2 - 58, bar.y + bar.height / 2, { steps: 6 })
  await page.mouse.up()
  await expect(status('Billing API → 10:30–13:30.')).toBeVisible()
  await expect(api).toHaveAttribute('aria-label', 'Billing API 10:30–13:30')

  // The start handle sits on the right edge; dragging it 29 px to the left moves the start 15 minutes later.
  const startHandle = await box(api.locator('.vw-bar-handle.vw-is-first'))
  bar = await box(api)
  expect(startHandle.x + startHandle.width).toBeGreaterThan(bar.x + bar.width - 2)
  await page.mouse.move(startHandle.x + startHandle.width / 2, startHandle.y + startHandle.height / 2)
  await page.mouse.down()
  await page.mouse.move(startHandle.x + startHandle.width / 2 - 29, startHandle.y + startHandle.height / 2, { steps: 5 })
  await page.mouse.up()
  await expect(status('Billing API → 10:45–13:30.')).toBeVisible()

  // Arrow keys follow the visual direction: Left is later, Right is earlier; Shift still resizes the end.
  await api.focus()
  await api.press('ArrowLeft')
  await expect(status('Billing API → 11:00–13:45.')).toBeVisible()
  await expect(api).toBeFocused()
  await api.press('ArrowRight')
  await expect(status('Billing API → 10:45–13:30.')).toBeVisible()
  await api.press('Shift+ArrowLeft')
  await expect(status('Billing API → 10:45–13:45.')).toBeVisible()

  // scrollToTime puts 12:00 at the inline-start (right) edge of the time area, using a negative scrollLeft.
  const zoomIn = page.getByRole('group', { name: 'Timeline zoom', exact: true }).getByRole('button', { name: 'Zoom in', exact: true })
  await zoomIn.click()
  await zoomIn.click()
  await expect(status('182% · hours')).toBeVisible()
  await page.getByRole('button', { name: 'Scroll to 12:00', exact: true }).click()
  await expect.poll(() => chart.evaluate(element => element.scrollLeft)).toBeLessThan(-800)
  const tests = chart.getByRole('button', { name: 'Acceptance tests 14:00–16:00', exact: true })
  const pixelsPerHour = 115 * 1.35 * 1.35
  await expect.poll(async () => {
    const [edge, target] = [await box(corner), await box(tests)]
    return Math.abs(target.x + target.width - (edge.x - 2 * pixelsPerHour))
  }).toBeLessThanOrEqual(1.5)

  // Back to left-to-right: the headings return to the left and 12:00 stays at the inline-start edge.
  await page.getByRole('checkbox', { name: 'Right-to-left timeline', exact: true }).uncheck()
  await expect.poll(async () => {
    const [edge, target] = [await box(corner), await box(tests)]
    return Math.abs(target.x - (edge.x + edge.width + 2 * pixelsPerHour))
  }).toBeLessThanOrEqual(1.5)
  expect(await chart.evaluate(element => element.scrollLeft)).toBeGreaterThan(800)
  expect(errors).toEqual([])
})

test('invalid markers, columns and header bands report validation-error and render the empty state', async ({ page }) => {
  const errors = pageErrors(page)
  await openComponentFixture(page)
  const timeline = page.getByRole('region', { name: 'Timeline fixture', exact: true })
  const bar = timeline.getByRole('button', { name: 'Editable bar 1–3', exact: true })
  const reports = timeline.getByRole('status', { name: 'Validation reports' })
  const empty = timeline.getByText('No rows to display', { exact: true })
  await expect(bar).toBeVisible()
  const expected: string[] = []
  for (const [control, message] of [
    ['Duplicate markers', 'Duplicate marker ID: m'],
    ['Invalid column width', 'Invalid timeline column width: c'],
    ['Overlapping header bands', 'Timeline bands must be finite, ordered and nonoverlapping'],
  ] as const) {
    await timeline.getByRole('button', { name: control, exact: true }).click()
    expected.push(message)
    await expect(reports).toHaveText(expected.join('; '))
    await expect(empty).toBeVisible()
    await expect(bar).toHaveCount(0)
    await timeline.getByRole('button', { name: 'Restore display', exact: true }).click()
    await expect(bar).toBeVisible()
    await expect(empty).toHaveCount(0)
  }
  expect(errors).toEqual([])
})

test('a chart that mounts with invalid data measures its label column once the data is valid', async ({ page }) => {
  const errors = pageErrors(page)
  const { control } = await openGestureFixture(page, '?chart=gantt&invalid=1')
  await expect(fixtureStatus(page, 'Validation reports')).not.toHaveText('')
  await control('Restore rows').click()
  await expect(page.getByRole('button', { name: 'Task A 2–6', exact: true })).toBeVisible()
  // A narrow label column widens the visible time area, so the bar near the inline-end edge is rendered.
  await control('Narrow labels').click()
  await expect(page.getByRole('button', { name: 'Edge bar 54–57', exact: true })).toBeVisible()
  expect(errors).toEqual([])
})

test('gantt Ctrl+wheel zooms around the pointer in both directions while a plain wheel still scrolls', async ({ page }) => {
  const errors = pageErrors(page)
  for (const rtl of [false, true]) {
    const { chart, out } = await openGanttFixture(page, '?wheel=1' + (rtl ? '&rtl=1' : ''))
    const wheelLog = await recordWheelDefaults(page)
    const zoom = page.getByRole('group', { name: 'Timeline zoom', exact: true }).locator('output')
    const taskB = chart.getByRole('button', { name: 'Task B 4–6', exact: true })
    await expect(zoom).toHaveText('100%')
    // The pointer rests 10 px after the start of Task B (time 4.2 at 50 px per unit).
    const box = (await taskB.boundingBox())!
    const x = rtl ? box.x + box.width - 10 : box.x + 10
    const y = box.y + box.height / 2
    const fromStart = async () => {
      const current = (await taskB.boundingBox())!
      return rtl ? current.x + current.width - x : x - current.x
    }
    const wheel = async (key: string, deltaY: number, times = 1) => {
      await page.keyboard.down(key)
      for (let i = 0; i < times; i++) await page.mouse.wheel(0, deltaY)
      await page.keyboard.up(key)
    }
    await page.mouse.move(x, y)

    // One wheel notch is one zoom button step, and the time under the pointer stays under it within a pixel.
    await wheel('Control', -100)
    await expect(zoom).toHaveText('135%')
    await expect.poll(async () => Math.abs(await fromStart() - 13.5)).toBeLessThanOrEqual(1)
    expect(await wheelLog.last()).toBe(true)
    await expect(out('Zoom events')).toContainText('1.35/')
    await wheel('Meta', 100)
    await expect(zoom).toHaveText('100%')
    await expect.poll(async () => Math.abs(await fromStart() - 10)).toBeLessThanOrEqual(1)
    // Trackpad pinches arrive as many small Ctrl+wheel deltas and zoom proportionally.
    await wheel('Control', -10, 5)
    await expect(zoom).toHaveText('116%')
    await expect.poll(async () => Math.abs(await fromStart() - 11.62)).toBeLessThanOrEqual(1)
    // The limits clamp the zoom.
    await wheel('Control', -100, 6)
    await expect(zoom).toHaveText('300%')

    // A plain wheel scrolls natively (towards later times, which lie to the left in right-to-left charts) and is not prevented.
    const scrolled = () => chart.evaluate(element => Math.abs(element.scrollLeft))
    const before = await scrolled()
    await page.mouse.wheel(rtl ? -400 : 400, 0)
    await expect.poll(scrolled).toBeGreaterThan(before)
    expect(await wheelLog.last()).toBe(false)
    await expect(zoom).toHaveText('300%')

    // Like a pinch, a wheel zoom during a drag cancels the drag without a proposal.
    const taskA = chart.getByRole('button', { name: 'Task A 0–2', exact: true })
    await chart.evaluate(element => { element.scrollLeft = 0 })
    const a = (await taskA.boundingBox())!
    await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2)
    await page.mouse.down()
    await page.mouse.move(a.x + a.width / 2 + (rtl ? -60 : 60), a.y + a.height / 2, { steps: 4 })
    await expect(taskA).toHaveClass(/\bvw-is-dragging\b/)
    await wheel('Control', 100)
    await expect(zoom).toHaveText('222%')
    await expect(taskA).not.toHaveClass(/\bvw-is-dragging\b/)
    await page.mouse.up()
    await expect(out('Last edit')).toHaveText('')
  }
  expect(errors).toEqual([])
})

test('gantt Ctrl+wheel does nothing without wheelZoom', async ({ page }) => {
  const errors = pageErrors(page)
  const { chart, out } = await openGanttFixture(page, '')
  const wheelLog = await recordWheelDefaults(page)
  const zoom = page.getByRole('group', { name: 'Timeline zoom', exact: true }).locator('output')
  const box = (await chart.getByRole('button', { name: 'Task B 4–6', exact: true }).boundingBox())!
  await page.mouse.move(box.x + 10, box.y + box.height / 2)
  await page.keyboard.down('Control')
  await page.mouse.wheel(0, -100)
  await page.keyboard.up('Control')
  await expect.poll(wheelLog.count).toBe(1)
  expect(await wheelLog.last()).toBe(false)
  await expect(zoom).toHaveText('100%')
  await expect(out('Zoom events')).toHaveText('')
  expect(errors).toEqual([])
})

test('gantt highlighted bars are display-only: not deleted with the selection and no gesture cancel', async ({ page }) => {
  const errors = pageErrors(page)
  const { chart, out, json } = await openLinkedGanttFixture(page)
  const taskA = chart.getByRole('button', { name: 'Task A 2–6', exact: true })
  const taskB = chart.getByRole('button', { name: 'Task B 8–12', exact: true })
  await expect(taskB).toHaveClass(/\bvw-is-highlighted\b/)
  await expect(taskB).toHaveAttribute('aria-pressed', 'false')
  await expect(taskA).toHaveAttribute('aria-pressed', 'true')
  await taskA.press('Delete')
  await expect.poll(() => json('Last delete')).toEqual(['a'])

  // Changing the highlight during a drag neither cancels it nor moves the highlighted bar.
  const box = (await taskA.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2, { steps: 4 })
  await page.evaluate(() => (window as unknown as { linkedFixture: LinkedFixture }).linkedFixture.highlight(['a', 'b']))
  // The accessible name follows the drag preview, so the dragged bar is found by its ID here.
  const dragged = chart.locator('[data-vw-bar="a"]')
  await expect(dragged).toHaveClass(/\bvw-is-highlighted\b/)
  await expect(dragged).toHaveClass(/\bvw-is-dragging\b/)
  await page.mouse.up()
  await expect.poll(() => json('Last edit')).toMatchObject({ id: 'a', before: { start: 2, end: 6 }, after: { start: 4, end: 8 }, mode: 'move' })
  await expect(out('Cancels')).toHaveText('0')
  expect(errors).toEqual([])
})

test('gantt bars and selectable load segments report target events by pointer and keyboard', async ({ page }) => {
  const errors = pageErrors(page)
  const { chart, json } = await openLinkedGanttFixture(page)
  await chart.getByRole('button', { name: 'Task B 8–12', exact: true }).hover()
  await expect.poll(() => json('Last target enter')).toEqual({ target: { view: 'timeline', kind: 'bar', id: 'b' }, source: 'pointer' })
  // Park the pointer outside the chart: keyboard focus scrolls the chart, and content moving under a resting pointer
  // would report pointer entries in between the keyboard ones.
  await page.mouse.move(0, 0)

  const segment = chart.getByRole('button', { name: 'Developers 2–6: load 2 / capacity 1, overloaded by 1', exact: true })
  await segment.focus()
  await page.keyboard.press('Shift+Tab')
  await page.keyboard.press('Tab')
  await expect(segment).toBeFocused()
  await expect.poll(() => json('Last target enter')).toEqual({ target: { view: 'load', resourceId: 'dev', start: 2, end: 6 }, source: 'keyboard' })
  await page.keyboard.press('Enter')
  await expect.poll(() => json('Last target activate')).toEqual({ target: { view: 'load', resourceId: 'dev', start: 2, end: 6 }, source: 'keyboard' })
  await page.keyboard.press('Tab')
  await expect.poll(() => json('Last target leave')).toEqual({ target: { view: 'load', resourceId: 'dev', start: 2, end: 6 }, source: 'keyboard' })
  await expect.poll(() => json('Last target enter')).toMatchObject({ target: { view: 'load', start: 6, end: 12 }, source: 'keyboard' })

  // Focusing the load rows scrolled the task rows out of the window; scroll back to the top.
  await chart.evaluate(element => { element.scrollTop = 0 })
  await chart.getByRole('button', { name: 'Task B 8–12', exact: true }).click()
  await expect.poll(() => json('Last target activate')).toEqual({ target: { view: 'timeline', kind: 'bar', id: 'b' }, source: 'pointer' })
  expect(errors).toEqual([])
})

test('gantt row headings activate rows from the keyboard through one roving tab stop', async ({ page }) => {
  const errors = pageErrors(page)
  const { chart, json } = await openLinkedGanttFixture(page)
  await page.mouse.move(0, 0)
  const heading = (name: string) => chart.getByRole('button', { name, exact: true })
  await expect(heading('Row 1')).toHaveAttribute('tabindex', '0')
  await expect(heading('Row 2')).toHaveAttribute('tabindex', '-1')

  // Keyboard focus reaches the heading column once, through the first heading.
  await heading('Row 1').focus()
  await page.keyboard.press('Shift+Tab')
  await page.keyboard.press('Tab')
  await expect(heading('Row 1')).toBeFocused()
  await expect.poll(() => json('Last target enter')).toEqual({ target: { view: 'timeline', kind: 'row', id: 'r1' }, source: 'keyboard' })
  await page.keyboard.press('Enter')
  await expect.poll(() => json('Last target activate')).toEqual({ target: { view: 'timeline', kind: 'row', id: 'r1' }, source: 'keyboard' })

  await page.keyboard.press('ArrowDown')
  await expect(heading('Row 2')).toBeFocused()
  await expect(heading('Row 2')).toHaveAttribute('tabindex', '0')
  await expect(heading('Row 1')).toHaveAttribute('tabindex', '-1')
  await page.keyboard.press(' ')
  await expect.poll(() => json('Last target activate')).toEqual({ target: { view: 'timeline', kind: 'row', id: 'r2' }, source: 'keyboard' })

  // End moves to the last displayed row, scrolling it into the rendered window; Home returns to the first.
  await page.keyboard.press('End')
  await expect(heading('Last row')).toBeFocused()
  await expect(heading('Last row')).toBeInViewport()
  await page.keyboard.press('Home')
  await expect(heading('Row 1')).toBeFocused()
  await page.keyboard.press('ArrowUp')
  await expect(heading('Row 1')).toBeFocused()

  // Tab leaves the heading for the row's other controls and never stops on another heading.
  const stops: (string | null)[] = []
  for (let index = 0; index < 6; index++) {
    await page.keyboard.press('Tab')
    stops.push(await page.evaluate(() => document.activeElement?.getAttribute('data-vw-row-heading') ?? null))
  }
  expect(stops).toEqual([null, null, null, null, null, null])

  // The expand toggle keeps its own Enter without activating the row; a click on the heading still reports a pointer
  // activation.
  await chart.getByRole('button', { name: 'Expand Parent', exact: true }).press('Enter')
  expect(await json('Last target activate')).toEqual({ target: { view: 'timeline', kind: 'row', id: 'r2' }, source: 'keyboard' })
  await heading('Parent').click()
  await expect.poll(() => json('Last target activate')).toEqual({ target: { view: 'timeline', kind: 'row', id: 'P' }, source: 'pointer' })
  expect(errors).toEqual([])
})

test('gantt revealBar scrolls to an off-screen bar and focuses it, and reports collapsed and unknown bars', async ({ page }) => {
  const errors = pageErrors(page)
  const { chart, json } = await openLinkedGanttFixture(page)
  const far = chart.getByRole('button', { name: 'Far task 180–186', exact: true })
  await expect(far).toHaveCount(0)
  await page.getByRole('button', { name: 'Reveal far task', exact: true }).click()
  await expect(far).toBeFocused()
  await expect.poll(() => json('Reveal result')).toEqual({ status: 'revealed' })
  await expect(far).toBeInViewport()

  await page.getByRole('button', { name: 'Reveal hidden task', exact: true }).click()
  await expect.poll(() => json('Reveal result')).toEqual({ status: 'hidden-by-collapse', proxyId: 'P' })
  await page.getByRole('button', { name: 'Reveal unknown task', exact: true }).click()
  await expect.poll(() => json('Reveal result')).toEqual({ status: 'unknown' })
  expect(errors).toEqual([])
})

test('gantt marker ranges line up with the time axis in both directions and appear in the SVG export', async ({ page }) => {
  const errors = pageErrors(page)
  for (const search of ['?ranges=1', '?ranges=1&rtl=1']) {
    const rtl = search.includes('rtl')
    const { chart, out } = await openGanttFixture(page, search)
    const hold = chart.getByRole('img', { name: 'Hold 1–3', exact: true })
    await expect(hold).toHaveText('Hold')
    const label = (await hold.boundingBox())!
    // 2 units at 50 px per unit.
    expect(Math.round(label.width)).toBe(100)
    const body = (await chart.locator('.vw-gantt-range:not(.vw-is-row)').boundingBox())!
    expect(Math.abs(body.x - label.x)).toBeLessThan(1)
    expect(Math.abs(body.width - label.width)).toBeLessThan(1)
    // The band ends at time 3 and the Review marker sits at time 5: later times are to the right in LTR, left in RTL.
    const review = (await chart.locator('.vw-gantt-marker:not(.vw-gantt-now)').boundingBox())!
    if (rtl) expect(label.x).toBeGreaterThan(review.x + 90)
    else expect(label.x + label.width).toBeLessThan(review.x - 90)
    // The row-restricted band covers Row 2 only: it starts where the Task B bar's row starts.
    const rowBand = (await chart.locator('.vw-gantt-range.vw-is-row').boundingBox())!
    const taskB = (await chart.getByRole('button', { name: 'Task B 4–6', exact: true }).boundingBox())!
    expect(rowBand.y).toBeLessThan(taskB.y)
    expect(rowBand.y + rowBand.height).toBeGreaterThan(taskB.y + taskB.height)
    expect(rowBand.height).toBeLessThan(80)
    await expect(chart.getByRole('img', { name: 'Row hold 4–7', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Export SVG', exact: true }).click()
    await expect(out('Exported ranges')).toHaveText('Hold 1–3; Row hold 4–7; Hold 1–3; Row hold 4–7')
  }
  expect(errors).toEqual([])
})

test('gantt select reports drags, sticky band labels follow the scroll and rounded dependencies draw curves', async ({ page }) => {
  const errors = pageErrors(page)
  await openDemo(page, 'Product roadmap')
  const showcase = page.getByRole('region', { name: 'Product roadmap', exact: true })
  // The click that ends a drag carries detail.dragged, so the showcase keeps the message about the move.
  const setup = page.getByRole('button', { name: 'Guided setup Jan 11–Feb 22', exact: true })
  const box = (await setup.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + 28, box.y + box.height / 2, { steps: 5 })
  await page.mouse.up()
  await expect(page.getByRole('button', { name: 'Guided setup Jan 13–Feb 24', exact: true })).toBeVisible()
  await expect(showcase.getByRole('status').filter({ hasText: 'Moved Guided setup to Jan 13 – Feb 24' })).toBeVisible()
  // A plain click still reports the project.
  await page.getByRole('button', { name: 'Guided setup Jan 13–Feb 24', exact: true }).click()
  await expect(showcase.getByRole('status').filter({ hasText: /^Guided setup · / })).toBeVisible()

  // The quarter band starts before the visible part of the axis after scrolling; its label is indented into view.
  const scroller = showcase.locator('.vw-gantt-scroll')
  const quarter = showcase.locator('.vw-gantt-band', { hasText: 'Q1 2027' })
  const indent = async () => parseFloat(await quarter.evaluate(el => getComputedStyle(el).textIndent))
  expect(await indent()).toBe(0)
  await scroller.evaluate(el => { el.scrollLeft = 500 })
  await expect.poll(indent).toBeGreaterThan(0)
  const label = (await quarter.boundingBox())!, area = (await scroller.boundingBox())!
  const padding = parseFloat(await quarter.evaluate(el => getComputedStyle(el).paddingLeft))
  expect(label.x + padding + await indent()).toBeGreaterThan(area.x)

  await page.getByRole('button', { name: 'Sprint plan', exact: true }).click()
  const links = page.getByRole('region', { name: 'Sprint plan', exact: true }).locator('.vw-gantt-links > path')
  expect(await links.count()).toBeGreaterThan(0)
  for (const d of await links.evaluateAll(paths => paths.map(path => path.getAttribute('d') ?? ''))) expect(d).toMatch(/ Q /)
  expect(errors).toEqual([])
})

test('compressing non-working time widens working bars and keeps edits snapped to valid times', async ({ page }) => {
  const errors = pageErrors(page)
  await openDemo(page, 'Scheduling')
  const plan = page.getByRole('region', { name: 'Gantt chart', exact: true }).first()
  const cutting = plan.getByRole('button', { name: 'Cut order A 09 Nov 08:00–09 Nov 11:00', exact: true })
  await expect(cutting).toBeVisible()
  const linearWidth = (await cutting.boundingBox())!.width

  await page.getByRole('checkbox', { name: 'Compress non-working time', exact: true }).check()
  // The accessible name carries the times, which do not depend on the scale.
  await expect(cutting).toBeVisible()
  const compressedWidth = (await cutting.boundingBox())!.width
  expect(compressedWidth).toBeGreaterThan(linearWidth * 1.5)

  // Dragging one hour of working time (36 px) proposes a whole-hour move that snaps to the same grid as before.
  const box = (await cutting.boundingBox())!
  const y = box.y + box.height / 2
  await page.mouse.move(box.x + box.width / 2, y)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + 36, y, { steps: 6 })
  await page.mouse.up()
  const moved = plan.getByRole('button', { name: 'Cut order A 09 Nov 09:00–09 Nov 12:00', exact: true })
  await expect(moved).toBeVisible()

  // Keyboard edits still move by the snap step and every proposal stays on the hour.
  await moved.press('ArrowRight')
  await expect(plan.getByRole('button', { name: /^Cut order A 09 Nov \d\d:00–09 Nov \d\d:00$/ })).toBeVisible()

  await page.getByRole('checkbox', { name: 'Compress non-working time', exact: true }).uncheck()
  const restored = (await plan.getByRole('button', { name: /^Cut order A \d\d Nov/ }).boundingBox())!.width
  expect(restored).toBeLessThan(compressedWidth)
  expect(errors).toEqual([])
})

test('tick labels of a compressed working-time axis never overlap; squeezed ticks keep their grid lines', async ({ page }) => {
  const errors = pageErrors(page)
  await openDemo(page, 'Scheduling')
  const panel = page.getByRole('region', { name: 'Calendar-aware schedule', exact: true })
  await panel.getByRole('checkbox', { name: 'Compress non-working time', exact: true }).check()
  const plan = panel.getByRole('region', { name: 'Gantt chart', exact: true }).first()
  await expect(plan.getByRole('button', { name: 'Cut order A 09 Nov 08:00–09 Nov 11:00', exact: true })).toBeVisible()
  // The nights and the closed day squeeze the 12-hour ticks to a few pixels apart.
  const labels = plan.locator('.vw-gantt-tick')
  await expect(labels.filter({ hasText: '09 Nov 08:00' })).toHaveCount(1)
  await expect(labels.filter({ hasText: '11 Nov 08:00' })).toHaveCount(1)
  const boxes = await labels.evaluateAll(spans => spans.map(span => {
    const rect = span.getBoundingClientRect()
    return { text: span.textContent ?? '', left: rect.left, right: rect.right }
  }).sort((a, b) => a.left - b.left))
  expect(boxes.length).toBeGreaterThan(1)
  for (let i = 1; i < boxes.length; i++) {
    expect(boxes[i]!.left, `${boxes[i - 1]!.text} overlaps ${boxes[i]!.text}`).toBeGreaterThanOrEqual(boxes[i - 1]!.right)
  }
  expect(await plan.locator('.vw-gantt-grid-line').count()).toBeGreaterThan(boxes.length)
  expect(errors).toEqual([])
})

async function openHeaderFixture(page: Page, search = '') {
  const errors = pageErrors(page)
  await serveFixture(page, 'gantt-header-test', 'gantt-header.html')
  await page.goto('/gantt-header-test/' + search)
  const chart = page.getByRole('region', { name: 'Gantt chart', exact: true })
  await expect(chart).toBeVisible()
  return {
    errors, chart, events: fixtureStatus(page, 'Events'),
    sortButton: (name: string) => chart.getByRole('button', { name: new RegExp(`^Sort by ${name}( \\((ascending|descending)\\))?$`) }),
    filterButton: (name: string) => chart.getByRole('button', { name: new RegExp('^Filter ' + name) }),
    shownRows: () => chart.locator('[data-vw-row-heading]').evaluateAll(list => list.map(item => item.getAttribute('data-vw-row-heading'))),
  }
}

test('gantt header sort buttons cycle ascending, descending and none, name their state and sort siblings only', async ({ page }) => {
  const { errors, chart, sortButton, shownRows, events } = await openHeaderFixture(page)
  // The header is not a table row: the sort state is in the button names, not in aria-sort on a columnheader.
  await expect(chart.locator('[role="columnheader"], [aria-sort]')).toHaveCount(0)
  await expect(chart.getByRole('button', { name: /^Sort by / })).toHaveCount(3)
  await expect(sortButton('Owner')).toHaveAccessibleName('Sort by Owner')
  expect(await shownRows()).toEqual(['p1', 'a', 'b', 'p2', 'c', 'd'])
  await sortButton('Owner').click()
  await expect(sortButton('Owner')).toHaveAccessibleName('Sort by Owner (ascending)')
  // Children stay under their parents: Ann before Ben, Ann before Cy; the parents (no owner) keep their order.
  await expect.poll(shownRows).toEqual(['p1', 'a', 'b', 'p2', 'd', 'c'])
  await sortButton('Owner').press('Enter')
  await expect(sortButton('Owner')).toHaveAccessibleName('Sort by Owner (descending)')
  await expect.poll(shownRows).toEqual(['p1', 'b', 'a', 'p2', 'c', 'd'])
  await sortButton('Owner').press('Space')
  await expect(sortButton('Owner')).toHaveAccessibleName('Sort by Owner')
  await expect.poll(shownRows).toEqual(['p1', 'a', 'b', 'p2', 'c', 'd'])
  // Another column becomes the primary rule and the earlier rules stay; the label column sorts by row label.
  await sortButton('Status').click()
  await sortButton('Rows').click()
  await expect(sortButton('Status')).toHaveAccessibleName('Sort by Status (ascending)')
  await expect(sortButton('Rows')).toHaveAccessibleName('Sort by Rows (ascending)')
  await sortButton('Rows').click()
  await expect.poll(shownRows).toEqual(['p2', 'c', 'd', 'p1', 'b', 'a'])
  await expect(events).toContainText('["sort",[{"ruleId":"$label","direction":"desc"},{"ruleId":"status","direction":"asc"}]]')
  // A secondary rule turns descending in place, then goes; the primary rule stays.
  await sortButton('Status').click()
  await expect(sortButton('Status')).toHaveAccessibleName('Sort by Status (descending)')
  await expect(events).toContainText('["sort",[{"ruleId":"$label","direction":"desc"},{"ruleId":"status","direction":"desc"}]]')
  await sortButton('Status').click()
  await expect(sortButton('Status')).toHaveAccessibleName('Sort by Status')
  await expect(sortButton('Rows')).toHaveAccessibleName('Sort by Rows (descending)')
  await expect(events).toContainText('["sort",[{"ruleId":"$label","direction":"desc"}]]')
  expect(errors).toEqual([])
})

test('gantt header sort stays controlled: an ignored proposal leaves the button name and the rows as they are', async ({ page }) => {
  const { errors, sortButton, shownRows, events } = await openHeaderFixture(page, '?ignore')
  await sortButton('Owner').click()
  await expect(events).toHaveText('["sort",[{"ruleId":"owner","direction":"asc"}]]')
  await expect(sortButton('Owner')).toHaveAccessibleName('Sort by Owner')
  expect(await shownRows()).toEqual(['p1', 'a', 'b', 'p2', 'c', 'd'])
  expect(errors).toEqual([])
})

test('gantt header filter text is controlled, drops blank text and waits for an input method to finish', async ({ page }) => {
  const ignored = await openHeaderFixture(page, '?ignore')
  await ignored.filterButton('Owner').click()
  const box = ignored.chart.getByRole('dialog', { name: 'Filter Owner', exact: true }).getByLabel('Contains', { exact: true })
  // The parent ignores the proposals, so the box shows the applied (empty) filter again, like the checkboxes do.
  await box.pressSequentially('an')
  await expect(ignored.events).toHaveText('["filters",[{"columnId":"owner","text":"a"}]]\n["filters",[{"columnId":"owner","text":"n"}]]')
  await expect(box).toHaveValue('')
  expect(await ignored.shownRows()).toEqual(['p1', 'a', 'b', 'p2', 'c', 'd'])
  expect(ignored.errors).toEqual([])

  const { errors, chart, filterButton, shownRows, events } = await openHeaderFixture(page)
  await filterButton('Owner').click()
  const text = chart.getByRole('dialog', { name: 'Filter Owner', exact: true }).getByLabel('Contains', { exact: true })
  // A parent that applies each proposal keeps typing intact.
  await text.pressSequentially('ann')
  await expect(text).toHaveValue('ann')
  await expect.poll(shownRows).toEqual(['p1', 'a', 'p2', 'd'])
  // Whitespace-only text is no condition: the filter goes, and the box shows the applied (empty) filter.
  await text.fill('  ')
  await expect(events).toContainText('["filters",[]]')
  await expect(text).toHaveValue('')
  await expect.poll(shownRows).toEqual(['p1', 'a', 'b', 'p2', 'c', 'd'])
  await expect(filterButton('Owner')).toHaveAccessibleName('Filter Owner')
  // While an input method composes, nothing is proposed; the composed text is proposed once it ends.
  await page.getByRole('button', { name: 'Clear log', exact: true }).evaluate(button => (button as HTMLButtonElement).click())
  await text.evaluate((input: HTMLInputElement) => {
    input.value = ''
    input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }))
    for (const value of ['b', 'be']) {
      input.value = value
      input.dispatchEvent(new InputEvent('input', { bubbles: true, isComposing: true, data: value }))
    }
  })
  await expect(text).toHaveValue('be')
  await expect(events).toHaveText('')
  await text.evaluate((input: HTMLInputElement) => {
    input.value = 'ben'
    input.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: 'ben' }))
  })
  await expect(events).toHaveText('["filters",[{"columnId":"owner","text":"ben"}]]')
  await expect.poll(shownRows).toEqual(['p1', 'b'])
  await expect(text).toHaveValue('ben')
  expect(errors).toEqual([])
})

test('gantt header filters narrow the rows but keep their parents, and Escape closes the dialog and returns focus', async ({ page }) => {
  const { errors, chart, filterButton, shownRows, events } = await openHeaderFixture(page)
  const owner = filterButton('Owner')
  await expect(owner).toHaveAttribute('aria-expanded', 'false')
  await owner.click()
  const dialog = chart.getByRole('dialog', { name: 'Filter Owner', exact: true })
  await expect(dialog).toBeVisible()
  await expect(owner).toHaveAttribute('aria-expanded', 'true')
  const text = dialog.getByLabel('Contains', { exact: true })
  await expect(text).toBeFocused()
  await text.fill('ann')
  // Ann owns Alpha and Delta: both phases stay as context, Beta and Gamma go.
  await expect.poll(shownRows).toEqual(['p1', 'a', 'p2', 'd'])
  await expect(filterButton('Owner')).toHaveAccessibleName('Filter Owner (filtered)')
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(filterButton('Owner')).toBeFocused()
  // The filter stays after the dialog closes; the select field filters by its choices.
  await filterButton('Status').click()
  const status = chart.getByRole('dialog', { name: 'Filter Status', exact: true })
  await expect(status.getByRole('group', { name: 'Show values' })).toBeVisible()
  await status.getByRole('checkbox', { name: 'Open' }).uncheck()
  await expect.poll(shownRows).toEqual(['p2', 'd'])
  await expect(events).toContainText('["filters",[{"columnId":"owner","text":"ann"},{"columnId":"status","values":["done","late"]}]]')
  await status.getByRole('button', { name: 'Clear filter', exact: true }).click()
  await expect(status.getByRole('checkbox', { name: 'Open' })).toBeChecked()
  await expect.poll(shownRows).toEqual(['p1', 'a', 'p2', 'd'])
  // A press outside closes the dialog without moving focus back.
  await page.getByRole('button', { name: 'Clear log', exact: true }).click()
  await expect(status).toHaveCount(0)
  await filterButton('Owner').click()
  await chart.getByRole('dialog', { name: 'Filter Owner' }).getByRole('button', { name: 'Clear filter' }).click()
  await expect.poll(shownRows).toEqual(['p1', 'a', 'b', 'p2', 'c', 'd'])
  await expect(chart.getByRole('dialog', { name: 'Filter Owner' }).getByLabel('Contains')).toHaveValue('')
  await expect(filterButton('Owner')).toHaveAccessibleName('Filter Owner')
  expect(errors).toEqual([])
})

test('gantt header filters work in right-to-left and dark charts and keep the dialog under its column', async ({ page }) => {
  const { errors, chart, filterButton, shownRows } = await openHeaderFixture(page, '?rtl&dark')
  await filterButton('Status').click()
  const dialog = chart.getByRole('dialog', { name: 'Filter Status', exact: true })
  await expect(dialog).toBeVisible()
  const cell = (await chart.locator('.vw-header-controls').filter({ hasText: 'Status' }).boundingBox())!
  const box = (await dialog.boundingBox())!
  // In a right-to-left chart the dialog opens from the column's right edge.
  expect(Math.abs(box.x + box.width - (cell.x + cell.width))).toBeLessThan(2)
  expect(box.y).toBeGreaterThan(cell.y)
  await expect(dialog).toHaveCSS('background-color', 'rgb(24, 42, 55)')
  await dialog.getByRole('checkbox', { name: 'Done' }).uncheck()
  await dialog.getByRole('checkbox', { name: 'Late' }).uncheck()
  await expect.poll(shownRows).toEqual(['p1', 'a', 'p2'])
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(filterButton('Status')).toBeFocused()
  expect(errors).toEqual([])
})

test('gantt sorting or filtering during a drag cancels the gesture as a source change, also when the filter removes the bar', async ({ page }) => {
  const { errors, chart, events } = await openHeaderFixture(page)
  const bar = chart.getByRole('button', { name: /^Bar Gamma/ })
  const box = (await bar.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2, { steps: 4 })
  await page.evaluate(() => (window as any).applyView({ sort: [{ ruleId: 'owner', direction: 'desc' }] }))
  await expect(events).toHaveText('["edit-cancel","source-changed",["bar-c"]]')
  await page.mouse.up()
  await page.getByRole('button', { name: 'Clear log', exact: true }).click()
  const moved = (await bar.boundingBox())!
  await page.mouse.move(moved.x + moved.width / 2, moved.y + moved.height / 2)
  await page.mouse.down()
  await page.mouse.move(moved.x + moved.width / 2 + 40, moved.y + moved.height / 2, { steps: 4 })
  // The projection drops the bar together with its row, so the bar is gone from the source rather than hidden.
  await page.evaluate(() => (window as any).applyView({ filters: [{ columnId: 'owner', text: 'ann' }] }))
  await expect(events).toHaveText('["edit-cancel","source-changed",["bar-c"]]')
  await page.mouse.up()
  await expect(chart.getByRole('button', { name: /^Bar Gamma/ })).toHaveCount(0)
  expect(errors).toEqual([])
})
