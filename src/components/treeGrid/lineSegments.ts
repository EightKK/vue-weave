// Internal helpers of TreeGrid: which lines and columns render where, and the keys that let a scroll patch the rendered
// elements in place. Not exported from the package.
//
// The active line is rendered in its own element between two keyed lists (the window lines before it and after it),
// and inside it the active ("pinned") column has its own element between two keyed cell lists. Vue's keyed diff only
// moves elements within one list, so the focused element is never moved or removed by a scroll, an expansion or a
// keyboard move: it is patched in place with the content of the new active line or column.
import type { TreeGridSpan } from '../../core/treeGrid.js'

export interface Segments {
  before: number[]
  after: number[]
}

/** The indexes of `span` before and after `pinned` (which is left out). */
export function splitAround(span: TreeGridSpan, pinned: number | undefined): Segments {
  const before: number[] = [], after: number[] = []
  for (let i = span.start; i < span.end; i++) {
    if (i === pinned) continue
    if (pinned !== undefined && i > pinned) after.push(i)
    else before.push(i)
  }
  return { before, after }
}

/**
 * A key that keeps an element for a slot of the window instead of an item, so a scroll by a few lines patches the
 * elements it keeps (`slots` is the window size, so the keys of one list are unique).
 */
export const slotKey = (index: number, slots: number) => index % Math.max(1, slots)

/** `start` that brings `[start, start + size)` inside `[scroll, scroll + view)`, or `scroll` when it is inside already. */
export function scrollToShow(start: number, size: number, scroll: number, view: number): number {
  if (start < scroll) return start
  if (start + size > scroll + view) return Math.max(0, start + size - view)
  return scroll
}
