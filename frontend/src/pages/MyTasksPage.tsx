import type { ReactElement } from 'react'
import { useQuery } from '@tanstack/react-query'
import { YoutubeLogo, ThumbsUp, ChatCircle, Coins, Clock } from '@phosphor-icons/react'
import { api } from '../lib/api'
import { FadeUp, StaggerList, StaggerItem } from '../components/ui/Motion'

const ACTION_ICON: Record<string, ReactElement> = {
  SUBSCRIBE: <YoutubeLogo size={15} weight="fill" color="#FF0000" />,
  LIKE:      <ThumbsUp size={15} weight="fill" color="var(--color-danger)" />,
  COMMENT:   <ChatCircle size={15} weight="fill" color="#818cf8" />,
}

const ACTION_LABEL: Record<string, string> = {
  SUBSCRIBE: 'Subscribe',
  LIKE:      'Like',
  COMMENT:   'Comment',
}

interface ClaimRow {
  id: string
  action_type?: string
  coin_amount: number
  coin_status: string
  status: string
  claimed_at: number
  channel_name?: string | null
  video_id?: string | null
  video_title?: string | null
}

function coinLabel(coinStatus: string, coinAmount: number): { text: string; color: string } {
  if (coinStatus === 'CREDITED') return { text: `+${coinAmount} coins`, color: 'var(--color-success)' }
  if (coinStatus === 'CLAWED_BACK') return { text: 'Reversed', color: 'var(--color-danger)' }
  // LOCKED = legacy, will be migrated by cron
  if (coinStatus === 'LOCKED') return { text: `+${coinAmount} coins (processing…)`, color: 'var(--color-muted)' }
  return { text: `+${coinAmount} pending`, color: 'var(--color-muted)' }
}

function taskLabel(row: ClaimRow): string {
  const base = ACTION_LABEL[row.action_type ?? 'SUBSCRIBE'] ?? row.action_type ?? ''
  const name = row.channel_name ?? row.video_title ?? null
  return name ? `${base} · ${name}` : base
}

export function MyTasksPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['my-tasks'],
    queryFn: () => api.get<{ claims: ClaimRow[] }>('/claims/my'),
    refetchInterval: 30_000,
  })

  const all = data?.claims ?? []

  // In-progress = not yet resolved (earner still needs to act or waiting)
  const inProgress = all.filter(c => c.status === 'CLAIMED' || c.status === 'SUBMITTED')
  // Done = terminal states
  const done = all.filter(c => !['CLAIMED', 'SUBMITTED'].includes(c.status))

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

      {/* In-progress tasks — user needs to go back and complete them */}
      {inProgress.length > 0 && (
        <FadeUp delay={0.04}>
          <div className="card p-3 flex flex-col gap-2">
            <div className="flex items-center gap-1.5 mb-0.5">
              <Clock size={13} color="var(--color-orange)" />
              <p className="text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--color-orange)' }}>
                Pending ({inProgress.length})
              </p>
            </div>
            <p className="text-xs" style={{ color: 'var(--color-muted)' }}>
              These tasks were claimed but not completed. Go to Earn to finish them.
            </p>
            {inProgress.map(c => (
              <div key={c.id} className="flex items-center gap-2 text-sm py-0.5">
                {ACTION_ICON[c.action_type ?? 'SUBSCRIBE']}
                <span className="truncate" style={{ color: 'var(--color-muted)' }}>{taskLabel(c)}</span>
                <span className="ml-auto text-xs flex-shrink-0" style={{ color: 'var(--color-orange)' }}>
                  {c.status === 'CLAIMED' ? 'Not started' : 'Submitted'}
                </span>
              </div>
            ))}
          </div>
        </FadeUp>
      )}

      {/* Completed earnings */}
      {done.length > 0 ? (
        <section className="flex flex-col gap-2">
          <p className="text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--color-muted)' }}>
            History ({done.length})
          </p>
          <StaggerList className="flex flex-col gap-1.5">
            {done.map(row => {
              const isVerified = row.status === 'VERIFIED'
              const { text: coinText, color: coinColor } = coinLabel(row.coin_status, row.coin_amount)
              const date = new Date(row.claimed_at * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
              return (
                <StaggerItem key={row.id}>
                  <div className="card p-3 flex items-center gap-2.5">
                    <div className="flex-shrink-0">
                      {ACTION_ICON[row.action_type ?? 'SUBSCRIBE']}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate">{taskLabel(row)}</p>
                    </div>
                    {isVerified ? (
                      <span className="mono text-sm font-bold flex-shrink-0" style={{ color: coinColor }}>
                        {coinText}
                      </span>
                    ) : (
                      <span className="text-sm flex-shrink-0" style={{ color: row.status === 'REJECTED' ? 'var(--color-danger)' : 'var(--color-muted)' }}>
                        {row.status === 'REJECTED' ? 'Rejected' : row.status === 'EXPIRED' ? 'Expired' : row.status.toLowerCase()}
                      </span>
                    )}
                    <span className="text-xs flex-shrink-0" style={{ color: 'var(--color-muted)' }}>{date}</span>
                  </div>
                </StaggerItem>
              )
            })}
          </StaggerList>

          {/* Coin status legend */}
          <p className="text-xs text-center" style={{ color: 'var(--color-muted)' }}>
            Coins are credited to your wallet instantly after verification.
          </p>
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
