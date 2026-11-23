---
title: タイムラインと時間軸
description: 時間軸、区間編集の補助関数、行ツリーとサマリー、型付きフィールドとタイムラインビュー。
---

# タイムラインと時間軸

タイムラインの補助関数は GanttChart の計算の土台です。逆変換できる時間軸(`createTimeScale`、非稼働時間を圧縮する `createWorkingTimeScale`)、安定した目盛り、スナップ付きの区間編集(`editTimeRange`)、サマリーを集計する行ツリー、列とセルエディターのための型付きフィールド定義、元のデータを変えずに行を検索・並べ替え・絞り込みするタイムラインビュー(`projectTimelineView`、`useTimelineView`)があります。

区間は半開区間 `[start, end)` で、単位は自由に選べます(標準はミリ秒)。どの時間軸も逆変換でき、`toTime(toX(t))` は `t` に戻るので、ピクセル位置と時刻を双方向に変換できます。

## 最小の例

```ts
import { createTimeScale, editTimeRange } from '@eightkk/vue-weave/core'

const hour = 3_600_000
const range = { start: 0, end: 24 * hour }
const scale = createTimeScale(range, 80 / hour) // 1 時間 80 ピクセル
scale.toX(2 * hour) // 160
scale.toTime(160) // 7_200_000

// バーを 50 分動かし、15 分単位にスナップし、範囲内に収める
const moved = editTimeRange({ start: hour, end: 3 * hour }, 'move', 50 * 60_000, 15 * 60_000, range)
```

**例:** [スケジューリング](/ja/examples/scheduling/)、[建設工程](/ja/showcase/construction/)。**ガイド:** [別の時間軸](../guides/data.md#alternative-time-scales)。**型:** [`TimeScale`](/ja/api/reference/core/interfaces/TimeScale.md)、[`createTimeScale`](/ja/api/reference/core/functions/createTimeScale.md)、[`editTimeRange`](/ja/api/reference/core/functions/editTimeRange.md)、[`useTimelineView`](/ja/api/reference/vue-weave/functions/useTimelineView.md)。

::: info 英語の詳細
ここから下の詳細なリファレンスは英語です。
:::

<!--@include: ../../../../docs/api.md#timeline-editing-helpers-->

<!--@include: ../../../../docs/api.md#row-trees-->

<!--@include: ../../../../docs/api.md#timeline-views-->
