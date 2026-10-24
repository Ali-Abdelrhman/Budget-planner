import { Link } from 'react-router-dom'
import { formatAmount } from '../domain/money'
import type { UsageRow } from '../domain/insights'

export function UsageBars({ rows, month }: { rows: UsageRow[]; month: string }) {
  return (
    <div className="usage">
      {rows.map((r) => {
        const over = r.spent > r.limit + 0.004
        const ahead = !over && r.expectedPct !== null && r.pct > r.expectedPct + 5
        const tone = over ? 'over' : ahead ? 'warn' : 'ok'
        return (
          <Link key={r.id} to={`/c/${r.id}?m=${month}`} className="usage-row">
            <span className="usage-name">{r.name}</span>
            <span className={`usage-pct amt ${tone}`}>{Math.round(r.pct)}%</span>
            <span className="usage-track" aria-hidden="true">
              <i className={tone} style={{ width: `${Math.min(100, r.pct)}%` }} />
              {r.expectedPct !== null && r.expectedPct < 100 && <b style={{ left: `${r.expectedPct}%` }} />}
            </span>
            <span className="usage-label">
              {formatAmount(r.spent)} of {formatAmount(r.limit)} EGP
              {over && <span className="neg-text">, over by {formatAmount(r.spent - r.limit)}</span>}
            </span>
          </Link>
        )
      })}
    </div>
  )
}
