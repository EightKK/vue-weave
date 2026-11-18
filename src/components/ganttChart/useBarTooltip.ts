// The `tooltip` slot of GanttChart. It is shown next to a hovered bar after `tooltipDelay`, or at once next to a
// keyboard-focused bar, and never during a gesture. It stays while the pointer moves onto it, Escape dismisses it,
// and it is kept inside the scroll viewport.
import { computed, ref, watch, type Ref, type WatchSource } from 'vue'
import type { TimelineBar } from '../../core/types.js'

export interface BarTooltipOptions<B extends TimelineBar> {
  /** Whether the chart has a `tooltip` slot. Without one, hover and focus do nothing. */
  hasSlot: () => boolean
  /** Whether a tooltip may open now: mounted, valid data and no gesture in flight. */
  allowed: () => boolean
  bars: () => ReadonlyMap<string, B>
  /** The bar that has DOM focus, which keeps a keyboard-opened tooltip while the pointer leaves. */
  focusedBarId: Ref<string | undefined>
  delay: () => number
  /** Whether focus on an element is visible (keyboard) focus. */
  focusVisible: (element: Element) => boolean
  scroller: Ref<HTMLElement | undefined>
  barElement: (id: string) => HTMLElement | undefined
  /** Width of the sticky label column, on the inline-start side. */
  labelWidth: () => number
  headerHeight: () => number
  rtl: () => boolean
  /** Sources that move the bar on screen; the tooltip is placed again after each change. */
  placement: WatchSource[]
}

export function useBarTooltip<B extends TimelineBar>(options: BarTooltipOptions<B>) {
  const target = ref<string>()
  const element = ref<HTMLElement>()
  const place = ref<{ left: string; top: string }>()
  const bar = computed(() => target.value === undefined ? undefined : options.bars().get(target.value))
  let showTimer: ReturnType<typeof setTimeout> | undefined
  let hideTimer: ReturnType<typeof setTimeout> | undefined
  let hovered: string | undefined
  let pressed: string | undefined
  let dismissed: string | undefined
  let keyboardFocused: string | undefined

  function clearTimers() {
    if (showTimer !== undefined) clearTimeout(showTimer)
    if (hideTimer !== undefined) clearTimeout(hideTimer)
    showTimer = hideTimer = undefined
  }
  function cancelHide() {
    if (hideTimer !== undefined) clearTimeout(hideTimer)
    hideTimer = undefined
  }
  function show(id: string) {
    clearTimers()
    if (!options.allowed() || dismissed === id || !options.bars().has(id)) return
    if (target.value !== id) place.value = undefined
    target.value = id
    document.addEventListener('keydown', dismiss)
  }
  function hide() {
    clearTimers()
    target.value = undefined
    place.value = undefined
    if (typeof document !== 'undefined') document.removeEventListener('keydown', dismiss)
  }
  function dismiss(event: KeyboardEvent) {
    if (event.key !== 'Escape' || target.value === undefined) return
    dismissed = target.value
    hide()
  }
  /** Hide after a short grace period so the pointer can travel from the bar onto the tooltip. */
  function scheduleHide() {
    if (hideTimer !== undefined) clearTimeout(hideTimer)
    hideTimer = setTimeout(() => {
      hideTimer = undefined
      const focused = options.focusedBarId.value
      const held = keyboardFocused !== undefined && focused === keyboardFocused ? keyboardFocused : undefined
      if (target.value !== undefined && target.value !== held) hide()
    }, 120)
  }
  function hoverBar(item: TimelineBar) {
    if (!options.hasSlot()) return
    hovered = item.id
    // Entering the bar again is a new trigger after an Escape dismissal.
    if (dismissed === item.id) dismissed = undefined
    if (target.value === item.id) return cancelHide()
    if (pressed === item.id || !options.allowed()) return
    if (showTimer !== undefined) clearTimeout(showTimer)
    showTimer = setTimeout(() => {
      showTimer = undefined
      if (hovered === item.id && pressed !== item.id) show(item.id)
    }, options.delay())
  }
  function leaveBar(item: TimelineBar) {
    if (hovered === item.id) hovered = undefined
    if (pressed === item.id) pressed = undefined
    if (showTimer !== undefined) clearTimeout(showTimer)
    showTimer = undefined
    if (target.value === item.id) scheduleHide()
  }
  /** A press starts a click or a gesture: hide the tooltip until the pointer leaves the bar. */
  function pressBar(item: TimelineBar) {
    if (!options.hasSlot()) return
    pressed = item.id
    hide()
  }
  function focusBar(event: FocusEvent, item: TimelineBar) {
    if (!options.hasSlot()) return
    keyboardFocused = undefined
    dismissed = undefined
    if (!options.focusVisible(event.currentTarget as Element)) return
    keyboardFocused = item.id
    show(item.id)
  }
  function blurBar(id: string) {
    if (keyboardFocused === id) keyboardFocused = undefined
    if (dismissed === id && hovered !== id) dismissed = undefined
    if (target.value === id && hovered !== id) hide()
  }
  function enterTooltip() {
    cancelHide()
  }
  function leaveTooltip() {
    if (target.value !== undefined && hovered !== target.value) scheduleHide()
  }
  /** Place the tooltip above the visible part of its bar, or below it, inside the scroll viewport. */
  function placeTooltip() {
    const tip = element.value, el = options.scroller.value, id = target.value
    if (!tip || !el || id === undefined) return
    const anchor = options.barElement(id)
    if (!anchor) return hide()
    const box = anchor.getBoundingClientRect()
    const outer = el.getBoundingClientRect()
    const area = {
      left: outer.left + el.clientLeft, top: outer.top + el.clientTop,
      right: outer.left + el.clientLeft + el.clientWidth, bottom: outer.top + el.clientTop + el.clientHeight,
    }
    // Only the part of the bar inside the time area counts; the sticky heading column and header cover the rest.
    const labels = options.labelWidth()
    const rtl = options.rtl()
    const left = Math.max(box.left, rtl ? area.left : area.left + labels)
    const right = Math.min(box.right, rtl ? area.right - labels : area.right)
    if (right < left || box.bottom < area.top + options.headerHeight() || box.top > area.bottom) return hide()
    const width = tip.offsetWidth, height = tip.offsetHeight, gap = 6
    let top = box.top - gap - height
    if (top < area.top) top = box.bottom + gap
    if (top + height > area.bottom) top = Math.max(area.top, area.bottom - height)
    const x = Math.max(area.left, Math.min(area.right - width, (left + right) / 2 - width / 2))
    // Convert from viewport coordinates to the tooltip's containing block, whichever element that is.
    const current = tip.getBoundingClientRect()
    const originX = current.left - (parseFloat(tip.style.left) || 0)
    const originY = current.top - (parseFloat(tip.style.top) || 0)
    place.value = { left: `${x - originX}px`, top: `${top - originY}px` }
  }
  watch(bar, value => {
    if (!value && target.value !== undefined) hide()
  })
  watch([target, ...options.placement], () => {
    if (target.value !== undefined) placeTooltip()
  }, { flush: 'post' })
  return {
    /** The bar whose tooltip is open, its element and its position. */
    bar, element, place,
    hide, hoverBar, leaveBar, pressBar, focusBar, blurBar, enterTooltip, leaveTooltip,
  }
}
