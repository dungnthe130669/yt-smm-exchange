import { CheckCircle, XCircle, HourglassHigh } from '@phosphor-icons/react'
import { useSearchParams } from 'react-router-dom'
import { FadeUp } from '../components/ui/Motion'
import { Link } from 'react-router-dom'

const RESULT: Record<string, { icon: typeof CheckCircle; color: string; title: string; body: string }> = {
  success:          { icon: CheckCircle,    color: 'var(--color-success)', title: 'Verified!',              body: 'Credits locked. They will unlock after 48h if you stay subscribed.' },
  not_subscribed:   { icon: XCircle,        color: 'var(--color-danger)',  title: 'Not subscribed',          body: 'We could not find a subscription from your account. Please try again.' },
  rejected:         { icon: XCircle,        color: 'var(--color-danger)',  title: 'Claim rejected',          body: 'Failed verify twice. This task has been cancelled.' },
  duplicate_channel:{ icon: XCircle,        color: 'var(--color-danger)',  title: 'Channel already used',    body: 'This YouTube channel has already verified this task.' },
  no_channel:       { icon: XCircle,        color: 'var(--color-danger)',  title: 'No YouTube channel found',body: 'This Google account has no YouTube channel.' },
  token_error:      { icon: XCircle,        color: 'var(--color-danger)',  title: 'Google auth error',       body: 'Could not get token. Please try again.' },
  expired:          { icon: HourglassHigh,  color: 'var(--color-orange)',  title: 'Session expired',         body: 'Over 10 minutes elapsed. Go back and try submitting again.' },
  cancelled:        { icon: HourglassHigh,  color: 'var(--color-muted)',   title: 'Cancelled',               body: 'You cancelled Google OAuth.' },
  error:            { icon: XCircle,        color: 'var(--color-danger)',  title: 'System error',            body: 'Something went wrong. Please try again in a moment.' },
}

export function VerifyResultPage() {
  const [params] = useSearchParams()
  const status = params.get('status') ?? 'error'
  const xu = params.get('xu')
  const result = RESULT[status] ?? RESULT['error']!
  const { icon: Icon, color, title, body } = result

  return (
    <div className="min-h-[100dvh] flex items-center justify-center px-4">
      <FadeUp className="card p-8 max-w-sm w-full flex flex-col items-center gap-4 text-center">
        <div
          className="w-16 h-16 rounded-full flex items-center justify-center"
          style={{ background: `rgb(from ${color} r g b / 0.12)` }}
        >
          <Icon size={32} color={color} weight="fill" />
        </div>

        <div>
          <h1 className="display text-lg">{title}</h1>
          <p className="text-sm mt-2" style={{ color: 'var(--color-muted)' }}>{body}</p>
        </div>

        {status === 'success' && xu && (
          <div
            className="w-full card p-3 flex items-center justify-center gap-2"
            style={{ borderColor: 'var(--color-xu)' }}
          >
            <span className="mono font-bold text-xl" style={{ color: 'var(--color-xu)' }}>+{xu}</span>
            <span className="text-sm" style={{ color: 'var(--color-muted)' }}>credits locked (unlock after 48h)</span>
          </div>
        )}

        <Link to="/my-tasks" className="btn-primary w-full justify-center mt-2">
          View my tasks
        </Link>
        <Link to="/" className="btn-ghost w-full justify-center" style={{ textDecoration: 'none' }}>
          Back to Feed
        </Link>
      </FadeUp>
    </div>
  )
}
