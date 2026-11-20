// Server rendering for the SSR tests. `npm test` runs test/*.test.mjs only, so this directory holds no tests.
import { createSSRApp, h } from 'vue'
import { renderToString } from 'vue/server-renderer'

/** Renders `h(...args)` as the root of a server app and resolves to its HTML. */
export function renderComponent(...args) {
  return renderToString(createSSRApp({ render: () => h(...args) }))
}
