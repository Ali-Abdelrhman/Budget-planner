import { describe, expect, it } from 'vitest'
import { seedCategories } from '../db/seed'
import {
  buildMonthContext,
  buildTree,
  computeBalance,
  computeMonth,
  dailyAllocations,
  monthlyBudget,
  totalAllowance,
} from './allowance'
import { monthDays, weeksOfMonth } from './calendar'
import { spendScale } from './insights'
import type { Category, Transaction } from './types'

const cats = seedCategories()
const cat = (id: string) => cats.find((c) => c.id === id)!
const zeros = (n: number) => new Array<number>(n).fill(0)

// 8 office days in September 2026 (Sundays and Wednesdays, minus two)
const SEP_OFFICE = ['2026-09-02', '2026-09-06', '2026-09-09', '2026-09-13', '2026-09-16', '2026-09-20', '2026-09-23', '2026-09-27']
const OCT_OFFICE = ['2026-10-04', '2026-10-07', '2026-10-11', '2026-10-14', '2026-10-18', '2026-10-21', '2026-10-25', '2026-10-28']

const sep = (today = '2026-09-03') => buildMonthContext('2026-09', SEP_OFFICE, 6, today)

describe('calendar months', () => {
  it('uses the real number of days in each month', () => {
    expect(monthDays('2026-09')).toHaveLength(30)
    expect(monthDays('2026-10')).toHaveLength(31)
    expect(monthDays('2026-02')).toHaveLength(28)
    expect(monthDays('2028-02')).toHaveLength(29)
  })

  it('splits a month into weeks starting on Saturday with partial edges', () => {
    const weeks = weeksOfMonth('2026-09', 6)
    expect(weeks[0]).toEqual(['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04'])
    expect(weeks[1][0]).toBe('2026-09-05')
    expect(weeks.flat()).toHaveLength(30)
    expect(weeks.at(-1)!.at(-1)).toBe('2026-09-30')
  })

  it('gives the right per-day split for 28, 29, 30 and 31 day months', () => {
    const coffee = cat('c-coffee')
    const perDay = (month: string) => dailyAllocations(coffee, buildMonthContext(month, [], 6, `${month}-01`))[0]
    expect(perDay('2026-09')).toBeCloseTo(5, 5)
    expect(perDay('2026-10')).toBeCloseTo(150 / 31, 5)
    expect(perDay('2026-02')).toBeCloseTo(150 / 28, 5)
    expect(perDay('2028-02')).toBeCloseTo(150 / 29, 5)
  })
})

describe('budgets', () => {
  it('total allowance is 4,740 EGP with the seed categories and 8 office days', () => {
    expect(totalAllowance(buildTree(cats), sep())).toBe(4740)
    expect(totalAllowance(buildTree(cats), buildMonthContext('2026-10', OCT_OFFICE, 6, '2026-10-01'))).toBe(4740)
  })

  it('total allowance follows the number of office days', () => {
    const nine = [...SEP_OFFICE, '2026-09-30']
    expect(totalAllowance(buildTree(cats), buildMonthContext('2026-09', nine, 6, '2026-09-01'))).toBe(5040)
  })

  it('office days release 300 EGP only on office days', () => {
    const ctx = sep()
    const office = cat('c-office')
    expect(monthlyBudget(office, ctx)).toBe(2400)
    const alloc = dailyAllocations(office, ctx)
    ctx.days.forEach((d, i) => expect(alloc[i]).toBe(SEP_OFFICE.includes(d) ? 300 : 0))
  })

  it('breakfast is spread over non-office days', () => {
    const ctx = sep()
    const alloc = dailyAllocations(cat('c-breakfast'), ctx)
    expect(alloc[1]).toBe(0) // 2 Sep is an office day
    expect(alloc[0]).toBeCloseTo(500 / 22, 5)
    expect(alloc.reduce((a, b) => a + b, 0)).toBeCloseTo(500, 5)
  })

  it('monthly bills are fully available from the first day', () => {
    const b = computeBalance(cat('c-anghami'), sep('2026-09-01'), zeros(30))
    expect(b.todayLeft).toBe(100)
    expect(b.weekLeft).toBe(100)
  })
})

describe('rollover', () => {
  const coffee = cat('c-coffee') // 5 EGP per day in September

  it('unspent daily allowance accumulates into the next day', () => {
    const b = computeBalance(coffee, sep('2026-09-03'), zeros(30))
    expect(b.todayLeft).toBe(15)
  })

  it('overspending makes the balance negative and reduces later days', () => {
    const spend = zeros(30)
    spend[0] = 20
    expect(computeBalance(coffee, sep('2026-09-01'), spend).todayLeft).toBe(-15)
    expect(computeBalance(coffee, sep('2026-09-03'), spend).todayLeft).toBe(-5)
    expect(computeBalance(coffee, sep('2026-09-05'), spend).todayLeft).toBe(5)
  })

  it('weekly balance covers the whole current week and rolls into the next week', () => {
    expect(computeBalance(coffee, sep('2026-09-02'), zeros(30)).weekLeft).toBe(20)
    const spend = zeros(30)
    spend[0] = 30
    expect(computeBalance(coffee, sep('2026-09-02'), spend).weekLeft).toBe(-10)
    // second week: 4 unspent days of week one roll in, plus 7 days of week two, minus 30 spent
    expect(computeBalance(coffee, sep('2026-09-06'), spend).weekLeft).toBe(25)
  })

  it('weekly pacing releases each week on its first day', () => {
    const weekly: Category = { ...coffee, pacing: 'weekly' }
    const alloc = dailyAllocations(weekly, sep())
    expect(alloc[0]).toBe(20)
    expect(alloc[1]).toBe(0)
    expect(alloc[4]).toBe(35)
    expect(computeBalance(weekly, sep('2026-09-01'), zeros(30)).todayLeft).toBe(20)
  })

  it('month status turns over when spending passes the limit', () => {
    const spend = zeros(30)
    spend[2] = 160
    const b = computeBalance(coffee, sep('2026-09-03'), spend)
    expect(b.monthLeft).toBe(-10)
    expect(b.status).toBe('over')
  })

  it('warns at 80 percent', () => {
    const spend = zeros(30)
    spend[2] = 125
    expect(computeBalance(coffee, sep('2026-09-03'), spend).status).toBe('warn')
  })
})

describe('carryover', () => {
  const coffee = cat('c-coffee')

  it('adds leftover from last month', () => {
    const b = computeBalance(coffee, sep('2026-09-01'), zeros(30), 30)
    expect(b.monthLeft).toBe(180)
    expect(b.todayLeft).toBe(35)
  })

  it('subtracts overspend from last month', () => {
    expect(computeBalance(coffee, sep('2026-09-01'), zeros(30), -20).monthLeft).toBe(130)
  })

  it('reset means no carryover', () => {
    expect(computeBalance(coffee, sep('2026-09-01'), zeros(30), 0).monthLeft).toBe(150)
  })

  it('is ignored for categories without a limit', () => {
    expect(computeBalance(cat('c-outings'), sep(), zeros(30), 50).carryover).toBe(0)
  })
})

describe('chart scale', () => {
  it('ignores allowance and fits the axis to spending', () => {
    expect(spendScale([40, 30, 320])).toBe(400)
    expect(spendScale([490])).toBe(800)
    expect(spendScale([12])).toBe(100)
    expect(spendScale([])).toBe(100)
  })
})

describe('month totals', () => {
  it('keeps outside-allowance spending out of the allowance total', () => {
    const txs: Transaction[] = [
      { id: '1', categoryId: 'c-coffee', amount: 40, date: '2026-09-02', note: '', createdAt: 0 },
      { id: '2', categoryId: 'c-outings', amount: 500, date: '2026-09-02', note: '', createdAt: 0 },
      { id: '3', categoryId: 'c-office', amount: 350, date: '2026-09-02', note: '', createdAt: 0 },
    ]
    const m = computeMonth(buildTree(cats), sep(), txs, { carryover: {} })
    expect(m.allowance.budget).toBe(4740)
    expect(m.allowance.spentMonth).toBe(390)
    expect(m.allowance.monthLeft).toBe(4350)
    expect(m.outside.spentMonth).toBe(500)
    expect(m.byGroup.get('g-food')!.budget).toBe(1400)
    expect(m.byGroup.get('g-subs')!.budget).toBe(840)
    expect(m.byCategory.get('c-office')!.todayLeft).toBe(-50)
    expect(m.byCategory.get('c-outings')!.status).toBe('none')
  })
})
