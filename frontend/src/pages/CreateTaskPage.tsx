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
  const [pricePerUnit, setPricePerUnit] = useState(5)
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
        <h1 className="display text-xl">Create Task</h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--color-muted)' }}>
          Create a task to get subscribers for your YouTube channel.
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
            {m === 'PAY' ? 'Pay USD (real)' : 'Pay Credits (cross-sub)'}
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
              ? 'USD tasks appear first in the feed. Earners receive credits, you pay USD from your wallet.'
              : 'Credit tasks use credits you have earned. Shown after USD tasks. Max 50 subs per task.'
            }
          </p>
        </div>
      </FadeUp>

      {/* Form */}
      <FadeUp delay={0.1}>
        <form onSubmit={handleSubmit} className="card p-5 flex flex-col gap-4">

          {/* Channel URL */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">YouTube Channel URL</label>
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
              Supports: /channel/UC..., /@handle, /c/name
            </p>
          </div>

          {/* Channel name (optional display) */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">Channel name (display)</label>
            <input
              className="input"
              placeholder="Your channel name"
              value={channelName}
              onChange={(e) => setChannelName(e.target.value)}
            />
          </div>

          {/* Target count */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">
              Subscribers needed
              <span className="text-xs ml-2" style={{ color: 'var(--color-muted)' }}>
                (max {mode === 'PAY' ? 1000 : 50})
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
              <label className="text-sm font-medium">Price per sub (USD cents)</label>
              <input
                type="number"
                className="input"
                min={1}
                step={1}
                value={pricePerUnit}
                onChange={(e) => setPricePerUnit(parseInt(e.target.value) || 1)}
                required
              />
              <p className="text-xs" style={{ color: 'var(--color-muted)' }}>
                Earner receives equivalent credits. Minimum $0.01/sub.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">Credits per sub</label>
              <input
                type="number"
                className="input"
                min={14}
                value={xuPerUnit}
                onChange={(e) => setXuPerUnit(parseInt(e.target.value) || 14)}
                required
              />
              <p className="text-xs" style={{ color: 'var(--color-muted)' }}>
                Minimum 14 credits/sub (platform keeps 4 cr spread).
              </p>
            </div>
          )}

          {/* Deadline */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">Duration</label>
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
                  {d}d
                </button>
              ))}
            </div>
          </div>

          {/* Summary */}
          <div className="divider" />
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs" style={{ color: 'var(--color-muted)' }}>Total escrow</p>
              <p className="mono font-bold text-lg" style={{ color: mode === 'PAY' ? 'var(--color-orange)' : 'var(--color-xu)' }}>
                {totalCost.toLocaleString('en-US')}
                <span className="text-sm font-normal ml-1" style={{ color: 'var(--color-muted)' }}>
                  {mode === 'PAY' ? '¢ USD' : 'cr'}
                </span>
              </p>
            </div>
            <button
              type="submit"
              className="btn-primary"
              disabled={mutation.isPending}
            >
              {mutation.isPending ? 'Creating...' : 'Create task'}
            </button>
          </div>

          {mutation.isError && (
            <p className="text-sm" style={{ color: 'var(--color-danger)' }}>
              {(mutation.error as { message?: string })?.message ?? 'Failed to create task.'}
            </p>
          )}
        </form>
      </FadeUp>
    </div>
  )
}
