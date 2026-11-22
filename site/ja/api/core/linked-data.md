---
title: 連動ビューとデータ
description: ビューバインディングと useLinkedSelection、時間範囲の探索、diffStructure による構造の比較、ウィンドウ化データ、グラフの展開、時間バケットの表。
---

# 連動ビューとデータ

これらの補助関数は、アプリケーションのビューどうしと、その裏のデータをつなぎます。ビューバインディングはアプリケーションのエンティティ(タスク、リソース、部品)を各ビューの表示要素に対応づけるので、バーを選ぶとそのノード、負荷の区間、ツリーグリッドの行がハイライトされます。`useLinkedSelection` はこれをリアクティブに行います。時間範囲の探索は、ある時間帯に行われた作業を示します。`diffStructure` は部品表の 2 つの版など、平坦またはツリー状のコレクションの 2 つの版を比較します。ウィンドウ化データとグラフの展開は画面に見えている部分だけを読み込み、時間バケットは期間の表(日・週・シフトごとの行)を作ります。

どれも純粋な関数でデータを返すだけです。コンポーネントには、結果の ID やハイライトをプロップとして渡します。

## 最小の例

```ts
import { diffStructure } from '@eightkk/vue-weave/core'

const before = [
  { id: 'bike', name: '自転車' },
  { id: 'frame', parentId: 'bike', name: 'フレーム', quantity: 1 },
  { id: 'bell', parentId: 'bike', name: 'ベル', quantity: 1 },
]
const after = [
  { id: 'bike', name: '自転車' },
  { id: 'frame', parentId: 'bike', name: 'フレーム', quantity: 2 },
]
const diff = diffStructure(before, after, { key: 'id', parentKey: 'parentId', fields: ['name', 'quantity'] })
diff.changed // [{ key: 'frame', fields: [{ name: 'quantity', before: 1, after: 2 }] }]
diff.removed // ['bell']
```

**例:** [連動ビュー](/ja/examples/linked-views/)、[ツリーグリッド](/ja/examples/tree-grid/)、[部品表](/ja/showcase/bom/)。**ガイド:** [データ、保存、連動ビュー](../guides/data.md)。**型:** [`diffStructure`](/api/reference/core/functions/diffStructure.md)、[`ViewBinding`](/api/reference/core/interfaces/ViewBinding.md)、[`useLinkedSelection`](/api/reference/vue-weave/functions/useLinkedSelection.md)、[`useWindowedData`](/api/reference/vue-weave/functions/useWindowedData.md)。

::: info 英語の詳細
ここから下の詳細なリファレンスは英語です。
:::

<!--@include: ../../../../docs/api.md#linked-views-->

<!--@include: ../../../../docs/api.md#time-range-exploration-->

<!--@include: ../../../../docs/api.md#structure-comparison-->

<!--@include: ../../../../docs/api.md#partial-data-loading-->

<!--@include: ../../../../docs/api.md#time-buckets-->
