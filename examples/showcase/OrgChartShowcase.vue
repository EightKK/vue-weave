<script setup lang="ts">
import { computed, ref, useId } from 'vue'
import {
  NetworkGraph, layoutTreeGraph, type GraphBox, type GraphEdge, type GraphLayoutFunction, type GraphNodeSize, type GraphPoint,
  type NetworkNode,
} from '../../src'
import { useDemoLocale } from '../i18n'

type DepartmentId = 'exec' | 'eng' | 'design' | 'sales' | 'people'

const { t, labels, isJapanese } = useDemoLocale()
interface Person {
  id: string
  name: string
  title: string
  department: DepartmentId
  manager?: string
  location: string
  since: number
}

// Department colours are set in the stylesheet below (`sc-org-dept-*`); this table holds names only.
const departments: Record<DepartmentId, { label: string; chip: string }> = {
  exec: { label: t({ en: 'Executive', ja: '経営' }), chip: t({ en: 'Executive', ja: '経営' }) },
  eng: { label: t({ en: 'Engineering', ja: 'エンジニアリング' }), chip: t({ en: 'Engineering', ja: '開発' }) },
  design: { label: t({ en: 'Product & Design', ja: 'プロダクト・デザイン' }), chip: t({ en: 'Design', ja: 'デザイン' }) },
  sales: { label: t({ en: 'Sales & Marketing', ja: '営業・マーケティング' }), chip: t({ en: 'Sales', ja: '営業' }) },
  people: { label: t({ en: 'People & Ops', ja: '人事・総務' }), chip: t({ en: 'People', ja: '人事' }) },
}

const people: Person[] = [
  { id: 'ceo', name: 'Amara Okafor', title: t({ en: 'Chief Executive Officer', ja: '最高経営責任者' }), department: 'exec', location: 'Lisbon', since: 2016 },
  { id: 'cto', name: 'Lukas Brenner', title: t({ en: 'VP Engineering', ja: 'エンジニアリング担当VP' }), department: 'eng', manager: 'ceo', location: 'Berlin', since: 2017 },
  { id: 'vp-design', name: 'Elena Petrova', title: t({ en: 'VP Product & Design', ja: 'プロダクト・デザイン担当VP' }), department: 'design', manager: 'ceo', location: 'Lisbon', since: 2018 },
  { id: 'vp-sales', name: 'Marcus Webb', title: t({ en: 'VP Sales & Marketing', ja: '営業・マーケティング担当VP' }), department: 'sales', manager: 'ceo', location: 'London', since: 2019 },
  { id: 'head-people', name: 'Chloé Martin', title: t({ en: 'Head of People', ja: '人事責任者' }), department: 'people', manager: 'ceo', location: 'Paris', since: 2020 },
  { id: 'em-platform', name: 'Priya Raman', title: t({ en: 'Platform Eng. Manager', ja: '基盤開発マネージャー' }), department: 'eng', manager: 'cto', location: 'Berlin', since: 2019 },
  { id: 'em-apps', name: 'Diego Alvarez', title: t({ en: 'Apps Eng. Manager', ja: 'アプリ開発マネージャー' }), department: 'eng', manager: 'cto', location: 'Madrid', since: 2020 },
  { id: 'backend', name: 'Hana Sato', title: t({ en: 'Backend Engineer', ja: 'バックエンドエンジニア' }), department: 'eng', manager: 'em-platform', location: 'Remote', since: 2021 },
  { id: 'sre', name: 'Tomás Rivera', title: t({ en: 'Reliability Engineer', ja: '信頼性エンジニア' }), department: 'eng', manager: 'em-platform', location: 'Madrid', since: 2022 },
  { id: 'mobile', name: 'Grace Mensah', title: t({ en: 'Mobile Engineer', ja: 'モバイルエンジニア' }), department: 'eng', manager: 'em-apps', location: 'Remote', since: 2023 },
  { id: 'designer', name: 'Noah Kim', title: t({ en: 'Product Designer', ja: 'プロダクトデザイナー' }), department: 'design', manager: 'vp-design', location: 'Lisbon', since: 2021 },
  { id: 'research', name: 'Fatima Haddad', title: t({ en: 'UX Researcher', ja: 'UXリサーチャー' }), department: 'design', manager: 'vp-design', location: 'Remote', since: 2022 },
  { id: 'account', name: 'Sofia Rossi', title: t({ en: 'Account Executive', ja: '営業担当' }), department: 'sales', manager: 'vp-sales', location: 'Milan', since: 2021 },
  { id: 'growth', name: 'Ravi Patel', title: t({ en: 'Growth Marketer', ja: 'グロースマーケター' }), department: 'sales', manager: 'vp-sales', location: 'London', since: 2022 },
  { id: 'talent', name: 'Kwame Asante', title: t({ en: 'Talent Partner', ja: '採用担当' }), department: 'people', manager: 'head-people', location: 'Paris', since: 2023 },
]
const byId = new Map(people.map(person => [person.id, person]))
const directReports = new Map<string, Person[]>(people.map(person => [person.id, []]))
for (const person of people) if (person.manager) directReports.get(person.manager)!.push(person)
// Everyone below a person, collected with an explicit stack (graph traversals stay iterative).
function teamOf(id: string) {
  const team: Person[] = []
  const stack = [...directReports.get(id)!]
  while (stack.length) {
    const next = stack.pop()!
    team.push(next)
    stack.push(...directReports.get(next.id)!)
  }
  return team
}
function chainOf(id: string) {
  const chain: Person[] = []
  for (let manager = byId.get(id)?.manager; manager; manager = byId.get(manager)?.manager) chain.push(byId.get(manager)!)
  return chain
}
const initials = (name: string) => name.split(' ').map(part => part[0]).join('').slice(0, 2)
const count = (value: number, one: string, many = one + 's') => `${value} ${value === 1 ? one : many}`
// Japanese counts take a counter word and no plural.
const people_ = (value: number) => t({ en: count(value, 'person', 'people'), ja: `${value} 人` })

// One toggle per department head collapses the team below that head. The graph only ever sees the filtered arrays.
const heads = people.filter(person => person.manager === 'ceo')
const collapsed = ref<ReadonlySet<string>>(new Set())
const hidden = computed(() => new Set([...collapsed.value].flatMap(id => teamOf(id).map(person => person.id))))
const nodes = computed<NetworkNode[]>(() => people
  .filter(person => !hidden.value.has(person.id))
  .map(person => ({ id: person.id, label: person.name, detail: person.title })))
const treeEdges = computed<GraphEdge[]>(() => people
  .filter(person => person.manager && !hidden.value.has(person.id))
  .map(person => ({ id: `${person.manager}-${person.id}`, from: person.manager!, to: person.id })))

// Selecting a card highlights its reporting line up to the CEO through `relatedIds`.
const selectedId = ref<string | undefined>('ceo')
const related = computed(() => selectedId.value ? new Set([selectedId.value, ...chainOf(selectedId.value).map(person => person.id)]) : undefined)
const focusDepartment = computed(() => byId.get(selectedId.value ?? '')?.department ?? 'exec')
// Siblings share the first segment of their connectors, so the highlighted ones are passed last to be painted on top.
// The layout below sorts edges back into tree order, so this never moves a card.
const edges = computed(() => {
  const onLine = (edge: GraphEdge) => Boolean(related.value?.has(edge.from) && related.value.has(edge.to))
  return [...treeEdges.value.filter(edge => !onLine(edge)), ...treeEdges.value.filter(onLine)]
})

// The tree layout places every card at the same size. `sizes` then enlarges the CEO card, which keeps its top-left
// corner, so `positions` moves it left by half the extra width and up by the extra height to stay centred above the heads. A custom
// layout does not tell the router its direction, so the template also passes `options.direction` for the connectors.
const card = { width: 156, height: 152 }
const leadCard = { width: 188, height: 168 }
const treeOrder = new Map(people.map((person, index) => [person.id, index]))
const layoutOrg: GraphLayoutFunction = (shown, links) => layoutTreeGraph(
  shown, [...links].sort((a, b) => treeOrder.get(a.to)! - treeOrder.get(b.to)!),
  { direction: 'TB', nodeWidth: card.width, nodeHeight: card.height, columnGap: 44, rowGap: 16, padding: 28, roots: ['ceo'] },
)
const sizes: ReadonlyMap<string, GraphNodeSize> = new Map([['ceo', leadCard]])
const positions = computed<ReadonlyMap<string, GraphPoint>>(() => {
  const box = layoutOrg(nodes.value, treeEdges.value).boxes.get('ceo')!
  return new Map([['ceo', { x: box.x - (leadCard.width - card.width) / 2, y: box.y - (leadCard.height - card.height) }]])
})

function describe(id: string) {
  const person = byId.get(id)!
  const reports = directReports.get(id)!.length
  const chain = chainOf(id)
  const managers = chain.map(manager => manager.name).join(' → ')
  const line = chain.length ? t({ en: ` · reports to ${managers}`, ja: ` · 報告先 ${managers}` }) : ''
  const team = reports ? t({ en: ` · ${count(reports, 'direct report')}`, ja: ` · 直属の部下 ${reports} 人` }) : ''
  return t({
    en: `${person.name}, ${person.title} (${departments[person.department].label})${line}${team}.`,
    ja: `${person.name}、${person.title}(${departments[person.department].label})${line}${team}。`,
  })
}
const status = ref(describe('ceo'))
function select(id: string) {
  status.value = describe(id)
}
// Escape first cancels a gesture in flight (a drag, a connection or a box selection); only an Escape without one
// clears the selection. The graph reports every gesture as a start and an end, and the wrapper's capture listener
// reads the count before the graph's own Escape handler ends the gesture.
const gesture = { count: 0, cancelling: false }
// A click on the empty canvas or Escape in the chart clears the selection and its reporting line.
function clearSelection() {
  if (selectedId.value === undefined) return
  selectedId.value = undefined
  status.value = t({ en: 'Selection cleared.', ja: '選択を解除しました。' })
}
function toggleTeam(head: Person) {
  const next = new Set(collapsed.value)
  const size = teamOf(head.id).length
  const name = departments[head.department].label
  if (next.delete(head.id)) {
    status.value = t({
      en: `${name} expanded: ${people_(size)} below ${head.name} shown again.`,
      ja: `${name}を展開しました。${head.name} の下の ${people_(size)}を再び表示しています。`,
    })
  }
  else {
    next.add(head.id)
    status.value = t({
      en: `${name} collapsed: ${people_(size)} below ${head.name} hidden.`,
      ja: `${name}を折りたたみました。${head.name} の下の ${people_(size)}を隠しています。`,
    })
    // A selected card that disappears hands the selection to its department head.
    if (selectedId.value && teamOf(head.id).some(person => person.id === selectedId.value)) selectedId.value = head.id
  }
  collapsed.value = next
}
function expandAll() {
  collapsed.value = new Set()
  status.value = t({ en: `All teams expanded: ${people_(people.length)} shown.`, ja: `すべてのチームを展開しました。${people_(people.length)}を表示しています。` })
}
const headcount = (department: DepartmentId) => people.filter(person => person.department === department).length

// Card geometry in node-local coordinates. The avatar overlaps the top edge of the card, and a manager's team badge
// sits on its bottom edge where the connector leaves. Chips hold short fixed words, so a text width estimate sizes them.
const pillWidth = (text: string, size: number) => Math.round(text.length * size * (isJapanese.value ? 1.02 : 0.62) + 18)
const uid = useId()
function cardView(id: string, box: GraphBox) {
  const person = byId.get(id)!
  const lead = id === 'ceo'
  const radius = lead ? 30 : 25
  const avatarY = radius + 4
  const top = avatarY - 2
  const nameY = top + (lead ? 57 : 50)
  const reports = directReports.get(id)!.length
  const folded = collapsed.value.has(id)
  const badge = !reports ? ''
    : folded ? t({ en: `+${teamOf(id).length} hidden`, ja: `+${teamOf(id).length} 人を非表示` })
    : t({ en: count(reports, 'report'), ja: `部下 ${reports} 人` })
  const chip = departments[person.department].chip
  return {
    person, lead, radius, avatarY, top, nameY, folded, badge, chip,
    cx: box.width / 2, bottom: box.height - 12, titleY: nameY + (lead ? 18 : 16), chipY: nameY + (lead ? 39 : 36),
    chipWidth: pillWidth(chip, 10), badgeWidth: pillWidth(badge, 9.5), initials: initials(person.name),
    // IDs include the node ID, so every card's gradient and clip path stays unique on the page.
    fillId: `${uid}-fill-${id}`, clipId: `${uid}-clip-${id}`, faceId: `${uid}-face-${id}`,
  }
}
</script>

<template>
  <section class="showcase sc-org" aria-labelledby="sc-org-title" :class="`sc-org-focus-${focusDepartment}`">
    <div class="sc-org-intro">
      <h2 id="sc-org-title">{{ t({ en: 'Org chart', ja: '組織図' }) }}</h2>
      <p>{{ t({
        en: 'A top-down tree with right-angle connectors, person cards and hover cards drawn in slots, a larger CEO card and team folding done by the app.',
        ja: '直角の接続線でつないだ上から下へのツリーです。人物カードとホバーカードはスロットで描き、CEO のカードを大きくし、チームの折りたたみはアプリ側で行います。',
      }) }}</p>
    </div>
    <div class="sc-org-toolbar" role="group" :aria-label="t({ en: 'Teams', ja: 'チーム' })">
      <button v-for="head in heads" :key="head.id" type="button" class="sc-org-team" :class="`sc-org-dept-${head.department}`"
        :aria-expanded="!collapsed.has(head.id)" @click="toggleTeam(head)">
        <svg class="sc-org-chevron" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 4.5 6 7.5 9 4.5" /></svg>
        <span class="sc-org-swatch" aria-hidden="true"></span>
        {{ departments[head.department].label }} · {{ headcount(head.department) }}
      </button>
      <button type="button" class="sc-org-expand" :disabled="!collapsed.size" @click="expandAll">{{ t({ en: 'Expand all', ja: 'すべて展開' }) }}</button>
    </div>

    <div @keydown.esc.capture="gesture.cancelling = gesture.count > 0" @keydown.esc="gesture.cancelling || clearSelection()">
      <NetworkGraph
        v-model:selected-id="selectedId" unstyled-node-slots :nodes="nodes" :edges="edges" :layout="layoutOrg" :sizes="sizes"
        :positions="positions" :related-ids="related" :options="{ direction: 'TB' }" edge-style="orthogonal"
        height="clamp(440px, 54vw, 700px)"
        :labels="{ ...labels.graph, region: t({ en: 'Organisation chart', ja: '組織図' }) }" @select="select" @background-click="clearSelection" @gesture-start="gesture.count++" @gesture-end="gesture.count--"
      >
        <template #edge="{ path, related }">
          <path class="sc-org-link" :class="{ 'sc-org-link-on': related }" :d="path" />
        </template>
        <template #node="{ node, box, selected }">
          <g v-for="c in [cardView(node.id, box)]" :key="c.person.id" class="sc-org-card"
            :class="[`sc-org-dept-${c.person.department}`, { 'sc-org-lead': c.lead }]">
            <defs>
              <linearGradient :id="c.fillId" x1="0" y1="0" x2="1" y2="1">
                <stop class="sc-org-stop-from" offset="0" />
                <stop class="sc-org-stop-to" offset="1" />
              </linearGradient>
              <clipPath :id="c.clipId">
                <circle :cx="c.cx" :cy="c.avatarY" :r="c.radius" />
              </clipPath>
              <clipPath :id="c.faceId">
                <rect x="1" :y="c.top" :width="box.width - 2" :height="c.bottom - c.top" rx="16" />
              </clipPath>
            </defs>
            <rect v-if="selected" class="sc-org-ring" x="-4" :y="c.top - 4" :width="box.width + 8" :height="c.bottom - c.top + 8" rx="20" />
            <rect class="sc-org-face" x="1" :y="c.top" :width="box.width - 2" :height="c.bottom - c.top" rx="16" />
            <rect class="sc-org-band" x="1" :y="c.top" :width="box.width - 2" :height="c.radius + 6" :clip-path="`url(#${c.faceId})`" />
            <circle class="sc-org-halo" :cx="c.cx" :cy="c.avatarY" :r="c.radius + 3.5" />
            <g :clip-path="`url(#${c.clipId})`">
              <rect class="sc-org-avatar" :x="c.cx - c.radius" :y="c.avatarY - c.radius" :width="c.radius * 2" :height="c.radius * 2"
                :style="{ fill: `url(#${c.fillId})` }" />
              <circle class="sc-org-gloss" :cx="c.cx - c.radius * 0.45" :cy="c.avatarY - c.radius * 0.55" :r="c.radius * 0.85" />
            </g>
            <text class="sc-org-initials" :x="c.cx" :y="c.avatarY" dy="0.35em">{{ c.initials }}</text>
            <text class="sc-org-name" :x="c.cx" :y="c.nameY">{{ c.person.name }}</text>
            <text class="sc-org-title" :x="c.cx" :y="c.titleY">{{ c.person.title }}</text>
            <rect class="sc-org-chip" :x="c.cx - c.chipWidth / 2" :y="c.chipY - 13" :width="c.chipWidth" height="19" rx="9.5" />
            <text class="sc-org-chip-text" :x="c.cx" :y="c.chipY - 3.5" dy="0.35em">{{ c.chip }}</text>
            <g v-if="c.badge" class="sc-org-badge" :class="{ 'sc-org-badge-folded': c.folded }">
              <rect :x="c.cx - c.badgeWidth / 2" :y="c.bottom - 11" :width="c.badgeWidth" height="22" rx="11" />
              <text :x="c.cx" :y="c.bottom" dy="0.35em">{{ c.badge }}</text>
            </g>
          </g>
        </template>
        <template #tooltip="{ target }">
          <div v-if="target.kind === 'node'" class="sc-org-tip">
            <strong>{{ target.node.label }}</strong>
            <span>{{ byId.get(target.node.id)?.title }}</span>
            <dl>
              <dt>{{ t({ en: 'Team', ja: 'チーム' }) }}</dt><dd>{{ departments[byId.get(target.node.id)?.department ?? 'exec'].label }}</dd>
              <dt>{{ t({ en: 'Office', ja: '拠点' }) }}</dt><dd>{{ byId.get(target.node.id)?.location }}</dd>
              <dt>{{ t({ en: 'Joined', ja: '入社' }) }}</dt><dd>{{ byId.get(target.node.id)?.since }}</dd>
            </dl>
          </div>
        </template>
      </NetworkGraph>
    </div>
    <p class="sc-org-status" role="status">{{ status }}</p>
  </section>
</template>

<style>
.sc-org {
  --sc-org-ink: #2b2433;
  --sc-org-muted: #7a6f68;
  --sc-org-line: #d9cbbb;
  --vw-accent: #6a4fd8;
  --vw-text: var(--sc-org-ink);
  --vw-border: #eadfd2;
  --vw-surface: #fffdf9;
  --vw-surface-hover: #f6efe6;
  color: var(--sc-org-ink);
}
.showcase.sc-org { background: #fffaf4; border-color: #efe3d5; border-radius: 18px; padding: 22px; }
.sc-org-intro h2 { font-size: 20px; letter-spacing: -.02em; margin: 0 0 4px; }
.sc-org-intro p { margin: 0; font-size: 13px; color: var(--sc-org-muted); max-width: 72ch; }

/* Department palette: warm, evenly spaced hues. Gradient stops, chips, rings and the toolbar swatches read these. */
.sc-org .sc-org-dept-exec { --sc-from: #3b2f63; --sc-to: #8a5cc4; --sc-pale: #efe8fb; --sc-deep: #4d3a86; }
.sc-org .sc-org-dept-eng { --sc-from: #3f63e0; --sc-to: #7fa4ff; --sc-pale: #e7edff; --sc-deep: #2f4cb8; }
.sc-org .sc-org-dept-design { --sc-from: #d2416f; --sc-to: #f59aa9; --sc-pale: #fde8ee; --sc-deep: #a8284f; }
.sc-org .sc-org-dept-sales { --sc-from: #dd6f2c; --sc-to: #f7bf6a; --sc-pale: #fdefdf; --sc-deep: #a24b14; }
.sc-org .sc-org-dept-people { --sc-from: #138a76; --sc-to: #5fd0b0; --sc-pale: #dff5ee; --sc-deep: #0e6a5b; }
.sc-org.sc-org-focus-exec { --sc-org-focus: #6a4fd8; }
.sc-org.sc-org-focus-eng { --sc-org-focus: #3f63e0; }
.sc-org.sc-org-focus-design { --sc-org-focus: #d2416f; }
.sc-org.sc-org-focus-sales { --sc-org-focus: #dd6f2c; }
.sc-org.sc-org-focus-people { --sc-org-focus: #138a76; }

.sc-org-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin: 16px 0 12px; }
.sc-org .sc-org-team, .sc-org .sc-org-expand {
  display: inline-flex; align-items: center; gap: 7px; padding: 6px 12px 6px 9px; border: 1px solid #eadccb; border-radius: 999px;
  background: #fff; color: var(--sc-org-ink); font-size: 12px; font-weight: 600; box-shadow: 0 1px 2px rgb(80 50 20 / 6%);
  transition: background-color .15s, border-color .15s;
}
.sc-org .sc-org-team:hover, .sc-org .sc-org-expand:not(:disabled):hover { background: #fbf4ea; border-color: #dfcdb7; }
.sc-org .sc-org-team:focus-visible, .sc-org .sc-org-expand:focus-visible { outline: 2px solid var(--vw-accent); outline-offset: 2px; }
.sc-org .sc-org-team[aria-expanded="false"] { background: var(--sc-pale); border-color: transparent; color: var(--sc-deep); }
.sc-org .sc-org-expand { padding-inline: 12px; color: var(--sc-org-muted); background: transparent; box-shadow: none; }
.sc-org .sc-org-expand:disabled { opacity: .45; cursor: default; }
.sc-org-chevron { width: 12px; height: 12px; fill: none; stroke: currentColor; stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; transition: transform .15s; }
.sc-org-team[aria-expanded="false"] .sc-org-chevron { transform: rotate(-90deg); }
.sc-org-swatch { width: 10px; height: 10px; border-radius: 50%; background: linear-gradient(135deg, var(--sc-from), var(--sc-to)); }

/* The stage: a soft warm canvas instead of the dotted grid, with floating zoom controls. */
.sc-org .vw-network {
  border: 1px solid #efe2d3; border-radius: 16px; overflow: hidden;
  background: radial-gradient(120% 80% at 50% 0%, #fffdf9 0%, #fbf5ec 55%, #f5ece0 100%);
}
.sc-org .vw-zoom-tools { bottom: 12px; right: 12px; border: 0; border-radius: 999px; box-shadow: 0 4px 14px rgb(80 50 20 / 12%); }
.sc-org .vw-zoom-tools button, .sc-org .vw-zoom-tools output { color: var(--sc-org-ink); }
.sc-org .vw-zoom-tools .vw-fit-button { border-left-color: #f0e6da; padding-inline: 11px; }
.sc-org .vw-network-node:focus-visible { outline: none; }
.sc-org .vw-network-node:focus-visible .sc-org-face { stroke: var(--vw-accent); stroke-width: 2.5px; stroke-dasharray: 5 3; }

.sc-org .sc-org-link { fill: none; stroke: var(--sc-org-line); stroke-width: 1.6px; stroke-linejoin: round; }
.sc-org .sc-org-link.sc-org-link-on { stroke: var(--sc-org-focus); stroke-width: 2.4px; }

/* Card. Every rule starts with the root class and names the slot's own classes, so the library's node fills do not apply. */
.sc-org .vw-network-node .sc-org-card { transition: transform .18s ease; }
.sc-org .vw-network-node:hover .sc-org-card { transform: translateY(-2px); }
.sc-org .vw-network-node rect.sc-org-face {
  fill: #fff; stroke: #efe4d7; stroke-width: 1px;
  filter: drop-shadow(0 6px 14px rgb(92 60 30 / 10%)) drop-shadow(0 1px 2px rgb(92 60 30 / 8%));
}
.sc-org .vw-network-node:hover rect.sc-org-face { stroke: #e2d3c2; filter: drop-shadow(0 10px 20px rgb(92 60 30 / 15%)) drop-shadow(0 1px 2px rgb(92 60 30 / 8%)); }
.sc-org .vw-network-node.vw-is-related rect.sc-org-face { stroke: color-mix(in srgb, var(--sc-org-focus) 35%, #efe4d7); }
.sc-org .vw-network-node rect.sc-org-ring { fill: none; stroke: var(--sc-deep); stroke-width: 2.5px; filter: drop-shadow(0 0 6px color-mix(in srgb, var(--sc-from) 45%, transparent)); }
.sc-org .vw-network-node .sc-org-lead rect.sc-org-face { stroke: #e6d6f7; }
.sc-org .vw-network-node rect.sc-org-band { fill: var(--sc-pale); stroke: none; opacity: .75; }
/* The avatar fill is an inline style: the library's `.vw-network-node rect` rule would override a fill attribute. */
.sc-org .vw-network-node rect.sc-org-avatar { stroke: none; }
.sc-org .sc-org-halo { fill: #fff; filter: drop-shadow(0 2px 4px rgb(92 60 30 / 12%)); }
.sc-org .sc-org-stop-from { stop-color: var(--sc-from); }
.sc-org .sc-org-stop-to { stop-color: var(--sc-to); }
.sc-org .sc-org-gloss { fill: #fff; opacity: .16; }
.sc-org .vw-network-node text { fill: var(--sc-org-ink); text-anchor: middle; }
.sc-org .vw-network-node text.sc-org-initials { fill: #fff; font-size: 15px; font-weight: 700; letter-spacing: .04em; }
.sc-org .vw-network-node .sc-org-lead text.sc-org-initials { font-size: 18px; }
.sc-org .vw-network-node text.sc-org-name { font-size: 13.5px; font-weight: 700; letter-spacing: -.01em; }
.sc-org .vw-network-node .sc-org-lead text.sc-org-name { font-size: 15.5px; }
.sc-org .vw-network-node text.sc-org-title { fill: var(--sc-org-muted); font-size: 11px; font-weight: 500; }
.sc-org .vw-network-node .sc-org-lead text.sc-org-title { font-size: 12px; }
.sc-org .vw-network-node rect.sc-org-chip { fill: var(--sc-pale); stroke: none; }
.sc-org .vw-network-node text.sc-org-chip-text { fill: var(--sc-deep); font-size: 10px; font-weight: 650; letter-spacing: .02em; }
.sc-org .vw-network-node .sc-org-badge rect { fill: #fff; stroke: #e7d9c8; stroke-width: 1px; }
.sc-org .vw-network-node .sc-org-badge text { fill: var(--sc-org-muted); font-size: 9.5px; font-weight: 650; }
.sc-org .vw-network-node .sc-org-badge-folded rect { fill: var(--sc-deep); stroke: none; }
.sc-org .vw-network-node .sc-org-badge-folded text { fill: #fff; }

.sc-org .vw-network-tooltip { border: 0; border-radius: 12px; padding: 10px 12px; background: #2b2433; color: #fbf6ef; box-shadow: 0 10px 28px rgb(40 25 10 / 25%); }
.sc-org-tip { display: grid; gap: 2px; min-width: 170px; }
.sc-org-tip > span { color: #d8cdc2; font-size: 11px; }
.sc-org-tip dl { display: grid; grid-template-columns: auto 1fr; gap: 2px 10px; margin: 8px 0 0; font-size: 11px; }
.sc-org-tip dt { color: #b5a89b; }
.sc-org-tip dd { margin: 0; }
.sc-org-status { margin: 12px 2px 0; min-height: 18px; font-size: 12.5px; color: var(--sc-org-muted); }

@media (max-width: 650px) {
  .showcase.sc-org { padding: 14px 12px; border-radius: 14px; }
  .sc-org-toolbar { gap: 6px; }
  .sc-org .sc-org-team { padding: 5px 10px 5px 8px; font-size: 11px; }
}
</style>
