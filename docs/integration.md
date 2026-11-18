# Integration

## Node.js and TypeScript

The package exports ES modules. Use `vue-weave/core` for calculations on a server or in a worker; that entry runs without Vue or browser globals. Both public entries support `module: NodeNext` with `moduleResolution: NodeNext`, as well as bundler-based TypeScript applications. Relative imports in the emitted declarations use explicit `.js` paths so NodeNext can resolve them. The build also finalizes Vue component re-exports to resolve the generated `.vue.d.ts` files in that mode. Vue applications should import the components from the root and load `vue-weave/style.css` once.

Both components are generic over their item types. Type the `data` of your items, for example `NetworkNode<MyData>[]` or `TimelineBar<MyData>[]`, and the slot props, `layout`, `columns` callbacks and export label callbacks receive that type without casts. For a template ref, use `useTemplateRef`, which vue-tsc infers from the template, or `NetworkGraphExposed` and `GanttChartExposed`; `InstanceType<typeof NetworkGraph>` keeps working with the default types. See [Typed data](api.md#typed-data).

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
import { NetworkGraph, type GraphEdge, type NetworkNode } from 'vue-weave'
const nodes: NetworkNode[] = [{ id: 'root', label: 'Root' }]
const edges: GraphEdge[] = []
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

The `copy-selection`, `paste-request` and `duplicate-selection` events only report keys and selections; the application keeps the copied data. `cloneGraphElements` from the core entry copies nodes and the edges between them with new IDs, moved positions and moved edge waypoints:

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

A collapsed group is drawn as a proxy node with the group's ID. Moves of the proxy arrive as moves of its members and deletions as deletions of its members, but selection and connection proposals carry the proxy ID, so reject or map them in `validateConnection`. `collapseGraphGroups` from the core entry computes the same view, for example to map the proxy back to its members in a context menu. Custom node slots can use the `scale` slot prop for their own level of detail. The handles use the classes `vw-group-toggle`, `vw-waypoint-handle`, `vw-waypoint-add` and `vw-resize-handle` and take their colours from `--vw-accent` and `--vw-surface`; no further theme variables are needed.

## Custom content

The graph node slot receives its node, measured layout box, the camera `scale` and its `selected`, `related`, `highlighted` and `dimmed` states. It is inside a translated, keyboard-accessible SVG group. Render SVG children in local coordinates. The stylesheet paints node `rect` and `text` elements, including those in a slot, and elements with the class `vw-node-shape` (the outline of the default diamond, ellipse and hexagon nodes), and CSS wins over presentation attributes such as `fill`; add `unstyled-node-slots` so the slot's own attributes and classes decide the paint.

```vue
<NetworkGraph :nodes="nodes" :edges="edges" unstyled-node-slots>
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

Styles use the vw- class prefix. Set CSS variables on an ancestor to change themes. Examples include --vw-surface, --vw-surface-muted, --vw-surface-hover, --vw-text, --vw-muted, --vw-border, --vw-grid, --vw-edge, --vw-accent and --vw-on-solid.

Tone-specific variables follow --vw-blue-ink, --vw-blue-line, --vw-blue-pale and --vw-blue-solid. The same suffixes are available for teal, amber and violet. `--vw-baseline`, `--vw-marker` and `--vw-dependency-highlight` control baseline bars, time markers and highlighted dependency paths. When two or three baseline sets are drawn (`baselineIds`), `--vw-baseline` colours the first slot and `--vw-baseline-2` (default `#9a4c95`) and `--vw-baseline-3` (default `#23806f`) the second and third; the built-in dark theme sets them to `#dc9fd6` and `#6fd0bc`. To colour a set by its ID instead of its slot, style `.vw-gantt-baseline[data-vw-baseline="rev1"]`. The demo's own `.dark` class uses this contract too. `--vw-dimmed-opacity` (default 0.28) sets the opacity of graph nodes and edges de-emphasized through `matchIds` or `dimmedIds`.

`--vw-edge-selected` (default `--vw-accent`) colours the edges selected through `edgesSelectable`; the NetworkGraph tooltip uses `--vw-surface`, `--vw-border` and `--vw-text`.

`--vw-graph-highlight` (unset by default, falling back to `--vw-dependency-highlight`, `#a74f08`, and to its dark value in the dark themes) colours the display-only highlights of NetworkGraph: the outline of nodes in `highlightedNodeIds` (`.vw-network-node.vw-is-highlighted`) and the edges in `highlightedEdgeIds` (an edge group with `vw-is-highlighted`). The graph export methods read it as the highlight colour (`highlightColor` of `renderGraphSvg`). In forced-colors mode highlighted nodes get a dashed `Highlight` outline and highlighted edges a dashed `CanvasText` stroke.

Node shapes and edge decorations (`NetworkNode.shape`, `GraphEdge.markerStart`, `markerEnd` and `animated`) reuse the node and edge colours: the outline of a diamond, ellipse or hexagon node (`.vw-node-shape`) is painted like the node rectangle, markers take the colour of their edge, and the hollow `circle` and `diamond` markers (`.vw-edge-marker-hollow`) are filled with `--vw-surface-muted`, so they match the stage in the light and dark themes. Animated edges (`.vw-network-edge.vw-is-animated`) add one variable:

| Variable | Default | Used for |
| --- | --- | --- |
| `--vw-edge-animation-duration` | `1s` | Time the dash pattern of an animated edge takes to move two dashes (20 chart units) towards the target |

NetworkGraph editing aids add two variables, used only when the matching prop is set:

| Variable | Default | Used for |
| --- | --- | --- |
| `--vw-background-pattern` | `--vw-grid` (`#c7d6df`) | Dots or lines of the `background` pattern |
| `--vw-guide` | `#c2255c` | Dashed alignment guides (`vw-guide`) drawn with `alignmentGuides` |

The opt-in label editor, lasso and toolbar slots of NetworkGraph use the theme colours: the lasso outline (`vw-lasso-selection`) is drawn in `--vw-accent`, and the label editor (`vw-label-editor`) and the toolbar containers (`vw-node-toolbar`, `vw-edge-toolbar`) use `--vw-surface`, `--vw-border`, `--vw-text` and, for the editor's border, `--vw-accent`. They add two length variables:

| Variable | Default | Used for |
| --- | --- | --- |
| `--vw-label-editor-width` | `140px` | Width of the label editor of an edge (`vw-label-editor.vw-is-edge`); a node's editor takes the node's on-screen width, at least 120 pixels |
| `--vw-toolbar-offset` | `8px` | Gap between a node or edge and the container of the `node-toolbar` or `edge-toolbar` slot |

With the `group` slot, the stylesheet does not paint the slot content (the group gets `vw-has-slot`), and the transparent move handle (`vw-group-handle`) shows an `--vw-accent` outline while focused. The `minimap-node` slot content sits in a `vw-minimap-custom` group, which the minimap's rectangle fill does not reach.

GanttChart editing and load overlays add `--vw-now` (now marker), `--vw-load` (load within capacity), `--vw-load-overload` (load above capacity) and `--vw-load-capacity` (dashed capacity line). Dependency lag labels (`vw-gantt-lag`) use `--vw-text` on a `--vw-surface` halo, or `--vw-dependency-highlight` for highlighted dependencies. Link handles, the dependency selection outline and the connection preview use `--vw-accent`; zoom preset buttons use `--vw-accent` and `--vw-on-solid` for the active preset.

Linked views and typed cells add five variables, used only when the matching prop is set:

| Variable | Default | Used for |
| --- | --- | --- |
| `--vw-bar-highlight` | `--vw-dependency-highlight` (`#a74f08`) | Outline of bars in `highlightedBarIds` (`.vw-gantt-bar.vw-is-highlighted`) |
| `--vw-load-focus` | `--vw-accent` (`#245e96`) | Focus outline of load segments with `loadSelectable` |
| `--vw-load-highlight` | `--vw-dependency-highlight` (`#a74f08`) | Inset ring of load segments matched by `highlightedLoadTargets` (`.vw-gantt-load-segment.vw-is-highlighted`) |
| `--vw-load-selected` | `--vw-accent` (`#245e96`) | Thicker inset ring of load segments matched by `selectedLoadTargets` (`.vw-gantt-load-segment.vw-is-selected`) |
| `--vw-field-invalid` | `#c4161c` | Border of a built-in field input whose text could not be read (`aria-invalid`) |

In forced-colors mode highlighted bars get a dashed `CanvasText` outline, focused load segments a `Highlight` outline, highlighted load segments a dashed `CanvasText` outline and selected load segments a solid `Highlight` outline.

Scheduling overlays add four variables, used only when the matching input is set:

| Variable | Default | Used for |
| --- | --- | --- |
| `--vw-non-working` | `#eaeff3` | `nonWorkingPeriods` shading behind the grid |
| `--vw-critical` | `#b42318` | Outline of bars with `critical: true` |
| `--vw-float` | `#5b7083` | Float line from a bar's end to its `latestEnd` |
| `--vw-deadline` | `#a74f08` | Deadline indicator and the dashed outline of a late bar |

Segmented bars draw their work pieces and gap connectors with the bar's tone variables.

The opt-in progress slider (`progressEditable`) is drawn in `--vw-accent`, and the tooltip slot container (`vw-gantt-tooltip`) uses `--vw-surface`, `--vw-text` and `--vw-border`; they add no variables. Restyle the tooltip through its class or your slot content.

Drag to create (`creatable`) draws its preview (`vw-gantt-create-preview`) with `--vw-accent` and the row add button (`vw-gantt-create-button`) with `--vw-surface`, `--vw-border` and `--vw-accent`. The cascade preview of the `cascade` prop adds one variable:

| Variable | Default | Used for |
| --- | --- | --- |
| `--vw-cascade` | `#6d4bb3` | Dashed outline and light fill of the bars a `cascade` callback moves during a drag (`vw-gantt-cascade-preview`) |

Row hierarchy moves (`rowsReorderable`) draw the move handles (`vw-row-move-handle`) with `--vw-muted` and `--vw-surface-hover` and the drop indicator (`vw-gantt-row-drop`) with `--vw-accent`. The status date adds one variable:

| Variable | Default | Used for |
| --- | --- | --- |
| `--vw-status` | `#1f7a4d` | The `statusDate` line and its label (`vw-gantt-status-date`) and the progress line of `showProgressLine` (`vw-gantt-progress-line`); the `status` export theme colour |

Scheduling constraints (`TimelineBar.constraints`) add two variables. Their markers and, with `constraintsEditable`, their handles have the class `vw-gantt-constraint` with the modifiers `vw-is-start` or `vw-is-finish` (flag at the top or the bottom), `vw-is-lower`, `vw-is-upper` or `vw-is-fixed` (the glyph) and the states `vw-is-violated` and `vw-is-dragging`. The component sets `--vw-constraint-reach` on each, the length of its stem across the lane, for the stylesheet. A focused handle uses the `--vw-accent` focus outline.

| Variable | Default | Used for |
| --- | --- | --- |
| `--vw-constraint` | `#a1246e` | Constraint markers and handles (`vw-gantt-constraint`); the `constraint` export theme colour |
| `--vw-constraint-violated` | `#c4161c` | A constraint that the bar's dates break (`vw-gantt-constraint.vw-is-violated`, drawn with a dashed stem); the `constraintViolated` export theme colour |

Marker ranges (`markerRanges`) add four variables. A range draws a band (`vw-gantt-range`, with `vw-is-row` when it covers single rows) under the bars and a label strip at the bottom of the time header (`vw-gantt-range-label`). A range with a `tone` adds `vw-tone-<tone> vw-has-tone` to both and uses that tone's `--vw-<tone>-pale`, `-line` and `-ink` instead of the first three variables.

| Variable | Default | Used for |
| --- | --- | --- |
| `--vw-range` | `#f9efdc` | Fill of the band and the label strip of a range without a tone; the `range` export theme colour |
| `--vw-range-line` | `#b58848` | Top edge of the label strip; the `rangeLine` export theme colour |
| `--vw-range-ink` | `#764908` | Label text; the `rangeInk` export theme colour |
| `--vw-range-opacity` | `0.7` | Opacity of the band, so grid lines and non-working shading stay visible through it (the export uses 0.7) |

Column resizing (`columnsResizable`) draws its separators (`vw-column-resize`) with `--vw-border`, and with `--vw-accent` while hovered, dragged or focused; it adds no variable. The width of the row label column is the existing `--vw-row-label-width` (default 154px, 106px on narrow screens); the `labelWidth` prop sets it on the chart canvas.

`GanttChart` also sets layout variables on its canvas element (`vw-gantt-canvas`) for its own stylesheet. A host stylesheet can read them, for example to place an overlay on the timeline, but setting them on an ancestor has no effect because the component sets them itself:

| Variable | Value | Meaning |
| --- | --- | --- |
| `--vw-label-area-width` | length | Width of the row label area: `--vw-row-label-width` plus the width of any extra `columns`, including a column resize in progress. Time-axis content starts this far from the inline start edge |
| `--vw-axis-width` | pixels | Width of the time axis |
| `--vw-header-height` | pixels | Height of the header, including `headerBands` |
| `--vw-row-depth` | number | Set on each row label: its hierarchy depth, capped at 5. The stylesheet uses it for indentation |
| `--vw-grid-step` | pixels | Width of one tick step. Kept for custom stylesheets; the built-in styles no longer use it |

`--vw-item-ink`, `--vw-item-line`, `--vw-item-pale` and `--vw-item-solid` are internal. The `vw-tone-*` classes set them from the tone families above, and nodes, bars and segments read them. They are not a theming API: change the tone variables (for example `--vw-blue-solid`) instead.

### Class names

Every class that the components emit and the stylesheet targets starts with `vw-`, so generic utility classes in the host page (for example Tailwind's `outline` or Bootstrap's `active`) cannot restyle chart elements. Element classes are named after the element (`vw-gantt-bar`, `vw-network-node`). State and variant modifiers use the `vw-is-*` form and are always combined with an element class, for example `.vw-gantt-bar.vw-is-selected` or `.vw-network-edge.vw-is-related`. Classes you add yourself, such as a `class` attribute on the component or the content of a slot, are passed through unchanged.

In 0.1.0 these modifiers had no prefix; 0.2.0 adds it. When you upgrade from 0.1.0, rename them in custom stylesheets, test selectors and DOM queries:

| Old class | New class | Applied to |
| --- | --- | --- |
| `selected` | `vw-is-selected` | Selected graph nodes, minimap nodes, selected edge hit areas, Gantt bars and the active dependency path |
| `related` | `vw-is-related` | Graph nodes and edges next to the selection, and Gantt dependency paths that touch a selected bar |
| `highlighted` | `vw-is-highlighted` | Gantt dependency paths and their lag labels in `highlightedDependencyIds` (since this release also Gantt bars in `highlightedBarIds`) |
| `active` | `vw-is-active` | Pressed connection handles, the active graph edge and Gantt dependency hit areas, pressed Gantt link handles and the column resize separator being dragged |
| `panning` | `vw-is-panning` | The graph stage while it is panned |
| `draggable` | `vw-is-draggable` | Graph nodes that can be dragged |
| `collapsed` | `vw-is-collapsed` | Group toggles of collapsed graph groups |
| `solid`, `outline` | `vw-is-solid`, `vw-is-outline` | Gantt bars, from `TimelineBar.appearance` |
| `editable` | `vw-is-editable` | Editable Gantt bars |
| `dragging` | `vw-is-dragging` | Gantt bars with a pending preview and the progress slider being dragged (since 0.2.0 also a constraint handle being dragged) |
| `milestone` | `vw-is-milestone` | Zero-duration Gantt bars |
| `first`, `last` | `vw-is-first`, `vw-is-last` | The start and end resize handles of a Gantt bar (`vw-bar-handle`) |
| `start`, `finish` | `vw-is-start`, `vw-is-finish` | The start and finish link handles of a Gantt bar (`vw-gantt-link-handle`) |
| `end` | `vw-is-end` | The tick label at the end of the Gantt range |
| `overloaded`, `idle` | `vw-is-overloaded`, `vw-is-idle` | Gantt load segments above capacity or without load |

Two newer modifiers exist only with opt-in content: `vw-is-unstyled` on graph node groups rendered by a `node` slot with `unstyledNodeSlots`, and `vw-has-slot` on Gantt milestones rendered with a `bar` slot.

The tone classes (`vw-tone-*`), the theme classes (`vw-theme-dark`, `vw-theme-auto`) and the other `vw-` classes, such as `vw-critical`, `vw-dimmed` and `vw-rtl`, keep their names.

### Built-in dark theme

Add `vw-theme-dark` to a component root or any ancestor to apply a dark value to every `--vw-*` variable, including `--vw-dimmed-opacity`, `--vw-now`, `--vw-load`, `--vw-load-overload`, `--vw-load-capacity`, `--vw-non-working`, `--vw-critical`, `--vw-float`, `--vw-deadline`, `--vw-cascade`, `--vw-background-pattern`, `--vw-guide`, `--vw-status`, `--vw-constraint`, `--vw-constraint-violated`, `--vw-range`, `--vw-range-line`, `--vw-range-ink`, the tone families and `--vw-marker-ink`. Add `vw-theme-auto` instead to apply the same values only while `prefers-color-scheme: dark` matches. Both are opt-in, so the default appearance is unchanged. Variables you set on a descendant still win, and the demo's own `.dark` class keeps working. On a `GanttChart` root the class also paints the surface background and sets `color-scheme: dark`. The dark palette keeps text/surface contrast above 7:1 (4.5:1 minimum for every text pair).

`--vw-marker-ink` (default `#fff`) is the text colour on marker and now-marker labels, including in SVG and PNG exports (the `markerInk` export theme colour). In the dark theme the solid tones are light and `--vw-on-solid` is dark.

### Media queries

- `@media (forced-colors: active)`: always on. Nodes, bars, edges, dependency lines, handles, progress, load overload (hatched), capacity line, the now marker, non-working shading (hatched with `GrayText`), critical outlines (double border), float lines, deadline indicators, late outlines (dashed), segments, the progress slider, the tooltip border, the create and cascade previews (`Highlight` outlines without fill), the row drop indicator, the column resize separators (`CanvasText`), the graph background pattern (`GrayText`), alignment guides (`Highlight`), node shapes (like node rectangles), hollow edge markers (`Canvas` inside an outline in the edge colour), the status-date line (a thick `CanvasText` line), the progress line (dashed `CanvasText`), dependency lag labels (`CanvasText` on a `Canvas` halo), marker range bands (hatched with `CanvasText`) and labels (`CanvasText` on `Canvas`) and scheduling constraint markers and handles (`CanvasText` on a `Canvas` halo, a violated one with a dashed stem, a focused handle with a `Highlight` outline), selection and focus use system colours (`CanvasText`, `Highlight`, `HighlightText`, `GrayText`) with `forced-color-adjust: none` on the affected elements. Selection is also shown by outline or thicker strokes, not colour alone.
- `@media (prefers-reduced-motion: reduce)`: the stylesheet disables transitions and animations inside both components; animated graph edges stay dashed but still. Drag auto-scroll in `GanttChart` runs through `requestAnimationFrame` in JavaScript and is not affected.
- `@media print`: zoom and preset controls, the minimap, bar and connection handles, progress sliders, the graph and Gantt tooltips, link hit targets and previews, the row add buttons, the row move handles and drop indicator, the column resize separators, the create and cascade previews, alignment guides, group toggles, waypoint and resize handles, and the Gantt toolbar are hidden; the status-date and progress lines, marker ranges and the scheduling constraint markers (also those drawn as handles) are printed, animated graph edges print dashed without motion, and the graph background pattern is printed like the default backdrop. Backgrounds, including non-working shading, are kept with `print-color-adjust: exact`, the Gantt scroller expands (`height: auto`, `overflow: visible`) and rows avoid page breaks. CSS alone cannot print content outside the DOM: virtualized rows and time windows, graph elements culled with `cullOffscreen`, and the part of a graph outside the current camera are not rendered, so a very large chart prints only what is mounted. Use a dedicated export for complete output.

Supply partial labels objects to translate controls and accessible names. The row-heading and empty slots provide full control over those regions. Data labels and formatTime belong to the caller.

## Persistence

The edit event carries the previous interval so your parent can detect a stale proposal. A synchronous local commit is shown in the README.

For an API-backed application, retain a record version alongside the interval, compare change.before to current state, submit the proposal with that version, and replace bars after the server accepts it. Serialize saves per document, not per bar: tasks, dependencies, assignments and calendars share one document version, so concurrent saves of different bars can conflict or leave related records inconsistent. Reject another edit (`useEditTransaction` returns `busy`) while a save is pending. The server must apply each save as a conditional update on `baseVersion`, deduplicate by `operationId`, and commit all affected records atomically; a client-generated ID alone cannot prevent a double update on retry, and without these server guarantees retries are not safe. Surface rejection in your application and retain the accepted state. The event is a proposal; ignoring it preserves the previous interval.

### Saving through a server

`useEditTransaction` keeps the accepted state and the state being saved apart, saves one transaction per document at a time and commits only what the server accepted. Give it a document ID, the state and version you loaded and an adapter:

```ts
import { useEditTransaction, type TransactionAdapter } from 'vue-weave'

const adapter: TransactionAdapter<Plan, PlanChange> = {
  validate: (plan, changes) => checkChanges(plan, changes), // synchronous: true, false or a reason
  apply: (plan, changes) => applyChanges(plan, changes),    // returns a new plan; never mutate
  save: async (request, candidate) => {
    const response = await fetch(`/api/plans/${request.documentId}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', 'if-match': request.baseVersion },
      body: JSON.stringify({ operationId: request.operationId, request, candidate }),
    }).catch(() => undefined)
    if (!response) return { status: 'uncertain', operationId: request.operationId } // the request may have arrived
    if (response.status === 409) return { status: 'conflict', operationId: request.operationId, currentVersion: response.headers.get('etag') ?? '' }
    if (!response.ok) return { status: 'rejected', operationId: request.operationId, code: String(response.status) }
    const body = await response.json()
    return { status: 'accepted', operationId: request.operationId, version: body.version, state: body.plan }
  },
}
const plan = useEditTransaction({ documentId: 'plan-1', initialState: loaded.plan, initialVersion: loaded.version, adapter })

async function onEdit(change: TimelineEdit) {
  const outcome = await plan.submit([toPlanChange(change)], { source: change.source })
  if (outcome.status === 'busy') announce('A save is still in progress')
}
```

Bind the chart to `plan.candidateState.value ?? plan.acceptedState.value` to show the change while it is saved, or to `acceptedState` to show only saved data. `undo()` and `redo()` send the previous or next history snapshot as a `restore` transaction and move the history only when the server accepts it. `refresh(state, version)` takes a state fetched from the server (after a conflict, or when another user changed the document), resets the history, sets `historyReset` and makes late responses `discarded`. After `uncertain`, fetch the operation's outcome by its ID and pass it to `reconcile(result)`; never resend the changes under a new operation ID.

The server side of this contract:

- Apply a save only when `baseVersion` is the current version (a conditional update, for example `If-Match`), otherwise answer `conflict` with the current version.
- Store the `operationId` with the change and answer a repeated request with the original result instead of applying it twice.
- Commit every record a transaction touches (tasks, dependencies, assignments, calendars) atomically, for `changes` and `restore` alike, and return the whole normalised document with its new version. The client replaces its accepted state with what you return, so server-assigned IDs and recalculated dates must be consistent within it.

Without these guarantees a retry after a lost response can apply a change twice. The demo's `examples/adapters/transactionStore.ts` simulates such a server, including rejection, conflicts and lost responses.

### Batches, row moves and other proposals

Treat a Gantt `edits` batch as one transaction: apply every change or none, and commit it as one history entry. Row moves arrive as `change.row.after`. Dependency `connect`, `reconnect` and `dependency-delete` events are proposals as well; assign dependency IDs in the application or on the server, and check for cycles there if your scheduling rules forbid them. A `reconnect` of a dependency with a `lag` carries the lag in `before` and `after`, so `{ ...dependency, ...change.after }` keeps it; change a lag through your own UI and commit it like any other edit.

`progress-edit` and `bars-delete` follow the same pattern. Accept a progress proposal by setting the bar's `progress` to `change.after`. Accept a deletion with `removeTimelineBars`, which also drops the dependencies that touch the removed bars, and commit both arrays as one history entry so that undo restores the bars and their links together:

```ts
function deleteBars(ids: string[]) {
  const next = removeTimelineBars(history.state.value.bars, history.state.value.dependencies, ids)
  history.commit(next)
}
```

Accept a `create` proposal by adding a bar with an ID and label of your choice at `proposal.start`–`proposal.end` in `proposal.rowId` (and `proposal.lane` when you use lanes), again as one history entry. When new bars may overlap others, pass the bars through `assignLanes(bars, { keepLanes: true })` and give the chart its `laneCount` with a `rowHeight` of at least 8 + laneCount × 14. With `cascade`, an accepted move arrives as an `edits` batch that lists the bars the user moved first and the cascaded bars after them; apply it like any batch, or recompute the plan from the moved bars when the cascaded dates come from your scheduler.

Accept a `row-move` proposal with `moveTimelineRow(rows, change.id, change.after)` and commit the new rows with the bars and dependencies as one history entry, so that undo restores the previous hierarchy. `timelineWbsCodes(rows)` numbers the rows for a WBS column.

Accept a `column-resize` proposal by setting the column's `width`, or `labelWidth` when `change.id` is `timelineLabelColumnId`. Widths are view settings: keep them in the same history as the data when Undo should restore them, as the timeline editing demo does, or store them per user.

To import a plan from CSV, read the file in the browser (`await file.text()`) or on a server, then call `timelineFromCsvTable(parseCsv(text), { parseTime })` and commit the returned rows and bars as one history entry. The importer assigns its own row and bar IDs, so map them to your records or keep a lookup by label when you merge an import into existing data. Catch its errors and show the message, which names the CSV line.

A Microsoft Project XML file (MSPDI, "Save as XML") imports the same way: `fromMsProjectXml(text, { utcOffsetMinutes })` returns the tasks, links and `warnings` about what could not be imported, and `timelineFromMsProject(project)` turns them into rows, bars and dependencies to commit as one history entry. Row and bar IDs are the file's task UIDs, summary tasks become parent rows without bars, and links to summary tasks are listed in `hiddenDependencyIds`, or, with `timelineFromMsProject(project, { summaryDependencies: true })`, kept in `dependencies` for a chart with `show-summaries` and `summary-dependencies`. Show the warnings next to the result; malformed XML throws an Error that names the line and column. The result also carries the file's calendars, resources and assignments when it has them: `workCalendarsFromMsProject` and `resourceLoadFromMsProject` turn them into the inputs of `scheduleTasks`, `levelResources`, `calculateResourceLoad` and `projectResourceTimeline`, and `timelineFromMsProject` exposes the resources and assignments for a resource timeline directly.

An iCalendar file imports with `fromICalendar(text, { utcOffsetMinutes })` and `timelineFromICalendar(events)`. Time zones that `Intl` knows are applied, recurring events are imported once with a warning, and the warnings list what was skipped; show them next to the result.

The `context-menu` event only reports what was targeted, the time and row under the pointer and the client coordinates. Render your own menu there (for example `role="menu"` with `role="menuitem"` entries), move focus into it, close it on Escape and return focus to the element that had it. Menu actions can reuse the same accept functions as the keyboard proposals.

## Alternative time scales

A TimeScale exposes width, toX(time) and toTime(x). It must map range.start to 0 and range.end to width, be finite and strictly increasing, and provide mutually inverse mappings over the range. It should also extrapolate beyond the range when tick or interval calculations require it. The Gantt component applies zoom to that mapping and uses its inverse for pointer displacement.

For example, a piecewise scale can give working hours more visual space while retaining a small positive width for other hours. A fully collapsed interval is not invertible and needs a separately defined editing policy. For calendar generation and work-duration scheduling, call `buildWorkPeriods` and `scheduleTasks` from `vue-weave/core`, then pass accepted intervals to the chart. `buildWorkPeriods` uses a fixed UTC offset or, with `timeZone`, an IANA zone including its daylight-saving transitions. The chart does not invoke the scheduler automatically. See [Scheduling and resource load](scheduling.md).

## Reusing calculations

Use the core entry in a worker or server to compute layouts, transform times or validate input. NetworkGraph's `layout` callback is synchronous. For an asynchronously computed layout, use `useAsyncGraphLayout` (see [Asynchronous layouts and preserved routes](#asynchronous-layouts-and-preserved-routes)), or store the result in application state yourself and supply a synchronous callback that returns it. Either way, update data and matching geometry together.

Geometry types use Maps. Convert them to entries arrays when serializing them across JSON boundaries, then reconstruct Maps at the consuming side.

## Linking views

To show one plan as a graph, a Gantt chart and load rows that follow each other, bind your entities to what each view draws and let `useLinkedSelection` work out what every view shows. The view the user acts in keeps the selection; the others only highlight, so a linked bar is never deleted, moved or used to cancel a drag in another view.

```vue
<script setup lang="ts">
import { computed, useTemplateRef } from 'vue'
import { GanttChart, NetworkGraph, revealLinkedTarget, useLinkedSelection, type ViewBinding, type ViewTargetEvent } from 'vue-weave'

const bindings = computed<ViewBinding[]>(() => tasks.value.flatMap(task => [
  { entity: { kind: 'task', id: task.id }, target: { view: 'graph', kind: 'node', id: task.id } },
  { entity: { kind: 'task', id: task.id }, target: { view: 'timeline', kind: 'bar', id: task.id } },
  ...task.resourceId ? [{ entity: { kind: 'task', id: task.id }, target: { view: 'load', resourceId: task.resourceId, start: task.start, end: task.end } } as ViewBinding] : [],
]))
const linked = useLinkedSelection({ bindings })
const graph = useTemplateRef('graph')

// Only `target-activate` selects; the components' own `select` events are left unconnected, so one click is handled once.
const activate = (event: ViewTargetEvent) => linked.select(event.target.view, [event.target])
const enter = (event: ViewTargetEvent) => linked.hoverEnter(event.target.view, event.target)
const leave = (event: ViewTargetEvent) => linked.hoverLeave(event.target.view, event.target)

async function showInGraph(nodeId: string) {
  const result = await revealLinkedTarget({
    reveal: () => graph.value?.revealNode(nodeId, { focus: true }),
    expand: groupId => {
      collapsed.value = new Set([...collapsed.value].filter(id => id !== groupId))
      return true // return false to keep the group collapsed; the result is then not 'revealed'
    },
  })
  if (result.status !== 'revealed') explain(result) // unknown, or still hidden in a collapsed group
}
</script>

<template>
  <NetworkGraph ref="graph" :nodes="nodes" :edges="edges" :groups="groups" :collapsed-group-ids="collapsed"
    :selected-ids="linked.graph.value.selectedNodeIds" :highlighted-node-ids="linked.graph.value.highlightedNodeIds"
    :highlighted-edge-ids="linked.graph.value.highlightedEdgeIds"
    @target-activate="activate" @target-enter="enter" @target-leave="leave" />
  <GanttChart :rows="rows" :bars="bars" :range="range" :load-rows="loadRows" :load-segments="loadSegments" load-selectable
    multi-select :selected-ids="linked.timeline.value.selectedBarIds" :highlighted-bar-ids="linked.timeline.value.highlightedBarIds"
    :selected-load-targets="linked.load.value.selected" :highlighted-load-targets="linked.load.value.highlighted"
    @target-activate="activate" @target-enter="enter" @target-leave="leave" />
</template>
```

- IDs are paired with their kind and view, so a task `A` and a resource `A` never mix. One entity may have several targets (a task shown as two nodes or two resource bars) and one target several entities.
- Load segments have no ID and change when load is recalculated. Bind load as resource time ranges; the chart marks the segments that overlap them, and `resolveLoadTargets` tells you which current segments a stored range still touches (a range that touches none is reported as unknown, never moved to another segment).
- Hover never scrolls. Move to an item only on an explicit action, with `revealNode`, `revealBar` or `revealLinkedTarget`. A hidden item is reported as `hidden-by-collapse` with its visible proxy; expanding is the application's decision and requires the controlled `collapsedGroupIds` or `collapsedIds`. Filters are your own: when your filter hides an item, say so in your UI and offer to clear it.
- For impact analysis, `traverseGraph(graph, startIds, { direction, maxHops })` returns the node and edge IDs reached, and `resolveCollapsedTargets` maps IDs of the full graph to the proxies and merged edges shown while groups are collapsed (call `collapseGraphGroups` with the same input as the graph).
- Planning diagnostics carry `EntityRef` targets, so a diagnostic list can select or reveal its tasks and resources through the same bindings. The reference list, inspector, diagnostics panel and context toolbar of the demo are in `examples/components/`; they are examples to copy and adapt, not part of the package.

## Search, sort and saved views

Keep the source rows, bars and dependencies as they are and render the output of `projectTimelineView` or `useTimelineView(...).projection`. A search keeps each matching row with its ancestors, because a row array without a row's parent is invalid. Dependencies to hidden bars are removed from the displayed array; show `removedDependencyCount` and use `hiddenTargets` to offer a way to reveal the hidden bar. Sorting reorders siblings only. It does not change the business order or the WBS codes, which come from the original rows. Turn a sort into a permanent order with a separate row move. Run scheduling, load and diagnostics on the full input.

To save a view, store `snapshot()` (or any `TimelineViewState`) as JSON, for example in the application's snapshot. Register sort rules and zoom presets in code and save only their IDs. When restoring, call `parseTimelineViewState`, then read `diagnostics` for dropped columns or rules and for columns added since the save. Pass `projection.collapsedIds` and `projection.window` to the chart yourself; the view state does not change the chart.

For typed editing, give a column a `field` spec. A `time` field needs an explicit `timeZone`, `utcOffsetMinutes` or caller-supplied `parse` and `format`, and a `duration` field states whether it is elapsed or working time and its `unitSize`. Pass the text from an editor to `parseFieldValue` and propose the resulting value to the parent. Do not store an empty or invalid input as text. In GanttChart, a column with `field` emits `field-edit` instead of `cell-edit`: listen to `field-edit`, check it in `validateFieldEdit` and apply `change.after` to your row. Provide your own editor through the `cell-editor` slot (call `commit(value)` or `commitText(text)` and `cancel()`), or leave the slot out to use the built-in text input, which parses with the field. A `cell` slot still owns the whole cell.

## Use ELK.js for layout

The built-in layouts (`layoutLayeredGraph`, `layoutTreeGraph`, `layoutRadialGraph`, `layoutCircularGraph`, `layoutGridGraph`, `layoutConcentricGraph` and `layoutForceGraph`) are synchronous, have no dependencies and cover flows, trees and organic graphs of up to a few thousand nodes. Prefer them unless you need what a full layout engine adds: node sizes that vary a lot, many ports with ordering constraints, labels placed without overlaps, compound graphs or orthogonal routes that avoid nodes and each other (the opt-in `avoidNodes` prop routes orthogonal edges around node boxes, but each edge on its own). Then an application can install [ELK.js](https://github.com/kieler/elkjs) (`npm install elkjs`) itself and turn its output into a `GraphLayout`. vue-weave does not depend on ELK; the code below lives in your application.

ELK lays out asynchronously, and NetworkGraph's `layout` prop is synchronous. Compute the layout in the application (in a worker, with ELK's `workerUrl`, for large graphs), then pass the nodes, the edges and a `layout` function that returns the cached result together, so that the chart never sees data without matching geometry.

```ts
import ELK from 'elkjs/lib/elk.bundled.js'
import type { ElkExtendedEdge, ElkNode, ElkPoint } from 'elkjs/lib/elk-api'
import { shallowRef, watch, type Ref } from 'vue'
import { graphPortAnchor, type GraphBox, type GraphEdge, type GraphLayout, type GraphLayoutFunction, type NetworkNode } from 'vue-weave'

const elk = new ELK()
const nodeWidth = 144, nodeHeight = 58
const elkSide = { left: 'WEST', right: 'EAST', top: 'NORTH', bottom: 'SOUTH' } as const
const elkPortId = (nodeId: string, portId: string) => nodeId + '\u0000' + portId

function toElkGraph(nodes: readonly NetworkNode[], edges: readonly GraphEdge[]): ElkNode {
  return {
    id: 'root',
    layoutOptions: {
      'org.eclipse.elk.algorithm': 'layered',
      'org.eclipse.elk.direction': 'RIGHT',
      'org.eclipse.elk.edgeRouting': 'ORTHOGONAL',
      'org.eclipse.elk.spacing.nodeNode': '24',
      'org.eclipse.elk.layered.spacing.nodeNodeBetweenLayers': '50',
      'org.eclipse.elk.padding': '[top=20,left=20,bottom=20,right=20]',
    },
    children: nodes.map(node => ({
      id: node.id,
      width: nodeWidth,
      height: nodeHeight,
      // Fixed ports at the anchors NetworkGraph draws (side and offset), so ELK places the nodes for them.
      layoutOptions: node.ports?.length ? { 'org.eclipse.elk.portConstraints': 'FIXED_POS' } : undefined,
      ports: node.ports?.map(port => {
        const anchor = graphPortAnchor({ x: 0, y: 0, width: nodeWidth, height: nodeHeight, rank: 0 }, port)
        return {
          id: elkPortId(node.id, port.id), x: anchor.x, y: anchor.y, width: 0, height: 0,
          layoutOptions: { 'org.eclipse.elk.port.side': elkSide[port.side] },
        }
      }),
    })),
    edges: edges.map(edge => ({
      id: edge.id,
      sources: [edge.fromPort === undefined ? edge.from : elkPortId(edge.from, edge.fromPort)],
      targets: [edge.toPort === undefined ? edge.to : elkPortId(edge.to, edge.toPort)],
      labels: edge.label ? [{ text: edge.label, width: edge.label.length * 7, height: 14 }] : undefined,
    })),
  }
}

/** An SVG path through the start, bend and end points of each orthogonal edge section. */
function sectionPath(edge: ElkExtendedEdge) {
  return (edge.sections ?? []).map(section => [section.startPoint, ...(section.bendPoints ?? []), section.endPoint]
    .map((point: ElkPoint, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' ')).join(' ')
}

function fromElkGraph(graph: ElkNode): GraphLayout {
  const children = graph.children ?? []
  // ELK reports no layer index; number the distinct x positions of the left-to-right layers instead.
  const layers = [...new Set(children.map(child => child.x ?? 0))].sort((a, b) => a - b)
  const boxes = new Map<string, GraphBox>(children.map(child => [child.id, {
    x: child.x ?? 0, y: child.y ?? 0, width: child.width ?? nodeWidth, height: child.height ?? nodeHeight,
    rank: layers.indexOf(child.x ?? 0),
  }]))
  const paths = new Map<string, string>()
  const edgeLabels = new Map<string, { x: number; y: number }>()
  for (const edge of graph.edges ?? []) {
    paths.set(edge.id, sectionPath(edge))
    const label = edge.labels?.[0]
    if (label?.x !== undefined && label.y !== undefined) {
      edgeLabels.set(edge.id, { x: label.x + (label.width ?? 0) / 2, y: label.y + (label.height ?? 0) / 2 })
    }
  }
  return { boxes, paths, edgeLabels, width: Math.max(1, graph.width ?? 1), height: Math.max(1, graph.height ?? 1) }
}

/** Nodes, edges and a synchronous layout that always belong together; undefined until the first layout finishes. */
export function useElkLayout(nodes: Ref<readonly NetworkNode[]>, edges: Ref<readonly GraphEdge[]>) {
  const view = shallowRef<{ nodes: readonly NetworkNode[]; edges: readonly GraphEdge[]; layout: GraphLayoutFunction }>()
  watch([nodes, edges], async ([currentNodes, currentEdges], _previous, onCleanup) => {
    let stale = false
    onCleanup(() => { stale = true })
    const result = fromElkGraph(await elk.layout(toElkGraph(currentNodes, currentEdges)))
    // A newer change may have started another layout while this one ran.
    if (!stale) view.value = { nodes: currentNodes, edges: currentEdges, layout: () => result }
  }, { immediate: true })
  return view
}
```

```vue
<NetworkGraph v-if="view" :nodes="view.nodes" :edges="view.edges" :layout="view.layout" />
```

Notes:

- The edge coordinates above are those of the root graph, which holds every node and edge of a flat graph. For compound graphs (`children` inside children), ELK reports positions relative to each parent; add the parent offsets, or set `org.eclipse.elk.json.edgeCoords` to `ROOT` and `org.eclipse.elk.json.shapeCoords` to `ROOT`.
- NetworkGraph checks the result: every node needs a box with a positive size and every edge a path, and `width` and `height` must be positive. Give ELK the sizes you render, for example from the `sizes` prop.
- With the default `routingPolicy` (`'builtin'`), keep the default `edgeStyle` (`curve`) to draw ELK's routes: `orthogonal` and `straight` reroute every edge with the built-in router, and edges with a `fromPort` or `toPort` are redrawn from their port anchors (`routeGraphPorts`), so ELK's sections are used for edges without named ports, while the ports still shape where ELK places the nodes. Set `routing-policy="preserve"` to keep ELK's sections for every edge, port edges and the orthogonal and straight styles included, while they still end at their ports and boxes; return `routes` metadata to have the ends checked against the ports and sides (see [Preserving external routes](#preserving-external-routes)). With either policy, saved `positions` and `sizes` move or resize nodes after the layout and reroute only the edges of those nodes.
- With `collapsedGroupIds`, NetworkGraph calls `layout` with the collapsed view (proxy nodes and merged edges) and with the expanded graph; a cached result covers only the graph it was computed for. Lay out both, or use the built-in layouts for collapsible groups.
- `org.eclipse.elk.direction` `DOWN`, `LEFT` or `UP` correspond to `TB`, `RL` and `BT`; number the layers by `y` for vertical directions.

## Export to SVG and PNG

Call `exportSvg` or `exportPng` on a component ref to save the whole chart, independent of scrolling, zoom or culling. The SVG is a standalone document string; the PNG is rasterized in the browser at the `scale` you pass.

```ts
const svg = timeline.value!.exportSvg({ title: 'Production plan' })
const png = await timeline.value!.exportPng({ scale: window.devicePixelRatio })
const url = URL.createObjectURL(png)
Object.assign(document.createElement('a'), { href: url, download: 'plan.png' }).click()
URL.revokeObjectURL(url)
```

The export reads the `--vw-*` colours and the font in effect on the component, so a theme applies automatically; pass `theme` to override individual colours, for example a light theme for printing from a dark UI. The default rendering is exported: slot content is not, so pass `barLabel`, `rowLabel`, `rowHeading`, `nodeLabel`, `nodeDetail` or `edgeLabel` when your slots change text. Fonts are not embedded; a viewer without the font uses a fallback.

To render on a server or in a worker, call `renderGraphSvg` or `renderTimelineSvg` from `vue-weave/core` with the same data, a layout or `TimeScale` and an explicit theme. Large charts produce large SVG strings. For PNG, `width × scale` and `height × scale` must stay within 16,384 pixels per side and 268,435,456 pixels in total; export a `timeRange` or `rowRange` slice, or lower `scale`, for bigger charts.

## Right-to-left languages

Set `dir="rtl"` on a component for a right-to-left interface, or `dir="auto"` to follow the direction inherited from the page (for example `<html dir="rtl">`). The default `ltr` leaves rendering unchanged; in a right-to-left page it keeps the inherited direction, which the timeline does not support, so pass `rtl` or `auto` there.

```vue
<GanttChart dir="rtl" :rows="rows" :bars="bars" :range="range" :format-time="formatTime" @edit="apply" />
```

The timeline then runs from right to left and its row headings sit on the right. Edit proposals keep the same times and units, so validation and persistence code needs no change. Arrow keys follow the screen: ArrowLeft makes a bar later. Translate the edit hint through `labels.editHint` to describe this to screen reader users. `auto` is resolved after mounting, so server-rendered markup is left-to-right until hydration; use an explicit `rtl` for server rendering.

`auto` reads the inherited direction at mount, when the `dir` prop changes and when the `dir` attribute of an ancestor changes, for example when the user switches language at runtime and the application sets `<html dir>`. A `MutationObserver` on the ancestors' `dir` attributes does this while `dir` is `auto` and is disconnected on unmount. A change of direction cancels a gesture in flight; GanttChart also keeps the time at the inline-start edge in view. A direction set only through the CSS `direction` property, a class or a stylesheet change is not observed: bind `dir` to your language state, or re-key the component (`:key="locale"`), in that case.

The right-to-left rules are scoped to the `vw-rtl` class and use CSS logical properties. Custom slot content inherits `direction: rtl`. For NetworkGraph, `dir` only moves the controls and right-aligns labels; choose `options.direction: 'RL'` to lay out ranks from right to left.

## Saving and restoring a view

Use a snapshot to persist a chart's data and saved view as JSON (see "Versioned JSON snapshots" in [api.md](api.md)).

```ts
import { parseWeaveSnapshot, restoreWeaveSnapshot, serializeWeaveSnapshot } from 'vue-weave/core'

// Save. Pass savedAt yourself; the same input and metadata give the same text.
const text = serializeWeaveSnapshot({
  kind: 'graph',
  metadata: { title: 'Order flow', savedAt: new Date().toISOString() },
  data: { nodes, edges, groups, positions, sizes }, // positions and sizes are Maps
  view: { graph: { camera: { center, scale }, collapsedGroupIds } },
}, { codecs: [dateCodec], space: 2 })

// Restore. Nothing is applied until the whole snapshot is valid.
const parsed = parseWeaveSnapshot(text)
if (!parsed.ok) return showErrors(parsed.diagnostics)
const restored = restoreWeaveSnapshot(parsed.snapshot, { codecs: [dateCodec], layouts })
if (!restored.ok) return showErrors(restored.diagnostics) // the screen is unchanged
```

The restore procedure for a graph is: accept the restored `nodes`, `edges`, `groups`, `positions`, `sizes` and `view.collapsedGroupIds` into your state (`positions` and `sizes` are `Map` props, `collapsedGroupIds` is a `Set`), wait for the update with `nextTick`, then restore the camera. Replacing every node makes the chart fit itself to the new content, so a camera set earlier would be overwritten. In short: update nodes, `await nextTick()`, restore camera.

The camera is stored as the graph point at the viewport center plus the scale, so the same snapshot looks the same in a container of any size. Read it with `getViewportCenter()` and `getViewport().scale`, and restore it with `setViewportCenter(view.camera.center, view.camera.scale)` after the `nextTick` above:

```ts
const snapshot = restored.snapshot // kind 'graph'
nodes.value = snapshot.nodes
edges.value = snapshot.edges
positions.value = snapshot.positions
collapsed.value = snapshot.view?.collapsedGroupIds ?? new Set()
await nextTick()
const camera = snapshot.view?.camera
if (camera) graph.value?.setViewportCenter(camera.center, camera.scale)
```

Functions are never stored. Columns, layouts, sort comparators, editors and renderers are saved by name and resolved on restore from the registry you pass to `restoreWeaveSnapshot`: `{ codecs, layouts, columns, editors, renderers, comparators, onMissing }`. `columns` maps a column ID (or the saved `registryId`) to its label, `value` and other functions, `layouts` maps a layout ID to a factory that receives the saved options. A name that is not registered fails the restore, unless `onMissing: 'fallback'` turns it into a warning and the default display; a missing codec always fails. Keep registries in code and version them with your application, and record a codec `version` when its encoding changes.

For a timeline or planning snapshot, pass `restored.rows` and `restored.bars` (or `restored.input` and `restored.schedule`) to your state first, then apply `view.window`, `view.collapsedRowIds` and the resolved `view.columns`. Reading a file never saves to a server by itself. To apply it to server data, fetch the server's current version and save the restored data as one change; `metadata.sourceVersion` is not that version.

## Asynchronous layouts and preserved routes

`NetworkGraph`'s `layout` prop stays synchronous. To compute layouts in a Worker or another asynchronous engine, use `useAsyncGraphLayout` and bind the frame it displays. The composable keeps the *desired* frame (the latest input, being computed) apart from the *display* frame (the last input whose layouts are all ready). Bind every field of `display` together, so new nodes are never drawn with old geometry, and pass the returned `layout` function, whose identity never changes, so a new result does not re-fit the camera:

```vue
<script setup lang="ts">
import { computed, onBeforeUnmount } from 'vue'
import { NetworkGraph, graphLayoutWorkerAdapter, layoutLayeredGraph, useAsyncGraphLayout } from 'vue-weave'

const worker = typeof Worker === 'undefined' ? undefined : new Worker(new URL('./graphLayout.worker.ts', import.meta.url), { type: 'module' })
const graph = useAsyncGraphLayout({
  input: () => ({ nodes: nodes.value, edges: edges.value, groups, collapsedGroupIds: collapsed.value }),
  adapter: worker ? graphLayoutWorkerAdapter(worker) : () => Promise.reject(new Error('Workers are not available')),
  initialLayout: (shownNodes, shownEdges) => layoutLayeredGraph(shownNodes, shownEdges),
})
onBeforeUnmount(() => worker?.terminate())
// `initialLayout` makes the first frame synchronous, so `display` is always set here.
const frame = computed(() => graph.display.value!)
</script>

<template>
  <NetworkGraph :nodes="frame.nodes" :edges="frame.edges" :groups="frame.groups"
    :collapsed-group-ids="frame.collapsedGroupIds" :layout="graph.layout" v-bind="graph.gestureListeners" />
</template>
```

- Requests start when the component mounts, so nothing runs during server rendering. With `initialLayout` the server and the first client render show the same synchronous layout; without it `display` is undefined until the first result, so render a loading state in both.
- Use the controlled `collapsedGroupIds` prop with the frame's value. With collapsed groups NetworkGraph lays out two inputs (the full graph, to place proxies, and the collapsed view); a frame is shown only when both layouts are ready. Uncontrolled `collapsibleGroups` would ask for a layout that has not been computed.
- Every request carries a `requestId` and an `inputKey`. Only results for the current input are shown, whatever order they arrive in; results of cancelled or disposed requests are discarded. The key covers edges, ports, sizes and labels, not just node IDs; bump `revision` when node `data` or engine settings outside `settings` change the layout.
- A finished frame waits while a gesture is in flight, so an ongoing drag is not cancelled; it is shown when the gesture ends. NetworkGraph reports every gesture a new layout would cancel through `gesture-start` and `gesture-end` (node drags, resize and waypoint drags, connections from arming to completion, box selection, pan and pinch), one end for every start and after the proposal, so the graph has emitted its `node-move` before the waiting frame is shown. `v-bind="graph.gestureListeners"` connects those events to the composable; `graph.gesturing` tells whether frames are being held. Your own `@gesture-start` and `@gesture-end` listeners can sit next to it. For gestures the application tracks itself (a drag in another component that edits the same data, for example), pass a boolean ref or getter as the `gesture` option; frames wait while either is active.
- A failure keeps the last display and sets `error` with the revision and input key that failed. With the default `provisional: true` that display can be the provisional frame of the failed input (`display.source === 'provisional'`): consistent, with the previous boxes and temporary routes for the new edges. Show that the routes are temporary, or set `provisional: false` to keep the last frame the engine produced.
- When only edges change (for example after a `connect` is accepted), the frame is shown at once with the previous boxes and temporary routes from `completeGraphLayout` (`source: 'provisional'`, `temporaryEdgeIds`) until the engine answers.

A Worker receives `{ type: 'request', request }` and answers `{ type: 'success', requestId, inputKey, scope, layout }` or `{ type: 'failure', requestId, inputKey, scope, message }`; `{ type: 'cancel', requestId, inputKey }` asks it to stop. Check incoming messages with `parseGraphLayoutMessage` (structured clone keeps the Maps), or, when messages travel as JSON text, convert with `graphLayoutMessageToJson` and read with `graphLayoutMessageFromJson`, which turn each Map into an array of entries and back. Pass `positions` and `sizes` in the input only when the engine honours them; they are then part of the input key. An engine that cannot place fixed nodes should fail the request with a message saying so rather than ignore them.

### Preserving external routes

`routeGraphPorts` and `routeGraphEdges` take `policy: 'preserve'`. With it, a path the layout drew is kept, in every edge style and also for edges with named ports, while both ends still fit: at the port anchor for a named port, otherwise on the box border. A layout can return route metadata in `layout.routes` (start and end points, ports, the sides a route leaves and enters, bend points); it is then checked as well, and it is carried through `applyGraphPositions`, `applyGraphSizes`, `routeGraphPorts` and `routeGraphEdges`. Only these edges fall back to built-in routing: edges with `points` (explicit waypoints win), edges of a node that `positions` or `sizes` moved or resized, edges whose port or metadata no longer fits, and temporary routes. Note that with `preserve`, edges with named ports are no longer always rerouted. The default `'builtin'` policy is unchanged.

NetworkGraph applies the policy with its `routingPolicy` prop:

```vue
<NetworkGraph :nodes="frame.nodes" :edges="frame.edges" :layout="graph.layout" routing-policy="preserve" edge-style="orthogonal" />
```

A node drag keeps updating only the dragged nodes' edges and draws the same routes the committed move produces. A connection accepted before the engine answers is drawn with a temporary route (`completeGraphLayout`) instead of failing with `Missing layout path`, and is routed again when the new layout arrives. A new layout object with the same geometry for the same inputs does not cancel a drag in flight; a layout whose geometry changed still does, so bind `gestureListeners` from `useAsyncGraphLayout` to hold results until the gesture ends.

Direct core users get the routed layout that NetworkGraph draws, and that `renderGraphSvg` should receive, by running the same steps:

```ts
import { applyGraphPositions, applyGraphSizes, renderGraphSvg, routeGraphEdges, routeGraphPorts } from 'vue-weave/core'

const nodesById = new Map(nodes.map(node => [node.id, node]))
const placed = applyGraphSizes(applyGraphPositions(layout, edges, positions, direction), edges, sizes, direction)
const ported = routeGraphPorts(placed, nodesById, edges, direction, { policy: 'preserve' })
const routed = routeGraphEdges(ported, edges, nodesById, { style: 'orthogonal', direction, policy: 'preserve' })
const svg = renderGraphSvg(routed, nodes, edges, { theme })
```

`renderGraphSvg` draws the paths it is given, so the export matches the screen without any routing option of its own.
