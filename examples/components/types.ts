import type { TimelineFieldSpec } from '../../src'

/** The drag data type that carries a task ID from `PlanningBacklog` to a chart's `bar-drop`. */
export const BACKLOG_MIME = 'application/x-vue-weave-task'

export interface BacklogItem { id: string; label: string; detail?: string }
export interface PlaceRequest { taskId: string; resourceId: string; time: number }

/** One editable field of `PlanningInspector`: a label and the typed field spec whose `get` reads the raw value. */
export interface InspectorField { label: string; spec: TimelineFieldSpec<any> }
