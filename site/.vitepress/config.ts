import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig, type DefaultTheme, type Plugin } from 'vitepress'
import { exampleById } from '../examples/registry'

const repository = 'https://github.com/EightKK/vue-weave'
// GitHub Pages serves the repository's site under /vue-weave/; scripts/serve.mjs serves preview/ at the same path, so
// every link, asset and test URL is the same locally and when deployed.
const base = '/vue-weave/'
const { version } = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as { version: string }
const releaseLine = version.split('.').slice(0, 2).join('.')
const favicon = readFileSync(new URL('../../examples/favicon.svg', import.meta.url))
// The demo app's global stylesheet, limited to the live demo panels of the example pages (see theme/custom.css).
const demoStyles = `@scope (.vw-site-demo) {\n${readFileSync(new URL('../../examples/demo.css', import.meta.url), 'utf8')}}\n`

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

function sidebar(locale: Locale): DefaultTheme.Sidebar {
  const prefix = locale === 'ja' ? '/ja' : ''
  return {
    [`${prefix}/learn/`]: [{
      text: locale === 'ja' ? 'はじめに' : 'Getting started',
      items: [{ text: locale === 'ja' ? 'インストールと最初のコンポーネント' : 'Install and first components', link: `${prefix}/learn/` }],
    }],
    [`${prefix}/api/`]: [{
      text: 'API',
      items: [{ text: locale === 'ja' ? '概要' : 'Overview', link: `${prefix}/api/` }],
    }],
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
  cleanUrls: false,
  // The production demo and the legacy gallery are separate pages built by vite.demo.config.ts.
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
        _render(source, env, md) {
          const page = examplePageData(env.relativePath)
          if (page) return `<h1>${escapeHtml(page.title)}</h1><p>${escapeHtml(page.description)}</p>`
          return md.render(source, env)
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
  },
  vite: {
    plugins: [siteFavicon()],
    // Demos read the package version, as in vite.demo.config.ts.
    define: { __VUE_WEAVE_VERSION__: JSON.stringify(version) },
    server: { host: '127.0.0.1', port: 5173, fs: { allow: [fileURLToPath(new URL('../../', import.meta.url))] } },
  },
})
