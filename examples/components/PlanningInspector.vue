<script setup lang="ts">
import { reactive, watch } from 'vue'
import { formatFieldValue, parseFieldValue, validateFieldValue, fieldValuesEqual, type FieldValue } from '../../src'
import type { InspectorField } from './types'

// Reference inspector (spec D1): edits the typed fields of one item. `spec.get(item)` is the raw getter, and the shared
// core helpers parse and check the text, so a number is never saved as a string. The parent decides what an edit means.
const props = defineProps<{
  title: string
  item?: unknown
  fields: readonly InspectorField[]
  /** Return a reason to reject a parsed value (a synchronous rule of the parent). */
  validate?: (fieldId: string, after: FieldValue) => string | void
}>()
const emit = defineEmits<{ edit: [change: { fieldId: string; before: FieldValue; after: FieldValue }] }>()

const drafts = reactive<Record<string, string>>({})
const errors = reactive<Record<string, string>>({})
const current = (field: InspectorField) => field.spec.get(props.item)
function reset() {
  for (const field of props.fields) {
    drafts[field.spec.id] = props.item === undefined ? '' : formatFieldValue(field.spec, current(field))
    delete errors[field.spec.id]
  }
}
watch(() => [props.item, props.fields], reset, { immediate: true })

function propose(field: InspectorField, after: FieldValue) {
  const id = field.spec.id
  const check = validateFieldValue(field.spec, after)
  if (!check.ok) { errors[id] = check.error; return }
  const reason = props.validate?.(id, after)
  if (typeof reason === 'string') { errors[id] = reason; return }
  delete errors[id]
  const before = current(field)
  if (!fieldValuesEqual(before, after)) emit('edit', { fieldId: id, before, after })
}
function commitText(field: InspectorField) {
  const parsed = parseFieldValue(field.spec, drafts[field.spec.id] ?? '')
  if (!parsed.ok) { errors[field.spec.id] = parsed.error; return }
  propose(field, parsed.value)
}
function cancel(field: InspectorField) {
  drafts[field.spec.id] = formatFieldValue(field.spec, current(field))
  delete errors[field.spec.id]
}
</script>

<template>
  <section class="inspector" aria-labelledby="inspector-title">
    <h3 id="inspector-title">{{ title }}</h3>
    <p v-if="item === undefined" class="hint">Select a bar to edit its task.</p>
    <template v-else>
      <div v-for="field in fields" :key="field.spec.id" class="field">
        <label :for="'inspect-' + field.spec.id">{{ field.label }}</label>
        <input v-if="field.spec.kind === 'checkbox'" :id="'inspect-' + field.spec.id" type="checkbox" :checked="current(field) === true"
          @change="propose(field, ($event.target as HTMLInputElement).checked)">
        <select v-else-if="field.spec.kind === 'select'" :id="'inspect-' + field.spec.id" :value="String(current(field) ?? '')"
          @change="propose(field, field.spec.choices?.find(choice => String(choice.value) === ($event.target as HTMLSelectElement).value)?.value ?? null)">
          <option v-if="!field.spec.required" value="">None</option>
          <option v-for="choice in field.spec.choices" :key="choice.value" :value="String(choice.value)">{{ choice.label ?? choice.value }}</option>
        </select>
        <input v-else :id="'inspect-' + field.spec.id" v-model="drafts[field.spec.id]" type="text" :aria-invalid="errors[field.spec.id] ? 'true' : undefined"
          :aria-describedby="errors[field.spec.id] ? 'inspect-error-' + field.spec.id : undefined"
          @keydown.enter.prevent="commitText(field)" @keydown.escape="cancel(field)" @change="commitText(field)">
        <span v-if="errors[field.spec.id]" :id="'inspect-error-' + field.spec.id" class="error" role="alert">{{ errors[field.spec.id] }}</span>
      </div>
    </template>
  </section>
</template>

<style scoped>
.inspector { border: 1px solid var(--vw-border, #d9e4ec); border-radius: 8px; padding: 10px; font-size: 12px; }
.inspector h3 { margin: 0 0 6px; font-size: 14px; }
.field { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; margin-bottom: 6px; }
.field input[type='text'], .field select { width: 100%; }
.error { color: #b3261e; }
.hint { color: var(--vw-muted, #4f6574); margin: 0; }
</style>
