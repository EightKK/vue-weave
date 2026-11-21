import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { checkApiBaseline } from './api-baseline.mjs'
import { reachableDeclarations } from './declaration-graph.mjs'

// Run through npm run test:package so the build is fresh and npm's CLI path is available.
// Only the temporary consumer installs dependencies; the repository lockfile is unchanged.
const root = fileURLToPath(new URL('../', import.meta.url))
const npmCli = process.env.npm_execpath
assert.ok(npmCli, 'Run this check with npm run test:package')
const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
const artifacts = join(root, 'artifacts')
// The reviewed tarball goes to artifacts/package-check/ by default, away from the verified release sets in
// artifacts/release/. prepare:release sets VW_PACK_DESTINATION to its own candidate directory inside artifacts/.
const destination = resolve(process.env.VW_PACK_DESTINATION || join(artifacts, 'package-check'))
const destinationPath = relative(artifacts, destination)
assert.ok(destinationPath && !destinationPath.startsWith('..') && !isAbsolute(destinationPath), 'VW_PACK_DESTINATION must be inside artifacts/')
assert.ok(destinationPath.split(sep)[0] !== 'release', 'VW_PACK_DESTINATION must not be a verified release set')
await mkdir(destination, { recursive: true })

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
  'pack', '--ignore-scripts', '--json', '--pack-destination', destination,
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

const tarball = resolve(destination, packed.filename)
assert.equal(dirname(tarball), destination, 'Tarball must stay in its destination')
const temporaryRoot = await realpath(tmpdir())
const consumer = await mkdtemp(join(temporaryRoot, 'vw-consumer-'))
const resolvedConsumer = await realpath(consumer)
const consumerPath = relative(temporaryRoot, resolvedConsumer)
assert.ok(!isAbsolute(consumerPath) && consumerPath.startsWith('vw-consumer-') && !consumerPath.includes(sep), 'Consumer must be a direct child of the temporary directory')

try {
  await writeFile(join(consumer, 'package.json'), JSON.stringify({ private: true, type: 'module' }))
  const tsc = join(root, 'node_modules/typescript/bin/tsc')
  const installOptions = ['--ignore-scripts', '--no-audit', '--no-fund', '--package-lock=false']
  npm(['install', ...installOptions, '--omit=peer', tarball], consumer)
  // Only declarations reachable from the two public entries may ship, so internal helper files cannot be deep-imported.
  const installedTypes = join(consumer, 'node_modules', manifest.name, 'dist', 'types')
  const reachable = await reachableDeclarations(['index.d.ts', 'core/index.d.ts'].map(entry => join(installedTypes, entry)))
  const reachablePaths = new Set([...reachable].map(path => `dist/types/${relative(installedTypes, path).split(sep).join('/')}`))
  const unreachable = [...files].filter(path => path.startsWith('dist/types/') && !reachablePaths.has(path))
  assert.deepEqual(unreachable, [], `Declaration files not reachable from the public entries: ${unreachable.join(', ')}`)
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
  // Export names, declarations, component surfaces and CSS custom properties must match api/public-api.md.
  await checkApiBaseline(join(consumer, 'node_modules', manifest.name))
  const ssrProbe = `
    import assert from 'node:assert/strict'
    import { readFileSync } from 'node:fs'
    import { createSSRApp, h } from 'vue'
    import { renderToString } from 'vue/server-renderer'
    import { NetworkGraph, GanttChart, TaskBoard, useEditHistory } from '${manifest.name}'
    import { GraphPalette, PropertyInspector } from '${manifest.name}'
    assert.equal(typeof useEditHistory, 'function')
    for (const [component, props] of [
      [NetworkGraph, { nodes: [], edges: [] }],
      [GanttChart, { rows: [], bars: [], range: { start: 0, end: 10 } }],
      [GraphPalette, { items: [{ id: 'step', label: 'Step', shape: 'diamond' }] }],
      [PropertyInspector, { item: { id: 'a' }, fields: [{ id: 'id', kind: 'text', label: 'ID', get: item => item.id }] }],
      [TaskBoard, { columns: [{ id: 'todo', label: 'To do' }], cards: [] }],
    ]) assert.ok((await renderToString(createSSRApp({ render: () => h(component, props) }))).length > 0)
    assert.match(readFileSync(new URL(import.meta.resolve('${manifest.name}/style.css')), 'utf8'), /\\.vw-/)
    const exportedManifest = JSON.parse(readFileSync(new URL(import.meta.resolve('${manifest.name}/package.json')), 'utf8'))
    assert.equal(exportedManifest.version, '${manifest.version}')
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
  // Typed item data: a Vue template constructs the component with its props, so `new` infers the item types the
  // same way, and the slot and event types are read from the instance. Untyped items keep `unknown` data.
  const typedProbe = `
    import { h } from 'vue'
    import {
      NetworkGraph, GanttChart, type GanttChartExposed, type GraphEdge, type GraphNodeMove, type NetworkGraphExposed,
      type NetworkNode, type TimelineBar, type TimelineEdit, type TimelineRow,
      GraphPalette, PropertyInspector, readPaletteDrop, type InspectorChange,
      TaskBoard, type TaskBoardCard, type TaskBoardCardMove, type TaskBoardExposed,
    } from '${manifest.name}'
    interface MyData { owner: string }
    type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false
    function assertType<T extends true>(value?: T) { return value }
    const nodes: NetworkNode<MyData>[] = [{ id: 'a', label: 'A', data: { owner: 'Ada' } }]
    const edges: GraphEdge<number>[] = []
    const graph = new NetworkGraph({ nodes, edges })
    type NodeSlot = Parameters<NonNullable<typeof graph.$slots.node>>[0]
    type EdgeSlot = Parameters<NonNullable<typeof graph.$slots.edge>>[0]
    assertType<Equal<NodeSlot['node']['data'], MyData | undefined>>()
    assertType<Equal<EdgeSlot['edge']['data'], number | undefined>>()
    assertType<Equal<Parameters<NonNullable<typeof graph.$props['onNode-move']>>[0], GraphNodeMove>>()
    const plain = new NetworkGraph({ nodes: [] as NetworkNode[], edges: [] as GraphEdge[] })
    assertType<Equal<Parameters<NonNullable<typeof plain.$slots.node>>[0]['node']['data'], unknown>>()
    const rows: TimelineRow<{ team: string }>[] = [{ id: 'r', label: 'Row', data: { team: 'Core' } }]
    const bars: TimelineBar<MyData>[] = [{ id: 'b', rowId: 'r', label: 'Bar', start: 0, end: 1, data: { owner: 'Ada' } }]
    const chart = new GanttChart({ rows, bars, range: { start: 0, end: 10 } })
    type BarSlot = Parameters<NonNullable<typeof chart.$slots.bar>>[0]
    assertType<Equal<BarSlot['bar']['data'], MyData | undefined>>()
    assertType<Equal<Parameters<NonNullable<typeof chart.$props.onEdit>>[0], TimelineEdit>>()
    // @ts-expect-error The bar data is MyData, not any.
    void (({} as BarSlot).bar.data?.missing)
    const graphRef = undefined as InstanceType<typeof NetworkGraph> | undefined
    graphRef?.fit()
    const typedRef = undefined as NetworkGraphExposed<NetworkNode<MyData>> | undefined
    typedRef?.exportSvg({ nodeLabel: node => node.data?.owner ?? node.label })
    const chartRef = undefined as GanttChartExposed<TimelineRow, TimelineBar<MyData>> | undefined
    chartRef?.exportSvg({ barLabel: bar => bar.data?.owner ?? bar.label })
    void h(NetworkGraph, { nodes, edges })
    // The diagram editor parts infer their item types the same way.
    const palette = new GraphPalette({ items: [{ id: 'p', label: 'P', data: { owner: 'Ada' } }] })
    assertType<Equal<Parameters<NonNullable<typeof palette.$slots.item>>[0]['item']['data'], { owner: string } | undefined>>()
    const inspector = new PropertyInspector({ item: nodes[0]!, fields: [{ id: 'owner', kind: 'text', label: 'Owner', get: node => node.data?.owner ?? null }] })
    assertType<Equal<Parameters<NonNullable<typeof inspector.$props.onChange>>[0], InspectorChange>>()
    void readPaletteDrop(null)
    const cards: TaskBoardCard<MyData>[] = [{ id: 'c', columnId: 'todo', label: 'Card', data: { owner: 'Ada' } }]
    const board = new TaskBoard({ columns: [{ id: 'todo', label: 'To do' }], cards })
    type CardSlot = Parameters<NonNullable<typeof board.$slots.card>>[0]
    assertType<Equal<CardSlot['card']['data'], MyData | undefined>>()
    assertType<Equal<Parameters<NonNullable<typeof board.$props['onCard-move']>>[0], TaskBoardCardMove>>()
    const boardRef = undefined as TaskBoardExposed<TaskBoardCard<MyData>> | undefined
    boardRef?.focusCard('c')
    void h(TaskBoard, { columns: [], cards })
  `
  await writeFile(join(consumer, 'consumer.ts'), typeProbe)
  await writeFile(join(consumer, 'typed-consumer.ts'), typedProbe)
  await writeFile(join(consumer, 'styled-consumer.ts'), `import './consumer.js'\nimport '${manifest.name}/style.css'\n`)
  await writeFile(join(consumer, 'styles.d.ts'), "declare module '*.css' {}\n")
  // The declarations must type-check against the lowest Vue the peer range allows as well as the pinned one:
  // a type that only newer Vue declares (such as two-argument ShallowRef) would break consumers on older Vue.
  const minimumVue = manifest.peerDependencies.vue.match(/^\^(\d+\.\d+\.\d+)$/)?.[1]
  assert.ok(minimumVue, `Unexpected Vue peer range: ${manifest.peerDependencies.vue}`)
  for (const vueVersion of [manifest.devDependencies.vue, minimumVue]) {
    if (vueVersion !== manifest.devDependencies.vue) npm(['install', ...installOptions, `vue@${vueVersion}`], consumer)
    const installedVue = JSON.parse(await readFile(join(consumer, 'node_modules/vue/package.json'), 'utf8')).version
    assert.equal(installedVue, vueVersion, 'Consumer Vue version')
    for (const [module, moduleResolution] of [
      ['ESNext', 'Bundler'],
      ['NodeNext', 'NodeNext'],
    ]) {
      const compilerArguments = [
        tsc, '--noEmit', '--strict', '--noUncheckedSideEffectImports', '--target', 'ES2022', '--lib', 'ES2022,DOM,DOM.Iterable',
        '--module', module, '--moduleResolution', moduleResolution, '--types', 'vue',
      ]
      execFileSync(process.execPath, [...compilerArguments, 'consumer.ts'], { cwd: consumer, stdio: 'inherit', windowsHide: true })
      execFileSync(process.execPath, [...compilerArguments, 'typed-consumer.ts'], { cwd: consumer, stdio: 'inherit', windowsHide: true })
      execFileSync(process.execPath, [...compilerArguments, 'styled-consumer.ts', 'styles.d.ts'], { cwd: consumer, stdio: 'inherit', windowsHide: true })
    }
    console.log(`Consumer types verified with Vue ${vueVersion}`)
  }
  console.log(`Package verified: ${relative(root, tarball)} (${files.size} files)`)
  console.log(`SHA-512 integrity: ${packed.integrity}`)
} finally {
  // This is only the unique directory created above, never a caller-supplied path.
  await rm(resolvedConsumer, { recursive: true, force: true })
}
