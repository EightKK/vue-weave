// The four dependency types shared by the timeline, scheduling and the PropertyInspector list fields. Internal: the
// public type is `TimelineDependencyType`.
import type { TimelineDependencyType } from './types.js'

/** FS, SS, FF and SF, in the order the PropertyInspector type select lists them. */
export const dependencyTypes: readonly TimelineDependencyType[] = ['FS', 'SS', 'FF', 'SF']

/** Whether a value is one of the four dependency types. */
export function isDependencyType(value: unknown): value is TimelineDependencyType {
  return (dependencyTypes as readonly unknown[]).includes(value)
}
