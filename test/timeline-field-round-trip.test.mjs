import assert from 'node:assert/strict'
import { test } from 'node:test'
import { formatFieldValue, parseFieldValue } from '@eightkk/vue-weave/core'

/** Format a value, parse the text back and return both. */
function roundTrip(spec, value) {
  const text = formatFieldValue(spec, value)
  return { text, parsed: parseFieldValue(spec, text) }
}

const process = [{ value: 1, label: '加工' }, { value: 2, label: '検査' }, { value: 3, label: '梱包' }]
const select = (extra = {}) => ({ id: 's', kind: 'select', get: () => null, choices: process, ...extra })

test('a single select formats its label and parses the label or the value back', () => {
  assert.deepEqual(roundTrip(select(), 1), { text: '加工', parsed: { ok: true, value: 1 } })
  assert.deepEqual(parseFieldValue(select(), ' 検査 '), { ok: true, value: 2 })
  assert.deepEqual(parseFieldValue(select(), '3'), { ok: true, value: 3 })
  assert.equal(parseFieldValue(select(), '出荷').code, 'choice')
  // A choice without a label shows and reads its value.
  const plain = select({ choices: [{ value: 'x' }, { value: 10 }] })
  assert.deepEqual(roundTrip(plain, 10), { text: '10', parsed: { ok: true, value: 10 } })
})

test('a multiple select formats labels and commits the parsed text as an array in order', () => {
  const multi = select({ multiple: true })
  assert.deepEqual(roundTrip(multi, [1, 2]), { text: '加工, 検査', parsed: { ok: true, value: [1, 2] } })
  assert.deepEqual(roundTrip(multi, [3, 1]), { text: '梱包, 加工', parsed: { ok: true, value: [3, 1] } })
  assert.deepEqual(parseFieldValue(multi, '加工,2'), { ok: true, value: [1, 2] })
  assert.deepEqual(parseFieldValue(multi, '検査'), { ok: true, value: [2] })
  assert.equal(parseFieldValue(multi, '加工, 出荷').code, 'choice')
  assert.equal(parseFieldValue(multi, '加工,,検査').code, 'invalid')
  assert.deepEqual(parseFieldValue(multi, ''), { ok: true, value: null })
})

test('multiple-select entries that contain the separator are quoted, so every selection round trips', () => {
  // A choice whose text equals two other choices joined by the separator.
  const joined = select({ choices: [{ value: '加工' }, { value: '検査' }, { value: '加工, 検査' }], multiple: true })
  assert.deepEqual(roundTrip(joined, ['加工', '検査']), { text: '加工, 検査', parsed: { ok: true, value: ['加工', '検査'] } })
  assert.deepEqual(roundTrip(joined, ['加工, 検査']), { text: '"加工, 検査"', parsed: { ok: true, value: ['加工, 検査'] } })
  assert.deepEqual(roundTrip(joined, ['加工, 検査', '加工']), { text: '"加工, 検査", 加工', parsed: { ok: true, value: ['加工, 検査', '加工'] } })
  // Unquoted commas always separate, whatever the labels are.
  assert.deepEqual(parseFieldValue(joined, '加工,検査'), { ok: true, value: ['加工', '検査'] })
  const choices = [{ value: 'cw', label: 'Cut, weld' }, { value: 'c', label: 'Cut' }, { value: 'w', label: 'weld' }, { value: 'p', label: 'Paint' }]
  const multi = select({ choices, multiple: true })
  assert.deepEqual(roundTrip(multi, ['cw', 'p']), { text: '"Cut, weld", Paint', parsed: { ok: true, value: ['cw', 'p'] } })
  assert.deepEqual(roundTrip(multi, ['c', 'w']), { text: 'Cut, weld', parsed: { ok: true, value: ['c', 'w'] } })
  // Whitespace outside quotes is ignored; inside quotes it is part of the entry.
  assert.deepEqual(parseFieldValue(multi, '  "Cut, weld"  ,Paint  '), { ok: true, value: ['cw', 'p'] })
  assert.equal(parseFieldValue(multi, '" Cut"').code, 'choice')
  // A single select never splits or unquotes.
  assert.deepEqual(roundTrip(select({ choices }), 'cw'), { text: 'Cut, weld', parsed: { ok: true, value: 'cw' } })
  assert.equal(parseFieldValue(select({ choices }), '"Cut"').code, 'choice')
})

test('quotes, surrounding whitespace and malformed quoting in multiple-select text', () => {
  const choices = [
    { value: 'in', label: '12" pipe' }, { value: 'q', label: '"quoted"' }, { value: 'sp', label: ' padded ' }, { value: 'x', label: 'X' },
  ]
  const multi = select({ choices, multiple: true })
  assert.deepEqual(roundTrip(multi, ['in', 'q', 'sp', 'x']), {
    text: '"12"" pipe", """quoted""", " padded ", X', parsed: { ok: true, value: ['in', 'q', 'sp', 'x'] },
  })
  // A quote inside an unquoted entry is an ordinary character.
  assert.deepEqual(parseFieldValue(multi, '12" pipe, X'), { ok: true, value: ['in', 'x'] })
  assert.equal(parseFieldValue(multi, '"X').code, 'invalid')
  assert.equal(parseFieldValue(multi, '"X" Y').code, 'invalid')
  assert.equal(parseFieldValue(multi, 'X,').code, 'invalid')
  assert.equal(parseFieldValue(multi, ', X').code, 'invalid')
  assert.equal(parseFieldValue(multi, 'X, ,X').code, 'invalid')
  // A quoted empty entry is looked up like any other text.
  assert.equal(parseFieldValue(multi, 'X, ""').code, 'choice')
  const empty = select({ choices: [{ value: 'e', label: '' }, { value: 'x', label: 'X' }], multiple: true })
  assert.deepEqual(roundTrip(empty, ['x', 'e']), { text: 'X, ""', parsed: { ok: true, value: ['x', 'e'] } })
  // Single selects keep reading the trimmed text as one entry; a padded label is written by its value.
  assert.deepEqual(roundTrip(select({ choices }), 'in'), { text: '12" pipe', parsed: { ok: true, value: 'in' } })
  assert.deepEqual(roundTrip(select({ choices }), 'sp'), { text: 'sp', parsed: { ok: true, value: 'sp' } })
})

test('each multiple-select entry follows the single-value rule for labels and values', () => {
  // Duplicate labels: those choices are written by value, the others by label.
  const shared = select({ choices: [{ value: 'a1', label: 'Line A' }, { value: 'a2', label: 'Line A' }, { value: 'b', label: 'Line B' }], multiple: true })
  assert.deepEqual(roundTrip(shared, ['a2', 'b', 'a1']), { text: 'a2, Line B, a1', parsed: { ok: true, value: ['a2', 'b', 'a1'] } })
  assert.equal(parseFieldValue(shared, 'Line B, Line A').code, 'choice')
  // A label equal to another choice's value wins; that other choice is written by its own label.
  const crossed = select({ choices: [{ value: 'x', label: 'y' }, { value: 'y', label: 'z' }], multiple: true })
  assert.deepEqual(parseFieldValue(crossed, 'y, z'), { ok: true, value: ['x', 'y'] })
  assert.deepEqual(roundTrip(crossed, ['y', 'x']), { text: 'z, y', parsed: { ok: true, value: ['y', 'x'] } })
  // Number values are read back as numbers.
  const numbers = select({ choices: [{ value: 1 }, { value: 2, label: 'Two, 2' }, { value: 3, label: '1' }], multiple: true })
  assert.deepEqual(roundTrip(numbers, [2, 1, 3]), { text: '"Two, 2", 1, 3', parsed: { ok: true, value: [2, 1, 3] } })
  assert.deepEqual(parseFieldValue(numbers, '2, 3'), { ok: true, value: [2, 3] })
  // A number and a string value with the same text cannot be told apart by text, so the spec is rejected.
  assert.throws(() => parseFieldValue(select({ choices: [{ value: 1 }, { value: '1' }], multiple: true }), '1'), /Choice 1 of select field s has no text that names it/)
})

test('a choice with an empty label is shown by its value where empty text would read as no value', () => {
  const single = select({ choices: [{ value: 'pending', label: '' }, { value: 'done', label: 'Done' }] })
  assert.deepEqual(roundTrip(single, 'pending'), { text: 'pending', parsed: { ok: true, value: 'pending' } })
  assert.deepEqual(parseFieldValue(single, ''), { ok: true, value: null })
  // In a multiple select the empty label is written quoted, which names the choice.
  const multi = select({ choices: [{ value: 'pending', label: '' }, { value: 'done', label: 'Done' }], multiple: true })
  assert.deepEqual(roundTrip(multi, ['pending', 'done']), { text: '"", Done', parsed: { ok: true, value: ['pending', 'done'] } })
})

test('choices that some value cannot be written for are rejected instead of reading back as another value', () => {
  // `A` shares its label with `B`, and its value text is the label of `C` and the value of no other choice: neither
  // text names `A`, so formatting `A` and reading it back would give another value.
  const choices = [{ value: 'A', label: '共通' }, { value: 'B', label: '共通' }, { value: '共通', label: 'その他' }, { value: 'C', label: 'A' }]
  for (const multiple of [false, true]) {
    const spec = select({ choices, multiple })
    assert.throws(() => formatFieldValue(spec, multiple ? ['A'] : 'A'), /Choice "A" of select field s has no text that names it/)
    assert.throws(() => parseFieldValue(spec, '共通'), /Choice "A" of select field s has no text that names it/)
  }
  // Two choices with one label are fine while their values name them.
  const shared = select({ choices: [{ value: 'a', label: 'L' }, { value: 'b', label: 'L' }], multiple: true })
  assert.deepEqual(roundTrip(shared, ['a', 'b']), { text: 'a, b', parsed: { ok: true, value: ['a', 'b'] } })
  assert.equal(parseFieldValue(shared, 'L').code, 'choice')
})

test('every valid select value round-trips or the spec is rejected', () => {
  // Small exhaustive search over choice sets built from a few overlapping texts.
  const texts = ['', 'a', 'b', 'a, b', ' a']
  let checked = 0
  for (const multiple of [false, true]) {
    for (let mask = 0; mask < 5 ** 3; mask++) {
      const labels = [mask % 5, Math.floor(mask / 5) % 5, Math.floor(mask / 25) % 5].map(i => texts[i])
      const choices = labels.map((label, i) => ({ value: ['a', 'b', 'c'][i], label }))
      const spec = select({ choices, multiple })
      for (const value of multiple ? [['a'], ['b', 'c'], ['c', 'a', 'b']] : ['a', 'b', 'c']) {
        let text
        try {
          text = formatFieldValue(spec, value)
        } catch (error) {
          assert.match(error.message, /has no text that names it/)
          continue
        }
        assert.deepEqual(parseFieldValue(spec, text), { ok: true, value }, JSON.stringify({ choices, value, text }))
        checked++
      }
    }
  }
  assert.ok(checked > 500)
})

test('formatting and parsing a long multiple selection stays fast', () => {
  const choices = Array.from({ length: 1000 }, (_, index) => ({ value: index, label: index % 3 ? 'Step ' + index : 'Step, ' + index }))
  const multi = select({ choices, multiple: true })
  const value = choices.map(choice => choice.value).reverse()
  const started = performance.now()
  for (let round = 0; round < 5; round++) {
    const { parsed } = roundTrip(multi, value)
    assert.deepEqual(parsed, { ok: true, value })
  }
  const elapsed = performance.now() - started
  assert.ok(elapsed < 2000, 'five round trips of 1,000 entries took ' + elapsed + ' ms')
})

test('duplicate labels are rejected as ambiguous and formatted as values', () => {
  const choices = [{ value: 'a1', label: 'Line A' }, { value: 'a2', label: 'Line A' }, { value: 'b', label: 'Line B' }]
  const ambiguous = parseFieldValue(select({ choices }), 'Line A')
  assert.equal(ambiguous.ok, false)
  assert.equal(ambiguous.code, 'choice')
  assert.match(ambiguous.error, /Several choices match "Line A"/)
  assert.deepEqual(roundTrip(select({ choices }), 'a2'), { text: 'a2', parsed: { ok: true, value: 'a2' } })
  assert.deepEqual(roundTrip(select({ choices }), 'b'), { text: 'Line B', parsed: { ok: true, value: 'b' } })
  assert.deepEqual(roundTrip(select({ choices, multiple: true }), ['b', 'a1']), { text: 'Line B, a1', parsed: { ok: true, value: ['b', 'a1'] } })
  // A unique label wins over another choice's value; the formatter keeps the reading that round trips.
  const crossed = [{ value: 'x', label: 'y' }, { value: 'y', label: 'z' }]
  assert.deepEqual(parseFieldValue(select({ choices: crossed }), 'y'), { ok: true, value: 'x' })
  assert.deepEqual(roundTrip(select({ choices: crossed }), 'y'), { text: 'z', parsed: { ok: true, value: 'y' } })
  // A number and a string value with the same text cannot be told apart by text, so the spec is rejected.
  assert.throws(() => formatFieldValue(select({ choices: [{ value: 1 }, { value: '1' }] }), 1), /has no text that names it/)
})

test('a repeated wall time formats with its offset and parses back to the same instant', () => {
  const ny = { id: 'z', kind: 'time', get: () => null, timeZone: 'America/New_York' }
  // 2026-11-01: clocks go back from 02:00 EDT to 01:00 EST, so 01:00–01:59 occurs twice.
  const earlier = Date.UTC(2026, 10, 1, 5, 30)
  const later = Date.UTC(2026, 10, 1, 6, 30)
  assert.deepEqual(roundTrip(ny, earlier), { text: '2026-11-01 01:30 -04:00', parsed: { ok: true, value: earlier } })
  assert.deepEqual(roundTrip(ny, later), { text: '2026-11-01 01:30 -05:00', parsed: { ok: true, value: later } })
  assert.deepEqual(roundTrip(ny, Date.UTC(2026, 10, 1, 6, 30, 15, 250)), {
    text: '2026-11-01 01:30:15.250 -05:00', parsed: { ok: true, value: Date.UTC(2026, 10, 1, 6, 30, 15, 250) },
  })
  // Typed text without an offset keeps resolving to the earlier occurrence.
  assert.deepEqual(parseFieldValue(ny, '2026-11-01 01:30'), { ok: true, value: earlier })
  // Times next to the repeated hour, and the skipped hour in spring, need no offset.
  assert.equal(formatFieldValue(ny, Date.UTC(2026, 10, 1, 4, 59)), '2026-11-01 00:59')
  assert.equal(formatFieldValue(ny, Date.UTC(2026, 10, 1, 7, 0)), '2026-11-01 02:00')
  assert.equal(formatFieldValue(ny, Date.UTC(2026, 2, 8, 7, 0)), '2026-03-08 03:00')
  // Every minute around both transitions round trips.
  for (const start of [Date.UTC(2026, 10, 1, 4), Date.UTC(2026, 2, 8, 5)]) {
    for (let time = start; time < start + 4 * 3_600_000; time += 60_000) {
      const { text, parsed } = roundTrip(ny, time)
      assert.deepEqual(parsed, { ok: true, value: time }, text)
    }
  }
  // A southern-hemisphere zone and a fixed offset behave the same way.
  const sydney = { ...ny, timeZone: 'Australia/Sydney' }
  const back = Date.UTC(2026, 3, 4, 15, 30) // 2026-04-05 02:30 AEDT, the first 02:30
  assert.deepEqual(roundTrip(sydney, back), { text: '2026-04-05 02:30 +11:00', parsed: { ok: true, value: back } })
  assert.deepEqual(roundTrip(sydney, back + 3_600_000), { text: '2026-04-05 02:30 +10:00', parsed: { ok: true, value: back + 3_600_000 } })
  assert.equal(formatFieldValue({ ...ny, timeZone: undefined, utcOffsetMinutes: -300 }, later), '2026-11-01 01:30')
})
