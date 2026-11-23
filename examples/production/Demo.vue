<script setup lang="ts">
import { computed, ref, watchEffect } from 'vue'
import { provideDemoLocale } from '../i18n'
import { copy, type Language } from './copy'
import ProductionWorkspace from './ProductionWorkspace.vue'

const view = ref<'planning' | 'lot' | 'approval' | 'sheet'>('planning')
// English by default; `?lang=ja` opens the Japanese copy.
const language = ref<Language>(new URLSearchParams(location.search).get('lang') === 'ja' ? 'ja' : 'en')
const theme = ref<'light' | 'dark'>()
const text = computed(() => copy[language.value])
watchEffect(() => { document.documentElement.lang = language.value })
// The shared example parts (the save status) read the language from here.
provideDemoLocale(language)

function toggleTheme() {
  const active = theme.value ?? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
  theme.value = active === 'dark' ? 'light' : 'dark'
}
</script>

<template>
  <div class="production-app" :data-theme="theme">
    <header class="production-header">
      <div class="production-header-inner">
        <a class="production-brand" href="../"><span class="production-mark" aria-hidden="true"><i></i><i></i><i></i></span>Vue Weave</a>
        <nav class="production-nav" :aria-label="language === 'ja' ? 'デモ' : 'Demos'">
          <button v-for="item in (['planning', 'lot', 'approval', 'sheet'] as const)" :key="item" type="button"
            :aria-current="view === item ? 'page' : undefined" @click="view = item">{{ text[item] }}</button>
        </nav>
        <div class="production-header-actions">
          <a :href="language === 'ja' ? '../ja/examples/' : '../examples/'">{{ text.gallery }}</a>
          <a href="https://github.com/EightKK/vue-weave">GitHub ↗</a>
          <div class="production-switch" role="group" :aria-label="text.language">
            <button type="button" lang="ja" :aria-pressed="language === 'ja'" @click="language = 'ja'">日本語</button>
            <button type="button" lang="en" :aria-pressed="language === 'en'" @click="language = 'en'">English</button>
          </div>
          <button class="production-theme" type="button" @click="toggleTheme">
            {{ theme === 'dark' ? text.themeLight : theme === 'light' ? text.themeDark : language === 'ja' ? 'テーマ' : 'Theme' }}
          </button>
        </div>
      </div>
    </header>
    <main class="production-page">
      <ProductionWorkspace :text="text" :ja="language === 'ja'" :view="view" />
    </main>
  </div>
</template>
