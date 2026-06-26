import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { User, SignOut, Shield, YoutubeLogo, CheckCircle, Warning, Trash, Sun, Moon } from '@phosphor-icons/react'
import { api } from '../lib/api'
import { signOut } from '../lib/auth-client'
import { FadeUp } from '../components/ui/Motion'
import { toggleTheme, getStoredTheme } from '../lib/theme'

interface SessionUser {
  id: string; name: string; email: string; image?: string; role: string
}

interface LinkedChannel {
  id: string
  channel_id: string
  channel_name: string | null
  channel_avatar: string | null
  channel_url: string
  linked_at: number
}

interface YtStatus {
  channels: LinkedChannel[]
  max_channels: number
  can_link_more: boolean
}

const YT_LINK_MESSAGES: Record<string, { msg: string; ok: boolean }> = {
  success: { msg: 'YouTube channel linked successfully!', ok: true },
  cancelled: { msg: 'YouTube linking cancelled.', ok: false },
  token_error: { msg: 'Google authentication error. Please try again.', ok: false },
  no_channel: { msg: 'This Google account has no YouTube channel.', ok: false },
  channel_taken: { msg: 'This channel is already linked to another account.', ok: false },
  already_linked: { msg: 'This channel is already linked to your account.', ok: false },
  quota_exceeded: { msg: 'You have reached your channel link limit.', ok: false },
  expired: { msg: 'Session expired. Please try again.', ok: false },
}

export function ProfilePage() {
  const qc = useQueryClient()
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)
  const [theme, setTheme] = useState(getStoredTheme)

  // Check yt_link query param
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const status = params.get('yt_link')
    if (status && YT_LINK_MESSAGES[status]) {
      setToast(YT_LINK_MESSAGES[status])
      // Clean URL
      window.history.replaceState({}, '', '/profile')
    }
  }, [])

  const { data: session, isLoading: sessionLoading } = useQuery({
    queryKey: ['session'],
    queryFn: () => api.get<{ user: SessionUser }>('/auth/get-session'),
  })

  const { data: ytStatus, isLoading: ytLoading } = useQuery({
    queryKey: ['yt-link-status'],
    queryFn: () => api.get<YtStatus>('/youtube-link/status'),
  })

  const unlinkMutation = useMutation({
    mutationFn: (channel_id: string) => api.post('/youtube-link/unlink', { channel_id }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['yt-link-status'] })
      setToast({ msg: 'YouTube channel unlinked.', ok: false })
    },
  })

  const user = session?.user

  const handleSignOut = () => {
    signOut()
  }

  const handleLinkYT = () => {
    window.location.href = '/api/youtube-link/start'
  }

  if (sessionLoading) return <div className="card p-8 animate-pulse h-48" />

  const channels = ytStatus?.channels ?? []
  const maxChannels = ytStatus?.max_channels ?? 10
  const canLinkMore = ytStatus?.can_link_more ?? true

  return (
    <div className="flex flex-col gap-6">
      {toast && (
        <div
          className="card p-4 flex items-center gap-3 text-sm"
          style={{ borderColor: toast.ok ? 'var(--color-success)' : 'var(--color-danger)', color: toast.ok ? 'var(--color-success)' : 'var(--color-danger)' }}
        >
          {toast.ok ? <CheckCircle size={18} /> : <Warning size={18} />}
          {toast.msg}
        </div>
      )}

      <FadeUp>
        <h1 className="display text-xl">Account</h1>
      </FadeUp>

      <FadeUp delay={0.05} className="card p-6 flex items-center gap-4">
        {user?.image
          ? <img src={user.image} alt="" className="w-14 h-14 rounded-full" />
          : <div className="w-14 h-14 rounded-full flex items-center justify-center" style={{ background: 'var(--color-elevated)' }}>
              <User size={28} color="var(--color-muted)" />
            </div>
        }
        <div>
          <p className="font-semibold text-base">{user?.name ?? 'User'}</p>
          <p className="text-sm" style={{ color: 'var(--color-muted)' }}>{user?.email}</p>
          {user?.role === 'admin' && (
            <span className="badge badge-orange mt-1"><Shield size={10} weight="fill" /> Admin</span>
          )}
        </div>
      </FadeUp>

      {/* YouTube Channel Link */}
      <FadeUp delay={0.08}>
        <div className="card p-6 flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <YoutubeLogo size={20} color="#FF0000" weight="fill" />
            <p className="font-semibold text-sm">YouTube Channels</p>
            {channels.length > 0 && (
              <span className="badge badge-green ml-auto">{channels.length} / {maxChannels} linked</span>
            )}
          </div>

          {ytLoading ? (
            <div className="h-10 rounded animate-pulse" style={{ background: 'var(--color-elevated)' }} />
          ) : (
            <div className="flex flex-col gap-3">
              {channels.map(ch => (
                <div key={ch.channel_id} className="flex items-center gap-3 p-3 rounded-lg" style={{ background: 'var(--color-elevated)' }}>
                  {ch.channel_avatar && (
                    <img src={ch.channel_avatar} alt="" className="w-9 h-9 rounded-full flex-shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{ch.channel_name ?? 'My Channel'}</p>
                    <a
                      href={ch.channel_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs truncate block"
                      style={{ color: 'var(--color-muted)' }}
                    >
                      {ch.channel_id}
                    </a>
                  </div>
                  <button
                    className="btn btn-ghost text-xs flex items-center gap-1"
                    style={{ color: 'var(--color-danger)' }}
                    onClick={() => unlinkMutation.mutate(ch.channel_id)}
                    disabled={unlinkMutation.isPending}
                  >
                    <Trash size={13} /> Unlink
                  </button>
                </div>
              ))}

              {channels.length === 0 && (
                <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
                  Link your YouTube channel to claim tasks and earn coins.
                </p>
              )}

              {canLinkMore && (
                <button className="btn btn-primary text-sm self-start" onClick={handleLinkYT}>
                  <YoutubeLogo size={16} weight="fill" /> Link YouTube Channel
                </button>
              )}

              {!canLinkMore && channels.length > 0 && (
                <p className="text-xs" style={{ color: 'var(--color-muted)' }}>
                  Channel limit reached ({channels.length} / {maxChannels}). Contact support to increase your limit.
                </p>
              )}
            </div>
          )}
        </div>
      </FadeUp>

      <FadeUp delay={0.09}>
        <div className="card p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {theme === 'dark' ? <Moon size={18} color="var(--color-muted)" /> : <Sun size={18} color="var(--color-muted)" />}
            <div>
              <p className="text-sm font-medium">Appearance</p>
              <p className="text-xs" style={{ color: 'var(--color-muted)' }}>
                {theme === 'dark' ? 'Dark mode' : 'Light mode'}
              </p>
            </div>
          </div>
          <button
            className="flex items-center gap-2 text-sm px-3 py-1.5 rounded-md border transition-colors"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
            onClick={() => { const next = toggleTheme(); setTheme(next) }}
          >
            {theme === 'dark' ? <><Sun size={14} /> Light</> : <><Moon size={14} /> Dark</>}
          </button>
        </div>
      </FadeUp>

      <FadeUp delay={0.1} className="card p-2 flex flex-col">
        <button
          className="flex items-center gap-3 px-4 py-3 rounded-md text-sm transition-colors text-left w-full"
          style={{ color: 'var(--color-danger)' }}
          onClick={handleSignOut}
        >
          <SignOut size={16} /> Sign out
        </button>
      </FadeUp>

      <FadeUp delay={0.12} className="card p-4">
        <p className="text-xs font-medium mb-2" style={{ color: 'var(--color-muted)' }}>Account info</p>
        <div className="flex flex-col gap-2">
          {[
            { label: 'ID', value: user?.id?.slice(0, 8) + '...' },
            { label: 'Role', value: user?.role ?? 'user' },
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
