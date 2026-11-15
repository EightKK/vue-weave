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

const settings = { nodeWidth: 150, nodeHeight: 52 }
const port = (id: string, side: 'left' | 'right') => ({ id, side, direction: side === 'left' ? 'target' as const : 'source' as const })
const labels: Record<string, string> = {
  a: 'Receive', b: 'Inspect', c: 'Stage', d: 'Cut', e: 'Weld', f: 'Paint', g: 'Pack', h: 'Ship',
}
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
  { id: 'intake', label: 'Intake', nodeIds: ['a', 'b', 'c'] },
  { id: 'assembly', label: 'Assembly', nodeIds: ['d', 'e', 'f'] },
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
      log.value = [...log.value.slice(-5), `#${event.sequence} ${event.scope} ${event.outcome === 'discarded' ? 'arrived late and was discarded (superseded)' : event.outcome} after ${event.delay} ms`]
    },
  },
)

// NetworkGraph reports every gesture a new layout would cancel (drag, pan, connection, box selection) with
// `gesture-start` and, exactly once, `gesture-end`, after the proposal. `gestureListeners` turns them into the
// composable's gesture state, so results that arrive meanwhile wait (`deferred`) instead of cancelling the gesture.
const lastMove = ref('')
// The demo also shows the gesture events it receives.
const gestureText = ref('none')
function gestureStarted(gesture: GraphGesture) {
  gestureText.value = `${gesture.kind} (${gesture.source}) in progress`
}
function gestureEnded(gesture: GraphGestureEnd) {
  gestureText.value = `${gesture.kind} (${gesture.source}) ${gesture.outcome}`
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
  if (!frame) return 'No layout yet'
  return `${frame.nodes.length} nodes, ${frame.edges.length} links, ${frame.collapsedGroupIds.size} collapsed group${frame.collapsedGroupIds.size === 1 ? '' : 's'}`
})
const errorText = computed(() => {
  const failure = error.value
  return failure ? `Layout failed (${failure.scope}): ${failure.error instanceof Error ? failure.error.message : String(failure.error)}. Showing the last consistent layout.` : ''
})
// The demo reports node moves without applying them, so the layout input stays the same.
function reportMove(change: GraphNodeMove) {
  lastMove.value = `${labels[change.id] ?? change.id} by ${Math.round(change.after.x - change.before.x)}, ${Math.round(change.after.y - change.before.y)}`
}
function setCollapsed(ids: Set<string>) {
  collapsed.value = ids
}
</script>

<template>
  <section class="planning-panel" aria-labelledby="async-title">
    <div class="section-head">
      <div><h2 id="async-title">Asynchronous layout</h2><p>The built-in layout runs asynchronously; only the newest complete frame is shown.</p></div>
    </div>
    <div class="options async-options" role="group" aria-label="Layout service">
      <label>Response timing
        <select v-model="speed" aria-label="Response timing">
          <option value="fast">Fast</option>
          <option value="slow">Slow (1.2 s)</option>
          <option value="reverse">Reverse order</option>
        </select>
      </label>
      <label><input v-model="failing" type="checkbox"> Layout service fails</label>
      <label><input v-model="useWorker" type="checkbox"> Compute in a Web Worker</label>
      <label><input v-model="withShortcut" type="checkbox"> Shortcut link Receive to Pack</label>
      <label>Routing policy
        <select v-model="routing" aria-label="Routing policy">
          <option value="builtin">builtin (ports redrawn)</option>
          <option value="preserve">preserve (engine routes kept)</option>
        </select>
      </label>
      <button type="button" :disabled="!collapsed.size" @click="collapsed = new Set()">Expand all groups</button>
    </div>
    <p class="status" role="status" aria-label="Layout status">
      <span>{{ deferred ? 'Layout ready, shown after the gesture' : pending ? 'Computing layout…' : 'Layout up to date' }}</span> ·
      <output aria-label="Displayed frame">{{ summary }}</output> ·
      source <output aria-label="Frame source">{{ display?.source }}</output>
    </p>
    <p v-if="errorText" class="async-error" role="alert">{{ errorText }}</p>
    <NetworkGraph v-if="display" :nodes="display.nodes" :edges="display.edges" :groups="display.groups"
      :collapsed-group-ids="display.collapsedGroupIds" collapsible-groups :layout="layout" :routing-policy="routing"
      :options="{ ...settings, direction: display.direction }" :height="340" :labels="{ region: 'Asynchronously laid out graph' }"
      draggable v-bind="gestureListeners" @gesture-start="gestureStarted" @gesture-end="gestureEnded"
      @node-move="reportMove" @update:collapsed-group-ids="setCollapsed" />
    <p class="hint">Graph gesture: <output aria-label="Graph gesture">{{ gestureText }}</output></p>
    <p class="hint">Last proposed move (not applied): <output aria-label="Last proposed move">{{ lastMove || 'none' }}</output></p>
    <p class="hint">Responses so far (oldest first):</p>
    <ol class="async-log" aria-label="Layout responses">
      <li v-for="(entry, index) in log" :key="index">{{ entry }}</li>
    </ol>
  </section>
</template>

<style scoped>
.async-options { flex-wrap: wrap; gap: 10px 16px; margin-bottom: 8px; }
.async-error { margin: 8px 0; padding: 6px 10px; border: 1px solid var(--vw-critical, #b4441c); border-radius: 6px; font-size: 12px; }
.async-log { margin: 4px 0 0; padding-left: 20px; font-size: 12px; color: var(--vw-muted, #4f6574); min-height: 18px; }
</style>
