// gallery.html, the address of the retired example gallery, now forwards to the documentation site. The gallery chose a
// demo by its ID (`DemoEntry.id`, kept as `legacyId` in the site registry); a link can carry it as `?demo=<id>`,
// `?preset=<id>` or `#<id>`. Known IDs open their example or showcase page, anything else the example index, in
// Japanese with `?lang=ja`. Paths are relative to this page, so the forward works under any base path.
import { examples } from '../site/examples/registry'

// The data sets of the gallery's main page are all on the "Graph and Gantt basics" page; only some have their own.
const aliases: Readonly<Record<string, string>> = { project: 'manufacturing' }

/** The site page, relative to gallery.html, for the query and hash of a gallery URL. */
function galleryTarget(search: string, hash: string) {
  const query = new URLSearchParams(search)
  let requested = query.get('demo') ?? query.get('preset') ?? hash.replace(/^#/, '')
  try {
    if (!query.has('demo') && !query.has('preset')) requested = decodeURIComponent(requested)
  } catch {
    requested = ''
  }
  const legacyId = Object.hasOwn(aliases, requested) ? aliases[requested]! : requested
  const entry = legacyId ? examples.find(item => item.legacyId === legacyId) : undefined
  const prefix = query.get('lang') === 'ja' ? 'ja/' : ''
  if (!entry) return prefix + 'examples/'
  return `${prefix}${entry.kind === 'showcase' ? 'showcase' : 'examples'}/${entry.id}/`
}

location.replace(new URL(galleryTarget(location.search, location.hash), location.href).href)
