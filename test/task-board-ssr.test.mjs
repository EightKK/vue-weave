import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createSSRApp, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { TaskBoard } from '@eightkk/vue-weave'
import { renderComponent } from './helpers/ssr.mjs'

const columns = [{ id: 'todo', label: 'To do' }, { id: 'doing', label: 'Doing', wipLimit: 1 }, { id: 'done', label: 'Done' }]
const lanes = [{ id: 'web', label: 'Web' }, { id: 'api', label: 'API', detail: 'Backend' }]
const cards = [
  { id: 'a', columnId: 'todo', laneId: 'web', label: 'Wireframes', detail: 'Design' },
  { id: 'b', columnId: 'doing', laneId: 'web', label: 'Login form', tone: 'teal' },
  { id: 'c', columnId: 'doing', laneId: 'api', label: 'Auth API' },
]

test('TaskBoard renders on the server with columns, lanes, WIP state and accessible names', async () => {
  const html = await renderComponent(TaskBoard, { columns, lanes, cards, selectedId: 'b' })
  assert.match(html, /role="region" aria-label="Task board"/)
  assert.match(html, /aria-label="To do · Web"/)
  assert.match(html, /aria-label="Doing · API"/)
  assert.match(html, /<button type="button" class="vw-board-card vw-tone-teal vw-is-selected vw-is-movable"[^>]*aria-label="Login form" aria-pressed="true"/)
  assert.match(html, /aria-label="Wireframes" aria-pressed="false"/)
  assert.match(html, /Over WIP limit/)
  assert.match(html, /2 cards, WIP limit 1, Over WIP limit/)
  assert.match(html, />2 \/ 1</)
  assert.match(html, /hidden>1 card</)
  assert.match(html, /Backend/)
  assert.match(html, /No cards/)
  assert.match(html, /Space picks the card up/)
  // A card's detail describes it; its name stays the label.
  const described = html.match(/aria-label="Wireframes" aria-pressed="false" aria-describedby="([^"]+)"/)
  assert.ok(described, 'the card with a detail is described')
  const [detailId, hintId] = described[1].split(' ')
  assert.match(hintId, /-move-hint$/)
  assert.match(html, new RegExp(`id="${detailId}" hidden>Design<`))
  assert.match(html, /aria-label="Login form" aria-pressed="true" aria-describedby="[^" ]+-move-hint"/)
  assert.doesNotMatch(html, /undefined|NaN/)
  // Ids from useId are unique per board, so two boards on one page do not share descriptions.
  const two = await renderComponent({ render: () => h('div', [h(TaskBoard, { columns, cards: [] }), h(TaskBoard, { columns, cards: [] })]) })
  const hints = [...two.matchAll(/id="([^"]+-move-hint)"/g)].map(match => match[1])
  assert.equal(new Set(hints).size, 2)
})

test('TaskBoard renders without lanes, read-only, with labels and slots', async () => {
  const html = await renderComponent(TaskBoard, {
    columns, cards: cards.map(({ laneId, ...card }) => card), readonly: true, dir: 'rtl',
    labels: { region: 'Sprint board', emptyCell: 'Nothing here', overLimit: 'Too many' },
  }, {
    card: ({ card, selected }) => h('span', `${card.label} custom ${selected}`),
    'column-header': ({ column, status }) => h('span', `${column.label} has ${status.count}`),
    empty: ({ column }) => h('em', `empty ${column?.id}`),
  })
  assert.match(html, /aria-label="Sprint board"/)
  assert.match(html, /class="vw-board vw-rtl" dir="rtl"/)
  assert.match(html, /aria-label="Doing"/)
  assert.match(html, /Login form custom false/)
  assert.match(html, /Doing has 2/)
  assert.match(html, /empty done/)
  assert.doesNotMatch(html, /vw-is-movable/)
  assert.doesNotMatch(html, /aria-describedby="[^"]*move-hint"/)
  assert.match(html, /2 cards, WIP limit 1, Too many/)
})

test('TaskBoard shows its empty state without columns and rejects invalid data', async () => {
  assert.match(await renderComponent(TaskBoard, { columns: [], cards: [] }), /No columns to display/)
  assert.match(await renderComponent(TaskBoard, { columns: [], cards: [], labels: { empty: 'Add a column' } }), /Add a column/)
  await assert.rejects(renderComponent(TaskBoard, { columns, cards: [{ id: 'x', columnId: 'later', label: 'X' }] }), {
    name: 'Error', message: 'Unknown column in card x: later',
  })
  await assert.rejects(renderComponent(TaskBoard, { columns, lanes, cards: [{ id: 'x', columnId: 'todo', label: 'X' }] }), {
    message: 'Unknown lane in card x: undefined',
  })
})

test('TaskBoard renders collapsed columns and lanes, the filter counts and the WIP minimum on the server', async () => {
  const html = await renderComponent(TaskBoard, {
    columns: [{ id: 'todo', label: 'To do', wipMin: 2 }, { id: 'doing', label: 'Doing' }, { id: 'done', label: 'Done' }], lanes, cards, collapsible: true,
    collapsedColumnIds: ['doing'], collapsedLaneIds: ['api'], filter: card => card.id !== 'a',
  })
  assert.match(html, /aria-label="Collapse To do" aria-expanded="true"|aria-expanded="true"[^>]*aria-label="Collapse To do"/)
  assert.match(html, /aria-expanded="false"[^>]*aria-label="Expand Doing"/)
  assert.match(html, /aria-expanded="false"[^>]*aria-label="Expand API"/)
  // The toggles are described by the column's count and WIP state and the lane's count, also while collapsed.
  const describedBy = name => html.match(new RegExp(`aria-label="${name}" aria-describedby="([^"]+)"`))?.[1]
  assert.match(html, new RegExp(`id="${describedBy('Collapse To do')}" hidden>0 of 1 card, WIP minimum 2, Under WIP minimum<`))
  assert.match(html, new RegExp(`id="${describedBy('Expand Doing')}" hidden>2 cards<`))
  assert.match(html, new RegExp(`id="${describedBy('Expand API')}" hidden>1 card<`))
  assert.match(html, new RegExp(`id="${describedBy('Collapse Web')}" hidden>1 of 2 cards<`))
  assert.match(html, /vw-board-column-head[^"]*vw-is-collapsed/)
  assert.match(html, /vw-is-under-minimum/)
  assert.match(html, /Under WIP minimum/)
  assert.match(html, />0 of 1</)
  assert.match(html, /grid-template-columns:[^"]*var\(--vw-board-collapsed-width\)/)
  // Cards of collapsed columns and lanes are not rendered; collapsed areas have no cells to drop on.
  assert.doesNotMatch(html, /aria-label="Login form"/)
  assert.doesNotMatch(html, /aria-label="Auth API"/)
  assert.doesNotMatch(html, /aria-label="Doing · /)
  assert.doesNotMatch(html, /aria-label="[^"]* · API"/)
  assert.doesNotMatch(html, /undefined|NaN/)
})

test('TaskBoard reports invalid input through validation-error, rethrows it and renders its empty state', async () => {
  const render = async props => {
    const reported = [], handled = []
    const app = createSSRApp({ render: () => h(TaskBoard, { columns, lanes, cards, ...props, onValidationError: error => reported.push(error) }) })
    app.config.errorHandler = error => handled.push(error)
    return { html: await renderToString(app), reported, handled }
  }
  const duplicate = await render({ cards: [cards[0], cards[0]] })
  assert.equal(duplicate.reported.length, 1)
  assert.equal(duplicate.reported[0].message, 'Duplicate card ID: a')
  assert.deepEqual(duplicate.handled, duplicate.reported)
  assert.match(duplicate.html, /No columns to display/)
  assert.doesNotMatch(duplicate.html, /vw-board-card/)
  // A thrown value that is not an Error is reported wrapped in one and rethrown as it was.
  const thrown = await render({ filter: () => { throw 'filter failed' } })
  assert.equal(thrown.reported.length, 1)
  assert.ok(thrown.reported[0] instanceof Error)
  assert.equal(thrown.reported[0].message, 'filter failed')
  assert.deepEqual(thrown.handled, ['filter failed'])
  assert.match(thrown.html, /No columns to display/)
})
