import { zonedInstant, zoneFormat, zoneOffset } from './timeZone.js'
import type { TimelineRow } from './types.js'

export type FieldPrimitive = string | number | boolean | null
/** An array is a multiple selection. `null` is the empty value. */
export type FieldValue = FieldPrimitive | readonly FieldPrimitive[]

export type TimelineFieldKind = 'text' | 'number' | 'time' | 'duration' | 'select' | 'checkbox'

export interface FieldChoice {
  value: string | number
  label?: string
}

/** What a duration field edits: wall-clock time or time on the work calendar. */
export type FieldDurationBasis = 'elapsed' | 'working'

export interface TimelineFieldSpec<R extends TimelineRow = TimelineRow> {
  id: string
  kind: TimelineFieldKind
  /** Raw value of the row. `column.value` only supplies display text. */
  get: (row: R) => FieldValue
  /** Custom text parser. It replaces the built-in parser for the kind. */
  parse?: (text: string) => FieldValue | { error: string }
  /** Custom formatter. It replaces the built-in formatter for the kind. */
  format?: (value: FieldValue) => string
  required?: boolean
  /**
   * Allowed options for `select`. The built-in formatter shows a choice's `label` (else its value) and the built-in
   * parser reads a label or a value back; see {@link parseFieldValue} for how duplicate labels are resolved.
   */
  choices?: readonly FieldChoice[]
  /**
   * `select` only: accept an array of choices. The built-in formatter joins the entries with `, ` and writes an entry
   * that is empty, contains a comma or a double quote, or starts or ends with whitespace in double quotes, with inner
   * quotes doubled (as in CSV). The built-in parser splits the text at unquoted commas and reads each entry like a
   * single selection.
   */
  multiple?: boolean
  /** Inclusive lower bound for `number`, `time` and `duration`. */
  min?: number
  /** Inclusive upper bound for `number`, `time` and `duration`. */
  max?: number
  /** `number` only: require an integer. */
  integer?: boolean
  /** `duration` only: accept negative values. Other kinds are not restricted unless `min` says so. */
  allowNegative?: boolean
  /**
   * `time` only: IANA time zone name (for example `Asia/Tokyo`) used for text without an offset. Daylight saving
   * is applied; a skipped wall time resolves to the transition and a repeated one to its earlier occurrence.
   * The built-in formatter appends the offset (for example `2026-11-01 01:30 -05:00`) to a wall time that occurs
   * twice, so formatted text parses back to the same instant. Takes precedence over `utcOffsetMinutes`.
   */
  timeZone?: string
  /**
   * `time` only: fixed offset from UTC in minutes (for example 540 for UTC+09:00). The built-in parser
   * and formatter never use the runtime's local time zone. Without it, `parse` and `format` are required
   * for `time` fields (unless `timeZone` is set); an offset written in the text itself (`Z`, `+09:00`) wins over this one.
   */
  utcOffsetMinutes?: number
  /** `duration` only: whether the value is elapsed or working time. Surfaced for editors to display. */
  durationBasis?: FieldDurationBasis
  /** `duration` only: model units in one displayed unit (3600000 for hours when the model uses milliseconds). Default 1. */
  unitSize?: number
  /** `duration` only: optional suffix such as `h`, appended when formatting and accepted when parsing. */
  unitLabel?: string
}

export interface TimelineFieldEdit<R extends TimelineRow = TimelineRow> {
  rowId: R['id']
  columnId: string
  fieldId: string
  before: FieldValue
  after: FieldValue
  source: 'pointer' | 'keyboard'
}

export type FieldErrorCode =
  | 'required' // empty input for a required field
  | 'invalid' // text or value cannot be read as the field kind
  | 'negative' // a negative value where negatives are not allowed
  | 'range' // outside min/max
  | 'integer' // fractional value for an integer field
  | 'choice' // not one of the choices
  | 'time-zone' // a time field without a time zone or custom parser
  | 'custom' // error returned by a custom parser

export type FieldCheck = { ok: true } | { ok: false; code: FieldErrorCode; error: string }
export type FieldParseResult = { ok: true; value: FieldValue } | { ok: false; code: FieldErrorCode; error: string }

const fail = (code: FieldErrorCode, error: string): { ok: false; code: FieldErrorCode; error: string } => ({ ok: false, code, error })

function checkSpec(spec: TimelineFieldSpec<any>) {
  if (!spec.id) throw new Error('A field spec needs an ID')
  for (const key of ['min', 'max', 'utcOffsetMinutes'] as const) {
    if (spec[key] !== undefined && !Number.isFinite(spec[key])) throw new RangeError('Field ' + key + ' must be finite: ' + spec.id)
  }
  if (spec.timeZone !== undefined) zoneFormat(spec.timeZone)
  if (spec.min !== undefined && spec.max !== undefined && spec.min > spec.max) throw new RangeError('Field min exceeds max: ' + spec.id)
  if (spec.unitSize !== undefined && (!Number.isFinite(spec.unitSize) || spec.unitSize <= 0)) {
    throw new RangeError('Field unitSize must be finite and positive: ' + spec.id)
  }
  if (spec.kind === 'select' && !spec.choices) throw new Error('A select field needs choices: ' + spec.id)
}

/** True when two field values are equal; arrays compare element by element and in order. */
export function fieldValuesEqual(a: FieldValue, b: FieldValue): boolean {
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false
    return a.every((value, index) => Object.is(value, b[index]))
  }
  return Object.is(a, b)
}

const NUMBER_TEXT = /^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i
const TIME_TEXT = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?)?\s*(Z|[+-]\d{2}:?\d{2})?$/i

/** Parse `YYYY-MM-DD[ T]HH:mm[:ss[.SSS]]` with an optional `Z` or `±HH:MM`, without using the runtime's zone. */
function parseTimeText(text: string, defaultOffset: number | undefined, format?: Intl.DateTimeFormat): number | undefined {
  const match = TIME_TEXT.exec(text)
  if (!match) return undefined
  const [year, month, day, hour, minute, second] = match.slice(1, 7).map(part => (part === undefined ? 0 : Number(part))) as number[]
  const millis = match[7] === undefined ? 0 : Number(match[7].padEnd(3, '0'))
  let offset = defaultOffset
  let explicit = false
  const zone = match[8]
  if (zone !== undefined) {
    explicit = true
    if (zone.toUpperCase() === 'Z') offset = 0
    else {
      const sign = zone[0] === '-' ? -1 : 1
      const digits = zone.slice(1).replace(':', '')
      const hours = Number(digits.slice(0, 2))
      const minutes = Number(digits.slice(2))
      if (hours > 23 || minutes > 59) return undefined
      offset = sign * (hours * 60 + minutes)
    }
  }
  if (month < 1 || month > 12 || day < 1 || hour! > 23 || minute! > 59 || second! > 59) return undefined
  const date = new Date(0)
  date.setUTCFullYear(year!, month! - 1, day!)
  if (date.getUTCMonth() !== month! - 1 || date.getUTCDate() !== day) return undefined
  date.setUTCHours(hour!, minute!, second!, millis)
  if (!explicit && format) {
    const instant = zonedInstant(format, date.getTime())
    return Number.isFinite(instant) ? instant : undefined
  }
  const time = date.getTime() - offset! * 60000
  return Number.isFinite(time) ? time : undefined
}

const dayMs = 86_400_000

/** The float next to `value` towards `direction` (+1 or -1), for finite values. */
function nextFloat(value: number, direction: number) {
  if (value === 0) return direction * Number.MIN_VALUE
  const view = new DataView(new ArrayBuffer(8))
  view.setFloat64(0, value)
  view.setBigInt64(0, view.getBigInt64(0) + ((value > 0) === (direction > 0) ? 1n : -1n))
  return view.getFloat64(0)
}

/**
 * A duration of `units` units of `unitSize`, chosen so that the formatter writes the same number back: `units *
 * unitSize` can round to a value whose quotient by `unitSize` is not `units`, as 31 minutes in hours (0.5166666666666667 h)
 * would read as 1860000.0000000002 ms. An integer is preferred, then the product, then its nearest neighbours; a
 * candidate inside `[min, max]` is preferred over one outside, so a bound such as `max: 0.29 * 100`, shown as 0.29,
 * reads back from that text as the bound itself.
 */
function fromUnits(units: number, unitSize: number, min = -Infinity, max = Infinity) {
  const product = units * unitSize
  if (unitSize === 1 || !Number.isFinite(product)) return product
  const candidates = [Math.round(product), product]
  let below = product, above = product
  for (let step = 0; step < 4; step++) {
    below = nextFloat(below, -1)
    above = nextFloat(above, 1)
    candidates.push(below, above)
  }
  const exact = candidates.filter(value => value / unitSize === units)
  return exact.find(value => value >= min && value <= max) ?? (product >= min && product <= max ? product : exact[0] ?? product)
}

/**
 * Whether a local wall time (expressed as if it were UTC) occurs twice in a zone, as it does when clocks go back.
 * Zone rules change at most once within two days, so there are at most two candidate offsets.
 */
function repeatedWallTime(format: Intl.DateTimeFormat, wall: number) {
  const before = zoneOffset(format, wall - dayMs), after = zoneOffset(format, wall + dayMs)
  if (before === after) return false
  return [before, after].every(offset => zoneOffset(format, wall - offset) === offset)
}

/** `±HH:MM` for an offset in milliseconds, or undefined when it is not a whole number of minutes. */
function offsetText(offset: number) {
  if (offset % 60000 !== 0) return undefined
  const minutes = Math.abs(offset / 60000)
  return (offset < 0 ? '-' : '+') + String(Math.floor(minutes / 60)).padStart(2, '0') + ':' + String(minutes % 60).padStart(2, '0')
}

function formatTimeText(time: number, offset: number | Intl.DateTimeFormat): string | undefined {
  if (typeof offset !== 'number' && !Number.isFinite(time)) return undefined
  const zoned = typeof offset === 'number' ? undefined : zoneOffset(offset, time)
  const date = new Date(time + (zoned ?? (offset as number) * 60000))
  if (Number.isNaN(date.getTime())) return undefined
  const year = date.getUTCFullYear()
  if (year < 0 || year > 9999) return undefined
  const pad = (value: number, width = 2) => String(value).padStart(width, '0')
  let text = pad(year, 4) + '-' + pad(date.getUTCMonth() + 1) + '-' + pad(date.getUTCDate())
    + ' ' + pad(date.getUTCHours()) + ':' + pad(date.getUTCMinutes())
  const seconds = date.getUTCSeconds()
  const millis = date.getUTCMilliseconds()
  if (seconds || millis) text += ':' + pad(seconds)
  if (millis) text += '.' + pad(millis, 3)
  // A repeated wall time (clocks going back) names its offset, so that the text identifies one instant.
  if (zoned !== undefined && repeatedWallTime(offset as Intl.DateTimeFormat, time + zoned)) {
    const suffix = offsetText(zoned)
    if (suffix) text += ' ' + suffix
  }
  return text
}

/** Text of one choice as the built-in formatter shows it: its label, else its value. */
function choiceText(choice: FieldChoice) {
  return choice.label ?? String(choice.value)
}

type FieldFailure = { ok: false; code: FieldErrorCode; error: string }

/** Choices grouped by the text that names them, so that each lookup takes constant time. */
interface ChoiceIndex {
  byLabel: Map<string, FieldChoice[]>
  byValue: Map<string, FieldChoice[]>
  /** The first choice with each value, as `Array.prototype.find` would return it. */
  byIdentity: Map<FieldPrimitive, FieldChoice>
}

function indexChoices(choices: readonly FieldChoice[]): ChoiceIndex {
  const byLabel = new Map<string, FieldChoice[]>()
  const byValue = new Map<string, FieldChoice[]>()
  const byIdentity = new Map<FieldPrimitive, FieldChoice>()
  const add = (map: Map<string, FieldChoice[]>, key: string, choice: FieldChoice) => {
    const list = map.get(key)
    if (list) list.push(choice)
    else map.set(key, [choice])
  }
  for (const choice of choices) {
    add(byLabel, choiceText(choice), choice)
    add(byValue, String(choice.value), choice)
    if (!byIdentity.has(choice.value)) byIdentity.set(choice.value, choice)
  }
  return { byLabel, byValue, byIdentity }
}

/**
 * The choice that `text` names. A label (or, for a choice without one, its value) shown by exactly one choice wins;
 * otherwise the text is compared with the values. Text that still matches several choices is rejected as ambiguous
 * rather than resolved to one of them.
 */
function matchChoice(index: ChoiceIndex, text: string): { ok: true; choice: FieldChoice } | FieldFailure {
  const byLabel = index.byLabel.get(text)
  if (byLabel?.length === 1) return { ok: true, choice: byLabel[0]! }
  const byValue = index.byValue.get(text)
  if (byValue?.length === 1) return { ok: true, choice: byValue[0]! }
  if ((byLabel?.length ?? 0) > 1 || (byValue?.length ?? 0) > 1) {
    return fail('choice', 'Several choices match ' + JSON.stringify(text) + '; enter the value of one of them')
  }
  return fail('choice', 'Not one of the choices: ' + text)
}

const isSpace = (char: string | undefined) => char !== undefined && char.trim() === ''

/**
 * Split multiple-choice text into entries. Entries are separated by commas; whitespace around an entry is ignored.
 * An entry that starts with a double quote runs to the closing quote, with `""` standing for one quote, so it can
 * contain commas, quotes and leading or trailing whitespace. A quote inside an unquoted entry is an ordinary
 * character. The scan is linear in the length of the text.
 */
function splitChoiceEntries(text: string): { ok: true; entries: string[] } | FieldFailure {
  const entries: string[] = []
  let at = 0
  for (;;) {
    while (isSpace(text[at])) at++
    let entry = ''
    if (text[at] === '"') {
      let from = ++at
      for (;;) {
        const quote = text.indexOf('"', at)
        if (quote < 0) return fail('invalid', 'A quoted entry has no closing quote: ' + text.trim())
        entry += text.slice(from, quote)
        if (text[quote + 1] !== '"') {
          at = quote + 1
          break
        }
        entry += '"'
        at = from = quote + 2
      }
      while (isSpace(text[at])) at++
      if (at < text.length && text[at] !== ',') return fail('invalid', 'Text follows a closing quote: ' + text.trim())
    } else {
      const comma = text.indexOf(',', at)
      const end = comma < 0 ? text.length : comma
      entry = text.slice(at, end).trim()
      at = end
      if (entry === '') return fail('invalid', 'An entry between commas is empty: ' + text.trim())
    }
    entries.push(entry)
    if (at >= text.length) return { ok: true, entries }
    at++ // past the comma
  }
}

/** A multiple-choice entry, quoted when it is empty, contains a comma or a quote, or starts or ends with whitespace. */
function quoteEntry(text: string) {
  const plain = text !== '' && !text.includes(',') && !text.includes('"') && text.trim() === text
  return plain ? text : '"' + text.replaceAll('"', '""') + '"'
}

function parseSelect(spec: TimelineFieldSpec<any>, text: string): FieldParseResult {
  const index = selectIndex(spec)
  if (!spec.multiple) {
    const match = matchChoice(index, text)
    return match.ok ? { ok: true, value: match.choice.value } : match
  }
  const split = splitChoiceEntries(text)
  if (!split.ok) return split
  const values: FieldPrimitive[] = []
  for (const entry of split.entries) {
    const match = matchChoice(index, entry)
    if (!match.ok) return match
    values.push(match.choice.value)
  }
  return { ok: true, value: values }
}

/**
 * Text for one selected value that {@link matchChoice} resolves back to a choice with that value: the label where it
 * names the choice, else the value. Unquoted text (a single select) is trimmed when it is read, and empty text reads
 * as no value, so it names no choice there. `undefined` when neither text names the choice.
 */
function namingText(index: ChoiceIndex, choice: FieldChoice, quoted: boolean): string | undefined {
  for (const text of [choiceText(choice), String(choice.value)]) {
    const read = quoted ? text : text.trim()
    if (!quoted && read === '') continue
    const match = matchChoice(index, read)
    if (match.ok && Object.is(match.choice.value, choice.value)) return text
  }
  return undefined
}

/**
 * Throw when a choice has no text that names it: its label and its value text both read as other choices (or as no
 * value). Such a choice could be shown but never read back, so the built-in parser and formatter refuse the spec
 * instead of turning the value into another one.
 */
function checkNameableChoices(spec: TimelineFieldSpec<any>, index: ChoiceIndex, quoted: boolean) {
  for (const choice of index.byIdentity.values()) {
    if (namingText(index, choice, quoted) === undefined) {
      throw new Error('Choice ' + JSON.stringify(choice.value) + ' of select field ' + spec.id + ' has no text that names it: '
        + 'its label and its value read as other choices; give it a label that no other choice shows or has as its value')
    }
  }
}

function selectIndex(spec: TimelineFieldSpec<any>) {
  const index = indexChoices(spec.choices!)
  checkNameableChoices(spec, index, !!spec.multiple)
  return index
}

/**
 * Text for a select value that the built-in parser reads back. Each value is shown by its label where the label names
 * it, else by its value. In a multiple select the entries are joined with `, ` and quoted where needed (see
 * {@link quoteEntry}), so that every entry reads back by itself. A value that is not among the choices is shown as is
 * (it fails `validateFieldValue`). The work is linear in the number of choices and values.
 */
function formatSelect(spec: TimelineFieldSpec<any>, value: FieldValue): string {
  const index = selectIndex(spec)
  const text = (item: FieldPrimitive, quoted: boolean) => {
    const choice = index.byIdentity.get(item)
    return choice ? namingText(index, choice, quoted)! : String(item)
  }
  if (!spec.multiple && !Array.isArray(value)) return text(value as FieldPrimitive, false)
  const items: readonly FieldPrimitive[] = Array.isArray(value) ? value : [value as FieldPrimitive]
  return items.map(item => quoteEntry(text(item, true))).join(', ')
}

function isCustomError(value: unknown): value is { error: string } {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && typeof (value as { error?: unknown }).error === 'string'
}

/**
 * Read editor text into a field value. Empty text (after trimming) is `null`, or a `required` error;
 * `0` and negative numbers are values, not empty. The result is also checked with {@link validateFieldValue}.
 *
 * The built-in parsers read what {@link formatFieldValue} writes, so formatting a valid value and parsing the text
 * gives the same value back:
 * - `select`: a choice's label, or its value. A label that exactly one choice shows wins over a value. Text that
 *   matches several choices (a shared label with no single matching value) is a `choice` error; the formatter then
 *   shows values instead. With `multiple`, the text is split at unquoted commas into an array, in order. An entry in
 *   double quotes (`"Cut, weld"`, with `""` for a quote inside) is read exactly, commas and surrounding whitespace
 *   included; unquoted entries are trimmed. An empty unquoted entry (`a,,b`) or an unclosed quote is `invalid`.
 *   Throws an Error when some choice has no text that names it (its label and value both read as other choices).
 * - `time` with `timeZone`: a trailing offset (`-05:00`, `Z`) picks one occurrence of a repeated wall time; without
 *   one, the earlier occurrence is used.
 */
export function parseFieldValue(spec: TimelineFieldSpec<any>, text: string): FieldParseResult {
  checkSpec(spec)
  const trimmed = text.trim()
  if (trimmed === '') return spec.required ? fail('required', 'A value is required') : { ok: true, value: null }
  let value: FieldValue
  if (spec.parse) {
    const parsed = spec.parse(text)
    if (isCustomError(parsed)) return fail('custom', parsed.error)
    value = parsed
  } else {
    switch (spec.kind) {
      case 'text':
        value = text
        break
      case 'number':
      case 'duration': {
        let body = trimmed
        if (spec.kind === 'duration' && spec.unitLabel && body.endsWith(spec.unitLabel)) body = body.slice(0, -spec.unitLabel.length).trim()
        if (!NUMBER_TEXT.test(body)) return fail('invalid', 'Not a number: ' + trimmed)
        const number = Number(body)
        if (!Number.isFinite(number)) return fail('invalid', 'Not a finite number: ' + trimmed)
        value = spec.kind === 'duration' ? fromUnits(number, spec.unitSize ?? 1, spec.min, spec.max) : number
        if (!Number.isFinite(value)) return fail('invalid', 'The duration is too large: ' + trimmed)
        break
      }
      case 'time': {
        if (spec.utcOffsetMinutes === undefined && spec.timeZone === undefined) {
          return fail('time-zone', 'A time field needs timeZone, utcOffsetMinutes or a custom parse and format')
        }
        const time = parseTimeText(trimmed, spec.utcOffsetMinutes, spec.timeZone === undefined ? undefined : zoneFormat(spec.timeZone))
        if (time === undefined) return fail('invalid', 'Not a date and time (YYYY-MM-DD HH:mm): ' + trimmed)
        value = time
        break
      }
      case 'checkbox': {
        const lower = trimmed.toLowerCase()
        if (lower === 'true') value = true
        else if (lower === 'false') value = false
        else return fail('invalid', 'Expected true or false: ' + trimmed)
        break
      }
      case 'select': {
        const parsed = parseSelect(spec, trimmed)
        if (!parsed.ok) return parsed
        value = parsed.value
        break
      }
      default:
        throw new Error('Unknown field kind: ' + String(spec.kind))
    }
  }
  const check = validateFieldValue(spec, value)
  return check.ok ? { ok: true, value } : check
}

function checkNumber(spec: TimelineFieldSpec<any>, value: number): FieldCheck {
  if (!Number.isFinite(value)) return fail('invalid', 'The value must be a finite number')
  if (spec.kind === 'number' && spec.integer && !Number.isInteger(value)) return fail('integer', 'The value must be an integer')
  if (value < 0 && spec.kind === 'duration' && !spec.allowNegative) return fail('negative', 'The duration cannot be negative')
  if ((spec.min !== undefined && value < spec.min) || (spec.max !== undefined && value > spec.max)) {
    return fail(value < 0 && spec.min !== undefined && spec.min >= 0 ? 'negative' : 'range', 'The value is outside the allowed range')
  }
  return { ok: true }
}

/** Check a value against the spec. `null` is empty: valid unless `required`. */
export function validateFieldValue(spec: TimelineFieldSpec<any>, value: FieldValue): FieldCheck {
  checkSpec(spec)
  const empty = value === null || (Array.isArray(value) && value.length === 0)
  if (empty) return spec.required ? fail('required', 'A value is required') : { ok: true }
  switch (spec.kind) {
    case 'text':
      return typeof value === 'string' ? { ok: true } : fail('invalid', 'Expected text')
    case 'number':
    case 'duration':
    case 'time':
      return typeof value === 'number' ? checkNumber(spec, value) : fail('invalid', 'Expected a number')
    case 'checkbox':
      return typeof value === 'boolean' ? { ok: true } : fail('invalid', 'Expected a boolean')
    case 'select': {
      const allowed = new Set(spec.choices!.map(choice => choice.value))
      const values = Array.isArray(value) ? value : [value]
      if (Array.isArray(value) && !spec.multiple) return fail('invalid', 'Multiple selection is not enabled')
      return values.every(item => (typeof item === 'string' || typeof item === 'number') && allowed.has(item))
        ? { ok: true } : fail('choice', 'Not one of the choices')
    }
    default:
      throw new Error('Unknown field kind: ' + String(spec.kind))
  }
}

/**
 * Turn a field value into editor text. `null` becomes an empty string; `0` stays `0`. The built-in formats read back
 * with {@link parseFieldValue}: a `select` shows each choice by its label unless the label does not name it (then by
 * its value), a multiple `select` quotes entries that contain a comma, a quote or surrounding whitespace, and a `time`
 * with `timeZone` appends the offset to a wall time that occurs twice.
 */
export function formatFieldValue(spec: TimelineFieldSpec<any>, value: FieldValue): string {
  checkSpec(spec)
  if (spec.format) return spec.format(value)
  if (value === null) return ''
  if (spec.kind === 'select') return formatSelect(spec, value)
  if (Array.isArray(value)) return value.map(item => formatFieldValue(spec, item)).join(', ')
  switch (spec.kind) {
    case 'time':
      if (typeof value === 'number' && (spec.timeZone !== undefined || spec.utcOffsetMinutes !== undefined)) {
        return formatTimeText(value, spec.timeZone !== undefined ? zoneFormat(spec.timeZone) : spec.utcOffsetMinutes!) ?? String(value)
      }
      return String(value)
    case 'duration':
      return typeof value === 'number' ? String(value / (spec.unitSize ?? 1)) + (spec.unitLabel ?? '') : String(value)
    default:
      return String(value)
  }
}
