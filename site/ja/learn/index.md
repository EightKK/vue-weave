# はじめに

Vue Weave には、2つの主要コンポーネント `NetworkGraph` と `GanttChart`、必要に応じて使える `TreeGrid`、`TaskBoard`、`EventCalendar`、`GraphPalette`、`PropertyInspector`、そしてグラフレイアウト・日程計算・リソース負荷・ファイル変換のためのヘッドレスなコアがあります。

## インストール

```sh
npm install @eightkk/vue-weave
```

Vue `^3.5.0` はピア依存です。アプリにまだ Vue がなければ、npm 7 以降はパッケージと一緒にインストールします。パッケージには ES モジュール、TypeScript の型宣言、スタイルシート1つが含まれ、実行時の依存パッケージはありません。

## スタイルシートを読み込む

アプリのエントリーファイルなどで、スタイルシートを一度だけ読み込みます。

```ts
import '@eightkk/vue-weave/style.css'
```

Vite など CSS に対応したバンドラーは、この import をそのまま扱えます。Nuxt では `nuxt.config.ts` の `css` に指定します。`tsconfig.json` で `noUncheckedSideEffectImports` を有効にしている場合は [The stylesheet and TypeScript](https://github.com/EightKK/vue-weave/blob/main/docs/integration.md#the-stylesheet-and-typescript) を参照してください。

## ネットワークグラフ

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

他のレイアウト、エッジのスタイル、検索の強調表示、ミニマップ、編集なども、同じようにプロップと `options` で有効にします。

## 制御されたガントチャート

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

区間は半開区間 `[start, end)` で、単位は呼び出し側が決める数値(既定はミリ秒)です。長さ0のバーはマイルストーンになります。

## 制御コンポーネントの考え方

コンポーネントは渡されたデータを書き換えません。バーのドラッグ、ノードの移動、ノード間の接続といったユーザーの編集は、ポインターの動きに合わせてプレビューされたあと、提案(`edit`、`node-move`、`connect`、`cell-edit` など)として通知されます。適用するかどうかは、該当する項目を置き換えるかどうかでアプリが決めます。そのため、検証、API を通じた保存、非同期の承認はアプリ側に置けます。

- `validateEdit` や `validateConnection` などの同期的な検証関数は、提案を通知する前に却下できます。却下の理由はコンポーネントが読み上げます。
- 操作中に元データが変わると、その操作は取り消され、`edit-cancel` で通知されます。
- `useEditHistory` で元に戻す・やり直しを、`useEditTransaction` で競合処理付きのサーバー保存を追加できます。

詳しくは [Editing contract](https://github.com/EightKK/vue-weave/blob/main/docs/api.md#editing-contract) を参照してください。

## サーバーサイドレンダリング

コンポーネントはサーバーでレンダリングできます。DOM の計測と `ResizeObserver` はマウント後にだけ使い、サーバーでの初回描画では決まった仮のビューポートサイズを使ってから実際のコンテナーを計測します。SVG の ID は Vue の `useId` で作ります。データと `formatTime` の出力はサーバーとクライアントで同じにしてください。タイムゾーンに依存するラベルには、`timeZone` とロケールを明示した `Intl.DateTimeFormat` を使います。[Nuxt](https://github.com/EightKK/vue-weave/blob/main/docs/integration.md#nuxt) も参照してください。

## コアだけを使う: サーバーと Worker

`@eightkk/vue-weave/core` は Vue、DOM、ブラウザーのグローバルを読み込まないため、日程計算、レイアウト、相互変換、SVG 出力を Node.js 22.18 以降、Worker、サーバーレス関数で実行できます。[Core only](https://github.com/EightKK/vue-weave/blob/main/docs/integration.md#core-only-servers-and-workers) を参照してください。

## 次に読むもの

- [作例](../examples/)と[ショーケース](../showcase/)を見てください。どの作例のページにもソースコードがあります。
- [API リファレンス](../api/)を読んでください。
