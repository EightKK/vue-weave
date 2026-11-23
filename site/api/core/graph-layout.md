---
title: Graph layout and routing
description: Layered and extra graph layouts, ports and edge routing, incremental placement, quantity flows, viewport helpers and asynchronous layouts.
---

# Graph layout and routing

The core computes where nodes go and how edges run, without Vue: a deterministic layered layout (`layoutLayeredGraph`) in four directions with crossing reduction, tree, radial, circular, grid, concentric, force and swimlane layouts, named ports, orthogonal routes around obstacles, edge label placement, incremental placement that keeps the nodes already on display, and quantity flows (Sankey diagrams). NetworkGraph calls the same functions; call them yourself to lay out on a server or in a Worker, to feed the `layout` prop, or to draw your own renderer.

## Minimal example

```ts
import { layoutRadialGraph, type GraphLayoutFunction } from '@eightkk/vue-weave/core'

const nodes = [{ id: 'hub', label: 'Hub' }, { id: 'a', label: 'A' }, { id: 'b', label: 'B' }]
const edges = [{ id: 'ha', from: 'hub', to: 'a' }, { id: 'hb', from: 'hub', to: 'b' }]

// On a server or in a Worker: a plain result with boxes, paths and bounds
const layout = layoutRadialGraph(nodes, edges, { roots: ['hub'] })

// In NetworkGraph: the same function through the `layout` prop
const radial: GraphLayoutFunction = (shownNodes, shownEdges) => layoutRadialGraph(shownNodes, shownEdges, { roots: ['hub'] })
// <NetworkGraph :nodes="nodes" :edges="edges" :layout="radial" />
```

**Examples:** [Linked views](/examples/linked-views/) and the [example index](/examples/). **Guide:** [Graph integration](../guides/graph.md), including [ELK.js](../guides/graph.md#use-elk-js-for-layout). **Types:** [`GraphLayout`](../reference/core/interfaces/GraphLayout.md), [`layoutLayeredGraph`](../reference/core/functions/layoutLayeredGraph.md), [`routeGraphEdges`](../reference/core/functions/routeGraphEdges.md). The overview table of every core export is on [Core entry point](./index.md#core-entry-point).

<!--@include: ../../../docs/api.md#graph-layout-->

<!--@include: ../../../docs/api.md#viewport-helpers-->

<!--@include: ../../../docs/api.md#async-layouts-->
