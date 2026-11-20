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

/** Opens the demo app and switches to one of its examples by its navigation button. */
export async function openDemo(page: Page, name: string) {
  await page.goto('/')
  await page.getByRole('button', { name, exact: true }).click()
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

export type Camera = { x: number; y: number; scale: number }

export const readCamera = (page: Page) => page.evaluate(() => (window as any).__vw.graph().getViewport() as Camera)

export const chainNode = (page: Page, name?: string) => name
  ? page.getByRole('button', { name, exact: true }) : page.getByRole('button', { name: /^N\d{4}$/ })

export type TouchPoint = { x: number; y: number; id: number }

export async function touch(cdp: Awaited<ReturnType<ReturnType<Page['context']>['newCDPSession']>>, type: 'touchStart' | 'touchMove' | 'touchEnd', points: TouchPoint[]) {
  await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points })
}

export async function openTimelineEditing(page: Page) {
  const errors = pageErrors(page)
  await openDemo(page, 'Timeline editing')
  const chart = page.getByRole('region', { name: 'Editable timeline', exact: true })
  await expect(chart).toBeVisible()
  const status = (text: string) => page.getByRole('status').filter({ hasText: text })
  return { errors, chart, status }
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
  await page.goto('/')
  await page.getByLabel('Edit graph').check()
  const button = (name: string) => page.getByRole('button', { name, exact: true })
  const status = (text: string) => page.getByRole('status').filter({ hasText: text })
  return { errors, button, status, edges: page.locator('.vw-network-edge'), nodes: page.locator('.vw-network-node') }
}

export const fixtureStatus = (page: Page, name: string) => page.getByRole('status', { name, exact: true })

export async function dragBy(page: Page, target: ReturnType<Page['locator']>, dx: number, dy: number, hold?: () => Promise<void>) {
  const box = (await target.boundingBox())!
  const x = box.x + box.width / 2, y = box.y + box.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + dx, y + dy, { steps: 6 })
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

export type LinkedFixture = { replaceBars(): void; highlight(ids: string[]): void }
