import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'

// Publishes the verified tarball attached to a stable GitHub Release (see CONTRIBUTING.md).
// Every external effect goes through `io`, so test/publish-release.test.mjs can run it without GitHub or npm.

export const packageName = '@eightkk/vue-weave'
export const repositoryName = 'EightKK/vue-weave'
export const registry = 'https://registry.npmjs.org'
// npm reads the trusted-publishing OIDC token from 11.5.1 onwards.
export const minimumNpmVersion = [11, 5, 1]
// Waits between registry reads after publishing, about 90 seconds in total.
export const registryRetryDelays = [2000, 4000, 8000, 16000, 30000, 30000]

function compareVersions(a, b) {
  for (let index = 0; index < 3; index++) {
    if (a[index] !== b[index]) return a[index] - b[index]
  }
  return 0
}

export function checkNpmVersion(text) {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(text.trim())
  assert.ok(match, `Cannot read the npm version from "${text.trim()}"`)
  const version = match.slice(1).map(Number)
  assert.ok(
    compareVersions(version, minimumNpmVersion) >= 0,
    `npm ${version.join('.')} cannot use trusted publishing; ${minimumNpmVersion.join('.')} or later is required`,
  )
}

function defaultIo() {
  return {
    run: (command, args, options = {}) => execFileSync(command, args, { stdio: 'inherit', ...options }),
    read: (command, args) => execFileSync(command, args, { encoding: 'utf8' }),
    fetch: (url) => fetch(url, { signal: AbortSignal.timeout(15000), cache: 'no-store' }),
    sleep: (ms) => delay(ms),
    log: (message) => console.log(message),
  }
}

export async function publishRelease({ env = process.env, root = fileURLToPath(new URL('..', import.meta.url)), io = defaultIo(), delays = registryRetryDelays } = {}) {
  const { GITHUB_REF_NAME: tag, GITHUB_REPOSITORY: repository } = env
  assert.equal(env.GITHUB_EVENT_NAME, 'release', 'Publish from a GitHub Release')
  assert.equal(repository, repositoryName, `Publish from ${repositoryName}`)
  await io.run('git', ['merge-base', '--is-ancestor', 'HEAD', 'origin/main'])
  checkNpmVersion(io.read('npm', ['--version']))

  const { name, version } = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
  assert.equal(name, packageName)
  assert.match(version, /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/, 'Use a stable release version')
  assert.equal(tag, 'v' + version, 'The release tag must match package.json')

  const filename = `eightkk-vue-weave-${version}.tgz`
  const packageUrl = `${registry}/${encodeURIComponent(name)}/${version}`

  async function registryIntegrity() {
    const response = await io.fetch(packageUrl)
    if (response.status === 404) return null
    assert.ok(response.ok, `npm registry returned HTTP ${response.status}`)
    const metadata = await response.json()
    assert.equal(metadata.name, name)
    assert.equal(metadata.version, version)
    assert.equal(typeof metadata.dist?.integrity, 'string', 'npm must report a tarball integrity value')
    return metadata.dist.integrity
  }

  const directory = await mkdtemp(join(tmpdir(), 'vue-weave-npm-'))
  try {
    await io.run('gh', [
      'release', 'download', tag, '--repo', repository,
      '--pattern', filename, '--pattern', 'SHA256SUMS', '--dir', directory,
    ])

    const tarball = join(directory, filename)
    const bytes = await readFile(tarball)
    const checksums = await readFile(join(directory, 'SHA256SUMS'), 'utf8')
    const digest = createHash('sha256').update(bytes).digest('hex')
    assert.ok(checksums.split(/\r?\n/).includes(`${digest}  ${filename}`), 'Tarball does not match SHA256SUMS')
    const packed = JSON.parse(io.read('tar', ['-xOzf', tarball, 'package/package.json']))
    assert.equal(packed.name, name, 'The tarball must contain Vue Weave')
    assert.equal(packed.version, version, 'The tarball version must match the release tag')

    const expected = 'sha512-' + createHash('sha512').update(bytes).digest('base64')
    let published = await registryIntegrity()
    if (published === null) {
      // Stable releases always move the `latest` dist-tag (see CONTRIBUTING.md).
      await io.run('npm', ['publish', tarball, '--access', 'public', '--ignore-scripts', '--tag', 'latest', '--registry', registry])
      for (let attempt = 0; attempt < delays.length && published === null; attempt++) {
        await io.sleep(delays[attempt])
        published = await registryIntegrity()
      }
      assert.notEqual(
        published,
        null,
        `npm publish finished, but the registry did not list ${name}@${version} in time. Rerun the job to compare the integrity; it does not publish again.`,
      )
    }
    assert.equal(published, expected, 'npm integrity must match the GitHub Release tarball')
    io.log(`${name}@${version} matches the GitHub Release tarball.`)
    return { name, version, integrity: published }
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await publishRelease()
}
