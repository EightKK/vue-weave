import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import { hashDemoInputs, writeDemoStamp } from './scripts/demo-build.mjs'

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
  build: {
    // `npm run build:demo` builds the documentation site (site/, VitePress) into preview/ first; these pages are added
    // next to it: the production planning demo at demo/ and gallery.html, the old address of the example gallery, which
    // forwards to the site's example and showcase pages.
    outDir: '../preview',
    emptyOutDir: false,
    rolldownOptions: {
      input: {
        demo: fileURLToPath(new URL('./examples/demo/index.html', import.meta.url)),
        gallery: fileURLToPath(new URL('./examples/gallery.html', import.meta.url)),
      },
    },
  },
})
