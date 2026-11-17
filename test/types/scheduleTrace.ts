// Type-level checks for the explain overloads of scheduleTasks and levelResources. Checked by `npm run typecheck`.
import {
  levelResources, scheduleTasks, toPlanningDiagnostics, type LevelResourcesInput, type PlanningDiagnostic, type PlanningDiagnosticCode,
  type ScheduleInput, type ScheduleTrace,
} from '../../src/core/index'

declare const input: ScheduleInput
declare const leveling: LevelResourcesInput
declare const flag: boolean

const plain = scheduleTasks(input)
if (plain.ok) {
  // @ts-expect-error a result calculated without explain has no trace
  void plain.trace
}
const off = scheduleTasks(input, { explain: false })
if (off.ok) {
  // @ts-expect-error explain: false has no trace either
  void off.trace
}
const explained = scheduleTasks(input, { explain: true })
if (explained.ok) {
  const trace: ScheduleTrace = explained.trace
  void trace
}
const maybe = scheduleTasks(input, { explain: flag })
if (maybe.ok && 'trace' in maybe) {
  const trace: ScheduleTrace = maybe.trace
  void trace
}

const leveled = levelResources(leveling)
if (leveled.ok) {
  // @ts-expect-error a leveling result without explain has no trace
  void leveled.trace
}
const explainedLeveling = levelResources(leveling, { explain: true })
if (explainedLeveling.ok) {
  const trace: ScheduleTrace = explainedLeveling.trace
  const unresolved: readonly string[] = explainedLeveling.unresolvedTaskIds
  void trace
  void unresolved
}

const diagnostics: PlanningDiagnostic[] = toPlanningDiagnostics(explainedLeveling)
void diagnostics

// The manual-conflict code is a member of PlanningDiagnosticCode.
const conflictCode: PlanningDiagnosticCode = 'manual-conflict'
void conflictCode
// @ts-expect-error unknown codes are not members
const unknownCode: PlanningDiagnosticCode = 'manual-conflicts'
void unknownCode
