// Type-level checks for the swimlane layout. Checked by `npm run typecheck`.
import {
  graphSwimlaneAt, layoutSwimlaneGraph, type GraphEdge, type GraphLayout, type GraphLayoutFunction, type GraphSwimlane,
  type GraphSwimlaneBand, type NetworkNode,
} from '../../src/core/index'

declare const nodes: readonly NetworkNode<{ department: string }>[]
declare const edges: readonly GraphEdge[]

// `laneOf` receives the caller's node type, so data needs no casts.
const result = layoutSwimlaneGraph(nodes, edges, { lanes: ['buy', { id: 'make', label: 'Machining' }], laneOf: node => node.data?.department })
// @ts-expect-error data has no field `missing`
layoutSwimlaneGraph(nodes, edges, { lanes: [], laneOf: node => node.data?.missing })
// @ts-expect-error a lane ID is a string
layoutSwimlaneGraph(nodes, edges, { lanes: [], laneOf: () => 3 })
layoutSwimlaneGraph(nodes, edges, { lanes: ['a'], laneOf: new Map([['n', 'a']]), direction: 'TB', crossingReduction: 'none' })
// @ts-expect-error the swimlane layout orders lanes by barycenter only
layoutSwimlaneGraph(nodes, edges, { lanes: ['a'], laneOf: new Map(), crossingReduction: 'median' })

// The result is a GraphLayout, so it fits the NetworkGraph `layout` prop, and its lanes fit the `lanes` prop.
const layout: GraphLayout = result
const fn: GraphLayoutFunction = () => result
const bands: readonly GraphSwimlaneBand[] = result.lanes
const lane: GraphSwimlane | undefined = graphSwimlaneAt(result.lanes, { x: 1, y: 2 })
const ids: string[] | undefined = lane?.nodeIds
const band: GraphSwimlaneBand | undefined = graphSwimlaneAt(bands, { x: 0, y: 0, width: 10, height: 10 })
void [layout, fn, ids, band]
