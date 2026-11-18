import type { GraphEdge, NetworkNode, TimelineBar, TimelineDependency, TimelineRow } from '../src'

export const minute = 60_000
export const hour = 60 * minute
export const day = 24 * hour
export const origin = Date.parse('2026-11-09T08:00:00Z')
export const range = { start: origin, end: origin + 9 * hour }
export const formatTime = (value: number) => new Date(value).toISOString().slice(11, 16)

export interface ExampleData {
  nodes: NetworkNode[]
  edges: GraphEdge[]
  rows: TimelineRow[]
  /** A bar's `data` is the ID of the graph node it belongs to, so the chart and the graph select together. */
  bars: TimelineBar<string>[]
  dependencies: TimelineDependency[]
}

export function makeExample(name: string): ExampleData {
  if (name === 'large') {
    // 150 ranks of 25 nodes: 3,750 nodes and about 7,400 edges, far wider than one viewport.
    const ranks = 150, perRank = 25
    const nodes: NetworkNode[] = [], edges: GraphEdge[] = []
    for (let rank = 0; rank < ranks; rank++) {
      for (let row = 0; row < perRank; row++) {
        const id = `n-${rank}-${row}`
        nodes.push({ id, label: 'Node ' + (rank * perRank + row + 1), detail: 'Rank ' + (rank + 1), tone: (['blue', 'teal', 'amber', 'violet'] as const)[(rank + row) % 4] })
        if (rank === ranks - 1) continue
        edges.push({ id: id + '>a', from: id, to: `n-${rank + 1}-${row}` })
        edges.push({ id: id + '>b', from: id, to: `n-${rank + 1}-${(row + 7) % perRank}` })
      }
    }
    return { ...makeExample('manufacturing'), nodes, edges }
  }
  if (name === 'scale') {
    const rows = Array.from({ length: 1000 }, (_, i) => ({ id: 'r' + i, label: 'Resource ' + (i + 1), detail: 'Virtualized row' }))
    return {
      nodes: [{ id: 'a', label: 'Controller' }, { id: 'b', label: 'Worker' }, { id: 'c', label: 'Result' }],
      edges: [{ id: 'ab', from: 'a', to: 'b' }, { id: 'bc', from: 'b', to: 'c' }, { id: 'ba', from: 'b', to: 'a', label: 'Retry' }],
      rows,
      bars: rows.flatMap((row, i) => Array.from({ length: 3 }, (_, j) => ({
        id: row.id + '-' + j, rowId: row.id, label: 'Batch ' + (j + 1),
        start: origin + (j * 2.5 + (i % 3) * .25) * hour,
        end: origin + (j * 2.5 + 1.5 + (i % 3) * .25) * hour,
        editable: true, progress: .35, tone: 'teal' as const,
      }))),
      dependencies: [],
    }
  }
  if (name === 'project') return {
    nodes: [
      { id: 'design', label: 'Design', detail: 'Product team', tone: 'violet', ports: [{ id: 'out', label: 'Output', side: 'right', direction: 'source' }] },
      { id: 'api', label: 'API', detail: 'Platform team', tone: 'blue', ports: [{ id: 'in', label: 'Input', side: 'left', direction: 'target' }, { id: 'out', label: 'Output', side: 'right', direction: 'source' }] },
      { id: 'ui', label: 'Interface', detail: 'Web team', tone: 'blue', ports: [{ id: 'in', label: 'Input', side: 'left', direction: 'target' }, { id: 'out', label: 'Output', side: 'right', direction: 'source' }] },
      { id: 'release', label: 'Release', detail: 'Milestone', tone: 'teal', ports: [{ id: 'in', label: 'Input', side: 'left', direction: 'target' }] },
    ],
    edges: [
      { id: 'da', from: 'design', to: 'api', fromPort: 'out', toPort: 'in' }, { id: 'du', from: 'design', to: 'ui', fromPort: 'out', toPort: 'in' },
      { id: 'ar', from: 'api', to: 'release', fromPort: 'out', toPort: 'in' }, { id: 'ur', from: 'ui', to: 'release', fromPort: 'out', toPort: 'in' },
    ],
    rows: [
      { id: 'product', label: 'Product team' }, { id: 'platform', label: 'Platform team' },
      { id: 'web', label: 'Web team' }, { id: 'delivery', label: 'Delivery' },
    ],
    bars: [
      { id: 'design', rowId: 'product', label: 'Design', start: origin, end: origin + 2 * hour, editable: true, tone: 'violet', progress: 1 },
      { id: 'api', rowId: 'platform', label: 'API', start: origin + 2 * hour, end: origin + 6 * hour, editable: true, progress: .65 },
      { id: 'ui', rowId: 'web', label: 'Interface', start: origin + 2 * hour, end: origin + 6 * hour, editable: true, progress: .4 },
      { id: 'release', rowId: 'delivery', label: 'Release', start: origin + 7 * hour, end: origin + 7 * hour, editable: true, tone: 'teal' },
    ],
    dependencies: [
      { id: 'da', from: 'design', to: 'api' }, { id: 'au', from: 'api', to: 'ui', type: 'SS' },
      { id: 'ar', from: 'api', to: 'release' }, { id: 'ur', from: 'ui', to: 'release', type: 'FF' },
    ],
  }
  return {
    nodes: [
      { id: 'raw', label: 'Material A1', detail: '120 units', tone: 'teal' },
      { id: 'split', label: 'Split', detail: 'Operation 101', shape: 'rounded' },
      { id: 'lot1', label: 'Lot A123-01', detail: '72 units', tone: 'teal' },
      { id: 'lot2', label: 'Lot A123-02', detail: '48 units', tone: 'teal' },
      { id: 'finish', label: 'Finish', detail: 'Operation 102', shape: 'rounded' },
      { id: 'product', label: 'Product B', detail: '120 units', tone: 'violet' },
    ],
    edges: [
      { id: 'rs', from: 'raw', to: 'split' },
      { id: 's1', from: 'split', to: 'lot1', label: '72' },
      { id: 's2', from: 'split', to: 'lot2', label: '48' },
      { id: '1f', from: 'lot1', to: 'finish' }, { id: '2f', from: 'lot2', to: 'finish' },
      { id: 'fp', from: 'finish', to: 'product' },
    ],
    rows: [{ id: 'cut', label: 'Cutting station', detail: 'Machine 01' }, { id: 'line', label: 'Finishing line', detail: 'Machine 02' }],
    bars: [
      { id: 'split-plan', rowId: 'cut', label: 'Split · plan', start: origin + hour, end: origin + 3 * hour, editable: true, appearance: 'outline', data: 'split' },
      { id: 'split-actual', rowId: 'cut', label: 'Split · actual', start: origin + 1.25 * hour, end: origin + 3.5 * hour, lane: 1, tone: 'teal', data: 'split' },
      { id: 'finish-plan', rowId: 'line', label: 'Finish · plan', start: origin + 4 * hour, end: origin + 7 * hour, editable: true, appearance: 'outline', data: 'finish' },
      { id: 'finish-actual', rowId: 'line', label: 'Finish · actual', start: origin + 4.5 * hour, end: origin + 7.5 * hour, lane: 1, tone: 'teal', data: 'finish' },
    ],
    dependencies: [{ id: 'sf', from: 'split-actual', to: 'finish-actual' }],
  }
}
