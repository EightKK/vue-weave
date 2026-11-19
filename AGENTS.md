# AGENTS.md

Vue 3 component library with two components: `NetworkGraph` (interactive network graph) and `GanttChart` (controlled Gantt/timeline). It also includes a TypeScript core that does not depend on Vue: graph layout, routing and editing helpers, time mapping, scheduling, resource leveling and load, SVG export, and MS Project, iCalendar and CSV interchange. It ships as ESM with `.` and `./core` entry points and one stylesheet.

Docs for humans are in [README.md](README.md), [CONTRIBUTING.md](CONTRIBUTING.md) and [docs/](docs/). This file covers only what an agent needs to work safely. For details, follow those links. Do not copy their content here.

## Commands

Requires Node.js >= 22.18 and npm. CI runs Node 22 and 24 on Ubuntu and Windows.

| Task | Command |
| --- | --- |
| Install dependencies | `npm ci` |
| Demo dev server (`examples/`, http://127.0.0.1:5173) | `npm run dev` |
| Serve the prebuilt demo without installing | `npm start` |
| Serve the demo on Windows, rebuilding it first if its sources changed | `Start.cmd` |
| Type-check library and examples | `npm run typecheck` |
| Build the library into `dist/` | `npm run build` |
| Core + SSR tests (builds first) | `npm test` |
| One test file | `npm run build && node --test test/scheduling.test.mjs` |
| Tests by name | `npm run build && node --test --test-name-pattern="cycles" test/*.test.mjs` |
| Full check (typecheck, test, demo build) | `npm run check` |
| Browser tests (Chromium) | `npm run build && npm run build:demo && npm run test:e2e` |
| Browser tests of one area | `npm run build && npm run build:demo && npx playwright test test/browser/gantt-view.spec.ts` |
| Inspect published files | `npm pack --dry-run` |
| Package check: build, pack, reject unexpected files, install the tarball into a temporary consumer and check core use, Vue SSR, stylesheet resolution and strict TypeScript consumption | `npm run test:package` |
| Verify and regenerate local release candidates | `npm run prepare:release` |

Run `npm run check` before you consider a change done. Also run the browser tests if the change touches components, styles, `examples/` or accessible names, and `npm run test:package` if it touches package, declaration, build or export configuration. CI runs `check` and `test:package`.

## Gotchas

- Tests import the package by its own name (`vue-weave`, `vue-weave/core`). The `package.json` `exports` map resolves those names to `dist/`. If you run `node --test` without a fresh `npm run build`, the tests run against stale output. `npm test` runs the build for you.
- `test:e2e` doesn't build anything. It serves the existing `preview/` directory on `127.0.0.1:4173` through `scripts/serve.mjs`; regression fixtures also load the public entries from `dist/`. After a source change, run `npm run build` and `npm run build:demo` first, or the browser tests run old code. `npm run check` builds both. Port 4173 must be free; the specs share that one static server and run on two workers (`workers: 2`, whole files in parallel). Tests must not depend on each other, on run order or on server state, and must not write the same file as another spec. Install the browser once with `npx playwright install chromium`. If the `CHROMIUM_PATH` environment variable is set, `playwright.config.ts` launches that executable instead of Playwright's own browser, with `--no-sandbox --no-zygote --disable-gpu`; otherwise Playwright resolves its installed Chromium.
- `dist/` and `preview/` are generated and gitignored. Never edit them by hand. A prebuilt demo archive can include `preview/` so that `Start.cmd` works offline; a GitHub source ZIP requires a demo build. To update it, run `npm run build:demo`. That build writes `preview/demo-build.json`, a hash of the inputs in `demoInputs` (`scripts/demo-build.mjs`); `Start.cmd` rebuilds (and runs `npm ci` if needed) when the hash no longer matches. If the demo starts reading a file outside those inputs, add it to `demoInputs`.
- Browser tests find elements by role and accessible name, for example `Split · plan 09:00–11:00`. These changes can break them: labels, `aria-*` attributes, the default `formatTime`, and demo data in `examples/`. Update the matching spec in `test/browser/` in the same change.

## Project layout

- `src/core/`: pure TypeScript, one file per area. `src/core/index.ts` exports the public parts as `vue-weave/core`.
  - Graph layout and routing: `graph.ts` (indexing, layered layout, ports), `graphLayouts.ts`, `graphForce.ts`, `graphSwimlanes.ts`, `graphFlow.ts`, `graphIncremental.ts`, `graphRouting.ts`, `graphObstacleRouting.ts`, `graphGeometry.ts` (route checks for `routingPolicy: 'preserve'`), `graphCrossings.ts`.
  - Graph algorithms and editing: `graphAlgorithms.ts`, `graphAnalysis.ts`, `graphTraversal.ts`, `graphCollapse.ts`, `graphEditing.ts`, `graphPortRules.ts`, `graphSnapping.ts`, `graphLasso.ts`, `graphView.ts`, `graphExpansion.ts`, `graphLayoutRequests.ts` (asynchronous layout requests).
  - Timeline: `timeline.ts` (time scales, interval editing), `workingTimeScale.ts`, `rowHierarchy.ts`, `calendarFormat.ts`, `fieldEditing.ts`, `timelineView.ts`.
  - Scheduling and resources: `workCalendar.ts`, `scheduling.ts`, `leveling.ts`, `resourceLoad.ts`, `resourceTimeline.ts`, `placement.ts`, `statusDate.ts`, `actuals.ts`, `scheduleTrace.ts`, `scheduleDiagnostics.ts`, `pert.ts`, `planComparison.ts`.
  - Linked views and data: `viewBindings.ts`, `timeRangeTargets.ts`, `windowedData.ts`, `editTransaction.ts`, `snapshot.ts`.
  - Output: `exportSvg.ts` (SVG export) and `interchange.ts` (MS Project, iCalendar and CSV; it re-exports `interchangeMsProject.ts`, `interchangeICalendar.ts` and `interchangeCsv.ts`).
  - Shared types are in `types.ts`. Internal helpers that `index.ts` does not export: `graphOrient.ts`, `graphOptions.ts`, `graphHeap.ts`, `graphCurve.ts`, `graphPortSide.ts`, `graphGroupChecks.ts` (group checks shared with NetworkGraph), `graphShapes.ts`, `graphSpatial.ts`, `intervals.ts`, `ids.ts` (the shared ID rule and error texts), `timeZone.ts`, `barSegments.ts`, `scheduleModel.ts`, `resourceCapacity.ts`, `snapshotValidation.ts`, `interchangeXml.ts` and `interchangeShared.ts`.
- `src/components/`: `NetworkGraph.vue` and `GanttChart.vue` (rendering, measurement, camera and scroll state, pointer previews); `exportImage.ts` (browser-only PNG export and theme colours) and `types.ts` (types that refer to browser APIs, such as `GraphDrop`), kept out of core. `networkGraph/` and `ganttChart/` hold the components' internal plain-TypeScript helpers (preview layout, geometry, prop validation, edit arithmetic, the tooltip composable); they are not exported. The item functional components stay in `NetworkGraph.vue`: moving them to a module reorders the emits in its declaration file.
- `src/composables/`: `useEditHistory.ts`, `useEditTransaction.ts`, `useLinkedSelection.ts`, `useAsyncGraphLayout.ts`, `useTimelineView.ts` and `useWindowedData.ts`, which wire core state to Vue.
- `src/styles/style.css` is the only stylesheet. The build emits it as `dist/style.css`.
- `src/index.ts` is the Vue entry: the components, the composables and all of core. It gives the generic SFCs their public types (`NetworkGraphComponent`, `GanttChartComponent`).
- `scripts/`: `serve.mjs` (serves `preview/`; `--build-if-stale` rebuilds through `demo-build.mjs` first), `finalize-declarations.mjs` (end of `build`; rewrites the entry declarations and deletes every `dist/types` file not reachable from the two public entries, found by `declaration-graph.mjs`), `check-package.mjs` (`test:package`; also fails if the tarball holds an unreachable declaration) and `prepare-release.mjs` (`prepare:release`).
- `examples/`: the demo app and the dev server root. `demos.ts` lists every demo, `components/` holds shared demo components, `showcase/` the design gallery.
- `test/*.test.mjs`: `node:test` core and SSR tests; `test/helpers/` holds their shared builders (not tests). `test/browser/*.spec.ts`: Playwright specs by area, with shared fixtures and helpers in `test/browser/support.ts` and fixture pages in `test/browser/fixtures/`. `test/types/`: type-level tests that `npm run typecheck` checks.
- `docs/`: API contracts, integration, architecture and scheduling. It is included in the npm package.

## Architecture rules

- `src/core` must not import Vue, the DOM or browser globals. It has to run in Node, workers and servers.
- Code in `src/` must never import from `examples/`.
- Components are controlled and never mutate props. A user edit emits a proposal (`edit`, `node-move`, `nodes-move`, `connect`, `reconnect`, `cell-edit`), and the parent decides whether to apply it. `validateEdit`, `validateConnection` and `validateCellEdit` stay synchronous.
- If source data or coordinates change during a gesture, the in-flight edit is cancelled. Keep this behavior when you change pointer or keyboard handling.
- Components must render on the server. Access the DOM and `ResizeObserver` only inside `onMounted`, and create SVG IDs with `useId()`.
- New features are opt-in through props. Existing defaults, props, events and slots must keep working.
- Write graph traversals as loops, not recursion. A test lays out a 12,000-node chain.
- Intervals are half-open `[start, end)`, in numeric units the caller chooses (milliseconds by default). A zero-duration bar is a milestone.

## Code style

No linter or formatter is configured. Match the surrounding code.

- TypeScript runs with `strict` and `verbatimModuleSyntax`. Import type-only symbols with `import type` or an inline `type` modifier.
- Use 2-space indentation, single quotes, no semicolons, and trailing commas in multiline literals.
- Write Vue components with `<script setup lang="ts">` and type-based `defineProps`, `defineEmits` and `defineSlots`.
- Validate inputs at public boundaries and throw descriptive errors. Use `RangeError` for invalid numbers or geometry, and `Error` for bad references, duplicate IDs or cycles.
- Public functions return new values and never mutate their arguments.
- CSS classes use the `vw-` prefix, and theme values are `--vw-*` custom properties. Document any new variable in `docs/integration.md`.
- Write comments, API docs and test descriptions in English.

## Testing

- Add or update tests for every change to public behavior. Cover these cases first: cycles, input validation, coordinate inversion (`toX`/`toTime` round trips), cancelled edits and stale source data.
- Core and SSR tests use `node:test` with `node:assert/strict`. They import only from the public entry points, never from `src/`.
- Give each interaction change a Playwright scenario in the spec file of its area under `test/browser/` (for example `graph-editing.spec.ts` or `gantt-view.spec.ts`). Import `test` and `expect` from `./support`, whose fixture fails a test on any `pageerror` or console error; keep the explicit `expect(errors).toEqual([])` with `pageErrors(page)`. Query elements by role and accessible name.

## Changing the public API

When you add, change or remove an export, prop, event, slot or CSS variable:

1. Export it from `src/core/index.ts` (core) or `src/index.ts` (Vue).
2. Update `docs/api.md` and every affected guide in `docs/`.
3. Add an entry to `CHANGELOG.md` under `## Unreleased`, and create that heading if it is missing. Mark breaking changes explicitly.
4. If the change affects README examples or the feature summary, update `README.md` and `README.ja.md` together.

The release steps are in [CONTRIBUTING.md](CONTRIBUTING.md).

## Boundaries

Always:

- Run `npm run check` and report any failure with its output.

Ask first before:

- Adding a dependency. The package has no runtime dependencies. Vue is a peer dependency and is kept out of the bundle.
- Making breaking changes to public types, props, events or default behavior.
- Changing the package name or `version`, or the `exports` and `files` fields in `package.json`.
- Editing `.github/workflows/ci.yml`.

Never:

- Run `npm publish`, or add a publish step to CI.
- Edit `dist/`, `preview/` or `package-lock.json` by hand.
- Change the attribution in `LICENSE` or `THIRD_PARTY_NOTICES.md`.
