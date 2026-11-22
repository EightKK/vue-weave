import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, it } from 'node:test'
// The Start.cmd rebuild check is a repository script, not part of the package.
import { demoBuildState, dependenciesInstalled, ensureDemoBuild, hashDemoInputs, writeDemoStamp } from '../scripts/demo-build.mjs'

let root

async function put(path, content) {
  await mkdir(dirname(join(root, path)), { recursive: true })
  await writeFile(join(root, path), content)
}

const lockfile = packages => JSON.stringify({ lockfileVersion: 3, packages: { '': { name: 'demo' }, ...packages } })

async function sources() {
  await put('src/index.ts', 'export const a = 1\n')
  await put('examples/main.ts', "import '../src'\n")
  await put('package.json', '{"name":"demo","version":"1.0.0"}\n')
  await put('package-lock.json', lockfile({ 'node_modules/vite': { version: '8.0.0' } }))
}

async function built() {
  await put('preview/index.html', '<!doctype html>')
  await writeDemoStamp(root, await hashDemoInputs(root))
}

function quietLog() {
  const lines = []
  const record = level => message => lines.push([level, message])
  return { lines, log: { log: record('log'), warn: record('warn'), error: record('error') } }
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'vue-weave-demo-build-'))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('demo build stamp', () => {
  it('hashes source contents and paths, ignoring line endings and hidden files', async () => {
    await sources()
    const before = await hashDemoInputs(root)
    await put('src/index.ts', 'export const a = 1\r\n')
    await put('examples/.DS_Store', 'finder')
    assert.equal(await hashDemoInputs(root), before)
    await put('src/index.ts', 'export const a = 2\n')
    assert.notEqual(await hashDemoInputs(root), before)
    await put('src/index.ts', 'export const a = 1\n')
    await put('src/extra.ts', '')
    assert.notEqual(await hashDemoInputs(root), before)
    // The site's configuration lives in a hidden directory that is listed as an input of its own.
    const withExtra = await hashDemoInputs(root)
    await put('site/.vitepress/config.ts', 'export default {}\n')
    assert.notEqual(await hashDemoInputs(root), withExtra)
  })

  it('reports missing, stale and current builds', async () => {
    await sources()
    assert.equal(await demoBuildState(root), 'missing')
    await put('preview/index.html', '<!doctype html>')
    assert.equal(await demoBuildState(root), 'stale', 'a build without a stamp is treated as stale')
    await writeDemoStamp(root, await hashDemoInputs(root))
    assert.equal(await demoBuildState(root), 'current')
    await put('examples/main.ts', "import '../src/index.ts'\n")
    assert.equal(await demoBuildState(root), 'stale')
    await put('preview/demo-build.json', '{ not json')
    assert.equal(await demoBuildState(root), 'stale')
  })

  it('compares installed packages with the lockfile and skips optional platform builds', async () => {
    await sources()
    assert.equal(await dependenciesInstalled(root), false, 'no node_modules')
    await put('package-lock.json', lockfile({
      'node_modules/vite': { version: '8.0.0' },
      'node_modules/@rolldown/binding-win32-x64-msvc': { version: '1.0.0', optional: true },
    }))
    await put('node_modules/.package-lock.json', lockfile({ 'node_modules/vite': { version: '8.0.0' } }))
    assert.equal(await dependenciesInstalled(root), true)
    await put('node_modules/.package-lock.json', lockfile({ 'node_modules/vite': { version: '7.9.0' } }))
    assert.equal(await dependenciesInstalled(root), false)
  })
})

describe('ensureDemoBuild', () => {
  it('serves a current build without running npm', async () => {
    await sources()
    await built()
    const calls = []
    assert.equal(await ensureDemoBuild(root, { npm: async args => { calls.push(args); return true }, ...quietLog() }), true)
    assert.deepEqual(calls, [])
  })

  it('installs dependencies and builds when the demo is missing', async () => {
    await sources()
    const calls = []
    const npm = async args => {
      calls.push(args.join(' '))
      if (args[0] === 'ci') await put('node_modules/.package-lock.json', lockfile({ 'node_modules/vite': { version: '8.0.0' } }))
      else await built()
      return true
    }
    assert.equal(await ensureDemoBuild(root, { npm, ...quietLog() }), true)
    assert.deepEqual(calls, ['ci', 'run build:demo'])
    assert.equal(await demoBuildState(root), 'current')
  })

  it('rebuilds a stale demo without reinstalling current dependencies', async () => {
    await sources()
    await built()
    await put('node_modules/.package-lock.json', lockfile({ 'node_modules/vite': { version: '8.0.0' } }))
    await put('src/index.ts', 'export const a = 3\n')
    const calls = []
    assert.equal(await ensureDemoBuild(root, { npm: async args => { calls.push(args.join(' ')); return true }, ...quietLog() }), true)
    assert.deepEqual(calls, ['run build:demo'])
  })

  it('falls back to the previous build with a warning when rebuilding fails', async () => {
    await sources()
    await built()
    await put('src/index.ts', 'export const a = 4\n')
    const { lines, log } = quietLog()
    const calls = []
    assert.equal(await ensureDemoBuild(root, { npm: async args => { calls.push(args.join(' ')); return false }, log }), true)
    assert.deepEqual(calls, ['ci'], 'a failed install skips the build')
    assert.ok(lines.some(([level, message]) => level === 'warn' && message.includes('previous build')))
  })

  it('fails when there is no build to fall back to', async () => {
    await sources()
    const { lines, log } = quietLog()
    assert.equal(await ensureDemoBuild(root, { npm: async () => false, log }), false)
    assert.ok(lines.some(([level]) => level === 'error'))
  })

  it('serves a copy without sources as it is', async () => {
    await put('preview/index.html', '<!doctype html>')
    const npm = async () => assert.fail('npm must not run without sources')
    assert.equal(await ensureDemoBuild(root, { npm, ...quietLog() }), true)
    await rm(join(root, 'preview'), { recursive: true })
    assert.equal(await ensureDemoBuild(root, { npm, ...quietLog() }), false)
  })
})
