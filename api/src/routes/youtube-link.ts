import { Hono } from 'hono'
import type { Env } from '../bindings'
import type { HonoVariables } from '../types'
import { requireAuth } from '../middleware/auth'
import { getMyChannelId } from '../lib/youtube'

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const YT_SCOPE = [
  'https://www.googleapis.com/auth/youtube.readonly',
  'https://www.googleapis.com/auth/youtube.force-ssl',
].join(' ')

export const youtubeLinkRoutes = new Hono<{ Bindings: Env; Variables: HonoVariables }>()

// GET /api/youtube-link/status — get all linked channels + quota info
youtubeLinkRoutes.get('/status', async (c) => {
  const guard = requireAuth(c)
  if (guard) return guard
  const userId = c.get('userId')!

  const userRow = await c.env.DB.prepare(
    `SELECT u.group_id, COALESCE(g.max_channels, 10) as max_channels
     FROM "user" u LEFT JOIN user_groups g ON g.id = u.group_id WHERE u.id = ?`
  ).bind(userId).first<{ group_id: string | null; max_channels: number }>()

  const channels = await c.env.DB.prepare(
    `SELECT id, channel_id, channel_name, channel_avatar, channel_url, linked_at FROM user_linked_channels WHERE user_id = ? ORDER BY linked_at ASC`
  ).bind(userId).all()

  return c.json({
    channels: channels.results,
    max_channels: userRow?.max_channels ?? 10,
    can_link_more: channels.results.length < (userRow?.max_channels ?? 10),
  })
})

// GET /api/youtube-link/start — initiate OAuth to link channel
youtubeLinkRoutes.get('/start', async (c) => {
  const guard = requireAuth(c)
  if (guard) return guard
  const userId = c.get('userId')!

  // Check quota
  const userRow = await c.env.DB.prepare(
    `SELECT u.group_id, COALESCE(g.max_channels, 10) as max_channels
     FROM "user" u LEFT JOIN user_groups g ON g.id = u.group_id WHERE u.id = ?`
  ).bind(userId).first<{ max_channels: number }>()
  const count = await c.env.DB.prepare(
    `SELECT COUNT(*) as cnt FROM user_linked_channels WHERE user_id = ?`
  ).bind(userId).first<{ cnt: number }>()

  if ((count?.cnt ?? 0) >= (userRow?.max_channels ?? 10)) {
    return c.redirect(`${c.env.APP_URL}/profile?yt_link=quota_exceeded`)
  }

  const state = btoa(JSON.stringify({ userId, ts: Date.now() }))
  const authUrl = new URL(GOOGLE_AUTH_URL)
  authUrl.searchParams.set('client_id', c.env.GOOGLE_CLIENT_ID)
  authUrl.searchParams.set('redirect_uri', `${c.env.APP_URL}/api/youtube-link/callback`)
  authUrl.searchParams.set('response_type', 'code')
  authUrl.searchParams.set('scope', YT_SCOPE)
  authUrl.searchParams.set('state', state)
  authUrl.searchParams.set('access_type', 'offline')   // get refresh_token
  authUrl.searchParams.set('prompt', 'consent')         // force consent to always get refresh_token
  return c.redirect(authUrl.toString())
})

// GET /api/youtube-link/callback — handle OAuth callback, save channel + refresh token
youtubeLinkRoutes.get('/callback', async (c) => {
  const code = c.req.query('code')
  const stateRaw = c.req.query('state')
  const error = c.req.query('error')
  const frontendBase = c.env.APP_URL

  if (error || !code || !stateRaw) {
    return c.redirect(`${frontendBase}/profile?yt_link=cancelled`)
  }

  let userId: string
  try {
    const state = JSON.parse(atob(stateRaw)) as { userId: string; ts: number }
    if (Date.now() - state.ts > 10 * 60 * 1000) {
      return c.redirect(`${frontendBase}/profile?yt_link=expired`)
    }
    userId = state.userId
  } catch {
    return c.redirect(`${frontendBase}/profile?yt_link=invalid`)
  }

  // Exchange code for tokens
  let accessToken: string
  let refreshToken: string
  try {
    const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: c.env.GOOGLE_CLIENT_ID,
        client_secret: c.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: `${c.env.APP_URL}/api/youtube-link/callback`,
        grant_type: 'authorization_code',
      }),
    })
    const tokenData = await tokenRes.json<{ access_token?: string; refresh_token?: string; error?: string }>()
    if (!tokenData.access_token) throw new Error(tokenData.error ?? 'no token')
    accessToken = tokenData.access_token
    refreshToken = tokenData.refresh_token ?? ''
  } catch (e) {
    console.error('[yt-link] token exchange failed', e)
    return c.redirect(`${frontendBase}/profile?yt_link=token_error`)
  }

  // Get channel info
  let channelId: string | null = null
  let channelName: string | null = null
  let channelAvatar: string | null = null
  try {
    channelId = await getMyChannelId(accessToken)
    if (!channelId) throw new Error('no channel')

    const channelRes = await fetch(
      `https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )
    const channelData = await channelRes.json<{ items?: Array<{ id: string; snippet: { title: string; thumbnails: { default: { url: string } } } }> }>()
    const item = channelData.items?.[0]
    if (item) {
      channelName = item.snippet.title
      channelAvatar = item.snippet.thumbnails?.default?.url ?? null
    }
  } catch (e) {
    console.error('[yt-link] get channel failed', e)
    return c.redirect(`${frontendBase}/profile?yt_link=no_channel`)
  }

  // Check duplicate within this user
  const dupCheck = await c.env.DB.prepare(
    `SELECT 1 FROM user_linked_channels WHERE user_id = ? AND channel_id = ?`
  ).bind(userId, channelId).first()
  if (dupCheck) {
    return c.redirect(`${frontendBase}/profile?yt_link=already_linked`)
  }

  // Check cross-user duplicate (same channel linked to another user)
  const crossDup = await c.env.DB.prepare(
    `SELECT 1 FROM user_linked_channels WHERE channel_id = ? AND user_id != ?`
  ).bind(channelId, userId).first()
  if (crossDup) {
    return c.redirect(`${frontendBase}/profile?yt_link=channel_taken`)
  }

  // Re-check quota (race condition guard)
  const [userRow2, countRow] = await Promise.all([
    c.env.DB.prepare(`SELECT COALESCE(g.max_channels, 10) as max_channels FROM "user" u LEFT JOIN user_groups g ON g.id = u.group_id WHERE u.id = ?`).bind(userId).first<{ max_channels: number }>(),
    c.env.DB.prepare(`SELECT COUNT(*) as cnt FROM user_linked_channels WHERE user_id = ?`).bind(userId).first<{ cnt: number }>(),
  ])
  if ((countRow?.cnt ?? 0) >= (userRow2?.max_channels ?? 10)) {
    return c.redirect(`${frontendBase}/profile?yt_link=quota_exceeded`)
  }

  const now = Math.floor(Date.now() / 1000)
  await c.env.DB.prepare(`
    INSERT INTO user_linked_channels (id, user_id, channel_id, channel_name, channel_avatar, channel_url, refresh_token, linked_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    crypto.randomUUID(), userId, channelId, channelName, channelAvatar,
    `https://www.youtube.com/channel/${channelId}`, refreshToken, now
  ).run()

  return c.redirect(`${frontendBase}/profile?yt_link=success`)
})

// POST /api/youtube-link/unlink — remove specific YouTube channel link
youtubeLinkRoutes.post('/unlink', async (c) => {
  const guard = requireAuth(c)
  if (guard) return guard
  const userId = c.get('userId')!
  const { channel_id } = await c.req.json<{ channel_id: string }>()
  await c.env.DB.prepare(
    `DELETE FROM user_linked_channels WHERE user_id = ? AND channel_id = ?`
  ).bind(userId, channel_id).run()
  return c.json({ ok: true })
})
