# Vue Weave

[![CI](https://github.com/EightKK/vue-weave/actions/workflows/ci.yml/badge.svg)](https://github.com/EightKK/vue-weave/actions/workflows/ci.yml) [![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

[English](README.md)

[ソースコード](https://github.com/EightKK/vue-weave) · [課題・問い合わせ](https://github.com/EightKK/vue-weave/issues) · [リリース](https://github.com/EightKK/vue-weave/releases)

Vue 3でネットワークグラフやガントチャートを実装するためのライブラリです。製造のロット系譜、プロジェクト工程、設備・担当者別の予定などに利用できます。型付きコンポーネントと、フレームワークに依存しないグラフ・日程計算・設備負荷の集計機能を提供します。

![製造デモのNetworkGraph。材料、分割工程、2つのロット、仕上げ工程、製品を左から右へ階層配置したグラフ](.github/images/network-graph.png)

![スケジューリングデモのGanttChart。非稼働時間の網掛け、クリティカルパスの枠線、余裕日数の線、分割バー、ステータス日付線、締切フラグ、完了日と余裕日数の列を表示したカレンダー対応スケジュール](.github/images/gantt-chart.png)

## 主な機能

基本機能以外はすべてpropsで有効にします。詳細は [docs/api.md](docs/api.md)、[docs/integration.md](docs/integration.md)、[docs/scheduling.md](docs/scheduling.md) を参照してください。

### NetworkGraph

- 標準レイアウトは分岐・合流、独立したノード、有向閉路、自己ループに対応し、方向を `LR`・`TB`・`RL`・`BT` から選べ、`crossingReduction: 'barycenter'` で辺の交差を減らせます。
- `layout` 関数で配置と経路を指定できます。`layoutTreeGraph`、`layoutRadialGraph`、円形の `layoutCircularGraph`、格子状の `layoutGridGraph`、次数などで同心円に並べる `layoutConcentricGraph`、決定的な力学モデル配置の `layoutForceGraph`、アプリケーションで導入したELK.jsの結果が使えます（[ELK.jsでレイアウトする](docs/integration.md#use-elkjs-for-layout)を参照）。
- 工程フローのスイムレーン：`layoutSwimlaneGraph` で部門や作業区ごとのレーンを指定した順に並べ（部門間の受け渡しはレーン境界をまたぐ線になります）、`lanes` prop で帯とタイトルを描きます。ミニマップと書き出しにも反映されます。ドラッグしたノードがどのレーンに入るかは `graphSwimlaneAt` で判定できます。
- `node`・`edge`・`group`・`minimap-node` スロットでSVG描画を変更でき、項目の横にHTMLを表示する `tooltip`・`node-toolbar`・`edge-toolbar` スロットも使えます。
- ノードと辺のラベルのその場編集（`editableLabels`。`label-edit` で提案）と、投げ縄による選択（`selectionMode: 'lasso'`）。
- 接続のポートルール（`connectionRules`。ポートごとの型・方向・接続数の上限）。違反は理由の文で却下され、接続中は接続できる先が強調されます。読み込んだグラフは `graphConnectionViolations` で検査できます。
- ノード移動、接続、複数選択、ミニマップ。辺の選択（`edgesSelectable`）、キーボードによる削除の提案（`deletable`。`removeGraphElements` で適用）、コンテキストメニューの要求（`contextMenu`）。
- 入れ子のグループ（`parentId`）、グループを代表ノードへ折りたたむ機能（`collapsibleGroups`・`collapsedGroupIds`）、ノードのサイズ変更（`sizes`・`resizable`）。
- 辺の直角・直線表示（`edgeStyle`。辺ごとにも指定可）、ノードを避ける直角の経路（`avoidNodes`）、経由点（`GraphEdge.points`。`editableEdges` で編集）、平行な辺の振り分け（`parallelEdgeSpacing`）、辺の端の記号（`markerStart`・`markerEnd`）、流れるアニメーション（`animated`）。
- 箱形に加えて、ひし形・楕円・六角形のノード（`NetworkNode.shape`）。書き出しにも反映されます。
- 大規模グラフとタッチ操作：表示範囲外の描画省略（`cullOffscreen`）、ピンチズーム、縮小時に詳細を隠す表示（`lodThreshold`）。
- 検索結果の強調（`matchIds`・`dimmedIds`）と、`focusNode(id)`・`fit({ ids })` メソッド。
- グリッドへの吸着（`snapGrid`）と点・線の背景（`background`）、整列ガイド（`alignmentGuides`）、`autoPan`。
- パレットからのドロップ（`droppable` と `node-drop` イベント。`toGraphPoint(x, y)` と `getViewportCenter()` を併用）。
- コピー・貼り付け・複製の提案（`clipboard`。`copy-selection`・`paste-request`・`duplicate-selection` イベントを `cloneGraphElements` で適用）。

### GanttChart

- 複数レーン、進捗率、マイルストーン、FS/SS/FF/SFの依存関係。階層行、ベースライン（差異付きで最大3つの名前付きセット）、多段見出し、日時マーカー。行と表示時間範囲の仮想化。
- `formatTime`、`labels`、スロット、CSS変数による表示の調整。ポインターを載せられる `tooltip` スロット、独自のメニューを表示するための `context-menu` イベント（`contextMenu`）、`fitToBars()` メソッド。
- 依存関係の作成と付け替え（`connectable`、`reconnectable`、`validateConnection`）。依存関係のラグ・リードのラベル表示（`lag`、`formatLag`）。ラグは日程計算にもそのまま使われます。サマリー行への依存関係とサマリー行からの依存関係を、集約バーにつないで描画することもできます（`summaryDependencies`、オプトイン）。
- 複数選択と一括移動（`multiSelect`、`edits`）、行の移動（`rowDraggable`）。
- 行の空いている部分のドラッグによる新しいバーの作成（`creatable`、`create`）。重なったバーは `assignLanes` でレーンに振り分けられます。
- 移動に連動して動くバーをドラッグ中に表示し、移動と合わせて一つの `edits` として提案する自動スケジューリングのプレビュー（`cascade`）。
- 進捗率のスライダー（`progressEditable`、`progress-edit`）と、バーの削除（`deletable`、`bars-delete`。`removeTimelineBars` で反映できます）。
- ポインターやAltキーと矢印キーによる行の階層編集（`rowsReorderable`、`row-move`。`moveTimelineRow` で反映できます）。`timelineWbsCodes` はWBS列に使う行番号を求めます。
- ポインターのドラッグや矢印キーによる列幅の変更（`columnsResizable`、`column-resize`、`labelWidth`）。
- 工程行の下に表示する設備負荷のヒストグラム（`loadRows`、`loadSegments`）。`calculateResourceLoad` の出力をそのまま渡せます。
- ズームプリセット（`zoomPresets`）、現在時刻マーカー（`showNow`）、タッチのピンチズーム（`pinchZoom`）、ポインター位置を中心にしたCtrl+ホイールのズーム（`wheelZoom`）。
- コードフリーズや休暇などの期間の強調表示（`markerRanges`）。チャート全体または指定した行に帯を描き、見出しにラベルを表示します。
- 基準日の線（`statusDate`）と、遅れている工程や先行している工程を示すイナズマ線（`showProgressLine`）。
- 非稼働時間の網掛け（`nonWorkingPeriods`）。バーの任意フィールド `critical`・`latestEnd`・`deadline`・`segments` で、クリティカルパスの枠線、余裕（フロート）の線、期限の目印、中断で分割された作業を表示します。これらの情報はバーの名前を変えずにスクリーンリーダー向けの説明に追加されます。「手動スケジュール」のような独自の補足も、`TimelineBar.description` でこの説明とツールチップに加えられます。
- スケジュール制約（`TimelineBar.constraints`。名前は `ScheduleTask` と同じです）を、違反も分かる目印で表示します。ドラッグやキーボードで動かせるハンドルも使えます（`constraintsEditable`、`constraint-edit`。`applyTimelineConstraintEdit` で反映できます）。

### ヘッドレスコア（`vue-weave/core`）

- グラフの解析：`topologicalOrder`、`findGraphCycles`、`shortestGraphPath`、`searchGraphNodes`、`filterGraph`。
- グラフの指標：連結成分（`graphComponents`）、次数・媒介・PageRankの各中心性、Louvain法によるコミュニティ検出（`detectGraphCommunities`）、検出結果を `NetworkGraph` のグループに変換する `graphCommunityGroups`。
- グラフの形状：`collapseGraphGroups`・`routeGraphEdges`・`applyGraphSizes` は、コンポーネントのpropsと同じ形状を計算します。
- カレンダーと日程計算：`buildWorkPeriods`、`scheduleTasks`、`calculateResourceLoad`。循環や実行不能の診断、最遅開始（`mode: 'alap'`）、中断区間（pauses）、手動スケジュールのタスク（`manual`）と非アクティブなタスク（`inactive`）、サマリータスク（`parentId`）、IANAタイムゾーンの稼働カレンダー（`WorkWeek.timeZone`）にも対応します。
- `levelResources` による設備負荷の平準化（時間とともに変わる能力 `capacityPeriods` と、タスクの一部だけを占める割り当て `workOffset`・`workDuration` にも対応）と、`propagateEdit`（結果はそのまま `cascade` の戻り値に使えます）・`rescheduleFromStatusDate` による計画の更新。
- チャート向けの補助関数：`scheduledBarFields`、`invertWorkPeriods`、日程を `NetworkGraph` 用のPERT図に変換する `scheduleToGraph`。
- カレンダー表示：`calendarZoomPresets` はIANAタイムゾーンに沿った時・日・週・月・四半期・年のズームプリセットを作り、`intlTimeFormatter` と `calendarBands`（`locale`）はサーバーとクライアントで一致するロケール対応のラベルを作ります。
- データ交換：`toMsProjectXml`、`toICalendar`、`toCsv` は計画を書き出し、`parseCsv` と `timelineFromCsvTable` はCSVファイルを行とバーとして、`fromMsProjectXml` と `timelineFromMsProject` はMicrosoft ProjectのXMLファイルを行・バー・ベースライン・依存関係として（カレンダー、リソース、割り当ても）、`fromICalendar` と `timelineFromICalendar` はiCalendarファイルを読み込みます。

### 計画・連動・保存

- ビューの連動：`useLinkedSelection` はグラフ、ガントチャート、負荷行をエンティティの対応づけで連動させます。利用者が操作したビューだけが選択を持ち、ほかのビューには表示専用の強調（`highlightedNodeIds`、`highlightedEdgeIds`、`highlightedBarIds`、`highlightedLoadTargets`）を渡します。`target-enter`、`target-leave`、`target-activate` イベントが指している対象を通知し、`revealNode`、`revealBar`、`revealLinkedTarget` が折り畳まれたグループや行の中も含めてその対象へ移動します。任意の時間範囲（`timelineBarsInRange`、`resolveTimeRangeTargets`、または `timeRange` オプション）を指定すると、その範囲に作業していた対象（分割バーは作業区間で判定）と、必要に応じてグラフ上で関連する対象を強調します。
- リソースビュー：`projectResourceTimeline` は割り当てたリソースごとにタスクを表示し、負荷を二重に数えません。`resolveResourceTimelineEdit` は別の行へのドラッグを割当の変更に変換し、`buildPlacementInput` は未計画タスクを計算から除きます。GanttChart はアプリの一覧からのドロップを受け付けます（`droppable`、`bar-drop`）。
- 理由の説明：`scheduleTasks(input, { explain: true })` と `levelResources` は各タスクの日程が決まった理由をトレースとして返します。`toPlanningDiagnostics` は循環、実行不能なタスク、負荷超過、平準化で解決できなかったタスクを、関係するタスクとリソースとともに一覧にします。
- 計画シナリオの比較：`comparePlans` は候補計画を現行計画と比較し、入力の差分（編集したタスク、依存関係、カレンダー、割り当て、能力）と計算結果の差分（最終完了、結果として動いたタスク、クリティカルの変化、期限超過、リソースごとの累積負荷超過）を分けて返します。`planComparisonTargets` と `planBaselines` で既存のハイライトとベースラインセットに表示できます。
- 非同期レイアウト：`useAsyncGraphLayout` はWorkerなど任意の非同期エンジンでレイアウトを計算し、そろった最新のフレームだけを表示します。`routingPolicy="preserve"` はポート付きの辺を含めてエンジンの配線を保持します。
- 型付きセル・検索・保存ビュー：`field` を持つ列は型付きの値を提案し（`field-edit`、`cell-editor` スロット）、`useTimelineView` は行の表示用コピーを検索・並べ替えます。
- 保存：`useEditTransaction` はアダプター経由で文書ごとに一つずつ保存し、受理・拒否・版競合・結果不明を区別します。Undo／Redo もサーバーへ送ります。`serializeWeaveSnapshot` と `restoreWeaveSnapshot` はデータと表示設定を版付きで検証されたJSONとして保存・復元します。
- デモの未計画一覧、インスペクター、診断一覧、ツールバーは `examples/components/` の参考実装で、パッケージには含まれません。

### 書き出し・テーマ・RTL

- どちらのコンポーネントも `exportSvg(options)` と `exportPng(options)` を提供し、サーバーでは `renderGraphSvg` と `renderTimelineSvg` がSVGを生成します。
- 組み込みのダークテーマ（`vw-theme-dark`）と、`prefers-color-scheme` に従う `vw-theme-auto`。強制カラー、モーション低減、印刷にも対応します。
- `dir="rtl"`（または `auto`）による右から左のレイアウト。

## 対応状況

- **バージョン0.5.0です。** 0.x の間は、破壊的変更がマイナーリリース（0.x.0）に含まれることがあり、[変更履歴](CHANGELOG.md)の「Breaking changes」に記載します。パッチリリース（0.x.y）には後方互換の修正だけを含めます。バージョンを固定して利用してください。特定のtarballをインストールすれば自然に固定されます。
- **Vue：** 3.5以降（peer dependency）。
- **モジュールとTypeScript：** ESMのみ。型定義は `Bundler` と `NodeNext` の型解決に対応しています。項目の `data` に型を付けられ（`NetworkNode<MyData>`、`TimelineBar<MyData>`）、その型がキャストなしでスロットのpropsやコールバックに渡ります。
- **Node.js：** ヘッドレスの `vue-weave/core`、サーバーサイドレンダリング、開発には22.18以降が必要です。
- **ブラウザー：** 最新の主要ブラウザー（Chrome、Edge、Firefox、Safari）。自動ブラウザーテストはChromiumのみで実行するため、ほかのブラウザーはCIの対象外です。
- **アクセシビリティ：** キーボード操作とARIA名を備えています。専用のスクリーンリーダーでの検証はまだ行っていません（[構成、性能上の扱い、対応範囲](docs/architecture.md)を参照）。十分に対応していると想定しないでください。

## 組み込む

npmでは公開していません。[GitHub Release](https://github.com/EightKK/vue-weave/releases) に添付された `vue-weave-0.5.0.tgz` をダウンロードするか、チェックアウトから[ローカルパッケージを作成](CONTRIBUTING.md#build-a-local-package)してください。そのtarballを、利用するアプリケーションのフォルダーからインストールします。次のパスは実際のファイルのパスに置き換えます。

```sh
npm install ./vue-weave-0.5.0.tgz
```

Vue 3.5以降をpeer dependencyとしています。ES modules、TypeScriptの型定義、スタイルシートを提供します。CSSはアプリケーションで `import 'vue-weave/style.css'` により一度だけ読み込んでください。`vue-weave/core` はVueなしで動作し、TypeScriptの `NodeNext` による型解決にも対応しています。

## クイックスタート

### ネットワークグラフ

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { NetworkGraph, type NetworkNode, type GraphEdge } from 'vue-weave'
import 'vue-weave/style.css'

const selected = ref('design')
const nodes: NetworkNode[] = [
  { id: 'design', label: 'Design' },
  { id: 'build', label: 'Build' },
  { id: 'release', label: 'Release' },
]
const edges: GraphEdge[] = [
  { id: 'db', from: 'design', to: 'build' },
  { id: 'br', from: 'build', to: 'release', label: 'Approved' },
]
</script>

<template>
  <NetworkGraph
    v-model:selected-id="selected"
    :nodes="nodes"
    :edges="edges"
    :options="{ direction: 'LR' }"
  />
</template>
```

ほかの機能も、propsと `options` で同じように有効にします。次の例は、右から左へ配置し、辺の交差を減らし、検索結果を強調し、画面外のノードの描画を省略します。

```vue
<NetworkGraph
  ref="graph"
  :nodes="nodes"
  :edges="edges"
  :options="{ direction: 'RL', crossingReduction: 'barycenter' }"
  :match-ids="matches"
  cull-offscreen
/>
```

### ガントチャート

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { GanttChart, type TimelineBar, type TimelineEdit } from 'vue-weave'
import 'vue-weave/style.css'

const start = Date.parse('2026-11-09T08:00:00Z')
const hour = 3_600_000
const range = { start, end: start + 8 * hour }
const rows = [{ id: 'team', label: 'Engineering' }]
const bars = ref<TimelineBar[]>([
  {
    id: 'build', rowId: 'team', label: 'Build',
    start: start + hour, end: start + 3 * hour,
    editable: true, progress: 0.4,
  },
])

function commit(change: TimelineEdit) {
  bars.value = bars.value.map(bar =>
    bar.id === change.id ? { ...bar, ...change.after } : bar,
  )
}
</script>

<template>
  <GanttChart :rows="rows" :bars="bars" :range="range" @edit="commit" />
</template>
```

コンポーネントはドラッグ中のプレビューを表示し、`edit` イベントで変更案を渡します。呼び出し側が採用した内容を `bars` に反映します。アプリ固有の検証、API保存、非同期の承認処理を組み込めます。同期の `validateEdit` フックでイベント発行前に変更案を拒否することもできます。区間は半開区間 `[start, end)` で、長さ0のバーはマイルストーンです。

### ビューの連動

グラフとガントチャートを連動させる最小の例です。どちらかのビューで項目を選ぶと、そのビューで選択され、もう一方の対応する項目が強調されます。

```vue
<script setup lang="ts">
import { NetworkGraph, GanttChart, useLinkedSelection, type ViewBinding, type ViewTargetEvent } from 'vue-weave'

// nodes、edges、rows、bars、range は上の例と同じです。ここではノードIDとバーIDがタスクIDです。
const bindings: ViewBinding[] = bars.value.flatMap(bar => [
  { entity: { kind: 'task', id: bar.id }, target: { view: 'graph', kind: 'node', id: bar.id } },
  { entity: { kind: 'task', id: bar.id }, target: { view: 'timeline', kind: 'bar', id: bar.id } },
])
const linked = useLinkedSelection({ bindings })
const activate = (event: ViewTargetEvent) => linked.select(event.target.view, [event.target])
</script>

<template>
  <NetworkGraph :nodes="nodes" :edges="edges" :selected-ids="linked.graph.value.selectedNodeIds"
    :highlighted-node-ids="linked.graph.value.highlightedNodeIds" @target-activate="activate" />
  <GanttChart :rows="rows" :bars="bars" :range="range" :selected-ids="linked.timeline.value.selectedBarIds"
    :highlighted-bar-ids="linked.timeline.value.highlightedBarIds" @target-activate="activate" />
</template>
```

ホバー、負荷行、折り畳まれた項目への移動は [Linking views](docs/integration.md#linking-views) を、`useEditTransaction` は [Saving through a server](docs/integration.md#saving-through-a-server) を参照してください。

## 書き出し・表示方向・テーマ

どちらのコンポーネントも、テンプレートrefの `exportSvg(options)` と `exportPng(options)` でチャート全体を保存でき、サーバーでは `vue-weave/core` が同じSVGを生成します。右から左の表示には `dir="rtl"`（または `auto`）を指定します。コンポーネントまたはその祖先に `vw-theme-dark` を付けるとダークテーマ、`vw-theme-auto` を付けると `prefers-color-scheme` に従います。詳細は[組み込みガイド](docs/integration.md)を参照してください。

```ts
const svg = chart.value!.exportSvg({ title: 'Plan' })
const png = await chart.value!.exportPng({ scale: 2 })
```

## デモを起動する

ホスト型のデモはありません。Node.js 22.18以降とnpmを用意し、ローカルで起動します。cloneしたソースやGitHubのソースZIPのフォルダーで次を実行します。

```sh
npm ci
npm run build:demo
npm start
```

デモには製造、プロジェクト工程、1,000行の予定、大規模グラフ、タイムライン編集、日程計算に加え、ビューの連動、非同期レイアウト、ダイアグラム表現（ノード形状、エッジ端の記号、アニメーションと平行エッジ）、グラフ分析（連結成分、コミュニティ、中心性の順位）、未計画タスクを含むリソース計画、模擬サーバーへの保存を伴う編集があり、書き出しボタン、テーマ切り替え、採用済みの変更を戻す **Undo**／**Redo** も用意しています。**Edit graph**、**Planning overlays**、**Scheduling** などの切り替えで、上記のオプション機能を試せます。**Design gallery** の行では、同じ2つのコンポーネントをスロット、`--vw-*` 変数、`vw-` クラスだけでワークフロービルダー、データベーススキーマ図、組織図、プロダクトロードマップ、スプリント計画、客室予約カレンダー、期間を強調したカレンダー表示の見た目に作り替えています。編集結果はデモ画面内の状態として保持します。

Windowsでは代わりに `Start.cmd` をダブルクリックしても起動できます。`preview/` が現在のソースからビルドされたものであればそのまま表示し、そうでなければ先にビルドします。インストール済みの依存関係が `package-lock.json` と一致しない場合は、ビルドの前に `npm ci` も実行します。`npm start` は `preview/` をそのまま表示します。

`preview/` を含むビルド済みデモのアーカイブ（リリースに添付されることがあります）を使う場合は、全体を展開して `npm start` を実行するか、Windowsで `Start.cmd` をダブルクリックします。ビルド済みデモはNode.jsがあれば依存関係のインストールなしで起動できます。ソースを変更した場合は `Start.cmd` がデモをビルドし直します。初回はnpmとインターネット接続が必要です。

開発・検証コマンドは[Contributing](CONTRIBUTING.md)を参照してください。

## ドキュメント

API、コメント、詳細ドキュメントは英語です。

- [入力型と公開API](docs/api.md)
- [Vue・Nuxtへの組み込み、独自描画、時間軸、保存処理](docs/integration.md)
- [構成、性能上の扱い、対応範囲](docs/architecture.md)
- [日程計算と設備負荷](docs/scheduling.md)
- [開発とリリース手順](CONTRIBUTING.md)
- [セキュリティ方針と脆弱性の非公開報告](docs/security.md)
- [行動規範](docs/code-of-conduct.md)
- [変更履歴](CHANGELOG.md)

## ライセンス

MITです。[LICENSE](LICENSE) を参照してください。ビルド済みデモの第三者ライセンス表示は [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) と [Third-party licenses](docs/third-party-licenses.md) にあります。
