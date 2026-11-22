// Internal defaults and option checks shared by the graph layouts. Not exported from the package entry points.

/** Default node box width of the built-in layouts, in chart units. */
export const defaultNodeWidth = 144
/** Default node box height of the built-in layouts, in chart units. */
export const defaultNodeHeight = 58
/** Default free space between ranks (along the flow) of the layered, tree, swimlane and incremental layouts, and between grid columns. */
export const defaultColumnGap = 50
/** Default free space between neighbouring boxes of one rank (across the flow), and between grid rows. */
export const defaultRowGap = 24
/** Default margin around the layouts. */
export const defaultPadding = 20

/**
 * Distance from a box's flow-end side to the turn of a same-rank edge (inside a cycle) or a self-loop, shared by the
 * layered, tree and swimlane layouts: half the column gap, at least 6 and at most 24 chart units.
 */
export function sameRankTurnDistance(columnGap: number): number {
  return Math.min(24, Math.max(6, columnGap / 2))
}

/**
 * The rule a numeric layout option must meet:
 * - `positive`: a finite number > 0 (node sizes and scales),
 * - `nonnegative`: a finite number ≥ 0 (gaps and padding),
 * - `finite`: any finite number (angles),
 * - `positiveInteger`: an integer ≥ 1 (counts),
 * - `nonnegativeInteger`: an integer ≥ 0 (hop counts),
 * - `unitInterval`: a finite number in [0, 1],
 * - `safeInteger`: an integer in the safe range of numbers (seeds).
 */
export type LayoutNumberRule =
  | 'positive' | 'nonnegative' | 'finite' | 'positiveInteger' | 'nonnegativeInteger' | 'unitInterval' | 'safeInteger'

const ruleTexts: Record<LayoutNumberRule, string> = {
  positive: 'a finite number > 0',
  nonnegative: 'a finite number ≥ 0',
  finite: 'a finite number',
  positiveInteger: 'an integer ≥ 1',
  nonnegativeInteger: 'an integer ≥ 0',
  unitInterval: 'a finite number in [0, 1]',
  safeInteger: 'a safe integer',
}

function meetsRule(value: unknown, rule: LayoutNumberRule): boolean {
  if (typeof value !== 'number') return false
  switch (rule) {
    case 'positive': return Number.isFinite(value) && value > 0
    case 'nonnegative': return Number.isFinite(value) && value >= 0
    case 'finite': return Number.isFinite(value)
    case 'positiveInteger': return Number.isInteger(value) && value >= 1
    case 'nonnegativeInteger': return Number.isInteger(value) && value >= 0
    case 'unitInterval': return Number.isFinite(value) && value >= 0 && value <= 1
    case 'safeInteger': return Number.isSafeInteger(value)
  }
}

/** How an invalid option value appears in a check message: strings quoted, other primitives as text, objects by type. */
export function describeValue(value: unknown): string {
  if (typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint' || value === null || value === undefined) return String(value)
  return typeof value
}

/**
 * The one check of the numeric options of every built-in layout. Throws
 * RangeError('<name> must be <rule> (got <value>)'), for example 'columnGap must be a finite number ≥ 0 (got -1)'.
 */
export function checkLayoutNumber(name: string, value: unknown, rule: LayoutNumberRule): void {
  if (!meetsRule(value, rule)) throw new RangeError(`${name} must be ${ruleTexts[rule]} (got ${describeValue(value)})`)
}

/** Checks several options with one rule, in the order of `values` (see checkLayoutNumber). */
export function checkLayoutNumbers(values: Record<string, unknown>, rule: LayoutNumberRule): void {
  for (const [name, value] of Object.entries(values)) checkLayoutNumber(name, value, rule)
}

/** The node size and spacing check of the layouts: `nodeWidth` and `nodeHeight` positive, then the rest nonnegative. */
export function checkLayoutSizes(nodeWidth: unknown, nodeHeight: unknown, spacing: Record<string, unknown>): void {
  checkLayoutNumber('nodeWidth', nodeWidth, 'positive')
  checkLayoutNumber('nodeHeight', nodeHeight, 'positive')
  checkLayoutNumbers(spacing, 'nonnegative')
}
