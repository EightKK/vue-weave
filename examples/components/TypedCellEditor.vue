<script setup lang="ts">
import { computed, ref } from 'vue'
import { formatFieldValue, type FieldCheck, type FieldValue, type TimelineColumn, type TimelineFieldSpec } from '../../src'

// Reference editor for the GanttChart `cell-editor` slot (spec D1). Pass the slot props straight through:
//   <template #cell-editor="slot"><TypedCellEditor v-bind="slot" /></template>
// number, time, duration and text fields use one text input that the field spec parses (Enter commits, Escape cancels);
// select and checkbox commit on change. A rejected value stays open with the error announced.
const props = defineProps<{
  column: TimelineColumn<any>
  field: TimelineFieldSpec<any>
  value: FieldValue
  draft: FieldValue
  validation: FieldCheck
  error: string | undefined
  commit: (value: FieldValue) => FieldCheck
  commitText: (text: string) => FieldCheck
  cancel: () => void
}>()

const text = ref(formatFieldValue(props.field, props.draft))
const name = computed(() => props.column.label + ' editor')
const errorId = computed(() => 'cell-editor-error-' + props.column.id)
const hint = computed(() => {
  const { kind, utcOffsetMinutes, durationBasis, unitLabel, integer } = props.field
  if (kind === 'time') return 'YYYY-MM-DD HH:mm' + (utcOffsetMinutes === 0 ? ' (UTC)' : '')
  if (kind === 'duration') return (durationBasis === 'working' ? 'Working' : 'Elapsed') + ' time' + (unitLabel ? ' in ' + unitLabel : '')
  if (kind === 'number') return integer ? 'Whole number' : 'Number'
  return ''
})
function choose(event: Event) {
  const selected = (event.target as HTMLSelectElement).value
  props.commit(props.field.choices?.find(choice => String(choice.value) === selected)?.value ?? null)
}
</script>

<template>
  <span class="typed-editor">
    <input v-if="field.kind === 'checkbox'" type="checkbox" :aria-label="name" :checked="draft === true"
      @change="commit(($event.target as HTMLInputElement).checked)" @keydown.escape.prevent="cancel()">
    <select v-else-if="field.kind === 'select'" :aria-label="name" :value="String(draft ?? '')" :aria-invalid="validation.ok ? undefined : 'true'"
      @change="choose" @keydown.escape.prevent="cancel()">
      <option v-if="!field.required" value="">None</option>
      <option v-for="choice in field.choices" :key="choice.value" :value="String(choice.value)">{{ choice.label ?? choice.value }}</option>
    </select>
    <input v-else v-model="text" type="text" :inputmode="field.kind === 'number' || field.kind === 'duration' ? 'decimal' : undefined" :aria-label="name"
      :aria-invalid="validation.ok ? undefined : 'true'" :aria-describedby="error ? errorId : undefined" :placeholder="hint"
      @keydown.enter.prevent="commitText(text)" @keydown.escape.prevent="cancel()">
    <span v-if="error" :id="errorId" class="error" role="alert">{{ error }}</span>
  </span>
</template>

<style scoped>
.typed-editor { display: inline-flex; flex-direction: column; gap: 2px; min-width: 0; max-width: 100%; }
.typed-editor input[type='text'], .typed-editor select { width: 100%; min-width: 0; font-size: 12px; }
.error { color: #b3261e; font-size: 10px; white-space: normal; }
</style>
