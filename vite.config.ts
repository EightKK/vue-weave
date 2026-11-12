import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  build: {
    lib: {
      entry: { index: 'src/index.ts', core: 'src/core/index.ts' },
      formats: ['es'],
      fileName: (_format, name) => name + '.js',
      cssFileName: 'style',
    },
    rollupOptions: { external: ['vue'] },
  },
})
