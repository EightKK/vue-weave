# @eightkk/vue-weave public API baseline

Generated from the built package by `node scripts/api-baseline.mjs --update`; do not edit by hand. `npm run test:package`
fails when the built API differs. Review every change: in 1.x, a removed or changed export, prop, event, slot,
exposed member or CSS custom property is a breaking change. "Internal" declarations are not exported but appear
in public signatures, so changes to them can break consumers too.

## Entry `.`: runtime exports (283)

- `EventCalendar: object`
- `GanttChart: object`
- `GraphPalette: object`
- `NetworkGraph: object`
- `PropertyInspector: object`
- `TaskBoard: object`
- `TreeGrid: object`
- `WeaveSnapshotError: function`
- `actualsTimelineBars: function`
- `aggregateTimeBuckets: function`
- `applyBoardCardMove: function`
- `applyGraphPositions: function`
- `applyGraphSizes: function`
- `applyRecurringEdit: function`
- `applyTimelineConstraintEdit: function`
- `applyTimelineSheetEdit: function`
- `applyTreeGridEdits: function`
- `assignLanes: function`
- `assignmentWorkPeriods: function`
- `baselineVariance: function`
- `beginGraphExpansion: function`
- `beginTransaction: function`
- `boardCardPosition: function`
- `buildGraphLayoutRequests: function`
- `buildPlacementInput: function`
- `buildTreeGridClear: function`
- `buildTreeGridFill: function`
- `buildTreeGridPaste: function`
- `buildViewBindingIndex: function`
- `buildWorkPeriods: function`
- `calculateResourceLoad: function`
- `calendarBands: function`
- `calendarZoomPresets: function`
- `cancelGraphExpansion: function`
- `cancelWindowedRequests: function`
- `checkGraphConnection: function`
- `clearTransactionResult: function`
- `cloneGraphElements: function`
- `collapseGraphGroups: function`
- `collectScheduleReasons: function`
- `comparePlans: function`
- `completeGraphLayout: function`
- `computeEarnedValue: function`
- `countGraphCrossings: function`
- `createGraphConnectionChecker: function`
- `createGraphExpansion: function`
- `createGraphRouteCache: function`
- `createResourceTimelineProjector: function`
- `createTimeBucketColumns: function`
- `createTimeScale: function`
- `createTimelineRowTree: function`
- `createTimelineViewState: function`
- `createTransactionState: function`
- `createTreeGridIndex: function`
- `createWindowedDataState: function`
- `createWorkingTimeScale: function`
- `cullGraphElements: function`
- `defaultNonWorkingRatio: number`
- `defaultSvgExportTheme: object`
- `deleteTreeGridRows: function`
- `dependencyEndsForType: function`
- `dependencyPath: function`
- `dependencyTimes: function`
- `dependencyTypeForEnds: function`
- `detectGraphCommunities: function`
- `diffStructure: function`
- `editTimeRange: function`
- `escapeXml: function`
- `eventCalendarDays: function`
- `eventCalendarMonthGrid: function`
- `eventCalendarRange: function`
- `eventCalendarTimeAt: function`
- `eventCalendarTimeOfDay: function`
- `expandRecurrence: function`
- `expandRecurringEvents: function`
- `fieldValuesEqual: function`
- `filterGraph: function`
- `filterTimelineRows: function`
- `findGraphCycles: function`
- `findOrthogonalRoute: function`
- `findTreeGridLine: function`
- `flattenTreeGrid: function`
- `formatDependencyLag: function`
- `formatFieldValue: function`
- `formatRecurrenceRule: function`
- `formatSheetText: function`
- `fromDrawio: function`
- `fromDrawioAsync: function`
- `fromGraphMl: function`
- `fromICalendar: function`
- `fromMermaid: function`
- `fromMsProjectXml: function`
- `graphAlignmentGuides: function`
- `graphBetweennessCentrality: function`
- `graphCameraAt: function`
- `graphCommunityGroups: function`
- `graphComponents: function`
- `graphConnectionTargets: function`
- `graphConnectionValidator: function`
- `graphConnectionViolations: function`
- `graphDegreeCentrality: function`
- `graphDeletion: function`
- `graphEdgeEndpoint: function`
- `graphExpansionView: function`
- `graphFlowBands: function`
- `graphLayoutBounds: function`
- `graphLayoutChangeMetrics: function`
- `graphLayoutFromJson: function`
- `graphLayoutInputKey: function`
- `graphLayoutMessageFromJson: function`
- `graphLayoutMessageToJson: function`
- `graphLayoutToJson: function`
- `graphLayoutWorkerAdapter: function`
- `graphNeighborhood: function`
- `graphNodesInPolygon: function`
- `graphPageRank: function`
- `graphPaletteMimeType: string`
- `graphPathBounds: function`
- `graphPathEndpoints: function`
- `graphPointInPolygon: function`
- `graphPolylinePath: function`
- `graphPortAnchor: function`
- `graphRectsIntersect: function`
- `graphSmoothPath: function`
- `graphSwimlaneAt: function`
- `graphTracePath: function`
- `graphViewportRect: function`
- `groupBoardCards: function`
- `indentTimelineRow: function`
- `indexGraph: function`
- `insertTreeGridRow: function`
- `intersectsWindow: function`
- `intlTimeFormatter: function`
- `invalidateWindowedData: function`
- `invertWorkPeriods: function`
- `isGraphRouteValid: function`
- `isTreeGridCellEditable: function`
- `layoutCalendarAgenda: function`
- `layoutCalendarDayEvents: function`
- `layoutCircularGraph: function`
- `layoutConcentricGraph: function`
- `layoutFlowGraph: function`
- `layoutForceGraph: function`
- `layoutGraphIncrementally: function`
- `layoutGridGraph: function`
- `layoutLayeredGraph: function`
- `layoutRadialGraph: function`
- `layoutSwimlaneGraph: function`
- `layoutTreeGraph: function`
- `levelResources: function`
- `matchTreeGridEntities: function`
- `maxEarnedValuePoints: number`
- `mergeGraphExpansionPage: function`
- `mirrorTimeScale: function`
- `moveTimeRanges: function`
- `moveTimelineRow: function`
- `nextTimelineSort: function`
- `normalizeWorkPeriods: function`
- `outdentTimelineRow: function`
- `packCalendarEventLanes: function`
- `parseCsv: function`
- `parseFieldValue: function`
- `parseGraphLayoutMessage: function`
- `parseRecurrenceRule: function`
- `parseSheetText: function`
- `parseTimelineViewState: function`
- `parseWeaveSnapshot: function`
- `placeGraphEdgeLabels: function`
- `planBaselines: function`
- `planComparisonTargets: function`
- `projectResourceTimeline: function`
- `projectTimelineRows: function`
- `projectTimelineView: function`
- `projectTreeGridRows: function`
- `propagateEdit: function`
- `proposeResourceAssignment: function`
- `readPaletteDrop: function`
- `reconcileTimelineViewColumns: function`
- `refreshTransactionState: function`
- `rejectWindowedRequest: function`
- `removeGraphElements: function`
- `removeTimelineBars: function`
- `renderEventCalendarSvg: function`
- `renderGraphSvg: function`
- `renderTaskBoardSvg: function`
- `renderTimelineSvg: function`
- `renderTreeGridSvg: function`
- `rescheduleFromActuals: function`
- `rescheduleFromStatusDate: function`
- `resetWindowedData: function`
- `resolveCollapsedTargets: function`
- `resolveEntityRefs: function`
- `resolveLoadTargets: function`
- `resolveResourceTimelineEdit: function`
- `resolveResourceTimelineEdits: function`
- `resolveTimeRangeTargets: function`
- `resolveTimelineColumns: function`
- `resolveTreeGridCell: function`
- `resolveViewTargets: function`
- `resolveWindowedRequest: function`
- `resourceLoadFromMsProject: function`
- `resourceLoadHistogram: function`
- `resourceTimelineBarId: function`
- `resourceTimelineCascade: function`
- `restoreWeaveSnapshot: function`
- `retryWindowedData: function`
- `revealLinkedTarget: function`
- `rollupEarnedValue: function`
- `routeGraphEdges: function`
- `routeGraphPorts: function`
- `scheduleTasks: function`
- `scheduleToGraph: function`
- `scheduledBarFields: function`
- `searchGraphNodes: function`
- `serializeWeaveSnapshot: function`
- `setWindowedView: function`
- `settleTransaction: function`
- `shiftEventCalendarDate: function`
- `shortestGraphPath: function`
- `snapGraphPoint: function`
- `splitDanglingLinks: function`
- `summarizeTimelineRows: function`
- `taskViewBindings: function`
- `timeBucketIndex: function`
- `timeBucketIndexRange: function`
- `timeTicks: function`
- `timelineBarsInRange: function`
- `timelineBaseline: function`
- `timelineBaselineId: string`
- `timelineBaselineIds: function`
- `timelineBaselineLimit: number`
- `timelineConstraintKinds: object`
- `timelineConstraintViolated: function`
- `timelineConstraints: function`
- `timelineCsvTable: function`
- `timelineFromCsvTable: function`
- `timelineFromICalendar: function`
- `timelineFromMsProject: function`
- `timelineLabelColumnId: string`
- `timelineRowPosition: function`
- `timelineWbsCodes: function`
- `toCsv: function`
- `toDrawio: function`
- `toGraphMl: function`
- `toICalendar: function`
- `toMermaid: function`
- `toMsProjectXml: function`
- `toPlanningDiagnostics: function`
- `topologicalOrder: function`
- `traverseGraph: function`
- `treeGridCellContentFromTimeBucket: function`
- `treeGridCellText: function`
- `treeGridCellValue: function`
- `treeGridCellsFromTimeBuckets: function`
- `treeGridColumnAt: function`
- `treeGridColumnOffsets: function`
- `treeGridColumnWindow: function`
- `treeGridDefaultLabels: object`
- `treeGridDropAt: function`
- `treeGridFieldSpec: function`
- `treeGridKeyAction: function`
- `treeGridPositionAt: function`
- `treeGridRangeBounds: function`
- `treeGridRangeText: function`
- `treeGridRowCreate: function`
- `treeGridRowExpandable: function`
- `treeGridRowMoveForKey: function`
- `treeGridRowWindow: function`
- `useAsyncGraphLayout: function`
- `useEditHistory: function`
- `useEditTransaction: function`
- `useLinkedSelection: function`
- `useTimelineView: function`
- `useWindowedData: function`
- `validateCalendarEvents: function`
- `validateFieldValue: function`
- `validateGraphLayoutResponse: function`
- `validateInspectorList: function`
- `validateTimelineData: function`
- `visibleRows: function`
- `windowedCellStatus: function`
- `windowedCoverage: function`
- `workCalendarsFromMsProject: function`

## Entry `.`: type-only exports (660)

- `ActualsDiagnostic`
- `ActualsDiagnosticCode`
- `ActualsTask`
- `ActualsTaskState`
- `ActualsTimelineBarOptions`
- `AssignLanesOptions`
- `AssignLanesResult`
- `AsyncGraphDisplayFrame`
- `AsyncGraphFrame`
- `AsyncGraphGestureListeners`
- `AsyncGraphLayout`
- `AsyncGraphLayoutAdapter`
- `AsyncGraphLayoutError`
- `BarsDeleteValidator`
- `BatchEditValidator`
- `CalendarAgendaDay`
- `CalendarAgendaItem`
- `CalendarBandLocalTime`
- `CalendarBandOptions`
- `CalendarBandUnit`
- `CalendarEvent`
- `CalendarEventColumn`
- `CalendarEventLane`
- `CalendarEventLaneLayout`
- `CalendarRecurrence`
- `CalendarResource`
- `CalendarZoomLevel`
- `CalendarZoomPreset`
- `CalendarZoomPresetOptions`
- `ChartDirection`
- `ChartTone`
- `CollapsedTargetsResult`
- `CollectScheduleReasonsOptions`
- `ColumnResizeValidator`
- `ConstraintEditValidator`
- `CreateValidator`
- `CsvCell`
- `CsvOptions`
- `CsvParseOptions`
- `DanglingLink`
- `DependencyPathStyle`
- `DrawioAsyncImportOptions`
- `DrawioImportOptions`
- `DrawioOptions`
- `EarnedValueAmounts`
- `EarnedValueEacMethod`
- `EarnedValueMetrics`
- `EarnedValueOptions`
- `EarnedValuePoint`
- `EarnedValueRecord`
- `EarnedValueResult`
- `EarnedValueSeriesOptions`
- `EarnedValueTask`
- `EarnedValueTaskResult`
- `EditMode`
- `EditTransaction`
- `EditValidator`
- `EntityRef`
- `EventCalendarBackgroundClick`
- `EventCalendarComponent`
- `EventCalendarCreate`
- `EventCalendarCreateValidator`
- `EventCalendarDay`
- `EventCalendarEdit`
- `EventCalendarEditCancel`
- `EventCalendarEditCancelReason`
- `EventCalendarEditValidator`
- `EventCalendarExportOptions`
- `EventCalendarExposed`
- `EventCalendarLabels`
- `EventCalendarOptions`
- `EventCalendarPngExportOptions`
- `EventCalendarSvgLabels`
- `EventCalendarSvgOptions`
- `EventCalendarView`
- `ExplainedLevelResourcesResult`
- `ExplainedLevelResourcesSuccess`
- `ExplainedScheduleResult`
- `ExplainedScheduleSuccess`
- `FieldCheck`
- `FieldChoice`
- `FieldDurationBasis`
- `FieldErrorCode`
- `FieldParseResult`
- `FieldPrimitive`
- `FieldValue`
- `GanttChartComponent`
- `GanttChartExposed`
- `GanttExportOptions`
- `GanttLabels`
- `GanttPngExportOptions`
- `GraphAlignment`
- `GraphAlignmentGuide`
- `GraphBetweennessOptions`
- `GraphBounds`
- `GraphBox`
- `GraphCameraTarget`
- `GraphCircularLayoutOptions`
- `GraphClipboardSelection`
- `GraphCloneOptions`
- `GraphCloneResult`
- `GraphCollapseOptions`
- `GraphCollapseResult`
- `GraphCollapsedGroup`
- `GraphCollapsedNode`
- `GraphCollapsedNodeData`
- `GraphCommunityGroupsOptions`
- `GraphCommunityOptions`
- `GraphCommunityResult`
- `GraphConcentricLayoutOptions`
- `GraphConnection`
- `GraphConnectionCheck`
- `GraphConnectionChecker`
- `GraphConnectionOrigin`
- `GraphConnectionRejection`
- `GraphConnectionRejectionCode`
- `GraphConnectionTargets`
- `GraphConnectionViolation`
- `GraphContextMenu`
- `GraphContextMenuTarget`
- `GraphCrossingReduction`
- `GraphCullKeep`
- `GraphDegreeCentralityOptions`
- `GraphDeletion`
- `GraphDrop`
- `GraphEdge`
- `GraphEdgeBand`
- `GraphEdgeLabelPlacement`
- `GraphEdgeLabelPlacementOptions`
- `GraphEdgeLabelSize`
- `GraphEdgeMarker`
- `GraphEdgeReshape`
- `GraphEdgeRouteOptions`
- `GraphEdgeStyle`
- `GraphExpansionKeyOptions`
- `GraphExpansionPage`
- `GraphExpansionState`
- `GraphExpansionView`
- `GraphExportOptions`
- `GraphFilterOptions`
- `GraphFitOptions`
- `GraphFlowBand`
- `GraphFlowExcludedEdge`
- `GraphFlowLayout`
- `GraphFlowNode`
- `GraphFlowOptions`
- `GraphFlowScale`
- `GraphForceLayoutOptions`
- `GraphGesture`
- `GraphGestureEnd`
- `GraphGestureKind`
- `GraphGridLayoutOptions`
- `GraphGroup`
- `GraphIncrementalLayout`
- `GraphIncrementalLayoutOptions`
- `GraphIndex`
- `GraphInterchangeImport`
- `GraphInterchangeImportOptions`
- `GraphInterchangeInput`
- `GraphInterchangeWarning`
- `GraphInterchangeWarningCode`
- `GraphKnownPosition`
- `GraphLabelEdit`
- `GraphLabels`
- `GraphLayeredLayoutOptions`
- `GraphLayout`
- `GraphLayoutCancelMessage`
- `GraphLayoutChangeMetrics`
- `GraphLayoutChangeOptions`
- `GraphLayoutCompletion`
- `GraphLayoutCompletionOptions`
- `GraphLayoutDirection`
- `GraphLayoutFailureMessage`
- `GraphLayoutFunction`
- `GraphLayoutJson`
- `GraphLayoutKeyInput`
- `GraphLayoutOptions`
- `GraphLayoutRequest`
- `GraphLayoutRequestInput`
- `GraphLayoutRequestJson`
- `GraphLayoutRequestMessage`
- `GraphLayoutRequests`
- `GraphLayoutResponse`
- `GraphLayoutRoute`
- `GraphLayoutScope`
- `GraphLayoutSuccessMessage`
- `GraphLayoutWorkerAdapterOptions`
- `GraphLayoutWorkerJsonMessage`
- `GraphLayoutWorkerMessage`
- `GraphLayoutWorkerPort`
- `GraphMlOptions`
- `GraphNodeMatch`
- `GraphNodeMove`
- `GraphNodeResize`
- `GraphNodeSize`
- `GraphObstacleAvoidance`
- `GraphPageRankOptions`
- `GraphPageRankResult`
- `GraphPaletteComponent`
- `GraphPaletteDrop`
- `GraphPaletteExposed`
- `GraphPaletteItem`
- `GraphPaletteLabels`
- `GraphPaste`
- `GraphPathResult`
- `GraphPngExportOptions`
- `GraphPoint`
- `GraphPort`
- `GraphPortDirection`
- `GraphPortRouteOptions`
- `GraphPortRule`
- `GraphPortRules`
- `GraphRadialLayoutOptions`
- `GraphReconnect`
- `GraphRect`
- `GraphRouteCache`
- `GraphRouteEnd`
- `GraphRoutingPolicy`
- `GraphSearchOptions`
- `GraphSelectionMode`
- `GraphShownEdge`
- `GraphShownNode`
- `GraphSnapshotData`
- `GraphSnapshotInput`
- `GraphSnapshotV1`
- `GraphSnapshotView`
- `GraphSvgGroup`
- `GraphSvgOptions`
- `GraphSwimlane`
- `GraphSwimlaneBand`
- `GraphSwimlaneLayout`
- `GraphSwimlaneLayoutOptions`
- `GraphSwimlanePool`
- `GraphSwimlanePoolBand`
- `GraphSwimlanePoolSpec`
- `GraphSwimlaneSpec`
- `GraphTracedPath`
- `GraphTraversalDirection`
- `GraphTraversalOptions`
- `GraphTraversalResult`
- `GraphTraversalStep`
- `GraphTraversalTruncation`
- `GraphTraversalVia`
- `GraphTreeLayoutOptions`
- `GraphViewTarget`
- `GraphViewport`
- `GraphVisibleIds`
- `GraphWalkDirection`
- `HistoryReset`
- `ICalendarEvent`
- `ICalendarExpandOptions`
- `ICalendarImport`
- `ICalendarImportEvent`
- `ICalendarImportOptions`
- `ICalendarImportWarning`
- `ICalendarImportWarningCode`
- `ICalendarOptions`
- `ICalendarTimeline`
- `IdentifiedNode`
- `InspectorAssignment`
- `InspectorAssignmentsField`
- `InspectorChange`
- `InspectorChangeValidator`
- `InspectorDependenciesField`
- `InspectorDependency`
- `InspectorField`
- `InspectorFieldKind`
- `InspectorItem`
- `InspectorListChange`
- `InspectorListChangeValidator`
- `InspectorListField`
- `InspectorListFieldKind`
- `InspectorOption`
- `IntlTimeFormatterOptions`
- `JsonValue`
- `LevelResourcesInput`
- `LevelResourcesResult`
- `LevelResourcesSuccess`
- `LinkedGraphSets`
- `LinkedLoadSets`
- `LinkedRevealResult`
- `LinkedTimeRange`
- `LinkedTimelineSets`
- `LinkedViewName`
- `LoadSegmentLike`
- `LoadViewTarget`
- `MermaidDirection`
- `MermaidOptions`
- `MsProjectAssignment`
- `MsProjectBaseline`
- `MsProjectCalendar`
- `MsProjectDependency`
- `MsProjectImport`
- `MsProjectImportTask`
- `MsProjectImportWarning`
- `MsProjectImportWarningCode`
- `MsProjectInput`
- `MsProjectResource`
- `MsProjectResourceLoad`
- `MsProjectResourceLoadOptions`
- `MsProjectTask`
- `MsProjectTimeline`
- `MsProjectTimelineOptions`
- `MsProjectXmlOptions`
- `NetworkEdgeSlot`
- `NetworkEdgeToolbarSlot`
- `NetworkFlowchartShape`
- `NetworkFocusOptions`
- `NetworkGraphComponent`
- `NetworkGraphExposed`
- `NetworkGroup`
- `NetworkGroupSlot`
- `NetworkMinimapNodeSlot`
- `NetworkNode`
- `NetworkNodeEvent`
- `NetworkNodeLabelPosition`
- `NetworkNodeMarker`
- `NetworkNodeShape`
- `NetworkNodeSlot`
- `NetworkNodeToolbarSlot`
- `NetworkTooltipSlot`
- `PaletteDropSource`
- `ParseWeaveSnapshotOptions`
- `ParseWeaveSnapshotResult`
- `PendingTransaction`
- `PlacementDiagnostic`
- `PlacementInput`
- `PlacementPredecessorDiagnostic`
- `PlacementResult`
- `PlacementRetargetedDependency`
- `PlacementSummaryDiagnostic`
- `PlanAssignmentChange`
- `PlanAssignmentDiff`
- `PlanCollectionDiff`
- `PlanComparison`
- `PlanComparisonInput`
- `PlanComparisonTargetOptions`
- `PlanComparisonTargets`
- `PlanComparisonTask`
- `PlanFieldChange`
- `PlanInputDiff`
- `PlanResourceOverload`
- `PlanResultDiff`
- `PlanScenario`
- `PlanScheduleState`
- `PlanTaskComparison`
- `PlanTaskSide`
- `PlanViolation`
- `PlanningDiagnostic`
- `PlanningDiagnosticCode`
- `PlanningDiagnosticSeverity`
- `PlanningPlacement`
- `PlanningSnapshotData`
- `PlanningSnapshotInput`
- `PlanningSnapshotV1`
- `PlanningTaskDisplay`
- `PngExportOptions`
- `ProgressEditValidator`
- `PropagateEditResult`
- `PropagateEditSuccess`
- `PropertyInspectorComponent`
- `PropertyInspectorExposed`
- `PropertyInspectorFieldSlot`
- `PropertyInspectorLabels`
- `RecurrenceExpandOptions`
- `RecurrenceFrequency`
- `RecurrenceOccurrence`
- `RecurrenceRule`
- `RecurrenceSeries`
- `RecurrenceWeekday`
- `RecurrenceZoneOptions`
- `RecurringEditChange`
- `RecurringEditOptions`
- `RecurringEditScope`
- `RecurringEditTarget`
- `RescheduleFromActualsFields`
- `RescheduleFromActualsResult`
- `ResolvedEntityRefs`
- `ResolvedLoadTargets`
- `ResolvedViewTargets`
- `ResourceAssignment`
- `ResourceAssignmentProposal`
- `ResourceAssignmentReplacement`
- `ResourceAssignmentRequest`
- `ResourceAssignmentState`
- `ResourceBarOrigin`
- `ResourceCapacity`
- `ResourceCapacityPeriod`
- `ResourceDelay`
- `ResourceLoadHistogram`
- `ResourceLoadOptions`
- `ResourceLoadSegment`
- `ResourceTimelineEditResolution`
- `ResourceTimelineEditsResolution`
- `ResourceTimelineInput`
- `ResourceTimelineOptions`
- `ResourceTimelineProjection`
- `ResourceTimelineRejection`
- `ResourceTimelineRejectionCode`
- `ResourceTimelineResource`
- `ResourceTimelineScheduleChange`
- `ResourceTimelineTask`
- `RestoreWeaveSnapshotResult`
- `RestoredColumn`
- `RestoredGraphSnapshot`
- `RestoredGraphView`
- `RestoredPlanningSnapshot`
- `RestoredSortRule`
- `RestoredTimelineSnapshot`
- `RestoredTimelineView`
- `RestoredWeaveSnapshot`
- `RevealLinkedTargetOptions`
- `RevealOptions`
- `RevealResult`
- `RevealStatus`
- `RowMoveValidator`
- `SaveResult`
- `ScheduleChange`
- `ScheduleConstraintName`
- `ScheduleCycle`
- `ScheduleEdit`
- `ScheduleFailure`
- `ScheduleGraph`
- `ScheduleGraphEdgeData`
- `ScheduleGraphNodeData`
- `ScheduleGraphOptions`
- `ScheduleInput`
- `ScheduleLink`
- `ScheduleManualConflict`
- `ScheduleOptions`
- `ScheduleReason`
- `ScheduleReasonBound`
- `ScheduleReasonKind`
- `ScheduleReasonPhase`
- `ScheduleResult`
- `ScheduleSuccess`
- `ScheduleTask`
- `ScheduleTrace`
- `ScheduledBarFields`
- `ScheduledTask`
- `SerializeWeaveSnapshotOptions`
- `SettleResult`
- `ShortestGraphPathOptions`
- `SnapshotCodec`
- `SnapshotColumnDefinition`
- `SnapshotColumnState`
- `SnapshotDiagnostic`
- `SnapshotDiagnosticCode`
- `SnapshotDiagnosticSeverity`
- `SnapshotKind`
- `SnapshotLayoutFactory`
- `SnapshotMetadata`
- `SnapshotMigration`
- `SnapshotSortRule`
- `SplitDanglingLinks`
- `SplitDanglingLinksOptions`
- `StructureChange`
- `StructureDiff`
- `StructureDiffOptions`
- `StructureFieldChange`
- `StructureKeyAccessor`
- `StructureMove`
- `SvgExportOptions`
- `SvgExportTheme`
- `SvgExportThemeInput`
- `SvgToneColors`
- `TaskActuals`
- `TaskBoardBackgroundClick`
- `TaskBoardCard`
- `TaskBoardCardMove`
- `TaskBoardCardMoveValidator`
- `TaskBoardCell`
- `TaskBoardColumn`
- `TaskBoardColumnStatus`
- `TaskBoardComponent`
- `TaskBoardExportOptions`
- `TaskBoardExposed`
- `TaskBoardGroups`
- `TaskBoardLabels`
- `TaskBoardLane`
- `TaskBoardMoveCancel`
- `TaskBoardMoveCancelReason`
- `TaskBoardPngExportOptions`
- `TaskBoardPosition`
- `TaskBoardSvgLabels`
- `TaskBoardSvgOptions`
- `TaskViewBindingsInput`
- `TimeBucket`
- `TimeBucketAggregateOptions`
- `TimeBucketCell`
- `TimeBucketColumn`
- `TimeBucketColumnOptions`
- `TimeBucketItem`
- `TimeBucketLoaded`
- `TimeBucketPeriod`
- `TimeBucketPlacement`
- `TimeBucketReducer`
- `TimeBucketReducerContext`
- `TimeBucketRule`
- `TimeBucketRuleName`
- `TimeRange`
- `TimeRangeTargets`
- `TimeRangeTargetsOptions`
- `TimeScale`
- `TimelineBackgroundClick`
- `TimelineBand`
- `TimelineBar`
- `TimelineBarActivity`
- `TimelineBarEnd`
- `TimelineBarsInRangeOptions`
- `TimelineBaseline`
- `TimelineBaselineVariance`
- `TimelineCascade`
- `TimelineCellEdit`
- `TimelineColumn`
- `TimelineColumnResize`
- `TimelineConnection`
- `TimelineConnectionValidator`
- `TimelineConstraintEdit`
- `TimelineConstraintKind`
- `TimelineConstraints`
- `TimelineContextMenu`
- `TimelineContextTarget`
- `TimelineCreate`
- `TimelineCsvColumn`
- `TimelineCsvImport`
- `TimelineCsvImportOptions`
- `TimelineCsvOptions`
- `TimelineDataOptions`
- `TimelineDependency`
- `TimelineDependencyType`
- `TimelineDrop`
- `TimelineEdit`
- `TimelineEditCancel`
- `TimelineEditCancelReason`
- `TimelineFieldEdit`
- `TimelineFieldKind`
- `TimelineFieldSpec`
- `TimelineFitOptions`
- `TimelineHiddenTarget`
- `TimelineLoadRow`
- `TimelineLoadSegment`
- `TimelineMarker`
- `TimelineMarkerRange`
- `TimelineProgressEdit`
- `TimelineReconnect`
- `TimelineRow`
- `TimelineRowCompare`
- `TimelineRowMove`
- `TimelineRowPosition`
- `TimelineRowViewState`
- `TimelineRowsInput`
- `TimelineRowsProjection`
- `TimelineSelectDetail`
- `TimelineSheetAppliers`
- `TimelineSheetChanges`
- `TimelineSheetEdit`
- `TimelineSnapshotData`
- `TimelineSnapshotInput`
- `TimelineSnapshotV1`
- `TimelineSnapshotView`
- `TimelineSummary`
- `TimelineSvgOptions`
- `TimelineViewColumn`
- `TimelineViewDiagnostic`
- `TimelineViewDiagnosticCode`
- `TimelineViewFilter`
- `TimelineViewInput`
- `TimelineViewProjection`
- `TimelineViewSearch`
- `TimelineViewSort`
- `TimelineViewState`
- `TimelineVisibleWindow`
- `TimelineZoomPreset`
- `TimelineZoomState`
- `TopologicalOrderResult`
- `TransactionAdapter`
- `TransactionCoreState`
- `TransactionFailure`
- `TransactionOutcome`
- `TransactionSource`
- `TransactionStatus`
- `TreeGridActivation`
- `TreeGridCell`
- `TreeGridCellContent`
- `TreeGridCellEdit`
- `TreeGridCellEditValidator`
- `TreeGridCellRef`
- `TreeGridCellState`
- `TreeGridCellStatus`
- `TreeGridCellView`
- `TreeGridColumn`
- `TreeGridComponent`
- `TreeGridCursor`
- `TreeGridDrop`
- `TreeGridEditCancel`
- `TreeGridEditCancelReason`
- `TreeGridEditor`
- `TreeGridEntityMatches`
- `TreeGridExportOptions`
- `TreeGridExposed`
- `TreeGridIndex`
- `TreeGridInput`
- `TreeGridKeyAction`
- `TreeGridKeyContext`
- `TreeGridKeyInput`
- `TreeGridLabels`
- `TreeGridLine`
- `TreeGridLines`
- `TreeGridMissingCell`
- `TreeGridPngExportOptions`
- `TreeGridPosition`
- `TreeGridRange`
- `TreeGridRow`
- `TreeGridRowCreate`
- `TreeGridRowCreateValidator`
- `TreeGridRowDelete`
- `TreeGridRowDeleteValidator`
- `TreeGridSheetBuild`
- `TreeGridSheetEdit`
- `TreeGridSheetEditValidator`
- `TreeGridSpan`
- `TreeGridSvgOptions`
- `TreeGridTextOptions`
- `TreeGridValidatorResult`
- `TreeGridValue`
- `TreeGridViewInput`
- `TreeGridViewProjection`
- `TreeGridViewState`
- `UseAsyncGraphLayoutOptions`
- `UseEditTransactionOptions`
- `UseLinkedSelectionOptions`
- `UseWindowedDataOptions`
- `ViewBinding`
- `ViewBindingIndex`
- `ViewTarget`
- `ViewTargetEvent`
- `ViewTargetSource`
- `WeaveSnapshotInput`
- `WeaveSnapshotRegistry`
- `WeaveSnapshotV1`
- `WeeklyShift`
- `WindowedCell`
- `WindowedCellStatus`
- `WindowedCoverage`
- `WindowedData`
- `WindowedDataError`
- `WindowedDataLoader`
- `WindowedDataNormalizedOptions`
- `WindowedDataOptions`
- `WindowedDataPage`
- `WindowedDataRequest`
- `WindowedDataSettlement`
- `WindowedDataState`
- `WindowedDataTransition`
- `WindowedInFlightRequest`
- `WindowedView`
- `WorkCalendar`
- `WorkShift`
- `WorkWeek`

## Entry `./core`: runtime exports (267)

- `WeaveSnapshotError: function`
- `actualsTimelineBars: function`
- `aggregateTimeBuckets: function`
- `applyBoardCardMove: function`
- `applyGraphPositions: function`
- `applyGraphSizes: function`
- `applyRecurringEdit: function`
- `applyTimelineConstraintEdit: function`
- `applyTimelineSheetEdit: function`
- `applyTreeGridEdits: function`
- `assignLanes: function`
- `assignmentWorkPeriods: function`
- `baselineVariance: function`
- `beginGraphExpansion: function`
- `beginTransaction: function`
- `boardCardPosition: function`
- `buildGraphLayoutRequests: function`
- `buildPlacementInput: function`
- `buildTreeGridClear: function`
- `buildTreeGridFill: function`
- `buildTreeGridPaste: function`
- `buildViewBindingIndex: function`
- `buildWorkPeriods: function`
- `calculateResourceLoad: function`
- `calendarBands: function`
- `calendarZoomPresets: function`
- `cancelGraphExpansion: function`
- `cancelWindowedRequests: function`
- `checkGraphConnection: function`
- `clearTransactionResult: function`
- `cloneGraphElements: function`
- `collapseGraphGroups: function`
- `collectScheduleReasons: function`
- `comparePlans: function`
- `completeGraphLayout: function`
- `computeEarnedValue: function`
- `countGraphCrossings: function`
- `createGraphConnectionChecker: function`
- `createGraphExpansion: function`
- `createGraphRouteCache: function`
- `createResourceTimelineProjector: function`
- `createTimeBucketColumns: function`
- `createTimeScale: function`
- `createTimelineRowTree: function`
- `createTimelineViewState: function`
- `createTransactionState: function`
- `createTreeGridIndex: function`
- `createWindowedDataState: function`
- `createWorkingTimeScale: function`
- `cullGraphElements: function`
- `defaultNonWorkingRatio: number`
- `defaultSvgExportTheme: object`
- `deleteTreeGridRows: function`
- `dependencyEndsForType: function`
- `dependencyPath: function`
- `dependencyTimes: function`
- `dependencyTypeForEnds: function`
- `detectGraphCommunities: function`
- `diffStructure: function`
- `editTimeRange: function`
- `escapeXml: function`
- `eventCalendarDays: function`
- `eventCalendarMonthGrid: function`
- `eventCalendarRange: function`
- `eventCalendarTimeAt: function`
- `eventCalendarTimeOfDay: function`
- `expandRecurrence: function`
- `expandRecurringEvents: function`
- `fieldValuesEqual: function`
- `filterGraph: function`
- `filterTimelineRows: function`
- `findGraphCycles: function`
- `findOrthogonalRoute: function`
- `findTreeGridLine: function`
- `flattenTreeGrid: function`
- `formatDependencyLag: function`
- `formatFieldValue: function`
- `formatRecurrenceRule: function`
- `formatSheetText: function`
- `fromDrawio: function`
- `fromDrawioAsync: function`
- `fromGraphMl: function`
- `fromICalendar: function`
- `fromMermaid: function`
- `fromMsProjectXml: function`
- `graphAlignmentGuides: function`
- `graphBetweennessCentrality: function`
- `graphCameraAt: function`
- `graphCommunityGroups: function`
- `graphComponents: function`
- `graphConnectionTargets: function`
- `graphConnectionValidator: function`
- `graphConnectionViolations: function`
- `graphDegreeCentrality: function`
- `graphDeletion: function`
- `graphEdgeEndpoint: function`
- `graphExpansionView: function`
- `graphFlowBands: function`
- `graphLayoutBounds: function`
- `graphLayoutChangeMetrics: function`
- `graphLayoutFromJson: function`
- `graphLayoutInputKey: function`
- `graphLayoutMessageFromJson: function`
- `graphLayoutMessageToJson: function`
- `graphLayoutToJson: function`
- `graphNeighborhood: function`
- `graphNodesInPolygon: function`
- `graphPageRank: function`
- `graphPaletteMimeType: string`
- `graphPathBounds: function`
- `graphPathEndpoints: function`
- `graphPointInPolygon: function`
- `graphPolylinePath: function`
- `graphPortAnchor: function`
- `graphRectsIntersect: function`
- `graphSmoothPath: function`
- `graphSwimlaneAt: function`
- `graphTracePath: function`
- `graphViewportRect: function`
- `groupBoardCards: function`
- `indentTimelineRow: function`
- `indexGraph: function`
- `insertTreeGridRow: function`
- `intersectsWindow: function`
- `intlTimeFormatter: function`
- `invalidateWindowedData: function`
- `invertWorkPeriods: function`
- `isGraphRouteValid: function`
- `isTreeGridCellEditable: function`
- `layoutCalendarAgenda: function`
- `layoutCalendarDayEvents: function`
- `layoutCircularGraph: function`
- `layoutConcentricGraph: function`
- `layoutFlowGraph: function`
- `layoutForceGraph: function`
- `layoutGraphIncrementally: function`
- `layoutGridGraph: function`
- `layoutLayeredGraph: function`
- `layoutRadialGraph: function`
- `layoutSwimlaneGraph: function`
- `layoutTreeGraph: function`
- `levelResources: function`
- `matchTreeGridEntities: function`
- `maxEarnedValuePoints: number`
- `mergeGraphExpansionPage: function`
- `mirrorTimeScale: function`
- `moveTimeRanges: function`
- `moveTimelineRow: function`
- `nextTimelineSort: function`
- `normalizeWorkPeriods: function`
- `outdentTimelineRow: function`
- `packCalendarEventLanes: function`
- `parseCsv: function`
- `parseFieldValue: function`
- `parseGraphLayoutMessage: function`
- `parseRecurrenceRule: function`
- `parseSheetText: function`
- `parseTimelineViewState: function`
- `parseWeaveSnapshot: function`
- `placeGraphEdgeLabels: function`
- `planBaselines: function`
- `planComparisonTargets: function`
- `projectResourceTimeline: function`
- `projectTimelineRows: function`
- `projectTimelineView: function`
- `projectTreeGridRows: function`
- `propagateEdit: function`
- `proposeResourceAssignment: function`
- `reconcileTimelineViewColumns: function`
- `refreshTransactionState: function`
- `rejectWindowedRequest: function`
- `removeGraphElements: function`
- `removeTimelineBars: function`
- `renderEventCalendarSvg: function`
- `renderGraphSvg: function`
- `renderTaskBoardSvg: function`
- `renderTimelineSvg: function`
- `renderTreeGridSvg: function`
- `rescheduleFromActuals: function`
- `rescheduleFromStatusDate: function`
- `resetWindowedData: function`
- `resolveCollapsedTargets: function`
- `resolveEntityRefs: function`
- `resolveLoadTargets: function`
- `resolveResourceTimelineEdit: function`
- `resolveResourceTimelineEdits: function`
- `resolveTimeRangeTargets: function`
- `resolveTimelineColumns: function`
- `resolveTreeGridCell: function`
- `resolveViewTargets: function`
- `resolveWindowedRequest: function`
- `resourceLoadFromMsProject: function`
- `resourceLoadHistogram: function`
- `resourceTimelineBarId: function`
- `resourceTimelineCascade: function`
- `restoreWeaveSnapshot: function`
- `retryWindowedData: function`
- `rollupEarnedValue: function`
- `routeGraphEdges: function`
- `routeGraphPorts: function`
- `scheduleTasks: function`
- `scheduleToGraph: function`
- `scheduledBarFields: function`
- `searchGraphNodes: function`
- `serializeWeaveSnapshot: function`
- `setWindowedView: function`
- `settleTransaction: function`
- `shiftEventCalendarDate: function`
- `shortestGraphPath: function`
- `snapGraphPoint: function`
- `splitDanglingLinks: function`
- `summarizeTimelineRows: function`
- `taskViewBindings: function`
- `timeBucketIndex: function`
- `timeBucketIndexRange: function`
- `timeTicks: function`
- `timelineBarsInRange: function`
- `timelineBaseline: function`
- `timelineBaselineId: string`
- `timelineBaselineIds: function`
- `timelineBaselineLimit: number`
- `timelineConstraintKinds: object`
- `timelineConstraintViolated: function`
- `timelineConstraints: function`
- `timelineCsvTable: function`
- `timelineFromCsvTable: function`
- `timelineFromICalendar: function`
- `timelineFromMsProject: function`
- `timelineLabelColumnId: string`
- `timelineRowPosition: function`
- `timelineWbsCodes: function`
- `toCsv: function`
- `toDrawio: function`
- `toGraphMl: function`
- `toICalendar: function`
- `toMermaid: function`
- `toMsProjectXml: function`
- `toPlanningDiagnostics: function`
- `topologicalOrder: function`
- `traverseGraph: function`
- `treeGridCellContentFromTimeBucket: function`
- `treeGridCellText: function`
- `treeGridCellValue: function`
- `treeGridCellsFromTimeBuckets: function`
- `treeGridColumnAt: function`
- `treeGridColumnOffsets: function`
- `treeGridColumnWindow: function`
- `treeGridDefaultLabels: object`
- `treeGridDropAt: function`
- `treeGridFieldSpec: function`
- `treeGridKeyAction: function`
- `treeGridPositionAt: function`
- `treeGridRangeBounds: function`
- `treeGridRangeText: function`
- `treeGridRowCreate: function`
- `treeGridRowExpandable: function`
- `treeGridRowMoveForKey: function`
- `treeGridRowWindow: function`
- `validateCalendarEvents: function`
- `validateFieldValue: function`
- `validateGraphLayoutResponse: function`
- `validateInspectorList: function`
- `validateTimelineData: function`
- `visibleRows: function`
- `windowedCellStatus: function`
- `windowedCoverage: function`
- `workCalendarsFromMsProject: function`

## Entry `./core`: type-only exports (620)

- `ActualsDiagnostic`
- `ActualsDiagnosticCode`
- `ActualsTask`
- `ActualsTaskState`
- `ActualsTimelineBarOptions`
- `AssignLanesOptions`
- `AssignLanesResult`
- `BarsDeleteValidator`
- `BatchEditValidator`
- `CalendarAgendaDay`
- `CalendarAgendaItem`
- `CalendarBandLocalTime`
- `CalendarBandOptions`
- `CalendarBandUnit`
- `CalendarEvent`
- `CalendarEventColumn`
- `CalendarEventLane`
- `CalendarEventLaneLayout`
- `CalendarRecurrence`
- `CalendarResource`
- `CalendarZoomLevel`
- `CalendarZoomPreset`
- `CalendarZoomPresetOptions`
- `ChartDirection`
- `ChartTone`
- `CollapsedTargetsResult`
- `CollectScheduleReasonsOptions`
- `ColumnResizeValidator`
- `ConstraintEditValidator`
- `CreateValidator`
- `CsvCell`
- `CsvOptions`
- `CsvParseOptions`
- `DanglingLink`
- `DependencyPathStyle`
- `DrawioAsyncImportOptions`
- `DrawioImportOptions`
- `DrawioOptions`
- `EarnedValueAmounts`
- `EarnedValueEacMethod`
- `EarnedValueMetrics`
- `EarnedValueOptions`
- `EarnedValuePoint`
- `EarnedValueRecord`
- `EarnedValueResult`
- `EarnedValueSeriesOptions`
- `EarnedValueTask`
- `EarnedValueTaskResult`
- `EditMode`
- `EditTransaction`
- `EditValidator`
- `EntityRef`
- `EventCalendarBackgroundClick`
- `EventCalendarCreate`
- `EventCalendarCreateValidator`
- `EventCalendarDay`
- `EventCalendarEdit`
- `EventCalendarEditCancel`
- `EventCalendarEditCancelReason`
- `EventCalendarEditValidator`
- `EventCalendarExportOptions`
- `EventCalendarLabels`
- `EventCalendarOptions`
- `EventCalendarPngExportOptions`
- `EventCalendarSvgLabels`
- `EventCalendarSvgOptions`
- `EventCalendarView`
- `ExplainedLevelResourcesResult`
- `ExplainedLevelResourcesSuccess`
- `ExplainedScheduleResult`
- `ExplainedScheduleSuccess`
- `FieldCheck`
- `FieldChoice`
- `FieldDurationBasis`
- `FieldErrorCode`
- `FieldParseResult`
- `FieldPrimitive`
- `FieldValue`
- `GanttExportOptions`
- `GanttLabels`
- `GanttPngExportOptions`
- `GraphAlignment`
- `GraphAlignmentGuide`
- `GraphBetweennessOptions`
- `GraphBounds`
- `GraphBox`
- `GraphCameraTarget`
- `GraphCircularLayoutOptions`
- `GraphClipboardSelection`
- `GraphCloneOptions`
- `GraphCloneResult`
- `GraphCollapseOptions`
- `GraphCollapseResult`
- `GraphCollapsedGroup`
- `GraphCollapsedNode`
- `GraphCollapsedNodeData`
- `GraphCommunityGroupsOptions`
- `GraphCommunityOptions`
- `GraphCommunityResult`
- `GraphConcentricLayoutOptions`
- `GraphConnection`
- `GraphConnectionCheck`
- `GraphConnectionChecker`
- `GraphConnectionOrigin`
- `GraphConnectionRejection`
- `GraphConnectionRejectionCode`
- `GraphConnectionTargets`
- `GraphConnectionViolation`
- `GraphContextMenu`
- `GraphContextMenuTarget`
- `GraphCrossingReduction`
- `GraphCullKeep`
- `GraphDegreeCentralityOptions`
- `GraphDeletion`
- `GraphEdge`
- `GraphEdgeBand`
- `GraphEdgeLabelPlacement`
- `GraphEdgeLabelPlacementOptions`
- `GraphEdgeLabelSize`
- `GraphEdgeMarker`
- `GraphEdgeReshape`
- `GraphEdgeRouteOptions`
- `GraphEdgeStyle`
- `GraphExpansionKeyOptions`
- `GraphExpansionPage`
- `GraphExpansionState`
- `GraphExpansionView`
- `GraphExportOptions`
- `GraphFilterOptions`
- `GraphFitOptions`
- `GraphFlowBand`
- `GraphFlowExcludedEdge`
- `GraphFlowLayout`
- `GraphFlowNode`
- `GraphFlowOptions`
- `GraphFlowScale`
- `GraphForceLayoutOptions`
- `GraphGesture`
- `GraphGestureEnd`
- `GraphGestureKind`
- `GraphGridLayoutOptions`
- `GraphGroup`
- `GraphIncrementalLayout`
- `GraphIncrementalLayoutOptions`
- `GraphIndex`
- `GraphInterchangeImport`
- `GraphInterchangeImportOptions`
- `GraphInterchangeInput`
- `GraphInterchangeWarning`
- `GraphInterchangeWarningCode`
- `GraphKnownPosition`
- `GraphLabelEdit`
- `GraphLabels`
- `GraphLayeredLayoutOptions`
- `GraphLayout`
- `GraphLayoutCancelMessage`
- `GraphLayoutChangeMetrics`
- `GraphLayoutChangeOptions`
- `GraphLayoutCompletion`
- `GraphLayoutCompletionOptions`
- `GraphLayoutDirection`
- `GraphLayoutFailureMessage`
- `GraphLayoutFunction`
- `GraphLayoutJson`
- `GraphLayoutKeyInput`
- `GraphLayoutOptions`
- `GraphLayoutRequest`
- `GraphLayoutRequestInput`
- `GraphLayoutRequestJson`
- `GraphLayoutRequestMessage`
- `GraphLayoutRequests`
- `GraphLayoutResponse`
- `GraphLayoutRoute`
- `GraphLayoutScope`
- `GraphLayoutSuccessMessage`
- `GraphLayoutWorkerJsonMessage`
- `GraphLayoutWorkerMessage`
- `GraphMlOptions`
- `GraphNodeMatch`
- `GraphNodeMove`
- `GraphNodeResize`
- `GraphNodeSize`
- `GraphObstacleAvoidance`
- `GraphPageRankOptions`
- `GraphPageRankResult`
- `GraphPaletteDrop`
- `GraphPaletteItem`
- `GraphPaletteLabels`
- `GraphPaste`
- `GraphPathResult`
- `GraphPngExportOptions`
- `GraphPoint`
- `GraphPort`
- `GraphPortDirection`
- `GraphPortRouteOptions`
- `GraphPortRule`
- `GraphPortRules`
- `GraphRadialLayoutOptions`
- `GraphReconnect`
- `GraphRect`
- `GraphRouteCache`
- `GraphRouteEnd`
- `GraphRoutingPolicy`
- `GraphSearchOptions`
- `GraphSelectionMode`
- `GraphShownEdge`
- `GraphShownNode`
- `GraphSnapshotData`
- `GraphSnapshotInput`
- `GraphSnapshotV1`
- `GraphSnapshotView`
- `GraphSvgGroup`
- `GraphSvgOptions`
- `GraphSwimlane`
- `GraphSwimlaneBand`
- `GraphSwimlaneLayout`
- `GraphSwimlaneLayoutOptions`
- `GraphSwimlanePool`
- `GraphSwimlanePoolBand`
- `GraphSwimlanePoolSpec`
- `GraphSwimlaneSpec`
- `GraphTracedPath`
- `GraphTraversalDirection`
- `GraphTraversalOptions`
- `GraphTraversalResult`
- `GraphTraversalStep`
- `GraphTraversalTruncation`
- `GraphTraversalVia`
- `GraphTreeLayoutOptions`
- `GraphViewTarget`
- `GraphViewport`
- `GraphVisibleIds`
- `GraphWalkDirection`
- `ICalendarEvent`
- `ICalendarExpandOptions`
- `ICalendarImport`
- `ICalendarImportEvent`
- `ICalendarImportOptions`
- `ICalendarImportWarning`
- `ICalendarImportWarningCode`
- `ICalendarOptions`
- `ICalendarTimeline`
- `IdentifiedNode`
- `InspectorAssignment`
- `InspectorAssignmentsField`
- `InspectorChange`
- `InspectorChangeValidator`
- `InspectorDependenciesField`
- `InspectorDependency`
- `InspectorField`
- `InspectorFieldKind`
- `InspectorItem`
- `InspectorListChange`
- `InspectorListChangeValidator`
- `InspectorListField`
- `InspectorListFieldKind`
- `InspectorOption`
- `IntlTimeFormatterOptions`
- `JsonValue`
- `LevelResourcesInput`
- `LevelResourcesResult`
- `LevelResourcesSuccess`
- `LoadSegmentLike`
- `LoadViewTarget`
- `MermaidDirection`
- `MermaidOptions`
- `MsProjectAssignment`
- `MsProjectBaseline`
- `MsProjectCalendar`
- `MsProjectDependency`
- `MsProjectImport`
- `MsProjectImportTask`
- `MsProjectImportWarning`
- `MsProjectImportWarningCode`
- `MsProjectInput`
- `MsProjectResource`
- `MsProjectResourceLoad`
- `MsProjectResourceLoadOptions`
- `MsProjectTask`
- `MsProjectTimeline`
- `MsProjectTimelineOptions`
- `MsProjectXmlOptions`
- `NetworkEdgeSlot`
- `NetworkEdgeToolbarSlot`
- `NetworkFlowchartShape`
- `NetworkFocusOptions`
- `NetworkGroup`
- `NetworkGroupSlot`
- `NetworkMinimapNodeSlot`
- `NetworkNode`
- `NetworkNodeEvent`
- `NetworkNodeLabelPosition`
- `NetworkNodeMarker`
- `NetworkNodeShape`
- `NetworkNodeSlot`
- `NetworkNodeToolbarSlot`
- `NetworkTooltipSlot`
- `ParseWeaveSnapshotOptions`
- `ParseWeaveSnapshotResult`
- `PendingTransaction`
- `PlacementDiagnostic`
- `PlacementInput`
- `PlacementPredecessorDiagnostic`
- `PlacementResult`
- `PlacementRetargetedDependency`
- `PlacementSummaryDiagnostic`
- `PlanAssignmentChange`
- `PlanAssignmentDiff`
- `PlanCollectionDiff`
- `PlanComparison`
- `PlanComparisonInput`
- `PlanComparisonTargetOptions`
- `PlanComparisonTargets`
- `PlanComparisonTask`
- `PlanFieldChange`
- `PlanInputDiff`
- `PlanResourceOverload`
- `PlanResultDiff`
- `PlanScenario`
- `PlanScheduleState`
- `PlanTaskComparison`
- `PlanTaskSide`
- `PlanViolation`
- `PlanningDiagnostic`
- `PlanningDiagnosticCode`
- `PlanningDiagnosticSeverity`
- `PlanningPlacement`
- `PlanningSnapshotData`
- `PlanningSnapshotInput`
- `PlanningSnapshotV1`
- `PlanningTaskDisplay`
- `PngExportOptions`
- `ProgressEditValidator`
- `PropagateEditResult`
- `PropagateEditSuccess`
- `PropertyInspectorFieldSlot`
- `PropertyInspectorLabels`
- `RecurrenceExpandOptions`
- `RecurrenceFrequency`
- `RecurrenceOccurrence`
- `RecurrenceRule`
- `RecurrenceSeries`
- `RecurrenceWeekday`
- `RecurrenceZoneOptions`
- `RecurringEditChange`
- `RecurringEditOptions`
- `RecurringEditScope`
- `RecurringEditTarget`
- `RescheduleFromActualsFields`
- `RescheduleFromActualsResult`
- `ResolvedEntityRefs`
- `ResolvedLoadTargets`
- `ResolvedViewTargets`
- `ResourceAssignment`
- `ResourceAssignmentProposal`
- `ResourceAssignmentReplacement`
- `ResourceAssignmentRequest`
- `ResourceAssignmentState`
- `ResourceBarOrigin`
- `ResourceCapacity`
- `ResourceCapacityPeriod`
- `ResourceDelay`
- `ResourceLoadHistogram`
- `ResourceLoadOptions`
- `ResourceLoadSegment`
- `ResourceTimelineEditResolution`
- `ResourceTimelineEditsResolution`
- `ResourceTimelineInput`
- `ResourceTimelineOptions`
- `ResourceTimelineProjection`
- `ResourceTimelineRejection`
- `ResourceTimelineRejectionCode`
- `ResourceTimelineResource`
- `ResourceTimelineScheduleChange`
- `ResourceTimelineTask`
- `RestoreWeaveSnapshotResult`
- `RestoredColumn`
- `RestoredGraphSnapshot`
- `RestoredGraphView`
- `RestoredPlanningSnapshot`
- `RestoredSortRule`
- `RestoredTimelineSnapshot`
- `RestoredTimelineView`
- `RestoredWeaveSnapshot`
- `RevealOptions`
- `RevealResult`
- `RevealStatus`
- `RowMoveValidator`
- `SaveResult`
- `ScheduleChange`
- `ScheduleConstraintName`
- `ScheduleCycle`
- `ScheduleEdit`
- `ScheduleFailure`
- `ScheduleGraph`
- `ScheduleGraphEdgeData`
- `ScheduleGraphNodeData`
- `ScheduleGraphOptions`
- `ScheduleInput`
- `ScheduleLink`
- `ScheduleManualConflict`
- `ScheduleOptions`
- `ScheduleReason`
- `ScheduleReasonBound`
- `ScheduleReasonKind`
- `ScheduleReasonPhase`
- `ScheduleResult`
- `ScheduleSuccess`
- `ScheduleTask`
- `ScheduleTrace`
- `ScheduledBarFields`
- `ScheduledTask`
- `SerializeWeaveSnapshotOptions`
- `SettleResult`
- `ShortestGraphPathOptions`
- `SnapshotCodec`
- `SnapshotColumnDefinition`
- `SnapshotColumnState`
- `SnapshotDiagnostic`
- `SnapshotDiagnosticCode`
- `SnapshotDiagnosticSeverity`
- `SnapshotKind`
- `SnapshotLayoutFactory`
- `SnapshotMetadata`
- `SnapshotMigration`
- `SnapshotSortRule`
- `SplitDanglingLinks`
- `SplitDanglingLinksOptions`
- `StructureChange`
- `StructureDiff`
- `StructureDiffOptions`
- `StructureFieldChange`
- `StructureKeyAccessor`
- `StructureMove`
- `SvgExportOptions`
- `SvgExportTheme`
- `SvgExportThemeInput`
- `SvgToneColors`
- `TaskActuals`
- `TaskBoardBackgroundClick`
- `TaskBoardCard`
- `TaskBoardCardMove`
- `TaskBoardCardMoveValidator`
- `TaskBoardCell`
- `TaskBoardColumn`
- `TaskBoardColumnStatus`
- `TaskBoardExportOptions`
- `TaskBoardGroups`
- `TaskBoardLabels`
- `TaskBoardLane`
- `TaskBoardMoveCancel`
- `TaskBoardMoveCancelReason`
- `TaskBoardPngExportOptions`
- `TaskBoardPosition`
- `TaskBoardSvgLabels`
- `TaskBoardSvgOptions`
- `TaskViewBindingsInput`
- `TimeBucket`
- `TimeBucketAggregateOptions`
- `TimeBucketCell`
- `TimeBucketColumn`
- `TimeBucketColumnOptions`
- `TimeBucketItem`
- `TimeBucketLoaded`
- `TimeBucketPeriod`
- `TimeBucketPlacement`
- `TimeBucketReducer`
- `TimeBucketReducerContext`
- `TimeBucketRule`
- `TimeBucketRuleName`
- `TimeRange`
- `TimeRangeTargets`
- `TimeRangeTargetsOptions`
- `TimeScale`
- `TimelineBackgroundClick`
- `TimelineBand`
- `TimelineBar`
- `TimelineBarActivity`
- `TimelineBarEnd`
- `TimelineBarsInRangeOptions`
- `TimelineBaseline`
- `TimelineBaselineVariance`
- `TimelineCascade`
- `TimelineCellEdit`
- `TimelineColumn`
- `TimelineColumnResize`
- `TimelineConnection`
- `TimelineConnectionValidator`
- `TimelineConstraintEdit`
- `TimelineConstraintKind`
- `TimelineConstraints`
- `TimelineContextMenu`
- `TimelineContextTarget`
- `TimelineCreate`
- `TimelineCsvColumn`
- `TimelineCsvImport`
- `TimelineCsvImportOptions`
- `TimelineCsvOptions`
- `TimelineDataOptions`
- `TimelineDependency`
- `TimelineDependencyType`
- `TimelineEdit`
- `TimelineEditCancel`
- `TimelineEditCancelReason`
- `TimelineFieldEdit`
- `TimelineFieldKind`
- `TimelineFieldSpec`
- `TimelineFitOptions`
- `TimelineHiddenTarget`
- `TimelineLoadRow`
- `TimelineLoadSegment`
- `TimelineMarker`
- `TimelineMarkerRange`
- `TimelineProgressEdit`
- `TimelineReconnect`
- `TimelineRow`
- `TimelineRowCompare`
- `TimelineRowMove`
- `TimelineRowPosition`
- `TimelineRowViewState`
- `TimelineRowsInput`
- `TimelineRowsProjection`
- `TimelineSelectDetail`
- `TimelineSheetAppliers`
- `TimelineSheetChanges`
- `TimelineSheetEdit`
- `TimelineSnapshotData`
- `TimelineSnapshotInput`
- `TimelineSnapshotV1`
- `TimelineSnapshotView`
- `TimelineSummary`
- `TimelineSvgOptions`
- `TimelineViewColumn`
- `TimelineViewDiagnostic`
- `TimelineViewDiagnosticCode`
- `TimelineViewFilter`
- `TimelineViewInput`
- `TimelineViewProjection`
- `TimelineViewSearch`
- `TimelineViewSort`
- `TimelineViewState`
- `TimelineVisibleWindow`
- `TimelineZoomPreset`
- `TimelineZoomState`
- `TopologicalOrderResult`
- `TransactionAdapter`
- `TransactionCoreState`
- `TransactionFailure`
- `TransactionOutcome`
- `TransactionSource`
- `TransactionStatus`
- `TreeGridActivation`
- `TreeGridCell`
- `TreeGridCellContent`
- `TreeGridCellEdit`
- `TreeGridCellEditValidator`
- `TreeGridCellRef`
- `TreeGridCellState`
- `TreeGridCellStatus`
- `TreeGridCellView`
- `TreeGridColumn`
- `TreeGridCursor`
- `TreeGridDrop`
- `TreeGridEditCancel`
- `TreeGridEditCancelReason`
- `TreeGridEditor`
- `TreeGridEntityMatches`
- `TreeGridExportOptions`
- `TreeGridIndex`
- `TreeGridInput`
- `TreeGridKeyAction`
- `TreeGridKeyContext`
- `TreeGridKeyInput`
- `TreeGridLabels`
- `TreeGridLine`
- `TreeGridLines`
- `TreeGridMissingCell`
- `TreeGridPngExportOptions`
- `TreeGridPosition`
- `TreeGridRange`
- `TreeGridRow`
- `TreeGridRowCreate`
- `TreeGridRowCreateValidator`
- `TreeGridRowDelete`
- `TreeGridRowDeleteValidator`
- `TreeGridSheetBuild`
- `TreeGridSheetEdit`
- `TreeGridSheetEditValidator`
- `TreeGridSpan`
- `TreeGridSvgOptions`
- `TreeGridTextOptions`
- `TreeGridValidatorResult`
- `TreeGridValue`
- `TreeGridViewInput`
- `TreeGridViewProjection`
- `TreeGridViewState`
- `ViewBinding`
- `ViewBindingIndex`
- `ViewTarget`
- `ViewTargetEvent`
- `ViewTargetSource`
- `WeaveSnapshotInput`
- `WeaveSnapshotRegistry`
- `WeaveSnapshotV1`
- `WeeklyShift`
- `WindowedCell`
- `WindowedCellStatus`
- `WindowedCoverage`
- `WindowedDataNormalizedOptions`
- `WindowedDataOptions`
- `WindowedDataPage`
- `WindowedDataRequest`
- `WindowedDataSettlement`
- `WindowedDataState`
- `WindowedDataTransition`
- `WindowedInFlightRequest`
- `WindowedView`
- `WorkCalendar`
- `WorkShift`
- `WorkWeek`

## Component `NetworkGraph`: props

```ts
alignmentGuides?: boolean;
autoPan?: boolean;
avoidNodes?: boolean | GraphObstacleAvoidance;
background?: "none" | "dots" | "lines";
backgroundGap?: number;
boxSelect?: boolean;
clipboard?: boolean;
collapsedGroupIds?: ReadonlySet<string>;
collapsibleGroups?: boolean;
connectable?: boolean;
connectionRules?: GraphPortRules;
contextMenu?: boolean;
cullOffscreen?: boolean;
cullOverscan?: number;
deletable?: boolean;
dimmedIds?: ReadonlySet<string>;
dir?: ChartDirection;
draggable?: boolean;
droppable?: boolean;
edgeBands?: ReadonlyMap<string, GraphEdgeBand>;
edgeLabelPlacement?: GraphEdgeLabelPlacement<GraphShownEdge<E, G>>;
edgeStyle?: GraphEdgeStyle;
edges: readonly E[];
edgesSelectable?: boolean;
editableEdges?: boolean;
editableLabels?: boolean;
groups?: readonly G[];
guideThreshold?: number;
height?: number | string;
highlightedEdgeIds?: ReadonlySet<string>;
highlightedNodeIds?: ReadonlySet<string>;
labels?: Partial<GraphLabels>;
lanes?: readonly GraphSwimlaneBand[];
layout?: GraphLayoutFunction<GraphShownNode<N, G>, GraphShownEdge<E, G>>;
lodThreshold?: number;
matchIds?: ReadonlySet<string>;
minNodeSize?: GraphNodeSize;
nodes: readonly N[];
onIdleEscape?: (event: KeyboardEvent) => void;
options?: GraphLayeredLayoutOptions;
parallelEdgeSpacing?: number;
pools?: readonly GraphSwimlanePoolBand[];
positions?: ReadonlyMap<string, GraphPoint>;
reconnectable?: boolean;
relatedIds?: ReadonlySet<string>;
resizable?: boolean;
routingPolicy?: GraphRoutingPolicy;
selectedEdgeIds?: ReadonlySet<string>;
selectedId?: string;
selectedIds?: ReadonlySet<string>;
selectionMode?: GraphSelectionMode;
showControls?: boolean;
showMinimap?: boolean;
sizes?: ReadonlyMap<string, GraphNodeSize>;
snapGrid?: number;
tooltipDelay?: number;
unstyledNodeSlots?: boolean;
validateConnection?: (connection: GraphConnection, replacingEdgeId?: string) => boolean | string | void;
validateDelete?: (deletion: GraphDeletion) => boolean | string | void;
validateEdgeReshape?: (change: GraphEdgeReshape) => boolean | string | void;
validateLabelEdit?: (change: GraphLabelEdit) => boolean | string | void;
validateNodeResize?: (change: GraphNodeResize) => boolean | string | void;
```

## Component `NetworkGraph`: emits

```ts
(evt: "background-click", point: GraphPoint) => void
(evt: "connect", connection: GraphConnection) => void
(evt: "connect-rejected", connection: GraphConnection, reason: string) => void
(evt: "context-menu", event: GraphContextMenu) => void
(evt: "copy-selection", selection: GraphClipboardSelection) => void
(evt: "delete", deletion: GraphDeletion) => void
(evt: "delete-rejected", deletion: GraphDeletion, reason: string) => void
(evt: "duplicate-selection", selection: GraphClipboardSelection) => void
(evt: "edge-reshape", change: GraphEdgeReshape) => void
(evt: "edge-reshape-rejected", change: GraphEdgeReshape, reason: string) => void
(evt: "edge-select", id: string) => void
(evt: "gesture-end", gesture: GraphGestureEnd) => void
(evt: "gesture-start", gesture: GraphGesture) => void
(evt: "label-edit", change: GraphLabelEdit) => void
(evt: "label-edit-rejected", change: GraphLabelEdit, reason: string) => void
(evt: "node-drop", event: GraphDrop) => void
(evt: "node-move", change: GraphNodeMove) => void
(evt: "node-resize", change: GraphNodeResize) => void
(evt: "node-resize-rejected", change: GraphNodeResize, reason: string) => void
(evt: "nodes-move", changes: GraphNodeMove[]) => void
(evt: "paste-request", event: GraphPaste) => void
(evt: "reconnect", change: GraphReconnect) => void
(evt: "select", id: string) => void
(evt: "target-activate", event: ViewTargetEvent<{
    view: "graph";
    kind: "node" | "edge" | "group";
    id: string;
}>) => void
(evt: "target-enter", event: ViewTargetEvent<{
    view: "graph";
    kind: "node" | "edge" | "group";
    id: string;
}>) => void
(evt: "target-leave", event: ViewTargetEvent<{
    view: "graph";
    kind: "node" | "edge" | "group";
    id: string;
}>) => void
(evt: "update:collapsedGroupIds", ids: Set<string>) => void
(evt: "update:selectedEdgeIds", ids: Set<string>) => void
(evt: "update:selectedId", id: string) => void
(evt: "update:selectedIds", ids: Set<string>) => void
(evt: "viewport-change", viewport: GraphViewport) => void
```

## Component `NetworkGraph`: slots

```ts
'edge-toolbar'?(props: NetworkEdgeToolbarSlot<GraphShownEdge<E, G>>): unknown;
'minimap-node'?(props: NetworkMinimapNodeSlot<GraphShownNode<N, G>>): unknown;
'node-toolbar'?(props: NetworkNodeToolbarSlot<GraphShownNode<N, G>>): unknown;
edge(props: NetworkEdgeSlot<GraphShownEdge<E, G>>): unknown;
empty(): unknown;
group?(props: NetworkGroupSlot<G>): unknown;
node(props: NetworkNodeSlot<GraphShownNode<N, G>>): unknown;
tooltip?(props: NetworkTooltipSlot<GraphShownNode<N, G>, GraphShownEdge<E, G>>): unknown;
```

## Component `NetworkGraph`: exposed

```ts
exportPng: (options?: GraphPngExportOptions<GraphShownNode<N, G>, GraphShownEdge<E, G>>) => Promise<Blob>;
exportSvg: (options?: GraphExportOptions<GraphShownNode<N, G>, GraphShownEdge<E, G>>) => string;
fit: (options?: GraphFitOptions) => void;
focusNode: (id: string, options?: NetworkFocusOptions) => void;
getTargetClientRect: (target: ViewTarget) => DOMRect | undefined;
getViewport: () => {
    x: number;
    y: number;
    scale: number;
};
getViewportCenter: () => GraphPoint;
revealNode: (id: string, options?: RevealOptions) => Promise<RevealResult>;
setViewport: (value: GraphViewport) => void;
setViewportCenter: (center: GraphPoint, scale?: number) => void;
toGraphPoint: (clientX: number, clientY: number) => GraphPoint;
zoom: (factor: number, x?: number, y?: number) => void;
```

## Component `GanttChart`: props

```ts
autoScroll?: boolean;
bars: readonly B[];
baselineIds?: readonly string[];
baselineLabel?: (id: string) => string;
cascade?: TimelineCascade;
collapsedIds?: ReadonlySet<string>;
columns?: readonly TimelineColumn<R>[];
columnsResizable?: boolean;
connectable?: boolean;
constraintsEditable?: boolean;
contextMenu?: boolean;
creatable?: boolean | ((row: R) => boolean);
createDuration?: number;
deletable?: boolean;
dependencies?: readonly TimelineDependency[];
dependencyStyle?: DependencyPathStyle;
dir?: ChartDirection;
droppable?: boolean;
editBounds?: TimeRange;
filterableColumns?: boolean | readonly string[];
filters?: readonly TimelineViewFilter[];
formatLag?: (lag: number) => string;
formatTime?: (time: number) => string;
formatVariance?: (delta: number) => string;
headerBands?: readonly (readonly TimelineBand[])[];
height?: number | string;
highlightedBarIds?: ReadonlySet<string>;
highlightedDependencyIds?: ReadonlySet<string>;
highlightedLoadTargets?: readonly LoadViewTarget[];
labelWidth?: number;
labels?: Partial<GanttLabels>;
laneCount?: number;
loadRowHeight?: number;
loadRows?: readonly TimelineLoadRow[];
loadSegments?: readonly TimelineLoadSegment[];
loadSelectable?: boolean;
markerRanges?: readonly TimelineMarkerRange[];
markers?: readonly TimelineMarker[];
maxColumnWidth?: number;
minColumnWidth?: number;
minDuration?: number;
multiSelect?: boolean;
nonWorkingPeriods?: readonly TimeRange[];
now?: number;
onIdleEscape?: (event: KeyboardEvent) => void;
pinchZoom?: boolean;
pixelsPerUnit?: number;
progressEditable?: boolean;
progressStep?: number;
range: TimeRange;
readonly?: boolean;
reconnectable?: boolean;
rowDraggable?: boolean;
rowHeight?: number;
rows: readonly R[];
rowsReorderable?: boolean;
scale?: TimeScale;
selectedDependencyId?: string;
selectedIds?: ReadonlySet<string>;
selectedLoadTargets?: readonly LoadViewTarget[];
showControls?: boolean;
showNow?: boolean;
showProgressLine?: boolean;
showSummaries?: boolean;
snap?: number;
sort?: readonly TimelineViewSort[];
sortableColumns?: boolean | readonly string[];
spreadsheet?: boolean;
statusDate?: number;
stickyBandLabels?: boolean;
summaryDependencies?: boolean;
tickSteps?: readonly number[];
tooltipDelay?: number;
validateBarsDelete?: BarsDeleteValidator;
validateCellEdit?: (change: TimelineCellEdit) => boolean | string | void;
validateColumnResize?: ColumnResizeValidator;
validateConnection?: TimelineConnectionValidator;
validateConstraintEdit?: ConstraintEditValidator;
validateCreate?: CreateValidator;
validateEdit?: EditValidator;
validateEdits?: BatchEditValidator;
validateFieldEdit?: (change: TimelineFieldEdit<R>) => boolean | string | void;
validateProgressEdit?: ProgressEditValidator;
validateRowMove?: RowMoveValidator;
validateSheetEdit?: (change: TimelineSheetEdit<R>) => boolean | string | void;
visibleWindowDelay?: number;
wheelZoom?: boolean;
zoomPreset?: string;
zoomPresets?: readonly TimelineZoomPreset[];
```

## Component `GanttChart`: emits

```ts
(evt: "background-click", click: TimelineBackgroundClick) => void
(evt: "bar-drop", event: TimelineDrop) => void
(evt: "bars-delete", ids: string[]) => void
(evt: "bars-delete-rejected", ids: string[], reason: string) => void
(evt: "cell-edit", change: TimelineCellEdit) => void
(evt: "cell-edit-rejected", change: TimelineCellEdit, reason: string) => void
(evt: "column-resize", change: TimelineColumnResize) => void
(evt: "column-resize-rejected", change: TimelineColumnResize, reason: string) => void
(evt: "connect", connection: TimelineConnection) => void
(evt: "connect-rejected", connection: TimelineConnection, reason: string) => void
(evt: "constraint-edit", change: TimelineConstraintEdit) => void
(evt: "constraint-edit-rejected", change: TimelineConstraintEdit, reason: string) => void
(evt: "context-menu", event: TimelineContextMenu) => void
(evt: "create", proposal: TimelineCreate) => void
(evt: "create-rejected", proposal: TimelineCreate, reason: string) => void
(evt: "dependency-delete", id: string) => void
(evt: "dependency-select", id: string) => void
(evt: "edit", change: TimelineEdit) => void
(evt: "edit-cancel", event: TimelineEditCancel) => void
(evt: "edit-rejected", change: TimelineEdit, reason: string) => void
(evt: "edits", changes: TimelineEdit[]) => void
(evt: "edits-rejected", changes: TimelineEdit[], reason: string) => void
(evt: "field-edit", change: TimelineFieldEdit<R>) => void
(evt: "field-edit-rejected", change: TimelineFieldEdit<R>, reason: string) => void
(evt: "progress-edit", change: TimelineProgressEdit) => void
(evt: "progress-edit-rejected", change: TimelineProgressEdit, reason: string) => void
(evt: "reconnect", change: TimelineReconnect) => void
(evt: "row-move", change: TimelineRowMove) => void
(evt: "row-move-rejected", change: TimelineRowMove, reason: string) => void
(evt: "select", id: string, detail: TimelineSelectDetail) => void
(evt: "sheet-edit", change: TimelineSheetEdit<R>) => void
(evt: "sheet-edit-rejected", reason: string, change?: TimelineSheetEdit<R> | undefined) => void
(evt: "target-activate", event: ViewTargetEvent<ViewTarget>) => void
(evt: "target-enter", event: ViewTargetEvent<ViewTarget>) => void
(evt: "target-leave", event: ViewTargetEvent<ViewTarget>) => void
(evt: "update:collapsedIds", ids: Set<string>) => void
(evt: "update:filters", filters: TimelineViewFilter[]) => void
(evt: "update:selectedDependencyId", id: string) => void
(evt: "update:selectedIds", ids: Set<string>) => void
(evt: "update:sort", sort: TimelineViewSort[]) => void
(evt: "update:zoomPreset", id: string) => void
(evt: "validation-error", error: Error) => void
(evt: "visible-window-change", window: TimelineVisibleWindow) => void
(evt: "zoom-change", state: TimelineZoomState) => void
```

## Component `GanttChart`: slots

```ts
'cell-editor'(props: {
    row: R;
    column: TimelineColumn<R>;
    field: TimelineFieldSpec<R>;
    value: FieldValue;
    draft: FieldValue;
    validation: FieldCheck;
    error: string | undefined;
    source: ViewTargetSource;
    commit: (value: FieldValue, source?: ViewTargetSource) => FieldCheck;
    commitText: (text: string, source?: ViewTargetSource) => FieldCheck;
    cancel: () => void;
}): unknown;
'load-row'(props: {
    row: TimelineLoadRow;
    peak: number;
}): unknown;
'load-segment'(props: {
    segment: TimelineLoadSegment;
    row: TimelineLoadRow;
    peak: number;
    overload: number;
}): unknown;
'row-heading'(): unknown;
bar(props: {
    bar: B;
    range: TimeRange;
    selected: boolean;
}): unknown;
cell(props: {
    row: R;
    column: TimelineColumn<R>;
    value: string | number;
    summary?: TimelineSummary;
}): unknown;
empty(): unknown;
legend(): unknown;
row(props: {
    row: R;
    index: number;
    depth: number;
    expanded: boolean;
}): unknown;
tick(props: {
    time: number;
    label: string;
}): unknown;
tooltip(props: {
    bar: B;
    range: TimeRange;
    selected: boolean;
}): unknown;
```

## Component `GanttChart`: exposed

```ts
cancelEdit: () => void;
exportPng: (options?: GanttPngExportOptions<R, B>) => Promise<Blob>;
exportSvg: (options?: GanttExportOptions<R, B>) => string;
fitToBars: (ids?: Iterable<string>, options?: TimelineFitOptions) => Promise<void>;
revealBar: (id: string, options?: RevealOptions) => Promise<RevealResult>;
scrollToRow: (id: string) => void;
scrollToTime: (time: number) => void;
```

## Component `GraphPalette`: props

```ts
dir?: ChartDirection;
items: readonly GraphPaletteItem<D>[];
labels?: Partial<GraphPaletteLabels>;
searchable?: boolean;
```

## Component `GraphPalette`: emits

```ts
(evt: "insert", item: GraphPaletteItem<D>) => void
```

## Component `GraphPalette`: slots

```ts
item?(props: {
    item: GraphPaletteItem<D>;
    active: boolean;
}): unknown;
```

## Component `GraphPalette`: exposed

```ts
focusItem: (id?: string) => Promise<boolean>;
```

## Component `PropertyInspector`: props

```ts
dir?: ChartDirection;
fields: readonly (InspectorField<T> | InspectorListField<T>)[];
item?: T | null;
labels?: Partial<PropertyInspectorLabels>;
validateChange?: InspectorChangeValidator<T>;
validateListChange?: InspectorListChangeValidator<T>;
```

## Component `PropertyInspector`: emits

```ts
(evt: "change", change: InspectorChange) => void
(evt: "change-rejected", change: InspectorChange, reason: string) => void
(evt: "list-change", change: InspectorListChange) => void
(evt: "list-change-rejected", change: InspectorListChange, reason: string) => void
```

## Component `PropertyInspector`: slots

```ts
[name: `field-${string}`]: ((props: PropertyInspectorFieldSlot<T>) => unknown) | undefined;
empty?(): unknown;
```

## Component `PropertyInspector`: exposed

```ts
cancelEdits(): void;
focusField(id: string): boolean;
```

## Component `TaskBoard`: props

```ts
autoScroll?: boolean;
cards: readonly C[];
collapsedColumnIds?: readonly string[];
collapsedLaneIds?: readonly string[];
collapsible?: boolean;
columns: readonly TaskBoardColumn[];
dir?: ChartDirection;
filter?: (card: C) => boolean;
height?: number | string;
labels?: Partial<TaskBoardLabels>;
lanes?: readonly TaskBoardLane[];
readonly?: boolean;
selectedId?: string;
validateCardMove?: TaskBoardCardMoveValidator;
```

## Component `TaskBoard`: emits

```ts
(evt: "background-click", event: TaskBoardBackgroundClick) => void
(evt: "card-activate", id: string) => void
(evt: "card-move", change: TaskBoardCardMove) => void
(evt: "card-move-cancel", event: TaskBoardMoveCancel) => void
(evt: "card-move-rejected", change: TaskBoardCardMove, reason: string) => void
(evt: "update:collapsedColumnIds", ids: string[]) => void
(evt: "update:collapsedLaneIds", ids: string[]) => void
(evt: "update:selectedId", id: string) => void
(evt: "validation-error", error: Error) => void
```

## Component `TaskBoard`: slots

```ts
'column-header'(props: {
    column: TaskBoardColumn;
    status: TaskBoardColumnStatus;
    collapsed: boolean;
    toggle: () => void;
    toggleLabel: string;
}): unknown;
card(props: {
    card: C;
    selected: boolean;
    moving: boolean;
    column: TaskBoardColumn;
    lane?: TaskBoardLane;
}): unknown;
empty(props: {
    column?: TaskBoardColumn;
    lane?: TaskBoardLane;
}): unknown;
```

## Component `TaskBoard`: exposed

```ts
cancelMove: () => void;
exportPng: (options?: TaskBoardPngExportOptions<C>) => Promise<Blob>;
exportSvg: (options?: TaskBoardExportOptions<C>) => string;
focusCard: (id: string) => boolean;
```

## Component `EventCalendar`: props

```ts
agendaDays?: number;
creatable?: boolean;
createDuration?: number;
date: number;
dayEnd?: number;
dayStart?: number;
dir?: ChartDirection;
events: readonly E[];
formatTime?: (time: number) => string;
height?: number | string;
hourHeight?: number;
labels?: Partial<EventCalendarLabels>;
locale?: string | readonly string[];
maxMonthLanes?: number;
now?: number;
readonly?: boolean;
resources?: readonly CalendarResource[];
selectedId?: string;
showToolbar?: boolean;
snap?: number;
timeZone?: string;
validateCreate?: EventCalendarCreateValidator;
validateEdit?: EventCalendarEditValidator;
view?: EventCalendarView;
views?: readonly EventCalendarView[];
weekStartsOn?: number;
```

## Component `EventCalendar`: emits

```ts
(evt: "background-click", event: EventCalendarBackgroundClick) => void
(evt: "create", proposal: EventCalendarCreate) => void
(evt: "create-rejected", proposal: EventCalendarCreate, reason: string) => void
(evt: "edit", change: EventCalendarEdit) => void
(evt: "edit-cancel", event: EventCalendarEditCancel) => void
(evt: "edit-rejected", change: EventCalendarEdit, reason: string) => void
(evt: "event-activate", id: string, source: "pointer" | "keyboard") => void
(evt: "range-change", range: TimeRange, view: EventCalendarView) => void
(evt: "select", id: string) => void
(evt: "update:date", date: number) => void
(evt: "update:selectedId", id: string) => void
(evt: "update:view", view: EventCalendarView) => void
(evt: "validation-error", error: Error) => void
```

## Component `EventCalendar`: slots

```ts
empty(): unknown;
event(props: {
    event: E;
    range: TimeRange;
    selected: boolean;
    allDay: boolean;
    view: EventCalendarView;
}): unknown;
toolbar(props: {
    title: string;
    view: EventCalendarView;
    date: number;
    previous: () => void;
    next: () => void;
    today: () => void;
    setView: (view: EventCalendarView) => void;
}): unknown;
```

## Component `EventCalendar`: exposed

```ts
cancelEdit: () => void;
exportPng: (options?: EventCalendarPngExportOptions<E>) => Promise<Blob>;
exportSvg: (options?: EventCalendarExportOptions<E>) => string;
scrollToTime: (time: number) => void;
```

## CSS custom properties: defined

- `--vw-accent`
- `--vw-amber-ink`
- `--vw-amber-line`
- `--vw-amber-pale`
- `--vw-amber-solid`
- `--vw-background-pattern`
- `--vw-baseline`
- `--vw-baseline-2`
- `--vw-baseline-3`
- `--vw-blue-ink`
- `--vw-blue-line`
- `--vw-blue-pale`
- `--vw-blue-solid`
- `--vw-board-collapsed-width`
- `--vw-board-column-width`
- `--vw-board-drop`
- `--vw-board-wip-under`
- `--vw-board-wip-warning`
- `--vw-border`
- `--vw-calendar-gutter`
- `--vw-cascade`
- `--vw-connect-invalid`
- `--vw-connect-valid`
- `--vw-constraint`
- `--vw-constraint-violated`
- `--vw-critical`
- `--vw-deadline`
- `--vw-dependency-highlight`
- `--vw-dimmed-opacity`
- `--vw-edge`
- `--vw-float`
- `--vw-grid`
- `--vw-guide`
- `--vw-inspector-error`
- `--vw-item-ink`
- `--vw-item-line`
- `--vw-item-pale`
- `--vw-item-solid`
- `--vw-load`
- `--vw-load-capacity`
- `--vw-load-overload`
- `--vw-marker`
- `--vw-marker-ink`
- `--vw-muted`
- `--vw-non-working`
- `--vw-now`
- `--vw-on-solid`
- `--vw-range`
- `--vw-range-ink`
- `--vw-range-line`
- `--vw-row-label-width`
- `--vw-status`
- `--vw-surface`
- `--vw-surface-hover`
- `--vw-surface-muted`
- `--vw-teal-ink`
- `--vw-teal-line`
- `--vw-teal-pale`
- `--vw-teal-solid`
- `--vw-text`
- `--vw-tree-grid-error`
- `--vw-tree-grid-highlight`
- `--vw-tree-grid-indent`
- `--vw-tree-grid-selected`
- `--vw-violet-ink`
- `--vw-violet-line`
- `--vw-violet-pale`
- `--vw-violet-solid`

## CSS custom properties: read with var() but not defined in style.css

- `--vw-axis-width`
- `--vw-band-dash`
- `--vw-bar-highlight`
- `--vw-board-cell-min-height`
- `--vw-board-collapsed-fill`
- `--vw-board-column-count`
- `--vw-calendar-event-accent`
- `--vw-calendar-hour-height`
- `--vw-calendar-scrollbar`
- `--vw-calendar-today`
- `--vw-constraint-reach`
- `--vw-edge-animation-duration`
- `--vw-edge-selected`
- `--vw-field-invalid`
- `--vw-flow-band-active-opacity`
- `--vw-flow-band-opacity`
- `--vw-flow-reference-dash`
- `--vw-flow-reference-opacity`
- `--vw-graph-highlight`
- `--vw-header-height`
- `--vw-label-area-width`
- `--vw-label-editor-width`
- `--vw-lane-border`
- `--vw-lane-fill`
- `--vw-lane-fill-alternate`
- `--vw-lane-header-fill`
- `--vw-lane-title`
- `--vw-load-focus`
- `--vw-load-highlight`
- `--vw-load-selected`
- `--vw-palette-preview-width`
- `--vw-pool-border`
- `--vw-pool-fill`
- `--vw-pool-header-fill`
- `--vw-range-opacity`
- `--vw-row-depth`
- `--vw-toolbar-offset`
- `--vw-tree-grid-drop`
- `--vw-tree-grid-header`
- `--vw-tree-grid-header-height`
- `--vw-tree-grid-level`
- `--vw-tree-grid-line`
- `--vw-tree-grid-row-height`
- `--vw-tree-grid-tree-width`

## Declarations

### `ActualsDiagnostic`

```ts
interface ActualsDiagnostic {
    id: string;
    code: ActualsDiagnosticCode;
    severity: PlanningDiagnosticSeverity;
    entities: readonly EntityRef[];
    range?: TimeRange;
    reasonIds: readonly string[];
}
```

### `ActualsDiagnosticCode`

```ts
type ActualsDiagnosticCode = 'actual-overlap' | 'actual-after-status-date' | 'actual-outside-calendar' | 'actual-contradiction';
```

### `ActualsTask`

```ts
interface ActualsTask {
    id: string;
    state: ActualsTaskState;
    actual: readonly TimeRange[];
    remaining: readonly TimeRange[];
    performedWork: number;
    remainingWork: number;
    start?: number;
    end?: number;
    plan?: TimeRange;
    offCalendar: readonly TimeRange[];
    parentId?: string;
    summary?: true;
    manual?: true;
}
```

### `ActualsTaskState`

```ts
type ActualsTaskState = 'not-started' | 'in-progress' | 'finished';
```

### `ActualsTimelineBarOptions`

```ts
interface ActualsTimelineBarOptions {
    label?: (taskId: string) => string;
    rowId?: (taskId: string) => string;
    barId?: (taskId: string, part: 'actual' | 'forecast') => string;
    partLabels?: {
        actual?: string;
        forecast?: string;
    };
    descriptions?: {
        actual?: string;
        forecast?: string;
    };
    tones?: {
        actual?: ChartTone;
        forecast?: ChartTone;
    };
    baselineId?: string | false;
}
```

### `AssignLanesOptions`

```ts
interface AssignLanesOptions {
    keepLanes?: boolean;
}
```

### `AssignLanesResult`

```ts
interface AssignLanesResult<B extends TimelineBar = TimelineBar> {
    bars: B[];
    laneCount: number;
    rowLaneCounts: Map<string, number>;
}
```

### `AsyncGraphDisplayFrame`

```ts
interface AsyncGraphDisplayFrame<N extends NetworkNode = NetworkNode, E extends GraphEdge = GraphEdge, G extends NetworkGroup = NetworkGroup> extends AsyncGraphFrame<N, E, G> {
    layouts: {
        shown: GraphLayout;
        expanded?: GraphLayout;
    };
    source: 'initial' | 'layout' | 'provisional';
    temporaryEdgeIds: readonly string[];
}
```

### `AsyncGraphFrame`

```ts
interface AsyncGraphFrame<N extends NetworkNode = NetworkNode, E extends GraphEdge = GraphEdge, G extends NetworkGroup = NetworkGroup> {
    revision: string;
    nodes: readonly N[];
    edges: readonly E[];
    groups: readonly G[];
    collapsedGroupIds: ReadonlySet<string>;
    direction: GraphLayoutDirection;
    positions?: ReadonlyMap<string, GraphPoint>;
    sizes?: ReadonlyMap<string, GraphNodeSize>;
    fixedIds?: ReadonlySet<string>;
    addedIds?: ReadonlySet<string>;
    settings?: unknown;
    inputKeys: {
        shown: string;
        expanded?: string;
    };
}
```

### `AsyncGraphGestureListeners`

```ts
interface AsyncGraphGestureListeners {
    onGestureStart: (gesture: GraphGesture) => void;
    onGestureEnd: (gesture: GraphGestureEnd) => void;
}
```

### `AsyncGraphLayout`

```ts
interface AsyncGraphLayout<N extends NetworkNode = NetworkNode, E extends GraphEdge = GraphEdge, G extends NetworkGroup = NetworkGroup> {
    desired: Readonly<ShallowRef<AsyncGraphFrame<N, E, G> | undefined>>;
    display: Readonly<ShallowRef<AsyncGraphDisplayFrame<N, E, G> | undefined>>;
    layout: GraphLayoutFunction<GraphShownNode<N, G>, GraphShownEdge<E, G>>;
    pending: Readonly<Ref<boolean>>;
    deferred: Readonly<Ref<boolean>>;
    gestureListeners: Readonly<AsyncGraphGestureListeners>;
    gesturing: Readonly<Ref<boolean>>;
    error: Readonly<ShallowRef<AsyncGraphLayoutError | undefined>>;
    cancel: () => void;
    dispose: () => void;
}
```

### `AsyncGraphLayoutAdapter`

```ts
type AsyncGraphLayoutAdapter<N extends NetworkNode = NetworkNode, E extends GraphEdge = GraphEdge, G extends NetworkGroup = NetworkGroup> = (request: GraphLayoutRequest<GraphShownNode<N, G>, GraphShownEdge<E, G>, NetworkGroup>, signal: AbortSignal) => GraphLayout | Promise<GraphLayout>;
```

### `AsyncGraphLayoutError`

```ts
interface AsyncGraphLayoutError {
    revision: string;
    requestId: string;
    inputKey: string;
    scope: GraphLayoutScope;
    error: unknown;
}
```

### `BarsDeleteValidator`

```ts
type BarsDeleteValidator = (ids: readonly string[]) => boolean | string | void;
```

### `BatchEditValidator`

```ts
type BatchEditValidator = (changes: readonly TimelineEdit[]) => boolean | string | void;
```

### `CalendarAgendaDay`

```ts
interface CalendarAgendaDay {
    index: number;
    start: number;
    end: number;
    items: CalendarAgendaItem[];
}
```

### `CalendarAgendaItem`

```ts
interface CalendarAgendaItem {
    id: string;
    start: number;
    end: number;
    allDay: boolean;
    continuesBefore: boolean;
    continuesAfter: boolean;
}
```

### `CalendarBandLocalTime`

```ts
interface CalendarBandLocalTime {
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
    weekday: number;
    utcOffsetMinutes: number;
    timeZone?: string;
}
```

### `CalendarBandOptions`

```ts
interface CalendarBandOptions {
    utcOffsetMinutes?: number;
    timeZone?: string;
    step?: number;
    weekStartsOn?: number;
    label?: (start: number, end: number, local: CalendarBandLocalTime) => string;
    locale?: string | readonly string[];
    labelFormat?: Intl.DateTimeFormatOptions;
}
```

### `CalendarBandUnit`

```ts
type CalendarBandUnit = 'hour' | 'day' | 'week' | 'month' | 'year';
```

### `CalendarEvent`

```ts
interface CalendarEvent<D = unknown> {
    id: string;
    start: number;
    end: number;
    label: string;
    allDay?: boolean;
    resourceId?: string;
    color?: string;
    tone?: ChartTone;
    editable?: boolean;
    data?: D;
    recurrence?: CalendarRecurrence;
    seriesId?: string;
    recurrenceId?: number;
}
```

### `CalendarEventColumn`

```ts
interface CalendarEventColumn {
    id: string;
    start: number;
    end: number;
    column: number;
    columns: number;
}
```

### `CalendarEventLane`

```ts
interface CalendarEventLane {
    id: string;
    lane: number;
    startIndex: number;
    endIndex: number;
    continuesBefore: boolean;
    continuesAfter: boolean;
}
```

### `CalendarEventLaneLayout`

```ts
interface CalendarEventLaneLayout {
    segments: CalendarEventLane[];
    lanes: number;
}
```

### `CalendarRecurrence`

```ts
interface CalendarRecurrence extends RecurrenceZoneOptions {
    rule?: RecurrenceRule | string;
    exdates?: readonly number[];
    rdates?: readonly number[];
}
```

### `CalendarResource`

```ts
interface CalendarResource {
    id: string;
    label: string;
    detail?: string;
}
```

### `CalendarZoomLevel`

```ts
type CalendarZoomLevel = 'hours' | 'days' | 'weeks' | 'months' | 'quarters' | 'years';
```

### `CalendarZoomPreset`

```ts
interface CalendarZoomPreset extends TimelineZoomPreset {
    id: CalendarZoomLevel;
    tickSteps: readonly number[];
    headerBands: readonly (readonly TimelineBand[])[];
    snap: number;
    formatTime: (time: number) => string;
}
```

### `CalendarZoomPresetOptions`

```ts
interface CalendarZoomPresetOptions {
    locale?: string | readonly string[];
    timeZone?: string;
    utcOffsetMinutes?: number;
    weekStartsOn?: number;
    levels?: readonly CalendarZoomLevel[];
    labels?: Partial<Record<CalendarZoomLevel, string>>;
}
```

### `ChartDirection`

```ts
type ChartDirection = 'ltr' | 'rtl' | 'auto';
```

### `ChartTone`

```ts
type ChartTone = 'teal' | 'blue' | 'amber' | 'violet';
```

### `CollapsedTargetsResult`

```ts
interface CollapsedTargetsResult {
    nodeIds: string[];
    edgeIds: string[];
    unknownNodeIds: string[];
    unknownEdgeIds: string[];
}
```

### `CollectScheduleReasonsOptions`

```ts
interface CollectScheduleReasonsOptions {
    phases?: readonly ScheduleReasonPhase[];
}
```

### `ColumnResizeValidator`

```ts
type ColumnResizeValidator = (change: TimelineColumnResize) => boolean | string | void;
```

### `ConstraintEditValidator`

```ts
type ConstraintEditValidator = (change: TimelineConstraintEdit) => boolean | string | void;
```

### `CreateValidator`

```ts
type CreateValidator = (proposal: TimelineCreate) => boolean | string | void;
```

### `CsvCell`

```ts
type CsvCell = string | number | undefined;
```

### `CsvOptions`

```ts
interface CsvOptions {
    escapeFormulas?: boolean;
}
```

### `CsvParseOptions`

```ts
interface CsvParseOptions {
    delimiter?: string;
}
```

### `DanglingLink`

```ts
interface DanglingLink<L> {
    link: L;
    missingIds: string[];
}
```

### `DependencyPathStyle`

```ts
type DependencyPathStyle = 'orthogonal' | 'rounded' | 'curve';
```

### `DrawioAsyncImportOptions`

```ts
interface DrawioAsyncImportOptions extends DrawioImportOptions {
    maxInflatedLength?: number;
}
```

### `DrawioImportOptions`

```ts
interface DrawioImportOptions extends GraphInterchangeImportOptions {
    page?: number | string;
}
```

### `DrawioOptions`

```ts
interface DrawioOptions {
    pageName?: string;
    direction?: GraphLayoutDirection;
}
```

### `EarnedValueAmounts`

```ts
interface EarnedValueAmounts {
    bac: number;
    pv: number;
    ev: number;
    ac: number;
}
```

### `EarnedValueEacMethod`

```ts
type EarnedValueEacMethod = 'cpi' | 'cpi-spi' | 'budget';
```

### `EarnedValueMetrics`

```ts
interface EarnedValueMetrics extends EarnedValueAmounts {
    sv: number;
    cv: number;
    spi?: number;
    cpi?: number;
    eac?: number;
    etc?: number;
    vac?: number;
    tcpi?: number;
    percentComplete?: number;
}
```

### `EarnedValueOptions`

```ts
interface EarnedValueOptions {
    statusDate: number;
    calendars?: readonly WorkCalendar[];
    defaultCalendarId?: string;
    eacMethod?: EarnedValueEacMethod;
    series?: EarnedValueSeriesOptions;
}
```

### `EarnedValuePoint`

```ts
interface EarnedValuePoint {
    time: number;
    pv: number;
    ev?: number;
    ac?: number;
}
```

### `EarnedValueRecord`

```ts
interface EarnedValueRecord {
    time: number;
    progress: number;
    actualCost?: number;
}
```

### `EarnedValueResult`

```ts
interface EarnedValueResult {
    statusDate: number;
    eacMethod: EarnedValueEacMethod;
    tasks: readonly EarnedValueTaskResult[];
    totals: EarnedValueMetrics;
    series: readonly EarnedValuePoint[];
}
```

### `EarnedValueSeriesOptions`

```ts
interface EarnedValueSeriesOptions {
    step: number;
    start?: number;
    end?: number;
}
```

### `EarnedValueTask`

```ts
interface EarnedValueTask {
    id: string;
    budget: number;
    start: number;
    end: number;
    progress?: number;
    actualCost?: number;
    calendarId?: string;
    history?: readonly EarnedValueRecord[];
}
```

### `EarnedValueTaskResult`

```ts
interface EarnedValueTaskResult extends EarnedValueMetrics {
    id: string;
}
```

### `EditMode`

```ts
type EditMode = 'move' | 'start' | 'end';
```

### `EditTransaction`

```ts
type EditTransaction<P, S> = {
    operationId: string;
    documentId: string;
    baseVersion: string;
    source: TransactionSource;
} & ({
    kind: 'changes';
    changes: readonly P[];
} | {
    kind: 'restore';
    snapshot: S;
});
```

### `EditValidator`

```ts
type EditValidator = (change: TimelineEdit) => boolean | string | void;
```

### `EntityRef`

```ts
interface EntityRef {
    kind: string;
    id: string;
}
```

### `EventCalendar`

```ts
const EventCalendar: EventCalendarComponent;
```

### `EventCalendarBackgroundClick`

```ts
interface EventCalendarBackgroundClick {
    time: number;
    allDay: boolean;
    resourceId?: string;
}
```

### `EventCalendarComponent`

```ts
type EventCalendarComponent = (new <E extends CalendarEvent = CalendarEvent>(props: {
    events: readonly E[];
    date: number;
} & Record<string, unknown>) => SfcInstance<EventCalendarSfc<E & CalendarEvent>>) & SfcDefaultComponent<EventCalendarSfc<CalendarEvent>>;
```

### `EventCalendarCreate`

```ts
interface EventCalendarCreate extends TimeRange {
    allDay: boolean;
    resourceId?: string;
    source: 'pointer';
}
```

### `EventCalendarCreateValidator`

```ts
type EventCalendarCreateValidator = (proposal: EventCalendarCreate) => boolean | string | void;
```

### `EventCalendarDay`

```ts
interface EventCalendarDay extends TimeRange {
    year: number;
    month: number;
    day: number;
    weekday: number;
    inMonth: boolean;
}
```

### `EventCalendarEdit`

```ts
interface EventCalendarEdit {
    id: string;
    before: TimeRange;
    after: TimeRange;
    mode: 'move' | 'start' | 'end';
    source: 'pointer' | 'keyboard';
    resource?: {
        before: string;
        after: string;
    };
    occurrence?: {
        seriesId: string;
        recurrenceId: number;
    };
}
```

### `EventCalendarEditCancel`

```ts
interface EventCalendarEditCancel {
    reason: EventCalendarEditCancelReason;
    eventIds: readonly string[];
}
```

### `EventCalendarEditCancelReason`

```ts
type EventCalendarEditCancelReason = 'escape' | 'source-changed' | 'pointer-cancel' | 'api';
```

### `EventCalendarEditValidator`

```ts
type EventCalendarEditValidator = (change: EventCalendarEdit) => boolean | string | void;
```

### `EventCalendarExportOptions`

```ts
interface EventCalendarExportOptions<E extends CalendarEvent = CalendarEvent> {
    background?: boolean;
    title?: string;
    theme?: SvgExportThemeInput;
    width?: number;
    heading?: string | false;
    includeSelection?: boolean;
    eventLabel?: (event: E) => string;
}
```

### `EventCalendarExposed`

```ts
type EventCalendarExposed<E extends CalendarEvent = CalendarEvent> = SfcExposed<EventCalendarSfc<E>>;
```

### `EventCalendarLabels`

```ts
interface EventCalendarLabels {
    region: string;
    previous: string;
    today: string;
    next: string;
    views: string;
    day: string;
    week: string;
    month: string;
    allDay: string;
    more: string;
    showDay: string;
    editHint: string;
    dayEditHint: string;
    monthEditHint?: string;
    rejected: string;
    createRejected: string;
    resources: string;
    now: string;
    empty: string;
    recurring?: string;
    agenda?: string;
    agendaEditHint?: string;
}
```

### `EventCalendarOptions`

```ts
interface EventCalendarOptions {
    timeZone?: string;
    weekStartsOn?: number;
    agendaDays?: number;
}
```

### `EventCalendarPngExportOptions`

```ts
interface EventCalendarPngExportOptions<E extends CalendarEvent = CalendarEvent> extends EventCalendarExportOptions<E>, PngExportOptions {
}
```

### `EventCalendarSvgLabels`

```ts
type EventCalendarSvgLabels = Pick<EventCalendarLabels, 'allDay' | 'more' | 'resources' | 'now'> & Pick<Required<EventCalendarLabels>, 'recurring'> & Partial<Pick<EventCalendarLabels, 'empty'>>;
```

### `EventCalendarSvgOptions`

```ts
interface EventCalendarSvgOptions<E extends CalendarEvent = CalendarEvent> extends SvgExportOptions, EventCalendarOptions {
    view?: EventCalendarView;
    locale?: string | readonly string[];
    resources?: readonly CalendarResource[];
    dayStart?: number;
    dayEnd?: number;
    hourHeight?: number;
    width?: number;
    maxMonthLanes?: number;
    now?: number;
    selectedId?: string;
    formatTime?: (time: number) => string;
    labels?: Partial<EventCalendarSvgLabels>;
    heading?: string | false;
    eventLabel?: (event: E) => string;
}
```

### `EventCalendarView`

```ts
type EventCalendarView = 'day' | 'week' | 'month' | 'agenda';
```

### `ExplainedLevelResourcesResult`

```ts
type ExplainedLevelResourcesResult = ExplainedLevelResourcesSuccess | ScheduleFailure;
```

### `ExplainedLevelResourcesSuccess`

```ts
type ExplainedLevelResourcesSuccess = LevelResourcesSuccess & {
    trace: ScheduleTrace;
};
```

### `ExplainedScheduleResult`

```ts
type ExplainedScheduleResult = ExplainedScheduleSuccess | ScheduleFailure;
```

### `ExplainedScheduleSuccess`

```ts
type ExplainedScheduleSuccess = ScheduleSuccess & {
    trace: ScheduleTrace;
};
```

### `FieldCheck`

```ts
type FieldCheck = {
    ok: true;
} | {
    ok: false;
    code: FieldErrorCode;
    error: string;
};
```

### `FieldChoice`

```ts
interface FieldChoice {
    value: string | number;
    label?: string;
}
```

### `FieldDurationBasis`

```ts
type FieldDurationBasis = 'elapsed' | 'working';
```

### `FieldErrorCode`

```ts
type FieldErrorCode = 'required' | 'invalid' | 'negative' | 'range' | 'integer' | 'choice' | 'time-zone' | 'custom';
```

### `FieldParseResult`

```ts
type FieldParseResult = {
    ok: true;
    value: FieldValue;
} | {
    ok: false;
    code: FieldErrorCode;
    error: string;
};
```

### `FieldPrimitive`

```ts
type FieldPrimitive = string | number | boolean | null;
```

### `FieldValue`

```ts
type FieldValue = FieldPrimitive | readonly FieldPrimitive[];
```

### `GanttChart`

```ts
const GanttChart: GanttChartComponent;
```

### `GanttChartComponent`

```ts
type GanttChartComponent = (new <R extends TimelineRow = TimelineRow, B extends TimelineBar = TimelineBar>(props: {
    rows: readonly R[];
    bars: readonly B[];
} & Record<string, unknown>) => SfcInstance<GanttChartSfc<R & TimelineRow, B & TimelineBar>>) & SfcDefaultComponent<GanttChartSfc<TimelineRow, TimelineBar>>;
```

### `GanttChartExposed`

```ts
type GanttChartExposed<R extends TimelineRow = TimelineRow, B extends TimelineBar = TimelineBar> = SfcExposed<GanttChartSfc<R, B>>;
```

### `GanttExportOptions`

```ts
interface GanttExportOptions<R extends TimelineRow = TimelineRow, B extends TimelineBar = TimelineBar> {
    timeRange?: TimeRange;
    rowRange?: {
        start: number;
        end: number;
    };
    includeLoad?: boolean;
    background?: boolean;
    title?: string;
    rowHeading?: string;
    idPrefix?: string;
    theme?: SvgExportThemeInput;
    barLabel?: (bar: B) => string;
    rowLabel?: (row: R) => string;
    includeStatusDate?: boolean;
}
```

### `GanttLabels`

```ts
interface GanttLabels {
    region: string;
    rows: string;
    empty: string;
    zoom: string;
    zoomIn: string;
    zoomOut: string;
    editHint: string;
    rejected: string;
    expandRow?: string;
    collapseRow?: string;
    baseline?: string;
    baselineStart?: string;
    baselineFinish?: string;
    baselineDuration?: string;
    connectFrom?: string;
    connectTo?: string;
    startOf?: string;
    finishOf?: string;
    selectDependency?: string;
    reconnectSource?: string;
    reconnectTarget?: string;
    connectionRejected?: string;
    zoomPresets?: string;
    now?: string;
    loadRegion?: string;
    load?: string;
    capacity?: string;
    overload?: string;
    moveRowHint?: string;
    critical?: string;
    float?: string;
    deadline?: string;
    late?: string;
    progressOf?: string;
    deleteHint?: string;
    createIn?: string;
    createRejected?: string;
    moveRow?: string;
    moveRowKeysHint?: string;
    sheetHint?: string;
    sheetReadOnly?: string;
    sheetRagged?: string;
    sheetOutside?: string;
    sheetRejected?: string;
    rowMoveRejected?: string;
    statusDate?: string;
    resizeColumn?: string;
    columnResizeRejected?: string;
    sortBy?: string;
    sortedAscending?: string;
    sortedDescending?: string;
    filterBy?: string;
    filtered?: string;
    filterContains?: string;
    filterValues?: string;
    clearFilter?: string;
    lag?: string;
    startNoEarlierThan?: string;
    startNoLaterThan?: string;
    finishNoEarlierThan?: string;
    finishNoLaterThan?: string;
    fixedStart?: string;
    constraintViolated?: string;
    constraintHint?: string;
    constraintRejected?: string;
}
```

### `GanttPngExportOptions`

```ts
interface GanttPngExportOptions<R extends TimelineRow = TimelineRow, B extends TimelineBar = TimelineBar> extends GanttExportOptions<R, B>, PngExportOptions {
}
```

### `GraphAlignment`

```ts
interface GraphAlignment {
    dx: number;
    dy: number;
    guides: GraphAlignmentGuide[];
}
```

### `GraphAlignmentGuide`

```ts
interface GraphAlignmentGuide {
    axis: 'x' | 'y';
    position: number;
    from: number;
    to: number;
}
```

### `GraphBetweennessOptions`

```ts
interface GraphBetweennessOptions {
    directed?: boolean;
    normalized?: boolean;
    weight?: (edge: GraphEdge) => number;
}
```

### `GraphBounds`

```ts
interface GraphBounds {
    nodes: Map<string, GraphRect>;
    edges: Map<string, GraphRect>;
}
```

### `GraphBox`

```ts
interface GraphBox {
    x: number;
    y: number;
    width: number;
    height: number;
    rank: number;
}
```

### `GraphCameraTarget`

```ts
interface GraphCameraTarget {
    center: GraphPoint;
    scale: number;
}
```

### `GraphCircularLayoutOptions`

```ts
interface GraphCircularLayoutOptions<N extends IdentifiedNode = IdentifiedNode> {
    nodeWidth?: number;
    nodeHeight?: number;
    nodeGap?: number;
    padding?: number;
    radius?: number;
    startAngle?: number;
    clockwise?: boolean;
    sort?: (a: N, b: N) => number;
}
```

### `GraphClipboardSelection`

```ts
interface GraphClipboardSelection {
    nodeIds: string[];
    edgeIds: string[];
    positions: Map<string, GraphPoint>;
}
```

### `GraphCloneOptions`

```ts
interface GraphCloneOptions {
    createId: (id: string, kind: 'node' | 'edge') => string;
    positions?: ReadonlyMap<string, GraphPoint>;
    offset?: GraphPoint;
}
```

### `GraphCloneResult`

```ts
interface GraphCloneResult<N extends IdentifiedNode = IdentifiedNode, E extends GraphEdge = GraphEdge> {
    nodes: N[];
    edges: E[];
    positions: Map<string, GraphPoint>;
    idMap: {
        nodes: Map<string, string>;
        edges: Map<string, string>;
    };
}
```

### `GraphCollapseOptions`

```ts
interface GraphCollapseOptions {
    detail?: (group: GraphCollapsedGroup) => string | undefined;
}
```

### `GraphCollapseResult`

```ts
interface GraphCollapseResult<N extends NetworkNode = NetworkNode, E extends GraphEdge = GraphEdge> {
    nodes: (N | NetworkNode)[];
    edges: (E | GraphEdge)[];
    groups: NetworkGroup[];
    proxies: Map<string, GraphCollapsedGroup>;
    owners: Map<string, string>;
    mergedEdges: Map<string, string[]>;
    hiddenEdgeIds: string[];
}
```

### `GraphCollapsedGroup`

```ts
interface GraphCollapsedGroup {
    id: string;
    label: string;
    nodeIds: string[];
}
```

### `GraphCollapsedNode`

```ts
type GraphCollapsedNode = NetworkNode<GraphCollapsedNodeData>;
```

### `GraphCollapsedNodeData`

```ts
interface GraphCollapsedNodeData {
    collapsedGroup: string;
    nodeIds: string[];
}
```

### `GraphCommunityGroupsOptions`

```ts
interface GraphCommunityGroupsOptions {
    idPrefix?: string;
    label?: (members: readonly string[], index: number) => string;
    minSize?: number;
}
```

### `GraphCommunityOptions`

```ts
interface GraphCommunityOptions {
    resolution?: number;
    weight?: (edge: GraphEdge) => number;
}
```

### `GraphCommunityResult`

```ts
interface GraphCommunityResult {
    communities: string[][];
    modularity: number;
}
```

### `GraphConcentricLayoutOptions`

```ts
interface GraphConcentricLayoutOptions<N extends IdentifiedNode = IdentifiedNode> {
    nodeWidth?: number;
    nodeHeight?: number;
    ringGap?: number;
    padding?: number;
    level?: (node: N, degree: number) => number;
    levelWidth?: number;
    startAngle?: number;
}
```

### `GraphConnection`

```ts
interface GraphConnection {
    from: string;
    to: string;
    fromPort?: string;
    toPort?: string;
}
```

### `GraphConnectionCheck`

```ts
type GraphConnectionCheck = {
    ok: true;
} | GraphConnectionRejection;
```

### `GraphConnectionChecker`

```ts
interface GraphConnectionChecker {
    check(connection: GraphConnection, replacingEdgeId?: string): GraphConnectionCheck;
    targets(origin: GraphConnectionOrigin, replacingEdgeId?: string): GraphConnectionTargets;
}
```

### `GraphConnectionOrigin`

```ts
interface GraphConnectionOrigin {
    node: string;
    port?: string;
    end?: 'from' | 'to';
}
```

### `GraphConnectionRejection`

```ts
interface GraphConnectionRejection {
    ok: false;
    code: GraphConnectionRejectionCode;
    reason: string;
    end: 'from' | 'to';
    node: string;
    port?: string;
}
```

### `GraphConnectionRejectionCode`

```ts
type GraphConnectionRejectionCode = 'unknown-node' | 'unknown-port' | 'direction' | 'type-mismatch' | 'limit-reached';
```

### `GraphConnectionTargets`

```ts
interface GraphConnectionTargets {
    nodeIds: Set<string>;
    ports: Map<string, Set<string>>;
}
```

### `GraphConnectionViolation`

```ts
interface GraphConnectionViolation {
    edgeId: string;
    code: Exclude<GraphConnectionRejectionCode, 'unknown-node' | 'unknown-port'>;
    reason: string;
    end: 'from' | 'to';
    node: string;
    port?: string;
}
```

### `GraphContextMenu`

```ts
interface GraphContextMenu {
    target: GraphContextMenuTarget;
    point: GraphPoint;
    clientX: number;
    clientY: number;
    source: 'pointer' | 'keyboard';
}
```

### `GraphContextMenuTarget`

```ts
type GraphContextMenuTarget = {
    kind: 'node';
    id: string;
} | {
    kind: 'edge';
    id: string;
} | {
    kind: 'group';
    id: string;
} | {
    kind: 'canvas';
};
```

### `GraphCrossingReduction`

```ts
type GraphCrossingReduction = 'none' | 'barycenter' | 'median';
```

### `GraphCullKeep`

```ts
interface GraphCullKeep {
    nodes?: Iterable<string>;
    edges?: Iterable<string>;
}
```

### `GraphDegreeCentralityOptions`

```ts
interface GraphDegreeCentralityOptions {
    direction?: 'in' | 'out' | 'both';
    normalized?: boolean;
}
```

### `GraphDeletion`

```ts
interface GraphDeletion {
    nodeIds: string[];
    edgeIds: string[];
}
```

### `GraphDrop`

```ts
interface GraphDrop {
    point: GraphPoint;
    clientX: number;
    clientY: number;
    dataTransfer: DataTransfer | null;
}
```

### `GraphEdge`

```ts
interface GraphEdge<D = unknown> extends GraphConnection {
    id: string;
    label?: string;
    data?: D;
    points?: readonly GraphPoint[];
    edgeStyle?: GraphEdgeStyle;
    markerEnd?: GraphEdgeMarker;
    markerStart?: GraphEdgeMarker;
    animated?: boolean;
    dashed?: boolean;
}
```

### `GraphEdgeBand`

```ts
interface GraphEdgeBand {
    width: number;
    reference?: boolean;
    label?: string;
}
```

### `GraphEdgeLabelPlacement`

```ts
type GraphEdgeLabelPlacement<E extends GraphEdge = GraphEdge> = 'midpoint' | 'avoid' | Omit<GraphEdgeLabelPlacementOptions<E>, 'edgeIds' | 'labelText'>;
```

### `GraphEdgeLabelPlacementOptions`

```ts
interface GraphEdgeLabelPlacementOptions<E extends GraphEdge = GraphEdge> {
    fontSize?: number;
    glyphWidth?: number;
    labelSize?: (edge: E, text: string) => GraphEdgeLabelSize | null | undefined;
    labelText?: (edge: E) => string | undefined;
    gap?: number;
    edgeWidth?: (edge: E) => number | null | undefined;
    margin?: number;
    samples?: number;
    edgeIds?: Iterable<string>;
    obstacles?: readonly GraphRect[];
}
```

### `GraphEdgeLabelSize`

```ts
interface GraphEdgeLabelSize {
    width: number;
    height: number;
}
```

### `GraphEdgeMarker`

```ts
type GraphEdgeMarker = 'arrow' | 'open-arrow' | 'hollow-arrow' | 'circle' | 'diamond' | 'bar' | 'none';
```

### `GraphEdgeReshape`

```ts
interface GraphEdgeReshape {
    id: string;
    before: GraphPoint[];
    after: GraphPoint[];
}
```

### `GraphEdgeRouteOptions`

```ts
interface GraphEdgeRouteOptions {
    style?: GraphEdgeStyle;
    direction?: GraphLayoutDirection;
    cornerRadius?: number;
    policy?: GraphRoutingPolicy;
    parallelSpacing?: number;
    avoidNodes?: boolean | GraphObstacleAvoidance;
    cache?: GraphRouteCache;
}
```

### `GraphEdgeStyle`

```ts
type GraphEdgeStyle = 'curve' | 'orthogonal' | 'straight';
```

### `GraphExpansionKeyOptions`

```ts
interface GraphExpansionKeyOptions {
    key?: string;
}
```

### `GraphExpansionPage`

```ts
interface GraphExpansionPage<N extends {
    id: string;
} = {
    id: string;
}, E extends GraphEdge = GraphEdge> {
    nodes?: readonly N[];
    edges?: readonly E[];
}
```

### `GraphExpansionState`

```ts
interface GraphExpansionState<N extends {
    id: string;
} = {
    id: string;
}, E extends GraphEdge = GraphEdge> {
    readonly nodes: ReadonlyMap<string, N>;
    readonly edges: ReadonlyMap<string, E>;
    readonly expandedIds: ReadonlySet<string>;
    readonly pendingIds: ReadonlySet<string>;
    readonly expandedIdsByKey?: ReadonlyMap<string, ReadonlySet<string>>;
    readonly pendingIdsByKey?: ReadonlyMap<string, ReadonlySet<string>>;
}
```

### `GraphExpansionView`

```ts
interface GraphExpansionView<N extends {
    id: string;
} = {
    id: string;
}, E extends GraphEdge = GraphEdge> {
    nodes: N[];
    edges: E[];
    dangling: DanglingLink<E>[];
    frontierIds: string[];
}
```

### `GraphExportOptions`

```ts
interface GraphExportOptions<N extends NetworkNode = NetworkNode, E extends GraphEdge = GraphEdge> {
    padding?: number;
    background?: boolean;
    title?: string;
    idPrefix?: string;
    theme?: SvgExportThemeInput;
    includeSelection?: boolean;
    includeHighlight?: boolean;
    nodeLabel?: (node: N) => string;
    nodeDetail?: (node: N) => string | undefined;
    edgeLabel?: (edge: E) => string | undefined;
}
```

### `GraphFilterOptions`

```ts
interface GraphFilterOptions extends GraphSearchOptions {
    neighborhood?: number;
}
```

### `GraphFitOptions`

```ts
interface GraphFitOptions {
    ids?: Iterable<string>;
    padding?: number;
}
```

### `GraphFlowBand`

```ts
interface GraphFlowBand {
    edgeId: string;
    from: string;
    to: string;
    quantity: number;
    unit: string;
    thickness: number;
    width: number;
    reference: boolean;
    selfLoop: boolean;
    sourceSide: GraphPort['side'];
    targetSide: GraphPort['side'];
    sourceOffset: number;
    targetOffset: number;
    path: string;
    label: string;
}
```

### `GraphFlowExcludedEdge`

```ts
interface GraphFlowExcludedEdge {
    edgeId: string;
    from: string;
    to: string;
    unit: string;
    quantity: number;
}
```

### `GraphFlowLayout`

```ts
interface GraphFlowLayout extends GraphLayout {
    unit: string;
    scale: number;
    direction: GraphLayoutDirection;
    nodes: GraphFlowNode[];
    bands: GraphFlowBand[];
    excluded: GraphFlowExcludedEdge[];
}
```

### `GraphFlowNode`

```ts
interface GraphFlowNode {
    id: string;
    box: GraphBox;
    rank: number;
    order: number;
    inflow: number;
    outflow: number;
    difference: number;
    value: number;
    referenceInflow: number;
    referenceOutflow: number;
}
```

### `GraphFlowOptions`

```ts
interface GraphFlowOptions<N extends IdentifiedNode = IdentifiedNode, E extends GraphEdge = GraphEdge> {
    quantity: (edge: E) => number;
    unit: string | ((edge: E) => string);
    displayUnit?: string;
    direction?: GraphLayoutDirection;
    nodeThickness?: number;
    nodeGap?: number;
    rankGap?: number;
    padding?: number;
    scale?: GraphFlowScale;
    minNodeSize?: number;
    minBandWidth?: number;
    referenceGap?: number;
    crossingSweeps?: number;
    nodeLabel?: (node: N) => string;
    formatQuantity?: (quantity: number, unit: string) => string;
}
```

### `GraphFlowScale`

```ts
type GraphFlowScale = {
    pixelsPerUnit: number;
} | {
    fitExtent: number;
};
```

### `GraphForceLayoutOptions`

```ts
interface GraphForceLayoutOptions {
    nodeWidth?: number;
    nodeHeight?: number;
    padding?: number;
    iterations?: number;
    linkDistance?: number;
    repulsion?: number;
    gravity?: number;
    nodeGap?: number;
    seed?: number;
    initialPositions?: ReadonlyMap<string, GraphPoint>;
    fixed?: ReadonlySet<string>;
}
```

### `GraphGesture`

```ts
interface GraphGesture {
    kind: GraphGestureKind;
    source: 'pointer' | 'keyboard';
}
```

### `GraphGestureEnd`

```ts
interface GraphGestureEnd extends GraphGesture {
    outcome: 'committed' | 'cancelled';
}
```

### `GraphGestureKind`

```ts
type GraphGestureKind = 'node-drag' | 'nodes-drag' | 'node-resize' | 'edge-reshape' | 'connect' | 'reconnect' | 'box-select' | 'pan' | 'pinch';
```

### `GraphGridLayoutOptions`

```ts
interface GraphGridLayoutOptions {
    nodeWidth?: number;
    nodeHeight?: number;
    columnGap?: number;
    rowGap?: number;
    padding?: number;
    columns?: number;
}
```

### `GraphGroup`

```ts
interface GraphGroup {
    id: string;
    label: string;
    nodeIds: readonly string[];
}
```

### `GraphIncrementalLayout`

```ts
interface GraphIncrementalLayout extends GraphLayout {
    placedIds: string[];
    movedIds: string[];
    fallbackIds: string[];
}
```

### `GraphIncrementalLayoutOptions`

```ts
interface GraphIncrementalLayoutOptions extends GraphLayoutOptions {
    sizes?: ReadonlyMap<string, GraphNodeSize>;
    fixedIds?: Iterable<string>;
    maxDisplacement?: number;
    allowNegative?: boolean;
    previousLayout?: Pick<GraphLayout, 'boxes' | 'paths' | 'edgeLabels'> & Partial<Pick<GraphLayout, 'routes'>>;
}
```

### `GraphIndex`

```ts
interface GraphIndex {
    incoming: Map<string, string[]>;
    outgoing: Map<string, string[]>;
}
```

### `GraphInterchangeImport`

```ts
interface GraphInterchangeImport {
    nodes: NetworkNode[];
    edges: GraphEdge[];
    groups: NetworkGroup[];
    positions: Map<string, GraphPoint>;
    sizes: Map<string, GraphNodeSize>;
    direction?: GraphLayoutDirection;
    warnings: GraphInterchangeWarning[];
}
```

### `GraphInterchangeImportOptions`

```ts
interface GraphInterchangeImportOptions {
    maxItems?: number;
}
```

### `GraphInterchangeInput`

```ts
interface GraphInterchangeInput {
    nodes: readonly NetworkNode[];
    edges: readonly GraphEdge[];
    groups?: readonly NetworkGroup[];
    positions?: ReadonlyMap<string, GraphPoint>;
    sizes?: ReadonlyMap<string, GraphNodeSize>;
}
```

### `GraphInterchangeWarning`

```ts
interface GraphInterchangeWarning {
    code: GraphInterchangeWarningCode;
    id?: string;
    line?: number;
    message: string;
}
```

### `GraphInterchangeWarningCode`

```ts
type GraphInterchangeWarningCode = 'unsupported-statement' | 'unsupported-shape' | 'unsupported-style' | 'unsupported-element' | 'skipped-node' | 'skipped-edge' | 'skipped-group' | 'group-member' | 'invalid-value' | 'shifted-positions';
```

### `GraphKnownPosition`

```ts
type GraphKnownPosition = GraphPoint & Partial<GraphNodeSize> & {
    rank?: number;
};
```

### `GraphLabelEdit`

```ts
interface GraphLabelEdit {
    kind: 'node' | 'edge';
    id: string;
    before: string;
    after: string;
}
```

### `GraphLabels`

```ts
interface GraphLabels {
    region: string;
    empty: string;
    zoom: string;
    zoomIn: string;
    zoomOut: string;
    fit: string;
    minimap?: string;
    connectFrom?: string;
    connectTo?: string;
    reconnectSource?: string;
    reconnectTarget?: string;
    moveGroup?: string;
    rejected?: string;
    selectEdge?: string;
    groupWithin?: string;
    deleteRejected?: string;
    collapseGroup?: string;
    expandGroup?: string;
    collapsedNode?: string;
    collapsedNodes?: string;
    moveWaypoint?: string;
    addWaypoint?: string;
    reshapeRejected?: string;
    resizeNode?: string;
    topLeft?: string;
    topRight?: string;
    bottomLeft?: string;
    bottomRight?: string;
    resizeRejected?: string;
    editLabel?: string;
    labelRejected?: string;
    nodeToolbar?: string;
    edgeToolbar?: string;
}
```

### `GraphLayeredLayoutOptions`

```ts
interface GraphLayeredLayoutOptions extends GraphLayoutOptions {
    crossingReduction?: GraphCrossingReduction;
    crossingSweeps?: number;
}
```

### `GraphLayout`

```ts
interface GraphLayout {
    boxes: Map<string, GraphBox>;
    paths: Map<string, string>;
    edgeLabels: Map<string, {
        x: number;
        y: number;
    }>;
    width: number;
    height: number;
    routes?: Map<string, GraphLayoutRoute>;
}
```

### `GraphLayoutCancelMessage`

```ts
interface GraphLayoutCancelMessage {
    type: 'cancel';
    requestId: string;
    inputKey: string;
}
```

### `GraphLayoutChangeMetrics`

```ts
interface GraphLayoutChangeMetrics {
    compared: number;
    maxDisplacement: number;
    totalDisplacement: number;
    movedIds: string[];
    overlaps: number;
    edgeBoxIntersections: number;
}
```

### `GraphLayoutChangeOptions`

```ts
interface GraphLayoutChangeOptions {
    edges?: readonly GraphEdge[];
}
```

### `GraphLayoutCompletion`

```ts
interface GraphLayoutCompletion {
    layout: GraphLayout;
    temporaryEdgeIds: string[];
    unresolvedEdgeIds: string[];
}
```

### `GraphLayoutCompletionOptions`

```ts
interface GraphLayoutCompletionOptions {
    direction?: GraphLayoutDirection;
}
```

### `GraphLayoutDirection`

```ts
type GraphLayoutDirection = 'LR' | 'TB' | 'RL' | 'BT';
```

### `GraphLayoutFailureMessage`

```ts
interface GraphLayoutFailureMessage {
    type: 'failure';
    requestId: string;
    inputKey: string;
    scope: GraphLayoutScope;
    message: string;
}
```

### `GraphLayoutFunction`

```ts
type GraphLayoutFunction<N extends NetworkNode = NetworkNode, E extends GraphEdge = GraphEdge> = (nodes: readonly N[], edges: readonly E[]) => GraphLayout;
```

### `GraphLayoutJson`

```ts
interface GraphLayoutJson {
    boxes: [
        string,
        GraphBox
    ][];
    paths: [
        string,
        string
    ][];
    edgeLabels: [
        string,
        GraphPoint
    ][];
    width: number;
    height: number;
    routes?: [
        string,
        GraphLayoutRoute
    ][];
}
```

### `GraphLayoutKeyInput`

```ts
interface GraphLayoutKeyInput {
    scope: GraphLayoutScope;
    nodes: readonly IdentifiedNode[];
    edges: readonly GraphEdge[];
    groups?: readonly NetworkGroup[];
    collapsedGroupIds?: Iterable<string>;
    direction?: GraphLayoutDirection;
    positions?: ReadonlyMap<string, GraphPoint>;
    sizes?: ReadonlyMap<string, GraphNodeSize>;
    fixedIds?: ReadonlySet<string>;
    addedIds?: ReadonlySet<string>;
    settings?: unknown;
    revision?: string;
}
```

### `GraphLayoutOptions`

```ts
interface GraphLayoutOptions {
    direction?: GraphLayoutDirection;
    nodeWidth?: number;
    nodeHeight?: number;
    columnGap?: number;
    rowGap?: number;
    padding?: number;
}
```

### `GraphLayoutRequest`

```ts
interface GraphLayoutRequest<N extends NetworkNode = NetworkNode, E extends GraphEdge = GraphEdge, G extends NetworkGroup = NetworkGroup> {
    requestId: string;
    inputKey: string;
    scope: GraphLayoutScope;
    revision: string;
    nodes: readonly N[];
    edges: readonly E[];
    groups: readonly G[];
    direction: GraphLayoutDirection;
    positions?: ReadonlyMap<string, GraphPoint>;
    sizes?: ReadonlyMap<string, GraphNodeSize>;
    fixedIds?: ReadonlySet<string>;
    addedIds?: ReadonlySet<string>;
    settings?: unknown;
}
```

### `GraphLayoutRequestInput`

```ts
interface GraphLayoutRequestInput<N extends NetworkNode = NetworkNode, E extends GraphEdge = GraphEdge, G extends NetworkGroup = NetworkGroup> {
    nodes: readonly N[];
    edges: readonly E[];
    groups?: readonly G[];
    collapsedGroupIds?: Iterable<string>;
    direction?: GraphLayoutDirection;
    positions?: ReadonlyMap<string, GraphPoint>;
    sizes?: ReadonlyMap<string, GraphNodeSize>;
    fixedIds?: ReadonlySet<string>;
    addedIds?: ReadonlySet<string>;
    settings?: unknown;
    revision?: string;
    labels?: Partial<Pick<GraphLabels, 'collapsedNode' | 'collapsedNodes'>>;
}
```

### `GraphLayoutRequestJson`

```ts
type GraphLayoutRequestJson = Omit<GraphLayoutRequest, 'positions' | 'sizes' | 'fixedIds' | 'addedIds'> & {
    positions?: [
        string,
        GraphPoint
    ][];
    sizes?: [
        string,
        GraphNodeSize
    ][];
    fixedIds?: string[];
    addedIds?: string[];
};
```

### `GraphLayoutRequestMessage`

```ts
interface GraphLayoutRequestMessage {
    type: 'request';
    request: GraphLayoutRequest;
}
```

### `GraphLayoutRequests`

```ts
interface GraphLayoutRequests<N extends NetworkNode = NetworkNode, E extends GraphEdge = GraphEdge, G extends NetworkGroup = NetworkGroup> {
    shown: GraphLayoutRequest<GraphShownNode<N, G>, GraphShownEdge<E, G>, NetworkGroup>;
    expanded?: GraphLayoutRequest<N, E, G>;
    collapse?: GraphCollapseResult<N, E>;
}
```

### `GraphLayoutResponse`

```ts
interface GraphLayoutResponse {
    requestId: string;
    inputKey: string;
    scope: GraphLayoutScope;
    layout: GraphLayout;
}
```

### `GraphLayoutRoute`

```ts
interface GraphLayoutRoute {
    start: GraphPoint;
    end: GraphPoint;
    fromPort?: string;
    toPort?: string;
    fromSide?: GraphPort['side'];
    toSide?: GraphPort['side'];
    points?: readonly GraphPoint[];
}
```

### `GraphLayoutScope`

```ts
type GraphLayoutScope = 'expanded' | 'shown';
```

### `GraphLayoutSuccessMessage`

```ts
interface GraphLayoutSuccessMessage extends GraphLayoutResponse {
    type: 'success';
}
```

### `GraphLayoutWorkerAdapterOptions`

```ts
interface GraphLayoutWorkerAdapterOptions {
    transport?: 'clone' | 'json';
}
```

### `GraphLayoutWorkerJsonMessage`

```ts
type GraphLayoutWorkerJsonMessage = {
    type: 'request';
    request: GraphLayoutRequestJson;
} | GraphLayoutCancelMessage | (Omit<GraphLayoutSuccessMessage, 'layout'> & {
    layout: GraphLayoutJson;
}) | GraphLayoutFailureMessage;
```

### `GraphLayoutWorkerMessage`

```ts
type GraphLayoutWorkerMessage = GraphLayoutRequestMessage | GraphLayoutCancelMessage | GraphLayoutSuccessMessage | GraphLayoutFailureMessage;
```

### `GraphLayoutWorkerPort`

```ts
interface GraphLayoutWorkerPort {
    postMessage(message: unknown): void;
    addEventListener(type: 'message', listener: (event: {
        data: unknown;
    }) => void): void;
    removeEventListener(type: 'message', listener: (event: {
        data: unknown;
    }) => void): void;
}
```

### `GraphMlOptions`

```ts
interface GraphMlOptions {
    directed?: boolean;
}
```

### `GraphNodeMatch`

```ts
type GraphNodeMatch<N> = string | ((node: N) => boolean);
```

### `GraphNodeMove`

```ts
interface GraphNodeMove {
    id: string;
    before: GraphPoint;
    after: GraphPoint;
}
```

### `GraphNodeResize`

```ts
interface GraphNodeResize {
    id: string;
    before: GraphRect;
    after: GraphRect;
}
```

### `GraphNodeSize`

```ts
interface GraphNodeSize {
    width: number;
    height: number;
}
```

### `GraphObstacleAvoidance`

```ts
interface GraphObstacleAvoidance {
    clearance?: number;
    bendPenalty?: number;
}
```

### `GraphPageRankOptions`

```ts
interface GraphPageRankOptions {
    damping?: number;
    tolerance?: number;
    maxIterations?: number;
    weight?: (edge: GraphEdge) => number;
}
```

### `GraphPageRankResult`

```ts
interface GraphPageRankResult {
    scores: Map<string, number>;
    iterations: number;
    converged: boolean;
}
```

### `GraphPalette`

```ts
const GraphPalette: GraphPaletteComponent;
```

### `GraphPaletteComponent`

```ts
type GraphPaletteComponent = (new <D = unknown>(props: {
    items: readonly GraphPaletteItem<D>[];
} & Record<string, unknown>) => SfcInstance<GraphPaletteSfc<D>>) & SfcDefaultComponent<GraphPaletteSfc<unknown>>;
```

### `GraphPaletteDrop`

```ts
interface GraphPaletteDrop {
    id: string;
    data?: unknown;
}
```

### `GraphPaletteExposed`

```ts
type GraphPaletteExposed<D = unknown> = SfcExposed<GraphPaletteSfc<D>>;
```

### `GraphPaletteItem`

```ts
interface GraphPaletteItem<D = unknown> {
    id: string;
    label: string;
    detail?: string;
    shape?: NetworkNodeShape;
    tone?: ChartTone;
    section?: string;
    keywords?: readonly string[];
    disabled?: boolean;
    data?: D;
}
```

### `GraphPaletteLabels`

```ts
interface GraphPaletteLabels {
    region: string;
    search: string;
    noMatches: string;
}
```

### `GraphPaste`

```ts
interface GraphPaste {
    point: GraphPoint;
}
```

### `GraphPathResult`

```ts
interface GraphPathResult {
    nodeIds: string[];
    edgeIds: string[];
    distance: number;
}
```

### `GraphPngExportOptions`

```ts
interface GraphPngExportOptions<N extends NetworkNode = NetworkNode, E extends GraphEdge = GraphEdge> extends GraphExportOptions<N, E>, PngExportOptions {
}
```

### `GraphPoint`

```ts
interface GraphPoint {
    x: number;
    y: number;
}
```

### `GraphPort`

```ts
interface GraphPort {
    id: string;
    side: 'left' | 'right' | 'top' | 'bottom';
    direction?: 'source' | 'target' | 'both';
    offset?: number;
    label?: string;
}
```

### `GraphPortDirection`

```ts
type GraphPortDirection = 'in' | 'out' | 'both';
```

### `GraphPortRouteOptions`

```ts
interface GraphPortRouteOptions {
    policy?: GraphRoutingPolicy;
}
```

### `GraphPortRule`

```ts
interface GraphPortRule {
    type?: string | readonly string[];
    direction?: GraphPortDirection;
    maxConnections?: number;
}
```

### `GraphPortRules`

```ts
interface GraphPortRules {
    ports?: Readonly<Record<string, Readonly<Record<string, GraphPortRule>>>>;
    nodes?: Readonly<Record<string, GraphPortRule>>;
    default?: GraphPortRule;
}
```

### `GraphRadialLayoutOptions`

```ts
interface GraphRadialLayoutOptions {
    nodeWidth?: number;
    nodeHeight?: number;
    ringGap?: number;
    padding?: number;
    roots?: readonly string[];
}
```

### `GraphReconnect`

```ts
interface GraphReconnect {
    id: string;
    before: GraphConnection;
    after: GraphConnection;
}
```

### `GraphRect`

```ts
interface GraphRect {
    x: number;
    y: number;
    width: number;
    height: number;
}
```

### `GraphRouteCache`

```ts
interface GraphRouteCache {
    readonly graphRouteCache: true;
}
```

### `GraphRouteEnd`

```ts
interface GraphRouteEnd extends GraphPoint {
    side: Side;
}
```

### `GraphRoutingPolicy`

```ts
type GraphRoutingPolicy = 'builtin' | 'preserve';
```

### `GraphSearchOptions`

```ts
interface GraphSearchOptions {
    fields?: readonly ('id' | 'label')[];
}
```

### `GraphSelectionMode`

```ts
type GraphSelectionMode = 'box' | 'lasso';
```

### `GraphShownEdge`

```ts
type GraphShownEdge<E extends GraphEdge = GraphEdge, G extends NetworkGroup = NetworkGroup> = E | ([
    G
] extends [
    never
] ? never : GraphEdge<never>);
```

### `GraphShownNode`

```ts
type GraphShownNode<N extends NetworkNode = NetworkNode, G extends NetworkGroup = NetworkGroup> = N | ([
    G
] extends [
    never
] ? never : GraphCollapsedNode);
```

### `GraphSnapshotData`

```ts
interface GraphSnapshotData {
    nodes: readonly NetworkNode[];
    edges: readonly GraphEdge[];
    groups?: readonly NetworkGroup[];
    positions?: readonly (readonly [
        string,
        GraphPoint
    ])[];
    sizes?: readonly (readonly [
        string,
        GraphNodeSize
    ])[];
}
```

### `GraphSnapshotInput`

```ts
interface GraphSnapshotInput {
    kind: 'graph';
    data: Omit<GraphSnapshotData, 'positions' | 'sizes'> & {
        positions?: ReadonlyMap<string, GraphPoint>;
        sizes?: ReadonlyMap<string, GraphNodeSize>;
    };
    view?: {
        graph?: Omit<GraphSnapshotView, 'collapsedGroupIds'> & {
            collapsedGroupIds?: ReadonlySet<string>;
        };
    };
    metadata?: SnapshotMetadata;
    extensions?: {
        readonly [namespace: string]: unknown;
    };
}
```

### `GraphSnapshotV1`

```ts
interface GraphSnapshotV1 extends SnapshotBase {
    kind: 'graph';
    data: GraphSnapshotData;
    view?: {
        graph?: GraphSnapshotView;
    };
}
```

### `GraphSnapshotView`

```ts
interface GraphSnapshotView {
    camera?: GraphCameraTarget;
    collapsedGroupIds?: readonly string[];
    layout?: {
        id: string;
        options?: {
            readonly [key: string]: JsonValue;
        };
    };
}
```

### `GraphSvgGroup`

```ts
interface GraphSvgGroup {
    id: string;
    label: string;
    x: number;
    y: number;
    width: number;
    height: number;
}
```

### `GraphSvgOptions`

```ts
interface GraphSvgOptions<N extends NetworkNode = NetworkNode, E extends GraphEdge = GraphEdge> extends SvgExportOptions {
    groups?: readonly GraphSvgGroup[];
    lanes?: readonly GraphSwimlaneBand[];
    pools?: readonly GraphSwimlanePoolBand[];
    selectedIds?: Iterable<string>;
    highlightedNodeIds?: Iterable<string>;
    highlightedEdgeIds?: Iterable<string>;
    highlightColor?: string;
    padding?: number;
    nodeLabel?: (node: N) => string;
    nodeDetail?: (node: N) => string | undefined;
    edgeLabel?: (edge: E) => string | undefined;
    edgeBands?: ReadonlyMap<string, GraphEdgeBand>;
}
```

### `GraphSwimlane`

```ts
interface GraphSwimlane extends GraphSwimlaneBand {
    index: number;
    nodeIds: string[];
}
```

### `GraphSwimlaneBand`

```ts
interface GraphSwimlaneBand extends GraphRect {
    id: string;
    label: string;
    header: GraphRect;
}
```

### `GraphSwimlaneLayout`

```ts
interface GraphSwimlaneLayout extends GraphLayout {
    lanes: GraphSwimlane[];
    pools?: GraphSwimlanePool[];
}
```

### `GraphSwimlaneLayoutOptions`

```ts
interface GraphSwimlaneLayoutOptions<N extends IdentifiedNode = IdentifiedNode> extends GraphLayoutOptions {
    lanes: readonly (string | GraphSwimlaneSpec)[];
    laneOf: ((node: N) => string | undefined) | ReadonlyMap<string, string>;
    laneGap?: number;
    lanePadding?: number;
    minLaneSize?: number;
    headerSize?: number;
    crossingReduction?: 'none' | 'barycenter';
    crossingSweeps?: number;
    pools?: readonly GraphSwimlanePoolSpec[];
    poolHeaderSize?: number;
    poolGap?: number;
}
```

### `GraphSwimlanePool`

```ts
interface GraphSwimlanePool extends GraphSwimlanePoolBand {
    index: number;
    laneIds: string[];
}
```

### `GraphSwimlanePoolBand`

```ts
interface GraphSwimlanePoolBand extends GraphRect {
    id: string;
    label: string;
    header: GraphRect;
    laneIds: readonly string[];
}
```

### `GraphSwimlanePoolSpec`

```ts
interface GraphSwimlanePoolSpec {
    id: string;
    label?: string;
    lanes: readonly string[];
}
```

### `GraphSwimlaneSpec`

```ts
interface GraphSwimlaneSpec {
    id: string;
    label?: string;
}
```

### `GraphTracedPath`

```ts
interface GraphTracedPath {
    direction?: GraphWalkDirection;
    nodeIds: string[];
    edgeIds: string[];
}
```

### `GraphTraversalDirection`

```ts
type GraphTraversalDirection = 'forward' | 'backward' | 'both';
```

### `GraphTraversalOptions`

```ts
interface GraphTraversalOptions<E extends GraphEdge = GraphEdge> {
    direction?: GraphTraversalDirection;
    maxHops?: number;
    edgeFilter?: (edge: E, direction: GraphWalkDirection) => boolean;
    maxNodes?: number;
    paths?: boolean;
}
```

### `GraphTraversalResult`

```ts
interface GraphTraversalResult {
    nodeIds: string[];
    edgeIds: string[];
    unknownIds: string[];
    truncated?: GraphTraversalTruncation[];
    via?: GraphTraversalVia;
    multiplyReachedIds?: string[];
}
```

### `GraphTraversalStep`

```ts
interface GraphTraversalStep {
    edgeId: string;
    previousId: string;
}
```

### `GraphTraversalTruncation`

```ts
interface GraphTraversalTruncation {
    nodeId: string;
    direction: GraphWalkDirection;
    reason: 'max-hops' | 'max-nodes';
}
```

### `GraphTraversalVia`

```ts
interface GraphTraversalVia {
    forward?: Map<string, GraphTraversalStep>;
    backward?: Map<string, GraphTraversalStep>;
}
```

### `GraphTreeLayoutOptions`

```ts
interface GraphTreeLayoutOptions extends GraphLayoutOptions {
    roots?: readonly string[];
}
```

### `GraphViewTarget`

```ts
type GraphViewTarget = Extract<ViewTarget, {
    view: 'graph';
}>;
```

### `GraphViewport`

```ts
interface GraphViewport {
    x: number;
    y: number;
    scale: number;
}
```

### `GraphVisibleIds`

```ts
interface GraphVisibleIds {
    nodes: Set<string>;
    edges: Set<string>;
}
```

### `GraphWalkDirection`

```ts
type GraphWalkDirection = 'forward' | 'backward';
```

### `HistoryReset`

```ts
interface HistoryReset {
    reason: 'refresh';
    version: string;
}
```

### `ICalendarEvent`

```ts
interface ICalendarEvent {
    id: string;
    summary: string;
    start: number;
    end: number;
    description?: string;
    recurrence?: CalendarRecurrence;
    seriesId?: string;
    recurrenceId?: number;
}
```

### `ICalendarExpandOptions`

```ts
interface ICalendarExpandOptions {
    range: TimeRange;
    maxOccurrences?: number;
}
```

### `ICalendarImport`

```ts
interface ICalendarImport {
    name?: string;
    events: ICalendarImportEvent[];
    warnings: ICalendarImportWarning[];
}
```

### `ICalendarImportEvent`

```ts
interface ICalendarImportEvent extends ICalendarEvent {
    allDay: boolean;
    recurrenceRule?: string;
    recurrence?: CalendarRecurrence & {
        rule?: RecurrenceRule;
    };
    seriesId?: string;
    recurrenceId?: number;
}
```

### `ICalendarImportOptions`

```ts
interface ICalendarImportOptions {
    utcOffsetMinutes?: number;
    recurrence?: 'first' | 'series' | ICalendarExpandOptions;
}
```

### `ICalendarImportWarning`

```ts
interface ICalendarImportWarning {
    code: ICalendarImportWarningCode;
    eventId?: string;
    line?: number;
    message: string;
}
```

### `ICalendarImportWarningCode`

```ts
type ICalendarImportWarningCode = 'skipped-event' | 'missing-uid' | 'recurrence' | 'unknown-time-zone' | 'invalid-value' | 'malformed';
```

### `ICalendarOptions`

```ts
interface ICalendarOptions {
    productId?: string;
    calendarName?: string;
    timestamp?: number;
}
```

### `ICalendarTimeline`

```ts
interface ICalendarTimeline {
    rows: TimelineRow[];
    bars: TimelineBar[];
}
```

### `IdentifiedNode`

```ts
interface IdentifiedNode {
    id: string;
    ports?: readonly GraphPort[];
}
```

### `InspectorAssignment`

```ts
interface InspectorAssignment {
    resourceId: string;
    units: number;
}
```

### `InspectorAssignmentsField`

```ts
interface InspectorAssignmentsField<T extends InspectorItem = InspectorItem> extends InspectorListFieldBase {
    kind: 'assignments';
    get: (item: T) => readonly InspectorAssignment[];
    defaultUnits?: number;
    maxUnits?: number;
}
```

### `InspectorChange`

```ts
interface InspectorChange {
    id: string;
    field: string;
    before: FieldValue;
    after: FieldValue;
}
```

### `InspectorChangeValidator`

```ts
type InspectorChangeValidator<T extends InspectorItem = InspectorItem> = (change: InspectorChange, item: T) => boolean | string | void;
```

### `InspectorDependenciesField`

```ts
interface InspectorDependenciesField<T extends InspectorItem = InspectorItem> extends InspectorListFieldBase {
    kind: 'dependencies';
    get: (item: T) => readonly InspectorDependency[];
    lagUnitSize?: number;
    lagUnitLabel?: string;
}
```

### `InspectorDependency`

```ts
interface InspectorDependency {
    predecessorId: string;
    type: TimelineDependencyType;
    lag: number;
}
```

### `InspectorField`

```ts
interface InspectorField<T extends InspectorItem = InspectorItem> extends Omit<TimelineFieldSpec, 'kind' | 'get'> {
    kind: InspectorFieldKind;
    label: string;
    get: (item: T) => FieldValue;
    readonly?: boolean;
    description?: string;
    placeholder?: string;
}
```

### `InspectorFieldKind`

```ts
type InspectorFieldKind = TimelineFieldKind | 'color';
```

### `InspectorItem`

```ts
interface InspectorItem {
    id: string;
}
```

### `InspectorListChange`

```ts
type InspectorListChange = {
    id: string;
    field: string;
    kind: 'assignments';
    before: InspectorAssignment[];
    after: InspectorAssignment[];
} | {
    id: string;
    field: string;
    kind: 'dependencies';
    before: InspectorDependency[];
    after: InspectorDependency[];
};
```

### `InspectorListChangeValidator`

```ts
type InspectorListChangeValidator<T extends InspectorItem = InspectorItem> = (change: InspectorListChange, item: T) => boolean | string | void;
```

### `InspectorListField`

```ts
type InspectorListField<T extends InspectorItem = InspectorItem> = InspectorAssignmentsField<T> | InspectorDependenciesField<T>;
```

### `InspectorListFieldKind`

```ts
type InspectorListFieldKind = 'assignments' | 'dependencies';
```

### `InspectorOption`

```ts
interface InspectorOption {
    value: string;
    label?: string;
}
```

### `IntlTimeFormatterOptions`

```ts
interface IntlTimeFormatterOptions {
    locale?: string | readonly string[];
    timeZone?: string;
    utcOffsetMinutes?: number;
    format?: Intl.DateTimeFormatOptions;
}
```

### `JsonValue`

```ts
type JsonValue = null | boolean | number | string | readonly JsonValue[] | {
    readonly [key: string]: JsonValue;
};
```

### `LevelResourcesInput`

```ts
interface LevelResourcesInput extends ScheduleInput {
    resources: readonly ResourceCapacity[];
    assignments: readonly ResourceAssignment[];
}
```

### `LevelResourcesResult`

```ts
type LevelResourcesResult = LevelResourcesSuccess | ScheduleFailure;
```

### `LevelResourcesSuccess`

```ts
interface LevelResourcesSuccess extends ScheduleSuccess {
    leveledTasks: readonly ScheduleTask[];
    delays: readonly ResourceDelay[];
    overloads: readonly ResourceLoadSegment[];
    unresolvedTaskIds: readonly string[];
}
```

### `LinkedGraphSets`

```ts
interface LinkedGraphSets {
    selectedNodeIds: ReadonlySet<string>;
    selectedEdgeIds: ReadonlySet<string>;
    highlightedNodeIds: ReadonlySet<string>;
    highlightedEdgeIds: ReadonlySet<string>;
    highlightedGroupIds: ReadonlySet<string>;
    relatedNodeIds: ReadonlySet<string>;
    relatedEdgeIds: ReadonlySet<string>;
    relatedGroupIds: ReadonlySet<string>;
}
```

### `LinkedLoadSets`

```ts
interface LinkedLoadSets {
    selected: readonly LoadViewTarget[];
    highlighted: readonly LoadViewTarget[];
    related: readonly LoadViewTarget[];
}
```

### `LinkedRevealResult`

```ts
interface LinkedRevealResult extends RevealResult {
    expandedIds: string[];
    declined?: boolean;
}
```

### `LinkedTimeRange`

```ts
interface LinkedTimeRange extends TimelineBarsInRangeOptions, TimeRangeTargetsOptions {
    range: TimeRange;
    bars: readonly TimelineBarActivity[];
}
```

### `LinkedTimelineSets`

```ts
interface LinkedTimelineSets {
    selectedBarIds: ReadonlySet<string>;
    highlightedBarIds: ReadonlySet<string>;
    highlightedDependencyIds: ReadonlySet<string>;
    highlightedRowIds: ReadonlySet<string>;
    relatedBarIds: ReadonlySet<string>;
    relatedDependencyIds: ReadonlySet<string>;
    relatedRowIds: ReadonlySet<string>;
}
```

### `LinkedViewName`

```ts
type LinkedViewName = ViewTarget['view'];
```

### `LoadSegmentLike`

```ts
interface LoadSegmentLike {
    resourceId: string;
    start: number;
    end: number;
}
```

### `LoadViewTarget`

```ts
type LoadViewTarget = Extract<ViewTarget, {
    view: 'load';
}>;
```

### `MermaidDirection`

```ts
type MermaidDirection = 'TD' | 'TB' | 'LR' | 'RL' | 'BT';
```

### `MermaidOptions`

```ts
interface MermaidOptions {
    direction?: MermaidDirection;
    edgeIds?: boolean;
}
```

### `MsProjectAssignment`

```ts
interface MsProjectAssignment {
    taskId: string;
    resourceId: string;
    units?: number;
}
```

### `MsProjectBaseline`

```ts
interface MsProjectBaseline {
    number: number;
    start: number;
    end: number;
}
```

### `MsProjectCalendar`

```ts
interface MsProjectCalendar {
    id: string;
    name: string;
    base?: boolean;
    baseCalendarId?: string;
    week: WorkWeek;
}
```

### `MsProjectDependency`

```ts
interface MsProjectDependency {
    from: string;
    to: string;
    type?: TimelineDependencyType;
    lag?: number;
}
```

### `MsProjectImport`

```ts
interface MsProjectImport {
    name: string;
    tasks: MsProjectImportTask[];
    dependencies: MsProjectDependency[];
    warnings: MsProjectImportWarning[];
    calendars?: MsProjectCalendar[];
    defaultCalendarId?: string;
    resources?: MsProjectResource[];
    assignments?: MsProjectAssignment[];
}
```

### `MsProjectImportTask`

```ts
interface MsProjectImportTask extends MsProjectTask {
    outlineLevel: number;
    percentComplete: number;
    milestone: boolean;
    summary: boolean;
    manual: boolean;
    inactive: boolean;
    duration?: number;
    mode?: 'alap';
}
```

### `MsProjectImportWarning`

```ts
interface MsProjectImportWarning {
    code: MsProjectImportWarningCode;
    taskId?: string;
    calendarId?: string;
    resourceId?: string;
    message: string;
}
```

### `MsProjectImportWarningCode`

```ts
type MsProjectImportWarningCode = 'skipped-task' | 'outline-level' | 'invalid-value' | 'unsupported-constraint' | 'skipped-baseline' | 'unknown-predecessor' | 'skipped-link' | 'percent-lag' | 'working-time-lag' | 'skipped-calendar' | 'invalid-calendar' | 'unsupported-calendar' | 'unknown-calendar' | 'skipped-resource' | 'skipped-assignment';
```

### `MsProjectInput`

```ts
interface MsProjectInput {
    name: string;
    tasks: readonly MsProjectTask[];
    dependencies?: readonly MsProjectDependency[];
    calendars?: readonly MsProjectCalendar[];
    defaultCalendarId?: string;
    resources?: readonly MsProjectResource[];
    assignments?: readonly MsProjectAssignment[];
}
```

### `MsProjectResource`

```ts
interface MsProjectResource {
    id: string;
    name: string;
    type?: 'work' | 'material' | 'cost';
    maxUnits?: number;
    calendarId?: string;
}
```

### `MsProjectResourceLoad`

```ts
interface MsProjectResourceLoad {
    resources: ResourceCapacity[];
    assignments: ResourceAssignment[];
    warnings: MsProjectImportWarning[];
}
```

### `MsProjectResourceLoadOptions`

```ts
interface MsProjectResourceLoadOptions {
    unitScale?: number;
    range?: TimeRange;
}
```

### `MsProjectTask`

```ts
interface MsProjectTask {
    id: string;
    name: string;
    start: number;
    end: number;
    outlineLevel?: number;
    percentComplete?: number;
    milestone?: boolean;
    baselines?: readonly MsProjectBaseline[];
    constraints?: TimelineConstraints;
    inactive?: boolean;
    manual?: boolean;
    calendarId?: string;
}
```

### `MsProjectTimeline`

```ts
interface MsProjectTimeline {
    rows: TimelineRow[];
    bars: TimelineBar[];
    dependencies: TimelineDependency[];
    hiddenDependencyIds: string[];
    resources?: ResourceTimelineResource[];
    assignments?: ResourceAssignment[];
}
```

### `MsProjectTimelineOptions`

```ts
interface MsProjectTimelineOptions {
    baselineId?: (number: number) => string;
    summaryDependencies?: boolean;
}
```

### `MsProjectXmlOptions`

```ts
interface MsProjectXmlOptions {
    utcOffsetMinutes?: number;
}
```

### `NetworkEdgeSlot`

```ts
interface NetworkEdgeSlot<E extends GraphEdge = GraphEdge> {
    edge: E;
    path: string;
    selected: boolean;
    related: boolean;
    highlighted: boolean;
    dimmed?: boolean;
    scale: number;
    band?: GraphEdgeBand;
}
```

### `NetworkEdgeToolbarSlot`

```ts
interface NetworkEdgeToolbarSlot<E extends GraphEdge = GraphEdge> {
    edge: E;
    point: GraphPoint;
    scale: number;
}
```

### `NetworkFlowchartShape`

```ts
type NetworkFlowchartShape = 'circle' | 'stadium' | 'parallelogram' | 'document' | 'cylinder' | 'data-object';
```

### `NetworkFocusOptions`

```ts
interface NetworkFocusOptions {
    scale?: number;
}
```

### `NetworkGraph`

```ts
const NetworkGraph: NetworkGraphComponent;
```

### `NetworkGraphComponent`

```ts
type NetworkGraphComponent = (new <N extends NetworkNode = NetworkNode, E extends GraphEdge = GraphEdge, G extends NetworkGroup = never>(props: {
    nodes: readonly N[];
    edges: readonly E[];
    groups?: readonly G[];
} & Record<string, unknown>) => SfcInstance<NetworkGraphSfc<N & NetworkNode, E & GraphEdge, G>>) & SfcDefaultComponent<NetworkGraphSfc<NetworkNode, GraphEdge, NetworkGroup>>;
```

### `NetworkGraphExposed`

```ts
type NetworkGraphExposed<N extends NetworkNode = NetworkNode, E extends GraphEdge = GraphEdge, G extends NetworkGroup = never> = SfcExposed<NetworkGraphSfc<N, E, G>>;
```

### `NetworkGroup`

```ts
interface NetworkGroup extends GraphGroup {
    parentId?: string;
}
```

### `NetworkGroupSlot`

```ts
interface NetworkGroupSlot<G extends NetworkGroup = NetworkGroup> {
    group: G;
    box: GraphRect;
    depth: number;
}
```

### `NetworkMinimapNodeSlot`

```ts
interface NetworkMinimapNodeSlot<N extends NetworkNode = NetworkNode> {
    node: N;
    box: GraphBox;
    selected: boolean;
}
```

### `NetworkNode`

```ts
interface NetworkNode<D = unknown> extends IdentifiedNode {
    label: string;
    detail?: string;
    tone?: ChartTone;
    draggable?: boolean;
    deletable?: boolean;
    shape?: NetworkNodeShape;
    resizable?: boolean;
    marker?: NetworkNodeMarker;
    event?: NetworkNodeEvent;
    labelPosition?: NetworkNodeLabelPosition;
    data?: D;
}
```

### `NetworkNodeEvent`

```ts
type NetworkNodeEvent = 'start' | 'intermediate' | 'end';
```

### `NetworkNodeLabelPosition`

```ts
type NetworkNodeLabelPosition = 'inside' | 'below';
```

### `NetworkNodeMarker`

```ts
type NetworkNodeMarker = 'exclusive' | 'parallel' | 'inclusive' | 'event-based' | 'message' | 'timer' | 'user' | 'service' | 'manual';
```

### `NetworkNodeShape`

```ts
type NetworkNodeShape = 'box' | 'rounded' | 'diamond' | 'ellipse' | 'hexagon' | NetworkFlowchartShape;
```

### `NetworkNodeSlot`

```ts
interface NetworkNodeSlot<N extends NetworkNode = NetworkNode> {
    node: N;
    box: GraphBox;
    selected: boolean;
    dimmed?: boolean;
    related: boolean;
    highlighted: boolean;
    scale: number;
}
```

### `NetworkNodeToolbarSlot`

```ts
interface NetworkNodeToolbarSlot<N extends NetworkNode = NetworkNode> {
    node: N;
    box: GraphBox;
    scale: number;
}
```

### `NetworkTooltipSlot`

```ts
interface NetworkTooltipSlot<N extends NetworkNode = NetworkNode, E extends GraphEdge = GraphEdge> {
    target: {
        kind: 'node';
        node: N;
    } | {
        kind: 'edge';
        edge: E;
    };
}
```

### `PaletteDropSource`

```ts
type PaletteDropSource = {
    readonly dataTransfer: Pick<DataTransfer, 'getData'> | null;
} | Pick<DataTransfer, 'getData'>;
```

### `ParseWeaveSnapshotOptions`

```ts
interface ParseWeaveSnapshotOptions {
    migrations?: Readonly<Record<number, SnapshotMigration>>;
}
```

### `ParseWeaveSnapshotResult`

```ts
type ParseWeaveSnapshotResult = {
    ok: true;
    snapshot: WeaveSnapshotV1;
    diagnostics: readonly SnapshotDiagnostic[];
} | {
    ok: false;
    diagnostics: readonly SnapshotDiagnostic[];
};
```

### `PendingTransaction`

```ts
interface PendingTransaction {
    operationId: string;
    kind: 'changes' | 'restore';
    source: TransactionSource;
    baseVersion: string;
    epoch: number;
}
```

### `PlacementDiagnostic`

```ts
type PlacementDiagnostic = PlacementPredecessorDiagnostic | PlacementSummaryDiagnostic;
```

### `PlacementInput`

```ts
interface PlacementInput extends ScheduleInput {
    assignments?: readonly ResourceAssignment[];
}
```

### `PlacementPredecessorDiagnostic`

```ts
interface PlacementPredecessorDiagnostic {
    code: 'unplaced-predecessor';
    taskId: string;
    predecessorId: string;
    dependencyId: string;
}
```

### `PlacementResult`

```ts
interface PlacementResult<I extends PlacementInput = PlacementInput> {
    ok: boolean;
    input: I;
    diagnostics: readonly PlacementDiagnostic[];
    unplacedTaskIds: readonly string[];
    excludedDependencyIds: readonly string[];
    excludedAssignments: readonly ResourceAssignment[];
    retargetedDependencies?: readonly PlacementRetargetedDependency[];
}
```

### `PlacementRetargetedDependency`

```ts
interface PlacementRetargetedDependency {
    id: string;
    dependencyId: string;
    summaryId: string;
    taskId: string;
}
```

### `PlacementSummaryDiagnostic`

```ts
interface PlacementSummaryDiagnostic {
    code: 'unplaced-subtasks';
    taskId: string;
}
```

### `PlanAssignmentChange`

```ts
interface PlanAssignmentChange {
    taskId: string;
    resourceId: string;
    fields: readonly string[];
}
```

### `PlanAssignmentDiff`

```ts
interface PlanAssignmentDiff {
    added: readonly ResourceAssignment[];
    removed: readonly ResourceAssignment[];
    changed: readonly PlanAssignmentChange[];
    taskIds: readonly string[];
}
```

### `PlanCollectionDiff`

```ts
interface PlanCollectionDiff {
    added: readonly string[];
    removed: readonly string[];
    changed: readonly PlanFieldChange[];
}
```

### `PlanComparison`

```ts
interface PlanComparison {
    complete: boolean;
    partial: {
        current: boolean;
        candidate: boolean;
    };
    revision: {
        current?: string;
        base?: string;
        stale: boolean;
    };
    empty: boolean;
    input: PlanInputDiff;
    result: PlanResultDiff;
}
```

### `PlanComparisonInput`

```ts
interface PlanComparisonInput extends ScheduleInput {
    tasks: readonly PlanComparisonTask[];
    resources?: readonly ResourceCapacity[];
    assignments?: readonly ResourceAssignment[];
}
```

### `PlanComparisonTargetOptions`

```ts
interface PlanComparisonTargetOptions {
    taskIds?: Iterable<string>;
    entityKind?: string;
}
```

### `PlanComparisonTargets`

```ts
interface PlanComparisonTargets {
    entities: EntityRef[];
    targets: ViewTarget[];
    unknown: EntityRef[];
    load: LoadViewTarget[];
}
```

### `PlanComparisonTask`

```ts
interface PlanComparisonTask extends ScheduleTask {
    deadline?: number;
}
```

### `PlanFieldChange`

```ts
interface PlanFieldChange {
    id: string;
    fields: readonly string[];
}
```

### `PlanInputDiff`

```ts
interface PlanInputDiff {
    settings: readonly string[];
    tasks: PlanCollectionDiff;
    dependencies: PlanCollectionDiff;
    calendars: PlanCollectionDiff;
    resources: PlanCollectionDiff;
    assignments: PlanAssignmentDiff;
}
```

### `PlanResourceOverload`

```ts
interface PlanResourceOverload {
    resourceId: string;
    current?: number;
    candidate?: number;
    change?: number;
}
```

### `PlanResultDiff`

```ts
interface PlanResultDiff {
    state: {
        current: PlanScheduleState;
        candidate: PlanScheduleState;
    };
    comparable: boolean;
    finish: {
        current?: number;
        candidate?: number;
        shift?: number;
    };
    tasks: readonly PlanTaskComparison[];
    editedTaskIds: readonly string[];
    consequenceTaskIds: readonly string[];
    criticalDependencies: {
        gained: readonly string[];
        lost: readonly string[];
    };
    violations: {
        current?: readonly PlanViolation[];
        candidate?: readonly PlanViolation[];
        gained: readonly PlanViolation[];
        lost: readonly PlanViolation[];
    };
    overload: readonly PlanResourceOverload[];
}
```

### `PlanScenario`

```ts
interface PlanScenario {
    input: PlanComparisonInput;
    result?: ScheduleResult | LevelResourcesResult;
    load?: readonly ResourceLoadSegment[];
    revision?: string;
    baseRevision?: string;
    partial?: boolean;
}
```

### `PlanScheduleState`

```ts
type PlanScheduleState = {
    status: 'scheduled';
    finish: number;
} | {
    status: 'cycle';
    cycles: readonly ScheduleCycle[];
} | {
    status: 'infeasible';
    taskId: string;
    constraints: readonly ScheduleConstraintName[];
    dependencyIds: readonly string[];
    deadline: boolean;
};
```

### `PlanTaskComparison`

```ts
interface PlanTaskComparison {
    id: string;
    edited: boolean;
    input: 'added' | 'removed' | 'changed' | 'unchanged';
    fields: readonly string[];
    assignmentsChanged: boolean;
    current: PlanTaskSide;
    candidate: PlanTaskSide;
    startShift?: number;
    finishShift?: number;
    critical?: 'gained' | 'lost';
    resourceIds: {
        current: readonly string[];
        candidate: readonly string[];
    };
    reasons?: {
        current?: readonly ScheduleReason[];
        candidate?: readonly ScheduleReason[];
    };
}
```

### `PlanTaskSide`

```ts
type PlanTaskSide = {
    state: 'scheduled';
    start: number;
    end: number;
    critical: boolean;
    summary?: true;
    manual?: true;
} | {
    state: 'inactive';
} | {
    state: 'absent';
} | {
    state: 'unscheduled';
};
```

### `PlanViolation`

```ts
type PlanViolation = {
    code: 'deadline';
    taskId: string;
    deadline: number;
    finish: number;
} | {
    code: 'manual-conflict';
    taskId: string;
    dependencyId: string;
} | {
    code: 'leveling-unresolved';
    taskId: string;
};
```

### `PlanningDiagnostic`

```ts
interface PlanningDiagnostic {
    id: string;
    code: PlanningDiagnosticCode;
    severity: PlanningDiagnosticSeverity;
    entities: readonly EntityRef[];
    range?: TimeRange;
    constraints?: readonly ScheduleConstraintName[];
    reasonIds: readonly string[];
}
```

### `PlanningDiagnosticCode`

```ts
type PlanningDiagnosticCode = 'schedule-cycle' | 'schedule-infeasible' | 'resource-overload' | 'leveling-unresolved' | 'manual-conflict';
```

### `PlanningDiagnosticSeverity`

```ts
type PlanningDiagnosticSeverity = 'info' | 'warning' | 'error';
```

### `PlanningPlacement`

```ts
interface PlanningPlacement {
    taskId: string;
    resourceId: string;
}
```

### `PlanningSnapshotData`

```ts
interface PlanningSnapshotData extends LevelResourcesInput {
    placements?: readonly PlanningPlacement[];
    display?: readonly PlanningTaskDisplay[];
}
```

### `PlanningSnapshotInput`

```ts
interface PlanningSnapshotInput {
    kind: 'planning';
    data: PlanningSnapshotData;
    view?: {
        timeline?: Omit<TimelineSnapshotView, 'collapsedRowIds'> & {
            collapsedRowIds?: ReadonlySet<string>;
        };
    };
    metadata?: SnapshotMetadata;
    extensions?: {
        readonly [namespace: string]: unknown;
    };
}
```

### `PlanningSnapshotV1`

```ts
interface PlanningSnapshotV1 extends SnapshotBase {
    kind: 'planning';
    data: PlanningSnapshotData;
    view?: {
        timeline?: TimelineSnapshotView;
    };
}
```

### `PlanningTaskDisplay`

```ts
interface PlanningTaskDisplay {
    taskId: string;
    label?: string;
    detail?: string;
    tone?: ChartTone;
    data?: unknown;
}
```

### `PngExportOptions`

```ts
interface PngExportOptions {
    scale?: number;
}
```

### `ProgressEditValidator`

```ts
type ProgressEditValidator = (change: TimelineProgressEdit) => boolean | string | void;
```

### `PropagateEditResult`

```ts
type PropagateEditResult = PropagateEditSuccess | ScheduleFailure;
```

### `PropagateEditSuccess`

```ts
interface PropagateEditSuccess {
    ok: true;
    schedule: ScheduleSuccess;
    changes: ScheduleChange[];
}
```

### `PropertyInspector`

```ts
const PropertyInspector: PropertyInspectorComponent;
```

### `PropertyInspectorComponent`

```ts
type PropertyInspectorComponent = (new <T extends InspectorItem = InspectorItem>(props: {
    item?: T | null;
    fields: readonly (InspectorField<T> | InspectorListField<T>)[];
} & Record<string, unknown>) => SfcInstance<PropertyInspectorSfc<T>>) & SfcDefaultComponent<PropertyInspectorSfc<InspectorItem>>;
```

### `PropertyInspectorExposed`

```ts
type PropertyInspectorExposed<T extends InspectorItem = InspectorItem> = SfcExposed<PropertyInspectorSfc<T>>;
```

### `PropertyInspectorFieldSlot`

```ts
interface PropertyInspectorFieldSlot<T extends InspectorItem = InspectorItem> {
    field: InspectorField<T>;
    item: T;
    value: FieldValue;
    text: string;
    error?: string;
    readonly: boolean;
    inputId: string;
    describedBy?: string;
    commit: (value: FieldValue) => boolean;
    commitText: (text: string) => boolean;
    cancel: () => void;
}
```

### `PropertyInspectorLabels`

```ts
interface PropertyInspectorLabels {
    region: string;
    empty: string;
    rejected: string;
    none: string;
    resource?: string;
    units?: string;
    predecessor?: string;
    type?: string;
    lag?: string;
    for?: string;
    remove?: string;
    addAssignment?: string;
    addDependency?: string;
    noRows?: string;
}
```

### `RecurrenceExpandOptions`

```ts
interface RecurrenceExpandOptions {
    timeZone?: string;
    maxOccurrences?: number;
}
```

### `RecurrenceFrequency`

```ts
type RecurrenceFrequency = 'daily' | 'weekly' | 'monthly' | 'yearly';
```

### `RecurrenceOccurrence`

```ts
interface RecurrenceOccurrence extends TimeRange {
    id: string;
    seriesId: string;
    recurrenceId: number;
}
```

### `RecurrenceRule`

```ts
interface RecurrenceRule {
    frequency: RecurrenceFrequency;
    interval?: number;
    count?: number;
    until?: number;
    byWeekday?: readonly RecurrenceWeekday[];
    byMonthDay?: readonly number[];
    byMonth?: readonly number[];
    bySetPosition?: readonly number[];
    weekStart?: number;
}
```

### `RecurrenceSeries`

```ts
interface RecurrenceSeries extends CalendarRecurrence, TimeRange {
    id: string;
}
```

### `RecurrenceWeekday`

```ts
interface RecurrenceWeekday {
    weekday: number;
    ordinal?: number;
}
```

### `RecurrenceZoneOptions`

```ts
interface RecurrenceZoneOptions {
    timeZone?: string;
    utcOffsetMinutes?: number;
}
```

### `RecurringEditChange`

```ts
interface RecurringEditChange extends TimeRange {
    resourceId?: string;
}
```

### `RecurringEditOptions`

```ts
interface RecurringEditOptions {
    timeZone?: string;
    newSeriesId?: string;
}
```

### `RecurringEditScope`

```ts
type RecurringEditScope = 'occurrence' | 'following' | 'series';
```

### `RecurringEditTarget`

```ts
interface RecurringEditTarget {
    seriesId: string;
    recurrenceId: number;
}
```

### `RescheduleFromActualsFields`

```ts
interface RescheduleFromActualsFields {
    ok: boolean;
    statusDate: number;
    schedule: ScheduleResult;
    plan: ScheduleResult;
    tasks: readonly ActualsTask[];
    diagnostics: readonly (ActualsDiagnostic | PlanningDiagnostic)[];
}
```

### `RescheduleFromActualsResult`

```ts
type RescheduleFromActualsResult = RescheduleFromActualsFields & {
    ok: true;
    schedule: ScheduleSuccess;
} | RescheduleFromActualsFields & {
    ok: false;
    schedule: ScheduleFailure;
};
```

### `ResolvedEntityRefs`

```ts
interface ResolvedEntityRefs {
    entities: EntityRef[];
    unknown: ViewTarget[];
}
```

### `ResolvedLoadTargets`

```ts
interface ResolvedLoadTargets<S extends LoadSegmentLike = LoadSegmentLike> {
    segments: S[];
    unknown: LoadViewTarget[];
}
```

### `ResolvedViewTargets`

```ts
interface ResolvedViewTargets {
    targets: ViewTarget[];
    unknown: EntityRef[];
}
```

### `ResourceAssignment`

```ts
interface ResourceAssignment {
    resourceId: string;
    taskId: string;
    units?: number;
    workOffset?: number;
    workDuration?: number;
}
```

### `ResourceAssignmentProposal`

```ts
type ResourceAssignmentProposal = {
    ok: true;
    assignments: ResourceAssignment[];
    added: readonly ResourceAssignment[];
    removed: readonly ResourceAssignment[];
} | {
    ok: false;
    code: 'already-assigned' | 'not-assigned';
    reason: string;
};
```

### `ResourceAssignmentReplacement`

```ts
interface ResourceAssignmentReplacement {
    taskId: string;
    fromResourceId: string;
    toResourceId: string;
}
```

### `ResourceAssignmentRequest`

```ts
type ResourceAssignmentRequest = {
    kind: 'add';
    taskId: string;
    resourceId: string;
    units?: number;
} | {
    kind: 'remove';
    taskId: string;
    resourceId: string;
} | {
    kind: 'replace';
    taskId: string;
    fromResourceId: string;
    toResourceId: string;
};
```

### `ResourceAssignmentState`

```ts
interface ResourceAssignmentState {
    assignments: readonly ResourceAssignment[];
    resourceIds?: readonly string[];
    taskIds?: readonly string[];
}
```

### `ResourceBarOrigin`

```ts
interface ResourceBarOrigin {
    taskId: string;
    resourceId: string;
}
```

### `ResourceCapacity`

```ts
interface ResourceCapacity {
    id: string;
    capacity: number;
    periods?: readonly TimeRange[];
    capacityPeriods?: readonly ResourceCapacityPeriod[];
}
```

### `ResourceCapacityPeriod`

```ts
interface ResourceCapacityPeriod extends TimeRange {
    capacity: number;
}
```

### `ResourceDelay`

```ts
interface ResourceDelay {
    taskId: string;
    before: TimeRange;
    after: TimeRange;
    delay: number;
    cause: 'capacity' | 'predecessor';
    pauses: readonly TimeRange[];
}
```

### `ResourceLoadHistogram`

```ts
interface ResourceLoadHistogram {
    segments: TimelineLoadSegment[];
    peak: number;
}
```

### `ResourceLoadOptions`

```ts
interface ResourceLoadOptions {
    inactiveTaskIds?: Iterable<string>;
}
```

### `ResourceLoadSegment`

```ts
interface ResourceLoadSegment extends TimeRange {
    resourceId: string;
    load: number;
    capacity: number;
    overload: number;
    taskIds: readonly string[];
}
```

### `ResourceTimelineEditResolution`

```ts
interface ResourceTimelineEditResolution {
    ok: true;
    scheduleChange?: ResourceTimelineScheduleChange;
    assignmentReplacement?: ResourceAssignmentReplacement;
}
```

### `ResourceTimelineEditsResolution`

```ts
interface ResourceTimelineEditsResolution {
    ok: true;
    scheduleChanges: readonly ResourceTimelineScheduleChange[];
    assignmentReplacements: readonly ResourceAssignmentReplacement[];
}
```

### `ResourceTimelineInput`

```ts
interface ResourceTimelineInput<D = unknown, R = unknown> {
    resources: readonly ResourceTimelineResource<R>[];
    tasks: readonly ResourceTimelineTask<D>[];
    assignments: readonly ResourceAssignment[];
    dependencies?: readonly TimelineDependency[];
    unplannedTaskIds?: readonly string[];
}
```

### `ResourceTimelineOptions`

```ts
interface ResourceTimelineOptions<D = unknown, R = unknown> {
    barLabel?: (task: ResourceTimelineTask<D>, resource: ResourceTimelineResource<R>) => string;
    preferredBarIds?: readonly string[];
}
```

### `ResourceTimelineProjection`

```ts
interface ResourceTimelineProjection<D = unknown, R = unknown> {
    rows: readonly TimelineRow<R>[];
    bars: readonly TimelineBar<D>[];
    dependencies: readonly TimelineDependency[];
    laneCount: number;
    origins: ReadonlyMap<string, ResourceBarOrigin>;
    taskBarIds: ReadonlyMap<string, readonly string[]>;
    dependencyOrigins: ReadonlyMap<string, string>;
    omittedDependencyIds: readonly string[];
    hiddenDependencyIds: readonly string[];
    unplannedTaskIds: readonly string[];
}
```

### `ResourceTimelineRejection`

```ts
interface ResourceTimelineRejection {
    ok: false;
    code: ResourceTimelineRejectionCode;
    reason: string;
    barIds: readonly string[];
}
```

### `ResourceTimelineRejectionCode`

```ts
type ResourceTimelineRejectionCode = 'stale' | 'already-assigned' | 'conflicting-schedule' | 'conflicting-assignment';
```

### `ResourceTimelineResource`

```ts
interface ResourceTimelineResource<D = unknown> {
    id: string;
    label: string;
    detail?: string;
    data?: D;
}
```

### `ResourceTimelineScheduleChange`

```ts
interface ResourceTimelineScheduleChange {
    taskId: string;
    before: TimeRange;
    after: TimeRange;
    mode: EditMode;
    source: TimelineEdit['source'];
}
```

### `ResourceTimelineTask`

```ts
type ResourceTimelineTask<D = unknown> = Omit<TimelineBar<D>, 'rowId' | 'lane'>;
```

### `RestoreWeaveSnapshotResult`

```ts
type RestoreWeaveSnapshotResult = {
    ok: true;
    snapshot: RestoredWeaveSnapshot;
    diagnostics: readonly SnapshotDiagnostic[];
} | {
    ok: false;
    diagnostics: readonly SnapshotDiagnostic[];
};
```

### `RestoredColumn`

```ts
interface RestoredColumn {
    id: string;
    visible: boolean;
    width: number;
    column?: TimelineColumn;
    editor?: unknown;
    renderer?: unknown;
}
```

### `RestoredGraphSnapshot`

```ts
interface RestoredGraphSnapshot extends RestoredBase {
    kind: 'graph';
    nodes: NetworkNode[];
    edges: GraphEdge[];
    groups: NetworkGroup[];
    positions: Map<string, GraphPoint>;
    sizes: Map<string, GraphNodeSize>;
    view?: RestoredGraphView;
}
```

### `RestoredGraphView`

```ts
interface RestoredGraphView {
    camera?: GraphCameraTarget;
    collapsedGroupIds: Set<string>;
    layout?: {
        id: string;
        options?: {
            readonly [key: string]: JsonValue;
        };
        fn: GraphLayoutFunction;
    };
}
```

### `RestoredPlanningSnapshot`

```ts
interface RestoredPlanningSnapshot extends RestoredBase {
    kind: 'planning';
    input: LevelResourcesInput;
    placements: PlanningPlacement[];
    display: PlanningTaskDisplay[];
    schedule: ScheduleResult;
    view?: RestoredTimelineView;
}
```

### `RestoredSortRule`

```ts
interface RestoredSortRule {
    columnId: string;
    direction: 'asc' | 'desc';
    comparator?: (a: unknown, b: unknown) => number;
}
```

### `RestoredTimelineSnapshot`

```ts
interface RestoredTimelineSnapshot extends RestoredBase {
    kind: 'timeline';
    rows: TimelineRow[];
    bars: TimelineBar[];
    dependencies: TimelineDependency[];
    range?: TimeRange;
    timeUnit?: {
        id: string;
        origin?: number;
    };
    view?: RestoredTimelineView;
}
```

### `RestoredTimelineView`

```ts
interface RestoredTimelineView {
    window?: TimeRange;
    scroll?: {
        time?: number;
        rowId?: string;
    };
    zoom?: {
        zoom: number;
        preset?: string;
    };
    columns?: RestoredColumn[];
    search?: {
        query: string;
        columnIds?: string[];
    };
    sort: RestoredSortRule[];
    collapsedRowIds: Set<string>;
}
```

### `RestoredWeaveSnapshot`

```ts
type RestoredWeaveSnapshot = RestoredGraphSnapshot | RestoredTimelineSnapshot | RestoredPlanningSnapshot;
```

### `RevealLinkedTargetOptions`

```ts
interface RevealLinkedTargetOptions {
    reveal: () => Promise<RevealResult> | RevealResult | undefined;
    expand?: (proxyId: string, result: RevealResult) => boolean | Promise<boolean>;
    maxExpansions?: number;
}
```

### `RevealOptions`

```ts
interface RevealOptions {
    focus?: boolean;
    scale?: number;
}
```

### `RevealResult`

```ts
interface RevealResult {
    status: RevealStatus;
    proxyId?: string;
}
```

### `RevealStatus`

```ts
type RevealStatus = 'revealed' | 'hidden-by-collapse' | 'unknown';
```

### `RowMoveValidator`

```ts
type RowMoveValidator = (change: TimelineRowMove) => boolean | string | void;
```

### `SaveResult`

```ts
type SaveResult<S> = {
    status: 'accepted';
    operationId: string;
    version: string;
    state: S;
} | {
    status: 'rejected';
    operationId: string;
    code: string;
} | {
    status: 'conflict';
    operationId: string;
    currentVersion: string;
} | {
    status: 'uncertain';
    operationId: string;
};
```

### `ScheduleChange`

```ts
interface ScheduleChange {
    id: string;
    before: TimeRange;
    after: TimeRange;
}
```

### `ScheduleConstraintName`

```ts
type ScheduleConstraintName = 'range' | 'startNoEarlierThan' | 'startNoLaterThan' | 'finishNoEarlierThan' | 'finishNoLaterThan' | 'fixedStart' | 'deadline' | 'projectFinish' | 'calendar';
```

### `ScheduleCycle`

```ts
interface ScheduleCycle {
    taskIds: readonly string[];
    dependencyIds: readonly string[];
}
```

### `ScheduleEdit`

```ts
interface ScheduleEdit {
    id: string;
    start: number;
    end?: number;
}
```

### `ScheduleFailure`

```ts
type ScheduleFailure = {
    ok: false;
    code: 'cycle';
    cycles: readonly ScheduleCycle[];
} | {
    ok: false;
    code: 'infeasible';
    taskId: string;
    constraints: readonly ScheduleConstraintName[];
    dependencyIds: readonly string[];
};
```

### `ScheduleGraph`

```ts
interface ScheduleGraph {
    nodes: NetworkNode<ScheduleGraphNodeData>[];
    edges: GraphEdge<ScheduleGraphEdgeData>[];
    criticalNodeIds: Set<string>;
    criticalEdgeIds: Set<string>;
}
```

### `ScheduleGraphEdgeData`

```ts
interface ScheduleGraphEdgeData {
    type: NonNullable<TimelineDependency['type']>;
    critical: boolean;
    lag?: number;
}
```

### `ScheduleGraphNodeData`

```ts
interface ScheduleGraphNodeData {
    task: ScheduledTask;
    earlyStart: number;
    earlyFinish: number;
    critical: boolean;
}
```

### `ScheduleGraphOptions`

```ts
interface ScheduleGraphOptions {
    label?: (taskId: string) => string;
    formatTime?: (time: number) => string;
    formatDuration?: (duration: number) => string;
    formatLag?: (lag: number) => string;
    labels?: {
        earlyStart?: string;
        earlyFinish?: string;
        float?: string;
    };
    criticalTone?: ChartTone;
    tone?: ChartTone;
}
```

### `ScheduleInput`

```ts
interface ScheduleInput {
    range: TimeRange;
    quantum?: number;
    calendars?: readonly WorkCalendar[];
    defaultCalendarId?: string;
    tasks: readonly ScheduleTask[];
    dependencies?: readonly ScheduleLink[];
    deadline?: number;
}
```

### `ScheduleLink`

```ts
interface ScheduleLink extends TimelineDependency {
    lag?: number;
}
```

### `ScheduleManualConflict`

```ts
interface ScheduleManualConflict {
    taskId: string;
    dependencyId: string;
}
```

### `ScheduleOptions`

```ts
interface ScheduleOptions {
    explain?: boolean;
}
```

### `ScheduleReason`

```ts
interface ScheduleReason {
    id: string;
    taskId: string;
    phase: ScheduleReasonPhase;
    kind: ScheduleReasonKind;
    bound: ScheduleReasonBound;
    candidateTime?: number;
    placedTime?: number;
    dependencyId?: string;
    constraint?: ScheduleConstraintName;
    calendarId?: string;
    resourceId?: string;
    demand?: number;
    capacity?: number;
    relatedTaskIds?: readonly string[];
    range?: TimeRange;
    parentReasonIds: readonly string[];
}
```

### `ScheduleReasonBound`

```ts
type ScheduleReasonBound = 'startLower' | 'endLower' | 'startUpper' | 'endUpper';
```

### `ScheduleReasonKind`

```ts
type ScheduleReasonKind = 'dependency' | 'constraint' | 'calendar' | 'pause' | 'capacity' | 'project-bound' | 'manual';
```

### `ScheduleReasonPhase`

```ts
type ScheduleReasonPhase = 'earliest' | 'latest' | 'placement' | 'leveling';
```

### `ScheduleResult`

```ts
type ScheduleResult = ScheduleSuccess | ScheduleFailure;
```

### `ScheduleSuccess`

```ts
interface ScheduleSuccess {
    ok: true;
    finish: number;
    tasks: readonly ScheduledTask[];
    criticalDependencyIds: readonly string[];
    manualConflicts?: readonly ScheduleManualConflict[];
    inactiveTaskIds?: readonly string[];
}
```

### `ScheduleTask`

```ts
interface ScheduleTask {
    id: string;
    parentId?: string;
    duration: number;
    calendarId?: string;
    startNoEarlierThan?: number;
    startNoLaterThan?: number;
    finishNoEarlierThan?: number;
    finishNoLaterThan?: number;
    fixedStart?: number;
    mode?: 'asap' | 'alap';
    pauses?: readonly TimeRange[];
    splittable?: boolean;
    priority?: number;
    manual?: TimeRange;
    inactive?: boolean;
}
```

### `ScheduleTrace`

```ts
interface ScheduleTrace {
    reasons: readonly ScheduleReason[];
    taskReasonIds: ReadonlyMap<string, readonly string[]>;
}
```

### `ScheduledBarFields`

```ts
interface ScheduledBarFields extends TimeRange {
    critical: boolean;
    latestEnd: number;
    segments?: TimeRange[];
}
```

### `ScheduledTask`

```ts
interface ScheduledTask extends TimeRange {
    id: string;
    work: readonly TimeRange[];
    latestStart: number;
    latestEnd: number;
    totalFloat: number;
    workFloat: number;
    critical: boolean;
    earliestStart?: number;
    earliestEnd?: number;
    manual?: true;
    summary?: true;
    parentId?: string;
}
```

### `SerializeWeaveSnapshotOptions`

```ts
interface SerializeWeaveSnapshotOptions {
    codecs?: readonly SnapshotCodec[];
    libraryVersion?: string;
    space?: number | string;
}
```

### `SettleResult`

```ts
interface SettleResult<S> {
    state: TransactionCoreState<S>;
    outcome: TransactionOutcome<S>;
    committed: PendingTransaction | undefined;
}
```

### `ShortestGraphPathOptions`

```ts
interface ShortestGraphPathOptions {
    directed?: boolean;
    weight?: (edge: GraphEdge) => number;
}
```

### `SnapshotCodec`

```ts
interface SnapshotCodec<T = any> {
    id: string;
    version?: number;
    matches?: (value: unknown) => boolean;
    encode?: (value: T) => JsonValue;
    decode?: (value: JsonValue, version: number) => T;
}
```

### `SnapshotColumnDefinition`

```ts
type SnapshotColumnDefinition = Omit<TimelineColumn, 'id' | 'width'> & {
    width?: number;
};
```

### `SnapshotColumnState`

```ts
interface SnapshotColumnState {
    id: string;
    registryId?: string;
    visible?: boolean;
    width?: number;
    editorId?: string;
    rendererId?: string;
}
```

### `SnapshotDiagnostic`

```ts
interface SnapshotDiagnostic {
    severity: SnapshotDiagnosticSeverity;
    code: SnapshotDiagnosticCode;
    path: string;
    message: string;
}
```

### `SnapshotDiagnosticCode`

```ts
type SnapshotDiagnosticCode = 'syntax' | 'version' | 'migration' | 'structure' | 'reference' | 'duplicate' | 'number' | 'json' | 'codec' | 'registry' | 'schedule-cycle' | 'schedule-infeasible';
```

### `SnapshotDiagnosticSeverity`

```ts
type SnapshotDiagnosticSeverity = 'error' | 'warning';
```

### `SnapshotKind`

```ts
type SnapshotKind = 'graph' | 'timeline' | 'planning';
```

### `SnapshotLayoutFactory`

```ts
type SnapshotLayoutFactory = (options: {
    readonly [key: string]: JsonValue;
} | undefined) => GraphLayoutFunction;
```

### `SnapshotMetadata`

```ts
interface SnapshotMetadata {
    title?: string;
    savedAt?: string;
    sourceVersion?: string;
}
```

### `SnapshotMigration`

```ts
type SnapshotMigration = (document: {
    readonly [key: string]: JsonValue;
}) => unknown;
```

### `SnapshotSortRule`

```ts
interface SnapshotSortRule {
    columnId: string;
    direction: 'asc' | 'desc';
    comparatorId?: string;
}
```

### `SplitDanglingLinks`

```ts
interface SplitDanglingLinks<L> {
    resolved: L[];
    dangling: DanglingLink<L>[];
}
```

### `SplitDanglingLinksOptions`

```ts
interface SplitDanglingLinksOptions<L> {
    from?: (link: L) => string;
    to?: (link: L) => string;
}
```

### `StructureChange`

```ts
interface StructureChange {
    key: string;
    fields: readonly StructureFieldChange[];
}
```

### `StructureDiff`

```ts
interface StructureDiff {
    added: readonly string[];
    removed: readonly string[];
    changed: readonly StructureChange[];
    moved: readonly StructureMove[];
}
```

### `StructureDiffOptions`

```ts
interface StructureDiffOptions<T> {
    key: StructureKeyAccessor<T, string>;
    fields?: readonly (keyof T & string)[] | ((item: T) => Readonly<Record<string, unknown>>);
    parentKey?: StructureKeyAccessor<T, string | null | undefined>;
    equals?: (before: unknown, after: unknown, field: string) => boolean;
}
```

### `StructureFieldChange`

```ts
interface StructureFieldChange {
    name: string;
    before: unknown;
    after: unknown;
}
```

### `StructureKeyAccessor`

```ts
type StructureKeyAccessor<T, K> = (keyof T & string) | ((item: T) => K);
```

### `StructureMove`

```ts
interface StructureMove {
    key: string;
    beforeParent?: string;
    afterParent?: string;
}
```

### `SvgExportOptions`

```ts
interface SvgExportOptions {
    theme?: SvgExportThemeInput;
    fontFamily?: string;
    title?: string;
    background?: boolean;
    idPrefix?: string;
    direction?: 'ltr' | 'rtl';
}
```

### `SvgExportTheme`

```ts
interface SvgExportTheme {
    surface: string;
    surfaceMuted: string;
    text: string;
    muted: string;
    border: string;
    grid: string;
    edge: string;
    accent: string;
    onSolid: string;
    markerInk: string;
    baseline: string;
    baseline2?: string;
    baseline3?: string;
    marker: string;
    now: string;
    load: string;
    loadOverload: string;
    loadCapacity: string;
    dependencyHighlight: string;
    nonWorking?: string;
    critical?: string;
    float?: string;
    deadline?: string;
    status?: string;
    constraint?: string;
    constraintViolated?: string;
    range?: string;
    rangeInk?: string;
    rangeLine?: string;
    tones: Record<ChartTone, SvgToneColors>;
}
```

### `SvgExportThemeInput`

```ts
type SvgExportThemeInput = Partial<Omit<SvgExportTheme, 'tones'>> & {
    tones?: Partial<Record<ChartTone, Partial<SvgToneColors>>>;
};
```

### `SvgToneColors`

```ts
interface SvgToneColors {
    ink: string;
    line: string;
    pale: string;
    solid: string;
}
```

### `TaskActuals`

```ts
interface TaskActuals {
    intervals: readonly TimeRange[];
    remainingWork?: number;
    finished?: boolean;
}
```

### `TaskBoard`

```ts
const TaskBoard: TaskBoardComponent;
```

### `TaskBoardBackgroundClick`

```ts
interface TaskBoardBackgroundClick {
    columnId?: string;
    laneId?: string;
}
```

### `TaskBoardCard`

```ts
interface TaskBoardCard<D = unknown> {
    id: string;
    columnId: string;
    laneId?: string;
    label: string;
    detail?: string;
    tone?: ChartTone;
    draggable?: boolean;
    data?: D;
}
```

### `TaskBoardCardMove`

```ts
interface TaskBoardCardMove {
    id: string;
    before: TaskBoardPosition;
    after: TaskBoardPosition;
    source: 'pointer' | 'keyboard';
}
```

### `TaskBoardCardMoveValidator`

```ts
type TaskBoardCardMoveValidator = (change: TaskBoardCardMove) => boolean | string | void;
```

### `TaskBoardCell`

```ts
interface TaskBoardCell<C extends TaskBoardCard = TaskBoardCard> {
    columnId: string;
    laneId?: string;
    cards: C[];
    indices: number[];
    total: number;
}
```

### `TaskBoardColumn`

```ts
interface TaskBoardColumn {
    id: string;
    label: string;
    detail?: string;
    wipLimit?: number;
    wipMin?: number;
}
```

### `TaskBoardColumnStatus`

```ts
interface TaskBoardColumnStatus {
    id: string;
    count: number;
    total: number;
    wipLimit?: number;
    wipMin?: number;
    atLimit: boolean;
    overLimit: boolean;
    underMinimum: boolean;
}
```

### `TaskBoardComponent`

```ts
type TaskBoardComponent = (new <C extends TaskBoardCard = TaskBoardCard>(props: {
    columns: readonly TaskBoardColumn[];
    cards: readonly C[];
} & Record<string, unknown>) => SfcInstance<TaskBoardSfc<C & TaskBoardCard>>) & SfcDefaultComponent<TaskBoardSfc<TaskBoardCard>>;
```

### `TaskBoardExportOptions`

```ts
interface TaskBoardExportOptions<C extends TaskBoardCard = TaskBoardCard> {
    background?: boolean;
    title?: string;
    theme?: SvgExportThemeInput;
    includeSelection?: boolean;
    columnWidth?: number;
    cardLabel?: (card: C) => string;
    cardDetail?: (card: C) => string | undefined;
}
```

### `TaskBoardExposed`

```ts
type TaskBoardExposed<C extends TaskBoardCard = TaskBoardCard> = SfcExposed<TaskBoardSfc<C>>;
```

### `TaskBoardGroups`

```ts
interface TaskBoardGroups<C extends TaskBoardCard = TaskBoardCard> {
    rows: {
        laneId?: string;
        cells: TaskBoardCell<C>[];
    }[];
    columns: TaskBoardColumnStatus[];
    positions: Map<string, TaskBoardPosition>;
}
```

### `TaskBoardLabels`

```ts
interface TaskBoardLabels {
    region: string;
    empty: string;
    emptyCell: string;
    card: string;
    cards: string;
    wipLimit: string;
    overLimit: string;
    wipMin: string;
    underMinimum: string;
    collapse: string;
    expand: string;
    moveHint: string;
    moveRejected: string;
    pickedUp: string;
    moved: string;
    moveCancelled: string;
    position: string;
    of: string;
    lane: string;
}
```

### `TaskBoardLane`

```ts
interface TaskBoardLane {
    id: string;
    label: string;
    detail?: string;
}
```

### `TaskBoardMoveCancel`

```ts
interface TaskBoardMoveCancel {
    id: string;
    before: TaskBoardPosition;
    reason: TaskBoardMoveCancelReason;
    source: 'pointer' | 'keyboard';
}
```

### `TaskBoardMoveCancelReason`

```ts
type TaskBoardMoveCancelReason = 'escape' | 'pointer-cancel' | 'no-target' | 'blur' | 'data-change' | 'api';
```

### `TaskBoardPngExportOptions`

```ts
interface TaskBoardPngExportOptions<C extends TaskBoardCard = TaskBoardCard> extends TaskBoardExportOptions<C>, PngExportOptions {
}
```

### `TaskBoardPosition`

```ts
interface TaskBoardPosition {
    columnId: string;
    laneId?: string;
    index: number;
}
```

### `TaskBoardSvgLabels`

```ts
type TaskBoardSvgLabels = Pick<TaskBoardLabels, 'empty' | 'emptyCell' | 'of' | 'overLimit' | 'underMinimum'>;
```

### `TaskBoardSvgOptions`

```ts
interface TaskBoardSvgOptions<C extends TaskBoardCard = TaskBoardCard> extends SvgExportOptions {
    lanes?: readonly TaskBoardLane[];
    filter?: (card: C) => boolean;
    collapsedColumnIds?: Iterable<string>;
    collapsedLaneIds?: Iterable<string>;
    selectedId?: string;
    labels?: Partial<TaskBoardSvgLabels>;
    columnWidth?: number;
    collapsedColumnWidth?: number;
    padding?: number;
    cardLabel?: (card: C) => string;
    cardDetail?: (card: C) => string | undefined;
    wipWarningColor?: string;
    wipUnderColor?: string;
}
```

### `TaskViewBindingsInput`

```ts
interface TaskViewBindingsInput {
    tasks: readonly {
        id: string;
        work?: readonly TimeRange[];
    }[];
    assignments?: readonly Pick<ResourceAssignment, 'taskId' | 'resourceId' | 'workOffset' | 'workDuration'>[];
    dependencies?: readonly {
        id: string;
    }[];
    inactiveTaskIds?: Iterable<string>;
    taskKind?: string;
    dependencyKind?: string;
}
```

### `TimeBucket`

```ts
interface TimeBucket extends TimeRange {
    id: string;
}
```

### `TimeBucketAggregateOptions`

```ts
interface TimeBucketAggregateOptions<T = TimeBucketItem> {
    rule?: TimeBucketRule<T>;
    rules?: ReadonlyMap<string, TimeBucketRule<T>> | Readonly<Record<string, TimeBucketRule<T>>>;
    rowIds?: readonly string[];
    loaded?: TimeBucketLoaded;
    placement?: TimeBucketPlacement;
    carryForward?: boolean | ((rowId: string) => boolean);
    itemRow?: (item: T) => string;
    itemTime?: (item: T) => number | TimeRange;
    itemValue?: (item: T) => number;
    itemDenominator?: (item: T) => number;
    maxCells?: number;
}
```

### `TimeBucketCell`

```ts
interface TimeBucketCell {
    rowId: string;
    columnId: string;
    value: number | null;
    status: WindowedCellStatus;
    count: number;
    numerator?: number;
    denominator?: number;
    carried?: boolean;
}
```

### `TimeBucketColumn`

```ts
interface TimeBucketColumn extends TimeBucket {
    label: string;
    width: number;
}
```

### `TimeBucketColumnOptions`

```ts
interface TimeBucketColumnOptions<P extends TimeBucketPeriod = TimeBucketPeriod> {
    id?: (period: P, index: number) => string;
    idPrefix?: string;
    label?: (period: P, index: number) => string;
    width?: number | ((period: P, index: number) => number);
}
```

### `TimeBucketItem`

```ts
interface TimeBucketItem {
    rowId: string;
    time?: number;
    start?: number;
    end?: number;
    value: number;
    denominator?: number;
}
```

### `TimeBucketLoaded`

```ts
type TimeBucketLoaded = readonly TimeRange[] | ((rowId: string, bucket: TimeBucket) => boolean | WindowedCellStatus);
```

### `TimeBucketPeriod`

```ts
interface TimeBucketPeriod extends TimeRange {
    id?: string;
    label?: string;
}
```

### `TimeBucketPlacement`

```ts
type TimeBucketPlacement = 'start' | 'overlap' | 'prorate';
```

### `TimeBucketReducer`

```ts
type TimeBucketReducer<T> = (values: readonly number[], context: TimeBucketReducerContext<T>) => number | null;
```

### `TimeBucketReducerContext`

```ts
interface TimeBucketReducerContext<T> {
    rowId: string;
    bucket: TimeBucket;
    items: readonly T[];
}
```

### `TimeBucketRule`

```ts
type TimeBucketRule<T = TimeBucketItem> = TimeBucketRuleName | TimeBucketReducer<T>;
```

### `TimeBucketRuleName`

```ts
type TimeBucketRuleName = 'sum' | 'count' | 'min' | 'max' | 'first' | 'last' | 'ratio' | 'precomputed';
```

### `TimeRange`

```ts
interface TimeRange {
    start: number;
    end: number;
}
```

### `TimeRangeTargets`

```ts
interface TimeRangeTargets {
    activeBarIds: string[];
    activeEntities: EntityRef[];
    activeTargets: ViewTarget[];
    relatedEntities: EntityRef[];
    relatedTargets: ViewTarget[];
    unknownBarIds: string[];
}
```

### `TimeRangeTargetsOptions`

```ts
interface TimeRangeTargetsOptions {
    graph?: {
        nodes: readonly {
            id: string;
        }[];
        edges: readonly GraphEdge[];
    };
    traversal?: GraphTraversalOptions;
}
```

### `TimeScale`

```ts
interface TimeScale {
    width: number;
    toX(time: number): number;
    toTime(x: number): number;
}
```

### `TimelineBackgroundClick`

```ts
interface TimelineBackgroundClick {
    time: number;
    rowId?: string;
}
```

### `TimelineBand`

```ts
interface TimelineBand extends TimeRange {
    label: string;
}
```

### `TimelineBar`

```ts
interface TimelineBar<D = unknown> extends TimeRange {
    id: string;
    rowId: string;
    label: string;
    lane?: number;
    tone?: ChartTone;
    appearance?: 'outline' | 'solid';
    editable?: boolean;
    progress?: number;
    baseline?: TimeRange;
    baselines?: readonly TimelineBaseline[];
    data?: D;
    critical?: boolean;
    latestEnd?: number;
    deadline?: number;
    description?: string;
    segments?: readonly TimeRange[];
    deletable?: boolean;
    constraints?: TimelineConstraints;
}
```

### `TimelineBarActivity`

```ts
type TimelineBarActivity = Pick<TimelineBar, 'id' | 'rowId' | 'start' | 'end' | 'segments'>;
```

### `TimelineBarEnd`

```ts
type TimelineBarEnd = 'start' | 'finish';
```

### `TimelineBarsInRangeOptions`

```ts
interface TimelineBarsInRangeOptions {
    rowIds?: Iterable<string>;
}
```

### `TimelineBaseline`

```ts
interface TimelineBaseline extends TimeRange {
    id: string;
}
```

### `TimelineBaselineVariance`

```ts
interface TimelineBaselineVariance {
    start: number;
    end: number;
    duration: number;
}
```

### `TimelineCascade`

```ts
type TimelineCascade = (change: TimelineEdit) => readonly TimelineEdit[];
```

### `TimelineCellEdit`

```ts
interface TimelineCellEdit {
    rowId: string;
    columnId: string;
    before: string | number;
    after: string;
}
```

### `TimelineColumn`

```ts
interface TimelineColumn<R extends TimelineRow = TimelineRow> {
    id: string;
    label: string;
    width: number;
    value: (row: R, summary?: TimelineSummary) => string | number;
    editable?: boolean | ((row: R) => boolean);
    field?: TimelineFieldSpec<R>;
}
```

### `TimelineColumnResize`

```ts
interface TimelineColumnResize {
    id: string;
    before: number;
    after: number;
    source: 'pointer' | 'keyboard';
}
```

### `TimelineConnection`

```ts
interface TimelineConnection {
    from: string;
    to: string;
    type: TimelineDependencyType;
    lag?: number;
}
```

### `TimelineConnectionValidator`

```ts
type TimelineConnectionValidator = (connection: TimelineConnection, replacingDependencyId?: string) => boolean | string | void;
```

### `TimelineConstraintEdit`

```ts
interface TimelineConstraintEdit {
    id: string;
    kind: TimelineConstraintKind;
    before: number | undefined;
    after: number | undefined;
    source: 'pointer' | 'keyboard';
}
```

### `TimelineConstraintKind`

```ts
type TimelineConstraintKind = keyof TimelineConstraints;
```

### `TimelineConstraints`

```ts
interface TimelineConstraints {
    startNoEarlierThan?: number;
    startNoLaterThan?: number;
    finishNoEarlierThan?: number;
    finishNoLaterThan?: number;
    fixedStart?: number;
}
```

### `TimelineContextMenu`

```ts
interface TimelineContextMenu {
    target: TimelineContextTarget;
    time?: number;
    rowId?: string;
    clientX: number;
    clientY: number;
    source: 'pointer' | 'keyboard';
}
```

### `TimelineContextTarget`

```ts
type TimelineContextTarget = {
    kind: 'bar';
    id: string;
} | {
    kind: 'dependency';
    id: string;
} | {
    kind: 'row';
    id: string;
} | {
    kind: 'chart';
};
```

### `TimelineCreate`

```ts
interface TimelineCreate {
    rowId: string;
    lane: number;
    start: number;
    end: number;
    source: 'pointer' | 'keyboard';
}
```

### `TimelineCsvColumn`

```ts
type TimelineCsvColumn = 'row' | 'wbs' | 'bar' | 'start' | 'end' | 'progress';
```

### `TimelineCsvImport`

```ts
interface TimelineCsvImport {
    rows: TimelineRow[];
    bars: TimelineBar[];
}
```

### `TimelineCsvImportOptions`

```ts
interface TimelineCsvImportOptions {
    parseTime: (text: string) => number;
    columns?: readonly (TimelineCsvColumn | undefined)[];
    headers?: Partial<Record<TimelineCsvColumn, string>>;
}
```

### `TimelineCsvOptions`

```ts
interface TimelineCsvOptions {
    formatTime?: (time: number) => string;
    columns?: readonly TimelineCsvColumn[];
    headers?: Partial<Record<TimelineCsvColumn, string>>;
}
```

### `TimelineDataOptions`

```ts
interface TimelineDataOptions {
    summaryDependencies?: boolean;
}
```

### `TimelineDependency`

```ts
interface TimelineDependency {
    id: string;
    from: string;
    to: string;
    type?: 'FS' | 'SS' | 'FF' | 'SF';
    lag?: number;
}
```

### `TimelineDependencyType`

```ts
type TimelineDependencyType = 'FS' | 'SS' | 'FF' | 'SF';
```

### `TimelineDrop`

```ts
interface TimelineDrop {
    time: number;
    rowId?: string;
    clientX: number;
    clientY: number;
    dataTransfer: DataTransfer | null;
}
```

### `TimelineEdit`

```ts
interface TimelineEdit {
    id: string;
    before: TimeRange;
    after: TimeRange;
    mode: EditMode;
    source: 'pointer' | 'keyboard';
    row?: {
        before: string;
        after: string;
    };
}
```

### `TimelineEditCancel`

```ts
interface TimelineEditCancel {
    reason: TimelineEditCancelReason;
    barIds: readonly string[];
    cell?: {
        rowId: string;
        columnId: string;
    };
}
```

### `TimelineEditCancelReason`

```ts
type TimelineEditCancelReason = 'escape' | 'source-changed' | 'api' | 'pointer-cancel' | 'hidden';
```

### `TimelineFieldEdit`

```ts
interface TimelineFieldEdit<R extends TimelineRow = TimelineRow> {
    rowId: R['id'];
    columnId: string;
    fieldId: string;
    before: FieldValue;
    after: FieldValue;
    source: 'pointer' | 'keyboard';
}
```

### `TimelineFieldKind`

```ts
type TimelineFieldKind = 'text' | 'number' | 'time' | 'duration' | 'select' | 'checkbox';
```

### `TimelineFieldSpec`

```ts
interface TimelineFieldSpec<R extends TimelineRow = TimelineRow> {
    id: string;
    kind: TimelineFieldKind;
    get: (row: R) => FieldValue;
    parse?: (text: string) => FieldValue | {
        error: string;
    };
    format?: (value: FieldValue) => string;
    required?: boolean;
    choices?: readonly FieldChoice[];
    multiple?: boolean;
    min?: number;
    max?: number;
    integer?: boolean;
    allowNegative?: boolean;
    timeZone?: string;
    utcOffsetMinutes?: number;
    durationBasis?: FieldDurationBasis;
    unitSize?: number;
    unitLabel?: string;
}
```

### `TimelineFitOptions`

```ts
interface TimelineFitOptions {
    padding?: number;
}
```

### `TimelineHiddenTarget`

```ts
interface TimelineHiddenTarget {
    barId: string;
    rowId: string;
    dependencyIds: string[];
    visibleBarIds: string[];
}
```

### `TimelineLoadRow`

```ts
interface TimelineLoadRow {
    id: string;
    label: string;
    detail?: string;
}
```

### `TimelineLoadSegment`

```ts
interface TimelineLoadSegment extends TimeRange {
    resourceId: string;
    load: number;
    capacity: number;
    overload?: number;
    taskIds?: readonly string[];
}
```

### `TimelineMarker`

```ts
interface TimelineMarker {
    id: string;
    time: number;
    label: string;
}
```

### `TimelineMarkerRange`

```ts
interface TimelineMarkerRange extends TimeRange {
    id: string;
    label: string;
    tone?: ChartTone;
    rowIds?: readonly string[];
}
```

### `TimelineProgressEdit`

```ts
interface TimelineProgressEdit {
    id: string;
    before: number | undefined;
    after: number;
    source: 'pointer' | 'keyboard';
}
```

### `TimelineReconnect`

```ts
interface TimelineReconnect {
    id: string;
    before: TimelineConnection;
    after: TimelineConnection;
}
```

### `TimelineRow`

```ts
interface TimelineRow<D = unknown> {
    id: string;
    parentId?: string;
    label: string;
    detail?: string;
    data?: D;
}
```

### `TimelineRowCompare`

```ts
type TimelineRowCompare<R extends TimelineRow = TimelineRow> = (a: R, b: R) => number;
```

### `TimelineRowMove`

```ts
interface TimelineRowMove {
    id: string;
    before: TimelineRowPosition;
    after: TimelineRowPosition;
    source: 'pointer' | 'keyboard';
}
```

### `TimelineRowPosition`

```ts
interface TimelineRowPosition {
    parentId?: string;
    index: number;
}
```

### `TimelineRowViewState`

```ts
type TimelineRowViewState = Pick<TimelineViewState, 'search' | 'sort' | 'filters' | 'collapsedIds'>;
```

### `TimelineRowsInput`

```ts
interface TimelineRowsInput<R extends TimelineRow = TimelineRow> {
    rows: readonly R[];
    columns?: readonly TimelineColumn<R>[];
    sortRules?: Readonly<Record<string, TimelineRowCompare<R>>>;
    bars?: readonly TimelineBar[];
}
```

### `TimelineRowsProjection`

```ts
interface TimelineRowsProjection<R extends TimelineRow = TimelineRow> {
    rows: R[];
    matchedRowIds: string[];
    wbs: Map<string, string>;
    collapsedIds: string[];
    diagnostics: TimelineViewDiagnostic[];
}
```

### `TimelineSelectDetail`

```ts
interface TimelineSelectDetail {
    dragged: boolean;
}
```

### `TimelineSheetAppliers`

```ts
interface TimelineSheetAppliers<R extends TimelineRow = TimelineRow> {
    field?: (row: R, edit: TimelineFieldEdit<R>) => R;
    cell?: (row: R, edit: TimelineCellEdit) => R;
}
```

### `TimelineSheetChanges`

```ts
interface TimelineSheetChanges<R extends TimelineRow = TimelineRow> {
    fieldEdits?: readonly TimelineFieldEdit<R>[];
    cellEdits?: readonly TimelineCellEdit[];
}
```

### `TimelineSheetEdit`

```ts
interface TimelineSheetEdit<R extends TimelineRow = TimelineRow> {
    action: 'paste' | 'fill' | 'clear';
    fieldEdits: TimelineFieldEdit<R>[];
    cellEdits: TimelineCellEdit[];
}
```

### `TimelineSnapshotData`

```ts
interface TimelineSnapshotData {
    rows: readonly TimelineRow[];
    bars: readonly TimelineBar[];
    dependencies?: readonly TimelineDependency[];
    range?: TimeRange;
    timeUnit?: {
        id: string;
        origin?: number;
    };
}
```

### `TimelineSnapshotInput`

```ts
interface TimelineSnapshotInput {
    kind: 'timeline';
    data: TimelineSnapshotData;
    view?: {
        timeline?: Omit<TimelineSnapshotView, 'collapsedRowIds'> & {
            collapsedRowIds?: ReadonlySet<string>;
        };
    };
    metadata?: SnapshotMetadata;
    extensions?: {
        readonly [namespace: string]: unknown;
    };
}
```

### `TimelineSnapshotV1`

```ts
interface TimelineSnapshotV1 extends SnapshotBase {
    kind: 'timeline';
    data: TimelineSnapshotData;
    view?: {
        timeline?: TimelineSnapshotView;
    };
}
```

### `TimelineSnapshotView`

```ts
interface TimelineSnapshotView {
    window?: TimeRange;
    scroll?: {
        time?: number;
        rowId?: string;
    };
    zoom?: {
        zoom: number;
        preset?: string;
    };
    columns?: readonly SnapshotColumnState[];
    search?: {
        query: string;
        columnIds?: readonly string[];
    };
    sort?: readonly SnapshotSortRule[];
    collapsedRowIds?: readonly string[];
}
```

### `TimelineSummary`

```ts
interface TimelineSummary extends TimeRange {
    count: number;
    progress?: number;
}
```

### `TimelineSvgOptions`

```ts
interface TimelineSvgOptions<R extends TimelineRow = TimelineRow, B extends TimelineBar = TimelineBar> extends SvgExportOptions {
    collapsedIds?: Iterable<string>;
    timeRange?: TimeRange;
    rowRange?: {
        start: number;
        end: number;
    };
    rowHeight?: number;
    laneCount?: number;
    labelWidth?: number;
    columns?: readonly TimelineColumn<R>[];
    showSummaries?: boolean;
    summaryDependencies?: boolean;
    headerBands?: readonly (readonly TimelineBand[])[];
    markers?: readonly TimelineMarker[];
    markerRanges?: readonly TimelineMarkerRange[];
    now?: number;
    tickStep?: number;
    tickSteps?: readonly number[];
    tickAnchor?: number;
    formatTime?: (time: number) => string;
    formatLag?: (lag: number) => string;
    baselineIds?: readonly string[];
    baselineLabel?: (id: string) => string;
    formatVariance?: (delta: number) => string;
    varianceLabels?: {
        start?: string;
        finish?: string;
        duration?: string;
    };
    rowHeading?: string;
    nowLabel?: string;
    loadRows?: readonly TimelineLoadRow[];
    loadSegments?: readonly TimelineLoadSegment[];
    loadRowHeight?: number;
    highlightedDependencyIds?: Iterable<string>;
    dependencyStyle?: DependencyPathStyle;
    highlightedBarIds?: Iterable<string>;
    nonWorkingPeriods?: readonly TimeRange[];
    statusDate?: number;
    statusDateLabel?: string;
    showProgressLine?: boolean;
    constraintLabels?: Partial<Record<TimelineConstraintKind, string>>;
    constraintViolatedLabel?: string;
    barLabel?: (bar: B) => string;
    rowLabel?: (row: R) => string;
}
```

### `TimelineViewColumn`

```ts
interface TimelineViewColumn {
    id: string;
    visible: boolean;
    width?: number;
}
```

### `TimelineViewDiagnostic`

```ts
interface TimelineViewDiagnostic {
    code: TimelineViewDiagnosticCode;
    id: string;
    message: string;
}
```

### `TimelineViewDiagnosticCode`

```ts
type TimelineViewDiagnosticCode = 'unknown-column' | 'new-column' | 'duplicate-column' | 'invalid-width' | 'unknown-sort-rule' | 'unknown-row';
```

### `TimelineViewFilter`

```ts
interface TimelineViewFilter {
    columnId: string;
    text?: string;
    values?: (string | number)[];
}
```

### `TimelineViewInput`

```ts
interface TimelineViewInput<R extends TimelineRow = TimelineRow, B extends TimelineBar = TimelineBar, D extends TimelineDependency = TimelineDependency> {
    rows: readonly R[];
    bars: readonly B[];
    dependencies?: readonly D[];
    columns?: readonly TimelineColumn<R>[];
    sortRules?: Readonly<Record<string, TimelineRowCompare<R>>>;
    laneCount?: number;
}
```

### `TimelineViewProjection`

```ts
interface TimelineViewProjection<R extends TimelineRow = TimelineRow, B extends TimelineBar = TimelineBar, D extends TimelineDependency = TimelineDependency> {
    rows: R[];
    bars: B[];
    dependencies: D[];
    matchedRowIds: string[];
    removedDependencyIds: string[];
    removedDependencyCount: number;
    hiddenTargets: TimelineHiddenTarget[];
    wbs: Map<string, string>;
    collapsedIds: string[];
    window?: TimeRange;
    zoom?: string;
    diagnostics: TimelineViewDiagnostic[];
}
```

### `TimelineViewSearch`

```ts
interface TimelineViewSearch {
    text: string;
    columnIds?: string[];
}
```

### `TimelineViewSort`

```ts
interface TimelineViewSort {
    ruleId: string;
    direction: 'asc' | 'desc';
}
```

### `TimelineViewState`

```ts
interface TimelineViewState {
    version: 1;
    columns: TimelineViewColumn[];
    search: TimelineViewSearch;
    sort: TimelineViewSort[];
    filters?: TimelineViewFilter[];
    collapsedIds: string[];
    window?: TimeRange;
    zoom?: string;
}
```

### `TimelineVisibleWindow`

```ts
interface TimelineVisibleWindow extends WindowedView {
    start: number;
    end: number;
    rowIds: string[];
    expandedIds: string[];
}
```

### `TimelineZoomPreset`

```ts
interface TimelineZoomPreset {
    id: string;
    label: string;
    pixelsPerUnit: number;
    tickSteps?: readonly number[];
    headerBands?: readonly (readonly TimelineBand[])[];
    snap?: number;
}
```

### `TimelineZoomState`

```ts
interface TimelineZoomState {
    zoom: number;
    preset?: string;
}
```

### `TopologicalOrderResult`

```ts
interface TopologicalOrderResult {
    order: string[];
    acyclic: boolean;
    blocked: string[];
}
```

### `TransactionAdapter`

```ts
interface TransactionAdapter<S, P> {
    validate(state: S, changes: readonly P[]): boolean | string | void;
    apply(state: S, changes: readonly P[]): S;
    save(request: EditTransaction<P, S>, candidate: S): Promise<SaveResult<S>>;
}
```

### `TransactionCoreState`

```ts
interface TransactionCoreState<S> {
    acceptedState: S;
    acceptedVersion: string;
    candidateState: S | undefined;
    status: TransactionStatus;
    pending: PendingTransaction | undefined;
    result: TransactionFailure | undefined;
    epoch: number;
    committed: readonly string[];
}
```

### `TransactionFailure`

```ts
type TransactionFailure = Exclude<SaveResult<unknown>, {
    status: 'accepted';
}>;
```

### `TransactionOutcome`

```ts
type TransactionOutcome<S> = SaveResult<S> | {
    status: 'busy';
} | {
    status: 'invalid';
    reason: string;
} | {
    status: 'discarded';
    operationId: string;
};
```

### `TransactionSource`

```ts
type TransactionSource = 'pointer' | 'keyboard' | 'api' | 'undo' | 'redo';
```

### `TransactionStatus`

```ts
type TransactionStatus = 'idle' | 'saving' | 'rejected' | 'conflict' | 'uncertain';
```

### `TreeGrid`

```ts
const TreeGrid: TreeGridComponent;
```

### `TreeGridActivation`

```ts
interface TreeGridActivation {
    rowId: string;
    columnId?: string;
    entities: readonly EntityRef[];
    source: 'pointer' | 'keyboard';
}
```

### `TreeGridCell`

```ts
interface TreeGridCell extends TreeGridCellContent {
    rowId: string;
    columnId: string;
}
```

### `TreeGridCellContent`

```ts
interface TreeGridCellContent {
    value?: TreeGridValue;
    status?: TreeGridCellStatus;
    label?: string;
    tone?: ChartTone;
    entities?: readonly EntityRef[];
    editable?: boolean;
}
```

### `TreeGridCellEdit`

```ts
interface TreeGridCellEdit {
    rowId: string;
    columnId: string;
    before: FieldValue;
    after: FieldValue;
    source: 'pointer' | 'keyboard';
}
```

### `TreeGridCellEditValidator`

```ts
type TreeGridCellEditValidator = (change: TreeGridCellEdit) => TreeGridValidatorResult;
```

### `TreeGridCellRef`

```ts
interface TreeGridCellRef {
    rowId: string;
    columnId: string;
}
```

### `TreeGridCellState`

```ts
type TreeGridCellState = 'value' | 'empty' | TreeGridCellStatus;
```

### `TreeGridCellStatus`

```ts
type TreeGridCellStatus = 'none' | 'unknown' | 'not-applicable' | 'unloaded' | 'loading' | 'failed';
```

### `TreeGridCellView`

```ts
interface TreeGridCellView {
    state: TreeGridCellState;
    value?: TreeGridValue;
    label?: string;
    tone?: ChartTone;
    entities: readonly EntityRef[];
    source: 'column' | 'cell' | 'missing';
    editable?: boolean;
}
```

### `TreeGridColumn`

```ts
interface TreeGridColumn<R extends TreeGridRow = TreeGridRow> {
    id: string;
    label: string;
    width: number;
    value?: (row: R) => TreeGridValue | TreeGridCellContent | null | undefined;
    missingCell?: TreeGridMissingCell;
    align?: 'start' | 'center' | 'end';
    editor?: TreeGridEditor;
    editable?: boolean | ((row: R) => boolean);
    update?: (row: R, value: FieldValue) => R;
}
```

### `TreeGridComponent`

```ts
type TreeGridComponent = (new <R extends TreeGridRow = TreeGridRow>(props: {
    rows: readonly R[];
    columns: readonly TreeGridColumn<R>[];
} & Record<string, unknown>) => SfcInstance<TreeGridSfc<R & TreeGridRow>>) & SfcDefaultComponent<TreeGridSfc<TreeGridRow>>;
```

### `TreeGridCursor`

```ts
interface TreeGridCursor {
    line: number;
    column: number;
}
```

### `TreeGridDrop`

```ts
interface TreeGridDrop {
    line: number;
    placement: 'before' | 'after' | 'inside';
    target: TimelineRowPosition;
}
```

### `TreeGridEditCancel`

```ts
interface TreeGridEditCancel {
    kind: 'cell' | 'fill' | 'row-move';
    reason: TreeGridEditCancelReason;
    rowId?: string;
    columnId?: string;
}
```

### `TreeGridEditCancelReason`

```ts
type TreeGridEditCancelReason = 'escape' | 'source-changed' | 'hidden' | 'blur' | 'pointer-cancel' | 'api';
```

### `TreeGridEditor`

```ts
type TreeGridEditor = Omit<TimelineFieldSpec, 'id' | 'get'>;
```

### `TreeGridEntityMatches`

```ts
interface TreeGridEntityMatches {
    rowIds: string[];
    cells: TreeGridCellRef[];
}
```

### `TreeGridExportOptions`

```ts
interface TreeGridExportOptions {
    background?: boolean;
    title?: string;
    theme?: SvgExportThemeInput;
    rowRange?: {
        start: number;
        end: number;
    };
    columnRange?: {
        start: number;
        end: number;
    };
    includeTreeColumn?: boolean;
    includeHighlight?: boolean;
}
```

### `TreeGridExposed`

```ts
type TreeGridExposed<R extends TreeGridRow = TreeGridRow> = SfcExposed<TreeGridSfc<R>>;
```

### `TreeGridIndex`

```ts
interface TreeGridIndex<R extends TreeGridRow = TreeGridRow> {
    readonly rows: readonly R[];
    readonly columns: readonly TreeGridColumn<R>[];
    readonly tree: readonly {
        row: R;
        depth: number;
        hasChildren: boolean;
        afterSubtree: number;
    }[];
    readonly rowById: ReadonlyMap<string, R>;
    readonly columnIndex: ReadonlyMap<string, number>;
    readonly cells: ReadonlyMap<string, ReadonlyMap<string, TreeGridCell>>;
    readonly childCounts: ReadonlyMap<string, number>;
    readonly rootCount: number;
    readonly missingCell: TreeGridMissingCell;
}
```

### `TreeGridInput`

```ts
interface TreeGridInput<R extends TreeGridRow = TreeGridRow> {
    rows: readonly R[];
    columns: readonly TreeGridColumn<R>[];
    cells?: readonly TreeGridCell[];
    missingCell?: TreeGridMissingCell;
}
```

### `TreeGridKeyAction`

```ts
type TreeGridKeyAction = {
    type: 'move';
    to: TreeGridCursor;
} | {
    type: 'expand';
    line: number;
} | {
    type: 'collapse';
    line: number;
} | {
    type: 'activate';
    at: TreeGridCursor;
};
```

### `TreeGridKeyContext`

```ts
interface TreeGridKeyContext {
    lines: readonly TreeGridLine<any>[];
    columnCount: number;
    pageSize: number;
    rtl?: boolean;
}
```

### `TreeGridKeyInput`

```ts
interface TreeGridKeyInput {
    key: string;
    ctrlKey?: boolean;
    metaKey?: boolean;
    shiftKey?: boolean;
    altKey?: boolean;
}
```

### `TreeGridLabels`

```ts
interface TreeGridLabels {
    grid: string;
    treeColumn: string;
    empty: string;
    keyboardHint: string;
    expand: string;
    collapse: string;
    none: string;
    unknown: string;
    notApplicable: string;
    unloaded: string;
    loading: string;
    failed: string;
    noneMark: string;
    unknownMark: string;
    notApplicableMark: string;
    unloadedMark: string;
    loadingMark: string;
    failedMark: string;
    yes: string;
    no: string;
    edit: string;
    for: string;
    editRejected: string;
    sheetRejected: string;
    pasteTooLarge: string;
    fillHandle: string;
    addBelow: string;
    addChild: string;
    deleteRow: string;
    moveRow: string;
    rowActions: string;
    moveBefore: string;
    moveAfter: string;
    moveInto: string;
    rowCreateRejected: string;
    rowDeleteRejected: string;
    rowMoveRejected: string;
    rowMoveHint: string;
    resizeColumn?: string;
    columnResizeRejected?: string;
    sortBy?: string;
    sortedAscending?: string;
    sortedDescending?: string;
    filterBy?: string;
    filtered?: string;
    filterContains?: string;
    filterValues?: string;
    clearFilter?: string;
}
```

### `TreeGridLine`

```ts
interface TreeGridLine<R extends TreeGridRow = TreeGridRow> {
    kind: 'row' | 'status';
    row: R;
    level: number;
    expandable: boolean;
    expanded: boolean;
    posinset: number;
    setsize: number;
    parent: number;
    status?: WindowedCellStatus;
}
```

### `TreeGridLines`

```ts
interface TreeGridLines<R extends TreeGridRow = TreeGridRow> {
    lines: readonly TreeGridLine<R>[];
    rowLine: ReadonlyMap<string, number>;
    statusLine: ReadonlyMap<string, number>;
}
```

### `TreeGridMissingCell`

```ts
type TreeGridMissingCell = 'empty' | 'none' | 'unknown' | 'not-applicable';
```

### `TreeGridPngExportOptions`

```ts
interface TreeGridPngExportOptions extends TreeGridExportOptions, PngExportOptions {
}
```

### `TreeGridPosition`

```ts
interface TreeGridPosition {
    rowId: string;
    columnId?: string;
    status?: boolean;
}
```

### `TreeGridRange`

```ts
interface TreeGridRange {
    anchor: TreeGridCursor;
    focus: TreeGridCursor;
}
```

### `TreeGridRow`

```ts
interface TreeGridRow<D = unknown> extends TimelineRow<D> {
    entities?: readonly EntityRef[];
    childStatus?: WindowedCellStatus;
}
```

### `TreeGridRowCreate`

```ts
interface TreeGridRowCreate {
    parentId?: string;
    index: number;
    referenceId: string;
    placement: 'before' | 'after' | 'child';
    source: 'pointer' | 'keyboard';
}
```

### `TreeGridRowCreateValidator`

```ts
type TreeGridRowCreateValidator = (change: TreeGridRowCreate) => TreeGridValidatorResult;
```

### `TreeGridRowDelete`

```ts
interface TreeGridRowDelete {
    ids: string[];
    includeDescendants: boolean;
    source: 'pointer' | 'keyboard';
}
```

### `TreeGridRowDeleteValidator`

```ts
type TreeGridRowDeleteValidator = (change: TreeGridRowDelete) => TreeGridValidatorResult;
```

### `TreeGridSheetBuild`

```ts
type TreeGridSheetBuild = {
    ok: true;
    edits: TreeGridCellEdit[];
} | {
    ok: false;
    reason: 'too-large' | 'invalid';
    error: string;
    cell?: TreeGridCellRef;
};
```

### `TreeGridSheetEdit`

```ts
interface TreeGridSheetEdit {
    action: 'paste' | 'fill' | 'clear' | 'cut';
    edits: TreeGridCellEdit[];
    source: 'pointer' | 'keyboard';
}
```

### `TreeGridSheetEditValidator`

```ts
type TreeGridSheetEditValidator = (change: TreeGridSheetEdit) => TreeGridValidatorResult;
```

### `TreeGridSpan`

```ts
interface TreeGridSpan {
    start: number;
    end: number;
}
```

### `TreeGridSvgOptions`

```ts
interface TreeGridSvgOptions<R extends TreeGridRow = TreeGridRow> extends SvgExportOptions {
    cells?: readonly TreeGridCell[];
    missingCell?: TreeGridMissingCell;
    expandedIds?: Iterable<string> | 'all';
    formatValue?: (value: TreeGridValue, context: {
        row: R;
        column: TreeGridColumn<R>;
    }) => string;
    labels?: Partial<TreeGridLabels>;
    rowHeight?: number;
    headerHeight?: number;
    treeColumnWidth?: number;
    indent?: number;
    sort?: readonly TimelineViewSort[];
    filters?: readonly TimelineViewFilter[];
    sortRules?: Readonly<Record<string, TimelineRowCompare<R>>>;
    applyView?: boolean;
    rowRange?: {
        start: number;
        end: number;
    };
    columnRange?: {
        start: number;
        end: number;
    };
    includeTreeColumn?: boolean;
    selectedRowIds?: Iterable<string>;
    highlightedRowIds?: Iterable<string>;
    highlightedCells?: readonly TreeGridCellRef[];
    highlightColor?: string;
    selectedColor?: string;
}
```

### `TreeGridTextOptions`

```ts
interface TreeGridTextOptions<R extends TreeGridRow = TreeGridRow> {
    formatValue?: (value: TreeGridValue, context: {
        row: R;
        column: TreeGridColumn<R>;
    }) => string;
    labels?: Partial<Pick<TreeGridLabels, 'yes' | 'no'>>;
}
```

### `TreeGridValidatorResult`

```ts
type TreeGridValidatorResult = boolean | string | void | undefined;
```

### `TreeGridValue`

```ts
type TreeGridValue = string | number | boolean;
```

### `TreeGridViewInput`

```ts
interface TreeGridViewInput<R extends TreeGridRow = TreeGridRow> extends TreeGridInput<R>, TreeGridTextOptions<R> {
    sortRules?: Readonly<Record<string, TimelineRowCompare<R>>>;
}
```

### `TreeGridViewProjection`

```ts
interface TreeGridViewProjection<R extends TreeGridRow = TreeGridRow> {
    rows: R[];
    cells: TreeGridCell[];
    matchedRowIds: string[];
    diagnostics: TimelineViewDiagnostic[];
}
```

### `TreeGridViewState`

```ts
interface TreeGridViewState {
    sort?: readonly TimelineViewSort[];
    filters?: readonly TimelineViewFilter[];
}
```

### `UseAsyncGraphLayoutOptions`

```ts
interface UseAsyncGraphLayoutOptions<N extends NetworkNode = NetworkNode, E extends GraphEdge = GraphEdge, G extends NetworkGroup = NetworkGroup> {
    input: MaybeRefOrGetter<GraphLayoutRequestInput<N, E, G>>;
    adapter: AsyncGraphLayoutAdapter<N, E, G>;
    initialLayout?: (nodes: readonly GraphShownNode<N, G>[], edges: readonly GraphShownEdge<E, G>[]) => GraphLayout;
    gesture?: MaybeRefOrGetter<boolean>;
    provisional?: boolean;
    cacheSize?: number;
}
```

### `UseEditTransactionOptions`

```ts
interface UseEditTransactionOptions<S, P> {
    documentId: string;
    initialState: S;
    initialVersion: string;
    adapter: TransactionAdapter<S, P>;
    createOperationId?: () => string;
    historyLimit?: number;
    onHistoryReset?: (reset: HistoryReset) => void;
}
```

### `UseLinkedSelectionOptions`

```ts
interface UseLinkedSelectionOptions {
    bindings: MaybeRefOrGetter<readonly ViewBinding[]>;
    onSelect?: (entities: readonly EntityRef[], owner: LinkedViewName | undefined) => void;
    timeRange?: MaybeRefOrGetter<LinkedTimeRange | undefined>;
}
```

### `UseWindowedDataOptions`

```ts
interface UseWindowedDataOptions<T, L = never> extends WindowedDataOptions<T, L> {
    view: MaybeRefOrGetter<WindowedView | undefined>;
    condition?: MaybeRefOrGetter<string>;
    load: WindowedDataLoader<T, L>;
    linkEnds?: SplitDanglingLinksOptions<L>;
}
```

### `ViewBinding`

```ts
interface ViewBinding {
    entity: EntityRef;
    target: ViewTarget;
}
```

### `ViewBindingIndex`

```ts
interface ViewBindingIndex {
    readonly entities: ReadonlyMap<string, {
        entity: EntityRef;
        targets: ViewTarget[];
    }>;
    readonly targets: ReadonlyMap<string, {
        target: ViewTarget;
        entities: EntityRef[];
    }>;
}
```

### `ViewTarget`

```ts
type ViewTarget = {
    view: 'graph';
    kind: 'node' | 'edge' | 'group';
    id: string;
} | {
    view: 'timeline';
    kind: 'bar' | 'dependency' | 'row';
    id: string;
} | {
    view: 'load';
    resourceId: string;
    start: number;
    end: number;
};
```

### `ViewTargetEvent`

```ts
interface ViewTargetEvent<T extends ViewTarget = ViewTarget> {
    target: T;
    source: ViewTargetSource;
}
```

### `ViewTargetSource`

```ts
type ViewTargetSource = 'pointer' | 'keyboard';
```

### `WeaveSnapshotError`

```ts
class WeaveSnapshotError extends Error {
    readonly diagnostics: readonly SnapshotDiagnostic[];
    constructor(diagnostics: readonly SnapshotDiagnostic[]);
}
```

### `WeaveSnapshotInput`

```ts
type WeaveSnapshotInput = GraphSnapshotInput | TimelineSnapshotInput | PlanningSnapshotInput;
```

### `WeaveSnapshotRegistry`

```ts
interface WeaveSnapshotRegistry {
    codecs?: readonly SnapshotCodec[];
    layouts?: Readonly<Record<string, SnapshotLayoutFactory>>;
    columns?: Readonly<Record<string, SnapshotColumnDefinition>>;
    editors?: Readonly<Record<string, unknown>>;
    renderers?: Readonly<Record<string, unknown>>;
    comparators?: Readonly<Record<string, (a: unknown, b: unknown) => number>>;
    onMissing?: 'fail' | 'fallback';
}
```

### `WeaveSnapshotV1`

```ts
type WeaveSnapshotV1 = GraphSnapshotV1 | TimelineSnapshotV1 | PlanningSnapshotV1;
```

### `WeeklyShift`

```ts
interface WeeklyShift extends WorkShift {
    weekday: number;
}
```

### `WindowedCell`

```ts
interface WindowedCell {
    status: WindowedCellStatus;
    requestId?: string;
    error?: unknown;
}
```

### `WindowedCellStatus`

```ts
type WindowedCellStatus = 'unloaded' | 'loading' | 'loaded-empty' | 'loaded' | 'failed';
```

### `WindowedCoverage`

```ts
interface WindowedCoverage {
    status: WindowedCellStatus;
    complete: boolean;
    total: number;
    unloaded: number;
    loading: number;
    empty: number;
    loaded: number;
    failed: number;
}
```

### `WindowedData`

```ts
interface WindowedData<T, L = never> {
    state: Readonly<ShallowRef<WindowedDataState<T, L>>>;
    items: ComputedRef<T[]>;
    links: ComputedRef<L[]>;
    resolvedLinks: ComputedRef<L[]>;
    danglingLinks: ComputedRef<DanglingLink<L>[]>;
    coverage: ComputedRef<WindowedCoverage>;
    status: ComputedRef<WindowedCellStatus>;
    complete: ComputedRef<boolean>;
    pending: ComputedRef<boolean>;
    error: ComputedRef<WindowedDataError | undefined>;
    coverageOf: (window: WindowedView) => WindowedCoverage;
    retry: (window?: WindowedView) => void;
    invalidate: () => void;
    cancel: () => void;
    dispose: () => void;
}
```

### `WindowedDataError`

```ts
interface WindowedDataError {
    request?: WindowedDataRequest;
    error: unknown;
}
```

### `WindowedDataLoader`

```ts
type WindowedDataLoader<T, L = never> = (request: WindowedDataRequest, context: {
    signal: AbortSignal;
}) => readonly T[] | WindowedDataPage<T, L> | Promise<readonly T[] | WindowedDataPage<T, L>>;
```

### `WindowedDataNormalizedOptions`

```ts
interface WindowedDataNormalizedOptions<T, L = never> {
    chunkSize: number;
    origin: number;
    padding: number;
    maxChunksPerRequest: number;
    maxCells: number;
    itemId: (item: T) => string;
    itemRow: (item: T) => string | undefined;
    itemRange: (item: T) => TimeRange | undefined;
    linkId: (link: L) => string;
}
```

### `WindowedDataOptions`

```ts
interface WindowedDataOptions<T, L = never> {
    chunkSize: number;
    origin?: number;
    padding?: number;
    maxChunksPerRequest?: number;
    maxCells?: number;
    itemId?: (item: T) => string;
    itemRow?: (item: T) => string | undefined;
    itemRange?: (item: T) => TimeRange | undefined;
    linkId?: (link: L) => string;
}
```

### `WindowedDataPage`

```ts
interface WindowedDataPage<T, L = never> {
    items: readonly T[];
    links?: readonly L[];
}
```

### `WindowedDataRequest`

```ts
interface WindowedDataRequest {
    requestId: string;
    key: string;
    condition: string;
    start: number;
    end: number;
    rowIds?: string[];
}
```

### `WindowedDataSettlement`

```ts
interface WindowedDataSettlement<T, L = never> {
    state: WindowedDataState<T, L>;
    applied: boolean;
}
```

### `WindowedDataState`

```ts
interface WindowedDataState<T, L = never> {
    readonly options: Readonly<WindowedDataNormalizedOptions<T, L>>;
    readonly condition: string;
    readonly view?: Readonly<{
        start: number;
        end: number;
        rowIds?: readonly string[];
    }>;
    readonly cells: ReadonlyMap<string, Readonly<WindowedCell>>;
    readonly requests: ReadonlyMap<string, Readonly<WindowedDataRequest>>;
    readonly items: ReadonlyMap<string, T>;
    readonly links: ReadonlyMap<string, L>;
    readonly sequence: number;
    readonly inflight: ReadonlyMap<string, WindowedInFlightRequest>;
}
```

### `WindowedDataTransition`

```ts
interface WindowedDataTransition<T, L = never> {
    state: WindowedDataState<T, L>;
    start: WindowedDataRequest[];
    abort: string[];
}
```

### `WindowedInFlightRequest`

```ts
interface WindowedInFlightRequest extends WindowedDataRequest {
    first: number;
    last: number;
    cells: readonly string[];
}
```

### `WindowedView`

```ts
interface WindowedView {
    start: number;
    end: number;
    rowIds?: readonly string[];
}
```

### `WorkCalendar`

```ts
interface WorkCalendar {
    id: string;
    periods: readonly TimeRange[];
}
```

### `WorkShift`

```ts
interface WorkShift {
    startMinute: number;
    endMinute: number;
}
```

### `WorkWeek`

```ts
interface WorkWeek {
    weekly: readonly WeeklyShift[];
    utcOffsetMinutes?: number;
    timeZone?: string;
    exceptions?: Readonly<Record<string, readonly WorkShift[]>>;
}
```

### `actualsTimelineBars`

```ts
function actualsTimelineBars(result: RescheduleFromActualsResult, options?: ActualsTimelineBarOptions): TimelineBar[];
```

### `aggregateTimeBuckets`

```ts
function aggregateTimeBuckets<T = TimeBucketItem>(items: readonly T[], buckets: readonly TimeBucket[], options?: TimeBucketAggregateOptions<T>): TimeBucketCell[];
```

### `applyBoardCardMove`

```ts
function applyBoardCardMove<C extends TaskBoardCard>(cards: readonly C[], move: TaskBoardCardMove, board?: {
    columns?: readonly TaskBoardColumn[];
    lanes?: readonly TaskBoardLane[];
}): C[];
```

### `applyGraphPositions`

```ts
function applyGraphPositions(layout: GraphLayout, edges: readonly GraphEdge[], positions: ReadonlyMap<string, GraphPoint>, direction?: GraphLayoutDirection): GraphLayout;
```

### `applyGraphSizes`

```ts
function applyGraphSizes(layout: GraphLayout, edges: readonly GraphEdge[], sizes: ReadonlyMap<string, GraphNodeSize>, direction?: GraphLayoutDirection): GraphLayout;
```

### `applyRecurringEdit`

```ts
function applyRecurringEdit<E extends CalendarEvent>(events: readonly E[], target: RecurringEditTarget, change: RecurringEditChange | 'delete', scope: RecurringEditScope, options?: RecurringEditOptions): E[];
```

### `applyTimelineConstraintEdit`

```ts
function applyTimelineConstraintEdit<B extends TimelineBar>(bars: readonly B[], change: TimelineConstraintEdit): B[];
```

### `applyTimelineSheetEdit`

```ts
function applyTimelineSheetEdit<R extends TimelineRow>(rows: readonly R[], change: TimelineSheetChanges<R>, appliers: TimelineSheetAppliers<R>): R[];
```

### `applyTreeGridEdits`

```ts
function applyTreeGridEdits<R extends TreeGridRow>(input: {
    rows: readonly R[];
    columns: readonly TreeGridColumn<R>[];
    cells?: readonly TreeGridCell[];
}, edits: Iterable<TreeGridCellEdit>): {
    rows: R[];
    cells: TreeGridCell[];
};
```

### `assignLanes`

```ts
function assignLanes<B extends TimelineBar>(bars: readonly B[], options?: AssignLanesOptions): AssignLanesResult<B>;
```

### `assignmentWorkPeriods`

```ts
function assignmentWorkPeriods(work: readonly TimeRange[], assignment: Pick<ResourceAssignment, 'taskId' | 'workOffset' | 'workDuration'>): TimeRange[];
```

### `baselineVariance`

```ts
function baselineVariance(bar: TimeRange, baseline: TimeRange): TimelineBaselineVariance;
```

### `beginGraphExpansion`

```ts
function beginGraphExpansion<N extends {
    id: string;
}, E extends GraphEdge>(state: GraphExpansionState<N, E>, ids: Iterable<string>, options?: GraphExpansionKeyOptions): GraphExpansionState<N, E>;
```

### `beginTransaction`

```ts
function beginTransaction<S>(state: TransactionCoreState<S>, pending: Omit<PendingTransaction, 'epoch' | 'baseVersion'>, candidate: S): TransactionCoreState<S> | undefined;
```

### `boardCardPosition`

```ts
function boardCardPosition(cards: readonly TaskBoardCard[], id: string, options?: {
    lanes?: boolean;
}): TaskBoardPosition;
```

### `buildGraphLayoutRequests`

```ts
function buildGraphLayoutRequests<N extends NetworkNode, E extends GraphEdge, G extends NetworkGroup = NetworkGroup>(input: GraphLayoutRequestInput<N, E, G>, requestId: string): GraphLayoutRequests<N, E, G>;
```

### `buildPlacementInput`

```ts
function buildPlacementInput<I extends PlacementInput>(input: I, placedTaskIds: Iterable<string>): PlacementResult<I>;
```

### `buildTreeGridClear`

```ts
function buildTreeGridClear(index: TreeGridIndex<any>, flat: TreeGridLines<any>, range: TreeGridRange, source?: TreeGridCellEdit['source']): TreeGridSheetBuild;
```

### `buildTreeGridFill`

```ts
function buildTreeGridFill(index: TreeGridIndex<any>, flat: TreeGridLines<any>, range: TreeGridRange, options?: {
    source?: TreeGridRange;
    origin?: TreeGridCellEdit['source'];
    maxCells?: number;
}): TreeGridSheetBuild;
```

### `buildTreeGridPaste`

```ts
function buildTreeGridPaste(index: TreeGridIndex<any>, flat: TreeGridLines<any>, range: TreeGridRange, text: string, options?: {
    maxCells?: number;
    source?: TreeGridCellEdit['source'];
}): TreeGridSheetBuild;
```

### `buildViewBindingIndex`

```ts
function buildViewBindingIndex(bindings: readonly ViewBinding[]): ViewBindingIndex;
```

### `buildWorkPeriods`

```ts
function buildWorkPeriods(range: TimeRange, week: WorkWeek): TimeRange[];
```

### `calculateResourceLoad`

```ts
function calculateResourceLoad(range: TimeRange, tasks: readonly Pick<ScheduledTask, 'id' | 'work'>[], resources: readonly ResourceCapacity[], assignments: readonly ResourceAssignment[], options?: ResourceLoadOptions): ResourceLoadSegment[];
```

### `calendarBands`

```ts
function calendarBands(range: TimeRange, unit: CalendarBandUnit, options?: CalendarBandOptions): TimelineBand[];
```

### `calendarZoomPresets`

```ts
function calendarZoomPresets(range: TimeRange, options?: CalendarZoomPresetOptions): CalendarZoomPreset[];
```

### `cancelGraphExpansion`

```ts
function cancelGraphExpansion<N extends {
    id: string;
}, E extends GraphEdge>(state: GraphExpansionState<N, E>, ids: Iterable<string>, options?: GraphExpansionKeyOptions): GraphExpansionState<N, E>;
```

### `cancelWindowedRequests`

```ts
function cancelWindowedRequests<T, L = never>(state: WindowedDataState<T, L>): WindowedDataTransition<T, L>;
```

### `checkGraphConnection`

```ts
function checkGraphConnection(nodes: readonly IdentifiedNode[], edges: readonly GraphEdge[], rules: GraphPortRules, connection: GraphConnection, replacingEdgeId?: string): GraphConnectionCheck;
```

### `clearTransactionResult`

```ts
function clearTransactionResult<S>(state: TransactionCoreState<S>): TransactionCoreState<S>;
```

### `cloneGraphElements`

```ts
function cloneGraphElements<N extends IdentifiedNode, E extends GraphEdge>(nodes: readonly N[], edges: readonly E[], nodeIds: Iterable<string>, options: GraphCloneOptions): GraphCloneResult<N, E>;
```

### `collapseGraphGroups`

```ts
function collapseGraphGroups<N extends NetworkNode, E extends GraphEdge>(nodes: readonly N[], edges: readonly E[], groups: readonly NetworkGroup[], collapsedIds: Iterable<string>, options?: GraphCollapseOptions): GraphCollapseResult<N, E>;
```

### `collectScheduleReasons`

```ts
function collectScheduleReasons(trace: ScheduleTrace, taskId: string, options?: CollectScheduleReasonsOptions): ScheduleReason[];
```

### `comparePlans`

```ts
function comparePlans(current: PlanScenario, candidate: PlanScenario): PlanComparison;
```

### `completeGraphLayout`

```ts
function completeGraphLayout(layout: GraphLayout, nodes: readonly IdentifiedNode[], edges: readonly GraphEdge[], options?: GraphLayoutCompletionOptions): GraphLayoutCompletion;
```

### `computeEarnedValue`

```ts
function computeEarnedValue(tasks: readonly EarnedValueTask[], options: EarnedValueOptions): EarnedValueResult;
```

### `countGraphCrossings`

```ts
function countGraphCrossings(layout: GraphLayout, edges: readonly GraphEdge[], direction?: GraphLayoutDirection): number;
```

### `createGraphConnectionChecker`

```ts
function createGraphConnectionChecker(nodes: readonly IdentifiedNode[], edges: readonly GraphEdge[], rules: GraphPortRules): GraphConnectionChecker;
```

### `createGraphExpansion`

```ts
function createGraphExpansion<N extends {
    id: string;
}, E extends GraphEdge = GraphEdge>(seed?: GraphExpansionPage<N, E>): GraphExpansionState<N, E>;
```

### `createGraphRouteCache`

```ts
function createGraphRouteCache(): GraphRouteCache;
```

### `createResourceTimelineProjector`

```ts
function createResourceTimelineProjector<D = unknown, R = unknown>(): (input: ResourceTimelineInput<D, R>, options?: ResourceTimelineOptions<D, R>) => ResourceTimelineProjection<D, R>;
```

### `createTimeBucketColumns`

```ts
function createTimeBucketColumns<P extends TimeBucketPeriod>(periods: readonly P[], options?: TimeBucketColumnOptions<P>): TimeBucketColumn[];
```

### `createTimeScale`

```ts
function createTimeScale(range: TimeRange, pixelsPerUnit: number): TimeScale;
```

### `createTimelineRowTree`

```ts
function createTimelineRowTree<R extends TimelineRow>(rows: readonly R[]): {
    row: R;
    depth: number;
    hasChildren: boolean;
    afterSubtree: number;
}[];
```

### `createTimelineViewState`

```ts
function createTimelineViewState(columns?: readonly Pick<TimelineColumn, 'id'>[], patch?: Partial<Omit<TimelineViewState, 'version'>>): TimelineViewState;
```

### `createTransactionState`

```ts
function createTransactionState<S>(acceptedState: S, acceptedVersion: string): TransactionCoreState<S>;
```

### `createTreeGridIndex`

```ts
function createTreeGridIndex<R extends TreeGridRow>(input: TreeGridInput<R>): TreeGridIndex<R>;
```

### `createWindowedDataState`

```ts
function createWindowedDataState<T, L = never>(options: WindowedDataOptions<T, L>, condition?: string): WindowedDataState<T, L>;
```

### `createWorkingTimeScale`

```ts
function createWorkingTimeScale(range: TimeRange, periods: readonly TimeRange[], pixelsPerUnit: number, nonWorkingRatio?: number): TimeScale;
```

### `cullGraphElements`

```ts
function cullGraphElements(bounds: GraphBounds, view: GraphRect, keep?: GraphCullKeep): GraphVisibleIds;
```

### `defaultNonWorkingRatio`

```ts
const defaultNonWorkingRatio = 0.1;
```

### `defaultSvgExportTheme`

```ts
const defaultSvgExportTheme: Readonly<Required<SvgExportTheme>>;
```

### `deleteTreeGridRows`

```ts
function deleteTreeGridRows<R extends TreeGridRow>(input: {
    rows: readonly R[];
    cells?: readonly TreeGridCell[];
}, change: Pick<TreeGridRowDelete, 'ids' | 'includeDescendants'>): {
    rows: R[];
    cells: TreeGridCell[];
};
```

### `dependencyEndsForType`

```ts
function dependencyEndsForType(type?: TimelineDependency['type']): {
    from: TimelineBarEnd;
    to: TimelineBarEnd;
};
```

### `dependencyPath`

```ts
function dependencyPath(x1: number, y1: number, x2: number, y2: number, style?: DependencyPathStyle): string;
```

### `dependencyTimes`

```ts
function dependencyTimes(source: TimeRange, target: TimeRange, type?: TimelineDependency['type']): {
    from: number;
    to: number;
};
```

### `dependencyTypeForEnds`

```ts
function dependencyTypeForEnds(from: TimelineBarEnd, to: TimelineBarEnd): TimelineDependencyType;
```

### `detectGraphCommunities`

```ts
function detectGraphCommunities(nodes: readonly IdentifiedNode[], edges: readonly GraphEdge[], options?: GraphCommunityOptions): GraphCommunityResult;
```

### `diffStructure`

```ts
function diffStructure<T>(before: readonly T[], after: readonly T[], options: StructureDiffOptions<T>): StructureDiff;
```

### `editTimeRange`

```ts
function editTimeRange(range: TimeRange, mode: EditMode, delta: number, step: number, bounds: TimeRange, minDuration?: number): TimeRange;
```

### `escapeXml`

```ts
function escapeXml(value: string): string;
```

### `eventCalendarDays`

```ts
function eventCalendarDays(view: EventCalendarView, date: number, options?: EventCalendarOptions): EventCalendarDay[];
```

### `eventCalendarMonthGrid`

```ts
function eventCalendarMonthGrid(date: number, options?: EventCalendarOptions): EventCalendarDay[][];
```

### `eventCalendarRange`

```ts
function eventCalendarRange(view: EventCalendarView, date: number, options?: EventCalendarOptions): TimeRange;
```

### `eventCalendarTimeAt`

```ts
function eventCalendarTimeAt(day: number, timeOfDay: number, options?: Pick<EventCalendarOptions, 'timeZone'>): number;
```

### `eventCalendarTimeOfDay`

```ts
function eventCalendarTimeOfDay(day: number, time: number, options?: Pick<EventCalendarOptions, 'timeZone'>): number;
```

### `expandRecurrence`

```ts
function expandRecurrence(series: RecurrenceSeries, range: TimeRange, options?: RecurrenceExpandOptions): RecurrenceOccurrence[];
```

### `expandRecurringEvents`

```ts
function expandRecurringEvents<E extends CalendarEvent>(events: readonly E[], range: TimeRange, options?: RecurrenceExpandOptions): E[];
```

### `fieldValuesEqual`

```ts
function fieldValuesEqual(a: FieldValue, b: FieldValue): boolean;
```

### `filterGraph`

```ts
function filterGraph<N extends IdentifiedNode, E extends GraphEdge>(nodes: readonly N[], edges: readonly E[], match: GraphNodeMatch<N>, options?: GraphFilterOptions): {
    nodes: N[];
    edges: E[];
};
```

### `filterTimelineRows`

```ts
function filterTimelineRows<R extends TimelineRow>(rows: readonly R[], predicate: (row: R) => boolean): R[];
```

### `findGraphCycles`

```ts
function findGraphCycles(nodes: readonly IdentifiedNode[], edges: readonly GraphEdge[]): string[][];
```

### `findOrthogonalRoute`

```ts
function findOrthogonalRoute(from: GraphRouteEnd, to: GraphRouteEnd, obstacles: readonly GraphRect[], options?: GraphObstacleAvoidance): GraphPoint[] | undefined;
```

### `findTreeGridLine`

```ts
function findTreeGridLine(index: TreeGridIndex<any>, flat: TreeGridLines<any>, position: TreeGridPosition): {
    line: number;
    exact: boolean;
} | undefined;
```

### `flattenTreeGrid`

```ts
function flattenTreeGrid<R extends TreeGridRow>(index: TreeGridIndex<R>, expandedIds: Iterable<string>): TreeGridLines<R>;
```

### `formatDependencyLag`

```ts
function formatDependencyLag(lag: number): string;
```

### `formatFieldValue`

```ts
function formatFieldValue(spec: TimelineFieldSpec<any>, value: FieldValue): string;
```

### `formatRecurrenceRule`

```ts
function formatRecurrenceRule(rule: RecurrenceRule, options?: RecurrenceZoneOptions & {
    allDay?: boolean;
}): string;
```

### `formatSheetText`

```ts
function formatSheetText(records: readonly (readonly string[])[]): string;
```

### `fromDrawio`

```ts
function fromDrawio(xml: string, options?: DrawioImportOptions): GraphInterchangeImport;
```

### `fromDrawioAsync`

```ts
function fromDrawioAsync(xml: string, options?: DrawioAsyncImportOptions): Promise<GraphInterchangeImport>;
```

### `fromGraphMl`

```ts
function fromGraphMl(xml: string, options?: GraphInterchangeImportOptions): GraphInterchangeImport;
```

### `fromICalendar`

```ts
function fromICalendar(text: string, options?: ICalendarImportOptions): ICalendarImport;
```

### `fromMermaid`

```ts
function fromMermaid(text: string, options?: GraphInterchangeImportOptions): GraphInterchangeImport;
```

### `fromMsProjectXml`

```ts
function fromMsProjectXml(xml: string, options?: MsProjectXmlOptions): MsProjectImport;
```

### `graphAlignmentGuides`

```ts
function graphAlignmentGuides(moving: GraphRect, others: readonly GraphRect[], threshold: number): GraphAlignment;
```

### `graphBetweennessCentrality`

```ts
function graphBetweennessCentrality(nodes: readonly IdentifiedNode[], edges: readonly GraphEdge[], options?: GraphBetweennessOptions): Map<string, number>;
```

### `graphCameraAt`

```ts
function graphCameraAt(point: {
    x: number;
    y: number;
}, size: {
    width: number;
    height: number;
}, scale: number): GraphViewport;
```

### `graphCommunityGroups`

```ts
function graphCommunityGroups(communities: readonly (readonly string[])[], options?: GraphCommunityGroupsOptions): GraphGroup[];
```

### `graphComponents`

```ts
function graphComponents(nodes: readonly IdentifiedNode[], edges: readonly GraphEdge[]): string[][];
```

### `graphConnectionTargets`

```ts
function graphConnectionTargets(nodes: readonly IdentifiedNode[], edges: readonly GraphEdge[], rules: GraphPortRules, origin: GraphConnectionOrigin, replacingEdgeId?: string): GraphConnectionTargets;
```

### `graphConnectionValidator`

```ts
function graphConnectionValidator(nodes: readonly IdentifiedNode[], edges: readonly GraphEdge[], rules: GraphPortRules, validate?: (connection: GraphConnection, replacingEdgeId?: string) => boolean | string | void): (connection: GraphConnection, replacingEdgeId?: string) => boolean | string | void;
```

### `graphConnectionViolations`

```ts
function graphConnectionViolations(nodes: readonly IdentifiedNode[], edges: readonly GraphEdge[], rules: GraphPortRules): GraphConnectionViolation[];
```

### `graphDegreeCentrality`

```ts
function graphDegreeCentrality(nodes: readonly IdentifiedNode[], edges: readonly GraphEdge[], options?: GraphDegreeCentralityOptions): Map<string, number>;
```

### `graphDeletion`

```ts
function graphDeletion(nodes: readonly IdentifiedNode[], edges: readonly GraphEdge[], nodeIds: Iterable<string>, edgeIds?: Iterable<string>): GraphDeletion;
```

### `graphEdgeEndpoint`

```ts
function graphEdgeEndpoint(layout: GraphLayout, nodes: ReadonlyMap<string, IdentifiedNode>, edge: GraphConnection, end: 'from' | 'to', direction: GraphLayoutDirection): {
    side: "left" | "right" | "top" | "bottom";
    x: number;
    y: number;
};
```

### `graphExpansionView`

```ts
function graphExpansionView<N extends {
    id: string;
}, E extends GraphEdge>(state: GraphExpansionState<N, E>, options?: GraphExpansionKeyOptions): GraphExpansionView<N, E>;
```

### `graphFlowBands`

```ts
function graphFlowBands(flow: Pick<GraphFlowLayout, 'bands'>): Map<string, GraphEdgeBand>;
```

### `graphLayoutBounds`

```ts
function graphLayoutBounds(layout: Pick<GraphLayout, 'boxes' | 'paths' | 'edgeLabels'>, labelReach?: number): GraphBounds;
```

### `graphLayoutChangeMetrics`

```ts
function graphLayoutChangeMetrics(before: ReadonlyMap<string, GraphPoint>, after: Pick<GraphLayout, 'boxes'> & Partial<Pick<GraphLayout, 'paths'>>, options?: GraphLayoutChangeOptions): GraphLayoutChangeMetrics;
```

### `graphLayoutFromJson`

```ts
function graphLayoutFromJson(value: unknown): GraphLayout;
```

### `graphLayoutInputKey`

```ts
function graphLayoutInputKey(input: GraphLayoutKeyInput): string;
```

### `graphLayoutMessageFromJson`

```ts
function graphLayoutMessageFromJson(value: unknown): GraphLayoutWorkerMessage;
```

### `graphLayoutMessageToJson`

```ts
function graphLayoutMessageToJson(message: GraphLayoutWorkerMessage): GraphLayoutWorkerJsonMessage;
```

### `graphLayoutToJson`

```ts
function graphLayoutToJson(layout: GraphLayout): GraphLayoutJson;
```

### `graphLayoutWorkerAdapter`

```ts
function graphLayoutWorkerAdapter(port: GraphLayoutWorkerPort, options?: GraphLayoutWorkerAdapterOptions): AsyncGraphLayoutAdapter<any, any, any>;
```

### `graphNeighborhood`

```ts
function graphNeighborhood(index: GraphIndex, id: string, maxHops?: number): Set<string>;
```

### `graphNodesInPolygon`

```ts
function graphNodesInPolygon(boxes: ReadonlyMap<string, GraphRect>, polygon: readonly GraphPoint[]): string[];
```

### `graphPageRank`

```ts
function graphPageRank(nodes: readonly IdentifiedNode[], edges: readonly GraphEdge[], options?: GraphPageRankOptions): GraphPageRankResult;
```

### `graphPaletteMimeType`

```ts
const graphPaletteMimeType = "application/x-vue-weave-palette+json";
```

### `graphPathBounds`

```ts
function graphPathBounds(path: string): GraphRect | undefined;
```

### `graphPathEndpoints`

```ts
function graphPathEndpoints(path: string): {
    start: GraphPoint;
    end: GraphPoint;
} | undefined;
```

### `graphPointInPolygon`

```ts
function graphPointInPolygon(point: GraphPoint, polygon: readonly GraphPoint[]): boolean;
```

### `graphPolylinePath`

```ts
function graphPolylinePath(points: readonly GraphPoint[], cornerRadius?: number): string;
```

### `graphPortAnchor`

```ts
function graphPortAnchor(box: GraphBox, port: GraphPort): GraphPoint;
```

### `graphRectsIntersect`

```ts
function graphRectsIntersect(a: GraphRect, b: GraphRect): boolean;
```

### `graphSmoothPath`

```ts
function graphSmoothPath(points: readonly GraphPoint[]): string;
```

### `graphSwimlaneAt`

```ts
function graphSwimlaneAt<L extends GraphSwimlaneBand>(lanes: readonly L[], target: GraphPoint | GraphRect): L | undefined;
```

### `graphTracePath`

```ts
function graphTracePath(result: Pick<GraphTraversalResult, 'nodeIds' | 'via'>, nodeId: string, options?: {
    direction?: GraphWalkDirection;
}): GraphTracedPath | undefined;
```

### `graphViewportRect`

```ts
function graphViewportRect(camera: GraphViewport, size: {
    width: number;
    height: number;
}, overscan?: number): GraphRect;
```

### `groupBoardCards`

```ts
function groupBoardCards<C extends TaskBoardCard>(cards: readonly C[], columns: readonly TaskBoardColumn[], lanes?: readonly TaskBoardLane[], options?: {
    filter?: (card: C) => boolean;
}): TaskBoardGroups<C>;
```

### `indentTimelineRow`

```ts
function indentTimelineRow<R extends TimelineRow>(rows: readonly R[], id: string): R[];
```

### `indexGraph`

```ts
function indexGraph(nodes: readonly IdentifiedNode[], edges: readonly GraphEdge[]): GraphIndex;
```

### `insertTreeGridRow`

```ts
function insertTreeGridRow<R extends TreeGridRow>(rows: readonly R[], change: Pick<TreeGridRowCreate, 'parentId' | 'index'>, row: R): R[];
```

### `intersectsWindow`

```ts
function intersectsWindow(bar: TimeRange, window: TimeRange): boolean;
```

### `intlTimeFormatter`

```ts
function intlTimeFormatter(options?: IntlTimeFormatterOptions): (time: number) => string;
```

### `invalidateWindowedData`

```ts
function invalidateWindowedData<T, L = never>(state: WindowedDataState<T, L>): WindowedDataTransition<T, L>;
```

### `invertWorkPeriods`

```ts
function invertWorkPeriods(periods: readonly TimeRange[], range: TimeRange): TimeRange[];
```

### `isGraphRouteValid`

```ts
function isGraphRouteValid(layout: GraphLayout, nodes: ReadonlyMap<string, IdentifiedNode>, edge: GraphEdge): boolean;
```

### `isTreeGridCellEditable`

```ts
function isTreeGridCellEditable(index: TreeGridIndex<any>, rowId: string, columnId: string): boolean;
```

### `layoutCalendarAgenda`

```ts
function layoutCalendarAgenda(events: readonly {
    id: string;
    start: number;
    end: number;
    allDay?: boolean;
}[], days: readonly TimeRange[]): CalendarAgendaDay[];
```

### `layoutCalendarDayEvents`

```ts
function layoutCalendarDayEvents(events: readonly {
    id: string;
    start: number;
    end: number;
}[], range: TimeRange, options?: {
    minDuration?: number;
}): CalendarEventColumn[];
```

### `layoutCircularGraph`

```ts
function layoutCircularGraph<N extends IdentifiedNode>(nodes: readonly N[], edges: readonly GraphEdge[], options?: GraphCircularLayoutOptions<N>): GraphLayout;
```

### `layoutConcentricGraph`

```ts
function layoutConcentricGraph<N extends IdentifiedNode>(nodes: readonly N[], edges: readonly GraphEdge[], options?: GraphConcentricLayoutOptions<N>): GraphLayout;
```

### `layoutFlowGraph`

```ts
function layoutFlowGraph<N extends IdentifiedNode, E extends GraphEdge>(nodes: readonly N[], edges: readonly E[], options: GraphFlowOptions<N, E>): GraphFlowLayout;
```

### `layoutForceGraph`

```ts
function layoutForceGraph(nodes: readonly IdentifiedNode[], edges: readonly GraphEdge[], options?: GraphForceLayoutOptions): GraphLayout;
```

### `layoutGraphIncrementally`

```ts
function layoutGraphIncrementally(nodes: readonly IdentifiedNode[], edges: readonly GraphEdge[], positions: ReadonlyMap<string, GraphKnownPosition>, options?: GraphIncrementalLayoutOptions): GraphIncrementalLayout;
```

### `layoutGridGraph`

```ts
function layoutGridGraph(nodes: readonly IdentifiedNode[], edges: readonly GraphEdge[], options?: GraphGridLayoutOptions): GraphLayout;
```

### `layoutLayeredGraph`

```ts
function layoutLayeredGraph(nodes: readonly IdentifiedNode[], edges: readonly GraphEdge[], options?: GraphLayeredLayoutOptions): GraphLayout;
```

### `layoutRadialGraph`

```ts
function layoutRadialGraph(nodes: readonly IdentifiedNode[], edges: readonly GraphEdge[], options?: GraphRadialLayoutOptions): GraphLayout;
```

### `layoutSwimlaneGraph`

```ts
function layoutSwimlaneGraph<N extends IdentifiedNode>(nodes: readonly N[], edges: readonly GraphEdge[], options: GraphSwimlaneLayoutOptions<N>): GraphSwimlaneLayout;
```

### `layoutTreeGraph`

```ts
function layoutTreeGraph(nodes: readonly IdentifiedNode[], edges: readonly GraphEdge[], options?: GraphTreeLayoutOptions): GraphLayout;
```

### `levelResources`

```ts
function levelResources(input: LevelResourcesInput, options?: ScheduleOptions & {
    explain?: false;
}): LevelResourcesResult;
function levelResources(input: LevelResourcesInput, options: ScheduleOptions & {
    explain: true;
}): ExplainedLevelResourcesResult;
function levelResources(input: LevelResourcesInput, options?: ScheduleOptions): LevelResourcesResult | ExplainedLevelResourcesResult;
```

### `matchTreeGridEntities`

```ts
function matchTreeGridEntities<R extends TreeGridRow>(input: TreeGridInput<R> | TreeGridIndex<R>, entities: Iterable<EntityRef>): TreeGridEntityMatches;
```

### `maxEarnedValuePoints`

```ts
const maxEarnedValuePoints = 100000;
```

### `mergeGraphExpansionPage`

```ts
function mergeGraphExpansionPage<N extends {
    id: string;
}, E extends GraphEdge>(state: GraphExpansionState<N, E>, page: GraphExpansionPage<N, E>, expandedIds?: Iterable<string>, options?: GraphExpansionKeyOptions): GraphExpansionState<N, E>;
```

### `mirrorTimeScale`

```ts
function mirrorTimeScale(scale: TimeScale): TimeScale;
```

### `moveTimeRanges`

```ts
function moveTimeRanges(ranges: readonly TimeRange[], delta: number, step: number, bounds: TimeRange): TimeRange[];
```

### `moveTimelineRow`

```ts
function moveTimelineRow<R extends TimelineRow>(rows: readonly R[], id: string, target: TimelineRowPosition): R[];
```

### `nextTimelineSort`

```ts
function nextTimelineSort(sort: readonly TimelineViewSort[], columnId: string): TimelineViewSort[];
```

### `normalizeWorkPeriods`

```ts
function normalizeWorkPeriods(periods: readonly TimeRange[], range: TimeRange): TimeRange[];
```

### `outdentTimelineRow`

```ts
function outdentTimelineRow<R extends TimelineRow>(rows: readonly R[], id: string): R[];
```

### `packCalendarEventLanes`

```ts
function packCalendarEventLanes(events: readonly {
    id: string;
    start: number;
    end: number;
}[], days: readonly TimeRange[]): CalendarEventLaneLayout;
```

### `parseCsv`

```ts
function parseCsv(text: string, options?: CsvParseOptions): string[][];
```

### `parseFieldValue`

```ts
function parseFieldValue(spec: TimelineFieldSpec<any>, text: string): FieldParseResult;
```

### `parseGraphLayoutMessage`

```ts
function parseGraphLayoutMessage(value: unknown): GraphLayoutWorkerMessage;
```

### `parseRecurrenceRule`

```ts
function parseRecurrenceRule(text: string, options?: RecurrenceZoneOptions): RecurrenceRule;
```

### `parseSheetText`

```ts
function parseSheetText(text: string): string[][];
```

### `parseTimelineViewState`

```ts
function parseTimelineViewState(value: unknown): TimelineViewState;
```

### `parseWeaveSnapshot`

```ts
function parseWeaveSnapshot(text: string, options?: ParseWeaveSnapshotOptions): ParseWeaveSnapshotResult;
```

### `placeGraphEdgeLabels`

```ts
function placeGraphEdgeLabels<L extends GraphLayout, E extends GraphEdge = GraphEdge>(layout: L, edges: readonly E[], options?: GraphEdgeLabelPlacementOptions<E>): L;
```

### `planBaselines`

```ts
function planBaselines(result: ScheduleResult | LevelResourcesResult, id: string): Map<string, TimelineBaseline>;
```

### `planComparisonTargets`

```ts
function planComparisonTargets(comparison: PlanComparison, index: ViewBindingIndex, options?: PlanComparisonTargetOptions): PlanComparisonTargets;
```

### `projectResourceTimeline`

```ts
function projectResourceTimeline<D = unknown, R = unknown>(input: ResourceTimelineInput<D, R>, options?: ResourceTimelineOptions<D, R>): ResourceTimelineProjection<D, R>;
```

### `projectTimelineRows`

```ts
function projectTimelineRows<R extends TimelineRow>(input: TimelineRowsInput<R>, state: TimelineRowViewState): TimelineRowsProjection<R>;
```

### `projectTimelineView`

```ts
function projectTimelineView<R extends TimelineRow, B extends TimelineBar, D extends TimelineDependency = TimelineDependency>(input: TimelineViewInput<R, B, D>, state: TimelineViewState): TimelineViewProjection<R, B, D>;
```

### `projectTreeGridRows`

```ts
function projectTreeGridRows<R extends TreeGridRow>(input: TreeGridViewInput<R>, state: TreeGridViewState): TreeGridViewProjection<R>;
```

### `propagateEdit`

```ts
function propagateEdit(input: ScheduleInput, edit: ScheduleEdit): PropagateEditResult;
```

### `proposeResourceAssignment`

```ts
function proposeResourceAssignment(state: ResourceAssignmentState, request: ResourceAssignmentRequest): ResourceAssignmentProposal;
```

### `readPaletteDrop`

```ts
function readPaletteDrop(source: PaletteDropSource | null | undefined): GraphPaletteDrop | undefined;
```

### `reconcileTimelineViewColumns`

```ts
function reconcileTimelineViewColumns(state: TimelineViewState, columns: readonly Pick<TimelineColumn, 'id'>[]): {
    columns: TimelineViewColumn[];
    diagnostics: TimelineViewDiagnostic[];
};
```

### `refreshTransactionState`

```ts
function refreshTransactionState<S>(state: TransactionCoreState<S>, acceptedState: S, acceptedVersion: string): TransactionCoreState<S>;
```

### `rejectWindowedRequest`

```ts
function rejectWindowedRequest<T, L = never>(state: WindowedDataState<T, L>, requestId: string, error: unknown): WindowedDataSettlement<T, L>;
```

### `removeGraphElements`

```ts
function removeGraphElements<N extends IdentifiedNode, E extends GraphEdge>(nodes: readonly N[], edges: readonly E[], deletion: GraphDeletion): {
    nodes: N[];
    edges: E[];
};
```

### `removeTimelineBars`

```ts
function removeTimelineBars<B extends TimelineBar, D extends TimelineDependency>(bars: readonly B[], dependencies: readonly D[], ids: Iterable<string>): {
    bars: B[];
    dependencies: D[];
};
```

### `renderEventCalendarSvg`

```ts
function renderEventCalendarSvg<E extends CalendarEvent>(events: readonly E[], date: number, options?: EventCalendarSvgOptions<E>): string;
```

### `renderGraphSvg`

```ts
function renderGraphSvg<N extends NetworkNode, E extends GraphEdge>(layout: GraphLayout, nodes: readonly N[], edges: readonly E[], options?: GraphSvgOptions<N, E>): string;
```

### `renderTaskBoardSvg`

```ts
function renderTaskBoardSvg<C extends TaskBoardCard>(cards: readonly C[], columns: readonly TaskBoardColumn[], options?: TaskBoardSvgOptions<C>): string;
```

### `renderTimelineSvg`

```ts
function renderTimelineSvg<R extends TimelineRow, B extends TimelineBar>(rows: readonly R[], bars: readonly B[], dependencies: readonly TimelineDependency[], scale: TimeScale, options?: TimelineSvgOptions<R, B>): string;
```

### `renderTreeGridSvg`

```ts
function renderTreeGridSvg<R extends TreeGridRow>(rows: readonly R[], columns: readonly TreeGridColumn<R>[], options?: TreeGridSvgOptions<R>): string;
```

### `rescheduleFromActuals`

```ts
function rescheduleFromActuals(input: ScheduleInput, statusDate: number, actuals: ReadonlyMap<string, TaskActuals>): RescheduleFromActualsResult;
```

### `rescheduleFromStatusDate`

```ts
function rescheduleFromStatusDate(input: ScheduleInput, statusDate: number, progress: ReadonlyMap<string, number>): ScheduleResult;
```

### `resetWindowedData`

```ts
function resetWindowedData<T, L = never>(state: WindowedDataState<T, L>): WindowedDataTransition<T, L>;
```

### `resolveCollapsedTargets`

```ts
function resolveCollapsedTargets(collapse: Pick<GraphCollapseResult, 'nodes' | 'edges' | 'owners' | 'mergedEdges' | 'hiddenEdgeIds'>, ids: {
    nodeIds?: Iterable<string>;
    edgeIds?: Iterable<string>;
}, edges: readonly GraphEdge[]): CollapsedTargetsResult;
```

### `resolveEntityRefs`

```ts
function resolveEntityRefs(index: ViewBindingIndex, targets: Iterable<ViewTarget>): ResolvedEntityRefs;
```

### `resolveLoadTargets`

```ts
function resolveLoadTargets<S extends LoadSegmentLike>(segments: readonly S[], targets: Iterable<LoadViewTarget>): ResolvedLoadTargets<S>;
```

### `resolveResourceTimelineEdit`

```ts
function resolveResourceTimelineEdit(projection: Pick<ResourceTimelineProjection, 'bars' | 'rows' | 'origins' | 'taskBarIds'>, edit: TimelineEdit): ResourceTimelineEditResolution | ResourceTimelineRejection;
```

### `resolveResourceTimelineEdits`

```ts
function resolveResourceTimelineEdits(projection: Pick<ResourceTimelineProjection, 'bars' | 'rows' | 'origins' | 'taskBarIds'>, edits: readonly TimelineEdit[]): ResourceTimelineEditsResolution | ResourceTimelineRejection;
```

### `resolveTimeRangeTargets`

```ts
function resolveTimeRangeTargets(index: ViewBindingIndex, barIds: Iterable<string>, options?: TimeRangeTargetsOptions): TimeRangeTargets;
```

### `resolveTimelineColumns`

```ts
function resolveTimelineColumns<C extends Pick<TimelineColumn, 'id' | 'width'>>(state: TimelineViewState, columns: readonly C[]): {
    columns: C[];
    diagnostics: TimelineViewDiagnostic[];
};
```

### `resolveTreeGridCell`

```ts
function resolveTreeGridCell<R extends TreeGridRow>(index: TreeGridIndex<R>, rowId: string, columnId: string): TreeGridCellView;
```

### `resolveViewTargets`

```ts
function resolveViewTargets(index: ViewBindingIndex, entities: Iterable<EntityRef>): ResolvedViewTargets;
```

### `resolveWindowedRequest`

```ts
function resolveWindowedRequest<T, L = never>(state: WindowedDataState<T, L>, requestId: string, response: readonly T[] | WindowedDataPage<T, L>): WindowedDataSettlement<T, L>;
```

### `resourceLoadFromMsProject`

```ts
function resourceLoadFromMsProject(project: MsProjectInput, options?: MsProjectResourceLoadOptions): MsProjectResourceLoad;
```

### `resourceLoadHistogram`

```ts
function resourceLoadHistogram(segments: readonly TimelineLoadSegment[], resourceIds?: Iterable<string>): Map<string, ResourceLoadHistogram>;
```

### `resourceTimelineBarId`

```ts
function resourceTimelineBarId(taskId: string, resourceId: string): string;
```

### `resourceTimelineCascade`

```ts
function resourceTimelineCascade(projection: Pick<ResourceTimelineProjection, 'bars' | 'origins' | 'taskBarIds'>, input: ScheduleInput): TimelineCascade;
```

### `restoreWeaveSnapshot`

```ts
function restoreWeaveSnapshot(snapshot: WeaveSnapshotV1, registry?: WeaveSnapshotRegistry): RestoreWeaveSnapshotResult;
```

### `retryWindowedData`

```ts
function retryWindowedData<T, L = never>(state: WindowedDataState<T, L>, window?: WindowedView): WindowedDataTransition<T, L>;
```

### `revealLinkedTarget`

```ts
function revealLinkedTarget(options: RevealLinkedTargetOptions): Promise<LinkedRevealResult>;
```

### `rollupEarnedValue`

```ts
function rollupEarnedValue(items: readonly EarnedValueAmounts[], options?: {
    eacMethod?: EarnedValueEacMethod;
}): EarnedValueMetrics;
```

### `routeGraphEdges`

```ts
function routeGraphEdges(layout: GraphLayout, edges: readonly GraphEdge[], nodes: ReadonlyMap<string, IdentifiedNode>, options?: GraphEdgeRouteOptions): GraphLayout;
```

### `routeGraphPorts`

```ts
function routeGraphPorts(layout: GraphLayout, nodes: ReadonlyMap<string, IdentifiedNode>, edges: readonly GraphEdge[], direction: GraphLayoutDirection, options?: GraphPortRouteOptions): GraphLayout;
```

### `scheduleTasks`

```ts
function scheduleTasks(input: ScheduleInput, options?: ScheduleOptions & {
    explain?: false;
}): ScheduleResult;
function scheduleTasks(input: ScheduleInput, options: ScheduleOptions & {
    explain: true;
}): ExplainedScheduleResult;
function scheduleTasks(input: ScheduleInput, options?: ScheduleOptions): ScheduleResult | ExplainedScheduleResult;
```

### `scheduleToGraph`

```ts
function scheduleToGraph(result: ScheduleSuccess, dependencies: readonly TimelineDependency[], options?: ScheduleGraphOptions): ScheduleGraph;
```

### `scheduledBarFields`

```ts
function scheduledBarFields(task: ScheduledTask): ScheduledBarFields;
```

### `searchGraphNodes`

```ts
function searchGraphNodes<N extends IdentifiedNode>(nodes: readonly N[], query: string, options?: GraphSearchOptions): N[];
```

### `serializeWeaveSnapshot`

```ts
function serializeWeaveSnapshot(input: WeaveSnapshotInput, options?: SerializeWeaveSnapshotOptions): string;
```

### `setWindowedView`

```ts
function setWindowedView<T, L = never>(state: WindowedDataState<T, L>, view: WindowedView | undefined, condition?: string): WindowedDataTransition<T, L>;
```

### `settleTransaction`

```ts
function settleTransaction<S>(state: TransactionCoreState<S>, operationId: string, epoch: number, result: SaveResult<S>, allowUncertain?: boolean): SettleResult<S>;
```

### `shiftEventCalendarDate`

```ts
function shiftEventCalendarDate(view: EventCalendarView, date: number, steps: number, options?: EventCalendarOptions): number;
```

### `shortestGraphPath`

```ts
function shortestGraphPath(nodes: readonly IdentifiedNode[], edges: readonly GraphEdge[], fromId: string, toId: string, options?: ShortestGraphPathOptions): GraphPathResult | null;
```

### `snapGraphPoint`

```ts
function snapGraphPoint(point: GraphPoint, grid: number): GraphPoint;
```

### `splitDanglingLinks`

```ts
function splitDanglingLinks<L extends {
    from: string;
    to: string;
}>(links: readonly L[], present: {
    has(id: string): boolean;
} | Iterable<string>, options?: SplitDanglingLinksOptions<L>): SplitDanglingLinks<L>;
function splitDanglingLinks<L>(links: readonly L[], present: {
    has(id: string): boolean;
} | Iterable<string>, options: Required<SplitDanglingLinksOptions<L>>): SplitDanglingLinks<L>;
```

### `summarizeTimelineRows`

```ts
function summarizeTimelineRows(tree: ReturnType<typeof createTimelineRowTree>, bars: readonly TimelineBar[]): Map<string, TimelineSummary>;
```

### `taskViewBindings`

```ts
function taskViewBindings(input: TaskViewBindingsInput): ViewBinding[];
```

### `timeBucketIndex`

```ts
function timeBucketIndex(buckets: readonly TimeRange[], time: number): number;
```

### `timeBucketIndexRange`

```ts
function timeBucketIndexRange(buckets: readonly TimeRange[], range: TimeRange): {
    start: number;
    end: number;
};
```

### `timeTicks`

```ts
function timeTicks(window: TimeRange, step: number, anchor?: number): number[];
```

### `timelineBarsInRange`

```ts
function timelineBarsInRange<B extends TimelineBarActivity>(bars: readonly B[], range: TimeRange, options?: TimelineBarsInRangeOptions): B[];
```

### `timelineBaseline`

```ts
function timelineBaseline(bar: Pick<TimelineBar, 'baseline' | 'baselines'>, id: string): TimeRange | undefined;
```

### `timelineBaselineId`

```ts
const timelineBaselineId = "$baseline";
```

### `timelineBaselineIds`

```ts
function timelineBaselineIds(bars: readonly Pick<TimelineBar, 'baseline' | 'baselines'>[]): string[];
```

### `timelineBaselineLimit`

```ts
const timelineBaselineLimit = 3;
```

### `timelineConstraintKinds`

```ts
const timelineConstraintKinds: readonly TimelineConstraintKind[];
```

### `timelineConstraintViolated`

```ts
function timelineConstraintViolated(range: TimeRange, kind: TimelineConstraintKind, time: number): boolean;
```

### `timelineConstraints`

```ts
function timelineConstraints(source: Readonly<TimelineConstraints> | undefined): TimelineConstraints | undefined;
```

### `timelineCsvTable`

```ts
function timelineCsvTable(rows: readonly TimelineRow[], bars: readonly TimelineBar[], options?: TimelineCsvOptions): CsvCell[][];
```

### `timelineFromCsvTable`

```ts
function timelineFromCsvTable(table: readonly (readonly CsvCell[])[], options: TimelineCsvImportOptions): TimelineCsvImport;
```

### `timelineFromICalendar`

```ts
function timelineFromICalendar(events: readonly ICalendarEvent[]): ICalendarTimeline;
```

### `timelineFromMsProject`

```ts
function timelineFromMsProject(project: MsProjectInput, options?: MsProjectTimelineOptions): MsProjectTimeline;
```

### `timelineLabelColumnId`

```ts
const timelineLabelColumnId = "$label";
```

### `timelineRowPosition`

```ts
function timelineRowPosition(rows: readonly TimelineRow[], id: string): TimelineRowPosition;
```

### `timelineWbsCodes`

```ts
function timelineWbsCodes(rows: readonly TimelineRow[]): Map<string, string>;
```

### `toCsv`

```ts
function toCsv(table: readonly (readonly CsvCell[])[], options?: CsvOptions): string;
```

### `toDrawio`

```ts
function toDrawio(graph: GraphInterchangeInput, options?: DrawioOptions): string;
```

### `toGraphMl`

```ts
function toGraphMl(graph: GraphInterchangeInput, options?: GraphMlOptions): string;
```

### `toICalendar`

```ts
function toICalendar(events: readonly ICalendarEvent[], options?: ICalendarOptions): string;
```

### `toMermaid`

```ts
function toMermaid(graph: GraphInterchangeInput, options?: MermaidOptions): string;
```

### `toMsProjectXml`

```ts
function toMsProjectXml(project: MsProjectInput, options?: MsProjectXmlOptions): string;
```

### `toPlanningDiagnostics`

```ts
function toPlanningDiagnostics(result: ScheduleResult | LevelResourcesResult, load?: readonly ResourceLoadSegment[]): PlanningDiagnostic[];
```

### `topologicalOrder`

```ts
function topologicalOrder(nodes: readonly IdentifiedNode[], edges: readonly GraphEdge[]): TopologicalOrderResult;
```

### `traverseGraph`

```ts
function traverseGraph<E extends GraphEdge = GraphEdge>(graph: {
    nodes: readonly {
        id: string;
    }[];
    edges: readonly E[];
}, startIds: Iterable<string>, options?: GraphTraversalOptions<E>): GraphTraversalResult;
```

### `treeGridCellContentFromTimeBucket`

```ts
function treeGridCellContentFromTimeBucket(cell: TimeBucketCell, extra?: Omit<TreeGridCellContent, 'value' | 'status'>): TreeGridCellContent;
```

### `treeGridCellText`

```ts
function treeGridCellText<R extends TreeGridRow>(index: TreeGridIndex<R>, rowId: string, columnId: string, options?: TreeGridTextOptions<R>): string;
```

### `treeGridCellValue`

```ts
function treeGridCellValue(index: TreeGridIndex<any>, rowId: string, columnId: string): FieldValue;
```

### `treeGridCellsFromTimeBuckets`

```ts
function treeGridCellsFromTimeBuckets(cells: readonly TimeBucketCell[]): TreeGridCell[];
```

### `treeGridColumnAt`

```ts
function treeGridColumnAt(offsets: readonly number[], x: number): number;
```

### `treeGridColumnOffsets`

```ts
function treeGridColumnOffsets(columns: readonly {
    id: string;
    width: number;
}[]): number[];
```

### `treeGridColumnWindow`

```ts
function treeGridColumnWindow(offsets: readonly number[], options: {
    scrollStart: number;
    viewport: number;
    overscan?: number;
}): TreeGridSpan;
```

### `treeGridDefaultLabels`

```ts
const treeGridDefaultLabels: Readonly<Required<TreeGridLabels>>;
```

### `treeGridDropAt`

```ts
function treeGridDropAt(index: TreeGridIndex<any>, flat: TreeGridLines<any>, id: string, line: number, fraction: number): TreeGridDrop | undefined;
```

### `treeGridFieldSpec`

```ts
function treeGridFieldSpec(column: TreeGridColumn<any>): TimelineFieldSpec<any> | undefined;
```

### `treeGridKeyAction`

```ts
function treeGridKeyAction(input: TreeGridKeyInput, at: TreeGridCursor, context: TreeGridKeyContext): TreeGridKeyAction | undefined;
```

### `treeGridPositionAt`

```ts
function treeGridPositionAt(index: TreeGridIndex<any>, flat: TreeGridLines<any>, cursor: TreeGridCursor): TreeGridPosition | undefined;
```

### `treeGridRangeBounds`

```ts
function treeGridRangeBounds(range: TreeGridRange): {
    top: number;
    bottom: number;
    left: number;
    right: number;
};
```

### `treeGridRangeText`

```ts
function treeGridRangeText(index: TreeGridIndex<any>, flat: TreeGridLines<any>, range: TreeGridRange): string;
```

### `treeGridRowCreate`

```ts
function treeGridRowCreate(rows: readonly TreeGridRow[], referenceId: string, placement: TreeGridRowCreate['placement'], source?: TreeGridRowCreate['source']): TreeGridRowCreate;
```

### `treeGridRowExpandable`

```ts
function treeGridRowExpandable(index: TreeGridIndex<any>, row: TreeGridRow): boolean;
```

### `treeGridRowMoveForKey`

```ts
function treeGridRowMoveForKey(input: TreeGridKeyInput, rows: readonly TreeGridRow[], id: string, rtl?: boolean): TimelineRowMove['after'] | undefined | 'ignore';
```

### `treeGridRowWindow`

```ts
function treeGridRowWindow(options: {
    scrollTop: number;
    viewport: number;
    rowHeight: number;
    count: number;
    overscan?: number;
}): TreeGridSpan;
```

### `useAsyncGraphLayout`

```ts
function useAsyncGraphLayout<N extends NetworkNode, E extends GraphEdge, G extends NetworkGroup = NetworkGroup>(options: UseAsyncGraphLayoutOptions<N, E, G>): AsyncGraphLayout<N, E, G>;
```

### `useEditHistory`

```ts
function useEditHistory<T>(initial: T, limit?: number): {
    state: import("vue").ComputedRef<T>;
    canUndo: import("vue").ComputedRef<boolean>;
    canRedo: import("vue").ComputedRef<boolean>;
    commit: (snapshot: T) => void;
    undo: () => void;
    redo: () => void;
    reset: (snapshot: T) => void;
    peekUndo: () => T | undefined;
    peekRedo: () => T | undefined;
    replaceCurrent: (snapshot: T) => void;
};
```

### `useEditTransaction`

```ts
function useEditTransaction<S, P>(options: UseEditTransactionOptions<S, P>): {
    acceptedState: import("vue").ComputedRef<S>;
    acceptedVersion: import("vue").ComputedRef<string>;
    candidateState: import("vue").ComputedRef<S | undefined>;
    status: import("vue").ComputedRef<import("../index.js").TransactionStatus>;
    pendingTransaction: import("vue").ComputedRef<{
        operationId: string;
        kind: "changes" | "restore";
        source: TransactionSource;
        baseVersion: string;
    } | undefined>;
    result: import("vue").ComputedRef<import("../index.js").TransactionFailure | undefined>;
    historyReset: ShallowRef<HistoryReset | undefined>;
    canUndo: import("vue").ComputedRef<boolean>;
    canRedo: import("vue").ComputedRef<boolean>;
    submit: (changes: readonly P[], submitOptions?: {
        source?: "pointer" | "keyboard" | "api";
    }) => Promise<TransactionOutcome<S>>;
    undo: () => Promise<TransactionOutcome<S>>;
    redo: () => Promise<TransactionOutcome<S>>;
    refresh: (state: S, version: string) => void;
    reconcile: (reconciled: SaveResult<S>) => TransactionOutcome<S>;
    clearResult: () => void;
};
```

### `useLinkedSelection`

```ts
function useLinkedSelection(options: UseLinkedSelectionOptions): {
    owner: import("vue").ComputedRef<"load" | "graph" | "timeline" | undefined>;
    selectedEntities: import("vue").ComputedRef<EntityRef[]>;
    selectionSource: import("vue").ComputedRef<string | undefined>;
    hoveredEntities: import("vue").ComputedRef<readonly EntityRef[]>;
    timeRange: import("vue").ComputedRef<TimeRangeTargets | undefined>;
    graph: import("vue").ComputedRef<LinkedGraphSets>;
    timeline: import("vue").ComputedRef<LinkedTimelineSets>;
    load: import("vue").ComputedRef<LinkedLoadSets>;
    select: (view: LinkedViewName, targets: readonly ViewTarget[]) => {
        changed: boolean;
        unknown: ViewTarget[];
    };
    selectEntities: (entities: Iterable<EntityRef>, selectOptions?: {
        source?: string;
    }) => {
        changed: boolean;
        unknown: EntityRef[];
    };
    clearSelection: () => boolean;
    hoverEnter: (view: LinkedViewName, target: ViewTarget) => void;
    hoverLeave: (view: LinkedViewName, target?: ViewTarget) => void;
};
```

### `useTimelineView`

```ts
function useTimelineView<R extends TimelineRow = TimelineRow, B extends TimelineBar = TimelineBar, D extends TimelineDependency = TimelineDependency>(source: MaybeRefOrGetter<TimelineViewInput<R, B, D>>, initial?: TimelineViewState): {
    state: ShallowRef<TimelineViewState>;
    projection: import("vue").ComputedRef<import("../index.js").TimelineViewProjection<R, B, D>>;
    columns: import("vue").ComputedRef<import("../index.js").TimelineColumn<R>[]>;
    diagnostics: import("vue").ComputedRef<import("../index.js").TimelineViewDiagnostic[]>;
    setSearch: (text: string, columnIds?: string[]) => void;
    setSort: (sort: readonly TimelineViewSort[]) => void;
    setFilters: (filters: readonly TimelineViewFilter[]) => void;
    setColumnVisible: (id: string, visible: boolean) => void;
    setColumnWidth: (id: string, width: number) => void;
    moveColumn: (id: string, index: number) => void;
    toggleCollapsed: (id: string, collapsed?: boolean) => void;
    setWindow: (window: TimeRange | undefined, zoom?: string) => void;
    restore: (json: unknown) => void;
    reset: () => void;
    snapshot: () => TimelineViewState;
};
```

### `useWindowedData`

```ts
function useWindowedData<T, L = never>(options: UseWindowedDataOptions<T, L>): WindowedData<T, L>;
```

### `validateCalendarEvents`

```ts
function validateCalendarEvents(events: readonly CalendarEvent[], resources?: readonly CalendarResource[]): void;
```

### `validateFieldValue`

```ts
function validateFieldValue(spec: TimelineFieldSpec<any>, value: FieldValue): FieldCheck;
```

### `validateGraphLayoutResponse`

```ts
function validateGraphLayoutResponse(request: GraphLayoutRequest, response: GraphLayoutResponse): GraphLayout;
```

### `validateInspectorList`

```ts
function validateInspectorList(field: InspectorListField<any>, rows: readonly InspectorAssignment[] | readonly InspectorDependency[]): FieldCheck;
```

### `validateTimelineData`

```ts
function validateTimelineData(rows: readonly TimelineRow[], bars: readonly TimelineBar[], dependencies?: readonly TimelineDependency[], laneCount?: number, options?: TimelineDataOptions): void;
```

### `visibleRows`

```ts
function visibleRows(scrollTop: number, bodyHeight: number, rowHeight: number, count: number, overscan?: number): {
    first: number;
    afterLast: number;
};
```

### `windowedCellStatus`

```ts
function windowedCellStatus<T, L>(state: WindowedDataState<T, L>, time: number, rowId?: string): WindowedCellStatus;
```

### `windowedCoverage`

```ts
function windowedCoverage<T, L>(state: WindowedDataState<T, L>, window?: WindowedView | undefined): WindowedCoverage;
```

### `workCalendarsFromMsProject`

```ts
function workCalendarsFromMsProject(project: {
    calendars?: readonly MsProjectCalendar[];
}, range: TimeRange): WorkCalendar[];
```

### Internal `EventCalendarSfc (dist/types/index.d.ts)`

```ts
type EventCalendarSfc<E extends CalendarEvent> = typeof EventCalendarVue<E>;
```

### Internal `GanttChartSfc (dist/types/index.d.ts)`

```ts
type GanttChartSfc<R extends TimelineRow, B extends TimelineBar> = typeof GanttChartVue<R, B>;
```

### Internal `GraphPaletteSfc (dist/types/index.d.ts)`

```ts
type GraphPaletteSfc<D> = typeof GraphPaletteVue<D>;
```

### Internal `InspectorListFieldBase (dist/types/core/diagramEditor.d.ts)`

```ts
interface InspectorListFieldBase {
    id: string;
    label: string;
    options: readonly InspectorOption[];
    readonly?: boolean;
    description?: string;
}
```

### Internal `NetworkGraphSfc (dist/types/index.d.ts)`

```ts
type NetworkGraphSfc<N extends NetworkNode, E extends GraphEdge, G extends NetworkGroup> = typeof NetworkGraphVue<N, E, G>;
```

### Internal `PropertyInspectorSfc (dist/types/index.d.ts)`

```ts
type PropertyInspectorSfc<T extends InspectorItem> = typeof PropertyInspectorVue<T>;
```

### Internal `RestoredBase (dist/types/core/snapshot.d.ts)`

```ts
interface RestoredBase {
    metadata?: SnapshotMetadata;
    libraryVersion?: string;
    extensions?: {
        [namespace: string]: unknown;
    };
}
```

### Internal `SfcContext (dist/types/index.d.ts)`

```ts
type SfcContext<F extends (...args: any) => any> = NonNullable<ReturnType<F>['__ctx']>;
```

### Internal `SfcDefaultComponent (dist/types/index.d.ts)`

```ts
type SfcDefaultComponent<F extends (...args: any) => any> = new (props: SfcContext<F>['props']) => InstanceType<DefineComponent<SfcContext<F>['props'], SfcExposed<F>>> & {
    $slots: SfcContext<F>['slots'];
};
```

### Internal `SfcExposed (dist/types/index.d.ts)`

```ts
type SfcExposed<F extends (...args: any) => any> = Parameters<SfcContext<F>['expose']>[0];
```

### Internal `SfcInstance (dist/types/index.d.ts)`

```ts
type SfcInstance<F extends (...args: any) => any> = Omit<ComponentPublicInstance, '$props' | '$slots' | '$emit'> & {
    $props: SfcContext<F>['props'];
    $slots: SfcContext<F>['slots'];
    $emit: SfcContext<F>['emit'];
} & SfcExposed<F>;
```

### Internal `Side (dist/types/core/graphObstacleRouting.d.ts)`

```ts
type Side = GraphPort['side'];
```

### Internal `SnapshotBase (dist/types/core/snapshot.d.ts)`

```ts
interface SnapshotBase {
    schemaVersion: 1;
    libraryVersion?: string;
    metadata?: SnapshotMetadata;
    extensions?: {
        readonly [namespace: string]: JsonValue;
    };
}
```

### Internal `TaskBoardSfc (dist/types/index.d.ts)`

```ts
type TaskBoardSfc<C extends TaskBoardCard> = typeof TaskBoardVue<C>;
```

### Internal `TreeGridSfc (dist/types/index.d.ts)`

```ts
type TreeGridSfc<R extends TreeGridRow> = typeof TreeGridVue<R>;
```
