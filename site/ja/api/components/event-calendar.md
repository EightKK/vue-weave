---
title: EventCalendar
description: EventCalendar コンポーネントのプロップ、イベント、スロット、補助関数と繰り返しイベント。
---

# EventCalendar {#top}

`EventCalendar` は予定を日・週・月のビューで、IANA タイムゾーンとロケールに沿って表示します。終日行、月表示の「+N 件」、現在時刻の線、ツールバーを備えています。`resources` を渡すと、日ビューに部屋・設備・担当者ごとの列が並びます。繰り返しイベントは RFC 5545 のルールに従います(`expandRecurringEvents`、`applyRecurringEdit`)。

オプトインの制御コンポーネントです。移動、長さの変更、新しい予定は `edit` と `create` の提案になり、同期的な `validateEdit` と `validateCreate` で確認できます。`range-change` が表示範囲を知らせるので、その範囲の予定を読み込めます。時計や実行環境のタイムゾーンは読まないため、サーバーとクライアントで同じ表示になります。

## 最小の例

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { EventCalendar, type CalendarEvent, type EventCalendarEdit } from '@eightkk/vue-weave'
import '@eightkk/vue-weave/style.css'

const date = ref(Date.parse('2026-11-09T00:00:00Z'))
const events = ref<CalendarEvent[]>([
  { id: 'review', label: '設計レビュー', start: Date.parse('2026-11-10T00:00:00Z'), end: Date.parse('2026-11-10T01:30:00Z') },
])

function apply(change: EventCalendarEdit) {
  events.value = events.value.map(event => event.id === change.id ? { ...event, ...change.after } : event)
}
</script>

<template>
  <EventCalendar v-model:date="date" :events="events" time-zone="Asia/Tokyo" locale="ja-JP" @edit="apply" />
</template>
```

**例:** [イベントカレンダー](/ja/examples/event-calendar/)、[例の一覧](/ja/examples/)。**型:** [`CalendarEvent`](/ja/api/reference/core/interfaces/CalendarEvent.md)、[`EventCalendarEdit`](/ja/api/reference/core/interfaces/EventCalendarEdit.md)、[`EventCalendarExposed`](/ja/api/reference/vue-weave/type-aliases/EventCalendarExposed.md)。iCalendar の読み込みと書き出しは[インターチェンジとエクスポート](../core/interchange.md)にあります。

::: info 英語の詳細
ここから下の詳細なリファレンスは英語です。
:::

<!--@include: ../../../../docs/api.md#event-calendar-->
