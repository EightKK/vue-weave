---
title: コンポーザブル
description: useLinkedSelection、useEditHistory、useEditTransaction、useTimelineView、useWindowedData、useAsyncGraphLayout。
---

# コンポーザブル

Vue のエントリー(`@eightkk/vue-weave`)のコンポーザブルは、コアの純粋な状態を Vue の ref につなぎます。隠れたグローバルな状態は持たず、呼び出しごとに自分の状態を持ちます。コンポーネントには通常のプロップとして渡します。

| コンポーザブル | 用途 | リファレンス |
| --- | --- | --- |
| `useLinkedSelection` | 1 つのビューで選んだ項目に対応するものを、グラフ、タイムライン、負荷行、ツリーグリッドでハイライトする | [Linked views](./core/linked-data.md#linked-views) |
| `useEditHistory` | コンポーネントが表示する状態の「元に戻す」と「やり直す」 | [下記](#application-undo-and-redo) |
| `useEditTransaction` | 編集をサーバーのアダプター経由で保存し、保存中・失敗・競合の状態を扱う | [下記](#edit-transactions-and-asynchronous-saving) |
| `useTimelineView` | 元の行を変えずに GanttChart を検索、並べ替え、絞り込み、列の非表示にする | [Typed fields and timeline views](./core/timeline.md#typed-fields-and-timeline-views) |
| `useWindowedData` | 画面に見えている行と時間の範囲だけを、中断、重複排除、再試行付きで取得する | [Partial data loading](./core/linked-data.md#partial-data-loading) |
| `useAsyncGraphLayout` | グラフのレイアウトを Worker や ELK.js で計算し、その間は仮のフレームを表示する | [Asynchronous layouts](./core/graph-layout.md#asynchronous-layouts-and-preserved-routes) |

## 最小の例

GanttChart の「元に戻す」と「やり直す」: 受け入れた編集ごとに commit し、`state` をチャートに渡します。

```vue
<script setup lang="ts">
import { GanttChart, useEditHistory, type TimelineBar, type TimelineEdit } from '@eightkk/vue-weave'

const props = defineProps<{ initialBars: TimelineBar[]; rows: { id: string; label: string }[]; range: { start: number; end: number } }>()
const history = useEditHistory(props.initialBars)

function commit(change: TimelineEdit) {
  history.commit(history.state.value.map(bar => bar.id === change.id ? { ...bar, ...change.after } : bar))
}
</script>

<template>
  <button :disabled="!history.canUndo.value" @click="history.undo()">元に戻す</button>
  <button :disabled="!history.canRedo.value" @click="history.redo()">やり直す</button>
  <GanttChart :rows="rows" :bars="history.state.value" :range="range" @edit="commit" />
</template>
```

グラフとガントチャートの連動選択:

```ts
import { useLinkedSelection, type ViewBinding, type ViewTargetEvent } from '@eightkk/vue-weave'

const bindings: ViewBinding[] = bars.flatMap(bar => [
  { entity: { kind: 'task', id: bar.id }, target: { view: 'graph', kind: 'node', id: bar.id } },
  { entity: { kind: 'task', id: bar.id }, target: { view: 'timeline', kind: 'bar', id: bar.id } },
])
const linked = useLinkedSelection({ bindings })
const activate = (event: ViewTargetEvent) => linked.select(event.target.view, [event.target])
// <NetworkGraph :selected-ids="linked.graph.value.selectedNodeIds" @target-activate="activate" ... />
```

**例:** [連動ビュー](/ja/examples/linked-views/)、[ツリーグリッド](/ja/examples/tree-grid/)。**ガイド:** [データ、保存、連動ビュー](./guides/data.md)。**型:** [`useEditHistory`](/api/reference/vue-weave/functions/useEditHistory.md)、[`useEditTransaction`](/api/reference/vue-weave/functions/useEditTransaction.md)、[`useLinkedSelection`](/api/reference/vue-weave/functions/useLinkedSelection.md)、[`useTimelineView`](/api/reference/vue-weave/functions/useTimelineView.md)、[`useWindowedData`](/api/reference/vue-weave/functions/useWindowedData.md)、[`useAsyncGraphLayout`](/api/reference/vue-weave/functions/useAsyncGraphLayout.md)。

::: info 英語の詳細
ここから下の詳細なリファレンスは英語です。
:::

<!--@include: ../../../docs/api.md#undo-redo-->
