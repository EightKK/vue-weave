# Vue Weave

[![CI](https://github.com/EightKK/vue-weave/actions/workflows/ci.yml/badge.svg)](https://github.com/EightKK/vue-weave/actions/workflows/ci.yml) [![npm](https://img.shields.io/npm/v/@eightkk/vue-weave.svg)](https://www.npmjs.com/package/@eightkk/vue-weave) [![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/EightKK/vue-weave/blob/v1.6.0/LICENSE)

[English](https://github.com/EightKK/vue-weave/blob/v1.6.0/README.md)

**[Webサイト](https://eightkk.github.io/vue-weave/ja/)** · [はじめに](https://eightkk.github.io/vue-weave/ja/learn/) · [作例](https://eightkk.github.io/vue-weave/ja/examples/) · [ショーケース](https://eightkk.github.io/vue-weave/ja/showcase/) · [APIリファレンス](https://eightkk.github.io/vue-weave/ja/api/) · [変更履歴](https://github.com/EightKK/vue-weave/blob/v1.6.0/CHANGELOG.md)

Vue 3でネットワークグラフ、ガントチャート、ツリーグリッドを実装するためのライブラリです。レイアウト・日程計算・資源計画のためのヘッドレスなコアを備えています。関係の探索、工程フロー、プロジェクト工程、設備・担当者別の予定、部品表（BOM）エディタなどを、型付きの制御されたコンポーネントで作れます。グラフ・日程計算・設備負荷・アーンドバリューの計算は、Node.js、Worker、サーバーでも動きます。

<table>
  <tr>
    <td width="50%" valign="top"><a href="https://eightkk.github.io/vue-weave/ja/showcase/bom/"><img src="https://raw.githubusercontent.com/EightKK/vue-weave/main/.github/images/showcase-bom.png" alt="BOMエディタの作例。5階層の部品表をツリーグリッドで表示して2つの版を比較し、使用先の経路を強調した品目グラフと連動" width="100%"></a></td>
    <td width="50%" valign="top"><a href="https://eightkk.github.io/vue-weave/ja/showcase/construction/"><img src="https://raw.githubusercontent.com/EightKK/vue-weave/main/.github/images/showcase-construction.png" alt="建設工程の作例。クリティカルパス、ベースライン、余裕日数の線、アーンドバリューの指標を備えた全体工程表" width="100%"></a></td>
  </tr>
</table>

- **制御されたコンポーネント。** `NetworkGraph`、`GanttChart` と、オプトインの `TreeGrid`、`TaskBoard`、`EventCalendar`、`GraphPalette`、`PropertyInspector` は渡されたデータを書き換えません。利用者の編集は変更案のイベントになり、反映するかどうかはアプリ側で決めます。
- **計画機能を内蔵。** 稼働カレンダー、依存関係、クリティカルパス、設備負荷と平準化、実績からの再計画、アーンドバリュー、計画シナリオの比較に対応し、各日程が決まった理由も説明できます。
- **ビューの連動。** グラフ、ガントチャート、ツリーグリッド、アプリ独自の表のどこで対象を選んでも、ほかのビューで同じ対象が強調されます。
- **必要な機能だけを有効化、Vue以外の実行時依存なし。** サーバーサイドレンダリング、SVG・PNGの書き出し、Microsoft Project・iCalendar・CSV・Mermaid・GraphML・draw.ioとのデータ交換、ダークテーマ、右から左のレイアウトに対応します。

## インストール

```sh
npm install @eightkk/vue-weave
```

Vue `^3.5.0` をpeer dependencyとしています。npm 7以降では、アプリケーションにVueがまだなければパッケージと一緒にインストールされます。ES modules、TypeScriptの型定義、スタイルシート1つを提供します。

スタイルシートは、アプリケーションのエントリファイルなどで一度だけ読み込みます。

```ts
import '@eightkk/vue-weave/style.css'
```

Viteではこのままimportできます。`tsconfig.json` で `noUncheckedSideEffectImports` を有効にしている場合や、CSSを扱えないビルド環境の場合は、[The stylesheet and TypeScript](https://github.com/EightKK/vue-weave/blob/v1.6.0/docs/integration.md#the-stylesheet-and-typescript)を参照してください。

**コアだけを使う場合（サーバー・Worker）。** `@eightkk/vue-weave/core` は実行時にVueを必要とせず、Node.js 22.18以降、Worker、サーバーで動作します。ただしVueは必須のpeer dependencyで、optionalなpeerとしては設定していないため、`npm install @eightkk/vue-weave` でVueもインストールされます。コアだけを配備する環境でVueを除くには `--omit=peer` を付けてインストールします。詳しくは[Core only: servers and Workers](https://github.com/EightKK/vue-weave/blob/v1.6.0/docs/integration.md#core-only-servers-and-workers)を参照してください。

**オフラインでのインストール。** 各[GitHub Release](https://github.com/EightKK/vue-weave/releases)には、npmに公開したものと同じパッケージのtarballも添付しています。`eightkk-vue-weave-1.6.0.tgz` をダウンロードし、利用するアプリケーションのフォルダーからインストールします。次のパスは実際のファイルのパスに置き換えます。

```sh
npm install ./eightkk-vue-weave-1.6.0.tgz
```

チェックアウトから[ローカルパッケージを作成](https://github.com/EightKK/vue-weave/blob/v1.6.0/CONTRIBUTING.md#build-a-local-package)することもできます。

## クイックスタート

### ネットワークグラフ

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { NetworkGraph, type NetworkNode, type GraphEdge } from '@eightkk/vue-weave'
import '@eightkk/vue-weave/style.css'

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

### ガントチャート

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { GanttChart, type TimelineBar, type TimelineEdit } from '@eightkk/vue-weave'
import '@eightkk/vue-weave/style.css'

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
import { NetworkGraph, GanttChart, useLinkedSelection, type ViewBinding, type ViewTargetEvent } from '@eightkk/vue-weave'

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

詳しくは[はじめに](https://eightkk.github.io/vue-weave/ja/learn/)と[ビューの連動の作例](https://eightkk.github.io/vue-weave/ja/examples/linked-views/)を参照してください。

## 含まれるもの

| 部品 | できること | ドキュメント |
| --- | --- | --- |
| `NetworkGraph` | 階層・ツリー・放射・力学・スイムレーンのレイアウト、BPMN・フローチャートの図形、数量フロー、グループ、変更案としての編集、大規模グラフ向けのミニマップと描画の間引き | [API](https://eightkk.github.io/vue-weave/ja/api/components/network-graph.html) · [作例](https://eightkk.github.io/vue-weave/ja/examples/#graph) |
| `GanttChart` | 依存関係、ベースライン、クリティカルパス、資源負荷の行、スプレッドシート編集、カレンダーとタイムゾーン、行と時間の仮想表示 | [API](https://eightkk.github.io/vue-weave/ja/api/components/gantt-chart.html) · [作例](https://eightkk.github.io/vue-weave/ja/examples/#timeline) |
| `TreeGrid` | 行ツリー×列やマトリクスを縦横に仮想表示し、セル・範囲・行構造の編集と、見出しでの並べ替え・絞り込み・列幅の変更に対応 | [API](https://eightkk.github.io/vue-weave/ja/api/components/tree-grid.html) · [作例](https://eightkk.github.io/vue-weave/ja/examples/#tree-grid) |
| `TaskBoard`、`EventCalendar` | WIP制限とスイムレーンのあるカンバン、資源別表示と繰り返し予定に対応した日・週・月のカレンダー | [TaskBoard](https://eightkk.github.io/vue-weave/ja/api/components/task-board.html) · [EventCalendar](https://eightkk.github.io/vue-weave/ja/api/components/event-calendar.html) |
| `GraphPalette`、`PropertyInspector` | ダイアグラムエディタの部品：図形パレットと型付きのプロパティパネル | [API](https://eightkk.github.io/vue-weave/ja/api/components/diagram-editor.html) |
| コンポーザブル | ビューの連動選択、元に戻す・やり直す、サーバーへの保存、表示状態、表示範囲だけの読み込み、Workerでのレイアウト | [API](https://eightkk.github.io/vue-weave/ja/api/composables.html) |
| `@eightkk/vue-weave/core` | グラフのアルゴリズムと探索、日程計算と平準化、アーンドバリュー、期間集計、構造の差分、データ交換とSVG書き出し（実行時にVue不要） | [API](https://eightkk.github.io/vue-weave/ja/api/core/) · [型リファレンス](https://eightkk.github.io/vue-weave/api/reference/) |

すべての機能をソースコード付きで動かせる[作例](https://eightkk.github.io/vue-weave/ja/examples/)と、部品を組み合わせた完成度の高いアプリケーションの[ショーケース](https://eightkk.github.io/vue-weave/ja/showcase/)を用意しています。

## 対応状況

- **1.0以降は安定版です。** [セマンティックバージョニング](https://semver.org/lang/ja/)に従い、破壊的変更はメジャーリリースだけで行い、[変更履歴](https://github.com/EightKK/vue-weave/blob/v1.6.0/CHANGELOG.md)の「Breaking changes」に記載します。対象となるもの（エクスポートされた名前と型、props、イベント、スロット、ドキュメントに記載した `--vw-*` 変数、スナップショットの形式）と対象外のもの（エラーメッセージの文言、コンポーネントが出力する `vw-` クラス、DOM構造、サーバーレンダリングのマークアップ）は[Compatibility and versioning](https://github.com/EightKK/vue-weave/blob/v1.6.0/docs/api.md#compatibility-and-versioning)に記載しています。
- **Vue：** 3.x の3.5以降（peer dependency `^3.5.0`）。
- **モジュールとTypeScript：** ESMのみ。型定義は `Bundler` と `NodeNext` の型解決に対応しています。項目の `data` に型を付けられ（`NetworkNode<MyData>`、`TimelineBar<MyData>`）、その型がキャストなしでスロットのpropsやコールバックに渡ります。
- **Node.js：** ヘッドレスの `@eightkk/vue-weave/core`、サーバーサイドレンダリング、開発には22.18以降が必要です。
- **ブラウザー：** 最新の主要ブラウザー（Chrome、Edge、Firefox、Safari）。自動ブラウザーテストは、変更のたびにChromiumで実行します。同じテストをFirefoxとWebKitでもCIで実行しますが、このジョブはまだマージの必須条件ではありません。実機のマルチタッチ入力が必要なテストはChromiumのみで実行します。
- **アクセシビリティ：** キーボード操作とARIA名を備えています。専用のスクリーンリーダーでの検証はまだ行っていません（[構成、性能上の扱い、対応範囲](https://github.com/EightKK/vue-weave/blob/v1.6.0/docs/architecture.md)を参照）。十分に対応していると想定しないでください。

## Webサイトをローカルで起動する

[Webサイト](https://eightkk.github.io/vue-weave/ja/)は `main` から再構築されるため、最新のリリースより新しい内容を含むことがあります。ローカルで起動するには Node.js 22.18以上と npm を使い、ソースのチェックアウトまたは GitHub のソースZIPで次を実行します。

```sh
npm ci
npm run build:demo
npm start
```

`npm start` はビルド済みのサイトを `http://127.0.0.1:4173/vue-weave/` で配信します（日本語は `/vue-weave/ja/`）。Windows では `Start.cmd` をダブルクリックしても起動でき、ソースが変わっていれば先にサイトを再構築します。リリースに添付されたビルド済みサイトのアーカイブは、依存関係をインストールせずに `npm start` で動きます。生産計画の単独アプリは `/vue-weave/demo/` にあります。開発と検証のコマンドは [Contributing](https://github.com/EightKK/vue-weave/blob/v1.6.0/CONTRIBUTING.md) を参照してください。

## ドキュメント

Webサイトの[APIリファレンス](https://eightkk.github.io/vue-weave/ja/api/)と[ガイド](https://eightkk.github.io/vue-weave/ja/learn/)は、npmパッケージにも含まれる [`docs/`](https://github.com/EightKK/vue-weave/blob/v1.6.0/docs/) のMarkdownから作られています（詳細な表は英語です）。

- [公開APIと入力の約束事](https://github.com/EightKK/vue-weave/blob/v1.6.0/docs/api.md)
- [Vue・Nuxt・独自描画・時間軸・保存](https://github.com/EightKK/vue-weave/blob/v1.6.0/docs/integration.md)
- [アーキテクチャ・性能・対象範囲](https://github.com/EightKK/vue-weave/blob/v1.6.0/docs/architecture.md)
- [日程計算と資源負荷](https://github.com/EightKK/vue-weave/blob/v1.6.0/docs/scheduling.md)
- [コントリビュートとリリース手順](https://github.com/EightKK/vue-weave/blob/v1.6.0/CONTRIBUTING.md)
- [セキュリティと非公開の脆弱性報告](https://github.com/EightKK/vue-weave/blob/v1.6.0/docs/security.md)
- [行動規範](https://github.com/EightKK/vue-weave/blob/v1.6.0/docs/code-of-conduct.md)
- [変更履歴](https://github.com/EightKK/vue-weave/blob/v1.6.0/CHANGELOG.md)

## ライセンス

MIT。[LICENSE](https://github.com/EightKK/vue-weave/blob/v1.6.0/LICENSE) を参照してください。ビルド済みサイトに含まれる第三者のライセンス表示は [THIRD_PARTY_NOTICES.md](https://github.com/EightKK/vue-weave/blob/v1.6.0/THIRD_PARTY_NOTICES.md) と[第三者ライセンス](https://github.com/EightKK/vue-weave/blob/v1.6.0/docs/third-party-licenses.md)にあります。
