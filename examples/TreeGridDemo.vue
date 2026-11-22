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
import StatusLine from './components/StatusLine.vue'

type Product = { kind: 'category' | 'product'; sku?: string; price?: number; status?: string; launch?: number; supplierId?: string; inStock?: boolean }
type Row = TreeGridRow<Product>

const day = 86_400_000
const launchBase = Date.UTC(2024, 0, 1)
const categories = ['Tools', 'Garden', 'Kitchen', 'Lighting', 'Storage', 'Outdoor']
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
  rows.push({ id: 'archived', label: 'Archived products', childStatus: 'unloaded', data: { kind: 'category' } })
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
  if (!match) return { error: 'Use the format YYYY-MM-DD' }
  const time = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  return formatDate(time) === text.trim() ? time : { error: 'Not a calendar date: ' + text.trim() }
}
const isProduct = (row: Row) => row.data?.kind === 'product'
const field = <K extends keyof Product>(key: K) => (row: Row, value: unknown): Row => ({ ...row, data: { ...row.data!, [key]: value ?? undefined } })
const columns: TreeGridColumn<Row>[] = [
  { id: 'sku', label: 'SKU', width: 104, value: row => row.data?.sku, editor: { kind: 'text', required: true }, editable: isProduct, update: field('sku') },
  {
    id: 'price', label: 'Price', width: 88, value: row => row.data?.price, editor: { kind: 'number', min: 0 }, editable: isProduct, update: field('price'),
  },
  {
    id: 'status', label: 'Status', width: 120, value: row => row.data?.status,
    editor: { kind: 'select', required: true, choices: [{ value: 'active', label: 'Active' }, { value: 'discontinued', label: 'Discontinued' }] },
    editable: isProduct, update: field('status'),
  },
  {
    id: 'launch', label: 'Launch', width: 108, value: row => row.data?.launch,
    editor: { kind: 'time', parse: parseDate, format: formatDate }, editable: isProduct, update: field('launch'),
  },
  {
    id: 'supplier', label: 'Supplier', width: 112,
    value: row => row.data?.supplierId ? { value: suppliers[Number(row.data.supplierId.slice(4))]!, entities: [{ kind: 'supplier', id: row.data.supplierId }] } : undefined,
  },
  { id: 'inStock', label: 'In stock', width: 80, value: row => row.data?.inStock, editor: { kind: 'checkbox' }, editable: isProduct, update: field('inStock') },
  ...warehouses.map(id => ({ id, label: id, width: 64, missingCell: 'unknown' as const, editor: { kind: 'number' as const, min: 0, integer: true }, editable: isProduct })),
]

const startRows = initialRows()
const history = useEditHistory<{ rows: Row[]; cells: TreeGridCell[] }>({ rows: startRows, cells: initialCells(startRows) })
const rows = computed(() => history.state.value.rows)
const cells = computed(() => history.state.value.cells)
const expandedIds = ref<string[]>(['cat-0', 'cat-0-0', 'cat-1'])
const activeCell = ref<TreeGridPosition>()
const status = ref('Click or press Enter on a row or cell. Type, F2 or double-click edits; Ctrl+C, Ctrl+V and Ctrl+D work on ranges.')
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
  commit(applyTreeGridEdits({ rows: rows.value, columns, cells: cells.value }, change.edits), `${change.action}: ${change.edits.length} cells changed.`)
}
function rejected(_change: unknown, reason: string) { status.value = 'Rejected: ' + reason }
function cancelled(event: TreeGridEditCancel) { status.value = `Edit cancelled (${event.kind}, ${event.reason}).` }
function validateCellEdit(change: TreeGridCellEdit) {
  return change.columnId !== 'price' || (typeof change.after === 'number' && change.after <= 10_000) || change.after === null || 'Prices above 10,000 need approval.'
}
function rowCreate(change: TreeGridRowCreate) {
  const id = 'new-' + ++created
  const parent = change.parentId ? rows.value.find(row => row.id === change.parentId) : undefined
  const product = parent && parent.parentId !== undefined
  const row: Row = {
    id, label: `New ${product ? 'product' : 'group'} ${created}`, entities: [{ kind: 'product', id }],
    data: product ? { kind: 'product', sku: `NEW-${created}`, price: 0, status: 'active', inStock: false } : { kind: 'category' },
  }
  commit({ rows: insertTreeGridRow(rows.value, change, row) }, `Added ${row.label}.`)
  if (change.parentId && !expandedIds.value.includes(change.parentId)) expandedIds.value = [...expandedIds.value, change.parentId]
  activeCell.value = { rowId: id }
}
function rowDelete(change: TreeGridRowDelete) {
  const names = change.ids.map(label).join(', ')
  commit(deleteTreeGridRows({ rows: rows.value, cells: cells.value }, change), `Deleted ${names}${change.includeDescendants ? ' with its rows' : ''}.`)
}
function rowMove(change: TimelineRowMove) {
  commit({ rows: moveTimelineRow(rows.value, change.id, change.after) }, `Moved ${label(change.id)}${change.after.parentId ? ' into ' + label(change.after.parentId) : ' to the top level'}.`)
}
function validateRowDelete(change: TreeGridRowDelete) {
  return change.ids.every(id => rows.value.find(row => row.id === id)?.parentId !== undefined) || 'Top-level categories cannot be deleted.'
}
function validateRowMove(change: TimelineRowMove) {
  const row = rows.value.find(item => item.id === change.id)
  return !(row?.data?.kind === 'product' && change.after.parentId === undefined) || 'A product needs a category.'
}

// The lazily loaded group: its children arrive after a short delay, or fail on request.
function expandRequest(rowId: string) {
  if (rowId !== 'archived') return
  archivedStatus.value = 'loading'
  status.value = 'Loading archived products…'
  setTimeout(() => {
    if (failNextLoad.value) {
      failNextLoad.value = false
      archivedStatus.value = 'failed'
      status.value = 'Loading archived products failed. Press Enter on the status line to retry.'
      return
    }
    const loaded: Row[] = Array.from({ length: 20 }, (_, i) => ({
      id: 'arch-' + i, parentId: 'archived', label: `Archived ${String(i + 1).padStart(2, '0')}`, entities: [{ kind: 'product', id: 'arch-' + i }],
      data: { kind: 'product', sku: `OLD-${i}`, price: 1 + i, status: 'discontinued', supplierId: 'sup-' + (i % suppliers.length), inStock: false },
    }))
    archivedStatus.value = 'loaded'
    // Loaded data replaces the current entry: it is not an edit to undo.
    history.replaceCurrent({ ...history.state.value, rows: [...history.state.value.rows.filter(row => row.parentId !== 'archived'), ...loaded] })
    status.value = 'Loaded 20 archived products.'
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
  const names = activation.entities.map(entity => `${entity.kind}:${entity.id}`).join(', ') || 'none'
  status.value = `Activated ${label(activation.rowId)}${activation.columnId ? ' · ' + activation.columnId : ''} by ${activation.source}; entities ${names}.`
}
function activateInGraph(event: ViewTargetEvent) {
  gridSelection.value = []
  linked.select('graph', [event.target])
}
const matches = computed(() => {
  const entities: EntityRef[] = linked.selectedEntities.value
  return matchTreeGridEntities({ rows: gridRows.value, columns, cells: cells.value }, entities)
})
const highlightedRowIds = computed(() => matches.value.rowIds.filter(id => !gridSelection.value.includes(id)))
const selectionText = computed(() => {
  const count = matches.value.rowIds.length + matches.value.cells.length
  return linked.selectedEntities.value.length ? `Linked: ${linked.selectedEntities.value.map(entity => entity.id).join(', ')} (${count} grid matches)` : 'Nothing linked.'
})
const rtl = ref(false)
</script>

<template>
  <DemoPanel title-id="tree-grid-title" title="Tree grid" subtitle="A product hierarchy against attributes and warehouse stock: about 3,000 rows and 30 columns, rendered in a window, with cell and spreadsheet editing, row structure editing, a lazily loaded group and selection linked to a graph.">
    <template #options>
      <button type="button" :disabled="!history.canUndo.value" @click="history.undo()">Undo</button>
      <button type="button" :disabled="!history.canRedo.value" @click="history.redo()">Redo</button>
      <label><input v-model="failNextLoad" type="checkbox"> Fail next load</label>
      <label><input v-model="rtl" type="checkbox"> Right to left</label>
    </template>
    <TreeGrid v-model:expanded-ids="expandedIds" v-model:active-cell="activeCell" :rows="gridRows" :columns="columns" :cells="cells"
      missing-cell="unknown" :height="420" :tree-column-width="260" :dir="rtl ? 'rtl' : 'ltr'" editable spreadsheet rows-editable
      :selected-row-ids="gridSelection" :highlighted-row-ids="highlightedRowIds" :highlighted-cells="matches.cells"
      :validate-cell-edit="validateCellEdit" :validate-row-delete="validateRowDelete" :validate-row-move="validateRowMove"
      :labels="{ grid: 'Product matrix', treeColumn: 'Product' }"
      @row-activate="activateInGrid" @cell-activate="activateInGrid" @expand-request="expandRequest"
      @cell-edit="cellEdit" @cell-edit-rejected="rejected" @sheet-edit="sheetEdit" @sheet-edit-rejected="rejected" @edit-cancel="cancelled"
      @row-create="rowCreate" @row-delete="rowDelete" @row-move="rowMove"
      @row-create-rejected="rejected" @row-delete-rejected="rejected" @row-move-rejected="rejected" />
    <StatusLine label="Tree grid status">{{ status }}</StatusLine>
    <StatusLine label="Tree grid selection">{{ selectionText }}</StatusLine>
    <NetworkGraph :nodes="graphNodes" :edges="graphEdges" :height="260" :options="{ nodeWidth: 150, nodeHeight: 34 }"
      :selected-ids="linked.graph.value.selectedNodeIds" :highlighted-node-ids="linked.graph.value.highlightedNodeIds"
      :labels="{ region: 'Categories and suppliers' }" @target-activate="activateInGraph" />
  </DemoPanel>
</template>
