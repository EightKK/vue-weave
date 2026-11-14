# Vue Weave

[日本語](README.ja.md)

[Source](https://github.com/EightKK/vue-weave) · [Issues](https://github.com/EightKK/vue-weave/issues)

Interactive network graphs and Gantt charts for Vue 3. Build relationship explorers, production views, project schedules and resource timelines with typed components and framework-independent graph, scheduling and resource-load calculations.

## Install

The package is not distributed through npm. [Build a local package](CONTRIBUTING.md#build-a-local-package), then install the generated `.tgz` from your application's directory. Replace the example path with the actual tarball path.

```sh
npm install ./path/to/package.tgz
```

Vue 3.5+ is a peer dependency. The library ships ES modules, TypeScript declarations and one stylesheet. Import the stylesheet once in your application. The `vue-weave/core` entry runs without Vue and supports TypeScript `NodeNext` resolution.

## A network graph

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

The built-in layout supports branches, merges, disconnected nodes, directed cycles and self-loops. Choose `LR`, `TB`, `RL` or `BT`, and opt in to `crossingReduction: 'barycenter'` to reduce edge crossings. Supply a `layout` function to own placement and edge routing. Customize the SVG through the `node` and `edge` slots. Opt in to node moves, connections, multiple selection and the minimap through component props.

For other shapes, `layoutTreeGraph` and `layoutRadialGraph` from `vue-weave/core` are drop-in `layout` functions. Opt in to nested groups (`parentId`), viewport culling for large graphs (`cullOffscreen`), pinch zoom on touch screens, and search highlighting with `matchIds`, `dimmedIds` and the `focusNode(id)` method. Edge selection (`edgesSelectable`), keyboard deletion proposals (`deletable`, applied with `removeGraphElements`), context-menu requests (`contextMenu`), a `tooltip` slot and `fit({ ids })` for the selection are opt-in as well. So are snap to grid (`snapGrid`) with a dotted or lined `background`, `alignmentGuides`, `autoPan` near the edges, palette drops (`droppable` with the `node-drop` event, `toGraphPoint(x, y)` and `getViewportCenter()`) and copy, paste and duplicate proposals (`clipboard` with the `copy-selection`, `paste-request` and `duplicate-selection` events, applied with `cloneGraphElements`). Groups can collapse into proxy nodes (`collapsibleGroups`, `collapsedGroupIds`), edges can be drawn orthogonal or straight (`edgeStyle`) and through waypoints (`GraphEdge.points`, edited with `editableEdges`), node details fade out below a zoom level (`lodThreshold`), and nodes can be resized (`sizes`, `resizable`); the core helpers `collapseGraphGroups`, `routeGraphEdges` and `applyGraphSizes` compute the same geometry. Core helpers `topologicalOrder`, `findGraphCycles`, `shortestGraphPath`, `searchGraphNodes` and `filterGraph` analyze the same node and edge data.

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

## A controlled Gantt chart

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

The component previews pointer edits, then emits a proposal. The parent commits it by replacing the affected interval. This supports application-specific validation, API persistence and asynchronous approval. A synchronous `validateEdit` hook can reject a proposal before the event is emitted.

Intervals support multiple lanes, progress, milestones and FS/SS/FF/SF dependencies. Row groups, baselines, header bands and date markers support planning views. Row and time-window virtualization limit rendered elements. `formatTime`, `labels`, slots and CSS variables control presentation.

Further opt-in features, all emitted as proposals for the parent to accept:

- Dependency creation and reconnection (`connectable`, `reconnectable`, `validateConnection`).
- Multiple selection with batch moves (`multiSelect`, `edits`) and row moves (`rowDraggable`).
- A resource load histogram under the task rows (`loadRows`, `loadSegments`), which accepts the output of `calculateResourceLoad`.
- Zoom presets (`zoomPresets`), a now marker (`showNow`) and touch pinch zoom (`pinchZoom`).
- Non-working time shading (`nonWorkingPeriods`), and critical outlines, float lines, deadline indicators and split bars through the optional bar fields `critical`, `latestEnd`, `deadline` and `segments`, described to screen readers without changing bar names.
- Progress sliders (`progressEditable`, `progress-edit`), bar deletion with Delete or Backspace (`deletable`, `bars-delete`, accepted with `removeTimelineBars`), a hoverable `tooltip` slot, a `context-menu` event for your own menu (`contextMenu`) and a `fitToBars()` method.
- Drag to create new bars on empty row space or with a per-row add button (`creatable`, `create`), stacked without overlap by `assignLanes`, and auto-scheduling previews (`cascade`) that draw the bars a move would push and propose them with it as one `edits` batch.

Use `buildWorkPeriods`, `scheduleTasks` and `calculateResourceLoad` from `vue-weave/core` for working calendars, dependency scheduling, critical tasks and resource overload diagnostics. The application calls these functions and passes accepted results to the chart; `scheduledBarFields` turns a scheduled task into those bar fields and `invertWorkPeriods` turns a calendar into the time to shade. `propagateEdit` reschedules a plan with one task pinned at a new start and lists every task that moves, ready to return from `cascade`. Scheduling also reports cycle and infeasibility diagnostics, supports as-late-as-possible tasks (`mode: 'alap'`), pauses and IANA time-zone calendars (`WorkWeek.timeZone`), and `levelResources` delays tasks so that assigned load stays within capacity. See the [scheduling guide](docs/scheduling.md).

## Export, direction and themes

Both components expose `exportSvg(options)` and `exportPng(options)` on their template ref to save the whole chart, and `renderGraphSvg` and `renderTimelineSvg` in `vue-weave/core` build the same SVG on a server. Set `dir="rtl"` (or `auto`) for right-to-left layouts. Add the `vft-theme-dark` class to a component or an ancestor for the built-in dark theme, or `vft-theme-auto` to follow `prefers-color-scheme`. The stylesheet also covers forced colors, reduced motion and print. See [integration](docs/integration.md).

```ts
const svg = chart.value!.exportSvg({ title: 'Plan' })
const png = await chart.value!.exportPng({ scale: 2 })
```

## Run the demo

Use Node.js 22.18+ and npm. From a source checkout or GitHub source ZIP, run:

```sh
npm ci
npm run build:demo
npm start
```

The demo includes manufacturing, project delivery, a 1,000-row timeline, a large graph, timeline editing and scheduling, with export buttons and a theme switch. Enable **Edit graph** for connections, reconnection, box selection, group movement, edge selection, deletion, a context menu, tooltips, **Fit selection**, **Snap to grid**, **Alignment guides**, auto-pan, a node palette (drag **Add operation** or **Add lot** onto the graph, or activate it), copy, paste and duplicate with Ctrl+C, Ctrl+V and Ctrl+D, **Collapsible groups**, **Editable edges** (waypoints), **Resizable nodes**, an **Edge style** select and level of detail when zoomed out. Enable **Planning overlays** for editable columns and rollups. **Undo** and **Redo** restore accepted edits. In **Scheduling**, moving an order recalculates downstream dates and equipment load against a split-shift calendar, with non-working time shaded and the critical path, float, split work and a deadline drawn on the bars. Edits remain in the demo's local state.

If you have a prebuilt demo archive containing `preview/`, extract it completely and run `npm start`, or double-click `Start.cmd` on Windows. The prebuilt demo needs Node.js but does not require dependency installation.

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
