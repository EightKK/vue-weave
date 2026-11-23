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
import DemoPanel from './components/DemoPanel.vue'
import StatusLine from './components/StatusLine.vue'
import { useDemoLocale } from './i18n'

const { t, labels } = useDemoLocale()

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
  rows: [task('survey', t({ en: 'Site survey', ja: '現地調査' }), 'ana', 3, true), task('design', t({ en: 'Design review', ja: '設計レビュー' }), 'ben', 4), task('weld', t({ en: 'Weld frames', ja: 'フレーム溶接' }), 'chen', 6), task('paint', t({ en: 'Paint', ja: '塗装' }), null, 2), task('ship', t({ en: 'Ship', ja: '出荷' }), 'ana', 1)],
  bars: [
    { id: 'survey', rowId: 'survey', label: t({ en: 'Site survey', ja: '現地調査' }), start: origin, end: origin + 2 * hour, editable: true },
    { id: 'design', rowId: 'design', label: t({ en: 'Design review', ja: '設計レビュー' }), start: origin + 2 * hour, end: origin + 5 * hour, editable: true },
    { id: 'weld', rowId: 'weld', label: t({ en: 'Weld frames', ja: 'フレーム溶接' }), start: origin + 5 * hour, end: origin + 9 * hour, editable: true },
    { id: 'paint', rowId: 'paint', label: t({ en: 'Paint', ja: '塗装' }), start: origin + 9 * hour, end: origin + 11 * hour, editable: true },
    { id: 'ship', rowId: 'ship', label: t({ en: 'Ship', ja: '出荷' }), start: origin + 11 * hour, end: origin + 12 * hour, editable: true },
  ],
  dependencies: [
    { id: 'survey-design', from: 'survey', to: 'design' }, { id: 'design-weld', from: 'design', to: 'weld' }, { id: 'weld-paint', from: 'weld', to: 'paint' },
  ],
}

const dataOf = (row: TimelineRow) => row.data as TaskData
const owners = [{ value: 'ana', label: t({ en: 'Ana', ja: 'アナ' }) }, { value: 'ben', label: t({ en: 'Ben', ja: 'ベン' }) }, { value: 'chen', label: t({ en: 'Chen', ja: 'チェン' }) }]
const ownerName = (value: string | null) => owners.find(owner => owner.value === value)?.label ?? ''

// ---- the mock server and the transaction adapter ----
// The server rounds effort to one decimal and, in conflict mode, lets "another writer" rename the first task first.
const server = createTransactionStore<Doc>(initial, {
  normalize: doc => ({ ...doc, rows: doc.rows.map(row => ({ ...row, data: { ...dataOf(row), effort: dataOf(row).effort === null ? null : Math.round(dataOf(row).effort! * 10) / 10 } })) }),
  remoteEdit: doc => ({ ...doc, rows: doc.rows.map((row, index) => index === 0 ? { ...row, label: row.label + t({ en: ' (edited remotely)', ja: '(他の利用者が編集)' }) } : row) }),
})
const bounds = (start: number, end: number) => start >= range.start && end <= range.end && end > start
const adapter: TransactionAdapter<Doc, Change> = {
  validate(doc, changes) {
    for (const change of changes) {
      if (change.type === 'replace') continue
      const bar = doc.bars.find(item => item.id === (change.type === 'move' ? change.barId : change.rowId))
      if (!bar) return t({ en: 'Unknown task ', ja: '不明なタスク ' }) + (change.type === 'move' ? change.barId : change.rowId)
      if (change.type === 'move' && !bounds(change.start, change.end)) return t({ en: 'The task must stay inside the chart range.', ja: 'タスクはチャートの範囲内に収めてください。' })
      if (change.type === 'field' && (change.fieldId === 'start' || change.fieldId === 'duration')) {
        const start = change.fieldId === 'start' ? change.value as number : bar.start
        const end = change.fieldId === 'start' ? start + (bar.end - bar.start) : bar.start + (change.value as number)
        if (!bounds(start, end)) return t({ en: 'The task must stay inside the chart range.', ja: 'タスクはチャートの範囲内に収めてください。' })
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
  onHistoryReset: reset => {
    resetNotice.value = t({
      en: 'History was reset because the document was refreshed to version ' + reset.version + ' (' + reset.reason + '). Undo starts from here.',
      ja: 'ドキュメントを版 ' + reset.version + ' に更新したため(' + reset.reason + ')、履歴をリセットしました。元に戻す操作はここから始まります。',
    })
  },
})
const busy = ref(false)
const notice = ref(t({ en: 'Edit a task: drag it, press the arrow keys on it, or edit a cell. Choose how the mock server answers first.', ja: 'タスクを編集してください。ドラッグ、矢印キー、セルの編集が使えます。先にモックサーバーの応答を選んでください。' }))
const shown = computed(() => tx.candidateState.value ?? tx.acceptedState.value)

function describe(outcome: TransactionOutcome<Doc>): string {
  if (outcome.status === 'accepted') return t({ en: 'Accepted by the server as version ' + outcome.version + '.', ja: 'サーバーが版 ' + outcome.version + ' として受理しました。' })
  if (outcome.status === 'invalid') return t({ en: 'Not sent: ', ja: '送信しませんでした: ' }) + outcome.reason
  if (outcome.status === 'busy') return t({ en: 'Not sent: another save is in progress.', ja: '送信しませんでした: 別の保存が進行中です。' })
  if (outcome.status === 'discarded') return t({ en: 'The answer was discarded because it no longer matches the document.', ja: '応答がドキュメントと合わなくなったため、破棄しました。' })
  if (outcome.status === 'rejected') return t({ en: 'Rejected by the server (' + outcome.code + '). Nothing changed.', ja: 'サーバーが拒否しました(' + outcome.code + ')。何も変わっていません。' })
  if (outcome.status === 'conflict') return t({ en: 'Conflict with version ' + outcome.currentVersion + '. Nothing changed.', ja: '版 ' + outcome.currentVersion + ' と競合しました。何も変わっていません。' })
  return t({ en: 'No answer. The save may or may not have been applied.', ja: '応答がありません。保存が適用されたかどうかは不明です。' })
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
  notice.value = t({ en: 'Loaded version ' + latest.version + ' from the server.', ja: 'サーバーから版 ' + latest.version + ' を読み込みました。' })
}
function checkWithServer() {
  const operationId = tx.pendingTransaction.value?.operationId
  if (!operationId) return
  // The server answers by operation ID. If it never applied the operation, the answer is a rejection.
  const stored: SaveResult<Doc> = server.lookup(operationId) ?? { status: 'rejected', operationId, code: 'not-applied' }
  const outcome = tx.reconcile(stored)
  notice.value = stored.status === 'accepted'
    ? t({ en: 'The server had applied the save. ', ja: 'サーバーは保存を適用していました。' }) + describe(outcome)
    : t({ en: 'The server never applied the save, so nothing changed.', ja: 'サーバーは保存を適用していなかったため、何も変わっていません。' })
}

// ---- columns, search and sort: useTimelineView state, saved with the JSON ----
const display = (row: TimelineRow) => shown.value.bars.find(bar => bar.id === row.id)!
const iso = (time: number) => new Date(time).toISOString().slice(0, 16).replace('T', ' ')
const columns: TimelineColumn[] = [
  { id: 'owner', label: t({ en: 'Owner', ja: '担当' }), width: 90, editable: true, value: row => ownerName(dataOf(row).owner),
    field: { id: 'owner', kind: 'select', choices: owners, get: row => dataOf(row).owner } },
  { id: 'effort', label: t({ en: 'Effort', ja: '工数' }), width: 62, editable: true, value: row => dataOf(row).effort ?? '',
    field: { id: 'effort', kind: 'number', min: 0, get: row => dataOf(row).effort } },
  { id: 'start', label: t({ en: 'Start', ja: '開始' }), width: 128, editable: true, value: row => iso(display(row).start),
    field: { id: 'start', kind: 'time', utcOffsetMinutes: 0, required: true, get: row => display(row).start } },
  { id: 'duration', label: t({ en: 'Duration', ja: '期間' }), width: 78, editable: true, value: row => (display(row).end - display(row).start) / hour + t({ en: ' h', ja: ' 時間' }),
    field: { id: 'duration', kind: 'duration', durationBasis: 'elapsed', unitSize: hour, unitLabel: t({ en: 'h', ja: '時間' }), required: true, min: hour / 4, get: row => display(row).end - display(row).start } },
  { id: 'done', label: t({ en: 'Done', ja: '完了' }), width: 56, editable: true, value: row => dataOf(row).done ? t({ en: 'Yes', ja: 'はい' }) : t({ en: 'No', ja: 'いいえ' }),
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
const jsonNotice = ref(t({ en: 'Save writes the accepted document and the view as JSON. Load applies pasted JSON as one saved change.', ja: '保存すると、受理済みのドキュメントと表示状態を JSON で書き出します。読み込むと、貼り付けた JSON を1つの保存として適用します。' }))
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
    metadata: { title: t({ en: 'Persistence demo', ja: '保存のデモ' }), savedAt: new Date().toISOString(), sourceVersion: tx.acceptedVersion.value },
  }, { space: 2, libraryVersion: '0.2' })
  jsonNotice.value = t({ en: 'Saved ' + doc.rows.length + ' tasks and the view as JSON (' + json.value.length + ' characters).', ja: 'タスク ' + doc.rows.length + ' 件と表示状態を JSON で保存しました(' + json.value.length + ' 文字)。' })
}
async function loadJson() {
  const parsed = parseWeaveSnapshot(json.value)
  if (!parsed.ok) { jsonNotice.value = t({ en: 'Cannot load: ', ja: '読み込めません: ' }) + parsed.diagnostics.map(item => item.message).join('; '); return }
  if (parsed.snapshot.kind !== 'timeline') { jsonNotice.value = t({ en: 'Cannot load: this demo reads timeline snapshots.', ja: '読み込めません: このデモが読み込めるのはタイムラインのスナップショットです。' }); return }
  const restored = restoreWeaveSnapshot(parsed.snapshot, registry)
  if (!restored.ok) { jsonNotice.value = t({ en: 'Cannot load: ', ja: '読み込めません: ' }) + restored.diagnostics.map(item => item.message).join('; '); return }
  const snapshot = restored.snapshot as RestoredTimelineSnapshot
  // The JSON is applied like any edit: through the server, based on the current version, as one transaction.
  const outcome = await submit([{ type: 'replace', doc: { rows: snapshot.rows, bars: snapshot.bars, dependencies: snapshot.dependencies } }])
  if (outcome.status !== 'accepted') { jsonNotice.value = t({ en: 'The JSON was not applied. ', ja: 'JSON は適用されませんでした。' }) + describe(outcome); return }
  const saved = snapshot.view
  const next: TimelineViewState = createTimelineViewState(columns, {
    ...(saved?.columns ? { columns: saved.columns.map(column => ({ id: column.id, visible: column.visible, width: column.width })) } : {}),
    search: saved?.search ? { text: saved.search.query, ...(saved.search.columnIds ? { columnIds: saved.search.columnIds } : {}) } : { text: '' },
    sort: (saved?.sort ?? []).map(rule => ({ ruleId: rule.columnId, direction: rule.direction })),
    collapsedIds: [...saved?.collapsedRowIds ?? []],
    ...(saved?.window ? { window: saved.window } : {}),
  })
  view.restore(next)
  jsonNotice.value = t({ en: 'Loaded ' + snapshot.rows.length + ' tasks and the saved view.', ja: 'タスク ' + snapshot.rows.length + ' 件と保存した表示状態を読み込みました。' })
}
</script>

<template>
  <DemoPanel title-id="persistence-title" :title="t({ en: 'Saved editing', ja: 'サーバー保存付きの編集' })" :subtitle="t({ en: 'Server-confirmed transactions, snapshot undo and redo, and JSON save and load · UTC', ja: 'サーバーが確認するトランザクション、スナップショットによる元に戻す・やり直し、JSON の保存と読み込み · UTC' })">
    <div class="persist-grid">
      <fieldset class="server">
        <legend>{{ t({ en: 'Mock server response', ja: 'モックサーバーの応答' }) }}</legend>
        <label v-for="mode in (t({ en: [['accept', 'Accept'], ['reject', 'Reject'], ['conflict', 'Version conflict'], ['uncertain', 'Result unknown']], ja: [['accept', '受理'], ['reject', '拒否'], ['conflict', '版の競合'], ['uncertain', '結果不明']] }) as [ServerMode, string][])" :key="mode[0]">
          <input v-model="server.info.mode" type="radio" name="server-mode" :value="mode[0]"> {{ mode[1] }}
        </label>
        <p class="hint">{{ t({
          en: `Server version ${server.info.version} · ${server.info.commits} commits. It updates only when the request's base version is current, ignores a repeated operation ID, and commits atomically.`,
          ja: `サーバーの版 ${server.info.version} · コミット ${server.info.commits} 件。要求の基準版が最新のときだけ更新し、同じ操作 ID の繰り返しは無視し、一括でコミットします。`,
        }) }}</p>
      </fieldset>
      <div class="options" role="group" :aria-label="t({ en: 'Saved history', ja: '保存の履歴' })">
        <button type="button" :disabled="!tx.canUndo.value || tx.status.value === 'saving'" @click="run(tx.undo())">{{ t({ en: 'Undo saved change', ja: '保存した変更を元に戻す' }) }}</button>
        <button type="button" :disabled="!tx.canRedo.value || tx.status.value === 'saving'" @click="run(tx.redo())">{{ t({ en: 'Redo saved change', ja: '保存した変更をやり直す' }) }}</button>
        <label>{{ t({ en: 'Search tasks', ja: 'タスクを検索' }) }} <input v-model="search" type="search"></label>
        <label>{{ t({ en: 'Sort by', ja: '並べ替え' }) }} <select v-model="sortColumn"><option value="">{{ t({ en: 'Document order', ja: 'ドキュメントの順' }) }}</option><option value="effort">{{ t({ en: 'Effort', ja: '工数' }) }}</option><option value="owner">{{ t({ en: 'Owner', ja: '担当' }) }}</option></select></label>
        <label v-for="column in columns" :key="column.id"><input type="checkbox" :checked="visible(column.id)" @change="view.setColumnVisible(column.id, ($event.target as HTMLInputElement).checked)"> {{ t({ en: `Show ${column.label} column`, ja: `${column.label}の列を表示` }) }}</label>
      </div>
    </div>
    <SaveStatus :status="tx.status.value" :pending="tx.pendingTransaction.value" :result="tx.result.value" :busy="busy" :version="tx.acceptedVersion.value"
      @dismiss="tx.clearResult(); busy = false" @reload="reloadLatest" @reconcile="checkWithServer" />
    <GanttChart :rows="view.projection.value.rows" :bars="view.projection.value.bars" :dependencies="view.projection.value.dependencies" :range="range"
      :columns="view.columns.value" :format-time="formatTime" :height="300" :label-width="150" :pixels-per-unit="72 / hour"
      :labels="{ ...labels.gantt, region: t({ en: 'Saved timeline', ja: '保存するタイムライン' }), rows: t({ en: 'Task', ja: 'タスク' }) }" @edit="move" @field-edit="editField">
      <template #row-heading>{{ t({ en: 'Task', ja: 'タスク' }) }}</template>
      <template #cell-editor="slot"><TypedCellEditor v-bind="slot" /></template>
    </GanttChart>
    <StatusLine :label="t({ en: 'Last action', ja: '最後の操作' })">{{ notice }}</StatusLine>
    <p v-if="resetNotice" class="status" role="status" :aria-label="t({ en: 'History reset', ja: '履歴のリセット' })">{{ resetNotice }}</p>
    <p v-if="view.projection.value.removedDependencyCount" class="hint">{{ t({ en: `${view.projection.value.removedDependencyCount} dependency link(s) hidden by the search.`, ja: `検索で依存関係 ${view.projection.value.removedDependencyCount} 件を非表示にしています。` }) }}</p>
    <div class="json">
      <div class="options"><button type="button" @click="saveJson">{{ t({ en: 'Save JSON', ja: 'JSON を保存' }) }}</button><button type="button" @click="loadJson">{{ t({ en: 'Load JSON', ja: 'JSON を読み込む' }) }}</button></div>
      <label class="json-box">{{ t({ en: 'Snapshot JSON', ja: 'スナップショットの JSON' }) }} <textarea v-model="json" rows="8" spellcheck="false" /></label>
      <StatusLine :label="t({ en: 'JSON status', ja: 'JSON の状態' })">{{ jsonNotice }}</StatusLine>
    </div>
  </DemoPanel>
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
