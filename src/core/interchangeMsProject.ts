// Microsoft Project XML (MSPDI): `toMsProjectXml`, `fromMsProjectXml` and the conversions of a plan to work calendars,
// resource load and GanttChart data. Pure string builders and readers without a DOM. Re-exported by `interchange.ts`.
import { xmlText } from './interchangeXml.js'
import {
  checkOffset, checkText, checkTime, dayMs, durationMs, isoText, minuteMs, pad2, pushWarning, secondMs, toSecond, wallTime,
} from './interchangeShared.js'
import { childMap, parseXml, type XmlElement } from './interchangeXml.js'
import type { ResourceAssignment, ResourceCapacity } from './resourceLoad.js'
import type { ResourceTimelineResource } from './resourceTimeline.js'
import { timelineBaselineId, timelineConstraints, type TimeRange } from './timeline.js'
import { buildWorkPeriods, type WeeklyShift, type WorkCalendar, type WorkShift, type WorkWeek } from './workCalendar.js'
import type {
  TimelineBar, TimelineConstraintKind, TimelineConstraints, TimelineDependency, TimelineDependencyType, TimelineRow,
} from './types.js'
import { duplicateIdError, inContext, invalidIdError, isId } from './ids.js'
import { createAssignmentChecker } from './resourceCapacity.js'

export interface MsProjectTask {
  id: string
  name: string
  /** Epoch milliseconds. */
  start: number
  /** Epoch milliseconds, not before `start`. */
  end: number
  /** Outline level from 1 (top level). Each task is at most one level below the task before it. Default 1. */
  outlineLevel?: number
  /** Percent complete from 0 to 100, rounded to an integer. */
  percentComplete?: number
  /** Export as a milestone. Tasks with `start === end` are always milestones. */
  milestone?: boolean
  /** Saved baselines, written as `Baseline` elements; at most one per `number`. */
  baselines?: readonly MsProjectBaseline[]
  /**
   * Scheduling constraints in epoch milliseconds, for example `TimelineBar.constraints`. A Microsoft Project task holds
   * one constraint, so exactly one set constraint is written as `ConstraintType` and `ConstraintDate`. The one pair that
   * Microsoft Project can express, `finishNoEarlierThan` and `finishNoLaterThan` at the same time, is written as Must
   * Finish On (3); any other combination of two or more writes none.
   */
  constraints?: TimelineConstraints
  /** Export as an inactive task (`Active` 0), which Microsoft Project leaves out of its calculation. Default false. */
  inactive?: boolean
  /**
   * False exports an automatically scheduled task (`Manual` 0). Microsoft Project then recalculates its dates from its
   * links, constraint and its own calendar when it opens the file, so they can move. Default true: a manually scheduled
   * task that keeps the given dates.
   */
  manual?: boolean
  /** ID of an `MsProjectCalendar` of the project: the task's own calendar (`CalendarUID`). Default: the project calendar. */
  calendarId?: string
}

/**
 * A calendar of a Microsoft Project plan: a weekly pattern with date exceptions, as `WorkWeek` of `buildWorkPeriods`
 * holds it. Shift minutes are local wall-clock times.
 */
export interface MsProjectCalendar {
  /** Unique within the project. `toMsProjectXml` numbers calendars from 1 in input order and does not write this ID. */
  id: string
  name: string
  /** Read from `IsBaseCalendar`. `toMsProjectXml` ignores it and writes every calendar as a base calendar. */
  base?: boolean
  /** The ID of the calendar this one was derived from (`BaseCalendarUID`). Informational: `week` is already complete. */
  baseCalendarId?: string
  /**
   * The complete weekly pattern and exceptions, with everything inherited from the base calendar already applied. A
   * weekday without shifts is non-working. `toMsProjectXml` writes only `weekly` and `exceptions`: `utcOffsetMinutes` and
   * `timeZone` are ignored (MSPDI times are wall-clock times), and a shift that ends after minute 1440 throws a RangeError.
   */
  week: WorkWeek
}

/** A resource of a Microsoft Project plan. */
export interface MsProjectResource {
  /** Unique within the project. `toMsProjectXml` numbers resources from 1 in input order and does not write this ID. */
  id: string
  name: string
  /**
   * `Type` 0 material or 1 work; a cost resource has `IsCostResource` 1 (read also from `Type` 2). Absent counts as
   * `'work'` where it matters.
   */
  type?: 'work' | 'material' | 'cost'
  /** `MaxUnits` as a fraction of one full-time resource: 1 is 100 %, 2.5 is 250 %. Absent counts as 1. */
  maxUnits?: number
  /** ID of an `MsProjectCalendar`: the resource's own working time (`CalendarUID`). */
  calendarId?: string
}

/** A resource assigned to a task. At most one assignment per task and resource. */
export interface MsProjectAssignment {
  taskId: string
  resourceId: string
  /** `Units` as a fraction of full time: 1 is 100 %. Absent counts as 1. */
  units?: number
}

/**
 * A saved baseline of a task. Microsoft Project numbers its baselines 0 (Baseline) to 10 (Baseline10); map your baseline
 * set IDs to numbers, for example `plan` to 0 and `rev1` to 1.
 */
export interface MsProjectBaseline {
  /** Integer from 0 to 10. */
  number: number
  /** Epoch milliseconds. */
  start: number
  /** Epoch milliseconds, not before `start`. */
  end: number
}

export interface MsProjectDependency {
  from: string
  to: string
  /** Default FS. */
  type?: TimelineDependencyType
  /** Elapsed lag in milliseconds; negative values are leads. Written in tenths of a minute. */
  lag?: number
}

export interface MsProjectInput {
  name: string
  tasks: readonly MsProjectTask[]
  dependencies?: readonly MsProjectDependency[]
  /** Calendars, written by `toMsProjectXml` and read by `fromMsProjectXml`. */
  calendars?: readonly MsProjectCalendar[]
  /** The ID of the project calendar (`CalendarUID`), one of `calendars`. */
  defaultCalendarId?: string
  resources?: readonly MsProjectResource[]
  assignments?: readonly MsProjectAssignment[]
}

export interface MsProjectXmlOptions {
  /** Fixed offset from UTC in minutes for the written wall-clock dates. Default 0 (UTC). */
  utcOffsetMinutes?: number
}

// MSPDI Resource `Type`: 0 material, 1 work. A cost resource is `IsCostResource` 1 (Project 2007 and later); the Type
// element reference also lists 2 for it, but the Resource element reference describes Type as work or material only.
// So `'cost'` is written as Type 0 with IsCostResource 1, which a reader without IsCostResource sees as a material
// resource without work capacity. Reading accepts IsCostResource 1 with any Type, and Type 2.
const resourceTypes = { material: 0, work: 1, cost: 0 } as const
const linkTypes: Record<TimelineDependencyType, number> = { FF: 0, FS: 1, SF: 2, SS: 3 }
// MSPDI ConstraintType: 2 Must Start On, 4 Start No Earlier Than, 5 Start No Later Than, 6 Finish No Earlier Than and
// 7 Finish No Later Than. Type 3 (Must Finish On) is the pair finishNoEarlierThan + finishNoLaterThan at one time.
const constraintTypes: Record<TimelineConstraintKind, number> = {
  fixedStart: 2, startNoEarlierThan: 4, startNoLaterThan: 5, finishNoEarlierThan: 6, finishNoLaterThan: 7,
}

/**
 * Check the tasks of a Microsoft Project input as `toMsProjectXml` needs them and return their outline levels and
 * UIDs (from 1 in input order).
 */
function checkMsProjectTasks(tasks: readonly MsProjectTask[]) {
  const uids = new Map<string, number>()
  let previousLevel = 0
  const levels: number[] = []
  for (const task of tasks) {
    if (!isId(task.id)) throw invalidIdError('task', task.id)
    if (uids.has(task.id)) throw duplicateIdError('task', task.id)
    checkText(task.name, 'The name of task ' + task.id)
    checkTime(task.start, 'Task start')
    checkTime(task.end, 'Task end')
    if (task.end < task.start) throw new RangeError('A task cannot end before it starts: ' + task.id)
    const level = task.outlineLevel ?? 1
    if (!Number.isInteger(level) || level < 1 || level > previousLevel + 1) {
      throw new RangeError('Outline levels must start at 1 and grow by at most one per task: ' + task.id)
    }
    const percent = task.percentComplete
    if (percent !== undefined && (typeof percent !== 'number' || !Number.isFinite(percent) || percent < 0 || percent > 100)) {
      throw new RangeError('percentComplete must be between 0 and 100: ' + task.id)
    }
    if (task.baselines !== undefined) {
      if (!Array.isArray(task.baselines)) throw new Error('baselines must be an array: ' + task.id)
      const numbers = new Set<number>()
      for (const baseline of task.baselines as readonly MsProjectBaseline[]) {
        const number = baseline?.number
        if (typeof number !== 'number' || !Number.isInteger(number) || number < 0 || number > 10) {
          throw new RangeError('Baseline numbers must be integers from 0 to 10: ' + task.id)
        }
        if (numbers.has(number)) throw new Error(`Duplicate baseline ${number} on task ${task.id}`)
        numbers.add(number)
        checkTime(baseline.start, 'Baseline start')
        checkTime(baseline.end, 'Baseline end')
        if (baseline.end < baseline.start) throw new RangeError(`Baseline ${number} of task ${task.id} cannot end before it starts`)
      }
    }
    for (const time of Object.values(timelineConstraints(task.constraints) ?? {})) checkTime(time, 'Constraint of task ' + task.id)
    for (const flag of ['inactive', 'manual'] as const) {
      if (task[flag] !== undefined && typeof task[flag] !== 'boolean') throw new Error(`${flag} must be a boolean: ${task.id}`)
    }
    uids.set(task.id, uids.size + 1)
    levels.push(level)
    previousLevel = level
  }
  return { uids, levels }
}

/** Check a dependency against the task UIDs and return its MSPDI link type and its lag. */
function checkMsProjectDependency(dependency: MsProjectDependency, uids: ReadonlyMap<string, number>) {
  const from = uids.get(dependency.from), to = uids.get(dependency.to)
  if (from === undefined || to === undefined) throw new Error(`Unknown dependency end: ${dependency.from} → ${dependency.to}`)
  // MS Project rejects a task that is its own predecessor.
  if (from === to) throw new Error(`Dependency ${dependency.from} → ${dependency.to} links task ${dependency.from} to itself`)
  const name = dependency.type ?? 'FS'
  const type = Object.hasOwn(linkTypes, name) ? linkTypes[name] : undefined
  if (type === undefined) throw new Error('Invalid dependency type: ' + dependency.type)
  const lag = dependency.lag ?? 0
  if (typeof lag !== 'number' || !Number.isFinite(lag)) throw new RangeError('Dependency lag must be finite')
  return { from, type, lag }
}

/** A local ISO date-time without an offset, as MSPDI expects. `time` is a whole second. */
function localIso(time: number, offset: number) {
  return isoText(time + offset * minuteMs).slice(0, 19)
}

/** An ISO 8601 duration with whole hours, minutes and seconds, such as PT26H30M0S. `ms` is whole seconds. */
function isoDuration(ms: number) {
  const seconds = Math.round(ms / secondMs)
  return `PT${Math.floor(seconds / 3600)}H${Math.floor(seconds % 3600 / 60)}M${seconds % 60}S`
}

/**
 * `ConstraintType` and `ConstraintDate` of a task with exactly one constraint, or with exactly the finish pair at one
 * time (Must Finish On); empty strings otherwise. They are separate because `CalendarUID` sits between them.
 */
function constraintElements(constraints: TimelineConstraints | undefined, offset: number): [string, string] {
  const set = Object.entries(timelineConstraints(constraints) ?? {}) as [TimelineConstraintKind, number][]
  const pair = (type: number, time: number): [string, string] =>
    [`<ConstraintType>${type}</ConstraintType>`, `<ConstraintDate>${localIso(toSecond(time), offset)}</ConstraintDate>`]
  if (set.length === 2) {
    const earliest = set.find(([kind]) => kind === 'finishNoEarlierThan'), latest = set.find(([kind]) => kind === 'finishNoLaterThan')
    if (earliest && latest && earliest[1] === latest[1]) return pair(3, earliest[1])
    return ['', '']
  }
  if (set.length !== 1) return ['', '']
  const [kind, time] = set[0]!
  return pair(constraintTypes[kind], time)
}

function uniqueNumbered<T extends { id: string }>(items: readonly T[] | undefined, what: string) {
  const uids = new Map<string, number>()
  if (items === undefined) return uids
  if (!Array.isArray(items)) throw new Error(what + 's must be an array')
  for (const item of items) {
    if (!isId(item?.id)) throw invalidIdError(what, item?.id)
    if (uids.has(item.id)) throw duplicateIdError(what, item.id)
    uids.set(item.id, uids.size + 1)
  }
  return uids
}

function checkWorkShift(shift: WorkShift, what: string) {
  const { startMinute, endMinute } = shift ?? {}
  if (!Number.isInteger(startMinute) || !Number.isInteger(endMinute) || startMinute < 0 || startMinute >= 1440 || endMinute <= startMinute) {
    throw new RangeError('Invalid shift minutes in ' + what)
  }
  if (endMinute > 1440) throw new RangeError('A shift that ends after midnight cannot be written; split it at midnight: ' + what)
}

/** Check calendars, resources and assignments as `toMsProjectXml` needs them; returns the UID of each ID. */
function checkMsProjectExtras(project: MsProjectInput, taskUids: ReadonlyMap<string, number>) {
  const calendarUids = uniqueNumbered(project.calendars, 'calendar')
  const resourceUids = uniqueNumbered(project.resources, 'resource')
  for (const calendar of project.calendars ?? []) {
    checkText(calendar.name, 'The name of calendar ' + calendar.id)
    const week = calendar.week
    if (!week || !Array.isArray(week.weekly)) throw new Error('Calendar ' + calendar.id + ' needs a week with a weekly array')
    for (const shift of week.weekly) {
      checkWorkShift(shift, 'calendar ' + calendar.id)
      if (!Number.isInteger(shift.weekday) || shift.weekday < 0 || shift.weekday > 6) throw new RangeError('Invalid weekday in calendar ' + calendar.id)
    }
    if (week.exceptions !== undefined && (typeof week.exceptions !== 'object' || week.exceptions === null || Array.isArray(week.exceptions))) {
      throw new Error(`The exceptions of calendar ${calendar.id} must be an object of dates`)
    }
    for (const [date, shifts] of Object.entries(week.exceptions ?? {})) {
      // civilDay is 0 for 1970-01-01, so compare with undefined.
      if (civilDay(date) === undefined) throw new RangeError(`Invalid exception date in calendar ${calendar.id}: ${date}`)
      if (!Array.isArray(shifts)) throw new Error(`The exception ${date} of calendar ${calendar.id} must be an array of shifts`)
      for (const shift of shifts) checkWorkShift(shift, 'calendar ' + calendar.id)
    }
  }
  if (project.defaultCalendarId !== undefined && !calendarUids.has(project.defaultCalendarId)) {
    throw new Error('Unknown default calendar: ' + project.defaultCalendarId)
  }
  for (const task of project.tasks) {
    if (task.calendarId !== undefined && !calendarUids.has(task.calendarId)) throw new Error(`Unknown calendar of task ${task.id}: ${task.calendarId}`)
  }
  for (const resource of project.resources ?? []) {
    checkText(resource.name, 'The name of resource ' + resource.id)
    if (resource.type !== undefined && !Object.hasOwn(resourceTypes, resource.type)) throw new Error(`Invalid type of resource ${resource.id}: ${resource.type}`)
    if (resource.maxUnits !== undefined && (typeof resource.maxUnits !== 'number' || !Number.isFinite(resource.maxUnits) || resource.maxUnits < 0)) {
      throw new RangeError('maxUnits must be a finite number of at least 0: ' + resource.id)
    }
    if (resource.calendarId !== undefined && !calendarUids.has(resource.calendarId)) throw new Error(`Unknown calendar of resource ${resource.id}: ${resource.calendarId}`)
  }
  // Units are fractions of a resource here, so only the references and pairs use the shared assignment checks.
  const check = createAssignmentChecker({ hasTask: id => taskUids.has(id), hasResource: id => resourceUids.has(id), units: false })
  for (const assignment of project.assignments ?? []) {
    check(assignment)
    const units = assignment.units
    if (units !== undefined && (typeof units !== 'number' || !Number.isFinite(units) || units < 0)) {
      throw new RangeError(`Assignment units must be a finite number of at least 0: ${assignment.taskId}, ${assignment.resourceId}`)
    }
  }
  return { calendarUids, resourceUids }
}

/** The epoch milliseconds of the UTC midnight of a `YYYY-MM-DD` civil date, or undefined when it is not a real date. */
function civilDay(date: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  return match ? wallTime(Number(match[1]), Number(match[2]), Number(match[3]), 0, 0, 0) : undefined
}

const clockText = (minute: number) => `${pad2(Math.floor(minute / 60) % 24)}:${pad2(minute % 60)}:00`

function workingTimesXml(shifts: readonly WorkShift[]) {
  const sorted = [...shifts].sort((a, b) => a.startMinute - b.startMinute || a.endMinute - b.endMinute)
  return '<WorkingTimes>' + sorted.map(shift =>
    `<WorkingTime><FromTime>${clockText(shift.startMinute)}</FromTime><ToTime>${clockText(shift.endMinute)}</ToTime></WorkingTime>`).join('') + '</WorkingTimes>'
}

function calendarXml(calendar: MsProjectCalendar, uid: number) {
  const { week } = calendar
  const days = Array.from({ length: 7 }, (_, weekday) => {
    const shifts = week.weekly.filter(shift => shift.weekday === weekday)
    return `<WeekDay><DayType>${weekday + 1}</DayType><DayWorking>${shifts.length ? 1 : 0}</DayWorking>${shifts.length ? workingTimesXml(shifts) : ''}</WeekDay>`
  })
  for (const date of Object.keys(week.exceptions ?? {}).sort()) {
    const shifts = week.exceptions![date]!
    days.push(`<WeekDay><DayType>0</DayType><DayWorking>${shifts.length ? 1 : 0}</DayWorking>`
      + `<TimePeriod><FromDate>${date}T00:00:00</FromDate><ToDate>${date}T23:59:00</ToDate></TimePeriod>${shifts.length ? workingTimesXml(shifts) : ''}</WeekDay>`)
  }
  return `<Calendar><UID>${uid}</UID><Name>${xmlText(calendar.name)}</Name><IsBaseCalendar>1</IsBaseCalendar>`
    + `<WeekDays>${days.join('')}</WeekDays></Calendar>`
}

/**
 * Build a Microsoft Project XML (MSPDI) document that Microsoft Project and compatible tools can open. Each task
 * becomes a manually scheduled task (so its dates are kept as given) with a UID and ID from 1 in input order, its
 * name, start, finish, elapsed duration, outline level and number, milestone and summary flags and percent complete.
 * Dependencies become `PredecessorLink` elements with the MSPDI link type (FF 0, FS 1, SF 2, SS 3) and the lag in
 * tenths of a minute as elapsed minutes. Dates are wall-clock times at `utcOffsetMinutes` without an offset suffix.
 * Start and finish are rounded to the nearest whole second, and the duration is the difference of the rounded times.
 *
 * Task `baselines` become `Baseline` elements (after the predecessor links) with their number, start, finish and elapsed
 * duration, rounded like the task dates.
 *
 * A task with exactly one constraint in `constraints` gets `ConstraintType` (2 Must Start On for `fixedStart`, 4 to 7 for
 * start no earlier, start no later, finish no earlier and finish no later than) and `ConstraintDate`, rounded like the
 * task dates. A task can hold only one constraint in Microsoft Project, so a task with several gets none, except one
 * whose constraints are exactly `finishNoEarlierThan` and `finishNoLaterThan` at the same time: it gets 3 (Must Finish
 * On) with that time.
 *
 * A task with `inactive: true` is written with `Active` 0, and one with `manual: false` as automatically scheduled
 * (`Manual` 0); without them every task is active and manually scheduled.
 *
 * Optional `calendars`, `resources` and `assignments` are written as `Calendars`, `Resources` and `Assignments` with UIDs
 * from 1 in input order. Every calendar is written as a base calendar with its complete weekly pattern (`DayType` 1 to 7,
 * Sunday first) and each exception date as a `DayType` 0 entry with a `TimePeriod`. `defaultCalendarId` and a task's
 * `calendarId` become `CalendarUID`. A resource gets `Type` (0 material, 1 work; a cost resource 0 with `IsCostResource` 1),
 * `MaxUnits` (when set) and `CalendarUID`, an assignment `Units` (default 1). These
 * elements follow the MSPDI schema order but have not been opened in Microsoft Project itself.
 *
 * Not exported: a second constraint of a task (other than the Must Finish On pair), notes, custom fields, baseline
 * work or cost and the base-calendar inheritance and time zone of a calendar. Task, calendar and resource IDs of the
 * input are not written; the UIDs follow the input order.
 *
 * Throws an Error for empty or duplicate task IDs, a missing project or task name, unknown dependency ends, a
 * dependency from a task to itself, unknown link types, a duplicate baseline number on a task and `inactive` or `manual`
 * flags that are not booleans, and a RangeError for non-finite or unordered dates (also of baselines), an invalid
 * outline level, percent complete, lag, baseline number or constraint time. Calendars, resources and assignments throw an
 * Error for empty or duplicate IDs, missing names, unknown references and duplicate assignments, and a RangeError for
 * invalid shifts, exception dates, `maxUnits` or `units`.
 */
export function toMsProjectXml(project: MsProjectInput, options: MsProjectXmlOptions = {}): string {
  const offset = checkOffset(options.utcOffsetMinutes)
  checkText(project.name, 'The project name')
  const { uids, levels } = checkMsProjectTasks(project.tasks)
  const { calendarUids, resourceUids } = checkMsProjectExtras(project, uids)
  const predecessors = new Map<string, string[]>()
  for (const dependency of project.dependencies ?? []) {
    const { from, type, lag } = checkMsProjectDependency(dependency, uids)
    let list = predecessors.get(dependency.to)
    if (!list) predecessors.set(dependency.to, list = [])
    list.push('<PredecessorLink>'
      + `<PredecessorUID>${from}</PredecessorUID><Type>${type}</Type><CrossProject>0</CrossProject>`
      + `<LinkLag>${Math.round(lag / 6000)}</LinkLag><LagFormat>4</LagFormat></PredecessorLink>`)
  }
  let projectStart = Infinity, projectEnd = -Infinity
  for (const task of project.tasks) {
    projectStart = Math.min(projectStart, toSecond(task.start))
    projectEnd = Math.max(projectEnd, toSecond(task.end))
  }
  const outline: number[] = []
  const tasks = project.tasks.map((task, index) => {
    const level = levels[index]!
    outline.length = level
    outline[level - 1] = (outline[level - 1] ?? 0) + 1
    const number = outline.join('.')
    const uid = index + 1
    const milestone = task.milestone === true || task.start === task.end
    const summary = (levels[index + 1] ?? 0) > level
    const startTime = toSecond(task.start), finishTime = toSecond(task.end)
    const start = localIso(startTime, offset), finish = localIso(finishTime, offset)
    const duration = isoDuration(milestone ? 0 : finishTime - startTime)
    const [constraintType, constraintDate] = constraintElements(task.constraints, offset)
    return '<Task>'
      + `<UID>${uid}</UID><ID>${uid}</ID><Name>${xmlText(task.name)}</Name>`
      + `<Active>${task.inactive === true ? 0 : 1}</Active><Manual>${task.manual === false ? 0 : 1}</Manual>`
      + `<WBS>${number}</WBS><OutlineNumber>${number}</OutlineNumber><OutlineLevel>${level}</OutlineLevel>`
      + `<Start>${start}</Start><Finish>${finish}</Finish><Duration>${duration}</Duration>`
      + `<ManualStart>${start}</ManualStart><ManualFinish>${finish}</ManualFinish><ManualDuration>${duration}</ManualDuration>`
      + `<Milestone>${milestone ? 1 : 0}</Milestone><Summary>${summary ? 1 : 0}</Summary>`
      + `<PercentComplete>${Math.round(task.percentComplete ?? 0)}</PercentComplete>`
      + constraintType
      + (task.calendarId === undefined ? '' : `<CalendarUID>${calendarUids.get(task.calendarId)}</CalendarUID>`)
      + constraintDate
      + (predecessors.get(task.id) ?? []).join('')
      + (task.baselines ?? []).map(baseline => {
        const baselineStart = toSecond(baseline.start), baselineFinish = toSecond(baseline.end)
        return `<Baseline><Number>${baseline.number}</Number><Interim>0</Interim>`
          + `<Start>${localIso(baselineStart, offset)}</Start><Finish>${localIso(baselineFinish, offset)}</Finish>`
          + `<Duration>${isoDuration(baselineFinish - baselineStart)}</Duration></Baseline>`
      }).join('')
      + '</Task>'
  })
  const name = xmlText(project.name)
  const dates = project.tasks.length
    ? `<StartDate>${localIso(projectStart, offset)}</StartDate><FinishDate>${localIso(projectEnd, offset)}</FinishDate>` : ''
  const defaultCalendar = project.defaultCalendarId === undefined ? '' : `<CalendarUID>${calendarUids.get(project.defaultCalendarId)}</CalendarUID>`
  const calendars = project.calendars?.length
    ? `<Calendars>${project.calendars.map(calendar => calendarXml(calendar, calendarUids.get(calendar.id)!)).join('')}</Calendars>` : ''
  const resources = project.resources?.length
    ? '<Resources>' + project.resources.map(resource => {
      const uid = resourceUids.get(resource.id)!
      return `<Resource><UID>${uid}</UID><ID>${uid}</ID><Name>${xmlText(resource.name)}</Name>`
        + `<Type>${resourceTypes[resource.type ?? 'work']}</Type><IsNull>0</IsNull>${resource.maxUnits === undefined ? '' : `<MaxUnits>${resource.maxUnits}</MaxUnits>`}`
        + (resource.calendarId === undefined ? '' : `<CalendarUID>${calendarUids.get(resource.calendarId)}</CalendarUID>`)
        + (resource.type === 'cost' ? '<IsCostResource>1</IsCostResource>' : '') + '</Resource>'
    }).join('') + '</Resources>' : ''
  const assignments = project.assignments?.length
    ? '<Assignments>' + project.assignments.map((assignment, index) =>
      `<Assignment><UID>${index + 1}</UID><TaskUID>${uids.get(assignment.taskId)}</TaskUID>`
      + `<ResourceUID>${resourceUids.get(assignment.resourceId)}</ResourceUID><Units>${assignment.units ?? 1}</Units></Assignment>`).join('')
      + '</Assignments>' : ''
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
    + '<Project xmlns="http://schemas.microsoft.com/project">'
    + `<Name>${name}</Name><Title>${name}</Title><ScheduleFromStart>1</ScheduleFromStart>${dates}${defaultCalendar}`
    + `${calendars}<Tasks>${tasks.join('')}</Tasks>${resources}${assignments}</Project>\n`
}

/** A task read by `fromMsProjectXml`. The optional fields of `MsProjectTask` that a file always has are set. */
export interface MsProjectImportTask extends MsProjectTask {
  outlineLevel: number
  percentComplete: number
  milestone: boolean
  /** `Summary` 1: the task has subtasks. */
  summary: boolean
  /** `Manual` 1: a manually scheduled task. Use `{ start, end }` as `ScheduleTask.manual` to keep its dates. */
  manual: boolean
  /** `Active` 0: an inactive task. */
  inactive: boolean
  /**
   * `Duration` in milliseconds: the working time of an automatically scheduled task, useful as `ScheduleTask.duration`.
   * Absent when the file has none or it cannot be read.
   */
  duration?: number
  /** `'alap'` for `ConstraintType` 1 (As Late As Possible), named as `ScheduleTask.mode`. */
  mode?: 'alap'
}

/**
 * The kind of a problem `fromMsProjectXml` worked around. `skipped-task`: a task without a valid UID, start or finish,
 * or with a UID used before. `outline-level`: an outline level more than one below the task before it, which was
 * raised. `invalid-value`: an unreadable percent complete, duration, outline level or lag, which was ignored.
 * `unsupported-constraint`: an unknown constraint type or a constraint without a date, which was left out. `skipped-baseline`: a baseline with an invalid or repeated number or unreadable or inverted dates.
 * `unknown-predecessor`: a link from a task that was not imported. `skipped-link`: a link to another project, from a
 * task to itself or of an unknown type. `percent-lag`: a lag in percent of the predecessor's duration, which was left
 * out. `working-time-lag`: a lag in working time, which was read as the same amount of elapsed time.
 * `skipped-calendar`: a calendar without a valid or with a repeated UID. `invalid-calendar`: a working time, exception
 * or base calendar reference that cannot be read or would be circular, which was left out, or an exception with more
 * than 3,660 dates, of which the first 3,660 were kept. `unsupported-calendar`: an exception recurrence that is not
 * expanded (see `fromMsProjectXml`), an alternate work week or a day type that `WorkWeek` cannot hold, which was left out.
 * `unknown-calendar`: a calendar UID of the project, a task or a resource that no imported calendar has, which was left
 * out. `skipped-resource`: a resource without a valid UID or with a UID used before. `skipped-assignment`: an
 * assignment to a task or resource that was not imported, or repeating a task and resource pair.
 */
export type MsProjectImportWarningCode =
  | 'skipped-task' | 'outline-level' | 'invalid-value' | 'unsupported-constraint' | 'skipped-baseline'
  | 'unknown-predecessor' | 'skipped-link' | 'percent-lag' | 'working-time-lag'
  | 'skipped-calendar' | 'invalid-calendar' | 'unsupported-calendar' | 'unknown-calendar'
  | 'skipped-resource' | 'skipped-assignment'

export interface MsProjectImportWarning {
  code: MsProjectImportWarningCode
  /** The imported ID (the UID) of the task the warning is about, when there is one. */
  taskId?: string
  /** The imported ID of the calendar the warning is about, when there is one. */
  calendarId?: string
  /** The imported ID of the resource the warning is about, when there is one. */
  resourceId?: string
  /** An English description for logs; match on `code`. */
  message: string
}

/** The result of `fromMsProjectXml`. It is an `MsProjectInput`, so `toMsProjectXml` accepts it. */
export interface MsProjectImport {
  name: string
  tasks: MsProjectImportTask[]
  /** In the order of their successor tasks and then of their links. `type` is always set, `lag` only when not 0. */
  dependencies: MsProjectDependency[]
  warnings: MsProjectImportWarning[]
  /** Present when the file has calendars. Ordered as in the file; see `MsProjectCalendar`. */
  calendars?: MsProjectCalendar[]
  /** The project calendar (`CalendarUID`), when the file names one that was imported. */
  defaultCalendarId?: string
  /** Present when the file has resources. Excludes the project's own "unassigned" resource (UID 0). */
  resources?: MsProjectResource[]
  /** Present when the file has assignments to imported tasks and resources. */
  assignments?: MsProjectAssignment[]
}

const msDateTime = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?$/
const msDuration = /^P(?:(\d+(?:\.\d+)?)Y)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)W)?(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/
const linkNames: readonly TimelineDependencyType[] = ['FF', 'FS', 'SF', 'SS']
const constraintKinds: Readonly<Record<string, TimelineConstraintKind>> = {
  2: 'fixedStart', 4: 'startNoEarlierThan', 5: 'startNoLaterThan', 6: 'finishNoEarlierThan', 7: 'finishNoLaterThan',
}
// MSPDI lag formats in elapsed time (em, eh, ed, ew, emo and their estimated forms) and in percent (%, e% and estimated).
const elapsedLagFormats = new Set(['4', '6', '8', '10', '12', '36', '38', '40', '42', '44'])
const percentLagFormats = new Set(['19', '20', '51', '52'])

/** Epoch milliseconds of an MSPDI date-time, a wall-clock time at `offset` unless it has its own zone. */
function msDate(text: string | undefined, offset: number): number | undefined {
  const match = text === undefined ? null : msDateTime.exec(text)
  if (!match) return undefined
  const [, year, month, day, hour, minute, second = '0', fraction, zone] = match
  const [y, mo, d, h, mi, s] = [year, month, day, hour, minute, second].map(Number) as [number, number, number, number, number, number]
  const wall = wallTime(y, mo, d, h, mi, s)
  if (wall === undefined) return undefined
  let minutes = offset
  if (zone === 'Z') minutes = 0
  else if (zone) {
    const [zoneHours, zoneMinutes] = [Number(zone.slice(1, 3)), Number(zone.slice(4, 6))]
    // ISO 8601 offsets have at most 59 minutes; real ones are within ±18 hours.
    if (zoneHours > 18 || zoneMinutes > 59) return undefined
    minutes = (zone[0] === '-' ? -1 : 1) * (zoneHours * 60 + zoneMinutes)
  }
  return wall + (fraction ? Math.round(Number(fraction) * 1000) : 0) - minutes * minuteMs
}

/** Milliseconds of an ISO 8601 duration with days, hours, minutes and seconds; undefined for years, months or bad text. */
function msDurationValue(text: string): number | undefined {
  const match = msDuration.exec(text)
  if (!match || text === 'P' || text.endsWith('T') || match[1] !== undefined || match[2] !== undefined) return undefined
  const [weeks = 0, days = 0, hours = 0, minutes = 0, seconds = 0] = match.slice(3).map(part => part === undefined ? undefined : Number(part))
  const value = Math.round(durationMs(weeks, days, hours, minutes, seconds))
  // Hundreds of digits overflow to Infinity, which is no duration.
  return Number.isFinite(value) ? value : undefined
}

const isTrue = (text: string | undefined) => text === '1' || text === 'true'
const uidPattern = /^\d+$/
/** A UID without leading zeros, so `007` and `7` name the same item. */
const normalizeUid = (uid: string) => uid.replace(/^0+(?=\d)/, '')

type MsWarn = (code: MsProjectImportWarningCode, message: string, subject?: string | { taskId?: string; calendarId?: string; resourceId?: string }) => void

/** Minutes after midnight of an MSPDI clock time such as `08:00:00` (up to 24:00:00), rounded to a whole minute. */
function msClock(text: string | undefined): number | undefined {
  const match = text === undefined ? null : /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(text)
  if (!match) return undefined
  const [h, m, sec = 0] = [Number(match[1]), Number(match[2]), Number(match[3] ?? 0)]
  if (m > 59 || sec > 59 || h > 24 || (h === 24 && (m || sec))) return undefined
  return Math.round((h * 3600 + m * 60 + sec) / 60)
}

/** The `YYYY-MM-DD` date of an MSPDI date-time, when it is a real date. */
function msDay(text: string | undefined): string | undefined {
  const date = text === undefined ? undefined : /^\d{4}-\d{2}-\d{2}(?=T|$)/.exec(text)?.[0]
  return date !== undefined && civilDay(date) !== undefined ? date : undefined
}

/** The longest run of dates that one calendar exception expands to. */
const maxExceptionDays = 3660

interface RawCalendar {
  id: string
  name: string
  base: boolean
  baseId?: string
  weekly: (WorkShift[] | undefined)[]
  exceptions: Map<string, WorkShift[]>
}

/** The shifts in the `WorkingTimes` of a `WeekDay` or `Exception`; unreadable entries are reported and left out. */
function msWorkingTimes(element: XmlElement, working: boolean, warn: MsWarn, calendarId: string): WorkShift[] {
  const shifts: WorkShift[] = []
  if (!working) return shifts
  for (const times of element.children) {
    if (times.name !== 'WorkingTimes') continue
    for (const time of times.children) {
      if (time.name !== 'WorkingTime') continue
      const fields = childMap(time)
      const from = msClock(fields.get('FromTime')?.text.trim()), to = msClock(fields.get('ToTime')?.text.trim())
      // A working time that ends at midnight is written as 00:00:00.
      const end = to === 0 ? 1440 : to
      if (from === undefined || end === undefined || from >= 1440 || end <= from) {
        warn('invalid-calendar', `A working time of calendar ${calendarId} cannot be read and was left out`, { calendarId })
      } else shifts.push({ startMinute: from, endMinute: end })
    }
  }
  return shifts.sort((a, b) => a.startMinute - b.startMinute || a.endMinute - b.endMinute)
}

/** The day number (days since 1970-01-01) of a civil date; `month` from 0 and `day` from 1 may overflow into the next month. */
function dayNumber(year: number, month: number, day: number) {
  const value = new Date(0)
  value.setUTCFullYear(year, month, day)
  return Math.round(value.getTime() / dayMs)
}
/** Weekday of a day number, 0 for Sunday. */
const weekdayOf = (day: number) => ((day + 4) % 7 + 7) % 7
const lastDayOfMonth = (year: number, month: number) => dayNumber(year, month + 1, 0)
/** The `position` (0 to 3 for first to fourth, 4 for last) `weekday` of a month, as a day number. */
function positionalDay(year: number, month: number, weekday: number, position: number) {
  if (position === 4) {
    const last = lastDayOfMonth(year, month)
    return last - (weekdayOf(last) - weekday + 7) % 7
  }
  const first = dayNumber(year, month, 1)
  return first + (weekday - weekdayOf(first) + 7) % 7 + 7 * position
}

/**
 * How an MSPDI calendar exception repeats inside its `TimePeriod`. `next` returns the first date of the pattern on or
 * after a day number, which is how every kind is expanded (loops only).
 */
type ExceptionPattern = { contiguous: true } | { contiguous: false; next: (day: number, from: number) => number }

/**
 * Classify a calendar exception by its `Type` before any date is expanded. Returns the pattern, or the warning that
 * leaves the exception out. The `Type` values are those of the Exception parent in the Project XML Data Interchange
 * Schema reference ("Type Element (Multiple Parents)", learn.microsoft.com/office-project/xml-data-interchange):
 * 1 daily, 2 yearly by day of the month, 3 yearly by position, 4 monthly by day of the month, 5 monthly by position,
 * 6 weekly, 7 by day count, 8 by weekday count, 9 no exception type. `DaysOfWeek` is a bit mask (1 Sunday … 64
 * Saturday), `MonthItem` 3 to 9 is Sunday to Saturday (0 day, 1 weekday, 2 weekend day), `MonthPosition` 0 to 3 is first
 * to fourth and 4 last, and `Month` counts from 0 (January).
 */
function exceptionPattern(fields: ReadonlyMap<string, XmlElement>): ExceptionPattern | { code: MsProjectImportWarningCode; reason: string } {
  const number = (name: string) => {
    const text = fields.get(name)?.text.trim()
    return text === undefined || text === '' ? undefined : /^\d+$/.test(text) ? Number(text) : NaN
  }
  const type = fields.get('Type')?.text.trim() ?? ''
  const unreadable = (what: string) => ({ code: 'invalid-calendar' as const, reason: `its ${what} cannot be read` })
  const unsupported = (what: string) => ({ code: 'unsupported-calendar' as const, reason: what + ' is not supported' })
  // Without a type (which Microsoft Project always writes) or with "no exception type", the period is the exception.
  if (type === '' || type === '9') return { contiguous: true }
  const period = number('Period')
  if (period !== undefined && !(period >= 0)) return unreadable('period')
  if (type === '1' || type === '7') {
    if (period === 0) return unreadable('period')
    // Every N days, counted from FromDate.
    const every = period ?? 1
    return every === 1 ? { contiguous: true } : { contiguous: false, next: (day, from) => from + Math.ceil((day - from) / every) * every }
  }
  if (type === '6') {
    const days = number('DaysOfWeek')
    if (days === undefined || !(days >= 1 && days <= 127)) return unreadable('days of the week')
    if (period === 0) return unreadable('period')
    // Which weeks an interval of two or more counts from depends on Microsoft Project's week anchoring.
    if ((period ?? 1) > 1) return unsupported('a weekly recurrence every ' + period + ' weeks')
    return { contiguous: false, next: day => { while (!(days & (1 << weekdayOf(day)))) day++; return day } }
  }
  if (type === '2' || type === '3' || type === '4' || type === '5') {
    const yearly = type === '2' || type === '3'
    if (period === 0 && !yearly) return unreadable('period')
    if ((period ?? 1) > 1) return unsupported(`a ${yearly ? 'yearly' : 'monthly'} recurrence with a period of ${period}`)
    const month = number('Month')
    if (yearly && (month === undefined || !(month <= 11))) return unreadable('month')
    const byMonth = (pick: (year: number, month: number) => number) => (day: number) => {
      const date = new Date(day * dayMs)
      for (let year = date.getUTCFullYear(), index = yearly ? 0 : date.getUTCMonth(); ; ) {
        const found = pick(year, yearly ? month! : index)
        if (found >= day) return found
        if (yearly || ++index === 12) {
          year++
          index = 0
        }
      }
    }
    if (type === '2' || type === '4') {
      const monthDay = number('MonthDay')
      const longest = yearly ? [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month!]! : 31
      if (monthDay === undefined || !(monthDay >= 1 && monthDay <= longest)) return unreadable('day of the month')
      // A day that some months or years lack (the 29th to the 31st, or 29 February) has no documented rule.
      if (monthDay > (yearly ? longest === 29 ? 28 : longest : 28)) return unsupported(yearly ? 'a recurrence on 29 February' : 'a monthly recurrence on day ' + monthDay)
      return { contiguous: false, next: byMonth((year, index) => dayNumber(year, index, monthDay)) }
    }
    const item = number('MonthItem'), position = number('MonthPosition')
    if (item === undefined || !(item <= 9)) return unreadable('month item')
    if (position === undefined || !(position <= 4)) return unreadable('month position')
    if (item < 3) return unsupported('a recurrence by the position of a ' + ['day', 'weekday', 'weekend day'][item])
    return { contiguous: false, next: byMonth((year, index) => positionalDay(year, index, item - 3, position)) }
  }
  return unsupported(type === '8' ? 'a recurrence by weekday count (type 8)' : `the exception type ${type}`)
}

/**
 * Read one calendar exception (an `Exception`, or a `WeekDay` of `DayType` 0) into one-off dates. The exception is
 * classified by `exceptionPattern` first; a contiguous one covers every day from `FromDate` to `ToDate` and a recurring
 * one the exact dates of its pattern there. With `EnteredByOccurrences` 1 (or `Type` 7) and a valid `Occurrences`, the
 * count governs instead of `ToDate`. An exception keeps at most `maxExceptionDays` dates.
 */
function msException(raw: RawCalendar, element: XmlElement, warn: MsWarn) {
  const fields = childMap(element)
  const period = fields.get('TimePeriod') ? childMap(fields.get('TimePeriod')!) : new Map<string, XmlElement>()
  const first = msDay(period.get('FromDate')?.text.trim()), last = msDay(period.get('ToDate')?.text.trim())
  const working = isTrue((fields.get('DayWorking') ?? { text: '' }).text.trim())
  const calendarId = raw.id
  const name = fields.get('Name')?.text.trim()
  const subject = name ? `The exception "${name}"` : 'An exception'
  const pattern = exceptionPattern(fields)
  if ('code' in pattern) {
    warn(pattern.code, `${subject} of calendar ${calendarId} was left out: ${pattern.reason}`, { calendarId })
    return
  }
  const occurrencesText = fields.get('Occurrences')?.text.trim()
  const occurrences = occurrencesText !== undefined && /^\d+$/.test(occurrencesText) ? Number(occurrencesText) : 0
  const byCount = (isTrue(fields.get('EnteredByOccurrences')?.text.trim()) || fields.get('Type')?.text.trim() === '7') && occurrences >= 1
  // A contiguous exception with only FromDate is that one day; a recurring one needs ToDate or a count.
  const end = last ?? (pattern.contiguous ? first : undefined)
  if (first === undefined || (!byCount && (end === undefined || end < first))) {
    warn('invalid-calendar', `${subject} of calendar ${calendarId} has no valid dates and was left out`, { calendarId })
    return
  }
  const shifts = msWorkingTimes(element, working, warn, calendarId)
  // Contradictory data: a working day without readable times. Its dates stay days off, as the file gives no hours.
  if (working && !shifts.length) {
    warn('invalid-calendar', `${subject} of calendar ${calendarId} is a working day without working times: its dates were treated as days off`, { calendarId })
  }
  const firstDay = Math.round(civilDay(first)! / dayMs)
  const lastDay = byCount ? Infinity : Math.round(civilDay(end!)! / dayMs)
  const limit = Math.min(byCount ? occurrences : Infinity, maxExceptionDays)
  const days: number[] = []
  let truncated = false
  // Dates after the year 9999 cannot be written as YYYY-MM-DD.
  const maxDay = Math.min(lastDay, dayNumber(9999, 11, 31))
  if (pattern.contiguous) {
    const count = byCount ? occurrences : lastDay - firstDay + 1
    truncated = count > maxExceptionDays
    for (let day = firstDay; day < firstDay + Math.min(count, maxExceptionDays) && day <= maxDay; day++) days.push(day)
  } else {
    for (let day = pattern.next(firstDay, firstDay); day <= maxDay; day = pattern.next(day + 1, firstDay)) {
      if (days.length === limit) {
        // In count mode the limit is the count unless the count is larger than the cap.
        truncated = !byCount || occurrences > maxExceptionDays
        break
      }
      days.push(day)
    }
  }
  if (truncated) {
    warn('invalid-calendar', pattern.contiguous
      ? `${subject} of calendar ${calendarId} covers more than ${maxExceptionDays} days; only the first ${maxExceptionDays} were kept`
      : `${subject} of calendar ${calendarId} has more than ${maxExceptionDays} dates; only the first ${maxExceptionDays} were kept`, { calendarId })
  }
  for (const day of days) raw.exceptions.set(new Date(day * dayMs).toISOString().slice(0, 10), shifts)
}

/** Read `Calendars` and resolve base calendars into complete weeks. Loops only, so long base chains are safe. */
function readMsCalendars(section: XmlElement | undefined, offset: number, warn: MsWarn): MsProjectCalendar[] {
  const raws = new Map<string, RawCalendar>()
  for (const element of section?.children ?? []) {
    if (element.name !== 'Calendar') continue
    const fields = childMap(element)
    const uid = fields.get('UID')?.text.trim()
    if (uid === undefined || !uidPattern.test(uid)) {
      warn('skipped-calendar', 'A calendar without a valid UID was skipped')
      continue
    }
    const id = normalizeUid(uid)
    if (raws.has(id)) {
      warn('skipped-calendar', `Calendar ${id} repeats a UID and was skipped`, { calendarId: id })
      continue
    }
    const baseText = fields.get('BaseCalendarUID')?.text.trim()
    const raw: RawCalendar = {
      id, name: fields.get('Name')?.text ?? '', base: isTrue(fields.get('IsBaseCalendar')?.text.trim()),
      weekly: Array.from({ length: 7 }, () => undefined), exceptions: new Map(),
    }
    if (baseText !== undefined && uidPattern.test(baseText)) raw.baseId = normalizeUid(baseText)
    else if (baseText !== undefined && baseText !== '-1' && baseText !== '') {
      warn('invalid-calendar', `Calendar ${id} has a base calendar UID that cannot be read`, { calendarId: id })
    }
    for (const days of element.children) {
      if (days.name === 'WeekDays') {
        for (const day of days.children) {
          if (day.name !== 'WeekDay') continue
          const dayFields = childMap(day)
          const type = dayFields.get('DayType')?.text.trim() ?? ''
          const working = isTrue(dayFields.get('DayWorking')?.text.trim())
          if (type === '0') {
            msException(raw, day, warn)
          } else if (/^[1-7]$/.test(type)) {
            const shifts = msWorkingTimes(day, working, warn, id)
            if (working && !day.children.some(child => child.name === 'WorkingTimes' && child.children.length)) {
              // A working day without times: the file does not say when, so the day keeps what the base calendar has.
              warn('invalid-calendar', `A working day of calendar ${id} has no working times and was left to the base calendar`, { calendarId: id })
            } else raw.weekly[Number(type) - 1] = shifts
          } else {
            warn('unsupported-calendar', `A day of type ${type || '(none)'} in calendar ${id} is not supported and was left out`, { calendarId: id })
          }
        }
      } else if (days.name === 'Exceptions') {
        for (const exception of days.children) if (exception.name === 'Exception') msException(raw, exception, warn)
      } else if (days.name === 'WorkWeeks' && days.children.length) {
        warn('unsupported-calendar', `The alternate work weeks of calendar ${id} are not supported and were left out`, { calendarId: id })
      }
    }
    raws.set(id, raw)
  }
  // Resolve inheritance, base calendars first, without recursion.
  const resolved = new Map<string, { weekly: WorkShift[][]; exceptions: Map<string, WorkShift[]> }>()
  for (const start of raws.values()) {
    const chain: RawCalendar[] = []
    const seen = new Set<string>()
    for (let current: RawCalendar | undefined = start; current && !resolved.has(current.id); ) {
      seen.add(current.id)
      chain.push(current)
      let next: RawCalendar | undefined
      if (current.baseId !== undefined) {
        next = raws.get(current.baseId)
        if (!next) {
          warn('unknown-calendar', `The base calendar ${current.baseId} of calendar ${current.id} was not imported`, { calendarId: current.id })
          current.baseId = undefined
        } else if (seen.has(next.id)) {
          warn('invalid-calendar', `Calendar ${current.id} has a circular base calendar and its base was ignored`, { calendarId: current.id })
          current.baseId = undefined
          next = undefined
        }
      }
      current = next
    }
    for (const raw of chain.reverse()) {
      const base = raw.baseId === undefined ? undefined : resolved.get(raw.baseId)
      resolved.set(raw.id, {
        weekly: raw.weekly.map((own, day) => own ?? base?.weekly[day] ?? []),
        exceptions: new Map([...base?.exceptions ?? [], ...raw.exceptions]),
      })
    }
  }
  return [...raws.values()].map(raw => {
    const { weekly, exceptions } = resolved.get(raw.id)!
    const week: WorkWeek = { weekly: weekly.flatMap((shifts, weekday): WeeklyShift[] => shifts.map(shift => ({ weekday, ...shift }))) }
    if (offset !== 0) week.utcOffsetMinutes = offset
    if (exceptions.size) week.exceptions = Object.fromEntries([...exceptions].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([date, shifts]) => [date, shifts.map(shift => ({ ...shift }))]))
    const calendar: MsProjectCalendar = { id: raw.id, name: raw.name, base: raw.base, week }
    if (raw.baseId !== undefined) calendar.baseCalendarId = raw.baseId
    return calendar
  })
}

const decimalText = /^\d+(\.\d+)?$/

type CalendarRef = (text: string | undefined, subject: { taskId?: string; resourceId?: string } | undefined, what: string) => string | undefined

/**
 * The reader of `CalendarUID` values: a calendar UID of -1 or 0 means "none"; anything else must be one of the imported
 * calendars, or it is reported and left out.
 */
function calendarReference(calendars: readonly MsProjectCalendar[], warn: MsWarn): CalendarRef {
  const calendarIds = new Set(calendars.map(calendar => calendar.id))
  return (text, subject, what) => {
    if (text === undefined || text === '' || text === '-1') return undefined
    const id = uidPattern.test(text) ? normalizeUid(text) : undefined
    if (id === undefined) warn('invalid-value', `${what} has a calendar UID that cannot be read: ${text}`, subject)
    else if (id !== '0') {
      if (calendarIds.has(id)) return id
      warn('unknown-calendar', `${what} uses calendar ${id}, which was not imported, and it was left out`, subject)
    }
    return undefined
  }
}

/** The fields of an element by name, and the trimmed text of a field. */
function msFields(element: XmlElement) {
  const fields = childMap(element)
  return { fields, value: (name: string) => fields.get(name)?.text.trim() }
}

/** The constraint of a task: `mode: 'alap'` for type 1, `constraints` for the types with a date, or a warning. */
function readMsConstraint(task: MsProjectImportTask, value: (name: string) => string | undefined, offset: number, warn: MsWarn) {
  const id = task.id
  const constraintType = value('ConstraintType')
  if (constraintType === '1') task.mode = 'alap'
  else if (constraintType !== undefined && constraintType !== '0') {
    const kind = Object.hasOwn(constraintKinds, constraintType) ? constraintKinds[constraintType] : undefined
    const date = msDate(value('ConstraintDate'), offset)
    if (kind === undefined && constraintType !== '3') {
      warn('unsupported-constraint', `The constraint type ${constraintType} of task ${id} is not supported and was left out`, id)
    } else if (date === undefined) {
      warn('unsupported-constraint', `The constraint of task ${id} has no valid date and was left out`, id)
    } else task.constraints = kind === undefined ? { finishNoEarlierThan: date, finishNoLaterThan: date } : { [kind]: date }
  }
}

/** The `Baseline` dates of a task; baselines of work or cost only, without dates, are passed over. */
function readMsBaselines(element: XmlElement, id: string, offset: number, warn: MsWarn) {
  const baselines: MsProjectBaseline[] = []
  for (const child of element.children) {
    if (child.name !== 'Baseline') continue
    const { value } = msFields(child)
    const startText = value('Start'), finishText = value('Finish')
    if (startText === undefined && finishText === undefined) continue
    const numberText = value('Number') ?? ''
    const number = uidPattern.test(numberText) ? Number(numberText) : NaN
    const baselineStart = msDate(startText, offset), baselineEnd = msDate(finishText, offset)
    if (!(number <= 10) || baselines.some(item => item.number === number)) {
      warn('skipped-baseline', `A baseline of task ${id} has an invalid or repeated number and was skipped`, id)
    } else if (baselineStart === undefined || baselineEnd === undefined || baselineEnd < baselineStart) {
      warn('skipped-baseline', `Baseline ${number} of task ${id} has no valid Start and Finish and was skipped`, id)
    } else baselines.push({ number, start: baselineStart, end: baselineEnd })
  }
  return baselines
}

/**
 * The `Tasks` of a project, with the `PredecessorLink` elements of each task for `readMsDependencies` and the IDs of
 * the imported tasks.
 */
function readMsTasks(section: XmlElement | undefined, offset: number, warn: MsWarn, calendarRef: CalendarRef) {
  const tasks: MsProjectImportTask[] = []
  const links: { id: string; elements: XmlElement[] }[] = []
  const ids = new Set<string>()
  let previousLevel = 0
  for (const element of section?.children ?? []) {
    if (element.name !== 'Task') continue
    const { fields, value } = msFields(element)
    if (isTrue(value('IsNull'))) continue
    const uid = value('UID')
    if (uid === undefined || !uidPattern.test(uid)) {
      warn('skipped-task', 'A task without a valid UID was skipped')
      continue
    }
    const id = normalizeUid(uid)
    if (id === '0') continue
    if (ids.has(id)) {
      warn('skipped-task', `Task ${id} repeats a UID and was skipped`, id)
      continue
    }
    const start = msDate(value('Start'), offset), end = msDate(value('Finish'), offset)
    if (start === undefined || end === undefined || end < start) {
      warn('skipped-task', `Task ${id} has no valid Start and Finish and was skipped`, id)
      continue
    }
    ids.add(id)
    let level = 1
    const levelText = value('OutlineLevel')
    if (levelText !== undefined) {
      if (uidPattern.test(levelText) && Number(levelText) >= 1) level = Number(levelText)
      else warn('invalid-value', `Task ${id} has an invalid outline level and was put at level 1`, id)
    }
    if (level > previousLevel + 1) {
      warn('outline-level', `Task ${id} was moved from outline level ${level} to ${previousLevel + 1}, below the task before it`, id)
      level = previousLevel + 1
    }
    previousLevel = level
    let percentComplete = 0
    const percentText = value('PercentComplete')
    if (percentText !== undefined) {
      const percent = decimalText.test(percentText) ? Number(percentText) : NaN
      if (percent <= 100) percentComplete = percent
      else warn('invalid-value', `Task ${id} has an invalid percent complete, read as 0`, id)
    }
    const task: MsProjectImportTask = {
      id, name: fields.get('Name')?.text ?? '', start, end, outlineLevel: level, percentComplete,
      milestone: isTrue(value('Milestone')), summary: isTrue(value('Summary')), manual: isTrue(value('Manual')),
      inactive: value('Active') === '0' || value('Active') === 'false',
    }
    const taskCalendar = calendarRef(value('CalendarUID'), { taskId: id }, `Task ${id}`)
    if (taskCalendar !== undefined) task.calendarId = taskCalendar
    const durationText = value('Duration')
    if (durationText !== undefined) {
      const duration = msDurationValue(durationText)
      if (duration === undefined) warn('invalid-value', `Task ${id} has a duration that cannot be read: ${durationText}`, id)
      else task.duration = duration
    }
    readMsConstraint(task, value, offset, warn)
    const baselines = readMsBaselines(element, id, offset, warn)
    if (baselines.length) task.baselines = baselines
    tasks.push(task)
    links.push({ id, elements: element.children.filter(child => child.name === 'PredecessorLink') })
  }
  return { tasks, links, ids }
}

/** One `PredecessorLink` of task `id` as a dependency, or undefined with a warning. */
function readMsDependency(element: XmlElement, id: string, ids: ReadonlySet<string>, warn: MsWarn): MsProjectDependency | undefined {
  const { value } = msFields(element)
  const predecessor = value('PredecessorUID')
  const from = predecessor === undefined ? undefined : normalizeUid(predecessor)
  if (isTrue(value('CrossProject'))) {
    warn('skipped-link', `A link to task ${id} from another project was skipped`, id)
    return undefined
  }
  if (from === undefined || !ids.has(from)) {
    warn('unknown-predecessor', `A link to task ${id} from task ${from ?? '(none)'}, which was not imported, was skipped`, id)
    return undefined
  }
  if (from === id) {
    warn('skipped-link', `A link from task ${id} to itself was skipped`, id)
    return undefined
  }
  const typeText = value('Type') ?? '1'
  const type = /^[0-3]$/.test(typeText) ? linkNames[Number(typeText)]! : undefined
  if (!type) {
    warn('skipped-link', `A link from task ${from} to task ${id} has an unknown type and was skipped`, id)
    return undefined
  }
  const dependency: MsProjectDependency = { from, to: id, type }
  const lagText = value('LinkLag')
  if (lagText !== undefined && lagText !== '0') {
    const format = value('LagFormat')
    if (!/^[+-]?\d+$/.test(lagText) || !Number.isFinite(Number(lagText) * 6000)) {
      warn('invalid-value', `The lag of the link from task ${from} to task ${id} cannot be read and was left out`, id)
    } else if (format !== undefined && percentLagFormats.has(format)) {
      warn('percent-lag', `The lag of the link from task ${from} to task ${id} is in percent and was left out`, id)
    } else {
      const lag = Number(lagText) * 6000
      if (lag !== 0) dependency.lag = lag
      if (lag !== 0 && (format === undefined || !elapsedLagFormats.has(format))) {
        warn('working-time-lag', `The working-time lag of the link from task ${from} to task ${id} was read as elapsed time`, id)
      }
    }
  }
  return dependency
}

/** The `Resources` of a project, except the placeholder for unassigned work (UID 0). */
function readMsResources(section: XmlElement | undefined, warn: MsWarn, calendarRef: CalendarRef) {
  const resources: MsProjectResource[] = []
  const resourceIds = new Set<string>()
  for (const element of section?.children ?? []) {
    if (element.name !== 'Resource') continue
    const { fields, value } = msFields(element)
    if (isTrue(value('IsNull'))) continue
    const uid = value('UID')
    if (uid === undefined || !uidPattern.test(uid)) {
      warn('skipped-resource', 'A resource without a valid UID was skipped')
      continue
    }
    const id = normalizeUid(uid)
    // Resource 0 is Microsoft Project's placeholder for unassigned work.
    if (id === '0') continue
    if (resourceIds.has(id)) {
      warn('skipped-resource', `Resource ${id} repeats a UID and was skipped`, { resourceId: id })
      continue
    }
    resourceIds.add(id)
    const resource: MsProjectResource = { id, name: fields.get('Name')?.text ?? '' }
    const typeText = value('Type')
    if (typeText !== undefined) {
      const type = /^[0-2]$/.test(typeText) ? (['material', 'work', 'cost'] as const)[Number(typeText)] : undefined
      if (type) resource.type = type
      else warn('invalid-value', `Resource ${id} has a type that cannot be read: ${typeText}`, { resourceId: id })
    }
    // A cost resource is flagged by IsCostResource, whatever its Type says.
    if (isTrue(value('IsCostResource'))) resource.type = 'cost'
    const unitsText = value('MaxUnits')
    if (unitsText !== undefined) {
      if (decimalText.test(unitsText) && Number.isFinite(Number(unitsText))) resource.maxUnits = Number(unitsText)
      else warn('invalid-value', `Resource ${id} has a maximum of units that cannot be read: ${unitsText}`, { resourceId: id })
    }
    const calendarId = calendarRef(value('CalendarUID'), { resourceId: id }, `Resource ${id}`)
    if (calendarId !== undefined) resource.calendarId = calendarId
    resources.push(resource)
  }
  return { resources, resourceIds }
}

/** The `Assignments` of imported resources to imported tasks, each task and resource pair once. */
function readMsAssignments(section: XmlElement | undefined, taskIds: ReadonlySet<string>, resourceIds: ReadonlySet<string>, warn: MsWarn) {
  const assignments: MsProjectAssignment[] = []
  const assigned = new Set<string>()
  for (const element of section?.children ?? []) {
    if (element.name !== 'Assignment') continue
    const { value } = msFields(element)
    const taskUid = value('TaskUID'), resourceUid = value('ResourceUID')
    const taskId = taskUid !== undefined && uidPattern.test(taskUid) ? normalizeUid(taskUid) : undefined
    const resourceId = resourceUid !== undefined && uidPattern.test(resourceUid) ? normalizeUid(resourceUid) : undefined
    // Unassigned work (resource -65535 or 0) and the project summary task (0) are not assignments.
    if (taskId === '0' || resourceId === '0' || resourceUid === '-65535') continue
    if (taskId === undefined || resourceId === undefined || !taskIds.has(taskId) || !resourceIds.has(resourceId)) {
      warn('skipped-assignment', `An assignment of resource ${resourceUid ?? '(none)'} to task ${taskUid ?? '(none)'}, which was not imported, was skipped`, taskId)
      continue
    }
    const key = JSON.stringify([taskId, resourceId])
    if (assigned.has(key)) {
      warn('skipped-assignment', `A repeated assignment of resource ${resourceId} to task ${taskId} was skipped`, { taskId, resourceId })
      continue
    }
    assigned.add(key)
    const assignment: MsProjectAssignment = { taskId, resourceId }
    const unitsText = value('Units')
    if (unitsText !== undefined) {
      if (decimalText.test(unitsText) && Number.isFinite(Number(unitsText))) assignment.units = Number(unitsText)
      else warn('invalid-value', `The units of resource ${resourceId} on task ${taskId} cannot be read and were left out`, { taskId, resourceId })
    }
    assignments.push(assignment)
  }
  return assignments
}

/**
 * Read a Microsoft Project XML (MSPDI) document, such as one written by Microsoft Project's "Save as XML" or by
 * `toMsProjectXml`. Pure string parsing: no DOM, no network and no file access; a DOCTYPE is skipped and only the five
 * predefined entities and character references are expanded. Namespaces are matched by local name.
 *
 * The project name is `Name` when it is not blank, else `Title`, else empty. Each `Task` except the project summary task (UID 0) and empty
 * rows (`IsNull` 1) becomes an `MsProjectImportTask` with its UID as `id` and `Name`, `Start`, `Finish`, `OutlineLevel`,
 * `PercentComplete`, `Milestone`, `Summary`, `Manual`, `Active`, `Duration`, its constraint and its `Baseline`
 * dates. Dates are wall-clock times at `utcOffsetMinutes`, as `toMsProjectXml` writes them, unless they carry a zone.
 * Constraint types 2 and 4 to 7 become `constraints` as `toMsProjectXml` maps them, type 3 (Must Finish On) becomes
 * `finishNoEarlierThan` and `finishNoLaterThan` at its date, and type 1 (As Late As Possible)
 * becomes `mode: 'alap'`. `PredecessorLink` elements become dependencies with their type (FF 0, FS 1, SF 2, SS 3) and
 * `LinkLag` (tenths of a minute) as elapsed milliseconds. Problems that the reader works around are listed in
 * `warnings` (see `MsProjectImportWarningCode`) instead of thrown.
 *
 * Calendars become `calendars` (`MsProjectCalendar`): the weekly working times (`DayType` 1 to 7) and the exceptions
 * (`DayType` 0 entries and `Exceptions`) as one-off dates of a `WorkWeek`, with base calendars resolved so each week is
 * complete. Each `Exception` is classified by its `Type` before any date is expanded. A daily exception every day
 * (`Type` 1 or 7 with `Period` 1 or none), one without a `Type` or with `Type` 9, and a `DayType` 0 entry cover every
 * date from `FromDate` to `ToDate`. These recurrences become their exact dates in that period: daily every N days (from
 * `FromDate`), weekly every week on `DaysOfWeek`, monthly every month on day 1 to 28 or on the first to fourth or last
 * Sunday to Saturday, and yearly on a day (not 29 February) or on such a position of a `Month`. With
 * `EnteredByOccurrences` 1 (or `Type` 7) and a positive `Occurrences`, the first `Occurrences` dates from `FromDate` are
 * taken instead of the dates up to `ToDate`. Other recurrences (weekly every two or more weeks, monthly every two or more
 * months, days 29 to 31 or 29 February, positions of a day, weekday or weekend day, and `Type` 8) are left out with an
 * `unsupported-calendar` warning, and an exception keeps at most 3,660 dates. The project `CalendarUID` becomes
 * `defaultCalendarId` and a task's or resource's one `calendarId`. Resources (`UID`, `Name`, `Type`, `IsCostResource`,
 * `MaxUnits`, `CalendarUID`) become `resources`, where `IsCostResource` 1 or `Type` 2 is a cost resource, and
 * `Assignments` (`TaskUID`, `ResourceUID`, `Units`) become `assignments`; `Units` and `MaxUnits` stay fractions (1 is
 * 100 %). Alternate work weeks are reported in `warnings` and left out. A working weekday without times is reported
 * and left to the base calendar; an exception that is a working day without readable times is reported once, and its
 * dates are days off.
 *
 * Not imported: notes, custom fields, baseline work and cost, lags in percent, the working-time meaning of other lags,
 * resource cost rates and availability tables, assignment work, dates and contours. Throws an Error for malformed XML (with the line and column) and for a
 * document whose root element is not `Project`, and a RangeError for an invalid `utcOffsetMinutes`.
 */
export function fromMsProjectXml(xml: string, options: MsProjectXmlOptions = {}): MsProjectImport {
  const offset = checkOffset(options.utcOffsetMinutes)
  if (typeof xml !== 'string') throw new Error('Microsoft Project XML must be a string')
  const root = parseXml(xml)
  if (root.name !== 'Project') throw new Error('Not a Microsoft Project XML document: the root element is ' + root.name)
  const project = childMap(root)
  const warnings: MsProjectImportWarning[] = []
  const warn: MsWarn = (code, message, subject) => {
    pushWarning(warnings, code, message, typeof subject === 'string' ? { taskId: subject } : subject)
  }
  const calendars = readMsCalendars(project.get('Calendars'), offset, warn)
  const calendarRef = calendarReference(calendars, warn)
  const defaultCalendarId = calendarRef(project.get('CalendarUID')?.text.trim(), undefined, 'The project')
  const { tasks, links, ids } = readMsTasks(project.get('Tasks'), offset, warn, calendarRef)
  const dependencies: MsProjectDependency[] = []
  for (const { id, elements } of links) {
    for (const element of elements) {
      const dependency = readMsDependency(element, id, ids, warn)
      if (dependency) dependencies.push(dependency)
    }
  }
  const { resources, resourceIds } = readMsResources(project.get('Resources'), warn, calendarRef)
  const assignments = readMsAssignments(project.get('Assignments'), ids, resourceIds, warn)
  const projectName = project.get('Name')?.text
  const name = projectName?.trim() ? projectName : project.get('Title')?.text ?? projectName ?? ''
  const result: MsProjectImport = { name, tasks, dependencies, warnings }
  if (calendars.length) result.calendars = calendars
  if (defaultCalendarId !== undefined) result.defaultCalendarId = defaultCalendarId
  if (resources.length) result.resources = resources
  if (assignments.length) result.assignments = assignments
  return result
}

/**
 * Turn the calendars of a plan, such as the result of `fromMsProjectXml`, into `WorkCalendar`s for `scheduleTasks` and
 * `levelResources`: `buildWorkPeriods(range, calendar.week)` for each calendar, with the calendar's `id`. Pass the
 * project's `defaultCalendarId` as `ScheduleInput.defaultCalendarId` and a task's `calendarId` as
 * `ScheduleTask.calendarId`. Throws what `buildWorkPeriods` throws, for example for a range of more than 3,661 days.
 */
export function workCalendarsFromMsProject(project: { calendars?: readonly MsProjectCalendar[] }, range: TimeRange): WorkCalendar[] {
  return (project.calendars ?? []).map(calendar => ({ id: calendar.id, periods: buildWorkPeriods(range, calendar.week) }))
}

export interface MsProjectResourceLoadOptions {
  /**
   * Whole units per 100 % of a full-time resource, because `calculateResourceLoad` and `levelResources` count integer
   * units while Microsoft Project uses fractions. Capacity and units are multiplied by it and rounded. Default 100, so
   * one unit is 1 %; use 1 when every resource and assignment is whole-numbered.
   */
  unitScale?: number
  /**
   * With a range, a resource with a calendar gets `periods`, the working time of that calendar inside the range, so its
   * capacity is 0 outside them. Resources without a calendar are available for the whole range.
   */
  range?: TimeRange
}

export interface MsProjectResourceLoad {
  /** The work resources, as `calculateResourceLoad` and `levelResources` take them. */
  resources: ResourceCapacity[]
  /** The assignments of work resources to tasks that are not summary tasks, with `units` set. */
  assignments: ResourceAssignment[]
  /** `skipped-assignment` for an assignment that rounds to less than one unit. */
  warnings: MsProjectImportWarning[]
}

/**
 * Map the resources and assignments of a plan, such as the result of `fromMsProjectXml`, to the shapes of
 * `calculateResourceLoad`, `levelResources` and `projectResourceTimeline`. Only work resources count (`type` `'work'` or
 * absent); material and cost resources, and assignments to them or to summary tasks, are left out. A resource's
 * `capacity` is `maxUnits` (default 1) and an assignment's `units` its `units` (default 1), both times `unitScale` and
 * rounded. An assignment that rounds to 0 is left out with a warning. The input is validated like `toMsProjectXml`.
 * Throws a RangeError for an invalid `unitScale`.
 */
export function resourceLoadFromMsProject(project: MsProjectInput, options: MsProjectResourceLoadOptions = {}): MsProjectResourceLoad {
  const scale = options.unitScale ?? 100
  if (!Number.isSafeInteger(scale) || scale < 1) throw new RangeError('unitScale must be a positive integer')
  const { uids, levels } = checkMsProjectTasks(project.tasks)
  checkMsProjectExtras(project, uids)
  const summaries = new Set<string>()
  project.tasks.forEach((task, index) => {
    if ((levels[index + 1] ?? 0) > levels[index]!) summaries.add(task.id)
  })
  const calendars = new Map((project.calendars ?? []).map(calendar => [calendar.id, calendar]))
  const resources: ResourceCapacity[] = []
  const work = new Set<string>()
  for (const resource of project.resources ?? []) {
    if (resource.type !== undefined && resource.type !== 'work') continue
    const capacity = Math.round((resource.maxUnits ?? 1) * scale)
    if (!Number.isSafeInteger(capacity)) throw new RangeError('Resource capacity is too large for the unit scale: ' + resource.id)
    const entry: ResourceCapacity = { id: resource.id, capacity }
    if (options.range && resource.calendarId !== undefined) entry.periods = buildWorkPeriods(options.range, calendars.get(resource.calendarId)!.week)
    resources.push(entry)
    work.add(resource.id)
  }
  const assignments: ResourceAssignment[] = []
  const warnings: MsProjectImportWarning[] = []
  for (const assignment of project.assignments ?? []) {
    if (!work.has(assignment.resourceId) || summaries.has(assignment.taskId)) continue
    const units = Math.round((assignment.units ?? 1) * scale)
    if (!Number.isSafeInteger(units) || units < 1) {
      pushWarning(warnings, 'skipped-assignment',
        `The assignment of resource ${assignment.resourceId} to task ${assignment.taskId} has less than one unit at this unit scale and was left out`,
        { taskId: assignment.taskId, resourceId: assignment.resourceId })
      continue
    }
    assignments.push({ resourceId: assignment.resourceId, taskId: assignment.taskId, units })
  }
  return { resources, assignments, warnings }
}

export interface MsProjectTimelineOptions {
  /**
   * The baseline set ID of a Microsoft Project baseline number. Default `baseline` for 0 and `baseline1` to
   * `baseline10` for 1 to 10, as Microsoft Project names them.
   */
  baselineId?: (number: number) => string
  /**
   * Keep the links that touch a summary task in `dependencies`, with the summary's row ID as their end, for GanttChart
   * `summaryDependencies` (with `showSummaries`). Default false: they are listed in `hiddenDependencyIds` instead.
   */
  summaryDependencies?: boolean
}

/** GanttChart data from `timelineFromMsProject`. */
export interface MsProjectTimeline {
  rows: TimelineRow[]
  bars: TimelineBar[]
  /** Links between bars, with the IDs `link-1`, `link-2`, … in input order. */
  dependencies: TimelineDependency[]
  /**
   * IDs of the links that are not in `dependencies` because one of their tasks is a summary task without a bar. Empty
   * with `summaryDependencies`.
   */
  hiddenDependencyIds: string[]
  /** Present when the plan has resources: its work resources, ready for `projectResourceTimeline`. */
  resources?: ResourceTimelineResource[]
  /** Present with `resources`: the assignments of those resources to bars, as `resourceLoadFromMsProject` maps them (units in percent). */
  assignments?: ResourceAssignment[]
}

const defaultBaselineId = (number: number) => number === 0 ? 'baseline' : 'baseline' + number

/**
 * Turn a Microsoft Project plan, such as the result of `fromMsProjectXml` or the input of `toMsProjectXml`, into
 * GanttChart rows, bars and dependencies. Every task is a row with the task ID and name, and the outline levels become
 * the row hierarchy (`parentId`). A task that the next task is nested under is a summary task: its row has no bar, so
 * GanttChart `showSummaries` draws it from its subtasks. Every other task gets a bar with the task ID, the name, its
 * dates, `progress` (percent complete / 100), `constraints` and its baselines as named `baselines`
 * (`options.baselineId`). A milestone (`milestone` or `start === end`) is a zero-length bar at its start, and an
 * inactive task has `appearance: 'outline'`. Dependencies get the IDs `link-1`, `link-2`, … in input order, with
 * `type` and `lag` when given; a link that touches a summary task is listed in `hiddenDependencyIds` instead, unless
 * `options.summaryDependencies` keeps it in `dependencies` with the summary's row ID as its end.
 *
 * When the plan has `resources`, the result also has `resources` (`id`, `label` = name) and `assignments` for
 * `projectResourceTimeline`, computed by `resourceLoadFromMsProject` with its default unit scale (units in percent).
 *
 * Throws the Errors and RangeErrors of `toMsProjectXml` for invalid tasks and dependencies, and an Error for a
 * baseline set ID that is empty, `timelineBaselineId` or used for two numbers. The input is not modified.
 */
export function timelineFromMsProject(project: MsProjectInput, options: MsProjectTimelineOptions = {}): MsProjectTimeline {
  const { uids, levels } = checkMsProjectTasks(project.tasks)
  const baselineId = options.baselineId ?? defaultBaselineId
  const setIds = new Map<string, number>()
  const setId = (number: number) => {
    const id = baselineId(number)
    if (!isId(id) || id === timelineBaselineId) throw inContext(invalidIdError('baseline set', id), 'baseline ' + number)
    if (setIds.has(id) && setIds.get(id) !== number) throw inContext(duplicateIdError('baseline set', id), 'baseline ' + number)
    setIds.set(id, number)
    return id
  }
  const rows: TimelineRow[] = [], bars: TimelineBar[] = []
  const summaries = new Set<string>()
  const parents: string[] = []
  project.tasks.forEach((task, index) => {
    const level = levels[index]!
    parents.length = level - 1
    const row: TimelineRow = { id: task.id, label: task.name }
    if (level > 1) row.parentId = parents[level - 2]!
    parents.push(task.id)
    rows.push(row)
    if ((levels[index + 1] ?? 0) > level) {
      summaries.add(task.id)
      return
    }
    const milestone = task.milestone === true || task.start === task.end
    const bar: TimelineBar = { id: task.id, rowId: task.id, label: task.name, start: task.start, end: milestone ? task.start : task.end }
    if (task.percentComplete !== undefined) bar.progress = task.percentComplete / 100
    if (task.inactive === true) bar.appearance = 'outline'
    if (task.baselines?.length) bar.baselines = task.baselines.map(baseline => ({ id: setId(baseline.number), start: baseline.start, end: baseline.end }))
    const constraints = timelineConstraints(task.constraints)
    if (constraints) bar.constraints = constraints
    bars.push(bar)
  })
  const dependencies: TimelineDependency[] = [], hiddenDependencyIds: string[] = []
  ;(project.dependencies ?? []).forEach((dependency, index) => {
    checkMsProjectDependency(dependency, uids)
    const id = 'link-' + (index + 1)
    if (!options.summaryDependencies && (summaries.has(dependency.from) || summaries.has(dependency.to))) {
      hiddenDependencyIds.push(id)
      return
    }
    const link: TimelineDependency = { id, from: dependency.from, to: dependency.to }
    if (dependency.type !== undefined) link.type = dependency.type
    if (dependency.lag) link.lag = dependency.lag
    dependencies.push(link)
  })
  const result: MsProjectTimeline = { rows, bars, dependencies, hiddenDependencyIds }
  if (project.resources?.length) {
    const load = resourceLoadFromMsProject(project)
    const work = new Set(load.resources.map(resource => resource.id))
    result.resources = project.resources.filter(resource => work.has(resource.id)).map(resource => ({ id: resource.id, label: resource.name }))
    result.assignments = load.assignments
  }
  return result
}
