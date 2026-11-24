// SVG and PNG export of TaskBoard, EventCalendar and TreeGrid through their exposed `exportSvg` and `exportPng`.
import { expect, pageErrors, serveFixture, test, type Page } from './support'

type Target = 'board' | 'calendar' | 'grid'

async function openExportFixture(page: Page, search = '') {
  await serveFixture(page, 'export-more-test', 'export-more.html')
  await page.goto('/export-more-test/' + search)
  await expect(page.getByRole('region', { name: 'Export board' })).toBeVisible()
  await expect(page.getByRole('treegrid', { name: 'Export grid' })).toBeVisible()
}

/** Calls `exportSvg` in the page and parses the result with DOMParser: the texts and whether it parsed. */
async function exportedSvg(page: Page, target: Target, options: Record<string, unknown> = {}) {
  return page.evaluate(({ target, options }) => {
    const svg: string = (window as any).exportRefs[target].value.exportSvg(options)
    const doc = new DOMParser().parseFromString(svg, 'image/svg+xml')
    return {
      svg,
      parseError: doc.getElementsByTagName('parsererror').length > 0,
      root: doc.documentElement.localName,
      width: Number(doc.documentElement.getAttribute('width')),
      height: Number(doc.documentElement.getAttribute('height')),
      texts: [...doc.getElementsByTagName('text')].map(text => text.textContent ?? ''),
    }
  }, { target, options })
}

/** Calls `exportPng` in the page: the blob type and size and the decoded image size. */
async function exportedPng(page: Page, target: Target, options: Record<string, unknown> = {}) {
  return page.evaluate(async ({ target, options }) => {
    const blob: Blob = await (window as any).exportRefs[target].value.exportPng(options)
    const bitmap = await createImageBitmap(blob)
    return { type: blob.type, size: blob.size, width: bitmap.width, height: bitmap.height }
  }, { target, options })
}

test('TaskBoard exports every card as SVG and PNG', async ({ page }) => {
  const errors = pageErrors(page)
  await openExportFixture(page)
  const result = await exportedSvg(page, 'board', { title: 'Sprint & board' })
  expect(result.parseError).toBe(false)
  expect(result.root).toBe('svg')
  for (const text of ['To do', 'Backlog', 'Doing', 'Done', 'Web', 'API', 'Login & <signup>', 'Design review', 'Search', 'Rate limits', 'Auth tokens', '2 / 1', '▲ Over WIP limit']) {
    expect(result.texts).toContain(text)
  }
  expect(result.svg).toContain('<title>Sprint &amp; board</title>')
  expect(result.width).toBe(3 * 232 + 40)
  const png = await exportedPng(page, 'board', { scale: 2 })
  expect(png.type).toBe('image/png')
  expect(png.size).toBeGreaterThan(1000)
  expect(png).toMatchObject({ width: Math.ceil(result.width * 2), height: Math.ceil(result.height * 2) })
  expect(errors).toEqual([])
})

test('EventCalendar exports the whole time grid and the month view', async ({ page }) => {
  const errors = pageErrors(page)
  await openExportFixture(page)
  const calendar = page.getByRole('region', { name: 'Export calendar' })
  // Only part of the day is scrolled into view, but the export draws every hour and event.
  const week = await exportedSvg(page, 'calendar')
  expect(week.parseError).toBe(false)
  for (const text of ['Nov 9 – 15, 2026', 'Mon, Nov 9', 'All day', 'Offsite', 'Early call', 'Design review', 'Late deploy', '00:00', '23:00']) {
    expect(week.texts).toContain(text)
  }
  expect(week.svg).toContain('<title>Now 10:30</title>')
  const width = await calendar.evaluate(element => element.clientWidth)
  expect(week.width).toBe(width)
  expect(week.height).toBeGreaterThan(24 * 48)

  await calendar.getByRole('button', { name: 'Month', exact: true }).click()
  const month = await exportedSvg(page, 'calendar', { heading: false, width: 700 })
  expect(month.parseError).toBe(false)
  expect(month.width).toBe(700)
  expect(month.texts).toContain('MON')
  expect(month.texts).toContain('21:00 Late deploy')
  expect(month.texts).not.toContain('November 2026')
  const png = await exportedPng(page, 'calendar')
  expect(png.type).toBe('image/png')
  expect(png.width).toBe(width)
  expect(png.height).toBeGreaterThan(300)
  expect(errors).toEqual([])
})

test('TreeGrid exports every displayed row, not only the rendered window', async ({ page }) => {
  const errors = pageErrors(page)
  await openExportFixture(page)
  const grid = page.getByRole('treegrid', { name: 'Export grid' })
  await expect(grid.getByText('Part 299', { exact: true })).toHaveCount(0)
  const all = await exportedSvg(page, 'grid')
  expect(all.parseError).toBe(false)
  for (const text of ['Name', 'Quantity', '▲', 'Note', 'Root assembly', 'Part 0', 'Part 299', '299', 'Last part']) expect(all.texts).toContain(text)
  expect(all.height).toBe(36 + 301 * 32)
  expect(all.width).toBe(240 + 90 + 140)
  const part = await exportedSvg(page, 'grid', { rowRange: { start: 0, end: 3 }, columnRange: { start: 0, end: 1 } })
  expect(part.texts).toEqual(expect.arrayContaining(['Root assembly', 'Part 0', 'Part 1', 'Quantity']))
  expect(part.texts).not.toContain('Part 2')
  expect(part.texts).not.toContain('Note')
  expect(part).toMatchObject({ width: 330, height: 36 + 3 * 32 })
  const png = await exportedPng(page, 'grid', { rowRange: { start: 0, end: 20 } })
  expect(png).toMatchObject({ type: 'image/png', width: 470, height: 36 + 20 * 32 })
  // A PNG over the canvas limit is refused with a clear error instead of an empty image.
  const refused = await page.evaluate(() => (window as any).exportRefs.grid.value.exportPng({ scale: 8 }).then(() => '', (error: Error) => error.message))
  expect(refused).toMatch(/exceeds the maximum canvas size/)
  expect(errors).toEqual([])
})

test('exports mirror right-to-left components', async ({ page }) => {
  const errors = pageErrors(page)
  await openExportFixture(page, '?rtl=1')
  for (const target of ['board', 'calendar', 'grid'] as const) {
    const result = await exportedSvg(page, target)
    expect(result.parseError).toBe(false)
    expect(result.svg).toContain('direction="rtl"')
  }
  // The tree column header sits at the right edge of the grid export.
  const grid = await page.evaluate(() => {
    const svg: string = (window as any).exportRefs.grid.value.exportSvg()
    const doc = new DOMParser().parseFromString(svg, 'image/svg+xml')
    const name = [...doc.getElementsByTagName('text')].find(text => text.textContent === 'Name')!.parentElement!
    return { x: Number(name.getAttribute('x')), width: Number(doc.documentElement.getAttribute('width')) }
  })
  expect(grid.x).toBe(grid.width - 240)
  expect(errors).toEqual([])
})
