# Changelog

## Unreleased

### Added

- `NetworkGraph` accepts `RL` and `BT` directions and the opt-in `crossingReduction` and `crossingSweeps` layout options; the demo can switch direction, crossing reduction and layout.
- Opt-in `vft-theme-dark` and `vft-theme-auto` (follows `prefers-color-scheme`) stylesheet classes, a new `--vft-marker-ink` variable, and `forced-colors`, `prefers-reduced-motion` and print styles for both components.
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
- `NetworkGraph` opt-in `cullOffscreen` (with `cullOverscan`) viewport culling, backed by the Vue-free `graphViewportRect`, `graphRectsIntersect`, `graphPathBounds`, `graphLayoutBounds`, `cullGraphElements` and `graphCameraAt` helpers. A large-graph demo preset is included.
- `NetworkGraph` two-finger pinch zoom and pan for touch input, clamped to the existing zoom range and reported through `viewport-change`.
- `NetworkGraph` nested groups through `NetworkGroup.parentId`, with descendant movement as one proposal, validation errors and the `groupWithin` label.
- `NetworkGraph` `matchIds` and `dimmedIds` search/highlight hooks, `--vft-dimmed-opacity`, `dimmed` slot props and the `focusNode(id, options)` method.

- Opt-in `crossingReduction` (`barycenter` or `median`, with `crossingSweeps`) for `layoutLayeredGraph` through the new `GraphLayeredLayoutOptions`, plus `countGraphCrossings`. The default output is unchanged.
- `RL` and `BT` layout directions, exposed as the `GraphLayoutDirection` type and accepted by `graphEdgeEndpoint`, `routeGraphPorts` and `applyGraphPositions`.
- `layoutTreeGraph` and `layoutRadialGraph`, drop-in `GraphLayout` producers for the `layout` prop.
- Graph helpers `topologicalOrder`, `findGraphCycles`, `shortestGraphPath`, `searchGraphNodes` and `filterGraph`.
- Scheduling failure diagnostics: `cycle` results list `cycles` (task and dependency IDs of each strongly connected group), and `infeasible` results add the binding `constraints` and `dependencyIds`. Code that compares whole failure objects, for example with `deepEqual`, sees the new fields.
- `ScheduleTask.mode: 'alap'` places a task as late as its free float allows without moving other tasks or the project finish. ALAP results add `earliestStart` and `earliestEnd`.
- `ScheduleTask.pauses` interrupts a task's work for caller-specified intervals.
- `levelResources` delays tasks with a deterministic priority-based serial heuristic so that assigned load stays within capacity, using `ScheduleTask.priority` and `splittable`, and reports delays, added pauses, remaining overloads and unresolved tasks. `calculateResourceLoad` is unchanged.
- `WorkWeek.timeZone` builds work periods in an IANA time zone with daylight-saving gaps and overlaps resolved deterministically, using only `Intl.DateTimeFormat`.
- Opt-in Gantt dependency editing: `connectable` link handles with pointer and keyboard connection, `reconnectable` endpoint handles, synchronous `validateConnection`, `connect`, `reconnect` and `connect-rejected` proposals with FS/SS/FF/SF derived from the joined bar ends, plus dependency selection (`selectedDependencyId`, `dependency-select`) and `dependency-delete`.
- Opt-in Gantt multiple selection (`multiSelect` with `update:selectedIds`) and batch moves emitted once as `edits`, validated by `validateEdits` and reported by `edits-rejected`.
- Opt-in Gantt row moves (`rowDraggable`) by pointer drag or Up/Down arrows; `TimelineEdit.row` carries the proposed row.
- Gantt `zoomPresets` with `zoomPreset`/`update:zoomPreset`, a `zoom-change` event, an SSR-safe `showNow`/`now` marker and opt-in two-pointer touch `pinchZoom`.
- Gantt resource load histogram rows (`loadRows`, `loadSegments`, `loadRowHeight`, `load-row` and `load-segment` slots) with accessible segment labels and `--vft-load`, `--vft-load-overload`, `--vft-load-capacity` and `--vft-now` theme variables.
- Core helpers `dependencyTypeForEnds`, `dependencyEndsForType`, `moveTimeRanges`, `calendarBands` and `resourceLoadHistogram`.
- Timeline editing demo covering dependency, batch, row, preset, histogram and pinch interactions.

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

### Editing behavior

- Gantt controlled props are watched by reference. Pass fresh arrays and objects; in-place mutations do not trigger validation or cancel active edits.
- Editable Gantt bars emit `select` once per click, on release, including after a drag.
- Gantt pointer edits scroll automatically near horizontal viewport edges. Set `autoScroll` to `false` to disable this behavior.
