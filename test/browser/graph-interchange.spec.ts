import { readFile } from 'node:fs/promises'
import { deflateRawSync } from 'node:zlib'
import { expect, test, dragBy, openExample, pageErrors, type Page } from './support'

async function openInterchange(page: Page) {
  await openExample(page, 'diagram-interchange')
  const demo = page.locator('section[aria-labelledby="interchange-title"]')
  await expect(demo.getByRole('heading', { name: 'Diagram import/export' })).toBeVisible()
  return {
    demo,
    text: demo.getByRole('textbox', { name: 'Diagram text', exact: true }),
    format: demo.getByRole('combobox', { name: 'Diagram format', exact: true }),
    graph: demo.getByRole('img', { name: 'Imported diagram', exact: true }),
    status: demo.getByRole('status', { name: 'Interchange status', exact: true }),
    button: (name: string) => demo.getByRole('button', { name, exact: true }),
  }
}

test('the diagram demo imports Mermaid text, reports warnings and exports GraphML and draw.io with moved positions', async ({ page }) => {
  const errors = pageErrors(page)
  const { demo, text, format, graph, status, button } = await openInterchange(page)
  await expect(text).toHaveValue(/^flowchart LR\n/)
  await expect(graph.getByRole('button', { name: 'Order received', exact: true })).toBeVisible()

  await text.fill([
    'flowchart TD',
    '  A[Alpha] -->|go| B{Beta}',
    '  subgraph G[Group]',
    '    B --> C((Gamma))',
    '  end',
    '  classDef hot fill:#f96',
  ].join('\n'))
  await button('Import').click()
  await expect(status).toHaveText('Imported 3 nodes, 2 edges and 1 groups from Mermaid with 1 warning.')
  await expect(graph.getByRole('button', { name: 'Order received', exact: true })).toHaveCount(0)
  for (const name of ['Alpha', 'Beta', 'Gamma']) await expect(graph.getByRole('button', { name, exact: true })).toBeVisible()
  const warnings = demo.getByRole('list', { name: 'Import warnings', exact: true })
  await expect(warnings.getByRole('listitem')).toHaveText(['unsupported-statement The classDef statement was ignored'])

  // Switching the format writes the graph in it; GraphML keeps the group as a nested graph.
  await format.selectOption('GraphML')
  await expect(text).toHaveValue(/<graphml /)
  await expect(text).toHaveValue(/<node id="G"><data key="label">Group<\/data>/)
  await expect(warnings).toHaveCount(0)

  // A dragged node carries its new position into the next export.
  await format.selectOption('draw.io')
  const before = (await text.inputValue()).match(/<mxCell id="A" [^>]*><mxGeometry x="([\d.]+)"/)![1]
  await dragBy(page, graph.getByRole('button', { name: 'Alpha', exact: true }), 120, 0)
  await button('Export').click()
  await expect(status).toHaveText('Exported 3 nodes and 2 edges as draw.io.')
  const after = (await text.inputValue()).match(/<mxCell id="A" [^>]*><mxGeometry x="([\d.]+)"/)![1]
  expect(Number(after)).toBeGreaterThan(Number(before) + 60)

  const pending = page.waitForEvent('download')
  await button('Download').click()
  const download = await pending
  expect(download.suggestedFilename()).toBe('diagram.drawio')
  const saved = (await readFile((await download.path())!)).toString('utf8')
  expect(saved).toBe(await text.inputValue())
  expect(saved).toContain('<mxCell id="A" value="Alpha" style="rounded=0;"')
  await expect(status).toHaveText(/^Downloaded diagram\.drawio \(\d+ characters\)\.$/)
  expect(errors).toEqual([])
})

test('the diagram demo reads compressed draw.io pages and keeps the graph when the text cannot be read', async ({ page }) => {
  const errors = pageErrors(page)
  const { text, format, graph, status, button } = await openInterchange(page)
  await format.selectOption('draw.io')
  const model = '<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>'
    + '<mxCell id="p" value="Pump" style="ellipse;html=1;" vertex="1" parent="1"><mxGeometry x="40" y="40" width="120" height="60" as="geometry"/></mxCell>'
    + '<mxCell id="t" value="Tank &lt;b&gt;A&lt;/b&gt;" style="shape=cylinder3;html=1;" vertex="1" parent="1"><mxGeometry x="300" y="40" width="80" height="90" as="geometry"/></mxCell>'
    + '<mxCell id="f" value="fills" style="endArrow=block;" edge="1" parent="1" source="p" target="t"><mxGeometry relative="1" as="geometry"/></mxCell>'
    + '</root></mxGraphModel>'
  const compressed = deflateRawSync(Buffer.from(encodeURIComponent(model))).toString('base64')
  await text.fill(`<mxfile host="app.diagrams.net"><diagram id="x" name="Plant">${compressed}</diagram></mxfile>`)
  await button('Import').click()
  await expect(status).toHaveText('Imported 2 nodes, 1 edges and 0 groups from draw.io with 0 warnings.')
  await expect(graph.getByRole('button', { name: 'Pump', exact: true })).toBeVisible()
  await expect(graph.getByRole('button', { name: 'Tank A', exact: true })).toBeVisible()

  // Unreadable text leaves the graph as it was and says why.
  await format.selectOption('Mermaid')
  await text.fill('sequenceDiagram\n  Alice->>Bob: Hi')
  await button('Import').click()
  await expect(status).toHaveText('Import failed: Unsupported Mermaid diagram type: sequenceDiagram. Only flowchart and graph diagrams can be read')
  await expect(graph.getByRole('button', { name: 'Pump', exact: true })).toBeVisible()
  await format.selectOption('GraphML')
  await text.fill('<!DOCTYPE graphml [<!ENTITY x "boom">]><graphml><graph><node id="&x;"/></graph></graphml>')
  await button('Import').click()
  await expect(status).toHaveText(/^Import failed: Invalid XML at line 1, column \d+: unknown or invalid entity &x;$/)

  await button('Reset example').click()
  await expect(graph.getByRole('button', { name: 'Order received', exact: true })).toBeVisible()
  await expect(text).toHaveValue(/^<\?xml version="1\.0" encoding="UTF-8"\?>\n<graphml /)
  expect(errors).toEqual([])
})
