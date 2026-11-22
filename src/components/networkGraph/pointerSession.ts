// The bookkeeping NetworkGraph's pointer drags share (node drags, connection drags and handle drags): the pointer and
// element that own the drag, where it started, and the camera at the start. The functions run in event handlers only.
import type { GraphPoint } from '../../core/graph.js'
import type { GraphViewport } from '../../core/types.js'
import { capturePointer, pastThreshold, releasePointer } from '../shared/pointer.js'

export interface PointerSession {
  /** The pointer that owns the drag; events of other pointers are ignored. */
  pointerId: number
  /** The element pressed, which takes the focus and the pointer capture. */
  target: SVGElement
  /** The press position in client coordinates. */
  start: GraphPoint
  /**
   * The camera position at the press, for drags during which auto-pan may move the camera: `chartDelta` then counts the
   * camera movement as pointer movement. Without it the camera is assumed not to move.
   */
  camera?: GraphPoint
}

/** A session for the pointer of `event` on its current target, recording `camera` when the camera may move. */
export function pointerSession(event: PointerEvent, camera?: GraphPoint): PointerSession {
  const session: PointerSession = { pointerId: event.pointerId, target: event.currentTarget as SVGElement, start: { x: event.clientX, y: event.clientY } }
  if (camera) session.camera = { x: camera.x, y: camera.y }
  return session
}

/** Focus the pressed element without scrolling and capture the pointer on it. */
export function grabPointer(session: PointerSession) {
  session.target.focus({ preventScroll: true })
  capturePointer(session.target, session.pointerId)
}

/** Whether an event belongs to the session's pointer. */
export function ownsPointer<S extends PointerSession>(session: S | undefined, event: PointerEvent): session is S {
  return session?.pointerId === event.pointerId
}

/** Whether the pointer has travelled the drag threshold from the press. */
export function sessionPastThreshold(session: PointerSession, clientX: number, clientY: number) {
  return pastThreshold(session.start, { clientX, clientY })
}

/**
 * The pointer movement since the press in chart units under `camera`. A session with a start camera also counts the
 * camera movement since the press (auto-pan moves the chart under a still pointer).
 */
export function chartDelta(session: PointerSession, clientX: number, clientY: number, camera: GraphViewport): GraphPoint {
  let dx = clientX - session.start.x, dy = clientY - session.start.y
  if (session.camera) {
    dx -= camera.x - session.camera.x
    dy -= camera.y - session.camera.y
  }
  return { x: dx / camera.scale, y: dy / camera.scale }
}

/** End the pointer capture that the session's element still holds. */
export function releaseSession(session: PointerSession | undefined) {
  if (session) releasePointer(session.target, session.pointerId)
}
