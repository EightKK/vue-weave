# Vue Weave

[![CI](https://github.com/EightKK/vue-weave/actions/workflows/ci.yml/badge.svg)](https://github.com/EightKK/vue-weave/actions/workflows/ci.yml) [![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

[日本語](README.ja.md)

[Source](https://github.com/EightKK/vue-weave) · [Issues](https://github.com/EightKK/vue-weave/issues) · [Releases](https://github.com/EightKK/vue-weave/releases)

Interactive network graphs and Gantt charts for Vue 3. Build relationship explorers, production views, project schedules and resource timelines with typed components and framework-independent graph, scheduling and resource-load calculations.

![NetworkGraph in the manufacturing demo: material, a split operation, two lots, a finishing operation and the product in a layered left-to-right layout](.github/images/network-graph.png)

![GanttChart in the scheduling demo: a calendar-aware schedule with non-working time, critical-path outlines, float lines, split bars, a status-date line, a deadline flag and Finish and Float columns](.github/images/gantt-chart.png)

## Highlights

Everything beyond the basics is opt-in through props. Details are in [docs/api.md](docs/api.md), [docs/integration.md](docs/integration.md) and [docs/scheduling.md](docs/scheduling.md).

### NetworkGraph

- Built-in layout for branches, merges, disconnected nodes, directed cycles and self-loops, with `LR`, `TB`, `RL` or `BT` direction and `crossingReduction: 'barycenter'`.
- Your own placement and routing through a `layout` function, for example `layoutTreeGraph`, `layoutRadialGraph`, `layoutCircularGraph`, `layoutGridGraph`, `layoutConcentricGraph`, the deterministic `layoutForceGraph`, or ELK.js installed by your application (see [Use ELK.js for layout](docs/integration.md#use-elkjs-for-layout)).
- Custom SVG through the `node`, `edge`, `group` and `minimap-node` slots, plus `tooltip`, `node-toolbar` and `edge-toolbar` slots for HTML next to an item.
- Inline label editing of nodes and edges (`editableLabels`, proposed through `label-edit`) and lasso selection (`selectionMode: 'lasso'`).
- Node moves, connections, multiple selection and the minimap; edge selection (`edgesSelectable`), keyboard deletion proposals (`deletable`, applied with `removeGraphElements`) and context-menu requests (`contextMenu`).
- Nested groups (`parentId`), collapsing into proxy nodes (`collapsibleGroups`, `collapsedGroupIds`) and node resizing (`sizes`, `resizable`).
- Orthogonal or straight edges (`edgeStyle`, also per edge), waypoints (`GraphEdge.points`, edited with `editableEdges`), parallel edges spread apart (`parallelEdgeSpacing`), end markers (`markerStart`, `markerEnd`) and flowing edges (`animated`).
- Diamond, ellipse and hexagon nodes besides boxes (`NetworkNode.shape`), also in exports.
- Large graphs and touch: viewport culling (`cullOffscreen`), pinch zoom, and level of detail when zoomed out (`lodThreshold`).
- Search highlighting (`matchIds`, `dimmedIds`) and the `focusNode(id)` and `fit({ ids })` methods.
- Snap to grid (`snapGrid`) with a dotted or lined `background`, `alignmentGuides` and `autoPan`.
- Palette drops (`droppable`, the `node-drop` event, `toGraphPoint(x, y)` and `getViewportCenter()`).
- Copy, paste and duplicate proposals (`clipboard` with the `copy-selection`, `paste-request` and `duplicate-selection` events, applied with `cloneGraphElements`).

### GanttChart

- Multiple lanes, progress, milestones and FS/SS/FF/SF dependencies; row groups, baselines (up to three named baseline sets with variance), header bands and date markers; row and time-window virtualization.
- Presentation through `formatTime`, `labels`, slots and CSS variables, plus a hoverable `tooltip` slot, a `context-menu` event (`contextMenu`) and a `fitToBars()` method.
- Dependency creation and reconnection (`connectable`, `reconnectable`, `validateConnection`), and lag or lead labels on dependencies (`lag`, `formatLag`) that the scheduler applies too.
- Multiple selection with batch moves (`multiSelect`, `edits`) and row moves (`rowDraggable`).
- Drag to create bars (`creatable`, `create`), stacked without overlap by `assignLanes`.
- Auto-scheduling previews (`cascade`) that show the bars a move would push and propose them with it as one `edits` batch.
- Progress sliders (`progressEditable`, `progress-edit`) and bar deletion (`deletable`, `bars-delete`, accepted with `removeTimelineBars`).
- Row hierarchy editing by pointer or Alt+arrow keys (`rowsReorderable`, `row-move`, accepted with `moveTimelineRow`), with `timelineWbsCodes` for a WBS column.
- Column resizing by pointer or arrow keys (`columnsResizable`, `column-resize`, `labelWidth`).
- A resource load histogram under the task rows (`loadRows`, `loadSegments`), which accepts the output of `calculateResourceLoad`.
- Zoom presets (`zoomPresets`), a now marker (`showNow`), touch pinch zoom (`pinchZoom`) and Ctrl+wheel zoom around the pointer (`wheelZoom`).
- A status-date line (`statusDate`) and a progress line (`showProgressLine`) that shows which tasks are behind or ahead.
- Non-working time shading (`nonWorkingPeriods`), and critical outlines, float lines, deadline indicators and split bars through the optional bar fields `critical`, `latestEnd`, `deadline` and `segments`, described to screen readers without changing bar names. Your own text per bar, such as "Manually scheduled", joins that description and the tooltip through `TimelineBar.description`.
- Scheduling constraints (`TimelineBar.constraints`, named as in `ScheduleTask`) drawn as markers that show violations, with optional drag and keyboard handles (`constraintsEditable`, `constraint-edit`, accepted with `applyTimelineConstraintEdit`).

### Headless core (`vue-weave/core`)

- Graph analysis: `topologicalOrder`, `findGraphCycles`, `shortestGraphPath`, `searchGraphNodes` and `filterGraph`.
- Graph metrics: connected components (`graphComponents`), degree, betweenness and PageRank centrality, Louvain community detection (`detectGraphCommunities`) and `graphCommunityGroups`, which turns communities into `NetworkGraph` groups.
- Graph geometry: `collapseGraphGroups`, `routeGraphEdges` and `applyGraphSizes` compute the same shapes as the component props.
- Calendars and scheduling: `buildWorkPeriods`, `scheduleTasks` and `calculateResourceLoad`, with cycle and infeasibility diagnostics, as-late-as-possible tasks (`mode: 'alap'`), pauses, manually scheduled (`manual`) and inactive (`inactive`) tasks, and IANA time-zone calendars (`WorkWeek.timeZone`).
- Resource leveling with `levelResources`, and plan updates with `propagateEdit` (ready to return from `cascade`) and `rescheduleFromStatusDate`.
- Chart helpers: `scheduledBarFields`, `invertWorkPeriods` and `scheduleToGraph`, which turns a schedule into a PERT network diagram for `NetworkGraph`.
- Interchange: `toMsProjectXml`, `toICalendar` and `toCsv` export plans; `parseCsv` with `timelineFromCsvTable` imports a CSV file as rows and bars, and `fromMsProjectXml` with `timelineFromMsProject` imports a Microsoft Project XML file as rows, bars, baselines and dependencies.

### Planning, linking and saving

- Linked views: `useLinkedSelection` links a graph, a Gantt chart and load rows through entity bindings; the view the user acts in keeps the selection and the others get display-only highlights (`highlightedNodeIds`, `highlightedEdgeIds`, `highlightedBarIds`, `highlightedLoadTargets`). `target-enter`, `target-leave` and `target-activate` events report what the user points at, and `revealNode`, `revealBar` and `revealLinkedTarget` move to it, also out of collapsed groups and rows.
- Resource views: `projectResourceTimeline` shows a task once per assigned resource without counting its load twice, `resolveResourceTimelineEdit` turns a drag to another row into an assignment change, and `buildPlacementInput` keeps unplanned tasks out of the calculation. GanttChart accepts drops from your own lists (`droppable`, `bar-drop`).
- Explanations: `scheduleTasks(input, { explain: true })` and `levelResources` return a trace of why each task starts when it does; `toPlanningDiagnostics` lists cycles, infeasible tasks, overloads and unresolved leveling with their tasks and resources.
- Asynchronous layouts: `useAsyncGraphLayout` runs a layout in a Worker or any async engine and shows only complete, current frames; `routingPolicy="preserve"` keeps the engine's routes, port edges included.
- Typed cells, search and saved views: columns with a `field` propose typed values (`field-edit`, `cell-editor` slot), and `useTimelineView` searches and sorts a display copy of the rows.
- Saving: `useEditTransaction` saves one document at a time through your adapter and tells accepted, rejected, conflicting and unknown results apart, with undo and redo sent to the server; `serializeWeaveSnapshot` and `restoreWeaveSnapshot` store data and view settings as versioned, validated JSON.
- The backlog, inspector, diagnostics list and toolbar of the demo are examples in `examples/components/`, not part of the package.

### Export, themes, RTL

- `exportSvg(options)` and `exportPng(options)` on both components, and `renderGraphSvg` and `renderTimelineSvg` for server-side SVG.
- Built-in dark theme (`vw-theme-dark`) and `vw-theme-auto`, which follows `prefers-color-scheme`; forced colors, reduced motion and print styles.
- Right-to-left layouts with `dir="rtl"` (or `auto`).

## Status and support

- **Version 0.5.0.** While the version is 0.x, breaking changes can land in minor releases (0.x.0) and are listed under "Breaking changes" in the [changelog](CHANGELOG.md). Patch releases (0.x.y) contain only backwards-compatible fixes. Pin an exact version; installing a specific tarball does this for you.
- **Vue:** 3.5 or later (peer dependency).
- **Modules and TypeScript:** ESM only. Declarations support `Bundler` and `NodeNext` resolution. Item `data` can be typed (`NetworkNode<MyData>`, `TimelineBar<MyData>`), and that type reaches slot props and callbacks without casts.
- **Node.js:** 22.18 or later for the headless `vue-weave/core` entry, server-side rendering and development.
- **Browsers:** current evergreen browsers (Chrome, Edge, Firefox and Safari). Automated browser tests run in Chromium only, so the other browsers are not covered by CI.
- **Accessibility:** keyboard operation and ARIA names are included. Dedicated screen-reader testing has not been done yet (see [Architecture, performance and scope](docs/architecture.md)), so do not assume full conformance.

## Install

The package is not published to npm. Download the `vue-weave-0.5.0.tgz` tarball attached to a [GitHub Release](https://github.com/EightKK/vue-weave/releases), or [build a local package](CONTRIBUTING.md#build-a-local-package) from a checkout. Then install the tarball from your application's directory. Replace the example path with the actual tarball path.

```sh
npm install ./vue-weave-0.5.0.tgz
```

Vue 3.5+ is a peer dependency. The library ships ES modules, TypeScript declarations and one stylesheet. Import the stylesheet once in your application with `import 'vue-weave/style.css'`. The `vue-weave/core` entry runs without Vue and supports TypeScript `NodeNext` resolution.

## Quick start

### A network graph

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { NetworkGraph, type NetworkNode, type GraphEdge } from 'vue-weave'
import 'vue-weave/style.css'

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
import { GanttChart, type TimelineBar, type TimelineEdit } from 'vue-weave'
import 'vue-weave/style.css'

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
import { NetworkGraph, GanttChart, useLinkedSelection, type ViewBinding, type ViewTargetEvent } from 'vue-weave'

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

See [Linking views](docs/integration.md#linking-views) for hover, load rows and moving to collapsed items, and [Saving through a server](docs/integration.md#saving-through-a-server) for `useEditTransaction`.

## Export, direction and themes

Both components expose `exportSvg(options)` and `exportPng(options)` on their template ref, and `vue-weave/core` can build the same SVG on a server. Set `dir="rtl"` (or `auto`) for right-to-left layouts. Add `vw-theme-dark` to a component or an ancestor for the dark theme, or `vw-theme-auto` to follow `prefers-color-scheme`. See [integration](docs/integration.md).

```ts
const svg = chart.value!.exportSvg({ title: 'Plan' })
const png = await chart.value!.exportPng({ scale: 2 })
```

## Run the demo

There is no hosted demo. Run it locally with Node.js 22.18+ and npm. From a source checkout or GitHub source ZIP, run:

```sh
npm ci
npm run build:demo
npm start
```

The demo covers manufacturing, project delivery, a 1,000-row timeline, a large graph, timeline editing and scheduling, plus linked views, an asynchronous layout, diagram styles (node shapes, edge markers, animated and parallel edges), graph analysis (components, communities and centrality rankings), resource planning with unplanned tasks and saved editing against a simulated server, with export buttons, a theme switch, and **Undo** and **Redo** for accepted edits. Toggles such as **Edit graph**, **Planning overlays** and **Scheduling** turn on the opt-in features described above. The **Design gallery** row restyles the same two components as a workflow builder, a database schema diagram, an org chart, a product roadmap, a sprint plan and a room booking calendar, using only slots, `--vw-*` variables and `vw-` classes. Edits remain in the demo's local state.

On Windows you can double-click `Start.cmd` instead. It serves `preview/` when it was built from the current sources, and otherwise builds it first, running `npm ci` beforehand if the installed dependencies do not match `package-lock.json`. `npm start` serves `preview/` as it is.

If you have a prebuilt demo archive containing `preview/` (it may be attached to a release), extract it completely and run `npm start`, or double-click `Start.cmd` on Windows. The prebuilt demo needs Node.js but does not require dependency installation. If you change its sources, `Start.cmd` rebuilds it, which needs npm and an internet connection the first time.

For development and verification commands, see [Contributing](CONTRIBUTING.md).

## Documentation

- [Public API and input contracts](docs/api.md)
- [Vue, Nuxt, custom rendering, time scales and persistence](docs/integration.md)
- [Architecture, performance and scope](docs/architecture.md)
- [Scheduling and resource load](docs/scheduling.md)
- [Contributing and release process](CONTRIBUTING.md)
- [Security and private vulnerability reporting](docs/security.md)
- [Code of conduct](docs/code-of-conduct.md)
- [Changelog](CHANGELOG.md)

## License

MIT. See [LICENSE](LICENSE). Third-party notices for the prebuilt demo are in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and [Third-party licenses](docs/third-party-licenses.md).
