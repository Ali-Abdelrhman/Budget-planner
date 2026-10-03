import type { Status } from '../domain/allowance'

interface Props {
  spent: number
  limit: number
  status: Status
  /** Optional marker for how much should have been used by today. */
  pace?: number
}

export function Meter({ spent, limit, status, pace }: Props) {
  if (limit <= 0) return null
  const pct = Math.max(0, Math.min(100, (spent / limit) * 100))
  const pacePct = pace === undefined || pace <= 0 ? null : Math.min(100, (pace / limit) * 100)
  return (
    <div className={`meter ${status}`} role="presentation">
      <i style={{ width: `${pct}%` }} />
      {pacePct !== null && pacePct < 100 && <b style={{ left: `${pacePct}%` }} />}
    </div>
  )
}
