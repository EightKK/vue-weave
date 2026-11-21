import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import { hashDemoInputs, writeDemoStamp } from './scripts/demo-build.mjs'

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }
const projectRoot = fileURLToPath(new URL('./', import.meta.url))

// Records the sources a successful build came from, so Start.cmd rebuilds only when preview/ is stale.
function demoBuildStamp(): Plugin {
  let inputs: string | undefined
  return {
    name: 'vue-weave:demo-build-stamp',
    apply: 'build',
    async buildStart() {
      inputs = await hashDemoInputs(projectRoot)
    },
    async writeBundle() {
      if (inputs) await writeDemoStamp(projectRoot, inputs)
    },
  }
}

export default defineConfig({
  root: 'examples',
  base: './',
  plugins: [vue(), demoBuildStamp()],
  // The demo header shows the package's major.minor version without hard-coding it.
  define: { __VUE_WEAVE_VERSION__: JSON.stringify(version) },
  build: {
    outDir: '../preview',
    emptyOutDir: true,
    rolldownOptions: {
      input: {
        demo: fileURLToPath(new URL('./examples/index.html', import.meta.url)),
        gallery: fileURLToPath(new URL('./examples/gallery.html', import.meta.url)),
      },
    },
  },
})
