import { useState, useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { YoutubeLogo, Info, Warning, ArrowRight, ThumbsUp, ChatCircle } from '@phosphor-icons/react'
import { useNavigate, Link } from 'react-router-dom'
import { api } from '../lib/api'
import { FadeUp } from '../components/ui/Motion'

type ActionType = 'SUBSCRIBE' | 'LIKE' | 'COMMENT'

interface Channel {
  channel_id: string
  channel_name: string
  channel_avatar: string | null
  channel_url: string
}

interface Pricing {
  coin_per_unit_cross?: number
  xu_per_unit_cross?: number  // backward compat fallback
  cooldown_seconds?: number
  xu_per_subscribe?: number
  xu_per_like?: number
  xu_per_comment?: number
}

interface CreateTaskBody {
  channel_url: string
  channel_id: string
  channel_name?: string
  channel_avatar?: string
  target_count: number
  deadline_days: number
  action_type: ActionType
  video_id?: string
  video_title?: string
  comment_template?: string
}

function extractVideoId(url: string): string | null {
  const m = url.match(/(?:v=|youtu\.be\/)([\w-]{11})/)
  return m?.[1] ?? null
}

const ACTION_TABS: { type: ActionType; label: string; icon: React.ReactNode }[] = [
  { type: 'SUBSCRIBE', label: 'Subscribe', icon: <YoutubeLogo size={15} weight="fill" /> },
  { type: 'LIKE', label: 'Like', icon: <ThumbsUp size={15} weight="fill" /> },
  { type: 'COMMENT', label: 'Comment', icon: <ChatCircle size={15} weight="fill" /> },
]

export function CreateTaskPage() {
  const nav = useNavigate()
  const qc = useQueryClient()

  const [actionType, setActionType] = useState<ActionType>('SUBSCRIBE')
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null)
  const [targetCount, setTargetCount] = useState(10)
  const [deadlineDays, setDeadlineDays] = useState(7)
  const [videoUrl, setVideoUrl] = useState('')
  const [videoTitle, setVideoTitle] = useState('')
  const [commentTemplate, setCommentTemplate] = useState('')

  const videoId = extractVideoId(videoUrl)

  const { data: channelsData, isLoading: channelsLoading } = useQuery({
    queryKey: ['my-channels'],
    queryFn: () => api.get<{ channels: Channel[] }>('/tasks/my-channels'),
  })

  const { data: pricing } = useQuery({
    queryKey: ['task-pricing'],
    queryFn: () => api.get<Pricing>('/tasks/pricing'),
  })

  const channels = channelsData?.channels ?? []
  const selectedChannel = channels.find(ch => ch.channel_id === selectedChannelId) ?? channels[0] ?? null

  // Auto-select first channel (in effect, not render body)
  useEffect(() => {
    if (channels.length > 0 && !selectedChannelId) {
      setSelectedChannelId(channels[0].channel_id)
    }
  }, [channels, selectedChannelId])

  // Pricing display per action type (coin only)
  const getPricingDisplay = () => {
    if (actionType === 'SUBSCRIBE') return `${pricing?.xu_per_subscribe ?? pricing?.coin_per_unit_cross ?? pricing?.xu_per_unit_cross ?? 10} coin / sub`
    if (actionType === 'LIKE') return `${pricing?.xu_per_like ?? 5} coin / like`
    return `${pricing?.xu_per_comment ?? 15} coin / comment`
  }

  const pricePerUnit = actionType === 'SUBSCRIBE'
    ? (pricing?.xu_per_subscribe ?? pricing?.coin_per_unit_cross ?? pricing?.xu_per_unit_cross ?? 10)
    : actionType === 'LIKE'
      ? (pricing?.xu_per_like ?? 5)
      : (pricing?.xu_per_comment ?? 15)

  const totalCost = (typeof pricePerUnit === 'number' ? pricePerUnit : 0) * targetCount

  const mutation = useMutation({
    mutationFn: (body: CreateTaskBody) => api.post<{ task_id: string }>('/tasks', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['feed'] })
      nav('/')
    },
  })

  const isSubmitDisabled = () => {
    if (mutation.isPending) return true
    if (actionType === 'SUBSCRIBE') return channels.length === 0 || !selectedChannel
    if (actionType === 'LIKE') return !videoId
    if (actionType === 'COMMENT') return !videoId || !commentTemplate.trim()
    return false
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    if (actionType === 'SUBSCRIBE') {
      if (!selectedChannel) return
      mutation.mutate({
        channel_url: selectedChannel.channel_url,
        channel_id: selectedChannel.channel_id,
        channel_name: selectedChannel.channel_name,
        channel_avatar: selectedChannel.channel_avatar ?? undefined,
        target_count: targetCount,
        deadline_days: deadlineDays,
        action_type: 'SUBSCRIBE',
      })
    } else if (actionType === 'LIKE') {
      if (!videoId) return
      mutation.mutate({
        channel_url: `https://youtube.com/watch?v=${videoId}`,
        channel_id: videoId,
        channel_name: videoTitle || undefined,
        target_count: targetCount,
        deadline_days: deadlineDays,
        action_type: 'LIKE',
        video_id: videoId,
        video_title: videoTitle || undefined,
      })
    } else {
      if (!videoId || !commentTemplate.trim()) return
      mutation.mutate({
        channel_url: `https://youtube.com/watch?v=${videoId}`,
        channel_id: videoId,
        channel_name: videoTitle || undefined,
        target_count: targetCount,
        deadline_days: deadlineDays,
        action_type: 'COMMENT',
        video_id: videoId,
        video_title: videoTitle || undefined,
        comment_template: commentTemplate,
      })
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <FadeUp>
        <h1 className="display text-xl">Create Task</h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--color-muted)' }}>
          Grow your YouTube presence — subscribers, likes, or comments.
        </p>
      </FadeUp>

      {/* Action type toggle */}
      <FadeUp delay={0.03} className="grid grid-cols-3 gap-2 p-1 rounded-lg" style={{ background: 'var(--color-elevated)' }}>
        {ACTION_TABS.map(({ type, label, icon }) => (
          <button
            key={type}
            onClick={() => setActionType(type)}
            className="py-2 px-3 rounded-md text-sm font-medium transition-all flex items-center justify-center gap-1.5"
            style={{
              background: actionType === type ? 'var(--color-surface)' : 'transparent',
              color: actionType === type ? 'var(--color-text)' : 'var(--color-muted)',
              border: actionType === type ? '1px solid var(--color-border)' : '1px solid transparent',
            }}
          >
            {icon}
            {label}
          </button>
        ))}
      </FadeUp>

      {/* Info box */}
      <FadeUp delay={0.08}>
        <div
          className="flex gap-3 p-3 rounded-md text-sm"
          style={{
            background: 'rgb(245 158 11 / 0.08)',
            borderLeft: '2px solid var(--color-xu)',
          }}
        >
          <Info size={16} color="var(--color-xu)" style={{ flexShrink: 0, marginTop: 2 }} />
          <p style={{ color: 'var(--color-muted)' }}>
            {`Coin tasks use coins you earned. Price: ${getPricingDisplay()} (admin-set). Max 50 units.`}
          </p>
        </div>
      </FadeUp>

      <FadeUp delay={0.1}>
        <form onSubmit={handleSubmit} className="card p-5 flex flex-col gap-4">

          {/* SUBSCRIBE: Channel selector */}
          {actionType === 'SUBSCRIBE' && (
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">YouTube Channel</label>
              {channelsLoading ? (
                <div className="h-14 rounded animate-pulse" style={{ background: 'var(--color-elevated)' }} />
              ) : channels.length === 0 ? (
                <div className="flex items-center gap-3 p-3 rounded-md border" style={{ borderColor: 'var(--color-danger)', background: 'rgb(239 68 68 / 0.06)' }}>
                  <Warning size={18} color="var(--color-danger)" />
                  <div className="flex-1">
                    <p className="text-sm font-medium" style={{ color: 'var(--color-danger)' }}>No YouTube channel linked</p>
                    <p className="text-xs" style={{ color: 'var(--color-muted)' }}>Link a channel in your profile first.</p>
                  </div>
                  <Link to="/profile" className="btn btn-ghost text-xs flex items-center gap-1">
                    Profile <ArrowRight size={12} />
                  </Link>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {channels.map(ch => (
                    <button
                      key={ch.channel_id}
                      type="button"
                      onClick={() => setSelectedChannelId(ch.channel_id)}
                      className="flex items-center gap-3 p-3 rounded-md border text-left transition-all"
                      style={{
                        borderColor: selectedChannelId === ch.channel_id ? 'var(--color-orange)' : 'var(--color-border)',
                        background: selectedChannelId === ch.channel_id ? 'var(--color-elevated)' : 'transparent',
                      }}
                    >
                      {ch.channel_avatar
                        ? <img src={ch.channel_avatar} alt="" className="w-9 h-9 rounded-full" />
                        : <div className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: 'var(--color-elevated)' }}>
                            <YoutubeLogo size={18} color="var(--color-sub)" weight="fill" />
                          </div>
                      }
                      <div>
                        <p className="text-sm font-medium">{ch.channel_name}</p>
                        <p className="text-xs" style={{ color: 'var(--color-muted)' }}>{ch.channel_id}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* LIKE / COMMENT: Video URL */}
          {(actionType === 'LIKE' || actionType === 'COMMENT') && (
            <>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium">YouTube Video URL</label>
                <input
                  className="input"
                  placeholder="https://youtube.com/watch?v=..."
                  value={videoUrl}
                  onChange={(e) => setVideoUrl(e.target.value)}
                />
                {videoId && (
                  <p className="text-xs" style={{ color: 'var(--color-success)' }}>Video ID: {videoId}</p>
                )}
                {videoUrl && !videoId && (
                  <p className="text-xs" style={{ color: 'var(--color-danger)' }}>Invalid YouTube URL</p>
                )}
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium">Video Title <span className="font-normal" style={{ color: 'var(--color-muted)' }}>(optional)</span></label>
                <input
                  className="input"
                  placeholder="My awesome video..."
                  value={videoTitle}
                  onChange={(e) => setVideoTitle(e.target.value)}
                />
              </div>
            </>
          )}

          {/* COMMENT: Comment template */}
          {actionType === 'COMMENT' && (
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">Comment template</label>
              <textarea
                className="input"
                rows={3}
                placeholder="Great video! Keep it up..."
                value={commentTemplate}
                onChange={(e) => setCommentTemplate(e.target.value)}
              />
              <p className="text-xs" style={{ color: 'var(--color-muted)' }}>This exact text will be posted as a comment.</p>
            </div>
          )}

          {/* Pricing (read-only) */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">Price per unit</label>
            <div className="input flex items-center" style={{ background: 'var(--color-elevated)', cursor: 'default', color: 'var(--color-muted)' }}>
              {getPricingDisplay()}
              <span className="ml-auto text-xs">Admin-set</span>
            </div>
          </div>

          {/* Target count */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">
              {actionType === 'SUBSCRIBE' ? 'Subscribers' : actionType === 'LIKE' ? 'Likes' : 'Comments'} needed
              <span className="text-xs ml-2" style={{ color: 'var(--color-muted)' }}>
                (max 50)
              </span>
            </label>
            <input
              type="number"
              className="input"
              min={1}
              max={50}
              value={targetCount}
              onChange={(e) => setTargetCount(parseInt(e.target.value) || 1)}
              required
            />
          </div>

          {/* Duration */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">Duration</label>
            <div className="grid grid-cols-3 gap-2">
              {[3, 7, 14].map((d) => (
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
                  {d} days
                </button>
              ))}
            </div>
          </div>

          {/* Summary */}
          <div className="divider" />
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs" style={{ color: 'var(--color-muted)' }}>Total escrow</p>
              <p className="mono font-bold text-lg" style={{ color: 'var(--color-xu)' }}>
                {totalCost.toLocaleString()}
                <span className="text-sm font-normal ml-1" style={{ color: 'var(--color-muted)' }}>
                  coin
                </span>
              </p>
            </div>
            <button
              type="submit"
              className="btn-primary"
              disabled={isSubmitDisabled()}
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

      {/* Video preview for LIKE/COMMENT */}
      {(actionType === 'LIKE' || actionType === 'COMMENT') && videoId && (
        <FadeUp delay={0.12}>
          <div className="card p-4 flex items-center gap-3">
            <img
              src={`https://img.youtube.com/vi/${videoId}/mqdefault.jpg`}
              alt="Video thumbnail"
              className="w-24 h-16 rounded object-cover flex-shrink-0"
            />
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{videoTitle || 'Video preview'}</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--color-muted)' }}>ID: {videoId}</p>
              {actionType === 'COMMENT' && commentTemplate && (
                <p className="text-xs mt-1 italic" style={{ color: 'var(--color-muted)' }}>
                  "{commentTemplate.slice(0, 60)}{commentTemplate.length > 60 ? '…' : ''}"
                </p>
              )}
            </div>
          </div>
        </FadeUp>
      )}

      {/* Missing channel warning for SUBSCRIBE */}
      {actionType === 'SUBSCRIBE' && channels.length === 0 && !channelsLoading && (
        <FadeUp delay={0.12}>
          <p className="text-xs text-center" style={{ color: 'var(--color-muted)' }}>
            You need a linked YouTube channel to create subscribe tasks.{' '}
            <Link to="/profile" style={{ color: 'var(--color-link)' }}>Link now →</Link>
          </p>
        </FadeUp>
      )}
    </div>
  )
}
