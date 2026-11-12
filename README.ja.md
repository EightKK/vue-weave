# Vue Weave

[English](README.md)

[ソースコード](https://github.com/EightKK/vue-weave) · [課題・問い合わせ](https://github.com/EightKK/vue-weave/issues)

Vue 3でネットワークグラフやガントチャートを実装するためのライブラリです。製造のロット系譜、プロジェクト工程、設備・担当者別の予定などに利用できます。型付きコンポーネントと、フレームワークに依存しないグラフ・日程計算・設備負荷の集計機能を提供します。

## 組み込む

npmでは配布していません。[ローカルパッケージの作成手順](CONTRIBUTING.md#build-a-local-package)に従って作成した `.tgz` を、利用するアプリケーションのフォルダーからインストールしてください。次のパスは実際のファイルのパスに置き換えます。

```sh
npm install ./path/to/package.tgz
```

Vue 3.5以降をpeer dependencyとしています。ES modules、TypeScriptの型定義、スタイルシートを提供します。CSSはアプリケーションで一度読み込んでください。`vue-weave/core` はVueなしで動作し、TypeScriptの `NodeNext` による型解決にも対応しています。

## ネットワークグラフ

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

標準レイアウトは分岐・合流、独立したノード、有向閉路、自己ループに対応し、方向を `LR`・`TB`・`RL`・`BT` から選べ、`crossingReduction: 'barycenter'` で辺の交差を減らせます。`layout` 関数で配置と経路を指定でき、`node`・`edge` スロットでSVG描画を変更できます。ノード移動、接続、複数選択、ミニマップはpropsで有効にします。

別の形状には、`vue-weave/core` の `layoutTreeGraph` と `layoutRadialGraph` を `layout` としてそのまま渡せます。入れ子のグループ（`parentId`）、大規模グラフ向けの表示範囲外の描画省略（`cullOffscreen`）、タッチ操作のピンチズーム、`matchIds`・`dimmedIds` と `focusNode(id)` メソッドによる検索結果の強調も、必要に応じて有効にできます。コアの `topologicalOrder`、`findGraphCycles`、`shortestGraphPath`、`searchGraphNodes`、`filterGraph` で、同じノード・辺のデータを解析できます。

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

## ガントチャート

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

コンポーネントはドラッグ中のプレビューを表示し、`edit` イベントで変更案を渡します。呼び出し側が採用した内容を `bars` に反映します。アプリ固有の検証、API保存、非同期の承認処理を組み込めます。同期の `validateEdit` フックでイベント発行前に変更案を拒否することもできます。

複数レーン、進捗率、マイルストーン、FS/SS/FF/SFの依存関係に対応しています。階層行、ベースライン、多段見出し、日時マーカーを利用でき、行と表示時間範囲の仮想化で描画要素数を抑えます。`formatTime`、`labels`、スロット、CSS変数で表示を調整できます。

次の機能もpropsで有効にでき、変更はいずれも変更案として親に渡されます。

- 依存関係の作成と付け替え（`connectable`、`reconnectable`、`validateConnection`）
- 複数選択と一括移動（`multiSelect`、`edits`）、行の移動（`rowDraggable`）
- 工程行の下に表示する設備負荷のヒストグラム（`loadRows`、`loadSegments`）。`calculateResourceLoad` の出力をそのまま渡せます
- ズームプリセット（`zoomPresets`）、現在時刻マーカー（`showNow`）、タッチのピンチズーム（`pinchZoom`）

稼働カレンダー、依存関係に基づく日程計算、クリティカル工程、設備負荷の診断には、`vue-weave/core` の `buildWorkPeriods`、`scheduleTasks`、`calculateResourceLoad` を使います。アプリケーションがこれらを呼び出し、採用した結果をチャートへ渡します。循環や実行不能の診断、最遅開始（`mode: 'alap'`）、中断区間（pauses）、IANAタイムゾーンの稼働カレンダー（`WorkWeek.timeZone`）にも対応し、`levelResources` は割り当て負荷が容量内に収まるよう工程を後ろへずらします。詳細は[日程計算と設備負荷](docs/scheduling.md)を参照してください。

## 書き出し・表示方向・テーマ

どちらのコンポーネントも、テンプレートrefの `exportSvg(options)` と `exportPng(options)` でチャート全体を保存できます。サーバーでは `vue-weave/core` の `renderGraphSvg` と `renderTimelineSvg` が同じSVGを生成します。右から左の表示には `dir="rtl"`（または `auto`）を指定します。コンポーネントまたはその祖先に `vft-theme-dark` クラスを付けると組み込みのダークテーマ、`vft-theme-auto` を付けると `prefers-color-scheme` に従います。スタイルシートは強制カラー、モーション低減、印刷にも対応しています。詳細は[組み込みガイド](docs/integration.md)を参照してください。

```ts
const svg = chart.value!.exportSvg({ title: 'Plan' })
const png = await chart.value!.exportPng({ scale: 2 })
```

## デモを起動する

Node.js 22.18以降とnpmを用意し、cloneしたソースやGitHubのソースZIPのフォルダーで次を実行します。

```sh
npm ci
npm run build:demo
npm start
```

デモには製造、プロジェクト工程、1,000行の予定、大規模グラフ、タイムライン編集、日程計算があり、書き出しボタンとテーマ切り替えも用意しています。**Edit graph** で接続・再接続・範囲選択・一括移動、**Planning overlays** で編集列と親行サマリーを試せます。**Undo**／**Redo** で採用済みの変更を戻せます。**Scheduling** では工程を移動すると、分割シフトの稼働カレンダーに従って後続工程と設備負荷を再計算します。編集結果はデモ画面内の状態として保持します。

`preview/` を含むビルド済みデモのアーカイブを使う場合は、全体を展開して `npm start` を実行するか、Windowsで `Start.cmd` をダブルクリックします。ビルド済みデモはNode.jsがあれば依存関係のインストールなしで起動できます。

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
