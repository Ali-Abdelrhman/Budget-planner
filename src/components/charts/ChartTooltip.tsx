import { formatEGP } from '../../domain/money'

interface Item {
  name?: string | number
  value?: number | string | null
  color?: string
  dataKey?: string | number
  payload?: Record<string, unknown>
}

interface Props {
  active?: boolean
  payload?: readonly Item[]
  label?: string | number
  title?: (label: string | number | undefined, payload: readonly Item[]) => string
}

export function ChartTooltip({ active, payload, label, title }: Props) {
  if (!active || !payload?.length) return null
  return (
    <div className="chart-tooltip">
      <div className="t">{title ? title(label, payload) : label}</div>
      {payload
        .filter((p) => p.value !== null && p.value !== undefined)
        .map((p) => (
          <div className="r" key={String(p.dataKey ?? p.name)}>
            <span style={{ color: p.color }}>{p.name}</span>
            <span className="amt">{formatEGP(Number(p.value))}</span>
          </div>
        ))}
    </div>
  )
}
