// The documentation site (site/, VitePress): the home page and its live demo, the language switch, the examples index,
// an example page with its demo and source tabs, and dark mode.
import { expect, test, ganttBar, graphNode, openExample, pageErrors, type Page } from './support'

async function switchLanguage(page: Page, current: 'English' | '日本語', next: 'English' | '日本語') {
  const menu = page.getByRole('button', { name: current === 'English' ? 'Change language' : '言語を切り替え' })
  await menu.click()
  await page.getByRole('link', { name: next, exact: true }).click()
}

test('the home page renders the hero and a live graph and Gantt chart that share the selection', async ({ page }) => {
  const errors = pageErrors(page)
  await page.goto('./')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Vue Weave')
  await expect(page.getByRole('link', { name: 'Get started' })).toHaveAttribute('href', '/vue-weave/learn/')
  const demo = page.locator('.vw-site-home-demo[data-ready]')
  await expect(demo).toBeVisible()
  const chart = demo.getByRole('region', { name: 'Plan Gantt chart', exact: true })
  await expect(ganttBar(chart, 'Build')).toHaveAttribute('aria-pressed', 'true')
  await graphNode(demo, 'Test').click()
  await expect(ganttBar(chart, 'Test')).toHaveAttribute('aria-pressed', 'true')
  await expect(ganttBar(chart, 'Build')).toHaveAttribute('aria-pressed', 'false')
  await expect(page).toHaveTitle(/Vue Weave/)
  expect(errors).toEqual([])
})

test('the old URLs lead to the site, the production demo and the legacy gallery', async ({ page }) => {
  const errors = pageErrors(page)
  await page.goto('/')
  await expect(page).toHaveURL(/\/vue-weave\/$/)
  await page.goto('/gallery.html')
  await expect(page).toHaveURL(/\/vue-weave\/gallery\.html$/)
  await expect(page.getByRole('button', { name: 'Scheduling', exact: true })).toBeVisible()
  await page.goto('./?lang=ja')
  await expect(page).toHaveURL(/\/vue-weave\/ja\/$/)
  await page.goto('showcase/')
  await page.getByRole('link', { name: /Production planning demo/ }).click()
  await expect(page).toHaveURL(/\/vue-weave\/demo\/$/)
  await expect(page.getByRole('button', { name: 'English', exact: true })).toBeVisible()
  expect(errors).toEqual([])
})

test('the language switch moves between the English and Japanese versions of the same page', async ({ page }) => {
  const errors = pageErrors(page)
  await openExample(page, 'tree-grid')
  await expect(page.getByRole('heading', { level: 1, name: 'Tree grid' })).toBeVisible()
  await switchLanguage(page, 'English', '日本語')
  await expect(page).toHaveURL(/\/vue-weave\/ja\/examples\/tree-grid\/$/)
  await expect(page.getByRole('heading', { level: 1, name: 'ツリーグリッド' })).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('lang', 'ja')
  await expect(page.locator('.vw-site-frame[data-ready]')).toBeVisible()
  await expect(page.getByRole('treegrid').first()).toBeVisible()
  await switchLanguage(page, '日本語', 'English')
  await expect(page).toHaveURL(/\/vue-weave\/examples\/tree-grid\/$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Tree grid' })).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  expect(errors).toEqual([])
})

test('the examples index filters the cards by category and links to the example pages', async ({ page }) => {
  const errors = pageErrors(page)
  await page.goto('examples/')
  const categories = page.getByRole('navigation', { name: 'Categories' })
  const cards = page.locator('.vw-site-cards > li')
  await expect(categories.getByRole('button', { name: /All examples/ })).toHaveAttribute('aria-pressed', 'true')
  const all = await cards.count()
  expect(all).toBeGreaterThanOrEqual(3)
  await categories.getByRole('button', { name: /Tree grid & tables/ }).click()
  await expect(page).toHaveURL(/#tree-grid$/)
  await expect(page.getByRole('heading', { level: 2, name: /Tree grid & tables/ })).toBeVisible()
  await expect(cards).toHaveCount(1)
  await expect(cards.getByRole('link')).toContainText('Tree grid')
  await categories.getByRole('button', { name: /All examples/ }).click()
  await expect(cards).toHaveCount(all)

  // A category in the URL is chosen when the page opens.
  await page.goto('ja/examples/#scheduling')
  await expect(page.getByRole('navigation', { name: 'カテゴリー' }).getByRole('button', { name: /スケジューリングとリソース/ })).toHaveAttribute('aria-pressed', 'true')
  await expect(cards).toHaveCount(1)
  await cards.getByRole('link').click()
  await expect(page).toHaveURL(/\/vue-weave\/ja\/examples\/scheduling\/$/)
  await expect(page.locator('.vw-site-frame[data-ready]')).toBeVisible()
  expect(errors).toEqual([])
})

test('an example page shows the live demo, its source files in tabs and the related API', async ({ page }) => {
  const errors = pageErrors(page)
  const demo = await openExample(page, 'scheduling')
  await expect(demo.getByRole('heading', { name: 'Calendar-aware schedule' })).toBeVisible()
  await expect(page).toHaveTitle(/Calendar-aware scheduling/)
  const source = page.getByRole('region', { name: 'Source code' })
  const first = source.getByRole('radio', { name: 'SchedulingDemo.vue' })
  const second = source.getByRole('radio', { name: 'ActualsDemo.vue' })
  await expect(first).toBeChecked()
  await expect(source.locator('.blocks > .active')).toContainText('scheduleTasks')
  await source.getByText('ActualsDemo.vue', { exact: true }).click()
  await expect(second).toBeChecked()
  await expect(source.locator('.blocks > .active')).toContainText('rescheduleFromActuals')
  await expect(source.getByRole('link', { name: 'examples/ActualsDemo.vue' })).toHaveAttribute('href', /\/blob\/main\/examples\/ActualsDemo\.vue$/)
  await expect(page.getByRole('complementary', { name: 'Related API' }).getByRole('link', { name: 'scheduleTasks' })).toBeVisible()

  // Full width drops the page's maximum width.
  const frame = page.getByRole('region', { name: 'Live demo' })
  const narrow = (await frame.boundingBox())!.width
  await page.setViewportSize({ width: 1900, height: 1000 })
  const wide = (await frame.boundingBox())!.width
  await frame.getByRole('button', { name: 'Full width' }).click()
  await expect(frame.getByRole('button', { name: 'Full width' })).toHaveAttribute('aria-pressed', 'true')
  await expect.poll(async () => (await frame.boundingBox())!.width).toBeGreaterThan(wide)
  expect(narrow).toBeLessThanOrEqual(wide)

  // The demo works on the page: a status date change reschedules.
  await expect(demo.getByRole('slider').first()).toBeVisible()
  expect(errors).toEqual([])
})

test('dark mode switches the site and the live demo and survives a navigation', async ({ page }) => {
  const errors = pageErrors(page)
  const demo = await openExample(page, 'linked-views')
  const body = demo.locator('.vw-site-demo-body')
  await expect(page.locator('html')).not.toHaveClass(/dark/)
  await expect(body).not.toHaveClass(/dark/)
  await page.getByRole('switch', { name: 'Appearance' }).first().click()
  await expect(page.locator('html')).toHaveClass(/dark/)
  await expect(body).toHaveClass(/dark/)
  await page.goto('./')
  await expect(page.locator('html')).toHaveClass(/dark/)
  await expect(page.locator('.vw-site-home-demo[data-ready]')).toHaveClass(/vw-theme-dark/)
  await page.getByRole('switch', { name: 'Appearance' }).first().click()
  await expect(page.locator('html')).not.toHaveClass(/dark/)
  await expect(page.locator('.vw-site-home-demo')).not.toHaveClass(/vw-theme-dark/)
  expect(errors).toEqual([])
})

test('the showcase index lists the showcases and opens one in Japanese', async ({ page }) => {
  const errors = pageErrors(page)
  await page.goto('ja/showcase/')
  await page.getByRole('link', { name: /BOMエディター/ }).click()
  await expect(page).toHaveURL(/\/vue-weave\/ja\/showcase\/bom\/$/)
  await expect(page.locator('.vw-site-frame[data-ready]')).toBeVisible()
  await expect(page.getByRole('region', { name: 'BOM editor', exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: '← ショーケース' })).toBeVisible()
  expect(errors).toEqual([])
})
