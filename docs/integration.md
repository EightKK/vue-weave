# Integration

## Node.js and TypeScript

The package exports ES modules. Use `vue-weave/core` for calculations on a server or in a worker; that entry runs without Vue or browser globals. Both public entries support `module: NodeNext` with `moduleResolution: NodeNext`, as well as bundler-based TypeScript applications. Relative imports in the emitted declarations use explicit `.js` paths so NodeNext can resolve them. The build also finalizes Vue component re-exports to resolve the generated `.vue.d.ts` files in that mode. Vue applications should import the components from the root and load `vue-weave/style.css` once.

For installation, follow the [README](../README.md#install).

Declarations also support `noUncheckedSideEffectImports` without requiring CSS declarations just to import the components. If your application imports the stylesheet with that option enabled, its asset types must recognize CSS imports, for example through `vite/client` or an application-owned `declare module '*.css' {}` declaration.

## Nuxt

Install the package as described in the [README](../README.md#install), then add the stylesheet once in the Nuxt application.

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  css: ['vue-weave/style.css'],
})
```

Import components explicitly in a page or component.

```vue
<script setup lang="ts">
import { NetworkGraph } from 'vue-weave'
const nodes = [{ id: 'root', label: 'Root' }]
const edges = []
</script>
<template>
  <NetworkGraph :nodes="nodes" :edges="edges" />
</template>
```

The library accesses DOM measurement and ResizeObserver after mounting. Initial server rendering uses deterministic fallback viewport dimensions, then measures the actual container. Vue useId supplies instance-specific SVG marker IDs. Keep server/client data and formatTime output consistent. For timezone-specific labels, use Intl.DateTimeFormat with an explicit timeZone and locale.

## Large graphs, touch and search

For graphs with thousands of nodes, set `cullOffscreen` so only the visible region is in the DOM. Keep `showMinimap` on to orient users, because the minimap still draws every node. A search box can pass the IDs found by your own code as `matchIds` and call `focusNode(id)` on the component ref to bring a result into view.

```vue
<NetworkGraph ref="graph" :nodes="nodes" :edges="edges" cull-offscreen show-minimap :match-ids="matches" />
```

```ts
graph.value?.focusNode(matches.value.values().next().value, { scale: 1 })
```

The graph needs no setup for touch: pinch to zoom and drag with two fingers to pan. Nested groups take an optional `parentId` on each group; see the API reference. Culled nodes are absent from the DOM and keyboard order, so offer a search or list for keyboard users who need to reach a distant node.

## Deleting, context menus and tooltips

Deletion, like every graph edit, is a proposal. Enable `deletable` (and `edgesSelectable` so edges can be selected), then apply the `delete` event with `removeGraphElements` from the core entry. Committing the result as one `useEditHistory` entry lets Undo restore the nodes and edges together. Prune selections, saved positions and groups that mention removed IDs.

```vue
<NetworkGraph :nodes="nodes" :edges="edges" edges-selectable deletable context-menu
  v-model:selected-ids="selection" v-model:selected-edge-ids="edgeSelection"
  @delete="applyDeletion" @context-menu="openMenu">
  <template #tooltip="{ target }">
    {{ target.kind === 'node' ? target.node.detail : target.edge.label }}
  </template>
</NetworkGraph>
```

```ts
function applyDeletion(deletion: GraphDeletion) {
  const next = removeGraphElements(nodes.value, edges.value, deletion)
  history.commit({ ...history.state.value, ...next })
}
```

The `context-menu` event only reports the request with its target, chart point and viewport coordinates. Render your own menu, for example with `position: fixed` at `clientX` and `clientY`; give it `role="menu"` and `role="menuitem"` entries, focus the first entry, close it with Escape and return focus to the graph element. The tooltip slot renders HTML in an overlay that the component positions; keep it short and non-interactive, because a tooltip cannot be focused.

## Snapping, palettes and the clipboard

Turn on `snapGrid` (with `background="dots"` to show the grid), `alignmentGuides` and `autoPan` for a diagram editor feel. Node moves still arrive as `node-move` and `nodes-move` proposals, already snapped.

A palette can add nodes in two ways. Drag and drop: make the palette items `draggable`, put an identifier in `dataTransfer`, set `droppable` on the graph and read it back in the `node-drop` event. Keyboard: let the same item be a button that adds the node at `getViewportCenter()`, because HTML drag and drop needs a pointer.

```vue
<button type="button" draggable="true" @dragstart="$event.dataTransfer?.setData('application/x-node', 'task')"
  @click="addTask(graph!.getViewportCenter())">Add task</button>
<NetworkGraph ref="graph" :nodes="nodes" :edges="edges" :positions="positions" draggable droppable clipboard
  :snap-grid="20" background="dots" alignment-guides auto-pan
  @node-drop="drop => drop.dataTransfer?.getData('application/x-node') === 'task' && addTask(drop.point)"
  @copy-selection="copied = $event" @paste-request="paste" @duplicate-selection="duplicate" />
```

`drop.point` is the drop position in chart coordinates, rounded to the grid. To centre a new node on the pointer instead of placing its corner there, convert `drop.clientX` and `drop.clientY` with `toGraphPoint` and round the corner once with `snapGraphPoint`. Saved positions must stay nonnegative.

The `copy-selection`, `paste-request` and `duplicate-selection` events only report keys and selections; the application keeps the copied data. `cloneGraphElements` from the core entry copies nodes and the edges between them with new IDs and moved positions:

```ts
function duplicate(selection: GraphClipboardSelection) {
  const copies = cloneGraphElements(nodes.value, edges.value, selection.nodeIds, {
    createId: (id, kind) => id + '-copy-' + nextNumber(kind),
    positions: selection.positions,
    offset: { x: 40, y: 40 },
  })
  history.commit({
    nodes: [...nodes.value, ...copies.nodes], edges: [...edges.value, ...copies.edges],
    positions: new Map([...positions.value, ...copies.positions]),
  })
}
```

For `paste-request`, store the copied nodes, edges and `positions` from the `copy-selection` event, then clone them with an `offset` that moves their top-left corner to `event.point`. Committing each operation as one `useEditHistory` entry makes Undo remove the copies together.

## Collapsing groups, edge styles, waypoints and resizing

Keep the collapsed group IDs, node sizes and edge waypoints in your application state next to `positions`, and commit each accepted proposal as one history entry:

```vue
<NetworkGraph :nodes="nodes" :edges="edges" :groups="groups" :positions="positions" :sizes="sizes" draggable
  collapsible-groups :collapsed-group-ids="collapsed" @update:collapsed-group-ids="ids => commit({ collapsed: ids })"
  edge-style="orthogonal" editable-edges edges-selectable resizable :lod-threshold="0.5"
  @edge-reshape="reshape" @node-resize="resize" @node-move="move" @nodes-move="moveAll" />
```

```ts
function reshape({ id, after }: GraphEdgeReshape) {
  commit({ edges: edges.value.map(edge => edge.id === id ? { ...edge, points: after.length ? after : undefined } : edge) })
}
function resize({ id, before, after }: GraphNodeResize) {
  const nextPositions = after.x !== before.x || after.y !== before.y ? new Map(positions.value).set(id, { x: after.x, y: after.y }) : positions.value
  commit({ sizes: new Map(sizes.value).set(id, { width: after.width, height: after.height }), positions: nextPositions })
}
```

A collapsed group is drawn as a proxy node with the group's ID. Moves of the proxy arrive as moves of its members and deletions as deletions of its members, but selection and connection proposals carry the proxy ID, so reject or map them in `validateConnection`. `collapseGraphGroups` from the core entry computes the same view, for example to map the proxy back to its members in a context menu. Custom node slots can use the `scale` slot prop for their own level of detail. The handles use the classes `vft-group-toggle`, `vft-waypoint-handle`, `vft-waypoint-add` and `vft-resize-handle` and take their colours from `--vft-accent` and `--vft-surface`; no new theme variables are needed.

## Custom content

The graph node slot receives its node, measured layout box and the camera `scale`. It is inside a translated, keyboard-accessible SVG group. Render SVG children in local coordinates.

```vue
<NetworkGraph :nodes="nodes" :edges="edges">
  <template #node="{ node, box, selected }">
    <rect :width="box.width" :height="box.height" :rx="8"
      :fill="selected ? '#d8e9fb' : '#fff'" stroke="#365772" />
    <text x="12" y="30">{{ node.label }}</text>
  </template>
</NetworkGraph>
```

Return a custom GraphLayout to use stored node positions or another layout algorithm. The layout callback is pure. It returns boxes, paths and label positions in the same world coordinate space.

Gantt row/bar/tick slots accept ordinary HTML. The bar slot is already inside a focusable button, so avoid nested buttons or links. Use the select event to open a detail panel elsewhere.

## Themes and localization

Styles use the vft- class prefix. Set CSS variables on an ancestor to change themes. Examples include --vft-surface, --vft-surface-muted, --vft-surface-hover, --vft-text, --vft-muted, --vft-border, --vft-grid, --vft-edge, --vft-accent and --vft-on-solid.

Tone-specific variables follow --vft-blue-ink, --vft-blue-line, --vft-blue-pale and --vft-blue-solid. The same suffixes are available for teal, amber and violet. `--vft-baseline`, `--vft-marker` and `--vft-dependency-highlight` control baseline bars, time markers and highlighted dependency paths. The demo's own `.dark` class uses this contract too. `--vft-dimmed-opacity` (default 0.28) sets the opacity of graph nodes and edges de-emphasized through `matchIds` or `dimmedIds`.

`--vft-edge-selected` (default `--vft-accent`) colours the edges selected through `edgesSelectable`; the NetworkGraph tooltip uses `--vft-surface`, `--vft-border` and `--vft-text`.

NetworkGraph editing aids add two variables, used only when the matching prop is set:

| Variable | Default | Used for |
| --- | --- | --- |
| `--vft-background-pattern` | `--vft-grid` (`#c7d6df`) | Dots or lines of the `background` pattern |
| `--vft-guide` | `#c2255c` | Dashed alignment guides (`vft-guide`) drawn with `alignmentGuides` |

GanttChart editing and load overlays add `--vft-now` (now marker), `--vft-load` (load within capacity), `--vft-load-overload` (load above capacity) and `--vft-load-capacity` (dashed capacity line). Link handles, the dependency selection outline and the connection preview use `--vft-accent`; zoom preset buttons use `--vft-accent` and `--vft-on-solid` for the active preset.

Scheduling overlays add four variables, used only when the matching input is set:

| Variable | Default | Used for |
| --- | --- | --- |
| `--vft-non-working` | `#eaeff3` | `nonWorkingPeriods` shading behind the grid |
| `--vft-critical` | `#b42318` | Outline of bars with `critical: true` |
| `--vft-float` | `#5b7083` | Float line from a bar's end to its `latestEnd` |
| `--vft-deadline` | `#a74f08` | Deadline indicator and the dashed outline of a late bar |

Segmented bars draw their work pieces and gap connectors with the bar's tone variables.

The opt-in progress slider (`progressEditable`) is drawn in `--vft-accent`, and the tooltip slot container (`vft-gantt-tooltip`) uses `--vft-surface`, `--vft-text` and `--vft-border`; they add no new variables. Restyle the tooltip through its class or your slot content.

Drag to create (`creatable`) draws its preview (`vft-gantt-create-preview`) with `--vft-accent` and the row add button (`vft-gantt-create-button`) with `--vft-surface`, `--vft-border` and `--vft-accent`. The cascade preview of the `cascade` prop adds one variable:

| Variable | Default | Used for |
| --- | --- | --- |
| `--vft-cascade` | `#6d4bb3` | Dashed outline and light fill of the bars a `cascade` callback moves during a drag (`vft-gantt-cascade-preview`) |

### Built-in dark theme

Add `vft-theme-dark` to a component root or any ancestor to apply a dark value to every `--vft-*` variable, including `--vft-dimmed-opacity`, `--vft-now`, `--vft-load`, `--vft-load-overload`, `--vft-load-capacity`, `--vft-non-working`, `--vft-critical`, `--vft-float`, `--vft-deadline`, `--vft-cascade`, `--vft-background-pattern`, `--vft-guide`, the tone families and the new `--vft-marker-ink`. Add `vft-theme-auto` instead to apply the same values only while `prefers-color-scheme: dark` matches. Both are opt-in, so the default appearance is unchanged. Variables you set on a descendant still win, and the demo's own `.dark` class keeps working. On a `GanttChart` root the class also paints the surface background and sets `color-scheme: dark`. The dark palette keeps text/surface contrast above 7:1 (4.5:1 minimum for every text pair).

`--vft-marker-ink` (default `#fff`) is the text colour on marker and now-marker labels, including in SVG and PNG exports (the `markerInk` export theme colour). In the dark theme the solid tones are light and `--vft-on-solid` is dark.

### Media queries

- `@media (forced-colors: active)`: always on. Nodes, bars, edges, dependency lines, handles, progress, load overload (hatched), capacity line, the now marker, non-working shading (hatched with `GrayText`), critical outlines (double border), float lines, deadline indicators, late outlines (dashed), segments, the progress slider, the tooltip border, the create and cascade previews (`Highlight` outlines without fill), the graph background pattern (`GrayText`), alignment guides (`Highlight`), selection and focus use system colours (`CanvasText`, `Highlight`, `HighlightText`, `GrayText`) with `forced-color-adjust: none` on the affected elements. Selection is also shown by outline or thicker strokes, not colour alone.
- `@media (prefers-reduced-motion: reduce)`: the stylesheet disables transitions and animations inside both components. Drag auto-scroll in `GanttChart` runs through `requestAnimationFrame` in JavaScript and is not affected.
- `@media print`: zoom and preset controls, the minimap, bar and connection handles, progress sliders, the graph and Gantt tooltips, link hit targets and previews, the row add buttons, the create and cascade previews, alignment guides and the Gantt toolbar are hidden; the graph background pattern is printed like the default backdrop. Backgrounds, including non-working shading, are kept with `print-color-adjust: exact`, the Gantt scroller expands (`height: auto`, `overflow: visible`) and rows avoid page breaks. CSS alone cannot print content outside the DOM: virtualized rows and time windows, graph elements culled with `cullOffscreen`, and the part of a graph outside the current camera are not rendered, so a very large chart prints only what is mounted. Use a dedicated export for complete output.

Supply partial labels objects to translate controls and accessible names. The row-heading and empty slots provide full control over those regions. Data labels and formatTime belong to the caller.

## Persistence

The edit event carries the previous interval so your parent can detect a stale proposal. A synchronous local commit is shown in the README.

For an API-backed application, retain a record version alongside the interval, compare change.before to current state, submit the proposal with that version, and replace bars after the server accepts it. Serialize pending updates per bar or reject another edit while a save is pending. Surface rejection in your application and retain the accepted state. The event is a proposal; ignoring it preserves the previous interval.

Treat a Gantt `edits` batch as one transaction: apply every change or none, and commit it as one history entry. Row moves arrive as `change.row.after`. Dependency `connect`, `reconnect` and `dependency-delete` events are proposals as well; assign dependency IDs in the application or on the server, and check for cycles there if your scheduling rules forbid them.

`progress-edit` and `bars-delete` follow the same pattern. Accept a progress proposal by setting the bar's `progress` to `change.after`. Accept a deletion with `removeTimelineBars`, which also drops the dependencies that touch the removed bars, and commit both arrays as one history entry so that undo restores the bars and their links together:

```ts
function deleteBars(ids: string[]) {
  const next = removeTimelineBars(history.state.value.bars, history.state.value.dependencies, ids)
  history.commit(next)
}
```

Accept a `create` proposal by adding a bar with an ID and label of your choice at `proposal.start`–`proposal.end` in `proposal.rowId` (and `proposal.lane` when you use lanes), again as one history entry. When new bars may overlap others, pass the bars through `assignLanes(bars, { keepLanes: true })` and give the chart its `laneCount` with a `rowHeight` of at least 8 + laneCount × 14. With `cascade`, an accepted move arrives as an `edits` batch that lists the bars the user moved first and the cascaded bars after them; apply it like any batch, or recompute the plan from the moved bars when the cascaded dates come from your scheduler.

The `context-menu` event only reports what was targeted, the time and row under the pointer and the client coordinates. Render your own menu there (for example `role="menu"` with `role="menuitem"` entries), move focus into it, close it on Escape and return focus to the element that had it. Menu actions can reuse the same accept functions as the keyboard proposals.

## Alternative time scales

A TimeScale exposes width, toX(time) and toTime(x). It must map range.start to 0 and range.end to width, be finite and strictly increasing, and provide mutually inverse mappings over the range. It should also extrapolate beyond the range when tick or interval calculations require it. The Gantt component applies zoom to that mapping and uses its inverse for pointer displacement.

For example, a piecewise scale can give working hours more visual space while retaining a small positive width for other hours. A fully collapsed interval is not invertible and needs a separately defined editing policy. For calendar generation and work-duration scheduling, call `buildWorkPeriods` and `scheduleTasks` from `vue-weave/core`, then pass accepted intervals to the chart. `buildWorkPeriods` uses a fixed UTC offset or, with `timeZone`, an IANA zone including its daylight-saving transitions. The chart does not invoke the scheduler automatically. See [Scheduling and resource load](scheduling.md).

## Reusing calculations

Use the core entry in a worker or server to compute layouts, transform times or validate input. NetworkGraph currently takes a synchronous layout callback. For an asynchronously computed layout, store the returned result in application state and supply a synchronous callback that returns the current result. Update data and matching geometry together.

Geometry types use Maps. Convert them to entries arrays when serializing them across JSON boundaries, then reconstruct Maps at the consuming side.

## Export to SVG and PNG

Call `exportSvg` or `exportPng` on a component ref to save the whole chart, independent of scrolling, zoom or culling. The SVG is a standalone document string; the PNG is rasterized in the browser at the `scale` you pass.

```ts
const svg = timeline.value!.exportSvg({ title: 'Production plan' })
const png = await timeline.value!.exportPng({ scale: window.devicePixelRatio })
const url = URL.createObjectURL(png)
Object.assign(document.createElement('a'), { href: url, download: 'plan.png' }).click()
URL.revokeObjectURL(url)
```

The export reads the `--vft-*` colours and the font in effect on the component, so a theme applies automatically; pass `theme` to override individual colours, for example a light theme for printing from a dark UI. The default rendering is exported: slot content is not, so pass `barLabel`, `rowLabel`, `rowHeading`, `nodeLabel`, `nodeDetail` or `edgeLabel` when your slots change text. Fonts are not embedded; a viewer without the font uses a fallback.

To render on a server or in a worker, call `renderGraphSvg` or `renderTimelineSvg` from `vue-weave/core` with the same data, a layout or `TimeScale` and an explicit theme. Large charts produce large SVG strings. For PNG, `width × scale` and `height × scale` must stay within 16,384 pixels per side and 268,435,456 pixels in total; export a `timeRange` or `rowRange` slice, or lower `scale`, for bigger charts.

## Right-to-left languages

Set `dir="rtl"` on a component for a right-to-left interface, or `dir="auto"` to follow the direction inherited from the page (for example `<html dir="rtl">`). The default `ltr` leaves rendering unchanged; in a right-to-left page it keeps the inherited direction, which the timeline does not support, so pass `rtl` or `auto` there.

```vue
<GanttChart dir="rtl" :rows="rows" :bars="bars" :range="range" :format-time="formatTime" @edit="apply" />
```

The timeline then runs from right to left and its row headings sit on the right. Edit proposals keep the same times and units, so validation and persistence code needs no change. Arrow keys follow the screen: ArrowLeft makes a bar later. Translate the edit hint through `labels.editHint` to describe this to screen reader users. `auto` is resolved after mounting, so server-rendered markup is left-to-right until hydration; use an explicit `rtl` for server rendering.

The new right-to-left rules are scoped to the `vft-rtl` class and use CSS logical properties. Custom slot content inherits `direction: rtl`. For NetworkGraph, `dir` only moves the controls and right-aligns labels; choose `options.direction: 'RL'` to lay out ranks from right to left.
