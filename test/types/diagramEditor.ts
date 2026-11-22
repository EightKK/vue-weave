// Type-level checks for the diagram editor parts (GraphPalette, PropertyInspector, readPaletteDrop). Checked by
// `npm run typecheck`.
import { h } from 'vue'
import {
  GraphPalette, PropertyInspector, graphPaletteMimeType, readPaletteDrop,
  type GraphDrop, type GraphPaletteDrop, type GraphPaletteExposed, type GraphPaletteItem, type InspectorChange, type InspectorField,
  type InspectorFieldKind, type InspectorListChange, type InspectorListField, type NetworkNode, type PropertyInspectorExposed, type PropertyInspectorFieldSlot, type TimelineDrop,
} from '../../src'
import type { GraphPaletteItem as CoreItem, InspectorField as CoreField } from '../../src/core/index'

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false
function assertType<T extends true>(value?: T) { return value }

interface Kind { kind: 'task' | 'event' }
const items: GraphPaletteItem<Kind>[] = [{ id: 'step', label: 'Step', shape: 'rounded', tone: 'teal', section: 'Flow', data: { kind: 'task' } }]
const coreItem: CoreItem = { id: 'x', label: 'X' }
// @ts-expect-error not a node shape
const star: GraphPaletteItem = { id: 's', label: 'S', shape: 'star' }

const palette = new GraphPalette({ items })
type ItemSlot = Parameters<NonNullable<typeof palette.$slots.item>>[0]
assertType<Equal<ItemSlot['item']['data'], Kind | undefined>>()
assertType<Equal<Parameters<NonNullable<typeof palette.$props.onInsert>>[0], GraphPaletteItem<Kind>>>()
const paletteRef = undefined as GraphPaletteExposed | undefined
void paletteRef?.focusItem('step')

type Node = NetworkNode<{ accent: string }>
const node: Node = { id: 'a', label: 'A', data: { accent: '#ff0000' } }
const fields: InspectorField<Node>[] = [
  { id: 'label', kind: 'text', label: 'Label', get: item => item.label, required: true },
  { id: 'accent', kind: 'color', label: 'Accent', get: item => item.data?.accent ?? null },
  { id: 'tone', kind: 'select', label: 'Tone', get: item => item.tone ?? null, choices: [{ value: 'teal' }] },
]
const coreField: CoreField = { id: 'x', kind: 'checkbox', label: 'X', get: item => item.id === 'x' }
const kind: InspectorFieldKind = 'color'
// @ts-expect-error not an inspector field kind
const slider: InspectorFieldKind = 'slider'
// @ts-expect-error the item has no `missing` field
const wrong: InspectorField<Node> = { id: 'w', kind: 'text', label: 'W', get: item => item.missing }

const inspector = new PropertyInspector({ item: node, fields })
type FieldSlot = Parameters<NonNullable<typeof inspector.$slots['field-label']>>[0]
assertType<Equal<FieldSlot, PropertyInspectorFieldSlot<Node>>>()
assertType<Equal<Parameters<NonNullable<typeof inspector.$props.onChange>>[0], InspectorChange>>()
const inspectorRef = undefined as PropertyInspectorExposed<Node> | undefined
inspectorRef?.focusField('label')
inspectorRef?.cancelEdits()
void h(PropertyInspector, { item: null, fields: [] })

// List fields sit in `fields` beside value fields and report through `list-change`; `change` keeps FieldValue.
interface Task { id: string; crew: { resourceId: string; units: number }[] }
const taskFields: (InspectorField<Task> | InspectorListField<Task>)[] = [
  { id: 'id', kind: 'text', label: 'ID', get: item => item.id },
  { id: 'crew', kind: 'assignments', label: 'Crew', get: item => item.crew, options: [{ value: 'crane', label: 'Crane' }], maxUnits: 2 },
  { id: 'links', kind: 'dependencies', label: 'Links', get: () => [{ predecessorId: 'a', type: 'SS', lag: 0 }], options: [{ value: 'a' }] },
]
// @ts-expect-error not a dependency type
const badLink: InspectorListField<Task> = { id: 'l', kind: 'dependencies', label: 'L', get: () => [{ predecessorId: 'a', type: 'XX', lag: 0 }], options: [] }
const taskInspector = new PropertyInspector({ item: { id: 't', crew: [] } as Task, fields: taskFields })
assertType<Equal<Parameters<NonNullable<(typeof taskInspector.$props)['onList-change']>>[0], InspectorListChange>>()
assertType<Equal<Parameters<NonNullable<typeof taskInspector.$props.onChange>>[0], InspectorChange>>()
void badLink
void h(GraphPalette, { items: [], searchable: true })

declare const graphDrop: GraphDrop
declare const timelineDrop: TimelineDrop
declare const transfer: DataTransfer
const fromGraph: GraphPaletteDrop | undefined = readPaletteDrop(graphDrop)
readPaletteDrop(timelineDrop)
readPaletteDrop(transfer)
readPaletteDrop(null)
const mime: string = graphPaletteMimeType

void [coreItem, star, coreField, kind, slider, wrong, fromGraph, mime]
