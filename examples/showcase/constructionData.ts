import type { ResourceAssignment, ScheduleLink, ScheduleTask } from '../../src'

// Deterministic data of the construction program showcase: a nine-storey steel-frame office tower on a weekday
// calendar with public holidays and a winter shutdown. Times are midnight UTC in epoch milliseconds; durations are
// working days and lags elapsed days. Nothing here reads the clock.

export const day = 86_400_000
/** Midnight UTC of a calendar date. */
export const on = (year: number, month: number, date: number) => Date.UTC(year, month - 1, date)

export const range = { start: on(2026, 3, 2), end: on(2027, 5, 3) }
/** The status (data) date of the progress report: Monday 14 September 2026. */
export const statusDate = on(2026, 9, 14)
/** The contractual completion date, drawn as the handover deadline. */
export const contractCompletion = on(2027, 3, 31)

/** Closed civil dates: public holidays and the winter shutdown. */
export const holidays = [
  '2026-04-03', '2026-05-25', '2026-06-19', '2026-07-03', '2026-09-07', '2026-11-26', '2026-11-27',
  '2026-12-24', '2026-12-25', '2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31', '2027-01-01',
  '2027-01-18', '2027-02-15', '2027-05-31',
]

export type Phase = 'site' | 'sub' | 'super' | 'env' | 'mep' | 'fit' | 'comm'
export interface PhaseInfo { id: Phase; label: string; tone: 'teal' | 'blue' | 'violet' | 'amber' }
export const phases: PhaseInfo[] = [
  { id: 'site', label: 'Site preparation', tone: 'teal' },
  { id: 'sub', label: 'Substructure', tone: 'teal' },
  { id: 'super', label: 'Superstructure', tone: 'blue' },
  { id: 'env', label: 'Building envelope', tone: 'violet' },
  { id: 'mep', label: 'MEP services', tone: 'violet' },
  { id: 'fit', label: 'Fit-out', tone: 'blue' },
  { id: 'comm', label: 'Commissioning & handover', tone: 'amber' },
]

export interface ProgramTask {
  id: string
  phase: Phase
  label: string
  /** Working days; 0 is a milestone. */
  days: number
  /** Budget at completion in thousands of dollars. */
  budget: number
  /** Actual cost per unit of earned value: above 1 is over budget. */
  costRate?: number
  /** Requested start (Start No Earlier Than), for supplier slots and utility appointments. */
  notBefore?: number
  /** Leveling priority: lower values give way first when crews are short. */
  priority?: number
}

export const tasks: ProgramTask[] = [
  { id: 'ntp', phase: 'site', label: 'Notice to proceed', days: 0, budget: 0 },
  { id: 'mobilise', phase: 'site', label: 'Mobilise & hoarding', days: 10, budget: 420, costRate: 1.02 },
  { id: 'demolition', phase: 'site', label: 'Demolition & clearance', days: 14, budget: 680, costRate: 1.06 },
  { id: 'piling', phase: 'sub', label: 'Secant piling', days: 28, budget: 1900, costRate: 1.14 },
  { id: 'excavation', phase: 'sub', label: 'Bulk excavation', days: 22, budget: 1250, costRate: 1.09 },
  { id: 'caps', phase: 'sub', label: 'Pile caps & ground beams', days: 16, budget: 980, costRate: 1.05 },
  { id: 'slab', phase: 'sub', label: 'Basement slab & walls', days: 18, budget: 1340, costRate: 1.03 },
  { id: 'sub-done', phase: 'sub', label: 'Substructure complete', days: 0, budget: 0 },
  { id: 'core', phase: 'super', label: 'Concrete core (jump form)', days: 34, budget: 2100, costRate: 1.01 },
  { id: 'steel-1', phase: 'super', label: 'Steel package A · fab & deliver', days: 30, budget: 2600, costRate: 1, notBefore: on(2026, 6, 15) },
  { id: 'steel-2', phase: 'super', label: 'Steel package B · fab & deliver', days: 40, budget: 2900, notBefore: on(2026, 8, 3) },
  { id: 'l1', phase: 'super', label: 'Level 1 frame & deck', days: 9, budget: 520, costRate: 1.04 },
  { id: 'l2', phase: 'super', label: 'Level 2 frame & deck', days: 8, budget: 480, costRate: 1.03 },
  { id: 'l3', phase: 'super', label: 'Level 3 frame & deck', days: 8, budget: 480, costRate: 1.05 },
  { id: 'l4', phase: 'super', label: 'Level 4 frame & deck', days: 8, budget: 480, costRate: 1.02 },
  { id: 'l5', phase: 'super', label: 'Level 5 frame & deck', days: 8, budget: 480 },
  { id: 'l6', phase: 'super', label: 'Level 6 frame & deck', days: 8, budget: 480 },
  { id: 'l7', phase: 'super', label: 'Level 7 frame & deck', days: 8, budget: 480 },
  { id: 'l8', phase: 'super', label: 'Level 8 frame & deck', days: 8, budget: 480 },
  { id: 'roof', phase: 'super', label: 'Roof & plant deck', days: 10, budget: 640 },
  { id: 'topping', phase: 'super', label: 'Topping out', days: 0, budget: 0 },
  { id: 'facade-low', phase: 'env', label: 'Curtain wall L1–L4', days: 30, budget: 2400 },
  { id: 'facade-high', phase: 'env', label: 'Curtain wall L5–Roof', days: 30, budget: 2400 },
  { id: 'roofing', phase: 'env', label: 'Roofing & waterproofing', days: 14, budget: 560 },
  { id: 'watertight', phase: 'env', label: 'Building watertight', days: 0, budget: 0 },
  { id: 'power', phase: 'mep', label: 'Utility power connection', days: 6, budget: 310, notBefore: on(2027, 1, 11) },
  { id: 'mep-12', phase: 'mep', label: 'MEP rough-in L1–L2', days: 22, budget: 1150, costRate: 1.02 },
  { id: 'mep-34', phase: 'mep', label: 'MEP rough-in L3–L4', days: 22, budget: 1150 },
  { id: 'mep-56', phase: 'mep', label: 'MEP rough-in L5–L6', days: 22, budget: 1150 },
  { id: 'mep-78', phase: 'mep', label: 'MEP rough-in L7–L8', days: 22, budget: 1150 },
  { id: 'plant', phase: 'mep', label: 'Rooftop plant & risers', days: 24, budget: 1700 },
  { id: 'lifts', phase: 'mep', label: 'Lift installation', days: 40, budget: 1450 },
  { id: 'fit-12', phase: 'fit', label: 'Fit-out L1–L2', days: 24, budget: 1300 },
  { id: 'fit-34', phase: 'fit', label: 'Fit-out L3–L4', days: 24, budget: 1300 },
  { id: 'fit-56', phase: 'fit', label: 'Fit-out L5–L6', days: 24, budget: 1300 },
  { id: 'fit-78', phase: 'fit', label: 'Fit-out L7–L8', days: 24, budget: 1300 },
  { id: 'lobby', phase: 'fit', label: 'Lobby & public realm', days: 20, budget: 900, priority: -1 },
  { id: 'tc', phase: 'comm', label: 'Testing & commissioning', days: 18, budget: 820 },
  { id: 'fire', phase: 'comm', label: 'Fire & life-safety sign-off', days: 6, budget: 140 },
  { id: 'snag', phase: 'comm', label: 'Snagging & close-out', days: 10, budget: 260 },
  { id: 'handover', phase: 'comm', label: 'Practical completion', days: 0, budget: 0 },
]

/** The steel package whose delivery the what-if scenario delays. */
export const steelDeliveryId = 'steel-2'

const fs = (from: string, to: string, lagDays = 0): ScheduleLink =>
  ({ id: `${from}>${to}`, from, to, type: 'FS', ...(lagDays ? { lag: lagDays * day } : {}) })
const ss = (from: string, to: string, lagDays: number): ScheduleLink =>
  ({ id: `${from}>${to}`, from, to, type: 'SS', lag: lagDays * day })

export const dependencies: ScheduleLink[] = [
  fs('ntp', 'mobilise'), fs('mobilise', 'demolition'), fs('demolition', 'piling'),
  ss('piling', 'excavation', 21), fs('piling', 'caps'), fs('excavation', 'caps'), fs('caps', 'slab'), fs('slab', 'sub-done'),
  ss('slab', 'core', 14),
  fs('sub-done', 'l1'), fs('steel-1', 'l1'), ss('core', 'l1', 21),
  fs('l1', 'l2'), fs('l2', 'l3'), fs('l3', 'l4'), fs('l4', 'l5'), fs('steel-2', 'l5'),
  fs('l5', 'l6'), fs('l6', 'l7'), fs('l7', 'l8'), fs('l8', 'roof'), fs('roof', 'topping'),
  fs('l4', 'facade-low', 7), fs('facade-low', 'facade-high'), fs('l8', 'facade-high'), fs('roof', 'roofing'),
  fs('facade-high', 'watertight'), fs('roofing', 'watertight'),
  fs('l2', 'mep-12', 3), fs('l4', 'mep-34', 3), fs('l6', 'mep-56', 3), fs('l8', 'mep-78', 3),
  fs('roof', 'plant'), fs('core', 'lifts'),
  fs('mep-12', 'fit-12'), fs('facade-low', 'fit-12'), fs('mep-34', 'fit-34'), fs('facade-low', 'fit-34'),
  fs('mep-56', 'fit-56'), fs('mep-78', 'fit-78'), fs('watertight', 'fit-56'), fs('watertight', 'fit-78'),
  fs('watertight', 'lobby'),
  fs('power', 'tc'), fs('plant', 'tc'), fs('lifts', 'tc'), fs('fit-78', 'tc'), fs('fit-56', 'tc'), fs('fit-34', 'tc'), fs('fit-12', 'tc'),
  fs('tc', 'fire'), ss('tc', 'snag', 14), fs('lobby', 'snag'), fs('fire', 'handover'), fs('snag', 'handover'),
]

/** Progress reported at the status date, as a share of each task's work. Tasks not listed have not started. */
export const reportedProgress = new Map<string, number>([
  ['ntp', 1], ['mobilise', 1], ['demolition', 1], ['piling', 1], ['excavation', 1], ['caps', 1], ['slab', 1], ['sub-done', 1],
  ['core', 1], ['steel-1', 1], ['l1', 1], ['l2', 1], ['l3', 0.6], ['steel-2', 0.7], ['mep-12', 0.45], ['lifts', 0.3],
])

export type CrewId = 'civil' | 'concrete' | 'steel' | 'facade' | 'mep' | 'fitout'
export const crews: { id: CrewId; label: string; capacity: number }[] = [
  { id: 'civil', label: 'Civil & groundworks', capacity: 1 },
  { id: 'concrete', label: 'Concrete gang', capacity: 1 },
  { id: 'steel', label: 'Steel erectors', capacity: 1 },
  { id: 'facade', label: 'Facade installers', capacity: 1 },
  { id: 'mep', label: 'MEP trades', capacity: 2 },
  { id: 'fitout', label: 'Fit-out crews', capacity: 2 },
]
const crewOf: Record<string, CrewId> = {
  mobilise: 'civil', demolition: 'civil', excavation: 'civil', caps: 'concrete', slab: 'concrete',
  l1: 'steel', l2: 'steel', l3: 'steel', l4: 'steel', l5: 'steel', l6: 'steel', l7: 'steel', l8: 'steel', roof: 'steel',
  'facade-low': 'facade', 'facade-high': 'facade',
  'mep-12': 'mep', 'mep-34': 'mep', 'mep-56': 'mep', 'mep-78': 'mep', plant: 'mep',
  'fit-12': 'fitout', 'fit-34': 'fitout', 'fit-56': 'fitout', 'fit-78': 'fitout', lobby: 'fitout',
}
export const crewLabel = (id: string) => crews.find(crew => crew.id === crewOf[id])?.label
// The rooftop plant needs both MEP gangs at once.
export const assignments: ResourceAssignment[] = Object.entries(crewOf)
  .map(([taskId, resourceId]) => ({ resourceId, taskId, ...(taskId === 'plant' ? { units: 2 } : {}) }))

/** Scheduler tasks: one summary per phase and its subtasks, durations in working days. */
export function scheduleTasksOf(source: readonly ProgramTask[]): ScheduleTask[] {
  return [
    ...phases.map(phase => ({ id: phase.id, duration: 0 })),
    ...source.map(task => ({
      id: task.id, parentId: task.phase, duration: task.days * day,
      ...(task.notBefore === undefined ? {} : { startNoEarlierThan: task.notBefore }),
      ...(task.priority === undefined ? {} : { priority: task.priority }),
    })),
  ]
}

/** The baseline the owner signed off: the same logic before ground conditions slowed the piling and excavation. */
export const baselineDurations = new Map([['piling', 22], ['excavation', 18], ['steel-1', 26], ['caps', 14]])
