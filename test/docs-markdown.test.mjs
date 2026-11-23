import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { test } from 'node:test'

// docs/ is read on GitHub, on npm and (through includes) on the documentation site. GitHub and npm treat `<string>` in
// `ReadonlySet<string>` or `<row>` in running text as an HTML tag and drop it, and the site compiles the text as a Vue
// template, so types and placeholders with angle brackets belong in code spans.
const docs = new URL('../docs/', import.meta.url)
// Tags that the documents may use on purpose.
const htmlTag = /^<\/?(?:a|b|br|code|em|i|img|kbd|p|span|strong|sub|sup|wbr|details|summary)(?=[\s/>])/i

/** Each `<` that starts a tag-like text outside fenced code, code spans and HTML comments, as `file:line: text`. */
function rawTags(file, text) {
  const found = []
  let fence
  text.split('\n').forEach((line, index) => {
    const marker = /^\s*(`{3,}|~{3,})/.exec(line)?.[1]
    if (marker && (!fence || marker.startsWith(fence))) {
      fence = fence ? undefined : marker
      return
    }
    if (fence) return
    const prose = line.replace(/(`+)(?:[^`]|(?!\1)`)+?\1(?!`)/g, '').replace(/<!--.*?-->/g, '')
    for (const match of prose.matchAll(/<[A-Za-z/][^<>]*>?/g)) {
      if (!htmlTag.test(match[0])) found.push(`${file}:${index + 1}: ${match[0]}`)
    }
  })
  return found
}

test('docs/*.md keeps angle-bracket types and placeholders in code spans', () => {
  const files = readdirSync(docs).filter(name => name.endsWith('.md'))
  assert.ok(files.includes('api.md'))
  const found = files.flatMap(file => rawTags(file, readFileSync(new URL(file, docs), 'utf8')))
  assert.deepEqual(found, [])
})

test('the raw tag check finds text outside code and ignores code', () => {
  const text = 'A `ReadonlySet<string>` and ReadonlySet<string>.\n```ts\nconst a: Map<string, number>\n```\nEdit <row> <!-- <x> --> <br>'
  assert.deepEqual(rawTags('x.md', text), ['x.md:1: <string>', 'x.md:5: <row>'])
})
