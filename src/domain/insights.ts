import { format } from 'date-fns'
import { dailyAllocations, type CategoryTree, type MonthBalances, type MonthContext } from './allowance'
import { fromISO } from './calendar'
import { round2 } from './money'
import type { Category, Transaction } from './types'

export interface PacePoint {
  day: number
  label: string
  spent: number | null
  pace: number
}

/** Cumulative spending against the cumulative allowance (the pace line), day by day. */
export function paceSeries(
  ctx: MonthContext,
  cats: Category[],
  spend: Map<string, number[]>,
  carryover: Record<string, number>,
  showFutureSpend: boolean,
): PacePoint[] {
  const allocs = cats.map((c) => dailyAllocations(c, ctx))
  let pace = cats.reduce((s, c) => s + (c.hasLimit ? carryover[c.id] ?? 0 : 0), 0)
  let spent = 0
  return ctx.days.map((d, i) => {
    for (const a of allocs) pace += a[i]
    for (const c of cats) spent += spend.get(c.id)?.[i] ?? 0
    return {
      day: i + 1,
      label: format(fromISO(d), 'd MMM'),
      spent: showFutureSpend || i <= ctx.todayIndex ? round2(spent) : null,
      pace: round2(pace),
    }
  })
}

export interface Slice {
  id: string
  name: string
  value: number
  color: string
}

export function groupShares(tree: CategoryTree, m: MonthBalances, includeOutside: boolean): Slice[] {
  return tree.groups
    .filter((g) => includeOutside || (tree.childrenOf.get(g.id) ?? [g]).some((c) => c.inAllowance))
    .map((g) => {
      const b = m.byGroup.get(g.id) ?? m.byCategory.get(g.id)
      return { id: g.id, name: g.name, value: b?.spentMonth ?? 0, color: g.color }
    })
    .filter((s) => s.value > 0)
}

export interface Bin {
  label: string
  from: number
  count: number
}

export function histogram(values: number[], binSize: number, minBins = 5): Bin[] {
  const max = Math.max(0, ...values)
  const binCount = Math.max(minBins, Math.floor(max / binSize) + 1)
  const bins: Bin[] = Array.from({ length: binCount }, (_, i) => ({
    label: `${i * binSize}-${(i + 1) * binSize}`,
    from: i * binSize,
    count: 0,
  }))
  for (const v of values) bins[Math.min(binCount - 1, Math.floor(v / binSize))].count++
  return bins
}

/** Total allowance spending per day, for days up to and including today. */
export function dailyTotals(ctx: MonthContext, cats: Category[], spend: Map<string, number[]>): number[] {
  const out: number[] = []
  for (let i = 0; i <= ctx.todayIndex; i++) {
    out.push(round2(cats.reduce((s, c) => s + (spend.get(c.id)?.[i] ?? 0), 0)))
  }
  return out
}

export function pickBinSize(values: number[]): number {
  const max = Math.max(0, ...values)
  if (max <= 100) return 10
  if (max <= 500) return 50
  if (max <= 1500) return 100
  return 250
}

/**
 * Axis maximum based on spending only. Allowance values are treated as outliers so a large
 * limit (like 2,400 for office days) does not flatten the spending into the floor of the chart.
 */
export function spendScale(spent: number[], floor = 100): number {
  const target = Math.max(floor, Math.max(0, ...spent) * 1.25)
  const mag = 10 ** Math.floor(Math.log10(target))
  for (const step of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) {
    if (step * mag >= target) return step * mag
  }
  return 10 * mag
}

export interface LimitRow {
  id: string
  name: string
  limit: number
  spent: number
  over: boolean
}

export function limitRows(tree: CategoryTree, m: MonthBalances): LimitRow[] {
  return tree.leaves
    .filter((c) => c.hasLimit)
    .map((c) => {
      const b = m.byCategory.get(c.id)!
      const limit = round2(b.budget + b.carryover)
      return { id: c.id, name: c.name, limit, spent: b.spentMonth, over: b.spentMonth > limit }
    })
}

export interface WeekRow {
  label: string
  allowance: number
  spent: number
}

export function weeklyRows(ctx: MonthContext, cats: Category[], spend: Map<string, number[]>): WeekRow[] {
  const allocs = cats.map((c) => dailyAllocations(c, ctx))
  let i = 0
  return ctx.weeks.map((week) => {
    let allowance = 0
    let spent = 0
    for (let j = 0; j < week.length; j++, i++) {
      for (const a of allocs) allowance += a[i]
      for (const c of cats) spent += spend.get(c.id)?.[i] ?? 0
    }
    const first = fromISO(week[0]).getDate()
    const last = fromISO(week[week.length - 1]).getDate()
    return { label: first === last ? `${first}` : `${first}-${last}`, allowance: round2(allowance), spent: round2(spent) }
  })
}

export function transactionSizes(txs: Transaction[], cats: Category[]): number[] {
  const ids = new Set(cats.map((c) => c.id))
  return txs.filter((t) => ids.has(t.categoryId)).map((t) => t.amount)
}
