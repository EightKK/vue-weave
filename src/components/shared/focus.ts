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
 * Keep the keyboard focus on an item after the parent applies a keyboard edit: the edited item may then be drawn by
 * another element. `request(id)` after emitting an accepted proposal; the next change of `source` (the controlled data)
 * takes the request and calls `focus(id)` once the DOM is updated. `cancel()` drops the request, for example when the
 * focus leaves the item or the proposal was rejected; `cancel(id)` drops it only if it is for `id`.
 */
export function usePendingFocus(source: WatchSource, focus: (id: string) => void, options: { flush?: 'pre' | 'post' } = {}) {
  let pending: string | undefined
  watch(source, () => {
    const id = pending
    pending = undefined
    if (id === undefined) return
    void nextTick(() => focus(id))
  }, { flush: options.flush ?? 'pre' })
  return {
    request(id: string) {
      pending = id
    },
    cancel(id?: string) {
      if (id === undefined || pending === id) pending = undefined
    },
    get pending() {
      return pending
    },
  }
}
