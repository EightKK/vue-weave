<script setup lang="ts">
// The production planning demo (Demo.vue) on a page of the documentation site: the same four views and their tabs,
// without the standalone app's header, language switch and theme switch, which the site provides. The language follows
// the site page, which provides its locale as `vw-site-locale` (see site/.vitepress/theme/components/ExampleFrame.vue);
// the colour scheme follows the `.dark` class that the site puts on the demo panel.
import { computed, inject, ref, type Ref } from 'vue'
import { copy, type Language } from './copy'
import ApprovalFlow from './ApprovalFlow.vue'
import WorkSheet from './WorkSheet.vue'
import LotFlow from './LotFlow.vue'
import ProductionPlan from './ProductionPlan.vue'
import './production.css'

const locale = inject<Readonly<Ref<string>> | undefined>('vw-site-locale', undefined)
const language = computed<Language>(() => locale?.value === 'ja' ? 'ja' : 'en')
const ja = computed(() => language.value === 'ja')
const text = computed(() => copy[language.value])
const view = ref<'planning' | 'lot' | 'approval' | 'sheet'>('planning')
</script>

<template>
  <div class="production-app production-showcase" :lang="language">
    <nav class="production-nav production-showcase-nav" :aria-label="ja ? 'デモ' : 'Demos'">
      <button v-for="item in (['planning', 'lot', 'approval', 'sheet'] as const)" :key="item" type="button"
        :aria-current="view === item ? 'page' : undefined" @click="view = item">{{ text[item] }}</button>
    </nav>
    <div class="production-page">
      <KeepAlive>
        <ProductionPlan v-if="view === 'planning'" :text="text" />
        <LotFlow v-else-if="view === 'lot'" :text="text" :is-japanese="ja" />
        <ApprovalFlow v-else-if="view === 'approval'" :ja="ja" />
        <WorkSheet v-else :ja="ja" />
      </KeepAlive>
    </div>
  </div>
</template>

<style>
.production-showcase.production-app { min-height: 0; color-scheme: light; border-radius: 10px; border: 1px solid var(--border); }
.dark .production-showcase.production-app { color-scheme: dark; }
.production-showcase-nav { padding-inline: 26px; border-bottom: 1px solid var(--border); background: var(--surface); border-radius: 10px 10px 0 0; }
@media (max-width: 720px) { .production-showcase-nav { padding-inline: 14px; } }
</style>
