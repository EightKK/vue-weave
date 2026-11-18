// Type-level checks for timelineBarsInRange and the timeRange option of useLinkedSelection. Checked by `npm run typecheck`.
import { computed } from 'vue'
import { timelineBarsInRange, type TimelineBar, type TimeRangeTargets } from '../../src/core/index'
import { useLinkedSelection, type LinkedTimeRange } from '../../src/index'

interface JobData { order: string }
declare const bars: TimelineBar<JobData>[]

// The bar type is kept, so application data stays typed.
const found = timelineBarsInRange(bars, { start: 0, end: 10 }, { rowIds: new Set(['x']) })
const order: string | undefined = found[0]?.data?.order
void order
// Only the fields the function reads are required.
const minimal = timelineBarsInRange([{ id: 'a', rowId: 'r', start: 0, end: 1 }], { start: 0, end: 1 })
const id: string | undefined = minimal[0]?.id
void id
// @ts-expect-error a bar needs a row ID
timelineBarsInRange([{ id: 'a', start: 0, end: 1 }], { start: 0, end: 1 })

const timeRange = computed<LinkedTimeRange | undefined>(() => ({
  range: { start: 0, end: 10 }, bars, rowIds: ['x'], graph: { nodes: [], edges: [] }, traversal: { direction: 'forward', maxHops: 2 },
}))
const linked = useLinkedSelection({ bindings: [], timeRange })
const resolved: TimeRangeTargets | undefined = linked.timeRange.value
void resolved
const related: ReadonlySet<string> = linked.graph.value.relatedNodeIds
void related
// @ts-expect-error an unknown traversal direction
useLinkedSelection({ bindings: [], timeRange: { range: { start: 0, end: 1 }, bars, traversal: { direction: 'sideways' } } })
