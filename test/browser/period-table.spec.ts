// Period table demo: TreeGrid rows against day or week buckets (calendarBands, createTimeBucketColumns,
// aggregateTimeBuckets) that follow a GanttChart's visible window. Covers load states that are never shown as 0, a
// mid-week shortage inside a positive week, demand edits that recompute balances with undo, the chart window driving the
// table's periods, linked order highlights and the day/week toggle.
import { expect, test, openDemo, pageErrors, type Page } from './support'

async function openPeriodTable(page: Page) {
  const errors = pageErrors(page)
  await openDemo(page, 'Period table')
  const demo = page.locator('section[aria-labelledby="period-table-title"]')
  const grid = demo.getByRole('treegrid', { name: 'Period table', exact: true })
  const chart = demo.getByRole('region', { name: 'Supply orders', exact: true })
  await expect(grid).toBeVisible()
  await expect(chart).toBeVisible()
  const row = (name: string) => grid.getByRole('row').filter({ has: page.getByRole('rowheader', { name, exact: true }) })
  /** The cell of a row in the column with this header; the column must be rendered. */
  const cell = async (rowName: string, columnName: string) => {
    const index = await grid.getByRole('columnheader', { name: columnName, exact: true }).getAttribute('aria-colindex')
    return row(rowName).locator(`[role="gridcell"][aria-colindex="${index}"]`)
  }
  const firstColumn = () => grid.locator('[role="columnheader"][aria-colindex="2"]')
  const period = demo.getByRole('status', { name: 'Visible period', exact: true })
  const feed = demo.getByRole('status', { name: 'Data feed', exact: true })
  // The first two weeks are loaded once the chart has reported its window.
  await expect(await cell('Bracket demand', 'Wed, Jun 10')).toHaveText('160')
  return {
    errors, demo, grid, chart, row, cell, firstColumn, period, feed,
    status: demo.getByRole('status', { name: 'Period table status', exact: true }),
    bar: (id: string) => chart.getByRole('button', { name: new RegExp(`^${id} `) }),
  }
}

test('period table: days that are not loaded show their load state, never 0', async ({ page }) => {
  const { errors, demo, chart, cell, firstColumn, period, feed } = await openPeriodTable(page)
  await expect(feed).toHaveText('Loaded 16 of 35 days.')
  await demo.getByRole('checkbox', { name: 'Hold the data feed', exact: true }).check()
  await chart.evaluate(element => { element.scrollLeft = element.scrollWidth })
  await expect(period).toContainText('to Sun, Jul 5.')
  await expect(feed).toContainText('Feed held')
  const first = (await firstColumn().getAttribute('aria-label')) ?? (await firstColumn().textContent())!.trim()
  for (const name of ['Bracket receipts', 'Bracket demand', 'Bracket projected balance', 'Bracket opening balance', 'Bracket fill rate']) {
    const target = await cell(name, first)
    await expect(target).toHaveText('…Loading…')
    await expect(target).toHaveClass(/vw-is-loading/)
  }
  await demo.getByRole('checkbox', { name: 'Hold the data feed', exact: true }).uncheck()
  await expect(feed).toHaveText('Loaded 35 of 35 days.')
  await expect(await cell('Bracket demand', first)).toHaveText(/^\d+$/)
  await expect(await cell('Bracket projected balance', first)).not.toHaveClass(/vw-is-loading/)
  expect(errors).toEqual([])
})

test('period table: a mid-week shortage is marked although the week ends positive', async ({ page }) => {
  const { errors, demo, cell, period } = await openPeriodTable(page)
  const shortage = await cell('Bracket projected balance', 'Wed, Jun 10')
  await expect(shortage).toHaveText('-90 short')
  await expect(shortage).toHaveClass(/vw-tone-amber/)
  const friday = await cell('Bracket projected balance', 'Fri, Jun 12')
  await expect(friday).toHaveText('130')
  await expect(friday).not.toHaveClass(/vw-tone-/)
  await expect(await cell('Bracket fill rate', 'Wed, Jun 10')).toHaveText('44%')
  // Weekends have no demand: the fill rate is known to have no value, and the balance is carried.
  await expect(await cell('Bracket fill rate', 'Sat, Jun 6')).toHaveText('–None')
  await expect(await cell('Bracket projected balance', 'Sat, Jun 6')).toHaveText('150')

  await demo.getByRole('radio', { name: 'Weeks', exact: true }).check()
  await expect(period).toContainText('weeks: Week of Jun 1')
  const week = await cell('Bracket projected balance', 'Week of Jun 8')
  await expect(week).toHaveText('130 · low -90')
  await expect(week).toHaveClass(/vw-tone-amber/)
  const before = await cell('Bracket projected balance', 'Week of Jun 1')
  await expect(before).toHaveText('150')
  await expect(before).not.toHaveClass(/vw-tone-/)
  // Weekly fill rate is weighted by demand: 230 shipped of 320, not the mean of the daily rates.
  await expect(await cell('Bracket fill rate', 'Week of Jun 8')).toHaveText('72%')
  await expect(await cell('Bracket demand', 'Week of Jun 8')).toHaveText('320')
  expect(errors).toEqual([])
})

test('period table: editing a demand cell recalculates the balances, and undo restores them', async ({ page }) => {
  const { errors, demo, cell, status } = await openPeriodTable(page)
  const demand = await cell('Bracket demand', 'Wed, Jun 10')
  await demand.click()
  await page.keyboard.type('60')
  await expect(page.getByRole('spinbutton', { name: 'Edit Wed, Jun 10 for Bracket demand', exact: true })
    .or(page.getByRole('textbox', { name: 'Edit Wed, Jun 10 for Bracket demand', exact: true }))).toBeVisible()
  await page.keyboard.press('Enter')
  await expect(status).toHaveText('Bracket demand on Wed, Jun 10: 160 → 60. Balances recalculated.')
  await expect(demand).toHaveText('60')
  const balance = await cell('Bracket projected balance', 'Wed, Jun 10')
  await expect(balance).toHaveText('10')
  await expect(balance).not.toHaveClass(/vw-tone-/)
  await expect(await cell('Bracket opening balance', 'Thu, Jun 11')).toHaveText('10')
  await expect(await cell('Bracket projected balance', 'Thu, Jun 11')).toHaveText('270')
  await expect(await cell('Bracket fill rate', 'Wed, Jun 10')).toHaveText('100%')

  await demo.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(demand).toHaveText('160')
  await expect(balance).toHaveText('-90 short')
  await expect(await cell('Bracket projected balance', 'Thu, Jun 11')).toHaveText('170')
  await demo.getByRole('button', { name: 'Redo', exact: true }).click()
  await expect(balance).toHaveText('10')
  // Balance rows are read-only.
  await expect(balance).toHaveAttribute('aria-readonly', 'true')

  // A spreadsheet paste is one proposal and one history entry.
  await (await cell('Bracket demand', 'Mon, Jun 8')).click()
  await page.evaluate(() => {
    const data = new DataTransfer()
    data.setData('text/plain', '20\t20')
    document.activeElement!.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }))
  })
  await expect(status).toHaveText('paste: 2 demand cells changed. Balances recalculated.')
  await expect(await cell('Bracket demand', 'Tue, Jun 9')).toHaveText('20')
  await expect(await cell('Bracket projected balance', 'Tue, Jun 9')).toHaveText('110')
  await expect(balance).toHaveText('50')
  await demo.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(await cell('Bracket demand', 'Tue, Jun 9')).toHaveText('40')
  await expect(balance).toHaveText('10')
  expect(errors).toEqual([])
})

test('period table: scrolling and zooming the chart move the table\'s periods', async ({ page }) => {
  const { errors, chart, demo, firstColumn, period } = await openPeriodTable(page)
  await expect(period).toHaveText('Showing 16 days: Mon, Jun 1 to Tue, Jun 16.')
  await expect(firstColumn()).toHaveText('Mon, Jun 1')
  // 80 px per day: ten days to the right.
  await chart.evaluate(element => { element.scrollLeft = 800 })
  await expect(firstColumn()).not.toHaveText('Mon, Jun 1')
  await expect(period).not.toContainText('Mon, Jun 1 to')
  const scrolled = await firstColumn().textContent()
  expect(['Tue, Jun 9', 'Wed, Jun 10', 'Thu, Jun 11']).toContain(scrolled)
  // Zooming out shows more days.
  await chart.evaluate(element => { element.scrollLeft = 0 })
  await expect(firstColumn()).toHaveText('Mon, Jun 1')
  await demo.getByRole('button', { name: 'Zoom out', exact: true }).click()
  await expect(period).not.toHaveText('Showing 16 days: Mon, Jun 1 to Tue, Jun 16.')
  const days = Number(/Showing (\d+) days/.exec((await period.textContent())!)?.[1])
  expect(days).toBeGreaterThan(16)
  // The week view of the chart fits the whole plan.
  await demo.getByRole('button', { name: 'Week view', exact: true }).click()
  await expect(period).toHaveText('Showing 35 days: Mon, Jun 1 to Sun, Jul 5.')
  expect(errors).toEqual([])
})

test('period table: selecting a shortage cell highlights the orders that feed it', async ({ page }) => {
  const { errors, cell, status, bar } = await openPeriodTable(page)
  await (await cell('Bracket projected balance', 'Wed, Jun 10')).click()
  await expect(status).toHaveText('Bracket projected balance, Wed, Jun 10: fed by MO-102.')
  await expect(bar('MO-102')).toHaveClass(/vw-is-highlighted/)
  await expect(bar('MO-101')).not.toHaveClass(/vw-is-highlighted/)
  // Every cell of the same order is outlined, such as its receipt on Thursday.
  await expect(await cell('Bracket receipts', 'Thu, Jun 11')).toHaveClass(/vw-is-highlighted/)
  await expect(await cell('Bracket receipts', 'Thu, Jun 4')).not.toHaveClass(/vw-is-highlighted/)
  // Selecting a bar in the chart outlines its cells in the table.
  await bar('MO-101').click()
  await expect(status).toHaveText('MO-101 selected; its cells are outlined in the table.')
  await expect(bar('MO-101')).toHaveAttribute('aria-pressed', 'true')
  await expect(await cell('Bracket receipts', 'Thu, Jun 4')).toHaveClass(/vw-is-highlighted/)
  await expect(await cell('Bracket receipts', 'Thu, Jun 11')).not.toHaveClass(/vw-is-highlighted/)
  // A cell without feeding orders clears the highlight.
  await (await cell('Bracket demand', 'Mon, Jun 8')).click()
  await expect(status).toHaveText('Bracket demand, Mon, Jun 8: no orders feed this cell.')
  await expect(bar('MO-101')).not.toHaveClass(/vw-is-highlighted/)
  await expect(bar('MO-101')).toHaveAttribute('aria-pressed', 'false')
  expect(errors).toEqual([])
})

test('period table: the day/week toggle rebuilds the columns, and week cells are read-only', async ({ page }) => {
  const { errors, demo, grid, cell, firstColumn, period } = await openPeriodTable(page)
  await expect(demo.getByRole('radio', { name: 'Days', exact: true })).toBeChecked()
  await demo.getByRole('radio', { name: 'Weeks', exact: true }).check()
  await expect(firstColumn()).toHaveText('Week of Jun 1')
  await expect(grid.getByRole('columnheader', { name: 'Week of Jun 8', exact: true })).toBeVisible()
  await expect(grid.getByRole('columnheader', { name: 'Mon, Jun 1', exact: true })).toHaveCount(0)
  await expect(period).toHaveText('Showing 3 weeks: Week of Jun 1 to Week of Jun 15.')
  await expect(await cell('Bracket demand', 'Week of Jun 1')).toHaveText('200')
  await expect(await cell('Bracket demand', 'Week of Jun 1')).toHaveAttribute('aria-readonly', 'true')
  await demo.getByRole('radio', { name: 'Days', exact: true }).check()
  await expect(firstColumn()).toHaveText('Mon, Jun 1')
  await expect(await cell('Bracket demand', 'Mon, Jun 1')).not.toHaveAttribute('aria-readonly', 'true')
  expect(errors).toEqual([])
})
