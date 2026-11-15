# Public API

Identifiers are nonempty strings and must be unique within their corresponding collection. Named port IDs are scoped to each node. Labels are rendered as Vue text. Escape/sanitize any HTML you supply in custom slots according to your application's trust boundaries.

The package is ESM-only. Import Vue components and shared types from `vue-weave`, headless calculations from `vue-weave/core`, and the stylesheet from `vue-weave/style.css`. Declarations support TypeScript's `Bundler` and `NodeNext` resolution. The core entry does not require Vue or browser globals at runtime. Node.js 22.18+ is the declared runtime baseline; Vue components require the Vue 3.5+ peer dependency. The package also exports `vue-weave/package.json`, so tools can read the installed version.

The stylesheet also ships opt-in `vw-theme-dark` and `vw-theme-auto` classes and forced-colors, reduced-motion and print rules; see docs/integration.md.

## Contents

- [NetworkGraph](#networkgraph)
  - [Graph editing and minimap](#graph-editing-and-minimap)
  - [Named ports, reconnection and group actions](#named-ports-reconnection-and-group-actions)
  - [Large graphs, touch gestures, nested groups and search](#large-graphs-touch-gestures-nested-groups-and-search)
  - [Edge selection, deletion, context menu, tooltips and fit to selection](#edge-selection-deletion-context-menu-tooltips-and-fit-to-selection)
  - [Snap to grid, alignment guides, auto-pan, drops and clipboard](#snap-to-grid-alignment-guides-auto-pan-drops-and-clipboard)
  - [Group collapse, edge styles and waypoints, level of detail and node resizing](#group-collapse-edge-styles-and-waypoints-level-of-detail-and-node-resizing)
  - [NetworkGraph directions and crossing reduction](#networkgraph-directions-and-crossing-reduction)
- [GanttChart](#ganttchart)
  - [Editing contract](#editing-contract)
  - [Timeline planning overlays](#timeline-planning-overlays)
  - [Baseline sets](#baseline-sets)
  - [Timeline columns and rollups](#timeline-columns-and-rollups)
  - [Column resizing](#column-resizing)
  - [Dependency editing](#dependency-editing)
  - [Dependency lag](#dependency-lag)
  - [Multiple selection, batch moves and row moves](#multiple-selection-batch-moves-and-row-moves)
  - [Zoom presets, now marker and touch zoom](#zoom-presets-now-marker-and-touch-zoom)
  - [Resource load histogram](#resource-load-histogram)
  - [Calendar shading, critical path, float and segments](#calendar-shading-critical-path-float-and-segments)
  - [Progress editing, deletion, tooltips, context menu and fit](#progress-editing-deletion-tooltips-context-menu-and-fit)
  - [Drag to create and cascade previews](#drag-to-create-and-cascade-previews)
  - [Row hierarchy moves, status date and progress line](#row-hierarchy-moves-status-date-and-progress-line)
  - [Scheduling constraints](#scheduling-constraints)
  - [Timeline editing helpers](#timeline-editing-helpers)
- [Core entry point](#core-entry-point)
  - [Graph routing](#graph-routing)
  - [Layout directions, crossing reduction and extra layouts](#layout-directions-crossing-reduction-and-extra-layouts)
  - [Graph algorithms](#graph-algorithms)
  - [Viewport helpers](#viewport-helpers)
  - [Row trees and summaries](#row-trees-and-summaries)
  - [Calendars, scheduling and resource load](#calendars-scheduling-and-resource-load)
  - [Interchange exports](#interchange-exports)
  - [Network diagram from a schedule](#network-diagram-from-a-schedule)
- [Application undo and redo](#application-undo-and-redo)
- [Export to SVG and PNG](#export-to-svg-and-png)
- [Right-to-left layout](#right-to-left-layout)
- [Typed data](#typed-data)

## NetworkGraph

| Prop | Type / default | Meaning |
| --- | --- | --- |
| nodes | readonly N[] (N extends NetworkNode) / required | ID, label, optional detail, tone, shape and opaque data. N is inferred; see [Typed data](#typed-data) |
| edges | readonly E[] (E extends GraphEdge) / required | ID, from/to node IDs, optional label and data. E is inferred |
| selectedId | string / undefined | Controlled selection; also supports v-model:selected-id |
| relatedIds | ReadonlySet<string> / undefined | Emphasizes included nodes and edges joining two included nodes |
| options | GraphLayeredLayoutOptions / defaults below | Built-in layout configuration |
| layout | GraphLayoutFunction<GraphShownNode<N, G>, GraphShownEdge<E, G>> / undefined | Overrides built-in layout. Without `groups` it receives N and E; see [Typed data](#typed-data) |
| labels | Partial<GraphLabels> / English | Region, empty, zoom, zoomIn, zoomOut and fit |
| height | number or CSS string / 220px | SVG viewport height |
| showControls | boolean / true | Zoom/fit buttons |
| dir | ChartDirection / ltr | `rtl` or `auto` mirrors the zoom tools, minimap and label alignment; see [Right-to-left layout](#right-to-left-layout) |

GraphLayoutOptions defaults are direction LR, nodeWidth 144, nodeHeight 58, columnGap 50, rowGap 24 and padding 20. Sizes must be positive; spacing must be nonnegative. Empty graphs keep positive layout dimensions even with zero padding. TB changes the layout direction while preserving each node's physical width and height.

NetworkNode<D> has id, label, optional detail, tone (teal/blue/amber/violet), shape (box/rounded), resizable and data (D, default unknown). GraphEdge<D> has id, from, to, optional label, data (D, default unknown) and points (waypoints, see [Group collapse, edge styles and waypoints, level of detail and node resizing](#group-collapse-edge-styles-and-waypoints-level-of-detail-and-node-resizing)). The default renderer clips long text to the node box; its title exposes the full label. Node slots own their clipping and sizing.

A custom layout returns GraphLayout containing boxes, paths and edgeLabels Maps plus positive finite width and height. Each node box has x, y, width, height and rank. Each edge needs an SVG path. Labels are optional map entries. Coordinates are chart-local pixels. Keep paths and boxes within the supplied bounds for accurate fit-to-view.

Events are select(id), update:selectedId(id), and viewport-change({x,y,scale}). The last event reports pan/zoom/fit changes. Exposed methods are fit(options) (see [Fit to selection](#edge-selection-deletion-context-menu-tooltips-and-fit-to-selection)), zoom(factor, optionalX, optionalY), getViewport() and setViewport({x,y,scale}), plus focusNode(id, options), exportSvg(options) and exportPng(options) (see [Export to SVG and PNG](#export-to-svg-and-png)), and toGraphPoint(clientX, clientY) and getViewportCenter() (see [Snap to grid, alignment guides, auto-pan, drops and clipboard](#snap-to-grid-alignment-guides-auto-pan-drops-and-clipboard)). Viewport scale is clamped by zoom to 0.1–3, and setViewport requires the same range. When the whole graph only fits below 0.1, the lower limit becomes the fit scale for the current viewport size, so Fit to view always shows every node and a fitted viewport from getViewport() can be restored. The camera starts in automatic fit mode: it is fitted on mount, on resize and whenever the graph structure changes. Panning, zooming (buttons, Ctrl + wheel or pinch), the minimap, keyboard panning, auto-pan, setViewport, focusNode and fit({ ids }) switch it to manual mode. In manual mode a structural change that the parent accepts (connect, delete, paste or duplicate, a group collapse or expand) keeps the camera where it is; if the smaller graph raises the lower zoom limit, the scale is clamped to it around the stage centre and viewport-change is emitted. The camera re-fits and returns to automatic mode when the layout function or layout options (for example the direction) change, or when the graph is replaced: it was or becomes empty, or none of the previous node IDs remain. fit() without ids re-fits the whole graph and also returns to automatic fitting. Slots are node({node,box,selected,dimmed,scale}), edge({edge,path,selected,dimmed,scale}), empty and the optional HTML tooltip({target}). SVG slots must contain SVG elements. Each node and edge renders as its own internal component, so a node or edge slot runs again only when its own slot props change, when reactive state it reads changes, or when the slot function is replaced; a node drag re-renders the dragged nodes and their edges, not the whole graph. Read changing data reactively (props, refs, computed values) inside these slots, not from plain variables. The scale slot prop follows the camera, so zooming re-renders every node and edge slot; panning does not.

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

Editing and the minimap are opt-in. The select and update:selectedId events fire for node selection, including when selectedIds is supplied. A selected node moves with the other selected movable nodes. Escape or a new layout discards an in-flight preview. `groups` and `labels` are compared by value like `options`, so a new but equal array or object (such as an inline literal in a parent template) neither rebuilds the layout nor cancels a drag or pan; a real change still cancels it. A custom `layout` function keeps reference semantics. A drag, pan or connection belongs to one pointer; while it is in flight, a press of another pointer (for example a pen next to the mouse) starts nothing, except that a second touch still starts a pinch. Keyboard movement uses ten chart units per arrow press and forty with Shift, or grid steps with snapGrid. Update positions with a fresh map when accepting a move. The built-in overlay reroutes incident edges as curves and preserves other paths. A custom router can own absolute positions by supplying a layout function without the positions overlay.

The optional GraphLabels fields minimap, connectFrom, connectTo, reconnectSource, reconnectTarget, moveGroup, groupWithin (default "within"), rejected (default "This connection was rejected."), selectEdge (default "Select edge", followed by the edge label or ID) and deleteRejected (default "This deletion was rejected.") localize editor controls and announcements.

### Named ports, reconnection and group actions

| API | Behavior |
| --- | --- |
| NetworkNode.ports | Optional named ports with an ID, side, direction, offset and label. Side is left, right, top or bottom; any other value throws an Error naming the node and the port. Direction defaults to both. Offset defaults to 0.5 and measures down a vertical side or across a horizontal side. |
| GraphEdge.fromPort / toPort | Optional names scoped to the edge's source and target nodes. Named endpoints are validated. Unnamed edges keep their original routing. |
| reconnectable / reconnect(change) | Select an edge, then drag a source or target endpoint to a port. With the keyboard, select the edge and activate an endpoint and destination port. The proposal includes id, before and after. |
| validateConnection(connection, replacingEdgeId) | Receives the existing edge ID during reconnection. The application can exclude it when checking for duplicates. |
| boxSelect | Enables Shift-drag on the canvas. Partially intersecting nodes count. Add Ctrl or Meta to retain the previous selection. Use with controlled selectedIds. |
| groups | Groups with id, label, nodeIds and an optional parentId (see Nested groups). The element type is the third type parameter G of NetworkGraph; with groups, slots and callbacks can also receive collapsed proxy nodes (see [Typed data](#typed-data)). Direct members are disjoint. The bounds follow member nodes. Drag a group label or focus it and use arrow keys to move movable members together. |
| nodes-move(changes) | Emitted once when multiple nodes move. The node-move event covers single-node changes. |

The application accepts reconnection by replacing the corresponding edge. Preserve the edge ID and metadata and set both endpoint port fields from the proposal, including clearing a field when it is absent. Group and multi-selection movements preserve relative offsets among the movable nodes. Nodes with draggable false keep their positions. Groups use absolute positions; nesting is opt-in through parentId. The diagram editor expects different source and target nodes.

### Large graphs, touch gestures, nested groups and search

| API | Behavior |
| --- | --- |
| cullOffscreen | boolean / false. Renders only the nodes, edges, edge labels, connection handles and groups whose bounds intersect the viewport plus cullOverscan. Layout, box selection, keyboard panning and the minimap still use every node, so the minimap shows the whole graph. |
| cullOverscan | number / 200. Margin in screen pixels around the viewport that stays rendered, so a short pan does not reveal blank space. |
| matchIds | ReadonlySet<string> / undefined. When supplied, nodes outside the set are dimmed. An empty set dims every node. |
| dimmedIds | ReadonlySet<string> / undefined. Nodes to dim explicitly. Combines with matchIds. |
| focusNode(id, options?) | Exposed method. Centers the camera on the node and keeps the current scale, or applies options.scale (0.1 to 3, or down to the fit scale for a graph that only fits below 0.1). Throws Error for an unknown ID and RangeError for a bad scale. Emits viewport-change. It works with culling because culling follows the camera. |
| NetworkGroup.parentId | Optional ID of another group. The group is painted inside its parent and the parent bounds enclose it. |

Culling keeps these elements rendered even when they are off screen: selected nodes, the node or edge that has keyboard focus (and the node that owns a focused connection handle), nodes involved in a pointer drag or group drag, the source of a pending connection, the edge being reconnected and the groups that contain moved nodes. Elements that are culled are not in the DOM, so Tab skips them and they cannot be found by accessible name. Call focusNode(id) to bring one into view. Before mount there is no measured viewport. Server rendering and the first client render use the 1150 x 270 default viewport with the initial fit camera, so the output is deterministic and hydrates cleanly. The measured size replaces it after mount. Culling is based on bounding boxes: a path is bounded by its control points, and edge labels are included with a fixed reach, so culling errs on the side of rendering. Custom node and edge slots are not rendered for culled elements.

Two-finger gestures use Pointer Events with pointerType touch. When a second finger lands, any in-flight one-finger drag, connection, box selection or pan is cancelled without emitting a proposal. Pinching then scales around the midpoint, the scale is clamped like the zoom buttons, and moving both fingers together pans. Each change emits viewport-change. One-finger background pan, node drag, connecting and box selection behave as before, and plain wheel scrolling still passes through (Ctrl + wheel zooms). Lifting one finger ends the pinch; the remaining finger does nothing until it is lifted.

Nested groups are opt-in. Give a group parentId to place it in another group. nodeIds lists only the direct members, and a group that has child groups may have an empty nodeIds. A node can still belong to one group directly. Parents are painted first, in input order among siblings. The parent bounds enclose the child bounds, its label strip and a margin, and nested bounds can extend past the layout padding, so leave extra options.padding for deep nesting. Dragging a parent label (or using arrow keys on it) moves every descendant member as one node-move or nodes-move proposal. Dragging a child moves only its own members. A nested group is announced as "Move group Inner within Outer"; the within word is the optional GraphLabels.groupWithin label. The component throws Error for a duplicate ID, an unknown parentId, a parent cycle, an unknown or repeated member, or a group with no members after expansion. Groups without parentId behave as before.

The dimming hooks are presentation only. Dimmed nodes and the edges that touch them receive the vw-dimmed class and reduced opacity (--vw-dimmed-opacity, default 0.28). Selection, events and keyboard behavior do not change. The node and edge slots receive dimmed. Compute matches in your application; the component never filters data.

### Edge selection, deletion, context menu, tooltips and fit to selection

| API | Behavior |
| --- | --- |
| edgesSelectable | boolean / false. Gives every edge the focusable hit area that reconnectable uses (role button, named "Select edge" plus the edge label or ID). Click, Enter or Space selects the edge; Ctrl, Meta or Shift toggles it in or out of the selection. When reconnectable is also set, the selected edge shows its reconnect handles. |
| selectedEdgeIds / update:selectedEdgeIds | ReadonlySet<string> / undefined. Controlled edge selection; supports v-model:selected-edge-ids. Without it the component keeps the last selected edge itself and still emits update:selectedEdgeIds. Unknown IDs are ignored. |
| edge-select(id) | Emitted for every edge activation, including a toggle that removes it. |
| deletable | boolean / false. Delete or Backspace on the focused stage, node, edge or group label proposes a deletion. A focused node or edge that is not selected is deleted alone; otherwise the current selection is: selectedIds (or selectedId) plus the edge selection. |
| NetworkNode.deletable | false keeps the node out of every deletion proposal, like draggable false. Its edges are only deleted when they are selected or focused themselves. |
| validateDelete(deletion) | Synchronous callback. true or undefined accepts, false rejects with labels.deleteRejected, a string rejects with that reason. |
| delete(deletion) | GraphDeletion with nodeIds and edgeIds in input order, without duplicates. edgeIds also lists every edge incident to a deleted node. Apply it with removeGraphElements. |
| delete-rejected(deletion, reason) | Reports a rejected proposal. The reason is announced in the polite live region. |
| contextMenu | boolean / false. A contextmenu event over a node, edge, group label or the empty stage is cancelled and reported as context-menu(GraphContextMenu). The ContextMenu key and Shift+F10 report the focused node, edge, group label or stage at its on-screen centre. The component renders no menu. |
| tooltip slot | Optional HTML content for the hovered or keyboard-focused node or edge. Receives target, either { kind: 'node', node } or { kind: 'edge', edge } (NetworkTooltipSlot). |
| tooltipDelay | number / 400. Hover delay in milliseconds before the tooltip appears. Must be finite and nonnegative, otherwise rendering throws RangeError. |
| fit(options?) | Exposed method. GraphFitOptions has ids (node IDs) and padding (screen pixels, finite and nonnegative, default 0). |

Edge selection is opt-in. With edgesSelectable, a plain edge selection also empties a controlled selectedIds set, and a plain node selection or box selection empties the edge selection, so one Delete removes what is shown as selected. Toggling with Ctrl, Meta or Shift keeps the other kind. Selected edges receive the vw-is-selected class on their hit area and their group receives vw-edge-selected; the default edge path is drawn in --vw-edge-selected (default --vw-accent). Culling keeps selected edges rendered, like selected nodes. Without edgesSelectable, reconnectable edges behave as before.

A deletion proposal is never emitted during a pointer drag, connection, pan, box selection or pinch, nor while a keyboard connection is armed. Holding the key does not repeat it. Keys pressed in focusable slot content such as an input keep their usual meaning. The parent applies the proposal by replacing nodes and edges, and should also prune positions, groups and selections that mention removed IDs (groups must keep at least one member). When the focused element disappears, focus moves to the stage.

GraphContextMenu has target ({ kind: 'node' | 'edge' | 'group', id } or { kind: 'canvas' }), point (GraphPoint in chart coordinates, the inverse of the camera transform), clientX and clientY (viewport coordinates for a position: fixed menu) and source ('pointer' or 'keyboard'). A right-click on the thin drawn path of an edge reports the edge; with edgesSelectable or reconnectable the wider hit area does too. Requesting a menu cancels an armed connection and hides the tooltip. Render the menu in your application with role menu, move focus into it, close it with Escape and return focus to the element that had it. The browser's follow-up contextmenu event after a handled keyboard request is cancelled and not reported twice. With or without contextMenu, a contextmenu event during a pointer gesture (node, group or resize drag, connection or reconnection drag, box selection, pan or pinch), such as a macOS Control-click, cancels the gesture without a proposal, as Escape does, because the native menu can swallow pointerup. With contextMenu, a menu requested after the gesture had started to move is not reported.

The tooltip is never rendered on the server or before mounting. Hover shows it after tooltipDelay; moving to another element switches it at once. Keyboard focus shows it immediately; focus caused by a pointer press does not. The pointer can move onto the tooltip without hiding it (WCAG 1.4.13), and Escape dismisses it anywhere on the page. A press in the stage, a drag, connection, box selection, pan or pinch hides it. While shown it has role tooltip and an ID from useId, and the described node or edge hit area references it with aria-describedby. It is placed beside the element and follows the camera, after the element or before it in right-to-left graphs, flipping to the side with more room. While the slot is provided, nodes omit their SVG title so the browser does not show a second tooltip; the accessible name is unchanged. Style it through the vw-network-tooltip class.

fit() without options shows the whole graph exactly as before. fit({ ids }) centres the combined boxes of those nodes at the largest scale that fits inside the viewport minus padding on each side, capped at 1.15 like Fit to view and clamped to the zoom range, then emits viewport-change. Unknown IDs throw Error, invalid padding throws RangeError, and an empty ids list leaves the camera unchanged and emits nothing. fit({ padding }) fits the whole graph with that margin and keeps it when the viewport is resized, until the camera moves or fit() runs again.

### Snap to grid, alignment guides, auto-pan, drops and clipboard

| API | Behavior |
| --- | --- |
| snapGrid | number / undefined. Grid size in chart units; must be positive and finite, otherwise rendering throws RangeError. Pointer drags put the top-left corner of the dragged node on a grid multiple, and arrow keys move it to the next grid line in the arrow direction (four lines with Shift) instead of 10 or 40 units. Drop and paste points are rounded to the grid. |
| background | 'none' \| 'dots' \| 'lines' / 'none'. Draws a decorative SVG pattern (dots or grid lines) behind the graph that follows pan and zoom. Any other value throws Error while rendering. 'none' keeps the stylesheet's fixed dotted backdrop. |
| backgroundGap | number / snapGrid, else 20. Pattern spacing in chart units; positive and finite, otherwise RangeError. |
| alignmentGuides | boolean / false. During a pointer drag, snaps the moving box to the left, centre or right and top, middle or bottom of other nodes, and draws the guides. |
| guideThreshold | number / 6. Snap distance of the guides in screen pixels; finite and nonnegative, otherwise RangeError. |
| autoPan | boolean / false. Pans the camera while a node or group drag, a connection or reconnection drag, or a box selection is held within 40 screen pixels of the stage edge. |
| droppable | boolean / false. Accepts HTML drag and drop on the stage and emits node-drop(GraphDrop). |
| clipboard | boolean / false. Ctrl or Cmd with C, V and D emit copy-selection, paste-request and duplicate-selection. The names avoid the native copy, paste and drop events, so listeners such as @copy or @drop on the component still fall through to its root element. |
| node-drop(event) | GraphDrop has point (chart coordinates, rounded to snapGrid when set), clientX, clientY and dataTransfer. The type is exported from the Vue entry only because it refers to the DOM DataTransfer. |
| copy-selection(selection) / duplicate-selection(selection) | GraphClipboardSelection has nodeIds and edgeIds in input order and positions, a Map of the current top-left corner of each listed node. |
| paste-request(event) | GraphPaste has point: the pointer position while the pointer is over the stage, otherwise the centre of the viewport, rounded to snapGrid when set. |
| toGraphPoint(clientX, clientY) | Exposed method. The chart point under a viewport position, using the current camera and the stage position on the page. Throws Error before mount and RangeError for non-finite coordinates. |
| getViewportCenter() | Exposed method. The chart point at the centre of the stage. Before mount it uses the 1150 x 270 default viewport. |

Every new input is opt-in; without them the markup, events and keyboard behavior are unchanged.

Snapping moves a reference point: the top-left corner of the dragged or focused node, or of the bounding box of the moved nodes when a group label is dragged or focused. The other moved nodes keep their offsets from it, so the multiple selection and group members move rigidly; nodes that started off the grid stay off it relative to the reference. No node moves to a negative coordinate: a move that would cross the origin stops at the first grid line that keeps every moved node at zero or above. Emitted node-move and nodes-move proposals carry the snapped positions. A keyboard move only snaps the axis of its arrow key.

Alignment guides compare the dragged node's box, or the bounding box of every moved node when several move, with the boxes of the nodes that do not move. On each axis the closest anchor within guideThreshold screen pixels wins, ties being broken in the layout's box order; on that axis the guide wins over snapGrid. Guides for the final position, including positions the grid or the origin clamp happen to align, are drawn as lines with the class vw-guide inside an aria-hidden group (vw-guides) and in the colour --vw-guide; they disappear when the drag ends or is cancelled. With cullOffscreen only rendered nodes, those within the viewport and cullOverscan, are compared. Keyboard moves draw no guides. The same calculation is available as graphAlignmentGuides in the core entry.

Auto-pan uses requestAnimationFrame. The speed grows from 0 at 40 pixels from the edge to 20 pixels per frame at or beyond the edge, independently on each axis, and only after the gesture has moved (past the 4-pixel drag threshold, or once a connection or box preview exists). The preview stays under the pointer, the camera change emits viewport-change, and panning stops when the pointer is released, the gesture is cancelled (Escape, data change, a second touch) or the component unmounts. It never runs during a pinch. Towards the left and top it stops 40 pixels beyond the chart origin, or the content when that is further out; towards the right and bottom it continues while the pointer is held, so a node can be dragged into new space. Culling keeps the dragged nodes, their edges and the connection source rendered while the camera moves.

With droppable, dragenter, dragover and drop events on the stage call preventDefault, so the browser allows the drop; without it they keep their default handling. The component does not read dataTransfer; the application decides what the drop means and applies it, for example by adding a node at point and committing it to its history. HTML drag and drop needs a pointer, so give keyboard users an equivalent control: a button that adds the same item at getViewportCenter() (the demo palette chips do both). toGraphPoint also converts other screen positions, for example from a custom pointer interaction.

With clipboard, Ctrl+C (Cmd+C), Ctrl+V and Ctrl+D on the stage or one of its nodes, edges, group labels or handles emit proposals; keys pressed in focusable slot content such as an input keep their usual meaning, Alt or Shift with the key is ignored, and held keys do not repeat. Like deletion, a focused node or edge outside the selection is copied or duplicated alone; otherwise the selection is: selectedIds (or selectedId) plus the edge selection, and every edge between two listed nodes is added. Nothing is emitted, and the browser default is kept, when that is empty. paste-request is always emitted. Nothing is proposed during a pointer drag, connection, pan, box selection or pinch, nor while a keyboard connection is armed. The component keeps no clipboard: store what copy-selection reports, then build the copies with cloneGraphElements and commit them as one history entry. Ctrl+D is also the browser's bookmark shortcut; it is only cancelled when duplicate-selection is emitted.

The background pattern is a pattern element with an ID from useId, inside an aria-hidden group drawn behind the groups, edges and nodes; its rectangle ignores pointer events. Cells are backgroundGap chart units apart; when that is less than 8 screen pixels, every second (fourth, and so on) line is drawn. The dots and lines keep a 1-pixel size at every zoom level and use --vw-background-pattern (default --vw-grid). With a pattern, the root also receives vw-network-patterned, which replaces the fixed dotted backdrop with the plain --vw-surface-muted surface. The pattern is part of the server markup.

### Group collapse, edge styles and waypoints, level of detail and node resizing

| API | Behavior |
| --- | --- |
| collapsibleGroups | boolean / false. Draws a toggle button at the end of every group label strip (named "Collapse group" plus the group label, aria-expanded true) and on every proxy node ("Expand group" plus the label, aria-expanded false). The proxy toggle sits in the bottom corner at the text end, so it never covers the connection handle in the top corner; a proxy lower than 40 units gets it in the top corner opposite the handle. Click, Enter or Space toggles. Without collapsedGroupIds the component keeps the collapsed set itself. |
| collapsedGroupIds / update:collapsedGroupIds | ReadonlySet<string> / undefined. Controlled collapsed groups; supports v-model:collapsed-group-ids. It applies even without collapsibleGroups (then no toggles are drawn). IDs of groups that are not in groups are ignored. update:collapsedGroupIds is emitted with a new Set for every toggle. |
| edgeStyle | 'curve' \| 'orthogonal' \| 'straight' / 'curve'. curve keeps today's routes. orthogonal draws right-angle routes with 6-unit rounded corners, straight draws straight lines clipped to the box borders. Any other value throws RangeError while rendering. |
| GraphEdge.points | Optional waypoints in chart coordinates. The edge is drawn through them in every style: a polyline in straight and orthogonal, a smooth curve through the points in curve. |
| editableEdges | boolean / false. Gives every edge its focusable hit area (like edgesSelectable) and shows waypoint handles on the selected edge (the edge whose reconnect handles would show): a "Move waypoint N · edge" button per waypoint and an "Add waypoint N · edge" button in the middle of every segment between the edge ends and the waypoints. |
| edge-reshape(change) | GraphEdgeReshape with id, before and after: the edge's whole waypoint list before and after. Set the edge's points to after (remove the field when it is empty). |
| validateEdgeReshape / edge-reshape-rejected(change, reason) | Synchronous check; false rejects with labels.reshapeRejected, a string rejects with that reason, announced in the live region. |
| lodThreshold | number / undefined. Level of detail: while the camera scale is below it, the root gets vw-lod-low and the default renderer hides node detail text and edge labels. Must be greater than 0 and at most 3, otherwise rendering throws RangeError. Accessible names are unchanged. |
| node and edge slot scale | The node slot ({node, box, selected, dimmed, scale}) and the edge slot receive the current camera scale for custom level-of-detail rendering. |
| sizes | ReadonlyMap<string, GraphNodeSize> / undefined. Width and height per node ID, applied on top of the layout boxes after positions, keeping each box's top-left corner; incident edges are rerouted. Sizes must be finite and positive (RangeError); unknown IDs are ignored. |
| resizable | boolean / false. Shows four corner handles on the node when exactly one node is selected (selectedId, or a selectedIds set of one), named "Resize" plus the node label and the corner ("Resize Split · bottom right"). NetworkNode.resizable false opts a node out; proxies of collapsed groups are not resizable. |
| minNodeSize | GraphNodeSize / { width: 40, height: 24 }. Smallest size a resize proposes; finite and positive, otherwise RangeError. |
| node-resize(change) | GraphNodeResize with id, before and after boxes ({ x, y, width, height }). Store after.width and after.height in sizes and, when after.x or after.y changed (a left or top corner), after.x and after.y in positions. |
| validateNodeResize / node-resize-rejected(change, reason) | Synchronous check; false rejects with labels.resizeRejected, a string with that reason. |

Every input is opt-in. Without them, and with edgeStyle 'curve', no waypoints, no sizes and no collapsed groups, the server markup, routes, events and accessible names are unchanged. The toggles and handles are drawn in one vw-network-overlay group above the nodes, which then also holds the connection preview and alignment guides.

Collapsing uses collapseGraphGroups before layout, so the layout, culling, the minimap, Fit to view, fit, focusNode and exportSvg all see the collapsed graph. Each outermost collapsed group becomes one proxy node whose ID is the group ID, with the group label, the detail "N nodes" (labels.collapsedNode and labels.collapsedNodes), the rounded shape and data { collapsedGroup, nodeIds }. Members are hidden; their edges are re-attached to the proxy, edges inside the group are dropped, and parallel re-attached edges merge into one edge that keeps the ID of the first original edge. Group IDs must therefore differ from node IDs. A collapsed child group becomes a member of its expanded parent. Hidden nodes cannot be focused, fitted or selected; fit and focusNode throw Error for their IDs, so map them to the proxy (the group ID). Toggling moves keyboard focus to the replacement toggle.

Proposals that involve a proxy refer to the real data where they can:

- Moving a proxy (drag, arrow keys, a group label or a multiple selection that contains it) emits node-move or nodes-move for its movable members. They keep their offsets, and the top-left corner of their boxes in the expanded graph lands on the proxy's new position. A proxy is placed by the layout until one of its members has a saved position; from then on it sits at the top-left corner of its members.
- Deleting a proxy proposes its members; deleting a merged edge proposes all of its original edges. The GraphDeletion contains real IDs only.
- select, update:selectedId, update:selectedIds, box selection and connect proposals use the proxy ID. Reject connections to a proxy in validateConnection or map them to a member. Re-attached edges show no reconnect or waypoint handles, and proxies and hidden nodes are left out of copy-selection and duplicate-selection.

The orthogonal router leaves the source and enters the target on the sides that face each other along the layout direction (right and left for LR, left and right for RL, bottom and top for TB, top and bottom for BT), turning halfway between them. Boxes that overlap along that axis, such as nodes of the same rank, are joined by a bracket on the direction's outgoing side, and self-loops are brackets on that side. Named ports keep their anchors: the route leaves and enters perpendicular to the port side. A long-edge bypass lane drawn by layoutLayeredGraph is kept while both of its boxes are where the layout placed them. Moved and resized nodes are routed again. The straight style clips the line between the box centres, or towards the next waypoint, to the box borders. The orthogonal and straight styles also reroute the edges of a custom layout. Known limits: routes do not avoid other nodes, so orthogonal routes between distant or overlapping nodes and straight lines may cross boxes, and waypoints are absolute chart coordinates that do not follow moved nodes.

Waypoint and resize handles are focusable buttons. On a waypoint handle the arrow keys move it by 10 chart units (40 with Shift), or to the next snapGrid line (four with Shift); Delete or Backspace removes it and focus returns to the edge. Enter or Space on an add handle inserts a waypoint at that point. A pointer drag of a waypoint, or of an add handle, which inserts a new waypoint there, previews the route and proposes the new list on release; a press without movement on an add handle inserts the waypoint at the handle. On a resize handle the arrow keys move that corner's vertical or horizontal edge by 10 (40 with Shift), or to the next grid line; a pointer drag previews the box with the dragged edges on the grid when snapGrid is set. Resizes keep the opposite corner, minNodeSize and a nonnegative origin. Waypoints are clamped to nonnegative coordinates. Escape, pointer cancellation, a second touch and changes of the source data or layout cancel a drag in flight without a proposal. The new GraphLabels fields collapseGroup, expandGroup, collapsedNode, collapsedNodes, moveWaypoint, addWaypoint, reshapeRejected, resizeNode, topLeft, topRight, bottomLeft, bottomRight and resizeRejected localize the names and announcements.

### NetworkGraph directions and crossing reduction

`NetworkGraph` `options.direction` accepts `LR`, `TB`, `RL` and `BT`. Edge endpoints, edited positions, ports, groups, the minimap and culling follow the chosen direction; unnamed endpoints use the mirrored sides for RL and BT, and the default handle of a node without ports sits on its left edge in RL. `options.crossingReduction` (`none`, `barycenter`, `median`) and `options.crossingSweeps` are passed to `layoutLayeredGraph`; the defaults (`none`, 8) leave the layout identical to earlier versions. When the `layout` prop is set, it replaces the built-in layout and these two options are ignored, while `options.direction` still controls edge routing for moved nodes.

## GanttChart

| Prop | Type / default | Meaning |
| --- | --- | --- |
| rows | readonly R[] (R extends TimelineRow) / required | ID, label, optional detail and data. R is inferred; see [Typed data](#typed-data) |
| bars | readonly B[] (B extends TimelineBar) / required | ID, rowId, label, numeric start/end and optional attributes. B is inferred |
| range | TimeRange / required | Visible axis bounds; finite start < end |
| dependencies | readonly TimelineDependency[] / [] | ID, from/to bar IDs, optional FS/SS/FF/SF type and optional `lag` (see [Dependency lag](#dependency-lag)) |
| highlightedDependencyIds | ReadonlySet<string> / undefined | Highlight link IDs using --vw-dependency-highlight |
| selectedIds | ReadonlySet<string> / undefined | Controlled highlighted bars |
| pixelsPerUnit | number / 80 per hour in milliseconds | Base linear time scale |
| scale | TimeScale / undefined | Custom mapping before component zoom |
| tickSteps | readonly number[] / 30m, 1h, 2h, 4h, 24h | Positive ascending intervals in the same units as data. The chart uses the first step whose narrowest visible tick spacing is at least 76 px, and draws one grid line at each tick's scale position, as the SVG export does |
| snap | number / 900000 | Edit displacement step; 15 minutes in milliseconds |
| minDuration | number / snap | Minimum duration for resizing |
| editBounds | TimeRange / range | Bounds for edit proposals |
| formatTime | (number) => string / UTC HH:mm | Tick labels and accessible bar labels |
| formatLag | (number) => string / `formatDependencyLag` | Text of a non-zero dependency `lag` on its connector and in its description; see [Dependency lag](#dependency-lag) |
| baselineIds, baselineLabel, formatVariance | readonly string[] / the first 3 of `timelineBaselineIds(bars)`, (id: string) => string / `labels.baseline` or the set ID, (number) => string / `formatDependencyLag` | Which baseline sets are drawn and in what order, their names and the text of their variance; see [Baseline sets](#baseline-sets) |
| rowHeight | number / 66 | Fixed row height, at least 8 + laneCount × 14 |
| laneCount | integer / 1 | Lanes per row |
| height | number or CSS string / 316px | Scroll viewport height |
| readonly | boolean / false | Disables editing |
| validateEdit | EditValidator / undefined | Synchronous hook accepting or rejecting a proposal |
| labels | Partial<GanttLabels> / English | region, rows, empty, zoom, zoomIn, zoomOut, editHint, rejected, plus the optional fields described in the sections below (for example progressOf and deleteHint) |
| showControls | boolean / true | Zoom buttons |
| autoScroll | boolean / true | Scrolls the timeline horizontally while a pointer drag is held near the left or right edge of the viewport. Set false to disable |
| dir | ChartDirection / ltr | `rtl` or `auto` places row headings on the right and runs time from right to left; see [Right-to-left layout](#right-to-left-layout) |
| nonWorkingPeriods | readonly TimeRange[] / undefined | Shades non-working time behind the grid; see [Calendar shading, critical path, float and segments](#calendar-shading-critical-path-float-and-segments) |
| progressEditable, progressStep, validateProgressEdit | boolean / false, number / 0.05, ProgressEditValidator / undefined | Progress slider proposals; see [Progress editing, deletion, tooltips, context menu and fit](#progress-editing-deletion-tooltips-context-menu-and-fit) |
| deletable, validateBarsDelete | boolean / false, BarsDeleteValidator / undefined | Delete or Backspace proposes removing bars; see the same section |
| tooltipDelay | number / 400 | Hover delay in milliseconds of the opt-in tooltip slot |
| contextMenu | boolean / false | Emits context-menu instead of opening the browser menu; see the same section |
| creatable, createDuration, validateCreate | boolean or (row: R) => boolean / false, number / 4 × snap, CreateValidator / undefined | A drag or click on an empty part of a row, or its add button, proposes a new bar; see [Drag to create and cascade previews](#drag-to-create-and-cascade-previews) |
| cascade | TimelineCascade / undefined | Follow-on changes of other bars for a move or resize, previewed during a drag and proposed with it as one batch; see the same section |
| rowsReorderable, validateRowMove | boolean / false, RowMoveValidator / undefined | A move handle on each row heading proposes row hierarchy moves by pointer drag or Alt+arrow keys; see [Row hierarchy moves, status date and progress line](#row-hierarchy-moves-status-date-and-progress-line) |
| statusDate, showProgressLine | number / undefined, boolean / false | Draws a labelled status-date line and, with showProgressLine, a progress line; see the same section |
| constraintsEditable, validateConstraintEdit | boolean / false, ConstraintEditValidator / undefined | Handles at the `constraints` of editable bars propose moves and removals through `constraint-edit`; see [Scheduling constraints](#scheduling-constraints) |
| columnsResizable, labelWidth, minColumnWidth, maxColumnWidth, validateColumnResize | boolean / false, number / undefined (the `--vw-row-label-width` theme value), number / 48, number / 800, ColumnResizeValidator / undefined | Resize separators on the row label column and each extra column propose new widths by pointer drag or arrow keys; see [Column resizing](#column-resizing) |

TimelineRow<D> has id, optional parentId, label, optional detail and data (D, default unknown). TimelineBar<D> adds lane (zero-based, default 0), tone, appearance (solid/outline), editable (default false), progress (0–1) and data (D, default unknown), plus baseline and baselines (see [Timeline planning overlays](#timeline-planning-overlays) and [Baseline sets](#baseline-sets)), the optional critical, latestEnd, deadline and segments fields described in [Calendar shading, critical path, float and segments](#calendar-shading-critical-path-float-and-segments), constraints, described in [Scheduling constraints](#scheduling-constraints), and deletable (default editable), described in [Progress editing, deletion, tooltips, context menu and fit](#progress-editing-deletion-tooltips-context-menu-and-fit). A zero-duration bar is a milestone. Equal start/end intervals can move; resize handles require duration >= minDuration. Intervals use half-open [start,end) visibility; a milestone exactly at the axis end is outside the displayed window.

Display bars may extend beyond the axis. Editing is enabled only for intervals contained in editBounds. With custom numeric units, supply matching pixelsPerUnit, tickSteps, snap and formatTime.

Dependencies connect explicit endpoints. FS means source finish to target start; SS start to start; FF finish to finish; SF start to finish. These paths visualize relationships. Your application can enforce scheduling constraints in validateEdit or an authoritative backend.

### Editing contract

select(id) reports a bar activated by click or keyboard (Enter/Space). It fires once per click, on release, including after a drag. validation-error(error) fires when rows (including missing parents and hierarchy cycles), bars, dependencies, range, scale, pixelsPerUnit, snap, minDuration, rowHeight, laneCount, tickSteps, nonWorkingPeriods, progressStep, tooltipDelay, createDuration, statusDate, labelWidth, minColumnWidth or maxColumnWidth are invalid, when columns have a missing or duplicate ID or a width that is not finite and positive, when headerBands (or those of the active zoom preset) are not finite, ordered and nonoverlapping within a level, when markers have a missing or duplicate ID or a non-finite time, when `baselineIds` has an empty or duplicate ID or more than three IDs, or when a column uses the reserved ID `timelineLabelColumnId` while `columnsResizable` is set. The chart then renders its empty state instead of the invalid data, and the error is still rethrown inside the component so development builds surface it. A later valid update clears the state. edit(change) reports a proposal with the following shape.

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

Pointer cancellation, loss of capture and Escape discard the preview. Changes to source bars, rows, bounds or the coordinate system cancel an active drag. These props are watched by reference, so pass new arrays and objects instead of mutating them in place. `range`, `editBounds` and `tickSteps` are compared by value: a new but equal object or array, such as an inline literal in a parent template, neither re-runs validation nor cancels a drag. `scale` keeps reference semantics. A drag, connection or other pointer gesture belongs to one pointer; while it is in flight, a press of another pointer (for example a pen next to the mouse) starts nothing. While a drag is held near the horizontal edge of the viewport, the timeline scrolls and the preview follows the pointer (autoScroll). A focused bar stays rendered even when an edit moves it outside the visible window, and after a keyboard edit is applied the chart scrolls horizontally only if the bar's new range is outside the viewport. Selection does not change the source intervals. Arrow keys move focused editable intervals by snap; Shift changes the end; Alt changes the start. Move snapping uses displacement relative to the original interval, so an off-grid start retains its offset.

Slots are legend(), row-heading(), row({row,index}), bar({bar,range,selected}), tick({time,label}), empty() and the opt-in tooltip({bar,range,selected}). The bar slot is inside a button. Use noninteractive content inside it. Keep row and bar slot contents within the configured dimensions. Methods are scrollToTime(time), scrollToRow(rowId), cancelEdit(), exportSvg(options), exportPng(options) and fitToBars(ids, options); see [Export to SVG and PNG](#export-to-svg-and-png) and [Progress editing, deletion, tooltips, context menu and fit](#progress-editing-deletion-tooltips-context-menu-and-fit).

### Timeline planning overlays

| API | Behavior |
| --- | --- |
| TimelineRow.parentId | Optional existing row ID. The tree is rendered in preorder. Siblings follow input order. |
| collapsedIds / update:collapsedIds | Optional controlled set of collapsed row IDs. The component manages the set when the prop is omitted. |
| TimelineBar.baseline | Optional original start/end interval. Drawn below the bar and independent of edits to the main interval. It is the baseline set `timelineBaselineId`; for several named sets see [Baseline sets](#baseline-sets). |
| headerBands | Array of header levels, each with ordered non-overlapping intervals containing start, end and label. Levels appear above the default ticks. |
| markers | Array of unique IDs with finite time and label. Drawn as vertical markers in the visible time window. |

The row slot also receives depth and expanded. The row index refers to the expanded view. Links with hidden endpoints disappear while the group is collapsed. scrollToRow targets expanded rows. Any summary interval or progress can be supplied as a bar on the parent row. The optional GanttLabels fields expandRow, collapseRow and baseline localize these additions. CSS variables --vw-baseline and --vw-marker theme the overlays.

### Baseline sets

A bar can carry several saved baselines, for example the original plan and a revision, and the chart can draw up to three of them at once. Charts whose bars only use `TimelineBar.baseline` and that do not set `baselineIds` render exactly as before.

| API | Behavior |
| --- | --- |
| TimelineBar.baselines | Optional `readonly TimelineBaseline[]`. A `TimelineBaseline` is a `TimeRange` with an `id` that names its set (for example `plan` or `rev1`). Each bar has at most one entry per set, with finite `start` and `end` and `end >= start` (a zero-length baseline is drawn like a milestone baseline). The set ID `timelineBaselineId` (`'$baseline'`) is reserved. `validateTimelineData` throws an Error for a missing, empty, duplicate or reserved set ID or a value that is not an array, and a RangeError for invalid times, so the chart reports them through `validation-error`. |
| TimelineBar.baseline | The single unnamed baseline. It takes part in selection as the set `timelineBaselineId` and can be combined with `baselines`; it keeps its meaning and its default label `labels.baseline`. |
| baselineIds | The sets to draw, in slot order: up to `timelineBaselineLimit` (3) unique nonempty IDs, with `timelineBaselineId` for `baseline`. An ID that no bar has keeps its slot, so a set does not move while data changes. `[]` draws no baselines at all. When omitted, the chart draws the first three IDs of `timelineBaselineIds(bars)`: `timelineBaselineId` when any bar has a `baseline`, then the named sets in order of first appearance; further sets are not drawn. Compared by value, like `range`. More than three IDs, an empty ID or a duplicate is a validation error. |
| baselineLabel(id) | Name of a set in titles and descriptions. Default: `labels.baseline` ("Baseline") for `timelineBaselineId` and the set ID otherwise. |
| formatVariance(delta) | Text of a variance in titles and descriptions. Default `formatDependencyLag`, signed hours of milliseconds such as `+2 h`; charts in other units should pass their own. |
| GanttLabels.baselineStart, baselineFinish, baselineDuration | Words before the three variances. Defaults "start", "finish" and "duration". |

**Layout.** With one selected set the strip is drawn as the single baseline always was: 4 px high, 1 px below the bar. With two or three selected sets every lane keeps its height and the row height never changes: the strips are 3 px high and 1 px apart, slot 1 directly below the bar, and the bars are drawn shorter so the strips fit in the lane (3 px shorter for two sets and 7 px for three, which is `4 × n − 5`). Dependency ends, float lines, deadline indicators and the progress line follow the shorter bars. Use a `rowHeight` that leaves the bars enough height with three sets (the default 66 gives 45 px bars; the minimum `8 + laneCount × 14` leaves 1 px). The number of selected IDs decides the layout, not the number of sets a bar has, so all bars keep the same height and every set keeps its slot. A selection change that changes the bar height cancels a gesture in flight, like other coordinate changes.

**Styling.** Each strip has the class `vw-gantt-baseline`. With two or three sets it also has `vw-gantt-baseline-1`, `-2` or `-3` for its slot, coloured with `--vw-baseline`, `--vw-baseline-2` and `--vw-baseline-3`, and in forced-colors mode with `GrayText`, `CanvasText` and a dashed `CanvasText` strip. Whenever named sets are present or `baselineIds` is set, each strip also carries `data-vw-baseline` with its set ID, for application styles per set. In right-to-left charts the strips are mirrored with the bars; they are printed with exact colours like the rest of the chart.

**Accessibility and variance.** As before, a strip is not focusable and has a `title`: `Baseline · <bar label> <start>–<end>` for the single baseline. Whenever named sets are present or `baselineIds` is set, the title adds the variance (`<set label> · <bar label> <start>–<end> · start +1 h, finish +1 h, duration +0 h`) and each drawn set of a bar is added, in slot order, to the bar's description (`aria-describedby`, after the critical, float, deadline and late entries), for example `Plan 09:00–11:00: start +0.5 h, finish +0.5 h, duration +0 h.` Accessible names do not change. The variance is `baselineVariance(bar, baseline)` against the bar as drawn, so it follows a drag preview. A `tooltip` slot can show the same numbers with `baselineVariance` and `timelineBaseline`.

**Summaries.** Summary rows (`showSummaries`) do not roll up baselines, as before: supply a bar on the parent row with its own `baseline` or `baselines` to show a summary baseline.

**Export.** `exportSvg`, `exportPng` and `renderTimelineSvg` draw the same sets with the same layout, colours (theme `baseline`, `baseline2` and `baseline3`) and titles; `renderTimelineSvg` takes `baselineIds`, `baselineLabel`, `formatVariance` and `varianceLabels` options. `toMsProjectXml` writes numbered baselines (`MsProjectTask.baselines`); see [Interchange exports](#interchange-exports).

```ts
import { baselineVariance, timelineBaseline } from 'vue-weave/core'

const bars = tasks.map(task => ({
  id: task.id, rowId: task.id, label: task.name, start: task.start, end: task.end,
  baselines: [{ id: 'plan', ...task.planned }, { id: 'rev1', ...task.revised }],
}))
// <GanttChart :bars="bars" :baseline-ids="['plan', 'rev1']" :baseline-label="id => names[id]" ... />
const slip = baselineVariance(bars[0], timelineBaseline(bars[0], 'plan')!).end
```

### Timeline columns and rollups

| API | Behavior |
| --- | --- |
| columns | Extra sticky columns (`TimelineColumn<R>`) described by id, label, width in pixels, value(row, summary) and optional editable. An editable predicate can limit editing to individual rows. Both callbacks receive the chart's row type R. |
| cell-edit(change) | Proposes rowId, columnId, before and after. The input supplies after as a string. The parent converts, validates and persists the value as needed. |
| validateCellEdit / cell-edit-rejected | Uses the same accept or reject convention as bar edits. Rejection retains the accepted cell value and reports the reason. |
| cell slot | Customize the cell using row, column, value and summary. A custom editor owns its interaction and persistence. |
| showSummaries | Draw an aggregated interval on a parent row without an explicit bar. Collapse hides descendants and preserves the parent rollup. |

Enter or blur submits a default editor and Escape discards the input. The chart-level readonly prop disables editing. Keep the sticky columns narrow enough to leave room for the timeline.

### Column resizing

Opt-in with `columnsResizable`. Without it and without `labelWidth`, the chart renders the same markup as before (server output is byte-identical), and pointer, keyboard, events and names are unchanged. Column widths stay controlled: the chart previews a drag and proposes the result, and the parent applies it.

| API | Behavior |
| --- | --- |
| columnsResizable | `boolean`, default false. A separator (`vw-column-resize`, `role="separator"`, `aria-orientation="vertical"`, focusable) sits on the inline-end edge of the row label column and of each `columns` header. Its accessible name is `GanttLabels.resizeColumn` (default "Resize column") followed by the column label, or by `GanttLabels.rows` for the label column, for example "Resize column Owner". `aria-valuenow` is the current width in pixels, `aria-valuemin` and `aria-valuemax` the limits. Separators are also drawn when `readonly` is set, because widths are not data. |
| labelWidth | `number` in pixels. Sets `--vw-row-label-width` on the chart canvas; without it the label column keeps the theme width (154 px, 106 px on narrow screens). Set it to accept a proposal for the label column. A value that is not finite and positive is reported through validation-error. |
| minColumnWidth, maxColumnWidth | Limits of every proposal in pixels, defaults 48 and 800. `maxColumnWidth` must not be below `minColumnWidth`. Existing widths outside the limits are drawn as given. |
| column-resize(change) | `TimelineColumnResize`: `id` (the `TimelineColumn.id`, or `timelineLabelColumnId`, `'$label'`, for the row label column), `before` and `after` widths in pixels (whole numbers within the limits) and `source` (`pointer` or `keyboard`). Accept it by setting that column's `width`, or `labelWidth` for the label column. An unchanged width is not proposed. |
| validateColumnResize / column-resize-rejected(change, reason) | Synchronous `ColumnResizeValidator`. Accepts with true or undefined, rejects with false (default `GanttLabels.columnResizeRejected`, "This column resize was rejected.") or a reason string. The reason is announced in the live region. |

**Keyboard.** On a focused separator, ArrowRight and ArrowLeft move the column edge 10 px on screen (40 px with Shift): in left-to-right charts ArrowRight widens the column, in right-to-left charts, where the edge is on the left, ArrowLeft widens it. Home proposes the minimum and End the maximum width.

**Pointer.** Press the primary button (or touch) on a separator and drag horizontally. The column, the cells below it and the timeline follow the preview; the label width before the drag is the rendered one. Release proposes the previewed width with `source: 'pointer'`. Escape, pointer cancellation, lost capture, a change of `columns`, `labelWidth`, the limits, `columnsResizable`, the direction or the other source props listed in the editing contract cancel the drag without a proposal.

```ts
import { timelineLabelColumnId, type TimelineColumn, type TimelineColumnResize } from 'vue-weave/core'

const labelWidth = ref<number>()
function onColumnResize(change: TimelineColumnResize) {
  if (change.id === timelineLabelColumnId) labelWidth.value = change.after
  else columns.value = columns.value.map(column => column.id === change.id ? { ...column, width: change.after } : column)
}
```

### Dependency editing

| API | Behavior |
| --- | --- |
| connectable | Shows a link handle at the start and finish of every rendered bar. Drag from one handle to another handle or onto a bar body (the nearer end is used). Alternatively, activate two handles with click, tap, Enter or Space. |
| reconnectable | Select a dependency, then drag its source or target endpoint handle to another bar end, or activate the endpoint handle and then a bar handle. |
| validateConnection(connection, replacingDependencyId?) | Synchronous TimelineConnectionValidator. Accepts with true or undefined, rejects with false (default message "This dependency was rejected.") or a reason string. During reconnection it receives the existing dependency ID. |
| connect(connection) | TimelineConnection with from, to and type. The type is derived from the joined ends: finish→start is FS, start→start SS, finish→finish FF and start→finish SF. The parent assigns an ID and updates dependencies. A new connection never carries a `lag`. |
| reconnect(change) | TimelineReconnect with id, before and after connections. The parent replaces from, to and type on the existing dependency. A dependency with a non-zero `lag` keeps it: both connections then carry `lag`, and `validateConnection` receives the `after` connection with it. |
| connect-rejected(connection, reason) | Reports a rejected proposal. The reason is announced in the live region. |
| selectedDependencyId / update:selectedDependencyId | Optional controlled dependency selection. The component tracks the selection locally when the prop is omitted. |
| dependency-select(id) | A dependency path was activated by click, Enter or Space. Dependency paths are focusable only when connectable or reconnectable is set. |
| dependency-delete(id) | Delete or Backspace was pressed on a focused dependency. The parent removes it from dependencies to accept. Not emitted when readonly is set. |

A bar cannot link to itself, and reconnecting a dependency to its existing endpoints proposes nothing. Escape, pointer cancellation and loss of capture discard a pending connection. Changes to bars, rows, dependencies, the coordinate system or the connectable and reconnectable props cancel an in-flight connection, including one armed from the keyboard. Handles are hidden and no `connect`, `reconnect` or `dependency-delete` proposal is emitted when readonly is set; selecting a dependency (`dependency-select`) stays possible, like selecting a bar.

### Dependency lag

`TimelineDependency.lag` is optional: the elapsed time between the linked bar ends, in the units of `range` (milliseconds by default). A negative lag is a lead. The chart draws the dependency between the bar ends as before and does not enforce the lag; it is information for the reader, the export and your scheduler. A dependency without `lag`, or with `lag: 0`, renders exactly as before: server markup, accessible names and descriptions, event payloads and `renderTimelineSvg` output are byte-identical.

| API | Behavior |
| --- | --- |
| TimelineDependency.lag | `number`, optional. A value that is not a finite number is reported through validation-error as a RangeError (`validateTimelineData`). |
| formatLag | `(lag: number) => string`, default `formatDependencyLag`: signed hours of a millisecond lag rounded to two decimals, such as `+2 h`, `+0.5 h` or `−1.5 h` (U+2212 minus sign). It is called only for a non-zero lag. Charts in other units, or that want days or local wording, pass their own formatter, as they do with `formatTime`. |
| `vw-gantt-lag` | The label: an SVG `text` element in its own layer (`vw-gantt-lag-layer`, an `aria-hidden` SVG right after the dependency layer and stacked above the marker, now and status-date lines, so a line that crosses a label never covers its text; `renderTimelineSvg` likewise draws the labels after those lines), drawn in the gap at the edge of the source row that faces the target, beside the connector's first bend and towards later times; a link within one row is labelled above the connector. It uses `--vw-text` with a `--vw-surface` halo, and `--vw-dependency-highlight` (class `vw-is-highlighted`) for a dependency in `highlightedDependencyIds`. It is drawn whenever the connector is drawn and hidden with it (virtualized rows and time windows, collapsed rows). In a right-to-left chart the layer is mirrored as a whole and each label is turned back in place, so the text reads normally. |
| GanttLabels.lag | Description prefix, default "Lag". With `connectable` or `reconnectable`, the focusable dependency keeps its accessible name ("Select dependency Wireframes → Billing API FS") and is described by the label: "Lag +2 h". Without them the dependency layer is decorative, as before. |
| reconnect | Keeps the lag, see [Dependency editing](#dependency-editing). |

`exportSvg`, `exportPng` and `renderTimelineSvg` (option `formatLag`) draw the same label. `ScheduleLink` extends `TimelineDependency`, so the same dependency array can feed the chart and `scheduleTasks`, `propagateEdit` (and therefore a `cascade` callback) and `rescheduleFromStatusDate`, which all apply the lag; `toMsProjectXml` writes it as `LinkLag`. With epoch milliseconds the scheduler requires each lag to be a multiple of its `quantum`.

The chart does not edit lags. Change one through your own UI and replace the dependency, for example from the dependency selection or the context menu, whose events carry the dependency ID:

```ts
function editLag(id: string, hours: number) {
  dependencies.value = dependencies.value.map(dep => dep.id === id ? { ...dep, lag: hours * 3_600_000 } : dep)
}
// <GanttChart ... connectable @dependency-select="id => (editing = id)"
//   context-menu @context-menu="menu => menu.target.kind === 'dependency' && (editing = menu.target.id)" />
```

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
| zoom-change(state) | TimelineZoomState with zoom factor and the active preset ID. Fires for zoom buttons, presets, pinch zoom and wheel zoom. |
| showNow / now | Draws a "now" marker (GanttLabels.now). Supply now for deterministic and server-rendered output. Without now, the clock is read only after mounting and refreshed every 30 seconds, so server and client markup match. The marker appears only inside range. |
| pinchZoom | Two touch pointers on the timeline zoom the time axis around their midpoint, between 65% and 300%. The second touch cancels an in-flight edit or connection. One-finger touches and mouse input are unchanged. The scroll area uses `touch-action: pan-x pan-y` so native scrolling continues while the browser's page zoom is suppressed there. |
| wheelZoom | `boolean`, default false. Ctrl+wheel or Meta+wheel over the chart zooms the time axis between 65% and 300%, keeping the time under the pointer in place (the pointer is clamped to the visible time area). Desktop trackpad pinches arrive as Ctrl+wheel and zoom the same way. Each event scales the zoom by `1.35^(−deltaY / 100)` in pixels (lines count 16 px), clamped to one zoom button step, so one mouse wheel notch equals one button step and small trackpad deltas zoom smoothly. The event is cancelled so the browser does not zoom the page, also at the limits. Like the second touch of a pinch, it cancels an in-flight gesture or armed connection without a proposal, and it hides the tooltip. A plain wheel is never handled and keeps native scrolling. The non-passive `wheel` listener is attached after mounting only while the prop is set and removed when it is cleared or the chart unmounts; without the prop nothing changes. |

Presets apply to the built-in linear scale. A custom scale prop still controls the mapping; only tick steps, header bands and snap come from the preset in that case. Use `calendarBands` from the core entry to build header levels for presets; pass its `timeZone` option to keep them on local midnights and hours across daylight-saving transitions.

### Resource load histogram

| API | Behavior |
| --- | --- |
| loadRows | TimelineLoadRow[] with unique id, label and optional detail. Each row is drawn below the task rows on the same time axis, scroll surface and horizontal virtualization. |
| loadSegments | TimelineLoadSegment[]: resourceId, start, end, load, capacity, optional overload and taskIds. The output of calculateResourceLoad can be passed directly. Segments must reference a load row and must not overlap within a resource. |
| loadRowHeight | number / 44. At least 16. |
| load-row slot | Customize the label using row and peak. |
| load-segment slot | Customize a segment using segment, row, peak and overload. The slot content is inside an element with role img and an accessible label. |

Each segment is scaled to the row's peak load or capacity. The default rendering fills load up to capacity, highlights the overloaded part and draws a dashed capacity line. Segments carry an accessible label such as "CNC cell 09:00–10:00: load 2 / capacity 1, overloaded by 1", built from formatTime and the GanttLabels fields load, capacity and overload; the load row group is named with loadRegion. Invalid load data is reported through validation-error.

### Calendar shading, critical path, float and segments

All of these are opt-in. Without `nonWorkingPeriods` and the new bar fields, the chart renders no new elements, classes or attributes, and accessible names and descriptions are unchanged.

| API | Behavior |
| --- | --- |
| nonWorkingPeriods | Half-open intervals drawn as background bands (`vw-gantt-non-working`, colour `--vw-non-working`) over the full body height, task rows and load rows, behind grid lines and bars. Only the parts inside `range` and the visible time window are rendered. Intervals may overlap and need not be sorted. A non-finite endpoint or `start >= end` is reported through validation-error. The bands are decorative (`aria-hidden`). `invertWorkPeriods` turns work periods into these intervals. |
| TimelineBar.critical | `true` adds the `vw-critical` class and an outline in `--vw-critical`. |
| TimelineBar.latestEnd | Latest finish that keeps the plan. A float line (`vw-gantt-float`, `--vw-float`) runs from the bar's end to latestEnd at the bar's vertical centre, ending in a short tick. Nothing is drawn when latestEnd equals end. Must be finite and not before end (RangeError). |
| TimelineBar.deadline | A due time. A small indicator (`vw-gantt-deadline`, `--vw-deadline`) is drawn at that time in the bar's lane. When end is after the deadline, the bar gets the `vw-late` class and a dashed outline, and the indicator gets `vw-late`. Must be finite (RangeError). |
| TimelineBar.segments | The worked pieces of a split bar: sorted, non-overlapping, positive-length intervals inside [start, end]. Touching pieces are allowed. The bar gets the `vw-segmented` class, each piece is drawn solid (`vw-gantt-segment`) and every gap, including one before the first or after the last piece, is drawn as a thin connector (`vw-gantt-segment-gap`). Progress fills the first part of the working time piece by piece, so a half-complete bar fills half of its work. An empty array or segments on a milestone are rejected with a RangeError. |
| GanttLabels.critical / float / deadline / late | Text of the bar description. Defaults "Critical", "Float until", "Deadline" and "Late". |

When a bar has any of these fields, the information is added to the bar's accessible description, never to its accessible name, which keeps the `formatTime` label used by tests and assistive technology. The description reads, for example, "Critical. Float until 09 Nov 16:00. Deadline 09 Nov 17:00. Late." (float and deadline times use `formatTime`). It is a hidden element referenced first in `aria-describedby`, before the edit hint of an editable bar, and it is also appended to the bar's `title` tooltip.

Float lines and deadline indicators are rendered whenever they intersect the visible time window, even if their bar is outside it, and follow the bar in a pointer preview: the float line starts at the previewed end and the late state uses the previewed end. Edit proposals (`TimelineEdit`) are unchanged and carry only `start` and `end`. During a pointer move preview the segments shift with the bar by the same displacement. During a resize preview the bar is drawn without segments, because the new work pattern depends on the calendar: the parent reschedules after accepting the edit and supplies new `segments`, `latestEnd` and `critical` values. Keyboard edits are proposed at once without a preview.

```ts
import { invertWorkPeriods, scheduleTasks, scheduledBarFields } from 'vue-weave/core'

const plan = scheduleTasks({ range, calendars: [{ id: 'plant', periods }], defaultCalendarId: 'plant', tasks, dependencies })
const bars = plan.ok ? plan.tasks.map(task => ({ id: task.id, rowId: task.id, label: task.id, ...scheduledBarFields(task) })) : []
const nonWorkingPeriods = invertWorkPeriods(periods, range)
```

`exportSvg`, `exportPng` and `renderTimelineSvg` draw the same layers with the colours of `--vw-non-working`, `--vw-critical`, `--vw-float` and `--vw-deadline`. In a right-to-left chart every layer is mirrored with the time axis.

### Progress editing, deletion, tooltips, context menu and fit

All of these are opt-in. Without `progressEditable`, `deletable`, `contextMenu` and the `tooltip` slot, the chart renders the same markup as before (server output is byte-identical), and keys, pointer behaviour, names and descriptions are unchanged.

| API | Behavior |
| --- | --- |
| progressEditable | boolean / false. Draws a progress slider at the progress boundary of every editable, non-milestone bar (undefined progress counts as 0) unless `readonly` is set. Editing does not depend on `editBounds`. |
| progressStep | number / 0.05. Every proposal is snapped to this step; exactly 0 and 1 are always reachable. Must be greater than 0 and at most 1, otherwise a RangeError is reported through validation-error. |
| progress-edit(change) | `TimelineProgressEdit` with `id`, `before` (the bar's `progress`, possibly undefined), `after` (0 to 1) and `source` (`pointer` or `keyboard`). The parent sets the bar's `progress` to `after` to accept. A change that keeps the drawn value (`after === (before ?? 0)`) is not proposed. `TimelineEdit` is unchanged. |
| validateProgressEdit / progress-edit-rejected(change, reason) | Synchronous `ProgressEditValidator` with the same convention as validateEdit. The reason is announced in the live region. |
| deletable | boolean / false. Delete or Backspace on a focused deletable bar proposes removing it. A bar is deletable when the prop is set, the chart is not readonly and `TimelineBar.deletable ?? TimelineBar.editable` is true. Deletable bars are described by `GanttLabels.deleteHint`. |
| bars-delete(ids) | Emitted once per key press. With `multiSelect`, when the focused bar is selected, `ids` lists every selected deletable bar in input order; otherwise only the focused bar. Nothing is emitted during an edit or progress drag, a pending connection (including one armed from the keyboard) or a pinch. Use `removeTimelineBars` to accept. `dependency-delete` is unchanged. |
| validateBarsDelete / bars-delete-rejected(ids, reason) | Synchronous `BarsDeleteValidator`; true or undefined accepts, false (default message `GanttLabels.rejected`) or a string rejects. The reason is announced in the live region. |
| tooltip slot | `{ bar, range, selected }`, where `range` is the displayed interval (the preview while one is shown). Rendered only when the slot is provided, never on the server or before mounting. |
| tooltipDelay | number / 400. Milliseconds before a hover shows the tooltip. Finite and nonnegative, otherwise a RangeError is reported through validation-error. |
| contextMenu | boolean / false. Handles `contextmenu` on the chart region (default prevented) and the ContextMenu key and Shift+F10 on a focused bar, progress slider, constraint handle or dependency path. |
| context-menu(event) | `TimelineContextMenu`: `target` (`{ kind: 'bar', id }`, `{ kind: 'dependency', id }`, `{ kind: 'row', id }` or `{ kind: 'chart' }`), `time?`, `rowId?`, `clientX`, `clientY` and `source`. The component renders no menu. |
| fitToBars(ids?, options?) | Exposed method. Zooms so the union interval of the bars fits, then scrolls it into view. Returns a promise that resolves once the scroll position is applied. |

The progress slider is a `button` with `role="slider"`, `aria-valuemin` 0, `aria-valuemax` 100, `aria-valuenow` in percent and `aria-valuetext` such as "40%". Its accessible name is `GanttLabels.progressOf` (default "Progress of") followed by the bar label. Dragging it previews the fill and proposes the snapped value on release. On a segmented bar the pointer is mapped to progress over working time, as the fill is drawn: the slider sits where that share of the work is done, and a pointer in a gap counts the work before the gap. ArrowRight and ArrowUp add one step, ArrowLeft and ArrowDown subtract one, PageUp and PageDown change it by 0.25, Home sets 0 and End sets 1. Each key press proposes one change from the bar's current `progress`. In a right-to-left chart progress grows towards the left, so ArrowLeft adds a step and ArrowRight subtracts one. Escape, pointer cancellation, lost capture, changes to bars, rows, the coordinate system, `progressEditable`, `progressStep` or `readonly`, and the start of a `pinchZoom` pinch cancel the preview without a proposal.

After an accepted deletion removes the focused bar, focus moves to the chart region. The tooltip appears next to the hovered bar after `tooltipDelay`, or at once when a bar receives keyboard focus (`:focus-visible`). It has `role="tooltip"` and an ID from `useId()`, which is appended to the bar's `aria-describedby` list after the existing description and hint IDs while it is shown. It is placed above the visible part of the bar, or below it when there is no room, and kept inside the scroll viewport. The pointer can move onto it without hiding it. Escape hides it until the pointer re-enters the bar or the bar is focused again. Pressing a bar hides it, and it does not appear during bar drags and resizes, progress drags, pending connections, pinches or drag autoscroll. Its timers are cleared when the component unmounts. Style it with the `vw-gantt-tooltip` class.

For a pointer `contextmenu`, `target` is the bar under the pointer (including its link handles, progress slider and constraint handles), else the dependency path (dependency paths are interactive only with `connectable` or `reconnectable`), else the displayed task row under the pointer (its heading, cells or empty timeline area), else `chart` (the header, load rows or empty space). `rowId` is that task row, and `time` is the time under the pointer through the active scale, including zoom and right-to-left layout, whenever the pointer is over the time area (not the sticky heading column). Text inputs in `columns` keep the browser menu. The ContextMenu key and Shift+F10 report the focused element's on-screen centre, `source: 'keyboard'`, no `time`, and for a bar its `rowId`. Without `contextMenu` the browser menu is not affected. With or without `contextMenu`, a `contextmenu` event during a pointer gesture (move, resize, progress, connection, create, row or column drag, or a pinch), such as a macOS Control-click, cancels the gesture without a proposal like `cancelEdit()`, because the native menu can swallow `pointerup`; an armed keyboard connection is kept. The same holds for a constraint drag. With `contextMenu` the menu is then reported as usual.

`fitToBars(ids?: Iterable<string>, options?: TimelineFitOptions)` uses every bar in the displayed rows when `ids` is omitted; explicit IDs may also name bars in collapsed rows. It chooses the zoom factor so that the union of the bars' intervals spans the visible time area minus `padding` screen pixels on each side (default 24), clamped to the zoom limits (65% to 300%), then scrolls the union to the centre when it fits, or to `padding` from the inline-start edge when it does not. Scrolling stops at the ends of the axis, so a union that touches `range.start` or `range.end` sits at that edge. Unknown IDs throw an Error and a negative or non-finite padding throws a RangeError, synchronously; an empty set does nothing. The zoom factor scales the base scale linearly, so the fit is exact for a custom `scale`, including a non-linear one. With `zoomPresets` the active preset is kept and only the zoom factor changes, so the fit is limited to 65%–300% of the preset's scale. `zoom-change` is emitted when the factor changes. A union of milestones at one time keeps the zoom and is centred. Pointer gestures in progress are cancelled.

### Drag to create and cascade previews

Both are opt-in. Without `creatable` and `cascade`, the chart renders the same markup as before (server output is byte-identical), and pointer, keyboard, events, names and descriptions are unchanged.

| API | Behavior |
| --- | --- |
| creatable | `boolean` or `(row: TimelineRow) => boolean`, default false. Enables creation in every displayed row, or in the rows for which the predicate returns true. Nothing is created when `readonly` is set. |
| createDuration | number / 4 × `snap` (one hour with the default snap). Length of a bar proposed by a click or the add button. Finite and positive, otherwise a RangeError is reported through validation-error. |
| create(proposal) | `TimelineCreate` with `rowId`, `lane`, `start`, `end` and `source` (`pointer` or `keyboard`). The parent assigns an ID and a label and adds the bar to accept it. |
| validateCreate / create-rejected(proposal, reason) | Synchronous `CreateValidator` with the same convention as validateEdit; false uses `GanttLabels.createRejected` (default "This new bar was rejected."). The reason is announced in the live region. |
| cascade | `TimelineCascade`: `(change: TimelineEdit) => readonly TimelineEdit[]`, synchronous and free of side effects. Returns the follow-on changes of other bars, for example from `propagateEdit`. A change of `dependencies` during a cascading bar drag cancels the drag without a proposal, because its previewed follow-on changes came from the old dependencies. |
| `vw-gantt-create-preview`, `vw-gantt-cascade-preview` | Classes of the previews. The create preview uses `--vw-accent` and cascade previews use `--vw-cascade`. Both are `aria-hidden` and ignore the pointer. |

**Pointer.** Press the primary button (or touch) on the empty timeline area of a creatable row and drag. The empty area is the row background: not a bar, handle, progress slider, dependency path, baseline or summary, and not the row heading or its cells. The preview runs from the press time to the time under the pointer, both rounded to the nearest multiple of `snap` from `range.start`. It is at least `minDuration` long (growing away from the press point) and is kept inside `editBounds`. It stays in the pressed row and sits in the lane under the pointer, clamped to the row's lanes. Release proposes the previewed interval with `source: 'pointer'`. A click, or a movement of less than 3 px along the time axis, proposes `[t, t + createDuration)` from the snapped press time `t`, moved back inside `editBounds` when it would end after them, in the lane under the pointer. A drag near the left or right edge scrolls the timeline (`autoScroll`). The time follows the active scale, zoom and right-to-left layout: in RTL, dragging to the left extends the bar to later times.

Escape, pointer cancellation (including a native touch pan), lost capture and changes to bars, rows, the coordinate system, `readonly`, `createDuration` or the other props that cancel edits discard the preview without a proposal, and so does the second touch of a `pinchZoom` pinch. Zoom buttons and presets are ignored during the drag. A press does not start a create gesture while another gesture is active. Pressing a row focuses the chart region, so Escape works at once. Tooltips are hidden during the drag.

**Keyboard.** Every creatable row gets an add button (`vw-gantt-create-button`) in its heading, named `GanttLabels.createIn` (default "Add bar to") followed by the row label, for example "Add bar to Web team". Activating it with Enter or Space proposes `createDuration` from the first multiple of `snap` at or after the time at the inline-start edge of the visible time area, moved inside `editBounds`. The lane is the lowest lane of the row without an overlapping bar (lane 0 when every lane is taken) and `source` is `keyboard` (a mouse click on the button reports `pointer`). Focus stays on the button. The row's expand toggle keeps its place before the button.

**Cascade.** During a pointer move or resize, the chart calls `cascade` with the primary `TimelineEdit` (source `pointer`) whenever the snapped previewed interval or row changes, never on every pointer movement. Each returned change is drawn as a dashed outline at its `after` interval, in the lane of its bar and in the row of `change.row?.after` (or the bar's own row). The bars, their names and the dependency paths keep their current positions until the parent applies the result. Keyboard moves, resizes and row moves call it once per key press, without a preview. When the release or key press proposes the edit, the primary change comes first and the cascaded changes follow. All of them are emitted once through `edits` and checked like a batch: by `validateEdits`, or else by `validateEdit` for each change, where the first rejection rejects the batch through `edits-rejected`. When the callback returns no change, the single `edit` path is used as before.

Returned changes for unknown bar IDs and for the bar being edited (or any bar of a multiple-selection move) are ignored, and so are changes whose `after` interval and row equal the bar's current ones. For a multiple-selection move the callback is called once per moved bar and the results are merged; when several calls return a change for the same bar, the last one wins. An `after` interval with a non-finite endpoint or `end < start` is an error. When the callback throws or returns such an interval, no preview is drawn and the edit is rejected with the error message: `edit-rejected` for a single bar, `edits-rejected` for a multiple-selection move. Keep `cascade` cheap and synchronous, and return `[]` when no schedule can be computed.

```ts
import { propagateEdit, type TimelineEdit } from 'vue-weave/core'

function cascade(change: TimelineEdit): TimelineEdit[] {
  if (change.mode !== 'move') return []
  const result = propagateEdit(scheduleInput, { id: change.id, start: change.after.start })
  return result.ok ? result.changes.filter(item => item.id !== change.id)
    .map(item => ({ id: item.id, before: item.before, after: item.after, mode: 'move', source: change.source })) : []
}
```

Use `assignLanes(bars, { keepLanes: true })` (below) to stack new bars that overlap others in one row, and pass its `laneCount` with a `rowHeight` of at least 8 + laneCount × 14.

### Row hierarchy moves, status date and progress line

All of these are opt-in. Without `rowsReorderable` and `statusDate`, the chart renders the same markup as before (server output is byte-identical), and pointer, keyboard, events, names and descriptions are unchanged. `showProgressLine` has no effect without `statusDate`.

| API | Behavior |
| --- | --- |
| rowsReorderable | `boolean`, default false. Each displayed row heading gets a move handle (`vw-row-move-handle`, a button before the expand toggle and the add button) named `GanttLabels.moveRow` (default "Move row") followed by the row label, for example "Move row Web team", and described by `GanttLabels.moveRowKeysHint`. No handles are drawn when `readonly` is set. |
| row-move(change) | `TimelineRowMove`: `id`, `before` and `after` (`TimelineRowPosition`: optional `parentId`, absent for a root row, and the zero-based `index` among that parent's children) and `source` (`pointer` or `keyboard`). `after.index` counts the new siblings without the moved row. Accept it with `moveTimelineRow(rows, change.id, change.after)`. A move to the current position is not proposed. |
| validateRowMove / row-move-rejected(change, reason) | Synchronous `RowMoveValidator`. Accepts with true or undefined, rejects with false (default `GanttLabels.rowMoveRejected`, "This row move was rejected.") or a reason string. The reason is announced in the live region. |
| statusDate | `number`, in the units of `range`. Draws a vertical line (`vw-gantt-marker vw-gantt-status-date`, colour `--vw-status`) labelled `GanttLabels.statusDate` (default "Status date"). The line has `role="img"` and the accessible name and title "Status date" followed by `formatTime(statusDate)`. It is drawn only inside `range` and the visible time window. A non-finite value is reported through validation-error. |
| showProgressLine | `boolean`, default false. With `statusDate`, draws a progress line (`vw-gantt-progress-line`, `--vw-status`) down the rendered rows. It runs along the status date and kinks to the progress point of each bar that is behind or ahead: a bar that started before the status date and is not complete, or that ends after it and has progress. The progress point is `start + progress × duration`, or the time at which that share of the work is done for a segmented bar. Milestones, complete bars before the status date and unstarted bars without progress keep the line straight. The line is decorative (`aria-hidden`) and follows previews of moves and progress drags. |

**Keyboard.** On a focused move handle, Alt+ArrowUp and Alt+ArrowDown move the row one place among its siblings (nothing is proposed at either end). Alt+Shift+ArrowRight indents the row: it becomes the last child of its previous sibling. Alt+Shift+ArrowLeft outdents it: it becomes the next sibling after its parent. In right-to-left charts the two directions are swapped, so the arrow towards the row text indents, and the default hint says so. A first sibling cannot be indented and a root row cannot be outdented. After the parent applies the move, the chart scrolls the row into view and returns focus to its handle.

**Pointer.** Press the primary button (or touch) on a move handle and drag vertically. A drop indicator (`vw-gantt-row-drop`, `--vw-accent`, `aria-hidden`) shows the position: the upper half of a displayed row places the moved row before it, the lower half after it, which is its first child when the row's children are shown. Positions inside the moved row's subtree are not offered. Release proposes the indicated position with `source: 'pointer'`. Escape, pointer cancellation, lost capture, a source change (rows, collapsed rows, `rowsReorderable` and the other props listed in the editing contract) and a second pinch touch cancel the drag without a proposal.

```ts
import { moveTimelineRow, timelineWbsCodes, type TimelineRowMove } from 'vue-weave/core'

function onRowMove(change: TimelineRowMove) {
  rows.value = moveTimelineRow(rows.value, change.id, change.after)
}
const wbs = computed(() => timelineWbsCodes(rows.value)) // for a WBS column
```

`exportSvg` includes the status-date line and, with `showProgressLine`, the progress line; pass `includeStatusDate: false` in `GanttExportOptions` to leave both out.

### Scheduling constraints

Opt-in. A chart whose bars have no `constraints` (or an empty object), without `constraintsEditable`, renders the same markup as before (server output is byte-identical), and keys, pointer behaviour, events, names and descriptions are unchanged. `constraintsEditable` without constraints adds only a hidden hint element.

| API | Behavior |
| --- | --- |
| TimelineBar.constraints | `TimelineConstraints`: optional `startNoEarlierThan`, `startNoLaterThan`, `finishNoEarlierThan`, `finishNoLaterThan` and `fixedStart`, each a time in the units of `range`. The names are those of `ScheduleTask`, so `{ id, duration, ...bar.constraints }` is a valid task. A value that is not a finite number is a RangeError (`Constraint startNoEarlierThan of bar a must be a finite time`) and a `constraints` value that is not an object an Error, both reported through validation-error. Combinations that cannot all be met are allowed: whether they are feasible is decided by `scheduleTasks`. Other fields of the object are ignored. |
| fixedStart | A required start, independent of the bar's own `start`. The chart never moves the bar to it; a bar that starts at another time is drawn with the constraint violated, as the scheduler would report it. |
| Violation | A constraint is violated when the bar as drawn (the preview during a bar drag) starts before `startNoEarlierThan` or after `startNoLaterThan`, ends before `finishNoEarlierThan` or after `finishNoLaterThan`, or starts at another time than `fixedStart`. `timelineConstraintViolated(range, kind, time)` gives the same answer. |
| constraintsEditable | boolean / false. Each constraint of an editable bar (`TimelineBar.editable`, independent of `editBounds`, like the progress slider) becomes a handle that can be dragged and moved with the keys. No handles are drawn when `readonly` is set; other bars keep decorative markers. |
| constraint-edit(change) | `TimelineConstraintEdit`: `id` (the bar), `kind`, `before` (the bar's value), `after` (the proposed value, or `undefined` to remove the constraint) and `source` (`pointer` or `keyboard`). The component applies nothing; accept it with `applyTimelineConstraintEdit(bars, change)`. A change to the same value is not proposed. |
| validateConstraintEdit / constraint-edit-rejected(change, reason) | Synchronous `ConstraintEditValidator` with the same convention as validateEdit; false uses `GanttLabels.constraintRejected` (default "This constraint change was rejected."). The reason is announced in the live region. |
| GanttLabels.startNoEarlierThan / startNoLaterThan / finishNoEarlierThan / finishNoLaterThan / fixedStart | Text of each kind in descriptions and handle names. Defaults "Start no earlier than", "Start no later than", "Finish no earlier than", "Finish no later than" and "Must start on". |
| GanttLabels.constraintViolated | Added after a violated constraint in descriptions and `aria-valuetext`. Default "violated". |
| GanttLabels.constraintHint | Description of every handle. Default "Arrow keys move the constraint by one snap step, Shift+arrow and Page keys by one tick step. Delete removes it. Escape cancels a drag." |
| `vw-gantt-constraint` | Class of a marker or handle, with `vw-is-start` or `vw-is-finish` (the bar end it bounds), `vw-is-lower` (no earlier than), `vw-is-upper` (no later than) or `vw-is-fixed`, and the states `vw-is-violated` and `vw-is-dragging`. Colours `--vw-constraint` and `--vw-constraint-violated`. |

**Display.** Each constraint inside `range` and the visible time window is drawn in the bar's lane at its time: a stem across the lane, with a flag at the top for a start bound or at the bottom for a finish bound. The flag is an arrow that points towards the allowed times, so "no earlier than" points to later times and "no later than" to earlier times; a fixed start is an I-beam with a bar at both ends. A violated constraint is drawn in `--vw-constraint-violated` with a dashed stem, which also distinguishes it in forced-colors mode. The glyphs differ from the deadline indicator (a downward triangle on a solid stem in `--vw-deadline`) and keep a halo in the surface colour over bars. Markers follow a bar's move, resize and row-drag previews, are culled with the rows and the time window like deadline indicators, are not drawn for the hidden rows of a collapsed parent, are mirrored in right-to-left charts and are printed. Without handles they are `aria-hidden`.

**Accessibility.** Every constraint of a bar is added to its description (`aria-describedby` and the `title`), after the critical, float, deadline and late entries and before the baseline entries, as the kind label and the time, for example "Start no earlier than 09 Nov 10:00. Finish no later than 09 Nov 17:00, violated." Accessible names do not change. The time uses `formatTime`.

**Handles.** With `constraintsEditable`, a handle is a `button` with `role="slider"`, as the progress slider: a single value on an axis, operated by arrows, with `aria-valuemin` and `aria-valuemax` the `editBounds` (or `range`), `aria-valuenow` the time and `aria-valuetext` the formatted time, followed by ", violated" when it is. Its name is the kind label, " · " and the bar label, for example "Start no earlier than · Cut order B", and it is described by `GanttLabels.constraintHint`. Handles follow the link handles and the progress slider of the bar in tab order.

- Pointer: press the handle with the primary button (or touch) and drag along the time axis. The preview moves by whole `snap` steps from the constraint's value (displacement snapping, as bar moves) and stays inside `editBounds`; release proposes it with `source: 'pointer'`. The handle is focused on press, so Escape works at once.
- Keys: ArrowRight and ArrowLeft move one `snap` step in the visual direction (in right-to-left charts ArrowLeft is later), ArrowUp and ArrowDown one step later and earlier. Shift with an arrow, and PageUp and PageDown, move by the current tick step. Home and End propose the start and end of `editBounds`. Delete or Backspace proposes removing the constraint (`after: undefined`). Each key press proposes one change from the bar's current value. Alt, Ctrl and Meta combinations are left to the page: on a bar they choose which end to resize, which has no meaning for a single time. With `contextMenu`, the ContextMenu key and Shift+F10 report the bar.
- Removal is part of `constraintsEditable` and does not depend on the `deletable` prop: removing a constraint changes a bar, it does not delete one, as `dependency-delete` does not depend on it either. Reject it in `validateConstraintEdit` when it is not allowed. After the parent applies a removal, focus moves to the bar.
- Cancellation: Escape, pointer cancellation, lost capture, a `contextmenu` event during the drag, the second touch of a `pinchZoom` pinch and any change of bars (which carry the constraints), rows, collapsed rows, `range`, `editBounds`, `snap`, the scale, zoom presets, `readonly`, `constraintsEditable` or the other props listed in the editing contract end the drag without a proposal. A press does not start a constraint drag while another gesture is in flight, and a constraint drag blocks other gestures until it ends.

**Adding a constraint.** The chart has no menu for it. With `contextMenu`, a right-click on a bar (or one of its handles) reports `target: { kind: 'bar', id }`, the bar's `rowId` and the `time` under the pointer, which is all an application needs to offer, for example, "Start no earlier than here". The proposal shape is the same as the chart's, with `before: undefined`:

```ts
import {
  applyTimelineConstraintEdit, type TimelineConstraintEdit, type TimelineConstraintKind, type TimelineContextMenu,
} from 'vue-weave/core'

const menu = ref<TimelineContextMenu>()
function onContextMenu(event: TimelineContextMenu) {
  if (event.target.kind === 'bar' && event.time !== undefined) menu.value = event // render your menu at clientX, clientY
}
function addConstraint(kind: TimelineConstraintKind) {
  const { target, time } = menu.value!
  if (target.kind !== 'bar' || time === undefined) return
  const after = range.start + Math.round((time - range.start) / snap) * snap
  bars.value = applyTimelineConstraintEdit(bars.value, { id: target.id, kind, before: undefined, after, source: 'pointer' })
}
function onConstraintEdit(change: TimelineConstraintEdit) {
  bars.value = applyTimelineConstraintEdit(bars.value, change)
}
```

`exportSvg`, `exportPng` and `renderTimelineSvg` draw the same glyphs with the colours of `--vw-constraint` and `--vw-constraint-violated`, each in a `<g>` with the same classes and a `<title>` such as "Finish no later than · Pack order A 09 Nov 17:00 · violated" (options `constraintLabels` and `constraintViolatedLabel`; the component passes its labels). `toMsProjectXml` writes a task's single constraint; see [Interchange exports](#interchange-exports). To schedule with the constraints, spread them into the tasks and pass the results back with `scheduledBarFields`; see [Scheduling constraints from the chart](scheduling.md#scheduling-constraints-from-the-chart).

### Timeline editing helpers

| Export | Purpose |
| --- | --- |
| removeTimelineBars(bars, dependencies, ids) | New `{ bars, dependencies }` arrays without the given bars and without every dependency whose `from` or `to` is one of them. Accepts any iterable of IDs and keeps the remaining items and their order. An unknown ID throws an Error |
| assignLanes(bars, options?) | `AssignLanesResult`: `{ bars, laneCount, rowLaneCounts }` with new bar objects in input order, each with `lane` set so that the bars of one row never overlap within a lane. See below |
| dependencyTypeForEnds(fromEnd, toEnd) | Dependency type for a source and target TimelineBarEnd (start or finish) |
| dependencyEndsForType(type = FS) | The bar ends a dependency type joins |
| moveTimeRanges(ranges, delta, snap, bounds) | Move intervals by one snapped displacement, clamped so every interval stays in bounds. A fractional snap is applied in exact decimal arithmetic, like `editTimeRange` |
| calendarBands(range, unit, options) | One header band level of hours, days, weeks, months or years in epoch milliseconds, aligned to a fixed UTC offset or to local time in an IANA time zone and clipped to the range |
| resourceLoadHistogram(segments, resourceIds?) | Validate load segments, group them by resource, sort them and report each resource's peak |
| timelineWbsCodes(rows) | Map from row ID to its outline (WBS) code in tree preorder: roots "1", "2", children "1.1", "1.2.1". Sibling order is array order. Invalid rows throw like `createTimelineRowTree` |
| timelineRowPosition(rows, id) | The row's `TimelineRowPosition`: its `parentId` (absent for a root) and index among its siblings. An unknown ID throws an Error |
| moveTimelineRow(rows, id, target) | New rows array in tree preorder with the row and its subtree moved under `target.parentId` (a root without it) at sibling `target.index`, counted without the moved row. The moved row is a new object; the others keep their identity. Unknown rows or parents and moves into the own subtree throw an Error; an index that is not an integer from 0 to the sibling count throws a RangeError |
| indentTimelineRow(rows, id) / outdentTimelineRow(rows, id) | `moveTimelineRow` to the last child of the previous sibling, or to the next sibling after the parent. A first sibling cannot be indented and a root row cannot be outdented (Error) |
| timelineCsvTable(rows, bars, options?) | A header and one record per bar for `toCsv`; see [Interchange exports](#interchange-exports) |
| parseCsv(text, options?), timelineFromCsvTable(table, options) | Read CSV text and turn a `timelineCsvTable` layout back into rows and bars; see [Interchange exports](#interchange-exports) |
| timelineLabelColumnId | `'$label'`, the `TimelineColumnResize.id` of the row label column; see [Column resizing](#column-resizing) |
| applyTimelineConstraintEdit(bars, change) | New bars array in which the bar `change.id` is a copy with `constraints[change.kind]` set to `change.after`, or without it when `after` is undefined; the `constraints` field is left out once no constraint remains. Other bars keep their identity and the input is not modified. An unknown bar or kind throws an Error and an `after` that is not a finite number a RangeError. `before` is not compared with the bar. See [Scheduling constraints](#scheduling-constraints) |
| timelineConstraints(source) | The constraint fields of any object, for example a `ScheduleTask`, as a new `TimelineConstraints` with only the kinds that are set, or undefined when none is; a set value that is not finite throws a RangeError. Builds `TimelineBar.constraints` from scheduler tasks |
| timelineConstraintViolated(range, kind, time) | Whether the interval breaks the constraint, as GanttChart draws it. An unknown kind throws an Error |
| timelineConstraintKinds | The five `TimelineConstraintKind` names in the order the chart describes them, frozen |

`assignLanes(bars, options: AssignLanesOptions = {})` treats bars as half-open intervals, so touching bars share a lane; a milestone at `t` conflicts with every bar of its row that contains `t` (`start <= t < end`) and with milestones at `t`. By default lanes are assigned first-fit in start order, ties in input order, which uses the fewest lanes possible; input lanes are ignored. With `keepLanes: true` the bars are placed in input order: each keeps its `lane` (default 0) when no bar placed before it conflicts with it in that lane, and only a conflicting bar moves to the lowest free lane. This keeps lanes stable while an application adds or moves bars. `laneCount` is the largest number of lanes of any row and at least 1, and `rowLaneCounts` is a `Map` from each row ID that has bars to its highest lane plus one. Non-finite or inverted intervals and lanes that are not nonnegative integers throw a RangeError; the input is not modified.

`calendarBands` options are utcOffsetMinutes (integer from -1080 to 1080, the same limit as `buildWorkPeriods` and `toMsProjectXml`; default 0; daylight-saving transitions are not applied), timeZone (an IANA zone such as `Europe/Berlin`, described below; cannot be combined with utcOffsetMinutes), step (units per band, default 1; a divisor of 24 for hours; multi-unit days, weeks and months follow a fixed grid counted from 1970-01-01 in the offset or zone, and years from year 0, so overlapping ranges share boundaries), weekStartsOn (0 Sunday to 6 Saturday, default 1) and label(start, end, local), which receives the unclipped band and the `CalendarBandLocalTime` of its start: `year`, `month` (1 to 12), `day`, `hour`, `minute`, `weekday` (0 Sunday to 6 Saturday), `utcOffsetMinutes` in effect at the start, and `timeZone` (undefined for a fixed offset). Default labels are HH:mm, YYYY-MM-DD (days and week starts), YYYY-MM and YYYY in local time. Results are capped at 10,000 bands.

With `timeZone`, bands follow local time with the zone's daylight-saving rules from `Intl.DateTimeFormat`, as in [Time-zone calendars](scheduling.md#time-zone-calendars), so GanttChart `headerBands` built this way stay on local midnights across transitions instead of drifting by an hour:

- Day, week, month and year bands start at the first instant of their local date: local midnight, or the end of a gap that skips midnight (in `America/Santiago` on 2022-09-11 the day starts at 01:00). A day band lasts 23 or 25 hours on a transition day. A local date that the zone skips entirely, such as 2011-12-30 in `Pacific/Apia`, has no band.
- Hour bands start where local time reaches a multiple of `step` hours, counted from local midnight on every date. A 23-hour day has 23 one-hour bands and a 25-hour day has 25, with the repeated hour labelled twice (the label callback can tell them apart by `utcOffsetMinutes`). A grid hour inside a gap starts its band at the end of the gap: with a 30-minute shift (`Australia/Lord_Howe`) the 02:00 band starts at 02:30 and lasts 30 minutes. With `step` greater than 1, every occurrence of a grid hour starts a band, and the bands that contain a transition are shorter or longer, for example 00:00–06:00 lasts 5 hours on a spring-forward night.
- Labels are taken from the local time of the band start, so a band that starts after a gap is labelled with that time (01:00, 02:30).
- An unknown or empty zone name throws a RangeError with the name, and so does combining it with `utcOffsetMinutes`. Results depend on the time-zone data of the runtime.

```ts
import { calendarBands } from 'vue-weave/core'

const range = { start: Date.parse('2025-10-24T22:00:00Z'), end: Date.parse('2025-10-28T23:00:00Z') }
const headerBands = [
  calendarBands(range, 'day', { timeZone: 'Europe/Berlin' }), // 2025-10-26 lasts 25 hours
  calendarBands(range, 'hour', { timeZone: 'Europe/Berlin', step: 6 }),
]
```

## Core entry point

Import pure functions and types from `vue-weave/core`. The Vue entry also re-exports them. Core has no Vue or DOM runtime dependency and does not mutate input data.

| Export | Purpose |
| --- | --- |
| indexGraph(nodes, edges) | Validate IDs, references and ports; create incoming/outgoing adjacency Maps |
| graphNeighborhood(index, id, maxHops = Infinity) | Union of independent ancestor/descendant traversals |
| layoutLayeredGraph(nodes, edges, options) | Deterministic graph layout. All nodes of a cycle (strongly connected component) share one rank, so a large cycle becomes one long column; see [architecture](architecture.md) |
| graphPortAnchor(box, port) | World-coordinate point on a node box for a port |
| graphEdgeEndpoint(layout, nodes, edge, end, direction) | Endpoint point and side for a named port, the drawn path end, or a direction-based default |
| routeGraphPorts(layout, nodes, edges, direction) | Reroute edges with named ports after layout and saved positions |
| applyGraphPositions(layout, edges, positions, direction = LR) | Apply saved coordinates and reroute incident edges |
| createTimeScale(range, pixelsPerUnit) | Invertible linear scale |
| timeTicks(window, step, anchor = 0) | Stable tick sequence `anchor + k × step` inside the closed window; capped at 10,000 entries. A window so far from the anchor that the tick index is not finite throws RangeError. With a fractional step, ticks are exact decimals (0.1, 0.2, 0.3, not 0.30000000000000004) when the step and anchor have at most 15 decimal places; integer steps use plain arithmetic |
| visibleRows(scrollTop, bodyHeight, rowHeight, count, overscan = 2) | First index and exclusive end index |
| intersectsWindow(interval, window) | Half-open overlap; a point milestone counts when it lies in the closed window, including at either edge |
| editTimeRange(interval, mode, delta, snap, bounds, minDuration = snap) | Immutable snapped proposal. With a fractional snap, the result is computed in exact decimal arithmetic when the snap, interval, bounds and minDuration have at most 15 decimal places (moving 0 by 3 × 0.1 gives 0.3); otherwise, and for integer snaps, plain floating-point arithmetic is used |
| dependencyTimes(source, target, type = FS) | Endpoint times for dependency routing |
| dependencyPath(x1, y1, x2, y2) | Orthogonal SVG path |
| timelineBaselineId, timelineBaselineLimit | `'$baseline'`, the baseline set ID of `TimelineBar.baseline`, and 3, the most baseline sets drawn at once; see [Baseline sets](#baseline-sets) |
| timelineBaseline(bar, id) | A bar's interval in baseline set `id`: `bar.baseline` for `timelineBaselineId`, otherwise its `baselines` entry, or undefined |
| timelineBaselineIds(bars) | Every baseline set ID in the bars: `timelineBaselineId` first when any bar has a `baseline`, then the `baselines` IDs in order of first appearance |
| baselineVariance(bar, baseline) | `TimelineBaselineVariance` `{ start, end, duration }`: the bar's start and end minus the baseline's and its length minus the baseline's, so positive values are later or longer. Never -0. Throws RangeError for non-finite times |
| formatDependencyLag(lag) | Default text of a dependency lag: signed hours of milliseconds rounded to two decimals, such as `+2 h` or `−1.5 h` (U+2212). Throws RangeError for a non-finite lag |
| validateTimelineData(rows, bars, dependencies = [], laneCount = 1) | Validate references, lanes, durations, progress, baselines and named baseline sets (see [Baseline sets](#baseline-sets)) and dependency lags (a lag that is not a finite number throws RangeError). IDs must be unique within each collection; a row and a bar may share an ID. A dependency from a bar to itself throws an Error that names the dependency and the bar, so GanttChart reports it through `validation-error` and renders its empty state, and `renderTimelineSvg` throws it. `scheduleTasks` takes its own links and reports a self-link as a `cycle` failure instead |
| createTimelineRowTree(rows) | Validate row parents and cycles; produce stable preorder entries whose `row` keeps the type of the input rows |
| summarizeTimelineRows(tree, bars) | Roll up leaf-row intervals and progress into a summary Map |
| normalizeWorkPeriods(periods, range) | Clip, sort and merge overlapping or touching work periods |
| invertWorkPeriods(periods, range) | Sorted half-open gaps between the clipped, sorted and merged work periods inside the range, for `nonWorkingPeriods`. Endpoints only need to be finite, so fractional units work; each period and the range must have positive length, otherwise RangeError |
| buildWorkPeriods(range, week) | Expand weekly shifts and date overrides into epoch-millisecond work periods. `utcOffsetMinutes` is an integer from -1080 to 1080 |
| scheduleTasks(input) | Calculate calendar-aware earliest/latest dates, float and critical links |
| scheduledBarFields(task) | `ScheduledBarFields` for a TimelineBar from a scheduled task: start, end, critical, latestEnd and, only for work in more than one segment, segments. Returns new objects |
| propagateEdit(input, edit) | Reschedule with one task pinned at a new start (and optionally a new end) and list every task whose dates change: a `PropagateEditResult`; see [Propagate an edit](scheduling.md#propagate-an-edit) |
| rescheduleFromStatusDate(input, statusDate, progress) | Reschedule a plan at a status date from reported progress: done tasks keep their dates, partly done tasks keep their done work and continue at or after the status date, and unstarted tasks start no earlier than it. FS and SS links into started tasks and every link into done tasks no longer apply; FF and SF links into partly done tasks still bound their finish and can delay the remaining work. Returns a `ScheduleResult`; see [Reschedule from a status date](scheduling.md#reschedule-from-a-status-date) |
| scheduleToGraph(result, dependencies, options?) | A PERT network diagram for NetworkGraph from a successful schedule; see [Network diagram from a schedule](#network-diagram-from-a-schedule) |
| toMsProjectXml(project, options?), toICalendar(events, options?), toCsv(table) | Interchange documents as strings; see [Interchange exports](#interchange-exports) |
| parseCsv(text, options?), timelineFromCsvTable(table, options) | CSV import: records of strings, then `{ rows, bars }`; see [Interchange exports](#interchange-exports) |
| calculateResourceLoad(range, tasks, resources, assignments) | Compare scheduled work with capacity over half-open intervals. Segments with the same tasks may share one `taskIds` array |
| levelResources(input) | Delay tasks with a deterministic priority heuristic so that assigned load stays within capacity |
| graphDeletion(nodes, edges, nodeIds, edgeIds = []) | Normalized GraphDeletion: validates the graph, throws Error for unknown IDs, adds every edge incident to a deleted node and returns both lists deduplicated in input order |
| removeGraphElements(nodes, edges, deletion) | New node and edge arrays without the deleted elements and the edges incident to deleted nodes; unknown IDs throw Error and inputs are not modified |
| cloneGraphElements(nodes, edges, nodeIds, options) | `GraphCloneResult` with shallow copies of the listed nodes and of every edge between two of them, in input order, with IDs from `options.createId(id, kind)` (`kind` is `node` or `edge`) and edges pointing at the copied nodes; ports, data and other fields are kept. `options.positions` entries of the source nodes are moved by `options.offset` (default 0, 0) and returned under the new IDs in `positions`, and the waypoints (`points`) of copied edges are moved by the same offset; `idMap.nodes` and `idMap.edges` map source IDs to new IDs. Duplicate requested IDs are ignored. Throws Error for an invalid graph, an unknown node ID or a new ID that is empty, repeated or already used in the input, and RangeError for a non-finite offset, position or waypoint. Keep the returned positions nonnegative before saving them |
| graphAlignmentGuides(moving, others, threshold) | `GraphAlignment` `{ dx, dy, guides }` that aligns a `GraphRect` with the nearest left, centre or right (x) and top, middle or bottom (y) anchor of `others` within `threshold` chart units (inclusive), 0 on an axis without a match. Ties go to the earlier rectangle in `others`, then to the start, centre and end anchors of `moving`, then to those of the other rectangle. `guides` (`GraphAlignmentGuide`: `axis`, `position`, `from`, `to`) are the aligned lines of the shifted rectangle, x guides first, each sorted by position and spanning every rectangle aligned there. Throws RangeError for a negative or non-finite threshold and invalid rectangles. Iterative and deterministic |
| collapseGraphGroups(nodes, edges, groups, collapsedIds, options) | `GraphCollapseResult` for the collapsed groups: visible `nodes` with one proxy per outermost collapsed group (ID and label of the group, detail from `options.detail`, default "N nodes", rounded shape, `data` of type `GraphCollapsedNodeData`), `edges` re-attached to proxies (ports on proxy ends and waypoints dropped, internal edges removed, parallel edges merged per source, source port, target and target port under the first ID), the remaining `groups` (a collapsed child becomes a member of its parent), `proxies` (`GraphCollapsedGroup` with every hidden node ID), `owners` (hidden node to proxy), `mergedEdges` (re-attached edge ID to original IDs) and `hiddenEdgeIds`. Throws Error for invalid groups like NetworkGraph (including an unknown parent anywhere up a parent chain and a parent cycle), an unknown collapsed ID or a group ID that is also a visible node ID. Inputs are not modified; untouched nodes and edges are returned as is. `GraphCollapsedNode` is the type of a proxy node, `NetworkNode<GraphCollapsedNodeData>` |
| routeGraphEdges(layout, edges, nodes, options) | Reroutes a finished layout in `GraphEdgeRouteOptions.style` (`curve`, `orthogonal` or `straight`, default `curve`) for a `direction` (default LR) with an orthogonal `cornerRadius` (default 0), and draws edges with `points` through their waypoints; see [Group collapse, edge styles and waypoints](#group-collapse-edge-styles-and-waypoints-level-of-detail-and-node-resizing). Returns the input layout for `curve` without waypoints. Throws Error for an unknown endpoint or a named port whose side is not left, right, top or bottom, and RangeError for an unknown style or direction, a bad radius or a non-finite waypoint. Orthogonal detours stay at or above 0 in a layout at nonnegative coordinates and keep their full 16-unit stub when an end lies at a negative coordinate |
| graphPolylinePath(points, cornerRadius = 0) / graphSmoothPath(points) | SVG path data of a polyline with optionally rounded corners, and of a smooth Catmull-Rom curve through the points, for custom edge renderers. Throws RangeError for a point with a non-finite coordinate |
| applyGraphSizes(layout, edges, sizes, direction = LR) | Overlay `GraphNodeSize` widths and heights on the layout boxes (top-left corners kept), grow the bounds and reroute incident edges like `applyGraphPositions`. RangeError for sizes that are not finite and positive, also under unknown IDs, which are otherwise ignored; Error naming the edge and node when an incident edge references a node without a box; returns the input layout when nothing changes |
| snapGraphPoint(point, grid) | The point with both coordinates rounded to the nearest multiple of a positive finite `grid` (RangeError otherwise, and for non-finite coordinates); never returns -0 |

All exported interfaces and component props are included in the declaration files. Validation functions reject invalid references and numeric geometry with descriptive errors. Scheduling failures such as cycles and infeasible plans are returned as results; malformed scheduling inputs throw. Routing helpers assume validated graph data as described below.

### Graph routing

`graphPortAnchor(box, port)` returns a `GraphPoint` on the named side of a `GraphBox`. Coordinates are world-coordinate pixels. `port.offset` defaults to 0.5 and measures down a vertical side or across a horizontal side. Supply finite box geometry and a port offset in [0, 1]; the helper does not validate them. A `port.side` other than left, right, top or bottom throws an Error naming the port.

`graphEdgeEndpoint(layout, nodes, edge, end, direction)` returns `{ x, y, side }`. `nodes` is a node-ID-keyed map, `end` is `from` or `to`, and `direction` is a `GraphLayoutDirection`. Named ports take precedence. Otherwise, when `edge` has an `id` with a path in `layout.paths`, the result is the drawn first or last point of that path, and `side` is the box side closest to it. This matches the rendered edge after saved positions reverse two nodes and for custom layouts that choose their own sides. Without a path, LR uses right/left and TB uses bottom/top for source/target endpoints. Validate nodes and edges with `indexGraph` and supply matching layout boxes before calling this helper; an endpoint without a layout box throws an Error naming the edge and the node, and a named port whose side is not left, right, top or bottom throws an Error naming the node and the port. `routeGraphPorts` throws the same errors.

`graphPathEndpoints(path)` returns `{ start, end }`: the first moveto point and the current point after the last segment (the subpath start after `Z`), or `undefined` for a path without coordinates. It throws like `graphPathBounds` for malformed path data.

NetworkGraph applies `applyGraphPositions`, then `applyGraphSizes`, then `routeGraphPorts` and finally `routeGraphEdges` for its `edgeStyle`. `applyGraphPositions` overlays finite, nonnegative coordinates, expands the layout bounds when needed and reroutes incident edges while preserving other paths. Position entries for unknown node IDs are ignored, but their coordinates are still validated (RangeError), and an incident edge whose other end has no layout box throws an Error naming the edge and the node. `routeGraphPorts` then replaces paths and label positions for edges with named ports, leaving unnamed-edge routes intact. These operations do not mutate the supplied layout and may return it unchanged when there is nothing to update.

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

`layoutForceGraph(nodes, edges, options)` is a deterministic force-directed `GraphLayout` producer for the same `layout` prop, for example `(n, e) => layoutForceGraph(n, e, { seed: 1 })`. Linked nodes are pulled toward `linkDistance`, every pair of nodes repels through an iterative Barnes–Hut quadtree, and a weak gravity pulls each group toward its centre while the simulation cools over `iterations` steps. Grid-based passes then push overlapping boxes apart until every pair keeps `nodeGap` of free space, spreading free nodes slightly when a region stays crowded. The same input and options always give the same output: start positions come from a seeded mulberry32 generator, never `Math.random`. About 2,000 nodes with the default 300 iterations take roughly half a second in Node. The work grows with the node count and `iterations` (3,750 nodes take about a second) and runs synchronously, so for large graphs compute it once in a worker or on the server and pass the result through `positions`, or lower `iterations`.

| Option | Meaning |
| --- | --- |
| nodeWidth, nodeHeight, padding | Box size (144 × 58) and outer margin (20). |
| iterations | Positive integer simulation steps. Default 300. |
| linkDistance | Preferred distance between the centres of linked nodes. Default 180. |
| repulsion | Nonnegative many-body repulsion strength. Default 600. |
| gravity | Pull toward the group centre in [0, 1]. Default 0.05. |
| nodeGap | Minimum free space between boxes after the overlap passes. Default 16. |
| seed | Integer seed for the initial placement. Default 1. |
| initialPositions | `ReadonlyMap<string, GraphPoint>` of start positions as box top-left corners, for example the boxes of a previous layout. A node without one starts near an already placed neighbour, otherwise at a seeded point. Unknown IDs are ignored. |
| fixed | `ReadonlySet<string>` of pinned node IDs. They keep their initial position (or their seeded start without one). Unknown IDs are ignored. |

Connected components (ignoring edge direction) are laid out separately and packed in rows, so disconnected parts never overlap. Without pinned nodes the drawing is translated so its bounding box starts at `padding`. Components that contain a pinned node are simulated together in the caller's coordinate frame and the other components are packed to their right; pinned boxes are reported at exactly their given coordinates unless some node or route would start above or left of `padding`, in which case the whole drawing is shifted by the same amount. Overlaps between two pinned boxes are not resolved. Box `rank` is the breadth-first depth, ignoring edge direction, from the first node of its component in input order. Edges are straight segments clipped to the box borders with labels at their midpoints. Parallel edges between one pair (in either direction) bend to alternate sides as quadratic curves with the label at the curve midpoint, and self-loops are drawn as growing loops on the right side. An empty graph returns `2 × padding` (at least 1) for both dimensions. Unknown endpoints and duplicate IDs throw `Error` through `indexGraph`; invalid numbers, a non-integer seed and non-finite initial positions throw `RangeError`. All traversals are iterative and the arguments are never mutated.

### Graph algorithms

All helpers validate input with `indexGraph` (unknown endpoints, duplicate IDs and bad ports throw `Error`) and never mutate their arguments.

| Export | Purpose |
| --- | --- |
| topologicalOrder(nodes, edges) | `{ order, acyclic, blocked }` using Kahn's algorithm, input order breaks ties. `blocked` lists nodes on or behind a cycle; a self-loop is a cycle. |
| findGraphCycles(nodes, edges) | Node IDs of each strongly connected component with more than one node, plus each self-looping node. Iterative Tarjan; deterministic order. |
| shortestGraphPath(nodes, edges, fromId, toId, { directed = true, weight }) | `{ nodeIds, edgeIds, distance }` or `null` when unreachable. Breadth-first without `weight`, Dijkstra with it (weights must be finite and nonnegative, otherwise `RangeError`). Unknown IDs throw `Error`. |
| searchGraphNodes(nodes, query, { fields }) | Case-insensitive substring match on `id` and `label` (both by default). An empty query matches every node. |
| filterGraph(nodes, edges, match, { neighborhood = 0, fields }) | `match` is a predicate or a text query. Returns `{ nodes, edges }`: matching nodes plus everything within `neighborhood` hops (via `graphNeighborhood`) and the edges with both endpoints kept. |

### Viewport helpers

The helpers behind `cullOffscreen` are exported for custom renderers and workers. Rectangles are `GraphRect` values (`x`, `y`, `width`, `height`) in chart coordinates.

| Export | Purpose |
| --- | --- |
| graphViewportRect(camera, size, overscan = 0) | World rectangle a `GraphViewport` camera shows for a screen size, grown by `overscan` screen pixels. Throws `RangeError` for a nonpositive scale or negative size |
| graphRectsIntersect(a, b) | Whether two rectangles overlap or touch |
| graphPathBounds(path) | Bounding rectangle of an SVG path string, or `undefined` without coordinates. Bézier curves use their control points, including the reflected control point of S and T; arcs are bounded exactly after SVG radius correction and rotation. Numbers may use `e`/`E` exponents. Throws for malformed data (including data that does not begin with a moveto, `M` or `m`) or unsupported commands |
| graphPathEndpoints(path) | First moveto point and final current point of an SVG path string, or `undefined` without coordinates |
| graphLayoutBounds(layout, labelReach = 80) | `GraphBounds` with one rectangle per node and per edge, edge labels included |
| cullGraphElements(bounds, view, keep?) | `GraphVisibleIds` of the nodes and edges that intersect `view`, plus any IDs in `keep` (`GraphCullKeep`) |
| graphCameraAt(point, size, scale) | Camera that centers a world point at a scale; `focusNode` uses the same rule |

### Row trees and summaries

`createTimelineRowTree(rows)` validates unique nonempty IDs, parent references and cycles. Each preorder entry contains `row`, `depth`, `hasChildren` and `afterSubtree`, the exclusive index after that row and its descendants. Root and sibling order follows input order.

`summarizeTimelineRows(tree, bars)` expects the tree returned by `createTimelineRowTree` and valid bars for those rows. It aggregates leaf-row bars into their ancestors and returns a Map keyed by row ID, including leaves with bars. Each summary reports the earliest start, latest end and interval count. Progress is weighted by duration across bars with known progress. Bars without progress and zero-duration milestones do not contribute to the progress denominator. Explicit parent bars are excluded from descendant aggregation.

### Calendars, scheduling and resource load

`normalizeWorkPeriods(periods, range)` returns sorted, clipped, merged half-open intervals. The range and period endpoints must be safe integers, and each interval must have positive length. `buildWorkPeriods(range, week)` generates these periods from weekly shifts, a fixed UTC offset or an IANA `timeZone`, and civil-date overrides; it uses epoch milliseconds.

`scheduleTasks(input)` returns a `ScheduleResult`. Successful results contain `tasks`, `criticalDependencyIds` and the project `finish`. Each `ScheduledTask` reports `totalFloat` (working time for tasks, elapsed time for milestones) and `workFloat` (working time on the task calendar for both tasks and milestones). Cycle or infeasible results contain no partial schedule.

`calculateResourceLoad` returns `ResourceLoadSegment[]` with resource ID, start/end, load, available capacity, overload and contributing task IDs. The `taskIds` array is typed read-only and segments with the same tasks in the same order share one array, so many overlapping tasks do not copy their IDs into every segment; copy it before changing it. It reports conflicts without automatically moving tasks. See the [scheduling guide](scheduling.md) for time units, quantum alignment, calendar rules, failure results and capacity constraints.

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

The exported types are `ScheduleSuccess`, `ScheduleFailure`, `ScheduleCycle`, `ScheduleConstraintName`, `LevelResourcesInput`, `LevelResourcesSuccess`, `LevelResourcesResult`, `ResourceDelay`, `ScheduleEdit`, `ScheduleChange`, `PropagateEditSuccess` and `PropagateEditResult`. `levelResources` ranks ready tasks by priority, then total float, then early start, then ID, and gives each the earliest start with enough capacity before its latest feasible dates. Tasks without such a start keep their earliest dates and are reported as unresolved. The [scheduling guide](scheduling.md#level-resources) defines each step. Optimization policies remain the application's concern.

### Interchange exports

The core entry builds three interchange formats as strings, and reads CSV back, without a DOM or dependencies. Save them with a `Blob` (`application/xml`, `text/calendar` or `text/csv`) or send them from a server.

| Export | Behavior |
| --- | --- |
| toMsProjectXml(project, options?) | Microsoft Project XML (MSPDI) for `MsProjectInput`: `name`, `tasks` (`MsProjectTask`: `id`, `name`, `start`, `end` in epoch milliseconds, optional `outlineLevel` from 1, `percentComplete` from 0 to 100, `milestone`, `baselines`, each an `MsProjectBaseline` with `number` from 0 to 10, `start` and `end`, and `constraints`, a `TimelineConstraints` in epoch milliseconds) and optional `dependencies` (`MsProjectDependency`: `from`, `to`, `type` FS/SS/FF/SF, default FS, and elapsed `lag` in milliseconds). `MsProjectXmlOptions.utcOffsetMinutes` (default 0) sets the wall-clock offset of the written dates |
| toICalendar(events, options?) | RFC 5545 text with one VEVENT per `ICalendarEvent` (`id`, `summary`, `start`, `end`, optional `description`). `ICalendarOptions`: `productId` (default `-//vue-weave//Timeline export//EN`), `calendarName` (NAME and X-WR-CALNAME) and `timestamp`, the DTSTAMP of every event (default `Date.now()`; pass it for reproducible output) |
| toCsv(table) | RFC 4180 text from rows of `CsvCell` (`string`, finite `number` or `undefined` for an empty field) |
| timelineCsvTable(rows, bars, options?) | `CsvCell[][]`: a header and one record per bar, ordered by row in tree preorder and then by bar order. `TimelineCsvOptions`: `formatTime` (default ISO 8601 UTC), `columns` (`TimelineCsvColumn[]`, any of `row`, `wbs`, `bar`, `start`, `end`, `progress`; default all, in that order) and `headers` (defaults Row, WBS, Bar, Start, End, Progress). Progress is written from 0 to 1 and is empty without progress |
| parseCsv(text, options?) | `string[][]` from RFC 4180 text, the inverse of `toCsv`. `CsvParseOptions.delimiter` is one character other than a double quote, CR or LF (default `,`) |
| timelineFromCsvTable(table, options) | `TimelineCsvImport` (`{ rows, bars }`) from a table in the `timelineCsvTable` layout, for example the result of `parseCsv`. `TimelineCsvImportOptions`: `parseTime(text)` (required; return NaN for text that is not a time), `columns` (the `TimelineCsvColumn` of each field in order, `undefined` to skip one; the first record is still a header) and `headers` (the header texts to look for without `columns`; defaults as for export) |

**MSPDI.** Tasks get `UID` and `ID` from 1 in input order and are written as manually scheduled tasks (`Manual` 1, with `ManualStart`, `ManualFinish` and `ManualDuration`), so Microsoft Project keeps their dates instead of rescheduling them on its default calendar. Each task has `Name`, `Start`, `Finish`, `Duration` (the elapsed span as `PT#H#M#S`; 0 for milestones), `OutlineLevel`, `OutlineNumber` and `WBS` (both derived from the outline levels), `Milestone` (set for `milestone: true` and for `start === end`), `Summary` (set when the next task is one level deeper) and `PercentComplete` (rounded). Dependencies become `PredecessorLink` elements on the successor with `PredecessorUID`, `Type` (FF 0, FS 1, SF 2, SS 3), `LinkLag` in tenths of a minute and `LagFormat` 4 (elapsed minutes). Task `baselines` become `Baseline` elements after the predecessor links, with `Number`, `Interim` 0, `Start`, `Finish` and the elapsed `Duration`, rounded like the task dates; map your baseline set IDs to Microsoft Project's numbers (0 is Baseline, 1 to 10 are Baseline1 to Baseline10), for example `plan` to 0 and `rev1` to 1. The project carries `Name`, `Title`, `ScheduleFromStart` and the earliest start and latest finish as `StartDate` and `FinishDate`. Dates are local times without an offset suffix, as MSPDI expects, at second resolution: every start and finish is rounded to the nearest whole second (halves up) and `Duration` is the difference of the rounded times, so the three always agree. A task whose `constraints` has exactly one set constraint gets `ConstraintType` (2 Must Start On for `fixedStart`, 4 Start No Earlier Than, 5 Start No Later Than, 6 Finish No Earlier Than, 7 Finish No Later Than) and `ConstraintDate`, rounded like the task dates, after `PercentComplete`. Microsoft Project holds one constraint per task, so a task with two or more gets none; pick the one to keep before exporting. Not exported: calendars, resources, assignments, a second constraint of a task, notes, custom fields, baseline work and cost, and the input task IDs. Text is escaped with `escapeXml`. Empty or duplicate task IDs, a missing (`undefined` or `null`) project or task name, unknown dependency ends, a dependency from a task to itself (Microsoft Project does not accept a task as its own predecessor), unknown types, `baselines` that is not an array and a baseline number used twice on a task throw an Error; non-finite or inverted dates (of tasks and baselines), a baseline number that is not an integer from 0 to 10, an outline level that is not an integer from 1 or that grows by more than one from the previous task, a percent complete outside 0 to 100, a non-finite lag and a constraint time that is not finite throw a RangeError.

**iCalendar.** Lines end with CRLF and are folded at 75 octets, never inside a UTF-8 character; continuation lines start with a space. Times are UTC (`20261109T080000Z`), rounded to the nearest whole second (halves up). An event whose rounded end equals its rounded start, for example `end === start`, is written without `DTEND`, because RFC 5545 requires `DTEND` to be after `DTSTART`. TEXT values escape backslashes, semicolons, commas and line breaks and drop other control characters. Use globally unique IDs, for example `task-1@example.com`. Empty or duplicate IDs and a missing (`undefined` or `null`) summary throw an Error; non-finite or inverted times throw a RangeError.

**CSV.** Fields that contain a comma, a double quote, CR or LF are quoted, with inner quotes doubled; every record ends with CRLF. A non-finite number throws a RangeError. Formulas are not neutralized: when untrusted text is opened in a spreadsheet, prefix cells that start with `=`, `+`, `-` or `@` yourself.

**CSV import.** `parseCsv` accepts CRLF, LF and lone CR line ends, an optional final line break and a leading byte order mark, which it removes. A quoted field can contain the delimiter, line breaks and doubled quotes; a quote inside an unquoted field is kept as text. Every field is a string, an empty line is a record with one empty field and empty text has no records. An unterminated quoted field and text after a closing quote throw an Error with the line and column, for example `Unterminated quoted CSV field starting at line 2, column 3`.

`timelineFromCsvTable` finds its columns by header text, ignoring case and surrounding spaces, or takes them from `columns`; other columns are ignored. It needs `bar`, `start` and `end` and either `row` or `wbs`. With WBS codes, each code is a row with the ID `row-<code>` (for example `row-1.2`), its first `row` cell that is not blank as label (the code when every one is blank) and the row of the shorter code as parent; a parent code without a record of its own becomes a row labelled with its code, and rows are returned in tree preorder by code. Without WBS codes, each distinct row label is a top-level row `row-1`, `row-2`, … in order of appearance. Bars are `bar-1`, `bar-2`, … in record order with the label, the parsed `start` and `end` and, when the cell is not empty, `progress`. Rows without bars are not in a `timelineCsvTable` export, so they are not restored, and WBS codes are renumbered by `timelineWbsCodes` after such a gap. Records whose fields are all empty are skipped. Progress must be written as a plain decimal number, such as `0.25`, `.5` or `1`; hexadecimal, binary, octal and exponent forms (`0x1`, `1e0`) are rejected. WBS codes are ordered part by part as whole numbers of any length. A custom header in `headers` takes precedence over another column's default header, so `headers: { wbs: 'Row' }` reads the `Row` column as WBS codes and leaves `row` unmatched. Missing or repeated columns, and two custom headers that are equal ignoring case and surrounding spaces, throw an Error; an invalid WBS code throws an Error and an unreadable time, an end before the start and a progress that is not a plain decimal number from 0 to 1 throw a RangeError, each naming the CSV line (the one-based record number, with the header as line 1). Add application fields such as `editable` to the returned bars yourself.

```ts
import { parseCsv, timelineCsvTable, timelineFromCsvTable, toCsv, toICalendar, toMsProjectXml } from 'vue-weave/core'

const csv = toCsv(timelineCsvTable(rows, bars, { formatTime }))
const ics = toICalendar(bars.map(bar => ({ id: bar.id + '@example.com', summary: bar.label, start: bar.start, end: bar.end })))
const xml = toMsProjectXml({ name: 'Plan', tasks: bars.map(bar => ({ id: bar.id, name: bar.label, start: bar.start, end: bar.end })) })

// Import: the reverse of the CSV export above.
const imported = timelineFromCsvTable(parseCsv(await file.text()), { parseTime: text => Date.parse(text) })
```

### Network diagram from a schedule

`scheduleToGraph(result, dependencies, options?)` turns a successful `scheduleTasks` (or `propagateEdit`, `rescheduleFromStatusDate`) result into an activity-on-node diagram for NetworkGraph. It returns a `ScheduleGraph`: `nodes` (one `NetworkNode` per task in result order, with ID, label, a detail with the early start, early finish and total float, and `data` of type `ScheduleGraphNodeData`), `edges` (one `GraphEdge` per dependency with the dependency's ID, a label and `data` of type `ScheduleGraphEdgeData`: `type`, `critical` and, only for a non-zero lag, `lag`), `criticalNodeIds` and `criticalEdgeIds` (the result's `criticalDependencyIds`). Critical tasks get the `criticalTone` (default amber) and the others the `tone` (default blue). For an ALAP task the early dates are `earliestStart` and `earliestEnd`. An edge label shows the dependency type when it is not FS and a non-zero `lag` formatted by `formatLag`, separated by a space: `SS`, `+2 h`, `SS +2 h` or `FF −0.5 h` (a lead). An FS dependency without lag, or with a lag of 0, has no label, as before lags were shown.

`ScheduleGraphOptions`: `label(taskId)` (default the ID), `formatTime` (default UTC `YYYY-MM-DD HH:mm`), `formatDuration` for the float (default hours of a millisecond duration, for example `1.5 h`), `formatLag` for a non-zero lag (default `formatDependencyLag`, signed hours of a millisecond lag such as `+2 h`; called only for a non-zero lag, so charts in other units pass their own, as with GanttChart `formatLag`), `labels` (`earlyStart`, `earlyFinish` and `float` prefixes; defaults ES, EF and Float), `criticalTone` and `tone`. A failed result, a dependency whose ends are not tasks of the result, a dependency from a task to itself, or a repeated dependency ID (edge IDs must be unique) throws an Error; a lag that is not a finite number throws a RangeError.

```vue
<NetworkGraph :nodes="graph.nodes" :edges="graph.edges" :related-ids="graph.criticalNodeIds" :options="{ nodeWidth: 280 }" />
```

`relatedIds` highlights the critical tasks and the edges between them; use `criticalEdgeIds` with an `edge` slot to style exactly the controlling links.

## Application undo and redo

Import `useEditHistory(initial, limit = 100)` from the Vue entry point. It returns `state`, `canUndo`, `canRedo`, `commit`, `undo`, `redo` and `reset`. The limit is the maximum number of undo steps and must be a positive integer; invalid limits throw `RangeError`.

Pass a complete immutable snapshot to `commit` after accepting an edit. Snapshots are stored by reference, without cloning or freezing; do not mutate them after committing. Committing the current snapshot reference does nothing. A batch move or endpoint replacement can be one history entry. Committing after an undo discards the redo branch. `undo` and `redo` do nothing when unavailable; `reset(snapshot)` replaces the history and clears both branches. Persist accepted changes through the application storage layer.

## Export to SVG and PNG

Both components expose two export methods on their template ref. They need no dependencies and never change props or component state.

| Method | Returns | Behavior |
| --- | --- | --- |
| exportSvg(options?) | string | A standalone SVG document (`xmlns`, explicit `width`, `height` and `viewBox`) of the whole chart |
| exportPng(options?) | Promise<Blob> | `exportSvg(options)` rasterized in the browser to an `image/png` blob |

The export always covers the whole content, not the viewport. NetworkGraph exports every node, edge, edge label and group, whatever the camera position and with or without `cullOffscreen`; nodes in `selectedIds` (or `selectedId`) use the selected style. GanttChart exports every displayed row (descendants of collapsed rows are omitted, as on screen), the row heading column and `columns`, header bands and ticks, `nonWorkingPeriods` shading, bars with progress, segments, critical outlines, float lines, deadline indicators and late outlines, milestones, baselines (the sets selected by `baselineIds`, with their titles), scheduling constraint markers, summaries, dependencies (including `highlightedDependencyIds`) and their lag labels, markers, the now line, the status-date and progress lines and the load histogram rows, over the whole `range` at the current zoom and zoom preset. Colours are read from the `--vw-*` custom properties in effect on the component, and the font from its computed `font-family`.

The export uses the default rendering. Slot content (`node`, `edge`, `row`, `row-heading`, `cell`, `bar`, `tick`, `load-row`, `load-segment`) cannot be reproduced; use the label options below instead. Text is clipped to its box rather than ellipsized, and the width of marker labels is estimated. Hover, focus and pointer previews are not exported.

`GanttExportOptions<R, B>`: `timeRange` (export a narrower time window), `rowRange` (`{ start, end }`, half-open indices into the displayed rows after collapsing), `includeLoad` (default true), `includeStatusDate` (default true: the `statusDate` line and, with `showProgressLine`, the progress line), `background` (default true), `title`, `rowHeading` (defaults to `labels.rows`), `idPrefix`, `theme` (an `SvgExportThemeInput` that overrides the colours read from CSS), `barLabel(bar)` and `rowLabel(row)`. On a chart the callbacks receive its row and bar types R and B.

`GraphExportOptions<N, E>`: `padding` (default 16), `background` (default true), `title`, `idPrefix`, `theme`, `includeSelection` (default true), `nodeLabel(node)`, `nodeDetail(node)` and `edgeLabel(edge)`. On a graph the callbacks receive the nodes and edges it draws, `GraphShownNode<N, G>` and `GraphShownEdge<E, G>`.

`exportPng` additionally takes `scale` (`PngExportOptions`), the number of device pixels per CSS pixel: greater than 0 and at most 8, default 1. The PNG is `ceil(width × scale)` by `ceil(height × scale)` pixels. It must fit within 16,384 pixels per side and 268,435,456 pixels in total; otherwise the promise rejects with a `RangeError` that names the size. Invalid numeric options (for example a negative `padding`, an inverted `timeRange` or an out-of-range `rowRange`) throw a `RangeError` from `exportSvg` and reject the `exportPng` promise. `exportSvg` on a GanttChart whose input is invalid throws the current validation error. PNG export requires a browser (`Image`, `canvas`); call `exportSvg` or the core builders on a server.

```ts
const svg = chart.value!.exportSvg({ title: 'Plan', timeRange: { start, end } })
const png = await chart.value!.exportPng({ scale: 2 })
```

The core entry provides the same rendering without Vue or a DOM, for servers, workers and tests.

| Export | Purpose |
| --- | --- |
| renderGraphSvg(layout, nodes, edges, options?) | SVG document of a graph layout. `GraphSvgOptions<N, E>` adds `groups` (`GraphSvgGroup` rectangles), `selectedIds`, `padding` and the label callbacks, which receive the node and edge types of the arguments, to the shared options |
| renderTimelineSvg(rows, bars, dependencies, scale, options?) | SVG document of a timeline on any `TimeScale`. `TimelineSvgOptions` covers `collapsedIds`, `timeRange`, `rowRange`, `rowHeight` (66), `laneCount` (1), `labelWidth` (154), `columns`, `showSummaries`, `headerBands`, `markers`, `now`, `nowLabel`, `tickStep` or `tickSteps`, `tickAnchor`, `formatTime`, `rowHeading`, `loadRows`, `loadSegments`, `loadRowHeight` (44), `highlightedDependencyIds`, `nonWorkingPeriods`, `statusDate`, `statusDateLabel` (default "Status date"), `showProgressLine`, `formatLag` (default `formatDependencyLag`; labels each dependency with a non-zero `lag`), `baselineIds`, `baselineLabel` (default "Baseline" for `timelineBaselineId`, otherwise the set ID), `formatVariance` (default `formatDependencyLag`) and `varianceLabels` (`start`, `finish`, `duration`; defaults "start", "finish" and "duration"), which draw baseline sets as described in [Baseline sets](#baseline-sets), `constraintLabels` (text of each `TimelineConstraintKind` in marker titles; defaults as `GanttLabels`) and `constraintViolatedLabel` (default "violated"), `barLabel` and `rowLabel`; `columns` and the label callbacks receive the row and bar types of the arguments (`TimelineSvgOptions<R, B>`). Bar fields `critical`, `latestEnd`, `deadline`, `segments` and `constraints` are drawn as on screen |
| escapeXml(text) | Escape `& < > " '` and drop characters that XML 1.0 forbids |
| defaultSvgExportTheme | The stylesheet's fallback colours as an `SvgExportTheme` |
| mirrorTimeScale(scale) | A right-to-left copy of a `TimeScale`: range start maps to `width`, range end to 0 |

Shared `SvgExportOptions` are `theme` (`SvgExportThemeInput`: any of `surface`, `surfaceMuted`, `text`, `muted`, `border`, `grid`, `edge`, `accent`, `onSolid`, `markerInk` (marker and now-flag label text; default `#ffffff`, read from `--vw-marker-ink` by the component export methods), `baseline`, `baseline2` and `baseline3` (the second and third baseline slots, read from `--vw-baseline-2` and `--vw-baseline-3`; optional in `SvgExportTheme`), `marker`, `now`, `load`, `loadOverload`, `loadCapacity`, `dependencyHighlight`, `nonWorking`, `critical`, `float`, `deadline`, `status`, `constraint` and `constraintViolated` (read from `--vw-constraint` and `--vw-constraint-violated`) and per-tone `ink`, `line`, `pale`, `solid`; the seven newest are optional in `SvgExportTheme` and always present in `defaultSvgExportTheme`), `fontFamily`, `title`, `background`, `idPrefix` (letters, digits, `_`, `.` and `-`; default `vw-export`) and `direction` (`ltr` or `rtl`). The builders validate their input like the components do and throw `RangeError` for invalid numbers or geometry and `Error` for bad references and IDs. All text and attribute values are escaped; the output contains no scripts, event attributes or external references.

## Right-to-left layout

Both components take an opt-in `dir` prop of type `ChartDirection`.

| Value | Behavior |
| --- | --- |
| `ltr` (default) | Unchanged left-to-right rendering. No `dir` attribute is written. |
| `rtl` | Writes `dir="rtl"` on the component root and adds the `vw-rtl` class. Server rendering already produces right-to-left markup. |
| `auto` | Writes no attribute and follows the CSS `direction` inherited by the component root, read after mounting, whenever `dir` changes and whenever an ancestor's `dir` attribute changes (observed with a `MutationObserver` while `dir` is `auto`). A change of direction cancels a gesture in flight. Direction changes made only through CSS are not observed. Server rendering and the first client render are left-to-right. |

In a right-to-left GanttChart the row heading column and `columns` sit on the right and time increases from right to left. Header bands, ticks, the grid, non-working shading, bars, progress, segments, float lines, deadline indicators, scheduling constraint markers and handles (their flags point the other way, towards the allowed times), baselines, summaries, markers, the now line, the status-date and progress lines, dependency paths and lag label positions (the label text itself is not mirrored), link and reconnect handles and load histogram rows are mirrored. Positions are measured from the inline-start (right) edge, so `TimelineEdit` proposals, `validateEdit`, `scrollToTime(time)` (which puts `time` at the right edge of the time area), keeping the centered time on zoom and preset changes, pinch and wheel zoom anchoring, autoscroll near either edge and keyboard reveal all work in the same time units as in LTR. The scroll container uses the standard right-to-left convention in which `scrollLeft` is 0 at the start and negative after scrolling towards later times; browsers that report positive values are not supported. Switching direction cancels an in-flight gesture and keeps the time at the inline-start edge in view.

Keyboard editing follows the visual direction. In RTL, ArrowLeft moves a focused editable bar one `snap` later and ArrowRight one `snap` earlier. Shift with an arrow moves the end and Alt with an arrow moves the start, in the same visual direction (Shift+ArrowLeft makes the bar end later). Up and Down (with `rowDraggable`) are unchanged. Pointer drags follow the pointer: dragging left moves later. The start resize handle is on the right edge of a bar and the end handle on the left. When a dependency is dropped on a bar body, the right half picks the start and the left half the finish. The collapsed-row toggle shows ◂ instead of ▸.

In a right-to-left NetworkGraph only the chrome changes: the zoom tools and the minimap move to the bottom-left corner, node titles and details, group labels and edge labels are right-aligned with `direction: rtl`, and the default node text is anchored at the box's right edge. Layout geometry, edge routes, camera, panning keys and saved positions are unchanged; use `options.direction: 'RL'` to mirror the layout itself. Custom node slots own their own text alignment.

`exportSvg` and `exportPng` follow the component's direction. In the core, `renderTimelineSvg` and `renderGraphSvg` take `direction: 'rtl'`, and `mirrorTimeScale(scale)` returns a scale with `toX(range.start) = width` and `toX(range.end) = 0`; its round trips are exact whenever those of `scale` are and the pixel values are exactly representable.

## Typed data

`NetworkNode`, `GraphEdge`, `TimelineRow` and `TimelineBar` take the type of their optional `data` as a type parameter that defaults to `unknown`: `NetworkNode<D = unknown>`, `GraphEdge<D = unknown>`, `TimelineRow<D = unknown>` and `TimelineBar<D = unknown>`. Both components are generic over the whole item types, so extra fields that an application adds to its items (for example `NetworkNode<Owner> & { priority: number }`) reach the slots and callbacks as well. Vue infers the parameters from the props in a template; nothing is written at the component. Without type arguments every type is what it was before, with `unknown` data.

| Component | Type parameters | Inferred from | Where the items come back |
| --- | --- | --- | --- |
| NetworkGraph | `N extends NetworkNode = NetworkNode`, `E extends GraphEdge = GraphEdge`, `G extends NetworkGroup = never` | `nodes`, `edges`, `groups` | `node`, `edge` and `tooltip` slot props, `layout`, the `exportSvg` and `exportPng` label callbacks |
| GanttChart | `R extends TimelineRow = TimelineRow`, `B extends TimelineBar = TimelineBar` | `rows`, `bars` | `row`, `cell`, `bar` and `tooltip` slot props, `columns` (`value`, `editable`), `creatable`, the `exportSvg` and `exportPng` label callbacks |

Events and validators carry IDs and intervals, not items (`select(id)`, `node-move`, `connect`, `edit`, `cell-edit`, `row-move`, `context-menu` targets and the others), so their types do not change; look an item up by its ID in your own typed array.

A graph with `groups` can collapse them, and a collapsed group is drawn as a proxy node: a `GraphCollapsedNode` (`NetworkNode<GraphCollapsedNodeData>`), whose edges are re-attached and may merge into an edge without `data`. That is why the graph's slots and callbacks receive `GraphShownNode<N, G>` and `GraphShownEdge<E, G>`: N and E alone without `groups` (G is `never`), and with `groups` also the proxy node and a `GraphEdge<never>`. Narrow before reading application fields, for example with `node.data && 'collapsedGroup' in node.data`.

```vue
<script setup lang="ts">
import { NetworkGraph, type GraphEdge, type NetworkNode } from 'vue-weave'

interface Task { owner: string }
const nodes: NetworkNode<Task>[] = [{ id: 'cut', label: 'Cut', data: { owner: 'Ada' } }]
const edges: GraphEdge<{ weight: number }>[] = []
</script>

<template>
  <NetworkGraph :nodes="nodes" :edges="edges">
    <template #node="{ node, box }">
      <!-- node.data is Task | undefined -->
      <text :x="12" :y="box.height / 2">{{ node.label }} · {{ node.data?.owner }}</text>
    </template>
    <template #edge="{ edge, path }">
      <path :d="path" :stroke-width="edge.data?.weight ?? 1" />
    </template>
  </NetworkGraph>
</template>
```

```vue
<script setup lang="ts">
import { GanttChart, type TimelineBar, type TimelineColumn, type TimelineRow } from 'vue-weave'

type Team = TimelineRow<{ lead: string }>
const rows: Team[] = [{ id: 'core', label: 'Core', data: { lead: 'Grace' } }]
const bars: TimelineBar<{ cost: number }>[] = [{ id: 'b', rowId: 'core', label: 'Build', start: 0, end: 3_600_000, data: { cost: 4 } }]
const columns: TimelineColumn<Team>[] = [{ id: 'lead', label: 'Lead', width: 96, value: row => row.data?.lead ?? '' }]
</script>

<template>
  <GanttChart :rows="rows" :bars="bars" :columns="columns" :range="{ start: 0, end: 8 * 3_600_000 }">
    <template #bar="{ bar }">{{ bar.label }} ({{ bar.data?.cost }})</template>
  </GanttChart>
</template>
```

Template refs: in a single-file component, `useTemplateRef('graph')` (Vue 3.5) is inferred by vue-tsc from the template, including the item types. To declare the type yourself, use `NetworkGraphExposed<N, E, G>` and `GanttChartExposed<R, B>`, the methods each component exposes, with the same type arguments as the props. `InstanceType<typeof NetworkGraph>` and `InstanceType<typeof GanttChart>` keep working and give the component instance with the default item types, so their `exportSvg` callbacks receive `unknown` data.

```ts
import { ref, useTemplateRef } from 'vue'
import type { GanttChartExposed, GraphEdge, NetworkGraphExposed, NetworkNode, TimelineBar, TimelineRow } from 'vue-weave'

const graph = useTemplateRef('graph') // inferred from <NetworkGraph ref="graph" ...>
const typedGraph = ref<NetworkGraphExposed<NetworkNode<{ owner: string }>, GraphEdge>>()
const chart = ref<GanttChartExposed<TimelineRow, TimelineBar<{ cost: number }>>>()
typedGraph.value?.exportSvg({ nodeLabel: node => node.data?.owner ?? node.label })
chart.value?.exportSvg({ barLabel: bar => `${bar.label} ${bar.data?.cost}` })
```

The public component types are `NetworkGraphComponent` and `GanttChartComponent`. Core helpers that return the items they receive keep their types as well: `moveTimelineRow`, `indentTimelineRow`, `outdentTimelineRow`, `removeTimelineBars`, `assignLanes`, `createTimelineRowTree`, `collapseGraphGroups`, `removeGraphElements`, `cloneGraphElements`, `searchGraphNodes` and `filterGraph`, and the label callbacks of `renderGraphSvg` and `renderTimelineSvg`.
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
