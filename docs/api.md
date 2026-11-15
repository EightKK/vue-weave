# Public API

Identifiers are nonempty strings and must be unique within their corresponding collection. Named port IDs are scoped to each node. Labels are rendered as Vue text. Escape/sanitize any HTML you supply in custom slots according to your application's trust boundaries.

The package is ESM-only. Import Vue components and shared types from `vue-weave`, headless calculations from `vue-weave/core`, and the stylesheet from `vue-weave/style.css`. Declarations support TypeScript's `Bundler` and `NodeNext` resolution. The core entry does not require Vue or browser globals at runtime. Node.js 22.18+ is the declared runtime baseline; Vue components require the Vue 3.5+ peer dependency.

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

The optional GraphLabels fields minimap, connectFrom, connectTo, reconnectSource, reconnectTarget, moveGroup, rejected (default "This connection was rejected.") and selectEdge (default "Select edge", followed by the edge label or ID) localize editor controls and announcements.

### Named ports, reconnection and group actions

| API | Behavior |
| --- | --- |
| NetworkNode.ports | Optional named ports with an ID, side, direction, offset and label. Side is left, right, top or bottom. Direction defaults to both. Offset defaults to 0.5 and measures down a vertical side or across a horizontal side. |
| GraphEdge.fromPort / toPort | Optional names scoped to the edge's source and target nodes. Named endpoints are validated. Unnamed edges keep their original routing. |
| reconnectable / reconnect(change) | Select an edge, then drag a source or target endpoint to a port. With the keyboard, select the edge and activate an endpoint and destination port. The proposal includes id, before and after. |
| validateConnection(connection, replacingEdgeId) | Receives the existing edge ID during reconnection. The application can exclude it when checking for duplicates. |
| boxSelect | Enables Shift-drag on the canvas. Partially intersecting nodes count. Add Ctrl or Meta to retain the previous selection. Use with controlled selectedIds. |
| groups | Disjoint groups with id, label and nodeIds. The bounds follow member nodes. Drag a group label or focus it and use arrow keys to move movable members together. |
| nodes-move(changes) | Emitted once when multiple nodes move. The node-move event covers single-node changes. |

The application accepts reconnection by replacing the corresponding edge. Preserve the edge ID and metadata and set both endpoint port fields from the proposal, including clearing a field when it is absent. Group and multi-selection movements preserve relative offsets among the movable nodes. Nodes with draggable false keep their positions. Groups use absolute positions and a single containment level. The diagram editor expects different source and target nodes.

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

All exported interfaces and component props are included in the declaration files. Validation functions reject invalid references and numeric geometry with descriptive errors. Scheduling failures such as cycles and infeasible plans are returned as results; malformed scheduling inputs throw. Routing helpers assume validated graph data as described below.

### Graph routing

`graphPortAnchor(box, port)` returns a `GraphPoint` on the named side of a `GraphBox`. Coordinates are world-coordinate pixels. `port.offset` defaults to 0.5 and measures down a vertical side or across a horizontal side. Supply finite box geometry and a port offset in [0, 1]. The helper does not validate these inputs.

`graphEdgeEndpoint(layout, nodes, edge, end, direction)` returns `{ x, y, side }`. `nodes` is a node-ID-keyed map, `end` is `from` or `to`, and `direction` is `LR` or `TB`. Named ports take precedence. Without a named port, LR uses right/left and TB uses bottom/top for source/target endpoints. Validate nodes and edges with `indexGraph` and supply matching layout boxes before calling this helper; missing boxes are not handled as a recoverable result.

`applyGraphPositions` overlays finite, nonnegative coordinates, expands the layout bounds when needed and reroutes incident edges while preserving other paths. Position entries for unknown node IDs are ignored. `routeGraphPorts` then replaces paths and label positions for edges with named ports, leaving unnamed-edge routes intact. These operations do not mutate the supplied layout and may return it unchanged when there is nothing to update.

### Row trees and summaries

`createTimelineRowTree(rows)` validates unique nonempty IDs, parent references and cycles. Each preorder entry contains `row`, `depth`, `hasChildren` and `afterSubtree`, the exclusive index after that row and its descendants. Root and sibling order follows input order.

`summarizeTimelineRows(tree, bars)` expects the tree returned by `createTimelineRowTree` and valid bars for those rows. It aggregates leaf-row bars into their ancestors and returns a Map keyed by row ID, including leaves with bars. Each summary reports the earliest start, latest end and interval count. Progress is weighted by duration across bars with known progress. Bars without progress and zero-duration milestones do not contribute to the progress denominator. Explicit parent bars are excluded from descendant aggregation.

### Calendars, scheduling and resource load

`normalizeWorkPeriods(periods, range)` returns sorted, clipped, merged half-open intervals. The range and period endpoints must be safe integers, and each interval must have positive length. `buildWorkPeriods(range, week)` generates these periods from weekly shifts, a fixed UTC offset and civil-date overrides; it uses epoch milliseconds.

`scheduleTasks(input)` returns a `ScheduleResult`. Successful results contain `tasks`, `criticalDependencyIds` and the project `finish`. Each `ScheduledTask` reports `totalFloat` (working time for tasks, elapsed time for milestones) and `workFloat` (working time on the task calendar for both tasks and milestones). Cycle or infeasible results contain no partial schedule.

`calculateResourceLoad` returns `ResourceLoadSegment[]` with resource ID, start/end, load, available capacity, overload and contributing task IDs. It reports conflicts without automatically moving tasks. See the [scheduling guide](scheduling.md) for time units, quantum alignment, calendar rules, failure results and capacity constraints.

## Application undo and redo

Import `useEditHistory(initial, limit = 100)` from the Vue entry point. It returns `state`, `canUndo`, `canRedo`, `commit`, `undo`, `redo` and `reset`. The limit is the maximum number of undo steps and must be a positive integer; invalid limits throw `RangeError`.

Pass a complete immutable snapshot to `commit` after accepting an edit. Snapshots are stored by reference, without cloning or freezing; do not mutate them after committing. Committing the current snapshot reference does nothing. A batch move or endpoint replacement can be one history entry. Committing after an undo discards the redo branch. `undo` and `redo` do nothing when unavailable; `reset(snapshot)` replaces the history and clears both branches. Persist accepted changes through the application storage layer.

## Edit transactions and asynchronous saving

`useEditTransaction(options)` (Vue entry) confirms edits with a server before committing them. Types and pure state transitions (`EditTransaction`, `SaveResult`, `TransactionOutcome`, `TransactionAdapter`, `createTransactionState`, `beginTransaction`, `settleTransaction`, `refreshTransactionState`, `clearTransactionResult`) are exported from `vue-weave/core`.

Options: `documentId`, `initialState`, `initialVersion`, `adapter`, optional `createOperationId()` (defaults to `crypto.randomUUID()`), `historyLimit` (default 100) and `onHistoryReset(reset)`. The adapter provides synchronous `validate(state, changes)` (return `false` or a reason string to reject), synchronous `apply(state, changes)` returning a new state, and `save(request, candidate)` returning `Promise<SaveResult>`. Versions are opaque and compared for equality only.

A request is `{ operationId, documentId, baseVersion, source, kind: 'changes', changes }` or `{ ..., kind: 'restore', snapshot }`. `SaveResult` is `accepted` (with the server's normalised `state` and new `version`), `rejected` (`code`), `conflict` (`currentVersion`) or `uncertain`. A `save` that throws or rejects is treated as `uncertain`.

| Name | Meaning |
| --- | --- |
| `acceptedState`, `acceptedVersion` | Last state and version the server accepted |
| `candidateState` | State being saved, kept apart from the accepted state; `undefined` when not saving |
| `status` | `idle`, `saving`, `rejected`, `conflict` or `uncertain` |
| `pendingTransaction` | `{ operationId, kind, source, baseVersion }` while saving or uncertain |
| `result` | Last rejected, conflict or uncertain result until cleared |
| `canUndo`, `canRedo` | Whether history has a previous or next snapshot |
| `submit(changes, { source }?)` | Validate, apply and save. Resolves to a `TransactionOutcome` |
| `undo()`, `redo()` | Save the previous or next history snapshot as a `restore` transaction against the current `acceptedVersion` |
| `refresh(state, version)` | Replace the accepted state, reset history and discard in-flight responses |
| `historyReset` | `{ reason: 'refresh', version }` for the last reset, or `undefined` |
| `reconcile(result)` | Settle an `uncertain` operation using a result fetched from the server |
| `clearResult()` | Dismiss a rejected, conflict or uncertain result; the accepted input is unchanged |

Outcomes add `busy` (another save for the document is in flight), `invalid` (failed synchronous validation, empty changes, or nothing to undo or redo) and `discarded` (a response that no longer matches the current operation or epoch, for example one that arrives after `refresh`). There is no `validating` status because validation is synchronous.

Only an accepted response changes anything. It replaces the accepted state with the server's state and records one history entry; a repeated accepted response for the same operation is ignored. For undo and redo the history position moves only after acceptance, and the entry is replaced by the server-normalised state; the server version is never rolled back and the remaining redo entries stay valid. A rejected, conflicting or uncertain save leaves the accepted state, version and history position unchanged, and a new accepted edit discards the redo branch. An uncertain save is never resent automatically; call `reconcile` or `refresh`. Because restores send a whole snapshot, large documents send more data than a diff; an adapter may transmit a diff inside `save`, but acceptance is of the whole snapshot.

`useEditHistory` additionally returns `peekUndo()`, `peekRedo()` (the adjacent snapshot or `undefined`, position unchanged) and `replaceCurrent(snapshot)` (replace the current entry, keeping the others).

The server must apply each save as a conditional update on `baseVersion`, deduplicate by `operationId`, and commit all affected records atomically. See [integration](integration.md).
