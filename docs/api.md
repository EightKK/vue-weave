# Public API

Identifiers are nonempty strings and must be unique within their corresponding collection. Named port IDs are scoped to each node. Labels are rendered as Vue text. Escape/sanitize any HTML you supply in custom slots according to your application's trust boundaries.

The package is ESM-only. Import Vue components and shared types from `vue-weave`, headless calculations from `vue-weave/core`, and the stylesheet from `vue-weave/style.css`. Declarations support TypeScript's `Bundler` and `NodeNext` resolution. The core entry does not require Vue or browser globals at runtime. Node.js 22.18+ is the declared runtime baseline; Vue components require the Vue 3.5+ peer dependency.

The stylesheet also ships opt-in `vft-theme-dark` and `vft-theme-auto` classes and forced-colors, reduced-motion and print rules; see docs/integration.md.

## NetworkGraph

| Prop | Type / default | Meaning |
| --- | --- | --- |
| nodes | readonly NetworkNode[] / required | ID, label, optional detail, tone, shape and opaque data |
| edges | readonly GraphEdge[] / required | ID, from/to node IDs, optional label and data |
| selectedId | string / undefined | Controlled selection; also supports v-model:selected-id |
| relatedIds | ReadonlySet<string> / undefined | Emphasizes included nodes and edges joining two included nodes |
| options | GraphLayoutOptions / defaults below | Built-in layout configuration |
| layout | GraphLayoutFunction / undefined | Overrides built-in layout |
| labels | Partial<GraphLabels> / English | Region, empty, zoom, zoomIn, zoomOut and fit |
| height | number or CSS string / 220px | SVG viewport height |
| showControls | boolean / true | Zoom/fit buttons |

GraphLayoutOptions defaults are direction LR, nodeWidth 144, nodeHeight 58, columnGap 50, rowGap 24 and padding 20. Sizes must be positive; spacing must be nonnegative. Empty graphs keep positive layout dimensions even with zero padding. TB changes the layout direction while preserving each node's physical width and height.

NetworkNode has id, label, optional detail, tone (teal/blue/amber/violet), shape (box/rounded) and data (unknown). GraphEdge has id, from, to, optional label and data. The default renderer clips long text to the node box; its title exposes the full label. Node slots own their clipping and sizing.

A custom layout returns GraphLayout containing boxes, paths and edgeLabels Maps plus positive finite width and height. Each node box has x, y, width, height and rank. Each edge needs an SVG path. Labels are optional map entries. Coordinates are chart-local pixels. Keep paths and boxes within the supplied bounds for accurate fit-to-view.

Events are select(id), update:selectedId(id), and viewport-change({x,y,scale}). The last event reports pan/zoom/fit changes. Exposed methods are fit(), zoom(factor, optionalX, optionalY), getViewport() and setViewport({x,y,scale}). Viewport scale is clamped by zoom, and setViewport requires 0.1–3. Slots are node({node,box,selected}), edge({edge,path,selected}) and empty. SVG slots must contain SVG elements.

A narrow viewport initially focuses around the selected node at a readable scale. Fit-to-view explicitly shows the full graph. Pointer dragging pans the background. Ctrl+wheel zooms around the cursor. Arrow keys pan a focused SVG. Enter/Space select a focused node. Optional node movement and connection proposals are described in [Graph editing and minimap](#graph-editing-and-minimap).

### Graph editing and minimap

| API | Behavior |
| --- | --- |
| draggable | Enables dragging and arrow-key movement. A node can opt out with draggable false. |
| positions | ReadonlyMap of node ID to absolute GraphPoint in chart coordinates. Saved positions must be finite and nonnegative. |
| node-move(change) | GraphNodeMove carries id, before and after. Update positions to accept the proposal. |
| connectable | Shows the node ports or a default handle. Drag between handles, or activate two handles with click, tap, Enter or Space. |
| validateConnection | Synchronous callback accepting true or undefined, rejecting with false or a reason string. |
| connect(connection) | Emits from and to. The caller assigns an edge ID and updates edges. |
| connect-rejected(connection, reason) | Reports rejected proposals. |
| selectedIds / update:selectedIds | Controlled multiple selection when a set is supplied. Ctrl, Meta or Shift toggles membership. A plain selection replaces the set. |
| showMinimap | Shows graph geometry and the current viewport. Click to center on a point. Arrow keys pan. |

Editing and the minimap are opt-in. The select and update:selectedId events fire for node selection, including when selectedIds is supplied. A selected node moves with the other selected movable nodes. Escape or a new layout discards an in-flight preview. Keyboard movement uses ten chart units per arrow press and forty with Shift. Update positions with a fresh map when accepting a move. The built-in overlay reroutes incident edges as curves and preserves other paths. A custom router can own absolute positions by supplying a layout function without the positions overlay.

The optional GraphLabels fields minimap, connectFrom, connectTo, reconnectSource, reconnectTarget, moveGroup, groupWithin (default "within"), rejected (default "This connection was rejected.") and selectEdge (default "Select edge", followed by the edge label or ID) localize editor controls and announcements.

### Named ports, reconnection and group actions

| API | Behavior |
| --- | --- |
| NetworkNode.ports | Optional named ports with an ID, side, direction, offset and label. Side is left, right, top or bottom. Direction defaults to both. Offset defaults to 0.5 and measures down a vertical side or across a horizontal side. |
| GraphEdge.fromPort / toPort | Optional names scoped to the edge's source and target nodes. Named endpoints are validated. Unnamed edges keep their original routing. |
| reconnectable / reconnect(change) | Select an edge, then drag a source or target endpoint to a port. With the keyboard, select the edge and activate an endpoint and destination port. The proposal includes id, before and after. |
| validateConnection(connection, replacingEdgeId) | Receives the existing edge ID during reconnection. The application can exclude it when checking for duplicates. |
| boxSelect | Enables Shift-drag on the canvas. Partially intersecting nodes count. Add Ctrl or Meta to retain the previous selection. Use with controlled selectedIds. |
| groups | Groups with id, label, nodeIds and an optional parentId (see Nested groups). Direct members are disjoint. The bounds follow member nodes. Drag a group label or focus it and use arrow keys to move movable members together. |
| nodes-move(changes) | Emitted once when multiple nodes move. The node-move event covers single-node changes. |

The application accepts reconnection by replacing the corresponding edge. Preserve the edge ID and metadata and set both endpoint port fields from the proposal, including clearing a field when it is absent. Group and multi-selection movements preserve relative offsets among the movable nodes. Nodes with draggable false keep their positions. Groups use absolute positions; nesting is opt-in through parentId. The diagram editor expects different source and target nodes.

### Large graphs, touch gestures, nested groups and search

| API | Behavior |
| --- | --- |
| cullOffscreen | boolean / false. Renders only the nodes, edges, edge labels, connection handles and groups whose bounds intersect the viewport plus cullOverscan. Layout, box selection, keyboard panning and the minimap still use every node, so the minimap shows the whole graph. |
| cullOverscan | number / 200. Margin in screen pixels around the viewport that stays rendered, so a short pan does not reveal blank space. |
| matchIds | ReadonlySet<string> / undefined. When supplied, nodes outside the set are dimmed. An empty set dims every node. |
| dimmedIds | ReadonlySet<string> / undefined. Nodes to dim explicitly. Combines with matchIds. |
| focusNode(id, options?) | Exposed method. Centers the camera on the node and keeps the current scale, or applies options.scale (0.1 to 3). Throws Error for an unknown ID and RangeError for a bad scale. Emits viewport-change. It works with culling because culling follows the camera. |
| NetworkGroup.parentId | Optional ID of another group. The group is painted inside its parent and the parent bounds enclose it. |

Culling keeps these elements rendered even when they are off screen: selected nodes, the node or edge that has keyboard focus (and the node that owns a focused connection handle), nodes involved in a pointer drag or group drag, the source of a pending connection, the edge being reconnected and the groups that contain moved nodes. Elements that are culled are not in the DOM, so Tab skips them and they cannot be found by accessible name. Call focusNode(id) to bring one into view. Before mount there is no measured viewport. Server rendering and the first client render use the 1150 x 270 default viewport with the initial fit camera, so the output is deterministic and hydrates cleanly. The measured size replaces it after mount. Culling is based on bounding boxes: a path is bounded by its control points, and edge labels are included with a fixed reach, so culling errs on the side of rendering. Custom node and edge slots are not rendered for culled elements.

Two-finger gestures use Pointer Events with pointerType touch. When a second finger lands, any in-flight one-finger drag, connection, box selection or pan is cancelled without emitting a proposal. Pinching then scales around the midpoint, the scale is clamped to 0.1 to 3 like the zoom buttons, and moving both fingers together pans. Each change emits viewport-change. One-finger background pan, node drag, connecting and box selection behave as before, and plain wheel scrolling still passes through (Ctrl + wheel zooms). Lifting one finger ends the pinch; the remaining finger does nothing until it is lifted.

Nested groups are opt-in. Give a group parentId to place it in another group. nodeIds lists only the direct members, and a group that has child groups may have an empty nodeIds. A node can still belong to one group directly. Parents are painted first, in input order among siblings. The parent bounds enclose the child bounds, its label strip and a margin, and nested bounds can extend past the layout padding, so leave extra options.padding for deep nesting. Dragging a parent label (or using arrow keys on it) moves every descendant member as one node-move or nodes-move proposal. Dragging a child moves only its own members. A nested group is announced as "Move group Inner within Outer"; the within word is the optional GraphLabels.groupWithin label. The component throws Error for a duplicate ID, an unknown parentId, a parent cycle, an unknown or repeated member, or a group with no members after expansion. Groups without parentId behave as before.

The dimming hooks are presentation only. Dimmed nodes and the edges that touch them receive the vft-dimmed class and reduced opacity (--vft-dimmed-opacity, default 0.28). Selection, events and keyboard behavior do not change. The node and edge slots receive dimmed. Compute matches in your application; the component never filters data.

## GanttChart

| Prop | Type / default | Meaning |
| --- | --- | --- |
| rows | readonly TimelineRow[] / required | ID, label, optional detail and data |
| bars | readonly TimelineBar[] / required | ID, rowId, label, numeric start/end and optional attributes |
| range | TimeRange / required | Visible axis bounds; finite start < end |
| dependencies | readonly TimelineDependency[] / [] | ID, from/to bar IDs, optional FS/SS/FF/SF type |
| highlightedDependencyIds | ReadonlySet<string> / undefined | Highlight link IDs using --vft-dependency-highlight |
| selectedIds | ReadonlySet<string> / undefined | Controlled highlighted bars |
| pixelsPerUnit | number / 80 per hour in milliseconds | Base linear time scale |
| scale | TimeScale / undefined | Custom mapping before component zoom |
| tickSteps | readonly number[] / 30m, 1h, 2h, 4h, 24h | Positive ascending intervals in the same units as data |
| snap | number / 900000 | Edit displacement step; 15 minutes in milliseconds |
| minDuration | number / snap | Minimum duration for resizing |
| editBounds | TimeRange / range | Bounds for edit proposals |
| formatTime | (number) => string / UTC HH:mm | Tick labels and accessible bar labels |
| rowHeight | number / 66 | Fixed row height, at least 8 + laneCount × 14 |
| laneCount | integer / 1 | Lanes per row |
| height | number or CSS string / 316px | Scroll viewport height |
| readonly | boolean / false | Disables editing |
| validateEdit | EditValidator / undefined | Synchronous hook accepting or rejecting a proposal |
| labels | Partial<GanttLabels> / English | region, rows, empty, zoom, zoomIn, zoomOut, editHint, rejected |
| showControls | boolean / true | Zoom buttons |
| autoScroll | boolean / true | Scrolls the timeline horizontally while a pointer drag is held near the left or right edge of the viewport. Set false to disable |

TimelineBar adds lane (zero-based, default 0), tone, appearance (solid/outline), editable (default false), progress (0–1) and data (unknown). A zero-duration bar is a milestone. Equal start/end intervals can move; resize handles require duration >= minDuration. Intervals use half-open [start,end) visibility; a milestone exactly at the axis end is outside the displayed window.

Display bars may extend beyond the axis. Editing is enabled only for intervals contained in editBounds. With custom numeric units, supply matching pixelsPerUnit, tickSteps, snap and formatTime.

Dependencies connect explicit endpoints. FS means source finish to target start; SS start to start; FF finish to finish; SF start to finish. These paths visualize relationships. Your application can enforce scheduling constraints in validateEdit or an authoritative backend.

### Editing contract

select(id) reports a bar activated by click or keyboard (Enter/Space). It fires once per click, on release, including after a drag. validation-error(error) fires when rows (including missing parents and hierarchy cycles), bars, dependencies, range, scale, pixelsPerUnit, snap, minDuration, rowHeight, laneCount or tickSteps are invalid. The chart then renders its empty state instead of the invalid data, and the error is still rethrown inside the component so development builds surface it. A later valid update clears the state. edit(change) reports a proposal with the following shape.

```ts
interface TimelineEdit {
  id: string
  before: { start: number; end: number }
  after: { start: number; end: number }
  mode: 'move' | 'start' | 'end'
  source: 'pointer' | 'keyboard'
}
```

validateEdit returns true/undefined to accept, false for the default rejection message, or a string for a specific rejection message. Rejection emits edit-rejected(change, reason) and announces the message in a live region. The callback is synchronous. Perform asynchronous persistence in the edit listener. The component never mutates incoming bars.

Pointer cancellation, loss of capture and Escape discard the preview. Changes to source bars, rows, bounds or the coordinate system cancel an active drag. These props are watched by reference, so pass new arrays and objects instead of mutating them in place. While a drag is held near the horizontal edge of the viewport, the timeline scrolls and the preview follows the pointer (autoScroll). A focused bar stays rendered even when an edit moves it outside the visible window, and after a keyboard edit is applied the chart scrolls horizontally only if the bar's new range is outside the viewport. Selection does not change the source intervals. Arrow keys move focused editable intervals by snap; Shift changes the end; Alt changes the start. Move snapping uses displacement relative to the original interval, so an off-grid start retains its offset.

Slots are legend(), row-heading(), row({row,index}), bar({bar,range,selected}), tick({time,label}) and empty(). The bar slot is inside a button. Use noninteractive content inside it. Keep row and bar slot contents within the configured dimensions. Methods are scrollToTime(time), scrollToRow(rowId) and cancelEdit().

### Timeline planning overlays

| API | Behavior |
| --- | --- |
| TimelineRow.parentId | Optional existing row ID. The tree is rendered in preorder. Siblings follow input order. |
| collapsedIds / update:collapsedIds | Optional controlled set of collapsed row IDs. The component manages the set when the prop is omitted. |
| TimelineBar.baseline | Optional original start/end interval. Drawn below the bar and independent of edits to the main interval. |
| headerBands | Array of header levels, each with ordered non-overlapping intervals containing start, end and label. Levels appear above the default ticks. |
| markers | Array of unique IDs with finite time and label. Drawn as vertical markers in the visible time window. |

The row slot also receives depth and expanded. The row index refers to the expanded view. Links with hidden endpoints disappear while the group is collapsed. scrollToRow targets expanded rows. Any summary interval or progress can be supplied as a bar on the parent row. The optional GanttLabels fields expandRow, collapseRow and baseline localize these additions. CSS variables --vft-baseline and --vft-marker theme the overlays.

### Timeline columns and rollups

| API | Behavior |
| --- | --- |
| columns | Extra sticky columns described by id, label, width in pixels, value(row, summary) and optional editable. An editable predicate can limit editing to individual rows. |
| cell-edit(change) | Proposes rowId, columnId, before and after. The input supplies after as a string. The parent converts, validates and persists the value as needed. |
| validateCellEdit / cell-edit-rejected | Uses the same accept or reject convention as bar edits. Rejection retains the accepted cell value and reports the reason. |
| cell slot | Customize the cell using row, column, value and summary. A custom editor owns its interaction and persistence. |
| showSummaries | Draw an aggregated interval on a parent row without an explicit bar. Collapse hides descendants and preserves the parent rollup. |

Enter or blur submits a default editor and Escape discards the input. The chart-level readonly prop disables editing. Keep the sticky columns narrow enough to leave room for the timeline.

### Dependency editing

| API | Behavior |
| --- | --- |
| connectable | Shows a link handle at the start and finish of every rendered bar. Drag from one handle to another handle or onto a bar body (the nearer end is used). Alternatively, activate two handles with click, tap, Enter or Space. |
| reconnectable | Select a dependency, then drag its source or target endpoint handle to another bar end, or activate the endpoint handle and then a bar handle. |
| validateConnection(connection, replacingDependencyId?) | Synchronous TimelineConnectionValidator. Accepts with true or undefined, rejects with false (default message "This dependency was rejected.") or a reason string. During reconnection it receives the existing dependency ID. |
| connect(connection) | TimelineConnection with from, to and type. The type is derived from the joined ends: finish→start is FS, start→start SS, finish→finish FF and start→finish SF. The parent assigns an ID and updates dependencies. |
| reconnect(change) | TimelineReconnect with id, before and after connections. The parent replaces from, to and type on the existing dependency. |
| connect-rejected(connection, reason) | Reports a rejected proposal. The reason is announced in the live region. |
| selectedDependencyId / update:selectedDependencyId | Optional controlled dependency selection. The component tracks the selection locally when the prop is omitted. |
| dependency-select(id) | A dependency path was activated by click, Enter or Space. Dependency paths are focusable only when connectable or reconnectable is set. |
| dependency-delete(id) | Delete or Backspace was pressed on a focused dependency. The parent removes it from dependencies to accept. |

A bar cannot link to itself, and reconnecting a dependency to its existing endpoints proposes nothing. Escape, pointer cancellation and loss of capture discard a pending connection. Changes to bars, rows, dependencies, the coordinate system or the connectable and reconnectable props cancel an in-flight connection, including one armed from the keyboard. Handles are hidden when readonly is set.

### Multiple selection, batch moves and row moves

| API | Behavior |
| --- | --- |
| multiSelect | With selectedIds, a click emits update:selectedIds. Ctrl, Meta or Shift toggles membership; a plain click replaces the set. The select event still fires once per click. A click that ends a drag does not change the selection. |
| edits(changes) | Moving a selected bar by pointer or arrow key moves every selected editable bar by the same snapped displacement. The displacement is clamped so all intervals stay inside editBounds. Several changes are emitted once as TimelineEdit[]; a single change uses edit. Resizing applies only to the bar being handled. |
| validateEdits(changes) / edits-rejected(changes, reason) | Synchronous BatchEditValidator for the whole batch. Without it, each change runs through validateEdit and the first rejection rejects the batch. |
| rowDraggable | A move drag also proposes the displayed row under the pointer, and Up/Down arrows move a focused editable bar to the adjacent displayed row. The proposal carries `row: { before, after }`. Selected bars move rows together and stop at the first or last row. Rows hidden by a collapsed parent are not targets. |

The application accepts a row move by replacing the bar's rowId with change.row.after. Validate row changes in validateEdit or validateEdits, for example to keep work on a compatible resource. During a pointer row drag the bar is previewed with a vertical offset and stays in its source row element; the preview is discarded on cancellation like any other edit. After an accepted keyboard row move the chart scrolls the row into view and restores focus to the moved bar. GanttLabels.moveRowHint (default "Up and Down arrows move the bar to another row.") is added to the bar description when rowDraggable is set.

### Zoom presets, now marker and touch zoom

| API | Behavior |
| --- | --- |
| zoomPresets | TimelineZoomPreset[] with unique id, label, pixelsPerUnit and optional tickSteps, headerBands and snap. Renders a labelled button group (GanttLabels.zoomPresets, default "Zoom level"). The active preset replaces the corresponding props; omitted fields fall back to them. |
| zoomPreset / update:zoomPreset | Optional controlled preset ID. An unknown ID is reported through validation-error. Choosing a preset resets the zoom factor to 100% and keeps the centered time in view. |
| zoom-change(state) | TimelineZoomState with zoom factor and the active preset ID. Fires for zoom buttons, presets and pinch zoom. |
| showNow / now | Draws a "now" marker (GanttLabels.now). Supply now for deterministic and server-rendered output. Without now, the clock is read only after mounting and refreshed every 30 seconds, so server and client markup match. The marker appears only inside range. |
| pinchZoom | Two touch pointers on the timeline zoom the time axis around their midpoint, between 65% and 300%. The second touch cancels an in-flight edit or connection. One-finger touches and mouse input are unchanged. The scroll area uses `touch-action: pan-x pan-y` so native scrolling continues while the browser's page zoom is suppressed there. |

Presets apply to the built-in linear scale. A custom scale prop still controls the mapping; only tick steps, header bands and snap come from the preset in that case. Use `calendarBands` from the core entry to build header levels for presets.

### Resource load histogram

| API | Behavior |
| --- | --- |
| loadRows | TimelineLoadRow[] with unique id, label and optional detail. Each row is drawn below the task rows on the same time axis, scroll surface and horizontal virtualization. |
| loadSegments | TimelineLoadSegment[]: resourceId, start, end, load, capacity, optional overload and taskIds. The output of calculateResourceLoad can be passed directly. Segments must reference a load row and must not overlap within a resource. |
| loadRowHeight | number / 44. At least 16. |
| load-row slot | Customize the label using row and peak. |
| load-segment slot | Customize a segment using segment, row, peak and overload. The slot content is inside an element with role img and an accessible label. |

Each segment is scaled to the row's peak load or capacity. The default rendering fills load up to capacity, highlights the overloaded part and draws a dashed capacity line. Segments carry an accessible label such as "CNC cell 09:00–10:00: load 2 / capacity 1, overloaded by 1", built from formatTime and the GanttLabels fields load, capacity and overload; the load row group is named with loadRegion. Invalid load data is reported through validation-error.

### Timeline editing helpers

| Export | Purpose |
| --- | --- |
| dependencyTypeForEnds(fromEnd, toEnd) | Dependency type for a source and target TimelineBarEnd (start or finish) |
| dependencyEndsForType(type = FS) | The bar ends a dependency type joins |
| moveTimeRanges(ranges, delta, snap, bounds) | Move intervals by one snapped displacement, clamped so every interval stays in bounds |
| calendarBands(range, unit, options) | One header band level of hours, days, weeks, months or years in epoch milliseconds, aligned to a fixed UTC offset and clipped to the range |
| resourceLoadHistogram(segments, resourceIds?) | Validate load segments, group them by resource, sort them and report each resource's peak |

`calendarBands` options are utcOffsetMinutes (integer, default 0), step (units per band, default 1; a divisor of 24 for hours), weekStartsOn (0 Sunday to 6 Saturday, default 1) and label(start, end), which receives the unclipped band. Default labels are HH:mm, YYYY-MM-DD (days and week starts), YYYY-MM and YYYY. Daylight-saving transitions are not applied. Results are capped at 10,000 bands.

## Core entry point

Import pure functions and types from `vue-weave/core`. The Vue entry also re-exports them. Core has no Vue or DOM runtime dependency and does not mutate input data.

| Export | Purpose |
| --- | --- |
| indexGraph(nodes, edges) | Validate IDs, references and ports; create incoming/outgoing adjacency Maps |
| graphNeighborhood(index, id, maxHops = Infinity) | Union of independent ancestor/descendant traversals |
| layoutLayeredGraph(nodes, edges, options) | Deterministic graph layout |
| graphPortAnchor(box, port) | World-coordinate point on a node box for a port |
| graphEdgeEndpoint(layout, nodes, edge, end, direction) | Endpoint point and side for a named port or direction-based default |
| routeGraphPorts(layout, nodes, edges, direction) | Reroute edges with named ports after layout and saved positions |
| applyGraphPositions(layout, edges, positions, direction = LR) | Apply saved coordinates and reroute incident edges |
| createTimeScale(range, pixelsPerUnit) | Invertible linear scale |
| timeTicks(window, step, anchor = 0) | Stable tick sequence; capped at 10,000 entries |
| visibleRows(scrollTop, bodyHeight, rowHeight, count, overscan = 2) | First index and exclusive end index |
| intersectsWindow(interval, window) | Half-open overlap including point milestones |
| editTimeRange(interval, mode, delta, snap, bounds, minDuration = snap) | Immutable snapped proposal |
| dependencyTimes(source, target, type = FS) | Endpoint times for dependency routing |
| dependencyPath(x1, y1, x2, y2) | Orthogonal SVG path |
| validateTimelineData(rows, bars, dependencies = [], laneCount = 1) | Validate references, lanes, durations and progress |
| createTimelineRowTree(rows) | Validate row parents and cycles; produce stable preorder entries |
| summarizeTimelineRows(tree, bars) | Roll up leaf-row intervals and progress into a summary Map |
| normalizeWorkPeriods(periods, range) | Clip, sort and merge overlapping or touching work periods |
| buildWorkPeriods(range, week) | Expand weekly shifts and date overrides into epoch-millisecond work periods |
| scheduleTasks(input) | Calculate calendar-aware earliest/latest dates, float and critical links |
| calculateResourceLoad(range, tasks, resources, assignments) | Compare scheduled work with capacity over half-open intervals |
| levelResources(input) | Delay tasks with a deterministic priority heuristic so that assigned load stays within capacity |

All exported interfaces and component props are included in the declaration files. Validation functions reject invalid references and numeric geometry with descriptive errors. Scheduling failures such as cycles and infeasible plans are returned as results; malformed scheduling inputs throw. Routing helpers assume validated graph data as described below.

### Graph routing

`graphPortAnchor(box, port)` returns a `GraphPoint` on the named side of a `GraphBox`. Coordinates are world-coordinate pixels. `port.offset` defaults to 0.5 and measures down a vertical side or across a horizontal side. Supply finite box geometry and a port offset in [0, 1]. The helper does not validate these inputs.

`graphEdgeEndpoint(layout, nodes, edge, end, direction)` returns `{ x, y, side }`. `nodes` is a node-ID-keyed map, `end` is `from` or `to`, and `direction` is `LR` or `TB`. Named ports take precedence. Without a named port, LR uses right/left and TB uses bottom/top for source/target endpoints. Validate nodes and edges with `indexGraph` and supply matching layout boxes before calling this helper; missing boxes are not handled as a recoverable result.

`applyGraphPositions` overlays finite, nonnegative coordinates, expands the layout bounds when needed and reroutes incident edges while preserving other paths. Position entries for unknown node IDs are ignored. `routeGraphPorts` then replaces paths and label positions for edges with named ports, leaving unnamed-edge routes intact. These operations do not mutate the supplied layout and may return it unchanged when there is nothing to update.

### Layout directions, crossing reduction and extra layouts

`GraphLayoutOptions.direction` also accepts `RL` and `BT`. They mirror the LR and TB layouts (ranks grow right-to-left or bottom-to-top) and keep paths, edge labels and bounds consistent. `graphEdgeEndpoint`, `routeGraphPorts` and `applyGraphPositions` accept the same `GraphLayoutDirection` type; unnamed endpoints leave and enter on the mirrored sides.

`layoutLayeredGraph` accepts `GraphLayeredLayoutOptions`, which adds opt-in crossing reduction:

| Option | Meaning |
| --- | --- |
| crossingReduction | `none` (default, input order, output unchanged), `barycenter` or `median`. Alternating down/up sweeps reorder each rank by the mean or median position of neighbouring nodes. Ties keep input order and the best ordering seen, never worse than the input, is kept. Deterministic and iterative. |
| crossingSweeps | Positive integer sweep limit. Default 8. |

`countGraphCrossings(layout, edges, direction = LR)` counts crossings between edges that join adjacent ranks, measured on box centres. Long edges (rank jump above one), same-rank edges and self-loops use dedicated routes and are not counted.

`layoutTreeGraph(nodes, edges, options)` and `layoutRadialGraph(nodes, edges, options)` return a `GraphLayout`, so they can be used as the NetworkGraph `layout` prop, for example `(n, e) => layoutTreeGraph(n, e, { direction: 'TB' })`. Both build a breadth-first spanning forest. Roots are `options.roots` (unknown IDs throw an `Error`), then nodes without incoming edges, then any node left over inside a cycle. Edges that are not tree edges (cross, back, same-depth and self-loops) are still routed. Cycles, disconnected nodes and self-loops do not throw. Invalid numbers throw `RangeError`. Traversals are iterative.

- `GraphTreeLayoutOptions`: direction (LR, TB, RL, BT), nodeWidth, nodeHeight, columnGap (between depths), rowGap (between leaves), padding and roots. Leaves are spaced evenly and each parent is centred over its children. Box `rank` is the tree depth.
- `GraphRadialLayoutOptions`: nodeWidth, nodeHeight, ringGap (default 40), padding and roots. Nodes sit on concentric rings by depth; one root is placed at the centre, several roots share the first ring. Subtrees receive angular wedges proportional to their leaf counts and ring radii are widened so boxes do not overlap. Edges are straight segments clipped to the box borders.

### Graph algorithms

All helpers validate input with `indexGraph` (unknown endpoints, duplicate IDs and bad ports throw `Error`) and never mutate their arguments.

| Export | Purpose |
| --- | --- |
| topologicalOrder(nodes, edges) | `{ order, acyclic, blocked }` using Kahn's algorithm, input order breaks ties. `blocked` lists nodes on or behind a cycle; a self-loop is a cycle. |
| findGraphCycles(nodes, edges) | Node IDs of each strongly connected component with more than one node, plus each self-looping node. Iterative Tarjan; deterministic order. |
| shortestGraphPath(nodes, edges, fromId, toId, { directed = true, weight }) | `{ nodeIds, edgeIds, distance }` or `null` when unreachable. Breadth-first without `weight`, Dijkstra with it (weights must be finite and nonnegative, otherwise `RangeError`). Unknown IDs throw `Error`. |
| searchGraphNodes(nodes, query, { fields }) | Case-insensitive substring match on `id` and `label` (both by default). An empty query matches every node. |
| filterGraph(nodes, edges, match, { neighborhood = 0, fields }) | `match` is a predicate or a text query. Returns `{ nodes, edges }`: matching nodes plus everything within `neighborhood` hops (via `graphNeighborhood`) and the edges with both endpoints kept. |

### Row trees and summaries

`createTimelineRowTree(rows)` validates unique nonempty IDs, parent references and cycles. Each preorder entry contains `row`, `depth`, `hasChildren` and `afterSubtree`, the exclusive index after that row and its descendants. Root and sibling order follows input order.

`summarizeTimelineRows(tree, bars)` expects the tree returned by `createTimelineRowTree` and valid bars for those rows. It aggregates leaf-row bars into their ancestors and returns a Map keyed by row ID, including leaves with bars. Each summary reports the earliest start, latest end and interval count. Progress is weighted by duration across bars with known progress. Bars without progress and zero-duration milestones do not contribute to the progress denominator. Explicit parent bars are excluded from descendant aggregation.

### Calendars, scheduling and resource load

`normalizeWorkPeriods(periods, range)` returns sorted, clipped, merged half-open intervals. The range and period endpoints must be safe integers, and each interval must have positive length. `buildWorkPeriods(range, week)` generates these periods from weekly shifts, a fixed UTC offset or an IANA `timeZone`, and civil-date overrides; it uses epoch milliseconds.

`scheduleTasks(input)` returns a `ScheduleResult`. Successful results contain `tasks`, `criticalDependencyIds` and the project `finish`. Each `ScheduledTask` reports `totalFloat` (working time for tasks, elapsed time for milestones) and `workFloat` (working time on the task calendar for both tasks and milestones). Cycle or infeasible results contain no partial schedule.

`calculateResourceLoad` returns `ResourceLoadSegment[]` with resource ID, start/end, load, available capacity, overload and contributing task IDs. It reports conflicts without automatically moving tasks. See the [scheduling guide](scheduling.md) for time units, quantum alignment, calendar rules, failure results and capacity constraints.

#### Scheduling modes, splits, leveling and time zones

| API | Behavior |
| --- | --- |
| WorkWeek.timeZone | IANA zone name. Shift minutes become local wall-clock times with daylight-saving rules from `Intl.DateTimeFormat`. Skipped wall times resolve to the transition instant; repeated wall times resolve to the earlier occurrence. Cannot be combined with `utcOffsetMinutes`. An invalid zone throws `RangeError`. |
| ScheduleTask.mode | `'asap'` (default) or `'alap'`. An ALAP task takes the latest slot that moves no other task and keeps the project finish. Its result adds `earliestStart` and `earliestEnd`; float remains measured from the earliest dates. |
| ScheduleTask.pauses | Elapsed half-open intervals removed from this task's working time. Work is split around them. |
| ScheduleTask.splittable / priority | Used only by `levelResources`. `splittable` lets leveling add pauses. A higher `priority` (default 0) is placed first. |
| ScheduleFailure (cycle) | `cycles: ScheduleCycle[]`. Each cycle has `taskIds` and `dependencyIds` of one strongly connected group, in input order. |
| ScheduleFailure (infeasible) | Adds `constraints: ScheduleConstraintName[]` and `dependencyIds`, the binding bounds and links that conflict. |
| levelResources(input) | `LevelResourcesInput` is a `ScheduleInput` plus `resources` and `assignments`. Returns `ScheduleFailure` or `LevelResourcesSuccess`: the leveled schedule plus `leveledTasks`, `delays` (`ResourceDelay[]`), `overloads` and `unresolvedTaskIds`. |

The exported types are `ScheduleSuccess`, `ScheduleFailure`, `ScheduleCycle`, `ScheduleConstraintName`, `LevelResourcesInput`, `LevelResourcesSuccess`, `LevelResourcesResult` and `ResourceDelay`. `levelResources` ranks ready tasks by priority, then total float, then early start, then ID, and gives each the earliest start with enough capacity before its latest feasible dates. Tasks without such a start keep their earliest dates and are reported as unresolved. The [scheduling guide](scheduling.md#level-resources) defines each step. Optimization policies remain the application's concern.

## Application undo and redo

Import `useEditHistory(initial, limit = 100)` from the Vue entry point. It returns `state`, `canUndo`, `canRedo`, `commit`, `undo`, `redo` and `reset`. The limit is the maximum number of undo steps and must be a positive integer; invalid limits throw `RangeError`.

Pass a complete immutable snapshot to `commit` after accepting an edit. Snapshots are stored by reference, without cloning or freezing; do not mutate them after committing. Committing the current snapshot reference does nothing. A batch move or endpoint replacement can be one history entry. Committing after an undo discards the redo branch. `undo` and `redo` do nothing when unavailable; `reset(snapshot)` replaces the history and clears both branches. Persist accepted changes through the application storage layer.
