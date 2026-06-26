import { Link, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import {
  Lightning, ListBullets, Wallet, YoutubeLogo, User, ShieldCheck, Sun, Moon
} from '@phosphor-icons/react'
import { api } from '../../lib/api'
import { toggleTheme, getStoredTheme } from '../../lib/theme'

interface Session {
  user: { id: string; email: string; role?: string } | null
}

const BASE_NAV = [
  { to: '/',         icon: Lightning,   label: 'Earn' },
  { to: '/my-tasks', icon: ListBullets, label: 'Tasks' },
  { to: '/wallet',   icon: Wallet,      label: 'Wallet' },
  { to: '/create',   icon: YoutubeLogo, label: 'Create' },
  { to: '/profile',  icon: User,        label: 'Profile' },
]

function useNavItems() {
  const { data } = useQuery({
    queryKey: ['me'],
    queryFn: () => api.get<Session>('/me'),
    staleTime: 60_000,
  })
  const isAdmin = data?.user?.role === 'admin'
  return isAdmin
    ? [...BASE_NAV, { to: '/admin', icon: ShieldCheck, label: 'Admin' }]
    : BASE_NAV
}

// Desktop sidebar
export function Sidebar() {
  const { pathname } = useLocation()
  const nav = useNavItems()
  const [theme, setTheme] = useState(getStoredTheme)

  const handleToggle = () => {
    const next = toggleTheme()
    setTheme(next)
  }

  return (
    <aside
      className="fixed left-0 top-0 h-full w-56 flex flex-col border-r"
      style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
    >
      {/* Brand */}
      <div className="px-5 py-5 border-b" style={{ borderColor: 'var(--color-border)' }}>
        <div className="flex items-center gap-2">
          <div
            className="w-7 h-7 rounded flex items-center justify-center"
            style={{ background: 'var(--color-sub)' }}
          >
            <YoutubeLogo size={16} color="#fff" weight="fill" />
          </div>
          <span className="display font-bold text-base tracking-tight">
            YT<span style={{ color: 'var(--color-orange)' }}>Exchange</span>
          </span>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 flex flex-col gap-0.5">
        {nav.map(({ to, icon: Icon, label }) => {
          const active = pathname === to
          return (
            <Link
              key={to}
              to={to}
              className="flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium transition-colors"
              style={{
                color: active ? 'var(--color-text)' : 'var(--color-muted)',
                background: active ? 'var(--color-elevated)' : 'transparent',
                textDecoration: 'none',
              }}
            >
              <Icon
                size={17}
                weight={active ? 'fill' : 'regular'}
                color={active ? 'var(--color-orange)' : undefined}
              />
              {label}
            </Link>
          )
        })}
      </nav>

      {/* Theme toggle */}
      <div className="px-3 py-2 border-t" style={{ borderColor: 'var(--color-border)' }}>
        <button
          onClick={handleToggle}
          className="flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium w-full transition-colors"
          style={{ color: 'var(--color-muted)' }}
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {theme === 'dark'
            ? <Sun size={17} />
            : <Moon size={17} />
          }
          {theme === 'dark' ? 'Light mode' : 'Dark mode'}
        </button>
      </div>

      {/* Version */}
      <div className="px-5 py-4 text-xs" style={{ color: 'var(--color-subtle)' }}>
        MVP v0.1
      </div>
    </aside>
  )
}

// Mobile bottom nav
export function BottomNav() {
  const { pathname } = useLocation()
  const nav = useNavItems()

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 flex border-t md:hidden"
      style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
    >
      {nav.map(({ to, icon: Icon, label }) => {
        const active = pathname === to
        return (
          <Link
            key={to}
            to={to}
            className="flex-1 flex flex-col items-center gap-0.5 py-2.5 text-[10px] font-medium transition-colors"
            style={{
              color: active ? 'var(--color-orange)' : 'var(--color-muted)',
              textDecoration: 'none',
            }}
          >
            <Icon size={20} weight={active ? 'fill' : 'regular'} />
            {label}
          </Link>
        )
      })}
    </nav>
  )
}
