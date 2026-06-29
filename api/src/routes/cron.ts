import type { Context } from 'hono'
import type { Env } from '../bindings'
import type { HonoVariables } from '../types'
import { verifyCommentByAuthor } from '../lib/youtube'

// Cron: runs every 6h via CF Cron Trigger
// Job 1: migrate any lingering LOCKED claims → CREDITED (legacy cleanup)
// Job 2: verify PENDING_COMMENT claims (async YouTube index)

export async function cronHandler(c: Context<{ Bindings: Env; Variables: HonoVariables }>) {
  const secret = c.req.header('X-Cron-Secret')
  if (secret !== c.env.BETTER_AUTH_SECRET) {
    return c.json({ error: 'FORBIDDEN' }, 403)
  }

  const now = Math.floor(Date.now() / 1000)

  // Job 1: Migrate lingering LOCKED claims → CREDITED (should be empty after deploy)
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

  // Job 2: Verify pending comment claims (async YouTube index)
  // FIX2: Query by status='SUBMITTED' AND action_type='COMMENT' instead of coin_status='PENDING_COMMENT'
  const pendingComments = await c.env.DB.prepare(`
    SELECT tc.id, tc.claimer_id, tc.task_id, tc.youtube_channel_id,
           t.video_id, t.coin_per_unit
    FROM task_claims tc
    JOIN tasks t ON t.id = tc.task_id
    WHERE tc.status = 'SUBMITTED'
      AND t.action_type = 'COMMENT'
    LIMIT 20
  `).all<{ id: string; claimer_id: string; task_id: string; youtube_channel_id: string | null; video_id: string | null; coin_per_unit: number }>()

  let commentVerified = 0
  for (const claim of pendingComments.results) {
    if (!claim.video_id || !claim.youtube_channel_id || !c.env.YOUTUBE_API_KEY) continue
    const found = await verifyCommentByAuthor(claim.video_id, claim.youtube_channel_id, c.env.YOUTUBE_API_KEY)
    if (found) {
      const now2 = Math.floor(Date.now() / 1000)
      // FIX3: Atomic status flip first — prevents double-credit if cron runs concurrently
      const flipResult = await c.env.DB.prepare(
        `UPDATE task_claims SET status = 'VERIFIED', verified_at = ? WHERE id = ? AND status = 'SUBMITTED'`
      ).bind(now2, claim.id).run()
      if (flipResult.meta.changes === 0) continue // Already processed by another cron run

      // Only credit AFTER atomic flip succeeded
      await c.env.DB.batch([
        c.env.DB.prepare(`UPDATE wallets SET coin_balance = coin_balance + ? WHERE user_id = ?`).bind(claim.coin_per_unit, claim.claimer_id),
        c.env.DB.prepare(`INSERT INTO wallet_txns (id, user_id, type, amount, currency, ref_id, note) VALUES (?,?,?,?,?,?,?)`).bind(
          crypto.randomUUID(), claim.claimer_id, 'EARN', claim.coin_per_unit, 'COIN', claim.id, 'Comment verified (async)'
        ),
        c.env.DB.prepare(`UPDATE tasks SET delivered_count = delivered_count + 1, status = CASE WHEN delivered_count + 1 >= target_count THEN 'COMPLETED' ELSE status END WHERE id = ?`).bind(claim.task_id),
      ])
      commentVerified++
    }
  }

  return c.json({ ok: true, credited, processed: locked.results.length, comment_verified: commentVerified })
}
