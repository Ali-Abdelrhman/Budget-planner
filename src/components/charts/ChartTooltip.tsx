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
  unit?: 'egp' | 'count'
  /** Maps a capped bar's dataKey to the field holding its real value. */
  realValues?: Record<string, string>
}

export function ChartTooltip({ active, payload, label, title, unit = 'egp', realValues }: Props) {
  if (!active || !payload?.length) return null
  return (
    <div className="chart-tooltip">
      <div className="t">{title ? title(label, payload) : label}</div>
      {payload
        .filter((p) => p.value !== null && p.value !== undefined)
        .map((p) => (
          <div className="r" key={String(p.dataKey ?? p.name)}>
            <span style={{ color: p.color }}>{p.name}</span>
            <span className="amt">{format(realValues?.[String(p.dataKey)] ? p.payload?.[realValues[String(p.dataKey)]] : p.value, unit)}</span>
          </div>
        ))}
    </div>
  )
}

function format(v: unknown, unit: 'egp' | 'count') {
  return unit === 'egp' ? formatEGP(Number(v)) : String(v)
}
