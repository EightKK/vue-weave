<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Copy } from './copy'

const props = defineProps<{
  text: Copy
  examples: readonly { label: string; code: string; path: string }[]
}>()
const active = ref(0)
const selected = computed(() => props.examples[active.value]!)
</script>

<template>
  <div class="production-code">
    <div v-if="examples.length > 1" class="production-switch" role="group" :aria-label="text.code">
      <button v-for="(example, i) in examples" :key="i" type="button" :aria-pressed="i === active" @click="active = i">
        {{ example.label }}
      </button>
    </div>
    <pre tabindex="0"><code>{{ selected.code }}</code></pre>
    <a :href="'https://github.com/EightKK/vue-weave/blob/main/examples/production/' + selected.path">{{ text.source }} ↗</a>
  </div>
</template>
