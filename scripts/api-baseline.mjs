import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { join, relative, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

// Public API baseline: export names, normalized declarations, component props/emits/slots/exposed members and CSS
// custom properties, read from the built package (dist/). `api/public-api.md` is the reviewed baseline.
//
//   npm run build && node scripts/api-baseline.mjs            check dist/ against the baseline
//   npm run build && node scripts/api-baseline.mjs --update   rewrite the baseline from dist/
//
// test:package runs the check against the installed tarball.

const root = fileURLToPath(new URL('../', import.meta.url))
export const baselinePath = join(root, 'api', 'public-api.md')
const ts = createRequire(join(root, 'package.json'))('typescript')
const entries = [
  { name: '.', runtime: 'dist/index.js', types: 'dist/types/index.d.ts' },
  { name: './core', runtime: 'dist/core.js', types: 'dist/types/core/index.d.ts' },
]
const components = [
  { name: 'NetworkGraph', file: 'dist/types/components/NetworkGraph.vue.d.ts' },
  { name: 'GanttChart', file: 'dist/types/components/GanttChart.vue.d.ts' },
]
const printer = ts.createPrinter({ removeComments: true, newLine: ts.NewLineKind.LineFeed })
const byName = (a, b) => a < b ? -1 : a > b ? 1 : 0

function print(node) {
  return printer.printNode(ts.EmitHint.Unspecified, node, node.getSourceFile())
    .replace(/^export (?:default )?/, '')
    .replace(/^declare /, '')
    .replace(/\t/g, '    ')
}

// Variables print as their whole statement so the `const` and type stay together.
function declarationNode(declaration) {
  if (ts.isVariableDeclaration(declaration)) return declaration.parent.parent
  return declaration
}

function resolveAlias(checker, symbol) {
  return symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol
}

function members(typeNode, label) {
  assert.ok(typeNode && ts.isTypeLiteralNode(typeNode), `Unexpected declaration shape for ${label}`)
  return typeNode.members.map(member => print(member)).sort(byName)
}

// Depth-first search for the first descendant that matches.
function find(node, predicate) {
  let found
  ts.forEachChild(node, function visit(child) {
    if (found) return
    if (predicate(child)) found = child
    else ts.forEachChild(child, visit)
  })
  return found
}

// vue-tsc emits each generic SFC as `__VLS_export(props, ctx, exposed, setup?: Promise<{ props, slots, emit }>)`.
function componentSurface(program, component, packageDir) {
  const source = program.getSourceFile(join(packageDir, component.file))
  assert.ok(source, `Missing component declaration: ${component.file}`)
  const setup = find(source, node => ts.isParameter(node) && node.name.getText(source) === '__VLS_setup')
  assert.ok(setup?.type && ts.isTypeReferenceNode(setup.type), `Missing setup type in ${component.file}`)
  const context = setup.type.typeArguments?.[0]
  assert.ok(context && ts.isTypeLiteralNode(context), `Unexpected setup type in ${component.file}`)
  const property = name => context.members.find(member => member.name?.getText(source) === name)?.type
  const literalIn = type => ts.isTypeLiteralNode(type) ? type : find(type, ts.isTypeLiteralNode)
  const props = property('props')
  assert.ok(props, `Missing props in ${component.file}`)
  const emit = property('emit')
  assert.ok(emit && ts.isIntersectionTypeNode(emit), `Unexpected emit type in ${component.file}`)
  const exposed = property('expose')
  assert.ok(exposed, `Missing expose in ${component.file}`)
  return {
    props: members(literalIn(props), `${component.name} props`),
    emits: emit.types.map(type => print(ts.isParenthesizedTypeNode(type) ? type.type : type)).sort(byName),
    slots: members(property('slots'), `${component.name} slots`),
    exposed: members(literalIn(exposed), `${component.name} exposed members`),
  }
}

/** Reads the public API of the package in `packageDir` (the repository root or an installed copy). */
export async function readPublicApi(packageDir = root) {
  const files = entries.map(entry => join(packageDir, entry.types))
  const program = ts.createProgram(files, {
    strict: true, noEmit: true, skipLibCheck: true, types: [],
    module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext, target: ts.ScriptTarget.ES2022,
  })
  const checker = program.getTypeChecker()
  const typesRoot = resolve(packageDir, 'dist', 'types') + sep
  const exported = new Map()
  const internal = {}
  const model = { entries: {}, components: {}, css: {}, declarations: {}, internal: {} }

  for (const entry of entries) {
    const source = program.getSourceFile(join(packageDir, entry.types))
    assert.ok(source, `Missing declaration entry: ${entry.types}`)
    const symbols = checker.getExportsOfModule(checker.getSymbolAtLocation(source))
    const values = []
    const types = []
    for (const symbol of symbols) {
      const target = resolveAlias(checker, symbol)
      ;(target.flags & ts.SymbolFlags.Value ? values : types).push(symbol.name)
      const previous = exported.get(symbol.name)
      assert.ok(!previous || previous === target, `Export ${symbol.name} differs between entries`)
      exported.set(symbol.name, target)
    }
    const runtime = await import(pathToFileURL(join(packageDir, entry.runtime)).href)
    const runtimeNames = Object.keys(runtime).sort(byName)
    assert.deepEqual(runtimeNames, values.sort(byName), `Runtime exports of ${entry.name} differ from its declared values`)
    model.entries[entry.name] = {
      runtime: runtimeNames.map(name => `${name}: ${typeof runtime[name]}`),
      types: types.sort(byName),
    }
  }

  // Declarations of every export, plus the non-exported declarations they refer to (so changes to those show too).
  const exportedTargets = new Set(exported.values())
  const queue = [...exported].map(([name, symbol]) => ({ key: name, symbol, map: model.declarations }))
  const seen = new Set(exportedTargets)
  while (queue.length) {
    const { key, symbol, map } = queue.shift()
    const declarations = (symbol.declarations ?? []).filter(declaration => resolve(declaration.getSourceFile().fileName).startsWith(typesRoot))
    map[key] = declarations.map(declaration => print(declarationNode(declaration))).join('\n')
    for (const declaration of declarations) {
      ts.forEachChild(declaration, function visit(node) {
        let name
        if (ts.isTypeReferenceNode(node)) name = node.typeName
        else if (ts.isExpressionWithTypeArguments(node)) name = node.expression
        else if (ts.isTypeQueryNode(node)) name = node.exprName
        if (name) {
          const referenced = checker.getSymbolAtLocation(name)
          const target = referenced && resolveAlias(checker, referenced)
          const location = target?.declarations?.[0]
          const file = location && resolve(location.getSourceFile().fileName)
          if (target && !seen.has(target) && file.startsWith(typesRoot) && !file.endsWith('.vue.d.ts')
            && !(target.flags & ts.SymbolFlags.TypeParameter)) {
            seen.add(target)
            const path = relative(typesRoot, file).split(sep).join('/')
            queue.push({ key: `${target.name} (dist/types/${path})`, symbol: target, map: internal })
          }
        }
        ts.forEachChild(node, visit)
      })
    }
  }
  model.declarations = Object.fromEntries(Object.entries(model.declarations).sort(([a], [b]) => byName(a, b)))
  model.internal = Object.fromEntries(Object.entries(internal).sort(([a], [b]) => byName(a, b)))

  for (const component of components) model.components[component.name] = componentSurface(program, component, packageDir)

  const css = await readFile(join(packageDir, 'dist', 'style.css'), 'utf8')
  const defined = new Set([...css.matchAll(/(--vw-[\w-]+)\s*:/g)].map(match => match[1]))
  const read = new Set([...css.matchAll(/var\(\s*(--vw-[\w-]+)/g)].map(match => match[1]))
  model.css = {
    defined: [...defined].sort(byName),
    'read with var() but not defined in style.css': [...read].filter(name => !defined.has(name)).sort(byName),
  }
  return model
}

/** Renders the model as Markdown blocks keyed by heading, so the check can report changes per item. */
export function renderBlocks(model) {
  const blocks = []
  const list = (heading, items) => blocks.push({ heading, lines: items.map(item => `- \`${item}\``) })
  const code = (heading, text) => blocks.push({ heading, lines: ['```ts', ...text.split('\n'), '```'] })
  for (const [name, entry] of Object.entries(model.entries)) {
    list(`## Entry \`${name}\`: runtime exports (${entry.runtime.length})`, entry.runtime)
    list(`## Entry \`${name}\`: type-only exports (${entry.types.length})`, entry.types)
  }
  for (const [name, surface] of Object.entries(model.components)) {
    for (const [part, items] of Object.entries(surface)) code(`## Component \`${name}\`: ${part}`, items.join('\n'))
  }
  for (const [part, items] of Object.entries(model.css)) list(`## CSS custom properties: ${part}`, items)
  for (const [name, text] of Object.entries(model.declarations)) code(`### \`${name}\``, text)
  for (const [name, text] of Object.entries(model.internal)) code(`### Internal \`${name}\``, text)
  return blocks
}

const header = [
  '# @eightkk/vue-weave public API baseline',
  '',
  'Generated from the built package by `node scripts/api-baseline.mjs --update`; do not edit by hand. `npm run test:package`',
  'fails when the built API differs. Review every change: in 1.x, a removed or changed export, prop, event, slot,',
  'exposed member or CSS custom property is a breaking change. "Internal" declarations are not exported but appear',
  'in public signatures, so changes to them can break consumers too.',
  '',
]

export function renderBaseline(blocks) {
  const lines = [...header]
  let declarationsStarted = false
  for (const block of blocks) {
    if (block.heading.startsWith('### ') && !declarationsStarted) {
      declarationsStarted = true
      lines.push('## Declarations', '')
    }
    lines.push(block.heading, '', ...block.lines, '')
  }
  return lines.join('\n')
}

export function parseBaseline(text) {
  const blocks = new Map()
  let current
  for (const line of text.replace(/\r\n/g, '\n').split('\n')) {
    if (/^##+ /.test(line) && line !== '## Declarations') {
      current = { heading: line, lines: [] }
      blocks.set(line.replace(/ \(\d+\)$/, ''), current)
    } else if (current && line !== '' && line !== '## Declarations') current.lines.push(line)
  }
  return blocks
}

// A small line diff (longest common subsequence) for one block; blocks are short enough for the quadratic table.
function lineDiff(before, after) {
  const table = Array.from({ length: before.length + 1 }, () => new Uint32Array(after.length + 1))
  for (let i = before.length - 1; i >= 0; i--) {
    for (let j = after.length - 1; j >= 0; j--) {
      table[i][j] = before[i] === after[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1])
    }
  }
  const out = []
  let i = 0
  let j = 0
  while (i < before.length || j < after.length) {
    if (i < before.length && j < after.length && before[i] === after[j]) { i++; j++ }
    else if (i < before.length && (j === after.length || table[i + 1][j] >= table[i][j + 1])) out.push(`  - ${before[i++]}`)
    else out.push(`  + ${after[j++]}`)
  }
  return out
}

/** Compares the API in `packageDir` with the baseline and returns a readable report, or an empty string. */
export async function compareWithBaseline(packageDir = root) {
  const current = renderBlocks(await readPublicApi(packageDir))
  let text
  try {
    text = await readFile(baselinePath, 'utf8')
  } catch (error) {
    if (error.code === 'ENOENT') return `Missing ${relative(root, baselinePath)}.`
    throw error
  }
  const baseline = parseBaseline(text)
  const actual = new Map(current.map(block => [block.heading.replace(/ \(\d+\)$/, ''), block]))
  const report = []
  for (const [key, block] of baseline) {
    const now = actual.get(key)
    if (!now) report.push(`Removed: ${key.replace(/^#+ /, '')}`)
    else if (now.lines.join('\n') !== block.lines.join('\n')) {
      report.push(`Changed: ${key.replace(/^#+ /, '')}`, ...lineDiff(block.lines, now.lines).filter(line => !/^ {2}[-+] ```/.test(line)))
    }
  }
  for (const [key] of actual) if (!baseline.has(key)) report.push(`Added: ${key.replace(/^#+ /, '')}`)
  if (!report.length && renderBaseline(current) !== text.replace(/\r\n/g, '\n')) report.push('The baseline file is not in its generated form.')
  return report.join('\n')
}

export async function updateBaseline(packageDir = root) {
  await writeFile(baselinePath, renderBaseline(renderBlocks(await readPublicApi(packageDir))))
}

/** Throws with the readable report when the API in `packageDir` differs from the baseline. */
export async function checkApiBaseline(packageDir = root) {
  const report = await compareWithBaseline(packageDir)
  if (report) {
    throw new Error(`The public API differs from ${relative(root, baselinePath).split(sep).join('/')} (- baseline, + build):\n${report}\n\n`
      + 'If the change is intended, review it (removals and changes are breaking in 1.x) and run:\n'
      + '  npm run build && node scripts/api-baseline.mjs --update')
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2)
  assert.ok(args.every(arg => arg === '--update'), 'Usage: node scripts/api-baseline.mjs [--update]')
  if (args.includes('--update')) {
    await updateBaseline()
    console.log(`Updated ${relative(root, baselinePath)} from dist/. Review the diff before committing.`)
  } else {
    try {
      await checkApiBaseline()
      console.log(`Public API matches ${relative(root, baselinePath)}.`)
    } catch (error) {
      console.error(error.message)
      process.exitCode = 1
    }
  }
}
