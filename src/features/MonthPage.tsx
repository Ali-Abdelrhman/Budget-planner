import { Fragment, useState } from 'react'
import { MonthCalendar } from '../components/MonthCalendar'
import { MonthSwitch } from '../components/MonthSwitch'
import { Money } from '../components/Money'
import { db, ensureMonth } from '../db/db'
import { matchingDayCount, type Balance } from '../domain/allowance'
import { defaultOfficeDays, monthKeyOf, type ISODate } from '../domain/calendar'
import { formatEGP } from '../domain/money'
import { useMonthData } from '../hooks/useMonthData'
import { useToday } from '../hooks/useToday'

export function MonthPage() {
  const today = useToday()
  const [month, setMonth] = useState(monthKeyOf(today))
  const data = useMonthData(month)
  if (!data) return <div className="page" />
  const { tree, balances, ctx, plan, settings, spend } = data
  const isCurrent = month === monthKeyOf(today)

  const office = tree.leaves.find((c) => c.dayRule === 'office' && c.hasLimit)
  const officeRate = office?.budgetMode === 'perDay' ? office.amount : null

  const toggle = async (day: ISODate) => {
    const p = await ensureMonth(month, month < monthKeyOf(today))
    const set = new Set(p.officeDays)
    if (set.has(day)) set.delete(day)
    else set.add(day)
    await db.months.update(month, { officeDays: [...set].sort() })
  }

  const resetOffice = async () => {
    await ensureMonth(month, month < monthKeyOf(today))
    await db.months.update(month, { officeDays: defaultOfficeDays(month, settings.defaultOfficeWeekdays) })
  }

  const dayTotals = ctx.days.map((_, i) => tree.leaves.reduce((s, c) => s + (spend.get(c.id)?.[i] ?? 0), 0))
  const hasCarry = Object.values(plan.carryover).some((v) => v !== 0)
  const homeDays = ctx.days.length - ctx.officeDays.size

  const cells = (b: Balance, limited: boolean) => (
    <>
      <td>
        <Money value={b.budget} signal={false} />
      </td>
      {hasCarry && <td>{b.carryover ? <Money value={b.carryover} /> : null}</td>}
      <td>
        <Money value={b.spentMonth} signal={false} />
      </td>
      <td>{limited ? <Money value={b.monthLeft} /> : null}</td>
      {isCurrent && <td>{limited ? <Money value={b.weekLeft} /> : null}</td>}
      {isCurrent && <td>{limited ? <Money value={b.todayLeft} /> : null}</td>}
    </>
  )

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <div className="eyebrow">Month</div>
          <h1>Plan and balances</h1>
        </div>
      </header>

      <div className="toolbar">
        <MonthSwitch month={month} onChange={setMonth} />
        <span className="muted" style={{ fontSize: 13 }}>
          {ctx.days.length} days, {ctx.weeks.length} weeks
        </span>
      </div>

      <section className="section" style={{ marginTop: 18 }}>
        <div className="section-head">
          <h2>Office days</h2>
          <button className="btn btn-quiet" onClick={resetOffice}>
            Reset to default
          </button>
        </div>
        <p className="section-note">
          Tap a day to mark it as an office day. {ctx.officeDays.size} office days
          {officeRate !== null && office ? `, ${formatEGP(officeRate)} each = ${formatEGP(officeRate * matchingDayCount(office, ctx))}` : ''}.{' '}
          {homeDays} home days share the breakfast budget.
        </p>
        <MonthCalendar days={ctx.days} officeDays={ctx.officeDays} weekStartsOn={settings.weekStartsOn} today={today} dayTotals={dayTotals} onToggle={toggle} />
      </section>

      <section className="section">
        <div className="section-head">
          <h2>Balances</h2>
          <span className="muted" style={{ fontSize: 13 }}>
            {plan.closed ? 'Month closed' : isCurrent ? 'Live' : ''}
          </span>
        </div>
        <div className="table-wrap">
          <table className="grid">
            <thead>
              <tr>
                <th>Category</th>
                <th>Budget</th>
                {hasCarry && <th>Carried</th>}
                <th>Spent</th>
                <th>Month left</th>
                {isCurrent && <th>Week left</th>}
                {isCurrent && <th>Today left</th>}
              </tr>
            </thead>
            <tbody>
              {tree.groups.map((g) => {
                const kids = tree.childrenOf.get(g.id)
                if (!kids) {
                  const b = balances.byCategory.get(g.id)!
                  return (
                    <tr key={g.id} className="group">
                      <td>{g.name}</td>
                      {cells(b, g.hasLimit)}
                    </tr>
                  )
                }
                const gb = balances.byGroup.get(g.id)!
                const limitedGroup = kids.some((k) => k.hasLimit)
                return (
                  <Fragment key={g.id}>
                    <tr className="group">
                      <td>
                        <i className="swatch" style={{ background: g.color, display: 'inline-block', marginRight: 8 }} />
                        {g.name}
                      </td>
                      {cells(gb, limitedGroup)}
                    </tr>
                    {kids.map((c) => (
                      <tr key={c.id} className="child">
                        <td>{c.name}</td>
                        {cells(balances.byCategory.get(c.id)!, c.hasLimit)}
                      </tr>
                    ))}
                  </Fragment>
                )
              })}
              <tr className="total">
                <td>Total allowance</td>
                {cells(balances.allowance, true)}
              </tr>
            </tbody>
          </table>
        </div>
        {balances.outside.spentMonth > 0 && (
          <p className="section-note">Outside allowance spending this month: {formatEGP(balances.outside.spentMonth)}.</p>
        )}
      </section>
    </div>
  )
}
