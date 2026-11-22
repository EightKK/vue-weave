// Type-level checks for diffStructure and projectTimelineRows. Checked by `npm run typecheck`.
import {
  createTimelineViewState, diffStructure, projectTimelineRows, type StructureDiff, type StructureDiffOptions,
  type TimelineColumn, type TimelineRowsProjection, type TimelineRowViewState, type TimelineViewState,
} from '../../src/core/index'

interface Part {
  id: string
  parentId?: string
  name: string
  qty: number
}

declare const before: readonly Part[]
declare const after: Part[]

// Property names and functions are both accepted as accessors.
const byName: StructureDiff = diffStructure(before, after, { key: 'id', parentKey: 'parentId', fields: ['name', 'qty'] })
const byFunction = diffStructure(before, after, {
  key: part => part.id, parentKey: part => part.parentId, fields: part => ({ total: part.qty }),
  equals: (a, b, field) => field === 'total' ? a === b : Object.is(a, b),
})
const move = byFunction.moved[0]
if (move) {
  const parent: string | undefined = move.afterParent
  void parent
}
const value: unknown = byName.changed[0]?.fields[0]?.before
void value

// @ts-expect-error the result is read-only data
byName.added.push('x')

// @ts-expect-error a field list names properties of the item
diffStructure(before, after, { key: 'id', fields: ['quantity'] })

// @ts-expect-error a key accessor names a property of the item
diffStructure(before, after, { key: 'code' })

// @ts-expect-error the key is required
const missingKey: StructureDiffOptions<Part> = { fields: ['qty'] }
void missingKey

// The row projection takes a whole view state or only its row part.
interface TaskRow { id: string; parentId?: string; label: string; owner: string }
declare const rows: readonly TaskRow[]
declare const columns: readonly TimelineColumn<TaskRow>[]
const state: TimelineViewState = createTimelineViewState(columns)
const rowState: TimelineRowViewState = { search: { text: 'a' }, sort: [], collapsedIds: [] }
const projected: TimelineRowsProjection<TaskRow> = projectTimelineRows({ rows, columns }, state)
const owner: string | undefined = projectTimelineRows({ rows, sortRules: { owner: (a, b) => a.owner.localeCompare(b.owner) } }, rowState).rows[0]?.owner
void projected
void owner

// @ts-expect-error the sort is part of the row state
projectTimelineRows({ rows }, { search: { text: '' }, collapsedIds: [] })
