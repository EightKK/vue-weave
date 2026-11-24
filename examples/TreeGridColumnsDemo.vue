<script setup lang="ts">
// Opt-in header controls of TreeGrid: column resizing (`columnsResizable`), header sorting (`sortableColumns`) and
// filtering (`filterableColumns`). The grid only proposes; this parent keeps the widths, the sort and the filters, and
// shows the rows that `projectTreeGridRows` returns: siblings sorted within their parent, filtered rows with their
// ancestors. Cell edits apply to the full rows, so they survive a change of the sort or the filters.
import { computed, ref, shallowRef } from 'vue'
import {
  TreeGrid, applyTreeGridEdits, projectTreeGridRows, timelineLabelColumnId,
  type TimelineColumnResize, type TimelineViewFilter, type TimelineViewSort, type TreeGridCellEdit, type TreeGridColumn, type TreeGridRow,
} from '../src'
import DemoPanel from './components/DemoPanel.vue'
import StatusLine from './components/StatusLine.vue'
import { useDemoLocale } from './i18n'

type Row = TreeGridRow<{ owner?: string; budget?: number; spent?: number; status?: string }>

const { t, labels } = useDemoLocale()
const work = (id: string, parentId: string, label: string, owner: string, budget: number, spent: number, status: string): Row =>
  ({ id, parentId, label, data: { owner, budget, spent, status } })
const rows = shallowRef<Row[]>([
  { id: 'design', label: t({ en: 'Design', ja: '設計' }) },
  work('concept', 'design', t({ en: 'Concept', ja: '構想' }), 'Ana', 12_000, 12_400, 'done'),
  work('layout', 'design', t({ en: 'Layout', ja: 'レイアウト' }), 'Ben', 18_000, 9_500, 'active'),
  work('review', 'design', t({ en: 'Design review', ja: '設計レビュー' }), 'Chen', 4_000, 0, 'planned'),
  { id: 'build', label: t({ en: 'Build', ja: '製作' }) },
  work('frame', 'build', t({ en: 'Frame', ja: 'フレーム' }), 'Dana', 40_000, 31_000, 'active'),
  work('wiring', 'build', t({ en: 'Wiring', ja: '配線' }), 'Ben', 22_000, 2_000, 'active'),
  work('panels', 'build', t({ en: 'Panels', ja: 'パネル' }), 'Ana', 15_000, 0, 'planned'),
  { id: 'test', label: t({ en: 'Test', ja: '試験' }) },
  work('bench', 'test', t({ en: 'Bench test', ja: 'ベンチ試験' }), 'Chen', 9_000, 0, 'planned'),
  work('field', 'test', t({ en: 'Field test', ja: 'フィールド試験' }), 'Dana', 14_000, 0, 'planned'),
])
const statuses = [
  { value: 'planned', label: t({ en: 'Planned', ja: '計画' }) },
  { value: 'active', label: t({ en: 'Active', ja: '進行中' }) },
  { value: 'done', label: t({ en: 'Done', ja: '完了' }) },
]
const money = (value: unknown) => typeof value === 'number' ? value.toLocaleString('en-US') : ''
const update = (key: 'budget' | 'spent' | 'status') => (row: Row, value: unknown): Row => ({ ...row, data: { ...row.data, [key]: value ?? undefined } })
const isWork = (row: Row) => row.parentId !== undefined
const widths = ref<Record<string, number>>({ owner: 90, budget: 110, spent: 110, status: 110 })
const treeWidth = ref(200)
const columns = computed<TreeGridColumn<Row>[]>(() => [
  { id: 'owner', label: t({ en: 'Owner', ja: '担当' }), width: widths.value.owner!, value: row => row.data?.owner },
  {
    id: 'budget', label: t({ en: 'Budget', ja: '予算' }), width: widths.value.budget!, value: row => row.data?.budget,
    editor: { kind: 'number', min: 0, integer: true, format: money }, editable: isWork, update: update('budget'),
  },
  {
    id: 'spent', label: t({ en: 'Spent', ja: '実績' }), width: widths.value.spent!, value: row => row.data?.spent,
    editor: { kind: 'number', min: 0, integer: true, format: money }, editable: isWork, update: update('spent'),
  },
  {
    id: 'status', label: t({ en: 'Status', ja: '状態' }), width: widths.value.status!, value: row => row.data?.status,
    editor: { kind: 'select', required: true, choices: statuses }, editable: isWork, update: update('status'),
  },
])
const sort = ref<TimelineViewSort[]>([{ ruleId: 'budget', direction: 'desc' }])
const filters = ref<TimelineViewFilter[]>([])
const expandedIds = ref(['design', 'build', 'test'])
const status = ref(t({ en: 'Sort with the header buttons, filter with ⏷, and drag a column edge or use the arrow keys on it to resize.', ja: '見出しのボタンで並べ替え、⏷ で絞り込み、列の端をドラッグするか矢印キーで幅を変えます。' }))
const projection = computed(() => projectTreeGridRows({ rows: rows.value, columns: columns.value }, { sort: sort.value, filters: filters.value }))

function resize(change: TimelineColumnResize) {
  if (change.id === timelineLabelColumnId) treeWidth.value = change.after
  else widths.value = { ...widths.value, [change.id]: change.after }
  status.value = t({ en: `Column ${change.id}: ${change.before} → ${change.after} px.`, ja: `列 ${change.id}: ${change.before} → ${change.after} px。` })
}
function validateColumnResize(change: TimelineColumnResize) {
  return change.id !== timelineLabelColumnId || change.after >= 120 || t({ en: 'The name column needs at least 120 px.', ja: '名前の列には 120 px 以上が必要です。' })
}
function setSort(next: TimelineViewSort[]) {
  sort.value = next
  status.value = next.length
    ? t({ en: 'Sorted by ', ja: '並べ替え: ' }) + next.map(rule => `${rule.ruleId} ${rule.direction}`).join(', ')
    : t({ en: 'Not sorted.', ja: '並べ替えなし。' })
}
function setFilters(next: TimelineViewFilter[]) {
  filters.value = next
  status.value = t({ en: `${projection.value.matchedRowIds.length} matching rows.`, ja: `一致する行: ${projection.value.matchedRowIds.length} 件。` })
}
function cellEdit(change: TreeGridCellEdit) {
  rows.value = applyTreeGridEdits({ rows: rows.value, columns: columns.value }, [change]).rows
}
</script>

<template>
  <DemoPanel title-id="tree-grid-columns-title" :title="t({ en: 'Sorting, filtering and column widths', ja: '並べ替え、絞り込み、列幅' })"
    :subtitle="t({ en: 'A cost breakdown whose header sorts siblings within their parent, filters rows with their ancestors and resizes columns. The grid proposes; the page keeps the sort, the filters and the widths.', ja: '見出しで兄弟の行を親の中で並べ替え、祖先を残して行を絞り込み、列幅を変えられる費用内訳です。グリッドは提案し、並べ替え・絞り込み・列幅はページが保持します。' })">
    <TreeGrid v-model:expanded-ids="expandedIds" :rows="projection.rows" :columns="columns" :height="320" :tree-column-width="treeWidth"
      columns-resizable sortable-columns filterable-columns :sort="sort" :filters="filters" editable
      :validate-column-resize="validateColumnResize"
      :labels="{ ...labels.treeGrid, grid: t({ en: 'Cost breakdown', ja: '費用内訳' }), treeColumn: t({ en: 'Work', ja: '作業' }) }"
      @column-resize="resize" @column-resize-rejected="(_change, reason) => status = reason" @update:sort="setSort" @update:filters="setFilters"
      @cell-edit="cellEdit" />
    <StatusLine :label="t({ en: 'Column status', ja: '列の状態' })">{{ status }}</StatusLine>
  </DemoPanel>
</template>
