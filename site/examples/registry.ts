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
  /** Showcases: one line for the card in the showcase index. The card shows the description when it is missing. */
  summary?: Localized
  /** Showcases: the components and main APIs the demo uses, shown as small tags on its card. Not translated. */
  tags?: string[]
  /** Showcases: listed in the featured row at the top of the showcase index. */
  featured?: boolean
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
    summary: {
      en: 'A multi-level bill of materials in a tree grid, linked to an item graph.',
      ja: '多階層の部品表をツリーグリッドで編集し、品目グラフと連動させます。',
    },
    tags: ['TreeGrid', 'NetworkGraph', 'traverseGraph', 'diffStructure'],
    featured: true,
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
    summary: {
      en: 'Critical path, baselines, crew leveling and earned value for an office tower.',
      ja: 'オフィスビル工事のクリティカルパス、ベースライン、平準化、アーンドバリュー。',
    },
    tags: ['GanttChart', 'scheduleTasks', 'levelResources', 'computeEarnedValue'],
    featured: true,
  },
  {
    id: 'service-map',
    kind: 'showcase',
    category: 'graph',
    title: { en: 'Service map', ja: 'サービスマップ' },
    description: {
      en: 'A simulated production topology in the style of an APM tool: services in nested region and namespace groups that collapse, traffic bands whose width follows requests per second, the blast radius of an incident from traverseGraph and an incident timeline in a linked GanttChart.',
      ja: 'APMツール風に本番環境の構成を模擬したマップです。リージョンと名前空間の入れ子グループは折りたためます。トラフィックは毎秒リクエスト数に応じた太さの帯で描き、traverseGraph で障害の影響範囲を求め、連動する GanttChart にインシデントのタイムラインを表示します。',
    },
    summary: {
      en: 'Nested groups, live traffic bands, an incident blast radius and a linked timeline.',
      ja: '入れ子グループ、ライブのトラフィック、障害の影響範囲、連動するタイムライン。',
    },
    tags: ['NetworkGraph', 'GanttChart', 'groups', 'traverseGraph'],
    featured: true,
    component: 'examples/showcase/ServiceMapShowcase.vue',
    sources: ['examples/showcase/ServiceMapShowcase.vue'],
    api: [
      { text: 'Nested groups', doc: 'api.md#large-graphs-touch-gestures-nested-groups-and-search' },
      { text: 'Group collapse', doc: 'api.md#group-collapse-edge-styles-and-waypoints-level-of-detail-and-node-resizing' },
      { text: 'traverseGraph', doc: 'api.md#traversal-filters-limits-and-paths' },
      { text: 'Linked views', doc: 'api.md#linked-views' },
    ],
    legacyId: 'service-map',
  },
  {
    id: 'production',
    kind: 'showcase',
    category: 'scheduling',
    title: { en: 'Production planning', ja: '生産計画' },
    description: {
      en: 'Compare plans around a machine outage and see how a moved operation shifts later work, the shipping time and the resource load; follow a lot through the process graph in units or cost; edit an approval workflow; and plan a project in a schedule sheet. In English and Japanese.',
      ja: '設備の保守停止をはさんで計画案を比べ、作業を動かしたときの後工程、出荷時刻、設備負荷への影響を確かめられます。ロットの流れを個数と原価で工程図に表示し、承認フローの編集と日程表シートでの計画も試せます。日本語と英語に対応しています。',
    },
    summary: {
      en: 'Plan comparison, lot flow, an approval workflow and a schedule sheet in one app.',
      ja: '計画比較、ロットの流れ、承認フロー、日程表シートを1つのアプリにまとめました。',
    },
    tags: ['GanttChart', 'NetworkGraph', 'scheduleTasks', 'useEditHistory'],
    component: 'examples/production/ProductionShowcase.vue',
    sources: [
      'examples/production/ProductionShowcase.vue',
      'examples/production/ProductionPlan.vue',
      'examples/production/plan.ts',
      'examples/production/LotFlow.vue',
      'examples/production/ApprovalFlow.vue',
      'examples/production/WorkSheet.vue',
    ],
    api: [
      { text: 'GanttChart', doc: 'api.md#ganttchart' },
      { text: 'Resource load histogram', doc: 'api.md#resource-load-histogram' },
      { text: 'Quantity bands', doc: 'api.md#quantity-bands' },
      { text: 'Spreadsheet editing', doc: 'api.md#spreadsheet-editing' },
      { text: 'useEditHistory', doc: 'api.md#application-undo-and-redo' },
    ],
  },
  {
    id: 'pipeline',
    kind: 'showcase',
    category: 'linked-data',
    title: { en: 'CI/CD pipeline', ja: 'CI/CDパイプライン' },
    description: {
      en: 'A live run monitor in which a job graph and a timeline share one simulated clock and one linked selection. Running paths animate and bars grow as jobs run; inject a failure, retry it and approve the production deployment.',
      ja: 'ジョブのグラフとタイムラインが1つの模擬クロックと選択を共有する、実行状況のモニターです。実行中の経路はアニメーションし、ジョブの進行に合わせてバーが伸びます。障害を起こして再実行し、本番デプロイを承認できます。',
    },
    summary: {
      en: 'A job graph and a timeline on one simulated clock, with failures and retries.',
      ja: '模擬クロックで動くジョブのグラフとタイムライン。障害と再実行も試せます。',
    },
    tags: ['NetworkGraph', 'GanttChart', 'useLinkedSelection', 'topologicalOrder'],
    component: 'examples/showcase/PipelineShowcase.vue',
    sources: ['examples/showcase/PipelineShowcase.vue'],
    api: [
      { text: 'useLinkedSelection', doc: 'api.md#linked-views' },
      { text: 'Linking views', doc: 'integration.md#linking-views' },
      { text: 'Animated edges', doc: 'api.md#node-shapes-edge-markers-animated-and-parallel-edges' },
      { text: 'topologicalOrder', doc: 'api.md#graph-algorithms' },
    ],
    legacyId: 'pipeline',
  },
  {
    id: 'knowledge',
    kind: 'showcase',
    category: 'graph',
    title: { en: 'Knowledge graph', ja: 'ナレッジグラフ' },
    description: {
      en: 'An explorable map of about 160 computer-science topics, each linked to the topics it builds on. A force-directed layout places them, PageRank sizes them and Louvain communities colour them; search, neighbourhood focus and shortest paths drive the dimming and highlighting.',
      ja: '約160のコンピューターサイエンスの話題を、その土台となる話題と結んだマップです。力学モデルのレイアウトで配置し、PageRank で大きさを、Louvain 法のコミュニティで色を決めます。検索、近傍へのフォーカス、最短経路で減光と強調表示を切り替えます。',
    },
    summary: {
      en: 'Force layout, PageRank, communities and shortest paths over 160 topics.',
      ja: '160の話題に力学レイアウト、PageRank、コミュニティ、最短経路を適用します。',
    },
    tags: ['NetworkGraph', 'layoutForceGraph', 'graphPageRank', 'detectGraphCommunities'],
    component: 'examples/showcase/KnowledgeGraphShowcase.vue',
    sources: ['examples/showcase/KnowledgeGraphShowcase.vue'],
    api: [
      { text: 'layoutForceGraph', doc: 'api.md#layout-directions-crossing-reduction-and-extra-layouts' },
      { text: 'graphPageRank, detectGraphCommunities', doc: 'api.md#graph-analysis' },
      { text: 'shortestGraphPath, searchGraphNodes', doc: 'api.md#graph-algorithms' },
      { text: 'Dimming and highlights', doc: 'api.md#large-graphs-touch-gestures-nested-groups-and-search' },
    ],
    legacyId: 'knowledge',
  },
  {
    id: 'workflow',
    kind: 'showcase',
    category: 'diagram',
    title: { en: 'Workflow builder', ja: 'ワークフロービルダー' },
    description: {
      en: 'A node-based automation editor: step cards with an icon tile, named input and output ports with two branches on the condition, an animated path for the run in progress, cards that snap to a dot grid and connections that are checked before they are applied.',
      ja: 'ノードベースの自動化エディターです。アイコン付きのステップカード、名前付きの入出力ポート(条件ステップは2つの分岐)、実行中の経路のアニメーションを表示します。カードはドットグリッドにスナップし、接続は適用前に検証されます。',
    },
    summary: {
      en: 'Step cards, named ports and checked connections in an automation editor.',
      ja: 'ステップカード、名前付きポート、検証付きの接続を備えた自動化エディター。',
    },
    tags: ['NetworkGraph', 'ports', 'validateConnection', 'snapGrid'],
    component: 'examples/showcase/WorkflowShowcase.vue',
    sources: ['examples/showcase/WorkflowShowcase.vue'],
    api: [
      { text: 'Named ports and reconnection', doc: 'api.md#named-ports-reconnection-and-group-actions' },
      { text: 'Graph editing', doc: 'api.md#graph-editing-and-minimap' },
      { text: 'Snap to grid', doc: 'api.md#snap-to-grid-alignment-guides-auto-pan-drops-and-clipboard' },
      { text: 'Item slots', doc: 'api.md#label-editing-lasso-selection-and-item-slots' },
    ],
    legacyId: 'workflow',
  },
  {
    id: 'schema',
    kind: 'showcase',
    category: 'diagram',
    title: { en: 'Database schema', ja: 'データベーススキーマ' },
    description: {
      en: "An entity-relationship diagram on a dark canvas: a table card per node with a port for every column, crow's-foot relationships from column to column that switch sides as tables move, and a selected table that traces what it references and what refers to it.",
      ja: 'ダークなキャンバスに描いたER図です。テーブルごとのカードは列ごとにポートを持ち、列どうしを鳥の足記法の関係線で結びます。テーブルを動かすと関係線が向きを変え、選んだテーブルの参照先と参照元を強調表示します。',
    },
    summary: {
      en: "Table cards with a port per column and crow's-foot relationships.",
      ja: '列ごとのポートと鳥の足記法の関係線を持つテーブルカード。',
    },
    tags: ['NetworkGraph', 'ports', 'highlightedEdgeIds', 'dimmedIds'],
    component: 'examples/showcase/SchemaShowcase.vue',
    sources: ['examples/showcase/SchemaShowcase.vue'],
    api: [
      { text: 'Named ports', doc: 'api.md#named-ports-reconnection-and-group-actions' },
      { text: 'Item slots', doc: 'api.md#label-editing-lasso-selection-and-item-slots' },
      { text: 'Tooltips', doc: 'api.md#edge-selection-deletion-context-menu-tooltips-and-fit-to-selection' },
    ],
    legacyId: 'schema',
  },
  {
    id: 'org',
    kind: 'showcase',
    category: 'graph',
    title: { en: 'Org chart', ja: '組織図' },
    description: {
      en: 'A top-down reporting tree laid out by layoutTreeGraph, with right-angle connectors, person cards and hover cards drawn in slots and a larger card for the CEO. Select a person to trace the reporting line, and fold a department away.',
      ja: 'layoutTreeGraph で上から下へ配置した報告系統のツリーです。直角の接続線と、スロットで描く人物カードとホバーカードを使い、CEO は大きなカードで表示します。人を選ぶと報告ラインをたどり、部門ごとに折りたためます。',
    },
    summary: {
      en: 'A reporting tree with person cards, traced reporting lines and folding teams.',
      ja: '人物カード、報告ラインの追跡、チームの折りたたみを備えた組織ツリー。',
    },
    tags: ['NetworkGraph', 'layoutTreeGraph', 'relatedIds'],
    component: 'examples/showcase/OrgChartShowcase.vue',
    sources: ['examples/showcase/OrgChartShowcase.vue'],
    api: [
      { text: 'layoutTreeGraph', doc: 'api.md#layout-directions-crossing-reduction-and-extra-layouts' },
      { text: 'Item slots', doc: 'api.md#label-editing-lasso-selection-and-item-slots' },
      { text: 'Tooltips', doc: 'api.md#edge-selection-deletion-context-menu-tooltips-and-fit-to-selection' },
    ],
    legacyId: 'org',
  },
  {
    id: 'roadmap',
    kind: 'showcase',
    category: 'timeline',
    title: { en: 'Product roadmap', ja: 'プロダクトロードマップ' },
    description: {
      en: 'Initiatives with their projects as child rows: pastel status pills with sticky labels, milestone diamonds, quarter and month bands and a Today marker, all from slots and variables. Projects move through controlled edits; shipped work stays fixed.',
      ja: '施策とその配下のプロジェクトを親子の行で表示します。ラベルが追従するパステル調のステータス、マイルストーンのひし形、四半期と月の帯、今日のマーカーをスロットと変数で描きます。プロジェクトは制御された編集で動かせ、リリース済みの作業は固定されます。',
    },
    summary: {
      en: 'Initiatives, status pills and milestones on a calm quarterly roadmap.',
      ja: '施策、ステータス、マイルストーンを並べた四半期ロードマップ。',
    },
    tags: ['GanttChart', 'calendarBands', 'collapsedIds', 'markers'],
    component: 'examples/showcase/RoadmapShowcase.vue',
    sources: ['examples/showcase/RoadmapShowcase.vue'],
    api: [
      { text: 'GanttChart', doc: 'api.md#ganttchart' },
      { text: 'Editing contract', doc: 'api.md#editing-contract' },
      { text: 'calendarBands', doc: 'api.md#calendar-zoom-presets-and-locale-aware-labels' },
    ],
    legacyId: 'roadmap',
  },
  {
    id: 'sprint',
    kind: 'showcase',
    category: 'timeline',
    title: { en: 'Sprint plan', ja: 'スプリント計画' },
    description: {
      en: 'A classic task Gantt for a four-week sprint: a task list with Start, Days and % columns, weekday headers, shaded weekends, epics rolled up as summary rows, finish-to-start arrows and draggable progress. A move that starts before a predecessor ends is rejected.',
      ja: '4週間のスプリントを表す定番のガントチャートです。開始日・日数・進捗率の列を持つタスク一覧、曜日の見出し、週末の網掛け、サマリー行に集約したエピック、終了-開始の矢印、ドラッグできる進捗を表示します。先行タスクの終了前に始まる移動は拒否されます。',
    },
    summary: {
      en: 'Task columns, epic rollups, dependency arrows and draggable progress.',
      ja: 'タスクの列、エピックの集約、依存関係の矢印、ドラッグできる進捗。',
    },
    tags: ['GanttChart', 'columns', 'dependencies', 'validateEdit'],
    component: 'examples/showcase/SprintGanttShowcase.vue',
    sources: ['examples/showcase/SprintGanttShowcase.vue'],
    api: [
      { text: 'Timeline columns and rollups', doc: 'api.md#timeline-columns-and-rollups' },
      { text: 'Progress editing', doc: 'api.md#progress-editing-deletion-tooltips-context-menu-and-fit' },
      { text: 'Editing contract', doc: 'api.md#editing-contract' },
    ],
    legacyId: 'sprint',
  },
  {
    id: 'booking',
    kind: 'showcase',
    category: 'timeline',
    title: { en: 'Room bookings', ja: '客室予約' },
    description: {
      en: 'A dark resource calendar of rooms grouped by floor: noon-to-noon stays as status pills, weekday ticks, weekend shading and a Today marker. Drag a stay to other dates or another room; a move onto another guest is refused.',
      ja: 'フロアごとに客室をまとめたダークなリソースカレンダーです。正午から正午までの宿泊をステータス付きのバーで表し、曜日の目盛り、週末の網掛け、今日のマーカーを表示します。宿泊は別の日付や客室へドラッグでき、ほかの予約と重なる移動は拒否されます。',
    },
    summary: {
      en: 'Stays moved between rooms and dates, with overlapping moves refused.',
      ja: '宿泊を客室と日付の間で動かし、重なる移動は拒否する予約表。',
    },
    tags: ['GanttChart', 'validateEdit', 'editBounds', 'nonWorkingPeriods'],
    component: 'examples/showcase/BookingShowcase.vue',
    sources: ['examples/showcase/BookingShowcase.vue'],
    api: [
      { text: 'Editing contract', doc: 'api.md#editing-contract' },
      { text: 'Calendar shading', doc: 'api.md#calendar-shading-critical-path-float-and-segments' },
      { text: 'Timeline editing helpers', doc: 'api.md#timeline-editing-helpers' },
    ],
    legacyId: 'booking',
  },
  {
    id: 'calendar',
    kind: 'showcase',
    category: 'timeline',
    title: { en: 'Calendar views', ja: 'カレンダー表示' },
    description: {
      en: 'Day, week, month and quarter levels from calendarZoomPresets in the Europe/Berlin time zone, labelled in the chosen language, with marker ranges for a company-wide code freeze and for holidays that close one office only.',
      ja: 'calendarZoomPresets による日・週・月・四半期の表示レベルを Europe/Berlin タイムゾーンで切り替え、選んだ言語で表示します。全社のコードフリーズと、一部の拠点だけが休みになる祝日を markerRanges で強調表示します。',
    },
    summary: {
      en: 'Calendar zoom presets in a time zone and locale, with highlighted ranges.',
      ja: 'タイムゾーンと言語に合わせたズームプリセットと、強調表示する期間。',
    },
    tags: ['GanttChart', 'calendarZoomPresets', 'markerRanges', 'intlTimeFormatter'],
    component: 'examples/showcase/CalendarShowcase.vue',
    sources: ['examples/showcase/CalendarShowcase.vue'],
    api: [
      { text: 'calendarZoomPresets', doc: 'api.md#calendar-zoom-presets-and-locale-aware-labels' },
      { text: 'markerRanges', doc: 'api.md#marker-ranges' },
    ],
    legacyId: 'calendar',
  },
]

/** The thumbnail of an entry, relative to the site base. Generated by scripts/site-thumbnails.mjs. */
export const thumbnailPath = (entry: Pick<ExampleEntry, 'id'>) => `/thumbnails/${entry.id}.png`

export const exampleById = (id: string) => examples.find(entry => entry.id === id)

export const examplesOfKind = (kind: ExampleEntry['kind']) => examples.filter(entry => entry.kind === kind)
