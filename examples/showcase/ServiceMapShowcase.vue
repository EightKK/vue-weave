<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, useId, watch } from 'vue'
import {
  GanttChart, NetworkGraph, completeGraphLayout, traverseGraph,
  type GraphBox, type GraphEdge, type GraphLayout, type GraphShownEdge, type GraphShownNode, type NetworkGroup, type NetworkNode,
  type TimelineBar, type TimelineMarker, type TimelineRow,
} from '../../src'

// A live service map in the style of an APM tool: services in nested region and namespace groups, edges as traffic
// bands whose width follows requests per second, particles whose speed follows it too and colours that follow the
// callee's error rate. Metrics come from a seeded simulation, so every render at a given tick is the same.
type Kind = 'web' | 'mobile' | 'gateway' | 'service' | 'payments' | 'search' | 'db' | 'cache' | 'queue' | 'external'
type Health = 'ok' | 'degraded' | 'critical' | 'idle'
interface SvcData { kind: Kind; tech: string; col: number; row: number; p95: number; slo: number; err: number; entry?: boolean }
type Svc = NetworkNode<SvcData> & { data: SvcData }
type Call = GraphEdge<{ rps: number }> & { data: { rps: number } }
interface Metric { rps: number; p95: number; err: number; health: Health; score: number }
interface Scenario { incidentAt?: number; failoverAt?: number }

const W = 196, H = 72
const colX = [36, 304, 548, 816, 1076]
const rowY = (row: number) => 58 + row * 88
const mapWidth = 1302, mapHeight = 772
const tickMs = 15_000
const T0 = Date.UTC(2026, 10, 22, 14, 30, 0)
const healthText: Record<Health, string> = { ok: 'Healthy', degraded: 'Degraded', critical: 'Critical', idle: 'Drained' }

const icons: Record<Kind, readonly string[]> = {
  web: ['M3 5h18v14H3z', 'M3 9h18', 'M6 7h1'],
  mobile: ['M8 3h8a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z', 'M11 18h2'],
  gateway: ['M4 12h16', 'M14 6l6 6-6 6', 'M4 6h5', 'M4 18h5'],
  service: ['M12 3l8 4.5v9L12 21l-8-4.5v-9z', 'M12 12l8-4.5', 'M12 12v9', 'M12 12 4 7.5'],
  payments: ['M3 6h18v12H3z', 'M3 10h18', 'M7 15h3'],
  search: ['M11 4a7 7 0 1 0 0 14a7 7 0 1 0 0-14z', 'M16 16l4.5 4.5'],
  db: ['M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3z', 'M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6', 'M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3'],
  cache: ['M13 2 4 14h7l-1 8 9-12h-7z'],
  queue: ['M12 3l9 5-9 5-9-5z', 'M3 13l9 5 9-5'],
  external: ['M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18z', 'M3 12h18', 'M12 3c2.6 2.6 3.8 5.6 3.8 9s-1.2 6.4-3.8 9c-2.6-2.6-3.8-5.6-3.8-9s1.2-6.4 3.8-9z'],
}
const stackIcon = ['M4 5h16v5H4z', 'M4 14h16v5H4z']

function svc(id: string, label: string, kind: Kind, tech: string, col: number, row: number, p95: number, slo: number, err: number, entry = false): Svc {
  return { id, label, data: { kind, tech, col, row, p95, slo, err, entry } }
}
const services: readonly Svc[] = [
  svc('web', 'Web app', 'web', 'next.js', 0, 0.6, 180, 400, 0.08, true),
  svc('gateway', 'API gateway', 'gateway', 'envoy', 0, 2.5, 42, 120, 0.1),
  svc('mobile', 'Mobile BFF', 'mobile', 'node', 0, 4.4, 160, 400, 0.08, true),
  svc('auth', 'Auth', 'service', 'go', 1, 0, 18, 60, 0.05),
  svc('search', 'Search', 'search', 'go', 1, 1, 64, 150, 0.12),
  svc('catalog', 'Catalog', 'service', 'java', 1, 2, 38, 120, 0.1),
  svc('cart', 'Cart', 'service', 'go', 1, 3, 22, 80, 0.06),
  svc('checkout', 'Checkout', 'service', 'java', 1, 4, 140, 350, 0.2),
  svc('recommend', 'Recommender', 'service', 'python', 2, 1.5, 88, 150, 1.6),
  svc('pricing', 'Pricing', 'service', 'rust', 2, 2.75, 16, 60, 0.04),
  svc('orders', 'Orders', 'service', 'kotlin', 2, 3.75, 46, 150, 0.12),
  svc('payments', 'Payments', 'payments', 'java', 2, 5, 120, 300, 0.15),
  svc('cache', 'Session cache', 'cache', 'redis', 3, 0, 1.2, 5, 0.01),
  svc('index', 'Search index', 'search', 'opensearch', 3, 1, 24, 80, 0.02),
  svc('events', 'Event bus', 'queue', 'kafka', 3, 2, 6, 30, 0.01),
  svc('orders-db', 'Orders DB', 'db', 'postgres', 3, 3, 8, 40, 0.02),
  svc('payments-db', 'Payments DB', 'db', 'postgres', 3, 4, 9, 40, 0.02),
  svc('checkout-eu', 'EU checkout', 'service', 'java', 1, 6.84, 150, 350, 0.1),
  svc('payments-eu', 'EU payments', 'payments', 'java', 2, 6.84, 130, 300, 0.1),
  svc('payments-db-eu', 'EU payments DB', 'db', 'postgres', 3, 6.84, 10, 40, 0.02),
  svc('fraud', 'Fraud scoring', 'external', 'vendor API', 4, 4.5, 85, 250, 0.1),
  svc('card', 'Card network', 'external', 'vendor API', 4, 5.5, 210, 600, 0.12),
]
const svcById = new Map(services.map(item => [item.id, item]))
const groups: NetworkGroup[] = [
  { id: 'us-east', label: 'us-east-1', nodeIds: [] },
  { id: 'ns-edge', label: 'edge', parentId: 'us-east', nodeIds: ['web', 'gateway', 'mobile'] },
  { id: 'ns-core', label: 'core', parentId: 'us-east', nodeIds: ['auth', 'search', 'catalog', 'cart', 'checkout', 'recommend', 'pricing', 'orders', 'payments'] },
  { id: 'ns-data', label: 'data', parentId: 'us-east', nodeIds: ['cache', 'index', 'events', 'orders-db', 'payments-db'] },
  { id: 'eu-west', label: 'eu-west-1', nodeIds: [] },
  { id: 'ns-eu-core', label: 'core (standby)', parentId: 'eu-west', nodeIds: ['checkout-eu', 'payments-eu'] },
  { id: 'ns-eu-data', label: 'data (standby)', parentId: 'eu-west', nodeIds: ['payments-db-eu'] },
  { id: 'third-party', label: 'third-party', nodeIds: ['fraud', 'card'] },
]
const regionIds = new Set(['us-east', 'eu-west'])
const groupById = new Map(groups.map(group => [group.id, group]))
const groupOfNode = new Map(groups.flatMap(group => group.nodeIds.map(id => [id, group.id] as const)))
// Every service inside a group and its child groups, found with a loop over the parent links.
const membersOf = (groupId: string) => services.filter(item => {
  for (let group = groupOfNode.get(item.id); group; group = groupById.get(group)?.parentId) if (group === groupId) return true
  return false
}).map(item => item.id)

const call = (from: string, to: string, rps: number, id = from + '-' + to): Call => {
  const vertical = svcById.get(from)!.data.col === svcById.get(to)!.data.col
  return { id, from, to, data: { rps }, edgeStyle: vertical ? 'straight' : undefined }
}
const normalCalls: Call[] = [
  call('web', 'gateway', 1450), call('mobile', 'gateway', 980),
  call('gateway', 'auth', 620), call('gateway', 'search', 540), call('gateway', 'catalog', 760), call('gateway', 'cart', 310),
  call('gateway', 'checkout', 180), call('gateway', 'checkout-eu', 24),
  call('auth', 'cache', 610), call('search', 'index', 530), call('catalog', 'recommend', 380), call('catalog', 'pricing', 720),
  call('recommend', 'cache', 360), call('cart', 'pricing', 300), call('checkout', 'cart', 170), call('checkout', 'orders', 165),
  call('checkout', 'payments', 172), call('orders', 'orders-db', 410), call('orders', 'events', 160),
  call('payments', 'payments-db', 520), call('payments', 'fraud', 170), call('payments', 'card', 168),
  call('payments-db', 'payments-db-eu', 90, 'replication'), call('checkout-eu', 'payments-eu', 22), call('payments-eu', 'payments-db-eu', 60),
]
// Failover promotes the eu-west replica: Payments writes cross the region and replication stops.
const failoverCalls: Call[] = normalCalls.flatMap(item => item.id === 'replication' ? []
  : item.id === 'payments-payments-db' ? [call('payments', 'payments-db-eu', 520, 'payments-failover')] : [item])
const graphOf = (calls: readonly Call[]) => ({ nodes: services, edges: calls })
// Hops from the payments database to each service that depends on it, with the core traversal.
function upstreamHops(calls: readonly Call[]) {
  const hops = new Map<string, number>()
  for (let depth = 0; depth <= 6; depth++) {
    for (const id of traverseGraph(graphOf(calls), ['payments-db'], { direction: 'backward', maxHops: depth }).nodeIds) if (!hops.has(id)) hops.set(id, depth)
  }
  return hops
}
const hopsByTopology = { normal: upstreamHops(normalCalls), failover: upstreamHops(failoverCalls) }
const addP95 = [480, 900, 450, 108, 50], addErr = [2.4, 6.8, 3.2, 1.2, 1.3]

/** A deterministic value in [-1, 1] for two integers: the seeded noise of the simulation. */
function noise(a: number, b: number) {
  let h = Math.imul(a ^ 0x5bd1e995, 374761393) + Math.imul(b + 7919, 668265263) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  h ^= h >>> 16
  return (h >>> 0) / 2147483647.5 - 1
}
const cache = new Map<string, { metrics: Map<string, Metric>; edges: Map<string, number> }>()
function simulate(tick: number, scenario: Scenario) {
  const key = `${tick}:${scenario.incidentAt}:${scenario.failoverAt}`
  const hit = cache.get(key)
  if (hit) return hit
  const failover = scenario.failoverAt !== undefined && tick >= scenario.failoverAt
  const incident = scenario.incidentAt !== undefined && tick >= scenario.incidentAt
  const calls = failover ? failoverCalls : normalCalls
  const wave = 1 + 0.07 * Math.sin(tick / 7) + 0.03 * Math.sin(tick / 2.3)
  const edges = new Map<string, number>(), inbound = new Map<string, number>(), outbound = new Map<string, number>()
  calls.forEach((item, index) => {
    let rps = item.data.rps * wave * (1 + 0.05 * noise(index + 1, tick))
    if (incident && !failover && (item.to === 'payments' || item.to === 'payments-db')) rps *= 0.86
    edges.set(item.id, rps)
    inbound.set(item.to, (inbound.get(item.to) ?? 0) + rps)
    outbound.set(item.from, (outbound.get(item.from) ?? 0) + rps)
  })
  const hops = incident ? hopsByTopology[failover ? 'failover' : 'normal'] : undefined
  const metrics = new Map<string, Metric>()
  services.forEach((item, index) => {
    const { p95: base, slo, err: baseErr, entry } = item.data
    const rps = (entry ? outbound.get(item.id) : inbound.get(item.id)) ?? 0
    let p95 = base * (1 + 0.06 * noise(index + 101, tick)), err = baseErr * (1 + 0.3 * noise(index + 201, tick))
    if (failover && (item.id === 'payments' || item.id === 'checkout')) p95 += 35
    const hop = hops?.get(item.id)
    if (hop !== undefined) {
      p95 += addP95[Math.min(hop, 4)]!
      err += addErr[Math.min(hop, 4)]!
    }
    const ratio = p95 / slo
    const health: Health = hop === 0 || err >= 4 || ratio >= 2 ? 'critical' : rps < 3 ? 'idle' : err >= 1 || ratio >= 1 ? 'degraded' : 'ok'
    metrics.set(item.id, { rps, p95, err, health, score: 1 / (1 + err / 3 + Math.max(0, ratio - 0.7)) })
  })
  const result = { metrics, edges }
  if (cache.size > 400) cache.clear()
  cache.set(key, result)
  return result
}

const tick = ref(0)
const scenario = ref<Scenario>({})
const live = ref(false)
const selectedId = ref<string>()
const collapsed = ref<ReadonlySet<string>>(new Set())
const graph = shallowRef<InstanceType<typeof NetworkGraph>>()
const status = ref('Paused at 14:30:00 UTC · 22 services in 2 regions; Recommender is degraded since its 14:19 deploy. Press Live to stream metrics.')
const uid = useId()
const ids = { ok: uid + '-ok', degraded: uid + '-degraded', critical: uid + '-critical', idle: uid + '-idle', glow: uid + '-glow' }

const now = computed(() => T0 + tick.value * tickMs)
const current = computed(() => simulate(tick.value, scenario.value))
const metricOf = (id: string) => current.value.metrics.get(id)!
const historyLength = 24
const history = computed(() => {
  const frames = Array.from({ length: historyLength }, (_, k) => simulate(tick.value - historyLength + 1 + k, scenario.value).metrics)
  return new Map(services.map(item => [item.id, frames.map(frame => frame.get(item.id)!.p95)]))
})
const calls = computed(() => scenario.value.failoverAt !== undefined ? failoverCalls : normalCalls)
// Nodes only change when a health state changes, so a tick redraws the cards without laying the graph out again.
const healthKey = computed(() => services.map(item => current.value.metrics.get(item.id)!.health).join(','))
const nodes = computed<Svc[]>(() => {
  const states = healthKey.value.split(',') as Health[]
  return services.map((item, index) => ({ ...item, detail: healthText[states[index]!] }))
})

function layoutMap(shown: readonly GraphShownNode<Svc, NetworkGroup>[], links: readonly GraphShownEdge<Call, NetworkGroup>[]): GraphLayout {
  const boxes = new Map<string, GraphBox>()
  for (const node of shown) {
    // A collapsed group's proxy sits in the middle of the area its services had.
    const spots = (svcById.has(node.id) ? [node.id] : membersOf(node.id)).map(id => svcById.get(id)!.data)
    const xs = spots.map(spot => colX[spot.col]!), ys = spots.map(spot => rowY(spot.row))
    const x = (Math.min(...xs) + Math.max(...xs)) / 2, y = (Math.min(...ys) + Math.max(...ys)) / 2
    boxes.set(node.id, { x, y, width: W, height: H, rank: Math.min(...spots.map(spot => spot.col)) })
  }
  return completeGraphLayout({ boxes, paths: new Map(), edgeLabels: new Map(), width: mapWidth, height: mapHeight }, shown, links).layout
}

// The shown ID of a service: the outermost collapsed group around it, or the service itself.
function shownIdOf(id: string) {
  let shown = id
  for (let group = groupOfNode.get(id); group; group = groupById.get(group)?.parentId) if (collapsed.value.has(group)) shown = group
  return shown
}
// Traffic between shown nodes, so merged edges of collapsed groups carry the sum of their calls.
const traffic = computed(() => {
  const totals = new Map<string, { rps: number; err: number }>()
  for (const item of calls.value) {
    const from = shownIdOf(item.from), to = shownIdOf(item.to)
    if (from === to) continue
    const key = from + '>' + to, entry = totals.get(key) ?? { rps: 0, err: 0 }
    entry.rps += current.value.edges.get(item.id) ?? 0
    entry.err = Math.max(entry.err, metricOf(item.to).err)
    totals.set(key, entry)
  }
  return totals
})
const maxRps = 1500
function edgeView(edge: GraphEdge, path: string) {
  const flow = traffic.value.get(edge.from + '>' + edge.to) ?? { rps: 0, err: 0 }
  const numbers = path.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [0, 0]
  const tone = flow.rps < 3 ? 'idle' : flow.err >= 4 ? 'critical' : flow.err >= 1 ? 'degraded' : 'ok'
  return {
    tone, rps: flow.rps, width: 1.4 + 11 * Math.min(1, flow.rps / maxRps), text: formatRps(flow.rps) + '/s',
    duration: (2.6 - 2.1 * Math.min(1, Math.sqrt(flow.rps / maxRps))).toFixed(2) + 's',
    x: (numbers[0]! + numbers[numbers.length - 2]!) / 2, y: (numbers[1]! + numbers[numbers.length - 1]!) / 2,
  }
}

// The blast radius: every service that calls the payments database, directly or not, on the current topology.
const blast = computed(() => {
  if (scenario.value.incidentAt === undefined) return { nodeIds: new Set<string>(), edgeIds: new Set<string>() }
  const result = traverseGraph(graphOf(calls.value), ['payments-db'], { direction: 'backward' })
  return { nodeIds: new Set(result.nodeIds), edgeIds: new Set(result.edgeIds) }
})
const chain = computed(() => selectedId.value && svcById.has(selectedId.value)
  ? new Set(traverseGraph(graphOf(calls.value), [selectedId.value]).nodeIds) : undefined)
const dimmedIds = computed(() => {
  const keep = chain.value
  if (!keep) return undefined
  const dimmed = new Set(services.filter(item => !keep.has(item.id)).map(item => item.id))
  for (const id of collapsed.value) if (!membersOf(id).some(member => keep.has(member))) dimmed.add(id)
  return dimmed
})
const neighbours = (id: string, direction: 'forward' | 'backward') =>
  traverseGraph(graphOf(calls.value), [id], { direction, maxHops: 1 }).nodeIds.filter(other => other !== id).map(other => {
    const edge = calls.value.find(item => direction === 'forward' ? item.from === id && item.to === other : item.from === other && item.to === id)!
    return { id: other, label: svcById.get(other)!.label, rps: current.value.edges.get(edge.id) ?? 0, health: metricOf(other).health }
  })
const selected = computed(() => {
  const item = selectedId.value ? svcById.get(selectedId.value) : undefined
  if (!item) return undefined
  return { item, metric: metricOf(item.id), callers: neighbours(item.id, 'backward'), callees: neighbours(item.id, 'forward') }
})
const worst = computed(() => services.map(item => ({ item, metric: metricOf(item.id) }))
  .filter(entry => entry.metric.health === 'critical' || entry.metric.health === 'degraded')
  .sort((a, b) => Number(b.metric.health === 'critical') - Number(a.metric.health === 'critical') || b.metric.err - a.metric.err))
const kpis = computed(() => {
  const gateway = metricOf('gateway'), web = metricOf('web'), mobile = metricOf('mobile')
  return { ingress: web.rps + mobile.rps, err: gateway.err, p95: Math.max(web.p95, mobile.p95), alerts: openAlerts.value }
})

function formatRps(value: number) {
  return value >= 1000 ? (value / 1000).toFixed(2) + 'k' : value >= 10 ? String(Math.round(value)) : value.toFixed(1)
}
const formatMs = (value: number) => value < 10 ? value.toFixed(1) : String(Math.round(value))
const formatPct = (value: number) => value < 1 ? value.toFixed(2) + '%' : value.toFixed(1) + '%'
const plural = (count: number, one: string, many = one + 's') => `${count} ${count === 1 ? one : many}`
const pad = (value: number) => String(value).padStart(2, '0')
function clock(time: number, seconds = true) {
  const date = new Date(time)
  return `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}${seconds ? ':' + pad(date.getUTCSeconds()) : ''}`
}
function sparkline(values: readonly number[], width: number, height: number) {
  const low = Math.min(...values), high = Math.max(Math.max(...values), low * 1.35 + 0.5)
  const points = values.map((value, index) => [index / (values.length - 1) * width, height - (value - low) / (high - low) * height] as const)
  const line = points.map(([x, y], index) => `${index ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join('')
  return { line, area: `${line}L${width} ${height}L0 ${height}Z` }
}
const ringLength = 2 * Math.PI * 15

// Alerts and deploys of the incident timeline, in simulated time.
interface Alert { id: string; service: string; label: string; severity: 'info' | 'warn' | 'crit'; start: number; end?: number }
const minute = 60_000
const staticAlerts: Alert[] = [
  { id: 'a-search', service: 'search', label: 'p95 over SLO', severity: 'warn', start: T0 - 26 * minute, end: T0 - 19 * minute },
  { id: 'a-gateway', service: 'gateway', label: '5xx burst', severity: 'crit', start: T0 - 16.5 * minute, end: T0 - 14.5 * minute },
  { id: 'a-cache', service: 'cache', label: 'Evictions', severity: 'warn', start: T0 - 15 * minute, end: T0 - 12 * minute },
  { id: 'a-recommend', service: 'recommend', label: 'Error rate 1.6%', severity: 'warn', start: T0 - 8.5 * minute },
]
const deploys: TimelineMarker[] = [
  { id: 'd-checkout', time: T0 - 22 * minute, label: 'checkout v412' },
  { id: 'd-recommend', time: T0 - 11 * minute, label: 'recommend v88' },
  { id: 'd-orders', time: T0 - 4 * minute, label: 'orders v231' },
]
const alerts = computed<Alert[]>(() => {
  const { incidentAt, failoverAt } = scenario.value
  const close = failoverAt !== undefined ? T0 + failoverAt * tickMs : undefined
  const list = [...staticAlerts]
  if (close !== undefined) list.push({ id: 'a-failover', service: 'payments', label: 'Failover', severity: 'info', start: close, end: close + 2 * minute })
  if (incidentAt === undefined) return list
  const at = (offset: number) => T0 + (incidentAt + offset) * tickMs
  list.push({ id: 'a-pdb', service: 'payments-db', label: 'p95 490 ms', severity: 'crit', start: at(0) })
  if (failoverAt !== undefined && failoverAt <= incidentAt) return list
  const upstream: [string, string, 'warn' | 'crit', number][] = [
    ['payments', 'Errors 7%', 'crit', 2], ['checkout', 'Error budget burn', 'warn', 3], ['gateway', '5xx ratio', 'warn', 4], ['web', 'Apdex < 0.85', 'warn', 6],
  ]
  for (const [service, label, severity, offset] of upstream) list.push({ id: 'a-' + service + '-incident', service, label, severity, start: at(offset), end: close })
  return list
})
const openAlerts = computed(() => alerts.value.filter(item => item.severity !== 'info' && (item.end === undefined || item.end > now.value)).length)
const range = computed(() => ({ start: now.value - 28 * minute, end: now.value + 2 * minute }))
const bars = computed<TimelineBar[]>(() => alerts.value.flatMap(item => {
  const end = item.end ?? now.value
  if (end <= item.start || item.start > now.value) return []
  return [{
    id: item.id, rowId: item.service, label: item.label, start: item.start, end,
    tone: item.severity === 'crit' ? 'violet' as const : item.severity === 'info' ? 'teal' as const : 'amber' as const, appearance: item.end !== undefined && item.end <= now.value ? 'outline' as const : 'solid' as const,
  }]
}))
const timelineRows = computed<TimelineRow[]>(() => {
  const withBars = new Set(bars.value.map(bar => bar.rowId))
  return services.filter(item => item.id === selectedId.value || (withBars.has(item.id) && (!chain.value || chain.value.has(item.id))))
    .map(item => ({ id: item.id, label: item.label, detail: plural(bars.value.filter(bar => bar.rowId === item.id).length, 'event') }))
})
const shownBars = computed(() => {
  const rows = new Set(timelineRows.value.map(row => row.id))
  return bars.value.filter(bar => rows.has(bar.rowId))
})
const timelineHeight = computed(() => Math.min(330, Math.max(150, 44 + timelineRows.value.length * 34)) + 'px')
const selectedBars = computed(() => new Set(bars.value.filter(bar => bar.rowId === selectedId.value).map(bar => bar.id)))

function selectService(id: string | undefined) {
  selectedId.value = id && svcById.has(id) ? id : undefined
  const info = selected.value
  if (!info) return
  status.value = `${info.item.label}: ${healthText[info.metric.health]} · ${formatRps(info.metric.rps)} rps · p95 ${formatMs(info.metric.p95)} ms · ${formatPct(info.metric.err)} errors · ${plural(info.callers.length, 'caller')}, ${plural(info.callees.length, 'dependency', 'dependencies')}.`
}
function startIncident() {
  scenario.value = { ...scenario.value, incidentAt: tick.value - 12 }
  const affected = blast.value.nodeIds.size - 1
  const names = [...blast.value.nodeIds].filter(id => id !== 'payments-db').map(id => svcById.get(id)!.label)
  status.value = affected
    ? `Incident: Payments DB p95 at ${formatMs(metricOf('payments-db').p95)} ms. Blast radius: ${affected} upstream services degraded (${names.join(', ')}).`
    : 'Incident: Payments DB p95 is up, but traffic already runs on the eu-west-1 replica; nothing upstream is affected.'
}
function failover() {
  scenario.value = { ...scenario.value, failoverAt: tick.value }
  status.value = 'Failed over Payments to the promoted eu-west-1 replica: Payments DB is drained and its upstream recovers (+35 ms cross-region).'
}
function reset() {
  live.value = false
  tick.value = 0
  scenario.value = {}
  selectedId.value = undefined
  collapsed.value = new Set()
  status.value = 'Reset to 14:30:00 UTC: steady state, paused.'
  void nextTick(() => graph.value?.fit())
}
function step() {
  tick.value++
}
function commitCollapse(next: ReadonlySet<string>) {
  const added = [...next].find(id => !collapsed.value.has(id)), removed = [...collapsed.value].find(id => !next.has(id))
  collapsed.value = next
  const id = added ?? removed
  if (id) status.value = `${added ? 'Collapsed' : 'Expanded'} ${groupById.get(id)!.label}: ${membersOf(id).length} services ${added ? 'behind one node' : 'shown'}.`
  // Frame the changed map once it has rendered.
  void nextTick(() => graph.value?.fit())
}

// The timeline shows the last 30 minutes across its width: measured after mounting, 24 px a minute before that.
const timelineBox = ref<HTMLElement>()
const pixelsPerMinute = ref(24)
let resize: ResizeObserver | undefined
let timer: ReturnType<typeof setInterval> | undefined
function syncTimer() {
  if (timer !== undefined) clearInterval(timer)
  timer = live.value ? setInterval(step, 1000) : undefined
}
onMounted(() => {
  watch(live, syncTimer, { immediate: true })
  const box = timelineBox.value
  if (!box || typeof ResizeObserver === 'undefined') return
  resize = new ResizeObserver(() => {
    pixelsPerMinute.value = Math.max(12, Math.floor((box.clientWidth - 150) / 30 * 10) / 10)
  })
  resize.observe(box)
})
onBeforeUnmount(() => {
  if (timer !== undefined) clearInterval(timer)
  resize?.disconnect()
})
</script>

<template>
  <section class="showcase sc-svc vw-theme-dark" aria-label="Service map">
    <svg class="sc-svc-defs" aria-hidden="true" focusable="false" width="0" height="0">
      <defs>
        <linearGradient v-for="tone in (['ok', 'degraded', 'critical', 'idle'] as const)" :id="ids[tone]" :key="tone" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" :class="'sc-svc-stop-' + tone" stop-opacity=".45" />
          <stop offset="1" :class="'sc-svc-stop-' + tone" stop-opacity="0" />
        </linearGradient>
        <filter :id="ids.glow" x="-30%" y="-40%" width="160%" height="180%">
          <feGaussianBlur stdDeviation="6" />
        </filter>
      </defs>
    </svg>
    <div class="sc-svc-head">
      <div class="sc-svc-intro">
        <h2>Service map</h2>
        <p>A simulated production topology: nested region and namespace groups that collapse, cards from the node slot, traffic bands from the edge slot, the blast radius from <code>traverseGraph</code> and an incident timeline in a linked <code>GanttChart</code>.</p>
      </div>
      <dl class="sc-svc-kpis">
        <div><dt>Ingress</dt><dd>{{ formatRps(kpis.ingress) }}<small> rps</small></dd></div>
        <div><dt>Gateway errors</dt><dd :class="{ 'sc-svc-bad': kpis.err >= 1 }">{{ formatPct(kpis.err) }}</dd></div>
        <div><dt>Client p95</dt><dd>{{ formatMs(kpis.p95) }}<small> ms</small></dd></div>
        <div><dt>Open alerts</dt><dd :class="{ 'sc-svc-bad': kpis.alerts > 1 }">{{ kpis.alerts }}</dd></div>
      </dl>
    </div>
    <div class="sc-svc-toolbar" role="toolbar" aria-label="Simulation">
      <button type="button" class="sc-svc-live" :aria-pressed="live" @click="live = !live"><span aria-hidden="true" />Live</button>
      <button type="button" :disabled="live" @click="step">Step +15 s</button>
      <span class="sc-svc-clock" aria-label="Simulated time">{{ clock(now) }} <small>UTC</small></span>
      <span class="sc-svc-spacer" />
      <button type="button" class="sc-svc-danger" :disabled="scenario.incidentAt !== undefined" @click="startIncident">Incident: payments DB latency</button>
      <button type="button" :disabled="scenario.failoverAt !== undefined" @click="failover">Failover to eu-west</button>
      <button type="button" @click="reset">Reset</button>
    </div>
    <div class="sc-svc-stage">
      <NetworkGraph
        ref="graph" :selected-id="selectedId" unstyled-node-slots class="sc-svc-graph" :nodes="nodes" :edges="calls" :groups="groups" :layout="layoutMap"
        height="clamp(380px, 50vw, 660px)" background="dots" collapsible-groups :collapsed-group-ids="collapsed"
        :highlighted-node-ids="blast.nodeIds" :highlighted-edge-ids="blast.edgeIds" :dimmed-ids="dimmedIds"
        :labels="{ region: 'Service topology' }" @update:collapsed-group-ids="commitCollapse" @update:selected-id="selectService"
      >
        <template #group="{ group, box, depth }">
          <g :class="['sc-svc-group', regionIds.has(group.id) ? 'sc-svc-region' : 'sc-svc-ns']">
            <rect :x="box.x" :y="box.y" :width="box.width" :height="box.height" :rx="depth === 0 ? 16 : 12" />
            <text :x="box.x + 12" :y="box.y + 15">
              <tspan class="sc-svc-group-kind">{{ regionIds.has(group.id) ? 'region' : 'ns' }}</tspan>
              <tspan dx="6">{{ group.label }}</tspan>
              <tspan v-if="group.id === 'us-east'" class="sc-svc-group-role" dx="8">primary</tspan>
              <tspan v-else-if="group.id === 'eu-west'" class="sc-svc-group-role" dx="8">warm standby</tspan>
            </text>
          </g>
        </template>
        <template #node="{ node, box, selected: isSelected, highlighted }">
          <rect v-if="highlighted" class="sc-svc-halo" x="-4" y="-4" :width="box.width + 8" :height="box.height + 8" rx="15" :filter="`url(#${ids.glow})`" />
          <template v-if="svcById.has(node.id)">
            <g :class="['sc-svc-card', 'sc-svc-' + metricOf(node.id).health, { 'sc-svc-is-selected': isSelected }]">
              <rect class="sc-svc-face" :width="box.width" :height="box.height" rx="12" />
              <circle class="sc-svc-ring-track" cx="28" cy="36" r="15" />
              <circle class="sc-svc-ring" cx="28" cy="36" r="15" :stroke-dasharray="`${(metricOf(node.id).score * ringLength).toFixed(1)} ${ringLength}`" transform="rotate(-90 28 36)" />
              <g class="sc-svc-icon" transform="translate(20 28) scale(.667)"><path v-for="d in icons[svcById.get(node.id)!.data.kind]" :key="d" :d="d" /></g>
              <text class="sc-svc-name" x="54" y="25">{{ node.label }}</text>
              <text class="sc-svc-tech" x="54" y="39">{{ svcById.get(node.id)!.data.tech }}</text>
              <g transform="translate(146 12)">
                <path class="sc-svc-spark-area" :d="sparkline(history.get(node.id)!, 40, 20).area" :fill="`url(#${ids[metricOf(node.id).health]})`" />
                <path class="sc-svc-spark" :d="sparkline(history.get(node.id)!, 40, 20).line" />
              </g>
              <text class="sc-svc-metric" x="54" y="60">{{ formatRps(metricOf(node.id).rps) }}<tspan> rps</tspan></text>
              <text class="sc-svc-metric" x="104" y="60" :class="{ 'sc-svc-hot': metricOf(node.id).p95 >= svcById.get(node.id)!.data.slo }">{{ formatMs(metricOf(node.id).p95) }}<tspan> ms</tspan></text>
              <text class="sc-svc-metric" x="152" y="60" :class="{ 'sc-svc-hot': metricOf(node.id).err >= 1 }">{{ formatPct(metricOf(node.id).err) }}</text>
            </g>
          </template>
          <g v-else class="sc-svc-card sc-svc-proxy">
            <rect class="sc-svc-face" :width="box.width" :height="box.height" rx="12" />
            <rect class="sc-svc-face sc-svc-stack" x="6" y="-5" :width="box.width - 12" height="8" rx="4" />
            <g class="sc-svc-icon" transform="translate(16 24) scale(1)"><path v-for="d in stackIcon" :key="d" :d="d" /></g>
            <text class="sc-svc-name" x="54" y="30">{{ node.label }}</text>
            <text class="sc-svc-proxy-note" x="54" y="45">{{ membersOf(node.id).length }} services, {{ membersOf(node.id).filter(id => metricOf(id).health === 'critical' || metricOf(id).health === 'degraded').length }} unhealthy</text>
            <text class="sc-svc-metric" x="54" y="61">{{ formatRps(membersOf(node.id).reduce((sum, id) => sum + metricOf(id).rps, 0)) }}<tspan> rps total</tspan></text>
          </g>
        </template>
        <template #edge="{ edge, path, highlighted }">
          <g :class="['sc-svc-edge', 'sc-svc-edge-' + edgeView(edge, path).tone, { 'sc-svc-edge-hot': highlighted, 'sc-svc-edge-replica': edge.id === 'replication', 'sc-svc-edge-failover': edge.id === 'payments-failover' }]">
            <path class="sc-svc-band" :d="path" :style="{ strokeWidth: edgeView(edge, path).width + 'px' }" />
            <path v-if="edgeView(edge, path).tone !== 'idle'" class="sc-svc-flow" :d="path"
              :style="{ strokeWidth: Math.max(1.6, edgeView(edge, path).width * 0.42) + 'px', animationDuration: edgeView(edge, path).duration }" />
            <g v-if="edgeView(edge, path).rps >= 280 || highlighted || edge.id === 'payments-failover'" class="sc-svc-edge-label"
              :transform="`translate(${edgeView(edge, path).x} ${edgeView(edge, path).y})`">
              <rect :x="-edgeView(edge, path).text.length * 3.1 - 6" y="-8" :width="edgeView(edge, path).text.length * 6.2 + 12" height="16" rx="8" />
              <text y="3.6">{{ edgeView(edge, path).text }}</text>
            </g>
          </g>
        </template>
      </NetworkGraph>
      <ul class="sc-svc-legend" aria-label="Legend">
        <li><span class="sc-svc-swatch sc-svc-ok" />Healthy</li>
        <li><span class="sc-svc-swatch sc-svc-degraded" />Degraded</li>
        <li><span class="sc-svc-swatch sc-svc-critical" />Critical</li>
        <li><span class="sc-svc-swatch sc-svc-idle" />Drained</li>
        <li class="sc-svc-legend-note">Band width and particle speed follow requests per second; colour follows the callee's error rate.</li>
      </ul>
    </div>
    <div class="sc-svc-bottom">
      <div ref="timelineBox" class="sc-svc-timeline">
        <h3>Incident timeline <span>{{ selected ? selected.item.label + ' and its dependency chain' : 'all services' }} · last 30 min</span></h3>
        <GanttChart
          :rows="timelineRows" :bars="shownBars" :range="range" :pixels-per-unit="pixelsPerMinute / minute" :tick-steps="[5 * minute]" :format-time="time => clock(time, false)"
          :markers="deploys" show-now :now="now" readonly :row-height="34" :height="timelineHeight" :show-controls="false"
          :selected-ids="selectedBars" :labels="{ region: 'Incident timeline', rows: 'Service', now: 'Now', empty: 'No alerts in this window' }"
          @select="id => selectService(alerts.find(item => item.id === id)?.service)"
        />
      </div>
      <aside class="sc-svc-panel" aria-label="Service details">
        <template v-if="selected">
          <div class="sc-svc-panel-head">
            <span :class="['sc-svc-pill', 'sc-svc-' + selected.metric.health]">{{ healthText[selected.metric.health] }}</span>
            <h3>{{ selected.item.label }}</h3>
            <p>{{ selected.item.data.tech }} · {{ groupById.get(groupOfNode.get(selected.item.id)!)!.label }} · {{ selected.item.data.col === 4 ? 'external' : selected.item.data.row > 6 ? 'eu-west-1' : 'us-east-1' }}</p>
            <button type="button" class="sc-svc-close" aria-label="Clear selection" @click="selectedId = undefined">×</button>
          </div>
          <dl class="sc-svc-stats">
            <div><dt>Throughput</dt><dd>{{ formatRps(selected.metric.rps) }}<small> rps</small></dd></div>
            <div><dt>Latency p95</dt><dd :class="{ 'sc-svc-bad': selected.metric.p95 >= selected.item.data.slo }">{{ formatMs(selected.metric.p95) }}<small> ms</small></dd><span>SLO {{ selected.item.data.slo }} ms</span></div>
            <div><dt>Errors</dt><dd :class="{ 'sc-svc-bad': selected.metric.err >= 1 }">{{ formatPct(selected.metric.err) }}</dd></div>
          </dl>
          <svg class="sc-svc-panel-spark" viewBox="0 0 280 44" preserveAspectRatio="none" aria-hidden="true">
            <path class="sc-svc-spark-area" :d="sparkline(history.get(selected.item.id)!, 280, 40).area" :fill="`url(#${ids[selected.metric.health]})`" transform="translate(0 2)" />
            <path class="sc-svc-spark" :class="'sc-svc-' + selected.metric.health" :d="sparkline(history.get(selected.item.id)!, 280, 40).line" transform="translate(0 2)" />
          </svg>
          <p v-if="blast.nodeIds.has(selected.item.id)" class="sc-svc-radius">In the blast radius of Payments DB.</p>
          <div class="sc-svc-lists">
            <div v-for="list in [{ title: 'Called by', items: selected.callers }, { title: 'Calls', items: selected.callees }]" :key="list.title">
              <h4>{{ list.title }}</h4>
              <ul :aria-label="list.title">
                <li v-for="item in list.items" :key="item.id">
                  <button type="button" @click="selectService(item.id)"><span :class="['sc-svc-dot', 'sc-svc-' + item.health]" />{{ item.label }}<small>{{ formatRps(item.rps) }}/s</small></button>
                </li>
                <li v-if="!list.items.length" class="sc-svc-none">None</li>
              </ul>
            </div>
          </div>
        </template>
        <template v-else>
          <h3>Needs attention</h3>
          <ul class="sc-svc-attention" aria-label="Needs attention">
            <li v-for="entry in worst" :key="entry.item.id">
              <button type="button" @click="selectService(entry.item.id)">
                <span :class="['sc-svc-dot', 'sc-svc-' + entry.metric.health]" />{{ entry.item.label }}
                <small>p95 {{ formatMs(entry.metric.p95) }} ms · {{ formatPct(entry.metric.err) }}</small>
              </button>
            </li>
          </ul>
          <p class="sc-svc-hint">Select a service on the map, in this list or in the timeline to trace its callers and dependencies.</p>
        </template>
      </aside>
    </div>
    <p class="sc-svc-status" role="status">{{ status }}</p>
  </section>
</template>

<style>
.sc-svc {
  color-scheme: dark;
  --sc-svc-ok: #34d399;
  --sc-svc-degraded: #fbbf24;
  --sc-svc-critical: #f87171;
  --sc-svc-idle: #64748b;
  --sc-svc-flow: #7aa2ff;
  --vw-surface: #0e1626;
  --vw-surface-muted: #0a111f;
  --vw-surface-hover: #172238;
  --vw-text: #e2e8f3;
  --vw-muted: #8592ab;
  --vw-border: #1e2a42;
  --vw-grid: #18233a;
  --vw-edge: #3b4a66;
  --vw-accent: #7c9cff;
  --vw-on-solid: #0a101d;
  --vw-background-pattern: #1b2742;
  --vw-graph-highlight: #f87171;
  --vw-dimmed-opacity: .2;
  --vw-now: #7c9cff;
  --vw-marker: #a78bfa;
  --vw-marker-ink: #0a101d;
  --vw-row-label-width: 128px;
  --vw-amber-solid: #f5b83d; --vw-amber-pale: #33270f; --vw-amber-line: #a77c1e; --vw-amber-ink: #fde7a8;
  --vw-teal-solid: #34d399; --vw-teal-pale: #0f2a22; --vw-teal-line: #1f7a57; --vw-teal-ink: #a7f3d0;
  --vw-violet-solid: #f87171; --vw-violet-pale: #3a1519; --vw-violet-line: #b94249; --vw-violet-ink: #fecaca;
  background: radial-gradient(1200px 500px at 20% -10%, #15213b 0%, transparent 60%), #0a101d;
  color: #e2e8f3;
  border: 1px solid #1a2540;
  border-radius: 16px;
  padding: 18px;
}
.sc-svc-defs { position: absolute; width: 0; height: 0; overflow: hidden; }
.sc-svc-stop-ok { stop-color: #34d399; }
.sc-svc-stop-degraded { stop-color: #fbbf24; }
.sc-svc-stop-critical { stop-color: #f87171; }
.sc-svc-stop-idle { stop-color: #64748b; }
.sc-svc-head { display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: 12px 24px; margin-bottom: 12px; }
.sc-svc-intro { flex: 1 1 420px; min-width: 0; }
.sc-svc h2 { margin: 0 0 4px; font-size: 18px; letter-spacing: -.01em; color: #f4f7fb; }
.sc-svc-intro p { margin: 0; max-width: 92ch; font-size: 13px; line-height: 1.5; color: #93a1ba; }
.sc-svc code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12px; padding: 1px 4px; border-radius: 4px; background: #16203a; color: #c7d4f5; }
.sc-svc-kpis { display: flex; flex-wrap: wrap; gap: 8px; margin: 0; }
.sc-svc-kpis div { min-width: 104px; padding: 7px 12px; border: 1px solid #1e2a42; border-radius: 10px; background: #0e1626; }
.sc-svc-kpis dt { font-size: 10px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: #7d8ba6; }
.sc-svc-kpis dd { margin: 2px 0 0; font-size: 18px; font-weight: 650; font-variant-numeric: tabular-nums; color: #f4f7fb; }
.sc-svc dd small { font-size: 11px; font-weight: 500; color: #7d8ba6; }
.sc-svc dd.sc-svc-bad { color: #f87171; }
.sc-svc-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-bottom: 10px; }
.sc-svc-spacer { flex: 1; }
.sc-svc .sc-svc-toolbar button, .sc-svc .sc-svc-panel button { border: 1px solid #253353; border-radius: 8px; padding: 6px 12px; background: #111b30; color: #d6deec; font-size: 12px; font-weight: 600; }
.sc-svc .sc-svc-toolbar button:hover:not(:disabled), .sc-svc .sc-svc-panel button:hover { background: #18243f; border-color: #33456b; }
.sc-svc .sc-svc-toolbar button:disabled { opacity: .45; cursor: default; }
.sc-svc .sc-svc-toolbar button:focus-visible, .sc-svc .sc-svc-panel button:focus-visible { outline: 2px solid #7c9cff; outline-offset: 2px; }
.sc-svc .sc-svc-live { display: inline-flex; align-items: center; gap: 7px; }
.sc-svc-live span { width: 8px; height: 8px; border-radius: 50%; background: #64748b; }
.sc-svc .sc-svc-live[aria-pressed=true] { border-color: #1f7a57; background: #0f2a22; color: #8af0c6; }
.sc-svc-live[aria-pressed=true] span { background: #34d399; box-shadow: 0 0 0 3px rgb(52 211 153 / 20%); animation: sc-svc-pulse 1.4s ease-in-out infinite; }
.sc-svc .sc-svc-danger { border-color: #5a2430; color: #fecaca; background: #23121a; }
.sc-svc .sc-svc-danger:hover:not(:disabled) { background: #311722; border-color: #7a2f3d; }
.sc-svc-clock { padding: 5px 10px; border-radius: 8px; background: #0e1626; border: 1px solid #1e2a42; font: 600 13px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; color: #c7d4f5; font-variant-numeric: tabular-nums; }
.sc-svc-clock small { color: #7d8ba6; font-size: 10px; }
.sc-svc-stage { position: relative; }
.sc-svc-legend { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 16px; margin: 8px 0 0; padding: 0 4px; list-style: none; font-size: 11px; color: #b7c3d9; }
.sc-svc-legend li { display: flex; align-items: center; gap: 6px; }
.sc-svc-legend .sc-svc-legend-note { margin-inline-start: auto; color: #7d8ba6; }
.sc-svc-swatch { width: 14px; height: 4px; border-radius: 2px; background: currentColor; }
.sc-svc-swatch.sc-svc-ok, .sc-svc-dot.sc-svc-ok { color: var(--sc-svc-ok); }
.sc-svc-swatch.sc-svc-degraded, .sc-svc-dot.sc-svc-degraded { color: var(--sc-svc-degraded); }
.sc-svc-swatch.sc-svc-critical, .sc-svc-dot.sc-svc-critical { color: var(--sc-svc-critical); }
.sc-svc-swatch.sc-svc-idle, .sc-svc-dot.sc-svc-idle { color: var(--sc-svc-idle); }

/* Canvas and zoom tools. */
.sc-svc .vw-network { border: 1px solid #1a2540; border-radius: 12px; overflow: hidden; background: #0a101d; }
.sc-svc .vw-zoom-tools { border: 1px solid #22304d; border-radius: 10px; background: #0e1626; }
.sc-svc .vw-zoom-tools button { background: #0e1626; color: #c7d4f5; }
.sc-svc .vw-zoom-tools button:hover { background: #172238; }

/* Region and namespace frames from the group slot. */
.sc-svc .sc-svc-group text { font-size: 10.5px; font-weight: 650; fill: #aab8d3; pointer-events: none; }
.sc-svc .sc-svc-group-kind { font-size: 9px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; fill: #6377a0; }
.sc-svc .sc-svc-group-role { font-weight: 500; fill: #6c7c9c; }
.sc-svc .sc-svc-region rect { fill: rgb(124 156 255 / 3%); stroke: rgb(124 156 255 / 38%); stroke-width: 1.2px; stroke-dasharray: 6 5; }
.sc-svc .sc-svc-region text { font-size: 12px; fill: #dbe4ff; }
.sc-svc .sc-svc-ns rect { fill: rgb(148 163 200 / 4%); stroke: #1e2a45; stroke-width: 1px; }
.sc-svc .vw-group-toggle rect { fill: #111b30; stroke: #3a4c74; }
.sc-svc .vw-group-toggle path { stroke: #c7d4f5; }
.sc-svc .vw-group-toggle:hover rect { stroke: #7c9cff; }

/* Service cards from the node slot. */
.sc-svc .vw-network-node:focus-visible { outline: none; }
.sc-svc .vw-network-node .sc-svc-face { fill: #111a2e; stroke: #24314f; stroke-width: 1px; transition: stroke .2s; }
.sc-svc .vw-network-node:hover .sc-svc-face { stroke: #3a4c74; }
.sc-svc .vw-network-node:focus-visible .sc-svc-face, .sc-svc .vw-network-node .sc-svc-is-selected .sc-svc-face { stroke: #7c9cff; stroke-width: 2px; }
.sc-svc .vw-network-node .sc-svc-stack { fill: #0d1527; }
.sc-svc .vw-network-node .sc-svc-halo { fill: rgb(248 113 113 / 30%); stroke: none; animation: sc-svc-pulse 1.6s ease-in-out infinite; }
.sc-svc .vw-network-node .sc-svc-critical .sc-svc-face { stroke: #7a2f3d; fill: #1a1424; }
.sc-svc .vw-network-node .sc-svc-degraded .sc-svc-face { stroke: #5c4a1c; }
.sc-svc .vw-network-node .sc-svc-is-selected.sc-svc-card .sc-svc-face { stroke: #7c9cff; }
.sc-svc .vw-network-node .sc-svc-ring-track { fill: #0b1222; stroke: #1f2b46; stroke-width: 3.5px; }
.sc-svc .vw-network-node .sc-svc-ring { fill: none; stroke-width: 3.5px; stroke-linecap: round; transition: stroke-dasharray .6s ease; }
.sc-svc .sc-svc-ok .sc-svc-ring, .sc-svc .sc-svc-ok .sc-svc-spark, .sc-svc-spark.sc-svc-ok { stroke: var(--sc-svc-ok); }
.sc-svc .sc-svc-degraded .sc-svc-ring, .sc-svc .sc-svc-degraded .sc-svc-spark, .sc-svc-spark.sc-svc-degraded { stroke: var(--sc-svc-degraded); }
.sc-svc .sc-svc-critical .sc-svc-ring, .sc-svc .sc-svc-critical .sc-svc-spark, .sc-svc-spark.sc-svc-critical { stroke: var(--sc-svc-critical); }
.sc-svc .sc-svc-idle .sc-svc-ring, .sc-svc .sc-svc-idle .sc-svc-spark, .sc-svc-spark.sc-svc-idle { stroke: var(--sc-svc-idle); }
.sc-svc .sc-svc-icon path { fill: none; stroke: #c7d4f5; stroke-width: 1.8px; stroke-linecap: round; stroke-linejoin: round; }
.sc-svc .vw-network-node .sc-svc-name { fill: #eef2f9; font-size: 12.5px; font-weight: 650; }
.sc-svc .vw-network-node .sc-svc-tech { fill: #7586a6; font-size: 10px; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
.sc-svc .vw-network-node .sc-svc-proxy-note { fill: #8b9bb8; font-size: 10px; }
.sc-svc .vw-network-node .sc-svc-metric { fill: #dbe3f1; font-size: 11px; font-weight: 650; font-variant-numeric: tabular-nums; }
.sc-svc .vw-network-node .sc-svc-metric tspan { fill: #6f7f9e; font-size: 9px; font-weight: 500; }
.sc-svc .vw-network-node .sc-svc-metric.sc-svc-hot { fill: #fca5a5; }
.sc-svc .sc-svc-spark { fill: none; stroke-width: 1.4px; stroke-linejoin: round; }
.sc-svc .vw-network-node .sc-svc-spark-area { stroke: none; }
.sc-svc .vw-network-node .sc-svc-spark { fill: none; }

/* Traffic from the edge slot: a band as wide as the traffic and particles as fast as it. */
.sc-svc .sc-svc-band { fill: none; stroke: var(--sc-svc-flow); stroke-opacity: .3; stroke-linecap: round; transition: stroke-width .6s ease; }
.sc-svc .sc-svc-flow { fill: none; stroke: #b9ccff; stroke-dasharray: .1 11.9; stroke-linecap: round; animation: sc-svc-flow 1s linear infinite; }
.sc-svc .sc-svc-edge-degraded .sc-svc-band { stroke: var(--sc-svc-degraded); stroke-opacity: .28; }
.sc-svc .sc-svc-edge-degraded .sc-svc-flow { stroke: #fde68a; }
.sc-svc .sc-svc-edge-critical .sc-svc-band { stroke: var(--sc-svc-critical); stroke-opacity: .34; }
.sc-svc .sc-svc-edge-critical .sc-svc-flow { stroke: #fecaca; }
.sc-svc .sc-svc-edge-idle .sc-svc-band { stroke: #475569; stroke-opacity: .5; stroke-dasharray: 3 4; }
.sc-svc .sc-svc-edge-replica .sc-svc-band { stroke: #a78bfa; stroke-opacity: .35; stroke-dasharray: 5 4; }
.sc-svc .sc-svc-edge-replica .sc-svc-flow { stroke: #ddd6fe; }
.sc-svc .sc-svc-edge-failover .sc-svc-band { stroke: #34d399; stroke-opacity: .35; }
.sc-svc .sc-svc-edge-failover .sc-svc-flow { stroke: #a7f3d0; }
.sc-svc .sc-svc-edge-hot .sc-svc-band { stroke-opacity: .5; }
.sc-svc .sc-svc-edge-label rect { fill: #0c1426; stroke: #26355a; stroke-width: 1px; }
.sc-svc .sc-svc-edge-label text { fill: #b7c6e6; font-size: 9.5px; font-weight: 650; text-anchor: middle; font-variant-numeric: tabular-nums; }
.sc-svc .sc-svc-edge-critical .sc-svc-edge-label rect { stroke: #7a2f3d; }
.sc-svc .sc-svc-edge-critical .sc-svc-edge-label text { fill: #fecaca; }
.sc-svc .sc-svc-edge-degraded .sc-svc-edge-label rect { stroke: #5c4a1c; }
.sc-svc .sc-svc-edge-degraded .sc-svc-edge-label text { fill: #fde68a; }

/* Incident timeline and the service panel. */
.sc-svc-bottom { display: grid; grid-template-columns: minmax(0, 1fr) 330px; gap: 14px; margin-top: 14px; }
.sc-svc h3 { margin: 0 0 8px; font-size: 13px; color: #eef2f9; }
.sc-svc-timeline h3 span { font-weight: 500; color: #7d8ba6; }
.sc-svc-timeline .vw-gantt { border: 1px solid #1a2540; border-radius: 12px; overflow: hidden; background: #0e1626; }
.sc-svc-timeline .vw-gantt-toolbar { display: none; }
.sc-svc-timeline .vw-gantt-scroll { border-block: 0; }
.sc-svc-timeline .vw-gantt-bar { border-radius: 5px; font-size: 10.5px; }
.sc-svc-panel { padding: 14px; border: 1px solid #1a2540; border-radius: 12px; background: #0e1626; font-size: 12px; }
.sc-svc-panel-head { position: relative; padding-right: 30px; }
.sc-svc-panel-head h3 { margin: 6px 0 2px; font-size: 16px; }
.sc-svc-panel-head p { margin: 0; color: #7586a6; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 11px; }
.sc-svc .sc-svc-panel .sc-svc-close { position: absolute; top: 0; right: 0; width: 26px; height: 26px; padding: 0; font-size: 16px; line-height: 1; }
.sc-svc-pill { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 10.5px; font-weight: 700; background: color-mix(in srgb, currentColor 16%, transparent); }
.sc-svc-pill.sc-svc-ok { color: var(--sc-svc-ok); }
.sc-svc-pill.sc-svc-degraded { color: var(--sc-svc-degraded); }
.sc-svc-pill.sc-svc-critical { color: var(--sc-svc-critical); }
.sc-svc-pill.sc-svc-idle { color: #94a3b8; }
.sc-svc-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin: 12px 0 8px; }
.sc-svc-stats dt { font-size: 10px; letter-spacing: .06em; text-transform: uppercase; color: #7d8ba6; }
.sc-svc-stats dd { margin: 2px 0 0; font-size: 17px; font-weight: 650; font-variant-numeric: tabular-nums; }
.sc-svc-stats span { font-size: 10px; color: #6f7f9e; }
.sc-svc-panel-spark { display: block; width: 100%; height: 44px; }
.sc-svc-radius { margin: 6px 0 0; padding: 6px 9px; border-radius: 8px; background: #2a1219; color: #fecaca; }
.sc-svc-lists { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 10px; }
.sc-svc h4 { margin: 0 0 4px; font-size: 10px; letter-spacing: .08em; text-transform: uppercase; color: #7d8ba6; }
.sc-svc-panel ul { display: grid; gap: 4px; margin: 0; padding: 0; list-style: none; }
.sc-svc .sc-svc-panel li button { display: flex; align-items: center; gap: 6px; width: 100%; padding: 4px 7px; text-align: start; font-weight: 600; }
.sc-svc-panel li button small { margin-inline-start: auto; color: #7d8ba6; font-weight: 500; font-variant-numeric: tabular-nums; }
.sc-svc-dot { width: 7px; height: 7px; flex: none; border-radius: 50%; background: currentColor; }
.sc-svc-none, .sc-svc-hint { color: #6f7f9e; }
.sc-svc-hint { margin: 10px 0 0; line-height: 1.45; }
.sc-svc-status { margin: 10px 0 0; min-height: 18px; font-size: 12px; font-weight: 500; color: #c7d4f5; }
@keyframes sc-svc-flow { to { stroke-dashoffset: -24; } }
@keyframes sc-svc-pulse { 50% { opacity: .35; } }
@media (prefers-reduced-motion: reduce) {
  .sc-svc .sc-svc-flow, .sc-svc .sc-svc-halo, .sc-svc-live[aria-pressed=true] span { animation: none; }
  .sc-svc .sc-svc-band, .sc-svc .sc-svc-ring, .sc-svc .vw-network-node .sc-svc-face { transition: none; }
}
@media (max-width: 900px) {
  .sc-svc { padding: 12px; }
  .sc-svc-bottom { grid-template-columns: minmax(0, 1fr); }
  .sc-svc-legend .sc-svc-legend-note { margin-inline-start: 0; }
}
</style>
