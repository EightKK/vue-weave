<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  NetworkGraph, completeGraphLayout,
  type GraphBox, type GraphEdge, type GraphLayout, type GraphNodeMove, type GraphPoint, type GraphPort, type NetworkNode, type ViewTargetEvent,
  type GraphViewTarget,
} from '../../src'
import { useDemoLocale } from '../i18n'

// A database schema diagram: one table card per node with a named port per column on both sides, so relationship
// edges join column to column. The edges pick the facing sides of their tables and draw crow's-foot marks.
type Column = { name: string; type: string; pk?: boolean; fk?: boolean; nullable?: boolean }
type TableData = { color: string; note: string; columns: readonly Column[] }

const { t, labels, locale } = useDemoLocale()
type Table = NetworkNode<TableData> & { data: TableData }
type Relation = { table: string; column: string; refTable: string; refColumn: string; optional: boolean }
type Link = GraphEdge<Relation> & { data: Relation; fromPort: string; toPort: string }

const tableWidth = 232
const headerHeight = 38
const rowHeight = 24
const footer = 8
const padding = 32

const pk = (name: string, type = 'uuid'): Column => ({ name, type, pk: true })
const fk = (name: string, nullable = false): Column => ({ name, type: 'uuid', fk: true, nullable })
const col = (name: string, type: string, nullable = false): Column => ({ name, type, nullable })
function table(id: string, color: string, note: string, columns: Column[]): Table {
  const height = headerHeight + columns.length * rowHeight + footer
  const ports: GraphPort[] = columns.flatMap((column, index) => {
    const offset = (headerHeight + index * rowHeight + rowHeight / 2) / height
    return [
      { id: column.name + ':left', side: 'left', offset, label: column.name },
      { id: column.name + ':right', side: 'right', offset, label: column.name },
    ]
  })
  return { id, label: id, detail: t({ en: columns.length + ' columns', ja: columns.length + ' 列' }), ports, data: { color, note, columns } }
}
const tables: readonly Table[] = [
  table('organizations', '#e9a23b', t({ en: 'Workspaces that own users and projects.', ja: 'ユーザーとプロジェクトを持つワークスペース。' }), [
    pk('id'), col('name', 'text'), col('slug', 'text'), col('plan', 'text'), col('created_at', 'timestamptz'),
  ]),
  table('users', '#4ea6ee', t({ en: 'People who sign in; each belongs to one organization.', ja: 'サインインする人。それぞれ1つの組織に属します。' }), [
    pk('id'), fk('org_id'), col('email', 'text'), col('full_name', 'text'), col('role', 'text'), col('created_at', 'timestamptz'),
  ]),
  table('projects', '#a17cf0', t({ en: 'Projects of an organization, each with an owner.', ja: '組織のプロジェクト。それぞれに所有者がいます。' }), [
    pk('id'), fk('org_id'), fk('owner_id'), col('name', 'text'), col('status', 'text'), col('created_at', 'timestamptz'),
  ]),
  table('tasks', '#3ec48b', t({ en: 'Work items of a project; the assignee is optional.', ja: 'プロジェクトの作業項目。担当者は任意です。' }), [
    pk('id'), fk('project_id'), fk('assignee_id', true), col('title', 'text'), col('status', 'text'), col('priority', 'int2'),
    col('due_on', 'date', true),
  ]),
  table('comments', '#ea6799', t({ en: 'Discussion on a task.', ja: 'タスクについてのやり取り。' }), [
    pk('id'), fk('task_id'), fk('author_id'), col('body', 'text'), col('created_at', 'timestamptz'),
  ]),
  table('task_tags', '#8b97ae', t({ en: 'Join table between tasks and tags.', ja: 'タスクとタグをつなぐ中間テーブル。' }), [
    { ...fk('task_id'), pk: true }, { ...fk('tag_id'), pk: true },
  ]),
  table('tags', '#ef8a4c', t({ en: 'Labels that can be attached to many tasks.', ja: '多くのタスクに付けられるラベル。' }), [
    pk('id'), col('name', 'text'), col('color', 'text'),
  ]),
]
const tablesById = new Map(tables.map(item => [item.id, item]))
const relations: Readonly<Record<string, Relation>> = {
  'users.org_id': { table: 'users', column: 'org_id', refTable: 'organizations', refColumn: 'id', optional: false },
  'projects.org_id': { table: 'projects', column: 'org_id', refTable: 'organizations', refColumn: 'id', optional: false },
  'projects.owner_id': { table: 'projects', column: 'owner_id', refTable: 'users', refColumn: 'id', optional: false },
  'tasks.project_id': { table: 'tasks', column: 'project_id', refTable: 'projects', refColumn: 'id', optional: false },
  'tasks.assignee_id': { table: 'tasks', column: 'assignee_id', refTable: 'users', refColumn: 'id', optional: true },
  'comments.task_id': { table: 'comments', column: 'task_id', refTable: 'tasks', refColumn: 'id', optional: false },
  'comments.author_id': { table: 'comments', column: 'author_id', refTable: 'users', refColumn: 'id', optional: false },
  'task_tags.task_id': { table: 'task_tags', column: 'task_id', refTable: 'tasks', refColumn: 'id', optional: false },
  'task_tags.tag_id': { table: 'task_tags', column: 'tag_id', refTable: 'tags', refColumn: 'id', optional: false },
}
// Top-left corners before the canvas padding.
const placement: Readonly<Record<string, GraphPoint>> = {
  organizations: { x: 0, y: 128 },
  users: { x: 300, y: 0 }, projects: { x: 300, y: 236 },
  tasks: { x: 600, y: 152 }, task_tags: { x: 600, y: 410 },
  comments: { x: 900, y: 0 }, tags: { x: 900, y: 250 },
}

function tableHeight(item: Table) {
  return headerHeight + item.data.columns.length * rowHeight + footer
}
function placedBox(item: Table, index: number): GraphBox {
  const spot = placement[item.id] ?? { x: index * 40, y: 0 }
  return { x: spot.x + padding, y: spot.y + padding, width: tableWidth, height: tableHeight(item), rank: Math.round(spot.x / 300) }
}
// Fixed placement with heights that follow the column count. Paths are placeholders: every edge has named ports,
// so the component routes it from the port anchors.
function layoutTables(nodes: readonly Table[], links: readonly Link[]): GraphLayout {
  const boxes = new Map<string, GraphBox>()
  let right = 0, bottom = 0
  nodes.forEach((node, index) => {
    const box = placedBox(node, index)
    boxes.set(node.id, box)
    right = Math.max(right, box.x + box.width)
    bottom = Math.max(bottom, box.y + box.height)
  })
  const base = { boxes, paths: new Map<string, string>(), edgeLabels: new Map(), width: right + padding, height: bottom + padding }
  return completeGraphLayout(base, nodes, links).layout
}

const positions = ref<ReadonlyMap<string, GraphPoint>>(new Map())
const selectedId = ref<string>()
const hoveredId = ref<string>()
const status = ref(t({
  en: 'Select or hover a table to trace its relationships. Drag a table and its relationships switch sides.',
  ja: 'テーブルを選ぶかポインターを重ねると関係をたどります。テーブルをドラッグすると関係線の向きが変わります。',
}))

function boxOf(id: string) {
  const item = tablesById.get(id)!
  const box = placedBox(item, tables.indexOf(item))
  const moved = positions.value.get(id)
  return moved ? { ...box, x: moved.x, y: moved.y } : box
}
// The facing sides of two tables, or both right sides when they overlap horizontally.
function sides(source: GraphBox, target: GraphBox): ['left' | 'right', 'left' | 'right'] {
  if (target.x >= source.x + source.width) return ['right', 'left']
  if (source.x >= target.x + target.width) return ['left', 'right']
  return ['right', 'right']
}
// Recomputed after each committed move; the previous array is kept while no port changes, so an unchanged schema
// does not give the graph new edges.
const edges = computed<readonly Link[]>((previous) => {
  const next = Object.entries(relations).map(([id, relation]): Link => {
    const [fromSide, toSide] = sides(boxOf(relation.table), boxOf(relation.refTable))
    return {
      id, from: relation.table, to: relation.refTable,
      fromPort: relation.column + ':' + fromSide, toPort: relation.refColumn + ':' + toSide, data: relation,
    }
  })
  return previous && next.every((edge, index) => edge.fromPort === previous[index]?.fromPort && edge.toPort === previous[index]?.toPort)
    ? previous : next
})

// Hover wins over selection; both trace the table's relationships.
const focusId = computed(() => hoveredId.value ?? selectedId.value)
const focusEdges = computed(() => {
  const id = focusId.value
  return id ? new Set(edges.value.filter(edge => edge.from === id || edge.to === id).map(edge => edge.id)) : undefined
})
const focusTables = computed(() => {
  const id = focusId.value
  if (!id) return undefined
  const related = new Set([id])
  for (const edge of edges.value) if (focusEdges.value!.has(edge.id)) related.add(edge.from).add(edge.to)
  return related
})
const dimmedIds = computed(() => focusTables.value && new Set(tables.filter(item => !focusTables.value!.has(item.id)).map(item => item.id)))
const neighbourIds = computed(() => focusTables.value && new Set([...focusTables.value].filter(id => id !== focusId.value)))
const hotColumns = computed(() => {
  const result = new Set<string>()
  for (const edge of edges.value) {
    if (!focusEdges.value?.has(edge.id)) continue
    result.add(edge.from + '.' + edge.data.column).add(edge.to + '.' + edge.data.refColumn)
  }
  return result
})

watch(selectedId, id => {
  if (!id) return
  const references = edges.value.filter(edge => edge.from === id).map(edge => edge.to)
  const referencedBy = edges.value.filter(edge => edge.to === id).map(edge => edge.from)
  const parts = [
    references.length
      ? t({ en: 'references ', ja: '参照先 ' }) + [...new Set(references)].join(', ')
      : t({ en: 'references no table', ja: '参照先なし' }),
    referencedBy.length
      ? t({ en: 'referenced by ', ja: '参照元 ' }) + [...new Set(referencedBy)].join(', ')
      : t({ en: 'not referenced', ja: '参照元なし' }),
  ]
  status.value = t({ en: `${id}: ${parts.join(' · ')}.`, ja: `${id}: ${parts.join(' · ')}。` })
})
function enter(event: ViewTargetEvent<GraphViewTarget>) {
  if (event.target.kind === 'node') hoveredId.value = event.target.id
}
function leave(event: ViewTargetEvent<GraphViewTarget>) {
  if (event.target.kind === 'node' && hoveredId.value === event.target.id) hoveredId.value = undefined
}
function commitMoves(changes: readonly GraphNodeMove[]) {
  const next = new Map(positions.value)
  for (const change of changes) next.set(change.id, change.after)
  const before = edges.value
  positions.value = next
  const names = changes.map(change => change.id).join(', ')
  status.value = edges.value === before
    ? t({ en: `Moved ${names}.`, ja: `${names} を移動しました。` })
    : t({ en: `Moved ${names}; relationships switched sides.`, ja: `${names} を移動しました。関係線の向きが変わりました。` })
}

// Cardinality marks at both ends of an orthogonal route. The route leaves and enters perpendicular to the port side,
// so the first and last points and the port sides are enough.
function endpoints(path: string) {
  const values = (path.match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? []).map(Number)
  return { start: { x: values[0] ?? 0, y: values[1] ?? 0 }, end: { x: values.at(-2) ?? 0, y: values.at(-1) ?? 0 } }
}
function outward(port: string) {
  return port.endsWith(':right') ? 1 : -1
}
function manyMark(point: GraphPoint, direction: number) {
  const tip = point.x + direction * 11
  return `M ${tip} ${point.y} L ${point.x} ${point.y - 6} M ${tip} ${point.y} L ${point.x} ${point.y} M ${tip} ${point.y} L ${point.x} ${point.y + 6}`
}
function oneMark(point: GraphPoint, direction: number, optional: boolean) {
  const near = point.x + direction * 6, far = point.x + direction * 10
  return optional ? `M ${near} ${point.y - 5} V ${point.y + 5}` : `M ${near} ${point.y - 5} V ${point.y + 5} M ${far} ${point.y - 5} V ${point.y + 5}`
}
function headerPath(width: number) {
  return `M 0 8 A 8 8 0 0 1 8 0 H ${width - 8} A 8 8 0 0 1 ${width} 8 V ${headerHeight} H 0 Z`
}
function topEdge(width: number) {
  return `M 1 8 A 7 7 0 0 1 8 1 H ${width - 8} A 7 7 0 0 1 ${width - 1} 8`
}
function relationText(edge: Link) {
  const { table, column, refTable, refColumn, optional } = edge.data
  return { from: `${table}.${column}`, to: `${refTable}.${refColumn}`, kind: optional ? t({ en: 'many to zero or one', ja: '多対0または1' }) : t({ en: 'many to one', ja: '多対1' }) }
}
</script>

<template>
  <section class="showcase sc-schema" aria-labelledby="sc-schema-title">
    <div class="sc-schema-head">
      <div class="sc-schema-intro">
        <h2 id="sc-schema-title">{{ t({ en: 'Database schema', ja: 'データベーススキーマ' }) }}</h2>
        <p v-if="locale === 'ja'">テーブルカードと鳥の足記法の関係線はノードと辺のスロットで描き、各列は左右両側の名前付きポートです。ダークなキャンバスは <code>--vw-*</code> 変数で設定しています。</p>
        <p v-else>The node and edge slots draw the table cards and crow's-foot relationships, every column is a named port on both sides, and <code>--vw-*</code> variables set the dark canvas.</p>
      </div>
      <ul class="sc-schema-legend" :aria-label="t({ en: 'Legend', ja: '凡例' })">
        <li>
          <svg viewBox="0 0 14 14" aria-hidden="true"><g class="sc-schema-key"><circle cx="4.6" cy="9.4" r="2.6" /><path d="M6.5 7.5 11.5 2.5M9.6 4.4l1.5 1.5M8.2 5.8l1.2 1.2" /></g></svg>
          {{ t({ en: 'Primary key', ja: '主キー' }) }}
        </li>
        <li>
          <svg viewBox="0 0 14 14" aria-hidden="true"><g class="sc-schema-link"><path d="M5.8 8.2 8.2 5.8M6.3 4.3l1-1a2.3 2.3 0 0 1 3.3 3.3l-1 1M7.7 9.7l-1 1a2.3 2.3 0 0 1-3.3-3.3l1-1" /></g></svg>
          {{ t({ en: 'Foreign key', ja: '外部キー' }) }}
        </li>
        <li>
          <svg viewBox="0 0 28 14" aria-hidden="true"><path class="sc-schema-legend-line" d="M2 7H26M13 7 2 1M13 7 2 13" /></svg>
          {{ t({ en: 'Many', ja: '多' }) }}
        </li>
        <li>
          <svg viewBox="0 0 28 14" aria-hidden="true"><path class="sc-schema-legend-line" d="M2 7H26M16 2V12M20 2V12" /></svg>
          {{ t({ en: 'One', ja: '1' }) }}
        </li>
      </ul>
    </div>
    <NetworkGraph
      v-model:selected-id="selectedId" unstyled-node-slots class="sc-schema-graph" :nodes="tables" :edges="edges" :layout="layoutTables" :positions="positions"
      :height="'clamp(440px, 44vw, 560px)'" edge-style="orthogonal" background="lines" :background-gap="24" draggable show-minimap
      :highlighted-edge-ids="focusEdges" :highlighted-node-ids="neighbourIds" :dimmed-ids="dimmedIds" :tooltip-delay="250"
      :labels="{ ...labels.graph, region: t({ en: 'Schema diagram', ja: 'スキーマ図' }) }"
      @node-move="commitMoves([$event])" @nodes-move="commitMoves" @target-enter="enter" @target-leave="leave"
    >
      <template #node="{ node, box, selected }">
        <rect class="sc-schema-glow" :class="{ 'sc-schema-is-selected': selected }" x="-4" y="-4" :width="box.width + 8" :height="box.height + 8" rx="12" />
        <rect class="sc-schema-card" :width="box.width" :height="box.height" rx="8" />
        <path class="sc-schema-header" :d="headerPath(box.width)" :style="{ fill: node.data.color }" />
        <path class="sc-schema-top" :d="topEdge(box.width)" :style="{ stroke: node.data.color }" />
        <g class="sc-schema-glyph" transform="translate(12 13)" :style="{ stroke: node.data.color }">
          <rect width="13" height="12" rx="2" /><path d="M0 4.5H13M4.5 4.5V12" />
        </g>
        <text class="sc-schema-name" x="33" y="24">{{ node.label }}</text>
        <text class="sc-schema-count" :x="box.width - 12" y="24">{{ node.data.columns.length }} {{ t({ en: 'cols', ja: '列' }) }}</text>
        <g v-for="(column, index) in node.data.columns" :key="column.name" class="sc-schema-row"
          :class="{ 'sc-schema-row-alt': index % 2 === 1, 'sc-schema-row-hot': hotColumns.has(node.id + '.' + column.name) }"
          :transform="`translate(0 ${headerHeight + index * rowHeight})`">
          <rect class="sc-schema-stripe" x="1" :width="box.width - 2" :height="rowHeight" />
          <g v-if="column.pk" class="sc-schema-key" transform="translate(11 5)">
            <circle cx="4.6" cy="9.4" r="2.6" /><path d="M6.5 7.5 11.5 2.5M9.6 4.4l1.5 1.5M8.2 5.8l1.2 1.2" />
          </g>
          <g v-else-if="column.fk" class="sc-schema-link" transform="translate(11 5)">
            <path d="M5.8 8.2 8.2 5.8M6.3 4.3l1-1a2.3 2.3 0 0 1 3.3 3.3l-1 1M7.7 9.7l-1 1a2.3 2.3 0 0 1-3.3-3.3l1-1" />
          </g>
          <text class="sc-schema-column" x="32" y="16">{{ column.name }}</text>
          <text class="sc-schema-type" :x="box.width - 12" y="16">{{ column.type }}<tspan v-if="column.nullable" class="sc-schema-null">?</tspan></text>
        </g>
        <rect class="sc-schema-border" :width="box.width" :height="box.height" rx="8" />
      </template>
      <template #edge="{ edge, path }">
        <path class="sc-schema-edge" :d="path" />
        <path class="sc-schema-mark" :d="manyMark(endpoints(path).start, outward(edge.fromPort))" />
        <path class="sc-schema-mark" :d="oneMark(endpoints(path).end, outward(edge.toPort), edge.data.optional)" />
        <circle v-if="edge.data.optional" class="sc-schema-optional" :cx="endpoints(path).end.x + outward(edge.toPort) * 13" :cy="endpoints(path).end.y" r="2.8" />
      </template>
      <template #tooltip="{ target }">
        <template v-if="target.kind === 'edge'">
          <span class="sc-schema-tip-code">{{ relationText(target.edge).from }} → {{ relationText(target.edge).to }}</span>
          <span class="sc-schema-tip-note">{{ relationText(target.edge).kind }}</span>
        </template>
        <template v-else>
          <span class="sc-schema-tip-code">{{ target.node.label }}</span>
          <span class="sc-schema-tip-note">{{ target.node.data.note }}</span>
        </template>
      </template>
    </NetworkGraph>
    <p class="sc-schema-status" role="status">{{ status }}</p>
  </section>
</template>

<style>
.sc-schema {
  color-scheme: dark;
  --vw-surface: #161c27;
  --vw-surface-muted: #0e131b;
  --vw-surface-hover: #212938;
  --vw-text: #e3e8f0;
  --vw-muted: #8d97ab;
  --vw-border: #273042;
  --vw-grid: #1a2130;
  --vw-edge: #637089;
  --vw-accent: #3fd0a4;
  --vw-on-solid: #08110e;
  --vw-background-pattern: #182030;
  --vw-graph-highlight: #3fd0a4;
  --vw-dimmed-opacity: .3;
  --sc-schema-mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  background: #0a0e15;
  color: #e3e8f0;
  border-color: #1d2431;
  border-radius: 14px;
  padding: 18px;
}
.sc-schema-head { display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: 12px 24px; margin-bottom: 14px; }
.sc-schema-intro { flex: 1 1 420px; min-width: 0; }
.sc-schema h2 { font-size: 18px; letter-spacing: -.01em; margin: 0 0 4px; color: #f2f5fa; }
.sc-schema-intro p { margin: 0; max-width: 88ch; font-size: 13px; line-height: 1.5; color: #9aa4b8; }
.sc-schema code { font-family: var(--sc-schema-mono); font-size: 12px; padding: 1px 4px; border-radius: 4px; background: #182030; color: #c8d1e0; }
.sc-schema-legend { display: flex; flex-wrap: wrap; gap: 6px 16px; margin: 0; padding: 0; list-style: none; font-size: 12px; color: #9aa4b8; }
.sc-schema-legend li { display: inline-flex; align-items: center; gap: 6px; }
.sc-schema-legend svg { height: 14px; width: auto; overflow: visible; }
.sc-schema-legend-line { fill: none; stroke: #8d97ab; stroke-width: 1.4px; }
.sc-schema-status { margin: 10px 0 0; min-height: 18px; font-size: 12px; color: #c3cad8; font-family: var(--sc-schema-mono); }

/* Canvas, zoom controls, minimap and tooltip. */
.sc-schema .vw-network { border-color: #1d2431; border-radius: 10px; overflow: hidden; }
.sc-schema .vw-zoom-tools { left: 12px; right: auto; bottom: 12px; border: 1px solid #273042; border-radius: 8px; background: #161c27; color: #c9d1df; box-shadow: 0 8px 24px rgb(0 0 0 / 40%); }
.sc-schema .vw-zoom-tools button { min-width: 30px; height: 30px; padding: 0 8px; border: 0; border-radius: 0; background: #161c27; color: #c9d1df; font-size: 14px; }
.sc-schema .vw-zoom-tools button:hover { background: #212938; }
.sc-schema .vw-zoom-tools output { min-width: 42px; font-family: var(--sc-schema-mono); font-size: 11px; font-weight: 500; color: #8d97ab; }
.sc-schema .vw-zoom-tools .vw-fit-button { padding: 0 11px; border-left: 1px solid #273042; font-size: 12px; font-weight: 600; }
.sc-schema .vw-minimap { right: 12px; bottom: 12px; width: 156px; height: 96px; padding: 7px; border: 1px solid #273042; border-radius: 8px; background: #121822; box-shadow: 0 8px 24px rgb(0 0 0 / 40%); }
.sc-schema .vw-minimap rect { fill: #2c3547; }
.sc-schema .vw-minimap rect.vw-is-selected { fill: #3fd0a4; }
.sc-schema .vw-minimap .vw-minimap-window { fill: rgb(63 208 164 / 6%); stroke: #3fd0a4; stroke-width: 1.25; }
.sc-schema .vw-network-tooltip { display: grid; gap: 3px; max-width: 280px; padding: 8px 10px; border-color: #2f394d; border-radius: 8px; background: #1b2230; color: #e3e8f0; box-shadow: 0 10px 28px rgb(0 0 0 / 45%); font-size: 12px; }
.sc-schema-tip-code { font-family: var(--sc-schema-mono); font-size: 11.5px; color: #f2f5fa; }
.sc-schema-tip-note { color: #9aa4b8; }

/* Table cards. Every rule names a slot class, so it outranks the stylesheet's rules for default node rectangles and text. */
.sc-schema .vw-network-node:focus-visible { outline: none; }
.sc-schema .vw-network-node .sc-schema-glow { fill: none; stroke: none; }
.sc-schema .vw-network-node .sc-schema-glow.sc-schema-is-selected { stroke: rgb(63 208 164 / 35%); stroke-width: 3px; }
.sc-schema .vw-network-node:focus-visible .sc-schema-glow { stroke: #3fd0a4; stroke-width: 2px; }
.sc-schema .vw-network-node .sc-schema-card { fill: #151b26; stroke: none; }
.sc-schema .vw-network-node .sc-schema-border { fill: none; stroke: #2a3345; stroke-width: 1px; }
.sc-schema .vw-network-node:hover .sc-schema-border { stroke: #3a4559; }
.sc-schema .vw-network-node.vw-is-highlighted .sc-schema-border { stroke: rgb(63 208 164 / 55%); stroke-width: 1px; }
.sc-schema .vw-network-node.vw-is-selected .sc-schema-border { stroke: #3fd0a4; stroke-width: 1.5px; }
.sc-schema .sc-schema-header { fill-opacity: .13; stroke: none; }
.sc-schema .sc-schema-top { fill: none; stroke-width: 2.5px; }
.sc-schema .vw-network-node .sc-schema-glyph rect { fill: none; stroke-width: 1.4px; }
.sc-schema .sc-schema-glyph path { fill: none; stroke-width: 1.4px; }
.sc-schema .vw-network-node .sc-schema-name { fill: #f2f5fa; font-family: var(--sc-schema-mono); font-size: 13px; font-weight: 700; }
.sc-schema .vw-network-node .sc-schema-count { fill: #7f899d; font-family: var(--sc-schema-mono); font-size: 10.5px; text-anchor: end; }
.sc-schema .vw-network-node .sc-schema-stripe { fill: transparent; stroke: none; }
.sc-schema .vw-network-node .sc-schema-row-alt .sc-schema-stripe { fill: rgb(255 255 255 / 2.6%); }
.sc-schema .vw-network-node .sc-schema-row-hot .sc-schema-stripe { fill: rgb(63 208 164 / 11%); }
.sc-schema .vw-network-node .sc-schema-column { fill: #d5dbe6; font-family: var(--sc-schema-mono); font-size: 12px; }
.sc-schema .vw-network-node .sc-schema-row-hot .sc-schema-column { fill: #7ff0cb; }
.sc-schema .vw-network-node .sc-schema-type { fill: #7f899d; font-family: var(--sc-schema-mono); font-size: 11px; text-anchor: end; }
.sc-schema .vw-network-node .sc-schema-null { fill: #5d6880; }
.sc-schema .sc-schema-key circle, .sc-schema .sc-schema-key path { fill: none; stroke: #f0c24f; stroke-width: 1.5px; stroke-linecap: round; }
.sc-schema .sc-schema-link path { fill: none; stroke: #6cb4f5; stroke-width: 1.5px; stroke-linecap: round; }

/* Relationships from the edge slot. Highlighted edges are those of the hovered or selected table. */
.sc-schema .sc-schema-edge, .sc-schema .sc-schema-mark { fill: none; stroke: #637089; stroke-width: 1.5px; }
.sc-schema .sc-schema-optional { fill: #0e131b; stroke: #637089; stroke-width: 1.5px; }
.sc-schema .vw-is-highlighted .sc-schema-edge, .sc-schema .vw-is-highlighted .sc-schema-mark, .sc-schema .vw-is-highlighted .sc-schema-optional { stroke: #3fd0a4; stroke-width: 2px; }
@media (max-width: 650px) {
  .sc-schema { padding: 12px; border-radius: 12px; }
  .sc-schema .vw-minimap { width: 112px; height: 70px; padding: 5px; }
}
</style>
