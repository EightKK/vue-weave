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
| levelResources | 100 | 16.4 | 9.68 | 27.6 |
| levelResources | 1000 | 101 | 45.4 | 166 |
| levelResources | 3000 | 171 | 121 | 233 |
| levelResources | 10000 | 617 | 481 | 786 |
| layoutLayeredGraph | 100 | 0.35 | 0.31 | 0.91 |
| layoutLayeredGraph | 1000 | 6.46 | 1.90 | 11.7 |
| layoutLayeredGraph | 5000 | 20.8 | 13.6 | 33.0 |
| routeGraphEdges (curve) | 100 | 0.01 | 0.01 | 0.02 |
| routeGraphEdges (curve) | 1000 | 0.07 | 0.05 | 0.12 |
| routeGraphEdges (curve) | 5000 | 0.18 | 0.15 | 0.25 |
| routeGraphEdges (orthogonal, avoid nodes) | 100 | 8.53 | 4.43 | 16.6 |
| routeGraphEdges (orthogonal, avoid nodes) | 500 | 17.9 | 13.9 | 22.7 |
| routeGraphEdges (orthogonal, avoid nodes) | 1000 | 38.5 | 35.2 | 57.8 |
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

- `levelResources` rows were measured on 2026-11-24 with the other conditions above, while other work kept the container's four cores busy (load average about 12), so their spread is wide and the times are likely higher than on an idle machine. Placing a task reads remaining capacity and free working time only as far as that placement needs, so the cost grows a little faster than linearly in this input (the calendar and the profiles also grow with the task count): 3.3 times the tasks (3,000 to 10,000) took about 3.6 times as long (171 ms to 617 ms). Before this, the leveler read each task's free time from its earliest start to the end of the horizon, and the same input took about 0.9 to 1.1 s for 3,000 tasks and about 13 s for 10,000. Leveling still runs `scheduleTasks` twice and does more work per task than scheduling, so for thousands of tasks it remains one of the slower core operations measured. If you level on every edit, measure your own data, and consider leveling on demand or on a worker for plans of tens of thousands of tasks.
- `scheduleTasks` stays close to linear and takes roughly 80 to 130 ms for 10,000 tasks on a calendar (this container's run-to-run spread is wide: 78 ms fastest, 177 ms slowest in the last run).
- Orthogonal routing with `avoidNodes` costs far more than curve routing (38 ms against 0.07 ms for 1,000 edges), as expected from the search it runs.
- The TreeGrid core is cheap: indexing 50,000 rows takes tens of milliseconds, flattening them with a third of the parents expanded about 10 ms, and the row window, column window and cell lookups of 1,000 scroll steps (360,000 cells) about 12 to 17 ms. The index is built once per data change, not per scroll step. Repeated runs of the same case differ by up to 2 times here (for example `createTreeGridIndex` at 50,000 rows measured 18 ms and 46 ms in two sessions), so read single figures as orders of magnitude.

## Rendering in the browser

Each component is mounted with generated data in a 600 px tall viewport. First render runs from mount to the end of the first painted frame. The scroll columns give frame durations over 120 frames while the view moves every frame (the Gantt scroller by script, the graph camera with `setViewport`). A frame duration of 16.7 ms is the display's refresh interval, so p50 and p95 at 16.7 mean the view kept up. The drag columns come from one real mouse drag of 12 moves: the time from each pointer move to the end of the next frame, and from release to the parent receiving the proposal and to the applied change being painted.

| Component | Size | DOM nodes | First render (ms) | Scroll frame p50 / p95 (ms) | Drag move p50 / p95 (ms) | Drag release to proposal (ms) | Drag release to painted change (ms) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| gantt | 100 | 165 | 36.6 | 16.7 / 16.8 | 0.60 / 4.30 | 0.80 | 14.8 |
| gantt | 1000 | 165 | 47.1 | 16.7 / 16.8 | 0.80 / 5.80 | 1.10 | 14.2 |
| gantt | 5000 | 165 | 55.6 | 16.7 / 16.7 | 0.50 / 4.80 | 1.00 | 18.2 |
| graph | 100 | 726 | 51.2 | 16.7 / 16.8 | 2.20 / 3.70 | 0.60 | 12.4 |
| graph | 1000 | 7026 | 188 | 16.7 / 16.7 | 7.70 / 12.0 | 0.50 | 10.9 |
| graph | 3000 | 21026 | 445 | 16.7 / 16.8 | 16.2 / 22.6 | 0.50 | 15.8 |
| graph-culled | 1000 | 1782 | 87.9 | 16.7 / 16.8 | 1.70 / 5.30 | 0.50 | 14.1 |
| graph-culled | 3000 | 1782 | 116 | 16.7 / 16.7 | 1.50 / 5.50 | 0.60 | 20.7 |
| treegrid | 1000 x 20 | 415 | 34.7 | 16.7 / 16.8 | n/a / n/a | n/a | n/a |
| treegrid | 10000 x 50 | 415 | 57.9 | 16.7 / 16.8 | n/a / n/a | n/a | n/a |
| treegrid | 50000 x 100 | 415 | 83.5 | 16.7 / 16.7 | n/a / n/a | n/a | n/a |

Worth knowing:

- GanttChart renders only the visible rows, so its DOM size and interaction times barely change from 100 to 5,000 rows; first render grows from 37 ms to 56 ms.
- NetworkGraph draws every node and edge by default. At 3,000 nodes that is about 21,000 elements, a first render of 445 ms and drag moves of about 16 ms (more than one frame at 60 Hz). With `cullOffscreen` the same graph keeps the DOM small (1,782 elements) and its first render 4 times faster, and drag moves stay at 1 to 6 ms. Use `cullOffscreen` for graphs of more than about a thousand nodes.
- The first render of the culled graph still grows with the node count (88 ms at 1,000, 116 ms at 3,000) because layout and routing run on all nodes.
- Frame times while scrolling or panning never exceeded one frame here, because both only move existing elements.
- TreeGrid renders only the visible window of rows and columns: the DOM stays at 415 elements from 1,000 x 20 to 50,000 x 100 cells, and first render grows from 35 ms to 84 ms. Its drag and edit columns are n/a because the benchmark mounts it read-only.

## Reproducing and comparing

Run the commands above on your machine and keep the generated JSON files (`artifacts/` is ignored by git) next to the Node version, the browser and the CPU, which the files record. Compare numbers only between runs on the same machine, and run each a few times: the fastest and slowest columns show how much a single run can vary. A size or time that changes between two commits of this repository is only a signal that a closer look may be worthwhile.
