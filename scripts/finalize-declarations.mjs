import { access, readFile, writeFile } from 'node:fs/promises'

// Run after vue-tsc; validate targets before rewriting only the generated entry.
// vue-tsc emits Foo.vue.d.ts, but NodeNext cannot resolve it from './Foo.vue'.
// The declaration-only './Foo.vue.js' path resolves that same file in both
// NodeNext and Bundler mode. Runtime component imports remain bundled by Vite.
const entry = new URL('../dist/types/index.d.ts', import.meta.url)
const declaration = await readFile(entry, 'utf8')
const vueImports = /from (['"])(\.\/components\/[^'"]+\.vue)\1/g
for (const [, , specifier] of declaration.matchAll(vueImports)) {
  await access(new URL(specifier + '.d.ts', entry))
}
// Vite emits the stylesheet separately. Its source path is not a declaration dependency.
const finalized = declaration
  .replace(/^import (['"])\.\/styles\/style\.css\1;?\r?\n/gm, '')
  .replace(vueImports, (_match, quote, specifier) => `from ${quote}${specifier}.js${quote}`)
await writeFile(entry, finalized)
