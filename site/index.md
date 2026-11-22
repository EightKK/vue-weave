---
layout: home
title: Vue Weave
titleTemplate: Network graphs and Gantt charts for Vue 3

hero:
  name: Vue Weave
  text: Network graphs and Gantt charts for Vue 3
  tagline: Typed, controlled components for relationship explorers, process flows, project schedules and resource timelines, with a headless core for graph, scheduling and resource calculations.
  actions:
    - theme: brand
      text: Get started
      link: /learn/
    - theme: alt
      text: Examples
      link: /examples/
    - theme: alt
      text: GitHub
      link: https://github.com/EightKK/vue-weave

features:
  - title: Controlled components
    details: NetworkGraph, GanttChart, TreeGrid, TaskBoard and EventCalendar never change your data. A user edit becomes a proposal event, and your code decides whether to apply it.
  - title: Planning built in
    details: Work calendars, dependencies, critical path, resource load and leveling, recorded actuals, earned value and plan comparison, with an explanation of every date.
  - title: Headless core
    details: Layout, scheduling, interchange and SVG export run without Vue in Node.js, Workers and on servers, from @eightkk/vue-weave/core.
  - title: Linked views
    details: Select in a graph, a Gantt chart, a tree grid or load rows and the other views highlight the same items through entity bindings.
  - title: Import and export
    details: Microsoft Project XML, iCalendar, CSV, Mermaid, GraphML and draw.io interchange, plus SVG and PNG export of both main components.
  - title: Opt-in, accessible, SSR-ready
    details: Defaults stay simple and everything else is a prop. Keyboard operation and ARIA names, a dark theme, right-to-left layouts and server rendering.
---

<div class="vw-site-install">

## Install

```sh
npm install @eightkk/vue-weave
```

```ts
import '@eightkk/vue-weave/style.css'
import { NetworkGraph, GanttChart } from '@eightkk/vue-weave'
```

Vue `^3.5.0` is the only peer dependency; there are no runtime dependencies. Continue with [Getting started](./learn/), browse the [examples](./examples/) and [showcases](./showcase/), or read the [API reference](./api/).

</div>
