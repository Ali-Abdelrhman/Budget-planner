import { useState } from 'react'
import { Icon } from '../components/Icon'
import { Money } from '../components/Money'
import { db, newId } from '../db/db'
import { PALETTE } from '../db/seed'
import { matchingDayCount, monthlyBudget, type MonthContext } from '../domain/allowance'
import { monthKeyOf } from '../domain/calendar'
import { formatEGP } from '../domain/money'
import { applyKind, kindOf, type Category, type CategoryKind, type DayRule, type Pacing } from '../domain/types'
import { useMonthData } from '../hooks/useMonthData'
import { useToday } from '../hooks/useToday'

const KIND_LABEL: Record<CategoryKind, string> = { limited: 'Limited', input: 'Input only', outside: 'Outside allowance' }
const PACING_LABEL: Record<Pacing, string> = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly' }
const RULE_LABEL: Record<DayRule, string> = { all: 'Every day', office: 'Office days', nonOffice: 'Home days' }

function describe(c: Category, ctx: MonthContext): string {
  const kind = kindOf(c)
  if (kind === 'outside') return 'Outside allowance, no limit'
  const budget = monthlyBudget(c, ctx)
  const parts = [kind === 'input' ? 'Input only' : `${PACING_LABEL[c.pacing]} allowance`]
  if (c.budgetMode === 'perDay') parts.push(`${formatEGP(c.amount)} x ${matchingDayCount(c, ctx)} ${RULE_LABEL[c.dayRule].toLowerCase()}`)
  else if (c.pacing !== 'monthly' && c.dayRule !== 'all') parts.push(`spread over ${RULE_LABEL[c.dayRule].toLowerCase()}`)
  return `${parts.join(', ')} = ${formatEGP(budget)}`
}

export function CategoriesPanel() {
  const today = useToday()
  const data = useMonthData(monthKeyOf(today))
  const [open, setOpen] = useState<string | null>(null)
  const [draft, setDraft] = useState<Category | null>(null)

  if (!data) return null
  const { tree, ctx, categories, balances } = data
  const maxOrder = Math.max(0, ...categories.map((c) => c.order))

  const startNewChild = (group: Category) => {
    const siblings = tree.childrenOf.get(group.id) ?? []
    const like = siblings[0] ?? group
    setOpen(null)
    setDraft({
      id: newId(),
      name: '',
      parentId: group.id,
      color: group.color,
      order: Math.max(group.order, ...siblings.map((s) => s.order)) + 1,
      inAllowance: like.inAllowance,
      hasLimit: like.hasLimit,
      budgetMode: 'fixed',
      amount: 0,
      pacing: like.inAllowance && like.hasLimit ? 'daily' : 'monthly',
      dayRule: 'all',
      archived: false,
    })
  }

  const addGroup = async () => {
    const id = newId()
    const used = new Set(tree.groups.map((g) => g.color))
    await db.categories.add({
      id,
      name: 'New group',
      parentId: null,
      color: PALETTE.find((p) => !used.has(p)) ?? PALETTE[0],
      order: Math.ceil((maxOrder + 1) / 100) * 100,
      inAllowance: true,
      hasLimit: true,
      budgetMode: 'fixed',
      amount: 0,
      pacing: 'monthly',
      dayRule: 'all',
      archived: false,
    })
    setOpen(`group:${id}`)
  }

  return (
    <div>
      <div className="total-strip">
        <div>
          <div className="eyebrow">Total allowance</div>
          <span className="muted" style={{ fontSize: 13 }}>
            Sum of every category inside the allowance, for {ctx.officeDays.size} office days this month
          </span>
        </div>
        <Money value={balances.allowance.budget} currency signal={false} />
      </div>

      {tree.groups.map((g) => {
        const kids = tree.childrenOf.get(g.id) ?? []
        const gb = balances.byGroup.get(g.id)
        const editingGroup = open === `group:${g.id}`
        return (
          <div className="cat-group" key={g.id}>
            <div className="cat-group-head">
              <button className="name" onClick={() => setOpen(editingGroup ? null : `group:${g.id}`)} aria-expanded={editingGroup}>
                <i className="swatch" style={{ background: g.color, width: 11, height: 11 }} />
                {g.name}
              </button>
              {gb && kids.some((k) => k.inAllowance) && <Money value={gb.budget} signal={false} />}
            </div>
            {editingGroup && <GroupEditor group={g} hasChildren={kids.length > 0} onDone={() => setOpen(null)} />}
            {kids.map((c) => (
              <div className="cat-item" key={c.id}>
                <button className="cat-item-row" onClick={() => setOpen(open === c.id ? null : c.id)} aria-expanded={open === c.id}>
                  <span style={{ minWidth: 0 }}>
                    {c.name}
                    <span className="meta">{describe(c, ctx)}</span>
                  </span>
                  <span className={`tag ${kindOf(c) === 'limited' ? 'ok' : ''}`} style={{ color: kindOf(c) === 'limited' ? undefined : 'var(--ink-3)' }}>
                    {KIND_LABEL[kindOf(c)]}
                  </span>
                  <Icon name={open === c.id ? 'close' : 'right'} size={16} />
                </button>
                {open === c.id && <CategoryEditor initial={c} groups={tree.groups} ctx={ctx} onDone={() => setOpen(null)} />}
              </div>
            ))}
            {draft?.parentId === g.id ? (
              <div className="cat-item">
                <CategoryEditor initial={draft} isNew groups={tree.groups} ctx={ctx} onDone={() => setDraft(null)} />
              </div>
            ) : (
              <button className="btn btn-quiet" style={{ marginTop: 6 }} onClick={() => startNewChild(g)}>
                <Icon name="plus" size={16} /> Add to {g.name}
              </button>
            )}
          </div>
        )
      })}

      <div style={{ marginTop: 28 }}>
        <button className="btn" onClick={addGroup}>
          <Icon name="plus" size={16} /> Add group
        </button>
      </div>
    </div>
  )
}

function GroupEditor({ group, hasChildren, onDone }: { group: Category; hasChildren: boolean; onDone: () => void }) {
  const [name, setName] = useState(group.name)
  const [color, setColor] = useState(group.color)

  const save = async () => {
    await db.transaction('rw', db.categories, async () => {
      await db.categories.update(group.id, { name: name.trim() || group.name, color })
      await db.categories.where('parentId').equals(group.id).modify({ color })
    })
    onDone()
  }

  const remove = async () => {
    const used = await db.transactions.where('categoryId').equals(group.id).count()
    if (!confirm(`Remove the group "${group.name}"?`)) return
    if (used) await db.categories.update(group.id, { archived: true })
    else await db.categories.delete(group.id)
    onDone()
  }

  return (
    <div className="cat-editor" style={{ borderBottom: '1px solid var(--rule)' }}>
      <label className="field">
        <span>Group name</span>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
      </label>
      <div className="field">
        <span>Colour</span>
        <div className="colors">
          {PALETTE.map((p) => (
            <button key={p} type="button" style={{ background: p }} aria-pressed={p === color} aria-label={`Colour ${p}`} onClick={() => setColor(p)} />
          ))}
        </div>
      </div>
      <div className="row-actions">
        <button className="btn btn-primary" onClick={save}>
          Save
        </button>
        <button className="btn" onClick={onDone}>
          Cancel
        </button>
        {!hasChildren && (
          <button className="btn btn-danger" onClick={remove}>
            Remove group
          </button>
        )}
      </div>
      {hasChildren && <p className="muted" style={{ margin: 0, fontSize: 12 }}>Move or remove its categories to remove this group.</p>}
    </div>
  )
}

interface EditorProps {
  initial: Category
  isNew?: boolean
  groups: Category[]
  ctx: MonthContext
  onDone: () => void
}

function CategoryEditor({ initial, isNew, groups, ctx, onDone }: EditorProps) {
  const [c, setC] = useState<Category>(initial)
  const [amountText, setAmountText] = useState(initial.amount ? String(initial.amount) : '')
  const kind = kindOf(c)
  const set = (patch: Partial<Category>) => setC((prev) => ({ ...prev, ...patch }))

  const preview: Category = { ...c, amount: Number(amountText) || 0 }
  const valid = c.name.trim().length > 0 && (kind === 'outside' || Number(amountText) >= 0)

  const save = async () => {
    if (!valid) return
    const parent = groups.find((g) => g.id === c.parentId)
    const record: Category = {
      ...preview,
      name: c.name.trim(),
      color: parent?.color ?? c.color,
      amount: kind === 'outside' ? 0 : preview.amount,
    }
    if (parent && parent.id !== initial.parentId) record.order = parent.order + 99
    await db.categories.put(record)
    onDone()
  }

  const remove = async () => {
    const used = await db.transactions.where('categoryId').equals(c.id).count()
    const msg = used
      ? `"${initial.name}" has ${used} expenses. It will be archived so your history stays intact.`
      : `Delete "${initial.name}"?`
    if (!confirm(msg)) return
    if (used) await db.categories.update(c.id, { archived: true })
    else await db.categories.delete(c.id)
    onDone()
  }

  return (
    <div className="cat-editor">
      <div className="form-grid">
        <label className="field">
          <span>Name</span>
          <input className="input" value={c.name} autoFocus={isNew} onChange={(e) => set({ name: e.target.value })} maxLength={40} placeholder="e.g. Fruit" />
        </label>
        <label className="field">
          <span>Group</span>
          <select className="select" value={c.parentId ?? ''} onChange={(e) => set({ parentId: e.target.value })}>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="field">
        <span>Type</span>
        <div className="seg full" role="group" aria-label="Type">
          {(['limited', 'input', 'outside'] as CategoryKind[]).map((k) => (
            <button key={k} type="button" aria-pressed={kind === k} onClick={() => set(applyKind(k))}>
              {KIND_LABEL[k]}
            </button>
          ))}
        </div>
        <p className="muted" style={{ margin: 0, fontSize: 12 }}>
          {kind === 'limited' && 'Has a limit. Goes red with a negative balance when you pass it.'}
          {kind === 'input' && 'Counts toward the total allowance, but is never flagged as over.'}
          {kind === 'outside' && 'Not part of the allowance. Spending is logged and charted only.'}
        </p>
      </div>

      {kind !== 'outside' && (
        <div className="form-grid">
          <div className="field wide">
            <span>Budget</span>
            <div className="seg full" role="group" aria-label="Budget mode">
              <button type="button" aria-pressed={c.budgetMode === 'fixed'} onClick={() => set({ budgetMode: 'fixed' })}>
                Fixed per month
              </button>
              <button type="button" aria-pressed={c.budgetMode === 'perDay'} onClick={() => set({ budgetMode: 'perDay', pacing: c.pacing === 'monthly' ? 'daily' : c.pacing })}>
                Rate per day
              </button>
            </div>
          </div>
          <label className="field wide">
            <span>{c.budgetMode === 'perDay' ? 'Amount per day (EGP)' : 'Amount per month (EGP)'}</span>
            <input className="input amt" inputMode="decimal" value={amountText} onChange={(e) => setAmountText(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="0" />
          </label>
        </div>
      )}

      {kind === 'limited' && (
        <div className="field">
          <span>Allowance released</span>
          <div className="seg full" role="group" aria-label="Pacing">
            {(['daily', 'weekly', 'monthly'] as Pacing[]).map((p) => (
              <button key={p} type="button" aria-pressed={c.pacing === p} disabled={p === 'monthly' && c.budgetMode === 'perDay'} onClick={() => set({ pacing: p })}>
                {PACING_LABEL[p]}
              </button>
            ))}
          </div>
        </div>
      )}

      {kind !== 'outside' && (c.budgetMode === 'perDay' || (kind === 'limited' && c.pacing !== 'monthly')) && (
        <div className="field">
          <span>Applies on</span>
          <div className="seg full" role="group" aria-label="Applies on">
            {(['all', 'office', 'nonOffice'] as DayRule[]).map((r) => (
              <button key={r} type="button" aria-pressed={c.dayRule === r} onClick={() => set({ dayRule: r })}>
                {RULE_LABEL[r]}
              </button>
            ))}
          </div>
        </div>
      )}

      {kind !== 'outside' && <p className="hint">{describe(preview, ctx)} this month.</p>}

      <div className="row-actions">
        <button className="btn btn-primary" disabled={!valid} onClick={save}>
          {isNew ? 'Add category' : 'Save'}
        </button>
        <button className="btn" onClick={onDone}>
          Cancel
        </button>
        {!isNew && (
          <button className="btn btn-danger" onClick={remove}>
            Remove
          </button>
        )}
      </div>
    </div>
  )
}
