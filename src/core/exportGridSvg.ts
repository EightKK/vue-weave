// SVG export of a tree grid (TreeGrid): the header, the tree column with indentation and expand glyphs, and the cells
// with the text, tone and state marks the component shows, built from `createTreeGridIndex`, `flattenTreeGrid` and
// `treeGridCellText`. The optional header sort and filters are applied with `projectTreeGridRows`. Every displayed line
// is drawn, not only a virtual window. Free of Vue and the DOM.
import {
  createTreeGridIndex, flattenTreeGrid, projectTreeGridRows, resolveTreeGridCell, treeGridCellText, treeGridColumnOffsets, treeGridDefaultLabels,
  type TreeGridCell, type TreeGridCellRef, type TreeGridColumn, type TreeGridLabels, type TreeGridLine, type TreeGridMissingCell,
  type TreeGridRow, type TreeGridValue,
} from './treeGrid.js'
import { timelineLabelColumnId } from './timeline.js'
import type { TimelineRowCompare, TimelineViewFilter, TimelineViewSort } from './timelineView.js'
import type { PngExportOptions } from './types.js'
import {
  boxText, common, estimateTextWidth, indexRange, num, optionColour, sizeOption, svgDocument, tag, titleTag, toneColors,
  type SvgExportOptions, type SvgExportThemeInput, type Theme,
} from './svgExportShared.js'

/** Options of `renderTreeGridSvg`. `R` types the rows that `formatValue` and `sortRules` receive. */
export interface TreeGridSvgOptions<R extends TreeGridRow = TreeGridRow> extends SvgExportOptions {
  /** Sparse cells of the columns without `value`, as TreeGrid `cells`. */
  cells?: readonly TreeGridCell[]
  /** What a cell that the data does not list means, as TreeGrid `missingCell`. Default `empty`. */
  missingCell?: TreeGridMissingCell
  /**
   * The expanded rows, as TreeGrid `expandedIds`: the descendants of other rows are left out. Default `all`, which
   * expands every row so the whole tree is drawn.
   */
  expandedIds?: Iterable<string> | 'all'
  /** Text of a cell value, as TreeGrid `formatValue`. */
  formatValue?: (value: TreeGridValue, context: { row: R; column: TreeGridColumn<R> }) => string
  /** Texts; omitted ones use `treeGridDefaultLabels`. The export draws the tree column header, yes and no, the marks and the status words. */
  labels?: Partial<TreeGridLabels>
  /** Height of every line in pixels. Default 32. */
  rowHeight?: number
  /** Height of the header row in pixels. Default 36. */
  headerHeight?: number
  /** Width of the tree column in pixels. Default 240. */
  treeColumnWidth?: number
  /** Indentation per tree level in pixels (`--vw-tree-grid-indent`). Default 16. */
  indent?: number
  /** Header sort rules, as TreeGrid `sort`: drawn as ▲ and ▼ in the headers and, with `applyView`, applied to the rows. */
  sort?: readonly TimelineViewSort[]
  /** Column filters, as TreeGrid `filters`: marked with ⏷ in the headers and, with `applyView`, applied to the rows. */
  filters?: readonly TimelineViewFilter[]
  /** Registered compare rules of `projectTreeGridRows`. */
  sortRules?: Readonly<Record<string, TimelineRowCompare<R>>>
  /**
   * Apply `sort` and `filters` with `projectTreeGridRows` before drawing. Default true; pass false when the rows are
   * already projected, as TreeGrid's parent passes them.
   */
  applyView?: boolean
  /** Export only displayed lines `start` (inclusive) to `end` (exclusive), counted after collapsing and filtering. */
  rowRange?: { start: number; end: number }
  /** Export only data columns `start` (inclusive) to `end` (exclusive), counted in `columns` order. */
  columnRange?: { start: number; end: number }
  /** Draw the tree column. Default true. */
  includeTreeColumn?: boolean
  /** Rows drawn in the selected style, as TreeGrid `selectedRowIds`. */
  selectedRowIds?: Iterable<string>
  /** Rows drawn highlighted, as TreeGrid `highlightedRowIds`. */
  highlightedRowIds?: Iterable<string>
  /** Cells drawn highlighted, as TreeGrid `highlightedCells`. */
  highlightedCells?: readonly TreeGridCellRef[]
  /** Colour of highlights (`--vw-tree-grid-highlight`). Defaults to the theme's `dependencyHighlight`. */
  highlightColor?: string
  /** Fill of selected rows (`--vw-tree-grid-selected`). Default `#e3eefa`. */
  selectedColor?: string
}

/** Options of the TreeGrid `exportSvg` method. Current props and expanded rows supply everything else. */
export interface TreeGridExportOptions {
  /** Paint an opaque background. Default true. */
  background?: boolean
  title?: string
  /** Colours that replace the values read from the `--vw-*` custom properties. */
  theme?: SvgExportThemeInput
  /** Export only displayed lines `start` (inclusive) to `end` (exclusive). Defaults to all, not only the rendered window. */
  rowRange?: { start: number; end: number }
  /** Export only data columns `start` (inclusive) to `end` (exclusive). Defaults to all. */
  columnRange?: { start: number; end: number }
  /** Draw the tree column. Default true. */
  includeTreeColumn?: boolean
  /** Draw the selected rows and the highlights of `highlightedRowIds` and `highlightedCells`. Default true. */
  includeHighlight?: boolean
}

export interface TreeGridPngExportOptions extends TreeGridExportOptions, PngExportOptions {}

const stateWord: Record<string, keyof TreeGridLabels> = {
  none: 'none', unknown: 'unknown', 'not-applicable': 'notApplicable', unloaded: 'unloaded', loading: 'loading', failed: 'failed',
}
const stateMark: Record<string, keyof TreeGridLabels> = {
  none: 'noneMark', unknown: 'unknownMark', 'not-applicable': 'notApplicableMark', unloaded: 'unloadedMark', loading: 'loadingMark', failed: 'failedMark',
}

/** The expand glyph: a chevron towards the reading direction when collapsed and downwards when expanded. */
function toggleGlyph(cx: number, cy: number, expanded: boolean, rtl: boolean, color: string) {
  const points: [number, number][] = expanded ? [[-4, -2], [0, 2], [4, -2]] : rtl ? [[2, -4], [-2, 0], [2, 4]] : [[-2, -4], [2, 0], [-2, 4]]
  const d = points.map(([dx, dy], i) => `${i ? 'L' : 'M'} ${num(cx + dx)} ${num(cy + dy)}`).join(' ')
  return tag('path', { d, fill: 'none', stroke: color, 'stroke-width': 1.5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' })
}

/** A header cell: the label clipped before the sort and filter glyphs at the inline end. */
function headCell(box: { x: number; y: number; width: number; height: number }, label: string, glyphs: string, theme: Theme, rtl: boolean) {
  const glyphWidth = glyphs ? estimateTextWidth(glyphs, 11) + 8 : 0
  const labelBox = { ...box, x: rtl ? box.x + glyphWidth : box.x, width: Math.max(0, box.width - glyphWidth) }
  return boxText(labelBox, rtl, label, { y: box.height / 2 + 4, size: 12, weight: 700, fill: theme.muted, inset: 8 })
    + (glyphs ? boxText(box, rtl, glyphs, { y: box.height / 2 + 4, size: 11, fill: theme.accent, inset: 8, align: 'end' }) : '')
}

/**
 * Build a standalone SVG document of a tree grid with the default TreeGrid rendering: the header (with ▲ or ▼ on sorted
 * columns and ⏷ on filtered ones), the tree column with indentation, expand glyphs, labels, details and the status
 * lines of children not loaded, and the cells with their text (`treeGridCellText`), alignment, tone and state marks.
 * Every displayed line is drawn (all rows with the default `expandedIds: 'all'`); `rowRange` and `columnRange` narrow
 * it. Validates like `createTreeGridIndex` (and `projectTreeGridRows` with `sort` or `filters`) and throws a RangeError
 * for invalid sizes, ranges or colours. Runs without a DOM.
 */
export function renderTreeGridSvg<R extends TreeGridRow>(
  rows: readonly R[], columns: readonly TreeGridColumn<R>[], options: TreeGridSvgOptions<R> = {},
): string {
  const { theme, rtl, font, background } = common(options)
  const labels = { ...treeGridDefaultLabels, ...options.labels } as Required<TreeGridLabels>
  for (const [key, value] of Object.entries(labels)) {
    if (typeof value !== 'string') throw new TypeError(`labels.${key} must be a string`)
  }
  const textOptions = { formatValue: options.formatValue, labels: { yes: labels.yes, no: labels.no } }
  let shownRows = rows, cells = options.cells
  if (options.applyView !== false && (options.sort?.length || options.filters?.length)) {
    const projection = projectTreeGridRows(
      { rows, columns, cells, missingCell: options.missingCell, sortRules: options.sortRules, ...textOptions },
      { sort: options.sort, filters: options.filters },
    )
    shownRows = projection.rows
    cells = projection.cells
  }
  const index = createTreeGridIndex({ rows: shownRows, columns, cells, missingCell: options.missingCell })
  const rowHeight = sizeOption(options.rowHeight, 'rowHeight', 32)
  const headerHeight = sizeOption(options.headerHeight, 'headerHeight', 36)
  const treeWidth = options.includeTreeColumn === false ? 0 : sizeOption(options.treeColumnWidth, 'treeColumnWidth', 240)
  const indent = sizeOption(options.indent, 'indent', 16, true)
  const highlight = optionColour(options.highlightColor, 'highlightColor', theme.dependencyHighlight)
  const selectedFill = optionColour(options.selectedColor, 'selectedColor', '#e3eefa')
  const expanded = options.expandedIds === undefined || options.expandedIds === 'all' ? shownRows.map(row => row.id) : options.expandedIds
  const flat = flattenTreeGrid(index, expanded)
  const lineRange = indexRange(options.rowRange, flat.lines.length, 'rowRange', 'the displayed line count')
  const columnRange = indexRange(options.columnRange, columns.length, 'columnRange', 'the column count')
  const lines = flat.lines.slice(lineRange.start, lineRange.end)
  const shownColumns = columns.slice(columnRange.start, columnRange.end)
  const offsets = treeGridColumnOffsets(shownColumns)
  const columnsWidth = offsets[offsets.length - 1]!
  const width = treeWidth + columnsWidth
  if (!(width > 0)) throw new RangeError('The exported grid has no columns: include the tree column or at least one column')
  const height = headerHeight + Math.max(1, lines.length) * rowHeight
  const treeX = rtl ? width - treeWidth : 0
  const columnX = (c: number) => rtl ? width - treeWidth - offsets[c + 1]! : treeWidth + offsets[c]!

  const selected = new Set(options.selectedRowIds ?? [])
  const highlightedRows = new Set(options.highlightedRowIds ?? [])
  const highlightedCells = new Set((options.highlightedCells ?? []).map(cell => JSON.stringify([cell.rowId, cell.columnId])))
  const sortOf = new Map<string, TimelineViewSort['direction']>()
  for (const rule of options.sort ?? []) if (!sortOf.has(rule.ruleId)) sortOf.set(rule.ruleId, rule.direction)
  const filtered = new Set((options.filters ?? []).filter(filter => filter.text?.trim() || filter.values).map(filter => filter.columnId))
  const glyphs = (id: string) => [sortOf.get(id) === 'asc' ? '▲' : sortOf.get(id) === 'desc' ? '▼' : '', filtered.has(id) ? '⏷' : ''].join('')

  let out = background ? tag('rect', { width, height, fill: theme.surface }) : ''

  // Header.
  out += tag('rect', { x: 0, y: 0, width, height: headerHeight, fill: theme.surfaceMuted })
  if (treeWidth) out += headCell({ x: treeX, y: 0, width: treeWidth, height: headerHeight }, labels.treeColumn, glyphs(timelineLabelColumnId), theme, rtl)
  shownColumns.forEach((column, c) => {
    const box = { x: columnX(c), y: 0, width: column.width, height: headerHeight }
    out += headCell(box, column.label, glyphs(column.id), theme, rtl)
  })

  // Lines.
  if (!lines.length) {
    out += boxText({ x: 0, y: headerHeight, width, height: rowHeight }, rtl, labels.empty, { y: rowHeight / 2 + 4, size: 12, fill: theme.muted, align: 'center' })
  }
  lines.forEach((line: TreeGridLine<R>, i) => {
    const y = headerHeight + i * rowHeight
    const row = line.row, isRow = line.kind === 'row'
    const strong = isRow && highlightedRows.has(row.id)
    let rowOut = ''
    if (isRow && selected.has(row.id)) rowOut += tag('rect', { x: 0, y, width, height: rowHeight, fill: selectedFill })
    shownColumns.forEach((column, c) => {
      if (!isRow) return
      const box = { x: columnX(c), y, width: column.width, height: rowHeight }
      const view = resolveTreeGridCell(index, row.id, column.id)
      const colors = view.tone ? toneColors(theme, view.tone) : undefined
      if (colors) rowOut += tag('rect', { ...box, fill: colors.pale })
      else if (view.state === 'not-applicable') rowOut += tag('rect', { ...box, fill: theme.surfaceMuted })
      if (view.state === 'value') {
        const align = column.align ?? (typeof view.value === 'number' ? 'end' : 'start')
        rowOut += boxText(box, rtl, treeGridCellText(index, row.id, column.id, textOptions), {
          y: rowHeight / 2 + 4, size: 12, fill: colors?.ink ?? theme.text, inset: 8, align,
        })
      } else if (view.state !== 'empty') {
        const failed = view.state === 'failed'
        rowOut += tag('g', {}, titleTag(labels[stateWord[view.state]!]) + boxText(box, rtl, labels[stateMark[view.state]!], {
          y: rowHeight / 2 + 4, size: 12, fill: failed ? theme.critical : theme.muted, weight: failed ? 700 : undefined, inset: 8,
          align: column.align ?? 'start',
        }))
      }
      if (highlightedCells.has(JSON.stringify([row.id, column.id]))) {
        rowOut += tag('rect', { x: box.x + 1, y: box.y + 1, width: box.width - 2, height: box.height - 2, fill: 'none', stroke: highlight, 'stroke-width': 2 })
      }
      const edge = rtl ? box.x : box.x + box.width
      rowOut += tag('line', { x1: edge, y1: y, x2: edge, y2: y + rowHeight, stroke: theme.grid })
    })
    if (treeWidth) {
      const box = { x: treeX, y, width: treeWidth, height: rowHeight }
      const start = 6 + (line.level - 1) * indent
      if (line.expandable) {
        const cx = rtl ? treeX + treeWidth - start - 8 : treeX + start + 8
        rowOut += toggleGlyph(cx, y + rowHeight / 2, line.expanded, rtl, theme.text)
      }
      const inset = start + 20
      if (isRow) {
        rowOut += boxText(box, rtl, row.label, { y: rowHeight / 2 + 4, size: 12, weight: 600, fill: strong ? highlight : theme.text, inset })
        if (row.detail) {
          rowOut += boxText(box, rtl, row.detail, { y: rowHeight / 2 + 4, size: 10.5, fill: theme.muted, inset: inset + estimateTextWidth(row.label, 12) + 6 })
        }
      } else {
        rowOut += boxText(box, rtl, labels[stateWord[line.status ?? 'unloaded'] ?? 'unloaded'], { y: rowHeight / 2 + 4, size: 12, fill: theme.muted, inset, italic: true })
      }
      if (strong) rowOut += tag('rect', { x: rtl ? treeX + treeWidth - 4 : treeX, y, width: 4, height: rowHeight, fill: highlight })
    }
    rowOut += tag('line', { x1: 0, y1: y + rowHeight - 0.5, x2: width, y2: y + rowHeight - 0.5, stroke: theme.grid })
    const name = isRow ? [row.label, row.detail].filter(Boolean).join(' ') : labels[stateWord[line.status ?? 'unloaded'] ?? 'unloaded']
    out += tag('g', { class: isRow ? 'vw-tree-grid-row' : 'vw-tree-grid-row vw-is-status' }, titleTag(name) + rowOut)
  })

  // Column lines of the header, the tree column border and the header border.
  shownColumns.forEach((column, c) => {
    const edge = rtl ? columnX(c) : columnX(c) + column.width
    out += tag('line', { x1: edge, y1: 0, x2: edge, y2: headerHeight, stroke: theme.grid })
  })
  if (treeWidth && columnsWidth) {
    const edge = rtl ? treeX : treeWidth
    out += tag('line', { x1: edge, y1: 0, x2: edge, y2: height, stroke: theme.border })
  }
  out += tag('line', { x1: 0, y1: headerHeight - 1, x2: width, y2: headerHeight - 1, stroke: theme.border, 'stroke-width': 2 })
  return svgDocument(width, height, options, font, '', out)
}
