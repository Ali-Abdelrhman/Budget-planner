const paths = {
  today: 'M4 6h16M4 12h16M4 18h10',
  month: 'M4 7h16v13H4zM4 11h16M9 4v5M15 4v5',
  charts: 'M4 20h16M7 20V11M12 20V5M17 20v-6',
  history: 'M12 7v5l3 2M4.5 12a7.5 7.5 0 1 0 2.2-5.3M4 4v3.5h3.5',
  setup: 'M4 7h9M17 7h3M4 17h3M11 17h9M15 5v4M9 15v4',
  plus: 'M12 5v14M5 12h14',
  left: 'M15 5l-7 7 7 7',
  right: 'M9 5l7 7-7 7',
  close: 'M6 6l12 12M18 6L6 18',
  back: 'M10 7l-5 5 5 5M5 12h14',
}

export type IconName = keyof typeof paths

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="square" aria-hidden="true">
      <path d={paths[name]} />
    </svg>
  )
}
