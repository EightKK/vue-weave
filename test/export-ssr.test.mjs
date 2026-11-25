import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createSSRApp, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { defaultSvgExportTheme, renderEventCalendarSvg, renderTaskBoardSvg, renderTreeGridSvg } from '@eightkk/vue-weave/core'
import { EventCalendar, GanttChart, NetworkGraph, TaskBoard, TreeGrid } from '@eightkk/vue-weave'
import { assertNoDomGlobals, renderStable } from './helpers/ssr-checks.mjs'
import { assertWellFormed, svgSize, svgTexts } from './helpers/svg.mjs'

// The SVG export of TaskBoard, EventCalendar and TreeGrid on a server: the components still render there with the
// export code in them, the core builders run without a DOM, and the exposed `exportSvg` works before mounting (default
// theme and width) like GanttChart's, while `exportPng` rejects because it needs a browser.

const hour = 3_600_000
const at = (d, h, m = 0) => Date.UTC(2026, 10, d, h, m)
const date = at(11, 10)
const events = [
  { id: 'standup', start: at(11, 9), end: at(11, 9, 30), label: 'Standup' },
  { id: 'offsite', start: at(10, 0), end: at(13, 0), label: 'Offsite', allDay: true },
  { id: 'trip', start: at(14, 8), end: at(16, 18), label: 'Trip' },
]
const boardColumns = [{ id: 'todo', label: 'To do' }, { id: 'done', label: 'Done', wipLimit: 2 }]
const cards = [{ id: 'a', columnId: 'todo', label: 'Wireframes' }, { id: 'b', columnId: 'done', label: 'Login' }]
const gridRows = [{ id: 'p', label: 'Plant' }, { id: 'l', parentId: 'p', label: 'Line 1' }]
const gridColumns = [{ id: 'code', label: 'Code', width: 80, value: row => row.id }]
const views = ['day', 'week', 'month', 'agenda']

/** Server-renders `Component` and returns its HTML and the instance's exposed methods, which no template ref reaches. */
async function serverRender(Component, props) {
  let vnode
  const html = await renderToString(createSSRApp({ render: () => (vnode = h(Component, props)) }))
  return { html, exposed: vnode.component.exposed }
}

test('TaskBoard, EventCalendar (every view, agenda included) and TreeGrid render on the server with their export code', async () => {
  const board = await renderStable(async () => (await serverRender(TaskBoard, { columns: boardColumns, cards, collapsible: true })).html)
  assert.match(board, /class="vw-board/)
  for (const view of views) {
    const html = await renderStable(async () => (await serverRender(EventCalendar, { events, date, view, views, now: at(11, 10) })).html)
    assert.match(html, new RegExp(`vw-calendar-view-${view}`))
  }
  const grid = await renderStable(async () => (await serverRender(TreeGrid, { rows: gridRows, columns: gridColumns })).html)
  assert.match(grid, /role="treegrid"/)
})

test('the core builders run in Node for every calendar view, the board and the grid', () => {
  assertNoDomGlobals()
  for (const view of views) {
    for (const direction of ['ltr', 'rtl']) {
      const svg = renderEventCalendarSvg(events, date, { view, direction, agendaDays: view === 'agenda' ? 5 : undefined })
      assertWellFormed(svg)
      assert.ok(svgTexts(svg).length > 0)
    }
  }
  assertWellFormed(renderTaskBoardSvg(cards, boardColumns, { direction: 'rtl' }))
  assertWellFormed(renderTreeGridSvg(gridRows, gridColumns, { direction: 'rtl' }))
  assertNoDomGlobals()
})

test('exportSvg works before mounting with the default theme and width, like GanttChart and NetworkGraph; exportPng needs a browser', async () => {
  const gantt = await serverRender(GanttChart, { rows: [{ id: 'r', label: 'Row' }], bars: [{ id: 'b', rowId: 'r', label: 'Bar', start: 0, end: hour }], range: { start: 0, end: 2 * hour } })
  assertWellFormed(gantt.exposed.exportSvg())
  const graph = await serverRender(NetworkGraph, { nodes: [{ id: 'n', label: 'Node' }], edges: [] })
  assert.ok(svgTexts(graph.exposed.exportSvg()).includes('Node'))

  const board = await serverRender(TaskBoard, { columns: boardColumns, cards })
  const boardSvg = board.exposed.exportSvg({ title: 'Board' })
  assert.equal(boardSvg, renderTaskBoardSvg(cards, boardColumns, { title: 'Board', direction: 'ltr', selectedId: undefined, lanes: undefined }))

  for (const view of views) {
    const calendar = await serverRender(EventCalendar, { events, date, view, agendaDays: view === 'agenda' ? 3 : undefined })
    const svg = calendar.exposed.exportSvg()
    assertWellFormed(svg)
    assert.equal(svgSize(svg).width, 896, 'the documented width before mounting')
    assert.match(svg, new RegExp(`fill="${defaultSvgExportTheme.surface}"`))
    assert.equal(svg, renderEventCalendarSvg(events, date, { view, agendaDays: view === 'agenda' ? 3 : undefined }), view + ' matches the core builder')
  }

  const grid = await serverRender(TreeGrid, { rows: gridRows, columns: gridColumns })
  const gridSvg = grid.exposed.exportSvg()
  assertWellFormed(gridSvg)
  assert.ok(svgTexts(gridSvg).includes('Plant'))

  for (const exposed of [gantt.exposed, graph.exposed, board.exposed, grid.exposed]) {
    await assert.rejects(exposed.exportPng(), { message: 'PNG export requires a browser' })
  }
  assertNoDomGlobals()
})
