/** An application-defined entity. `kind` keeps equal IDs of different kinds apart. */
export interface EntityRef {
  kind: string
  id: string
}

/** Something one view can show for an entity. A load target is a time range, because load segments have no ID. */
export type ViewTarget =
  | { view: 'graph'; kind: 'node' | 'edge' | 'group'; id: string }
  | { view: 'timeline'; kind: 'bar' | 'dependency' | 'row'; id: string }
  | { view: 'load'; resourceId: string; start: number; end: number }

/** Links one entity to one target. Many-to-many links are allowed. */
export interface ViewBinding {
  entity: EntityRef
  target: ViewTarget
}
