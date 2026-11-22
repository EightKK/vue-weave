import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { checkNpmVersion, publishRelease, registryRetryDelays } from '../scripts/publish-release.mjs'

// Release tooling: the npm workflow publishes only the verified Release tarball, at most once.

const version = '1.2.3'
const filename = `eightkk-vue-weave-${version}.tgz`
const tarballBytes = Buffer.from('verified tarball bytes')
const integrity = 'sha512-' + createHash('sha512').update(tarballBytes).digest('base64')
const sha256 = createHash('sha256').update(tarballBytes).digest('hex')
const env = { GITHUB_EVENT_NAME: 'release', GITHUB_REPOSITORY: 'EightKK/vue-weave', GITHUB_REF_NAME: `v${version}` }

function metadata(value = integrity) {
  return { status: 200, ok: true, json: async () => ({ name: '@eightkk/vue-weave', version, dist: { integrity: value } }) }
}

const missing = { status: 404, ok: false, json: async () => ({}) }

// `registry` lists the responses of successive registry reads; the last one repeats.
async function withRelease({
  packageVersion = version,
  packedVersion = version,
  checksum = `${sha256}  ${filename}\n`,
  npmVersion = '11.6.2\n',
  registry = [missing, metadata()],
  delays = [0, 0, 0],
} = {}, check) {
  const root = await mkdtemp(join(tmpdir(), 'vw-publish-test-'))
  const calls = []
  const reads = []
  const io = {
    async run(command, args) {
      calls.push([command, ...args])
      if (command === 'gh') {
        const directory = args[args.indexOf('--dir') + 1]
        await writeFile(join(directory, filename), tarballBytes)
        await writeFile(join(directory, 'SHA256SUMS'), checksum)
      }
    },
    read(command) {
      if (command === 'npm') return npmVersion
      if (command === 'tar') return JSON.stringify({ name: '@eightkk/vue-weave', version: packedVersion })
      throw new Error(`unexpected command ${command}`)
    },
    async fetch(url) {
      reads.push(url)
      return registry[Math.min(reads.length - 1, registry.length - 1)]
    },
    sleep: async () => {},
    log: () => {},
  }
  try {
    await writeFile(join(root, 'package.json'), JSON.stringify({ name: '@eightkk/vue-weave', version: packageVersion }))
    await check({ run: () => publishRelease({ env, root, io, delays }), calls, reads })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

function published(calls) {
  return calls.filter(([command, subcommand]) => command === 'npm' && subcommand === 'publish')
}

test('publishes a new version once and confirms the registry integrity', async () => {
  await withRelease({}, async ({ run, calls }) => {
    const result = await run()
    assert.equal(result.integrity, integrity)
    const publishes = published(calls)
    assert.equal(publishes.length, 1)
    assert.ok(publishes[0].includes('--ignore-scripts'))
    assert.deepEqual(publishes[0].slice(publishes[0].indexOf('--tag'), publishes[0].indexOf('--tag') + 2), ['--tag', 'latest'])
  })
})

test('waits for the registry to list a fresh publication', async () => {
  await withRelease({ registry: [missing, missing, missing, metadata()] }, async ({ run, reads }) => {
    await run()
    assert.equal(reads.length, 4)
  })
})

test('the default registry wait covers the several minutes npm can take to list a new version', async () => {
  const total = registryRetryDelays.reduce((sum, ms) => sum + ms, 0)
  // 1.1.0 and 1.2.0 were listed only after the earlier 90-second wait had run out.
  assert.ok(total >= 8 * 60_000 && total <= 15 * 60_000, `waits ${total / 1000} s in total`)
  // A version listed late in that window passes without a rerun, and each wait is logged.
  const registry = [missing, ...registryRetryDelays.slice(1).map(() => missing), metadata()]
  await withRelease({ registry, delays: registryRetryDelays }, async ({ run, reads }) => {
    await run()
    assert.equal(reads.length, registryRetryDelays.length + 1)
  })
})

test('reports a registry that never lists the publication instead of comparing null', async () => {
  await withRelease({ registry: [missing] }, async ({ run, calls }) => {
    await assert.rejects(run(), /did not list @eightkk\/vue-weave@1\.2\.3 in time/)
    assert.equal(published(calls).length, 1)
  })
})

test('a rerun after publication does not publish again', async () => {
  await withRelease({ registry: [metadata()] }, async ({ run, calls }) => {
    await run()
    assert.equal(published(calls).length, 0)
  })
})

test('rejects a registry version that holds different bytes', async () => {
  await withRelease({ registry: [metadata('sha512-other')] }, async ({ run, calls }) => {
    await assert.rejects(run(), /npm integrity must match/)
    assert.equal(published(calls).length, 0)
  })
})

test('rejects a release tag that does not match package.json', async () => {
  await withRelease({ packageVersion: '1.2.4' }, async ({ run, calls }) => {
    await assert.rejects(run(), /release tag must match/)
    assert.equal(published(calls).length, 0)
  })
})

test('rejects a tarball whose version differs from the tag', async () => {
  await withRelease({ packedVersion: '1.2.4' }, async ({ run, calls }) => {
    await assert.rejects(run(), /tarball version must match/)
    assert.equal(published(calls).length, 0)
  })
})

test('rejects a tarball that does not match SHA256SUMS', async () => {
  await withRelease({ checksum: `${'0'.repeat(64)}  ${filename}\n` }, async ({ run, calls }) => {
    await assert.rejects(run(), /does not match SHA256SUMS/)
    assert.equal(published(calls).length, 0)
  })
})

test('rejects an npm CLI too old for trusted publishing before downloading anything', async () => {
  await withRelease({ npmVersion: '11.5.0\n' }, async ({ run, calls }) => {
    await assert.rejects(run(), /npm 11\.5\.0 cannot use trusted publishing/)
    assert.equal(calls.some(([command]) => command === 'gh'), false)
  })
  assert.doesNotThrow(() => checkNpmVersion('11.5.1'))
  assert.doesNotThrow(() => checkNpmVersion('12.0.0'))
  assert.throws(() => checkNpmVersion('10.9.9'), /cannot use trusted publishing/)
  assert.throws(() => checkNpmVersion('not a version'), /Cannot read the npm version/)
})

test('runs only from a release of the repository', async () => {
  await assert.rejects(publishRelease({ env: { ...env, GITHUB_EVENT_NAME: 'push' }, io: {} }), /GitHub Release/)
  await assert.rejects(publishRelease({ env: { ...env, GITHUB_REPOSITORY: 'someone/fork' }, io: {} }), /EightKK\/vue-weave/)
})
