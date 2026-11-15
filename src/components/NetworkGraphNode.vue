<script setup lang="ts">
// One node of NetworkGraph. Internal: a component per node lets Vue skip the nodes whose props did not change, and the
// box comes from a shallow ref, so a drag preview re-renders the moved nodes only. The markup is the markup
// NetworkGraph rendered inline.
import { computed, type ShallowRef } from 'vue'
import type { NetworkNode } from '../core/types.js'
import type { GraphBox } from '../core/graph.js'

const props = defineProps<{
  node: NetworkNode
  box: ShallowRef<GraphBox>
  selected: boolean
  draggable: boolean
  related: boolean
  dimmed: boolean
  describedby?: string
  /** Values shared by every node, in one object that keeps its identity while they do not change. */
  shared: {
    /** Renders the native `<title>`; false while a tooltip slot replaces it. */
    title: boolean
    rtl: boolean
    /** The camera scale for the `node` slot; 0 without a slot, so zooming does not re-render default nodes. */
    scale: number
    /** The parent's `node` slot, so that a new slot function re-renders every node. */
    slot?: unknown
    actions: {
      hoverTooltip(kind: 'node', id: string): void
      leaveTooltip(): void
      startDrag(event: PointerEvent, id: string): void
      click(id: string, event: MouseEvent): void
      moveWithKeys(event: KeyboardEvent, id: string): void
      select(id: string, event: KeyboardEvent): void
    }
  }
}>()
defineSlots<{
  node(props: { node: NetworkNode & { box: GraphBox }; box: GraphBox; selected: boolean; dimmed?: boolean; scale: number }): unknown
}>()
// The node with its box, as the `node` slot receives it.
const placed = computed(() => ({ ...props.node, box: props.box.value }))
</script>

<template>
  <g
    class="vw-network-node" :data-vw-node="placed.id"
    :class="[`vw-tone-${placed.tone ?? 'blue'}`, { 'vw-is-selected': selected, 'vw-is-draggable': draggable, 'vw-is-related': related, 'vw-dimmed': dimmed }]"
    :transform="`translate(${placed.box.x} ${placed.box.y})`"
    role="button" tabindex="0" :aria-label="[placed.label, placed.detail].filter(Boolean).join(' ')" :aria-pressed="selected"
    :aria-describedby="describedby" @pointerenter="shared.actions.hoverTooltip('node', placed.id)" @pointerleave="shared.actions.leaveTooltip()"
    @pointerdown.stop="shared.actions.startDrag($event, placed.id)" @click="shared.actions.click(placed.id, $event)"
    @keydown.self="placed.draggable !== false && shared.actions.moveWithKeys($event, placed.id)"
    @keydown.enter.self.prevent="shared.actions.select(placed.id, $event)" @keydown.space.self.prevent="shared.actions.select(placed.id, $event)"
  >
    <title v-if="shared.title">{{ placed.label }} {{ placed.detail }}</title>
    <slot name="node" :node="placed" :box="placed.box" :selected="selected" :dimmed="dimmed" :scale="shared.scale">
    <svg :width="placed.box.width" :height="placed.box.height" overflow="hidden">
    <rect x="2" y="2" :width="placed.box.width - 4" :height="placed.box.height - 4" :rx="placed.shape === 'rounded' ? 19 : 8" />
    <text :x="shared.rtl ? placed.box.width - 13 : 13" :y="placed.detail ? 24 : 34" class="vw-node-title">{{ placed.label }}</text>
    <text v-if="placed.detail" :x="shared.rtl ? placed.box.width - 13 : 13" y="43" class="vw-node-detail">{{ placed.detail }}</text>
    </svg>
    </slot>
  </g>
</template>
