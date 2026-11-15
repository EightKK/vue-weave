<script setup lang="ts">
import { computed } from 'vue'
import type { TransactionStatus } from '../../src'

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

const kindText = computed(() => props.pending?.kind === 'restore' ? 'restore (' + props.pending.source + ')' : 'changes')
const tone = computed(() => props.busy && props.status === 'idle' ? 'busy' : props.status)
const title = computed(() => tone.value === 'idle' ? 'Saved' : tone.value[0]!.toUpperCase() + tone.value.slice(1))
const message = computed(() => {
  if (props.status === 'saving') return 'Saving ' + kindText.value + ' based on version ' + props.pending?.baseVersion + '. The chart shows the candidate; nothing is confirmed yet.'
  if (props.status === 'rejected') return 'Rejected by the server (' + (props.result?.code ?? 'unknown') + '). Nothing changed.'
  if (props.status === 'conflict') return 'Version conflict: the server is at version ' + props.result?.currentVersion + ', not ' + props.version + '. Nothing changed; load the latest version and redo the edit.'
  if (props.status === 'uncertain') return 'Result unknown: the save may or may not have been applied. It is not resent automatically; check with the server.'
  if (props.busy) return 'Another save is still in progress. Try again when it has finished.'
  return 'Accepted version ' + props.version + '.'
})
</script>

<template>
  <div class="save-status" :data-state="tone">
    <p role="status" aria-label="Save status"><strong>{{ title }}</strong> · {{ message }}</p>
    <span class="actions">
      <button v-if="status === 'conflict'" type="button" @click="emit('reload')">Load latest version</button>
      <button v-if="status === 'uncertain'" type="button" @click="emit('reconcile')">Check with server</button>
      <button v-if="status === 'rejected' || status === 'conflict' || status === 'uncertain'" type="button" @click="emit('dismiss')">Dismiss save message</button>
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
