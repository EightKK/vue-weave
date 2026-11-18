# Public API

Identifiers are nonempty strings and must be unique within their corresponding collection. Named port IDs are scoped to each node. Labels are rendered as Vue text. Escape/sanitize any HTML you supply in custom slots according to your application's trust boundaries.

The package is ESM-only. Import Vue components and shared types from `vue-weave`, headless calculations from `vue-weave/core`, and the stylesheet from `vue-weave/style.css`. Declarations support TypeScript's `Bundler` and `NodeNext` resolution. The core entry does not require Vue or browser globals at runtime. Node.js 22.18+ is the declared runtime baseline; Vue components require the Vue 3.5+ peer dependency. The package also exports `vue-weave/package.json`, so tools can read the installed version.

The stylesheet also ships opt-in `vw-theme-dark` and `vw-theme-auto` classes and forced-colors, reduced-motion and print rules; see docs/integration.md.

## Contents

- [NetworkGraph](#networkgraph)
  - [Graph editing and minimap](#graph-editing-and-minimap)
  - [Named ports, reconnection and group actions](#named-ports-reconnection-and-group-actions)
  - [Port rules and valid-target hints](#port-rules-and-valid-target-hints)
  - [Large graphs, touch gestures, nested groups and search](#large-graphs-touch-gestures-nested-groups-and-search)
  - [Edge selection, deletion, context menu, tooltips and fit to selection](#edge-selection-deletion-context-menu-tooltips-and-fit-to-selection)
  - [Snap to grid, alignment guides, auto-pan, drops and clipboard](#snap-to-grid-alignment-guides-auto-pan-drops-and-clipboard)
  - [Group collapse, edge styles and waypoints, level of detail and node resizing](#group-collapse-edge-styles-and-waypoints-level-of-detail-and-node-resizing)
  - [Node shapes, edge markers, animated and parallel edges](#node-shapes-edge-markers-animated-and-parallel-edges)
  - [NetworkGraph directions and crossing reduction](#networkgraph-directions-and-crossing-reduction)
  - [Label editing, lasso selection and item slots](#label-editing-lasso-selection-and-item-slots)
- [GanttChart](#ganttchart)
  - [Editing contract](#editing-contract)
  - [Timeline planning overlays](#timeline-planning-overlays)
  - [Baseline sets](#baseline-sets)
  - [Timeline columns and rollups](#timeline-columns-and-rollups)
  - [Column resizing](#column-resizing)
  - [Dependency editing](#dependency-editing)
  - [Dependency lag](#dependency-lag)
  - [Dependencies on summary rows](#dependencies-on-summary-rows)
  - [Multiple selection, batch moves and row moves](#multiple-selection-batch-moves-and-row-moves)
  - [Zoom presets, now marker and touch zoom](#zoom-presets-now-marker-and-touch-zoom)
  - [Calendar zoom presets and locale-aware labels](#calendar-zoom-presets-and-locale-aware-labels)
  - [Marker ranges](#marker-ranges)
  - [Resource load histogram](#resource-load-histogram)
  - [Linked views, reveal and external drops](#linked-views-reveal-and-external-drops)
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
  - [Graph analysis](#graph-analysis)
  - [Viewport helpers](#viewport-helpers)
  - [Row trees and summaries](#row-trees-and-summaries)
  - [Calendars, scheduling and resource load](#calendars-scheduling-and-resource-load)
  - [Interchange exports](#interchange-exports)
  - [Microsoft Project import](#microsoft-project-import)
  - [Network diagram from a schedule](#network-diagram-from-a-schedule)
- [Linked views](#linked-views)
  - [Time range exploration](#time-range-exploration)
- [Resource timelines and unplanned tasks](#resource-timelines-and-unplanned-tasks)
- [Planning diagnostics and schedule traces](#planning-diagnostics-and-schedule-traces)
- [Asynchronous layouts and preserved routes](#asynchronous-layouts-and-preserved-routes)
- [Typed fields and timeline views](#typed-fields-and-timeline-views)
- [Application undo and redo](#application-undo-and-redo)
  - [Edit transactions and asynchronous saving](#edit-transactions-and-asynchronous-saving)
- [Versioned JSON snapshots](#versioned-json-snapshots)
- [Export to SVG and PNG](#export-to-svg-and-png)
- [Right-to-left layout](#right-to-left-layout)
- [Typed data](#typed-data)

## NetworkGraph

| Prop | Type / default | Meaning |
| --- | --- | --- |
| nodes | readonly N[] (N extends NetworkNode) / required | ID, label, optional detail, tone, shape and opaque data. N is inferred; see [Typed data](#typed-data) |
| edges | readonly E[] (E extends GraphEdge) / required | ID, from/to node IDs, optional label, data, waypoints, edge style, markers and animation. E is inferred |
| selectedId | string / undefined | Controlled selection; also supports v-model:selected-id |
| relatedIds | ReadonlySet<string> / undefined | Emphasizes included nodes and edges joining two included nodes |
| options | GraphLayeredLayoutOptions / defaults below | Built-in layout configuration |
| layout | GraphLayoutFunction<GraphShownNode<N, G>, GraphShownEdge<E, G>> / undefined | Overrides built-in layout. Without `groups` it receives N and E; see [Typed data](#typed-data) |
| labels | Partial<GraphLabels> / English | Region, empty, zoom, zoomIn, zoomOut and fit |
| height | number or CSS string / 220px | SVG viewport height |
| showControls | boolean / true | Zoom/fit buttons |
| dir | ChartDirection / ltr | `rtl` or `auto` mirrors the zoom tools, minimap and label alignment; see [Right-to-left layout](#right-to-left-layout) |

GraphLayoutOptions defaults are direction LR, nodeWidth 144, nodeHeight 58, columnGap 50, rowGap 24 and padding 20. Sizes must be positive; spacing must be nonnegative. Empty graphs keep positive layout dimensions even with zero padding. TB changes the layout direction while preserving each node's physical width and height.

NetworkNode<D> has id, label, optional detail, tone (teal/blue/amber/violet), shape (`NetworkNodeShape`: box, rounded, diamond, ellipse or hexagon; see [Node shapes, edge markers, animated and parallel edges](#node-shapes-edge-markers-animated-and-parallel-edges)), resizable and data (D, default unknown). GraphEdge<D> has id, from, to, optional label, data (D, default unknown) and points (waypoints, see [Group collapse, edge styles and waypoints, level of detail and node resizing](#group-collapse-edge-styles-and-waypoints-level-of-detail-and-node-resizing)), and the optional edgeStyle, markerStart, markerEnd and animated (see [Node shapes, edge markers, animated and parallel edges](#node-shapes-edge-markers-animated-and-parallel-edges)). The default renderer clips long text to the node box; its title exposes the full label. Node slots own their clipping and sizing.

A custom layout returns GraphLayout containing boxes, paths and edgeLabels Maps plus positive finite width and height. Each node box has x, y, width, height and rank. Each edge needs an SVG path. Labels are optional map entries. Coordinates are chart-local pixels. Keep paths and boxes within the supplied bounds for accurate fit-to-view.

Events are select(id), update:selectedId(id), and viewport-change({x,y,scale}). The last event reports pan/zoom/fit changes. Exposed methods are fit(options) (see [Fit to selection](#edge-selection-deletion-context-menu-tooltips-and-fit-to-selection)), zoom(factor, optionalX, optionalY), getViewport() and setViewport({x,y,scale}), plus focusNode(id, options), revealNode(id, options) and getTargetClientRect(target) (see [Large graphs, touch gestures, nested groups and search](#large-graphs-touch-gestures-nested-groups-and-search)), exportSvg(options) and exportPng(options) (see [Export to SVG and PNG](#export-to-svg-and-png)), and toGraphPoint(clientX, clientY), getViewportCenter() and setViewportCenter(center, scale) (see [Snap to grid, alignment guides, auto-pan, drops and clipboard](#snap-to-grid-alignment-guides-auto-pan-drops-and-clipboard)). Viewport scale is clamped by zoom to 0.1–3, and setViewport requires the same range. When the whole graph only fits below 0.1, the lower limit becomes the fit scale for the current viewport size, so Fit to view always shows every node and a fitted viewport from getViewport() can be restored. The camera starts in automatic fit mode: it is fitted on mount, on resize and whenever the graph structure changes. Panning, zooming (buttons, Ctrl + wheel or pinch), the minimap, keyboard panning, auto-pan, setViewport, focusNode and fit({ ids }) switch it to manual mode. In manual mode a structural change that the parent accepts (connect, delete, paste or duplicate, a group collapse or expand) keeps the camera where it is; if the smaller graph raises the lower zoom limit, the scale is clamped to it around the stage centre and viewport-change is emitted. The camera re-fits and returns to automatic mode when the layout function or layout options (for example the direction) change, or when the graph is replaced: it was or becomes empty, or none of the previous node IDs remain. fit() without ids re-fits the whole graph and also returns to automatic fitting. Slots are node({node,box,selected,dimmed,related,highlighted,scale}) (`NetworkNodeSlot`), edge({edge,path,selected,related,highlighted,dimmed,scale}) (`NetworkEdgeSlot`), empty and the optional HTML tooltip({target}), plus the opt-in node-toolbar, edge-toolbar, group and minimap-node slots (see [Label editing, lasso selection and item slots](#label-editing-lasso-selection-and-item-slots)). In the node slot `selected` is the node selection, `related` is membership in `relatedIds` and `highlighted` in `highlightedNodeIds`. In the edge slot `selected` is the edge selection (`selectedEdgeIds`, only with `edgesSelectable`), `related` is true when both ends are in `relatedIds` and `highlighted` follows `highlightedEdgeIds`; before 0.4.0 the edge slot's `selected` carried the related state. The stylesheet paints node rectangles and text (fill, stroke, hover, selected, related and highlighted strokes), and these rules also reach `rect` and `text` elements in a node slot and override their presentation attributes such as `fill`. Set `unstyledNodeSlots` to keep that paint off the slot content: node groups rendered by the slot get `vw-is-unstyled`, and only the default renderer is painted; the focus ring, cursor and the `user-select` and `pointer-events` rules on text still apply. SVG slots must contain SVG elements. Each node and edge renders as its own internal component, so a node or edge slot runs again only when its own slot props change, when reactive state it reads changes, or when the slot function is replaced; a node drag re-renders the dragged nodes and their edges, not the whole graph. Read changing data reactively (props, refs, computed values) inside these slots, not from plain variables. The scale slot prop follows the camera, so zooming re-renders every node and edge slot; panning does not.

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
| gesture-start(gesture) / gesture-end(gesture) | Report the gestures that a new layout or other source change would cancel, so an application can hold such changes until they end (see [Asynchronous layouts and preserved routes](#asynchronous-layouts-and-preserved-routes)). `GraphGesture` is `{ kind, source }`; `GraphGestureEnd` adds `outcome: 'committed' \| 'cancelled'`. `kind` (`GraphGestureKind`) is `'node-drag'` (one node) or `'nodes-drag'` (several, including a group label drag), `'node-resize'`, `'edge-reshape'` (a waypoint or insert handle drag), `'connect'` or `'reconnect'` (from arming, by press, click, Enter or Space, until the connection is completed, dropped or cancelled; a press without movement stays armed), `'box-select'`, `'pan'` (a background press, also one that does not move) or `'pinch'`. `source` is `'keyboard'` only for a connection or reconnection armed from the keyboard. Each `gesture-start` is followed by exactly one `gesture-end` of the same gesture, emitted after any proposal or `*-rejected` event: `'committed'` when the user released the pointer or completed or dropped the connection (with or without a proposal), `'cancelled'` on Escape, pointer cancellation, lost capture, a context menu, a second touch, a camera method (`fit`, `zoom`, `setViewport`, `focusNode`, `revealNode`, `setViewportCenter`, the minimap, keyboard panning, Ctrl + wheel), a change of data, layout, options or editing props, a resize of the stage, a direction change, or the component unmounting (emitted before it unmounts). A pointer gesture and an armed connection can be in flight at the same time, so count starts and ends rather than tracking one flag. Instant edits (arrow-key moves, keyboard resizing and waypoint edits, Delete, clipboard keys) and instant camera changes (zoom buttons, Ctrl + wheel, keyboard panning, the minimap, fit) are not gestures: they finish in one step, and a new layout cannot interrupt them. Nothing is emitted during server rendering. |

Editing and the minimap are opt-in. The select and update:selectedId events fire for node selection, including when selectedIds is supplied. A selected node moves with the other selected movable nodes. Escape or a new layout discards an in-flight preview. `groups` and `labels` are compared by value like `options`, so a new but equal array or object (such as an inline literal in a parent template) neither rebuilds the layout nor cancels a drag or pan; a real change still cancels it. A custom `layout` function keeps reference semantics. A drag, pan or connection belongs to one pointer; while it is in flight, a press of another pointer (for example a pen next to the mouse) starts nothing, except that a second touch still starts a pinch. Keyboard movement uses ten chart units per arrow press and forty with Shift, or grid steps with snapGrid. Update positions with a fresh map when accepting a move. The built-in overlay reroutes incident edges as curves and preserves other paths. A custom router can own absolute positions by supplying a layout function without the positions overlay. A new layout cancels a gesture in flight, except when the `layout` function returns a new object with the same geometry (boxes, paths, label anchors, size and route metadata) for unchanged inputs, as an asynchronous layout cache can (see [Asynchronous layouts and preserved routes](#asynchronous-layouts-and-preserved-routes)).

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

### Port rules and valid-target hints

Port rules declare what each connection endpoint accepts: a type tag, a direction and a connection limit. They live in a separate `GraphPortRules` object rather than on `GraphPort`, so node, port and edge data and their types stay unchanged (the existing `GraphPort.direction` keeps its `source`/`target` meaning and still applies), rules can be derived from application state without copying them into nodes, and snapshots, clones and exports of graph data carry no rules.

| API | Behavior |
| --- | --- |
| GraphPortRule | `type` (a string, or a list of accepted strings; two endpoints are compatible when either has no type or they share a tag), `direction` (`GraphPortDirection`: `in` only as a target, `out` only as a source, `both`, the default; it applies together with `GraphPort.direction`) and `maxConnections` (a non-negative integer counting edge ends at the endpoint; omit for no limit) |
| GraphPortRules | `ports` (node ID → port ID → rule) for named ports, `nodes` (node ID → rule) for connections without a port, such as the single handle of a node without ports, and `default` for every endpoint without a rule of its own. An endpoint without any rule accepts everything |
| connectionRules (prop) | Opt-in. Every connect and reconnect proposal, by pointer or by the keyboard two-step connect, is checked against the rules (with the current `edges`) first; a broken rule rejects it with its reason through `connect-rejected` and the polite live region, and `validateConnection` is not called. A proposal that passes the rules then goes to `validateConnection`, which can still reject it. While a connection or reconnection is in progress (pointer drag or armed keyboard connect), each connection handle gets `vw-is-valid-target` or `vw-is-invalid-target`; an invalid handle also gets `aria-description` with the reason (none for the other handles of the fixed node, which the component never connects). Invalid handles stay activatable, so a keyboard user hears the reason. Without the prop, markup and behavior are unchanged |

A reconnection leaves the edge being reconnected out of the counts, so a port with `maxConnections: 1` can move its own edge. Collapsed-group proxies are not in `nodes`, so with `connectionRules` a connection to a proxy is rejected as `unknown-node`. Rules that name an unknown node or port throw when the component first checks a connection; keep the rules in step with `nodes`.

```ts
import { graphConnectionValidator, type GraphPortRules } from 'vue-weave/core'

const rules: GraphPortRules = {
  ports: {
    sensor: { reading: { type: 'number', direction: 'out' } },
    average: { a: { type: 'number', direction: 'in', maxConnections: 1 }, out: { type: 'number', direction: 'out' } },
  },
}
// <NetworkGraph :connection-rules="rules" :validate-connection="noDuplicates" ... />
// Or, without the prop, compose the rules into one validator (rules first, then your own):
const validate = graphConnectionValidator(nodes, edges, rules, noDuplicates)
```

The core functions below implement the rules; the component uses `createGraphConnectionChecker`.

### Large graphs, touch gestures, nested groups and search

| API | Behavior |
| --- | --- |
| cullOffscreen | boolean / false. Renders only the nodes, edges, edge labels, connection handles and groups whose bounds intersect the viewport plus cullOverscan. Layout, box selection, keyboard panning and the minimap still use every node, so the minimap shows the whole graph. |
| cullOverscan | number / 200. Margin in screen pixels around the viewport that stays rendered, so a short pan does not reveal blank space. |
| matchIds | ReadonlySet<string> / undefined. When supplied, nodes outside the set are dimmed. An empty set dims every node. |
| dimmedIds | ReadonlySet<string> / undefined. Nodes to dim explicitly. Combines with matchIds. |
| focusNode(id, options?) | Exposed method. Centers the camera on the node and keeps the current scale, or applies options.scale (0.1 to 3, or down to the fit scale for a graph that only fits below 0.1). Throws Error for an unknown ID and RangeError for a bad scale. Emits viewport-change. It works with culling because culling follows the camera. |
| highlightedNodeIds / highlightedEdgeIds | ReadonlySet<string> / undefined. Display-only highlight: the node group or the edge group gets the class vw-is-highlighted (stroke --vw-graph-highlight). See below. |
| revealNode(id, options?) | Exposed method. Returns Promise<RevealResult>. For a shown node (a proxy included) it centers the camera like focusNode (options.scale, else the current scale), waits for the next render so culling has rendered the node, then moves keyboard focus to it when options.focus is true, and resolves { status: 'revealed' }. For a node hidden in a collapsed group it resolves { status: 'hidden-by-collapse', proxyId } and for an unknown ID { status: 'unknown' }, in both cases without moving the camera. It never throws for an ID; a bad scale rejects with RangeError. focusNode is unchanged. |
| getTargetClientRect(target) | Exposed method. The DOMRect a ViewTarget of the graph view occupies on screen, in CSS pixels relative to the viewport like getBoundingClientRect: a node box, the bounding box of an edge path, or a group frame (a collapsed group is its proxy box). Undefined before mount, for targets of other views and for unknown or hidden nodes, edges and groups. The rectangle may lie outside the stage and does not depend on culling. Use it to place a toolbar or inspector next to an item. |
| target-enter / target-leave / target-activate | Events with ViewTargetEvent<GraphViewTarget>: { target: { view: 'graph', kind: 'node' \| 'edge' \| 'group', id }, source: 'pointer' \| 'keyboard' }. Enter and leave fire when the pointer enters or leaves a node, an edge or a group frame, and when keyboard focus (focus-visible, not focus moved by a press) enters or leaves a node, an edge hit area or a group label. Activate fires on click, Enter or Space on a node (after select), an edge hit area (after edge-select) or a group label; a click that ends a drag does not activate. A proxy of a collapsed group is reported as kind 'group' with the group ID. Hovering never moves the camera. |
| NetworkGroup.parentId | Optional ID of another group. The group is painted inside its parent and the parent bounds enclose it. |

Culling keeps these elements rendered even when they are off screen: selected nodes, the node or edge that has keyboard focus (and the node that owns a focused connection handle), nodes involved in a pointer drag or group drag, the source of a pending connection, the edge being reconnected and the groups that contain moved nodes. Elements that are culled are not in the DOM, so Tab skips them and they cannot be found by accessible name. Call focusNode(id) to bring one into view. Before mount there is no measured viewport. Server rendering and the first client render use the 1150 x 270 default viewport with the initial fit camera, so the output is deterministic and hydrates cleanly. The measured size replaces it after mount. Culling is based on bounding boxes: a path is bounded by its control points, and edge labels are included with a fixed reach, so culling errs on the side of rendering. Custom node and edge slots are not rendered for culled elements.

Two-finger gestures use Pointer Events with pointerType touch. When a second finger lands, any in-flight one-finger drag, connection, box selection or pan is cancelled without emitting a proposal. Pinching then scales around the midpoint, the scale is clamped like the zoom buttons, and moving both fingers together pans. Each change emits viewport-change. One-finger background pan, node drag, connecting and box selection behave as before, and plain wheel scrolling still passes through (Ctrl + wheel zooms). Lifting one finger ends the pinch; the remaining finger does nothing until it is lifted.

Nested groups are opt-in. Give a group parentId to place it in another group. nodeIds lists only the direct members, and a group that has child groups may have an empty nodeIds. A node can still belong to one group directly. Parents are painted first, in input order among siblings. The parent bounds enclose the child bounds, its label strip and a margin, and nested bounds can extend past the layout padding, so leave extra options.padding for deep nesting. Dragging a parent label (or using arrow keys on it) moves every descendant member as one node-move or nodes-move proposal. Dragging a child moves only its own members. A nested group is announced as "Move group Inner within Outer"; the within word is the optional GraphLabels.groupWithin label. The component throws Error for a duplicate ID, an unknown parentId, a parent cycle, an unknown or repeated member, or a group with no members after expansion. Groups without parentId behave as before.

The dimming hooks are presentation only. Dimmed nodes and the edges that touch them receive the vw-dimmed class and reduced opacity (--vw-dimmed-opacity, default 0.28). Selection, events and keyboard behavior do not change. The node and edge slots receive dimmed. Compute matches in your application; the component never filters data.

highlightedNodeIds and highlightedEdgeIds are for showing what another view selected or hovers (see [Linked views](#linked-views)). They are independent of the other sets:

| Input | Meaning | Delete, move, copy | Edges | Kept rendered when culled |
| --- | --- | --- | --- | --- |
| selectedId / selectedIds | Selection owned by this graph | Yes | As before | Yes |
| relatedIds | Related nodes | No | An edge whose two ends are related (vw-is-related) | No |
| matchIds / dimmedIds | Dimming | No | An edge with a dimmed end is dimmed | No |
| highlightedNodeIds / highlightedEdgeIds | Display-only highlight | No | Only the edges listed in highlightedEdgeIds | No; use revealNode to bring one into view |

The classes combine: a highlighted node can also be selected, related or dimmed, and dimming still lowers its opacity. Changing the highlight sets never cancels a drag, connection or pan. Unknown IDs are ignored. With collapsed groups, a highlighted hidden node highlights its proxy, a merged edge is highlighted when any of its original edges is, and an edge dropped inside a collapsed group highlights that group's proxy, as resolveCollapsedTargets resolves them. Slots do not receive a highlight prop; style custom content through the vw-is-highlighted class of the node or edge group. exportSvg and exportPng draw the highlight unless includeHighlight is false.

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
| unstyledNodeSlots | boolean / false. With a `node` slot, keeps the stylesheet's fill and stroke rules off the slot content (class `vw-is-unstyled` on each node group), so the slot's own attributes and classes decide its paint. No effect on the default renderer. |
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
| setViewportCenter(center, scale?) | Exposed method. Centers the camera on a chart point at scale (default: the current scale; the range of setViewport). With getViewportCenter() and getViewport().scale it saves and restores a camera independently of the container size, unlike the container-pixel translation of setViewport. After replacing nodes, call it after nextTick, because a replaced graph re-fits. Called before the stage is measured, the centre is applied again to the measured size unless the camera moved in between. Throws RangeError for a non-finite centre or a bad scale; emits viewport-change. |

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
| edgeStyle | 'curve' \| 'orthogonal' \| 'straight' / 'curve'. curve keeps today's routes. orthogonal draws right-angle routes with 6-unit rounded corners, straight draws straight lines clipped to the box borders (or to the outline of a diamond, ellipse or hexagon node). An edge's own GraphEdge.edgeStyle overrides it for that edge. Any other value throws RangeError while rendering. |
| GraphEdge.points | Optional waypoints in chart coordinates. The edge is drawn through them in every style: a polyline in straight and orthogonal, a smooth curve through the points in curve. |
| avoidNodes | boolean \| GraphObstacleAvoidance / false. Opt-in: orthogonal edges (the edgeStyle prop or an edge's own edgeStyle) without points are routed around every node box, collapsed-group proxies included, keeping `clearance` chart units away (default 8) and leaving and entering on the same sides as without the option. `true` uses the defaults; an object sets `clearance` and `bendPenalty` (default 24, the extra cost of a bend in units of length). Waypoints keep their precedence, self-loops keep their bracket, and a long-edge bypass lane is kept while it crosses no other box. An edge without a route around the boxes (an end boxed in) keeps the plain orthogonal route. Drag and resize previews reroute the edges of the changed nodes this way; the other edges are rerouted around a moved node once its new position is in `positions`. exportSvg and exportPng draw the same routes. Curve and straight edges are not affected. A negative or non-finite clearance or bend penalty, or a value of another type, throws RangeError while rendering. See findOrthogonalRoute for the algorithm and its cost. |
| routingPolicy | 'builtin' \| 'preserve' / 'builtin'. builtin is the routing described here: edges with named ports are redrawn from their port anchors, and orthogonal and straight redraw every edge. preserve keeps every path the layout drew, in every edge style and also for edges with named ports, while both ends still fit their boxes and ports (isGraphRouteValid); only edges with points, edges of moved or resized nodes, edges whose port or route metadata no longer fits and temporary routes are routed as above. With preserve, an edge the layout has no path for (such as an edge just connected while an external layout is recomputed) gets a temporary built-in route (completeGraphLayout) instead of the Missing layout path error. When preserve and edgeStyle disagree, preserve wins: a kept path is not restyled. Only paths the layout itself drew are kept: a path that the core routing functions drew (the output of routeGraphPorts or routeGraphEdges, a rerouted edge of a moved or resized node, a temporary route) counts as built-in and is drawn again by the built-in router. Any other value throws RangeError while rendering. |
| editableEdges | boolean / false. Gives every edge its focusable hit area (like edgesSelectable) and shows waypoint handles on the selected edge (the edge whose reconnect handles would show): a "Move waypoint N · edge" button per waypoint and an "Add waypoint N · edge" button in the middle of every segment between the edge ends and the waypoints. |
| edge-reshape(change) | GraphEdgeReshape with id, before and after: the edge's whole waypoint list before and after. Set the edge's points to after (remove the field when it is empty). |
| validateEdgeReshape / edge-reshape-rejected(change, reason) | Synchronous check; false rejects with labels.reshapeRejected, a string rejects with that reason, announced in the live region. |
| lodThreshold | number / undefined. Level of detail: while the camera scale is below it, the root gets vw-lod-low and the default renderer hides node detail text and edge labels. Must be greater than 0 and at most 3, otherwise rendering throws RangeError. Accessible names are unchanged. |
| node and edge slot scale | The node slot ({node, box, selected, dimmed, related, highlighted, scale}) and the edge slot ({edge, path, selected, related, highlighted, dimmed, scale}) receive the current camera scale for custom level-of-detail rendering. |
| sizes | ReadonlyMap<string, GraphNodeSize> / undefined. Width and height per node ID, applied on top of the layout boxes after positions, keeping each box's top-left corner; incident edges are rerouted. Sizes must be finite and positive (RangeError); unknown IDs are ignored. |
| resizable | boolean / false. Shows four corner handles on the node when exactly one node is selected (selectedId, or a selectedIds set of one), named "Resize" plus the node label and the corner ("Resize Split · bottom right"). NetworkNode.resizable false opts a node out; proxies of collapsed groups are not resizable. |
| minNodeSize | GraphNodeSize / { width: 40, height: 24 }. Smallest size a resize proposes; finite and positive, otherwise RangeError. |
| node-resize(change) | GraphNodeResize with id, before and after boxes ({ x, y, width, height }). Store after.width and after.height in sizes and, when after.x or after.y changed (a left or top corner), after.x and after.y in positions. |
| validateNodeResize / node-resize-rejected(change, reason) | Synchronous check; false rejects with labels.resizeRejected, a string with that reason. |

Every input is opt-in. Without them, and with edgeStyle 'curve', no waypoints, no sizes and no collapsed groups, the server markup, routes, events and accessible names are unchanged. The toggles and handles are drawn in one vw-network-overlay group above the nodes, which then also holds the connection preview and alignment guides.

Collapsing uses collapseGraphGroups before layout, so the layout, culling, the minimap, Fit to view, fit, focusNode and exportSvg all see the collapsed graph. Each outermost collapsed group becomes one proxy node whose ID is the group ID, with the group label, the detail "N nodes" (labels.collapsedNode and labels.collapsedNodes), the rounded shape and data { collapsedGroup, nodeIds }. Members are hidden; their edges are re-attached to the proxy, edges inside the group are dropped, and parallel re-attached edges merge into one edge that keeps the ID of the first original edge. Group IDs must therefore differ from node IDs. A collapsed child group becomes a member of its expanded parent. Hidden nodes cannot be focused, fitted or selected; fit and focusNode throw Error for their IDs, so map them to the proxy (the group ID). revealNode resolves { status: 'hidden-by-collapse', proxyId } for them instead; to show the node itself, expand its groups through a controlled collapsedGroupIds and call revealNode again after the render, or let revealLinkedTarget do both (see [Linked views](#linked-views)). Toggling moves keyboard focus to the replacement toggle.

Proposals that involve a proxy refer to the real data where they can:

- Moving a proxy (drag, arrow keys, a group label or a multiple selection that contains it) emits node-move or nodes-move for its movable members. They keep their offsets, and the top-left corner of their boxes in the expanded graph lands on the proxy's new position. A proxy is placed by the layout until one of its members has a saved position; from then on it sits at the top-left corner of its members.
- Deleting a proxy proposes its members; deleting a merged edge proposes all of its original edges. The GraphDeletion contains real IDs only.
- select, update:selectedId, update:selectedIds, box selection and connect proposals use the proxy ID. Reject connections to a proxy in validateConnection or map them to a member. Re-attached edges show no reconnect or waypoint handles, and proxies and hidden nodes are left out of copy-selection and duplicate-selection.

The orthogonal router leaves the source and enters the target on the sides that face each other along the layout direction (right and left for LR, left and right for RL, bottom and top for TB, top and bottom for BT), turning halfway between them. Boxes that overlap along that axis, such as nodes of the same rank, are joined by a bracket on the direction's outgoing side, and self-loops are brackets on that side. Named ports keep their anchors: the route leaves and enters perpendicular to the port side. A long-edge bypass lane drawn by layoutLayeredGraph is kept while both of its boxes are where the layout placed them. Moved and resized nodes are routed again. The straight style clips the line between the box centres, or towards the next waypoint, to the box borders. The orthogonal and straight styles also reroute the edges of a custom layout, unless routingPolicy is 'preserve'. Known limits: without avoidNodes, routes do not avoid other nodes, so orthogonal routes between distant or overlapping nodes and straight lines may cross boxes; with avoidNodes, orthogonal routes go around boxes but different edges may still share segments or cross each other, and curve and straight edges still ignore boxes. Waypoints are absolute chart coordinates that do not follow moved nodes.

Waypoint and resize handles are focusable buttons. On a waypoint handle the arrow keys move it by 10 chart units (40 with Shift), or to the next snapGrid line (four with Shift); Delete or Backspace removes it and focus returns to the edge. Enter or Space on an add handle inserts a waypoint at that point. A pointer drag of a waypoint, or of an add handle, which inserts a new waypoint there, previews the route and proposes the new list on release; a press without movement on an add handle inserts the waypoint at the handle. On a resize handle the arrow keys move that corner's vertical or horizontal edge by 10 (40 with Shift), or to the next grid line; a pointer drag previews the box with the dragged edges on the grid when snapGrid is set. Resizes keep the opposite corner, minNodeSize and a nonnegative origin. Waypoints are clamped to nonnegative coordinates. Escape, pointer cancellation, a second touch and changes of the source data or layout cancel a drag in flight without a proposal. The new GraphLabels fields collapseGroup, expandGroup, collapsedNode, collapsedNodes, moveWaypoint, addWaypoint, reshapeRejected, resizeNode, topLeft, topRight, bottomLeft, bottomRight and resizeRejected localize the names and announcements.

### Node shapes, edge markers, animated and parallel edges

| API | Behavior |
| --- | --- |
| NetworkNode.shape | `NetworkNodeShape`: 'box' (default) \| 'rounded' \| 'diamond' \| 'ellipse' \| 'hexagon'. box and rounded are the rectangles drawn before (corner radius 8 and 19). diamond, ellipse and hexagon (pointed on the left and right) are drawn inside the node box, 2 units in from its border like the rectangles, as an `ellipse` or `polygon` with the class `vw-node-shape`, and the label and detail are centred (`text-anchor="middle"`, also right-to-left); at the default height of 58 the text keeps its rows, and taller nodes centre it vertically. Text is clipped to the box, not to the shape. The stylesheet paints `.vw-node-shape` with the same tone, hover, focus, selected, related, highlighted, dimmed, dark-theme and forced-colors rules as the node rectangle. Unknown values draw a box, as before. The minimap, the proxies of collapsed groups (rounded), connection handles, resize handles and the focus ring keep the box. |
| GraphEdge.edgeStyle | `GraphEdgeStyle` / undefined. The routing style of this edge, overriding the edgeStyle prop and the `style` option of routeGraphEdges. A curve edge in an orthogonal graph keeps the layout's path; an orthogonal edge in a curve graph gets the component's 6-unit rounded corners. With routingPolicy 'preserve' a valid layout path is kept whatever the edge's style. Drag, resize and waypoint previews route the edge in its own style. An unknown value throws RangeError ("Unknown edge style on graph edge …") while rendering and in routeGraphEdges. |
| GraphEdge.markerEnd / markerStart | `GraphEdgeMarker`: 'arrow' \| 'open-arrow' \| 'circle' \| 'diamond' \| 'bar' \| 'none'. markerEnd defaults to 'arrow' (the filled arrowhead drawn before), markerStart to 'none'. open-arrow is a line arrowhead, circle and diamond are hollow and filled with the stage background (`--vw-surface-muted`, class `vw-edge-marker-hollow`), bar is a line across the edge. A start marker points away from the edge (`orient="auto-start-reverse"`). Markers take the colour of their edge (`context-stroke`), so related, selected and highlighted edges colour them too. The default end arrow keeps the marker element in the stage's defs; every other marker and end is written once, in a defs element before the edges, only while an edge uses it, with an ID derived from the default marker's useId ID (for example `v-0-open-arrow` and `v-0-start-circle`). The markers belong to the default edge renderer: the edge slot draws its own. An unknown value throws RangeError ("Unknown edge marker on graph edge …") while rendering and in renderGraphSvg. |
| GraphEdge.animated | boolean / undefined. Adds `vw-is-animated` to the default edge path: a 6 4 dash pattern that flows from source to target over `--vw-edge-animation-duration` (default 1s). It stays still, still dashed, under `prefers-reduced-motion: reduce` and in print. |
| parallelEdgeSpacing | number / undefined. Opt-in distance in chart units between parallel edges: edges between the same two nodes, in either direction, that have no points and no named ports. They are spread symmetrically around the line between the box centres, in input order, in every edge style: curve and straight edges are drawn through a point beside the middle of that line (a smooth curve, or a polyline with one bend), and orthogonal edges are the same route shifted sideways, closer together when a leg or a node side is too short. Labels follow their edges. Self-loops of one node are nested, each loop starting and ending further out on the side and reaching further away. A single edge, an edge with points or ports, the long-edge bypass lanes that the orthogonal style keeps (the layered layout gives each long edge a lane of its own) and paths kept by routingPolicy 'preserve' are not changed; an edge that gets waypoints leaves its group and the others are spread again, also in the waypoint drag preview. The bend points are not waypoints: they never appear in edge.points or in edge-reshape proposals, and the add-waypoint handles stay between the drawn ends. Must be positive and finite, otherwise rendering throws RangeError. routeGraphEdges takes the same as `parallelSpacing`. |

Every input is opt-in: without these fields and with the defaults written out (shape 'box', markerEnd 'arrow', markerStart 'none', animated false, an edgeStyle equal to the prop, or parallelEdgeSpacing without parallel edges) the server markup, routes, exports and accessible names are unchanged.

Where edges meet shaped nodes: straight edges, and curve or straight edges through waypoints or spread as parallel edges, end where the line from the node centre meets the outline. Orthogonal edges and the layout's own paths attach to the middle of the box sides, which lies on every outline; orthogonal routes through waypoints leave from that middle as well, and the ends of self-loops and of spread orthogonal edges slide along their first leg onto the outline. Named ports, connection handles and edges of moved or resized nodes in the curve style stay on the box sides.

The export (exportSvg, exportPng and renderGraphSvg) draws the same shapes, markers (hollow ones filled with the theme's surfaceMuted, the markers of highlighted edges in the highlight colour) and paths; animated edges are dashed (`stroke-dasharray="6 4"`) without motion.

### NetworkGraph directions and crossing reduction

`NetworkGraph` `options.direction` accepts `LR`, `TB`, `RL` and `BT`. Edge endpoints, edited positions, ports, groups, the minimap and culling follow the chosen direction; unnamed endpoints use the mirrored sides for RL and BT, and the default handle of a node without ports sits on its left edge in RL. `options.crossingReduction` (`none`, `barycenter`, `median`) and `options.crossingSweeps` are passed to `layoutLayeredGraph`; the defaults (`none`, 8) leave the layout identical to earlier versions. When the `layout` prop is set, it replaces the built-in layout and these two options are ignored, while `options.direction` still controls edge routing for moved nodes.

### Label editing, lasso selection and item slots

| API | Behavior |
| --- | --- |
| editableLabels | boolean / false. A double-click on a node or an edge (its hit area or its default label), or F2 on a focused node or edge hit area, opens an in-place text editor over the label. Enter and Space keep selecting a node as before. It also gives every edge the focusable hit area that edgesSelectable uses (named "Select edge" plus the edge label or ID) and lets the default edge labels receive the double-click (root class vw-labels-editable). |
| label-edit(change) | GraphLabelEdit with kind ('node' or 'edge'), id, before (the current label, empty for an edge without one) and after (the text typed, unchanged and untrimmed). Set the node's or edge's label to accept it. Nothing is emitted when the text is unchanged. |
| validateLabelEdit / label-edit-rejected(change, reason) | Synchronous check; true or undefined accepts, false rejects with labels.labelRejected (default "This label change was rejected."), a string rejects with that reason, announced in the polite live region. |
| selectionMode | GraphSelectionMode / 'box'. With boxSelect, 'lasso' turns the Shift-drag into a free-form outline (a vw-lasso-selection polygon) that selects the nodes whose box centre it encloses (graphNodesInPolygon, even-odd rule, the outline counting as inside). Any other value throws RangeError while rendering. |
| node-toolbar slot | HTML in a group (role group, named labels.nodeToolbar plus the node label, default "Node actions Split") anchored above the only selected node: selectedId, or a selectedIds set of one. Receives NetworkNodeToolbarSlot { node, box, scale }. |
| edge-toolbar slot | HTML in a group named labels.edgeToolbar plus the edge label or ID (default "Edge actions 72") anchored above the selected edge's label point, or the middle between its path ends. Receives NetworkEdgeToolbarSlot { edge, point, scale }. The edge is the only member of selectedEdgeIds with edgesSelectable, otherwise the edge last activated through the hit area of reconnectable, editableEdges or editableLabels. |
| group slot | SVG that replaces a group's frame and label, in chart coordinates (not translated). Receives NetworkGroupSlot { group, box, depth }, where box is the frame including the label strip. |
| minimap-node slot | SVG that replaces a node's rectangle in the minimap, in chart coordinates. Receives NetworkMinimapNodeSlot { node, box, selected }. |

Every input is opt-in. Without editableLabels, with selectionMode 'box' and without the four slots, the server markup, keys, events and accessible names are unchanged.

**Label editor.** The editor is an HTML input (class vw-label-editor, `dir="auto"`) after the stage, never rendered on the server or before a user opens it. Its accessible name is labels.editLabel plus the current label, for example "Edit label of Split" or, for an edge without a label, "Edit label of" plus its ID. It covers the node's box at its vertical middle, starting at the text start edge (the right edge in right-to-left graphs), at least 120 pixels wide so it stays usable when zoomed out; an edge's editor (vw-is-edge, `--vw-label-editor-width`, default 140px) is centred on the label point. It follows pan and zoom while open, keeps a fixed 13px text size, and the edited node or edge stays rendered with cullOffscreen. Enter proposes the text and Escape discards it; both return keyboard focus to the node or edge hit area. Leaving the editor (blur, for example a click elsewhere or Tab) also proposes the text, like the GanttChart cell editor. Composition (IME) keys are left to the input. A rejected proposal closes the editor and keeps the label. A change of nodes, edges, positions, sizes or the layout while the editor is open, or turning editableLabels off, closes it without a proposal, and focus returns to the item when the editor had it. The component never changes a label itself. A collapsed group's proxy and an edge merged from several edges have no editor. No editor opens during a pointer gesture or an armed connection.

**Lasso.** The outline is sampled every 3 screen pixels in chart coordinates and closed at the release point. It starts after the 4-pixel drag threshold, follows auto-pan, and reports the same events as a box selection: update:selectedIds with the enclosed nodes (added to the previous selection with Ctrl or Meta) and an empty update:selectedEdgeIds with edgesSelectable; gesture-start and gesture-end report it with kind 'box-select'. Escape, pointer cancellation, a second touch, a context menu or a source change discards it without a selection, and changing selectionMode cancels a drag in flight. Partial overlap does not count: a node is selected only when its centre is inside.

**Toolbars.** The toolbars are HTML after the stage, placed in screen pixels (classes vw-node-toolbar and vw-edge-toolbar), so their text keeps its size at every zoom level. They are centred above the item, `--vw-toolbar-offset` (default 8px) away, and placed below it (vw-is-below) when the item is within 44 pixels of the stage top. They follow pan, zoom and drag previews, and disappear while the item is outside the stage. They render on the server for the selection in the initial fit, like the rest of the graph. Use buttons and other controls inside them; they are in the tab order after the stage.

**Group and minimap slots.** With the group slot, the group element gets vw-has-slot, the stylesheet's frame and label paint no longer applies to the slot content, and a transparent strip over the top 20 units of the frame (class vw-group-handle) takes over the label's role: it carries data-vw-group and, with draggable, the "Move group" button name, drag, arrow keys and activation. Slot content should not take pointer events where the handle should receive them. The minimap-node slot content is drawn inside a vw-minimap-custom group (with vw-is-selected for selected nodes) inside the minimap button, so it must not be interactive; clicks and keys still navigate the minimap.

Slot content (toolbars, group frames, minimap nodes, like the node, edge and tooltip slots) is not part of exportSvg or exportPng, which draw the default rendering. The GraphLabels fields editLabel, labelRejected, nodeToolbar and edgeToolbar localize the names and announcements.

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
| markerRanges | readonly TimelineMarkerRange[] / undefined | Highlighted half-open time ranges: a band across the body or selected rows with a label in the header; see [Marker ranges](#marker-ranges) |
| progressEditable, progressStep, validateProgressEdit | boolean / false, number / 0.05, ProgressEditValidator / undefined | Progress slider proposals; see [Progress editing, deletion, tooltips, context menu and fit](#progress-editing-deletion-tooltips-context-menu-and-fit) |
| deletable, validateBarsDelete | boolean / false, BarsDeleteValidator / undefined | Delete or Backspace proposes removing bars; see the same section |
| tooltipDelay | number / 400 | Hover delay in milliseconds of the opt-in tooltip slot |
| dependencyStyle | DependencyPathStyle / 'orthogonal' | Shape of the dependency connectors: `orthogonal` (right angles), `rounded` (right angles with 6 px rounded corners) or `curve` (a smooth curve). Every style leaves the source and enters the target horizontally. Any other value is reported through validation-error. The export methods draw the same shape |
| stickyBandLabels | boolean / false | While the timeline is scrolled, a `headerBands` interval that starts before the visible part of the axis indents its label (`text-indent`) to the visible start, so the label stays in view until its band ends. The server markup and an unscrolled chart are unchanged |
| contextMenu | boolean / false | Emits context-menu instead of opening the browser menu; see the same section |
| creatable, createDuration, validateCreate | boolean or (row: R) => boolean / false, number / 4 × snap, CreateValidator / undefined | A drag or click on an empty part of a row, or its add button, proposes a new bar; see [Drag to create and cascade previews](#drag-to-create-and-cascade-previews) |
| cascade | TimelineCascade / undefined | Follow-on changes of other bars for a move or resize, previewed during a drag and proposed with it as one batch; see the same section |
| rowsReorderable, validateRowMove | boolean / false, RowMoveValidator / undefined | A move handle on each row heading proposes row hierarchy moves by pointer drag or Alt+arrow keys; see [Row hierarchy moves, status date and progress line](#row-hierarchy-moves-status-date-and-progress-line) |
| statusDate, showProgressLine | number / undefined, boolean / false | Draws a labelled status-date line and, with showProgressLine, a progress line; see the same section |
| constraintsEditable, validateConstraintEdit | boolean / false, ConstraintEditValidator / undefined | Handles at the `constraints` of editable bars propose moves and removals through `constraint-edit`; see [Scheduling constraints](#scheduling-constraints) |
| columnsResizable, labelWidth, minColumnWidth, maxColumnWidth, validateColumnResize | boolean / false, number / undefined (the `--vw-row-label-width` theme value), number / 48, number / 800, ColumnResizeValidator / undefined | Resize separators on the row label column and each extra column propose new widths by pointer drag or arrow keys; see [Column resizing](#column-resizing) |
| highlightedBarIds | ReadonlySet<string> / undefined | Display-only highlight of bars (`vw-is-highlighted`, `--vw-bar-highlight`), separate from `selectedIds`; see [Linked views, reveal and external drops](#linked-views-reveal-and-external-drops) |
| loadSelectable | boolean / false | Makes load segments focusable buttons that report target events; see the same section |
| highlightedLoadTargets, selectedLoadTargets | readonly LoadViewTarget[] / undefined | Display-only highlight (`vw-is-highlighted`) and selected state (`vw-is-selected`) of the load segments that overlap these resource time ranges; see the same section |
| droppable | boolean / false | Accepts HTML drag and drop and emits `bar-drop(TimelineDrop)`; see the same section |
| validateFieldEdit | (change: TimelineFieldEdit<R>) => boolean \| string \| void / undefined | Synchronous check of a typed field proposal from a column with `field`; see [Timeline columns and rollups](#timeline-columns-and-rollups) |

TimelineRow<D> has id, optional parentId, label, optional detail and data (D, default unknown). TimelineBar<D> adds lane (zero-based, default 0), tone, appearance (solid/outline), editable (default false), progress (0–1) and data (D, default unknown), plus baseline and baselines (see [Timeline planning overlays](#timeline-planning-overlays) and [Baseline sets](#baseline-sets)), the optional critical, latestEnd, deadline, segments and description fields described in [Calendar shading, critical path, float and segments](#calendar-shading-critical-path-float-and-segments), constraints, described in [Scheduling constraints](#scheduling-constraints), and deletable (default editable), described in [Progress editing, deletion, tooltips, context menu and fit](#progress-editing-deletion-tooltips-context-menu-and-fit). A zero-duration bar is a milestone, drawn as a diamond. With a `bar` slot, a milestone gets `vw-has-slot` and draws the diamond behind the slot content (a `::before` layer) instead of clipping the button, so the slot can place text or icons beside it; without a slot the diamond is drawn as before. Equal start/end intervals can move; resize handles require duration >= minDuration. Intervals use half-open [start,end) visibility; a milestone exactly at the axis end is outside the displayed window.

Display bars may extend beyond the axis. Editing is enabled only for intervals contained in editBounds. With custom numeric units, supply matching pixelsPerUnit, tickSteps, snap and formatTime.

Dependencies connect explicit endpoints. FS means source finish to target start; SS start to start; FF finish to finish; SF start to finish. These paths visualize relationships. Your application can enforce scheduling constraints in validateEdit or an authoritative backend.

### Editing contract

select(id, detail) reports a bar activated by click or keyboard (Enter/Space). It fires once per click, on release, including after a drag; `detail` (`TimelineSelectDetail`) has `dragged`, true when the click ended a pointer drag of that bar, which proposed a move or resize through `edit` (or was rejected). Use it to keep a message about the edit instead of replacing it with the selection. validation-error(error) fires when rows (including missing parents and hierarchy cycles), bars, dependencies, range, scale, pixelsPerUnit, snap, minDuration, rowHeight, laneCount, tickSteps, nonWorkingPeriods, progressStep, tooltipDelay, createDuration, statusDate, labelWidth, minColumnWidth or maxColumnWidth are invalid, when columns have a missing or duplicate ID or a width that is not finite and positive, when headerBands (or those of the active zoom preset) are not finite, ordered and nonoverlapping within a level, when markers have a missing or duplicate ID or a non-finite time, when markerRanges have a missing or duplicate ID (Error), endpoints that are not finite numbers with start < end (RangeError) or an unknown row in `rowIds` (Error), when `baselineIds` has an empty or duplicate ID or more than three IDs, or when a column uses the reserved ID `timelineLabelColumnId` while `columnsResizable` is set. The chart then renders its empty state instead of the invalid data, and the error is still rethrown inside the component so development builds surface it. A later valid update clears the state. edit(change) reports a proposal with the following shape.

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

Pointer cancellation, loss of capture and Escape discard the preview. Changes to source bars, rows, bounds or the coordinate system cancel an active drag. Every such cancellation of an edit in flight is reported through the additive `edit-cancel(TimelineEditCancel)` event: `reason` is `escape` (Escape, a `cell-editor` cancel, or opening another cell editor), `pointer-cancel` (pointer cancellation or loss of capture, a second touch, a context menu during a gesture), `source-changed` (new source data, bounds, zoom or direction), `hidden` (the gesture's bar or row, or the edited cell's row, is no longer displayed, for example after collapsing) or `api` (the parent called `cancelEdit()`); `barIds` lists the bars of the gesture (empty for a create, row, column or cell edit) and `cell` names the cell of a cancelled `cell-editor`. In-flight edits are pointer gestures, an armed connection and an open `cell-editor`; nothing is emitted when none is in flight, and a gesture that ends with a proposal emits no `edit-cancel`. These props are watched by reference, so pass new arrays and objects instead of mutating them in place. `range`, `editBounds` and `tickSteps` are compared by value: a new but equal object or array, such as an inline literal in a parent template, neither re-runs validation nor cancels a drag. `scale` keeps reference semantics. A drag, connection or other pointer gesture belongs to one pointer; while it is in flight, a press of another pointer (for example a pen next to the mouse) starts nothing. While a drag is held near the horizontal edge of the viewport, the timeline scrolls and the preview follows the pointer (autoScroll). A focused bar stays rendered even when an edit moves it outside the visible window, and after a keyboard edit is applied the chart scrolls horizontally only if the bar's new range is outside the viewport. Selection does not change the source intervals. Arrow keys move focused editable intervals by snap; Shift changes the end; Alt changes the start. Move snapping uses displacement relative to the original interval, so an off-grid start retains its offset.

Slots are legend(), row-heading(), row({row,index}), bar({bar,range,selected}), tick({time,label}), empty(), the opt-in tooltip({bar,range,selected}) and cell-editor (see [Timeline columns and rollups](#timeline-columns-and-rollups)). The bar slot is inside a button. Use noninteractive content inside it. Keep row and bar slot contents within the configured dimensions. Methods are scrollToTime(time), scrollToRow(rowId), cancelEdit(), exportSvg(options), exportPng(options), fitToBars(ids, options) and revealBar(id, options); see [Export to SVG and PNG](#export-to-svg-and-png), [Progress editing, deletion, tooltips, context menu and fit](#progress-editing-deletion-tooltips-context-menu-and-fit) and [Linked views, reveal and external drops](#linked-views-reveal-and-external-drops). cancelEdit() also closes an open `cell-editor` and reports `edit-cancel` with reason `api`.

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
| summaryDependencies | Opt-in, default false. A dependency end may name a summary row instead of a bar, and is drawn to the edge of the row's rollup bar. See [Dependencies on summary rows](#dependencies-on-summary-rows). |
| TimelineColumn.field | Optional `TimelineFieldSpec<R>` (see [Typed fields and timeline views](#typed-fields-and-timeline-views)). An editable column with `field` proposes typed values through `field-edit` only; it never emits `cell-edit`. |
| field-edit(change) | `TimelineFieldEdit<R>`: rowId, columnId, fieldId, before (`field.get(row)`), after (a checked `FieldValue`, never the raw text) and source. A value equal to `before` (`fieldValuesEqual`) proposes nothing. |
| validateFieldEdit / field-edit-rejected(change, reason) | Same accept or reject convention as bar edits; false uses `GanttLabels.rejected`. The reason is announced in the live region. |
| cell-editor slot | Editor of a field cell: `row` (R), `column` (`TimelineColumn<R>`), `field`, `value` (the current raw value), `draft` (the value of the last failed commit, initially `value`), `validation` (`FieldCheck`, `{ ok: true }` until a commit fails), `error` (its message), `source` (how the editor was opened), `commit(value, source?)`, `commitText(text, source?)` and `cancel()`. |

Enter or blur submits a default editor and Escape discards the input. The chart-level readonly prop disables editing. Keep the sticky columns narrow enough to leave room for the timeline.

Which element edits a cell:

| Column | `cell` slot given | No `cell` slot, `cell-editor` slot given | Neither slot |
| --- | --- | --- | --- |
| without `field` | The `cell` slot owns the cell, as before | The built-in text input; `cell-editor` is not used | The built-in text input, emitting `cell-edit` |
| with `field` | The `cell` slot owns the cell (the existing contract wins); `cell-editor` is not used and nothing is emitted for it | A button with the cell value opens `cell-editor`; only `field-edit` is emitted | The built-in text input shows `formatFieldValue(field, field.get(row))` and parses the text with `parseFieldValue`; only `field-edit` is emitted |

Setting `field` therefore moves a column from `cell-edit` to `field-edit`. The field cell button (`vw-field-cell`, named "row label · column label value") opens the editor on click, Enter, Space or F2, and focus moves into the editor's first focusable element. `commit(value)` checks the value with `validateFieldValue` and `validateFieldEdit`; on success it emits `field-edit`, closes the editor and returns focus to the cell button, and on failure it keeps the editor open with `validation` and `error` set and announces the reason. It returns the `FieldCheck`. `commitText(text)` parses the text with the field first. `cancel()` and Escape (unless the slot content already handled it with `preventDefault`) close the editor without a proposal, return focus to the cell and emit `edit-cancel` with reason `escape`. A key that commits or cancels does not also activate the cell button. Focus leaving the editor does not close it. New `rows` or `columns`, `readonly`, a change of the collapsed rows and `cancelEdit()` close an open editor with `edit-cancel` (`source-changed`, `hidden` or `api`); new bars do not. The built-in field input proposes on Enter or change with source `keyboard`; text that cannot be parsed or fails the spec is kept, marked `aria-invalid` and announced, and Escape restores the formatted value. Read-only field cells show `column.value` as plain text, like other cells.

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

`exportSvg`, `exportPng` and `renderTimelineSvg` (option `formatLag`) draw the same label. `ScheduleLink` extends `TimelineDependency`, so in a task chart (one bar per task, bar ID = task ID) the same dependency array can feed the chart and `scheduleTasks`, `propagateEdit` (and therefore a `cascade` callback) and `rescheduleFromStatusDate`, which all apply the lag; `toMsProjectXml` writes it as `LinkLag`. With epoch milliseconds the scheduler requires each lag to be a multiple of its `quantum`. A resource view built with `projectResourceTimeline` is different: its chart links connect bar IDs, so pass the task links to the projection and use its `dependencies` (see [Resource timelines and unplanned tasks](#resource-timelines-and-unplanned-tasks)).

The chart does not edit lags. Change one through your own UI and replace the dependency, for example from the dependency selection or the context menu, whose events carry the dependency ID:

```ts
function editLag(id: string, hours: number) {
  dependencies.value = dependencies.value.map(dep => dep.id === id ? { ...dep, lag: hours * 3_600_000 } : dep)
}
// <GanttChart ... connectable @dependency-select="id => (editing = id)"
//   context-menu @context-menu="menu => menu.target.kind === 'dependency' && (editing = menu.target.id)" />
```

### Dependencies on summary rows

A dependency normally joins two bars. With the opt-in `summaryDependencies` prop, `TimelineDependency.from` or `to` may instead be the ID of a summary row: a row that other rows name as `parentId`. An ID that is also a bar ID always means the bar. No type changes: `scheduleTasks` takes the same links when bar IDs, row IDs and task IDs agree (one bar per task, `rowId: task.id`), so a link to a summary task (see [Summary tasks](scheduling.md#summary-tasks)) feeds both unchanged. Without the prop a summary row end is an unknown endpoint, as before, and server markup, `renderTimelineSvg` output and every other behaviour are unchanged.

| API | Behavior |
| --- | --- |
| summaryDependencies | `boolean`, default false. Validation (`validateTimelineData` with `{ summaryDependencies: true }`) accepts a summary row ID as a dependency end; any other unknown ID still throws `Unknown dependency endpoint`, and a summary still cannot link to itself. |
| Anchor | A summary end is the rollup bar that `showSummaries` draws on the row: its start edge for the S of the type, its finish edge for the F (FS from a summary leaves its finish; FS into it enters its start), at the middle of the row. The rollup is `summarizeTimelineRows` over the descendant bars, so the line follows when they change. During a drag, the rollup bar and its links follow the previewed time ranges of the dragged bars (not a row change, and not `cascade` ghosts, which ordinary links do not follow either). |
| Hidden ends | A summary end is drawn only while its row draws a rollup bar: `showSummaries` is on, the row has descendant bars and has no bar of its own, and the row is displayed. Otherwise the dependency is hidden, like a dependency whose bar is in a collapsed group. A collapsed summary still draws its rollup bar and keeps its links; links to the bars it hides disappear as before. Virtualized rows and the visible time window apply as for other links. |
| Styling and names | Connector styles (`dependencyStyle`), lag labels, `highlightedDependencyIds` (for example a plan's `criticalDependencyIds`), selection and right-to-left mirroring work as for other links. The accessible name uses the row label for the summary end, such as "Select dependency Design → Build phase FS"; selection, `dependency-select`, `dependency-delete` and reconnect handles work as for other links. |
| Editing | With `connectable` (or while reconnecting), each displayed rollup bar gets link handles at its start and finish, named like bar handles with the row label ("Start dependency from finish of Build phase"), and a link dragged onto a rollup bar joins its nearer end. `connect` and `reconnect` then carry the summary row ID. The chart stays controlled and does not check the type: `scheduleTasks` throws for FF and SF links into a summary task, so reject them in `validateConnection`. An armed connection that starts at a rollup bar reports the summary row ID in `edit-cancel` `barIds`. |
| Export | `exportSvg`, `exportPng` and `renderTimelineSvg` (option `summaryDependencies`, with `showSummaries`) draw the same links. |

```ts
const summaries = new Set(rows.flatMap(row => row.parentId === undefined ? [] : [row.parentId]))
function validateConnection(connection: TimelineConnection) {
  if (summaries.has(connection.to) && (connection.type === 'FF' || connection.type === 'SF')) {
    return 'Link to the subtask that should finish instead.'
  }
}
// <GanttChart :rows="rows" :bars="bars" :dependencies="links" show-summaries summary-dependencies connectable
//   :validate-connection="validateConnection" @connect="addLink" />
```

`timelineFromMsProject(project, { summaryDependencies: true })` keeps links that touch a summary task in `dependencies` instead of `hiddenDependencyIds`.

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

Presets apply to the built-in linear scale. A custom scale prop still controls the mapping; only tick steps, header bands and snap come from the preset in that case. Use `calendarBands` from the core entry to build header levels for presets; pass its `timeZone` option to keep them on local midnights and hours across daylight-saving transitions. For ready-made day, week, month and quarter views, see [Calendar zoom presets and locale-aware labels](#calendar-zoom-presets-and-locale-aware-labels).

### Calendar zoom presets and locale-aware labels

Three core helpers save hand-composing calendar views in epoch milliseconds. They use `Intl.DateTimeFormat`, which Node, workers and browsers provide, with cached formatters. They never use the runtime's default locale or time zone (the defaults are `en-US` and UTC), so server and client render the same labels for the same options; the text still depends on the runtime's Intl (ICU) data, which can differ in details such as a comma after a weekday. The component's default `formatTime` (UTC HH:mm) does not change.

| Export | Behavior |
| --- | --- |
| calendarZoomPresets(range, options?) | `CalendarZoomPreset[]`, ready for `zoomPresets`: one complete `TimelineZoomPreset` per level (`id` is the level) with `pixelsPerUnit`, ascending `tickSteps`, `snap` and `headerBands` built with `calendarBands` for `range`, plus a `formatTime` for that level. See below |
| intlTimeFormatter(options?) | A `formatTime`-compatible `(time: number) => string` from `IntlTimeFormatterOptions`: `locale` (string or list, default `en-US`), `timeZone` (IANA, default UTC) or `utcOffsetMinutes` (integer from -1080 to 1080, not both), and `format` (`Intl.DateTimeFormatOptions`, default `{ hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }`, so the defaults give the same `09:00` text as the component default). A `timeZone` inside `format` is ignored. An invalid zone, offset or locale throws RangeError when the formatter is created, and a non-finite time when it is called |
| calendarBands(range, unit, { locale, labelFormat }) | Locale-aware band labels: with `locale` or `labelFormat`, each label is the band start's local date and time (in `timeZone` or `utcOffsetMinutes`) formatted with `Intl.DateTimeFormat`. `labelFormat` defaults by unit: hour `{ hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }`, day and week `{ year: 'numeric', month: 'short', day: 'numeric' }`, month `{ year: 'numeric', month: 'long' }`, year `{ year: 'numeric' }`; `locale` defaults to `en-US`. A `label` function wins over both. Without them, labels stay ISO-like |

`CalendarZoomPresetOptions` are `locale`, `timeZone` or `utcOffsetMinutes` (as for `intlTimeFormatter`), `weekStartsOn` (0 Sunday to 6 Saturday, default 1, for week bands), `levels` (a subset of `CalendarZoomLevel` in the order of the buttons, default all six) and `labels` (button text by level; defaults Hours, Days, Weeks, Months, Quarters, Years). An unknown level throws RangeError and a repeated one Error; an invalid range, zone or offset throws RangeError.

| Level | pixelsPerUnit | tickSteps | snap | headerBands | formatTime |
| --- | --- | --- | --- | --- | --- |
| hours | 60 px per hour | 15 min to 12 h | 15 min | days (`Sun, Mar 1, 2026`) | `09:00` |
| days | 80 px per day | 1, 2, 7 days | 1 h | months (`March 2026`) | `Sun, Mar 1` |
| weeks | 16 px per day | 7, 14, 28 days | 1 day | months, weeks (`Mar 2`) | `Mar 1` |
| months | 4 px per day | 7 to 56 days | 1 day | years, months (`Mar`) | `Mar 1` |
| quarters | 1.5 px per day | 28, 56, 91 days | 1 day | years, quarters (`Q1`) | `Mar 1` |
| years | 0.4 px per day | 91, 182, 364 days | 1 day | years | `Mar 1, 2026` |

The examples are `en-US`. The date `formatTime` of the day and coarser levels appends the local time when an instant is not local midnight (`Mar 1 13:30`), so bar names stay exact. GanttChart does not read `formatTime` from a preset: pass the active preset's `formatTime` as the chart's `formatTime`. Header bands follow local dates in the zone, so a month band across a daylight-saving change starts and ends at local midnight. Ticks stay uniform elapsed-time steps counted from `range.start`, as the chart draws them: start the range on a band boundary (a local midnight or week start) to align them, and expect a daily tick to sit an hour off local midnight after a daylight-saving change, where its label shows the time. The presets cover `range` only; build new ones when it changes.

```vue
<script setup lang="ts">
import { computed, ref } from 'vue'
import { GanttChart, calendarZoomPresets } from 'vue-weave'

const range = { start: Date.parse('2026-04-06T00:00:00+02:00'), end: Date.parse('2026-08-31T00:00:00+02:00') }
const presets = calendarZoomPresets(range, { locale: 'de-DE', timeZone: 'Europe/Berlin', levels: ['days', 'weeks', 'months'] })
const level = ref('weeks')
const active = computed(() => presets.find(preset => preset.id === level.value)!)
</script>

<template>
  <GanttChart :rows="rows" :bars="bars" :range="range" :zoom-presets="presets" :zoom-preset="level"
    :format-time="active.formatTime" @update:zoom-preset="level = $event" />
</template>
```

### Marker ranges

`markerRanges` highlights half-open intervals `[start, end)` such as a code freeze, holidays or an office closure. It is opt-in: without it (or with an empty array) the chart renders exactly the markup it did before. Point markers (`markers`) are unchanged; a marker range is a separate `TimelineMarkerRange` with `id`, `start`, `end`, `label`, optional `tone` and optional `rowIds`.

| Field | Behavior |
| --- | --- |
| id | Unique among the marker ranges. Missing or duplicate: Error through validation-error |
| start, end | Finite numbers in the units of `range`, with `start < end`; otherwise RangeError through validation-error. A zero-width range is rejected: use a `TimelineMarker` for a point in time |
| label | Text of the header label and the start of its accessible name |
| tone | `ChartTone` (teal, blue, amber, violet): the band and label use the tone's pale, line and ink colours. Without it they use `--vw-range`, `--vw-range-line` and `--vw-range-ink` |
| rowIds | Restricts the band to these rows (each must be a row ID; unknown IDs are an Error through validation-error). Rows hidden by a collapsed parent, and rows outside the virtual row window, draw no band; the header label is always drawn. Without it the band covers the full body height, including load rows |

Each range draws a band (`vw-gantt-range`, plus `vw-is-row` for a row band and `vw-tone-<tone> vw-has-tone` with a tone) below the bars, markers and the now line, at `--vw-range-opacity` (default 0.7), and a 13 px label strip at the bottom of the time header (`vw-gantt-range-label`), above the tick lines. Only the part inside `range` and the visible time window is rendered, so ranges are virtualized with the other items. The band is decorative (`aria-hidden`); the label has `role="img"` and the accessible name and title `<label> <formatTime(start)>–<formatTime(end)>`, like the status-date marker, from the unclipped endpoints. Positions are measured from the inline-start edge, so ranges are mirrored in right-to-left charts. Ranges may overlap; later ones are drawn on top. `exportSvg`, `exportPng` and `renderTimelineSvg` (`markerRanges` option) draw the same bands and labels with `<title>` elements, and printing keeps them.

### Resource load histogram

| API | Behavior |
| --- | --- |
| loadRows | TimelineLoadRow[] with unique id, label and optional detail. Each row is drawn below the task rows on the same time axis, scroll surface and horizontal virtualization. |
| loadSegments | TimelineLoadSegment[]: resourceId, start, end, load, capacity, optional overload and taskIds. The output of calculateResourceLoad can be passed directly. Segments must reference a load row and must not overlap within a resource. |
| loadRowHeight | number / 44. At least 16. |
| load-row slot | Customize the label using row and peak. |
| load-segment slot | Customize a segment using segment, row, peak and overload. The slot content is inside an element with role img and an accessible label. |

Each segment is scaled to the row's peak load or capacity. The default rendering fills load up to capacity, highlights the overloaded part and draws a dashed capacity line. Segments carry an accessible label such as "CNC cell 09:00–10:00: load 2 / capacity 1, overloaded by 1", built from formatTime and the GanttLabels fields load, capacity and overload; the load row group is named with loadRegion. Invalid load data is reported through validation-error. With `loadSelectable`, each segment is a focusable element with role button (class `vw-is-selectable`) and the same accessible name, and `highlightedLoadTargets` and `selectedLoadTargets` mark segments by time range; see [Linked views, reveal and external drops](#linked-views-reveal-and-external-drops).

### Linked views, reveal and external drops

These additions connect the chart to other views (for example through `useLinkedSelection`) and to external lists. All are opt-in; without them the markup, accessible names and events are unchanged.

| API | Behavior |
| --- | --- |
| highlightedBarIds | Bars drawn with `vw-is-highlighted` (an outline in `--vw-bar-highlight`). Display only: they are not part of the selection, so Delete and multiple-selection moves never include them, they do not mark dependencies (use `highlightedDependencyIds`) and a change does not cancel a gesture. Like other bars, a highlighted bar outside the visible window is not rendered; use `revealBar` to move to it. `exportSvg` and `exportPng` pass the set to `renderTimelineSvg`. |
| target-enter(event), target-leave(event), target-activate(event) | `ViewTargetEvent` `{ target, source }`, with `target` a `ViewTarget` and `source` `'pointer'` or `'keyboard'`. Bars report `{ view: 'timeline', kind: 'bar', id }`: enter and leave on pointer hover and on visible keyboard focus and blur, activate on click, Enter or Space (not after a drag), next to the existing `select`. Dependencies report `kind: 'dependency'` in the same way where they are focusable (`connectable` or `reconnectable`). Rows report `kind: 'row'`: enter and leave on hover of the row and on visible focus of controls in its heading, activate on a click of the heading text. With `loadSelectable`, load segments report `{ view: 'load', resourceId, start, end }` on hover, focus, click, Enter and Space. Hover never scrolls. The existing payload unions such as `TimelineContextTarget` are unchanged. |
| loadSelectable | boolean / false. Segments become focusable (`tabindex="0"`, role button) with an outline in `--vw-load-focus` on focus. Segments outside the virtualized window are not rendered; resolve a stored load target against the current segments with `resolveLoadTargets`. |
| highlightedLoadTargets / selectedLoadTargets | `readonly LoadViewTarget[]` / undefined. Load segments have no ID and their boundaries move when load is recalculated, so these props take resource time ranges (`{ view: 'load', resourceId, start, end }`, for example `useLinkedSelection().load.value.highlighted` and `.selected`) and mark every current segment of that resource whose half-open range overlaps one (the rule of `resolveLoadTargets`). Matching segments get `vw-is-highlighted` (an inset ring in `--vw-load-highlight`) or `vw-is-selected` (`--vw-load-selected`); with `loadSelectable` and `selectedLoadTargets` set, segment buttons also carry `aria-pressed`. Display only: the chart never changes them, they work with or without `loadSelectable`, and the accessible names stay the same. A target that is not a valid load target throws like `resolveLoadTargets`. |
| revealBar(id, options?) | Exposed method returning `Promise<RevealResult>`. An unknown ID resolves `{ status: 'unknown' }` and a bar whose row is hidden by a collapsed ancestor resolves `{ status: 'hidden-by-collapse', proxyId }` with the nearest displayed ancestor row; neither throws or scrolls. Otherwise the chart scrolls the bar's row and interval into view, waits for the next render (`nextTick`) so the virtualized bar exists, then moves DOM focus to it when `options.focus` is true, and resolves `{ status: 'revealed' }`. Expanding collapsed rows is the parent's decision: update `collapsedIds`, then call `revealBar` again, or use `revealLinkedTarget` (see [Linked views](#linked-views)). After an accepted row change that gives a bar a new ID (for example a resource projection), call `revealBar(newId, { focus: true })`. |
| droppable / bar-drop(event) | With `droppable`, the chart accepts HTML drag and drop (it calls `preventDefault` on `dragenter`, `dragover` and `drop`) and emits `TimelineDrop` with `time` (snapped to the active `snap` and kept inside `range`), `rowId` (the displayed task row under the point; absent over the header and load rows), `clientX`, `clientY` and `dataTransfer`. The chart neither reads the data nor adds anything: the parent resolves what was dropped, for example from an ID in the data, and proposes it. `TimelineDrop` is exported from the Vue entry only. |

`RevealOptions` also has `scale`, which only graph reveals use. `ViewTargetEvent`, `RevealStatus`, `RevealOptions` and `RevealResult` are exported from both entries.

### Calendar shading, critical path, float and segments

All of these are opt-in. Without `nonWorkingPeriods` and the new bar fields, the chart renders no new elements, classes or attributes, and accessible names and descriptions are unchanged.

| API | Behavior |
| --- | --- |
| nonWorkingPeriods | Half-open intervals drawn as background bands (`vw-gantt-non-working`, colour `--vw-non-working`) over the full body height, task rows and load rows, behind grid lines and bars. Only the parts inside `range` and the visible time window are rendered. Intervals may overlap and need not be sorted. A non-finite endpoint or `start >= end` is reported through validation-error. The bands are decorative (`aria-hidden`). `invertWorkPeriods` turns work periods into these intervals. |
| TimelineBar.critical | `true` adds the `vw-critical` class and an outline in `--vw-critical`. |
| TimelineBar.description | Extra text about the bar for screen readers and the native tooltip, for example "Manually scheduled" or "Inactive". It comes first in the bar's accessible description (a trailing full stop is dropped, as the parts are joined with ". "), before the critical, float, deadline, constraint and baseline facts, and after the dates in the bar's `title`; `exportSvg` and `renderTimelineSvg` add it to the bar's `<title>`. The accessible name is unchanged. Must be a string (Error otherwise); blank text is ignored. |
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
| tooltip slot | `{ bar, range, selected }`, where `range` is the displayed interval (the preview while one is shown). Rendered only when the slot is provided, never on the server or before mounting. While the slot is provided, bars omit their native `title`, so the browser does not show a second tooltip; the accessible name and description are unchanged. |
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

`exportSvg`, `exportPng` and `renderTimelineSvg` draw the same glyphs with the colours of `--vw-constraint` and `--vw-constraint-violated`, each in a `<g>` with the same classes and a `<title>` such as "Finish no later than · Pack order A 09 Nov 17:00 · violated" (options `constraintLabels` and `constraintViolatedLabel`; the component passes its labels). `toMsProjectXml` writes a task's single constraint (or the finish pair at one time as Must Finish On); see [Interchange exports](#interchange-exports). To schedule with the constraints, spread them into the tasks and pass the results back with `scheduledBarFields`; see [Scheduling constraints from the chart](scheduling.md#scheduling-constraints-from-the-chart).

### Timeline editing helpers

| Export | Purpose |
| --- | --- |
| removeTimelineBars(bars, dependencies, ids) | New `{ bars, dependencies }` arrays without the given bars and without every dependency whose `from` or `to` is one of them. Accepts any iterable of IDs and keeps the remaining items and their order. An unknown ID throws an Error |
| assignLanes(bars, options?) | `AssignLanesResult`: `{ bars, laneCount, rowLaneCounts }` with new bar objects in input order, each with `lane` set so that the bars of one row never overlap within a lane. See below |
| dependencyTypeForEnds(fromEnd, toEnd) | Dependency type for a source and target TimelineBarEnd (start or finish) |
| dependencyEndsForType(type = FS) | The bar ends a dependency type joins |
| moveTimeRanges(ranges, delta, snap, bounds) | Move intervals by one snapped displacement, clamped so every interval stays in bounds. A fractional snap is applied in exact decimal arithmetic, like `editTimeRange` |
| calendarBands(range, unit, options) | One header band level of hours, days, weeks, months or years in epoch milliseconds, aligned to a fixed UTC offset or to local time in an IANA time zone and clipped to the range. `locale` and `labelFormat` give locale-aware labels; see [Calendar zoom presets and locale-aware labels](#calendar-zoom-presets-and-locale-aware-labels) |
| calendarZoomPresets(range, options?) | Ready-made hour, day, week, month, quarter and year `zoomPresets` with header bands, ticks, snap and a matching `formatTime`; see [Calendar zoom presets and locale-aware labels](#calendar-zoom-presets-and-locale-aware-labels) |
| intlTimeFormatter(options?) | A cached, deterministic `Intl.DateTimeFormat`-based `formatTime` for a locale and time zone; see the same section |
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

`calendarBands` options are utcOffsetMinutes (integer from -1080 to 1080, the same limit as `buildWorkPeriods` and `toMsProjectXml`; default 0; daylight-saving transitions are not applied), timeZone (an IANA zone such as `Europe/Berlin`, described below; cannot be combined with utcOffsetMinutes), step (units per band, default 1; a divisor of 24 for hours; multi-unit days, weeks and months follow a fixed grid counted from 1970-01-01 in the offset or zone, and years from year 0, so overlapping ranges share boundaries), weekStartsOn (0 Sunday to 6 Saturday, default 1), locale and labelFormat (locale-aware labels, see [Calendar zoom presets and locale-aware labels](#calendar-zoom-presets-and-locale-aware-labels)) and label(start, end, local), which receives the unclipped band and the `CalendarBandLocalTime` of its start: `year`, `month` (1 to 12), `day`, `hour`, `minute`, `weekday` (0 Sunday to 6 Saturday), `utcOffsetMinutes` in effect at the start, and `timeZone` (undefined for a fixed offset). Default labels are HH:mm, YYYY-MM-DD (days and week starts), YYYY-MM and YYYY in local time. Results are capped at 10,000 bands.

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
| createWorkingTimeScale(range, periods, pixelsPerUnit, nonWorkingRatio = 0.1) | Piecewise-linear invertible `TimeScale` for the `scale` prop: working `periods` (half-open, as `buildWorkPeriods` returns them) get `pixelsPerUnit` per unit, other time `pixelsPerUnit × nonWorkingRatio`. Periods are clipped, sorted and united, so they may be unsorted or overlapping; those outside the range are ignored; no working period gives a uniform `pixelsPerUnit × nonWorkingRatio` scale. `nonWorkingRatio` must be in `(0, 1]` (1 is linear); 0 is rejected because a zero-width interval cannot be inverted. Outside the range the scale extrapolates with the slope of the edge segment. `toX` and `toTime` binary-search precomputed breakpoints (O(log n)) and are exact at segment boundaries. Throws `RangeError` for a non-finite or inverted range, a non-positive or non-finite `pixelsPerUnit`, a ratio outside `(0, 1]`, invalid periods or a width that overflows. `defaultNonWorkingRatio` is 0.1 |
| timeTicks(window, step, anchor = 0) | Stable tick sequence `anchor + k × step` inside the closed window; capped at 10,000 entries. A window so far from the anchor that the tick index is not finite throws RangeError. With a fractional step, ticks are exact decimals (0.1, 0.2, 0.3, not 0.30000000000000004) when the step and anchor have at most 15 decimal places; integer steps use plain arithmetic |
| visibleRows(scrollTop, bodyHeight, rowHeight, count, overscan = 2) | First index and exclusive end index |
| intersectsWindow(interval, window) | Half-open overlap; a point milestone counts when it lies in the closed window, including at either edge |
| editTimeRange(interval, mode, delta, snap, bounds, minDuration = snap) | Immutable snapped proposal. With a fractional snap, the result is computed in exact decimal arithmetic when the snap, interval, bounds and minDuration have at most 15 decimal places (moving 0 by 3 × 0.1 gives 0.3); otherwise, and for integer snaps, plain floating-point arithmetic is used |
| dependencyTimes(source, target, type = FS) | Endpoint times for dependency routing |
| dependencyPath(x1, y1, x2, y2, style?) | SVG path of a dependency connector. `style` (`DependencyPathStyle`) is `orthogonal` (default, unchanged output), `rounded` or `curve`; any other value throws RangeError |
| timelineBaselineId, timelineBaselineLimit | `'$baseline'`, the baseline set ID of `TimelineBar.baseline`, and 3, the most baseline sets drawn at once; see [Baseline sets](#baseline-sets) |
| timelineBaseline(bar, id) | A bar's interval in baseline set `id`: `bar.baseline` for `timelineBaselineId`, otherwise its `baselines` entry, or undefined |
| timelineBaselineIds(bars) | Every baseline set ID in the bars: `timelineBaselineId` first when any bar has a `baseline`, then the `baselines` IDs in order of first appearance |
| baselineVariance(bar, baseline) | `TimelineBaselineVariance` `{ start, end, duration }`: the bar's start and end minus the baseline's and its length minus the baseline's, so positive values are later or longer. Never -0. Throws RangeError for non-finite times |
| formatDependencyLag(lag) | Default text of a dependency lag: signed hours of milliseconds rounded to two decimals, such as `+2 h` or `−1.5 h` (U+2212). Throws RangeError for a non-finite lag |
| validateTimelineData(rows, bars, dependencies = [], laneCount = 1, options = {}) | Validate references, lanes, durations, progress, baselines and named baseline sets (see [Baseline sets](#baseline-sets)) and dependency lags (a lag that is not a finite number throws RangeError). With `TimelineDataOptions.summaryDependencies`, a dependency end may also be a summary row ID (see [Dependencies on summary rows](#dependencies-on-summary-rows)). IDs must be unique within each collection; a row and a bar may share an ID. A dependency from a bar to itself throws an Error that names the dependency and the bar, so GanttChart reports it through `validation-error` and renders its empty state, and `renderTimelineSvg` throws it. `scheduleTasks` takes its own links and reports a self-link as a `cycle` failure instead |
| createTimelineRowTree(rows) | Validate row parents and cycles; produce stable preorder entries whose `row` keeps the type of the input rows |
| summarizeTimelineRows(tree, bars) | Roll up leaf-row intervals and progress into a summary Map |
| normalizeWorkPeriods(periods, range) | Clip, sort and merge overlapping or touching work periods |
| invertWorkPeriods(periods, range) | Sorted half-open gaps between the clipped, sorted and merged work periods inside the range, for `nonWorkingPeriods`. Endpoints only need to be finite, so fractional units work; each period and the range must have positive length, otherwise RangeError |
| buildWorkPeriods(range, week) | Expand weekly shifts and date overrides into epoch-millisecond work periods. `utcOffsetMinutes` is an integer from -1080 to 1080 |
| scheduleTasks(input) | Calculate calendar-aware earliest/latest dates, float and critical links |
| scheduledBarFields(task) | `ScheduledBarFields` for a TimelineBar from a scheduled task: start, end, critical, latestEnd and, only for work in more than one segment, segments. Returns new objects |
| propagateEdit(input, edit) | Reschedule with one task pinned at a new start (and optionally a new end) and list every task whose dates change, including summary tasks whose rolled-up dates follow: a `PropagateEditResult`. Editing a summary task throws an Error; see [Propagate an edit](scheduling.md#propagate-an-edit) |
| rescheduleFromStatusDate(input, statusDate, progress) | Reschedule a plan at a status date from reported progress: done tasks keep their dates, partly done tasks keep their done work and continue at or after the status date, and unstarted tasks start no earlier than it. FS and SS links into started tasks and every link into done tasks no longer apply; FF and SF links into partly done tasks still bound their finish and can delay the remaining work. Returns a `ScheduleResult`; see [Reschedule from a status date](scheduling.md#reschedule-from-a-status-date) |
| rescheduleFromActuals(input, statusDate, actuals) | Reschedule a plan from recorded actual intervals (`ReadonlyMap<string, TaskActuals>`): the actuals are kept exactly as recorded and only the remaining work is scheduled from the status date. Returns a `RescheduleFromActualsResult` with the forecast `schedule`, the original `plan`, per-task `ActualsTask` entries and `diagnostics`; see [Recorded actuals](#recorded-actuals) and [Reschedule from recorded actuals](scheduling.md#reschedule-from-recorded-actuals) |
| actualsTimelineBars(result, options?) | GanttChart bars for a `rescheduleFromActuals` result: a solid actual bar and an outline forecast bar per task, with the plan as a baseline; see [Recorded actuals](#recorded-actuals) |
| scheduleToGraph(result, dependencies, options?) | A PERT network diagram for NetworkGraph from a successful schedule; see [Network diagram from a schedule](#network-diagram-from-a-schedule) |
| toMsProjectXml(project, options?), toICalendar(events, options?), toCsv(table) | Interchange documents as strings; see [Interchange exports](#interchange-exports) |
| parseCsv(text, options?), timelineFromCsvTable(table, options) | CSV import: records of strings, then `{ rows, bars }`; see [Interchange exports](#interchange-exports) |
| fromMsProjectXml(xml, options?), timelineFromMsProject(project, options?) | Microsoft Project XML import: an `MsProjectImport` with tasks, links, calendars, resources, assignments and warnings, then GanttChart rows, bars and links; see [Microsoft Project import](#microsoft-project-import) |
| workCalendarsFromMsProject(project, range), resourceLoadFromMsProject(project, options?) | Imported calendars as `WorkCalendar[]`, and imported resources and assignments as the shapes of `calculateResourceLoad`, `levelResources` and `projectResourceTimeline`; see [Microsoft Project import](#microsoft-project-import) |
| fromICalendar(text, options?), timelineFromICalendar(events) | iCalendar import: an `ICalendarImport` with events and warnings, then GanttChart rows and bars; see [iCalendar import](#icalendar-import) |
| calculateResourceLoad(range, tasks, resources, assignments, options?) | Compare scheduled work with capacity over half-open intervals. Segments with the same tasks may share one `taskIds` array. `options.inactiveTaskIds` ignores the assignments of inactive tasks |
| levelResources(input) | Delay tasks with a deterministic priority heuristic so that assigned load stays within capacity |
| graphDeletion(nodes, edges, nodeIds, edgeIds = []) | Normalized GraphDeletion: validates the graph, throws Error for unknown IDs, adds every edge incident to a deleted node and returns both lists deduplicated in input order |
| removeGraphElements(nodes, edges, deletion) | New node and edge arrays without the deleted elements and the edges incident to deleted nodes; unknown IDs throw Error and inputs are not modified |
| cloneGraphElements(nodes, edges, nodeIds, options) | `GraphCloneResult` with shallow copies of the listed nodes and of every edge between two of them, in input order, with IDs from `options.createId(id, kind)` (`kind` is `node` or `edge`) and edges pointing at the copied nodes; ports, data and other fields are kept. `options.positions` entries of the source nodes are moved by `options.offset` (default 0, 0) and returned under the new IDs in `positions`, and the waypoints (`points`) of copied edges are moved by the same offset; `idMap.nodes` and `idMap.edges` map source IDs to new IDs. Duplicate requested IDs are ignored. Throws Error for an invalid graph, an unknown node ID or a new ID that is empty, repeated or already used in the input, and RangeError for a non-finite offset, position or waypoint. Keep the returned positions nonnegative before saving them |
| createGraphConnectionChecker(nodes, edges, rules) | `GraphConnectionChecker` with `check(connection, replacingEdgeId?)` and `targets(origin, replacingEdgeId?)`, built once: validates the graph like `indexGraph`, validates the rules and counts the edge ends per endpoint, so each answer takes constant time per endpoint. Throws Error for rules that name an unknown node or port, a `type` that is not a nonempty string or list of them or an unknown `direction`, and RangeError for a negative, fractional or non-finite `maxConnections`; see [Port rules and valid-target hints](#port-rules-and-valid-target-hints) |
| checkGraphConnection(nodes, edges, rules, connection, replacingEdgeId?) | `GraphConnectionCheck`: `{ ok: true }` or a `GraphConnectionRejection` with `code` (`GraphConnectionRejectionCode`: `unknown-node`, `unknown-port`, `direction`, `type-mismatch` or `limit-reached`, checked in that order), a readable `reason` naming node labels and port labels ("Average · Input A already has its maximum of 1 connection."), and the `end`, `node` and `port` that broke the rule. `replacingEdgeId` leaves that edge out of the counts; an unknown one throws Error. Synchronous, so it can run inside `validateConnection` |
| graphConnectionTargets(nodes, edges, rules, origin, replacingEdgeId?) | `GraphConnectionTargets` `{ nodeIds, ports }` for a connection in progress from `origin` (`GraphConnectionOrigin`: `node`, optional `port`, and `end`, the end the candidates take, `to` by default): every port (`ports.get(nodeId)`) and every node without ports (`nodeIds`) that `checkGraphConnection` would accept; `nodeIds` also lists nodes with a valid port. One loop over the nodes after one pass over the edges. An unknown origin has no targets |
| graphConnectionViolations(nodes, edges, rules) | `GraphConnectionViolation[]` (`edgeId`, `code`, `reason`, `end`, `node`, `port`) auditing existing edges in input order with the same rules: direction and type per edge, and for a limit every edge end past it (the first `maxConnections` ends are kept). An edge can appear more than once |
| graphConnectionValidator(nodes, edges, rules, validate?) | A `validateConnection` function: returns the rule's reason for a broken rule without calling `validate`, otherwise the result of `validate` (or true) |
| graphAlignmentGuides(moving, others, threshold) | `GraphAlignment` `{ dx, dy, guides }` that aligns a `GraphRect` with the nearest left, centre or right (x) and top, middle or bottom (y) anchor of `others` within `threshold` chart units (inclusive), 0 on an axis without a match. Ties go to the earlier rectangle in `others`, then to the start, centre and end anchors of `moving`, then to those of the other rectangle. `guides` (`GraphAlignmentGuide`: `axis`, `position`, `from`, `to`) are the aligned lines of the shifted rectangle, x guides first, each sorted by position and spanning every rectangle aligned there. Throws RangeError for a negative or non-finite threshold and invalid rectangles. Iterative and deterministic |
| collapseGraphGroups(nodes, edges, groups, collapsedIds, options) | `GraphCollapseResult` for the collapsed groups: visible `nodes` with one proxy per outermost collapsed group (ID and label of the group, detail from `options.detail`, default "N nodes", rounded shape, `data` of type `GraphCollapsedNodeData`), `edges` re-attached to proxies (ports on proxy ends and waypoints dropped, internal edges removed, parallel edges merged per source, source port, target and target port under the first ID; a merged edge keeps `label`, `edgeStyle`, `markerStart`, `markerEnd` and `animated` only when every merged edge has the same value for it, and drops `data` and `points`), the remaining `groups` (a collapsed child becomes a member of its parent), `proxies` (`GraphCollapsedGroup` with every hidden node ID), `owners` (hidden node to proxy), `mergedEdges` (re-attached edge ID to original IDs) and `hiddenEdgeIds`. Throws Error for invalid groups like NetworkGraph (including an unknown parent anywhere up a parent chain and a parent cycle), an unknown collapsed ID or a group ID that is also a visible node ID. Inputs are not modified; untouched nodes and edges are returned as is. `GraphCollapsedNode` is the type of a proxy node, `NetworkNode<GraphCollapsedNodeData>` |
| routeGraphEdges(layout, edges, nodes, options) | Reroutes a finished layout in `GraphEdgeRouteOptions.style` (`curve`, `orthogonal` or `straight`, default `curve`; an edge's own `edgeStyle` overrides it) for a `direction` (default LR) with an orthogonal `cornerRadius` (default 0), and draws edges with `points` through their waypoints; see [Group collapse, edge styles and waypoints](#group-collapse-edge-styles-and-waypoints-level-of-detail-and-node-resizing). The opt-in `avoidNodes` (`true` or a `GraphObstacleAvoidance`) routes orthogonal edges without waypoints around every box of the layout with findOrthogonalRoute and keeps the plain orthogonal route for an edge without such a route (see the avoidNodes prop). The opt-in `parallelSpacing` spreads parallel edges and nests self-loops, and straight edges end on the outline of diamond, ellipse and hexagon nodes in `nodes`; see [Node shapes, edge markers, animated and parallel edges](#node-shapes-edge-markers-animated-and-parallel-edges). Returns the input layout for `curve` without waypoints, edge styles of their own or spread parallel edges. Throws Error for an unknown endpoint or a named port whose side is not left, right, top or bottom, and RangeError for an unknown style (of the options or an edge) or direction, a bad radius, a parallel spacing that is not positive and finite, a bad `avoidNodes` value or a non-finite waypoint. Orthogonal detours stay at or above 0 in a layout at nonnegative coordinates and keep their full 16-unit stub when an end lies at a negative coordinate |
| findOrthogonalRoute(from, to, obstacles, options = {}) | `GraphPoint[]` \| undefined. An axis-aligned route from `from` to `to` (each a `GraphRouteEnd`: a point and the `side` of its node it leaves or enters through) that keeps `GraphObstacleAvoidance.clearance` (default 8) away from every `GraphRect` in `obstacles` and leaves and enters perpendicular to the sides; include the two end nodes' boxes, otherwise the route may run through them. It minimises length plus `bendPenalty` (default 24) per bend, and the same input in any obstacle order gives the same route. Returns undefined when an end is boxed in or the bounded search gives up. When every input lies at nonnegative coordinates, so does the route. It searches a sparse grid, not a pixel grid: lines halfway between neighbouring obstacle edges (the middle of each free channel) and through both ends. Obstacles go into a bucket grid in O(n); the search starts in a region around the ends and grows it fourfold up to the whole area, each round taking O(k log k) for the k obstacle edges in the region plus A* over at most 4·lx·ly states for lx by ly lines, capped at 200,000 expanded states. routeGraphEdges with `avoidNodes` builds the bucket grid once per call; routing every edge of a 3,000-node layered graph takes a few hundred milliseconds in Node. Throws RangeError for a non-finite end, an unknown side, an obstacle with non-finite coordinates or a negative size, and a negative or non-finite clearance or bend penalty |
| graphPolylinePath(points, cornerRadius = 0) / graphSmoothPath(points) | SVG path data of a polyline with optionally rounded corners, and of a smooth Catmull-Rom curve through the points, for custom edge renderers. Throws RangeError for a point with a non-finite coordinate |
| applyGraphSizes(layout, edges, sizes, direction = LR) | Overlay `GraphNodeSize` widths and heights on the layout boxes (top-left corners kept), grow the bounds and reroute incident edges like `applyGraphPositions`. RangeError for sizes that are not finite and positive, also under unknown IDs, which are otherwise ignored; Error naming the edge and node when an incident edge references a node without a box; returns the input layout when nothing changes |
| snapGraphPoint(point, grid) | The point with both coordinates rounded to the nearest multiple of a positive finite `grid` (RangeError otherwise, and for non-finite coordinates); never returns -0 |

All exported interfaces and component props are included in the declaration files. Validation functions reject invalid references and numeric geometry with descriptive errors. Scheduling failures such as cycles and infeasible plans are returned as results; malformed scheduling inputs throw. Routing helpers assume validated graph data as described below.

### Graph routing

`graphPortAnchor(box, port)` returns a `GraphPoint` on the named side of a `GraphBox`. Coordinates are world-coordinate pixels. `port.offset` defaults to 0.5 and measures down a vertical side or across a horizontal side. Supply finite box geometry and a port offset in [0, 1]; the helper does not validate them. A `port.side` other than left, right, top or bottom throws an Error naming the port.

`graphEdgeEndpoint(layout, nodes, edge, end, direction)` returns `{ x, y, side }`. `nodes` is a node-ID-keyed map, `end` is `from` or `to`, and `direction` is a `GraphLayoutDirection`. Named ports take precedence. Otherwise, when `edge` has an `id` with a path in `layout.paths`, the result is the drawn first or last point of that path, and `side` is the box side closest to it. This matches the rendered edge after saved positions reverse two nodes and for custom layouts that choose their own sides. Without a path, LR uses right/left and TB uses bottom/top for source/target endpoints. Validate nodes and edges with `indexGraph` and supply matching layout boxes before calling this helper; an endpoint without a layout box throws an Error naming the edge and the node, and a named port whose side is not left, right, top or bottom throws an Error naming the node and the port. `routeGraphPorts` throws the same errors.

`graphPathEndpoints(path)` returns `{ start, end }`: the first moveto point and the current point after the last segment (the subpath start after `Z`), or `undefined` for a path without coordinates. It throws like `graphPathBounds` for malformed path data.

NetworkGraph applies `applyGraphPositions`, then `applyGraphSizes`, then `routeGraphPorts` and finally `routeGraphEdges` for its `edgeStyle`. `applyGraphPositions` overlays finite, nonnegative coordinates, expands the layout bounds when needed and reroutes incident edges while preserving other paths. Position entries for unknown node IDs are ignored, but their coordinates are still validated (RangeError), and an incident edge whose other end has no layout box throws an Error naming the edge and the node. `routeGraphPorts` then replaces paths and label positions for edges with named ports, leaving unnamed-edge routes intact; with the `routingPolicy` prop `'preserve'` both routing steps run with `policy: 'preserve'` and keep the layout's valid paths, also for edges with named ports. These operations do not mutate the supplied layout and may return it unchanged when there is nothing to update.

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

`layoutCircularGraph(nodes, edges, options)`, `layoutGridGraph(nodes, edges, options)` and `layoutConcentricGraph(nodes, edges, options)` are three more built-in `GraphLayout` producers for the `layout` prop, for example `(n, e) => layoutGridGraph(n, e, { columns: 4 })`. Edges are straight lines between box borders (so in a grid they can pass over other boxes) and self-loops are small curves on the right side of the node. Cycles, disconnected nodes, parallel edges and self-loops do not throw; duplicate node IDs and edges that reference unknown nodes throw an `Error`, invalid numbers throw `RangeError`. All three are deterministic, never mutate their input, are iterative, and take O(n + e) (concentric adds a sort of the distinct levels).

- `layoutCircularGraph` places all nodes on one circle in input order (or in `sort` order, a stable sort of a copy). The default radius is the smallest one that keeps `nodeGap` (default 40) between neighbouring boxes, so it grows linearly with the node count. An explicit `radius` throws a `RangeError` when it is not finite and positive or too small for the node count. `startAngle` is in radians, default `-Math.PI / 2` (top), and `clockwise` defaults to true.
- `layoutGridGraph` fills rows of `columns` nodes in input order. `columns` must be a positive integer (default `Math.ceil(Math.sqrt(n))`). `rank` is the row index.
- `layoutConcentricGraph` puts nodes on rings by `level(node, degree)`, where `degree` counts incident edges without self-loops and is the default level. Higher levels sit closer to the centre and `rank` is the ring index, 0 being the innermost. `levelWidth` groups levels into one ring when `floor(level / levelWidth)` is equal; without it each distinct level has its own ring. `level` must return finite numbers (`RangeError` otherwise). Every ring is large enough for its nodes and rings are at least one node diagonal plus `ringGap` (default 40) apart, so boxes never overlap. Nodes keep input order within a ring.
- `GraphCircularLayoutOptions`: nodeWidth, nodeHeight, nodeGap, padding, radius, startAngle, clockwise, sort.
- `GraphGridLayoutOptions`: nodeWidth, nodeHeight, columnGap (default 40), rowGap (default 24), padding, columns.
- `GraphConcentricLayoutOptions`: nodeWidth, nodeHeight, ringGap, padding, level, levelWidth, startAngle.
- Both functions are generic over the node type, so `sort` and `level` receive your own nodes (for example `NetworkNode<MyData>`) without casts.

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

### Graph analysis

Headless metrics for large graphs, exported from `vue-weave/core`. Like the algorithms above they validate input with `indexGraph` (unknown endpoints and duplicate IDs throw `Error`), are deterministic (no randomness), iterate instead of recursing and never mutate their arguments. Results are keyed by node ID in input order.

| Export | Purpose |
| --- | --- |
| graphComponents(nodes, edges) | Weakly connected components as `string[][]`. Members follow input order, components are ordered by their first member, isolated nodes are single components. |
| graphDegreeCentrality(nodes, edges, { direction = 'both', normalized = false }) | `Map` of degree per node. Every edge counts once, so parallel edges add up; a self-loop adds 1 to `'in'`, 1 to `'out'` and 2 to `'both'`. `normalized` divides by n − 1 (0 for fewer than two nodes), so values can exceed 1 with parallel edges or self-loops. |
| graphBetweennessCentrality(nodes, edges, { directed = true, normalized = true, weight }) | Brandes' algorithm: breadth-first without `weight`, Dijkstra with a binary heap with it (weights finite and greater than 0, otherwise `RangeError`). O(V·E), so use it on graphs up to a few thousand nodes. Parallel edges are distinct shortest paths, self-loops are ignored, lengths within a relative 1e-12 are equal. Normalized by (n − 1)(n − 2) when directed and by (n − 1)(n − 2) / 2 when undirected (each unordered pair counted once); 0 for fewer than three nodes. |
| graphPageRank(nodes, edges, { damping = 0.85, tolerance = 1e-6, maxIterations = 100, weight }) | `{ scores, iterations, converged }` by power iteration. Scores sum to 1; dangling nodes spread their score uniformly; parallel edges add their weights; self-loops are ordinary links. `damping` must be in [0, 1), `tolerance` finite and greater than 0, `maxIterations` a positive integer, weights finite and nonnegative, otherwise `RangeError`. `converged` is false when the iteration cap stopped the run. |
| detectGraphCommunities(nodes, edges, { resolution = 1, weight }) | `{ communities, modularity }` by the Louvain method (local moving plus aggregation until no node moves). Edges are treated as undirected and weights (finite, greater than 0) add up. Communities are ordered by their first member's input position with members in input order; `modularity` uses the given resolution and is 0 without edges. |
| graphCommunityGroups(communities, { idPrefix = 'community-', label, minSize = 2 }) | `GraphGroup[]` for the `NetworkGraph` `groups` prop. IDs are `idPrefix + (index + 1)` with the index taken from `communities`, so skipped communities leave gaps and the rest stay stable. `label(members, index)` defaults to `Community N`. Communities smaller than `minSize` produce no group. Group IDs must not collide with node IDs because collapsing uses the group ID for the proxy node; change `idPrefix` if needed. A node in two communities throws `Error`. |

```ts
import { detectGraphCommunities, graphCommunityGroups } from 'vue-weave/core'

const { communities } = detectGraphCommunities(nodes, edges)
const groups = graphCommunityGroups(communities, { label: members => `${members.length} nodes` })
```

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
| graphPointInPolygon(point, polygon) | Whether a point is inside a polygon of vertices in order (closed implicitly), by the even-odd rule; a point on the outline counts as inside, and a polygon with fewer than three vertices contains nothing. Throws `RangeError` for a non-finite coordinate |
| graphNodesInPolygon(boxes, polygon) | IDs of the boxes (for example `layout.boxes`) whose centre is inside the polygon, in map order; the lasso of `selectionMode` uses it. Throws `RangeError` for non-finite polygon points or box geometry |

### Row trees and summaries

`createTimelineRowTree(rows)` validates unique nonempty IDs, parent references and cycles. Each preorder entry contains `row`, `depth`, `hasChildren` and `afterSubtree`, the exclusive index after that row and its descendants. Root and sibling order follows input order.

`summarizeTimelineRows(tree, bars)` expects the tree returned by `createTimelineRowTree` and valid bars for those rows. It aggregates leaf-row bars into their ancestors and returns a Map keyed by row ID, including leaves with bars. Each summary reports the earliest start, latest end and interval count. Progress is weighted by duration across bars with known progress. Bars without progress and zero-duration milestones do not contribute to the progress denominator. Explicit parent bars are excluded from descendant aggregation.

### Calendars, scheduling and resource load

`normalizeWorkPeriods(periods, range)` returns sorted, clipped, merged half-open intervals. The range and period endpoints must be safe integers, and each interval must have positive length. `buildWorkPeriods(range, week)` generates these periods from weekly shifts, a fixed UTC offset or an IANA `timeZone`, and civil-date overrides; it uses epoch milliseconds.

`scheduleTasks(input)` returns a `ScheduleResult`. Successful results contain `tasks` (in input order, without inactive tasks), `criticalDependencyIds` and the project `finish`, and, only when they are not empty, `manualConflicts` and `inactiveTaskIds`. Each `ScheduledTask` reports `totalFloat` (working time for tasks, elapsed time for milestones) and `workFloat` (working time on the task calendar for both tasks and milestones). Cycle or infeasible results contain no partial schedule.

`calculateResourceLoad` returns `ResourceLoadSegment[]` with resource ID, start/end, load, available capacity, overload and contributing task IDs. Its optional fifth argument, `ResourceLoadOptions`, takes `inactiveTaskIds` (for example a result's `inactiveTaskIds`): the assignments of those tasks still need a known resource, valid units and no duplicate, but take no capacity, so a plan's full assignment list can be passed; a listed task that is also in `tasks` throws an Error. An assignment to an unknown resource throws an Error that names the resource ID; one to a task that is neither in `tasks` nor in `inactiveTaskIds` throws an Error that names the task ID and says that tasks left out of a schedule result as inactive must be listed in `options.inactiveTaskIds`. `levelResources` throws the same two errors without the hint, because it reads inactive tasks from its own schedule input. The `taskIds` array is typed read-only and segments with the same tasks in the same order share one array, so many overlapping tasks do not copy their IDs into every segment; copy it before changing it. It reports conflicts without automatically moving tasks. See the [scheduling guide](scheduling.md) for time units, quantum alignment, calendar rules, failure results and capacity constraints.

#### Scheduling modes, splits, leveling and time zones

| API | Behavior |
| --- | --- |
| WorkWeek.timeZone | IANA zone name. Shift minutes become local wall-clock times with daylight-saving rules from `Intl.DateTimeFormat`. Skipped wall times resolve to the transition instant; repeated wall times resolve to the earlier occurrence. Cannot be combined with `utcOffsetMinutes`. An invalid zone throws `RangeError`. |
| ScheduleTask.mode | `'asap'` (default) or `'alap'`. An ALAP task takes the latest slot that moves no other task and keeps the project finish. Its result adds `earliestStart` and `earliestEnd`; float remains measured from the earliest dates. |
| ScheduleTask.pauses | Elapsed half-open intervals removed from this task's working time. Work is split around them. |
| ScheduleTask.splittable / priority | Used only by `levelResources`. `splittable` lets leveling add pauses. A higher `priority` (default 0) is placed first. |
| ScheduleTask.manual | A `TimeRange` of manually scheduled dates, like a manually scheduled task in Microsoft Project. The task stays at exactly these elapsed dates: predecessors, its own bounds, `mode` and its calendar do not move it and `duration` is ignored; successors follow it. Its result has `manual: true`, `work` (its calendar's working time inside the dates, after pauses; may be empty), its own dates as latest dates, `totalFloat` and `workFloat` 0 and `critical: false`. Links into it bind nothing in any pass but still count for cycles; each one its dates violate is listed in `manualConflicts`. Dates must align with the quantum and lie inside `range` with `end >= start` (RangeError); a manual task that ends after the `deadline` is `infeasible` with `['deadline']`. See [Manual and inactive tasks](scheduling.md#manual-and-inactive-tasks). |
| ScheduleTask.inactive | `true` leaves the task out of the calculation, like an inactive task in Microsoft Project: it, every link that touches it and its assignments are ignored, and it is not in `tasks`. It is still validated and its ID still counts; links may name it. A value that is not a boolean throws an Error. |
| ScheduleTask.parentId | Makes the task a subtask of the task with this ID; a task that other tasks name as parent is a summary task. Its dates are the span of its subtasks, so its `duration`, `calendarId`, `pauses`, `splittable` and `priority` are ignored, and `fixedStart`, `startNoLaterThan`, `finishNoEarlierThan`, `manual` or `mode: 'alap'` on it throw an Error. Its `startNoEarlierThan` and `finishNoLaterThan` bind every subtask. FS and SS links into it bind the start of every subtask; FF and SF links into it throw an Error. Links from it use its rolled-up start or finish. An inactive summary makes its subtasks inactive, and a summary whose subtasks are all inactive is inactive. An unknown parent, a cycle of parent IDs and a link between a summary and its own subtask throw an Error that names the tasks. See [Summary tasks](scheduling.md#summary-tasks). |
| ScheduledTask.summary / parentId | `summary: true` marks a summary task: `start`/`end` and `latestStart`/`latestEnd` span its subtasks, `work` is empty, `totalFloat` and `workFloat` are the smallest of its subtasks that are not manual (0 when all are manual) and `critical` is true when a subtask is critical. `parentId` repeats the input `parentId` of a subtask. Both are present only with a hierarchy. |
| ScheduleSuccess.manualConflicts / inactiveTaskIds | `ScheduleManualConflict[]` (`{ taskId, dependencyId }`): links into manual tasks whose dates violate them, measured in elapsed time against the predecessor's reported dates, in link order. `inactiveTaskIds`: the inactive tasks in input order. Each is present only when not empty, so plans without the new fields give the same results as before. |
| ScheduleFailure (cycle) | `cycles: ScheduleCycle[]`. Each cycle has `taskIds` and `dependencyIds` of one strongly connected group, in input order. |
| ScheduleFailure (infeasible) | Adds `constraints: ScheduleConstraintName[]` and `dependencyIds`, the binding bounds and links that conflict. |
| levelResources(input) | `LevelResourcesInput` is a `ScheduleInput` plus `resources` and `assignments`. Returns `ScheduleFailure` or `LevelResourcesSuccess`: the leveled schedule plus `leveledTasks`, `delays` (`ResourceDelay[]`), `overloads` and `unresolvedTaskIds`. |

The exported types are `ScheduleSuccess`, `ScheduleFailure`, `ScheduleCycle`, `ScheduleConstraintName`, `ScheduleManualConflict`, `ResourceLoadOptions`, `LevelResourcesInput`, `LevelResourcesSuccess`, `LevelResourcesResult`, `ResourceDelay`, `ScheduleEdit`, `ScheduleChange`, `PropagateEditSuccess` and `PropagateEditResult`. `levelResources` ranks ready tasks by priority, then total float, then early start, then ID, and gives each the earliest start with enough capacity before its latest feasible dates. Tasks without such a start keep their earliest dates and are reported as unresolved. Manual tasks never move: their capacity is reserved first, and one that finds too little capacity at its dates is reported as unresolved. The [scheduling guide](scheduling.md#level-resources) defines each step. Optimization policies remain the application's concern.

### Interchange exports

The core entry builds three interchange formats as strings, and reads CSV, Microsoft Project XML and iCalendar back, without a DOM or dependencies. Save them with a `Blob` (`application/xml`, `text/calendar` or `text/csv`) or send them from a server.

| Export | Behavior |
| --- | --- |
| toMsProjectXml(project, options?) | Microsoft Project XML (MSPDI) for `MsProjectInput`: `name`, `tasks` (`MsProjectTask`: `id`, `name`, `start`, `end` in epoch milliseconds, optional `outlineLevel` from 1, `percentComplete` from 0 to 100, `milestone`, `baselines`, each an `MsProjectBaseline` with `number` from 0 to 10, `start` and `end`, `constraints`, a `TimelineConstraints` in epoch milliseconds, `inactive` and `manual`) and optional `dependencies` (`MsProjectDependency`: `from`, `to`, `type` FS/SS/FF/SF, default FS, and elapsed `lag` in milliseconds). `MsProjectXmlOptions.utcOffsetMinutes` (default 0) sets the wall-clock offset of the written dates. Optional `calendars` (`MsProjectCalendar`: `id`, `name`, `week`, a `WorkWeek`), `defaultCalendarId`, `resources` (`MsProjectResource`: `id`, `name`, `type`, `maxUnits`, `calendarId`), `assignments` (`MsProjectAssignment`: `taskId`, `resourceId`, `units`) and a task's `calendarId` are written too (see below) |
| toICalendar(events, options?) | RFC 5545 text with one VEVENT per `ICalendarEvent` (`id`, `summary`, `start`, `end`, optional `description`). `ICalendarOptions`: `productId` (default `-//vue-weave//Timeline export//EN`), `calendarName` (NAME and X-WR-CALNAME) and `timestamp`, the DTSTAMP of every event (default `Date.now()`; pass it for reproducible output) |
| toCsv(table) | RFC 4180 text from rows of `CsvCell` (`string`, finite `number` or `undefined` for an empty field) |
| timelineCsvTable(rows, bars, options?) | `CsvCell[][]`: a header and one record per bar, ordered by row in tree preorder and then by bar order. `TimelineCsvOptions`: `formatTime` (default ISO 8601 UTC), `columns` (`TimelineCsvColumn[]`, any of `row`, `wbs`, `bar`, `start`, `end`, `progress`; default all, in that order) and `headers` (defaults Row, WBS, Bar, Start, End, Progress). Progress is written from 0 to 1 and is empty without progress |
| parseCsv(text, options?) | `string[][]` from RFC 4180 text, the inverse of `toCsv`. `CsvParseOptions.delimiter` is one character other than a double quote, CR or LF (default `,`) |
| timelineFromCsvTable(table, options) | `TimelineCsvImport` (`{ rows, bars }`) from a table in the `timelineCsvTable` layout, for example the result of `parseCsv`. `TimelineCsvImportOptions`: `parseTime(text)` (required; return NaN for text that is not a time), `columns` (the `TimelineCsvColumn` of each field in order, `undefined` to skip one; the first record is still a header) and `headers` (the header texts to look for without `columns`; defaults as for export) |

**MSPDI.** Tasks get `UID` and `ID` from 1 in input order and are written as manually scheduled tasks (`Manual` 1, with `ManualStart`, `ManualFinish` and `ManualDuration`), so Microsoft Project keeps their dates instead of rescheduling them on its default calendar. Each task has `Name`, `Start`, `Finish`, `Duration` (the elapsed span as `PT#H#M#S`; 0 for milestones), `OutlineLevel`, `OutlineNumber` and `WBS` (both derived from the outline levels), `Milestone` (set for `milestone: true` and for `start === end`), `Summary` (set when the next task is one level deeper) and `PercentComplete` (rounded). Dependencies become `PredecessorLink` elements on the successor with `PredecessorUID`, `Type` (FF 0, FS 1, SF 2, SS 3), `LinkLag` in tenths of a minute and `LagFormat` 4 (elapsed minutes). Task `baselines` become `Baseline` elements after the predecessor links, with `Number`, `Interim` 0, `Start`, `Finish` and the elapsed `Duration`, rounded like the task dates; map your baseline set IDs to Microsoft Project's numbers (0 is Baseline, 1 to 10 are Baseline1 to Baseline10), for example `plan` to 0 and `rev1` to 1. The project carries `Name`, `Title`, `ScheduleFromStart` and the earliest start and latest finish as `StartDate` and `FinishDate`. Dates are local times without an offset suffix, as MSPDI expects, at second resolution: every start and finish is rounded to the nearest whole second (halves up) and `Duration` is the difference of the rounded times, so the three always agree. A task whose `constraints` has exactly one set constraint gets `ConstraintType` (2 Must Start On for `fixedStart`, 4 Start No Earlier Than, 5 Start No Later Than, 6 Finish No Earlier Than, 7 Finish No Later Than) and `ConstraintDate`, rounded like the task dates, after `PercentComplete`. Microsoft Project holds one constraint per task, so a task with two or more gets none, with one exception: exactly `finishNoEarlierThan` and `finishNoLaterThan` at the same time are written as `ConstraintType` 3 (Must Finish On) with that `ConstraintDate`. Pick the one to keep before exporting any other combination. `inactive: true` writes `Active` 0 and `manual: false` writes `Manual` 0, an automatically scheduled task whose dates Microsoft Project recalculates from its links, constraint and calendar when it opens the file; without these fields every task is written with `Active` 1 and `Manual` 1, as before. Calendars, resources and assignments are written when the input has them, with UIDs from 1 in input order (the input IDs are not written): `Calendars` before `Tasks` and `Resources` and `Assignments` after it, `CalendarUID` on the project, tasks and resources, `Type`, `MaxUnits` (when set) and `Units` (default 1; 1 is 100 %). Every calendar is written as a base calendar with its complete weekly pattern (`DayType` 1 to 7, Sunday first, with `WorkingTimes`) and each date of `week.exceptions` as a `DayType` 0 entry with a `TimePeriod`; `week.utcOffsetMinutes` and `week.timeZone` are ignored because MSPDI times are wall-clock times, and a shift that ends after minute 1440 throws a RangeError (split it at midnight). Unknown calendar, task or resource references, duplicate IDs and a repeated task and resource pair throw an Error, and invalid shifts, exception dates, `maxUnits` and `units` a RangeError. These elements follow the MSPDI schema order but have not been opened in Microsoft Project itself. Not exported: a second constraint of a task (apart from the Must Finish On pair), notes, custom fields, baseline work and cost, the base calendar link and recurring exceptions, and the input task IDs. Text is escaped with `escapeXml`. Empty or duplicate task IDs, a missing (`undefined` or `null`) project or task name, unknown dependency ends, a dependency from a task to itself (Microsoft Project does not accept a task as its own predecessor), unknown types, `baselines` that is not an array, a baseline number used twice on a task and an `inactive` or `manual` that is not a boolean throw an Error; non-finite or inverted dates (of tasks and baselines), a baseline number that is not an integer from 0 to 10, an outline level that is not an integer from 1 or that grows by more than one from the previous task, a percent complete outside 0 to 100, a non-finite lag and a constraint time that is not finite throw a RangeError.

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

### Microsoft Project import

| Export | Behavior |
| --- | --- |
| fromMsProjectXml(xml, options?) | `MsProjectImport` (`{ name, tasks, dependencies, warnings }`, plus `calendars`, `defaultCalendarId`, `resources` and `assignments` when the file has them) from a Microsoft Project XML (MSPDI) document, such as Microsoft Project's "Save as XML" or `toMsProjectXml` output. `options.utcOffsetMinutes` (default 0) is the offset of the wall-clock dates, as for the export |
| workCalendarsFromMsProject(project, range) | `WorkCalendar[]` for `scheduleTasks` and `levelResources`: `buildWorkPeriods(range, calendar.week)` for each calendar |
| resourceLoadFromMsProject(project, options?) | `{ resources, assignments, warnings }` in the shapes of `calculateResourceLoad`, `levelResources` and `projectResourceTimeline`; see Resources below |
| timelineFromMsProject(project, options?) | `MsProjectTimeline` (`{ rows, bars, dependencies, hiddenDependencyIds }`) for GanttChart from an `MsProjectImport` or any `MsProjectInput`. `MsProjectTimelineOptions.baselineId(number)` names the baseline sets (default `baseline` for 0, `baseline1` to `baseline10`); `summaryDependencies` keeps links that touch a summary task in `dependencies` |

**Reading.** The reader is a small XML tokenizer written as a loop, so it runs in Node.js, workers and browsers without `DOMParser` and handles deep or long documents. It reads elements, attributes, text, CDATA, comments and processing instructions, the five predefined entities and character references; a leading byte order mark is removed and line ends become LF. A `DOCTYPE` is skipped without reading its declarations, and a reference to any other entity throws, so a document cannot reach external files or expand entities (no XXE, no "billion laughs"). Elements are matched by local name, so the default namespace and prefixes such as `p:Task` both work. Malformed XML throws an Error with the line and column, for example `Invalid XML at line 3, column 1: unknown or invalid entity &bad;`; a document whose root element is not `Project` throws an Error, and an invalid `utcOffsetMinutes` a RangeError.

**Tasks.** The project `name` is `Name` when it is not blank, else `Title`, else empty. Every `Task` except the project summary task (UID 0) and empty rows (`IsNull` 1) becomes an `MsProjectImportTask`: an `MsProjectTask` with its UID as `id` (leading zeros removed), `Name` (not trimmed), `Start` and `Finish` in epoch milliseconds, and the fields a file always has set: `outlineLevel` (default 1), `percentComplete` (default 0), `milestone`, `summary`, `manual` (`Manual` 1) and `inactive` (`Active` 0). Dates are wall-clock times at `utcOffsetMinutes`, mirroring the export, unless they end with `Z` or an offset; fractional seconds are kept. `duration` is `Duration` in milliseconds (an ISO 8601 duration with weeks, days, hours, minutes and seconds; days count 24 hours), which Microsoft Project stores as working time for automatically scheduled tasks, so it suits `ScheduleTask.duration`. `ConstraintType` 2 and 4 to 7 with their `ConstraintDate` become `constraints` with the export's mapping, type 3 (Must Finish On) becomes `{ finishNoEarlierThan: date, finishNoLaterThan: date }`, and type 1 (As Late As Possible) becomes `mode: 'alap'`. `Baseline` elements with dates become `baselines`; baselines with only work or cost are skipped without a warning. `PredecessorLink` elements become `dependencies` in the order of their successor tasks and then of their links, with `type` always set (FF 0, FS 1, SF 2, SS 3; default FS) and `lag` only when it is not 0: `LinkLag` in tenths of a minute as elapsed milliseconds.

**Warnings.** What the reader works around is reported in `warnings` (`MsProjectImportWarning`: `code`, optional `taskId`, an English `message`) instead of thrown:

| code | Cause and handling |
| --- | --- |
| `skipped-task` | A task without a valid UID, without valid `Start` and `Finish`, with `Finish` before `Start` or with a UID used before: the task and its links are skipped |
| `outline-level` | An outline level more than one below the task before it, for example under a skipped task: raised to one below it |
| `invalid-value` | An unreadable `OutlineLevel` (read as 1), `PercentComplete` (read as 0), `Duration` (left out; years and months have no fixed length), `LinkLag` (left out), or a resource `Type`, `MaxUnits` or assignment `Units` (left out) |
| `unsupported-constraint` | An unknown constraint type, or a constraint (Must Finish On included) without a valid date: left out |
| `skipped-baseline` | A baseline with dates and an invalid or repeated number, or with unreadable or inverted dates |
| `unknown-predecessor` | A link from a task that was not imported: skipped |
| `skipped-link` | A link to another project (`CrossProject` 1), from a task to itself, or of an unknown type: skipped |
| `skipped-calendar` | A calendar without a valid UID or with a UID used before: skipped |
| `invalid-calendar` | A working time with unreadable or inverted times, an exception without valid dates, a working day without working times, an exception longer than 3,660 days (the first 3,660 days are kept) or a circular base calendar: left out (a working day without times is left to the base calendar) |
| `unsupported-calendar` | A recurring exception (`Occurrences` above 1), an alternate work week (`WorkWeeks`) or a `DayType` other than 0 to 7: left out |
| `unknown-calendar` | A project, task, resource or base `CalendarUID` that no imported calendar has: left out |
| `skipped-resource` | A resource without a valid UID or with a UID used before: skipped |
| `skipped-assignment` | An assignment to a task or resource that was not imported, or a repeated task and resource pair: skipped |
| `percent-lag` | A lag in percent of the predecessor's duration (`LagFormat` 19, 20, 51 or 52): the link is kept without its lag |
| `working-time-lag` | A non-zero lag in a working-time format (minutes, hours, days, weeks or months of working time) or without `LagFormat`: read as the same amount of elapsed time |

**Calendars.** `calendars` (`MsProjectCalendar`: `id` = UID, `name`, `base` = `IsBaseCalendar`, `baseCalendarId` and `week`) holds each calendar's weekly working times (`WeekDay` entries of `DayType` 1 to 7, Sunday first, with their `WorkingTimes`) and its one-off exceptions (`DayType` 0 entries with a `TimePeriod`, and `Exceptions`) as the `WorkWeek` of `buildWorkPeriods`: `weekly` shifts in minutes after local midnight (a working time that ends at `00:00:00` ends at minute 1440; seconds are rounded to minutes) and `exceptions` by `YYYY-MM-DD` date (an empty list is a day off). Base calendars are resolved, so each `week` is complete: a weekday the calendar does not define comes from its base calendar, and a calendar without a base has no working time on it. Exceptions are inherited too, and the calendar's own ones win. Times are wall-clock times, so `week.utcOffsetMinutes` is set to `options.utcOffsetMinutes` when that is not 0. The project `CalendarUID` becomes `defaultCalendarId`, and a task's or resource's `CalendarUID` (not -1) its `calendarId`; a reference to a calendar that was not imported is left out with a warning. A recurring exception, an alternate work week and a `DayType` 8 or above cannot be represented by `WorkWeek` and are reported as `unsupported-calendar`, not guessed. `workCalendarsFromMsProject(project, range)` builds the `WorkCalendar`s with `buildWorkPeriods`, so `scheduleTasks({ range, calendars, defaultCalendarId: project.defaultCalendarId, tasks })` can use `task.calendarId` as `ScheduleTask.calendarId`; the range is limited like `buildWorkPeriods`.

**Resources.** `resources` (`MsProjectResource`: `id` = UID, `name`, `type` `'work'`, `'material'` or `'cost'`, `maxUnits` and `calendarId`) and `assignments` (`MsProjectAssignment`: `taskId`, `resourceId`, `units`) keep Microsoft Project's fractions, where 1 is 100 %. The placeholder resource 0, unassigned work (`ResourceUID` -65535) and assignments to the project summary task are not imported. `resourceLoadFromMsProject(project, { unitScale, range })` maps them to the integer shapes of the load functions: only work resources, with `capacity = round(maxUnits * unitScale)` (`maxUnits` default 1) and assignments with `units = round(units * unitScale)` (default 1) to tasks that are not summary tasks. `unitScale` defaults to 100, so one unit is 1 %; use 1 for whole-numbered files. An assignment that rounds to 0 units is left out and reported in the helper's `warnings`. With `range`, a resource with a calendar gets `periods`, the working time of that calendar inside the range. `timelineFromMsProject` adds `resources` (`id` and `label` of the work resources) and `assignments` (the same units in percent) to its result when the plan has resources, so `projectResourceTimeline({ resources, assignments, tasks })` needs no further mapping.

Not imported: notes, extended attributes, baseline work and cost, the working-time meaning of lags, lags in percent, resource cost rates and availability tables, and assignment work, dates and contours. `fromMsProjectXml(toMsProjectXml(plan))` reproduces the plan, apart from IDs (the UIDs `1`, `2`, … in task order): names, dates and baselines rounded to the second, outline levels, rounded percent complete, milestones (also every task with `start === end`), single constraints and Must Finish On, dependency types and lags (rounded to tenths of a minute), `inactive` and `manual` (true when it was not set), with `type` and `percentComplete` filled in. Calendars, resources and assignments round-trip too (calendar and resource IDs become the UIDs `1`, `2`, …, and a calendar comes back as a base calendar with its complete week). An `MsProjectImport` is an `MsProjectInput`, so `toMsProjectXml` writes it again.

**Timeline.** `timelineFromMsProject` validates its input like `toMsProjectXml` and throws the same errors. Every task becomes a row with the task ID and name, and the outline levels become `parentId`. A task that the next task is nested under is a summary task: its row has no bar, so GanttChart `showSummaries` draws it from its subtasks. Every other task becomes a bar with the task ID (so bar IDs, task IDs and `ScheduleTask` IDs agree), its name and dates, `progress` (percent complete / 100) when `percentComplete` is set, `constraints`, and `baselines` named by `baselineId`; a milestone (`milestone` or `start === end`) is a zero-length bar at its start, and an inactive task has `appearance: 'outline'`. Dependencies get the IDs `link-1`, `link-2`, … by position in `project.dependencies`, with `type` and a non-zero `lag` copied; one that touches a summary task is listed in `hiddenDependencyIds` instead, unless `summaryDependencies` is set: then it stays in `dependencies` with the summary's row ID as its end, for GanttChart `summaryDependencies` with `showSummaries` (see [Dependencies on summary rows](#dependencies-on-summary-rows)), and `hiddenDependencyIds` is empty. A baseline set ID that is empty, `timelineBaselineId` or used for two numbers throws an Error. Add application fields such as `editable` to the returned bars yourself.

```ts
import { fromMsProjectXml, scheduleTasks, timelineFromMsProject, type ScheduleTask } from 'vue-weave/core'

const project = fromMsProjectXml(await file.text(), { utcOffsetMinutes: 540 })
for (const warning of project.warnings) console.warn(warning.code, warning.message)
const { rows, bars, dependencies } = timelineFromMsProject(project)

// Schedule the leaf tasks: manual tasks keep their dates, inactive tasks stay out of the calculation.
const tasks = project.tasks.filter(task => !task.summary).map((task): ScheduleTask => ({
  id: task.id, duration: task.duration ?? task.end - task.start, ...task.constraints,
  ...(task.manual ? { manual: { start: task.start, end: task.end } } : {}),
  ...(task.inactive ? { inactive: true } : {}),
}))
const plan = scheduleTasks({ range, tasks, dependencies })
```

The `dependencies` of `timelineFromMsProject` have IDs and connect leaf tasks only, so they serve as `ScheduleLink`s. Without calendars, `duration` is scheduled in continuous time; pass `workCalendarsFromMsProject(project, range)` as `calendars`, `project.defaultCalendarId` as `defaultCalendarId` and each task's `calendarId` for working time.

### iCalendar import

| Export | Behavior |
| --- | --- |
| fromICalendar(text, options?) | `ICalendarImport` (`{ name?, events, warnings }`) from RFC 5545 text, such as `toICalendar` output or a calendar application's export. `ICalendarImportOptions.utcOffsetMinutes` (default 0, within ±1080) is the offset of local times without a zone |
| timelineFromICalendar(events) | `ICalendarTimeline` (`{ rows, bars }`) from any `ICalendarEvent[]`: one row and one bar per event, with the event ID as both IDs, the summary as label and the description (when not empty) as the bar's `description`. An event with `start === end` is a zero-length milestone bar. Throws the Errors and RangeErrors of `toICalendar` |

**Reading.** Pure string parsing with loops, without a DOM, network or file access. Lines are unfolded (a line that starts with a space or tab continues the one before it), CRLF, LF and lone CR line ends and a leading byte order mark are accepted, names and parameter names are case-insensitive and quoted parameter values may contain `;` and `:`. TEXT values are unescaped (backslash followed by `n` or `N`, `,`, `;` or backslash; any other backslash is kept). Only properties directly inside a `VEVENT` count; other components (`VTODO`, `VTIMEZONE`, …) and nested ones such as `VALARM` are ignored. The calendar `name` is `NAME`, else `X-WR-CALNAME`. The reader sets no size limit, so bound uploaded files yourself.

**Events.** Each `VEVENT` becomes an `ICalendarImportEvent`, an `ICalendarEvent` (so `toICalendar` accepts it) with `id` (UID), `summary` (empty when missing), `description` when present, `start` and `end` in epoch milliseconds, `allDay` and, for a recurring event, `recurrenceRule`. Times: a UTC time (`Z`) is exact; a time with a `TZID` is resolved with `Intl` the way `buildWorkPeriods` resolves `timeZone` (a wall time skipped by daylight saving moves forward to the transition, a repeated one takes its first occurrence), and the nonstandard prefix of `/mozilla.org/…/Europe/Berlin` is stripped; `VTIMEZONE` definitions are not read, so a TZID that `Intl` does not know (for example a Windows zone name) is reported as `unknown-time-zone` and the time is read as a floating time. A floating time, and a date (`VALUE=DATE`, midnight), are wall-clock times at `utcOffsetMinutes`. The end is `DTEND`, else `DTSTART` plus `DURATION` (weeks, days, hours, minutes, seconds; a day is 24 hours), else the start plus one day for a date and the start itself for a date-time, which is an instant like the events `toICalendar` writes without `DTEND`. For dates `DTEND` is exclusive, matching the half-open `[start, end)` interval. An event with RRULE, RDATE or EXDATE is imported once, at its first instance, with a `recurrence` warning (the rule is not expanded); a changed instance (RECURRENCE-ID) is skipped. `fromICalendar(toICalendar(events))` returns the same events with `allDay` false.

**Warnings** (`ICalendarImportWarning`: `code`, optional `eventId` and one-based `line`, an English `message`): `skipped-event` (no valid DTSTART, a RECURRENCE-ID, a repeated UID or no END:VEVENT), `missing-uid` (the event is named `event-<n>`), `recurrence`, `unknown-time-zone`, `invalid-value` (an unreadable or negative DURATION, an unreadable DTEND, a DTEND before DTSTART or both DTEND and DURATION; the event becomes an instant, or DTEND wins) and `malformed` (a line without a colon or an END that does not match). Text without `BEGIN:VCALENDAR` and a non-string throw an Error, and an invalid `utcOffsetMinutes` a RangeError.

```ts
import { fromICalendar, timelineFromICalendar } from 'vue-weave/core'

const { events, warnings } = fromICalendar(await file.text(), { utcOffsetMinutes: 540 })
const { rows, bars } = timelineFromICalendar(events)
```

### Recorded actuals

`rescheduleFromActuals(input, statusDate, actuals)` replans from what actually happened instead of a progress share. `actuals` is a `ReadonlyMap` from task ID to `TaskActuals`:

| Field | Meaning |
| --- | --- |
| `intervals` | Recorded working intervals, half-open `[start, end)` in absolute time, possibly several (start, interruption, resume). Each must be finite, have `end > start`, align with the horizon and quantum and lie inside `input.range`; otherwise RangeError. They are never moved, clipped to a calendar or merged with the forecast |
| `remainingWork` | Optional working time still to do, in the input's units on the task's calendar; a non-negative multiple of the quantum (RangeError otherwise). Default: `duration` minus the elapsed length of the intervals (overlaps counted once), at least 0 |
| `finished` | Optional `true` when the task is complete. Requires at least one interval (Error) |

The status date is validated like that of `rescheduleFromStatusDate`. Actuals that are not a Map, an unknown task, a summary task or an entry without an `intervals` array throw an Error; entries of inactive tasks are validated and ignored. The arguments are not modified.

`RescheduleFromActualsResult` is a union on `ok`, which equals `schedule.ok`:

| Field | Meaning |
| --- | --- |
| `schedule` | The forecast `ScheduleResult` with the input's task and link IDs. A started task spans from its first actual start to its forecast finish and its `work` is its sorted actual intervals followed by its remaining work; its latest dates and float describe the remaining work. A finished task spans its actuals, with latest dates equal to its dates, float 0 and `critical` false |
| `plan` | `scheduleTasks(input)`, the original plan |
| `tasks` | One `ActualsTask` per active task in input order |
| `diagnostics` | `ActualsDiagnostic` entries, task by task, followed by `toPlanningDiagnostics(schedule)` |
| `statusDate` | The status date |

An `ActualsTask` has `id`, `state` (`ActualsTaskState`: `not-started`, `in-progress` or `finished`), `actual` (copies of the recorded intervals in input order), `remaining` (the forecast working segments of the remaining work; empty for finished, manual and summary tasks, milestones and a failed schedule), `performedWork`, `remainingWork`, the forecast `start` and `end` (after a failure, the span of the actuals, or absent), `plan` (the task's dates in `plan`, when it succeeded), `offCalendar` (the parts of the actuals outside the task's calendar after pauses) and, when they apply, `parentId`, `summary` and `manual`. A summary task sums `performedWork` and `remainingWork` of its subtasks and is `finished` when all of them are.

An `ActualsDiagnostic` has the shape of a `PlanningDiagnostic` (`id`, `code`, `severity`, `entities` with the task, `range`, empty `reasonIds`), so both fit in one list. `ActualsDiagnosticCode`:

| Code | Severity | Range |
| --- | --- | --- |
| `actual-overlap` | error | The overlapping part of two intervals of the task |
| `actual-after-status-date` | warning | The part of an interval after the status date |
| `actual-outside-calendar` | warning | A part of an interval outside the task's working time |
| `actual-contradiction` | error | None: the task is `finished` but has a positive `remainingWork` |

`actualsTimelineBars(result, options?)` returns `TimelineBar[]` in task order, without summary tasks (use GanttChart `showSummaries` for their rows). A task with actuals gets a solid bar `<label> · actual` spanning them, with the merged intervals as `segments` when there are several; a task with remaining work, and an unstarted or manual task, gets an outline bar `<label> · forecast` over its forecast work. After a failed schedule only actual bars are returned. The original plan becomes a baseline of the task's first bar. `ActualsTimelineBarOptions`:

| Option | Default |
| --- | --- |
| `label(taskId)` | The task ID |
| `rowId(taskId)` | The task ID |
| `barId(taskId, part)` | `taskId + ':' + part`, with `part` `actual` or `forecast` |
| `partLabels` | `{ actual: 'actual', forecast: 'forecast' }`, appended to the label after ` · ` |
| `descriptions` | `{ actual: 'Recorded actual work', forecast: 'Remaining work forecast' }`, the bars' `description` |
| `tones` | `{ actual: 'teal', forecast: 'blue' }` |
| `baselineId` | `timelineBaselineId`: the plan becomes the bar's `baseline`. Another ID adds a named `baselines` entry; `false` adds none |

### Network diagram from a schedule

`scheduleToGraph(result, dependencies, options?)` turns a successful `scheduleTasks` (or `propagateEdit`, `rescheduleFromStatusDate`) result into an activity-on-node diagram for NetworkGraph. It returns a `ScheduleGraph`: `nodes` (one `NetworkNode` per task in result order, with ID, label, a detail with the early start, early finish and total float, and `data` of type `ScheduleGraphNodeData`), `edges` (one `GraphEdge` per dependency with the dependency's ID, a label and `data` of type `ScheduleGraphEdgeData`: `type`, `critical` and, only for a non-zero lag, `lag`), `criticalNodeIds` and `criticalEdgeIds` (the result's `criticalDependencyIds`). Critical tasks get the `criticalTone` (default amber) and the others the `tone` (default blue). For an ALAP task the early dates are `earliestStart` and `earliestEnd`. An edge label shows the dependency type when it is not FS and a non-zero `lag` formatted by `formatLag`, separated by a space: `SS`, `+2 h`, `SS +2 h` or `FF −0.5 h` (a lead). An FS dependency without lag, or with a lag of 0, has no label, as before lags were shown. A dependency that touches a task listed in the result's `inactiveTaskIds` is left out, so the plan's full dependency list can be passed; a manual task is a node like any other, with zero float.

`ScheduleGraphOptions`: `label(taskId)` (default the ID), `formatTime` (default UTC `YYYY-MM-DD HH:mm`), `formatDuration` for the float (default hours of a millisecond duration, for example `1.5 h`), `formatLag` for a non-zero lag (default `formatDependencyLag`, signed hours of a millisecond lag such as `+2 h`; called only for a non-zero lag, so charts in other units pass their own, as with GanttChart `formatLag`), `labels` (`earlyStart`, `earlyFinish` and `float` prefixes; defaults ES, EF and Float), `criticalTone` and `tone`. A failed result, a dependency whose ends are not tasks of the result, a dependency from a task to itself, or a repeated dependency ID (edge IDs must be unique) throws an Error; a lag that is not a finite number throws a RangeError.

```vue
<NetworkGraph :nodes="graph.nodes" :edges="graph.edges" :related-ids="graph.criticalNodeIds" :options="{ nodeWidth: 280 }" />
```

`relatedIds` highlights the critical tasks and the edges between them; use `criticalEdgeIds` with an `edge` slot to style exactly the controlling links.

## Linked views

Core helpers and a composable link entities (tasks, resources, anything the application defines) to what the graph, timeline and load views show. The application passes the results to the components: `selectedIds` for the view the user acts in and display-only highlights for the others (NetworkGraph `highlightedNodeIds` and `highlightedEdgeIds`, GanttChart `highlightedBarIds` and `highlightedDependencyIds`, or `relatedIds`, `matchIds` or its own handling). Both components report what the user points at or activates through `target-enter`, `target-leave` and `target-activate` (`ViewTargetEvent`; NetworkGraph narrows it to `ViewTargetEvent<GraphViewTarget>`), and `revealNode` and `revealBar` bring a linked item into view (`RevealResult`). Types: `GraphViewTarget`, `ViewTargetSource`, `ViewTargetEvent`, `RevealStatus`, `RevealOptions` and `RevealResult`.

```ts
import { buildViewBindingIndex, resolveViewTargets, resolveEntityRefs } from 'vue-weave/core'

const index = buildViewBindingIndex([
  { entity: { kind: 'task', id: 'A' }, target: { view: 'graph', kind: 'node', id: 'n1' } },
  { entity: { kind: 'task', id: 'A' }, target: { view: 'timeline', kind: 'bar', id: 'b1' } },
])
resolveViewTargets(index, [{ kind: 'task', id: 'A' }]) // { targets: [n1, b1], unknown: [] }
resolveEntityRefs(index, [{ view: 'timeline', kind: 'bar', id: 'b1' }]) // { entities: [task A], unknown: [] }
```

| Export | Contract |
| --- | --- |
| `buildViewBindingIndex(bindings)` | Two-way index. Many-to-many links are allowed, identical bindings count once, inputs are not modified. Keys encode kind and ID as a JSON tuple, so a task `A` and a resource `A` never collide. Throws for an empty kind or ID, and `RangeError` for a load range that is not finite or ends before it starts. |
| `resolveViewTargets(index, entities)` | `{ targets, unknown }`: targets without repeats; entities with no binding are listed in `unknown`. |
| `resolveEntityRefs(index, targets)` | `{ entities, unknown }`. A load target matches bound load targets of the same resource whose half-open range overlaps it. |
| `resolveLoadTargets(segments, targets)` | `{ segments, unknown }`: current segments that overlap a load target. A load segment has no ID and its boundaries change when load is recalculated, so a target that overlaps no current segment is reported in `unknown` and never replaced by another segment. |
| `traverseGraph({ nodes, edges }, startIds, { direction, maxHops })` | Iterative walk (`'forward'`, `'backward'` or `'both'`, default `'both'`; `maxHops` default `Infinity`). Returns `{ nodeIds, edgeIds, unknownIds }`; unknown start IDs are reported, not thrown. `'both'` walks each direction independently, like `graphNeighborhood`. Safe on cycles and long chains. |
| `resolveCollapsedTargets(collapse, { nodeIds, edgeIds }, edges)` | Resolves IDs of the full graph against a `collapseGraphGroups` result: hidden nodes to their proxy, edges merged into a re-attached edge to the merged edge, and edges dropped inside one collapsed group to that group's proxy node. `edges` are the edges given to `collapseGraphGroups`. Returns `{ nodeIds, edgeIds, unknownNodeIds, unknownEdgeIds }`. |
| `timelineBarsInRange(bars, range, { rowIds }?)` | The bars worked on in the half-open range `[range.start, range.end)`, in input order, with their own type (`B extends TimelineBarActivity`: `id`, `rowId`, `start`, `end`, `segments`). See [Time range exploration](#time-range-exploration). |
| `resolveTimeRangeTargets(index, barIds, { graph, traversal }?)` | `TimeRangeTargets`: `{ activeBarIds, activeEntities, activeTargets, relatedEntities, relatedTargets, unknownBarIds }`. See [Time range exploration](#time-range-exploration). |
| `useLinkedSelection({ bindings, onSelect, timeRange })` | See below. |

`useLinkedSelection` returns `select(view, targets)`, `clearSelection()`, `hoverEnter(view, target)`, `hoverLeave(view, target?)`, `owner`, `selectedEntities`, `hoveredEntities` and the per-view sets `graph`, `timeline` and `load`. The view the user acted in owns the selection: its `selected*` sets contain what it selected, and every view gets `highlighted*` sets for the other linked targets, so a linked view never receives targets it did not select. Selecting the same targets again is a no-op and does not call `onSelect`, so connecting a view's events back to `select` does not loop. A new selection replaces the previous one, whichever view made it. Hover only produces highlights, and `hoverLeave` clears them. The optional `timeRange` adds display-only highlights for a time range; see [Time range exploration](#time-range-exploration).

| View | Pass to the component |
| --- | --- |
| `graph` (`LinkedGraphSets`) | `selectedNodeIds` to NetworkGraph `selectedIds`; `highlightedNodeIds` and `highlightedEdgeIds` to the props of the same name; `highlightedGroupIds` to your own group rendering |
| `timeline` (`LinkedTimelineSets`) | `selectedBarIds` to GanttChart `selectedIds`; `highlightedBarIds` and `highlightedDependencyIds` to the props of the same name; `highlightedRowIds` to your own row rendering |
| `load` (`LinkedLoadSets`) | `selected` to GanttChart `selectedLoadTargets` and `highlighted` to `highlightedLoadTargets` |

Each set object also has `related*` sets (`relatedNodeIds`, `relatedEdgeIds`, `relatedGroupIds`; `relatedBarIds`, `relatedDependencyIds`, `relatedRowIds`; `load.related`). They are empty unless `timeRange` has a `traversal`; see below.

`revealLinkedTarget({ reveal, expand?, maxExpansions? })` (Vue entry) goes to a linked item that may be inside a collapsed group or row. It calls `reveal()` (for example `() => graph.value?.revealNode(id, { focus: true })`); when the result is `hidden-by-collapse` it asks `expand(proxyId, result)`, which expands that proxy in the controlled `collapsedGroupIds` or `collapsedIds` and returns true, or returns false to decline. After an accepted expansion it waits for the render (two `nextTick`s) and reveals again, up to `maxExpansions` (default 16) nested collapses. It resolves a `LinkedRevealResult`: the last `RevealResult` plus `expandedIds`, and `declined: true` when `expand` declined or accepted without the item becoming visible. It never expands anything itself, and it resolves `revealed` only when the last reveal did, so a refused expansion is never reported as a completed move. Without `expand` it returns the first result.

### Time range exploration

Select a time range, for example 14:00–16:00 on inspection machine X, and show what was worked on in it in the linked views, optionally with what the graph relates to it. Times are never inferred from the graph: activity comes only from the bars.

```ts
import { buildViewBindingIndex, resolveTimeRangeTargets, timelineBarsInRange } from 'vue-weave/core'

const active = timelineBarsInRange(bars, { start: t1400, end: t1600 }, { rowIds: ['machine-x'] })
const result = resolveTimeRangeTargets(buildViewBindingIndex(bindings), active.map(bar => bar.id), {
  graph: { nodes, edges }, traversal: { direction: 'forward' }, // all successors
})
result.activeTargets  // the active bars and every target bound to their entities
result.relatedTargets // what the walk reached, without the active targets
```

`timelineBarsInRange(bars, range, options?)` follows the half-open interval rules:

- A bar without `segments` is active when `bar.start < range.end && bar.end > range.start`.
- A bar with `segments` is active only when one of its work segments overlaps the range the same way. A pause between segments (a lunch break, for example) that covers the whole range does not count, although the bar's outer extent overlaps.
- A milestone (`start === end`) at time t is active when `range.start <= t < range.end`: at the range start, not at its end.
- An empty range (`start === end`) is the instant t: it matches work with `start <= t < end` and milestones at exactly t.
- `options.rowIds` keeps only bars of those rows; unknown row IDs match nothing.

It throws `RangeError` for a range or bar time that is not finite or ends before it starts, and for empty, non-finite or zero-length segments or segments on a milestone. It returns the input bar objects in input order and does not modify them.

`resolveTimeRangeTargets(index, barIds, options?)` resolves the active bars through a `buildViewBindingIndex` index. `activeEntities` are the entities bound to the bars; `activeTargets` are the bars themselves plus every target bound to those entities, so an active task's node, load range and other bars are active too. Bar IDs that no binding reaches stay in `activeTargets` and are listed in `unknownBarIds`. With `graph` and `traversal` (`GraphTraversalOptions`), it walks the graph with `traverseGraph` from the graph nodes of the active entities: `{ direction: 'forward' }` for all successors, `'backward'` for all predecessors, `'both'` for both, `{ direction: 'both', maxHops: 1 }` for direct neighbours, and `maxHops` to limit the depth. The walk is iterative and terminates on cycles. `relatedEntities` are the reached entities that are not active, and `relatedTargets` the reached graph nodes and edges and the targets bound to related entities, without any active target. Invalid traversal options or graph edges throw as in `traverseGraph`.

`useLinkedSelection({ bindings, timeRange })` does both reactively. `timeRange` is a `LinkedTimeRange` (`{ range, bars, rowIds?, graph?, traversal? }`), a ref or getter, or undefined. Active targets join the `highlighted*` sets and `load.highlighted`, and related targets fill the `related*` sets, both without targets the owning view selected and without repeats; the returned `timeRange` computed holds the `TimeRangeTargets`. The range is display only: it never changes `owner`, `selectedEntities`, the `selected*` sets or calls `onSelect`, so Delete in a view never removes range-highlighted items. An invalid range throws `RangeError` when the sets are read; validate user input first. Without `timeRange`, every set is as before and the `related*` sets are empty.

Pass `graph.relatedNodeIds` to NetworkGraph `relatedIds` to draw related nodes, and the edges between them, apart from active ones (`vw-is-related` instead of `vw-is-highlighted`). GanttChart has no related-bar prop; merge `relatedBarIds` into `highlightedBarIds` or style them yourself, for example through `appearance` or `tone` on derived bars.

## Resource timelines and unplanned tasks

These `vue-weave/core` helpers show one plan by resource in an ordinary GanttChart. A task assigned to several resources appears once in each resource row; the input task stays one item, so its dates, its work and the resource load are not multiplied by the number of rows. See [Resource rows and unplanned tasks](scheduling.md#resource-rows-and-unplanned-tasks) for the workflow.

| Function | Returns |
| --- | --- |
| projectResourceTimeline(input, options?) | `ResourceTimelineProjection`: `{ rows, bars, dependencies, laneCount, origins, taskBarIds, dependencyOrigins, omittedDependencyIds, hiddenDependencyIds, unplannedTaskIds }` |
| createResourceTimelineProjector() | A memoized `projectResourceTimeline` that returns the previous projection while the input fields and options are the same objects |
| resourceTimelineBarId(taskId, resourceId) | The projected bar ID, the JSON tuple `[taskId, resourceId]` |
| resolveResourceTimelineEdits(projection, edits) | `{ ok: true, scheduleChanges, assignmentReplacements }` or a `ResourceTimelineRejection` |
| resolveResourceTimelineEdit(projection, edit) | `{ ok: true, scheduleChange?, assignmentReplacement? }` or a `ResourceTimelineRejection` |
| resourceTimelineCascade(projection, input) | A `TimelineCascade` that runs `propagateEdit` on task IDs and returns edits of every affected projection |
| proposeResourceAssignment(state, request) | `{ ok: true, assignments, added, removed }` or `{ ok: false, code: 'already-assigned' \| 'not-assigned', reason }` |
| buildPlacementInput(input, placedTaskIds) | `PlacementResult`: `{ ok, input, diagnostics, unplacedTaskIds, excludedDependencyIds, excludedAssignments }` |

`ResourceTimelineInput` has `resources` (`{ id, label, detail?, data? }`, one row each, with the resource ID as row ID), `tasks` (placed tasks: `TimelineBar` fields without `rowId` and `lane`, copied to each projection), `assignments` (`ResourceAssignment`), optional task-level `dependencies` and optional `unplannedTaskIds`. Bars are ordered by task and then by row, with lanes from `assignLanes`; pass `laneCount` to GanttChart. The default label is `task label · resource label`, so projections of one task have distinct accessible names; `options.barLabel(task, resource)` replaces it. Bar IDs come from the task and resource IDs and do not depend on input order. `origins` maps each bar ID to `{ taskId, resourceId }` and `taskBarIds` maps each placed task to its bar IDs in row order.

Chart links use bar IDs, so the scheduler's `ScheduleLink` array cannot be passed to the chart unchanged. Each task link becomes at most one chart link, with the link's ID, between the first projection of each task in `options.preferredBarIds` (for example the selected bars) or else its first projection in row order. `dependencyOrigins` maps chart link IDs to task link IDs, `omittedDependencyIds` lists drawn links whose tasks have several projections, and `hiddenDependencyIds` lists links not drawn because a task has no bar. The projection throws an Error for duplicate IDs, unknown or duplicate assignments, unknown link endpoints, a link from a task to itself and a task that is both placed and unplanned. The input is not modified.

`resolveResourceTimelineEdits` turns GanttChart edits, including several projections of one task from `edits` or a cascade, into one `ResourceTimelineScheduleChange` (`{ taskId, before, after, mode, source }`) per task whose dates change, and one `ResourceAssignmentReplacement` (`{ taskId, fromResourceId, toResourceId }`) per bar whose `row` changes. A diagonal move gives both; apply them as one change. Rejections carry `code` and the `barIds` involved: `stale` (the bar is not in the projection, or its dates or row differ from `before`), `already-assigned` (the task already has the target resource), `conflicting-schedule` (projections of one task with different new dates) and `conflicting-assignment` (one bar to two rows, or two projections of one task to one row). A target row that is not in the projection throws an Error.

`proposeResourceAssignment(state, request)` takes `{ assignments, resourceIds?, taskIds? }` and one of `{ kind: 'add', taskId, resourceId, units? }`, `{ kind: 'remove', taskId, resourceId }` and `{ kind: 'replace', taskId, fromResourceId, toResourceId }`. A replacement keeps the position and units of the replaced assignment. Unknown tasks or resources (when the lists are given) and duplicate assignments in the state throw an Error, and units that are not a positive integer throw a RangeError.

`buildPlacementInput(input, placedTaskIds)` takes a `ScheduleInput` with optional `assignments`, such as a `LevelResourcesInput`, and returns the same kind of input with only the placed tasks, the links between them and their assignments. A link from an unplaced task to a placed one is reported as `{ code: 'unplaced-predecessor', taskId, predecessorId, dependencyId }` and makes `ok` false, unless the scheduler would ignore it anyway: a link that touches an `inactive` task, or a link into a placed task with `manual` dates, is only excluded. A placed task whose `parentId` names an unplaced task gets the ID of its nearest placed ancestor instead, or none when no ancestor is placed. Duplicate or unknown IDs and duplicate assignments still throw an Error.

## Planning diagnostics and schedule traces

These core helpers explain a plan without changing it. They are pure and return data; wording, translation and the list UI are the application's concern.

| Export | Contract |
| --- | --- |
| scheduleTasks(input, options?) | `options.explain` (default false) adds a `trace: ScheduleTrace` to a successful result. Overloads type `trace` only for `{ explain: true }` (`ExplainedScheduleResult`). Dates, floats, critical flags and `criticalDependencyIds` are the same with or without it; without it the result has no `trace` property. Failures never have a trace. Options that are not an object, or an `explain` that is not a boolean, throw an Error |
| levelResources(input, options?) | The same option and overloads (`ExplainedLevelResourcesResult`). Dates, `leveledTasks`, `delays`, `overloads` and `unresolvedTaskIds` are unchanged |
| collectScheduleReasons(trace, taskId, options?) | The task's reasons followed by all their ancestors, breadth first, each once. `options.phases` limits the starting reasons. Iterative, so long chains do not exhaust the call stack. Throws an Error for an unknown task or parent reason |
| toPlanningDiagnostics(result, load?) | Turns a `scheduleTasks` or `levelResources` result into `PlanningDiagnostic[]`. `load` (for example `calculateResourceLoad` output) replaces the result's own `overloads`; only segments with `overload > 0` are listed. A segment with a non-finite date or overload throws a RangeError. Each entry of the result's `manualConflicts` becomes a `manual-conflict` warning; a success lists them first, then unresolved tasks, then overloads |

`ScheduleTrace` has `reasons` (each after its parents) and `taskReasonIds` (a `ReadonlyMap` from task ID to its own reason IDs, in input task order, without inactive tasks). Do not store a trace in a snapshot; recalculate it. A `ScheduleReason` has an `id` unique within its trace, `taskId`, `phase` (`ScheduleReasonPhase`), `kind` (`ScheduleReasonKind`), `bound` (`startLower`, `endLower`, `startUpper` or `endUpper`), `candidateTime` and `placedTime`, `parentReasonIds`, and depending on its kind `dependencyId`, `constraint`, `calendarId`, `resourceId`, `demand`, `capacity`, `relatedTaskIds` and `range`.

| kind | Meaning |
| --- | --- |
| `dependency` | A link sets the limit. `relatedTaskIds` is the other task and the parents are its reasons in the same pass |
| `constraint` | `startNoEarlierThan`, `startNoLaterThan`, `finishNoEarlierThan`, `finishNoLaterThan` or `fixedStart`. For a constraint that a subtask inherits from a summary task, `relatedTaskIds` is that summary task |
| `project-bound` | `range`, the input `deadline`, `projectFinish` (parents: the reasons of the tasks that finish the project) or, without a `constraint`, the latest dates that leveling may not pass (parents: that task's `latest` reasons) |
| `calendar` | Calendar time off moved the side from `candidateTime` to `placedTime` |
| `pause` | The task's own pauses moved it further |
| `capacity` | In `leveling`: `resourceId` had less remaining capacity than `demand` in `range`; `capacity` is its capacity there and `relatedTaskIds` the tasks that held it first. A manual task that finds too little capacity at its dates gets these reasons too |
| `manual` | The task has `manual` dates, which fix it: one reason per phase (`earliest` and `leveling` with bound `startLower`, `latest` with `startUpper`), with the manual start as `candidateTime` and `placedTime` |

Tied limits are all reported, compared in working time as the scheduler places tasks. `range` is left out when a named bound has the same value, as in `ScheduleFailure.constraints`.

A `PlanningDiagnostic` has `id` (a JSON array of the code and identifying values, stable across recalculations), `code` (`PlanningDiagnosticCode`), `severity` (`PlanningDiagnosticSeverity`), `entities` (`EntityRef[]` of kinds `task`, `dependency` and `resource`), optional `range`, optional `constraints` (for `schedule-infeasible`) and `reasonIds` into the result's trace.

| code | severity | Source |
| --- | --- | --- |
| `schedule-cycle` | error | One per entry of a `cycle` failure: its tasks and dependencies |
| `schedule-infeasible` | error | An `infeasible` failure: the task, its binding dependencies and `constraints` |
| `manual-conflict` | warning | Each of `manualConflicts`, listed first: the manual task, then the violated dependency; the plan stays valid. `reasonIds` hold the task's `manual` reason of the `earliest` phase |
| `leveling-unresolved` | warning | Each of `unresolvedTaskIds`, with its dates; `reasonIds` are its `leveling` reasons |
| `resource-overload` | warning | Each overloaded segment: the resource, then its tasks; `reasonIds` are the overlapping `capacity` reasons |

The exported types are `PlanningDiagnostic`, `PlanningDiagnosticCode`, `PlanningDiagnosticSeverity`, `ScheduleReason`, `ScheduleReasonPhase`, `ScheduleReasonKind`, `ScheduleReasonBound`, `ScheduleTrace`, `ScheduleOptions`, `CollectScheduleReasonsOptions`, `ExplainedScheduleSuccess`, `ExplainedScheduleResult`, `ExplainedLevelResourcesSuccess` and `ExplainedLevelResourcesResult`. See [Explain a plan](scheduling.md#explain-a-plan).

## Asynchronous layouts and preserved routes

Core (`vue-weave/core`):

- `graphLayoutInputKey(input: GraphLayoutKeyInput): string` identifies a layout input: scope, direction, `settings` (JSON text), `revision`, and in order the nodes (ID, label, detail, shape, ports), edges (ID, ends, ports, label, waypoints), groups, collapsed group IDs, and any `positions` and `sizes` given to the engine. Node and edge `data` is not read; change `revision` when it matters. Throws RangeError for an unknown scope or direction or settings that are not JSON-serializable.
- `buildGraphLayoutRequests(input: GraphLayoutRequestInput<N, E, G>, requestId: string): GraphLayoutRequests<N, E, G>` makes the requests NetworkGraph's `layout` calls correspond to: one `shown` request (ID `requestId + ':shown'`) and, while a known group is collapsed, an `expanded` request (`requestId + ':expanded'`) for the full input plus the `collapse` result. Unknown collapsed IDs are dropped and proxy details use `labels.collapsedNode` / `labels.collapsedNodes`, as in NetworkGraph.
- `validateGraphLayoutResponse(request, response): GraphLayout` checks that a response echoes `requestId`, `inputKey` and `scope`; every node needs a finite positive box; a `shown` layout also needs finite positive dimensions, a path for every edge and route metadata (when given) with finite points and the edge's ports.
- `completeGraphLayout(layout, nodes, edges, options?: { direction? }): { layout, temporaryEdgeIds, unresolvedEdgeIds }` adds temporary built-in routes for edges without a path whose end boxes exist.
- `isGraphRouteValid(layout, nodes: ReadonlyMap<string, IdentifiedNode>, edge): boolean` tells whether the `preserve` policy keeps an edge's path.
- `graphLayoutToJson(layout)`, `graphLayoutFromJson(value)`, `graphLayoutMessageToJson(message)`, `graphLayoutMessageFromJson(value)` and `parseGraphLayoutMessage(value)` convert and check layout Worker messages (`request`, `cancel`, `success`, `failure`; each with `requestId` and `inputKey`) for JSON and structured-clone transport.
- `routeGraphPorts(layout, nodes, edges, direction, options?: GraphPortRouteOptions)` and `routeGraphEdges(layout, edges, nodes, options)` accept `policy?: GraphRoutingPolicy` (`'builtin'` default, or `'preserve'`).
- `GraphLayout` has an optional `routes?: Map<string, GraphLayoutRoute>`: `start`, `end`, `fromPort`, `toPort`, `fromSide`, `toSide` and bend `points` of each routed edge.
- Types: `GraphLayoutScope`, `GraphLayoutRequestInput`, `GraphLayoutRequest`, `GraphLayoutResponse`, `GraphLayoutRequests`, `GraphLayoutKeyInput`, `GraphLayoutCompletionOptions`, `GraphLayoutCompletion`, `GraphLayoutRoute`, `GraphRoutingPolicy`, `GraphPortRouteOptions`, `GraphLayoutWorkerMessage` (and its four members), `GraphLayoutJson`, `GraphLayoutRequestJson`, `GraphLayoutWorkerJsonMessage`.

Vue (`vue-weave`):

- `useAsyncGraphLayout(options: UseAsyncGraphLayoutOptions<N, E, G>): AsyncGraphLayout<N, E, G>` with `input`, `adapter(request, signal)`, optional `initialLayout`, `gesture`, `provisional` (default true) and `cacheSize` (default 32). It returns `desired` and `display` frames, a `layout` function of stable identity, `pending`, `deferred`, `error`, `gestureListeners`, `gesturing`, `cancel()` and `dispose()`. `display.source` is `'initial'`, `'layout'` (every layout of the frame came from the adapter) or `'provisional'` (the previous boxes with temporary routes for `temporaryEdgeIds`, shown while the adapter computes a frame whose nodes all have boxes already). A failure sets `error` and keeps the display: the last adapter frame, or, with `provisional`, the provisional frame of the failed input, which is consistent (every node and edge has geometry) and says by its `source` that its new routes are temporary. Set `provisional: false` to keep showing only adapter frames. Finished frames wait (`deferred`) while a gesture is in flight: bind `gestureListeners` (`AsyncGraphGestureListeners`: `onGestureStart(gesture: GraphGesture)` and `onGestureEnd(gesture: GraphGestureEnd)`, frozen, of stable identity) to NetworkGraph with `v-bind="graph.gestureListeners"` or spread them into `h(NetworkGraph, props)`; the composable counts started gestures that have not ended, ignoring an end without a start. The `gesture` option (a boolean ref or getter) still holds frames for gestures the application tracks itself; `gesturing` is true while either holds them. A frame that finished during the gesture is shown when it ends, unless the input changed in the meantime.
- `graphLayoutWorkerAdapter(port: GraphLayoutWorkerPort, options?: { transport?: 'clone' | 'json' })` makes an adapter that talks to a Worker the caller created.
- Types: `AsyncGraphLayoutAdapter`, `AsyncGraphFrame`, `AsyncGraphDisplayFrame`, `AsyncGraphLayoutError`, `UseAsyncGraphLayoutOptions`, `AsyncGraphLayout`, `AsyncGraphGestureListeners`, `GraphLayoutWorkerPort`, `GraphLayoutWorkerAdapterOptions`.

## Typed fields and timeline views

`TimelineColumn.field` is an optional `TimelineFieldSpec` (`id`, `kind`, raw getter `get`, optional `parse`, `format`, `required`, `choices`, `multiple`, `min`, `max`, `integer`, `allowNegative`, `timeZone`, `utcOffsetMinutes`, `durationBasis`, `unitSize`, `unitLabel`). Columns without it behave as before. `kind` is `'text'`, `'number'`, `'time'`, `'duration'`, `'select'` or `'checkbox'`; `FieldValue` is a string, number, boolean, `null` or an array of those (multiple selection). `TimelineFieldEdit<R>` describes a typed change (`rowId`, `columnId`, `fieldId`, `before`, `after`, `source`). GanttChart emits it through `field-edit`; see [Timeline columns and rollups](#timeline-columns-and-rollups).

Core helpers in `vue-weave/core`:

- `parseFieldValue(spec, text)` returns `{ ok: true, value }` or `{ ok: false, code, error }`. Blank text is `null` (or a `required` error); `0` and negative numbers are values. Error codes are `required`, `invalid`, `negative`, `range`, `integer`, `choice`, `time-zone` and `custom`.
- `validateFieldValue(spec, value)` checks a value with the same rules and returns `{ ok: true }` or an error. `null` and `[]` are empty.
- `formatFieldValue(spec, value)` returns editor text; `fieldValuesEqual(a, b)` compares values.
- Built-in `time` parsing reads `YYYY-MM-DD[ T]HH:mm[:ss[.SSS]]` with the spec's IANA `timeZone` (daylight saving applied) or fixed `utcOffsetMinutes`, or a `Z`/`±HH:MM` written in the text. It never uses the runtime's time zone or `Date.parse`. Without either, supply `parse` and `format`; otherwise parsing returns `time-zone`. `duration` values are in model units; `unitSize` converts the typed number and `durationBasis` (`'elapsed'` or `'working'`) states what is edited. Negative durations need `allowNegative`.

Timeline view state (`TimelineViewState`, version 1) is JSON-safe: column order, visibility and width, a search (`text`, optional `columnIds`), sort entries (`ruleId`, `direction`), `collapsedIds`, `window` and a `zoom` preset ID. It holds no functions, DOM state or drafts.

- `createTimelineViewState(columns?, patch?)`, `parseTimelineViewState(json)` (throws on a malformed value), `reconcileTimelineViewColumns(state, columns)` and `resolveTimelineColumns(state, columns)`. Unknown column IDs are dropped with an `unknown-column` diagnostic. Columns the state has not seen are appended after the known ones, visible, in declared order (`new-column`).
- `projectTimelineView(input, state)` takes `{ rows, bars, dependencies?, columns?, sortRules?, laneCount? }` and returns display copies plus `matchedRowIds`, `removedDependencyIds`, `removedDependencyCount`, `hiddenTargets` (hidden bars that a shown bar still depends on or feeds), `wbs`, `collapsedIds`, `window`, `zoom` and `diagnostics`. Matching rows keep their ancestors; siblings are sorted stably, with ties in the original order; dependencies to hidden bars are removed. The output passes `validateTimelineData`. The input is not changed. A sort `ruleId` is a registered compare rule or a column ID.
- `projectTimelineView` computes `wbs` with `timelineWbsCodes` from the original, unfiltered rows.

`useTimelineView(source, initial?)` (Vue entry) wraps this reactively. It returns `state`, `projection` (pass its `rows`, `bars` and `dependencies` to GanttChart), `columns` (the visible `TimelineColumn<R>` array in saved order with saved widths, ready for the `columns` prop), `diagnostics` (saved-view problems, column problems included), `setSearch`, `setSort`, `setColumnVisible`, `setColumnWidth`, `moveColumn`, `toggleCollapsed`, `setWindow`, `restore(json)`, `reset()` and `snapshot()`. Compute schedules, loads and diagnostics from the full input, not from the projection.

## Application undo and redo

Import `useEditHistory(initial, limit = 100)` from the Vue entry point. It returns `state`, `canUndo`, `canRedo`, `commit`, `undo`, `redo` and `reset`. The limit is the maximum number of undo steps and must be a positive integer; invalid limits throw `RangeError`.

Pass a complete immutable snapshot to `commit` after accepting an edit. Snapshots are stored by reference, without cloning or freezing; do not mutate them after committing. Committing the current snapshot reference does nothing. A batch move or endpoint replacement can be one history entry. Committing after an undo discards the redo branch. `undo` and `redo` do nothing when unavailable; `reset(snapshot)` replaces the history and clears both branches. Persist accepted changes through the application storage layer.

### Edit transactions and asynchronous saving

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

## Versioned JSON snapshots

`vue-weave/core` stores and restores a chart's data and saved view as a versioned JSON document (`schemaVersion: 1`). It is pure TypeScript and does not touch the DOM or the network. Nothing is written for you: you decide where the text goes.

| Function | Contract |
| --- | --- |
| `serializeWeaveSnapshot(input, options?)` | Converts a `WeaveSnapshotInput` (Maps and Sets) to the stored form, validates it and returns JSON text. Throws `WeaveSnapshotError` (with `diagnostics`) for anything that cannot be stored. |
| `parseWeaveSnapshot(text, options?)` | Checks JSON syntax, version, structure and references and returns `{ ok: true, snapshot, diagnostics }` or `{ ok: false, diagnostics }`. `options.migrations` maps an old `schemaVersion` to a function that returns the next document. Never throws for bad input. |
| `restoreWeaveSnapshot(snapshot, registry?)` | Builds live values (Maps, Sets, decoded data, resolved layouts and columns). All or nothing: on any error there is no `snapshot` in the result. |

`WeaveSnapshotV1` is a union on `kind`:

| `kind` | `data` | `view` |
| --- | --- | --- |
| `'graph'` | `nodes`, `edges`, optional `groups`, `positions` and `sizes` (as `[id, value]` entries) | `view.graph`: `camera` (`{ center, scale }` in graph coordinates, independent of the container size), `collapsedGroupIds`, `layout` (`{ id, options }`) |
| `'timeline'` | `rows`, `bars`, optional `dependencies`, `range`, `timeUnit` (`{ id, origin? }`; omitted means epoch milliseconds) | `view.timeline` |
| `'planning'` | The input of `levelResources` (`range`, `quantum`, `calendars`, `tasks`, `dependencies`, `resources`, `assignments`, ...), plus optional `placements` and `display` | `view.timeline` |

`view.timeline` holds `window`, `scroll` (`{ time, rowId }`), `zoom` (`{ zoom, preset }`), `columns` (`id`, `registryId`, `visible`, `width`, `editorId`, `rendererId`, in display order), `search`, `sort` (`columnId`, `direction`, `comparatorId`) and `collapsedRowIds`. Functions are never stored: columns, comparators, layouts, editors and renderers are stored by name and resolved from the `registry` on restore. `extensions` holds your own JSON under names you choose. `metadata` takes `title`, `savedAt` and `sourceVersion`; `savedAt` is only what you pass, so fixed metadata gives identical text for identical input. `sourceVersion` is a reference to where the snapshot came from and is not the current version of any server.

Rules the functions enforce:

- NaN, Infinity, functions, symbols, class instances and other non-JSON values fail instead of being dropped or turned into `null`. Application data that is not JSON (Date, BigInt, Map) needs a `SnapshotCodec` (`{ id, version?, matches, encode, decode }`), stored as `{ "$codec", "version", "value" }`. The key `$codec` is reserved. A codec that is missing on restore fails the restore.
- Map entries and Set members are checked before a Map or Set is built: a repeated node ID in `positions` or `sizes` is an error, not a last-one-wins merge. Entries must name existing nodes.
- IDs must be unique per collection. Edges, ports, group members, parent rows, dependency endpoints, assignments and saved-view IDs must refer to existing items. Assignments have no ID; the pair `(taskId, resourceId)` must be unique. Use business task IDs, never the IDs of projected rows.
- Planning input is validated by the same rules as `scheduleTasks`. A dependency cycle or an infeasible plan is not invalid JSON: it is returned as a `schedule-cycle` or `schedule-infeasible` warning, and `restored.schedule` is that result.
- Unknown fields in the document, `data` and `view` objects are errors; put your own data in `extensions`. Unknown versions fail. Only `schemaVersion` 1 exists; migrations are for your own older documents.
- `registry.onMissing: 'fallback'` turns a missing layout, column, editor, renderer or comparator from an error into a warning and uses the default display. The default is `'fail'`.

`parseWeaveSnapshot` and `restoreWeaveSnapshot` report `SnapshotDiagnostic` items (`severity`, `code`, `path`, `message`). The graph and timeline types of the restored value are the ordinary `NetworkNode`, `GraphEdge`, `NetworkGroup`, `TimelineRow`, `TimelineBar` and `TimelineDependency`.

## Export to SVG and PNG

Both components expose two export methods on their template ref. They need no dependencies and never change props or component state.

| Method | Returns | Behavior |
| --- | --- | --- |
| exportSvg(options?) | string | A standalone SVG document (`xmlns`, explicit `width`, `height` and `viewBox`) of the whole chart |
| exportPng(options?) | Promise<Blob> | `exportSvg(options)` rasterized in the browser to an `image/png` blob |

The export always covers the whole content, not the viewport. NetworkGraph exports every node, edge, edge label and group, whatever the camera position and with or without `cullOffscreen`; nodes in `selectedIds` (or `selectedId`) use the selected style, and the nodes and edges of `highlightedNodeIds` and `highlightedEdgeIds` the highlight colour (`--vw-graph-highlight`). GanttChart exports every displayed row (descendants of collapsed rows are omitted, as on screen), the row heading column and `columns`, header bands and ticks, `nonWorkingPeriods` shading, bars with progress, segments, critical outlines, float lines, deadline indicators and late outlines, milestones, baselines (the sets selected by `baselineIds`, with their titles), scheduling constraint markers, summaries, dependencies (including `highlightedDependencyIds` and, with `summaryDependencies`, links to summary rows) and their lag labels, the `highlightedBarIds` outlines, markers, `markerRanges` bands and header labels, the now line, the status-date and progress lines and the load histogram rows, over the whole `range` at the current zoom and zoom preset. Colours are read from the `--vw-*` custom properties in effect on the component, and the font from its computed `font-family`.

The export uses the default rendering. Slot content (`node`, `edge`, `row`, `row-heading`, `cell`, `bar`, `tick`, `load-row`, `load-segment`) cannot be reproduced; use the label options below instead. Text is clipped to its box rather than ellipsized, and the width of marker labels is estimated. Hover, focus and pointer previews are not exported.

`GanttExportOptions<R, B>`: `timeRange` (export a narrower time window), `rowRange` (`{ start, end }`, half-open indices into the displayed rows after collapsing), `includeLoad` (default true), `includeStatusDate` (default true: the `statusDate` line and, with `showProgressLine`, the progress line), `background` (default true), `title`, `rowHeading` (defaults to `labels.rows`), `idPrefix`, `theme` (an `SvgExportThemeInput` that overrides the colours read from CSS), `barLabel(bar)` and `rowLabel(row)`. On a chart the callbacks receive its row and bar types R and B.

`GraphExportOptions<N, E>`: `padding` (default 16), `background` (default true), `title`, `idPrefix`, `theme`, `includeSelection` (default true), `includeHighlight` (default true: the current highlight props, resolved for collapsed groups as on screen), `nodeLabel(node)`, `nodeDetail(node)` and `edgeLabel(edge)`. On a graph the callbacks receive the nodes and edges it draws, `GraphShownNode<N, G>` and `GraphShownEdge<E, G>`.

`exportPng` additionally takes `scale` (`PngExportOptions`), the number of device pixels per CSS pixel: greater than 0 and at most 8, default 1. The PNG is `ceil(width × scale)` by `ceil(height × scale)` pixels. It must fit within 16,384 pixels per side and 268,435,456 pixels in total; otherwise the promise rejects with a `RangeError` that names the size. Invalid numeric options (for example a negative `padding`, an inverted `timeRange` or an out-of-range `rowRange`) throw a `RangeError` from `exportSvg` and reject the `exportPng` promise. `exportSvg` on a GanttChart whose input is invalid throws the current validation error. PNG export requires a browser (`Image`, `canvas`); call `exportSvg` or the core builders on a server.

```ts
const svg = chart.value!.exportSvg({ title: 'Plan', timeRange: { start, end } })
const png = await chart.value!.exportPng({ scale: 2 })
```

The core entry provides the same rendering without Vue or a DOM, for servers, workers and tests.

| Export | Purpose |
| --- | --- |
| renderGraphSvg(layout, nodes, edges, options?) | SVG document of a graph layout. `GraphSvgOptions<N, E>` adds `groups` (`GraphSvgGroup` rectangles), `selectedIds`, `highlightedNodeIds` and `highlightedEdgeIds` (a 3-unit node outline and a 2.6-unit edge with its own arrowhead, in `highlightColor`, default the theme's `dependencyHighlight`; without highlighted items the output is unchanged), `padding` and the label callbacks, which receive the node and edge types of the arguments, to the shared options. Node shapes, `markerStart` and `markerEnd` (markers with the IDs `<idPrefix>-<marker>` and `<idPrefix>-start-<marker>`, plus `-highlight` on highlighted edges, written only when used; hollow ones filled with `surfaceMuted`) and `animated` edges (dashed `6 4`, without motion) are drawn as NetworkGraph draws them; an unknown marker throws RangeError |
| renderTimelineSvg(rows, bars, dependencies, scale, options?) | SVG document of a timeline on any `TimeScale`. `TimelineSvgOptions` covers `collapsedIds`, `timeRange`, `rowRange`, `rowHeight` (66), `laneCount` (1), `labelWidth` (154), `columns`, `showSummaries`, `summaryDependencies` (as the GanttChart prop; needs `showSummaries`), `headerBands`, `markers`, `markerRanges` (validated as the GanttChart prop; drawn with each range's tone, or the `range`, `rangeLine` and `rangeInk` theme colours, at 0.7 fill opacity), `now`, `nowLabel`, `tickStep` or `tickSteps`, `tickAnchor`, `formatTime`, `rowHeading`, `loadRows`, `loadSegments`, `loadRowHeight` (44), `highlightedDependencyIds`, `dependencyStyle` (as the GanttChart prop, default `orthogonal`), `highlightedBarIds` (bars outlined in the `dependencyHighlight` theme colour, with the `vw-is-highlighted` class on their group), `nonWorkingPeriods`, `statusDate`, `statusDateLabel` (default "Status date"), `showProgressLine`, `formatLag` (default `formatDependencyLag`; labels each dependency with a non-zero `lag`), `baselineIds`, `baselineLabel` (default "Baseline" for `timelineBaselineId`, otherwise the set ID), `formatVariance` (default `formatDependencyLag`) and `varianceLabels` (`start`, `finish`, `duration`; defaults "start", "finish" and "duration"), which draw baseline sets as described in [Baseline sets](#baseline-sets), `constraintLabels` (text of each `TimelineConstraintKind` in marker titles; defaults as `GanttLabels`) and `constraintViolatedLabel` (default "violated"), `barLabel` and `rowLabel`; `columns` and the label callbacks receive the row and bar types of the arguments (`TimelineSvgOptions<R, B>`). Bar fields `critical`, `latestEnd`, `deadline`, `segments` and `constraints` are drawn as on screen |
| escapeXml(text) | Escape `& < > " '` and drop characters that XML 1.0 forbids |
| defaultSvgExportTheme | The stylesheet's fallback colours as an `SvgExportTheme` |
| mirrorTimeScale(scale) | A right-to-left copy of a `TimeScale`: range start maps to `width`, range end to 0 |

Shared `SvgExportOptions` are `theme` (`SvgExportThemeInput`: any of `surface`, `surfaceMuted`, `text`, `muted`, `border`, `grid`, `edge`, `accent`, `onSolid`, `markerInk` (marker and now-flag label text; default `#ffffff`, read from `--vw-marker-ink` by the component export methods), `baseline`, `baseline2` and `baseline3` (the second and third baseline slots, read from `--vw-baseline-2` and `--vw-baseline-3`; optional in `SvgExportTheme`), `marker`, `now`, `load`, `loadOverload`, `loadCapacity`, `dependencyHighlight`, `nonWorking`, `critical`, `float`, `deadline`, `status`, `constraint` and `constraintViolated` (read from `--vw-constraint` and `--vw-constraint-violated`), `range`, `rangeInk` and `rangeLine` (marker ranges without a tone, read from `--vw-range`, `--vw-range-ink` and `--vw-range-line`) and per-tone `ink`, `line`, `pale`, `solid`; the ten newest are optional in `SvgExportTheme` and always present in `defaultSvgExportTheme`), `fontFamily`, `title`, `background`, `idPrefix` (letters, digits, `_`, `.` and `-`; default `vw-export`) and `direction` (`ltr` or `rtl`). The builders validate their input like the components do and throw `RangeError` for invalid numbers or geometry and `Error` for bad references and IDs. All text and attribute values are escaped; the output contains no scripts, event attributes or external references.

## Right-to-left layout

Both components take an opt-in `dir` prop of type `ChartDirection`.

| Value | Behavior |
| --- | --- |
| `ltr` (default) | Unchanged left-to-right rendering. No `dir` attribute is written. |
| `rtl` | Writes `dir="rtl"` on the component root and adds the `vw-rtl` class. Server rendering already produces right-to-left markup. |
| `auto` | Writes no attribute and follows the CSS `direction` inherited by the component root, read after mounting, whenever `dir` changes and whenever an ancestor's `dir` attribute changes (observed with a `MutationObserver` while `dir` is `auto`). A change of direction cancels a gesture in flight. Direction changes made only through CSS are not observed. Server rendering and the first client render are left-to-right. |

In a right-to-left GanttChart the row heading column and `columns` sit on the right and time increases from right to left. Header bands, ticks, the grid, non-working shading, bars, progress, segments, float lines, deadline indicators, scheduling constraint markers and handles (their flags point the other way, towards the allowed times), baselines, summaries, markers, marker ranges and their header labels, the now line, the status-date and progress lines, dependency paths and lag label positions (the label text itself is not mirrored), link and reconnect handles and load histogram rows are mirrored. Positions are measured from the inline-start (right) edge, so `TimelineEdit` proposals, `validateEdit`, `scrollToTime(time)` (which puts `time` at the right edge of the time area), keeping the centered time on zoom and preset changes, pinch and wheel zoom anchoring, autoscroll near either edge and keyboard reveal all work in the same time units as in LTR. The scroll container uses the standard right-to-left convention in which `scrollLeft` is 0 at the start and negative after scrolling towards later times; browsers that report positive values are not supported. Switching direction cancels an in-flight gesture and keeps the time at the inline-start edge in view.

Keyboard editing follows the visual direction. In RTL, ArrowLeft moves a focused editable bar one `snap` later and ArrowRight one `snap` earlier. Shift with an arrow moves the end and Alt with an arrow moves the start, in the same visual direction (Shift+ArrowLeft makes the bar end later). Up and Down (with `rowDraggable`) are unchanged. Pointer drags follow the pointer: dragging left moves later. The start resize handle is on the right edge of a bar and the end handle on the left. When a dependency is dropped on a bar body, the right half picks the start and the left half the finish. The collapsed-row toggle shows ◂ instead of ▸.

In a right-to-left NetworkGraph only the chrome changes: the zoom tools and the minimap move to the bottom-left corner, node titles and details, group labels and edge labels are right-aligned with `direction: rtl`, and the default node text is anchored at the box's right edge. Layout geometry, edge routes, camera, panning keys and saved positions are unchanged; use `options.direction: 'RL'` to mirror the layout itself. Custom node slots own their own text alignment.

`exportSvg` and `exportPng` follow the component's direction. In the core, `renderTimelineSvg` and `renderGraphSvg` take `direction: 'rtl'`, and `mirrorTimeScale(scale)` returns a scale with `toX(range.start) = width` and `toX(range.end) = 0`; its round trips are exact whenever those of `scale` are and the pixel values are exactly representable.

## Typed data

`NetworkNode`, `GraphEdge`, `TimelineRow` and `TimelineBar` take the type of their optional `data` as a type parameter that defaults to `unknown`: `NetworkNode<D = unknown>`, `GraphEdge<D = unknown>`, `TimelineRow<D = unknown>` and `TimelineBar<D = unknown>`. Both components are generic over the whole item types, so extra fields that an application adds to its items (for example `NetworkNode<Owner> & { priority: number }`) reach the slots and callbacks as well. Vue infers the parameters from the props in a template; nothing is written at the component. Without type arguments every type is what it was before, with `unknown` data.

| Component | Type parameters | Inferred from | Where the items come back |
| --- | --- | --- | --- |
| NetworkGraph | `N extends NetworkNode = NetworkNode`, `E extends GraphEdge = GraphEdge`, `G extends NetworkGroup = never` | `nodes`, `edges`, `groups` | `node`, `edge`, `tooltip`, `node-toolbar`, `edge-toolbar`, `group` and `minimap-node` slot props, `layout`, the `exportSvg` and `exportPng` label callbacks |
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
