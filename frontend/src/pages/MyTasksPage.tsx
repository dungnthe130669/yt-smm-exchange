import type { ReactElement } from 'react'
import { useQuery } from '@tanstack/react-query'
import { YoutubeLogo, ThumbsUp, ChatCircle, Coins } from '@phosphor-icons/react'
import { api } from '../lib/api'
import { FadeUp, StaggerList, StaggerItem } from '../components/ui/Motion'

const COIN_STATUS: Record<string, { label: string; color: string }> = {
  NONE:        { label: 'Pending',          color: 'var(--color-muted)' },
  LOCKED:      { label: 'Locked 48h',       color: 'var(--color-orange)' },
  CREDITED:    { label: 'Earned',           color: 'var(--color-success)' },
  CLAWED_BACK: { label: 'Clawed back',      color: 'var(--color-danger)' },
}

const ACTION_ICON: Record<string, ReactElement> = {
  SUBSCRIBE: <YoutubeLogo size={16} weight="fill" color="#FF0000" />,
  LIKE:      <ThumbsUp size={16} weight="fill" color="var(--color-danger)" />,
  COMMENT:   <ChatCircle size={16} weight="fill" color="#818cf8" />,
}

const ACTION_LABEL: Record<string, string> = {
  SUBSCRIBE: 'Subscribe',
  LIKE: 'Like',
  COMMENT: 'Comment',
}

const CLAIM_STATUS_COLOR: Record<string, string> = {
  VERIFIED: 'var(--color-success)',
  REJECTED: 'var(--color-danger)',
  EXPIRED:  'var(--color-muted)',
}

interface EarningRow {
  id: string
  action_type?: string
  coin_amount: number
  coin_status: string
  status: string
  claimed_at: number
}

export function MyTasksPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['my-tasks'],
    queryFn: () => api.get<{ claims: EarningRow[] }>('/claims/my'),
    refetchInterval: 60_000,
  })

  const earnings = (data?.claims ?? []).filter(c => c.status !== 'CLAIMED' && c.status !== 'SUBMITTED')
  const pending = (data?.claims ?? []).filter(c => c.status === 'CLAIMED' || c.status === 'SUBMITTED')

  if (isLoading) {
    return <div className="flex flex-col gap-2">{[1,2,3].map(i => <div key={i} className="card h-14 animate-pulse" />)}</div>
  }

  return (
    <div className="flex flex-col gap-6">
      <FadeUp>
        <h1 className="display text-xl">My Earnings</h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--color-muted)' }}>
          Your coin earning history.
        </p>
      </FadeUp>

      {/* Pending (in-flight) — minimal, no channel info */}
      {pending.length > 0 && (
        <FadeUp delay={0.04}>
          <div className="card p-3 flex flex-col gap-2">
            <p className="text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--color-muted)' }}>Processing ({pending.length})</p>
            {pending.map(c => (
              <div key={c.id} className="flex items-center gap-2 text-sm">
                {ACTION_ICON[c.action_type ?? 'SUBSCRIBE']}
                <span style={{ color: 'var(--color-muted)' }}>{ACTION_LABEL[c.action_type ?? 'SUBSCRIBE'] ?? c.action_type}</span>
                <span className="ml-auto text-xs" style={{ color: 'var(--color-muted)' }}>In progress…</span>
              </div>
            ))}
          </div>
        </FadeUp>
      )}

      {/* Earnings history */}
      {earnings.length > 0 ? (
        <section className="flex flex-col gap-2">
          <p className="text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--color-muted)' }}>
            Earnings ({earnings.length})
          </p>
          <StaggerList className="flex flex-col gap-1.5">
            {earnings.map(row => {
              const coinStatus = COIN_STATUS[row.coin_status] ?? COIN_STATUS['NONE']!
              const date = new Date(row.claimed_at * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
              const isVerified = row.status === 'VERIFIED'
              return (
                <StaggerItem key={row.id}>
                  <div className="card p-3 flex items-center gap-3">
                    <div className="flex-shrink-0">
                      {ACTION_ICON[row.action_type ?? 'SUBSCRIBE']}
                    </div>
                    <span className="text-sm flex-shrink-0" style={{ color: 'var(--color-muted)' }}>
                      {ACTION_LABEL[row.action_type ?? 'SUBSCRIBE'] ?? row.action_type}
                    </span>
                    {isVerified ? (
                      <span className="mono text-sm font-bold" style={{ color: 'var(--color-xu)' }}>
                        +{row.coin_amount}
                      </span>
                    ) : (
                      <span className="text-sm" style={{ color: CLAIM_STATUS_COLOR[row.status] ?? 'var(--color-muted)' }}>
                        {row.status.toLowerCase()}
                      </span>
                    )}
                    <span className="text-xs ml-auto flex-shrink-0" style={{ color: coinStatus.color }}>
                      {isVerified ? coinStatus.label : ''}
                    </span>
                    <span className="text-xs flex-shrink-0" style={{ color: 'var(--color-muted)' }}>{date}</span>
                  </div>
                </StaggerItem>
              )
            })}
          </StaggerList>
        </section>
      ) : (
        <FadeUp className="card p-10 text-center flex flex-col items-center gap-3">
          <div className="w-14 h-14 rounded-full flex items-center justify-center" style={{ background: 'var(--color-elevated)' }}>
            <Coins size={24} color="var(--color-muted)" />
          </div>
          <p className="font-medium">No earnings yet</p>
          <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
            Complete tasks on the Earn page to start earning coins.
          </p>
        </FadeUp>
      )}
    </div>
  )
}
