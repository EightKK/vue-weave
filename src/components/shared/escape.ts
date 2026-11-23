// Internal helper behind the `idle-escape` event of NetworkGraph and GanttChart. Not exported from the package.

/** Whether a key event comes from a text field, a select or editable content, where Escape belongs to the field. */
export function isTextEntry(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])') !== null
}

/**
 * Reports an Escape that the component did not use. Put `start` on the root element as a capture listener and `finish`
 * as a bubbling listener; while the key is handled inside, call `cancelled()` whenever it cancels something of the
 * component's own (a gesture, an armed connection, an open editor). `finish` then calls `report` only for an Escape
 * that cancelled nothing, was not default-prevented (or stopped) by a handler inside, was not part of an input method
 * composition and was not pressed in a text field.
 */
export function createIdleEscape(report: (event: KeyboardEvent) => void) {
  let cancelled = false
  return {
    start(event: KeyboardEvent) {
      if (event.key === 'Escape') cancelled = false
    },
    cancelled() {
      cancelled = true
    },
    finish(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      const used = cancelled
      cancelled = false
      if (used || event.defaultPrevented || event.isComposing || isTextEntry(event.target)) return
      report(event)
    },
  }
}
