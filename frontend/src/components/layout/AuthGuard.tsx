import { useQuery } from '@tanstack/react-query'
import { Navigate } from 'react-router-dom'
import { api } from '../../lib/api'

// Wraps protected routes — redirects to /login if no session
export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['session'],
    queryFn: () => api.get<{ user: { id: string } | null }>('/auth/get-session'),
    retry: false,
    staleTime: 60_000,
  })

  // Still loading — show nothing (avoid flash)
  if (isLoading) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center">
        <div className="w-6 h-6 rounded-full border-2 border-t-transparent animate-spin"
             style={{ borderColor: 'var(--color-orange)', borderTopColor: 'transparent' }} />
      </div>
    )
  }

  // No session or error → login
  if (error || !data?.user) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}
