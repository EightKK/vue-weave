import { expect, openDemo, pageErrors, test } from './support'

test('the BPMN demo draws pools, lanes, shapes and decorative markers with the labels as accessible names', async ({ page }) => {
  const errors = pageErrors(page)
  await openDemo(page, 'BPMN process')
  const stage = page.getByLabel('Purchase order process', { exact: true })
  await expect(stage).toBeVisible()
  // Pools are groups named by their titles and hold their lanes.
  const supplier = stage.getByRole('group', { name: 'Supplier', exact: true })
  await expect(supplier).toBeVisible()
  await expect(supplier.getByRole('group', { name: 'Sales', exact: true })).toHaveCount(1)
  await expect(supplier.getByRole('group', { name: 'Warehouse', exact: true })).toHaveCount(1)
  await expect(stage.getByRole('group', { name: 'Customer', exact: true }).first()).toBeVisible()
  // Events, gateways and tasks keep their labels as names; the markers are hidden from assistive technology.
  const start = stage.getByRole('button', { name: 'Order received', exact: true })
  await expect(start.locator('ellipse.vw-node-shape')).toHaveAttribute('rx', '20')
  await expect(start.locator('.vw-node-marker')).toHaveAttribute('aria-hidden', 'true')
  await expect(stage.getByRole('button', { name: 'Accept?', exact: true }).locator('[data-vw-marker="exclusive"]')).toHaveCount(1)
  await expect(stage.getByRole('button', { name: 'Orders data store', exact: true }).locator('path.vw-node-shape-detail')).toHaveCount(1)
  await expect(stage.locator('.vw-node-event-end')).toHaveCount(4)
  await expect(stage.locator('.vw-network-edge.vw-is-dashed')).toHaveCount(4)
  // A label below the shape is drawn under the box, outside its clipped content.
  const label = start.locator('text.vw-node-label-below')
  await expect(label).toHaveText('Order received')
  const shapeBox = (await start.locator('ellipse.vw-node-shape').boundingBox())!
  const labelBox = (await label.boundingBox())!
  expect(labelBox.y).toBeGreaterThan(shapeBox.y + shapeBox.height - 1)
  expect(errors).toEqual([])
})

test('BPMN steps stay selectable and connectable by accessible name', async ({ page }) => {
  const errors = pageErrors(page)
  await openDemo(page, 'BPMN process')
  const stage = page.getByLabel('Purchase order process', { exact: true })
  const status = page.getByRole('status', { name: 'BPMN status' })
  const check = stage.getByRole('button', { name: 'Check order', exact: true })
  await check.press('Enter')
  await expect(check).toHaveAttribute('aria-pressed', 'true')
  await expect(status).toHaveText('Selected Check order.')
  await check.click()
  await expect(status).toHaveText('Selected Check order.')

  // A sequence flow inside the supplier pool, then a message flow to the customer pool.
  const edges = stage.locator('.vw-network-edge')
  const before = await edges.count()
  await page.getByRole('button', { name: 'Start connection from Send rejection', exact: true }).press('Enter')
  await page.getByRole('button', { name: 'Connect to Billed', exact: true }).press('Enter')
  await expect(status).toHaveText('Sequence flow from Send rejection to Billed added.')
  await page.getByRole('button', { name: 'Start connection from Send rejection', exact: true }).press('Enter')
  await page.getByRole('button', { name: 'Connect to Order closed', exact: true }).press('Enter')
  await expect(status).toHaveText('Message flow from Send rejection to Order closed added.')
  await expect(edges).toHaveCount(before + 2)
  await expect(stage.locator('.vw-network-edge.vw-is-dashed')).toHaveCount(5)
  // A repeated flow is rejected by the parent.
  await page.getByRole('button', { name: 'Start connection from Send rejection', exact: true }).press('Enter')
  await page.getByRole('button', { name: 'Connect to Billed', exact: true }).press('Enter')
  await expect(status).toHaveText('That flow already exists.')
  await expect(edges).toHaveCount(before + 2)
  expect(errors).toEqual([])
})

test('the BPMN demo exports pools, shapes and markers to SVG and draws right-to-left labels', async ({ page }) => {
  const errors = pageErrors(page)
  await openDemo(page, 'BPMN process')
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export SVG', exact: true }).click()
  const file = await download
  expect(file.suggestedFilename()).toBe('purchase-order-process.svg')
  await expect(page.getByRole('status', { name: 'BPMN status' })).toHaveText(/^Exported SVG \(\d+ characters\)\.$/)
  await page.getByLabel('Right-to-left labels').check()
  const stage = page.getByLabel('Purchase order process', { exact: true })
  await expect(stage.getByRole('button', { name: 'Send order', exact: true }).locator('text.vw-node-title')).toHaveAttribute('x', '120')
  // The flowchart below uses the flowchart shapes with the layered layout.
  const chart = page.getByLabel('Order file flowchart', { exact: true })
  for (const name of ['Start', 'Read order file', 'Save to database', 'Print report', 'Order record']) {
    await expect(chart.getByRole('button', { name, exact: true }).locator('.vw-node-shape')).toHaveCount(1)
  }
  expect(errors).toEqual([])
})
