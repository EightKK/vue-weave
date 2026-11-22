<script setup lang="ts">
// The default theme's layout with the live demo between the hero and the features of the home page.
import DefaultTheme from 'vitepress/theme'
import HomeDemo from './components/HomeDemo.vue'
import { useSiteLocale } from './i18n'
import { provideDemoLocale } from '../../../examples/i18n'

const { locale } = useSiteLocale()
// Every demo on the site (the home demo, example and showcase pages) shows the language of the page.
provideDemoLocale(locale)
</script>

<template>
  <DefaultTheme.Layout>
    <template #home-hero-after>
      <section class="vw-site-home-live" :aria-label="locale === 'ja' ? 'ライブデモ' : 'Live demo'">
        <p class="vw-site-home-live-hint">
          {{ locale === 'ja'
            ? 'タスクを選ぶと、もう一方のビューでも選択されます。バーをドラッグすると変更案が出され、このページがそれを適用します。'
            : 'Select a task in either view to select it in the other. Drag a bar: the chart proposes the change and this page applies it.' }}
        </p>
        <HomeDemo />
      </section>
    </template>
  </DefaultTheme.Layout>
</template>
