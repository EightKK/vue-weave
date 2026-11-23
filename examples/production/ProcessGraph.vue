<script setup lang="ts">
import { computed } from 'vue'
import { NetworkGraph, type GraphEdge, type GraphPoint, type NetworkNode } from '../../src'
import type { Copy } from './copy'

const props = defineProps<{
  text: Copy
  label: string
  nodes: readonly NetworkNode[]
  edges: readonly GraphEdge[]
  positions: ReadonlyMap<string, GraphPoint>
  symbols: Record<string, string>
  /** The node this graph selected; an empty string when the selection is elsewhere or empty. */
  selectedId: string
  /** Nodes linked to a selection made in another view: outlined, not selected. */
  linkedIds?: ReadonlySet<string>
  /** Nodes the open proposal moved. */
  highlighted?: ReadonlySet<string>
  height: number
}>()
const emit = defineEmits<{ select: [id: string]; clear: [] }>()
const options = { direction: 'LR' as const, nodeWidth: 154, nodeHeight: 54 }
// A click on the empty canvas or Escape in the graph clears the selection.
const focus = computed(() => props.selectedId || [...props.linkedIds ?? []].find(id => props.nodes.some(node => node.id === id)))
const highlightedEdges = computed(() => new Set(props.edges.filter(edge => edge.from === focus.value || edge.to === focus.value).map(edge => edge.id)))
</script>

<template>
  <div class="production-graph">
    <NetworkGraph :selected-id="selectedId" :nodes="nodes" :edges="edges" :positions="positions"
      :options="options" :height="height" edge-style="straight" background="dots" unstyled-node-slots
      :highlighted-node-ids="highlighted" :highlighted-edge-ids="highlightedEdges"
      :labels="{ ...text.labels.graph, region: label, zoom: text.zoom, zoomIn: text.zoomIn, zoomOut: text.zoomOut, fit: text.fitting }"
      @update:selected-id="id => id ? emit('select', id) : emit('clear')"
      @background-click="emit('clear')" @idle-escape="emit('clear')">
      <template #node="{ node, box, selected: active, highlighted: shifted }">
        <g class="production-node" :class="{ active, shifted, linked: linkedIds?.has(node.id) }">
          <rect class="production-node-frame" :width="box.width" :height="box.height" rx="8" />
          <rect class="production-node-icon" x="10" :y="node.detail ? 12 : 13" width="28" height="28" rx="6" />
          <text class="production-node-symbol" x="24" :y="node.detail ? 31 : 32">{{ symbols[node.id] }}</text>
          <text class="production-node-name" x="46" :y="node.detail ? 23 : 32">{{ node.label }}</text>
          <text v-if="node.detail" class="production-node-detail" x="46" y="40">{{ node.detail }}</text>
          <circle class="production-node-handle" v-if="edges.some(edge => edge.to === node.id && !edge.animated)" cx="0" :cy="box.height / 2" r="3" />
          <circle class="production-node-handle" v-if="edges.some(edge => edge.from === node.id && !edge.animated)" :cx="box.width" :cy="box.height / 2" r="3" />
        </g>
      </template>
    </NetworkGraph>
  </div>
</template>
