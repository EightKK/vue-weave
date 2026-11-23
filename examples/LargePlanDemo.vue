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
import { useDemoLocale } from './i18n'

const { t, labels, isJapanese, intlLocale } = useDemoLocale()
// The source names rows, jobs and parts in English; a Japanese page shows the same names in Japanese.
const localName = (text: string) => isJapanese.value
  ? text.replace(/^Area /, 'エリア ').replace(/^Line /, 'ライン ').replace(/^Job /, 'ジョブ ').replace(/^Part /, '部品 ').replace(/^Spare$/, '予備')
  : text
const rows = isJapanese.value ? planRows.map(row => ({ ...row, label: localName(row.label), ...(row.detail ? { detail: localName(row.detail) } : {}) })) : planRows
const number = (value: number) => value.toLocaleString(intlLocale.value)

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

const statusText: Record<WindowedCellStatus, string> = t({
  en: { unloaded: 'Not loaded', loading: 'Loading…', 'loaded-empty': 'Loaded, no tasks in view', loaded: 'Loaded', failed: 'Failed to load' },
  ja: { unloaded: '未取得', loading: '読み込み中…', 'loaded-empty': '取得済み(表示範囲にタスクなし)', loaded: '取得済み', failed: '読み込みに失敗' },
})
const fmt = (time: number) => new Date(time).toISOString().slice(5, 10)
const formatTime = (time: number) => new Date(time).toISOString().slice(5, 16).replace('T', ' ')
const total = computed(() => totalBars(filter.value))
const loadedShare = computed(() => (items.value.length / total.value * 100).toFixed(1))
const windowText = computed(() => view.value
  ? t({ en: `${fmt(view.value.start)} to ${fmt(view.value.end)}, ${view.value.rowIds.length} rows`, ja: `${fmt(view.value.start)} から ${fmt(view.value.end)}、${view.value.rowIds.length} 行` })
  : t({ en: 'not reported yet', ja: 'まだ通知されていません' }))
const shownItems = computed(() => isJapanese.value ? items.value.map(bar => ({ ...bar, label: localName(bar.label) })) : items.value)
const shownGraphNodes = computed(() => isJapanese.value ? graphView.value.nodes.map(node => ({ ...node, label: localName(node.label) })) : graphView.value.nodes)
const rowLabel = new Map(rows.map(row => [row.id, row.label]))
// The status of each rendered row inside the reported window (only rows with lines; areas have no tasks of their own).
const rowStatuses = computed(() => {
  const current = view.value
  if (!current) return []
  return current.rowIds.filter(id => id.startsWith('r')).map(id => ({
    id, label: rowLabel.get(id) ?? id, status: plan.coverageOf({ start: current.start, end: current.end, rowIds: [id] }).status,
  }))
})
const errorText = computed(() => {
  if (!error.value) return ''
  const message = error.value.error instanceof Error ? error.value.error.message : String(error.value.error)
  return t({ en: `${message}. The tasks loaded so far stay on display.`, ja: `${message}。読み込み済みのタスクは表示したままです。` })
})

// Graph: start from Part 1 and load neighbours one hop at a time.
const graph = shallowRef(createGraphExpansion<NetworkNode, GraphEdge>({ nodes: [partNode(0)] }))
const graphView = computed(() => graphExpansionView(graph.value))
const selectedPart = ref<string | undefined>('p0')
const graphError = ref('')
const selectedLabel = computed(() => {
  const label = selectedPart.value ? graph.value.nodes.get(selectedPart.value)?.label : undefined
  return label === undefined ? undefined : localName(label)
})
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

// A click on the empty canvas or Escape in the graph clears the selected part.
function clearSelection() {
  selectedPart.value = undefined
}
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
    const name = localName(graph.value.nodes.get(id)?.label ?? id), message = reason instanceof Error ? reason.message : String(reason)
    graphError.value = t({ en: `Could not load the neighbours of ${name}: ${message}.`, ja: `${name} の隣接部品を読み込めませんでした: ${message}。` })
  }
}
</script>

<template>
  <DemoPanel title-id="large-plan-title" :title="t({ en: 'Large plan with partial loading', ja: '大規模計画の部分読み込み' })" :subtitle="t({ en: 'Only the weeks and rows on screen are fetched; scrolling, zooming and collapsing load more.', ja: '画面に見えている週と行だけを取得します。スクロール、拡大縮小、折りたたみに応じて追加で読み込みます。' })">
    <div class="options large-plan-options" role="group" :aria-label="t({ en: 'Simulated data source', ja: '模擬データソース' })">
      <label>{{ t({ en: 'Response time', ja: '応答時間' }) }}
        <select v-model="speed" :aria-label="t({ en: 'Response time', ja: '応答時間' })">
          <option value="fast">{{ t({ en: 'Fast (150 ms)', ja: '速い(150 ミリ秒)' }) }}</option>
          <option value="slow">{{ t({ en: 'Slow (1.5 s)', ja: '遅い(1.5 秒)' }) }}</option>
        </select>
      </label>
      <label><input v-model="failing" type="checkbox"> {{ t({ en: 'Data source fails', ja: 'データソースを失敗させる' }) }}</label>
      <label>{{ t({ en: 'Filter', ja: '絞り込み' }) }}
        <select v-model="filter" :aria-label="t({ en: 'Filter', ja: '絞り込み' })">
          <option value="all">{{ t({ en: 'All jobs', ja: 'すべてのジョブ' }) }}</option>
          <option value="critical">{{ t({ en: 'Critical jobs only', ja: 'クリティカルなジョブのみ' }) }}</option>
        </select>
      </label>
      <button type="button" :disabled="coverage.failed === 0" @click="plan.retry()">{{ t({ en: 'Retry', ja: '再試行' }) }}</button>
    </div>
    <p class="status" role="status" :aria-label="t({ en: 'Window status', ja: '表示範囲の状態' })">
      <span>{{ statusText[status] }}</span> · {{ t({ en: 'window', ja: '表示範囲' }) }} <output :aria-label="t({ en: 'Visible window', ja: '表示範囲' })">{{ windowText }}</output> ·
      <span>{{ complete ? t({ en: 'window complete', ja: '表示範囲は取得済み' }) : t({ en: `${coverage.loaded + coverage.empty} of ${coverage.total} cells loaded`, ja: `${coverage.total} セル中 ${coverage.loaded + coverage.empty} セルを取得済み` }) }}</span>
    </p>
    <p v-if="errorText" class="large-plan-error" role="alert">{{ errorText }}</p>
    <p v-if="!isJapanese" class="hint">
      Loaded <output aria-label="Loaded bars">{{ items.length.toLocaleString('en-US') }}</output> of
      <output aria-label="Total bars">{{ total.toLocaleString('en-US') }}</output> bars ({{ loadedShare }}%) ·
      <output aria-label="Requests">{{ counters.requests }}</output> requests, {{ counters.aborted }} aborted, {{ counters.failed }} failed ·
      {{ counters.received.toLocaleString('en-US') }} bars received ({{ (counters.received - items.length).toLocaleString('en-US') }} duplicates across windows dropped) ·
      <output aria-label="Dangling links">{{ danglingLinks.length }}</output> links waiting for their other end.
      Demo counters, not a benchmark. Totals and deadlines need the complete plan, so this view computes none.
    </p>
    <p v-else class="hint">
      <output aria-label="読み込んだバー">{{ number(items.length) }}</output> /
      <output aria-label="バーの総数">{{ number(total) }}</output> 本のバーを読み込み済み({{ loadedShare }}%)·
      要求 <output aria-label="要求">{{ counters.requests }}</output> 件、中止 {{ counters.aborted }} 件、失敗 {{ counters.failed }} 件 ·
      受信したバー {{ number(counters.received) }} 本(範囲の重なりで除いた重複 {{ number(counters.received - items.length) }} 本)·
      相手側を待つリンク <output aria-label="未接続のリンク">{{ danglingLinks.length }}</output> 本。
      数値はデモ用の計数で、ベンチマークではありません。合計や期限には計画全体が必要なため、この表示では計算しません。
    </p>
    <GanttChart :rows="rows" :bars="shownItems" :dependencies="resolvedLinks" :range="planRange" readonly
      :pixels-per-unit="80 / day" :tick-steps="[day, week]" :snap="hour" :format-time="formatTime" :height="380"
      :labels="{ ...labels.gantt, region: t({ en: 'Large plan timeline', ja: '大規模計画のタイムライン' }) }" @visible-window-change="view = $event" />
    <p class="hint">{{ t({ en: 'Rendered rows:', ja: '描画中の行:' }) }}</p>
    <ul class="large-plan-rows" :aria-label="t({ en: 'Row load status', ja: '行の読み込み状態' })">
      <li v-for="row in rowStatuses" :key="row.id">{{ row.label }}: {{ statusText[row.status] }}</li>
    </ul>

    <h3 id="large-graph-title">{{ t({ en: 'Neighbourhood expansion', ja: '隣接部品の展開' }) }}</h3>
    <p class="hint">{{ t({
      en: `A network of ${partCount.toLocaleString('en-US')} parts. Select a loaded part and load its direct neighbours; by default the layout is recomputed after each hop and parts can move; with Keep positions when expanding, each page is placed around the parts already shown and they stay where they are.`,
      ja: `${number(partCount)} 部品のネットワークです。読み込み済みの部品を選び、直接つながる部品を読み込みます。既定では1ホップごとにレイアウトを計算し直すため部品が動きます。「展開時に位置を保つ」をオンにすると、新しい部品を表示済みの部品の周りに置き、表示済みの部品は動きません。`,
    }) }}</p>
    <div class="options large-plan-options" role="group" :aria-label="t({ en: 'Graph loading', ja: 'グラフの読み込み' })">
      <button type="button" :disabled="!canExpand" @click="expandSelected">{{ t({ en: 'Expand neighbours', ja: '隣接部品を展開' }) }}</button>
      <label><input v-model="keepPositions" type="checkbox"> {{ t({ en: 'Keep positions when expanding', ja: '展開時に位置を保つ' }) }}</label>
      <span class="hint">{{ t({ en: 'Selected:', ja: '選択中:' }) }} <output :aria-label="t({ en: 'Selected part', ja: '選択中の部品' })">{{ selectedLabel ?? t({ en: 'none', ja: 'なし' }) }}</output></span>
      <span v-if="!isJapanese" class="hint">
        <output aria-label="Loaded parts">{{ graphView.nodes.length }}</output> of {{ partCount.toLocaleString('en-US') }} parts ·
        <output aria-label="Shown links">{{ graphView.edges.length }}</output> links shown ·
        <output aria-label="Pending links">{{ graphView.dangling.length }}</output> waiting ·
        {{ graph.expandedIds.size }} expanded{{ graph.pendingIds.size ? ' · loading…' : '' }}
      </span>
      <span v-else class="hint">
        <output aria-label="読み込んだ部品">{{ graphView.nodes.length }}</output> / {{ number(partCount) }} 部品 ·
        表示中のリンク <output aria-label="表示中のリンク">{{ graphView.edges.length }}</output> ·
        待機中 <output aria-label="待機中のリンク">{{ graphView.dangling.length }}</output> ·
        展開済み {{ graph.expandedIds.size }}{{ graph.pendingIds.size ? ' · 読み込み中…' : '' }}
      </span>
      <span v-if="keepPositions" class="hint">{{ t({ en: 'Largest move of a shown part:', ja: '表示済みの部品の最大移動量:' }) }}
        <output :aria-label="t({ en: 'Largest move of shown parts', ja: '表示済みの部品の最大移動量' })">{{ largestMove === undefined ? t({ en: 'none yet', ja: 'まだありません' }) : largestMove }}</output></span>
    </div>
    <p v-if="graphError" class="large-plan-error" role="alert">{{ graphError }}</p>
    <NetworkGraph ref="graphRef" v-model:selected-id="selectedPart" :nodes="shownGraphNodes" :edges="graphView.edges" :height="300"
      :layout="keepPositions ? keepLayout : undefined" :labels="{ ...labels.graph, region: t({ en: 'Neighbourhood graph', ja: '隣接部品のグラフ' }) }"
      @background-click="clearSelection" @idle-escape="clearSelection" />
  </DemoPanel>
</template>

<style scoped>
.large-plan-options { flex-wrap: wrap; gap: 10px 16px; margin-bottom: 8px; align-items: center; }
.large-plan-error { margin: 8px 0; padding: 6px 10px; border: 1px solid var(--vw-critical, #b4441c); border-radius: 6px; font-size: 12px; }
.large-plan-rows { columns: 3 14em; margin: 4px 0 16px; padding-left: 18px; font-size: 12px; color: var(--vw-muted, #4f6574); }
</style>
