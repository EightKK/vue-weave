import { invertWorkPeriods, scheduleTasks, type ScheduleResult } from '../../src'

// The schedule sheet: the Line 3 retrofit project, in days. It shares no entities with the production plan.
// The model: one entry per row. `start` is a "start no earlier than" constraint, `after` the predecessor IDs.
export interface Task { id: string; parentId?: string; start?: number; duration: number; after: string[]; resource: string | null; done: number }

export const names: Record<string, [string, string]> = {
  plan: ['計画', 'Planning'], spec: ['要件定義', 'Requirements'], layout: ['レイアウト設計', 'Layout design'], approve: ['設計承認', 'Design approval'],
  buy: ['調達', 'Procurement'], order: ['部品発注', 'Order parts'], frame: ['フレーム製作', 'Build frame'],
  install: ['据付', 'Installation'], remove: ['旧設備撤去', 'Remove old line'], assemble: ['組立', 'Assembly'], trial: ['試運転', 'Trial run'], handover: ['引き渡し', 'Handover'],
}
const task = (id: string, duration: number, after: string[] = [], resource: string | null = null, done = 0, parentId?: string): Task =>
  ({ id, parentId, duration, after, resource, done })
export const initialTasks: readonly Task[] = [
  task('plan', 0),
  task('spec', 3, [], 'design', 100, 'plan'), task('layout', 5, ['spec'], 'design', 40, 'plan'), task('approve', 0, ['layout'], null, 0, 'plan'),
  task('buy', 0, ['approve']),
  task('order', 2, [], 'purchasing', 0, 'buy'), task('frame', 6, ['order'], 'machining', 0, 'buy'),
  task('install', 0),
  task('remove', 3, ['approve'], 'maintenance', 0, 'install'), task('assemble', 4, ['frame', 'remove'], 'assembly', 0, 'install'),
  task('trial', 2, ['assemble'], 'qa', 0, 'install'), task('handover', 0, ['trial'], null, 0, 'install'),
]

// Time is measured in days from Monday 1 March 2027; Saturdays and Sundays are not working time.
export const sheetRange = { start: 0, end: 70 }
export const origin = Date.UTC(2027, 2, 1)
export const workPeriods = Array.from({ length: 10 }, (_, week) => ({ start: week * 7, end: week * 7 + 5 }))
export const weekends = invertWorkPeriods(workPeriods, sheetRange)

export const sheetLinks = (tasks: readonly Task[]) => tasks.flatMap(item => item.after.map(from => ({ id: from + '>' + item.id, from, to: item.id, type: 'FS' as const })))
export const scheduleSheet = (tasks: readonly Task[]): ScheduleResult => scheduleTasks({
  range: sheetRange, quantum: 1, calendars: [{ id: 'week', periods: workPeriods }], defaultCalendarId: 'week', dependencies: sheetLinks(tasks),
  tasks: tasks.map(({ id, parentId, duration, start }) => ({ id, duration, ...(parentId && { parentId }), ...(start !== undefined && { startNoEarlierThan: start }) })),
})
