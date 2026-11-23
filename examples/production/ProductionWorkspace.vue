<script setup lang="ts">
// The four views of the production demo over one saved document: the save bar (status, app-wide undo and redo, and the
// mock server's next answer) and the tabs. Demo.vue and ProductionShowcase.vue only add their own headers around it.
import SaveStatus from '../components/SaveStatus.vue'
import type { ServerMode } from '../adapters/transactionStore'
import ApprovalFlow from './ApprovalFlow.vue'
import LotFlow from './LotFlow.vue'
import ProductionPlan from './ProductionPlan.vue'
import WorkSheet from './WorkSheet.vue'
import type { Copy } from './copy'
import { provideProductionWorkspace } from './workspace'

defineProps<{ text: Copy; ja: boolean; view: 'planning' | 'lot' | 'approval' | 'sheet' }>()
const workspace = provideProductionWorkspace()
const { transaction, server } = workspace
const modes: ServerMode[] = ['accept', 'reject', 'conflict', 'uncertain']
</script>

<template>
  <div class="production-savebar" role="group" :aria-label="text.saving">
    <SaveStatus :status="transaction.status.value" :pending="transaction.pendingTransaction.value" :result="transaction.result.value"
      :busy="workspace.busy.value" :version="transaction.acceptedVersion.value"
      @dismiss="workspace.dismiss" @reload="workspace.reload" @reconcile="workspace.reconcile" />
    <div class="production-actions">
      <button type="button" :disabled="!transaction.canUndo.value || workspace.saving.value" @click="workspace.undo">{{ text.undo }}</button>
      <button type="button" :disabled="!transaction.canRedo.value || workspace.saving.value" @click="workspace.redo">{{ text.redo }}</button>
      <label>{{ text.serverMode }}
        <select v-model="server.info.mode">
          <option v-for="mode in modes" :key="mode" :value="mode">{{ text.serverModes[mode] }}</option>
        </select>
      </label>
    </div>
  </div>
  <KeepAlive>
    <ProductionPlan v-if="view === 'planning'" :text="text" />
    <LotFlow v-else-if="view === 'lot'" :text="text" :is-japanese="ja" />
    <ApprovalFlow v-else-if="view === 'approval'" :ja="ja" />
    <WorkSheet v-else :ja="ja" />
  </KeepAlive>
</template>
