// Type-level checks for comparePlans. Checked by `npm run typecheck`.
import {
  comparePlans, levelResources, type LevelResourcesInput, type PlanComparison, type PlanScenario, type PlanTaskSide,
} from '../../src/core/index'

declare const input: LevelResourcesInput

// A leveled result and a task due time are accepted.
const current: PlanScenario = { input, result: levelResources(input), revision: 'r1' }
const candidate: PlanScenario = { input: { ...input, tasks: input.tasks.map(task => ({ ...task, deadline: 10 })) }, baseRevision: 'r1' }
const comparison: PlanComparison = comparePlans(current, candidate)

const state = comparison.result.state.candidate
if (state.status === 'scheduled') {
  const finish: number = state.finish
  void finish
} else if (state.status === 'infeasible') {
  const deadline: boolean = state.deadline
  void deadline
} else {
  // @ts-expect-error a cycle has no finish
  void state.finish
}

const side: PlanTaskSide = comparison.result.tasks[0]!.current
if (side.state === 'scheduled') {
  const start: number = side.start
  void start
} else {
  // @ts-expect-error only a scheduled side has dates
  void side.start
}

// @ts-expect-error the comparison is read-only data, not an input
comparison.result.tasks.push(comparison.result.tasks[0]!)

// @ts-expect-error a deadline is a number
comparePlans({ input: { ...input, tasks: [{ id: 'a', duration: 1, deadline: 'soon' }] } }, candidate)
