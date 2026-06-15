import { Hono } from 'hono'
import type { Env } from '../bindings'
import type { HonoVariables } from '../types'
import { createAuth } from '../lib/auth'

export const authRoutes = new Hono<{ Bindings: Env; Variables: HonoVariables }>()

// Better Auth handles all /api/auth/** routes
// Includes: /sign-in/social, /callback/google, /sign-out, /get-session
authRoutes.all('/*', async (c) => {
  const auth = createAuth(c.env)

  // After Google OAuth signup: ensure wallet exists
  let res: Response
  try {
    res = await auth.handler(c.req.raw)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return c.json({ error: 'AUTH_ERROR', message: msg }, 500)
  }

  // Debug: surface BA error body in dev
  if (res.status >= 500) {
    const clone = res.clone()
    const text = await clone.text().catch(() => '(unreadable)')
    console.error('[auth] BA error', res.status, text)
    return c.json({ error: 'AUTH_ERROR', message: text || 'Better Auth 500', status: res.status }, 500)
  }

  // Post-signin hook: create wallet if new user
  // Better Auth doesn't expose a reliable "new user" event in D1 adapter
  // So we upsert wallet on every sign-in (idempotent)
  if (c.req.path.includes('/callback/')) {
    try {
      const session = await auth.api.getSession({ headers: c.req.raw.headers })
      if (session?.user?.id) {
        await c.env.DB.prepare(`
          INSERT OR IGNORE INTO wallets (user_id) VALUES (?)
        `).bind(session.user.id).run()
      }
    } catch { /* non-blocking */ }
  }

  return res
})
