<script setup lang="ts">
// The examples index: a category list on the left and a card grid of the registered examples. The chosen category is
// kept in the URL hash (#graph, #timeline, ...), so a category can be linked to.
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { categories, examplesOfKind, type ExampleCategory } from '../../../examples/registry'
import { useSiteLocale } from '../i18n'
import ExampleCard from './ExampleCard.vue'

const { t, pick } = useSiteLocale()
const examples = examplesOfKind('example')
const category = ref<ExampleCategory | undefined>()
const counts = computed(() => new Map(categories.map(item => [item.id, examples.filter(entry => entry.category === item.id).length])))
const shown = computed(() => category.value ? examples.filter(entry => entry.category === category.value) : examples)
const heading = computed(() => {
  const current = categories.find(item => item.id === category.value)
  return current ? pick(current.title) : t.value.allExamples
})

function readHash() {
  const id = decodeURIComponent(location.hash.slice(1))
  category.value = categories.some(item => item.id === id) ? id as ExampleCategory : undefined
}
function choose(id: ExampleCategory | undefined) {
  category.value = id
  history.replaceState(history.state, '', id ? '#' + id : location.pathname + location.search)
}
onMounted(() => {
  readHash()
  addEventListener('hashchange', readHash)
})
onBeforeUnmount(() => removeEventListener('hashchange', readHash))
</script>

<template>
  <div class="vw-site-index">
    <nav class="vw-site-index-nav" :aria-label="t.categories">
      <p class="vw-site-eyebrow">{{ t.categories }}</p>
      <ul>
        <li>
          <button type="button" :aria-pressed="category === undefined" @click="choose(undefined)">
            <span>{{ t.allExamples }}</span><span class="vw-site-count">{{ examples.length }}</span>
          </button>
        </li>
        <li v-for="item in categories" :key="item.id">
          <button type="button" :aria-pressed="category === item.id" :disabled="!counts.get(item.id)" @click="choose(item.id)">
            <span>{{ pick(item.title) }}</span><span class="vw-site-count">{{ counts.get(item.id) }}</span>
          </button>
        </li>
      </ul>
    </nav>
    <section class="vw-site-index-main" aria-labelledby="vw-site-index-title">
      <h2 id="vw-site-index-title">{{ heading }} <small>{{ t.exampleCount(shown.length) }}</small></h2>
      <ul class="vw-site-cards">
        <li v-for="entry in shown" :key="entry.id"><ExampleCard :entry="entry" /></li>
      </ul>
    </section>
  </div>
</template>
