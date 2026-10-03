import { NavLink, Navigate, Route, Routes } from 'react-router-dom'
import { CategoriesPanel } from './CategoriesPanel'
import { SettingsPanel } from './SettingsPanel'

export function SetupPage() {
  return (
    <div className="page">
      <header className="page-head">
        <div>
          <div className="eyebrow">Setup</div>
          <h1>Categories and settings</h1>
        </div>
      </header>
      <div className="toolbar">
        <nav className="seg" aria-label="Setup sections">
          <NavLink to="/setup/categories">Categories</NavLink>
          <NavLink to="/setup/settings">Settings</NavLink>
        </nav>
      </div>
      <Routes>
        <Route path="categories" element={<CategoriesPanel />} />
        <Route path="settings" element={<SettingsPanel />} />
        <Route path="*" element={<Navigate to="categories" replace />} />
      </Routes>
    </div>
  )
}
