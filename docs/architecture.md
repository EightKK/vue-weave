# Architecture and scope

The package has three boundaries.

- src/core contains typed graph/interval inputs, validation, graph traversal, layout, time mapping, interval editing, work calendars, scheduling and resource-load analysis. It has no Vue or browser imports.
- src/components owns measurement, SVG/HTML rendering, local camera/scroll state and transient pointer previews. Persistent selection and accepted schedule data belong to the parent.
- examples contains business data and validation. Components do not import examples.

The ESM root exports Vue components and core functions. The separate core export supports headless use. Vite externalizes Vue. Declaration files preserve props, slots and exposed methods. Consumers load style.css explicitly.

## Graph layout

An iterative Kosaraju traversal finds strongly connected components. The condensed graph supplies ranks; nodes in a component occupy the same rank. Input order determines the order within a column. Curves connect adjacent columns, bypass lanes route long edges, and same-rank edges use a side route. TB transposes the geometry while preserving node sizes.

This is a deterministic layout baseline. Dense edge sets and cycles can produce overlapping routes or labels. By default crossings are not optimized; set crossingReduction to barycenter or median for opt-in sweeps that reorder nodes within each rank (long edges and same-rank edges are not part of the objective). RL and BT mirror the LR and TB geometry. layoutTreeGraph and layoutRadialGraph use a breadth-first spanning forest and route the remaining edges separately. By default all supplied nodes and edges are rendered; applications can use graphNeighborhood to narrow the input, or opt in to viewport culling with cullOffscreen, which renders only the elements that intersect the visible region plus an overscan margin (layout and the minimap still cover every node). Pan/zoom transforms one SVG group without rerunning layout.

## Timeline rendering and editing

A single horizontal/vertical scroll surface contains the fixed header, sticky row labels and positioned bars. Visible row indices plus overscan determine row DOM. Visible time bounds limit bar and tick rendering. Dependency paths are computed in the same coordinate system. The renderer uses fixed row heights and explicit lanes.

Row virtualization bounds DOM size. Input validation, row indexing and dependency scanning still process input collections. Each visible row's bars are filtered against the time window. The included 1,000-row example demonstrates rendering behavior; it is not a performance guarantee for arbitrary data sizes or devices. Browser maximum scroll dimensions also bound very large axes.

A pointer edit records the accepted interval and the initial pointer coordinate. Subsequent movement produces a local preview. Capture keeps the gesture attached to the bar; cancellation clears the preview. Source-data or coordinate changes cancel in-flight edits. On commit, validateEdit runs and an accepted proposal is emitted. The parent owns the resulting state.

## Supported scope

The timeline supports fixed-height rows, collapsible row trees, explicit lanes and continuous invertible time scales. Timeline baselines and header bands come from application data. A collapsed group hides descendant bars and their links. Applications can provide a parent bar or display an aggregated descendant interval with showSummaries. The same rollup feeds extra column values.

Graph movement applies an overlay of absolute coordinates over the base layout. The SVG and minimap share the same geometry. Incident paths are recomputed during preview. The original node and edge arrays remain owned by the caller. Grouped moves and reconnection emit proposals, which let the caller accept each edit as one history entry.

The default renderer handles text, SVG and HTML. Slot authors own content dimensions and accessibility of custom content. Keyboard selection and interval editing are included; assistive-technology testing with dedicated screen readers is still needed before claiming broad accessibility conformance.

Scheduling and resource-load analysis are explicit core operations called by the application. The chart renders accepted results. Capacity conflicts are diagnostic. `levelResources` provides a baseline priority-based leveling heuristic; setup sequencing and optimization policies remain the application's concern. Calendar generation uses a fixed UTC offset or an IANA time zone with daylight-saving rules from `Intl`. See [Scheduling and resource load](scheduling.md).
