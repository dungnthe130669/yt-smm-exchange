import { Hono } from 'hono'
import type { Env } from '../bindings'
import type { HonoVariables } from '../types'
import { requireAuth } from '../middleware/auth'

export const walletRoutes = new Hono<{ Bindings: Env; Variables: HonoVariables }>()

// GET /api/wallet — get own wallet + recent txns
walletRoutes.get('/', async (c) => {
  const guard = requireAuth(c)
  if (guard) return guard

  const userId = c.get('userId')!

  const [wallet, txns] = await Promise.all([
    c.env.DB.prepare(`SELECT * FROM wallets WHERE user_id = ?`).bind(userId).first(),
    c.env.DB.prepare(
      `SELECT * FROM wallet_txns WHERE user_id = ? ORDER BY created_at DESC LIMIT 30`
    ).bind(userId).all(),
  ])

  return c.json({ wallet, txns: txns.results })
})

// POST /api/wallet/deposit — create Confirmo crypto invoice
walletRoutes.post('/deposit', async (c) => {
  const guard = requireAuth(c)
  if (guard) return guard

  const userId = c.get('userId')!

  // Validate body
  let body: { amount_usd?: unknown }
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'INVALID_BODY' }, 400)
  }

  const amount_usd = body.amount_usd
  // HIGH-3: NaN passes typeof check — use Number.isFinite
  if (typeof amount_usd !== 'number' || !Number.isFinite(amount_usd) || amount_usd < 1 || amount_usd > 500) {
    return c.json({ error: 'INVALID_AMOUNT', message: 'amount_usd must be a number between 1 and 500' }, 400)
  }

  // Check API key
  const apiKey = c.env.CONFIRMO_API_KEY
  if (!apiKey) {
    return c.json({ error: 'PAYMENT_UNAVAILABLE' }, 503)
  }

  // Read coin_per_usd from KV
  const kvVal = await c.env.RATE_KV.get('pricing_config').catch(() => null)
  let coin_per_usd = 100
  if (kvVal) {
    try {
      const parsed = JSON.parse(kvVal) as { coin_per_usd?: number }
      if (typeof parsed.coin_per_usd === 'number') coin_per_usd = parsed.coin_per_usd
    } catch {
      // use default
    }
  }

  const coin_amount = Math.floor(amount_usd * coin_per_usd)

  // MED-3: read base URLs from env or fallback
  const apiBase = c.env.API_BASE_URL ?? 'https://yt-smm-exchange-api.linkdev.workers.dev'
  const appUrl = c.env.APP_URL ?? 'https://yt-smm-exchange.pages.dev'

  // Call Confirmo API
  let confirmoRes: Response
  try {
    confirmoRes = await fetch('https://confirmo.net/api/v3/invoices', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        settlement: { currency: 'USDT' },
        product: { name: 'Coin Deposit', description: `${coin_amount} coins` },
        invoice: {
          currencyFrom: 'USD',
          amount: amount_usd,
          notifyUrl: `${apiBase}/api/webhook/confirmo`,
          returnUrl: `${appUrl}/wallet?deposit=success`,
        },
      }),
    })
  } catch (e) {
    return c.json({ error: 'PAYMENT_GATEWAY_ERROR', detail: String(e) }, 502)
  }

  if (!confirmoRes.ok) {
    let detail = `HTTP ${confirmoRes.status}`
    try {
      const errBody = await confirmoRes.text()
      detail = errBody || detail
    } catch { /* ignore */ }
    return c.json({ error: 'PAYMENT_GATEWAY_ERROR', detail }, 502)
  }

  let invoiceData: { id?: string; url?: string; [key: string]: unknown }
  try {
    invoiceData = await confirmoRes.json()
  } catch (e) {
    return c.json({ error: 'PAYMENT_GATEWAY_ERROR', detail: 'Invalid JSON from Confirmo' }, 502)
  }

  const invoice_id = invoiceData.id
  if (!invoice_id || typeof invoice_id !== 'string') {
    return c.json({ error: 'PAYMENT_GATEWAY_ERROR', detail: 'Missing invoice id from Confirmo' }, 502)
  }

  // MED-1: validate checkout_url present
  const checkout_url = invoiceData.url
  if (!checkout_url || typeof checkout_url !== 'string') {
    return c.json({ error: 'PAYMENT_GATEWAY_ERROR', detail: 'Missing checkout URL from provider' }, 502)
  }

  // MED-2: prevent open redirect — must be confirmo.net
  if (!checkout_url.startsWith('https://confirmo.net/')) {
    return c.json({ error: 'PAYMENT_GATEWAY_ERROR', detail: 'Invalid checkout URL' }, 502)
  }

  // Save to DB
  await c.env.DB.prepare(
    `INSERT INTO deposit_invoices (id, user_id, amount_usd, coin_amount, status, checkout_url)
     VALUES (?, ?, ?, ?, 'PENDING', ?)`
  ).bind(invoice_id, userId, amount_usd, coin_amount, checkout_url).run()

  return c.json({ checkout_url, invoice_id, coin_amount })
})

// POST /api/webhook/confirmo — Confirmo webhook handler (no auth, mounted in index.ts)
export async function confirmoWebhookHandler(
  c: import('hono').Context<{ Bindings: Env; Variables: HonoVariables }>
) {
  const rawBody = await c.req.text()
  const secret = c.env.CONFIRMO_WEBHOOK_SECRET

  // HIGH-1: fail hard if secret missing — no dev bypass
  if (!secret) {
    console.error('[webhook] CONFIRMO_WEBHOOK_SECRET not configured')
    return c.json({ error: 'WEBHOOK_MISCONFIGURED' }, 500)
  }

  // Verify HMAC-SHA256 signature
  const sigHeader = c.req.header('x-confirmo-signature') ?? ''
  let valid = false
  try {
    const enc = new TextEncoder()
    const key = await crypto.subtle.importKey(
      'raw',
      enc.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    )
    const sig = await crypto.subtle.sign('HMAC', key, enc.encode(rawBody))
    const hex = Array.from(new Uint8Array(sig))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
    valid = hex === sigHeader
  } catch (e) {
    console.error('[webhook/confirmo] HMAC error', e)
  }
  if (!valid) {
    return c.json({ error: 'INVALID_SIGNATURE' }, 400)
  }

  // Parse body
  let payload: { id?: string; status?: string; data?: unknown }
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return c.json({ error: 'INVALID_BODY' }, 400)
  }

  const { id: invoiceId, status } = payload

  // Only care about COMPLETED
  if (status !== 'COMPLETED') {
    return c.json({ ok: true })
  }

  if (!invoiceId || typeof invoiceId !== 'string') {
    return c.json({ ok: true })
  }

  // HIGH-2: atomic status flip — prevents TOCTOU double-spend
  // Step 1: flip status atomically (only succeeds if PENDING)
  const flipResult = await c.env.DB.prepare(
    `UPDATE deposit_invoices SET status='COMPLETED', completed_at=unixepoch() WHERE id=? AND status='PENDING'`
  ).bind(invoiceId).run()

  // Step 2: only credit if we won the race
  if (flipResult.meta.changes === 0) {
    // Already processed or not found
    return c.json({ ok: true })
  }

  // Step 3: look up user_id + coin_amount from invoice
  const invoice = await c.env.DB.prepare(
    `SELECT user_id, coin_amount FROM deposit_invoices WHERE id=?`
  ).bind(invoiceId).first<{ user_id: string; coin_amount: number }>()

  if (!invoice) return c.json({ ok: true })

  // Step 4: credit wallet (LOW-3: check for missing wallet row)
  const walletResult = await c.env.DB.prepare(
    `UPDATE wallets SET coin_balance = coin_balance + ? WHERE user_id = ?`
  ).bind(invoice.coin_amount, invoice.user_id).run()

  if (walletResult.meta.changes === 0) {
    // Wallet row missing — create it
    await c.env.DB.prepare(
      `INSERT OR IGNORE INTO wallets (user_id, coin_balance, coin_pending, balance_usd_micro) VALUES (?, ?, 0, 0)`
    ).bind(invoice.user_id, invoice.coin_amount).run()
  }

  // Step 5: log txn
  await c.env.DB.prepare(
    `INSERT INTO wallet_txns (id, user_id, type, currency, amount, note, created_at)
     VALUES (?, ?, 'EARN', 'COIN', ?, 'Crypto deposit via Confirmo', unixepoch())`
  ).bind(crypto.randomUUID(), invoice.user_id, invoice.coin_amount).run()

  return c.json({ ok: true })
}
