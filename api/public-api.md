# vue-weave public API baseline

Generated from the built package by `node scripts/api-baseline.mjs --update`; do not edit by hand. `npm run test:package`
fails when the built API differs. Review every change: in 1.x, a removed or changed export, prop, event, slot,
exposed member or CSS custom property is a breaking change. "Internal" declarations are not exported but appear
in public signatures, so changes to them can break consumers too.

## Entry `.`: runtime exports (198)

- `GanttChart: object`
- `NetworkGraph: object`
- `WeaveSnapshotError: function`
- `actualsTimelineBars: function`
- `applyGraphPositions: function`
- `applyGraphSizes: function`
- `applyTimelineConstraintEdit: function`
- `assignLanes: function`
- `assignmentWorkPeriods: function`
- `baselineVariance: function`
- `beginGraphExpansion: function`
- `beginTransaction: function`
- `buildGraphLayoutRequests: function`
- `buildPlacementInput: function`
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
- `countGraphCrossings: function`
- `createGraphConnectionChecker: function`
- `createGraphExpansion: function`
- `createResourceTimelineProjector: function`
- `createTimeScale: function`
- `createTimelineRowTree: function`
- `createTimelineViewState: function`
- `createTransactionState: function`
- `createWindowedDataState: function`
- `createWorkingTimeScale: function`
- `cullGraphElements: function`
- `defaultNonWorkingRatio: number`
- `defaultSvgExportTheme: object`
- `dependencyEndsForType: function`
- `dependencyPath: function`
- `dependencyTimes: function`
- `dependencyTypeForEnds: function`
- `detectGraphCommunities: function`
- `editTimeRange: function`
- `escapeXml: function`
- `fieldValuesEqual: function`
- `filterGraph: function`
- `findGraphCycles: function`
- `findOrthogonalRoute: function`
- `formatDependencyLag: function`
- `formatFieldValue: function`
- `fromICalendar: function`
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
- `graphPathBounds: function`
- `graphPathEndpoints: function`
- `graphPointInPolygon: function`
- `graphPolylinePath: function`
- `graphPortAnchor: function`
- `graphRectsIntersect: function`
- `graphSmoothPath: function`
- `graphSwimlaneAt: function`
- `graphViewportRect: function`
- `indentTimelineRow: function`
- `indexGraph: function`
- `intersectsWindow: function`
- `intlTimeFormatter: function`
- `invalidateWindowedData: function`
- `invertWorkPeriods: function`
- `isGraphRouteValid: function`
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
- `mergeGraphExpansionPage: function`
- `mirrorTimeScale: function`
- `moveTimeRanges: function`
- `moveTimelineRow: function`
- `normalizeWorkPeriods: function`
- `outdentTimelineRow: function`
- `parseCsv: function`
- `parseFieldValue: function`
- `parseGraphLayoutMessage: function`
- `parseTimelineViewState: function`
- `parseWeaveSnapshot: function`
- `planBaselines: function`
- `planComparisonTargets: function`
- `projectResourceTimeline: function`
- `projectTimelineView: function`
- `propagateEdit: function`
- `proposeResourceAssignment: function`
- `reconcileTimelineViewColumns: function`
- `refreshTransactionState: function`
- `rejectWindowedRequest: function`
- `removeGraphElements: function`
- `removeTimelineBars: function`
- `renderGraphSvg: function`
- `renderTimelineSvg: function`
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
- `resolveViewTargets: function`
- `resolveWindowedRequest: function`
- `resourceLoadFromMsProject: function`
- `resourceLoadHistogram: function`
- `resourceTimelineBarId: function`
- `resourceTimelineCascade: function`
- `restoreWeaveSnapshot: function`
- `retryWindowedData: function`
- `revealLinkedTarget: function`
- `routeGraphEdges: function`
- `routeGraphPorts: function`
- `scheduleTasks: function`
- `scheduleToGraph: function`
- `scheduledBarFields: function`
- `searchGraphNodes: function`
- `serializeWeaveSnapshot: function`
- `setWindowedView: function`
- `settleTransaction: function`
- `shortestGraphPath: function`
- `snapGraphPoint: function`
- `splitDanglingLinks: function`
- `summarizeTimelineRows: function`
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
- `toICalendar: function`
- `toMsProjectXml: function`
- `toPlanningDiagnostics: function`
- `topologicalOrder: function`
- `traverseGraph: function`
- `useAsyncGraphLayout: function`
- `useEditHistory: function`
- `useEditTransaction: function`
- `useLinkedSelection: function`
- `useTimelineView: function`
- `useWindowedData: function`
- `validateFieldValue: function`
- `validateGraphLayoutResponse: function`
- `validateTimelineData: function`
- `visibleRows: function`
- `windowedCellStatus: function`
- `windowedCoverage: function`
- `workCalendarsFromMsProject: function`

## Entry `.`: type-only exports (466)

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
- `CalendarBandLocalTime`
- `CalendarBandOptions`
- `CalendarBandUnit`
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
- `CsvParseOptions`
- `DanglingLink`
- `DependencyPathStyle`
- `EditMode`
- `EditTransaction`
- `EditValidator`
- `EntityRef`
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
- `GraphEdgeMarker`
- `GraphEdgeReshape`
- `GraphEdgeRouteOptions`
- `GraphEdgeStyle`
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
- `GraphNodeMatch`
- `GraphNodeMove`
- `GraphNodeResize`
- `GraphNodeSize`
- `GraphObstacleAvoidance`
- `GraphPageRankOptions`
- `GraphPageRankResult`
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
- `GraphSwimlaneSpec`
- `GraphTraversalDirection`
- `GraphTraversalOptions`
- `GraphTraversalResult`
- `GraphTreeLayoutOptions`
- `GraphViewTarget`
- `GraphViewport`
- `GraphVisibleIds`
- `HistoryReset`
- `ICalendarEvent`
- `ICalendarImport`
- `ICalendarImportEvent`
- `ICalendarImportOptions`
- `ICalendarImportWarning`
- `ICalendarImportWarningCode`
- `ICalendarOptions`
- `ICalendarTimeline`
- `IdentifiedNode`
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
- `NetworkFocusOptions`
- `NetworkGraphComponent`
- `NetworkGraphExposed`
- `NetworkGroup`
- `NetworkGroupSlot`
- `NetworkMinimapNodeSlot`
- `NetworkNode`
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
- `SvgExportOptions`
- `SvgExportTheme`
- `SvgExportThemeInput`
- `SvgToneColors`
- `TaskActuals`
- `TimeRange`
- `TimeRangeTargets`
- `TimeRangeTargetsOptions`
- `TimeScale`
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
- `TimelineSelectDetail`
- `TimelineSnapshotData`
- `TimelineSnapshotInput`
- `TimelineSnapshotV1`
- `TimelineSnapshotView`
- `TimelineSummary`
- `TimelineSvgOptions`
- `TimelineViewColumn`
- `TimelineViewDiagnostic`
- `TimelineViewDiagnosticCode`
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

## Entry `./core`: runtime exports (188)

- `WeaveSnapshotError: function`
- `actualsTimelineBars: function`
- `applyGraphPositions: function`
- `applyGraphSizes: function`
- `applyTimelineConstraintEdit: function`
- `assignLanes: function`
- `assignmentWorkPeriods: function`
- `baselineVariance: function`
- `beginGraphExpansion: function`
- `beginTransaction: function`
- `buildGraphLayoutRequests: function`
- `buildPlacementInput: function`
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
- `countGraphCrossings: function`
- `createGraphConnectionChecker: function`
- `createGraphExpansion: function`
- `createResourceTimelineProjector: function`
- `createTimeScale: function`
- `createTimelineRowTree: function`
- `createTimelineViewState: function`
- `createTransactionState: function`
- `createWindowedDataState: function`
- `createWorkingTimeScale: function`
- `cullGraphElements: function`
- `defaultNonWorkingRatio: number`
- `defaultSvgExportTheme: object`
- `dependencyEndsForType: function`
- `dependencyPath: function`
- `dependencyTimes: function`
- `dependencyTypeForEnds: function`
- `detectGraphCommunities: function`
- `editTimeRange: function`
- `escapeXml: function`
- `fieldValuesEqual: function`
- `filterGraph: function`
- `findGraphCycles: function`
- `findOrthogonalRoute: function`
- `formatDependencyLag: function`
- `formatFieldValue: function`
- `fromICalendar: function`
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
- `graphPathBounds: function`
- `graphPathEndpoints: function`
- `graphPointInPolygon: function`
- `graphPolylinePath: function`
- `graphPortAnchor: function`
- `graphRectsIntersect: function`
- `graphSmoothPath: function`
- `graphSwimlaneAt: function`
- `graphViewportRect: function`
- `indentTimelineRow: function`
- `indexGraph: function`
- `intersectsWindow: function`
- `intlTimeFormatter: function`
- `invalidateWindowedData: function`
- `invertWorkPeriods: function`
- `isGraphRouteValid: function`
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
- `mergeGraphExpansionPage: function`
- `mirrorTimeScale: function`
- `moveTimeRanges: function`
- `moveTimelineRow: function`
- `normalizeWorkPeriods: function`
- `outdentTimelineRow: function`
- `parseCsv: function`
- `parseFieldValue: function`
- `parseGraphLayoutMessage: function`
- `parseTimelineViewState: function`
- `parseWeaveSnapshot: function`
- `planBaselines: function`
- `planComparisonTargets: function`
- `projectResourceTimeline: function`
- `projectTimelineView: function`
- `propagateEdit: function`
- `proposeResourceAssignment: function`
- `reconcileTimelineViewColumns: function`
- `refreshTransactionState: function`
- `rejectWindowedRequest: function`
- `removeGraphElements: function`
- `removeTimelineBars: function`
- `renderGraphSvg: function`
- `renderTimelineSvg: function`
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
- `resolveViewTargets: function`
- `resolveWindowedRequest: function`
- `resourceLoadFromMsProject: function`
- `resourceLoadHistogram: function`
- `resourceTimelineBarId: function`
- `resourceTimelineCascade: function`
- `restoreWeaveSnapshot: function`
- `retryWindowedData: function`
- `routeGraphEdges: function`
- `routeGraphPorts: function`
- `scheduleTasks: function`
- `scheduleToGraph: function`
- `scheduledBarFields: function`
- `searchGraphNodes: function`
- `serializeWeaveSnapshot: function`
- `setWindowedView: function`
- `settleTransaction: function`
- `shortestGraphPath: function`
- `snapGraphPoint: function`
- `splitDanglingLinks: function`
- `summarizeTimelineRows: function`
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
- `toICalendar: function`
- `toMsProjectXml: function`
- `toPlanningDiagnostics: function`
- `topologicalOrder: function`
- `traverseGraph: function`
- `validateFieldValue: function`
- `validateGraphLayoutResponse: function`
- `validateTimelineData: function`
- `visibleRows: function`
- `windowedCellStatus: function`
- `windowedCoverage: function`
- `workCalendarsFromMsProject: function`

## Entry `./core`: type-only exports (437)

- `ActualsDiagnostic`
- `ActualsDiagnosticCode`
- `ActualsTask`
- `ActualsTaskState`
- `ActualsTimelineBarOptions`
- `AssignLanesOptions`
- `AssignLanesResult`
- `BarsDeleteValidator`
- `BatchEditValidator`
- `CalendarBandLocalTime`
- `CalendarBandOptions`
- `CalendarBandUnit`
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
- `CsvParseOptions`
- `DanglingLink`
- `DependencyPathStyle`
- `EditMode`
- `EditTransaction`
- `EditValidator`
- `EntityRef`
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
- `GraphEdgeMarker`
- `GraphEdgeReshape`
- `GraphEdgeRouteOptions`
- `GraphEdgeStyle`
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
- `GraphNodeMatch`
- `GraphNodeMove`
- `GraphNodeResize`
- `GraphNodeSize`
- `GraphObstacleAvoidance`
- `GraphPageRankOptions`
- `GraphPageRankResult`
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
- `GraphSwimlaneSpec`
- `GraphTraversalDirection`
- `GraphTraversalOptions`
- `GraphTraversalResult`
- `GraphTreeLayoutOptions`
- `GraphViewTarget`
- `GraphViewport`
- `GraphVisibleIds`
- `ICalendarEvent`
- `ICalendarImport`
- `ICalendarImportEvent`
- `ICalendarImportOptions`
- `ICalendarImportWarning`
- `ICalendarImportWarningCode`
- `ICalendarOptions`
- `ICalendarTimeline`
- `IdentifiedNode`
- `IntlTimeFormatterOptions`
- `JsonValue`
- `LevelResourcesInput`
- `LevelResourcesResult`
- `LevelResourcesSuccess`
- `LoadSegmentLike`
- `LoadViewTarget`
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
- `NetworkFocusOptions`
- `NetworkGroup`
- `NetworkGroupSlot`
- `NetworkMinimapNodeSlot`
- `NetworkNode`
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
- `SvgExportOptions`
- `SvgExportTheme`
- `SvgExportThemeInput`
- `SvgToneColors`
- `TaskActuals`
- `TimeRange`
- `TimeRangeTargets`
- `TimeRangeTargetsOptions`
- `TimeScale`
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
- `TimelineSelectDetail`
- `TimelineSnapshotData`
- `TimelineSnapshotInput`
- `TimelineSnapshotV1`
- `TimelineSnapshotView`
- `TimelineSummary`
- `TimelineSvgOptions`
- `TimelineViewColumn`
- `TimelineViewDiagnostic`
- `TimelineViewDiagnosticCode`
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
options?: GraphLayeredLayoutOptions;
parallelEdgeSpacing?: number;
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
visibleWindowDelay?: number;
wheelZoom?: boolean;
zoomPreset?: string;
zoomPresets?: readonly TimelineZoomPreset[];
```

## Component `GanttChart`: emits

```ts
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
(evt: "target-activate", event: ViewTargetEvent<ViewTarget>) => void
(evt: "target-enter", event: ViewTargetEvent<ViewTarget>) => void
(evt: "target-leave", event: ViewTargetEvent<ViewTarget>) => void
(evt: "update:collapsedIds", ids: Set<string>) => void
(evt: "update:selectedDependencyId", id: string) => void
(evt: "update:selectedIds", ids: Set<string>) => void
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
- `--vw-border`
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
- `--vw-violet-ink`
- `--vw-violet-line`
- `--vw-violet-pale`
- `--vw-violet-solid`

## CSS custom properties: read with var() but not defined in style.css

- `--vw-axis-width`
- `--vw-band-dash`
- `--vw-bar-highlight`
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
- `--vw-range-opacity`
- `--vw-row-depth`
- `--vw-toolbar-offset`

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
    rowMoveRejected?: string;
    statusDate?: string;
    resizeColumn?: string;
    columnResizeRejected?: string;
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

### `GraphEdgeMarker`

```ts
type GraphEdgeMarker = 'arrow' | 'open-arrow' | 'circle' | 'diamond' | 'bar' | 'none';
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
}
```

### `GraphEdgeStyle`

```ts
type GraphEdgeStyle = 'curve' | 'orthogonal' | 'straight';
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
}
```

### `GraphSwimlaneSpec`

```ts
interface GraphSwimlaneSpec {
    id: string;
    label?: string;
}
```

### `GraphTraversalDirection`

```ts
type GraphTraversalDirection = 'forward' | 'backward' | 'both';
```

### `GraphTraversalOptions`

```ts
interface GraphTraversalOptions {
    direction?: GraphTraversalDirection;
    maxHops?: number;
}
```

### `GraphTraversalResult`

```ts
interface GraphTraversalResult {
    nodeIds: string[];
    edgeIds: string[];
    unknownIds: string[];
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
}
```

### `ICalendarImportOptions`

```ts
interface ICalendarImportOptions {
    utcOffsetMinutes?: number;
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
    data?: D;
}
```

### `NetworkNodeShape`

```ts
type NetworkNodeShape = 'box' | 'rounded' | 'diamond' | 'ellipse' | 'hexagon';
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

### `TimelineSelectDetail`

```ts
interface TimelineSelectDetail {
    dragged: boolean;
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

### `applyGraphPositions`

```ts
function applyGraphPositions(layout: GraphLayout, edges: readonly GraphEdge[], positions: ReadonlyMap<string, GraphPoint>, direction?: GraphLayoutDirection): GraphLayout;
```

### `applyGraphSizes`

```ts
function applyGraphSizes(layout: GraphLayout, edges: readonly GraphEdge[], sizes: ReadonlyMap<string, GraphNodeSize>, direction?: GraphLayoutDirection): GraphLayout;
```

### `applyTimelineConstraintEdit`

```ts
function applyTimelineConstraintEdit<B extends TimelineBar>(bars: readonly B[], change: TimelineConstraintEdit): B[];
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
}, E extends GraphEdge>(state: GraphExpansionState<N, E>, ids: Iterable<string>): GraphExpansionState<N, E>;
```

### `beginTransaction`

```ts
function beginTransaction<S>(state: TransactionCoreState<S>, pending: Omit<PendingTransaction, 'epoch' | 'baseVersion'>, candidate: S): TransactionCoreState<S> | undefined;
```

### `buildGraphLayoutRequests`

```ts
function buildGraphLayoutRequests<N extends NetworkNode, E extends GraphEdge, G extends NetworkGroup = NetworkGroup>(input: GraphLayoutRequestInput<N, E, G>, requestId: string): GraphLayoutRequests<N, E, G>;
```

### `buildPlacementInput`

```ts
function buildPlacementInput<I extends PlacementInput>(input: I, placedTaskIds: Iterable<string>): PlacementResult<I>;
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
}, E extends GraphEdge>(state: GraphExpansionState<N, E>, ids: Iterable<string>): GraphExpansionState<N, E>;
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

### `createResourceTimelineProjector`

```ts
function createResourceTimelineProjector<D = unknown, R = unknown>(): (input: ResourceTimelineInput<D, R>, options?: ResourceTimelineOptions<D, R>) => ResourceTimelineProjection<D, R>;
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

### `editTimeRange`

```ts
function editTimeRange(range: TimeRange, mode: EditMode, delta: number, step: number, bounds: TimeRange, minDuration?: number): TimeRange;
```

### `escapeXml`

```ts
function escapeXml(value: string): string;
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

### `findGraphCycles`

```ts
function findGraphCycles(nodes: readonly IdentifiedNode[], edges: readonly GraphEdge[]): string[][];
```

### `findOrthogonalRoute`

```ts
function findOrthogonalRoute(from: GraphRouteEnd, to: GraphRouteEnd, obstacles: readonly GraphRect[], options?: GraphObstacleAvoidance): GraphPoint[] | undefined;
```

### `formatDependencyLag`

```ts
function formatDependencyLag(lag: number): string;
```

### `formatFieldValue`

```ts
function formatFieldValue(spec: TimelineFieldSpec<any>, value: FieldValue): string;
```

### `fromICalendar`

```ts
function fromICalendar(text: string, options?: ICalendarImportOptions): ICalendarImport;
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
}, E extends GraphEdge>(state: GraphExpansionState<N, E>): GraphExpansionView<N, E>;
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

### `graphViewportRect`

```ts
function graphViewportRect(camera: GraphViewport, size: {
    width: number;
    height: number;
}, overscan?: number): GraphRect;
```

### `indentTimelineRow`

```ts
function indentTimelineRow<R extends TimelineRow>(rows: readonly R[], id: string): R[];
```

### `indexGraph`

```ts
function indexGraph(nodes: readonly IdentifiedNode[], edges: readonly GraphEdge[]): GraphIndex;
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

### `mergeGraphExpansionPage`

```ts
function mergeGraphExpansionPage<N extends {
    id: string;
}, E extends GraphEdge>(state: GraphExpansionState<N, E>, page: GraphExpansionPage<N, E>, expandedIds?: Iterable<string>): GraphExpansionState<N, E>;
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

### `normalizeWorkPeriods`

```ts
function normalizeWorkPeriods(periods: readonly TimeRange[], range: TimeRange): TimeRange[];
```

### `outdentTimelineRow`

```ts
function outdentTimelineRow<R extends TimelineRow>(rows: readonly R[], id: string): R[];
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

### `parseTimelineViewState`

```ts
function parseTimelineViewState(value: unknown): TimelineViewState;
```

### `parseWeaveSnapshot`

```ts
function parseWeaveSnapshot(text: string, options?: ParseWeaveSnapshotOptions): ParseWeaveSnapshotResult;
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

### `projectTimelineView`

```ts
function projectTimelineView<R extends TimelineRow, B extends TimelineBar, D extends TimelineDependency = TimelineDependency>(input: TimelineViewInput<R, B, D>, state: TimelineViewState): TimelineViewProjection<R, B, D>;
```

### `propagateEdit`

```ts
function propagateEdit(input: ScheduleInput, edit: ScheduleEdit): PropagateEditResult;
```

### `proposeResourceAssignment`

```ts
function proposeResourceAssignment(state: ResourceAssignmentState, request: ResourceAssignmentRequest): ResourceAssignmentProposal;
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

### `renderGraphSvg`

```ts
function renderGraphSvg<N extends NetworkNode, E extends GraphEdge>(layout: GraphLayout, nodes: readonly N[], edges: readonly E[], options?: GraphSvgOptions<N, E>): string;
```

### `renderTimelineSvg`

```ts
function renderTimelineSvg<R extends TimelineRow, B extends TimelineBar>(rows: readonly R[], bars: readonly B[], dependencies: readonly TimelineDependency[], scale: TimeScale, options?: TimelineSvgOptions<R, B>): string;
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
function toCsv(table: readonly (readonly CsvCell[])[]): string;
```

### `toICalendar`

```ts
function toICalendar(events: readonly ICalendarEvent[], options?: ICalendarOptions): string;
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
function traverseGraph(graph: {
    nodes: readonly {
        id: string;
    }[];
    edges: readonly GraphEdge[];
}, startIds: Iterable<string>, options?: GraphTraversalOptions): GraphTraversalResult;
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
    hoveredEntities: import("vue").ComputedRef<readonly EntityRef[]>;
    timeRange: import("vue").ComputedRef<TimeRangeTargets | undefined>;
    graph: import("vue").ComputedRef<LinkedGraphSets>;
    timeline: import("vue").ComputedRef<LinkedTimelineSets>;
    load: import("vue").ComputedRef<LinkedLoadSets>;
    select: (view: LinkedViewName, targets: readonly ViewTarget[]) => {
        changed: boolean;
        unknown: ViewTarget[];
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

### `validateFieldValue`

```ts
function validateFieldValue(spec: TimelineFieldSpec<any>, value: FieldValue): FieldCheck;
```

### `validateGraphLayoutResponse`

```ts
function validateGraphLayoutResponse(request: GraphLayoutRequest, response: GraphLayoutResponse): GraphLayout;
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

### Internal `GanttChartSfc (dist/types/index.d.ts)`

```ts
type GanttChartSfc<R extends TimelineRow, B extends TimelineBar> = typeof GanttChartVue<R, B>;
```

### Internal `NetworkGraphSfc (dist/types/index.d.ts)`

```ts
type NetworkGraphSfc<N extends NetworkNode, E extends GraphEdge, G extends NetworkGroup> = typeof NetworkGraphVue<N, E, G>;
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
