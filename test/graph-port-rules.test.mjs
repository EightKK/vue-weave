import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  checkGraphConnection, createGraphConnectionChecker, graphConnectionTargets, graphConnectionValidator, graphConnectionViolations,
} from '@eightkk/vue-weave/core'
import { NetworkGraph, checkGraphConnection as rootCheck } from '@eightkk/vue-weave'
import { renderComponent } from './helpers/ssr.mjs'

const nodes = [
  { id: 'src', label: 'Source', ports: [{ id: 'num', side: 'right', label: 'Number' }, { id: 'txt', side: 'right', label: 'Text' }] },
  {
    id: 'sum', label: 'Sum',
    ports: [{ id: 'a', side: 'left', label: 'A' }, { id: 'b', side: 'left', label: 'B' }, { id: 'out', side: 'right', label: 'Out' }],
  },
  { id: 'log', label: 'Log', ports: [{ id: 'in', side: 'left', label: 'In', direction: 'target' }] },
  { id: 'note', label: 'Note' },
]
const rules = {
  ports: {
    src: { num: { type: 'number', direction: 'out' }, txt: { type: 'text', direction: 'out' } },
    sum: {
      a: { type: 'number', direction: 'in', maxConnections: 1 },
      b: { type: 'number', direction: 'in', maxConnections: 1 },
      out: { type: 'number', direction: 'out' },
    },
    log: { in: { type: ['number', 'text'] } },
  },
  nodes: { note: { maxConnections: 2 } },
}
const edges = [{ id: 'e1', from: 'src', fromPort: 'num', to: 'sum', toPort: 'a' }]

test('checkGraphConnection accepts a valid connection and is exported from both entries', () => {
  assert.equal(rootCheck, checkGraphConnection)
  assert.deepEqual(checkGraphConnection(nodes, edges, rules, { from: 'src', fromPort: 'num', to: 'sum', toPort: 'b' }), { ok: true })
  // A list of types accepts any of them; an untyped endpoint accepts every type.
  assert.deepEqual(checkGraphConnection(nodes, edges, rules, { from: 'src', fromPort: 'txt', to: 'log', toPort: 'in' }), { ok: true })
  assert.deepEqual(checkGraphConnection(nodes, edges, rules, { from: 'src', fromPort: 'txt', to: 'note' }), { ok: true })
  // Without any rule, every connection is accepted.
  assert.deepEqual(checkGraphConnection(nodes, edges, {}, { from: 'sum', fromPort: 'a', to: 'src', toPort: 'num' }), { ok: true })
})

test('checkGraphConnection reports each code with a readable reason and the endpoint', () => {
  assert.deepEqual(checkGraphConnection(nodes, edges, rules, { from: 'src', fromPort: 'txt', to: 'sum', toPort: 'b' }), {
    ok: false, code: 'type-mismatch', reason: 'Sum · B accepts number, not text from Source · Text.', end: 'to', node: 'sum', port: 'b',
  })
  assert.deepEqual(checkGraphConnection(nodes, edges, rules, { from: 'src', fromPort: 'num', to: 'sum', toPort: 'a' }), {
    ok: false, code: 'limit-reached', reason: 'Sum · A already has its maximum of 1 connection.', end: 'to', node: 'sum', port: 'a',
  })
  assert.deepEqual(checkGraphConnection(nodes, edges, rules, { from: 'sum', fromPort: 'a', to: 'log', toPort: 'in' }), {
    ok: false, code: 'direction', reason: 'Sum · A accepts only incoming connections.', end: 'from', node: 'sum', port: 'a',
  })
  assert.deepEqual(checkGraphConnection(nodes, edges, rules, { from: 'sum', fromPort: 'out', to: 'src', toPort: 'num' }), {
    ok: false, code: 'direction', reason: 'Source · Number allows only outgoing connections.', end: 'to', node: 'src', port: 'num',
  })
  // GraphPort.direction applies too: the Log input is a target only, with or without a rule.
  assert.equal(checkGraphConnection(nodes, edges, {}, { from: 'log', fromPort: 'in', to: 'note' }).code, 'direction')
  assert.deepEqual(checkGraphConnection(nodes, edges, rules, { from: 'ghost', to: 'note' }), {
    ok: false, code: 'unknown-node', reason: 'Unknown node: ghost', end: 'from', node: 'ghost',
  })
  assert.deepEqual(checkGraphConnection(nodes, edges, rules, { from: 'src', fromPort: 'num', to: 'sum', toPort: 'zz' }), {
    ok: false, code: 'unknown-port', reason: 'Unknown port zz on Sum', end: 'to', node: 'sum', port: 'zz',
  })
  // The limit of a node without ports counts every edge end at the node; a limit of 0 rejects every connection.
  const full = [...edges, { id: 'n1', from: 'src', fromPort: 'num', to: 'note' }, { id: 'n2', from: 'note', to: 'log', toPort: 'in' }]
  assert.equal(checkGraphConnection(nodes, full, rules, { from: 'src', fromPort: 'txt', to: 'note' }).reason,
    'Note already has its maximum of 2 connections.')
  assert.equal(checkGraphConnection(nodes, [], { nodes: { note: { maxConnections: 0 } } }, { from: 'src', fromPort: 'num', to: 'note' }).code, 'limit-reached')
  // A default rule applies to every endpoint without a rule of its own.
  assert.equal(checkGraphConnection(nodes, [], { default: { type: 'x' }, ports: { src: { num: { type: 'number' } } } },
    { from: 'src', fromPort: 'num', to: 'note' }).code, 'type-mismatch')
})

test('a reconnection leaves its own edge out of the counts', () => {
  // e1 already uses Sum · A (limit 1): moving e1's source, or moving it onto Sum · B and back, stays within the limit.
  assert.deepEqual(checkGraphConnection(nodes, edges, rules, { from: 'sum', fromPort: 'out', to: 'sum', toPort: 'a' }, 'e1'), { ok: true })
  assert.deepEqual(checkGraphConnection(nodes, edges, rules, { from: 'src', fromPort: 'num', to: 'sum', toPort: 'b' }, 'e1'), { ok: true })
  const both = [...edges, { id: 'e2', from: 'src', fromPort: 'num', to: 'sum', toPort: 'b' }]
  // Another edge still counts: moving e2 onto Sum · A is rejected.
  assert.equal(checkGraphConnection(nodes, both, rules, { from: 'src', fromPort: 'num', to: 'sum', toPort: 'a' }, 'e2').code, 'limit-reached')
  assert.throws(() => checkGraphConnection(nodes, edges, rules, { from: 'src', to: 'note' }, 'missing'),
    { name: 'Error', message: 'Unknown edge in graph connection check: missing' })
})

test('graphConnectionValidator runs the rules first, then the user validator', () => {
  const calls = []
  const user = (connection, replacing) => {
    calls.push([connection.to, replacing])
    return connection.to === 'note' ? 'Notes are read-only.' : undefined
  }
  const validate = graphConnectionValidator(nodes, edges, rules, user)
  assert.equal(validate({ from: 'src', fromPort: 'txt', to: 'sum', toPort: 'b' }), 'Sum · B accepts number, not text from Source · Text.')
  assert.deepEqual(calls, [], 'a broken rule does not call the user validator')
  assert.equal(validate({ from: 'src', fromPort: 'txt', to: 'note' }), 'Notes are read-only.')
  assert.equal(validate({ from: 'src', fromPort: 'num', to: 'sum', toPort: 'a' }, 'e1'), undefined)
  assert.deepEqual(calls, [['note', undefined], ['sum', 'e1']])
  assert.equal(graphConnectionValidator(nodes, edges, rules)({ from: 'src', fromPort: 'num', to: 'sum', toPort: 'b' }), true)
  // A checker composes the same way inside any validator.
  const checker = createGraphConnectionChecker(nodes, edges, rules)
  const own = (connection, replacing) => {
    const result = checker.check(connection, replacing)
    return result.ok || result.code === 'limit-reached' ? undefined : result.code
  }
  assert.equal(own({ from: 'src', fromPort: 'num', to: 'sum', toPort: 'a' }), undefined)
  assert.equal(own({ from: 'src', fromPort: 'txt', to: 'sum', toPort: 'a' }), 'type-mismatch')
})

test('graphConnectionTargets lists valid ports and nodes for a connection and a reconnection', () => {
  const sorted = targets => ({
    nodeIds: [...targets.nodeIds].sort(),
    ports: Object.fromEntries([...targets.ports].map(([id, ports]) => [id, [...ports].sort()]).sort()),
  })
  assert.deepEqual(sorted(graphConnectionTargets(nodes, edges, rules, { node: 'src', port: 'num' })), {
    nodeIds: ['log', 'note', 'sum'], ports: { log: ['in'], sum: ['b'] },
  })
  assert.deepEqual(sorted(graphConnectionTargets(nodes, edges, rules, { node: 'src', port: 'txt' })), {
    nodeIds: ['log', 'note'], ports: { log: ['in'] },
  })
  // Reconnecting the target of e1 frees Sum · A.
  assert.deepEqual(sorted(graphConnectionTargets(nodes, edges, rules, { node: 'src', port: 'num' }, 'e1')).ports.sum, ['a', 'b'])
  // Choosing a new source for e1: only outgoing number endpoints and the untyped note qualify.
  assert.deepEqual(sorted(graphConnectionTargets(nodes, edges, rules, { node: 'sum', port: 'a', end: 'from' }, 'e1')), {
    nodeIds: ['note', 'src', 'sum'], ports: { src: ['num'], sum: ['out'] },
  })
  assert.deepEqual(sorted(graphConnectionTargets(nodes, edges, rules, { node: 'ghost' })), { nodeIds: [], ports: {} })
})

test('graphConnectionTargets indexes once and handles thousands of nodes', () => {
  const many = [], links = []
  for (let i = 0; i < 4000; i++) {
    many.push({ id: 'n' + i, ports: [{ id: 'in', side: 'left' }, { id: 'out', side: 'right' }] })
    if (i) links.push({ id: 'l' + i, from: 'n' + (i - 1), fromPort: 'out', to: 'n' + i, toPort: 'in' })
  }
  const portRules = {}
  for (const node of many) portRules[node.id] = { in: { direction: 'in', maxConnections: 1 }, out: { direction: 'out' } }
  const started = performance.now()
  const result = graphConnectionTargets(many, links, { ports: portRules }, { node: 'n5', port: 'out' })
  assert.ok(performance.now() - started < 10_000)
  // Only n0 has a free input.
  assert.deepEqual([...result.nodeIds], ['n0'])
})

test('graphConnectionViolations audits every edge in order', () => {
  const loaded = [
    { id: 'ok', from: 'src', fromPort: 'num', to: 'sum', toPort: 'a' },
    { id: 'second', from: 'src', fromPort: 'num', to: 'sum', toPort: 'a' },
    { id: 'typed', from: 'src', fromPort: 'txt', to: 'sum', toPort: 'b' },
    { id: 'backwards', from: 'sum', fromPort: 'a', to: 'note' },
  ]
  assert.deepEqual(graphConnectionViolations(nodes, loaded, rules), [
    { edgeId: 'second', code: 'limit-reached', reason: 'Sum · A already has its maximum of 1 connection.', end: 'to', node: 'sum', port: 'a' },
    { edgeId: 'typed', code: 'type-mismatch', reason: 'Sum · B accepts number, not text from Source · Text.', end: 'to', node: 'sum', port: 'b' },
    { edgeId: 'backwards', code: 'direction', reason: 'Sum · A accepts only incoming connections.', end: 'from', node: 'sum', port: 'a' },
    { edgeId: 'backwards', code: 'limit-reached', reason: 'Sum · A already has its maximum of 1 connection.', end: 'from', node: 'sum', port: 'a' },
  ])
  assert.deepEqual(graphConnectionViolations(nodes, edges, rules), [])
})

test('rule input is validated', () => {
  const check = value => () => createGraphConnectionChecker(nodes, edges, value)
  for (const max of [-1, 1.5, Infinity, NaN, '1']) {
    assert.throws(check({ ports: { sum: { a: { maxConnections: max } } } }), RangeError)
  }
  assert.throws(check({ nodes: { note: { maxConnections: -2 } } }),
    { name: 'RangeError', message: 'Graph port rule maxConnections must be a non-negative integer: note has -2' })
  assert.throws(check({ default: { maxConnections: Infinity } }), RangeError)
  assert.throws(check({ ports: { ghost: { a: {} } } }), { name: 'Error', message: 'Unknown node in graph port rules: ghost' })
  assert.throws(check({ ports: { sum: { zz: {} } } }), { name: 'Error', message: 'Unknown port in graph port rules: zz (graph node sum)' })
  assert.throws(check({ ports: { note: { a: {} } } }), { name: 'Error', message: 'Unknown port in graph port rules: a (graph node note)' })
  assert.throws(check({ nodes: { ghost: {} } }), /Unknown node in graph port rules: ghost/)
  assert.throws(check({ nodes: { note: { direction: 'sideways' } } }), /direction must be in, out or both/)
  assert.throws(check({ nodes: { note: { type: '' } } }), /type must be a nonempty string/)
  assert.throws(check({ nodes: { note: { type: ['a', 3] } } }), /type must be a nonempty string/)
  assert.throws(check({ nodes: { note: null } }), /must be an object/)
  assert.throws(check(null), /Graph port rules must be an object/)
  // The graph itself is validated as indexGraph does.
  assert.throws(() => createGraphConnectionChecker(nodes, [{ id: 'x', from: 'src', to: 'nowhere' }], {}), { name: 'Error', message: 'Unknown node in graph edge x: nowhere' })
  // Inputs are not modified.
  const frozen = structuredClone(rules)
  graphConnectionViolations(nodes, edges, frozen)
  assert.deepEqual(frozen, rules)
})

test('NetworkGraph renders identical markup with and without connectionRules', async () => {
  const render = props => renderComponent(NetworkGraph, { nodes, edges, connectable: true, ...props })
  const plain = await render({})
  assert.equal(await render({ connectionRules: undefined }), plain)
  assert.equal(await render({ connectionRules: rules }), plain)
  assert.match(plain, /vw-connect-handle/)
  assert.doesNotMatch(plain, /vw-is-(in)?valid-target|aria-description/)
})
