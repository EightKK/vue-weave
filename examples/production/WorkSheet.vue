<script setup lang="ts">
import { computed } from 'vue'
import { GanttChart, useEditHistory, type TimelineColumn, type TimelineFieldEdit, type TimelineSheetEdit } from '../../src'

const props = defineProps<{ ja: boolean }>()
const t = (ja: string, en: string) => props.ja ? ja : en
interface Work { id: string; team: string; start: number; hours: number }
const names = [['材料準備', 'Preparation'], ['切断', 'Cutting'], ['穴あけ', 'Drilling'], ['仕上げ', 'Finishing'], ['検査', 'Inspection']]
const history = useEditHistory<Work[]>(names.map((_, i) => ({ id: String(i), team: i < 3 ? 'A' : 'B', start: 8 + i * 2, hours: 2 })))
const rows = computed(() => history.state.value.map((item, i) => ({ ...item, label: names[i]![props.ja ? 0 : 1]! })))
type Row = typeof rows.value[number]
const columns = computed<TimelineColumn<Row>[]>(() => [
  { id: 'team', label: t('班', 'Team'), width: 75, editable: true, value: r => r.team,
    field: { id: 'team', kind: 'text', required: true, get: r => r.team } },
  ...(['start', 'hours'] as const).map(id => ({
    id, label: id === 'start' ? t('開始時', 'Start hour') : t('所要時間', 'Hours'), width: 90, editable: true, value: (r: Row) => r[id],
    field: { id, kind: 'number' as const, min: id === 'start' ? 0 : 1, max: id === 'start' ? 23 : 24, integer: true, required: true, get: (r: Row) => r[id] },
  })),
])
const bars = computed(() => rows.value.map(r => ({ id: r.id, rowId: r.id, label: r.label, start: r.start, end: r.start + r.hours })))
const range = computed(() => ({ start: 0, end: Math.max(24, ...bars.value.map(b => b.end)) }))
function apply(edits: TimelineFieldEdit<Row>[]) {
  const byId = new Map(history.state.value.map(r => [r.id, r]))
  for (const e of edits) byId.set(e.rowId, { ...byId.get(e.rowId)!, [e.fieldId]: e.after })
  history.commit([...byId.values()])
}
function applySheet(edit: TimelineSheetEdit<Row>) { apply(edit.fieldEdits) }
</script>

<template>
  <div class="production-title"><div><h1>{{ t('工程表', 'Schedule sheet') }}</h1>
    <p>{{ t('班・開始時・所要時間を書き換えると、右のガントに反映されます。', 'Edit the team, start hour or duration. The Gantt bars follow your changes.') }}</p></div>
    <div class="production-actions"><button :disabled="!history.canUndo.value" @click="history.undo">{{ t('元に戻す', 'Undo') }}</button>
      <button :disabled="!history.canRedo.value" @click="history.redo">{{ t('やり直す', 'Redo') }}</button></div></div>
  <section class="production-panel"><div class="production-heading"><h2>{{ t('本日の作業', 'Daily operations') }}</h2></div>
    <GanttChart spreadsheet :rows="rows" :columns="columns" :bars="bars" :range="range" :pixels-per-unit="36"
      :tick-steps="[1, 2, 4, 8]" :format-time="h => h + ':00'" :height="300" :row-height="44"
      @field-edit="apply([$event])" @sheet-edit="applySheet" />
    <p class="production-caption">{{ t('セルをダブルクリックして編集。Shift＋クリックまたはShift＋矢印キーで範囲選択。Ctrl / ⌘＋C・Vでコピー・貼り付け、Ctrl / ⌘＋Dで先頭行の値を下にコピーできます。選択範囲の右下を下方向にドラッグしてもコピーできます。', 'Double-click to edit. Shift-click or Shift-arrow to select a range. Ctrl / ⌘ + C or V copies or pastes; Ctrl / ⌘ + D fills down from the first row. You can also drag the bottom-right handle down.') }}</p>
  </section>
</template>
