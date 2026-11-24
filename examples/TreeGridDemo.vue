<script setup lang="ts">
// Opt-in example of TreeGrid: a product hierarchy (categories, subcategories and about 3,000 products) against
// attributes and the stock of 24 warehouses. The grid is controlled: cell edits, spreadsheet batches and row creates,
// deletes and moves are proposals that this parent applies to one history entry each (undo and redo below). An
// "Archived products" group loads its children on demand. Selection links to a NetworkGraph of categories and suppliers
// through entities (`useLinkedSelection().selectEntities`): the same supplier is one entity in many cells.
import { computed, ref, shallowRef } from 'vue'
import {
  NetworkGraph, TreeGrid, applyTreeGridEdits, deleteTreeGridRows, insertTreeGridRow, matchTreeGridEntities, moveTimelineRow,
  useEditHistory, useLinkedSelection,
  type EntityRef, type GraphEdge, type NetworkNode, type TimelineRowMove, type TreeGridActivation, type TreeGridCell,
  type TreeGridCellEdit, type TreeGridColumn, type TreeGridEditCancel, type TreeGridPosition, type TreeGridRow,
  type TreeGridRowCreate, type TreeGridRowDelete, type TreeGridSheetEdit, type ViewBinding, type ViewTargetEvent,
} from '../src'
import DemoPanel from './components/DemoPanel.vue'
import TreeGridColumnsDemo from './TreeGridColumnsDemo.vue'
import StatusLine from './components/StatusLine.vue'
import { useDemoLocale } from './i18n'

type Product = { kind: 'category' | 'product'; sku?: string; price?: number; status?: string; launch?: number; supplierId?: string; inStock?: boolean }
type Row = TreeGridRow<Product>

const { t, labels } = useDemoLocale()
const day = 86_400_000
const launchBase = Date.UTC(2024, 0, 1)
const categories = t({ en: ['Tools', 'Garden', 'Kitchen', 'Lighting', 'Storage', 'Outdoor'], ja: ['工具', '園芸', 'キッチン', '照明', '収納', 'アウトドア'] })
const subcategories = ['Basic', 'Pro', 'Compact', 'Classic', 'Smart']
const suppliers = ['Northwind', 'Contoso', 'Fabrikam', 'Tailspin', 'Litware', 'Proseware', 'Adatum', 'Woodgrove']
const warehouses = Array.from({ length: 24 }, (_, i) => 'W' + String(i + 1).padStart(2, '0'))

function initialRows(): Row[] {
  const rows: Row[] = []
  categories.forEach((category, c) => {
    const categoryId = 'cat-' + c
    rows.push({ id: categoryId, label: category, entities: [{ kind: 'category', id: categoryId }], data: { kind: 'category' } })
    subcategories.forEach((sub, s) => {
      const subId = `${categoryId}-${s}`
      rows.push({ id: subId, parentId: categoryId, label: `${category} ${sub}`, entities: [{ kind: 'category', id: subId }], data: { kind: 'category' } })
      for (let p = 0; p < 100; p++) {
        const n = c * 500 + s * 100 + p
        rows.push({
          id: 'p' + n, parentId: subId, label: `${category} ${sub} ${String(p + 1).padStart(3, '0')}`,
          entities: [{ kind: 'product', id: 'p' + n }],
          data: {
            kind: 'product', sku: `SKU-${String(n).padStart(5, '0')}`, price: 5 + ((n * 37) % 400) + (n % 4) * 0.25,
            status: n % 11 === 0 ? 'discontinued' : 'active', launch: launchBase + (n % 700) * day,
            supplierId: 'sup-' + ((c + s + (p % 3)) % suppliers.length), inStock: n % 7 !== 0,
          },
        })
      }
    })
  })
  rows.push({ id: 'archived', label: t({ en: 'Archived products', ja: 'アーカイブ済みの製品' }), childStatus: 'unloaded', data: { kind: 'category' } })
  return rows
}
function initialCells(rows: readonly Row[]): TreeGridCell[] {
  const cells: TreeGridCell[] = []
  for (const row of rows) {
    if (row.data?.kind !== 'product') continue
    const n = Number(row.id.slice(1))
    warehouses.forEach((warehouse, w) => {
      const pick = (n * 13 + w * 7) % 23
      if (pick < 9) return // not listed: unknown (missingCell)
      if (row.data!.status === 'discontinued') cells.push({ rowId: row.id, columnId: warehouse, status: 'not-applicable' })
      else if (pick === 9) cells.push({ rowId: row.id, columnId: warehouse, status: 'none' })
      else cells.push({ rowId: row.id, columnId: warehouse, value: pick === 10 ? 0 : (n + w * 3) % 60, ...pick > 20 ? { tone: 'amber' as const } : {} })
    })
  }
  return cells
}

const two = (value: number) => String(value).padStart(2, '0')
const formatDate = (value: unknown) => {
  if (typeof value !== 'number') return ''
  const date = new Date(value)
  return `${date.getUTCFullYear()}-${two(date.getUTCMonth() + 1)}-${two(date.getUTCDate())}`
}
const parseDate = (text: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text.trim())
  if (!match) return { error: t({ en: 'Use the format YYYY-MM-DD', ja: 'YYYY-MM-DD の形式で入力してください' }) }
  const time = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  return formatDate(time) === text.trim() ? time : { error: t({ en: 'Not a calendar date: ', ja: '存在しない日付です: ' }) + text.trim() }
}
const isProduct = (row: Row) => row.data?.kind === 'product'
const field = <K extends keyof Product>(key: K) => (row: Row, value: unknown): Row => ({ ...row, data: { ...row.data!, [key]: value ?? undefined } })
const columns: TreeGridColumn<Row>[] = [
  { id: 'sku', label: 'SKU', width: 104, value: row => row.data?.sku, editor: { kind: 'text', required: true }, editable: isProduct, update: field('sku') },
  {
    id: 'price', label: t({ en: 'Price', ja: '価格' }), width: 88, value: row => row.data?.price, editor: { kind: 'number', min: 0 }, editable: isProduct, update: field('price'),
  },
  {
    id: 'status', label: t({ en: 'Status', ja: '状態' }), width: 120, value: row => row.data?.status,
    editor: { kind: 'select', required: true, choices: [{ value: 'active', label: t({ en: 'Active', ja: '販売中' }) }, { value: 'discontinued', label: t({ en: 'Discontinued', ja: '販売終了' }) }] },
    editable: isProduct, update: field('status'),
  },
  {
    id: 'launch', label: t({ en: 'Launch', ja: '発売日' }), width: 108, value: row => row.data?.launch,
    editor: { kind: 'time', parse: parseDate, format: formatDate }, editable: isProduct, update: field('launch'),
  },
  {
    id: 'supplier', label: t({ en: 'Supplier', ja: '仕入先' }), width: 112,
    value: row => row.data?.supplierId ? { value: suppliers[Number(row.data.supplierId.slice(4))]!, entities: [{ kind: 'supplier', id: row.data.supplierId }] } : undefined,
  },
  { id: 'inStock', label: t({ en: 'In stock', ja: '在庫あり' }), width: 80, value: row => row.data?.inStock, editor: { kind: 'checkbox' }, editable: isProduct, update: field('inStock') },
  ...warehouses.map(id => ({ id, label: id, width: 64, missingCell: 'unknown' as const, editor: { kind: 'number' as const, min: 0, integer: true }, editable: isProduct })),
]

const startRows = initialRows()
const history = useEditHistory<{ rows: Row[]; cells: TreeGridCell[] }>({ rows: startRows, cells: initialCells(startRows) })
const rows = computed(() => history.state.value.rows)
const cells = computed(() => history.state.value.cells)
const expandedIds = ref<string[]>(['cat-0', 'cat-0-0', 'cat-1'])
const activeCell = ref<TreeGridPosition>()
const status = ref(t({ en: 'Click or press Enter on a row or cell. Type, F2 or double-click edits; Ctrl+C, Ctrl+V and Ctrl+D work on ranges.', ja: '行かセルをクリックするか Enter を押してください。文字入力、F2、ダブルクリックで編集し、Ctrl+C、Ctrl+V、Ctrl+D は範囲に使えます。' }))
const failNextLoad = ref(false)
const archivedStatus = shallowRef<'unloaded' | 'loading' | 'loaded' | 'failed'>('unloaded')
let created = 0

const label = (id: string) => rows.value.find(row => row.id === id)?.label ?? id
const commit = (next: { rows?: Row[]; cells?: TreeGridCell[] }, text: string) => {
  history.commit({ ...history.state.value, ...next })
  status.value = text
}
function cellEdit(change: TreeGridCellEdit) {
  commit(applyTreeGridEdits({ rows: rows.value, columns, cells: cells.value }, [change]), `${label(change.rowId)} · ${change.columnId}: ${String(change.before)} → ${String(change.after)}.`)
}
function sheetEdit(change: TreeGridSheetEdit) {
  commit(applyTreeGridEdits({ rows: rows.value, columns, cells: cells.value }, change.edits), t({ en: `${change.action}: ${change.edits.length} cells changed.`, ja: `${change.action}: ${change.edits.length} セルを変更しました。` }))
}
function rejected(_change: unknown, reason: string) { status.value = t({ en: 'Rejected: ', ja: '却下: ' }) + reason }
function cancelled(event: TreeGridEditCancel) { status.value = t({ en: `Edit cancelled (${event.kind}, ${event.reason}).`, ja: `編集を取り消しました(${event.kind}、${event.reason})。` }) }
function validateCellEdit(change: TreeGridCellEdit) {
  return change.columnId !== 'price' || (typeof change.after === 'number' && change.after <= 10_000) || change.after === null || t({ en: 'Prices above 10,000 need approval.', ja: '10,000 を超える価格には承認が必要です。' })
}
function rowCreate(change: TreeGridRowCreate) {
  const id = 'new-' + ++created
  const parent = change.parentId ? rows.value.find(row => row.id === change.parentId) : undefined
  const product = parent && parent.parentId !== undefined
  const row: Row = {
    id, label: t({ en: `New ${product ? 'product' : 'group'} ${created}`, ja: `新しい${product ? '製品' : 'グループ'} ${created}` }), entities: [{ kind: 'product', id }],
    data: product ? { kind: 'product', sku: `NEW-${created}`, price: 0, status: 'active', inStock: false } : { kind: 'category' },
  }
  commit({ rows: insertTreeGridRow(rows.value, change, row) }, t({ en: `Added ${row.label}.`, ja: `${row.label} を追加しました。` }))
  if (change.parentId && !expandedIds.value.includes(change.parentId)) expandedIds.value = [...expandedIds.value, change.parentId]
  activeCell.value = { rowId: id }
}
function rowDelete(change: TreeGridRowDelete) {
  const names = change.ids.map(label).join(t({ en: ', ', ja: '、' }))
  commit(deleteTreeGridRows({ rows: rows.value, cells: cells.value }, change), t({ en: `Deleted ${names}${change.includeDescendants ? ' with its rows' : ''}.`, ja: `${names}${change.includeDescendants ? 'をその行ごと' : 'を'}削除しました。` }))
}
function rowMove(change: TimelineRowMove) {
  commit({ rows: moveTimelineRow(rows.value, change.id, change.after) }, t({
    en: `Moved ${label(change.id)}${change.after.parentId ? ' into ' + label(change.after.parentId) : ' to the top level'}.`,
    ja: `${label(change.id)} を${change.after.parentId ? label(change.after.parentId) + ' の中' : '最上位'}に移動しました。`,
  }))
}
function validateRowDelete(change: TreeGridRowDelete) {
  return change.ids.every(id => rows.value.find(row => row.id === id)?.parentId !== undefined) || t({ en: 'Top-level categories cannot be deleted.', ja: '最上位のカテゴリーは削除できません。' })
}
function validateRowMove(change: TimelineRowMove) {
  const row = rows.value.find(item => item.id === change.id)
  return !(row?.data?.kind === 'product' && change.after.parentId === undefined) || t({ en: 'A product needs a category.', ja: '製品にはカテゴリーが必要です。' })
}

// The lazily loaded group: its children arrive after a short delay, or fail on request.
function expandRequest(rowId: string) {
  if (rowId !== 'archived') return
  archivedStatus.value = 'loading'
  status.value = t({ en: 'Loading archived products…', ja: 'アーカイブ済みの製品を読み込み中…' })
  setTimeout(() => {
    if (failNextLoad.value) {
      failNextLoad.value = false
      archivedStatus.value = 'failed'
      status.value = t({ en: 'Loading archived products failed. Press Enter on the status line to retry.', ja: 'アーカイブ済みの製品を読み込めませんでした。状態の行で Enter を押すと再試行します。' })
      return
    }
    const loaded: Row[] = Array.from({ length: 20 }, (_, i) => ({
      id: 'arch-' + i, parentId: 'archived', label: t({ en: 'Archived ', ja: 'アーカイブ ' }) + String(i + 1).padStart(2, '0'), entities: [{ kind: 'product', id: 'arch-' + i }],
      data: { kind: 'product', sku: `OLD-${i}`, price: 1 + i, status: 'discontinued', supplierId: 'sup-' + (i % suppliers.length), inStock: false },
    }))
    archivedStatus.value = 'loaded'
    // Loaded data replaces the current entry: it is not an edit to undo.
    history.replaceCurrent({ ...history.state.value, rows: [...history.state.value.rows.filter(row => row.parentId !== 'archived'), ...loaded] })
    status.value = t({ en: 'Loaded 20 archived products.', ja: 'アーカイブ済みの製品を 20 件読み込みました。' })
  }, 600)
}
const gridRows = computed(() => rows.value.map(row => row.id === 'archived' ? { ...row, childStatus: archivedStatus.value } : row))

// Linked selection through entities.
const graphNodes = computed<NetworkNode[]>(() => [
  ...categories.flatMap((category, c) => [
    { id: 'cat-' + c, label: category, tone: 'blue' as const },
    ...subcategories.map((sub, s) => ({ id: `cat-${c}-${s}`, label: `${category} ${sub}`, tone: 'teal' as const })),
  ]),
  ...suppliers.map((name, i) => ({ id: 'sup-' + i, label: name, tone: 'amber' as const })),
])
const graphEdges = computed<GraphEdge[]>(() => categories.flatMap((_, c) => subcategories.flatMap((_, s) => [
  { id: `e-${c}-${s}`, from: 'cat-' + c, to: `cat-${c}-${s}` },
  { id: `s-${c}-${s}`, from: `cat-${c}-${s}`, to: 'sup-' + ((c + s) % suppliers.length) },
])))
const bindings = computed<ViewBinding[]>(() => graphNodes.value.map(node => ({
  entity: { kind: node.id.startsWith('sup-') ? 'supplier' : 'category', id: node.id }, target: { view: 'graph', kind: 'node', id: node.id },
})))
const linked = useLinkedSelection({ bindings })
const gridSelection = ref<string[]>([])
function activateInGrid(activation: TreeGridActivation) {
  gridSelection.value = [activation.rowId]
  linked.selectEntities(activation.entities, { source: 'tree-grid' })
  const names = activation.entities.map(entity => `${entity.kind}:${entity.id}`).join(', ') || t({ en: 'none', ja: 'なし' })
  status.value = t({
    en: `Activated ${label(activation.rowId)}${activation.columnId ? ' · ' + activation.columnId : ''} by ${activation.source}; entities ${names}.`,
    ja: `${activation.source}で ${label(activation.rowId)}${activation.columnId ? ' · ' + activation.columnId : ''} を選びました。エンティティ: ${names}。`,
  })
}
function activateInGraph(event: ViewTargetEvent) {
  gridSelection.value = []
  linked.select('graph', [event.target])
}
// A click on the empty graph canvas or Escape in the graph clears the linked selection in both views.
function clearSelection() {
  gridSelection.value = []
  linked.clearSelection()
}
const matches = computed(() => {
  const entities: EntityRef[] = linked.selectedEntities.value
  return matchTreeGridEntities({ rows: gridRows.value, columns, cells: cells.value }, entities)
})
const highlightedRowIds = computed(() => matches.value.rowIds.filter(id => !gridSelection.value.includes(id)))
const selectionText = computed(() => {
  const count = matches.value.rowIds.length + matches.value.cells.length
  const ids = linked.selectedEntities.value.map(entity => entity.id).join(', ')
  return linked.selectedEntities.value.length
    ? t({ en: `Linked: ${ids} (${count} grid matches)`, ja: `連動中: ${ids}(グリッドで ${count} 件一致)` })
    : t({ en: 'Nothing linked.', ja: '連動しているものはありません。' })
})
const rtl = ref(false)
</script>

<template>
  <DemoPanel title-id="tree-grid-title" :title="t({ en: 'Tree grid', ja: 'ツリーグリッド' })" :subtitle="t({ en: 'A product hierarchy against attributes and warehouse stock: about 3,000 rows and 30 columns, rendered in a window, with cell and spreadsheet editing, row structure editing, a lazily loaded group and selection linked to a graph.', ja: '製品階層を属性と倉庫在庫に並べた約 3,000 行・30 列の表を、表示範囲だけ描画します。セルとスプレッドシートの編集、行構造の編集、遅延読み込みのグループ、グラフと連動する選択を備えています。' })">
    <template #options>
      <button type="button" :disabled="!history.canUndo.value" @click="history.undo()">{{ t({ en: 'Undo', ja: '元に戻す' }) }}</button>
      <button type="button" :disabled="!history.canRedo.value" @click="history.redo()">{{ t({ en: 'Redo', ja: 'やり直す' }) }}</button>
      <label><input v-model="failNextLoad" type="checkbox"> {{ t({ en: 'Fail next load', ja: '次の読み込みを失敗させる' }) }}</label>
      <label><input v-model="rtl" type="checkbox"> {{ t({ en: 'Right to left', ja: '右から左' }) }}</label>
    </template>
    <TreeGrid v-model:expanded-ids="expandedIds" v-model:active-cell="activeCell" :rows="gridRows" :columns="columns" :cells="cells"
      missing-cell="unknown" :height="420" :tree-column-width="260" :dir="rtl ? 'rtl' : 'ltr'" editable spreadsheet rows-editable
      :selected-row-ids="gridSelection" :highlighted-row-ids="highlightedRowIds" :highlighted-cells="matches.cells"
      :validate-cell-edit="validateCellEdit" :validate-row-delete="validateRowDelete" :validate-row-move="validateRowMove"
      :labels="{ ...labels.treeGrid, grid: t({ en: 'Product matrix', ja: '製品マトリクス' }), treeColumn: t({ en: 'Product', ja: '製品' }) }"
      @row-activate="activateInGrid" @cell-activate="activateInGrid" @expand-request="expandRequest"
      @cell-edit="cellEdit" @cell-edit-rejected="rejected" @sheet-edit="sheetEdit" @sheet-edit-rejected="rejected" @edit-cancel="cancelled"
      @row-create="rowCreate" @row-delete="rowDelete" @row-move="rowMove"
      @row-create-rejected="rejected" @row-delete-rejected="rejected" @row-move-rejected="rejected" />
    <StatusLine :label="t({ en: 'Tree grid status', ja: 'ツリーグリッドの状態' })">{{ status }}</StatusLine>
    <StatusLine :label="t({ en: 'Tree grid selection', ja: 'ツリーグリッドの選択' })">{{ selectionText }}</StatusLine>
    <NetworkGraph :nodes="graphNodes" :edges="graphEdges" :height="260" :options="{ nodeWidth: 160, nodeHeight: 34 }"
      :selected-ids="linked.graph.value.selectedNodeIds" :highlighted-node-ids="linked.graph.value.highlightedNodeIds"
      :labels="{ ...labels.graph, region: t({ en: 'Categories and suppliers', ja: 'カテゴリーと仕入先' }) }" @target-activate="activateInGraph"
      @background-click="clearSelection" @idle-escape="clearSelection" />
  </DemoPanel>
  <!-- The opt-in header controls (column widths, sorting and filtering) on a smaller grid. -->
  <TreeGridColumnsDemo />
</template>
