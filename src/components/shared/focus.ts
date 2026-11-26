// Internal focus helpers shared by the components. Not exported from the package.
import { nextTick, watch, type WatchSource } from 'vue'

/**
 * The first element under `root` whose `data-*` attribute `key` (in `dataset` form, such as `vwCard` for
 * `data-vw-card`) equals `value`. Values are compared as strings, not in a selector, so any ID is safe.
 */
export function elementWithData(root: ParentNode | null | undefined, key: string, value: string): HTMLElement | undefined {
  const attribute = 'data-' + key.replace(/[A-Z]/g, letter => '-' + letter.toLowerCase())
  for (const element of root?.querySelectorAll<HTMLElement>(`[${attribute}]`) ?? []) {
    if (element.dataset[key] === value) return element
  }
  return undefined
}

/**
 * Whether the focus moved from `element` to another element: the active element of the element's own root (its
 * document or shadow root) is neither `element` nor nothing (the body), or, for an element in a shadow root, the focus is
 * outside that root on an element other than the body. A removed element has not lost its focus to another element by
 * itself, so this is false for it.
 */
export function focusMovedAway(element: Element | null | undefined) {
  if (!element?.isConnected) return false
  const root = element.getRootNode() as Document | ShadowRoot
  const active = root.activeElement
  if (active !== null) return active !== element && active !== element.ownerDocument.body
  // A shadow root has no active element when the focus is outside it: it moved away unless it is on nothing.
  const outer = element.ownerDocument.activeElement
  return root !== element.ownerDocument && outer !== null && outer !== element.ownerDocument.body
}

/**
 * Keep the keyboard focus on an item after the parent applies a keyboard edit: the edited item may then be drawn by
 * another element. `request(id)` after emitting an accepted proposal; the next change of `source` (the controlled data)
 * takes the request and calls `focus(id)` once the DOM is updated. `cancel()` drops the request, for example when the
 * focus leaves the item or the proposal was rejected; once a change took it, until the focus moves, only when the focus
 * is on another element by then. `cancel(id)` drops it only if it is for `id`.
 */
export function usePendingFocus(source: WatchSource, focus: (id: string) => void, options: { flush?: 'pre' | 'post' } = {}) {
  let pending: string | undefined
  // The request a change of `source` took, until its focus runs after the DOM update: `cancel` still drops it until
  // then, so focus that moves elsewhere in the same tick as the change is not taken back.
  let taken: { id: string } | undefined
  watch(source, () => {
    const id = pending
    pending = undefined
    if (id === undefined) return
    const request = { id }
    taken = request
    void nextTick(() => {
      if (taken !== request) return
      taken = undefined
      focus(id)
    })
  }, { flush: options.flush ?? 'pre' })
  return {
    request(id: string) {
      pending = id
    },
    /**
     * `focusMoved`: the focus is known to have moved to another element (a blur with a `relatedTarget`). Without it, a
     * request already taken is dropped only when the focus is on another element now: a redraw that replaces or reuses
     * the focused element leaves the focus on the body, and the taken request is what puts it back.
     */
    cancel(id?: string, focusMoved = false) {
      if (id === undefined || pending === id) pending = undefined
      const active = typeof document === 'undefined' ? null : document.activeElement
      if ((id === undefined || taken?.id === id) && (focusMoved || (active && active !== document.body))) taken = undefined
    },
    get pending() {
      return pending
    },
  }
}
