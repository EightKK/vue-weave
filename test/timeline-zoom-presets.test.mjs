import assert from 'node:assert/strict'
import { test } from 'node:test'
import { GanttChart } from '@eightkk/vue-weave'
import { calendarBands, calendarZoomPresets, intlTimeFormatter } from '@eightkk/vue-weave/core'
import { renderComponent } from './helpers/ssr.mjs'
import { day } from './helpers/time.mjs'

const minute = 60_000
const hour = 60 * minute
const at = text => Date.parse(text)
const iso = time => new Date(time).toISOString()

test('intlTimeFormatter defaults to UTC HH:mm in en-US, like the default formatTime', () => {
  const format = intlTimeFormatter()
  for (const time of [0, 9 * hour, at('2026-03-29T23:45:00Z')]) assert.equal(format(time), new Date(time).toISOString().slice(11, 16))
})

test('intlTimeFormatter follows the locale, IANA time zone and fixed offset', () => {
  const instant = at('2026-07-01T12:30:00Z')
  assert.equal(intlTimeFormatter({ timeZone: 'Europe/Berlin' })(instant), '14:30')
  assert.equal(intlTimeFormatter({ timeZone: 'Europe/Berlin' })(at('2026-01-01T12:30:00Z')), '13:30')
  assert.equal(intlTimeFormatter({ utcOffsetMinutes: 330 })(instant), '18:00')
  const date = { year: 'numeric', month: 'long', day: 'numeric' }
  assert.equal(intlTimeFormatter({ locale: 'de-DE', timeZone: 'Europe/Berlin', format: date })(instant), '1. Juli 2026')
  assert.equal(intlTimeFormatter({ locale: 'ja-JP', timeZone: 'Asia/Tokyo', format: date })(at('2026-06-30T20:00:00Z')), '2026年7月1日')
  // Plain spaces where ICU versions differ (some write U+202F before the day period), so server and
  // browser render the same text.
  assert.equal(intlTimeFormatter({ format: { hour: 'numeric', minute: '2-digit', hour12: true } })(9 * hour), '9:00 AM')
  // The time zone option wins over a timeZone inside format.
  assert.equal(intlTimeFormatter({ timeZone: 'Asia/Tokyo', format: { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'UTC' } })(0), '09:00')
})

test('intlTimeFormatter output does not depend on the process time zone', () => {
  const previous = process.env.TZ
  const outputs = []
  try {
    for (const zone of ['Asia/Tokyo', 'America/Los_Angeles', 'UTC']) {
      process.env.TZ = zone
      const format = intlTimeFormatter({ locale: 'en-GB', timeZone: 'Europe/London', format: { dateStyle: 'medium', timeStyle: 'short' } })
      outputs.push(format(at('2026-10-25T00:30:00Z')))
      const presets = calendarZoomPresets({ start: at('2026-10-01T00:00:00Z'), end: at('2026-12-01T00:00:00Z') }, { timeZone: 'Europe/London', levels: ['days'] })
      outputs.push(JSON.stringify(presets[0].headerBands), presets[0].formatTime(at('2026-10-26T00:00:00Z')))
    }
  } finally {
    if (previous === undefined) delete process.env.TZ
    else process.env.TZ = previous
  }
  assert.deepEqual(outputs.slice(3), [...outputs.slice(0, 3), ...outputs.slice(0, 3)])
  assert.equal(outputs[0], '25 Oct 2026, 01:30')
})

test('intlTimeFormatter validates its options and times', () => {
  assert.throws(() => intlTimeFormatter({ timeZone: 'Mars/Olympus' }), { name: 'RangeError', message: /Invalid time zone: Mars\/Olympus/ })
  assert.throws(() => intlTimeFormatter({ timeZone: 'UTC', utcOffsetMinutes: 0 }), RangeError)
  assert.throws(() => intlTimeFormatter({ utcOffsetMinutes: 1.5 }), RangeError)
  assert.throws(() => intlTimeFormatter({ locale: 'not a locale!' }), RangeError)
  const format = intlTimeFormatter()
  assert.throws(() => format(Number.NaN), { name: 'RangeError', message: 'time must be finite' })
  assert.throws(() => format(Infinity), RangeError)
})

test('calendarBands formats locale-aware labels from local band starts', () => {
  const spring = { start: at('2026-03-01T00:00:00+01:00'), end: at('2026-05-01T00:00:00+02:00') }
  const months = calendarBands(spring, 'month', { timeZone: 'Europe/Berlin', locale: 'de-DE' })
  assert.deepEqual(months.map(band => band.label), ['März 2026', 'April 2026'])
  assert.deepEqual(months.map(band => iso(band.start)), ['2026-02-28T23:00:00.000Z', '2026-03-31T22:00:00.000Z'])
  const days = calendarBands({ start: 0, end: 2 * day }, 'day', { locale: 'en-US', labelFormat: { weekday: 'long' } })
  assert.deepEqual(days.map(band => band.label), ['Thursday', 'Friday'])
  // With only labelFormat the locale is en-US; a custom label still wins; without either, labels stay ISO-like.
  assert.deepEqual(calendarBands({ start: 0, end: day }, 'day', { labelFormat: { month: 'long' } }).map(band => band.label), ['January'])
  assert.deepEqual(calendarBands({ start: 0, end: day }, 'day', { locale: 'de-DE', label: () => 'x' }).map(band => band.label), ['x'])
  assert.deepEqual(calendarBands({ start: 0, end: day }, 'day').map(band => band.label), ['1970-01-01'])
  assert.deepEqual(calendarBands({ start: 0, end: hour }, 'hour', { utcOffsetMinutes: 540, locale: 'en-US' }).map(band => band.label), ['09:00'])
})

const spring = { start: at('2026-03-01T00:00:00+01:00'), end: at('2026-05-01T00:00:00+02:00') }

test('calendarZoomPresets returns complete presets for the common levels', () => {
  const presets = calendarZoomPresets(spring, { timeZone: 'Europe/Berlin' })
  assert.deepEqual(presets.map(preset => [preset.id, preset.label]), [
    ['hours', 'Hours'], ['days', 'Days'], ['weeks', 'Weeks'], ['months', 'Months'], ['quarters', 'Quarters'], ['years', 'Years'],
  ])
  let previous = Infinity
  for (const preset of presets) {
    assert.ok(Number.isFinite(preset.pixelsPerUnit) && preset.pixelsPerUnit > 0 && preset.pixelsPerUnit < previous, preset.id)
    previous = preset.pixelsPerUnit
    assert.ok(preset.tickSteps.length && preset.tickSteps.every((step, i) => step > 0 && (i === 0 || step >= preset.tickSteps[i - 1])))
    // GanttChart picks the first tick step at least 76 px wide; every level has one.
    assert.ok(preset.tickSteps.some(step => step * preset.pixelsPerUnit >= 76), preset.id)
    assert.ok(Number.isFinite(preset.snap) && preset.snap > 0)
    assert.equal(typeof preset.formatTime, 'function')
    for (const level of preset.headerBands) {
      assert.ok(level.length > 0)
      assert.equal(level[0].start, spring.start)
      assert.equal(level.at(-1).end, spring.end)
      for (let i = 1; i < level.length; i++) assert.equal(level[i].start, level[i - 1].end)
    }
  }
  assert.deepEqual(presets.find(preset => preset.id === 'quarters').headerBands[1].map(band => band.label), ['Q1', 'Q2'])
  const chosen = calendarZoomPresets(spring, { levels: ['weeks', 'hours'], labels: { weeks: 'Wochen' } })
  assert.deepEqual(chosen.map(preset => [preset.id, preset.label]), [['weeks', 'Wochen'], ['hours', 'Hours']])
})

test('calendarZoomPresets follow local dates across daylight-saving changes', () => {
  const [days] = calendarZoomPresets(spring, { timeZone: 'Europe/Berlin', locale: 'en-GB', levels: ['days'] })
  const [march, april] = days.headerBands[0]
  assert.equal(march.label, 'March 2026')
  // March 2026 in Berlin loses an hour on the 29th, so its band is 31 days minus one hour and April starts at local midnight.
  assert.equal(march.end - march.start, 31 * day - hour)
  assert.equal(iso(april.start), '2026-03-31T22:00:00.000Z')
  assert.equal(days.formatTime(april.start), 'Wed 1 Apr')
  assert.equal(days.formatTime(april.start + 13.5 * hour), 'Wed 1 Apr 13:30')
  const autumn = { start: at('2026-10-31T00:00:00-04:00'), end: at('2026-11-03T00:00:00-05:00') }
  const [hours] = calendarZoomPresets(autumn, { timeZone: 'America/New_York', levels: ['hours'] })
  assert.deepEqual(hours.headerBands[0].map(band => (band.end - band.start) / hour), [24, 25, 24])
  assert.deepEqual(hours.headerBands[0].map(band => band.label), ['Sat, Oct 31, 2026', 'Sun, Nov 1, 2026', 'Mon, Nov 2, 2026'])
  // 01:30 happens twice on November 1; the formatter shows local wall time both times.
  assert.equal(hours.formatTime(at('2026-11-01T05:30:00Z')), '01:30')
  assert.equal(hours.formatTime(at('2026-11-01T06:30:00Z')), '01:30')
  const [weeks] = calendarZoomPresets(autumn, { timeZone: 'America/New_York', levels: ['weeks'], weekStartsOn: 0 })
  assert.deepEqual(weeks.headerBands[1].map(band => iso(band.start)), [iso(autumn.start), '2026-11-01T04:00:00.000Z'])
})

test('calendarZoomPresets use a fixed offset and validate their options', () => {
  const [months] = calendarZoomPresets({ start: 0, end: 70 * day }, { utcOffsetMinutes: -300, locale: 'fr-FR', levels: ['months'] })
  assert.deepEqual(months.headerBands[1].map(band => band.label), ['déc.', 'janv.', 'févr.', 'mars'])
  assert.equal(months.formatTime(5 * hour), '1 janv.')
  assert.throws(() => calendarZoomPresets(spring, { levels: ['decades'] }), { name: 'RangeError', message: /Unknown calendar zoom level: decades/ })
  assert.throws(() => calendarZoomPresets(spring, { levels: ['days', 'days'] }), { name: 'Error', message: /Duplicate calendar zoom level: days/ })
  assert.throws(() => calendarZoomPresets(spring, { timeZone: 'Nowhere/Land' }), RangeError)
  assert.throws(() => calendarZoomPresets({ start: 1, end: 1 }), RangeError)
  for (const levels of ['days', new Set(['days']), null]) {
    assert.throws(() => calendarZoomPresets(spring, { levels }), { name: 'RangeError', message: /levels must be an array/ })
  }
})

test('calendarZoomPresets return fresh tick steps on every call', () => {
  const [first] = calendarZoomPresets(spring, { levels: ['days'] })
  const steps = [...first.tickSteps]
  first.tickSteps.push(1)
  first.tickSteps.length = 0
  const [second] = calendarZoomPresets(spring, { levels: ['days'] })
  assert.deepEqual(second.tickSteps, steps)
  assert.notEqual(second.tickSteps, first.tickSteps)
})

test('calendarZoomPresets plug into GanttChart zoomPresets', async () => {
  const presets = calendarZoomPresets(spring, { timeZone: 'Europe/Berlin', locale: 'en-GB' })
  const errors = []
  const html = await renderComponent(GanttChart, {
    rows: [{ id: 'r', label: 'Row' }], bars: [{ id: 'b', rowId: 'r', label: 'Build', start: spring.start + day, end: spring.start + 3 * day }],
    range: spring, zoomPresets: presets, zoomPreset: 'days', formatTime: presets[1].formatTime, onValidationError: error => errors.push(error),
  })
  assert.deepEqual(errors, [])
  assert.match(html, /aria-label="Build Mon 2 Mar–Wed 4 Mar"/)
  assert.match(html, />March 2026</)
  assert.match(html, /aria-pressed="true"[^>]*>Days</)
})
