import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fromMsProjectXml, scheduleTasks, timelineFromMsProject, toMsProjectXml, validateTimelineData } from '@eightkk/vue-weave/core'

const hour = 3_600_000
const t0 = Date.parse('2026-11-09T08:00:00Z')
const plan = {
  name: 'Line 2 & <retrofit>',
  tasks: [
    { id: 'phase', name: 'Phase "A"', start: t0, end: t0 + 6 * hour },
    {
      id: 'cut', name: 'Cut', start: t0 + 400, end: t0 + 2 * hour + 600, outlineLevel: 2, percentComplete: 33.4,
      baselines: [{ number: 0, start: t0, end: t0 + hour }, { number: 10, start: t0 + hour, end: t0 + 3 * hour }],
      constraints: { startNoEarlierThan: t0 },
    },
    { id: 'weld', name: 'Weld', start: t0 + 2 * hour, end: t0 + 5 * hour, outlineLevel: 2, constraints: { finishNoLaterThan: t0 + 6 * hour }, manual: false },
    { id: 'gate', name: 'Gate', start: t0 + 5 * hour, end: t0 + 5 * hour, outlineLevel: 2, inactive: true },
    { id: 'ship', name: 'Ship', start: t0 + 6 * hour, end: t0 + 7 * hour, milestone: true, constraints: { fixedStart: t0 + 6 * hour } },
  ],
  dependencies: [
    { from: 'cut', to: 'weld', type: 'SS', lag: 30 * 60_000 + 2000 },
    { from: 'weld', to: 'gate', type: 'FF', lag: -hour },
    { from: 'gate', to: 'ship', type: 'SF' },
    { from: 'phase', to: 'ship' },
  ],
}

test('fromMsProjectXml reads back what toMsProjectXml writes, with UIDs as IDs and dates rounded to the second', () => {
  const original = JSON.stringify(plan)
  const xml = toMsProjectXml(plan, { utcOffsetMinutes: 540 })
  const imported = fromMsProjectXml(xml, { utcOffsetMinutes: 540 })
  const flags = { milestone: false, summary: false, manual: true, inactive: false }
  assert.deepEqual(imported, {
    name: 'Line 2 & <retrofit>',
    tasks: [
      { id: '1', name: 'Phase "A"', start: t0, end: t0 + 6 * hour, outlineLevel: 1, percentComplete: 0, ...flags, summary: true, duration: 6 * hour },
      {
        id: '2', name: 'Cut', start: t0, end: t0 + 2 * hour + 1000, outlineLevel: 2, percentComplete: 33, ...flags, duration: 2 * hour + 1000,
        constraints: { startNoEarlierThan: t0 },
        baselines: [{ number: 0, start: t0, end: t0 + hour }, { number: 10, start: t0 + hour, end: t0 + 3 * hour }],
      },
      { id: '3', name: 'Weld', start: t0 + 2 * hour, end: t0 + 5 * hour, outlineLevel: 2, percentComplete: 0, ...flags, manual: false, duration: 3 * hour, constraints: { finishNoLaterThan: t0 + 6 * hour } },
      { id: '4', name: 'Gate', start: t0 + 5 * hour, end: t0 + 5 * hour, outlineLevel: 2, percentComplete: 0, ...flags, milestone: true, inactive: true, duration: 0 },
      { id: '5', name: 'Ship', start: t0 + 6 * hour, end: t0 + 7 * hour, outlineLevel: 1, percentComplete: 0, ...flags, milestone: true, duration: 0, constraints: { fixedStart: t0 + 6 * hour } },
    ],
    dependencies: [
      { from: '2', to: '3', type: 'SS', lag: 30 * 60_000 },
      { from: '3', to: '4', type: 'FF', lag: -hour },
      { from: '4', to: '5', type: 'SF' },
      { from: '1', to: '5', type: 'FS' },
    ],
    warnings: [],
  })
  // The import is an MsProjectInput: writing it again gives the same document.
  assert.equal(toMsProjectXml(imported, { utcOffsetMinutes: 540 }), xml)
  // Read at another offset, the same wall-clock times are other instants.
  assert.equal(fromMsProjectXml(xml).tasks[0].start, t0 + 9 * hour)
  assert.equal(JSON.stringify(plan), original)
})

test('toMsProjectXml writes inactive and automatically scheduled tasks only when asked', () => {
  const task = { id: 'a', name: 'A', start: t0, end: t0 + hour }
  const plain = toMsProjectXml({ name: 'P', tasks: [task] })
  assert.match(plain, /<Active>1<\/Active><Manual>1<\/Manual>/)
  assert.equal(toMsProjectXml({ name: 'P', tasks: [{ ...task, inactive: false, manual: true }] }), plain)
  assert.match(toMsProjectXml({ name: 'P', tasks: [{ ...task, inactive: true }] }), /<Active>0<\/Active><Manual>1<\/Manual>/)
  assert.match(toMsProjectXml({ name: 'P', tasks: [{ ...task, manual: false }] }), /<Active>1<\/Active><Manual>0<\/Manual><WBS>/)
  assert.throws(() => toMsProjectXml({ name: 'P', tasks: [{ ...task, inactive: 1 }] }), { name: 'Error', message: 'inactive must be a boolean: a' })
  assert.throws(() => toMsProjectXml({ name: 'P', tasks: [{ ...task, manual: 'no' }] }), { name: 'Error', message: 'manual must be a boolean: a' })
})

const projectFile = `﻿<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<!-- Saved by a planning tool -->
<!DOCTYPE Project [ <!ENTITY secret SYSTEM "file:///etc/passwd"> <!-- a ] in a comment --> <!ENTITY quote "]>"> ]>
<Project xmlns="http://schemas.microsoft.com/project" xmlns:x="urn:extra">
  <Name>  </Name>
  <Title>Retrofit &amp; ramp-up</Title>
  <Tasks>
    <Task><UID>0</UID><Name>Retrofit</Name><OutlineLevel>0</OutlineLevel><Start>2026-11-09T08:00:00</Start><Finish>2026-11-10T17:00:00</Finish></Task>
    <Task><UID>1</UID><Name><![CDATA[Design <draft>]]> &#x26; review&#33;</Name><OutlineLevel>1</OutlineLevel><Start>2026-11-09T08:00:00</Start>
      <Finish>2026-11-10T17:00:00</Finish><Summary>1</Summary><Duration>PT16H0M0S</Duration><Manual>0</Manual></Task>
    <Task x:note='ignored'><UID>2</UID><Name>Draft</Name><OutlineLevel>2</OutlineLevel><Start>2026-11-09T08:00:00</Start><Finish>2026-11-09T17:00:00</Finish>
      <Duration>PT8H0M0S</Duration><PercentComplete>100</PercentComplete><ConstraintType>1</ConstraintType>
      <Baseline><Number>0</Number><Start>2026-11-09T09:00:00</Start><Finish>2026-11-09T18:00:00</Finish></Baseline>
      <Baseline><Number>1</Number><Work>PT8H0M0S</Work></Baseline>
      <Baseline><Number>11</Number><Start>2026-11-09T09:00:00</Start><Finish>2026-11-09T18:00:00</Finish></Baseline>
    </Task>
    <Task><UID>3</UID><Name>Review</Name><OutlineLevel>2</OutlineLevel><Start>2026-11-10T08:00:00Z</Start><Finish>2026-11-10T17:00:00Z</Finish>
      <Duration>P1DT2H</Duration><ConstraintType>3</ConstraintType><ConstraintDate>2026-11-10T17:00:00</ConstraintDate>
      <PredecessorLink><PredecessorUID>2</PredecessorUID><Type>1</Type><LinkLag>4800</LinkLag><LagFormat>7</LagFormat></PredecessorLink>
      <PredecessorLink><PredecessorUID>2</PredecessorUID><Type>3</Type><LinkLag>500</LinkLag><LagFormat>19</LagFormat></PredecessorLink>
      <PredecessorLink><PredecessorUID>99</PredecessorUID><Type>1</Type></PredecessorLink>
      <PredecessorLink><PredecessorUID>2</PredecessorUID><CrossProject>1</CrossProject></PredecessorLink>
      <PredecessorLink><PredecessorUID>3</PredecessorUID></PredecessorLink>
      <PredecessorLink><PredecessorUID>2</PredecessorUID><Type>7</Type></PredecessorLink>
    </Task>
    <Task><UID>4</UID><IsNull>1</IsNull></Task>
    <Task><UID>5</UID><Name>Ramp-up</Name><OutlineLevel>4</OutlineLevel><Active>0</Active><Start>2026-11-11T08:00:00</Start><Finish>2026-11-11T08:00:00</Finish>
      <Milestone>1</Milestone><Duration>P1M</Duration><ConstraintType>9</ConstraintType><PercentComplete>120</PercentComplete></Task>
    <Task><UID>6</UID><Name>No dates</Name><Start>soon</Start><Finish>2026-11-11T08:00:00</Finish></Task>
    <Task><UID>5</UID><Name>Repeat</Name><Start>2026-11-11T08:00:00</Start><Finish>2026-11-11T08:00:00</Finish></Task>
    <Task><Name>No UID</Name></Task>
    <Task><UID>7</UID><Name>Start bound</Name><OutlineLevel>1</OutlineLevel><Start>2026-11-11T08:00:00</Start><Finish>2026-11-11T09:00:00.5</Finish>
      <ConstraintType>4</ConstraintType><Duration>PT</Duration>
      <PredecessorLink><PredecessorUID>5</PredecessorUID><Type>0</Type><LinkLag>-600</LinkLag><LagFormat>6</LagFormat></PredecessorLink>
    </Task>
  </Tasks>
  <Resources><Resource><UID>1</UID><Name>Crew</Name></Resource></Resources>
</Project>
<?app trailing?>
`

test('fromMsProjectXml reads a Microsoft Project file and reports what it cannot import', () => {
  const at = text => Date.parse(text + '+01:00')
  const imported = fromMsProjectXml(projectFile, { utcOffsetMinutes: 60 })
  assert.equal(imported.name, 'Retrofit & ramp-up')
  const base = { percentComplete: 0, milestone: false, summary: false, manual: false, inactive: false }
  assert.deepEqual(imported.tasks, [
    { id: '1', name: 'Design <draft> & review!', start: at('2026-11-09T08:00'), end: at('2026-11-10T17:00'), outlineLevel: 1, ...base, summary: true, duration: 16 * hour },
    {
      id: '2', name: 'Draft', start: at('2026-11-09T08:00'), end: at('2026-11-09T17:00'), outlineLevel: 2, ...base, percentComplete: 100,
      duration: 8 * hour, mode: 'alap', baselines: [{ number: 0, start: at('2026-11-09T09:00'), end: at('2026-11-09T18:00') }],
    },
    { id: '3', name: 'Review', start: Date.parse('2026-11-10T08:00Z'), end: Date.parse('2026-11-10T17:00Z'), outlineLevel: 2, ...base, duration: 26 * hour,
      constraints: { finishNoEarlierThan: at('2026-11-10T17:00'), finishNoLaterThan: at('2026-11-10T17:00') },
    },
    { id: '5', name: 'Ramp-up', start: at('2026-11-11T08:00'), end: at('2026-11-11T08:00'), outlineLevel: 3, ...base, milestone: true, inactive: true },
    { id: '7', name: 'Start bound', start: at('2026-11-11T08:00'), end: at('2026-11-11T09:00') + 500, outlineLevel: 1, ...base },
  ])
  assert.deepEqual(imported.dependencies, [
    { from: '2', to: '3', type: 'FS', lag: 8 * hour },
    { from: '2', to: '3', type: 'SS' },
    { from: '5', to: '7', type: 'FF', lag: -hour },
  ])
  assert.deepEqual(imported.warnings.map(warning => [warning.code, warning.taskId]), [
    ['skipped-baseline', '2'],
    ['outline-level', '5'], ['invalid-value', '5'], ['invalid-value', '5'], ['unsupported-constraint', '5'],
    ['skipped-task', '6'], ['skipped-task', '5'], ['skipped-task', undefined],
    ['invalid-value', '7'], ['unsupported-constraint', '7'],
    ['working-time-lag', '3'], ['percent-lag', '3'], ['unknown-predecessor', '3'], ['skipped-link', '3'], ['skipped-link', '3'], ['skipped-link', '3'],
  ])
  assert.equal(imported.warnings[4].message, 'The constraint type 9 of task 5 is not supported and was left out')
  assert.equal(imported.warnings[12].message, 'A link to task 3 from task 99, which was not imported, was skipped')
  assert.equal('taskId' in imported.warnings[7], false)
  // The result is valid input for the exporter and the timeline conversion.
  assert.doesNotThrow(() => toMsProjectXml(imported))
  const timeline = timelineFromMsProject(imported)
  assert.doesNotThrow(() => validateTimelineData(timeline.rows, timeline.bars, timeline.dependencies))
})

test('the XML reader matches local names, decodes text and never expands declared entities', () => {
  const prefixed = fromMsProjectXml('<p:Project xmlns:p="http://schemas.microsoft.com/project"><p:Name>N</p:Name><p:Tasks>'
    + '<p:Task><p:UID>01</p:UID><p:Name>A&lt;&gt;&amp;&quot;&apos;&#65;&#x1F600;</p:Name><p:Start>2026-01-01T00:00:00</p:Start>'
    + '<p:Finish>2026-01-01T01:00:00</p:Finish></p:Task></p:Tasks></p:Project>')
  assert.equal(prefixed.name, 'N')
  assert.deepEqual(prefixed.tasks.map(task => [task.id, task.name]), [['1', 'A<>&"\'A😀']])
  assert.deepEqual(fromMsProjectXml('<Project><Title>T</Title><Name>a\r\nb</Name></Project>').name, 'a\nb')
  assert.deepEqual(fromMsProjectXml('<Project/>'), { name: '', tasks: [], dependencies: [], warnings: [] })

  const invalid = (xml, message) => assert.throws(() => fromMsProjectXml(xml), { name: 'Error', message })
  invalid('<!DOCTYPE Project [<!ENTITY a "b">]><Project><Name>&a;</Name></Project>', 'Invalid XML at line 1, column 52: unknown or invalid entity &a;')
  const laughs = '<!DOCTYPE Project [<!ENTITY a "aaaaaaaaaa">' + Array.from({ length: 9 }, (_, i) => `<!ENTITY a${i} "${`&a${i ? i - 1 : ''};`.repeat(10)}">`).join('') + ']>'
  invalid(laughs + '<Project><Name>&a8;</Name></Project>', `Invalid XML at line 1, column ${laughs.length + 16}: unknown or invalid entity &a8;`)
  invalid('<!DOCTYPE Project SYSTEM "file:///etc/passwd"><Project><Name>&secret;</Name></Project>', 'Invalid XML at line 1, column 62: unknown or invalid entity &secret;')
  invalid('<Project><Name>x</Project>', 'Invalid XML at line 1, column 17: end tag </Project> does not close <Name>')
  invalid('<Project>', 'Invalid XML at line 1, column 10: unclosed element <Project>')
  invalid('x<Project/>', 'Invalid XML at line 1, column 1: text outside the root element')
  invalid('<Project/><Project/>', 'Invalid XML at line 1, column 11: a second root element')
  invalid('<Project>\n<Name>\n&bad;</Name></Project>', 'Invalid XML at line 3, column 1: unknown or invalid entity &bad;')
  invalid('<Project><Name>&#0;</Name></Project>', 'Invalid XML at line 1, column 16: unknown or invalid entity &#0;')
  invalid('<Project><Name>&#xD800;</Name></Project>', 'Invalid XML at line 1, column 16: unknown or invalid entity &#xD800;')
  invalid('<Project><Name>a & b</Name></Project>', 'Invalid XML at line 1, column 18: unterminated entity reference')
  invalid('<Project a="1" a="2"/>', 'Invalid XML at line 1, column 16: duplicate attribute a')
  invalid('<Project a=1/>', 'Invalid XML at line 1, column 12: expected a quoted value for the attribute a')
  invalid('<Project a="<"/>', 'Invalid XML at line 1, column 12: a < in the value of the attribute a')
  invalid('<Project a="1"b="2"/>', 'Invalid XML at line 1, column 15: expected an attribute name or the end of <Project>')
  invalid('<Project><!-- x</Project>', 'Invalid XML at line 1, column 10: unterminated comment')
  invalid('<Project><![CDATA[x</Project>', 'Invalid XML at line 1, column 10: unterminated CDATA section')
  invalid('<Project></>', 'Invalid XML at line 1, column 12: expected an element name')
  invalid('</Project>', 'Invalid XML at line 1, column 1: end tag </Project> without a start tag')
  invalid('<Project><!ELEMENT x ANY></Project>', 'Invalid XML at line 1, column 10: unsupported markup declaration')
  invalid('<!DOCTYPE Project [', 'Invalid XML at line 1, column 1: unterminated DOCTYPE declaration')
  invalid('', 'Invalid XML at line 1, column 1: no root element')
  invalid('<Workbook/>', 'Not a Microsoft Project XML document: the root element is Workbook')
  assert.throws(() => fromMsProjectXml(42), { name: 'Error', message: 'Microsoft Project XML must be a string' })
  assert.throws(() => fromMsProjectXml('<Project/>', { utcOffsetMinutes: 1081 }), { name: 'RangeError' })
  assert.throws(() => fromMsProjectXml('<Project/>', { utcOffsetMinutes: 1.5 }), { name: 'RangeError' })
})

test('the XML reader is a loop: deeply nested and long documents do not exhaust the stack', () => {
  const depth = 50_000
  assert.deepEqual(fromMsProjectXml('<Project>' + '<a>'.repeat(depth) + '</a>'.repeat(depth) + '</Project>').tasks, [])
  const tasks = Array.from({ length: 2000 }, (_, i) => ({ id: 't' + i, name: 'Task ' + i, start: t0 + i * 1000, end: t0 + i * 1000 + hour }))
  const dependencies = tasks.slice(1).map((task, i) => ({ from: tasks[i].id, to: task.id }))
  const imported = fromMsProjectXml(toMsProjectXml({ name: 'Chain', tasks, dependencies }))
  assert.equal(imported.tasks.length, 2000)
  assert.equal(imported.dependencies.length, 1999)
  assert.deepEqual(imported.warnings, [])
})

test('timelineFromMsProject builds rows from the outline, bars for leaf tasks and links between bars', () => {
  const original = JSON.stringify(plan)
  const timeline = timelineFromMsProject(plan)
  assert.deepEqual(timeline.rows, [
    { id: 'phase', label: 'Phase "A"' }, { id: 'cut', label: 'Cut', parentId: 'phase' }, { id: 'weld', label: 'Weld', parentId: 'phase' },
    { id: 'gate', label: 'Gate', parentId: 'phase' }, { id: 'ship', label: 'Ship' },
  ])
  assert.deepEqual(timeline.bars, [
    {
      id: 'cut', rowId: 'cut', label: 'Cut', start: t0 + 400, end: t0 + 2 * hour + 600, progress: 33.4 / 100,
      baselines: [{ id: 'baseline', start: t0, end: t0 + hour }, { id: 'baseline10', start: t0 + hour, end: t0 + 3 * hour }],
      constraints: { startNoEarlierThan: t0 },
    },
    { id: 'weld', rowId: 'weld', label: 'Weld', start: t0 + 2 * hour, end: t0 + 5 * hour, constraints: { finishNoLaterThan: t0 + 6 * hour } },
    { id: 'gate', rowId: 'gate', label: 'Gate', start: t0 + 5 * hour, end: t0 + 5 * hour, appearance: 'outline' },
    { id: 'ship', rowId: 'ship', label: 'Ship', start: t0 + 6 * hour, end: t0 + 6 * hour, constraints: { fixedStart: t0 + 6 * hour } },
  ])
  assert.deepEqual(timeline.dependencies, [
    { id: 'link-1', from: 'cut', to: 'weld', type: 'SS', lag: 30 * 60_000 + 2000 },
    { id: 'link-2', from: 'weld', to: 'gate', type: 'FF', lag: -hour },
    { id: 'link-3', from: 'gate', to: 'ship', type: 'SF' },
  ])
  assert.deepEqual(timeline.hiddenDependencyIds, ['link-4'])
  assert.doesNotThrow(() => validateTimelineData(timeline.rows, timeline.bars, timeline.dependencies))
  assert.deepEqual(timelineFromMsProject(plan, { baselineId: number => 'b' + number }).bars[0].baselines.map(item => item.id), ['b0', 'b10'])
  assert.throws(() => timelineFromMsProject(plan, { baselineId: () => '$baseline' }), { name: 'Error', message: 'Invalid baseline set ID: $baseline (baseline 0)' })
  assert.throws(() => timelineFromMsProject(plan, { baselineId: () => 'same' }), { name: 'Error', message: 'Duplicate baseline set ID: same (baseline 10)' })
  assert.throws(() => timelineFromMsProject(plan, { baselineId: () => '' }), { name: 'Error' })
  assert.throws(() => timelineFromMsProject({ ...plan, dependencies: [{ from: 'cut', to: 'nope' }] }), /Unknown dependency end: cut → nope/)
  assert.throws(() => timelineFromMsProject({ ...plan, tasks: [plan.tasks[1]] }), { name: 'RangeError', message: 'Outline levels must start at 1 and grow by at most one per task: cut' })
  assert.equal(JSON.stringify(plan), original)
})

test('an imported plan schedules with its manual tasks kept and its inactive tasks left out', () => {
  const imported = fromMsProjectXml(toMsProjectXml(plan))
  const timeline = timelineFromMsProject(imported)
  const tasks = imported.tasks.filter(task => !task.summary).map(task => ({
    id: task.id, duration: task.duration ?? task.end - task.start, ...task.constraints,
    ...(task.manual ? { manual: { start: task.start, end: task.end } } : {}), ...(task.inactive ? { inactive: true } : {}),
  }))
  const result = scheduleTasks({ range: { start: t0, end: t0 + 10 * hour }, tasks, dependencies: timeline.dependencies })
  assert.equal(result.ok, true)
  assert.deepEqual(result.tasks.map(task => [task.id, task.start - t0, task.end - t0, task.manual]), [
    ['2', 0, 2 * hour + 1000, true], ['3', hour / 2, 3.5 * hour, undefined], ['5', 6 * hour, 7 * hour, true],
  ])
  assert.deepEqual(result.inactiveTaskIds, ['4'])
})

test('Must Finish On (3) is imported as the finish pair, round trips, and a missing date still warns', () => {
  const file = (type, date) => `<Project><Name>P</Name><Tasks>
    <Task><UID>1</UID><Name>A</Name><Start>2026-11-09T08:00:00</Start><Finish>2026-11-09T17:00:00</Finish>
      <ConstraintType>${type}</ConstraintType>${date}</Task></Tasks></Project>`
  const xml = file(3, '<ConstraintDate>2026-11-10T17:00:00</ConstraintDate>')
  const imported = fromMsProjectXml(xml)
  const time = Date.parse('2026-11-10T17:00:00Z')
  assert.deepEqual(imported.warnings, [])
  assert.deepEqual(imported.tasks[0].constraints, { finishNoEarlierThan: time, finishNoLaterThan: time })
  // Exporting it writes type 3 again, so a type-3 document survives a round trip.
  const written = toMsProjectXml(imported)
  assert.match(written, /<ConstraintType>3<\/ConstraintType><ConstraintDate>2026-11-10T17:00:00<\/ConstraintDate>/)
  assert.deepEqual(fromMsProjectXml(written).tasks[0].constraints, imported.tasks[0].constraints)
  assert.equal(toMsProjectXml(fromMsProjectXml(written)), written)
  const undated = fromMsProjectXml(file(3, ''))
  assert.deepEqual(undated.warnings.map(warning => [warning.code, warning.taskId]), [['unsupported-constraint', '1']])
  assert.equal('constraints' in undated.tasks[0], false)
})
