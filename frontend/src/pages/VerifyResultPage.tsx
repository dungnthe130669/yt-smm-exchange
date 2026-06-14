import { CheckCircle, XCircle, HourglassHigh } from '@phosphor-icons/react'
import { useSearchParams } from 'react-router-dom'
import { FadeUp } from '../components/ui/Motion'
import { Link } from 'react-router-dom'

const RESULT: Record<string, { icon: typeof CheckCircle; color: string; title: string; body: string }> = {
  success:          { icon: CheckCircle,    color: 'var(--color-success)', title: 'Verify thành công!',        body: 'Xu đã được khóa, sẽ unlock sau 48h nếu bạn không unsub.' },
  not_subscribed:   { icon: XCircle,        color: 'var(--color-danger)',  title: 'Chưa sub kênh',             body: 'Hệ thống không tìm thấy sub từ tài khoản của bạn. Thử lại.' },
  rejected:         { icon: XCircle,        color: 'var(--color-danger)',  title: 'Claim bị từ chối',           body: 'Quá 2 lần verify thất bại. Task này đã bị hủy.' },
  duplicate_channel:{ icon: XCircle,        color: 'var(--color-danger)',  title: 'Kênh đã dùng rồi',          body: 'YouTube channel này đã verify task này trước đó.' },
  no_channel:       { icon: XCircle,        color: 'var(--color-danger)',  title: 'Không tìm thấy kênh YouTube',body: 'Tài khoản Google này chưa có YouTube channel.' },
  token_error:      { icon: XCircle,        color: 'var(--color-danger)',  title: 'Lỗi xác thực Google',       body: 'Không lấy được token. Thử verify lại.' },
  expired:          { icon: HourglassHigh,  color: 'var(--color-orange)',  title: 'Phiên đã hết hạn',          body: 'Quá 10 phút. Quay lại và thử submit lại.' },
  cancelled:        { icon: HourglassHigh,  color: 'var(--color-muted)',   title: 'Đã hủy',                    body: 'Bạn đã hủy xác thực Google OAuth.' },
  error:            { icon: XCircle,        color: 'var(--color-danger)',  title: 'Lỗi hệ thống',              body: 'Có lỗi xảy ra. Thử lại sau ít phút.' },
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
            <span className="text-sm" style={{ color: 'var(--color-muted)' }}>xu đang khóa (unlock sau 48h)</span>
          </div>
        )}

        <Link to="/my-tasks" className="btn-primary w-full justify-center mt-2">
          Xem nhiệm vụ
        </Link>
        <Link to="/" className="btn-ghost w-full justify-center" style={{ textDecoration: 'none' }}>
          Về Feed
        </Link>
      </FadeUp>
    </div>
  )
}
