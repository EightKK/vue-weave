<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import {
  NetworkGraph, TreeGrid, applyTreeGridEdits, deleteTreeGridRows, diffStructure, graphTracePath, insertTreeGridRow,
  matchTreeGridEntities, moveTimelineRow, projectTimelineRows, traverseGraph, useEditHistory, useLinkedSelection,
  type GraphTraversalResult, type NetworkGraphExposed, type NetworkNode, type StructureFieldChange, type TimelineColumn,
  type TimelineRowMove, type TreeGridActivation, type TreeGridCellEdit, type TreeGridCellRef, type TreeGridColumn,
  type TreeGridEditCancel, type TreeGridExposed, type TreeGridRowCreate, type TreeGridRowDelete, type TreeGridSheetEdit,
  type ViewBinding, type ViewTargetEvent,
} from '../../src'
import {
  alternates, comparedFields, expandBom, explodeBom, formatDate, formatQty, itemGraph, itemMap, linesByParent, parseDate,
  revisionA, revisionB, usageRecord, type Bom, type Item, type ItemEdge, type Line, type Unit, type UsageData, type UsageRow,
} from './bomData'
import { useDemoLocale } from '../i18n'

// A multi-level bill of materials for a small pump family. The BOM lines are the model; the tree grid shows them
// expanded into usage positions (row ID = usage key, row entity = the item), so a shared subassembly appears under every
// parent that uses it. Grid proposals are applied to the shown rows with the core helpers and folded back into the
// lines, one history entry each. The item graph, where-used walks, the revision comparison and the rollup all read the
// same lines.
type Change = 'added' | 'removed' | 'changed' | 'moved'
type GraphNodeData = { item: Item; product: boolean; change?: Change }
type GraphNode = NetworkNode<GraphNodeData> & { data: GraphNodeData }
type GraphLink = Omit<ItemEdge, 'kind'> & { kind: ItemEdge['kind'] | 'removed'; change?: Change }

// Item names and part numbers are data and stay in English; the interface follows the page language.
const { t, labels, isJapanese } = useDemoLocale()

const history = useEditHistory<Bom>(revisionB)
const bom = computed(() => history.state.value)
const items = computed(() => itemMap(bom.value))
const rows = computed(() => expandBom(bom.value))
const rowsA = expandBom(revisionA)
const rowsAById = new Map(rowsA.map(row => [row.id, row]))
const itemsA = itemMap(revisionA)
const nameOf = (id: string | undefined) => (id && (items.value.get(id) ?? itemsA.get(id))?.name) || id || ''
const status = ref(t({
  en: 'Revision B is open for editing. Select a row or a node; Ctrl+Z and Ctrl+Shift+Z undo and redo.',
  ja: '改訂 B を編集中です。行かノードを選んでください。Ctrl+Z と Ctrl+Shift+Z で元に戻す・やり直しができます。',
}))

// ---- revision comparison: diffStructure over the usage records of revision A and the working revision B ----
const comparing = ref(false)
const diff = computed(() => diffStructure(rowsA.map(usageRecord), rows.value.map(usageRecord), { key: 'key', parentKey: 'parent', fields: [...comparedFields] }))
const changes = computed(() => {
  const map = new Map<string, { kinds: Change[]; fields: StructureFieldChange[]; from?: string; to?: string }>()
  const entry = (key: string) => map.get(key) ?? map.set(key, { kinds: [], fields: [] }).get(key)!
  for (const key of diff.value.added) entry(key).kinds.push('added')
  for (const key of diff.value.removed) entry(key).kinds.push('removed')
  for (const change of diff.value.changed) Object.assign(entry(change.key), { fields: change.fields }).kinds.push('changed')
  for (const move of diff.value.moved) Object.assign(entry(move.key), { from: move.beforeParent, to: move.afterParent }).kinds.push('moved')
  return map
})
const fieldLabels: Record<string, string> = t({
  en: { pos: 'position', pn: 'part number', name: 'name', qty: 'quantity', unit: 'unit', rev: 'item revision', source: 'make/buy', from: 'effective from' },
  ja: { pos: '位置', pn: '品番', name: '名称', qty: '数量', unit: '単位', rev: '品目改訂', source: '内外作', from: '適用開始' },
})
const show = (name: string, value: unknown) => value === undefined || value === null ? '–' : name === 'from' ? formatDate(value) : String(value)
const rowLabel = (key: string | undefined) => key ? (rows.value.find(row => row.id === key) ?? rowsAById.get(key))?.label ?? key : t({ en: 'the top level', ja: '最上位' })
function describeChange(key: string) {
  const change = changes.value.get(key)!
  const parts: string[] = []
  const row = rows.value.find(item => item.id === key) ?? rowsAById.get(key)!
  if (change.kinds.includes('added')) parts.push(t({ en: `added to ${rowLabel(row.parentId)}`, ja: `${rowLabel(row.parentId)} に追加` }))
  if (change.kinds.includes('removed')) parts.push(t({ en: `removed from ${rowLabel(row.parentId)}`, ja: `${rowLabel(row.parentId)} から削除` }))
  if (change.kinds.includes('moved')) parts.push(t({ en: `moved from ${rowLabel(change.from)} to ${rowLabel(change.to)}`, ja: `${rowLabel(change.from)} から ${rowLabel(change.to)} へ移動` }))
  for (const field of change.fields) parts.push(`${fieldLabels[field.name]} ${show(field.name, field.before)} → ${show(field.name, field.after)}`)
  return parts.join('; ')
}
const kindOf = (kinds: readonly Change[]): Change => kinds.includes('removed') ? 'removed' : kinds.includes('added') ? 'added' : kinds.includes('moved') ? 'moved' : 'changed'
const kindLabel: Record<Change, string> = t({
  en: { added: 'Added', removed: 'Removed', changed: 'Changed', moved: 'Moved' },
  ja: { added: '追加', removed: '削除', changed: '変更', moved: '移動' },
})

// Rows shown in the grid: revision B, plus the rows revision A had and B removed while comparing (read-only ghosts,
// placed after their previous sibling of revision A, else first under their parent).
const comparedRows = computed<UsageRow[]>(() => {
  if (!comparing.value) return rows.value
  const out: UsageRow[] = rows.value.map((row) => {
    const change = changes.value.get(row.id)
    if (!change) return row
    const kind = kindLabel[kindOf(change.kinds)]
    return { ...row, detail: t({ en: `${row.detail}. ${kind} in revision B: ${describeChange(row.id)}`, ja: `${row.detail}。改訂 B で${kind}: ${describeChange(row.id)}` }) }
  })
  for (const key of diff.value.removed) {
    const ghost = rowsAById.get(key)!
    const siblings = rowsA.filter(row => row.parentId === ghost.parentId)
    let at = -1
    for (let i = siblings.indexOf(ghost) - 1; i >= 0 && at < 0; i--) at = out.findIndex(row => row.id === siblings[i]!.id)
    if (at < 0) at = out.findIndex(row => row.id === ghost.parentId)
    out.splice(at + 1, 0, { ...ghost, detail: t({ en: `${ghost.detail}. Removed in revision B`, ja: `${ghost.detail}。改訂 B で削除` }), data: { ...ghost.data, ghost: true } })
  }
  return out
})
const changedCells = computed<TreeGridCellRef[]>(() => comparing.value
  ? diff.value.changed.flatMap(change => change.fields.map(field => ({ rowId: change.key, columnId: field.name })))
  : [])
const changeList = computed(() => comparedRows.value.filter(row => changes.value.has(row.id)).map(row => ({
  key: row.id, kind: kindOf(changes.value.get(row.id)!.kinds), name: row.label, text: describeChange(row.id),
  columnId: changes.value.get(row.id)!.fields[0]?.name,
})))
const changeCounts = computed(() => {
  const counts: Record<Change, number> = { added: 0, removed: 0, changed: 0, moved: 0 }
  for (const entry of changeList.value) counts[entry.kind]++
  return counts
})

// ---- search: projectTimelineRows keeps the matches with their ancestors ----
const query = ref('')
const searchColumns: TimelineColumn<UsageRow>[] = [
  { id: 'pn', label: 'Part number', width: 1, value: row => row.data.pn },
  { id: 'name', label: 'Name', width: 1, value: row => row.data.name },
]
const projection = computed(() => query.value.trim()
  ? projectTimelineRows({ rows: comparedRows.value, columns: searchColumns }, { search: { text: query.value, columnIds: ['pn', 'name'] }, sort: [], filters: [], collapsedIds: [] })
  : undefined)
const gridRows = computed(() => projection.value?.rows ?? comparedRows.value)
const rowById = computed(() => new Map(gridRows.value.map(row => [row.id, row])))
const matchedIds = computed(() => new Set(projection.value?.matchedRowIds ?? []))

const pathIds = (...itemIds: string[]) => {
  const ids: string[] = []
  let parent: string | undefined
  for (const itemId of itemIds) {
    parent = rows.value.find(row => row.parentId === parent && row.data.itemId === itemId)!.id
    ids.push(parent)
  }
  return ids
}
const expandedIds = ref<string[]>(pathIds('CP-80', 'PE-80', 'VC-80'))
const searchExpanded = ref<string[]>([])
// A new query expands every kept assembly; edits made while searching keep the expansion and their own status.
watch(() => query.value.trim(), () => {
  const result = projection.value
  if (!result) return
  const parents = new Set(result.rows.map(row => row.parentId).filter(id => id !== undefined))
  searchExpanded.value = [...parents]
  const count = result.matchedRowIds.length
  status.value = t({
    en: `${count} row${count === 1 ? '' : 's'} match “${query.value.trim()}”, shown with their assemblies.`,
    ja: `「${query.value.trim()}」に一致する ${count} 行を、上位のアセンブリと一緒に表示しています。`,
  })
})
const expanded = computed({
  get: () => projection.value ? searchExpanded.value : expandedIds.value,
  set: (ids: string[]) => { if (projection.value) searchExpanded.value = ids; else expandedIds.value = ids },
})
const grid = ref<TreeGridExposed<UsageRow>>()
const activeCell = ref<{ rowId: string; columnId?: string }>()
async function reveal(rowId: string, columnId?: string) {
  const ancestors: string[] = []
  for (let id = rowById.value.get(rowId)?.parentId; id; id = rowById.value.get(id)?.parentId) ancestors.push(id)
  expanded.value = [...new Set([...expanded.value, ...ancestors])]
  await nextTick()
  grid.value?.revealRow(rowId, { focus: true, columnId })
}

// ---- grid columns: line fields (position, quantity, effectivity) and item fields (the rest) ----
const units: Unit[] = ['pcs', 'm', 'kg', 'L']
const isLine = (row: UsageRow) => Boolean(row.data.lineId) && !row.data.ghost
const isLive = (row: UsageRow) => !row.data.ghost
const field = <K extends keyof UsageData>(key: K) => (row: UsageRow, value: unknown): UsageRow => ({ ...row, data: { ...row.data, [key]: value } })
const columns: TreeGridColumn<UsageRow>[] = [
  { id: 'pos', label: t({ en: 'Pos.', ja: '位置' }), width: 64, value: row => row.data.pos, editor: { kind: 'number', min: 1, integer: true, required: true }, editable: isLine, update: field('pos') },
  { id: 'pn', label: t({ en: 'Part number', ja: '品番' }), width: 100, value: row => row.data.pn, editor: { kind: 'text', required: true }, editable: isLine, update: field('pn') },
  { id: 'name', label: t({ en: 'Name', ja: '名称' }), width: 190, value: row => row.data.name, editor: { kind: 'text', required: true }, editable: isLive, update: field('name') },
  { id: 'qty', label: t({ en: 'Qty', ja: '数量' }), width: 68, value: row => row.data.qty, editor: { kind: 'number', min: 0, required: true }, editable: isLine, update: field('qty') },
  {
    id: 'unit', label: t({ en: 'Unit', ja: '単位' }), width: 72, value: row => row.data.unit,
    editor: { kind: 'select', required: true, choices: units.map(unit => ({ value: unit, label: unit })) }, editable: isLive, update: field('unit'),
  },
  { id: 'rev', label: t({ en: 'Item rev.', ja: '品目改訂' }), width: 76, value: row => row.data.rev, editor: { kind: 'text', required: true }, editable: isLive, update: field('rev') },
  {
    id: 'source', label: t({ en: 'Make/buy', ja: '内外作' }), width: 88, value: row => row.data.source,
    editor: { kind: 'select', required: true, choices: [{ value: 'make', label: t({ en: 'Make', ja: '内作' }) }, { value: 'buy', label: t({ en: 'Buy', ja: '購入' }) }] }, editable: isLive, update: field('source'),
  },
  {
    id: 'from', label: t({ en: 'Effective from', ja: '適用開始' }), width: 118, value: row => row.data.from,
    editor: { kind: 'time', required: true, parse: parseDate, format: formatDate }, editable: isLine, update: field('from'),
  },
  { id: 'ext', label: t({ en: 'Per product', ja: '製品あたり' }), width: 96, align: 'end', value: row => ({ value: row.data.ext, label: `${formatQty(row.data.ext)} ${row.data.unit}` }) },
]

// ---- checks shared by the validators ----
const structure = computed(() => itemGraph(bom.value))
/** Why `childId` cannot be used inside `parentId`, or undefined: the parent would end up inside its own structure. */
function cycleReason(childId: string, parentId: string) {
  if (childId === parentId) return t({ en: `${nameOf(childId)} cannot contain itself.`, ja: `${nameOf(childId)} は自分自身を含められません。` })
  const walk = traverseGraph(structure.value, [childId], { direction: 'forward', edgeFilter: edge => edge.kind === 'structure', paths: true })
  if (!walk.nodeIds.includes(parentId)) return undefined
  const path = graphTracePath(walk, parentId, { direction: 'forward' })!
  return t({
    en: `Cycle: ${nameOf(childId)} already contains ${nameOf(parentId)} (${path.nodeIds.map(nameOf).join(' → ')}), so it cannot go inside it.`,
    ja: `循環: ${nameOf(childId)} はすでに ${nameOf(parentId)} を含んでいるため(${path.nodeIds.map(nameOf).join(' → ')})、その中には入れられません。`,
  })
}
const lineOf = (row: UsageRow) => bom.value.lines.find(line => line.id === row.data.lineId)
const readOnly = t({ en: 'Rows that revision B removed are read only.', ja: '改訂 B で削除した行は読み取り専用です。' })
function checkCell(change: TreeGridCellEdit): true | string {
  const row = rowById.value.get(change.rowId)
  if (!row || row.data.ghost) return readOnly
  const value = change.after
  if (value === null || value === '') {
    const name = columns.find(column => column.id === change.columnId)?.label
    return t({ en: `${name ?? 'This field'} needs a value.`, ja: `${name ?? 'この項目'}を入力してください。` })
  }
  if (change.columnId === 'qty') {
    if (typeof value !== 'number' || value <= 0) return t({ en: 'Quantity must be greater than 0.', ja: '数量は 0 より大きくしてください。' })
    if (row.data.unit === 'pcs' && !Number.isInteger(value)) return t({ en: 'Parts counted in pcs need a whole quantity.', ja: '単位が pcs の部品は整数で入力してください。' })
  }
  const line = lineOf(row)
  if (change.columnId === 'pos' && line) {
    const other = bom.value.lines.find(item => item.parent === line.parent && item.id !== line.id && item.pos === value)
    if (other) return t({ en: `Position ${value} of ${nameOf(line.parent)} is already used by ${nameOf(other.child)}.`, ja: `${nameOf(line.parent)} の位置 ${value} はすでに ${nameOf(other.child)} が使っています。` })
  }
  if (change.columnId === 'pn' && line) {
    const pn = String(value).trim()
    const existing = bom.value.items.find(item => item.pn.toLowerCase() === pn.toLowerCase())
    if (existing) return cycleReason(existing.id, line.parent) ?? true
    if (bom.value.lines.some(item => item.parent === line.child)) return t({ en: `${nameOf(line.child)} has lines of its own: replace it with an existing part number.`, ja: `${nameOf(line.child)} には子の明細があります。既存の品番に置き換えてください。` })
  }
  return true
}
const validateCellEdit = (change: TreeGridCellEdit) => checkCell(change)
const validateSheetEdit = (change: TreeGridSheetEdit) => {
  for (const edit of change.edits) {
    const result = checkCell(edit)
    if (result !== true) return result
  }
  return true
}

// ---- folding grid proposals back into the BOM lines ----
const commit = (next: Bom, text: string) => {
  history.commit(next)
  status.value = text
}
const usages = (itemId: string) => rows.value.filter(row => row.data.itemId === itemId).length
let created = 0
function foldCell(model: Bom, row: UsageRow, columnId: string): Bom {
  const { itemId, lineId } = row.data
  if (columnId === 'pos' || columnId === 'qty' || columnId === 'from') {
    return { ...model, lines: model.lines.map(line => line.id === lineId ? { ...line, [columnId]: row.data[columnId] } : line) }
  }
  if (columnId === 'pn') {
    const pn = row.data.pn.trim()
    let target = model.items.find(item => item.pn.toLowerCase() === pn.toLowerCase())
    let itemList = model.items
    if (!target) {
      const old = model.items.find(item => item.id === itemId)!
      target = { ...old, id: model.items.some(item => item.id === pn) ? `${pn}~${++created}` : pn, pn, rev: 'A' }
      itemList = [...model.items, target]
    }
    return { ...model, items: itemList, lines: model.lines.map(line => line.id === lineId ? { ...line, child: target.id } : line) }
  }
  return { ...model, items: model.items.map(item => item.id === itemId ? { ...item, [columnId]: row.data[columnId as keyof UsageData] } : item) }
}
function applyCellEdits(edits: readonly TreeGridCellEdit[]) {
  const next = applyTreeGridEdits({ rows: gridRows.value, columns }, edits)
  const edited = new Map(next.rows.map(row => [row.id, row]))
  return edits.reduce((model, edit) => foldCell(model, edited.get(edit.rowId)!, edit.columnId), bom.value)
}
function onCellEdit(change: TreeGridCellEdit) {
  const row = rowById.value.get(change.rowId)!
  const lineField = change.columnId === 'pos' || change.columnId === 'qty' || change.columnId === 'from'
  const column = columns.find(item => item.id === change.columnId)!
  const where = change.columnId === 'pn' ? t({ en: `replaced by ${String(change.after)}`, ja: `${String(change.after)} に置き換え` })
    : `${isJapanese.value ? column.label : column.label.toLowerCase()} ${show(change.columnId, change.before)} → ${show(change.columnId, change.after)}`
  const count = lineField || change.columnId === 'pn' ? usages(row.data.parentItemId!) : usages(row.data.itemId)
  commit(applyCellEdits([change]), `${row.label}: ${where}${count > 1 ? allUsages(count) : ''}${t({ en: '.', ja: '。' })}`)
}
function onSheetEdit(change: TreeGridSheetEdit) {
  commit(applyCellEdits(change.edits), t({
    en: `${change.action}: ${change.edits.length} cell${change.edits.length === 1 ? '' : 's'} changed.`,
    ja: `${change.action}: ${change.edits.length} 個のセルを変更しました。`,
  }))
}
function onRejected(_change: unknown, reason: string) { status.value = t({ en: 'Rejected: ', ja: '却下: ' }) + reason }
function onCancel(event: TreeGridEditCancel) {
  status.value = t({ en: `Edit cancelled (${event.kind}, ${event.reason}).`, ja: `編集を取り消しました(${event.kind}, ${event.reason})。` })
}
/** " (all 3 usages)": the note of an edit that changes a shared assembly everywhere it is used. */
const allUsages = (count: number) => t({ en: ` (all ${count} usages)`, ja: `(使用箇所 ${count} か所すべて)` })

/** Inserts `line` after the line of the previous shown sibling, else before the next one, else last. */
function placeLine(lines: readonly Line[], line: Line, siblings: readonly UsageRow[], id: string): Line[] {
  const rest = lines.filter(item => item.id !== line.id)
  const i = siblings.findIndex(row => row.id === id)
  const before = siblings.slice(0, i).reverse().find(row => row.data.lineId && !row.data.ghost)
  const after = siblings.slice(i + 1).find(row => row.data.lineId && !row.data.ghost)
  let at = before ? rest.findIndex(item => item.id === before.data.lineId) + 1 : after ? rest.findIndex(item => item.id === after.data.lineId) : rest.length
  if (at < 0) at = rest.length
  return [...rest.slice(0, at), line, ...rest.slice(at)]
}
const nextPos = (lines: readonly Line[], parent: string) => Math.max(0, ...lines.filter(line => line.parent === parent).map(line => line.pos)) + 10

function validateRowCreate(change: TreeGridRowCreate) {
  if (change.parentId === undefined) return t({ en: 'The products are fixed: add parts inside an assembly.', ja: '製品は固定です。部品はアセンブリの中に追加してください。' })
  return rowById.value.get(change.parentId)?.data.ghost ? readOnly : true
}
async function onRowCreate(change: TreeGridRowCreate) {
  const parent = rowById.value.get(change.parentId!)!
  const n = ++created
  const item: Item = { id: `NEW-${n}`, pn: `NEW-${n}`, name: t({ en: `New part ${n}`, ja: `新しい部品 ${n}` }), unit: 'pcs', rev: 'A', source: 'buy' }
  const line: Line = { id: `N${n}`, parent: parent.data.itemId, child: item.id, pos: nextPos(bom.value.lines, parent.data.itemId), qty: 1, from: Date.UTC(2026, 2, 2) }
  const draft: UsageRow = { id: `draft-${n}`, parentId: parent.id, label: item.name, data: { ...parent.data, lineId: line.id, itemId: item.id } }
  const next = insertTreeGridRow(gridRows.value, change, draft)
  const count = usages(parent.data.itemId)
  commit(
    { ...bom.value, items: [...bom.value.items, item], lines: placeLine(bom.value.lines, line, next.filter(row => row.parentId === parent.id), draft.id) },
    t({
      en: `Added ${item.name} to ${parent.label} at position ${line.pos}${count > 1 ? allUsages(count) : ''}.`,
      ja: `${item.name} を ${parent.label} の位置 ${line.pos} に追加しました${count > 1 ? allUsages(count) : ''}。`,
    }),
  )
  if (!expanded.value.includes(parent.id)) expanded.value = [...expanded.value, parent.id]
  const added = rows.value.find(row => row.parentId === parent.id && row.data.lineId === line.id)
  if (added) {
    activeCell.value = { rowId: added.id }
    await nextTick()
    grid.value?.focusCell({ rowId: added.id })
  }
}
function validateRowDelete(change: TreeGridRowDelete) {
  for (const id of change.ids) {
    const row = rowById.value.get(id)
    if (!row || row.data.ghost) return readOnly
    if (!row.data.lineId) return t({ en: 'Products cannot be deleted.', ja: '製品は削除できません。' })
  }
  return true
}
function onRowDelete(change: TreeGridRowDelete) {
  const next = deleteTreeGridRows({ rows: gridRows.value }, change)
  const kept = new Set(next.rows.map(row => row.id))
  // The usage lines that end: removed rows whose parent row stays. The items themselves remain in the item master.
  const gone = gridRows.value.filter(row => !kept.has(row.id) && row.parentId !== undefined && kept.has(row.parentId) && row.data.lineId)
  const ids = new Set(gone.map(row => row.data.lineId!))
  const shared = gone.some(row => usages(row.data.parentItemId!) > 1)
  commit({ ...bom.value, lines: bom.value.lines.filter(line => !ids.has(line.id)) },
    t({
      en: `Removed ${gone.map(row => row.label).join(', ')} from ${gone.map(row => nameOf(row.data.parentItemId)).join(', ')}${shared ? ' (every usage of the assembly)' : ''}.`,
      ja: `${gone.map(row => nameOf(row.data.parentItemId)).join(', ')} から ${gone.map(row => row.label).join(', ')} を削除しました${shared ? '(アセンブリのすべての使用箇所)' : ''}。`,
    }))
}
function validateRowMove(change: TimelineRowMove) {
  const row = rowById.value.get(change.id)
  const target = change.after.parentId === undefined ? undefined : rowById.value.get(change.after.parentId)
  if (!row || row.data.ghost || target?.data.ghost) return readOnly
  // The cycle check comes first: it is the one rule a structure can never break.
  if (target) {
    const reason = cycleReason(row.data.itemId, target.data.itemId)
    if (reason) return reason
  }
  if (!row.data.lineId && target) return t({ en: 'A product stays at the top level.', ja: '製品は最上位から動かせません。' })
  if (row.data.lineId && !target) return t({ en: 'Only products sit at the top level.', ja: '最上位に置けるのは製品だけです。' })
  return true
}
async function onRowMove(change: TimelineRowMove) {
  const row = rowById.value.get(change.id)!
  const next = moveTimelineRow(gridRows.value, change.id, change.after)
  const siblings = next.filter(item => item.parentId === change.after.parentId)
  if (!row.data.lineId) {
    const order = siblings.filter(item => !item.data.ghost).map(item => item.data.itemId)
    commit({ ...bom.value, roots: [...order, ...bom.value.roots.filter(id => !order.includes(id))] }, t({ en: `Moved ${row.label} among the products.`, ja: `${row.label} を製品の間で移動しました。` }))
    return
  }
  const target = rowById.value.get(change.after.parentId!)!
  const line = lineOf(row)!
  const moving = line.parent !== target.data.itemId
  const clash = moving && bom.value.lines.some(item => item.parent === target.data.itemId && item.pos === line.pos)
  const moved: Line = { ...line, parent: target.data.itemId, pos: clash ? nextPos(bom.value.lines, target.data.itemId) : line.pos }
  const count = usages(target.data.itemId)
  commit({ ...bom.value, lines: placeLine(bom.value.lines, moved, siblings, change.id) }, moving
    ? t({
      en: `Moved ${row.label} into ${target.label}${clash ? `, renumbered to position ${moved.pos}` : ''}${count > 1 ? allUsages(count) : ''}.`,
      ja: `${row.label} を ${target.label} の中へ移動しました${clash ? `(位置を ${moved.pos} に振り直し)` : ''}${count > 1 ? allUsages(count) : ''}。`,
    })
    : t({ en: `Moved ${row.label} within ${target.label}.`, ja: `${row.label} を ${target.label} の中で移動しました。` }))
  if (!expanded.value.includes(target.id)) expanded.value = [...expanded.value, target.id]
  const now = rows.value.find(item => item.parentId === target.id && item.data.lineId === line.id)
  if (now && now.id !== change.id) {
    activeCell.value = { rowId: now.id }
    await nextTick()
    grid.value?.focusCell({ rowId: now.id })
  }
}

// ---- the item graph: used items, their alternates and, while comparing, the removed lines ----
const fullGraph = computed(() => {
  const children = linesByParent(bom.value)
  const used = new Set(bom.value.roots), queue = [...bom.value.roots]
  for (let i = 0; i < queue.length; i++) {
    for (const line of children.get(queue[i]!) ?? []) if (!used.has(line.child)) { used.add(line.child); queue.push(line.child) }
  }
  const ids = new Set(used)
  for (const link of alternates) if (used.has(link.from) || used.has(link.to)) ids.add(link.from).add(link.to)
  const lineStatus = new Map<string, Change>()
  const nodeStatus = new Map<string, Change>()
  const removedLines: Line[] = []
  if (comparing.value) {
    const current = new Set(bom.value.lines.map(line => line.id))
    for (const entry of changeList.value) {
      const row = rows.value.find(item => item.id === entry.key) ?? rowsAById.get(entry.key)!
      if (!row.data.lineId) continue
      lineStatus.set(row.data.lineId, entry.kind)
      if (entry.kind === 'removed' && !current.has(row.data.lineId)) {
        const line = revisionA.lines.find(item => item.id === row.data.lineId)!
        if (!removedLines.includes(line)) removedLines.push(line)
        if (!ids.has(line.child)) { ids.add(line.child); nodeStatus.set(line.child, 'removed') }
      } else if (!nodeStatus.has(row.data.itemId)) nodeStatus.set(row.data.itemId, entry.kind)
    }
  }
  const nodes: GraphNode[] = [...ids].map((id) => {
    const item = items.value.get(id) ?? itemsA.get(id)!
    const change = nodeStatus.get(id)
    return {
      id, label: item.name, detail: item.pn + (change ? t({ en: ` · ${kindLabel[change].toLowerCase()} in revision B`, ja: ` · 改訂 B で${kindLabel[change]}` }) : ''),
      data: { item, product: bom.value.roots.includes(id), ...change && { change } },
    }
  })
  const qtyBefore = new Map(revisionA.lines.map(line => [line.id, line.qty]))
  const edges: GraphLink[] = [
    ...bom.value.lines.filter(line => used.has(line.parent)).map((line) => {
      const change = lineStatus.get(line.id), before = qtyBefore.get(line.id)
      const was = change && before !== undefined && before !== line.qty ? t({ en: ` (was ×${formatQty(before)})`, ja: `(旧 ×${formatQty(before)})` }) : ''
      return { id: line.id, from: line.parent, to: line.child, kind: 'structure' as const, label: `×${formatQty(line.qty)}${was}`, ...change && { change } }
    }),
    ...alternates.filter(link => ids.has(link.from) && ids.has(link.to)).map(link => ({ ...link, kind: 'alternate' as const, label: t({ en: 'alternate', ja: '代替' }), dashed: true, markerEnd: 'none' as const })),
    ...removedLines.filter(line => ids.has(line.parent)).map(line => ({
      id: 'removed-' + line.id, from: line.parent, to: line.child, kind: 'removed' as const, label: t({ en: `×${formatQty(line.qty)} removed`, ja: `×${formatQty(line.qty)} 削除` }), dashed: true, change: 'removed' as const,
    })),
  ]
  return { nodes, edges, ids }
})
// The graph shows the assemblies, the selected item with its alternates and the items a revision change touches;
// "Show purchased parts" shows every item. Walks always run on the full item graph.
const showParts = ref(false)
const shownIds = computed<ReadonlySet<string>>(() => {
  const full = fullGraph.value
  if (showParts.value) return full.ids
  const keep = new Set(full.nodes.filter(node => node.data.item.source === 'make' || node.data.change).map(node => node.id))
  const id = selectedItemId.value
  if (id && full.ids.has(id)) {
    keep.add(id)
    for (const link of alternates) if (link.from === id || link.to === id) keep.add(link.from).add(link.to)
  }
  return keep
})
const graphNodes = computed(() => fullGraph.value.nodes.filter(node => shownIds.value.has(node.id)))
const graphEdges = computed(() => fullGraph.value.edges.filter(edge => shownIds.value.has(edge.from) && shownIds.value.has(edge.to)))

// ---- linked selection: the grid selects entities, the graph selects nodes ----
const bindings = computed<ViewBinding[]>(() => fullGraph.value.nodes.map(node => ({ entity: { kind: 'item', id: node.id }, target: { view: 'graph', kind: 'node', id: node.id } })))
const linked = useLinkedSelection({ bindings })
const gridSelection = ref<string[]>([])
const selectedItemId = computed(() => linked.selectedEntities.value.find(entity => entity.kind === 'item')?.id)
const highlightedRowIds = computed(() => matchTreeGridEntities({ rows: gridRows.value, columns }, linked.selectedEntities.value).rowIds)
function selectItem(id: string, source: string) {
  gridSelection.value = []
  linked.selectEntities([{ kind: 'item', id }], { source })
}
function onGridActivate(activation: TreeGridActivation) {
  gridSelection.value = [activation.rowId]
  linked.selectEntities(activation.entities, { source: 'grid' })
  const id = activation.entities[0]?.id
  const count = highlightedRowIds.value.length
  if (id) status.value = t({ en: `${nameOf(id)} (${items.value.get(id)?.pn ?? id}) is used in ${count} row${count === 1 ? '' : 's'}.`, ja: `${nameOf(id)}(${items.value.get(id)?.pn ?? id})は ${count} 行で使われています。` })
}
function onGraphActivate(event: ViewTargetEvent) {
  if (event.target.view !== 'graph' || event.target.kind !== 'node') return
  gridSelection.value = []
  linked.select('graph', [event.target])
  const count = highlightedRowIds.value.length
  status.value = t({ en: `${nameOf(event.target.id)} is used in ${count} row${count === 1 ? '' : 's'}.`, ja: `${nameOf(event.target.id)} は ${count} 行で使われています。` })
}

// A click on the empty canvas or Escape in the graph clears the selection.
function clearGraphSelection() {
  if (!linked.selectedEntities.value.length) return
  gridSelection.value = []
  linked.clearSelection()
  status.value = t({ en: 'Selection cleared.', ja: '選択を解除しました。' })
}

// ---- where-used: traverseGraph backward over structure edges only, with a node limit and paths ----
const follow = ref<'structure' | 'alternate'>('structure')
const limit = ref(8)
const walkGraph = computed(() => ({ nodes: fullGraph.value.nodes, edges: fullGraph.value.edges.filter(edge => edge.kind !== 'removed') }))
const isProduct = (id: string) => bom.value.roots.includes(id)
const whereUsed = computed<GraphTraversalResult | undefined>(() => {
  const id = selectedItemId.value
  if (!id || !fullGraph.value.ids.has(id)) return undefined
  const kind = follow.value
  return traverseGraph(walkGraph.value, [id], {
    direction: kind === 'structure' ? 'backward' : 'both', edgeFilter: edge => edge.kind === kind, maxNodes: limit.value, paths: true,
  })
})
const products = computed(() => follow.value === 'structure' ? whereUsed.value?.nodeIds.filter(id => isProduct(id) && id !== selectedItemId.value) ?? [] : [])
const parentsOf = computed(() => {
  const id = selectedItemId.value
  return id ? bom.value.lines.filter(line => line.child === id && fullGraph.value.ids.has(line.parent)) : []
})
const alternateIds = computed(() => follow.value === 'alternate' ? whereUsed.value?.nodeIds.filter(id => id !== selectedItemId.value) ?? [] : [])
// What the walk would reach if it also followed alternate links: products that must not count as where-used.
const leaked = computed(() => {
  const id = selectedItemId.value
  if (!id || !whereUsed.value || follow.value !== 'structure') return []
  const all = traverseGraph(walkGraph.value, [id], { direction: 'backward', edgeFilter: edge => edge.kind !== 'removed' }).nodeIds
  const structural = new Set(traverseGraph(walkGraph.value, [id], { direction: 'backward', edgeFilter: edge => edge.kind === 'structure' }).nodeIds)
  return all.filter(node => isProduct(node) && !structural.has(node))
})
const tracedId = ref<string>()
watch(selectedItemId, () => { tracedId.value = undefined })
const trace = computed(() => {
  const result = whereUsed.value
  const target = tracedId.value && products.value.includes(tracedId.value) ? tracedId.value : products.value[0]
  return result && target ? graphTracePath(result, target, { direction: 'backward' }) : undefined
})
/** The grid row at the end of a traced path: down from the product row along the path's lines. */
function rowOfTrace() {
  const path = trace.value
  if (!path) return undefined
  let row = rows.value.find(item => item.id === path.nodeIds.at(-1))
  for (const lineId of [...path.edgeIds].reverse()) row = rows.value.find(item => item.parentId === row?.id && item.data.lineId === lineId)
  return row
}
async function traceTo(productId: string) {
  tracedId.value = productId
  const row = rowOfTrace()
  status.value = t({
    en: `Path to ${nameOf(productId)}: ${trace.value!.nodeIds.map(nameOf).reverse().join(' → ')}.`,
    ja: `${nameOf(productId)} までの経路: ${trace.value!.nodeIds.map(nameOf).reverse().join(' → ')}。`,
  })
  if (row) await reveal(row.id)
}
const graph = ref<NetworkGraphExposed<GraphNode, GraphLink>>()
watch(whereUsed, async (result, before) => {
  if (!result || result.nodeIds.join() === before?.nodeIds.join()) return
  await nextTick()
  graph.value?.fit({ ids: result.nodeIds.filter(id => shownIds.value.has(id)), padding: 48 })
})
const graphHighlightedNodes = computed(() => new Set([...linked.graph.value.highlightedNodeIds, ...trace.value?.nodeIds ?? []]))
const graphHighlightedEdges = computed(() => new Set(trace.value?.edgeIds ?? []))
const dimmedIds = computed(() => {
  const reached = whereUsed.value && new Set(whereUsed.value.nodeIds)
  return reached ? new Set(graphNodes.value.filter(node => !reached.has(node.id)).map(node => node.id)) : undefined
})

// ---- rollup: a quantity explosion in demo code ----
const rollupProduct = ref('BS-250')
const purchasedOnly = ref(true)
const rollup = computed(() => [...explodeBom(bom.value, rollupProduct.value)]
  .map(([id, total]) => ({ item: items.value.get(id)!, total }))
  .filter(entry => !purchasedOnly.value || entry.item.source === 'buy')
  .sort((a, b) => a.item.pn.localeCompare(b.item.pn)))

// ---- undo, redo and the comparison toggle ----
function undo() { if (history.canUndo.value) { history.undo(); status.value = t({ en: 'Undone.', ja: '元に戻しました。' }) } }
function redo() { if (history.canRedo.value) { history.redo(); status.value = t({ en: 'Redone.', ja: 'やり直しました。' }) } }
function onKeydown(event: KeyboardEvent) {
  const target = event.target as HTMLElement
  if (!(event.ctrlKey || event.metaKey) || target.closest('input, select, textarea')) return
  const key = event.key.toLowerCase()
  if (key === 'z') { event.preventDefault(); if (event.shiftKey) redo(); else undo() }
  else if (key === 'y') { event.preventDefault(); redo() }
}
function toggleCompare() {
  comparing.value = !comparing.value
  const total = changeList.value.length
  status.value = comparing.value
    ? t({ en: `Revision A → B: ${total} change${total === 1 ? '' : 's'}.`, ja: `改訂 A → B: ${total} 件の変更。` })
    : t({ en: 'Comparison off.', ja: '比較を終了しました。' })
}
const stats = computed(() => ({ items: fullGraph.value.nodes.filter(node => !node.data.change || node.data.change !== 'removed').length, lines: bom.value.lines.length, rows: rows.value.length }))
const plural = (count: number, word: string) => isJapanese.value ? `${count} 件の品目` : `${count} ${word}${count === 1 ? '' : 's'}`
const selectedItem = computed(() => selectedItemId.value ? items.value.get(selectedItemId.value) : undefined)
</script>

<template>
  <section class="showcase sc-bom" :aria-label="t({ en: 'BOM editor', ja: 'BOMエディター' })" @keydown="onKeydown">
    <div class="sc-bom-head">
      <div>
        <h2>{{ t({ en: 'BOM editor', ja: 'BOMエディター' }) }}</h2>
        <p v-if="isJapanese">
          ポンプ製品群の5階層の部品表で、共通のサブアセンブリを含みます。<code>TreeGrid</code> は使用位置を表示し、コアの行・セル用ヘルパーで編集します。
          <code>NetworkGraph</code> は品目と使用関係を表示し、両方向に連動します。<code>traverseGraph</code> で使用先を求め、<code>diffStructure</code> で改訂を比較し、
          積み上げはデモのコードです。
        </p>
        <p v-else>
          A five-level bill of materials for a pump family, with shared subassemblies. <code>TreeGrid</code> shows usage
          positions and edits them through the core row and cell helpers; <code>NetworkGraph</code> shows items and usages,
          linked both ways. <code>traverseGraph</code> answers where-used, <code>diffStructure</code> compares revisions and
          the rollup is demo code.
        </p>
      </div>
      <dl class="sc-bom-stats">
        <div><dt>{{ t({ en: 'Items', ja: '品目' }) }}</dt><dd>{{ stats.items }}</dd></div>
        <div><dt>{{ t({ en: 'BOM lines', ja: 'BOM 明細' }) }}</dt><dd>{{ stats.lines }}</dd></div>
        <div><dt>{{ t({ en: 'Usage rows', ja: '使用行' }) }}</dt><dd>{{ stats.rows }}</dd></div>
      </dl>
    </div>

    <div class="sc-bom-toolbar">
      <label class="sc-bom-search">
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" /></svg>
        <input v-model="query" type="search" :aria-label="t({ en: 'Search part number or name', ja: '品番か名称で検索' })" :placeholder="t({ en: 'Search part number or name…', ja: '品番か名称で検索…' })">
      </label>
      <div class="sc-bom-group" role="group" :aria-label="t({ en: 'History', ja: '履歴' })">
        <button type="button" :disabled="!history.canUndo.value" @click="undo">{{ t({ en: 'Undo', ja: '元に戻す' }) }}</button>
        <button type="button" :disabled="!history.canRedo.value" @click="redo">{{ t({ en: 'Redo', ja: 'やり直す' }) }}</button>
      </div>
      <button type="button" class="sc-bom-compare" :aria-pressed="comparing" @click="toggleCompare">{{ t({ en: 'Compare with revision A', ja: '改訂 A と比較' }) }}</button>
      <ul v-if="comparing" class="sc-bom-legend" :aria-label="t({ en: 'Change legend', ja: '変更の凡例' })">
        <li v-for="kind in (['added', 'changed', 'moved', 'removed'] as const)" :key="kind" :data-change="kind">
          <span class="sc-bom-chip" :data-change="kind">{{ kindLabel[kind] }}</span> {{ changeCounts[kind] }}
        </li>
      </ul>
    </div>

    <div class="sc-bom-main">
      <div class="sc-bom-grid">
        <TreeGrid
          ref="grid" v-model:expanded-ids="expanded" v-model:active-cell="activeCell" :rows="gridRows" :columns="columns"
          :height="460" :tree-column-width="270" editable spreadsheet rows-editable
          :selected-row-ids="gridSelection" :highlighted-row-ids="highlightedRowIds" :highlighted-cells="changedCells"
          :validate-cell-edit="validateCellEdit" :validate-sheet-edit="validateSheetEdit" :validate-row-create="validateRowCreate"
          :validate-row-delete="validateRowDelete" :validate-row-move="validateRowMove"
          :labels="{ ...labels.treeGrid, grid: t({ en: 'Bill of materials', ja: '部品表' }), treeColumn: t({ en: 'Structure', ja: '構成' }) }"
          @row-activate="onGridActivate" @cell-activate="onGridActivate"
          @cell-edit="onCellEdit" @cell-edit-rejected="onRejected" @sheet-edit="onSheetEdit" @sheet-edit-rejected="onRejected"
          @edit-cancel="onCancel" @row-create="onRowCreate" @row-delete="onRowDelete" @row-move="onRowMove"
          @row-create-rejected="onRejected" @row-delete-rejected="onRejected" @row-move-rejected="onRejected"
        >
          <template #row-header="{ row }">
            <span class="sc-bom-label" :class="{ 'sc-bom-match': matchedIds.has(row.id), 'sc-bom-product': !row.data.lineId }">{{ row.label }}</span>
            <small class="sc-bom-pn">{{ row.data.pn }}</small>
            <span v-if="comparing && changes.has(row.id)" class="sc-bom-chip" :data-change="kindOf(changes.get(row.id)!.kinds)">{{ kindLabel[kindOf(changes.get(row.id)!.kinds)] }}</span>
          </template>
        </TreeGrid>
        <p class="sc-bom-status" role="status" :aria-label="t({ en: 'BOM status', ja: 'BOM の状態' })">{{ status }}</p>
        <p v-if="isJapanese" class="sc-bom-hint">
          Enter、F2 または文字入力でセルを編集 · Ctrl+Enter で明細を追加、Delete で削除 · Alt+矢印かドラッグで行を移動 ·
          名称、単位、改訂、内外作は品目に属し、すべての使用箇所が変わります。位置、数量、適用開始は明細に属します。
        </p>
        <p v-else class="sc-bom-hint">
          Enter, F2 or typing edits a cell · Ctrl+Enter adds a line, Delete removes one · Alt+arrows or a drag move a row ·
          name, unit, revision and make/buy belong to the item and change every usage; position, quantity and effectivity belong to the line.
        </p>
      </div>

      <aside class="sc-bom-side" :aria-label="t({ en: 'Item details', ja: '品目の詳細' })">
        <section v-if="comparing" class="sc-bom-panel" :aria-label="t({ en: 'Revision changes', ja: '改訂の変更' })">
          <h3>{{ t({ en: 'Revision A → B', ja: '改訂 A → B' }) }} <span class="sc-bom-count">{{ changeList.length }}</span></h3>
          <ul class="sc-bom-changes">
            <li v-for="entry in changeList" :key="entry.key">
              <button type="button" :data-change="entry.kind" @click="reveal(entry.key, entry.columnId)">
                <span class="sc-bom-chip" :data-change="entry.kind">{{ kindLabel[entry.kind] }}</span>{{ ' ' }}<span><strong>{{ entry.name }}</strong> {{ entry.text }}</span>
              </button>
            </li>
          </ul>
          <p v-if="!changeList.length" class="sc-bom-muted">{{ t({ en: 'No differences.', ja: '差分はありません。' }) }}</p>
        </section>

        <section class="sc-bom-panel" :aria-label="t({ en: 'Where used', ja: '使用先' })">
          <div class="sc-bom-panel-head">
            <h3>{{ t({ en: 'Where used', ja: '使用先' }) }}</h3>
            <div class="sc-bom-segmented" role="group" :aria-label="t({ en: 'Follow relation', ja: 'たどる関係' })">
              <button type="button" :aria-pressed="follow === 'structure'" @click="follow = 'structure'">{{ t({ en: 'Structure', ja: '構成' }) }}</button>
              <button type="button" :aria-pressed="follow === 'alternate'" @click="follow = 'alternate'">{{ t({ en: 'Alternates', ja: '代替品' }) }}</button>
            </div>
          </div>
          <template v-if="selectedItem && whereUsed">
            <p class="sc-bom-selected"><strong>{{ selectedItem.name }}</strong> <small>{{ selectedItem.pn }}</small></p>
            <template v-if="follow === 'structure'">
              <h4>{{ t({ en: 'Used directly in', ja: '直接の使用先' }) }}</h4>
              <ul v-if="parentsOf.length" class="sc-bom-list" :aria-label="t({ en: 'Parent assemblies', ja: '親アセンブリ' })">
                <li v-for="line in parentsOf" :key="line.id">
                  <button type="button" @click="selectItem(line.parent, 'where-used')">{{ nameOf(line.parent) }} <small>{{ t({ en: 'pos', ja: '位置' }) }} {{ line.pos }} · ×{{ formatQty(line.qty) }}</small></button>
                </li>
              </ul>
              <p v-else class="sc-bom-muted">{{ t({ en: 'Not used in an assembly: a product or an unused part.', ja: 'アセンブリでは使われていません(製品か未使用の部品)。' }) }}</p>
              <h4>{{ t({ en: 'Products', ja: '製品' }) }}</h4>
              <ul v-if="products.length" class="sc-bom-list" :aria-label="t({ en: 'Products using the item', ja: 'この品目を使う製品' })">
                <li v-for="id in products" :key="id">
                  <button type="button" :aria-pressed="trace?.nodeIds.at(-1) === id" @click="traceTo(id)">{{ nameOf(id) }} <small>{{ t({ en: 'show path', ja: '経路を表示' }) }}</small></button>
                </li>
              </ul>
              <p v-else class="sc-bom-muted">{{ whereUsed.truncated?.length ? t({ en: 'No product reached within the limit.', ja: '上限内では製品に届きません。' }) : t({ en: 'No product reached.', ja: '製品に届きません。' }) }}</p>
              <p v-if="whereUsed.truncated?.length" class="sc-bom-note" role="note">
                {{ t({
                  en: `Limit of ${limit} items reached at ${whereUsed.truncated.map(step => nameOf(step.nodeId)).join(', ')}: more not shown.`,
                  ja: `${whereUsed.truncated.map(step => nameOf(step.nodeId)).join(', ')} で上限の ${limit} 品目に達したため、残りは表示していません。`,
                }) }}
                <button type="button" @click="limit = Infinity">{{ t({ en: 'Show all', ja: 'すべて表示' }) }}</button>
              </p>
              <p v-else-if="limit === Infinity" class="sc-bom-muted">{{ t({ en: `All ${plural(whereUsed.nodeIds.length - 1, 'item')} above it are shown.`, ja: `上位の ${plural(whereUsed.nodeIds.length - 1, 'item')}をすべて表示しています。` }) }} <button type="button" class="sc-bom-link" @click="limit = 8">{{ t({ en: 'Limit to 8', ja: '8 件までにする' }) }}</button></p>
              <p v-if="leaked.length" class="sc-bom-muted" :aria-label="t({ en: 'Ignored alternate links', ja: '無視した代替リンク' })">
                {{ t({ en: `Alternate links are not followed: they would add ${leaked.map(nameOf).join(', ')}.`, ja: `代替リンクはたどりません。たどると ${leaked.map(nameOf).join(', ')} が加わります。` }) }}
              </p>
            </template>
            <template v-else>
              <h4>{{ t({ en: 'Approved alternates', ja: '承認済みの代替品' }) }}</h4>
              <ul v-if="alternateIds.length" class="sc-bom-list" :aria-label="t({ en: 'Alternate parts', ja: '代替部品' })">
                <li v-for="id in alternateIds" :key="id"><button type="button" @click="selectItem(id, 'where-used')">{{ nameOf(id) }}</button></li>
              </ul>
              <p v-else class="sc-bom-muted">{{ t({ en: 'No alternate parts.', ja: '代替部品はありません。' }) }}</p>
            </template>
          </template>
          <p v-else class="sc-bom-muted">{{ t({ en: 'Select a row or a node to see the assemblies and products that use the item.', ja: '行かノードを選ぶと、その品目を使うアセンブリと製品を表示します。' }) }}</p>
        </section>
      </aside>
    </div>

    <div class="sc-bom-bottom">
      <div class="sc-bom-canvas" @keydown.esc="clearGraphSelection">
        <NetworkGraph
          ref="graph" :nodes="graphNodes" :edges="graphEdges" unstyled-node-slots :height="460"
          :options="{ direction: 'LR', nodeWidth: 184, nodeHeight: 44, columnGap: 72, rowGap: 12 }"
          :selected-ids="linked.graph.value.selectedNodeIds" :highlighted-node-ids="graphHighlightedNodes"
          :highlighted-edge-ids="graphHighlightedEdges" :dimmed-ids="dimmedIds" :labels="{ ...labels.graph, region: t({ en: 'Item structure', ja: '品目の構成' }) }"
          @target-activate="onGraphActivate" @background-click="clearGraphSelection"
        >
          <template #node="{ node, box, selected, highlighted }">
            <g class="sc-bom-node" :class="{ 'sc-bom-is-selected': selected, 'sc-bom-is-on-path': highlighted, 'sc-bom-is-product': node.data.product }" :data-change="node.data.change">
              <rect class="sc-bom-node-box" :width="box.width" :height="box.height" rx="7" />
              <rect class="sc-bom-node-side" :width="5" :height="box.height" rx="2" :data-source="node.data.item.source" />
              <text class="sc-bom-node-pn" x="14" y="16">{{ node.data.item.pn }}<tspan v-if="node.data.change" class="sc-bom-node-change" dx="6">{{ kindLabel[node.data.change] }}</tspan></text>
              <text class="sc-bom-node-name" x="14" y="33">{{ node.label.length > 26 ? node.label.slice(0, 25) + '…' : node.label }}</text>
            </g>
          </template>
        </NetworkGraph>
        <div class="sc-bom-graph-foot">
          <label class="sc-bom-check"><input v-model="showParts" type="checkbox"> {{ t({ en: 'Show purchased parts', ja: '購入部品を表示' }) }}</label>
          <p class="sc-bom-hint">{{ t({
            en: 'Edges are usages labelled with their quantity; dashed edges link alternate parts. The path from the selected item to a product is highlighted. Click the empty canvas or press Escape to clear the selection.',
            ja: '辺は数量付きの使用関係で、破線は代替部品を結びます。選んだ品目から製品までの経路を強調表示します。何もない所をクリックするか Escape で選択を解除します。',
          }) }}</p>
        </div>
      </div>

      <section class="sc-bom-panel sc-bom-rollup" :aria-label="t({ en: 'Rollup', ja: '積み上げ' })">
        <div class="sc-bom-panel-head">
          <h3>{{ t({ en: 'Rollup', ja: '積み上げ' }) }}</h3>
          <select v-model="rollupProduct" :aria-label="t({ en: 'Rollup product', ja: '積み上げる製品' })">
            <option v-for="id in bom.roots" :key="id" :value="id">{{ nameOf(id) }}</option>
          </select>
        </div>
        <label class="sc-bom-check"><input v-model="purchasedOnly" type="checkbox"> {{ t({ en: 'Purchased parts only', ja: '購入部品のみ' }) }}</label>
        <p class="sc-bom-muted">{{ t({
          en: `Total quantity per item for one ${nameOf(rollupProduct)}: shared subassemblies are multiplied along every path. Demo code, not library behaviour.`,
          ja: `${nameOf(rollupProduct)} 1 台あたりの品目ごとの総数量です。共通のサブアセンブリはすべての経路に沿って掛け合わせます。ライブラリの機能ではなくデモのコードです。`,
        }) }}</p>
        <div class="sc-bom-rollup-scroll">
          <table :aria-label="t({ en: 'Rollup quantities', ja: '積み上げ数量' })">
            <thead><tr><th scope="col">{{ t({ en: 'Part', ja: '品番' }) }}</th><th scope="col">{{ t({ en: 'Name', ja: '名称' }) }}</th><th scope="col">{{ t({ en: 'Total', ja: '合計' }) }}</th></tr></thead>
            <tbody>
              <tr v-for="entry in rollup" :key="entry.item.id" :class="{ 'sc-bom-is-selected': entry.item.id === selectedItemId }">
                <td>{{ entry.item.pn }}</td>
                <td><button type="button" class="sc-bom-link" @click="selectItem(entry.item.id, 'rollup')">{{ entry.item.name }}</button></td>
                <td>{{ formatQty(entry.total) }} {{ entry.item.unit }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  </section>
</template>

<style>
.sc-bom {
  --vw-surface: #ffffff;
  --vw-surface-muted: #f4f6fa;
  --vw-text: #1b2333;
  --vw-muted: #5d6880;
  --vw-border: #dfe4ee;
  --vw-accent: #3555d8;
  --vw-dimmed-opacity: .22;
  --bom-added: #157a4a;
  --bom-changed: #a35a00;
  --bom-moved: #3555d8;
  --bom-removed: #b42335;
  color-scheme: light;
  padding: 20px;
  border: 1px solid #dfe4ee;
  border-radius: 16px;
  color: #1b2333;
  background: linear-gradient(180deg, #f7f9fd 0%, #eef2f8 100%);
}
.sc-bom button, .sc-bom input, .sc-bom select { font: inherit; color: inherit; }
.sc-bom :is(button, input, select):focus-visible { outline: 2px solid #3555d8; outline-offset: 2px; }
.sc-bom-head { display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: 12px 28px; margin-bottom: 14px; }
.sc-bom-head > div { flex: 1 1 520px; min-width: 0; }
.sc-bom h2 { margin: 0 0 4px; font-size: 19px; letter-spacing: -.01em; }
.sc-bom-head p { margin: 0; max-width: 96ch; font-size: 13px; line-height: 1.55; color: #4a5570; }
.sc-bom code { padding: 1px 5px; border-radius: 5px; background: #e6ebf7; color: #23367f; font: 12px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
.sc-bom-stats { display: flex; gap: 6px; margin: 0; }
.sc-bom-stats div { min-width: 78px; padding: 6px 12px; border: 1px solid #dfe4ee; border-radius: 10px; background: #fff; }
.sc-bom dt { font-size: 10px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: #6b7690; }
.sc-bom dd { margin: 2px 0 0; font-size: 17px; font-weight: 650; font-variant-numeric: tabular-nums; }

.sc-bom-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 14px; margin-bottom: 12px; }
.sc-bom-search { display: flex; align-items: center; gap: 8px; flex: 0 1 300px; height: 36px; padding: 0 12px; border: 1px solid #cfd6e4; border-radius: 10px; background: #fff; }
.sc-bom-search svg { width: 16px; flex: none; fill: none; stroke: #6b7690; stroke-width: 2; stroke-linecap: round; }
.sc-bom-search input { flex: 1; min-width: 0; border: 0; background: none; font-size: 13px; }
.sc-bom-search input:focus-visible { outline: none; }
.sc-bom-search:focus-within { border-color: #3555d8; box-shadow: 0 0 0 3px rgb(53 85 216 / 15%); }
.sc-bom-group { display: inline-flex; gap: 6px; }
.sc-bom .sc-bom-group button, .sc-bom .sc-bom-compare, .sc-bom-note button {
  height: 34px; padding: 0 12px; border: 1px solid #cfd6e4; border-radius: 9px; background: #fff; font-size: 12.5px; font-weight: 600; cursor: pointer;
}
.sc-bom .sc-bom-group button:disabled { opacity: .45; cursor: default; }
.sc-bom .sc-bom-compare[aria-pressed=true] { border-color: #3555d8; background: #3555d8; color: #fff; }
.sc-bom-legend { display: flex; flex-wrap: wrap; gap: 8px; margin: 0; padding: 0; list-style: none; font-size: 12px; color: #4a5570; font-variant-numeric: tabular-nums; }

.sc-bom-chip { display: inline-flex; align-items: center; height: 18px; padding: 0 6px; border-radius: 5px; font-size: 10.5px; font-weight: 700; letter-spacing: .02em; color: #fff; }
.sc-bom-chip[data-change=added] { background: var(--bom-added); }
.sc-bom-chip[data-change=changed] { background: var(--bom-changed); }
.sc-bom-chip[data-change=moved] { background: var(--bom-moved); }
.sc-bom-chip[data-change=removed] { background: var(--bom-removed); }

.sc-bom-main { display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: 14px; }
.sc-bom-grid { min-width: 0; }
.sc-bom .vw-tree-grid { border-radius: 12px; }
.sc-bom .vw-tree-grid-header-cell { gap: 6px; }
.sc-bom-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sc-bom-label.sc-bom-product { font-weight: 700; }
.sc-bom-label.sc-bom-match { padding: 0 3px; border-radius: 4px; background: #fff1b8; }
.sc-bom-pn { flex: none; color: #6b7690; font: 11px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
.sc-bom .vw-tree-grid-cell.vw-is-highlighted { background: #fff4e0; box-shadow: inset 0 -2px 0 var(--bom-changed); font-weight: 650; }
.sc-bom .vw-tree-grid-row:has(.sc-bom-chip[data-change=added]) { background: #ecf8f1; }
.sc-bom .vw-tree-grid-row:has(.sc-bom-chip[data-change=moved]) { background: #eef1fd; }
.sc-bom .vw-tree-grid-row:has(.sc-bom-chip[data-change=removed]) { background: #fdf0f1; color: #8a5560; }
.sc-bom .vw-tree-grid-row:has(.sc-bom-chip[data-change=removed]) .sc-bom-label { text-decoration: line-through; }
.sc-bom .vw-tree-grid-row.vw-is-highlighted:not(.vw-is-selected) > * { background-color: #e8eeff; }
.sc-bom-status { margin: 10px 0 0; min-height: 18px; font-size: 12.5px; font-weight: 550; }
.sc-bom-hint { margin: 4px 0 0; font-size: 11.5px; line-height: 1.5; color: #6b7690; }

.sc-bom-side { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
.sc-bom-panel { padding: 14px; border: 1px solid #dfe4ee; border-radius: 12px; background: #fff; }
.sc-bom-panel h3 { display: flex; align-items: center; gap: 8px; margin: 0; font-size: 14px; }
.sc-bom-panel h4 { margin: 10px 0 4px; font-size: 10.5px; letter-spacing: .08em; text-transform: uppercase; color: #6b7690; }
.sc-bom-panel-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.sc-bom-count { padding: 0 6px; border-radius: 999px; background: #e6ebf7; font-size: 11px; color: #23367f; }
.sc-bom-muted { margin: 6px 0 0; font-size: 12px; line-height: 1.5; color: #5d6880; }
.sc-bom-selected { margin: 8px 0 0; font-size: 13px; }
.sc-bom-selected small { color: #6b7690; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
.sc-bom-segmented { display: inline-flex; gap: 2px; padding: 2px; border-radius: 8px; background: #eef1f7; }
.sc-bom .sc-bom-segmented button { padding: 4px 9px; border: 0; border-radius: 6px; background: none; font-size: 11.5px; font-weight: 600; color: #4a5570; cursor: pointer; }
.sc-bom .sc-bom-segmented button[aria-pressed=true] { background: #fff; color: #1b2333; box-shadow: 0 1px 3px rgb(20 30 60 / 18%); }
.sc-bom-list, .sc-bom-changes { display: grid; gap: 3px; margin: 0; padding: 0; list-style: none; }
.sc-bom .sc-bom-list button, .sc-bom .sc-bom-changes button {
  display: flex; align-items: baseline; gap: 6px; width: 100%; padding: 5px 8px; border: 1px solid transparent; border-radius: 7px;
  background: #f4f6fa; font-size: 12.5px; text-align: start; cursor: pointer;
}
.sc-bom .sc-bom-list button:hover, .sc-bom .sc-bom-changes button:hover { border-color: #cfd6e4; }
.sc-bom .sc-bom-list button[aria-pressed=true] { border-color: #e0a100; background: #fff6d6; }
.sc-bom-list small { margin-inline-start: auto; color: #6b7690; font-size: 11px; white-space: nowrap; }
.sc-bom-changes { margin-top: 8px; max-height: 210px; overflow: auto; }
.sc-bom .sc-bom-changes button { align-items: flex-start; line-height: 1.4; }
.sc-bom .sc-bom-changes .sc-bom-chip { flex: none; margin-top: 1px; }
.sc-bom-note { margin: 8px 0 0; padding: 8px; border-radius: 8px; background: #fff6d6; font-size: 12px; line-height: 1.45; }
.sc-bom .sc-bom-note button { height: 26px; margin-top: 4px; }
.sc-bom .sc-bom-link { padding: 0; border: 0; background: none; color: #3555d8; text-align: start; cursor: pointer; text-decoration: underline; text-underline-offset: 2px; }

.sc-bom-bottom { display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: 14px; margin-top: 14px; }
.sc-bom-canvas { min-width: 0; }
.sc-bom .vw-network { border-radius: 12px; background: #fbfcfe; }
.sc-bom .sc-bom-node-box { fill: #fff; stroke: #c9d1e1; stroke-width: 1px; }
.sc-bom .sc-bom-node-side { fill: #8b97b3; }
.sc-bom .sc-bom-node-side[data-source=make] { fill: #3555d8; }
.sc-bom .sc-bom-is-product .sc-bom-node-box { fill: #eef1fd; stroke: #3555d8; stroke-width: 1.5px; }
.sc-bom .sc-bom-node-pn { fill: #5d6880; font: 600 10.5px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
.sc-bom .sc-bom-node-name { fill: #1b2333; font-size: 12px; font-weight: 600; }
.sc-bom .sc-bom-node-change { font-family: system-ui, sans-serif; font-weight: 700; }
.sc-bom .sc-bom-node[data-change=added] .sc-bom-node-box { stroke: var(--bom-added); stroke-width: 2px; }
.sc-bom .sc-bom-node[data-change=changed] .sc-bom-node-box { stroke: var(--bom-changed); stroke-width: 2px; }
.sc-bom .sc-bom-node[data-change=moved] .sc-bom-node-box { stroke: var(--bom-moved); stroke-width: 2px; }
.sc-bom .sc-bom-node[data-change=removed] .sc-bom-node-box { stroke: var(--bom-removed); stroke-width: 2px; stroke-dasharray: 5 3; fill: #fdf0f1; }
.sc-bom .sc-bom-node[data-change=added] .sc-bom-node-change { fill: var(--bom-added); }
.sc-bom .sc-bom-node[data-change=changed] .sc-bom-node-change { fill: var(--bom-changed); }
.sc-bom .sc-bom-node[data-change=moved] .sc-bom-node-change { fill: var(--bom-moved); }
.sc-bom .sc-bom-node[data-change=removed] .sc-bom-node-change { fill: var(--bom-removed); }
.sc-bom .sc-bom-is-on-path .sc-bom-node-box { fill: #fff6d6; stroke: #e0a100; stroke-width: 2px; }
.sc-bom .sc-bom-is-selected .sc-bom-node-box { stroke: #1b2333; stroke-width: 2.5px; }
.sc-bom .vw-network-edge { stroke: #a9b3c8; }
.sc-bom .vw-is-highlighted .vw-network-edge { stroke: #e0a100; stroke-width: 2.5px; }
.sc-bom .vw-edge-label { fill: #4a5570; font-size: 10.5px; font-weight: 600; }

.sc-bom-rollup { display: flex; flex-direction: column; min-width: 0; }
.sc-bom-rollup select { height: 30px; max-width: 190px; padding: 0 6px; border: 1px solid #cfd6e4; border-radius: 7px; background: #fff; font-size: 12px; }
.sc-bom-check { display: flex; align-items: center; gap: 6px; margin-top: 8px; font-size: 12px; }
.sc-bom-graph-foot { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 16px; }
.sc-bom-graph-foot .sc-bom-check { flex: none; }
.sc-bom-rollup-scroll { flex: 1; max-height: 340px; margin-top: 8px; overflow: auto; border: 1px solid #edf0f6; border-radius: 8px; }
.sc-bom-rollup table { width: 100%; border-collapse: collapse; font-size: 12px; }
.sc-bom-rollup th { position: sticky; top: 0; padding: 5px 8px; background: #f4f6fa; font-size: 10.5px; letter-spacing: .06em; text-transform: uppercase; text-align: start; color: #6b7690; }
.sc-bom-rollup td { padding: 4px 8px; border-top: 1px solid #edf0f6; }
.sc-bom-rollup td:first-child { font: 11px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; color: #5d6880; white-space: nowrap; }
.sc-bom-rollup td:last-child, .sc-bom-rollup th:last-child { text-align: end; white-space: nowrap; font-variant-numeric: tabular-nums; }
.sc-bom-rollup tr.sc-bom-is-selected td { background: #e8eeff; }
@media (max-width: 1000px) {
  .sc-bom-main, .sc-bom-bottom { grid-template-columns: minmax(0, 1fr); }
}
@media (max-width: 650px) {
  .sc-bom { padding: 12px; border-radius: 12px; }
  .sc-bom-stats div { min-width: 0; padding: 5px 8px; }
}
</style>
