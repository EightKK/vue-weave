// Validation of the GanttChart props. The checks run in a fixed order, so the first problem found is the one reported
// through `validation-error`. They derive the row tree and the load histogram on the way, because those use the same
// error boundary.
import type {
  TimelineBand, TimelineBar, TimelineColumn, TimelineDependency, TimelineLoadRow, TimelineLoadSegment, TimelineMarker,
  TimelineMarkerRange, TimelineRow, TimelineZoomPreset,
} from '../../core/types.js'
import {
  createTimeScale, createTimelineRowTree, resourceLoadHistogram, timelineLabelColumnId, validateTimelineData, type DependencyPathStyle,
  type TimeRange, type TimeScale,
} from '../../core/timeline.js'
import { baselineSelection, checkMarkerRanges, checkNonWorkingPeriods } from '../../core/barSegments.js'

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
  columnsResizable: boolean | undefined
  columns: readonly TimelineColumn<R>[] | undefined
  headerBands: readonly (readonly TimelineBand[])[] | undefined
  markers: readonly TimelineMarker[] | undefined
  markerRanges: readonly TimelineMarkerRange[] | undefined
  baselineIds: readonly string[] | undefined
  loadRows: readonly TimelineLoadRow[] | undefined
  loadSegments: readonly TimelineLoadSegment[] | undefined
  loadRowHeight: number
}

function validateLoad<R extends TimelineRow>(input: GanttValidationInput<R>) {
  if (!input.loadRows?.length) {
    if (input.loadSegments?.length) throw new Error('loadSegments require loadRows')
    return undefined
  }
  const ids = new Set<string>()
  for (const row of input.loadRows) {
    if (!row.id || ids.has(row.id)) throw new Error('Invalid or duplicate load row ID: ' + row.id)
    ids.add(row.id)
  }
  if (!Number.isFinite(input.loadRowHeight) || input.loadRowHeight < 16) throw new RangeError('loadRowHeight must be at least 16')
  return resourceLoadHistogram(input.loadSegments ?? [], ids)
}

function validatePresets<R extends TimelineRow>(input: GanttValidationInput<R>) {
  const ids = new Set<string>()
  for (const preset of input.zoomPresets ?? []) {
    if (!preset.id || ids.has(preset.id)) throw new Error('Invalid or duplicate zoom preset: ' + preset.id)
    if (!Number.isFinite(preset.pixelsPerUnit) || preset.pixelsPerUnit <= 0) throw new RangeError('Invalid zoom preset pixelsPerUnit: ' + preset.id)
    ids.add(preset.id)
  }
  if (input.zoomPreset !== undefined && !ids.has(input.zoomPreset)) throw new Error('Unknown zoom preset: ' + input.zoomPreset)
}

/** Extra columns, header bands (including those of the active zoom preset), markers, marker ranges and baselines. */
function validateDisplay<R extends TimelineRow>(input: GanttValidationInput<R>) {
  const columnIds = new Set<string>()
  for (const column of input.columns ?? []) {
    if (!column.id || columnIds.has(column.id) || !Number.isFinite(column.width) || column.width <= 0) {
      throw new Error('Invalid timeline column: ' + column.id)
    }
    columnIds.add(column.id)
  }
  for (const level of input.headerBands ?? []) {
    let previousEnd = -Infinity
    for (const band of level) {
      if (!Number.isFinite(band.start) || !Number.isFinite(band.end) || band.end <= band.start || band.start < previousEnd) {
        throw new Error('Timeline bands must be finite, ordered and nonoverlapping')
      }
      previousEnd = band.end
    }
  }
  const markerIds = new Set<string>()
  for (const item of input.markers ?? []) {
    if (!item.id || markerIds.has(item.id) || !Number.isFinite(item.time)) throw new Error('Invalid timeline marker: ' + item.id)
    markerIds.add(item.id)
  }
  if (input.markerRanges?.length) checkMarkerRanges(input.markerRanges, new Set(input.rows.map(row => row.id)))
  baselineSelection(input.bars, input.baselineIds)
}

/** Throw the first problem of the props, otherwise return the row tree and the load histogram (when there are load rows). */
export function validateGanttProps<R extends TimelineRow>(input: GanttValidationInput<R>) {
  validateTimelineData(input.rows, input.bars, input.dependencies, input.laneCount, { summaryDependencies: input.summaryDependencies })
  validatePresets(input)
  createTimeScale(input.range, input.pixelsPerUnit)
  createTimeScale(input.bounds, 1)
  if (!Number.isFinite(input.rowHeight) || input.rowHeight < 8 + input.laneCount * 14) throw new RangeError('rowHeight is too small for laneCount')
  if (!Number.isFinite(input.snap) || input.snap <= 0 || !Number.isFinite(input.minDuration) || input.minDuration <= 0) throw new RangeError('Invalid snap or minDuration')
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
  return { tree: createTimelineRowTree(input.rows), load: validateLoad(input) }
}
