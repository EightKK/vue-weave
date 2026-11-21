// Type-level checks for the flowchart and BPMN shapes, node markers, dashed edges and swimlane pools. Checked by `npm run typecheck`.
import { h } from 'vue'
import {
  NetworkGraph, layoutSwimlaneGraph, renderGraphSvg, type GraphEdge, type GraphEdgeMarker, type GraphSwimlanePool, type GraphSwimlanePoolBand,
  type GraphSwimlanePoolSpec, type NetworkFlowchartShape, type NetworkNode, type NetworkNodeEvent, type NetworkNodeLabelPosition,
  type NetworkNodeMarker, type NetworkNodeShape,
} from '../../src'

const flowchart: NetworkFlowchartShape[] = ['circle', 'stadium', 'parallelogram', 'document', 'cylinder', 'data-object']
const shapes: NetworkNodeShape[] = [...flowchart, 'box']
const markers: NetworkNodeMarker[] = ['exclusive', 'parallel', 'inclusive', 'event-based', 'message', 'timer', 'user', 'service', 'manual']
const events: NetworkNodeEvent[] = ['start', 'intermediate', 'end']
const positions: NetworkNodeLabelPosition[] = ['inside', 'below']
const hollow: GraphEdgeMarker = 'hollow-arrow'
// @ts-expect-error not a node marker
const complex: NetworkNodeMarker = 'complex'
// @ts-expect-error not an event border
const boundary: NetworkNodeEvent = 'boundary'
// @ts-expect-error not a label position
const above: NetworkNodeLabelPosition = 'above'

const node: NetworkNode<{ lane: string }> = {
  id: 'start', label: 'Order received', shape: 'circle', event: 'start', marker: 'message', labelPosition: 'below', data: { lane: 'sales' },
}
const edge: GraphEdge = { id: 'm', from: 'start', to: 'start', dashed: true, markerStart: 'circle', markerEnd: 'hollow-arrow' }

const spec: GraphSwimlanePoolSpec = { id: 'supplier', label: 'Supplier', lanes: ['sales'] }
const layout = layoutSwimlaneGraph([node], [edge], { lanes: ['sales'], laneOf: item => item.data?.lane, pools: [spec], poolHeaderSize: 30, poolGap: 20 })
const pools: GraphSwimlanePool[] | undefined = layout.pools
const bands: readonly GraphSwimlanePoolBand[] = pools ?? []
// @ts-expect-error a pool lists lane IDs
layoutSwimlaneGraph([node], [edge], { lanes: ['sales'], laneOf: item => item.data?.lane, pools: [{ id: 'p', lanes: [1] }] })

renderGraphSvg(layout, [node], [edge], { lanes: layout.lanes, pools: bands })
h(NetworkGraph, { nodes: [node], edges: [edge], lanes: layout.lanes, pools: bands })

void [shapes, markers, events, positions, hollow, complex, boundary, above]
