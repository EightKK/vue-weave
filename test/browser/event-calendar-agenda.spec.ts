// EventCalendar agenda view and touch input, in the "Event calendar" demo (UTC, Wednesday, November 11, 2026, hours 7 to
// 20 at 48 px per hour, in a 440 px time grid). The touch tests drive real touch input through the Chrome DevTools
// Protocol, so the browser applies `touch-action`, scrolls and fires the click of a tap.
import { expect, test, openExample, pageErrors, realTouchChromiumOnly, touch, type Page } from './support'

async function openCalendar(page: Page) {
  const errors = pageErrors(page)
  await openExample(page, 'event-calendar')
  const calendar = page.getByRole('region', { name: 'Room bookings', exact: true })
  await expect(calendar).toBeVisible()
  await calendar.evaluate(element => element.scrollIntoView({ block: 'center' }))
  const status = page.getByRole('status', { name: 'Calendar status', exact: true })
  const event = (name: string) => calendar.getByRole('button', { name: new RegExp('^' + name + ',') })
  const button = (name: string) => calendar.getByRole('button', { name, exact: true })
  return { errors, calendar, status, event, button }
}

test('the agenda lists the week by day, with all-day, multi-day and recurring events, and navigates', async ({ page }) => {
  const { errors, calendar, button } = await openCalendar(page)
  await button('Agenda').click()
  await expect(button('Agenda')).toHaveAttribute('aria-pressed', 'true')
  const agenda = calendar.getByRole('list', { name: 'Agenda', exact: true })
  await expect(agenda).toBeVisible()
  await expect(calendar.locator('.vw-calendar-title')).toHaveText(/^Nov 9 – 15, 2026$/)
  // Days with bookings only: Monday to Saturday (the migration runs from Friday night into Saturday).
  await expect(agenda.locator(':scope > li')).toHaveCount(6)
  const tuesday = calendar.getByRole('list', { name: 'Tuesday, November 10, 2026', exact: true })
  await expect(tuesday.getByRole('button')).toHaveText([/^All day\s*Lab audit/, /^16:00–16:30\s*Weekly sync/])
  await expect(tuesday.getByRole('button', { name: 'Weekly sync, Tue, Nov 10 16:00–16:30, Borealis, Recurring', exact: true })).toBeVisible()
  const friday = calendar.getByRole('list', { name: 'Friday, November 13, 2026', exact: true })
  await expect(friday.getByRole('button')).toHaveText([/^All day\s*Release day/, /^11:00–12:00\s*Retrospective/, /^18:00–\s*Server migration/])
  const saturday = calendar.getByRole('list', { name: 'Saturday, November 14, 2026', exact: true })
  await expect(saturday.getByRole('button', { name: 'Server migration, Fri, Nov 13 18:00 – Sat, Nov 14 09:00, Hardware lab', exact: true })).toHaveText(/^–09:00/)
  await expect(calendar.locator('.vw-calendar-handle')).toHaveCount(0)

  await button('Next').click()
  await expect(calendar.locator('.vw-calendar-title')).toHaveText(/^Nov 16 – 22, 2026$/)
  await expect(page.getByText(/^Loaded range: Mon, Nov 16 – Sun, Nov 22\./)).toBeVisible()
  // The series is expanded for the newly loaded range.
  await expect(calendar.getByRole('button', { name: 'Weekly sync, Tue, Nov 17 16:00–16:30, Borealis, Recurring', exact: true })).toBeVisible()
  await expect(calendar.getByRole('list', { name: 'Wednesday, November 18, 2026', exact: true }).getByRole('button')).toHaveText([/^All day\s*Team offsite/])

  // Right to left keeps the list and its names.
  await page.getByLabel('Right to left', { exact: true }).check()
  await expect(calendar).toHaveAttribute('dir', 'rtl')
  await expect(calendar.getByRole('list', { name: 'Tuesday, November 17, 2026', exact: true })).toBeVisible()
  await button('Week').click()
  await expect(calendar.getByRole('list', { name: 'Agenda', exact: true })).toHaveCount(0)
  expect(errors).toEqual([])
})

test('agenda entries select by click and Space, open by double click and Enter, and arrow keys move focus and events', async ({ page }) => {
  const { errors, calendar, status, event, button } = await openCalendar(page)
  await button('Agenda').click()
  const standup = event('Standup')
  await standup.click()
  await expect(standup).toHaveAttribute('aria-pressed', 'true')
  await expect(status).toHaveText('Selected Standup.')
  await event('Lab safety').dblclick()
  await expect(status).toHaveText('Opened Lab safety (Facilities), Wed, Nov 11 13:00–14:00, Hardware lab.')

  await standup.focus()
  await page.keyboard.press('ArrowDown')
  await expect(event('Lab audit')).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(event('Weekly sync')).toBeFocused()
  await page.keyboard.press('ArrowUp')
  await expect(event('Lab audit')).toBeFocused()
  await page.keyboard.press('End')
  await expect(calendar.getByRole('list', { name: 'Saturday, November 14, 2026', exact: true }).getByRole('button')).toBeFocused()
  await page.keyboard.press('Home')
  await expect(standup).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(status).toHaveText('Opened Standup (Platform), Mon, Nov 9 09:00–09:30, Atlas.')

  // Right moves the event to the next day; it is listed there and keeps the focus.
  const review = event('Design review')
  await review.focus()
  await page.keyboard.press('Space')
  await expect(review).toHaveAttribute('aria-pressed', 'true')
  await page.keyboard.press('ArrowRight')
  await expect(status).toHaveText('Design review → Thu, Nov 12 10:00–11:00.')
  const thursday = calendar.getByRole('list', { name: 'Thursday, November 12, 2026', exact: true })
  await expect(thursday.getByRole('button', { name: 'Design review, Thu, Nov 12 10:00–11:00, Atlas', exact: true })).toBeFocused()
  // Not editable: the lab audit does not move.
  await event('Lab audit').focus()
  await page.keyboard.press('ArrowRight')
  await expect(status).toHaveText('Design review → Thu, Nov 12 10:00–11:00.')
  expect(errors).toEqual([])
})

test('touch: a swipe on empty time grid scrolls it without a proposal or a cancel, and a tap books a slot without selecting it', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', realTouchChromiumOnly)
  const { errors, calendar, status } = await openCalendar(page)
  const cdp = await page.context().newCDPSession(page)
  const scroller = calendar.locator('.vw-calendar-scroll')
  // Sunday, November 15 has no bookings.
  const sunday = calendar.locator('.vw-calendar-column').nth(6)
  const column = (await sunday.boundingBox())!
  const x = column.x + column.width / 2
  await touch(cdp, 'touchStart', [{ x, y: column.y + 2 * 48 + 10, id: 1 }])
  await touch(cdp, 'touchEnd', [])
  await expect(status).toHaveText('Booked New booking 1, Sun, Nov 15 09:00–10:00.')
  // The click of the tap lands on the new booking, now drawn under the finger, and selects nothing.
  const booking = calendar.getByRole('button', { name: 'New booking 1, Sun, Nov 15 09:00–10:00', exact: true })
  await expect(booking).toBeVisible()
  await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 100)))
  await expect(booking).toHaveAttribute('aria-pressed', 'false')
  await expect(status).toHaveText('Booked New booking 1, Sun, Nov 15 09:00–10:00.')

  // A swipe that starts on empty space scrolls the grid; it books nothing and reports no cancelled edit.
  const before = await status.textContent()
  const start = (await scroller.boundingBox())!.y + 300
  await touch(cdp, 'touchStart', [{ x, y: start, id: 1 }])
  for (let step = 1; step <= 8; step++) await touch(cdp, 'touchMove', [{ x, y: start - step * 15, id: 1 }])
  await touch(cdp, 'touchEnd', [])
  await expect.poll(() => scroller.evaluate(element => element.scrollTop)).toBeGreaterThan(40)
  await expect(calendar.locator('.vw-calendar-preview')).toHaveCount(0)
  await expect(status).toHaveText(before!)
  expect(errors).toEqual([])
})

test('touch: a long press on empty space drags to create, without scrolling', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', realTouchChromiumOnly)
  const { errors, calendar, status } = await openCalendar(page)
  const cdp = await page.context().newCDPSession(page)
  const scroller = calendar.locator('.vw-calendar-scroll')
  const sunday = (await calendar.locator('.vw-calendar-column').nth(6).boundingBox())!
  const x = sunday.x + sunday.width / 2
  // 13:00 on Sunday, six hours below the top of the grid at 07:00.
  const y = sunday.y + 6 * 48 + 5
  await touch(cdp, 'touchStart', [{ x, y, id: 1 }])
  const preview = calendar.locator('.vw-calendar-preview')
  await expect(preview).toHaveText('13:00–14:00')
  const scrollTop = await scroller.evaluate(element => element.scrollTop)
  for (let step = 1; step <= 8; step++) await touch(cdp, 'touchMove', [{ x, y: y + step * 12, id: 1 }])
  await expect(preview).toHaveText('13:00–15:15')
  await touch(cdp, 'touchEnd', [])
  await expect(status).toHaveText('Booked New booking 1, Sun, Nov 15 13:00–15:15.')
  expect(await scroller.evaluate(element => element.scrollTop)).toBe(scrollTop)
  expect(errors).toEqual([])
})

test('touch: a touch near the edge of an event resizes it, elsewhere it moves it, and agenda entries select by tap', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', realTouchChromiumOnly)
  const { errors, calendar, status, event, button } = await openCalendar(page)
  const cdp = await page.context().newCDPSession(page)
  const drag = async (from: { x: number; y: number }, dx: number, dy: number) => {
    await touch(cdp, 'touchStart', [{ ...from, id: 1 }])
    for (let step = 1; step <= 8; step++) await touch(cdp, 'touchMove', [{ x: from.x + dx * step / 8, y: from.y + dy * step / 8, id: 1 }])
    await touch(cdp, 'touchEnd', [])
  }
  // Customer call, 10:30–12:00, is 72 px tall: 10 px above its bottom edge is outside the 6 px mouse handle but within
  // touch reach of it.
  let call = (await event('Customer call').boundingBox())!
  await drag({ x: call.x + call.width / 2, y: call.y + call.height - 10 }, 0, 48)
  await expect(status).toHaveText('Customer call → Wed, Nov 11 10:30–13:00.')
  call = (await event('Customer call').boundingBox())!
  await drag({ x: call.x + call.width / 2, y: call.y + 10 }, 0, -24)
  await expect(status).toHaveText('Customer call → Wed, Nov 11 10:00–13:00.')
  // The middle of the event moves it.
  call = (await event('Customer call').boundingBox())!
  await drag({ x: call.x + call.width / 2, y: call.y + call.height / 2 }, 0, 48)
  await expect(status).toHaveText('Customer call → Wed, Nov 11 11:00–14:00.')

  await button('Agenda').click()
  const sprint = event('Sprint demo')
  const box = (await sprint.boundingBox())!
  await touch(cdp, 'touchStart', [{ x: box.x + box.width / 2, y: box.y + box.height / 2, id: 1 }])
  await touch(cdp, 'touchEnd', [])
  await expect(sprint).toHaveAttribute('aria-pressed', 'true')
  await expect(status).toHaveText('Selected Sprint demo.')
  expect(errors).toEqual([])
})
