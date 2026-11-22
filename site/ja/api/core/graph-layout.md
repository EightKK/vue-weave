---
title: グラフのレイアウトとルーティング
description: 階層レイアウトと追加のレイアウト、ポートとエッジのルーティング、増分配置、数量フロー、ビューポートの補助関数、非同期レイアウト。
---

# グラフのレイアウトとルーティング

コアは Vue なしで、ノードの位置とエッジの経路を計算します。4 方向と交差削減に対応した決定的な階層レイアウト(`layoutLayeredGraph`)、ツリー、放射、円、グリッド、同心円、力学、スイムレーンの各レイアウト、名前付きポート、障害物を避ける直交経路、エッジラベルの配置、表示中のノードを動かさない増分配置、数量フロー(サンキー図)があります。NetworkGraph も同じ関数を使っています。サーバーや Worker でレイアウトする、`layout` プロップに渡す、独自の描画をする、といった場合に直接呼び出します。

## 最小の例

```ts
import { layoutRadialGraph, type GraphLayoutFunction } from '@eightkk/vue-weave/core'

const nodes = [{ id: 'hub', label: 'ハブ' }, { id: 'a', label: 'A' }, { id: 'b', label: 'B' }]
const edges = [{ id: 'ha', from: 'hub', to: 'a' }, { id: 'hb', from: 'hub', to: 'b' }]

// サーバーや Worker で: ボックス、経路、大きさを持つ普通の結果
const layout = layoutRadialGraph(nodes, edges, { roots: ['hub'] })

// NetworkGraph で: 同じ関数を `layout` プロップに渡す
const radial: GraphLayoutFunction = (shownNodes, shownEdges) => layoutRadialGraph(shownNodes, shownEdges, { roots: ['hub'] })
// <NetworkGraph :nodes="nodes" :edges="edges" :layout="radial" />
```

**例:** [連動ビュー](/ja/examples/linked-views/)、[例の一覧](/ja/examples/)。**ガイド:** [グラフの組み込み](../guides/graph.md)([ELK.js](../guides/graph.md#use-elk-js-for-layout) を含む)。**型:** [`GraphLayout`](/api/reference/core/interfaces/GraphLayout.md)、[`layoutLayeredGraph`](/api/reference/core/functions/layoutLayeredGraph.md)、[`routeGraphEdges`](/api/reference/core/functions/routeGraphEdges.md)。コアのすべてのエクスポートの一覧表は[コアのエントリーポイント](./index.md#core-entry-point)にあります。

::: info 英語の詳細
ここから下の詳細なリファレンスは英語です。
:::

<!--@include: ../../../../docs/api.md#graph-layout-->

<!--@include: ../../../../docs/api.md#viewport-helpers-->

<!--@include: ../../../../docs/api.md#async-layouts-->
