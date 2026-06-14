import { useQuery, useMutation } from '@tanstack/react-query'
import { Clock, CheckCircle, XCircle, ArrowSquareOut } from '@phosphor-icons/react'
import { api } from '../lib/api'
import type { TaskClaim } from '../types'
import { FadeUp, StaggerList, StaggerItem } from '../components/ui/Motion'

const XU_STATUS_LABEL: Record<string, { label: string; color: string }> = {
  NONE:         { label: 'Chờ verify',    color: 'var(--color-muted)' },
  LOCKED:       { label: 'Xu đang khóa', color: 'var(--color-orange)' },
  CREDITED:     { label: 'Xu đã nhận',   color: 'var(--color-success)' },
  CLAWED_BACK:  { label: 'Xu bị thu hồi',color: 'var(--color-danger)' },
}

const CLAIM_STATUS_LABEL: Record<string, string> = {
  CLAIMED:   'Chờ sub',
  SUBMITTED: 'Đang verify',
  VERIFIED:  'Xác nhận xong',
  REJECTED:  'Bị từ chối',
  EXPIRED:   'Hết hạn',
}

function countdownLabel(mustSubmitAfter: number) {
  const diff = mustSubmitAfter * 1000 - Date.now()
  if (diff <= 0) return null
  const m = Math.ceil(diff / 60000)
  return `Chờ thêm ${m} phút`
}

export function MyTasksPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['my-tasks'],
    queryFn: () => api.get<{ claims: TaskClaim[] }>('/claims/my'),
    refetchInterval: 30_000,
  })

  const submitMutation = useMutation({
    mutationFn: (claimId: string) =>
      api.post<{ ok: boolean; verify_url: string }>(`/claims/${claimId}/submit`, {}),
    onSuccess: (res) => {
      // Redirect to YouTube OAuth verify
      window.location.href = res.verify_url
    },
  })

  const claims = data?.claims ?? []
  const active  = claims.filter((c) => c.status === 'CLAIMED' || c.status === 'SUBMITTED')
  const done    = claims.filter((c) => !['CLAIMED', 'SUBMITTED'].includes(c.status))

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3">
        {[1, 2].map((i) => (
          <div key={i} className="card p-4 h-28 animate-pulse" />
        ))}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <FadeUp>
        <h1 className="display text-xl">Nhiệm vụ của tôi</h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--color-muted)' }}>
          Theo dõi task đã nhận, submit để nhận xu.
        </p>
      </FadeUp>

      {/* Active claims */}
      {active.length > 0 && (
        <section className="flex flex-col gap-3">
          <p className="text-xs font-medium uppercase tracking-widest" style={{ color: 'var(--color-muted)' }}>
            Đang thực hiện ({active.length})
          </p>
          <StaggerList className="flex flex-col gap-3">
            {active.map((claim) => {
              const waiting = countdownLabel(claim.must_submit_after)
              const canSubmit = !waiting && claim.status === 'CLAIMED'

              return (
                <StaggerItem key={claim.id}>
                  <div className="card p-4 flex flex-col gap-3">
                    {/* Channel info */}
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">{claim.channel_name ?? claim.channel_url}</p>
                        <a
                          href={claim.channel_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs flex items-center gap-1"
                          style={{ color: 'var(--color-link)' }}
                        >
                          Mở YouTube <ArrowSquareOut size={11} />
                        </a>
                      </div>
                      <span className="badge badge-muted flex-shrink-0">
                        {CLAIM_STATUS_LABEL[claim.status]}
                      </span>
                    </div>

                    {/* Reward */}
                    <div className="flex items-center gap-2 text-sm">
                      <span style={{ color: 'var(--color-muted)' }}>Phần thưởng:</span>
                      <span className="mono font-medium" style={{ color: 'var(--color-xu)' }}>
                        {claim.xu_per_unit ?? claim.xu_amount} xu
                      </span>
                      <span className="text-xs" style={{ color: 'var(--color-muted)' }}>(khóa 48h sau verify)</span>
                    </div>

                    {/* Timer or submit */}
                    {waiting
                      ? <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--color-orange)' }}>
                          <Clock size={14} />
                          {waiting} rồi mới submit được
                        </div>
                      : canSubmit
                        ? <div className="flex items-center gap-3">
                            <p className="text-xs flex-1" style={{ color: 'var(--color-muted)' }}>
                              Đã sub kênh chưa? Nhấn verify để xác nhận qua Google OAuth.
                            </p>
                            <button
                              className="btn-primary text-xs py-1.5 px-3 flex-shrink-0"
                              onClick={() => submitMutation.mutate(claim.id)}
                              disabled={submitMutation.isPending}
                            >
                              {submitMutation.isPending ? 'Đang xử lý...' : 'Verify sub'}
                            </button>
                          </div>
                        : null
                    }
                  </div>
                </StaggerItem>
              )
            })}
          </StaggerList>
        </section>
      )}

      {/* Completed claims */}
      {done.length > 0 && (
        <section className="flex flex-col gap-3">
          <p className="text-xs font-medium uppercase tracking-widest" style={{ color: 'var(--color-muted)' }}>
            Lịch sử ({done.length})
          </p>
          <StaggerList className="flex flex-col gap-2">
            {done.map((claim) => {
              const xuInfo = XU_STATUS_LABEL[claim.xu_status] ?? XU_STATUS_LABEL['NONE']!
              return (
                <StaggerItem key={claim.id}>
                  <div className="card p-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      {claim.status === 'VERIFIED'
                        ? <CheckCircle size={16} color="var(--color-success)" weight="fill" />
                        : <XCircle size={16} color="var(--color-danger)" weight="fill" />
                      }
                      <p className="text-sm truncate">{claim.channel_name ?? claim.channel_url}</p>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <span className="mono text-sm" style={{ color: 'var(--color-xu)' }}>
                        {claim.xu_amount} xu
                      </span>
                      <span className="text-xs" style={{ color: xuInfo.color }}>
                        {xuInfo.label}
                      </span>
                    </div>
                  </div>
                </StaggerItem>
              )
            })}
          </StaggerList>
        </section>
      )}

      {claims.length === 0 && (
        <FadeUp className="card p-10 text-center flex flex-col items-center gap-3">
          <div
            className="w-14 h-14 rounded-full flex items-center justify-center"
            style={{ background: 'var(--color-elevated)' }}
          >
            <Clock size={24} color="var(--color-muted)" />
          </div>
          <p className="font-medium">Chưa có nhiệm vụ nào</p>
          <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
            Vào Feed nhận task để bắt đầu kiếm xu.
          </p>
        </FadeUp>
      )}
    </div>
  )
}
