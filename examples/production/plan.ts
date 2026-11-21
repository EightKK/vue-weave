import {
  calculateResourceLoad, scheduleTasks, type ScheduleLink, type TimeRange, type TimelineEdit,
} from '../../src'

export const hour = 3_600_000
export const range = { start: 8 * hour, end: 24 * hour }
export const deadline = 19 * hour
export const maintenance = { start: 10 * hour, end: 13 * hour }
export const taskIds = ['prep', 'cutA', 'cutB', 'inspect', 'pack'] as const
export type TaskId = typeof taskIds[number]
export const resourceIds = ['workbench', 'cnc', 'saw', 'bench', 'dispatch'] as const
export type Strategy = 'original' | 'wait' | 'backup'
export interface Plan {
  strategy: Strategy
  starts: Partial<Record<TaskId, number>>
}

const duration = { prep: 2, cutA: 3, cutB: 2, inspect: 2, pack: 2 }
export const links: ScheduleLink[] = [
  { id: 'prep-a', from: 'prep', to: 'cutA' },
  { id: 'prep-b', from: 'prep', to: 'cutB' },
  { id: 'a-inspect', from: 'cutA', to: 'inspect' },
  { id: 'b-inspect', from: 'cutB', to: 'inspect' },
  { id: 'inspect-pack', from: 'inspect', to: 'pack' },
]
const waitLinks = [...links, { id: 'a-b', from: 'cutA', to: 'cutB' }]
const resources = resourceIds.map(id => ({
  id, capacity: 1, ...(id === 'cnc' ? { capacityPeriods: [{ ...maintenance, capacity: 0 }] } : {}),
}))

export function clock(time: number) {
  return String(Math.floor(time / hour)).padStart(2, '0') + ':00'
}

export function displayRange(task: TimeRange) {
  return clock(task.start) + '–' + clock(task.end)
}

// The starting plan still includes work during maintenance. Both alternatives respect the outage.
export function calculatePlan(plan: Plan) {
  const resourceFor = {
    prep: 'workbench', cutA: plan.strategy === 'backup' ? 'saw' : 'cnc',
    cutB: 'cnc', inspect: 'bench', pack: 'dispatch',
  } as const
  const dependencies = plan.strategy === 'wait' ? waitLinks : links
  const tasks = taskIds.map(id => {
    const afterMaintenance = (id === 'cutA' && plan.strategy === 'wait')
      || (id === 'cutB' && plan.strategy !== 'original')
    return {
      id, duration: duration[id] * hour,
      startNoEarlierThan: Math.max(plan.starts[id] ?? range.start, afterMaintenance ? maintenance.end : range.start),
    }
  })
  const schedule = scheduleTasks({ range, tasks, dependencies, quantum: hour })
  if (!schedule.ok) return undefined

  const byId = new Map(schedule.tasks.map(task => [task.id, task]))
  const load = calculateResourceLoad(range, schedule.tasks, resources,
    taskIds.map(taskId => ({ taskId, resourceId: resourceFor[taskId] })))
    .filter(segment => segment.load > 0)
  const shipping = byId.get('pack')!.end
  const lateHours = Math.max(0, shipping - deadline) / hour
  const cncOverload = load.filter(segment => segment.resourceId === 'cnc' && segment.overload > 0)
    .reduce((hours, segment) => hours + (segment.end - segment.start) / hour, 0)
  return { dependencies, byId, resourceFor, load, shipping, lateHours, cncOverload }
}

export type Schedule = NonNullable<ReturnType<typeof calculatePlan>>

// demo:edit
// Apply a proposed start to the input. The scheduler recomputes all dependent tasks in the same transaction.
export function proposeStart(plan: Plan, id: TaskId, start: number) {
  if (!Number.isInteger(start / hour) || start < range.start || start >= range.end) return undefined
  const next = { ...plan, starts: { ...plan.starts, [id]: start } }
  const computed = calculatePlan(next)
  if (!computed || computed.byId.get(id)!.start !== start) return undefined
  return { next, computed }
}

// Give GanttChart the downstream dates so it can preview them during the drag.
export function downstreamEdits(before: Schedule, after: Schedule, change: TimelineEdit): TimelineEdit[] {
  return taskIds.filter(id => id !== change.id && before.byId.get(id)!.start !== after.byId.get(id)!.start)
    .map(id => ({
      id, before: before.byId.get(id)!, after: after.byId.get(id)!, mode: 'move', source: change.source,
    }))
}
// demo:end
