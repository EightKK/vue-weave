import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createSSRApp, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import {
  applyTimelineConstraintEdit, createTimeScale, defaultSvgExportTheme, renderTimelineSvg, scheduleTasks, timelineConstraintKinds,
  timelineConstraintViolated, timelineConstraints, toMsProjectXml, validateTimelineData,
} from 'vue-weave/core'
import { GanttChart } from 'vue-weave'

const hour = 3_600_000
const rows = [{ id: 'p', label: 'Parent' }, { id: 'r1', label: 'Row 1', parentId: 'p' }, { id: 'r2', label: 'Row 2' }]
const range = { start: 0, end: 10 * hour }
const bar = (extra = {}) => ({ id: 'a', rowId: 'r1', label: 'A', start: hour, end: 3 * hour, editable: true, ...extra })
const other = { id: 'b', rowId: 'r2', label: 'B', start: 5 * hour, end: 6 * hour }
const chartProps = { rows, range, pixelsPerUnit: 10 / hour }
const render = (props = {}) => renderToString(createSSRApp({ render: () => h(GanttChart, { ...chartProps, ...props }) }))

test('validateTimelineData accepts finite constraints, also conflicting ones, and rejects any other value', () => {
  const check = constraints => validateTimelineData(rows, [bar({ constraints }), other])
  assert.doesNotThrow(() => check({}))
  assert.doesNotThrow(() => check({ startNoEarlierThan: -hour, finishNoLaterThan: 20 * hour, fixedStart: hour }))
  // Feasibility is the scheduler's business: a start bound after a finish bound is still valid chart data.
  assert.doesNotThrow(() => check({ startNoEarlierThan: 9 * hour, finishNoLaterThan: 0, startNoLaterThan: 0, fixedStart: 5 * hour }))
  // Unknown fields, for example a spread ScheduleTask, are ignored.
  assert.doesNotThrow(() => check({ id: 'a', duration: hour, startNoEarlierThan: 0 }))
  for (const value of [Number.NaN, Infinity, -Infinity, '1', null]) {
    for (const kind of timelineConstraintKinds) {
      assert.throws(() => check({ [kind]: value }), { name: 'RangeError', message: `Constraint ${kind} of bar a must be a finite time` })
    }
  }
  for (const constraints of [null, 5, [hour], 'x']) {
    assert.throws(() => check(constraints), { name: 'Error', message: 'constraints must be an object: a' })
  }
})

test('timelineConstraintViolated compares the start or finish of an interval with each kind', () => {
  const range = { start: 2, end: 5 }
  const cases = [
    ['startNoEarlierThan', 2, false], ['startNoEarlierThan', 3, true], ['startNoLaterThan', 2, false], ['startNoLaterThan', 1, true],
    ['finishNoEarlierThan', 5, false], ['finishNoEarlierThan', 6, true], ['finishNoLaterThan', 5, false], ['finishNoLaterThan', 4, true],
    ['fixedStart', 2, false], ['fixedStart', 1, true], ['fixedStart', 3, true],
  ]
  for (const [kind, time, violated] of cases) assert.equal(timelineConstraintViolated(range, kind, time), violated, `${kind} ${time}`)
  // A milestone: start and finish are the same time.
  assert.equal(timelineConstraintViolated({ start: 4, end: 4 }, 'finishNoLaterThan', 4), false)
  assert.throws(() => timelineConstraintViolated(range, 'deadline', 1), { name: 'Error', message: 'Unknown constraint kind: deadline' })
  assert.deepEqual(timelineConstraintKinds, ['startNoEarlierThan', 'startNoLaterThan', 'finishNoEarlierThan', 'finishNoLaterThan', 'fixedStart'])
  assert.ok(Object.isFrozen(timelineConstraintKinds))
})

test('timelineConstraints copies the constraint fields of a task, and a bar spreads its constraints into a ScheduleTask', () => {
  const task = { id: 'b', duration: 2, startNoEarlierThan: 3, finishNoLaterThan: 9, mode: 'asap' }
  assert.deepEqual(timelineConstraints(task), { startNoEarlierThan: 3, finishNoLaterThan: 9 })
  assert.equal(timelineConstraints({ id: 'x', duration: 1 }), undefined)
  assert.equal(timelineConstraints(undefined), undefined)
  assert.throws(() => timelineConstraints({ fixedStart: Number.NaN }), { name: 'RangeError', message: 'Constraint fixedStart must be a finite time' })

  // A bar's constraints spread into a task unchanged; scheduleTasks then applies each kind.
  const bars = [
    { id: 'a', rowId: 'r', label: 'A', start: 0, end: 2, constraints: { startNoEarlierThan: 4 } },
    { id: 'b', rowId: 'r', label: 'B', start: 0, end: 2, constraints: { fixedStart: 1 } },
    { id: 'c', rowId: 'r', label: 'C', start: 0, end: 2, constraints: { finishNoEarlierThan: 8 } },
  ]
  const tasks = bars.map(item => ({ id: item.id, duration: item.end - item.start, ...item.constraints }))
  const result = scheduleTasks({ range: { start: 0, end: 20 }, tasks })
  assert.ok(result.ok)
  assert.deepEqual(result.tasks.map(item => [item.id, item.start, item.end]), [['a', 4, 6], ['b', 1, 3], ['c', 6, 8]])
  // A start bound after a finish bound is reported by the scheduler with both constraint names.
  const conflict = scheduleTasks({ range: { start: 0, end: 20 }, tasks: [{ id: 'a', duration: 2, ...{ startNoEarlierThan: 6, finishNoLaterThan: 7 } }] })
  assert.deepEqual(conflict, { ok: false, code: 'infeasible', taskId: 'a', constraints: ['startNoEarlierThan', 'finishNoLaterThan'], dependencyIds: [] })
})

test('applyTimelineConstraintEdit sets, moves and removes a constraint immutably and validates the change', () => {
  const bars = Object.freeze([
    Object.freeze(bar({ data: { keep: true } })),
    Object.freeze({ ...other, constraints: Object.freeze({ finishNoLaterThan: 7 * hour, startNoEarlierThan: 5 * hour }) }),
  ])
  const change = (extra) => ({ id: 'b', kind: 'finishNoLaterThan', before: 7 * hour, after: 8 * hour, source: 'pointer', ...extra })
  const moved = applyTimelineConstraintEdit(bars, change())
  assert.notEqual(moved, bars)
  assert.equal(moved[0], bars[0], 'other bars are kept as they are')
  assert.deepEqual(moved[1], { ...other, constraints: { finishNoLaterThan: 8 * hour, startNoEarlierThan: 5 * hour } })
  assert.deepEqual(bars[1].constraints, { finishNoLaterThan: 7 * hour, startNoEarlierThan: 5 * hour }, 'the input is unchanged')

  // A new constraint, and a bar without constraints.
  const added = applyTimelineConstraintEdit(bars, { id: 'a', kind: 'fixedStart', before: undefined, after: hour, source: 'keyboard' })
  assert.deepEqual(added[0], { ...bars[0], constraints: { fixedStart: hour } })
  assert.equal(added[0].data, bars[0].data)

  // Removing the last constraint drops the field.
  const once = applyTimelineConstraintEdit(bars, change({ after: undefined }))
  assert.deepEqual(once[1].constraints, { startNoEarlierThan: 5 * hour })
  const none = applyTimelineConstraintEdit(once, change({ kind: 'startNoEarlierThan', after: undefined }))
  assert.equal('constraints' in none[1], false)
  // Removing a constraint that is not there keeps the bar's other fields.
  assert.deepEqual(applyTimelineConstraintEdit(bars, { id: 'a', kind: 'startNoLaterThan', before: undefined, after: undefined, source: 'pointer' })[0], bars[0])

  assert.throws(() => applyTimelineConstraintEdit(bars, change({ id: 'missing' })), { name: 'Error', message: 'Unknown bar: missing' })
  assert.throws(() => applyTimelineConstraintEdit(bars, change({ kind: 'deadline' })), { name: 'Error', message: 'Unknown constraint kind: deadline' })
  for (const after of [Number.NaN, Infinity, '1', null]) {
    assert.throws(() => applyTimelineConstraintEdit(bars, change({ after })), { name: 'RangeError', message: 'Constraint finishNoLaterThan must be a finite time' })
  }
  // The result is valid chart data again.
  assert.doesNotThrow(() => validateTimelineData(rows, moved))
})

test('renderTimelineSvg draws a titled glyph per constraint in the window, with the violated state and theme colours', () => {
  const scale = createTimeScale(range, 10 / hour)
  const bars = [
    bar({ constraints: { startNoEarlierThan: hour, finishNoLaterThan: 2 * hour, fixedStart: 20 * hour } }),
    { ...other, constraints: { startNoLaterThan: 4 * hour, finishNoEarlierThan: 7 * hour } },
  ]
  const svg = renderTimelineSvg(rows, bars, [], scale, { labelWidth: 100, formatTime: time => String(time / hour) })
  const groups = [...svg.matchAll(/<g class="(vw-gantt-constraint[^"]*)"><title>([^<]*)<\/title>(.*?)<\/g>/g)].map(match => [match[1], match[2], match[3]])
  assert.deepEqual(groups.map(([classes, title]) => [classes, title]), [
    ['vw-gantt-constraint vw-is-start vw-is-lower', 'Start no earlier than · A 1'],
    ['vw-gantt-constraint vw-is-finish vw-is-upper vw-is-violated', 'Finish no later than · A 2 · violated'],
    ['vw-gantt-constraint vw-is-start vw-is-upper vw-is-violated', 'Start no later than · B 4 · violated'],
    ['vw-gantt-constraint vw-is-finish vw-is-lower vw-is-violated', 'Finish no earlier than · B 7 · violated'],
  ])
  // Start no earlier than 1 h: the stem spans the lane, and the flag at the top points to later times (right).
  const [, , snet] = groups[0]
  assert.match(snet, new RegExp(`^<line x1="110" y1="${40 + 66 + 2}" x2="110" y2="${40 + 66 + 7 + 52 + 5}" stroke="${defaultSvgExportTheme.constraint}" stroke-width="2"/>`))
  assert.match(snet, /<line x1="110" y1="109" x2="118" y2="109"[^>]*\/><polygon points="116,104.5 123,109 116,113.5"/)
  // A violated constraint has a dashed stem in its own colour; an upper bound points to earlier times (left).
  assert.match(groups[1][2], new RegExp(`stroke="${defaultSvgExportTheme.constraintViolated}" stroke-width="2" stroke-dasharray="3 2"`))
  assert.match(groups[1][2], /<line x1="120" y1="169" x2="112" y2="169"[^>]*\/><polygon points="114,164.5 107,169 114,173.5"/)

  // Labels, theme colours and right-to-left output, where later times are to the left.
  const rtl = renderTimelineSvg(rows, bars, [], scale, {
    direction: 'rtl', labelWidth: 100, theme: { constraint: '#123456', constraintViolated: '#654321' },
    constraintLabels: { startNoEarlierThan: 'Frühestens' }, constraintViolatedLabel: 'verletzt',
  })
  assert.match(rtl, /<title>Frühestens · A 01:00<\/title><line x1="90"[^>]*stroke="#123456"[^>]*\/><line x1="90" y1="109" x2="82" y2="109"/)
  assert.match(rtl, /<title>Finish no later than · A 02:00 · verletzt<\/title><line[^>]*stroke="#654321"/)

  // A fixed start is an I-beam; constraints outside the exported window and of hidden rows are not drawn.
  const fixed = renderTimelineSvg(rows, [bar({ constraints: { fixedStart: hour } })], [], scale, { labelWidth: 100 })
  assert.match(fixed, /<g class="vw-gantt-constraint vw-is-start vw-is-fixed"><title>Must start on · A 01:00<\/title><line[^>]*\/><line x1="102" y1="109.5" x2="118" y2="109.5"[^>]*stroke-width="3"\/><line x1="102" y1="168.5" x2="118" y2="168.5"/)
  assert.doesNotMatch(renderTimelineSvg(rows, bars, [], scale, { timeRange: { start: 5 * hour, end: 6 * hour } }), /vw-gantt-constraint/)
  assert.doesNotMatch(renderTimelineSvg(rows, bars.slice(0, 1), [], scale, { collapsedIds: ['p'] }), /vw-gantt-constraint/)
  // No constraints, or an empty object, draw nothing extra.
  assert.equal(renderTimelineSvg(rows, [bar({ constraints: {} }), other], [], scale), renderTimelineSvg(rows, [bar(), other], [], scale))
})

test('toMsProjectXml writes a single constraint as ConstraintType and ConstraintDate after PercentComplete', () => {
  const task = constraints => ({ id: 'a', name: 'A', start: 0, end: hour, percentComplete: 10, constraints })
  const xml = constraints => toMsProjectXml({ name: 'P', tasks: [task(constraints)] }, { utcOffsetMinutes: 60 })
  const types = { fixedStart: 2, startNoEarlierThan: 4, startNoLaterThan: 5, finishNoEarlierThan: 6, finishNoLaterThan: 7 }
  for (const [kind, type] of Object.entries(types)) {
    assert.match(xml({ [kind]: 2 * hour + 400 }),
      new RegExp(`<PercentComplete>10</PercentComplete><ConstraintType>${type}</ConstraintType><ConstraintDate>1970-01-01T03:00:00</ConstraintDate></Task>`))
  }
  // None, an empty object or two constraints: no constraint element, as before.
  const plain = xml(undefined)
  assert.doesNotMatch(plain, /Constraint/)
  assert.equal(xml({}), plain)
  assert.equal(xml({ startNoEarlierThan: 0, finishNoLaterThan: hour }), plain)
  assert.throws(() => xml({ fixedStart: Infinity }), RangeError)
  assert.throws(() => xml({ fixedStart: 9e15 }), { name: 'RangeError', message: 'Constraint of task a must be a finite time' })
  // Before the predecessor links, as the MSPDI schema orders the elements.
  const linked = toMsProjectXml({ name: 'P', tasks: [task(), task({ startNoEarlierThan: 0 })].map((item, i) => ({ ...item, id: 'ab'[i] })), dependencies: [{ from: 'a', to: 'b' }] })
  assert.match(linked, /<ConstraintType>4<\/ConstraintType><ConstraintDate>1970-01-01T00:00:00<\/ConstraintDate><PredecessorLink>/)
})

test('GanttChart draws decorative constraint markers and describes them without changing accessible names', async () => {
  const bars = [bar({ constraints: { startNoEarlierThan: hour, finishNoLaterThan: 2 * hour } }), { ...other, constraints: { fixedStart: 4 * hour } }]
  const html = await render({ bars })
  assert.match(html, /aria-label="A 01:00–03:00"[^>]*aria-describedby="([^" ]+) [^"]+"/)
  assert.match(html, /<span id="[^"]+" hidden>Start no earlier than 01:00\. Finish no later than 02:00, violated\.<\/span>/)
  assert.match(html, /title="B 05:00–06:00 · Must start on 04:00, violated\."/)
  const marks = [...html.matchAll(/<div class="(vw-gantt-constraint[^"]*)" style="([^"]*)" aria-hidden="true"><\/div>/g)].map(match => [match[1], match[2]])
  assert.deepEqual(marks, [
    ['vw-gantt-constraint vw-is-start vw-is-lower', 'left:calc(var(--vw-label-area-width) + -3px);top:2px;--vw-constraint-reach:62px;'],
    ['vw-gantt-constraint vw-is-finish vw-is-upper vw-is-violated', 'left:calc(var(--vw-label-area-width) + 7px);top:50px;--vw-constraint-reach:62px;'],
    ['vw-gantt-constraint vw-is-start vw-is-fixed vw-is-violated', 'left:calc(var(--vw-label-area-width) + 27px);top:2px;--vw-constraint-reach:62px;'],
  ])
  // No handles, sliders or constraint hint without constraintsEditable.
  assert.doesNotMatch(html, /role="slider"|constraint-hint|data-vw-constraint/)

  // Labels are overridable; right-to-left charts position from the right; the deadline keeps its own indicator.
  const labelled = await render({
    bars: [bar({ deadline: 2 * hour, constraints: { finishNoLaterThan: 2 * hour } })], dir: 'rtl',
    labels: { finishNoLaterThan: 'Spätestens fertig', constraintViolated: 'verletzt' },
  })
  assert.match(labelled, /hidden>Deadline 02:00\. Late\. Spätestens fertig 02:00, verletzt\.<\/span>/)
  assert.match(labelled, /<div class="vw-gantt-deadline vw-late" style="right:[^"]*" aria-hidden="true"><\/div><div class="vw-gantt-constraint vw-is-finish vw-is-upper vw-is-violated" style="right:calc\(var\(--vw-label-area-width\) \+ 7px\)/)

  // Collapsed rows and constraints outside the visible window draw no marker; the description still lists them.
  const collapsed = await render({ bars, collapsedIds: new Set(['p']) })
  assert.equal([...collapsed.matchAll(/class="vw-gantt-constraint/g)].length, 1)
  const far = await render({ bars: [bar({ constraints: { finishNoEarlierThan: 9.5 * hour } })], range: { start: 0, end: 200 * hour } , height: 200 })
  assert.match(far, /Finish no earlier than 09:30, violated/)
  assert.doesNotMatch(await render({ bars: [bar({ constraints: { finishNoEarlierThan: 150 * hour } })], range: { start: 0, end: 200 * hour } }), /class="vw-gantt-constraint/)
})

test('GanttChart shows constraint handles only with constraintsEditable on editable bars of an editable chart', async () => {
  const bars = [bar({ constraints: { startNoEarlierThan: hour, finishNoLaterThan: 2 * hour } }), { ...other, constraints: { fixedStart: 4 * hour } }]
  const html = await render({ bars, constraintsEditable: true, editBounds: { start: 0, end: 8 * hour } })
  const handles = [...html.matchAll(/<button type="button" class="(vw-gantt-constraint[^"]*)"[^>]*data-vw-constraint="a" data-vw-constraint-kind="(\w+)" role="slider" aria-label="([^"]+)" aria-describedby="([^"]+)" aria-valuemin="0" aria-valuemax="28800000" aria-valuenow="(\d+)" aria-valuetext="([^"]+)"><\/button>/g)]
  assert.deepEqual(handles.map(match => [match[1], match[2], match[3], match[5], match[6]]), [
    ['vw-gantt-constraint vw-is-start vw-is-lower', 'startNoEarlierThan', 'Start no earlier than · A', String(hour), '01:00'],
    ['vw-gantt-constraint vw-is-finish vw-is-upper vw-is-violated', 'finishNoLaterThan', 'Finish no later than · A', String(2 * hour), '02:00, violated'],
  ])
  const hint = handles[0][4]
  assert.match(html, new RegExp(`<span id="${hint}" class="vw-sr-only">Arrow keys move the constraint by one snap step, Shift\\+arrow and Page keys by one tick step\\. Delete removes it\\. Escape cancels a drag\\.</span>`))
  // The bar B is not editable: its constraint stays a decorative marker.
  assert.match(html, /<div class="vw-gantt-constraint vw-is-start vw-is-fixed vw-is-violated"[^>]*aria-hidden="true">/)
  assert.equal([...html.matchAll(/role="slider"/g)].length, 2)
  // The bar's name and description are the same as without handles.
  const plain = await render({ bars })
  const bars0 = html => html.match(/<button type="button" class="vw-gantt-bar[^>]*>/g)
  assert.deepEqual(bars0(html), bars0(plain))

  // Readonly charts render exactly what they render without the prop.
  assert.equal(await render({ bars, constraintsEditable: true, readonly: true }), await render({ bars, readonly: true }))
  // With progress and link handles, constraint handles follow them in the shared handle list.
  const all = await render({ bars, constraintsEditable: true, progressEditable: true, connectable: true })
  assert.match(all, /data-vw-link="\[&quot;a&quot;,&quot;finish&quot;\]"[^>]*><\/button><button type="button" class="vw-gantt-progress-handle"[^>]*><\/button><button type="button" class="vw-gantt-constraint vw-is-start vw-is-lower"/)
  assert.match(await render({ bars, constraintsEditable: true, labels: { constraintHint: 'Pfeiltasten' } }), /class="vw-sr-only">Pfeiltasten<\/span>/)
})

