import type { Context, Next } from 'hono'
import type { Env } from '../bindings'
import type { HonoVariables } from '../types'

// Injects authenticated user into context
// Does NOT block — routes guard themselves with requireAuth()
export async function authMiddleware(
  c: Context<{ Bindings: Env; Variables: HonoVariables }>,
  next: Next
) {
  c.set('user', null)
  c.set('userId', null)

  const sessionToken = getCookieToken(c) ?? getBearerToken(c)
  if (!sessionToken) return next()

  try {
    const row = await c.env.DB.prepare(
      `SELECT s.user_id, u.id, u.email, u.name, u.avatar, u.role, u.created_at
       FROM ba_sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token = ? AND s.expires_at > ?`
    )
      .bind(sessionToken, Math.floor(Date.now() / 1000))
      .first<{ user_id: string; id: string; email: string; name: string; avatar: string | null; role: string; created_at: number }>()

    if (row) {
      c.set('user', {
        id: row.id,
        email: row.email,
        name: row.name,
        avatar: row.avatar,
        role: row.role as 'user' | 'admin',
        created_at: row.created_at,
      })
      c.set('userId', row.id)
    }
  } catch (e) {
    console.error('[auth] session lookup error', e)
  }

  return next()
}

// Guard helper — call inside route handlers that require auth
export function requireAuth(c: Context<{ Bindings: Env; Variables: HonoVariables }>) {
  const user = c.get('user')
  if (!user) return c.json({ error: 'UNAUTHORIZED', message: 'Cần đăng nhập' }, 401)
  return null // null = ok, caller continues
}

function getCookieToken(c: Context): string | null {
  const cookie = c.req.header('Cookie') ?? ''
  const match = cookie.match(/better-auth\.session_token=([^;]+)/)
  return match?.[1] ?? null
}

function getBearerToken(c: Context): string | null {
  const auth = c.req.header('Authorization') ?? ''
  return auth.startsWith('Bearer ') ? auth.slice(7) : null
}
