// Type-level checks for scheduleToGraph. Checked by `npm run typecheck`.
import {
  scheduleToGraph, type GraphEdge, type NetworkNode, type ScheduleGraph, type ScheduleGraphEdgeData,
  type ScheduleGraphNodeData, type ScheduleSuccess, type ScheduledTask, type TimelineDependency,
} from '../../src/core/index'

declare const result: ScheduleSuccess
declare const dependencies: readonly TimelineDependency[]

const graph: ScheduleGraph = scheduleToGraph(result, dependencies)

// Node and edge data are the schedule values, readable without casts.
const node = graph.nodes[0]!
const critical: boolean | undefined = node.data?.critical
const earlyStart: number | undefined = node.data?.earlyStart
const task: ScheduledTask | undefined = node.data?.task
const edge = graph.edges[0]!
const lag: number | undefined = edge.data?.lag
const edgeCritical: boolean | undefined = edge.data?.critical
const type: 'FS' | 'SS' | 'FF' | 'SF' | undefined = edge.data?.type
void [critical, earlyStart, task, lag, edgeCritical, type]

// @ts-expect-error node data is ScheduleGraphNodeData, not unknown or any
void node.data?.missing
// @ts-expect-error edge data is ScheduleGraphEdgeData, not unknown or any
void edge.data?.missing

// The specialised items still fit the untyped item types.
const nodes: NetworkNode[] = graph.nodes
const edges: GraphEdge[] = graph.edges
const typedNodes: NetworkNode<ScheduleGraphNodeData>[] = graph.nodes
const typedEdges: GraphEdge<ScheduleGraphEdgeData>[] = graph.edges
void [nodes, edges, typedNodes, typedEdges]
