import { useQuery } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { ArrowUp, ArrowDown, ArrowsLeftRight, CheckCircle, Warning } from '@phosphor-icons/react'
import { api } from '../lib/api'
import type { Wallet, WalletTxn } from '../types'
import { WalletBar } from '../components/wallet/WalletBar'
import { FadeUp, StaggerList, StaggerItem } from '../components/ui/Motion'

const TXN_LABEL: Record<string, { label: string; sign: '+' | '-' | '~'; color: string }> = {
  EARN:            { label: 'Earn coins',  sign: '+', color: 'var(--color-success)' },
  SPEND:           { label: 'Spend coins', sign: '-', color: 'var(--color-danger)'  },
  BUY_COIN:        { label: 'Buy coins',   sign: '+', color: 'var(--color-xu)'      },
  BUY_USD:         { label: 'Deposit USD',  sign: '+', color: 'var(--color-success)' },
  CLAW_BACK:      { label: 'Claw back',    sign: '-', color: 'var(--color-danger)'  },
  REFUND:         { label: 'Refund',       sign: '+', color: 'var(--color-success)' },
  ESCROW_LOCK:    { label: 'Escrow lock',  sign: '-', color: 'var(--color-muted)'   },
  ESCROW_RELEASE: { label: 'Release',      sign: '+', color: 'var(--color-muted)'   },
}

function formatDate(ts: number) {
  return new Date(ts * 1000).toLocaleDateString('en-US', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  })
}

const COIN_PER_USD = 100 // default; mirrors KV default

function DepositPanel() {
  const [amountUsd, setAmountUsd] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [coinPerUsd, setCoinPerUsd] = useState<number>(COIN_PER_USD)

  // Fetch actual rate from pricing endpoint on mount
  useEffect(() => {
    api.get<{ coin_per_usd?: number; [key: string]: unknown }>('/tasks/pricing')
      .then(pricing => {
        if (typeof pricing.coin_per_usd === 'number') {
          setCoinPerUsd(pricing.coin_per_usd)
        }
      })
      .catch(() => { /* keep default */ })
  }, [])

  const showToast = (msg: string, ok: boolean) => {
    setToast({ msg, ok })
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 5000)
  }

  // Check ?deposit=success on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('deposit') === 'success') {
      showToast('Payment submitted! Coins will be credited after confirmation.', true)
      // Clean URL
      const url = new URL(window.location.href)
      url.searchParams.delete('deposit')
      window.history.replaceState({}, '', url.toString())
    }
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current)
    }
  }, [])

  const parsed = parseFloat(amountUsd)
  const validAmount = !isNaN(parsed) && parsed >= 1 && parsed <= 500
  const coinPreview = validAmount ? Math.floor(parsed * coinPerUsd) : null

  const handleDeposit = async () => {
    if (!validAmount) return
    setLoading(true)
    try {
      const res = await api.post<{ checkout_url: string; invoice_id: string; coin_amount: number }>(
        '/wallet/deposit',
        { amount_usd: parsed }
      )
      if (res.checkout_url) {
        window.location.href = res.checkout_url
      } else {
        showToast('No checkout URL returned from payment gateway.', false)
      }
    } catch (err: unknown) {
      const errObj = err as Record<string, unknown>
      const msg = typeof errObj?.error === 'string'
        ? errObj.error
        : 'Payment request failed. Please try again.'
      showToast(msg, false)
    } finally {
      setLoading(false)
    }
  }

  return (
    <FadeUp delay={0.08}>
      <div className="card px-4 py-4 flex flex-col gap-3">
        <p className="text-xs font-medium uppercase tracking-widest" style={{ color: 'var(--color-muted)' }}>
          Deposit with Crypto
        </p>

        {toast && (
          <div
            className="flex items-center gap-2 text-xs px-3 py-2 rounded border"
            style={{
              borderColor: toast.ok ? 'var(--color-success)' : 'var(--color-danger)',
              color: toast.ok ? 'var(--color-success)' : 'var(--color-danger)',
            }}
          >
            {toast.ok ? <CheckCircle size={16} /> : <Warning size={16} />}
            {toast.msg}
          </div>
        )}

        <div className="flex flex-col gap-1">
          <label className="text-xs" style={{ color: 'var(--color-muted)' }}>Amount in USD</label>
          <input
            type="number"
            min={1}
            max={500}
            step={0.01}
            value={amountUsd}
            onChange={e => setAmountUsd(e.target.value)}
            placeholder="e.g. 10"
            className="w-full rounded border px-3 py-2 text-sm bg-transparent outline-none focus:border-[var(--color-primary)]"
            style={{ borderColor: 'var(--color-border)' }}
            disabled={loading}
          />
        </div>

        {coinPreview !== null && (
          <p className="text-xs" style={{ color: 'var(--color-muted)' }}>
            You will receive: <span className="font-semibold" style={{ color: 'var(--color-xu)' }}>{coinPreview.toLocaleString('en-US')} coins</span>
          </p>
        )}

        <button
          onClick={handleDeposit}
          disabled={!validAmount || loading}
          className="btn-primary text-sm px-4 py-2 rounded disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Redirecting…' : 'Deposit with Crypto'}
        </button>
      </div>
    </FadeUp>
  )
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
        <h1 className="display text-xl">My Wallet</h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--color-muted)' }}>
          Coin balance and transaction history.
        </p>
      </FadeUp>

      {/* Wallet summary */}
      {wallet && <WalletBar wallet={wallet} />}

      {/* USD deposit balance */}
      {wallet && (
        <FadeUp delay={0.06}>
          <div className="card px-4 py-3 flex items-center justify-between">
            <div>
              <p className="text-xs" style={{ color: 'var(--color-muted)' }}>USD Deposit Balance</p>
              <p className="mono font-medium text-sm" style={{ color: 'var(--color-success)' }}>
                ${((wallet.balance_usd_micro ?? 0) / 1_000_000).toFixed(2)} USD
              </p>
            </div>
            <span className="text-xs px-2 py-0.5 rounded" style={{ background: 'var(--color-elevated)', color: 'var(--color-muted)' }}>
              Deposit only
            </span>
          </div>
        </FadeUp>
      )}

      {/* Quick actions */}
      <FadeUp delay={0.08} className="grid grid-cols-2 gap-3">
        {[
          { icon: ArrowDown, label: 'Deposit USD', color: 'var(--color-success)' },
          { icon: ArrowUp,   label: 'Withdraw',   color: 'var(--color-muted)' },
        ].map(({ icon: Icon, label, color }) => (
          <button
            key={label}
            className="card p-4 flex flex-col items-center gap-2 text-center hover:border-[var(--color-border-hover)] transition-colors cursor-not-allowed opacity-60"
            title="Coming soon"
          >
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center"
              style={{ background: `rgb(from ${color} r g b / 0.12)` }}
            >
              <Icon size={18} color={color} weight="fill" />
            </div>
            <span className="text-xs font-medium">{label}</span>
            <span className="text-xs" style={{ color: 'var(--color-subtle)' }}>Coming soon</span>
          </button>
        ))}
      </FadeUp>

      {/* Crypto deposit panel */}
      <DepositPanel />

      {/* Transaction history */}
      <section className="flex flex-col gap-3">
        <FadeUp delay={0.1} className="flex items-center justify-between">
          <p className="text-xs font-medium uppercase tracking-widest" style={{ color: 'var(--color-muted)' }}>
            Transaction history
          </p>
          <ArrowsLeftRight size={14} color="var(--color-muted)" />
        </FadeUp>

        {txns.length === 0 && (
          <FadeUp className="card p-8 text-center">
            <p className="text-sm" style={{ color: 'var(--color-muted)' }}>No transactions yet.</p>
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
                      {meta.sign}{txn.amount.toLocaleString('en-US')}
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
