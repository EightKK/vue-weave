<script setup lang="ts">
// A reference toolbar that follows one selected node or edge of a NetworkGraph. It is plain HTML placed over the graph,
// so its text keeps its size at every zoom level. It asks the graph for the target's screen rectangle
// (`getTargetClientRect`), so it needs no knowledge of layout or camera. It hides for an unknown, deleted or collapsed
// target and while the target is outside the graph's visible area.
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { GraphViewTarget } from '../../src'

const props = defineProps<{
  /** The graph to ask; it must expose `getTargetClientRect`. */
  graph: { getTargetClientRect(target: GraphViewTarget): DOMRect | undefined } | null | undefined
  /** The selected node or edge. Groups and no target hide the toolbar. */
  target: GraphViewTarget | undefined
  /** Change this whenever the camera, layout or graph data changes, so the toolbar is placed again. */
  refreshKey?: unknown
  label?: string
}>()

const root = ref<HTMLElement>()
const place = ref<{ left: number; top: number; below: boolean } | undefined>()

function update() {
  const host = root.value?.parentElement
  const target = props.target
  if (!host || !target || target.kind === 'group' || !props.graph) {
    place.value = undefined
    return
  }
  const rect = props.graph.getTargetClientRect(target)
  if (!rect) {
    place.value = undefined
    return
  }
  const area = host.getBoundingClientRect()
  // Off screen: the target does not intersect the graph's visible area (the host element wraps the graph).
  if (rect.right < area.left || rect.left > area.right || rect.bottom < area.top || rect.top > area.bottom) {
    place.value = undefined
    return
  }
  const height = root.value?.offsetHeight || 32
  const centerX = Math.min(Math.max(rect.left + rect.width / 2 - area.left, 8), Math.max(8, area.width - 8))
  const above = rect.top - area.top - height - 8
  place.value = above >= 0
    ? { left: centerX, top: above, below: false }
    : { left: centerX, top: Math.min(rect.bottom - area.top + 8, Math.max(0, area.height - height)), below: true }
}

watch(() => [props.target, props.graph, props.refreshKey], () => {
  update()
  // A new target can be laid out on the next render only.
  void nextTick(update)
}, { flush: 'post' })

onMounted(() => {
  window.addEventListener('scroll', update, true)
  window.addEventListener('resize', update)
  update()
})
onBeforeUnmount(() => {
  window.removeEventListener('scroll', update, true)
  window.removeEventListener('resize', update)
})
defineExpose({ update })
</script>

<template>
  <div ref="root" class="gct" role="toolbar" :aria-label="label ?? 'Selection actions'" :hidden="!place"
    :style="place ? { left: place.left + 'px', top: place.top + 'px' } : undefined" :data-below="place?.below || undefined">
    <slot :target="target" />
  </div>
</template>

<style scoped>
.gct {
  position: absolute; z-index: 5; transform: translateX(-50%); display: flex; align-items: center; gap: 6px; max-width: calc(100% - 16px);
  padding: 4px 6px; border: 1px solid var(--vw-border, #c3d3df); border-radius: 8px; background: var(--vw-surface, #fff);
  color: var(--vw-text, #14202b); box-shadow: 0 4px 14px rgb(0 0 0 / .18); font-size: 13px; line-height: 1.2; white-space: nowrap;
}
.gct[hidden] { display: none; }
.gct :deep(button) { font: inherit; padding: 3px 8px; }
</style>
