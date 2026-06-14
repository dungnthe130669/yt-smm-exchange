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
