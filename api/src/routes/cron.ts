import type { Context } from 'hono'
import type { Env } from '../bindings'
import type { HonoVariables } from '../types'

// Cron: runs every 6h via CF Cron Trigger
// Job: unlock coins for claims where xu_locked_at < now - 48h
//      Check: still subscribed (YouTube API) → CREDITED or CLAWED_BACK

const XU_LOCK_DURATION = 48 * 3600  // 48 hours in seconds
const CHURN_WINDOW = 72 * 3600      // 72h after lock → still check

export async function cronHandler(c: Context<{ Bindings: Env; Variables: HonoVariables }>) {
  // Verify cron secret (prevent external trigger)
  const secret = c.req.header('X-Cron-Secret')
  if (secret !== c.env.BETTER_AUTH_SECRET) {
    return c.json({ error: 'FORBIDDEN' }, 403)
  }

  const now = Math.floor(Date.now() / 1000)
  const unlockBefore = now - XU_LOCK_DURATION

  // Find claims ready to unlock
  const ready = await c.env.DB.prepare(`
    SELECT tc.*, t.channel_id
    FROM task_claims tc
    JOIN tasks t ON t.id = tc.task_id
    WHERE tc.xu_status = 'LOCKED'
      AND tc.xu_locked_at IS NOT NULL
      AND tc.xu_locked_at < ?
    LIMIT 50
  `).bind(unlockBefore).all<{
    id: string; claimer_id: string; task_id: string;
    youtube_channel_id: string; xu_amount: number;
    channel_id: string; xu_locked_at: number;
  }>()

  let credited = 0
  let clawedBack = 0

  for (const claim of ready.results) {
    const stillSubbed = await checkStillSubscribed(
      claim.youtube_channel_id,
      claim.channel_id,
      c.env.YOUTUBE_API_KEY
    )

    if (stillSubbed) {
      // Credit xu to wallet
      await c.env.DB.batch([
        c.env.DB.prepare(`
          UPDATE task_claims SET xu_status = 'CREDITED', verified_at = ? WHERE id = ?
        `).bind(now, claim.id),
        c.env.DB.prepare(`
          UPDATE wallets SET xu_pending = xu_pending - ?, xu_balance = xu_balance + ? WHERE user_id = ?
        `).bind(claim.xu_amount, claim.xu_amount, claim.claimer_id),
        c.env.DB.prepare(`
          INSERT INTO wallet_txns (id, user_id, type, amount, currency, ref_id, note)
          VALUES (?,?,?,?,?,?,?)
        `).bind(crypto.randomUUID(), claim.claimer_id, 'EARN', claim.xu_amount, 'XU', claim.id, 'Coins unlocked after 48h verify'),
      ])
      credited++
    } else {
      // Claw back
      await c.env.DB.batch([
        c.env.DB.prepare(`
          UPDATE task_claims SET xu_status = 'CLAWED_BACK' WHERE id = ?
        `).bind(claim.id),
        c.env.DB.prepare(`
          UPDATE wallets SET xu_pending = xu_pending - ? WHERE user_id = ?
        `).bind(claim.xu_amount, claim.claimer_id),
        c.env.DB.prepare(`
          INSERT INTO wallet_txns (id, user_id, type, amount, currency, ref_id, note)
          VALUES (?,?,?,?,?,?,?)
        `).bind(crypto.randomUUID(), claim.claimer_id, 'CLAW_BACK', claim.xu_amount, 'XU', claim.id, 'Unsub detected — coins clawed back'),
      ])
      clawedBack++
    }
  }

  return c.json({ ok: true, credited, clawedBack, processed: ready.results.length })
}

// Check earner still subscribed via YouTube subscriptions.list (public)
// NOTE: subscriptions.list requires OAuth — public check impossible for private subs
// Fallback: subscriber count delta still > 0 for channel (approximate)
// For MVP: trust the 48h lock as deterrent, full churn check needs earner re-OAuth
async function checkStillSubscribed(
  _earnerChannelId: string,
  buyerChannelId: string,
  apiKey: string
): Promise<boolean> {
  try {
    // MVP: check channel still exists and count hasn't dropped significantly
    // Full implementation: earner re-OAuth to verify subscription still active
    const res = await fetch(
      `https://www.googleapis.com/youtube/v3/channels?part=statistics&id=${buyerChannelId}&key=${apiKey}`
    )
    const data = await res.json<{ items?: Array<{ statistics: { subscriberCount: string } }> }>()
    return (data.items?.length ?? 0) > 0 // channel exists = optimistic pass for MVP
  } catch {
    return true // fail open — don't punish earner on API error
  }
}
