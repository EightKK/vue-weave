import type { GraphEdge, TreeGridRow } from '../../src'

// Deterministic data and model of the BOM editor showcase: a small family of centrifugal pumps (invented products, no
// real brands) as an item master and BOM lines. The lines are the source of truth; the tree grid shows them expanded
// into usage positions, so a shared subassembly appears under every parent that uses it, and an edit of one of its
// lines changes all of those places. Every walk here is a loop, so deep or long structures are fine.

export type Unit = 'pcs' | 'm' | 'kg' | 'L'
export type Sourcing = 'make' | 'buy'

export interface Item { id: string; pn: string; name: string; unit: Unit; rev: string; source: Sourcing }
/** One BOM line: `qty` of `child` at position `pos` of the assembly `parent`, effective from `from` (midnight UTC). */
export interface Line { id: string; parent: string; child: string; pos: number; qty: number; from: number }
export interface Bom {
  items: readonly Item[]
  lines: readonly Line[]
  /** The products: the top-level rows, in display order. */
  roots: readonly string[]
}

/** What a grid row shows: the item's fields, and the line's fields for every row but a product. */
export interface UsageData {
  itemId: string
  lineId?: string
  parentItemId?: string
  pn: string
  name: string
  unit: Unit
  rev: string
  source: Sourcing
  pos?: number
  qty?: number
  from?: number
  /** Quantity per unit of the row's product: the product of the quantities on the path. */
  ext: number
  /** A row of revision A that revision B removed, shown while comparing. */
  ghost?: boolean
}
export type UsageRow = TreeGridRow<UsageData> & { data: UsageData }

export const day = 86_400_000
const two = (value: number) => String(value).padStart(2, '0')
export const formatDate = (value: unknown) => {
  if (typeof value !== 'number') return ''
  const date = new Date(value)
  return `${date.getUTCFullYear()}-${two(date.getUTCMonth() + 1)}-${two(date.getUTCDate())}`
}
export const parseDate = (text: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text.trim())
  if (!match) return { error: 'Use the format YYYY-MM-DD' }
  const time = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  return formatDate(time) === text.trim() ? time : { error: 'Not a calendar date: ' + text.trim() }
}
/** Quantities with up to three decimals and no trailing zeros. */
export const formatQty = (value: number) => String(Math.round(value * 1000) / 1000)

// ---- item master: "part number|name|unit|revision|make or buy" ----
const itemTable = `CP-50|Centrifugal pump CP-50|pcs|D|make
BS-250|Booster set 2 × CP-50|pcs|B|make
CP-80|Centrifugal pump CP-80|pcs|C|make
PE-50|Pump end 50|pcs|D|make
PE-80|Pump end 80|pcs|C|make
VC-50|Volute casing assembly 50|pcs|C|make
VC-80|Volute casing assembly 80|pcs|B|make
CAS-50|Volute casing 50, machined|pcs|C|make
CAS-80|Volute casing 80, machined|pcs|B|make
RA-50|Rotating assembly 50|pcs|C|make
RA-80|Rotating assembly 80|pcs|B|make
IMP-50|Impeller assembly 160|pcs|B|make
IMP-80|Impeller assembly 200|pcs|B|make
SH-35|Shaft assembly 35|pcs|E|make
SC-35|Seal cartridge 35|pcs|C|make
BH-35|Bearing housing assembly 35|pcs|D|make
MT-4|Motor unit 4 kW|pcs|B|make
MT-7|Motor unit 7.5 kW|pcs|B|make
TB-1|Terminal box kit|pcs|C|make
FAN-112|Cooling fan kit 112|pcs|A|make
FAN-132|Cooling fan kit 132|pcs|A|make
BP-50|Baseplate assembly 50|pcs|B|make
BP-80|Baseplate assembly 80|pcs|B|make
BPF-50|Baseplate frame 50|pcs|B|make
BPF-80|Baseplate frame 80|pcs|B|make
AVM-1|Anti-vibration mount kit|pcs|A|make
LE-1|Lifting eye kit|pcs|A|make
CPL-24|Coupling assembly 24|pcs|C|make
GD-24|Coupling guard 24|pcs|B|make
PK-50|Packaging kit 50|pcs|A|make
PK-80|Packaging kit 80|pcs|A|make
DOC-1|Documentation set|pcs|F|make
MF-80|Manifold assembly DN80|pcs|B|make
CTL-2|Control panel, duplex|pcs|C|make
FRM-2|Skid frame, duplex|pcs|A|make
RC-50|Raw casting, volute 50|pcs|C|buy
RC-80|Raw casting, volute 80|pcs|B|buy
CVR-50|Casing cover 50|pcs|B|buy
CVR-80|Casing cover 80|pcs|B|buy
HB-1040|Hex bolt M10×40|pcs|A|buy
HB-1250|Hex bolt M12×50|pcs|A|buy
HB-0820|Hex bolt M8×20|pcs|A|buy
HB-1230|Hex bolt M12×30|pcs|A|buy
HB-1660|Hex bolt M16×60|pcs|A|buy
STUD-8|Stud M8×25|pcs|A|buy
HN-10|Hex nut M10|pcs|A|buy
HN-16|Hex nut M16|pcs|A|buy
WS-6|Washer M6|pcs|A|buy
WS-10|Washer M10|pcs|A|buy
WS-12|Washer M12|pcs|A|buy
WS-16|Lock washer M16|pcs|A|buy
SS-6|Set screw M6×8|pcs|A|buy
SCR-4|Screw M4×12|pcs|A|buy
SCR-5|Screw M5×10|pcs|A|buy
SCR-6|Screw M6×12|pcs|A|buy
GK-50|Casing gasket 50|pcs|B|buy
GK-80|Casing gasket 80|pcs|B|buy
VP-1|Vent plug G1/8|pcs|A|buy
WL-1|Warning label, hot surface|pcs|A|buy
IMC-160|Impeller casting 160|pcs|C|buy
IMC-200|Impeller casting 200|pcs|B|buy
WR-160|Wear ring 160, bronze|pcs|B|buy
WR-200|Wear ring 200, bronze|pcs|B|buy
WR-200P|Wear ring 200, polymer|pcs|A|buy
BAL-1|Balancing weight|pcs|A|buy
KEY-8|Key 8×7×30|pcs|A|buy
KEY-6|Key 6×6×25|pcs|A|buy
NUT-16|Impeller nut M16|pcs|A|buy
SHB-40|Shaft bar Ø40, stainless|m|B|buy
SLV-35|Shaft sleeve 35|pcs|B|buy
OR-30|O-ring 30×3, NBR|pcs|A|buy
OR-42|O-ring 42×3, EPDM|pcs|A|buy
OR-42F|O-ring 42×3, FKM|pcs|A|buy
MS-35|Mechanical seal 35, carbon/SiC|pcs|C|buy
MS-35X|Mechanical seal 35, SiC/SiC|pcs|A|buy
GL-35|Seal gland 35|pcs|B|buy
BHC-35|Bearing housing casting 35|pcs|C|buy
BRG-6207|Ball bearing 6207-2Z|pcs|A|buy
BRG-3207|Angular contact bearing 3207|pcs|A|buy
LS-35|Lip seal 35×52|pcs|A|buy
CIR-72|Circlip 72|pcs|A|buy
GRS-1|Bearing grease|kg|A|buy
DP-B|Drain plug G1/4, brass|pcs|A|buy
DP-S|Drain plug G1/4, stainless|pcs|A|buy
NP-1|Nameplate|pcs|B|buy
PNT-B|Paint, signal blue|L|A|buy
MOT-4|Motor IE3 4 kW 112M|pcs|B|buy
MOT-7|Motor IE3 7.5 kW 132M|pcs|B|buy
TBX-1|Terminal box housing|pcs|A|buy
TBL-6|Terminal block, 6-pole|pcs|A|buy
CG-20|Cable gland M20|pcs|A|buy
GK-TB|Terminal box gasket|pcs|A|buy
FN-112|Fan impeller 112|pcs|A|buy
FN-132|Fan impeller 132|pcs|A|buy
FC-112|Fan cowl 112|pcs|A|buy
FC-132|Fan cowl 132|pcs|A|buy
UPN-100|Steel channel UPN 100|m|A|buy
PL-10|Steel plate 10 mm|kg|A|buy
AVM-50|Rubber mount 50 Shore A|pcs|A|buy
SHM-1|Shim set|pcs|A|buy
EYE-12|Eye bolt M12|pcs|A|buy
CH-24A|Coupling hub, pump side|pcs|B|buy
CH-24B|Coupling hub, motor side|pcs|B|buy
SPD-24|Spider element 24|pcs|A|buy
GDS-24|Guard sheet 24|pcs|B|buy
PAL-1|Pallet 800×600|pcs|A|buy
PAL-2|Pallet 1200×800|pcs|A|buy
CRT-50|Crate 50|pcs|A|buy
CRT-80|Crate 80|pcs|A|buy
FOIL|Stretch film|m|A|buy
VCI|Corrosion inhibitor bag|pcs|A|buy
MAN-1|Operating manual|pcs|F|buy
DEC-1|Declaration of conformity|pcs|C|buy
PIPE-80|Header pipe DN80|m|A|buy
CV-50|Check valve DN50|pcs|A|buy
BV-50|Ball valve DN50|pcs|A|buy
FLG-80|Weld flange DN80|pcs|A|buy
GK-F80|Flange gasket DN80|pcs|A|buy
ENC-1|Enclosure 400×300|pcs|A|buy
VFD-4|Frequency drive 4 kW|pcs|B|buy
PLC-1|Pump controller|pcs|C|buy
PT-16|Pressure transmitter 16 bar|pcs|A|buy
CBL-1|Control cable 7×1.5|m|A|buy`

// ---- BOM lines of revision A: "assembly: position part [quantity], …"; the quantity defaults to 1 ----
const lineTable = `CP-50: 10 PE-50, 20 MT-4, 30 BP-50, 40 CPL-24, 50 GD-24, 60 PK-50, 70 DOC-1
BS-250: 10 CP-50 2, 20 MF-80, 30 CTL-2, 40 FRM-2, 50 AVM-1 6, 60 DOC-1, 70 FOIL 12
CP-80: 10 PE-80, 20 MT-7, 30 BP-80, 40 CPL-24, 50 GD-24, 60 PK-80, 70 DOC-1
PE-50: 10 VC-50, 20 RA-50, 30 SC-35, 40 BH-35, 50 DP-B, 60 NP-1, 70 PNT-B 0.4
PE-80: 10 VC-80, 20 RA-80, 30 SC-35, 40 BH-35, 50 DP-S, 60 NP-1, 70 PNT-B 0.6, 80 LE-1
VC-50: 10 CAS-50, 20 CVR-50, 30 HB-1040 8, 40 GK-50, 50 WS-10 8, 60 VP-1
VC-80: 10 CAS-80, 20 CVR-80, 30 HB-1250 10, 40 HB-1250 4, 50 GK-80, 60 WS-12 14, 70 VP-1, 80 WL-1
CAS-50: 10 RC-50, 20 STUD-8 4
CAS-80: 10 RC-80, 20 STUD-8 6
RA-50: 10 IMP-50, 20 SH-35, 30 KEY-8, 40 NUT-16, 50 WS-16
RA-80: 10 IMP-80, 20 SH-35, 30 KEY-8, 40 NUT-16, 50 WS-16
IMP-50: 10 IMC-160, 20 WR-160, 30 BAL-1 2
IMP-80: 10 IMC-200, 20 WR-200, 30 BAL-1 3
SH-35: 10 SHB-40 0.62, 20 SLV-35, 30 OR-30, 40 KEY-6
SC-35: 10 MS-35, 20 GL-35, 30 OR-42 2, 40 SS-6 3, 50 HB-0820 4
BH-35: 10 BHC-35, 20 BRG-6207, 30 BRG-3207, 40 LS-35 2, 50 CIR-72, 60 GRS-1 0.05, 70 HB-0820 4
MT-4: 10 MOT-4, 20 TB-1, 30 FAN-112
MT-7: 10 MOT-7, 20 TB-1, 30 FAN-132
TB-1: 10 TBX-1, 20 TBL-6, 30 CG-20 2, 40 SCR-4 4, 50 GK-TB
FAN-112: 10 FN-112, 20 FC-112, 30 SCR-5 4
FAN-132: 10 FN-132, 20 FC-132, 30 SCR-5 4
BP-50: 10 BPF-50, 20 AVM-1 4, 30 HB-1230 4, 40 SHM-1
BP-80: 10 BPF-80, 20 AVM-1 6, 30 HB-1230 4, 40 SHM-1 2
BPF-50: 10 UPN-100 2.4, 20 PL-10 6.5, 30 PNT-B 0.8
BPF-80: 10 UPN-100 3.1, 20 PL-10 9.2, 30 PNT-B 1.1
AVM-1: 10 AVM-50, 20 HN-10 2, 30 WS-10 2
LE-1: 10 EYE-12 2, 20 WS-12 2
CPL-24: 10 CH-24A, 20 CH-24B, 30 SPD-24, 40 SS-6 2
GD-24: 10 GDS-24, 20 SCR-6 4, 30 WS-6 4
PK-50: 10 PAL-1, 20 CRT-50, 30 FOIL 3.5, 40 VCI
PK-80: 10 PAL-2, 20 CRT-80, 30 FOIL 5, 40 VCI 2
DOC-1: 10 MAN-1, 20 DEC-1
MF-80: 10 PIPE-80 1.6, 20 CV-50 2, 30 BV-50 2, 40 FLG-80 4, 50 GK-F80 4, 60 HB-1660 16, 70 HN-16 16
CTL-2: 10 ENC-1, 20 VFD-4 2, 30 PLC-1, 40 PT-16 2, 50 CBL-1 12, 60 CG-20 6
FRM-2: 10 UPN-100 6.2, 20 PL-10 18, 30 PNT-B 2.2`

/** Approved alternate parts: a second relation kind, symmetric (the edge direction carries no meaning). */
export const alternates: readonly { id: string; from: string; to: string }[] = [
  { id: 'alt-dp', from: 'DP-S', to: 'DP-B' },
  { id: 'alt-ms', from: 'MS-35', to: 'MS-35X' },
  { id: 'alt-or', from: 'OR-42', to: 'OR-42F' },
]

export const released = Date.UTC(2025, 0, 6)
const items: Item[] = itemTable.split('\n').map((line) => {
  const [pn, name, unit, rev, source] = line.split('|') as [string, string, Unit, string, Sourcing]
  return { id: pn, pn, name, unit, rev, source }
})
let lineCount = 0
const lines: Line[] = lineTable.split('\n').flatMap((text) => {
  const [parent, list] = text.split(': ') as [string, string]
  return list.split(', ').map((entry) => {
    const [pos, child, qty] = entry.split(' ') as [string, string, string?]
    return { id: 'L' + String(++lineCount).padStart(3, '0'), parent, child, pos: Number(pos), qty: qty ? Number(qty) : 1, from: released }
  })
})

/** Revision A: the released structure. */
export const revisionA: Bom = { items, lines, roots: ['CP-80', 'CP-50', 'BS-250'] }

const lineAt = (bom: Bom, parent: string, pos: number) => bom.lines.find(line => line.parent === parent && line.pos === pos)!
/**
 * Revision B, the change in work: one of the two M12 bolt usages of the CP-80 casing takes 6 instead of 4, the bronze
 * wear ring of the 200 mm impeller is replaced by a polymer one, the warning label line is removed and the lifting eye
 * kit moves from the pump end to the baseplate.
 */
export const revisionB: Bom = (() => {
  const bolt = lineAt(revisionA, 'VC-80', 40).id, ring = lineAt(revisionA, 'IMP-80', 20).id
  const label = lineAt(revisionA, 'VC-80', 80).id, eyes = lineAt(revisionA, 'PE-80', 80)
  const kept = revisionA.lines.filter(line => line.id !== label && line.id !== eyes.id).map(line =>
    line.id === bolt ? { ...line, qty: 6 } : line.id === ring ? { ...line, child: 'WR-200P', from: Date.UTC(2026, 2, 2) } : line)
  const at = kept.findIndex(line => line.parent === 'BP-80' && line.pos === 40) + 1
  return { ...revisionA, lines: [...kept.slice(0, at), { ...eyes, parent: 'BP-80' }, ...kept.slice(at)] }
})()

export const itemMap = (bom: Bom) => new Map(bom.items.map(item => [item.id, item]))
export function linesByParent(bom: Bom) {
  const map = new Map<string, Line[]>()
  for (const line of bom.lines) {
    const list = map.get(line.parent)
    if (list) list.push(line)
    else map.set(line.parent, [line])
  }
  return map
}

/**
 * Expands the BOM into grid rows in tree preorder. A row's ID is its usage key: the product's item ID for a product,
 * the line ID when the line's assembly appears once in the expansion, and otherwise the parent row's ID, a slash and
 * the line ID. So the rows of a shared subassembly get one ID per place, while a line under assemblies that appear
 * once keeps its ID when it moves, which lets `diffStructure` report a move instead of a removal and an addition.
 */
export function expandBom(bom: Bom): UsageRow[] {
  const byId = itemMap(bom), children = linesByParent(bom)
  interface Draft { item: Item; line?: Line; parent?: Draft; ext: number; row?: UsageRow }
  const drafts: Draft[] = []
  const counts = new Map<string, number>()
  for (const root of bom.roots) {
    const stack: { draft: Draft; ancestors: ReadonlySet<string> }[] = [{ draft: { item: byId.get(root)!, ext: 1 }, ancestors: new Set() }]
    while (stack.length) {
      const { draft, ancestors } = stack.pop()!
      drafts.push(draft)
      counts.set(draft.item.id, (counts.get(draft.item.id) ?? 0) + 1)
      // The editor rejects cycles; the guard keeps a broken input from looping.
      if (ancestors.has(draft.item.id)) continue
      const next = new Set(ancestors).add(draft.item.id)
      const list = children.get(draft.item.id) ?? []
      for (let i = list.length - 1; i >= 0; i--) {
        const line = list[i]!
        stack.push({ draft: { item: byId.get(line.child)!, line, parent: draft, ext: draft.ext * line.qty }, ancestors: next })
      }
    }
  }
  return drafts.map((draft) => {
    const { item, line, parent } = draft
    const id = !parent ? item.id : counts.get(parent.item.id) === 1 ? line!.id : parent.row!.id + '/' + line!.id
    const data: UsageData = {
      itemId: item.id, pn: item.pn, name: item.name, unit: item.unit, rev: item.rev, source: item.source, ext: draft.ext,
      ...line && { lineId: line.id, parentItemId: line.parent, pos: line.pos, qty: line.qty, from: line.from },
    }
    draft.row = {
      id, label: item.name, ...parent && { parentId: parent.row!.id }, data,
      detail: line ? `${item.pn}, position ${line.pos}` : item.pn, entities: [{ kind: 'item', id: item.id }],
    }
    return draft.row
  })
}

/** The record of a row that `diffStructure` compares: the usage key, its parent and the shown fields. */
export const usageRecord = (row: UsageRow) => ({
  key: row.id, parent: row.parentId, pos: row.data.pos, pn: row.data.pn, name: row.data.name, qty: row.data.qty,
  unit: row.data.unit, rev: row.data.rev, source: row.data.source, from: row.data.from,
})
export const comparedFields = ['pos', 'pn', 'name', 'qty', 'unit', 'rev', 'source', 'from'] as const

/**
 * Total quantity of every item in one unit of `productId`, the quantity explosion. Demo code, not library behaviour:
 * the items are visited in topological order (Kahn's algorithm over the lines reachable from the product), so a shared
 * subassembly is complete before its lines pass its total on, and each total is the sum over all paths.
 */
export function explodeBom(bom: Bom, productId: string): Map<string, number> {
  const children = linesByParent(bom)
  const reached = new Set([productId]), queue = [productId]
  for (let i = 0; i < queue.length; i++) {
    for (const line of children.get(queue[i]!) ?? []) if (!reached.has(line.child)) { reached.add(line.child); queue.push(line.child) }
  }
  const incoming = new Map<string, number>()
  for (const id of reached) for (const line of children.get(id) ?? []) incoming.set(line.child, (incoming.get(line.child) ?? 0) + 1)
  const totals = new Map<string, number>([[productId, 1]])
  const ready = [productId]
  while (ready.length) {
    const id = ready.shift()!
    for (const line of children.get(id) ?? []) {
      totals.set(line.child, (totals.get(line.child) ?? 0) + totals.get(id)! * line.qty)
      const left = incoming.get(line.child)! - 1
      incoming.set(line.child, left)
      if (left === 0) ready.push(line.child)
    }
  }
  totals.delete(productId)
  return totals
}

export interface ItemEdge extends GraphEdge { kind: 'structure' | 'alternate' }
/** The item graph: every item, one structure edge per line (parent to child) and the alternate links. */
export const itemGraph = (bom: Bom): { nodes: readonly Item[]; edges: ItemEdge[] } => ({
  nodes: bom.items,
  edges: [
    ...bom.lines.map(line => ({ id: line.id, from: line.parent, to: line.child, kind: 'structure' as const })),
    ...alternates.map(link => ({ ...link, kind: 'alternate' as const })),
  ],
})
