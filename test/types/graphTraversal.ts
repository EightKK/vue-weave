// Type-level checks for the traverseGraph options, graphTracePath and keyed graph expansion. Checked by `npm run typecheck`.
import {
  beginGraphExpansion, createGraphExpansion, graphExpansionView, graphTracePath, mergeGraphExpansionPage, traverseGraph,
  type GraphEdge, type GraphExpansionKeyOptions, type GraphTracedPath, type GraphTraversalOptions, type GraphTraversalResult,
  type GraphTraversalStep, type GraphTraversalTruncation, type GraphWalkDirection,
} from '../../src/core/index'

interface Call extends GraphEdge { relation: 'calls' | 'owns' }
declare const nodes: { id: string }[]
declare const calls: Call[]

// The filter receives the application's edge type and the walk direction.
const result: GraphTraversalResult = traverseGraph({ nodes, edges: calls }, ['a'], {
  edgeFilter: (edge, direction: GraphWalkDirection) => edge.relation === 'calls' && direction !== 'backward',
  maxNodes: 200,
  paths: true,
})
// @ts-expect-error the filter sees the edge type of the graph
traverseGraph({ nodes, edges: calls }, ['a'], { edgeFilter: (edge: { weight: number }) => edge.weight > 0 })
// A filter written for any edge fits a graph of a narrower edge type.
const generic: GraphTraversalOptions = { edgeFilter: edge => edge.from !== edge.to }
traverseGraph({ nodes, edges: calls }, ['a'], generic)

// The new result fields are optional, so code written for the earlier result keeps compiling.
const truncated: GraphTraversalTruncation[] | undefined = result.truncated
const step: GraphTraversalStep | undefined = result.via?.forward?.get('b')
const multiple: string[] | undefined = result.multiplyReachedIds
const path: GraphTracedPath | undefined = graphTracePath(result, 'b', { direction: 'forward' })
const firstEdge: string | undefined = path?.edgeIds[0]
void truncated
void step
void multiple
void firstEdge
// @ts-expect-error a path belongs to one walk
graphTracePath(result, 'b', { direction: 'both' })

// Keyed expansion keeps the node and edge types.
interface Part { id: string; sku: string }
const key: GraphExpansionKeyOptions = { key: 'forward' }
let expansion = createGraphExpansion<Part, Call>({ nodes: [{ id: 'a', sku: 'x' }] })
expansion = beginGraphExpansion(expansion, ['a'], key)
expansion = mergeGraphExpansionPage(expansion, { edges: [{ id: 'ab', from: 'a', to: 'b', relation: 'calls' }] }, ['a'], key)
const forwardIds: ReadonlySet<string> | undefined = expansion.expandedIdsByKey?.get('forward')
const frontier: string[] = graphExpansionView(expansion, { key: 'backward' }).frontierIds
const sku: string | undefined = graphExpansionView(expansion, key).nodes[0]?.sku
void forwardIds
void frontier
void sku
// @ts-expect-error a key is a string
beginGraphExpansion(expansion, ['a'], { key: 1 })
