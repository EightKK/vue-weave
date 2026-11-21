import assert from 'node:assert/strict'
import { test } from 'node:test'
import { deflateRawSync } from 'node:zlib'
import {
  fromDrawio, fromDrawioAsync, fromGraphMl, fromMermaid, toDrawio, toGraphMl, toMermaid,
} from 'vue-weave/core'

// A diagram with every feature the three formats share: shapes, tones, details, nested groups, markers and labels.
const diagram = () => ({
  nodes: [
    { id: 'start', label: 'Start', shape: 'ellipse', tone: 'teal' },
    { id: 'check', label: 'In stock?', shape: 'diamond' },
    { id: 'reserve', label: 'Reserve "A" | #1 <now> & `go`', detail: 'Second line\nthird line', shape: 'rounded' },
    { id: 'store', label: 'Inventory', shape: 'hexagon', tone: 'violet' },
    { id: 'done', label: 'Done' },
  ],
  edges: [
    { id: 'e1', from: 'start', to: 'check' },
    { id: 'e2', from: 'check', to: 'reserve', label: 'yes' },
    { id: 'e3', from: 'reserve', to: 'store', markerEnd: 'none' },
    { id: 'e4', from: 'store', to: 'done', markerStart: 'circle', markerEnd: 'circle' },
    { id: 'e5', from: 'check', to: 'done', label: 'no', markerEnd: 'bar' },
  ],
  groups: [
    { id: 'warehouse', label: 'Warehouse', nodeIds: ['reserve'] },
    { id: 'storage', label: 'Storage', nodeIds: ['store'], parentId: 'warehouse' },
  ],
  positions: new Map([
    ['start', { x: 20, y: 40 }], ['check', { x: 220, y: 30 }], ['reserve', { x: 440, y: 40 }],
    ['store', { x: 460, y: 220 }], ['done', { x: 720, y: 40.5 }],
  ]),
  sizes: new Map([['check', { width: 120, height: 80 }], ['store', { width: 150, height: 60 }]]),
})

const byId = items => [...items].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
// The readers leave the default box shape unset, as NetworkGraph does.
const withoutBox = nodes => nodes.map(({ shape, ...node }) => (shape === undefined || shape === 'box' ? node : { ...node, shape }))

test('toMermaid output round-trips through fromMermaid: labels, details, shapes, nested groups, markers and direction', () => {
  const graph = diagram()
  const text = toMermaid(graph, { direction: 'TD' })
  assert.match(text, /^flowchart TD\n/)
  assert.match(text, /start\(\("Start"\)\)/)
  assert.match(text, /check\{"In stock\?"\}/)
  assert.match(text, /store\{\{"Inventory"\}\}/)
  assert.match(text, /subgraph warehouse\["Warehouse"\]\n {4}reserve\("Reserve #34;A#34; #124; #35;1 #60;now#62; #38; #96;go#96;<br>Second line#10;third line"\)\n {4}subgraph storage/)
  assert.match(text, /check -->\|"yes"\| reserve/)
  assert.match(text, /reserve --- store/)
  assert.match(text, /store o--o done/)
  assert.match(text, /check --x\|"no"\| done/)
  const read = fromMermaid(text)
  assert.deepEqual(read.warnings, [])
  assert.equal(read.direction, 'TB')
  assert.deepEqual(byId(read.nodes), byId(graph.nodes.map(({ tone, ...node }) => node)))
  assert.deepEqual(read.groups, graph.groups)
  assert.deepEqual(read.edges.map(({ id, ...edge }) => edge), graph.edges.map(({ id, ...edge }) => edge))
  assert.deepEqual(read.edges.map(edge => edge.id), ['e1', 'e2', 'e3', 'e4', 'e5'])
  assert.equal(read.positions.size, 0)
  assert.equal(read.sizes.size, 0)
  assert.equal(toMermaid(read, { direction: 'TD' }), text)
})

test('toMermaid escapes IDs that Mermaid cannot hold and fromMermaid decodes them', () => {
  const ids = ['a b', 'end', 'x-y', 'vw_raw', '日本', 'a"b|c', 'é', 'plain_1', 'graph', '_']
  const nodes = ids.map(id => ({ id, label: id }))
  const edges = ids.slice(1).map((id, index) => ({ id: 'edge ' + index, from: ids[index], to: id }))
  const groups = [{ id: 'a b', label: 'Same ID as a node', nodeIds: ['plain_1'] }]
  const text = toMermaid({ nodes, edges, groups }, { edgeIds: true })
  for (const line of text.split('\n').slice(1)) {
    assert.doesNotMatch(line.replace(/"[^"]*"/g, ''), /\ba b\b|日|é|\bend\b(?!$)/, line)
  }
  assert.match(text, /vw_a_20_b\["a b"\]/)
  assert.match(text, /\bplain_1\b/)
  assert.match(text, /vw_end\["end"\]/)
  assert.match(text, /subgraph vw_a_20_b_g\["Same ID as a node"\]/)
  assert.match(text, /vw_a_20_b vw_edge_20_0@--> vw_end/)
  const read = fromMermaid(text)
  assert.deepEqual(read.warnings, [])
  assert.deepEqual(byId(read.nodes), byId(nodes))
  assert.deepEqual(read.edges, edges)
  // The group ID cannot be kept next to a node with the same ID; its label and members are.
  assert.deepEqual(read.groups, [{ id: 'vw_a_20_b_g', label: 'Same ID as a node', nodeIds: ['plain_1'] }])
})

test('fromMermaid reads chains, & lists, every link form, labels, comments and @{ } shapes', () => {
  const text = [
    '%%{init: {"theme": "dark"}}%%',
    'graph LR;',
    '  %% a comment line',
    '  A-->B & C --> D;E---F',
    '  A -- text with spaces --> G',
    '  A -. dotted text .-> H',
    '  A == "thick; text" ==> I',
    '  A -.-> J',
    '  A ==> K',
    '  A ----> L',
    '  A <--> M',
    '  A --o N',
    '  A x--x O',
    '  A -->|"a #quot;quote#quot; #35; x"| P',
    '  A --> |spaced| Q',
    '  R[Unquoted text] --> S(Rounded) --> T{Diamond} --> U((Circle)) --> V{{Hex}}',
    '  W@{ shape: diam, label: "Decide" } --> X@{ shape: rect }',
    '  Y["Line one<br>line two<br/>line three"]',
    '  my-node.v2 --> Z',
  ].join('\n')
  const read = fromMermaid(text)
  assert.deepEqual(read.warnings, [])
  assert.equal(read.direction, 'LR')
  const edge = (from, to) => read.edges.find(item => item.from === from && item.to === to)
  assert.deepEqual(read.edges.slice(0, 5).map(({ from, to }) => from + to), ['AB', 'AC', 'BD', 'CD', 'EF'])
  assert.equal(edge('E', 'F').markerEnd, 'none')
  assert.equal(edge('A', 'G').label, 'text with spaces')
  assert.equal(edge('A', 'H').label, 'dotted text')
  assert.equal(edge('A', 'I').label, 'thick; text')
  for (const to of ['J', 'K', 'L']) assert.deepEqual(edge('A', to), { id: edge('A', to).id, from: 'A', to })
  assert.equal(edge('A', 'M').markerStart, 'arrow')
  assert.equal(edge('A', 'M').markerEnd, undefined)
  assert.equal(edge('A', 'N').markerEnd, 'circle')
  assert.deepEqual([edge('A', 'O').markerStart, edge('A', 'O').markerEnd], ['bar', 'bar'])
  assert.equal(edge('A', 'P').label, 'a "quote" # x')
  assert.equal(edge('A', 'Q').label, 'spaced')
  const node = id => read.nodes.find(item => item.id === id)
  assert.deepEqual(node('R'), { id: 'R', label: 'Unquoted text' })
  assert.deepEqual(node('S'), { id: 'S', label: 'Rounded', shape: 'rounded' })
  assert.equal(node('T').shape, 'diamond')
  assert.equal(node('U').shape, 'ellipse')
  assert.equal(node('V').shape, 'hexagon')
  assert.deepEqual(node('W'), { id: 'W', label: 'Decide', shape: 'diamond' })
  assert.deepEqual(node('X'), { id: 'X', label: 'X' })
  assert.deepEqual(node('Y'), { id: 'Y', label: 'Line one', detail: 'line two\nline three' })
  assert.ok(node('my-node.v2'))
  assert.equal(new Set(read.edges.map(item => item.id)).size, read.edges.length)
})

test('fromMermaid turns nested subgraphs into groups and reports what it ignores', () => {
  const text = [
    '---',
    'title: Demo',
    '---',
    'flowchart TB',
    '  subgraph outer [Outer box]',
    '    direction LR',
    '    A --> B',
    '    subgraph inner',
    '      B --> C:::hot',
    '    end',
    '    subgraph "Quoted title"',
    '      D',
    '    end',
    '  end',
    '  subgraph other[Other]',
    '    A --> E',
    '  end',
    '  subgraph empty[Nothing]',
    '  end',
    '  F --> outer',
    '  F ~~~ A',
    '  classDef hot fill:#f96',
    '  class A hot',
    '  style A fill:#f00',
    '  click A callback',
    '  linkStyle 0 stroke:#f00',
    '  accTitle: A title',
    '  accDescr {',
    '    A long',
    '    description',
    '  }',
  ].join('\n')
  const read = fromMermaid(text)
  assert.deepEqual(read.groups, [
    { id: 'outer', label: 'Outer box', nodeIds: ['A'] },
    { id: 'inner', label: 'inner', parentId: 'outer', nodeIds: ['B', 'C'] },
    { id: 'subGraph2', label: 'Quoted title', parentId: 'outer', nodeIds: ['D'] },
    { id: 'other', label: 'Other', nodeIds: ['E'] },
  ])
  assert.deepEqual(read.nodes.map(node => node.id), ['A', 'B', 'C', 'D', 'E', 'F'])
  assert.deepEqual(read.edges.map(({ from, to }) => from + to), ['AB', 'BC', 'AE'])
  assert.deepEqual(read.warnings.map(({ code, id, line }) => [code, id, line]), [
    ['unsupported-statement', undefined, 1],
    ['unsupported-statement', 'outer', 6],
    ['unsupported-statement', 'C', 9],
    ['group-member', 'A', 16],
    ['unsupported-statement', undefined, 21],
    ['unsupported-statement', undefined, 22],
    ['unsupported-statement', undefined, 23],
    ['unsupported-statement', undefined, 24],
    ['unsupported-statement', undefined, 25],
    ['unsupported-statement', undefined, 26],
    ['unsupported-statement', undefined, 27],
    ['unsupported-statement', undefined, 28],
    ['skipped-edge', undefined, 20],
    ['skipped-group', 'empty', undefined],
  ])
  assert.match(read.warnings.find(warning => warning.code === 'skipped-edge').message, /group outer/)
})

test('fromMermaid reports shapes NetworkGraph does not draw and keeps them as boxes', () => {
  const read = fromMermaid('flowchart\n  A([Stadium]) --> B[(Database)] --> C[[Sub]] --> D>Flag] --> E[/Lean/] --> F[\\Trap/] --> G(((Double)))\n  H@{ shape: cyl, label: x }')
  assert.deepEqual(read.nodes.map(node => node.shape), [undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined])
  assert.deepEqual(read.nodes.map(node => node.label), ['Stadium', 'Database', 'Sub', 'Flag', 'Lean', 'Trap', 'Double', 'x'])
  assert.deepEqual(read.warnings.map(warning => warning.code + ' ' + warning.id), 'ABCDEFGH'.split('').map(id => 'unsupported-shape ' + id))
  assert.match(read.warnings[1].message, /cylinder/)
})

test('fromMermaid rejects other diagram types, missing headers and malformed text', () => {
  assert.throws(() => fromMermaid('sequenceDiagram\n  A->>B: hi'), { message: /Unsupported Mermaid diagram type: sequenceDiagram/ })
  assert.throws(() => fromMermaid('%% only a comment\nclassDiagram\n  A <|-- B'), { message: /Unsupported Mermaid diagram type: classDiagram/ })
  assert.throws(() => fromMermaid('A --> B'), { message: /Not a Mermaid flowchart/ })
  assert.throws(() => fromMermaid(''), { message: /no diagram/ })
  assert.throws(() => fromMermaid(42), { message: /must be a string/ })
  assert.throws(() => fromMermaid('flowchart XY\nA'), { message: /line 1.*unknown direction XY/ })
  assert.throws(() => fromMermaid('flowchart LR\n  A -->'), { message: 'Invalid Mermaid flowchart at line 2, column 8: expected a node ID' })
  assert.throws(() => fromMermaid('flowchart LR\n  A["open --> B'), { message: /line 2.*unterminated quoted text/ })
  assert.throws(() => fromMermaid('flowchart LR\n  A[open --> B'), { message: /line 2.*expected \]/ })
  assert.throws(() => fromMermaid('flowchart LR\n  A -- text B'), { message: /line 2.*unterminated link text/ })
  assert.throws(() => fromMermaid('flowchart LR\n  A B'), { message: /line 2.*expected a link/ })
  assert.throws(() => fromMermaid('flowchart LR\n  end'), { message: /line 2.*end without a subgraph/ })
  assert.throws(() => fromMermaid('flowchart LR\n  subgraph one\n    A'), { message: /subgraph one has no end/ })
  assert.throws(() => fromMermaid('---\ntitle: x\nflowchart LR'), { message: /line 1.*unterminated front matter/ })
})

test('the graph readers enforce maxItems', () => {
  assert.throws(() => fromMermaid('flowchart\n  A --> B --> C', { maxItems: 4 }), RangeError)
  assert.equal(fromMermaid('flowchart\n  A --> B --> C', { maxItems: 5 }).edges.length, 2)
  assert.throws(() => fromMermaid('flowchart\n  A', { maxItems: 0 }), { name: 'RangeError', message: /maxItems/ })
  const graphMl = toGraphMl(diagram())
  assert.throws(() => fromGraphMl(graphMl, { maxItems: 9 }), { name: 'RangeError', message: /more than 9 nodes, edges and groups/ })
  assert.equal(fromGraphMl(graphMl, { maxItems: 12 }).nodes.length, 5)
  assert.throws(() => fromDrawio(toDrawio(diagram()), { maxItems: 3 }), RangeError)
})

test('toGraphMl output round-trips through fromGraphMl exactly, including positions, sizes and waypoints', () => {
  const graph = diagram()
  graph.edges[0] = { ...graph.edges[0], edgeStyle: 'orthogonal', animated: true, points: [{ x: 180, y: 70.25 }, { x: 200, y: 70.25 }] }
  graph.nodes[4] = { ...graph.nodes[4], shape: 'box' }
  const xml = toGraphMl(graph)
  assert.match(xml, /<graph id="G" edgedefault="directed">/)
  assert.match(xml, /<key id="x" for="node" attr.name="x" attr.type="double"\/>/)
  assert.match(xml, /<node id="warehouse"><data key="label">Warehouse<\/data>\n {6}<graph id="warehouse:" edgedefault="directed">/)
  assert.match(xml, /<data key="label">Reserve &quot;A&quot; \| #1 &lt;now&gt; &amp; `go`<\/data>/)
  const read = fromGraphMl(xml)
  assert.deepEqual(read.warnings, [])
  assert.deepEqual(byId(read.nodes), byId(graph.nodes))
  assert.deepEqual(read.edges, graph.edges)
  assert.deepEqual(read.groups, graph.groups)
  assert.deepEqual(read.positions, graph.positions)
  assert.deepEqual(read.sizes, graph.sizes)
  assert.equal(read.direction, undefined)
  assert.equal(toGraphMl(read), xml)
})

test('toGraphMl renames a group whose ID is a node ID and writes undirected graphs; fromGraphMl reads them', () => {
  const graph = { nodes: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }], edges: [{ id: 'ab', from: 'a', to: 'b' }], groups: [{ id: 'a', label: 'Group', nodeIds: ['b'] }] }
  const xml = toGraphMl(graph, { directed: false })
  assert.match(xml, /edgedefault="undirected"/)
  assert.match(xml, /<node id="a-2">/)
  const read = fromGraphMl(xml)
  assert.deepEqual(read.groups, [{ id: 'a-2', label: 'Group', nodeIds: ['b'] }])
  assert.deepEqual(read.edges, [{ id: 'ab', from: 'a', to: 'b', markerEnd: 'none' }])
})

test('fromGraphMl reads plain GraphML: missing edge IDs, key defaults, name labels, directed overrides and nested graphs', () => {
  const xml = `<?xml version="1.0"?>
<graphml xmlns="http://graphml.graphdrawing.org/xmlns">
  <key id="k0" for="node" attr.name="name" attr.type="string"/>
  <key id="k1" for="all" attr.name="shape" attr.type="string"><default>ellipse</default></key>
  <key id="k2" for="edge" attr.name="weight" attr.type="double"/>
  <graph id="G" edgedefault="undirected">
    <desc>ignored</desc>
    <node id="n0"><data key="k0">Zero</data></node>
    <node id="n1"><data key="k1">rectangle</data></node>
    <node id="g"><data key="k0">Group</data>
      <graph id="g:"><node id="n2"/><node id="n3"><port name="p"/></node></graph>
    </node>
    <edge source="n0" target="n1"><data key="k2">2</data></edge>
    <edge id="e1" source="n1" target="n2" directed="true"/>
    <edge source="n2" target="n3"/>
    <edge source="n3" target="g"/>
    <edge source="n3" target="missing"/>
    <edge id="e1" source="n0" target="n2"/>
    <hyperedge><endpoint node="n0"/><endpoint node="n1"/></hyperedge>
  </graph>
  <graph id="second"/>
</graphml>`
  const read = fromGraphMl(xml)
  assert.deepEqual(read.nodes, [
    { id: 'n0', label: 'Zero', shape: 'ellipse' },
    { id: 'n1', label: 'n1', shape: 'box' },
    { id: 'n2', label: 'n2', shape: 'ellipse' },
    { id: 'n3', label: 'n3', shape: 'ellipse' },
  ])
  assert.deepEqual(read.groups, [{ id: 'g', label: 'Group', nodeIds: ['n2', 'n3'] }])
  assert.deepEqual(read.edges, [
    { id: 'e2', from: 'n0', to: 'n1', markerEnd: 'none' },
    { id: 'e1', from: 'n1', to: 'n2' },
    { id: 'e3', from: 'n2', to: 'n3', markerEnd: 'none' },
  ])
  assert.deepEqual(read.warnings.map(warning => warning.code), [
    'unsupported-element', 'unsupported-element', 'unsupported-element', 'skipped-edge', 'skipped-edge', 'skipped-edge',
  ])
  assert.match(read.warnings[0].message, /first of 2 graphs/)
  assert.match(read.warnings[1].message, /ports of node n3/)
  assert.match(read.warnings[2].message, /hyperedge/)
  assert.match(read.warnings[3].message, /group g/)
  assert.match(read.warnings[4].message, /missing/)
  assert.match(read.warnings[5].message, /e1 is used before/)
})

test('fromGraphMl reads yEd files: labels, geometry, shapes, groups, arrows, edge labels and bends', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<graphml xmlns="http://graphml.graphdrawing.org/xmlns" xmlns:java="http://www.yworks.com/xml/yfiles-common/1.0/java" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:y="http://www.yworks.com/xml/graphml" xmlns:yed="http://www.yworks.com/xml/yed/3" xsi:schemaLocation="http://graphml.graphdrawing.org/xmlns http://www.yworks.com/xml/schema/graphml/1.1/ygraphml.xsd">
  <!--Created by yEd 3.23-->
  <key attr.name="Description" attr.type="string" for="graph" id="d0"/>
  <key for="port" id="d1" yfiles.type="portgraphics"/>
  <key attr.name="url" attr.type="string" for="node" id="d4"/>
  <key attr.name="description" attr.type="string" for="node" id="d5"/>
  <key for="node" id="d6" yfiles.type="nodegraphics"/>
  <key for="graphml" id="d7" yfiles.type="resources"/>
  <key for="edge" id="d10" yfiles.type="edgegraphics"/>
  <graph edgedefault="directed" id="G">
    <data key="d0" xml:space="preserve"/>
    <node id="n0">
      <data key="d5"><![CDATA[A description]]></data>
      <data key="d6">
        <y:ShapeNode>
          <y:Geometry height="30.0" width="80.0" x="-15.0" y="10.0"/>
          <y:Fill color="#FFCC00" transparent="false"/>
          <y:BorderStyle color="#000000" raised="false" type="line" width="1.0"/>
          <y:NodeLabel alignment="center" autoSizePolicy="content" fontFamily="Dialog" fontSize="12" visible="true">Start<y:LabelModel><y:SmartNodeLabelModel distance="4.0"/></y:LabelModel></y:NodeLabel>
          <y:Shape type="ellipse"/>
        </y:ShapeNode>
      </data>
    </node>
    <node id="n1" yfiles.foldertype="group">
      <data key="d6">
        <y:ProxyAutoBoundsNode>
          <y:Realizers active="0">
            <y:GroupNode>
              <y:Geometry height="200.0" width="300.0" x="80.0" y="60.0"/>
              <y:NodeLabel alignment="right" modelName="internal" modelPosition="t">Checks</y:NodeLabel>
              <y:Shape type="roundrectangle"/>
              <y:State closed="false" closedHeight="50.0" closedWidth="50.0" innerGraphDisplayEnabled="false"/>
            </y:GroupNode>
            <y:GroupNode>
              <y:Geometry height="50.0" width="50.0" x="0.0" y="60.0"/>
              <y:NodeLabel>Folder 1</y:NodeLabel>
            </y:GroupNode>
          </y:Realizers>
        </y:ProxyAutoBoundsNode>
      </data>
      <graph edgedefault="directed" id="n1:">
        <node id="n1::n0">
          <data key="d6">
            <y:GenericNode configuration="com.yworks.flowchart.decision">
              <y:Geometry height="40.0" width="60.0" x="100.0" y="100.0"/>
              <y:NodeLabel>Ok?
second line</y:NodeLabel>
            </y:GenericNode>
          </data>
        </node>
        <node id="n1::n1">
          <data key="d6"><y:ShapeNode><y:Geometry height="30.0" width="30.0" x="200.0" y="100.0"/><y:NodeLabel/><y:Shape type="octagon"/></y:ShapeNode></data>
        </node>
      </graph>
    </node>
    <edge id="e0" source="n0" target="n1::n0">
      <data key="d10">
        <y:PolyLineEdge>
          <y:Path sx="0.0" sy="0.0" tx="0.0" ty="0.0"><y:Point x="50.0" y="25.0"/><y:Point x="50.0" y="120.0"/></y:Path>
          <y:LineStyle color="#000000" type="line" width="1.0"/>
          <y:Arrows source="none" target="standard"/>
          <y:EdgeLabel alignment="center" distance="2.0">go</y:EdgeLabel>
          <y:BendStyle smoothed="false"/>
        </y:PolyLineEdge>
      </data>
    </edge>
    <edge id="e1" source="n1::n0" target="n1::n1">
      <data key="d10"><y:PolyLineEdge><y:Arrows source="white_diamond" target="crows_foot_many"/></y:PolyLineEdge></data>
    </edge>
  </graph>
  <data key="d7"><y:Resources/></data>
</graphml>`
  const read = fromGraphMl(xml)
  assert.deepEqual(read.nodes, [
    { id: 'n0', label: 'Start', shape: 'ellipse' },
    { id: 'n1::n0', label: 'Ok?', detail: 'second line', shape: 'diamond' },
    { id: 'n1::n1', label: 'n1::n1' },
  ])
  assert.deepEqual(read.groups, [{ id: 'n1', label: 'Checks', nodeIds: ['n1::n0', 'n1::n1'] }])
  // x = -15 is below 0, so every coordinate moves right by 15.
  assert.deepEqual(read.positions, new Map([['n0', { x: 0, y: 10 }], ['n1::n0', { x: 115, y: 100 }], ['n1::n1', { x: 215, y: 100 }]]))
  assert.deepEqual(read.sizes, new Map([['n0', { width: 80, height: 30 }], ['n1::n0', { width: 60, height: 40 }], ['n1::n1', { width: 30, height: 30 }]]))
  assert.deepEqual(read.edges, [
    { id: 'e0', from: 'n0', to: 'n1::n0', label: 'go', points: [{ x: 65, y: 25 }, { x: 65, y: 120 }] },
    { id: 'e1', from: 'n1::n0', to: 'n1::n1', markerStart: 'diamond' },
  ])
  assert.deepEqual(read.warnings.map(warning => warning.code), ['unsupported-shape', 'unsupported-style', 'shifted-positions'])
  assert.match(read.warnings[0].message, /octagon/)
  assert.match(read.warnings[1].message, /crows_foot_many/)
  assert.match(read.warnings[2].message, /\(15, 0\)/)
})

test('fromGraphMl reports unreadable values and never expands declared entities', () => {
  const values = fromGraphMl(`<graphml><key id="x" for="node" attr.name="x"/><key id="y" for="node" attr.name="y"/>
    <key id="w" for="node" attr.name="width"/><key id="h" for="node" attr.name="height"/><key id="t" for="node" attr.name="tone"/>
    <key id="p" for="edge" attr.name="points"/><key id="s" for="edge" attr.name="edgeStyle"/>
    <graph><node id="a"><data key="x">1e3</data><data key="y">abc</data><data key="w">-4</data><data key="h">5</data><data key="t">pink</data></node>
    <node id="b"/><edge source="a" target="b"><data key="p">1,2 3</data><data key="s">zigzag</data></edge></graph></graphml>`)
  assert.equal(values.positions.size, 0)
  assert.equal(values.sizes.size, 0)
  assert.deepEqual(values.nodes, [{ id: 'a', label: 'a' }, { id: 'b', label: 'b' }])
  assert.deepEqual(values.edges, [{ id: 'e1', from: 'a', to: 'b' }])
  assert.deepEqual(values.warnings.map(warning => warning.code), Array(5).fill('invalid-value'))

  const entity = `<?xml version="1.0"?>
<!DOCTYPE graphml [<!ENTITY lol "lol"><!ENTITY lol2 "&lol;&lol;&lol;&lol;"><!ENTITY ext SYSTEM "file:///etc/passwd">]>
<graphml><graph><node id="n"><data key="label">&lol2;</data></node></graph></graphml>`
  assert.throws(() => fromGraphMl(entity), { message: /Invalid XML at line 3, column \d+: unknown or invalid entity &lol2;/ })
  assert.throws(() => fromGraphMl(entity.replace('&lol2;', '&ext;')), { message: /unknown or invalid entity &ext;/ })
  assert.deepEqual(fromGraphMl(entity.replace('&lol2;', '&amp;&#x41;')).nodes, [{ id: 'n', label: 'n' }])
  assert.throws(() => fromGraphMl('<graphml><graph><node id="a"></graph></graphml>'), { message: /Invalid XML at line 1/ })
  assert.throws(() => fromGraphMl('<Project/>'), { message: 'Not a GraphML document: the root element is Project' })
  assert.throws(() => fromGraphMl('<graphml/>'), { message: 'The GraphML document has no graph' })
  assert.throws(() => fromGraphMl(null), { message: /must be a string/ })
})

test('toDrawio output round-trips through fromDrawio: geometry, container groups, styles, markers and waypoints', () => {
  const graph = diagram()
  graph.edges[0] = { ...graph.edges[0], edgeStyle: 'orthogonal', animated: true, points: [{ x: 180, y: 70 }] }
  graph.edges[1] = { ...graph.edges[1], edgeStyle: 'curve', markerEnd: 'open-arrow', markerStart: 'diamond' }
  graph.edges[2] = { ...graph.edges[2], edgeStyle: 'straight' }
  const xml = toDrawio(graph, { pageName: 'Order & flow' })
  assert.match(xml, /^<mxfile host="vue-weave">\n {2}<diagram id="vw-page-1" name="Order &amp; flow">/)
  assert.match(xml, /<mxCell id="warehouse" value="Warehouse" style="[^"]*container=1;[^"]*" vertex="1" parent="1"><mxGeometry x="420" y="-10" width="230" height="330" as="geometry"\/>/)
  assert.match(xml, /<mxCell id="storage" value="Storage" [^>]* parent="warehouse"><mxGeometry x="20" y="180" width="190" height="130"/)
  assert.match(xml, /<mxCell id="store" value="Inventory" style="shape=hexagon;[^"]*vwTone=violet;" vertex="1" parent="storage"><mxGeometry x="20" y="50" width="150" height="60"/)
  assert.match(xml, /value="Reserve &quot;A&quot; \| #1 &lt;now&gt; &amp; `go`&#10;Second line&#10;third line"/)
  assert.match(xml, /<mxCell id="e1" value="" style="endArrow=classic;endFill=1;startArrow=none;edgeStyle=orthogonalEdgeStyle;flowAnimation=1;" edge="1" parent="1" source="start" target="check"><mxGeometry relative="1" as="geometry"><Array as="points"><mxPoint x="180" y="70"\/><\/Array>/)
  const read = fromDrawio(xml)
  assert.deepEqual(read.warnings, [])
  assert.deepEqual(byId(read.nodes), byId(withoutBox(graph.nodes)))
  assert.deepEqual(read.edges, graph.edges)
  assert.deepEqual(read.groups, graph.groups)
  assert.deepEqual(read.positions, graph.positions)
  // draw.io gives every vertex a size; nodes without one get the NetworkGraph default.
  assert.deepEqual(read.sizes, new Map(graph.nodes.map(node => [node.id, graph.sizes.get(node.id) ?? { width: 144, height: 58 }])))
  assert.equal(toDrawio(read, { pageName: 'Order & flow' }), xml)
})

test('toDrawio places nodes without positions, keeps cell IDs unique and draws unknown shapes as rectangles', () => {
  const graph = {
    nodes: [{ id: '0', label: 'Zero' }, { id: '1', label: 'One', shape: 'cylinder' }, { id: 'x', label: 'X' }],
    edges: [{ id: 'x', from: '0', to: '1' }, { id: 'e', from: '1', to: 'x' }],
  }
  const xml = toDrawio(graph)
  assert.match(xml, /<mxCell id="0-2"\/>/)
  assert.match(xml, /<mxCell id="1-2" parent="0-2"\/>/)
  assert.match(xml, /<mxCell id="1" value="One" style="rounded=0;"/)
  assert.match(xml, /<mxCell id="x-2" value="" [^>]*source="0" target="1">/)
  const read = fromDrawio(xml)
  assert.deepEqual(read.warnings, [])
  assert.deepEqual(read.nodes, [{ id: '0', label: 'Zero' }, { id: '1', label: 'One' }, { id: 'x', label: 'X' }])
  assert.deepEqual(read.edges.map(edge => edge.id), ['x-2', 'e'])
  // The layered layout places the chain from left to right.
  const [a, b, c] = ['0', '1', 'x'].map(id => read.positions.get(id))
  assert.ok(a.x < b.x && b.x < c.x)
})

const realWorldModel = `<mxGraphModel dx="1000" dy="600" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="827" pageHeight="1169" math="0" shadow="0">
      <root>
        <mxCell id="0" />
        <mxCell id="1" parent="0" />
        <mxCell id="lane" value="Lane" style="swimlane;whiteSpace=wrap;html=1;" vertex="1" parent="1">
          <mxGeometry x="100" y="100" width="300" height="200" as="geometry" />
        </mxCell>
        <mxCell id="n1" value="&lt;b&gt;Check&lt;/b&gt;&lt;br&gt;stock &amp;amp; price&amp;nbsp;&amp;#x2713;" style="rhombus;whiteSpace=wrap;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;" vertex="1" parent="lane">
          <mxGeometry x="20" y="40" width="80" height="80" as="geometry" />
        </mxCell>
        <UserObject label="Order" link="https://example.com" id="n2">
          <mxCell style="rounded=1;whiteSpace=wrap;html=1;" vertex="1" parent="1">
            <mxGeometry x="500" y="140" width="120" height="60" as="geometry" />
          </mxCell>
        </UserObject>
        <mxCell id="n3" value="DB" style="shape=cylinder3;whiteSpace=wrap;html=1;boundedLbl=1;" vertex="1" parent="1">
          <mxGeometry x="700" y="140" width="60" height="80" as="geometry" />
        </mxCell>
        <mxCell id="n4" value="Decide" style="shape=mxgraph.flowchart.decision;html=1;" vertex="1" parent="1">
          <mxGeometry x="700" y="300" width="60" height="60" as="geometry" />
        </mxCell>
        <mxCell id="e1" style="edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;endArrow=open;" edge="1" parent="1" source="n1" target="n2">
          <mxGeometry relative="1" as="geometry"><Array as="points"><mxPoint x="300" y="170" /></Array></mxGeometry>
        </mxCell>
        <mxCell id="e1-label" value="yes" style="edgeLabel;html=1;align=center;" vertex="1" connectable="0" parent="e1">
          <mxGeometry x="-0.2" relative="1" as="geometry"><mxPoint as="offset" /></mxGeometry>
        </mxCell>
        <mxCell id="e2" value="" style="endArrow=none;html=1;" edge="1" parent="1" source="n2">
          <mxGeometry relative="1" as="geometry"><mxPoint x="800" y="300" as="targetPoint" /></mxGeometry>
        </mxCell>
        <mxCell id="e3" value="to lane" style="html=1;" edge="1" parent="1" source="n3" target="lane"><mxGeometry relative="1" as="geometry" /></mxCell>
      </root>
    </mxGraphModel>`

const realWorldFile = (second = '<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="only" value="Only" vertex="1" parent="1"><mxGeometry width="40" height="40" as="geometry"/></mxCell></root></mxGraphModel>') => `<mxfile host="app.diagrams.net" agent="Mozilla/5.0" version="24.7.17">
  <diagram id="abc" name="Overview">
    ${realWorldModel}
  </diagram>
  <diagram id="def" name="Second">${second}</diagram>
</mxfile>`

test('fromDrawio reads draw.io files: HTML labels, containers, UserObjects, edge label cells and fill colour tones', () => {
  const read = fromDrawio(realWorldFile())
  assert.deepEqual(read.nodes, [
    { id: 'n1', label: 'Check', detail: 'stock & price ✓', shape: 'diamond', tone: 'blue' },
    { id: 'n2', label: 'Order', shape: 'rounded' },
    { id: 'n3', label: 'DB' },
    { id: 'n4', label: 'Decide', shape: 'diamond' },
  ])
  assert.deepEqual(read.groups, [{ id: 'lane', label: 'Lane', nodeIds: ['n1'] }])
  assert.deepEqual(read.positions.get('n1'), { x: 120, y: 140 })
  assert.deepEqual(read.positions.get('n2'), { x: 500, y: 140 })
  assert.deepEqual(read.sizes.get('n3'), { width: 60, height: 80 })
  assert.deepEqual(read.edges, [
    { id: 'e1', from: 'n1', to: 'n2', label: 'yes', markerEnd: 'open-arrow', edgeStyle: 'orthogonal', points: [{ x: 300, y: 170 }] },
  ])
  assert.deepEqual(read.warnings.map(warning => [warning.code, warning.id]), [
    ['unsupported-shape', 'n3'], ['skipped-edge', 'e2'], ['skipped-edge', 'e3'],
  ])
  // A page by name or index; a bare mxGraphModel is a one-page document.
  assert.deepEqual(fromDrawio(realWorldFile(), { page: 'Second' }).nodes, [{ id: 'only', label: 'Only' }])
  assert.deepEqual(fromDrawio(realWorldFile(), { page: 1 }).positions, new Map([['only', { x: 0, y: 0 }]]))
  assert.equal(fromDrawio(realWorldModel).nodes.length, 4)
  assert.throws(() => fromDrawio(realWorldFile(), { page: 'Third' }), { message: 'No draw.io page named Third' })
  assert.throws(() => fromDrawio(realWorldFile(), { page: 2 }), { message: 'No draw.io page 2: the file has 2' })
  assert.throws(() => fromDrawio(realWorldFile(), { page: -1 }), RangeError)
  assert.throws(() => fromDrawio(realWorldModel, { page: 1 }), { message: /one page/ })
})

const compress = xml => deflateRawSync(Buffer.from(encodeURIComponent(xml), 'utf8')).toString('base64')

test('fromDrawioAsync inflates compressed pages; fromDrawio explains that it cannot', async () => {
  const model = toDrawio(diagram()).match(/<mxGraphModel[\s\S]*<\/mxGraphModel>/)[0]
  const file = `<mxfile host="app.diagrams.net"><diagram id="a" name="Plan">${compress(model)}</diagram>`
    + `<diagram id="b" name="Real">\n${compress(realWorldModel).replace(/.{60}/g, '$&\n')}\n</diagram></mxfile>`
  assert.throws(() => fromDrawio(file), { message: 'The draw.io page Plan is compressed; read it with fromDrawioAsync or save the file uncompressed' })
  const read = await fromDrawioAsync(file)
  assert.deepEqual(read, fromDrawio(toDrawio(diagram())))
  const real = await fromDrawioAsync(file, { page: 'Real' })
  assert.deepEqual(real, fromDrawio(realWorldModel))
  // Uncompressed pages work too.
  assert.deepEqual(await fromDrawioAsync(realWorldFile(), { page: 1 }), fromDrawio(realWorldFile(), { page: 1 }))
})

test('fromDrawioAsync bounds the inflated size and rejects broken compressed pages', async () => {
  // A highly compressible page: about 3 MB of URI-encoded text in a few kilobytes.
  const big = '<mxGraphModel><root><mxCell id="0"/>' + '<mxCell id="1" parent="0"/>'.repeat(1) + '<!--' + ' '.repeat(1_000_000) + '--></root></mxGraphModel>'
  const bomb = `<mxfile><diagram name="Bomb">${compress(big)}</diagram></mxfile>`
  assert.ok(bomb.length < 10_000)
  await assert.rejects(fromDrawioAsync(bomb, { maxInflatedLength: 100_000 }), { name: 'RangeError', message: /more than 100000 characters/ })
  assert.equal((await fromDrawioAsync(bomb)).nodes.length, 0)
  await assert.rejects(fromDrawioAsync(bomb, { maxInflatedLength: 0 }), RangeError)
  await assert.rejects(fromDrawioAsync('<mxfile><diagram name="x">%%%not base64</diagram></mxfile>'), { message: /not valid base64/ })
  await assert.rejects(fromDrawioAsync('<mxfile><diagram name="x">aGVsbG8gd29ybGQ=</diagram></mxfile>'), { message: /cannot be inflated/ })
  await assert.rejects(fromDrawioAsync(`<mxfile><diagram name="x">${deflateRawSync(Buffer.from('%E0%A4%A')).toString('base64')}</diagram></mxfile>`), { message: /not URI-encoded/ })
  await assert.rejects(fromDrawioAsync(`<mxfile><diagram name="x">${compress('<svg/>')}</diagram></mxfile>`), { message: /not an mxGraphModel: svg/ })
  await assert.rejects(fromDrawioAsync(`<mxfile><diagram name="x">${compress('<mxGraphModel><root><mxCell id="&x;"/></root></mxGraphModel>')}</diagram></mxfile>`), { message: /unknown or invalid entity &x;/ })
})

test('fromDrawio rejects malformed documents', () => {
  assert.throws(() => fromDrawio('<graphml/>'), { message: 'Not a draw.io document: the root element is graphml' })
  assert.throws(() => fromDrawio('<mxfile/>'), { message: 'The draw.io file has no pages' })
  assert.throws(() => fromDrawio('<mxfile><diagram name="Empty"> </diagram></mxfile>'), { message: 'The draw.io page Empty is empty' })
  assert.throws(() => fromDrawio('<mxGraphModel/>'), { message: 'The draw.io model has no root element' })
  assert.throws(() => fromDrawio('<mxfile><diagram>'), { message: /Invalid XML/ })
  assert.throws(() => fromDrawio('<!DOCTYPE x [<!ENTITY a "b">]><mxGraphModel><root><mxCell id="&a;"/></root></mxGraphModel>'), { message: /unknown or invalid entity &a;/ })
  const duplicate = fromDrawio('<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="a" vertex="1" parent="1"/><mxCell id="a" vertex="1" parent="1"/><mxCell vertex="1" parent="1"/><mxCell id="odd" parent="1"/><foo/></root></mxGraphModel>')
  assert.deepEqual(duplicate.nodes, [{ id: 'a', label: '' }])
  assert.deepEqual(duplicate.warnings.map(warning => warning.code), ['skipped-node', 'skipped-node', 'unsupported-element', 'unsupported-element'])
})

test('the graph writers check their input like NetworkGraph', () => {
  const nodes = [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }]
  for (const write of [toMermaid, toGraphMl, toDrawio]) {
    assert.throws(() => write({ nodes: [...nodes, { id: 'a', label: 'again' }], edges: [] }), { message: 'Duplicate graph node ID: a' })
    assert.throws(() => write({ nodes, edges: [{ id: 'e', from: 'a', to: 'c' }] }), { message: 'Unknown node in graph edge e: c' })
    assert.throws(() => write({ nodes, edges: [], groups: [{ id: 'g', label: 'G', nodeIds: ['c'] }] }), { message: 'Unknown node in graph group g: c' })
    assert.throws(() => write({ nodes, edges: [], groups: [{ id: 'g', label: 'G', nodeIds: ['a'], parentId: 'h' }, { id: 'h', label: 'H', nodeIds: ['b'], parentId: 'g' }] }), { message: /cycle at group: g/ })
    assert.throws(() => write({ nodes, edges: [], groups: [{ id: 'g', label: 'G', nodeIds: ['a'], parentId: 'x' }] }), { message: 'Unknown parent group in graph group g: x' })
    assert.throws(() => write({ nodes: [{ id: 'a', label: 1 }], edges: [] }), { message: 'Invalid label of graph node: a' })
    assert.throws(() => write({ nodes, edges: [], positions: new Map([['a', { x: NaN, y: 0 }]]) }), RangeError)
    assert.throws(() => write({ nodes, edges: [], sizes: new Map([['a', { width: 0, height: 10 }]]) }), RangeError)
    assert.throws(() => write({ nodes, edges: [{ id: 'e', from: 'a', to: 'b', points: [{ x: 1, y: Infinity }] }] }), RangeError)
    assert.throws(() => write(null), { message: /needs a graph object/ })
  }
  assert.throws(() => toMermaid({ nodes, edges: [] }, { direction: 'UP' }), { message: 'Invalid Mermaid direction: UP' })
  // Writers never change their input.
  const graph = diagram()
  const copy = structuredClone(graph)
  toMermaid(graph)
  toGraphMl(graph)
  toDrawio(graph)
  assert.deepEqual(graph, copy)
})
