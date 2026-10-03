import type { Category, Settings } from '../domain/types'

export const PALETTE = ['#2F4A6B', '#A8613C', '#4F7C80', '#C29A3B', '#8A4F5A', '#6E7F4E', '#6B6257', '#5B6B8C']

type Leaf = Omit<Category, 'id' | 'parentId' | 'color' | 'order' | 'archived'> & { id: string }

const limited = (id: string, name: string, amount: number, extra: Partial<Leaf> = {}): Leaf => ({
  id,
  name,
  amount,
  inAllowance: true,
  hasLimit: true,
  budgetMode: 'fixed',
  pacing: 'daily',
  dayRule: 'all',
  ...extra,
})

const outside = (id: string, name: string): Leaf => ({
  id,
  name,
  amount: 0,
  inAllowance: false,
  hasLimit: false,
  budgetMode: 'fixed',
  pacing: 'monthly',
  dayRule: 'all',
})

const groups: { id: string; name: string; color: string; children: Leaf[] }[] = [
  {
    id: 'g-work',
    name: 'Work',
    color: PALETTE[0],
    children: [limited('c-office', 'Office days', 300, { budgetMode: 'perDay', dayRule: 'office' })],
  },
  {
    id: 'g-food',
    name: 'Food',
    color: PALETTE[1],
    children: [
      limited('c-breakfast', 'Breakfast', 500, { dayRule: 'nonOffice' }),
      limited('c-strips', 'Strips & potatoes', 350),
      limited('c-tuna', 'Tuna', 150),
      limited('c-protein', 'Protein bars', 200),
      limited('c-milk', 'Milk', 50),
      limited('c-coffee', 'Coffee', 150),
    ],
  },
  {
    id: 'g-subs',
    name: 'Subscriptions',
    color: PALETTE[2],
    children: [
      limited('c-anghami', 'Anghami', 100, { pacing: 'monthly' }),
      limited('c-landline', 'Landline', 250, { pacing: 'monthly' }),
      limited('c-flex', 'Flex', 350, { pacing: 'monthly' }),
      limited('c-prime', 'Prime', 40, { pacing: 'monthly' }),
      limited('c-gym', 'Gym', 100, { pacing: 'monthly' }),
    ],
  },
  {
    id: 'g-care',
    name: 'Personal care',
    color: PALETTE[3],
    children: [limited('c-shaving', 'Shaving', 100, { pacing: 'monthly' })],
  },
  {
    id: 'g-outside',
    name: 'Outside allowance',
    color: PALETTE[4],
    children: [
      outside('c-outings', 'Outings'),
      outside('c-sadaka', 'Sadaka'),
      outside('c-travel', 'Travel'),
      outside('c-dates', 'Dates'),
    ],
  },
]

export function seedCategories(): Category[] {
  const out: Category[] = []
  groups.forEach((g, gi) => {
    const first = g.children[0]
    out.push({
      id: g.id,
      name: g.name,
      parentId: null,
      color: g.color,
      order: gi * 100,
      inAllowance: first.inAllowance,
      hasLimit: first.hasLimit,
      budgetMode: 'fixed',
      amount: 0,
      pacing: 'monthly',
      dayRule: 'all',
      archived: false,
    })
    g.children.forEach((c, ci) => {
      out.push({ ...c, parentId: g.id, color: g.color, order: gi * 100 + ci + 1, archived: false })
    })
  })
  return out
}

export const DEFAULT_SETTINGS: Settings = {
  id: 'app',
  weekStartsOn: 6,
  defaultOfficeWeekdays: [0, 3],
  theme: 'system',
}
