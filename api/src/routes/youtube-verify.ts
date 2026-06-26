import { Hono } from 'hono'
import type { Env } from '../bindings'
import type { HonoVariables } from '../types'
import { requireAuth } from '../middleware/auth'
import { verifySubscription, refreshAccessToken, subscribeToChannel, likeVideo, verifyLike, postComment, verifyComment } from '../lib/youtube'
import { creditCoinPending } from '../lib/xu'

export const youtubeVerifyRoutes = new Hono<{ Bindings: Env; Variables: HonoVariables }>()

// POST /api/youtube-verify/:claimId
// Server-side verify using stored refresh token — no OAuth redirect needed
youtubeVerifyRoutes.post('/:claimId', async (c) => {
  const guard = requireAuth(c)
  if (guard) return guard

  const userId = c.get('userId')!
  const claimId = c.req.param('claimId')

  // 1. Load user's linked YouTube channel + refresh token
  const { channel_id } = await c.req.json<{ channel_id?: string }>().catch(() => ({ channel_id: undefined }))

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

  // 2. Load claim — must be SUBMITTED and owned by user
  const claim = await c.env.DB.prepare(`
    SELECT tc.id, tc.task_id, tc.claimer_id, tc.youtube_channel_id, tc.verify_attempts,
           t.channel_id, t.coin_per_unit, t.id as task_id
    FROM task_claims tc
    JOIN tasks t ON t.id = tc.task_id
    WHERE tc.id = ? AND tc.claimer_id = ? AND tc.status = 'SUBMITTED'
  `).bind(claimId, userId).first<{
    id: string; task_id: string; claimer_id: string
    channel_id: string; coin_per_unit: number
    youtube_channel_id: string | null; verify_attempts: number
  }>()

  if (!claim) return c.json({ error: 'CLAIM_NOT_FOUND', message: 'Claim not found or not submitted' }, 404)

  // 3. Duplicate channel check — same earner channel can't do same task twice
  const dupCheck = await c.env.DB.prepare(
    `SELECT 1 FROM task_claims WHERE task_id = ? AND youtube_channel_id = ? AND id != ?`
  ).bind(claim.task_id, earnerChannelId, claimId).first()
  if (dupCheck) {
    return c.json({ error: 'DUPLICATE_CHANNEL', message: 'This channel has already completed this task' }, 409)
  }

  // 4. Get fresh access token from stored refresh token
  let accessToken: string
  try {
    accessToken = await refreshAccessToken(c.env.GOOGLE_CLIENT_ID, c.env.GOOGLE_CLIENT_SECRET, refreshToken)
  } catch (e) {
    console.error('[yt-verify] refresh token failed', e)
    return c.json({ error: 'TOKEN_REFRESH_FAILED', message: 'YouTube token expired. Please re-link your channel.' }, 401)
  }

  // 5. Verify subscription
  let isSubbed: boolean
  try {
    isSubbed = await verifySubscription(accessToken, claim.channel_id)
  } catch (e) {
    console.error('[yt-verify] verify subscription error', e)
    return c.json({ error: 'VERIFY_ERROR', message: 'Error checking subscription' }, 500)
  }

  if (!isSubbed) {
    // Increment attempts
    await c.env.DB.prepare(
      `UPDATE task_claims SET verify_attempts = verify_attempts + 1 WHERE id = ?`
    ).bind(claimId).run()

    const attempts = claim.verify_attempts + 1
    if (attempts >= 2) {
      await c.env.DB.prepare(
        `UPDATE task_claims SET status = 'REJECTED' WHERE id = ?`
      ).bind(claimId).run()
      return c.json({ error: 'NOT_SUBSCRIBED', message: 'Subscription not found. Claim rejected.', rejected: true }, 400)
    }
    return c.json({ error: 'NOT_SUBSCRIBED', message: 'Subscription not found. Please subscribe and try again.', attempts }, 400)
  }

  // 6. Verify passed
  const now = Math.floor(Date.now() / 1000)
  await c.env.DB.prepare(`
    UPDATE task_claims
    SET status = 'VERIFIED', verified_at = ?, youtube_channel_id = ?
    WHERE id = ?
  `).bind(now, earnerChannelId, claimId).run()

  // Credit coin pending
  await creditCoinPending(c.env.DB, claimId, userId, claim.coin_per_unit)

  // Log IP
  const ipHash = c.get('ipHash') ?? 'unknown'
  const today = new Date().toISOString().slice(0, 10)
  await c.env.DB.prepare(
    `INSERT OR IGNORE INTO ip_task_log (ip_hash, channel_id, date_str) VALUES (?,?,?)`
  ).bind(ipHash, claim.channel_id, today).run()

  // Mark channel completed (hide from feed)
  await c.env.DB.prepare(
    `INSERT OR IGNORE INTO user_completed_channels (user_id, channel_id) VALUES (?,?)`
  ).bind(userId, claim.channel_id).run()

  // Increment task delivered_count
  await c.env.DB.prepare(`
    UPDATE tasks SET delivered_count = delivered_count + 1,
      status = CASE WHEN delivered_count + 1 >= target_count THEN 'COMPLETED' ELSE status END
    WHERE id = ?
  `).bind(claim.task_id).run()

  return c.json({ ok: true, coins_earned: claim.coin_per_unit })
})

// POST /api/youtube-verify/:claimId/subscribe-and-verify
// Platform subscribes on behalf of user using stored refresh token, then verifies
youtubeVerifyRoutes.post('/:claimId/subscribe-and-verify', async (c) => {
  const guard = requireAuth(c)
  if (guard) return guard

  const userId = c.get('userId')!
  const claimId = c.req.param('claimId')
  const { channel_id } = await c.req.json<{ channel_id?: string }>().catch(() => ({ channel_id: undefined }))

  // 1. Get linked channel + refresh token
  const channelRow = await c.env.DB.prepare(
    channel_id
      ? `SELECT channel_id, refresh_token FROM user_linked_channels WHERE user_id = ? AND channel_id = ?`
      : `SELECT channel_id, refresh_token FROM user_linked_channels WHERE user_id = ? LIMIT 1`
  ).bind(...(channel_id ? [userId, channel_id] : [userId])).first<{ channel_id: string; refresh_token: string }>()

  if (!channelRow?.refresh_token) {
    return c.json({ error: 'NO_YT_CHANNEL', message: 'No linked YouTube channel found' }, 400)
  }

  // 2. Load claim (must be CLAIMED or SUBMITTED)
  const claim = await c.env.DB.prepare(`
    SELECT tc.id, tc.task_id, tc.claimer_id, tc.youtube_channel_id, tc.verify_attempts, tc.status,
           t.channel_id as target_channel_id, t.coin_per_unit, t.id as task_id
    FROM task_claims tc
    JOIN tasks t ON t.id = tc.task_id
    WHERE tc.id = ? AND tc.claimer_id = ? AND tc.status IN ('CLAIMED','SUBMITTED')
  `).bind(claimId, userId).first<{
    id: string; task_id: string; claimer_id: string
    target_channel_id: string; coin_per_unit: number
    youtube_channel_id: string | null; verify_attempts: number; status: string
  }>()

  if (!claim) return c.json({ error: 'CLAIM_NOT_FOUND', message: 'Claim not found or already completed' }, 404)

  // 3. Duplicate channel check
  const earnerChannelId = channelRow.channel_id
  const dupCheck = await c.env.DB.prepare(
    `SELECT 1 FROM task_claims WHERE task_id = ? AND youtube_channel_id = ? AND id != ?`
  ).bind(claim.task_id, earnerChannelId, claimId).first()
  if (dupCheck) {
    return c.json({ error: 'DUPLICATE_CHANNEL', message: 'This channel has already completed this task' }, 409)
  }

  // 4. Refresh access token
  let accessToken: string
  try {
    accessToken = await refreshAccessToken(c.env.GOOGLE_CLIENT_ID, c.env.GOOGLE_CLIENT_SECRET, channelRow.refresh_token)
  } catch {
    return c.json({ error: 'TOKEN_REFRESH_FAILED', message: 'YouTube token expired. Please re-link your channel.' }, 401)
  }

  // 5. Subscribe (platform performs action on behalf of user)
  const subResult = await subscribeToChannel(accessToken, claim.target_channel_id)
  if (!subResult.ok) {
    return c.json({ error: 'SUBSCRIBE_FAILED', message: `Failed to subscribe: ${subResult.error}` }, 400)
  }

  // 6. Verify subscription (confirm it went through)
  const isSubbed = await verifySubscription(accessToken, claim.target_channel_id)
  if (!isSubbed) {
    return c.json({ error: 'VERIFY_FAILED', message: 'Subscribe appeared to succeed but subscription not confirmed. Try again.' }, 400)
  }

  // 7. Mark claim VERIFIED
  const now = Math.floor(Date.now() / 1000)

  // First ensure SUBMITTED state
  if (claim.status === 'CLAIMED') {
    await c.env.DB.prepare(`UPDATE task_claims SET status = 'SUBMITTED', submitted_at = ? WHERE id = ?`).bind(now, claimId).run()
  }

  await c.env.DB.prepare(`
    UPDATE task_claims SET status = 'VERIFIED', verified_at = ?, youtube_channel_id = ? WHERE id = ?
  `).bind(now, earnerChannelId, claimId).run()

  await creditCoinPending(c.env.DB, claimId, userId, claim.coin_per_unit)

  const ipHash = c.get('ipHash') ?? 'unknown'
  const today = new Date().toISOString().slice(0, 10)
  await c.env.DB.prepare(`INSERT OR IGNORE INTO ip_task_log (ip_hash, channel_id, date_str) VALUES (?,?,?)`).bind(ipHash, claim.target_channel_id, today).run()
  await c.env.DB.prepare(`INSERT OR IGNORE INTO user_completed_channels (user_id, channel_id) VALUES (?,?)`).bind(userId, claim.target_channel_id).run()
  await c.env.DB.prepare(`
    UPDATE tasks SET delivered_count = delivered_count + 1,
      status = CASE WHEN delivered_count + 1 >= target_count THEN 'COMPLETED' ELSE status END
    WHERE id = ?
  `).bind(claim.task_id).run()

  return c.json({ ok: true, coins_earned: claim.coin_per_unit })
})

// POST /api/youtube-verify/:claimId/perform
// Unified perform endpoint for SUBSCRIBE, LIKE, COMMENT actions
youtubeVerifyRoutes.post('/:claimId/perform', async (c) => {
  const guard = requireAuth(c)
  if (guard) return guard

  const userId = c.get('userId')!
  const claimId = c.req.param('claimId')
  const body = await c.req.json<{ channel_id?: string }>().catch(() => ({} as { channel_id?: string }))

  // 1. Get linked channel + refresh token
  const channelRow = await c.env.DB.prepare(
    body.channel_id
      ? `SELECT channel_id, refresh_token FROM user_linked_channels WHERE user_id = ? AND channel_id = ?`
      : `SELECT channel_id, refresh_token FROM user_linked_channels WHERE user_id = ? LIMIT 1`
  ).bind(...(body.channel_id ? [userId, body.channel_id] : [userId])).first<{ channel_id: string; refresh_token: string }>()

  if (!channelRow?.refresh_token) {
    return c.json({ error: 'NO_YT_CHANNEL', message: 'No linked YouTube channel found' }, 400)
  }

  // 2. Load claim + task (must be CLAIMED or SUBMITTED)
  const claim = await c.env.DB.prepare(`
    SELECT tc.id, tc.task_id, tc.claimer_id, tc.youtube_channel_id, tc.verify_attempts, tc.status,
           t.channel_id as target_channel_id, t.video_id, t.comment_template,
           t.coin_per_unit, t.id as task_id, t.action_type
    FROM task_claims tc
    JOIN tasks t ON t.id = tc.task_id
    WHERE tc.id = ? AND tc.claimer_id = ? AND tc.status IN ('CLAIMED','SUBMITTED')
  `).bind(claimId, userId).first<{
    id: string; task_id: string; claimer_id: string
    target_channel_id: string; video_id: string | null; comment_template: string | null
    coin_per_unit: number; youtube_channel_id: string | null; verify_attempts: number
    status: string; action_type: string
  }>()

  if (!claim) return c.json({ error: 'CLAIM_NOT_FOUND', message: 'Claim not found or already completed' }, 404)

  const earnerChannelId = channelRow.channel_id

  // 3. Duplicate check
  const dupCheck = await c.env.DB.prepare(
    `SELECT 1 FROM task_claims WHERE task_id = ? AND youtube_channel_id = ? AND id != ?`
  ).bind(claim.task_id, earnerChannelId, claimId).first()
  if (dupCheck) {
    return c.json({ error: 'DUPLICATE_CHANNEL', message: 'You have already completed this task with this channel' }, 409)
  }

  // 4. Refresh access token
  let accessToken: string
  try {
    accessToken = await refreshAccessToken(c.env.GOOGLE_CLIENT_ID, c.env.GOOGLE_CLIENT_SECRET, channelRow.refresh_token)
  } catch {
    return c.json({ error: 'TOKEN_REFRESH_FAILED', message: 'YouTube token expired. Please re-link your channel.' }, 401)
  }

  // 5. Perform + verify action
  const actionType = claim.action_type ?? 'SUBSCRIBE'
  const now = Math.floor(Date.now() / 1000)

  if (actionType === 'SUBSCRIBE') {
    // Cannot subscribe to own channel
    if (earnerChannelId === claim.target_channel_id) {
      return c.json({ error: 'OWN_CHANNEL', message: 'Cannot subscribe to your own channel' }, 400)
    }
    const subResult = await subscribeToChannel(accessToken, claim.target_channel_id)
    if (!subResult.ok) {
      return c.json({ error: 'ACTION_FAILED', message: `Subscribe failed: ${subResult.error}` }, 400)
    }
    const verified = await verifySubscription(accessToken, claim.target_channel_id)
    if (!verified) {
      return c.json({ error: 'VERIFY_FAILED', message: 'Subscription could not be confirmed. Try again.' }, 400)
    }
    if (claim.status === 'CLAIMED') {
      await c.env.DB.prepare(`UPDATE task_claims SET status = 'SUBMITTED', submitted_at = ? WHERE id = ?`).bind(now, claimId).run()
    }
    await c.env.DB.prepare(`UPDATE task_claims SET status = 'VERIFIED', verified_at = ?, youtube_channel_id = ? WHERE id = ?`).bind(now, earnerChannelId, claimId).run()
    await c.env.DB.prepare(`INSERT OR IGNORE INTO user_completed_channels (user_id, channel_id) VALUES (?,?)`).bind(userId, claim.target_channel_id).run()

  } else if (actionType === 'LIKE') {
    const videoId = claim.video_id!
    const likeResult = await likeVideo(accessToken, videoId)
    if (!likeResult.ok) {
      return c.json({ error: 'ACTION_FAILED', message: `Like failed: ${likeResult.error}` }, 400)
    }
    const verified = await verifyLike(accessToken, videoId)
    if (!verified) {
      return c.json({ error: 'VERIFY_FAILED', message: 'Like could not be confirmed. Try again.' }, 400)
    }
    if (claim.status === 'CLAIMED') {
      await c.env.DB.prepare(`UPDATE task_claims SET status = 'SUBMITTED', submitted_at = ? WHERE id = ?`).bind(now, claimId).run()
    }
    await c.env.DB.prepare(`UPDATE task_claims SET status = 'VERIFIED', verified_at = ?, youtube_channel_id = ? WHERE id = ?`).bind(now, earnerChannelId, claimId).run()
    await c.env.DB.prepare(`INSERT OR IGNORE INTO task_claim_results (claim_id, rating) VALUES (?,?)`).bind(claimId, 'like').run()

  } else if (actionType === 'COMMENT') {
    const videoId = claim.video_id!
    const commentText = claim.comment_template ?? 'Great video!'
    const commentResult = await postComment(accessToken, videoId, commentText)
    if (!commentResult.ok) {
      return c.json({ error: 'ACTION_FAILED', message: `Comment failed: ${commentResult.error}` }, 400)
    }
    const verified = commentResult.comment_id
      ? await verifyComment(accessToken, commentResult.comment_id)
      : false
    if (!verified) {
      return c.json({ error: 'VERIFY_FAILED', message: 'Comment could not be confirmed. Try again.' }, 400)
    }
    if (claim.status === 'CLAIMED') {
      await c.env.DB.prepare(`UPDATE task_claims SET status = 'SUBMITTED', submitted_at = ? WHERE id = ?`).bind(now, claimId).run()
    }
    await c.env.DB.prepare(`UPDATE task_claims SET status = 'VERIFIED', verified_at = ?, youtube_channel_id = ? WHERE id = ?`).bind(now, earnerChannelId, claimId).run()
    await c.env.DB.prepare(`INSERT OR IGNORE INTO task_claim_results (claim_id, comment_id) VALUES (?,?)`).bind(claimId, commentResult.comment_id ?? '').run()
  }

  // 6. Credit coins + common bookkeeping
  await creditCoinPending(c.env.DB, claimId, userId, claim.coin_per_unit)
  const ipHash = c.get('ipHash') ?? 'unknown'
  const today = new Date().toISOString().slice(0, 10)
  await c.env.DB.prepare(`INSERT OR IGNORE INTO ip_task_log (ip_hash, channel_id, date_str) VALUES (?,?,?)`).bind(ipHash, claim.target_channel_id, today).run()
  await c.env.DB.prepare(`UPDATE tasks SET delivered_count = delivered_count + 1, status = CASE WHEN delivered_count + 1 >= target_count THEN 'COMPLETED' ELSE status END WHERE id = ?`).bind(claim.task_id).run()

  return c.json({ ok: true, coins_earned: claim.coin_per_unit, action_type: actionType })
})
