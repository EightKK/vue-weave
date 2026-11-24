---
title: API リファレンス
description: Vue Weave のすべてのコンポーネント、コンポーザブル、コア関数と、2 つのエントリーポイントの分け方、互換性の方針。
---

# API リファレンス

Vue Weave には 2 つのエントリーポイントがあります。`@eightkk/vue-weave` は Vue 用のエントリーで、コンポーネント、コンポーザブル、そしてコアのすべて(再エクスポート)を含みます。`@eightkk/vue-weave/core` はヘッドレスなコアで、Vue、DOM、ブラウザーのグローバルを使わない純粋な TypeScript です。Node.js 22.18 以降、Worker、サーバーで動きます。スタイルシートは `@eightkk/vue-weave/style.css` です。

```ts
// Vue アプリケーションで
import { GanttChart, NetworkGraph, useEditHistory, scheduleTasks } from '@eightkk/vue-weave'
import '@eightkk/vue-weave/style.css'

// サーバーや Worker で(Vue は不要)
import { scheduleTasks, layoutLayeredGraph, toMsProjectXml } from '@eightkk/vue-weave/core'
```

各ページには、リポジトリの `docs/` フォルダーにある手書きのリファレンス(npm パッケージにも含まれます)を表示しています。[型リファレンス](/ja/api/reference/)は TypeScript の宣言から生成したもので、エクスポートされたすべての関数、インターフェース、型を載せています(英語)。

## API の全体像

### コンポーネント(`@eightkk/vue-weave`)

すべてのコンポーネントは制御コンポーネントです。プロップを自分で変更することはなく、ユーザーの編集は提案として emit され、アプリケーション側が適用します。

| コンポーネント | 内容 |
| --- | --- |
| [NetworkGraph](./components/network-graph.md) | インタラクティブなネットワークグラフ: レイアウト、編集、グループ、スイムレーン、ミニマップ、エクスポート |
| [GanttChart](./components/gantt-chart.md) | 制御されたガントチャートとタイムライン: 依存関係、ベースライン、列、スプレッドシート編集、負荷ヒストグラム |
| [TreeGrid](./components/tree-grid.md) | 行と列を同時に仮想化するツリーグリッドとマトリクス。セル、シート、行の編集 |
| [TaskBoard](./components/task-board.md) | 列、スイムレーン、WIP 制限を持つカンバンボード |
| [EventCalendar](./components/event-calendar.md) | リソースと繰り返しイベントに対応した日・週・月・予定リストのカレンダー |
| [GraphPalette と PropertyInspector](./components/diagram-editor.md) | NetworkGraph でダイアグラムエディターを作るための図形パレットとプロパティフォーム |

### コンポーザブル(`@eightkk/vue-weave`)

[`useLinkedSelection`、`useEditHistory`、`useEditTransaction`、`useTimelineView`、`useWindowedData`、`useAsyncGraphLayout`](./composables.md) はコアの状態を Vue につなぎます。ビュー間の連動選択、元に戻す・やり直す、サーバー経由の保存、検索・並べ替えしたタイムライン、部分的な読み込み、Worker でのレイアウトに使います。

### コア(`@eightkk/vue-weave/core`)

| 分野 | 主なエクスポート |
| --- | --- |
| [コアのエントリーポイント](./core/) | コアのすべてのエクスポートの一覧表 |
| [グラフのレイアウトとルーティング](./core/graph-layout.md) | `layoutLayeredGraph`、追加のレイアウト、ポート、`routeGraphEdges`、増分配置、数量フロー、ビューポート |
| [グラフのアルゴリズムと探索](./core/graph-algorithms.md) | `topologicalOrder`、`shortestGraphPath`、中心性、コミュニティ、`traverseGraph` |
| [タイムラインと時間軸](./core/timeline.md) | `createTimeScale`、`editTimeRange`、行ツリー、型付きフィールドとタイムラインビュー |
| [スケジューリングとリソース](./core/scheduling.md) | `scheduleTasks`、`levelResources`、`calculateResourceLoad`、実績、アーンドバリュー、診断、計画の比較 |
| [連動ビューとデータ](./core/linked-data.md) | ビューバインディング、時間範囲の探索、`diffStructure`、ウィンドウ化データ、グラフの展開、時間バケット |
| [インターチェンジとエクスポート](./core/interchange.md) | MS Project、iCalendar、CSV、Mermaid、GraphML、draw.io、スナップショット、SVG エクスポート |

### 横断的なトピック

- [エラーと検証](./errors.md): 共通の ID ルール、エラーのクラスとメッセージの形式。
- [テーマと CSS 変数](./theming.md): `--vw-*` カスタムプロパティ、ダークテーマ、クラス名、独自の描画、右から左へのレイアウト。
- ガイド: [セットアップ、TypeScript、Nuxt](./guides/setup.md)、[グラフの組み込み](./guides/graph.md)、[データ、保存、連動ビュー](./guides/data.md)、[スケジューリング](./guides/scheduling.md)、[リソースと計画の分析](./guides/resources.md)、[アーキテクチャと範囲](./guides/architecture.md)。

## エントリーポイント

::: info 英語の詳細
ここから下の詳細なリファレンスは英語です。
:::

<!--@include: ../../../docs/api.md#intro-->

<!--@include: ../../../docs/api.md#compatibility-->

<!--@include: ../../../docs/api.md#typed-data-->
