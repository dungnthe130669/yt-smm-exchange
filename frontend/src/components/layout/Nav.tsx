import { Link, useLocation } from 'react-router-dom'
import {
  House, ListBullets, Wallet, YoutubeLogo, User
} from '@phosphor-icons/react'

const NAV = [
  { to: '/',        icon: House,       label: 'Feed' },
  { to: '/my-tasks', icon: ListBullets, label: 'Nhiệm vụ' },
  { to: '/wallet',  icon: Wallet,      label: 'Ví' },
  { to: '/create',  icon: YoutubeLogo, label: 'Đặt task' },
  { to: '/profile', icon: User,        label: 'Tài khoản' },
]

// Desktop sidebar
export function Sidebar() {
  const { pathname } = useLocation()

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
        {NAV.map(({ to, icon: Icon, label }) => {
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

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 flex border-t md:hidden"
      style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
    >
      {NAV.map(({ to, icon: Icon, label }) => {
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
