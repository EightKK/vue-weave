---
title: Core entry point
description: The headless core of Vue Weave, @eightkk/vue-weave/core, and the table of its exports.
---

# Core entry point {#top}

`@eightkk/vue-weave/core` is pure TypeScript: graph layout and routing, graph algorithms, time scales, scheduling and resource load, earned value, linked-view bindings, windowed data, interchange formats and SVG export. It does not import Vue, the DOM or browser globals, so it runs in Node.js 22.18+, Web Workers and serverless functions as well as in the browser. Every function returns new values and never changes its arguments. The Vue entry re-exports all of it.

Use it to calculate on a server (schedule a plan before sending it), in a Worker (lay out a large graph off the main thread), or in tests, and pass the results to the components as plain props.

## Minimal example

```ts
import { layoutLayeredGraph } from '@eightkk/vue-weave/core'

const layout = layoutLayeredGraph(
  [{ id: 'a', label: 'Cut' }, { id: 'b', label: 'Weld' }],
  [{ id: 'ab', from: 'a', to: 'b' }],
  { direction: 'LR' },
)
console.log(layout.boxes.get('b')) // { x, y, width, height }
```

The exports are grouped by area on the following pages: [Graph layout and routing](./graph-layout.md), [Graph algorithms and traversal](./graph-algorithms.md), [Timeline and scales](./timeline.md), [Scheduling and resources](./scheduling.md), [Linked views and data](./linked-data.md) and [Interchange and export](./interchange.md). The generated [type reference of the core](../reference/core/) lists every export with its signature.

<!--@include: ../../../docs/api.md#core-entry-->
