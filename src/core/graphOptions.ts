// Internal defaults and option checks shared by the graph layouts. Not exported from the package entry points.

/** Default node box width of the built-in layouts, in chart units. */
export const defaultNodeWidth = 144
/** Default node box height of the built-in layouts, in chart units. */
export const defaultNodeHeight = 58
/** Default free space between ranks (along the flow) of the layered, tree and incremental layouts. */
export const defaultColumnGap = 50
/** Default free space between neighbouring boxes of one rank (across the flow). */
export const defaultRowGap = 24
/** Default margin around the layouts. */
export const defaultPadding = 20

/**
 * Throws RangeError('<name> must be finite and positive (spacing may be zero)') for a value that is not finite, is
 * negative, or is zero while its name is listed in `positive`. Values are checked in the order of `values`.
 */
export function checkLayoutNumbers(values: Record<string, number>, positive: readonly string[]): void {
  for (const [name, value] of Object.entries(values)) {
    if (!Number.isFinite(value) || value < 0 || (positive.includes(name) && value === 0)) {
      throw new RangeError(name + ' must be finite and positive (spacing may be zero)')
    }
  }
}
