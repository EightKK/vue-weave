// Builds the dynamic routes of the example and showcase pages from the registry. Runs in Node.js while VitePress
// resolves the pages: each route gets the entry's ID as its parameter and, as its Markdown content, a code group with
// one tab per source file, so the code is highlighted at build time and searchable without client-side highlighting.
import { readFileSync } from 'node:fs'
import { extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { examplesOfKind, type ExampleEntry } from './registry'

const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url))

const languages: Record<string, string> = { '.vue': 'vue', '.ts': 'ts', '.mts': 'ts', '.js': 'js', '.mjs': 'js', '.css': 'css', '.json': 'json', '.html': 'html' }

/** A Markdown code block for `code`, fenced with more backticks than the code contains in a row. */
function codeBlock(path: string, code: string) {
  const longestRun = Math.max(0, ...(code.match(/`+/g) ?? []).map(run => run.length))
  const fence = '`'.repeat(Math.max(3, longestRun + 1))
  const name = path.slice(path.lastIndexOf('/') + 1)
  return `${fence}${languages[extname(path)] ?? 'txt'} [${name}]\n${code.replace(/\r\n/g, '\n').replace(/\n$/, '')}\n${fence}`
}

/** The code group Markdown for the source files of an entry. */
export function sourceMarkdown(entry: ExampleEntry) {
  const blocks = entry.sources.map(path => codeBlock(path, readFileSync(repositoryRoot + path, 'utf8')))
  return '::: code-group\n\n' + blocks.join('\n\n') + '\n\n:::\n'
}

/** The routes of every entry of one kind, for a `[id].paths.ts` loader. */
export function exampleRoutes(kind: ExampleEntry['kind']) {
  return examplesOfKind(kind).map(entry => ({ params: { id: entry.id }, content: sourceMarkdown(entry) }))
}
