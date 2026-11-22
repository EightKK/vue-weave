<script setup lang="ts">
// A card of the examples or showcase index: the thumbnail, the title and the description, linking to the page.
import { computed } from 'vue'
import { withBase } from 'vitepress'
import { categories, thumbnailPath, type ExampleEntry } from '../../../examples/registry'
import { useSiteLocale } from '../i18n'

const props = defineProps<{ entry: ExampleEntry }>()
const { pick, link } = useSiteLocale()
const href = computed(() => link(`/${props.entry.kind === 'showcase' ? 'showcase' : 'examples'}/${props.entry.id}/`))
const category = computed(() => categories.find(item => item.id === props.entry.category))
</script>

<template>
  <a class="vw-site-card" :href="href">
    <img :src="withBase(thumbnailPath(entry))" alt="" width="640" height="400" loading="lazy">
    <span class="vw-site-card-body">
      <span v-if="category && entry.kind === 'example'" class="vw-site-card-tag">{{ pick(category.title) }}</span>
      <strong class="vw-site-card-title">{{ pick(entry.title) }}</strong>
      <span class="vw-site-card-text">{{ pick(entry.description) }}</span>
    </span>
  </a>
</template>
