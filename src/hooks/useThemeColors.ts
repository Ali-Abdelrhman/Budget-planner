import { useEffect, useState } from 'react'

const NAMES = ['ink', 'ink-2', 'ink-3', 'rule', 'rule-strong', 'paper', 'sheet', 'ok', 'warn', 'over', 'pace', 'chart-spent', 'chart-allow'] as const
export type ThemeColors = Record<(typeof NAMES)[number], string>

function read(): ThemeColors {
  const s = getComputedStyle(document.documentElement)
  return Object.fromEntries(NAMES.map((n) => [n, s.getPropertyValue(`--${n}`).trim()])) as ThemeColors
}

/** Resolved token colours for SVG charts, refreshed when the theme changes. */
export function useThemeColors(): ThemeColors {
  const [colors, setColors] = useState(read)
  useEffect(() => {
    const update = () => setColors(read())
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    mq.addEventListener('change', update)
    const mo = new MutationObserver(update)
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => {
      mq.removeEventListener('change', update)
      mo.disconnect()
    }
  }, [])
  return colors
}
