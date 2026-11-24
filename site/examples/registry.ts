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
  /**
   * The ID of the same demo in the retired example gallery. gallery.html forwards `?demo=<legacyId>` and `#<legacyId>`
   * to this entry's page, so old links keep working.
   */
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
    id: 'graph-and-gantt',
    kind: 'example',
    category: 'graph',
    title: { en: 'Graph and Gantt basics', ja: 'グラフとガントの基本' },
    description: {
      en: 'A network graph and a Gantt chart that share one selection, on four data sets from a small plant to thousands of nodes: layouts, graph editing with undo, controlled bar edits, planning overlays and SVG and PNG export.',
      ja: 'ネットワークグラフとガントチャートが選択を共有します。小さな工場から数千ノードまで4つのデータセットを切り替えられ、レイアウトの切り替え、元に戻せるグラフ編集、制御されたバー編集、計画オーバーレイ、SVG・PNG出力を試せます。',
    },
    component: 'examples/GraphGanttDemo.vue',
    sources: ['examples/GraphGanttDemo.vue', 'examples/components/GraphGanttView.vue', 'examples/data.ts', 'examples/PortRulesDemo.vue'],
    api: [
      { text: 'NetworkGraph', doc: 'api.md#networkgraph' },
      { text: 'GanttChart', doc: 'api.md#ganttchart' },
      { text: 'Graph editing and minimap', doc: 'api.md#graph-editing-and-minimap' },
      { text: 'Snap to grid, alignment guides and clipboard', doc: 'api.md#snap-to-grid-alignment-guides-auto-pan-drops-and-clipboard' },
      { text: 'Timeline planning overlays', doc: 'api.md#timeline-planning-overlays' },
      { text: 'useEditHistory', doc: 'api.md#application-undo-and-redo' },
      { text: 'Export to SVG and PNG', doc: 'api.md#export-to-svg-and-png' },
    ],
    legacyId: 'manufacturing',
  },
  {
    id: 'large-graph',
    kind: 'example',
    category: 'graph',
    title: { en: 'Large graph', ja: '大規模グラフ' },
    description: {
      en: 'A layered graph of 3,750 nodes and about 7,400 edges that draws only the nodes in view, with a minimap, search and an SVG export of the whole graph.',
      ja: '3,750ノード・約7,400エッジの階層グラフで、表示範囲内のノードだけを描画します。ミニマップ、ノード検索、グラフ全体のSVG出力を備えています。',
    },
    component: 'examples/LargeGraphDemo.vue',
    sources: ['examples/LargeGraphDemo.vue', 'examples/components/GraphGanttView.vue', 'examples/data.ts'],
    api: [
      { text: 'Large graphs, touch gestures and search', doc: 'api.md#large-graphs-touch-gestures-nested-groups-and-search' },
      { text: 'Large graphs, touch and search', doc: 'integration.md#large-graphs-touch-and-search' },
      { text: 'Viewport helpers', doc: 'api.md#viewport-helpers' },
    ],
    legacyId: 'large',
  },
  {
    id: 'async-layout',
    kind: 'example',
    category: 'graph',
    title: { en: 'Asynchronous layout', ja: '非同期レイアウト' },
    description: {
      en: 'The built-in layout run asynchronously, in the page or in a Web Worker, with controls that delay, reorder or fail its answers: the graph shows only the newest complete frame and never mixes an old layout with new data.',
      ja: '組み込みレイアウトをページ内または Web Worker で非同期に実行します。応答を遅らせる・順序を入れ替える・失敗させる操作を試せ、グラフは最新の完全なフレームだけを表示し、古いレイアウトと新しいデータを混ぜません。',
    },
    component: 'examples/AsyncGraphDemo.vue',
    sources: ['examples/AsyncGraphDemo.vue', 'examples/adapters/asyncLayout.ts', 'examples/adapters/layoutCompute.ts', 'examples/workers/graphLayout.worker.ts'],
    api: [
      { text: 'useAsyncGraphLayout', doc: 'api.md#asynchronous-layouts-and-preserved-routes' },
      { text: 'Asynchronous layouts and preserved routes', doc: 'integration.md#asynchronous-layouts-and-preserved-routes' },
    ],
    legacyId: 'async',
  },
  {
    id: 'graph-analysis',
    kind: 'example',
    category: 'graph',
    title: { en: 'Graph analysis', ja: 'グラフ分析' },
    description: {
      en: 'Connected components, communities, centrality and PageRank of a synthetic supplier network, shown with groups, collapsing and highlighting.',
      ja: '架空の仕入先ネットワークの連結成分、コミュニティ、中心性、PageRank を計算し、グループ、折りたたみ、強調表示で示します。',
    },
    component: 'examples/GraphAnalysisDemo.vue',
    sources: ['examples/GraphAnalysisDemo.vue'],
    api: [
      { text: 'Graph analysis', doc: 'api.md#graph-analysis' },
      { text: 'Graph algorithms', doc: 'api.md#graph-algorithms' },
      { text: 'Group collapse', doc: 'api.md#group-collapse-edge-styles-and-waypoints-level-of-detail-and-node-resizing' },
    ],
    legacyId: 'analysis',
  },
  {
    id: 'process-lanes',
    kind: 'example',
    category: 'graph',
    title: { en: 'Process lanes', ja: 'プロセスのスイムレーン' },
    description: {
      en: 'A machining process with one lane per department, laid out by layoutSwimlaneGraph: hand-overs cross lane boundaries, and a step dragged into another lane changes department.',
      ja: '部門ごとに1レーンを割り当てた加工プロセスを layoutSwimlaneGraph で配置します。部門間の受け渡しはレーン境界をまたぐエッジになり、工程を別のレーンへドラッグすると部門が変わります。',
    },
    component: 'examples/SwimlaneDemo.vue',
    sources: ['examples/SwimlaneDemo.vue'],
    api: [
      { text: 'Swimlanes', doc: 'api.md#swimlanes' },
      { text: 'Swimlanes for process flows', doc: 'integration.md#swimlanes-for-process-flows' },
    ],
    legacyId: 'swimlanes',
  },
  {
    id: 'quantity-flow',
    kind: 'example',
    category: 'graph',
    title: { en: 'Quantity flow', ja: '数量フロー' },
    description: {
      en: 'A production lot drawn as quantity bands on one scale: 100 pieces split 60/40, merge at inspection and lose 4 on line B, in pieces or in cost, without ever mixing units.',
      ja: '製造ロットを共通の尺度の数量バンドで描きます。100個が60/40に分かれ、検査で合流し、B ラインで4個減ります。個数とコストを切り替えても単位は混ざりません。',
    },
    component: 'examples/QuantityFlowDemo.vue',
    sources: ['examples/QuantityFlowDemo.vue', 'examples/production/lot-transfers.ts'],
    api: [
      { text: 'Quantity bands', doc: 'api.md#quantity-bands' },
      { text: 'layoutFlowGraph', doc: 'api.md#quantity-flow-projection' },
      { text: 'Quantity flows (Sankey diagrams)', doc: 'integration.md#quantity-flows-sankey-diagrams' },
    ],
    legacyId: 'flow',
  },
  {
    id: 'timeline-editing',
    kind: 'example',
    category: 'timeline',
    title: { en: 'Timeline editing', ja: 'タイムライン編集' },
    description: {
      en: 'An editable project timeline: dependencies, drag to create, batch moves, row moves and indenting, progress, deletion with undo, zoom presets, resource load, column resizing, CSV and Microsoft Project import and image export.',
      ja: '編集できるプロジェクトのタイムラインです。依存関係、ドラッグでの作成、一括移動、行の移動とインデント、進捗、元に戻せる削除、ズームプリセット、リソース負荷、列幅の変更、CSV と Microsoft Project の取り込み、画像出力を備えています。',
    },
    component: 'examples/GanttEditingDemo.vue',
    sources: ['examples/GanttEditingDemo.vue', 'examples/data.ts'],
    api: [
      { text: 'GanttChart', doc: 'api.md#ganttchart' },
      { text: 'Editing contract', doc: 'api.md#editing-contract' },
      { text: 'Dependency editing', doc: 'api.md#dependency-editing' },
      { text: 'Drag to create and cascade previews', doc: 'api.md#drag-to-create-and-cascade-previews' },
      { text: 'Zoom presets and resource load', doc: 'api.md#zoom-presets-now-marker-and-touch-zoom' },
      { text: 'Timeline editing helpers', doc: 'api.md#timeline-editing-helpers' },
    ],
    legacyId: 'editing',
  },
  {
    id: 'resource-scale',
    kind: 'example',
    category: 'timeline',
    title: { en: '1,000 resources', ja: '1,000リソースのガント' },
    description: {
      en: 'A Gantt chart of 1,000 resource rows and 3,000 editable bars that renders only the rows in view and scrolls to any row on request.',
      ja: '1,000行のリソースと3,000本の編集可能なバーを持つガントチャートです。表示範囲の行だけを描画し、指定した行へすぐにスクロールできます。',
    },
    component: 'examples/ResourceScaleDemo.vue',
    sources: ['examples/ResourceScaleDemo.vue', 'examples/components/GraphGanttView.vue', 'examples/data.ts'],
    api: [
      { text: 'GanttChart', doc: 'api.md#ganttchart' },
      { text: 'Viewport helpers', doc: 'api.md#viewport-helpers' },
      { text: 'Linked views, reveal and external drops', doc: 'api.md#linked-views-reveal-and-external-drops' },
    ],
    legacyId: 'scale',
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
    id: 'resource-planning',
    kind: 'example',
    category: 'scheduling',
    title: { en: 'Resource planning', ja: 'リソース計画' },
    description: {
      en: 'One plan shown by resource: a task with two resources has two bars but one set of dates. Every edit from the chart, the backlog or the inspector is previewed, scheduled or leveled and then applied as one undoable step, optionally through a mock server.',
      ja: '1つの計画をリソース別に表示します。2つのリソースを使うタスクはバーが2本でも日程は1つです。チャート、未計画タスクの一覧、インスペクターからの編集はプレビューで確認し、日程計算または平準化してから1つの取り消し単位として適用します。モックサーバー経由の保存も試せます。',
    },
    component: 'examples/ResourcePlanningDemo.vue',
    sources: [
      'examples/ResourcePlanningDemo.vue', 'examples/components/PlanningBacklog.vue', 'examples/components/PlanningInspector.vue',
      'examples/components/PlanningDiagnostics.vue', 'examples/adapters/transactionStore.ts',
    ],
    api: [
      { text: 'Resource timelines and unplanned tasks', doc: 'api.md#resource-timelines-and-unplanned-tasks' },
      { text: 'levelResources', doc: 'api.md#scheduling-modes-splits-leveling-and-time-zones' },
      { text: 'Planning diagnostics', doc: 'api.md#planning-diagnostics-and-schedule-traces' },
      { text: 'Edit transactions and asynchronous saving', doc: 'api.md#edit-transactions-and-asynchronous-saving' },
    ],
    legacyId: 'resource-planning',
  },
  {
    id: 'earned-value',
    kind: 'example',
    category: 'scheduling',
    title: { en: 'Earned value', ja: 'アーンドバリュー' },
    description: {
      en: 'Earned value management of a small delivery project: PV, EV, AC, SPI, CPI and EAC at a status date you choose, EVM columns with summary rollups in the Gantt chart and a cumulative cost S-curve.',
      ja: '小規模な納品プロジェクトのアーンドバリュー管理です。選んだ状況日付での PV・EV・AC・SPI・CPI・EAC、集計行を含むガントチャートの EVM 列、累積コストの S カーブを表示します。',
    },
    component: 'examples/EarnedValueDemo.vue',
    sources: ['examples/EarnedValueDemo.vue', 'examples/data.ts'],
    api: [
      { text: 'computeEarnedValue', doc: 'api.md#earned-value-management' },
      { text: 'Timeline columns and rollups', doc: 'api.md#timeline-columns-and-rollups' },
    ],
    legacyId: 'earned-value',
  },
  {
    id: 'tree-grid',
    kind: 'example',
    category: 'tree-grid',
    title: { en: 'Tree grid', ja: 'ツリーグリッド' },
    description: {
      en: 'A product hierarchy of about 3,000 rows against 30 columns, rendered in a window, with cell and spreadsheet editing, row structure editing, a lazily loaded group and selection linked to a graph, and a cost breakdown with header sorting, filtering and column resizing.',
      ja: '約3,000行の製品階層を30列の属性・在庫と並べ、表示範囲だけを描画します。セル編集とスプレッドシート編集、行構造の編集、遅延読み込みのグループ、グラフと連動する選択を備え、見出しで並べ替え・絞り込み・列幅変更ができる費用内訳も示します。',
    },
    component: 'examples/TreeGridDemo.vue',
    sources: ['examples/TreeGridDemo.vue', 'examples/TreeGridColumnsDemo.vue'],
    api: [
      { text: 'TreeGrid', doc: 'api.md#treegrid' },
      { text: 'Tree grid editing', doc: 'api.md#tree-grid-editing' },
      { text: 'Tree grid row structure', doc: 'api.md#tree-grid-row-structure' },
      { text: 'Tree grid columns', doc: 'api.md#tree-grid-column-widths-sorting-and-filtering' },
      { text: 'Tree grids, matrices and bills of materials', doc: 'integration.md#tree-grids-matrices-and-bills-of-materials' },
    ],
    legacyId: 'tree-grid',
  },
  {
    id: 'period-table',
    kind: 'example',
    category: 'tree-grid',
    title: { en: 'Period table', ja: '期間別テーブル' },
    description: {
      en: 'Stock by site, item and measure against day or week columns in Europe/Berlin, loaded for the visible window of the supply orders below it. Demand cells are editable, and selecting a shortage highlights the orders that feed it.',
      ja: '拠点・品目・指標ごとの在庫を Europe/Berlin の日または週の列に並べ、下の供給オーダーの表示範囲に合わせて読み込みます。需要のセルは編集でき、欠品のセルを選ぶとそれを補うオーダーが強調表示されます。',
    },
    component: 'examples/PeriodTableDemo.vue',
    sources: ['examples/PeriodTableDemo.vue', 'examples/adapters/periodTableSource.ts'],
    api: [
      { text: 'Time bucket tables', doc: 'api.md#time-bucket-tables' },
      { text: 'Period tables from time buckets', doc: 'integration.md#period-tables-from-time-buckets' },
      { text: 'useWindowedData', doc: 'api.md#partial-data-loading' },
      { text: 'TreeGrid', doc: 'api.md#treegrid' },
    ],
    legacyId: 'period-table',
  },
  {
    id: 'event-calendar',
    kind: 'example',
    category: 'calendar-board',
    title: { en: 'Event calendar', ja: 'イベントカレンダー' },
    description: {
      en: 'Room bookings in day, week and month views with rooms and all-day events. Moves, resizes and new bookings are proposals that the parent checks for double bookings, and a weekly recurring meeting can be edited once, from one date on or as a series.',
      ja: '会議室の予約を日・週・月表示で、部屋ごとの列や終日予定とともに表示します。移動、長さの変更、新規予約は提案として親が二重予約を確認して適用し、毎週の定例会議は1回分、以降すべて、シリーズ全体のいずれかで編集できます。',
    },
    component: 'examples/EventCalendarDemo.vue',
    sources: ['examples/EventCalendarDemo.vue'],
    api: [
      { text: 'EventCalendar', doc: 'api.md#eventcalendar' },
      { text: 'Event calendar helpers', doc: 'api.md#event-calendar-helpers' },
      { text: 'Recurring events', doc: 'api.md#recurring-events' },
    ],
    legacyId: 'event-calendar',
  },
  {
    id: 'task-board',
    kind: 'example',
    category: 'calendar-board',
    title: { en: 'Task board', ja: 'タスクボード' },
    description: {
      en: 'A kanban board and a Gantt chart on the same tasks with one shared selection: collapsible columns and lanes, a card filter, WIP limits and a rule that a task reaches Done only at 100% progress.',
      ja: 'カンバンボードとガントチャートが同じタスクと選択を共有します。列とレーンの折りたたみ、カードの絞り込み、WIP 制限、進捗が100%のタスクだけを完了にできるルールを備えています。',
    },
    component: 'examples/TaskBoardDemo.vue',
    sources: ['examples/TaskBoardDemo.vue'],
    api: [
      { text: 'TaskBoard', doc: 'api.md#taskboard' },
      { text: 'Task board helpers', doc: 'api.md#task-board-helpers' },
    ],
    legacyId: 'task-board',
  },
  {
    id: 'diagram-styles',
    kind: 'example',
    category: 'diagram',
    title: { en: 'Diagram styles', ja: 'ダイアグラムのスタイル' },
    description: {
      en: 'Order fulfilment drawn with the default renderer only: node shapes, edge markers, an animated main path, spread parallel edges, orthogonal routes around the nodes and edge labels placed clear of each other.',
      ja: '受注から出荷までの流れを標準の描画だけで表現します。ノードの形状、エッジのマーカー、アニメーションする主経路、間隔を空けた平行エッジ、ノードを避ける直交ルート、互いに重ならないエッジラベルを示します。',
    },
    component: 'examples/DiagramStylesDemo.vue',
    sources: ['examples/DiagramStylesDemo.vue'],
    api: [
      { text: 'Node shapes, edge markers, animated and parallel edges', doc: 'api.md#node-shapes-edge-markers-animated-and-parallel-edges' },
      { text: 'Graph routing', doc: 'api.md#graph-routing' },
    ],
    legacyId: 'diagram',
  },
  {
    id: 'diagram-editor',
    kind: 'example',
    category: 'diagram',
    title: { en: 'Diagram editor', ja: 'ダイアグラムエディター' },
    description: {
      en: 'A small diagram editor built from GraphPalette, NetworkGraph and PropertyInspector: drag shapes onto the canvas, connect them and edit the selected node, with every change in one undo history.',
      ja: 'GraphPalette、NetworkGraph、PropertyInspector を組み合わせた小さなダイアグラムエディターです。図形をキャンバスへドラッグして接続し、選択したノードを編集できます。すべての変更は1つの履歴で元に戻せます。',
    },
    component: 'examples/DiagramEditorDemo.vue',
    sources: ['examples/DiagramEditorDemo.vue'],
    api: [
      { text: 'Diagram editor parts', doc: 'api.md#diagram-editor-parts' },
      { text: 'GraphPalette', doc: 'api.md#graphpalette' },
      { text: 'PropertyInspector', doc: 'api.md#propertyinspector' },
      { text: 'Diagram editor parts guide', doc: 'integration.md#diagram-editor-parts' },
    ],
    legacyId: 'diagram-editor',
  },
  {
    id: 'bpmn-process',
    kind: 'example',
    category: 'diagram',
    title: { en: 'BPMN process', ja: 'BPMN プロセス' },
    description: {
      en: 'A purchase order process between two pools with BPMN events, gateways, task types, a data store and dashed message flows, drawn with the built-in flowchart and BPMN shapes and markers.',
      ja: '2つのプールにまたがる発注プロセスです。組み込みのフローチャート・BPMN の形状とマーカーで、イベント、ゲートウェイ、タスクの種類、データストア、破線のメッセージフローを描きます。',
    },
    component: 'examples/BpmnDemo.vue',
    sources: ['examples/BpmnDemo.vue'],
    api: [
      { text: 'BPMN and flowchart shapes, markers and pools', doc: 'api.md#bpmn-and-flowchart-shapes-markers-and-pools' },
      { text: 'BPMN processes and flowcharts', doc: 'integration.md#bpmn-processes-and-flowcharts' },
    ],
    legacyId: 'bpmn',
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
    id: 'saved-editing',
    kind: 'example',
    category: 'linked-data',
    title: { en: 'Saved editing', ja: 'サーバー保存付きの編集' },
    description: {
      en: 'Editing confirmed by a mock server: each action is one transaction that the server accepts, rejects, answers with a version conflict or leaves unknown. Undo and redo go through the same server, and the document and its view state save to and load from JSON.',
      ja: 'モックサーバーが確認する編集です。操作ごとに1つのトランザクションとなり、サーバーは受理、拒否、版の競合、結果不明のいずれかで応答します。元に戻す・やり直しも同じサーバーを通り、ドキュメントと表示状態は JSON で保存・読み込みできます。',
    },
    component: 'examples/PersistenceDemo.vue',
    sources: ['examples/PersistenceDemo.vue', 'examples/adapters/transactionStore.ts', 'examples/components/TypedCellEditor.vue'],
    api: [
      { text: 'useEditTransaction', doc: 'api.md#edit-transactions-and-asynchronous-saving' },
      { text: 'Versioned JSON snapshots', doc: 'api.md#versioned-json-snapshots' },
      { text: 'Typed fields and timeline views', doc: 'api.md#typed-fields-and-timeline-views' },
      { text: 'Saving through a server', doc: 'integration.md#saving-through-a-server' },
    ],
    legacyId: 'persistence',
  },
  {
    id: 'large-plan',
    kind: 'example',
    category: 'linked-data',
    title: { en: 'Large plan with partial loading', ja: '大規模計画の部分読み込み' },
    description: {
      en: 'A large read-only plan that fetches only the weeks and rows on screen and aborts the requests a scroll supersedes, and a 5,000-part network expanded one hop at a time, optionally keeping the parts already shown in place.',
      ja: '画面に見えている週と行だけを取得する大規模な読み取り専用の計画です。スクロールで不要になった要求は中止します。5,000部品のネットワークを1ホップずつ展開し、表示済みの部品の位置を保つこともできます。',
    },
    component: 'examples/LargePlanDemo.vue',
    sources: ['examples/LargePlanDemo.vue', 'examples/adapters/largePlanSource.ts'],
    api: [
      { text: 'useWindowedData', doc: 'api.md#partial-data-loading' },
      { text: 'Loading only what is visible', doc: 'integration.md#loading-only-what-is-visible' },
      { text: 'Expanding a graph one hop at a time', doc: 'integration.md#expanding-a-graph-one-hop-at-a-time' },
      { text: 'Incremental placement', doc: 'api.md#incremental-placement' },
    ],
    legacyId: 'large-plan',
  },
  {
    id: 'diagram-interchange',
    kind: 'example',
    category: 'interchange',
    title: { en: 'Diagram import and export', ja: 'ダイアグラムのインポートとエクスポート' },
    description: {
      en: 'The graph written as Mermaid, GraphML or draw.io text, edited and read back into the graph in the browser. Dragged nodes keep their place in GraphML and draw.io, and compressed draw.io files are inflated.',
      ja: 'グラフを Mermaid、GraphML、draw.io のテキストに書き出し、編集してブラウザー内でグラフに読み戻します。ドラッグしたノードの位置は GraphML と draw.io に保存され、圧縮された draw.io ファイルも展開して読み込めます。',
    },
    component: 'examples/GraphInterchangeDemo.vue',
    sources: ['examples/GraphInterchangeDemo.vue'],
    api: [
      { text: 'Graph interchange', doc: 'api.md#graph-interchange' },
      { text: 'Diagram files: Mermaid, GraphML and draw.io', doc: 'integration.md#diagram-files-mermaid-graphml-and-drawio' },
    ],
    legacyId: 'interchange',
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
      en: 'Compare plans around a machine outage and see how a moved operation shifts later work, the shipping time and the resource load; follow a lot through the process graph in units or cost; edit an approval workflow; and plan a project in a schedule sheet. The planning and lot views share one linked selection, and every edit is saved to a mock server with app-wide undo, redo and visible conflicts. In English and Japanese.',
      ja: '設備の保守停止をはさんで計画案を比べ、作業を動かしたときの後工程、出荷時刻、設備負荷への影響を確かめられます。ロットの流れを個数と原価で工程図に表示し、承認フローの編集と日程表シートでの計画も試せます。計画とロットの流れは選択を連動し、すべての編集はモックサーバーに保存され、アプリ全体で元に戻す・やり直す・競合の表示ができます。日本語と英語に対応しています。',
    },
    summary: {
      en: 'Plan comparison, lot flow, an approval workflow and a schedule sheet in one app.',
      ja: '計画比較、ロットの流れ、承認フロー、日程表シートを1つのアプリにまとめました。',
    },
    tags: ['GanttChart', 'NetworkGraph', 'scheduleTasks', 'useEditTransaction', 'useLinkedSelection'],
    component: 'examples/production/ProductionShowcase.vue',
    sources: [
      'examples/production/ProductionShowcase.vue',
      'examples/production/ProductionWorkspace.vue',
      'examples/production/workspace.ts',
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
      { text: 'useLinkedSelection', doc: 'api.md#linked-views' },
      { text: 'useEditTransaction', doc: 'api.md#edit-transactions-and-asynchronous-saving' },
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
