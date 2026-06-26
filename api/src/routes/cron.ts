import type { Context } from 'hono'
import type { Env } from '../bindings'
import type { HonoVariables } from '../types'

// Cron: runs every 6h via CF Cron Trigger
// Job: migrate any lingering LOCKED claims → CREDITED (legacy cleanup)
// New claims are credited immediately on verify — no lock period

export async function cronHandler(c: Context<{ Bindings: Env; Variables: HonoVariables }>) {
  const secret = c.req.header('X-Cron-Secret')
  if (secret !== c.env.BETTER_AUTH_SECRET) {
    return c.json({ error: 'FORBIDDEN' }, 403)
  }

  const now = Math.floor(Date.now() / 1000)

  // Migrate lingering LOCKED claims → CREDITED (should be empty after deploy)
  const locked = await c.env.DB.prepare(`
    SELECT tc.id, tc.claimer_id, tc.coin_amount
    FROM task_claims tc
    WHERE tc.coin_status = 'LOCKED'
      AND tc.coin_locked_at IS NOT NULL
    LIMIT 50
  `).all<{ id: string; claimer_id: string; coin_amount: number }>()

  let credited = 0
  for (const claim of locked.results) {
    await c.env.DB.batch([
      c.env.DB.prepare(`UPDATE task_claims SET coin_status = 'CREDITED' WHERE id = ?`).bind(claim.id),
      c.env.DB.prepare(`
        UPDATE wallets SET coin_pending = coin_pending - ?, coin_balance = coin_balance + ?
        WHERE user_id = ?
      `).bind(claim.coin_amount, claim.coin_amount, claim.claimer_id),
      c.env.DB.prepare(`
        INSERT INTO wallet_txns (id, user_id, type, amount, currency, ref_id, note)
        VALUES (?,?,?,?,?,?,?)
      `).bind(crypto.randomUUID(), claim.claimer_id, 'EARN', claim.coin_amount, 'COIN', claim.id, 'Coins unlocked (legacy migration)'),
    ])
    credited++
  }

  return c.json({ ok: true, credited, processed: locked.results.length })
}
