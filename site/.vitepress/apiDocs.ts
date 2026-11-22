// The API pages of the site show the hand-written documents in docs/, which stay the single source of truth and ship in
// the npm package. Each page includes named regions of them (`<!--@include: ../../docs/api.md#tree-grid-->`, between
// `<!-- #region tree-grid -->` and `<!-- #endregion tree-grid -->` markers, which GitHub and npm do not show). Links in
// those documents point at headings of the whole file (`#tree-grid-editing`, `integration.md#linking-views`), and
// after the split the heading can be on another page. This module works out, from the regions each page includes,
// which page and anchor every heading of docs/*.md ends up on, and rewrites the links of the included text to match.
// The registry's related-API links (`api.md#treegrid`) resolve through the same map (see theme/i18n.ts).
//
// Node.js only: the configuration and scripts/check-site-links.mjs use it; the theme reads the map through the
// `virtual:vw-api-links` module.
import { readFileSync, readdirSync } from 'node:fs'
import { join, posix, relative, sep } from 'node:path'
import type { Plugin } from 'vite'
import type { MarkdownRenderer } from 'vitepress'

/** Where the API links of docs/*.md lead on the site, as routes without the base and the locale prefix. */
export interface ApiLinkMap {
  /** `api.md#tree-grid-editing` (the GitHub anchor of the heading) → `/api/components/tree-grid#tree-grid-editing`. */
  anchors: Record<string, string>
  /** `scheduling.md` → the page that includes the start of the file, such as `/api/guides/scheduling`. */
  files: Record<string, string>
}

const repository = 'https://github.com/EightKK/vue-weave'
const includeRE = /^<!--\s*@include:\s*(\S+?)#([\w-]+)\s*-->\s*$/
const regionStartRE = /^\s*<!--\s*#region\s+([\w-]+)\s*-->\s*$/
const regionEndRE = /^\s*<!--\s*#endregion\s+([\w-]+)\s*-->\s*$/
const headingRE = /^(#{1,6})[ \t]+(.*?)(?:[ \t]+#+)?[ \t]*$/
const fenceRE = /^ {0,3}(`{3,}|~{3,})/

/**
 * VitePress's default heading slug, repeated here so that the map predicts the IDs VitePress gives the headings. The
 * configuration passes this function to `markdown.anchor.slugify`, so the two cannot drift apart.
 */
export function slugify(text: string) {
  return text.normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[\u0000-\u001f]/g, '')
    .replace(/[\s~`!@#$%^&*()\-_+=[\]{}|\\;:"'“”‘’<>,.?/]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/^(\d)/, '_$1')
    .toLowerCase()
}

/** GitHub's heading anchor, which the links in docs/*.md use: lowercase, punctuation dropped, spaces as hyphens. */
export function githubSlug(text: string) {
  return text.toLowerCase().replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, '').replace(/ /g, '-')
}

/** The text of a Markdown heading as the anchor plugins see it: code spans and link text kept, markup dropped. */
function headingText(source: string) {
  return source
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .trim()
}

interface Line {
  text: string
  /** The docs file and the line index in it, for lines included from docs/. */
  source?: { file: string; index: number }
}

interface Heading {
  index: number
  text: string
  /** An explicit ID: `# TreeGrid {#top}`. */
  id?: string
}

/** The headings of Markdown lines outside fenced code blocks. */
function headings(lines: readonly string[]): Heading[] {
  const found: Heading[] = []
  let fence: string | undefined
  lines.forEach((line, index) => {
    const marker = fenceRE.exec(line)?.[1]
    if (marker) {
      if (fence === undefined) fence = marker
      else if (marker.startsWith(fence) && !line.slice(line.indexOf(marker) + marker.length).trim()) fence = undefined
      return
    }
    if (fence !== undefined) return
    const match = headingRE.exec(line)
    if (!match) return
    const custom = /^(.*?)\s*\{#([\w-]+)\}$/.exec(match[2]!)
    found.push(custom ? { index, text: headingText(custom[1]!), id: custom[2]! } : { index, text: headingText(match[2]!) })
  })
  return found
}

/** Gives repeated slugs the `-1`, `-2` suffixes that both GitHub and VitePress add. Explicit IDs are kept. */
function uniqueSlugs(found: readonly Heading[], slug: (text: string) => string) {
  const used = new Set<string>()
  return found.map(({ text, id }) => {
    if (id) {
      used.add(id)
      return id
    }
    const base = slug(text)
    let unique = base
    for (let n = 1; used.has(unique); n++) unique = `${base}-${n}`
    used.add(unique)
    return unique
  })
}

/** The lines of a region (without its markers), with their indexes in the file. */
function regionLines(lines: readonly string[], name: string, file: string) {
  const start = lines.findIndex(line => regionStartRE.exec(line)?.[1] === name)
  const end = lines.findIndex((line, index) => index > start && regionEndRE.exec(line)?.[1] === name)
  if (start < 0 || end < 0) throw new Error(`Region "${name}" not found in docs/${file}`)
  return lines.slice(start + 1, end).map((text, offset) => ({ text, index: start + 1 + offset }))
}

function markdownFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return entry.name === 'reference' ? [] : markdownFiles(path)
    return entry.name.endsWith('.md') ? [path] : []
  })
}

/** The route of a page file: `site/api/index.md` → `/api/`, `site/api/core/scheduling.md` → `/api/core/scheduling`. */
function pageRoute(siteDir: string, file: string) {
  const path = '/' + relative(siteDir, file).split(sep).join('/')
  return path.endsWith('/index.md') ? path.slice(0, -'index.md'.length) : path.slice(0, -'.md'.length)
}

/**
 * Builds the map from the English API pages (`site/api/**`, without the generated type reference). The Japanese pages
 * include the same regions on the same routes under /ja/, which scripts/check-site-links.mjs verifies.
 */
export function buildApiLinkMap(siteDir: string): ApiLinkMap {
  const docsDir = join(siteDir, '..', 'docs')
  const docs = new Map<string, { lines: string[]; slugs: Map<number, string> }>()
  const doc = (file: string) => {
    let entry = docs.get(file)
    if (!entry) {
      const lines = readFileSync(join(docsDir, file), 'utf8').replace(/\r\n/g, '\n').split('\n')
      const found = headings(lines)
      const slugs = uniqueSlugs(found.map(({ index, text }) => ({ index, text })), githubSlug)
      entry = { lines, slugs: new Map(found.map((heading, i) => [heading.index, slugs[i]!])) }
      docs.set(file, entry)
    }
    return entry
  }

  const anchors: Record<string, string> = {}
  const firstLine = new Map<string, { index: number; route: string }>()
  for (const pageFile of markdownFiles(join(siteDir, 'api')).sort()) {
    const route = pageRoute(siteDir, pageFile)
    const page: Line[] = []
    for (const text of readFileSync(pageFile, 'utf8').replace(/\r\n/g, '\n').split('\n')) {
      const include = includeRE.exec(text)
      if (!include) {
        page.push({ text })
        continue
      }
      const file = posix.basename(include[1]!)
      if (!include[1]!.endsWith('docs/' + file)) throw new Error(`${pageFile}: only docs/*.md can be included (${include[1]})`)
      for (const line of regionLines(doc(file).lines, include[2]!, file)) {
        page.push({ text: line.text, source: { file, index: line.index } })
        const first = firstLine.get(file)
        if (!first || line.index < first.index) firstLine.set(file, { index: line.index, route })
      }
    }
    // Front matter has no headings, and the page's own headings count for the IDs VitePress makes unique.
    const found = headings(page.map(line => line.text))
    const slugs = uniqueSlugs(found, slugify)
    found.forEach((heading, i) => {
      const source = page[heading.index]!.source
      if (!source) return
      const key = `${source.file}#${doc(source.file).slugs.get(source.index)}`
      if (anchors[key]) throw new Error(`docs/${key} is included twice: on ${anchors[key]} and ${route}`)
      anchors[key] = `${route}#${slugs[i]}`
    })
  }
  const files = Object.fromEntries([...firstLine].map(([file, { route }]) => [file, route]))
  return { anchors, files }
}

/** The `file#anchor` keys of the headings of a docs file below its title, as `ApiLinkMap.anchors` names them. */
export function docsHeadingKeys(siteDir: string, file: string) {
  const lines = readFileSync(join(siteDir, '..', 'docs', file), 'utf8').replace(/\r\n/g, '\n').split('\n')
  const found = headings(lines)
  return uniqueSlugs(found, githubSlug).filter((_, i) => !lines[found[i]!.index]!.startsWith('# ')).map(slug => `${file}#${slug}`)
}

/** The route of a link to a docs file and an optional GitHub anchor, or undefined when no page holds it. */
export function resolveApiLink(map: ApiLinkMap, file: string, anchor?: string) {
  return anchor ? map.anchors[`${file}#${anchor}`] : map.files[file]
}

const startMarker = (file: string) => `<!-- vw-docs-start: ${file} -->`
const startMarkerRE = /^<!-- vw-docs-start: ([\w.-]+) -->\s*$/
const endMarker = '<!-- vw-docs-end -->'
// The TypeDoc comments of src/ write types such as `ReadonlySet<string>` and placeholders such as `<row>` in running
// text. VitePress compiles a page's HTML as a Vue template, where they would be unclosed elements, so in the generated
// type reference every tag outside this list is shown as text. docs/*.md keeps such text in code spans instead, so that
// GitHub and npm show it too (test/docs-markdown.test.mjs checks this).
const htmlTagRE = /^<\/?(a|b|br|code|em|i|img|kbd|p|span|strong|sub|sup|wbr)(?=[\s/>])/i

function escapeUnknownHtml(children: { type: string; content: string }[]) {
  for (const child of children) {
    if (child.type === 'html_inline' && !child.content.startsWith('<!--') && !htmlTagRE.test(child.content)) child.type = 'text'
  }
}

/**
 * Rewrites the links of text included from docs/ to the pages that now hold their targets: `#anchor` and
 * `other.md#anchor` to the API page (in the page's locale), other relative paths (`../CHANGELOG.md`) to the file on
 * GitHub. A link to a heading that no page includes fails the build.
 */
export function apiDocsMarkdown(md: MarkdownRenderer, map: ApiLinkMap) {
  // Runs before VitePress expands the includes, so the included text arrives between two markers that name its file.
  const renderAsync = md.renderAsync.bind(md)
  md.renderAsync = (src, env) => renderAsync(src.replace(/^<!--\s*@include:\s*\S*?docs\/([\w-]+\.md)#[\w-]+\s*-->[ \t]*$/gm,
    (include, file: string) => `${startMarker(file)}\n\n${include}\n\n${endMarker}`), env)

  md.core.ruler.push('vw_docs_links', state => {
    const env = state.env as { relativePath?: string }
    const relativePath = env.relativePath ?? ''
    const locale = relativePath.startsWith('ja/') ? '/ja' : ''
    const ownRoute = '/' + relativePath.replace(/^ja\//, '').replace(/(^|\/)index\.md$/, '$1').replace(/\.md$/, '')
    const files: string[] = []
    const reference = /^(?:ja\/)?api\/reference\//.test(relativePath)
    for (const token of state.tokens) {
      if (reference && token.type === 'inline') escapeUnknownHtml(token.children ?? [])
      if (token.type === 'html_block') {
        const start = startMarkerRE.exec(token.content)
        if (start) files.push(start[1]!)
        else if (token.content.trim() === endMarker) files.pop()
        else continue
        token.content = ''
        continue
      }
      const file = files.at(-1)
      if (!file || token.type !== 'inline') continue
      for (const child of token.children ?? []) {
        // The anchor plugin has already added the permalinks of the headings, which point at this page's own IDs.
        if (child.type !== 'link_open' || child.attrGet('class') === 'header-anchor') continue
        const href = child.attrGet('href')
        if (!href || /^[a-z][a-z\d+.-]*:|^\/\//i.test(href)) continue
        const [path = '', anchor] = href.split('#', 2)
        const target = path === '' ? file : /^[\w-]+\.md$/.test(path) && map.files[path] ? path : undefined
        if (!target) {
          // A repository file outside the site, such as ../CHANGELOG.md or ../examples/....
          child.attrSet('href', `${repository}/blob/main/${posix.join('docs', path)}${anchor ? '#' + anchor : ''}`)
          continue
        }
        const route = resolveApiLink(map, target, anchor)
        if (!route) throw new Error(`docs/${file} links to ${href}, which no API page includes (in ${relativePath})`)
        const [routePath, routeAnchor] = route.split('#')
        child.attrSet('href', routePath === ownRoute && routeAnchor ? '#' + routeAnchor : locale + route)
      }
    }
  })
}

const virtualId = 'virtual:vw-api-links'

/** Serves the map to the theme as `virtual:vw-api-links` (see theme/i18n.ts `apiHref`). */
export function apiLinksPlugin(map: ApiLinkMap): Plugin {
  return {
    name: 'vue-weave:api-links',
    resolveId(id) {
      return id === virtualId ? '\0' + virtualId : undefined
    },
    load(id) {
      return id === '\0' + virtualId ? `export default ${JSON.stringify(map)}` : undefined
    },
  }
}
