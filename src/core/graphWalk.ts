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
 * Breadth-first walks from the same `starts`, one per entry of `walks` (each the adjacency of that walk), advanced
 * together one hop at a time: every walk handles all its nodes `k` steps from a start before any walk handles a node
 * `k + 1` steps away, and at the same hop the walks run in the order given. Each walk keeps its own depths, so a node
 * reached by one walk is still walked by another. For every step from a node closer than `maxHops`, `onStep(walk, from,
 * step, seen)` is called in discovery order, with `seen` true when the step leads to a node this walk already holds; it
 * returns whether the walk may enter an unseen node (the return value is ignored for a seen one). A node at `maxHops`
 * is not expanded and is passed to `onHopLimit(walk, id)` instead. Iterative; terminates on cycles.
 */
export function walkInLockstep<T>(
  starts: readonly string[],
  walks: readonly ((id: string) => readonly T[] | undefined)[],
  target: (step: T) => string,
  maxHops: number,
  onStep: (walk: number, from: string, step: T, seen: boolean) => boolean,
  onHopLimit: (walk: number, id: string) => void,
): void {
  const states = walks.map(() => ({ depth: new Map<string, number>(), queue: [] as string[], cursor: 0 }))
  for (const state of states) {
    for (const id of starts) {
      if (state.depth.has(id)) continue
      state.depth.set(id, 0)
      state.queue.push(id)
    }
  }
  for (let hop = 0; ; hop++) {
    let pending = false
    for (let w = 0; w < walks.length; w++) {
      const state = states[w]!
      while (state.cursor < state.queue.length) {
        const id = state.queue[state.cursor]!
        const d = state.depth.get(id)!
        if (d > hop) break
        state.cursor++
        if (d >= maxHops) {
          onHopLimit(w, id)
          continue
        }
        for (const step of walks[w]!(id) ?? []) {
          const next = target(step)
          const seen = state.depth.has(next)
          if (onStep(w, id, step, seen) && !seen) {
            state.depth.set(next, d + 1)
            state.queue.push(next)
          }
        }
      }
      if (state.cursor < state.queue.length) pending = true
    }
    if (!pending) return
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
