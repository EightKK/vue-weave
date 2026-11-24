<script setup lang="ts">
import { ref, useId } from 'vue'
import {
  NetworkGraph, completeGraphLayout,
  type GraphBox, type GraphConnection, type GraphEdge, type GraphEdgeStyle, type GraphLayout, type GraphNodeMove, type GraphPoint,
  type GraphPort, type GraphReconnect, type NetworkNode,
} from '../../src'
import { unusedNumber } from '../ids'
import { useDemoLocale } from '../i18n'

// A node-based automation editor: white step cards with an icon tile, named input and output ports (two outputs on
// the condition), an animated path for the run in progress and controlled moves and connections.
type StepKind = 'trigger' | 'http' | 'condition' | 'ai' | 'mail' | 'database' | 'chat' | 'log'
type StepStatus = 'done' | 'running' | 'queued' | 'skipped'
type StepData = { kind: StepKind; subtitle: string; status: StepStatus }
type Step = NetworkNode<StepData> & { data: StepData }
type Flow = GraphEdge

const { t, labels, locale } = useDemoLocale()

const cardWidth = 224
const cardHeight = 84
const conditionHeight = 136
const padding = 32
const grid = 16

const kinds: Record<StepKind, { category: string; color: string; icon: readonly string[] }> = {
  trigger: { category: t({ en: 'Trigger', ja: 'トリガー' }), color: '#ef6a2e', icon: ['M13 2 4 14h7l-1 8 9-12h-7z'] },
  http: {
    category: 'HTTP', color: '#3a78ea',
    icon: ['M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18z', 'M3 12h18', 'M12 3c2.6 2.6 3.8 5.6 3.8 9s-1.2 6.4-3.8 9c-2.6-2.6-3.8-5.6-3.8-9s1.2-6.4 3.8-9z'],
  },
  condition: { category: t({ en: 'Condition', ja: '条件' }), color: '#d9900f', icon: ['M3.5 4.5h17l-6.5 8v6l-4 2v-8z'] },
  ai: { category: 'AI agent', color: '#7a5af5', icon: ['M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z', 'M18.5 15.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z'] },
  mail: { category: t({ en: 'Email', ja: 'メール' }), color: '#1497d4', icon: ['M5 5h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z', 'M3.5 7.5 12 13l8.5-5.5'] },
  database: {
    category: t({ en: 'Database', ja: 'データベース' }), color: '#139a6a',
    icon: ['M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3z', 'M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6', 'M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3'],
  },
  chat: { category: t({ en: 'Chat', ja: 'チャット' }), color: '#d9467f', icon: ['M20 15a2 2 0 0 1-2 2H8l-4 4V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2z', 'M8.5 9.5h7', 'M8.5 12.5h4'] },
  log: { category: t({ en: 'Log', ja: 'ログ' }), color: '#5f6b7d', icon: ['M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z', 'M14 3v5h5', 'M9 13h6', 'M9 17h4'] },
}
const statuses: Record<StepStatus, { label: string; width: number }> = {
  done: { label: t({ en: 'Success', ja: '成功' }), width: t({ en: 66, ja: 50 }) },
  running: { label: t({ en: 'Running', ja: '実行中' }), width: t({ en: 68, ja: 62 }) },
  queued: { label: t({ en: 'Queued', ja: '待機中' }), width: t({ en: 60, ja: 62 }) },
  skipped: { label: t({ en: 'Skipped', ja: 'スキップ' }), width: t({ en: 66, ja: 72 }) },
}

const input: GraphPort = { id: 'in', side: 'left', direction: 'target', label: t({ en: 'input', ja: '入力' }) }
const output: GraphPort = { id: 'out', side: 'right', direction: 'source', label: t({ en: 'output', ja: '出力' }) }
function step(id: string, label: string, kind: StepKind, subtitle: string, status: StepStatus): Step {
  const ports: GraphPort[] = kind === 'trigger' ? [output]
    : kind === 'condition'
      ? [
        { ...input, offset: 42 / conditionHeight },
        { id: 'true', side: 'right', direction: 'source', label: 'true', offset: 102 / conditionHeight },
        { id: 'false', side: 'right', direction: 'source', label: 'false', offset: 120 / conditionHeight },
      ]
      : [input, output]
  return { id, label, ports, data: { kind, subtitle, status } }
}
const steps: readonly Step[] = [
  step('webhook', t({ en: 'Order webhook', ja: '注文Webhook' }), 'trigger', 'POST /hooks/orders', 'done'),
  step('lookup', t({ en: 'Look up customer', ja: '顧客を検索' }), 'http', 'GET /customers/:id', 'done'),
  step('check', t({ en: 'Check payment', ja: '支払いを確認' }), 'condition', 'status is paid', 'done'),
  step('summarize', t({ en: 'Summarize order', ja: '注文を要約' }), 'ai', t({ en: 'Summary + sentiment', ja: '要約と感情分析' }), 'running'),
  step('receipt', t({ en: 'Send receipt', ja: '領収書を送信' }), 'mail', t({ en: 'To the customer', ja: '顧客へ' }), 'queued'),
  step('crm', t({ en: 'Update CRM', ja: 'CRMを更新' }), 'database', t({ en: 'Upsert contact', ja: '連絡先を登録・更新' }), 'queued'),
  step('notify', t({ en: 'Notify team', ja: 'チームに通知' }), 'chat', t({ en: 'Post to #orders', ja: '#orders に投稿' }), 'queued'),
  step('log', t({ en: 'Log skipped order', ja: '対象外の注文を記録' }), 'log', t({ en: 'Append to audit log', ja: '監査ログに追記' }), 'skipped'),
]
// Top-left corners on the 16-unit grid, before the canvas padding.
const placement: Readonly<Record<string, GraphPoint>> = {
  webhook: { x: 0, y: 112 }, lookup: { x: 272, y: 112 }, check: { x: 544, y: 112 },
  summarize: { x: 816, y: 144 }, log: { x: 816, y: 320 },
  receipt: { x: 1088, y: 16 }, crm: { x: 1088, y: 144 }, notify: { x: 1088, y: 272 },
}
const stepsById = new Map(steps.map(item => [item.id, item]))

// A fixed placement instead of the layered layout. Paths are placeholders: every edge has named ports, so the
// component routes it from the port anchors in the chosen edge style.
function layoutSteps(nodes: readonly Step[], links: readonly Flow[]): GraphLayout {
  const boxes = new Map<string, GraphBox>()
  let right = 0, bottom = 0
  nodes.forEach((node, index) => {
    const spot = placement[node.id] ?? { x: index * grid * 4, y: 0 }
    const box = {
      x: spot.x + padding, y: spot.y + padding, width: cardWidth,
      height: node.data.kind === 'condition' ? conditionHeight : cardHeight, rank: Math.round(spot.x / 272),
    }
    boxes.set(node.id, box)
    right = Math.max(right, box.x + box.width)
    bottom = Math.max(bottom, box.y + box.height)
  })
  const base = { boxes, paths: new Map<string, string>(), edgeLabels: new Map(), width: right + padding, height: bottom + padding }
  return completeGraphLayout(base, nodes, links).layout
}

function label(id: string) {
  return stepsById.get(id)?.label ?? id
}
function portName(id: string, port: string | undefined) {
  return port && port !== 'out' && port !== 'in' ? `${label(id)} (${port})` : label(id)
}
// The edge slot does not draw the label; it names the edge's hit area and reconnect handles, for example
// "Select edge Check payment (true) to Summarize order".
function flow(id: string, connection: GraphConnection): Flow {
  return { id, ...connection, label: t({ en: `${portName(connection.from, connection.fromPort)} to ${label(connection.to)}`, ja: `${portName(connection.from, connection.fromPort)} から ${label(connection.to)}` }) }
}

const edges = ref<Flow[]>([
  flow('flow-1', { from: 'webhook', fromPort: 'out', to: 'lookup', toPort: 'in' }),
  flow('flow-2', { from: 'lookup', fromPort: 'out', to: 'check', toPort: 'in' }),
  flow('flow-3', { from: 'check', fromPort: 'true', to: 'summarize', toPort: 'in' }),
  flow('flow-4', { from: 'check', fromPort: 'false', to: 'log', toPort: 'in' }),
  flow('flow-5', { from: 'summarize', fromPort: 'out', to: 'receipt', toPort: 'in' }),
  flow('flow-6', { from: 'summarize', fromPort: 'out', to: 'crm', toPort: 'in' }),
  flow('flow-7', { from: 'summarize', fromPort: 'out', to: 'notify', toPort: 'in' }),
])
// The edges the current run has travelled. A rewired edge leaves the run path.
const runEdgeIds = ref<ReadonlySet<string>>(new Set(['flow-1', 'flow-2', 'flow-3']))
const positions = ref<ReadonlyMap<string, GraphPoint>>(new Map())
const selectedId = ref<string>()
const edgeStyle = ref<GraphEdgeStyle>('curve')
const status = ref(t({
  en: 'Run #1042 is at Summarize order: 3 steps succeeded, 1 is running.',
  ja: '実行 #1042 は「注文を要約」の段階です。3 ステップが成功し、1 ステップが実行中です。',
}))

const doneCount = steps.filter(item => item.data.status === 'done').length
// SVG IDs come from useId, so they are unique on the page and stable between server and client renders.
const uid = useId()
const ids = { shadow: uid + '-shadow', gloss: uid + '-gloss', spark: uid + '-spark' }

function tileFill(kind: StepKind) {
  return kind === 'ai' ? `url(#${ids.spark})` : kinds[kind].color
}

// A click on the empty canvas or Escape in it clears the step selection.
function clearSelection() {
  if (selectedId.value === undefined) return
  selectedId.value = undefined
  status.value = t({ en: 'Selection cleared.', ja: '選択を解除しました。' })
}
function commitMoves(changes: readonly GraphNodeMove[]) {
  const next = new Map(positions.value)
  for (const change of changes) next.set(change.id, change.after)
  positions.value = next
  status.value = changes.length === 1
    ? t({ en: `Moved ${label(changes[0]!.id)}.`, ja: `${label(changes[0]!.id)} を移動しました。` })
    : t({ en: `Moved ${changes.length} steps.`, ja: `${changes.length} 個のステップを移動しました。` })
}
// True when `target` can be reached from `start` along the edges, ignoring the edge being replaced (breadth-first).
function reaches(start: string, target: string, ignored?: string) {
  const seen = new Set([start])
  const queue = [start]
  while (queue.length) {
    const current = queue.shift()!
    if (current === target) return true
    for (const edge of edges.value) {
      if (edge.id === ignored || edge.from !== current || seen.has(edge.to)) continue
      seen.add(edge.to)
      queue.push(edge.to)
    }
  }
  return false
}
function validateConnection(connection: GraphConnection, replacing?: string) {
  if (connection.from === connection.to) return 'A step cannot connect to itself.'
  if (edges.value.some(edge => edge.id !== replacing && edge.from === connection.from && edge.to === connection.to
    && edge.fromPort === connection.fromPort && edge.toPort === connection.toPort)) return t({ en: 'These steps are already connected.', ja: 'これらのステップはすでに接続されています。' })
  if (reaches(connection.to, connection.from, replacing)) return t({ en: 'That connection would create a loop.', ja: 'この接続はループになります。' })
  return true
}
function commitConnection(connection: GraphConnection) {
  const number = unusedNumber(edges.value, 'flow-', edges.value.length + 1)
  edges.value = [...edges.value, flow('flow-' + number, connection)]
  status.value = t({
    en: `Connected ${portName(connection.from, connection.fromPort)} to ${label(connection.to)}.`,
    ja: `${portName(connection.from, connection.fromPort)} を ${label(connection.to)} に接続しました。`,
  })
}
function commitReconnect(change: GraphReconnect) {
  edges.value = edges.value.map(edge => edge.id === change.id ? flow(edge.id, change.after) : edge)
  if (runEdgeIds.value.has(change.id)) runEdgeIds.value = new Set([...runEdgeIds.value].filter(id => id !== change.id))
  status.value = t({
    en: `Rewired ${portName(change.after.from, change.after.fromPort)} to ${label(change.after.to)}.`,
    ja: `${portName(change.after.from, change.after.fromPort)} を ${label(change.after.to)} につなぎ替えました。`,
  })
}
</script>

<template>
  <section class="showcase sc-workflow" aria-labelledby="sc-workflow-title">
    <svg class="sc-workflow-defs" aria-hidden="true" focusable="false" width="0" height="0">
      <defs>
        <filter :id="ids.shadow" x="-20%" y="-25%" width="140%" height="170%" color-interpolation-filters="sRGB">
          <feDropShadow dx="0" dy="1" stdDeviation="1" flood-color="#18181b" flood-opacity=".07" />
          <feDropShadow dx="0" dy="6" stdDeviation="7" flood-color="#18181b" flood-opacity=".07" />
        </filter>
        <linearGradient :id="ids.gloss" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#fff" stop-opacity=".26" />
          <stop offset="1" stop-color="#fff" stop-opacity="0" />
        </linearGradient>
        <linearGradient :id="ids.spark" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#7a5af5" />
          <stop offset="1" stop-color="#c844c4" />
        </linearGradient>
      </defs>
    </svg>
    <div class="sc-workflow-head">
      <div class="sc-workflow-intro">
        <h2 id="sc-workflow-title">{{ t({ en: 'Workflow builder', ja: 'ワークフロービルダー' }) }}</h2>
        <p v-if="locale === 'ja'">ステップカードと実行経路のアニメーションはノードと辺のスロットで描き、入力と分岐の出力は名前付きポートです。キャンバス、ミニマップ、ズーム操作は <code>--vw-*</code> 変数と <code>vw-</code> クラスで装飾しています。</p>
        <p v-else>Step cards and the animated run path come from the node and edge slots, inputs and branch outputs are named ports, and <code>--vw-*</code> variables and <code>vw-</code> classes restyle the canvas, minimap and zoom controls.</p>
      </div>
      <div class="sc-workflow-toolbar">
        <span class="sc-workflow-run"><span class="sc-workflow-run-dot" aria-hidden="true" />{{ t({ en: `Run #1042 · ${doneCount} of ${steps.length} steps`, ja: `実行 #1042 · ${steps.length} ステップ中 ${doneCount} 完了` }) }}</span>
        <div class="sc-workflow-segmented" role="group" :aria-label="t({ en: 'Edge style', ja: '辺のスタイル' })">
          <button type="button" :aria-pressed="edgeStyle === 'curve'" @click="edgeStyle = 'curve'">{{ t({ en: 'Curved', ja: '曲線' }) }}</button>
          <button type="button" :aria-pressed="edgeStyle === 'orthogonal'" @click="edgeStyle = 'orthogonal'">{{ t({ en: 'Step', ja: '直角' }) }}</button>
        </div>
      </div>
    </div>
    <NetworkGraph
      v-model:selected-id="selectedId" unstyled-node-slots class="sc-workflow-graph" :nodes="steps" :edges="edges" :layout="layoutSteps" :positions="positions"
      :height="'clamp(440px, 40vw, 520px)'" :edge-style="edgeStyle" background="dots" :snap-grid="grid"
      draggable connectable reconnectable show-minimap :labels="{ ...labels.graph, region: t({ en: 'Workflow canvas', ja: 'ワークフローのキャンバス' }) }"
      :validate-connection="validateConnection"
      @node-move="commitMoves([$event])" @nodes-move="commitMoves" @connect="commitConnection" @reconnect="commitReconnect"
      @connect-rejected="(_connection, reason) => status = t({ en: 'Rejected: ', ja: '却下: ' }) + reason"
      @background-click="clearSelection" @idle-escape="clearSelection"
    >
      <template #node="{ node, box, selected }">
        <rect class="sc-workflow-ring" x="-5" y="-5" :width="box.width + 10" :height="box.height + 10" rx="16" />
        <rect class="sc-workflow-card" :class="{ 'sc-workflow-is-selected': selected }" :width="box.width" :height="box.height" rx="12" :filter="`url(#${ids.shadow})`" />
        <rect class="sc-workflow-tile" x="16" y="22" width="40" height="40" rx="10" :style="{ fill: tileFill(node.data.kind) }" />
        <rect class="sc-workflow-tile" x="16" y="22" width="40" height="40" rx="10" :style="{ fill: `url(#${ids.gloss})` }" />
        <g class="sc-workflow-icon" transform="translate(25 31) scale(.92)">
          <path v-for="d in kinds[node.data.kind].icon" :key="d" :d="d" />
        </g>
        <text class="sc-workflow-kind" x="70" y="30">{{ kinds[node.data.kind].category }}</text>
        <text class="sc-workflow-title" x="70" y="49">{{ node.label }}</text>
        <text class="sc-workflow-subtitle" x="70" y="66">{{ node.data.subtitle }}</text>
        <g class="sc-workflow-pill" :class="'sc-workflow-pill-' + node.data.status"
          :transform="`translate(${box.width - 12 - statuses[node.data.status].width} 16)`">
          <rect :width="statuses[node.data.status].width" height="19" rx="9.5" />
          <circle cx="10" cy="9.5" r="3" />
          <text x="18" y="13.3">{{ statuses[node.data.status].label }}</text>
        </g>
        <template v-if="node.data.kind === 'condition'">
          <line class="sc-workflow-divider" x1="1" :x2="box.width - 1" y1="84" y2="84" />
          <text class="sc-workflow-branch" x="16" y="106">{{ t({ en: 'Order is paid', ja: '支払い済み' }) }}</text>
          <text class="sc-workflow-branch" x="16" y="124">{{ t({ en: 'Otherwise', ja: 'それ以外' }) }}</text>
          <g class="sc-workflow-chip sc-workflow-chip-true" :transform="`translate(${box.width - 50} 94)`">
            <rect width="36" height="16" rx="4" /><text x="18" y="11.6">true</text>
          </g>
          <g class="sc-workflow-chip sc-workflow-chip-false" :transform="`translate(${box.width - 50} 112)`">
            <rect width="36" height="16" rx="4" /><text x="18" y="11.6">false</text>
          </g>
        </template>
      </template>
      <template #edge="{ edge, path }">
        <template v-if="runEdgeIds.has(edge.id)">
          <path class="sc-workflow-edge-glow" :d="path" />
          <path class="sc-workflow-edge sc-workflow-edge-run" :d="path" />
        </template>
        <path v-else class="sc-workflow-edge" :d="path" />
      </template>
    </NetworkGraph>
    <div class="sc-workflow-foot">
      <p class="sc-workflow-status" role="status">{{ status }}</p>
      <p class="sc-workflow-hint">{{ t({
        en: 'Drag cards (they snap to the dot grid) · drag from an output port to an input port · select an edge to move its ends · click the empty canvas or press Escape to clear the selection',
        ja: 'カードをドラッグ(ドットグリッドにスナップ) · 出力ポートから入力ポートへドラッグして接続 · 辺を選んで端をつなぎ替え · 何もない所をクリックするか Escape で選択を解除',
      }) }}</p>
    </div>
  </section>
</template>

<style>
.sc-workflow {
  color-scheme: light;
  --vw-surface: #fff;
  --vw-surface-muted: #f7f7f9;
  --vw-surface-hover: #f1f1f5;
  --vw-text: #18181b;
  --vw-muted: #6b6b76;
  --vw-border: #e4e4ea;
  --vw-grid: #e4e4ea;
  --vw-edge: #b3b3be;
  --vw-accent: #5b54e0;
  --vw-on-solid: #fff;
  --vw-edge-selected: #5b54e0;
  --vw-background-pattern: #cdcdd6;
  --vw-guide: #e5484d;
  background: #fff;
  color: #18181b;
  border-color: #e4e4ea;
  border-radius: 16px;
  padding: 18px;
  box-shadow: 0 1px 2px rgb(24 24 27 / 4%);
}
.sc-workflow-defs { position: absolute; width: 0; height: 0; overflow: hidden; }
.sc-workflow-head { display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: 12px 24px; margin-bottom: 14px; }
.sc-workflow-intro { flex: 1 1 420px; min-width: 0; }
.sc-workflow h2 { font-size: 18px; letter-spacing: -.01em; margin: 0 0 4px; }
.sc-workflow-intro p { margin: 0; max-width: 88ch; font-size: 13px; line-height: 1.5; color: #5f5f6b; }
.sc-workflow code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12px; padding: 1px 4px; border-radius: 4px; background: #f1f1f5; color: #3f3f46; }
.sc-workflow-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
.sc-workflow-run { display: inline-flex; align-items: center; gap: 7px; padding: 5px 11px; border: 1px solid #e4e4ea; border-radius: 999px; font-size: 12px; font-weight: 600; color: #3f3f46; background: #fafafb; }
.sc-workflow-run-dot { width: 7px; height: 7px; border-radius: 50%; background: #5b54e0; box-shadow: 0 0 0 3px rgb(91 84 224 / 18%); }
.sc-workflow-segmented { display: inline-flex; padding: 3px; gap: 2px; border-radius: 10px; background: #f1f1f5; }
.sc-workflow .sc-workflow-segmented button { border: 0; border-radius: 7px; padding: 5px 12px; background: transparent; color: #52525b; font-size: 12px; font-weight: 600; }
.sc-workflow .sc-workflow-segmented button[aria-pressed=true] { background: #fff; color: #18181b; box-shadow: 0 1px 2px rgb(24 24 27 / 10%), 0 1px 6px rgb(24 24 27 / 6%); }
.sc-workflow .sc-workflow-segmented button:focus-visible { outline: 2px solid #5b54e0; outline-offset: 1px; }
.sc-workflow-foot { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 4px 16px; margin-top: 10px; font-size: 12px; }
.sc-workflow-status { margin: 0; min-height: 18px; color: #27272a; font-weight: 500; }
.sc-workflow-hint { margin: 0; color: #6b6b76; }

/* Canvas, zoom controls and minimap. */
.sc-workflow .vw-network { border-color: #e4e4ea; border-radius: 12px; overflow: hidden; }
.sc-workflow .vw-zoom-tools { left: 12px; right: auto; bottom: 12px; border: 1px solid #e4e4ea; border-radius: 10px; background: #fff; box-shadow: 0 1px 2px rgb(24 24 27 / 6%), 0 6px 18px rgb(24 24 27 / 8%); }
.sc-workflow .vw-zoom-tools button { min-width: 32px; height: 32px; padding: 0 8px; border: 0; border-radius: 0; background: #fff; color: #3f3f46; font-size: 15px; }
.sc-workflow .vw-zoom-tools button:hover { background: #f4f4f7; }
.sc-workflow .vw-zoom-tools output { min-width: 42px; font-size: 11px; color: #6b6b76; }
.sc-workflow .vw-zoom-tools .vw-fit-button { padding: 0 12px; border-left: 1px solid #ececf0; font-size: 12px; font-weight: 600; }
.sc-workflow .vw-minimap { right: 12px; bottom: 12px; width: 168px; height: 100px; padding: 8px; border: 1px solid #e4e4ea; border-radius: 12px; background: #fff; box-shadow: 0 1px 2px rgb(24 24 27 / 6%), 0 6px 18px rgb(24 24 27 / 8%); }
.sc-workflow .vw-minimap rect { fill: #dcdce3; }
.sc-workflow .vw-minimap rect.vw-is-selected { fill: #5b54e0; }
.sc-workflow .vw-minimap .vw-minimap-window { fill: rgb(91 84 224 / 7%); stroke: #5b54e0; stroke-width: 1.25; }

/* Step cards. Every rule names a slot class, so it outranks the stylesheet's rules for default node rectangles and text. */
.sc-workflow .vw-network-node:focus-visible { outline: none; }
.sc-workflow .vw-network-node .sc-workflow-ring { fill: none; stroke: none; }
.sc-workflow .vw-network-node.vw-is-selected .sc-workflow-ring { stroke: rgb(91 84 224 / 22%); stroke-width: 4px; }
.sc-workflow .vw-network-node:focus-visible .sc-workflow-ring { stroke: #5b54e0; stroke-width: 2px; }
.sc-workflow .vw-network-node .sc-workflow-card { fill: #fff; stroke: #e2e2e8; stroke-width: 1px; transition: stroke .15s; }
.sc-workflow .vw-network-node:hover .sc-workflow-card { stroke: #c8c8d2; stroke-width: 1px; }
.sc-workflow .vw-network-node .sc-workflow-card.sc-workflow-is-selected { stroke: #5b54e0; stroke-width: 1.5px; }
.sc-workflow .vw-network-node .sc-workflow-tile { stroke: none; }
.sc-workflow .sc-workflow-icon path { fill: none; stroke: #fff; stroke-width: 1.9px; stroke-linecap: round; stroke-linejoin: round; }
.sc-workflow .vw-network-node .sc-workflow-kind { fill: #6b6b76; font-size: 9.5px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
.sc-workflow .vw-network-node .sc-workflow-title { fill: #18181b; font-size: 13.5px; font-weight: 650; }
.sc-workflow .vw-network-node .sc-workflow-subtitle { fill: #6b6b76; font-size: 11.5px; }
.sc-workflow .vw-network-node .sc-workflow-divider { stroke: #ececf0; stroke-width: 1px; }
.sc-workflow .vw-network-node .sc-workflow-branch { fill: #52525b; font-size: 11.5px; }
.sc-workflow .vw-network-node .sc-workflow-chip rect { stroke: none; }
.sc-workflow .vw-network-node .sc-workflow-chip text { font-size: 10px; font-weight: 700; text-anchor: middle; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
.sc-workflow .vw-network-node .sc-workflow-chip-true rect { fill: #e5f6ec; }
.sc-workflow .vw-network-node .sc-workflow-chip-true text { fill: #17703e; }
.sc-workflow .vw-network-node .sc-workflow-chip-false rect { fill: #fdecec; }
.sc-workflow .vw-network-node .sc-workflow-chip-false text { fill: #b42328; }
.sc-workflow .vw-network-node .sc-workflow-pill rect { stroke: none; }
.sc-workflow .vw-network-node .sc-workflow-pill text { font-size: 10.5px; font-weight: 600; }
.sc-workflow .vw-network-node .sc-workflow-pill-done rect { fill: #e7f6ed; }
.sc-workflow .vw-network-node .sc-workflow-pill-done text { fill: #17703e; }
.sc-workflow .sc-workflow-pill-done circle { fill: #22a05a; }
.sc-workflow .vw-network-node .sc-workflow-pill-running rect { fill: #eeedfd; }
.sc-workflow .vw-network-node .sc-workflow-pill-running text { fill: #4740c4; }
.sc-workflow .sc-workflow-pill-running circle { fill: #5b54e0; animation: sc-workflow-pulse 1.2s ease-in-out infinite; }
.sc-workflow .vw-network-node .sc-workflow-pill-queued rect { fill: #f1f1f5; }
.sc-workflow .vw-network-node .sc-workflow-pill-queued text { fill: #5c5c66; }
.sc-workflow .sc-workflow-pill-queued circle { fill: #a1a1ad; }
.sc-workflow .vw-network-node .sc-workflow-pill-skipped rect { fill: #fdf2e1; }
.sc-workflow .vw-network-node .sc-workflow-pill-skipped text { fill: #93570a; }
.sc-workflow .sc-workflow-pill-skipped circle { fill: #e09a32; }

/* Ports are the connection handles of NetworkGraph, drawn above the cards. */
.sc-workflow .vw-connect-handle { r: 5px; fill: #fff; stroke: #a5a5b2; stroke-width: 1.5px; transition: stroke .15s, fill .15s; }
.sc-workflow .vw-connect-handle:hover { stroke: #5b54e0; stroke-width: 2px; }
.sc-workflow .vw-connect-handle.vw-is-active, .sc-workflow .vw-connect-handle:focus-visible { fill: #5b54e0; stroke: #fff; stroke-width: 2px; }
.sc-workflow .vw-connection-preview { stroke: #5b54e0; stroke-width: 2px; stroke-dasharray: none; }
.sc-workflow .vw-reconnect-handle { r: 6px; fill: #5b54e0; stroke: #fff; }
.sc-workflow .vw-reconnect-handle:focus-visible { outline: none; fill: #fff; stroke: #5b54e0; stroke-width: 3px; }

/* Edges from the edge slot. */
.sc-workflow .sc-workflow-edge { fill: none; stroke: #b3b3be; stroke-width: 1.75px; }
.sc-workflow .sc-workflow-edge-glow { fill: none; stroke: rgb(91 84 224 / 14%); stroke-width: 7px; stroke-linecap: round; }
.sc-workflow .sc-workflow-edge.sc-workflow-edge-run { stroke: #5b54e0; stroke-width: 2px; stroke-dasharray: 7 5; animation: sc-workflow-flow .9s linear infinite; }
.sc-workflow .vw-edge-hit.vw-is-active { stroke: #5b54e0; stroke-opacity: .22; stroke-width: 8; }
@keyframes sc-workflow-flow { to { stroke-dashoffset: -24; } }
@keyframes sc-workflow-pulse { 50% { opacity: .35; } }
@media (prefers-reduced-motion: reduce) {
  .sc-workflow .sc-workflow-edge.sc-workflow-edge-run, .sc-workflow .sc-workflow-pill-running circle { animation: none; }
}
@media (max-width: 650px) {
  .sc-workflow { padding: 12px; border-radius: 12px; }
  .sc-workflow .vw-minimap { width: 112px; height: 72px; padding: 5px; }
  .sc-workflow .vw-zoom-tools .vw-fit-button { padding: 0 9px; }
}
</style>
