// EventCalendar: view switching and navigation, pointer moves, resizes and creation, keyboard edits, cancellation and
// rejected proposals, in the "Event calendar" demo (UTC, Wednesday, November 11, 2026, hours 7 to 20 at 48 px per hour).
import { expect, test, openDemo, pageErrors, serveFixture, type Page } from './support'

async function openCalendar(page: Page) {
  const errors = pageErrors(page)
  await openDemo(page, 'Event calendar')
  const calendar = page.getByRole('region', { name: 'Room bookings', exact: true })
  await expect(calendar).toBeVisible()
  const status = page.getByRole('status', { name: 'Calendar status', exact: true })
  const event = (name: string | RegExp) => calendar.getByRole('button', { name: typeof name === 'string' ? new RegExp('^' + name + ',') : name })
  const button = (name: string) => calendar.getByRole('button', { name, exact: true })
  return { errors, calendar, status, event, button }
}

/** Press at the middle of a box (plus an offset), move by (dx, dy) in steps and release. */
async function drag(page: Page, box: { x: number; y: number; width: number; height: number }, dx: number, dy: number, offsetY?: number) {
  const x = box.x + box.width / 2, y = box.y + (offsetY ?? box.height / 2)
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + dx, y + dy, { steps: 8 })
  await page.mouse.up()
}

test('the toolbar switches views and navigates, and month days open the day view', async ({ page }) => {
  const { errors, calendar, button } = await openCalendar(page)
  const title = calendar.locator('.vw-calendar-title')
  await expect(title).toHaveText(/^Nov 9\s–\s15, 2026$/)
  await expect(button('Week')).toHaveAttribute('aria-pressed', 'true')
  await button('Next').click()
  await expect(title).toHaveText(/^Nov 16\s–\s22, 2026$/)
  await expect(page.getByText(/^Loaded range: Mon, Nov 16 – Sun, Nov 22\./)).toBeVisible()
  await expect(calendar.getByRole('button', { name: /^Team offsite, Tue, Nov 17 – Wed, Nov 18, All day$/ })).toBeVisible()
  await button('Today').click()
  await expect(title).toHaveText(/^Nov 9\s–\s15, 2026$/)

  await button('Month').click()
  await expect(button('Month')).toHaveAttribute('aria-pressed', 'true')
  await expect(title).toHaveText('November 2026')
  await button('Next').click()
  await expect(title).toHaveText('December 2026')
  // The title is announced in the live region after navigation.
  await expect(calendar.locator('[aria-live="polite"]')).toHaveText('December 2026')
  await button('Previous').click()
  await expect(title).toHaveText('November 2026')
  await button('Show day Thursday, November 12, 2026').click()
  await expect(button('Day')).toHaveAttribute('aria-pressed', 'true')
  await expect(title).toHaveText('Thursday, November 12, 2026')
  await expect(calendar.getByText('Hardware lab', { exact: true })).toBeVisible()
  await expect(calendar.getByRole('button', { name: 'Sprint demo, Thu, Nov 12 15:00–16:30, Borealis', exact: true })).toBeVisible()
  expect(errors).toEqual([])
})

test('pointer drags move and resize events, and Escape cancels a drag', async ({ page }) => {
  const { errors, calendar, status, event } = await openCalendar(page)
  const review = (await event('Design review').boundingBox())!
  const safety = (await event('Lab safety').boundingBox())!
  const sprint = (await event('Sprint demo').boundingBox())!
  const columnWidth = sprint.x - safety.x
  // One column to the right and one hour down: Wednesday 10:00 becomes Thursday 11:00.
  await drag(page, review, columnWidth, 48)
  await expect(status).toHaveText('Design review → Thu, Nov 12 11:00–12:00.')
  await expect(calendar.getByRole('button', { name: 'Design review, Thu, Nov 12 11:00–12:00, Atlas', exact: true })).toBeVisible()

  // The bottom edge resizes the end by whole 15-minute steps.
  const call = event('Customer call')
  const handle = (await call.locator('.vw-calendar-handle.vw-is-end').boundingBox())!
  await drag(page, handle, 0, 24)
  await expect(status).toHaveText('Customer call → Wed, Nov 11 10:30–12:30.')
  const top = (await call.locator('.vw-calendar-handle.vw-is-start').boundingBox())!
  await drag(page, top, 0, -24)
  await expect(status).toHaveText('Customer call → Wed, Nov 11 10:00–12:30.')

  // Escape during a drag discards the preview without a proposal.
  const box = (await event('Sprint demo').boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + 20)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2, box.y + 120, { steps: 6 })
  await expect(calendar.locator('.vw-calendar-preview')).toHaveText('Sprint demo 17:00–18:30')
  await page.keyboard.press('Escape')
  await expect(calendar.locator('.vw-calendar-preview')).toHaveCount(0)
  await page.mouse.up()
  await expect(status).toHaveText('Drag cancelled.')
  await expect(calendar.getByRole('button', { name: 'Sprint demo, Thu, Nov 12 15:00–16:30, Borealis', exact: true })).toBeVisible()
  expect(errors).toEqual([])
})

test('arrow keys move and resize the focused event, which keeps the focus', async ({ page }) => {
  const { errors, calendar, status, event, button } = await openCalendar(page)
  await event('Lab safety').focus()
  await page.keyboard.press('ArrowDown')
  await expect(status).toHaveText('Lab safety → Wed, Nov 11 13:15–14:15.')
  const moved = calendar.getByRole('button', { name: 'Lab safety, Wed, Nov 11 13:15–14:15, Hardware lab', exact: true })
  await expect(moved).toBeFocused()
  await page.keyboard.press('Shift+ArrowDown')
  await expect(status).toHaveText('Lab safety → Wed, Nov 11 13:15–14:30.')
  await page.keyboard.press('ArrowRight')
  await expect(status).toHaveText('Lab safety → Thu, Nov 12 13:15–14:30.')
  await expect(calendar.getByRole('button', { name: 'Lab safety, Thu, Nov 12 13:15–14:30, Hardware lab', exact: true })).toBeFocused()

  // All-day events move by whole days in the month view, whose hint names both directions.
  await button('Month').click()
  await expect(event('Release day')).toHaveAccessibleDescription(/Left and Right arrows move the event by a day, Up and Down by a week/)
  await event('Release day').focus()
  await page.keyboard.press('ArrowRight')
  await expect(status).toHaveText('Release day → Sat, Nov 14.')
  await page.keyboard.press('ArrowDown')
  await expect(status).toHaveText('Release day → Sat, Nov 21.')
  // Enter opens the event.
  await page.keyboard.press('Enter')
  await expect(status).toHaveText('Opened Release day (Platform), Sat, Nov 21.')
  expect(errors).toEqual([])
})

test('validateEdit and validateCreate reject double bookings of a room', async ({ page }) => {
  const { errors, calendar, status, event, button } = await openCalendar(page)
  await button('Day').click()
  // Atlas to Borealis by keyboard: Borealis holds the customer call at 10:30.
  await event('Design review').focus()
  await page.keyboard.press('ArrowRight')
  await expect(status).toHaveText('Rejected: Borealis is already booked for Customer call.')
  await expect(calendar.locator('[aria-live="polite"]')).toHaveText('Borealis is already booked for Customer call.')
  await expect(calendar.getByRole('button', { name: 'Design review, Wed, Nov 11 10:00–11:00, Atlas', exact: true })).toBeFocused()
  // The lab safety course moves by pointer to the Atlas room at 10:30, over the design review.
  const safety = (await event('Lab safety').boundingBox())!
  const review = (await event('Design review').boundingBox())!
  await drag(page, safety, review.x - safety.x, -120)
  await expect(status).toHaveText('Rejected: Atlas is already booked for Design review.')
  await expect(calendar.getByRole('button', { name: 'Lab safety, Wed, Nov 11 13:00–14:00, Hardware lab', exact: true })).toBeVisible()
  // Moving it into Atlas after the review is accepted as a room change.
  await drag(page, safety, review.x - safety.x, 0)
  await expect(status).toHaveText('Lab safety → Wed, Nov 11 13:00–14:00 in Atlas.')
  expect(errors).toEqual([])
})

test('dragging over empty time proposes a new event, and a click books the default duration', async ({ page }) => {
  const { errors, calendar, status, event, button } = await openCalendar(page)
  await button('Day').click()
  const safety = (await event('Lab safety').boundingBox())!
  // From 15:00 (two hours below the lab safety course at 13:00) to just before 16:00 in the lab column.
  const x = safety.x + safety.width / 2, y = safety.y + 96 + 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x, y + 44, { steps: 6 })
  await expect(calendar.locator('.vw-calendar-preview')).toHaveText('15:00–16:00')
  await page.mouse.up()
  await expect(status).toHaveText('Booked New booking 1, Wed, Nov 11 15:00–16:00 in Hardware lab.')
  await expect(calendar.getByRole('button', { name: 'New booking 1, Wed, Nov 11 15:00–16:00, Hardware lab', exact: true })).toBeVisible()

  // A booking over the design review in Atlas is rejected.
  const review = (await event('Design review').boundingBox())!
  await page.mouse.move(review.x + review.width / 2, review.y + review.height + 30)
  await page.mouse.down()
  await page.mouse.move(review.x + review.width / 2, review.y + review.height - 10, { steps: 4 })
  await page.mouse.up()
  await expect(status).toHaveText('Rejected: Atlas is already booked for Design review.')

  // A click without a drag proposes one hour (four snap steps) from the slot under the pointer; the end is exclusive,
  // so it may end when the lab safety course starts.
  await page.mouse.click(x, y - 3 * 48)
  await expect(status).toHaveText('Booked New booking 2, Wed, Nov 11 12:00–13:00 in Hardware lab.')

  // In the month view a drag across days proposes an all-day event.
  await button('Month').click()
  // The grid starts on Monday, October 26: cell 24 is Thursday, November 19 and cell 26 Saturday, November 21.
  const thursday = calendar.locator('[data-vw-cell="24"]')
  const saturday = (await calendar.locator('[data-vw-cell="26"]').boundingBox())!
  const from = (await thursday.boundingBox())!
  await page.mouse.move(from.x + from.width / 2, from.y + from.height - 12)
  await page.mouse.down()
  await page.mouse.move(saturday.x + saturday.width / 2, saturday.y + saturday.height - 12, { steps: 6 })
  await page.mouse.up()
  await expect(status).toHaveText('Booked New booking 3, Thu, Nov 19.')
  await expect(calendar.getByRole('button', { name: 'New booking 3, Thu, Nov 19 – Sat, Nov 21, All day', exact: true })).toBeVisible()
  expect(errors).toEqual([])
})

test('the month view does not resize a timed event by whole days, and events continued from earlier days keep a Tab stop', async ({ page }) => {
  const { errors, calendar, status, event, button } = await openCalendar(page)
  await button('Month').click()
  await event('Design review').focus()
  await page.keyboard.press('Shift+ArrowLeft')
  await page.keyboard.press('Shift+ArrowRight')
  // A plain move afterwards still starts from the original times, so neither resize was proposed.
  await page.keyboard.press('ArrowRight')
  await expect(status).toHaveText('Design review → Thu, Nov 12 10:00–11:00.')
  await expect(calendar.getByRole('button', { name: 'Design review, Thu, Nov 12 10:00–11:00, Atlas', exact: true })).toBeFocused()

  // Saturday's day view shows the overnight migration that started on Friday; Wednesday, Nov 18 shows the offsite that
  // started on Tuesday. Each is the only element of its event and takes the Tab stop.
  await button('Day').click()
  for (let i = 0; i < 3; i++) await button('Next').click()
  await expect(event('Server migration')).toHaveAttribute('tabindex', '0')
  // Events without a room show only in the plain day view.
  await page.getByRole('checkbox', { name: 'Rooms in day view' }).uncheck()
  for (let i = 0; i < 4; i++) await button('Next').click()
  await expect(event('Team offsite')).toHaveAttribute('tabindex', '0')
  await event('Team offsite').focus()
  await page.keyboard.press('Shift+Tab')
  await page.keyboard.press('Tab')
  await expect(event('Team offsite')).toBeFocused()
  expect(errors).toEqual([])
})

test('occurrences of a recurring series render, and an edit carries the occurrence to the chosen scope', async ({ page }) => {
  const { errors, calendar, status, button } = await openCalendar(page)
  const sync = (date: string, time: string) => calendar.getByRole('button', { name: `Weekly sync, Tue, Nov ${date} ${time}, Borealis, Recurring`, exact: true })
  // The weekly sync repeats every Tuesday; other events keep their names.
  await expect(sync('10', '16:00–16:30')).toBeVisible()
  await expect(calendar.getByRole('button', { name: 'Customer call, Wed, Nov 11 10:30–12:00, Borealis', exact: true })).toBeVisible()

  // "This event" moves one occurrence; the parent turns the proposal into an override, which keeps the focus.
  await sync('10', '16:00–16:30').focus()
  await page.keyboard.press('ArrowDown')
  await expect(status).toHaveText('Weekly sync → Tue, Nov 10 16:15–16:45 (this event).')
  await expect(sync('10', '16:15–16:45')).toBeFocused()
  await button('Next').click()
  await expect(sync('17', '16:00–16:30')).toBeVisible()

  // "All events" moves the whole series, including the earlier override's original time.
  await page.getByRole('combobox', { name: 'Recurring edits' }).selectOption('series')
  await sync('17', '16:00–16:30').focus()
  await page.keyboard.press('ArrowDown')
  await expect(status).toHaveText('Weekly sync → Tue, Nov 17 16:15–16:45 (all events).')
  await expect(sync('17', '16:15–16:45')).toBeVisible()
  await button('Next').click()
  await expect(sync('24', '16:15–16:45')).toBeVisible()
  expect(errors).toEqual([])
})

test('a rejected keyboard edit does not take the focus back after a later change', async ({ page }) => {
  const { errors, calendar, status, event, button } = await openCalendar(page)
  await button('Day').click()
  await event('Design review').focus()
  await page.keyboard.press('ArrowRight')
  await expect(status).toHaveText('Rejected: Borealis is already booked for Customer call.')
  // A pointer move of another event changes the events; the focus stays with that event.
  const safety = (await event('Lab safety').boundingBox())!
  await drag(page, safety, 0, 48)
  await expect(status).toHaveText('Lab safety → Wed, Nov 11 14:00–15:00.')
  await expect(calendar.getByRole('button', { name: 'Lab safety, Wed, Nov 11 14:00–15:00, Hardware lab', exact: true })).toBeFocused()
  expect(errors).toEqual([])
})

/** The regression fixture: a day view of one event with buttons that cancel through the API and replace the events. */
async function openCalendarFixture(page: Page) {
  const errors = pageErrors(page)
  await serveFixture(page, 'board-calendar-test', 'board-calendar.html')
  await page.goto('/board-calendar-test/')
  const section = page.getByRole('region', { name: 'Calendar fixture', exact: true })
  const calendar = section.getByRole('region', { name: 'Fixture calendar', exact: true })
  await expect(calendar).toBeVisible()
  return {
    errors,
    review: calendar.getByRole('button', { name: /^Review, Wed, Nov 11 10:00–11:00$/ }),
    control: (name: string) => section.getByRole('button', { name, exact: true }),
    log: section.getByRole('status', { name: 'Calendar log', exact: true }),
  }
}

test('cancelEdit(), new events and pointer cancellation end a drag with their reasons and no proposal', async ({ page }) => {
  const { errors, review, control, log } = await openCalendarFixture(page)
  const box = (await review.boundingBox())!
  const press = async () => {
    await page.mouse.move(box.x + box.width / 2, box.y + 10)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width / 2, box.y + 30, { steps: 4 })
  }
  // The exposed method; the release afterwards neither proposes nor selects.
  await press()
  await control('Cancel edit').dispatchEvent('click')
  await expect(log).toHaveText('cancel review api')
  await page.mouse.up()
  await expect(log).toHaveText('cancel review api')
  // New events while the button is held.
  await press()
  await control('Replace events').dispatchEvent('click')
  await expect(log).toHaveText('cancel review source-changed')
  await page.mouse.up()
  await expect(log).toHaveText('cancel review source-changed')
  // A cancelled pointer (as when a touch turns into a scroll) has no release; the next Space still selects.
  await review.evaluate((element: HTMLElement) => {
    const rect = element.getBoundingClientRect()
    const init = { bubbles: true, cancelable: true, pointerId: 9, pointerType: 'touch', isPrimary: true, button: 0, clientX: rect.x + 10, clientY: rect.y + 10 }
    element.dispatchEvent(new PointerEvent('pointerdown', init))
    element.dispatchEvent(new PointerEvent('pointermove', { ...init, clientY: rect.y + 40 }))
    element.dispatchEvent(new PointerEvent('pointercancel', { ...init, clientY: rect.y + 40 }))
  })
  await expect(log).toHaveText('cancel review pointer-cancel')
  await review.focus()
  await page.keyboard.press('Space')
  await expect(log).toHaveText('select review')
  expect(errors).toEqual([])
})
