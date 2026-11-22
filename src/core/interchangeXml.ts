// Internal XML helpers of the interchange formats: a DOM-free reader that never expands declared entities (used by
// `fromMsProjectXml`, `fromGraphMl` and `fromDrawio`) and the escaping of the writers. Only `escapeXml` is public,
// re-exported by `exportSvg.ts`.

import { stripBom } from './interchangeShared.js'

// Characters that XML 1.0 forbids, and unpaired surrogates.
const invalidXml = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g
const entities: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&apos;' }

/**
 * Text without the characters that XML 1.0 does not allow (C0 controls other than tab and line breaks, U+FFFE and
 * U+FFFF) and without unpaired surrogates.
 */
export function dropInvalidXmlChars(value: string): string {
  return String(value).replace(invalidXml, '')
}

/** Escape text for XML content and attribute values and drop characters that XML 1.0 does not allow. */
export function escapeXml(value: string): string {
  return dropInvalidXmlChars(value).replace(/[&<>"']/g, char => entities[char]!)
}

/** XML text for an attribute value: escaped, with tabs and line breaks as character references so they survive. */
export function xmlAttribute(value: string) {
  return escapeXml(value).replace(/[\t\n\r]/g, char => '&#' + char.charCodeAt(0) + ';')
}

/** XML text for element content: escaped, with carriage returns as character references so they survive. */
export function xmlText(value: string) {
  return escapeXml(value).replace(/\r/g, '&#13;')
}

/**
 * Whether a code point is a character XML 1.0 allows: tab, line feed, carriage return and the rest of Unicode except
 * the other C0 controls, surrogates, U+FFFE and U+FFFF.
 */
export function isXmlCodePoint(code: number) {
  return code === 0x9 || code === 0xa || code === 0xd || (code >= 0x20 && code <= 0xd7ff)
    || (code >= 0xe000 && code <= 0xfffd) || (code >= 0x10000 && code <= 0x10ffff)
}

/**
 * The character of a numeric character reference, or undefined for a code point XML 1.0 does not allow (see
 * `isXmlCodePoint`). The character-reference decoders of every reader (XML, draw.io HTML labels, Mermaid text) use it,
 * so they decode the same characters.
 */
export function referencedCharacter(code: number): string | undefined {
  return isXmlCodePoint(code) ? String.fromCodePoint(code) : undefined
}

/** The five entities XML predefines, by name. The HTML and Mermaid label decoders extend this table. */
export const predefinedEntities: Readonly<Record<string, string>> = { lt: '<', gt: '>', amp: '&', quot: '"', apos: '\'' }

/** An element of a parsed XML document. */
export interface XmlElement {
  /** The local name, without a namespace prefix. */
  name: string
  attributes: Map<string, string>
  children: XmlElement[]
  /** The text and CDATA directly inside the element, in document order. */
  text: string
}

const xmlName = /[A-Za-z_:À-￿][\w.\-:·À-￿]*/y
const xmlSpace = /[ \t\r\n]*/y

function xmlError(source: string, index: number, reason: string) {
  let line = 1, lineStart = 0
  for (let i = source.indexOf('\n'); i >= 0 && i < index; i = source.indexOf('\n', i + 1)) {
    line++
    lineStart = i + 1
  }
  return new Error(`Invalid XML at line ${line}, column ${index - lineStart + 1}: ${reason}`)
}

/**
 * Replace the predefined entities and character references of text that starts at `offset`. Any other entity is an
 * error: declared entities are never expanded, so a document cannot pull in external files or grow without bound.
 */
function decodeXml(source: string, raw: string, offset: number) {
  if (!raw.includes('&')) return raw
  let result = '', cursor = 0
  for (let amp = raw.indexOf('&'); amp >= 0; amp = raw.indexOf('&', cursor)) {
    const semicolon = raw.indexOf(';', amp)
    if (semicolon < 0) throw xmlError(source, offset + amp, 'unterminated entity reference')
    const entity = raw.slice(amp + 1, semicolon)
    let value = Object.hasOwn(predefinedEntities, entity) ? predefinedEntities[entity] : undefined
    const reference = /^#(?:x([0-9A-Fa-f]{1,6})|(\d{1,7}))$/.exec(entity)
    if (reference) {
      const code = reference[1] !== undefined ? parseInt(reference[1], 16) : Number(reference[2])
      value = referencedCharacter(code)
    }
    if (value === undefined) throw xmlError(source, offset + amp, `unknown or invalid entity &${entity};`)
    result += raw.slice(cursor, amp) + value
    cursor = semicolon + 1
  }
  return result + raw.slice(cursor)
}

/** The index after a DOCTYPE declaration that starts at `start`. Its internal subset is skipped, not interpreted. */
function skipDoctype(source: string, start: number) {
  let depth = 0
  for (let i = start + 9; i < source.length; i++) {
    const char = source[i]!
    if (char === '"' || char === '\'') {
      const close = source.indexOf(char, i + 1)
      if (close < 0) break
      i = close
    } else if (source.startsWith('<!--', i)) {
      const close = source.indexOf('-->', i + 4)
      if (close < 0) break
      i = close + 2
    } else if (source.startsWith('<?', i)) {
      const close = source.indexOf('?>', i + 2)
      if (close < 0) break
      i = close + 1
    } else if (char === '[') depth++
    else if (char === ']') depth--
    else if (char === '>' && depth <= 0) return i + 1
  }
  throw xmlError(source, start, 'unterminated DOCTYPE declaration')
}

/**
 * Parse an XML document into its root element with a loop, without a DOM: elements, attributes, text, the predefined
 * entities, character references, CDATA, comments and processing instructions. A DOCTYPE is skipped and its
 * declarations are not used. Element and attribute names keep only their local part. Throws an Error with the line
 * and column for malformed XML.
 */
export function parseXml(input: string): XmlElement {
  const source = stripBom(input)
  const length = source.length
  const stack: { element: XmlElement; tag: string }[] = []
  let root: XmlElement | undefined
  const nameAt = (index: number) => {
    xmlName.lastIndex = index
    return xmlName.exec(source)?.[0]
  }
  const spaceAfter = (index: number) => {
    xmlSpace.lastIndex = index
    xmlSpace.exec(source)
    return xmlSpace.lastIndex
  }
  let index = 0
  while (index < length) {
    const open = source.indexOf('<', index)
    const textEnd = open < 0 ? length : open
    if (textEnd > index) {
      const raw = source.slice(index, textEnd)
      const parent = stack.at(-1)
      if (parent) parent.element.text += decodeXml(source, raw.replace(/\r\n?/g, '\n'), index)
      else if (!/^[ \t\r\n]*$/.test(raw)) throw xmlError(source, index, 'text outside the root element')
      index = textEnd
      if (open < 0) break
    }
    if (source.startsWith('<?', index)) {
      const close = source.indexOf('?>', index + 2)
      if (close < 0) throw xmlError(source, index, 'unterminated processing instruction')
      index = close + 2
    } else if (source.startsWith('<!--', index)) {
      const close = source.indexOf('-->', index + 4)
      if (close < 0) throw xmlError(source, index, 'unterminated comment')
      index = close + 3
    } else if (source.startsWith('<![CDATA[', index)) {
      const parent = stack.at(-1)
      if (!parent) throw xmlError(source, index, 'CDATA outside the root element')
      const close = source.indexOf(']]>', index + 9)
      if (close < 0) throw xmlError(source, index, 'unterminated CDATA section')
      parent.element.text += source.slice(index + 9, close).replace(/\r\n?/g, '\n')
      index = close + 3
    } else if (source.startsWith('<!DOCTYPE', index)) {
      if (root) throw xmlError(source, index, 'a DOCTYPE after the root element')
      index = skipDoctype(source, index)
    } else if (source[index + 1] === '!') {
      throw xmlError(source, index, 'unsupported markup declaration')
    } else if (source[index + 1] === '/') {
      const tag = nameAt(index + 2)
      if (tag === undefined) throw xmlError(source, index + 2, 'expected an element name')
      const close = spaceAfter(index + 2 + tag.length)
      if (source[close] !== '>') throw xmlError(source, close, 'expected > after the end tag name')
      const element = stack.pop()
      if (!element) throw xmlError(source, index, 'end tag </' + tag + '> without a start tag')
      if (element.tag !== tag) throw xmlError(source, index, `end tag </${tag}> does not close <${element.tag}>`)
      index = close + 1
    } else {
      if (root && !stack.length) throw xmlError(source, index, 'a second root element')
      const tag = nameAt(index + 1)
      if (tag === undefined) throw xmlError(source, index + 1, 'expected an element name')
      const element: XmlElement = { name: tag.slice(tag.lastIndexOf(':') + 1), attributes: new Map(), children: [], text: '' }
      const qualified = new Set<string>()
      let cursor = index + 1 + tag.length
      let empty = false
      for (;;) {
        const next = spaceAfter(cursor)
        if (source[next] === '>') {
          cursor = next + 1
          break
        }
        if (source.startsWith('/>', next)) {
          cursor = next + 2
          empty = true
          break
        }
        if (next >= length) throw xmlError(source, index, `unterminated start tag <${tag}>`)
        const attribute = next > cursor ? nameAt(next) : undefined
        if (attribute === undefined) throw xmlError(source, next, `expected an attribute name or the end of <${tag}>`)
        const equals = spaceAfter(next + attribute.length)
        if (source[equals] !== '=') throw xmlError(source, equals, 'expected = after the attribute name ' + attribute)
        const quoteAt = spaceAfter(equals + 1)
        const quote = source[quoteAt]
        if (quote !== '"' && quote !== '\'') throw xmlError(source, quoteAt, 'expected a quoted value for the attribute ' + attribute)
        const close = source.indexOf(quote, quoteAt + 1)
        if (close < 0) throw xmlError(source, quoteAt, 'unterminated value of the attribute ' + attribute)
        const raw = source.slice(quoteAt + 1, close)
        if (raw.includes('<')) throw xmlError(source, quoteAt, 'a < in the value of the attribute ' + attribute)
        if (qualified.has(attribute)) throw xmlError(source, next, 'duplicate attribute ' + attribute)
        qualified.add(attribute)
        element.attributes.set(attribute.slice(attribute.lastIndexOf(':') + 1),
          decodeXml(source, raw.replace(/\r\n?/g, '\n').replace(/[\t\n]/g, ' '), quoteAt + 1))
        cursor = close + 1
      }
      const parent = stack.at(-1)
      if (parent) parent.element.children.push(element)
      else root = element
      if (!empty) stack.push({ element, tag })
      index = cursor
    }
  }
  if (stack.length) throw xmlError(source, length, `unclosed element <${stack.at(-1)!.tag}>`)
  if (!root) throw xmlError(source, length, 'no root element')
  return root
}

/** The first child element of each local name. */
export function childMap(element: XmlElement) {
  const map = new Map<string, XmlElement>()
  for (const child of element.children) if (!map.has(child.name)) map.set(child.name, child)
  return map
}
