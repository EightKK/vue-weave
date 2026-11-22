// The single list of the site's examples and showcases. Each entry becomes a page at /examples/<id>/ or /showcase/<id>/
// (and the same under /ja/), a card in the index and a thumbnail. This file is plain data: the dynamic routes load it in
// Node.js, so it must not import Vue components or browser code. The demo component is named by its path and loaded by
// the theme (see ../.vitepress/theme/demos.ts).

/** Text in each language of the site. English is the default; Japanese is shown under /ja/. */
export interface Localized {
  en: string
  ja: string
}

export type ExampleCategory =
  | 'graph'
  | 'timeline'
  | 'scheduling'
  | 'tree-grid'
  | 'calendar-board'
  | 'diagram'
  | 'linked-data'
  | 'interchange'

/** The example categories in sidebar order. Showcases are listed separately. */
export const categories: readonly { id: ExampleCategory; title: Localized }[] = [
  { id: 'graph', title: { en: 'Graph', ja: 'グラフ' } },
  { id: 'timeline', title: { en: 'Timeline & Gantt', ja: 'タイムラインとガント' } },
  { id: 'scheduling', title: { en: 'Scheduling & resources', ja: 'スケジューリングとリソース' } },
  { id: 'tree-grid', title: { en: 'Tree grid & tables', ja: 'ツリーグリッドと表' } },
  { id: 'calendar-board', title: { en: 'Calendar & board', ja: 'カレンダーとボード' } },
  { id: 'diagram', title: { en: 'Diagram editing', ja: 'ダイアグラム編集' } },
  { id: 'linked-data', title: { en: 'Linked views & data', ja: '連動ビューとデータ' } },
  { id: 'interchange', title: { en: 'Import & export', ja: 'インポートとエクスポート' } },
]

/** A link to the API reference: a heading of one of the hand-written docs/*.md files. */
export interface ApiLink {
  /** The text of the link, usually the export, component or guide name. Not translated. */
  text: string
  /** The docs file and heading anchor, such as `api.md#treegrid`. The theme turns it into a URL (see apiHref). */
  doc: string
}

export interface ExampleEntry {
  /** The URL segment and the thumbnail name: lowercase letters, digits and hyphens. */
  id: string
  /** `example` pages are listed in the examples index by category; `showcase` pages in the showcase index. */
  kind: 'example' | 'showcase'
  category: ExampleCategory
  title: Localized
  description: Localized
  /** The demo component, relative to the repository root, such as `examples/TreeGridDemo.vue`. */
  component: string
  /** The source files shown in the code tabs, relative to the repository root. The component usually comes first. */
  sources: string[]
  /** Related API reference entries. */
  api: ApiLink[]
  /** The ID of the same demo in the legacy example gallery (gallery.html), while that gallery still exists. */
  legacyId?: string
}

export const examples: readonly ExampleEntry[] = [
  {
    id: 'tree-grid',
    kind: 'example',
    category: 'tree-grid',
    title: { en: 'Tree grid', ja: 'ツリーグリッド' },
    description: {
      en: 'A product hierarchy of about 3,000 rows against 30 columns, rendered in a window, with cell and spreadsheet editing, row structure editing, a lazily loaded group and selection linked to a graph.',
      ja: '約3,000行の製品階層を30列の属性・在庫と並べ、表示範囲だけを描画します。セル編集とスプレッドシート編集、行構造の編集、遅延読み込みのグループ、グラフと連動する選択を備えています。',
    },
    component: 'examples/TreeGridDemo.vue',
    sources: ['examples/TreeGridDemo.vue'],
    api: [
      { text: 'TreeGrid', doc: 'api.md#treegrid' },
      { text: 'Tree grid editing', doc: 'api.md#tree-grid-editing' },
      { text: 'Tree grid row structure', doc: 'api.md#tree-grid-row-structure' },
      { text: 'Tree grids, matrices and bills of materials', doc: 'integration.md#tree-grids-matrices-and-bills-of-materials' },
    ],
    legacyId: 'tree-grid',
  },
  {
    id: 'scheduling',
    kind: 'example',
    category: 'scheduling',
    title: { en: 'Calendar-aware scheduling', ja: 'カレンダーを考慮したスケジューリング' },
    description: {
      en: 'Tasks scheduled on a work calendar with split shifts and a plant closure: dependencies with lags, constraints, critical path, float, a status date, diagnostics and resource demand against capacity.',
      ja: '交替勤務と工場休業日のある稼働カレンダーでタスクを日程計算します。ラグ付き依存関係、制約、クリティカルパス、余裕、状況日付、診断、能力に対するリソース需要を表示します。',
    },
    component: 'examples/SchedulingDemo.vue',
    sources: ['examples/SchedulingDemo.vue', 'examples/SummaryLinksDemo.vue', 'examples/ActualsDemo.vue'],
    api: [
      { text: 'scheduleTasks', doc: 'scheduling.md' },
      { text: 'Calendars, scheduling and resource load', doc: 'api.md#calendars-scheduling-and-resource-load' },
      { text: 'Calendar shading, critical path, float and segments', doc: 'api.md#calendar-shading-critical-path-float-and-segments' },
      { text: 'Planning diagnostics and schedule traces', doc: 'api.md#planning-diagnostics-and-schedule-traces' },
    ],
    legacyId: 'scheduling',
  },
  {
    id: 'linked-views',
    kind: 'example',
    category: 'linked-data',
    title: { en: 'Linked views', ja: '連動ビュー' },
    description: {
      en: 'One schedule as a network graph, a Gantt chart and resource load rows. Select in any view and the others highlight the same tasks; go to the counterpart, also inside collapsed groups.',
      ja: '1つのスケジュールをネットワークグラフ、ガントチャート、リソース負荷行で表示します。どのビューで選択しても他のビューが同じタスクを強調表示し、折りたたまれたグループの中でも対応先へ移動できます。',
    },
    component: 'examples/LinkedPlanningDemo.vue',
    sources: ['examples/LinkedPlanningDemo.vue'],
    api: [
      { text: 'useLinkedSelection', doc: 'api.md#linked-views' },
      { text: 'Linking views', doc: 'integration.md#linking-views' },
      { text: 'Linked views, reveal and external drops', doc: 'api.md#linked-views-reveal-and-external-drops' },
    ],
    legacyId: 'linked',
  },
  {
    id: 'bom',
    kind: 'showcase',
    category: 'tree-grid',
    title: { en: 'BOM editor', ja: 'BOMエディター' },
    description: {
      en: 'A multi-level bill of materials with shared subassemblies, edited in a tree grid and linked to an item graph, with where-used walks, a revision comparison and a quantity rollup.',
      ja: '共通サブアセンブリを含む多階層の部品表をツリーグリッドで編集し、品目グラフと連動させます。使用先の探索、改訂比較、数量の積み上げを備えています。',
    },
    component: 'examples/showcase/BomShowcase.vue',
    sources: ['examples/showcase/BomShowcase.vue', 'examples/showcase/bomData.ts'],
    api: [
      { text: 'TreeGrid', doc: 'api.md#treegrid' },
      { text: 'traverseGraph', doc: 'api.md#traversal-filters-limits-and-paths' },
      { text: 'diffStructure', doc: 'api.md#structure-comparison' },
    ],
    legacyId: 'bom',
  },
  {
    id: 'construction',
    kind: 'showcase',
    category: 'scheduling',
    title: { en: 'Construction program', ja: '建設工程表' },
    description: {
      en: 'The master schedule of an office tower with critical path, baselines, crew leveling, earned value and a what-if delay, every date calculated by the core scheduler.',
      ja: 'オフィスビルの全体工程表です。クリティカルパス、ベースライン、作業班の平準化、アーンドバリュー、遅延の試算を表示し、すべての日付をコアのスケジューラーで計算します。',
    },
    component: 'examples/showcase/ConstructionShowcase.vue',
    sources: ['examples/showcase/ConstructionShowcase.vue', 'examples/showcase/constructionData.ts'],
    api: [
      { text: 'scheduleTasks', doc: 'scheduling.md' },
      { text: 'levelResources', doc: 'api.md#calendars-scheduling-and-resource-load' },
      { text: 'computeEarnedValue', doc: 'api.md#earned-value-management' },
    ],
    legacyId: 'construction',
  },
]

/** The thumbnail of an entry, relative to the site base. Generated by scripts/site-thumbnails.mjs. */
export const thumbnailPath = (entry: Pick<ExampleEntry, 'id'>) => `/thumbnails/${entry.id}.png`

export const exampleById = (id: string) => examples.find(entry => entry.id === id)

export const examplesOfKind = (kind: ExampleEntry['kind']) => examples.filter(entry => entry.kind === kind)
