<script setup lang="ts" generic="T extends InspectorItem = InspectorItem">
// A form generated from typed field definitions for one item, for example the selected node of a diagram. It is
// controlled: a committed edit is checked with the typed-field rules and `validateChange`, then emitted as a `change`
// proposal, and the form keeps showing the item's values until the parent applies it. Text drafts are committed with
// Enter or on blur and dropped with Escape; selects, checkboxes and colours commit at once. When the inspected item, or
// the value under a draft, changes, the draft and its message are dropped (stale source data cancels the edit).
// List fields (`assignments`, `dependencies`) are small tables; each added, removed or changed row proposes the whole
// new list through `list-change`, checked with `validateInspectorList` and `validateListChange`.
import { computed, nextTick, reactive, ref, useId, watch } from 'vue'
import {
  checkInspectorFields, checkInspectorValue, inspectorFieldSpec, isInspectorListField, parseInspectorText, sameInspectorRows,
  validateInspectorList, type InspectorAssignment, type InspectorChange, type InspectorChangeValidator, type InspectorDependency,
  type InspectorField, type InspectorItem, type InspectorListChange, type InspectorListChangeValidator, type InspectorListField,
  type PropertyInspectorFieldSlot, type PropertyInspectorLabels,
} from '../core/diagramEditor.js'
import { fieldValuesEqual, formatFieldValue, type FieldValue } from '../core/fieldEditing.js'
import type { ChartDirection } from '../core/types.js'
import { dependencyTypes } from '../core/dependencyTypes.js'

const props = withDefaults(defineProps<{
  /** The inspected item; null or undefined shows the empty state. */
  item?: T | null
  /** Value fields, and list fields (`assignments`, `dependencies`) that render an editable table. */
  fields: readonly (InspectorField<T> | InspectorListField<T>)[]
  /** Synchronous check of a change; false or a reason rejects it, shows the reason under the field and emits `change-rejected`. */
  validateChange?: InspectorChangeValidator<T>
  /**
   * Synchronous check of a list field change, after `validateInspectorList`; false or a reason rejects it, shows the
   * reason under the table and emits `list-change-rejected`.
   */
  validateListChange?: InspectorListChangeValidator<T>
  labels?: Partial<PropertyInspectorLabels>
  /** `rtl` writes `dir="rtl"` and adds `vw-rtl`; `auto` follows the inherited direction. Default `ltr`. */
  dir?: ChartDirection
}>(), { item: undefined, validateChange: undefined, validateListChange: undefined, dir: 'ltr' })

const emit = defineEmits<{
  /** Proposal to change one field; carries `id`, `field`, `before` and `after`. The parent updates the item to accept. */
  change: [change: InspectorChange]
  /** A change was rejected by `validateChange`; carries the proposal and the reason. */
  'change-rejected': [change: InspectorChange, reason: string]
  /** Proposal to replace the rows of a list field; carries `id`, `field`, `kind` and the whole `before` and `after` lists. */
  'list-change': [change: InspectorListChange]
  /** A list change was rejected by `validateListChange`; carries the proposal and the reason. */
  'list-change-rejected': [change: InspectorListChange, reason: string]
}>()

defineSlots<{
  /** Replaces the text shown when no item is inspected. */
  empty?(): unknown
  /** `field-<id>` replaces the control of one value field; the label, description and error stay. List fields have no slot. */
  [name: `field-${string}`]: ((props: PropertyInspectorFieldSlot<T>) => unknown) | undefined
}>()

const messages = computed<Required<PropertyInspectorLabels>>(() => ({
  region: 'Properties', empty: 'Nothing selected.', rejected: 'This change was rejected.', none: '(none)',
  resource: 'Resource', units: 'Units', predecessor: 'Predecessor', type: 'Type', lag: 'Lag', for: 'for', remove: 'Remove',
  addAssignment: 'Add assignment', addDependency: 'Add dependency', noRows: 'None', ...props.labels,
}))
const base = useId()
const root = ref<HTMLFormElement>()

type AnyField = InspectorField<T> | InspectorListField<T>
type ListRow = InspectorAssignment | InspectorDependency
type Value = FieldValue | readonly ListRow[]
interface Draft { text: string; base: Value; field: string }
interface FieldMessage { message: string; base: Value; text?: string; field: string }
// Text drafts by field ID, and by field ID, row index and column for the units and lag boxes of list fields.
const drafts = reactive(new Map<string, Draft>())
// Messages keyed like the drafts: by field ID for a value field or a whole list (add, remove), and by cell for the
// controls of a list row, so that editing or cancelling one cell leaves the message of another cell alone.
const errors = reactive(new Map<string, FieldMessage>())
/** The message shown under a field: the latest one of the field or any of its cells. */
function fieldError(field: AnyField) {
  let found: FieldMessage | undefined
  for (const error of errors.values()) if (error.field === field.id) found = error
  return found
}

const fields = computed(() => {
  checkInspectorFields(props.fields)
  return props.fields
})
const values = computed<Value[]>(() => {
  const item = props.item
  return item ? fields.value.map(field => field.get(item as T)) : []
})
const sameValue = (field: AnyField, a: Value, b: Value) => isInspectorListField(field)
  ? Array.isArray(a) && Array.isArray(b) && sameInspectorRows(a as readonly ListRow[], b as readonly ListRow[])
  : fieldValuesEqual(a as FieldValue, b as FieldValue)
const valueOf = (field: InspectorField<T>) => (values.value[fields.value.indexOf(field)] ?? null) as FieldValue
const rowsOf = (field: InspectorListField<T>) => (values.value[fields.value.indexOf(field)] ?? []) as readonly ListRow[]

// Stale source data: another item, or a new value under a draft or message, drops that draft or message.
watch(() => props.item?.id, () => {
  drafts.clear()
  errors.clear()
})
watch(values, (next, previous) => {
  fields.value.forEach((field, index) => {
    const value = next[index] ?? null
    if (previous.length === next.length && sameValue(field, previous[index] ?? null, value)) return
    for (const [key, draft] of [...drafts]) if (draft.field === field.id && !sameValue(field, draft.base, value)) drafts.delete(key)
    for (const [key, error] of [...errors]) if (error.field === field.id && !sameValue(field, error.base, value)) errors.delete(key)
  })
})
watch(() => props.fields.map(field => field.id).join('\u0000'), () => {
  const ids = new Set(props.fields.map(field => field.id))
  for (const [key, draft] of [...drafts]) if (!ids.has(draft.field)) drafts.delete(key)
  for (const [key, error] of [...errors]) if (!ids.has(error.field)) errors.delete(key)
})

const inputId = (index: number) => base + '-field-' + index
function describedBy(field: AnyField, index: number) {
  const ids = [field.description ? inputId(index) + '-description' : '', fieldError(field) ? inputId(index) + '-error' : ''].filter(Boolean)
  return ids.length ? ids.join(' ') : undefined
}
const formatted = (field: InspectorField<T>, value: FieldValue) => formatFieldValue(inspectorFieldSpec(field), value)
const textOf = (field: InspectorField<T>) => drafts.get(field.id)?.text ?? formatted(field, valueOf(field))

/** Show a message for a field, or with `key` for one cell of a list field; the latest message is shown. */
function fail(field: AnyField, message: string, text?: string, key = field.id) {
  errors.delete(key)
  errors.set(key, { message, base: values.value[fields.value.indexOf(field)] ?? null, text, field: field.id })
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
  drafts.set(field.id, { text, base: drafts.get(field.id)?.base ?? valueOf(field), field: field.id })
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

// List fields. Every edit proposes the whole new list; the table keeps showing the item's rows until the parent applies it.
type ListColumn = 'units' | 'lag' | 'resourceId' | 'predecessorId' | 'type'
const rowKey = (row: ListRow) => 'resourceId' in row ? row.resourceId : row.predecessorId
const copyRow = (row: ListRow): ListRow => 'resourceId' in row
  ? { resourceId: row.resourceId, units: row.units }
  : { predecessorId: row.predecessorId, type: row.type, lag: row.lag }
function optionName(field: InspectorListField<T>, value: string) {
  return field.options.find(option => option.value === value)?.label ?? value
}
/** The key of one control of a list row, for its draft and its message. */
const cellKey = (field: InspectorListField<T>, index: number, column: ListColumn) => field.id + '\u0000' + index + '\u0000' + column
const cellInvalid = (field: InspectorListField<T>, index: number, column: ListColumn) => errors.has(cellKey(field, index, column)) ? 'true' : undefined
const lagSize = (field: InspectorListField<T>) => field.kind === 'dependencies' ? field.lagUnitSize ?? 1 : 1
function cellText(field: InspectorListField<T>, index: number, column: 'units' | 'lag') {
  const draft = drafts.get(cellKey(field, index, column))
  if (draft) return draft.text
  const row = rowsOf(field)[index] as unknown as Record<string, unknown> | undefined
  const value = Number(row?.[column] ?? 0) / (column === 'lag' ? lagSize(field) : 1)
  return String(Math.round(value * 1e6) / 1e6)
}

/**
 * Check and propose a new list. `key` names the control that made the edit (a cell, or the field itself for add and
 * remove): its draft and message are settled, while drafts and messages of other cells stay.
 */
function commitList(field: InspectorListField<T>, after: ListRow[], keepDraft?: string, key = field.id): boolean {
  const item = props.item
  if (!item || field.readonly) return false
  const before = field.get(item as T).map(copyRow)
  const check = validateInspectorList(field, after as InspectorAssignment[] | InspectorDependency[])
  if (!check.ok) return fail(field, check.error, keepDraft, key)
  const settled = () => {
    drafts.delete(key)
    errors.delete(key)
    errors.delete(field.id)
  }
  if (sameInspectorRows(before, after)) {
    settled()
    return true
  }
  const change = { id: item.id, field: field.id, kind: field.kind, before, after } as InspectorListChange
  const verdict = props.validateListChange?.(change, item as T)
  if (verdict === false || typeof verdict === 'string') {
    const reason = typeof verdict === 'string' && verdict.trim() ? verdict : messages.value.rejected
    if (keepDraft === undefined) drafts.delete(key)
    fail(field, reason, keepDraft, key)
    emit('list-change-rejected', change, reason)
    return false
  }
  settled()
  emit('list-change', change)
  return true
}
function changeRow(field: InspectorListField<T>, index: number, column: ListColumn, value: string | number, keepDraft?: string) {
  const after = rowsOf(field).map((row, at) => {
    const copy = copyRow(row)
    if (at === index && column in copy) (copy as unknown as Record<string, unknown>)[column] = value
    return copy
  })
  return commitList(field, after, keepDraft, cellKey(field, index, column))
}
function onRowSelect(field: InspectorListField<T>, index: number, key: 'resourceId' | 'predecessorId' | 'type', event: Event) {
  const select = event.target as HTMLSelectElement
  changeRow(field, index, key, select.value)
  // Show the applied value: the parent's update renders the new one, and a rejected change leaves the old one.
  const row = rowsOf(field)[index] as unknown as Record<string, unknown> | undefined
  if (row) select.value = String(row[key])
}
function onCellInput(field: InspectorListField<T>, index: number, column: 'units' | 'lag', event: Event) {
  const key = cellKey(field, index, column)
  drafts.set(key, { text: (event.target as HTMLInputElement).value, base: drafts.get(key)?.base ?? rowsOf(field), field: field.id })
  errors.delete(key)
}
function commitCell(field: InspectorListField<T>, index: number, column: 'units' | 'lag') {
  const key = cellKey(field, index, column)
  const draft = drafts.get(key)
  if (!draft) return true
  const unit = field.kind === 'dependencies' ? field.lagUnitLabel : undefined
  let text = draft.text.trim()
  if (unit && text.endsWith(unit)) text = text.slice(0, -unit.length).trim()
  let number = text === '' ? NaN : Number(text)
  // A lag typed in display units (`lagUnitSize`) becomes whole model units.
  if (column === 'lag' && field.kind === 'dependencies' && field.lagUnitSize !== undefined) number = Math.round(number * field.lagUnitSize)
  return changeRow(field, index, column, number, draft.text)
}
function onCellKeydown(field: InspectorListField<T>, index: number, column: 'units' | 'lag', event: KeyboardEvent) {
  if (event.isComposing) return
  if (event.key === 'Enter') {
    event.preventDefault()
    commitCell(field, index, column)
  } else if (event.key === 'Escape') {
    const key = cellKey(field, index, column)
    const had = drafts.delete(key)
    const error = errors.delete(key)
    if (!had && !error) return
    event.preventDefault()
    event.stopPropagation()
    ;(event.target as HTMLInputElement).value = cellText(field, index, column)
  }
}
function onCellBlur(field: InspectorListField<T>, index: number, column: 'units' | 'lag') {
  const key = cellKey(field, index, column)
  const draft = drafts.get(key)
  // A draft that was already refused is not proposed again on blur; it stays with its message.
  if (draft && errors.get(key)?.text !== draft.text) commitCell(field, index, column)
}
/** The first option that no row uses yet: the one an added row takes. */
const freeOption = (field: InspectorListField<T>) => {
  const used = new Set(rowsOf(field).map(rowKey))
  return field.options.find(option => !used.has(option.value))
}
function focusLater(selector: string) {
  void nextTick(() => root.value?.querySelector<HTMLElement>(selector)?.focus())
}
function addRow(field: InspectorListField<T>, index: number) {
  const option = freeOption(field)
  if (!option) return
  const added: ListRow = field.kind === 'assignments'
    ? { resourceId: option.value, units: field.defaultUnits ?? 1 }
    : { predecessorId: option.value, type: 'FS', lag: 0 }
  if (commitList(field, [...rowsOf(field).map(copyRow), added])) focusLater(`[data-vw-list="${inputId(index)}"] tbody tr:last-child select`)
}
function removeRow(field: InspectorListField<T>, index: number, fieldIndex: number) {
  // Focus moves to the add button once the row is gone, as the remove button goes with it.
  if (commitList(field, rowsOf(field).filter((_, at) => at !== index).map(copyRow))) focusLater(`[data-vw-list="${inputId(fieldIndex)}"] .vw-inspector-add`)
}
const listName = (field: InspectorListField<T>, heading: string, row: ListRow) => `${heading} ${messages.value.for} ${optionName(field, rowKey(row))}`

const rows = computed(() => fields.value.map((field, index) => {
  const common = {
    index, id: inputId(index), readonly: Boolean(field.readonly),
    error: fieldError(field)?.message, describedBy: describedBy(field, index),
  }
  if (!isInspectorListField(field)) {
    return { ...common, field: field as AnyField, valueField: field, value: valueOf(field), list: undefined, entries: [], canAdd: false }
  }
  const entries = rowsOf(field).map((row, at) => {
    const used = new Set(rowsOf(field).filter((_, other) => other !== at).map(rowKey))
    const key = rowKey(row)
    return {
      row, key, name: optionName(field, key),
      // A row naming an unknown resource or predecessor still shows it, so the select never changes it silently.
      options: [
        ...(field.options.some(option => option.value === key) ? [] : [{ value: key, label: key, disabled: false }]),
        ...field.options.map(option => ({ value: option.value, label: option.label ?? option.value, disabled: used.has(option.value) })),
      ],
    }
  })
  return { ...common, field: field as AnyField, valueField: undefined, value: null, list: field, entries, canAdd: Boolean(freeOption(field)) }
}))
type FieldRow = (typeof rows.value)[number]
function slotProps(row: FieldRow): PropertyInspectorFieldSlot<T> {
  const field = row.valueField!
  return {
    field, item: props.item!, value: valueOf(field), text: textOf(field), error: row.error, readonly: row.readonly,
    inputId: row.id, describedBy: row.describedBy,
    commit: value => commit(field, value), commitText: text => commitText(field, text), cancel: () => { cancel(field) },
  }
}

defineExpose({
  /** Moves keyboard focus to the control of a field. Returns false when the field is not shown. */
  focusField(id: string) {
    const index = fields.value.findIndex(field => field.id === id)
    const target = index < 0 ? null : root.value?.querySelector<HTMLElement>(`[id="${inputId(index)}"]`)
    // A list field's ID is on its table group: focus its first control.
    const element = target?.dataset.vwList ? target.querySelector<HTMLElement>('select, input, button:not(:disabled)') : target
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
        <label v-if="row.valueField" class="vw-inspector-label" :for="row.id">{{ row.field.label }}</label>
        <span v-else :id="row.id + '-label'" class="vw-inspector-label">{{ row.field.label }}</span>
        <slot v-if="row.valueField" :name="`field-${row.field.id}`" v-bind="slotProps(row)">
          <input v-if="row.valueField.kind === 'checkbox'" :id="row.id" class="vw-inspector-check" type="checkbox"
            :checked="row.value === true" :disabled="row.readonly" :aria-describedby="row.describedBy"
            :aria-invalid="row.error ? 'true' : undefined" @change="onCheck(row.valueField, $event)">
          <select v-else-if="row.valueField.kind === 'select'" :id="row.id" class="vw-inspector-input" :multiple="row.valueField.multiple"
            :disabled="row.readonly" :aria-describedby="row.describedBy" :aria-invalid="row.error ? 'true' : undefined"
            @change="onSelect(row.valueField, $event)">
            <option v-if="!row.valueField.multiple && (!row.valueField.required || row.value === null)" value="" :selected="row.value === null">{{ messages.none }}</option>
            <option v-for="(choice, index) in row.valueField.choices" :key="index" :value="String(index)" :selected="isChosen(row.valueField, index)">
              {{ choice.label ?? String(choice.value) }}
            </option>
          </select>
          <span v-else-if="row.valueField.kind === 'color'" class="vw-inspector-color">
            <input :id="row.id" class="vw-inspector-swatch" type="color" :value="colorOf(row.valueField)" :disabled="row.readonly"
              :aria-describedby="row.describedBy" :aria-invalid="row.error ? 'true' : undefined" @change="onColor(row.valueField, $event)">
            <span class="vw-inspector-color-text" aria-hidden="true">{{ textOf(row.valueField) }}</span>
          </span>
          <input v-else :id="row.id" class="vw-inspector-input" type="text" autocomplete="off"
            :inputmode="row.valueField.kind === 'number' || row.valueField.kind === 'duration' ? 'decimal' : undefined"
            :value="textOf(row.valueField)" :readonly="row.readonly" :placeholder="row.valueField.placeholder"
            :aria-describedby="row.describedBy" :aria-invalid="row.error ? 'true' : undefined" :aria-required="row.valueField.required ? 'true' : undefined"
            @input="onInput(row.valueField, $event)" @keydown="onTextKeydown(row.valueField, $event)" @blur="onBlur(row.valueField)">
        </slot>
        <div v-else-if="row.list" :id="row.id" class="vw-inspector-list" role="group" :data-vw-list="row.id" :aria-labelledby="row.id + '-label'"
          :aria-describedby="row.describedBy">
          <table v-if="row.entries.length" class="vw-inspector-table">
            <thead>
              <tr v-if="row.list.kind === 'assignments'">
                <th scope="col">{{ messages.resource }}</th><th scope="col">{{ messages.units }}</th>
                <th v-if="!row.readonly" scope="col"><span class="vw-sr-only">{{ messages.remove }}</span></th>
              </tr>
              <tr v-else>
                <th scope="col">{{ messages.predecessor }}</th><th scope="col">{{ messages.type }}</th><th scope="col">{{ messages.lag }}</th>
                <th v-if="!row.readonly" scope="col"><span class="vw-sr-only">{{ messages.remove }}</span></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(entry, at) in row.entries" :key="at">
                <td>
                  <select class="vw-inspector-input" :disabled="row.readonly"
                    :aria-label="listName(row.list, row.list.kind === 'assignments' ? messages.resource : messages.predecessor, entry.row)"
                    :aria-invalid="cellInvalid(row.list, at, row.list.kind === 'assignments' ? 'resourceId' : 'predecessorId')"
                    @change="onRowSelect(row.list, at, row.list.kind === 'assignments' ? 'resourceId' : 'predecessorId', $event)">
                    <option v-for="option in entry.options" :key="option.value" :value="option.value" :selected="option.value === entry.key"
                      :disabled="option.disabled">{{ option.label }}</option>
                  </select>
                </td>
                <td v-if="row.list.kind === 'dependencies'">
                  <select class="vw-inspector-input vw-inspector-type" :disabled="row.readonly" :aria-label="listName(row.list, messages.type, entry.row)"
                    :aria-invalid="cellInvalid(row.list, at, 'type')"
                    @change="onRowSelect(row.list, at, 'type', $event)">
                    <option v-for="type in dependencyTypes" :key="type" :value="type" :selected="'type' in entry.row && entry.row.type === type">{{ type }}</option>
                  </select>
                </td>
                <td>
                  <span class="vw-inspector-number">
                    <input class="vw-inspector-input" type="text" inputmode="decimal" autocomplete="off" :readonly="row.readonly"
                      :value="cellText(row.list, at, row.list.kind === 'assignments' ? 'units' : 'lag')"
                      :aria-label="listName(row.list, row.list.kind === 'assignments' ? messages.units : messages.lag, entry.row)"
                      :aria-invalid="cellInvalid(row.list, at, row.list.kind === 'assignments' ? 'units' : 'lag')"
                      @input="onCellInput(row.list, at, row.list.kind === 'assignments' ? 'units' : 'lag', $event)"
                      @keydown="onCellKeydown(row.list, at, row.list.kind === 'assignments' ? 'units' : 'lag', $event)"
                      @blur="onCellBlur(row.list, at, row.list.kind === 'assignments' ? 'units' : 'lag')">
                    <span v-if="row.list.kind === 'dependencies' && row.list.lagUnitLabel" class="vw-inspector-unit" aria-hidden="true">{{ row.list.lagUnitLabel }}</span>
                  </span>
                </td>
                <td v-if="!row.readonly">
                  <button type="button" class="vw-inspector-remove" :aria-label="`${messages.remove} ${entry.name}`"
                    @click="removeRow(row.list, at, row.index)"><span aria-hidden="true">×</span></button>
                </td>
              </tr>
            </tbody>
          </table>
          <p v-else class="vw-inspector-none">{{ messages.noRows }}</p>
          <button v-if="!row.readonly" type="button" class="vw-inspector-add" :disabled="!row.canAdd" @click="addRow(row.list, row.index)">
            {{ row.list.kind === 'assignments' ? messages.addAssignment : messages.addDependency }}
          </button>
        </div>
        <p v-if="row.field.description" :id="row.id + '-description'" class="vw-inspector-description">{{ row.field.description }}</p>
        <p v-if="row.error" :id="row.id + '-error'" class="vw-inspector-error" role="alert">{{ row.error }}</p>
      </div>
    </template>
  </form>
</template>
