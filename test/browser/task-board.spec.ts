// TaskBoard: pointer and keyboard card moves, validation, cancellation and the selection shared with GanttChart.
import { expect, test, openDemo, pageErrors, touch, type Locator, type Page } from './support'

async function openTaskBoard(page: Page) {
  const errors = pageErrors(page)
  await openDemo(page, 'Task board')
  const demo = page.locator('section[aria-labelledby="task-board-title"]')
  const board = demo.getByRole('region', { name: 'Sprint board', exact: true })
  await expect(board).toBeVisible()
  return {
    errors, demo, board,
    cell: (name: string) => board.getByRole('list', { name, exact: true }),
    card: (name: string) => board.getByRole('button', { name, exact: true }),
    status: demo.getByRole('status', { name: 'Task board status', exact: true }),
    selection: demo.getByRole('status', { name: 'Board selection', exact: true }),
    announcement: board.locator('xpath=..').locator('[aria-live="polite"]'),
    chart: demo.getByRole('region', { name: 'Sprint timeline', exact: true }),
  }
}

/** Presses the mouse on a card and moves it, in steps, to the lower part of a target; `hold` runs before the release. */
async function drag(page: Page, card: Locator, target: Locator, hold?: () => Promise<void>) {
  const from = (await card.boundingBox())!
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
  await page.mouse.down()
  const to = (await target.boundingBox())!
  await page.mouse.move(to.x + to.width / 2, to.y + to.height - 6, { steps: 8 })
  await hold?.()
  await page.mouse.up()
}

test('a pointer drag proposes a move, the parent applies it and the WIP limit warns without blocking', async ({ page }) => {
  const { errors, cell, card, status, board } = await openTaskBoard(page)
  await expect(cell('To do · Web team').getByRole('button')).toHaveText([/Dashboard/])
  await drag(page, card('Dashboard'), cell('Doing · Web team'), async () => {
    await expect(board.locator('.vw-board-drop')).toHaveCount(1)
    await expect(board.locator('.vw-board-drop.vw-is-over-limit')).toHaveCount(1)
  })
  await expect(status).toHaveText('Moved Dashboard to Doing (over the WIP limit) by pointer.')
  await expect(cell('Doing · Web team').getByRole('button')).toHaveText([/Login form/, /Dashboard/])
  await expect(cell('To do · Web team').getByRole('button')).toHaveCount(0)
  await expect(board.locator('.vw-board-column-head.vw-is-over-limit')).toContainText('Over WIP limit')
  await expect(board.locator('.vw-board-column-head.vw-is-over-limit')).toContainText('4 / 3')
  await expect(board.locator('.vw-board-drop')).toHaveCount(0)
  // A drag within a cell reorders it.
  await drag(page, card('Login form'), cell('Doing · Web team'))
  await expect(cell('Doing · Web team').getByRole('button')).toHaveText([/Dashboard/, /Login form/])
  expect(errors).toEqual([])
})

test('the keyboard picks a card up, moves it with arrow keys and drops it with Enter, announcing each step', async ({ page }) => {
  const { errors, cell, card, status, announcement } = await openTaskBoard(page)
  await card('Billing API').focus()
  await page.keyboard.press('Space')
  await expect(announcement).toHaveText('Picked up Billing API. To do, lane API team, position 1 of 1.')
  await expect(card('Billing API')).toHaveClass(/vw-is-picked/)
  await page.keyboard.press('ArrowRight')
  await expect(announcement).toHaveText('Doing, lane API team, position 1 of 3, Over WIP limit.')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowDown')
  await expect(announcement).toHaveText('Doing, lane API team, position 3 of 3, Over WIP limit.')
  await page.keyboard.press('ArrowUp')
  await page.keyboard.press('Enter')
  await expect(status).toHaveText('Moved Billing API to Doing (over the WIP limit) by keyboard.')
  await expect(cell('Doing · API team').getByRole('button')).toHaveText([/Auth API/, /Billing API/, /Reports API/])
  await expect(card('Billing API')).toBeFocused()
  await expect(card('Billing API')).not.toHaveClass(/vw-is-picked/)
  // Down from the last card of a lane continues into the next lane; Space drops.
  await card('Style guide').focus()
  await page.keyboard.press('Space')
  await page.keyboard.press('ArrowDown')
  await expect(announcement).toHaveText('Review, lane API team, position 1 of 1.')
  await page.keyboard.press('Space')
  await expect(cell('Review · API team').getByRole('button')).toHaveText([/Style guide/])
  // Without a pick-up, arrow keys move the focus between cards.
  await page.keyboard.press('ArrowLeft')
  await expect(card('Auth API')).toBeFocused()
  expect(errors).toEqual([])
})

test('validateCardMove rejects a move to Done until the Gantt chart raises progress to 100%', async ({ page }) => {
  const { errors, cell, card, status, announcement, chart } = await openTaskBoard(page)
  await card('Login form').focus()
  await page.keyboard.press('Space')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('Space')
  await expect(status).toHaveText('Rejected: Login form cannot move to Done: progress is 60%, not 100%.')
  await expect(announcement).toHaveText('Login form cannot move to Done: progress is 60%, not 100%.')
  await expect(cell('Doing · Web team').getByRole('button', { name: 'Login form' })).toBeVisible()
  // Rejected pointer drops propose nothing either.
  await drag(page, card('Login form'), cell('Done · Web team'))
  await expect(status).toHaveText('Rejected: Login form cannot move to Done: progress is 60%, not 100%.')
  await expect(cell('Done · Web team').getByRole('button')).toHaveText([/Wireframes/])
  // The chart's progress slider edits the same task.
  await chart.getByRole('slider', { name: 'Progress of Login form' }).press('End')
  await expect(card('Login form')).toContainText('100%')
  await drag(page, card('Login form'), cell('Done · Web team'))
  await expect(status).toHaveText('Moved Login form to Done by pointer.')
  await expect(cell('Done · Web team').getByRole('button')).toHaveText([/Wireframes/, /Login form/])
  expect(errors).toEqual([])
})

test('Escape and data changes cancel a move without a proposal', async ({ page }) => {
  const { errors, cell, card, status, board, demo } = await openTaskBoard(page)
  await drag(page, card('Auth API'), cell('Review · API team'), async () => {
    await page.keyboard.press('Escape')
    await expect(status).toHaveText('Move of Auth API cancelled (escape).')
    await expect(board.locator('.vw-board-drop')).toHaveCount(0)
  })
  await expect(cell('Doing · API team').getByRole('button')).toHaveText([/Auth API/, /Reports API/])
  await expect(status).toHaveText('Move of Auth API cancelled (escape).')
  await card('Auth API').focus()
  await page.keyboard.press('Space')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('Escape')
  await expect(status).toHaveText('Move of Auth API cancelled (escape).')
  await expect(card('Auth API')).not.toHaveClass(/vw-is-picked/)
  await expect(card('Auth API')).toBeFocused()
  // Turning lanes off while a card is dragged changes the board data: the drag ends and nothing is proposed.
  await drag(page, card('Reports API'), cell('Review · API team'), async () => {
    await demo.getByLabel('Team lanes').dispatchEvent('click')
    await expect(status).toHaveText('Move of Reports API cancelled (data-change).')
  })
  await expect(status).toHaveText('Move of Reports API cancelled (data-change).')
  await expect(cell('Doing').getByRole('button')).toHaveText([/Login form/, /Auth API/, /Reports API/])
  expect(errors).toEqual([])
})

test('the board and the Gantt chart share the selection', async ({ page }) => {
  const { errors, card, selection, chart } = await openTaskBoard(page)
  await card('Wireframes').click()
  await expect(card('Wireframes')).toHaveAttribute('aria-pressed', 'true')
  await expect(chart.getByRole('button', { name: 'Wireframes 08:00–10:00', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(selection).toHaveText('Selected: Wireframes (Done, 100%)')
  await chart.getByRole('button', { name: 'Auth API 10:00–12:00', exact: true }).click()
  await expect(card('Auth API')).toHaveAttribute('aria-pressed', 'true')
  await expect(card('Wireframes')).toHaveAttribute('aria-pressed', 'false')
  await expect(selection).toHaveText('Selected: Auth API (Doing, 80%)')
  // Enter on a focused card selects it too.
  await card('Billing API').press('Enter')
  await expect(chart.getByRole('button', { name: 'Billing API 13:00–16:00', exact: true })).toHaveAttribute('aria-pressed', 'true')
  expect(errors).toEqual([])
})

test('a touch drag moves a card like a mouse drag', async ({ page }) => {
  const { errors, cell, card, status } = await openTaskBoard(page)
  const cdp = await page.context().newCDPSession(page)
  const from = (await card('Dashboard').boundingBox())!
  const to = (await cell('Review · Web team').boundingBox())!
  const start = { x: from.x + from.width / 2, y: from.y + from.height / 2 }
  const end = { x: to.x + to.width / 2, y: to.y + to.height - 6 }
  await touch(cdp, 'touchStart', [{ ...start, id: 1 }])
  for (let step = 1; step <= 8; step++) {
    await touch(cdp, 'touchMove', [{ x: start.x + (end.x - start.x) * step / 8, y: start.y + (end.y - start.y) * step / 8, id: 1 }])
  }
  await touch(cdp, 'touchEnd', [])
  await expect(status).toHaveText('Moved Dashboard to Review by pointer.')
  await expect(cell('Review · Web team').getByRole('button')).toHaveText([/Style guide/, /Dashboard/])
  expect(errors).toEqual([])
})
