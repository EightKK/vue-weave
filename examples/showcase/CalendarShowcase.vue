<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  GanttChart, calendarZoomPresets, intlTimeFormatter, type CalendarZoomLevel, type TimelineBar, type TimelineEdit,
  type TimelineMarkerRange, type TimelineRow,
} from '../../src'
import { day } from '../data'
import { useDemoLocale } from '../i18n'

const { t, labels, isJapanese } = useDemoLocale()

// Ready-made calendar zoom levels (`calendarZoomPresets`) in an IANA time zone and a chosen locale, with highlighted
// time ranges (`markerRanges`): a company-wide code freeze and holidays that close one office only.
const timeZone = 'Europe/Berlin'
/** Local midnight in Berlin of a day in summer 2026 (CEST, UTC+2), so the data never depends on the local clock or zone. */
const on = (month: number, date: number) => Date.parse(`2026-${String(month).padStart(2, '0')}-${String(date).padStart(2, '0')}T00:00:00+02:00`)
const range = { start: on(4, 6), end: on(8, 31) }
const locales = [
  { id: 'en-GB', label: 'English (UK)' },
  { id: 'de-DE', label: 'Deutsch' },
  { id: 'ja-JP', label: '日本語' },
] as const
const levelLabels: Record<string, Partial<Record<CalendarZoomLevel, string>>> = {
  'en-GB': {},
  'de-DE': { days: 'Tage', weeks: 'Wochen', months: 'Monate', quarters: 'Quartale' },
  'ja-JP': { days: '日', weeks: '週', months: '月', quarters: '四半期' },
}

const rows: TimelineRow[] = [
  { id: 'berlin', label: t({ en: 'Platform', ja: 'プラットフォーム' }), detail: t({ en: 'Berlin', ja: 'ベルリン' }) },
  { id: 'tokyo', label: t({ en: 'Mobile', ja: 'モバイル' }), detail: t({ en: 'Tokyo', ja: '東京' }) },
  { id: 'lisbon', label: t({ en: 'Web', ja: 'Web' }), detail: t({ en: 'Lisbon', ja: 'リスボン' }) },
]
const bars = ref<TimelineBar[]>([
  { id: 'api', rowId: 'berlin', label: 'API v2', start: on(4, 13), end: on(5, 15), tone: 'blue', editable: true },
  { id: 'release', rowId: 'berlin', label: t({ en: 'Release 2.0', ja: 'リリース 2.0' }), start: on(6, 1), end: on(6, 1), tone: 'blue' },
  { id: 'offline', rowId: 'tokyo', label: t({ en: 'Offline mode', ja: 'オフラインモード' }), start: on(4, 20), end: on(6, 12), tone: 'teal', editable: true },
  { id: 'redesign', rowId: 'lisbon', label: t({ en: 'Redesign', ja: 'リデザイン' }), start: on(5, 4), end: on(6, 26), tone: 'violet', editable: true },
  { id: 'launch', rowId: 'lisbon', label: t({ en: 'Summer launch', ja: '夏のローンチ' }), start: on(7, 6), end: on(7, 31), tone: 'violet', editable: true },
])
const markerRanges: TimelineMarkerRange[] = [
  { id: 'golden-week', start: on(4, 29), end: on(5, 7), label: t({ en: 'Golden Week', ja: 'ゴールデンウィーク' }), tone: 'teal', rowIds: ['tokyo'] },
  // The labels of all ranges share one strip in the time header, so the office holidays do not overlap Golden Week or
  // the code freeze: a label drawn over another one would cut both.
  { id: 'ascension', start: on(5, 14), end: on(5, 16), label: t({ en: 'Ascension Day', ja: 'キリスト昇天祭' }), tone: 'violet', rowIds: ['berlin'] },
  { id: 'corpus-christi', start: on(6, 4), end: on(6, 5), label: t({ en: 'Corpus Christi', ja: '聖体祭' }), tone: 'violet', rowIds: ['lisbon'] },
  { id: 'freeze', start: on(5, 18), end: on(6, 1), label: t({ en: 'Code freeze', ja: 'コードフリーズ' }) },
  { id: 'shutdown', start: on(8, 10), end: on(8, 24), label: t({ en: 'Summer shutdown', ja: '夏季休業' }), tone: 'blue' },
]

// A Japanese page starts in Japanese; the select still offers every locale.
const locale = ref<string>(isJapanese.value ? 'ja-JP' : 'en-GB')
const level = ref<string>('weeks')
const presets = computed(() => calendarZoomPresets(range, {
  locale: locale.value, timeZone, levels: ['days', 'weeks', 'months', 'quarters'], labels: levelLabels[locale.value],
}))
const active = computed(() => presets.value.find(preset => preset.id === level.value) ?? presets.value[1]!)
// A long date for the status line, from the same cached Intl formatters.
const longDate = computed(() => intlTimeFormatter({ locale: locale.value, timeZone, format: { dateStyle: 'full' } }))
const status = ref(t({
  en: 'Pick a zoom level or a language. Arrow keys move a focused bar by one snap step.',
  ja: '表示単位か言語を選んでください。矢印キーでフォーカス中のバーを1スナップ分動かせます。',
}))

function describe(bar: TimelineBar) {
  return `${bar.label}: ${longDate.value(bar.start)} – ${longDate.value(bar.end)}`
}
function onEdit(change: TimelineEdit) {
  bars.value = bars.value.map(bar => bar.id === change.id ? { ...bar, ...change.after } : bar)
  const bar = bars.value.find(entry => entry.id === change.id)
  if (bar) status.value = t({ en: 'Moved ' + describe(bar), ja: describe(bar) + ' に移動しました' })
}
function onSelect(id: string) {
  const bar = bars.value.find(entry => entry.id === id)
  if (bar) status.value = describe(bar)
}
</script>

<template>
  <section class="showcase sc-calendar" aria-labelledby="sc-calendar-title">
    <h2 id="sc-calendar-title">{{ t({ en: 'Calendar views', ja: 'カレンダー表示' }) }}</h2>
    <p v-if="isJapanese" class="sc-calendar-intro">
      <code>calendarZoomPresets</code> による日・週・月・四半期の表示を {{ timeZone }} で切り替え、選んだ言語で表示します。
      <code>markerRanges</code> で全社のコードフリーズと、一部の拠点だけが休みになる祝日を強調表示します。
    </p>
    <p v-else class="sc-calendar-intro">
      Day, week, month and quarter levels from <code>calendarZoomPresets</code> in {{ timeZone }}, labelled in the chosen
      language, with highlighted ranges from <code>markerRanges</code>: a company-wide code freeze and holidays that close
      single offices.
    </p>
    <GanttChart
      :rows="rows" :bars="bars" :range="range" :zoom-presets="presets" :zoom-preset="active.id" :format-time="active.formatTime"
      :marker-ranges="markerRanges" :row-height="48" :height="260" :labels="{ ...labels.gantt, region: t({ en: 'Calendar views timeline', ja: 'カレンダー表示のタイムライン' }), rows: t({ en: 'Teams', ja: 'チーム' }) }"
      sticky-band-labels @update:zoom-preset="level = $event" @edit="onEdit" @select="onSelect"
    >
      <template #legend>
        <label class="sc-calendar-locale">{{ t({ en: 'Language', ja: '言語' }) }}
          <select v-model="locale"><option v-for="item in locales" :key="item.id" :value="item.id">{{ item.label }}</option></select>
        </label>
      </template>
    </GanttChart>
    <p class="sc-calendar-status" role="status">{{ status }}</p>
  </section>
</template>

<style>
.sc-calendar {
  padding: 24px 24px 18px;
  border: 1px solid #e3e8ee;
  border-radius: 14px;
  background: #fff;
  color: #1c2733;
  font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
}
.sc-calendar h2 { margin: 0 0 6px; font-size: 20px; font-weight: 650; }
.sc-calendar-intro { max-width: 760px; margin: 0 0 16px; color: #556270; font-size: 13px; line-height: 1.55; }
.sc-calendar-status { min-height: 18px; margin: 12px 2px 0; color: #3e4b58; font-size: 12.5px; }
.sc-calendar-locale { display: inline-flex; align-items: center; gap: 8px; font-size: 12px; font-weight: 600; }
.sc-calendar .vw-gantt-toolbar { flex-wrap: wrap; gap: 8px; }
@media (max-width: 700px) {
  .sc-calendar { padding: 16px 12px 14px; }
  .sc-calendar .vw-gantt { --vw-row-label-width: 110px; }
}
</style>
