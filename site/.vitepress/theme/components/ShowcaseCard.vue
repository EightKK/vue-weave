<script setup lang="ts">
// A card of the showcase index: the thumbnail, the title, one line of text and the components and APIs the showcase
// uses as tags. A featured card is larger and shows the whole description.
import { computed } from 'vue'
import { withBase } from 'vitepress'
import { thumbnailPath, type ExampleEntry } from '../../../examples/registry'
import { useSiteLocale } from '../i18n'

const props = defineProps<{ entry: ExampleEntry; featured?: boolean }>()
const { t, pick, link } = useSiteLocale()
const href = computed(() => link(`/showcase/${props.entry.id}/`))
const text = computed(() => pick(!props.featured && props.entry.summary ? props.entry.summary : props.entry.description))
</script>

<template>
  <a class="vw-site-showcase-card" :class="{ 'is-featured': featured }" :href="href">
    <span class="vw-site-showcase-thumb">
      <img :src="withBase(thumbnailPath(entry))" alt="" width="640" height="400" :loading="featured ? 'eager' : 'lazy'">
    </span>
    <span class="vw-site-showcase-body">
      <strong class="vw-site-showcase-title">{{ pick(entry.title) }}</strong>
      <span class="vw-site-showcase-text">{{ text }}</span>
      <span v-if="entry.tags?.length" class="vw-site-showcase-tags" :aria-label="t.usedApis">
        <code v-for="tag in entry.tags" :key="tag">{{ tag }}</code>
      </span>
      <span v-if="featured" class="vw-site-showcase-open" aria-hidden="true">{{ t.openShowcase }} →</span>
    </span>
  </a>
</template>
