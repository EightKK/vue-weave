import { access, readdir, readFile } from 'node:fs/promises'
import { dirname, join, relative, resolve, sep } from 'node:path'

// Declaration files reachable from the public entry declarations. Shared by
// finalize-declarations.mjs (prunes the rest) and check-package.mjs (rejects them).
// Follows relative `import`/`export ... from`, bare `import '...'`, `import("...")` types and
// `/// <reference path>`, transitively and without recursion. A `.js` specifier maps to its `.d.ts`
// (`./Foo.vue.js` to `Foo.vue.d.ts`), and a directory specifier maps to its `index.d.ts`.
const specifierPatterns = [
  /\b(?:from|import)\s*(['"])(\.{1,2}\/[^'"]*)\1/g,
  /\bimport\(\s*(['"])(\.{1,2}\/[^'"]*)\1\s*\)/g,
  /^\/\/\/\s*<reference\s+path=(['"])([^'"]+)\1/gm,
]

async function exists(path) {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

async function resolveSpecifier(from, specifier) {
  const base = resolve(dirname(from), specifier)
  const stem = base.replace(/\.(?:js|mjs|ts)$/, '')
  for (const candidate of [stem + '.d.ts', base + '.d.ts', join(base, 'index.d.ts')]) {
    if (await exists(candidate)) return candidate
  }
  throw new Error(`Declaration ${from} imports ${specifier}, which does not resolve to a declaration file`)
}

// Absolute paths of every declaration reachable from `entries`.
export async function reachableDeclarations(entries) {
  const reached = new Set(entries.map(entry => resolve(entry)))
  const queue = [...reached]
  while (queue.length) {
    const file = queue.pop()
    const text = await readFile(file, 'utf8')
    for (const pattern of specifierPatterns) {
      for (const match of text.matchAll(pattern)) {
        const target = await resolveSpecifier(file, match[2])
        if (!reached.has(target)) {
          reached.add(target)
          queue.push(target)
        }
      }
    }
  }
  return reached
}

// Every file and directory below `directory` (absolute paths), directories deepest first.
export async function listTree(directory) {
  const files = []
  const directories = []
  const pending = [resolve(directory)]
  while (pending.length) {
    const current = pending.pop()
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const path = join(current, entry.name)
      if (entry.isDirectory()) {
        directories.push(path)
        pending.push(path)
      } else files.push(path)
    }
  }
  directories.sort((a, b) => b.length - a.length)
  return { files: files.sort(), directories }
}

export function posixRelative(from, to) {
  return relative(from, to).split(sep).join('/')
}
