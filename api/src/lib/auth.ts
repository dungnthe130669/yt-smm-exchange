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

    database: {
      type: 'sqlite',
      db: wrapD1ForBetterAuth(env.DB),
    },

    socialProviders: {
      google: {
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
        scope: ['openid', 'email', 'profile'],
      },
    },

    trustedOrigins: [env.APP_URL],
  })
}

// Wrap D1Database to the interface Better Auth's sqlite adapter expects
function wrapD1ForBetterAuth(db: D1Database) {
  return {
    prepare(sql: string) {
      return {
        async all(...params: unknown[]) {
          const flat = params.flat()
          const stmt = flat.length ? db.prepare(sql).bind(...flat) : db.prepare(sql)
          const result = await stmt.all()
          return result.results
        },
        async run(...params: unknown[]) {
          const flat = params.flat()
          const stmt = flat.length ? db.prepare(sql).bind(...flat) : db.prepare(sql)
          return stmt.run()
        },
        async get(...params: unknown[]) {
          const flat = params.flat()
          const stmt = flat.length ? db.prepare(sql).bind(...flat) : db.prepare(sql)
          return stmt.first()
        },
      }
    },
  }
}
