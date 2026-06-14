import { Hono } from 'hono'
import type { Env } from '../bindings'
import type { HonoVariables } from '../types'

// Better Auth handles /api/auth/** internally
// This stub delegates to Better Auth's Hono integration
// Full config: src/lib/auth.ts

export const authRoutes = new Hono<{ Bindings: Env; Variables: HonoVariables }>()

// Placeholder — Better Auth handler mounted here after lib/auth.ts is set up
authRoutes.all('/*', async (c) => {
  return c.json({ error: 'AUTH_NOT_CONFIGURED', message: 'Auth chưa setup' }, 503)
})
