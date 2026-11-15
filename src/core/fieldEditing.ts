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
  /** Allowed options for `select`. */
  choices?: readonly FieldChoice[]
  /** `select` only: accept an array of choices. */
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
   * `time` only: fixed offset from UTC in minutes (for example 540 for UTC+09:00). The built-in parser
   * and formatter never use the runtime's local time zone. Without it, `parse` and `format` are required
   * for `time` fields; an offset written in the text itself (`Z`, `+09:00`) wins over this one.
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
function parseTimeText(text: string, defaultOffset: number): number | undefined {
  const match = TIME_TEXT.exec(text)
  if (!match) return undefined
  const [year, month, day, hour, minute, second] = match.slice(1, 7).map(part => (part === undefined ? 0 : Number(part))) as number[]
  const millis = match[7] === undefined ? 0 : Number(match[7].padEnd(3, '0'))
  let offset = defaultOffset
  const zone = match[8]
  if (zone !== undefined) {
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
  const time = date.getTime() - offset * 60000
  return Number.isFinite(time) ? time : undefined
}

function formatTimeText(time: number, offset: number): string | undefined {
  const date = new Date(time + offset * 60000)
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
  return text
}

function isCustomError(value: unknown): value is { error: string } {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && typeof (value as { error?: unknown }).error === 'string'
}

/**
 * Read editor text into a field value. Empty text (after trimming) is `null`, or a `required` error;
 * `0` and negative numbers are values, not empty. The result is also checked with {@link validateFieldValue}.
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
        value = spec.kind === 'duration' ? number * (spec.unitSize ?? 1) : number
        if (!Number.isFinite(value)) return fail('invalid', 'The duration is too large: ' + trimmed)
        break
      }
      case 'time': {
        if (spec.utcOffsetMinutes === undefined) {
          return fail('time-zone', 'A time field needs utcOffsetMinutes or a custom parse and format')
        }
        const time = parseTimeText(trimmed, spec.utcOffsetMinutes)
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
        const choice = spec.choices!.find(item => String(item.value) === trimmed)
        if (!choice) return fail('choice', 'Not one of the choices: ' + trimmed)
        value = choice.value
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

/** Turn a field value into editor text. `null` becomes an empty string; `0` stays `0`. */
export function formatFieldValue(spec: TimelineFieldSpec<any>, value: FieldValue): string {
  checkSpec(spec)
  if (spec.format) return spec.format(value)
  if (value === null) return ''
  if (Array.isArray(value)) return value.map(item => formatFieldValue(spec, item)).join(', ')
  switch (spec.kind) {
    case 'time':
      if (typeof value === 'number' && spec.utcOffsetMinutes !== undefined) {
        return formatTimeText(value, spec.utcOffsetMinutes) ?? String(value)
      }
      return String(value)
    case 'duration':
      return typeof value === 'number' ? String(value / (spec.unitSize ?? 1)) + (spec.unitLabel ?? '') : String(value)
    case 'select': {
      const choice = spec.choices!.find(item => item.value === value)
      return choice ? choice.label ?? String(choice.value) : String(value)
    }
    default:
      return String(value)
  }
}
