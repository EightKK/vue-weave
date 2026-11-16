// Type-level checks for node shapes, edge markers, per-edge styles and parallel spacing. Checked by `npm run typecheck`.
import { h } from 'vue'
import { NetworkGraph, routeGraphEdges, type GraphEdge, type GraphEdgeMarker, type GraphLayout, type NetworkNode, type NetworkNodeShape } from '../../src'
import type { GraphEdgeMarker as CoreMarker, NetworkNodeShape as CoreShape } from '../../src/core/index'

const shapes: NetworkNodeShape[] = ['box', 'rounded', 'diamond', 'ellipse', 'hexagon']
const markers: GraphEdgeMarker[] = ['arrow', 'open-arrow', 'circle', 'diamond', 'bar', 'none']
const coreShape: CoreShape = shapes[0]!
const coreMarker: CoreMarker = markers[0]!
// @ts-expect-error not a node shape
const star: NetworkNodeShape = 'star'
// @ts-expect-error not an edge marker
const cross: GraphEdgeMarker = 'cross'

const node: NetworkNode = { id: 'a', label: 'A', shape: 'hexagon' }
const edge: GraphEdge = { id: 'ab', from: 'a', to: 'b', edgeStyle: 'orthogonal', markerStart: 'circle', markerEnd: 'open-arrow', animated: true }
// @ts-expect-error not an edge style
const wavy: GraphEdge = { id: 'x', from: 'a', to: 'b', edgeStyle: 'wavy' }

declare const layout: GraphLayout
routeGraphEdges(layout, [edge], new Map([[node.id, node]]), { style: 'straight', parallelSpacing: 12 })
h(NetworkGraph, { nodes: [node], edges: [edge], parallelEdgeSpacing: 14 })

void [coreShape, coreMarker, star, cross, wavy]
