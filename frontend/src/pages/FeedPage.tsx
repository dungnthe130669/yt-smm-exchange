import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Funnel, ArrowClockwise } from '@phosphor-icons/react'
import { api } from '../lib/api'
import type { Task, Wallet } from '../types'
import { TaskCard } from '../components/task/TaskCard'
import { WalletBar } from '../components/wallet/WalletBar'
import { FadeUp, StaggerList } from '../components/ui/Motion'

type Filter = 'ALL' | 'PAY' | 'CROSS_SUB'

export function FeedPage() {
  const qc = useQueryClient()
  const [filter, setFilter] = useState<Filter>('ALL')

  const { data: feedData, isLoading, error, refetch } = useQuery({
    queryKey: ['feed', filter],
    queryFn: () => api.get<{ tasks: Task[] }>(
      `/tasks/feed${filter !== 'ALL' ? `?type=${filter}` : ''}`
    ),
    refetchInterval: 60_000,
  })

  const { data: walletData } = useQuery({
    queryKey: ['wallet'],
    queryFn: () => api.get<{ wallet: Wallet }>('/wallet'),
  })

  const claimMutation = useMutation({
    mutationFn: (taskId: string) =>
      api.post<{ claim_id: string; must_submit_after: number; wait_seconds: number }>(
        `/claims/${taskId}/claim`, {}
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['feed'] })
      qc.invalidateQueries({ queryKey: ['my-tasks'] })
    },
  })

  const tasks = feedData?.tasks ?? []

  return (
    <div className="flex flex-col gap-5">

      {/* Wallet bar */}
      {walletData?.wallet && <WalletBar wallet={walletData.wallet} />}

      {/* Header */}
      <FadeUp className="flex items-center justify-between">
        <div>
          <h1 className="display text-xl">Task Feed</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--color-muted)' }}>
            Sub kênh, nhận xu. Xu dùng mua sub cho kênh của bạn.
          </p>
        </div>
        <button
          className="btn-ghost p-2"
          onClick={() => refetch()}
          title="Làm mới"
        >
          <ArrowClockwise size={16} />
        </button>
      </FadeUp>

      {/* Filter tabs */}
      <FadeUp delay={0.05} className="flex gap-2">
        {(['ALL', 'PAY', 'CROSS_SUB'] as Filter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className="px-3 py-1.5 text-sm rounded-md border transition-all"
            style={{
              background: filter === f ? 'var(--color-elevated)' : 'transparent',
              borderColor: filter === f ? 'var(--color-orange)' : 'var(--color-border)',
              color: filter === f ? 'var(--color-text)' : 'var(--color-muted)',
            }}
          >
            {f === 'ALL' ? 'Tất cả' : f === 'PAY' ? 'Trả VND' : 'Trả xu'}
          </button>
        ))}
        <span className="flex items-center gap-1 text-xs ml-auto" style={{ color: 'var(--color-muted)' }}>
          <Funnel size={12} /> {tasks.length} task
        </span>
      </FadeUp>

      {/* Task list */}
      {isLoading && (
        <div className="flex flex-col gap-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="card p-4 h-36 animate-pulse" style={{ background: 'var(--color-surface)' }} />
          ))}
        </div>
      )}

      {error && (
        <FadeUp className="card p-6 text-center">
          <p style={{ color: 'var(--color-muted)' }}>Lỗi tải feed. Thử lại nhé.</p>
          <button className="btn-ghost mt-3 mx-auto" onClick={() => refetch()}>Thử lại</button>
        </FadeUp>
      )}

      {!isLoading && tasks.length === 0 && (
        <FadeUp className="card p-10 text-center flex flex-col items-center gap-3">
          <div
            className="w-14 h-14 rounded-full flex items-center justify-center"
            style={{ background: 'var(--color-elevated)' }}
          >
            <Funnel size={24} color="var(--color-muted)" />
          </div>
          <p className="font-medium">Không có task nào</p>
          <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
            Quay lại sau hoặc đổi filter khác.
          </p>
        </FadeUp>
      )}

      {tasks.length > 0 && (
        <StaggerList className="flex flex-col gap-3">
          {tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              onClaim={(id) => claimMutation.mutate(id)}
            />
          ))}
        </StaggerList>
      )}

      {/* Claim success toast — inline for now */}
      {claimMutation.isSuccess && (
        <FadeUp className="card p-4 border-[var(--color-success)]" style={{ borderColor: 'var(--color-success)' }}>
          <p className="text-sm font-medium" style={{ color: 'var(--color-success)' }}>
            Nhận task thành công. Vào "Nhiệm vụ" để theo dõi và submit.
          </p>
        </FadeUp>
      )}

      {claimMutation.isError && (
        <FadeUp className="card p-4" style={{ borderColor: 'var(--color-danger)' }}>
          <p className="text-sm" style={{ color: 'var(--color-danger)' }}>
            {(claimMutation.error as { message?: string })?.message ?? 'Không thể nhận task.'}
          </p>
        </FadeUp>
      )}
    </div>
  )
}
