import assert from 'node:assert/strict'
import { test } from 'node:test'
import { diffStructure } from '@eightkk/vue-weave/core'

// Two revisions of a small bill of materials.
const before = [
  { id: 'bike', parent: undefined, name: 'Bike', qty: 1 },
  { id: 'frame', parent: 'bike', name: 'Frame', qty: 1, material: 'steel' },
  { id: 'wheel', parent: 'bike', name: 'Wheel', qty: 2 },
  { id: 'spoke', parent: 'wheel', name: 'Spoke', qty: 32 },
  { id: 'bell', parent: 'bike', name: 'Bell', qty: 1 },
]
const after = [
  { id: 'bike', parent: undefined, name: 'Bike', qty: 1 },
  { id: 'light', parent: 'bike', name: 'Light', qty: 1 },
  { id: 'frame', parent: 'bike', name: 'Frame', qty: 1, material: 'aluminium' },
  { id: 'wheel', parent: 'bike', name: 'Wheel', qty: 2 },
  { id: 'hub', parent: 'wheel', name: 'Hub', qty: 1 },
  { id: 'spoke', parent: 'hub', name: 'Spoke', qty: 28 },
]

test('reports added, removed, changed and moved keys in a fixed order', () => {
  const diff = diffStructure(before, after, { key: 'id', parentKey: 'parent' })
  assert.deepEqual(diff, {
    added: ['light', 'hub'],
    removed: ['bell'],
    changed: [
      { key: 'frame', fields: [{ name: 'material', before: 'steel', after: 'aluminium' }] },
      { key: 'spoke', fields: [{ name: 'qty', before: 32, after: 28 }] },
    ],
    moved: [{ key: 'spoke', beforeParent: 'wheel', afterParent: 'hub' }],
  })
})

test('the default fields are the union of both items, in order of first appearance', () => {
  const diff = diffStructure([{ id: 'a', x: 1, y: 2 }], [{ id: 'a', z: 3, y: 2, x: 4 }], { key: 'id' })
  assert.deepEqual(diff.changed, [{
    key: 'a', fields: [{ name: 'x', before: 1, after: 4 }, { name: 'z', before: undefined, after: 3 }],
  }])
  // A property that is undefined on one side and absent on the other is equal.
  assert.deepEqual(diffStructure([{ id: 'a', x: undefined }], [{ id: 'a' }], { key: 'id' }).changed, [])
  // Without parentKey nothing moves, and a key function leaves every property in the default field set.
  const flat = diffStructure(before, after, { key: item => item.id })
  assert.deepEqual(flat.moved, [])
  assert.deepEqual(flat.changed.find(change => change.key === 'spoke').fields.map(field => field.name), ['parent', 'qty'])
})

test('a field list or a field function chooses and orders the compared fields', () => {
  const listed = diffStructure(before, after, { key: 'id', parentKey: 'parent', fields: ['qty', 'name'] })
  assert.deepEqual(listed.changed, [{ key: 'spoke', fields: [{ name: 'qty', before: 32, after: 28 }] }])
  const derived = diffStructure(before, after, {
    key: 'id', parentKey: 'parent', fields: item => ({ label: item.name.toUpperCase(), total: item.qty * 10 }),
  })
  assert.deepEqual(derived.changed, [{ key: 'spoke', fields: [{ name: 'total', before: 320, after: 280 }] }])
  // A function's fields include the parent field when the function returns it.
  const withParent = diffStructure(before, after, { key: 'id', parentKey: 'parent', fields: item => ({ parent: item.parent }) })
  assert.deepEqual(withParent.changed, [{ key: 'spoke', fields: [{ name: 'parent', before: 'wheel', after: 'hub' }] }])
})

test('values compare with Object.is by default and with a custom equals', () => {
  const a = [{ id: 'x', tags: ['a'], weight: 1.0001, n: NaN, z: 0 }]
  const b = [{ id: 'x', tags: ['a'], weight: 1.0002, n: NaN, z: -0 }]
  const plain = diffStructure(a, b, { key: 'id' })
  assert.deepEqual(plain.changed[0].fields.map(field => field.name), ['tags', 'weight', 'z'])
  // The values are the inputs' own, not copies.
  assert.equal(plain.changed[0].fields[0].before, a[0].tags)
  const calls = []
  const tolerant = diffStructure(a, b, {
    key: 'id',
    equals: (x, y, field) => {
      calls.push(field)
      if (field === 'tags') return JSON.stringify(x) === JSON.stringify(y)
      if (field === 'weight') return Math.abs(x - y) < 0.001
      return x === y || (Number.isNaN(x) && Number.isNaN(y))
    },
  })
  assert.deepEqual(tolerant.changed, [])
  assert.deepEqual(calls, ['tags', 'weight', 'n', 'z'])
})

test('roots and parent changes to and from the root are reported', () => {
  const diff = diffStructure(
    [{ id: 'r' }, { id: 'a', p: 'r' }, { id: 'b', p: null }],
    [{ id: 'r' }, { id: 'a' }, { id: 'b', p: 'r' }],
    { key: 'id', parentKey: 'p' },
  )
  assert.deepEqual(diff.moved, [{ key: 'a', beforeParent: 'r' }, { key: 'b', afterParent: 'r' }])
  assert.equal('afterParent' in diff.moved[0], false)
  assert.deepEqual(diff.changed, [])
})

test('invalid and duplicate keys throw an Error that names the version', () => {
  const key = 'id'
  assert.throws(() => diffStructure([{ id: 'a' }, { id: 'a' }], [], { key }), { name: 'Error', message: 'Duplicate item ID: a (before)' })
  assert.throws(() => diffStructure([], [{ id: '' }], { key }), { name: 'Error', message: 'Invalid item ID: "" (after)' })
  assert.throws(() => diffStructure([], [{ id: 5 }], { key }), { message: 'Invalid item ID: 5 (after)' })
  assert.throws(() => diffStructure([{}], [], { key }), { message: 'Invalid item ID: undefined (before)' })
  assert.throws(() => diffStructure([{ id: 'a', p: '' }], [], { key, parentKey: 'p' }), { message: 'Invalid parent ID: "" (before)' })
  assert.throws(() => diffStructure([], [{ id: 'a', p: 'x' }], { key, parentKey: 'p' }), { message: 'Unknown parent for item: a (after)' })
  assert.throws(() => diffStructure([{ id: 'a', p: 'b' }, { id: 'b', p: 'a' }], [], { key, parentKey: 'p' }), /^Error: The item hierarchy contains a cycle: .* \(before\)$/)
  assert.throws(() => diffStructure([{ id: 'a', p: 'a' }], [], { key, parentKey: 'p' }), /cycle: a \(before\)/)
})

test('invalid options and inputs throw a TypeError', () => {
  assert.throws(() => diffStructure([], []), TypeError)
  assert.throws(() => diffStructure([], [], {}), { name: 'TypeError', message: 'key must be a function or a property name' })
  assert.throws(() => diffStructure([], [], { key: 'id', parentKey: 3 }), { name: 'TypeError', message: 'parentKey must be a function or a property name' })
  assert.throws(() => diffStructure([], [], { key: 'id', equals: 'same' }), { name: 'TypeError', message: 'equals must be a function' })
  assert.throws(() => diffStructure([], [], { key: 'id', fields: 'qty' }), TypeError)
  assert.throws(() => diffStructure([], [], { key: 'id', fields: [1] }), { name: 'TypeError', message: 'A field name must be a string' })
  assert.throws(() => diffStructure([], [], { key: 'id', fields: ['a', 'a'] }), { name: 'Error', message: 'Duplicate field name: a' })
  assert.throws(() => diffStructure({}, [], { key: 'id' }), { name: 'TypeError', message: 'The before items must be an array' })
  assert.throws(() => diffStructure([], null, { key: 'id' }), { name: 'TypeError', message: 'The after items must be an array' })
  assert.throws(() => diffStructure([null], [], { key: 'id' }), TypeError)
  assert.throws(() => diffStructure([{ id: 'a' }], [{ id: 'a' }], { key: 'id', fields: () => null }), { name: 'TypeError', message: 'fields must return an object (before)' })
  // Primitive items work with key and field functions.
  assert.deepEqual(diffStructure(['a', 'b'], ['b', 'c'], { key: item => item, fields: () => ({}) }), {
    added: ['c'], removed: ['a'], changed: [], moved: [],
  })
})

test('a 12,000-item chain is diffed without recursion, deep moves included', () => {
  const size = 12_000
  const chain = Array.from({ length: size }, (_, i) => ({ id: 'n' + i, parent: i ? 'n' + (i - 1) : undefined, depth: i }))
  // Listed leaf first, so the cycle check walks the whole chain from the first item.
  const reversed = chain.slice().reverse()
  const changed = chain.map(item => item.id === 'n11999' ? { ...item, parent: 'n0' } : item.id === 'n6000' ? { ...item, depth: -1 } : item)
  const diff = diffStructure(reversed, changed, { key: 'id', parentKey: 'parent' })
  assert.deepEqual(diff.added, [])
  assert.deepEqual(diff.removed, [])
  assert.deepEqual(diff.changed, [{ key: 'n6000', fields: [{ name: 'depth', before: 6000, after: -1 }] }])
  assert.deepEqual(diff.moved, [{ key: 'n11999', beforeParent: 'n11998', afterParent: 'n0' }])
  const looped = chain.map(item => item.id === 'n0' ? { ...item, parent: 'n11999' } : item)
  assert.throws(() => diffStructure(chain, looped, { key: 'id', parentKey: 'parent' }), /cycle: .* \(after\)$/)
})

test('a deep tree with many siblings keeps the before order for changes and the after order for additions', () => {
  const tree = [{ id: 'root' }]
  for (let i = 0; i < 50; i++) for (let j = 0; j < 20; j++) tree.push({ id: `c${i}-${j}`, parent: j ? `c${i}-${j - 1}` : 'root', v: j })
  const next = tree.filter(item => item.id !== 'c3-19').map(item => item.id.endsWith('-5') ? { ...item, v: 0 } : item)
  next.unshift({ id: 'z-new', parent: 'c49-19' }, { id: 'a-new', parent: 'root' })
  const diff = diffStructure(tree, next, { key: 'id', parentKey: 'parent', fields: ['v'] })
  assert.deepEqual(diff.added, ['z-new', 'a-new'])
  assert.deepEqual(diff.removed, ['c3-19'])
  assert.deepEqual(diff.changed.map(change => change.key), Array.from({ length: 50 }, (_, i) => `c${i}-5`))
  assert.deepEqual(diff.moved, [])
})

test('inputs and options are never changed', () => {
  const deepFreeze = value => {
    for (const item of value) Object.freeze(item)
    return Object.freeze(value)
  }
  const a = deepFreeze(structuredClone(before.map(item => ({ ...item, parent: item.parent ?? null }))))
  const b = deepFreeze(structuredClone(after.map(item => ({ ...item, parent: item.parent ?? null }))))
  const fields = Object.freeze(['qty', 'material'])
  const options = Object.freeze({ key: 'id', parentKey: 'parent', fields })
  const snapshot = JSON.stringify([a, b, options])
  const diff = diffStructure(a, b, options)
  assert.equal(JSON.stringify([a, b, options]), snapshot)
  assert.deepEqual(diff.moved, [{ key: 'spoke', beforeParent: 'wheel', afterParent: 'hub' }])
  // The result lists are new arrays.
  assert.notEqual(diffStructure(a, a, options).added, diffStructure(a, a, options).added)
})
