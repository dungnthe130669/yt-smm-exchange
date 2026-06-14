import { Outlet } from 'react-router-dom'
import { Sidebar, BottomNav } from './Nav'

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
    </div>
  )
}
