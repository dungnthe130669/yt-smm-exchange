import { useQuery } from '@tanstack/react-query'
import { User, SignOut, Shield } from '@phosphor-icons/react'
import { api } from '../lib/api'
import { FadeUp } from '../components/ui/Motion'

interface SessionUser {
  id: string
  name: string
  email: string
  image?: string
  role: string
}

export function ProfilePage() {
  const { data, isLoading } = useQuery({
    queryKey: ['session'],
    queryFn: () => api.get<{ user: SessionUser }>('/auth/get-session'),
  })

  const user = data?.user

  const handleSignOut = () => {
    window.location.href = '/api/auth/sign-out?callbackURL=/login'
  }

  if (isLoading) {
    return <div className="card p-8 animate-pulse h-48" />
  }

  return (
    <div className="flex flex-col gap-6">
      <FadeUp>
        <h1 className="display text-xl">Tài khoản</h1>
      </FadeUp>

      <FadeUp delay={0.05} className="card p-6 flex items-center gap-4">
        {user?.image
          ? <img src={user.image} alt="" className="w-14 h-14 rounded-full" />
          : <div
              className="w-14 h-14 rounded-full flex items-center justify-center"
              style={{ background: 'var(--color-elevated)' }}
            >
              <User size={28} color="var(--color-muted)" />
            </div>
        }
        <div>
          <p className="font-semibold text-base">{user?.name ?? 'User'}</p>
          <p className="text-sm" style={{ color: 'var(--color-muted)' }}>{user?.email}</p>
          {user?.role === 'admin' && (
            <span className="badge badge-orange mt-1">
              <Shield size={10} weight="fill" /> Admin
            </span>
          )}
        </div>
      </FadeUp>

      <FadeUp delay={0.08} className="card p-2 flex flex-col">
        <button
          className="flex items-center gap-3 px-4 py-3 rounded-md text-sm transition-colors text-left w-full"
          style={{ color: 'var(--color-danger)' }}
          onClick={handleSignOut}
        >
          <SignOut size={16} />
          Đăng xuất
        </button>
      </FadeUp>

      <FadeUp delay={0.1} className="card p-4">
        <p className="text-xs font-medium mb-2" style={{ color: 'var(--color-muted)' }}>
          Thông tin tài khoản
        </p>
        <div className="flex flex-col gap-2">
          {[
            { label: 'ID', value: user?.id?.slice(0, 8) + '...' },
            { label: 'Vai trò', value: user?.role ?? 'user' },
          ].map(({ label, value }) => (
            <div key={label} className="flex justify-between text-sm">
              <span style={{ color: 'var(--color-muted)' }}>{label}</span>
              <span className="mono">{value}</span>
            </div>
          ))}
        </div>
      </FadeUp>
    </div>
  )
}
