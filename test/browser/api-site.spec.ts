// The API reference of the documentation site: the pages under /api/ and /ja/api/ that include regions of docs/*.md,
// the links between them that the site configuration rewrites, the related-API links of the example pages, the
// generated type reference and the search.
import { expect, openExample, pageErrors, test } from './support'

test('the API overview maps the components, composables and core areas', async ({ page }) => {
  const errors = pageErrors(page)
  await page.goto('api/')
  await expect(page.getByRole('heading', { level: 1, name: 'API reference' })).toBeVisible()
  const content = page.locator('.vp-doc')
  await expect(content.getByRole('link', { name: 'NetworkGraph', exact: true })).toHaveAttribute('href', /components\/network-graph\.html$/)
  await expect(content.getByRole('link', { name: 'Scheduling and resources', exact: true })).toHaveAttribute('href', /core\/scheduling\.html$/)
  // The compatibility promise comes from docs/api.md.
  await expect(page.getByRole('heading', { level: 2, name: /Compatibility and versioning/ })).toBeVisible()
  const sidebar = page.locator('.VPSidebar')
  for (const group of ['Components', 'Composables', 'Core', 'Guides', 'Type reference']) {
    await expect(sidebar.getByText(group, { exact: true })).toBeVisible()
  }
  await sidebar.getByRole('link', { name: 'TreeGrid', exact: true }).click()
  await expect(page).toHaveURL(/\/vue-weave\/api\/components\/tree-grid\.html$/)
  await expect(page.getByRole('heading', { level: 1, name: 'TreeGrid' })).toBeVisible()
  expect(errors).toEqual([])
})

test('a component page shows its overview, a minimal example and the props table from docs/api.md', async ({ page }) => {
  const errors = pageErrors(page)
  await page.goto('api/components/tree-grid.html')
  await expect(page).toHaveTitle(/TreeGrid/)
  await expect(page.getByRole('heading', { level: 2, name: 'Minimal example' })).toBeVisible()
  // The included section keeps the anchor that docs/api.md has on GitHub.
  await expect(page.locator('h2#treegrid')).toContainText('TreeGrid')
  const props = page.locator('.vp-doc table').filter({ has: page.getByRole('columnheader', { name: 'Prop' }) }).first()
  await expect(props.getByRole('cell', { name: 'expandedIds', exact: true })).toBeVisible()
  await expect(props.getByRole('cell', { name: 'rows', exact: true })).toBeVisible()
  // A type such as ReadonlySet<string> in the docs is shown as text, not swallowed as an HTML tag.
  await expect(props).toContainText('readonly TreeGridColumn<R>[]')
  await expect(page.getByRole('link', { name: 'TreeGridRow', exact: true }).first()).toHaveAttribute('href', /reference\/core\/interfaces\/TreeGridRow\.html$/)
  expect(errors).toEqual([])
})

test('the Japanese API page shows the Japanese overview and then the English detail', async ({ page }) => {
  const errors = pageErrors(page)
  await page.goto('ja/api/components/tree-grid.html')
  await expect(page.locator('html')).toHaveAttribute('lang', 'ja')
  await expect(page.getByRole('heading', { level: 1, name: 'TreeGrid' })).toBeVisible()
  await expect(page.getByRole('heading', { level: 2, name: '最小の例' })).toBeVisible()
  await expect(page.locator('.vp-doc')).toContainText('行のツリーを列と並べて表示します')
  await expect(page.locator('.vp-doc .info')).toContainText('詳細なリファレンスは英語です')
  await expect(page.getByRole('columnheader', { name: 'Prop' }).first()).toBeVisible()
  await expect(page.getByRole('cell', { name: 'expandedIds', exact: true })).toBeVisible()
  // The Japanese sidebar has Japanese group names and links to the Japanese copy of the generated (English) type reference.
  const sidebar = page.locator('.VPSidebar')
  await expect(sidebar.getByText('コンポーネント', { exact: true })).toBeVisible()
  await expect(sidebar.getByRole('link', { name: '@eightkk/vue-weave/core', exact: true })).toHaveAttribute('href', '/vue-weave/ja/api/reference/core/')
  expect(errors).toEqual([])
})

test('a link into another part of docs/api.md leads to the page that now holds that heading, in the same language', async ({ page }) => {
  const errors = pageErrors(page)
  // The TreeGrid section links to [Linked views](#linked-views), which is on the linked views and data page.
  await page.goto('api/components/tree-grid.html')
  const link = page.locator('.vp-doc').getByRole('link', { name: 'Linked views', exact: true }).first()
  await expect(link).toHaveAttribute('href', '/vue-weave/api/core/linked-data.html#linked-views')
  await link.click()
  await expect(page).toHaveURL(/\/vue-weave\/api\/core\/linked-data\.html#linked-views$/)
  await expect(page.locator('h2#linked-views')).toBeInViewport()

  await page.goto('ja/api/components/tree-grid.html')
  await expect(page.locator('.vp-doc').getByRole('link', { name: 'Linked views', exact: true }).first())
    .toHaveAttribute('href', '/vue-weave/ja/api/core/linked-data.html#linked-views')

  // The related-API links of an example page use the same map.
  await openExample(page, 'tree-grid')
  const related = page.getByRole('complementary', { name: 'Related API' })
  await expect(related.getByRole('link', { name: 'Tree grid editing', exact: true })).toHaveAttribute('href', '/vue-weave/api/components/tree-grid.html#tree-grid-editing')
  await related.getByRole('link', { name: 'Tree grids, matrices and bills of materials', exact: true }).click()
  await expect(page).toHaveURL(/\/vue-weave\/api\/guides\/data\.html#tree-grids-matrices-and-bills-of-materials$/)
  await expect(page.locator('h2#tree-grids-matrices-and-bills-of-materials')).toBeInViewport()
  await openExample(page, 'tree-grid', { locale: 'ja' })
  await expect(page.getByRole('complementary', { name: '関連する API' }).getByRole('link', { name: 'TreeGrid', exact: true }))
    .toHaveAttribute('href', '/vue-weave/ja/api/components/tree-grid.html#treegrid')
  expect(errors).toEqual([])
})

test('the generated type reference has a page for traverseGraph', async ({ page }) => {
  const errors = pageErrors(page)
  await page.goto('api/reference/core/functions/traverseGraph.html')
  await expect(page.getByRole('heading', { level: 1, name: /traverseGraph/ })).toBeVisible()
  await expect(page.locator('.vp-doc')).toContainText('Finds the nodes and edges reached from')
  await page.locator('.vp-doc').getByRole('link', { name: 'GraphTraversalResult' }).first().click()
  await expect(page).toHaveURL(/\/api\/reference\/core\/interfaces\/GraphTraversalResult\.html$/)
  await expect(page.getByRole('heading', { level: 1, name: /GraphTraversalResult/ })).toBeVisible()
  expect(errors).toEqual([])
})

test('the language switch of a type reference page shows the English reference with the Japanese navigation', async ({ page }) => {
  const errors = pageErrors(page)
  await page.goto('api/reference/core/functions/traverseGraph.html')
  await page.getByRole('button', { name: 'Change language' }).click()
  await page.getByRole('link', { name: '日本語', exact: true }).click()
  await expect(page).toHaveURL(/\/vue-weave\/ja\/api\/reference\/core\/functions\/traverseGraph\.html$/)
  await expect(page.locator('html')).toHaveAttribute('lang', 'ja')
  await expect(page.getByRole('heading', { level: 1, name: /traverseGraph/ })).toBeVisible()
  await expect(page.locator('.vp-doc')).toContainText('Finds the nodes and edges reached from')
  await expect(page.locator('.VPSidebar').getByText('型リファレンス(英語)', { exact: true })).toBeVisible()
  // Links between reference pages stay in the Japanese copy, and the switch leads back to the English page.
  await page.locator('.vp-doc').getByRole('link', { name: 'GraphTraversalResult' }).first().click()
  await expect(page).toHaveURL(/\/vue-weave\/ja\/api\/reference\/core\/interfaces\/GraphTraversalResult\.html$/)
  await page.getByRole('button', { name: '言語を切り替え' }).click()
  await page.getByRole('link', { name: 'English', exact: true }).click()
  await expect(page).toHaveURL(/\/vue-weave\/api\/reference\/core\/interfaces\/GraphTraversalResult\.html$/)
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  expect(errors).toEqual([])
})

test('the search finds diffStructure on the API pages', async ({ page }) => {
  const errors = pageErrors(page)
  await page.goto('api/')
  await page.getByRole('button', { name: 'Search' }).click()
  const search = page.locator('.VPLocalSearchBox')
  await search.getByRole('searchbox').fill('diffStructure')
  const result = search.getByRole('option').filter({ hasText: 'Structure comparison' }).first()
  await expect(result).toBeVisible()
  await result.click()
  await expect(page).toHaveURL(/\/vue-weave\/api\/core\/linked-data\.html#structure-comparison$/)
  await expect(page.locator('h2#structure-comparison')).toBeInViewport()
  expect(errors).toEqual([])
})
