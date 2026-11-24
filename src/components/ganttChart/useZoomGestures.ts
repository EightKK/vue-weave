// Zoom of the GanttChart time axis by gesture: a two-finger touch pinch (`pinchZoom`) around the midpoint, and
// Ctrl+wheel or Meta+wheel (`wheelZoom`) around the pointer, plus `applyZoom`, which the buttons and presets share.
// DOM listeners are attached by `attach()` (call it in `onMounted`) and removed by `detach()`, so the chart stays safe to
// render on the server.
import { nextTick, watch, type Ref } from 'vue'
import type { TimeScale } from '../../core/timeline.js'
import type { TimelineEditCancelReason } from '../../core/types.js'

export const minZoom = 0.65
export const maxZoom = 3
/** A zoom factor kept within `minZoom` and `maxZoom`. */
export function clampZoom(value: number) {
  return Math.max(minZoom, Math.min(maxZoom, value))
}
/** Factor of one zoom button step; a wheel event zooms by at most this much. */
const wheelStep = 1.35

/** A pinch in flight: the distance between the touches and the zoom when it started, and the time area offset it keeps. */
export type PinchState = { distance: number; zoom: number; anchor: number }

export interface ZoomGestureOptions {
  zoom: Ref<number>
  scroller: Ref<HTMLElement | undefined>
  pinchZoom: () => boolean | undefined
  wheelZoom: () => boolean | undefined
  /** Whether the chart shows valid data; an invalid chart does not zoom by wheel. */
  valid: () => boolean
  axis: () => TimeScale
  /** Pixels from the visible time area's inline-start edge to a client x coordinate. */
  timeAreaOffset: (clientX: number, rect: DOMRect) => number
  /** Width of the visible time area of the scroll viewport. */
  timeAreaWidth: (el: HTMLElement) => number
  scrollStart: (el: HTMLElement) => number
  setScrollStart: (el: HTMLElement, value: number) => void
  syncViewport: () => void
  gestureActive: () => boolean
  cancelGestures: (reason: TimelineEditCancelReason) => void
  hideTooltip: () => void
  /** The pinch is the chart's gesture in flight while it lasts: start, read and end it. */
  pinch: { begin: (state: PinchState) => void; current: () => PinchState | undefined; end: () => void }
}

export function useZoomGestures(options: ZoomGestureOptions) {
  const { zoom, scroller } = options
  let attached = false

  /** Change the zoom factor while keeping the time at `anchor` (pixels from the timeline's visible left edge) in place. */
  async function applyZoom(next: number, anchor?: number) {
    const el = scroller.value
    if (!el) return
    const offset = anchor ?? options.timeAreaWidth(el) / 2
    const time = options.axis().toTime(options.scrollStart(el) + offset)
    zoom.value = clampZoom(next)
    await nextTick()
    options.setScrollStart(el, options.axis().toX(time) - offset)
    options.syncViewport()
  }

  // Two-pointer touch pinch zooms the time axis around the midpoint. A second touch cancels any in-flight edit.
  const touches = new Map<number, { x: number; y: number }>()
  function touchSpan() {
    const [a, b] = [...touches.values()]
    return { distance: Math.hypot(a!.x - b!.x, a!.y - b!.y), x: (a!.x + b!.x) / 2 }
  }
  function trackTouch(event: PointerEvent) {
    if (!options.pinchZoom() || event.pointerType !== 'touch') return
    touches.set(event.pointerId, { x: event.clientX, y: event.clientY })
    const el = scroller.value
    if (touches.size !== 2 || !el) return
    options.cancelGestures('pointer-cancel')
    options.hideTooltip()
    const span = touchSpan()
    options.pinch.begin({ distance: Math.max(1, span.distance), zoom: zoom.value, anchor: Math.max(0, options.timeAreaOffset(span.x, el.getBoundingClientRect())) })
  }
  function moveTouch(event: PointerEvent) {
    if (!touches.has(event.pointerId)) return
    touches.set(event.pointerId, { x: event.clientX, y: event.clientY })
    const pinch = options.pinch.current()
    if (!pinch || touches.size !== 2) return
    event.preventDefault()
    const next = clampZoom(pinch.zoom * touchSpan().distance / pinch.distance)
    if (Math.abs(next - zoom.value) > 0.001) void applyZoom(next, pinch.anchor)
  }
  function endTouch(event: PointerEvent) {
    touches.delete(event.pointerId)
    if (touches.size < 2) options.pinch.end()
  }
  watch(options.pinchZoom, () => {
    touches.clear()
    options.pinch.end()
  })
  // `touch-action: pan-x pan-y` keeps one-finger scrolling native but lets the browser take over a two-finger pan,
  // which ends the pinch with `pointercancel`. A non-passive `touchmove` listener refuses that takeover while two
  // touches are down; single-touch moves stay untouched.
  function holdPinch(event: TouchEvent) {
    if (options.pinchZoom() && event.touches.length >= 2 && event.cancelable) event.preventDefault()
  }

  // Ctrl+wheel and Meta+wheel (`wheelZoom`) zoom the time axis around the pointer. Desktop trackpad pinches arrive as
  // Ctrl+wheel with small deltas, so the factor follows deltaY and is clamped per event to one zoom button step. The
  // listener is non-passive, so it is attached only while the prop is set; a plain wheel is never prevented.
  let wheelTarget: HTMLElement | undefined
  /** The time and anchor of a zoom whose scroll position is not applied yet; later events in the same tick build on it. */
  let wheelPending: { time: number; offset: number } | undefined
  /**
   * The scroll start the last wheel zoom asked for, what the scroller then reported and the zoom it was for. WebKit keeps
   * whole-pixel scroll positions, so reading the scroller back would lose up to half a pixel per event and a trackpad
   * pinch (many small events) would drift away from the pointer. While the scroller still reports what it reported then,
   * at the same zoom, the next event starts from the requested position instead. Where scroll positions keep the
   * fraction, the two are equal and nothing changes.
   */
  let wheelScroll: { el: HTMLElement; requested: number; reported: number; zoom: number } | undefined
  function wheelScrollStart(el: HTMLElement) {
    const reported = options.scrollStart(el), last = wheelScroll
    if (last && last.el === el && last.zoom === zoom.value && last.reported === reported && Math.abs(last.requested - reported) < 1) {
      return last.requested
    }
    return reported
  }
  function wheelDelta(event: WheelEvent, el: HTMLElement) {
    if (event.deltaMode === 1) return event.deltaY * 16
    if (event.deltaMode === 2) return event.deltaY * el.clientHeight
    return event.deltaY
  }
  async function zoomWithWheel(event: WheelEvent) {
    if (!(event.ctrlKey || event.metaKey) || !options.wheelZoom()) return
    const el = scroller.value
    if (!el || !options.valid()) return
    // Keep the browser from zooming the page, also at the zoom limits.
    if (event.cancelable) event.preventDefault()
    const delta = wheelDelta(event, el)
    if (!delta) return
    // A zoom changes the coordinate system, as a pinch does: in-flight gestures end without a proposal.
    if (options.gestureActive()) options.cancelGestures('source-changed')
    options.hideTooltip()
    const factor = Math.max(1 / wheelStep, Math.min(wheelStep, Math.exp(-delta * Math.log(wheelStep) / 100)))
    const next = clampZoom(zoom.value * factor)
    if (Math.abs(next - zoom.value) < 1e-6) return
    const offset = Math.max(0, Math.min(options.timeAreaWidth(el), options.timeAreaOffset(event.clientX, el.getBoundingClientRect())))
    const pending = wheelPending
    const axis = options.axis()
    // Until a pending zoom has scrolled, its anchor time defines where the axis will be.
    const time = pending ? axis.toTime(axis.toX(pending.time) - pending.offset + offset) : axis.toTime(wheelScrollStart(el) + offset)
    zoom.value = next
    const mine = wheelPending = { time, offset }
    await nextTick()
    if (wheelPending !== mine) return
    wheelPending = undefined
    const requested = options.axis().toX(time) - offset
    options.setScrollStart(el, requested)
    wheelScroll = { el, requested, reported: options.scrollStart(el), zoom: zoom.value }
    options.syncViewport()
  }
  function syncWheelListener() {
    const el = options.wheelZoom() && attached ? scroller.value : undefined
    if (el === wheelTarget) return
    wheelTarget?.removeEventListener('wheel', zoomWithWheel)
    wheelTarget = el
    wheelTarget?.addEventListener('wheel', zoomWithWheel, { passive: false })
  }
  watch(options.wheelZoom, syncWheelListener, { flush: 'post' })

  return {
    applyZoom, trackTouch, moveTouch, endTouch,
    /** Attach the `touchmove` and (with `wheelZoom`) `wheel` listeners to the mounted scroll viewport. */
    attach() {
      attached = true
      scroller.value?.addEventListener('touchmove', holdPinch, { passive: false })
      syncWheelListener()
    },
    detach() {
      attached = false
      scroller.value?.removeEventListener('touchmove', holdPinch)
      wheelTarget?.removeEventListener('wheel', zoomWithWheel)
      wheelTarget = undefined
    },
  }
}
