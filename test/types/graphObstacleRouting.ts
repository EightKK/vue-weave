// Type-level checks for obstacle-avoiding orthogonal routing. Checked by `npm run typecheck`.
import { h } from 'vue'
import {
  findOrthogonalRoute, NetworkGraph, routeGraphEdges, type GraphEdge, type GraphLayout, type GraphObstacleAvoidance, type GraphPoint,
  type GraphRouteEnd, type NetworkNode,
} from '../../src'
import type { GraphObstacleAvoidance as CoreAvoidance, GraphRouteEnd as CoreEnd } from '../../src/core/index'

const from: GraphRouteEnd = { x: 0, y: 10, side: 'right' }
const to: CoreEnd = { x: 200, y: 10, side: 'left' }
// @ts-expect-error not a node side
const middle: GraphRouteEnd = { x: 0, y: 0, side: 'middle' }
const settings: GraphObstacleAvoidance = { clearance: 4, bendPenalty: 10 }
const coreSettings: CoreAvoidance = settings
const route: GraphPoint[] | undefined = findOrthogonalRoute(from, to, [{ x: 80, y: 0, width: 40, height: 40 }], settings)

const node: NetworkNode = { id: 'a', label: 'A' }
const edge: GraphEdge = { id: 'aa', from: 'a', to: 'a' }
declare const layout: GraphLayout
routeGraphEdges(layout, [edge], new Map([[node.id, node]]), { style: 'orthogonal', avoidNodes: true })
routeGraphEdges(layout, [edge], new Map([[node.id, node]]), { style: 'orthogonal', avoidNodes: { clearance: 6 } })
// @ts-expect-error not an avoidance setting
routeGraphEdges(layout, [edge], new Map([[node.id, node]]), { avoidNodes: 'yes' })
h(NetworkGraph, { nodes: [node], edges: [edge], edgeStyle: 'orthogonal', avoidNodes: true })
h(NetworkGraph, { nodes: [node], edges: [edge], avoidNodes: { clearance: 10 } })

void [middle, coreSettings, route]
