import { computed, shallowRef } from 'vue'

/** Retain immutable application snapshots. One commit represents one user action. */
export function useEditHistory<T>(initial: T, limit = 100) {
  if (!Number.isInteger(limit) || limit < 1) throw new RangeError('History limit must be a positive integer')
  const history = shallowRef<{ entries: readonly T[]; index: number }>({ entries: [initial], index: 0 })
  const state = computed<T>(() => history.value.entries[history.value.index]!)
  const canUndo = computed(() => history.value.index > 0)
  const canRedo = computed(() => history.value.index + 1 < history.value.entries.length)

  function commit(snapshot: T) {
    if (Object.is(snapshot, state.value)) return
    const { entries, index } = history.value
    const next = [...entries.slice(0, index + 1), snapshot].slice(-(limit + 1))
    history.value = { entries: next, index: next.length - 1 }
  }
  function undo() {
    if (canUndo.value) history.value = { ...history.value, index: history.value.index - 1 }
  }
  function redo() {
    if (canRedo.value) history.value = { ...history.value, index: history.value.index + 1 }
  }
  function reset(snapshot: T) {
    history.value = { entries: [snapshot], index: 0 }
  }
  /** The snapshot one step back, without moving the position. */
  function peekUndo(): T | undefined {
    const { entries, index } = history.value
    return index > 0 ? entries[index - 1] : undefined
  }
  /** The snapshot one step forward, without moving the position. */
  function peekRedo(): T | undefined {
    const { entries, index } = history.value
    return index + 1 < entries.length ? entries[index + 1] : undefined
  }
  /** Replace the entry at the current position. Other entries and the position are kept. */
  function replaceCurrent(snapshot: T) {
    const { entries, index } = history.value
    const next = entries.slice()
    next[index] = snapshot
    history.value = { entries: next, index }
  }
  return { state, canUndo, canRedo, commit, undo, redo, reset, peekUndo, peekRedo, replaceCurrent }
}
