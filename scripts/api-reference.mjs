// Generates the type reference of the documentation site (site/api/reference/, gitignored) with TypeDoc,
// typedoc-plugin-markdown and typedoc-vitepress-theme, from the options in typedoc.json. `npm run build:demo` and
// `npm run dev` run it before VitePress.
import { performance } from 'node:perf_hooks'
import { Minimatch } from 'minimatch'
import * as td from 'typedoc'

// package.json overrides TypeDoc's minimatch to 11 (10.x has a reported advisory). Minimatch 11 made `matchOne`
// private, and TypeDoc still calls it once, to decide whether to recurse into a directory while expanding the entry
// points. Matching the path with `partial` gives the same answer for the row TypeDoc asks about, since it asks for every
// row of the set in turn and only needs to know whether any row matches.
if (typeof Minimatch.prototype.matchOne !== 'function') {
  Minimatch.prototype.matchOne = function matchOne(file, _row, partial) {
    return this.match(file.join('/'), partial)
  }
}

const start = performance.now()
const app = await td.Application.bootstrapWithPlugins({}, [
  new td.TypeDocReader(),
  new td.TSConfigReader(),
  new td.ArgumentsReader(300),
])
const project = await app.convert()
if (!project) {
  console.error('TypeDoc could not convert the project.')
  process.exit(1)
}
// TypeDoc names each entry module after its file (`index` twice). Name them after the import paths instead; the module
// name is also its folder in the output, so the pages are /api/reference/vue-weave/... and /api/reference/core/....
const moduleNames = new Map([['index', 'vue-weave'], ['core/index', 'core'], ['core', 'core']])
for (const module of project.children ?? []) module.name = moduleNames.get(module.name) ?? module.name
app.validate(project)
if (app.logger.hasErrors()) process.exit(1)
await app.generateOutputs(project)
if (app.logger.hasErrors() || app.logger.hasWarnings()) {
  console.error('The type reference was generated with warnings or errors; see above.')
  process.exit(1)
}
console.log(`Type reference written to ${app.options.getValue('out')} in ${Math.round(performance.now() - start)} ms.`)
