const whole = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })
const precise = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/** Formats an EGP amount. Values under 100 keep two decimals so small daily allowances stay readable. */
export function formatAmount(n: number, opts: { decimals?: boolean } = {}): string {
  const value = round2(n)
  const abs = Math.abs(value)
  const useDecimals = opts.decimals ?? (abs < 100 && abs % 1 !== 0)
  const body = useDecimals ? precise.format(abs) : whole.format(Math.round(abs))
  if (body === '0' || body === '0.00') return body
  return value < 0 ? `-${body}` : body
}

export function formatEGP(n: number, opts?: { decimals?: boolean }): string {
  return `${formatAmount(n, opts)} EGP`
}
