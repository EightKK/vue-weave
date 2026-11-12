import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

// Run through npm run test:package so the build is fresh and npm's CLI path is available.
// Only the temporary consumer installs dependencies; the repository lockfile is unchanged.
const root = fileURLToPath(new URL('../', import.meta.url))
const npmCli = process.env.npm_execpath
assert.ok(npmCli, 'Run this check with npm run test:package')
const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
const artifacts = join(root, 'artifacts')
await mkdir(artifacts, { recursive: true })

function npm(args, cwd, capture = false) {
  return execFileSync(process.execPath, [npmCli, ...args], {
    cwd,
    encoding: 'utf8',
    stdio: capture ? ['ignore', 'pipe', 'inherit'] : 'inherit',
    windowsHide: true,
  })
}

// Inspect the actual tarball inventory before installing any of its contents.
const [packed] = JSON.parse(npm([
  'pack', '--ignore-scripts', '--json', '--pack-destination', artifacts,
], root, true))
const files = new Set(packed.files.map(file => file.path))
for (const path of files) {
  assert.ok(
    /^(dist\/|docs\/|package\.json$|README(?:\.ja)?\.md$|LICENSE$|THIRD_PARTY_NOTICES\.md$|CONTRIBUTING\.md$|CHANGELOG\.md$)/.test(path),
    `Unexpected package file: ${path}`,
  )
  assert.ok(!/(^|\/)(\.env(?:\..*)?|\.npmrc|node_modules)(\/|$)|\.(?:pem|key|p12|pfx|tgz|map|log)$/i.test(path), `Private or generated file in package: ${path}`)
}
for (const path of [
  'dist/index.js', 'dist/core.js', 'dist/style.css',
  'dist/types/index.d.ts', 'dist/types/core/index.d.ts',
  'LICENSE', 'THIRD_PARTY_NOTICES.md', 'README.md', 'README.ja.md',
]) assert.ok(files.has(path), `Missing package file: ${path}`)

const tarball = resolve(artifacts, packed.filename)
assert.equal(dirname(tarball), resolve(artifacts), 'Tarball must stay in artifacts/')
const temporaryRoot = await realpath(tmpdir())
const consumer = await mkdtemp(join(temporaryRoot, 'vft-consumer-'))
const resolvedConsumer = await realpath(consumer)
const consumerPath = relative(temporaryRoot, resolvedConsumer)
assert.ok(!isAbsolute(consumerPath) && consumerPath.startsWith('vft-consumer-') && !consumerPath.includes(sep), 'Consumer must be a direct child of the temporary directory')

try {
  await writeFile(join(consumer, 'package.json'), JSON.stringify({ private: true, type: 'module' }))
  const tsc = join(root, 'node_modules/typescript/bin/tsc')
  const installOptions = ['--ignore-scripts', '--no-audit', '--no-fund', '--package-lock=false']
  npm(['install', ...installOptions, '--omit=peer', tarball], consumer)
  const coreProbe = `
    import assert from 'node:assert/strict'
    import { createTimeScale, layoutLayeredGraph } from '${manifest.name}/core'
    assert.equal(createTimeScale({ start: 0, end: 10 }, 2).toTime(10), 5)
    assert.equal(layoutLayeredGraph([{ id: 'a' }], []).boxes.size, 1)
    assert.throws(() => import.meta.resolve('vue'), { code: 'ERR_MODULE_NOT_FOUND' })
  `
  execFileSync(process.execPath, ['--input-type=module', '--eval', coreProbe], { cwd: consumer, stdio: 'inherit', windowsHide: true })
  await writeFile(join(consumer, 'core.mts'), `
    import { createTimeScale, type TimeRange } from '${manifest.name}/core'
    const range: TimeRange = { start: 0, end: 10 }
    void createTimeScale(range, 2)
  `)
  await writeFile(join(consumer, 'tsconfig.core.json'), JSON.stringify({
    compilerOptions: {
      target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext',
      noEmit: true, strict: true, noUncheckedSideEffectImports: true, lib: ['ES2022'], types: [],
    },
    files: ['core.mts'],
  }))
  execFileSync(process.execPath, [tsc, '--project', 'tsconfig.core.json'], { cwd: consumer, stdio: 'inherit', windowsHide: true })

  npm(['install', ...installOptions, `vue@${manifest.devDependencies.vue}`], consumer)
  const ssrProbe = `
    import assert from 'node:assert/strict'
    import { readFileSync } from 'node:fs'
    import { createSSRApp, h } from 'vue'
    import { renderToString } from 'vue/server-renderer'
    import { NetworkGraph, GanttChart, useEditHistory } from '${manifest.name}'
    assert.equal(typeof useEditHistory, 'function')
    for (const [component, props] of [
      [NetworkGraph, { nodes: [], edges: [] }],
      [GanttChart, { rows: [], bars: [], range: { start: 0, end: 10 } }],
    ]) assert.ok((await renderToString(createSSRApp({ render: () => h(component, props) }))).length > 0)
    assert.match(readFileSync(new URL(import.meta.resolve('${manifest.name}/style.css')), 'utf8'), /\\.vft-/)
  `
  execFileSync(process.execPath, ['--input-type=module', '--eval', ssrProbe], { cwd: consumer, stdio: 'inherit', windowsHide: true })

  const typeProbe = `
    import { NetworkGraph, GanttChart, useEditHistory, type TimelineBar } from '${manifest.name}'
    import { createTimeScale, type TimeRange } from '${manifest.name}/core'
    const range: TimeRange = { start: 0, end: 10 }
    const bar: TimelineBar = { id: 'b', rowId: 'r', label: 'Bar', ...range }
    const history = useEditHistory([bar])
    void [NetworkGraph, GanttChart, history, createTimeScale(range, 2)]
  `
  await writeFile(join(consumer, 'consumer.ts'), typeProbe)
  await writeFile(join(consumer, 'styled-consumer.ts'), `import './consumer.js'\nimport '${manifest.name}/style.css'\n`)
  await writeFile(join(consumer, 'styles.d.ts'), "declare module '*.css' {}\n")
  for (const [module, moduleResolution] of [
    ['ESNext', 'Bundler'],
    ['NodeNext', 'NodeNext'],
  ]) {
    const compilerArguments = [
      tsc, '--noEmit', '--strict', '--noUncheckedSideEffectImports', '--target', 'ES2022', '--lib', 'ES2022,DOM,DOM.Iterable',
      '--module', module, '--moduleResolution', moduleResolution, '--types', 'vue',
    ]
    execFileSync(process.execPath, [...compilerArguments, 'consumer.ts'], { cwd: consumer, stdio: 'inherit', windowsHide: true })
    execFileSync(process.execPath, [...compilerArguments, 'styled-consumer.ts', 'styles.d.ts'], { cwd: consumer, stdio: 'inherit', windowsHide: true })
  }
  console.log(`Package verified: ${relative(root, tarball)} (${files.size} files)`)
  console.log(`SHA-512 integrity: ${packed.integrity}`)
} finally {
  // This is only the unique directory created above, never a caller-supplied path.
  await rm(resolvedConsumer, { recursive: true, force: true })
}
