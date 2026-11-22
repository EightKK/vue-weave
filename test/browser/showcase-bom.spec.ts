// The BOM editor showcase of the design gallery: TreeGrid editing folded into BOM lines with undo, structure moves with
// a cycle check, linked selection with the item graph, where-used walks, the revision comparison and the rollup.
import { expect, test, openDemo, pageErrors, type Page } from './support'

async function openBom(page: Page) {
  const errors = pageErrors(page)
  await openDemo(page, 'BOM editor')
  const showcase = page.getByRole('region', { name: 'BOM editor', exact: true })
  const grid = showcase.getByRole('treegrid', { name: 'Bill of materials', exact: true })
  await expect(grid).toBeVisible()
  const header = (name: string) => grid.getByRole('rowheader', { name, exact: true })
  return {
    errors, showcase, grid, header,
    rows: (name: string) => grid.getByRole('row').filter({ has: page.getByRole('rowheader', { name, exact: true }) }),
    status: showcase.getByRole('status', { name: 'BOM status', exact: true }),
    whereUsed: showcase.getByRole('region', { name: 'Where used', exact: true }),
    graph: showcase.getByRole('img', { name: 'Item structure', exact: true }),
  }
}
/** Columns by aria-colindex: the tree column is 1, then position, part number, name, quantity, unit and so on. */
const column = { pos: 2, pn: 3, name: 4, qty: 5 }

test('a quantity edit is one history entry: rejected values, undo and redo with the keyboard', async ({ page }) => {
  const { errors, showcase, rows, status } = await openBom(page)
  // The CP-80 casing uses the M12 bolt twice, at positions 30 and 40.
  const bolts = rows('Hex bolt M12×50')
  await expect(bolts).toHaveCount(2)
  const qty = bolts.nth(1).locator(`[aria-colindex="${column.qty}"]`)
  await expect(qty).toHaveText('6')
  await qty.click()
  await page.keyboard.type('0')
  await page.keyboard.press('Enter')
  await expect(status).toHaveText('Rejected: Quantity must be greater than 0.')
  await page.keyboard.press('Escape')
  await page.keyboard.type('8')
  await page.keyboard.press('Enter')
  await expect(status).toHaveText('Hex bolt M12×50: qty 6 → 8.')
  await expect(qty).toHaveText('8')
  await expect(bolts.nth(0).locator(`[aria-colindex="${column.qty}"]`)).toHaveText('10')
  await page.keyboard.press('Control+z')
  await expect(qty).toHaveText('6')
  await page.keyboard.press('Control+Shift+z')
  await expect(qty).toHaveText('8')
  await showcase.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(qty).toHaveText('6')
  await expect(showcase.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled()

  // An existing part number replaces the part on the line; one that would put an assembly inside itself is rejected.
  const plug = rows('Vent plug G1/8').locator(`[aria-colindex="${column.pn}"]`)
  await plug.dblclick()
  await page.keyboard.press('Control+a')
  await page.keyboard.type('CP-80')
  await page.keyboard.press('Enter')
  await expect(status).toHaveText('Rejected: Cycle: Centrifugal pump CP-80 already contains Volute casing assembly 80 '
    + '(Centrifugal pump CP-80 → Pump end 80 → Volute casing assembly 80), so it cannot go inside it.')
  await page.keyboard.press('Control+a')
  await page.keyboard.type('DP-S')
  await page.keyboard.press('Enter')
  await expect(status).toHaveText('Vent plug G1/8: replaced by DP-S.')
  await expect(rows('Drain plug G1/4, stainless')).toHaveCount(2)
  await expect(rows('Vent plug G1/8')).toHaveCount(0)
  await page.keyboard.press('Control+z')
  await expect(rows('Vent plug G1/8')).toHaveCount(1)
  expect(errors).toEqual([])
})

test('rows: add a line, move it, delete it and undo; a cycle move is rejected with the reason', async ({ page }) => {
  const { errors, showcase, grid, header, rows, status } = await openBom(page)
  await header('Vent plug G1/8').click()
  await page.keyboard.press('Control+Enter')
  await expect(status).toHaveText('Added New part 1 to Volute casing assembly 80 at position 80.')
  await expect(header('New part 1')).toBeFocused()
  await expect(rows('New part 1')).toHaveAttribute('aria-posinset', '8')
  await expect(rows('New part 1').locator(`[aria-colindex="${column.pos}"]`)).toHaveText('80')
  await page.keyboard.press('Alt+ArrowUp')
  await expect(status).toHaveText('Moved New part 1 within Volute casing assembly 80.')
  await expect(rows('New part 1')).toHaveAttribute('aria-posinset', '7')
  await expect(header('New part 1')).toBeFocused()
  // A position must be unique within its assembly.
  await page.keyboard.press('ArrowRight')
  await page.keyboard.type('20')
  await page.keyboard.press('Enter')
  await expect(status).toHaveText('Rejected: Position 20 of Volute casing assembly 80 is already used by Casing cover 80.')
  await page.keyboard.press('Escape')
  // Indenting makes it a line of the washer, which the lifting eye kit uses too: the line appears in both places.
  await header('New part 1').click()
  await page.keyboard.press('Alt+Shift+ArrowRight')
  await expect(status).toHaveText('Moved New part 1 into Washer M12 (all 2 usages).')
  await expect(header('New part 1')).toBeFocused()
  await expect(rows('New part 1')).toHaveAttribute('aria-level', '5')
  await expect(rows('Washer M12')).toHaveAttribute('aria-expanded', 'true')
  await page.keyboard.press('Delete')
  await expect(status).toHaveText('Removed New part 1 from Washer M12 (every usage of the assembly).')
  await expect(header('New part 1')).toHaveCount(0)
  await showcase.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(header('New part 1')).toHaveCount(1)
  for (let i = 0; i < 3; i++) await showcase.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(header('New part 1')).toHaveCount(0)
  await expect(rows('Washer M12')).not.toHaveAttribute('aria-expanded', /.*/)

  // Products are roots; the booster set contains CP-50, so it cannot go inside CP-50.
  await header('Centrifugal pump CP-80').click()
  await page.keyboard.press('ArrowLeft')
  await expect(grid).toHaveAttribute('aria-rowcount', '4')
  await header('Booster set 2 × CP-50').click()
  await page.keyboard.press('Alt+Shift+ArrowRight')
  await expect(status).toHaveText('Rejected: Cycle: Booster set 2 × CP-50 already contains Centrifugal pump CP-50 '
    + '(Booster set 2 × CP-50 → Centrifugal pump CP-50), so it cannot go inside it.')
  await expect(rows('Booster set 2 × CP-50')).toHaveAttribute('aria-level', '1')
  // A line cannot become a product either.
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowDown')
  await expect(header('Centrifugal pump CP-50').last()).toBeFocused()
  await page.keyboard.press('Alt+Shift+ArrowLeft')
  await expect(status).toHaveText('Rejected: Only products sit at the top level.')
  expect(errors).toEqual([])
})

test('linked selection: a shared item highlights all its rows and its node, and a node highlights its rows', async ({ page }) => {
  const { errors, graph, header, rows, status } = await openBom(page)
  await header('Hex bolt M12×50').first().click()
  await expect(status).toHaveText('Hex bolt M12×50 (HB-1250) is used in 2 rows.')
  const bolts = rows('Hex bolt M12×50')
  await expect(bolts.nth(0)).toHaveClass(/vw-is-highlighted/)
  await expect(bolts.nth(1)).toHaveClass(/vw-is-highlighted/)
  await expect(bolts.nth(0)).toHaveAttribute('aria-selected', 'true')
  await expect(graph.getByRole('button', { name: 'Hex bolt M12×50 HB-1250', exact: true })).toHaveClass(/vw-is-highlighted/)
  // The seal cartridge is shared by both pump ends: three usage rows, one of them under the expanded CP-80.
  await graph.getByRole('button', { name: 'Seal cartridge 35 SC-35', exact: true }).press('Enter')
  await expect(status).toHaveText('Seal cartridge 35 is used in 3 rows.')
  await expect(rows('Seal cartridge 35')).toHaveClass(/vw-is-highlighted/)
  await expect(bolts.nth(0)).not.toHaveClass(/vw-is-highlighted/)
  expect(errors).toEqual([])
})

test('where-used walks structure edges only, traces the path to a product and reports a truncated walk', async ({ page }) => {
  const { errors, showcase, graph, header, status, whereUsed } = await openBom(page)
  await showcase.getByRole('searchbox', { name: 'Search part number or name' }).fill('drain')
  await expect(status).toHaveText('3 rows match “drain”, shown with their assemblies.')
  await header('Drain plug G1/4, brass').first().click()
  const products = whereUsed.getByRole('list', { name: 'Products using the item' })
  await expect(products.getByRole('listitem')).toHaveText(['Centrifugal pump CP-50 show path', 'Booster set 2 × CP-50 show path'])
  // The stainless plug is an approved alternate used in CP-80; the alternate link must not count as a usage.
  await expect(whereUsed.getByLabel('Ignored alternate links')).toHaveText('Alternate links are not followed: they would add Centrifugal pump CP-80.')
  await products.getByRole('button', { name: /^Booster set/ }).click()
  await expect(status).toHaveText('Path to Booster set 2 × CP-50: Booster set 2 × CP-50 → Centrifugal pump CP-50 → Pump end 50 → Drain plug G1/4, brass.')
  await expect(graph.locator('.vw-network-node.vw-is-highlighted')).toHaveCount(4)
  await expect(graph.locator('g.vw-is-highlighted:has(> .vw-network-edge)')).toHaveCount(3)
  await whereUsed.getByRole('button', { name: 'Alternates', exact: true }).click()
  await expect(whereUsed.getByRole('list', { name: 'Alternate parts' }).getByRole('listitem')).toHaveText(['Drain plug G1/4, stainless'])
  await whereUsed.getByRole('button', { name: 'Structure', exact: true }).click()

  // Paint is used in five assemblies: the walk stops at eight items.
  await showcase.getByRole('searchbox', { name: 'Search part number or name' }).fill('paint')
  await header('Paint, signal blue').first().click()
  await expect(whereUsed.getByRole('note')).toContainText('more not shown')
  await expect(products.getByRole('listitem')).toHaveCount(2)
  await whereUsed.getByRole('button', { name: 'Show all', exact: true }).click()
  await expect(whereUsed.getByRole('note')).toHaveCount(0)
  await expect(products.getByRole('listitem')).toHaveCount(3)
  expect(errors).toEqual([])
})

test('revision compare marks exactly the changed rows and cells, and the change list jumps to them', async ({ page }) => {
  const { errors, showcase, graph, grid, header, rows } = await openBom(page)
  await showcase.getByRole('button', { name: 'Compare with revision A', exact: true }).click()
  await expect(showcase.getByRole('list', { name: 'Change legend' }).getByRole('listitem')).toHaveText(['Added 0', 'Changed 2', 'Moved 1', 'Removed 1'])
  const changes = showcase.getByRole('region', { name: 'Revision changes' }).getByRole('button')
  await expect(changes).toHaveText([
    'Changed Hex bolt M12×50 quantity 4 → 6',
    'Removed Warning label, hot surface removed from Volute casing assembly 80',
    'Changed Wear ring 200, polymer part number WR-200 → WR-200P; name Wear ring 200, bronze → Wear ring 200, polymer; '
      + 'item revision B → A; effective from 2025-01-06 → 2026-03-02',
    'Moved Lifting eye kit moved from Pump end 80 to Baseplate assembly 80',
  ])
  // Only the second of the two bolt usages changed, and only its quantity.
  const bolts = rows('Hex bolt M12×50')
  await expect(bolts.nth(0).getByText('Changed')).toHaveCount(0)
  await expect(bolts.nth(1).getByText('Changed', { exact: true })).toBeVisible()
  await expect(bolts.nth(1).locator('.vw-tree-grid-cell.vw-is-highlighted')).toHaveCount(1)
  await expect(bolts.nth(1).locator(`[aria-colindex="${column.qty}"]`)).toHaveClass(/vw-is-highlighted/)
  await expect(bolts.nth(0).locator('.vw-tree-grid-cell.vw-is-highlighted')).toHaveCount(0)
  // The removed line stays visible as a read-only row.
  const label = rows('Warning label, hot surface')
  await expect(label.getByText('Removed', { exact: true })).toBeVisible()
  await expect(label.locator(`[aria-colindex="${column.qty}"]`)).toHaveAttribute('aria-readonly', 'true')
  await expect(grid.locator('.sc-bom-chip')).toHaveCount(2)
  // The graph marks the items and keeps the removed one as a ghost.
  await expect(graph.getByRole('button', { name: 'Hex bolt M12×50 HB-1250 · changed in revision B', exact: true })).toBeVisible()
  await expect(graph.getByRole('button', { name: 'Warning label, hot surface WL-1 · removed in revision B', exact: true })).toBeVisible()

  // The change list reveals collapsed rows and focuses them.
  await changes.filter({ hasText: 'Lifting eye kit' }).click()
  await expect(header('Lifting eye kit')).toBeFocused()
  await expect(rows('Lifting eye kit').getByText('Moved', { exact: true })).toBeVisible()
  await expect(rows('Baseplate assembly 80')).toHaveAttribute('aria-expanded', 'true')
  await changes.filter({ hasText: 'Wear ring' }).click()
  await expect(rows('Wear ring 200, polymer').locator(`[aria-colindex="${column.pn}"]`)).toBeFocused()
  await expect(rows('Wear ring 200, polymer').locator('.vw-tree-grid-cell.vw-is-highlighted')).toHaveCount(4)
  await expect(rows('Wear ring 200, polymer').getByText('Changed', { exact: true })).toBeVisible()

  // Switching the comparison off removes the marks and the removed row.
  await showcase.getByRole('button', { name: 'Compare with revision A', exact: true }).click()
  await expect(grid.locator('.sc-bom-chip')).toHaveCount(0)
  await expect(rows('Warning label, hot surface')).toHaveCount(0)
  expect(errors).toEqual([])
})

test('the rollup multiplies shared subassemblies along every path', async ({ page }) => {
  const { errors, showcase } = await openBom(page)
  const rollup = showcase.getByRole('region', { name: 'Rollup', exact: true })
  const table = rollup.getByRole('table', { name: 'Rollup quantities' })
  const total = (part: string) => table.getByRole('row').filter({ has: page.getByRole('cell', { name: part, exact: true }) }).getByRole('cell').last()
  // Booster set: two CP-50 pumps with four mounts each on their baseplates, plus six under the skid.
  await expect(total('AVM-50')).toHaveText('14 pcs')
  await expect(total('PNT-B')).toHaveText('4.6 L')
  await rollup.getByRole('combobox', { name: 'Rollup product' }).selectOption({ label: 'Centrifugal pump CP-80' })
  await expect(total('AVM-50')).toHaveText('6 pcs')
  await expect(total('HB-1250')).toHaveText('16 pcs')
  expect(errors).toEqual([])
})
