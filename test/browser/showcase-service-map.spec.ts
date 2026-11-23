// The service map showcase of the design gallery: a simulated service topology with nested collapsible groups, an
// incident scenario whose blast radius comes from traverseGraph, a service panel and a linked incident timeline.
import type { Page } from '@playwright/test'
import { expect, test, openExample, pageErrors } from './support'

async function openServiceMap(page: Page) {
  await openExample(page, 'service-map', { kind: 'showcase' })
  const showcase = page.getByRole('region', { name: 'Service map', exact: true })
  await expect(showcase.getByRole('heading', { name: 'Service map', exact: true })).toBeVisible()
  // The zoom percentage is an <output>, which also has the status role.
  const status = (text: string) => showcase.getByRole('status').filter({ hasText: text })
  const map = showcase.getByLabel('Service topology', { exact: true })
  // Node names are the service name and its health; the timeline's row headings name the alert count instead.
  const service = (name: string) => map.getByRole('button', { name, exact: true })
  return { showcase, status, service, map }
}

test('the service map showcase starts paused in a deterministic state and streams metrics when live', async ({ page }) => {
  const errors = pageErrors(page)
  const { showcase, status, service, map } = await openServiceMap(page)
  await expect(map).toBeVisible()
  await expect(showcase.locator('.vw-network-node')).toHaveCount(22)
  await expect(status('Paused at 14:30:00 UTC')).toBeVisible()
  await expect(service('Recommender Degraded')).toBeVisible()
  await expect(service('Checkout Healthy')).toBeVisible()
  await expect(showcase.locator('.vw-network-node.vw-is-highlighted')).toHaveCount(0)
  // The incident timeline lists the open recommender alert up to the simulated now.
  const timeline = showcase.getByRole('region', { name: 'Incident timeline', exact: true })
  await expect(timeline.getByRole('button', { name: 'Error rate 1.6% 14:21–14:30', exact: true })).toBeVisible()

  const clock = showcase.locator('.sc-svc-clock')
  await expect(clock).toHaveText('14:30:00 UTC')
  const live = showcase.getByRole('button', { name: 'Live', exact: true })
  await expect(live).toHaveAttribute('aria-pressed', 'false')
  await live.click()
  await expect(live).toHaveAttribute('aria-pressed', 'true')
  await expect(clock).not.toHaveText('14:30:00 UTC', { timeout: 5000 })
  await live.click()
  await expect(live).toHaveAttribute('aria-pressed', 'false')
  expect(errors).toEqual([])
})

test('the service map incident marks every upstream service of the payments database and failover contains it', async ({ page }) => {
  const errors = pageErrors(page)
  const { showcase, status, service } = await openServiceMap(page)
  const incident = showcase.getByRole('button', { name: 'Incident: payments DB latency', exact: true })
  await incident.click()
  await expect(incident).toBeDisabled()
  await expect(status('Blast radius: 5 upstream services degraded (Payments, Checkout, API gateway, Web app, Mobile BFF).')).toBeVisible()
  await expect(service('Payments DB Critical')).toBeVisible()
  await expect(service('Payments Critical')).toBeVisible()
  for (const name of ['Checkout', 'API gateway', 'Web app', 'Mobile BFF']) await expect(service(name + ' Degraded')).toBeVisible()
  // Services outside the blast radius keep their state.
  await expect(service('Search Healthy')).toBeVisible()
  await expect(service('EU checkout Healthy')).toBeVisible()
  await expect(showcase.locator('.vw-network-node.vw-is-highlighted')).toHaveCount(6)
  const timeline = showcase.getByRole('region', { name: 'Incident timeline', exact: true })
  await expect(timeline.getByRole('button', { name: /^Errors 7% / })).toBeVisible()

  await showcase.getByRole('button', { name: 'Failover to eu-west', exact: true }).click()
  await expect(status('Failed over Payments to the promoted eu-west-1 replica')).toBeVisible()
  await expect(service('Checkout Healthy')).toBeVisible()
  await expect(service('API gateway Healthy')).toBeVisible()
  await expect(showcase.locator('.vw-network-node.vw-is-highlighted')).toHaveCount(1)
  await expect(showcase.locator('.sc-svc-edge-failover')).toHaveCount(1)

  await showcase.getByRole('button', { name: 'Reset', exact: true }).click()
  await expect(status('Reset to 14:30:00 UTC')).toBeVisible()
  await expect(incident).toBeEnabled()
  await expect(service('Payments DB Healthy')).toBeVisible()
  await expect(showcase.locator('.sc-svc-edge-failover')).toHaveCount(0)
  expect(errors).toEqual([])
})

test('selecting a service on the map opens its panel and traces its dependency chain', async ({ page }) => {
  const errors = pageErrors(page)
  const { showcase, status, service } = await openServiceMap(page)
  const panel = showcase.getByRole('complementary', { name: 'Service details', exact: true })
  await expect(panel.getByRole('heading', { name: 'Needs attention', exact: true })).toBeVisible()

  await service('Checkout Healthy').click()
  await expect(service('Checkout Healthy')).toHaveAttribute('aria-pressed', 'true')
  await expect(panel.getByRole('heading', { name: 'Checkout', exact: true })).toBeVisible()
  await expect(status('Checkout: Healthy')).toBeVisible()
  await expect(status('1 caller, 3 dependencies.')).toBeVisible()
  await expect(panel.getByRole('list', { name: 'Called by', exact: true }).getByRole('button')).toHaveText([/^API gateway\d+\/s$/])
  const calls = panel.getByRole('list', { name: 'Calls', exact: true }).getByRole('button')
  await expect(calls).toHaveCount(3)
  // Services that are neither upstream nor downstream of Checkout are dimmed.
  await expect(showcase.locator('.vw-network-node.vw-dimmed')).toHaveCount(8)
  await expect(showcase.getByText('Checkout and its dependency chain')).toBeVisible()

  await calls.filter({ hasText: 'Payments' }).click()
  await expect(panel.getByRole('heading', { name: 'Payments', exact: true })).toBeVisible()
  await expect(service('Payments Healthy')).toHaveAttribute('aria-pressed', 'true')
  await panel.getByRole('button', { name: 'Clear selection', exact: true }).click()
  await expect(panel.getByRole('heading', { name: 'Needs attention', exact: true })).toBeVisible()
  await expect(showcase.locator('.vw-network-node.vw-dimmed')).toHaveCount(0)
  expect(errors).toEqual([])
})

test('collapsing a namespace group of the service map replaces its services with one node', async ({ page }) => {
  const errors = pageErrors(page)
  const { showcase, status, service, map } = await openServiceMap(page)
  const collapse = map.getByRole('button', { name: 'Collapse group data', exact: true })
  await expect(collapse).toHaveAttribute('aria-expanded', 'true')
  await collapse.click()
  await expect(status('Collapsed data: 5 services behind one node.')).toBeVisible()
  await expect(service('Payments DB Healthy')).toHaveCount(0)
  await expect(service('data 5 nodes')).toBeVisible()
  await expect(showcase.locator('.vw-network-node')).toHaveCount(18)
  const expand = map.getByRole('button', { name: 'Expand group data', exact: true })
  await expect(expand).toHaveAttribute('aria-expanded', 'false')
  await expand.click()
  await expect(status('Expanded data: 5 services shown.')).toBeVisible()
  await expect(service('Payments DB Healthy')).toBeVisible()
  await expect(showcase.locator('.vw-network-node')).toHaveCount(22)
  expect(errors).toEqual([])
})

test('on the Japanese page the service map shows Japanese health, controls and incident text', async ({ page }) => {
  const errors = pageErrors(page)
  const demo = await openExample(page, 'service-map', { kind: 'showcase', locale: 'ja' })
  const showcase = demo.getByRole('region', { name: 'サービスマップ', exact: true })
  const map = showcase.getByLabel('サービス構成', { exact: true })
  await expect(map.getByRole('button', { name: 'Recommender 低下', exact: true })).toBeVisible()
  const status = showcase.getByRole('status').last()
  await expect(status).toHaveText(/^14:30:00 UTC で一時停止中/)
  await expect(showcase.getByRole('complementary', { name: 'サービスの詳細' }).getByRole('heading', { name: '要対応' })).toBeVisible()
  await showcase.getByRole('button', { name: 'インシデント: Payments DB の遅延', exact: true }).click()
  await expect(status).toHaveText(/^インシデント: Payments DB の p95 が [\d.]+ ms。影響範囲: 上流の \d+ サービスが低下/)
  await expect(showcase.getByRole('region', { name: 'インシデントのタイムライン', exact: true })).toBeVisible()
  expect(errors).toEqual([])
})
