// Type-level tests of the `idle-escape` listener props and `taskViewBindings`, run by `npm run typecheck`. Nothing here
// is executed. `test:package` checks the same listener types against the built declarations.
import {
  GanttChart, NetworkGraph, taskViewBindings, type GraphEdge, type NetworkNode, type TimelineBar, type TimelineEdit, type TimelineRow,
  type ResourceAssignment, type ScheduledTask, type ViewBinding,
} from '../../src'

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false
function assertType<T extends true>(value?: T) { return value }

const graph = new NetworkGraph({ nodes: [] as NetworkNode[], edges: [] as GraphEdge[] })
assertType<Equal<Parameters<NonNullable<typeof graph.$props.onIdleEscape>>[0], KeyboardEvent>>()
const chart = new GanttChart({ rows: [] as TimelineRow[], bars: [] as TimelineBar[], range: { start: 0, end: 1 } })
assertType<Equal<Parameters<NonNullable<typeof chart.$props.onIdleEscape>>[0], KeyboardEvent>>()
// The listener props of the existing events stay typed next to it.
assertType<Equal<Parameters<NonNullable<typeof chart.$props.onEdit>>[0], TimelineEdit>>()

const bindings: ViewBinding[] = taskViewBindings({
  tasks: [{ id: 'A', work: [{ start: 0, end: 1 }] }], assignments: [{ taskId: 'A', resourceId: 'r', workDuration: 1 }], dependencies: [{ id: 'd' }],
  inactiveTaskIds: new Set(['B']), taskKind: 'operation',
})
void bindings
// A schedule's tasks and the assignments of calculateResourceLoad fit as they are.
declare const scheduled: readonly ScheduledTask[]
declare const assignments: readonly ResourceAssignment[]
taskViewBindings({ tasks: scheduled, assignments })
// @ts-expect-error Tasks need an ID.
taskViewBindings({ tasks: [{ work: [] }] })
// @ts-expect-error Work is a list of time ranges, not a start and an end.
taskViewBindings({ tasks: [{ id: 'A', start: 0, end: 1, work: 1 }] })
