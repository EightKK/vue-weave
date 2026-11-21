import './styles/style.css'
import type { ComponentPublicInstance, DefineComponent } from 'vue'
import NetworkGraphVue from './components/NetworkGraph.vue'
import GanttChartVue from './components/GanttChart.vue'
import TaskBoardVue from './components/TaskBoard.vue'
import type { TaskBoardCard, TaskBoardColumn } from './core/taskBoard.js'
import type { GraphEdge } from './core/graph.js'
import type { NetworkGroup, NetworkNode, TimelineBar, TimelineRow } from './core/types.js'

// Both components are generic SFCs, so their item types flow into slots and callbacks. vue-tsc types a generic SFC as
// a function, which has no instance type. The public type adds two construct signatures: a generic one first, which
// Vue templates (vue-tsc) call with the props to infer the item types, and one with the default item types last, which
// keeps `InstanceType<typeof NetworkGraph>` and `h(NetworkGraph, props)` working with the default item types. The inferred item types are
// intersected with the base types, so items inferred from an unannotated array literal keep the optional fields they
// lack, such as `detail`.
type SfcContext<F extends (...args: any) => any> = NonNullable<ReturnType<F>['__ctx']>
type SfcExposed<F extends (...args: any) => any> = Parameters<SfcContext<F>['expose']>[0]
type SfcInstance<F extends (...args: any) => any> = Omit<ComponentPublicInstance, '$props' | '$slots' | '$emit'>
  & { $props: SfcContext<F>['props']; $slots: SfcContext<F>['slots']; $emit: SfcContext<F>['emit'] } & SfcExposed<F>
// Not `DefineComponent` itself: its `new (...args: any[])` signature makes TypeScript mix its instance type into the
// generic signature's instance type.
type SfcDefaultComponent<F extends (...args: any) => any> = new (props: SfcContext<F>['props']) =>
  InstanceType<DefineComponent<SfcContext<F>['props'], SfcExposed<F>>> & { $slots: SfcContext<F>['slots'] }

type NetworkGraphSfc<N extends NetworkNode, E extends GraphEdge, G extends NetworkGroup> = typeof NetworkGraphVue<N, E, G>
type GanttChartSfc<R extends TimelineRow, B extends TimelineBar> = typeof GanttChartVue<R, B>

/**
 * Methods that NetworkGraph exposes on its template ref. `N`, `E` and `G` are the node, edge and group types of the
 * graph; use the same types as its props, for example `ref<NetworkGraphExposed<MyNode, MyEdge>>()`.
 */
export type NetworkGraphExposed<
  N extends NetworkNode = NetworkNode, E extends GraphEdge = GraphEdge, G extends NetworkGroup = never,
> = SfcExposed<NetworkGraphSfc<N, E, G>>

/** Methods that GanttChart exposes on its template ref. `R` and `B` are the row and bar types of the chart. */
export type GanttChartExposed<R extends TimelineRow = TimelineRow, B extends TimelineBar = TimelineBar> =
  SfcExposed<GanttChartSfc<R, B>>

/**
 * The type of the `NetworkGraph` component. In a template, the node, edge and group types are inferred from the
 * `nodes`, `edges` and `groups` props.
 */
export type NetworkGraphComponent = (new <
  N extends NetworkNode = NetworkNode, E extends GraphEdge = GraphEdge, G extends NetworkGroup = never,
>(props: { nodes: readonly N[]; edges: readonly E[]; groups?: readonly G[] } & Record<string, unknown>) =>
  SfcInstance<NetworkGraphSfc<N & NetworkNode, E & GraphEdge, G>>)
  & SfcDefaultComponent<NetworkGraphSfc<NetworkNode, GraphEdge, NetworkGroup>>

/** The type of the `GanttChart` component. In a template, the row and bar types are inferred from `rows` and `bars`. */
export type GanttChartComponent = (new <R extends TimelineRow = TimelineRow, B extends TimelineBar = TimelineBar>(
  props: { rows: readonly R[]; bars: readonly B[] } & Record<string, unknown>,
) => SfcInstance<GanttChartSfc<R & TimelineRow, B & TimelineBar>>)
  & SfcDefaultComponent<GanttChartSfc<TimelineRow, TimelineBar>>

export const NetworkGraph = NetworkGraphVue as unknown as NetworkGraphComponent
export const GanttChart = GanttChartVue as unknown as GanttChartComponent
export type { GraphDrop, TimelineDrop } from './components/types.js'
export * from './core/index.js'

export { useEditHistory } from './composables/useEditHistory.js'
export { useTimelineView } from './composables/useTimelineView.js'
export { useEditTransaction } from './composables/useEditTransaction.js'
export type { UseEditTransactionOptions, HistoryReset } from './composables/useEditTransaction.js'

export { useLinkedSelection, revealLinkedTarget } from './composables/useLinkedSelection.js'
export type {
  LinkedGraphSets, LinkedLoadSets, LinkedTimelineSets, LinkedViewName, UseLinkedSelectionOptions, RevealLinkedTargetOptions,
  LinkedRevealResult, LinkedTimeRange,
} from './composables/useLinkedSelection.js'
export { useAsyncGraphLayout, graphLayoutWorkerAdapter } from './composables/useAsyncGraphLayout.js'
export type {
  AsyncGraphLayoutAdapter, AsyncGraphFrame, AsyncGraphDisplayFrame, AsyncGraphLayoutError, UseAsyncGraphLayoutOptions, AsyncGraphLayout,
  AsyncGraphGestureListeners,
  GraphLayoutWorkerPort, GraphLayoutWorkerAdapterOptions,
} from './composables/useAsyncGraphLayout.js'
export { useWindowedData } from './composables/useWindowedData.js'
export type { UseWindowedDataOptions, WindowedData, WindowedDataLoader, WindowedDataError } from './composables/useWindowedData.js'

// TaskBoard: a third controlled component, generic over its card type like the two above.
type TaskBoardSfc<C extends TaskBoardCard> = typeof TaskBoardVue<C>
/** Methods that TaskBoard exposes on its template ref. `C` is the card type of the board. */
export type TaskBoardExposed<C extends TaskBoardCard = TaskBoardCard> = SfcExposed<TaskBoardSfc<C>>
/** The type of the `TaskBoard` component. In a template, the card type is inferred from `cards`. */
export type TaskBoardComponent = (new <C extends TaskBoardCard = TaskBoardCard>(
  props: { columns: readonly TaskBoardColumn[]; cards: readonly C[] } & Record<string, unknown>,
) => SfcInstance<TaskBoardSfc<C & TaskBoardCard>>)
  & SfcDefaultComponent<TaskBoardSfc<TaskBoardCard>>
export const TaskBoard = TaskBoardVue as unknown as TaskBoardComponent

// Diagram editor parts: a shape palette and a property inspector. Both are generic SFCs typed like the components above.
import GraphPaletteVue from './components/GraphPalette.vue'
import PropertyInspectorVue from './components/PropertyInspector.vue'
import type { GraphPaletteItem, InspectorField, InspectorItem } from './core/diagramEditor.js'

type GraphPaletteSfc<D> = typeof GraphPaletteVue<D>
type PropertyInspectorSfc<T extends InspectorItem> = typeof PropertyInspectorVue<T>

/** Methods that GraphPalette exposes on its template ref. */
export type GraphPaletteExposed<D = unknown> = SfcExposed<GraphPaletteSfc<D>>
/** Methods that PropertyInspector exposes on its template ref. */
export type PropertyInspectorExposed<T extends InspectorItem = InspectorItem> = SfcExposed<PropertyInspectorSfc<T>>

/** The type of the `GraphPalette` component. In a template, the item data type is inferred from `items`. */
export type GraphPaletteComponent = (new <D = unknown>(props: { items: readonly GraphPaletteItem<D>[] } & Record<string, unknown>) =>
  SfcInstance<GraphPaletteSfc<D>>)
  & SfcDefaultComponent<GraphPaletteSfc<unknown>>

/** The type of the `PropertyInspector` component. In a template, the item type is inferred from `item` and `fields`. */
export type PropertyInspectorComponent = (new <T extends InspectorItem = InspectorItem>(
  props: { item?: T | null; fields: readonly InspectorField<T>[] } & Record<string, unknown>,
) => SfcInstance<PropertyInspectorSfc<T>>)
  & SfcDefaultComponent<PropertyInspectorSfc<InspectorItem>>

export const GraphPalette = GraphPaletteVue as unknown as GraphPaletteComponent
export const PropertyInspector = PropertyInspectorVue as unknown as PropertyInspectorComponent
export { readPaletteDrop } from './components/graphPalette.js'
export type { PaletteDropSource } from './components/graphPalette.js'
