# Changelog

## Unreleased

### Breaking changes

- `scheduleTasks` failure results carry new fields: `cycle` results add `cycles`, and `infeasible` results add `constraints` and `dependencyIds`. Code that compares a whole failure object, for example with `deepEqual`, must compare `ok`, `code` and `taskId` instead. Successful results are unchanged.
- The graph layout direction type widens from `'LR' | 'TB'` to `GraphLayoutDirection` (`'LR' | 'TB' | 'RL' | 'BT'`) in `GraphLayoutOptions` and in the `direction` parameter of `graphEdgeEndpoint`, `routeGraphPorts` and `applyGraphPositions`. TypeScript code that switches exhaustively over the direction must handle `RL` and `BT`.

### Added

- `NetworkGraph` with LR/TB layouts, branches, merges, disconnected nodes, directed cycles, self-loops, edge labels and custom layout/rendering.
- Controlled graph editing with named ports, drag and keyboard connections, endpoint reconnection, box selection, disjoint visual groups, batch movement and a navigable minimap.
- `GanttChart` with controlled pointer and keyboard editing, validation, cancellation on source changes, lanes, milestones, progress and FS/SS/FF/SF dependencies.
- Timeline row hierarchies, baselines, stacked time headers, markers, editable columns and descendant rollups, with row and time-window virtualization.
- Fixed-offset weekly shift calendars, date overrides and explicit work periods.
- Dependency-DAG scheduling with working durations, elapsed lead or lag, date constraints, earliest/latest dates, critical tasks and controlling links.
- Working segments, `ScheduledTask.totalFloat` and `ScheduledTask.workFloat`; `workFloat` measures working-time float for tasks and milestones.
- Resource calendars, capacity comparisons and overload intervals with contributing task IDs, plus optional Gantt dependency highlighting.
- `useEditHistory` for bounded undo and redo over immutable application snapshots.
- Framework-independent TypeScript core, ESM entry points, Bundler/NodeNext declarations, namespaced themes, localization, typed slots and navigation methods.
- Manufacturing, project delivery, large-resource and scheduling demos; public-entry, SSR, browser and isolated tarball-consumer checks.
- Verified local release preparation with matching source/demo archives, file inventories, offline smoke checks and SHA-256 records.

#### Graph

- `NetworkGraph` accepts `RL` and `BT` directions and the opt-in `crossingReduction` and `crossingSweeps` layout options; the demo can switch direction, crossing reduction and layout.
- Opt-in `crossingReduction` (`barycenter` or `median`, with `crossingSweeps`) for `layoutLayeredGraph` through the new `GraphLayeredLayoutOptions`, plus `countGraphCrossings`. The default output is unchanged.
- `RL` and `BT` layout directions, exposed as the `GraphLayoutDirection` type and accepted by `graphEdgeEndpoint`, `routeGraphPorts` and `applyGraphPositions`.
- `layoutTreeGraph` and `layoutRadialGraph`, drop-in `GraphLayout` producers for the `layout` prop.
- Graph helpers `topologicalOrder`, `findGraphCycles`, `shortestGraphPath`, `searchGraphNodes` and `filterGraph`.
- `NetworkGraph` opt-in `cullOffscreen` (with `cullOverscan`) viewport culling, backed by the Vue-free `graphViewportRect`, `graphRectsIntersect`, `graphPathBounds`, `graphLayoutBounds`, `cullGraphElements` and `graphCameraAt` helpers. A large-graph demo preset is included.
- `NetworkGraph` two-finger pinch zoom and pan for touch input, clamped to the existing zoom range and reported through `viewport-change`.
- `NetworkGraph` nested groups through `NetworkGroup.parentId`, with descendant movement as one proposal, validation errors and the `groupWithin` label.
- `NetworkGraph` `matchIds` and `dimmedIds` search/highlight hooks, `--vft-dimmed-opacity`, `dimmed` slot props and the `focusNode(id, options)` method.
- `NetworkGraph` opt-in edge selection: `edgesSelectable`, controlled `selectedEdgeIds` with `update:selectedEdgeIds`, and `edge-select`. Ctrl, Meta or Shift toggles membership, selecting an edge shows its reconnect handles when `reconnectable` is set, culling keeps selected edges, and selected edges use the `vft-edge-selected` class and the new `--vft-edge-selected` variable.
- `NetworkGraph` opt-in deletion proposals: `deletable` and `NetworkNode.deletable`, Delete or Backspace on the focused element or the selection, synchronous `validateDelete`, the `delete` and `delete-rejected` events and the `deleteRejected` label. The Vue-free `graphDeletion` and `removeGraphElements` helpers and the `GraphDeletion` type normalize and apply a deletion, including incident edges.
- `NetworkGraph` opt-in `contextMenu`: right-click, the ContextMenu key and Shift+F10 emit `context-menu` with a `GraphContextMenu` (node, edge, group or canvas target, chart point, client coordinates and pointer or keyboard source). The component renders no menu.
- `NetworkGraph` `tooltip` slot (`NetworkTooltipSlot`) for the hovered or keyboard-focused node or edge, with `tooltipDelay` (default 400 ms), `role="tooltip"` and `aria-describedby`, hoverable and dismissed with Escape. It is not rendered on the server, and the default node `title` is omitted while the slot is provided.
- `NetworkGraph` `fit(options)` takes `GraphFitOptions` (`ids` and `padding`) to fit selected nodes; `fit()` is unchanged.
- The demo's Edit graph mode adds edge selection, deletion with Undo, an accessible context menu, node and edge tooltips and a Fit selection button.

#### Timeline

- Opt-in Gantt dependency editing: `connectable` link handles with pointer and keyboard connection, `reconnectable` endpoint handles, synchronous `validateConnection`, `connect`, `reconnect` and `connect-rejected` proposals with FS/SS/FF/SF derived from the joined bar ends, plus dependency selection (`selectedDependencyId`, `dependency-select`) and `dependency-delete`.
- Opt-in Gantt multiple selection (`multiSelect` with `update:selectedIds`) and batch moves emitted once as `edits`, validated by `validateEdits` and reported by `edits-rejected`.
- Opt-in Gantt row moves (`rowDraggable`) by pointer drag or Up/Down arrows; `TimelineEdit.row` carries the proposed row.
- Gantt `zoomPresets` with `zoomPreset`/`update:zoomPreset`, a `zoom-change` event, an SSR-safe `showNow`/`now` marker and opt-in two-pointer touch `pinchZoom`.
- Gantt resource load histogram rows (`loadRows`, `loadSegments`, `loadRowHeight`, `load-row` and `load-segment` slots) with accessible segment labels and `--vft-load`, `--vft-load-overload`, `--vft-load-capacity` and `--vft-now` theme variables.
- Core helpers `dependencyTypeForEnds`, `dependencyEndsForType`, `moveTimeRanges`, `calendarBands` and `resourceLoadHistogram`.
- Timeline editing demo covering dependency, batch, row, preset, histogram and pinch interactions.

#### Scheduling

- Scheduling failure diagnostics (see Breaking changes): `cycle` results list `cycles` (task and dependency IDs of each strongly connected group), and `infeasible` results add the binding `constraints` and `dependencyIds`. Code that compares whole failure objects, for example with `deepEqual`, sees the new fields.
- `ScheduleTask.mode: 'alap'` places a task as late as its free float allows without moving other tasks or the project finish. ALAP results add `earliestStart` and `earliestEnd`.
- `ScheduleTask.pauses` interrupts a task's work for caller-specified intervals.
- `levelResources` delays tasks with a deterministic priority-based serial heuristic so that assigned load stays within capacity, using `ScheduleTask.priority` and `splittable`, and reports delays, added pauses, remaining overloads and unresolved tasks. `calculateResourceLoad` is unchanged.
- `WorkWeek.timeZone` builds work periods in an IANA time zone with daylight-saving gaps and overlaps resolved deterministically, using only `Intl.DateTimeFormat`.

#### Styling, accessibility and export

- Opt-in `vft-theme-dark` and `vft-theme-auto` (follows `prefers-color-scheme`) stylesheet classes, a new `--vft-marker-ink` variable, and `forced-colors`, `prefers-reduced-motion` and print styles for both components.
- SVG and PNG export without dependencies: `exportSvg(options)` and `exportPng(options)` methods on `NetworkGraph` and `GanttChart` export the whole chart (all nodes and groups regardless of camera or culling; all displayed rows, columns, header bands, ticks, bars, milestones, baselines, summaries, dependencies, markers, the now line and load rows, with optional `timeRange` and `rowRange`) using the current `--vft-*` theme (marker and now-flag text follows `--vft-marker-ink` through the new `markerInk` export theme colour, default `#ffffff`). PNG export takes a `scale` and rejects canvases larger than 16,384 px per side or 268,435,456 px in total with a `RangeError`. The Vue-free core builders `renderGraphSvg`, `renderTimelineSvg`, `escapeXml`, `defaultSvgExportTheme` and `mirrorTimeScale` work in Node and workers. Exports use the default rendering; slot content is not reproduced. The demos gain export buttons.
- Opt-in right-to-left support through a `dir` prop (`ltr` default, `rtl` or `auto`, type `ChartDirection`) on both components. `GanttChart` places row headings on the right, runs time from right to left and mirrors header bands, ticks, grid, bars, handles, dependencies, markers and load rows, with scrolling, autoscroll, zoom anchoring, pinch, pointer drags and `scrollToTime` working on negative `scrollLeft`; ArrowLeft/ArrowRight follow the visual direction. `NetworkGraph` moves its zoom tools and minimap and right-aligns labels without changing geometry. The timeline editing demo gains a right-to-left toggle.

### Fixed

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
- Gantt grid lines are drawn at every tick position (new `vft-gantt-grid-line` and `vft-gantt-tick-line` elements) instead of a repeating CSS background, so they match the tick labels and the SVG export on non-linear `scale`s and in right-to-left charts. The tick step is chosen from the narrowest visible tick gap instead of the first interval; linear scales choose the same step as before.

### Editing behavior

- Gantt controlled props are watched by reference. Pass fresh arrays and objects; in-place mutations do not trigger validation or cancel active edits.
- Editable Gantt bars emit `select` once per click, on release, including after a drag.
- Gantt pointer edits scroll automatically near horizontal viewport edges. Set `autoScroll` to `false` to disable this behavior.
