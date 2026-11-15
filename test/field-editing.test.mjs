import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fieldValuesEqual, formatFieldValue, parseFieldValue, validateFieldValue } from 'vue-weave/core'

const number = (extra = {}) => ({ id: 'n', kind: 'number', get: () => null, ...extra })
const time = (extra = {}) => ({ id: 't', kind: 'time', get: () => null, utcOffsetMinutes: 540, ...extra })
const duration = (extra = {}) => ({ id: 'd', kind: 'duration', get: () => null, ...extra })

test('number parsing separates empty, zero, negative and invalid input', () => {
  assert.deepEqual(parseFieldValue(number(), ''), { ok: true, value: null })
  assert.deepEqual(parseFieldValue(number(), '   '), { ok: true, value: null })
  assert.deepEqual(parseFieldValue(number(), '0'), { ok: true, value: 0 })
  assert.deepEqual(parseFieldValue(number(), '-0.5'), { ok: true, value: -0.5 })
  assert.equal(parseFieldValue(number(), '12abc').code, 'invalid')
  assert.equal(parseFieldValue(number(), 'Infinity').code, 'invalid')
  assert.equal(parseFieldValue(number(), '0x10').code, 'invalid')
  assert.equal(parseFieldValue(number({ required: true }), '').code, 'required')
  assert.equal(parseFieldValue(number({ min: 0 }), '-1').code, 'negative')
  assert.equal(parseFieldValue(number({ max: 5 }), '6').code, 'range')
  assert.equal(parseFieldValue(number({ integer: true }), '1.5').code, 'integer')
  assert.equal(typeof parseFieldValue(number(), '7').value, 'number')
})

test('value validation never accepts a number as text or the reverse', () => {
  assert.equal(validateFieldValue(number(), '5').ok, false)
  assert.equal(validateFieldValue(number(), 0).ok, true)
  assert.equal(validateFieldValue(number(), Number.NaN).ok, false)
  assert.equal(validateFieldValue(number({ required: true }), null).code, 'required')
  assert.equal(validateFieldValue(number({ required: true }), 0).ok, true)
  assert.equal(validateFieldValue({ id: 'x', kind: 'text', get: () => '' }, 3).ok, false)
  assert.equal(validateFieldValue({ id: 'c', kind: 'checkbox', get: () => false }, false).ok, true)
  assert.throws(() => number({ min: 3, max: 1 }) && validateFieldValue(number({ min: 3, max: 1 }), 2), RangeError)
})

test('time fields use an explicit offset, never the runtime zone', () => {
  const jst = parseFieldValue(time(), '2024-03-05 09:00')
  assert.deepEqual(jst, { ok: true, value: Date.UTC(2024, 2, 5, 0, 0) })
  assert.deepEqual(parseFieldValue(time({ utcOffsetMinutes: 0 }), '2024-03-05T09:00'), { ok: true, value: Date.UTC(2024, 2, 5, 9, 0) })
  assert.deepEqual(parseFieldValue(time({ utcOffsetMinutes: -300 }), '2024-03-05 09:00:30.5'), { ok: true, value: Date.UTC(2024, 2, 5, 14, 0, 30, 500) })
  // An offset in the text wins over the field's offset.
  assert.deepEqual(parseFieldValue(time(), '2024-03-05 09:00Z'), { ok: true, value: Date.UTC(2024, 2, 5, 9, 0) })
  assert.deepEqual(parseFieldValue(time(), '2024-03-05 09:00 +05:30'), { ok: true, value: Date.UTC(2024, 2, 5, 3, 30) })
  assert.deepEqual(parseFieldValue(time(), '2024-03-05'), { ok: true, value: Date.UTC(2024, 2, 4, 15, 0) })
  assert.equal(parseFieldValue(time(), '2024-02-30').code, 'invalid')
  assert.equal(parseFieldValue(time(), '2024-13-01').code, 'invalid')
  assert.equal(parseFieldValue(time(), '2024-01-01 24:00').code, 'invalid')
  assert.equal(parseFieldValue(time(), 'March 5').code, 'invalid')
  assert.equal(parseFieldValue(time(), '').ok, true)
})

test('time fields without a zone or custom parser are rejected; custom parse and format win', () => {
  assert.equal(parseFieldValue(time({ utcOffsetMinutes: undefined }), '2024-03-05 09:00').code, 'time-zone')
  const axis = { id: 'axis', kind: 'time', get: () => null, parse: text => (/^\d+$/.test(text) ? Number(text) : { error: 'digits only' }), format: value => 'day ' + value }
  assert.deepEqual(parseFieldValue(axis, '42'), { ok: true, value: 42 })
  assert.deepEqual(parseFieldValue(axis, 'x'), { ok: false, code: 'custom', error: 'digits only' })
  assert.equal(formatFieldValue(axis, 42), 'day 42')
})

test('time formatting round trips in the field zone', () => {
  const spec = time()
  const value = Date.UTC(2024, 2, 5, 0, 0, 7, 250)
  const text = formatFieldValue(spec, value)
  assert.equal(text, '2024-03-05 09:00:07.250')
  assert.deepEqual(parseFieldValue(spec, text), { ok: true, value })
  assert.equal(formatFieldValue(spec, Date.UTC(2024, 2, 5, 0, 0)), '2024-03-05 09:00')
  assert.equal(formatFieldValue(spec, null), '')
  const other = time({ utcOffsetMinutes: 0 })
  assert.equal(formatFieldValue(other, value), '2024-03-05 00:00:07.250')
})

test('duration units scale the typed value and negatives are rejected by default', () => {
  const hours = duration({ unitSize: 3600000, unitLabel: 'h', durationBasis: 'working' })
  assert.deepEqual(parseFieldValue(hours, '2.5'), { ok: true, value: 9000000 })
  assert.deepEqual(parseFieldValue(hours, '2.5h'), { ok: true, value: 9000000 })
  assert.deepEqual(parseFieldValue(hours, '0'), { ok: true, value: 0 })
  assert.equal(parseFieldValue(hours, '-1').code, 'negative')
  assert.equal(parseFieldValue(hours, 'two').code, 'invalid')
  assert.equal(formatFieldValue(hours, 9000000), '2.5h')
  assert.equal(formatFieldValue(hours, 0), '0h')
  assert.deepEqual(parseFieldValue(duration({ allowNegative: true }), '-4'), { ok: true, value: -4 })
  // The same text means different model values in different units; nothing is converted implicitly.
  assert.notEqual(parseFieldValue(duration(), '3').value, parseFieldValue(hours, '3').value)
  assert.throws(() => parseFieldValue(duration({ unitSize: 0 }), '1'), RangeError)
})

test('select and checkbox fields', () => {
  const select = { id: 's', kind: 'select', get: () => null, choices: [{ value: 'a', label: 'A' }, { value: 2 }], multiple: true }
  assert.deepEqual(parseFieldValue(select, 'a'), { ok: true, value: 'a' })
  assert.deepEqual(parseFieldValue(select, '2'), { ok: true, value: 2 })
  assert.equal(parseFieldValue(select, 'z').code, 'choice')
  assert.equal(validateFieldValue(select, ['a', 2]).ok, true)
  assert.equal(validateFieldValue(select, ['a', 'z']).code, 'choice')
  assert.equal(validateFieldValue({ ...select, multiple: false }, ['a']).ok, false)
  assert.equal(formatFieldValue(select, ['a', 2]), 'A, 2')
  const box = { id: 'c', kind: 'checkbox', get: () => false }
  assert.deepEqual(parseFieldValue(box, 'false'), { ok: true, value: false })
  assert.equal(parseFieldValue(box, 'yes').code, 'invalid')
  assert.throws(() => parseFieldValue({ id: 's', kind: 'select', get: () => null }, 'a'), /choices/)
})

test('fieldValuesEqual compares arrays by element and distinguishes 0 from null', () => {
  assert.equal(fieldValuesEqual(['a', 'b'], ['a', 'b']), true)
  assert.equal(fieldValuesEqual(['a', 'b'], ['b', 'a']), false)
  assert.equal(fieldValuesEqual(0, null), false)
  assert.equal(fieldValuesEqual(Number.NaN, Number.NaN), true)
  assert.equal(fieldValuesEqual('a', ['a']), false)
})
