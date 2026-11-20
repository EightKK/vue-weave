<script setup lang="ts">
// Partial (windowed) loading of a large, read-only plan. GanttChart reports the window it renders
// (`visible-window-change`); `useWindowedData` turns it into week-aligned requests for the visible rows, aborts the ones a
// scroll has superseded and merges the answers by ID. The graph below loads a 5,000-part network one hop at a time with
// the graph expansion helpers. The data source is simulated (fixed delays, an induced failure toggle, no network), and
// the counters are demo counters, not benchmarks. With "Keep positions when expanding", each page is placed around the
// parts already shown with `layoutGraphIncrementally`, so they do not move.
import { computed, ref, shallowRef, watch } from 'vue'
import {
  GanttChart, NetworkGraph, beginGraphExpansion, cancelGraphExpansion, createGraphExpansion, graphExpansionView, graphLayoutChangeMetrics,
  layoutGraphIncrementally, layoutLayeredGraph, mergeGraphExpansionPage, useWindowedData, type GraphEdge, type GraphIncrementalLayout,
  type GraphLayoutFunction, type NetworkGraphExposed, type NetworkNode, type TimelineDependency, type TimelineVisibleWindow,
  type WindowedCellStatus,
} from '../src'
import {
  day, hour, partCount, partNode, planRange, planRows, queryNeighbours, queryPlan, simulate, totalBars, week,
  type PlanBar, type PlanFilter,
} from './adapters/largePlanSource'
import DemoPanel from './components/DemoPanel.vue'

const speed = ref<'fast' | 'slow'>('fast')
const failing = ref(false)
const filter = ref<PlanFilter>('all')
const delay = () => speed.value === 'fast' ? 150 : 1500

// The rendered window the chart reports; undefined until it has mounted and measured itself.
const view = ref<TimelineVisibleWindow>()
const counters = ref({ requests: 0, aborted: 0, failed: 0, received: 0 })

const plan = useWindowedData<PlanBar, TimelineDependency>({
  view,
  condition: filter,
  chunkSize: week,
  origin: planRange.start,
  padding: day,
  load: (request, { signal }) => {
    counters.value = { ...counters.value, requests: counters.value.requests + 1 }
    const condition = request.condition as PlanFilter
    return simulate(() => queryPlan(request, condition), { delay: delay(), failing: () => failing.value, signal }).then((page) => {
      counters.value = { ...counters.value, received: counters.value.received + page.items.length }
      return page
    }, (error: unknown) => {
      if (signal.aborted) counters.value = { ...counters.value, aborted: counters.value.aborted + 1 }
      else counters.value = { ...counters.value, failed: counters.value.failed + 1 }
      throw error
    })
  },
})
const { items, resolvedLinks, danglingLinks, coverage, status, complete, error } = plan

const statusText: Record<WindowedCellStatus, string> = {
  unloaded: 'Not loaded',
  loading: 'Loading…',
  'loaded-empty': 'Loaded, no tasks in view',
  loaded: 'Loaded',
  failed: 'Failed to load',
}
const fmt = (time: number) => new Date(time).toISOString().slice(5, 10)
const formatTime = (time: number) => new Date(time).toISOString().slice(5, 16).replace('T', ' ')
const total = computed(() => totalBars(filter.value))
const loadedShare = computed(() => (items.value.length / total.value * 100).toFixed(1))
const windowText = computed(() => view.value
  ? `${fmt(view.value.start)} to ${fmt(view.value.end)}, ${view.value.rowIds.length} rows`
  : 'not reported yet')
const rowLabel = new Map(planRows.map(row => [row.id, row.label]))
// The status of each rendered row inside the reported window (only rows with lines; areas have no tasks of their own).
const rowStatuses = computed(() => {
  const current = view.value
  if (!current) return []
  return current.rowIds.filter(id => id.startsWith('r')).map(id => ({
    id, label: rowLabel.get(id) ?? id, status: plan.coverageOf({ start: current.start, end: current.end, rowIds: [id] }).status,
  }))
})
const errorText = computed(() => error.value
  ? `${error.value.error instanceof Error ? error.value.error.message : String(error.value.error)}. The tasks loaded so far stay on display.`
  : '')

// Graph: start from Part 1 and load neighbours one hop at a time.
const graph = shallowRef(createGraphExpansion<NetworkNode, GraphEdge>({ nodes: [partNode(0)] }))
const graphView = computed(() => graphExpansionView(graph.value))
const selectedPart = ref<string | undefined>('p0')
const graphError = ref('')
const selectedLabel = computed(() => selectedPart.value ? graph.value.nodes.get(selectedPart.value)?.label : undefined)
const canExpand = computed(() => !!selectedPart.value && graph.value.nodes.has(selectedPart.value)
  && !graph.value.expandedIds.has(selectedPart.value) && !graph.value.pendingIds.has(selectedPart.value))

// Stable expansion (opt-in). `kept` is the layout on display; every new page is placed around it, and the largest move
// of a part that was already shown is measured with `graphLayoutChangeMetrics` (it stays 0).
const graphRef = ref<NetworkGraphExposed>()
const keepPositions = ref(false)
const kept = shallowRef<GraphIncrementalLayout>()
const largestMove = ref<number>()
const keepLayout: GraphLayoutFunction = (nodes, edges) =>
  layoutGraphIncrementally(nodes, edges, kept.value?.boxes ?? new Map(), { previousLayout: kept.value })
watch(keepPositions, (on) => {
  largestMove.value = undefined
  if (!on) {
    kept.value = undefined
    return
  }
  // Start from the layout the graph shows now, so switching the option on moves nothing.
  const { nodes, edges } = graphView.value
  const shown = layoutLayeredGraph(nodes, edges)
  kept.value = layoutGraphIncrementally(nodes, edges, shown.boxes, { previousLayout: shown })
})
watch(graphView, ({ nodes, edges }) => {
  const before = kept.value
  if (!before || nodes.length === before.boxes.size) return
  const next = layoutGraphIncrementally(nodes, edges, before.boxes, { previousLayout: before })
  largestMove.value = graphLayoutChangeMetrics(before.boxes, next).maxDisplacement
  kept.value = next
})

async function expandSelected() {
  const id = selectedPart.value
  if (!id || !canExpand.value) return
  graphError.value = ''
  // An automatically fitted camera re-fits to a larger graph; pin it so the shown parts also keep their place on screen.
  if (keepPositions.value && graphRef.value) graphRef.value.setViewport(graphRef.value.getViewport())
  const before = graph.value
  graph.value = beginGraphExpansion(before, [id])
  try {
    const page = await simulate(() => queryNeighbours(id), { delay: delay(), failing: () => failing.value })
    graph.value = mergeGraphExpansionPage(graph.value, page, [id])
  } catch (reason) {
    graph.value = cancelGraphExpansion(graph.value, [id])
    graphError.value = `Could not load the neighbours of ${graph.value.nodes.get(id)?.label ?? id}: ${reason instanceof Error ? reason.message : String(reason)}.`
  }
}
</script>

<template>
  <DemoPanel title-id="large-plan-title" title="Large plan with partial loading" subtitle="Only the weeks and rows on screen are fetched; scrolling, zooming and collapsing load more.">
    <div class="options large-plan-options" role="group" aria-label="Simulated data source">
      <label>Response time
        <select v-model="speed" aria-label="Response time">
          <option value="fast">Fast (150 ms)</option>
          <option value="slow">Slow (1.5 s)</option>
        </select>
      </label>
      <label><input v-model="failing" type="checkbox"> Data source fails</label>
      <label>Filter
        <select v-model="filter" aria-label="Filter">
          <option value="all">All jobs</option>
          <option value="critical">Critical jobs only</option>
        </select>
      </label>
      <button type="button" :disabled="coverage.failed === 0" @click="plan.retry()">Retry</button>
    </div>
    <p class="status" role="status" aria-label="Window status">
      <span>{{ statusText[status] }}</span> · window <output aria-label="Visible window">{{ windowText }}</output> ·
      <span>{{ complete ? 'window complete' : `${coverage.loaded + coverage.empty} of ${coverage.total} cells loaded` }}</span>
    </p>
    <p v-if="errorText" class="large-plan-error" role="alert">{{ errorText }}</p>
    <p class="hint">
      Loaded <output aria-label="Loaded bars">{{ items.length.toLocaleString('en-US') }}</output> of
      <output aria-label="Total bars">{{ total.toLocaleString('en-US') }}</output> bars ({{ loadedShare }}%) ·
      <output aria-label="Requests">{{ counters.requests }}</output> requests, {{ counters.aborted }} aborted, {{ counters.failed }} failed ·
      {{ counters.received.toLocaleString('en-US') }} bars received ({{ (counters.received - items.length).toLocaleString('en-US') }} duplicates across windows dropped) ·
      <output aria-label="Dangling links">{{ danglingLinks.length }}</output> links waiting for their other end.
      Demo counters, not a benchmark. Totals and deadlines need the complete plan, so this view computes none.
    </p>
    <GanttChart :rows="planRows" :bars="items" :dependencies="resolvedLinks" :range="planRange" readonly
      :pixels-per-unit="80 / day" :tick-steps="[day, week]" :snap="hour" :format-time="formatTime" :height="380"
      :labels="{ region: 'Large plan timeline' }" @visible-window-change="view = $event" />
    <p class="hint">Rendered rows:</p>
    <ul class="large-plan-rows" aria-label="Row load status">
      <li v-for="row in rowStatuses" :key="row.id">{{ row.label }}: {{ statusText[row.status] }}</li>
    </ul>

    <h3 id="large-graph-title">Neighbourhood expansion</h3>
    <p class="hint">A network of {{ partCount.toLocaleString('en-US') }} parts. Select a loaded part and load its direct neighbours;
      by default the layout is recomputed after each hop and parts can move; with Keep positions when expanding, each page is
      placed around the parts already shown and they stay where they are.</p>
    <div class="options large-plan-options" role="group" aria-label="Graph loading">
      <button type="button" :disabled="!canExpand" @click="expandSelected">Expand neighbours</button>
      <label><input v-model="keepPositions" type="checkbox"> Keep positions when expanding</label>
      <span class="hint">Selected: <output aria-label="Selected part">{{ selectedLabel ?? 'none' }}</output></span>
      <span class="hint">
        <output aria-label="Loaded parts">{{ graphView.nodes.length }}</output> of {{ partCount.toLocaleString('en-US') }} parts ·
        <output aria-label="Shown links">{{ graphView.edges.length }}</output> links shown ·
        <output aria-label="Pending links">{{ graphView.dangling.length }}</output> waiting ·
        {{ graph.expandedIds.size }} expanded{{ graph.pendingIds.size ? ' · loading…' : '' }}
      </span>
      <span v-if="keepPositions" class="hint">Largest move of a shown part:
        <output aria-label="Largest move of shown parts">{{ largestMove === undefined ? 'none yet' : largestMove }}</output></span>
    </div>
    <p v-if="graphError" class="large-plan-error" role="alert">{{ graphError }}</p>
    <NetworkGraph ref="graphRef" v-model:selected-id="selectedPart" :nodes="graphView.nodes" :edges="graphView.edges" :height="300"
      :layout="keepPositions ? keepLayout : undefined" :labels="{ region: 'Neighbourhood graph' }" />
  </DemoPanel>
</template>

<style scoped>
.large-plan-options { flex-wrap: wrap; gap: 10px 16px; margin-bottom: 8px; align-items: center; }
.large-plan-error { margin: 8px 0; padding: 6px 10px; border: 1px solid var(--vw-critical, #b4441c); border-radius: 6px; font-size: 12px; }
.large-plan-rows { columns: 3 14em; margin: 4px 0 16px; padding-left: 18px; font-size: 12px; color: var(--vw-muted, #4f6574); }
</style>
