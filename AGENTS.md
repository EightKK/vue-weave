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
| Inspect published files | `npm pack --dry-run` |
| Package check: build, pack, reject unexpected files, install the tarball into a temporary consumer and check core use, Vue SSR, stylesheet resolution and strict TypeScript consumption | `npm run test:package` |
| Verify and regenerate local release candidates | `npm run prepare:release` |

Run `npm run check` before you consider a change done. Also run the browser tests if the change touches components, styles, `examples/` or accessible names, and `npm run test:package` if it touches package, declaration, build or export configuration. CI runs `check` and `test:package`.

## Gotchas

- Tests import the package by its own name (`vue-weave`, `vue-weave/core`). The `package.json` `exports` map resolves those names to `dist/`. If you run `node --test` without a fresh `npm run build`, the tests run against stale output. `npm test` runs the build for you.
- `test:e2e` doesn't build anything. It serves the existing `preview/` directory on `127.0.0.1:4173` through `scripts/serve.mjs`; regression fixtures also load the public entries from `dist/`. After a source change, run `npm run build` and `npm run build:demo` first, or the browser tests run old code. `npm run check` builds both. Port 4173 must be free. Install the browser once with `npx playwright install chromium`. If the `CHROMIUM_PATH` environment variable is set, `playwright.config.ts` launches that executable instead of Playwright's own browser, with `--no-sandbox --no-zygote --disable-gpu`; otherwise Playwright resolves its installed Chromium.
- `dist/` and `preview/` are generated and gitignored. Never edit them by hand. A prebuilt demo archive can include `preview/` so that `Start.cmd` works offline; a GitHub source ZIP requires a demo build. To update it, run `npm run build:demo`. That build writes `preview/demo-build.json`, a hash of the inputs in `demoInputs` (`scripts/demo-build.mjs`); `Start.cmd` rebuilds (and runs `npm ci` if needed) when the hash no longer matches. If the demo starts reading a file outside those inputs, add it to `demoInputs`.
- Browser tests find elements by role and accessible name, for example `Split · plan 09:00–11:00`. These changes can break them: labels, `aria-*` attributes, the default `formatTime`, and demo data in `examples/`. Update `test/browser/charts.spec.ts` in the same change.

## Project layout

- `src/core/` contains pure TypeScript, grouped by area. `src/core/index.ts` exports the public parts as `vue-weave/core`.
  - Graph: indexing, the default layered layout and ports (`graph.ts`); other layouts (`graphLayouts.ts`, `graphForce.ts`); algorithms, analysis (components, centrality, communities), edge routing, collapsing, editing, snapping and viewport helpers (`graphAlgorithms.ts`, `graphAnalysis.ts`, `graphRouting.ts`, `graphObstacleRouting.ts`, `graphCollapse.ts`, `graphEditing.ts`, `graphPortRules.ts`, `graphSnapping.ts`, `graphView.ts`, `graphLasso.ts`); crossing counts (`graphCrossings.ts`).
  - Timeline: time scales and interval editing (`timeline.ts`), the working-time scale (`workingTimeScale.ts`), row hierarchy moves (`rowHierarchy.ts`) and calendar zoom presets and `Intl` time formatting (`calendarFormat.ts`).
  - Scheduling: work calendars (`workCalendar.ts`), scheduling (`scheduling.ts`), resource leveling (`leveling.ts`), resource load (`resourceLoad.ts`), status-date rescheduling (`statusDate.ts`), rescheduling from recorded actuals and their timeline bars (`actuals.ts`) and schedule-to-graph conversion (`pert.ts`).
  - Output: SVG export (`exportSvg.ts`) and MS Project, iCalendar and CSV interchange (`interchange.ts`).
  - Shared types are in `types.ts`. `graphOrient.ts`, `graphCurve.ts`, `graphPortSide.ts`, `graphShapes.ts`, `timeZone.ts`, `barSegments.ts` and `scheduleModel.ts` are internal helpers that `index.ts` does not export.
- `src/components/`: `NetworkGraph.vue` and `GanttChart.vue` handle rendering, measurement, camera and scroll state, and temporary pointer previews. `NetworkGraph.vue` renders its nodes, edges, minimap rectangles, connection handles and group frames through internal functional item components, so a drag re-renders only the moved items. `exportImage.ts` holds browser-only helpers for the `exportPng` methods and for reading theme colours, and `types.ts` holds types that refer to browser APIs (`GraphDrop`), so they stay out of core.
- `src/composables/useEditHistory.ts` provides undo and redo over immutable snapshots.
- `src/styles/style.css` is the only stylesheet. The build emits it as `dist/style.css`.
- `src/index.ts` is the Vue entry. It exports the components, the composable and all of core. `NetworkGraph.vue` and `GanttChart.vue` are generic SFCs; `src/index.ts` gives them their public types (`NetworkGraphComponent`, `GanttChartComponent`), which let templates infer the item types and keep `InstanceType<typeof NetworkGraph>` working.
- `scripts/` holds Node scripts: `serve.mjs` serves `preview/` (with `--build-if-stale`, as `Start.cmd` runs it, it first rebuilds through `demo-build.mjs`), `finalize-declarations.mjs` runs at the end of `build`, `check-package.mjs` backs `test:package`, and `prepare-release.mjs` backs `prepare:release`.
- `examples/` holds the demo app and its business data and validation. It is the dev server root.
- `test/*.test.mjs` are `node:test` core and SSR tests. `test/browser/` holds Playwright specs that run against the built demo. `test/types/` holds type-level tests that `npm run typecheck` checks.
- `docs/` covers API contracts, integration, architecture and scheduling. It is included in the npm package.

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
- Give each interaction change a Playwright scenario in `test/browser/charts.spec.ts`. Query elements by role and accessible name, and assert that no `pageerror` was raised.

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
