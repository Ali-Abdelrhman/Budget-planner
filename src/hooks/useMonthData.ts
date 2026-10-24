import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo } from 'react'
import { DEFAULT_SETTINGS } from '../db/seed'
import { db } from '../db/db'
import { buildMonthContext, buildTree, computeMonth, spendByCategory } from '../domain/allowance'
import { defaultOfficeDays, monthDays, shiftMonth, type MonthKey } from '../domain/calendar'
import type { MonthPlan } from '../domain/types'
import { useToday } from './useToday'

export function useSettings() {
  return useLiveQuery(() => db.settings.get('app'), []) ?? DEFAULT_SETTINGS
}

export function useCategories() {
  return useLiveQuery(() => db.categories.toArray(), [])
}

export function useMonthData(month: MonthKey) {
  const settings = useSettings()
  const categories = useCategories()
  const storedPlan = useLiveQuery(() => db.months.get(month), [month])
  const transactions = useLiveQuery(() => {
    const days = monthDays(month)
    return db.transactions.where('date').between(days[0], days[days.length - 1], true, true).toArray()
  }, [month])

  const today = useToday()

  return useMemo(() => {
    if (!categories || !transactions) return null
    const plan: MonthPlan = storedPlan ?? {
      month,
      officeDays: defaultOfficeDays(month, settings.defaultOfficeWeekdays),
      carryover: {},
      closed: false,
    }
    const tree = buildTree(categories)
    const ctx = buildMonthContext(month, plan.officeDays, settings.weekStartsOn, today)
    const balances = computeMonth(tree, ctx, transactions, plan)
    const spend = spendByCategory(ctx, transactions)
    return { settings, categories, tree, plan, ctx, balances, spend, transactions, today }
  }, [categories, transactions, storedPlan, settings, month, today])
}

export type MonthData = NonNullable<ReturnType<typeof useMonthData>>

/** Balances for the `count` months ending with `endMonth`, oldest first. */
export function useRecentMonths(endMonth: MonthKey, count: number) {
  const settings = useSettings()
  const categories = useCategories()
  const today = useToday()
  const first = shiftMonth(endMonth, -(count - 1))
  const plans = useLiveQuery(() => db.months.where('month').between(first, endMonth, true, true).toArray(), [first, endMonth])
  const transactions = useLiveQuery(() => {
    const last = monthDays(endMonth)
    return db.transactions.where('date').between(`${first}-01`, last[last.length - 1], true, true).toArray()
  }, [first, endMonth])

  return useMemo(() => {
    if (!categories || !plans || !transactions) return null
    const tree = buildTree(categories)
    return Array.from({ length: count }, (_, i) => {
      const month = shiftMonth(first, i)
      const stored = plans.find((p) => p.month === month)
      const officeDays = stored?.officeDays ?? defaultOfficeDays(month, settings.defaultOfficeWeekdays)
      const ctx = buildMonthContext(month, officeDays, settings.weekStartsOn, today)
      const txs = transactions.filter((t) => t.date.startsWith(month))
      const balances = computeMonth(tree, ctx, txs, stored ?? { carryover: {} })
      return { month, ctx, balances, used: Boolean(stored) || txs.length > 0 }
    })
  }, [categories, plans, transactions, settings, today, first, count])
}
