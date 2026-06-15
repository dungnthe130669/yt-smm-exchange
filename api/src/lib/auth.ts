import { betterAuth } from 'better-auth'
import type { Env } from '../bindings'

// Better Auth instance factory — one per request (Workers stateless)
// Docs: https://www.better-auth.com/docs/integrations/hono
// Better Auth uses its own tables: user, session, account, verification
// Migration 0002 creates these tables aligned with BA's schema

export function createAuth(env: Env) {
  return betterAuth({
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.APP_URL,

    database: env.DB,

    socialProviders: {
      google: {
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
        scope: ['openid', 'email', 'profile'],
      },
    },

    trustedOrigins: [
      env.APP_URL,
      'https://yt-smm-exchange-api.linkdev.workers.dev',
    ],
  })
}

// D1 wrapper no longer needed — BA v1.6 accepts D1Database directly
