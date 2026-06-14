import { YoutubeLogo } from '@phosphor-icons/react'
import { FadeUp } from '../components/ui/Motion'

export function LoginPage() {
  const handleGoogleLogin = () => {
    window.location.href = '/api/auth/sign-in/social?provider=google&callbackURL=/'
  }

  return (
    <div className="min-h-[100dvh] flex items-center justify-center px-4">
      <FadeUp className="w-full max-w-sm flex flex-col items-center gap-8">

        {/* Brand */}
        <div className="flex flex-col items-center gap-3">
          <div
            className="w-14 h-14 rounded-xl flex items-center justify-center"
            style={{ background: 'var(--color-sub)' }}
          >
            <YoutubeLogo size={28} color="#fff" weight="fill" />
          </div>
          <div className="text-center">
            <h1 className="display text-2xl">
              YT<span style={{ color: 'var(--color-orange)' }}>Exchange</span>
            </h1>
            <p className="text-sm mt-1" style={{ color: 'var(--color-muted)' }}>
              Sub chéo. Kiếm xu. Mua sub thật.
            </p>
          </div>
        </div>

        {/* How it works — 3 steps */}
        <div className="w-full flex flex-col gap-2">
          {[
            { num: '01', text: 'Sub kênh YouTube trong feed', color: 'var(--color-sub)' },
            { num: '02', text: 'Verify qua Google OAuth, nhận xu', color: 'var(--color-xu)' },
            { num: '03', text: 'Dùng xu đặt sub cho kênh của bạn', color: 'var(--color-success)' },
          ].map(({ num, text, color }) => (
            <div key={num} className="flex items-center gap-3 p-3 rounded-md" style={{ background: 'var(--color-surface)' }}>
              <span className="mono font-bold text-xs flex-shrink-0" style={{ color }}>{num}</span>
              <span className="text-sm">{text}</span>
            </div>
          ))}
        </div>

        {/* Login button */}
        <div className="w-full flex flex-col gap-3">
          <button
            className="w-full flex items-center justify-center gap-3 py-3 px-4 rounded-md font-medium text-sm transition-opacity hover:opacity-90"
            style={{ background: '#fff', color: '#111' }}
            onClick={handleGoogleLogin}
          >
            {/* Google SVG icon */}
            <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
              <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
              <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
              <path d="M3.964 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.039l3.007-2.332z" fill="#FBBC05"/>
              <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.961L3.964 7.293C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
            </svg>
            Tiếp tục với Google
          </button>

          <p className="text-center text-xs" style={{ color: 'var(--color-subtle)' }}>
            Bằng cách đăng nhập, bạn đồng ý với điều khoản sử dụng của nền tảng.
          </p>
        </div>
      </FadeUp>
    </div>
  )
}
