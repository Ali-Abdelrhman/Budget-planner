import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bar, CartesianGrid, Cell, ComposedChart, Line, LineChart, Pie, PieChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ChartTooltip } from '../components/charts/ChartTooltip'
import { Money } from '../components/Money'
import { MonthSwitch } from '../components/MonthSwitch'
import { UsageBars } from '../components/UsageBars'
import { monthKeyOf } from '../domain/calendar'
import { budgetUsage, dailyStacked, forecastRows, isBill, monthTrend, paceSeries, shares, stackGroups } from '../domain/insights'
import { formatAmount, formatEGP } from '../domain/money'
import { useMonthData, useRecentMonths } from '../hooks/useMonthData'
import { useThemeColors } from '../hooks/useThemeColors'
import { useToday } from '../hooks/useToday'

const compact = (v: number) => (Math.abs(v) >= 1000 ? `${Math.round(v / 100) / 10}k` : formatAmount(v, { decimals: false }))

export function ChartsPage() {
  const today = useToday()
  const [month, setMonth] = useState(monthKeyOf(today))
  const [includeBills, setIncludeBills] = useState(false)
  const [includeOutside, setIncludeOutside] = useState(false)
  const [level, setLevel] = useState<'group' | 'category'>('category')
  const data = useMonthData(month)
  const recent = useRecentMonths(month, 6)
  const c = useThemeColors()

  const d = useMemo(() => {
    if (!data) return null
    const { tree, ctx, spend, plan, balances } = data
    const limited = tree.leaves.filter((l) => l.inAllowance && l.hasLimit)
    const paceCats = limited.filter((l) => includeBills || !isBill(l))
    return {
      usage: budgetUsage(tree, balances, ctx),
      daily: dailyStacked(ctx, tree, spend, includeBills),
      groups: stackGroups(tree, includeBills),
      pace: paceSeries(ctx, paceCats, spend, plan.carryover),
      forecast: forecastRows(tree, balances, ctx, spend),
      slices: shares(tree, balances, includeOutside, level),
    }
  }, [data, includeBills, includeOutside, level])

  const trend = useMemo(() => (recent ? monthTrend(recent) : []), [recent])

  if (!data || !d) return <div className="page" />
  const { ctx } = data
  const sliceTotal = d.slices.reduce((s, x) => s + x.value, 0)
  const isCurrent = ctx.phase === 'current'
  const last = d.pace.at(-1)
  const axis = {
    tick: { fill: c['ink-3'], fontSize: 11, fontFamily: 'IBM Plex Mono, monospace' },
    axisLine: { stroke: c['rule-strong'] },
    tickLine: false,
  } as const
  const grid = <CartesianGrid stroke={c.rule} vertical={false} />
  const dayTitle = (_: unknown, p: readonly { payload?: Record<string, unknown> }[]) => String(p[0]?.payload?.label ?? '')
  const billsToggle = (
    <div className="seg" role="group" aria-label="Monthly bills">
      <button aria-pressed={!includeBills} onClick={() => setIncludeBills(false)}>
        Without bills
      </button>
      <button aria-pressed={includeBills} onClick={() => setIncludeBills(true)}>
        With bills
      </button>
    </div>
  )

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <div className="eyebrow">Charts</div>
          <h1>How the month is going</h1>
        </div>
      </header>

      <div className="toolbar">
        <MonthSwitch month={month} onChange={setMonth} />
      </div>

      <section className="section">
        <div className="section-head">
          <h2>Budget used</h2>
          <span className="muted" style={{ fontSize: 13 }}>
            {d.usage.filter((u) => u.spent > u.limit + 0.004).length} over
          </span>
        </div>
        <p className="section-note">
          Each bar is measured against its own limit.{isCurrent ? ' The tick shows how much should be used by today, so a bar past its tick is running ahead.' : ''} Tap a row to see its days.
        </p>
        <UsageBars rows={d.usage} month={month} />
      </section>

      <section className="section">
        <div className="section-head">
          <h2>Spending per day</h2>
          {billsToggle}
        </div>
        <p className="section-note">Coloured bars are what you spent each day, by group. The grey bar behind is the allowance you got that day, so colour poking above the grey means you spent more than you got. Tall grey bars are office days.</p>
        <div className="chart-box">
          <ResponsiveContainer>
            <ComposedChart data={d.daily} margin={{ top: 12, right: 8, bottom: 0, left: 0 }}>
              {grid}
              <XAxis dataKey="day" {...axis} interval="preserveStartEnd" minTickGap={14} />
              <XAxis dataKey="day" xAxisId="bg" hide />
              <YAxis {...axis} width={40} tickFormatter={compact} />
              <Tooltip content={<ChartTooltip title={dayTitle} />} cursor={{ fill: c.rule, opacity: 0.4 }} />
              <Bar dataKey="allowance" name="Allowance" xAxisId="bg" fill={c['chart-allow']} fillOpacity={0.55} isAnimationActive={false} />
              {isCurrent && <ReferenceLine x={ctx.todayIndex + 1} stroke={c['ink-3']} strokeDasharray="2 3" />}
              {d.groups.map((g) => (
                <Bar key={g.id} dataKey={g.id} name={g.name} stackId="day" fill={g.color} barSize={6} isAnimationActive={false} />
              ))}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <div className="legend">
          {d.groups.map((g) => (
            <span key={g.id}>
              <i className="swatch" style={{ background: g.color }} /> {g.name}
            </span>
          ))}
          <span>
            <i className="swatch" style={{ background: c['chart-allow'] }} /> Allowance that day
          </span>
        </div>
      </section>

      {ctx.phase !== 'future' && (
        <section className="section">
          <div className="section-head">
            <h2>Am I on pace?</h2>
            {billsToggle}
          </div>
          <p className="section-note">
            Total spent so far against total allowance released so far. Staying under the dashed line means money is rolling forward.
            {isCurrent && last?.forecast != null ? ` At this rate you end the month at ${formatEGP(last.forecast)} against ${formatEGP(last.pace)}.` : ''}
          </p>
          <div className="chart-box">
            <ResponsiveContainer>
              <LineChart data={d.pace} margin={{ top: 12, right: 8, bottom: 0, left: 0 }}>
                {grid}
                <XAxis dataKey="day" {...axis} interval="preserveStartEnd" minTickGap={14} />
                <YAxis {...axis} width={40} tickFormatter={compact} />
                <Tooltip content={<ChartTooltip title={dayTitle} />} cursor={{ stroke: c['rule-strong'] }} />
                <Line type="stepAfter" dataKey="pace" name="Allowance" stroke={c.pace} strokeWidth={1.5} strokeDasharray="5 4" dot={false} isAnimationActive={false} />
                <Line type="monotone" dataKey="forecast" name="Forecast" stroke={c['chart-spent']} strokeWidth={1.5} strokeDasharray="1 4" strokeLinecap="round" dot={false} isAnimationActive={false} />
                <Line type="monotone" dataKey="spent" name="Spent" stroke={c['chart-spent']} strokeWidth={2.25} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="legend">
            <span>
              <i className="line" style={{ borderColor: c['chart-spent'] }} /> Spent
            </span>
            <span>
              <i className="line dashed" style={{ borderColor: c.pace }} /> Allowance released
            </span>
            {isCurrent && (
              <span>
                <i className="line dotted" style={{ borderColor: c['chart-spent'] }} /> Forecast
              </span>
            )}
          </div>
        </section>
      )}

      {isCurrent && d.forecast.length > 0 && (
        <section className="section">
          <div className="section-head">
            <h2>Month-end forecast</h2>
          </div>
          <p className="section-note">Where each daily category lands on the last day if you keep spending at your current rate.</p>
          {d.forecast.map((f) => {
            const diff = f.forecast - f.limit
            return (
              <Link key={f.id} to={`/c/${f.id}?m=${month}`} className="ledger-row link-row" style={{ gridTemplateColumns: 'minmax(0,1fr) auto' }}>
                <span className="label">
                  <span className="title">{f.name}</span>
                  <span className="meta">
                    on track for {formatEGP(f.forecast)} of {formatEGP(f.limit)}
                  </span>
                </span>
                <span className={`amt ${diff > 0.004 ? 'neg' : ''}`} style={{ fontSize: 13, color: diff > 0.004 ? undefined : 'var(--ok)' }}>
                  {diff > 0.004 ? `over ${formatAmount(diff)}` : `${formatAmount(-diff)} spare`}
                </span>
              </Link>
            )
          })}
        </section>
      )}

      <section className="section">
        <div className="section-head">
          <h2>Where it went</h2>
          <div className="seg" role="group" aria-label="Pie detail">
            <button aria-pressed={level === 'category'} onClick={() => setLevel('category')}>
              Categories
            </button>
            <button aria-pressed={level === 'group'} onClick={() => setLevel('group')}>
              Groups
            </button>
          </div>
        </div>
        <div className="toolbar" style={{ borderBottom: 0, paddingBottom: 0 }}>
          <div className="seg" role="group" aria-label="Pie scope">
            <button aria-pressed={!includeOutside} onClick={() => setIncludeOutside(false)}>
              Allowance only
            </button>
            <button aria-pressed={includeOutside} onClick={() => setIncludeOutside(true)}>
              Include outside
            </button>
          </div>
        </div>
        {d.slices.length === 0 ? (
          <p className="empty">No spending recorded for this month yet.</p>
        ) : (
          <div className="pie-layout">
            <div className="chart-box" style={{ height: 240 }}>
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={d.slices} dataKey="value" nameKey="name" outerRadius="92%" stroke={c.paper} strokeWidth={2} isAnimationActive={false}>
                    {d.slices.map((s) => (
                      <Cell key={s.id} fill={s.color} fillOpacity={s.opacity} />
                    ))}
                  </Pie>
                  <Tooltip content={<ChartTooltip title={(_, p) => String(p[0]?.name ?? '')} />} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="share-list">
              {d.slices.map((s) => (
                <Link className="share-row link-row" key={s.id} to={`/c/${s.id}?m=${month}`}>
                  <i className="swatch" style={{ background: s.color, opacity: s.opacity }} />
                  <span>{s.name}</span>
                  <span className="pct">{Math.round((s.value / sliceTotal) * 100)}%</span>
                  <Money value={s.value} signal={false} />
                </Link>
              ))}
              <div className="share-row" style={{ borderBottom: 0, fontWeight: 600 }}>
                <span />
                <span>Total</span>
                <span />
                <Money value={sliceTotal} currency signal={false} />
              </div>
            </div>
          </div>
        )}
      </section>

      <section className="section">
        <div className="section-head">
          <h2>Month by month</h2>
        </div>
        {trend.length < 2 ? (
          <p className="section-note">This fills in as you use Qersh. After your second month you will see each month’s spending against its allowance here.</p>
        ) : (
          <>
            <p className="section-note">Allowance spending each month, with outside-allowance spending on top. The dashed line is that month’s allowance.</p>
            <div className="chart-box">
              <ResponsiveContainer>
                <ComposedChart data={trend} margin={{ top: 12, right: 8, bottom: 0, left: 0 }}>
                  {grid}
                  <XAxis dataKey="label" {...axis} />
                  <YAxis {...axis} width={40} tickFormatter={compact} />
                  <Tooltip content={<ChartTooltip />} cursor={{ fill: c.rule, opacity: 0.4 }} />
                  <Bar dataKey="inside" name="Allowance spending" stackId="m" fill={c['chart-spent']} maxBarSize={40} isAnimationActive={false} />
                  <Bar dataKey="outside" name="Outside allowance" stackId="m" fill={c['chart-allow']} maxBarSize={40} isAnimationActive={false} />
                  <Line dataKey="allowance" name="Allowance" stroke={c.pace} strokeDasharray="4 3" dot={{ r: 2.5, fill: c.pace }} isAnimationActive={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
      </section>
    </div>
  )
}
