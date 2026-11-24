// Internal helper behind the `idle-escape` event of NetworkGraph and GanttChart. Not exported from the package.

/** Whether a key event comes from a text field, a select or editable content, where Escape belongs to the field. */
export function isTextEntry(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])') !== null
}

/**
 * Reports an Escape that the component did not use. Put `start` on the root element as a capture listener and `finish`
 * as a bubbling listener; while the key is handled inside, call `cancelled()` whenever it cancels something of the
 * component's own (a gesture, an armed connection, an open editor).
 *
 * Escape is handled where focus is, so an Escape pressed on an element of the component that has no Escape handler of
 * its own (a toolbar or zoom button, the minimap, slot content) would otherwise pass over an operation in flight.
 * `finish` therefore calls `cancelPending` for an Escape that nothing inside used; it cancels whatever is still in
 * flight and calls `cancelled()` for it. `finish` then calls `report` only for an Escape that cancelled nothing, was not
 * default-prevented by a handler inside, was not part of an input method composition and was not pressed in a text
 * field. An Escape whose propagation a handler inside stopped never reaches `finish`, so it is neither reported nor
 * passed to `cancelPending`.
 */
export function createIdleEscape(report: (event: KeyboardEvent) => void, cancelPending: () => void) {
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
      // Escape in a text field, a composition or a handled key belongs to whatever handled it, not to the component.
      const own = !event.defaultPrevented && !event.isComposing && !isTextEntry(event.target)
      if (own && !cancelled) cancelPending()
      const used = cancelled
      cancelled = false
      if (used || !own) return
      report(event)
    },
  }
}

/**
 * Delivers `idle-escape` through the component's own `emit`. The event is declared as the listener prop `onIdleEscape`
 * (for typing) instead of in `defineEmits`, but Vue's `emit` still finds every listener of it in the raw vnode props:
 * `onIdleEscape` and the `onIdleEscapeOnce` that `@idle-escape.once` compiles to, called once per instance, with
 * several merged listeners and errors routed to the app's error handler, as for any declared event. Calling the prop
 * directly would miss `.once` and throw for merged listeners.
 */
export function emitIdleEscape(emit: unknown, event: KeyboardEvent) {
  ;(emit as (name: 'idle-escape', event: KeyboardEvent) => void)('idle-escape', event)
}
