// Shared checks of exported SVG documents (not tests).
import assert from 'node:assert/strict'

/**
 * A small well-formedness check: one root, balanced tags, quoted attributes, only the predefined entities, no characters
 * XML 1.0 forbids and no script content.
 */
export function assertWellFormed(xml) {
  assert.ok(xml.startsWith('<svg '), 'starts with the svg root')
  assert.ok(!/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/.test(xml), 'no characters that XML forbids')
  assert.ok(!xml.includes(']]>'), 'no CDATA end marker')
  const stack = []
  const token = /<(\/?)([A-Za-z][\w:-]*)((?:\s+[\w:-]+="[^"<]*")*)\s*(\/?)>|([^<]+)|(<)/g
  let match
  let roots = 0
  while ((match = token.exec(xml))) {
    const [, close, name, , selfClose, text, stray] = match
    assert.equal(stray, undefined, 'unexpected < at ' + match.index)
    if (text !== undefined) {
      assert.ok(!/&(?!(?:amp|lt|gt|quot|apos);)/.test(text), 'unescaped & in text: ' + text)
      assert.ok(!text.includes('>'), 'unescaped > in text: ' + text)
      continue
    }
    if (close) assert.equal(stack.pop(), name, 'mismatched closing tag ' + name)
    else if (!selfClose) {
      if (!stack.length) roots++
      stack.push(name)
    } else if (!stack.length) roots++
  }
  assert.deepEqual(stack, [])
  assert.equal(roots, 1)
  for (const attributes of xml.matchAll(/="([^"]*)"/g)) {
    assert.ok(!/&(?!(?:amp|lt|gt|quot|apos);)/.test(attributes[1]), 'unescaped & in attribute')
  }
  assert.ok(!/<script|\son\w+="|javascript:/i.test(xml), 'no script content')
}

/** The text content of every `<text>` element, unescaped. */
export function svgTexts(xml) {
  const unescape = text => text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, '\'').replace(/&amp;/g, '&')
  return [...xml.matchAll(/<text\b[^>]*>([^<]*)<\/text>/g)].map(match => unescape(match[1]))
}

/** The `width` and `height` of the root element. */
export function svgSize(xml) {
  const root = /^<svg\b[^>]*>/.exec(xml)[0]
  return { width: Number(/\swidth="([^"]+)"/.exec(root)[1]), height: Number(/\sheight="([^"]+)"/.exec(root)[1]) }
}

/** Text that exercises escaping: markup, entities, quotes, control characters and a CDATA end. */
export const hostile = 'A <b>&amp; "q" \'s\' \u0001\u0008 ]]> end'
