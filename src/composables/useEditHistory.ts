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
  return { state, canUndo, canRedo, commit, undo, redo, reset }
}
