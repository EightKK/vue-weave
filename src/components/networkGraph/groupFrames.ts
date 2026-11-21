// NetworkGraph group frames: the checked group hierarchy in paint order and the frame rectangle of each group.
import type { GraphBox } from '../../core/graph.js'
import type { NetworkGroup } from '../../core/types.js'
import { checkGraphGroups, emptyGroupError, groupCycleError, unknownParentGroupError } from '../../core/graphGroupChecks.js'

/** A group with every node it frames (`members`, including those of nested groups), its depth and its parent's label. */
export type GroupShape = NetworkGroup & { members: string[]; depth: number; parentLabel?: string }
/** The group hierarchy as lookups: position in the paint order, child groups in that order, and the group that lists a node among its own `nodeIds`. */
export type GroupTree = {
  index: Map<string, number>; byId: Map<string, GroupShape>; children: Map<string, GroupShape[]>; ofNode: Map<string, string>
}
export type GroupBounds = { left: number; top: number; right: number; bottom: number }
export type GroupRect = { x: number; y: number; width: number; height: number }

/**
 * Checks the groups (unique IDs, known and unrepeated members, known parents, no cycles, no empty group) and returns
 * them in preorder with input-order siblings, which paints parents before their children.
 */
export function groupShapes(list: readonly NetworkGroup[], hasNode: (id: string) => boolean): GroupShape[] {
  const { byId } = checkGraphGroups(list, hasNode)
  const children = new Map<string, NetworkGroup[]>()
  const roots: NetworkGroup[] = []
  for (const group of list) {
    if (group.parentId === undefined) {
      roots.push(group)
      continue
    }
    if (!byId.has(group.parentId)) throw unknownParentGroupError(group)
    let siblings = children.get(group.parentId)
    if (!siblings) children.set(group.parentId, siblings = [])
    siblings.push(group)
  }
  for (const group of list) {
    let current = group, steps = 0
    while (current.parentId !== undefined) {
      current = byId.get(current.parentId)!
      if (current === group || ++steps > list.length) throw groupCycleError(group.id)
    }
  }
  const order: { group: NetworkGroup; depth: number }[] = []
  const stack = roots.map(group => ({ group, depth: 0 })).reverse()
  while (stack.length) {
    const item = stack.pop()!
    order.push(item)
    const nested = children.get(item.group.id) ?? []
    for (let i = nested.length - 1; i >= 0; i--) stack.push({ group: nested[i]!, depth: item.depth + 1 })
  }
  const effective = new Map<string, string[]>()
  for (let i = order.length - 1; i >= 0; i--) {
    const group = order[i]!.group
    const all = [...group.nodeIds]
    for (const child of children.get(group.id) ?? []) for (const id of effective.get(child.id)!) all.push(id)
    if (!all.length) throw emptyGroupError(group.id)
    effective.set(group.id, all)
  }
  return order.map(({ group, depth }) => ({
    ...group, members: effective.get(group.id)!, depth,
    parentLabel: group.parentId === undefined ? undefined : byId.get(group.parentId)!.label,
  }))
}

/** The lookups of a list from `groupShapes`. */
export function groupTree(list: readonly GroupShape[]): GroupTree {
  const index = new Map<string, number>(), byId = new Map<string, GroupShape>()
  const children = new Map<string, GroupShape[]>(), ofNode = new Map<string, string>()
  list.forEach((group, i) => {
    index.set(group.id, i)
    byId.set(group.id, group)
    for (const id of group.nodeIds) ofNode.set(id, group.id)
    if (group.parentId === undefined) return
    const siblings = children.get(group.parentId)
    if (siblings) siblings.push(group)
    else children.set(group.parentId, [group])
  })
  return { index, byId, children, ofNode }
}

/** The group that lists a node and that group's ancestors, added to `into` until a group already in it. */
export function addGroupChain(tree: GroupTree, groupId: string | undefined, into: Set<string>) {
  for (let group = groupId; group !== undefined && !into.has(group); group = tree.byId.get(group)!.parentId) into.add(group)
}

/** The bounds of the nodes a group frames itself: all members, or for a parent only its own nodes. */
export function groupBounds(group: GroupShape, boxes: ReadonlyMap<string, GraphBox>, tree: GroupTree): GroupBounds {
  let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity
  for (const id of tree.children.has(group.id) ? group.nodeIds : group.members) {
    const box = boxes.get(id)!
    left = Math.min(left, box.x)
    top = Math.min(top, box.y)
    right = Math.max(right, box.x + box.width)
    bottom = Math.max(bottom, box.y + box.height)
  }
  return { left, top, right, bottom }
}

/** A group frame: its nodes with padding and a label strip, clamped to the layout, and for a parent also its children. */
export function groupRect(
  group: GroupShape, bounds: GroupBounds, width: number, height: number, tree: GroupTree, rectOf: (id: string) => GroupRect,
): GroupRect {
  const { left, top, right, bottom } = bounds
  const x = Math.max(0, left - 10), y = Math.max(0, top - 23)
  let x1 = Math.min(width, right + 10), y1 = Math.min(height, bottom + 10)
  let x0 = x, y0 = y
  const nested = tree.children.get(group.id)
  if (nested) {
    // A parent encloses its children, the label strip of each child and the padding around them.
    if (left === Infinity) { x0 = Infinity; y0 = Infinity; x1 = -Infinity; y1 = -Infinity }
    for (const child of nested) {
      const rect = rectOf(child.id)
      x0 = Math.min(x0, rect.x - 10)
      y0 = Math.min(y0, rect.y - 23)
      x1 = Math.max(x1, rect.x + rect.width + 10)
      y1 = Math.max(y1, rect.y + rect.height + 10)
    }
  }
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 }
}
