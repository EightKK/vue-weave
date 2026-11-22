<script setup lang="ts">
// Opt-in example of a period table: TreeGrid rows (site, item, measure) against day or week columns built with
// `calendarBands` and `createTimeBucketColumns` in an IANA zone, filled by `aggregateTimeBuckets`, next to a GanttChart
// of the supply orders. The table shows the periods of the chart's visible window (`visible-window-change` and
// `timeBucketIndexRange`). Events load by day through `useWindowedData` from the plan start to the last shown period,
// because a balance needs every earlier day; periods that are not loaded show their load state, never 0. Demand cells
// are editable, edits go to `useEditHistory`, and the balances follow. Selecting a cell selects the orders that feed it
// through entities (`useLinkedSelection().selectEntities`), and the chart highlights them. The supply arithmetic below
// (balance = opening + receipts − demand, shipped = demand covered by stock) is demo logic, not library behaviour.
import { computed, ref, shallowRef, watch } from 'vue'
import {
  GanttChart, TreeGrid, aggregateTimeBuckets, calendarBands, calendarZoomPresets, createTimeBucketColumns, intlTimeFormatter,
  matchTreeGridEntities, timeBucketIndexRange, useEditHistory, useLinkedSelection, useWindowedData,
  type EntityRef, type TimeBucketCell, type TimeBucketColumn, type TimeBucketItem, type TimelineVisibleWindow, type TreeGridActivation,
  type TreeGridCell, type TreeGridCellContent, type TreeGridCellEdit, type TreeGridColumn, type TreeGridEditCancel, type TreeGridRow,
  type TreeGridSheetEdit, type ViewBinding, type ViewTargetEvent, type WindowedCellStatus,
} from '../src'
import { day, items, orderBars, orderRows, orders, planRange, planStart, sites, supplyEvents, timeZone, type SupplyEvent } from './adapters/periodTableSource'
import DemoPanel from './components/DemoPanel.vue'
import StatusLine from './components/StatusLine.vue'

type Measure = 'opening' | 'receipts' | 'demand' | 'balance' | 'fill'
type Row = TreeGridRow<{ short: string; itemId?: string; measure?: Measure }>
type Period = 'day' | 'week'

const measureNames: Record<Measure, string> = {
  opening: 'Opening balance', receipts: 'Receipts', demand: 'Demand', balance: 'Projected balance', fill: 'Fill rate',
}
const measures = Object.keys(measureNames) as Measure[]
const rows: Row[] = sites.flatMap(site => [
  { id: site.id, label: site.label, data: { short: site.label } },
  ...items.filter(item => item.siteId === site.id).flatMap((item): Row[] => [
    { id: item.id, parentId: site.id, label: item.label, data: { short: item.label, itemId: item.id } },
    // The accessible name says which item a measure belongs to; the row header slot shows the measure only.
    ...measures.map((measure): Row => ({
      id: `${item.id}:${measure}`, parentId: item.id, label: `${item.label} ${measureNames[measure].toLowerCase()}`,
      data: { short: measureNames[measure], itemId: item.id, measure },
    })),
  ]),
])
const rowById = new Map(rows.map(row => [row.id, row]))
const expandedIds = ref<string[]>([...sites.map(site => site.id), ...items.map(item => item.id)])

// Columns: local days and weeks (Monday starts) in Berlin.
const dayLabel = intlTimeFormatter({ timeZone, format: { weekday: 'short', month: 'short', day: 'numeric' } })
const shortDate = intlTimeFormatter({ timeZone, format: { month: 'short', day: 'numeric' } })
const bucketSets: Record<Period, TimeBucketColumn[]> = {
  day: createTimeBucketColumns(calendarBands(planRange, 'day', { timeZone }), { idPrefix: 'day:', label: period => dayLabel(period.start), width: 84 }),
  week: createTimeBucketColumns(calendarBands(planRange, 'week', { timeZone }), { idPrefix: 'week:', label: period => 'Week of ' + shortDate(period.start), width: 112 }),
}
const period = ref<Period>('day')
const buckets = computed(() => bucketSets[period.value])

// The chart and the window it reports. Until it has mounted, the table shows the first twelve days.
const presets = calendarZoomPresets(planRange, { timeZone, levels: ['days', 'weeks'], labels: { days: 'Day view', weeks: 'Week view' } })
const zoomLevel = ref('days')
const activePreset = computed(() => presets.find(preset => preset.id === zoomLevel.value) ?? presets[0]!)
const chartWindow = ref<TimelineVisibleWindow>()
const shown = shallowRef({ start: 0, end: 0 })
watch([chartWindow, buckets], () => {
  const next = timeBucketIndexRange(buckets.value, chartWindow.value ?? { start: planStart, end: planStart + 12 * day })
  if (next.start !== shown.value.start || next.end !== shown.value.end) shown.value = next
}, { immediate: true })
const shownBuckets = computed(() => buckets.value.slice(shown.value.start, shown.value.end))

// The simulated feed: whole days, delivered after a short delay, or held until "Hold the data feed" is cleared.
const hold = ref(false)
const held = new Set<() => void>()
const feed = useWindowedData<SupplyEvent>({
  view: computed(() => ({ start: planStart, end: shownBuckets.value.at(-1)?.end ?? planStart + day })),
  chunkSize: day,
  origin: planStart,
  itemRow: () => undefined,
  itemRange: event => ({ start: event.time, end: event.time + 1 }),
  load: (request, { signal }) => new Promise<SupplyEvent[]>((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const run = () => { timer = setTimeout(() => resolve(supplyEvents(request.start, request.end)), 350) }
    signal.addEventListener('abort', () => {
      clearTimeout(timer)
      held.delete(run)
      reject(new DOMException('Superseded', 'AbortError'))
    }, { once: true })
    if (hold.value) held.add(run)
    else run()
  }),
})
watch(hold, value => {
  if (value) return
  const runs = [...held]
  held.clear()
  for (const run of runs) run()
})
const statusOf = (start: number, end: number): WindowedCellStatus => {
  const coverage = feed.coverageOf({ start, end })
  return coverage.complete ? 'loaded' : coverage.status
}
const dayIndexOf = (time: number) => Math.floor((time - planStart) / day)

// Demand edits by item and day index, as one history entry per accepted proposal.
const history = useEditHistory<Readonly<Record<string, number>>>({})
const status = ref('Select a shortage cell to see the orders that feed it. Demand cells are editable in the day view.')

// Demo arithmetic over the loaded events: receipts, demand, the running balance and what was shipped from stock.
const quantities = computed(() => {
  const dayLoaded = (index: number) => statusOf(planStart + index * day, planStart + (index + 1) * day) === 'loaded'
  const out: (TimeBucketItem & { orderId?: string })[] = []
  for (const item of items) {
    const demand = new Map<number, SupplyEvent>()
    const events: SupplyEvent[] = []
    for (const event of feed.items.value) {
      if (event.itemId !== item.id) continue
      if (event.kind === 'demand') demand.set(dayIndexOf(event.time), event)
      else events.push(event)
    }
    for (const [key, quantity] of Object.entries(history.state.value)) {
      const [itemId, index] = key.split('@')
      if (itemId !== item.id || !dayLoaded(Number(index))) continue
      const time = planStart + Number(index) * day + 17 * 3_600_000
      demand.set(Number(index), { id: 'edit:' + key, itemId, kind: 'demand', time, quantity })
    }
    events.push(...demand.values())
    events.sort((a, b) => a.time - b.time)
    let balance = item.opening
    // The opening stock, just before the first period, seeds the carried balance.
    out.push({ rowId: item.id + ':balance', time: planStart - 1, value: balance })
    for (const event of events) {
      if (event.kind === 'receipt') {
        balance += event.quantity
        out.push({ rowId: item.id + ':receipts', time: event.time, value: event.quantity, orderId: event.orderId })
      } else {
        const shipped = Math.min(event.quantity, Math.max(0, balance))
        balance -= event.quantity
        out.push({ rowId: item.id + ':demand', time: event.time, value: event.quantity })
        out.push({ rowId: item.id + ':fill', time: event.time, value: shipped, denominator: event.quantity })
      }
      out.push({ rowId: item.id + ':balance', time: event.time, value: balance }, { rowId: item.id + ':low', time: event.time, value: balance })
    }
  }
  return out
})

const aggregateRows = items.flatMap(item => ['receipts', 'demand', 'balance', 'low', 'fill'].map(measure => `${item.id}:${measure}`))
const rules = Object.fromEntries(items.flatMap(item => [[item.id + ':balance', 'last'], [item.id + ':low', 'min'], [item.id + ':fill', 'ratio']] as const))
const aggregated = computed(() => {
  // Receipts and demand need their own period; balances and fill rates need every day from the plan start.
  const own = new Map(buckets.value.map(bucket => [bucket.id, statusOf(bucket.start, bucket.end)]))
  const prefix = new Map(buckets.value.map(bucket => [bucket.id, statusOf(planStart, bucket.end)]))
  const cells = aggregateTimeBuckets(quantities.value, buckets.value, {
    rowIds: aggregateRows, rules, carryForward: rowId => rowId.endsWith(':balance'),
    loaded: (rowId, bucket) => (/:(receipts|demand)$/.test(rowId) ? own : prefix).get(bucket.id)!,
  })
  return new Map(cells.map(cell => [`${cell.rowId}|${cell.columnId}`, cell]))
})

const number = new Intl.NumberFormat('en-US')
const loadedState = (cell: TimeBucketCell) => cell.status === 'loaded' || cell.status === 'loaded-empty'
const content = (cell: TimeBucketCell | undefined, extra: TreeGridCellContent = {}): TreeGridCellContent => {
  if (!cell || !loadedState(cell)) return { status: (cell?.status ?? 'unloaded') as 'unloaded' | 'loading' | 'failed', editable: false }
  return cell.value === null ? { status: 'none', editable: false } : { value: cell.value, ...extra }
}
const order = (id: string): EntityRef => ({ kind: 'order', id })
const cells = computed<TreeGridCell[]>(() => {
  const result: TreeGridCell[] = []
  const all = buckets.value
  shownBuckets.value.forEach((bucket, offset) => {
    const index = shown.value.start + offset
    for (const item of items) {
      const cell = (measure: string, at = bucket) => aggregated.value.get(`${item.id}:${measure}|${at.id}`)
      const put = (measure: Measure, value: TreeGridCellContent) => result.push({ rowId: `${item.id}:${measure}`, columnId: bucket.id, ...value })
      const balance = cell('balance')!
      // Opening balance: the balance at the end of the previous period, or the opening stock.
      const previous = index > 0 ? cell('balance', all[index - 1]) : undefined
      if (!loadedState(balance)) put('opening', content(balance))
      else put('opening', previous ? content(previous) : { value: item.opening })
      const receipts = orders.filter(o => o.itemId === item.id && o.end >= bucket.start && o.end < bucket.end).map(o => order(o.id))
      put('receipts', content(cell('receipts'), { entities: receipts }))
      put('demand', content(cell('demand')))
      // A balance cell is fed by the orders of its item that are running or arrive in the period.
      const feeding = orders.filter(o => o.itemId === item.id && o.start < bucket.end && o.end > bucket.start).map(o => order(o.id))
      const low = cell('low')
      let mark: TreeGridCellContent = {}
      if (balance.value !== null && balance.value < 0) mark = { tone: 'amber', label: `${number.format(balance.value)} short` }
      else if (balance.value !== null && low?.value != null && low.value < 0) {
        mark = { tone: 'amber', label: `${number.format(balance.value)} · low ${number.format(low.value)}` }
      }
      put('balance', content(balance, { entities: feeding, ...mark }))
      const fill = cell('fill')
      put('fill', content(fill, fill?.value != null ? { label: Math.round(fill.value * 100) + '%' } : {}))
    }
  })
  return result
})
const isDemandRow = (row: Row) => row.data?.measure === 'demand'
const columns = computed<TreeGridColumn<Row>[]>(() => shownBuckets.value.map(bucket => ({
  id: bucket.id, label: bucket.label, width: bucket.width,
  editor: { kind: 'number', min: 0, integer: true }, editable: row => period.value === 'day' && isDemandRow(row),
})))

// Edits.
const bucketById = computed(() => new Map(buckets.value.map(bucket => [bucket.id, bucket])))
function applyDemand(edits: readonly TreeGridCellEdit[], text: string) {
  const next = { ...history.state.value }
  for (const edit of edits) {
    const row = rowById.get(edit.rowId), bucket = bucketById.value.get(edit.columnId)
    if (!row || !isDemandRow(row) || !bucket) continue
    next[`${row.data!.itemId}@${dayIndexOf(bucket.start)}`] = typeof edit.after === 'number' ? edit.after : 0
  }
  history.commit(next)
  status.value = text
}
function cellEdit(change: TreeGridCellEdit) {
  const bucket = bucketById.value.get(change.columnId)
  applyDemand([change], `${rowById.get(change.rowId)?.label} on ${bucket?.label}: ${String(change.before)} → ${String(change.after ?? 0)}. Balances recalculated.`)
}
function sheetEdit(change: TreeGridSheetEdit) {
  applyDemand(change.edits, `${change.action}: ${change.edits.length} demand cells changed. Balances recalculated.`)
}
function rejected(_change: unknown, reason: string) { status.value = 'Rejected: ' + reason }
function cancelled(event: TreeGridEditCancel) { status.value = `Edit cancelled (${event.reason}).` }
function undo() { history.undo(); status.value = 'Undone.' }
function redo() { history.redo(); status.value = 'Redone.' }

// Linked selection: orders are entities, bound to their bars.
const bindings: ViewBinding[] = orders.map(o => ({ entity: order(o.id), target: { view: 'timeline', kind: 'bar', id: o.id } }))
const linked = useLinkedSelection({ bindings })
function activateCell(activation: TreeGridActivation) {
  linked.selectEntities(activation.entities, { source: 'period table' })
  const where = `${rowById.get(activation.rowId)?.label}${activation.columnId ? ', ' + bucketById.value.get(activation.columnId)?.label : ''}`
  const ids = activation.entities.map(entity => entity.id)
  status.value = ids.length ? `${where}: fed by ${ids.join(', ')}.` : `${where}: no orders feed this cell.`
}
function activateBar(event: ViewTargetEvent) {
  if (event.target.view !== 'timeline' || event.target.kind !== 'bar') return
  linked.select('timeline', [event.target])
  status.value = `${event.target.id} selected; its cells are outlined in the table.`
}
const highlightedCells = computed(() => {
  const entities = linked.selectedEntities.value
  return entities.length ? matchTreeGridEntities({ rows, columns: columns.value, cells: cells.value }, entities).cells : []
})

const periodText = computed(() => {
  const list = shownBuckets.value
  if (!list.length) return 'No periods in the chart window.'
  return `Showing ${list.length} ${period.value === 'day' ? 'days' : 'weeks'}: ${list[0]!.label} to ${list.at(-1)!.label}.`
})
const feedText = computed(() => {
  let loaded = 0
  for (let index = 0; index < 35; index++) if (statusOf(planStart + index * day, planStart + (index + 1) * day) === 'loaded') loaded++
  const waiting = feed.pending.value ? (hold.value ? ' Feed held: new days wait.' : ' Loading…') : ''
  return `Loaded ${loaded} of 35 days.${waiting}`
})
</script>

<template>
  <DemoPanel title-id="period-table-title" title="Period table" subtitle="Stock by site, item and measure against days or weeks in Europe/Berlin, following the visible window of the supply orders below. Amber cells are shortages; select one to highlight the orders that feed it.">
    <template #options>
      <fieldset class="period-toggle">
        <legend class="period-nowrap">Table periods</legend>
        <label><input v-model="period" type="radio" name="period-table-period" value="day"> Days</label>
        <label><input v-model="period" type="radio" name="period-table-period" value="week"> Weeks</label>
      </fieldset>
      <label class="period-nowrap"><input v-model="hold" type="checkbox"> Hold the data feed</label>
      <button type="button" :disabled="!history.canUndo.value" @click="undo">Undo</button>
      <button type="button" :disabled="!history.canRedo.value" @click="redo">Redo</button>
    </template>
    <TreeGrid v-model:expanded-ids="expandedIds" :rows="rows" :columns="columns" :cells="cells" :height="420" :tree-column-width="200"
      editable spreadsheet :highlighted-cells="highlightedCells" :labels="{ grid: 'Period table', treeColumn: 'Site, item and measure' }"
      @cell-activate="activateCell" @cell-edit="cellEdit" @cell-edit-rejected="rejected" @sheet-edit="sheetEdit"
      @sheet-edit-rejected="rejected" @edit-cancel="cancelled">
      <template #row-header="{ row }"><span class="vw-tree-grid-label">{{ row.data?.short ?? row.label }}</span></template>
    </TreeGrid>
    <StatusLine label="Period table status">{{ status }}</StatusLine>
    <p class="hint period-lines">
      <output aria-label="Visible period">{{ periodText }}</output>
      <output aria-label="Data feed">{{ feedText }}</output>
    </p>
    <GanttChart :rows="orderRows" :bars="orderBars" :range="planRange" readonly :height="210" :row-height="44"
      :zoom-presets="presets" :zoom-preset="zoomLevel" :format-time="activePreset.formatTime"
      :selected-ids="linked.timeline.value.selectedBarIds" :highlighted-bar-ids="linked.timeline.value.highlightedBarIds"
      :labels="{ region: 'Supply orders' }"
      @update:zoom-preset="zoomLevel = $event" @visible-window-change="chartWindow = $event" @target-activate="activateBar">
      <template #row-heading>Orders</template>
      <template #legend><span class="hint">An order's quantity arrives when its bar ends. Scroll or zoom to move the table's periods.</span></template>
    </GanttChart>
  </DemoPanel>
</template>

<style scoped>
.period-toggle { display: flex; gap: 10px; align-items: center; border: 0; margin: 0; padding: 0; }
.period-toggle legend { float: left; margin-right: 6px; padding: 0; }
.period-nowrap { white-space: nowrap; }
.period-lines { display: flex; flex-wrap: wrap; gap: 6px 18px; margin: 6px 0 10px; }
</style>
