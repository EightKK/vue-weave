// A simulated, deterministic supply source for the period table demo: two sites with two items each, daily demand,
// and production and purchase orders whose quantities arrive when the order ends. Nothing goes over the network; the
// demo asks for events by time range and gets them after a short delay. The numbers are invented demo data.
import type { TimelineBar, TimelineRow } from '../../src'

export const hour = 3_600_000
export const day = 24 * hour
export const timeZone = 'Europe/Berlin'
/** Monday, 1 June 2026, local midnight in Berlin (CEST, UTC+2), for five weeks. */
export const planStart = Date.parse('2026-06-01T00:00:00+02:00')
export const planRange = { start: planStart, end: planStart + 35 * day }

export interface Item { id: string; siteId: string; label: string; opening: number; daily: number }
export const sites = [{ id: 'north', label: 'North plant' }, { id: 'south', label: 'South warehouse' }]
export const items: Item[] = [
  { id: 'bracket', siteId: 'north', label: 'Bracket', opening: 150, daily: 40 },
  { id: 'hinge', siteId: 'north', label: 'Hinge', opening: 100, daily: 20 },
  { id: 'panel', siteId: 'south', label: 'Panel', opening: 80, daily: 15 },
  { id: 'clip', siteId: 'south', label: 'Clip', opening: 300, daily: 50 },
]
/** Demand that differs from an item's daily rate, by item and day index from the plan start. */
const demandSpikes: Record<string, Record<number, number>> = { bracket: { 9: 160 } }

export interface SupplyOrder { id: string; itemId: string; rowId: string; quantity: number; start: number; end: number }
const at = (dayIndex: number, hourOfDay: number) => planStart + dayIndex * day + hourOfDay * hour
const order = (id: string, itemId: string, rowId: string, quantity: number, startDay: number, startHour: number, endDay: number): SupplyOrder =>
  ({ id, itemId, rowId, quantity, start: at(Math.max(0, startDay), startHour), end: at(endDay, 14) })
export const orders: SupplyOrder[] = [
  order('MO-101', 'bracket', 'north-line', 200, 1, 8, 3),
  order('MO-102', 'bracket', 'north-line', 300, 8, 8, 10),
  order('MO-103', 'bracket', 'north-line', 250, 15, 8, 17),
  order('MO-104', 'bracket', 'north-line', 200, 22, 8, 24),
  order('MO-105', 'bracket', 'north-line', 200, 28, 8, 30),
  ...[1, 8, 15, 22, 29].map((dayIndex, i) => order(`PO-20${i + 1}`, 'hinge', 'north-buy', 100, dayIndex - 3, 9, dayIndex)),
  ...[2, 16, 30].map((dayIndex, i) => order(`PO-30${i + 1}`, 'panel', 'south-buy', 150, dayIndex - 4, 9, dayIndex)),
  ...[7, 21].map((dayIndex, i) => order(`PO-40${i + 1}`, 'clip', 'south-buy', 500, dayIndex - 2, 9, dayIndex)),
]
export const orderRows: TimelineRow[] = [
  { id: 'north-line', label: 'North assembly line' },
  { id: 'north-buy', label: 'North purchasing' },
  { id: 'south-buy', label: 'South purchasing' },
]
const itemLabel = new Map(items.map(item => [item.id, item.label]))
export const orderBars: TimelineBar[] = orders.map(item => ({
  id: item.id, rowId: item.rowId, label: `${item.id} ${itemLabel.get(item.itemId)} ${item.quantity}`, start: item.start, end: item.end,
  tone: item.id.startsWith('MO') ? 'teal' : 'blue',
}))

/** A loaded event: demand shipped at 17:00 on a weekday, or the receipt of an order when it ends. */
export interface SupplyEvent { id: string; itemId: string; kind: 'demand' | 'receipt'; time: number; quantity: number; orderId?: string }

/** Every event in `[start, end)`. */
export function supplyEvents(start: number, end: number): SupplyEvent[] {
  const events: SupplyEvent[] = []
  const first = Math.max(0, Math.floor((start - planStart) / day)), last = Math.min(34, Math.ceil((end - planStart) / day))
  for (let dayIndex = first; dayIndex <= last; dayIndex++) {
    if (dayIndex % 7 >= 5) continue // Saturday and Sunday: no shipments
    const time = at(dayIndex, 17)
    if (time < start || time >= end) continue
    for (const item of items) {
      events.push({ id: `d:${item.id}:${dayIndex}`, itemId: item.id, kind: 'demand', time, quantity: demandSpikes[item.id]?.[dayIndex] ?? item.daily })
    }
  }
  for (const item of orders) {
    if (item.end >= start && item.end < end) {
      events.push({ id: 'r:' + item.id, itemId: item.itemId, kind: 'receipt', time: item.end, quantity: item.quantity, orderId: item.id })
    }
  }
  return events
}
