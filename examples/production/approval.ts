import type { GraphEdge, GraphPoint } from '../../src'

// The approval workflow: purchase requests routed by amount. It shares no entities with the production plan.
export type Step = { id: string; kind: 'start' | 'decision' | 'approval' | 'end'; name: [string, string]; assignee?: string; threshold?: number }
export interface Flow { steps: Step[]; edges: GraphEdge[]; positions: Map<string, GraphPoint> }

function edge(id: string, from: string, port: string, to: string): GraphEdge {
  return { id, from, fromPort: port, to, toPort: 'in' }
}

export const initialFlow: Flow = {
  steps: [
    { id: 'request', kind: 'start', name: ['購買申請', 'Purchase request'] },
    { id: 'amount', kind: 'decision', threshold: 100000, name: ['申請金額', 'Request amount'] },
    { id: 'lead', kind: 'approval', name: ['課長承認', 'Manager review'], assignee: 'Team lead' },
    { id: 'director', kind: 'approval', name: ['部長承認', 'Director review'], assignee: 'Director' },
    { id: 'done', kind: 'end', name: ['完了', 'Complete'] },
  ],
  edges: [edge('a', 'request', 'out', 'amount'), edge('b', 'amount', 'low', 'lead'),
    edge('c', 'amount', 'high', 'director'), edge('d', 'lead', 'out', 'done'), edge('e', 'director', 'out', 'done')],
  positions: new Map(),
}

export function outputs(step: Step) {
  return step.kind === 'decision' ? ['low', 'high'] : step.kind === 'end' ? [] : ['out']
}
