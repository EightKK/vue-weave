// A dependency-free asynchronous layout adapter for the demo. It runs the built-in layered layout and the built-in
// routers as if they were an external engine: the work can happen in this thread or in a Web Worker (see
// `../workers/graphLayout.worker.ts`), and the controls below delay, reorder or fail responses so the demo can show
// what `useAsyncGraphLayout` does with them. An ELK adapter would have the same shape (see docs/integration.md).
import { graphLayoutWorkerAdapter, type AsyncGraphLayoutAdapter, type GraphLayoutRequest, type GraphLayoutWorkerPort } from '../../src'
import { computeDemoLayout } from './layoutCompute'

/** What the demo's controls decide for each request the adapter receives. */
export interface AsyncLayoutControls {
  /** Milliseconds before the response of the `sequence`-th request (1 for the first one) is delivered. */
  delay(sequence: number, request: GraphLayoutRequest): number
  /** True to fail the request. */
  fail(sequence: number, request: GraphLayoutRequest): boolean
  /** Called when a response arrived: `discarded` when its request had been cancelled (superseded) meanwhile. */
  settled?(event: { sequence: number; scope: string; delay: number; outcome: 'ready' | 'failed' | 'discarded' }): void
}

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

/**
 * Wraps a layout computation in the demo's controls. `compute` is the built-in layout in this thread, or the Worker
 * adapter of `createWorkerComputation`. Like most external engines it cannot be stopped: a response always arrives after
 * `controls.delay`, so responses can arrive in any order, and the ones whose request was cancelled meanwhile are
 * reported as discarded (the composable never shows them).
 */
export function createControlledAdapter(compute: AsyncGraphLayoutAdapter<any, any, any>, controls: AsyncLayoutControls): AsyncGraphLayoutAdapter<any, any, any> {
  let sequence = 0
  return async (request, signal) => {
    const mine = ++sequence
    const delay = Math.max(0, controls.delay(mine, request))
    const settle = (outcome: 'ready' | 'failed' | 'discarded') =>
      controls.settled?.({ sequence: mine, scope: request.scope, delay, outcome })
    try {
      const layout = await compute(request, signal)
      await sleep(delay)
      if (signal.aborted) {
        settle('discarded')
        throw new Error('Layout request cancelled: ' + request.requestId)
      }
      if (controls.fail(mine, request)) throw new Error('The layout service rejected request ' + mine)
      settle('ready')
      return layout
    } catch (reason) {
      if (!signal.aborted) settle('failed')
      throw reason
    }
  }
}

/** The built-in computation in this thread. */
export const inThreadComputation: AsyncGraphLayoutAdapter<any, any, any> = request => computeDemoLayout(request as GraphLayoutRequest)

/** The same computation in a Worker the caller created (structured clone transport). */
export function createWorkerComputation(worker: GraphLayoutWorkerPort): AsyncGraphLayoutAdapter<any, any, any> {
  return graphLayoutWorkerAdapter(worker)
}
