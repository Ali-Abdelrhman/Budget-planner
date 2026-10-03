import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo } from 'react'
import { DEFAULT_SETTINGS } from '../db/seed'
import { db } from '../db/db'
import { buildMonthContext, buildTree, computeMonth, spendByCategory } from '../domain/allowance'
import { defaultOfficeDays, monthDays, type MonthKey } from '../domain/calendar'
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
