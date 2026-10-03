import { useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  LabelList,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { ChartTooltip } from '../components/charts/ChartTooltip'
import { MonthSwitch } from '../components/MonthSwitch'
import { Money } from '../components/Money'
import { monthKeyOf } from '../domain/calendar'
import { dailyTotals, groupShares, histogram, limitRows, paceSeries, pickBinSize, spendScale, transactionSizes, weeklyRows } from '../domain/insights'
import { formatAmount, formatEGP } from '../domain/money'
import { useMonthData } from '../hooks/useMonthData'
import { useThemeColors } from '../hooks/useThemeColors'
import { useToday } from '../hooks/useToday'

const compact = (v: number) => (Math.abs(v) >= 1000 ? `${Math.round(v / 100) / 10}k` : formatAmount(v, { decimals: false }))

export function ChartsPage() {
  const today = useToday()
  const [month, setMonth] = useState(monthKeyOf(today))
  const [scope, setScope] = useState('all')
  const [includeOutside, setIncludeOutside] = useState(false)
  const data = useMonthData(month)
  const c = useThemeColors()

  const derived = useMemo(() => {
    if (!data) return null
    const { tree, ctx, spend, plan, balances, transactions } = data
    const inside = tree.leaves.filter((l) => l.inAllowance)
    const limited = inside.filter((l) => l.hasLimit)
    const scoped =
      scope === 'all'
        ? limited
        : tree.childrenOf.has(scope)
          ? tree.childrenOf.get(scope)!.filter((l) => l.hasLimit)
          : limited.filter((l) => l.id === scope)
    const isCurrent = month === monthKeyOf(today)
    const pace = paceSeries(ctx, scoped, spend, plan.carryover, !isCurrent && month < monthKeyOf(today))
    const daily = dailyTotals(ctx, inside, spend)
    const sizes = transactionSizes(transactions, inside)
    const limits = limitRows(tree, balances).sort((a, b) => b.spent - a.spent || b.limit - a.limit)
    const limitMax = spendScale(limits.map((l) => l.spent))
    const weeks = weeklyRows(ctx, limited, spend)
    const weekMax = spendScale(weeks.map((w) => w.spent))
    return {
      inside,
      limited,
      pace,
      isCurrent,
      shares: groupShares(tree, balances, includeOutside),
      dailyBins: histogram(daily, pickBinSize(daily)),
      sizeBins: histogram(sizes, pickBinSize(sizes)),
      daysCount: daily.length,
      txCount: sizes.length,
      limits: limits.map((l) => ({ ...l, limitBar: Math.min(l.limit, limitMax) })),
      weeks: weeks.map((w) => ({ ...w, allowanceBar: Math.min(w.allowance, weekMax) })),
      paceMax: spendScale(pace.map((p) => p.spent ?? 0)),
      limitMax,
      weekMax,
    }
  }, [data, scope, includeOutside, month, today])

  if (!data || !derived) return <div className="page" />
  const { tree, ctx } = data
  const shareTotal = derived.shares.reduce((s, x) => s + x.value, 0)

  const axis = {
    tick: { fill: c['ink-3'], fontSize: 11, fontFamily: 'IBM Plex Mono, monospace' },
    axisLine: { stroke: c['rule-strong'] },
    tickLine: false,
  } as const
  const grid = <CartesianGrid stroke={c.rule} vertical={false} />

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
          <h2>Spending against pace</h2>
          <select className="select" style={{ width: 'auto', minHeight: 34, fontSize: 14 }} value={scope} onChange={(e) => setScope(e.target.value)} aria-label="Category">
            <option value="all">All limited categories</option>
            {tree.groups
              .filter((g) => (tree.childrenOf.get(g.id) ?? []).some((k) => k.hasLimit))
              .map((g) => (
                <optgroup key={g.id} label={g.name}>
                  <option value={g.id}>{g.name} (group)</option>
                  {(tree.childrenOf.get(g.id) ?? [])
                    .filter((k) => k.hasLimit)
                    .map((k) => (
                      <option key={k.id} value={k.id}>
                        {k.name}
                      </option>
                    ))}
                </optgroup>
              ))}
          </select>
        </div>
        <p className="section-note">The dashed line is the allowance released so far. The chart is scaled to your spending, so the allowance line runs off the top when you are well under it. Tap a day to see both values.</p>
        <div className="chart-box tall">
          <ResponsiveContainer>
            <LineChart data={derived.pace} margin={{ top: 12, right: 8, bottom: 0, left: 0 }}>
              {grid}
              <XAxis dataKey="day" {...axis} interval="preserveStartEnd" minTickGap={18} />
              <YAxis {...axis} width={44} tickFormatter={compact} domain={[0, derived.paceMax]} allowDataOverflow />
              <Tooltip content={<ChartTooltip title={(_, p) => String(p[0]?.payload?.label ?? '')} />} cursor={{ stroke: c['rule-strong'] }} />
              {derived.isCurrent && <ReferenceLine x={ctx.todayIndex + 1} stroke={c['ink-3']} strokeDasharray="2 3" label={{ value: 'today', position: 'insideTopRight', fill: c['ink-3'], fontSize: 11 }} />}
              <Line type="stepAfter" dataKey="pace" name="Allowance" stroke={c.pace} strokeWidth={1.5} strokeDasharray="5 4" dot={false} isAnimationActive={false} />
              <Line type="monotone" dataKey="spent" name="Spent" stroke={c['chart-spent']} strokeWidth={2.25} dot={false} connectNulls={false} isAnimationActive={false} />
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
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h2>Where it went</h2>
          <div className="seg" role="group" aria-label="Pie scope">
            <button aria-pressed={!includeOutside} onClick={() => setIncludeOutside(false)}>
              Allowance
            </button>
            <button aria-pressed={includeOutside} onClick={() => setIncludeOutside(true)}>
              Everything
            </button>
          </div>
        </div>
        {derived.shares.length === 0 ? (
          <p className="empty">No spending recorded for this month yet.</p>
        ) : (
          <div className="pie-layout">
            <div className="chart-box" style={{ height: 240 }}>
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={derived.shares} dataKey="value" nameKey="name" outerRadius="92%" stroke={c.paper} strokeWidth={2} isAnimationActive={false}>
                    {derived.shares.map((s) => (
                      <Cell key={s.id} fill={s.color} />
                    ))}
                  </Pie>
                  <Tooltip content={<ChartTooltip title={(_, p) => String(p[0]?.name ?? '')} />} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="share-list">
              {derived.shares.map((s) => (
                <div className="share-row" key={s.id}>
                  <i className="swatch" style={{ background: s.color }} />
                  <span>{s.name}</span>
                  <span className="pct">{Math.round((s.value / shareTotal) * 100)}%</span>
                  <Money value={s.value} signal={false} />
                </div>
              ))}
              <div className="share-row" style={{ borderBottom: 0, fontWeight: 600 }}>
                <span />
                <span>Total</span>
                <span />
                <Money value={shareTotal} currency signal={false} />
              </div>
            </div>
          </div>
        )}
      </section>

      <section className="section">
        <div className="section-head">
          <h2>Limits</h2>
          <span className="muted" style={{ fontSize: 13 }}>
            {derived.limits.filter((l) => l.over).length} over
          </span>
        </div>
        <p className="section-note">Dark bar is spent, red when it passes the limit. Light bar is the limit; when it is far bigger than your spending it is cut at the edge and its value is written on it.</p>
        <div className="chart-box" style={{ height: derived.limits.length * 30 + 30 }}>
          <ResponsiveContainer>
            <BarChart data={derived.limits} layout="vertical" margin={{ top: 4, right: 12, bottom: 0, left: 0 }} barGap={-14} barSize={14}>
              <CartesianGrid stroke={c.rule} horizontal={false} />
              <XAxis type="number" {...axis} tickFormatter={compact} domain={[0, derived.limitMax]} />
              <YAxis type="category" dataKey="name" {...axis} width={112} tick={{ ...axis.tick, fontFamily: 'IBM Plex Sans, sans-serif', fontSize: 12, fill: c['ink-2'] }} />
              <Tooltip content={<ChartTooltip realValues={{ limitBar: 'limit' }} />} cursor={{ fill: c.rule, opacity: 0.4 }} />
              <Bar dataKey="limitBar" name="Limit" fill={c['chart-allow']} isAnimationActive={false}>
                <LabelList dataKey="limit" content={(p) => <ClippedLabel {...p} max={derived.limitMax} color={c['ink-2']} horizontal />} />
              </Bar>
              <Bar dataKey="spent" name="Spent" isAnimationActive={false} barSize={8}>
                {derived.limits.map((l) => (
                  <Cell key={l.id} fill={l.over ? c.over : l.spent >= l.limit * 0.8 ? c.warn : c['chart-spent']} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h2>Week by week</h2>
        </div>
        <p className="section-note">Allowance released in each week against what you spent in it. Allowance bars taller than the chart are cut and labelled. Weeks start on {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][data.settings.weekStartsOn]}.</p>
        <div className="chart-box">
          <ResponsiveContainer>
            <BarChart data={derived.weeks} margin={{ top: 12, right: 8, bottom: 0, left: 0 }} barGap={2}>
              {grid}
              <XAxis dataKey="label" {...axis} />
              <YAxis {...axis} width={44} tickFormatter={compact} domain={[0, derived.weekMax]} />
              <Tooltip content={<ChartTooltip title={(l) => `Days ${l}`} realValues={{ allowanceBar: 'allowance' }} />} cursor={{ fill: c.rule, opacity: 0.4 }} />
              <Bar dataKey="allowanceBar" name="Allowance" fill={c['chart-allow']} isAnimationActive={false}>
                <LabelList dataKey="allowance" content={(p) => <ClippedLabel {...p} max={derived.weekMax} color={c['ink-2']} />} />
              </Bar>
              <Bar dataKey="spent" name="Spent" isAnimationActive={false}>
                {derived.weeks.map((w, i) => (
                  <Cell key={i} fill={w.spent > w.allowance ? c.over : c['chart-spent']} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="legend">
          <span>
            <i className="swatch" style={{ background: c['chart-allow'] }} /> Allowance
          </span>
          <span>
            <i className="swatch" style={{ background: c['chart-spent'] }} /> Spent
          </span>
          <span>
            <i className="swatch" style={{ background: c.over }} /> Over that week
          </span>
        </div>
      </section>

      <div className="two-col">
        <section className="section">
          <div className="section-head">
            <h2>Daily totals</h2>
            <span className="muted" style={{ fontSize: 13 }}>
              {derived.daysCount} days
            </span>
          </div>
          <p className="section-note">How many days fell into each spending range (EGP per day, allowance only).</p>
          <Histogram bins={derived.dailyBins} colors={c} axis={axis} what="days" />
        </section>
        <section className="section">
          <div className="section-head">
            <h2>Expense sizes</h2>
            <span className="muted" style={{ fontSize: 13 }}>
              {derived.txCount} expenses
            </span>
          </div>
          <p className="section-note">How many single expenses fell into each amount range (EGP).</p>
          <Histogram bins={derived.sizeBins} colors={c} axis={axis} what="expenses" />
        </section>
      </div>

      <p className="section-note" style={{ margin: '24px 0 0' }}>
        Allowance this month: {formatEGP(data.balances.allowance.budget)}
        {data.balances.allowance.carryover ? `, plus ${formatEGP(data.balances.allowance.carryover)} carried` : ''}.
      </p>
    </div>
  )
}

function Histogram({
  bins,
  colors: c,
  axis,
  what,
}: {
  bins: { label: string; count: number }[]
  colors: ReturnType<typeof useThemeColors>
  axis: object
  what: string
}) {
  return (
    <div className="chart-box" style={{ height: 220 }}>
      <ResponsiveContainer>
        <BarChart data={bins} margin={{ top: 12, right: 8, bottom: 0, left: 0 }} barCategoryGap={1}>
          <CartesianGrid stroke={c.rule} vertical={false} />
          <XAxis dataKey="label" {...axis} interval="preserveStartEnd" minTickGap={8} />
          <YAxis {...axis} width={28} allowDecimals={false} />
          <Tooltip content={<ChartTooltip unit="count" title={(l) => `${l} EGP`} />} cursor={{ fill: c.rule, opacity: 0.4 }} />
          <Bar dataKey="count" name={what} fill={c['chart-spent']} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

interface ClippedLabelProps {
  x?: number | string
  y?: number | string
  width?: number | string
  height?: number | string
  value?: unknown
  max: number
  color: string
  horizontal?: boolean
}

/** Writes the real value on an allowance bar that was cut off at the edge of the chart. */
function ClippedLabel({ x, y, width, height, value, max, color, horizontal }: ClippedLabelProps) {
  const v = Number(value)
  if (!(v > max)) return null
  const [nx, ny, nw, nh] = [x, y, width, height].map(Number)
  const style = { fontFamily: 'IBM Plex Mono, monospace', fontSize: 10.5, fill: color }
  if (horizontal) {
    return (
      <text x={nx + nw - 6} y={ny + nh / 2} dy={3.5} textAnchor="end" style={style}>
        {compact(v)}
      </text>
    )
  }
  return (
    <text x={nx + nw / 2} y={ny + 12} textAnchor="middle" style={style}>
      {compact(v)}
    </text>
  )
}
