---
title: NetworkGraph
description: NetworkGraph コンポーネントのプロップ、イベント、スロット、公開メソッド。
---

# NetworkGraph {#top}

`NetworkGraph` はノードとエッジをインタラクティブな SVG のグラフとして描きます。標準は階層レイアウトで、`layout` プロップで他のレイアウトに切り替えられます。グループ、スイムレーン、ポート、ミニマップ、検索のハイライト、SVG と PNG へのエクスポートを備えています。工程フロー、依存関係のネットワーク、PERT 図、ロットの系譜など、ユーザーが探索・編集する図に使います。

制御コンポーネントです。ノードの移動、接続、削除、ラベルの編集は提案(`node-move`、`connect`、`reconnect` など)として emit され、アプリケーション側が適用します。`validateConnection` で接続を同期的に拒否できます。状態として保持した位置はレイアウトより優先されます。

## 最小の例

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { NetworkGraph, type GraphEdge, type NetworkNode } from '@eightkk/vue-weave'
import '@eightkk/vue-weave/style.css'

const selected = ref('design')
const nodes: NetworkNode[] = [
  { id: 'design', label: '設計' },
  { id: 'build', label: '製作' },
  { id: 'release', label: 'リリース' },
]
const edges: GraphEdge[] = [
  { id: 'db', from: 'design', to: 'build' },
  { id: 'br', from: 'build', to: 'release', label: '承認' },
]
</script>

<template>
  <NetworkGraph v-model:selected-id="selected" :nodes="nodes" :edges="edges" :options="{ direction: 'LR' }" />
</template>
```

**例:** [連動ビュー](/ja/examples/linked-views/)、[部品表](/ja/showcase/bom/)、[例の一覧](/ja/examples/)。**ガイド:** [グラフの組み込み](../guides/graph.md)。**型:** [`NetworkNode`](/api/reference/core/interfaces/NetworkNode.md)、[`GraphEdge`](/api/reference/core/interfaces/GraphEdge.md)、[`NetworkGraphExposed`](/api/reference/vue-weave/type-aliases/NetworkGraphExposed.md)。コンポーネントが使うレイアウト関数は[グラフのレイアウトとルーティング](../core/graph-layout.md)にあります。

::: info 英語の詳細
ここから下の詳細なリファレンスは英語です。
:::

<!--@include: ../../../../docs/api.md#network-graph-->
