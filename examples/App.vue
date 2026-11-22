<script setup lang="ts">
import { computed, ref } from 'vue'
import { demos, demosIn } from './demos'
import GraphGanttView from './components/GraphGanttView.vue'

const releaseLine = __VUE_WEAVE_VERSION__.split('.').slice(0, 2).join('.')

const preset = ref('manufacturing')
const datasets = demosIn('dataset'), standaloneDemos = demosIn('standalone'), showcases = demosIn('gallery')
// A standalone demo or showcase replaces the graph and timeline of this page.
const activeDemo = computed(() => demos.find(item => item.id === preset.value)?.component)
const dark = ref(false)
const builtInTheme = ref<'' | 'vw-theme-dark' | 'vw-theme-auto'>('')
const main = ref<InstanceType<typeof GraphGanttView>>()
// A data set button reloads the data set, also the one already shown.
function chooseDataset(id: string) {
  preset.value = id
  main.value?.reset(id)
}
</script>

<template>
  <div class="demo" :class="[{ dark }, builtInTheme]">
    <header><a href="./gallery.html" class="wordmark">Vue Weave <span>{{ releaseLine }}</span></a><label><input v-model="dark" type="checkbox"> Dark theme</label><label class="theme-switch">Built-in theme <select v-model="builtInTheme"><option value="">Demo default</option><option value="vw-theme-dark">Dark</option><option value="vw-theme-auto">Auto (system)</option></select></label></header>
    <main>
      <div class="intro"><p class="eyebrow">INTERACTIVE EXAMPLES</p><h1>Relationships meet schedules.</h1><p>Explore connected data and editable timelines with Vue components.</p></div>
      <nav aria-label="Examples">
        <button v-for="item in datasets" :key="item.id" type="button" :aria-pressed="preset === item.id" @click="chooseDataset(item.id)">{{ item.label }}</button>
        <button v-for="item in standaloneDemos" :key="item.id" type="button" :aria-pressed="preset === item.id" @click="preset = item.id">{{ item.label }}</button>
      </nav>
      <nav class="gallery-nav" aria-labelledby="gallery-nav-label">
        <span id="gallery-nav-label" class="gallery-label">Design gallery</span>
        <button v-for="item in showcases" :key="item.id" type="button" :aria-pressed="preset === item.id" @click="preset = item.id">{{ item.label }}</button>
      </nav>
      <component :is="activeDemo" v-if="activeDemo" />
      <GraphGanttView v-else ref="main" v-model:preset="preset" />
      <footer>Vue 3 · TypeScript · SVG + HTML · MIT</footer>
    </main>
  </div>
</template>
