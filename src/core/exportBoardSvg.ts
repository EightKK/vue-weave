// SVG export of a task board (TaskBoard): column headers with counts and WIP states, lanes, cells and cards, drawn from
// `groupBoardCards` so the export shows the same cards in the same cells as the component. Free of Vue and the DOM.
import { groupBoardCards, type TaskBoardCard, type TaskBoardColumn, type TaskBoardColumnStatus, type TaskBoardLabels, type TaskBoardLane } from './taskBoard.js'
import {
  badge, boxText, common, estimateTextWidth, optionColour, sizeOption, svgDocument, tag, textDirection, textOption, titleTag, toneColors,
  type SvgExportOptions, type SvgExportThemeInput, type Theme,
} from './svgExportShared.js'
import { escapeXml } from './interchangeXml.js'
import type { PngExportOptions } from './types.js'

/** The TaskBoard texts that the board export draws. */
export type TaskBoardSvgLabels = Pick<TaskBoardLabels, 'empty' | 'emptyCell' | 'of' | 'overLimit' | 'underMinimum'>

/** Options of `renderTaskBoardSvg`. `C` types the cards that `filter`, `cardLabel` and `cardDetail` receive. */
export interface TaskBoardSvgOptions<C extends TaskBoardCard = TaskBoardCard> extends SvgExportOptions {
  /** Swimlanes, as TaskBoard `lanes`. Without lanes (or with an empty array) the board has one row of cells. */
  lanes?: readonly TaskBoardLane[]
  /** As TaskBoard `filter`: only the cards it accepts are drawn; counts show "shown of all" while it hides cards. */
  filter?: (card: C) => boolean
  /** Columns drawn as narrow strips with their label turned, as TaskBoard `collapsedColumnIds`. Unknown IDs are ignored. */
  collapsedColumnIds?: Iterable<string>
  /** Lanes drawn as their header only, as TaskBoard `collapsedLaneIds`. Unknown IDs are ignored. */
  collapsedLaneIds?: Iterable<string>
  /** A card drawn in the selected style. */
  selectedId?: string
  /** Texts; omitted ones use the English TaskBoard defaults. */
  labels?: Partial<TaskBoardSvgLabels>
  /** Width of an expanded column in pixels. Default 232. */
  columnWidth?: number
  /** Width of a collapsed column in pixels. Default 44. */
  collapsedColumnWidth?: number
  /** Margin around the board and gap between columns, in pixels. Default 10. */
  padding?: number
  /** Card title text. Defaults to `card.label`. */
  cardLabel?: (card: C) => string
  /** Card detail text. Defaults to `card.detail`. */
  cardDetail?: (card: C) => string | undefined
  /** Colour of the over-limit warning (`--vw-board-wip-warning`). Default `#a8361f`. */
  wipWarningColor?: string
  /** Colour of the under-minimum warning (`--vw-board-wip-under`). Default `#8a5a00`. */
  wipUnderColor?: string
}

/** Options of the TaskBoard `exportSvg` method. Current props supply the cards, columns, lanes, filter and collapsed IDs. */
export interface TaskBoardExportOptions<C extends TaskBoardCard = TaskBoardCard> {
  /** Paint an opaque background. Default true. */
  background?: boolean
  title?: string
  /** Colours that replace the values read from the `--vw-*` custom properties. */
  theme?: SvgExportThemeInput
  /** Draw the selected card in the selected style. Default true. */
  includeSelection?: boolean
  /** Width of an expanded column in pixels. Default 232. */
  columnWidth?: number
  cardLabel?: (card: C) => string
  cardDetail?: (card: C) => string | undefined
}

export interface TaskBoardPngExportOptions<C extends TaskBoardCard = TaskBoardCard> extends TaskBoardExportOptions<C>, PngExportOptions {}

const defaultLabels: TaskBoardSvgLabels = {
  empty: 'No columns to display', emptyCell: 'No cards', of: 'of', overLimit: 'Over WIP limit', underMinimum: 'Under WIP minimum',
}
const cardGap = 6
const cellPadding = 8
const minCellHeight = 64
const laneHeadHeight = 36

interface BoardStyle<C extends TaskBoardCard> {
  theme: Theme
  rtl: boolean
  labels: TaskBoardSvgLabels
  warning: string
  under: string
  selectedId?: string
  cardLabel: (card: C) => string
  cardDetail: (card: C) => string | undefined
}

function countText(status: { count: number; total: number }, labels: TaskBoardSvgLabels) {
  return status.count === status.total ? String(status.count) : `${status.count} ${labels.of} ${status.total}`
}

/** The height of a card: a title line, and a detail line when it has one. */
const cardHeight = (detail: string | undefined) => detail ? 50 : 34

/** One card: a surface box with the tone stripe at the inline start, the title and the detail. */
function boardCard<C extends TaskBoardCard>(card: C, x: number, y: number, width: number, style: BoardStyle<C>) {
  const { theme, rtl } = style
  const colors = toneColors(theme, card.tone)
  const label = style.cardLabel(card), detail = style.cardDetail(card)
  const height = cardHeight(detail)
  const selected = style.selectedId === card.id
  let out = titleTag([label, detail].filter(Boolean).join(' '))
  if (selected) out += tag('rect', { x: x - 3, y: y - 3, width: width + 6, height: height + 6, rx: 8, fill: 'none', stroke: theme.accent, 'stroke-width': 2 })
  out += tag('rect', { x, y, width, height, rx: 6, fill: theme.surface, stroke: selected ? colors.solid : colors.line })
  out += tag('rect', { x: rtl ? x + width - 4 : x, y, width: 4, height, fill: colors.solid })
  const box = { x, y, width, height }
  out += boxText(box, rtl, label, { y: 20, size: 12, weight: 650, fill: colors.ink, inset: 14 })
  if (detail) out += boxText(box, rtl, detail, { y: 37, size: 11, fill: theme.muted, inset: 14 })
  return { markup: tag('g', { class: 'vw-board-card' }, out), height }
}

/** A column header: title and detail, the count badge at the inline end and the WIP warnings below. */
function columnHeader<C extends TaskBoardCard>(
  column: TaskBoardColumn, status: TaskBoardColumnStatus, box: { x: number; width: number; height: number }, collapsed: boolean,
  lines: { detail?: number; warning?: number }, style: BoardStyle<C>,
) {
  const { theme, rtl, labels, warning, under } = style
  const count = countText(status, labels) + (status.wipLimit === undefined ? '' : ' / ' + status.wipLimit)
  const colors = status.overLimit ? { fill: warning, stroke: warning, ink: theme.onSolid }
    : status.underMinimum ? { fill: theme.surface, stroke: under, ink: under }
      : { fill: theme.surface, stroke: status.atLimit ? warning : theme.border, ink: theme.text }
  const badgeWidth = Math.max(22, estimateTextWidth(count, 11) + 14)
  const badgeX = collapsed ? box.x + (box.width - badgeWidth) / 2 : rtl ? box.x + 4 : box.x + box.width - 4 - badgeWidth
  let out = titleTag([column.label, column.detail].filter(Boolean).join(' '))
  out += badge(badgeX, 10, count, colors).markup
  if (!collapsed) {
    const titleBox = { x: rtl ? box.x + badgeWidth + 12 : box.x, y: 0, width: Math.max(0, box.width - badgeWidth - 12), height: box.height }
    out += boxText(titleBox, rtl, column.label, { y: 24, size: 12, weight: 700, fill: theme.text, inset: 4 })
    if (column.detail && lines.detail) out += boxText(titleBox, rtl, column.detail, { y: lines.detail, size: 10.5, fill: theme.muted, inset: 4 })
    const words = [status.overLimit ? { text: '▲ ' + labels.overLimit, fill: warning } : undefined,
      status.underMinimum ? { text: '▽ ' + labels.underMinimum, fill: under } : undefined].filter(item => item !== undefined)
    words.forEach((word, index) => {
      out += boxText({ x: box.x, y: 0, width: box.width, height: box.height }, rtl, word.text, {
        y: lines.warning! + index * 14, size: 10.5, weight: 700, fill: word.fill, inset: 4,
      })
    })
  }
  const line = status.overLimit ? warning : status.underMinimum ? under : theme.border
  out += tag('line', { x1: box.x, y1: box.height - 1, x2: box.x + box.width, y2: box.height - 1, stroke: line, 'stroke-width': 2 })
  return tag('g', { class: 'vw-board-column-head' }, out)
}

/**
 * Build a standalone SVG document of a task board with the default TaskBoard rendering: a header per column with its
 * label, detail, card count (with the WIP limit, and "shown of all" while `filter` hides cards) and WIP warnings, then
 * per lane a header and a row of cells with the cards in `cards` order. Collapsed columns are narrow strips with the
 * column label turned; collapsed lanes show their header and card count only. Every card is included regardless of
 * scrolling. Validates like `groupBoardCards` and throws a RangeError for invalid sizes or colours. Runs without a DOM.
 */
export function renderTaskBoardSvg<C extends TaskBoardCard>(
  cards: readonly C[], columns: readonly TaskBoardColumn[], options: TaskBoardSvgOptions<C> = {},
): string {
  const groups = groupBoardCards(cards, columns, options.lanes, { filter: options.filter })
  const { theme, rtl, font, background } = common(options)
  const columnWidth = sizeOption(options.columnWidth, 'columnWidth', 232)
  const collapsedWidth = sizeOption(options.collapsedColumnWidth, 'collapsedColumnWidth', 44)
  const padding = sizeOption(options.padding, 'padding', 10, true)
  const labels = { ...defaultLabels }
  for (const key of Object.keys(defaultLabels) as (keyof TaskBoardSvgLabels)[]) labels[key] = textOption(options.labels?.[key], 'labels.' + key, defaultLabels[key])
  const style: BoardStyle<C> = {
    theme, rtl, labels,
    warning: optionColour(options.wipWarningColor, 'wipWarningColor', '#a8361f'),
    under: optionColour(options.wipUnderColor, 'wipUnderColor', '#8a5a00'),
    selectedId: options.selectedId,
    cardLabel: options.cardLabel ?? (card => card.label), cardDetail: options.cardDetail ?? (card => card.detail),
  }

  if (!columns.length) {
    const width = 280, height = 72
    const body = (background ? tag('rect', { width, height, fill: theme.surfaceMuted }) : '')
      + boxText({ x: 0, y: 0, width, height }, rtl, labels.empty, { y: 40, size: 13, fill: theme.muted, align: 'center' })
    return svgDocument(width, height, options, font, '', body)
  }

  const collapsedColumns = new Set(options.collapsedColumnIds ?? [])
  const collapsedLanes = new Set(options.collapsedLaneIds ?? [])
  const laned = Boolean(options.lanes?.length)
  // Column boxes from the inline start; mirrored for right-to-left boards.
  const widths = columns.map(column => collapsedColumns.has(column.id) ? collapsedWidth : columnWidth)
  const contentWidth = widths.reduce((sum, width) => sum + width, 0) + padding * (columns.length - 1)
  const width = contentWidth + 2 * padding
  const starts: number[] = []
  let offset = 0
  for (const w of widths) {
    starts.push(offset)
    offset += w + padding
  }
  const columnX = (c: number) => padding + (rtl ? contentWidth - starts[c]! - widths[c]! : starts[c]!)

  // Header lines: the title, a detail line when any column has one, and the warnings below.
  const anyDetail = columns.some(column => column.detail && !collapsedColumns.has(column.id))
  const warnings = Math.max(0, ...groups.columns.map((status, c) => collapsedColumns.has(columns[c]!.id) ? 0 : Number(status.overLimit) + Number(status.underMinimum)))
  const detailLine = anyDetail ? 39 : undefined
  const warningLine = (detailLine ?? 24) + 16
  const headerHeight = (warnings ? warningLine + (warnings - 1) * 14 : detailLine ?? 24) + 12

  let head = ''
  columns.forEach((column, c) => {
    head += columnHeader(column, groups.columns[c]!, { x: columnX(c), width: widths[c]!, height: headerHeight }, collapsedColumns.has(column.id),
      { detail: detailLine, warning: warningLine }, style)
  })

  let body = ''
  let y = headerHeight
  groups.rows.forEach((row, r) => {
    const lane = laned ? options.lanes![r]! : undefined
    const laneCollapsed = lane !== undefined && collapsedLanes.has(lane.id)
    if (lane) {
      const counts = {
        count: row.cells.reduce((sum, cell) => sum + cell.cards.length, 0), total: row.cells.reduce((sum, cell) => sum + cell.total, 0),
      }
      const box = { x: padding, y, width: contentWidth, height: laneHeadHeight }
      const labelWidth = estimateTextWidth(lane.label, 12) + 8
      let laneOut = titleTag([lane.label, lane.detail].filter(Boolean).join(' '))
      laneOut += boxText(box, rtl, lane.label, { y: 26, size: 12, weight: 700, fill: theme.text, inset: 4 })
      if (lane.detail) laneOut += boxText(box, rtl, lane.detail, { y: 26, size: 10.5, fill: theme.muted, inset: 4 + labelWidth })
      if (laneCollapsed) {
        const detailWidth = lane.detail ? estimateTextWidth(lane.detail, 10.5) + 8 : 0
        const text = countText(counts, labels)
        const at = 4 + labelWidth + detailWidth
        const w = Math.max(22, estimateTextWidth(text, 11) + 14)
        laneOut += badge(rtl ? box.x + box.width - at - w : box.x + at, y + 13, text, { fill: theme.surface, stroke: theme.border, ink: theme.text }).markup
      }
      laneOut += tag('line', { x1: box.x, y1: y + laneHeadHeight - 0.5, x2: box.x + box.width, y2: y + laneHeadHeight - 0.5, stroke: theme.border, 'stroke-dasharray': '4 3' })
      body += tag('g', { class: 'vw-board-lane-head' }, laneOut)
      y += laneHeadHeight
      if (laneCollapsed) return
    }
    // The cells of the row: cards stacked from the top, or the empty placeholder.
    let rowHeight = minCellHeight
    const cellsOut: string[] = []
    row.cells.forEach((cell, c) => {
      if (collapsedColumns.has(columns[c]!.id)) {
        cellsOut.push('')
        return
      }
      const x = columnX(c), w = widths[c]!
      let out = '', top = y + cellPadding
      if (!cell.cards.length) {
        out += tag('rect', { x: x + 4, y: top, width: w - 8, height: 34, rx: 6, fill: 'none', stroke: theme.border, 'stroke-dasharray': '4 3' })
          + boxText({ x: x + 4, y: top, width: w - 8, height: 34 }, rtl, labels.emptyCell, { y: 21, size: 11, fill: theme.muted, align: 'center' })
        top += 34
      }
      cell.cards.forEach((card, index) => {
        const drawn = boardCard(card, x + 4, top + (index ? cardGap : 0), w - 8, style)
        out += drawn.markup
        top += drawn.height + (index ? cardGap : 0)
      })
      rowHeight = Math.max(rowHeight, top + cellPadding - y)
      cellsOut.push(out)
    })
    row.cells.forEach((_, c) => {
      const x = columnX(c), w = widths[c]!
      if (collapsedColumns.has(columns[c]!.id)) {
        body += tag('rect', { x, y, width: w, height: rowHeight, rx: 6, fill: theme.border, 'fill-opacity': 0.35 })
        return
      }
      if (groups.columns[c]!.overLimit) body += tag('rect', { x, y, width: w, height: rowHeight, rx: 6, fill: style.warning, 'fill-opacity': 0.07 })
      body += cellsOut[c]
    })
    y += rowHeight
  })
  const height = y + padding

  // Collapsed columns: the label turned to read from top to bottom along the strip below the header.
  columns.forEach((column, c) => {
    if (!collapsedColumns.has(column.id)) return
    const x = columnX(c), w = widths[c]!, top = headerHeight + 8
    const length = height - padding - top
    if (length <= 0) return
    body += tag('svg', { x, y: top, width: w, height: length, overflow: 'hidden' }, tag('text', {
      x: 0, y: 0, transform: `translate(${w / 2 - 4} 4) rotate(90)`, 'font-size': 12, 'font-weight': 700, fill: theme.text, ...textDirection(rtl),
      'text-anchor': rtl ? 'end' : undefined,
    }, escapeXml(column.label)))
  })

  const out = (background ? tag('rect', { width, height, fill: theme.surfaceMuted }) : '') + head + body
  return svgDocument(width, height, options, font, '', out)
}
