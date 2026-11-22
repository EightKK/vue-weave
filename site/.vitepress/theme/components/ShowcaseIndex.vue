<script setup lang="ts">
// The showcase index: a featured row of the registry's showcases marked `featured`, then a gallery of the others, and
// a link to the standalone production planning app, a separate application built from examples/ (see
// vite.demo.config.ts).
import { withBase } from 'vitepress'
import { examplesOfKind } from '../../../examples/registry'
import { useSiteLocale } from '../i18n'
import ShowcaseCard from './ShowcaseCard.vue'

const { t } = useSiteLocale()
const showcases = examplesOfKind('showcase')
const featured = showcases.filter(entry => entry.featured)
const more = showcases.filter(entry => !entry.featured)
</script>

<template>
  <div class="vw-site-showcase">
    <section v-if="featured.length" class="vw-site-showcase-section" aria-labelledby="vw-site-featured-title">
      <h2 id="vw-site-featured-title" class="vw-site-showcase-heading">{{ t.featured }}</h2>
      <ul class="vw-site-showcase-featured">
        <li v-for="entry in featured" :key="entry.id"><ShowcaseCard :entry="entry" featured /></li>
      </ul>
    </section>
    <section class="vw-site-showcase-section" aria-labelledby="vw-site-more-title">
      <h2 id="vw-site-more-title" class="vw-site-showcase-heading">
        {{ t.moreShowcases }} <small>{{ t.showcaseCount(more.length) }}</small>
      </h2>
      <ul class="vw-site-showcase-grid">
        <li v-for="entry in more" :key="entry.id"><ShowcaseCard :entry="entry" /></li>
      </ul>
    </section>
    <div class="vw-site-showcase-notes">
      <p>{{ t.productionDemoText }} <a :href="withBase('/demo/')" target="_self">{{ t.productionDemo }} →</a></p>
    </div>
  </div>
</template>
