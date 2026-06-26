import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import type { Env } from './bindings'
import type { HonoVariables } from './types'
import { ipMiddleware } from './middleware/ip'
import { authMiddleware } from './middleware/auth'
import { authRoutes } from './routes/auth'
import { taskRoutes } from './routes/tasks'
import { claimRoutes } from './routes/claims'
import { walletRoutes } from './routes/wallet'
import { cronHandler } from './routes/cron'
import { youtubeVerifyRoutes } from './routes/youtube-verify'
import { youtubeLinkRoutes } from './routes/youtube-link'
import { adminRoutes } from './routes/admin'

const app = new Hono<{ Bindings: Env; Variables: HonoVariables }>()

// ─── Global Middleware ────────────────────────────────────────────────────────

app.use('*', logger())

app.use('*', async (c, next) => {
  const origin = c.env.APP_URL
  return cors({
    origin,
    allowHeaders: ['Content-Type', 'Authorization'],
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    credentials: true,
  })(c, next)
})

// Inject ipHash into context for all routes
app.use('*', ipMiddleware)

// Inject user session (optional — routes guard themselves)
app.use('/api/*', authMiddleware)

// ─── Routes ──────────────────────────────────────────────────────────────────

app.route('/api/auth', authRoutes)
app.route('/api/tasks', taskRoutes)
app.route('/api/claims', claimRoutes)
app.route('/api/wallet', walletRoutes)
app.route('/api/youtube-verify', youtubeVerifyRoutes)
app.route('/api/youtube-link', youtubeLinkRoutes)
app.route('/api/admin', adminRoutes)

// GET /api/me — current user with role from DB (BA get-session doesn't include custom columns)
app.get('/api/me', async (c) => {
  const user = c.get('user')
  if (!user) return c.json({ user: null })
  return c.json({ user })
})

// Cron trigger handler (CF Cron: every 6h)
app.post('/__cron/xu-unlock', cronHandler)

// Health check
app.get('/api/health', (c) => c.json({ ok: true, ts: Date.now() }))

// TEMP DEBUG: test refresh token for a channel — REMOVE BEFORE PROD LAUNCH
app.get('/api/debug/refresh-test', async (c) => {
  const channelId = c.req.query('channel_id')
  if (!channelId) return c.json({ error: 'channel_id required' }, 400)
  const row = await c.env.DB.prepare(
    `SELECT refresh_token FROM user_linked_channels WHERE channel_id = ? LIMIT 1`
  ).bind(channelId).first<{ refresh_token: string }>()
  if (!row) return c.json({ error: 'channel not found' }, 404)
  try {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: c.env.GOOGLE_CLIENT_ID,
        client_secret: c.env.GOOGLE_CLIENT_SECRET,
        refresh_token: row.refresh_token,
        grant_type: 'refresh_token',
      }),
    })
    const data = await res.json<Record<string, unknown>>()
    return c.json({
      status: res.status,
      has_access_token: 'access_token' in data,
      error: data.error ?? null,
      error_description: data.error_description ?? null,
      scope: data.scope ?? null,
    })
  } catch (e) {
    return c.json({ error: String(e) }, 500)
  }
})

// 404 fallback
app.notFound((c) => c.json({ error: 'NOT_FOUND', message: 'Route not found' }, 404))

// Error fallback
app.onError((err, c) => {
  console.error('[ERROR]', err.message, err.stack)
  return c.json({ error: 'INTERNAL_ERROR', message: err.message ?? 'Server error', stack: err.stack?.split('\n').slice(0,3) }, 500)
})

export default {
  fetch: app.fetch,

  // CF Cron Trigger
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(
      fetch('http://localhost/__cron/xu-unlock', {
        method: 'POST',
        headers: { 'X-Cron-Secret': env.BETTER_AUTH_SECRET },
      })
    )
  },
}
