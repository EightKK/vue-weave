// The knowledge graph showcase of the design gallery: search dimming, the topic details panel, neighbourhood focus,
// shortest paths and the community filter.
import { expect, test, openDemo, pageErrors } from './support'

test('knowledge graph showcase searches, explains a topic, finds a shortest path and filters communities', async ({ page }) => {
  const errors = pageErrors(page)
  await openDemo(page, 'Knowledge graph')
  const showcase = page.getByRole('region', { name: 'Knowledge graph', exact: true })
  // The zoom percentage is an <output>, which also has the status role; the showcase status line comes last.
  const status = showcase.getByRole('status').last()
  const nodes = showcase.locator('[data-vw-node]')
  // The details panel lists topics as buttons too, so map nodes are the buttons that carry data-vw-node.
  const topic = (name: string) => nodes.and(showcase.getByRole('button', { name, exact: true }))
  const details = showcase.getByRole('complementary', { name: 'Topic details' })

  await expect(status).toHaveText('164 topics, 302 links and 9 communities (modularity 0.60). Select a topic to explore it.')
  await expect(nodes).toHaveCount(164)
  await expect(details.getByRole('heading', { name: 'Most central topics' })).toBeVisible()
  await expect(details.getByRole('listitem').first()).toHaveText('Set theory')

  // Search dims every topic whose label does not match ("cryptography" contains "graph").
  const search = showcase.getByRole('searchbox', { name: 'Search topics' })
  await search.fill('graph')
  await expect(status).toHaveText('6 topics match “graph”.')
  await expect(showcase.locator('[data-vw-node]:not(.vw-dimmed)')).toHaveCount(6)
  await expect(topic('Graph theory')).not.toHaveClass(/vw-dimmed/)
  await expect(topic('Calculus')).toHaveClass(/vw-dimmed/)
  await search.fill('')
  await expect(showcase.locator('[data-vw-node].vw-dimmed')).toHaveCount(0)

  // Selecting a topic fills the details panel and, with the default 1-hop focus, dims everything but its neighbours.
  await topic('Transformers').press('Enter')
  await expect(topic('Transformers')).toHaveAttribute('aria-pressed', 'true')
  await expect(details.getByRole('heading', { name: 'Transformers' })).toBeVisible()
  await expect(status).toHaveText('Transformers · Deep learning · builds on 2 topics, leads to 2 topics.')
  await expect(showcase.locator('[data-vw-node]:not(.vw-dimmed)')).toHaveCount(5)
  await showcase.getByRole('group', { name: 'Neighbourhood focus' }).getByRole('button', { name: 'All', exact: true }).click()
  await expect(showcase.locator('[data-vw-node].vw-dimmed')).toHaveCount(0)

  // Neighbours in the panel are buttons that move the selection.
  await details.getByRole('button', { name: 'Attention', exact: true }).click()
  await expect(topic('Attention')).toHaveAttribute('aria-pressed', 'true')
  await expect(status).toHaveText('Attention · Deep learning · builds on 2 topics, leads to 1 topic.')

  // Shortest path between two chosen topics, ignoring link direction.
  const finder = showcase.getByRole('group', { name: 'Find path' })
  await finder.getByLabel('From', { exact: true }).selectOption({ label: 'RSA' })
  await finder.getByLabel('To', { exact: true }).selectOption({ label: 'Diffusion models' })
  await finder.getByRole('button', { name: 'Find path', exact: true }).click()
  await expect(status).toHaveText('Shortest path, 6 links: RSA → Public-key cryptography → Post-quantum cryptography → Linear algebra → '
    + 'Neural networks → Variational autoencoders → Diffusion models.')
  await expect(showcase.locator('[data-vw-node].vw-is-highlighted')).toHaveCount(7)
  await expect(showcase.locator('.sc-kg-edge-path')).toHaveCount(6)
  await expect(topic('Calculus')).toHaveClass(/vw-dimmed/)

  // Hiding a community the path runs through removes its topics and clears the path.
  const setTheory = showcase.getByRole('group', { name: 'Communities' }).getByRole('button', { name: 'Set theory community, 28 topics' })
  await setTheory.click()
  await expect(setTheory).toHaveAttribute('aria-pressed', 'false')
  await expect(status).toHaveText('Hid the Set theory community (28 topics).')
  await expect(nodes).toHaveCount(136)
  await expect(showcase.locator('.sc-kg-edge-path')).toHaveCount(0)
  await expect(topic('RSA')).toHaveCount(0)
  await setTheory.click()
  await expect(nodes).toHaveCount(164)
  expect(errors).toEqual([])
})
