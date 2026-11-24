// Type-level checks for the SVG and PNG export of TaskBoard, EventCalendar and TreeGrid. Checked by `npm run typecheck`.
import { ref } from 'vue'
import {
  renderEventCalendarSvg, renderTaskBoardSvg, renderTreeGridSvg,
  type CalendarEvent, type EventCalendarExportOptions, type EventCalendarPngExportOptions, type EventCalendarSvgOptions,
  type TaskBoardCard, type TaskBoardExportOptions, type TaskBoardPngExportOptions, type TaskBoardSvgOptions, type TreeGridColumn,
  type TreeGridExportOptions, type TreeGridPngExportOptions, type TreeGridRow, type TreeGridSvgOptions,
} from '../../src/core/index'
import {
  EventCalendar, TaskBoard, TreeGrid, renderTreeGridSvg as vueRenderTreeGridSvg,
  type EventCalendarExposed, type TaskBoardExposed, type TreeGridExposed,
} from '../../src/index'

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false
function assertType<T extends true>(value?: T) { return value }

interface Story extends TaskBoardCard<{ points: number }> { epic: string }
interface Booking extends CalendarEvent<{ owner: string }> { room: string }
interface Part extends TreeGridRow<{ qty: number }> { sku: string }

// The core builders type their callbacks with the item types of their arguments.
const cards: Story[] = [{ id: 'a', columnId: 'todo', label: 'A', epic: 'E' }]
const boardSvg: string = renderTaskBoardSvg(cards, [{ id: 'todo', label: 'To do' }], {
  cardLabel: card => card.epic, cardDetail: card => String(card.data?.points), filter: card => card.epic !== 'x', direction: 'rtl',
})
const events: Booking[] = [{ id: 'e', start: 0, end: 1, label: 'E', room: 'R' }]
const calendarSvg: string = renderEventCalendarSvg(events, 0, { view: 'month', eventLabel: event => event.room, timeZone: 'Europe/Berlin' })
const rows: Part[] = [{ id: 'p', label: 'P', sku: 'S' }]
const columns: TreeGridColumn<Part>[] = [{ id: 'qty', label: 'Qty', width: 60, value: row => row.data?.qty }]
const gridSvg: string = renderTreeGridSvg(rows, columns, {
  formatValue: (value, { row }) => row.sku + String(value), sortRules: { sku: (a, b) => a.sku.localeCompare(b.sku) },
  expandedIds: 'all', rowRange: { start: 0, end: 1 },
})
assertType<Equal<typeof vueRenderTreeGridSvg, typeof renderTreeGridSvg>>()
// @ts-expect-error The calendar view is one of the EventCalendar views.
renderEventCalendarSvg(events, 0, { view: 'year' })
// @ts-expect-error A card label callback returns a string.
renderTaskBoardSvg(cards, [], { cardLabel: () => 1 })
const boardOptions: TaskBoardSvgOptions<Story> = { selectedId: 'a', wipWarningColor: '#f00' }
const calendarOptions: EventCalendarSvgOptions<Booking> = { resources: [{ id: 'r', label: 'R' }], heading: false }
const gridOptions: TreeGridSvgOptions<Part> = { applyView: false, sort: [{ ruleId: 'qty', direction: 'asc' }] }

// The component refs expose the export methods with the component's item types.
declare const board: TaskBoardExposed<Story>
declare const calendar: EventCalendarExposed<Booking>
declare const grid: TreeGridExposed<Part>
const boardExport: string = board.exportSvg({ cardLabel: card => card.epic, title: 'Board' })
const calendarExport: string = calendar.exportSvg({ eventLabel: event => event.room, width: 800, heading: false })
const gridExport: string = grid.exportSvg({ rowRange: { start: 0, end: 10 }, includeTreeColumn: false })
const pngs: Promise<Blob>[] = [board.exportPng({ scale: 2 }), calendar.exportPng({ scale: 2 }), grid.exportPng({ scale: 2 })]
assertType<Equal<Parameters<typeof board.exportSvg>[0], TaskBoardExportOptions<Story> | undefined>>()
assertType<Equal<Parameters<typeof calendar.exportPng>[0], EventCalendarPngExportOptions<Booking> | undefined>>()
assertType<Equal<Parameters<typeof grid.exportPng>[0], TreeGridPngExportOptions | undefined>>()
// @ts-expect-error The export options have no `view`: the calendar exports the view it shows.
calendar.exportSvg({ view: 'day' })
// @ts-expect-error The board label callback receives the board's card type.
board.exportSvg({ cardLabel: (card: Booking) => card.room })

// The component instance types carry the methods too.
const boardRef = ref<InstanceType<typeof TaskBoard>>()
const calendarRef = ref<InstanceType<typeof EventCalendar>>()
const gridRef = ref<InstanceType<typeof TreeGrid>>()
const fromRefs: (string | undefined)[] = [boardRef.value?.exportSvg(), calendarRef.value?.exportSvg(), gridRef.value?.exportSvg({ columnRange: { start: 0, end: 1 } })]
const options: [TaskBoardExportOptions, EventCalendarExportOptions, TreeGridExportOptions, TaskBoardPngExportOptions] = [{}, {}, {}, { scale: 1 }]
void [boardSvg, calendarSvg, gridSvg, boardOptions, calendarOptions, gridOptions, boardExport, calendarExport, gridExport, pngs, fromRefs, options]
