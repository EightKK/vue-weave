<script setup lang="ts">
// The live demo of the home page: one small plan as a NetworkGraph and a controlled GanttChart. Selecting a task in
// either view selects it in the other, and a bar edit is a proposal that this component applies.
import { computed, onMounted, ref } from 'vue'
import { GanttChart, NetworkGraph, type GraphEdge, type NetworkNode, type TimeRange, type TimelineBar, type TimelineEdit } from '../../../../src'
import { useMountedDark, useSiteLocale } from '../i18n'

const { locale } = useSiteLocale()
const isDark = useMountedDark()
const hour = 3_600_000
const start = Date.UTC(2026, 10, 9, 8)
const range = { start, end: start + 9 * hour }

const tasks = [
  { id: 'design', en: 'Design', ja: '設計', tone: 'violet', from: 0, to: 2 },
  { id: 'build', en: 'Build', ja: '製作', tone: 'blue', from: 2, to: 5 },
  { id: 'docs', en: 'Docs', ja: '文書', tone: 'teal', from: 2, to: 4 },
  { id: 'test', en: 'Test', ja: '試験', tone: 'amber', from: 5, to: 7 },
  { id: 'release', en: 'Release', ja: 'リリース', tone: 'teal', from: 8, to: 8 },
] as const
const links = [['design', 'build'], ['design', 'docs'], ['build', 'test'], ['docs', 'release'], ['test', 'release']] as const

const times = ref(new Map<string, TimeRange>(tasks.map(task => [task.id, { start: start + task.from * hour, end: start + task.to * hour }])))
const selected = ref<string | undefined>('build')
const label = (task: (typeof tasks)[number]) => task[locale.value]

const nodes = computed<NetworkNode[]>(() => tasks.map(task => ({ id: task.id, label: label(task), tone: task.tone })))
const edges: GraphEdge[] = links.map(([from, to]) => ({ id: from + '-' + to, from, to }))
const rows = computed(() => [{ id: 'plan', label: locale.value === 'ja' ? '計画' : 'Plan' }, { id: 'docs', label: locale.value === 'ja' ? '文書' : 'Docs' }])
const bars = computed<TimelineBar[]>(() => tasks.map(task => ({
  id: task.id, rowId: task.id === 'docs' ? 'docs' : 'plan', label: label(task), tone: task.tone, editable: true, ...times.value.get(task.id)!,
})))
const dependencies = links.map(([from, to]) => ({ id: from + '-' + to, from, to }))
const selectedIds = computed(() => new Set(selected.value ? [selected.value] : []))

// Set after hydration; the browser tests wait for it before they interact.
const ready = ref(false)
onMounted(() => { ready.value = true })

function commit(change: TimelineEdit) {
  times.value = new Map(times.value).set(change.id, change.after)
  selected.value = change.id
}
</script>

<template>
  <div class="vw-site-home-demo" :class="{ 'vw-theme-dark': isDark }" :data-ready="ready || undefined">
    <NetworkGraph v-model:selected-id="selected" :nodes="nodes" :edges="edges" :options="{ direction: 'LR', nodeWidth: 120, nodeHeight: 48 }" :height="230"
      :labels="{ region: locale === 'ja' ? '工程のネットワークグラフ' : 'Plan network graph' }" />
    <GanttChart :rows="rows" :bars="bars" :range="range" :dependencies="dependencies" :selected-ids="selectedIds" :pixels-per-unit="50 / hour"
      :height="190" :row-height="56" :labels="{ region: locale === 'ja' ? '工程のガントチャート' : 'Plan Gantt chart' }"
      @select="id => selected = id" @edit="commit" />
  </div>
</template>
