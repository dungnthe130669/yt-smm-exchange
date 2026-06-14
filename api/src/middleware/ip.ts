import type { Context, Next } from 'hono'
import type { Env } from '../bindings'
import type { HonoVariables } from '../types'

// Inject hashed IP into context for rate limiting
// Uses CF-Connecting-IP (real IP behind CF proxy)
export async function ipMiddleware(
  c: Context<{ Bindings: Env; Variables: HonoVariables }>,
  next: Next
) {
  const ip = c.req.header('CF-Connecting-IP') ?? c.req.header('X-Forwarded-For') ?? '0.0.0.0'
  const hash = await hashIp(ip)
  c.set('ipHash', hash)
  await next()
}

async function hashIp(ip: string): Promise<string> {
  const data = new TextEncoder().encode(ip + ':smm-exchange-salt')
  const buf = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 16) // 16 hex chars = 64-bit fingerprint (enough, not overkill)
}
