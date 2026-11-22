---
title: GraphPalette and PropertyInspector
description: The diagram editor parts GraphPalette and PropertyInspector, and readPaletteDrop.
---

# GraphPalette and PropertyInspector

Two small components turn a `droppable` NetworkGraph into a diagram editor. `GraphPalette` lists node templates that the user drags onto the graph or inserts from the keyboard; `readPaletteDrop` reads the template from the graph's `node-drop` event. `PropertyInspector` is a form generated from typed field definitions for the selected item, with optional tables for resource assignments and dependencies.

Both are opt-in and controlled: the palette reports a drop or an `insert`, the inspector a `change` or `list-change`, and your code commits each one, for example as one entry of `useEditHistory`.

## Minimal example

```vue
<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  GraphPalette, NetworkGraph, PropertyInspector, readPaletteDrop,
  type GraphDrop, type GraphPaletteItem, type GraphPoint, type InspectorChange, type InspectorField, type NetworkNode,
} from '@eightkk/vue-weave'

const templates: GraphPaletteItem[] = [{ id: 'step', label: 'Step', shape: 'box' }]
const nodes = ref<NetworkNode[]>([])
const positions = ref(new Map<string, GraphPoint>())
const graph = ref<InstanceType<typeof NetworkGraph>>()
const selectedId = ref<string>()
const selected = computed(() => nodes.value.find(node => node.id === selectedId.value) ?? null)
const fields: InspectorField<NetworkNode>[] = [{ id: 'label', kind: 'text', label: 'Label', get: node => node.label }]

function add(template: GraphPaletteItem, at: GraphPoint) {
  const id = `${template.id}-${nodes.value.length + 1}`
  nodes.value = [...nodes.value, { id, label: template.label, shape: template.shape }]
  positions.value = new Map(positions.value).set(id, at)
}
function drop(event: GraphDrop) {
  const template = templates.find(item => item.id === readPaletteDrop(event)?.id)
  if (template) add(template, graph.value!.toGraphPoint(event.clientX, event.clientY))
}
function rename(change: InspectorChange) {
  nodes.value = nodes.value.map(node => node.id === change.id ? { ...node, label: String(change.after) } : node)
}
</script>

<template>
  <GraphPalette :items="templates" @insert="item => add(item, graph!.getViewportCenter())" />
  <NetworkGraph ref="graph" v-model:selected-id="selectedId" :nodes="nodes" :edges="[]" :positions="positions"
    droppable @node-drop="drop" />
  <PropertyInspector :item="selected" :fields="fields" @change="rename" />
</template>
```

**Examples:** the legacy gallery's "Diagram editor" demo (see the [example index](/examples/)). **Guide:** [Diagram editor parts](../guides/graph.md#diagram-editor-parts). **Types:** [`GraphPaletteItem`](../reference/core/interfaces/GraphPaletteItem.md), [`InspectorField`](../reference/core/interfaces/InspectorField.md), [`GraphPaletteExposed`](../reference/vue-weave/type-aliases/GraphPaletteExposed.md), [`PropertyInspectorExposed`](../reference/vue-weave/type-aliases/PropertyInspectorExposed.md).

<!--@include: ../../../docs/api.md#diagram-editor-->
