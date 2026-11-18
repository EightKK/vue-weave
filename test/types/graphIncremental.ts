// Type-level checks for incremental placement, its change metrics and the incremental layout request fields. Checked by
// `npm run typecheck`.
import {
  buildGraphLayoutRequests, graphLayoutChangeMetrics, layoutGraphIncrementally, type GraphBox, type GraphEdge, type GraphIncrementalLayout,
  type GraphIncrementalLayoutOptions, type GraphKnownPosition, type GraphLayout, type GraphLayoutChangeMetrics, type GraphLayoutFunction,
  type GraphLayoutRequest, type NetworkNode,
} from '../../src'
import type { GraphIncrementalLayout as CoreLayout } from '../../src/core/index'

declare const nodes: NetworkNode[]
declare const edges: GraphEdge[]
declare const boxes: Map<string, GraphBox>
const points: ReadonlyMap<string, GraphKnownPosition> = new Map([['a', { x: 0, y: 0 }], ['b', { x: 10, y: 0, width: 80, height: 30 }]])
const options: GraphIncrementalLayoutOptions = { direction: 'TB', fixedIds: new Set(['a']), maxDisplacement: 40, allowNegative: true }
const fromBoxes: GraphIncrementalLayout = layoutGraphIncrementally(nodes, edges, boxes)
const fromPoints: CoreLayout = layoutGraphIncrementally(nodes, edges, points, { ...options, previousLayout: fromBoxes })
// The result is a layout, so it fits the NetworkGraph `layout` prop.
const layout: GraphLayout = fromPoints
const layoutFunction: GraphLayoutFunction = (shownNodes, shownEdges) => layoutGraphIncrementally(shownNodes, shownEdges, layout.boxes)
const placed: string[] = [...fromPoints.placedIds, ...fromPoints.movedIds, ...fromPoints.fallbackIds]
// @ts-expect-error not a direction
layoutGraphIncrementally(nodes, edges, boxes, { direction: 'up' })
// @ts-expect-error a position needs both coordinates
layoutGraphIncrementally(nodes, edges, new Map([['a', { x: 1 }]]))

const metrics: GraphLayoutChangeMetrics = graphLayoutChangeMetrics(points, fromPoints, { edges })
const counts: number[] = [metrics.compared, metrics.maxDisplacement, metrics.totalDisplacement, metrics.overlaps, metrics.edgeBoxIntersections]

const { shown } = buildGraphLayoutRequests({ nodes, edges, positions: points, fixedIds: new Set(['a']), addedIds: new Set(['c']) }, 'r')
const request: GraphLayoutRequest = shown
const fixed: ReadonlySet<string> | undefined = request.fixedIds
const added: ReadonlySet<string> | undefined = request.addedIds
// @ts-expect-error IDs are a Set
buildGraphLayoutRequests({ nodes, edges, fixedIds: ['a'] }, 'r')

void [layoutFunction, placed, counts, fixed, added]
