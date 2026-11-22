// The construction program showcase: scheduler-driven KPIs, the steel-delay what-if, resource leveling and controlled
// bar edits that are rescheduled.
import { expect, test, openExample, pageErrors } from './support'

test('construction program showcase reports the plan, the steel what-if and leveling', async ({ page }) => {
  const errors = pageErrors(page)
  await openExample(page, 'construction', { kind: 'showcase' })
  const showcase = page.getByRole('region', { name: 'Construction program', exact: true })
  // The zoom percentage is an <output>, which also has the status role; the showcase status line comes last.
  const status = showcase.getByRole('status').last()
  const handover = showcase.getByRole('group', { name: 'Forecast handover', exact: true })
  const overAllocation = showcase.getByRole('group', { name: 'Crew over-allocation', exact: true })

  await expect(showcase.getByRole('heading', { name: 'Construction program', level: 2 })).toBeVisible()
  await expect(handover).toContainText('23 Mar 2027')
  await expect(handover).toContainText('+4 wd vs baseline')
  await expect(handover).toContainText('6 wd margin to contract 31 Mar')
  await expect(showcase.getByRole('group', { name: 'Schedule performance', exact: true })).toContainText('0.91')
  await expect(showcase.getByRole('group', { name: 'Cost performance', exact: true })).toContainText('0.96')
  await expect(overAllocation.locator('strong')).toHaveText('33')
  await expect(showcase.getByRole('img', { name: 'Cumulative cost S-curve' })).toBeVisible()
  await expect(showcase.locator('.vw-gantt-load-segment.vw-is-overloaded')).not.toHaveCount(0)

  // What-if: ten more working days of steel delivery push the handover past the contract date.
  const whatIf = showcase.getByRole('checkbox', { name: 'What-if: delay steel delivery +10 working days' })
  await whatIf.check()
  await expect(handover).toContainText('1 Apr 2027')
  await expect(handover).toContainText('what-if +7 wd')
  await expect(handover).toContainText('1 wd past contract 31 Mar')
  await expect(status).toContainText('Practical completion 1 Apr 2027 (+7 wd).')
  await whatIf.uncheck()
  await expect(handover).toContainText('23 Mar 2027')

  // Leveling delays the plant and the lobby until crews are free; no over-allocation remains.
  await showcase.getByRole('button', { name: 'Level resources', exact: true }).click()
  await expect(status).toHaveText('Levelled: Rooftop plant & risers and Lobby & public realm wait for free crews. Practical completion 31 Mar 2027 (+6 wd).')
  await expect(handover).toContainText('31 Mar 2027')
  await expect(handover).toContainText('0 wd margin to contract 31 Mar')
  await expect(overAllocation.locator('strong')).toHaveText('0')
  await expect(showcase.locator('.vw-gantt-load-segment.vw-is-overloaded')).toHaveCount(0)
  await expect(showcase.getByRole('button', { name: 'Resources levelled', exact: true })).toBeDisabled()

  await showcase.getByRole('button', { name: 'Reset', exact: true }).click()
  await expect(handover).toContainText('23 Mar 2027')
  expect(errors).toEqual([])
})

test('construction program showcase reschedules a keyboard bar move and refuses a started task', async ({ page }) => {
  const errors = pageErrors(page)
  await openExample(page, 'construction', { kind: 'showcase' })
  const showcase = page.getByRole('region', { name: 'Construction program', exact: true })
  const status = showcase.getByRole('status').last()

  // Level 6 has three days of float: a one-day move is rescheduled without moving the handover.
  await showcase.getByRole('button', { name: 'Level 6 frame & deck 12 Oct–22 Oct', exact: true }).press('ArrowRight')
  await expect(showcase.getByRole('button', { name: 'Level 6 frame & deck 13 Oct–23 Oct', exact: true })).toBeVisible()
  await expect(status).toHaveText('Level 6 frame & deck starts 13 Oct. Practical completion 23 Mar 2027 (no change).')
  // Its successor follows through the finish-to-start link.
  await expect(showcase.getByRole('button', { name: /^Level 7 frame & deck 23 Oct–/ })).toBeVisible()

  // Level 3 has started, so the edit is rejected and the plan stays as it is.
  await showcase.getByRole('button', { name: /^Level 3 frame & deck 21 Aug–/ }).press('ArrowRight')
  await expect(status).toHaveText('Level 3 frame & deck has started; report progress instead of moving it.')
  await expect(showcase.getByRole('button', { name: /^Level 3 frame & deck 21 Aug–/ })).toBeVisible()
  expect(errors).toEqual([])
})
