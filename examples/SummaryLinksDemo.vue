<script setup lang="ts">
import { computed, ref, shallowRef } from 'vue'
import {
  GanttChart, scheduleTasks, scheduledBarFields, type ScheduleLink, type ScheduleResult, type ScheduleTask, type TimelineBar,
  type TimelineConnection, type TimelineEdit, type TimelineReconnect, type TimelineRow,
} from '../src'
import { formatTime, hour, origin } from './data'
import { download } from './download'
import DemoPanel from './components/DemoPanel.vue'
import StatusLine from './components/StatusLine.vue'
import { unusedNumber } from './ids'
import { useDemoLocale } from './i18n'

const { t, labels: componentLabels } = useDemoLocale()

// Opt-in example of GanttChart `summaryDependencies`: links into and out of a summary task are drawn to the edges of its
// rollup bar. The plan uses `ScheduleTask.parentId`, so the scheduler and the chart read the same links unchanged.
const range = { start: origin, end: origin + 12 * hour }
const rows: TimelineRow[] = [
  { id: 'design', label: t({ en: 'Design review', ja: '設計レビュー' }) },
  { id: 'build', label: t({ en: 'Build phase', ja: '製作フェーズ' }) },
  { id: 'frame', label: t({ en: 'Frame', ja: 'フレーム' }), parentId: 'build' },
  { id: 'wiring', label: t({ en: 'Wiring', ja: '配線' }), parentId: 'build' },
  { id: 'inspect', label: t({ en: 'Final inspection', ja: '最終検査' }) },
]
const labels = new Map(rows.map(row => [row.id, row.label]))
const summaryIds = new Set(rows.flatMap(row => row.parentId === undefined ? [] : [row.parentId]))
const initialTasks: ScheduleTask[] = [
  { id: 'design', duration: 2 * hour },
  { id: 'build', duration: 0 },
  { id: 'frame', duration: 3 * hour, parentId: 'build' },
  { id: 'wiring', duration: hour, parentId: 'build' },
  { id: 'inspect', duration: hour },
]
const initialLinks: ScheduleLink[] = [
  { id: 'design-build', from: 'design', to: 'build', type: 'FS' },
  { id: 'build-inspect', from: 'build', to: 'inspect', type: 'FS' },
]

/** Schedule a proposal; an Error (such as an FF link into a summary) or a failed result is returned as a reason. */
function plan(tasks: readonly ScheduleTask[], links: readonly ScheduleLink[]): ScheduleResult | string {
  try {
    const result = scheduleTasks({ range, quantum: 15 * 60_000, tasks, dependencies: links })
    return result.ok ? result : result.code === 'cycle' ? t({ en: 'This link would create a cycle.', ja: 'このリンクは循環を生みます。' }) : t({ en: 'The plan no longer fits the horizon.', ja: '計画が計画期間に収まらなくなります。' })
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
}
type Model = { tasks: readonly ScheduleTask[]; links: readonly ScheduleLink[]; plan: ScheduleResult & { ok: true } }
const model = shallowRef<Model>({ tasks: initialTasks, links: initialLinks, plan: plan(initialTasks, initialLinks) as Model['plan'] })
const selectedDependency = ref<string>()
const chart = ref<InstanceType<typeof GanttChart>>()
const notice = ref(t({ en: 'Links end at the Build phase rollup bar. Drag a link handle onto the rollup bar to add one; Frame and Wiring move it.', ja: 'リンクは製作フェーズの集計バーで終わります。リンクのハンドルを集計バーへドラッグすると追加でき、フレームと配線が集計バーを動かします。' }))

const bars = computed<TimelineBar[]>(() => model.value.plan.tasks.filter(task => !task.summary).map(task => ({
  id: task.id, rowId: task.id, label: labels.get(task.id)!, editable: true, ...scheduledBarFields(task),
})))
const critical = computed(() => new Set(model.value.plan.criticalDependencyIds))
const name = (id: string) => labels.get(id) ?? id

function accept(tasks: readonly ScheduleTask[], links: readonly ScheduleLink[], message: string) {
  const result = plan(tasks, links)
  if (typeof result === 'string' || !result.ok) return
  model.value = { tasks, links, plan: result }
  notice.value = message
}
// FF and SF links cannot end at a summary task: the scheduler throws for them, so they are rejected before they are proposed.
function validateConnection(connection: TimelineConnection, replacing?: string) {
  if (summaryIds.has(connection.to) && (connection.type === 'FF' || connection.type === 'SF')) {
    return t({
      en: `A ${connection.type} link cannot end at the summary ${name(connection.to)}. Link to the subtask that should finish instead.`,
      ja: `${connection.type} リンクは集計タスク ${name(connection.to)} で終われません。代わりに、終わるべきサブタスクにつないでください。`,
    })
  }
  if (model.value.links.some(link => link.id !== replacing && link.from === connection.from && link.to === connection.to)) return t({ en: 'These tasks are already linked.', ja: 'これらのタスクはすでにつながっています。' })
  const links = replacing ? model.value.links.map(link => link.id === replacing ? { ...link, ...connection } : link) : [...model.value.links, { id: 'new', ...connection }]
  const result = plan(model.value.tasks, links)
  return typeof result === 'string' ? result : undefined
}
function connect(connection: TimelineConnection) {
  const number = unusedNumber(model.value.links, 'link-', model.value.links.length + 1)
  accept(model.value.tasks, [...model.value.links, { id: 'link-' + number, ...connection }],
    t({ en: `Added ${connection.type} link from ${name(connection.from)} to ${name(connection.to)}.`, ja: `${name(connection.from)} から ${name(connection.to)} への ${connection.type} リンクを追加しました。` }))
}
function reconnect(change: TimelineReconnect) {
  accept(model.value.tasks, model.value.links.map(link => link.id === change.id ? { ...link, ...change.after } : link),
    t({ en: `Reconnected ${name(change.after.from)} → ${name(change.after.to)} ${change.after.type}.`, ja: `${name(change.after.from)} → ${name(change.after.to)} ${change.after.type} につなぎ替えました。` }))
}
function removeLink(id: string) {
  selectedDependency.value = undefined
  accept(model.value.tasks, model.value.links.filter(link => link.id !== id), t({ en: 'Deleted link ' + id + '.', ja: 'リンク ' + id + ' を削除しました。' }))
}
// Moving a subtask requests a new start; the plan is recalculated and the rollup bar and its links follow.
function moved(change: TimelineEdit) {
  return model.value.tasks.map(task => task.id === change.id ? { ...task, startNoEarlierThan: change.after.start } : task)
}
function validateEdit(change: TimelineEdit) {
  if (change.mode !== 'move') return t({ en: 'Move a task to change its requested start.', ja: 'タスクを動かして希望開始日を変えてください。' })
  const result = plan(moved(change), model.value.links)
  return typeof result === 'string' ? result : undefined
}
function edit(change: TimelineEdit) {
  accept(moved(change), model.value.links, t({ en: `${name(change.id)} requested from ${formatTime(change.after.start)}.`, ja: `${name(change.id)} の開始を ${formatTime(change.after.start)} 以降に指定しました。` }))
  const build = model.value.plan.tasks.find(task => task.id === 'build')
  if (build) notice.value += t({ en: ` Build phase ${formatTime(build.start)}–${formatTime(build.end)}.`, ja: `製作フェーズ ${formatTime(build.start)}–${formatTime(build.end)}。` })
}
function reset() {
  model.value = { tasks: initialTasks, links: initialLinks, plan: plan(initialTasks, initialLinks) as Model['plan'] }
  selectedDependency.value = undefined
  notice.value = t({ en: 'Summary link example reset.', ja: '集計リンクの例を初期状態に戻しました。' })
}
function exportLinks() {
  const svg = chart.value?.exportSvg({ title: t({ en: 'Summary task links', ja: '集計タスクのリンク' }), rowHeading: t({ en: 'Task', ja: 'タスク' }) })
  if (!svg) return
  download(svg, 'summary-links.svg')
  const lines = svg.match(/<path d="[^"]+" fill="none" stroke="[^"]+" stroke-width="[^"]+" marker-end=/g)?.length ?? 0
  notice.value = t({ en: `Exported summary links SVG with ${lines} dependency lines.`, ja: `依存関係の線 ${lines} 本を含む SVG を出力しました。` })
}
</script>

<template>
  <DemoPanel title-id="summary-links-title" :title="t({ en: 'Summary task links', ja: '集計タスクのリンク' })" :subtitle="t({ en: 'summaryDependencies · links drawn to the rollup bar of a summary task · UTC', ja: 'summaryDependencies · 集計タスクの集計バーへ描くリンク · UTC' })">
    <template #options>
      <button type="button" @click="exportLinks">{{ t({ en: 'Export summary links SVG', ja: '集計リンクを SVG で出力' }) }}</button>
      <button type="button" @click="reset">{{ t({ en: 'Reset summary links', ja: '集計リンクをリセット' }) }}</button>
    </template>
    <GanttChart ref="chart" :rows="rows" :bars="bars" :range="range" :dependencies="model.links" :format-time="formatTime"
      :pixels-per-unit="70 / hour" :tick-steps="[hour, 2 * hour]" :row-height="52" :height="330" :snap="15 * 60_000"
      show-summaries summary-dependencies connectable reconnectable :highlighted-dependency-ids="critical"
      v-model:selected-dependency-id="selectedDependency" :labels="{ ...componentLabels.gantt, region: t({ en: 'Summary task links timeline', ja: '集計タスクのリンクのタイムライン' }) }"
      :validate-connection="validateConnection" :validate-edit="validateEdit"
      @connect="connect" @reconnect="reconnect" @dependency-delete="removeLink" @edit="edit"
      @connect-rejected="(_connection, reason) => notice = reason" @edit-rejected="(_change, reason) => notice = reason"
      @dependency-select="id => notice = t({ en: 'Selected link ' + id + '. Press Delete to remove it.', ja: 'リンク ' + id + ' を選択しました。Delete で削除します。' })">
      <template #row-heading>{{ t({ en: 'Task', ja: 'タスク' }) }}</template>
      <template #legend><span class="hint">{{ t({ en: 'Amber links are critical. FF and SF links into the summary are rejected, as the scheduler rejects them.', ja: '琥珀色のリンクはクリティカルです。集計タスクに入る FF と SF のリンクは、スケジューラーと同じく却下します。' }) }}</span></template>
    </GanttChart>
    <StatusLine>{{ notice }}</StatusLine>
  </DemoPanel>
</template>
