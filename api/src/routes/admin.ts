import { Hono } from 'hono'
import type { Env } from '../bindings'
import type { HonoVariables } from '../types'
import { requireAdmin } from '../middleware/auth'

export const adminRoutes = new Hono<{ Bindings: Env; Variables: HonoVariables }>()

// GET /api/admin/stats — dashboard overview
adminRoutes.get('/stats', async (c) => {
  const guard = requireAdmin(c)
  if (guard) return guard

  const [users, tasks, claims, wallets] = await Promise.all([
    c.env.DB.prepare(`SELECT COUNT(*) as cnt FROM "user"`).first<{ cnt: number }>(),
    c.env.DB.prepare(`SELECT COUNT(*) as cnt, status FROM tasks GROUP BY status`).all<{ cnt: number; status: string }>(),
    c.env.DB.prepare(`SELECT COUNT(*) as cnt, status FROM task_claims GROUP BY status`).all<{ cnt: number; status: string }>(),
    c.env.DB.prepare(`SELECT SUM(coin_balance) as total_coin, SUM(coin_pending) as total_coin_pending FROM wallets`).first<{ total_coin: number; total_coin_pending: number }>(),
  ])

  return c.json({
    users: users?.cnt ?? 0,
    tasks: tasks.results,
    claims: claims.results,
    wallets,
  })
})

// GET /api/admin/users?page=1&limit=20&q=email
adminRoutes.get('/users', async (c) => {
  const guard = requireAdmin(c)
  if (guard) return guard

  const page = parseInt(c.req.query('page') ?? '1')
  const limit = parseInt(c.req.query('limit') ?? '20')
  const q = c.req.query('q') ?? ''
  const offset = (page - 1) * limit

  const whereClause = q ? `WHERE u.email LIKE ? OR u.name LIKE ?` : ''
  const params = q ? [`%${q}%`, `%${q}%`, limit, offset] : [limit, offset]

  const [rows, total] = await Promise.all([
    c.env.DB.prepare(`
      SELECT u.id, u.name, u.email, u.role, u.group_id,
             COALESCE(g.name, 'Normal User') as group_name,
             COALESCE(g.max_channels, 10) as max_channels,
             u.createdAt as created_at,
             w.coin_balance, w.coin_pending, w.balance_usd_micro,
             (SELECT COUNT(*) FROM user_linked_channels ulc WHERE ulc.user_id = u.id) as linked_channels_count
      FROM "user" u
      LEFT JOIN wallets w ON w.user_id = u.id
      LEFT JOIN user_groups g ON g.id = u.group_id
      ${whereClause}
      ORDER BY u.createdAt DESC
      LIMIT ? OFFSET ?
    `).bind(...params).all(),
    c.env.DB.prepare(`SELECT COUNT(*) as cnt FROM "user" u ${whereClause}`)
      .bind(...(q ? [`%${q}%`, `%${q}%`] : [])).first<{ cnt: number }>(),
  ])

  return c.json({ users: rows.results, total: total?.cnt ?? 0, page, limit })
})

// PUT /api/admin/users/:id/role — set user role
adminRoutes.put('/users/:id/role', async (c) => {
  const guard = requireAdmin(c)
  if (guard) return guard

  const id = c.req.param('id')
  const { role } = await c.req.json<{ role: string }>()
  if (!['user', 'admin'].includes(role)) {
    return c.json({ error: 'INVALID_ROLE', message: 'Role must be user or admin' }, 400)
  }
  await c.env.DB.prepare(`UPDATE "user" SET role = ? WHERE id = ?`).bind(role, id).run()
  return c.json({ ok: true })
})

// GET /api/admin/tasks?page=1&status=OPEN
adminRoutes.get('/tasks', async (c) => {
  const guard = requireAdmin(c)
  if (guard) return guard

  const page = parseInt(c.req.query('page') ?? '1')
  const limit = 20
  const status = c.req.query('status') ?? ''
  const offset = (page - 1) * limit

  const whereClause = status ? `WHERE t.status = ?` : ''
  const params = status ? [status, limit, offset] : [limit, offset]

  const [rows, total] = await Promise.all([
    c.env.DB.prepare(`
      SELECT t.id, t.buyer_id, t.channel_name, t.channel_id, t.action_type,
             t.task_type, t.status, t.target_count, t.delivered_count,
             t.coin_per_unit, t.created_at, t.deadline,
             u.email as buyer_email
      FROM tasks t LEFT JOIN "user" u ON u.id = t.buyer_id
      ${whereClause}
      ORDER BY t.created_at DESC
      LIMIT ? OFFSET ?
    `).bind(...params).all(),
    c.env.DB.prepare(`SELECT COUNT(*) as cnt FROM tasks t ${whereClause}`)
      .bind(...(status ? [status] : [])).first<{ cnt: number }>(),
  ])

  return c.json({ tasks: rows.results, total: total?.cnt ?? 0, page, limit })
})

// PUT /api/admin/tasks/:id/status — force set task status
adminRoutes.put('/tasks/:id/status', async (c) => {
  const guard = requireAdmin(c)
  if (guard) return guard

  const id = c.req.param('id')
  const { status } = await c.req.json<{ status: string }>()
  const valid = ['OPEN', 'FILLING', 'COMPLETED', 'CANCELLED', 'EXPIRED']
  if (!valid.includes(status)) {
    return c.json({ error: 'INVALID_STATUS', message: 'Invalid task status' }, 400)
  }
  await c.env.DB.prepare(`UPDATE tasks SET status = ? WHERE id = ?`).bind(status, id).run()
  return c.json({ ok: true })
})

// GET /api/admin/claims?page=1&status=CLAIMED
adminRoutes.get('/claims', async (c) => {
  const guard = requireAdmin(c)
  if (guard) return guard

  const page = parseInt(c.req.query('page') ?? '1')
  const limit = 20
  const status = c.req.query('status') ?? ''
  const offset = (page - 1) * limit

  const whereClause = status ? `WHERE tc.status = ?` : ''
  const params = status ? [status, limit, offset] : [limit, offset]

  const [rows, total] = await Promise.all([
    c.env.DB.prepare(`
      SELECT tc.*, u.email as claimer_email, t.channel_name, t.action_type
      FROM task_claims tc
      LEFT JOIN "user" u ON u.id = tc.claimer_id
      LEFT JOIN tasks t ON t.id = tc.task_id
      ${whereClause}
      ORDER BY tc.claimed_at DESC
      LIMIT ? OFFSET ?
    `).bind(...params).all(),
    c.env.DB.prepare(`SELECT COUNT(*) as cnt FROM task_claims tc ${whereClause}`)
      .bind(...(status ? [status] : [])).first<{ cnt: number }>(),
  ])

  return c.json({ claims: rows.results, total: total?.cnt ?? 0, page, limit })
})

// GET /api/admin/pricing — get current pricing config
adminRoutes.get('/pricing', async (c) => {
  const guard = requireAdmin(c)
  if (guard) return guard
  const raw = await c.env.RATE_KV.get('pricing_config')
  const defaults = {
    xu_per_subscribe: 10,
    xu_per_like: 5,
    xu_per_comment: 15,
    cooldown_seconds: 0,
    task_cooldown_seconds: 30,
  }
  const config = raw ? { ...defaults, ...JSON.parse(raw) } : defaults
  return c.json(config)
})

// PUT /api/admin/pricing — update pricing config
adminRoutes.put('/pricing', async (c) => {
  const guard = requireAdmin(c)
  if (guard) return guard
  const body = await c.req.json<Record<string, unknown>>()
  const defaults = {
    xu_per_subscribe: 10,
    xu_per_like: 5,
    xu_per_comment: 15,
    cooldown_seconds: 0,
    task_cooldown_seconds: 30,
  }
  const merged = { ...defaults, ...body }
  if (typeof merged.cooldown_seconds !== 'number' || merged.cooldown_seconds < 0) {
    return c.json({ error: 'INVALID_COOLDOWN', message: 'cooldown_seconds must be >= 0' }, 400)
  }
  await c.env.RATE_KV.put('pricing_config', JSON.stringify(merged))
  return c.json({ ok: true })
})

// PUT /api/admin/claims/:id/status — force verify or reject a claim
adminRoutes.put('/claims/:id/status', async (c) => {
  const guard = requireAdmin(c)
  if (guard) return guard

  const id = c.req.param('id')
  const { status } = await c.req.json<{ status: string }>()
  const valid = ['VERIFIED', 'REJECTED', 'EXPIRED']
  if (!valid.includes(status)) {
    return c.json({ error: 'INVALID_STATUS', message: 'Invalid claim status' }, 400)
  }
  const now = Math.floor(Date.now() / 1000)
  await c.env.DB.prepare(
    `UPDATE task_claims SET status = ?, verified_at = ? WHERE id = ?`
  ).bind(status, now, id).run()
  return c.json({ ok: true })
})

// ─── User Groups ──────────────────────────────────────────────────────────────

// GET /api/admin/groups — list all groups
adminRoutes.get('/groups', async (c) => {
  const guard = requireAdmin(c)
  if (guard) return guard
  const groups = await c.env.DB.prepare(`
    SELECT g.*, COUNT(u.id) as user_count
    FROM user_groups g
    LEFT JOIN "user" u ON u.group_id = g.id
    GROUP BY g.id
    ORDER BY g.created_at ASC
  `).all()
  return c.json({ groups: groups.results })
})

// POST /api/admin/groups — create new group
adminRoutes.post('/groups', async (c) => {
  const guard = requireAdmin(c)
  if (guard) return guard
  const { name, max_channels } = await c.req.json<{ name: string; max_channels: number }>()
  if (!name || !max_channels || max_channels < 1) {
    return c.json({ error: 'INVALID_GROUP', message: 'name and max_channels (>=1) required' }, 400)
  }
  const id = crypto.randomUUID()
  await c.env.DB.prepare(
    `INSERT INTO user_groups (id, name, max_channels) VALUES (?, ?, ?)`
  ).bind(id, name, max_channels).run()
  return c.json({ ok: true, id })
})

// PUT /api/admin/groups/:id — update group
adminRoutes.put('/groups/:id', async (c) => {
  const guard = requireAdmin(c)
  if (guard) return guard
  const id = c.req.param('id')
  const { name, max_channels } = await c.req.json<{ name?: string; max_channels?: number }>()
  if (max_channels !== undefined && max_channels < 1) {
    return c.json({ error: 'INVALID_MAX', message: 'max_channels must be >= 1' }, 400)
  }
  await c.env.DB.prepare(
    `UPDATE user_groups SET name = COALESCE(?, name), max_channels = COALESCE(?, max_channels) WHERE id = ?`
  ).bind(name ?? null, max_channels ?? null, id).run()
  return c.json({ ok: true })
})

// DELETE /api/admin/groups/:id — delete group (cannot delete 'default')
adminRoutes.delete('/groups/:id', async (c) => {
  const guard = requireAdmin(c)
  if (guard) return guard
  const id = c.req.param('id')
  if (id === 'default') {
    return c.json({ error: 'CANNOT_DELETE_DEFAULT', message: 'Cannot delete the default group' }, 400)
  }
  // Move users back to default group before deleting
  await c.env.DB.prepare(`UPDATE "user" SET group_id = 'default' WHERE group_id = ?`).bind(id).run()
  await c.env.DB.prepare(`DELETE FROM user_groups WHERE id = ?`).bind(id).run()
  return c.json({ ok: true })
})

// PUT /api/admin/users/:id/group — assign user to group
adminRoutes.put('/users/:id/group', async (c) => {
  const guard = requireAdmin(c)
  if (guard) return guard
  const id = c.req.param('id')
  const { group_id } = await c.req.json<{ group_id: string }>()
  const group = await c.env.DB.prepare(`SELECT id FROM user_groups WHERE id = ?`).bind(group_id).first()
  if (!group) return c.json({ error: 'GROUP_NOT_FOUND', message: 'Group not found' }, 404)
  await c.env.DB.prepare(`UPDATE "user" SET group_id = ? WHERE id = ?`).bind(group_id, id).run()
  return c.json({ ok: true })
})
