<script setup lang="ts" generic="T extends InspectorItem = InspectorItem">
// A form generated from typed field definitions for one item, for example the selected node of a diagram. It is
// controlled: a committed edit is checked with the typed-field rules and `validateChange`, then emitted as a `change`
// proposal, and the form keeps showing the item's values until the parent applies it. Text drafts are committed with
// Enter or on blur and dropped with Escape; selects, checkboxes and colours commit at once. When the inspected item, or
// the value under a draft, changes, the draft and its message are dropped (stale source data cancels the edit).
import { computed, reactive, ref, useId, watch } from 'vue'
import {
  checkInspectorFields, checkInspectorValue, inspectorFieldSpec, parseInspectorText, sameFieldValues, type InspectorChange, type InspectorChangeValidator,
  type InspectorField, type InspectorItem, type PropertyInspectorFieldSlot, type PropertyInspectorLabels,
} from '../core/diagramEditor.js'
import { fieldValuesEqual, formatFieldValue, type FieldValue } from '../core/fieldEditing.js'
import type { ChartDirection } from '../core/types.js'

const props = withDefaults(defineProps<{
  /** The inspected item; null or undefined shows the empty state. */
  item?: T | null
  fields: readonly InspectorField<T>[]
  /** Synchronous check of a change; false or a reason rejects it, shows the reason under the field and emits `change-rejected`. */
  validateChange?: InspectorChangeValidator<T>
  labels?: Partial<PropertyInspectorLabels>
  /** `rtl` writes `dir="rtl"` and adds `vw-rtl`; `auto` follows the inherited direction. Default `ltr`. */
  dir?: ChartDirection
}>(), { item: undefined, validateChange: undefined, dir: 'ltr' })

const emit = defineEmits<{
  /** Proposal to change one field; carries `id`, `field`, `before` and `after`. The parent updates the item to accept. */
  change: [change: InspectorChange]
  /** A change was rejected by `validateChange`; carries the proposal and the reason. */
  'change-rejected': [change: InspectorChange, reason: string]
}>()

defineSlots<{
  /** Replaces the text shown when no item is inspected. */
  empty?(): unknown
  /** `field-<id>` replaces the control of one field; the label, description and error stay. */
  [name: `field-${string}`]: ((props: PropertyInspectorFieldSlot<T>) => unknown) | undefined
}>()

const messages = computed<PropertyInspectorLabels>(() => ({
  region: 'Properties', empty: 'Nothing selected.', rejected: 'This change was rejected.', none: '(none)', ...props.labels,
}))
const base = useId()
const root = ref<HTMLFormElement>()

interface Draft { text: string; base: FieldValue }
interface FieldMessage { message: string; base: FieldValue; text?: string }
const drafts = reactive(new Map<string, Draft>())
const errors = reactive(new Map<string, FieldMessage>())

const fields = computed(() => {
  checkInspectorFields(props.fields)
  return props.fields
})
const values = computed<FieldValue[]>(() => {
  const item = props.item
  return item ? fields.value.map(field => field.get(item)) : []
})
const valueOf = (field: InspectorField<T>) => values.value[fields.value.indexOf(field)] ?? null

// Stale source data: another item, or a new value under a draft or message, drops that draft or message.
watch(() => props.item?.id, () => {
  drafts.clear()
  errors.clear()
})
watch(values, (next, previous) => {
  if (sameFieldValues(next, previous)) return
  fields.value.forEach((field, index) => {
    const value = next[index] ?? null
    const draft = drafts.get(field.id)
    if (draft && !fieldValuesEqual(draft.base, value)) drafts.delete(field.id)
    const error = errors.get(field.id)
    if (error && !fieldValuesEqual(error.base, value)) errors.delete(field.id)
  })
})
watch(() => props.fields.map(field => field.id).join('\u0000'), () => {
  const ids = new Set(props.fields.map(field => field.id))
  for (const id of [...drafts.keys()]) if (!ids.has(id)) drafts.delete(id)
  for (const id of [...errors.keys()]) if (!ids.has(id)) errors.delete(id)
})

const inputId = (index: number) => base + '-field-' + index
function describedBy(field: InspectorField<T>, index: number) {
  const ids = [field.description ? inputId(index) + '-description' : '', errors.has(field.id) ? inputId(index) + '-error' : ''].filter(Boolean)
  return ids.length ? ids.join(' ') : undefined
}
const formatted = (field: InspectorField<T>, value: FieldValue) => formatFieldValue(inspectorFieldSpec(field), value)
const textOf = (field: InspectorField<T>) => drafts.get(field.id)?.text ?? formatted(field, valueOf(field))

function fail(field: InspectorField<T>, message: string, text?: string) {
  errors.set(field.id, { message, base: valueOf(field), text })
  return false
}

function commit(field: InspectorField<T>, value: FieldValue, text?: string): boolean {
  const item = props.item
  if (!item || field.readonly) return false
  const before = field.get(item)
  const check = checkInspectorValue(field, value)
  if (!check.ok) return fail(field, check.error, text)
  if (fieldValuesEqual(before, value)) {
    drafts.delete(field.id)
    errors.delete(field.id)
    return true
  }
  const change: InspectorChange = { id: item.id, field: field.id, before, after: value }
  const verdict = props.validateChange?.(change, item)
  if (verdict === false || typeof verdict === 'string') {
    const reason = typeof verdict === 'string' && verdict.trim() ? verdict : messages.value.rejected
    if (text === undefined) drafts.delete(field.id)
    fail(field, reason, text)
    emit('change-rejected', change, reason)
    return false
  }
  drafts.delete(field.id)
  errors.delete(field.id)
  emit('change', change)
  return true
}

function commitText(field: InspectorField<T>, text: string): boolean {
  if (!props.item || field.readonly) return false
  const parsed = parseInspectorText(field, text)
  return parsed.ok ? commit(field, parsed.value, text) : fail(field, parsed.error, text)
}

function cancel(field: InspectorField<T>) {
  const had = drafts.has(field.id) || errors.has(field.id)
  drafts.delete(field.id)
  errors.delete(field.id)
  return had
}

function onInput(field: InspectorField<T>, event: Event) {
  const text = (event.target as HTMLInputElement).value
  drafts.set(field.id, { text, base: drafts.get(field.id)?.base ?? valueOf(field) })
  errors.delete(field.id)
}
function onTextKeydown(field: InspectorField<T>, event: KeyboardEvent) {
  if (event.isComposing) return
  if (event.key === 'Enter') {
    event.preventDefault()
    const draft = drafts.get(field.id)
    if (draft) commitText(field, draft.text)
  } else if (event.key === 'Escape' && cancel(field)) {
    event.preventDefault()
    event.stopPropagation()
    ;(event.target as HTMLInputElement).value = formatted(field, valueOf(field))
  }
}
function onBlur(field: InspectorField<T>) {
  const draft = drafts.get(field.id)
  // A draft that was already refused is not proposed again on blur; it stays with its message.
  if (draft && errors.get(field.id)?.text !== draft.text) commitText(field, draft.text)
}

// Selects, checkboxes and colours commit at once. The control is set back to the current value: the parent's update
// renders the new one, and a rejected change leaves the old one.
const choiceKey = (field: InspectorField<T>, value: FieldValue) => {
  const index = field.choices?.findIndex(choice => choice.value === value) ?? -1
  return index < 0 ? '' : String(index)
}
const isChosen = (field: InspectorField<T>, index: number) => {
  const value = valueOf(field), choice = field.choices![index]!.value
  return Array.isArray(value) ? value.includes(choice) : value === choice
}
function onSelect(field: InspectorField<T>, event: Event) {
  const select = event.target as HTMLSelectElement
  const choices = field.choices!
  const value: FieldValue = field.multiple
    ? [...select.selectedOptions].map(option => choices[Number(option.value)]!.value)
    : select.value === '' ? null : choices[Number(select.value)]!.value
  commit(field, value)
  if (field.multiple) [...select.options].forEach((option, index) => { option.selected = isChosen(field, index) })
  else select.value = choiceKey(field, valueOf(field))
}
function onCheck(field: InspectorField<T>, event: Event) {
  const input = event.target as HTMLInputElement
  commit(field, input.checked)
  input.checked = valueOf(field) === true
}
const colorOf = (field: InspectorField<T>) => {
  const value = valueOf(field)
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : '#000000'
}
function onColor(field: InspectorField<T>, event: Event) {
  const input = event.target as HTMLInputElement
  commit(field, input.value.toLowerCase())
  input.value = colorOf(field)
}

const rows = computed(() => fields.value.map((field, index) => ({
  field, index, id: inputId(index), value: valueOf(field), readonly: Boolean(field.readonly),
  error: errors.get(field.id)?.message, describedBy: describedBy(field, index),
})))
function slotProps(row: (typeof rows.value)[number]): PropertyInspectorFieldSlot<T> {
  return {
    field: row.field, item: props.item!, value: row.value, text: textOf(row.field), error: row.error, readonly: row.readonly,
    inputId: row.id, describedBy: row.describedBy,
    commit: value => commit(row.field, value), commitText: text => commitText(row.field, text), cancel: () => { cancel(row.field) },
  }
}

defineExpose({
  /** Moves keyboard focus to the control of a field. Returns false when the field is not shown. */
  focusField(id: string) {
    const index = fields.value.findIndex(field => field.id === id)
    const element = index < 0 ? null : root.value?.querySelector<HTMLElement>(`[id="${inputId(index)}"]`)
    element?.focus()
    return Boolean(element)
  },
  /** Drops every draft and message without a proposal. */
  cancelEdits() {
    drafts.clear()
    errors.clear()
  },
})
</script>

<template>
  <form ref="root" class="vw-inspector" :class="{ 'vw-rtl': dir === 'rtl' }" :dir="dir === 'rtl' ? 'rtl' : undefined"
    :aria-label="messages.region" novalidate @submit.prevent>
    <p v-if="!item" class="vw-inspector-empty"><slot name="empty">{{ messages.empty }}</slot></p>
    <template v-else>
      <div v-for="row in rows" :key="row.field.id" class="vw-inspector-field"
        :class="['vw-is-' + row.field.kind, { 'vw-is-readonly': row.readonly, 'vw-is-invalid': row.error }]">
        <label class="vw-inspector-label" :for="row.id">{{ row.field.label }}</label>
        <slot :name="`field-${row.field.id}`" v-bind="slotProps(row)">
          <input v-if="row.field.kind === 'checkbox'" :id="row.id" class="vw-inspector-check" type="checkbox"
            :checked="row.value === true" :disabled="row.readonly" :aria-describedby="row.describedBy"
            :aria-invalid="row.error ? 'true' : undefined" @change="onCheck(row.field, $event)">
          <select v-else-if="row.field.kind === 'select'" :id="row.id" class="vw-inspector-input" :multiple="row.field.multiple"
            :disabled="row.readonly" :aria-describedby="row.describedBy" :aria-invalid="row.error ? 'true' : undefined"
            @change="onSelect(row.field, $event)">
            <option v-if="!row.field.multiple && (!row.field.required || row.value === null)" value="" :selected="row.value === null">{{ messages.none }}</option>
            <option v-for="(choice, index) in row.field.choices" :key="index" :value="String(index)" :selected="isChosen(row.field, index)">
              {{ choice.label ?? String(choice.value) }}
            </option>
          </select>
          <span v-else-if="row.field.kind === 'color'" class="vw-inspector-color">
            <input :id="row.id" class="vw-inspector-swatch" type="color" :value="colorOf(row.field)" :disabled="row.readonly"
              :aria-describedby="row.describedBy" :aria-invalid="row.error ? 'true' : undefined" @change="onColor(row.field, $event)">
            <span class="vw-inspector-color-text" aria-hidden="true">{{ textOf(row.field) }}</span>
          </span>
          <input v-else :id="row.id" class="vw-inspector-input" type="text" autocomplete="off"
            :inputmode="row.field.kind === 'number' || row.field.kind === 'duration' ? 'decimal' : undefined"
            :value="textOf(row.field)" :readonly="row.readonly" :placeholder="row.field.placeholder"
            :aria-describedby="row.describedBy" :aria-invalid="row.error ? 'true' : undefined" :aria-required="row.field.required ? 'true' : undefined"
            @input="onInput(row.field, $event)" @keydown="onTextKeydown(row.field, $event)" @blur="onBlur(row.field)">
        </slot>
        <p v-if="row.field.description" :id="row.id + '-description'" class="vw-inspector-description">{{ row.field.description }}</p>
        <p v-if="row.error" :id="row.id + '-error'" class="vw-inspector-error" role="alert">{{ row.error }}</p>
      </div>
    </template>
  </form>
</template>
