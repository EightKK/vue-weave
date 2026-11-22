// The timing and state of NetworkGraph's `tooltip` slot. A hovered node or edge shows its tooltip after `tooltipDelay`,
// and moving from one item to the next switches a visible tooltip at once; keyboard focus shows it at once. Leaving
// hides it after a short grace period that lets the pointer move onto the tooltip; Escape, a press in the stage and a
// gesture hide it. Placement is the component's (see overlayPlacement.ts).
//
// GanttChart's useBarTooltip follows the same pattern with different rules (a 120 ms grace period, no immediate switch,
// an Escape dismissal that lasts until the bar is entered again, DOM-measured placement), so the two are kept apart.
import { shallowRef, watch, type Ref, type WatchSource } from 'vue'

export type TooltipState = { kind: 'node' | 'edge'; id: string; source: 'pointer' | 'focus' }

export interface NodeTooltipOptions {
  /** Whether the graph has a `tooltip` slot. Without one, hover and focus do nothing. */
  hasSlot: () => boolean
  /** True while a gesture preview or an armed connection hides tooltips. */
  blocked: Readonly<Ref<boolean>>
  /** Whether a pointer gesture is in flight. */
  gestureActive: () => boolean
  delay: () => number
  /** True while a press is being dispatched: focus it moves is pointer focus, which hover covers. */
  pressing: () => boolean
  /** The node an element stands for (null for connection handles and other elements). */
  elementNode: (element: Element) => string | null
  /** Whether focus on an element is visible (keyboard) focus. */
  focusVisible: (element: Element) => boolean
  /** Sources of the shown items, and whether an item still exists; the tooltip of a removed item hides. */
  items: WatchSource[]
  exists: (kind: TooltipState['kind'], id: string) => boolean
}

export function useNodeTooltip(options: NodeTooltipOptions) {
  const tooltip = shallowRef<TooltipState>()
  let showTimer: ReturnType<typeof setTimeout> | undefined
  let hideTimer: ReturnType<typeof setTimeout> | undefined

  function clearTimers() {
    clearTimeout(showTimer)
    clearTimeout(hideTimer)
    showTimer = hideTimer = undefined
  }
  function hide() {
    clearTimers()
    tooltip.value = undefined
  }
  function hover(kind: TooltipState['kind'], id: string) {
    if (!options.hasSlot() || options.blocked.value || options.gestureActive()) return
    clearTimeout(hideTimer)
    hideTimer = undefined
    if (tooltip.value?.kind === kind && tooltip.value.id === id) return
    clearTimeout(showTimer)
    const show = () => {
      showTimer = undefined
      tooltip.value = { kind, id, source: 'pointer' }
    }
    // Moving from one element to the next switches a visible tooltip at once.
    if (tooltip.value || options.delay() === 0) show()
    else showTimer = setTimeout(show, options.delay())
  }
  function leave() {
    clearTimeout(showTimer)
    showTimer = undefined
    if (tooltip.value?.source !== 'pointer') return
    clearTimeout(hideTimer)
    // A short grace period lets the pointer move onto the tooltip itself.
    hideTimer = setTimeout(() => {
      hideTimer = undefined
      tooltip.value = undefined
    }, 150)
  }
  function keep() {
    clearTimeout(hideTimer)
    hideTimer = undefined
  }
  function focus(event: FocusEvent) {
    if (!options.hasSlot() || !(event.target instanceof Element) || options.blocked.value || options.pressing()) return
    const node = options.elementNode(event.target), edge = event.target.getAttribute('data-vw-edge')
    // Keyboard focus shows the tooltip at once; a pointer press is covered by hover.
    if ((node === null && edge === null) || !options.focusVisible(event.target)) return
    clearTimers()
    tooltip.value = node !== null ? { kind: 'node', id: node, source: 'focus' } : { kind: 'edge', id: edge!, source: 'focus' }
  }
  function blur() {
    if (tooltip.value?.source === 'focus') hide()
  }
  function dismiss(event: KeyboardEvent) {
    if (event.key === 'Escape') hide()
  }
  watch(options.blocked, blocked => {
    if (blocked) hide()
  })
  watch(tooltip, (value, previous) => {
    if (value && !previous) document.addEventListener('keydown', dismiss)
    else if (!value && previous) document.removeEventListener('keydown', dismiss)
  })
  watch(options.items, () => {
    const current = tooltip.value
    if (current && !options.exists(current.kind, current.id)) hide()
  })
  /** Hide the tooltip and remove the Escape listener; for unmounting, after which the watchers no longer run. */
  function dispose() {
    hide()
    document.removeEventListener('keydown', dismiss)
  }
  return { tooltip, hide, hover, leave, keep, focus, blur, dispose }
}
