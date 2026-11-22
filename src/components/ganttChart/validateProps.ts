// Validation of the GanttChart props. The checks run in a fixed order, so the first problem found is the one reported
// through `validation-error`. They derive the row tree and the load histogram on the way, because those use the same
// error boundary. ID checks use the shared texts of the core (`Invalid <kind> ID: <value>`, `Duplicate <kind> ID: <id>`),
// and the checks that `renderTimelineSvg` also makes (columns, load rows, header bands, markers) are the same internal
// checks it calls.
import type {
  TimelineBand, TimelineBar, TimelineColumn, TimelineDependency, TimelineLoadRow, TimelineLoadSegment, TimelineMarker,
  TimelineMarkerRange, TimelineRow, TimelineZoomPreset,
} from '../../core/types.js'
import {
  createTimeScale, createTimelineRowTree, resourceLoadHistogram, timelineLabelColumnId, validateTimelineData, type DependencyPathStyle,
  type TimeRange, type TimeScale,
} from '../../core/timeline.js'
import {
  baselineSelection, checkBandsAndMarkers, checkLoadRows, checkMarkerRanges, checkNonWorkingPeriods, checkTimelineColumns,
} from '../../core/barSegments.js'
import { checkId } from '../../core/ids.js'

/** The props as validated: the active zoom preset already replaces the scale settings it overrides. */
export interface GanttValidationInput<R extends TimelineRow> {
  rows: readonly R[]
  bars: readonly TimelineBar[]
  dependencies: readonly TimelineDependency[]
  laneCount: number
  summaryDependencies: boolean | undefined
  zoomPresets: readonly TimelineZoomPreset[] | undefined
  zoomPreset: string | undefined
  range: TimeRange
  pixelsPerUnit: number
  bounds: TimeRange
  rowHeight: number
  snap: number
  minDuration: number
  tickSteps: readonly number[]
  scale: TimeScale | undefined
  now: number | undefined
  nonWorkingPeriods: readonly TimeRange[] | undefined
  progressStep: number
  tooltipDelay: number
  dependencyStyle: DependencyPathStyle | undefined
  createDuration: number | undefined
  statusDate: number | undefined
  labelWidth: number | undefined
  minColumnWidth: number | undefined
  maxColumnWidth: number | undefined
  /**
   * True with `columnsResizable`, or with `sortableColumns` or `filterableColumns` naming at least one column: the header
   * addresses the label column by ID.
   */
  columnsResizable: boolean | undefined
  columns: readonly TimelineColumn<R>[] | undefined
  /** The header options; a list may only name `timelineLabelColumnId` and extra column IDs. */
  sortableColumns: boolean | readonly string[] | undefined
  filterableColumns: boolean | readonly string[] | undefined
  /** The row tree of the same `rows` from an earlier valid run; reused instead of building it again. */
  tree?: ReturnType<typeof createTimelineRowTree<R>>
  /**
   * The load of an earlier valid run. When its `loadRows`, `loadSegments` and `loadRowHeight` are the ones of this run,
   * it is reused instead of checking and building the histogram again.
   */
  load?: GanttLoad

  headerBands: readonly (readonly TimelineBand[])[] | undefined
  markers: readonly TimelineMarker[] | undefined
  markerRanges: readonly TimelineMarkerRange[] | undefined
  baselineIds: readonly string[] | undefined
  loadRows: readonly TimelineLoadRow[] | undefined
  loadSegments: readonly TimelineLoadSegment[] | undefined
  loadRowHeight: number
}

/** The load rows and segments a histogram was built from, and the histogram (undefined without load rows). */
export interface GanttLoad {
  rows: readonly TimelineLoadRow[] | undefined
  segments: readonly TimelineLoadSegment[] | undefined
  height: number
  histogram: ReturnType<typeof resourceLoadHistogram> | undefined
}

function validateLoad<R extends TimelineRow>(input: GanttValidationInput<R>): GanttLoad {
  const previous = input.load
  if (previous && previous.rows === input.loadRows && previous.segments === input.loadSegments && previous.height === input.loadRowHeight) {
    return previous
  }
  const ids = checkLoadRows(input.loadRows, input.loadSegments, input.loadRowHeight)
  const histogram = ids && resourceLoadHistogram(input.loadSegments ?? [], ids)
  return { rows: input.loadRows, segments: input.loadSegments, height: input.loadRowHeight, histogram }
}

function validatePresets<R extends TimelineRow>(input: GanttValidationInput<R>) {
  const ids = new Set<string>()
  for (const preset of input.zoomPresets ?? []) {
    checkId('zoom preset', preset.id, ids)
    if (!Number.isFinite(preset.pixelsPerUnit) || preset.pixelsPerUnit <= 0) throw new RangeError('Invalid zoom preset pixelsPerUnit: ' + preset.id)
  }
  if (input.zoomPreset !== undefined && !ids.has(input.zoomPreset)) throw new Error('Unknown zoom preset: ' + input.zoomPreset)
}

/** Extra columns, header bands (including those of the active zoom preset), markers, marker ranges and baselines. */
function validateDisplay<R extends TimelineRow>(input: GanttValidationInput<R>) {
  checkTimelineColumns(input.columns ?? [])
  checkBandsAndMarkers(input.headerBands, input.markers)
  if (input.markerRanges?.length) checkMarkerRanges(input.markerRanges, new Set(input.rows.map(row => row.id)))
  baselineSelection(input.bars, input.baselineIds)
}

/** Throw the first problem of the props, otherwise return the row tree and the load (with its histogram when there are load rows). */
export function validateGanttProps<R extends TimelineRow>(input: GanttValidationInput<R>) {
  validateTimelineData(input.rows, input.bars, input.dependencies, input.laneCount, { summaryDependencies: input.summaryDependencies })
  validatePresets(input)
  createTimeScale(input.range, input.pixelsPerUnit)
  createTimeScale(input.bounds, 1)
  if (!Number.isFinite(input.rowHeight) || input.rowHeight < 8 + input.laneCount * 14) throw new RangeError('rowHeight is too small for laneCount')
  if (!Number.isFinite(input.snap) || input.snap <= 0) throw new RangeError('snap must be finite and positive')
  if (!Number.isFinite(input.minDuration) || input.minDuration <= 0) throw new RangeError('minDuration must be finite and positive')
  const steps = input.tickSteps
  if (!steps.length || steps.some((step, i) => !Number.isFinite(step) || step <= 0 || (i > 0 && step < steps[i - 1]!))) throw new RangeError('tickSteps must be positive and ascending')
  if (input.scale && (!Number.isFinite(input.scale.width) || input.scale.width <= 0)) throw new RangeError('Invalid time scale width')
  if (input.now !== undefined && !Number.isFinite(input.now)) throw new RangeError('now must be finite')
  checkNonWorkingPeriods(input.nonWorkingPeriods)
  if (!Number.isFinite(input.progressStep) || input.progressStep <= 0 || input.progressStep > 1) {
    throw new RangeError('progressStep must be greater than 0 and at most 1')
  }
  if (!Number.isFinite(input.tooltipDelay) || input.tooltipDelay < 0) throw new RangeError('tooltipDelay must be finite and nonnegative')
  if (input.dependencyStyle !== undefined && !['orthogonal', 'rounded', 'curve'].includes(input.dependencyStyle)) {
    throw new RangeError('Unknown dependencyStyle: ' + String(input.dependencyStyle))
  }
  if (input.createDuration !== undefined && (!Number.isFinite(input.createDuration) || input.createDuration <= 0)) {
    throw new RangeError('createDuration must be finite and positive')
  }
  if (input.statusDate !== undefined && (typeof input.statusDate !== 'number' || !Number.isFinite(input.statusDate))) {
    throw new RangeError('statusDate must be finite')
  }
  if (input.labelWidth !== undefined && (typeof input.labelWidth !== 'number' || !Number.isFinite(input.labelWidth) || input.labelWidth <= 0)) {
    throw new RangeError('labelWidth must be finite and positive')
  }
  const minWidth = input.minColumnWidth ?? 48
  if (typeof minWidth !== 'number' || !Number.isFinite(minWidth) || minWidth <= 0) throw new RangeError('minColumnWidth must be finite and positive')
  if (input.maxColumnWidth !== undefined && (typeof input.maxColumnWidth !== 'number' || !Number.isFinite(input.maxColumnWidth)
    || input.maxColumnWidth < minWidth)) {
    throw new RangeError('maxColumnWidth must be finite and at least minColumnWidth')
  }
  if (input.columnsResizable && input.columns?.some(column => column.id === timelineLabelColumnId)) {
    throw new Error('The column ID is reserved for the row label column: ' + timelineLabelColumnId)
  }
  validateDisplay(input)
  checkHeaderOption('sortableColumns', input.sortableColumns, input.columns)
  checkHeaderOption('filterableColumns', input.filterableColumns, input.columns)
  return { tree: input.tree ?? createTimelineRowTree(input.rows), load: validateLoad(input) }
}

/** A header option list may only name the row label column (`timelineLabelColumnId`) and extra columns. */
function checkHeaderOption<R extends TimelineRow>(
  name: string, option: boolean | readonly string[] | undefined, columns: readonly TimelineColumn<R>[] | undefined,
) {
  if (option === undefined || typeof option === 'boolean') return
  if (!Array.isArray(option)) throw new Error(name + ' must be a boolean or a list of column IDs')
  const known = new Set([timelineLabelColumnId, ...(columns ?? []).map(column => column.id)])
  for (const id of option) if (!known.has(id)) throw new Error(`Unknown column in ${name}: ${String(id)}`)
}
