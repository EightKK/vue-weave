---
title: Graph algorithms and traversal
description: Topological order, cycles, shortest paths, search, centrality, communities and filtered traversal of a graph.
---

# Graph algorithms and traversal

The core answers questions about a graph without drawing it: topological order and cycles (`topologicalOrder`, `findGraphCycles`), shortest paths, node search and filters, connected components, degree, betweenness and PageRank centrality, Louvain communities that `graphCommunityGroups` turns into NetworkGraph groups, and `traverseGraph`, which walks upstream or downstream within a hop limit, with edge filters, a node limit and the paths it took. All of them are written as loops, so a 12,000-node chain is fine, and they terminate on cycles.

Use them to highlight what depends on a node, to order work, to find the bottleneck of a process, or to load a graph one hop at a time (see [graph expansion](./linked-data.md#partial-data-loading)).

## Minimal example

```ts
import { traverseGraph, topologicalOrder } from '@eightkk/vue-weave/core'

const nodes = [{ id: 'ore' }, { id: 'steel' }, { id: 'frame' }, { id: 'bike' }]
const edges = [
  { id: 'e1', from: 'ore', to: 'steel' },
  { id: 'e2', from: 'steel', to: 'frame' },
  { id: 'e3', from: 'frame', to: 'bike' },
]
const downstream = traverseGraph({ nodes, edges }, ['steel'], { direction: 'forward', maxHops: 2 })
// downstream.nodeIds: ['steel', 'frame', 'bike']
const order = topologicalOrder(nodes, edges)
// <NetworkGraph :highlighted-node-ids="new Set(downstream.nodeIds)" ... />
```

**Examples:** [Bill of materials](/showcase/bom/), [Linked views](/examples/linked-views/). **Types:** [`traverseGraph`](../reference/core/functions/traverseGraph.md), [`GraphTraversalResult`](../reference/core/interfaces/GraphTraversalResult.md), [`topologicalOrder`](../reference/core/functions/topologicalOrder.md).

<!--@include: ../../../docs/api.md#graph-algorithms-->

<!--@include: ../../../docs/api.md#traversal-->
