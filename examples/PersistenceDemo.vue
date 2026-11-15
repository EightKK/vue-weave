<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  GanttChart, createTimelineViewState, parseWeaveSnapshot, restoreWeaveSnapshot, serializeWeaveSnapshot, useEditTransaction, useTimelineView,
  type FieldValue, type RestoredTimelineSnapshot, type SaveResult, type TimelineBar, type TimelineColumn, type TimelineDependency,
  type TimelineEdit, type TimelineFieldEdit, type TimelineRow, type TimelineViewState, type TransactionAdapter, type TransactionOutcome,
  type WeaveSnapshotRegistry,
} from '../src'
import { createTransactionStore, type ServerMode } from './adapters/transactionStore'
import SaveStatus from './components/SaveStatus.vue'
import TypedCellEditor from './components/TypedCellEditor.vue'
import { formatTime, hour, origin } from './data'

// Server-confirmed editing of one document: every user action is one transaction that the mock server accepts, rejects,
// answers with a version conflict, or leaves unknown. Undo and redo restore history snapshots through the same server.
// The saved JSON keeps the document's IDs and the view state of useTimelineView.
interface TaskData { owner: string | null; effort: number | null; done: boolean }
interface Doc { rows: TimelineRow[]; bars: TimelineBar[]; dependencies: TimelineDependency[] }
type Change =
  | { type: 'move'; barId: string; start: number; end: number }
  | { type: 'field'; rowId: string; fieldId: string; value: FieldValue }
  | { type: 'replace'; doc: Doc }

const range = { start: origin, end: origin + 16 * hour }
const task = (id: string, label: string, owner: string | null, effort: number | null, done = false): TimelineRow => ({ id, label, data: { owner, effort, done } satisfies TaskData })
const initial: Doc = {
  rows: [task('survey', 'Site survey', 'ana', 3, true), task('design', 'Design review', 'ben', 4), task('weld', 'Weld frames', 'chen', 6), task('paint', 'Paint', null, 2), task('ship', 'Ship', 'ana', 1)],
  bars: [
    { id: 'survey', rowId: 'survey', label: 'Site survey', start: origin, end: origin + 2 * hour, editable: true },
    { id: 'design', rowId: 'design', label: 'Design review', start: origin + 2 * hour, end: origin + 5 * hour, editable: true },
    { id: 'weld', rowId: 'weld', label: 'Weld frames', start: origin + 5 * hour, end: origin + 9 * hour, editable: true },
    { id: 'paint', rowId: 'paint', label: 'Paint', start: origin + 9 * hour, end: origin + 11 * hour, editable: true },
    { id: 'ship', rowId: 'ship', label: 'Ship', start: origin + 11 * hour, end: origin + 12 * hour, editable: true },
  ],
  dependencies: [
    { id: 'survey-design', from: 'survey', to: 'design' }, { id: 'design-weld', from: 'design', to: 'weld' }, { id: 'weld-paint', from: 'weld', to: 'paint' },
  ],
}

const dataOf = (row: TimelineRow) => row.data as TaskData
const owners = [{ value: 'ana', label: 'Ana' }, { value: 'ben', label: 'Ben' }, { value: 'chen', label: 'Chen' }]
const ownerName = (value: string | null) => owners.find(owner => owner.value === value)?.label ?? ''

// ---- the mock server and the transaction adapter ----
// The server rounds effort to one decimal and, in conflict mode, lets "another writer" rename the first task first.
const server = createTransactionStore<Doc>(initial, {
  normalize: doc => ({ ...doc, rows: doc.rows.map(row => ({ ...row, data: { ...dataOf(row), effort: dataOf(row).effort === null ? null : Math.round(dataOf(row).effort! * 10) / 10 } })) }),
  remoteEdit: doc => ({ ...doc, rows: doc.rows.map((row, index) => index === 0 ? { ...row, label: row.label + ' (edited remotely)' } : row) }),
})
const bounds = (start: number, end: number) => start >= range.start && end <= range.end && end > start
const adapter: TransactionAdapter<Doc, Change> = {
  validate(doc, changes) {
    for (const change of changes) {
      if (change.type === 'replace') continue
      const bar = doc.bars.find(item => item.id === (change.type === 'move' ? change.barId : change.rowId))
      if (!bar) return 'Unknown task ' + (change.type === 'move' ? change.barId : change.rowId)
      if (change.type === 'move' && !bounds(change.start, change.end)) return 'The task must stay inside the chart range.'
      if (change.type === 'field' && (change.fieldId === 'start' || change.fieldId === 'duration')) {
        const start = change.fieldId === 'start' ? change.value as number : bar.start
        const end = change.fieldId === 'start' ? start + (bar.end - bar.start) : bar.start + (change.value as number)
        if (!bounds(start, end)) return 'The task must stay inside the chart range.'
      }
    }
  },
  apply(doc, changes) {
    let next = doc
    for (const change of changes) {
      if (change.type === 'replace') next = change.doc
      else if (change.type === 'move') next = { ...next, bars: next.bars.map(bar => bar.id === change.barId ? { ...bar, start: change.start, end: change.end } : bar) }
      else if (change.fieldId === 'start' || change.fieldId === 'duration') {
        next = { ...next, bars: next.bars.map(bar => bar.id !== change.rowId ? bar : change.fieldId === 'start'
          ? { ...bar, start: change.value as number, end: (change.value as number) + (bar.end - bar.start) } : { ...bar, end: bar.start + (change.value as number) }) }
      } else {
        next = { ...next, rows: next.rows.map(row => row.id === change.rowId ? { ...row, data: { ...dataOf(row), [change.fieldId]: change.value } } : row) }
      }
    }
    return next
  },
  save: (request, candidate) => server.save(request, candidate),
}
const resetNotice = ref('')
const tx = useEditTransaction<Doc, Change>({
  documentId: 'persistence-demo', initialState: initial, initialVersion: server.info.version, adapter,
  onHistoryReset: reset => { resetNotice.value = 'History was reset because the document was refreshed to version ' + reset.version + ' (' + reset.reason + '). Undo starts from here.' },
})
const busy = ref(false)
const notice = ref('Edit a task: drag it, press the arrow keys on it, or edit a cell. Choose how the mock server answers first.')
const shown = computed(() => tx.candidateState.value ?? tx.acceptedState.value)

function describe(outcome: TransactionOutcome<Doc>): string {
  if (outcome.status === 'accepted') return 'Accepted by the server as version ' + outcome.version + '.'
  if (outcome.status === 'invalid') return 'Not sent: ' + outcome.reason
  if (outcome.status === 'busy') return 'Not sent: another save is in progress.'
  if (outcome.status === 'discarded') return 'The answer was discarded because it no longer matches the document.'
  if (outcome.status === 'rejected') return 'Rejected by the server (' + outcome.code + '). Nothing changed.'
  if (outcome.status === 'conflict') return 'Conflict with version ' + outcome.currentVersion + '. Nothing changed.'
  return 'No answer. The save may or may not have been applied.'
}
async function run(pending: Promise<TransactionOutcome<Doc>>) {
  resetNotice.value = ''
  const outcome = await pending
  busy.value = outcome.status === 'busy'
  notice.value = describe(outcome)
  return outcome
}
const submit = (changes: Change[], source: 'pointer' | 'keyboard' | 'api' = 'api') => run(tx.submit(changes, { source }))
const move = (edit: TimelineEdit) => submit([{ type: 'move', barId: edit.id, start: edit.after.start, end: edit.after.end }], edit.source)
const editField = (edit: TimelineFieldEdit) => submit([{ type: 'field', rowId: edit.rowId, fieldId: edit.fieldId, value: edit.after }], edit.source)
function reloadLatest() {
  const latest = server.fetch()
  tx.refresh(latest.state, latest.version)
  notice.value = 'Loaded version ' + latest.version + ' from the server.'
}
function checkWithServer() {
  const operationId = tx.pendingTransaction.value?.operationId
  if (!operationId) return
  // The server answers by operation ID. If it never applied the operation, the answer is a rejection.
  const stored: SaveResult<Doc> = server.lookup(operationId) ?? { status: 'rejected', operationId, code: 'not-applied' }
  const outcome = tx.reconcile(stored)
  notice.value = stored.status === 'accepted' ? 'The server had applied the save. ' + describe(outcome) : 'The server never applied the save, so nothing changed.'
}

// ---- columns, search and sort: useTimelineView state, saved with the JSON ----
const display = (row: TimelineRow) => shown.value.bars.find(bar => bar.id === row.id)!
const iso = (time: number) => new Date(time).toISOString().slice(0, 16).replace('T', ' ')
const columns: TimelineColumn[] = [
  { id: 'owner', label: 'Owner', width: 90, editable: true, value: row => ownerName(dataOf(row).owner),
    field: { id: 'owner', kind: 'select', choices: owners, get: row => dataOf(row).owner } },
  { id: 'effort', label: 'Effort', width: 62, editable: true, value: row => dataOf(row).effort ?? '',
    field: { id: 'effort', kind: 'number', min: 0, get: row => dataOf(row).effort } },
  { id: 'start', label: 'Start', width: 128, editable: true, value: row => iso(display(row).start),
    field: { id: 'start', kind: 'time', utcOffsetMinutes: 0, required: true, get: row => display(row).start } },
  { id: 'duration', label: 'Duration', width: 78, editable: true, value: row => (display(row).end - display(row).start) / hour + ' h',
    field: { id: 'duration', kind: 'duration', durationBasis: 'elapsed', unitSize: hour, unitLabel: 'h', required: true, min: hour / 4, get: row => display(row).end - display(row).start } },
  { id: 'done', label: 'Done', width: 56, editable: true, value: row => dataOf(row).done ? 'Yes' : 'No',
    field: { id: 'done', kind: 'checkbox', get: row => dataOf(row).done } },
]
const view = useTimelineView(() => ({ rows: shown.value.rows, bars: shown.value.bars, dependencies: shown.value.dependencies, columns }), createTimelineViewState(columns))
const search = computed({ get: () => view.state.value.search.text, set: text => view.setSearch(text) })
const sortColumn = computed({
  get: () => view.state.value.sort[0]?.ruleId ?? '',
  set: id => view.setSort(id ? [{ ruleId: id, direction: 'asc' }] : []),
})
const visible = (id: string) => view.state.value.columns.find(column => column.id === id)?.visible ?? true

// ---- JSON snapshot ----
const registry: WeaveSnapshotRegistry = {
  columns: Object.fromEntries(columns.map(({ id, ...definition }) => [id, definition])),
}
const json = ref('')
const jsonNotice = ref('Save writes the accepted document and the view as JSON. Load applies pasted JSON as one saved change.')
function saveJson() {
  const state = view.snapshot()
  const doc = tx.acceptedState.value
  json.value = serializeWeaveSnapshot({
    kind: 'timeline',
    data: { rows: doc.rows, bars: doc.bars, dependencies: doc.dependencies, range },
    view: {
      timeline: {
        columns: state.columns.map(column => ({ id: column.id, visible: column.visible, ...(column.width === undefined ? {} : { width: column.width }) })),
        ...(state.search.text ? { search: { query: state.search.text, ...(state.search.columnIds ? { columnIds: state.search.columnIds } : {}) } } : {}),
        sort: state.sort.map(rule => ({ columnId: rule.ruleId, direction: rule.direction })),
        collapsedRowIds: new Set(state.collapsedIds),
        ...(state.window ? { window: state.window } : {}),
      },
    },
    metadata: { title: 'Persistence demo', savedAt: new Date().toISOString(), sourceVersion: tx.acceptedVersion.value },
  }, { space: 2, libraryVersion: '0.2' })
  jsonNotice.value = 'Saved ' + doc.rows.length + ' tasks and the view as JSON (' + json.value.length + ' characters).'
}
async function loadJson() {
  const parsed = parseWeaveSnapshot(json.value)
  if (!parsed.ok) { jsonNotice.value = 'Cannot load: ' + parsed.diagnostics.map(item => item.message).join('; '); return }
  if (parsed.snapshot.kind !== 'timeline') { jsonNotice.value = 'Cannot load: this demo reads timeline snapshots.'; return }
  const restored = restoreWeaveSnapshot(parsed.snapshot, registry)
  if (!restored.ok) { jsonNotice.value = 'Cannot load: ' + restored.diagnostics.map(item => item.message).join('; '); return }
  const snapshot = restored.snapshot as RestoredTimelineSnapshot
  // The JSON is applied like any edit: through the server, based on the current version, as one transaction.
  const outcome = await submit([{ type: 'replace', doc: { rows: snapshot.rows, bars: snapshot.bars, dependencies: snapshot.dependencies } }])
  if (outcome.status !== 'accepted') { jsonNotice.value = 'The JSON was not applied. ' + describe(outcome); return }
  const saved = snapshot.view
  const next: TimelineViewState = createTimelineViewState(columns, {
    ...(saved?.columns ? { columns: saved.columns.map(column => ({ id: column.id, visible: column.visible, width: column.width })) } : {}),
    search: saved?.search ? { text: saved.search.query, ...(saved.search.columnIds ? { columnIds: saved.search.columnIds } : {}) } : { text: '' },
    sort: (saved?.sort ?? []).map(rule => ({ ruleId: rule.columnId, direction: rule.direction })),
    collapsedIds: [...saved?.collapsedRowIds ?? []],
    ...(saved?.window ? { window: saved.window } : {}),
  })
  view.restore(next)
  jsonNotice.value = 'Loaded ' + snapshot.rows.length + ' tasks and the saved view.'
}
</script>

<template>
  <section class="planning-panel" aria-labelledby="persistence-title">
    <div class="section-head">
      <div><h2 id="persistence-title">Saved editing</h2><p>Server-confirmed transactions, snapshot undo and redo, and JSON save and load · UTC</p></div>
    </div>
    <div class="persist-grid">
      <fieldset class="server">
        <legend>Mock server response</legend>
        <label v-for="mode in ([['accept', 'Accept'], ['reject', 'Reject'], ['conflict', 'Version conflict'], ['uncertain', 'Result unknown']] as [ServerMode, string][])" :key="mode[0]">
          <input v-model="server.info.mode" type="radio" name="server-mode" :value="mode[0]"> {{ mode[1] }}
        </label>
        <p class="hint">Server version {{ server.info.version }} · {{ server.info.commits }} commits. It updates only when the request's base version is current, ignores a repeated operation ID, and commits atomically.</p>
      </fieldset>
      <div class="options" role="group" aria-label="Saved history">
        <button type="button" :disabled="!tx.canUndo.value || tx.status.value === 'saving'" @click="run(tx.undo())">Undo saved change</button>
        <button type="button" :disabled="!tx.canRedo.value || tx.status.value === 'saving'" @click="run(tx.redo())">Redo saved change</button>
        <label>Search tasks <input v-model="search" type="search"></label>
        <label>Sort by <select v-model="sortColumn"><option value="">Document order</option><option value="effort">Effort</option><option value="owner">Owner</option></select></label>
        <label v-for="column in columns" :key="column.id"><input type="checkbox" :checked="visible(column.id)" @change="view.setColumnVisible(column.id, ($event.target as HTMLInputElement).checked)"> Show {{ column.label }} column</label>
      </div>
    </div>
    <SaveStatus :status="tx.status.value" :pending="tx.pendingTransaction.value" :result="tx.result.value" :busy="busy" :version="tx.acceptedVersion.value"
      @dismiss="tx.clearResult(); busy = false" @reload="reloadLatest" @reconcile="checkWithServer" />
    <GanttChart :rows="view.projection.value.rows" :bars="view.projection.value.bars" :dependencies="view.projection.value.dependencies" :range="range"
      :columns="view.columns.value" :format-time="formatTime" :height="300" :label-width="150" :pixels-per-unit="72 / hour"
      :labels="{ region: 'Saved timeline', rows: 'Task' }" @edit="move" @field-edit="editField">
      <template #row-heading>Task</template>
      <template #cell-editor="slot"><TypedCellEditor v-bind="slot" /></template>
    </GanttChart>
    <p class="status" role="status" aria-label="Last action">{{ notice }}</p>
    <p v-if="resetNotice" class="status" role="status" aria-label="History reset">{{ resetNotice }}</p>
    <p v-if="view.projection.value.removedDependencyCount" class="hint">{{ view.projection.value.removedDependencyCount }} dependency link(s) hidden by the search.</p>
    <div class="json">
      <div class="options"><button type="button" @click="saveJson">Save JSON</button><button type="button" @click="loadJson">Load JSON</button></div>
      <label class="json-box">Snapshot JSON <textarea v-model="json" rows="8" spellcheck="false" /></label>
      <p class="status" role="status" aria-label="JSON status">{{ jsonNotice }}</p>
    </div>
  </section>
</template>

<style scoped>
.persist-grid { display: grid; grid-template-columns: minmax(220px, 300px) 1fr; gap: 12px; margin-bottom: 10px; align-items: start; }
.server { border: 1px solid var(--vw-border, #d9e4ec); border-radius: 8px; font-size: 12px; margin: 0; display: grid; gap: 4px; }
.server .hint { margin: 4px 0 0; }
.persist-grid .options { flex-wrap: wrap; gap: 8px 14px; }
.json { margin-top: 12px; }
.json-box { display: flex; flex-direction: column; align-items: flex-start; gap: 3px; margin-top: 8px; font-size: 12px; }
.json-box textarea { width: 100%; font: 11px/1.4 ui-monospace, monospace; }
@media (max-width: 760px) { .persist-grid { grid-template-columns: 1fr; } }
</style>
