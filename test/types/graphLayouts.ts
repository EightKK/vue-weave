// Type-level checks for the node callbacks of the built-in layouts. Checked by `npm run typecheck`.
import { layoutCircularGraph, layoutConcentricGraph, type GraphEdge, type NetworkNode } from '../../src/core/index'

declare const nodes: readonly NetworkNode<{ weight: number }>[]
declare const edges: readonly GraphEdge[]

// The callbacks receive the caller's node type, so labels and data need no casts.
layoutCircularGraph(nodes, edges, { sort: (a, b) => a.label.localeCompare(b.label) })
layoutConcentricGraph(nodes, edges, { level: (node, degree) => (node.data?.weight ?? 0) + degree })
// @ts-expect-error data has no field `missing`
layoutConcentricGraph(nodes, edges, { level: node => node.data?.missing ?? 0 })
// @ts-expect-error a level must be a number
layoutConcentricGraph(nodes, edges, { level: node => node.label })
