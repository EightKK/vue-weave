<script setup lang="ts">
// Graph analysis on a synthetic supplier network: connected components, community detection, centrality and PageRank
// from `vue-weave/core`, shown with NetworkGraph groups, collapsing and highlighting. The data comes from a seeded
// generator and the metrics are pure functions of it, so each one is computed once and cached.
import { computed, nextTick, ref } from 'vue'
import {
  NetworkGraph, detectGraphCommunities, graphBetweennessCentrality, graphCommunityGroups, graphComponents,
  graphDegreeCentrality, graphPageRank, layoutForceGraph,
  type GraphEdge, type GraphLayoutFunction, type NetworkNode,
} from '../src'
import DemoPanel from './components/DemoPanel.vue'
import StatusLine from './components/StatusLine.vue'

// mulberry32: a small deterministic PRNG, so the demo and its tests see the same network every time.
function seeded(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6D2B79F5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function buildNetwork() {
  const random = seeded(2024)
  const nodes: NetworkNode[] = []
  const edges: GraphEdge[] = []
  const seen = new Set<string>()
  const tones = ['teal', 'blue', 'violet'] as const
  const link = (a: string, b: string) => {
    const key = a < b ? a + '|' + b : b + '|' + a
    if (a === b || seen.has(key)) return false
    seen.add(key)
    edges.push({ id: `${a}-${b}`, from: a, to: b, markerEnd: 'none' })
    return true
  }
  // Six regional clusters with dense links inside and a few links between neighbouring regions.
  const clusters: string[][] = []
  const sizes = [26, 24, 22, 22, 20, 18]
  sizes.forEach((size, region) => {
    const ids: string[] = []
    for (let i = 0; i < size; i++) {
      const id = `s${region + 1}-${String(i + 1).padStart(2, '0')}`
      ids.push(id)
      nodes.push({ id, label: id.toUpperCase(), tone: tones[region % tones.length] })
    }
    for (let i = 1; i < ids.length; i++) {
      link(ids[Math.floor(random() * i)]!, ids[i]!)
      for (let extra = 0; extra < 2; extra++) if (random() < 0.7) link(ids[i]!, ids[Math.floor(random() * i)]!)
    }
    clusters.push(ids)
  })
  for (let region = 0; region < clusters.length; region++) {
    const next = clusters[(region + 1) % clusters.length]!
    for (let k = 0; k < 3; k++) link(clusters[region]![Math.floor(random() * clusters[region]!.length)]!, next[Math.floor(random() * next.length)]!)
  }
  // Two small groups of suppliers that are not connected to the main network.
  for (const [name, size] of [['x1', 6], ['x2', 4]] as const) {
    const ids: string[] = []
    for (let i = 0; i < size; i++) {
      const id = `${name}-${i + 1}`
      ids.push(id)
      nodes.push({ id, label: id.toUpperCase(), tone: 'blue' })
      if (i) link(ids[Math.floor(random() * i)]!, id)
    }
  }
  return { nodes, edges }
}

const { nodes, edges } = buildNetwork()
const labelOf = new Map(nodes.map(node => [node.id, node.label]))
const nodeSettings = { nodeWidth: 76, nodeHeight: 30 }
// One stable layout function: the force layout is seeded, so the picture never changes between runs.
const layout: GraphLayoutFunction = (n, e) => layoutForceGraph(n, e, { seed: 1, ...nodeSettings, linkDistance: 110 })

const components = graphComponents(nodes, edges)
const { communities, modularity } = detectGraphCommunities(nodes, edges)
const groups = graphCommunityGroups(communities, {
  idPrefix: 'community-',
  label: (members, index) => `Community ${index + 1} · ${members.length} nodes`,
  minSize: 2,
})
const groupOfNode = new Map<string, string>()
for (const group of groups) for (const id of group.nodeIds) groupOfNode.set(id, group.id)
const summary = `${nodes.length} nodes, ${edges.length} edges, ${components.length} components, ${communities.length} communities, modularity ${modularity.toFixed(2)}`

type Metric = 'none' | 'degree' | 'betweenness' | 'pagerank'
const metricNames: Record<Exclude<Metric, 'none'>, string> = { degree: 'Degree', betweenness: 'Betweenness', pagerank: 'PageRank' }
const cache = new Map<Metric, ReadonlyMap<string, number>>()
function scoresFor(metric: Metric): ReadonlyMap<string, number> {
  let scores = cache.get(metric)
  if (!scores) {
    scores = metric === 'degree' ? graphDegreeCentrality(nodes, edges)
      : metric === 'betweenness' ? graphBetweennessCentrality(nodes, edges, { directed: false })
        : metric === 'pagerank' ? graphPageRank(nodes, edges).scores : new Map()
    cache.set(metric, scores)
  }
  return scores
}

const grouped = ref(false)
const collapsed = ref<ReadonlySet<string>>(new Set())
const rankBy = ref<Metric>('none')
const graph = ref<InstanceType<typeof NetworkGraph>>()
const status = ref('Choose a ranking to highlight the five most central suppliers.')

const top = computed(() => rankBy.value === 'none' ? [] : [...scoresFor(rankBy.value)]
  .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, 5).map(([id, score]) => ({ id, label: labelOf.get(id)!, score })))
const highlighted = computed<ReadonlySet<string>>(() => new Set(top.value.map(entry => entry.id)))
const shownGroups = computed(() => grouped.value ? groups : undefined)
const shownCollapsed = computed(() => grouped.value ? collapsed.value : new Set<string>())

function formatScore(score: number) {
  return rankBy.value === 'degree' ? String(score) : score.toFixed(rankBy.value === 'pagerank' ? 4 : 3)
}
function collapseAll() { collapsed.value = new Set(groups.map(group => group.id)) }
function expandAll() { collapsed.value = new Set() }

async function focus(id: string) {
  const group = groupOfNode.get(id)
  if (group && shownCollapsed.value.has(group)) {
    collapsed.value = new Set([...collapsed.value].filter(item => item !== group))
    await nextTick()
  }
  try {
    graph.value?.focusNode(id)
    status.value = `Centered on ${labelOf.get(id)}.`
  } catch (error) {
    status.value = error instanceof Error ? error.message : String(error)
  }
}
</script>

<template>
  <DemoPanel title-id="analysis-title" title="Graph analysis" subtitle="Components, communities and node rankings of a synthetic supplier network.">
    <p class="hint">Summary: <output aria-label="Network summary">{{ summary }}</output></p>
    <div class="options analysis-options" role="group" aria-label="Analysis options">
      <label><input v-model="grouped" type="checkbox"> Group communities</label>
      <button type="button" :disabled="!grouped" @click="collapseAll">Collapse all</button>
      <button type="button" :disabled="!grouped" @click="expandAll">Expand all</button>
      <label>Rank by
        <select v-model="rankBy" aria-label="Rank by">
          <option value="none">None</option>
          <option value="degree">Degree</option>
          <option value="betweenness">Betweenness</option>
          <option value="pagerank">PageRank</option>
        </select>
      </label>
    </div>
    <NetworkGraph ref="graph" :nodes="nodes" :edges="edges" :layout="layout" :options="nodeSettings"
      :groups="shownGroups" :collapsed-group-ids="shownCollapsed" collapsible-groups
      :highlighted-node-ids="highlighted" :height="480" :show-minimap="true"
      :labels="{ region: 'Supplier network' }" @update:collapsed-group-ids="collapsed = $event" />
    <StatusLine label="Analysis status">{{ status }}</StatusLine>
    <template v-if="top.length">
      <p class="hint">Top 5 by {{ metricNames[rankBy as Exclude<Metric, 'none'>] }}:</p>
      <ol class="analysis-ranking" aria-label="Top ranked nodes">
        <li v-for="entry in top" :key="entry.id">
          <button type="button" @click="focus(entry.id)">{{ entry.label }}</button> <span>{{ formatScore(entry.score) }}</span>
        </li>
      </ol>
    </template>
  </DemoPanel>
</template>

<style scoped>
.analysis-options { flex-wrap: wrap; gap: 10px 16px; margin-bottom: 8px; }
.analysis-ranking { margin: 4px 0 0; padding-left: 24px; font-size: 12px; color: var(--vw-muted, #4f6574); display: grid; gap: 4px; }
.analysis-ranking span { margin-inline-start: 6px; }
</style>
