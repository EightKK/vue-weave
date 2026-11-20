<script setup lang="ts">
// The status line of a demo: a polite live region that announces the result of the last action.
defineProps<{
  /** The accessible name; demos with more than one status line name each of them. */
  label?: string
}>()
defineSlots<{ default?(): unknown }>()
</script>

<template>
  <p class="status" role="status" :aria-label="label"><slot /></p>
</template>
