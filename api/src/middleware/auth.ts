import type { Context, Next } from 'hono'
import type { Env } from '../bindings'
import type { HonoVariables } from '../types'
import { createAuth } from '../lib/auth'

// Injects authenticated user into context via Better Auth session API
// Does NOT block — routes guard themselves with requireAuth()
export async function authMiddleware(
  c: Context<{ Bindings: Env; Variables: HonoVariables }>,
  next: Next
) {
  c.set('user', null)
  c.set('userId', null)

  // Skip auth lookup for auth routes — BA handles its own sessions
  if (c.req.path.startsWith('/api/auth')) return next()

  try {
    const auth = createAuth(c.env)
    const session = await auth.api.getSession({ headers: c.req.raw.headers })

    if (session?.user) {
      const uid = session.user.id
      // Auto-create wallet if not exists (idempotent)
      await c.env.DB.prepare(`INSERT OR IGNORE INTO wallets (user_id) VALUES (?)`).bind(uid).run().catch(() => {})
      const userRow = await c.env.DB.prepare(
        `SELECT role FROM "user" WHERE id = ?`
      ).bind(uid).first<{ role: string }>()
      c.set('user', {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name,
        avatar: session.user.image ?? null,
        role: (userRow?.role ?? 'user') as 'user' | 'admin',
        created_at: session.user.createdAt ? new Date(session.user.createdAt).getTime() / 1000 : 0,
      })
      c.set('userId', session.user.id)
    }
  } catch (e) {
    console.error('[auth] session lookup error', e)
  }

  return next()
}

// Guard helper — call inside route handlers that require auth
export function requireAuth(c: Context<{ Bindings: Env; Variables: HonoVariables }>) {
  const user = c.get('user')
  if (!user) return c.json({ error: 'UNAUTHORIZED', message: 'Authentication required' }, 401)
  return null // null = ok, caller continues
}

export function requireAdmin(c: Context<{ Bindings: Env; Variables: HonoVariables }>) {
  const user = c.get('user')
  if (!user) return c.json({ error: 'UNAUTHORIZED', message: 'Authentication required' }, 401)
  if (user.role !== 'admin') return c.json({ error: 'FORBIDDEN', message: 'Admin only' }, 403)
  return null
}
