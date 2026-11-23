---
title: API reference
description: Every component, composable and core function of Vue Weave, how the two entry points are split, and the compatibility promise.
---

# API reference

Vue Weave has two entry points. `@eightkk/vue-weave` is the Vue entry: the components, the composables and, re-exported, all of the core. `@eightkk/vue-weave/core` is the headless core: pure TypeScript that runs without Vue, the DOM or browser globals, in Node.js 22.18+, Workers and servers. The stylesheet is `@eightkk/vue-weave/style.css`.

```ts
// In a Vue application
import { GanttChart, NetworkGraph, useEditHistory, scheduleTasks } from '@eightkk/vue-weave'
import '@eightkk/vue-weave/style.css'

// On a server or in a Worker: no Vue needed
import { scheduleTasks, layoutLayeredGraph, toMsProjectXml } from '@eightkk/vue-weave/core'
```

The pages below show the hand-written reference from the repository's `docs/` folder, which also ships in the npm package. The [type reference](./reference/) is generated from the TypeScript declarations and lists every exported function, interface and type.

## Map of the API

### Components (`@eightkk/vue-weave`)

All components are controlled: they never change their props, and a user edit is emitted as a proposal that your code applies.

| Component | What it is |
| --- | --- |
| [NetworkGraph](./components/network-graph.md) | Interactive network graph: layouts, editing, groups, swimlanes, minimap, export |
| [GanttChart](./components/gantt-chart.md) | Controlled Gantt chart and timeline: dependencies, baselines, columns, spreadsheet editing, load histogram |
| [TreeGrid](./components/tree-grid.md) | Tree grid and matrix with two-dimensional virtualization and cell, sheet and row editing |
| [TaskBoard](./components/task-board.md) | Kanban board with columns, swimlanes and WIP limits |
| [EventCalendar](./components/event-calendar.md) | Day, week and month calendar with resources and recurring events |
| [GraphPalette and PropertyInspector](./components/diagram-editor.md) | Shape palette and property form for a diagram editor around NetworkGraph |

### Composables (`@eightkk/vue-weave`)

[`useLinkedSelection`, `useEditHistory`, `useEditTransaction`, `useTimelineView`, `useWindowedData` and `useAsyncGraphLayout`](./composables.md) wire core state to Vue: linked selection across views, undo and redo, saving through a server, searched and sorted timeline views, partial loading and layouts in a Worker.

### Core (`@eightkk/vue-weave/core`)

| Area | Main exports |
| --- | --- |
| [Core entry point](./core/) | The table of every core export |
| [Graph layout and routing](./core/graph-layout.md) | `layoutLayeredGraph`, extra layouts, ports, `routeGraphEdges`, incremental placement, quantity flows, viewport helpers |
| [Graph algorithms and traversal](./core/graph-algorithms.md) | `topologicalOrder`, `shortestGraphPath`, centrality, communities, `traverseGraph` |
| [Timeline and scales](./core/timeline.md) | `createTimeScale`, `editTimeRange`, row trees, typed fields and timeline views |
| [Scheduling and resources](./core/scheduling.md) | `scheduleTasks`, `levelResources`, `calculateResourceLoad`, actuals, earned value, diagnostics, plan comparison |
| [Linked views and data](./core/linked-data.md) | View bindings, time range exploration, `diffStructure`, windowed data, graph expansion, time buckets |
| [Interchange and export](./core/interchange.md) | MS Project, iCalendar, CSV, Mermaid, GraphML, draw.io, snapshots, SVG export |

### Cross-cutting topics

- [Errors and validation](./errors.md): the shared ID rule, error classes and message formats.
- [Theming and CSS variables](./theming.md): `--vw-*` custom properties, the dark theme, class names, custom content and right-to-left layout.
- Guides: [Setup and Nuxt](./guides/setup.md), [Graph integration](./guides/graph.md), [Data, saving and linked views](./guides/data.md), [Scheduling](./guides/scheduling.md), [Resources and plan analysis](./guides/resources.md) and [Architecture and scope](./guides/architecture.md).

## Entry points

<!--@include: ../../docs/api.md#intro-->

<!--@include: ../../docs/api.md#compatibility-->

<!--@include: ../../docs/api.md#typed-data-->
