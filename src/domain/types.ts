import type { ISODate, MonthKey, Weekday } from './calendar'

export type BudgetMode = 'fixed' | 'perDay'
export type Pacing = 'daily' | 'weekly' | 'monthly'
export type DayRule = 'all' | 'office' | 'nonOffice'

export interface Category {
  id: string
  name: string
  parentId: string | null
  color: string
  order: number
  inAllowance: boolean
  hasLimit: boolean
  budgetMode: BudgetMode
  amount: number
  pacing: Pacing
  dayRule: DayRule
  archived: boolean
}

export interface Transaction {
  id: string
  categoryId: string
  amount: number
  date: ISODate
  note: string
  createdAt: number
}

export interface MonthPlan {
  month: MonthKey
  officeDays: ISODate[]
  carryover: Record<string, number>
  closed: boolean
}

export type Theme = 'system' | 'light' | 'dark'

export interface Settings {
  id: 'app'
  weekStartsOn: Weekday
  defaultOfficeWeekdays: number[]
  theme: Theme
}

export type CategoryKind = 'limited' | 'input' | 'outside'

export function kindOf(c: Pick<Category, 'inAllowance' | 'hasLimit'>): CategoryKind {
  if (!c.inAllowance) return 'outside'
  return c.hasLimit ? 'limited' : 'input'
}

export function applyKind(kind: CategoryKind): Pick<Category, 'inAllowance' | 'hasLimit'> {
  if (kind === 'outside') return { inAllowance: false, hasLimit: false }
  return { inAllowance: true, hasLimit: kind === 'limited' }
}
