// Interchange formats: Microsoft Project XML (MSPDI), iCalendar and CSV. Pure string builders and readers without a DOM.
import { escapeXml } from './exportSvg.js'
import { timelineWbsCodes } from './rowHierarchy.js'
import { createTimelineRowTree, timelineBaselineId } from './timeline.js'
import { maxUtcOffsetMinutes } from './workCalendar.js'
import type {
  TimelineBar, TimelineConstraintKind, TimelineConstraints, TimelineDependency, TimelineDependencyType, TimelineRow,
} from './types.js'
import { timelineConstraints } from './timeline.js'

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
   * one constraint, so exactly one set constraint is written as `ConstraintType` and `ConstraintDate`; with two or more
   * none is written.
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
}

export interface MsProjectXmlOptions {
  /** Fixed offset from UTC in minutes for the written wall-clock dates. Default 0 (UTC). */
  utcOffsetMinutes?: number
}

const minuteMs = 60_000
const secondMs = 1000
const linkTypes: Record<TimelineDependencyType, number> = { FF: 0, FS: 1, SF: 2, SS: 3 }
// MSPDI ConstraintType: 2 Must Start On, 4 Start No Earlier Than, 5 Start No Later Than, 6 Finish No Earlier Than and
// 7 Finish No Later Than.
const constraintTypes: Record<TimelineConstraintKind, number> = {
  fixedStart: 2, startNoEarlierThan: 4, startNoLaterThan: 5, finishNoEarlierThan: 6, finishNoLaterThan: 7,
}

function checkTime(value: number, what: string) {
  if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > 8.64e15) throw new RangeError(what + ' must be a finite time')
}

function checkText(value: unknown, what: string) {
  if (value === undefined || value === null) throw new Error(what + ' is missing')
}

function checkOffset(value: number | undefined) {
  const offset = value ?? 0
  if (!Number.isInteger(offset) || Math.abs(offset) > maxUtcOffsetMinutes) {
    throw new RangeError(`utcOffsetMinutes must be an integer between -${maxUtcOffsetMinutes} and ${maxUtcOffsetMinutes}`)
  }
  return offset
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
    if (typeof task.id !== 'string' || !task.id || uids.has(task.id)) throw new Error('Invalid or duplicate task ID: ' + task.id)
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

/** Round a time to the nearest whole second (halves up), the resolution of MSPDI and iCalendar date-times. */
function toSecond(time: number) {
  return Math.round(time / secondMs) * secondMs
}

/** A local ISO date-time without an offset, as MSPDI expects. `time` is a whole second. */
function localIso(time: number, offset: number) {
  const iso = new Date(time + offset * minuteMs).toISOString()
  if (!/^\d{4}-/.test(iso)) throw new RangeError('Dates must be between the years 0 and 9999')
  return iso.slice(0, 19)
}

/** An ISO 8601 duration with whole hours, minutes and seconds, such as PT26H30M0S. `ms` is whole seconds. */
function isoDuration(ms: number) {
  const seconds = Math.round(ms / secondMs)
  return `PT${Math.floor(seconds / 3600)}H${Math.floor(seconds % 3600 / 60)}M${seconds % 60}S`
}

/** `ConstraintType` and `ConstraintDate` of a task with exactly one constraint; nothing otherwise. */
function constraintElements(constraints: TimelineConstraints | undefined, offset: number) {
  const set = Object.entries(timelineConstraints(constraints) ?? {}) as [TimelineConstraintKind, number][]
  if (set.length !== 1) return ''
  const [kind, time] = set[0]!
  return `<ConstraintType>${constraintTypes[kind]}</ConstraintType><ConstraintDate>${localIso(toSecond(time), offset)}</ConstraintDate>`
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
 * task dates. A task can hold only one constraint in Microsoft Project, so a task with several gets none.
 *
 * A task with `inactive: true` is written with `Active` 0, and one with `manual: false` as automatically scheduled
 * (`Manual` 0); without them every task is active and manually scheduled.
 *
 * Not exported: calendars, resources, assignments, a second constraint of a task, notes, custom fields and baseline
 * work or cost. Task IDs of the input are not written; the UIDs follow the input order.
 *
 * Throws an Error for empty or duplicate task IDs, a missing project or task name, unknown dependency ends, a
 * dependency from a task to itself, unknown link types, a duplicate baseline number on a task and `inactive` or `manual`
 * flags that are not booleans, and a RangeError for non-finite or unordered dates (also of baselines), an invalid
 * outline level, percent complete, lag, baseline number or constraint time.
 */
export function toMsProjectXml(project: MsProjectInput, options: MsProjectXmlOptions = {}): string {
  const offset = checkOffset(options.utcOffsetMinutes)
  checkText(project.name, 'The project name')
  const { uids, levels } = checkMsProjectTasks(project.tasks)
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
    return '<Task>'
      + `<UID>${uid}</UID><ID>${uid}</ID><Name>${escapeXml(task.name)}</Name>`
      + `<Active>${task.inactive === true ? 0 : 1}</Active><Manual>${task.manual === false ? 0 : 1}</Manual>`
      + `<WBS>${number}</WBS><OutlineNumber>${number}</OutlineNumber><OutlineLevel>${level}</OutlineLevel>`
      + `<Start>${start}</Start><Finish>${finish}</Finish><Duration>${duration}</Duration>`
      + `<ManualStart>${start}</ManualStart><ManualFinish>${finish}</ManualFinish><ManualDuration>${duration}</ManualDuration>`
      + `<Milestone>${milestone ? 1 : 0}</Milestone><Summary>${summary ? 1 : 0}</Summary>`
      + `<PercentComplete>${Math.round(task.percentComplete ?? 0)}</PercentComplete>`
      + constraintElements(task.constraints, offset)
      + (predecessors.get(task.id) ?? []).join('')
      + (task.baselines ?? []).map(baseline => {
        const baselineStart = toSecond(baseline.start), baselineFinish = toSecond(baseline.end)
        return `<Baseline><Number>${baseline.number}</Number><Interim>0</Interim>`
          + `<Start>${localIso(baselineStart, offset)}</Start><Finish>${localIso(baselineFinish, offset)}</Finish>`
          + `<Duration>${isoDuration(baselineFinish - baselineStart)}</Duration></Baseline>`
      }).join('')
      + '</Task>'
  })
  const name = escapeXml(project.name)
  const dates = project.tasks.length
    ? `<StartDate>${localIso(projectStart, offset)}</StartDate><FinishDate>${localIso(projectEnd, offset)}</FinishDate>` : ''
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
    + '<Project xmlns="http://schemas.microsoft.com/project">'
    + `<Name>${name}</Name><Title>${name}</Title><ScheduleFromStart>1</ScheduleFromStart>${dates}`
    + `<Tasks>${tasks.join('')}</Tasks></Project>\n`
}

/** An element of a parsed XML document. */
interface XmlElement {
  /** The local name, without a namespace prefix. */
  name: string
  attributes: Map<string, string>
  children: XmlElement[]
  /** The text and CDATA directly inside the element, in document order. */
  text: string
}

const xmlName = /[A-Za-z_:À-￿][\w.\-:·À-￿]*/y
const xmlSpace = /[ \t\r\n]*/y
const predefinedEntities: Record<string, string> = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" }

function xmlError(source: string, index: number, reason: string) {
  let line = 1, lineStart = 0
  for (let i = source.indexOf('\n'); i >= 0 && i < index; i = source.indexOf('\n', i + 1)) {
    line++
    lineStart = i + 1
  }
  return new Error(`Invalid XML at line ${line}, column ${index - lineStart + 1}: ${reason}`)
}

/**
 * Replace the predefined entities and character references of text that starts at `offset`. Any other entity is an
 * error: declared entities are never expanded, so a document cannot pull in external files or grow without bound.
 */
function decodeXml(source: string, raw: string, offset: number) {
  if (!raw.includes('&')) return raw
  let result = '', cursor = 0
  for (let amp = raw.indexOf('&'); amp >= 0; amp = raw.indexOf('&', cursor)) {
    const semicolon = raw.indexOf(';', amp)
    if (semicolon < 0) throw xmlError(source, offset + amp, 'unterminated entity reference')
    const entity = raw.slice(amp + 1, semicolon)
    let value = Object.hasOwn(predefinedEntities, entity) ? predefinedEntities[entity] : undefined
    const reference = /^#(?:x([0-9A-Fa-f]{1,6})|(\d{1,7}))$/.exec(entity)
    if (reference) {
      const code = reference[1] !== undefined ? parseInt(reference[1], 16) : Number(reference[2])
      const allowed = code === 0x9 || code === 0xa || code === 0xd || (code >= 0x20 && code <= 0xd7ff)
        || (code >= 0xe000 && code <= 0xfffd) || (code >= 0x10000 && code <= 0x10ffff)
      if (allowed) value = String.fromCodePoint(code)
    }
    if (value === undefined) throw xmlError(source, offset + amp, `unknown or invalid entity &${entity};`)
    result += raw.slice(cursor, amp) + value
    cursor = semicolon + 1
  }
  return result + raw.slice(cursor)
}

/** The index after a DOCTYPE declaration that starts at `start`. Its internal subset is skipped, not interpreted. */
function skipDoctype(source: string, start: number) {
  let depth = 0
  for (let i = start + 9; i < source.length; i++) {
    const char = source[i]!
    if (char === '"' || char === '\'') {
      const close = source.indexOf(char, i + 1)
      if (close < 0) break
      i = close
    } else if (source.startsWith('<!--', i)) {
      const close = source.indexOf('-->', i + 4)
      if (close < 0) break
      i = close + 2
    } else if (source.startsWith('<?', i)) {
      const close = source.indexOf('?>', i + 2)
      if (close < 0) break
      i = close + 1
    } else if (char === '[') depth++
    else if (char === ']') depth--
    else if (char === '>' && depth <= 0) return i + 1
  }
  throw xmlError(source, start, 'unterminated DOCTYPE declaration')
}

/**
 * Parse an XML document into its root element with a loop, without a DOM: elements, attributes, text, the predefined
 * entities, character references, CDATA, comments and processing instructions. A DOCTYPE is skipped and its
 * declarations are not used. Element and attribute names keep only their local part. Throws an Error with the line
 * and column for malformed XML.
 */
function parseXml(input: string): XmlElement {
  const source = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input
  const length = source.length
  const stack: { element: XmlElement; tag: string }[] = []
  let root: XmlElement | undefined
  const nameAt = (index: number) => {
    xmlName.lastIndex = index
    return xmlName.exec(source)?.[0]
  }
  const spaceAfter = (index: number) => {
    xmlSpace.lastIndex = index
    xmlSpace.exec(source)
    return xmlSpace.lastIndex
  }
  let index = 0
  while (index < length) {
    const open = source.indexOf('<', index)
    const textEnd = open < 0 ? length : open
    if (textEnd > index) {
      const raw = source.slice(index, textEnd)
      const parent = stack.at(-1)
      if (parent) parent.element.text += decodeXml(source, raw.replace(/\r\n?/g, '\n'), index)
      else if (!/^[ \t\r\n]*$/.test(raw)) throw xmlError(source, index, 'text outside the root element')
      index = textEnd
      if (open < 0) break
    }
    if (source.startsWith('<?', index)) {
      const close = source.indexOf('?>', index + 2)
      if (close < 0) throw xmlError(source, index, 'unterminated processing instruction')
      index = close + 2
    } else if (source.startsWith('<!--', index)) {
      const close = source.indexOf('-->', index + 4)
      if (close < 0) throw xmlError(source, index, 'unterminated comment')
      index = close + 3
    } else if (source.startsWith('<![CDATA[', index)) {
      const parent = stack.at(-1)
      if (!parent) throw xmlError(source, index, 'CDATA outside the root element')
      const close = source.indexOf(']]>', index + 9)
      if (close < 0) throw xmlError(source, index, 'unterminated CDATA section')
      parent.element.text += source.slice(index + 9, close).replace(/\r\n?/g, '\n')
      index = close + 3
    } else if (source.startsWith('<!DOCTYPE', index)) {
      if (root) throw xmlError(source, index, 'a DOCTYPE after the root element')
      index = skipDoctype(source, index)
    } else if (source[index + 1] === '!') {
      throw xmlError(source, index, 'unsupported markup declaration')
    } else if (source[index + 1] === '/') {
      const tag = nameAt(index + 2)
      if (tag === undefined) throw xmlError(source, index + 2, 'expected an element name')
      const close = spaceAfter(index + 2 + tag.length)
      if (source[close] !== '>') throw xmlError(source, close, 'expected > after the end tag name')
      const element = stack.pop()
      if (!element) throw xmlError(source, index, 'end tag </' + tag + '> without a start tag')
      if (element.tag !== tag) throw xmlError(source, index, `end tag </${tag}> does not close <${element.tag}>`)
      index = close + 1
    } else {
      if (root && !stack.length) throw xmlError(source, index, 'a second root element')
      const tag = nameAt(index + 1)
      if (tag === undefined) throw xmlError(source, index + 1, 'expected an element name')
      const element: XmlElement = { name: tag.slice(tag.lastIndexOf(':') + 1), attributes: new Map(), children: [], text: '' }
      const qualified = new Set<string>()
      let cursor = index + 1 + tag.length
      let empty = false
      for (;;) {
        const next = spaceAfter(cursor)
        if (source[next] === '>') {
          cursor = next + 1
          break
        }
        if (source.startsWith('/>', next)) {
          cursor = next + 2
          empty = true
          break
        }
        if (next >= length) throw xmlError(source, index, `unterminated start tag <${tag}>`)
        const attribute = next > cursor ? nameAt(next) : undefined
        if (attribute === undefined) throw xmlError(source, next, `expected an attribute name or the end of <${tag}>`)
        const equals = spaceAfter(next + attribute.length)
        if (source[equals] !== '=') throw xmlError(source, equals, 'expected = after the attribute name ' + attribute)
        const quoteAt = spaceAfter(equals + 1)
        const quote = source[quoteAt]
        if (quote !== '"' && quote !== '\'') throw xmlError(source, quoteAt, 'expected a quoted value for the attribute ' + attribute)
        const close = source.indexOf(quote, quoteAt + 1)
        if (close < 0) throw xmlError(source, quoteAt, 'unterminated value of the attribute ' + attribute)
        const raw = source.slice(quoteAt + 1, close)
        if (raw.includes('<')) throw xmlError(source, quoteAt, 'a < in the value of the attribute ' + attribute)
        if (qualified.has(attribute)) throw xmlError(source, next, 'duplicate attribute ' + attribute)
        qualified.add(attribute)
        element.attributes.set(attribute.slice(attribute.lastIndexOf(':') + 1),
          decodeXml(source, raw.replace(/\r\n?/g, '\n').replace(/[\t\n]/g, ' '), quoteAt + 1))
        cursor = close + 1
      }
      const parent = stack.at(-1)
      if (parent) parent.element.children.push(element)
      else root = element
      if (!empty) stack.push({ element, tag })
      index = cursor
    }
  }
  if (stack.length) throw xmlError(source, length, `unclosed element <${stack.at(-1)!.tag}>`)
  if (!root) throw xmlError(source, length, 'no root element')
  return root
}

/** The first child element of each local name. */
function childMap(element: XmlElement) {
  const map = new Map<string, XmlElement>()
  for (const child of element.children) if (!map.has(child.name)) map.set(child.name, child)
  return map
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
 * `unsupported-constraint`: Must Finish On (3), an unknown constraint type or a constraint without a date, which was
 * left out. `skipped-baseline`: a baseline with an invalid or repeated number or unreadable or inverted dates.
 * `unknown-predecessor`: a link from a task that was not imported. `skipped-link`: a link to another project, from a
 * task to itself or of an unknown type. `percent-lag`: a lag in percent of the predecessor's duration, which was left
 * out. `working-time-lag`: a lag in working time, which was read as the same amount of elapsed time.
 */
export type MsProjectImportWarningCode =
  | 'skipped-task' | 'outline-level' | 'invalid-value' | 'unsupported-constraint' | 'skipped-baseline'
  | 'unknown-predecessor' | 'skipped-link' | 'percent-lag' | 'working-time-lag'

export interface MsProjectImportWarning {
  code: MsProjectImportWarningCode
  /** The imported ID (the UID) of the task the warning is about, when there is one. */
  taskId?: string
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
  const values = [year, month, day, hour, minute, second].map(Number) as [number, number, number, number, number, number]
  const [y, mo, d, h, mi, s] = values
  if (mo < 1 || mo > 12 || d < 1 || h > 23 || mi > 59 || s > 59) return undefined
  const date = new Date(0)
  date.setUTCFullYear(y, mo - 1, d)
  if (date.getUTCDate() !== d) return undefined
  date.setUTCHours(h, mi, s, fraction ? Math.round(Number(fraction) * 1000) : 0)
  let minutes = offset
  if (zone === 'Z') minutes = 0
  else if (zone) minutes = (zone[0] === '-' ? -1 : 1) * (Number(zone.slice(1, 3)) * 60 + Number(zone.slice(4, 6)))
  return date.getTime() - minutes * minuteMs
}

const hourMs = 3_600_000

/** Milliseconds of an ISO 8601 duration with days, hours, minutes and seconds; undefined for years, months or bad text. */
function msDurationValue(text: string): number | undefined {
  const match = msDuration.exec(text)
  if (!match || text === 'P' || text.endsWith('T') || match[1] !== undefined || match[2] !== undefined) return undefined
  const [weeks = 0, days = 0, hours = 0, minutes = 0, seconds = 0] = match.slice(3).map(part => part === undefined ? undefined : Number(part))
  return Math.round((((weeks * 7 + days) * 24 + hours) * 60 + minutes) * minuteMs + seconds * secondMs)
}

const isTrue = (text: string | undefined) => text === '1' || text === 'true'
const uidPattern = /^\d+$/

/**
 * Read a Microsoft Project XML (MSPDI) document, such as one written by Microsoft Project's "Save as XML" or by
 * `toMsProjectXml`. Pure string parsing: no DOM, no network and no file access; a DOCTYPE is skipped and only the five
 * predefined entities and character references are expanded. Namespaces are matched by local name.
 *
 * The project name is `Name` when it is not blank, else `Title`, else empty. Each `Task` except the project summary task (UID 0) and empty
 * rows (`IsNull` 1) becomes an `MsProjectImportTask` with its UID as `id` and `Name`, `Start`, `Finish`, `OutlineLevel`,
 * `PercentComplete`, `Milestone`, `Summary`, `Manual`, `Active`, `Duration`, its constraint and its `Baseline`
 * dates. Dates are wall-clock times at `utcOffsetMinutes`, as `toMsProjectXml` writes them, unless they carry a zone.
 * Constraint types 2 and 4 to 7 become `constraints` as `toMsProjectXml` maps them, and type 1 (As Late As Possible)
 * becomes `mode: 'alap'`. `PredecessorLink` elements become dependencies with their type (FF 0, FS 1, SF 2, SS 3) and
 * `LinkLag` (tenths of a minute) as elapsed milliseconds. Problems that the reader works around are listed in
 * `warnings` (see `MsProjectImportWarningCode`) instead of thrown.
 *
 * Not imported: calendars, resources, assignments, notes, custom fields, baseline work and cost, lags in percent and
 * the working-time meaning of other lags. Throws an Error for malformed XML (with the line and column) and for a
 * document whose root element is not `Project`, and a RangeError for an invalid `utcOffsetMinutes`.
 */
export function fromMsProjectXml(xml: string, options: MsProjectXmlOptions = {}): MsProjectImport {
  const offset = checkOffset(options.utcOffsetMinutes)
  if (typeof xml !== 'string') throw new Error('Microsoft Project XML must be a string')
  const root = parseXml(xml)
  if (root.name !== 'Project') throw new Error('Not a Microsoft Project XML document: the root element is ' + root.name)
  const project = childMap(root)
  const warnings: MsProjectImportWarning[] = []
  const warn = (code: MsProjectImportWarningCode, message: string, taskId?: string) => {
    warnings.push(taskId === undefined ? { code, message } : { code, taskId, message })
  }
  const tasks: MsProjectImportTask[] = []
  const links: { id: string; elements: XmlElement[] }[] = []
  const ids = new Set<string>()
  let previousLevel = 0
  for (const element of project.get('Tasks')?.children ?? []) {
    if (element.name !== 'Task') continue
    const fields = childMap(element)
    const value = (name: string) => fields.get(name)?.text.trim()
    if (isTrue(value('IsNull'))) continue
    const uid = value('UID')
    if (uid === undefined || !uidPattern.test(uid)) {
      warn('skipped-task', 'A task without a valid UID was skipped')
      continue
    }
    const id = uid.replace(/^0+(?=\d)/, '')
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
      const percent = /^\d+(\.\d+)?$/.test(percentText) ? Number(percentText) : NaN
      if (percent <= 100) percentComplete = percent
      else warn('invalid-value', `Task ${id} has an invalid percent complete, read as 0`, id)
    }
    const task: MsProjectImportTask = {
      id, name: fields.get('Name')?.text ?? '', start, end, outlineLevel: level, percentComplete,
      milestone: isTrue(value('Milestone')), summary: isTrue(value('Summary')), manual: isTrue(value('Manual')),
      inactive: value('Active') === '0' || value('Active') === 'false',
    }
    const durationText = value('Duration')
    if (durationText !== undefined) {
      const duration = msDurationValue(durationText)
      if (duration === undefined) warn('invalid-value', `Task ${id} has a duration that cannot be read: ${durationText}`, id)
      else task.duration = duration
    }
    const constraintType = value('ConstraintType')
    if (constraintType === '1') task.mode = 'alap'
    else if (constraintType !== undefined && constraintType !== '0') {
      const kind = Object.hasOwn(constraintKinds, constraintType) ? constraintKinds[constraintType] : undefined
      const date = msDate(value('ConstraintDate'), offset)
      if (kind === undefined) {
        const label = constraintType === '3' ? 'Must Finish On (3)' : 'type ' + constraintType
        warn('unsupported-constraint', `The constraint ${label} of task ${id} is not supported and was left out`, id)
      } else if (date === undefined) {
        warn('unsupported-constraint', `The constraint of task ${id} has no valid date and was left out`, id)
      } else task.constraints = { [kind]: date }
    }
    const baselines: MsProjectBaseline[] = []
    for (const child of element.children) {
      if (child.name !== 'Baseline') continue
      const baseline = childMap(child)
      const startText = baseline.get('Start')?.text.trim(), finishText = baseline.get('Finish')?.text.trim()
      // Baselines of work or cost only have no dates.
      if (startText === undefined && finishText === undefined) continue
      const numberText = baseline.get('Number')?.text.trim() ?? ''
      const number = uidPattern.test(numberText) ? Number(numberText) : NaN
      const baselineStart = msDate(startText, offset), baselineEnd = msDate(finishText, offset)
      if (!(number <= 10) || baselines.some(item => item.number === number)) {
        warn('skipped-baseline', `A baseline of task ${id} has an invalid or repeated number and was skipped`, id)
      } else if (baselineStart === undefined || baselineEnd === undefined || baselineEnd < baselineStart) {
        warn('skipped-baseline', `Baseline ${number} of task ${id} has no valid Start and Finish and was skipped`, id)
      } else baselines.push({ number, start: baselineStart, end: baselineEnd })
    }
    if (baselines.length) task.baselines = baselines
    tasks.push(task)
    links.push({ id, elements: element.children.filter(child => child.name === 'PredecessorLink') })
  }

  const dependencies: MsProjectDependency[] = []
  for (const { id, elements } of links) {
    for (const element of elements) {
      const fields = childMap(element)
      const value = (name: string) => fields.get(name)?.text.trim()
      const from = value('PredecessorUID')?.replace(/^0+(?=\d)/, '')
      if (isTrue(value('CrossProject'))) {
        warn('skipped-link', `A link to task ${id} from another project was skipped`, id)
        continue
      }
      if (from === undefined || !ids.has(from)) {
        warn('unknown-predecessor', `A link to task ${id} from task ${from ?? '(none)'}, which was not imported, was skipped`, id)
        continue
      }
      if (from === id) {
        warn('skipped-link', `A link from task ${id} to itself was skipped`, id)
        continue
      }
      const typeText = value('Type') ?? '1'
      const type = /^[0-3]$/.test(typeText) ? linkNames[Number(typeText)]! : undefined
      if (!type) {
        warn('skipped-link', `A link from task ${from} to task ${id} has an unknown type and was skipped`, id)
        continue
      }
      const dependency: MsProjectDependency = { from, to: id, type }
      const lagText = value('LinkLag')
      if (lagText !== undefined && lagText !== '0') {
        const format = value('LagFormat')
        if (!/^[+-]?\d+$/.test(lagText)) {
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
      dependencies.push(dependency)
    }
  }
  const projectName = project.get('Name')?.text
  const name = projectName?.trim() ? projectName : project.get('Title')?.text ?? projectName ?? ''
  return { name, tasks, dependencies, warnings }
}

export interface MsProjectTimelineOptions {
  /**
   * The baseline set ID of a Microsoft Project baseline number. Default `baseline` for 0 and `baseline1` to
   * `baseline10` for 1 to 10, as Microsoft Project names them.
   */
  baselineId?: (number: number) => string
}

/** GanttChart data from `timelineFromMsProject`. */
export interface MsProjectTimeline {
  rows: TimelineRow[]
  bars: TimelineBar[]
  /** Links between bars, with the IDs `link-1`, `link-2`, … in input order. */
  dependencies: TimelineDependency[]
  /** IDs of the links that are not in `dependencies` because one of their tasks is a summary task without a bar. */
  hiddenDependencyIds: string[]
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
 * `type` and `lag` when given; a link that touches a summary task is listed in `hiddenDependencyIds` instead.
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
    if (typeof id !== 'string' || !id || id === timelineBaselineId || (setIds.has(id) && setIds.get(id) !== number)) {
      throw new Error('Invalid or repeated baseline set ID for baseline ' + number + ': ' + id)
    }
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
    if (summaries.has(dependency.from) || summaries.has(dependency.to)) {
      hiddenDependencyIds.push(id)
      return
    }
    const link: TimelineDependency = { id, from: dependency.from, to: dependency.to }
    if (dependency.type !== undefined) link.type = dependency.type
    if (dependency.lag) link.lag = dependency.lag
    dependencies.push(link)
  })
  return { rows, bars, dependencies, hiddenDependencyIds }
}

export interface ICalendarEvent {
  /** Unique within the calendar. Written as the event UID; make it globally unique, for example `id@example.com`. */
  id: string
  summary: string
  /** Epoch milliseconds. */
  start: number
  /** Epoch milliseconds, not before `start`. An event with `end === start` is written without DTEND. */
  end: number
  description?: string
}

export interface ICalendarOptions {
  /** PRODID value. Default `-//vue-weave//Timeline export//EN`. */
  productId?: string
  /** Calendar name, written as NAME and X-WR-CALNAME. */
  calendarName?: string
  /** DTSTAMP of every event, in epoch milliseconds. Default `Date.now()`; pass it for reproducible output. */
  timestamp?: number
}

const encoder = new TextEncoder()

/** UTC date-time in iCalendar basic format, such as 20261109T080000Z, rounded to the nearest whole second. */
function icalTime(time: number) {
  checkTime(time, 'An event time')
  const iso = new Date(toSecond(time)).toISOString()
  if (!/^\d{4}-/.test(iso)) throw new RangeError('Dates must be between the years 0 and 9999')
  return iso.slice(0, 19).replace(/[-:]/g, '') + 'Z'
}

/** Escape an iCalendar TEXT value and drop control characters other than tab and line breaks. */
function icalText(value: string) {
  return String(value)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r\n|\r|\n/g, '\\n')
}

/** Fold a content line into lines of at most 75 octets, never splitting a UTF-8 character. */
function fold(line: string) {
  const parts: string[] = []
  let current = '', size = 0
  for (const char of line) {
    const bytes = encoder.encode(char).length
    // Continuation lines start with a space, which counts towards their 75 octets.
    if (size + bytes > 75) {
      parts.push(current)
      current = ' '
      size = 1
    }
    current += char
    size += bytes
  }
  parts.push(current)
  return parts.join('\r\n')
}

/**
 * Build an iCalendar (RFC 5545) document with one VEVENT per event: UID, DTSTAMP, DTSTART, DTEND, SUMMARY and an
 * optional DESCRIPTION. Times are written in UTC, rounded to the nearest whole second; DTEND is written only when the
 * rounded end is after the rounded start. Text is escaped, lines end with CRLF and are folded at 75 octets.
 * Throws an Error for empty or duplicate IDs and a missing summary, and a RangeError for non-finite or unordered times.
 */
export function toICalendar(events: readonly ICalendarEvent[], options: ICalendarOptions = {}): string {
  const stamp = icalTime(options.timestamp ?? Date.now())
  const ids = new Set<string>()
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:' + icalText(options.productId ?? '-//vue-weave//Timeline export//EN'), 'CALSCALE:GREGORIAN']
  if (options.calendarName !== undefined) {
    lines.push('NAME:' + icalText(options.calendarName), 'X-WR-CALNAME:' + icalText(options.calendarName))
  }
  for (const event of events) {
    if (typeof event.id !== 'string' || !event.id || ids.has(event.id)) throw new Error('Invalid or duplicate event ID: ' + event.id)
    ids.add(event.id)
    const start = icalTime(event.start), end = icalTime(event.end)
    if (event.end < event.start) throw new RangeError('An event cannot end before it starts: ' + event.id)
    checkText(event.summary, 'The summary of event ' + event.id)
    lines.push('BEGIN:VEVENT', 'UID:' + icalText(event.id), 'DTSTAMP:' + stamp, 'DTSTART:' + start)
    // RFC 5545 requires DTEND after DTSTART; a span that rounds to nothing is written as an instant.
    if (end !== start) lines.push('DTEND:' + end)
    lines.push('SUMMARY:' + icalText(event.summary))
    if (event.description !== undefined) lines.push('DESCRIPTION:' + icalText(event.description))
    lines.push('END:VEVENT')
  }
  lines.push('END:VCALENDAR')
  return lines.map(fold).join('\r\n') + '\r\n'
}

/** A CSV cell: text, a finite number or an empty cell. */
export type CsvCell = string | number | undefined

/**
 * Build RFC 4180 CSV text: fields separated by commas, records ended by CRLF, and fields that contain a comma, a
 * double quote, CR or LF enclosed in double quotes with inner quotes doubled. `undefined` is an empty field. Throws a
 * RangeError for a non-finite number. Spreadsheet formulas are not neutralized; prefix cells that start with `=`,
 * `+`, `-` or `@` yourself when the file is opened in a spreadsheet and the text is untrusted.
 */
export function toCsv(table: readonly (readonly CsvCell[])[]): string {
  return table.map(record => record.map(cell => {
    if (cell === undefined) return ''
    if (typeof cell === 'number') {
      if (!Number.isFinite(cell)) throw new RangeError('CSV numbers must be finite')
      return String(cell)
    }
    const text = String(cell)
    return /[",\r\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text
  }).join(',') + '\r\n').join('')
}

/** A column of `timelineCsvTable`. */
export type TimelineCsvColumn = 'row' | 'wbs' | 'bar' | 'start' | 'end' | 'progress'

export interface TimelineCsvOptions {
  /** Start and end text. Default ISO 8601 in UTC, such as 2026-11-09T08:00:00.000Z. */
  formatTime?: (time: number) => string
  /** Columns in order. Default all: row, wbs, bar, start, end, progress. */
  columns?: readonly TimelineCsvColumn[]
  /** Header texts. Defaults: Row, WBS, Bar, Start, End, Progress. */
  headers?: Partial<Record<TimelineCsvColumn, string>>
}

const csvHeaders: Record<TimelineCsvColumn, string> = { row: 'Row', wbs: 'WBS', bar: 'Bar', start: 'Start', end: 'End', progress: 'Progress' }

/**
 * A table for `toCsv`: a header record and one record per bar, ordered by row in tree preorder and then by bar input
 * order. Cells are the row label, the row's WBS code (`timelineWbsCodes`), the bar label, the formatted start and end
 * and the progress from 0 to 1 (empty without progress). Throws an Error for invalid rows, a bar of an unknown row and
 * an unknown column.
 */
export function timelineCsvTable(
  rows: readonly TimelineRow[], bars: readonly TimelineBar[], options: TimelineCsvOptions = {},
): CsvCell[][] {
  const tree = createTimelineRowTree(rows)
  const codes = timelineWbsCodes(rows)
  const columns = options.columns ?? (Object.keys(csvHeaders) as TimelineCsvColumn[])
  for (const column of columns) if (!Object.hasOwn(csvHeaders, column)) throw new Error('Unknown CSV column: ' + column)
  const format = options.formatTime ?? ((time: number) => new Date(time).toISOString())
  const byRow = new Map<string, TimelineBar[]>()
  for (const bar of bars) {
    if (!codes.has(bar.rowId)) throw new Error('Unknown row for bar: ' + bar.id)
    let list = byRow.get(bar.rowId)
    if (!list) byRow.set(bar.rowId, list = [])
    list.push(bar)
  }
  const table: CsvCell[][] = [columns.map(column => options.headers?.[column] ?? csvHeaders[column])]
  for (const { row } of tree) {
    for (const bar of byRow.get(row.id) ?? []) {
      const cells: Record<TimelineCsvColumn, CsvCell> = {
        row: row.label, wbs: codes.get(row.id), bar: bar.label, start: format(bar.start), end: format(bar.end), progress: bar.progress,
      }
      table.push(columns.map(column => cells[column]))
    }
  }
  return table
}

export interface CsvParseOptions {
  /** Field separator: one character other than a double quote, CR or LF. Default `,`. */
  delimiter?: string
}

/**
 * Parse RFC 4180 CSV text into records of fields, the inverse of `toCsv`. Records end with CRLF, LF or a lone CR, and a
 * final line break is optional. Fields enclosed in double quotes can contain the delimiter, line breaks and doubled
 * quotes (`""` is one quote). A quote inside an unquoted field is kept as text. A leading byte order mark is removed.
 * Every field is a string; an empty line is a record with one empty field, and empty text has no records.
 *
 * Throws an Error with the line and column for an unterminated quoted field or text after a closing quote, and an
 * Error for an invalid delimiter.
 */
export function parseCsv(text: string, options: CsvParseOptions = {}): string[][] {
  const delimiter = options.delimiter ?? ','
  if (typeof delimiter !== 'string' || delimiter.length !== 1 || delimiter === '"' || delimiter === '\r' || delimiter === '\n') {
    throw new Error('The CSV delimiter must be one character other than a double quote, CR or LF')
  }
  const source = String(text)
  const input = source.charCodeAt(0) === 0xfeff ? source.slice(1) : source
  const records: string[][] = []
  if (!input) return records
  let record: string[] = []
  let field = ''
  let index = 0, line = 1, lineStart = 0
  const length = input.length
  while (index < length) {
    const fieldStart = index
    if (input[index] === '"') {
      // A quoted field runs to the next quote that is not doubled.
      const openLine = line, openColumn = index - lineStart + 1
      index++
      for (;;) {
        if (index >= length) throw new Error(`Unterminated quoted CSV field starting at line ${openLine}, column ${openColumn}`)
        const char = input[index]!
        if (char === '"') {
          if (input[index + 1] === '"') {
            field += '"'
            index += 2
            continue
          }
          index++
          break
        }
        if (char === '\r' || char === '\n') {
          if (char === '\r' && input[index + 1] === '\n') {
            field += '\r'
            index++
          }
          field += input[index]!
          index++
          line++
          lineStart = index
          continue
        }
        field += char
        index++
      }
      const next = input[index]
      if (next !== undefined && next !== delimiter && next !== '\r' && next !== '\n') {
        throw new Error(`Unexpected text after a closing quote at line ${line}, column ${index - lineStart + 1}`)
      }
    } else {
      while (index < length) {
        const char = input[index]!
        if (char === delimiter || char === '\r' || char === '\n') break
        index++
      }
      field = input.slice(fieldStart, index)
    }
    record.push(field)
    field = ''
    const char = input[index]
    if (char === delimiter) {
      index++
      // A delimiter at the end of a line or of the text leaves an empty last field.
      const after = input[index]
      if (after === undefined || after === '\r' || after === '\n') record.push('')
    }
    if (input[index] === '\r' || input[index] === '\n') {
      index += input[index] === '\r' && input[index + 1] === '\n' ? 2 : 1
      line++
      lineStart = index
      records.push(record)
      record = []
    }
  }
  if (record.length) records.push(record)
  return records
}

export interface TimelineCsvImportOptions {
  /** Read a start or end cell as a time; return NaN for text that is not a time. */
  parseTime: (text: string) => number
  /**
   * The column of each field, in order, as `timelineCsvTable` wrote them. The first record is a header and is
   * skipped. Default: the columns are found by matching the header record against `headers`, ignoring case and
   * surrounding white space, and fields under other headers are ignored.
   */
  columns?: readonly (TimelineCsvColumn | undefined)[]
  /** Header texts to look for without `columns`. Defaults: Row, WBS, Bar, Start, End, Progress. */
  headers?: Partial<Record<TimelineCsvColumn, string>>
}

export interface TimelineCsvImport {
  rows: TimelineRow[]
  bars: TimelineBar[]
}

const wbsPattern = /^[1-9]\d*(\.[1-9]\d*)*$/
const decimalPattern = /^\+?(\d+\.?\d*|\.\d+)$/

/**
 * Read a table written by `timelineCsvTable` (for example from `parseCsv`) back into rows and bars. The table needs a
 * `bar`, `start` and `end` column and a `row` or `wbs` column; `progress` is optional.
 *
 * With a WBS column, each distinct code is a row with the ID `row-<code>`, the label of the first of its `row` cells
 * that is not blank (or the code when there is none) and the row of the code without its last part as parent. A
 * parent code that has no record of its own becomes a row labelled with its code. Without a WBS column, each distinct row label is a top-level row with the
 * ID `row-1`, `row-2`, … in order of appearance. Rows are returned in tree preorder; sibling order follows the WBS
 * numbers, or the order of appearance without WBS codes. Bars get the IDs `bar-1`, `bar-2`, … in record order, the
 * label of their `bar` cell, the parsed start and end and, when the progress cell is not empty, the progress from 0
 * to 1. Records whose fields are all empty are skipped.
 *
 * A custom header takes precedence over another column's default header. Throws an Error for missing or repeated
 * columns, for two custom headers that are equal (ignoring case and surrounding white space) and an Error naming the line (the one-based record number, with the
 * header on line 1) for an invalid WBS code, a time that `parseTime` cannot read, an end before the start and a
 * progress that is not a plain decimal number from 0 to 1 (such as `0.5`; not `0x1` or `1e0`).
 */
export function timelineFromCsvTable(table: readonly (readonly CsvCell[])[], options: TimelineCsvImportOptions): TimelineCsvImport {
  if (typeof options?.parseTime !== 'function') throw new Error('timelineFromCsvTable needs a parseTime function')
  const [header, ...records] = table
  if (!header) throw new Error('The CSV table has no header record')
  const position = new Map<TimelineCsvColumn, number>()
  if (options.columns) {
    options.columns.forEach((column, index) => {
      if (column === undefined) return
      if (!Object.hasOwn(csvHeaders, column)) throw new Error('Unknown CSV column: ' + column)
      if (position.has(column)) throw new Error('Repeated CSV column: ' + column)
      position.set(column, index)
    })
  } else {
    // A custom header takes precedence over another column's default header; two custom headers must differ.
    const wanted = new Map<string, TimelineCsvColumn>()
    const custom = new Set<string>()
    const columns = Object.keys(csvHeaders) as TimelineCsvColumn[]
    for (const column of columns) {
      if (options.headers?.[column] === undefined) continue
      const key = String(options.headers[column]).trim().toLowerCase()
      const other = wanted.get(key)
      if (other !== undefined) {
        throw new Error(`The CSV columns ${other} and ${column} have the same header text: ${key}; give each a distinct header`)
      }
      wanted.set(key, column)
      custom.add(column)
    }
    for (const column of columns) {
      const key = csvHeaders[column].trim().toLowerCase()
      if (!custom.has(column) && !wanted.has(key)) wanted.set(key, column)
    }
    header.forEach((cell, index) => {
      const column = wanted.get(String(cell ?? '').trim().toLowerCase())
      if (column === undefined) return
      if (position.has(column)) throw new Error('Repeated CSV column: ' + column)
      position.set(column, index)
    })
  }
  for (const column of ['bar', 'start', 'end'] as const) {
    if (!position.has(column)) throw new Error('The CSV table has no ' + (options.headers?.[column] ?? csvHeaders[column]) + ' column')
  }
  if (!position.has('row') && !position.has('wbs')) throw new Error('The CSV table needs a Row or WBS column')
  const text = (record: readonly CsvCell[], column: TimelineCsvColumn) => {
    const index = position.get(column)
    const cell = index === undefined ? undefined : record[index]
    return cell === undefined ? '' : String(cell)
  }
  // Rows by WBS code (or by label without codes), in order of appearance.
  const found = new Map<string, { id: string; label?: string; code?: string }>()
  const bars: TimelineBar[] = []
  records.forEach((record, offset) => {
    const line = offset + 2
    if (record.every(cell => cell === undefined || String(cell) === '')) return
    const label = text(record, 'row')
    let key: string
    if (position.has('wbs')) {
      const code = text(record, 'wbs').trim()
      if (!wbsPattern.test(code)) throw new Error(`Invalid WBS code on CSV line ${line}: ${code || '(empty)'}`)
      // Ancestors first, so a parent without records of its own still exists.
      const parts = code.split('.')
      for (let depth = 1; depth <= parts.length; depth++) {
        const prefix = parts.slice(0, depth).join('.')
        if (!found.has(prefix)) found.set(prefix, { id: 'row-' + prefix, code: prefix })
      }
      key = code
      const row = found.get(code)!
      // A blank row cell is no label, so a later record of the same code can still name the row.
      if (position.has('row') && row.label === undefined && label.trim()) row.label = label
    } else {
      key = label
      if (!found.has(key)) found.set(key, { id: 'row-' + (found.size + 1), label })
    }
    const startText = text(record, 'start'), endText = text(record, 'end')
    const start = options.parseTime(startText), end = options.parseTime(endText)
    if (typeof start !== 'number' || !Number.isFinite(start)) throw new RangeError(`Invalid start time on CSV line ${line}: ${startText}`)
    if (typeof end !== 'number' || !Number.isFinite(end)) throw new RangeError(`Invalid end time on CSV line ${line}: ${endText}`)
    if (end < start) throw new RangeError(`The bar on CSV line ${line} ends before it starts`)
    const bar: TimelineBar = { id: 'bar-' + (bars.length + 1), rowId: found.get(key)!.id, label: text(record, 'bar'), start, end }
    const progressText = text(record, 'progress').trim()
    if (progressText) {
      // Plain decimal notation only: no hexadecimal, binary, octal or exponent forms.
      const progress = decimalPattern.test(progressText) ? Number(progressText) : NaN
      if (!Number.isFinite(progress) || progress < 0 || progress > 1) {
        throw new RangeError(`Progress must be a number from 0 to 1 on CSV line ${line}: ${progressText}`)
      }
      bar.progress = progress
    }
    bars.push(bar)
  })
  const entries = [...found.values()]
  if (position.has('wbs')) {
    // Tree preorder: compare codes part by part as numbers. Parts have no leading zeros, so comparing their digit
    // strings by length and then lexically is exact at any size.
    const compareParts = (x: string, y: string) => x.length - y.length || (x < y ? -1 : x > y ? 1 : 0)
    entries.sort((a, b) => {
      const x = a.code!.split('.'), y = b.code!.split('.')
      for (let index = 0; index < Math.min(x.length, y.length); index++) {
        const order = compareParts(x[index]!, y[index]!)
        if (order) return order
      }
      return x.length - y.length
    })
  }
  const rows = entries.map(entry => {
    const row: TimelineRow = { id: entry.id, label: entry.label ?? entry.code ?? '' }
    const cut = entry.code?.lastIndexOf('.') ?? -1
    if (cut > 0) row.parentId = 'row-' + entry.code!.slice(0, cut)
    return row
  })
  return { rows, bars }
}
