import { access, readdir, readFile, rmdir, rm, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { listTree, reachableDeclarations } from './declaration-graph.mjs'

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

// vue-tsc emits a declaration for every file under src/. Keep only the ones reachable from the two
// public entry declarations; internal helper declarations are not part of the API.
const typesRoot = new URL('../dist/types/', import.meta.url)
const kept = await reachableDeclarations([entry, new URL('core/index.d.ts', typesRoot)].map(url => fileURLToPath(url)))
const tree = await listTree(fileURLToPath(typesRoot))
for (const file of tree.files) {
  if (!kept.has(file)) await rm(file)
}
for (const directory of tree.directories) {
  if ((await readdir(directory)).length === 0) await rmdir(directory)
}
