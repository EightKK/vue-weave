<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import {
  GanttChart, NetworkGraph, completeGraphLayout, topologicalOrder, useLinkedSelection,
  type GraphBox, type GraphEdge, type GraphLayout, type NetworkNode, type TimelineBar, type TimelineRow, type ViewBinding,
  type ViewTargetEvent,
} from '../../src'

// A live CI/CD run monitor. The run is simulated on its own clock (milliseconds since the run started) with fixed
// durations, so every state is a pure function of the clock and of the user's actions: inject a failure, retry, approve.
// It starts paused in the middle of the end-to-end shards, so the first render is deterministic.
type Status = 'queued' | 'running' | 'passed' | 'failed' | 'skipped' | 'waiting'
interface Job { id: string; name: string; matrix?: string; needs: string[]; duration: number; pickup: number; gate?: boolean }
interface Attempt { start: number; end: number; result: 'passed' | 'failed' }
interface Plan { attempts: Attempt[]; done: number; outcome: 'passed' | 'failed' | 'skipped'; pending?: boolean }
type JobNode = NetworkNode<Job> & { data: Job }

const second = 1000
const unit = (matrix: string, duration: number, pickup: number): Job =>
  ({ id: 'unit-' + matrix.slice(5), name: 'Unit tests', matrix, needs: ['install'], duration, pickup })
const shard = (index: number, duration: number, pickup: number): Job =>
  ({ id: `e2e-${index}`, name: 'E2E tests', matrix: `shard ${index}/3`, needs: ['build'], duration, pickup })
const jobs: readonly Job[] = [
  { id: 'checkout', name: 'Checkout', needs: [], duration: 6, pickup: 2 },
  { id: 'install', name: 'Install', needs: ['checkout'], duration: 38, pickup: 3 },
  { id: 'lint', name: 'Lint', needs: ['install'], duration: 22, pickup: 2 },
  { id: 'typecheck', name: 'Typecheck', needs: ['install'], duration: 31, pickup: 3 },
  unit('node 20', 64, 4), unit('node 22', 58, 3), unit('node 24', 61, 5),
  { id: 'build', name: 'Build', needs: ['lint', 'typecheck', 'unit-20', 'unit-22', 'unit-24'], duration: 47, pickup: 3 },
  shard(1, 96, 3), shard(2, 112, 4), shard(3, 88, 3),
  { id: 'security', name: 'Security scan', needs: ['build'], duration: 84, pickup: 2 },
  { id: 'staging', name: 'Deploy staging', needs: ['e2e-1', 'e2e-2', 'e2e-3', 'security'], duration: 41, pickup: 3 },
  { id: 'approval', name: 'Approval', needs: ['staging'], duration: 0, pickup: 0, gate: true },
  { id: 'canary', name: 'Canary 10%', needs: ['approval'], duration: 75, pickup: 3 },
  { id: 'production', name: 'Production', needs: ['canary'], duration: 36, pickup: 3 },
]
const jobById = new Map(jobs.map(job => [job.id, job]))
const fullName = (job: Job) => job.matrix ? `${job.name} · ${job.matrix}` : job.name
const nameOf = (id: string) => fullName(jobById.get(id)!)
const failingJob = 'e2e-2'
const startClock = 215 * second

// Graph columns: the widths and order of the cards, stacked and centred vertically in each column.
const columns: { width: number; ids: string[] }[] = [
  { width: 108, ids: ['checkout'] }, { width: 108, ids: ['install'] },
  { width: 148, ids: ['lint', 'typecheck', 'unit-20', 'unit-22', 'unit-24'] }, { width: 112, ids: ['build'] },
  { width: 148, ids: ['e2e-1', 'e2e-2', 'e2e-3', 'security'] }, { width: 140, ids: ['staging'] },
  { width: 116, ids: ['approval'] }, { width: 124, ids: ['canary'] }, { width: 124, ids: ['production'] },
]
const cardHeight = 60, columnGap = 26, rowGap = 12, padding = 16
const edges: GraphEdge[] = jobs.flatMap(job => job.needs.map(from => ({ id: `${from}->${job.id}`, from, to: job.id, label: `${nameOf(from)} to ${fullName(job)}` })))

function layoutJobs(nodes: readonly JobNode[], links: readonly GraphEdge[]): GraphLayout {
  const tallest = Math.max(...columns.map(column => column.ids.length))
  const height = tallest * cardHeight + (tallest - 1) * rowGap + 2 * padding
  const boxes = new Map<string, GraphBox>()
  let x = padding
  columns.forEach((column, rank) => {
    const stack = column.ids.length * cardHeight + (column.ids.length - 1) * rowGap
    column.ids.forEach((id, index) => boxes.set(id, {
      x, y: (height - stack) / 2 + index * (cardHeight + rowGap), width: column.width, height: cardHeight, rank,
    }))
    x += column.width + columnGap
  })
  const base = { boxes, paths: new Map<string, string>(), edgeLabels: new Map(), width: x - columnGap + padding, height }
  return completeGraphLayout(base, nodes, links).layout
}

// The run state the user controls. `failure.at` is when the failure was injected; `retryAt` and `approvedAt` are the
// clock times of the retry and the approval.
const clock = ref(startClock)
const playing = ref(false)
const chaos = ref(false)
const failure = ref<{ at: number }>()
const retryAt = ref<number>()
const approvedAt = ref<number>()
const message = ref('Run #2184 is paused in the end-to-end shards. Press Play, inject a failure, or select a job.')

// Plans every job from its needs: a failed or skipped need skips it; the approval gate holds until approved (projected
// as approved now); the failing job fails at the injection, or a third of the way in, and its retry passes.
const plans = computed(() => {
  const now = clock.value, result = new Map<string, Plan>()
  for (const job of jobs) {
    const needs = job.needs.map(id => result.get(id)!)
    const ready = Math.max(0, ...needs.map(plan => plan.done))
    const broken = needs.filter(plan => plan.outcome !== 'passed')
    if (broken.length) {
      const at = Math.min(...broken.map(plan => plan.done))
      result.set(job.id, { attempts: [], done: at, outcome: 'skipped' })
    } else if (job.gate) {
      const end = approvedAt.value ?? Math.max(ready, now)
      result.set(job.id, { attempts: [{ start: ready, end, result: 'passed' }], done: end, outcome: 'passed', pending: approvedAt.value === undefined })
    } else {
      const start = ready + job.pickup * second, length = job.duration * second
      if (job.id === failingJob && failure.value && failure.value.at < start + length) {
        const first: Attempt = { start, end: Math.max(failure.value.at, start + length / 3), result: 'failed' }
        if (retryAt.value === undefined) result.set(job.id, { attempts: [first], done: first.end, outcome: 'failed' })
        else {
          const again = retryAt.value + 2 * second
          result.set(job.id, { attempts: [first, { start: again, end: again + length, result: 'passed' }], done: again + length, outcome: 'passed' })
        }
      } else result.set(job.id, { attempts: [{ start, end: start + length, result: 'passed' }], done: start + length, outcome: 'passed' })
    }
  }
  return result
})

function statusOf(job: Job, plan: Plan, now: number): Status {
  if (plan.outcome === 'skipped') return now >= plan.done ? 'skipped' : 'queued'
  for (let index = plan.attempts.length - 1; index >= 0; index--) {
    const attempt = plan.attempts[index]!
    if (now < attempt.start) continue
    if (job.gate) return plan.pending || now < attempt.end ? 'waiting' : 'passed'
    if (now < attempt.end) return 'running'
    return index < plan.attempts.length - 1 ? 'queued' : attempt.result
  }
  return 'queued'
}
const statuses = computed(() => new Map(jobs.map(job => [job.id, statusOf(job, plans.value.get(job.id)!, clock.value)])))
const status = (id: string) => statuses.value.get(id) ?? 'queued'
const statusLabels: Record<Status, string> = { queued: 'Queued', running: 'Running', passed: 'Passed', failed: 'Failed', skipped: 'Skipped', waiting: 'Waiting for approval' }

const time = (ms: number) => {
  const total = Math.max(0, Math.round(ms / second))
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}
// The current attempt: the last one that has started, or the first one.
function current(id: string) {
  const attempts = plans.value.get(id)!.attempts
  return [...attempts].reverse().find(attempt => attempt.start <= clock.value) ?? attempts[0]
}
function progress(id: string) {
  const attempt = current(id), job = jobById.get(id)!
  if (!attempt || job.gate) return status(id) === 'passed' ? 1 : 0
  return Math.min(1, Math.max(0, (Math.min(clock.value, attempt.end) - attempt.start) / (job.duration * second)))
}
function durationText(id: string) {
  const job = jobById.get(id)!, attempt = current(id), state = status(id)
  if (state === 'skipped') return 'skipped'
  if (!attempt || state === 'queued') return job.gate ? 'manual' : `~${time(job.duration * second)}`
  return time(Math.min(clock.value, attempt.end) - attempt.start)
}

// Nodes carry the status as their detail, so the accessible name reads "Build Passed". The array is rebuilt only when
// a status changes, so the layout is not recomputed on every tick.
const nodes = computed<JobNode[]>((previous) => {
  const details = jobs.map(job => statusLabels[status(job.id)])
  if (previous && previous.every((node, index) => node.detail === details[index])) return previous
  return jobs.map((job, index) => ({ id: job.id, label: fullName(job), detail: details[index], data: job }))
})
function edgeState(edge: GraphEdge) {
  const from = status(edge.from), to = status(edge.to)
  if (from === 'failed' || from === 'skipped' || to === 'skipped') return from === 'failed' ? 'broken' : 'skipped'
  if (from === 'passed' && (to === 'running' || to === 'waiting')) return 'active'
  return from === 'passed' && to !== 'queued' ? 'done' : 'idle'
}

// Timeline bars: one per attempt. Started attempts grow with the clock; attempts that have not started are drawn as
// outlined estimates (the gate as a milestone).
const bars = computed<TimelineBar[]>(() => {
  const now = clock.value, critical = criticalPath.value.ids
  return jobs.flatMap(job => plans.value.get(job.id)!.attempts.map((attempt, index): TimelineBar => {
    const id = `${job.id}:${index + 1}`, label = index ? `${fullName(job)} · attempt ${index + 1}` : fullName(job)
    if (now <= attempt.start) {
      return { id, rowId: job.id, label, start: attempt.start, end: job.gate ? attempt.start : attempt.end, appearance: 'outline', tone: 'blue', description: 'Estimated' }
    }
    const end = Math.min(attempt.end, now), running = now < attempt.end || (job.gate && plans.value.get(job.id)!.pending)
    const tone = job.gate ? 'amber' : running ? 'blue' : attempt.result === 'failed' ? 'violet' : 'teal'
    return { id, rowId: job.id, label, start: attempt.start, end: job.gate && running ? now : end, tone, critical: critical.has(job.id) && !running }
  }))
})
const rows: TimelineRow[] = jobs.map(job => ({ id: job.id, label: fullName(job) }))
const pixelsPerMinute = 104
const range = computed(() => {
  const last = Math.max(clock.value, ...bars.value.map(bar => bar.end))
  return { start: 0, end: Math.min(30, Math.max(9, Math.ceil((last + 20 * second) / 60000))) * 60000 }
})

// Critical path: the longest chain of job durations (actual where known, else expected), through the topological order.
const criticalPath = computed(() => {
  const { order } = topologicalOrder(jobs, edges)
  const length = new Map<string, number>(), previous = new Map<string, string>()
  for (const id of order) {
    const job = jobById.get(id)!, plan = plans.value.get(id)!
    const own = plan.outcome === 'skipped' ? 0 : plan.attempts.reduce((sum, attempt) => sum + attempt.end - attempt.start, 0)
    let best = 0
    for (const need of job.needs) if (length.get(need)! > best) { best = length.get(need)!; previous.set(id, need) }
    length.set(id, best + own)
  }
  let end = order[0]!
  for (const id of order) if (length.get(id)! >= length.get(end)!) end = id
  const chain: string[] = []
  for (let id: string | undefined = end; id; id = previous.get(id)) chain.unshift(id)
  // The jobs that won a race against their siblings name the path.
  const via = chain.filter(id => columns.some(column => column.ids.length > 1 && column.ids.includes(id)))
  return { ids: new Set(chain), via, total: length.get(end)! }
})

const counts = computed(() => {
  const all = [...statuses.value.values()]
  const count = (...names: Status[]) => all.filter(item => names.includes(item)).length
  return { passed: count('passed'), running: count('running', 'waiting'), failed: count('failed'), skipped: count('skipped'), queued: count('queued') }
})
const finished = computed(() => counts.value.running + counts.value.queued === 0)
const finish = computed(() => Math.max(...[...plans.value.values()].map(plan => plan.done)))
const runState = computed(() => {
  if (counts.value.failed) return { tone: 'failed', label: counts.value.running ? 'Failing' : 'Failed' }
  if (finished.value) return { tone: 'passed', label: 'Succeeded' }
  if (status('approval') === 'waiting' && counts.value.running === 1) return { tone: 'waiting', label: 'Waiting for approval' }
  return { tone: 'running', label: playing.value ? 'In progress' : 'Paused' }
})

// Linked selection: a job is one entity, bound to its graph node, its timeline row and every bar of its attempts.
const bindings = computed<ViewBinding[]>(() => jobs.flatMap(job => {
  const entity = { kind: 'job', id: job.id }
  return [
    { entity, target: { view: 'graph', kind: 'node', id: job.id } },
    { entity, target: { view: 'timeline', kind: 'row', id: job.id } },
    ...bars.value.filter(bar => bar.rowId === job.id).map((bar): ViewBinding => ({ entity, target: { view: 'timeline', kind: 'bar', id: bar.id } })),
  ]
}))
const linked = useLinkedSelection({ bindings, onSelect: entities => { if (entities[0]) message.value = describe(entities[0].id) } })
const selectedJob = computed(() => linked.selectedEntities.value[0]?.id)
const isLinked = (id: string) => linked.graph.value.highlightedNodeIds.has(id) || linked.graph.value.selectedNodeIds.has(id)
function describe(id: string) {
  const job = jobById.get(id)!, state = status(id), attempts = plans.value.get(id)!.attempts.length
  const needs = job.needs.length ? ` · needs ${job.needs.map(nameOf).join(', ')}` : ''
  const timing = state === 'queued' || state === 'skipped' ? '' : ` · ${durationText(id)}`
  return `${fullName(job)} · ${statusLabels[state]}${timing}${attempts > 1 ? ` · attempt ${attempts}` : ''}${needs}.`
}
const activate = (event: ViewTargetEvent) => linked.select(event.target.view, [event.target])
const enter = (event: ViewTargetEvent) => linked.hoverEnter(event.target.view, event.target)
const leave = (event: ViewTargetEvent) => linked.hoverLeave(event.target.view, event.target)
const clearIfEmpty = (ids: ReadonlySet<string>) => { if (!ids.size) linked.clearSelection() }

// The simulated clock: 1.2 s of run time per 100 ms. The timer exists only while playing and is cleared on unmount.
let timer: ReturnType<typeof setInterval> | undefined
function stop() {
  if (timer !== undefined) clearInterval(timer)
  timer = undefined
  playing.value = false
}
function tick() {
  clock.value = Math.min(clock.value + 1200, range.value.end, 30 * 60000)
  if (finished.value || clock.value >= 30 * 60000) {
    stop()
    message.value = counts.value.failed ? `Run failed after ${time(finish.value)}: ${counts.value.skipped} jobs skipped.` : `Run succeeded in ${time(finish.value)}.`
  }
}
function togglePlay() {
  if (playing.value) {
    stop()
    message.value = `Paused at ${time(clock.value)}.`
    return
  }
  if (finished.value) return restart()
  playing.value = true
  timer = setInterval(tick, 100)
  message.value = 'Playing.'
}
function restart() {
  stop()
  clock.value = 0
  failure.value = chaos.value ? { at: 0 } : undefined
  retryAt.value = undefined
  approvedAt.value = undefined
  linked.clearSelection()
  playing.value = true
  timer = setInterval(tick, 100)
  message.value = chaos.value ? 'Restarted run #2184 with a failure armed in E2E tests · shard 2/3.' : 'Restarted run #2184.'
}
// Injecting fails the shard now (or a third of the way in, if it has not started). A failure that has happened stays
// in the run's history when the toggle is turned off; one that has not happened yet is disarmed.
function toggleChaos() {
  chaos.value = !chaos.value
  const name = nameOf(failingJob)
  if (chaos.value) {
    if (status(failingJob) === 'passed' && retryAt.value === undefined) message.value = `${name} already passed; restart the run to see the failure.`
    else if (!failure.value) {
      failure.value = { at: clock.value }
      message.value = status(failingJob) === 'failed'
        ? `${name} failed: 3 tests timed out. ${counts.value.skipped} downstream jobs skipped.` : `Failure armed in ${name}.`
    }
  } else if (failure.value && status(failingJob) !== 'failed' && retryAt.value === undefined) {
    failure.value = undefined
    message.value = 'Failure disarmed.'
  } else message.value = 'The failure stays in this run; retry it or restart the run.'
}
const canRetry = computed(() => status(failingJob) === 'failed' && retryAt.value === undefined)
function retry() {
  if (!canRetry.value) return
  retryAt.value = clock.value
  message.value = `Retrying ${nameOf(failingJob)} (attempt 2). Downstream jobs are queued again.`
}
const canApprove = computed(() => status('approval') === 'waiting')
function approve() {
  if (!canApprove.value) return
  approvedAt.value = clock.value
  message.value = `Approved the production deployment after waiting ${time(clock.value - plans.value.get('approval')!.attempts[0]!.start)}.`
}
onBeforeUnmount(stop)

const legend = [
  { tone: 'teal', label: 'Passed' }, { tone: 'blue', label: 'Running' }, { tone: 'violet', label: 'Failed' },
  { tone: 'amber', label: 'Approval wait' }, { tone: 'outline', label: 'Estimate' }, { tone: 'critical', label: 'Critical path' },
]
// Status glyphs drawn on a 16 × 16 grid, inside the cards and in the timeline rows.
const marks: Record<Status, string[]> = {
  passed: ['M4.9 8.3 7 10.4l4.2-4.6'], failed: ['M5.6 5.6l4.8 4.8M10.4 5.6l-4.8 4.8'], running: [], queued: [],
  skipped: ['M4.6 11.4 11.4 4.6'], waiting: ['M6.4 5.4v5.2M9.6 5.4v5.2'],
}
</script>

<template>
  <section class="showcase sc-pipe" aria-label="CI/CD pipeline">
    <div class="sc-pipe-head">
      <div class="sc-pipe-intro">
        <h2>CI/CD pipeline</h2>
        <p>A live run monitor: the job graph and the timeline share one simulated clock and one linked selection. Cards come from the node slot, running paths animate in the edge slot, and bars grow as jobs run.</p>
      </div>
      <div class="sc-pipe-run">
        <span class="sc-pipe-pill" :class="'sc-pipe-pill-' + runState.tone"><i aria-hidden="true" />{{ runState.label }}</span>
        <span class="sc-pipe-commit"><b>#2184</b> main · <code>a3f9c1e</code> feat: stream exports</span>
      </div>
    </div>

    <dl class="sc-pipe-kpis">
      <div><dt>Elapsed</dt><dd>{{ time(Math.min(clock, finish)) }}</dd><small>{{ finished ? 'finished' : `ETA ${time(finish)}` }}</small></div>
      <div class="sc-pipe-kpi-passed"><dt>Passed</dt><dd>{{ counts.passed }}<span>/{{ jobs.length }}</span></dd><small>{{ counts.queued }} queued</small></div>
      <div class="sc-pipe-kpi-running"><dt>Running</dt><dd>{{ counts.running }}</dd><small>{{ status('approval') === 'waiting' ? '1 awaiting approval' : 'jobs in progress' }}</small></div>
      <div class="sc-pipe-kpi-failed"><dt>Failed</dt><dd>{{ counts.failed }}</dd><small>{{ counts.skipped }} skipped</small></div>
      <div class="sc-pipe-kpi-wide"><dt>Critical path</dt><dd>{{ time(criticalPath.total) }}</dd><small>{{ criticalPath.ids.size }} jobs · via {{ criticalPath.via.map(nameOf).join(' → ') }}</small></div>
    </dl>

    <div class="sc-pipe-toolbar">
      <div class="sc-pipe-actions">
        <button type="button" class="sc-pipe-primary" @click="togglePlay">
          <svg viewBox="0 0 16 16" aria-hidden="true"><path :d="playing ? 'M5 3.5v9M11 3.5v9' : 'M5 3.2v9.6L12.6 8z'" /></svg>{{ playing ? 'Pause' : 'Play' }}
        </button>
        <button type="button" @click="restart">Restart run</button>
        <button type="button" :aria-pressed="chaos" class="sc-pipe-chaos" @click="toggleChaos"><i aria-hidden="true" />Inject failure</button>
        <button type="button" :disabled="!canRetry" @click="retry">Retry failed</button>
        <button type="button" :disabled="!canApprove" class="sc-pipe-approve" @click="approve">Approve production</button>
      </div>
      <ol class="sc-pipe-strip" aria-hidden="true">
        <li v-for="job in jobs" :key="job.id" :class="'sc-pipe-' + status(job.id)" :title="`${fullName(job)}: ${statusLabels[status(job.id)]}`" />
      </ol>
    </div>

    <NetworkGraph
      unstyled-node-slots class="sc-pipe-graph" :nodes="nodes" :edges="edges" :layout="layoutJobs" edge-style="orthogonal"
      height="372px" background="dots" :selected-ids="linked.graph.value.selectedNodeIds"
      :highlighted-node-ids="linked.graph.value.highlightedNodeIds" :labels="{ region: 'Pipeline graph' }"
      @update:selected-ids="clearIfEmpty" @target-activate="activate" @target-enter="enter" @target-leave="leave"
    >
      <template #node="{ node, box }">
        <rect class="sc-pipe-halo" :class="{ 'sc-pipe-is-linked': isLinked(node.id) }" x="-4" y="-4" :width="box.width + 8" :height="box.height + 8" rx="13" />
        <rect class="sc-pipe-card" :class="['sc-pipe-' + status(node.id), { 'sc-pipe-gate': node.data.gate }]" :width="box.width" :height="box.height" rx="10" />
        <g class="sc-pipe-ic" :class="'sc-pipe-ic-' + status(node.id)" transform="translate(10 10)">
          <circle class="sc-pipe-ic-ring" cx="8" cy="8" r="6.6" />
          <circle v-if="status(node.id) === 'running'" class="sc-pipe-ic-spin" cx="8" cy="8" r="6.6" />
          <path v-for="d in marks[status(node.id)]" :key="d" :d="d" />
        </g>
        <text class="sc-pipe-name" x="32" y="22.5">{{ node.data.name }}</text>
        <text class="sc-pipe-time" x="12" y="42">{{ status(node.id) === 'waiting' ? `waiting ${durationText(node.id)}` : durationText(node.id) }}</text>
        <g v-if="node.data.matrix" class="sc-pipe-badge" :transform="`translate(${box.width - 10 - node.data.matrix.length * 5.6 - 10} 31)`">
          <rect :width="node.data.matrix.length * 5.6 + 10" height="15" rx="4" />
          <text x="5" y="10.8">{{ node.data.matrix }}</text>
        </g>
        <rect class="sc-pipe-track" x="12" :y="box.height - 9" :width="box.width - 24" height="3" rx="1.5" />
        <rect class="sc-pipe-fill" :class="'sc-pipe-' + status(node.id)" x="12" :y="box.height - 9" :width="(box.width - 24) * progress(node.id)" height="3" rx="1.5" />
      </template>
      <template #edge="{ edge, path }">
        <path v-if="edgeState(edge) === 'active'" class="sc-pipe-edge-glow" :d="path" />
        <path class="sc-pipe-edge" :class="'sc-pipe-edge-' + edgeState(edge)" :d="path" />
      </template>
      <template #node-toolbar="{ node }">
        <div class="sc-pipe-popover">
          <button v-if="node.id === 'approval'" type="button" :disabled="!canApprove" @click="approve">Approve</button>
          <button v-else-if="node.id === failingJob && canRetry" type="button" @click="retry">Retry job</button>
          <span v-else>{{ statusLabels[status(node.id)] }} · {{ durationText(node.id) }}</span>
        </div>
      </template>
    </NetworkGraph>

    <GanttChart
      class="sc-pipe-gantt" :rows="rows" :bars="bars" :range="range" :pixels-per-unit="pixelsPerMinute / 60000"
      :tick-steps="[60000, 120000, 300000]" :format-time="time" show-now :now="clock" readonly :row-height="28" height="auto"
      :selected-ids="linked.timeline.value.selectedBarIds" :highlighted-bar-ids="linked.timeline.value.highlightedBarIds"
      :show-controls="false" :labels="{ region: 'Job timeline', rows: 'Jobs' }"
      @target-activate="activate" @target-enter="enter" @target-leave="leave"
    >
      <template #legend>
        <ul class="sc-pipe-legend" aria-label="Legend">
          <li v-for="item in legend" :key="item.tone"><i :class="'sc-pipe-swatch sc-pipe-swatch-' + item.tone" aria-hidden="true" />{{ item.label }}</li>
        </ul>
      </template>
      <template #row-heading><span class="sc-pipe-corner">Jobs <small>{{ jobs.length }}</small></span></template>
      <template #row="{ row }">
        <span class="sc-pipe-row" :class="{ 'sc-pipe-is-linked': linked.timeline.value.highlightedRowIds.has(row.id) || selectedJob === row.id }">
          <svg class="sc-pipe-ic" :class="'sc-pipe-ic-' + status(row.id)" viewBox="0 0 16 16" aria-hidden="true">
            <circle class="sc-pipe-ic-ring" cx="8" cy="8" r="6.6" />
            <circle v-if="status(row.id) === 'running'" class="sc-pipe-ic-spin" cx="8" cy="8" r="6.6" />
            <path v-for="d in marks[status(row.id)]" :key="d" :d="d" />
          </svg>
          <span class="sc-pipe-row-name">{{ jobById.get(row.id)!.name }}</span>
          <small v-if="jobById.get(row.id)!.matrix">{{ jobById.get(row.id)!.matrix }}</small>
        </span>
      </template>
      <template #bar="{ bar, range: shown }">
        <span class="sc-pipe-bar">{{ (shown.end - shown.start) * pixelsPerMinute / 60000 > 44 ? time(shown.end - shown.start) : '' }}</span>
      </template>
    </GanttChart>
    <p class="sc-pipe-status" role="status">{{ message }}</p>
  </section>
</template>

<style>
.sc-pipe {
  color-scheme: dark;
  --sc-pipe-green: #3fb950;
  --sc-pipe-blue: #4c8dff;
  --sc-pipe-red: #f85149;
  --sc-pipe-amber: #e3b341;
  --sc-pipe-gray: #6e7781;
  --vw-surface: #0f141b;
  --vw-surface-muted: #0b0f15;
  --vw-surface-hover: #1a212c;
  --vw-text: #e6edf3;
  --vw-muted: #8b949e;
  --vw-border: #232b36;
  --vw-grid: #1a212b;
  --vw-edge: #39424e;
  --vw-accent: #4c8dff;
  --vw-on-solid: #fff;
  --vw-background-pattern: #222a35;
  --vw-now: #4c8dff;
  --vw-critical: #e6edf3;
  --vw-bar-highlight: #e6edf3;
  color: var(--vw-text);
}
.showcase.sc-pipe { background: #090d12; border-color: #1b222c; border-radius: 18px; padding: 22px; }
.sc-pipe button { font: inherit; }
/* Another demo leaks an inherited stroke onto the page in the dark theme; card text never takes one. */
.sc-pipe text { stroke: none; }
.sc-pipe-head { display: flex; flex-wrap: wrap; align-items: flex-start; justify-content: space-between; gap: 12px 28px; margin-bottom: 16px; }
.sc-pipe-intro { flex: 1 1 520px; min-width: 0; }
.sc-pipe h2 { margin: 0 0 4px; font-size: 20px; letter-spacing: -.02em; }
.sc-pipe-intro p { margin: 0; max-width: 92ch; font-size: 13px; line-height: 1.5; color: var(--vw-muted); }
.sc-pipe-run { display: flex; flex-direction: column; align-items: flex-end; gap: 6px; }
.sc-pipe-commit { font-size: 12px; color: var(--vw-muted); white-space: nowrap; }
.sc-pipe-commit b { color: var(--vw-text); }
.sc-pipe code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 11.5px; padding: 1px 5px; border-radius: 4px; background: #161c25; color: #c9d1d9; }
.sc-pipe-pill { display: inline-flex; align-items: center; gap: 7px; padding: 4px 11px; border-radius: 999px; font-size: 12px; font-weight: 650; border: 1px solid; }
.sc-pipe-pill i { width: 7px; height: 7px; border-radius: 50%; background: currentColor; }
.sc-pipe-pill-running { color: #79abff; border-color: rgb(76 141 255 / 40%); background: rgb(76 141 255 / 10%); }
.sc-pipe-pill-running i { animation: sc-pipe-pulse 1.4s ease-in-out infinite; }
.sc-pipe-pill-passed { color: #56d364; border-color: rgb(63 185 80 / 40%); background: rgb(63 185 80 / 10%); }
.sc-pipe-pill-failed { color: #ff7b72; border-color: rgb(248 81 73 / 42%); background: rgb(248 81 73 / 10%); }
.sc-pipe-pill-waiting { color: #f2cc60; border-color: rgb(227 179 65 / 40%); background: rgb(227 179 65 / 10%); }

/* KPI strip. */
.sc-pipe-kpis { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)) minmax(0, 2fr); gap: 8px; margin: 0 0 12px; }
.sc-pipe-kpis > div { min-width: 0; padding: 10px 14px; border: 1px solid var(--vw-border); border-radius: 12px; background: linear-gradient(180deg, #10161e, #0c1117); }
.sc-pipe-kpis dt { font-size: 10.5px; font-weight: 650; letter-spacing: .07em; text-transform: uppercase; color: var(--vw-muted); }
.sc-pipe-kpis dd { margin: 3px 0 1px; font-size: 22px; font-weight: 700; font-variant-numeric: tabular-nums; letter-spacing: -.01em; }
.sc-pipe-kpis dd span { font-size: 14px; color: var(--vw-muted); font-weight: 600; }
.sc-pipe-kpis small { display: block; overflow: hidden; font-size: 11.5px; color: var(--vw-muted); white-space: nowrap; text-overflow: ellipsis; }
.sc-pipe-kpi-passed dd { color: #56d364; }
.sc-pipe-kpi-running dd { color: #79abff; }
.sc-pipe-kpi-failed dd { color: #ff7b72; }

/* Toolbar and the run strip, one segment per job. */
.sc-pipe-toolbar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px 20px; margin-bottom: 12px; }
.sc-pipe-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.sc-pipe-actions button {
  display: inline-flex; align-items: center; gap: 7px; height: 32px; padding: 0 13px; border: 1px solid #2c3541; border-radius: 8px;
  background: #151b24; color: var(--vw-text); font-size: 12.5px; font-weight: 600; cursor: pointer;
}
.sc-pipe-actions button:not(:disabled):hover { background: #1c2430; border-color: #3a4552; }
.sc-pipe-actions button:disabled { opacity: .42; cursor: default; }
.sc-pipe-actions button:focus-visible, .sc-pipe-popover button:focus-visible { outline: 2px solid var(--sc-pipe-blue); outline-offset: 2px; }
.sc-pipe-actions svg { width: 13px; height: 13px; fill: currentColor; stroke: currentColor; stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round; }
.sc-pipe-actions .sc-pipe-primary { min-width: 84px; background: #1f6feb; border-color: #388bfd; color: #fff; }
.sc-pipe-actions .sc-pipe-primary:not(:disabled):hover { background: #2a7af5; border-color: #58a0ff; }
.sc-pipe-chaos i { width: 26px; height: 14px; border-radius: 999px; background: #2a323d; position: relative; transition: background .15s; }
.sc-pipe-chaos i::after { content: ''; position: absolute; top: 2px; left: 2px; width: 10px; height: 10px; border-radius: 50%; background: #8b949e; transition: transform .15s, background .15s; }
.sc-pipe-actions .sc-pipe-chaos[aria-pressed=true] { border-color: rgb(248 81 73 / 55%); color: #ffa198; }
.sc-pipe-chaos[aria-pressed=true] i { background: rgb(248 81 73 / 35%); }
.sc-pipe-chaos[aria-pressed=true] i::after { transform: translateX(12px); background: #ff7b72; }
.sc-pipe-actions .sc-pipe-approve:not(:disabled) { border-color: rgb(227 179 65 / 55%); color: #f2cc60; background: rgb(227 179 65 / 9%); }
.sc-pipe-strip { display: flex; gap: 3px; margin: 0; padding: 0; list-style: none; }
.sc-pipe-strip li { width: 14px; height: 8px; border-radius: 2px; background: #222a35; }
.sc-pipe-strip li.sc-pipe-passed { background: var(--sc-pipe-green); }
.sc-pipe-strip li.sc-pipe-running { background: var(--sc-pipe-blue); animation: sc-pipe-pulse 1.4s ease-in-out infinite; }
.sc-pipe-strip li.sc-pipe-failed { background: var(--sc-pipe-red); }
.sc-pipe-strip li.sc-pipe-waiting { background: var(--sc-pipe-amber); }
.sc-pipe-strip li.sc-pipe-skipped { background: repeating-linear-gradient(-45deg, #2a323d 0 2px, #161c24 2px 4px); }

/* Graph canvas. */
.sc-pipe .vw-network { border-color: var(--vw-border); border-radius: 14px; overflow: hidden; background: #0b0f15; }
.sc-pipe .vw-zoom-tools { border: 1px solid var(--vw-border); border-radius: 9px; background: #121821; }
.sc-pipe .vw-zoom-tools button { background: transparent; color: var(--vw-text); border: 0; }
.sc-pipe .vw-zoom-tools button:hover { background: #1c2430; }
.sc-pipe .vw-zoom-tools output { color: var(--vw-muted); }
.sc-pipe .vw-network-node { cursor: pointer; }
.sc-pipe .vw-network-node:focus-visible { outline: none; }
.sc-pipe .vw-network-node .sc-pipe-halo { fill: none; stroke: none; }
.sc-pipe .vw-network-node .sc-pipe-halo.sc-pipe-is-linked { stroke: rgb(230 237 243 / 70%); stroke-width: 1.5px; }
.sc-pipe .vw-network-node.vw-is-selected .sc-pipe-halo { stroke: #e6edf3; stroke-width: 2px; }
.sc-pipe .vw-network-node:focus-visible .sc-pipe-halo { stroke: var(--sc-pipe-blue); stroke-width: 2px; }
.sc-pipe .vw-network-node .sc-pipe-card { fill: #121821; stroke: #29323e; stroke-width: 1px; transition: stroke .2s, fill .2s; }
.sc-pipe .vw-network-node:hover .sc-pipe-card { fill: #161d27; }
.sc-pipe .vw-network-node .sc-pipe-card.sc-pipe-running { stroke: rgb(76 141 255 / 70%); fill: #111a28; filter: drop-shadow(0 0 8px rgb(76 141 255 / 28%)); }
.sc-pipe .vw-network-node .sc-pipe-card.sc-pipe-failed { stroke: rgb(248 81 73 / 75%); fill: #1c1215; filter: drop-shadow(0 0 8px rgb(248 81 73 / 25%)); }
.sc-pipe .vw-network-node .sc-pipe-card.sc-pipe-waiting { stroke: rgb(227 179 65 / 75%); fill: #1b1810; }
.sc-pipe .vw-network-node .sc-pipe-card.sc-pipe-skipped, .sc-pipe .vw-network-node .sc-pipe-card.sc-pipe-queued { fill: #0e131a; }
.sc-pipe .vw-network-node .sc-pipe-card.sc-pipe-gate { stroke-dasharray: 5 3; }
.sc-pipe .vw-network-node .sc-pipe-name { fill: #e6edf3; font-size: 12.5px; font-weight: 650; }
.sc-pipe .vw-network-node .sc-pipe-time { fill: #8b949e; font-size: 11px; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-variant-numeric: tabular-nums; }
.sc-pipe .vw-network-node:has(.sc-pipe-skipped) .sc-pipe-name, .sc-pipe .vw-network-node:has(.sc-pipe-queued) .sc-pipe-name { fill: #9da7b3; }
.sc-pipe .vw-network-node .sc-pipe-badge rect { fill: #1d2530; stroke: #2e3845; stroke-width: 1px; }
.sc-pipe .vw-network-node .sc-pipe-badge text { fill: #a9b4c0; font-size: 9.5px; font-weight: 600; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
.sc-pipe .vw-network-node .sc-pipe-track { fill: #1e2631; stroke: none; }
.sc-pipe .vw-network-node .sc-pipe-fill { stroke: none; fill: var(--sc-pipe-gray); transition: width .12s linear; }
.sc-pipe .vw-network-node .sc-pipe-fill.sc-pipe-passed { fill: var(--sc-pipe-green); }
.sc-pipe .vw-network-node .sc-pipe-fill.sc-pipe-running { fill: var(--sc-pipe-blue); }
.sc-pipe .vw-network-node .sc-pipe-fill.sc-pipe-failed { fill: var(--sc-pipe-red); }

/* Status glyphs, shared by the cards and the timeline rows. */
.sc-pipe .sc-pipe-ic path { fill: none; stroke-width: 1.8px; stroke-linecap: round; stroke-linejoin: round; }
.sc-pipe .sc-pipe-ic .sc-pipe-ic-ring { stroke-width: 1.6px; }
.sc-pipe .sc-pipe-ic-passed .sc-pipe-ic-ring { fill: var(--sc-pipe-green); stroke: var(--sc-pipe-green); }
.sc-pipe .sc-pipe-ic-passed path, .sc-pipe .sc-pipe-ic-failed path { stroke: #0b0f15; }
.sc-pipe .sc-pipe-ic-failed .sc-pipe-ic-ring { fill: var(--sc-pipe-red); stroke: var(--sc-pipe-red); }
.sc-pipe .sc-pipe-ic-waiting .sc-pipe-ic-ring { fill: var(--sc-pipe-amber); stroke: var(--sc-pipe-amber); }
.sc-pipe .sc-pipe-ic-waiting path { stroke: #1b1405; }
.sc-pipe .sc-pipe-ic-running .sc-pipe-ic-ring { fill: none; stroke: rgb(76 141 255 / 28%); }
.sc-pipe .sc-pipe-ic .sc-pipe-ic-spin {
  fill: none; stroke: var(--sc-pipe-blue); stroke-width: 1.8px; stroke-linecap: round; stroke-dasharray: 12 30;
  transform-box: fill-box; transform-origin: center; animation: sc-pipe-spin .9s linear infinite;
}
.sc-pipe .sc-pipe-ic-queued .sc-pipe-ic-ring { fill: none; stroke: #6e7781; stroke-dasharray: 2.2 2.2; }
.sc-pipe .sc-pipe-ic-skipped .sc-pipe-ic-ring { fill: none; stroke: #6e7781; }
.sc-pipe .sc-pipe-ic-skipped path { stroke: #6e7781; }

/* Edges from the edge slot. */
.sc-pipe .sc-pipe-edge { fill: none; stroke: #303a46; stroke-width: 1.5px; }
.sc-pipe .sc-pipe-edge.sc-pipe-edge-done { stroke: rgb(63 185 80 / 45%); }
.sc-pipe .sc-pipe-edge.sc-pipe-edge-active { stroke: var(--sc-pipe-blue); stroke-width: 2px; stroke-dasharray: 6 5; animation: sc-pipe-flow .8s linear infinite; }
.sc-pipe .sc-pipe-edge-glow { fill: none; stroke: rgb(76 141 255 / 16%); stroke-width: 7px; stroke-linecap: round; }
.sc-pipe .sc-pipe-edge.sc-pipe-edge-broken { stroke: rgb(248 81 73 / 70%); stroke-dasharray: 4 4; }
.sc-pipe .sc-pipe-edge.sc-pipe-edge-skipped { stroke: #2a323d; stroke-dasharray: 3 4; }

/* Node toolbar above the selected card. */
.sc-pipe .vw-node-toolbar { padding: 0; border: 0; background: none; box-shadow: none; }
.sc-pipe-popover { display: flex; padding: 4px; border: 1px solid #2c3541; border-radius: 9px; background: #151b24; box-shadow: 0 8px 22px rgb(0 0 0 / 45%); font-size: 11.5px; color: var(--vw-muted); white-space: nowrap; }
.sc-pipe-popover span { padding: 3px 7px; }
.sc-pipe-popover button { padding: 4px 10px; border: 0; border-radius: 6px; background: #1f6feb; color: #fff; font-size: 11.5px; font-weight: 650; cursor: pointer; }
.sc-pipe-popover button:disabled { opacity: .5; cursor: default; }

/* Timeline. */
.sc-pipe .vw-gantt { --vw-row-label-width: 208px; margin-top: 12px; border: 1px solid var(--vw-border); border-radius: 14px; overflow: hidden; background: var(--vw-surface); }
.sc-pipe .vw-gantt-toolbar { padding: 9px 14px; background: var(--vw-surface); }
.sc-pipe .vw-gantt-scroll { border-bottom: 0; border-top-color: var(--vw-border); background: var(--vw-surface); }
.sc-pipe .vw-gantt-head, .sc-pipe .vw-gantt-corner { background: #0c1117; border-color: var(--vw-border); }
.sc-pipe .vw-gantt-tick { color: var(--vw-muted); font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 11px; }
.sc-pipe .vw-gantt-tick-line { background: var(--vw-border); }
.sc-pipe .vw-gantt-row { border-bottom-color: #161c24; }
.sc-pipe .vw-gantt-row-label { background: var(--vw-surface); border-right-color: var(--vw-border); }
.sc-pipe .vw-row-content { flex: 1; min-width: 0; }
.sc-pipe-corner { font-size: 11px; font-weight: 650; letter-spacing: .08em; text-transform: uppercase; color: var(--vw-muted); }
.sc-pipe-corner small { margin-inline-start: 4px; padding: 1px 6px; border-radius: 999px; background: #1a212b; color: var(--vw-text); letter-spacing: 0; }
.sc-pipe-row { display: flex; align-items: center; gap: 8px; min-width: 0; margin-inline-start: -4px; padding: 2px 6px 2px 4px; border-radius: 6px; font-size: 12px; }
.sc-pipe-row.sc-pipe-is-linked { background: #1a2230; box-shadow: inset 0 0 0 1px #334055; }
.sc-pipe-row svg { flex: none; width: 14px; height: 14px; overflow: visible; }
.sc-pipe-row-name { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-weight: 600; }
.sc-pipe-row small { flex: none; padding: 0 5px; border: 1px solid #2e3845; border-radius: 4px; background: #1a212b; color: #a9b4c0; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 10px; }
.sc-pipe .vw-gantt-bar:not(.vw-is-milestone) { border-radius: 5px; }
.sc-pipe .vw-gantt-bar { border: 0; padding: 0 8px; box-shadow: inset 0 1px 0 rgb(255 255 255 / 12%); }
.sc-pipe .vw-gantt-bar.vw-tone-teal { background: linear-gradient(180deg, #2ea043, #238636); color: #fff; }
.sc-pipe .vw-gantt-bar.vw-tone-blue.vw-is-solid {
  background: linear-gradient(90deg, #1f6feb, #4c8dff); color: #fff;
  background-size: 200% 100%; box-shadow: 0 0 12px rgb(76 141 255 / 35%), inset 0 1px 0 rgb(255 255 255 / 16%);
}
.sc-pipe .vw-gantt-bar.vw-tone-violet { background: linear-gradient(180deg, #da3633, #b62324); color: #fff; }
.sc-pipe .vw-gantt-bar.vw-tone-amber { background: repeating-linear-gradient(-45deg, rgb(227 179 65 / 30%) 0 5px, rgb(227 179 65 / 16%) 5px 10px); color: #f2cc60; box-shadow: inset 0 0 0 1px rgb(227 179 65 / 60%); }
.sc-pipe .vw-gantt-bar.vw-is-outline:not(.vw-is-milestone) { background: rgb(139 148 158 / 6%); box-shadow: inset 0 0 0 1px #38424e; color: #8b949e; border: 0; }
.sc-pipe .vw-gantt-bar.vw-is-outline:not(.vw-is-milestone)::before { display: none; }
.sc-pipe .vw-gantt-bar.vw-is-milestone { --vw-item-line: #8b949e; --vw-item-solid: #e3b341; }
.sc-pipe .vw-gantt-bar.vw-is-milestone.vw-has-slot { padding: 0; background: transparent; box-shadow: none; }
.sc-pipe .vw-gantt-bar.vw-critical { box-shadow: 0 0 0 1.5px #0f141b, 0 0 0 2.5px rgb(230 237 243 / 55%); }
.sc-pipe .vw-gantt-bar.vw-is-highlighted, .sc-pipe .vw-gantt-bar.vw-is-selected { box-shadow: 0 0 0 2px #0f141b, 0 0 0 4px #e6edf3; }
.sc-pipe .vw-gantt-bar:focus-visible { outline: 2px solid var(--sc-pipe-blue); outline-offset: 2px; }
.sc-pipe-bar { overflow: hidden; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 10.5px; font-weight: 600; white-space: nowrap; }
.sc-pipe .vw-gantt-now { border-left: 2px solid var(--sc-pipe-blue); z-index: 2; }
.sc-pipe-legend { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 16px; margin: 0; padding: 0; list-style: none; font-size: 11.5px; color: #c9d1d9; }
.sc-pipe-legend li { display: inline-flex; align-items: center; gap: 6px; }
.sc-pipe-swatch { width: 20px; height: 9px; border-radius: 3px; }
.sc-pipe-swatch-teal { background: #2ea043; }
.sc-pipe-swatch-blue { background: linear-gradient(90deg, #1f6feb, #4c8dff); }
.sc-pipe-swatch-violet { background: #da3633; }
.sc-pipe-swatch-amber { background: repeating-linear-gradient(-45deg, rgb(227 179 65 / 45%) 0 3px, rgb(227 179 65 / 20%) 3px 6px); box-shadow: inset 0 0 0 1px rgb(227 179 65 / 60%); }
.sc-pipe-swatch-outline { box-shadow: inset 0 0 0 1px #4a5562; }
.sc-pipe-swatch-critical { background: #2ea043; box-shadow: 0 0 0 1px #0f141b, 0 0 0 2px rgb(230 237 243 / 60%); }
.sc-pipe-status { margin: 12px 2px 0; min-height: 18px; font-size: 12.5px; color: #c9d1d9; }

@keyframes sc-pipe-spin { to { transform: rotate(360deg); } }
@keyframes sc-pipe-flow { to { stroke-dashoffset: -22; } }
@keyframes sc-pipe-pulse { 50% { opacity: .4; } }
@media (prefers-reduced-motion: reduce) {
  .sc-pipe .sc-pipe-ic .sc-pipe-ic-spin, .sc-pipe .sc-pipe-edge.sc-pipe-edge-active, .sc-pipe-pill-running i, .sc-pipe-strip li.sc-pipe-running { animation: none; }
  .sc-pipe .vw-network-node .sc-pipe-fill, .sc-pipe-chaos i, .sc-pipe-chaos i::after { transition: none; }
}
@media (max-width: 900px) {
  .sc-pipe-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .sc-pipe-kpis .sc-pipe-kpi-wide { grid-column: span 2; }
  .sc-pipe-run { align-items: flex-start; }
}
@media (max-width: 650px) {
  .showcase.sc-pipe { padding: 14px 12px; border-radius: 14px; }
  .sc-pipe .vw-gantt { --vw-row-label-width: 132px; }
  .sc-pipe-row small { display: none; }
  .sc-pipe-strip { display: none; }
}
</style>
