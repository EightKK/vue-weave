<script setup lang="ts">
// The live demo of an example page in a framed panel: a toolbar with the full-width switch and the GitHub link, and the
// demo below in a panel whose height the reader can drag. The demo is scoped with `vw-site-demo`, which applies the demo
// app's stylesheet (examples/demo.css) inside the panel only, and follows the site's dark mode after hydration. The page
// language is provided to the demo as `vw-site-locale` ('en' or 'ja'), for demos that have copy in both languages.
import { computed, provide, ref } from 'vue'
import type { ExampleEntry } from '../../../examples/registry'
import { demoComponent } from '../demos'
import { sourceHref, useMountedDark, useSiteLocale } from '../i18n'

const props = defineProps<{ entry: ExampleEntry }>()
const full = defineModel<boolean>('full', { default: false })
const { t, locale } = useSiteLocale()
provide('vw-site-locale', locale)
const dark = useMountedDark()
const demo = computed(() => demoComponent(props.entry.component))
// Set once the demo has loaded and hydrated (or mounted after a client-side navigation); the browser tests wait for it.
const ready = ref(false)
</script>

<template>
  <section class="vw-site-frame" :aria-label="t.demo" :data-ready="ready || undefined">
    <div class="vw-site-frame-bar">
      <span class="vw-site-frame-title">{{ t.demo }}</span>
      <span class="vw-site-frame-actions">
        <button type="button" class="vw-site-chip" :aria-pressed="full" @click="full = !full">{{ t.fullWidth }}</button>
        <a class="vw-site-chip" :href="sourceHref(entry.component)" target="_blank" rel="noopener">{{ t.viewOnGitHub }} ↗</a>
      </span>
    </div>
    <div class="vw-site-demo vp-raw">
      <!-- Scoped rules do not match the scope root, so the demo's `.dark` class goes on this inner element. -->
      <div class="vw-site-demo-body" :class="{ dark }">
        <Suspense @resolve="ready = true" @pending="ready = false">
          <component :is="demo" :key="entry.id" />
        </Suspense>
      </div>
    </div>
    <p class="vw-site-frame-hint">{{ t.resizeHint }}</p>
  </section>
</template>
