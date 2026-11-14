import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFile, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

// Prepare verified local candidates only. Publishing and repository administration remain separate actions.
const root = fileURLToPath(new URL('../', import.meta.url))
const npmCli = process.env.npm_execpath
assert.ok(npmCli, 'Run this script with npm run prepare:release')
const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
const artifacts = join(root, 'artifacts')
await mkdir(artifacts, { recursive: true })
const resolvedArtifacts = await realpath(artifacts)
const staging = await realpath(await mkdtemp(join(resolvedArtifacts, 'release-candidate-')))
assert.equal(dirname(staging), resolvedArtifacts, 'Staging must stay directly inside artifacts/')

const sourcePaths = [
  '.editorconfig', '.github', '.gitattributes', '.gitignore', 'AGENTS.md', 'CHANGELOG.md', 'CONTRIBUTING.md',
  'LICENSE', 'README.md', 'README.ja.md', 'Start.cmd', 'THIRD_PARTY_NOTICES.md',
  'package.json', 'package-lock.json', 'tsconfig.json', 'tsconfig.build.json',
  'vite.config.ts', 'vite.demo.config.ts', 'playwright.config.ts',
  'docs', 'examples', 'scripts', 'src', 'test',
]
const sha256 = data => createHash('sha256').update(data).digest('hex')

function npm(args, capture = false) {
  return execFileSync(process.execPath, [npmCli, ...args], {
    cwd: root, encoding: 'utf8', windowsHide: true,
    stdio: capture ? ['ignore', 'pipe', 'inherit'] : 'inherit',
  })
}

async function inventory(directory, paths) {
  const files = []
  async function visit(path) {
    // Keep tar's line-based file list unambiguous and reject links outside the reviewed source.
    assert.ok(!/[\r\n\\]/.test(path) && !path.startsWith('-'), 'Invalid archive path: ' + path)
    assert.ok(!/(^|\/)(?:\.env(?:\..*)?|\.npmrc|\.aws|\.codex|\.agents|node_modules)(\/|$)|\.(?:pem|key|p12|pfx|tgz|log)$/i.test(path), 'Private or generated archive entry: ' + path)
    const filename = join(directory, path)
    const info = await lstat(filename)
    if (info.isDirectory()) {
      for (const child of (await readdir(filename)).sort()) await visit(path + '/' + child)
    } else {
      assert.ok(info.isFile(), 'Archive entries must be regular files: ' + path)
      const data = await readFile(filename)
      files.push({ path, bytes: data.length, sha256: sha256(data) })
    }
  }
  for (const path of paths) await visit(path)
  return files.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0)
}

async function verifyDemo(directory) {
  const child = spawn(process.execPath, ['scripts/serve.mjs'], {
    cwd: directory, windowsHide: true, stdio: ['ignore', 'pipe', 'inherit'],
  })
  const exited = new Promise(resolve => child.once('close', resolve))
  try {
    const base = await new Promise((resolve, reject) => {
      let output = ''
      const timer = setTimeout(() => reject(new Error('Demo server startup timed out')), 10000)
      child.once('error', error => { clearTimeout(timer); reject(error) })
      child.once('exit', code => { clearTimeout(timer); reject(new Error('Demo server exited: ' + code)) })
      child.stdout.on('data', data => {
        output += data
        const match = output.match(/http:\/\/127\.0\.0\.1:\d+\//)
        if (match) { clearTimeout(timer); resolve(match[0]) }
      })
    })
    const page = await fetch(base)
    assert.equal(page.status, 200)
    const html = await page.text()
    assert.ok(html.includes('Vue Weave'), 'Missing demo title')
    const assets = [...html.matchAll(/(?:src|href)="([^"]*assets\/[^"]+)"/g)].map(match => match[1])
    assert.ok(assets.length > 0, 'Missing demo assets')
    for (const asset of assets) assert.equal((await fetch(new URL(asset, base))).status, 200)
    const head = await fetch(base, { method: 'HEAD' })
    assert.equal(head.status, 200)
    assert.equal(await head.text(), '')
    assert.equal(head.headers.get('content-length'), String(Buffer.byteLength(html)))
    for (const [path, method, expected] of [
      ['', 'POST', 405], ['%00', 'GET', 400], ['%5c', 'GET', 400],
      ['%ZZ', 'GET', 400], ['..%2fpackage.json', 'GET', 403], ['missing.js', 'GET', 404],
    ]) assert.equal((await fetch(base + path, { method })).status, expected, 'Unexpected response: ' + path)
    return { passed: true, assets: assets.length, installedDependencies: false }
  } finally {
    if (child.exitCode === null) child.kill()
    await exited
  }
}

try {
  const before = await inventory(root, sourcePaths)
  npm(['run', 'check'])
  npm(['run', 'test:e2e'])
  npm(['run', 'test:package'])
  const audit = JSON.parse(npm(['audit', '--json'], true))
  assert.equal(audit.metadata.vulnerabilities.total, 0, 'Resolve dependency audit findings before preparing a release')
  const [packed] = JSON.parse(npm(['pack', '--dry-run', '--ignore-scripts', '--json'], true))
  assert.equal(packed.name, manifest.name)
  assert.equal(packed.version, manifest.version)
  assert.equal(packed.filename, `${manifest.name}-${manifest.version}.tgz`)
  const tarball = join(artifacts, packed.filename)
  const tarballData = await readFile(tarball)
  assert.equal('sha512-' + createHash('sha512').update(tarballData).digest('base64'), packed.integrity, 'Verified tarball differs from the current package inventory')
  assert.deepEqual(await inventory(root, sourcePaths), before, 'Source changed during release verification')

  const sourceFiles = await inventory(root, [...sourcePaths, 'preview'])
  const archiveName = `${manifest.name}-${manifest.version}-source-demo.tar.gz`
  const stagedArchive = join(staging, archiveName)
  const list = join(staging, 'files.txt')
  await writeFile(list, sourceFiles.map(file => file.path).join('\n') + '\n')
  execFileSync('tar', ['-czf', stagedArchive, '-C', root, '-T', list], { stdio: 'inherit', windowsHide: true })
  const entries = execFileSync('tar', ['-tzf', stagedArchive], { encoding: 'utf8', windowsHide: true }).trim().split(/\r?\n/).sort()
  assert.deepEqual(entries, sourceFiles.map(file => file.path), 'Unexpected source archive contents')
  const extracted = join(staging, 'extracted')
  await mkdir(extracted)
  execFileSync('tar', ['-xzf', stagedArchive, '-C', extracted], { stdio: 'inherit', windowsHide: true })
  assert.deepEqual(await inventory(extracted, [...sourcePaths, 'preview']), sourceFiles, 'Extracted source differs from the reviewed files')
  assert.deepEqual((await readdir(extracted)).sort(), [...sourcePaths, 'preview'].sort(), 'Unexpected top-level archive entry')
  assert.equal(manifest.scripts.start, 'node scripts/serve.mjs', 'Revisit the offline smoke test after changing npm start')
  const extractedDemo = await verifyDemo(extracted)
  assert.deepEqual(await inventory(root, [...sourcePaths, 'preview']), sourceFiles, 'Source changed during archive verification')

  const archiveData = await readFile(stagedArchive)
  const releaseArtifacts = [
    { file: packed.filename, bytes: tarballData.length, sha256: sha256(tarballData) },
    { file: archiveName, bytes: archiveData.length, sha256: sha256(archiveData) },
  ]
  const verification = {
    assessedAt: new Date().toISOString(),
    status: 'verified local candidates; not published',
    packageName: manifest.name, version: manifest.version,
    repository: manifest.repository,
    node: process.version, platform: process.platform,
    checks: { check: true, browser: true, packageConsumer: true, knownVulnerabilities: 0, extractedDemo },
    sourceFiles, artifacts: releaseArtifacts,
    publicationChecksRequired: [
      'Confirm distribution rights and public maintainer identity',
      'Review the actual Git commit and any imported history for confidential data',
      'Verify repository metadata and private reporting routes',
      'Verify hosted CI and repository protections',
      'Choose release notes and tag before publishing a release',
    ],
  }
  await copyFile(stagedArchive, join(artifacts, archiveName))
  await writeFile(join(artifacts, 'SHA256SUMS'), releaseArtifacts.map(file => `${file.sha256}  ${file.file}`).join('\n') + '\n')
  await writeFile(join(artifacts, 'release-verification.json'), JSON.stringify(verification, null, 2) + '\n')
  console.log(`Verified local candidates: ${relative(root, tarball)}, artifacts/${archiveName}`)
  console.log('Source, extracted demo and checksums match. No publication was performed.')
} finally {
  // Delete only the unique, verified direct child created above; never a caller-supplied directory.
  assert.equal(dirname(await realpath(staging)), resolvedArtifacts)
  await rm(staging, { recursive: true, force: true })
}
