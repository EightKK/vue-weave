// An independent model of the scheduling contract in docs/scheduling.md, for the property and oracle tests. It is
// written from the documented semantics only, works one quantum ("tick") at a time and favours obviousness over speed.
// `npm test` runs test/*.test.mjs only, so this directory holds no tests.
//
// The semantics it encodes (docs/scheduling.md, "Date and dependency semantics", "Summary tasks", "Manual and
// inactive tasks", "Split work"):
// - A task with positive work starts on a tick that is working on its calendar and not paused, and consumes
//   `duration / quantum` such ticks; its end is the end of the last one, its `work` the maximal runs of consumed ticks.
//   A milestone (duration 0) is a point that may lie anywhere, also in a break.
// - A link constrains `successorPoint >= predecessorPoint + lag` with FS: finish -> start, SS: start -> start,
//   FF: finish -> finish, SF: start -> finish, in elapsed time.
// - Bounds: start >= startNoEarlierThan, start <= startNoLaterThan, end >= finishNoEarlierThan,
//   end <= finishNoLaterThan, start === fixedStart, end <= deadline, and the task inside the horizon.
// - A summary spans its active leaf subtasks; links into it bind the start of each leaf below it, links from it use
//   the rolled-up dates; its startNoEarlierThan and finishNoLaterThan bind every subtask.
// - A manual task stays at its dates; links into it bind nothing; only the deadline can make it infeasible.
// - Inactive tasks and every link that touches them are ignored.
//
// Every constraint is "a nondecreasing function of one task's start is at least / at most a nondecreasing function of
// another's", so the feasible start assignments form a lattice: the earliest schedule is its least element and can be
// found by plain fixed-point relaxation from below, independent of any ordering of the tasks.

const linkTypes = ['FS', 'SS', 'FF', 'SF']
const fromFinish = type => type === 'FS' || type === 'FF'
const toStart = type => type === 'FS' || type === 'SS'

export function createScheduleModel(input) {
  const q = input.quantum ?? 1
  const R0 = input.range.start, R1 = input.range.end
  const tickCount = Math.round((R1 - R0) / q)
  const time = k => R0 + k * q
  const tickOf = t => Math.round((t - R0) / q)
  const calendars = new Map((input.calendars ?? []).map(calendar => [calendar.id, calendar.periods]))
  const info = new Map(input.tasks.map((task, index) => [task.id, { task, index, children: [] }]))
  for (const task of input.tasks) if (task.parentId !== undefined) info.get(task.parentId).children.push(task.id)

  const ancestorsOf = id => {
    const list = []
    for (let parent = info.get(id).task.parentId; parent !== undefined; parent = info.get(parent).task.parentId) list.push(parent)
    return list
  }
  for (const [id, item] of info) {
    item.ancestors = ancestorsOf(id)
    item.summary = item.children.length > 0
  }
  // Inactive: the flag on the task or an ancestor, or a summary whose subtasks are all inactive (repeated to a fixpoint).
  for (const [, item] of info) item.active = !(item.task.inactive || item.ancestors.some(a => info.get(a).task.inactive))
  for (let changed = true; changed;) {
    changed = false
    for (const [, item] of info) {
      if (item.summary && item.active && item.children.every(child => !info.get(child).active)) {
        item.active = false
        changed = true
      }
    }
  }
  const isActive = id => info.get(id).active
  const activeIds = input.tasks.map(task => task.id).filter(isActive)
  const leafIds = activeIds.filter(id => !info.get(id).summary)
  const isManual = id => !info.get(id).summary && info.get(id).task.manual !== undefined
  const leavesBelow = id => {
    const out = [], stack = [id]
    while (stack.length) {
      const current = stack.pop()
      for (const child of info.get(current).children) {
        if (!isActive(child)) continue
        if (info.get(child).summary) stack.push(child)
        else out.push(child)
      }
    }
    return out.sort((a, b) => info.get(a).index - info.get(b).index)
  }
  for (const id of activeIds) info.get(id).leaves = info.get(id).summary ? leavesBelow(id) : [id]

  /** Ticks [t, t + q) of the task's calendar minus its pauses. */
  const workingOf = task => {
    const periods = calendars.get(task.calendarId ?? input.defaultCalendarId)
    const working = new Uint8Array(tickCount)
    for (let k = 0; k < tickCount; k++) {
      const t = time(k)
      const inCalendar = periods === undefined || periods.some(p => p.start <= t && t + q <= p.end)
      const paused = (task.pauses ?? []).some(p => p.start < t + q && t < p.end)
      working[k] = inCalendar && !paused ? 1 : 0
    }
    return working
  }
  const calendarOnly = task => workingOf({ calendarId: task.calendarId })
  for (const id of leafIds) {
    const item = info.get(id)
    item.working = workingOf(item.task)
    item.calendarWorking = calendarOnly(item.task)
  }

  const runs = ticks => {
    const out = []
    for (const k of ticks) {
      const last = out[out.length - 1]
      if (last && last.end === time(k)) last.end = time(k + 1)
      else out.push({ start: time(k), end: time(k + 1) })
    }
    return out
  }
  /** Working ticks of a leaf inside [from, to), as a count. */
  const workingTicksIn = (working, from, to) => {
    let count = 0
    for (let k = Math.max(0, tickOf(from)); k < Math.min(tickCount, tickOf(to)); k++) count += working[k]
    return count
  }

  /** The dates of a non-manual leaf that starts at `start`, or null when it cannot start or finish there. */
  const place = (id, start, task = info.get(id).task, working = info.get(id).working) => {
    if (task.duration === 0) return { start, end: start, work: [] }
    const k0 = tickOf(start)
    if (k0 < 0 || k0 >= tickCount || !working[k0]) return null
    const need = task.duration / q, used = []
    for (let k = k0; k < tickCount && used.length < need; k++) if (working[k]) used.push(k)
    if (used.length < need) return null
    return { start, end: time(used[used.length - 1] + 1), work: runs(used) }
  }
  const manualDates = id => {
    const { task, working } = info.get(id)
    const used = []
    for (let k = tickOf(task.manual.start); k < tickOf(task.manual.end); k++) if (working[k]) used.push(k)
    return { start: task.manual.start, end: task.manual.end, work: runs(used) }
  }

  const inherited = id => {
    const chain = [info.get(id).task, ...info.get(id).ancestors.map(a => info.get(a).task)]
    const lows = chain.map(t => t.startNoEarlierThan).filter(v => v !== undefined)
    const highs = chain.map(t => t.finishNoLaterThan).filter(v => v !== undefined)
    return { startLow: lows.length ? Math.max(...lows) : undefined, finishHigh: highs.length ? Math.min(...highs) : undefined }
  }
  for (const id of leafIds) info.get(id).bounds = inherited(id)

  /** Names of the bounds that the dates of a leaf break. */
  const unaryViolations = (id, dates) => {
    const { task, bounds } = info.get(id)
    const out = []
    if (input.deadline !== undefined && dates.end > input.deadline) out.push('deadline')
    if (isManual(id)) return out
    if (dates.start < R0 || dates.end > R1) out.push('range')
    if (bounds.startLow !== undefined && dates.start < bounds.startLow) out.push('startNoEarlierThan')
    if (task.startNoLaterThan !== undefined && dates.start > task.startNoLaterThan) out.push('startNoLaterThan')
    if (task.finishNoEarlierThan !== undefined && dates.end < task.finishNoEarlierThan) out.push('finishNoEarlierThan')
    if (bounds.finishHigh !== undefined && dates.end > bounds.finishHigh) out.push('finishNoLaterThan')
    if (task.fixedStart !== undefined && dates.start !== task.fixedStart) out.push('fixedStart')
    return out
  }

  /** Starts of a leaf that satisfy its own bounds, calendar and pauses, ascending. */
  const domainOf = id => {
    if (isManual(id)) return unaryViolations(id, manualDates(id)).length ? [] : [info.get(id).task.manual.start]
    const out = []
    const last = info.get(id).task.duration === 0 ? tickCount : tickCount - 1
    for (let k = 0; k <= last; k++) {
      const dates = place(id, time(k))
      if (dates && unaryViolations(id, dates).length === 0) out.push(time(k))
    }
    return out
  }
  for (const id of leafIds) info.get(id).domain = domainOf(id)

  // Active links with the leaves they bind. Links into a manual leaf bind nothing; a link into a summary binds the
  // start of every non-manual leaf below it.
  const links = (input.dependencies ?? []).filter(link => isActive(link.from) && isActive(link.to)).map(link => ({
    link,
    type: link.type ?? 'FS',
    lag: link.lag ?? 0,
    targets: info.get(link.to).leaves.filter(leaf => !isManual(leaf)),
    manualTargets: info.get(link.to).leaves.filter(isManual),
  }))

  /** Dates of every active task for an assignment of leaf starts (a Map). Manual leaves keep their own dates. */
  const datesFor = starts => {
    const dates = new Map()
    for (const id of leafIds) {
      if (isManual(id)) dates.set(id, manualDates(id))
      else dates.set(id, place(id, starts.get(id)))
    }
    for (const id of activeIds) {
      if (!info.get(id).summary) continue
      const below = info.get(id).leaves.map(leaf => dates.get(leaf))
      dates.set(id, { start: Math.min(...below.map(d => d.start)), end: Math.max(...below.map(d => d.end)), work: [] })
    }
    return dates
  }
  const predPoint = (entry, dates) => fromFinish(entry.type) ? dates.get(entry.link.from).end : dates.get(entry.link.from).start
  const succPoint = (entry, target, dates) => toStart(entry.type) ? dates.get(target).start : dates.get(target).end
  const linkHolds = (entry, target, dates) => succPoint(entry, target, dates) >= predPoint(entry, dates) + entry.lag

  /** Every documented constraint that the dates break, as readable strings. Empty means the plan is valid. */
  const violations = dates => {
    const out = []
    for (const id of leafIds) {
      const d = dates.get(id)
      if (d === null) { out.push(id + ': cannot be placed'); continue }
      for (const name of unaryViolations(id, d)) out.push(id + ': ' + name)
    }
    if (out.length) return out
    for (const entry of links) {
      for (const target of entry.targets) if (!linkHolds(entry, target, dates)) out.push(entry.link.id + ' -> ' + target)
    }
    return out
  }

  /** The links into manual leaves that their dates break, in link order and then subtask input order. */
  const manualConflicts = dates => {
    const out = []
    for (const entry of links) {
      for (const target of entry.manualTargets) {
        if (!linkHolds(entry, target, dates)) out.push({ taskId: target, dependencyId: entry.link.id })
      }
    }
    return out
  }

  /**
   * The least feasible assignment by fixed-point relaxation: every start begins at the smallest value of its domain
   * and is raised to the smallest domain value that satisfies its incoming links until nothing changes. The order in
   * which tasks are visited does not matter for the result. Returns `{ ok: false, taskId }` when a start runs out of
   * its domain, which means that no feasible schedule exists.
   */
  const earliest = () => {
    const starts = new Map()
    for (const id of leafIds) {
      const domain = info.get(id).domain
      if (domain.length === 0) return { ok: false, taskId: id }
      starts.set(id, domain[0])
    }
    const incoming = new Map(leafIds.map(id => [id, links.filter(entry => entry.targets.includes(id))]))
    for (let changed = true; changed;) {
      changed = false
      for (const id of leafIds) {
        if (isManual(id)) continue
        const dates = datesFor(starts)
        const domain = info.get(id).domain
        let index = domain.indexOf(starts.get(id))
        for (; index < domain.length; index++) {
          dates.set(id, place(id, domain[index]))
          if (incoming.get(id).every(entry => linkHolds(entry, id, dates))) break
        }
        if (index === domain.length) return { ok: false, taskId: id }
        if (domain[index] !== starts.get(id)) {
          starts.set(id, domain[index])
          changed = true
        }
      }
    }
    return { ok: true, starts, dates: datesFor(starts) }
  }

  /**
   * The latest dates of the backward pass by relaxation from above, with the earliest project finish `finish` as the
   * upper limit of every end. Links from a summary follow the documented rule: FS and FF bind the finish of every
   * subtask; SS and SF bind only the subtasks whose earliest start is the summary's earliest start.
   */
  const latest = (earliestDates, finish) => {
    const starts = new Map()
    for (const id of leafIds) {
      if (isManual(id)) { starts.set(id, info.get(id).task.manual.start); continue }
      const domain = info.get(id).domain.filter(s => place(id, s).end <= finish)
      info.get(id).latestDomain = domain
      starts.set(id, domain[domain.length - 1])
    }
    // The outgoing constraints of each leaf, as [entry, which point of the leaf the link reads].
    const outgoing = new Map(leafIds.map(id => [id, []]))
    for (const entry of links) {
      const from = entry.link.from
      if (!info.get(from).summary) { outgoing.get(from).push(entry); continue }
      for (const leaf of info.get(from).leaves) {
        if (isManual(leaf)) continue
        if (fromFinish(entry.type) || earliestDates.get(leaf).start === earliestDates.get(from).start) outgoing.get(leaf).push(entry)
      }
    }
    const holdsFrom = (entry, id, own, dates) => {
      const point = fromFinish(entry.type) ? own.end : own.start
      return entry.targets.every(target => succPoint(entry, target, dates) >= point + entry.lag)
    }
    for (let changed = true; changed;) {
      changed = false
      for (const id of leafIds) {
        if (isManual(id)) continue
        const dates = datesFor(starts)
        const domain = info.get(id).latestDomain
        let index = domain.indexOf(starts.get(id))
        for (; index >= 0; index--) {
          const own = place(id, domain[index])
          if (outgoing.get(id).every(entry => holdsFrom(entry, id, own, dates))) break
        }
        if (index < 0) return { ok: false, taskId: id }
        if (domain[index] !== starts.get(id)) {
          starts.set(id, domain[index])
          changed = true
        }
      }
    }
    return { ok: true, starts, dates: datesFor(starts) }
  }

  /**
   * The cycles of the dependency graph as strongly connected groups of active tasks with more than one member or a
   * self-link, by plain reachability. Each link adds an edge; a summary also depends on each of its leaves, and a link
   * into a summary reaches each leaf below it.
   */
  const cyclicGroups = () => {
    const edges = new Map(activeIds.map(id => [id, new Set()]))
    for (const entry of links) {
      edges.get(entry.link.from).add(entry.link.to)
      for (const leaf of info.get(entry.link.to).leaves) edges.get(entry.link.from).add(leaf)
    }
    for (const id of activeIds) if (info.get(id).summary) for (const leaf of info.get(id).leaves) edges.get(leaf).add(id)
    const reach = id => {
      const seen = new Set(), stack = [...edges.get(id)]
      while (stack.length) {
        const next = stack.pop()
        if (seen.has(next)) continue
        seen.add(next)
        stack.push(...edges.get(next))
      }
      return seen
    }
    const reachable = new Map(activeIds.map(id => [id, reach(id)]))
    const groups = [], grouped = new Set()
    for (const id of activeIds) {
      if (grouped.has(id) || !reachable.get(id).has(id)) continue
      const members = activeIds.filter(other => other === id || (reachable.get(id).has(other) && reachable.get(other).has(id)))
      for (const member of members) grouped.add(member)
      groups.push(members)
    }
    return groups
  }

  return {
    q, R0, R1, tickCount, time, tickOf, info, activeIds, leafIds, links, isManual, isActive,
    place, manualDates, datesFor, violations, manualConflicts, earliest, latest, cyclicGroups, workingTicksIn, linkTypes,
  }
}

/**
 * Exhaustive search over every combination of leaf starts of a small plan without summaries or manual tasks. Returns
 * every feasible assignment, so the caller can take componentwise minima and maxima directly from the definition.
 */
export function enumerateSchedules(model) {
  const ids = model.leafIds
  if (ids.some(id => model.isManual(id)) || model.activeIds.length !== ids.length) throw new Error('enumerateSchedules takes plain leaf tasks only')
  if (ids.length === 0) return [new Map()]
  const domains = ids.map(id => model.info.get(id).domain)
  // Each link is checked as soon as both of its tasks have a start: at the depth of the later one.
  const position = new Map(ids.map((id, i) => [id, i]))
  const checksAt = ids.map(() => [])
  for (const entry of model.links) checksAt[Math.max(position.get(entry.link.from), position.get(entry.link.to))].push(entry)
  const point = (dates, first) => first ? dates.start : dates.end
  const solutions = []
  const current = new Map(), placed = new Map()
  const index = [] // backtracking without recursion
  let depth = 0
  index[0] = -1
  while (depth >= 0) {
    index[depth]++
    if (index[depth] >= domains[depth].length) { current.delete(ids[depth]); depth--; continue }
    const id = ids[depth], start = domains[depth][index[depth]]
    current.set(id, start)
    placed.set(id, model.place(id, start))
    const consistent = checksAt[depth].every(entry => {
      const type = entry.type
      const before = point(placed.get(entry.link.from), type === 'SS' || type === 'SF')
      const after = point(placed.get(entry.link.to), type === 'FS' || type === 'SS')
      return after >= before + entry.lag
    })
    if (!consistent) continue
    if (depth === ids.length - 1) {
      solutions.push(new Map(current))
    } else {
      depth++
      index[depth] = -1
    }
  }
  return solutions
}
