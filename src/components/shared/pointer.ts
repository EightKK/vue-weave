// Internal pointer helpers shared by the components: the drag threshold, safe pointer capture and edge auto-scroll.
// Not exported from the package. Everything here runs in event handlers or animation frames only, never during render,
// so the components stay safe to render on the server.

/** Pointer travel in CSS pixels before a press becomes a drag. */
export const DRAG_THRESHOLD = 4

/** Whether the pointer has travelled at least `threshold` pixels from `start` (both in client coordinates). */
export function pastThreshold(start: { x: number; y: number }, event: { clientX: number; clientY: number }, threshold = DRAG_THRESHOLD) {
  return Math.hypot(event.clientX - start.x, event.clientY - start.y) >= threshold
}

/**
 * Capture a pointer on an element. Returns whether it worked: synthetic events without an active pointer, or an element
 * that left the document, cannot capture, and the gesture then follows bubbled events instead.
 */
export function capturePointer(element: Element | null | undefined, pointerId: number) {
  try {
    element?.setPointerCapture(pointerId)
    return Boolean(element)
  } catch {
    return false
  }
}

/** End the pointer capture that `element` still holds; a pointer or element that is already gone is ignored. */
export function releasePointer(element: Element | null | undefined, pointerId: number) {
  try {
    if (element?.hasPointerCapture(pointerId)) element.releasePointerCapture(pointerId)
  } catch {
    // The pointer or the element is gone already.
  }
}

export interface EdgeScrollOptions {
  /** Depth of the band along each edge that scrolls, in pixels. Default 36. */
  zone?: number
  /** Scroll step per frame, in pixels, with the pointer at or beyond an edge; it falls linearly to 1 at the band's inner side. Default 12. */
  maxSpeed?: number
  /** Axes that scroll. Default both. */
  axis?: 'x' | 'y' | 'both'
  /**
   * Parts of the box that do not count as viewport, such as sticky headers or label columns, in pixels: the bands start
   * inside them. Default 0.
   */
  insets?: { top?: number; right?: number; bottom?: number; left?: number }
  /**
   * Only a pointer inside the box (within the insets) scrolls; one that left it stops the scrolling. Default false: a
   * pointer beyond an edge scrolls at full speed.
   */
  insideOnly?: boolean
  /** Scroller helpers only: clip the scroller's box to the window first, so the bands lie along its visible part. Default false. */
  clipToWindow?: boolean
}

/**
 * The scroll step, in pixels per frame along the physical x (right) and y (down) axes, for a pointer at
 * `clientX`/`clientY` over a viewport `box`. Within `zone` pixels of an edge (or beyond it) the step grows from 1 to
 * `maxSpeed` towards the edge; opposite edges of a viewport narrower than two bands cancel out.
 */
export function edgeScrollDelta(
  box: { left: number; top: number; right: number; bottom: number }, clientX: number, clientY: number, options: EdgeScrollOptions = {},
): { x: number; y: number } {
  const zone = options.zone ?? 36, maxSpeed = options.maxSpeed ?? 12, axis = options.axis ?? 'both', insets = options.insets ?? {}
  // `distance` is from the edge into the viewport; negative beyond the edge.
  const left = box.left + (insets.left ?? 0), right = box.right - (insets.right ?? 0)
  const top = box.top + (insets.top ?? 0), bottom = box.bottom - (insets.bottom ?? 0)
  if (options.insideOnly && (clientX < left || clientX > right || clientY < top || clientY > bottom)) return { x: 0, y: 0 }
  const speed = (distance: number) => distance < zone ? Math.ceil(Math.min(zone, zone - distance) / (zone / maxSpeed)) : 0
  const x = axis === 'y' ? 0 : speed(right - clientX) - speed(clientX - left)
  const y = axis === 'x' ? 0 : speed(bottom - clientY) - speed(clientY - top)
  return { x, y }
}

/** The `edgeScrollDelta` of a pointer over an element (clipped to the window with `clipToWindow`). */
export function scrollerEdgeDelta(scroller: Element, clientX: number, clientY: number, options: EdgeScrollOptions = {}) {
  const rect = scroller.getBoundingClientRect()
  const box = options.clipToWindow
    ? { left: Math.max(0, rect.left), top: Math.max(0, rect.top), right: Math.min(innerWidth, rect.right), bottom: Math.min(innerHeight, rect.bottom) }
    : rect
  return edgeScrollDelta(box, clientX, clientY, options)
}

/** Scroll by a delta; returns whether the scroll position changed. */
function scrollByDelta(scroller: Element, delta: { x: number; y: number }) {
  if (!delta.x && !delta.y) return false
  const left = scroller.scrollLeft, top = scroller.scrollTop
  scroller.scrollBy(delta.x, delta.y)
  return scroller.scrollLeft !== left || scroller.scrollTop !== top
}

/**
 * Scroll `scroller` by the edge scroll step of a pointer at `clientX`/`clientY`. Returns whether the scroll position
 * changed, so the caller can update its drag preview and keep scrolling on the next frame.
 */
export function edgeAutoScroll(scroller: Element, clientX: number, clientY: number, options?: EdgeScrollOptions) {
  return scrollByDelta(scroller, scrollerEdgeDelta(scroller, clientX, clientY, options))
}

export interface EdgeScrollerOptions extends EdgeScrollOptions {
  /**
   * How long the pointer must stay in a band before scrolling starts, in milliseconds, so a drag that only passes
   * through a band does not scroll. Default 0.
   */
  delay?: number
}

/**
 * Edge auto-scroll during a drag, one step per animation frame. `pointer()` returns the scroller and the latest pointer
 * position while the drag may scroll (undefined otherwise); `onScroll()` runs after each frame that scrolled, to update
 * the preview for the content now under the pointer. Call `start()` on every pointer move of the drag and `stop()` when
 * it ends. The loop ends by itself when the pointer leaves the bands or the scroller cannot scroll further, and the next
 * `start()` resumes it.
 */
export function edgeScroller(
  pointer: () => { scroller: Element; clientX: number; clientY: number } | undefined, onScroll: () => void, options: EdgeScrollerOptions = {},
) {
  let since: number | undefined
  const loop = frameLoop(() => {
    const state = pointer()
    const delta = state ? scrollerEdgeDelta(state.scroller, state.clientX, state.clientY, options) : { x: 0, y: 0 }
    if (!state || (!delta.x && !delta.y)) {
      since = undefined
      return false
    }
    const now = performance.now()
    since ??= now
    if (now - since < (options.delay ?? 0)) return true
    if (!scrollByDelta(state.scroller, delta)) return false
    onScroll()
    return true
  })
  return {
    start: loop.start,
    stop() {
      loop.stop()
      since = undefined
    },
  }
}

/**
 * An animation frame loop: `start()` schedules `step` on the next frame unless one is pending, and `step` runs again on
 * the following frame while it returns true. `stop()` cancels the pending frame. Without `requestAnimationFrame` (on the
 * server) nothing is scheduled.
 */
export function frameLoop(step: () => boolean) {
  let frame = 0
  const run = () => {
    frame = 0
    if (step()) schedule()
  }
  const schedule = () => {
    if (!frame && typeof requestAnimationFrame === 'function') frame = requestAnimationFrame(run)
  }
  return {
    start: schedule,
    stop() {
      if (frame && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(frame)
      frame = 0
    },
    get active() {
      return frame !== 0
    },
  }
}
