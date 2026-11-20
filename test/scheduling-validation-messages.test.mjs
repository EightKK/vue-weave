import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  buildPlacementInput, calculateResourceLoad, comparePlans, createGraphExpansion, createTimeScale, createTimelineRowTree, createWindowedDataState,
  levelResources, mergeGraphExpansionPage, parseWeaveSnapshot, planBaselines, projectResourceTimeline, propagateEdit, renderTimelineSvg, rescheduleFromActuals,
  rescheduleFromStatusDate, resolveWindowedRequest, scheduleTasks, scheduleToGraph, serializeWeaveSnapshot, setWindowedView,
  timelineCsvTable, timelineFromICalendar, timelineFromMsProject, timelineWbsCodes, toICalendar, toMsProjectXml, validateTimelineData,
} from 'vue-weave/core'

// One ID rule for the planning, timeline and data functions: an ID is a non-empty string. An invalid ID throws
// `Invalid <kind> ID: <value>` and a repeated one `Duplicate <kind> ID: <id>`, both as Error.

const range = { start: 0, end: 100 }
const plan = () => ({
  range,
  calendars: [{ id: 'c', periods: [{ start: 0, end: 100 }] }],
  tasks: [{ id: 'a', duration: 2 }, { id: 'b', duration: 3 }],
  dependencies: [{ id: 'd', from: 'a', to: 'b' }],
  resources: [{ id: 'r', capacity: 1 }, { id: 'q', capacity: 1 }],
  assignments: [{ resourceId: 'r', taskId: 'a' }],
})
const rows = () => [{ id: 'r1', label: 'A' }, { id: 'r2', label: 'B' }]
const bars = () => [{ id: 'b1', rowId: 'r1', label: 'x', start: 0, end: 10 }, { id: 'b2', rowId: 'r2', label: 'y', start: 5, end: 15 }]
const scale = createTimeScale({ start: 0, end: 20 }, 10)
const day = Date.UTC(2026, 0, 5)
const msProject = tasks => ({ name: 'P', tasks: tasks.map((task, i) => ({ id: task.id, name: 'T' + i, start: day, end: day + 3_600_000 })) })
const events = ids => ids.map(id => ({ id, summary: 'E', start: day, end: day + 1 }))
function windowed(items, links) {
  const { state, start } = setWindowedView(createWindowedDataState({ chunkSize: 10 }), { start: 0, end: 5 })
  return resolveWindowedRequest(state, start[0].requestId, links ? { items: [], links } : items)
}
const snapshotError = fn => {
  try {
    fn()
  } catch (error) {
    // A snapshot reports each problem as a diagnostic; the thrown error lists them after "Invalid snapshot: <path>: ".
    throw new Error(error.message.replace(/^Invalid snapshot: [^:]+: /, ''))
  }
}

// Each case sets the ID of a second item to `id` (so that the third field, the first item's ID, makes a duplicate) and
// calls one function. The optional fifth field is the context that function appends to an invalid or duplicate ID.
const cases = [
  ['scheduleTasks tasks', 'task', 'a', id => { const p = plan(); p.tasks[1].id = id; p.dependencies = []; scheduleTasks(p) }],
  ['scheduleTasks dependencies', 'dependency', 'd', id => { const p = plan(); p.dependencies.push({ id, from: 'b', to: 'a', type: 'SS' }); scheduleTasks(p) }],
  ['scheduleTasks calendars', 'calendar', 'c', id => { const p = plan(); p.calendars.push({ id, periods: [] }); scheduleTasks(p) }],
  ['propagateEdit tasks', 'task', 'a', id => { const p = plan(); p.tasks[1].id = id; p.dependencies = []; propagateEdit(p, { id: 'a', start: 4 }) }],
  ['rescheduleFromStatusDate tasks', 'task', 'a', id => { const p = plan(); p.tasks[1].id = id; p.dependencies = []; rescheduleFromStatusDate(p, 0, new Map()) }],
  ['rescheduleFromActuals tasks', 'task', 'a', id => { const p = plan(); p.tasks[1].id = id; p.dependencies = []; rescheduleFromActuals(p, 0, new Map()) }],
  ['levelResources resources', 'resource', 'r', id => { const p = plan(); p.resources[1].id = id; levelResources(p) }],
  ['calculateResourceLoad tasks', 'task', 'a', id => calculateResourceLoad(range, [{ id: 'a', work: [] }, { id, work: [] }], [], [])],
  ['calculateResourceLoad resources', 'resource', 'r', id => calculateResourceLoad(range, [], [{ id: 'r', capacity: 1 }, { id, capacity: 1 }], [])],
  ['comparePlans resources', 'resource', 'r', id => { const p = plan(); p.resources[1].id = id; comparePlans({ input: p }, { input: plan() }) }, { invalid: ' (current plan)', duplicate: ' (current plan)' }],
  ['buildPlacementInput tasks', 'task', 'a', id => { const p = plan(); p.tasks[1].id = id; buildPlacementInput(p, ['a']) }],
  ['buildPlacementInput dependencies', 'dependency', 'd', id => { const p = plan(); p.dependencies.push({ id, from: 'b', to: 'a' }); buildPlacementInput(p, ['a']) }],
  ['projectResourceTimeline resources', 'resource', 'r', id => projectResourceTimeline({ resources: [{ id: 'r', label: 'R' }, { id, label: 'Q' }], tasks: [], assignments: [] })],
  ['projectResourceTimeline tasks', 'task', 'a', id => projectResourceTimeline({ resources: [], tasks: [{ id: 'a', label: 'A', start: 0, end: 1 }, { id, label: 'B', start: 0, end: 1 }], assignments: [] })],
  ['projectResourceTimeline unplanned tasks', 'unplanned task', 'u', id => projectResourceTimeline({ resources: [], tasks: [], assignments: [], unplannedTaskIds: ['u', id] })],
  ['scheduleToGraph dependencies', 'dependency', 'd', id => scheduleToGraph(scheduleTasks(plan()), [{ id: 'd', from: 'a', to: 'b' }, { id, from: 'a', to: 'b' }])],
  ['validateTimelineData rows', 'row', 'r1', id => { const r = rows(); r[1].id = id; validateTimelineData(r, []) }],
  ['validateTimelineData bars', 'bar', 'b1', id => { const b = bars(); b[1].id = id; validateTimelineData(rows(), b) }],
  ['validateTimelineData dependencies', 'dependency', 'l', id => validateTimelineData(rows(), bars(), [{ id: 'l', from: 'b1', to: 'b2' }, { id, from: 'b2', to: 'b1' }])],
  ['validateTimelineData baselines', 'baseline set', 'v', id => { const b = bars(); b[1].baselines = [{ id: 'v', start: 0, end: 1 }, { id, start: 0, end: 1 }]; validateTimelineData(rows(), b) }, { invalid: ' (bar b2)', duplicate: ' (bar b2)' }],
  ['createTimelineRowTree rows', 'row', 'r1', id => { const r = rows(); r[1].id = id; createTimelineRowTree(r) }],
  ['timelineWbsCodes rows', 'row', 'r1', id => { const r = rows(); r[1].id = id; timelineWbsCodes(r) }],
  ['timelineCsvTable rows', 'row', 'r1', id => { const r = rows(); r[1].id = id; timelineCsvTable(r, []) }],
  ['renderTimelineSvg markers', 'marker', 'm', id => renderTimelineSvg(rows(), bars(), [], scale, { markers: [{ id: 'm', time: 1, label: 'M' }, { id, time: 2, label: 'N' }] })],
  ['renderTimelineSvg marker ranges', 'marker range', 'm', id => renderTimelineSvg(rows(), bars(), [], scale, { markerRanges: [{ id: 'm', start: 1, end: 2, label: 'M' }, { id, start: 3, end: 4, label: 'N' }] })],
  ['renderTimelineSvg columns', 'column', 'c', id => renderTimelineSvg(rows(), bars(), [], scale, { columns: [{ id: 'c', label: 'C', width: 40, value: () => '' }, { id, label: 'D', width: 40, value: () => '' }] })],
  ['renderTimelineSvg load rows', 'load row', 'L', id => renderTimelineSvg(rows(), bars(), [], scale, { loadRows: [{ id: 'L', label: 'L' }, { id, label: 'M' }] })],
  ['renderTimelineSvg baselineIds', 'baseline set', 'v', id => renderTimelineSvg(rows(), bars(), [], scale, { baselineIds: ['v', id] }), { invalid: ' (baselineIds)', duplicate: ' (baselineIds)' }],
  ['planBaselines', 'baseline set', null, id => planBaselines(scheduleTasks(plan()), id)],
  ['serializeWeaveSnapshot planning tasks', 'task', 'a', id => { const p = plan(); p.tasks[1].id = id; p.dependencies = []; p.assignments = []; snapshotError(() => serializeWeaveSnapshot({ kind: 'planning', data: p })) }],
  ['parseWeaveSnapshot timeline rows', 'row', 'r1', id => snapshotError(() => {
    const result = parseWeaveSnapshot(JSON.stringify({ kind: 'timeline', schemaVersion: 1, data: { rows: [{ id: 'r1', label: 'A' }, { id, label: 'B' }], bars: [] } }))
    throw new Error('Invalid snapshot: x: ' + result.diagnostics[0].message)
  })],
  ['resolveWindowedRequest items', 'windowed data item', 'i', id => windowed([{ id: 'i', start: 0, end: 1 }, { id, start: 1, end: 2 }]), { duplicate: ' (in one response)' }],
  ['resolveWindowedRequest links', 'windowed data link', 'l', id => windowed([], [{ id: 'l', from: 'a', to: 'b' }, { id, from: 'b', to: 'a' }]), { duplicate: ' (in one response)' }],
  ['setWindowedView view rows', 'view row', null, id => setWindowedView(createWindowedDataState({ chunkSize: 10 }), { start: 0, end: 5, rowIds: ['a', id] })],
  ['mergeGraphExpansionPage nodes', 'graph page node', 'n', id => mergeGraphExpansionPage(createGraphExpansion(), { nodes: [{ id: 'n' }, { id }] }), { duplicate: ' (in one page)' }],
  ['mergeGraphExpansionPage edges', 'graph page edge', 'e', id => mergeGraphExpansionPage(createGraphExpansion(), { edges: [{ id: 'e', from: 'a', to: 'b' }, { id, from: 'a', to: 'b' }] }), { duplicate: ' (in one page)' }],
  ['toMsProjectXml tasks', 'task', 'a', id => toMsProjectXml(msProject([{ id: 'a' }, { id }]))],
  ['toMsProjectXml resources', 'resource', 'r', id => toMsProjectXml({ ...msProject([{ id: 'a' }]), resources: [{ id: 'r', name: 'R' }, { id, name: 'Q' }] })],
  ['timelineFromMsProject tasks', 'task', 'a', id => timelineFromMsProject(msProject([{ id: 'a' }, { id }]))],
  ['toICalendar events', 'event', 'e', id => toICalendar(events(['e', id]), { timestamp: day })],
  ['timelineFromICalendar events', 'event', 'e', id => timelineFromICalendar(events(['e', id]))],
]

test('every function that validates IDs rejects the same defect with the same message format', () => {
  for (const [name, kind, first, call, context = {}] of cases) {
    for (const [value, shown] of [[5, '5'], [0, '0'], ['', '""'], [undefined, 'undefined'], [null, 'null'], [{}, 'object']]) {
      assert.throws(() => call(value), { name: 'Error', message: `Invalid ${kind} ID: ${shown}${context.invalid ?? ''}` }, `${name}: ${shown}`)
    }
    if (first !== null) {
      assert.throws(() => call(first), { name: 'Error', message: `Duplicate ${kind} ID: ${first}${context.duplicate ?? ''}` }, name + ': duplicate')
    }
  }
})

test('numeric IDs are rejected even where nothing else would notice them', () => {
  // Before the strict rule, these inputs were accepted.
  assert.throws(() => scheduleTasks({ range, tasks: [{ id: 'a', duration: 1 }], dependencies: [{ id: 7, from: 'a', to: 'a', type: 'SS' }] }), { message: 'Invalid dependency ID: 7' })
  assert.throws(() => scheduleTasks({ range, calendars: [{ id: 1, periods: [] }], tasks: [] }), { message: 'Invalid calendar ID: 1' })
  assert.throws(() => createTimelineRowTree([{ id: 0, label: 'A' }]), { message: 'Invalid row ID: 0' })
  assert.throws(() => renderTimelineSvg(rows(), bars(), [], scale, { markers: [{ id: 3, time: 1, label: 'M' }] }), { name: 'Error', message: 'Invalid marker ID: 3' })
  assert.throws(() => calculateResourceLoad(range, [{ id: 4, work: [] }], [], []), { message: 'Invalid task ID: 4' })
  assert.throws(() => renderTimelineSvg(rows(), bars(), [], scale, { columns: [{ id: 7, label: 'C', width: 40, value: () => '' }] }), { name: 'Error', message: 'Invalid column ID: 7' })
  // A marker with a valid ID but an invalid time, and a column with a valid ID but an invalid width, are still RangeErrors.
  assert.throws(() => renderTimelineSvg(rows(), bars(), [], scale, { markers: [{ id: 'm', time: Number.NaN, label: 'M' }] }), RangeError)
  assert.throws(() => renderTimelineSvg(rows(), bars(), [], scale, { columns: [{ id: 'c', label: 'C', width: 0, value: () => '' }] }), { name: 'RangeError', message: 'Invalid timeline column width: c' })
})

test('calculateResourceLoad and levelResources check assignments with the same messages', () => {
  const p = plan()
  const work = scheduleTasks(p).tasks
  const load = assignments => calculateResourceLoad(range, work, p.resources, assignments)
  const level = assignments => levelResources({ ...p, assignments })
  const hint = '. Tasks left out of a schedule result as inactive must be listed in options.inactiveTaskIds'
  for (const [assignments, error, loadSuffix = ''] of [
    [[{ resourceId: 'x', taskId: 'a' }], { name: 'Error', message: 'Unknown resource in assignment: x' }],
    [[{ resourceId: 5, taskId: 'a' }], { name: 'Error', message: 'Unknown resource in assignment: 5' }],
    [[{ resourceId: 'r', taskId: 'zz' }], { name: 'Error', message: 'Unknown task in assignment: zz' }, hint],
    [[{ resourceId: 'r', taskId: '' }], { name: 'Error', message: 'Unknown task in assignment: ""' }, hint],
    [[{ resourceId: 'r', taskId: 'a', units: 1.5 }], { name: 'RangeError', message: 'Assignment units must be a positive integer' }],
    [[{ resourceId: 'r', taskId: 'a', units: 0 }], { name: 'RangeError', message: 'Assignment units must be a positive integer' }],
    [[{ resourceId: 'r', taskId: 'a' }, { resourceId: 'r', taskId: 'a', units: 2 }], { name: 'Error', message: 'Duplicate assignment of task a to resource r' }],
  ]) {
    assert.throws(() => level(assignments), error)
    // The unknown-task hint is only true for calculateResourceLoad, which takes schedule results without inactive tasks.
    assert.throws(() => load(assignments), { ...error, message: error.message + loadSuffix })
  }
  // Pair keys cannot collide for IDs that contain a separator.
  const tricky = {
    range, tasks: [{ id: 'x","y', duration: 1 }, { id: 'x', duration: 1 }],
    resources: [{ id: 'z', capacity: 1 }, { id: 'y","z', capacity: 1 }],
    assignments: [{ resourceId: 'z', taskId: 'x","y' }, { resourceId: 'y","z', taskId: 'x' }],
  }
  assert.equal(levelResources(tricky).ok, true)
  assert.equal(calculateResourceLoad(range, scheduleTasks(tricky).tasks, tricky.resources, tricky.assignments).length, 4)
})

test('comparePlans reports the scheduler\'s own errors with the plan label, and keeps cycles a state', () => {
  const p = plan()
  const scheduler = input => {
    try {
      scheduleTasks(input)
    } catch (error) {
      return error
    }
    assert.fail('the scheduler accepted the input')
  }
  for (const broken of [
    { ...p, tasks: [...p.tasks, { id: 'a', duration: 1 }] },
    { ...p, tasks: [p.tasks[0], { id: 7, duration: 1 }] },
    { ...p, dependencies: [{ id: 'd', from: 'a', to: 'zz' }] },
    { ...p, tasks: [{ id: 'a', duration: 1.5 }, p.tasks[1]] },
    { ...p, quantum: 0 },
  ]) {
    const error = scheduler(broken)
    assert.throws(() => comparePlans({ input: broken }, { input: p }), { name: error.name, message: error.message + ' (current plan)' })
    assert.throws(() => comparePlans({ input: p }, { input: broken }), { name: error.name, message: error.message + ' (candidate plan)' })
    // A precomputed result does not skip the scheduler's validation of its input.
    assert.throws(() => comparePlans({ input: broken, result: scheduleTasks(p) }, { input: p }), { name: error.name, message: error.message + ' (current plan)' })
  }
  // The resource and assignment checks are the shared ones.
  assert.throws(() => comparePlans({ input: p }, { input: { ...p, resources: [p.resources[0], p.resources[0]] } }), { message: 'Duplicate resource ID: r (candidate plan)' })
  assert.throws(() => comparePlans({ input: { ...p, assignments: [p.assignments[0], p.assignments[0]] } }, { input: p }), { message: 'Duplicate assignment of task a to resource r (current plan)' })
  // Errors of the resource load are labelled the same way.
  assert.throws(() => comparePlans({ input: { ...p, assignments: [{ ...p.assignments[0], units: 0 }] } }, { input: p }), { name: 'RangeError', message: 'Assignment units must be a positive integer (current plan)' })
  // A cycle is a result state of the scheduler, so it stays a state.
  const cyclic = { ...p, dependencies: [...p.dependencies, { id: 'back', from: 'b', to: 'a' }] }
  const comparison = comparePlans({ input: p }, { input: cyclic })
  assert.equal(comparison.result.state.candidate.status, 'cycle')
})

test('actual interval errors are the scheduler\'s own messages for the same defect, with the task as context', () => {
  const input = { range, quantum: 2, tasks: [{ id: 'a', duration: 4 }] }
  const scheduler = pause => {
    try {
      scheduleTasks({ ...input, tasks: [{ id: 'a', duration: 4, pauses: [pause] }] })
    } catch (error) {
      return error
    }
    assert.fail('the scheduler accepted the pause')
  }
  for (const interval of [
    { start: Number.NaN, end: 4 }, { start: 0, end: Infinity }, { start: 1, end: 4 }, { start: 0.5, end: 4 }, { start: '0', end: 4 },
    { start: 6, end: 4 }, { start: 4, end: 4 }, { start: 0 },
  ]) {
    const error = scheduler(interval)
    assert.throws(() => rescheduleFromActuals(input, 10, new Map([['a', { intervals: [interval] }]])),
      { name: error.name, message: error.message + ' (actual interval of task a)' }, JSON.stringify(interval))
  }
  // Pauses may reach outside the range; actual intervals may not.
  for (const interval of [{ start: -2, end: 4 }, { start: 96, end: 102 }]) {
    assert.throws(() => rescheduleFromActuals(input, 10, new Map([['a', { intervals: [interval] }]])),
      { name: 'RangeError', message: 'Scheduling dates must lie inside the schedule range (actual interval of task a)' })
  }
  // Contradictions are still diagnostics, with their codes.
  const result = rescheduleFromActuals(input, 10, new Map([['a', { intervals: [{ start: 0, end: 4 }, { start: 2, end: 6 }, { start: 20, end: 22 }], finished: true, remainingWork: 2 }]]))
  assert.deepEqual([...new Set(result.diagnostics.map(item => item.code))], ['actual-contradiction', 'actual-overlap', 'actual-after-status-date'])
})
