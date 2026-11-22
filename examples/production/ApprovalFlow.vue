<script setup lang="ts">
import { computed, ref } from 'vue'
import { NetworkGraph, findGraphCycles, useEditHistory, type GraphConnection, type GraphEdge, type GraphNodeMove, type GraphPoint, type NetworkNode } from '../../src'

const props = defineProps<{ ja: boolean }>()
const t = (ja: string, en: string) => props.ja ? ja : en
type Step = { id: string; kind: 'start' | 'decision' | 'approval' | 'end'; name: [string, string]; assignee?: string; threshold?: number }
interface Flow { steps: Step[]; edges: GraphEdge[]; positions: Map<string, GraphPoint> }
function edge(id: string, from: string, port: string, to: string): GraphEdge {
  return { id, from, fromPort: port, to, toPort: 'in' }
}
const initial: Flow = {
  steps: [
    { id: 'request', kind: 'start', name: ['購買申請', 'Purchase request'] },
    { id: 'amount', kind: 'decision', threshold: 100000, name: ['申請金額', 'Request amount'] },
    { id: 'lead', kind: 'approval', name: ['課長承認', 'Manager review'], assignee: 'Team lead' },
    { id: 'director', kind: 'approval', name: ['部長承認', 'Director review'], assignee: 'Director' },
    { id: 'done', kind: 'end', name: ['完了', 'Complete'] },
  ],
  edges: [edge('a', 'request', 'out', 'amount'), edge('b', 'amount', 'low', 'lead'),
    edge('c', 'amount', 'high', 'director'), edge('d', 'lead', 'out', 'done'), edge('e', 'director', 'out', 'done')],
  positions: new Map(),
}
const history = useEditHistory(initial)
const flow = history.state
const selected = ref('amount')
const step = computed(() => flow.value.steps.find(s => s.id === selected.value))
const warning = ref('')
let serial = 0
function label(s: Step) { return s.name[props.ja ? 0 : 1] }
function outputs(s: Step) { return s.kind === 'decision' ? ['low', 'high'] : s.kind === 'end' ? [] : ['out'] }
function portName(port: string, from: string) {
  const amount = flow.value.steps.find(s => s.id === from)?.threshold ?? 0
  const limit = '¥' + amount.toLocaleString('en-US')
  if (port === 'low') return '< ' + limit
  if (port === 'high') return '≥ ' + limit
  return t('次のステップ', 'Next step')
}
const nodes = computed<NetworkNode[]>(() => flow.value.steps.map(s => ({
  id: s.id, label: label(s), detail: s.assignee,
  shape: s.kind === 'decision' ? 'diamond' : undefined,
  ports: [...(s.kind === 'start' ? [] : [{ id: 'in', side: 'left' as const }]),
    ...outputs(s).map((id, i, ports) => ({ id, side: 'right' as const, offset: (i + 1) / (ports.length + 1), label: portName(id, s.id) }))],
})))
const edges = computed(() => flow.value.edges.map(e => ({ ...e, label: e.fromPort === 'out' ? undefined : portName(e.fromPort!, e.from) })))
function commit(patch: Partial<Flow>) {
  history.commit({ ...flow.value, ...patch })
  warning.value = ''
}
function validate(c: GraphConnection, replacing?: string) {
  const source = flow.value.steps.find(s => s.id === c.from)
  if (!source || !outputs(source).includes(c.fromPort ?? '') || c.toPort !== 'in' || c.to === 'request') {
    return t('出口から次のステップの入口へつないでください。', 'Connect an output to a step input.')
  }
  const other = flow.value.edges.filter(e => e.id !== replacing)
  if (other.some(e => e.from === c.from && e.fromPort === c.fromPort)) return t('この出口には接続先があります。', 'This output already has a destination.')
  if (findGraphCycles(nodes.value, [...other, { ...c, id: replacing ?? 'candidate' }]).length) return t('循環する経路は設定できません。', 'This route would create a cycle.')
}
function connect(c: GraphConnection, replacing?: string) {
  const reason = validate(c, replacing)
  if (reason) { warning.value = reason; return }
  const next = { id: replacing ?? 'edge-' + ++serial, ...c }
  commit({ edges: [...flow.value.edges.filter(e => e.id !== replacing), next] })
}
function route(port: string, to: string) {
  const from = selected.value
  const old = flow.value.edges.find(e => e.from === from && e.fromPort === port)
  if (to) connect({ from, fromPort: port, to, toPort: 'in' }, old?.id)
  else commit({ edges: flow.value.edges.filter(e => e !== old) })
}
function add(kind: 'approval' | 'decision') {
  const id = kind + '-' + ++serial
  const added: Step = kind === 'approval'
    ? { id, kind, name: ['追加承認', 'Additional review'] }
    : { id, kind, name: ['金額条件', 'Amount condition'], threshold: 100000 }
  commit({ steps: [...flow.value.steps, added] })
  selected.value = id
}
function updateStep(patch: Partial<Step>) {
  commit({ steps: flow.value.steps.map(s => s.id === selected.value ? { ...s, ...patch } : s) })
}
function remove() {
  const id = selected.value
  if (!step.value || step.value.kind === 'start' || step.value.kind === 'end') return
  const positions = new Map(flow.value.positions)
  positions.delete(id)
  commit({ steps: flow.value.steps.filter(s => s.id !== id), edges: flow.value.edges.filter(e => e.from !== id && e.to !== id), positions })
  selected.value = 'request'
}
function move(change: GraphNodeMove) { commit({ positions: new Map(flow.value.positions).set(change.id, change.after) }) }
function undo() {
  history.undo()
  if (!step.value) selected.value = 'request'
  warning.value = ''
}
function threshold(input: HTMLInputElement) {
  if (input.value && Number.isSafeInteger(input.valueAsNumber) && input.valueAsNumber >= 0) updateStep({ threshold: input.valueAsNumber })
  else input.value = String(step.value?.threshold ?? 0)
}
function destination(port: string) { return flow.value.edges.find(e => e.from === selected.value && e.fromPort === port)?.to ?? '' }
function pickRoute(port: string, select: HTMLSelectElement) { route(port, select.value); select.value = destination(port) }
</script>

<template>
  <div class="production-title"><div><h1>{{ t('承認フロー', 'Approval workflow') }}</h1>
    <p>{{ t('購買申請の承認者と、金額に応じた経路を編集できます。', 'Edit approvers and route purchase requests by amount.') }}</p></div>
    <div class="production-actions"><button @click="add('approval')">{{ t('承認ステップを追加', 'Add approval step') }}</button>
      <button @click="add('decision')">{{ t('条件分岐を追加', 'Add decision') }}</button>
      <button :disabled="!history.canUndo.value" @click="undo">{{ t('元に戻す', 'Undo') }}</button></div></div>
  <div class="production-layout">
    <section class="production-panel"><div class="production-heading"><h2>{{ t('承認経路', 'Approval routes') }}</h2></div>
      <NetworkGraph v-model:selected-id="selected" :nodes="nodes" :edges="edges" :positions="flow.positions"
        :options="{ direction: 'LR', nodeWidth: 165, nodeHeight: 64, columnGap: 135 }" :height="360" background="dots"
        draggable connectable reconnectable :validate-connection="validate" @node-move="move" @connect="connect"
        @reconnect="connect($event.after, $event.id)" @connect-rejected="(_change, reason) => warning = reason" />
    </section>
    <section class="production-panel"><div class="production-heading"><h2>{{ t('ステップの設定', 'Step settings') }}</h2></div>
      <div class="production-content workflow-fields">
        <label>{{ t('編集するステップ', 'Selected step') }}<select v-model="selected"><option v-for="s in flow.steps" :key="s.id" :value="s.id">{{ label(s) }}</option></select></label>
        <template v-if="step">
          <label>{{ t('表示名', 'Step name') }}<input :value="label(step)" @change="e => { const el = e.target as HTMLInputElement; const name = el.value.trim(); if (name) updateStep({ name: [name, name] }); else el.value = label(step!) }"></label>
          <label v-if="step.kind === 'approval'">{{ t('承認者', 'Approver') }}<input :value="step.assignee" @change="updateStep({ assignee: ($event.target as HTMLInputElement).value.trim() })"></label>
          <label v-if="step.kind === 'decision'">{{ t('分岐の基準額（円）', 'Amount threshold (JPY)') }}<input type="number" min="0" step="1" :value="step.threshold" @change="threshold($event.target as HTMLInputElement)"></label>
          <label v-for="port in outputs(step)" :key="port">{{ portName(port, step.id) }}
            <select :value="destination(port)" @change="pickRoute(port, $event.target as HTMLSelectElement)"><option value="">{{ t('未接続', 'Unconnected') }}</option>
              <option v-for="s in flow.steps.filter(s => s.kind !== 'start' && s.id !== selected)" :key="s.id" :value="s.id">{{ label(s) }}</option></select></label>
          <button v-if="step.kind === 'approval' || step.kind === 'decision'" @click="remove">{{ t('ステップを削除', 'Delete step') }}</button>
        </template>
        <p role="status">{{ warning }}</p>
      </div>
    </section>
  </div>
</template>
