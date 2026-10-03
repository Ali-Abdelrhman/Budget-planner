import { formatAmount } from '../domain/money'

interface Props {
  value: number
  currency?: boolean
  decimals?: boolean
  className?: string
  /** Colour negative values red. On by default. */
  signal?: boolean
}

export function Money({ value, currency = false, decimals, className = '', signal = true }: Props) {
  const neg = signal && value < -0.004
  return (
    <span className={`amt ${neg ? 'neg' : ''} ${className}`}>
      {formatAmount(value, { decimals })}
      {currency && <span className="cur">EGP</span>}
    </span>
  )
}
