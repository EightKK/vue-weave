# Performance and bundle size

This page records measurements of the library and says how to repeat them. The numbers are one machine's results on one day. They are not guarantees, limits or a comparison with other libraries, and no test or CI step checks them. Measure on your own hardware and data before you rely on a figure.

## How to measure

```sh
npm run build
npm run size            # bundle size, written to artifacts/size/size.json
npm run size:check      # compare with size-baseline.json (+5% gzip tolerance)
npm run bench:core      # core operations in Node, written to artifacts/bench/core.json
npm run bench:render    # components in headless Chromium, written to artifacts/bench/render.json
```

`size -- --update` rewrites `size-baseline.json` after an intended change. `size:check` is not part of `npm run check` or CI, because byte counts depend on the bundler and minifier versions and on the Node and operating system matrix. `bench:render` needs Chromium: set `CHROMIUM_PATH` to use an existing one, or install it with `npx playwright install chromium`. It serves `dist/` itself on a free port (`VW_PORT` fixes it) and uses its own page in `scripts/bench/`, which is not part of the package or of `test:e2e`.

## Conditions of the numbers below

| | |
| --- | --- |
| Date | 2026-11-23 |
| CPU | Intel Xeon Processor @ 2.30 GHz, 4 cores (a shared cloud container; `/proc/cpuinfo`) |
| Node.js | 22.23.5 |
| Browser | Headless Chromium 153.0.8010.12, started with `--no-sandbox --no-zygote --disable-gpu` (software rendering) |
| Library | version 1.5.0, built from the working tree |
| Method | core: one warm-up run, then the median of 7 runs. Render: a fresh page for every run, the median of 3 runs. TreeGrid renders `rows x columns` |

A software-rendered headless browser in a shared container is slower and noisier than a desktop browser with a GPU. Treat the render figures as relative comparisons between sizes, not as the speed users will see.

## Bundle size

Sizes are bytes of the published files, and the tree-shaken cost of importing one name: a one-line consumer is bundled with Vite, Vue external, minified. Gzip is level 9 and brotli quality 11. Two builds in a row gave identical figures here.

| Item | Raw | Gzip | Brotli |
| --- | ---: | ---: | ---: |
| dist/core-[hash].js | 591.5 kB | 169.2 kB | 139.0 kB |
| dist/core.js | 6.67 kB | 2.41 kB | 2.17 kB |
| dist/index.js | 414.4 kB | 114.1 kB | 93.0 kB |
| dist/style.css | 85.6 kB | 14.1 kB | 12.2 kB |
| EventCalendar | 38.9 kB | 12.9 kB | 11.8 kB |
| GanttChart | 166.4 kB | 54.8 kB | 47.7 kB |
| GraphPalette | 9.79 kB | 4.34 kB | 3.88 kB |
| NetworkGraph | 159.2 kB | 55.3 kB | 48.5 kB |
| PropertyInspector | 27.8 kB | 9.74 kB | 8.82 kB |
| TaskBoard | 23.0 kB | 8.52 kB | 7.69 kB |
| TreeGrid | 55.0 kB | 18.8 kB | 17.0 kB |
| useAsyncGraphLayout | 22.8 kB | 9.20 kB | 8.29 kB |
| useEditHistory | 990 B | 476 B | 402 B |
| useEditTransaction | 7.51 kB | 2.97 kB | 2.65 kB |
| useLinkedSelection | 14.4 kB | 5.33 kB | 4.78 kB |
| useTimelineView | 16.4 kB | 5.90 kB | 5.32 kB |
| useWindowedData | 13.5 kB | 5.25 kB | 4.71 kB |
| scheduleTasks | 22.4 kB | 8.12 kB | 7.37 kB |
| levelResources | 37.0 kB | 12.9 kB | 11.7 kB |
| layoutLayeredGraph | 11.2 kB | 4.77 kB | 4.29 kB |
| routeGraphEdges | 29.5 kB | 12.1 kB | 10.7 kB |
| toMsProjectXml | 13.3 kB | 5.24 kB | 4.68 kB |
| renderTimelineSvg | 34.5 kB | 12.8 kB | 11.6 kB |
| flattenTreeGrid | 3.51 kB | 1.74 kB | 1.55 kB |

The component figures include the core code each component uses. They do not include Vue or the stylesheet. Importing only `vue-weave/core` functions never pulls in a component.

## Core operations

Inputs are generated with a fixed seed (`scripts/bench-core.mjs`). Scheduling inputs are eight chains of tasks with finish-to-start links and a start-to-start link with lag on every fifth task, on an 8-hour weekday calendar. Leveling uses one single-capacity resource per 20 tasks, assigned at random. Graphs are layered DAGs with one or two incoming edges per node. The layered graph here is long and shallow, so layout times say little about wide or dense graphs.

| Operation | Size | Median (ms) | Fastest (ms) | Slowest (ms) |
| --- | ---: | ---: | ---: | ---: |
| scheduleTasks (weekday calendar, FS + SS links) | 100 | 1.15 | 0.77 | 3.78 |
| scheduleTasks (weekday calendar, FS + SS links) | 1000 | 15.1 | 9.67 | 57.1 |
| scheduleTasks (weekday calendar, FS + SS links) | 10000 | 126 | 78.2 | 177 |
| scheduleTasks (no calendar) | 100 | 0.43 | 0.39 | 0.59 |
| scheduleTasks (no calendar) | 1000 | 4.19 | 2.98 | 10.7 |
| scheduleTasks (no calendar) | 10000 | 69.5 | 64.0 | 97.3 |
| levelResources | 100 | 7.52 | 3.39 | 36.9 |
| levelResources | 1000 | 85.2 | 78.6 | 102 |
| levelResources | 3000 | 730 | 668 | 795 |
| layoutLayeredGraph | 100 | 0.35 | 0.31 | 0.91 |
| layoutLayeredGraph | 1000 | 6.46 | 1.90 | 11.7 |
| layoutLayeredGraph | 5000 | 20.8 | 13.6 | 33.0 |
| routeGraphEdges (curve) | 100 | 0.01 | 0.01 | 0.02 |
| routeGraphEdges (curve) | 1000 | 0.07 | 0.05 | 0.12 |
| routeGraphEdges (curve) | 5000 | 0.18 | 0.15 | 0.25 |
| routeGraphEdges (orthogonal, avoid nodes) | 100 | 8.53 | 4.43 | 16.6 |
| routeGraphEdges (orthogonal, avoid nodes) | 500 | 17.9 | 13.9 | 22.7 |
| routeGraphEdges (orthogonal, avoid nodes) | 1000 | 38.5 | 35.2 | 57.8 |
| routeGraphEdges (orthogonal, avoid nodes, grid, one node moved) | 1000 | 59.9 | 49.3 | 88.5 |
| routeGraphEdges (orthogonal, avoid nodes, grid, one node moved) | 3000 | 215 | 159 | 282 |
| routeGraphEdges (orthogonal, avoid nodes, grid, one node moved, route cache) | 1000 | 46.5 | 40.6 | 55.8 |
| routeGraphEdges (orthogonal, avoid nodes, grid, one node moved, route cache) | 3000 | 65.8 | 50.8 | 107 |
| createTreeGridIndex | 1000 | 0.46 | 0.42 | 3.25 |
| createTreeGridIndex | 10000 | 4.32 | 2.31 | 6.99 |
| createTreeGridIndex | 50000 | 46.2 | 24.0 | 49.6 |
| flattenTreeGrid (every third parent expanded) | 1000 | 0.39 | 0.31 | 0.62 |
| flattenTreeGrid (every third parent expanded) | 10000 | 1.97 | 1.32 | 2.59 |
| flattenTreeGrid (every third parent expanded) | 50000 | 11.5 | 8.19 | 27.3 |
| TreeGrid window + resolveTreeGridCell (30 rows x 12 columns, 1000 scroll steps) | 10000 | 17.1 | 12.1 | 17.9 |
| TreeGrid window + resolveTreeGridCell (30 rows x 12 columns, 1000 scroll steps) | 50000 | 12.0 | 11.1 | 12.6 |
| visibleRows (virtual window, 50000 rows) | 1 | 0.23 | 0.18 | 0.28 |

Worth knowing:

- `levelResources` grows faster than linearly in this input: 3 times the tasks (1000 to 3000) took about 9 times as long (85 ms to 730 ms). Leveling thousands of tasks at once is the slowest core operation measured. If you level on every edit, measure your own data, and consider leveling on demand or on a worker.
- `scheduleTasks` stays close to linear and takes roughly 80 to 130 ms for 10,000 tasks on a calendar (this container's run-to-run spread is wide: 78 ms fastest, 177 ms slowest in the last run).
- Orthogonal routing with `avoidNodes` costs far more than curve routing (38 ms against 0.07 ms for 1,000 edges), as expected from the search it runs.
- The "grid, one node moved" rows route a two-dimensional graph (columns of 30 nodes, each linked to the node below and to its neighbour in the next column) after one node moved, every call routing the whole graph. With a route cache (`createGraphRouteCache`, which NetworkGraph uses with `cullOffscreen`) only the edges the move can affect are searched again, and the result is the same: 66 ms instead of 215 ms at 3,000 nodes. These four rows come from a later run (2026-11-24, median of 15 runs) on a busier machine. When nothing can be reused, a cached call costs about the same as an uncached one, up to about 15% more for keeping the cache. See [Running core calculations in a Worker](integration.md#running-core-calculations-in-a-worker) to move such work off the main thread.
- The TreeGrid core is cheap: indexing 50,000 rows takes tens of milliseconds, flattening them with a third of the parents expanded about 10 ms, and the row window, column window and cell lookups of 1,000 scroll steps (360,000 cells) about 12 to 17 ms. The index is built once per data change, not per scroll step. Repeated runs of the same case differ by up to 2 times here (for example `createTreeGridIndex` at 50,000 rows measured 18 ms and 46 ms in two sessions), so read single figures as orders of magnitude.

## Rendering in the browser

Each component is mounted with generated data in a 600 px tall viewport. First render runs from mount to the end of the first painted frame. The scroll columns give frame durations over 120 frames while the view moves every frame (the Gantt scroller by script, the graph camera with `setViewport`). A frame duration of 16.7 ms is the display's refresh interval, so p50 and p95 at 16.7 mean the view kept up. The drag columns come from one real mouse drag of 12 moves: the time from each pointer move to the end of the next frame, and from release to the parent receiving the proposal and to the applied change being painted.

| Component | Size | DOM nodes | First render (ms) | Scroll frame p50 / p95 (ms) | Drag move p50 / p95 (ms) | Drag release to proposal (ms) | Drag release to painted change (ms) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| gantt | 100 | 165 | 36.6 | 16.7 / 16.8 | 0.60 / 4.30 | 0.80 | 14.8 |
| gantt | 1000 | 165 | 47.1 | 16.7 / 16.8 | 0.80 / 5.80 | 1.10 | 14.2 |
| gantt | 5000 | 165 | 55.6 | 16.7 / 16.7 | 0.50 / 4.80 | 1.00 | 18.2 |
| graph | 100 | 726 | 67.6 | 16.7 / 16.8 | 2.70 / 4.90 | 0.60 | 9.90 |
| graph | 1000 | 7026 | 259 | 16.7 / 16.7 | 6.90 / 11.9 | 0.50 | 12.2 |
| graph | 3000 | 21026 | 696 | 16.7 / 16.8 | 20.0 / 33.6 | 0.50 | 21.1 |
| graph-culled | 1000 | 1782 | 147 | 16.7 / 16.8 | 1.80 / 8.10 | 0.60 | 13.1 |
| graph-culled | 3000 | 1782 | 175 | 16.7 / 16.8 | 1.60 / 5.60 | 0.50 | 17.2 |
| graph-culled-avoid | 1000 | 1782 | 215 | 16.7 / 16.8 | 4.20 / 19.7 | 0.50 | 57.7 |
| graph-culled-avoid | 3000 | 1782 | 435 | 16.7 / 16.8 | 8.20 / 41.1 | 0.40 | 174 |
| treegrid | 1000 x 20 | 415 | 34.7 | 16.7 / 16.8 | n/a / n/a | n/a | n/a |
| treegrid | 10000 x 50 | 415 | 57.9 | 16.7 / 16.8 | n/a / n/a | n/a | n/a |
| treegrid | 50000 x 100 | 415 | 83.5 | 16.7 / 16.7 | n/a / n/a | n/a | n/a |

Worth knowing:

- GanttChart renders only the visible rows, so its DOM size and interaction times barely change from 100 to 5,000 rows; first render grows from 37 ms to 56 ms.
- The graph rows (graph, graph-culled and graph-culled-avoid) come from a later run (2026-11-24, 5 runs each) on the same container under a heavier load from other work: the first renders of the unchanged unculled graph rose by about 1.5 times against the run of the other rows. Compare the graph rows with each other, not with the Gantt and TreeGrid rows. graph-culled-avoid is the culled graph with `edgeStyle="orthogonal"` and `avoidNodes`.
- NetworkGraph draws every node and edge by default. At 3,000 nodes that is about 21,000 elements, and drag moves take 20 to 34 ms here (more than one frame at 60 Hz). With `cullOffscreen` the same graph keeps the DOM small (1,782 elements) and its first render about 4 times faster, and drag moves stay at 2 to 6 ms. Use `cullOffscreen` for graphs of more than about a thousand nodes.
- Culling limits rendering, not geometry: layout and routing still run on every node and edge, because the layout size, the minimap, `fit`, export, keyboard navigation and `routingPolicy: 'preserve'` read every route. So the first render of the culled graph still grows with the node count, most with `avoidNodes` (215 ms at 1,000 and 435 ms at 3,000 nodes). With `cullOffscreen`, saved changes reuse that work: the component keeps a route cache and the culling bounds of the previous saved layout, so a drop routes and measures again only the edges it can affect, with the same result. Release to painted change of the culled graph fell from about 30 ms to 15 ms at 3,000 nodes in an interleaved before-and-after run (graph-culled). In graph-culled-avoid every route spans the graph's three rows, so a move with a vertical part routes every edge again and the drop stays at 150 to 230 ms either way; in two-dimensional graphs the route cache saves most of the search (see the core rows). The first drag move of the avoidNodes graph no longer routes every edge a second time to size the preview: its slowest move fell from about 190 ms to 55 ms at 3,000 nodes in that run.
- Frame times while scrolling or panning never exceeded one frame here, because both only move existing elements.
- TreeGrid renders only the visible window of rows and columns: the DOM stays at 415 elements from 1,000 x 20 to 50,000 x 100 cells, and first render grows from 35 ms to 84 ms. Its drag and edit columns are n/a because the benchmark mounts it read-only.

## Reproducing and comparing

Run the commands above on your machine and keep the generated JSON files (`artifacts/` is ignored by git) next to the Node version, the browser and the CPU, which the files record. Compare numbers only between runs on the same machine, and run each a few times: the fastest and slowest columns show how much a single run can vary. A size or time that changes between two commits of this repository is only a signal that a closer look may be worthwhile.
