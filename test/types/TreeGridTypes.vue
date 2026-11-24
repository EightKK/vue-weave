<script setup lang="ts">
// Type-level tests of TreeGrid, run by `npm run typecheck` (vue-tsc). Nothing here is rendered or executed. The row
// type is inferred from `rows` and reaches the column accessors and the slots; each `@vue-expect-error` or
// `@ts-expect-error` fails the check when the line it guards compiles.
import { h, ref, useTemplateRef } from 'vue'
import {
  TreeGrid, applyTreeGridEdits, createTreeGridIndex, deleteTreeGridRows, flattenTreeGrid, insertTreeGridRow, matchTreeGridEntities,
  moveTimelineRow, projectTreeGridRows, timelineLabelColumnId, treeGridCellText,
  type TimelineColumnResize, type TimelineViewFilter, type TimelineViewSort, type TreeGridViewProjection,
  type TimelineRowMove, type TreeGridActivation, type TreeGridCell, type TreeGridCellEdit, type TreeGridColumn, type TreeGridEditCancel,
  type TreeGridExposed, type TreeGridPosition, type TreeGridRow, type TreeGridRowCreate, type TreeGridRowDelete, type TreeGridSheetEdit,
} from '../../src'
import { flattenTreeGrid as coreFlatten, type TreeGridLines } from '../../src/core'

interface Part { qty: number }
type BomRow = TreeGridRow<Part> & { revision: string }

const rows = ref<BomRow[]>([{ id: 'a', label: 'Assembly', revision: 'B', data: { qty: 1 } }])
const cells = ref<TreeGridCell[]>([{ rowId: 'a', columnId: 'w1', value: 0, status: 'none' }])
const columns: TreeGridColumn<BomRow>[] = [
  { id: 'qty', label: 'Qty', width: 60, value: row => row.data?.qty, editor: { kind: 'number' }, update: (row, value) => ({ ...row, data: { qty: Number(value) } }) },
  { id: 'rev', label: 'Revision', width: 60, value: row => ({ value: row.revision, entities: [{ kind: 'revision', id: row.revision }] }), editable: row => row.revision !== 'A' },
  { id: 'w1', label: 'W1', width: 50, missingCell: 'unknown' },
]
// @ts-expect-error A column needs a width.
const noWidth: TreeGridColumn = { id: 'x', label: 'X' }
// @ts-expect-error Cell values are strings, numbers or booleans.
const badCell: TreeGridCell = { rowId: 'a', columnId: 'w1', value: { amount: 1 } }
// @ts-expect-error Unknown status.
const badStatus: TreeGridCell = { rowId: 'a', columnId: 'w1', status: 'later' }

const index = createTreeGridIndex({ rows: rows.value, columns, cells: cells.value })
const lines: TreeGridLines<BomRow> = flattenTreeGrid(index, ['a'])
const sameFunction: typeof flattenTreeGrid = coreFlatten
const revision: string = lines.lines[0]!.row.revision
const applied: { rows: BomRow[]; cells: TreeGridCell[] } = applyTreeGridEdits({ rows: rows.value, columns, cells: cells.value }, [])
const inserted: BomRow[] = insertTreeGridRow(rows.value, { index: 0 }, { id: 'b', label: 'B', revision: 'A' })
const deleted: BomRow[] = deleteTreeGridRows({ rows: rows.value }, { ids: ['a'], includeDescendants: true }).rows
const matched: string[] = matchTreeGridEntities(index, [{ kind: 'revision', id: 'B' }]).rowIds

const expandedIds = ref<string[]>([])
const activeCell = ref<TreeGridPosition>()
function activate(activation: TreeGridActivation) { return activation.entities.map(entity => entity.kind).join() + activation.source }
function edit(change: TreeGridCellEdit) { rows.value = applyTreeGridEdits({ rows: rows.value, columns, cells: cells.value }, [change]).rows }
function sheet(change: TreeGridSheetEdit) { return change.action === 'paste' && change.edits.length }
function create(change: TreeGridRowCreate) { rows.value = insertTreeGridRow(rows.value, change, { id: 'n', label: 'N', revision: 'A' }) }
function remove(change: TreeGridRowDelete) { rows.value = deleteTreeGridRows({ rows: rows.value }, change).rows }
function move(change: TimelineRowMove) { rows.value = moveTimelineRow(rows.value, change.id, change.after) }
function cancelled(event: TreeGridEditCancel) { return event.reason === 'source-changed' }
function rejected(_change: TreeGridCellEdit, reason: string) { return reason }

// Header sorting, filtering and column resizing: the projection keeps the row type.
const sort = ref<TimelineViewSort[]>([{ ruleId: timelineLabelColumnId, direction: 'asc' }])
const filters = ref<TimelineViewFilter[]>([{ columnId: 'rev', values: ['B'] }])
const view: TreeGridViewProjection<BomRow> = projectTreeGridRows({ rows: rows.value, columns, cells: cells.value }, { sort: sort.value, filters: filters.value })
const projectedRevision: string = view.rows[0]!.revision
const shownText: string = treeGridCellText(index, 'a', 'qty', { formatValue: (value, { row }) => row.revision + value })
// @ts-expect-error A sort direction is asc or desc.
const badSort: TimelineViewSort = { ruleId: 'qty', direction: 'up' }
function resize(change: TimelineColumnResize) { return change.after - change.before + (change.source === 'pointer' ? 0 : 1) }

const grid = useTemplateRef<TreeGridExposed<BomRow>>('grid')
const instance = ref<InstanceType<typeof TreeGrid>>()
void [noWidth, badCell, badStatus, sameFunction, projectedRevision, shownText, badSort, revision, applied, inserted, deleted, matched,
  grid.value?.revealRow('a', { focus: true }).status, grid.value?.cancelEdit(), grid.value?.copySelection(), instance.value?.focusCell({ rowId: 'a' }),
  h(TreeGrid, { rows: rows.value, columns })]
</script>

<template>
  <TreeGrid ref="grid" v-model:expanded-ids="expandedIds" v-model:active-cell="activeCell" :rows="rows" :columns="columns" :cells="cells"
    editable spreadsheet rows-editable dir="rtl" :labels="{ grid: 'BOM' }" :validate-cell-edit="change => change.after !== null"
    @row-activate="activate" @cell-activate="activate" @cell-edit="edit" @cell-edit-rejected="rejected" @sheet-edit="sheet"
    @row-create="create" @row-delete="remove" @row-move="move" @edit-cancel="cancelled" @expand-request="id => id.length">
    <template #cell="{ row, column, cell, text }">
      {{ row.revision }} {{ row.data?.qty }} {{ column.width }} {{ cell.state }} {{ text }}
      <!-- @vue-expect-error The row data is not `any`. -->
      {{ row.data?.missing }}
    </template>
    <template #row-header="{ row, line }">{{ row.revision }} {{ line.level }}</template>
    <template #status="{ text }">{{ text }}</template>
  </TreeGrid>
  <TreeGrid v-model:sort="sort" v-model:filters="filters" :rows="view.rows" :columns="columns" :cells="view.cells" columns-resizable
    :min-column-width="40" :max-column-width="400" :validate-column-resize="change => change.after > 50 || 'Too narrow'"
    sortable-columns :filterable-columns="['rev', timelineLabelColumnId]" :labels="{ sortBy: 'Order by', clearFilter: 'Clear' }"
    @column-resize="resize" @column-resize-rejected="(change, reason) => change.id + reason" />
  <!-- @vue-expect-error The sort is a list of rules. -->
  <TreeGrid :rows="rows" :columns="columns" :sort="'qty'" />
</template>
