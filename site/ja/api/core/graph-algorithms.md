---
title: グラフのアルゴリズムと探索
description: トポロジカル順序、閉路、最短経路、検索、中心性、コミュニティ、条件付きのグラフ探索。
---

# グラフのアルゴリズムと探索

コアはグラフを描かずに、グラフについての問いに答えます。トポロジカル順序と閉路(`topologicalOrder`、`findGraphCycles`)、最短経路、ノードの検索と絞り込み、連結成分、次数・媒介・PageRank の中心性、Louvain 法のコミュニティ(`graphCommunityGroups` で NetworkGraph のグループに変換できます)、そして上流・下流をホップ数の上限まで辿る `traverseGraph`(エッジの条件、ノード数の上限、辿った経路も扱えます)があります。どれもループで書かれているので 12,000 ノードの鎖でも問題なく、閉路があっても終了します。

あるノードに依存するものをハイライトする、作業の順序を決める、工程のボトルネックを探す、グラフを 1 ホップずつ読み込む([グラフの展開](./linked-data.md#partial-data-loading)を参照)といった用途に使います。

## 最小の例

```ts
import { traverseGraph, topologicalOrder } from '@eightkk/vue-weave/core'

const nodes = [{ id: 'ore' }, { id: 'steel' }, { id: 'frame' }, { id: 'bike' }]
const edges = [
  { id: 'e1', from: 'ore', to: 'steel' },
  { id: 'e2', from: 'steel', to: 'frame' },
  { id: 'e3', from: 'frame', to: 'bike' },
]
const downstream = traverseGraph({ nodes, edges }, ['steel'], { direction: 'forward', maxHops: 2 })
// downstream.nodeIds: ['steel', 'frame', 'bike']
const order = topologicalOrder(nodes, edges)
// <NetworkGraph :highlighted-node-ids="new Set(downstream.nodeIds)" ... />
```

**例:** [部品表](/ja/showcase/bom/)、[連動ビュー](/ja/examples/linked-views/)。**型:** [`traverseGraph`](/api/reference/core/functions/traverseGraph.md)、[`GraphTraversalResult`](/api/reference/core/interfaces/GraphTraversalResult.md)、[`topologicalOrder`](/api/reference/core/functions/topologicalOrder.md)。

::: info 英語の詳細
ここから下の詳細なリファレンスは英語です。
:::

<!--@include: ../../../../docs/api.md#graph-algorithms-->

<!--@include: ../../../../docs/api.md#traversal-->
