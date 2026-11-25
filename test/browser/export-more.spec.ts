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

/** The texts of the shown agenda in reading order: per day its date, then each entry's time and title. */
async function agendaOnScreen(page: Page) {
  return page.getByRole('region', { name: 'Export calendar' }).locator('.vw-calendar-agenda-day').evaluateAll(days => days.flatMap(day => [
    day.querySelector('.vw-calendar-agenda-date')!.textContent!.trim(),
    ...[...day.querySelectorAll('.vw-calendar-agenda-event')].flatMap(entry => [
      entry.querySelector('.vw-calendar-agenda-time')!.textContent!.trim(), entry.querySelector('.vw-calendar-event-label')!.textContent!.trim(),
    ]),
  ]))
}

test('EventCalendar exports the agenda it shows, with agendaDays, as SVG and PNG', async ({ page }) => {
  const errors = pageErrors(page)
  await openExportFixture(page)
  const calendar = page.getByRole('region', { name: 'Export calendar' })
  await calendar.getByRole('button', { name: 'Agenda', exact: true }).click()
  await expect(calendar.getByRole('list', { name: 'Agenda' })).toBeVisible()
  const screen = await agendaOnScreen(page)
  expect(screen).toEqual([
    'Tuesday, November 10, 2026', 'All day', 'Offsite',
    'Wednesday, November 11, 2026', 'All day', 'Offsite', '02:00–03:00', 'Early call', '10:00–11:00', 'Design review',
    'Thursday, November 12, 2026', '21:00–22:00', 'Late deploy',
  ])
  // The list scrolls inside 240 px, but the export draws every day of it, in the same order and words.
  const agenda = await exportedSvg(page, 'calendar')
  expect(agenda.parseError).toBe(false)
  expect(agenda.texts).toEqual([await calendar.locator('.vw-calendar-title').textContent(), ...screen])
  expect(agenda.svg).toContain('<title>Early call, Wed, Nov 11 02:00–03:00</title>')
  const width = await calendar.evaluate(element => element.clientWidth)
  expect(agenda.width).toBe(width)
  const png = await exportedPng(page, 'calendar')
  expect(png).toMatchObject({ type: 'image/png', width, height: agenda.height })

  // With agendaDays the agenda covers that many days from the date, on screen and in the export.
  await page.goto('/export-more-test/?view=agenda&agendaDays=1')
  await expect(calendar.getByRole('list', { name: 'Agenda' })).toBeVisible()
  const one = await agendaOnScreen(page)
  expect(one[0]).toBe('Wednesday, November 11, 2026')
  expect(one).not.toContain('Late deploy')
  expect((await exportedSvg(page, 'calendar', { heading: false })).texts).toEqual(one)
  expect(errors).toEqual([])
})

test('a right-to-left calendar export keeps times left to right and puts them before the title, as on screen', async ({ page }) => {
  const errors = pageErrors(page)
  await openExportFixture(page, '?rtl=1&view=month')
  const calendar = page.getByRole('region', { name: 'Export calendar' })
  // On screen the time of a month event is at its inline start, the right edge, and the title to its left.
  const button = calendar.getByRole('button', { name: /^Late deploy,/ })
  const time = (await button.locator('.vw-calendar-event-time').boundingBox())!
  const label = (await button.locator('.vw-calendar-event-label').boundingBox())!
  expect(time.x).toBeGreaterThan(label.x)
  // The exported text of the Late deploy event, drawn by the browser: where the time, its two ends and the title land.
  // Each part is measured in the <text> run that holds it, from its first character to the end of its last.
  const drawn = () => page.evaluate(() => {
    const host = document.createElement('div')
    host.innerHTML = (window as any).exportRefs.calendar.value.exportSvg({ heading: false })
    document.body.append(host)
    const event = [...host.querySelectorAll('g.vw-calendar-event')].find(group => group.querySelector('title')!.textContent!.startsWith('Late deploy,'))!
    const place = (part: string) => {
      const text = [...event.querySelectorAll('text')].find(text => text.textContent!.includes(part))
      if (!text) return { start: NaN, end: NaN }
      const index = text.textContent!.indexOf(part)
      const last = text.getExtentOfChar(index + part.length - 1)
      return { start: text.getStartPositionOfChar(index).x, end: last.x + last.width }
    }
    const result = { time: place('21:00'), rangeEnd: place('22:00'), title: place('Late deploy') }
    host.remove()
    return result
  })
  // The month shows the start time; the time grid and the agenda the range, before the title in reading order.
  const month = await drawn()
  expect(month.time.start).toBeGreaterThanOrEqual(month.title.end)
  for (const view of ['Week', 'Agenda']) {
    await calendar.getByRole('button', { name: view, exact: true }).click()
    const drawnView = await drawn()
    expect(drawnView.time.start, view).toBeLessThan(drawnView.rangeEnd.start)
    if (view === 'Agenda') {
      // As on screen, the agenda time column is at the right and the title to its left.
      const entry = calendar.locator('.vw-calendar-agenda-event').filter({ hasText: 'Late deploy' })
      const screenTime = (await entry.locator('.vw-calendar-agenda-time').boundingBox())!
      const screenTitle = (await entry.locator('.vw-calendar-event-label').boundingBox())!
      expect(screenTime.x).toBeGreaterThan(screenTitle.x)
      expect(drawnView.time.start).toBeGreaterThanOrEqual(drawnView.title.end)
    }
  }
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

test('exports write colours given as var() or currentColor as the computed colour, so a standalone SVG and PNG paint them', async ({ page }) => {
  const errors = pageErrors(page)
  await openExportFixture(page, '?colors')
  const calendar = page.getByRole('region', { name: 'Export calendar' })
  // On screen the stripe of the booking uses the variable defined on an ancestor of the calendar.
  const booking = calendar.getByRole('button', { name: /^Booking/ })
  await expect(booking).toHaveCSS('border-inline-start-color', 'rgb(200, 30, 120)')
  const stripes = await page.evaluate(() => {
    const svg: string = (window as any).exportRefs.calendar.value.exportSvg()
    const doc = new DOMParser().parseFromString(svg, 'image/svg+xml')
    const stripe = (label: string) => {
      const group = [...doc.querySelectorAll('g.vw-calendar-event')].find(g => g.querySelector('title')?.textContent?.startsWith(label))!
      const rect = [...group.querySelectorAll('rect')].find(r => r.getAttribute('width') === '3')!
      return { fill: rect.getAttribute('fill'), x: Number(rect.getAttribute('x')), y: Number(rect.getAttribute('y')), height: Number(rect.getAttribute('height')) }
    }
    return { svg, booking: stripe('Booking'), unset: stripe('Unset colour'), teal: stripe('Design review') }
  })
  expect(stripes.svg).not.toContain('var(')
  expect(stripes.booking.fill).toBe('rgb(200, 30, 120)')
  // A var() without a value paints the tone colour on screen, and so does the export.
  expect(stripes.unset.fill).toBe(stripes.teal.fill)
  await expect(calendar.getByRole('button', { name: /^Unset colour/ })).toHaveCSS('border-inline-start-color', await calendar.getByRole('button', { name: /^Design review/ }).evaluate(el => getComputedStyle(el).borderInlineStartColor))
  // The PNG, rasterized from the standalone SVG, paints the stripe in that colour, not black.
  const pixel = await page.evaluate(async ({ x, y }) => {
    const blob: Blob = await (window as any).exportRefs.calendar.value.exportPng({ scale: 2 })
    const bitmap = await createImageBitmap(blob)
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    const context = canvas.getContext('2d')!
    context.drawImage(bitmap, 0, 0)
    return [...context.getImageData(Math.round(x * 2), Math.round(y * 2), 1, 1).data]
  }, { x: stripes.booking.x + 1.5, y: stripes.booking.y + stripes.booking.height / 2 })
  expect(pixel).toEqual([200, 30, 120, 255])

  // TaskBoard: the over-limit warning colour is currentColor, written as the text colour computed on the board's root.
  const board = await page.evaluate(() => {
    const ref = (window as any).exportRefs.board.value
    const root = document.querySelector('section[aria-label="Board export fixture"] .vw-board')!
    return { svg: ref.exportSvg() as string, color: getComputedStyle(root).color }
  })
  expect(board.svg).not.toMatch(/currentColor|var\(/i)
  expect(board.svg).toContain(`fill="${board.color}"`)
  // TreeGrid: the highlight is currentColor and the selection var(--grid-selected).
  const grid = await page.evaluate(() => {
    const ref = (window as any).exportRefs.grid.value
    const root = document.querySelector('section[aria-label="Grid export fixture"] .vw-tree-grid')!
    return { svg: ref.exportSvg() as string, color: getComputedStyle(root).color }
  })
  expect(grid.svg).not.toMatch(/currentColor|var\(/i)
  expect(grid.svg).toContain(`"${grid.color}"`)
  expect(grid.svg).toContain('fill="rgb(250, 220, 90)"')
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
