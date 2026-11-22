// Internal binary min-heap over a plain array, shared by the graph algorithms (shortest paths, betweenness, long-edge
// lanes, obstacle routing) and resource leveling. Not exported from the package entry points. `before(a, b)` is a strict order; callers that
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

/** A binary min-heap ordered by `before`, a strict order. Pops follow that order exactly when it is total. */
export class MinHeap<T> {
  private readonly items: T[] = []
  constructor(private readonly before: (a: T, b: T) => boolean) {}

  get size(): number { return this.items.length }

  push(item: T): void {
    heapPush(this.items, item, this.before)
  }

  /** Removes and returns the first item. The heap must not be empty. */
  pop(): T {
    return heapPop(this.items, this.before)!
  }
}

type Keyed<V> = [key: number, sequence: number, value: V]

const keyedBefore = <V>(a: Keyed<V>, b: Keyed<V>) => a[0] < b[0] || (a[0] === b[0] && a[1] < b[1])

/** A min-heap of values by numeric key. Equal keys pop in insertion order, so pops are deterministic. */
export class KeyedMinHeap<V> {
  private readonly heap = new MinHeap<Keyed<V>>(keyedBefore)
  private sequence = 0

  get size(): number { return this.heap.size }

  push(key: number, value: V): void {
    this.heap.push([key, this.sequence++, value])
  }

  /** Removes and returns `[key, value]` of the first item. The heap must not be empty. */
  pop(): [number, V] {
    const [key, , value] = this.heap.pop()
    return [key, value]
  }
}
