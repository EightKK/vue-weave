// Type-level checks that the tree, incremental and swimlane options extend the shared GraphLayoutOptions and still take
// every object literal they took when they declared the shared fields themselves. Checked by `npm run typecheck`.
import {
  layoutGraphIncrementally, layoutSwimlaneGraph, layoutTreeGraph, type GraphBox, type GraphEdge, type GraphIncrementalLayoutOptions,
  type GraphLayoutOptions, type GraphLayout, type GraphNodeSize, type GraphSwimlaneLayoutOptions, type GraphTreeLayoutOptions,
  type NetworkNode,
} from '../../src/core/index'

declare const nodes: readonly NetworkNode<{ team: string }>[]
declare const edges: readonly GraphEdge[]
declare const boxes: ReadonlyMap<string, GraphBox>
declare const sizes: ReadonlyMap<string, GraphNodeSize>
declare const previous: GraphLayout

const shared = { direction: 'RL', nodeWidth: 120, nodeHeight: 40, columnGap: 30, rowGap: 10, padding: 8 } as const

// Every field of the earlier GraphTreeLayoutOptions.
const tree: GraphTreeLayoutOptions = { ...shared, roots: ['a', 'b'] }
const treeEmpty: GraphTreeLayoutOptions = {}
layoutTreeGraph(nodes, edges, { direction: 'BT', nodeWidth: 1, nodeHeight: 1, columnGap: 0, rowGap: 0, padding: 0, roots: [] })

// Every field of the earlier GraphIncrementalLayoutOptions.
const incremental: GraphIncrementalLayoutOptions = {
  ...shared, sizes, fixedIds: new Set(['a']), maxDisplacement: 12, allowNegative: false, previousLayout: previous,
}
const incrementalEmpty: GraphIncrementalLayoutOptions = {}
layoutGraphIncrementally(nodes, edges, boxes, {
  direction: 'TB', nodeWidth: 1, nodeHeight: 1, sizes, columnGap: 0, rowGap: 0, padding: 0, fixedIds: ['a'], maxDisplacement: 0,
  allowNegative: true, previousLayout: { boxes: previous.boxes, paths: previous.paths, edgeLabels: previous.edgeLabels },
})

// Every field of the earlier GraphSwimlaneLayoutOptions; lanes and laneOf stay required.
const swimlane: GraphSwimlaneLayoutOptions<NetworkNode<{ team: string }>> = {
  ...shared, lanes: ['a', { id: 'b', label: 'B' }], laneOf: node => node.data?.team, laneGap: 4, lanePadding: 6, minLaneSize: 80,
  headerSize: 40, crossingReduction: 'none', crossingSweeps: 2,
}
layoutSwimlaneGraph(nodes, edges, {
  lanes: ['a'], laneOf: new Map([['n', 'a']]), direction: 'LR', nodeWidth: 1, nodeHeight: 1, columnGap: 0, rowGap: 0, padding: 0,
})
// @ts-expect-error lanes are required
const noLanes: GraphSwimlaneLayoutOptions = { laneOf: new Map() }

// Each specific options type is a GraphLayoutOptions, so shared settings can be passed around with one type.
const common: GraphLayoutOptions[] = [tree, treeEmpty, incremental, incrementalEmpty, swimlane]
const fromCommon: GraphTreeLayoutOptions = common[0]!
const asIncremental: GraphIncrementalLayoutOptions = shared
// @ts-expect-error the shared fields keep their types
const wrongGap: GraphTreeLayoutOptions = { columnGap: '10' }
// @ts-expect-error the shared fields keep their types
const wrongDirection: GraphIncrementalLayoutOptions = { direction: 'up' }
void [noLanes, fromCommon, asIncremental, wrongGap, wrongDirection]
