// Internal helpers of the snapshot format: JSON walking, codecs and structural validation. Not part of the public entry.
import { createTimelineRowTree, validateTimelineData, timelineLabelColumnId } from './timeline.js'
import { indexGraph } from './graph.js'
import { scheduleTasks, type ScheduleResult } from './scheduling.js'
import { normalizeWorkPeriods } from './workCalendar.js'
import { assignmentWorkRange, capacityPeriodsOf } from './resourceCapacity.js'
import type {
  JsonValue, SnapshotCodec, SnapshotDiagnostic, SnapshotDiagnosticCode, SnapshotDiagnosticSeverity,
} from './snapshot.js'

type Rec = Record<string, unknown>

export const maxSnapshotDepth = 200

export function isRecord(value: unknown): value is Rec {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isPlainObject(value: object) {
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

/** Collects diagnostics. Errors make an operation fail; warnings are returned next to a successful result. */
export class Report {
  diagnostics: SnapshotDiagnostic[] = []
  /** The schedule of a planning snapshot, kept so that restore does not compute it twice. */
  schedule?: ScheduleResult
  add(severity: SnapshotDiagnosticSeverity, code: SnapshotDiagnosticCode, path: string, message: string) {
    this.diagnostics.push({ severity, code, path, message })
  }
  error(code: SnapshotDiagnosticCode, path: string, message: string) {
    this.add('error', code, path, message)
  }
  warn(code: SnapshotDiagnosticCode, path: string, message: string) {
    this.add('warning', code, path, message)
  }
  get failed() {
    return this.diagnostics.some(item => item.severity === 'error')
  }
}

export function codecIndex(codecs: readonly SnapshotCodec[] | undefined): Map<string, SnapshotCodec> {
  const index = new Map<string, SnapshotCodec>()
  for (const codec of codecs ?? []) {
    if (!codec || typeof codec.id !== 'string' || !codec.id) throw new Error('A snapshot codec needs a nonempty ID')
    if (index.has(codec.id)) throw new Error('Duplicate snapshot codec ID: ' + codec.id)
    if (codec.version !== undefined && (!Number.isSafeInteger(codec.version) || codec.version < 1)) {
      throw new RangeError('Snapshot codec version must be a positive integer: ' + codec.id)
    }
    index.set(codec.id, codec)
  }
  return index
}

const codecKeys = new Set(['$codec', 'version', 'value'])

/** True for the stored form of a codec value: an object with a `$codec` key. */
export function isCodecWrapper(value: unknown): value is { $codec: string; version?: number; value: JsonValue } {
  return isRecord(value) && Object.hasOwn(value, '$codec')
}

/**
 * Copy `value` into plain JSON. With `codecs`, values that are not JSON (Date, Map, BigInt...) are encoded by the first
 * codec that matches them, as `{ $codec, version, value }`. Without a codec such a value is an error, never dropped.
 * Properties whose value is `undefined` are omitted. Returns undefined for a value that is undefined or reported.
 */
export function encodeSnapshotJson(value: unknown, path: string, codecs: ReadonlyMap<string, SnapshotCodec>, report: Report, depth = 0): JsonValue | undefined {
  if (depth > maxSnapshotDepth) {
    report.error('json', path, 'Value is nested too deeply or contains a cycle')
    return undefined
  }
  if (value === undefined) return undefined
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number') {
    if (Number.isFinite(value)) return value
    report.error('number', path, 'Numbers must be finite, got ' + String(value))
    return undefined
  }
  if (typeof value === 'object' || typeof value === 'bigint') {
    for (const codec of codecs.values()) {
      if (!codec.matches?.(value)) continue
      if (!codec.encode) {
        report.error('codec', path, 'Snapshot codec cannot encode: ' + codec.id)
        return undefined
      }
      const encoded = encodeSnapshotJson(codec.encode(value), path + '.value', codecs, report, depth + 1)
      if (encoded === undefined) {
        if (!report.failed) report.error('json', path, 'Snapshot codec returned undefined: ' + codec.id)
        return undefined
      }
      return { $codec: codec.id, version: codec.version ?? 1, value: encoded }
    }
  }
  if (Array.isArray(value)) {
    const out: JsonValue[] = []
    for (let i = 0; i < value.length; i++) {
      const item = encodeSnapshotJson(value[i], path + '[' + i + ']', codecs, report, depth + 1)
      if (item === undefined && !report.failed) report.error('json', path + '[' + i + ']', 'Arrays must not contain undefined or holes')
      out.push(item as JsonValue)
    }
    return out
  }
  if (typeof value === 'object' && isPlainObject(value)) {
    const out: { [key: string]: JsonValue } = {}
    for (const key of Object.keys(value)) {
      const child = path ? path + '.' + key : key
      if (key === '__proto__') {
        report.error('structure', child, 'The key __proto__ is not allowed')
        continue
      }
      if (key === '$codec') {
        report.error('json', child, 'The key $codec is reserved for codec values')
        continue
      }
      const item = encodeSnapshotJson((value as Rec)[key], child, codecs, report, depth + 1)
      if (item !== undefined) out[key] = item
    }
    return out
  }
  report.error('json', path, 'Not a JSON value (' + (typeof value === 'object' ? 'class instance' : typeof value) + '); register a codec for it')
  return undefined
}

/** Check that parsed or migrated JSON is plain JSON with well-formed codec wrappers. Reports what it finds. */
export function checkSnapshotJson(value: unknown, path: string, report: Report, depth = 0): void {
  if (depth > maxSnapshotDepth) {
    report.error('json', path, 'Value is nested too deeply')
    return
  }
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) report.error('number', path, 'Numbers must be finite, got ' + String(value))
    return
  }
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      if (value[i] === undefined) report.error('json', path + '[' + i + ']', 'Arrays must not contain undefined or holes')
      else checkSnapshotJson(value[i], path + '[' + i + ']', report, depth + 1)
    }
    return
  }
  if (isRecord(value) && isPlainObject(value)) {
    if (isCodecWrapper(value)) {
      for (const key of Object.keys(value)) if (!codecKeys.has(key)) report.error('structure', path + '.' + key, 'Unknown field in a codec value')
      if (typeof value.$codec !== 'string' || !value.$codec) report.error('structure', path + '.$codec', 'The codec ID must be a nonempty string')
      if (value.version !== undefined && (!Number.isSafeInteger(value.version) || value.version < 1)) {
        report.error('structure', path + '.version', 'The codec version must be a positive integer')
      }
      if (!Object.hasOwn(value, 'value') || value.value === undefined) report.error('structure', path + '.value', 'A codec value needs a value')
      else checkSnapshotJson(value.value, path + '.value', report, depth + 1)
      return
    }
    for (const key of Object.keys(value)) {
      if (key === '__proto__') report.error('structure', path + '.' + key, 'The key __proto__ is not allowed')
      else if (value[key] === undefined) report.error('json', path + '.' + key, 'Values must not be undefined')
      else checkSnapshotJson(value[key], path ? path + '.' + key : key, report, depth + 1)
    }
    return
  }
  report.error('json', path, 'Not a JSON value')
}

/** Copy `value`, replacing codec wrappers by the values their registered codecs decode. Never mutates `value`. */
export function decodeSnapshotJson(value: unknown, path: string, codecs: ReadonlyMap<string, SnapshotCodec>, report: Report, depth = 0): unknown {
  if (depth > maxSnapshotDepth) {
    report.error('json', path, 'Value is nested too deeply')
    return undefined
  }
  if (Array.isArray(value)) return value.map((item, i) => decodeSnapshotJson(item, path + '[' + i + ']', codecs, report, depth + 1))
  if (!isRecord(value)) return value
  if (isCodecWrapper(value)) {
    const codec = codecs.get(value.$codec)
    if (!codec || !codec.decode) {
      report.error('codec', path, 'No codec is registered for: ' + value.$codec)
      return undefined
    }
    const inner = decodeSnapshotJson(value.value, path + '.value', codecs, report, depth + 1)
    try {
      return codec.decode(inner as JsonValue, value.version ?? 1)
    } catch (error) {
      report.error('codec', path, 'Codec ' + value.$codec + ' failed to decode: ' + (error instanceof Error ? error.message : String(error)))
      return undefined
    }
  }
  const out: Rec = {}
  for (const key of Object.keys(value)) out[key] = decodeSnapshotJson(value[key], path ? path + '.' + key : key, codecs, report, depth + 1)
  return out
}

// ---- structural validation ----

function attempt(report: Report, code: SnapshotDiagnosticCode, path: string, work: () => void): boolean {
  try {
    work()
    return true
  } catch (error) {
    report.error(code, path, error instanceof Error ? error.message : String(error))
    return false
  }
}

function checkKeys(rec: Rec, allowed: readonly string[], path: string, report: Report) {
  for (const key of Object.keys(rec)) {
    if (!allowed.includes(key)) report.error('structure', path ? path + '.' + key : key, 'Unknown field')
  }
}

function field(rec: Rec, key: string, path: string) {
  return path ? path + '.' + key : key
}

function text(rec: Rec, key: string, path: string, report: Report, required: boolean, nonempty = false): string | undefined {
  const value = rec[key]
  if (value === undefined) {
    if (required) report.error('structure', field(rec, key, path), 'Required')
    return undefined
  }
  if (typeof value !== 'string' || (nonempty && !value)) {
    report.error('structure', field(rec, key, path), nonempty ? 'Must be a nonempty string' : 'Must be a string')
    return undefined
  }
  return value
}

function num(rec: Rec, key: string, path: string, report: Report, kind: 'finite' | 'positive' | 'nonnegative', required = false): number | undefined {
  const value = rec[key]
  if (value === undefined) {
    if (required) report.error('structure', field(rec, key, path), 'Required')
    return undefined
  }
  const ok = typeof value === 'number' && Number.isFinite(value)
    && (kind === 'finite' || (kind === 'positive' ? value > 0 : value >= 0))
  if (!ok) {
    report.error('structure', field(rec, key, path), 'Must be a finite number' + (kind === 'positive' ? ' greater than zero' : kind === 'nonnegative' ? ' not less than zero' : ''))
    return undefined
  }
  return value
}

function bool(rec: Rec, key: string, path: string, report: Report) {
  if (rec[key] !== undefined && typeof rec[key] !== 'boolean') report.error('structure', field(rec, key, path), 'Must be a boolean')
}

function list(rec: Rec, key: string, path: string, report: Report, required: boolean): unknown[] | undefined {
  const value = rec[key]
  if (value === undefined) {
    if (required) report.error('structure', field(rec, key, path), 'Required')
    return undefined
  }
  if (!Array.isArray(value)) {
    report.error('structure', field(rec, key, path), 'Must be an array')
    return undefined
  }
  return value
}

/** Items that are records with a nonempty string `id`. Reports the rest and returns only well-formed items. */
function records(items: unknown[] | undefined, path: string, report: Report, withId = true): Rec[] {
  const out: Rec[] = []
  items?.forEach((item, i) => {
    const at = path + '[' + i + ']'
    if (!isRecord(item)) report.error('structure', at, 'Must be an object')
    else if (withId && (typeof item.id !== 'string' || !item.id)) report.error('structure', at + '.id', 'Must be a nonempty string')
    else out.push(item)
  })
  return out
}

function checkRange(rec: unknown, path: string, report: Report, ordered: 'strict' | 'loose'): rec is { start: number; end: number } {
  if (!isRecord(rec)) {
    report.error('structure', path, 'Must be an object with start and end')
    return false
  }
  checkKeys(rec, ['start', 'end'], path, report)
  const start = num(rec, 'start', path, report, 'finite', true)
  const end = num(rec, 'end', path, report, 'finite', true)
  if (start !== undefined && end !== undefined && (ordered === 'strict' ? end <= start : end < start)) {
    report.error('structure', path, 'end must be after start')
    return false
  }
  return start !== undefined && end !== undefined
}

function idSet(items: readonly Rec[]) {
  return new Set(items.map(item => item.id as string))
}

/** Entries as `[id, value]` pairs: each ID must be unique and listed in `known`. */
function entries(rec: Rec, key: string, path: string, report: Report, known: ReadonlySet<string>, kind: string, check: (value: unknown, at: string) => void) {
  const items = list(rec, key, path, report, false)
  const seen = new Set<string>()
  items?.forEach((entry, i) => {
    const at = field(rec, key, path) + '[' + i + ']'
    if (!Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== 'string') {
      report.error('structure', at, 'Must be an [id, value] pair')
      return
    }
    const id = entry[0]
    if (seen.has(id)) report.error('duplicate', at, 'Duplicate ' + kind + ' entry for: ' + id)
    seen.add(id)
    if (!known.has(id)) report.error('reference', at, 'Unknown ' + kind + ' target: ' + id)
    check(entry[1], at + '[1]')
  })
}

function point(value: unknown, path: string, report: Report, nonnegative: boolean) {
  if (!isRecord(value)) return report.error('structure', path, 'Must be an object with x and y')
  checkKeys(value, ['x', 'y'], path, report)
  num(value, 'x', path, report, nonnegative ? 'nonnegative' : 'finite', true)
  num(value, 'y', path, report, nonnegative ? 'nonnegative' : 'finite', true)
}

function validateGraphData(data: Rec, path: string, report: Report) {
  checkKeys(data, ['nodes', 'edges', 'groups', 'positions', 'sizes'], path, report)
  const nodeList = list(data, 'nodes', path, report, true)
  const edgeList = list(data, 'edges', path, report, true)
  const groupList = list(data, 'groups', path, report, false)
  const nodes = records(nodeList, field(data, 'nodes', path), report)
  const edges = records(edgeList, field(data, 'edges', path), report)
  const groups = records(groupList, field(data, 'groups', path), report)
  nodes.forEach((node, i) => {
    const at = field(data, 'nodes', path) + '[' + i + ']'
    text(node, 'label', at, report, true)
    if (node.ports !== undefined && !Array.isArray(node.ports)) report.error('structure', at + '.ports', 'Must be an array')
    else (node.ports as unknown[] | undefined)?.forEach((port, p) => {
      if (!isRecord(port)) report.error('structure', at + '.ports[' + p + ']', 'Must be an object')
    })
  })
  edges.forEach((edge, i) => {
    const at = field(data, 'edges', path) + '[' + i + ']'
    for (const key of ['from', 'to'] as const) text(edge, key, at, report, true, true)
    for (const key of ['fromPort', 'toPort'] as const) text(edge, key, at, report, false)
    const points = list(edge, 'points', at, report, false)
    points?.forEach((p, k) => point(p, at + '.points[' + k + ']', report, false))
  })
  if (!report.failed) attempt(report, 'reference', field(data, 'nodes', path), () => void indexGraph(nodes as never, edges as never))

  const nodeIds = idSet(nodes)
  const groupIds = new Set<string>()
  for (const group of groups) {
    if (groupIds.has(group.id as string)) report.error('duplicate', field(data, 'groups', path), 'Duplicate group ID: ' + String(group.id))
    groupIds.add(group.id as string)
  }
  groups.forEach((group, i) => {
    const at = field(data, 'groups', path) + '[' + i + ']'
    text(group, 'label', at, report, true)
    const members = list(group, 'nodeIds', at, report, true)
    const seen = new Set<string>()
    members?.forEach((id, k) => {
      if (typeof id !== 'string') report.error('structure', at + '.nodeIds[' + k + ']', 'Must be a string')
      else if (!nodeIds.has(id)) report.error('reference', at + '.nodeIds[' + k + ']', 'Unknown node in group: ' + id)
      else if (seen.has(id)) report.error('duplicate', at + '.nodeIds[' + k + ']', 'Duplicate node in group: ' + id)
      else seen.add(id)
    })
    const parent = text(group, 'parentId', at, report, false, true)
    if (parent !== undefined && !groupIds.has(parent)) report.error('reference', at + '.parentId', 'Unknown parent group: ' + parent)
  })
  // A nested group chain may not return to itself. Walk each chain with a step bound instead of recursing.
  const parentOf = new Map(groups.map(group => [group.id as string, group.parentId as string | undefined]))
  for (const id of groupIds) {
    let cursor: string | undefined = id
    for (let steps = 0; cursor !== undefined && steps <= groupIds.size; steps++) {
      cursor = parentOf.get(cursor)
      if (cursor === id) {
        report.error('reference', field(data, 'groups', path), 'The group hierarchy contains a cycle at: ' + id)
        break
      }
    }
  }
  entries(data, 'positions', path, report, nodeIds, 'position', (value, at) => point(value, at, report, true))
  entries(data, 'sizes', path, report, nodeIds, 'size', (value, at) => {
    if (!isRecord(value)) return report.error('structure', at, 'Must be an object with width and height')
    checkKeys(value, ['width', 'height'], at, report)
    num(value, 'width', at, report, 'positive', true)
    num(value, 'height', at, report, 'positive', true)
  })
  return { groupIds }
}

function validateTimelineSnapshotData(data: Rec, path: string, report: Report) {
  checkKeys(data, ['rows', 'bars', 'dependencies', 'range', 'timeUnit'], path, report)
  const rowList = list(data, 'rows', path, report, true)
  const barList = list(data, 'bars', path, report, true)
  const depList = list(data, 'dependencies', path, report, false)
  const rows = records(rowList, field(data, 'rows', path), report)
  const bars = records(barList, field(data, 'bars', path), report)
  const deps = records(depList, field(data, 'dependencies', path), report)
  rows.forEach((row, i) => {
    text(row, 'label', field(data, 'rows', path) + '[' + i + ']', report, true)
    text(row, 'parentId', field(data, 'rows', path) + '[' + i + ']', report, false, true)
  })
  bars.forEach((bar, i) => {
    const at = field(data, 'bars', path) + '[' + i + ']'
    text(bar, 'label', at, report, true)
    text(bar, 'rowId', at, report, true, true)
    num(bar, 'start', at, report, 'finite', true)
    num(bar, 'end', at, report, 'finite', true)
  })
  deps.forEach((dep, i) => {
    const at = field(data, 'dependencies', path) + '[' + i + ']'
    text(dep, 'from', at, report, true, true)
    text(dep, 'to', at, report, true, true)
  })
  if (!report.failed) {
    const lanes = bars.map(bar => bar.lane ?? 0)
    const valid = lanes.every(lane => Number.isInteger(lane) && (lane as number) >= 0)
    const laneCount = valid ? Math.max(1, ...(lanes as number[]).map(lane => lane + 1)) : 1
    attempt(report, 'structure', path, () => validateTimelineData(rows as never, bars as never, deps as never, laneCount))
    attempt(report, 'reference', field(data, 'rows', path), () => void createTimelineRowTree(rows as never))
  }
  if (data.range !== undefined) checkRange(data.range, field(data, 'range', path), report, 'strict')
  const unit = data.timeUnit
  if (unit !== undefined) {
    const at = field(data, 'timeUnit', path)
    if (!isRecord(unit)) report.error('structure', at, 'Must be an object')
    else {
      checkKeys(unit, ['id', 'origin'], at, report)
      text(unit, 'id', at, report, true, true)
      num(unit, 'origin', at, report, 'finite')
    }
  }
  return { rowIds: idSet(rows) }
}

function validatePlanningData(data: Rec, path: string, report: Report) {
  checkKeys(data, [
    'range', 'quantum', 'calendars', 'defaultCalendarId', 'tasks', 'dependencies', 'deadline', 'resources', 'assignments',
    'placements', 'display',
  ], path, report)
  const range = data.range
  const rangeOk = checkRange(range, field(data, 'range', path), report, 'strict')
  const taskList = list(data, 'tasks', path, report, true)
  const resourceList = list(data, 'resources', path, report, true)
  const assignmentList = list(data, 'assignments', path, report, true)
  const tasks = records(taskList, field(data, 'tasks', path), report)
  const resources = records(resourceList, field(data, 'resources', path), report)
  const assignments = records(assignmentList, field(data, 'assignments', path), report, false)
  const calendars = list(data, 'calendars', path, report, false)
  const deps = list(data, 'dependencies', path, report, false)
  records(calendars, field(data, 'calendars', path), report)
  records(deps, field(data, 'dependencies', path), report)
  tasks.forEach((task, i) => {
    const at = field(data, 'tasks', path) + '[' + i + ']'
    num(task, 'priority', at, report, 'finite')
    bool(task, 'splittable', at, report)
    bool(task, 'inactive', at, report)
  })
  for (const key of ['quantum', 'deadline'] as const) num(data, key, path, report, 'finite')
  text(data, 'defaultCalendarId', path, report, false, true)
  if (!report.failed) {
    // Scheduling input rules (IDs, durations, quantum alignment, calendars, links) are those of scheduleTasks itself.
    attempt(report, 'structure', path, () => {
      const result = scheduleTasks(data as never)
      report.schedule = result
      if (!result.ok) {
        report.warn(result.code === 'cycle' ? 'schedule-cycle' : 'schedule-infeasible', path,
          result.code === 'cycle' ? 'The dependencies contain a cycle' : 'No feasible dates for task: ' + result.taskId)
      }
    })
  }
  const taskIds = idSet(tasks)
  const resourceIds = new Set<string>()
  resources.forEach((resource, i) => {
    const at = field(data, 'resources', path) + '[' + i + ']'
    if (resourceIds.has(resource.id as string)) report.error('duplicate', at, 'Duplicate resource ID: ' + String(resource.id))
    resourceIds.add(resource.id as string)
    const capacity = resource.capacity
    if (typeof capacity !== 'number' || !Number.isSafeInteger(capacity) || capacity < 0) {
      report.error('structure', at + '.capacity', 'Must be a nonnegative safe integer')
    }
    const periods = list(resource, 'periods', at, report, false)
    if (periods && rangeOk) attempt(report, 'structure', at + '.periods', () => void normalizeWorkPeriods(periods as never, range as never))
    if (resource.capacityPeriods !== undefined) {
      attempt(report, 'structure', at + '.capacityPeriods', () => void capacityPeriodsOf(resource as never))
    }
  })
  const pairs = new Set<string>()
  const pairKey = (taskId: string, resourceId: string) => JSON.stringify([taskId, resourceId])
  assignments.forEach((assignment, i) => {
    const at = field(data, 'assignments', path) + '[' + i + ']'
    const taskId = text(assignment, 'taskId', at, report, true, true)
    const resourceId = text(assignment, 'resourceId', at, report, true, true)
    const units = assignment.units
    if (units !== undefined && (typeof units !== 'number' || !Number.isSafeInteger(units) || units <= 0)) {
      report.error('structure', at + '.units', 'Must be a positive safe integer')
    }
    attempt(report, 'structure', at, () => void assignmentWorkRange(assignment as never))
    if (taskId === undefined || resourceId === undefined) return
    if (!taskIds.has(taskId)) report.error('reference', at + '.taskId', 'Unknown task in assignment: ' + taskId)
    if (!resourceIds.has(resourceId)) report.error('reference', at + '.resourceId', 'Unknown resource in assignment: ' + resourceId)
    const key = pairKey(taskId, resourceId)
    if (pairs.has(key)) report.error('duplicate', at, 'Duplicate assignment of task ' + taskId + ' to resource ' + resourceId)
    pairs.add(key)
  })
  const placed = new Set<string>()
  records(list(data, 'placements', path, report, false), field(data, 'placements', path), report, false).forEach((placement, i) => {
    const at = field(data, 'placements', path) + '[' + i + ']'
    checkKeys(placement, ['taskId', 'resourceId'], at, report)
    const taskId = text(placement, 'taskId', at, report, true, true)
    const resourceId = text(placement, 'resourceId', at, report, true, true)
    if (taskId === undefined || resourceId === undefined) return
    const key = pairKey(taskId, resourceId)
    if (!pairs.has(key)) report.error('reference', at, 'A placement needs an assignment of task ' + taskId + ' to resource ' + resourceId)
    if (placed.has(key)) report.error('duplicate', at, 'Duplicate placement of task ' + taskId + ' on resource ' + resourceId)
    placed.add(key)
  })
  const shown = new Set<string>()
  records(list(data, 'display', path, report, false), field(data, 'display', path), report, false).forEach((item, i) => {
    const at = field(data, 'display', path) + '[' + i + ']'
    const taskId = text(item, 'taskId', at, report, true, true)
    text(item, 'label', at, report, false)
    if (taskId === undefined) return
    if (!taskIds.has(taskId)) report.error('reference', at + '.taskId', 'Unknown task in display attributes: ' + taskId)
    if (shown.has(taskId)) report.error('duplicate', at, 'Duplicate display attributes for task: ' + taskId)
    shown.add(taskId)
  })
}

function validateGraphView(view: Rec, path: string, report: Report, groupIds: ReadonlySet<string>) {
  checkKeys(view, ['camera', 'collapsedGroupIds', 'layout'], path, report)
  const camera = view.camera
  if (camera !== undefined) {
    const at = field(view, 'camera', path)
    if (!isRecord(camera)) report.error('structure', at, 'Must be an object')
    else {
      checkKeys(camera, ['center', 'scale'], at, report)
      if (camera.center === undefined) report.error('structure', at + '.center', 'Required')
      else point(camera.center, at + '.center', report, false)
      num(camera, 'scale', at, report, 'positive', true)
    }
  }
  uniqueIds(view, 'collapsedGroupIds', path, report, groupIds, 'group')
  const layout = view.layout
  if (layout !== undefined) {
    const at = field(view, 'layout', path)
    if (!isRecord(layout)) report.error('structure', at, 'Must be an object')
    else {
      checkKeys(layout, ['id', 'options'], at, report)
      text(layout, 'id', at, report, true, true)
      if (layout.options !== undefined && !isRecord(layout.options)) report.error('structure', at + '.options', 'Must be an object')
    }
  }
}

function uniqueIds(rec: Rec, key: string, path: string, report: Report, known: ReadonlySet<string> | undefined, kind: string) {
  const ids = list(rec, key, path, report, false)
  const seen = new Set<string>()
  ids?.forEach((id, i) => {
    const at = field(rec, key, path) + '[' + i + ']'
    if (typeof id !== 'string' || !id) report.error('structure', at, 'Must be a nonempty string')
    else if (seen.has(id)) report.error('duplicate', at, 'Duplicate ' + kind + ' ID: ' + id)
    else if (known && !known.has(id)) report.error('reference', at, 'Unknown ' + kind + ' ID: ' + id)
    if (typeof id === 'string') seen.add(id)
  })
}

function validateTimelineView(view: Rec, path: string, report: Report, rowIds: ReadonlySet<string> | undefined) {
  checkKeys(view, ['window', 'scroll', 'zoom', 'columns', 'search', 'sort', 'collapsedRowIds'], path, report)
  if (view.window !== undefined) checkRange(view.window, field(view, 'window', path), report, 'strict')
  const scroll = view.scroll
  if (scroll !== undefined) {
    const at = field(view, 'scroll', path)
    if (!isRecord(scroll)) report.error('structure', at, 'Must be an object')
    else {
      checkKeys(scroll, ['time', 'rowId'], at, report)
      num(scroll, 'time', at, report, 'finite')
      const rowId = text(scroll, 'rowId', at, report, false, true)
      if (rowId !== undefined && rowIds && !rowIds.has(rowId)) report.error('reference', at + '.rowId', 'Unknown row: ' + rowId)
    }
  }
  const zoom = view.zoom
  if (zoom !== undefined) {
    const at = field(view, 'zoom', path)
    if (!isRecord(zoom)) report.error('structure', at, 'Must be an object')
    else {
      checkKeys(zoom, ['zoom', 'preset'], at, report)
      num(zoom, 'zoom', at, report, 'positive', true)
      text(zoom, 'preset', at, report, false, true)
    }
  }
  const columnIds = new Set<string>([timelineLabelColumnId])
  const seenColumns = new Set<string>()
  const columns = records(list(view, 'columns', path, report, false), field(view, 'columns', path), report)
  columns.forEach((column, i) => {
    const at = field(view, 'columns', path) + '[' + i + ']'
    checkKeys(column, ['id', 'registryId', 'visible', 'width', 'editorId', 'rendererId'], at, report)
    if (seenColumns.has(column.id as string)) report.error('duplicate', at + '.id', 'Duplicate column ID: ' + String(column.id))
    seenColumns.add(column.id as string)
    columnIds.add(column.id as string)
    for (const key of ['registryId', 'editorId', 'rendererId']) text(column, key, at, report, false, true)
    bool(column, 'visible', at, report)
    num(column, 'width', at, report, 'positive')
  })
  const search = view.search
  if (search !== undefined) {
    const at = field(view, 'search', path)
    if (!isRecord(search)) report.error('structure', at, 'Must be an object')
    else {
      checkKeys(search, ['query', 'columnIds'], at, report)
      text(search, 'query', at, report, true)
      uniqueIds(search, 'columnIds', at, report, columnIds, 'column')
    }
  }
  const sort = list(view, 'sort', path, report, false)
  const sortedColumns = new Set<string>()
  records(sort, field(view, 'sort', path), report, false).forEach((rule, i) => {
    const at = field(view, 'sort', path) + '[' + i + ']'
    checkKeys(rule, ['columnId', 'direction', 'comparatorId'], at, report)
    const id = text(rule, 'columnId', at, report, true, true)
    if (id !== undefined) {
      if (!columnIds.has(id)) report.error('reference', at + '.columnId', 'Unknown column ID: ' + id)
      if (sortedColumns.has(id)) report.error('duplicate', at + '.columnId', 'Duplicate sort column: ' + id)
      sortedColumns.add(id)
    }
    if (rule.direction !== 'asc' && rule.direction !== 'desc') report.error('structure', at + '.direction', 'Must be asc or desc')
    text(rule, 'comparatorId', at, report, false, true)
  })
  uniqueIds(view, 'collapsedRowIds', path, report, rowIds, 'row')
}

const topKeys = ['schemaVersion', 'kind', 'libraryVersion', 'metadata', 'data', 'view', 'extensions']

/**
 * Validate a version-1 document: required fields and types, numeric ranges, duplicate IDs, references, scheduling input
 * and view references. Registry names are not checked here. Findings are added to `report`.
 */
export function validateSnapshotDocument(doc: unknown, report: Report): void {
  if (!isRecord(doc)) return report.error('structure', '', 'A snapshot must be an object')
  checkKeys(doc, topKeys, '', report)
  if (doc.schemaVersion !== 1) report.error('version', 'schemaVersion', 'Unsupported schema version: ' + String(doc.schemaVersion))
  const kind = doc.kind
  if (kind !== 'graph' && kind !== 'timeline' && kind !== 'planning') report.error('structure', 'kind', 'Must be graph, timeline or planning')
  text(doc, 'libraryVersion', '', report, false)
  const metadata = doc.metadata
  if (metadata !== undefined) {
    if (!isRecord(metadata)) report.error('structure', 'metadata', 'Must be an object')
    else {
      checkKeys(metadata, ['title', 'savedAt', 'sourceVersion'], 'metadata', report)
      text(metadata, 'title', 'metadata', report, false)
      text(metadata, 'sourceVersion', 'metadata', report, false)
      const savedAt = text(metadata, 'savedAt', 'metadata', report, false)
      if (savedAt !== undefined && Number.isNaN(Date.parse(savedAt))) report.error('structure', 'metadata.savedAt', 'Must be a date and time string')
    }
  }
  if (doc.extensions !== undefined) {
    if (!isRecord(doc.extensions)) report.error('structure', 'extensions', 'Must be an object')
    else for (const key of Object.keys(doc.extensions)) if (!key) report.error('structure', 'extensions', 'Extension names must not be empty')
  }
  if (!isRecord(doc.data)) return report.error('structure', 'data', 'Required object')
  let groupIds: ReadonlySet<string> | undefined
  let rowIds: ReadonlySet<string> | undefined
  if (kind === 'graph') groupIds = validateGraphData(doc.data, 'data', report).groupIds
  else if (kind === 'timeline') rowIds = validateTimelineSnapshotData(doc.data, 'data', report).rowIds
  else if (kind === 'planning') validatePlanningData(doc.data, 'data', report)
  const view = doc.view
  if (view === undefined) return
  if (!isRecord(view)) return report.error('structure', 'view', 'Must be an object')
  checkKeys(view, kind === 'graph' ? ['graph'] : ['timeline'], 'view', report)
  if (view.graph !== undefined) {
    if (!isRecord(view.graph)) report.error('structure', 'view.graph', 'Must be an object')
    else validateGraphView(view.graph, 'view.graph', report, groupIds ?? new Set())
  }
  if (view.timeline !== undefined) {
    if (!isRecord(view.timeline)) report.error('structure', 'view.timeline', 'Must be an object')
    else validateTimelineView(view.timeline, 'view.timeline', report, rowIds)
  }
}
