---
title: NetworkGraph
description: Props, events, slots and exposed methods of the NetworkGraph component.
---

# NetworkGraph {#top}

`NetworkGraph` draws nodes and edges as an interactive SVG graph: a layered layout by default, other layouts through the `layout` prop, groups, swimlanes, ports, a minimap, search highlighting and export to SVG and PNG. Use it for process flows, dependency networks, PERT diagrams, lot genealogy or any diagram the user explores or edits.

It is controlled. Node moves, connections, deletions and label edits are emitted as proposals (`node-move`, `connect`, `reconnect`, …) that your code applies, and `validateConnection` can reject a connection synchronously. Positions you keep in your state override the layout.

## Minimal example

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { NetworkGraph, type GraphEdge, type NetworkNode } from '@eightkk/vue-weave'
import '@eightkk/vue-weave/style.css'

const selected = ref('design')
const nodes: NetworkNode[] = [
  { id: 'design', label: 'Design' },
  { id: 'build', label: 'Build' },
  { id: 'release', label: 'Release' },
]
const edges: GraphEdge[] = [
  { id: 'db', from: 'design', to: 'build' },
  { id: 'br', from: 'build', to: 'release', label: 'Approved' },
]
</script>

<template>
  <NetworkGraph v-model:selected-id="selected" :nodes="nodes" :edges="edges" :options="{ direction: 'LR' }" />
</template>
```

**Examples:** [Linked views](/examples/linked-views/), [Bill of materials](/showcase/bom/) and the [example index](/examples/). **Guide:** [Graph integration](../guides/graph.md). **Types:** [`NetworkNode`](../reference/core/interfaces/NetworkNode.md), [`GraphEdge`](../reference/core/interfaces/GraphEdge.md), [`NetworkGraphExposed`](../reference/vue-weave/type-aliases/NetworkGraphExposed.md). The layout functions behind the component are on [Graph layout and routing](../core/graph-layout.md).

<!--@include: ../../../docs/api.md#network-graph-->
