import type { GraphEdge, GraphNodeSize, GraphPoint } from './graph.js'
import type { LevelResourcesInput } from './leveling.js'
import type { ScheduleResult } from './scheduling.js'
import type { TimeRange } from './timeline.js'
import {
  checkSnapshotJson, codecIndex, decodeSnapshotJson, encodeSnapshotJson, isRecord, Report, validateSnapshotDocument,
} from './snapshotValidation.js'
import type {
  ChartTone, GraphLayoutFunction, NetworkGroup, NetworkNode, TimelineBar, TimelineColumn, TimelineDependency, TimelineRow,
} from './types.js'

/** A value that survives `JSON.stringify` and `JSON.parse` unchanged. */
export type JsonValue =
  | null | boolean | number | string
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue }

export type SnapshotKind = 'graph' | 'timeline' | 'planning'

export type SnapshotDiagnosticSeverity = 'error' | 'warning'

/**
 * `syntax`: not JSON. `version`: unsupported or unmigratable schema version. `structure`: a missing, mistyped,
 * out-of-range or unknown field. `reference`: an ID that names nothing. `duplicate`: an ID, Map entry or assignment pair
 * listed twice. `number`: NaN or Infinity. `json`: a value that is not JSON and has no codec. `codec` and `registry`:
 * a codec or registered name that is not available. `migration`: a migration failed. The `schedule-*` codes are
 * warnings about a plan that is valid input but cannot be scheduled.
 */
export type SnapshotDiagnosticCode =
  | 'syntax' | 'version' | 'migration' | 'structure' | 'reference' | 'duplicate' | 'number' | 'json' | 'codec' | 'registry'
  | 'schedule-cycle' | 'schedule-infeasible'

export interface SnapshotDiagnostic {
  severity: SnapshotDiagnosticSeverity
  code: SnapshotDiagnosticCode
  /** Where the finding is, for example `data.positions[2]`. Empty for the whole document. */
  path: string
  message: string
}

/**
 * Stores values that JSON cannot represent (Date, BigInt, Map...) in application data. The stored form is
 * `{ "$codec": id, "version": n, "value": ... }`. Serializing needs `matches` and `encode`; restoring needs `decode`.
 */
export interface SnapshotCodec<T = any> {
  id: string
  /** Version written with each value, passed to `decode` on restore. Defaults to 1. */
  version?: number
  matches?: (value: unknown) => boolean
  encode?: (value: T) => JsonValue
  decode?: (value: JsonValue, version: number) => T
}

export interface SnapshotMetadata {
  title?: string
  /** ISO 8601 date and time. Pass it yourself; nothing reads the clock, so a fixed value gives reproducible output. */
  savedAt?: string
  /** A reference to the source the snapshot was taken from. It is not the current version of any server. */
  sourceVersion?: string
}

// ---- stored form (JSON) ----

export interface GraphSnapshotData {
  nodes: readonly NetworkNode[]
  edges: readonly GraphEdge[]
  groups?: readonly NetworkGroup[]
  /** Saved node positions as `[nodeId, point]` entries. */
  positions?: readonly (readonly [string, GraphPoint])[]
  /** Saved node sizes as `[nodeId, size]` entries. */
  sizes?: readonly (readonly [string, GraphNodeSize])[]
}

export interface TimelineSnapshotData {
  rows: readonly TimelineRow[]
  bars: readonly TimelineBar[]
  dependencies?: readonly TimelineDependency[]
  range?: TimeRange
  /** Omitted means epoch milliseconds. Otherwise the ID of the unit and the time of its zero. */
  timeUnit?: { id: string; origin?: number }
}

/** A task shown on a resource row. Each placement needs the assignment of the same task and resource. */
export interface PlanningPlacement {
  taskId: string
  resourceId: string
}

/** Display name, kind and application data of a task, kept by task ID. */
export interface PlanningTaskDisplay {
  taskId: string
  label?: string
  detail?: string
  tone?: ChartTone
  data?: unknown
}

/** The input of `levelResources`, plus the placement state and display attributes of the tasks. */
export interface PlanningSnapshotData extends LevelResourcesInput {
  placements?: readonly PlanningPlacement[]
  display?: readonly PlanningTaskDisplay[]
}

/** A graph camera that does not depend on the container size: the graph point at the viewport center and the scale. */
export interface GraphCameraTarget {
  center: GraphPoint
  scale: number
}

export interface GraphSnapshotView {
  camera?: GraphCameraTarget
  collapsedGroupIds?: readonly string[]
  /** A registered layout and its declarative options. */
  layout?: { id: string; options?: { readonly [key: string]: JsonValue } }
}

export interface SnapshotColumnState {
  /** The column ID; `'$label'` is the row label column. */
  id: string
  /** The registry name that supplies the column's functions. Defaults to `id`. */
  registryId?: string
  /** Defaults to true. */
  visible?: boolean
  width?: number
  editorId?: string
  rendererId?: string
}

export interface SnapshotSortRule {
  columnId: string
  direction: 'asc' | 'desc'
  /** A registered comparator. Omitted means the default comparison. */
  comparatorId?: string
}

export interface TimelineSnapshotView {
  window?: TimeRange
  scroll?: { time?: number; rowId?: string }
  zoom?: { zoom: number; preset?: string }
  /** Columns in display order. */
  columns?: readonly SnapshotColumnState[]
  search?: { query: string; columnIds?: readonly string[] }
  sort?: readonly SnapshotSortRule[]
  collapsedRowIds?: readonly string[]
}

interface SnapshotBase {
  schemaVersion: 1
  libraryVersion?: string
  metadata?: SnapshotMetadata
  extensions?: { readonly [namespace: string]: JsonValue }
}

export interface GraphSnapshotV1 extends SnapshotBase {
  kind: 'graph'
  data: GraphSnapshotData
  view?: { graph?: GraphSnapshotView }
}

export interface TimelineSnapshotV1 extends SnapshotBase {
  kind: 'timeline'
  data: TimelineSnapshotData
  view?: { timeline?: TimelineSnapshotView }
}

export interface PlanningSnapshotV1 extends SnapshotBase {
  kind: 'planning'
  data: PlanningSnapshotData
  view?: { timeline?: TimelineSnapshotView }
}

/** The stored form of a snapshot, as written by `serializeWeaveSnapshot` and returned by `parseWeaveSnapshot`. */
export type WeaveSnapshotV1 = GraphSnapshotV1 | TimelineSnapshotV1 | PlanningSnapshotV1

// ---- in-memory input of serialize ----

export interface GraphSnapshotInput {
  kind: 'graph'
  data: Omit<GraphSnapshotData, 'positions' | 'sizes'> & {
    positions?: ReadonlyMap<string, GraphPoint>
    sizes?: ReadonlyMap<string, GraphNodeSize>
  }
  view?: { graph?: Omit<GraphSnapshotView, 'collapsedGroupIds'> & { collapsedGroupIds?: ReadonlySet<string> } }
  metadata?: SnapshotMetadata
  extensions?: { readonly [namespace: string]: unknown }
}

export interface TimelineSnapshotInput {
  kind: 'timeline'
  data: TimelineSnapshotData
  view?: { timeline?: Omit<TimelineSnapshotView, 'collapsedRowIds'> & { collapsedRowIds?: ReadonlySet<string> } }
  metadata?: SnapshotMetadata
  extensions?: { readonly [namespace: string]: unknown }
}

export interface PlanningSnapshotInput {
  kind: 'planning'
  data: PlanningSnapshotData
  view?: { timeline?: Omit<TimelineSnapshotView, 'collapsedRowIds'> & { collapsedRowIds?: ReadonlySet<string> } }
  metadata?: SnapshotMetadata
  extensions?: { readonly [namespace: string]: unknown }
}

/** What `serializeWeaveSnapshot` takes: Maps and Sets where the stored form has entries and arrays. */
export type WeaveSnapshotInput = GraphSnapshotInput | TimelineSnapshotInput | PlanningSnapshotInput

/** Thrown by `serializeWeaveSnapshot` for input that cannot be stored. */
export class WeaveSnapshotError extends Error {
  readonly diagnostics: readonly SnapshotDiagnostic[]
  constructor(diagnostics: readonly SnapshotDiagnostic[]) {
    const first = diagnostics.find(item => item.severity === 'error') ?? diagnostics[0]
    super('Invalid snapshot' + (first ? ': ' + (first.path ? first.path + ': ' : '') + first.message : ''))
    this.name = 'WeaveSnapshotError'
    this.diagnostics = diagnostics
  }
}

const currentVersion = 1

function ordered(source: { [key: string]: unknown }, order: readonly string[]) {
  const out: { [key: string]: unknown } = {}
  for (const key of order) if (source[key] !== undefined) out[key] = source[key]
  // `Object.hasOwn`, not `in`: a key named like an inherited member (`constructor`, `toString`) must not be dropped.
  for (const key of Object.keys(source)) if (!Object.hasOwn(out, key)) out[key] = source[key]
  return out
}

function sortedIds(set: ReadonlySet<string>) {
  return [...set].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
}

export interface SerializeWeaveSnapshotOptions {
  /** Codecs for application data that is not JSON. */
  codecs?: readonly SnapshotCodec[]
  /** Recorded as `libraryVersion`. The core does not know the package version, so the caller supplies it. */
  libraryVersion?: string
  /** Indentation of the JSON text, as in `JSON.stringify`. Defaults to compact output. */
  space?: number | string
}

/**
 * Convert `input` to the stored form, validate it and return the JSON text. Output is deterministic: key order is fixed
 * for the document and kept for your own records, Sets are written sorted, and nothing reads the clock (set
 * `metadata.savedAt` yourself). Throws `WeaveSnapshotError` for NaN or Infinity, functions and other non-JSON values
 * without a codec, duplicate IDs, unknown references and every other violation `parseWeaveSnapshot` reports; nothing is
 * silently dropped. Does not mutate `input`.
 */
export function serializeWeaveSnapshot(input: WeaveSnapshotInput, options: SerializeWeaveSnapshotOptions = {}): string {
  const codecs = codecIndex(options.codecs)
  const report = new Report()
  const encode = (value: unknown, path: string) => encodeSnapshotJson(value, path, codecs, report)
  const kind = input?.kind
  if (kind !== 'graph' && kind !== 'timeline' && kind !== 'planning') throw new RangeError('Snapshot kind must be graph, timeline or planning')
  if (!isRecord(input.data)) throw new TypeError('Snapshot data must be an object')

  const data = { ...input.data } as { [key: string]: unknown }
  if (kind === 'graph') {
    for (const key of ['positions', 'sizes'] as const) {
      const map = data[key]
      if (map === undefined) continue
      if (!(map instanceof Map)) {
        report.error('structure', 'data.' + key, 'Must be a Map')
        delete data[key]
      } else data[key] = [...map.entries()]
    }
  }
  const order = {
    graph: ['nodes', 'edges', 'groups', 'positions', 'sizes'],
    timeline: ['rows', 'bars', 'dependencies', 'range', 'timeUnit'],
    planning: ['range', 'quantum', 'calendars', 'defaultCalendarId', 'tasks', 'dependencies', 'deadline', 'resources', 'assignments', 'placements', 'display'],
  }[kind]

  const doc: { [key: string]: unknown } = { schemaVersion: currentVersion, kind }
  if (options.libraryVersion !== undefined) doc.libraryVersion = options.libraryVersion
  if (input.metadata !== undefined) doc.metadata = ordered(encode(input.metadata, 'metadata') as never ?? {}, ['title', 'savedAt', 'sourceVersion'])
  doc.data = ordered(encode(data, 'data') as never ?? {}, order)

  const rawView = input.view as { [key: string]: { [key: string]: unknown } | undefined } | undefined
  if (rawView !== undefined) {
    if (!isRecord(rawView)) report.error('structure', 'view', 'Must be an object')
    else {
      const view: { [key: string]: unknown } = {}
      for (const name of Object.keys(rawView)) {
        const source = rawView[name]
        if (source === undefined) continue
        if (!isRecord(source)) {
          report.error('structure', 'view.' + name, 'Must be an object')
          continue
        }
        const copy = { ...source }
        const sets = name === 'graph' ? 'collapsedGroupIds' : 'collapsedRowIds'
        if (copy[sets] !== undefined) {
          if (copy[sets] instanceof Set) copy[sets] = sortedIds(copy[sets] as Set<string>)
          else report.error('structure', 'view.' + name + '.' + sets, 'Must be a Set')
        }
        view[name] = ordered(encode(copy, 'view.' + name) as never ?? {}, name === 'graph'
          ? ['camera', 'collapsedGroupIds', 'layout']
          : ['window', 'scroll', 'zoom', 'columns', 'search', 'sort', 'collapsedRowIds'])
      }
      doc.view = view
    }
  }
  if (input.extensions !== undefined) doc.extensions = encode(input.extensions, 'extensions')

  if (!report.failed) validateSnapshotDocument(doc, report)
  if (report.failed) throw new WeaveSnapshotError(report.diagnostics)
  return JSON.stringify(doc, null, options.space)
}

/**
 * Upgrades a document of an older schema version to the next one. It receives the parsed JSON and returns the migrated
 * document, whose `schemaVersion` must be higher.
 */
export type SnapshotMigration = (document: { readonly [key: string]: JsonValue }) => unknown

export interface ParseWeaveSnapshotOptions {
  /**
   * Migrations by the schema version they start from. The parser applies them one after another until the document
   * reaches the current version (1). There is no global registry; pass what your application needs. Without a migration
   * for a document's version, parsing fails.
   */
  migrations?: Readonly<Record<number, SnapshotMigration>>
}

export type ParseWeaveSnapshotResult =
  | { ok: true; snapshot: WeaveSnapshotV1; diagnostics: readonly SnapshotDiagnostic[] }
  | { ok: false; diagnostics: readonly SnapshotDiagnostic[] }

function failure(report: Report): { ok: false; diagnostics: readonly SnapshotDiagnostic[] } {
  return { ok: false, diagnostics: report.diagnostics }
}

/**
 * Check JSON text and return a typed snapshot. Checks, in order: JSON syntax, schema version (applying the supplied
 * migrations), field types and ranges, duplicate IDs, references, scheduling input of planning data, and references of
 * the saved view. Codec values stay encoded and registry names stay unresolved; `restoreWeaveSnapshot` does both. A
 * snapshot is returned only when there is no error; warnings (for example a dependency cycle in a plan) come with it.
 * Never throws for bad input. Repeated JSON keys are read as the last one, as `JSON.parse` does.
 */
export function parseWeaveSnapshot(text: string, options: ParseWeaveSnapshotOptions = {}): ParseWeaveSnapshotResult {
  const report = new Report()
  if (typeof text !== 'string') {
    report.error('syntax', '', 'The snapshot must be a string')
    return failure(report)
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text)
  } catch (error) {
    report.error('syntax', '', 'Not valid JSON: ' + (error instanceof Error ? error.message : String(error)))
    return failure(report)
  }
  if (!isRecord(parsed)) {
    report.error('structure', '', 'A snapshot must be an object')
    return failure(report)
  }
  let doc: { [key: string]: unknown } = parsed
  for (let steps = 0; ; steps++) {
    const version = doc.schemaVersion
    if (typeof version !== 'number' || !Number.isSafeInteger(version) || version < 0) {
      report.error('version', 'schemaVersion', 'schemaVersion must be a nonnegative integer')
      return failure(report)
    }
    if (version === currentVersion) break
    if (version > currentVersion) {
      report.error('version', 'schemaVersion', 'Snapshot version ' + version + ' is newer than the supported version ' + currentVersion)
      return failure(report)
    }
    const migrate = options.migrations && Object.hasOwn(options.migrations, version) ? options.migrations[version] : undefined
    if (!migrate || steps >= 64) {
      report.error('version', 'schemaVersion', 'No migration from snapshot version ' + version)
      return failure(report)
    }
    let next: unknown
    try {
      next = migrate(doc as { [key: string]: JsonValue })
    } catch (error) {
      report.error('migration', 'schemaVersion', 'Migration from version ' + version + ' failed: ' + (error instanceof Error ? error.message : String(error)))
      return failure(report)
    }
    const nextVersion = isRecord(next) ? next.schemaVersion : undefined
    if (!isRecord(next) || typeof nextVersion !== 'number' || !Number.isSafeInteger(nextVersion) || nextVersion <= version) {
      report.error('migration', 'schemaVersion', 'Migration from version ' + version + ' must return a document with a higher schemaVersion')
      return failure(report)
    }
    doc = next
  }
  checkSnapshotJson(doc, '', report)
  if (!report.failed) validateSnapshotDocument(doc, report)
  if (report.failed) return failure(report)
  return { ok: true, snapshot: doc as unknown as WeaveSnapshotV1, diagnostics: report.diagnostics }
}

// ---- restore ----

export type SnapshotLayoutFactory = (options: { readonly [key: string]: JsonValue } | undefined) => GraphLayoutFunction

/** What a registered column supplies. `width` is the default when the snapshot has none. */
export type SnapshotColumnDefinition = Omit<TimelineColumn, 'id' | 'width'> & { width?: number }

/** Application-side names that a snapshot refers to. Functions are never stored in JSON. */
export interface WeaveSnapshotRegistry {
  codecs?: readonly SnapshotCodec[]
  layouts?: Readonly<Record<string, SnapshotLayoutFactory>>
  /** Column functions by column ID (or `registryId`). Columns not named by the snapshot are appended, visible. */
  columns?: Readonly<Record<string, SnapshotColumnDefinition>>
  editors?: Readonly<Record<string, unknown>>
  renderers?: Readonly<Record<string, unknown>>
  comparators?: Readonly<Record<string, (a: unknown, b: unknown) => number>>
  /**
   * What to do when a layout, column, editor, renderer or comparator name is not registered. `'fail'` (the default)
   * fails the restore. `'fallback'` keeps a warning and drops the item, so the default display is used. A missing codec
   * always fails.
   */
  onMissing?: 'fail' | 'fallback'
}

export interface RestoredColumn {
  id: string
  visible: boolean
  width: number
  /** Absent for the label column. */
  column?: TimelineColumn
  editor?: unknown
  renderer?: unknown
}

export interface RestoredSortRule {
  columnId: string
  direction: 'asc' | 'desc'
  comparator?: (a: unknown, b: unknown) => number
}

export interface RestoredGraphView {
  camera?: GraphCameraTarget
  collapsedGroupIds: Set<string>
  layout?: { id: string; options?: { readonly [key: string]: JsonValue }; fn: GraphLayoutFunction }
}

export interface RestoredTimelineView {
  window?: TimeRange
  scroll?: { time?: number; rowId?: string }
  zoom?: { zoom: number; preset?: string }
  /** Present when the snapshot recorded columns. */
  columns?: RestoredColumn[]
  search?: { query: string; columnIds?: string[] }
  sort: RestoredSortRule[]
  collapsedRowIds: Set<string>
}

interface RestoredBase {
  metadata?: SnapshotMetadata
  libraryVersion?: string
  extensions?: { [namespace: string]: unknown }
}

export interface RestoredGraphSnapshot extends RestoredBase {
  kind: 'graph'
  nodes: NetworkNode[]
  edges: GraphEdge[]
  groups: NetworkGroup[]
  positions: Map<string, GraphPoint>
  sizes: Map<string, GraphNodeSize>
  view?: RestoredGraphView
}

export interface RestoredTimelineSnapshot extends RestoredBase {
  kind: 'timeline'
  rows: TimelineRow[]
  bars: TimelineBar[]
  dependencies: TimelineDependency[]
  range?: TimeRange
  timeUnit?: { id: string; origin?: number }
  view?: RestoredTimelineView
}

export interface RestoredPlanningSnapshot extends RestoredBase {
  kind: 'planning'
  /** Pass it to `scheduleTasks`, `levelResources` and `calculateResourceLoad`. */
  input: LevelResourcesInput
  placements: PlanningPlacement[]
  display: PlanningTaskDisplay[]
  /** `scheduleTasks(input)`, computed during the restore. A cycle or infeasible plan is a result, not a failure. */
  schedule: ScheduleResult
  view?: RestoredTimelineView
}

export type RestoredWeaveSnapshot = RestoredGraphSnapshot | RestoredTimelineSnapshot | RestoredPlanningSnapshot

export type RestoreWeaveSnapshotResult =
  | { ok: true; snapshot: RestoredWeaveSnapshot; diagnostics: readonly SnapshotDiagnostic[] }
  | { ok: false; diagnostics: readonly SnapshotDiagnostic[] }

function plain<T>(value: unknown): T {
  return value as T
}

function lookup<T>(table: Readonly<Record<string, T>> | undefined, id: string): T | undefined {
  return table && Object.hasOwn(table, id) ? table[id] : undefined
}

function restoreTimelineView(view: TimelineSnapshotView, registry: WeaveSnapshotRegistry, report: Report): RestoredTimelineView {
  const fallback = registry.onMissing === 'fallback'
  const missing = (path: string, what: string, id: string) => {
    if (fallback) report.warn('registry', path, 'No ' + what + ' is registered for ' + id + '; using the default')
    else report.error('registry', path, 'No ' + what + ' is registered for: ' + id)
  }
  const out: RestoredTimelineView = { sort: [], collapsedRowIds: new Set(view.collapsedRowIds ?? []) }
  if (view.window) out.window = { ...view.window }
  if (view.scroll) out.scroll = { ...view.scroll }
  if (view.zoom) out.zoom = { ...view.zoom }
  if (view.search) out.search = { query: view.search.query, ...(view.search.columnIds ? { columnIds: [...view.search.columnIds] } : {}) }
  const used = new Set<string>()
  if (view.columns) {
    const columns: RestoredColumn[] = []
    view.columns.forEach((state, i) => {
      const at = 'view.timeline.columns[' + i + ']'
      const restored: RestoredColumn = { id: state.id, visible: state.visible ?? true, width: state.width ?? 0 }
      if (state.id !== '$label') {
        const registryId = state.registryId ?? state.id
        used.add(registryId)
        const definition = lookup(registry.columns, registryId)
        if (!definition) return missing(at, 'column', registryId)
        restored.width = state.width ?? definition.width ?? 120
        const { width: _width, ...rest } = definition
        restored.column = { ...rest, id: state.id, width: restored.width }
      }
      for (const [key, table, what] of [['editorId', registry.editors, 'editor'], ['rendererId', registry.renderers, 'renderer']] as const) {
        const id = state[key]
        if (id === undefined) continue
        if (!table || !Object.hasOwn(table, id)) missing(at + '.' + key, what, id)
        else restored[what === 'editor' ? 'editor' : 'renderer'] = table[id]
      }
      columns.push(restored)
    })
    for (const [id, definition] of Object.entries(registry.columns ?? {})) {
      if (used.has(id)) continue
      const { width: _width, ...rest } = definition
      const width = definition.width ?? 120
      columns.push({ id, visible: true, width, column: { ...rest, id, width } })
    }
    out.columns = columns
  }
  view.sort?.forEach((rule, i) => {
    const restored: RestoredSortRule = { columnId: rule.columnId, direction: rule.direction }
    if (rule.comparatorId !== undefined) {
      const comparator = lookup(registry.comparators, rule.comparatorId)
      if (!comparator) missing('view.timeline.sort[' + i + '].comparatorId', 'comparator', rule.comparatorId)
      else restored.comparator = comparator
    }
    out.sort.push(restored)
  })
  return out
}

/**
 * Turn a snapshot into live values: Maps and Sets, codec values decoded, registered layouts and column functions
 * resolved. The snapshot is validated again, so a hand-built object is checked like parsed text. The result is
 * all-or-nothing: on any error (an unknown codec, a missing required registration, an invalid reference) `ok` is false
 * and no partial value is returned, so the current screen can stay as it is. Warnings come with a successful result.
 * Does not mutate `snapshot` or `registry`.
 *
 * Apply a graph in this order: accept `nodes`, `edges`, `groups`, `positions`, `sizes` and `view.collapsedGroupIds`,
 * wait for the DOM update (`nextTick`), then set the camera from `view.camera`.
 */
export function restoreWeaveSnapshot(snapshot: WeaveSnapshotV1, registry: WeaveSnapshotRegistry = {}): RestoreWeaveSnapshotResult {
  const report = new Report()
  const codecs = codecIndex(registry.codecs)
  checkSnapshotJson(snapshot, '', report)
  if (!report.failed) validateSnapshotDocument(snapshot, report)
  if (report.failed) return failure(report)

  const data = plain<{ [key: string]: any }>(decodeSnapshotJson(snapshot.data, 'data', codecs, report))
  const base: RestoredBase = {}
  if (snapshot.libraryVersion !== undefined) base.libraryVersion = snapshot.libraryVersion
  if (snapshot.metadata) base.metadata = { ...snapshot.metadata }
  if (snapshot.extensions) base.extensions = plain(decodeSnapshotJson(snapshot.extensions, 'extensions', codecs, report))
  if (report.failed) return failure(report)

  let result: RestoredWeaveSnapshot
  if (snapshot.kind === 'graph') {
    const view = snapshot.view?.graph
    const restored: RestoredGraphSnapshot = {
      ...base, kind: 'graph', nodes: data.nodes, edges: data.edges, groups: data.groups ?? [],
      positions: new Map(data.positions ?? []), sizes: new Map(data.sizes ?? []),
    }
    if (view) {
      const out: RestoredGraphView = { collapsedGroupIds: new Set(view.collapsedGroupIds ?? []) }
      if (view.camera) out.camera = { center: { ...view.camera.center }, scale: view.camera.scale }
      if (view.layout) {
        const factory = lookup(registry.layouts, view.layout.id)
        if (!factory) {
          const message = 'No layout is registered for: ' + view.layout.id
          if (registry.onMissing === 'fallback') report.warn('registry', 'view.graph.layout', message + '; using the default')
          else report.error('registry', 'view.graph.layout', message)
        } else {
          const options = view.layout.options ? plain<{ [key: string]: JsonValue }>(decodeSnapshotJson(view.layout.options, 'view.graph.layout.options', codecs, report)) : undefined
          out.layout = { id: view.layout.id, ...(options ? { options } : {}), fn: factory(options) }
        }
      }
      restored.view = out
    }
    result = restored
  } else if (snapshot.kind === 'timeline') {
    result = {
      ...base, kind: 'timeline', rows: data.rows, bars: data.bars, dependencies: data.dependencies ?? [],
      ...(data.range ? { range: data.range } : {}), ...(data.timeUnit ? { timeUnit: data.timeUnit } : {}),
      ...(snapshot.view?.timeline ? { view: restoreTimelineView(snapshot.view.timeline, registry, report) } : {}),
    }
  } else {
    const { placements, display, ...input } = data
    result = {
      ...base, kind: 'planning', input: input as LevelResourcesInput, placements: placements ?? [], display: display ?? [],
      schedule: report.schedule!,
      ...(snapshot.view?.timeline ? { view: restoreTimelineView(snapshot.view.timeline, registry, report) } : {}),
    }
  }
  if (report.failed) return failure(report)
  return { ok: true, snapshot: result, diagnostics: report.diagnostics }
}
