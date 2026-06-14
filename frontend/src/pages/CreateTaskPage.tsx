import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { YoutubeLogo, Info } from '@phosphor-icons/react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { FadeUp } from '../components/ui/Motion'

type Mode = 'PAY' | 'CROSS_SUB'

interface CreateTaskBody {
  channel_url: string
  channel_id: string
  channel_name?: string
  target_count: number
  task_type: Mode
  price_per_unit_vnd?: number
  xu_per_unit?: number
  deadline_days: number
}

// Extract YouTube channel ID from URL
function extractChannelId(url: string): string | null {
  const m = url.match(/\/channel\/(UC[\w-]{22})/)
  if (m) return m[1] ?? null
  return null
}

export function CreateTaskPage() {
  const nav = useNavigate()
  const qc = useQueryClient()

  const [mode, setMode] = useState<Mode>('PAY')
  const [channelUrl, setChannelUrl] = useState('')
  const [channelName, setChannelName] = useState('')
  const [targetCount, setTargetCount] = useState(10)
  const [pricePerUnit, setPricePerUnit] = useState(500)
  const [xuPerUnit, setXuPerUnit] = useState(14)
  const [deadlineDays, setDeadlineDays] = useState(7)

  const mutation = useMutation({
    mutationFn: (body: CreateTaskBody) => api.post<{ task_id: string }>('/tasks', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['feed'] })
      nav('/')
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    const channelId = extractChannelId(channelUrl)
    if (!channelId) {
      // Try to submit anyway — server will validate
    }

    const body: CreateTaskBody = {
      channel_url: channelUrl,
      channel_id: channelId ?? channelUrl,
      channel_name: channelName || undefined,
      target_count: targetCount,
      task_type: mode,
      deadline_days: deadlineDays,
      ...(mode === 'PAY'
        ? { price_per_unit_vnd: pricePerUnit }
        : { xu_per_unit: xuPerUnit }
      ),
    }
    mutation.mutate(body)
  }

  const totalCost = mode === 'PAY'
    ? pricePerUnit * targetCount
    : xuPerUnit * targetCount

  return (
    <div className="flex flex-col gap-6">
      <FadeUp>
        <h1 className="display text-xl">Đặt task</h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--color-muted)' }}>
          Tạo task để nhận sub cho kênh YouTube của bạn.
        </p>
      </FadeUp>

      {/* Mode toggle */}
      <FadeUp delay={0.05} className="grid grid-cols-2 gap-2 p-1 rounded-lg" style={{ background: 'var(--color-elevated)' }}>
        {(['PAY', 'CROSS_SUB'] as Mode[]).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className="py-2 px-4 rounded-md text-sm font-medium transition-all"
            style={{
              background: mode === m ? 'var(--color-surface)' : 'transparent',
              color: mode === m ? 'var(--color-text)' : 'var(--color-muted)',
              border: mode === m ? '1px solid var(--color-border)' : '1px solid transparent',
            }}
          >
            {m === 'PAY' ? 'Trả VND (thật)' : 'Trả xu (cross-sub)'}
          </button>
        ))}
      </FadeUp>

      {/* Info box */}
      <FadeUp delay={0.08}>
        <div
          className="flex gap-3 p-3 rounded-md text-sm"
          style={{ background: mode === 'PAY' ? 'rgb(249 115 22 / 0.08)' : 'rgb(245 158 11 / 0.08)',
                   borderLeft: `2px solid ${mode === 'PAY' ? 'var(--color-orange)' : 'var(--color-xu)'}`,
                   paddingLeft: '12px' }}
        >
          <Info size={16} color={mode === 'PAY' ? 'var(--color-orange)' : 'var(--color-xu)'} style={{ flexShrink: 0, marginTop: 2 }} />
          <p style={{ color: 'var(--color-muted)' }}>
            {mode === 'PAY'
              ? 'Task VND được ưu tiên hiển thị đầu feed. Earner nhận xu, bạn trả VND từ số dư ví.'
              : 'Task xu dùng xu bạn đã kiếm được. Hiển thị sau task VND. Tối đa 50 sub/task.'
            }
          </p>
        </div>
      </FadeUp>

      {/* Form */}
      <FadeUp delay={0.1}>
        <form onSubmit={handleSubmit} className="card p-5 flex flex-col gap-4">

          {/* Channel URL */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">URL kênh YouTube</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2">
                <YoutubeLogo size={16} color="var(--color-sub)" weight="fill" />
              </span>
              <input
                className="input pl-8"
                placeholder="https://www.youtube.com/channel/UC..."
                value={channelUrl}
                onChange={(e) => setChannelUrl(e.target.value)}
                required
              />
            </div>
            <p className="text-xs" style={{ color: 'var(--color-muted)' }}>
              Hỗ trợ: /channel/UC..., /@handle, /c/name
            </p>
          </div>

          {/* Channel name (optional display) */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">Tên kênh (hiển thị)</label>
            <input
              className="input"
              placeholder="Tên kênh của bạn"
              value={channelName}
              onChange={(e) => setChannelName(e.target.value)}
            />
          </div>

          {/* Target count */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">
              Số lượng sub cần
              <span className="text-xs ml-2" style={{ color: 'var(--color-muted)' }}>
                (tối đa {mode === 'PAY' ? 1000 : 50})
              </span>
            </label>
            <input
              type="number"
              className="input"
              min={1}
              max={mode === 'PAY' ? 1000 : 50}
              value={targetCount}
              onChange={(e) => setTargetCount(parseInt(e.target.value) || 1)}
              required
            />
          </div>

          {/* Price */}
          {mode === 'PAY' ? (
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">Giá mỗi sub (VND)</label>
              <input
                type="number"
                className="input"
                min={100}
                step={100}
                value={pricePerUnit}
                onChange={(e) => setPricePerUnit(parseInt(e.target.value) || 100)}
                required
              />
              <p className="text-xs" style={{ color: 'var(--color-muted)' }}>
                Earner nhận xu tương đương. Minimum 100đ/sub.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">Xu mỗi sub</label>
              <input
                type="number"
                className="input"
                min={14}
                value={xuPerUnit}
                onChange={(e) => setXuPerUnit(parseInt(e.target.value) || 14)}
                required
              />
              <p className="text-xs" style={{ color: 'var(--color-muted)' }}>
                Tối thiểu 14 xu/sub (platform giữ spread 4 xu).
              </p>
            </div>
          )}

          {/* Deadline */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">Thời hạn</label>
            <div className="grid grid-cols-4 gap-2">
              {[1, 3, 7, 14].map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDeadlineDays(d)}
                  className="py-2 text-sm rounded-md border transition-all"
                  style={{
                    background: deadlineDays === d ? 'var(--color-elevated)' : 'transparent',
                    borderColor: deadlineDays === d ? 'var(--color-orange)' : 'var(--color-border)',
                    color: deadlineDays === d ? 'var(--color-text)' : 'var(--color-muted)',
                  }}
                >
                  {d}n
                </button>
              ))}
            </div>
          </div>

          {/* Summary */}
          <div className="divider" />
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs" style={{ color: 'var(--color-muted)' }}>Tổng escrow</p>
              <p className="mono font-bold text-lg" style={{ color: mode === 'PAY' ? 'var(--color-orange)' : 'var(--color-xu)' }}>
                {totalCost.toLocaleString('vi-VN')}
                <span className="text-sm font-normal ml-1" style={{ color: 'var(--color-muted)' }}>
                  {mode === 'PAY' ? 'đ' : 'xu'}
                </span>
              </p>
            </div>
            <button
              type="submit"
              className="btn-primary"
              disabled={mutation.isPending}
            >
              {mutation.isPending ? 'Đang tạo...' : 'Tạo task'}
            </button>
          </div>

          {mutation.isError && (
            <p className="text-sm" style={{ color: 'var(--color-danger)' }}>
              {(mutation.error as { message?: string })?.message ?? 'Lỗi tạo task.'}
            </p>
          )}
        </form>
      </FadeUp>
    </div>
  )
}
