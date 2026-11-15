// The demo's "external engine": it imports only the Vue-free core, so a Web Worker can bundle it without Vue.
import { layoutLayeredGraph, type GraphLayout, type GraphLayoutRequest } from '../../src/core'

export interface DemoLayoutSettings {
  nodeWidth: number
  nodeHeight: number
}

/**
 * Lays out one request the way an external engine would: boxes from the layered layout, then elbow routes that the
 * "engine" draws itself from the right-middle anchor of the source to the left-middle anchor of the target (the anchors
 * of the demo's `out` and `in` ports). NetworkGraph redraws edges with named ports as curves under the default
 * `routingPolicy="builtin"` and keeps these elbows under `"preserve"`, because they start and end at the ports.
 */
export function computeDemoLayout(request: GraphLayoutRequest): GraphLayout {
  const settings = (request.settings ?? {}) as Partial<DemoLayoutSettings>
  const base = layoutLayeredGraph(request.nodes, request.edges, { direction: 'LR', nodeWidth: settings.nodeWidth, nodeHeight: settings.nodeHeight })
  if (request.scope === 'expanded') return base
  const paths = new Map(base.paths)
  for (const edge of request.edges) {
    if (edge.fromPort === undefined || edge.toPort === undefined) continue
    const from = base.boxes.get(edge.from), to = base.boxes.get(edge.to)
    if (!from || !to) continue
    const sx = from.x + from.width, sy = from.y + from.height / 2, ex = to.x, ey = to.y + to.height / 2
    const middle = (sx + ex) / 2
    paths.set(edge.id, `M ${sx} ${sy} H ${middle} V ${ey} H ${ex}`)
  }
  return { ...base, paths }
}
