import Dexie, { type EntityTable } from 'dexie'
import { defaultOfficeDays, type MonthKey } from '../domain/calendar'
import type { Category, MonthPlan, Settings, Transaction } from '../domain/types'
import { DEFAULT_SETTINGS, seedCategories } from './seed'

class BudgetDB extends Dexie {
  categories!: EntityTable<Category, 'id'>
  transactions!: EntityTable<Transaction, 'id'>
  months!: EntityTable<MonthPlan, 'month'>
  settings!: EntityTable<Settings, 'id'>

  constructor() {
    super('budget-planner')
    this.version(1).stores({
      categories: 'id, parentId, order',
      transactions: 'id, date, categoryId',
      months: 'month',
      settings: 'id',
    })
    this.on('populate', (tx) => {
      tx.table('categories').bulkAdd(seedCategories())
      tx.table('settings').add(DEFAULT_SETTINGS)
    })
  }
}

export const db = new BudgetDB()

export const newId = () => crypto.randomUUID()

export async function getSettings(): Promise<Settings> {
  return (await db.settings.get('app')) ?? DEFAULT_SETTINGS
}

/** Returns the plan for a month, creating it with the default office weekdays if missing. */
export async function ensureMonth(month: MonthKey, closedIfNew = false): Promise<MonthPlan> {
  const existing = await db.months.get(month)
  if (existing) return existing
  const settings = await getSettings()
  const plan: MonthPlan = {
    month,
    officeDays: defaultOfficeDays(month, settings.defaultOfficeWeekdays),
    carryover: {},
    closed: closedIfNew,
  }
  await db.months.put(plan)
  return plan
}

export interface Backup {
  app: 'budget-planner'
  version: 1
  exportedAt: string
  categories: Category[]
  transactions: Transaction[]
  months: MonthPlan[]
  settings: Settings[]
}

export async function exportBackup(): Promise<Backup> {
  return {
    app: 'budget-planner',
    version: 1,
    exportedAt: new Date().toISOString(),
    categories: await db.categories.toArray(),
    transactions: await db.transactions.toArray(),
    months: await db.months.toArray(),
    settings: await db.settings.toArray(),
  }
}

export async function importBackup(data: unknown): Promise<void> {
  const b = data as Partial<Backup>
  if (b?.app !== 'budget-planner' || !Array.isArray(b.categories) || !Array.isArray(b.transactions)) {
    throw new Error('This file is not a Qersh backup.')
  }
  await db.transaction('rw', [db.categories, db.transactions, db.months, db.settings], async () => {
    await Promise.all([db.categories.clear(), db.transactions.clear(), db.months.clear(), db.settings.clear()])
    await db.categories.bulkAdd(b.categories!)
    await db.transactions.bulkAdd(b.transactions!)
    await db.months.bulkAdd(b.months ?? [])
    await db.settings.bulkAdd(b.settings?.length ? b.settings : [DEFAULT_SETTINGS])
  })
}
