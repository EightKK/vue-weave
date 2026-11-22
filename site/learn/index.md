# Getting started

Vue Weave gives you two main components, `NetworkGraph` and `GanttChart`, opt-in `TreeGrid`, `TaskBoard`, `EventCalendar`, `GraphPalette` and `PropertyInspector` components, and a headless core for graph layout, scheduling, resource load and file interchange.

## Install

```sh
npm install @eightkk/vue-weave
```

Vue `^3.5.0` is a peer dependency; npm 7 and later install it together with the package when your application does not have it yet. The package ships ES modules, TypeScript declarations and one stylesheet, and has no runtime dependencies.

## Load the stylesheet

Import the stylesheet once, for example in your application's entry file:

```ts
import '@eightkk/vue-weave/style.css'
```

Vite and other bundlers with CSS support handle this import as it is. In Nuxt, list it in `css` in `nuxt.config.ts`. If your `tsconfig.json` enables `noUncheckedSideEffectImports`, see [The stylesheet and TypeScript](https://github.com/EightKK/vue-weave/blob/main/docs/integration.md#the-stylesheet-and-typescript).

## A network graph

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { NetworkGraph, type NetworkNode, type GraphEdge } from '@eightkk/vue-weave'
import '@eightkk/vue-weave/style.css'

const selected = ref('design')
const nodes: NetworkNode[] = [
  { id: 'design', label: 'Design' },
  { id: 'build', label: 'Build' },
  { id: 'release', label: 'Release' },
]
const edges: GraphEdge[] = [
  { id: 'db', from: 'design', to: 'build' },
  { id: 'br', from: 'build', to: 'release', label: 'Approved' },
]
</script>

<template>
  <NetworkGraph
    v-model:selected-id="selected"
    :nodes="nodes"
    :edges="edges"
    :options="{ direction: 'LR' }"
  />
</template>
```

Other features are enabled the same way, through props and `options`: other layouts, edge styles, search highlighting, a minimap, editing and more.

## A controlled Gantt chart

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { GanttChart, type TimelineBar, type TimelineEdit } from '@eightkk/vue-weave'
import '@eightkk/vue-weave/style.css'

const start = Date.parse('2026-11-09T08:00:00Z')
const hour = 3_600_000
const range = { start, end: start + 8 * hour }
const rows = [{ id: 'team', label: 'Engineering' }]
const bars = ref<TimelineBar[]>([
  {
    id: 'build', rowId: 'team', label: 'Build',
    start: start + hour, end: start + 3 * hour,
    editable: true, progress: 0.4,
  },
])

function commit(change: TimelineEdit) {
  bars.value = bars.value.map(bar =>
    bar.id === change.id ? { ...bar, ...change.after } : bar,
  )
}
</script>

<template>
  <GanttChart :rows="rows" :bars="bars" :range="range" @edit="commit" />
</template>
```

Intervals are half-open `[start, end)`, in numeric units you choose (milliseconds by default), and a zero-duration bar is a milestone.

## The controlled model

The components never change the data you pass in. A user edit, such as dragging a bar, moving a node or connecting two nodes, is previewed while the pointer moves and then emitted as a proposal (`edit`, `node-move`, `connect`, `cell-edit` and others). Your code decides whether to apply it by replacing the affected items, so validation, saving through an API and asynchronous approval stay in your application.

- A synchronous validator, such as `validateEdit` or `validateConnection`, can reject a proposal before it is emitted, with a message that the component announces.
- If the source data changes while a gesture is in flight, the gesture is cancelled and reported through `edit-cancel`.
- `useEditHistory` adds undo and redo, and `useEditTransaction` saves through your server adapter with conflict handling.

See the [editing contract](https://github.com/EightKK/vue-weave/blob/main/docs/api.md#editing-contract) for the details.

## Server-side rendering

The components render on the server. They access DOM measurement and `ResizeObserver` only after mounting; the initial server render uses deterministic fallback viewport sizes and then measures the actual container, and SVG IDs come from Vue's `useId`. Keep the data and the `formatTime` output the same on the server and the client: for time zone specific labels, use `Intl.DateTimeFormat` with an explicit `timeZone` and locale. See [Nuxt](https://github.com/EightKK/vue-weave/blob/main/docs/integration.md#nuxt).

## Core only: servers and Workers

`@eightkk/vue-weave/core` does not import Vue, the DOM or browser globals, so scheduling, layout, interchange and SVG export run in Node.js 22.18+, Workers and serverless functions. See [Core only](https://github.com/EightKK/vue-weave/blob/main/docs/integration.md#core-only-servers-and-workers).

## Next steps

- Browse the [examples](../examples/) and the [showcase](../showcase/); every example page shows its source code.
- Read the [API reference](../api/).
