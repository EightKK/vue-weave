import type { Component } from 'vue'
import SchedulingDemo from './SchedulingDemo.vue'
import GanttEditingDemo from './GanttEditingDemo.vue'
import LinkedPlanningDemo from './LinkedPlanningDemo.vue'
import AsyncGraphDemo from './AsyncGraphDemo.vue'
import DiagramStylesDemo from './DiagramStylesDemo.vue'
import GraphAnalysisDemo from './GraphAnalysisDemo.vue'
import SwimlaneDemo from './SwimlaneDemo.vue'
import QuantityFlowDemo from './QuantityFlowDemo.vue'
import ResourcePlanningDemo from './ResourcePlanningDemo.vue'
import PersistenceDemo from './PersistenceDemo.vue'
import LargePlanDemo from './LargePlanDemo.vue'
import GraphInterchangeDemo from './GraphInterchangeDemo.vue'
import DiagramEditorDemo from './DiagramEditorDemo.vue'
import TaskBoardDemo from './TaskBoardDemo.vue'
import EarnedValueDemo from './EarnedValueDemo.vue'
import WorkflowShowcase from './showcase/WorkflowShowcase.vue'
import SchemaShowcase from './showcase/SchemaShowcase.vue'
import OrgChartShowcase from './showcase/OrgChartShowcase.vue'
import RoadmapShowcase from './showcase/RoadmapShowcase.vue'
import SprintGanttShowcase from './showcase/SprintGanttShowcase.vue'
import BookingShowcase from './showcase/BookingShowcase.vue'
import CalendarShowcase from './showcase/CalendarShowcase.vue'
import EventCalendarDemo from './EventCalendarDemo.vue'
import BpmnDemo from './BpmnDemo.vue'

/**
 * - `dataset`: a data set for the graph and timeline of the main page (see `makeExample` in data.ts).
 * - `standalone`: a demo that keeps its own state and ignores the graph and timeline controls of the main page.
 * - `gallery`: a design gallery showcase that restyles both components with slots, CSS variables and the vw- classes
 *   only; each showcase keeps its own state.
 */
export type DemoGroup = 'dataset' | 'standalone' | 'gallery'

export interface DemoEntry {
  /** The value of the page's `preset`. */
  id: string
  /** The text of the navigation button. */
  label: string
  group: DemoGroup
  /** The component that replaces the main page; only `standalone` and `gallery` entries have one. */
  component?: Component
}

/** Every example of the demo app, in navigation order within each group. */
export const demos: readonly DemoEntry[] = [
  { id: 'manufacturing', label: 'Manufacturing', group: 'dataset' },
  { id: 'project', label: 'Project delivery', group: 'dataset' },
  { id: 'scale', label: '1,000 resources', group: 'dataset' },
  { id: 'large', label: 'Large graph', group: 'dataset' },
  { id: 'scheduling', label: 'Scheduling', group: 'standalone', component: SchedulingDemo },
  { id: 'editing', label: 'Timeline editing', group: 'standalone', component: GanttEditingDemo },
  { id: 'linked', label: 'Linked views', group: 'standalone', component: LinkedPlanningDemo },
  { id: 'async', label: 'Async layout', group: 'standalone', component: AsyncGraphDemo },
  { id: 'diagram', label: 'Diagram styles', group: 'standalone', component: DiagramStylesDemo },
  { id: 'analysis', label: 'Graph analysis', group: 'standalone', component: GraphAnalysisDemo },
  { id: 'swimlanes', label: 'Process lanes', group: 'standalone', component: SwimlaneDemo },
  { id: 'flow', label: 'Quantity flow', group: 'standalone', component: QuantityFlowDemo },
  { id: 'resource-planning', label: 'Resource planning', group: 'standalone', component: ResourcePlanningDemo },
  { id: 'persistence', label: 'Saved editing', group: 'standalone', component: PersistenceDemo },
  { id: 'large-plan', label: 'Large plan', group: 'standalone', component: LargePlanDemo },
  { id: 'interchange', label: 'Diagram import/export', group: 'standalone', component: GraphInterchangeDemo },
  { id: 'event-calendar', label: 'Event calendar', group: 'standalone', component: EventCalendarDemo },
  { id: 'diagram-editor', label: 'Diagram editor', group: 'standalone', component: DiagramEditorDemo },
  { id: 'task-board', label: 'Task board', group: 'standalone', component: TaskBoardDemo },
  { id: 'earned-value', label: 'Earned value', group: 'standalone', component: EarnedValueDemo },
  { id: 'workflow', label: 'Workflow builder', group: 'gallery', component: WorkflowShowcase },
  { id: 'schema', label: 'Database schema', group: 'gallery', component: SchemaShowcase },
  { id: 'org', label: 'Org chart', group: 'gallery', component: OrgChartShowcase },
  { id: 'roadmap', label: 'Product roadmap', group: 'gallery', component: RoadmapShowcase },
  { id: 'sprint', label: 'Sprint plan', group: 'gallery', component: SprintGanttShowcase },
  { id: 'booking', label: 'Room bookings', group: 'gallery', component: BookingShowcase },
  { id: 'calendar', label: 'Calendar views', group: 'gallery', component: CalendarShowcase },
  { id: 'bpmn', label: 'BPMN process', group: 'standalone', component: BpmnDemo },
]

export const demosIn = (group: DemoGroup) => demos.filter(demo => demo.group === group)
