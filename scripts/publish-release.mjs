import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout } from 'node:timers/promises'

const { GITHUB_REF_NAME: tag, GITHUB_REPOSITORY: repository } = process.env
assert.equal(process.env.GITHUB_EVENT_NAME, 'release', 'Publish from a GitHub Release')
assert.equal(repository, 'EightKK/vue-weave', 'Publish from EightKK/vue-weave')
execFileSync('git', ['merge-base', '--is-ancestor', 'HEAD', 'origin/main'], { stdio: 'inherit' })

const { name, version } = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
assert.equal(name, '@eightkk/vue-weave')
assert.match(version, /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/, 'Use a stable release version')
assert.equal(tag, 'v' + version, 'The release tag must match package.json')

const filename = `eightkk-vue-weave-${version}.tgz`
const registry = 'https://registry.npmjs.org'
const packageUrl = `${registry}/${encodeURIComponent(name)}/${version}`

async function registryIntegrity() {
  const response = await fetch(packageUrl, { signal: AbortSignal.timeout(15000) })
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
  execFileSync('gh', [
    'release', 'download', tag, '--repo', repository,
    '--pattern', filename, '--pattern', 'SHA256SUMS', '--dir', directory,
  ], { stdio: 'inherit' })

  const tarball = join(directory, filename)
  const bytes = await readFile(tarball)
  const checksums = await readFile(join(directory, 'SHA256SUMS'), 'utf8')
  const digest = createHash('sha256').update(bytes).digest('hex')
  assert.ok(checksums.split(/\r?\n/).includes(`${digest}  ${filename}`), 'Tarball does not match SHA256SUMS')
  const packed = JSON.parse(execFileSync('tar', ['-xOzf', tarball, 'package/package.json'], { encoding: 'utf8' }))
  assert.equal(packed.name, name, 'The tarball must contain Vue Weave')
  assert.equal(packed.version, version, 'The tarball version must match the release tag')

  const expected = 'sha512-' + createHash('sha512').update(bytes).digest('base64')
  let published = await registryIntegrity()
  if (published === null) {
    execFileSync('npm', ['publish', tarball, '--access', 'public', '--ignore-scripts', '--registry', registry], {
      stdio: 'inherit',
    })
    for (let attempt = 0; attempt < 6 && published === null; attempt++) {
      if (attempt > 0) await setTimeout(2000)
      published = await registryIntegrity()
    }
  }
  assert.equal(published, expected, 'npm integrity must match the GitHub Release tarball')
  console.log(`${name}@${version} matches the GitHub Release tarball.`)
} finally {
  await rm(directory, { recursive: true, force: true })
}
