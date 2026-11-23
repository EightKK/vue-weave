---
title: GanttChart
description: GanttChart コンポーネントのプロップ、イベント、スロット、公開メソッド。
---

# GanttChart {#top}

`GanttChart` は制御されたガントチャートとタイムラインです。時間軸上の行とバー、ラグ付きの FS・SS・FF・SF 依存関係、サマリーを集計する行グループ、ベースライン、列、リソース負荷のヒストグラム、ステータス日と進捗線、スプレッドシート編集を備えています。生産計画、プロジェクトの日程、設備のタイムラインなど、半開区間 `[start, end)` で表せるものに使います。単位は自由に選べ(標準はミリ秒)、長さ 0 のバーはマイルストーンです。

`rows` や `bars` を自分で変更することはありません。ドラッグやキーボードの編集はプレビューされたあと `edit` の提案として emit され、`validateEdit` で同期的に拒否できます。操作の途中でデータが変わると、その操作はキャンセルされます。チャートは渡されたものを描くだけなので、日付の計算には [`scheduleTasks`](../core/scheduling.md) を使い、その結果を渡します。

## 最小の例

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { GanttChart, type TimelineBar, type TimelineEdit } from '@eightkk/vue-weave'
import '@eightkk/vue-weave/style.css'

const start = Date.parse('2026-11-09T08:00:00Z')
const hour = 3_600_000
const range = { start, end: start + 8 * hour }
const rows = [{ id: 'team', label: '開発チーム' }]
const bars = ref<TimelineBar[]>([
  { id: 'build', rowId: 'team', label: '製作', start: start + hour, end: start + 3 * hour, editable: true, progress: 0.4 },
])

function commit(change: TimelineEdit) {
  bars.value = bars.value.map(bar => bar.id === change.id ? { ...bar, ...change.after } : bar)
}
</script>

<template>
  <GanttChart :rows="rows" :bars="bars" :range="range" @edit="commit" />
</template>
```

**例:** [スケジューリング](/ja/examples/scheduling/)、[連動ビュー](/ja/examples/linked-views/)、[建設工程](/ja/showcase/construction/)、[例の一覧](/ja/examples/)。**ガイド:** [スケジューリング](../guides/scheduling.md)、[データ、保存、連動ビュー](../guides/data.md)。**型:** [`TimelineRow`](/ja/api/reference/core/interfaces/TimelineRow.md)、[`TimelineBar`](/ja/api/reference/core/interfaces/TimelineBar.md)、[`TimelineEdit`](/ja/api/reference/core/interfaces/TimelineEdit.md)、[`GanttChartExposed`](/ja/api/reference/vue-weave/type-aliases/GanttChartExposed.md)。時間軸と編集の補助関数は[タイムラインと時間軸](../core/timeline.md)にあります。

::: info 英語の詳細
ここから下の詳細なリファレンスは英語です。
:::

<!--@include: ../../../../docs/api.md#gantt-chart-->
