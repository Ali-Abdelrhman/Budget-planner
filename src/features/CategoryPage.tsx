import { format } from 'date-fns'
import { useMemo, useState } from 'react'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Area, Bar, CartesianGrid, Cell, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ChartTooltip } from '../components/charts/ChartTooltip'
import { Icon } from '../components/Icon'
import { Money } from '../components/Money'
import { MonthSwitch } from '../components/MonthSwitch'
import { QuickAddSheet } from '../components/QuickAddSheet'
import { computeBalance, dailyAllocations, dayLedger, forecastMonthEnd, sumBalances } from '../domain/allowance'
import { fromISO, monthKeyOf } from '../domain/calendar'
import { formatAmount, formatEGP, round2 } from '../domain/money'
import { isBill } from '../domain/insights'
import { kindOf, type Category, type Transaction } from '../domain/types'
import { useMonthData, useRecentMonths } from '../hooks/useMonthData'
import { useThemeColors } from '../hooks/useThemeColors'
import { useToday } from '../hooks/useToday'

const KIND = { limited: 'Limited', input: 'Input only', outside: 'Outside allowance' } as const
const compact = (v: number) => (Math.abs(v) >= 1000 ? `${Math.round(v / 100) / 10}k` : formatAmount(v, { decimals: false }))

export function CategoryPage() {
  const { id = '' } = useParams()
  const [params, setParams] = useSearchParams()
  const today = useToday()
  const month = params.get('m') ?? monthKeyOf(today)
  const data = useMonthData(month)
  const recent = useRecentMonths(month, 6)
  const navigate = useNavigate()
  const location = useLocation()
  const c = useThemeColors()
  const [showAll, setShowAll] = useState(false)
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<Transaction | null>(null)

  const view = useMemo(() => {
    if (!data) return null
    const { categories, tree, ctx, spend, plan, transactions } = data
    const self = categories.find((x) => x.id === id)
    if (!self) return null
    const kids = tree.childrenOf.get(id)
    const cats: Category[] = kids ?? [self]
    const group = self.parentId ? categories.find((x) => x.id === self.parentId) : undefined
    const zero = new Array<number>(ctx.days.length).fill(0)
    const balances = new Map(cats.map((k) => [k.id, computeBalance(k, ctx, spend.get(k.id) ?? zero, plan.carryover[k.id] ?? 0)]))
    const limited = cats.filter((k) => k.hasLimit)
    const total = sumBalances([...balances.values()], limited.length > 0)
    const ledger = dayLedger(cats, ctx, spend, plan.carryover)
    const paced = limited.filter((k) => !isBill(k))
    const pacedAllocs = paced.map((k) => dailyAllocations(k, ctx))
    const ids = new Set(cats.map((k) => k.id))
    const txs = transactions.filter((t) => ids.has(t.categoryId)).sort((a, b) => b.createdAt - a.createdAt)
    const forecast = paced.length ? round2(paced.reduce((s, k) => s + (forecastMonthEnd(k, ctx, spend.get(k.id) ?? zero) ?? 0), 0)) : null
    const pacedLimit = round2(paced.reduce((s, k) => s + balances.get(k.id)!.budget + balances.get(k.id)!.carryover, 0))
    const elapsed = ctx.phase === 'future' ? 0 : ctx.todayIndex + 1
    const spentToDate = ledger.reduce((s, r) => s + r.spent, 0)
    const chart = ctx.days.map((d, i) => ({
      day: i + 1,
      label: format(fromISO(d), 'EEE d MMM'),
      spent: i < ledger.length ? ledger[i].spent : null,
      allowance: paced.length ? round2(pacedAllocs.reduce((s, a) => s + a[i], 0)) : null,
      over: (ledger[i]?.balanceAfter ?? 0) < 0,
      pos: i < ledger.length && ledger[i].balanceAfter !== null ? Math.max(0, ledger[i].balanceAfter!) : null,
      neg: i < ledger.length && ledger[i].balanceAfter !== null ? Math.min(0, ledger[i].balanceAfter!) : null,
    }))
    return { self, group, kids, cats, balances, total, limited, paced, ledger, txs, forecast, pacedLimit, elapsed, spentToDate, chart }
  }, [data, id])

  const history = useMemo(() => {
    if (!recent || !view) return []
    return recent
      .filter((r) => r.used || r.month === month)
      .map((r) => {
        const b = view.kids ? r.balances.byGroup.get(id) : r.balances.byCategory.get(id)
        return {
          label: format(fromISO(`${r.month}-01`), 'MMM'),
          spent: b?.spentMonth ?? 0,
          limit: view.limited.length && b ? round2(b.budget + b.carryover) : null,
        }
      })
  }, [recent, view, id, month])

  if (!data) return <div className="page" />
  if (!view) {
    return (
      <div className="page">
        <p className="empty">This category no longer exists.</p>
        <Link className="btn" to="/">
          Back to today
        </Link>
      </div>
    )
  }

  const { self, group, kids, balances, total, limited, paced, ledger, txs, forecast, pacedLimit, elapsed, spentToDate, chart } = view
  const { ctx, tree } = data
  const kind = kindOf(self.parentId ? self : (kids?.[0] ?? self))
  const goBack = () => (location.key !== 'default' ? navigate(-1) : navigate('/'))
  const setMonth = (m: string) => setParams({ m }, { replace: true })
  const catName = new Map(data.categories.map((x) => [x.id, x.name]))
  const hasLimit = limited.length > 0
  const daily = paced.filter((k) => k.pacing === 'daily')
  const txByDay = new Map<string, Transaction[]>()
  for (const t of txs) txByDay.set(t.date, [...(txByDay.get(t.date) ?? []), t])
  const days = [...ledger].reverse().filter((r) => showAll || txByDay.has(r.day))
  const axis = {
    tick: { fill: c['ink-3'], fontSize: 11, fontFamily: 'IBM Plex Mono, monospace' },
    axisLine: { stroke: c['rule-strong'] },
    tickLine: false,
  } as const
  const limitTotal = total.budget + total.carryover

  return (
    <div className="page">
      <header className="page-head">
        <div style={{ minWidth: 0 }}>
          <button className="back-link" onClick={goBack}>
            <Icon name="left" size={16} /> {group ? group.name : 'Back'}
          </button>
          <h1>{self.name}</h1>
        </div>
        <span className={`tag ${kind === 'limited' ? 'ok' : ''}`} style={kind === 'limited' ? undefined : { color: 'var(--ink-3)' }}>
          {KIND[kind]}
        </span>
      </header>

      <div className="toolbar">
        <MonthSwitch month={month} onChange={setMonth} />
        <span className="muted" style={{ fontSize: 13 }}>
          {txs.length} {txs.length === 1 ? 'entry' : 'entries'}
        </span>
      </div>

      {hasLimit ? (
        <>
          <div className="figures">
            <div className="figure">
              <div className="eyebrow">Spent</div>
              <Money className="value" value={total.spentMonth} signal={false} />
              <div className="sub">of {formatEGP(limitTotal)}</div>
            </div>
            <div className="figure">
              <div className="eyebrow">Left this month</div>
              <Money className="value" value={total.monthLeft} />
              <div className="sub">{total.carryover ? `incl. ${formatEGP(total.carryover)} carried` : limitTotal > 0 ? `${Math.round((total.spentMonth / limitTotal) * 100)}% used` : ''}</div>
            </div>
            <div className="figure">
              <div className="eyebrow">{daily.length ? 'Left today' : paced.length ? 'Left this week' : 'Status'}</div>
              {paced.length ? (
                <Money className="value" value={daily.length ? sumBalances(daily.map((k) => balances.get(k.id)!), true).todayLeft : total.weekLeft} />
              ) : (
                <span className="value">{total.spentMonth >= total.budget && total.budget > 0 ? 'Paid' : 'Due'}</span>
              )}
              <div className="sub">{ctx.phase === 'current' ? 'with rollover' : ctx.phase === 'past' ? 'month ended' : 'not started'}</div>
            </div>
          </div>
          {paced.length > 0 && (
            <div className="figures">
              <div className="figure">
                <div className="eyebrow">Per day</div>
                <Money className="value" value={elapsed ? spentToDate / elapsed : 0} signal={false} />
                <div className="sub">average spent</div>
              </div>
              <div className="figure">
                <div className="eyebrow">Allowance</div>
                <Money className="value" value={chart[ctx.todayIndex]?.allowance ?? 0} signal={false} />
                <div className="sub">{ctx.phase === 'current' ? 'added today' : 'on day ' + (ctx.todayIndex + 1)}</div>
              </div>
              <div className="figure">
                <div className="eyebrow">Month end</div>
                <Money className="value" value={forecast ?? 0} signal={false} />
                <div className={`sub ${forecast !== null && forecast > pacedLimit + 0.004 ? 'neg-text' : ''}`}>
                  {forecast === null ? '' : forecast > pacedLimit + 0.004 ? `over by ${formatEGP(forecast - pacedLimit)}` : 'at this rate'}
                </div>
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="figures">
          <div className="figure">
            <div className="eyebrow">Spent</div>
            <Money className="value" value={total.spentMonth} signal={false} />
            <div className="sub">this month</div>
          </div>
          <div className="figure">
            <div className="eyebrow">Entries</div>
            <span className="value amt">{txs.length}</span>
            <div className="sub">logged</div>
          </div>
          <div className="figure">
            <div className="eyebrow">Per entry</div>
            <Money className="value" value={txs.length ? total.spentMonth / txs.length : 0} signal={false} />
            <div className="sub">average</div>
          </div>
        </div>
      )}

      <div className="toolbar" style={{ borderBottom: 0, paddingBottom: 0 }}>
        <span className="muted" style={{ fontSize: 13 }}>
          {kind === 'outside' ? 'Tracked only, not part of the allowance.' : kind === 'input' ? 'Counts toward the allowance, never flagged as over.' : 'Unspent allowance rolls into the next day.'}
        </span>
        <button className="btn btn-primary add-bar" onClick={() => setAdding(true)}>
          <Icon name="plus" size={18} /> Add to {self.name}
        </button>
      </div>

      {kids && (
        <section className="section">
          <div className="section-head">
            <h2>In this group</h2>
          </div>
          {kids.map((k) => {
            const b = balances.get(k.id)!
            return (
              <Link key={k.id} to={`/c/${k.id}?m=${month}`} className="ledger-row link-row" style={{ gridTemplateColumns: 'minmax(0,1fr) auto auto' }}>
                <span className="label">
                  <span className="title">{k.name}</span>
                  <span className="meta">{k.hasLimit ? `${formatEGP(b.spentMonth)} of ${formatEGP(b.budget + b.carryover)}` : `${formatEGP(b.spentMonth)} spent`}</span>
                </span>
                {k.hasLimit ? <Money value={b.monthLeft} /> : <span />}
                <Icon name="right" size={16} />
              </Link>
            )
          })}
        </section>
      )}

      {ctx.phase !== 'future' && (
        <section className="section">
          <div className="section-head">
            <h2>Day by day</h2>
          </div>
          <p className="section-note">
            Dark bars are what you spent each day{paced.length ? ', and the grey bar behind is the allowance you got that day' : ''}. Red bars are days that left you below zero overall.
          </p>
          <div className="chart-box">
            <ResponsiveContainer>
              <ComposedChart data={chart} margin={{ top: 12, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid stroke={c.rule} vertical={false} />
                <XAxis dataKey="day" {...axis} interval="preserveStartEnd" minTickGap={14} />
                <XAxis dataKey="day" xAxisId="bg" hide />
                <YAxis {...axis} width={40} tickFormatter={compact} />
                <Tooltip content={<ChartTooltip title={(_, p) => String(p[0]?.payload?.label ?? '')} />} cursor={{ fill: c.rule, opacity: 0.4 }} />
                {paced.length > 0 && <Bar dataKey="allowance" name="Allowance" xAxisId="bg" fill={c['chart-allow']} fillOpacity={0.55} isAnimationActive={false} />}
                <Bar dataKey="spent" name="Spent" barSize={6} isAnimationActive={false}>
                  {chart.map((d) => (
                    <Cell key={d.day} fill={d.over ? c.over : c['chart-spent']} />
                  ))}
                </Bar>
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      {hasLimit && ctx.phase !== 'future' && (
        <section className="section">
          <div className="section-head">
            <h2>Running balance</h2>
          </div>
          <p className="section-note">What was left after each day. It climbs on days you spend less than the allowance and drops below zero, in red, when you overspend.</p>
          <div className="chart-box" style={{ height: 200 }}>
            <ResponsiveContainer>
              <ComposedChart data={chart} margin={{ top: 12, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid stroke={c.rule} vertical={false} />
                <XAxis dataKey="day" {...axis} interval="preserveStartEnd" minTickGap={14} />
                <YAxis {...axis} width={40} tickFormatter={compact} />
                <ReferenceLine y={0} stroke={c['ink-2']} />
                <Tooltip content={<BalanceTooltip />} cursor={{ stroke: c['rule-strong'] }} />
                <Area type="stepAfter" dataKey="pos" stroke={c.ok} fill={c.ok} fillOpacity={0.18} strokeWidth={1.5} isAnimationActive={false} />
                <Area type="stepAfter" dataKey="neg" stroke={c.over} fill={c.over} fillOpacity={0.22} strokeWidth={1.5} isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      <section className="section">
        <div className="section-head">
          <h2>Day log</h2>
          {ledger.length > 0 && (
            <div className="seg" role="group" aria-label="Days shown">
              <button aria-pressed={!showAll} onClick={() => setShowAll(false)}>
                With spending
              </button>
              <button aria-pressed={showAll} onClick={() => setShowAll(true)}>
                All days
              </button>
            </div>
          )}
        </div>
        {days.length === 0 && <p className="empty">{ctx.phase === 'future' ? 'This month has not started.' : `Nothing logged for ${self.name} this month.`}</p>}
        {days.map((r) => {
          const list = txByDay.get(r.day) ?? []
          const office = ctx.officeDays.has(r.day)
          return (
            <div className={`log-day ${list.length ? '' : 'quiet'}`} key={r.day}>
              <div className="log-head">
                <span>
                  {format(fromISO(r.day), 'EEE d MMM')}
                  {office && <span className="tag">Office</span>}
                </span>
                {list.length ? <Money value={r.spent} signal={false} /> : <span className="muted">nothing spent</span>}
              </div>
              {list.map((t) => (
                <button key={t.id} className="tx-row" onClick={() => setEditing(t)}>
                  <span className="muted amt" style={{ fontSize: 12 }}>
                    {format(t.createdAt, 'HH:mm')}
                  </span>
                  <span style={{ minWidth: 0 }}>
                    {kids ? catName.get(t.categoryId) : t.note || self.name}
                    {kids && t.note && <span className="note">{t.note}</span>}
                  </span>
                  <Money value={t.amount} signal={false} />
                </button>
              ))}
              {r.balanceAfter !== null && (
                <div className="log-foot">
                  <span>{r.alloc > 0 ? `+${formatEGP(r.alloc)} allowance` : 'no allowance added'}</span>
                  <span>
                    <Money value={r.balanceAfter} /> <span className="muted">left after</span>
                  </span>
                </div>
              )}
            </div>
          )
        })}
      </section>

      {history.length > 1 && (
        <section className="section">
          <div className="section-head">
            <h2>Last months</h2>
          </div>
          <p className="section-note">Spent each month{hasLimit ? ', against that month’s limit (line)' : ''}. Red means the limit was passed.</p>
          <div className="chart-box" style={{ height: 200 }}>
            <ResponsiveContainer>
              <ComposedChart data={history} margin={{ top: 12, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid stroke={c.rule} vertical={false} />
                <XAxis dataKey="label" {...axis} />
                <YAxis {...axis} width={40} tickFormatter={compact} />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: c.rule, opacity: 0.4 }} />
                <Bar dataKey="spent" name="Spent" isAnimationActive={false} maxBarSize={36}>
                  {history.map((h) => (
                    <Cell key={h.label} fill={h.limit !== null && h.spent > h.limit ? c.over : c['chart-spent']} />
                  ))}
                </Bar>
                {hasLimit && <Line dataKey="limit" name="Limit" stroke={c.pace} strokeDasharray="4 3" dot={{ r: 2.5, fill: c.pace }} isAnimationActive={false} />}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      {(adding || editing) && (
        <QuickAddSheet
          tree={tree}
          today={today}
          balances={ctx.phase === 'current' ? data.balances.byCategory : new Map()}
          initial={editing ?? undefined}
          defaultCategoryId={kids ? undefined : self.id}
          onClose={() => {
            setAdding(false)
            setEditing(null)
          }}
        />
      )}
    </div>
  )
}

function BalanceTooltip({ active, payload }: { active?: boolean; payload?: readonly { payload?: { label: string; pos: number | null; neg: number | null } }[] }) {
  const p = payload?.[0]?.payload
  if (!active || !p || (p.pos === null && p.neg === null)) return null
  const v = (p.neg ?? 0) < 0 ? p.neg! : (p.pos ?? 0)
  return (
    <div className="chart-tooltip">
      <div className="t">{p.label}</div>
      <div className="r">
        <span>Left after</span>
        <span className={`amt ${v < 0 ? 'neg' : ''}`}>{formatEGP(v)}</span>
      </div>
    </div>
  )
}
