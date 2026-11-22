# Vue Weave

[![CI](https://github.com/EightKK/vue-weave/actions/workflows/ci.yml/badge.svg)](https://github.com/EightKK/vue-weave/actions/workflows/ci.yml) [![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/EightKK/vue-weave/blob/v1.2.0/LICENSE)

[日本語](https://github.com/EightKK/vue-weave/blob/v1.2.0/README.ja.md)

[Interactive demo](https://eightkk.github.io/vue-weave/) · [Source](https://github.com/EightKK/vue-weave) · [Issues](https://github.com/EightKK/vue-weave/issues) · [Releases](https://github.com/EightKK/vue-weave/releases)

Interactive network graphs and Gantt charts for Vue 3. Build relationship explorers, process flows, BPMN diagrams, production views, project schedules and resource timelines from two typed components, add a kanban board, an event calendar or diagram editor parts when you need them, and do the graph, scheduling, resource-load and earned value calculations in a headless core that also runs in Node.js, workers and on servers.

- **Controlled components.** `NetworkGraph`, `GanttChart` and the opt-in `TaskBoard`, `EventCalendar`, `GraphPalette` and `PropertyInspector` never change your data. A user edit becomes a proposal event, and your code decides whether to apply it.
- **Planning built in.** Calendars, dependencies, critical path, resource load and leveling, recorded actuals, earned value and plan scenario comparison, with an explanation of every date.
- **Opt-in features.** The defaults stay simple; everything else is a prop. No runtime dependencies besides Vue, server-side rendering, SVG and PNG export, Microsoft Project, iCalendar, CSV, Mermaid, GraphML and draw.io interchange, a dark theme and right-to-left layouts.

## Install

```sh
npm install @eightkk/vue-weave
```

Vue `^3.5.0` is a peer dependency. npm 7 and later install it together with the package when your application does not have it yet. The package ships ES modules, TypeScript declarations and one stylesheet.

Import the stylesheet once, for example in your application's entry file:

```ts
import '@eightkk/vue-weave/style.css'
```

Vite handles this import as it is. If your `tsconfig.json` enables `noUncheckedSideEffectImports`, or your build has no CSS loader, see [The stylesheet and TypeScript](https://github.com/EightKK/vue-weave/blob/v1.2.0/docs/integration.md#the-stylesheet-and-typescript).

**Core only (servers and Workers).** `@eightkk/vue-weave/core` runs without Vue at runtime, in Node.js 22.18+, Workers and on servers. Vue is still a required peer dependency (an optional peer is not configured), so `npm install @eightkk/vue-weave` installs Vue as well. To leave it out of a core-only deployment, install with `--omit=peer`. See [Core only: servers and Workers](https://github.com/EightKK/vue-weave/blob/v1.2.0/docs/integration.md#core-only-servers-and-workers).

**Offline install.** Each [GitHub Release](https://github.com/EightKK/vue-weave/releases) also has the package tarball, the same file that is published to npm. Download `eightkk-vue-weave-1.2.0.tgz` and install it from your application's directory, replacing the example path with the actual one:

```sh
npm install ./eightkk-vue-weave-1.2.0.tgz
```

You can also [build a local package](https://github.com/EightKK/vue-weave/blob/v1.2.0/CONTRIBUTING.md#build-a-local-package) from a checkout.

## Quick start

### A network graph

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { NetworkGraph, type NetworkNode, type GraphEdge } from '@eightkk/vue-weave'
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
  <NetworkGraph
    v-model:selected-id="selected"
    :nodes="nodes"
    :edges="edges"
    :options="{ direction: 'LR' }"
  />
</template>
```

Other features are enabled the same way, through props and `options`. For example, this graph flows right to left, reduces edge crossings, highlights search matches and skips drawing off-screen nodes:

```vue
<NetworkGraph
  ref="graph"
  :nodes="nodes"
  :edges="edges"
  :options="{ direction: 'RL', crossingReduction: 'barycenter' }"
  :match-ids="matches"
  cull-offscreen
/>
```

### A controlled Gantt chart

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { GanttChart, type TimelineBar, type TimelineEdit } from '@eightkk/vue-weave'
import '@eightkk/vue-weave/style.css'

const start = Date.parse('2026-11-09T08:00:00Z')
const hour = 3_600_000
const range = { start, end: start + 8 * hour }
const rows = [{ id: 'team', label: 'Engineering' }]
const bars = ref<TimelineBar[]>([
  {
    id: 'build', rowId: 'team', label: 'Build',
    start: start + hour, end: start + 3 * hour,
    editable: true, progress: 0.4,
  },
])

function commit(change: TimelineEdit) {
  bars.value = bars.value.map(bar =>
    bar.id === change.id ? { ...bar, ...change.after } : bar,
  )
}
</script>

<template>
  <GanttChart :rows="rows" :bars="bars" :range="range" @edit="commit" />
</template>
```

The component previews pointer edits, then emits a proposal. The parent commits it by replacing the affected interval. This supports application-specific validation, API persistence and asynchronous approval. A synchronous `validateEdit` hook can reject a proposal before the event is emitted. Intervals are half-open `[start, end)`, and a zero-duration bar is a milestone.

### Linked views

A minimal link between a graph and a Gantt chart: activating an item in either view selects it there and highlights its counterpart in the other.

```vue
<script setup lang="ts">
import { NetworkGraph, GanttChart, useLinkedSelection, type ViewBinding, type ViewTargetEvent } from '@eightkk/vue-weave'

// nodes, edges, rows, bars and range as in the examples above; node and bar IDs are task IDs here.
const bindings: ViewBinding[] = bars.value.flatMap(bar => [
  { entity: { kind: 'task', id: bar.id }, target: { view: 'graph', kind: 'node', id: bar.id } },
  { entity: { kind: 'task', id: bar.id }, target: { view: 'timeline', kind: 'bar', id: bar.id } },
])
const linked = useLinkedSelection({ bindings })
const activate = (event: ViewTargetEvent) => linked.select(event.target.view, [event.target])
</script>

<template>
  <NetworkGraph :nodes="nodes" :edges="edges" :selected-ids="linked.graph.value.selectedNodeIds"
    :highlighted-node-ids="linked.graph.value.highlightedNodeIds" @target-activate="activate" />
  <GanttChart :rows="rows" :bars="bars" :range="range" :selected-ids="linked.timeline.value.selectedBarIds"
    :highlighted-bar-ids="linked.timeline.value.highlightedBarIds" @target-activate="activate" />
</template>
```

See [Linking views](https://github.com/EightKK/vue-weave/blob/v1.2.0/docs/integration.md#linking-views) for hover, load rows and moving to collapsed items, and [Saving through a server](https://github.com/EightKK/vue-weave/blob/v1.2.0/docs/integration.md#saving-through-a-server) for `useEditTransaction`.

## Gallery

All screenshots are from the [demo app](#run-the-demo) in this repository.

### Design gallery

Showcases that combine several features and restyle the components with slots, `--vw-*` variables and `vw-` classes only. Open them from **Design gallery** in the [demo](https://eightkk.github.io/vue-weave/).

<table>
  <tr>
    <td width="50%" valign="top">
      <img src="https://raw.githubusercontent.com/EightKK/vue-weave/main/.github/images/showcase-pipeline.png" alt="CI/CD pipeline showcase: a dark run monitor with a 16-job graph (checkout, install, lint, typecheck, unit tests on three Node versions, build, three end-to-end shards, a security scan, staging, an approval gate, canary and production) above a timeline of each job's run, with KPI tiles for elapsed time, passed, running and failed jobs and the critical path" width="100%"><br>
      <b>CI/CD pipeline.</b> A live job graph and run timeline on one simulated clock, with failure injection, retry, an approval gate and linked selection (<code>useLinkedSelection</code>, <code>topologicalOrder</code>).
    </td>
    <td width="50%" valign="top">
      <img src="https://raw.githubusercontent.com/EightKK/vue-weave/main/.github/images/showcase-knowledge-graph.png" alt="Knowledge graph showcase: 164 computer-science topics on a dark canvas, coloured by community and sized by PageRank, with the shortest path from RSA to Diffusion models highlighted as a dashed line and a ranked list of the most central topics" width="100%"><br>
      <b>Knowledge graph.</b> Force layout, PageRank sizes, community colours, search, neighbourhood focus and shortest paths (<code>layoutForceGraph</code>, <code>detectGraphCommunities</code>, <code>shortestGraphPath</code>).
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <img src="https://raw.githubusercontent.com/EightKK/vue-weave/main/.github/images/showcase-construction.png" alt="Construction program showcase: the master schedule of a nine-storey office tower with KPI tiles for forecast handover, SPI, CPI, EAC and percent complete, and a Gantt chart with work breakdown, critical path in orange, float lines, baseline strips and a status date line" width="100%"><br>
      <b>Construction program.</b> A scheduled master programme with critical path, baselines, crew leveling, earned value and a what-if delay (<code>scheduleTasks</code>, <code>levelResources</code>, <code>computeEarnedValue</code>).
    </td>
    <td width="50%" valign="top">
      <img src="https://raw.githubusercontent.com/EightKK/vue-weave/main/.github/images/showcase-service-map.png" alt="Service map showcase: 22 services in nested region and namespace groups with health rings, sparklines and traffic bands; a payments database incident marks Payments critical and five upstream services degraded, above an incident timeline and a needs-attention list" width="100%"><br>
      <b>Service map.</b> Nested collapsible groups, traffic-weighted edges, an incident blast radius from <code>traverseGraph</code> and a linked alert timeline.
    </td>
  </tr>
</table>

![NetworkGraph in the manufacturing demo: material, a split operation, two lots, a finishing operation and the product in a layered left-to-right layout](https://raw.githubusercontent.com/EightKK/vue-weave/v1.2.0/.github/images/network-graph.png)

![GanttChart in the scheduling demo: a calendar-aware schedule with a status date and progress line, critical-path outlines, float lines, split bars, a lead label, a deadline flag, Finish and Float columns, and a shaded plant closure day](https://raw.githubusercontent.com/EightKK/vue-weave/v1.2.0/.github/images/gantt-chart.png)

<table>
  <tr>
    <td width="50%" valign="top">
      <img src="https://raw.githubusercontent.com/EightKK/vue-weave/v1.2.0/.github/images/process-lanes.png" alt="Process lanes demo: a machining process in four department lanes (Purchasing, Machining, Inspection and an empty Shipping lane), with orthogonal hand-over edges crossing the lane boundaries and the lanes repeated in the minimap" width="100%"><br>
      <b>Swimlanes.</b> One lane per department or work centre, in your order (<code>layoutSwimlaneGraph</code>, <code>lanes</code>).
    </td>
    <td width="50%" valign="top">
      <img src="https://raw.githubusercontent.com/EightKK/vue-weave/v1.2.0/.github/images/quantity-flow.png" alt="Quantity flow demo: a Sankey diagram of a lot of 100 pieces that splits 60/40 between two lines, merges at inspection, loses 4 pieces on line B and loops 10 pieces through rework as a dashed band, with a table of inflow, outflow and difference per step" width="100%"><br>
      <b>Quantity flows.</b> Edges drawn as bands as wide as their quantity, on one scale (<code>layoutFlowGraph</code>, <code>edgeBands</code>).
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <img src="https://raw.githubusercontent.com/EightKK/vue-weave/v1.2.0/.github/images/linked-views.png" alt="Linked views demo: Cut order A is selected in the Gantt chart, and the same task is highlighted in the network graph above and in the CNC cell load row below, where a red segment marks an overload" width="100%"><br>
      <b>Linked views.</b> Select in one view and the graph, Gantt chart and load rows highlight the same task (<code>useLinkedSelection</code>).
    </td>
    <td width="50%" valign="top">
      <img src="https://raw.githubusercontent.com/EightKK/vue-weave/v1.2.0/.github/images/plan-comparison.png" alt="Plan scenarios demo: a candidate plan that pushes the cutting work after a maintenance window, compared with the current plan in a table of final completion, deadline misses, changed assignments and CNC cell overload, and a Gantt chart that shows the current plan as a strip below each candidate bar" width="100%"><br>
      <b>Plan scenarios.</b> Compare a candidate plan with the current one before adopting it (<code>comparePlans</code>).
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <img src="https://raw.githubusercontent.com/EightKK/vue-weave/v1.2.0/.github/images/diagram-styles-dark.png" alt="Diagram styles demo in the dark theme: an order fulfilment flow with ellipse, diamond and hexagon nodes, dashed animated main-path edges, open-arrow and circle edge markers, and a pair of parallel edges spread apart" width="100%"><br>
      <b>Diagram styles and dark theme.</b> Node shapes, edge markers, animated and parallel edges, and the built-in dark theme.
    </td>
    <td width="50%" valign="top">
      <b>More in the demo:</b> project delivery, a 1,000-row timeline, a large graph, timeline editing, an asynchronous layout, graph analysis, resource planning with unplanned tasks, saved editing against a simulated server, a large plan loaded window by window, diagram import and export, an event calendar, a diagram editor, a task board, earned value, a BPMN process, and a design gallery that restyles the components as a workflow builder, a database schema, an org chart, a roadmap, a sprint plan, room bookings, calendar views, a CI/CD pipeline, a knowledge graph, a construction program and a service map.
    </td>
  </tr>
</table>

## Features

Everything beyond the basics is opt-in. This is an overview; the full list of props, events, slots and functions is in [docs/api.md](https://github.com/EightKK/vue-weave/blob/v1.2.0/docs/api.md), with guides in [docs/integration.md](https://github.com/EightKK/vue-weave/blob/v1.2.0/docs/integration.md) and [docs/scheduling.md](https://github.com/EightKK/vue-weave/blob/v1.2.0/docs/scheduling.md).

### NetworkGraph

- **Layouts:** a built-in layered layout (`LR`, `TB`, `RL` or `BT`, with `crossingReduction: 'barycenter'`) that handles branches, merges, cycles and self-loops. Through the `layout` prop: tree, radial, circular, grid, concentric and deterministic force layouts (`layoutTreeGraph`, `layoutRadialGraph`, `layoutCircularGraph`, `layoutGridGraph`, `layoutConcentricGraph`, `layoutForceGraph`), or [ELK.js](https://github.com/EightKK/vue-weave/blob/v1.2.0/docs/integration.md#use-elkjs-for-layout) installed by your application.
- **Process lanes:** `layoutSwimlaneGraph` gives each department or work centre a lane in your order; the `lanes` prop draws the bands, also in the minimap and exports, and `graphSwimlaneAt` finds the lane a node was dragged to. See [Swimlanes for process flows](https://github.com/EightKK/vue-weave/blob/v1.2.0/docs/integration.md#swimlanes-for-process-flows).
- **BPMN processes and flowcharts:** circle, stadium, parallelogram, document, cylinder and data-object nodes, BPMN event borders, gateway, event and task-type markers, labels below small shapes, dashed message flows, and pools around swimlanes (`pools`), also in exports. See [BPMN processes and flowcharts](https://github.com/EightKK/vue-weave/blob/v1.2.0/docs/integration.md#bpmn-processes-and-flowcharts).
- **Quantity flows (Sankey diagrams):** `layoutFlowGraph` sizes each edge by its quantity on one scale, reports inflow, outflow and their difference per node as given, never adds different units, and draws rework loops as dashed reference bands; the `edgeBands` prop renders them with names such as "Cut → Inspect: 60 pcs". See [Quantity flows](https://github.com/EightKK/vue-weave/blob/v1.2.0/docs/integration.md#quantity-flows-sankey-diagrams).
- **Drawing:** `node`, `edge`, `group` and `minimap-node` slots for your own SVG, `tooltip`, `node-toolbar` and `edge-toolbar` slots for HTML; diamond, ellipse and hexagon nodes; orthogonal or straight edges (`edgeStyle`), routes around nodes (`avoidNodes`), edge labels placed clear of nodes and each other (`edgeLabelPlacement`), waypoints, end markers, animated edges and spread parallel edges.
- **Editing as proposals:** node moves, connections checked against typed port rules (`connectionRules`) with valid-target hints, inline label editing, box or lasso selection, nested and collapsible groups, node resizing, snap to grid with alignment guides, palette drops, clipboard, and keyboard deletion.
- **Navigation:** minimap, viewport culling and level of detail for large graphs, pinch zoom, search highlighting (`matchIds`), `focusNode(id)` and `fit({ ids })`.
- **Diagram editor parts:** `GraphPalette` lists node templates to drag onto the graph or insert from the keyboard, and `PropertyInspector` edits the selected node through typed fields, plus resource assignment and dependency tables; both emit proposals. See [Diagram editor parts](https://github.com/EightKK/vue-weave/blob/v1.2.0/docs/integration.md#diagram-editor-parts).

### GanttChart

- **Display:** multiple lanes, progress, milestones and FS/SS/FF/SF dependencies with lag labels; row groups with summary rollups and optional summary dependencies; up to three named baseline sets with variance; header bands, date markers and highlighted ranges (`markerRanges`); a status-date line and progress line; non-working time shading; critical outlines, float lines, deadlines and split bars; a resource load histogram (`loadRows`) that accepts `calculateResourceLoad` output.
- **Editing as proposals:** drag and keyboard moves and resizes, auto-scheduling previews of the bars a move would push (`cascade`), dependency creation and reconnection, multiple selection and batch moves, drag to create, progress sliders, deletion, row hierarchy moves, column resizing, scheduling constraint handles, typed cell editors (`field-edit`), and drops from your own lists (`bar-drop`).
- **Spreadsheet editing (`spreadsheet`):** select cell ranges, copy, cut and paste with Excel or Google Sheets, clear, fill down with Ctrl/Cmd+D or the corner handle, and type to edit; each operation is one `sheet-edit` proposal that `validateSheetEdit` can reject as a whole and `applyTimelineSheetEdit` applies. The demo homepage has a schedule sheet whose bars, arrows and critical path the scheduler derives from the grid, and a purchase approval workflow editor.
- **Time scales:** zoom presets, ready calendar presets in an IANA time zone and locale (`calendarZoomPresets`, `intlTimeFormatter`), a scale that compresses non-working time (`createWorkingTimeScale`), Ctrl+wheel and pinch zoom, a now marker and `fitToBars()`.
- **Scale:** row and time-window virtualization, and `visible-window-change` to load only the visible weeks and rows.

### TaskBoard

- **Kanban board:** an opt-in controlled component. Cards sit in status columns, optionally split into swimlanes; columns show their card count and warn when they are over a WIP limit or under a WIP minimum; columns and lanes can collapse and a `filter` hides cards. Pointer and touch drags (with a drop indicator and auto-scroll) and the keyboard (Space, arrows, Enter, Escape, with live announcements) propose `card-move`, which `validateCardMove` can reject and `applyBoardCardMove` applies. Use the same tasks and selection as a GanttChart. See [TaskBoard](https://github.com/EightKK/vue-weave/blob/v1.2.0/docs/api.md#taskboard).

### EventCalendar

- **Views:** an opt-in controlled component with day, week and month views of appointments in an IANA time zone and locale, an all-day row for multi-day events, a "+N more" overflow in the month grid, a now line and a built-in toolbar (or your own through a slot). With `resources`, the day view shows one column per room, machine or person.
- **Editing as proposals:** drag and keyboard moves and resizes, moves between resources and drag to create (`creatable`), checked by synchronous `validateEdit` and `validateCreate`. `range-change` reports the visible range for loading, and the core helpers (`eventCalendarRange`, `layoutCalendarDayEvents`, `packCalendarEventLanes`) run on servers too.
- **Recurring events:** opt-in RFC 5545 rules (`expandRecurringEvents`, with RRULE, EXDATE, RDATE and overrides, in an IANA time zone across daylight-saving changes), edits of one occurrence, the following ones or the whole series (`applyRecurringEdit`), and iCalendar import and export of recurring series. See [EventCalendar](https://github.com/EightKK/vue-weave/blob/v1.2.0/docs/api.md#eventcalendar).

### Headless core (`@eightkk/vue-weave/core`)

- **Graph algorithms and metrics:** `topologicalOrder`, `findGraphCycles`, `shortestGraphPath`, `searchGraphNodes`, `filterGraph`, connected components, degree, betweenness and PageRank centrality, and Louvain communities (`detectGraphCommunities`) that `graphCommunityGroups` turns into groups.
- **Scheduling:** `scheduleTasks` on calendars from `buildWorkPeriods`, including IANA time zones, as-late-as-possible, manual, inactive and summary tasks, constraints, pauses and cycle and infeasibility diagnostics. `scheduleTasks(input, { explain: true })` traces why each task starts when it does, and `toPlanningDiagnostics` lists the problems.
- **Resources:** `calculateResourceLoad` and `levelResources`, with capacity that changes over time (`capacityPeriods`) and assignments that cover only part of a task (`workOffset`, `workDuration`); `projectResourceTimeline` shows a plan by resource, and `buildPlacementInput` keeps unplanned tasks out of the calculation.
- **Plan updates:** `propagateEdit`, `rescheduleFromStatusDate`, `rescheduleFromActuals` (keeps recorded actuals and forecasts the rest), and `comparePlans`, which separates what you changed from what moved as a result. See [Compare plan scenarios](https://github.com/EightKK/vue-weave/blob/v1.2.0/docs/scheduling.md#compare-plan-scenarios).
- **Earned value:** `computeEarnedValue` calculates PV, EV and AC at a status date with SV, CV, SPI, CPI, EAC, ETC, VAC and TCPI per task and in total, accrues planned value on a work calendar, and returns a cumulative series for an S-curve; `rollupEarnedValue` sums summary rows. See [Earned value management](https://github.com/EightKK/vue-weave/blob/v1.2.0/docs/scheduling.md#earned-value-management).
- **Interchange:** Microsoft Project XML (including calendars, resources and assignments), iCalendar and CSV import and export (`fromMsProjectXml`, `toMsProjectXml`, `fromICalendar`, `toICalendar`, `parseCsv`, `toCsv`), and `scheduleToGraph` for a PERT network diagram.
- **Diagram files:** Mermaid flowcharts, GraphML (including yEd) and draw.io import and export for NetworkGraph diagrams, with nested groups, shapes, positions and sizes (`fromMermaid`, `toMermaid`, `fromGraphMl`, `toGraphMl`, `fromDrawio`, `fromDrawioAsync` for compressed files, `toDrawio`). See [Diagram files](https://github.com/EightKK/vue-weave/blob/v1.2.0/docs/integration.md#diagram-files-mermaid-graphml-and-drawio).

### Linked views, large data and saving

- **Linked views:** `useLinkedSelection` links a graph, a Gantt chart and load rows through entity bindings; `revealNode`, `revealBar` and `revealLinkedTarget` move to an item, also inside collapsed groups and rows; `timelineBarsInRange` and `resolveTimeRangeTargets` highlight what was worked on in a time range. See [Linking views](https://github.com/EightKK/vue-weave/blob/v1.2.0/docs/integration.md#linking-views).
- **Large data:** `useWindowedData` fetches only the visible window through your `load` function, with aborts, deduplication and retry; graph expansion helpers and `layoutGraphIncrementally` load a graph one hop at a time without moving the nodes on display; `useAsyncGraphLayout` runs a layout in a Worker, and `routingPolicy="preserve"` keeps the engine's routes. See [Loading only what is visible](https://github.com/EightKK/vue-weave/blob/v1.2.0/docs/integration.md#loading-only-what-is-visible).
- **Views and saving:** `useTimelineView` for searched, sorted and filtered rows (opt-in GanttChart header sort buttons and column filters propose the changes), `useEditHistory` for undo and redo, `useEditTransaction` to save through your server adapter with conflict handling, and `serializeWeaveSnapshot` and `restoreWeaveSnapshot` for versioned, validated JSON.

### Export, themes and accessibility

- `exportSvg(options)` and `exportPng(options)` on `NetworkGraph` and `GanttChart`, and `renderGraphSvg` and `renderTimelineSvg` for SVG on a server.
- A built-in dark theme (`vw-theme-dark`) and `vw-theme-auto`, which follows `prefers-color-scheme`; theming through `--vw-*` CSS variables; forced colors, reduced motion and print styles.
- Right-to-left layouts with `dir="rtl"` (or `auto`).
- Keyboard operation and ARIA names are built in; see [Status and support](#status-and-support) for what has been tested.

```ts
const svg = chart.value!.exportSvg({ title: 'Plan' })
const png = await chart.value!.exportPng({ scale: 2 })
```

## Status and support

- **Stable since 1.0.** Releases follow [Semantic Versioning](https://semver.org/): breaking changes are made only in major releases and are listed under "Breaking changes" in the [changelog](https://github.com/EightKK/vue-weave/blob/v1.2.0/CHANGELOG.md). [Compatibility and versioning](https://github.com/EightKK/vue-weave/blob/v1.2.0/docs/api.md#compatibility-and-versioning) lists what that covers (exported names and types, props, events, slots, documented `--vw-*` properties and the snapshot format) and what it does not (the exact text of error messages, the emitted `vw-` classes, DOM structure and server-rendered markup).
- **Vue:** 3.5 or later in 3.x (peer dependency `^3.5.0`).
- **Modules and TypeScript:** ESM only. Declarations support `Bundler` and `NodeNext` resolution. Item `data` can be typed (`NetworkNode<MyData>`, `TimelineBar<MyData>`), and that type reaches slot props and callbacks without casts.
- **Node.js:** 22.18 or later for the headless `@eightkk/vue-weave/core` entry, server-side rendering and development.
- **Browsers:** current evergreen browsers (Chrome, Edge, Firefox and Safari). Automated browser tests run in Chromium only, so the other browsers are not covered by CI.
- **Accessibility:** keyboard operation and ARIA names are included. Dedicated screen-reader testing has not been done yet (see [Architecture, performance and scope](https://github.com/EightKK/vue-weave/blob/v1.2.0/docs/architecture.md)), so do not assume full conformance.

## Run the demo

The demo is hosted on [GitHub Pages](https://eightkk.github.io/vue-weave/) and is rebuilt from `main`, so it can be ahead of the latest release. To run it locally, use Node.js 22.18+ and npm. From a source checkout or GitHub source ZIP, run:

```sh
npm ci
npm run build:demo
npm start
```

The homepage opens the production planning, lot flow, schedule sheet and approval workflow demos in English (add `?lang=ja` to the URL, or use the language buttons, for Japanese). Use **Examples** to open the example gallery.

The example gallery has one page per example (listed under [Gallery](#gallery)), export buttons, a theme switch, and **Undo** and **Redo** for accepted edits. Toggles such as **Edit graph** and **Planning overlays** turn on the opt-in features described above. The **Design gallery** row restyles the components using only slots, `--vw-*` variables and `vw-` classes. Edits remain in the demo's local state. The backlog, inspector, diagnostics list and toolbar of the demo are examples in `examples/components/`, not part of the package.

On Windows you can double-click `Start.cmd` instead. It serves `preview/` when it was built from the current sources, and otherwise builds it first, running `npm ci` beforehand if the installed dependencies do not match `package-lock.json`. `npm start` serves `preview/` as it is.

If you have a prebuilt demo archive containing `preview/` (it may be attached to a release), extract it completely and run `npm start`, or double-click `Start.cmd` on Windows. The prebuilt demo needs Node.js but does not require dependency installation. If you change its sources, `Start.cmd` rebuilds it, which needs npm and an internet connection the first time.

For development and verification commands, see [Contributing](https://github.com/EightKK/vue-weave/blob/v1.2.0/CONTRIBUTING.md).

## Documentation

- [Public API and input contracts](https://github.com/EightKK/vue-weave/blob/v1.2.0/docs/api.md)
- [Vue, Nuxt, custom rendering, time scales and persistence](https://github.com/EightKK/vue-weave/blob/v1.2.0/docs/integration.md)
- [Architecture, performance and scope](https://github.com/EightKK/vue-weave/blob/v1.2.0/docs/architecture.md)
- [Scheduling and resource load](https://github.com/EightKK/vue-weave/blob/v1.2.0/docs/scheduling.md)
- [Contributing and release process](https://github.com/EightKK/vue-weave/blob/v1.2.0/CONTRIBUTING.md)
- [Security and private vulnerability reporting](https://github.com/EightKK/vue-weave/blob/v1.2.0/docs/security.md)
- [Code of conduct](https://github.com/EightKK/vue-weave/blob/v1.2.0/docs/code-of-conduct.md)
- [Changelog](https://github.com/EightKK/vue-weave/blob/v1.2.0/CHANGELOG.md)

## License

MIT. See [LICENSE](https://github.com/EightKK/vue-weave/blob/v1.2.0/LICENSE). Third-party notices for the prebuilt demo are in [THIRD_PARTY_NOTICES.md](https://github.com/EightKK/vue-weave/blob/v1.2.0/THIRD_PARTY_NOTICES.md) and [Third-party licenses](https://github.com/EightKK/vue-weave/blob/v1.2.0/docs/third-party-licenses.md).
