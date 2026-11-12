# Integration

## Node.js and TypeScript

The package exports ES modules. Use `vue-weave/core` for calculations on a server or in a worker; that entry runs without Vue or browser globals. Both public entries support `module: NodeNext` with `moduleResolution: NodeNext`, as well as bundler-based TypeScript applications. Relative imports in the emitted declarations use explicit `.js` paths so NodeNext can resolve them. The build also finalizes Vue component re-exports to resolve the generated `.vue.d.ts` files in that mode. Vue applications should import the components from the root and load `vue-weave/style.css` once.

For installation, follow the [README](../README.md#install).

Declarations also support `noUncheckedSideEffectImports` without requiring CSS declarations just to import the components. If your application imports the stylesheet with that option enabled, its asset types must recognize CSS imports, for example through `vite/client` or an application-owned `declare module '*.css' {}` declaration.

## Nuxt

Install the package as described in the [README](../README.md#install), then add the stylesheet once in the Nuxt application.

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  css: ['vue-weave/style.css'],
})
```

Import components explicitly in a page or component.

```vue
<script setup lang="ts">
import { NetworkGraph } from 'vue-weave'
const nodes = [{ id: 'root', label: 'Root' }]
const edges = []
</script>
<template>
  <NetworkGraph :nodes="nodes" :edges="edges" />
</template>
```

The library accesses DOM measurement and ResizeObserver after mounting. Initial server rendering uses deterministic fallback viewport dimensions, then measures the actual container. Vue useId supplies instance-specific SVG marker IDs. Keep server/client data and formatTime output consistent. For timezone-specific labels, use Intl.DateTimeFormat with an explicit timeZone and locale.

## Large graphs, touch and search

For graphs with thousands of nodes, set `cullOffscreen` so only the visible region is in the DOM. Keep `showMinimap` on to orient users, because the minimap still draws every node. A search box can pass the IDs found by your own code as `matchIds` and call `focusNode(id)` on the component ref to bring a result into view.

```vue
<NetworkGraph ref="graph" :nodes="nodes" :edges="edges" cull-offscreen show-minimap :match-ids="matches" />
```

```ts
graph.value?.focusNode(matches.value.values().next().value, { scale: 1 })
```

The graph needs no setup for touch: pinch to zoom and drag with two fingers to pan. Nested groups take an optional `parentId` on each group; see the API reference. Culled nodes are absent from the DOM and keyboard order, so offer a search or list for keyboard users who need to reach a distant node.

## Custom content

The graph node slot receives its node and measured layout box. It is inside a translated, keyboard-accessible SVG group. Render SVG children in local coordinates.

```vue
<NetworkGraph :nodes="nodes" :edges="edges">
  <template #node="{ node, box, selected }">
    <rect :width="box.width" :height="box.height" :rx="8"
      :fill="selected ? '#d8e9fb' : '#fff'" stroke="#365772" />
    <text x="12" y="30">{{ node.label }}</text>
  </template>
</NetworkGraph>
```

Return a custom GraphLayout to use stored node positions or another layout algorithm. The layout callback is pure. It returns boxes, paths and label positions in the same world coordinate space.

Gantt row/bar/tick slots accept ordinary HTML. The bar slot is already inside a focusable button, so avoid nested buttons or links. Use the select event to open a detail panel elsewhere.

## Themes and localization

Styles use the vft- class prefix. Set CSS variables on an ancestor to change themes. Examples include --vft-surface, --vft-surface-muted, --vft-surface-hover, --vft-text, --vft-muted, --vft-border, --vft-grid, --vft-edge, --vft-accent and --vft-on-solid.

Tone-specific variables follow --vft-blue-ink, --vft-blue-line, --vft-blue-pale and --vft-blue-solid. The same suffixes are available for teal, amber and violet. `--vft-baseline`, `--vft-marker` and `--vft-dependency-highlight` control baseline bars, time markers and highlighted dependency paths. The demo contains a dark theme using this contract. `--vft-dimmed-opacity` (default 0.28) sets the opacity of graph nodes and edges de-emphasized through `matchIds` or `dimmedIds`.

GanttChart editing and load overlays add `--vft-now` (now marker), `--vft-load` (load within capacity), `--vft-load-overload` (load above capacity) and `--vft-load-capacity` (dashed capacity line). Link handles, the dependency selection outline and the connection preview use `--vft-accent`; zoom preset buttons use `--vft-accent` and `--vft-on-solid` for the active preset.

Supply partial labels objects to translate controls and accessible names. The row-heading and empty slots provide full control over those regions. Data labels and formatTime belong to the caller.

## Persistence

The edit event carries the previous interval so your parent can detect a stale proposal. A synchronous local commit is shown in the README.

For an API-backed application, retain a record version alongside the interval, compare change.before to current state, submit the proposal with that version, and replace bars after the server accepts it. Serialize pending updates per bar or reject another edit while a save is pending. Surface rejection in your application and retain the accepted state. The event is a proposal; ignoring it preserves the previous interval.

Treat a Gantt `edits` batch as one transaction: apply every change or none, and commit it as one history entry. Row moves arrive as `change.row.after`. Dependency `connect`, `reconnect` and `dependency-delete` events are proposals as well; assign dependency IDs in the application or on the server, and check for cycles there if your scheduling rules forbid them.

## Alternative time scales

A TimeScale exposes width, toX(time) and toTime(x). It must map range.start to 0 and range.end to width, be finite and strictly increasing, and provide mutually inverse mappings over the range. It should also extrapolate beyond the range when tick or interval calculations require it. The Gantt component applies zoom to that mapping and uses its inverse for pointer displacement.

For example, a piecewise scale can give working hours more visual space while retaining a small positive width for other hours. A fully collapsed interval is not invertible and needs a separately defined editing policy. For calendar generation and work-duration scheduling, call `buildWorkPeriods` and `scheduleTasks` from `vue-weave/core`, then pass accepted intervals to the chart. `buildWorkPeriods` uses a fixed UTC offset or, with `timeZone`, an IANA zone including its daylight-saving transitions. The chart does not invoke the scheduler automatically. See [Scheduling and resource load](scheduling.md).

## Reusing calculations

Use the core entry in a worker or server to compute layouts, transform times or validate input. NetworkGraph currently takes a synchronous layout callback. For an asynchronously computed layout, store the returned result in application state and supply a synchronous callback that returns the current result. Update data and matching geometry together.

Geometry types use Maps. Convert them to entries arrays when serializing them across JSON boundaries, then reconstruct Maps at the consuming side.
