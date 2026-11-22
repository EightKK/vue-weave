import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  buildGraphLayoutRequests, buildViewBindingIndex, cloneGraphElements, collapseGraphGroups, createGraphConnectionChecker, graphComponents,
  graphDeletion, indexGraph, layoutFlowGraph, layoutForceGraph, layoutGraphIncrementally, layoutLayeredGraph, layoutSwimlaneGraph,
  layoutTreeGraph, renderGraphSvg, resolveEntityRefs, resolveLoadTargets, resolveViewTargets, routeGraphEdges, shortestGraphPath,
  topologicalOrder, traverseGraph,
} from '@eightkk/vue-weave/core'
import { laneBox } from './helpers/builders.mjs'

// The graph core follows the ID rule of the planning core: an ID is a non-empty string. An invalid ID throws
// `Invalid <kind> ID: <value>` and a repeated one `Duplicate <kind> ID: <id>`, both as Error. A reference to something
// that does not exist throws `Unknown <kind> in <owner>: <value>`, where the owner is what holds the reference.

const nodes = () => [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }, { id: 'c', label: 'C' }]
const edges = () => [{ id: 'ab', from: 'a', to: 'b' }, { id: 'bc', from: 'b', to: 'c' }]
const groups = () => [{ id: 'g', label: 'G', nodeIds: ['a'] }, { id: 'h', label: 'H', nodeIds: ['b'] }]
const frame = id => ({ id, label: 'F', x: 0, y: 0, width: 1, height: 1 })
const layout = () => layoutLayeredGraph(nodes(), edges())
const copy = suffix => id => id + suffix

// Every function that indexes the graph checks node, port and edge IDs the same way.
const indexing = {
  indexGraph: (n, e) => indexGraph(n, e),
  layoutLayeredGraph: (n, e) => layoutLayeredGraph(n, e),
  layoutTreeGraph: (n, e) => layoutTreeGraph(n, e),
  layoutForceGraph: (n, e) => layoutForceGraph(n, e),
  layoutFlowGraph: (n, e) => layoutFlowGraph(n, e, { quantity: () => 1, unit: 'u' }),
  layoutSwimlaneGraph: (n, e) => layoutSwimlaneGraph(n, e, { lanes: ['L'], laneOf: () => 'L' }),
  layoutGraphIncrementally: (n, e) => layoutGraphIncrementally(n, e, new Map()),
  topologicalOrder: (n, e) => topologicalOrder(n, e),
  shortestGraphPath: (n, e) => shortestGraphPath(n, e, 'a', 'a'),
  graphComponents: (n, e) => graphComponents(n, e),
  graphDeletion: (n, e) => graphDeletion(n, e, []),
  cloneGraphElements: (n, e) => cloneGraphElements(n, e, [], { createId: copy("'") }),
  createGraphConnectionChecker: (n, e) => createGraphConnectionChecker(n, e, {}),
  renderGraphSvg: (n, e) => renderGraphSvg(layout(), n, e),
}

// Each case sets one ID to `id` (the third field makes a duplicate) and calls one function. The optional fifth field
// is the context appended to an invalid or duplicate ID.
const cases = [
  ...Object.entries(indexing).flatMap(([name, call]) => [
    [name + ' nodes', 'graph node', 'a', id => { const n = nodes(); n[1].id = id; call(n, []) }],
    [name + ' edges', 'graph edge', 'ab', id => { const e = edges(); e[1].id = id; call(nodes(), e) }],
    [name + ' ports', 'port', 'p', id => { const n = nodes(); n[0].ports = [{ id: 'p', side: 'right' }, { id, side: 'left' }]; call(n, edges()) }, ' (graph node a)'],
  ]),
  ['traverseGraph nodes', 'graph node', 'a', id => { const n = nodes(); n[1].id = id; traverseGraph({ nodes: n, edges: [] }, ['a']) }],
  ['traverseGraph edges', 'graph edge', 'ab', id => { const e = edges(); e[1].id = id; traverseGraph({ nodes: nodes(), edges: e }, ['a']) }],
  ['collapseGraphGroups groups', 'graph group', 'g', id => { const g = groups(); g[1].id = id; collapseGraphGroups(nodes(), edges(), g, []) }],
  ['buildGraphLayoutRequests groups', 'graph group', 'g', id => { const g = groups(); g[1].id = id; buildGraphLayoutRequests({ nodes: nodes(), edges: edges(), groups: g, collapsedGroupIds: ['g'] }, 'r') }],
  ['buildGraphLayoutRequests requestId', 'graph layout request', null, id => buildGraphLayoutRequests({ nodes: nodes(), edges: edges() }, id)],
  ['layoutSwimlaneGraph lane specs', 'swimlane', 'L', id => layoutSwimlaneGraph(nodes(), edges(), { lanes: ['L', { id, label: 'M' }], laneOf: () => 'L' })],
  ['renderGraphSvg lanes', 'swimlane', 'l', id => renderGraphSvg(layout(), nodes(), edges(), { lanes: [laneBox('l'), laneBox(id)] })],
  ['renderGraphSvg groups', 'export group', 'g', id => renderGraphSvg(layout(), nodes(), edges(), { groups: [frame('g'), frame(id)] })],
  ['cloneGraphElements createId nodes', 'graph node', 'b', id => cloneGraphElements(nodes(), edges(), ['a'], { createId: () => id }), ' (createId for a)'],
  ['cloneGraphElements createId edges', 'graph edge', 'bc', id => cloneGraphElements(nodes(), edges(), ['a', 'b'], { createId: (from, kind) => kind === 'edge' ? id : from + "'" }), ' (createId for ab)'],
  ['buildViewBindingIndex entities', 'entity', null, id => buildViewBindingIndex([{ entity: { kind: 'task', id }, target: { view: 'graph', kind: 'node', id: 'a' } }])],
  ['buildViewBindingIndex targets', 'view target', null, id => buildViewBindingIndex([{ entity: { kind: 'task', id: 't' }, target: { view: 'graph', kind: 'node', id } }])],
  ['buildViewBindingIndex load targets', 'resource', null, id => buildViewBindingIndex([{ entity: { kind: 'task', id: 't' }, target: { view: 'load', resourceId: id, start: 0, end: 1 } }]), ' (load target)'],
  ['resolveViewTargets', 'entity', null, id => resolveViewTargets(buildViewBindingIndex([]), [{ kind: 'task', id }])],
  ['resolveEntityRefs', 'view target', null, id => resolveEntityRefs(buildViewBindingIndex([]), [{ view: 'timeline', kind: 'bar', id }])],
  ['resolveLoadTargets', 'resource', null, id => resolveLoadTargets([], [{ view: 'load', resourceId: id, start: 0, end: 1 }]), ' (load target)'],
]

const invalid = [[5, '5'], [0, '0'], ['', '""'], [undefined, 'undefined'], [null, 'null'], [{}, 'object']]

test('every graph function that validates IDs rejects the same defect with the same message format', () => {
  for (const [name, kind, first, call, context = ''] of cases) {
    for (const [value, shown] of invalid) {
      assert.throws(() => call(value), { name: 'Error', message: `Invalid ${kind} ID: ${shown}${context}` }, `${name}: ${shown}`)
    }
    if (first !== null) assert.throws(() => call(first), { name: 'Error', message: `Duplicate ${kind} ID: ${first}${context}` }, name + ': duplicate')
  }
})

// Each case names an unknown thing through `ref` and expects `Unknown <kind> in <owner>: <value>`. Values that mean
// "no reference" (such as an undefined port or parent) are left out with `skip`.
const references = [
  ['indexGraph from', 'node', 'graph edge bc', ref => { const e = edges(); e[1].from = ref; indexGraph(nodes(), e) }],
  ['indexGraph to', 'node', 'graph edge bc', ref => { const e = edges(); e[1].to = ref; indexGraph(nodes(), e) }],
  ['layoutLayeredGraph to', 'node', 'graph edge bc', ref => { const e = edges(); e[1].to = ref; layoutLayeredGraph(nodes(), e) }],
  ['collapseGraphGroups to', 'node', 'graph edge bc', ref => { const e = edges(); e[1].to = ref; collapseGraphGroups(nodes(), e, groups(), []) }],
  ['traverseGraph to', 'node', 'graph edge bc', ref => { const e = edges(); e[1].to = ref; traverseGraph({ nodes: nodes(), edges: e }, ['a']) }],
  ['routeGraphEdges to', 'node', 'graph edge bc', ref => { const e = edges(); e[1].to = ref; routeGraphEdges(layout(), e, new Map(), { style: 'straight' }) }],
  ['indexGraph fromPort', 'port', 'graph edge ab', ref => {
    const n = nodes(); n[0].ports = [{ id: 'p', side: 'right' }]; const e = edges(); e[0].fromPort = ref; indexGraph(n, e)
  }, [undefined]],
  ['collapseGraphGroups members', 'node', 'graph group h', ref => { const g = groups(); g[1].nodeIds = [ref]; collapseGraphGroups(nodes(), edges(), g, []) }],
  ['collapseGraphGroups parents', 'parent group', 'graph group h', ref => { const g = groups(); g[1].parentId = ref; collapseGraphGroups(nodes(), edges(), g, []) }, [undefined]],
  ['collapseGraphGroups collapsedIds', 'group', 'collapsedIds', ref => collapseGraphGroups(nodes(), edges(), groups(), [ref])],
  ['layoutTreeGraph roots', 'node', 'roots', ref => layoutTreeGraph(nodes(), edges(), { roots: [ref] })],
  ['layoutGraphIncrementally fixedIds', 'node', 'fixedIds', ref => layoutGraphIncrementally(nodes(), edges(), new Map(), { fixedIds: [ref] })],
  ['shortestGraphPath fromId', 'node', 'fromId', ref => shortestGraphPath(nodes(), edges(), ref, 'c')],
  ['shortestGraphPath toId', 'node', 'toId', ref => shortestGraphPath(nodes(), edges(), 'a', ref)],
  ['graphDeletion nodeIds', 'node', 'graph deletion', ref => graphDeletion(nodes(), edges(), [ref])],
  ['graphDeletion edgeIds', 'edge', 'graph deletion', ref => graphDeletion(nodes(), edges(), [], [ref])],
  ['cloneGraphElements nodeIds', 'node', 'graph clone', ref => cloneGraphElements(nodes(), edges(), [ref], { createId: copy("'") })],
  ['connection check replacingEdgeId', 'edge', 'graph connection check', ref => createGraphConnectionChecker(nodes(), edges(), {}).check({ from: 'a', to: 'c' }, ref), [undefined]],
  ['layoutSwimlaneGraph laneOf', 'swimlane', 'graph node b', ref => layoutSwimlaneGraph(nodes(), edges(), { lanes: ['L'], laneOf: node => node.id === 'b' ? ref : 'L' }), [undefined, null, '']],
]

test('unknown references name the kind, the owner and the value in one shape', () => {
  for (const [name, kind, owner, call, skip = []] of references) {
    for (const [value, shown] of [['zz', 'zz'], ...invalid]) {
      if (skip.includes(value)) continue
      assert.throws(() => call(value), { name: 'Error', message: `Unknown ${kind} in ${owner}: ${shown}` }, `${name}: ${shown}`)
    }
  }
  // Rule keys are strings; the port of a rule is named with its node as context.
  const ported = nodes()
  ported[0].ports = [{ id: 'p', side: 'right' }]
  assert.throws(() => createGraphConnectionChecker(ported, edges(), { nodes: { zz: {} } }), { name: 'Error', message: 'Unknown node in graph port rules: zz' })
  assert.throws(() => createGraphConnectionChecker(ported, edges(), { ports: { zz: { p: {} } } }), { name: 'Error', message: 'Unknown node in graph port rules: zz' })
  assert.throws(() => createGraphConnectionChecker(ported, edges(), { ports: { a: { q: {} } } }), { name: 'Error', message: 'Unknown port in graph port rules: q (graph node a)' })
})

test('group and lane checks give one text per defect, also for repeated members, empty groups and bare lane IDs', () => {
  for (const call of [
    g => collapseGraphGroups(nodes(), edges(), g, ['g']),
    g => buildGraphLayoutRequests({ nodes: nodes(), edges: edges(), groups: g, collapsedGroupIds: ['g'] }, 'r'),
  ]) {
    assert.throws(() => call([groups()[0], { ...groups()[1], nodeIds: ['a'] }]), { name: 'Error', message: 'Duplicate group member ID: a (graph group h)' })
    assert.throws(() => call([{ ...groups()[0], nodeIds: ['a', 'a'] }]), { name: 'Error', message: 'Duplicate group member ID: a (graph group g)' })
    assert.throws(() => call([{ ...groups()[0], parentId: 'h' }, { ...groups()[1], parentId: 'g' }]), { name: 'Error', message: 'Graph group hierarchy contains a cycle at group: g' })
    assert.throws(() => call([{ ...groups()[0], nodeIds: [] }]), { name: 'Error', message: 'Invalid graph group: g' })
  }
  // A lane is its ID or a spec; any other lane value is shown as the invalid ID, and a spec without an ID as undefined.
  for (const [value, shown] of [[5, '5'], ['', '""'], [null, 'null'], [true, 'true'], [{}, 'undefined']]) {
    assert.throws(() => layoutSwimlaneGraph(nodes(), edges(), { lanes: ['L', value], laneOf: () => 'L' }), { name: 'Error', message: 'Invalid swimlane ID: ' + shown })
  }
  assert.throws(() => layoutSwimlaneGraph(nodes(), edges(), { lanes: ['L', 'L'], laneOf: () => 'L' }), { name: 'Error', message: 'Duplicate swimlane ID: L' })
  // A null entry is an invalid ID, not a TypeError.
  assert.throws(() => collapseGraphGroups(nodes(), edges(), [groups()[0], null], []), { name: 'Error', message: 'Invalid graph group ID: undefined' })
  assert.throws(() => renderGraphSvg(layout(), nodes(), edges(), { lanes: [laneBox('l'), null] }), { name: 'Error', message: 'Invalid swimlane ID: undefined' })
})

test('numeric and other non-string graph IDs are rejected where they used to pass', () => {
  // Before the strict rule, these inputs were accepted.
  assert.throws(() => layoutLayeredGraph([{ id: 5 }], []), { name: 'Error', message: 'Invalid graph node ID: 5' })
  assert.throws(() => layoutLayeredGraph(nodes(), [{ id: 7, from: 'a', to: 'b' }]), { name: 'Error', message: 'Invalid graph edge ID: 7' })
  assert.throws(() => indexGraph([{ id: 'a', ports: [{ id: true, side: 'left' }] }], []), { name: 'Error', message: 'Invalid port ID: true (graph node a)' })
  assert.throws(() => traverseGraph({ nodes: nodes(), edges: [{ id: 3, from: 'a', to: 'b' }] }, ['a']), { name: 'Error', message: 'Invalid graph edge ID: 3' })
  assert.throws(() => collapseGraphGroups(nodes(), edges(), [{ id: 1, label: 'G', nodeIds: ['a'] }], []), { name: 'Error', message: 'Invalid graph group ID: 1' })
  assert.throws(() => renderGraphSvg(layout(), nodes(), edges(), { groups: [frame(2)] }), { name: 'Error', message: 'Invalid export group ID: 2' })
  assert.throws(() => resolveLoadTargets([], [{ view: 'load', resourceId: 4, start: 0, end: 1 }]), { name: 'Error', message: 'Invalid resource ID: 4 (load target)' })
  // Valid string IDs, including ones that look like numbers, still pass.
  assert.equal(layoutLayeredGraph([{ id: '0' }, { id: '5' }], [{ id: '0', from: '0', to: '5' }]).boxes.size, 2)
  assert.equal(traverseGraph({ nodes: [{ id: '0' }], edges: [] }, ['0']).nodeIds[0], '0')
})
