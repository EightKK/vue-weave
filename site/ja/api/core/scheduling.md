---
title: スケジューリングとリソース
description: カレンダー、scheduleTasks、リソース負荷と平準化、実績、アーンドバリュー、ネットワーク図、リソース別の表示、診断、計画の比較。
---

# スケジューリングとリソース

計画を計算するのはスケジューラーで、GanttChart はそれを描くだけです。`buildWorkPeriods` は週ごとのシフトと例外日から稼働カレンダーを作り、`scheduleTasks` はカレンダーを考慮して最早・最遅の日付、フロート、クリティカルパスを計算します(FS・SS・FF・SF とラグに対応)。`levelResources` は割り当ての負荷が能力に収まるようにタスクを遅らせます。ほかに、1 つの編集の波及、ステータス日や実績からの再スケジュール、アーンドバリューの計算、PERT ネットワーク図、リソース別の表示、タスクがその時刻に始まる理由の説明、候補の計画と現在の計画の比較のための関数があります。

循環や実行不可能な計画は例外ではなく、診断付きの結果として返るので、そのままユーザーに示せます。

## 最小の例

```ts
import { buildWorkPeriods, scheduleTasks, scheduledBarFields, type TimelineBar } from '@eightkk/vue-weave/core'

const hour = 3_600_000
const start = Date.parse('2026-11-09T00:00:00Z')
const range = { start, end: start + 28 * 24 * hour }
// 月曜から金曜、日本時間の 8:00〜17:00
const weekly = [1, 2, 3, 4, 5].map(weekday => ({ weekday, startMinute: 8 * 60, endMinute: 17 * 60 }))
const periods = buildWorkPeriods(range, { utcOffsetMinutes: 540, weekly })

const plan = scheduleTasks({
  range,
  quantum: 60_000,
  calendars: [{ id: 'plant', periods }],
  defaultCalendarId: 'plant',
  tasks: [{ id: 'cut', duration: 6 * hour }, { id: 'weld', duration: 10 * hour }],
  dependencies: [{ id: 'cut-weld', from: 'cut', to: 'weld', type: 'FS' }],
})
const bars: TimelineBar[] = plan.ok
  ? plan.tasks.map(task => ({ id: task.id, rowId: task.id, label: task.id, ...scheduledBarFields(task) }))
  : []
```

**例:** [スケジューリング](/ja/examples/scheduling/)、[建設工程](/ja/showcase/construction/)。**ガイド:** [スケジューリング](../guides/scheduling.md)、[リソースと計画の分析](../guides/resources.md)。**型:** [`scheduleTasks`](/api/reference/core/functions/scheduleTasks.md)、[`ScheduleInput`](/api/reference/core/interfaces/ScheduleInput.md)、[`levelResources`](/api/reference/core/functions/levelResources.md)、[`computeEarnedValue`](/api/reference/core/functions/computeEarnedValue.md)。

::: info 英語の詳細
ここから下の詳細なリファレンスは英語です。
:::

<!--@include: ../../../../docs/api.md#scheduling-->

<!--@include: ../../../../docs/api.md#schedule-network-->

<!--@include: ../../../../docs/api.md#plan-analysis-->
