// Data types and pure helpers of the diagram editor parts: the GraphPalette and PropertyInspector components. The
// components live in the Vue entry; the types are here so that servers and workers can build palettes and field
// definitions without Vue. `index.ts` exports the types, `graphPaletteMimeType` and `validateInspectorList` only.
import {
  parseFieldValue, validateFieldValue, type FieldCheck, type FieldParseResult, type FieldValue,
  type TimelineFieldKind, type TimelineFieldSpec,
} from './fieldEditing.js'
import { isDependencyType } from './dependencyTypes.js'
import { uniqueIds } from './ids.js'
import type { ChartTone, NetworkNodeShape, TimelineDependencyType } from './types.js'

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
  /** Column heading of the resource select of an `assignments` field. Default "Resource". */
  resource?: string
  /** Column heading of the units box of an `assignments` field. Default "Units". */
  units?: string
  /** Column heading of the predecessor select of a `dependencies` field. Default "Predecessor". */
  predecessor?: string
  /** Column heading of the type select of a `dependencies` field. Default "Type". */
  type?: string
  /** Column heading of the lag box of a `dependencies` field. Default "Lag". */
  lag?: string
  /** Word between a column heading and the row's resource or predecessor in accessible names ("Units for Crane"). Default "for". */
  for?: string
  /** Accessible name prefix of a row's remove button, followed by its resource or predecessor. Default "Remove". */
  remove?: string
  /** Text of the add button of an `assignments` field. Default "Add assignment". */
  addAssignment?: string
  /** Text of the add button of a `dependencies` field. Default "Add dependency". */
  addDependency?: string
  /** Shown in a list field without rows. Default "None". */
  noRows?: string
}

/** The list field kinds of PropertyInspector: a table of resource assignments and a table of predecessor dependencies. */
export type InspectorListFieldKind = 'assignments' | 'dependencies'

/** A choice of a list field: a resource of an `assignments` field or a predecessor of a `dependencies` field. */
export interface InspectorOption {
  value: string
  /** Shown in the select and in the accessible names of the row. Default: `value`. */
  label?: string
}

/** One row of an `assignments` field. With the inspected task's ID it is a `ResourceAssignment`. */
export interface InspectorAssignment {
  resourceId: string
  /** Share of the resource, as in `ResourceAssignment`: a positive safe integer, for example a percentage. */
  units: number
}

/** One row of a `dependencies` field: a link from `predecessorId` to the inspected item, like a `ScheduleLink`. */
export interface InspectorDependency {
  predecessorId: string
  type: TimelineDependencyType
  /** Lag in model time units, a safe integer; negative values allow overlap. */
  lag: number
}

interface InspectorListFieldBase {
  id: string
  /** The visible label and the accessible name of the table. */
  label: string
  /** The resources or predecessors a row can name, in the order the selects list them. */
  options: readonly InspectorOption[]
  /** Shows the rows without letting them be edited. */
  readonly?: boolean
  /** Help text under the table; it also describes the table. */
  description?: string
}

/** A PropertyInspector table of resource assignments: a resource select, a units box and add and remove buttons. */
export interface InspectorAssignmentsField<T extends InspectorItem = InspectorItem> extends InspectorListFieldBase {
  kind: 'assignments'
  get: (item: T) => readonly InspectorAssignment[]
  /** Units of an added row, a positive integer. Default 1. */
  defaultUnits?: number
  /** Largest allowed units, a positive integer. Default: no limit. */
  maxUnits?: number
}

/** A PropertyInspector table of predecessor dependencies: a predecessor select, a type select, a lag box and add and remove buttons. */
export interface InspectorDependenciesField<T extends InspectorItem = InspectorItem> extends InspectorListFieldBase {
  kind: 'dependencies'
  get: (item: T) => readonly InspectorDependency[]
  /** Model units in one displayed lag unit, for example 3600000 to edit milliseconds as hours. Default 1. A lag typed in display units is rounded to whole model units. */
  lagUnitSize?: number
  /** Suffix shown after the lag box, such as `h`. */
  lagUnitLabel?: string
}

/** A list field of PropertyInspector, listed in `fields` beside the value fields. */
export type InspectorListField<T extends InspectorItem = InspectorItem> = InspectorAssignmentsField<T> | InspectorDependenciesField<T>

/**
 * A change of a list field proposed by PropertyInspector (`list-change`): the whole table before and after one edit
 * (a row added, removed or changed). The parent replaces the item's rows with `after` to accept it.
 */
export type InspectorListChange =
  | { id: string; field: string; kind: 'assignments'; before: InspectorAssignment[]; after: InspectorAssignment[] }
  | { id: string; field: string; kind: 'dependencies'; before: InspectorDependency[]; after: InspectorDependency[] }

/** Synchronous check of a list change. Accept with true or undefined; reject with false or a reason. */
export type InspectorListChangeValidator<T extends InspectorItem = InspectorItem> = (change: InspectorListChange, item: T) => boolean | string | void

/**
 * Check the rows of an `assignments` or `dependencies` field: every resource or predecessor is one of `options` and
 * appears once, units are positive safe integers (and at most `maxUnits`) as `ResourceAssignment` requires, types are
 * FS, SS, FF or SF, and lags are safe integers, as schedule links require. PropertyInspector runs it before
 * `validateListChange`; servers can run it on submitted rows.
 */
export function validateInspectorList(
  field: InspectorListField<any>, rows: readonly InspectorAssignment[] | readonly InspectorDependency[],
): FieldCheck {
  if (!Array.isArray(rows)) return { ok: false, code: 'invalid', error: 'Not a list of rows: ' + field.id }
  const names = new Map(field.options.map(option => [option.value, option.label ?? option.value]))
  const seen = new Set<string>()
  for (const row of rows as readonly Record<string, unknown>[]) {
    const id = field.kind === 'assignments' ? row?.resourceId : row?.predecessorId
    const what = field.kind === 'assignments' ? 'resource' : 'predecessor'
    if (typeof id !== 'string' || !names.has(id)) return { ok: false, code: 'choice', error: `Unknown ${what}: ${String(id)}` }
    if (seen.has(id)) return { ok: false, code: 'invalid', error: `Duplicate ${what}: ${names.get(id)}` }
    seen.add(id)
    if (field.kind === 'assignments') {
      const units = row.units
      if (typeof units !== 'number' || !Number.isSafeInteger(units) || units <= 0) {
        return { ok: false, code: 'range', error: `Units for ${names.get(id)} must be a positive integer` }
      }
      if (field.maxUnits !== undefined && units > field.maxUnits) {
        return { ok: false, code: 'range', error: `Units for ${names.get(id)} must be at most ${field.maxUnits}` }
      }
    } else {
      if (typeof row.type !== 'string' || !isDependencyType(row.type)) {
        return { ok: false, code: 'choice', error: `Invalid dependency type for ${names.get(id)}: ${String(row.type)}` }
      }
      if (typeof row.lag !== 'number' || !Number.isSafeInteger(row.lag)) return { ok: false, code: 'invalid', error: `Lag for ${names.get(id)} must be an integer` }
    }
  }
  return { ok: true }
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

export function isInspectorListField<T extends InspectorItem>(field: InspectorField<T> | InspectorListField<T>): field is InspectorListField<T> {
  return field.kind === 'assignments' || field.kind === 'dependencies'
}

const rowKeys = ['resourceId', 'units', 'predecessorId', 'type', 'lag'] as const

/** True when two row lists of a list field are equal, row by row, in the fields the inspector edits. */
export function sameInspectorRows(a: readonly object[], b: readonly object[]) {
  return a.length === b.length && a.every((row, index) => {
    const own = row as Record<string, unknown>, other = b[index] as Record<string, unknown>
    return rowKeys.every(key => Object.is(own[key], other[key]))
  })
}

/** Throws for an invalid or duplicate field ID and for a kind the inspector cannot edit. */
export function checkInspectorFields(fields: readonly (InspectorField<any> | InspectorListField<any>)[]) {
  uniqueIds(fields, 'inspector field')
  for (const field of fields) {
    if (isInspectorListField(field)) {
      if (!Array.isArray(field.options)) throw new Error('A list field needs options: ' + field.id)
      const values = new Set<string>()
      for (const option of field.options) {
        if (typeof option?.value !== 'string' || option.value === '') throw new Error('Invalid option of list field ' + field.id + ': ' + String(option?.value))
        if (values.has(option.value)) throw new Error('Duplicate option of list field ' + field.id + ': ' + option.value)
        values.add(option.value)
      }
      const positive = (value: number | undefined, name: string) => {
        if (value !== undefined && (!Number.isFinite(value) || value <= 0)) throw new RangeError(name + ' must be finite and positive: ' + field.id)
      }
      // Units are whole numbers, as `ResourceAssignment` requires.
      const positiveInteger = (value: number | undefined, name: string) => {
        if (value !== undefined && (!Number.isSafeInteger(value) || value <= 0)) throw new RangeError(name + ' must be a positive integer: ' + field.id)
      }
      if (field.kind === 'assignments') {
        positiveInteger(field.defaultUnits, 'defaultUnits')
        positiveInteger(field.maxUnits, 'maxUnits')
      } else positive(field.lagUnitSize, 'lagUnitSize')
      continue
    }
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
