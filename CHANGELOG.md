# Changelog

## Unreleased

The next release is a minor release (0.5.0) because of the two type changes under "Breaking changes": TypeScript code that lists every value of `ScheduleReasonKind` or `PlanningDiagnosticCode` needs a new case. Code that runs today behaves the same, since the new values only appear once a plan uses manual tasks. Everything else is additive and opt-in: without the new fields, props and options, results, server markup, routes, exports and accessible names are the same as in 0.4.0.

### Breaking changes

- `ScheduleReasonKind` gains `'manual'`, used in traces (`{ explain: true }`) for the dates of manual tasks.
- `PlanningDiagnosticCode` gains `'manual-conflict'`. `toPlanningDiagnostics` lists each entry of `manualConflicts` as a warning with the task and the link, before unresolved tasks and overloads; with `explain`, its `reasonIds` name the task's `manual` reason. A result without manual conflicts gives the same list as before.

A `switch` or `Record` over every value of either union needs an entry for the new value.

### Added

#### NetworkGraph

- Node shapes: `NetworkNode.shape` accepts `'diamond'`, `'ellipse'` and `'hexagon'` besides `'box'` and `'rounded'` (exported `NetworkNodeShape`). They are drawn inside the node box (class `vw-node-shape`) with centred text and painted like the node rectangle in every state, in the dark theme and in forced colors; `exportSvg`, `exportPng` and `renderGraphSvg` draw them too. Straight edges, and edges routed through waypoints or spread as parallel edges, end on the outline; ports, layout paths and connection handles stay on the box sides.
- Edge markers: `GraphEdge.markerEnd` (default `'arrow'`, unchanged) and `GraphEdge.markerStart` (default `'none'`) take a `GraphEdgeMarker`: `'arrow'`, `'open-arrow'`, hollow `'circle'` and `'diamond'`, `'bar'` or `'none'`. They follow the edge colour, also on highlighted edges and in exports, and their definitions are written only when an edge uses them. Hollow markers are filled with `--vw-surface-muted`.
- `GraphEdge.animated`: a dash pattern that flows toward the target (class `vw-is-animated`, speed `--vw-edge-animation-duration`, default `1s`). It stands still under `prefers-reduced-motion: reduce` and in print; exports draw it dashed.
- `GraphEdge.edgeStyle` overrides the `edgeStyle` prop and the `style` option of `routeGraphEdges` for one edge.
- `parallelEdgeSpacing` (NetworkGraph) and `parallelSpacing` (`routeGraphEdges`): edges between the same two nodes, in either direction, without waypoints or named ports, are spread around the centre line in every edge style, and several self-loops of one node are nested. With `routingPolicy: 'preserve'`, kept layout paths are not spread. Invalid spacing throws `RangeError`.
- `collapseGraphGroups` (and so collapsed groups in NetworkGraph) keeps `edgeStyle`, `markerStart`, `markerEnd` and `animated` on an edge that merges several edges when all of them have the same value, as it already did for the label.
- `layoutCircularGraph`, `layoutGridGraph` and `layoutConcentricGraph` (with `GraphCircularLayoutOptions`, `GraphGridLayoutOptions` and `GraphConcentricLayoutOptions`) for the `layout` prop. Circular places nodes on one circle in input or `sort` order with a radius that keeps `nodeGap` between neighbours; grid fills rows of `columns`; concentric places nodes on rings by `level(node, degree)` (the degree by default, higher levels inside, optional `levelWidth` buckets). They are deterministic and linear apart from the ring sort, draw straight edges and never let boxes overlap. `sort` and `level` receive the caller's node type.

#### GanttChart

- `TimelineBar.description`: your own text about a bar, for example "Manually scheduled" or "Inactive". It comes first in the bar's accessible description, before the critical, float, deadline, constraint and baseline facts, and after the dates in its native `title`; `exportSvg`, `exportPng` and `renderTimelineSvg` add it to the bar's `<title>`. The accessible name is unchanged, blank text is ignored, and a value that is not a string is reported through `validation-error`. The scheduling demo uses it for its manual and inactive bars.

#### Graph analysis (`vue-weave/core`)

- `graphComponents` (weakly connected components), `graphDegreeCentrality`, `graphBetweennessCentrality` (Brandes, optional edge lengths), `graphPageRank` (returns `{ scores, iterations, converged }`) and `detectGraphCommunities` (deterministic Louvain with modularity and a `resolution`). `graphCommunityGroups` turns communities into `NetworkGraph` `groups`. All validate input like the other graph helpers, iterate instead of recursing and never mutate their arguments.

#### Scheduling

- `ScheduleTask.manual`: manually scheduled dates, as in Microsoft Project. `scheduleTasks`, `levelResources` (which reserves their capacity first and never moves them), `rescheduleFromStatusDate` and `propagateEdit` (where an edit moves the dates) keep them. Links into a manual task bind nothing but still count for cycles; each link its dates violate is listed in `ScheduleSuccess.manualConflicts` (`ScheduleManualConflict`). Results mark these tasks with `ScheduledTask.manual`; they have no float and are never critical. A manual task that ends after `deadline` makes the plan infeasible.
- `ScheduleTask.inactive`: the task, its links and its resource assignments take no part in any calculation; it is left out of the result's `tasks` and listed in `ScheduleSuccess.inactiveTaskIds`. `calculateResourceLoad` accepts `{ inactiveTaskIds }` (`ResourceLoadOptions`), and `scheduleToGraph` and `buildPlacementInput` skip links that the scheduler ignores.

#### Interchange

- `fromMsProjectXml` reads Microsoft Project XML (MSPDI): tasks with outline levels, percent complete, milestones, summary, manual and active flags, durations, constraints and baselines, and links with their types and lags. It uses a small loop-based reader without a DOM that skips a DOCTYPE, never expands declared entities and throws with the line and column of malformed XML; what it cannot import (calendars, resources, assignments, unknown constraint types, percentage lags) is reported in `warnings`. Working-time lags are read as elapsed time, with a warning.
- `timelineFromMsProject` turns a plan into GanttChart rows, bars, named baselines and dependencies; summary tasks become parent rows without bars.
- Must Finish On (`ConstraintType` 3) is imported as `finishNoEarlierThan` plus `finishNoLaterThan` at its date, and `toMsProjectXml` writes that pair at one time as `ConstraintType` 3, so it survives a round trip. Other combinations of two or more constraints are still not written.
- `MsProjectTask.inactive` and `MsProjectTask.manual` write `Active` 0 and `Manual` 0. The default export is unchanged, and `toMsProjectXml(fromMsProjectXml(toMsProjectXml(plan)))` reproduces the document.

### Fixed

- `calculateResourceLoad` and `levelResources` name the unknown resource or task in an assignment instead of throwing "Unknown task or resource in assignment"; the load error also points to `options.inactiveTaskIds` for tasks that a schedule result leaves out as inactive. Code that matched the old message text must change.

### Examples

- New **Diagram styles** demo: an order-fulfilment diagram placed with `positions` that uses every node shape and edge marker, an animated main path, a loop-back with its own `edgeStyle` and a request/response pair spread by `parallelEdgeSpacing`, with **Spread parallel edges**, spacing, **Animate main path** and **Edge style** controls, SVG and PNG export and a legend.
- New **Graph analysis** demo: a seeded 142-node supplier network laid out with `layoutForceGraph`, with a summary of components, communities and modularity, **Group communities** with **Collapse all** and **Expand all**, and **Rank by** degree, betweenness or PageRank, which highlights the top five nodes and lists them to focus.
- The scheduling demo gains **Schedule inspection manually**, which pins inspection with `manual` dates, moves them through `propagateEdit` and lists broken links under **Manual date conflicts**, and **Cancel order B (inactive)**, which keeps a placeholder bar while the order's links, load and network-diagram node drop out; the Microsoft Project export writes it with `Active` 0 and iCalendar leaves it out.
- The graph demo's **Graph layout** select offers `circular`, `grid` and `concentric`. Like `force`, circular and concentric are offered for up to 1,000 nodes; the large graph falls back to the layered layout.
- The timeline editing demo gains **Import MS Project XML** next to **Import CSV**, replacing the plan as one undoable step. Milestones no longer make the demo's resource load throw.
- `Start.cmd` rebuilds the demo before serving it when `preview/` is missing or was built from other sources, and runs `npm ci` first when `node_modules` does not match `package-lock.json`. If a rebuild fails, it shows the previous build with a warning. `npm run build:demo` now writes `preview/demo-build.json` to record which sources the build came from; `npm start` and the browser tests still serve `preview/` as it is. Release preparation checks that the archived demo matches its archived sources.

## 0.4.0 - 2026-11-16

The edge slot change below is the only breaking change; everything else is additive or opt-in.

### Breaking changes

- NetworkGraph `edge` slot: `selected` is now the edge selection (`selectedEdgeIds` with `edgesSelectable`). It used to carry the related state; read the new `related` slot prop for that. Default edges, events and accessible names are unchanged.

### Added

- NetworkGraph `unstyledNodeSlots`: keeps the stylesheet's fill and stroke rules off the content of a `node` slot (`vw-is-unstyled`), so `fill` and `stroke` attributes in the slot take effect. Without the prop, rendering is unchanged.
- NetworkGraph slot props `related` and `highlighted` on the `node` and `edge` slots, and the exported `NetworkEdgeSlot` type.
- GanttChart `dependencyStyle` (`orthogonal`, `rounded`, `curve`), core `DependencyPathStyle`, a `style` argument of `dependencyPath` and a `dependencyStyle` option of `renderTimelineSvg`; the export methods follow the prop. The default output is unchanged.
- GanttChart `stickyBandLabels`: header band labels stay in view while the timeline scrolls.
- GanttChart `select` passes a second argument, `TimelineSelectDetail` with `dragged`, so a click that ends a drag can be told apart from a plain click. Existing one-argument handlers keep working.

### Fixed

- GanttChart no longer shows the native bar `title` next to the `tooltip` slot, as NetworkGraph already did.
- GanttChart milestones with `bar` slot content draw their diamond behind the content (`vw-has-slot`) instead of clipping it.

### Examples

- New **Design gallery** in the demo: a workflow builder, a database schema diagram, an org chart, a product roadmap, a sprint plan and a room booking calendar, each with its own visual design built only from the existing slots, `--vw-*` theme variables and `vw-` classes. The showcases are in `examples/showcase/` and are not part of the package; they use the additions above.

## 0.3.0 - 2026-11-15

Everything below is additive and opt-in: without the new props, options and functions, rendering, accessible names, events and results are the same as in 0.2.0. There are no breaking changes.

### Added

#### Linked views

- Core types `EntityRef`, `ViewTarget` (`GraphViewTarget`, `LoadViewTarget`) and `ViewBinding`, and helpers `buildViewBindingIndex`, `resolveViewTargets`, `resolveEntityRefs` and `resolveLoadTargets`. IDs are paired with their kind, so a task and a resource with the same ID never mix. Load targets are resource time ranges matched by overlap; a range that overlaps no current segment is reported as unknown, never moved to another segment.
- Core `traverseGraph` (directional, hop-limited, iterative walk returning node and edge IDs and unknown start IDs) and `resolveCollapsedTargets` (maps node and edge IDs to the proxies and merged edges of a `collapseGraphGroups` result).
- `useLinkedSelection` composable: the view the user acts in owns the selection, the other views get display-only highlight sets (graph, timeline and load), repeating a selection is a no-op so event wiring cannot loop, and hover enter and leave are tracked.
- `revealLinkedTarget` (Vue entry): reveals an item and, when a collapsed group or row hides it, asks the application to expand it, waits for the render and reveals again; a declined expansion is never reported as revealed.
- NetworkGraph `highlightedNodeIds` and `highlightedEdgeIds` and GanttChart `highlightedBarIds`: display-only highlights (`vw-is-highlighted`; `--vw-graph-highlight`, `--vw-bar-highlight`) that never join the selection, deletion, batch moves or copies and do not cancel gestures. Graph highlights resolve to proxies and merged edges of collapsed groups.
- GanttChart `highlightedLoadTargets` and `selectedLoadTargets`: mark the load segments that overlap resource time ranges (`--vw-load-highlight`, `--vw-load-selected`; `aria-pressed` with `loadSelectable`).
- GanttChart `loadSelectable`: load segments become focusable buttons with the same accessible names (`--vw-load-focus`).
- `target-enter`, `target-leave` and `target-activate` events (`ViewTargetEvent`) on both components: nodes, edges and groups; bars, dependencies, rows and, with `loadSelectable`, load segments; by pointer and keyboard. Existing event payloads are unchanged.
- NetworkGraph `revealNode(id, options?)` and GanttChart `revealBar(id, options?)`: move the camera or scroll to an item, then optionally focus it once it is rendered, resolving a `RevealResult` (`revealed`, `hidden-by-collapse` with the visible proxy, or `unknown`) without throwing. `focusNode`, `scrollToRow` and `fitToBars` are unchanged. Types `RevealStatus`, `RevealOptions`, `RevealResult`.
- NetworkGraph `getTargetClientRect(target)` (on-screen rectangle of a node, edge or group) and `setViewportCenter(center, scale?)` (restores a camera saved with `getViewportCenter()` in a container of any size).
- `renderGraphSvg` options `highlightedNodeIds`, `highlightedEdgeIds` and `highlightColor`, `renderTimelineSvg` option `highlightedBarIds`; the component export methods pass the current highlights (`includeHighlight`, default true).

#### Resource timelines and unplanned tasks

- `projectResourceTimeline`, `createResourceTimelineProjector` and `resourceTimelineBarId`: show a task once per assigned resource in GanttChart, with lanes, distinct labels, one chart link per task link and maps back to tasks and links. Load is computed from the tasks, so it is not multiplied by the number of rows.
- `resolveResourceTimelineEdit` and `resolveResourceTimelineEdits` turn resource-row edits into one date change per task and assignment replacements, rejecting stale, conflicting and duplicate assignments; `resourceTimelineCascade` maps `propagateEdit` to every projection; `proposeResourceAssignment` checks adding, removing and replacing assignments.
- `buildPlacementInput` builds a schedulable input from the placed tasks only and reports unplaced predecessors as diagnostics instead of throwing.
- GanttChart `droppable` and `bar-drop` (`TimelineDrop`, Vue entry): external HTML drops reported with the row and snapped time as a proposal.

#### Planning explanations

- `scheduleTasks(input, { explain: true })` and `levelResources(input, { explain: true })` add a `trace` (`ScheduleTrace`) of structured reasons: dependencies with their lag, constraints, project bounds, calendar time off, pauses and, for leveling, the resources, intervals and holding tasks that delayed a task. Overloads type `trace` only for `explain: true`; results without the option are unchanged.
- `collectScheduleReasons(trace, taskId, options?)` follows a task's reasons to their causes iteratively, visiting shared causes once.
- `toPlanningDiagnostics(result, load?)` lists cycles, infeasible tasks, unresolved leveling and overloaded load segments as `PlanningDiagnostic` entries with language-independent IDs and codes and `EntityRef` targets.

#### Asynchronous layouts and routing

- `useAsyncGraphLayout` and `graphLayoutWorkerAdapter` (Vue entry): layouts from a Worker or any asynchronous engine, shown only as complete frames of one input; stale and superseded results are dropped, results wait while a gesture is in flight, the `layout` function keeps its identity, new edges are drawn with temporary routes until the engine answers, and nothing runs during server rendering.
- NetworkGraph `gesture-start` and `gesture-end` events (`GraphGesture`, `GraphGestureEnd`, `GraphGestureKind`): one `gesture-end` for every `gesture-start`, after any proposal, with `outcome` `'committed'` or `'cancelled'`, for the gestures a new layout would cancel (node and multi-node drags, resize and waypoint drags, connections and reconnections from arming to completion, box selection, background pan and pinch). `useAsyncGraphLayout` returns `gestureListeners` to bind with `v-bind`, so results wait during a gesture without pointer listeners around the graph, and `gesturing`. The `gesture` option keeps working.
- Core `buildGraphLayoutRequests`, `graphLayoutInputKey`, `validateGraphLayoutResponse`, `completeGraphLayout` and Worker message helpers (`parseGraphLayoutMessage`, `graphLayoutToJson`, `graphLayoutFromJson`, `graphLayoutMessageToJson`, `graphLayoutMessageFromJson`).
- NetworkGraph `routingPolicy` (default `'builtin'`, unchanged) and the `policy` option of `routeGraphPorts` and `routeGraphEdges`: `'preserve'` keeps the layout's own routes, also for edges with named ports and in the orthogonal and straight styles, while they fit their boxes and ports (`isGraphRouteValid`). `GraphLayout` gains an optional `routes` map of route metadata, carried through the positioning and routing functions.

#### Typed editing, search and saved views

- `TimelineColumn.field` (`TimelineFieldSpec`): GanttChart columns with a field propose checked values through `field-edit` (validated by `validateFieldEdit`, rejected through `field-edit-rejected`), edited in the new `cell-editor` slot or a built-in input that parses with the field. Columns without `field` keep `cell-edit`, and a `cell` slot still owns the cell.
- Core `parseFieldValue`, `validateFieldValue`, `formatFieldValue` and `fieldValuesEqual` for text, number, time (explicit time zone or offset), duration, select and checkbox fields.
- GanttChart `edit-cancel` event (`TimelineEditCancel`): why an in-flight gesture, armed connection or cell editor was cancelled (`escape`, `pointer-cancel`, `source-changed`, `hidden`, `api`).
- Core timeline views: `createTimelineViewState`, `parseTimelineViewState`, `reconcileTimelineViewColumns`, `resolveTimelineColumns` and `projectTimelineView` search, sort and arrange columns on a display copy that keeps ancestors, drops dependencies to hidden bars and keeps WBS codes from the original rows. `useTimelineView` wraps them reactively.

#### Saving, history and snapshots

- `useEditTransaction` (Vue entry) and core `createTransactionState`, `beginTransaction`, `settleTransaction`, `refreshTransactionState` and `clearTransactionResult`: saves one document at a time through an application adapter, keeps the accepted state apart from the state being saved, distinguishes accepted, rejected, conflict, uncertain, busy, invalid and discarded outcomes, and sends undo and redo as snapshot restores that move the history only when accepted.
- `useEditHistory` returns `peekUndo()`, `peekRedo()` and `replaceCurrent(snapshot)` in addition to its existing members.
- `serializeWeaveSnapshot`, `parseWeaveSnapshot` and `restoreWeaveSnapshot`: a versioned JSON snapshot (`WeaveSnapshotV1`) of graph, timeline or planning data and the saved view, validated before anything is restored, with migrations passed as options, codecs for non-JSON data and registries for layouts, columns, editors and comparators. `WeaveSnapshotError`, `SnapshotCodec`, `SnapshotDiagnostic` and the input, stored and restored types.

#### Examples

- New demos: linked views, asynchronous layout, resource planning with unplanned tasks, and saved editing against a simulated server. The backlog, inspector, diagnostics list, context toolbar, typed cell editors and save-status display are reference implementations in `examples/components/` and are not part of the package.

### Changed

- NetworkGraph no longer cancels a gesture in flight when the `layout` function returns a new object with the same geometry (boxes, paths, label anchors, size and route metadata) for unchanged inputs. A layout whose geometry changed still cancels it.
- The persistence guidance in docs/integration.md now serialises saves per document instead of per bar.

## 0.2.0 - 2026-11-15

### Breaking changes

- The state and variant classes that `NetworkGraph` and `GanttChart` put on their elements now use the `vw-is-` prefix, so every class the components emit starts with `vw-` and host utility classes (for example Tailwind's `outline` or Bootstrap's `active`) no longer restyle chart elements. Rename them in custom stylesheets, test selectors and DOM queries:
  `selected` → `vw-is-selected`, `related` → `vw-is-related`, `highlighted` → `vw-is-highlighted`, `active` → `vw-is-active`, `panning` → `vw-is-panning`, `draggable` → `vw-is-draggable`, `collapsed` → `vw-is-collapsed`, `solid` → `vw-is-solid`, `outline` → `vw-is-outline`, `editable` → `vw-is-editable`, `dragging` → `vw-is-dragging`, `milestone` → `vw-is-milestone`, `first` → `vw-is-first`, `last` → `vw-is-last`, `start` → `vw-is-start`, `finish` → `vw-is-finish`, `end` → `vw-is-end`, `overloaded` → `vw-is-overloaded`, `idle` → `vw-is-idle`. Tone (`vw-tone-*`), theme (`vw-theme-*`) and other `vw-` classes are unchanged. See "Class names" in docs/integration.md.
- `rescheduleFromStatusDate` now drops only FS and SS dependencies into started tasks. FF and SF dependencies into a partly done task still apply, with their lag: when the remaining work would finish before a dependency allows, it resumes later and the task is split. A dependency that cannot be met returns an `infeasible` failure naming it. Completed tasks still ignore every incoming dependency.
- `validateTimelineData` now throws an `Error` for a dependency from a bar to itself, naming the dependency and the bar. GanttChart reports such data through `validation-error` and renders its empty state, and `renderTimelineSvg` throws. `scheduleTasks` still reports a self-link as a `cycle` failure.
- `scheduleToGraph` throws an Error for a dependency from a task to itself instead of returning a self-loop edge.
- `toMsProjectXml` throws an Error for a dependency from a task to itself instead of writing the task as its own predecessor, which Microsoft Project rejects.

### Added

- `calendarBands` accepts an IANA `timeZone` option. Day, week, month and year bands start at local midnight and hour bands follow local hours across daylight-saving transitions, so GanttChart `headerBands` no longer drift by an hour. Combining it with `utcOffsetMinutes`, or passing an unknown zone, throws a RangeError.
- The `calendarBands` `label` callback receives a third argument, `CalendarBandLocalTime`, with the local date, time, weekday and UTC offset of the band start.
- GanttChart: optional `TimelineDependency.lag` (in chart time units; negative for a lead). A non-zero lag is drawn as a `vw-gantt-lag` label on the connector, added to the dependency's accessible description (`labels.lag`, default "Lag") and exported by `exportSvg`, `exportPng` and `renderTimelineSvg`. `formatLag` (new core helper `formatDependencyLag`, signed hours such as `+2 h`) formats it. `reconnect` proposals keep the lag (`TimelineConnection.lag`). `validateTimelineData` rejects a non-finite lag with a RangeError. Dependencies without a lag render exactly as before.
- GanttChart: opt-in `wheelZoom` prop. Ctrl+wheel or Meta+wheel, including trackpad pinches, zooms the time axis between 65% and 300% around the pointer, with the same events as pinch zoom; a plain wheel keeps scrolling.
- `NetworkNode`, `GraphEdge`, `TimelineRow` and `TimelineBar` take the type of their `data` as an optional type parameter (`NetworkNode<MyData>`); the default stays `unknown`.
- `NetworkGraph` and `GanttChart` are generic over their item types, which are inferred from `nodes`/`edges`/`groups` and `rows`/`bars`. Slot props, `layout`, `columns` callbacks, `creatable` and the export label callbacks receive the typed items, including extra fields, without casts. Unannotated item arrays are now inferred precisely, so a comparison that the inferred `data` type rules out is reported by the type checker.
- `TimelineColumn`, `NetworkNodeSlot`, `NetworkTooltipSlot`, `GraphLayoutFunction`, `GraphExportOptions`, `GanttExportOptions`, their PNG variants, `GraphSvgOptions` and `TimelineSvgOptions` take item type parameters. `renderGraphSvg`, `renderTimelineSvg` and `createTimelineRowTree` keep the caller's item types.
- New types `NetworkGraphExposed` and `GanttChartExposed` for typed template refs, `NetworkGraphComponent` and `GanttChartComponent`, and `GraphCollapsedNode`, `GraphShownNode` and `GraphShownEdge` for the proxy nodes and merged edges of collapsed groups. `InstanceType<typeof NetworkGraph>` keeps working with the default item types.
- Multiple baselines: `TimelineBar.baselines` (named `TimelineBaseline` sets such as `plan` and `rev1`) next to the single `baseline`, which is the set `timelineBaselineId`. GanttChart `baselineIds` selects up to three sets (`timelineBaselineLimit`) and their order, `baselineLabel` names them and `formatVariance` formats their variance; two or three sets are drawn as stacked 3 px strips (`vw-gantt-baseline-1/-2/-3`, `--vw-baseline`, `--vw-baseline-2`, `--vw-baseline-3`, `data-vw-baseline`) that the bars make room for, so row heights do not change. Each set and its variance is added to the strip title and the bar description (new `GanttLabels` `baselineStart`, `baselineFinish`, `baselineDuration`). Charts with only `baseline` render as before.
- Core helpers `baselineVariance`, `timelineBaseline` and `timelineBaselineIds`; `renderTimelineSvg`, `exportSvg` and `exportPng` draw the selected sets (options `baselineIds`, `baselineLabel`, `formatVariance`, `varianceLabels`; theme `baseline2`, `baseline3`).
- `toMsProjectXml` writes task baselines (`MsProjectTask.baselines`, `MsProjectBaseline` numbers 0–10) as MSPDI `Baseline` elements.
- `scheduleToGraph` shows a non-zero dependency `lag` in the edge label (for example `+2 h` or `SS −0.5 h`), formatted by the new `formatLag` option (default `formatDependencyLag`), and returns it as `data.lag`. Links without lag are unchanged. A lag that is not a finite number now throws a RangeError.
- Dependency lag labels are drawn in their own layer above marker, now and status-date lines (in GanttChart and `renderTimelineSvg`), so a line crossing a label does not cover its text.
- GanttChart: scheduling constraints on bars (`TimelineBar.constraints`: `startNoEarlierThan`, `startNoLaterThan`, `finishNoEarlierThan`, `finishNoLaterThan`, `fixedStart`, named as in `ScheduleTask`) are drawn as markers that show their kind, direction and a violated state, are added to the bar's description and are exported by `exportSvg`, `exportPng` and `renderTimelineSvg` (`--vw-constraint`, `--vw-constraint-violated`).
- GanttChart: opt-in `constraintsEditable` turns the constraints of editable bars into slider handles that propose moves and removals by pointer or keyboard through `constraint-edit`, checked by `validateConstraintEdit`; a rejected change emits `constraint-edit-rejected`.
- Core: `applyTimelineConstraintEdit`, `timelineConstraints`, `timelineConstraintViolated` and `timelineConstraintKinds`; `toMsProjectXml` writes a task's single constraint as `ConstraintType` and `ConstraintDate` (`MsProjectTask.constraints`).

### Changed

- **Behaviour change:** NetworkGraph keeps a camera the user or the API placed (pan, zoom, minimap, keyboard pan, auto-pan, pinch, `setViewport`, `focusNode`, `fit({ ids })`) when the parent applies a structural change such as `connect`, `delete`, paste, duplicate or a group collapse or expand. It still re-fits while the camera is in automatic fit mode, when the `layout` function or layout `options` change, and when the graph is replaced (it was or becomes empty, or none of the previous node IDs remain). If a smaller graph raises the minimum zoom, a kept camera is clamped to it.
- `invertWorkPeriods` accepts finite non-integer periods and ranges. `normalizeWorkPeriods` and scheduling still require safe integers.
- `buildWorkPeriods` accepts fixed UTC offsets up to ±1080 minutes (previously ±840), the same limit as `calendarBands` and `toMsProjectXml`.
- `ResourceLoadSegment.taskIds` arrays are shared between segments with the same active tasks; treat them as read-only, as their type says.
- NetworkGraph renders each node, edge, minimap rectangle, connection handle and group frame as a lightweight internal item and builds drag, resize and waypoint previews only for the changed nodes and their edges, group frames and port routes, so a drag re-renders the moved items instead of the whole graph (5,000 nodes: about 60 ms down to 0.1 ms per pointer move; with minimap, handles, groups and ports about 0.2 ms). Node and edge slots now re-run only when their slot props, the reactive state they read or the slot function change. Rendered markup is unchanged; the first render of a large graph is somewhat slower than in 0.1.0.

### Fixed

- A `contextmenu` event during a pointer gesture, such as a macOS Control-click, now cancels the gesture without a proposal in NetworkGraph and GanttChart, with or without `contextMenu`. Previously the native menu could swallow `pointerup` and the next click committed an unintended edit.
- GanttChart reports invalid `columns`, `headerBands` (including a zoom preset's bands) and `markers` through `validation-error` and renders the empty state, instead of throwing during render.

- `calendarBands` week and month bands with `step` > 1 follow a fixed grid counted from 1970-01-01 (respecting `utcOffsetMinutes` and `weekStartsOn`), so overlapping ranges share band boundaries and any month step is stable. Years 0 to 99 are no longer shifted to 1900 to 1999.
- `intersectsWindow` counts a zero-duration range (milestone) at `window.end` as visible, so GanttChart now renders milestones at the end of the time axis and `renderTimelineSvg` exports milestones at the end of `timeRange`. Non-empty intervals stay half-open.
- `graphEdgeEndpoint`, `applyGraphPositions` and `applyGraphSizes` throw a descriptive `Error` naming the edge and the missing node, instead of a `TypeError`, when an edge endpoint has no layout box.
- `applyGraphPositions` validates positions for unknown node IDs the same way `applyGraphSizes` validates sizes, throwing `RangeError` for invalid values.
- `cloneGraphElements` moves the waypoints (`points`) of copied edges by `offset`, along with the node positions.
- `timelineFromCsvTable` treats a blank Row cell as no label, so the row takes a later record's label or its WBS code.
- `renderGraphSvg` and `renderTimelineSvg` fall back to the blue tone for inherited property names such as `constructor`, and reject inherited names as theme keys.
- `toMsProjectXml` rejects inherited property names such as `toString` as dependency types. `timelineCsvTable` and `timelineFromCsvTable` reject them as columns.
- `layoutRadialGraph` no longer overflows the call stack on very large graphs (about 130,000 nodes and more).
- `collapseGraphGroups` now runs in near-linear time for deeply nested or very many groups, with unchanged output and cycle errors. An unknown parent further up a parent chain now throws a descriptive `Unknown parent group` Error instead of a TypeError.
- A port `side` other than `left`, `right`, `top` or `bottom` (including inherited names such as `constructor`) now throws a descriptive Error naming the node and port in `indexGraph`, `graphEdgeEndpoint`, `routeGraphPorts` and `routeGraphEdges`, and naming the port in `graphPortAnchor`, instead of a TypeError or a wrong anchor.
- `graphPolylinePath` and `graphSmoothPath` throw a RangeError for non-finite points instead of returning path data with `NaN`.
- Orthogonal routes in `routeGraphEdges` keep their 16-unit detour stub for layouts at negative coordinates instead of running to 0. Output for layouts at nonnegative coordinates is unchanged.
- `scheduleToGraph` throws an Error for duplicate dependency IDs instead of returning duplicate edge IDs that NetworkGraph rejects.
- `graphPathBounds` and `graphPathEndpoints` reject path data that does not begin with a moveto (`M` or `m`).
- Documented that `layoutLayeredGraph` places every node of a cycle in one rank, so a large cycle becomes one long column.
- `calculateResourceLoad` no longer copies the active task IDs into every segment, which greatly reduces memory and time for many overlapping tasks. Output values are unchanged.
- `timeTicks` throws a RangeError instead of silently returning no ticks when the window is too far from the anchor.
- `timeTicks`, `editTimeRange` and `moveTimeRanges` no longer accumulate floating-point drift with fractional steps (three steps of 0.1 give 0.3). Integer steps are unchanged.
- `toMsProjectXml` and `toICalendar` round times to the nearest second, so start, finish and duration agree; an iCalendar event whose rounded end equals its start is written without DTEND.
- `timelineFromCsvTable` lets a custom header take precedence over another column's default header whatever the column order, and throws when two custom headers are equal. It reads progress only in plain decimal notation (`0x1` and `1e0` are now rejected) and orders WBS parts of any length exactly.
- `toMsProjectXml` and `toICalendar` throw an Error for a missing project or task name or event summary instead of writing "undefined".
- `rescheduleFromStatusDate` throws a descriptive Error when `progress` is not a Map.
- NetworkGraph compares `groups` and `labels` by value, so new but equal inline literals no longer rebuild the layout or cancel a node drag or pan when the parent re-renders. A real change still cancels the gesture.
- GanttChart compares `range`, `editBounds` and `tickSteps` by value, so new but equal inline literals no longer re-run validation or cancel an in-flight drag. This also prevents an endless render loop when a parent updates state in its `validation-error` handler.
- A second primary pointer of another type (for example a pen next to the mouse) can no longer start or take over a gesture in NetworkGraph or GanttChart while one is in flight. Two-finger pinch is unchanged.
- GanttChart now measures its label column after mounting with invalid data or passing through an error state, so a later `labelWidth` or column change updates which bars are rendered.
- With `cascade`, a change of `dependencies` during a bar drag cancels the drag without a proposal instead of proposing follow-on changes computed from the old dependencies.
- Keyboard focus on a selected NetworkGraph node, or on a node rendered through the `node` slot, now shows a distinct accent outline (Highlight in forced-colours mode). Focused edge and dependency hit areas use an opaque dashed accent stroke with at least 3:1 contrast, distinct from the translucent active and selected bands.
- With `dir="auto"`, NetworkGraph and GanttChart now follow a later change of an ancestor's `dir` attribute and cancel a gesture in flight when the direction changes.

## 0.1.0 - 2026-11-14

First public release. The version restarts at 0.1.0; earlier version numbers were internal only. While the version is 0.x, minor releases can contain breaking changes, which are listed under "Breaking changes".

### Added

- `NetworkGraph` with LR/TB layouts, branches, merges, disconnected nodes, directed cycles, self-loops, edge labels and custom layout/rendering.
- Typed field specs on `TimelineColumn.field` with `parseFieldValue`, `validateFieldValue`, `formatFieldValue` and `fieldValuesEqual`. They separate empty, zero, negative and invalid input and use explicit time zones and duration units.
- Declarative Gantt view state with `projectTimelineView`, `parseTimelineViewState`, `resolveTimelineColumns` and `useTimelineView`: search with ancestors, stable sibling sort, hidden dependency reporting and JSON-safe saved views.
- `useEditTransaction` and core edit-transaction types and transitions (`vue-weave/core`) for server-confirmed edits with `busy`, `rejected`, `conflict` and `uncertain` handling, stale-response discarding and snapshot-restore undo/redo.
- `useEditHistory` gains `peekUndo`, `peekRedo` and `replaceCurrent`; existing methods are unchanged.
- Controlled graph editing with named ports, drag and keyboard connections, endpoint reconnection, box selection, disjoint visual groups, batch movement and a navigable minimap.
- `GanttChart` with controlled pointer and keyboard editing, validation, cancellation on source changes, lanes, milestones, progress and FS/SS/FF/SF dependencies.
- Timeline row hierarchies, baselines, stacked time headers, markers, editable columns and descendant rollups, with row and time-window virtualization.
- Fixed-offset weekly shift calendars, date overrides and explicit work periods.
- Dependency-DAG scheduling with working durations, elapsed lead or lag, date constraints, earliest/latest dates, critical tasks and controlling links.
- Working segments, `ScheduledTask.totalFloat` and `ScheduledTask.workFloat`; `workFloat` measures working-time float for tasks and milestones.
- Resource calendars, capacity comparisons and overload intervals with contributing task IDs, plus optional Gantt dependency highlighting.
- `useEditHistory` for bounded undo and redo over immutable application snapshots.
- Framework-independent TypeScript core, ESM entry points, Bundler/NodeNext declarations, namespaced themes, localization, typed slots and navigation methods.
- `vw-` prefixed CSS classes and `--vw-*` theme variables, and a `vue-weave/package.json` export so tools can read the installed version.
- Manufacturing, project delivery, large-resource and scheduling demos; public-entry, SSR, browser and isolated tarball-consumer checks.
- Verified local release preparation with matching source/demo archives, file inventories, offline smoke checks and SHA-256 records.

#### Graph

- `NetworkGraph` accepts `RL` and `BT` directions and the opt-in `crossingReduction` and `crossingSweeps` layout options; the demo can switch direction, crossing reduction and layout.
- Opt-in `crossingReduction` (`barycenter` or `median`, with `crossingSweeps`) for `layoutLayeredGraph` through the new `GraphLayeredLayoutOptions`, plus `countGraphCrossings`. The default output is unchanged.
- `RL` and `BT` layout directions, exposed as the `GraphLayoutDirection` type and accepted by `graphEdgeEndpoint`, `routeGraphPorts` and `applyGraphPositions`.
- `layoutTreeGraph` and `layoutRadialGraph`, drop-in `GraphLayout` producers for the `layout` prop.
- `layoutForceGraph` with `GraphForceLayoutOptions`, a deterministic force-directed `GraphLayout` producer: seeded start positions, Barnes–Hut repulsion, box-overlap removal, packed components, `initialPositions` and pinned `fixed` nodes. The demo offers it as the `force` graph layout for graphs of up to 1,000 nodes and falls back to the layered layout for the large graph.
- Graph helpers `topologicalOrder`, `findGraphCycles`, `shortestGraphPath`, `searchGraphNodes` and `filterGraph`.
- Integration guide recipe "Use ELK.js for layout": building a `GraphLayout` from ELK's layered output with ports, orthogonal edge sections and an asynchronously cached layout, without adding ELK as a dependency.
- `NetworkGraph` opt-in `cullOffscreen` (with `cullOverscan`) viewport culling, backed by the Vue-free `graphViewportRect`, `graphRectsIntersect`, `graphPathBounds`, `graphLayoutBounds`, `cullGraphElements` and `graphCameraAt` helpers. A large-graph demo preset is included.
- `NetworkGraph` two-finger pinch zoom and pan for touch input, clamped to the existing zoom range and reported through `viewport-change`.
- `NetworkGraph` nested groups through `NetworkGroup.parentId`, with descendant movement as one proposal, validation errors and the `groupWithin` label.
- `NetworkGraph` `matchIds` and `dimmedIds` search/highlight hooks, `--vw-dimmed-opacity`, `dimmed` slot props and the `focusNode(id, options)` method.
- `NetworkGraph` opt-in edge selection: `edgesSelectable`, controlled `selectedEdgeIds` with `update:selectedEdgeIds`, and `edge-select`. Ctrl, Meta or Shift toggles membership, selecting an edge shows its reconnect handles when `reconnectable` is set, culling keeps selected edges, and selected edges use the `vw-edge-selected` class and the new `--vw-edge-selected` variable.
- `NetworkGraph` opt-in deletion proposals: `deletable` and `NetworkNode.deletable`, Delete or Backspace on the focused element or the selection, synchronous `validateDelete`, the `delete` and `delete-rejected` events and the `deleteRejected` label. The Vue-free `graphDeletion` and `removeGraphElements` helpers and the `GraphDeletion` type normalize and apply a deletion, including incident edges.
- `NetworkGraph` opt-in `contextMenu`: right-click, the ContextMenu key and Shift+F10 emit `context-menu` with a `GraphContextMenu` (node, edge, group or canvas target, chart point, client coordinates and pointer or keyboard source). The component renders no menu.
- `NetworkGraph` `tooltip` slot (`NetworkTooltipSlot`) for the hovered or keyboard-focused node or edge, with `tooltipDelay` (default 400 ms), `role="tooltip"` and `aria-describedby`, hoverable and dismissed with Escape. It is not rendered on the server, and the default node `title` is omitted while the slot is provided.
- `NetworkGraph` `fit(options)` takes `GraphFitOptions` (`ids` and `padding`) to fit selected nodes; `fit()` is unchanged.
- The demo's Edit graph mode adds edge selection, deletion with Undo, an accessible context menu, node and edge tooltips and a Fit selection button.
- `NetworkGraph` opt-in `snapGrid`: pointer drags put the dragged node's (or a dragged group's) top-left corner on the grid while the other moved nodes keep their offsets, arrow keys step to the next grid line (four with Shift), and drop and paste points are rounded. Invalid values throw RangeError while rendering.
- `NetworkGraph` opt-in `background` (`none`, `dots`, `lines`) and `backgroundGap`: a decorative, `aria-hidden` SVG pattern with a `useId` ID that follows pan and zoom, coloured by the new `--vw-background-pattern` variable, with dark-theme and forced-colors support. Server markup without it is unchanged.
- `NetworkGraph` opt-in `alignmentGuides` with `guideThreshold` (screen pixels, default 6): pointer drags snap to the left, centre, right, top, middle or bottom of the other nodes (rendered nodes only under culling), winning over the grid on that axis, and draw `vw-guide` lines in the new `--vw-guide` colour.
- `NetworkGraph` opt-in `autoPan`: node and group drags, connection and reconnection drags and box selections held within 40 pixels of the edge pan the camera every animation frame, faster closer to the edge, emitting `viewport-change` and keeping the preview under the pointer.
- `NetworkGraph` exposed `toGraphPoint(clientX, clientY)` and `getViewportCenter()`, and opt-in `droppable` with the `node-drop` event (`GraphDrop`, exported from the Vue entry: chart `point`, `clientX`, `clientY` and `dataTransfer`) for palettes.
- `NetworkGraph` opt-in `clipboard`: Ctrl or Cmd with C, V and D emit `copy-selection` and `duplicate-selection` (`GraphClipboardSelection` with node IDs, edge IDs including edges between them, and node positions) and `paste-request` (`GraphPaste` with the pointer or viewport-centre point). The event names avoid native DOM event names, so native `@copy`, `@paste` and `@drop` listeners on the component still reach its root element. Keys in slot inputs are ignored.
- Core helpers `graphAlignmentGuides` (`GraphAlignment`, `GraphAlignmentGuide`), `snapGraphPoint` and `cloneGraphElements` (`GraphCloneOptions`, `GraphCloneResult`).
- The demo's Edit graph mode adds "Snap to grid" (with a dotted background) and "Alignment guides" switches, auto-pan, a node palette whose "Add operation" and "Add lot" chips can be dragged onto the graph or activated to add at the centre of the view, and copy, paste and duplicate with Undo and Redo.
- `NetworkGraph` opt-in group collapse: `collapsibleGroups` draws accessible toggles ("Collapse group" / "Expand group" plus the label, with `aria-expanded`) on group labels and proxies (in the bottom corner at the text end, clear of the proxy's connection handle), and controlled `collapsedGroupIds` with `update:collapsedGroupIds` (kept locally when omitted). Collapsed groups are applied before layout, so culling, the minimap, fit and export see the collapsed graph. Moving a proxy emits `node-move`/`nodes-move` for its members, deleting it proposes its members, and merged edges delete their original edges.
- Core `collapseGraphGroups(nodes, edges, groups, collapsedIds, options)` (`GraphCollapseResult`, `GraphCollapsedGroup`, `GraphCollapsedNodeData`, `GraphCollapseOptions`): one proxy node per outermost collapsed group, re-attached and merged external edges with their original IDs, dropped internal edges and the remaining groups; Error for unknown IDs.
- `NetworkGraph` `edgeStyle` (`'curve'` default, unchanged output; `'orthogonal'` with rounded corners; `'straight'` clipped to the box borders) for every direction, saved positions, sizes and ports, keeping layered bypass lanes in the orthogonal style. Optional `GraphEdge.points` waypoints are drawn through in every style. Core `routeGraphEdges(layout, edges, nodes, options)` (`GraphEdgeStyle`, `GraphEdgeRouteOptions`), `graphPolylinePath` and `graphSmoothPath` let custom renderers reuse the routes.
- `NetworkGraph` opt-in `editableEdges`: the selected edge shows focusable waypoint handles (arrow keys move, Delete removes) and insert handles at segment midpoints, with pointer drags, emitting `edge-reshape` (`GraphEdgeReshape` with the whole `before` and `after` waypoint lists), checked by the synchronous `validateEdgeReshape` and reported by `edge-reshape-rejected`.
- `NetworkGraph` level of detail: the node and edge slots receive the camera `scale`, and opt-in `lodThreshold` (greater than 0, at most 3) adds `vw-lod-low` below that scale, hiding node details and edge labels of the default renderer without changing accessible names.
- `NetworkGraph` node sizes: the `sizes` overlay (`GraphNodeSize`) and opt-in `resizable` with `NetworkNode.resizable` and `minNodeSize` (default 40 × 24) draw corner handles on the selected node for pointer and keyboard resizing (10 or 40 units, or grid lines with `snapGrid`), emitting `node-resize` (`GraphNodeResize` with `before` and `after` boxes; a left or top corner moves the origin), checked by `validateNodeResize` and reported by `node-resize-rejected`. Core `applyGraphSizes(layout, edges, sizes, direction)`.
- New optional `GraphLabels` fields `collapseGroup`, `expandGroup`, `collapsedNode`, `collapsedNodes`, `moveWaypoint`, `addWaypoint`, `reshapeRejected`, `resizeNode`, `topLeft`, `topRight`, `bottomLeft`, `bottomRight` and `resizeRejected`, and classes `vw-network-overlay`, `vw-group-toggle`, `vw-waypoint-handle`, `vw-waypoint-add`, `vw-resize-handle` and `vw-lod-low` with forced-colors and print rules. Server markup without the new inputs is unchanged.
- The demo's Edit graph mode adds "Collapsible groups", "Editable edges" and "Resizable nodes" switches, an "Edge style" select and level of detail below 50 %, with collapse, waypoint and size changes in the Undo and Redo history.

#### Timeline

- Opt-in Gantt dependency editing: `connectable` link handles with pointer and keyboard connection, `reconnectable` endpoint handles, synchronous `validateConnection`, `connect`, `reconnect` and `connect-rejected` proposals with FS/SS/FF/SF derived from the joined bar ends, plus dependency selection (`selectedDependencyId`, `dependency-select`) and `dependency-delete`.
- Opt-in Gantt multiple selection (`multiSelect` with `update:selectedIds`) and batch moves emitted once as `edits`, validated by `validateEdits` and reported by `edits-rejected`.
- Opt-in Gantt row moves (`rowDraggable`) by pointer drag or Up/Down arrows; `TimelineEdit.row` carries the proposed row.
- Gantt `zoomPresets` with `zoomPreset`/`update:zoomPreset`, a `zoom-change` event, an SSR-safe `showNow`/`now` marker and opt-in two-pointer touch `pinchZoom`.
- Gantt resource load histogram rows (`loadRows`, `loadSegments`, `loadRowHeight`, `load-row` and `load-segment` slots) with accessible segment labels and `--vw-load`, `--vw-load-overload`, `--vw-load-capacity` and `--vw-now` theme variables.
- Core helpers `dependencyTypeForEnds`, `dependencyEndsForType`, `moveTimeRanges`, `calendarBands` and `resourceLoadHistogram`.
- Timeline editing demo covering dependency, batch, row, preset, histogram and pinch interactions.
- Gantt `nonWorkingPeriods` prop: opt-in non-working time shading behind the grid over task and load rows, rendered only for the visible time window, mirrored in right-to-left charts and reported through `validation-error` when an interval is not finite or has `start >= end`.
- Optional `TimelineBar` fields `critical` (critical outline), `latestEnd` (float line), `deadline` (deadline indicator, `vw-late` when the bar ends after it) and `segments` (split work pieces joined by a connector, with progress filled over working time). Move previews shift segments; resize previews draw the bar unsegmented. `validateTimelineData` rejects a `latestEnd` before `end`, non-finite values, unsorted, overlapping, empty or out-of-bar segments and segmented milestones with a `RangeError`. `TimelineEdit` is unchanged.
- The bar information is added to the accessible description (not the name) through the new optional `GanttLabels` fields `critical`, `float`, `deadline` and `late`.
- Theme variables `--vw-non-working`, `--vw-critical`, `--vw-float` and `--vw-deadline` with dark-theme, forced-colors and print support, and classes `vw-gantt-non-working`, `vw-critical`, `vw-gantt-float`, `vw-gantt-deadline`, `vw-late`, `vw-segmented`, `vw-gantt-segment` and `vw-gantt-segment-gap`.
- `exportSvg`, `exportPng` and `renderTimelineSvg` (new `nonWorkingPeriods` option) draw shading, critical outlines, float lines, deadline indicators and segments. `SvgExportTheme` gains the optional colours `nonWorking`, `critical`, `float` and `deadline`, which `defaultSvgExportTheme` always provides.
- The scheduling demo shades non-working time, shows the critical path, float, split work and a dispatch deadline, with "Shade non-working time" and "Show critical path and float" switches and an SVG export button.
- Opt-in Gantt progress editing: `progressEditable` draws a keyboard- and pointer-operable progress slider (`role="slider"`, named with the new `GanttLabels.progressOf`) on editable bars, snapped to `progressStep` (default 0.05). It emits `progress-edit` with the new `TimelineProgressEdit` (`id`, `before`, `after`, `source`), checked by the synchronous `validateProgressEdit` (`ProgressEditValidator`) and reported by `progress-edit-rejected`. Segmented bars map the pointer to progress over working time. Arrow, Page, Home and End keys follow the visual direction in right-to-left charts. `TimelineEdit` is unchanged.
- Opt-in Gantt bar deletion: with `deletable`, Delete or Backspace on a focused bar emits `bars-delete(ids)` once, for the whole selection when the bar is selected with `multiSelect`. The new optional `TimelineBar.deletable` (default `editable`), `validateBarsDelete` (`BarsDeleteValidator`), `bars-delete-rejected` and `GanttLabels.deleteHint` description complete it. `dependency-delete` is unchanged.
- Core helper `removeTimelineBars(bars, dependencies, ids)` returns new arrays without the bars and every dependency that touches them.
- Gantt `tooltip` slot (`{ bar, range, selected }`) with `tooltipDelay` (default 400 ms): a hoverable, dismissible `role="tooltip"` overlay next to the hovered or keyboard-focused bar, referenced from the bar's `aria-describedby` while shown, kept inside the viewport, hidden during gestures and never rendered on the server.
- Opt-in Gantt `contextMenu`: right-click, the ContextMenu key and Shift+F10 emit `context-menu` with the new `TimelineContextMenu` (`target` of type `TimelineContextTarget` for a bar, dependency, row or the chart, plus `time`, `rowId`, `clientX`, `clientY` and `source`). The component renders no menu.
- `fitToBars(ids?, options?)` method on `GanttChart` (`TimelineFitOptions` with `padding`, default 24) zooms so the bars fit the visible time area within the zoom limits and scrolls them into view, emitting `zoom-change`.
- The timeline editing demo gains progress sliders, deletion with Undo and Redo, a tooltip, an accessible context menu with "Delete", "Set progress to 100%", "Add task here" and "Fit to bar", and "Fit all bars" and "Fit selection" buttons.
- Opt-in Gantt drag to create: with `creatable` (`true` or a per-row predicate), a drag on the empty timeline area of a row previews a new bar (`vw-gantt-create-preview`) from the press time to the pointer, snapped, at least `minDuration` long, inside `editBounds` and in the lane under the pointer; a click proposes `createDuration` (default 4 × `snap`). Each creatable row also gets a keyboard-operable add button named with the new `GanttLabels.createIn` ("Add bar to"). Proposals are emitted as `create` with the new `TimelineCreate` (`rowId`, `lane`, `start`, `end`, `source`), checked by the synchronous `validateCreate` (`CreateValidator`) and reported by `create-rejected` (default reason `GanttLabels.createRejected`). Escape, pointer cancellation, lost capture, source changes and a second pinch touch cancel; autoscroll and right-to-left charts are supported.
- Opt-in Gantt cascade previews: the `cascade` prop (`TimelineCascade`) returns follow-on changes of other bars for a move or resize. They are drawn as dashed outlines (`vw-gantt-cascade-preview`, new variable `--vw-cascade` with dark-theme, forced-colors and print support) whenever the snapped preview changes, and proposed with the edit as one `edits` batch, primary change first; without follow-on changes the single `edit` path is unchanged. Unknown bars and the edited bars are ignored, and a throwing callback rejects the edit with its message.
- Core helper `assignLanes(bars, { keepLanes })` (`AssignLanesOptions`, `AssignLanesResult`) assigns lanes so that the bars of a row never overlap: optimal first-fit in start order by default, or stable lanes that move only conflicting bars.
- The timeline editing demo gains drag to create with Undo, a rejection for the Quality row and an "Auto-arrange lanes" switch built on `assignLanes`; the scheduling demo previews and applies downstream moves with `cascade` and `propagateEdit`.
- Opt-in Gantt row hierarchy moves: with `rowsReorderable`, each row heading gets a move handle (`vw-row-move-handle`) named with the new `GanttLabels.moveRow` ("Move row") and described by `GanttLabels.moveRowKeysHint`. A pointer drag previews the drop position between rows (`vw-gantt-row-drop`); Alt+ArrowUp/Down move a row among its siblings and Alt+Shift+ArrowRight/Left indent and outdent it, following the visual direction in right-to-left charts. Proposals are emitted as `row-move` with the new `TimelineRowMove` (`id`, `before`, `after` as `TimelineRowPosition`, `source`), checked by the synchronous `validateRowMove` (`RowMoveValidator`) and reported by `row-move-rejected` (default reason `GanttLabels.rowMoveRejected`). Escape, cancellation and source changes cancel a drag, and focus returns to the moved row's handle once the parent applies the move.
- Core helpers `timelineWbsCodes(rows)` (outline codes such as "1.2.1"), `timelineRowPosition`, `moveTimelineRow(rows, id, target)`, `indentTimelineRow` and `outdentTimelineRow` return new row arrays in tree preorder.
- Opt-in Gantt `statusDate` draws a labelled status-date line (`vw-gantt-status-date`, `role="img"`, new `GanttLabels.statusDate` "Status date") and `showProgressLine` a decorative progress line (`vw-gantt-progress-line`) that kinks to the progress point of each bar behind or ahead of it. New variable `--vw-status` with dark-theme, forced-colors and print support; an invalid `statusDate` is reported through `validation-error`.
- `exportSvg` includes the status-date and progress lines (new `GanttExportOptions.includeStatusDate`, default true), and `renderTimelineSvg` gains the options `statusDate`, `statusDateLabel` and `showProgressLine`. `SvgExportTheme` gains the optional `status` colour, which `defaultSvgExportTheme` provides.
- Interchange exports in the core, without a DOM: `toMsProjectXml` (Microsoft Project MSPDI XML with outline levels, milestones, percent complete and FS/SS/FF/SF links with lag; `MsProjectInput`, `MsProjectTask`, `MsProjectDependency`, `MsProjectXmlOptions`), `toICalendar` (RFC 5545 with CRLF, UTC times, escaping, folding at 75 octets and a reproducible DTSTAMP; `ICalendarEvent`, `ICalendarOptions`), `toCsv` (RFC 4180; `CsvCell`) and `timelineCsvTable` (`TimelineCsvColumn`, `TimelineCsvOptions`).
- The timeline editing demo gains a "Reorder rows" switch with a WBS column and row moves in the Undo history; the web team is now nested under the platform team. The scheduling demo gains a "Status date" slider, "Show progress line", "Reschedule from status date", "Export MS Project XML", "Export iCalendar" and "Export CSV" buttons and a "Network diagram" view.
- Opt-in Gantt column resizing: with `columnsResizable`, the row label column and each `columns` header get a focusable separator (`vw-column-resize`, `role="separator"`, `aria-orientation="vertical"`, `aria-valuenow`/`aria-valuemin`/`aria-valuemax`) named with the new `GanttLabels.resizeColumn` ("Resize column") and the column label. A pointer drag previews the width; ArrowLeft/ArrowRight propose ±10 px (±40 px with Shift) following the visual direction in right-to-left charts, and Home/End the limits. Proposals are emitted as `column-resize` with the new `TimelineColumnResize` (`id`, `before`, `after`, `source`), checked by the synchronous `validateColumnResize` (`ColumnResizeValidator`) and reported by `column-resize-rejected` (default reason `GanttLabels.columnResizeRejected`). New props `labelWidth` (sets `--vw-row-label-width`), `minColumnWidth` (default 48) and `maxColumnWidth` (default 800), and the core constant `timelineLabelColumnId` (`'$label'`), the proposal ID of the label column. Escape, pointer cancellation, lost capture and source changes cancel a drag. Without the new props the server markup is unchanged.
- CSV import in the core: `parseCsv(text, { delimiter })` (RFC 4180 with quoted fields, doubled quotes, embedded line breaks, CRLF, LF or CR line ends, an optional final line break and BOM removal; `CsvParseOptions`; an unterminated quote throws an Error with its line and column) and `timelineFromCsvTable(table, { parseTime, columns, headers })` (`TimelineCsvImportOptions`, `TimelineCsvImport`), which reads the `timelineCsvTable` layout back into rows (hierarchy from WBS codes) and bars and names the CSV line of invalid data.
- The timeline editing demo gains a "Resize columns" switch whose accepted widths are part of the Undo history, and an "Import CSV" file input that replaces the plan as one undoable step.

#### Scheduling

- Scheduling failure diagnostics: `cycle` results list `cycles` (task and dependency IDs of each strongly connected group), and `infeasible` results add the binding `constraints` and `dependencyIds`.
- `ScheduleTask.mode: 'alap'` places a task as late as its free float allows without moving other tasks or the project finish. ALAP results add `earliestStart` and `earliestEnd`.
- `ScheduleTask.pauses` interrupts a task's work for caller-specified intervals.
- `levelResources` delays tasks with a deterministic priority-based serial heuristic so that assigned load stays within capacity, using `ScheduleTask.priority` and `splittable`, and reports delays, added pauses, remaining overloads and unresolved tasks. `calculateResourceLoad` is unchanged.
- `WorkWeek.timeZone` builds work periods in an IANA time zone with daylight-saving gaps and overlaps resolved deterministically, using only `Intl.DateTimeFormat`.
- `invertWorkPeriods(periods, range)` returns the sorted half-open gaps between normalized work periods, for example to shade non-working time.
- `propagateEdit(input, edit)` reschedules a plan with one task pinned at a new start (`fixedStart`) and, with `end`, a working duration recomputed on its calendar, and returns the schedule with every changed task (`ScheduleEdit`, `ScheduleChange`, `PropagateEditSuccess`, `PropagateEditResult`), or the cycle or infeasible failure unchanged.
- `rescheduleFromStatusDate(input, statusDate, progress)` reschedules a plan at a status date: finished tasks keep their dates, partly finished tasks keep their done work and continue at or after the status date (split into work segments when needed), and unstarted tasks start no earlier than it.
- `scheduleToGraph(result, dependencies, options)` builds a PERT network diagram for `NetworkGraph` from a schedule, with early start, early finish and float in each node's detail, critical tasks in the critical tone and `criticalNodeIds` and `criticalEdgeIds` sets (`ScheduleGraph`, `ScheduleGraphOptions`, `ScheduleGraphNodeData`, `ScheduleGraphEdgeData`).
- `scheduledBarFields(task)` derives the `TimelineBar` fields `start`, `end`, `critical`, `latestEnd` and, for work in more than one segment, `segments` from a `scheduleTasks` result task (type `ScheduledBarFields`).

#### Styling, accessibility and export

- Opt-in `vw-theme-dark` and `vw-theme-auto` (follows `prefers-color-scheme`) stylesheet classes, a new `--vw-marker-ink` variable, and `forced-colors`, `prefers-reduced-motion` and print styles for both components.
- SVG and PNG export without dependencies: `exportSvg(options)` and `exportPng(options)` methods on `NetworkGraph` and `GanttChart` export the whole chart (all nodes and groups regardless of camera or culling; all displayed rows, columns, header bands, ticks, bars, milestones, baselines, summaries, dependencies, markers, the now line and load rows, with optional `timeRange` and `rowRange`) using the current `--vw-*` theme (marker and now-flag text follows `--vw-marker-ink` through the new `markerInk` export theme colour, default `#ffffff`). PNG export takes a `scale` and rejects canvases larger than 16,384 px per side or 268,435,456 px in total with a `RangeError`. The Vue-free core builders `renderGraphSvg`, `renderTimelineSvg`, `escapeXml`, `defaultSvgExportTheme` and `mirrorTimeScale` work in Node and workers. Exports use the default rendering; slot content is not reproduced. The demos gain export buttons.
- Opt-in right-to-left support through a `dir` prop (`ltr` default, `rtl` or `auto`, type `ChartDirection`) on both components. `GanttChart` places row headings on the right, runs time from right to left and mirrors header bands, ticks, grid, bars, handles, dependencies, markers and load rows, with scrolling, autoscroll, zoom anchoring, pinch, pointer drags and `scrollToTime` working on negative `scrollLeft`; ArrowLeft/ArrowRight follow the visual direction. `NetworkGraph` moves its zoom tools and minimap and right-aligns labels without changing geometry. The timeline editing demo gains a right-to-left toggle.

### Fixed

- The demo hides its graph Undo and Redo buttons in the timeline editing example, where they changed the hidden graph and timeline instead of the shown timeline.
- Restore Vue type checking and declaration generation with TypeScript 6.0.x; hold Dependabot's TypeScript 7+ updates pending compatibility with `vue-tsc`.
- Remove the source-only stylesheet import from generated declarations so strict `noUncheckedSideEffectImports` consumers can import the components.
- Report missing row parents and hierarchy cycles through Gantt `validation-error`, render the empty state and recover on valid replacement data.
- Keep empty graph layouts measurable with zero padding in both LR and TB directions.
- Resolve ESM declarations in strict TypeScript NodeNext consumers, including Vue component declarations.
- Report invalid Gantt input through `validation-error(error)` and render the empty state in production. Development builds surface the rethrown error. Validate updated `pixelsPerUnit` and `scale` props.
- Keep a focused Gantt bar rendered outside the visible window and reveal it after an accepted keyboard edit.
- Reuse long-edge routing lanes so graph headroom depends on overlapping edges.
- Expose zoom-control group names and localize graph rejection and edge-selection labels.
- `levelResources` keeps a split task at the start it reserved. Before, an end bound (`finishNoEarlierThan`, FF or SF) could pull the start earlier during the final recalculation, placing work in resource downtime or on capacity taken by another task while `unresolvedTaskIds` stayed empty. Split tasks now always get a `startNoEarlierThan` in `leveledTasks`, and a task whose final work differs from its reserved slices is reported in `unresolvedTaskIds`.
- `graphPathBounds` reads numbers with `e`/`E` exponents (`1e-7` was treated as a command and threw), tracks the reflected control point of S and T, and bounds arcs exactly after SVG radius correction and rotation. Culling and SVG/PNG export no longer drop or clip such edges. Malformed path data, including stray characters and a command without arguments, now throws `Invalid SVG path data`.
- Reconnect handles sit at the drawn edge ends after saved positions swap two nodes or a custom layout picks its own sides. `graphEdgeEndpoint` now takes unnamed endpoints from the drawn path of an edge with an `id`; new `graphPathEndpoints(path)` returns a path's first and last points.
- Fit to view shows the whole graph even when that needs a scale below 0.1. Zoom, pinch, `setViewport` and `focusNode` accept scales down to that fit scale, so a fitted viewport can be restored. The automatic initial view keeps its 0.1 floor.
- Gantt grid lines are drawn at every tick position (new `vw-gantt-grid-line` and `vw-gantt-tick-line` elements) instead of a repeating CSS background, so they match the tick labels and the SVG export on non-linear `scale`s and in right-to-left charts. The tick step is chosen from the narrowest visible tick gap instead of the first interval; linear scales choose the same step as before.

### Editing behavior

- Gantt controlled props are watched by reference. Pass fresh arrays and objects; in-place mutations do not trigger validation or cancel active edits.
- Editable Gantt bars emit `select` once per click, on release, including after a drag.
- Gantt pointer edits scroll automatically near horizontal viewport edges. Set `autoScroll` to `false` to disable this behavior.
