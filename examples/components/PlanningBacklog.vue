<script setup lang="ts">
import { computed, ref } from 'vue'
import { BACKLOG_MIME, type BacklogItem, type PlaceRequest } from './types'
import { useDemoLocale } from '../i18n'

// Reference list of unplanned tasks (spec D1: examples only). Pointer users drag an item onto the chart; keyboard users
// choose "Place", a row and a start time. Both end in the same `place` request that the parent validates.
const props = defineProps<{
  items: readonly BacklogItem[]
  rows: readonly { id: string; label: string }[]
  times: readonly { value: number; label: string }[]
}>()
const emit = defineEmits<{ place: [request: PlaceRequest] }>()

const { t } = useDemoLocale()
const search = ref('')
const opened = ref<string>()
const rowChoice = ref('')
const timeChoice = ref<number>()
const shown = computed(() => {
  const text = search.value.trim().toLowerCase()
  return props.items.filter(item => !text || (item.label + ' ' + (item.detail ?? '')).toLowerCase().includes(text))
})
function open(item: BacklogItem) {
  if (opened.value === item.id) { opened.value = undefined; return }
  opened.value = item.id
  rowChoice.value = props.rows[0]?.id ?? ''
  timeChoice.value = props.times[0]?.value
}
function confirm(item: BacklogItem) {
  if (timeChoice.value === undefined || !rowChoice.value) return
  emit('place', { taskId: item.id, resourceId: rowChoice.value, time: timeChoice.value })
  opened.value = undefined
}
function dragStart(event: DragEvent, item: BacklogItem) {
  event.dataTransfer?.setData(BACKLOG_MIME, item.id)
  event.dataTransfer?.setData('text/plain', item.label)
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'copy'
}
</script>

<template>
  <section class="backlog" aria-labelledby="backlog-title">
    <h3 id="backlog-title">{{ t({ en: 'Unplanned tasks', ja: '未計画のタスク' }) }}</h3>
    <label class="search">{{ t({ en: 'Search unplanned tasks', ja: '未計画のタスクを検索' }) }} <input v-model="search" type="search"></label>
    <ul :aria-label="t({ en: 'Unplanned task list', ja: '未計画のタスクの一覧' })">
      <li v-for="item in shown" :key="item.id" draggable="true" @dragstart="dragStart($event, item)">
        <div class="head">
          <span><strong>{{ item.label }}</strong><small v-if="item.detail"> · {{ item.detail }}</small></span>
          <button type="button" :aria-expanded="opened === item.id" @click="open(item)">{{ t({ en: `Place ${item.label}`, ja: `${item.label} を配置` }) }}</button>
        </div>
        <fieldset v-if="opened === item.id" class="place">
          <legend>{{ t({ en: `Placement of ${item.label}`, ja: `${item.label} の配置` }) }}</legend>
          <label>{{ t({ en: `Row for ${item.label}`, ja: `${item.label} の行` }) }}
            <select v-model="rowChoice" :aria-label="t({ en: 'Row for ' + item.label, ja: item.label + ' の行' })"><option v-for="row in rows" :key="row.id" :value="row.id">{{ row.label }}</option></select>
          </label>
          <label>{{ t({ en: `Start for ${item.label}`, ja: `${item.label} の開始` }) }}
            <select v-model.number="timeChoice" :aria-label="t({ en: 'Start for ' + item.label, ja: item.label + ' の開始' })"><option v-for="time in times" :key="time.value" :value="time.value">{{ time.label }}</option></select>
          </label>
          <button type="button" @click="confirm(item)">{{ t({ en: `Confirm placement of ${item.label}`, ja: `${item.label} の配置を確定` }) }}</button>
        </fieldset>
      </li>
    </ul>
    <p v-if="!shown.length" class="empty">{{ items.length ? t({ en: 'No unplanned task matches the search.', ja: '検索に一致する未計画のタスクはありません。' }) : t({ en: 'Every task is placed.', ja: 'すべてのタスクを配置済みです。' }) }}</p>
    <p class="hint">{{ t({ en: 'Drag an item onto a resource row, or use Place.', ja: '項目をリソースの行へドラッグするか、「配置」を使ってください。' }) }}</p>
  </section>
</template>

<style scoped>
.backlog { border: 1px solid var(--vw-border, #d9e4ec); border-radius: 8px; padding: 10px; margin: 0; font-size: 12px; }
.backlog h3 { margin: 0 0 6px; font-size: 14px; }
.search { display: flex; flex-direction: column; align-items: flex-start; gap: 3px; margin-bottom: 6px; }
.search input { width: 100%; }
ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
li { border: 1px dashed var(--vw-border, #b7cad7); border-radius: 6px; padding: 6px 8px; cursor: grab; background: var(--vw-surface-muted, #f6f9fb); }
.head { display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap; }
.place { display: grid; gap: 6px; margin: 8px 0 0; border: 1px solid var(--vw-border, #c6d7e2); border-radius: 6px; }
.place label { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; }
.hint, .empty { color: var(--vw-muted, #4f6574); margin: 6px 0 0; }
</style>
