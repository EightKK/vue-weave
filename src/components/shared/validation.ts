// Internal helpers shared by the components for validator results and validated props. Not exported from the package.
import { ref, shallowRef, watch, type Ref, type ShallowRef, type WatchSource } from 'vue'

/** The result of a synchronous validator such as `validateEdit`: accept with true or nothing, reject with false or a reason. */
export type ValidatorResult = boolean | string | void | undefined

/**
 * The rejection reason of a synchronous validator result, or undefined when it accepts.
 *
 * - `true` and `undefined` (nothing returned) accept.
 * - `false` rejects with `fallback`, the component's default text for that proposal.
 * - A string rejects with that string. A blank or whitespace-only string also rejects, with `fallback`: a reason that
 *   says nothing would leave the live region and the `*-rejected` payload empty, so every component treats it as a
 *   rejection without a reason of its own. (PropertyInspector always did this; the other components used to pass `''`.)
 */
export function rejectionReason(result: ValidatorResult, fallback: string): string | undefined {
  if (typeof result === 'string') return result.trim() ? result : fallback
  return result === false ? fallback : undefined
}

export interface ValidatedSourceOptions<T> {
  /** Reports the error, typically `emit('validation-error', error)`. Runs after `value` and `error` are updated. */
  report: (error: Error) => void
  /** The value while the input is invalid. */
  fallback: T
  /** Rethrows the error after reporting it, so development builds surface it. Default true. */
  rethrow?: boolean
}

/**
 * Validate (and derive from) the props named by `source` immediately and whenever they change. While they are valid,
 * `value` holds the result of `validate` and `error` is undefined; when `validate` throws, `value` falls back to
 * `options.fallback`, `error` holds the error (non-Error throws are wrapped), `options.report` is called and the original
 * error is rethrown. Components render their empty state while `error` is set.
 */
export function useValidatedSource<T>(
  source: WatchSource | readonly WatchSource[],
  validate: () => T,
  options: ValidatedSourceOptions<T>,
): { value: ShallowRef<T>; error: Ref<Error | undefined> } {
  const value = shallowRef(options.fallback) as ShallowRef<T>
  const error = ref<Error>()
  const sources = (Array.isArray(source) ? source : [source]) as WatchSource[]
  watch(sources, () => {
    try {
      value.value = validate()
      error.value = undefined
    } catch (thrown) {
      const failure = thrown instanceof Error ? thrown : new Error(String(thrown))
      value.value = options.fallback
      error.value = failure
      options.report(failure)
      if (options.rethrow !== false) throw thrown
    }
  }, { immediate: true })
  return { value, error }
}
