import { computed, inject, provide, ref, shallowRef, type InjectionKey } from 'vue'
import {
  taskViewBindings, useEditTransaction, useLinkedSelection, type EntityRef, type SaveResult, type TransactionAdapter, type TransactionOutcome,
  type ViewBinding,
} from '../../src'
import { createTransactionStore } from '../adapters/transactionStore'
import { initialFlow, type Flow } from './approval'
import { calculatePlan, taskIds, type Plan, type Schedule, type TaskId } from './plan'
import { initialTasks, scheduleSheet, type Task } from './sheet'

// The whole app is one document on the (mock) server: the adopted production plan, the approval workflow and the
// schedule sheet. Every tab edits it through one useEditTransaction, so saving, conflicts and undo/redo are app-wide.
export interface ProductionDocument {
  plan: Plan
  approval: Flow
  sheet: readonly Task[]
}
// demo:save
/** One user action replaces the part of the document that its tab owns. */
export type ProductionChange =
  | { area: 'plan'; plan: Plan }
  | { area: 'approval'; flow: Flow }
  | { area: 'sheet'; tasks: readonly Task[] }

export const initialDocument: ProductionDocument = { plan: { strategy: 'original', starts: {} }, approval: initialFlow, sheet: initialTasks }

function createAdapter(save: TransactionAdapter<ProductionDocument, ProductionChange>['save']): TransactionAdapter<ProductionDocument, ProductionChange> {
  return {
    // The tabs check their edits with localized messages first; this is the last line of defence before saving.
    validate(_document, changes) {
      for (const change of changes) {
        if (change.area === 'plan' && !calculatePlan(change.plan)) return 'The plan cannot be scheduled.'
        if (change.area === 'sheet' && !scheduleSheet(change.tasks).ok) return 'The schedule sheet cannot be scheduled.'
      }
    },
    apply(document, changes) {
      let next = document
      for (const change of changes) {
        if (change.area === 'plan') next = { ...next, plan: change.plan }
        else if (change.area === 'approval') next = { ...next, approval: change.flow }
        else next = { ...next, sheet: change.tasks }
      }
      return next
    },
    save,
  }
}
// demo:end

// demo:link
// The planning operations and the steps of lot L-100 are the same production steps: the lot is prepared, cut on line A
// and line B, inspected and packed. Rework (a loop back to inspection) and overhead (a cost) have no operation.
export const lotStepOf: Record<TaskId, string> = { prep: 'lot', cutA: 'line-a', cutB: 'line-b', inspect: 'inspect', pack: 'pack' }
const operationOfStep = new Map(taskIds.map(id => [lotStepOf[id], id]))
/** The entity a lot flow step stands for. */
export const stepEntity = (stepId: string): EntityRef =>
  operationOfStep.has(stepId) ? { kind: 'operation', id: operationOfStep.get(stepId)! } : { kind: 'lot-step', id: stepId }
/** The lot flow step of an entity, if it has one. */
export const stepOf = (entity: EntityRef) =>
  entity.kind === 'operation' ? lotStepOf[entity.id as TaskId] : entity.kind === 'lot-step' ? entity.id : undefined

// The planning views show operations under their own IDs (graph node, bar, row and load); the lot flow graph shows
// them as its steps. Both graphs report as the `graph` view: a node ID of one names the same entity or nothing in the other.
function bindings(schedule: Schedule): ViewBinding[] {
  return [
    ...taskViewBindings({
      tasks: [...schedule.byId.values()], taskKind: 'operation',
      assignments: taskIds.map(taskId => ({ taskId, resourceId: schedule.resourceFor[taskId] })),
    }),
    ...taskIds.map((id): ViewBinding => ({ entity: { kind: 'operation', id }, target: { view: 'graph', kind: 'node', id: lotStepOf[id] } })),
    { entity: { kind: 'lot-step', id: 'rework' }, target: { view: 'graph', kind: 'node', id: 'rework' } },
  ]
}
// demo:end

/** A plan proposal of the planning tab: the plan and the operations it moved relative to the adopted plan. */
export interface PlanProposal { plan: Plan; changed: readonly TaskId[] }

export function createProductionWorkspace() {
  // In conflict mode another planner changes the trial run of the schedule sheet first, so the reload shows it. Like
  // any save, theirs must schedule: they lengthen the trial run by a day, or shorten it when it would no longer fit in
  // the project window, and change nothing when neither schedules.
  const server = createTransactionStore<ProductionDocument>(initialDocument, {
    delay: 200,
    remoteEdit: document => {
      const trial = document.sheet.find(item => item.id === 'trial')!
      for (const duration of [trial.duration + 1, trial.duration - 1]) {
        const sheet = document.sheet.map(item => item === trial ? { ...item, duration } : item)
        if (duration > 0 && scheduleSheet(sheet).ok) return { ...document, sheet }
      }
      return document
    },
  })
  const transaction = useEditTransaction<ProductionDocument, ProductionChange>({
    documentId: 'production', initialState: initialDocument, initialVersion: server.info.version,
    adapter: createAdapter((request, candidate) => server.save(request, candidate)),
  })
  /** What the tabs show: the candidate while it is being saved, else the accepted document. */
  const document = computed(() => transaction.candidateState.value ?? transaction.acceptedState.value)
  const saving = computed(() => transaction.status.value === 'saving')
  /** Set when the last submit found another save in progress. */
  const busy = ref(false)

  // The open plan proposal of the planning tab. It is not saved until it is adopted.
  const proposal = shallowRef<PlanProposal>()
  /** Set when a save adopted the open proposal and closed it. The planning tab clears it when it opens another. */
  const adoptionNotice = ref(false)
  const adopted = computed(() => calculatePlan(document.value.plan)!)
  const schedule = computed(() => proposal.value ? calculatePlan(proposal.value.plan)! : adopted.value)

  const linked = useLinkedSelection({ bindings: () => bindings(schedule.value) })
  linked.select('graph', [{ view: 'graph', kind: 'node', id: 'cutA' }])

  function track(outcome: Promise<TransactionOutcome<ProductionDocument>>) {
    return outcome.then(result => {
      busy.value = result.status === 'busy'
      return result
    })
  }
  function submit(change: ProductionChange, source?: 'pointer' | 'keyboard' | 'api') {
    return track(transaction.submit([change], { source }))
  }
  // Undo, redo and a reload replace the plan the proposal was based on, so they close it.
  function undo() {
    proposal.value = undefined
    return track(transaction.undo())
  }
  function redo() {
    proposal.value = undefined
    return track(transaction.redo())
  }
  function reload() {
    const latest = server.fetch()
    proposal.value = undefined
    unanswered = undefined
    transaction.refresh(latest.state, latest.version)
  }

  // demo:adopt
  // Adopting saves the open proposal through the app-wide transaction. A save settles either with its own answer or,
  // when that answer was lost, later through `reconcile`; both close the proposal that was saved, and only that one:
  // a proposal opened while the save was in flight stays open. The lost save is remembered by its operation ID.
  let unanswered: { operationId: string; proposal: PlanProposal } | undefined
  function closeAdopted(saved: PlanProposal) {
    if (proposal.value !== saved) return
    proposal.value = undefined
    adoptionNotice.value = true
  }
  async function adopt() {
    const saved = proposal.value
    if (!saved) return
    const outcome = await submit({ area: 'plan', plan: saved.plan })
    if (outcome.status === 'accepted') closeAdopted(saved)
    else if (outcome.status === 'uncertain') unanswered = { operationId: outcome.operationId, proposal: saved }
  }
  function reconcile() {
    const operationId = transaction.pendingTransaction.value?.operationId
    if (!operationId) return
    const stored: SaveResult<ProductionDocument> = server.lookup(operationId) ?? { status: 'rejected', operationId, code: 'not-applied' }
    const outcome = transaction.reconcile(stored)
    if (unanswered?.operationId !== operationId || outcome.status === 'uncertain') return
    const saved = unanswered.proposal
    unanswered = undefined
    if (outcome.status === 'accepted') closeAdopted(saved)
  }
  // demo:end
  function dismiss() {
    busy.value = false
    // A dismissed unknown result is never reconciled: adopting again is a new save, which the server checks afresh.
    if (transaction.status.value === 'uncertain') unanswered = undefined
    transaction.clearResult()
  }

  return {
    server, transaction, document, saving, busy, proposal, adoptionNotice, adopted, schedule, linked, submit, adopt, undo, redo, reload, reconcile, dismiss,
  }
}

export type ProductionWorkspace = ReturnType<typeof createProductionWorkspace>
const workspaceKey: InjectionKey<ProductionWorkspace> = Symbol('production-workspace')

export function provideProductionWorkspace() {
  const workspace = createProductionWorkspace()
  provide(workspaceKey, workspace)
  return workspace
}

export function useProductionWorkspace() {
  const workspace = inject(workspaceKey)
  if (!workspace) throw new Error('The production tabs need provideProductionWorkspace()')
  return workspace
}
