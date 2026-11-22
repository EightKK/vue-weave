import assert from 'node:assert/strict'
import { test } from 'node:test'
import { validateInspectorList } from '@eightkk/vue-weave/core'
import { PropertyInspector } from '@eightkk/vue-weave'
import { renderComponent } from './helpers/ssr.mjs'

const resources = [{ value: 'crane', label: 'Crane' }, { value: 'crew', label: 'Crew' }, { value: 'truck' }]
const tasks = [{ value: 'design', label: 'Design' }, { value: 'permit', label: 'Permit' }]
const task = {
  id: 'build', label: 'Build',
  assignments: [{ resourceId: 'crane', units: 1 }, { resourceId: 'crew', units: 2 }],
  links: [{ predecessorId: 'design', type: 'FS', lag: 7_200_000 }],
}
const assignments = { id: 'assignments', kind: 'assignments', label: 'Resources', options: resources, get: item => item.assignments, maxUnits: 4 }
const dependencies = {
  id: 'links', kind: 'dependencies', label: 'Predecessors', options: tasks, get: item => item.links,
  lagUnitSize: 3_600_000, lagUnitLabel: 'h', description: 'Links into this task.',
}

test('validateInspectorList checks options, duplicates, units, types and lags', () => {
  assert.deepEqual(validateInspectorList(assignments, task.assignments), { ok: true })
  assert.deepEqual(validateInspectorList(dependencies, task.links), { ok: true })
  assert.deepEqual(validateInspectorList(assignments, []), { ok: true })
  const error = (field, rows) => {
    const check = validateInspectorList(field, rows)
    assert.equal(check.ok, false)
    return [check.code, check.error]
  }
  assert.deepEqual(error(assignments, [{ resourceId: 'nope', units: 1 }]), ['choice', 'Unknown resource: nope'])
  assert.deepEqual(error(assignments, [{ resourceId: 'crane', units: 1 }, { resourceId: 'crane', units: 2 }]), ['invalid', 'Duplicate resource: Crane'])
  for (const units of [0, -1, 0.5, 1.5, NaN, Infinity, 2 ** 53, '1']) {
    assert.deepEqual(error(assignments, [{ resourceId: 'crew', units }]), ['range', 'Units for Crew must be a positive integer'], String(units))
  }
  assert.deepEqual(error(assignments, [{ resourceId: 'truck', units: 5 }]), ['range', 'Units for truck must be at most 4'])
  assert.deepEqual(error(dependencies, [{ predecessorId: 'design', type: 'XX', lag: 0 }]), ['choice', 'Invalid dependency type for Design: XX'])
  for (const lag of [NaN, Infinity, 0.5, 2 ** 53, '0']) {
    assert.deepEqual(error(dependencies, [{ predecessorId: 'design', type: 'SS', lag }]), ['invalid', 'Lag for Design must be an integer'], String(lag))
  }
  assert.deepEqual(error(dependencies, [{ predecessorId: 'build', type: 'SS', lag: 0 }]), ['choice', 'Unknown predecessor: build'])
  assert.deepEqual(validateInspectorList(dependencies, [{ predecessorId: 'permit', type: 'SF', lag: -3_600_000 }]), { ok: true })
  assert.equal(validateInspectorList(assignments, 'crane').ok, false)
})

test('PropertyInspector renders list fields as labelled tables on the server', async () => {
  const html = await renderComponent(PropertyInspector, { item: task, fields: [{ id: 'label', kind: 'text', label: 'Label', get: item => item.label }, assignments, dependencies] })
  assert.equal(html.match(/<label class="vw-inspector-label"/g).length, 1)
  const group = html.match(/<div id="([^"]+)" class="vw-inspector-list" role="group" data-vw-list="\1" aria-labelledby="\1-label">/)
  assert.ok(group, 'assignments group')
  assert.match(html, new RegExp(`<span id="${group[1]}-label" class="vw-inspector-label">Resources</span>`))
  assert.match(html, /<th scope="col">Resource<\/th><th scope="col">Units<\/th><th scope="col"><span class="vw-sr-only">Remove<\/span><\/th>/)
  assert.match(html, /aria-label="Resource for Crane"/)
  assert.match(html, /value="1" aria-label="Units for Crane"/)
  assert.match(html, /value="2" aria-label="Units for Crew"/)
  assert.match(html, /aria-label="Remove Crew"/)
  // A resource used by another row is disabled in the select, so a row cannot repeat it.
  assert.match(html, /<option value="crew" disabled>Crew<\/option>/)
  assert.match(html, /<option value="crane" selected>Crane<\/option>/)
  assert.match(html, /<button type="button" class="vw-inspector-add">Add assignment<\/button>/)
  // The dependency table shows the lag in display units and the type select.
  assert.match(html, /<th scope="col">Predecessor<\/th><th scope="col">Type<\/th><th scope="col">Lag<\/th>/)
  assert.match(html, /aria-label="Type for Design"[^]*?<option value="FS" selected>FS<\/option>/)
  assert.match(html, /value="2" aria-label="Lag for Design"/)
  assert.match(html, /<span class="vw-inspector-unit" aria-hidden="true">h<\/span>/)
  assert.match(html, /aria-describedby="[^"]+-description">/)
  assert.doesNotMatch(html, /role="alert"|aria-invalid/)
})

test('PropertyInspector list fields show empty and read-only states and validate their definitions', async () => {
  const empty = await renderComponent(PropertyInspector, {
    item: { id: 'x', assignments: [], links: [] }, fields: [assignments, { ...dependencies, readonly: true }],
    labels: { noRows: 'Nothing yet', addAssignment: 'Assign' },
  })
  assert.equal(empty.match(/<p class="vw-inspector-none">Nothing yet<\/p>/g).length, 2)
  assert.match(empty, />Assign<\/button>/)
  assert.doesNotMatch(empty, /Add dependency/)
  // A row naming an unknown resource keeps it in its select.
  const unknown = await renderComponent(PropertyInspector, { item: { id: 'y', assignments: [{ resourceId: 'gone', units: 1 }] }, fields: [assignments] })
  assert.match(unknown, /<option value="gone" selected>gone<\/option>/)
  const render = list => renderComponent(PropertyInspector, { item: task, fields: list })
  await assert.rejects(render([{ ...assignments, options: undefined }]), { message: 'A list field needs options: assignments' })
  await assert.rejects(render([{ ...assignments, options: [{ value: 'a' }, { value: 'a' }] }]), { message: 'Duplicate option of list field assignments: a' })
  await assert.rejects(render([{ ...assignments, defaultUnits: 0 }]), { name: 'RangeError', message: 'defaultUnits must be a positive integer: assignments' })
  await assert.rejects(render([{ ...assignments, defaultUnits: 1.5 }]), { name: 'RangeError', message: 'defaultUnits must be a positive integer: assignments' })
  await assert.rejects(render([{ ...assignments, maxUnits: 2.5 }]), { name: 'RangeError', message: 'maxUnits must be a positive integer: assignments' })
  await assert.rejects(render([{ ...dependencies, lagUnitSize: -1 }]), { name: 'RangeError', message: 'lagUnitSize must be finite and positive: links' })
})
