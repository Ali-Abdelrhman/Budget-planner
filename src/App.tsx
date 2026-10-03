import { lazy, Suspense, useEffect } from 'react'
import { HashRouter, NavLink, Navigate, Route, Routes } from 'react-router-dom'
import { MonthCloseGate } from './components/CloseMonthSheet'
import { Icon, type IconName } from './components/Icon'
import { HistoryPage } from './features/HistoryPage'
import { MonthPage } from './features/MonthPage'
import { SetupPage } from './features/SetupPage'
import { TodayPage } from './features/TodayPage'
import { useSettings } from './hooks/useMonthData'

const ChartsPage = lazy(() => import('./features/ChartsPage').then((m) => ({ default: m.ChartsPage })))

const TABS: { to: string; label: string; icon: IconName }[] = [
  { to: '/', label: 'Today', icon: 'today' },
  { to: '/month', label: 'Month', icon: 'month' },
  { to: '/charts', label: 'Charts', icon: 'charts' },
  { to: '/history', label: 'History', icon: 'history' },
  { to: '/setup', label: 'Setup', icon: 'setup' },
]

function useThemeAttribute() {
  const { theme } = useSettings()
  useEffect(() => {
    const root = document.documentElement
    if (theme === 'system') root.removeAttribute('data-theme')
    else root.setAttribute('data-theme', theme)
    const bg = getComputedStyle(root).getPropertyValue('--paper').trim()
    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => {
      if (theme !== 'system') m.setAttribute('content', bg)
    })
  }, [theme])
}

export function App() {
  useThemeAttribute()
  return (
    <HashRouter>
      <div className="shell">
        <nav className="tabbar" aria-label="Main">
          <div className="brand">
            Qersh
            <small>Budget in EGP</small>
          </div>
          {TABS.map((t) => (
            <NavLink key={t.to} to={t.to} end={t.to === '/'} className={({ isActive }) => `tab ${isActive ? 'active' : ''}`}>
              <Icon name={t.icon} size={20} />
              <span>{t.label}</span>
            </NavLink>
          ))}
        </nav>
        <main className="main">
          <Routes>
            <Route path="/" element={<TodayPage />} />
            <Route path="/month" element={<MonthPage />} />
            <Route
              path="/charts"
              element={
                <Suspense fallback={<div className="page" />}>
                  <ChartsPage />
                </Suspense>
              }
            />
            <Route path="/history" element={<HistoryPage />} />
            <Route path="/setup/*" element={<SetupPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
      <MonthCloseGate />
    </HashRouter>
  )
}
