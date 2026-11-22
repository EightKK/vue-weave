import assert from 'node:assert/strict'
import { test } from 'node:test'
import { actualsTimelineBars, levelResources, rescheduleFromActuals, scheduleTasks } from '@eightkk/vue-weave/core'
import { sparseLink as link, task, taskById as byId } from './helpers/builders.mjs'

// Plans with thousands of tasks, kept out of the area files so that node --test runs them in parallel with the rest.
const range = { start: 0, end: 100 }
const sub = (id, duration, parentId, fields = {}) => ({ id, duration, parentId, ...fields })
const span = item => [item.start, item.end]
const on = (resourceId, ...ids) => ids.map(taskId => ({ resourceId, taskId }))
const withoutTrace = ({ trace, ...rest }) => rest

test('a 12,000-task chain with actuals is rescheduled without recursion', () => {
  const count = 12000
  const tasks = [], dependencies = []
  for (let i = 0; i < count; i++) {
    tasks.push(task('c' + i, 1))
    if (i) dependencies.push(link('c' + (i - 1), 'c' + i))
  }
  const input = { range: { start: 0, end: count + 20 }, tasks, dependencies }
  const actuals = new Map([['c0', { intervals: [{ start: 0, end: 3 }], finished: true }], ['c1', { intervals: [{ start: 3, end: 4 }], remainingWork: 2 }]])
  const result = rescheduleFromActuals(input, 4, actuals)
  assert.equal(result.ok, true)
  assert.deepEqual([span(byId(result, 'c1')), span(byId(result, 'c11999'))], [[3, 6], [count + 3, count + 4]])
  assert.equal(actualsTimelineBars(result).length, count + 1)
})

test('deep summary hierarchies and long chains under a summary are handled without recursion', () => {
  const count = 12000
  const nested = [task('t0', 0)]
  for (let i = 1; i < count; i++) nested.push(task('t' + i, i === count - 1 ? 2 : 0, { parentId: 't' + (i - 1) }))
  const deep = scheduleTasks({ range, tasks: [task('x', 3), ...nested], dependencies: [link('x', 't0')] })
  assert.deepEqual([byId(deep, 't0').start, byId(deep, 't0').end, byId(deep, 't11999').start], [3, 5, 3])
  const chain = [task('S', 0)], links = []
  for (let i = 0; i < count; i++) {
    chain.push(sub('c' + i, 1, 'S'))
    if (i) links.push(link('c' + (i - 1), 'c' + i))
  }
  const long = scheduleTasks({ range: { start: 0, end: count + 10 }, tasks: [...chain, task('y', 1)], dependencies: [...links, link('S', 'y')] })
  assert.deepEqual([byId(long, 'S').start, byId(long, 'S').end, byId(long, 'y').start, byId(long, 'S').critical], [0, count, count, true])
})

test('leveling explains 2,000 tasks on one resource with one capacity reason per delayed task', () => {
  const count = 2000
  const tasks = Array.from({ length: count }, (_, i) => task('t' + i, 1))
  const input = {
    range: { start: 0, end: count + 10 }, tasks, resources: [{ id: 'r', capacity: 1 }],
    assignments: on('r', ...tasks.map(item => item.id)),
  }
  // Each task used to get one reason per earlier reservation, about two million in all, computed in cubic time.
  const result = levelResources(input, { explain: true })
  assert.deepEqual(withoutTrace(result), levelResources(input))
  const capacity = result.trace.reasons.filter(r => r.kind === 'capacity')
  assert.equal(capacity.length, count - 1)
  assert.ok(result.trace.reasons.length <= 5 * count, String(result.trace.reasons.length))
  // Equal tasks are placed in ID order; the last one waits behind all the others in one reason.
  const last = capacity.at(-1)
  assert.deepEqual([last.taskId, last.range, last.relatedTaskIds.length, last.relatedTaskIds[0]], ['t999', { start: 0, end: 1999 }, 1999, 't0'])
})
