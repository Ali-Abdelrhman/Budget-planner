import { useState } from 'react'
import { db, newId } from '../db/db'
import type { Balance, CategoryTree } from '../domain/allowance'
import { formatEGP } from '../domain/money'
import type { Transaction } from '../domain/types'
import { Sheet } from './Sheet'

interface Props {
  tree: CategoryTree
  today: string
  /** Balances for the month containing `today`, used for the live warning. */
  balances: Map<string, Balance>
  initial?: Transaction
  onClose: () => void
}

const LAST_CAT_KEY = 'bp:lastCategory'

function readLastCategory(): string | null {
  try {
    return localStorage.getItem(LAST_CAT_KEY)
  } catch {
    return null
  }
}

function rememberCategory(id: string) {
  try {
    localStorage.setItem(LAST_CAT_KEY, id)
  } catch {
    /* storage can be unavailable in private mode */
  }
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'del']

export function QuickAddSheet({ tree, today, balances, initial, onClose }: Props) {
  const leafIds = new Set(tree.leaves.map((l) => l.id))
  const last = readLastCategory()
  const [amount, setAmount] = useState(initial ? String(initial.amount) : '')
  const [categoryId, setCategoryId] = useState<string | null>(
    initial?.categoryId ?? (last && leafIds.has(last) ? last : null),
  )
  const [note, setNote] = useState(initial?.note ?? '')
  const [date, setDate] = useState(initial?.date ?? today)

  const value = Number(amount) || 0

  const press = (k: string) => {
    setAmount((a) => {
      if (k === 'del') return a.slice(0, -1)
      if (k === '.') return a.includes('.') ? a : (a || '0') + '.'
      if (a.includes('.') && a.split('.')[1].length >= 2) return a
      if (a.replace('.', '').length >= 8) return a
      if (a === '0') return k
      return a + k
    })
  }

  const save = async () => {
    if (!categoryId || value <= 0) return
    rememberCategory(categoryId)
    if (initial) {
      await db.transactions.update(initial.id, { amount: value, categoryId, note: note.trim(), date })
    } else {
      await db.transactions.add({ id: newId(), amount: value, categoryId, note: note.trim(), date, createdAt: Date.now() })
    }
    onClose()
  }

  const remove = async () => {
    if (!initial) return
    if (!confirm('Delete this expense?')) return
    await db.transactions.delete(initial.id)
    onClose()
  }

  const selected = tree.leaves.find((c) => c.id === categoryId)
  const bal = categoryId ? balances.get(categoryId) : undefined
  let hint: { tone: '' | 'warn' | 'over'; text: string } | null = null
  if (selected && bal && selected.hasLimit && date === today) {
    const editing = initial && initial.categoryId === categoryId && initial.date === today ? initial.amount : 0
    const left = selected.pacing === 'monthly' ? bal.monthLeft : bal.todayLeft
    const after = left + editing - value
    const scope = selected.pacing === 'monthly' ? 'this month' : 'today'
    if (value > 0 && after < 0) {
      hint = { tone: 'over', text: `${selected.name} will be over by ${formatEGP(-after)} ${scope}.` }
    } else if (value > 0) {
      hint = { tone: after < left * 0.2 ? 'warn' : '', text: `${formatEGP(after)} left ${scope} after this.` }
    } else {
      hint = { tone: left < 0 ? 'over' : '', text: `${formatEGP(left)} left ${scope} for ${selected.name}.` }
    }
  }

  return (
    <Sheet title={initial ? 'Edit expense' : 'Add expense'} onClose={onClose}>
      <div className={`amount-display ${amount ? '' : 'empty'}`} aria-live="polite">
        <span className="num">{amount || '0'}</span>
        <span className="cur">EGP</span>
      </div>

      <div className="keypad">
        {KEYS.map((k) => (
          <button key={k} type="button" onClick={() => press(k)} aria-label={k === 'del' ? 'Delete digit' : k}>
            {k === 'del' ? '⌫' : k}
          </button>
        ))}
      </div>

      <div className="cat-picker">
        {tree.groups.map((g) => {
          const kids = tree.childrenOf.get(g.id) ?? [g]
          return (
            <div key={g.id}>
              <div className="group-label">
                <i className="swatch" style={{ background: g.color }} />
                {g.name}
              </div>
              <div className="chips">
                {kids.map((c) => (
                  <button key={c.id} type="button" className="chip" aria-pressed={c.id === categoryId} onClick={() => setCategoryId(c.id)}>
                    {c.name}
                  </button>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {hint && <p className={`hint ${hint.tone}`}>{hint.text}</p>}

      <div className="form-grid" style={{ marginBottom: 14 }}>
        <label className="field">
          <span>Date</span>
          <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value || today)} />
        </label>
        <label className="field">
          <span>Note</span>
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" maxLength={80} />
        </label>
      </div>

      <button className="btn btn-primary btn-block" style={{ height: 48 }} disabled={!categoryId || value <= 0} onClick={save}>
        {initial ? 'Save changes' : value > 0 && selected ? `Add ${formatEGP(value)} to ${selected.name}` : 'Add expense'}
      </button>
      {initial && (
        <button className="btn btn-danger btn-block" style={{ marginTop: 8 }} onClick={remove}>
          Delete
        </button>
      )}
    </Sheet>
  )
}
