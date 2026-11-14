import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }

export default defineConfig({
  root: 'examples',
  base: './',
  plugins: [vue()],
  // The demo header shows the package's major.minor version without hard-coding it.
  define: { __VUE_WEAVE_VERSION__: JSON.stringify(version) },
  build: { outDir: '../preview', emptyOutDir: true },
})
