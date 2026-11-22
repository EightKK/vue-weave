// Data types and pure helpers of the diagram editor parts: the GraphPalette and PropertyInspector components. The
// components live in the Vue entry; the types are here so that servers and workers can build palettes and field
// definitions without Vue. `index.ts` exports the types and `graphPaletteMimeType` only.
import {
  fieldValuesEqual, parseFieldValue, validateFieldValue, type FieldCheck, type FieldParseResult, type FieldValue,
  type TimelineFieldKind, type TimelineFieldSpec,
} from './fieldEditing.js'
import { uniqueIds } from './ids.js'
import type { ChartTone, NetworkNodeShape } from './types.js'

/**
 * The MIME type under which GraphPalette puts the JSON payload `{ id, data }` of a dragged item into the HTML
 * `DataTransfer`. Read it back with `readPaletteDrop` (Vue entry).
 */
export const graphPaletteMimeType = 'application/x-vue-weave-palette+json'

/** One template of GraphPalette. `D` types the optional `data` payload; it defaults to `unknown`. */
export interface GraphPaletteItem<D = unknown> {
  /** Unique within the palette; the drag payload and the `insert` event carry it. */
  id: string
  label: string
  /** Shown under the label and searched by the filter box. */
  detail?: string
  /** The node outline drawn in the preview. Default `'box'`. */
  shape?: NetworkNodeShape
  /** The tone of the preview. Default `'blue'`. */
  tone?: ChartTone
  /** The heading of the section the item is listed under. Sections appear in the order of their first item. */
  section?: string
  /** Extra words the filter box matches, besides the label, detail and section. */
  keywords?: readonly string[]
  /** True lists the item but keeps it from being dragged or inserted. */
  disabled?: boolean
  /** Application data. It travels in the drag payload as JSON, so keep it JSON-safe. */
  data?: D
}

/** Texts and accessible names of GraphPalette. */
export interface GraphPaletteLabels {
  /** The accessible name of the list. */
  region: string
  /** The accessible name of the filter box (`searchable`). */
  search: string
  /** Shown when the filter matches no item. */
  noMatches: string
}

/** What `readPaletteDrop` reads from a drop: the item ID and the data it carried. */
export interface GraphPaletteDrop {
  id: string
  /** The `data` of the dragged item, parsed from JSON. It comes from the drag source; do not trust it blindly. */
  data?: unknown
}

/** The field kinds of PropertyInspector: the typed timeline field kinds plus `color` (`#rrggbb` text). */
export type InspectorFieldKind = TimelineFieldKind | 'color'

/** An item that PropertyInspector can edit. */
export interface InspectorItem {
  id: string
}

/**
 * One field of PropertyInspector. It is a typed field (`TimelineFieldSpec`: parsing, formatting and validation are
 * shared with GanttChart columns) whose getter reads the inspected item, plus a label and presentation options.
 */
export interface InspectorField<T extends InspectorItem = InspectorItem> extends Omit<TimelineFieldSpec, 'kind' | 'get'> {
  kind: InspectorFieldKind
  /** The visible label and accessible name of the control. */
  label: string
  /** The raw value of the item. */
  get: (item: T) => FieldValue
  /** Shows the value without letting it be edited. */
  readonly?: boolean
  /** Help text under the control; it also describes the control. */
  description?: string
  placeholder?: string
}

/** A change proposed by PropertyInspector. The parent applies `after` to the item's field to accept it. */
export interface InspectorChange {
  /** The ID of the inspected item. */
  id: string
  /** The ID of the field. */
  field: string
  before: FieldValue
  after: FieldValue
}

/** Synchronous check of an inspector change. Accept with true or undefined; reject with false or a reason. */
export type InspectorChangeValidator<T extends InspectorItem = InspectorItem> = (change: InspectorChange, item: T) => boolean | string | void

/** Texts and accessible names of PropertyInspector. */
export interface PropertyInspectorLabels {
  /** The accessible name of the form. */
  region: string
  /** Shown when no item is inspected. */
  empty: string
  /** The reason shown when `validateChange` returns false. */
  rejected: string
  /** The text of the empty choice of an optional `select` field. */
  none: string
}

/**
 * Props of a PropertyInspector field slot (`field-<id>`), which replaces the control of one field. Call `commit` with a
 * value or `commitText` with editor text to propose a change (both run the field checks and `validateChange` and return
 * whether the change was proposed or the value was unchanged), and `cancel` to drop an error or draft.
 */
export interface PropertyInspectorFieldSlot<T extends InspectorItem = InspectorItem> {
  field: InspectorField<T>
  item: T
  /** The current raw value of the field. */
  value: FieldValue
  /** The value as editor text. */
  text: string
  /** The parse, check or rejection message shown under the field. */
  error?: string
  readonly: boolean
  /** The ID that the field label points to; give it to your control. */
  inputId: string
  /** The IDs of the description and error, for `aria-describedby`. */
  describedBy?: string
  commit: (value: FieldValue) => boolean
  commitText: (text: string) => boolean
  cancel: () => void
}

// ---------------------------------------------------------------------------------------------------------------------
// Internal helpers of the components; not exported from the entries.

const hexColor = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i

/** `#rgb` or `#rrggbb` as lowercase `#rrggbb`, or undefined. */
export function normalizeHexColor(text: string): string | undefined {
  const trimmed = text.trim()
  if (!hexColor.test(trimmed)) return undefined
  const digits = trimmed.slice(1).toLowerCase()
  return '#' + (digits.length === 3 ? [...digits].map(digit => digit + digit).join('') : digits)
}

/** The typed field spec behind an inspector field. A `color` field is text whose built-in parser reads hex colours. */
export function inspectorFieldSpec(field: InspectorField<any>): TimelineFieldSpec<any> {
  if (field.kind !== 'color') return field as unknown as TimelineFieldSpec<any>
  return {
    ...field, kind: 'text',
    parse: field.parse ?? (text => normalizeHexColor(text) ?? { error: 'Not a colour (#rrggbb): ' + text.trim() }),
  }
}

/** Check a value of an inspector field. Colours must be `#rgb` or `#rrggbb` unless the field has its own parser. */
export function checkInspectorValue(field: InspectorField<any>, value: FieldValue): FieldCheck {
  const check = validateFieldValue(inspectorFieldSpec(field), value)
  if (!check.ok || field.kind !== 'color' || field.parse || typeof value !== 'string') return check
  return normalizeHexColor(value) ? check : { ok: false, code: 'invalid', error: 'Not a colour (#rrggbb): ' + value }
}

export function parseInspectorText(field: InspectorField<any>, text: string): FieldParseResult {
  return parseFieldValue(inspectorFieldSpec(field), text)
}

/** Throws for an invalid or duplicate field ID and for a kind the inspector cannot edit. */
export function checkInspectorFields(fields: readonly InspectorField<any>[]) {
  uniqueIds(fields, 'inspector field')
  for (const field of fields) {
    if (!['text', 'number', 'time', 'duration', 'select', 'checkbox', 'color'].includes(field.kind)) {
      throw new RangeError('Unknown inspector field kind: ' + String(field.kind) + ' (field ' + field.id + ')')
    }
    if (field.kind === 'select' && !field.choices) throw new Error('A select field needs choices: ' + field.id)
  }
}

/** One section of the palette: its heading (absent for items without a section) and its items in input order. */
export interface PaletteSection<D> {
  title?: string
  items: GraphPaletteItem<D>[]
}

/** Throws for an invalid or duplicate item ID. */
export function checkPaletteItems(items: readonly GraphPaletteItem<any>[]) {
  uniqueIds(items, 'palette item')
}

/**
 * The items that match a filter text, grouped into sections in the order of their first item. Every word of the
 * text must occur, ignoring case, in the label, detail, section or keywords of an item.
 */
export function paletteSections<D>(items: readonly GraphPaletteItem<D>[], query = ''): PaletteSection<D>[] {
  const words = query.toLocaleLowerCase().split(/\s+/).filter(Boolean)
  const sections = new Map<string | undefined, PaletteSection<D>>()
  for (const item of items) {
    if (words.length) {
      const text = [item.label, item.detail, item.section, ...(item.keywords ?? [])].filter(Boolean).join(' ').toLocaleLowerCase()
      if (!words.every(word => text.includes(word))) continue
    }
    let section = sections.get(item.section)
    if (!section) sections.set(item.section, section = item.section === undefined ? { items: [] } : { title: item.section, items: [] })
    section.items.push(item)
  }
  return [...sections.values()]
}

/** The `{ id, data }` payload of a drag, or undefined when the text is not one. */
export function parsePalettePayload(text: string | undefined): GraphPaletteDrop | undefined {
  if (!text) return undefined
  let payload: unknown
  try {
    payload = JSON.parse(text)
  } catch {
    return undefined
  }
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return undefined
  const { id, data } = payload as { id?: unknown; data?: unknown }
  if (typeof id !== 'string' || id === '') return undefined
  return data === undefined ? { id } : { id, data }
}

/** The JSON text of a drag payload. Data that cannot be serialised is left out. */
export function palettePayload(item: GraphPaletteItem<unknown>): string {
  if (item.data === undefined) return JSON.stringify({ id: item.id })
  try {
    return JSON.stringify({ id: item.id, data: item.data })
  } catch {
    return JSON.stringify({ id: item.id })
  }
}

/** True when two field value lists are equal, element by element. */
export function sameFieldValues(a: readonly FieldValue[], b: readonly FieldValue[]) {
  return a.length === b.length && a.every((value, index) => fieldValuesEqual(value, b[index]!))
}
