// Internal graph walks shared by the graph helpers. Not exported from the public entry points.

/**
 * Breadth-first walk from `starts` along `adjacent`, up to `maxHops` steps from the nearest start. Every step taken from
 * a node closer than `maxHops` is reported through `onStep`, with `reached` true when it leads to a node the walk has not
 * seen yet. Steps are reported in discovery order. The walk is iterative and terminates on cycles.
 */
export function walkWithinHops<T>(
  starts: Iterable<string>,
  adjacent: (id: string) => readonly T[] | undefined,
  target: (step: T) => string,
  maxHops: number,
  onStep: (step: T, reached: boolean) => void,
): void {
  const depth = new Map<string, number>()
  const queue: string[] = []
  for (const id of starts) {
    if (depth.has(id)) continue
    depth.set(id, 0)
    queue.push(id)
  }
  for (let i = 0; i < queue.length; i++) {
    const id = queue[i]!
    const d = depth.get(id)!
    if (d >= maxHops) continue
    for (const step of adjacent(id) ?? []) {
      const next = target(step)
      const reached = !depth.has(next)
      if (reached) {
        depth.set(next, d + 1)
        queue.push(next)
      }
      onStep(step, reached)
    }
  }
}
