import { format } from 'date-fns'
import { useState } from 'react'
import { MonthSwitch } from '../components/MonthSwitch'
import { Money } from '../components/Money'
import { QuickAddSheet } from '../components/QuickAddSheet'
import { fromISO, monthKeyOf } from '../domain/calendar'
import type { Transaction } from '../domain/types'
import { useMonthData } from '../hooks/useMonthData'
import { useToday } from '../hooks/useToday'

export function HistoryPage() {
  const today = useToday()
  const [month, setMonth] = useState(monthKeyOf(today))
  const [filter, setFilter] = useState('all')
  const [editing, setEditing] = useState<Transaction | null>(null)
  const data = useMonthData(month)
  if (!data) return <div className="page" />
  const { tree, categories, balances } = data

  const byId = new Map(categories.map((c) => [c.id, c]))
  const matches = (t: Transaction) => {
    if (filter === 'all') return true
    if (t.categoryId === filter) return true
    return byId.get(t.categoryId)?.parentId === filter
  }
  const txs = data.transactions.filter(matches).sort((a, b) => (a.date === b.date ? b.createdAt - a.createdAt : a.date < b.date ? 1 : -1))
  const days = [...new Set(txs.map((t) => t.date))]
  const total = txs.reduce((s, t) => s + t.amount, 0)

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <div className="eyebrow">History</div>
          <h1>Every expense</h1>
        </div>
      </header>

      <div className="toolbar">
        <MonthSwitch month={month} onChange={setMonth} />
        <select className="select" style={{ width: 'auto', minHeight: 38, fontSize: 14 }} value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter by category">
          <option value="all">All categories</option>
          {tree.groups.map((g) => (
            <optgroup key={g.id} label={g.name}>
              <option value={g.id}>All {g.name}</option>
              {(tree.childrenOf.get(g.id) ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>

      <div className="total-strip">
        <span className="muted">
          {txs.length} {txs.length === 1 ? 'expense' : 'expenses'}
        </span>
        <Money value={total} currency signal={false} />
      </div>

      {days.length === 0 && <p className="empty">No expenses for this month.</p>}

      {days.map((d) => {
        const list = txs.filter((t) => t.date === d)
        return (
          <section key={d}>
            <div className="day-head">
              <span>{format(fromISO(d), 'EEEE d MMMM')}</span>
              <Money value={list.reduce((s, t) => s + t.amount, 0)} signal={false} />
            </div>
            {list.map((t) => {
              const cat = byId.get(t.categoryId)
              const group = cat?.parentId ? byId.get(cat.parentId) : cat
              return (
                <button key={t.id} className="tx-row" onClick={() => setEditing(t)}>
                  <i className="swatch" style={{ background: group?.color ?? 'var(--ink-3)' }} />
                  <span style={{ minWidth: 0 }}>
                    {cat?.name ?? 'Removed category'}
                    {cat?.archived && <span className="muted"> (archived)</span>}
                    {t.note && <span className="note">{t.note}</span>}
                  </span>
                  <Money value={t.amount} signal={false} />
                </button>
              )
            })}
          </section>
        )
      })}

      {editing && <QuickAddSheet tree={tree} today={today} balances={balances.byCategory} initial={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}
