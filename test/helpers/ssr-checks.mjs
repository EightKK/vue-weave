// Shared checks for the dedicated SSR tests. `npm test` runs test/*.test.mjs only, so this directory holds no tests.
import assert from 'node:assert/strict'

const domGlobals = ['window', 'document', 'HTMLElement', 'ResizeObserver', 'MutationObserver', 'requestAnimationFrame', 'localStorage']

/** Fails when the process has a browser global, so a render that passes did not depend on one. */
export function assertNoDomGlobals() {
  for (const name of domGlobals) assert.equal(typeof globalThis[name], 'undefined', `${name} must not exist on the server`)
}

/**
 * Renders twice with `render` and returns the first HTML, after checking the two are identical (no random IDs: `useId()`
 * restarts per app) and that the render neither needed nor created a browser global.
 */
export async function renderStable(render) {
  assertNoDomGlobals()
  const first = await render()
  const second = await render()
  assert.equal(second, first, 'two server renders of the same input differ')
  assertNoDomGlobals()
  assert.doesNotMatch(first, /undefined|NaN|\[object Object\]/)
  return first
}

/** The IDs an HTML string defines, in order. */
export const definedIds = html => [...html.matchAll(/\sid="([^"]+)"/g)].map(match => match[1])

/** Checks that no ID is defined twice and that every `for` and `aria-*` reference names an ID of the same HTML. */
export function assertIdsResolve(html) {
  const ids = definedIds(html)
  assert.equal(new Set(ids).size, ids.length, 'duplicate IDs: ' + ids.filter((id, i) => ids.indexOf(id) !== i).join(', '))
  const known = new Set(ids)
  for (const match of html.matchAll(/\s(?:for|aria-labelledby|aria-describedby|aria-controls|aria-activedescendant)="([^"]+)"/g)) {
    for (const id of match[1].split(/\s+/)) assert.ok(known.has(id), `reference to a missing ID: ${id}`)
  }
}
