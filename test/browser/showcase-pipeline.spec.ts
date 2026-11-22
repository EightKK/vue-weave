// The CI/CD pipeline showcase: a simulated run shown as a job graph and a linked timeline.
import { expect, test, openExample, pageErrors } from './support'
import type { Page } from './support'

async function openPipeline(page: Page) {
  await openExample(page, 'pipeline', { kind: 'showcase' })
  const showcase = page.getByRole('region', { name: 'CI/CD pipeline', exact: true })
  // Graph cards are named "<job> <status>", timeline bars "<job> <start>–<end>", so both can be found in the showcase.
  const graph = showcase
  const timeline = showcase.getByRole('region', { name: 'Job timeline', exact: true })
  // The zoom percentage of the graph is an <output>, which also has the status role; the showcase status line comes last.
  const status = showcase.getByRole('status').last()
  return { showcase, graph, timeline, status }
}

test('the pipeline showcase starts paused at a fixed point in the end-to-end shards', async ({ page }) => {
  const errors = pageErrors(page)
  const { showcase, graph, timeline, status } = await openPipeline(page)
  await expect(showcase.getByRole('heading', { name: 'CI/CD pipeline', exact: true })).toBeVisible()
  await expect(status).toHaveText('Run #2184 is paused in the end-to-end shards. Press Play, inject a failure, or select a job.')
  await expect(showcase.locator('.sc-pipe-kpis dd').first()).toHaveText('3:35')

  await expect(graph.getByRole('button', { name: 'Build Passed', exact: true })).toBeVisible()
  await expect(graph.getByRole('button', { name: 'E2E tests · shard 2/3 Running', exact: true })).toBeVisible()
  await expect(graph.getByRole('button', { name: 'Deploy staging Queued', exact: true })).toBeVisible()
  await expect(graph.getByRole('button', { name: 'Approval Queued', exact: true })).toBeVisible()
  // Started attempts end at the clock; attempts that have not started are outlined estimates.
  await expect(timeline.getByRole('button', { name: 'Build 2:00–2:47', exact: true })).toHaveClass(/vw-tone-teal/)
  await expect(timeline.getByRole('button', { name: 'E2E tests · shard 2/3 2:51–3:35', exact: true })).toHaveClass(/vw-tone-blue/)
  await expect(timeline.getByRole('button', { name: 'Deploy staging 4:46–5:27', exact: true })).toHaveClass(/vw-is-outline/)
  await expect(showcase.getByRole('button', { name: 'Retry failed', exact: true })).toBeDisabled()
  await expect(showcase.getByRole('button', { name: 'Approve production', exact: true })).toBeDisabled()

  // Play advances the simulated clock; Pause stops it.
  await showcase.getByRole('button', { name: 'Play', exact: true }).click()
  await expect(showcase.locator('.sc-pipe-kpis dd').first()).not.toHaveText('3:35')
  await showcase.getByRole('button', { name: 'Pause', exact: true }).click()
  await expect(status).toHaveText(/^Paused at \d:\d\d\.$/)
  await expect(showcase.getByRole('button', { name: 'Play', exact: true })).toBeVisible()
  expect(errors).toEqual([])
})

test('the pipeline showcase skips downstream jobs after an injected failure and requeues them on retry', async ({ page }) => {
  const errors = pageErrors(page)
  const { showcase, graph, timeline, status } = await openPipeline(page)

  const inject = showcase.getByRole('button', { name: 'Inject failure', exact: true })
  await inject.click()
  await expect(inject).toHaveAttribute('aria-pressed', 'true')
  await expect(status).toHaveText('E2E tests · shard 2/3 failed: 3 tests timed out. 4 downstream jobs skipped.')
  await expect(graph.getByRole('button', { name: 'E2E tests · shard 2/3 Failed', exact: true })).toBeVisible()
  for (const job of ['Deploy staging', 'Approval', 'Canary 10%', 'Production']) {
    await expect(graph.getByRole('button', { name: `${job} Skipped`, exact: true })).toBeVisible()
  }
  // The other shards keep running.
  await expect(graph.getByRole('button', { name: 'E2E tests · shard 1/3 Running', exact: true })).toBeVisible()
  await expect(timeline.getByRole('button', { name: 'E2E tests · shard 2/3 2:51–3:35', exact: true })).toHaveClass(/vw-tone-violet/)
  await expect(timeline.getByRole('button', { name: /^Deploy staging / })).toHaveCount(0)
  await expect(showcase.locator('.sc-pipe-kpis dd').nth(3)).toHaveText('1')

  const retry = showcase.getByRole('button', { name: 'Retry failed', exact: true })
  await retry.click()
  await expect(status).toHaveText('Retrying E2E tests · shard 2/3 (attempt 2). Downstream jobs are queued again.')
  await expect(retry).toBeDisabled()
  await expect(graph.getByRole('button', { name: 'E2E tests · shard 2/3 Queued', exact: true })).toBeVisible()
  await expect(graph.getByRole('button', { name: 'Deploy staging Queued', exact: true })).toBeVisible()
  // The failed attempt stays in the timeline next to the estimate of the retry.
  await expect(timeline.getByRole('button', { name: 'E2E tests · shard 2/3 2:51–3:35', exact: true })).toHaveClass(/vw-tone-violet/)
  await expect(timeline.getByRole('button', { name: 'E2E tests · shard 2/3 · attempt 2 3:37–5:29', exact: true })).toHaveClass(/vw-is-outline/)
  await expect(showcase.locator('.sc-pipe-kpis dd').nth(3)).toHaveText('0')

  // Turning the toggle off keeps the failure that already happened.
  await inject.click()
  await expect(inject).toHaveAttribute('aria-pressed', 'false')
  await expect(status).toHaveText('The failure stays in this run; retry it or restart the run.')
  await expect(timeline.getByRole('button', { name: 'E2E tests · shard 2/3 2:51–3:35', exact: true })).toBeVisible()
  expect(errors).toEqual([])
})

test('the pipeline showcase links a selected job between the graph and the timeline', async ({ page }) => {
  const errors = pageErrors(page)
  const { graph, timeline, status } = await openPipeline(page)

  const build = graph.getByRole('button', { name: 'Build Passed', exact: true })
  await build.click()
  await expect(build).toHaveAttribute('aria-pressed', 'true')
  await expect(status).toHaveText('Build · Passed · 0:47 · needs Lint, Typecheck, Unit tests · node 20, Unit tests · node 22, Unit tests · node 24.')
  const buildBar = timeline.getByRole('button', { name: 'Build 2:00–2:47', exact: true })
  await expect(buildBar).toHaveClass(/vw-is-highlighted/)
  await expect(buildBar).toHaveAttribute('aria-pressed', 'false')

  // Selecting in the timeline moves the selection there and highlights the card in the graph.
  const security = timeline.getByRole('button', { name: 'Security scan 2:49–3:35', exact: true })
  await security.click()
  await expect(security).toHaveAttribute('aria-pressed', 'true')
  await expect(status).toHaveText('Security scan · Running · 0:46 · needs Build.')
  await expect(graph.locator('[data-vw-node="security"]')).toHaveClass(/vw-is-highlighted/)
  await expect(build).toHaveAttribute('aria-pressed', 'false')
  await expect(buildBar).not.toHaveClass(/vw-is-highlighted/)
  expect(errors).toEqual([])
})

test('on the Japanese page the pipeline names its views, controls and job states in Japanese', async ({ page }) => {
  const errors = pageErrors(page)
  const demo = await openExample(page, 'pipeline', { kind: 'showcase', locale: 'ja' })
  const showcase = demo.getByRole('region', { name: 'CI/CDパイプライン', exact: true })
  const status = showcase.getByRole('status').last()
  await expect(status).toHaveText('実行 #2184 は E2E シャードの途中で一時停止しています。再生するか、障害を起こすか、ジョブを選んでください。')
  const build = showcase.getByRole('button', { name: 'Build 成功', exact: true })
  await expect(build).toBeVisible()
  await expect(showcase.getByRole('region', { name: 'ジョブのタイムライン', exact: true })).toBeVisible()
  await expect(showcase.getByRole('button', { name: '再生', exact: true })).toBeVisible()
  await build.click()
  await expect(status).toHaveText(/^Build · 成功 · .+ · 前提 .+。$/)
  expect(errors).toEqual([])
})
