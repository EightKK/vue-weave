import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { lstat, mkdir, mkdtemp, readFile, readdir, realpath, rename, rm, writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'

// A release run builds every file in its own candidate directory and moves the verified set into
// artifacts/release/<version>/ only after all checks pass, so a failed rerun never mixes new files with an
// earlier verification record.

export const SUMS_FILE = 'SHA256SUMS'
export const RECORD_FILE = 'release-verification.json'
const failurePoints = new Set(['before-promote', 'during-promote'])

const sha256 = data => createHash('sha256').update(data).digest('hex')

function checkVersion(version) {
  assert.ok(typeof version === 'string' && /^[0-9A-Za-z][0-9A-Za-z.+-]*$/.test(version), `Invalid version: ${version}`)
}

async function exists(path) {
  try {
    await lstat(path)
    return true
  } catch (error) {
    if (error.code === 'ENOENT') return false
    throw error
  }
}

/** Returns the directory that holds the verified set of a version. */
export function releaseDirectory(artifacts, version) {
  checkVersion(version)
  return join(artifacts, 'release', version)
}

/**
 * Checks that a release directory is a complete verified set: only regular files, a checksum line for every
 * artifact, matching hashes, and a verification record that lists the same artifacts. Returns the record.
 */
export async function verifyReleaseSet(directory) {
  const names = (await readdir(directory)).sort()
  for (const name of names) assert.ok((await lstat(join(directory, name))).isFile(), `Unexpected entry in release set: ${name}`)
  assert.ok(names.includes(SUMS_FILE), `Release set is missing ${SUMS_FILE}`)
  assert.ok(names.includes(RECORD_FILE), `Release set is missing ${RECORD_FILE}`)
  const files = names.filter(name => name !== SUMS_FILE && name !== RECORD_FILE)
  assert.ok(files.length > 0, 'Release set has no artifacts')
  const sums = new Map()
  for (const line of (await readFile(join(directory, SUMS_FILE), 'utf8')).split('\n').filter(Boolean)) {
    const match = /^([0-9a-f]{64}) {2}(.+)$/.exec(line)
    assert.ok(match, `Invalid ${SUMS_FILE} line: ${line}`)
    sums.set(match[2], match[1])
  }
  assert.deepEqual([...sums.keys()].sort(), files, `${SUMS_FILE} does not list exactly the release artifacts`)
  for (const file of files) {
    assert.equal(sha256(await readFile(join(directory, file))), sums.get(file), `Checksum mismatch: ${file}`)
  }
  const record = JSON.parse(await readFile(join(directory, RECORD_FILE), 'utf8'))
  assert.deepEqual(
    record.artifacts.map(item => [item.file, item.sha256]).sort(),
    files.map(file => [file, sums.get(file)]),
    `${RECORD_FILE} does not match ${SUMS_FILE}`,
  )
  return record
}

/**
 * Runs `build` in a fresh candidate directory `artifacts/.candidate-*`. `build({ set, work })` writes the release
 * artifacts into `set`, may use `work` as scratch space, and returns the verification record (without `artifacts`).
 * Afterwards the checksums and the record are written, the set is checked, and it replaces
 * `artifacts/release/<version>/` with two renames. On any failure the candidate is deleted and the previous
 * verified set stays in place. `failAt` ('before-promote' or 'during-promote') simulates a failure for tests.
 */
export async function runReleaseTransaction({ artifacts, version, build, failAt }) {
  checkVersion(version)
  assert.ok(!failAt || failurePoints.has(failAt), `Unknown failure point: ${failAt}`)
  await mkdir(join(artifacts, 'release'), { recursive: true })
  const resolvedArtifacts = await realpath(artifacts)
  const candidate = await realpath(await mkdtemp(join(resolvedArtifacts, '.candidate-')))
  assert.equal(dirname(candidate), resolvedArtifacts, 'The candidate must stay directly inside artifacts/')
  const set = join(candidate, 'set')
  const work = join(candidate, 'work')
  await mkdir(set)
  await mkdir(work)
  try {
    const record = await build({ set, work })
    assert.ok(record && typeof record === 'object', 'The release build must return a verification record')
    await rm(work, { recursive: true, force: true })
    const files = (await readdir(set)).sort()
    assert.ok(files.length > 0, 'The release build wrote no artifacts')
    const releaseArtifacts = []
    for (const file of files) {
      assert.ok(file !== SUMS_FILE && file !== RECORD_FILE, `The release build must not write ${file} itself`)
      assert.ok((await lstat(join(set, file))).isFile(), `Unexpected entry in release set: ${file}`)
      const data = await readFile(join(set, file))
      releaseArtifacts.push({ file, bytes: data.length, sha256: sha256(data) })
    }
    await writeFile(join(set, SUMS_FILE), releaseArtifacts.map(item => `${item.sha256}  ${item.file}`).join('\n') + '\n')
    await writeFile(join(set, RECORD_FILE), JSON.stringify({ ...record, artifacts: releaseArtifacts }, null, 2) + '\n')
    await verifyReleaseSet(set)
    if (failAt === 'before-promote') throw new Error('Simulated release failure before promotion')

    const destination = join(resolvedArtifacts, 'release', version)
    let previous
    if (await exists(destination)) {
      previous = await mkdtemp(join(resolvedArtifacts, 'release', `.previous-${version}-`))
      await rm(previous, { recursive: true })
      await rename(destination, previous)
    }
    try {
      if (failAt === 'during-promote') throw new Error('Simulated release failure during promotion')
      await rename(set, destination)
    } catch (error) {
      if (previous) await rename(previous, destination)
      throw error
    }
    if (previous) await rm(previous, { recursive: true, force: true })
    return { directory: destination, artifacts: releaseArtifacts }
  } finally {
    // Delete only the unique candidate created above, never a caller-supplied directory.
    assert.ok(basename(candidate).startsWith('.candidate-') && dirname(candidate) === resolvedArtifacts)
    await rm(candidate, { recursive: true, force: true })
  }
}
