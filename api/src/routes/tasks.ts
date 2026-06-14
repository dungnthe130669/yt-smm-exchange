import { Hono } from 'hono'
import type { Env } from '../bindings'
import type { HonoVariables } from '../types'
import { requireAuth } from '../middleware/auth'

// ─── Constants ───────────────────────────────────────────────────────────────

const MAX_TASKS_PER_ACCOUNT_DAY = 8   // earner: max claims per day
const MAX_TASKS_PER_IP_DAY = 3        // IP-level daily cap
const MAX_CONCURRENT_CLAIMS = 3       // max active (uncompleted) claims per user
const DELAY_MIN_SEC = 20 * 60         // 20 min minimum delay before submit
const DELAY_MAX_SEC = 45 * 60         // 45 min maximum delay

export const taskRoutes = new Hono<{ Bindings: Env; Variables: HonoVariables }>()

// GET /api/tasks/feed — earner feed (tasks available to claim)
taskRoutes.get('/feed', async (c) => {
  const guard = requireAuth(c)
  if (guard) return guard

  const userId = c.get('userId')!
  const type = c.req.query('type') // 'PAY' | 'CROSS_SUB' | undefined (all)
  const cursor = c.req.query('cursor') // created_at for pagination

  const typeClause = type ? `AND t.task_type = ?` : ''
  const cursorClause = cursor ? `AND t.created_at < ?` : ''
  const params: (string | number)[] = [userId, userId]
  if (type) params.push(type)
  if (cursor) params.push(parseInt(cursor))
  params.push(20) // limit

  const tasks = await c.env.DB.prepare(`
    SELECT t.*
    FROM tasks t
    WHERE t.status = 'OPEN'
      AND t.buyer_id != ?
      AND t.channel_id NOT IN (
        SELECT channel_id FROM user_completed_channels WHERE user_id = ?
      )
      AND t.id NOT IN (
        SELECT task_id FROM task_claims
        WHERE claimer_id = ? AND status NOT IN ('REJECTED','EXPIRED')
      )
      ${typeClause}
      ${cursorClause}
    ORDER BY t.priority ASC, t.created_at ASC
    LIMIT ?
  `)
    .bind(...params)
    .all()

  return c.json({ tasks: tasks.results, cursor: tasks.results.at(-1)?.created_at ?? null })
})

// GET /api/tasks/:id — task detail
taskRoutes.get('/:id', async (c) => {
  const task = await c.env.DB.prepare(`SELECT * FROM tasks WHERE id = ?`)
    .bind(c.req.param('id'))
    .first()
  if (!task) return c.json({ error: 'TASK_NOT_FOUND', message: 'Task không tồn tại' }, 404)
  return c.json({ task })
})

// POST /api/tasks — buyer creates a task
taskRoutes.post('/', async (c) => {
  const guard = requireAuth(c)
  if (guard) return guard

  const userId = c.get('userId')!
  const body = await c.req.json<{
    channel_url: string
    channel_id: string
    channel_name?: string
    target_count: number
    task_type: 'PAY' | 'CROSS_SUB'
    price_per_unit_vnd?: number
    xu_per_unit?: number
    deadline_days: number
  }>()

  // Validate
  if (!body.channel_url || !body.channel_id) {
    return c.json({ error: 'INVALID_CHANNEL', message: 'Channel URL không hợp lệ' }, 400)
  }
  if (body.target_count < 1 || body.target_count > (body.task_type === 'CROSS_SUB' ? 50 : 1000)) {
    return c.json({ error: 'INVALID_COUNT', message: 'Số lượng không hợp lệ' }, 400)
  }
  if (body.deadline_days < 1 || body.deadline_days > 30) {
    return c.json({ error: 'INVALID_DEADLINE', message: 'Deadline phải từ 1–30 ngày' }, 400)
  }

  const wallet = await c.env.DB.prepare(`SELECT * FROM wallets WHERE user_id = ?`)
    .bind(userId)
    .first<{ balance_vnd: number; xu_balance: number }>()

  if (!wallet) return c.json({ error: 'WALLET_NOT_FOUND', message: 'Wallet không tồn tại' }, 404)

  // Escrow check
  const escrowVnd = body.task_type === 'PAY' ? (body.price_per_unit_vnd ?? 0) * body.target_count : 0
  const escrowXu = body.task_type === 'CROSS_SUB' ? (body.xu_per_unit ?? 0) * body.target_count : 0

  if (body.task_type === 'PAY' && wallet.balance_vnd < escrowVnd) {
    return c.json({ error: 'INSUFFICIENT_VND', message: 'Số dư VND không đủ' }, 400)
  }
  if (body.task_type === 'CROSS_SUB' && wallet.xu_balance < escrowXu) {
    return c.json({ error: 'INSUFFICIENT_XU', message: 'Số xu không đủ' }, 400)
  }

  const taskId = crypto.randomUUID()
  const deadline = Math.floor(Date.now() / 1000) + body.deadline_days * 86400
  const priority = body.task_type === 'PAY' ? 1 : 2
  const xuPerUnit = body.task_type === 'CROSS_SUB' ? (body.xu_per_unit ?? 0) : Math.floor((body.price_per_unit_vnd ?? 0) / 100) // rough xu reward for PAY tasks

  await c.env.DB.batch([
    c.env.DB.prepare(`
      INSERT INTO tasks (id, buyer_id, channel_id, channel_url, channel_name,
        target_count, task_type, price_per_unit_vnd, xu_per_unit,
        escrow_vnd, escrow_xu, priority, deadline)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).bind(taskId, userId, body.channel_id, body.channel_url, body.channel_name ?? null,
        body.target_count, body.task_type, body.price_per_unit_vnd ?? 0, xuPerUnit,
        escrowVnd, escrowXu, priority, deadline),

    // Lock escrow
    body.task_type === 'PAY'
      ? c.env.DB.prepare(`UPDATE wallets SET balance_vnd = balance_vnd - ? WHERE user_id = ?`).bind(escrowVnd, userId)
      : c.env.DB.prepare(`UPDATE wallets SET xu_balance = xu_balance - ? WHERE user_id = ?`).bind(escrowXu, userId),

    // Audit log
    c.env.DB.prepare(`
      INSERT INTO wallet_txns (id, user_id, type, amount, currency, ref_id, note)
      VALUES (?,?,?,?,?,?,?)
    `).bind(crypto.randomUUID(), userId, 'ESCROW_LOCK',
        body.task_type === 'PAY' ? escrowVnd : escrowXu,
        body.task_type === 'PAY' ? 'VND' : 'XU',
        taskId, 'Escrow lock khi tạo task'),
  ])

  return c.json({ task_id: taskId }, 201)
})
