import type { GraphEdge } from '../../src'

type Flow = GraphEdge<{ pcs?: number; EUR: number }>
export const flows: Flow[] = [
  { id: 'lot-a', from: 'lot', to: 'line-a', data: { pcs: 60, EUR: 1200 } },
  { id: 'lot-b', from: 'lot', to: 'line-b', data: { pcs: 40, EUR: 800 } },
  { id: 'overhead-a', from: 'overhead', to: 'line-a', data: { EUR: 300 } },
  { id: 'overhead-b', from: 'overhead', to: 'line-b', data: { EUR: 200 } },
  { id: 'a-inspect', from: 'line-a', to: 'inspect', data: { pcs: 60, EUR: 1500 } },
  // Line B loses 4 pieces (and 100 EUR of value): the library reports the difference and never balances it.
  { id: 'b-inspect', from: 'line-b', to: 'inspect', data: { pcs: 36, EUR: 900 } },
  { id: 'inspect-pack', from: 'inspect', to: 'pack', data: { pcs: 86, EUR: 2150 } },
  { id: 'inspect-rework', from: 'inspect', to: 'rework', data: { pcs: 10, EUR: 250 } },
  { id: 'rework-inspect', from: 'rework', to: 'inspect', data: { pcs: 10, EUR: 250 } },
]
