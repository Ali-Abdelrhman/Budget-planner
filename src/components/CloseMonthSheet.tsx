import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useMemo, useState } from 'react'
import { db, ensureMonth } from '../db/db'
import { buildMonthContext, buildTree, computeMonth } from '../domain/allowance'
import { defaultOfficeDays, monthDays, monthKeyOf, monthName, type ISODate } from '../domain/calendar'
import { round2 } from '../domain/money'
import { useSettings } from '../hooks/useMonthData'
import { useToday } from '../hooks/useToday'
import { MonthCalendar } from './MonthCalendar'
import { Money } from './Money'
import { Sheet } from './Sheet'

type Choice = 'carry' | 'reset'

/** Shows the month-end sheet when an earlier month has not been closed yet. */
export function MonthCloseGate() {
  const today = useToday()
  const current = monthKeyOf(today)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    void ensureMonth(current)
  }, [current])

  const pending = useLiveQuery(async () => {
    const open = await db.months.where('month').below(current).filter((m) => !m.closed).sortBy('month')
    return open.at(-1) ?? null
  }, [current])

  if (!pending || dismissed) return null
  return <CloseMonthSheet key={pending.month} prevMonth={pending.month} current={current} today={today} onLater={() => setDismissed(true)} />
}

function CloseMonthSheet({ prevMonth, current, today, onLater }: { prevMonth: string; current: string; today: ISODate; onLater: () => void }) {
  const settings = useSettings()
  const categories = useLiveQuery(() => db.categories.toArray(), [])
  const prevPlan = useLiveQuery(() => db.months.get(prevMonth), [prevMonth])
  const curPlan = useLiveQuery(() => db.months.get(current), [current])
  const txs = useLiveQuery(() => {
    const d = monthDays(prevMonth)
    return db.transactions.where('date').between(d[0], d[d.length - 1], true, true).toArray()
  }, [prevMonth])

  const [choices, setChoices] = useState<Record<string, Choice>>({})
  const [office, setOffice] = useState<Set<ISODate> | null>(null)

  useEffect(() => {
    if (curPlan && office === null) setOffice(new Set(curPlan.officeDays))
  }, [curPlan, office])

  const rows = useMemo(() => {
    if (!categories || !prevPlan || !txs) return null
    const tree = buildTree(categories)
    const ctx = buildMonthContext(prevMonth, prevPlan.officeDays, settings.weekStartsOn, monthDays(prevMonth).at(-1)!)
    const m = computeMonth(tree, ctx, txs, prevPlan)
    return tree.leaves
      .filter((c) => c.hasLimit && c.inAllowance)
      .map((c) => ({ cat: c, left: m.byCategory.get(c.id)!.monthLeft }))
  }, [categories, prevPlan, txs, prevMonth, settings.weekStartsOn])

  if (!rows || !office) return null

  const choiceOf = (id: string): Choice => choices[id] ?? 'reset'
  const setAll = (c: Choice) => setChoices(Object.fromEntries(rows.map((r) => [r.cat.id, c])))
  const carried = round2(rows.reduce((s, r) => s + (choiceOf(r.cat.id) === 'carry' ? r.left : 0), 0))
  const curDays = monthDays(current)

  const toggleOffice = (d: ISODate) =>
    setOffice((prev) => {
      const next = new Set(prev)
      if (next.has(d)) next.delete(d)
      else next.add(d)
      return next
    })

  const confirmClose = async () => {
    const carryover: Record<string, number> = {}
    for (const r of rows) if (choiceOf(r.cat.id) === 'carry' && r.left !== 0) carryover[r.cat.id] = r.left
    await ensureMonth(current)
    await db.transaction('rw', db.months, async () => {
      await db.months.update(current, { carryover, officeDays: [...office].sort() })
      await db.months.where('month').below(current).modify({ closed: true })
    })
  }

  return (
    <Sheet title={`Close ${monthName(prevMonth)}`} onClose={onLater}>
      <p className="section-note" style={{ marginTop: 0 }}>
        Choose what happens to each category's balance from {monthName(prevMonth)}. Carry adds leftovers (or subtracts overspending) to {monthName(current)}. Reset starts fresh.
      </p>
      <div className="row-actions" style={{ margin: '12px 0 4px' }}>
        <button className="btn" onClick={() => setAll('carry')}>
          Carry all
        </button>
        <button className="btn" onClick={() => setAll('reset')}>
          Reset all
        </button>
      </div>
      {rows.map(({ cat, left }) => (
        <div className="close-row" key={cat.id}>
          <span>{cat.name}</span>
          <Money value={left} />
          <div className="seg" role="group" aria-label={`${cat.name} carryover`}>
            <button aria-pressed={choiceOf(cat.id) === 'carry'} onClick={() => setChoices((c) => ({ ...c, [cat.id]: 'carry' }))}>
              Carry
            </button>
            <button aria-pressed={choiceOf(cat.id) === 'reset'} onClick={() => setChoices((c) => ({ ...c, [cat.id]: 'reset' }))}>
              Reset
            </button>
          </div>
        </div>
      ))}
      <div className="total-strip">
        <span className="muted">Carried into {monthName(current)}</span>
        <Money value={carried} currency />
      </div>

      <div className="section-head" style={{ marginTop: 18 }}>
        <h2 style={{ fontSize: 18 }}>Office days in {monthName(current)}</h2>
        <button className="btn btn-quiet" onClick={() => setOffice(new Set(defaultOfficeDays(current, settings.defaultOfficeWeekdays)))}>
          Default
        </button>
      </div>
      <p className="section-note">{office.size} office days. Tap to change.</p>
      <MonthCalendar days={curDays} officeDays={office} weekStartsOn={settings.weekStartsOn} today={today} onToggle={toggleOffice} />

      <button className="btn btn-primary btn-block" style={{ marginTop: 16, height: 48 }} onClick={confirmClose}>
        Start {monthName(current)}
      </button>
      <button className="btn btn-quiet btn-block" style={{ marginTop: 6 }} onClick={onLater}>
        Later
      </button>
    </Sheet>
  )
}
