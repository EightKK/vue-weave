<script setup lang="ts">
// The page of one example or showcase, generated for every registry entry by the dynamic routes in
// site/(ja/)(examples|showcase)/[id]/. The default slot holds the source code group that the route renders at build time.
import { computed, ref } from 'vue'
import { categories, exampleById } from '../../../examples/registry'
import { apiHref, sourceHref, useSiteLocale } from '../i18n'
import ExampleFrame from './ExampleFrame.vue'

const props = defineProps<{ id: string }>()
const { t, pick, link } = useSiteLocale()
const entry = computed(() => {
  const found = exampleById(props.id)
  if (!found) throw new Error('Unknown example: ' + props.id)
  return found
})
const category = computed(() => categories.find(item => item.id === entry.value.category)!)
const showcase = computed(() => entry.value.kind === 'showcase')
const full = ref(false)
</script>

<template>
  <div class="vw-site-example" :class="{ 'is-full': full }">
    <nav class="vw-site-example-back">
      <a :href="link(showcase ? '/showcase/' : '/examples/')">{{ showcase ? t.backToShowcase : t.backToExamples }}</a>
    </nav>
    <header class="vw-site-example-head">
      <p class="vw-site-eyebrow">{{ showcase ? t.showcase : pick(category.title) }}</p>
      <h1>{{ pick(entry.title) }}</h1>
      <p class="vw-site-lead">{{ pick(entry.description) }}</p>
    </header>
    <ExampleFrame v-model:full="full" :entry="entry" />
    <div class="vw-site-example-details">
      <section class="vw-site-code vp-doc" aria-labelledby="vw-site-source-title">
        <h2 id="vw-site-source-title">{{ t.source }}</h2>
        <slot />
        <p class="vw-site-source-links">
          {{ t.sourceOnGitHub }}:
          <template v-for="(path, index) in entry.sources" :key="path">
            <a :href="sourceHref(path)" target="_blank" rel="noopener">{{ path }}</a><template v-if="index < entry.sources.length - 1">, </template>
          </template>
        </p>
      </section>
      <aside v-if="entry.api.length" class="vw-site-related" aria-labelledby="vw-site-related-title">
        <h2 id="vw-site-related-title">{{ t.relatedApi }}</h2>
        <ul>
          <li v-for="item in entry.api" :key="item.doc + item.text"><a :href="apiHref(item.doc)">{{ item.text }}</a></li>
        </ul>
      </aside>
    </div>
  </div>
</template>
