---
title: Interchange and export
description: Microsoft Project XML, iCalendar, CSV, Mermaid, GraphML and draw.io import and export, versioned JSON snapshots and SVG and PNG export.
---

# Interchange and export

The core reads and writes the file formats that planning and diagram tools exchange: Microsoft Project XML (tasks, links, calendars, resources and assignments), iCalendar (including recurring series), CSV, Mermaid flowcharts, GraphML (including yEd) and draw.io. Imports return the component props plus a list of warnings for what could not be read, so you can show them before you accept the file. Versioned JSON snapshots save a chart's data and view, and `renderGraphSvg` and `renderTimelineSvg` produce SVG on a server; the components also expose `exportSvg` and `exportPng`.

Everything here is pure and has no dependencies: no XML parser, no DOM, no network.

## Minimal example

```ts
import { fromMsProjectXml, timelineFromMsProject, toMermaid } from '@eightkk/vue-weave/core'

// A Microsoft Project XML file to GanttChart props
const project = fromMsProjectXml(xmlText)
const { rows, bars, dependencies } = timelineFromMsProject(project)
if (project.warnings.length) console.warn(project.warnings)

// NetworkGraph props to a Mermaid flowchart
const mermaid = toMermaid({ nodes, edges })
```

**Examples:** the [example index](/examples/) lists the import and export demos. **Guides:** [Diagram files](../guides/graph.md#diagram-files-mermaid-graphml-and-draw-io), [Saving and restoring a view](../guides/data.md#saving-and-restoring-a-view), [Export to SVG and PNG](../guides/data.md#export-to-svg-and-png). **Types:** [`fromMsProjectXml`](../reference/core/functions/fromMsProjectXml.md), [`toICalendar`](../reference/core/functions/toICalendar.md), [`fromDrawio`](../reference/core/functions/fromDrawio.md), [`serializeWeaveSnapshot`](../reference/core/functions/serializeWeaveSnapshot.md).

<!--@include: ../../../docs/api.md#interchange-->

<!--@include: ../../../docs/api.md#snapshots-->

<!--@include: ../../../docs/api.md#export-->
