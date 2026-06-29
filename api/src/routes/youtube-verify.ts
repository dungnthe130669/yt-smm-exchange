import { Hono } from 'hono'
import type { Env } from '../bindings'
import type { HonoVariables } from '../types'
import { requireAuth } from '../middleware/auth'
import { verifySubscription, refreshAccessToken, verifyLike, verifyCommentByAuthor } from '../lib/youtube'
import { creditCoinPending } from '../lib/xu'

export const youtubeVerifyRoutes = new Hono<{ Bindings: Env; Variables: HonoVariables }>()

// POST /api/youtube-verify/:claimId
// Verify-only endpoint — user performed the action manually, server checks
// Works for SUBSCRIBE and LIKE action types
youtubeVerifyRoutes.post('/:claimId', async (c) => {
  const guard = requireAuth(c)
  if (guard) return guard

  const userId = c.get('userId')!
  const claimId = c.req.param('claimId')
  const { channel_id } = await c.req.json<{ channel_id?: string }>().catch(() => ({ channel_id: undefined }))

  // Load user's linked YouTube channel + refresh token
  const channelRow = await c.env.DB.prepare(
    channel_id
      ? `SELECT channel_id, refresh_token FROM user_linked_channels WHERE user_id = ? AND channel_id = ?`
      : `SELECT channel_id, refresh_token FROM user_linked_channels WHERE user_id = ? LIMIT 1`
  ).bind(...(channel_id ? [userId, channel_id] : [userId])).first<{ channel_id: string; refresh_token: string }>()

  if (!channelRow?.refresh_token) {
    return c.json({ error: 'NO_YT_CHANNEL', message: 'No linked YouTube channel found' }, 400)
  }

  const earnerChannelId = channelRow.channel_id
  const refreshToken = channelRow.refresh_token

  // Load claim — accept CLAIMED or SUBMITTED (frontend sends right after popup closes)
  const claim = await c.env.DB.prepare(`
    SELECT tc.id, tc.task_id, tc.claimer_id, tc.youtube_channel_id, tc.verify_attempts, tc.status,
           t.channel_id as target_channel_id, t.coin_per_unit, t.action_type, t.video_id
    FROM task_claims tc JOIN tasks t ON t.id = tc.task_id
    WHERE tc.id = ? AND tc.claimer_id = ? AND tc.status IN ('CLAIMED','SUBMITTED')
  `).bind(claimId, userId).first<{
    id: string; task_id: string; claimer_id: string
    target_channel_id: string; coin_per_unit: number
    youtube_channel_id: string | null; verify_attempts: number
    status: string; action_type: string; video_id: string | null
  }>()

  if (!claim) return c.json({ error: 'CLAIM_NOT_FOUND', message: 'Claim not found or not in claimable state' }, 404)

  // Duplicate channel check
  const dupCheck = await c.env.DB.prepare(
    `SELECT 1 FROM task_claims WHERE task_id = ? AND youtube_channel_id = ? AND id != ?`
  ).bind(claim.task_id, earnerChannelId, claimId).first()
  if (dupCheck) {
    return c.json({ error: 'DUPLICATE_CHANNEL', message: 'This channel has already completed this task' }, 409)
  }

  // FIX4: Atomically claim the slot — prevents double-verify race conditions
  // Only proceeds if youtube_channel_id is still NULL (not yet claimed by another concurrent request)
  const slotResult = await c.env.DB.prepare(
    `UPDATE task_claims SET youtube_channel_id = ? WHERE id = ? AND youtube_channel_id IS NULL`
  ).bind(earnerChannelId, claimId).run()
  if (slotResult.meta.changes === 0) {
    return c.json({ error: 'ALREADY_PROCESSING', message: 'This claim is already being verified' }, 409)
  }

  // Get fresh access token
  let accessToken: string
  try {
    accessToken = await refreshAccessToken(c.env.GOOGLE_CLIENT_ID, c.env.GOOGLE_CLIENT_SECRET, refreshToken)
  } catch (e) {
    console.error('[yt-verify] refresh token failed', e)
    // Release the slot on token failure so user can retry
    await c.env.DB.prepare(`UPDATE task_claims SET youtube_channel_id = NULL WHERE id = ?`).bind(claimId).run()
    return c.json({ error: 'TOKEN_REFRESH_FAILED', message: 'YouTube token expired. Please re-link your channel.' }, 401)
  }

  const actionType = claim.action_type ?? 'SUBSCRIBE'
  let verified = false

  if (actionType === 'SUBSCRIBE') {
    try {
      verified = await verifySubscription(accessToken, claim.target_channel_id)
    } catch (e) {
      console.error('[yt-verify] verify subscription error', e)
      return c.json({ error: 'VERIFY_ERROR', message: 'Error checking subscription' }, 500)
    }

    if (!verified) {
      await c.env.DB.prepare(
        `UPDATE task_claims SET verify_attempts = verify_attempts + 1 WHERE id = ?`
      ).bind(claimId).run()

      const attempts = claim.verify_attempts + 1
      if (attempts >= 3) {
        await c.env.DB.prepare(
          `UPDATE task_claims SET status = 'REJECTED' WHERE id = ?`
        ).bind(claimId).run()
        return c.json({ error: 'NOT_SUBSCRIBED', message: 'Subscription not detected after 3 attempts. Claim rejected.', rejected: true }, 400)
      }
      // Return 200 with retry hint — frontend checks res.retry directly (202 is also res.ok=true but kept as 200 for clarity)
      return c.json({ error: 'NOT_SUBSCRIBED', message: 'Subscription not detected yet. Please wait and retry.', retry: true, wait_seconds: 15, attempts }, 200)
    }

  } else if (actionType === 'LIKE') {
    const videoId = claim.video_id
    if (!videoId) return c.json({ error: 'MISSING_VIDEO', message: 'No video_id on task' }, 400)
    try {
      verified = await verifyLike(accessToken, videoId)
    } catch (e) {
      console.error('[yt-verify] verify like error', e)
      return c.json({ error: 'VERIFY_ERROR', message: 'Error checking like' }, 500)
    }
    if (!verified) {
      return c.json({ error: 'NOT_LIKED', message: 'Like not detected. Please like the video and try again.' }, 400)
    }
  } else {
    return c.json({ error: 'WRONG_ACTION', message: 'Use /comment-verify for COMMENT tasks' }, 400)
  }

  // Verify passed — mark VERIFIED, credit coin, log IP, update task
  const now = Math.floor(Date.now() / 1000)
  await c.env.DB.prepare(`
    UPDATE task_claims
    SET status = 'VERIFIED', verified_at = ?
    WHERE id = ?
  `).bind(now, claimId).run()

  await creditCoinPending(c.env.DB, claimId, userId, claim.coin_per_unit)

  const ipHash = c.get('ipHash') ?? 'unknown'
  const today = new Date().toISOString().slice(0, 10)
  await c.env.DB.prepare(
    `INSERT OR IGNORE INTO ip_task_log (ip_hash, channel_id, date_str) VALUES (?,?,?)`
  ).bind(ipHash, claim.target_channel_id, today).run()

  await c.env.DB.prepare(
    `INSERT OR IGNORE INTO user_completed_channels (user_id, channel_id) VALUES (?,?)`
  ).bind(userId, claim.target_channel_id).run()

  await c.env.DB.prepare(`
    UPDATE tasks SET delivered_count = delivered_count + 1,
      status = CASE WHEN delivered_count + 1 >= target_count THEN 'COMPLETED' ELSE status END
    WHERE id = ?
  `).bind(claim.task_id).run()

  return c.json({ ok: true, coins_earned: claim.coin_per_unit })
})

// POST /api/youtube-verify/:claimId/comment-verify
// For COMMENT tasks only — uses public API (no OAuth needed)
// If comment found → VERIFIED + credit
// If not found → PENDING_COMMENT (cron will re-check)
youtubeVerifyRoutes.post('/:claimId/comment-verify', async (c) => {
  const guard = requireAuth(c)
  if (guard) return guard

  const userId = c.get('userId')!
  const claimId = c.req.param('claimId')
  const { channel_id } = await c.req.json<{ channel_id?: string }>().catch(() => ({ channel_id: undefined }))

  // Load user's linked YouTube channel (need earner channel ID)
  const channelRow = await c.env.DB.prepare(
    channel_id
      ? `SELECT channel_id FROM user_linked_channels WHERE user_id = ? AND channel_id = ?`
      : `SELECT channel_id FROM user_linked_channels WHERE user_id = ? LIMIT 1`
  ).bind(...(channel_id ? [userId, channel_id] : [userId])).first<{ channel_id: string }>()

  if (!channelRow) {
    return c.json({ error: 'NO_YT_CHANNEL', message: 'No linked YouTube channel found' }, 400)
  }

  const earnerChannelId = channelRow.channel_id

  // Load claim — must be COMMENT action, CLAIMED, SUBMITTED, or VERIFIED (for idempotency)
  const claim = await c.env.DB.prepare(`
    SELECT tc.id, tc.task_id, tc.claimer_id, tc.youtube_channel_id, tc.verify_attempts, tc.status,
           t.channel_id as target_channel_id, t.coin_per_unit, t.action_type, t.video_id
    FROM task_claims tc JOIN tasks t ON t.id = tc.task_id
    WHERE tc.id = ? AND tc.claimer_id = ? AND tc.status IN ('CLAIMED','SUBMITTED','VERIFIED')
  `).bind(claimId, userId).first<{
    id: string; task_id: string; claimer_id: string
    target_channel_id: string; coin_per_unit: number
    youtube_channel_id: string | null; verify_attempts: number
    status: string; action_type: string; video_id: string | null
  }>()

  if (!claim) return c.json({ error: 'CLAIM_NOT_FOUND', message: 'Claim not found or not in claimable state' }, 404)
  if (claim.action_type !== 'COMMENT') {
    return c.json({ error: 'WRONG_ACTION', message: 'This endpoint is for COMMENT tasks only' }, 400)
  }

  // FIX10: Idempotency — already verified
  if (claim.status === 'VERIFIED') {
    return c.json({ ok: true, coins_earned: claim.coin_per_unit, message: 'Already verified' })
  }

  if (!claim.video_id) {
    return c.json({ error: 'MISSING_VIDEO', message: 'No video_id on task' }, 400)
  }

  if (!c.env.YOUTUBE_API_KEY) {
    return c.json({ error: 'NO_API_KEY', message: 'YouTube API key not configured' }, 500)
  }

  // Duplicate check
  const dupCheck = await c.env.DB.prepare(
    `SELECT 1 FROM task_claims WHERE task_id = ? AND youtube_channel_id = ? AND id != ?`
  ).bind(claim.task_id, earnerChannelId, claimId).first()
  if (dupCheck) {
    return c.json({ error: 'DUPLICATE_CHANNEL', message: 'This channel has already completed this task' }, 409)
  }

  const now = Math.floor(Date.now() / 1000)
  const found = await verifyCommentByAuthor(claim.video_id, earnerChannelId, c.env.YOUTUBE_API_KEY)

  if (found) {
    // Comment confirmed — VERIFIED + credit immediately
    await c.env.DB.prepare(`
      UPDATE task_claims
      SET status = 'VERIFIED', verified_at = ?, youtube_channel_id = ?
      WHERE id = ?
    `).bind(now, earnerChannelId, claimId).run()

    await creditCoinPending(c.env.DB, claimId, userId, claim.coin_per_unit)

    const ipHash = c.get('ipHash') ?? 'unknown'
    const today = new Date().toISOString().slice(0, 10)
    await c.env.DB.prepare(
      `INSERT OR IGNORE INTO ip_task_log (ip_hash, channel_id, date_str) VALUES (?,?,?)`
    ).bind(ipHash, claim.target_channel_id, today).run()

    await c.env.DB.prepare(
      `INSERT OR IGNORE INTO user_completed_channels (user_id, channel_id) VALUES (?,?)`
    ).bind(userId, claim.target_channel_id).run()

    await c.env.DB.prepare(`
      UPDATE tasks SET delivered_count = delivered_count + 1,
        status = CASE WHEN delivered_count + 1 >= target_count THEN 'COMPLETED' ELSE status END
      WHERE id = ?
    `).bind(claim.task_id).run()

    return c.json({ ok: true, coins_earned: claim.coin_per_unit })
  }

  // Not found yet — mark SUBMITTED (coin_status='NONE'), cron will re-check
  // FIX2: Do NOT use coin_status='PENDING_COMMENT' — not in CHECK constraint
  // SUBMITTED + action_type='COMMENT' uniquely identifies pending comment claims for cron
  await c.env.DB.prepare(`
    UPDATE task_claims
    SET status = 'SUBMITTED', submitted_at = ?, youtube_channel_id = ?
    WHERE id = ?
  `).bind(now, earnerChannelId, claimId).run()

  return c.json({ ok: true, pending: true, message: 'Comment not yet indexed. Will be verified automatically.' })
})
