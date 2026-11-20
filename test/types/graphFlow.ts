// Type-level checks for the quantity flow projection. Checked by `npm run typecheck`.
import {
  graphFlowBands, layoutFlowGraph, type GraphEdge, type GraphEdgeBand, type GraphFlowBand, type GraphFlowExcludedEdge, type GraphFlowLayout,
  type GraphFlowNode, type GraphLayout, type GraphLayoutFunction, type GraphSvgOptions, type NetworkEdgeSlot, type NetworkNode,
} from '../../src/core/index'

declare const nodes: readonly NetworkNode<{ site: string }>[]
declare const edges: readonly GraphEdge<{ amount: number; unit: 'pcs' | 'kg' }>[]

// The accessors receive the caller's edge and node types, so data needs no casts.
const flow: GraphFlowLayout = layoutFlowGraph(nodes, edges, {
  quantity: edge => edge.data?.amount ?? 0, unit: edge => edge.data?.unit ?? 'pcs', displayUnit: 'pcs',
  nodeLabel: node => node.data?.site ?? node.label, scale: { pixelsPerUnit: 2 }, direction: 'TB',
})
layoutFlowGraph(nodes, edges, { quantity: () => 1, unit: 'pcs', scale: { fitExtent: 300 } })
// @ts-expect-error the unit is required
layoutFlowGraph(nodes, edges, { quantity: () => 1 })
// @ts-expect-error data has no field `missing`
layoutFlowGraph(nodes, edges, { quantity: edge => edge.data?.missing, unit: 'pcs' })
// @ts-expect-error a quantity is a number
layoutFlowGraph(nodes, edges, { quantity: () => '5', unit: 'pcs' })
// @ts-expect-error a scale is either pixels per unit or a fit extent
layoutFlowGraph(nodes, edges, { quantity: () => 1, unit: 'pcs', scale: 2 })

// The result is a GraphLayout for the NetworkGraph `layout` prop; its bands fit `edgeBands` and the export option.
const layout: GraphLayout = flow
const fn: GraphLayoutFunction = () => flow
const bands: Map<string, GraphEdgeBand> = graphFlowBands(flow)
const options: GraphSvgOptions = { edgeBands: bands }
const node: GraphFlowNode | undefined = flow.nodes[0]
const band: GraphFlowBand | undefined = flow.bands[0]
const excluded: GraphFlowExcludedEdge[] = flow.excluded
const reference: boolean | undefined = band?.reference
const offsets: [number, number] | undefined = band && [band.sourceOffset, band.targetOffset]
const totals: number[] | undefined = node && [node.inflow, node.outflow, node.difference, node.referenceInflow, node.referenceOutflow]
declare const slot: NetworkEdgeSlot
const slotBand: GraphEdgeBand | undefined = slot.band
void [layout, fn, options, excluded, reference, offsets, totals, slotBand]
