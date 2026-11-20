// Internal checks of graph groups, shared by `collapseGraphGroups` and NetworkGraph's group frames so that both report
// the same defect with the same text. Not part of the public entry.
import type { NetworkGroup } from './types.js'
import { duplicateIdError, inContext, invalidIdError, isId, unknownReferenceError } from './ids.js'

/**
 * Checks the group IDs and members in input order: `Invalid graph group ID: <value>`, `Duplicate graph group ID: <id>`,
 * `Unknown node in graph group <group>: <node>` and `Duplicate group member ID: <node> (graph group <group>)`. Returns
 * the groups by ID and the group that lists each node.
 */
export function checkGraphGroups(groups: readonly NetworkGroup[], hasNode: (id: string) => boolean) {
  const byId = new Map<string, NetworkGroup>()
  const memberOf = new Map<string, string>()
  for (const group of groups) {
    const id = group?.id
    if (!isId(id)) throw invalidIdError('graph group', id)
    if (byId.has(id)) throw duplicateIdError('graph group', id)
    byId.set(id, group)
    for (const member of group.nodeIds) {
      if (!hasNode(member)) throw unknownReferenceError('node', 'graph group ' + id, member)
      if (memberOf.has(member)) throw inContext(duplicateIdError('group member', member), 'graph group ' + id)
      memberOf.set(member, id)
    }
  }
  return { byId, memberOf }
}

/** `Unknown parent group in graph group <group>: <parentId>`. */
export function unknownParentGroupError(group: NetworkGroup): Error {
  return unknownReferenceError('parent group', 'graph group ' + group.id, group.parentId)
}

/** `Graph group hierarchy contains a cycle at group: <group>`. */
export function groupCycleError(groupId: string): Error {
  return new Error('Graph group hierarchy contains a cycle at group: ' + groupId)
}

/** `Invalid graph group: <group>`, for a group without any node, also through its nested groups. */
export function emptyGroupError(groupId: string): Error {
  return new Error('Invalid graph group: ' + groupId)
}
