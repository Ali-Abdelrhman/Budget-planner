import { describe, expect, it } from 'vitest'
import { seedCategories } from '../db/seed'
import { buildMonthContext, buildTree, computeMonth, spendByCategory } from './allowance'
import { budgetUsage, dailyStacked, paceSeries, shares } from './insights'
import type { Transaction } from './types'

const OFFICE = ['2026-09-02', '2026-09-06', '2026-09-09', '2026-09-13', '2026-09-16', '2026-09-20', '2026-09-23', '2026-09-27']
const tree = buildTree(seedCategories())
const tx = (id: string, categoryId: string, amount: number, date: string): Transaction => ({ id, categoryId, amount, date, note: '', createdAt: 0 })
const txs = [tx('1', 'c-coffee', 20, '2026-09-01'), tx('2', 'c-anghami', 100, '2026-09-01'), tx('3', 'c-office', 300, '2026-09-02'), tx('4', 'c-outings', 400, '2026-09-03')]
const ctx = buildMonthContext('2026-09', OFFICE, 6, '2026-09-03')
const m = computeMonth(tree, ctx, txs, { carryover: {} })
const spend = spendByCategory(ctx, txs)

describe('budget usage', () => {
  it('measures each category against its own limit with an expected tick', () => {
    const rows = budgetUsage(tree, m, ctx)
    const coffee = rows.find((r) => r.id === 'c-coffee')!
    expect(coffee.pct).toBeCloseTo((20 / 150) * 100, 2)
    expect(coffee.expectedPct).toBeCloseTo(10, 2)
    const anghami = rows.find((r) => r.id === 'c-anghami')!
    expect(anghami.pct).toBe(100)
    expect(anghami.expectedPct).toBeNull()
    expect(rows.some((r) => r.id === 'c-outings')).toBe(false)
    expect(rows[0].pct).toBeGreaterThanOrEqual(rows[1].pct)
  })
})

describe('daily stacked', () => {
  it('leaves bills out by default and keeps outside allowance out', () => {
    const rows = dailyStacked(ctx, tree, spend, false)
    expect(rows).toHaveLength(30)
    expect(rows[0]['g-food']).toBe(20)
    expect(rows[0]['g-subs']).toBeUndefined()
    expect(rows[1]['g-work']).toBe(300)
    expect(rows[2]['g-outside']).toBeUndefined()
    expect(rows[1].allowance).toBeGreaterThan(300)
  })
  it('includes bills when asked', () => {
    expect(dailyStacked(ctx, tree, spend, true)[0]['g-subs']).toBe(100)
  })
})

describe('pace', () => {
  it('forecasts from today to month end at the current rate', () => {
    const coffee = tree.leaves.filter((c) => c.id === 'c-coffee')
    const pts = paceSeries(ctx, coffee, spend, {})
    expect(pts[2].spent).toBe(20)
    expect(pts[3].spent).toBeNull()
    expect(pts[2].forecast).toBe(20)
    expect(pts[29].forecast).toBeCloseTo(200, 1)
    expect(pts[29].pace).toBe(150)
  })
})

describe('shares', () => {
  it('splits by category with shades inside a group', () => {
    const cats = shares(tree, m, true, 'category')
    expect(cats.map((s) => s.id)).toContain('c-outings')
    const groups = shares(tree, m, false, 'group')
    expect(groups.find((s) => s.id === 'g-subs')!.value).toBe(100)
    expect(groups.some((s) => s.id === 'g-outside')).toBe(false)
  })
})
