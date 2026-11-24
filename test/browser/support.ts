// Shared fixtures and helpers for the Playwright specs in this directory. The specs run against the built demo in
// preview/ (served by scripts/serve.mjs) and against the regression fixtures in ./fixtures, which load the public
// entries from dist/.
import { test as base, expect, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export { expect }
export type { Page }
export type Locator = ReturnType<Page['locator']>

const { version } = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as { version: string }
export const releaseLine = version.split('.').slice(0, 2).join('.')

const pageErrorLists = new WeakMap<Page, string[]>()

// Vue catches errors thrown in event handlers and render functions and reports them with console.error, so they never
// reach pageerror. Every test therefore fails when the page logs a console error or raises an uncaught error.
export const test = base.extend<{ consoleErrors: string[]; pageErrors: string[] }>({
  consoleErrors: [async ({ page }, use) => {
    const errors: string[] = []
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
    await use(errors)
    expect(errors, 'console errors').toEqual([])
  }, { auto: true }],
  pageErrors: [async ({ page }, use) => {
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    pageErrorLists.set(page, errors)
    await use(errors)
    expect(errors, 'page errors').toEqual([])
  }, { auto: true }],
})

/** The messages of the uncaught errors the page has raised so far in this test. */
export function pageErrors(page: Page) {
  const errors = pageErrorLists.get(page)
  if (!errors) throw new Error('pageErrors needs the page of a test from ./support')
  return errors
}

/**
 * Opens the page of an example or showcase of the documentation site (site/examples/registry.ts) by its ID, in English
 * or Japanese, and waits until its demo has loaded and hydrated. Returns the demo panel, which holds only the demo.
 */
export async function openExample(page: Page, id: string, { kind = 'example', locale = 'en' }: { kind?: 'example' | 'showcase'; locale?: 'en' | 'ja' } = {}) {
  await page.goto(`${locale === 'ja' ? 'ja/' : ''}${kind === 'showcase' ? 'showcase' : 'examples'}/${id}/`)
  await expect(page.locator('.vw-site-frame[data-ready]')).toBeVisible()
  // The site's navigation bar is fixed to the top of the viewport. Pointer gestures aim at element centres, and an
  // element scrolled just under the bar would receive the bar instead, so here the bar scrolls away with the page.
  await page.addStyleTag({ content: '.VPNav, .VPLocalNav { position: absolute !important; }' })
  return page.locator('.vw-site-demo')
}

/**
 * Serves a regression fixture page from ./fixtures under /<prefix>/, with the built public entries from dist/ and Vue,
 * without adding diagnostic pages to the distributed demo.
 */
export async function serveFixture(page: Page, prefix: string, html: string) {
  await page.route(`**/${prefix}/**`, async route => {
    const filename = new URL(route.request().url()).pathname.slice(`/${prefix}/`.length)
    if (filename === '') return route.fulfill({ path: fileURLToPath(new URL('./fixtures/' + html, import.meta.url)) })
    if (filename === 'vue.js') {
      return route.fulfill({
        path: fileURLToPath(new URL('../../node_modules/vue/dist/vue.esm-browser.prod.js', import.meta.url)),
        contentType: 'text/javascript',
      })
    }
    if (/^[\w-]+\.(?:js|css)$/.test(filename)) {
      return route.fulfill({
        path: fileURLToPath(new URL('../../dist/' + filename, import.meta.url)),
        contentType: filename.endsWith('.css') ? 'text/css' : 'text/javascript',
      })
    }
    return route.fulfill({ status: 404, body: 'Not found' })
  })
}

export async function openComponentFixture(page: Page) {
  await serveFixture(page, 'component-test', 'components.html')
  await page.goto('/component-test/')
}

export async function openNetworkFixture(page: Page, search: string) {
  await serveFixture(page, 'network-test', 'network.html')
  await page.goto('/network-test/' + search)
  await expect(page.getByLabel('Network graph', { exact: true })).toBeVisible()
}

/**
 * Runs `fn` on each element a locator matches, in document order, like `locator.evaluateAll(list => list.map(fn))`.
 * evaluateAll resolves the selector with Playwright's injected script in the page's own JavaScript world; on the site's
 * Gantt pages that crashed the Firefox content process ("Page crashed") in CI, whereas element handles are found in
 * Playwright's isolated world and only adopted into the page's world, which works there. Use this on those pages.
 */
export async function evaluateEach<R>(locator: Locator, fn: (element: HTMLElement | SVGElement) => R) {
  const handles = await locator.elementHandles()
  try {
    return await Promise.all(handles.map(handle => handle.evaluate(fn)))
  } finally {
    await Promise.all(handles.map(handle => handle.dispose()))
  }
}

/** Where a query starts: the whole page or one element, such as a demo section or a chart region. */
export type Scope = Page | Locator

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const pageOf = (scope: Scope): Page => 'goto' in scope ? scope : scope.page()

// Named queries for the items of the components. Each resolves by role and accessible name, so a spec reads as what a
// user (or assistive technology) finds; only the GanttChart row, which has no role, falls back to its class.

/** A NetworkGraph node: its focusable group, named by its label and detail. A RegExp matches any part of the name. */
export const graphNode = (scope: Scope, name: string | RegExp) => scope.getByRole('button', { name, exact: true })

/** A selectable NetworkGraph edge: its hit area, named "Select edge" and the edge's label (or ID). */
export const graphEdge = (scope: Scope, label: string) => scope.getByRole('button', { name: 'Select edge ' + label, exact: true })

/** The SVG stage of a NetworkGraph, named by `labels.region` ("Network graph" by default). */
export const graphStage = (scope: Scope, name = 'Network graph') => scope.getByLabel(name, { exact: true })

/** The minimap of a NetworkGraph, a button named by `labels.minimap`. */
export const graphMinimap = (scope: Scope, name = 'Navigate graph overview') => scope.getByRole('button', { name, exact: true })

/**
 * A point on a NetworkGraph stage, relative to the stage, where a click lands on the empty canvas: on the stage itself
 * or on a lane or pool, never on a node, an edge, a group, a handle or the controls drawn over the stage. Scans rows
 * from the top-left corner and keeps clear of the stage edges.
 */
export async function emptyGraphPoint(stage: Locator): Promise<{ x: number; y: number }> {
  await stage.scrollIntoViewIfNeeded()
  const point = await stage.evaluate((svg) => {
    const taken = '.vw-network-node, .vw-network-edge, .vw-edge-label, [data-vw-node], [data-vw-edge], [data-vw-group], [role="button"], button, foreignObject'
    const rect = svg.getBoundingClientRect()
    for (let y = 12; y < rect.height - 12; y += 16) {
      for (let x = 12; x < rect.width - 12; x += 16) {
        const hit = document.elementFromPoint(rect.left + x, rect.top + y)
        if (hit && svg.contains(hit) && !hit.closest(taken)) return { x, y }
      }
    }
    return null
  })
  if (!point) throw new Error('The graph stage has no empty point')
  return point
}

/** The zoom buttons of a NetworkGraph. */
export const graphZoom = (scope: Scope) => scope.getByRole('group', { name: 'Graph zoom', exact: true })

/** The scrolling region of a GanttChart, named by `labels.region` ("Gantt chart" by default). */
export const ganttRegion = (scope: Scope, name = 'Gantt chart') => scope.getByRole('region', { name, exact: true })

/** A GanttChart bar, named by its label followed by its formatted range (such as "Split · plan 09:00–11:00"). */
export const ganttBar = (scope: Scope, label: string) => scope.getByRole('button', { name: new RegExp('^' + escapeRegExp(label) + ' \\S') })

/** A GanttChart row of a chart with reorderable rows, found by its "Move row" handle. Rows have no role of their own. */
export const ganttRow = (scope: Scope, label: string) =>
  scope.locator('.vw-gantt-row').filter({ has: pageOf(scope).getByRole('button', { name: 'Move row ' + label, exact: true }) })

export type Camera = { x: number; y: number; scale: number }

export const readCamera = (page: Page) => page.evaluate(() => (window as any).__vw.graph().getViewport() as Camera)

export const chainNode = (page: Page, name?: string) => name
  ? page.getByRole('button', { name, exact: true }) : page.getByRole('button', { name: /^N\d{4}$/ })

export type TouchPoint = { x: number; y: number; id: number }

/**
 * Why the tests that drive real touch input run on Chromium only. They press, move and lift touch points through the
 * Chrome DevTools Protocol (`Input.dispatchTouchEvent`), so the browser itself turns them into pointer events, applies
 * `touch-action` and fires the click of a tap. Playwright offers no such input for Firefox or WebKit: CDP sessions are
 * Chromium-only and `page.touchscreen` can only tap, with no touch-move and no second touch point.
 */
export const realTouchChromiumOnly = 'Real touch input (touchStart/touchMove/touchEnd, several touch points) needs a Chromium CDP session; Playwright has no touch-move or multi-touch input for Firefox or WebKit'

export async function touch(cdp: Awaited<ReturnType<ReturnType<Page['context']>['newCDPSession']>>, type: 'touchStart' | 'touchMove' | 'touchEnd', points: TouchPoint[]) {
  await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points })
}

export async function openTimelineEditing(page: Page) {
  const errors = pageErrors(page)
  await openExample(page, 'timeline-editing')
  const chart = page.getByRole('region', { name: 'Editable timeline', exact: true })
  await expect(chart).toBeVisible()
  const status = (text: string) => page.getByRole('status').filter({ hasText: text })
  return { errors, chart, status }
}

/** Opens the spreadsheet fixture (fixtures/gantt-sheet.html) and returns the chart, a cell by name and the logged events. */
export async function openGanttSheetFixture(page: Page, search = '') {
  await serveFixture(page, 'gantt-sheet-test', 'gantt-sheet.html')
  await page.goto('/gantt-sheet-test/' + search)
  const chart = page.getByRole('region', { name: 'Gantt chart', exact: true })
  await expect(chart).toBeVisible()
  const cell = (name: string) => chart.getByRole('button', { name, exact: true })
  const events = async () => {
    const text = await page.getByRole('status', { name: 'Events', exact: true }).textContent()
    return (text ?? '').split('\n').filter(Boolean).map(line => JSON.parse(line) as unknown[])
  }
  const clearEvents = () => page.getByRole('button', { name: 'Clear log', exact: true }).click()
  return { chart, cell, events, clearEvents }
}

export async function openGanttFixture(page: Page, search: string) {
  await serveFixture(page, 'gantt-test', 'gantt.html')
  await page.goto('/gantt-test/' + search)
  const chart = page.getByRole('region', { name: 'Gantt chart', exact: true })
  await expect(chart).toBeVisible()
  const out = (name: string) => page.getByRole('status', { name, exact: true })
  return { chart, out }
}

export async function openGraphEditor(page: Page) {
  const errors = pageErrors(page)
  await openExample(page, 'graph-and-gantt')
  await page.getByLabel('Edit graph').check()
  const button = (name: string) => page.getByRole('button', { name, exact: true })
  const status = (text: string) => page.getByRole('status').filter({ hasText: text })
  return { errors, button, status, edges: page.locator('.vw-network-edge'), nodes: page.locator('.vw-network-node') }
}

/**
 * Dispatches a synthetic `copy`, `cut` or `paste` event carrying `text` (for a paste) to the focused element and returns
 * the plain text the event's clipboard data holds afterwards (what a copy or cut wrote). Chromium and WebKit take a
 * DataTransfer through `clipboardData`; Firefox ignores that member and builds the event's clipboard data from its own
 * `dataType` and `data` members, so both are given and the text is read back from the event, not from the DataTransfer.
 */
export function clipboardEvent(page: Page, type: 'copy' | 'cut' | 'paste', text = '') {
  return page.evaluate(([kind, value]) => {
    const data = new DataTransfer()
    if (value) data.setData('text/plain', value)
    const init: ClipboardEventInit & { dataType: string; data: string } = {
      clipboardData: data, dataType: 'text/plain', data: value, bubbles: true, cancelable: true,
    }
    const event = new ClipboardEvent(kind, init)
    document.activeElement!.dispatchEvent(event)
    return (event.clipboardData ?? data).getData('text/plain')
  }, [type, text] as const)
}

export const fixtureStatus = (page: Page, name: string) => page.getByRole('status', { name, exact: true })

/** The JSON a fixture writes into one of its status elements, or null while it is empty. */
export const readJson = async (page: Page, name: string) => JSON.parse(await fixtureStatus(page, name).textContent() || 'null')

export type Point = { x: number; y: number }
export type Box = Point & { width: number; height: number }
/** Where a pointer helper presses or moves to: the centre of an element or a box, or a point in viewport pixels. */
export type PointerTarget = Locator | Box | Point

/** A chart point rounded to a `grid`, as a snapping graph proposes it. JSON turns -0 into 0, so this adds 0 as well. */
export const snapped = (point: Point, grid: number) => ({ x: Math.round(point.x / grid) * grid + 0, y: Math.round(point.y / grid) * grid + 0 })

/** The centre of a bounding box. */
export const boxCenter = (box: Box): Point => ({ x: box.x + box.width / 2, y: box.y + box.height / 2 })

/** The centre of an element's bounding box in viewport pixels. */
export async function centerOf(target: Locator) {
  const box = await target.boundingBox()
  if (!box) throw new Error('centerOf needs a visible element')
  return boxCenter(box)
}

/** The point a pointer target stands for: an element's centre, a box's centre or the point itself. */
export async function pointOf(target: PointerTarget): Promise<Point> {
  if ('boundingBox' in target) return centerOf(target)
  return 'width' in target ? boxCenter(target) : { x: target.x, y: target.y }
}

/** Presses the mouse at a target (the centre of an element or box) and moves it by `dx`, `dy` in `steps`, keeping the button down. */
export async function pressAndMove(page: Page, target: PointerTarget, dx: number, dy: number, steps = 3) {
  const { x, y } = await pointOf(target)
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + dx, y + dy, { steps })
}

/** Presses the mouse at one target and moves it to another in `steps`, keeping the button down. Both points are read before the press. */
export async function pressAndMoveTo(page: Page, from: PointerTarget, to: PointerTarget, steps = 6) {
  const start = await pointOf(from), end = await pointOf(to)
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move(end.x, end.y, { steps })
}

/** Waits for `count` animation frames of the page, so work scheduled per frame (such as auto-pan) has had its turn. */
export async function animationFrames(page: Page, count = 2) {
  await page.evaluate(frames => new Promise<void>(resolve => {
    let left = frames
    const step = () => (--left <= 0 ? resolve() : requestAnimationFrame(step))
    requestAnimationFrame(step)
  }), count)
}

/** How a drag moves (`steps`, 6 by default) and what runs while the button is still down (`hold`), or just `hold`. */
export type DragOptions = { steps?: number; hold?: () => Promise<unknown> } | (() => Promise<unknown>)

const dragOptions = (options: DragOptions) => typeof options === 'function' ? { hold: options, steps: 6 } : { steps: 6, ...options }

/** Drags from a target by `dx`, `dy`: press, move in steps, run `hold`, release. */
export async function dragBy(page: Page, target: PointerTarget, dx: number, dy: number, options: DragOptions = {}) {
  const { steps, hold } = dragOptions(options)
  await pressAndMove(page, target, dx, dy, steps)
  await hold?.()
  await page.mouse.up()
}

/** Drags from one target to another: press, move in steps, run `hold`, release. */
export async function dragTo(page: Page, from: PointerTarget, to: PointerTarget, options: DragOptions = {}) {
  const { steps, hold } = dragOptions(options)
  await pressAndMoveTo(page, from, to, steps)
  await hold?.()
  await page.mouse.up()
}

export async function openGestureFixture(page: Page, search: string) {
  await serveFixture(page, 'gesture-test', 'gestures.html')
  await page.goto('/gesture-test/' + search)
  const proposals = fixtureStatus(page, 'Proposals')
  await expect(proposals).toHaveText('0')
  return { proposals, last: fixtureStatus(page, 'Last proposal'), control: (name: string) => page.getByRole('button', { name, exact: true }) }
}

export async function openLinkedGanttFixture(page: Page, search = '') {
  await serveFixture(page, 'linked-gantt-test', 'linked-gantt.html')
  await page.goto('/linked-gantt-test/' + search)
  const chart = page.getByRole('region', { name: 'Linked timeline', exact: true })
  await expect(chart).toBeVisible()
  const out = (name: string) => page.getByRole('status', { name, exact: true })
  const json = async (name: string) => JSON.parse((await out(name).textContent()) || 'null')
  return { chart, out, json }
}

export type LinkedFixture = {
  replaceBars(): void
  highlight(ids: string[]): void
  /** Replace one row with its `data` merged with `patch`, as new source data. */
  setRowData(rowId: string, patch: Record<string, unknown>): void
  /** Change `rowHeight`, which re-renders the chart without new rows, bars or columns. */
  rerender(): void
  /** Make the Effort field of a row read `value` from a ref outside `rows`, without new props. */
  setExternalEffort(rowId: string, value: number): void
}
