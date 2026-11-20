// Type-level checks for partial data loading: the windowed data state, useWindowedData, dangling links and graph
// expansion keep the item, link, node and edge types of the application. Checked by `npm run typecheck`.
import { ref } from 'vue'
import {
  createGraphExpansion, createWindowedDataState, graphExpansionView, mergeGraphExpansionPage, resolveWindowedRequest, setWindowedView,
  splitDanglingLinks, type GraphEdge, type NetworkNode, type TimelineBar, type TimelineDependency, type TimelineVisibleWindow,
  type WindowedCellStatus, type WindowedView,
} from '../../src/core/index'
import { useWindowedData, type GanttChartExposed } from '../../src/index'

interface JobData { order: string }
type Job = TimelineBar<JobData>
interface Link extends TimelineDependency { note: string }

// The loader receives typed requests and may return items, a page or a promise of either.
const view = ref<TimelineVisibleWindow>()
const data = useWindowedData<Job, Link>({
  view, condition: () => 'all', chunkSize: 1, load: async (request, { signal }) => {
    const rows: string[] | undefined = request.rowIds
    void rows
    void (signal.aborted satisfies boolean)
    return { items: [] as Job[], links: [] as Link[] }
  },
})
const order: string | undefined = data.items.value[0]?.data?.order
void order
const note: string | undefined = data.resolvedLinks.value[0]?.note
void note
const missing: string[] | undefined = data.danglingLinks.value[0]?.missingIds
void missing
const status: WindowedCellStatus = data.status.value
void status
const complete: boolean = data.complete.value
void complete
// Items only: links default to never.
const itemsOnly = useWindowedData<Job>({ view, chunkSize: 1, load: () => [] as Job[] })
const noLink: never[] = itemsOnly.links.value
void noLink
// @ts-expect-error the loader must return items of the declared type
useWindowedData<Job>({ view, chunkSize: 1, load: () => [{ id: 'x' }] })
// @ts-expect-error a chunk size is required
useWindowedData<Job>({ view, load: () => [] })

// The pure state keeps the item type; custom accessors read other shapes.
interface Booking { key: string; room: string; from: number; to: number }
const bookings = createWindowedDataState<Booking>({
  chunkSize: 10, itemId: item => item.key, itemRow: item => item.room, itemRange: item => ({ start: item.from, end: item.to }),
})
const planned = setWindowedView(bookings, { start: 0, end: 5, rowIds: ['a'] } satisfies WindowedView)
const settled = resolveWindowedRequest(planned.state, planned.start[0]!.requestId, [{ key: 'k', room: 'a', from: 0, to: 1 }])
const room: string | undefined = settled.state.items.get('k')?.room
void room

// Dangling links keep the link type.
const split = splitDanglingLinks([{ id: 'l', from: 'a', to: 'b', weight: 2 }], new Set(['a']))
const weight: number | undefined = split.dangling[0]?.link.weight
void weight
// @ts-expect-error links need from and to unless accessors are given
splitDanglingLinks([{ id: 'l' }], [])

// Graph expansion keeps node and edge types.
interface Part extends NetworkNode { sku: string }
interface Route extends GraphEdge { capacity: number }
const expansion = mergeGraphExpansionPage(createGraphExpansion<Part, Route>(), { nodes: [{ id: 'a', label: 'A', sku: 'x' }] }, ['a'])
const shown = graphExpansionView(expansion)
const sku: string | undefined = shown.nodes[0]?.sku
const capacity: number | undefined = shown.edges[0]?.capacity
void sku
void capacity
// @ts-expect-error nodes of another type
mergeGraphExpansionPage(expansion, { nodes: [{ id: 'b' }] })

// The chart's exposed methods are unchanged by the new event.
declare const chart: GanttChartExposed
void chart.scrollToTime
