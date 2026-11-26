// TaskBoard, beyond task-board.spec.ts: right-to-left, read-only and fixed cards, lane and Home/End keys, WIP limits and
// minimums with a refusing validator, blur and pointer cancellation, stale data during a drag, focusCard, touch taps,
// background-click payloads, labels and slots, on the fixture fixtures/board-more.html.
import { expect, test, boxCenter, fixtureStatus, pageErrors, realTouchChromiumOnly, serveFixture, touch, type Page } from './support'

async function openBoard(page: Page, search = '') {
  const errors = pageErrors(page)
  await serveFixture(page, 'board-more-test', 'board-more.html')
  await page.goto('/board-more-test/' + search)
  const board = page.getByRole('region', { name: search.includes('german') ? 'Aufgabenbrett' : 'Fixture board', exact: true })
  await expect(board).toBeVisible()
  const log = fixtureStatus(page, 'Board log')
  return {
    errors, board, log,
    card: (name: string) => board.getByRole('button', { name, exact: true }),
    cell: (name: string) => board.getByRole('list', { name, exact: true }),
    announcement: board.locator('xpath=..').locator('[aria-live="polite"]'),
    button: (name: string) => page.getByRole('button', { name, exact: true }),
    // A click that keeps the focus where it is, so a picked-up card stays picked up.
    press: (name: string) => page.getByRole('button', { name, exact: true }).evaluate(element => (element as HTMLButtonElement).click()),
    lines: async () => ((await log.textContent()) ?? '').split('\n').filter(Boolean).map(line => JSON.parse(line) as unknown[]),
    head: (name: string) => board.locator('.vw-board-column-head').filter({ hasText: name }),
  }
}

test('right to left: the first column is on the right and Left and Right follow the visual direction', async ({ page }) => {
  const { errors, board, card, announcement, lines } = await openBoard(page, '?rtl&nolanes')
  await expect(page.locator('.vw-board')).toHaveAttribute('dir', 'rtl')
  const alpha = (await card('Alpha').boundingBox())!, bravo = (await card('Bravo').boundingBox())!, echo = (await card('Echo').boundingBox())!
  expect(alpha.x).toBeGreaterThan(bravo.x)
  expect(bravo.x).toBeGreaterThan(echo.x)
  // Without a pick-up, ArrowLeft moves the focus to the card on the left, which is in the next column.
  await card('Alpha').focus()
  await page.keyboard.press('ArrowLeft')
  await expect(card('Bravo')).toBeFocused()
  await page.keyboard.press('ArrowRight')
  await expect(card('Alpha')).toBeFocused()
  // A picked-up card moves to the next column with ArrowLeft and back with ArrowRight; the first column has no neighbour on its right.
  await page.keyboard.press('Space')
  await page.keyboard.press('ArrowRight')
  await expect(announcement).toHaveText(/^To do, position 1 of 2/)
  await page.keyboard.press('ArrowLeft')
  await expect(announcement).toHaveText(/^Doing, position 1 of 3, Over WIP limit\./)
  await page.keyboard.press('ArrowLeft')
  await expect(announcement).toHaveText(/^Review, position 1 of 1/)
  await page.keyboard.press('Enter')
  expect(await lines()).toEqual([['move', 'alpha', 'review', null, 0, 'keyboard']])
  await expect(card('Alpha')).toBeFocused()
  expect(errors).toEqual([])
})

test('a read-only board selects and activates cards but proposes no moves', async ({ page }) => {
  const { errors, board, card, lines } = await openBoard(page, '?readonly&nolanes')
  await expect(board.locator('.vw-is-movable')).toHaveCount(0)
  await expect(card('Alpha')).not.toHaveAccessibleDescription(/pick/i)
  await card('Alpha').focus()
  await page.keyboard.press('Space')
  expect(await lines()).toEqual([['select', 'alpha'], ['activate', 'alpha']])
  await expect(card('Alpha')).not.toHaveClass(/vw-is-picked/)
  // A pointer drag shows no drop indicator and proposes or cancels nothing.
  const box = (await card('Bravo').boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + 200, box.y + box.height / 2, { steps: 6 })
  await expect(board.locator('.vw-board-drop')).toHaveCount(0)
  await page.mouse.up()
  expect((await lines()).map(line => line[0])).toEqual(['select', 'activate'])
  expect(errors).toEqual([])
})

test('a card with draggable false is activated by Space and stays put, while its neighbours move', async ({ page }) => {
  const { errors, board, card, cell, lines } = await openBoard(page)
  await expect(card('Pinned')).not.toHaveClass(/vw-is-movable/)
  await expect(card('Alpha')).toHaveClass(/vw-is-movable/)
  await card('Pinned').focus()
  await page.keyboard.press('Space')
  expect(await lines()).toEqual([['select', 'delta'], ['activate', 'delta']])
  const box = (await card('Pinned').boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + 220, box.y + box.height / 2, { steps: 6 })
  await expect(board.locator('.vw-board-drop')).toHaveCount(0)
  await page.mouse.up()
  expect((await lines()).map(line => line[0])).toEqual(['select', 'activate'])
  await expect(cell('To do · API').getByRole('button')).toHaveText([/Pinned/])
  expect(errors).toEqual([])
})

test('Up and Down cross lanes, Home and End jump inside a cell, and a move stops at the board edges', async ({ page }) => {
  const { errors, card, announcement, lines } = await openBoard(page)
  await card('Bravo').focus()
  await page.keyboard.press('Space')
  await expect(announcement).toHaveText('Picked up Bravo. Doing, lane Web, position 1 of 1.')
  await page.keyboard.press('ArrowDown')
  await expect(announcement).toHaveText(/^Doing, lane API, position 1 of 2/)
  await page.keyboard.press('End')
  await expect(announcement).toHaveText(/^Doing, lane API, position 2 of 2/)
  await page.keyboard.press('Home')
  await expect(announcement).toHaveText(/^Doing, lane API, position 1 of 2/)
  // The last place of the last lane has no place below it; Up returns to the lane above.
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowDown')
  await expect(announcement).toHaveText(/^Doing, lane API, position 2 of 2/)
  await page.keyboard.press('ArrowUp')
  await page.keyboard.press('ArrowUp')
  await page.keyboard.press('ArrowUp')
  await expect(announcement).toHaveText(/^Doing, lane Web, position 1 of 1/)
  await page.keyboard.press('ArrowUp')
  await expect(announcement).toHaveText(/^Doing, lane Web, position 1 of 1/)
  // The first and last columns have nothing beyond them.
  await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('ArrowLeft')
  await expect(announcement).toHaveText(/^To do, lane Web/)
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await expect(announcement).toHaveText(/^Done, lane Web/)
  await page.keyboard.press('Enter')
  expect(await lines()).toEqual([['move', 'bravo', 'done', 'web', 0, 'keyboard']])
  expect(errors).toEqual([])
})

test('moving the focus away from a picked-up card cancels the move with reason blur', async ({ page }) => {
  const { errors, card, button, lines } = await openBoard(page)
  await card('Alpha').focus()
  await page.keyboard.press('Space')
  await page.keyboard.press('ArrowRight')
  await button('Outside').focus()
  expect(await lines()).toEqual([['cancel', 'alpha', 'blur', 'keyboard']])
  await expect(card('Alpha')).not.toHaveClass(/vw-is-picked/)
  await expect(card('Alpha')).toHaveAttribute('aria-pressed', 'false')
  expect(errors).toEqual([])
})

test('a move the parent has not applied when the focus leaves the card does not pull the focus back later', async ({ page }) => {
  const { errors, card, button, lines } = await openBoard(page, '?ignoremoves')
  await card('Alpha').focus()
  await page.keyboard.press('Space')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('Space')
  expect(await lines()).toEqual([['move', 'alpha', 'doing', 'web', 0, 'keyboard']])
  await expect(card('Alpha')).toBeFocused()
  // The focus moves on, and the cards change for another reason: the focus stays where the user put it.
  await button('Replace cards').click()
  await expect(button('Replace cards')).toBeFocused()
  await button('Replace cards').click()
  await expect(button('Replace cards')).toBeFocused()
  expect(errors).toEqual([])
})

test('a parent that changes the cards and moves the focus in its move handler keeps the focus where it put it', async ({ page }) => {
  const { errors, card, button, lines } = await openBoard(page, '?ignoremoves&refocus')
  await card('Alpha').focus()
  await page.keyboard.press('Space')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('Space')
  expect(await lines()).toEqual([['move', 'alpha', 'doing', 'web', 0, 'keyboard']])
  await expect(button('Replace cards')).toBeFocused()
  // Let the deferred focus of the board run, had it not been cancelled.
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve))))
  await expect(button('Replace cards')).toBeFocused()
  expect(errors).toEqual([])
})

test('pointer cancellation and new source data end a drag without a proposal', async ({ page, browserName }) => {
  const { errors, board, card, press, lines } = await openBoard(page)
  // The mouse pointer ID is not fixed across engines (Chromium uses 1), so the synthetic cancellation reuses the ID of the press.
  await page.evaluate(() => document.addEventListener('pointerdown', event => { (window as any).__pointerId = event.pointerId }, true))
  const box = (await card('Alpha').boundingBox())!
  const start = boxCenter(box)
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move(start.x + 300, start.y + 20, { steps: 5 })
  await expect(board.locator('.vw-board-drop')).toHaveCount(1)
  const pointerId = await page.evaluate(() => (window as any).__pointerId as number)
  await card('Alpha').dispatchEvent('pointercancel', { pointerId, pointerType: 'mouse', isPrimary: true, bubbles: true })
  expect(await lines()).toEqual([['cancel', 'alpha', 'pointer-cancel', 'pointer']])
  await expect(board.locator('.vw-board-drop')).toHaveCount(0)
  await page.mouse.up()
  expect(await lines()).toHaveLength(1)
  // New card objects (the same content) are new source data: the drag ends and nothing is proposed.
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move(start.x + 300, start.y + 20, { steps: 5 })
  await expect(board.locator('.vw-board-drop')).toHaveCount(1)
  await press('Replace cards')
  await expect.poll(async () => (await lines()).length).toBe(2)
  expect((await lines())[1]).toEqual(['cancel', 'alpha', 'data-change', 'pointer'])
  await page.mouse.up()
  // Releasing after the drag was cancelled by new data proposes nothing. WebKit then delivers the click of the press to the
  // card, which selects it as any click does; the other engines send no click, so only WebKit may add these two entries.
  const trailing = browserName === 'webkit' ? ['select', 'activate'] : []
  expect((await lines()).map(line => line[0])).toEqual(['cancel', 'cancel', ...trailing])
  await expect(board.locator('.vw-board-drop')).toHaveCount(0)
  expect(errors).toEqual([])
})

test('focusCard focuses a shown card and resolves false for a missing one or one in a collapsed column', async ({ page }) => {
  const { errors, card, button, board, lines } = await openBoard(page, '?collapsible')
  await button('Focus echo').click()
  await expect(card('Echo')).toBeFocused()
  await button('Focus missing').click()
  await board.getByRole('button', { name: 'Collapse Done', exact: true }).click()
  await expect(card('Echo')).toHaveCount(0)
  await button('Focus echo').click()
  expect(await lines()).toEqual([['focusCard', 'echo', true], ['focusCard', 'missing', false], ['collapse-columns', ['done']], ['focusCard', 'echo', false]])
  await button('Focus alpha').click()
  await expect(card('Alpha')).toBeFocused()
  expect(errors).toEqual([])
})

test('a column at its WIP limit is marked, a validator can refuse a move into it, and moves past it are allowed otherwise', async ({ page }) => {
  const { errors, board, card, cell, head, announcement, lines } = await openBoard(page, '?strict')
  await expect(head('Doing')).toHaveClass(/vw-is-at-limit/)
  await expect(head('Doing')).not.toHaveClass(/vw-is-over-limit/)
  await expect(head('Doing')).toContainText('2 / 2')
  // The cells describe their column: the count and the limit cover every lane.
  await expect(cell('Doing · Web')).toHaveAccessibleDescription('2 cards, WIP limit 2')
  await expect(cell('Doing · API')).toHaveAccessibleDescription('2 cards, WIP limit 2')
  await card('Alpha').focus()
  await page.keyboard.press('Space')
  await page.keyboard.press('ArrowRight')
  // The drop indicator warns that the drop would take the column over its limit.
  await expect(board.locator('.vw-board-drop.vw-is-over-limit')).toHaveCount(1)
  await page.keyboard.press('Enter')
  expect(await lines()).toEqual([['rejected', 'alpha', 'Doing is full.']])
  await expect(announcement).toHaveText('Doing is full.')
  await expect(cell('To do · Web').getByRole('button')).toHaveText([/Alpha/])
  await expect(head('Doing')).not.toHaveClass(/vw-is-over-limit/)
  await expect(board.locator('.vw-board-drop')).toHaveCount(0)
  // A move within the limit's column (a reorder) is not refused, and one out of it frees a place.
  await card('Bravo').focus()
  await page.keyboard.press('Space')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('Enter')
  await expect(head('Doing')).not.toHaveClass(/vw-is-at-limit/)
  expect((await lines()).at(-1)).toEqual(['move', 'bravo', 'review', 'web', 0, 'keyboard'])
  expect(errors).toEqual([])
})

test('without a refusing validator a move over the limit goes through, and an empty column under its minimum is marked until filled', async ({ page }) => {
  const { errors, card, cell, head, lines } = await openBoard(page)
  await expect(head('Review')).toHaveClass(/vw-is-under-minimum/)
  await expect(head('Review')).toContainText('Under WIP minimum')
  await expect(cell('Review · Web')).toHaveAccessibleDescription(/WIP minimum 1, Under WIP minimum/)
  await card('Alpha').focus()
  await page.keyboard.press('Space')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('Enter')
  await expect(head('Doing')).toHaveClass(/vw-is-over-limit/)
  await expect(head('Doing')).toContainText('3 / 2')
  expect(await lines()).toEqual([['move', 'alpha', 'doing', 'web', 0, 'keyboard']])
  await page.keyboard.press('Space')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('Enter')
  await expect(head('Review')).not.toHaveClass(/vw-is-under-minimum/)
  await expect(head('Doing')).toHaveClass(/vw-is-at-limit/)
  expect(errors).toEqual([])
})

test('clicks report the selection once and background-click names the cell or nothing', async ({ page }) => {
  const { errors, board, card, cell, head, lines } = await openBoard(page)
  await card('Alpha').click()
  await card('Alpha').click()
  // The selection is proposed once; every click activates.
  expect(await lines()).toEqual([['select', 'alpha'], ['activate', 'alpha'], ['activate', 'alpha']])
  await cell('Review · API').click()
  expect((await lines()).at(-1)).toEqual(['background', { columnId: 'review', laneId: 'api' }])
  await head('Doing').click()
  await board.getByRole('button', { name: 'Bravo', exact: true }).click()
  expect((await lines()).map(line => line[0]).slice(3)).toEqual(['background', 'select', 'activate'])
  const area = (await board.boundingBox())!
  await page.mouse.click(area.x + 3, area.y + area.height - 3)
  expect((await lines()).at(-1)).toEqual(['background', {}])
  expect(errors).toEqual([])
})

test('labels and slots replace the texts and the content of cards, headers and empty cells', async ({ page }) => {
  const { errors, board, cell, card, announcement, lines } = await openBoard(page, '?german&slots&collapsible')
  // The column-header slot replaces the whole header, toggle included; the lane headers keep theirs. The slot props
  // carry the collapse state, the toggle and its name, so the slot draws its own toggle.
  await expect(board.getByRole('button', { name: 'Einklappen Web', exact: true })).toBeVisible()
  await expect(board.locator('.vw-board-column-head .vw-board-toggle')).toHaveCount(0)
  const toggle = board.getByRole('button', { name: 'Einklappen To do', exact: true })
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  await toggle.click()
  await expect(board.getByRole('button', { name: 'Ausklappen To do', exact: true })).toHaveAttribute('aria-expanded', 'false')
  await expect(board.locator('.vw-board-column-head').first()).toHaveClass(/vw-is-collapsed/)
  await board.getByRole('button', { name: 'Ausklappen To do', exact: true }).click()
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  expect(await lines()).toEqual([['collapse-columns', ['todo']], ['collapse-columns', []]])
  await expect(board.locator('.slot-card').first()).toHaveText('Alpha in To do / Web')
  await expect(board.locator('.slot-head').nth(1)).toHaveText('Doing: 2 full')
  await expect(board.locator('.slot-head').nth(2)).toHaveText('Review: 0 short')
  await expect(board.locator('.slot-empty').first()).toBeVisible()
  await expect(cell('Review · Web').locator('.slot-empty')).toHaveText('Nothing in Review / Web')
  // The slot sits inside the card button, whose name still comes from the card; the hint comes from labels.
  await expect(card('Alpha')).toHaveAccessibleDescription(/Leertaste hebt die Karte an\./)
  await card('Alpha').focus()
  await page.keyboard.press('Space')
  await expect(announcement).toHaveText(/^Angehoben/)
  await expect(board.locator('.slot-card').first()).toHaveText('Alpha in To do / Web moving')
  await page.keyboard.press('Escape')
  await expect(announcement).toHaveText('Abgebrochen.')
  expect(errors).toEqual([])
})

test('a tap selects and activates a card, a cancelled touch drag proposes nothing, and movable cards own their touch', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', realTouchChromiumOnly)
  const { errors, board, card, lines } = await openBoard(page)
  await expect(card('Alpha')).toHaveCSS('touch-action', 'none')
  await expect(card('Pinned')).not.toHaveCSS('touch-action', 'none')
  const cdp = await page.context().newCDPSession(page)
  const start = boxCenter((await card('Alpha').boundingBox())!)
  await touch(cdp, 'touchStart', [{ ...start, id: 1 }])
  await touch(cdp, 'touchEnd', [])
  await expect.poll(async () => (await lines()).map(line => line[0])).toEqual(['select', 'activate'])
  // A drag that the system cancels (an incoming call, a gesture it takes over) ends without a proposal.
  await touch(cdp, 'touchStart', [{ ...start, id: 1 }])
  for (let step = 1; step <= 5; step++) await touch(cdp, 'touchMove', [{ x: start.x + step * 30, y: start.y + step * 4, id: 1 }])
  await expect(board.locator('.vw-board-drop')).toHaveCount(1)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] })
  await expect.poll(async () => (await lines()).map(line => line[0])).toEqual(['select', 'activate', 'cancel'])
  expect((await lines())[2]).toEqual(['cancel', 'alpha', 'pointer-cancel', 'pointer'])
  await expect(board.locator('.vw-board-drop')).toHaveCount(0)
  expect(errors).toEqual([])
})
