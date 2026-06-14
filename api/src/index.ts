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

// Cron trigger handler (CF Cron: every 6h)
app.post('/__cron/xu-unlock', cronHandler)

// Health check
app.get('/health', (c) => c.json({ ok: true, ts: Date.now() }))

// 404 fallback
app.notFound((c) => c.json({ error: 'NOT_FOUND', message: 'Route không tồn tại' }, 404))

// Error fallback
app.onError((err, c) => {
  console.error('[ERROR]', err.message, err.stack)
  return c.json({ error: 'INTERNAL_ERROR', message: 'Lỗi server' }, 500)
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
