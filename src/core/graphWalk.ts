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

/**
 * Strongly connected components of the graph given by `outgoing`, found with an iterative Tarjan walk that starts from
 * the keys of `outgoing` in their order. Components are returned in the order Tarjan completes them, which is a reverse
 * topological order of the condensation. Members are listed in the order they leave the walk stack.
 */
export function stronglyConnectedComponents(outgoing: ReadonlyMap<string, readonly string[]>): string[][] {
  const number = new Map<string, number>()
  const low = new Map<string, number>()
  const onStack = new Set<string>()
  const stack: string[] = []
  const found: string[][] = []
  let counter = 0

  for (const root of outgoing.keys()) {
    if (number.has(root)) continue
    const frames = [{ id: root, cursor: 0 }]
    number.set(root, counter)
    low.set(root, counter++)
    stack.push(root)
    onStack.add(root)

    while (frames.length) {
      const frame = frames[frames.length - 1]!
      const children = outgoing.get(frame.id)!
      if (frame.cursor < children.length) {
        const next = children[frame.cursor++]!
        if (!number.has(next)) {
          number.set(next, counter)
          low.set(next, counter++)
          stack.push(next)
          onStack.add(next)
          frames.push({ id: next, cursor: 0 })
        } else if (onStack.has(next)) {
          low.set(frame.id, Math.min(low.get(frame.id)!, number.get(next)!))
        }
        continue
      }
      frames.pop()
      const parent = frames[frames.length - 1]
      if (parent) low.set(parent.id, Math.min(low.get(parent.id)!, low.get(frame.id)!))
      if (low.get(frame.id) === number.get(frame.id)) {
        const members: string[] = []
        for (;;) {
          const member = stack.pop()!
          onStack.delete(member)
          members.push(member)
          if (member === frame.id) break
        }
        found.push(members)
      }
    }
  }
  return found
}
