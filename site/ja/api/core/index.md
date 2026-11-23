---
title: コアのエントリーポイント
description: Vue Weave のヘッドレスなコア @eightkk/vue-weave/core と、そのエクスポートの一覧表。
---

# コアのエントリーポイント {#top}

`@eightkk/vue-weave/core` は純粋な TypeScript です。グラフのレイアウトとルーティング、グラフのアルゴリズム、時間軸、スケジューリングとリソース負荷、アーンドバリュー、連動ビューのバインディング、ウィンドウ化データ、ファイル形式の相互変換、SVG エクスポートを含みます。Vue、DOM、ブラウザーのグローバルを読み込まないので、ブラウザーに加えて Node.js 22.18 以降、Web Worker、サーバーレス関数でも動きます。すべての関数は新しい値を返し、引数を変更しません。Vue のエントリーはコアのすべてを再エクスポートしています。

サーバーでの計算(計画をスケジュールしてから送る)、Worker での計算(大きなグラフのレイアウトをメインスレッドの外で行う)、テストに使い、結果を通常のプロップとしてコンポーネントに渡します。

## 最小の例

```ts
import { layoutLayeredGraph } from '@eightkk/vue-weave/core'

const layout = layoutLayeredGraph(
  [{ id: 'a', label: '切断' }, { id: 'b', label: '溶接' }],
  [{ id: 'ab', from: 'a', to: 'b' }],
  { direction: 'LR' },
)
console.log(layout.boxes.get('b')) // { x, y, width, height }
```

エクスポートは分野ごとに次のページにまとめています: [グラフのレイアウトとルーティング](./graph-layout.md)、[グラフのアルゴリズムと探索](./graph-algorithms.md)、[タイムラインと時間軸](./timeline.md)、[スケジューリングとリソース](./scheduling.md)、[連動ビューとデータ](./linked-data.md)、[インターチェンジとエクスポート](./interchange.md)。生成された[コアの型リファレンス](/ja/api/reference/core/)には、すべてのエクスポートとシグネチャーが載っています(英語)。

::: info 英語の詳細
ここから下の詳細なリファレンスは英語です。
:::

<!--@include: ../../../../docs/api.md#core-entry-->
