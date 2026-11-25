import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  fromDrawio, fromGraphMl, fromMermaid, fromMsProjectXml, parseCsv, timelineCsvTable, timelineFromCsvTable, toCsv, toDrawio,
  toGraphMl, toMermaid, toMsProjectXml,
} from '@eightkk/vue-weave/core'

const model = cells => `<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>${cells.join('')}</root></mxGraphModel>`
const geometry = '<mxGeometry x="1" y="2" width="10" height="10" as="geometry"/>'

test('fromDrawio reads deeply nested containers in linear time, parents first', () => {
  const depth = 20_000
  const cells = []
  for (let i = 0; i < depth; i++) {
    cells.push(`<mxCell id="g${i}" value="G${i}" vertex="1" parent="${i ? 'g' + (i - 1) : '1'}">${geometry}</mxCell>`)
  }
  cells.push(`<mxCell id="n" value="N" vertex="1" parent="g${depth - 1}">${geometry}</mxCell>`)
  const started = performance.now()
  const imported = fromDrawio(model(cells))
  // Quadratic depth computation took over 30 seconds here; linear work takes well under one.
  assert.ok(performance.now() - started < 10_000, 'nested containers are read in linear time')
  assert.equal(imported.groups.length, depth)
  assert.deepEqual(imported.groups.slice(0, 3).map(group => [group.id, group.parentId]), [['g0', undefined], ['g1', 'g0'], ['g2', 'g1']])
  assert.equal(imported.groups.at(-1).parentId, 'g' + (depth - 2))
  assert.deepEqual(imported.groups.at(-1).nodeIds, ['n'])
  // Each container adds its offset of (1, 2): the node's absolute position is the sum along the chain.
  assert.deepEqual(imported.positions.get('n'), { x: depth + 1, y: 2 * depth + 2 })
})

test('fromDrawio orders containers listed children first by depth', () => {
  const cells = [
    `<mxCell id="c" value="C" vertex="1" parent="b">${geometry}</mxCell>`,
    `<mxCell id="n" value="N" vertex="1" parent="c">${geometry}</mxCell>`,
    `<mxCell id="b" value="B" vertex="1" parent="a">${geometry}</mxCell>`,
    `<mxCell id="a" value="A" vertex="1" parent="1">${geometry}</mxCell>`,
    `<mxCell id="m" value="M" vertex="1" parent="a">${geometry}</mxCell>`,
  ]
  const imported = fromDrawio(model(cells))
  assert.deepEqual(imported.groups.map(group => [group.id, group.parentId]), [['a', undefined], ['b', 'a'], ['c', 'b']])
})

test('fromDrawio reads containers on a parent cycle as top-level groups, never as a group cycle', () => {
  const cells = [
    `<mxCell id="a" value="A" vertex="1" parent="b">${geometry}</mxCell>`,
    `<mxCell id="b" value="B" vertex="1" parent="a">${geometry}</mxCell>`,
    `<mxCell id="c" value="C" vertex="1" parent="a">${geometry}</mxCell>`,
    `<mxCell id="n" value="N" vertex="1" parent="a">${geometry}</mxCell>`,
    `<mxCell id="m" value="M" vertex="1" parent="b">${geometry}</mxCell>`,
    `<mxCell id="k" value="K" vertex="1" parent="c">${geometry}</mxCell>`,
  ]
  const imported = fromDrawio(model(cells))
  // The groups pointed at each other before, which every writer and NetworkGraph rejected.
  assert.deepEqual(imported.groups.map(group => [group.id, group.parentId, group.nodeIds]), [
    ['a', undefined, ['n']], ['b', undefined, ['m']], ['c', 'a', ['k']],
  ])
  assert.deepEqual(fromDrawio(toDrawio(imported)).groups.map(group => [group.id, group.parentId]), [['a', undefined], ['b', undefined], ['c', 'a']])
})

/** A chain of `depth` nested groups, each holding one node. */
function nestedGroups(depth) {
  const nodes = [], groups = []
  for (let i = 0; i < depth; i++) {
    nodes.push({ id: 'n' + i, label: 'N' + i })
    groups.push({ id: 'g' + i, label: 'G' + i, nodeIds: ['n' + i], ...(i ? { parentId: 'g' + (i - 1) } : {}) })
  }
  return { nodes, edges: [{ id: 'e', from: 'n0', to: 'n' + (depth - 1) }], groups }
}

for (const [format, write, read] of [['toGraphMl', toGraphMl, fromGraphMl], ['toMermaid', toMermaid, fromMermaid]]) {
  test(`${format} writes 20,000 nested groups with bounded indentation, and they read back`, () => {
    const depth = 20_000
    const graph = nestedGroups(depth)
    const started = performance.now()
    // Indenting every level made the text grow quadratically; GraphML threw "Invalid string length" here.
    const text = write(graph)
    const imported = read(text)
    assert.ok(performance.now() - started < 10_000, 'deep nesting is written and read in linear time')
    assert.ok(text.length < 20_000_000, 'the text grows linearly with the depth')
    assert.equal(imported.groups.length, depth)
    assert.equal(imported.groups.at(-1).parentId, 'g' + (depth - 2))
    assert.deepEqual(imported.groups.at(-1).nodeIds, ['n' + (depth - 1)])
    assert.deepEqual(imported.edges.map(edge => [edge.from, edge.to]), [['n0', 'n' + (depth - 1)]])
  })
}

test('the graph writers check group hierarchies listed children first in linear time', () => {
  const depth = 20_000
  const graph = nestedGroups(depth)
  const reversed = { ...graph, groups: [...graph.groups].reverse() }
  const started = performance.now()
  const text = toGraphMl(reversed)
  assert.ok(performance.now() - started < 10_000, 'group depths are found in linear time')
  assert.equal(text, toGraphMl(graph))
  const nodes = [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }, { id: 'c', label: 'C' }]
  const cycle = [
    { id: 'x', label: 'X', nodeIds: ['a'], parentId: 'y' },
    { id: 'y', label: 'Y', nodeIds: ['b'], parentId: 'z' },
    { id: 'z', label: 'Z', nodeIds: ['c'], parentId: 'y' },
  ]
  for (const write of [toGraphMl, toMermaid, toDrawio]) {
    assert.throws(() => write({ nodes, edges: [], groups: cycle }), { message: 'Graph group hierarchy contains a cycle at group: x' })
    assert.throws(() => write({ nodes, edges: [], groups: [{ id: 'x', label: 'X', nodeIds: ['a'], parentId: 'x' }] }), {
      message: 'Graph group hierarchy contains a cycle at group: x',
    })
  }
})

test('fromMermaid skips an accDescr block up to the first } after it', () => {
  // A } earlier on the line sent the reader back before the block, which it then skipped again without end.
  const repeated = fromMermaid('flowchart LR\naccDescr {\none\n}; accDescr {\ntwo\n}\na --> b')
  assert.deepEqual(repeated.edges.map(edge => [edge.from, edge.to]), [['a', 'b']])
  assert.deepEqual(repeated.warnings.map(warning => [warning.code, warning.line]), [['unsupported-statement', 2], ['unsupported-statement', 4]])
  const quoted = fromMermaid('flowchart LR\na["x}y"]; accDescr { about } ; a --> b')
  assert.equal(quoted.nodes[0].label, 'x}y')
  assert.equal(quoted.edges.length, 1)
  assert.throws(() => fromMermaid('flowchart LR\na["}"]; accDescr {\nno end'), { message: 'Invalid Mermaid flowchart at line 2, column 9: unterminated accDescr { … }' })
})

test('the graph writers indent the first 32 nesting levels and no deeper', () => {
  const graph = nestedGroups(40)
  const indents = (text, pattern) => text.split('\n').filter(line => pattern.test(line)).map(line => line.length - line.trimStart().length)
  const mermaid = indents(toMermaid(graph), /^\s*subgraph /)
  assert.deepEqual(mermaid.slice(0, 3), [2, 4, 6])
  assert.equal(mermaid[31], 64)
  assert.deepEqual(new Set(mermaid.slice(31)), new Set([64]))
  const graphMl = indents(toGraphMl(graph), /^\s*<node id="g/)
  assert.deepEqual(graphMl.slice(0, 3), [4, 8, 12])
  assert.deepEqual(new Set(graphMl.slice(31)), new Set([128]))
})

test('fromDrawio collects many edge label cells in linear time and counts them against maxItems', () => {
  const labels = 40_000
  const cells = [
    '<mxCell id="a" value="A" vertex="1" parent="1"/>', '<mxCell id="b" value="B" vertex="1" parent="1"/>',
    '<mxCell id="e" edge="1" parent="1" source="a" target="b"/>',
  ]
  for (let i = 0; i < labels; i++) cells.push(`<mxCell id="l${i}" value="${i % 2 ? 'x' : ''}" vertex="1" parent="e"/>`)
  const xml = model(cells)
  const started = performance.now()
  const imported = fromDrawio(xml, { maxItems: labels + 3 })
  assert.ok(performance.now() - started < 10_000, 'label cells are collected in linear time')
  assert.equal(imported.edges[0].label, Array(labels / 2).fill('x').join('\n'))
  // Two nodes, one edge and every label cell, empty or not.
  assert.throws(() => fromDrawio(xml, { maxItems: labels + 2 }), { name: 'RangeError', message: /maxItems/ })
  assert.throws(() => fromDrawio(xml, { maxItems: 1000 }), { name: 'RangeError', message: 'The draw.io file has more than 1000 nodes, edges and groups (maxItems)' })
})

test('toDrawio keeps a node label with line breaks whole, with or without a detail', () => {
  const graph = {
    nodes: [
      { id: 'a', label: 'Two\nlines' },
      { id: 'b', label: 'Two\nlines', detail: 'Detail\nmore' },
      { id: 'c', label: 'Plain', detail: 'Detail' },
      { id: 'd', label: 'Semi;colon=x\n%41' },
    ],
    edges: [],
  }
  const xml = toDrawio(graph)
  assert.match(xml, /vwLabel=Two%0Alines;/)
  assert.doesNotMatch(xml.split('\n').find(line => line.includes('id="c"')), /vwLabel/)
  const imported = fromDrawio(xml)
  assert.deepEqual(imported.nodes, graph.nodes)
  // Text edited in draw.io that no longer starts with the stored label is split as before.
  const edited = xml.replace('value="Two&#10;lines" style', 'value="Changed&#10;text" style')
  assert.deepEqual(fromDrawio(edited).nodes[0], { id: 'a', label: 'Changed', detail: 'text' })
  // Files from other tools, and a broken vwLabel, keep the first-line split.
  const other = model([
    '<mxCell id="x" value="First&#10;Second" style="rounded=0;" vertex="1" parent="1"/>',
    '<mxCell id="y" value="First&#10;Second" style="vwLabel=%E0%A4%A;" vertex="1" parent="1"/>',
  ])
  assert.deepEqual(fromDrawio(other).nodes, [
    { id: 'x', label: 'First', detail: 'Second' }, { id: 'y', label: 'First', detail: 'Second' },
  ])
})

test('toMermaid and toDrawio treat marker names of Object.prototype like other unknown markers', () => {
  const edge = { id: 'e', from: 'a', to: 'b' }
  const graph = markers => ({ nodes: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }], edges: [{ ...edge, ...markers }] })
  // The lookup found inherited functions: Mermaid wrote `a --function toString() { [native code] } b`, draw.io
  // `endArrow=toString;startArrow=Object;`.
  for (const name of ['toString', 'constructor', '__proto__']) {
    assert.equal(toMermaid(graph({ markerEnd: name, markerStart: name })), toMermaid(graph({ markerEnd: 'unknown', markerStart: 'unknown' })))
    assert.equal(toDrawio(graph({ markerEnd: name, markerStart: name })), toDrawio(graph({ markerEnd: 'unknown', markerStart: 'unknown' })))
  }
  assert.match(toMermaid(graph({ markerEnd: 'toString' })), / {2}a --> b\n/)
  assert.match(toDrawio(graph({ markerEnd: 'toString' })), /style="endArrow=classic;endFill=1;startArrow=none;"/)
})

test('toDrawio keeps a multi-line label whole when it holds characters XML does not allow', () => {
  // An unpaired surrogate made encodeURIComponent throw a URIError; a control character made the stored label differ
  // from the written value, so the label was split at its line break.
  const graph = {
    nodes: [{ id: 'a', label: 'One\n\uD800two', detail: 'd' }, { id: 'b', label: 'One\n\u0001two￾' }],
    edges: [],
  }
  assert.deepEqual(fromDrawio(toDrawio(graph)).nodes, [{ id: 'a', label: 'One\ntwo', detail: 'd' }, { id: 'b', label: 'One\ntwo' }])
})

test('draw.io HTML labels and Mermaid text decode only the character references XML allows', () => {
  const html = (value, id) => `<mxCell id="${id}" value="${value}" style="html=1;" vertex="1" parent="1"/>`
  const drawio = fromDrawio(model([
    html('a&amp;#0;b&amp;#x1F;c&amp;#xFFFE;d&amp;#xD800;e', 'bad'),
    html('a&amp;#9;b&amp;#x41;c&amp;#128512;', 'good'),
  ]))
  assert.deepEqual(drawio.nodes.map(node => node.label), ['a&#0;b&#x1F;c&#xFFFE;d&#xD800;e', 'a\tbAc😀'])
  const mermaid = fromMermaid('flowchart LR\n  a["a#0;b#31;c#65534;d#55296;e#1114112;"]\n  b["a#9;b#65;c#128512;"]\n')
  assert.deepEqual(mermaid.nodes.map(node => node.label), ['a#0;b#31;c#65534;d#55296;e#1114112;', 'a\tbAc😀'])
  // The XML reader rejects the same references.
  for (const reference of ['&#0;', '&#x1F;', '&#xFFFE;', '&#xD800;']) {
    assert.throws(() => fromGraphMl(`<graphml><graph><node id="a">${reference}</node></graph></graphml>`), /invalid entity/)
  }
})

test('toMermaid drops control characters and unpaired surrogates that no reader decodes', () => {
  const graph = {
    nodes: [{ id: 'a', label: 'x\u0000y\u0007z￾\uD800w\tv 😀', detail: 'd\u001Fe' }],
    edges: [{ id: 'e', from: 'a', to: 'a', label: 'l\u000Bm' }],
    groups: [{ id: 'g', label: 'g\u0001h', nodeIds: ['a'] }],
  }
  const text = toMermaid(graph)
  assert.doesNotMatch(text, /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])/)
  const imported = fromMermaid(text)
  assert.deepEqual(imported.nodes, [{ id: 'a', label: 'xyzw\tv 😀', detail: 'de' }])
  assert.equal(imported.edges[0].label, 'lm')
  assert.equal(imported.groups[0].label, 'gh')
})

test('the graph XML writers keep carriage returns, tabs and line breaks in labels', () => {
  const graph = { nodes: [{ id: 'a', label: ' A\r\n\t1 ' }], edges: [] }
  assert.equal(fromGraphMl(toGraphMl(graph)).nodes[0].label, ' A\r\n\t1 ')
  assert.equal(fromDrawio(toDrawio(graph)).nodes[0].label, ' A\r\n\t1 ')
})

test('toMsProjectXml keeps carriage returns in project, task, calendar and resource names', () => {
  const name = ' P\r\n1 '
  const plan = {
    name, tasks: [{ id: 'a', name, start: 0, end: 3_600_000, calendarId: 'c' }],
    calendars: [{ id: 'c', name, week: { weekly: [{ weekday: 1, startMinute: 480, endMinute: 960 }] } }],
    resources: [{ id: 'r', name }], assignments: [{ taskId: 'a', resourceId: 'r' }],
  }
  const xml = toMsProjectXml(plan)
  assert.match(xml, /<Name> P&#13;\n1 <\/Name>/)
  const imported = fromMsProjectXml(xml)
  assert.equal(imported.name, name)
  assert.equal(imported.tasks[0].name, name)
  assert.equal(imported.calendars[0].name, name)
  assert.equal(imported.resources[0].name, name)
})

test('fromMsProjectXml reads UIDs with leading zeros as the same items', () => {
  const xml = toMsProjectXml({
    name: 'P', tasks: [{ id: 'a', name: 'A', start: 0, end: 3_600_000 }, { id: 'b', name: 'B', start: 3_600_000, end: 7_200_000 }],
    dependencies: [{ from: 'a', to: 'b' }],
  }).replace(/<UID>(\d+)<\/UID>/g, '<UID>00$1</UID>').replace(/<PredecessorUID>(\d+)/g, '<PredecessorUID>000$1')
  const imported = fromMsProjectXml(xml)
  assert.deepEqual(imported.tasks.map(task => task.id), ['1', '2'])
  assert.deepEqual(imported.dependencies.map(link => [link.from, link.to]), [['1', '2']])
})

test('toCsv escapes formulas in text cells only when asked', () => {
  const table = [['=1+1', '+A1', '-B2', '@SUM(A1)', '\tx', '\rx', 'plain', ' =x', '-2', -2, 3, undefined, '']]
  assert.equal(toCsv(table), '=1+1,+A1,-B2,@SUM(A1),\tx,"\rx",plain, =x,-2,-2,3,,\r\n')
  assert.equal(toCsv(table, {}), toCsv(table))
  assert.equal(toCsv(table, { escapeFormulas: false }), toCsv(table))
  const escaped = toCsv(table, { escapeFormulas: true })
  assert.equal(escaped, '\'=1+1,\'+A1,\'-B2,\'@SUM(A1),\'\tx,"\'\rx",plain, =x,\'-2,-2,3,,\r\n')
  // Quoting still applies after the prefix, so the file parses to the prefixed text.
  assert.deepEqual(parseCsv(toCsv([['=HYPERLINK("http://x","y")']], { escapeFormulas: true })), [['\'=HYPERLINK("http://x","y")']])
  // The timeline table is escaped through toCsv; numbers such as progress stay numbers.
  const rows = [{ id: 'r', label: '=cmd' }]
  const bars = [{ id: 'b', rowId: 'r', label: '@bar', start: 0, end: 1, progress: 0.5 }]
  const csv = toCsv(timelineCsvTable(rows, bars, { formatTime: String }), { escapeFormulas: true })
  assert.equal(csv, 'Row,WBS,Bar,Start,End,Progress\r\n\'=cmd,1,\'@bar,0,1,0.5\r\n')
})

test('timelineFromCsvTable reads deep WBS codes in linear time and rejects codes past 1,000 levels', () => {
  const read = code => timelineFromCsvTable([['WBS', 'Bar', 'Start', 'End'], [code, 'x', '1', '2']], { parseTime: Number })
  const deep = Array(1000).fill('1').join('.')
  const { rows, bars } = read(deep)
  assert.equal(rows.length, 1000)
  assert.equal(rows[0].id, 'row-1')
  assert.equal(rows.at(-1).id, 'row-' + deep)
  assert.equal(rows.at(-1).parentId, 'row-' + deep.slice(0, -2))
  assert.equal(bars[0].rowId, 'row-' + deep)
  const started = performance.now()
  assert.throws(() => read(Array(20_000).fill('1').join('.')), {
    name: 'RangeError', message: 'The WBS code on CSV line 2 has 20000 levels; at most 1000 are supported',
  })
  assert.throws(() => read(deep + '.1'), { name: 'RangeError', message: /1001 levels/ })
  assert.ok(performance.now() - started < 10_000)
})

test('timelineFromCsvTable orders WBS codes as a tree by their numeric parts', () => {
  const table = [['WBS', 'Bar', 'Start', 'End'], ...['10', '2.10', '2.9', '1.1.1', '2', '9'].map(code => [code, code, '1', '2'])]
  const { rows } = timelineFromCsvTable(table, { parseTime: Number })
  assert.deepEqual(rows.map(row => [row.id, row.parentId]), [
    ['row-1', undefined], ['row-1.1', 'row-1'], ['row-1.1.1', 'row-1.1'], ['row-2', undefined], ['row-2.9', 'row-2'],
    ['row-2.10', 'row-2'], ['row-9', undefined], ['row-10', undefined],
  ])
})
