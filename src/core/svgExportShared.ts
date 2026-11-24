// Internal helpers shared by the SVG exporters (exportSvg.ts and the board, calendar and grid exporters): the theme,
// colour checks, number formatting, element writing and clipped text. `exportSvg.ts` re-exports the public theme types,
// `defaultSvgExportTheme` and `SvgExportOptions`; everything else here is internal.
import type { ChartTone } from './types.js'
import { escapeXml } from './interchangeXml.js'

/** Colours of one tone, matching the `--vw-<tone>-*` custom properties. */
export interface SvgToneColors {
  ink: string
  line: string
  pale: string
  solid: string
}

/** Colours used by the SVG exporters. Each field mirrors a `--vw-*` custom property. */
export interface SvgExportTheme {
  surface: string
  surfaceMuted: string
  text: string
  muted: string
  border: string
  grid: string
  edge: string
  accent: string
  onSolid: string
  /** Text colour on marker and now-flag labels. */
  markerInk: string
  /** The single baseline, and the first slot when several baseline sets are drawn (`--vw-baseline`). */
  baseline: string
  /** The second baseline slot (`--vw-baseline-2`). Defaults to `defaultSvgExportTheme.baseline2`. */
  baseline2?: string
  /** The third baseline slot (`--vw-baseline-3`). Defaults to `defaultSvgExportTheme.baseline3`. */
  baseline3?: string
  marker: string
  now: string
  load: string
  loadOverload: string
  loadCapacity: string
  dependencyHighlight: string
  /** Non-working time shading (`--vw-non-working`). Optional for compatibility; defaults to `defaultSvgExportTheme.nonWorking`. */
  nonWorking?: string
  /** Outline of critical bars (`--vw-critical`). Defaults to `defaultSvgExportTheme.critical`. */
  critical?: string
  /** Float lines (`--vw-float`). Defaults to `defaultSvgExportTheme.float`. */
  float?: string
  /** Deadline indicators and the late outline (`--vw-deadline`). Defaults to `defaultSvgExportTheme.deadline`. */
  deadline?: string
  /** Status-date line and progress line (`--vw-status`). Defaults to `defaultSvgExportTheme.status`. */
  status?: string
  /** Scheduling constraint markers (`--vw-constraint`). Defaults to `defaultSvgExportTheme.constraint`. */
  constraint?: string
  /** Violated constraint markers (`--vw-constraint-violated`). Defaults to `defaultSvgExportTheme.constraintViolated`. */
  constraintViolated?: string
  /** Fill of marker ranges without a tone (`--vw-range`). Defaults to `defaultSvgExportTheme.range`. */
  range?: string
  /** Label text of marker ranges without a tone (`--vw-range-ink`). Defaults to `defaultSvgExportTheme.rangeInk`. */
  rangeInk?: string
  /** Edge line of marker range labels without a tone (`--vw-range-line`). Defaults to `defaultSvgExportTheme.rangeLine`. */
  rangeLine?: string
  tones: Record<ChartTone, SvgToneColors>
}

/** A partial theme; omitted colours fall back to `defaultSvgExportTheme`. */
export type SvgExportThemeInput = Partial<Omit<SvgExportTheme, 'tones'>> & {
  tones?: Partial<Record<ChartTone, Partial<SvgToneColors>>>
}

/** The stylesheet's fallback colours. */
export const defaultSvgExportTheme: Readonly<Required<SvgExportTheme>> = Object.freeze({
  surface: '#ffffff', surfaceMuted: '#f6f9fb', text: '#172c3b', muted: '#4c6371', border: '#d8e2e9', grid: '#d9e4eb',
  edge: '#76929f', accent: '#245e96', onSolid: '#ffffff', markerInk: '#ffffff', baseline: '#718497', marker: '#a74f08', now: '#c23b22',
  load: '#6b96c5', loadOverload: '#b4441c', loadCapacity: '#31495b', dependencyHighlight: '#a74f08',
  nonWorking: '#eaeff3', critical: '#b42318', float: '#5b7083', deadline: '#a74f08', status: '#1f7a4d',
  baseline2: '#9a4c95', baseline3: '#23806f', constraint: '#a1246e', constraintViolated: '#c4161c',
  range: '#f9efdc', rangeInk: '#764908', rangeLine: '#b58848',
  tones: {
    teal: { ink: '#115e58', line: '#5d9c93', pale: '#e1f2ee', solid: '#2b756b' },
    blue: { ink: '#1d4d84', line: '#6b96c5', pale: '#e6effa', solid: '#29609a' },
    amber: { ink: '#764908', line: '#b58848', pale: '#f9efdc', solid: '#825411' },
    violet: { ink: '#523b78', line: '#9983ba', pale: '#efe7f8', solid: '#624888' },
  },
})

/** Options shared by the SVG exporters. */
export interface SvgExportOptions {
  /**
   * Colours; omitted values use `defaultSvgExportTheme`. Each is a CSS colour value (hex, a colour name or keyword, or
   * one of the colour functions such as `rgb()`, `color-mix()` or `var()`); anything else throws a RangeError.
   */
  theme?: SvgExportThemeInput
  /** CSS font-family list written on the root element. */
  fontFamily?: string
  /** Document title, written as `<title>` and the accessible name. */
  title?: string
  /** Paint an opaque background. Default true. */
  background?: boolean
  /** Prefix for the IDs of markers and clip paths, so several exports can be inlined in one page. Default `vw-export`. */
  idPrefix?: string
  /** Text direction of labels. For timelines, `rtl` also mirrors the time axis and places row headings on the right. */
  direction?: 'ltr' | 'rtl'
}

const tones: readonly ChartTone[] = ['teal', 'blue', 'amber', 'violet']
const defaultFont = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'
export function num(value: number) {
  if (!Number.isFinite(value)) throw new RangeError('SVG export produced a non-finite coordinate')
  const rounded = Math.round(value * 1000) / 1000
  return String(rounded === 0 ? 0 : rounded)
}

export const round = (value: number) => Number(num(value))

export type Attributes = Record<string, string | number | undefined>
export function tag(name: string, attributes: Attributes, content?: string) {
  let out = '<' + name
  for (const key in attributes) {
    const value = attributes[key]
    if (value === undefined) continue
    out += ' ' + key + '="' + (typeof value === 'number' ? num(value) : escapeXml(value)) + '"'
  }
  return content === undefined ? out + '/>' : out + '>' + content + '</' + name + '>'
}

// Theme colours are CSS colour values: hex, named colours and keywords, and the colour functions below (with `var()`
// and `calc()` inside them). Other functions, such as `url()`, `image()` or `expression()`, would let a theme reference
// external resources from the exported SVG, so they are rejected.
const colourFunctions = new Set([
  'rgb', 'rgba', 'hsl', 'hsla', 'hwb', 'lab', 'lch', 'oklab', 'oklch', 'color', 'color-mix', 'light-dark', 'var', 'calc',
])
const colourCharacters = /^[A-Za-z0-9#%.,()+\-/_ \t\n\r]+$/

export function checkColour(value: string, name: string) {
  let depth = 0, valid = colourCharacters.test(value)
  // Every `(` must open a known colour function: the identifier right before it is the function name.
  if (valid) {
    for (const [, fn] of value.matchAll(/([\w-]*)\(/g)) {
      if (!colourFunctions.has(fn!.toLowerCase())) valid = false
    }
  }
  for (let index = 0; valid && index < value.length; index++) {
    if (value[index] === '(') depth++
    else if (value[index] === ')' && --depth < 0) valid = false
  }
  if (!valid || depth !== 0) {
    throw new RangeError(`Invalid export theme colour: ${name} must be a CSS colour (hex, a colour name or a colour function such as rgb())`)
  }
}

export function resolveTheme(input: SvgExportThemeInput = {}): Required<SvgExportTheme> {
  const { tones: toneInput, ...rest } = input
  const theme: Required<SvgExportTheme> = { ...defaultSvgExportTheme, tones: { ...defaultSvgExportTheme.tones } }
  for (const [key, value] of Object.entries(rest)) {
    if (value === undefined) continue
    if (typeof value !== 'string' || !Object.hasOwn(defaultSvgExportTheme, key)) throw new Error('Invalid export theme colour: ' + key)
    const colour = value.trim()
    if (!colour) continue
    checkColour(colour, key)
    Object.assign(theme, { [key]: colour })
  }
  for (const tone of tones) {
    const custom = toneInput?.[tone]
    if (!custom) continue
    const merged = { ...theme.tones[tone] }
    for (const part of ['ink', 'line', 'pale', 'solid'] as const) {
      const value = custom[part]
      if (value !== undefined && typeof value !== 'string') throw new Error('Invalid export theme colour: ' + tone + '.' + part)
      if (!value?.trim()) continue
      checkColour(value.trim(), tone + '.' + part)
      merged[part] = value.trim()
    }
    theme.tones[tone] = merged
  }
  return theme
}

/** The colours of a tone, or of blue for a missing or unknown tone (including inherited names such as `constructor`). */
export function toneColors(theme: Required<SvgExportTheme>, tone: string | undefined) {
  return tone !== undefined && Object.hasOwn(theme.tones, tone) ? theme.tones[tone as keyof typeof theme.tones] : theme.tones.blue
}

export function common(options: SvgExportOptions) {
  const prefix = options.idPrefix ?? 'vw-export'
  if (!/^[A-Za-z_][\w.-]*$/.test(prefix)) throw new Error('idPrefix must start with a letter or underscore and contain only letters, digits, _, . and -')
  if (options.direction !== undefined && options.direction !== 'ltr' && options.direction !== 'rtl') {
    throw new Error('direction must be ltr or rtl')
  }
  return {
    prefix, theme: resolveTheme(options.theme), rtl: options.direction === 'rtl',
    font: options.fontFamily?.trim() || defaultFont, background: options.background !== false,
  }
}

export function svgDocument(width: number, height: number, options: SvgExportOptions, font: string, defs: string, body: string) {
  if (!(width > 0) || !(height > 0)) throw new RangeError('The exported image must have a positive size')
  const title = options.title
  return tag('svg', {
    xmlns: 'http://www.w3.org/2000/svg', width, height, viewBox: `0 0 ${num(width)} ${num(height)}`,
    'font-family': font, role: 'img', 'aria-label': title || undefined,
  }, (title ? titleTag(title) : '') + (defs ? '<defs>' + defs + '</defs>' : '') + body)
}

/**
 * A text run clipped to a box. `inset` is measured from the inline start edge of the box; a `centred` line is centred
 * in the box instead.
 */
export function clippedText(
  box: { x: number; y: number; width: number; height: number }, rtl: boolean,
  lines: readonly { text: string; y: number; size: number; fill: string; weight?: number; inset?: number; halo?: string; centred?: boolean }[],
) {
  if (box.width <= 0 || box.height <= 0) return ''
  const content = lines.filter(line => line.text !== '').map(line => {
    const inset = line.inset ?? 0
    return tag('text', {
      x: line.centred ? box.width / 2 : rtl ? box.width - inset : inset, y: line.y, 'text-anchor': line.centred ? 'middle' : undefined,
      'font-size': line.size, 'font-weight': line.weight, fill: line.fill, ...textDirection(rtl), ...textHalo(line.halo, 3),
    }, escapeXml(line.text))
  }).join('')
  if (!content) return ''
  return tag('svg', { x: box.x, y: box.y, width: box.width, height: box.height, overflow: 'hidden' }, content)
}

export type Theme = Required<SvgExportTheme>
export type Box = { x: number; y: number; width: number; height: number }

/** The `direction` and `unicode-bidi` attributes of right-to-left text; both unset for left-to-right text. */
export function textDirection(rtl: boolean) {
  return { direction: rtl ? 'rtl' : undefined, 'unicode-bidi': rtl ? 'embed' : undefined }
}

/** The attributes of a text halo: a round-joined stroke of `color` painted under the fill; none without a colour. */
export function textHalo(color: string | undefined, width: number) {
  return {
    stroke: color, 'stroke-width': color ? width : undefined, 'stroke-linejoin': color ? 'round' : undefined,
    'paint-order': color ? 'stroke' : undefined,
  }
}

/** A `points` attribute value. */
export function pointList(points: readonly (readonly [number, number])[]) {
  return points.map(([x, y]) => num(x) + ',' + num(y)).join(' ')
}

/** A `<title>` element. */
export function titleTag(text: string) {
  return tag('title', {}, escapeXml(text))
}

/** A filled arrowhead marker `size` units wide and high, as both exporters draw at the end of their links. */
export function arrowMarker(id: string, size: number, fill: string) {
  return tag('marker', { id, markerWidth: size, markerHeight: size, refX: size - 1, refY: size / 2, orient: 'auto' },
    tag('path', { d: `M 0 0 L ${size} ${size / 2} L 0 ${size} z`, fill }))
}

/** A rough width of a text run in pixels: 0.6 em per character, the estimate the exporters use to place text. */
export function estimateTextWidth(text: string, size: number) {
  return [...text].length * size * 0.6
}

/** A colour option checked like a theme colour; undefined or blank gives the fallback. */
export function optionColour(value: unknown, name: string, fallback: string) {
  if (value === undefined) return fallback
  if (typeof value !== 'string') throw new RangeError(`Invalid export colour: ${name} must be a string`)
  const colour = value.trim()
  if (!colour) return fallback
  checkColour(colour, name)
  return colour
}

/** A finite positive (or, with `allowZero`, nonnegative) number option, or the default. */
export function sizeOption(value: number | undefined, name: string, fallback: number, allowZero = false) {
  if (value === undefined) return fallback
  if (typeof value !== 'number' || !Number.isFinite(value) || (allowZero ? value < 0 : value <= 0)) {
    throw new RangeError(`${name} must be finite and ${allowZero ? 'nonnegative' : 'positive'}`)
  }
  return value
}

/** A half-open index range `[start, end)` within `0..count`, or the whole range. */
export function indexRange(range: { start: number; end: number } | undefined, count: number, name: string, what: string) {
  if (range === undefined) return { start: 0, end: count }
  if (!range || !Number.isInteger(range.start) || !Number.isInteger(range.end) || range.start < 0 || range.end < range.start || range.end > count) {
    throw new RangeError(`${name} must be integers with 0 <= start <= end <= ${count} (${what})`)
  }
  return { start: range.start, end: range.end }
}

/** An optional label option: a string, or the default when it is undefined. */
export function textOption(value: unknown, name: string, fallback: string) {
  if (value === undefined) return fallback
  if (typeof value !== 'string') throw new TypeError(name + ' must be a string')
  return value
}

/**
 * One line of text clipped to a box, anchored at the inline start (after `inset`), the centre or the inline end (before
 * `inset`). Returns '' for empty text or an empty box.
 */
export function boxText(
  box: Box, rtl: boolean, text: string,
  style: { y: number; size: number; fill: string; weight?: number; inset?: number; align?: 'start' | 'center' | 'end'; italic?: boolean },
) {
  if (text === '' || box.width <= 0 || box.height <= 0) return ''
  const inset = style.inset ?? 0, align = style.align ?? 'start'
  const atRight = (align === 'end') !== rtl
  const x = align === 'center' ? box.width / 2 : atRight ? box.width - inset : inset
  // With `direction="rtl"` the anchor names a side in reading order, so `end` text in a right-to-left box starts at x.
  const anchor = align === 'center' ? 'middle' : align === 'end' ? 'end' : undefined
  return tag('svg', { x: box.x, y: box.y, width: box.width, height: box.height, overflow: 'hidden' }, tag('text', {
    x, y: style.y, 'text-anchor': anchor, 'font-size': style.size, 'font-weight': style.weight,
    'font-style': style.italic ? 'italic' : undefined, fill: style.fill, ...textDirection(rtl),
  }, escapeXml(text)))
}

/** A pill-shaped badge with centred text, `width` estimated from the text. Returns its markup and width. */
export function badge(x: number, y: number, text: string, colors: { fill: string; stroke: string; ink: string }) {
  const width = Math.max(22, estimateTextWidth(text, 11) + 14), height = 18
  return {
    width,
    markup: tag('rect', { x, y, width, height, rx: 9, fill: colors.fill, stroke: colors.stroke })
      + tag('text', { x: x + width / 2, y: y + 13, 'text-anchor': 'middle', 'font-size': 11, 'font-weight': 700, fill: colors.ink }, escapeXml(text)),
  }
}
