<script setup lang="ts">
// One edge of NetworkGraph. Internal: a component per edge lets Vue skip the edges whose props did not change, and the
// path comes from a shallow ref, so a drag preview re-renders the edges of the moved nodes only. The markup is the
// markup NetworkGraph rendered inline.
import type { ShallowRef } from 'vue'
import type { GraphEdge } from '../core/graph.js'

defineProps<{
  edge: GraphEdge
  /** The path and the label anchor; the anchor is undefined when the layout has none. */
  geometry: ShallowRef<{ path: string; labelX?: number; labelY?: number }>
  related: boolean
  dimmed: boolean
  /** Selected through `selectedEdgeIds` (only with `edgesSelectable`). */
  selected: boolean
  active: boolean
  pressed: boolean
  describedby?: string
  /** Values shared by every edge, in one object that keeps its identity while they do not change. */
  shared: {
    /** Sets `data-vw-edge` on the group, for context menus. */
    menu: boolean
    /** Renders the focusable hit area. */
    hit: boolean
    /** The accessible name prefix of the hit area. */
    name: string | undefined
    marker: string
    /** The camera scale for the `edge` slot; 0 without a slot, so zooming does not re-render default edges. */
    scale: number
    /** The parent's `edge` slot, so that a new slot function re-renders every edge. */
    slot?: unknown
    actions: {
      hoverTooltip(kind: 'edge', id: string): void
      leaveTooltip(): void
      select(id: string, event: MouseEvent | KeyboardEvent): void
    }
  }
}>()
defineSlots<{
  edge(props: { edge: GraphEdge; path: string; selected: boolean; dimmed?: boolean; scale: number }): unknown
}>()
</script>

<template>
  <g :class="{ 'vw-dimmed': dimmed, 'vw-edge-selected': selected }"
    :data-vw-edge="shared.menu ? edge.id : undefined" @pointerenter="shared.actions.hoverTooltip('edge', edge.id)" @pointerleave="shared.actions.leaveTooltip()">
    <slot name="edge" :edge="edge" :path="geometry.value.path" :selected="related" :dimmed="dimmed" :scale="shared.scale">
      <path class="vw-network-edge" :class="{ 'vw-is-related': related }"
        :d="geometry.value.path" :marker-end="`url(#${shared.marker})`" />
      <text v-if="edge.label && geometry.value.labelX !== undefined" class="vw-edge-label"
        :x="geometry.value.labelX" :y="geometry.value.labelY"
      >{{ edge.label }}</text>
    </slot>
    <path v-if="shared.hit" class="vw-edge-hit" :class="{ 'vw-is-active': active, 'vw-is-selected': selected }"
      :d="geometry.value.path" role="button" tabindex="0" :aria-label="shared.name + ' ' + (edge.label ?? edge.id)"
      :aria-pressed="pressed" :aria-describedby="describedby" :data-vw-edge="edge.id"
      @pointerdown.stop @click="shared.actions.select(edge.id, $event)" @keydown.enter.prevent="shared.actions.select(edge.id, $event)" @keydown.space.prevent="shared.actions.select(edge.id, $event)" />
  </g>
</template>
