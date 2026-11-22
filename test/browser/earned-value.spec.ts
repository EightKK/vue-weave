// The earned value demo: KPI tiles, the S-curve, the EVM columns of GanttChart and the status date control.
import { expect, test, openExample, pageErrors } from './support'

test('the earned value demo recalculates PV, EV, AC and the indicators when the status date changes', async ({ page }) => {
  const errors = pageErrors(page)
  await openExample(page, 'earned-value')
  const panel = page.getByRole('region', { name: 'Earned value', exact: true })
  const summary = page.getByRole('status', { name: 'Earned value summary', exact: true })
  const tiles = page.getByRole('definition')
  const chart = page.getByRole('region', { name: 'Earned value plan', exact: true })
  const curve = page.getByRole('img', { name: 'Cumulative cost S-curve', exact: true })
  await expect(panel).toBeVisible()
  await expect(curve).toBeVisible()
  await expect(summary).toHaveText('Status 18 Nov: behind schedule (SPI 0.95), over budget (CPI 0.96); EAC 62.6k against BAC 60.0k.')
  // PV, EV, AC, SPI, CPI and EAC tiles.
  await expect(tiles).toHaveText(['39.0k', '36.9k', '38.5k', '0.95', '0.96', '62.6k'])
  for (const header of ['BAC', 'PV', 'EV', 'AC', 'SPI', 'CPI']) await expect(chart.getByText(header, { exact: true })).toBeVisible()
  // The summary rows roll up their tasks: Delivery has 44.0k of budget, 23.0k of it planned by now.
  await expect(chart.getByRole('button', { name: 'Design 05 Nov–11 Nov', exact: true })).toBeVisible()
  await expect(chart.getByText('44.0k', { exact: true })).toBeVisible()
  await expect(chart.getByText('23.0k', { exact: true })).toBeVisible()

  const status = page.getByRole('slider', { name: 'Status date', exact: true })
  await status.fill('0')
  await expect(page.getByRole('status', { name: 'Selected status date', exact: true })).toHaveText('02 Nov, 16:00')
  await expect(summary).toHaveText('Status 02 Nov: behind schedule (SPI 0.99), over budget (CPI 0.99); EAC 60.6k against BAC 60.0k.')
  await status.fill('24')
  // Everything is done: EV equals PV again (SPI 1), whatever the delay, and the EAC is the actual cost.
  await expect(summary).toHaveText('Status 04 Dec: on or ahead of schedule (SPI 1.00), over budget (CPI 0.95); EAC 62.9k against BAC 60.0k.')
  await expect(tiles.first()).toHaveText('60.0k')

  await page.getByRole('combobox', { name: 'EAC method', exact: true }).selectOption('budget')
  await expect(curve).toHaveAccessibleDescription(/forecast \d+\.\dk by/)
  expect(errors).toEqual([])
})

test('the earned value demo shows its measures and verdict in Japanese', async ({ page }) => {
  const errors = pageErrors(page)
  const demo = await openExample(page, 'earned-value', { locale: 'ja' })
  await expect(demo.getByRole('slider', { name: '状況日付' })).toBeVisible()
  await expect(demo.getByText('計画価値(PV)', { exact: true }).first()).toBeVisible()
  await expect(demo.getByRole('status', { name: 'アーンドバリューの概要' })).toContainText('の状況:')
  await expect(demo.getByRole('region', { name: 'アーンドバリューの計画', exact: true })).toBeVisible()
  expect(errors).toEqual([])
})
