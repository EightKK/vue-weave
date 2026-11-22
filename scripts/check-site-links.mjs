// Checks the links of the built documentation site in preview/ (the last step of `npm run build:demo`):
//
// - every link from one page of the site to another, including the generated type reference, leads to a file that
//   exists, and its #anchor to an element with that ID (VitePress itself only reports links to missing pages);
// - every related-API link of the example registry (`api.md#treegrid`) resolves to the API page that holds the heading;
// - the Japanese API pages include the same docs/ regions as the English ones, so the anchors the map gives exist there.
//
// Links outside the site (GitHub, npm) are not fetched.
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const preview = join(root, 'preview')
const base = '/vue-weave/'

/** The registry and the link map are TypeScript; Node.js 22.18+ reads them without a build step. */
const { buildApiLinkMap, docsHeadingKeys, resolveApiLink } = await import('../site/.vitepress/apiDocs.ts')
const { examples } = await import('../site/examples/registry.ts')

function htmlFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return entry.name === 'assets' ? [] : htmlFiles(path)
    return entry.name.endsWith('.html') ? [path] : []
  })
}

const decode = text => text.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
const idCache = new Map()
/** The IDs of the elements of a built page. */
function idsOf(file) {
  let ids = idCache.get(file)
  if (!ids) {
    ids = new Set([...readFileSync(file, 'utf8').matchAll(/\sid="([^"]*)"/g)].map(match => decode(match[1])))
    idCache.set(file, ids)
  }
  return ids
}

/** The built file a site path leads to, or undefined. */
function targetFile(pathname) {
  let path = decodeURIComponent(pathname.slice(base.length))
  if (path === '' || path.endsWith('/')) path += 'index.html'
  const file = join(preview, ...path.split('/'))
  if (existsSync(file)) return file
  // VitePress serves /page as /page.html.
  if (!/\.\w+$/.test(path) && existsSync(file + '.html')) return file + '.html'
  return undefined
}

const problems = []
const pages = htmlFiles(preview)
let checked = 0
for (const file of pages) {
  const page = '/' + relative(preview, file).split(sep).join('/')
  const html = readFileSync(file, 'utf8')
  for (const match of html.matchAll(/<a\b[^>]*?\shref="([^"]*)"[^>]*>/g)) {
    const href = decode(match[1])
    if (href === '' || href === '#' || /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(href)) continue
    // The type reference is English only, so the language menu of its pages offers a Japanese page that does not exist.
    if (/\shreflang="ja"/.test(match[0]) && href.startsWith(base + 'ja/api/reference/')) continue
    const url = new URL(href, 'http://site' + base + page.slice(1))
    if (!url.pathname.startsWith(base)) {
      problems.push(`${page}: ${href} leaves the site base ${base}`)
      continue
    }
    checked++
    const target = targetFile(url.pathname)
    if (!target) {
      problems.push(`${page}: ${href} leads to a missing page`)
      continue
    }
    const anchor = decodeURIComponent(url.hash.slice(1))
    if (anchor && target.endsWith('.html') && !idsOf(target).has(anchor)) problems.push(`${page}: ${href} has no #${anchor} on its page`)
  }
}

const map = buildApiLinkMap(join(root, 'site'))
// Every section of the documents is on a page; the contents list of docs/api.md is the one part the site leaves out.
for (const file of ['api.md', 'integration.md', 'scheduling.md', 'architecture.md']) {
  for (const key of docsHeadingKeys(join(root, 'site'), file)) {
    if (key !== 'api.md#contents' && !map.anchors[key]) problems.push(`docs/${key} is on no API page: put it in a region that a page includes`)
  }
}
for (const entry of examples) {
  for (const link of entry.api) {
    const [file, anchor] = link.doc.split('#', 2)
    if (!resolveApiLink(map, file, anchor)) problems.push(`site/examples/registry.ts: ${entry.id} links to ${link.doc}, which no API page shows`)
  }
}

// The map is built from the English pages; each Japanese page must have the same route and show the same headings.
for (const route of new Set(Object.values(map.anchors).map(target => target.split('#')[0]))) {
  for (const prefix of ['', '/ja']) {
    const file = targetFile(base + (prefix + route).slice(1))
    if (!file) problems.push(`The API page ${prefix + route} is missing`)
  }
}
for (const target of Object.values(map.anchors)) {
  const [route, anchor] = target.split('#')
  const file = targetFile(base + ('/ja' + route).slice(1))
  if (file && !idsOf(file).has(anchor)) problems.push(`/ja${route} does not show the heading #${anchor} of ${route}`)
}

if (problems.length) {
  console.error(`The site has ${problems.length} broken link${problems.length === 1 ? '' : 's'}:\n` + problems.map(problem => '  ' + problem).join('\n'))
  process.exit(1)
}
console.log(`Site links: ${checked} links in ${pages.length} pages and ${examples.reduce((sum, entry) => sum + entry.api.length, 0)} related-API links resolve.`)
