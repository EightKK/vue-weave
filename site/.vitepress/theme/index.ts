import type { Theme } from 'vitepress'
import DefaultTheme from 'vitepress/theme'
import '../../../src/styles/style.css'
import './custom.css'
import Layout from './Layout.vue'
import ExamplePage from './components/ExamplePage.vue'
import ExamplesIndex from './components/ExamplesIndex.vue'
import ShowcaseIndex from './components/ShowcaseIndex.vue'
import HomeDemo from './components/HomeDemo.vue'

export default {
  extends: DefaultTheme,
  Layout,
  enhanceApp({ app }) {
    app.component('ExamplePage', ExamplePage)
    app.component('ExamplesIndex', ExamplesIndex)
    app.component('ShowcaseIndex', ShowcaseIndex)
    app.component('HomeDemo', HomeDemo)
  },
} satisfies Theme
