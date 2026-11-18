<script setup lang="ts">
// The frame of a standalone demo: a section named by its heading, a subtitle and optional controls next to them.
defineProps<{
  /** The ID of the heading, which names the section. */
  titleId: string
  title: string
  subtitle: string
}>()
defineSlots<{ options?(): unknown; default?(): unknown }>()
</script>

<template>
  <section class="planning-panel" :aria-labelledby="titleId">
    <div class="section-head">
      <div><h2 :id="titleId">{{ title }}</h2><p>{{ subtitle }}</p></div>
      <div v-if="$slots.options" class="options"><slot name="options" /></div>
    </div>
    <slot />
  </section>
</template>
