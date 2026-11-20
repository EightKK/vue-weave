// Internal binary min-heap over a plain array, shared by the graph algorithms (shortest paths, betweenness, long-edge
// lanes, obstacle routing). Not exported from the package entry points. `before(a, b)` is a strict order; callers that
// need deterministic pops break ties themselves, for example by an insertion sequence.

/** Adds `item` to the heap. */
export function heapPush<T>(heap: T[], item: T, before: (a: T, b: T) => boolean): void {
  let i = heap.push(item) - 1
  while (i > 0) {
    const parent = (i - 1) >> 1
    if (!before(item, heap[parent]!)) break
    heap[i] = heap[parent]!
    i = parent
  }
  heap[i] = item
}

/** Removes and returns the first item of the heap, or undefined when it is empty. */
export function heapPop<T>(heap: T[], before: (a: T, b: T) => boolean): T | undefined {
  const top = heap[0]
  const last = heap.pop()
  if (last === undefined || heap.length === 0) return top
  let i = 0
  for (;;) {
    let child = 2 * i + 1
    if (child >= heap.length) break
    if (child + 1 < heap.length && before(heap[child + 1]!, heap[child]!)) child++
    if (!before(heap[child]!, last)) break
    heap[i] = heap[child]!
    i = child
  }
  heap[i] = last
  return top
}
