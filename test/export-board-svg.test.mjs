import assert from 'node:assert/strict'
import { test } from 'node:test'
import { defaultSvgExportTheme, renderTaskBoardSvg } from '@eightkk/vue-weave/core'
import { assertWellFormed, hostile, svgSize, svgTexts } from './helpers/svg.mjs'

const columns = [
  { id: 'todo', label: 'To do', detail: 'Backlog', wipMin: 3 },
  { id: 'doing', label: 'Doing', wipLimit: 1 },
  { id: 'done', label: 'Done' },
]
const lanes = [{ id: 'web', label: 'Web', detail: 'Front end' }, { id: 'api', label: 'API' }]
const cards = [
  { id: 'a', columnId: 'todo', laneId: 'web', label: 'Login page', detail: 'Design review', tone: 'teal' },
  { id: 'b', columnId: 'doing', laneId: 'web', label: 'Search' },
  { id: 'c', columnId: 'doing', laneId: 'api', label: 'Rate limits', tone: 'amber' },
  { id: 'd', columnId: 'done', laneId: 'api', label: 'Auth tokens' },
]

test('renderTaskBoardSvg draws columns, lanes, cards, counts and WIP warnings', () => {
  const svg = renderTaskBoardSvg(cards, columns, { lanes, title: 'Sprint board', selectedId: 'c' })
  assertWellFormed(svg)
  const texts = svgTexts(svg)
  for (const text of ['To do', 'Backlog', 'Doing', 'Done', 'Web', 'Front end', 'API', 'Login page', 'Design review', 'Search', 'Rate limits', 'Auth tokens']) {
    assert.ok(texts.includes(text), 'draws ' + text)
  }
  assert.match(svg, /<title>Sprint board<\/title>/)
  assert.match(svg, /aria-label="Sprint board"/)
  // Doing holds two cards over its limit of one; To do holds one under its minimum of three.
  assert.ok(texts.includes('2 / 1'), 'the count shows the WIP limit')
  assert.ok(texts.includes('▲ Over WIP limit'))
  assert.ok(texts.includes('▽ Under WIP minimum'))
  assert.ok(texts.includes('No cards'), 'empty cells show the placeholder')
  assert.equal(svg.match(/class="vw-board-card"/g).length, cards.length)
  assert.equal(svg.match(/class="vw-board-lane-head"/g).length, lanes.length)
  assert.match(svg, new RegExp(`stroke="${defaultSvgExportTheme.accent}" stroke-width="2"`), 'the selected card has an outline')
  assert.match(svg, new RegExp(`fill="${defaultSvgExportTheme.tones.amber.solid}"`), 'cards have their tone stripe')
  const { width } = svgSize(svg)
  assert.equal(width, 3 * 232 + 4 * 10)
})

test('renderTaskBoardSvg applies the filter, collapsed columns and lanes, and labels', () => {
  const svg = renderTaskBoardSvg(cards, columns, {
    lanes, filter: card => card.id !== 'b', collapsedColumnIds: ['done', 'unknown'], collapsedLaneIds: ['api'],
    labels: { of: 'von', emptyCell: 'Leer' }, columnWidth: 200, collapsedColumnWidth: 40, padding: 8,
  })
  assertWellFormed(svg)
  const texts = svgTexts(svg)
  assert.ok(!texts.includes('Search'), 'filtered cards are not drawn')
  assert.ok(!texts.includes('Rate limits'), 'the cards of a collapsed lane are not drawn')
  assert.ok(texts.includes('1 von 2 / 1'), 'counts show shown of all while the filter hides cards')
  assert.ok(texts.includes('Leer'))
  assert.ok(texts.includes('Done'), 'a collapsed column keeps its label')
  assert.match(svg, /rotate\(90\)/, 'turned along the strip')
  assert.equal(svgSize(svg).width, 200 * 2 + 40 + 4 * 8)
})

test('renderTaskBoardSvg mirrors right-to-left boards and boards without lanes', () => {
  const ltr = renderTaskBoardSvg(cards, columns)
  const rtl = renderTaskBoardSvg(cards, columns, { direction: 'rtl' })
  assertWellFormed(rtl)
  assert.equal(svgSize(ltr).width, svgSize(rtl).width)
  assert.match(rtl, /direction="rtl"/)
  assert.ok(!/direction="rtl"/.test(ltr))
  // The first column is on the right: its title box starts in the right third.
  const titleX = (svg, text) => Number(new RegExp(`<svg x="([\\d.]+)"[^>]*><text[^>]*>${text}<`).exec(svg)[1])
  assert.ok(titleX(rtl, 'To do') > titleX(rtl, 'Done'))
  assert.ok(titleX(ltr, 'To do') < titleX(ltr, 'Done'))
  assert.equal(ltr.match(/class="vw-board-lane-head"/g), null)
})

test('renderTaskBoardSvg escapes text and is deterministic', () => {
  const hostileCards = [{ id: 'x', columnId: 'c', label: hostile, detail: hostile }]
  const hostileColumns = [{ id: 'c', label: hostile, detail: hostile }]
  const options = { title: hostile, lanes: undefined, cardLabel: card => card.label + '!' }
  const svg = renderTaskBoardSvg(hostileCards, hostileColumns, options)
  assertWellFormed(svg)
  assert.ok(!svg.includes('<b>'))
  assert.ok(svgTexts(svg).includes(hostile.replace(/[\u0001\u0008]/g, '') + '!'), 'control characters are dropped and the rest escaped')
  assert.equal(svg, renderTaskBoardSvg(hostileCards, hostileColumns, options))
})

test('renderTaskBoardSvg validates its input and never mutates it', () => {
  const frozen = structuredClone(cards)
  renderTaskBoardSvg(cards, columns, { lanes })
  assert.deepEqual(cards, frozen)
  assert.throws(() => renderTaskBoardSvg([{ id: 'a', columnId: 'nope', label: 'A' }], columns), /Unknown column/)
  assert.throws(() => renderTaskBoardSvg(cards, [{ id: 'x', label: 'X', wipLimit: -1 }]), RangeError)
  assert.throws(() => renderTaskBoardSvg(cards, columns, { lanes: [] , columnWidth: 0 }), RangeError)
  assert.throws(() => renderTaskBoardSvg(cards, columns, { lanes, wipWarningColor: 'url(#x)' }), RangeError)
  assert.throws(() => renderTaskBoardSvg(cards, columns, { lanes, idPrefix: '1bad' }), /idPrefix/)
  assert.throws(() => renderTaskBoardSvg(cards, columns, { lanes, direction: 'up' }), /direction/)
  assert.throws(() => renderTaskBoardSvg(cards, columns, { lanes, theme: { surface: 'url(http://x)' } }), RangeError)
  const empty = renderTaskBoardSvg([], [])
  assertWellFormed(empty)
  assert.ok(svgTexts(empty).includes('No columns to display'))
})

test('renderTaskBoardSvg uses theme colours and leaves out the background on request', () => {
  const svg = renderTaskBoardSvg(cards, columns, { lanes, background: false, theme: { surface: '#010203', tones: { teal: { solid: 'rgb(1, 2, 3)' } } } })
  assert.match(svg, /fill="#010203"/)
  assert.match(svg, /fill="rgb\(1, 2, 3\)"/)
  assert.ok(!svg.includes(`fill="${defaultSvgExportTheme.surfaceMuted}"/><g`), 'no background rectangle')
  assert.match(svg, /^<svg [^>]*><g class="vw-board-column-head"/)
})
