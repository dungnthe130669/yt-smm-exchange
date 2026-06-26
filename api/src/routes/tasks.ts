import { Hono } from 'hono'
import type { Env } from '../bindings'
import type { HonoVariables } from '../types'
import { requireAuth } from '../middleware/auth'

// ─── Constants ───────────────────────────────────────────────────────────────

const MAX_TASKS_PER_ACCOUNT_DAY = 8   // earner: max claims per day
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
  const params: (string | number)[] = [userId, userId, userId]
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

// GET /api/tasks/pricing — public pricing config
taskRoutes.get('/pricing', async (c) => {
  const raw = await c.env.RATE_KV.get('pricing_config')
  const defaults = {
    coin_per_subscribe: 10,
    coin_per_like: 5,
    coin_per_comment: 15,
  }
  const config = raw ? { ...defaults, ...JSON.parse(raw) } : defaults
  return c.json(config)
})

// GET /api/tasks/my-channels — list buyer's linked YouTube channels
taskRoutes.get('/my-channels', async (c) => {
  const guard = requireAuth(c)
  if (guard) return guard
  const userId = c.get('userId')!
  const rows = await c.env.DB.prepare(
    `SELECT channel_id, channel_name, channel_avatar, channel_url FROM user_linked_channels WHERE user_id = ? ORDER BY linked_at ASC`
  ).bind(userId).all<{ channel_id: string; channel_name: string | null; channel_avatar: string | null; channel_url: string }>()
  return c.json({ channels: rows.results.map(r => ({ ...r, channel_name: r.channel_name ?? 'My Channel' })) })
})

// GET /api/tasks/random — returns 1 random OPEN task user hasn't claimed/completed
taskRoutes.get('/random', async (c) => {
  const guard = requireAuth(c)
  if (guard) return guard

  const userId = c.get('userId')!
  const actionType = c.req.query('action_type')
  const actionClause = actionType ? `AND t.action_type = ?` : ''
  const params: (string | number)[] = [userId, userId, userId]
  if (actionType) params.push(actionType)

  const task = await c.env.DB.prepare(`
    SELECT t.*
    FROM tasks t
    WHERE t.status = 'OPEN'
      AND t.buyer_id != ?
      AND (
        t.action_type != 'SUBSCRIBE'
        OR t.channel_id NOT IN (
          SELECT channel_id FROM user_completed_channels WHERE user_id = ?
        )
      )
      AND t.id NOT IN (
        SELECT task_id FROM task_claims
        WHERE claimer_id = ? AND status NOT IN ('REJECTED','EXPIRED')
      )
      ${actionClause}
    ORDER BY RANDOM()
    LIMIT 1
  `).bind(...params).first()

  if (!task) return c.json({ task: null })
  return c.json({ task })
})

// GET /api/tasks/:id — task detail
taskRoutes.get('/:id', async (c) => {
  const task = await c.env.DB.prepare(`SELECT * FROM tasks WHERE id = ?`)
    .bind(c.req.param('id'))
    .first()
  if (!task) return c.json({ error: 'TASK_NOT_FOUND', message: 'Task not found' }, 404)
  return c.json({ task })
})

// POST /api/tasks — buyer creates a task
taskRoutes.post('/', async (c) => {
  const guard = requireAuth(c)
  if (guard) return guard

  const userId = c.get('userId')!
  const body = await c.req.json<{
    channel_url?: string
    channel_id?: string
    channel_name?: string
    channel_avatar?: string
    target_count: number
    deadline_days: number
    action_type?: 'SUBSCRIBE' | 'LIKE' | 'COMMENT'
    video_id?: string
    video_title?: string
    video_thumbnail?: string
    comment_template?: string
  }>()

  const actionType = body.action_type ?? 'SUBSCRIBE'

  // Validate action type
  if (!['SUBSCRIBE', 'LIKE', 'COMMENT'].includes(actionType)) {
    return c.json({ error: 'INVALID_ACTION', message: 'Invalid action type' }, 400)
  }
  if (actionType !== 'SUBSCRIBE' && !body.video_id) {
    return c.json({ error: 'MISSING_VIDEO', message: 'video_id required for LIKE/COMMENT tasks' }, 400)
  }
  if (actionType === 'COMMENT' && !body.comment_template) {
    return c.json({ error: 'MISSING_TEMPLATE', message: 'comment_template required for COMMENT tasks' }, 400)
  }
  if (actionType === 'SUBSCRIBE' && (!body.channel_url || !body.channel_id)) {
    return c.json({ error: 'INVALID_CHANNEL', message: 'channel_url and channel_id required for SUBSCRIBE tasks' }, 400)
  }

  // For LIKE/COMMENT, derive channel_id and channel_url from video
  const channelId = actionType === 'SUBSCRIBE' ? body.channel_id! : (body.video_id!)
  const channelUrl = actionType === 'SUBSCRIBE' ? body.channel_url! : `https://youtube.com/watch?v=${body.video_id}`

  // Validate SUBSCRIBE channel exists on YouTube API
  if (actionType === 'SUBSCRIBE' && c.env.YOUTUBE_API_KEY) {
    const chkUrl = new URL('https://www.googleapis.com/youtube/v3/channels')
    chkUrl.searchParams.set('part', 'id')
    chkUrl.searchParams.set('id', channelId)
    chkUrl.searchParams.set('key', c.env.YOUTUBE_API_KEY)
    const chkRes = await fetch(chkUrl.toString())
    const chkData = await chkRes.json<{ items?: Array<{ id: string }> }>()
    if (!chkData.items?.length) {
      return c.json({ error: 'CHANNEL_NOT_FOUND', message: 'YouTube channel not found. Make sure you selected a valid channel.' }, 400)
    }
  }

  if (!Number.isFinite(body.target_count) || body.target_count < 1 || body.target_count > 50) {
    return c.json({ error: 'INVALID_COUNT', message: 'Invalid target count (must be 1–50)' }, 400)
  }
  if (![3, 7, 14].includes(body.deadline_days)) {
    return c.json({ error: 'INVALID_DEADLINE', message: 'Duration must be 3, 7, or 14 days' }, 400)
  }

  // Read admin-set pricing from KV
  const pricingRaw = await c.env.RATE_KV.get('pricing_config')
  const pricing = pricingRaw ? JSON.parse(pricingRaw) : {}
  const coinPerUnit =
    actionType === 'SUBSCRIBE' ? (pricing.coin_per_subscribe ?? 10) :
    actionType === 'LIKE'      ? (pricing.coin_per_like      ?? 5)  :
                                  (pricing.coin_per_comment   ?? 15)

  // Always coin escrow (CROSS_SUB logic)
  const escrowCoinAmount = coinPerUnit * Math.floor(body.target_count)

  // Atomic debit: UPDATE only succeeds if balance is sufficient
  const debitResult = await c.env.DB.prepare(`
    UPDATE wallets SET coin_balance = coin_balance - ?
    WHERE user_id = ? AND coin_balance >= ?
  `).bind(escrowCoinAmount, userId, escrowCoinAmount).run()

  if (debitResult.meta.changes === 0) {
    // Either wallet doesn't exist or insufficient balance
    const wallet = await c.env.DB.prepare(`SELECT coin_balance FROM wallets WHERE user_id = ?`)
      .bind(userId).first<{ coin_balance: number }>()
    const bal = wallet?.coin_balance ?? 0
    return c.json({ error: 'INSUFFICIENT_COINS', message: `Insufficient coin balance. You have ${bal} coins, need ${escrowCoinAmount}.` }, 400)
  }

  const taskId = crypto.randomUUID()
  const deadline = Math.floor(Date.now() / 1000) + body.deadline_days * 86400

  await c.env.DB.batch([
    c.env.DB.prepare(`
      INSERT INTO tasks (id, buyer_id, channel_id, channel_url, channel_name, channel_avatar,
        target_count, task_type, price_per_unit_usd_micro, coin_per_unit,
        escrow_usd_micro, escrow_coin, max_providers, priority, deadline,
        action_type, video_id, video_title, video_thumbnail, comment_template)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).bind(taskId, userId, channelId, channelUrl, body.channel_name ?? null,
        body.channel_avatar ?? null,
        Math.floor(body.target_count), 'CROSS_SUB', 0, coinPerUnit,
        0, escrowCoinAmount, 50, 1, deadline,
        actionType, body.video_id ?? null, body.video_title ?? null,
        body.video_thumbnail ?? null, body.comment_template ?? null),

    c.env.DB.prepare(`
      INSERT INTO wallet_txns (id, user_id, type, amount, currency, ref_id, note)
      VALUES (?,?,?,?,?,?,?)
    `).bind(crypto.randomUUID(), userId, 'ESCROW_LOCK', escrowCoinAmount, 'COIN', taskId, 'Coin escrow for task creation'),
  ])

  return c.json({ task_id: taskId }, 201)
})
