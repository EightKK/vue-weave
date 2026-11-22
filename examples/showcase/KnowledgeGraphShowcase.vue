<script setup lang="ts">
import { computed, ref, useId } from 'vue'
import {
  NetworkGraph, detectGraphCommunities, graphBetweennessCentrality, graphPageRank, layoutForceGraph, searchGraphNodes, shortestGraphPath,
  traverseGraph,
  type GraphBox, type GraphEdge, type GraphLayout, type GraphPathResult, type GraphPoint, type NetworkGraphExposed, type NetworkNode,
} from '../../src'

// An explorable map of computer science: 160-odd topics, each linked to the topics it builds on. The force-directed
// layout places them, PageRank sizes them, Louvain communities colour them, and search, neighbourhood focus and
// shortest paths drive the dimming and highlight props of NetworkGraph. Everything is computed once and deterministic.
type TopicData = {
  field: string; community: number; radius: number; score: number; rank: number; bridging: number
  buildsOn: readonly string[]; leadsTo: readonly string[]
}
type Topic = NetworkNode<TopicData> & { data: TopicData }
type Link = GraphEdge & { cross: boolean }

// One line per topic: "Topic < the topics it builds on". Forward references across fields are allowed.
const fields: readonly { name: string; topics: string }[] = [
  { name: 'Mathematics', topics: `Set theory
Logic < Set theory
Discrete mathematics < Logic, Set theory
Calculus
Linear algebra
Probability < Calculus, Set theory
Statistics < Probability
Graph theory < Discrete mathematics
Combinatorics < Discrete mathematics
Number theory < Discrete mathematics
Abstract algebra < Number theory, Set theory
Information theory < Probability
Optimization < Calculus, Linear algebra
Convex optimization < Optimization
Numerical methods < Calculus, Linear algebra
Fourier analysis < Calculus, Linear algebra` },
  { name: 'Algorithms', topics: `Asymptotic analysis < Discrete mathematics, Calculus
Data structures < Asymptotic analysis
Trees < Data structures, Graph theory
Heaps < Trees
Hashing < Data structures, Probability
Union-find < Data structures
Sorting < Asymptotic analysis, Heaps
Searching < Sorting, Trees
Divide and conquer < Asymptotic analysis
Dynamic programming < Divide and conquer, Combinatorics
Greedy algorithms < Asymptotic analysis
Graph traversal < Graph theory, Data structures
Shortest paths < Graph traversal, Heaps, Dynamic programming
Minimum spanning trees < Greedy algorithms, Union-find, Graph theory
Network flow < Graph traversal, Optimization
String matching < Hashing, Automata
Randomized algorithms < Probability, Asymptotic analysis
Nearest neighbour search < Trees, Hashing, Linear algebra
Computational complexity < Asymptotic analysis, Automata, Logic
NP-completeness < Computational complexity
Approximation algorithms < NP-completeness, Greedy algorithms, Optimization` },
  { name: 'Machine learning', topics: `Gradient descent < Calculus, Optimization
Supervised learning < Statistics
Linear regression < Supervised learning, Linear algebra
Logistic regression < Linear regression, Gradient descent
Regularization < Linear regression, Optimization
Cross-validation < Statistics, Supervised learning
Decision trees < Supervised learning, Information theory, Trees
Random forests < Decision trees, Randomized algorithms
Gradient boosting < Decision trees, Gradient descent
Kernel methods < Linear algebra, Supervised learning
Support vector machines < Kernel methods, Convex optimization
Clustering < Statistics
k-means < Clustering, Linear algebra
Dimensionality reduction < Linear algebra, Statistics
PCA < Dimensionality reduction
Bayesian inference < Probability, Statistics
Graphical models < Bayesian inference, Graph theory
Neural networks < Linear algebra, Gradient descent, Logistic regression
Backpropagation < Neural networks, Calculus
Markov decision processes < Probability, Dynamic programming
Reinforcement learning < Markov decision processes
Anomaly detection < Statistics, Clustering` },
  { name: 'Deep learning', topics: `Convolutional networks < Backpropagation, Image processing
Batch normalization < Neural networks, Statistics
Dropout < Neural networks, Regularization
Recurrent networks < Backpropagation
LSTM < Recurrent networks
Word embeddings < Neural networks, Dimensionality reduction
Attention < Recurrent networks, Word embeddings
Transformers < Attention, Dropout
Tokenization < Information theory
Language models < Probability, Word embeddings, Tokenization
Large language models < Transformers, Language models, GPU computing
Fine-tuning < Large language models, Gradient descent
RLHF < Fine-tuning, Reinforcement learning
Retrieval-augmented generation < Large language models, Vector databases
Self-supervised learning < Neural networks, Word embeddings
Variational autoencoders < Neural networks, Bayesian inference
Generative adversarial networks < Convolutional networks
Diffusion models < Variational autoencoders, Convolutional networks
Graph neural networks < Neural networks, Graph theory` },
  { name: 'Systems', topics: `Computer architecture < Logic
Operating systems < Computer architecture, Data structures
Processes and threads < Operating systems
CPU scheduling < Processes and threads, Heaps
Virtual memory < Operating systems, Computer architecture
Caching < Computer architecture, Hashing
File systems < Operating systems, B-trees
Concurrency < Processes and threads
Locks < Concurrency
Networking < Operating systems
TCP/IP < Networking
HTTP < TCP/IP
Content delivery networks < HTTP, Caching
Distributed systems < Networking, Concurrency
Consensus < Distributed systems, Logic
Paxos < Consensus
Raft < Consensus
Replication < Distributed systems
Fault tolerance < Distributed systems, Replication
CAP theorem < Distributed systems, Replication
Virtual machines < Operating systems, Virtual memory
Containers < Operating systems, File systems
Cloud computing < Virtual machines, Containers, Distributed systems
GPU computing < Computer architecture, Linear algebra, Concurrency, Rasterization` },
  { name: 'Databases', topics: `Relational model < Set theory, Logic
SQL < Relational model
B-trees < Trees
Indexing < B-trees, Hashing
Query optimization < SQL, Indexing, Dynamic programming
Transactions < Relational model, Concurrency
ACID < Transactions
Concurrency control < Transactions, Locks
Write-ahead logging < Transactions, File systems
Log-structured merge trees < Write-ahead logging, Sorting
Key-value stores < Hashing, Log-structured merge trees
NoSQL < Key-value stores, CAP theorem
Column stores < Relational model, Query optimization
Data warehousing < Column stores, SQL
MapReduce < Distributed systems, Functional programming, Sorting
Stream processing < MapReduce, Distributed systems
Vector databases < Nearest neighbour search, Indexing` },
  { name: 'Programming languages', topics: `Lambda calculus < Logic
Formal grammars < Discrete mathematics
Automata < Formal grammars
Regular expressions < Automata
Parsing < Formal grammars, Automata
Type systems < Lambda calculus, Logic
Type inference < Type systems, Union-find
Functional programming < Lambda calculus
Object-oriented programming < Type systems
Compilers < Parsing, Type systems, Data structures
Intermediate representations < Compilers, Graph theory
Register allocation < Intermediate representations, Graph theory
Garbage collection < Compilers, Graph traversal, Virtual memory
Just-in-time compilation < Intermediate representations, Virtual machines
Static analysis < Intermediate representations, Logic
Program verification < Logic, Type systems
Model checking < Automata, Program verification` },
  { name: 'Security', topics: `Hash functions < Hashing, Information theory
Symmetric encryption < Information theory, Abstract algebra
Public-key cryptography < Number theory, Computational complexity
RSA < Public-key cryptography, Number theory
Elliptic curves < Public-key cryptography, Abstract algebra
Digital signatures < Public-key cryptography, Hash functions
TLS < Digital signatures, Symmetric encryption, TCP/IP
Authentication < Hash functions, Digital signatures
Access control < Authentication, Operating systems
Side-channel attacks < Computer architecture, Caching, Symmetric encryption
Zero-knowledge proofs < Public-key cryptography, Computational complexity
Homomorphic encryption < Public-key cryptography, Abstract algebra
Differential privacy < Probability, Statistics
Blockchain < Hash functions, Digital signatures, Consensus
Post-quantum cryptography < Public-key cryptography, Linear algebra` },
  { name: 'Graphics and vision', topics: `Geometric transformations < Linear algebra
Rasterization < Geometric transformations
Shading < Rasterization, Geometric transformations
Ray tracing < Geometric transformations, Probability, Trees
Image processing < Fourier analysis, Linear algebra
Feature detection < Image processing
Computer vision < Image processing, Geometric transformations
Image segmentation < Computer vision, Clustering, Network flow
Object detection < Computer vision, Convolutional networks
Optical flow < Computer vision, Optimization
3D reconstruction < Computer vision, Geometric transformations, Numerical methods
Neural radiance fields < 3D reconstruction, Ray tracing, Neural networks
Vision transformers < Transformers, Computer vision` },
]
const palette = ['#5eead4', '#a78bfa', '#f472b6', '#60a5fa', '#fbbf24', '#4ade80', '#fb923c', '#f87171', '#38bdf8', '#e879f9', '#a3e635']

// Plain graph first: links point from the foundation to the topic that builds on it.
const base: { id: string; label: string; field: string }[] = []
const baseLinks: GraphEdge[] = []
for (const field of fields) {
  for (const line of field.topics.split('\n')) {
    const [name, prerequisites] = line.split(' < ') as [string, string?]
    base.push({ id: name, label: name, field: field.name })
    for (const from of prerequisites?.split(', ') ?? []) baseLinks.push({ id: `${from} → ${name}`, from, to: name })
  }
}

// Analysis. PageRank runs on reversed links, so foundations that many topics build on rank highest.
const pageRank = graphPageRank(base, baseLinks.map(link => ({ ...link, from: link.to, to: link.from }))).scores
const bridging = graphBetweennessCentrality(base, baseLinks, { directed: false })
const { communities: memberLists, modularity } = detectGraphCommunities(base, baseLinks)
const ranked = [...pageRank.keys()].sort((a, b) => pageRank.get(b)! - pageRank.get(a)!)
const communityOf = new Map<string, number>()
memberLists.forEach((members, index) => members.forEach(id => communityOf.set(id, index)))
const communities = memberLists.map((members, index) => {
  const hub = members.reduce((best, id) => pageRank.get(id)! > pageRank.get(best)! ? id : best)
  return { index, hub, label: hub, size: members.length, color: palette[index % palette.length]! }
})
const maxScore = pageRank.get(ranked[0]!)!, minScore = pageRank.get(ranked.at(-1)!)!
const topics: readonly Topic[] = base.map(({ id, label, field }) => ({
  id, label,
  data: {
    field, community: communityOf.get(id)!, score: pageRank.get(id)!, rank: ranked.indexOf(id) + 1, bridging: bridging.get(id)!,
    radius: 6 + 18 * Math.sqrt((pageRank.get(id)! - minScore) / (maxScore - minScore)),
    buildsOn: baseLinks.filter(link => link.to === id).map(link => link.from),
    leadsTo: baseLinks.filter(link => link.from === id).map(link => link.to),
  },
}))
const topicsById = new Map(topics.map(topic => [topic.id, topic]))
const links: readonly Link[] = baseLinks.map(link => ({ ...link, cross: communityOf.get(link.from) !== communityOf.get(link.to) }))
const hubs = new Set(communities.map(community => community.hub))
const bridgingRank = [...bridging.keys()].sort((a, b) => bridging.get(b)! - bridging.get(a)!)

// Force-directed placement of every topic, computed once. Hiding communities keeps everyone else where they are.
// The result is turned so its long axis runs horizontally and widened a little to suit a landscape canvas.
const force = layoutForceGraph(base, baseLinks, { nodeWidth: 20, nodeHeight: 20, linkDistance: 30, repulsion: 180, nodeGap: 8, seed: 7 })
const raw = [...force.boxes].map(([id, box]) => ({ id, x: box.x + box.width / 2, y: box.y + box.height / 2 }))
const mean = raw.reduce((sum, p) => ({ x: sum.x + p.x / raw.length, y: sum.y + p.y / raw.length }), { x: 0, y: 0 })
let sxx = 0, syy = 0, sxy = 0
for (const p of raw) { sxx += (p.x - mean.x) ** 2; syy += (p.y - mean.y) ** 2; sxy += (p.x - mean.x) * (p.y - mean.y) }
const angle = Math.atan2(2 * sxy, sxx - syy) / 2, cos = Math.cos(-angle), sin = Math.sin(-angle)
const turned = raw.map(p => ({ id: p.id, x: (p.x - mean.x) * cos - (p.y - mean.y) * sin, y: (p.x - mean.x) * sin + (p.y - mean.y) * cos }))
const spanX = Math.max(...turned.map(p => p.x)) - Math.min(...turned.map(p => p.x))
const spanY = Math.max(...turned.map(p => p.y)) - Math.min(...turned.map(p => p.y))
const stretch = Math.min(1.45, Math.max(1, 1.7 * spanY / spanX))
const margin = 56, minX = Math.min(...turned.map(p => p.x)), minY = Math.min(...turned.map(p => p.y))
const centres = new Map<string, GraphPoint>(turned.map(p => [p.id, { x: margin + (p.x - minX) * stretch, y: margin + p.y - minY }]))
const chartWidth = 2 * margin + spanX * stretch, chartHeight = 2 * margin + spanY
const centroids = memberLists.map(members => {
  const sum = members.reduce((total, id) => ({ x: total.x + centres.get(id)!.x, y: total.y + centres.get(id)!.y }), { x: 0, y: 0 })
  return { x: sum.x / members.length, y: sum.y / members.length }
})
// Cheap edge bundling: each curve bends toward the centroids of its communities, so links between two communities
// gather into a shared channel while links inside one bow gently toward its centre.
const paths = new Map<string, string>()
for (const link of links) {
  const a = centres.get(link.from)!, b = centres.get(link.to)!
  const ca = centroids[communityOf.get(link.from)!]!, cb = centroids[communityOf.get(link.to)!]!
  const pull = link.cross ? 0.45 : 0.2
  const control = {
    x: (a.x + b.x) / 2 * (1 - pull) + (ca.x + cb.x) / 2 * pull,
    y: (a.y + b.y) / 2 * (1 - pull) + (ca.y + cb.y) / 2 * pull,
  }
  const trim = (point: GraphPoint, radius: number) => {
    const dx = control.x - point.x, dy = control.y - point.y, length = Math.hypot(dx, dy) || 1
    return `${(point.x + dx / length * radius).toFixed(1)} ${(point.y + dy / length * radius).toFixed(1)}`
  }
  const start = trim(a, topicsById.get(link.from)!.data.radius + 2), end = trim(b, topicsById.get(link.to)!.data.radius + 2)
  paths.set(link.id, `M${start} Q${control.x.toFixed(1)} ${control.y.toFixed(1)} ${end}`)
}
function layoutTopics(nodes: readonly Topic[], edges: readonly Link[]): GraphLayout {
  const boxes = new Map<string, GraphBox>()
  for (const node of nodes) {
    const centre = centres.get(node.id)!, r = node.data.radius
    boxes.set(node.id, { x: centre.x - r, y: centre.y - r, width: 2 * r, height: 2 * r, rank: 0 })
  }
  return { boxes, paths: new Map(edges.map(edge => [edge.id, paths.get(edge.id)!])), edgeLabels: new Map(), width: chartWidth, height: chartHeight }
}

const graph = ref<NetworkGraphExposed<Topic, Link>>()
const selectedId = ref<string>()
const query = ref('')
const focusHops = ref<0 | 1 | 2>(1)
const hidden = ref<ReadonlySet<number>>(new Set())
const pathFrom = ref('')
const pathTo = ref('')
const path = ref<GraphPathResult | null>(null)
const status = ref(`${topics.length} topics, ${links.length} links and ${communities.length} communities (modularity ${modularity.toFixed(2)}). Select a topic to explore it.`)

const shownTopics = computed(() => topics.filter(topic => !hidden.value.has(topic.data.community)))
const shownIds = computed(() => new Set(shownTopics.value.map(topic => topic.id)))
const shownLinks = computed(() => links.filter(link => shownIds.value.has(link.from) && shownIds.value.has(link.to)))
const sortedTopics = computed(() => [...shownTopics.value].sort((a, b) => a.label.localeCompare(b.label)))
const selected = computed(() => selectedId.value ? topicsById.get(selectedId.value) : undefined)
const matches = computed(() => query.value.trim()
  ? new Set(searchGraphNodes(shownTopics.value, query.value.trim(), { fields: ['label'] }).map(topic => topic.id))
  : undefined)
const neighbours = computed(() => selected.value
  ? new Set(traverseGraph({ nodes: shownTopics.value, edges: shownLinks.value }, [selected.value.id], { maxHops: 1 }).nodeIds)
  : undefined)
const pathNodes = computed(() => path.value ? new Set(path.value.nodeIds) : undefined)
const pathEdges = computed(() => path.value ? new Set(path.value.edgeIds) : undefined)
// One source of dimming at a time: a found path, then the search, then the neighbourhood of the selection.
const dimmedIds = computed(() => {
  let keep: ReadonlySet<string> | undefined = pathNodes.value
  if (!keep && !matches.value && selected.value && focusHops.value) {
    keep = new Set(traverseGraph({ nodes: shownTopics.value, edges: shownLinks.value }, [selected.value.id], { maxHops: focusHops.value }).nodeIds)
  }
  return keep && new Set(shownTopics.value.filter(topic => !keep.has(topic.id)).map(topic => topic.id))
})
// Which labels to draw at a camera scale: the selection, the path, search matches and neighbours first, then community
// hubs and the other topics by PageRank, skipping any label that would overlap one already placed. Hover and keyboard
// focus still reveal every label through CSS.
const labelPlanner = computed(() => {
  const dimmed = dimmedIds.value, found = matches.value, near = neighbours.value
  const route = pathNodes.value, focus = route ? undefined : found ?? near
  const forced = route ? [...route] : found ? [] : [selectedId.value]
  const others = [...ranked.filter(id => focus?.has(id)), ...hubs, ...ranked].filter(id => !dimmed?.has(id) && (!found || found.has(id)))
  const cache = new Map<number, Set<string>>()
  return (scale: number) => {
    const key = Math.round(scale * 100)
    let placed = cache.get(key)
    if (placed) return placed
    placed = new Set<string>()
    const boxes: { x: number; y: number; w: number; h: number }[] = []
    for (const id of [...forced, ...others]) {
      if (!id || placed.has(id) || !shownIds.value.has(id)) continue
      const topic = topicsById.get(id)!, centre = centres.get(id)!, isForced = forced.includes(id)
      if (!isForced && !hubs.has(id) && !focus?.has(id) && topic.data.radius * scale < 7) continue
      const w = (topic.label.length * 7 + 8) / scale, h = 17 / scale
      const box = { x: centre.x - w / 2, y: centre.y + topic.data.radius + 2 / scale, w, h }
      if (!isForced && boxes.some(other => box.x < other.x + other.w && other.x < box.x + box.w && box.y < other.y + other.h && other.y < box.y + box.h)) continue
      boxes.push(box)
      placed.add(id)
    }
    cache.set(key, placed)
    return placed
  }
})
const topList = computed(() => ranked.filter(id => shownIds.value.has(id)).slice(0, 8).map(id => topicsById.get(id)!))

const uid = useId()
const gradient = (kind: 'halo' | 'core', community: number) => `url(#${uid}-${kind}-${community})`
const colorOf = (id: string) => communities[communityOf.get(id)!]!.color
const label = (id: string) => topicsById.get(id)?.label ?? id
const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`

function describe(topic: Topic) {
  const before = topic.data.buildsOn.length ? `builds on ${plural(topic.data.buildsOn.length, 'topic')}` : 'a foundation'
  return `${topic.label} · ${topic.data.field} · ${before}, leads to ${plural(topic.data.leadsTo.length, 'topic')}.`
}
function select(id: string | undefined, centre = false) {
  selectedId.value = id
  if (!id) {
    status.value = 'Selection cleared.'
    return
  }
  status.value = describe(topicsById.get(id)!)
  if (centre && graph.value) graph.value.focusNode(id, { scale: Math.max(graph.value.getViewport().scale, 0.9) })
}
function onSearchEnter() {
  const first = matches.value && [...matches.value][0]
  if (first) select(first, true)
}
function onQuery() {
  const count = matches.value?.size
  status.value = count === undefined ? 'Search cleared.' : `${plural(count, 'topic')} match “${query.value.trim()}”.`
}
function findPath() {
  if (!pathFrom.value || !pathTo.value) {
    status.value = 'Choose a start and an end topic to find a path.'
    return
  }
  path.value = shortestGraphPath(shownTopics.value, shownLinks.value, pathFrom.value, pathTo.value, { directed: false })
  if (!path.value) {
    status.value = `No path between ${label(pathFrom.value)} and ${label(pathTo.value)} through the shown communities.`
    return
  }
  status.value = `Shortest path, ${plural(path.value.edgeIds.length, 'link')}: ${path.value.nodeIds.map(label).join(' → ')}.`
  graph.value?.fit({ ids: path.value.nodeIds, padding: 72 })
}
function setPathEnd(end: 'from' | 'to', id: string) {
  ;(end === 'from' ? pathFrom : pathTo).value = id
  if (pathFrom.value && pathTo.value) findPath()
  else status.value = `Path ${end === 'from' ? 'starts' : 'ends'} at ${label(id)}; now choose the other end.`
}
function clearPath() {
  path.value = null
  pathFrom.value = pathTo.value = ''
  status.value = 'Path cleared.'
}
function toggleCommunity(index: number) {
  const next = new Set(hidden.value)
  const community = communities[index]!
  if (next.has(index)) next.delete(index)
  else next.add(index)
  hidden.value = next
  const shown = shownIds.value
  if (selectedId.value && !shown.has(selectedId.value)) selectedId.value = undefined
  if (pathFrom.value && !shown.has(pathFrom.value)) pathFrom.value = ''
  if (pathTo.value && !shown.has(pathTo.value)) pathTo.value = ''
  if (path.value && path.value.nodeIds.some(id => !shown.has(id))) path.value = null
  status.value = `${next.has(index) ? 'Hid' : 'Showed'} the ${community.label} community (${plural(community.size, 'topic')}).`
}
</script>

<template>
  <section class="showcase sc-kg" aria-label="Knowledge graph">
    <svg class="sc-kg-defs" aria-hidden="true" focusable="false" width="0" height="0">
      <defs>
        <template v-for="community in communities" :key="community.index">
          <radialGradient :id="`${uid}-halo-${community.index}`">
            <stop offset="0" :stop-color="community.color" stop-opacity=".5" />
            <stop offset=".45" :stop-color="community.color" stop-opacity=".14" />
            <stop offset="1" :stop-color="community.color" stop-opacity="0" />
          </radialGradient>
          <radialGradient :id="`${uid}-core-${community.index}`" cx=".36" cy=".32" r=".75">
            <stop offset="0" stop-color="#fff" stop-opacity=".95" />
            <stop offset=".3" :stop-color="community.color" />
            <stop offset="1" :stop-color="community.color" stop-opacity=".72" />
          </radialGradient>
        </template>
      </defs>
    </svg>
    <div class="sc-kg-head">
      <div>
        <h2>Knowledge graph</h2>
        <p>
          {{ topics.length }} computer-science topics linked to what they build on. <code>layoutForceGraph</code> places them,
          <code>graphPageRank</code> sizes them and <code>detectGraphCommunities</code> colours them; search, neighbourhood focus and
          <code>shortestGraphPath</code> drive the dimming and highlight props.
        </p>
      </div>
      <dl class="sc-kg-stats">
        <div><dt>Topics</dt><dd>{{ shownTopics.length }}</dd></div>
        <div><dt>Links</dt><dd>{{ shownLinks.length }}</dd></div>
        <div><dt>Communities</dt><dd>{{ communities.length - hidden.size }}</dd></div>
        <div><dt>Modularity</dt><dd>{{ modularity.toFixed(2) }}</dd></div>
      </dl>
    </div>
    <div class="sc-kg-toolbar">
      <label class="sc-kg-search">
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" /></svg>
        <input v-model="query" type="search" aria-label="Search topics" placeholder="Search topics…" @input="onQuery" @keydown.enter.prevent="onSearchEnter">
      </label>
      <div class="sc-kg-segmented" role="group" aria-label="Neighbourhood focus">
        <button v-for="hops in ([0, 1, 2] as const)" :key="hops" type="button" :aria-pressed="focusHops === hops" @click="focusHops = hops">
          {{ hops ? plural(hops, 'hop') : 'All' }}
        </button>
      </div>
      <div class="sc-kg-path" role="group" aria-label="Find path">
        <label :for="`${uid}-from`">From</label><select :id="`${uid}-from`" v-model="pathFrom"><option value="">Choose…</option><option v-for="topic in sortedTopics" :key="topic.id" :value="topic.id">{{ topic.label }}</option></select>
        <label :for="`${uid}-to`">To</label><select :id="`${uid}-to`" v-model="pathTo"><option value="">Choose…</option><option v-for="topic in sortedTopics" :key="topic.id" :value="topic.id">{{ topic.label }}</option></select>
        <button type="button" class="sc-kg-primary" @click="findPath">Find path</button>
        <button v-if="path || pathFrom || pathTo" type="button" @click="clearPath">Clear</button>
      </div>
    </div>
    <div class="sc-kg-body">
      <div class="sc-kg-canvas">
        <NetworkGraph
          ref="graph" :selected-id="selectedId" unstyled-node-slots :nodes="shownTopics" :edges="shownLinks" :layout="layoutTopics"
          :height="'clamp(460px, 44vw, 600px)'" show-minimap :labels="{ region: 'Knowledge map' }"
          :match-ids="pathNodes ? undefined : matches" :dimmed-ids="dimmedIds" :related-ids="pathNodes ? undefined : neighbours"
          :highlighted-node-ids="pathNodes" :highlighted-edge-ids="pathEdges"
          @update:selected-id="select($event)"
        >
          <template #node="{ node, box, selected: isSelected, dimmed, related, highlighted, scale }">
            <g
              class="sc-kg-node"
              :class="{ 'sc-kg-is-selected': isSelected, 'sc-kg-is-on': labelPlanner(scale).has(node.id) }"
            >
              <circle class="sc-kg-halo" :cx="box.width / 2" :cy="box.height / 2" :r="node.data.radius * 2.4 + 6" :fill="gradient('halo', node.data.community)" />
              <circle v-if="isSelected || highlighted" class="sc-kg-ring" :cx="box.width / 2" :cy="box.height / 2" :r="node.data.radius + 6" />
              <circle class="sc-kg-core" :cx="box.width / 2" :cy="box.height / 2" :r="node.data.radius" :fill="gradient('core', node.data.community)" />
              <text class="sc-kg-label" :x="box.width / 2" :y="box.height + 4 / scale" :style="{ fontSize: 12.5 / scale + 'px', strokeWidth: 3.5 / scale + 'px' }">{{ node.label }}</text>
            </g>
          </template>
          <template #edge="{ edge, path: d, related, highlighted }">
            <path
              class="sc-kg-edge" :class="{ 'sc-kg-edge-cross': edge.cross, 'sc-kg-edge-related': related, 'sc-kg-edge-path': highlighted }"
              :d="d" :style="{ stroke: highlighted ? undefined : colorOf(edge.from) }"
            />
          </template>
          <template #minimap-node="{ node, box }">
            <circle :cx="box.x + box.width / 2" :cy="box.y + box.height / 2" :r="Math.max(node.data.radius, 9)" :fill="colorOf(node.id)" />
          </template>
        </NetworkGraph>
        <div class="sc-kg-legend" role="group" aria-label="Communities">
          <button
            v-for="community in communities" :key="community.index" type="button" :aria-pressed="!hidden.has(community.index)"
            :aria-label="`${community.label} community, ${community.size} topics`" @click="toggleCommunity(community.index)"
          >
            <span class="sc-kg-dot" :style="{ background: community.color, color: community.color }" />{{ community.label }}<span class="sc-kg-count">{{ community.size }}</span>
          </button>
        </div>
      </div>
      <aside class="sc-kg-panel" aria-label="Topic details">
        <template v-if="selected">
          <p class="sc-kg-eyebrow"><span class="sc-kg-dot" :style="{ background: colorOf(selected.id), color: colorOf(selected.id) }" />{{ selected.data.field }}</p>
          <h3>{{ selected.label }}</h3>
          <p class="sc-kg-muted">In the {{ communities[selected.data.community]!.label }} community</p>
          <dl class="sc-kg-metrics">
            <div><dt>Degree</dt><dd>{{ selected.data.buildsOn.length + selected.data.leadsTo.length }}</dd></div>
            <div><dt>PageRank</dt><dd>#{{ selected.data.rank }}</dd></div>
            <div><dt>Bridging</dt><dd>#{{ bridgingRank.indexOf(selected.id) + 1 }}</dd></div>
          </dl>
          <div class="sc-kg-actions">
            <button type="button" @click="setPathEnd('from', selected.id)">Path from here</button>
            <button type="button" @click="setPathEnd('to', selected.id)">Path to here</button>
          </div>
          <template v-for="list in [{ title: 'Builds on', ids: selected.data.buildsOn }, { title: 'Leads to', ids: selected.data.leadsTo }]" :key="list.title">
            <h4>{{ list.title }} <span class="sc-kg-count">{{ list.ids.length }}</span></h4>
            <ul v-if="list.ids.length" class="sc-kg-list">
              <li v-for="id in list.ids" :key="id">
                <button type="button" :disabled="!shownIds.has(id)" @click="select(id, true)"><span class="sc-kg-dot" :style="{ background: colorOf(id), color: colorOf(id) }" />{{ label(id) }}</button>
              </li>
            </ul>
            <p v-else class="sc-kg-muted">{{ list.title === 'Builds on' ? 'A foundation: nothing before it.' : 'Nothing builds on it yet.' }}</p>
          </template>
        </template>
        <template v-else>
          <h3>Most central topics</h3>
          <p class="sc-kg-muted">Ranked by PageRank over the “builds on” links. Select one, or click any star on the map.</p>
          <ol class="sc-kg-list">
            <li v-for="topic in topList" :key="topic.id">
              <button type="button" @click="select(topic.id, true)">
                <span class="sc-kg-dot" :style="{ background: colorOf(topic.id), color: colorOf(topic.id) }" />{{ topic.label }}
                <span class="sc-kg-bar" :style="{ width: (topic.data.score / maxScore) * 100 + '%', background: colorOf(topic.id) }" />
              </button>
            </li>
          </ol>
        </template>
      </aside>
    </div>
    <div class="sc-kg-foot">
      <p class="sc-kg-status" role="status">{{ status }}</p>
      <p class="sc-kg-hint">Ctrl + wheel zooms · drag to pan · labels appear as you zoom in · Enter in search jumps to the first match</p>
    </div>
  </section>
</template>

<style>
.sc-kg {
  color-scheme: dark;
  --vw-surface: #0b1020;
  --vw-surface-muted: #070b18;
  --vw-text: #e6ebff;
  --vw-muted: #8d97b8;
  --vw-border: #1c2440;
  --vw-accent: #8fb3ff;
  --vw-dimmed-opacity: .12;
  --kg-panel: rgb(14 20 40 / 86%);
  position: relative;
  padding: 20px;
  border: 1px solid #1c2440;
  border-radius: 18px;
  color: #e6ebff;
  background: radial-gradient(120% 80% at 0% 0%, #17204a 0%, transparent 55%), radial-gradient(90% 70% at 100% 100%, #2a1442 0%, transparent 60%), #060914;
  box-shadow: 0 24px 60px -30px rgb(10 14 40 / 80%);
}
.sc-kg-defs { position: absolute; width: 0; height: 0; overflow: hidden; }
.sc-kg-head { display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: 12px 28px; margin-bottom: 14px; }
.sc-kg-head > div { flex: 1 1 480px; min-width: 0; }
.sc-kg h2 { margin: 0 0 4px; font-size: 19px; letter-spacing: -.01em; color: #fff; }
.sc-kg-head p { margin: 0; max-width: 92ch; font-size: 13px; line-height: 1.55; color: #a3acc9; }
.sc-kg code { padding: 1px 5px; border-radius: 5px; background: rgb(143 179 255 / 12%); color: #c8d6ff; font: 12px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
.sc-kg-stats { display: flex; gap: 6px; margin: 0; }
.sc-kg-stats div { min-width: 74px; padding: 6px 12px; border: 1px solid #222b4c; border-radius: 10px; background: rgb(255 255 255 / 3%); }
.sc-kg dt { font-size: 10px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: #7f8ab0; }
.sc-kg dd { margin: 2px 0 0; font-size: 17px; font-weight: 650; font-variant-numeric: tabular-nums; color: #fff; }

.sc-kg-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 14px; margin-bottom: 12px; }
.sc-kg button, .sc-kg input, .sc-kg select { font: inherit; color: inherit; }
.sc-kg :is(button, input, select):focus-visible { outline: 2px solid #8fb3ff; outline-offset: 2px; }
.sc-kg-search { display: flex; align-items: center; gap: 8px; flex: 0 1 260px; padding: 0 12px; height: 36px; border: 1px solid #262f52; border-radius: 10px; background: rgb(255 255 255 / 4%); }
.sc-kg-search svg { width: 16px; flex: none; fill: none; stroke: #8d97b8; stroke-width: 2; stroke-linecap: round; }
.sc-kg-search input { flex: 1; min-width: 0; border: 0; background: none; font-size: 13px; }
.sc-kg-search input:focus-visible { outline: none; }
.sc-kg-search:focus-within { border-color: #8fb3ff; box-shadow: 0 0 0 3px rgb(143 179 255 / 18%); }
.sc-kg-segmented { display: inline-flex; gap: 2px; padding: 3px; border-radius: 10px; background: rgb(255 255 255 / 5%); }
.sc-kg .sc-kg-segmented button { padding: 6px 12px; border: 0; border-radius: 7px; background: none; color: #a3acc9; font-size: 12px; font-weight: 600; }
.sc-kg .sc-kg-segmented button[aria-pressed=true] { background: #26315c; color: #fff; box-shadow: 0 1px 6px rgb(0 0 0 / 30%); }
.sc-kg-path { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-left: auto; font-size: 12px; color: #8d97b8; }
.sc-kg-path select { max-width: 170px; height: 32px; padding: 0 8px; border: 1px solid #262f52; border-radius: 8px; background: #0e1430; font-size: 12px; }
.sc-kg .sc-kg-path button, .sc-kg .sc-kg-actions button { height: 32px; padding: 0 12px; border: 1px solid #2c3762; border-radius: 8px; background: rgb(255 255 255 / 4%); font-size: 12px; font-weight: 600; }
.sc-kg .sc-kg-path button.sc-kg-primary { border-color: transparent; background: linear-gradient(135deg, #6d8bff, #b06dff); color: #fff; box-shadow: 0 4px 16px -4px rgb(130 110 255 / 60%); }

.sc-kg-body { display: grid; grid-template-columns: minmax(0, 1fr) 290px; gap: 14px; }
.sc-kg-canvas { position: relative; min-width: 0; }
.sc-kg .vw-network {
  overflow: hidden; border-color: #1c2440; border-radius: 14px;
  background:
    radial-gradient(1px 1px at 23px 41px, rgb(255 255 255 / 55%), transparent) 0 0 / 173px 151px,
    radial-gradient(1px 1px at 97px 113px, rgb(200 215 255 / 45%), transparent) 0 0 / 211px 197px,
    radial-gradient(1.5px 1.5px at 140px 30px, rgb(255 255 255 / 35%), transparent) 0 0 / 263px 229px,
    radial-gradient(60% 55% at 30% 35%, rgb(64 92 200 / 22%), transparent 70%),
    radial-gradient(50% 50% at 75% 70%, rgb(150 60 190 / 18%), transparent 70%),
    #050813;
}
.sc-kg .vw-zoom-tools { left: 12px; right: auto; bottom: 12px; overflow: hidden; border: 1px solid #262f52; border-radius: 10px; background: var(--kg-panel); backdrop-filter: blur(6px); }
.sc-kg .vw-zoom-tools button { min-width: 32px; height: 32px; border: 0; border-radius: 0; background: none; color: #dfe6ff; }
.sc-kg .vw-zoom-tools button:hover { background: rgb(255 255 255 / 8%); }
.sc-kg .vw-zoom-tools output { color: #8d97b8; font-size: 11px; }
.sc-kg .vw-minimap { right: 12px; bottom: 12px; width: 150px; height: 112px; padding: 6px; border: 1px solid #262f52; border-radius: 12px; background: var(--kg-panel); backdrop-filter: blur(6px); }
.sc-kg .vw-minimap .vw-minimap-custom { opacity: .85; }
.sc-kg .vw-minimap .vw-minimap-window { fill: rgb(143 179 255 / 8%); stroke: #8fb3ff; stroke-width: 1.5; }
.sc-kg-legend { position: absolute; top: 10px; left: 10px; right: 10px; display: flex; flex-wrap: wrap; gap: 6px; pointer-events: none; }
.sc-kg .sc-kg-legend button { pointer-events: auto; display: inline-flex; align-items: center; gap: 7px; padding: 4px 10px 4px 8px; border: 1px solid #262f52; border-radius: 999px; background: var(--kg-panel); backdrop-filter: blur(6px); font-size: 11.5px; font-weight: 600; color: #dfe6ff; transition: opacity .2s; }
.sc-kg .sc-kg-legend button[aria-pressed=false] { opacity: .45; text-decoration: line-through; }
.sc-kg .sc-kg-legend button[aria-pressed=false] .sc-kg-dot { box-shadow: none; background: transparent !important; outline: 1.5px solid currentColor; }
.sc-kg-dot { display: inline-block; width: 8px; height: 8px; flex: none; border-radius: 50%; box-shadow: 0 0 8px currentColor; }
.sc-kg-count { color: #7f8ab0; font-weight: 600; font-variant-numeric: tabular-nums; }

/* Topic stars from the node slot; unstyled-node-slots keeps the stylesheet's paint off them. */
.sc-kg .vw-network-node { cursor: pointer; }
.sc-kg .vw-network-node:focus-visible { outline: none; }
.sc-kg .sc-kg-halo { stroke: none; pointer-events: none; mix-blend-mode: screen; transition: opacity .25s; }
.sc-kg .sc-kg-core { stroke: rgb(255 255 255 / 35%); stroke-width: .75px; transition: transform .2s; transform-box: fill-box; transform-origin: center; }
.sc-kg .vw-network-node:hover .sc-kg-core, .sc-kg .vw-network-node:focus-visible .sc-kg-core { transform: scale(1.18); stroke: #fff; stroke-width: 1.5px; }
.sc-kg .vw-network-node:focus-visible .sc-kg-halo { opacity: 1; }
.sc-kg .sc-kg-ring { fill: none; stroke: #fff; stroke-width: 1.5px; vector-effect: non-scaling-stroke; stroke-dasharray: 4 3; animation: sc-kg-spin 6s linear infinite; transform-box: fill-box; transform-origin: center; }
.sc-kg .vw-is-highlighted .sc-kg-ring { stroke: #ffe08a; }
.sc-kg .sc-kg-label {
  fill: #eef2ff; font-weight: 600; text-anchor: middle; dominant-baseline: hanging; pointer-events: none;
  paint-order: stroke; stroke: #050813; stroke-linejoin: round; opacity: 0; transition: opacity .2s;
}
.sc-kg .sc-kg-is-on .sc-kg-label, .sc-kg .vw-network-node:hover .sc-kg-label, .sc-kg .vw-network-node:focus-visible .sc-kg-label { opacity: 1; }
.sc-kg .sc-kg-is-selected .sc-kg-label, .sc-kg .vw-is-highlighted .sc-kg-label { fill: #fff; font-weight: 750; }
.sc-kg .vw-network-node:hover { opacity: 1; }

/* Links from the edge slot: faint threads tinted by their source community. */
.sc-kg .sc-kg-edge { fill: none; stroke-width: 1px; vector-effect: non-scaling-stroke; opacity: .38; transition: opacity .2s; }
.sc-kg .sc-kg-edge.sc-kg-edge-cross { opacity: .22; }
.sc-kg .sc-kg-edge.sc-kg-edge-related { opacity: .9; stroke-width: 1.6px; }
.sc-kg .sc-kg-edge.sc-kg-edge-path { stroke: #ffe08a; opacity: 1; stroke-width: 2.6px; stroke-dasharray: 8 6; filter: drop-shadow(0 0 4px rgb(255 214 120 / 80%)); animation: sc-kg-flow 1s linear infinite; }

.sc-kg-panel { display: flex; flex-direction: column; gap: 8px; min-width: 0; max-height: clamp(460px, 44vw, 600px); overflow: auto; padding: 16px; border: 1px solid #1c2440; border-radius: 14px; background: rgb(255 255 255 / 3%); }
.sc-kg-panel h3 { margin: 0; font-size: 18px; line-height: 1.25; color: #fff; }
.sc-kg-panel h4 { display: flex; justify-content: space-between; margin: 8px 0 0; font-size: 11px; letter-spacing: .08em; text-transform: uppercase; color: #8d97b8; }
.sc-kg-eyebrow { display: flex; align-items: center; gap: 8px; margin: 0; font-size: 11px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: #a3acc9; }
.sc-kg-muted { margin: 0; font-size: 12.5px; line-height: 1.5; color: #8d97b8; }
.sc-kg-metrics { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; margin: 4px 0; }
.sc-kg-metrics div { padding: 8px 10px; border-radius: 10px; background: rgb(255 255 255 / 4%); }
.sc-kg-actions { display: flex; gap: 6px; }
.sc-kg .sc-kg-actions button { flex: 1; }
.sc-kg-list { display: flex; flex-direction: column; gap: 2px; margin: 0; padding: 0; list-style: none; }
.sc-kg .sc-kg-list button { position: relative; display: flex; align-items: center; gap: 9px; width: 100%; padding: 7px 9px; overflow: hidden; border: 0; border-radius: 8px; background: none; font-size: 13px; text-align: start; color: #dfe6ff; }
.sc-kg .sc-kg-list button:hover:not(:disabled) { background: rgb(255 255 255 / 6%); }
.sc-kg .sc-kg-list button:disabled { opacity: .4; }
.sc-kg-bar { position: absolute; left: 0; bottom: 0; height: 2px; opacity: .7; border-radius: 2px; }

.sc-kg-foot { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 4px 16px; margin-top: 12px; font-size: 12px; }
.sc-kg-status { margin: 0; min-height: 18px; color: #e6ebff; font-weight: 500; }
.sc-kg-hint { margin: 0; color: #7f8ab0; }
@keyframes sc-kg-flow { to { stroke-dashoffset: -28; } }
@keyframes sc-kg-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) {
  .sc-kg .sc-kg-edge.sc-kg-edge-path, .sc-kg .sc-kg-ring { animation: none; }
  .sc-kg .sc-kg-halo, .sc-kg .sc-kg-core, .sc-kg .sc-kg-label, .sc-kg .sc-kg-edge { transition: none; }
}
@media (max-width: 900px) {
  .sc-kg-body { grid-template-columns: 1fr; }
  .sc-kg-panel { max-height: none; }
  .sc-kg-path { margin-left: 0; }
}
@media (max-width: 650px) {
  .sc-kg { padding: 12px; border-radius: 12px; }
  .sc-kg-stats div { min-width: 0; padding: 5px 8px; }
  .sc-kg .vw-minimap { width: 100px; height: 76px; }
}
</style>
