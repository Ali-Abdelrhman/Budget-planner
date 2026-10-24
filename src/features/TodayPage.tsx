import { format } from 'date-fns'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { Meter } from '../components/Meter'
import { Money } from '../components/Money'
import { QuickAddSheet } from '../components/QuickAddSheet'
import { dailyAllocations, sumBalances, type Balance } from '../domain/allowance'
import { fromISO, monthKeyOf } from '../domain/calendar'
import { formatEGP } from '../domain/money'
import type { Category, Transaction } from '../domain/types'
import { useMonthData, type MonthData } from '../hooks/useMonthData'
import { useToday } from '../hooks/useToday'

export function TodayPage() {
  const today = useToday()
  const data = useMonthData(monthKeyOf(today))
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<Transaction | null>(null)

  if (!data) return <div className="page" />
  const { tree, balances, ctx } = data

  const leaves = tree.leaves.filter((c) => c.inAllowance && c.hasLimit)
  const pick = (p: Category['pacing'][]) =>
    sumBalances(
      leaves.filter((c) => p.includes(c.pacing)).map((c) => balances.byCategory.get(c.id)!),
      true,
    )
  const daily = pick(['daily'])
  const weekly = pick(['daily', 'weekly'])
  const total = balances.allowance

  const todays = data.transactions.filter((t) => t.date === today).sort((a, b) => b.createdAt - a.createdAt)
  const catName = new Map(tree.leaves.map((c) => [c.id, c.name]))
  const outsideGroups = tree.groups.filter((g) => !(tree.childrenOf.get(g.id) ?? [g]).some((c) => c.inAllowance))
  const insideGroups = tree.groups.filter((g) => !outsideGroups.includes(g))

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <div className="eyebrow">Today</div>
          <h1>{format(fromISO(today), 'EEEE d MMMM')}</h1>
        </div>
        <div className="muted" style={{ fontSize: 13, textAlign: 'right' }}>
          Day {ctx.todayIndex + 1} of {ctx.days.length}
          <br />
          {ctx.officeDays.has(today) ? 'Office day' : 'Home day'}
        </div>
      </header>

      <div className="figures">
        <div className="figure">
          <div className="eyebrow">Left today</div>
          <Money className="value" value={daily.todayLeft} />
          <div className="sub">daily items</div>
        </div>
        <div className="figure">
          <div className="eyebrow">This week</div>
          <Money className="value" value={weekly.weekLeft} />
          <div className="sub">spent {formatEGP(weekly.spentWeek)}</div>
        </div>
        <div className="figure">
          <div className="eyebrow">This month</div>
          <Money className="value" value={total.monthLeft} />
          <div className="sub">of {formatEGP(total.budget + total.carryover)}</div>
        </div>
      </div>

      <div className="toolbar" style={{ borderBottom: 0, paddingBottom: 0 }}>
        <span className="muted" style={{ fontSize: 13 }}>
          Unspent allowance rolls into the next day and week. Red means over. Tap a category to see its days.
        </span>
        <button className="btn btn-primary add-bar" onClick={() => setAdding(true)}>
          <Icon name="plus" size={18} /> Add expense
        </button>
      </div>

      <div className="ledger">
        <div className="ledger-head eyebrow">
          <span>Category</span>
          <span>Today</span>
          <span>Week</span>
          <span>Month</span>
        </div>
        {insideGroups.map((g) => (
          <GroupRows key={g.id} group={g} data={data} today={today} />
        ))}
      </div>

      {outsideGroups.length > 0 && (
        <section className="section">
          <div className="section-head">
            <h2>Outside allowance</h2>
            <Money value={balances.outside.spentMonth} currency signal={false} />
          </div>
          <p className="section-note">No limits here. Tracked only, and not counted in your allowance.</p>
          {outsideGroups.flatMap((g) => tree.childrenOf.get(g.id) ?? [g]).map((c) => {
            const b = balances.byCategory.get(c.id)!
            return (
              <Link to={`/c/${c.id}`} className="ledger-row link-row" key={c.id} style={{ gridTemplateColumns: 'minmax(0,1fr) auto auto' }}>
                <span className="label">
                  <span className="title">{c.name}</span>
                </span>
                <span className="muted" style={{ fontSize: 12 }}>
                  today {formatEGP(b.spentToday)}
                </span>
                <Money value={b.spentMonth} signal={false} />
              </Link>
            )
          })}
        </section>
      )}

      <section className="section">
        <div className="section-head">
          <h2>Spent today</h2>
          <Money value={todays.reduce((s, t) => s + t.amount, 0)} currency signal={false} />
        </div>
        {todays.length === 0 ? (
          <p className="empty">Nothing logged yet today.</p>
        ) : (
          todays.map((t) => (
            <button key={t.id} className="tx-row" onClick={() => setEditing(t)}>
              <span className="muted amt" style={{ fontSize: 12 }}>
                {format(t.createdAt, 'HH:mm')}
              </span>
              <span style={{ minWidth: 0 }}>
                {catName.get(t.categoryId) ?? 'Removed category'}
                {t.note && <span className="note">{t.note}</span>}
              </span>
              <Money value={t.amount} signal={false} />
            </button>
          ))
        )}
      </section>

      {(adding || editing) && (
        <QuickAddSheet
          tree={tree}
          today={today}
          balances={balances.byCategory}
          initial={editing ?? undefined}
          onClose={() => {
            setAdding(false)
            setEditing(null)
          }}
        />
      )}
    </div>
  )
}

function GroupRows({ group, data, today }: { group: Category; data: MonthData; today: string }) {
  const { tree, balances, ctx } = data
  const kids = tree.childrenOf.get(group.id) ?? [group]
  const gb = balances.byGroup.get(group.id) ?? balances.byCategory.get(group.id)!
  return (
    <>
      <Link to={`/c/${group.id}`} className="ledger-group link-row">
        <span className="name">
          <i className="swatch" style={{ background: group.color }} />
          {group.name}
        </span>
        <span className="muted" style={{ fontSize: 12 }}>
          <Money value={gb.monthLeft} /> left of {formatEGP(gb.budget + gb.carryover)}
        </span>
      </Link>
      {kids.map((c) => (
        <CategoryRow key={c.id} cat={c} b={balances.byCategory.get(c.id)!} todayAlloc={dailyAllocations(c, ctx)[ctx.todayIndex]} isOfficeDay={ctx.officeDays.has(today)} />
      ))}
    </>
  )
}

function CategoryRow({ cat, b, todayAlloc, isOfficeDay }: { cat: Category; b: Balance; todayAlloc: number; isOfficeDay: boolean }) {
  const limit = b.budget + b.carryover
  const overMonth = cat.hasLimit && b.monthLeft < 0
  const overToday = cat.hasLimit && cat.pacing !== 'monthly' && b.todayLeft < 0
  const blank = <span aria-hidden="true" />

  let meta: string
  if (!cat.hasLimit) meta = `Input only, ${formatEGP(b.spentMonth)} this month`
  else if (cat.pacing === 'monthly') meta = b.spentMonth >= b.budget ? `Paid ${formatEGP(b.spentMonth)}` : `Due ${formatEGP(b.budget - b.spentMonth)}`
  else if (cat.dayRule === 'office' && !isOfficeDay) meta = `No office today, ${formatEGP(b.spentMonth)} of ${formatEGP(limit)}`
  else meta = `${formatEGP(b.spentMonth)} of ${formatEGP(limit)}${todayAlloc > 0 && cat.pacing === 'daily' ? `, +${formatEGP(todayAlloc)} today` : ''}`

  return (
    <Link to={`/c/${cat.id}`} className={`ledger-row link-row ${overMonth || overToday ? 'is-over' : ''}`}>
      <span className="label">
        <span className="title">
          {cat.name}
          {overMonth ? <span className="tag over">Over</span> : overToday ? <span className="tag over">Over today</span> : b.status === 'warn' ? <span className="tag warn">Close</span> : null}
        </span>
        <span className="meta">{meta}</span>
        {cat.hasLimit && <Meter spent={b.spentMonth} limit={limit} status={b.status} pace={cat.pacing === 'monthly' ? undefined : b.releasedToDate} />}
      </span>
      {cat.hasLimit && cat.pacing === 'daily' ? <Money value={b.todayLeft} /> : blank}
      {cat.hasLimit && cat.pacing !== 'monthly' ? <Money value={b.weekLeft} /> : blank}
      {cat.hasLimit ? <Money value={b.monthLeft} /> : <Money value={b.spentMonth} signal={false} />}
    </Link>
  )
}
