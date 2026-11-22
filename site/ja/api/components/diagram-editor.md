---
title: GraphPalette と PropertyInspector
description: ダイアグラムエディターの部品 GraphPalette と PropertyInspector、および readPaletteDrop。
---

# GraphPalette と PropertyInspector

2 つの小さなコンポーネントで、`droppable` な NetworkGraph をダイアグラムエディターにできます。`GraphPalette` はノードのテンプレートを並べ、ユーザーはそれをグラフにドラッグするか、キーボードで挿入します。`readPaletteDrop` はグラフの `node-drop` イベントからテンプレートを読み取ります。`PropertyInspector` は型付きのフィールド定義から、選択中の項目のフォームを作ります。リソースの割り当てと依存関係の表も追加できます。

どちらもオプトインの制御コンポーネントです。パレットはドロップか `insert` を、インスペクターは `change` か `list-change` を知らせ、アプリケーション側がそれぞれを確定します(たとえば `useEditHistory` の 1 つの履歴として)。

## 最小の例

```vue
<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  GraphPalette, NetworkGraph, PropertyInspector, readPaletteDrop,
  type GraphDrop, type GraphPaletteItem, type GraphPoint, type InspectorChange, type InspectorField, type NetworkNode,
} from '@eightkk/vue-weave'

const templates: GraphPaletteItem[] = [{ id: 'step', label: '工程', shape: 'box' }]
const nodes = ref<NetworkNode[]>([])
const positions = ref(new Map<string, GraphPoint>())
const graph = ref<InstanceType<typeof NetworkGraph>>()
const selectedId = ref<string>()
const selected = computed(() => nodes.value.find(node => node.id === selectedId.value) ?? null)
const fields: InspectorField<NetworkNode>[] = [{ id: 'label', kind: 'text', label: '名前', get: node => node.label }]

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

**例:** [ダイアグラムエディター](/ja/examples/diagram-editor/)。**ガイド:** [ダイアグラムエディターの部品](../guides/graph.md#diagram-editor-parts)。**型:** [`GraphPaletteItem`](/api/reference/core/interfaces/GraphPaletteItem.md)、[`InspectorField`](/api/reference/core/interfaces/InspectorField.md)、[`GraphPaletteExposed`](/api/reference/vue-weave/type-aliases/GraphPaletteExposed.md)、[`PropertyInspectorExposed`](/api/reference/vue-weave/type-aliases/PropertyInspectorExposed.md)。

::: info 英語の詳細
ここから下の詳細なリファレンスは英語です。
:::

<!--@include: ../../../../docs/api.md#diagram-editor-->
