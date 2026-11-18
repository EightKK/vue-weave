import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  buildWorkPeriods, calculateResourceLoad, fromMsProjectXml, projectResourceTimeline, resourceLoadFromMsProject,
  scheduleTasks, timelineFromMsProject, toMsProjectXml, workCalendarsFromMsProject,
} from 'vue-weave/core'

const hour = 3_600_000
const day = 24 * hour
// Monday 2026-11-09 00:00 UTC.
const monday = Date.parse('2026-11-09T00:00:00Z')

const weekDay = (type, times) => `<WeekDay><DayType>${type}</DayType><DayWorking>${times ? 1 : 0}</DayWorking>`
  + (times ? `<WorkingTimes>${times.map(([from, to]) => `<WorkingTime><FromTime>${from}</FromTime><ToTime>${to}</ToTime></WorkingTime>`).join('')}</WorkingTimes>` : '') + '</WeekDay>'
const standardDays = [1, 7].map(type => weekDay(type)).join('')
  + [2, 3, 4, 5, 6].map(type => weekDay(type, [['08:00:00', '12:00:00'], ['13:00:00', '17:00:00']])).join('')

const task = (uid, extra = '') => `<Task><UID>${uid}</UID><Name>T${uid}</Name><Start>2026-11-09T08:00:00</Start><Finish>2026-11-09T12:00:00</Finish>${extra}</Task>`
const mspdi = (body, tasks = task(1) + task(2)) => `<Project xmlns="http://schemas.microsoft.com/project"><Name>P</Name>${body}<Tasks>${tasks}</Tasks></Project>`

const fixture = mspdi(`<CalendarUID>1</CalendarUID><Calendars>
  <Calendar><UID>1</UID><Name>Standard</Name><IsBaseCalendar>1</IsBaseCalendar><WeekDays>${standardDays}
    <WeekDay><DayType>0</DayType><DayWorking>0</DayWorking><TimePeriod><FromDate>2026-12-24T00:00:00</FromDate><ToDate>2026-12-26T23:59:00</ToDate></TimePeriod></WeekDay>
  </WeekDays></Calendar>
  <Calendar><UID>2</UID><Name>Night</Name><IsBaseCalendar>0</IsBaseCalendar><BaseCalendarUID>1</BaseCalendarUID><WeekDays>
    ${weekDay(3, [['22:00:00', '00:00:00']])}
  </WeekDays><Exceptions><Exception><EnteredByOccurrences>0</EnteredByOccurrences><TimePeriod><FromDate>2026-12-28T00:00:00</FromDate><ToDate>2026-12-28T23:59:00</ToDate></TimePeriod><Occurrences>1</Occurrences><Name>Extra</Name><Type>1</Type><DayWorking>1</DayWorking><WorkingTimes><WorkingTime><FromTime>10:00:00</FromTime><ToTime>14:30:00</ToTime></WorkingTime></WorkingTimes></Exception></Exceptions></Calendar>
</Calendars>`, task(1, '<CalendarUID>2</CalendarUID>') + task(2, '<CalendarUID>-1</CalendarUID>'))
  .replace('</Tasks>', '</Tasks><Resources><Resource><UID>0</UID><Name>Unassigned</Name></Resource>'
    + '<Resource><UID>1</UID><Name>Ana</Name><Type>1</Type><MaxUnits>1.00</MaxUnits><CalendarUID>1</CalendarUID></Resource>'
    + '<Resource><UID>2</UID><Name>Crew</Name><Type>1</Type><MaxUnits>2.5</MaxUnits></Resource>'
    + '<Resource><UID>3</UID><Name>Steel</Name><Type>0</Type></Resource></Resources>'
    + '<Assignments><Assignment><UID>1</UID><TaskUID>1</TaskUID><ResourceUID>1</ResourceUID><Units>0.5</Units></Assignment>'
    + '<Assignment><UID>2</UID><TaskUID>2</TaskUID><ResourceUID>2</ResourceUID><Units>2</Units></Assignment>'
    + '<Assignment><UID>3</UID><TaskUID>2</TaskUID><ResourceUID>-65535</ResourceUID></Assignment></Assignments>')

test('fromMsProjectXml reads calendars with base inheritance, exceptions and the project calendar', () => {
  const imported = fromMsProjectXml(fixture)
  assert.deepEqual(imported.warnings, [])
  assert.equal(imported.defaultCalendarId, '1')
  assert.equal(imported.calendars.length, 2)
  const [standard, night] = imported.calendars
  assert.deepEqual({ id: standard.id, name: standard.name, base: standard.base, baseCalendarId: standard.baseCalendarId }, { id: '1', name: 'Standard', base: true, baseCalendarId: undefined })
  // Weekday 0 is Sunday, so DayType 2 is Monday.
  assert.deepEqual(standard.week.weekly.filter(shift => shift.weekday === 1), [
    { weekday: 1, startMinute: 480, endMinute: 720 }, { weekday: 1, startMinute: 780, endMinute: 1020 },
  ])
  assert.equal(standard.week.weekly.some(shift => shift.weekday === 0 || shift.weekday === 6), false)
  assert.deepEqual(Object.keys(standard.week.exceptions), ['2026-12-24', '2026-12-25', '2026-12-26'])
  assert.deepEqual(standard.week.exceptions['2026-12-25'], [])
  // The night calendar inherits everything except Tuesday (DayType 3) and adds its own exception.
  assert.equal(night.baseCalendarId, '1')
  assert.equal(night.base, false)
  assert.deepEqual(night.week.weekly.filter(shift => shift.weekday === 2), [{ weekday: 2, startMinute: 1320, endMinute: 1440 }])
  assert.deepEqual(night.week.weekly.filter(shift => shift.weekday === 1), standard.week.weekly.filter(shift => shift.weekday === 1))
  assert.deepEqual(night.week.exceptions['2026-12-28'], [{ startMinute: 600, endMinute: 870 }])
  assert.deepEqual(night.week.exceptions['2026-12-24'], [])
  assert.equal(imported.tasks[0].calendarId, '2')
  assert.equal(imported.tasks[1].calendarId, undefined)
})

test('imported calendars feed buildWorkPeriods, workCalendarsFromMsProject and scheduleTasks', () => {
  const imported = fromMsProjectXml(fixture)
  const range = { start: monday, end: monday + 7 * day }
  const periods = buildWorkPeriods(range, imported.calendars[0].week)
  assert.equal(periods.length, 10)
  assert.deepEqual(periods[0], { start: monday + 8 * hour, end: monday + 12 * hour })
  const calendars = workCalendarsFromMsProject(imported, range)
  assert.deepEqual(calendars.map(calendar => calendar.id), ['1', '2'])
  assert.deepEqual(calendars[0].periods, periods)
  const result = scheduleTasks({
    range, calendars, defaultCalendarId: imported.defaultCalendarId,
    tasks: imported.tasks.map(item => ({ id: item.id, duration: 6 * hour, ...(item.calendarId ? { calendarId: item.calendarId } : {}) })),
  })
  assert.equal(result.ok, true)
  // Task 2 uses the standard calendar: 08-12 and 13-15 on Monday.
  assert.equal(result.tasks.find(item => item.id === '2').end, monday + 15 * hour)
})

test('a wall-clock offset moves calendar weeks the same way as dates', () => {
  const imported = fromMsProjectXml(fixture, { utcOffsetMinutes: 540 })
  assert.equal(imported.calendars[0].week.utcOffsetMinutes, 540)
  const periods = buildWorkPeriods({ start: monday - day, end: monday + day }, imported.calendars[0].week)
  // Monday 08:00 at +09:00 is Sunday 23:00 UTC.
  assert.equal(periods[0].start, monday - hour)
  assert.equal(fromMsProjectXml(fixture).calendars[0].week.utcOffsetMinutes, undefined)
})

test('fromMsProjectXml reads resources and assignments as fractions, and skips the unassigned placeholders', () => {
  const imported = fromMsProjectXml(fixture)
  assert.deepEqual(imported.resources, [
    { id: '1', name: 'Ana', type: 'work', maxUnits: 1, calendarId: '1' },
    { id: '2', name: 'Crew', type: 'work', maxUnits: 2.5 },
    { id: '3', name: 'Steel', type: 'material' },
  ])
  assert.deepEqual(imported.assignments, [
    { taskId: '1', resourceId: '1', units: 0.5 }, { taskId: '2', resourceId: '2', units: 2 },
  ])
})

test('resourceLoadFromMsProject maps to calculateResourceLoad, levelResources and projectResourceTimeline shapes', () => {
  const imported = fromMsProjectXml(fixture)
  const load = resourceLoadFromMsProject(imported)
  assert.deepEqual(load.resources, [{ id: '1', capacity: 100 }, { id: '2', capacity: 250 }])
  assert.deepEqual(load.assignments, [
    { resourceId: '1', taskId: '1', units: 50 }, { resourceId: '2', taskId: '2', units: 200 },
  ])
  assert.deepEqual(load.warnings, [])
  const range = { start: monday, end: monday + day }
  const work = [{ start: monday + 8 * hour, end: monday + 12 * hour }]
  const segments = calculateResourceLoad(range, imported.tasks.map(item => ({ id: item.id, work })), load.resources, load.assignments)
  assert.equal(segments.every(segment => segment.overload === 0), true)
  assert.equal(segments.find(segment => segment.resourceId === '1' && segment.load > 0).load, 50)
  // With a range the resource calendar limits availability.
  const limited = resourceLoadFromMsProject(imported, { range })
  assert.deepEqual(limited.resources[0].periods, [
    { start: monday + 8 * hour, end: monday + 12 * hour }, { start: monday + 13 * hour, end: monday + 17 * hour },
  ])
  assert.equal(limited.resources[1].periods, undefined)
  assert.deepEqual(resourceLoadFromMsProject(imported, { unitScale: 1 }).resources.map(resource => resource.capacity), [1, 3])
  const tiny = resourceLoadFromMsProject({
    name: 'P', tasks: [{ id: 'a', name: 'A', start: 0, end: 1 }], resources: [{ id: 'r', name: 'R' }],
    assignments: [{ taskId: 'a', resourceId: 'r', units: 0.2 }],
  }, { unitScale: 1 })
  assert.deepEqual(tiny.assignments, [])
  assert.deepEqual(tiny.warnings.map(warning => [warning.code, warning.taskId, warning.resourceId]), [['skipped-assignment', 'a', 'r']])
  assert.throws(() => resourceLoadFromMsProject(imported, { unitScale: 0 }), RangeError)

  const timeline = timelineFromMsProject(imported)
  assert.deepEqual(timeline.resources, [{ id: '1', label: 'Ana' }, { id: '2', label: 'Crew' }])
  assert.deepEqual(timeline.assignments, load.assignments)
  const projection = projectResourceTimeline({
    resources: timeline.resources, assignments: timeline.assignments,
    tasks: timeline.bars.map(({ rowId, lane, ...bar }) => bar),
  })
  assert.equal(projection.bars.length, 2)
})

test('summary-task assignments and material resources are left out of the load shapes', () => {
  const nested = mspdi('', task(1, '<OutlineLevel>1</OutlineLevel>') + task(2, '<OutlineLevel>2</OutlineLevel>'))
    .replace('</Project>', '<Resources><Resource><UID>1</UID><Name>A</Name></Resource><Resource><UID>2</UID><Name>M</Name><Type>0</Type></Resource></Resources>'
      + '<Assignments><Assignment><TaskUID>1</TaskUID><ResourceUID>1</ResourceUID></Assignment>'
      + '<Assignment><TaskUID>2</TaskUID><ResourceUID>1</ResourceUID></Assignment>'
      + '<Assignment><TaskUID>2</TaskUID><ResourceUID>2</ResourceUID></Assignment></Assignments></Project>')
  const imported = fromMsProjectXml(nested)
  assert.equal(imported.assignments.length, 3)
  const load = resourceLoadFromMsProject(imported)
  assert.deepEqual(load.assignments, [{ resourceId: '1', taskId: '2', units: 100 }])
})

test('MSPDI calendar, resource and assignment problems become warnings, not errors', () => {
  const xml = mspdi(`<CalendarUID>9</CalendarUID><Calendars>
    <Calendar><UID>x</UID><Name>Bad</Name></Calendar>
    <Calendar><UID>1</UID><Name>A</Name><BaseCalendarUID>2</BaseCalendarUID><WeekDays>
      ${weekDay(2, [['08:00:00', '12:00:00'], ['nope', '12:00:00'], ['12:00:00', '08:00:00']])}
      <WeekDay><DayType>3</DayType><DayWorking>1</DayWorking></WeekDay>
      <WeekDay><DayType>9</DayType><DayWorking>0</DayWorking></WeekDay>
      <WeekDay><DayType>0</DayType><DayWorking>0</DayWorking><TimePeriod><FromDate>2026-02-30T00:00:00</FromDate><ToDate>2026-02-30T23:59:00</ToDate></TimePeriod></WeekDay>
    </WeekDays><Exceptions><Exception><TimePeriod><FromDate>2026-01-01T00:00:00</FromDate><ToDate>2026-12-31T00:00:00</ToDate></TimePeriod><Occurrences>5</Occurrences><Type>3</Type><DayWorking>0</DayWorking></Exception></Exceptions>
    <WorkWeeks><WorkWeek><Name>Summer</Name></WorkWeek></WorkWeeks></Calendar>
    <Calendar><UID>2</UID><Name>B</Name><BaseCalendarUID>3</BaseCalendarUID></Calendar>
    <Calendar><UID>3</UID><Name>C</Name><BaseCalendarUID>2</BaseCalendarUID></Calendar>
    <Calendar><UID>1</UID><Name>Again</Name></Calendar>
  </Calendars>`, task(1, '<CalendarUID>7</CalendarUID>') + task(2))
    .replace('</Tasks>', '</Tasks><Resources><Resource><UID>a</UID><Name>x</Name></Resource><Resource><UID>1</UID><Name>R</Name><MaxUnits>abc</MaxUnits><Type>9</Type><CalendarUID>8</CalendarUID></Resource><Resource><UID>1</UID><Name>Dup</Name></Resource></Resources>'
      + '<Assignments><Assignment><TaskUID>1</TaskUID><ResourceUID>1</ResourceUID><Units>-3</Units></Assignment>'
      + '<Assignment><TaskUID>1</TaskUID><ResourceUID>1</ResourceUID></Assignment>'
      + '<Assignment><TaskUID>5</TaskUID><ResourceUID>1</ResourceUID></Assignment>'
      + '<Assignment><TaskUID>1</TaskUID><ResourceUID>6</ResourceUID></Assignment></Assignments>')
  const imported = fromMsProjectXml(xml)
  const codes = imported.warnings.map(warning => warning.code)
  for (const code of ['skipped-calendar', 'invalid-calendar', 'unsupported-calendar', 'unknown-calendar', 'skipped-resource', 'skipped-assignment', 'invalid-value']) {
    assert.ok(codes.includes(code), code)
  }
  assert.equal(imported.warnings.filter(warning => warning.code === 'skipped-calendar').length, 2)
  assert.equal(imported.defaultCalendarId, undefined)
  assert.equal(imported.tasks[0].calendarId, undefined)
  assert.deepEqual(imported.calendars.map(calendar => calendar.id), ['1', '2', '3'])
  // Only the readable working time survives; the working day without times and the bad exception are left out.
  assert.deepEqual(imported.calendars[0].week.weekly, [{ weekday: 1, startMinute: 480, endMinute: 720 }])
  assert.equal(imported.calendars[0].week.exceptions, undefined)
  assert.equal(imported.calendars[0].baseCalendarId, '2')
  assert.equal(imported.resources.length, 1)
  assert.deepEqual(imported.assignments, [{ taskId: '1', resourceId: '1' }])
  assert.equal(imported.warnings.find(warning => warning.code === 'skipped-resource' && warning.resourceId === '1').resourceId, '1')
})

test('a very long base calendar chain resolves without recursion', () => {
  const count = 20_000
  let calendars = `<Calendar><UID>1</UID><Name>0</Name><WeekDays>${weekDay(2, [['08:00:00', '16:00:00']])}</WeekDays></Calendar>`
  for (let uid = 2; uid <= count; uid++) calendars += `<Calendar><UID>${uid}</UID><Name>${uid}</Name><BaseCalendarUID>${uid - 1}</BaseCalendarUID></Calendar>`
  const imported = fromMsProjectXml(mspdi(`<Calendars>${calendars}</Calendars>`))
  assert.equal(imported.calendars.length, count)
  assert.deepEqual(imported.calendars.at(-1).week.weekly, [{ weekday: 1, startMinute: 480, endMinute: 960 }])
})

test('a plain export has none of the new fields, and its import is unchanged', () => {
  const plan = { name: 'P', tasks: [{ id: 'a', name: 'A', start: monday, end: monday + hour }] }
  const xml = toMsProjectXml(plan)
  assert.equal(/Calendar|Resource|Assignment/.test(xml), false)
  const imported = fromMsProjectXml(xml)
  assert.deepEqual(Object.keys(imported).sort(), ['dependencies', 'name', 'tasks', 'warnings'])
  assert.equal('calendarId' in imported.tasks[0], false)
  assert.equal('resources' in timelineFromMsProject(imported), false)
})

test('toMsProjectXml writes calendars, resources and assignments that fromMsProjectXml reads back', () => {
  const imported = fromMsProjectXml(fixture)
  const plan = {
    name: 'Round trip', tasks: imported.tasks.map(item => ({ ...item })),
    calendars: imported.calendars, defaultCalendarId: imported.defaultCalendarId,
    resources: imported.resources, assignments: imported.assignments,
  }
  const original = JSON.stringify(plan)
  const xml = toMsProjectXml(plan)
  assert.equal(JSON.stringify(plan), original)
  assert.ok(xml.indexOf('<Calendars>') < xml.indexOf('<Tasks>') && xml.indexOf('<Tasks>') < xml.indexOf('<Resources>') && xml.indexOf('<Resources>') < xml.indexOf('<Assignments>'))
  const again = fromMsProjectXml(xml)
  assert.deepEqual(again.warnings, [])
  assert.equal(again.defaultCalendarId, '1')
  assert.deepEqual(again.calendars.map(calendar => calendar.week), imported.calendars.map(calendar => calendar.week))
  assert.deepEqual(again.calendars.map(calendar => calendar.name), ['Standard', 'Night'])
  assert.deepEqual(again.tasks.map(item => item.calendarId), ['2', undefined])
  assert.deepEqual(again.resources, imported.resources)
  assert.deepEqual(again.assignments, imported.assignments)
  assert.equal(toMsProjectXml(again), xml)
})

test('toMsProjectXml validates calendars, resources and assignments', () => {
  const week = { weekly: [{ weekday: 1, startMinute: 480, endMinute: 720 }] }
  const base = { name: 'P', tasks: [{ id: 'a', name: 'A', start: 0, end: 1000 }] }
  const calendars = [{ id: 'c', name: 'C', week }]
  const resources = [{ id: 'r', name: 'R' }]
  const bad = (extra, error) => assert.throws(() => toMsProjectXml({ ...base, ...extra }), error)
  bad({ calendars: [...calendars, ...calendars] }, Error)
  bad({ calendars: [{ id: 'c', week }] }, /name/)
  bad({ calendars: [{ id: 'c', name: 'C', week: { weekly: [{ weekday: 7, startMinute: 0, endMinute: 60 }] } }] }, RangeError)
  bad({ calendars: [{ id: 'c', name: 'C', week: { weekly: [{ weekday: 1, startMinute: 1380, endMinute: 1500 }] } }] }, /midnight/)
  bad({ calendars: [{ id: 'c', name: 'C', week: { weekly: [], exceptions: { '2026-02-30': [] } } }] }, RangeError)
  bad({ calendars, defaultCalendarId: 'x' }, /default calendar/)
  bad({ tasks: [{ ...base.tasks[0], calendarId: 'x' }] }, /calendar of task/)
  bad({ resources: [...resources, ...resources] }, Error)
  bad({ resources: [{ id: 'r', name: 'R', type: 'robot' }] }, Error)
  bad({ resources: [{ id: 'r', name: 'R', maxUnits: -1 }] }, RangeError)
  bad({ resources: [{ id: 'r', name: 'R', calendarId: 'x' }] }, /calendar of resource/)
  bad({ resources, assignments: [{ taskId: 'zzz', resourceId: 'r' }] }, /Unknown task or resource/)
  bad({ resources, assignments: [{ taskId: 'a', resourceId: 'r' }, { taskId: 'a', resourceId: 'r' }] }, /Duplicate/)
  bad({ resources, assignments: [{ taskId: 'a', resourceId: 'r', units: Infinity }] }, RangeError)
})
