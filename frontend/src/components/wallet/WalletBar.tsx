import { Coins, TrendUp, Clock } from '@phosphor-icons/react'
import type { Wallet } from '../../types'
import { CountUp, FadeUp } from '../ui/Motion'

interface WalletBarProps {
  wallet: Wallet
}

export function WalletBar({ wallet }: WalletBarProps) {
  return (
    <FadeUp className="card px-4 py-3 flex items-center gap-6 overflow-x-auto">

      {/* Credits balance */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center"
          style={{ background: 'rgb(245 158 11 / 0.15)' }}
        >
          <Coins size={16} color="var(--color-xu)" weight="fill" />
        </div>
        <div>
          <p className="text-xs" style={{ color: 'var(--color-muted)' }}>Credits</p>
          <p className="mono font-medium text-sm" style={{ color: 'var(--color-xu)' }}>
            <CountUp value={wallet.xu_balance} />
            <span className="text-xs ml-0.5" style={{ color: 'var(--color-muted)' }}>cr</span>
          </p>
        </div>
      </div>

      <div className="w-px h-8 flex-shrink-0" style={{ background: 'var(--color-border)' }} />

      {/* Credits pending */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center"
          style={{ background: 'rgb(249 115 22 / 0.1)' }}
        >
          <Clock size={16} color="var(--color-orange)" />
        </div>
        <div>
          <p className="text-xs" style={{ color: 'var(--color-muted)' }}>Pending</p>
          <p className="mono font-medium text-sm" style={{ color: 'var(--color-orange)' }}>
            <CountUp value={wallet.xu_pending} />
            <span className="text-xs ml-0.5" style={{ color: 'var(--color-muted)' }}>cr</span>
          </p>
        </div>
      </div>

      <div className="w-px h-8 flex-shrink-0" style={{ background: 'var(--color-border)' }} />

      {/* USD balance */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center"
          style={{ background: 'rgb(34 197 94 / 0.1)' }}
        >
          <TrendUp size={16} color="var(--color-success)" weight="bold" />
        </div>
        <div>
          <p className="text-xs" style={{ color: 'var(--color-muted)' }}>USD Balance</p>
          <p className="mono font-medium text-sm" style={{ color: 'var(--color-success)' }}>
            <CountUp value={wallet.balance_vnd} />
            <span className="text-xs ml-0.5" style={{ color: 'var(--color-muted)' }}>$</span>
          </p>
        </div>
      </div>
    </FadeUp>
  )
}
