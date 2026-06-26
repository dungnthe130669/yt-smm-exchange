import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { YoutubeLogo, CheckCircle, ArrowRight, Confetti, Warning, ThumbsUp, ChatCircle, Clock } from '@phosphor-icons/react'
import { api } from '../lib/api'
import { FadeUp } from '../components/ui/Motion'

interface Task {
  id: string
  channel_id: string
  channel_name: string | null
  channel_avatar: string | null
  channel_url: string
  coin_per_unit: number
  price_per_unit_usd_micro: number
  task_type: string
  target_count: number
  delivered_count: number
  action_type?: string
  video_id?: string
  video_title?: string
  video_thumbnail?: string
  comment_template?: string
}

interface LinkedChannel {
  channel_id: string
  channel_name: string | null
  channel_avatar: string | null
}

type EarnState = 'idle' | 'performing' | 'success' | 'error'

const ACTION_BADGE_STYLE: Record<string, { label: string; bg: string; color: string }> = {
  SUBSCRIBE: { label: 'SUBSCRIBE', bg: 'rgb(249 115 22 / 0.15)', color: 'var(--color-orange)' },
  LIKE:      { label: 'LIKE',      bg: 'rgb(239 68 68 / 0.15)',  color: 'var(--color-danger)' },
  COMMENT:   { label: 'COMMENT',   bg: 'rgb(99 102 241 / 0.15)', color: '#818cf8' },
}

export function EarnPage() {
  const qc = useQueryClient()
  const [earnState, setEarnState] = useState<EarnState>('idle')
  const [xuEarned, setXuEarned] = useState(0)
  const [errorMsg, setErrorMsg] = useState('')
  const [taskSeed, setTaskSeed] = useState(0)
  const [actionFilter, setActionFilter] = useState<string>('')
  const [showChannelPicker, setShowChannelPicker] = useState(false)
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null)

  const { data: taskData, isLoading: taskLoading } = useQuery({
    queryKey: ['random-task', taskSeed, actionFilter],
    queryFn: () => api.get<{ task: Task | null }>(`/tasks/random${actionFilter ? `?action_type=${actionFilter}` : ''}`),
  })

  const { data: ytData } = useQuery({
    queryKey: ['yt-link-status'],
    queryFn: () => api.get<{ channels: LinkedChannel[] }>('/youtube-link/status'),
  })

  const task = taskData?.task
  const channels = ytData?.channels ?? []
  const linkedChannel = channels[0] ?? null

  // Auto-select first channel when picker opens
  useEffect(() => {
    if (showChannelPicker && channels.length > 0 && !selectedChannelId) {
      setSelectedChannelId(channels[0].channel_id)
    }
  }, [showChannelPicker, channels, selectedChannelId])

  const getActionType = () => task?.action_type ?? 'SUBSCRIBE'

  const getPerformingLabel = () => {
    const at = getActionType()
    if (at === 'LIKE') return 'Liking…'
    if (at === 'COMMENT') return 'Posting comment…'
    return 'Subscribing…'
  }

  const getCtaLabel = () => {
    const at = getActionType()
    if (at === 'LIKE') return 'Like & Earn'
    if (at === 'COMMENT') return 'Post Comment & Earn'
    return 'Subscribe & Earn'
  }

  const getCtaIcon = () => {
    const at = getActionType()
    if (at === 'LIKE') return <ThumbsUp size={18} weight="fill" />
    if (at === 'COMMENT') return <ChatCircle size={18} weight="fill" />
    return <YoutubeLogo size={18} weight="fill" />
  }

  const getSuccessLabel = () => {
    const at = getActionType()
    if (at === 'LIKE') return 'Liked!'
    if (at === 'COMMENT') return 'Comment posted!'
    return 'Subscribed!'
  }

  const earnMutation = useMutation({
    mutationFn: async (channelId: string | null) => {
      if (!task) throw new Error('No task')
      setEarnState('performing')

      // Step 1: claim task
      const claimRes = await api.post<{ claim_id: string }>(`/claims/${task.id}/claim`, {})

      // Step 2: perform action + verify
      const verifyRes = await api.post<{ ok: boolean; xu_earned: number }>(
        `/youtube-verify/${claimRes.claim_id}/perform`,
        { channel_id: channelId }
      )

      return verifyRes
    },
    onSuccess: (res) => {
      setXuEarned(res.xu_earned ?? 0)
      setEarnState('success')
      qc.invalidateQueries({ queryKey: ['wallet'] })
      qc.invalidateQueries({ queryKey: ['my-tasks'] })
    },
    onError: (err: unknown) => {
      const e = err as { message?: string; error?: string }
      setErrorMsg(e.message ?? 'Something went wrong. Try again.')
      setEarnState('error')
    },
  })

  const handleNext = () => {
    setEarnState('idle')
    setErrorMsg('')
    setXuEarned(0)
    setTaskSeed((s) => s + 1)
    qc.invalidateQueries({ queryKey: ['random-task'] })
  }

  const isWorking = earnState === 'performing'

  return (
    <div className="flex flex-col gap-6">
      <FadeUp>
        <h1 className="display text-xl">Earn Coins</h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--color-muted)' }}>
          Complete actions on YouTube, earn coins instantly.
        </p>
      </FadeUp>

      {/* Action filter */}
      <FadeUp delay={0.02}>
        <div className="flex gap-1.5">
          {([['', 'All'], ['SUBSCRIBE', 'Subscribe'], ['LIKE', 'Like'], ['COMMENT', 'Comment']] as [string, string][]).map(([val, label]) => (
            <button
              key={val}
              className={`btn text-xs ${actionFilter === val ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => { setActionFilter(val); setTaskSeed(s => s + 1); setEarnState('idle') }}
            >
              {label}
            </button>
          ))}
        </div>
      </FadeUp>


      {!linkedChannel && (
        <FadeUp delay={0.04}>
          <div className="card p-4 flex items-center gap-3" style={{ borderColor: 'var(--color-danger)' }}>
            <Warning size={18} color="var(--color-danger)" />
            <div className="flex-1">
              <p className="text-sm font-medium" style={{ color: 'var(--color-danger)' }}>No YouTube channel linked</p>
              <p className="text-xs" style={{ color: 'var(--color-muted)' }}>Link a channel in your profile first.</p>
            </div>
            <a href="/profile" className="btn btn-ghost text-xs">Profile →</a>
          </div>
        </FadeUp>
      )}

      {/* Task card */}
      <FadeUp delay={0.06}>
        {taskLoading ? (
          <div className="card p-8 animate-pulse h-56" />
        ) : !task ? (
          <div className="card p-10 text-center flex flex-col items-center gap-3">
            <CheckCircle size={40} color="var(--color-success)" weight="fill" />
            <p className="font-semibold">All caught up!</p>
            <p className="text-sm" style={{ color: 'var(--color-muted)' }}>No tasks available right now. Check back later.</p>
          </div>
        ) : earnState === 'success' ? (
          <div className="card p-8 flex flex-col items-center gap-4 text-center">
            <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: 'rgb(34 197 94 / 0.12)' }}>
              <Confetti size={32} color="var(--color-success)" weight="fill" />
            </div>
            <div>
              <p className="font-bold text-lg">{getSuccessLabel()}</p>
              <p className="text-sm mt-1" style={{ color: 'var(--color-muted)' }}>
                  +<span className="mono font-bold" style={{ color: 'var(--color-xu)' }}>{xuEarned}</span> coins locked for 48h
              </p>
            </div>
            <button className="btn-primary flex items-center gap-2" onClick={handleNext}>
              Next task <ArrowRight size={16} />
            </button>
          </div>
        ) : earnState === 'error' ? (
          errorMsg.includes('wait') ? (
          <div className="card p-6 text-center flex flex-col items-center gap-3">
            <div className="w-12 h-12 rounded-full flex items-center justify-center"
              style={{ background: 'var(--color-elevated)' }}>
              <Clock size={24} color="var(--color-muted)" />
            </div>
            <p className="font-semibold">Almost there!</p>
            <p className="text-sm" style={{ color: 'var(--color-muted)' }}>{errorMsg}</p>
            <button className="btn btn-ghost text-sm" onClick={handleNext}>Refresh</button>
          </div>
          ) : (
          <div className="card p-6 flex flex-col gap-4">
            <TaskInfo task={task} />
            <div className="rounded-md p-3 text-sm flex items-start gap-2"
              style={{ background: 'rgb(239 68 68 / 0.08)', borderLeft: '2px solid var(--color-danger)' }}>
              <Warning size={15} color="var(--color-danger)" style={{ flexShrink: 0, marginTop: 1 }} />
              <p style={{ color: 'var(--color-danger)' }}>{errorMsg}</p>
            </div>
            <div className="flex gap-2">
              <button className="btn-primary text-sm flex-1" onClick={() => { setEarnState('idle'); setErrorMsg('') }} disabled={!linkedChannel}>
                Try again
              </button>
              <button className="btn btn-ghost text-sm" onClick={handleNext}>Skip</button>
            </div>
          </div>
          )
        ) : (
          <div className="card p-6 flex flex-col gap-5">
            {/* Action type badge */}
            {task.action_type && (() => {
              const badge = ACTION_BADGE_STYLE[task.action_type]
              return badge ? (
                <div className="flex">
                  <span
                    className="text-xs font-bold px-2 py-0.5 rounded-full"
                    style={{ background: badge.bg, color: badge.color }}
                  >
                    {badge.label}
                  </span>
                </div>
              ) : null
            })()}

            <TaskInfo task={task} />

            {/* Reward */}
            <div className="flex items-center justify-between p-3 rounded-lg" style={{ background: 'var(--color-elevated)' }}>
              <span className="text-sm" style={{ color: 'var(--color-muted)' }}>You will earn</span>
              <div className="flex items-center gap-1">
                <span className="mono font-bold text-xl" style={{ color: 'var(--color-xu)' }}>+{task.coin_per_unit}</span>
                <span className="text-sm" style={{ color: 'var(--color-muted)' }}>coins</span>
              </div>
            </div>

            {/* CTA */}
            <button
              className="btn-primary w-full flex items-center justify-center gap-2 py-3 text-base"
              onClick={() => {
                if (channels.length > 1) {
                  setShowChannelPicker(true)
                } else {
                  earnMutation.mutate(channels[0]?.channel_id ?? null)
                }
              }}
              disabled={isWorking || !linkedChannel}
            >
              {isWorking ? (
                <>
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  {getPerformingLabel()}
                </>
              ) : (
                <>
                  {getCtaIcon()}
                  {getCtaLabel()}
                </>
              )}
            </button>

            <button className="btn btn-ghost text-sm w-full" onClick={handleNext}>
              Skip this task
            </button>
          </div>
        )}
      </FadeUp>

      {/* Progress indicator */}
      {task && earnState === 'idle' && (
        <FadeUp delay={0.1}>
          <div className="flex items-center justify-between text-xs" style={{ color: 'var(--color-muted)' }}>
            <span>{task.delivered_count} / {task.target_count} completed</span>
            <div className="flex-1 mx-3 h-1 rounded-full overflow-hidden" style={{ background: 'var(--color-elevated)' }}>
              <div
                className="h-full rounded-full"
                style={{ width: `${Math.min(100, (task.delivered_count / task.target_count) * 100)}%`, background: 'var(--color-orange)' }}
              />
            </div>
            <span>{task.delivered_count} / {task.target_count}</span>
          </div>
        </FadeUp>
      )}

      {/* Channel picker popup */}
      {showChannelPicker && (
        <div
          className="fixed inset-0 z-50 flex flex-col"
          style={{ background: 'var(--color-surface)' }}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-5 py-4 border-b"
            style={{ borderColor: 'var(--color-border)' }}
          >
            <p className="font-semibold text-base">Choose a channel</p>
            <button
              className="btn btn-ghost text-sm"
              onClick={() => setShowChannelPicker(false)}
            >
              Cancel
            </button>
          </div>

          {/* Channel list */}
          <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3">
            {channels.map(ch => (
              <button
                key={ch.channel_id}
                className="flex items-center gap-4 p-4 rounded-xl border text-left transition-all"
                style={{
                  borderColor: selectedChannelId === ch.channel_id ? 'var(--color-orange)' : 'var(--color-border)',
                  background: selectedChannelId === ch.channel_id ? 'var(--color-elevated)' : 'var(--color-surface)',
                }}
                onClick={() => setSelectedChannelId(ch.channel_id)}
              >
                {ch.channel_avatar
                  ? <img src={ch.channel_avatar} alt="" className="w-12 h-12 rounded-full flex-shrink-0" />
                  : <div
                      className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0"
                      style={{ background: 'var(--color-elevated)' }}
                    >
                      <YoutubeLogo size={22} color="#FF0000" weight="fill" />
                    </div>
                }
                <div className="min-w-0">
                  <p className="font-semibold text-sm truncate">{ch.channel_name ?? ch.channel_id}</p>
                  <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--color-muted)' }}>
                    {ch.channel_id}
                  </p>
                </div>
                {selectedChannelId === ch.channel_id && (
                  <div
                    className="ml-auto w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{ background: 'var(--color-orange)' }}
                  >
                    <span className="text-white text-xs font-bold">✓</span>
                  </div>
                )}
              </button>
            ))}
          </div>

          {/* Confirm button */}
          <div className="px-4 py-5 border-t" style={{ borderColor: 'var(--color-border)' }}>
            <button
              className="btn-primary w-full py-3 text-base"
              disabled={!selectedChannelId}
              onClick={() => {
                setShowChannelPicker(false)
                earnMutation.mutate(selectedChannelId)
              }}
            >
              Use this channel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function TaskInfo({ task }: { task: Task }) {
  const at = task.action_type ?? 'SUBSCRIBE'

  if (at === 'LIKE' || at === 'COMMENT') {
    const thumbUrl = task.video_thumbnail
      ?? (task.video_id ? `https://img.youtube.com/vi/${task.video_id}/mqdefault.jpg` : null)
      ?? (task.channel_id ? `https://img.youtube.com/vi/${task.channel_id}/mqdefault.jpg` : null)

    return (
      <div className="flex items-start gap-4">
        {thumbUrl ? (
          <img src={thumbUrl} alt="" className="w-24 h-16 rounded object-cover flex-shrink-0" />
        ) : (
          <div className="w-24 h-16 rounded flex items-center justify-center flex-shrink-0"
            style={{ background: 'var(--color-elevated)' }}>
            {at === 'LIKE'
              ? <ThumbsUp size={24} color="#FF0000" weight="fill" />
              : <ChatCircle size={24} color="#818cf8" weight="fill" />
            }
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="font-bold text-base truncate">{task.video_title ?? task.channel_name ?? 'YouTube Video'}</p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--color-muted)' }}>
            {at === 'LIKE' ? 'Like this video' : 'Post a comment'}
          </p>
          {at === 'COMMENT' && task.comment_template && (
            <p className="text-xs mt-1 italic" style={{ color: 'var(--color-muted)' }}>
              "{task.comment_template.slice(0, 80)}{task.comment_template.length > 80 ? '…' : ''}"
            </p>
          )}
        </div>
      </div>
    )
  }

  // SUBSCRIBE
  return (
    <div className="flex items-center gap-4">
      {task.channel_avatar
        ? <img src={task.channel_avatar} alt="" className="w-14 h-14 rounded-full flex-shrink-0" />
        : <div className="w-14 h-14 rounded-full flex items-center justify-center flex-shrink-0"
            style={{ background: 'var(--color-elevated)' }}>
            <YoutubeLogo size={24} color="#FF0000" weight="fill" />
          </div>
      }
      <div className="min-w-0">
        <p className="font-bold text-base truncate">{task.channel_name ?? 'YouTube Channel'}</p>
      </div>
    </div>
  )
}
