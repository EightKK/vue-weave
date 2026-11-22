<script setup lang="ts">
// Asynchronous layout with `useAsyncGraphLayout`. The "engine" is the built-in layout run asynchronously (in this
// thread or in a Web Worker); the controls delay, reorder or fail its responses. NetworkGraph always receives the whole
// display frame (nodes, links, groups, collapsed groups and the layout of that input) and a `layout` function of stable
// identity, so a late response never mixes an old layout with new data and never re-fits the camera.
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import {
  NetworkGraph, layoutLayeredGraph, useAsyncGraphLayout,
  type GraphEdge, type GraphGesture, type GraphGestureEnd, type GraphNodeMove, type NetworkGroup, type NetworkNode, type GraphRoutingPolicy,
} from '../src'
import { createControlledAdapter, createWorkerComputation, inThreadComputation } from './adapters/asyncLayout'
import DemoPanel from './components/DemoPanel.vue'
import { useDemoLocale } from './i18n'

const { t, labels: componentLabels } = useDemoLocale()

const settings = { nodeWidth: 150, nodeHeight: 52 }
const port = (id: string, side: 'left' | 'right') => ({ id, side, direction: side === 'left' ? 'target' as const : 'source' as const })
const labels: Record<string, string> = t({
  en: { a: 'Receive', b: 'Inspect', c: 'Stage', d: 'Cut', e: 'Weld', f: 'Paint', g: 'Pack', h: 'Ship' },
  ja: { a: '受入', b: '検査', c: '仮置き', d: '切断', e: '溶接', f: '塗装', g: '梱包', h: '出荷' },
})
const nodes: NetworkNode[] = Object.entries(labels).map(([id, label]) => ({
  id, label, ports: [port('in', 'left'), port('out', 'right')], tone: id < 'd' ? 'teal' : id < 'g' ? 'blue' : 'violet',
}))
const link = (id: string, from: string, to: string): GraphEdge => ({ id, from, to, fromPort: 'out', toPort: 'in' })
const baseEdges = [
  link('a-b', 'a', 'b'), link('b-c', 'b', 'c'), link('c-d', 'c', 'd'), link('c-e', 'c', 'e'),
  link('d-f', 'd', 'f'), link('e-f', 'e', 'f'), link('f-g', 'f', 'g'), link('g-h', 'g', 'h'),
]
const shortcut = link('a-g', 'a', 'g')
const groups: NetworkGroup[] = [
  { id: 'intake', label: t({ en: 'Intake', ja: '受入工程' }), nodeIds: ['a', 'b', 'c'] },
  { id: 'assembly', label: t({ en: 'Assembly', ja: '組立工程' }), nodeIds: ['d', 'e', 'f'] },
]

// The application state the layout depends on. Collapsing is controlled: the graph shows the collapsed set of the
// display frame, and its toggles change the desired set here.
const collapsed = ref<ReadonlySet<string>>(new Set())
const withShortcut = ref(false)
const edges = computed(() => withShortcut.value ? [...baseEdges, shortcut] : baseEdges)

const speed = ref<'fast' | 'slow' | 'reverse'>('fast')
const failing = ref(false)
const useWorker = ref(false)
const routing = ref<GraphRoutingPolicy>('builtin')
const log = ref<string[]>([])

let worker: Worker | undefined
function workerComputation() {
  worker ??= new Worker(new URL('./workers/graphLayout.worker.ts', import.meta.url), { type: 'module' })
  return createWorkerComputation(worker)
}
onBeforeUnmount(() => worker?.terminate())

let lastSequence = 0, reverseFrom = 0
watch(speed, () => { reverseFrom = lastSequence })
const adapter = createControlledAdapter(
  (request, signal) => useWorker.value ? workerComputation()(request, signal) : inThreadComputation(request, signal),
  {
    // "reverse": the earlier a request was made after choosing it, the later it is answered.
    delay: sequence => {
      lastSequence = sequence
      return speed.value === 'fast' ? 60 : speed.value === 'slow' ? 1200 : Math.max(60, 1600 - (sequence - reverseFrom) * 500)
    },
    fail: () => failing.value,
    settled: event => {
      const entry = t({
        en: `#${event.sequence} ${event.scope} ${event.outcome === 'discarded' ? 'arrived late and was discarded (superseded)' : event.outcome} after ${event.delay} ms`,
        ja: `#${event.sequence} ${event.scope}: ${event.delay} ms 後に${event.outcome === 'discarded' ? '遅れて届いたため破棄(新しい要求に置き換え済み)' : event.outcome === 'ready' ? '完了' : event.outcome === 'failed' ? '失敗' : event.outcome}`,
      })
      log.value = [...log.value.slice(-5), entry]
    },
  },
)

// NetworkGraph reports every gesture a new layout would cancel (drag, pan, connection, box selection) with
// `gesture-start` and, exactly once, `gesture-end`, after the proposal. `gestureListeners` turns them into the
// composable's gesture state, so results that arrive meanwhile wait (`deferred`) instead of cancelling the gesture.
const lastMove = ref('')
// The demo also shows the gesture events it receives.
const gestureText = ref(t({ en: 'none', ja: 'なし' }))
function gestureStarted(gesture: GraphGesture) {
  gestureText.value = t({ en: `${gesture.kind} (${gesture.source}) in progress`, ja: `${gesture.kind}(${gesture.source})の操作中` })
}
function gestureEnded(gesture: GraphGestureEnd) {
  gestureText.value = t({ en: `${gesture.kind} (${gesture.source}) ${gesture.outcome}`, ja: `${gesture.kind}(${gesture.source})${gesture.outcome}` })
}

const layoutState = useAsyncGraphLayout({
  input: () => ({ nodes, edges: edges.value, groups, collapsedGroupIds: collapsed.value, direction: 'LR' as const, settings }),
  adapter,
  // The first frame is synchronous, so server rendering and hydration agree and the graph is never empty.
  initialLayout: (shownNodes, shownEdges) => layoutLayeredGraph(shownNodes, shownEdges, settings),
})
const { display, layout, pending, deferred, error, gestureListeners } = layoutState

const summary = computed(() => {
  const frame = display.value
  if (!frame) return t({ en: 'No layout yet', ja: 'まだレイアウトがありません' })
  return t({
    en: `${frame.nodes.length} nodes, ${frame.edges.length} links, ${frame.collapsedGroupIds.size} collapsed group${frame.collapsedGroupIds.size === 1 ? '' : 's'}`,
    ja: `ノード ${frame.nodes.length}、リンク ${frame.edges.length}、折りたたんだグループ ${frame.collapsedGroupIds.size}`,
  })
})
const errorText = computed(() => {
  const failure = error.value
  if (!failure) return ''
  const message = failure.error instanceof Error ? failure.error.message : String(failure.error)
  return t({
    en: `Layout failed (${failure.scope}): ${message}. Showing the last consistent layout.`,
    ja: `レイアウトに失敗しました(${failure.scope}): ${message}。最後の整合したレイアウトを表示しています。`,
  })
})
// The demo reports node moves without applying them, so the layout input stays the same.
function reportMove(change: GraphNodeMove) {
  const name = labels[change.id] ?? change.id, dx = Math.round(change.after.x - change.before.x), dy = Math.round(change.after.y - change.before.y)
  lastMove.value = t({ en: `${name} by ${dx}, ${dy}`, ja: `${name} を ${dx}, ${dy} 移動` })
}
function setCollapsed(ids: Set<string>) {
  collapsed.value = ids
}
</script>

<template>
  <DemoPanel title-id="async-title" :title="t({ en: 'Asynchronous layout', ja: '非同期レイアウト' })" :subtitle="t({ en: 'The built-in layout runs asynchronously; only the newest complete frame is shown.', ja: '組み込みのレイアウトを非同期に実行し、最新の完全なフレームだけを表示します。' })">
    <div class="options async-options" role="group" :aria-label="t({ en: 'Layout service', ja: 'レイアウトサービス' })">
      <label>{{ t({ en: 'Response timing', ja: '応答のタイミング' }) }}
        <select v-model="speed" :aria-label="t({ en: 'Response timing', ja: '応答のタイミング' })">
          <option value="fast">{{ t({ en: 'Fast', ja: '速い' }) }}</option>
          <option value="slow">{{ t({ en: 'Slow (1.2 s)', ja: '遅い(1.2 秒)' }) }}</option>
          <option value="reverse">{{ t({ en: 'Reverse order', ja: '逆順' }) }}</option>
        </select>
      </label>
      <label><input v-model="failing" type="checkbox"> {{ t({ en: 'Layout service fails', ja: 'レイアウトサービスを失敗させる' }) }}</label>
      <label><input v-model="useWorker" type="checkbox"> {{ t({ en: 'Compute in a Web Worker', ja: 'Web Worker で計算' }) }}</label>
      <label><input v-model="withShortcut" type="checkbox"> {{ t({ en: 'Shortcut link Receive to Pack', ja: '受入から梱包への近道リンク' }) }}</label>
      <label>{{ t({ en: 'Routing policy', ja: '配線の方針' }) }}
        <select v-model="routing" :aria-label="t({ en: 'Routing policy', ja: '配線の方針' })">
          <option value="builtin">{{ t({ en: 'builtin (ports redrawn)', ja: 'builtin(ポートから再描画)' }) }}</option>
          <option value="preserve">{{ t({ en: 'preserve (engine routes kept)', ja: 'preserve(エンジンの経路を保持)' }) }}</option>
        </select>
      </label>
      <button type="button" :disabled="!collapsed.size" @click="collapsed = new Set()">{{ t({ en: 'Expand all groups', ja: 'すべてのグループを展開' }) }}</button>
    </div>
    <p class="status" role="status" :aria-label="t({ en: 'Layout status', ja: 'レイアウトの状態' })">
      <span>{{ deferred ? t({ en: 'Layout ready, shown after the gesture', ja: 'レイアウトの準備完了。操作の後に表示します' }) : pending ? t({ en: 'Computing layout…', ja: 'レイアウトを計算中…' }) : t({ en: 'Layout up to date', ja: 'レイアウトは最新です' }) }}</span> ·
      <output :aria-label="t({ en: 'Displayed frame', ja: '表示中のフレーム' })">{{ summary }}</output> ·
      {{ t({ en: 'source', ja: '出所' }) }} <output :aria-label="t({ en: 'Frame source', ja: 'フレームの出所' })">{{ display?.source }}</output>
    </p>
    <p v-if="errorText" class="async-error" role="alert">{{ errorText }}</p>
    <NetworkGraph v-if="display" :nodes="display.nodes" :edges="display.edges" :groups="display.groups"
      :collapsed-group-ids="display.collapsedGroupIds" collapsible-groups :layout="layout" :routing-policy="routing"
      :options="{ ...settings, direction: display.direction }" :height="340" :labels="{ ...componentLabels.graph, region: t({ en: 'Asynchronously laid out graph', ja: '非同期にレイアウトしたグラフ' }) }"
      draggable v-bind="gestureListeners" @gesture-start="gestureStarted" @gesture-end="gestureEnded"
      @node-move="reportMove" @update:collapsed-group-ids="setCollapsed" />
    <p class="hint">{{ t({ en: 'Graph gesture:', ja: 'グラフの操作:' }) }} <output :aria-label="t({ en: 'Graph gesture', ja: 'グラフの操作' })">{{ gestureText }}</output></p>
    <p class="hint">{{ t({ en: 'Last proposed move (not applied):', ja: '最後に提案された移動(適用しません):' }) }} <output :aria-label="t({ en: 'Last proposed move', ja: '最後に提案された移動' })">{{ lastMove || t({ en: 'none', ja: 'なし' }) }}</output></p>
    <p class="hint">{{ t({ en: 'Responses so far (oldest first):', ja: 'これまでの応答(古い順):' }) }}</p>
    <ol class="async-log" :aria-label="t({ en: 'Layout responses', ja: 'レイアウトの応答' })">
      <li v-for="(entry, index) in log" :key="index">{{ entry }}</li>
    </ol>
  </DemoPanel>
</template>

<style scoped>
.async-options { flex-wrap: wrap; gap: 10px 16px; margin-bottom: 8px; }
.async-error { margin: 8px 0; padding: 6px 10px; border: 1px solid var(--vw-critical, #b4441c); border-radius: 6px; font-size: 12px; }
.async-log { margin: 4px 0 0; padding-left: 20px; font-size: 12px; color: var(--vw-muted, #4f6574); min-height: 18px; }
</style>
