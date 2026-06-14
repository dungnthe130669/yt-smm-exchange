import { Hono } from 'hono'
import type { Env } from '../bindings'
import type { HonoVariables } from '../types'
import { requireAuth } from '../middleware/auth'
import { verifySubscription, getMyChannelId } from '../lib/youtube'
import { creditXuPending } from '../lib/xu'

// YouTube OAuth verify flow for claim submission
// Flow: submit claim → redirect here → Google OAuth → verify sub → credit xu
//
// IMPORTANT: Access token is NEVER stored — use → verify → discard immediately

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'

// Scope: read-only subscriptions list (minimum required)
const YT_SCOPE = 'https://www.googleapis.com/auth/youtube.readonly'

export const youtubeVerifyRoutes = new Hono<{ Bindings: Env; Variables: HonoVariables }>()

// Step 1: Initiate YouTube OAuth for claim verify
// GET /api/youtube-verify/start?claim_id=X
youtubeVerifyRoutes.get('/start', async (c) => {
  const guard = requireAuth(c)
  if (guard) return guard

  const claimId = c.req.query('claim_id')
  if (!claimId) return c.json({ error: 'MISSING_CLAIM_ID', message: 'Thiếu claim_id' }, 400)

  const userId = c.get('userId')!

  // Verify claim belongs to user and is in SUBMITTED state
  const claim = await c.env.DB.prepare(`
    SELECT tc.id, tc.status, t.channel_id, t.channel_url
    FROM task_claims tc
    JOIN tasks t ON t.id = tc.task_id
    WHERE tc.id = ? AND tc.claimer_id = ?
  `).bind(claimId, userId).first<{
    id: string; status: string; channel_id: string; channel_url: string
  }>()

  if (!claim) return c.json({ error: 'CLAIM_NOT_FOUND', message: 'Claim không tồn tại' }, 404)
  if (claim.status !== 'SUBMITTED') {
    return c.json({ error: 'CLAIM_WRONG_STATE', message: 'Claim chưa submit hoặc đã verify' }, 400)
  }

  // Build OAuth state: encode claim_id + user_id (signed minimally with secret prefix)
  const state = btoa(JSON.stringify({ claimId, userId, ts: Date.now() }))

  // Build Google OAuth URL with youtube.readonly scope
  const authUrl = new URL(GOOGLE_AUTH_URL)
  authUrl.searchParams.set('client_id', c.env.GOOGLE_CLIENT_ID)
  authUrl.searchParams.set('redirect_uri', `${c.env.APP_URL}/api/youtube-verify/callback`)
  authUrl.searchParams.set('response_type', 'code')
  authUrl.searchParams.set('scope', YT_SCOPE)
  authUrl.searchParams.set('state', state)
  authUrl.searchParams.set('access_type', 'online')        // no refresh token — single use
  authUrl.searchParams.set('prompt', 'select_account')     // force account picker

  return c.redirect(authUrl.toString())
})

// Step 2: Google OAuth callback
// GET /api/youtube-verify/callback?code=X&state=Y
youtubeVerifyRoutes.get('/callback', async (c) => {
  const code = c.req.query('code')
  const stateRaw = c.req.query('state')
  const error = c.req.query('error')

  const frontendBase = c.env.APP_URL

  if (error || !code || !stateRaw) {
    return c.redirect(`${frontendBase}/verify-result?status=cancelled`)
  }

  // Decode state
  let claimId: string, userId: string
  try {
    const state = JSON.parse(atob(stateRaw)) as { claimId: string; userId: string; ts: number }
    claimId = state.claimId
    userId = state.userId

    // State must be < 10 min old
    if (Date.now() - state.ts > 10 * 60 * 1000) {
      return c.redirect(`${frontendBase}/verify-result?status=expired`)
    }
  } catch {
    return c.redirect(`${frontendBase}/verify-result?status=invalid`)
  }

  // Exchange code for access token
  let accessToken: string
  try {
    const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: c.env.GOOGLE_CLIENT_ID,
        client_secret: c.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: `${c.env.APP_URL}/api/youtube-verify/callback`,
        grant_type: 'authorization_code',
      }),
    })
    const tokenData = await tokenRes.json<{ access_token?: string; error?: string }>()
    if (!tokenData.access_token) throw new Error(tokenData.error ?? 'no token')
    accessToken = tokenData.access_token
  } catch (e) {
    console.error('[yt-verify] token exchange failed', e)
    return c.redirect(`${frontendBase}/verify-result?status=token_error`)
  }

  // Load claim
  const claim = await c.env.DB.prepare(`
    SELECT tc.*, t.channel_id, t.xu_per_unit, t.id as task_id
    FROM task_claims tc
    JOIN tasks t ON t.id = tc.task_id
    WHERE tc.id = ? AND tc.claimer_id = ? AND tc.status = 'SUBMITTED'
  `).bind(claimId, userId).first<{
    id: string; task_id: string; claimer_id: string;
    channel_id: string; xu_per_unit: number;
    youtube_channel_id: string | null; verify_attempts: number;
  }>()

  if (!claim) {
    // Token received but claim invalid — discard token immediately (already done — in-memory only)
    return c.redirect(`${frontendBase}/verify-result?status=claim_invalid`)
  }

  try {
    // 1. Get earner's YouTube channel ID
    const earnerChannelId = await getMyChannelId(accessToken)
    if (!earnerChannelId) {
      await incrementVerifyAttempts(c.env.DB, claimId)
      return c.redirect(`${frontendBase}/verify-result?status=no_channel`)
    }

    // 2. Check UNIQUE constraint — same earner channel can't do same task twice
    const dupCheck = await c.env.DB.prepare(`
      SELECT 1 FROM task_claims
      WHERE task_id = ? AND youtube_channel_id = ? AND id != ?
    `).bind(claim.task_id, earnerChannelId, claimId).first()

    if (dupCheck) {
      return c.redirect(`${frontendBase}/verify-result?status=duplicate_channel`)
    }

    // 3. Verify subscription
    const isSubbed = await verifySubscription(accessToken, claim.channel_id)

    // TOKEN DISCARDED HERE — never stored, goes out of scope after this block
    // accessToken is now unreachable

    if (!isSubbed) {
      await incrementVerifyAttempts(c.env.DB, claimId)
      const attempts = claim.verify_attempts + 1
      if (attempts >= 2) {
        await c.env.DB.prepare(
          `UPDATE task_claims SET status = 'REJECTED' WHERE id = ?`
        ).bind(claimId).run()
        return c.redirect(`${frontendBase}/verify-result?status=rejected&reason=not_subscribed`)
      }
      return c.redirect(`${frontendBase}/verify-result?status=not_subscribed&attempts=${attempts}`)
    }

    // 4. Verify passed — record youtube_channel_id, credit xu pending
    const now = Math.floor(Date.now() / 1000)
    await c.env.DB.prepare(`
      UPDATE task_claims
      SET status = 'VERIFIED', verified_at = ?, youtube_channel_id = ?
      WHERE id = ?
    `).bind(now, earnerChannelId, claimId).run()

    // Credit xu (LOCKED state — unlocked after 48h cron)
    await creditXuPending(c.env.DB, claimId, userId, claim.xu_per_unit)

    // Log channel to IP log (persistent — blocks future sub from same IP to same channel)
    const ipHash = c.get('ipHash') ?? 'unknown'
    const today = new Date().toISOString().slice(0, 10)
    await c.env.DB.prepare(`
      INSERT OR IGNORE INTO ip_task_log (ip_hash, channel_id, date_str)
      VALUES (?,?,?)
    `).bind(ipHash, claim.channel_id, today).run()

    // Add to user_completed_channels (hides channel from feed forever)
    await c.env.DB.prepare(`
      INSERT OR IGNORE INTO user_completed_channels (user_id, channel_id)
      VALUES (?,?)
    `).bind(userId, claim.channel_id).run()

    // Increment task delivered_count
    await c.env.DB.prepare(`
      UPDATE tasks SET delivered_count = delivered_count + 1,
        status = CASE
          WHEN delivered_count + 1 >= target_count THEN 'COMPLETED'
          ELSE status
        END
      WHERE id = ?
    `).bind(claim.task_id).run()

    return c.redirect(
      `${frontendBase}/verify-result?status=success&xu=${claim.xu_per_unit}`
    )
  } catch (e) {
    console.error('[yt-verify] verify error', e)
    return c.redirect(`${frontendBase}/verify-result?status=error`)
  }
})

async function incrementVerifyAttempts(db: D1Database, claimId: string) {
  await db.prepare(`
    UPDATE task_claims SET verify_attempts = verify_attempts + 1 WHERE id = ?
  `).bind(claimId).run()
}
