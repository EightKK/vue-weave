// The interface text of the site's own components in each language, and helpers for the current locale.
import { computed, onMounted, ref } from 'vue'
import { useData, withBase } from 'vitepress'
import apiLinks from 'virtual:vw-api-links'
import type { Localized } from '../../examples/registry'

export type SiteLocale = 'en' | 'ja'

const messages = {
  en: {
    examples: 'Examples',
    showcase: 'Showcase',
    allExamples: 'All examples',
    categories: 'Categories',
    exampleCount: (count: number) => count === 1 ? '1 example' : `${count} examples`,
    demo: 'Live demo',
    source: 'Source code',
    sourceOnGitHub: 'Source on GitHub',
    viewOnGitHub: 'View on GitHub',
    relatedApi: 'Related API',
    fullWidth: 'Full width',
    resizeHint: 'Drag the lower-right corner of the demo to change its height.',
    backToExamples: '← All examples',
    backToShowcase: '← Showcase',
    legacyGallery: 'Legacy example gallery',
    legacyGalleryText: 'Examples that have not moved to this site yet are still in the legacy gallery.',
    productionDemo: 'Production planning demo',
    productionDemoText: 'Production planning, lot flow, a schedule sheet and an approval workflow in one application, in English and Japanese.',
    open: 'Open',
  },
  ja: {
    examples: '例',
    showcase: 'ショーケース',
    allExamples: 'すべての例',
    categories: 'カテゴリー',
    exampleCount: (count: number) => `${count} 件`,
    demo: 'ライブデモ',
    source: 'ソースコード',
    sourceOnGitHub: 'GitHub のソース',
    viewOnGitHub: 'GitHub で見る',
    relatedApi: '関連する API',
    fullWidth: '全幅表示',
    resizeHint: 'デモの右下の角をドラッグすると高さを変えられます。',
    backToExamples: '← すべての例',
    backToShowcase: '← ショーケース',
    legacyGallery: '旧サンプルギャラリー',
    legacyGalleryText: 'まだこのサイトに移していない例は旧ギャラリーにあります。',
    productionDemo: '生産計画デモ',
    productionDemoText: '生産計画、ロットの流れ、日程表シート、承認ワークフローを1つのアプリにまとめたデモです(日本語と英語)。',
    open: '開く',
  },
} satisfies Record<SiteLocale, unknown>

export const repository = 'https://github.com/EightKK/vue-weave'

/** The current locale, its messages, a picker for registry text and a builder for localized site links. */
export function useSiteLocale() {
  const { localeIndex } = useData()
  const locale = computed<SiteLocale>(() => localeIndex.value === 'ja' ? 'ja' : 'en')
  const t = computed(() => messages[locale.value])
  const pick = (text: Localized) => text[locale.value]
  /** A site path such as `/examples/` in the current locale, with the base. */
  const link = (path: string) => withBase((locale.value === 'ja' ? '/ja' : '') + path)
  return { locale, t, pick, link }
}

/**
 * The URL of an API reference entry, such as `api.md#treegrid` or `scheduling.md`: the API page (in `locale`) that
 * shows that heading of docs/*.md. A heading that no page includes falls back to the document on GitHub;
 * scripts/check-site-links.mjs fails the build for such an entry.
 */
export function apiHref(doc: string, locale: SiteLocale = 'en') {
  const [file = '', anchor] = doc.split('#', 2)
  const route = anchor ? apiLinks.anchors[`${file}#${anchor}`] : apiLinks.files[file]
  if (!route) return `${repository}/blob/main/docs/${doc}`
  const [path, hash] = route.split('#', 2)
  // Page routes have no extension; the site is built without clean URLs, so pages end in .html.
  const page = path!.endsWith('/') ? path! : path + '.html'
  return withBase((locale === 'ja' ? '/ja' : '') + page) + (hash ? '#' + hash : '')
}

/** The GitHub URL of a repository file. */
export const sourceHref = (path: string) => `${repository}/blob/main/${path}`

/**
 * Whether the site is in dark mode, but false until the component has mounted: the server renders the light theme, so a
 * class that follows this value matches the server markup while hydrating and switches right after.
 */
export function useMountedDark() {
  const { isDark } = useData()
  const mounted = ref(false)
  onMounted(() => { mounted.value = true })
  return computed(() => mounted.value && isDark.value)
}
