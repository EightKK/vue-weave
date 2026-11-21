import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, readdir as readdirUnsorted, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { releaseDirectory, runReleaseTransaction, verifyReleaseSet } from '../scripts/release-candidate.mjs'

// Release tooling: a failed rerun must leave the previous verified set complete and untouched.

// readdir() order is not specified (it differs between file systems), so every listing here is sorted.
async function readdir(directory) {
  return (await readdirUnsorted(directory)).sort()
}

async function withArtifacts(run) {
  const directory = await mkdtemp(join(tmpdir(), 'vw-release-test-'))
  try {
    await run(join(directory, 'artifacts'))
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

function writeArtifacts(content) {
  return async ({ set, work }) => {
    await writeFile(join(work, 'scratch.txt'), 'scratch')
    await writeFile(join(set, 'pkg-1.0.0.tgz'), `tarball ${content}`)
    await writeFile(join(set, 'pkg-1.0.0-source-demo.tar.gz'), `archive ${content}`)
    return { version: '1.0.0', run: content }
  }
}

async function snapshot(directory) {
  const files = {}
  for (const name of await readdir(directory)) files[name] = await readFile(join(directory, name), 'utf8')
  return files
}

async function onlyVerifiedSets(artifacts) {
  // No candidate, staging or backup directory may be left behind.
  assert.deepEqual(await readdir(artifacts), ['release'])
  assert.deepEqual(await readdir(join(artifacts, 'release')), ['1.0.0'])
}

test('a successful run promotes a complete verified set', async () => {
  await withArtifacts(async artifacts => {
    const result = await runReleaseTransaction({ artifacts, version: '1.0.0', build: writeArtifacts('first') })
    const directory = releaseDirectory(artifacts, '1.0.0')
    // The tooling resolves real paths; on Windows a temporary directory can also have a short (8.3) name.
    assert.equal(await realpath(result.directory), await realpath(directory))
    assert.deepEqual(await readdir(directory), ['SHA256SUMS', 'pkg-1.0.0-source-demo.tar.gz', 'pkg-1.0.0.tgz', 'release-verification.json'])
    const record = await verifyReleaseSet(directory)
    assert.equal(record.run, 'first')
    assert.deepEqual(record.artifacts.map(item => item.file), ['pkg-1.0.0-source-demo.tar.gz', 'pkg-1.0.0.tgz'])
    await onlyVerifiedSets(artifacts)
  })
})

test('a rerun replaces the previous verified set as a unit', async () => {
  await withArtifacts(async artifacts => {
    await runReleaseTransaction({ artifacts, version: '1.0.0', build: writeArtifacts('first') })
    await runReleaseTransaction({ artifacts, version: '1.0.0', build: writeArtifacts('second') })
    const directory = releaseDirectory(artifacts, '1.0.0')
    assert.equal((await verifyReleaseSet(directory)).run, 'second')
    assert.equal(await readFile(join(directory, 'pkg-1.0.0.tgz'), 'utf8'), 'tarball second')
    await onlyVerifiedSets(artifacts)
  })
})

for (const [name, options] of [
  ['after the new tarball was written', {
    build: async context => {
      await writeArtifacts('second')(context)
      throw new Error('check failed')
    },
    message: /check failed/,
  }],
  ['when the set is incomplete', {
    build: async ({ set }) => {
      await writeFile(join(set, 'pkg-1.0.0.tgz'), 'tarball second')
      await mkdir(join(set, 'nested'))
      return { run: 'second' }
    },
    message: /Unexpected entry in release set: nested/,
  }],
  ['when the build writes its own checksums', {
    build: async ({ set }) => {
      await writeFile(join(set, 'pkg-1.0.0.tgz'), 'tarball second')
      await writeFile(join(set, 'SHA256SUMS'), 'stale\n')
      return { run: 'second' }
    },
    message: /must not write SHA256SUMS itself/,
  }],
  ['before promotion', { failAt: 'before-promote', message: /before promotion/ }],
  ['between the two renames of the promotion', { failAt: 'during-promote', message: /during promotion/ }],
]) {
  test(`a failure ${name} keeps the previous verified set usable`, async () => {
    await withArtifacts(async artifacts => {
      await runReleaseTransaction({ artifacts, version: '1.0.0', build: writeArtifacts('first') })
      const directory = releaseDirectory(artifacts, '1.0.0')
      const before = await snapshot(directory)
      await assert.rejects(runReleaseTransaction({
        artifacts, version: '1.0.0', failAt: options.failAt, build: options.build ?? writeArtifacts('second'),
      }), options.message)
      assert.deepEqual(await snapshot(directory), before)
      assert.equal((await verifyReleaseSet(directory)).run, 'first')
      await onlyVerifiedSets(artifacts)
    })
  })
}

test('verification rejects a set whose files no longer match the checksums', async () => {
  await withArtifacts(async artifacts => {
    await runReleaseTransaction({ artifacts, version: '1.0.0', build: writeArtifacts('first') })
    const directory = releaseDirectory(artifacts, '1.0.0')
    await writeFile(join(directory, 'pkg-1.0.0.tgz'), 'tampered')
    await assert.rejects(verifyReleaseSet(directory), /Checksum mismatch: pkg-1\.0\.0\.tgz/)
    await writeFile(join(directory, 'extra.tgz'), 'extra')
    await assert.rejects(verifyReleaseSet(directory), /does not list exactly the release artifacts/)
  })
})

test('the transaction rejects unsafe versions and unknown failure points', async () => {
  await withArtifacts(async artifacts => {
    for (const version of ['..', '../x', '', '1.0.0/evil']) {
      await assert.rejects(runReleaseTransaction({ artifacts, version, build: writeArtifacts('x') }), /Invalid version/)
    }
    await assert.rejects(
      runReleaseTransaction({ artifacts, version: '1.0.0', failAt: 'elsewhere', build: writeArtifacts('x') }),
      /Unknown failure point/,
    )
  })
})
