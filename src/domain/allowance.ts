import { monthDays, weeksOfMonth, type ISODate, type MonthKey, type Weekday } from './calendar'
import { round2 } from './money'
import type { Category, DayRule, MonthPlan, Transaction } from './types'

export interface MonthContext {
  month: MonthKey
  days: ISODate[]
  officeDays: Set<ISODate>
  weeks: ISODate[][]
  /** Index into `days` for the day treated as "today". Clamped to the month. */
  todayIndex: number
  phase: 'past' | 'current' | 'future'
}

export function buildMonthContext(
  month: MonthKey,
  officeDays: ISODate[],
  weekStartsOn: Weekday,
  today: ISODate,
): MonthContext {
  const days = monthDays(month)
  let todayIndex = days.indexOf(today)
  const phase = todayIndex !== -1 ? 'current' : today < days[0] ? 'future' : 'past'
  if (todayIndex === -1) todayIndex = phase === 'future' ? 0 : days.length - 1
  return { month, days, officeDays: new Set(officeDays), weeks: weeksOfMonth(month, weekStartsOn), todayIndex, phase }
}

export function matchesRule(day: ISODate, rule: DayRule, officeDays: Set<ISODate>): boolean {
  if (rule === 'office') return officeDays.has(day)
  if (rule === 'nonOffice') return !officeDays.has(day)
  return true
}

export function matchingDayCount(cat: Pick<Category, 'dayRule'>, ctx: MonthContext): number {
  return ctx.days.filter((d) => matchesRule(d, cat.dayRule, ctx.officeDays)).length
}

export function monthlyBudget(cat: Category, ctx: MonthContext): number {
  if (cat.budgetMode === 'perDay') return round2(cat.amount * matchingDayCount(cat, ctx))
  return cat.amount
}

/** How much of the month's budget becomes available on each day of the month. */
export function dailyAllocations(cat: Category, ctx: MonthContext): number[] {
  const n = ctx.days.length
  const alloc = new Array<number>(n).fill(0)
  if (!cat.hasLimit) return alloc
  const budget = monthlyBudget(cat, ctx)

  if (cat.pacing === 'monthly') {
    alloc[0] = budget
    return alloc
  }

  const matching = ctx.days.map((d) => matchesRule(d, cat.dayRule, ctx.officeDays))
  const count = matching.filter(Boolean).length
  if (count === 0) {
    alloc[0] = budget
    return alloc
  }
  const perDay = budget / count

  if (cat.pacing === 'daily') {
    matching.forEach((m, i) => {
      if (m) alloc[i] = perDay
    })
    return alloc
  }

  // weekly: each week's share is released on the first day of that week
  let i = 0
  for (const week of ctx.weeks) {
    const weekMatches = week.filter((_, j) => matching[i + j]).length
    alloc[i] = perDay * weekMatches
    i += week.length
  }
  return alloc
}

export type Status = 'ok' | 'warn' | 'over' | 'none'

export interface Balance {
  budget: number
  carryover: number
  spentMonth: number
  spentWeek: number
  spentToday: number
  /** Budget released so far this month (through today), plus carryover. */
  releasedToDate: number
  monthLeft: number
  weekLeft: number
  todayLeft: number
  status: Status
}

export function weekIndexOf(ctx: MonthContext, dayIndex: number): number {
  let i = 0
  for (let w = 0; w < ctx.weeks.length; w++) {
    i += ctx.weeks[w].length
    if (dayIndex < i) return w
  }
  return ctx.weeks.length - 1
}

function weekBounds(ctx: MonthContext, week: number): [number, number] {
  let start = 0
  for (let w = 0; w < week; w++) start += ctx.weeks[w].length
  return [start, start + ctx.weeks[week].length - 1]
}

const sum = (xs: number[], from = 0, to = xs.length - 1) => {
  let s = 0
  for (let i = from; i <= to; i++) s += xs[i] ?? 0
  return s
}

export function statusOf(spent: number, available: number, hasLimit: boolean): Status {
  if (!hasLimit) return 'none'
  if (spent > available + 0.004) return 'over'
  if (available <= 0) return spent > 0 ? 'over' : 'ok'
  return spent / available >= 0.8 ? 'warn' : 'ok'
}

/**
 * Rollover rule: unspent allowance carries into following days and weeks within the month,
 * and overspending reduces them. "Today left" = everything released through today minus everything spent through today.
 */
export function computeBalance(cat: Category, ctx: MonthContext, spendByDay: number[], carryover = 0): Balance {
  const t = ctx.todayIndex
  const budget = monthlyBudget(cat, ctx)
  const carry = cat.hasLimit ? carryover : 0
  const alloc = dailyAllocations(cat, ctx)
  const [, weekEnd] = weekBounds(ctx, weekIndexOf(ctx, t))
  const [weekStart] = weekBounds(ctx, weekIndexOf(ctx, t))

  const spentMonth = sum(spendByDay)
  const spentThrough = sum(spendByDay, 0, t)
  const spentWeek = sum(spendByDay, weekStart, t)
  const spentToday = spendByDay[t] ?? 0

  const releasedToDate = sum(alloc, 0, t) + carry
  const releasedThroughWeek = sum(alloc, 0, weekEnd) + carry

  const monthLeft = budget + carry - spentMonth
  const weekLeft = releasedThroughWeek - spentThrough
  const todayLeft = releasedToDate - spentThrough

  return {
    budget,
    carryover: carry,
    spentMonth: round2(spentMonth),
    spentWeek: round2(spentWeek),
    spentToday: round2(spentToday),
    releasedToDate: round2(releasedToDate),
    monthLeft: round2(monthLeft),
    weekLeft: round2(weekLeft),
    todayLeft: round2(todayLeft),
    status: statusOf(spentMonth, budget + carry, cat.hasLimit),
  }
}

export function emptyBalance(): Balance {
  return {
    budget: 0,
    carryover: 0,
    spentMonth: 0,
    spentWeek: 0,
    spentToday: 0,
    releasedToDate: 0,
    monthLeft: 0,
    weekLeft: 0,
    todayLeft: 0,
    status: 'none',
  }
}

export function sumBalances(items: Balance[], hasLimit: boolean): Balance {
  const total = emptyBalance()
  for (const b of items) {
    total.budget += b.budget
    total.carryover += b.carryover
    total.spentMonth += b.spentMonth
    total.spentWeek += b.spentWeek
    total.spentToday += b.spentToday
    total.releasedToDate += b.releasedToDate
    total.monthLeft += b.monthLeft
    total.weekLeft += b.weekLeft
    total.todayLeft += b.todayLeft
  }
  for (const k of Object.keys(total) as (keyof Balance)[]) {
    if (k !== 'status') (total[k] as number) = round2(total[k] as number)
  }
  total.status = statusOf(total.spentMonth, total.budget + total.carryover, hasLimit)
  return total
}

/** Spending per day of the month, keyed by category id. */
export function spendByCategory(ctx: MonthContext, txs: Transaction[]): Map<string, number[]> {
  const index = new Map(ctx.days.map((d, i) => [d, i]))
  const out = new Map<string, number[]>()
  for (const tx of txs) {
    const i = index.get(tx.date)
    if (i === undefined) continue
    let row = out.get(tx.categoryId)
    if (!row) {
      row = new Array<number>(ctx.days.length).fill(0)
      out.set(tx.categoryId, row)
    }
    row[i] += tx.amount
  }
  return out
}

export interface CategoryTree {
  groups: Category[]
  childrenOf: Map<string, Category[]>
  leaves: Category[]
}

export function buildTree(all: Category[]): CategoryTree {
  const active = all.filter((c) => !c.archived).sort((a, b) => a.order - b.order)
  const childrenOf = new Map<string, Category[]>()
  for (const c of active) {
    if (c.parentId) {
      const list = childrenOf.get(c.parentId) ?? []
      list.push(c)
      childrenOf.set(c.parentId, list)
    }
  }
  const groups = active.filter((c) => c.parentId === null)
  const leaves = active.filter((c) => !childrenOf.has(c.id))
  return { groups, childrenOf, leaves }
}

/** Total allowance: sum of monthly budgets of every leaf category inside the allowance. */
export function totalAllowance(tree: CategoryTree, ctx: MonthContext): number {
  return round2(tree.leaves.filter((c) => c.inAllowance).reduce((s, c) => s + monthlyBudget(c, ctx), 0))
}

export interface MonthBalances {
  byCategory: Map<string, Balance>
  byGroup: Map<string, Balance>
  allowance: Balance
  outside: Balance
}

export function computeMonth(
  tree: CategoryTree,
  ctx: MonthContext,
  txs: Transaction[],
  plan: Pick<MonthPlan, 'carryover'>,
): MonthBalances {
  const spend = spendByCategory(ctx, txs)
  const zero = new Array<number>(ctx.days.length).fill(0)
  const byCategory = new Map<string, Balance>()
  for (const leaf of tree.leaves) {
    byCategory.set(leaf.id, computeBalance(leaf, ctx, spend.get(leaf.id) ?? zero, plan.carryover[leaf.id] ?? 0))
  }
  const byGroup = new Map<string, Balance>()
  for (const g of tree.groups) {
    const kids = tree.childrenOf.get(g.id)
    if (!kids) continue
    byGroup.set(
      g.id,
      sumBalances(
        kids.map((k) => byCategory.get(k.id)!),
        kids.some((k) => k.hasLimit),
      ),
    )
  }
  const inside = tree.leaves.filter((c) => c.inAllowance)
  const outside = tree.leaves.filter((c) => !c.inAllowance)
  return {
    byCategory,
    byGroup,
    allowance: sumBalances(
      inside.map((c) => byCategory.get(c.id)!),
      true,
    ),
    outside: sumBalances(
      outside.map((c) => byCategory.get(c.id)!),
      false,
    ),
  }
}

export interface LedgerDay {
  index: number
  day: ISODate
  /** Allowance released on this day across the limited categories. */
  alloc: number
  /** Everything spent on this day across the given categories. */
  spent: number
  /** Balance left after this day for the limited categories, null when none have a limit. */
  balanceAfter: number | null
}

/** One row per elapsed day of the month: what was released, what was spent, and the running balance. */
export function dayLedger(
  cats: Category[],
  ctx: MonthContext,
  spend: Map<string, number[]>,
  carryover: Record<string, number>,
): LedgerDay[] {
  if (ctx.phase === 'future') return []
  const limited = cats.filter((c) => c.hasLimit)
  const allocs = limited.map((c) => dailyAllocations(c, ctx))
  let balance = limited.reduce((s, c) => s + (carryover[c.id] ?? 0), 0)
  const rows: LedgerDay[] = []
  for (let i = 0; i <= ctx.todayIndex; i++) {
    const alloc = allocs.reduce((s, a) => s + a[i], 0)
    const spent = cats.reduce((s, c) => s + (spend.get(c.id)?.[i] ?? 0), 0)
    const spentLimited = limited.reduce((s, c) => s + (spend.get(c.id)?.[i] ?? 0), 0)
    balance += alloc - spentLimited
    rows.push({
      index: i,
      day: ctx.days[i],
      alloc: round2(alloc),
      spent: round2(spent),
      balanceAfter: limited.length ? round2(balance) : null,
    })
  }
  return rows
}

/**
 * Expected spending by month end at the current rate: spent so far divided by allowance released so far,
 * applied to the full budget. Only meaningful for daily and weekly categories.
 */
export function forecastMonthEnd(cat: Category, ctx: MonthContext, spendRow: number[]): number | null {
  if (!cat.hasLimit || cat.pacing === 'monthly') return null
  const t = ctx.todayIndex
  const spentSoFar = sum(spendRow, 0, t)
  if (ctx.phase === 'past') return round2(sum(spendRow))
  if (ctx.phase === 'future') return 0
  const released = sum(dailyAllocations(cat, ctx), 0, t)
  const budget = monthlyBudget(cat, ctx)
  if (released <= 0) return round2(spentSoFar)
  return round2(Math.max(spentSoFar, (spentSoFar / released) * budget))
}
