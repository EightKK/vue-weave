import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig, type DefaultTheme, type Plugin } from 'vitepress'
import { exampleById } from '../examples/registry'
import { apiDocsMarkdown, apiLinksPlugin, buildApiLinkMap, slugify } from './apiDocs'

const repository = 'https://github.com/EightKK/vue-weave'
// GitHub Pages serves the repository's site under /vue-weave/; scripts/serve.mjs serves preview/ at the same path, so
// every link, asset and test URL is the same locally and when deployed.
const base = '/vue-weave/'
const { version } = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as { version: string }
const releaseLine = version.split('.').slice(0, 2).join('.')
const favicon = readFileSync(new URL('../../examples/favicon.svg', import.meta.url))
// The demo app's global stylesheet, limited to the live demo panels of the example pages (see theme/custom.css).
const demoStyles = `@scope (.vw-site-demo) {\n${readFileSync(new URL('../../examples/demo.css', import.meta.url), 'utf8')}}\n`
// Which API page shows each heading of docs/*.md (see apiDocs.ts). Read once when the configuration loads; restart the
// development server after moving a region between pages.
const apiLinks = buildApiLinkMap(fileURLToPath(new URL('../', import.meta.url)))

// The site reuses the demo app's favicon as its logo and tab icon instead of keeping a copy in site/public.
function siteFavicon(): Plugin {
  return {
    name: 'vue-weave:site-favicon',
    configureServer(server) {
      server.middlewares.use(base + 'favicon.svg', (_request, response) => {
        response.setHeader('Content-Type', 'image/svg+xml')
        response.end(favicon)
      })
    },
    generateBundle(options) {
      // Emit once, from the client build (the server build writes to a temporary directory).
      if (options.format === 'es' && !this.environment?.config.build.ssr) this.emitFile({ type: 'asset', fileName: 'favicon.svg', source: favicon })
    },
  }
}

type Locale = 'en' | 'ja'

function nav(locale: Locale): DefaultTheme.NavItem[] {
  const prefix = locale === 'ja' ? '/ja' : ''
  const text = locale === 'ja'
    ? { learn: 'ガイド', examples: '作例', showcase: 'ショーケース', api: 'API' }
    : { learn: 'Learn', examples: 'Examples', showcase: 'Showcase', api: 'API' }
  return [
    { text: text.learn, link: `${prefix}/learn/`, activeMatch: `^${prefix}/learn/` },
    { text: text.examples, link: `${prefix}/examples/`, activeMatch: `^${prefix}/examples/` },
    { text: text.showcase, link: `${prefix}/showcase/`, activeMatch: `^${prefix}/showcase/` },
    { text: text.api, link: `${prefix}/api/`, activeMatch: `^${prefix}/api/` },
    { text: 'v' + releaseLine, items: [
      { text: locale === 'ja' ? '変更履歴' : 'Changelog', link: `${repository}/blob/main/CHANGELOG.md` },
      { text: locale === 'ja' ? 'リリース' : 'Releases', link: `${repository}/releases` },
    ] },
  ]
}

/** The API pages in sidebar order, with their English and Japanese titles. Paths are relative to /api/. */
const apiSidebar: { text: [string, string]; items: { text: [string, string]; path: string }[] }[] = [
  { text: ['API', 'API'], items: [
    { text: ['Overview', '概要'], path: '' },
    { text: ['Errors and validation', 'エラーと検証'], path: 'errors' },
    { text: ['Theming and CSS variables', 'テーマと CSS 変数'], path: 'theming' },
  ] },
  { text: ['Components', 'コンポーネント'], items: [
    { text: ['NetworkGraph', 'NetworkGraph'], path: 'components/network-graph' },
    { text: ['GanttChart', 'GanttChart'], path: 'components/gantt-chart' },
    { text: ['TreeGrid', 'TreeGrid'], path: 'components/tree-grid' },
    { text: ['TaskBoard', 'TaskBoard'], path: 'components/task-board' },
    { text: ['EventCalendar', 'EventCalendar'], path: 'components/event-calendar' },
    { text: ['GraphPalette and PropertyInspector', 'GraphPalette と PropertyInspector'], path: 'components/diagram-editor' },
  ] },
  { text: ['Composables', 'コンポーザブル'], items: [
    { text: ['Vue composables', 'Vue のコンポーザブル'], path: 'composables' },
  ] },
  { text: ['Core', 'コア'], items: [
    { text: ['Core entry point', 'コアのエントリーポイント'], path: 'core/' },
    { text: ['Graph layout and routing', 'グラフのレイアウトとルーティング'], path: 'core/graph-layout' },
    { text: ['Graph algorithms and traversal', 'グラフのアルゴリズムと探索'], path: 'core/graph-algorithms' },
    { text: ['Timeline and scales', 'タイムラインと時間軸'], path: 'core/timeline' },
    { text: ['Scheduling and resources', 'スケジューリングとリソース'], path: 'core/scheduling' },
    { text: ['Linked views and data', '連動ビューとデータ'], path: 'core/linked-data' },
    { text: ['Interchange and export', 'インターチェンジとエクスポート'], path: 'core/interchange' },
  ] },
  { text: ['Guides', 'ガイド'], items: [
    { text: ['Setup, TypeScript and Nuxt', 'セットアップ、TypeScript、Nuxt'], path: 'guides/setup' },
    { text: ['Graph integration', 'グラフの組み込み'], path: 'guides/graph' },
    { text: ['Data, saving and linked views', 'データ、保存、連動ビュー'], path: 'guides/data' },
    { text: ['Scheduling guide', 'スケジューリングガイド'], path: 'guides/scheduling' },
    { text: ['Resources and plan analysis', 'リソースと計画の分析'], path: 'guides/resources' },
    { text: ['Architecture and scope', 'アーキテクチャと範囲'], path: 'guides/architecture' },
  ] },
]

function sidebar(locale: Locale): DefaultTheme.Sidebar {
  const prefix = locale === 'ja' ? '/ja' : ''
  const ja = locale === 'ja'
  const pick = (text: [string, string]) => text[ja ? 1 : 0]
  return {
    [`${prefix}/learn/`]: [{
      text: ja ? 'はじめに' : 'Getting started',
      items: [{ text: ja ? 'インストールと最初のコンポーネント' : 'Install and first components', link: `${prefix}/learn/` }],
    }],
    [`${prefix}/api/`]: [
      ...apiSidebar.map(group => ({
        text: pick(group.text),
        items: group.items.map(item => ({ text: pick(item.text), link: `${prefix}/api/${item.path}` })),
      })),
      // Generated by TypeDoc (scripts/api-reference.mjs) in English only; the Japanese site shows a copy of the same
      // pages under /ja/api/reference/, with its own navigation.
      { text: ja ? '型リファレンス(英語)' : 'Type reference', collapsed: false, items: [
        { text: ja ? '型リファレンスの目次' : 'All modules', link: `${prefix}/api/reference/` },
        { text: '@eightkk/vue-weave', link: `${prefix}/api/reference/vue-weave/` },
        { text: '@eightkk/vue-weave/core', link: `${prefix}/api/reference/core/` },
      ] },
    ],
  }
}

function themeConfig(locale: Locale): DefaultTheme.Config {
  const ja = locale === 'ja'
  return {
    nav: nav(locale),
    sidebar: sidebar(locale),
    editLink: {
      pattern: `${repository}/edit/main/site/:path`,
      text: ja ? 'GitHub でこのページを編集' : 'Edit this page on GitHub',
    },
    outline: { label: ja ? 'このページの内容' : 'On this page' },
    docFooter: ja ? { prev: '前のページ', next: '次のページ' } : undefined,
    darkModeSwitchLabel: ja ? '外観' : 'Appearance',
    lightModeSwitchTitle: ja ? 'ライトテーマに切り替え' : 'Switch to light theme',
    darkModeSwitchTitle: ja ? 'ダークテーマに切り替え' : 'Switch to dark theme',
    sidebarMenuLabel: ja ? 'メニュー' : 'Menu',
    returnToTopLabel: ja ? 'トップに戻る' : 'Return to top',
    langMenuLabel: ja ? '言語を切り替え' : 'Change language',
    skipToContentLabel: ja ? '本文へ移動' : 'Skip to content',
    notFound: ja ? { title: 'ページが見つかりません', quote: 'URL を確認するか、ホームから探してください。', linkText: 'ホームへ' } : undefined,
    footer: {
      message: ja ? 'MIT ライセンスで公開しています。' : 'Released under the MIT License.',
      copyright: 'Vue Weave',
    },
  }
}

/** The title and description of an example or showcase page, from the registry. */
function examplePageData(relativePath: string) {
  const match = /^(ja\/)?(?:examples|showcase)\/([\w-]+)\/index\.md$/.exec(relativePath)
  const entry = match && exampleById(match[2]!)
  if (!match || !entry) return undefined
  const locale: Locale = match[1] ? 'ja' : 'en'
  return { title: entry.title[locale], description: entry.description[locale] }
}

const escapeHtml = (text: string) => text.replace(/[&<>"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char]!)

export default defineConfig({
  title: 'Vue Weave',
  description: 'Interactive network graphs and Gantt charts for Vue 3.',
  base,
  outDir: '../preview',
  // Outside site/, so the demo build hash (scripts/demo-build.mjs) never reads the cache.
  cacheDir: '../node_modules/.cache/vitepress',
  srcExclude: ['**/README.md'],
  lastUpdated: false,
  markdown: {
    anchor: { slugify },
    config(md) {
      apiDocsMarkdown(md, apiLinks)
    },
  },
  cleanUrls: false,
  // The production demo and gallery.html (the old gallery address, which forwards to the example pages) are separate
  // pages built by vite.demo.config.ts.
  ignoreDeadLinks: [/^\/(?:ja\/)?(?:demo\/|gallery\.html)/],
  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: base + 'favicon.svg' }],
    ['meta', { name: 'theme-color', content: '#345fd3' }],
    ['style', {}, demoStyles],
    // The previous homepage took ?lang=ja; send such links to the Japanese home.
    ['script', {}, `if (location.pathname === '${base}' && new URLSearchParams(location.search).get('lang') === 'ja') location.replace('${base}ja/')`],
  ],
  locales: {
    root: { label: 'English', lang: 'en', themeConfig: themeConfig('en') },
    ja: {
      label: '日本語', lang: 'ja', link: '/ja/',
      description: 'Vue 3 のためのインタラクティブなネットワークグラフとガントチャート。',
      themeConfig: themeConfig('ja'),
    },
  },
  themeConfig: {
    logo: { src: '/favicon.svg', alt: '' },
    socialLinks: [
      { icon: 'github', link: repository },
      { icon: 'npm', link: 'https://www.npmjs.com/package/@eightkk/vue-weave' },
    ],
    search: {
      provider: 'local',
      options: {
        // The example pages are generated from the registry; index their title and description rather than their code.
        async _render(source, env, md) {
          const page = examplePageData(env.relativePath)
          if (page) return `<h1>${escapeHtml(page.title)}</h1><p>${escapeHtml(page.description)}</p>`
          // The generated type reference has about a thousand pages; index each by its symbol name only, so that the
          // search finds `traverseGraph` without loading the whole reference into the search index.
          if (/^(?:ja\/)?api\/reference\//.test(env.relativePath)) {
            const title = /^# (.+)$/m.exec(source)?.[1]?.replace(/\\/g, '') ?? ''
            return `<h1>${escapeHtml(title)}</h1>`
          }
          // renderAsync expands the docs/ includes of the API pages, so their text is searchable.
          const html = await md.renderAsync(source, env)
          return env.frontmatter?.search === false ? '' : html
        },
        locales: {
          ja: {
            translations: {
              button: { buttonText: '検索', buttonAriaLabel: '検索' },
              modal: {
                displayDetails: '詳細を表示',
                resetButtonTitle: '検索をリセット',
                backButtonTitle: '検索を閉じる',
                noResultsText: '見つかりませんでした',
                footer: { selectText: '選択', navigateText: '移動', closeText: '閉じる' },
              },
            },
          },
        },
      },
    },
  },
  transformPageData(pageData) {
    const page = examplePageData(pageData.relativePath)
    if (page) {
      pageData.title = page.title
      pageData.description = page.description
    }
    // The API pages are long; list their third-level headings (props, events, subsections) in the outline too.
    if (/^(?:ja\/)?api\//.test(pageData.relativePath)) pageData.frontmatter.outline ??= [2, 3]
    // The type reference is generated and gitignored, so it has no source on GitHub to edit.
    if (/^(?:ja\/)?api\/reference\//.test(pageData.relativePath)) pageData.frontmatter.editLink = false
  },
  vite: {
    plugins: [siteFavicon(), apiLinksPlugin(apiLinks)],
    server: { host: '127.0.0.1', port: 5173, fs: { allow: [fileURLToPath(new URL('../../', import.meta.url))] } },
  },
})
