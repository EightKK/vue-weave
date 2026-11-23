<script setup lang="ts">
import { computed } from 'vue'
import type { TransactionStatus } from '../../src'
import { useDemoLocale } from '../i18n'

// Reference save-status indicator (spec D1: peripheral UI lives in examples/). It only displays what useEditTransaction
// reports and asks the parent for the recovery actions; it never changes any document state itself.
const props = defineProps<{
  status: TransactionStatus
  /** The in-flight or unresolved operation. */
  pending?: { operationId: string; kind: 'changes' | 'restore'; source: string; baseVersion: string }
  /** The last rejected, conflicting or uncertain result. */
  result?: { status: string; code?: string; currentVersion?: string }
  /** Set by the parent when a submit resolved to `busy`. */
  busy?: boolean
  version: string
}>()
const emit = defineEmits<{ dismiss: []; reload: []; reconcile: [] }>()
const { t } = useDemoLocale()
const titlesJa: Record<string, string> = { idle: '保存済み', busy: '処理中', saving: '保存中', rejected: '拒否', conflict: '競合', uncertain: '結果不明' }

const kindText = computed(() => props.pending?.kind === 'restore'
  ? t({ en: 'restore (' + props.pending.source + ')', ja: '復元(' + props.pending.source + ')' })
  : t({ en: 'changes', ja: '変更' }))
const tone = computed(() => props.busy && props.status === 'idle' ? 'busy' : props.status)
const title = computed(() => t({ en: tone.value === 'idle' ? 'Saved' : tone.value[0]!.toUpperCase() + tone.value.slice(1), ja: titlesJa[tone.value] ?? tone.value }))
const message = computed(() => {
  if (props.status === 'saving') {
    return t({
      en: 'Saving ' + kindText.value + ' based on version ' + props.pending?.baseVersion + '. The chart shows the candidate; nothing is confirmed yet.',
      ja: '版 ' + props.pending?.baseVersion + ' をもとに' + kindText.value + 'を保存しています。チャートは候補を表示しており、まだ確定していません。',
    })
  }
  if (props.status === 'rejected') return t({ en: 'Rejected by the server (' + (props.result?.code ?? 'unknown') + '). Nothing changed.', ja: 'サーバーが拒否しました(' + (props.result?.code ?? '不明') + ')。何も変わっていません。' })
  if (props.status === 'conflict') {
    return t({
      en: 'Version conflict: the server is at version ' + props.result?.currentVersion + ', not ' + props.version + '. Nothing changed; load the latest version and redo the edit.',
      ja: '版の競合: サーバーは版 ' + props.version + ' ではなく版 ' + props.result?.currentVersion + ' です。何も変わっていません。最新の版を読み込んでから編集し直してください。',
    })
  }
  if (props.status === 'uncertain') {
    // `busy` here means the parent refused a further save until the unknown one is checked.
    return t({ en: 'Result unknown: the save may or may not have been applied. It is not resent automatically; check with the server.', ja: '結果不明: 保存が適用されたかどうかわかりません。自動では再送しないので、サーバーに確認してください。' })
      + (props.busy ? t({ en: ' Your last change was not saved: nothing else is saved until this one is checked.', ja: ' 直前の変更は保存されていません。確認が済むまでほかの変更は保存しません。' }) : '')
  }
  if (props.busy) return t({ en: 'Another save is still in progress. Try again when it has finished.', ja: '別の保存がまだ進行中です。終わってからもう一度試してください。' })
  return t({ en: 'Accepted version ' + props.version + '.', ja: '版 ' + props.version + ' を受理しました。' })
})
</script>

<template>
  <div class="save-status" :data-state="tone">
    <p role="status" :aria-label="t({ en: 'Save status', ja: '保存の状態' })"><strong>{{ title }}</strong> · {{ message }}</p>
    <span class="actions">
      <button v-if="status === 'uncertain'" type="button" @click="emit('reconcile')">{{ t({ en: 'Check with server', ja: 'サーバーに確認' }) }}</button>
      <button v-if="status === 'conflict' || status === 'uncertain'" type="button" @click="emit('reload')">{{ t({ en: 'Load latest version', ja: '最新の版を読み込む' }) }}</button>
      <!-- An unknown result is not dismissed: the save may have been applied, so only checking or reloading settles it. -->
      <button v-if="status === 'rejected' || status === 'conflict'" type="button" @click="emit('dismiss')">{{ t({ en: 'Dismiss save message', ja: '保存のメッセージを閉じる' }) }}</button>
    </span>
  </div>
</template>

<style scoped>
.save-status { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; border: 1px solid var(--vw-border, #c6d7e2); border-inline-start-width: 5px; border-radius: 6px; padding: 7px 10px; font-size: 12px; }
.save-status p { margin: 0; flex: 1 1 280px; }
.actions { display: inline-flex; gap: 6px; }
.save-status[data-state='saving'] { border-inline-start-color: #245e96; }
.save-status[data-state='rejected'], .save-status[data-state='conflict'] { border-inline-start-color: #b3261e; }
.save-status[data-state='uncertain'], .save-status[data-state='busy'] { border-inline-start-color: #b07400; }
.save-status[data-state='idle'] { border-inline-start-color: #1f7a4d; }
</style>
