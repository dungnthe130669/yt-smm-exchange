import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { Sun, Moon } from '@phosphor-icons/react'
import { Sidebar, BottomNav } from './Nav'
import { toggleTheme, getStoredTheme } from '../../lib/theme'

function ThemeToggleMobile() {
  const [theme, setTheme] = useState(getStoredTheme)
  return (
    <button
      className="md:hidden fixed top-4 right-4 z-40 w-8 h-8 rounded-full flex items-center justify-center border"
      style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
      onClick={() => { const next = toggleTheme(); setTheme(next) }}
      title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
    </button>
  )
}

export function AppLayout() {
  return (
    <div className="min-h-[100dvh] flex">
      {/* Desktop sidebar — hidden on mobile */}
      <div className="hidden md:block w-56 flex-shrink-0">
        <Sidebar />
      </div>

      {/* Main content */}
      <main className="flex-1 min-w-0 pb-20 md:pb-0">
        <div className="max-w-3xl mx-auto px-4 py-6">
          <Outlet />
        </div>
      </main>

      {/* Mobile bottom nav */}
      <BottomNav />

      {/* Mobile theme toggle */}
      <ThemeToggleMobile />
    </div>
  )
}
