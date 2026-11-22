<script setup lang="ts">
// The showcase index: larger cards for the showcase entries of the registry, then the production planning demo and the
// legacy example gallery, which are separate applications built from examples/ (see vite.demo.config.ts).
import { withBase } from 'vitepress'
import { examplesOfKind } from '../../../examples/registry'
import { useSiteLocale } from '../i18n'
import ExampleCard from './ExampleCard.vue'

const { t } = useSiteLocale()
const showcases = examplesOfKind('showcase')
</script>

<template>
  <div class="vw-site-showcase">
    <ul class="vw-site-cards is-large">
      <li v-for="entry in showcases" :key="entry.id"><ExampleCard :entry="entry" /></li>
      <li>
        <a class="vw-site-card" :href="withBase('/demo/')" target="_self">
          <img :src="withBase('/thumbnails/production-demo.png')" alt="" width="640" height="400" loading="lazy">
          <span class="vw-site-card-body">
            <strong class="vw-site-card-title">{{ t.productionDemo }}</strong>
            <span class="vw-site-card-text">{{ t.productionDemoText }}</span>
          </span>
        </a>
      </li>
    </ul>
    <p class="vw-site-legacy">{{ t.legacyGalleryText }} <a :href="withBase('/gallery.html')" target="_self">{{ t.legacyGallery }} →</a></p>
  </div>
</template>
