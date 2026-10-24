import { format } from 'date-fns'
import { dailyAllocations, forecastMonthEnd, type CategoryTree, type MonthBalances, type MonthContext } from './allowance'
import { fromISO, monthStart, type MonthKey } from './calendar'
import { round2 } from './money'
import type { Category } from './types'

export const isBill = (c: Category) => c.pacing === 'monthly'

export interface PacePoint {
  day: number
  label: string
  spent: number | null
  pace: number
  forecast: number | null
}

/** Cumulative spending against cumulative allowance released, plus a forecast to month end at the current rate. */
export function paceSeries(
  ctx: MonthContext,
  cats: Category[],
  spend: Map<string, number[]>,
  carryover: Record<string, number>,
): PacePoint[] {
  const allocs = cats.map((c) => dailyAllocations(c, ctx))
  const carry = cats.reduce((s, c) => s + (c.hasLimit ? carryover[c.id] ?? 0 : 0), 0)
  const released: number[] = []
  const spentCum: number[] = []
  let r = 0
  let sp = 0
  ctx.days.forEach((_, i) => {
    for (const a of allocs) r += a[i]
    for (const c of cats) sp += spend.get(c.id)?.[i] ?? 0
    released.push(r)
    spentCum.push(sp)
  })
  const t = ctx.todayIndex
  const rate = released[t] > 0 ? spentCum[t] / released[t] : 0
  return ctx.days.map((d, i) => {
    const showSpent = ctx.phase === 'past' || (ctx.phase === 'current' && i <= t)
    const forecast = ctx.phase === 'current' && i >= t ? spentCum[t] + (released[i] - released[t]) * rate : null
    return {
      day: i + 1,
      label: format(fromISO(d), 'EEE d MMM'),
      spent: showSpent ? round2(spentCum[i]) : null,
      pace: round2(released[i] + carry),
      forecast: forecast === null ? null : round2(forecast),
    }
  })
}

export interface UsageRow {
  id: string
  name: string
  color: string
  spent: number
  limit: number
  pct: number
  /** Share of the limit that should be used by today, null for bills and finished months. */
  expectedPct: number | null
}

export function budgetUsage(tree: CategoryTree, m: MonthBalances, ctx: MonthContext): UsageRow[] {
  return tree.leaves
    .filter((c) => c.hasLimit && c.inAllowance)
    .map((c) => {
      const b = m.byCategory.get(c.id)!
      const limit = round2(b.budget + b.carryover)
      const pct = limit > 0 ? (b.spentMonth / limit) * 100 : b.spentMonth > 0 ? 100 : 0
      const expected = ctx.phase === 'current' && !isBill(c) && limit > 0 ? Math.min(100, (b.releasedToDate / limit) * 100) : null
      return { id: c.id, name: c.name, color: c.color, spent: b.spentMonth, limit, pct: round2(pct), expectedPct: expected === null ? null : round2(expected) }
    })
    .sort((a, b) => Number(a.expectedPct === null && ctx.phase === 'current') - Number(b.expectedPct === null && ctx.phase === 'current') || b.pct - a.pct || b.spent - a.spent)
}

export type DayStack = { day: number; label: string; allowance: number } & Record<string, number | string | null>

/** Spending per day stacked by group, with the allowance released that day. Bills can be left out. */
export function dailyStacked(ctx: MonthContext, tree: CategoryTree, spend: Map<string, number[]>, includeBills: boolean): DayStack[] {
  const groups = tree.groups
    .map((g) => ({ g, kids: (tree.childrenOf.get(g.id) ?? [g]).filter((c) => c.inAllowance && (includeBills || !isBill(c))) }))
    .filter((x) => x.kids.length > 0)
  const limited = groups.flatMap((x) => x.kids).filter((c) => c.hasLimit)
  const allocs = limited.map((c) => dailyAllocations(c, ctx))
  return ctx.days.map((d, i) => {
    const row: DayStack = { day: i + 1, label: format(fromISO(d), 'EEE d MMM'), allowance: round2(allocs.reduce((s, a) => s + a[i], 0)) }
    for (const { g, kids } of groups) {
      const v = kids.reduce((s, c) => s + (spend.get(c.id)?.[i] ?? 0), 0)
      row[g.id] = v > 0 ? round2(v) : null
    }
    return row
  })
}

export function stackGroups(tree: CategoryTree, includeBills: boolean): Category[] {
  return tree.groups.filter((g) => (tree.childrenOf.get(g.id) ?? [g]).some((c) => c.inAllowance && (includeBills || !isBill(c))))
}

export interface ForecastRow {
  id: string
  name: string
  forecast: number
  limit: number
  spent: number
}

export function forecastRows(tree: CategoryTree, m: MonthBalances, ctx: MonthContext, spend: Map<string, number[]>): ForecastRow[] {
  const zero = new Array<number>(ctx.days.length).fill(0)
  return tree.leaves
    .filter((c) => c.hasLimit && c.inAllowance && !isBill(c))
    .map((c) => {
      const b = m.byCategory.get(c.id)!
      return { id: c.id, name: c.name, forecast: forecastMonthEnd(c, ctx, spend.get(c.id) ?? zero) ?? 0, limit: round2(b.budget + b.carryover), spent: b.spentMonth }
    })
    .sort((a, b) => b.forecast - b.limit - (a.forecast - a.limit))
}

export interface Slice {
  id: string
  name: string
  value: number
  color: string
  opacity: number
}

export function shares(tree: CategoryTree, m: MonthBalances, includeOutside: boolean, level: 'group' | 'category'): Slice[] {
  const out: Slice[] = []
  for (const g of tree.groups) {
    const kids = (tree.childrenOf.get(g.id) ?? [g]).filter((c) => includeOutside || c.inAllowance)
    if (!kids.length) continue
    if (level === 'group') {
      const value = kids.reduce((s, c) => s + (m.byCategory.get(c.id)?.spentMonth ?? 0), 0)
      if (value > 0) out.push({ id: g.id, name: g.name, value: round2(value), color: g.color, opacity: 1 })
      continue
    }
    const withSpend = kids
      .map((c) => ({ c, value: m.byCategory.get(c.id)?.spentMonth ?? 0 }))
      .filter((x) => x.value > 0)
      .sort((a, b) => b.value - a.value)
    withSpend.forEach(({ c, value }, i) => out.push({ id: c.id, name: c.name, value: round2(value), color: g.color, opacity: Math.max(0.35, 1 - i * 0.18) }))
  }
  return out
}

export interface MonthTrendRow {
  month: MonthKey
  label: string
  inside: number
  outside: number
  allowance: number
}

export function monthTrend(months: { month: MonthKey; balances: MonthBalances; used: boolean }[]): MonthTrendRow[] {
  const firstUsed = months.findIndex((m) => m.used)
  if (firstUsed === -1) return []
  return months.slice(firstUsed).map(({ month, balances }) => ({
    month,
    label: format(monthStart(month), 'MMM'),
    inside: balances.allowance.spentMonth,
    outside: balances.outside.spentMonth,
    allowance: round2(balances.allowance.budget + balances.allowance.carryover),
  }))
}
