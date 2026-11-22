import assert from 'node:assert/strict'
import { test } from 'node:test'
import { h } from 'vue'
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
