import { useQuery } from '@tanstack/react-query'
import { Coins, ArrowUp, ArrowDown, ArrowsLeftRight } from '@phosphor-icons/react'
import { api } from '../lib/api'
import type { Wallet, WalletTxn } from '../types'
import { WalletBar } from '../components/wallet/WalletBar'
import { FadeUp, StaggerList, StaggerItem } from '../components/ui/Motion'

const TXN_LABEL: Record<string, { label: string; sign: '+' | '-' | '~'; color: string }> = {
  EARN:            { label: 'Nhận xu',      sign: '+', color: 'var(--color-success)' },
  SPEND:           { label: 'Dùng xu',      sign: '-', color: 'var(--color-danger)'  },
  BUY_XU:         { label: 'Mua xu',       sign: '+', color: 'var(--color-xu)'      },
  BUY_VND:        { label: 'Nạp VND',      sign: '+', color: 'var(--color-success)' },
  CLAW_BACK:      { label: 'Thu hồi xu',   sign: '-', color: 'var(--color-danger)'  },
  REFUND:         { label: 'Hoàn tiền',    sign: '+', color: 'var(--color-success)' },
  ESCROW_LOCK:    { label: 'Khóa escrow',  sign: '-', color: 'var(--color-muted)'   },
  ESCROW_RELEASE: { label: 'Giải phóng',   sign: '+', color: 'var(--color-muted)'   },
}

function formatDate(ts: number) {
  return new Date(ts * 1000).toLocaleDateString('vi-VN', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  })
}

export function WalletPage() {
  const { data: walletData } = useQuery({
    queryKey: ['wallet'],
    queryFn: () => api.get<{ wallet: Wallet; txns: WalletTxn[] }>('/wallet'),
  })

  const wallet = walletData?.wallet
  const txns   = walletData?.txns ?? []

  return (
    <div className="flex flex-col gap-6">
      <FadeUp>
        <h1 className="display text-xl">Ví của tôi</h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--color-muted)' }}>
          Số dư xu, VND và lịch sử giao dịch.
        </p>
      </FadeUp>

      {/* Wallet summary */}
      {wallet && <WalletBar wallet={wallet} />}

      {/* Quick actions */}
      <FadeUp delay={0.08} className="grid grid-cols-3 gap-3">
        {[
          { icon: ArrowDown, label: 'Nạp VND', color: 'var(--color-success)' },
          { icon: Coins,     label: 'Mua xu',  color: 'var(--color-xu)' },
          { icon: ArrowUp,   label: 'Rút tiền',color: 'var(--color-muted)' },
        ].map(({ icon: Icon, label, color }) => (
          <button
            key={label}
            className="card p-4 flex flex-col items-center gap-2 text-center hover:border-[var(--color-border-hover)] transition-colors cursor-not-allowed opacity-60"
            title="Sắp ra mắt"
          >
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center"
              style={{ background: `rgb(from ${color} r g b / 0.12)` }}
            >
              <Icon size={18} color={color} weight="fill" />
            </div>
            <span className="text-xs font-medium">{label}</span>
            <span className="text-xs" style={{ color: 'var(--color-subtle)' }}>Sắp ra mắt</span>
          </button>
        ))}
      </FadeUp>

      {/* Transaction history */}
      <section className="flex flex-col gap-3">
        <FadeUp delay={0.1} className="flex items-center justify-between">
          <p className="text-xs font-medium uppercase tracking-widest" style={{ color: 'var(--color-muted)' }}>
            Lịch sử giao dịch
          </p>
          <ArrowsLeftRight size={14} color="var(--color-muted)" />
        </FadeUp>

        {txns.length === 0 && (
          <FadeUp className="card p-8 text-center">
            <p className="text-sm" style={{ color: 'var(--color-muted)' }}>Chưa có giao dịch nào.</p>
          </FadeUp>
        )}

        <StaggerList className="flex flex-col divide-y" style={{ '--tw-divide-opacity': 1 } as React.CSSProperties}>
          {txns.map((txn) => {
            const meta = TXN_LABEL[txn.type] ?? { label: txn.type, sign: '~' as const, color: 'var(--color-muted)' }
            return (
              <StaggerItem key={txn.id}>
                <div
                  className="flex items-center justify-between py-3"
                  style={{ borderColor: 'var(--color-border)' }}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{meta.label}</p>
                    <p className="text-xs" style={{ color: 'var(--color-muted)' }}>
                      {formatDate(txn.created_at)}
                      {txn.note && ` · ${txn.note}`}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0 ml-4">
                    <p className="mono font-medium text-sm" style={{ color: meta.color }}>
                      {meta.sign}{txn.amount.toLocaleString('vi-VN')}
                    </p>
                    <p className="text-xs" style={{ color: 'var(--color-muted)' }}>{txn.currency}</p>
                  </div>
                </div>
              </StaggerItem>
            )
          })}
        </StaggerList>
      </section>
    </div>
  )
}
